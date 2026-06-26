import base64
import hmac
import hashlib
import json
import os
import redis
import logging
from django.db import transaction
from django.db.models import Count, Avg, F, Q, Max, Prefetch
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.throttling import ScopedRateThrottle
from .permissions import IsStaffOrReadOnly


class RegisterScopedThrottle(ScopedRateThrottle):
    """Applies the 'register' rate limit (20/min by default) to registration endpoints."""
    scope = 'register'
from rest_framework.response import Response
from django.http import JsonResponse, HttpResponse, HttpResponseForbidden
from .models import ServiceType, Counter, Token, Patient, VisionMetric, EscalationRule, EscalationAlert, PatientVisit, Doctor
from .serializers import (
    ServiceTypeSerializer, CounterSerializer, TokenSerializer,
    RegisterTokenSerializer, RegisterMultiSerializer, DashboardStatsSerializer,
    PatientSerializer, PatientDetailSerializer, EscalationAlertSerializer,
    PatientVisitSerializer, VisitTokenSerializer, DoctorSerializer,
)

logger = logging.getLogger("QueueViews")

# Configuration
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")

try:
    r = redis.from_url(REDIS_URL)
except Exception as e:
    logger.error(f"Redis connect failed: {e}")
    r = None


# Move at most this many patients per slot-free event. 1 = gradual rebalance,
# higher = aggressive but risks notification spam.
REBALANCE_MAX_PER_EVENT = 1
# Only redirect if sibling counter has at least this many more WAITING tokens
# than the freshly-freed one — avoids ping-pong on tiny depth differences.
REBALANCE_THRESHOLD = int(os.getenv("REBALANCE_DEPTH_THRESHOLD", "3"))
# How long (seconds) a token is protected from being redirected again after a move.
# Prevents the same token bouncing back and forth between counters.
REDIRECT_COOLDOWN_SECS = int(os.getenv("REDIRECT_COOLDOWN_SECS", "120"))


def _rebalance_after_slot_freed(freed_counter):
    """A WAITING slot just opened at `freed_counter`. Pick the longest-queue
    sibling counter that serves any of the same services, migrate its oldest
    eligible token here, and publish a `token.redirected` event so the
    notification worker tells the patient.

    Eligible token = WAITING status, service_type is also served by `freed_counter`,
    patient has no other IN_PROGRESS token, hasn't been migrated to this counter
    in the last 30s (cheap anti-thrash; we don't add a model field).
    """
    if r is None:
        return  # no Redis → can't publish notification, so skip silently

    freed_depth = Token.objects.filter(counter=freed_counter, status='WAITING').count()
    services = list(freed_counter.service_types.values_list('id', flat=True))
    if not services:
        return

    siblings = (
        Counter.objects
        .filter(service_types__in=services, is_active=True)
        .exclude(id=freed_counter.id)
        .distinct()
        .annotate(depth=Count('token', filter=Q(token__status='WAITING')))
        .filter(depth__gte=freed_depth + REBALANCE_THRESHOLD)
        .order_by('-depth')
    )

    busy_phones = list(
        Token.objects.filter(status='IN_PROGRESS').values_list('phone_number', flat=True)
    )

    # Collect phones of patients who already had a token redirected recently.
    # Prevents multiple tokens belonging to the same patient from all being
    # moved in the same rebalance sweep, which would spam the patient.
    recently_redirected_phones = set()
    if r:
        try:
            for key in r.scan_iter("redirect_phone:*"):
                phone = r.get(key)
                if phone:
                    recently_redirected_phones.add(phone.decode())
        except Exception:
            pass

    moved = 0
    for sib in siblings:
        if moved >= REBALANCE_MAX_PER_EVENT:
            break
        token = (
            Token.objects.filter(counter=sib, status='WAITING',
                                 service_type_id__in=services)
            .exclude(phone_number__in=busy_phones)
            .exclude(phone_number__in=recently_redirected_phones)
            .order_by('created_at')
            .first()
        )
        if not token:
            continue

        # Per-token cooldown: skip if this token was redirected in the last N seconds.
        # Prevents the same token from ping-ponging between counters.
        if r:
            try:
                if r.exists(f"redirect_token:{token.id}"):
                    continue
            except Exception:
                pass

        old_counter_name = sib.name
        token.counter = freed_counter
        token.save(update_fields=['counter'])
        moved += 1

        # Set cooldown keys so neither this token nor this patient gets moved again soon.
        if r:
            try:
                r.setex(f"redirect_token:{token.id}", REDIRECT_COOLDOWN_SECS, "1")
                r.setex(f"redirect_phone:{token.phone_number}", REDIRECT_COOLDOWN_SECS,
                        token.phone_number)
            except Exception:
                pass

        try:
            r.xadd("queue.events", {
                "type": "token.redirected",
                "token_number": token.number,
                "patient_name": token.patient_name,
                "phone_number": token.phone_number,
                "old_counter_name": old_counter_name,
                "new_counter_name": freed_counter.name,
                "new_counter_location": freed_counter.location_description or "",
                "service_type_name": token.service_type.name,
                "is_simulated": "false",
            }, maxlen=10000)
        except Exception as exc:
            logger.warning("xadd token.redirected failed: %s", exc)

class ServiceTypeViewSet(viewsets.ReadOnlyModelViewSet):
    queryset = ServiceType.objects.all().order_by('id')
    serializer_class = ServiceTypeSerializer

    def get_queryset(self):
        qs = super().get_queryset()
        kind = self.request.query_params.get('kind')
        if kind:
            qs = qs.filter(kind=kind.upper())
        return qs


class QueueViewSet(viewsets.ViewSet):
    def get_throttles(self):
        if self.action in ('register', 'register_multi'):
            return [RegisterScopedThrottle()]
        return super().get_throttles()

    @action(detail=False, methods=['post'], permission_classes=[AllowAny])
    def register(self, request):
        serializer = RegisterTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        try:
            with transaction.atomic():
                # Duplicate check inside atomic + select_for_update prevents TOCTOU race
                # where two simultaneous kiosk registrations for the same phone both pass.
                active = Token.objects.select_for_update().filter(
                    phone_number=data['phone_number'],
                    status__in=['WAITING', 'IN_PROGRESS']
                )
                if active.exists():
                    active_pname = active.first().patient_name
                    return Response(
                        {"error": f"Phone number already has an active session under patient '{active_pname}'. Complete or cancel the existing visit first."},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                service_type = ServiceType.objects.select_for_update().get(id=data['service_type_id'])

                # Race-safe token allocation
                token_number = f"{service_type.prefix}-{service_type.next_number:03d}"
                service_type.next_number += 1
                service_type.save()

                # Assign to the shortest queue counter for this service type
                shortest_counter = Counter.objects.filter(
                    service_types=service_type, is_active=True
                ).annotate(
                    depth=Count('token', filter=Q(token__status='WAITING'))
                ).order_by('depth', 'id').first()

                assigned_counter_id = shortest_counter.id if shortest_counter else None
                assigned_counter_depth = shortest_counter.depth if shortest_counter else 0
                directions = (
                    f"Proceed to {shortest_counter.name} — {shortest_counter.location_description}."
                    if shortest_counter else "Please wait — a counter will be assigned shortly."
                )

                # Estimate queue wait: position × rolling avg service time (last 1h, default 5 min)
                recent_avg = Token.objects.filter(
                    service_type=service_type,
                    status='COMPLETED',
                    service_start_at__isnull=False,
                    created_at__gte=timezone.now() - timezone.timedelta(hours=1),
                ).aggregate(avg=Avg(F('completed_at') - F('service_start_at')))['avg']
                avg_service_sec = recent_avg.total_seconds() if recent_avg else 300
                predicted_wait = max(0, round((assigned_counter_depth * avg_service_sec) / 60))

                counter = Counter.objects.get(id=assigned_counter_id) if assigned_counter_id else None

                # One Patient per phone — get-or-create + bump the canonical name.
                patient, _ = Patient.objects.get_or_create(
                    phone_number=data['phone_number'],
                    defaults={'name': data['patient_name']},
                )
                if patient.name != data['patient_name']:
                    patient.name = data['patient_name']
                    patient.save(update_fields=['name', 'updated_at'])

                visit = PatientVisit.objects.create(patient=patient)
                token = Token.objects.create(
                    number=token_number,
                    patient=patient,
                    patient_name=patient.name,
                    phone_number=patient.phone_number,
                    service_type=service_type,
                    counter=counter,
                    predicted_wait_minutes=predicted_wait,
                    medical_notes=data.get('medical_notes', ''),
                    visit=visit,
                )

                if r:
                    event = {
                        "type": "token.created",
                        "token_id": str(token.id),
                        "token_number": token.number,
                        "patient_name": token.patient_name,
                        "phone_number": token.phone_number,
                        "counter_id": str(counter.id) if counter else "",
                        "counter_name": counter.name if counter else "",
                        "counter_location": counter.location_description if counter else "",
                        "counter_queue_depth": str(assigned_counter_depth),
                        "eta_minutes": str(predicted_wait),
                        "directions": directions,
                        "is_simulated": "true" if data.get('is_simulated', False) else "false",
                        "service_type_name": token.service_type.name,
                    }
                    r.xadd("queue.events", event, maxlen=10000)

                return Response({
                    "patient_id": patient.patient_id,
                    "visit_id": visit.id,
                    "token_number": token.number,
                    "counter": counter.name if counter else "TBD",
                    "estimated_wait_minutes": predicted_wait,
                    "directions": directions,
                    "medical_notes": token.medical_notes
                }, status=status.HTTP_201_CREATED)

        except ServiceType.DoesNotExist:
            return Response({"error": "Invalid service type"}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='register-multi', permission_classes=[AllowAny])
    def register_multi(self, request):
        """Issue one token per selected service / diagnostic test in a single transaction.

        Request body: { patient_name, phone_number, service_type_ids[], test_ids[], medical_notes?, is_simulated? }
        Each id produces an independent Token + queue.events publish, so the existing
        notification worker sends one SMS+WhatsApp per token. Combined-notification UX
        is a follow-up.
        """
        serializer = RegisterMultiSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        all_ids = list(data.get('service_type_ids', [])) + list(data.get('test_ids', []))
        # Preserve order but drop duplicates so we don't double-token the same service.
        seen = set()
        ordered_ids = [i for i in all_ids if not (i in seen or seen.add(i))]

        results = []
        try:
            with transaction.atomic():
                # Duplicate check inside atomic + select_for_update — same TOCTOU guard as register.
                active = Token.objects.select_for_update().filter(
                    phone_number=data['phone_number'],
                    status__in=['WAITING', 'IN_PROGRESS']
                )
                if active.exists():
                    active_pname = active.first().patient_name
                    return Response(
                        {"error": f"Phone number already has an active session under patient '{active_pname}'. Complete or cancel the existing visit first."},
                        status=status.HTTP_400_BAD_REQUEST
                    )

                # One Patient per phone — repeat visits roll up under the same record.
                # The most recent registration wins on name (people sometimes correct it).
                patient, _ = Patient.objects.get_or_create(
                    phone_number=data['phone_number'],
                    defaults={'name': data['patient_name']},
                )
                if patient.name != data['patient_name']:
                    patient.name = data['patient_name']
                    patient.save(update_fields=['name', 'updated_at'])

                visit = PatientVisit.objects.create(patient=patient)

                # Lock all requested ServiceType rows in a single sorted query to avoid
                # deadlocks when concurrent multi-registers touch overlapping sets.
                service_types = {
                    st.id: st
                    for st in ServiceType.objects.select_for_update().filter(id__in=ordered_ids).order_by('id')
                }
                missing = [i for i in ordered_ids if i not in service_types]
                if missing:
                    return Response(
                        {"error": f"Unknown service/test ids: {missing}"},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

                for sid in ordered_ids:
                    service_type = service_types[sid]
                    token_number = f"{service_type.prefix}-{service_type.next_number:03d}"
                    service_type.next_number += 1
                    service_type.save(update_fields=['next_number'])

                    # Shortest-queue assignment; skip the prediction service call here to
                    # keep multi-register snappy — predictions are best-effort and the
                    # fallback is the same path single-register takes when prediction fails.
                    shortest_counter = Counter.objects.filter(
                        service_types=service_type, is_active=True
                    ).annotate(
                        depth=Count('token', filter=Q(token__status='WAITING'))
                    ).order_by('depth', 'id').first()

                    counter = shortest_counter
                    depth_val = shortest_counter.depth if shortest_counter else 0
                    directions = (
                        f"Proceed to {counter.name} — {counter.location_description}."
                        if counter else "Please wait for your turn."
                    )

                    token = Token.objects.create(
                        number=token_number,
                        patient=patient,
                        patient_name=patient.name,
                        phone_number=patient.phone_number,
                        service_type=service_type,
                        counter=counter,
                        predicted_wait_minutes=0,
                        medical_notes=data.get('medical_notes', ''),
                        visit=visit,
                    )

                    results.append({
                        "token_number": token.number,
                        "patient_id": patient.patient_id,
                        "service_type_id": service_type.id,
                        "service_type_name": service_type.name,
                        "kind": service_type.kind,
                        "counter": counter.name if counter else "TBD",
                        "counter_location": counter.location_description if counter else "",
                        "directions": directions,
                        "queue_depth": depth_val,
                    })

                # ONE bundle event for the whole registration — the notification worker
                # renders a single combined message instead of N spammy ones.
                # Sort by queue_depth ASC so the message recommends shortest-wait stations first.
                if r and results:
                    sorted_results = sorted(results, key=lambda t: t.get("queue_depth", 0))
                    bundle_event = {
                        "type": "token.bundle.created",
                        "patient_name": data['patient_name'],
                        "phone_number": data['phone_number'],
                        "is_simulated": "true" if data.get('is_simulated', False) else "false",
                        "tokens_json": json.dumps([
                            {
                                "number": t["token_number"],
                                "service_name": t["service_type_name"],
                                "kind": t["kind"],
                                "counter_name": t["counter"],
                                "counter_location": t["counter_location"],
                                "queue_depth": t["queue_depth"],
                            }
                            for t in sorted_results
                        ]),
                    }
                    r.xadd("queue.events", bundle_event, maxlen=10000)

        except Exception as exc:
            logger.exception("register_multi failed: %s", exc)
            return Response({"error": "Registration failed. Please try again."}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        patient_id = results[0]["patient_id"] if results else None
        return Response({"patient_id": patient_id, "visit_id": visit.id, "tokens": results}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def call_next(self, request):
        counter_id = request.data.get('counter_id')
        if not counter_id:
            return Response({"error": "counter_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        called_token = None
        called_counter = None
        try:
            with transaction.atomic():
                counter = Counter.objects.get(id=counter_id)
                if not counter.is_active:
                    return Response({"error": "Counter is not active"}, status=status.HTTP_400_BAD_REQUEST)
                if Token.objects.filter(counter=counter, status='IN_PROGRESS').exists():
                    return Response({"error": "Counter already has a token in progress"}, status=status.HTTP_409_CONFLICT)

                # Skip any patient who already has an IN_PROGRESS token somewhere
                # else — a single patient with multiple tests must complete them
                # one at a time, not in parallel across counters.
                # select_for_update() locks these rows so two simultaneous call_next
                # requests can't both read the same patient as "not busy" and then
                # both set their tokens to IN_PROGRESS.
                busy_phones = list(
                    Token.objects.select_for_update()
                    .filter(status='IN_PROGRESS')
                    .values_list('phone_number', flat=True)
                )
                token = (
                    Token.objects.select_for_update()
                    .filter(counter=counter, status='WAITING')
                    .exclude(phone_number__in=busy_phones)
                    .order_by('created_at')
                    .first()
                )
                if not token:
                    # Distinguish "queue empty" from "queue blocked by busy patients"
                    # so the staff UI can show a useful message.
                    any_waiting = Token.objects.filter(counter=counter, status='WAITING').exists()
                    if any_waiting:
                        return Response(
                            {"error": "All waiting patients here have another test in progress. Wait for them to finish."},
                            status=status.HTTP_409_CONFLICT,
                        )
                    return Response({"error": "No tokens in queue"}, status=status.HTTP_404_NOT_FOUND)

                token.status = 'IN_PROGRESS'
                token.service_start_at = timezone.now()
                token.save()
                called_token = token
                called_counter = counter

        except Counter.DoesNotExist:
            return Response({"error": "Counter not found"}, status=status.HTTP_404_NOT_FOUND)

        # DB transaction committed — publish notification and rebalance OUTSIDE atomic
        # so a Redis failure cannot roll back the already-committed token state.
        if r:
            try:
                r.xadd("queue.events", {
                    "type": "token.called",
                    "token_number": called_token.number,
                    "patient_name": called_token.patient_name,
                    "phone_number": called_token.phone_number,
                    "counter_name": called_counter.name,
                    "counter_location": called_counter.location_description or "",
                    "service_type_name": called_token.service_type.name if called_token.service_type else "",
                    "is_simulated": "false",
                }, maxlen=10000)
            except Exception as exc:
                logger.warning("xadd call_next event failed: %s", exc)

        # A slot just freed up at `counter` — try to pull a patient
        # from any busier sibling counter that can serve the same kind of test/service.
        _rebalance_after_slot_freed(called_counter)
        return Response(TokenSerializer(called_token).data)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        try:
            with transaction.atomic():
                token = Token.objects.select_for_update().get(number=pk)
                if token.status != 'IN_PROGRESS':
                    return Response(
                        {"error": f"Cannot complete a '{token.status}' token. Only IN_PROGRESS tokens can be completed."},
                        status=status.HTTP_409_CONFLICT,
                    )
                token.status = 'COMPLETED'
                token.completed_at = timezone.now()
                token.save()
        except Token.DoesNotExist:
            return Response({"error": "Token not found"}, status=status.HTTP_404_NOT_FOUND)

        # Notify OUTSIDE atomic — Redis failure must not roll back the completed state.
        # Turn-by-turn: if the patient still has open tokens it's a step update;
        # if this was their last one, it's the whole-visit wrap-up.
        if r:
            more = Token.objects.filter(
                phone_number=token.phone_number,
                status__in=['WAITING', 'IN_PROGRESS'],
            ).exists()
            try:
                r.xadd("queue.events", {
                    "type": "token.completed" if more else "visit.completed",
                    "token_number": token.number,
                    "patient_name": token.patient_name,
                    "phone_number": token.phone_number,
                    "service_type_name": token.service_type.name if token.service_type else "",
                    "is_simulated": "false",
                }, maxlen=10000)
            except Exception as exc:
                logger.warning("xadd complete event failed: %s", exc)

        return Response(TokenSerializer(token).data)

    @action(detail=True, methods=['post'])
    def no_show(self, request, pk=None):
        try:
            with transaction.atomic():
                token = Token.objects.select_for_update().get(number=pk)
                if token.status != 'WAITING':
                    return Response(
                        {"error": f"No-show only applies to WAITING tokens (token is '{token.status}')."},
                        status=status.HTTP_409_CONFLICT,
                    )
                token.status = 'NO_SHOW'
                token.save()
            return Response(TokenSerializer(token).data)
        except Token.DoesNotExist:
            return Response({"error": "Token not found"}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'])
    def reassign(self, request, pk=None):
        counter_id = request.data.get('counter_id')
        try:
            token = Token.objects.get(number=pk)
            if token.status != 'WAITING':
                return Response(
                    {"error": "Can only reassign WAITING tokens."},
                    status=status.HTTP_409_CONFLICT,
                )
            counter = Counter.objects.get(id=counter_id)
            if token.service_type not in counter.service_types.all():
                return Response({"error": "Counter does not serve this service type"}, status=status.HTTP_400_BAD_REQUEST)
            token.counter = counter
            token.save()
            return Response(TokenSerializer(token).data)
        except (Token.DoesNotExist, Counter.DoesNotExist):
            return Response({"error": "Token or Counter not found"}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=False, methods=['get'], url_path='tokens')
    def tokens(self, request):
        status_param = request.query_params.get('status')
        qs = Token.objects.select_related('service_type', 'counter').order_by('-created_at')
        if status_param:
            qs = qs.filter(status=status_param.upper())
        else:
            qs = qs.filter(status__in=['WAITING', 'IN_PROGRESS'])
        return Response(TokenSerializer(qs[:500], many=True).data)

    @action(detail=False, methods=['post'], url_path='transfer')
    def transfer(self, request):
        """Transfer a patient mid-visit to a new department without re-registration.

        Required body: { token_number, target_service_type_id }
        The patient's current visit is reused so the full journey stays linked.
        """
        token_number = request.data.get('token_number')
        target_id = request.data.get('target_service_type_id')
        if not token_number or not target_id:
            return Response({'error': 'token_number and target_service_type_id are required.'}, status=status.HTTP_400_BAD_REQUEST)

        try:
            source_token = Token.objects.select_related('patient', 'visit', 'service_type').get(number=token_number)
        except Token.DoesNotExist:
            return Response({'error': 'Token not found.'}, status=status.HTTP_404_NOT_FOUND)

        if source_token.status not in ('IN_PROGRESS', 'WAITING'):
            return Response({'error': 'Can only transfer active tokens.'}, status=status.HTTP_400_BAD_REQUEST)

        with transaction.atomic():
            try:
                target_service_locked = ServiceType.objects.select_for_update().get(id=target_id)
            except ServiceType.DoesNotExist:
                return Response({'error': 'Target service type not found.'}, status=status.HTTP_404_NOT_FOUND)

            # Duplicate check inside atomic + select_for_update to prevent TOCTOU race.
            if source_token.visit:
                duplicate = Token.objects.select_for_update().filter(
                    visit=source_token.visit,
                    service_type=target_service_locked,
                    status__in=('WAITING', 'IN_PROGRESS'),
                ).exists()
                if duplicate:
                    return Response(
                        {'error': f'Patient already has an active token for {target_service_locked.name} in this visit.'},
                        status=status.HTTP_400_BAD_REQUEST,
                    )

            token_number_new = f"{target_service_locked.prefix}-{target_service_locked.next_number:03d}"
            target_service_locked.next_number += 1
            target_service_locked.save(update_fields=['next_number'])

            counter = Counter.objects.filter(
                service_types=target_service_locked, is_active=True
            ).annotate(
                depth=Count('token', filter=Q(token__status='WAITING'))
            ).order_by('depth', 'id').first()

            # Reuse the existing visit or create one if this token predates the feature
            visit = source_token.visit or PatientVisit.objects.create(patient=source_token.patient)
            if not source_token.visit:
                source_token.visit = visit
                source_token.save(update_fields=['visit'])

            new_token = Token.objects.create(
                number=token_number_new,
                patient=source_token.patient,
                patient_name=source_token.patient_name,
                phone_number=source_token.phone_number,
                service_type=target_service_locked,
                counter=counter,
                predicted_wait_minutes=0,
                visit=visit,
            )

        directions = (
            f"Proceed to {counter.name} — {counter.location_description}."
            if counter else "Please wait for your turn to be called."
        )

        if r:
            try:
                r.xadd("queue.events", {
                    "type": "token.transferred",
                    "token_id": str(new_token.id),
                    "token_number": new_token.number,
                    "patient_name": new_token.patient_name,
                    "phone_number": new_token.phone_number,
                    "counter_name": counter.name if counter else "",
                    "counter_location": counter.location_description if counter else "",
                    "service_type_name": target_service_locked.name,
                    "from_token": token_number,
                    "directions": directions,
                    "is_simulated": "false",
                }, maxlen=10000)
            except Exception:
                pass

        return Response({
            "visit_id": visit.id,
            "new_token_number": new_token.number,
            "service_type": target_service_locked.name,
            "counter": counter.name if counter else "TBD",
            "directions": directions,
        }, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['get'], url_path='journey')
    def journey(self, request):
        """Return all tokens for a visit.
        GET /api/queue/journey/?visit_id=123
        GET /api/queue/journey/?token_number=GEN-001
        """
        visit_id = request.query_params.get('visit_id')
        token_number = request.query_params.get('token_number')

        if visit_id:
            try:
                visit = PatientVisit.objects.prefetch_related(
                    'tokens__service_type', 'tokens__counter'
                ).select_related('patient').get(pk=visit_id)
            except PatientVisit.DoesNotExist:
                return Response({'error': 'Visit not found.'}, status=status.HTTP_404_NOT_FOUND)
        elif token_number:
            try:
                token = Token.objects.select_related('visit__patient').get(number=token_number)
            except Token.DoesNotExist:
                return Response({'error': 'Token not found.'}, status=status.HTTP_404_NOT_FOUND)
            if not token.visit_id:
                return Response({'error': 'This token has no associated visit.'}, status=status.HTTP_404_NOT_FOUND)
            try:
                visit = PatientVisit.objects.prefetch_related(
                    'tokens__service_type', 'tokens__counter'
                ).select_related('patient').get(pk=token.visit_id)
            except PatientVisit.DoesNotExist:
                return Response({'error': 'Visit not found.'}, status=status.HTTP_404_NOT_FOUND)
        else:
            return Response({'error': 'visit_id or token_number query parameter required.'}, status=status.HTTP_400_BAD_REQUEST)

        return Response(PatientVisitSerializer(visit).data)


class CounterViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CounterSerializer
    def get_queryset(self):
        # queue_depth = distinct WAITING patients (by phone). Counting tokens here
        # inflates the figure when one patient holds multiple tokens at the same
        # counter (e.g. MRI + CT + X-Ray all at Radiology). Routing decisions
        # elsewhere still compute their own token-based depths.
        #
        # Prefetch IN_PROGRESS and WAITING tokens to avoid N+1 queries in
        # CounterSerializer.get_current_token / get_next_tokens.
        return Counter.objects.all().annotate(
            queue_depth=Count('token__phone_number',
                              filter=Q(token__status='WAITING'),
                              distinct=True)
        ).prefetch_related(
            Prefetch(
                'token_set',
                queryset=Token.objects.filter(status='IN_PROGRESS').only('number', 'counter_id'),
                to_attr='_prefetched_in_progress',
            ),
            Prefetch(
                'token_set',
                queryset=Token.objects.filter(status='WAITING').order_by('created_at').only('number', 'counter_id'),
                to_attr='_prefetched_waiting',
            ),
        ).order_by('id')

    @action(detail=True, methods=['post'], url_path='set_active')
    def set_active(self, request, pk=None):
        try:
            counter = Counter.objects.get(pk=pk)
        except Counter.DoesNotExist:
            return Response({"error": "Counter not found"}, status=status.HTTP_404_NOT_FOUND)
        is_active = request.data.get('is_active')
        if is_active is None:
            return Response({"error": "Missing is_active"}, status=status.HTTP_400_BAD_REQUEST)
        counter.is_active = bool(is_active)
        counter.save(update_fields=['is_active'])
        return Response(CounterSerializer(
            Counter.objects.filter(pk=pk).annotate(
                queue_depth=Count('token__phone_number',
                                  filter=Q(token__status='WAITING'),
                                  distinct=True)
            ).first()
        ).data)

class PatientViewSet(viewsets.ReadOnlyModelViewSet):
    """List + detail of patients with their visit history.

    Each Patient row aggregates: visit_count (total tokens), last_visit_at,
    open_tokens (WAITING/IN_PROGRESS). Detail view nests the full token list.
    """
    serializer_class = PatientSerializer

    def get_queryset(self):
        qs = (
            Patient.objects.all()
            .annotate(
                visit_count=Count('tokens'),
                last_visit_at=Max('tokens__created_at'),
                open_tokens=Count('tokens', filter=Q(tokens__status__in=['WAITING', 'IN_PROGRESS'])),
            )
            .order_by('-id')
        )
        q = self.request.query_params.get('q', '').strip()
        if q:
            qs = qs.filter(Q(name__icontains=q) | Q(phone_number__icontains=q))
        return qs

    def get_serializer_class(self):
        return PatientDetailSerializer if self.action == 'retrieve' else PatientSerializer


class StatsViewSet(viewsets.ViewSet):
    @action(detail=False, methods=['get'], url_path='dashboard')
    def dashboard(self, request):
        window_hours = int(os.getenv('DASHBOARD_WINDOW_HOURS', '24'))
        now = timezone.now()
        window_start = now - timezone.timedelta(hours=window_hours)
        recent = Token.objects.filter(status='COMPLETED', created_at__gte=window_start)

        # Averages over completed tokens in the rolling window. Aggregates return None
        # when the window is empty — round-tripping that to 0 keeps the frontend simple.
        avg_wait = recent.aggregate(avg=Avg(F('service_start_at') - F('created_at')))['avg']
        avg_service = recent.aggregate(avg=Avg(F('completed_at') - F('service_start_at')))['avg']

        avg_wait_min = avg_wait.total_seconds() / 60 if avg_wait else 0
        avg_service_min = avg_service.total_seconds() / 60 if avg_service else 0

        bottleneck_threshold = int(os.getenv("BOTTLENECK_DEPTH_THRESHOLD", "3"))
        bottlenecks = list(
            Counter.objects
            .filter(is_active=True)
            .annotate(queue_depth=Count('token', filter=Q(token__status='WAITING')))
            .filter(queue_depth__gte=bottleneck_threshold)
            .order_by('-queue_depth')
            .values('id', 'name', 'queue_depth')
        )

        payload = {
            "avg_wait_minutes": round(avg_wait_min, 1),
            "avg_service_minutes": round(avg_service_min, 1),
            "completed_in_window": recent.count(),
            "window_hours": window_hours,
            "total_waiting": Token.objects.filter(status='WAITING').count(),
            "total_in_progress": Token.objects.filter(status='IN_PROGRESS').count(),
            "active_counters": Counter.objects.filter(is_active=True).count(),
            "total_counters": Counter.objects.count(),
            "bottlenecks": bottlenecks,
        }
        return Response(DashboardStatsSerializer(payload).data)

class DoctorViewSet(viewsets.ModelViewSet):
    serializer_class = DoctorSerializer
    # Reads (lobby/dashboard showing doctor availability) stay public.
    # Creates, updates, deletes, and status changes require is_staff.
    permission_classes = [IsStaffOrReadOnly]

    def get_queryset(self):
        return Doctor.objects.select_related('service_type').order_by('service_type__name', 'name')

    @action(detail=True, methods=['post'], url_path='set_status')
    def set_status(self, request, pk=None):
        try:
            doctor = Doctor.objects.get(pk=pk)
        except Doctor.DoesNotExist:
            return Response({'error': 'Doctor not found.'}, status=status.HTTP_404_NOT_FOUND)

        new_status = request.data.get('status')
        if new_status not in dict(Doctor.STATUS_CHOICES):
            return Response({'error': f'Invalid status. Choose from: {list(dict(Doctor.STATUS_CHOICES).keys())}'}, status=status.HTTP_400_BAD_REQUEST)

        doctor.status = new_status
        doctor.delay_minutes = int(request.data.get('delay_minutes', 0)) if new_status == Doctor.DELAYED else 0
        doctor.notes = request.data.get('notes', doctor.notes)
        doctor.save()

        if r:
            try:
                r.xadd("queue.events", {
                    "type": "doctor.status_changed",
                    "doctor_id": str(doctor.id),
                    "doctor_name": doctor.name,
                    "service_type": doctor.service_type.name,
                    "status": doctor.status,
                    "delay_minutes": str(doctor.delay_minutes),
                    "notes": doctor.notes,
                }, maxlen=10000)
            except Exception:
                pass

        return Response(DoctorSerializer(doctor).data)


class EscalationAlertViewSet(viewsets.ViewSet):
    """Evaluate active rules, auto-create alerts on breach, return unacknowledged."""

    def list(self, request):
        now = timezone.now()
        cooldown = now - timezone.timedelta(minutes=30)

        for rule in EscalationRule.objects.filter(is_active=True).select_related('service_type'):
            if rule.threshold_type == EscalationRule.QUEUE_DEPTH:
                qs = Counter.objects.filter(is_active=True).annotate(
                    depth=Count('token', filter=Q(token__status='WAITING'))
                )
                if rule.service_type_id:
                    qs = qs.filter(service_types=rule.service_type)
                for counter in qs:
                    if counter.depth >= rule.threshold_value:
                        already = EscalationAlert.objects.filter(
                            rule=rule, counter=counter, acknowledged_at__isnull=True,
                            created_at__gte=cooldown,
                        ).exists()
                        if not already:
                            EscalationAlert.objects.create(
                                rule=rule, counter=counter, service_type=rule.service_type,
                                triggered_value=counter.depth,
                                message=f"{counter.name} has {counter.depth} patients waiting "
                                        f"(threshold: {int(rule.threshold_value)})",
                            )

            elif rule.threshold_type == EscalationRule.AVG_WAIT:
                window = now - timezone.timedelta(hours=1)
                recent = Token.objects.filter(
                    status='COMPLETED', service_start_at__isnull=False, created_at__gte=window,
                )
                if rule.service_type_id:
                    recent = recent.filter(service_type=rule.service_type)
                avg = recent.aggregate(avg=Avg(F('service_start_at') - F('created_at')))['avg']
                avg_min = avg.total_seconds() / 60 if avg else 0
                if avg_min >= rule.threshold_value:
                    already = EscalationAlert.objects.filter(
                        rule=rule, counter__isnull=True, acknowledged_at__isnull=True,
                        created_at__gte=cooldown,
                    ).exists()
                    if not already:
                        scope = f" [{rule.service_type}]" if rule.service_type_id else ""
                        EscalationAlert.objects.create(
                            rule=rule, service_type=rule.service_type,
                            triggered_value=round(avg_min, 1),
                            message=f"Avg wait{scope} is {round(avg_min, 1)} min "
                                    f"(threshold: {int(rule.threshold_value)} min)",
                        )

        alerts = EscalationAlert.objects.filter(acknowledged_at__isnull=True).select_related(
            'rule', 'counter', 'service_type'
        )
        return Response(EscalationAlertSerializer(alerts, many=True).data)

    @action(detail=True, methods=['post'])
    def acknowledge(self, request, pk=None):
        try:
            alert = EscalationAlert.objects.get(pk=pk, acknowledged_at__isnull=True)
        except EscalationAlert.DoesNotExist:
            return Response({'detail': 'Not found or already acknowledged.'}, status=status.HTTP_404_NOT_FOUND)
        alert.acknowledged_at = timezone.now()
        alert.save(update_fields=['acknowledged_at'])
        return Response(EscalationAlertSerializer(alert).data)


def healthz(request):
    """Liveness probe — is the process alive? Lightweight, no I/O."""
    return JsonResponse({"status": "ok"})


def readyz(request):
    """Readiness probe — can this instance serve traffic?
    Checks both Postgres and Redis so load balancers stop routing to broken pods."""
    errors = {}
    try:
        from django.db import connection
        connection.ensure_connection()
    except Exception as exc:
        errors["database"] = str(exc)

    if r is not None:
        try:
            r.ping()
        except Exception as exc:
            errors["redis"] = str(exc)
    else:
        errors["redis"] = "Redis client not initialised"

    if errors:
        return JsonResponse({"status": "unavailable", "errors": errors}, status=503)
    return JsonResponse({"status": "ready"})


# ----------------------------------------------------------------------------
# Twilio delivery-status webhook
# ----------------------------------------------------------------------------
# Twilio POSTs delivery updates (queued → sending → sent → delivered, or
# failed/undelivered) to this endpoint when SMS is sent with `status_callback`.
# Twilio reaches this endpoint via the public URL configured as
# TWILIO_STATUS_CALLBACK_URL — for local dev that means ngrok or similar.
twilio_logger = logging.getLogger("TwilioStatus")


def _validate_twilio_signature(request) -> bool:
    """Verify the X-Twilio-Signature header against the canonical Twilio scheme:
        HMAC-SHA1(auth_token, url + sorted(k+v for each form field))
    URL is the public callback URL Twilio sees, which may differ from the
    container's local URL (ngrok / proxy). We rebuild from the configured
    TWILIO_STATUS_CALLBACK_URL to keep the signature check stable.
    """
    auth_token = os.getenv("TWILIO_AUTH_TOKEN", "").strip()
    signature = request.headers.get("X-Twilio-Signature", "")
    if not (auth_token and signature):
        return False

    public_url = os.getenv("TWILIO_STATUS_CALLBACK_URL", "").strip()
    if not public_url:
        # No configured public URL → fall back to what Django sees. Works in tests,
        # not behind a proxy.
        public_url = request.build_absolute_uri()

    payload = public_url + "".join(
        f"{k}{request.POST[k]}" for k in sorted(request.POST.keys())
    )
    expected = base64.b64encode(
        hmac.new(auth_token.encode(), payload.encode(), hashlib.sha1).digest()
    ).decode()
    return hmac.compare_digest(expected, signature)


@csrf_exempt
@require_POST
def twilio_status_callback(request):
    if not _validate_twilio_signature(request):
        twilio_logger.warning(
            "Rejected unsigned Twilio callback from %s sid=%s",
            request.META.get("REMOTE_ADDR"),
            request.POST.get("MessageSid", "?"),
        )
        return HttpResponseForbidden("invalid signature")

    sid = request.POST.get("MessageSid", "")
    msg_status = request.POST.get("MessageStatus", "")
    to = request.POST.get("To", "")
    error_code = request.POST.get("ErrorCode", "")
    error_msg = request.POST.get("ErrorMessage", "")

    log_fn = twilio_logger.error if msg_status in ("failed", "undelivered") else twilio_logger.info
    log_fn(
        "delivery sid=%s status=%s to=%s err=%s msg=%s",
        sid, msg_status, to, error_code, error_msg,
    )
    return HttpResponse(status=204)
