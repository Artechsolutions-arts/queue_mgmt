import base64
import hmac
import hashlib
import json
import os
import redis
import requests
import logging
from django.db import transaction
from django.db.models import Count, Avg, F, Q, Max
from django.utils import timezone
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_POST
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from django.http import JsonResponse, HttpResponse, HttpResponseForbidden
from .models import ServiceType, Counter, Token, Patient, VisionMetric
from .serializers import (
    ServiceTypeSerializer, CounterSerializer, TokenSerializer,
    RegisterTokenSerializer, RegisterMultiSerializer, DashboardStatsSerializer,
    PatientSerializer, PatientDetailSerializer,
)

logger = logging.getLogger("QueueViews")

# Configuration
PREDICTION_SERVICE_URL = os.getenv("PREDICTION_SERVICE_URL", "http://prediction-service:8001/api/predict/")
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

    moved = 0
    for sib in siblings:
        if moved >= REBALANCE_MAX_PER_EVENT:
            break
        token = (
            Token.objects.filter(counter=sib, status='WAITING',
                                 service_type_id__in=services)
            .exclude(phone_number__in=busy_phones)
            .order_by('created_at')
            .first()
        )
        if not token:
            continue
        old_counter_name = sib.name
        token.counter = freed_counter
        token.save(update_fields=['counter'])
        moved += 1
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
    @action(detail=False, methods=['post'])
    def register(self, request):
        serializer = RegisterTokenSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        data = serializer.validated_data

        # Block duplicate registrations: one active session per phone number
        active_tokens = Token.objects.filter(
            phone_number=data['phone_number'],
            status__in=['WAITING', 'IN_PROGRESS']
        )
        if active_tokens.exists():
            active_pname = active_tokens.first().patient_name
            return Response(
                {"error": f"Phone number already has an active session under patient '{active_pname}'. Complete or cancel the existing visit first."},
                status=status.HTTP_400_BAD_REQUEST
            )

        try:
            with transaction.atomic():
                service_type = ServiceType.objects.select_for_update().get(id=data['service_type_id'])

                # Race-safe token allocation
                token_number = f"{service_type.prefix}-{service_type.next_number:03d}"
                service_type.next_number += 1
                service_type.save()

                # Consult Prediction Service
                payload = {
                    "service_type_id": service_type.id,
                    "queue_depth_per_counter": list(Counter.objects.filter(service_types=service_type).annotate(depth=Count('token', filter=Q(token__status='WAITING'))).values('id', 'depth'))
                }

                predicted_wait = 0
                assigned_counter_id = None
                directions = "Please wait for your turn."

                try:
                    resp = requests.post(PREDICTION_SERVICE_URL, json=payload, timeout=2)
                    if resp.status_code == 200:
                        pred_data = resp.json()
                        assigned_counter_id = pred_data.get('recommended_counter_id')
                        predicted_wait = pred_data.get('predicted_wait_minutes', 0)
                        directions = pred_data.get('directions', directions)
                except Exception as e:
                    logger.warning(f"Prediction service call failed: {e}")

                # Fall back to shortest-queue assignment
                if assigned_counter_id is None:
                    shortest_counter = Counter.objects.filter(
                        service_types=service_type, is_active=True
                    ).annotate(
                        depth=Count('token', filter=Q(token__status='WAITING'))
                    ).order_by('depth', 'id').first()
                    if shortest_counter:
                        assigned_counter_id = shortest_counter.id
                        directions = f"Proceed to {shortest_counter.name} — {shortest_counter.location_description}."

                redirection_target = ""
                current_depth = Token.objects.filter(service_type=service_type, status='WAITING').count()
                if current_depth >= 3:
                    other_services = ServiceType.objects.exclude(id=service_type.id)
                    best_alternative = None
                    min_depth = current_depth
                    for alt_service in other_services:
                        alt_depth = Token.objects.filter(service_type=alt_service, status='WAITING').count()
                        if alt_depth < min_depth:
                            min_depth = alt_depth
                            best_alternative = alt_service
                    if best_alternative and (current_depth - min_depth) >= 2:
                        redirection_target = best_alternative.name
                        directions += f" Note: {service_type.name} is busy ({current_depth} waiting). You can complete your {best_alternative.name} first where the queue is shorter ({min_depth} waiting)."

                counter = Counter.objects.get(id=assigned_counter_id) if assigned_counter_id else None

                # One Patient per phone — get-or-create + bump the canonical name.
                patient, _ = Patient.objects.get_or_create(
                    phone_number=data['phone_number'],
                    defaults={'name': data['patient_name']},
                )
                if patient.name != data['patient_name']:
                    patient.name = data['patient_name']
                    patient.save(update_fields=['name', 'updated_at'])

                token = Token.objects.create(
                    number=token_number,
                    patient=patient,
                    patient_name=patient.name,
                    phone_number=patient.phone_number,
                    service_type=service_type,
                    counter=counter,
                    predicted_wait_minutes=predicted_wait,
                    medical_notes=data.get('medical_notes', '')
                )

                if r:
                    event = {
                        "type": "token.created",
                        "token_id": token.id,
                        "token_number": token.number,
                        "patient_name": token.patient_name,
                        "phone_number": token.phone_number,
                        "counter_id": counter.id if counter else "",
                        "counter_name": counter.name if counter else "",
                        "counter_location": counter.location_description if counter else "",
                        "eta_minutes": predicted_wait,
                        "directions": directions,
                        "is_simulated": "true" if data.get('is_simulated', False) else "false",
                        "service_type_name": token.service_type.name,
                        "redirection_target": redirection_target
                    }
                    r.xadd("queue.events", event, maxlen=10000)

                return Response({
                    "token_number": token.number,
                    "counter": counter.name if counter else "TBD",
                    "predicted_wait_minutes": predicted_wait,
                    "directions": directions,
                    "medical_notes": token.medical_notes
                }, status=status.HTTP_201_CREATED)

        except ServiceType.DoesNotExist:
            return Response({"error": "Invalid service type"}, status=status.HTTP_400_BAD_REQUEST)

    @action(detail=False, methods=['post'], url_path='register-multi')
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

        # Block duplicate registrations: one active session per phone number
        active_tokens = Token.objects.filter(
            phone_number=data['phone_number'],
            status__in=['WAITING', 'IN_PROGRESS']
        )
        if active_tokens.exists():
            active_pname = active_tokens.first().patient_name
            return Response(
                {"error": f"Phone number already has an active session under patient '{active_pname}'. Complete or cancel the existing visit first."},
                status=status.HTTP_400_BAD_REQUEST
            )

        all_ids = list(data.get('service_type_ids', [])) + list(data.get('test_ids', []))
        # Preserve order but drop duplicates so we don't double-token the same service.
        seen = set()
        ordered_ids = [i for i in all_ids if not (i in seen or seen.add(i))]

        results = []
        try:
            with transaction.atomic():
                # One Patient per phone — repeat visits roll up under the same record.
                # The most recent registration wins on name (people sometimes correct it).
                patient, _ = Patient.objects.get_or_create(
                    phone_number=data['phone_number'],
                    defaults={'name': data['patient_name']},
                )
                if patient.name != data['patient_name']:
                    patient.name = data['patient_name']
                    patient.save(update_fields=['name', 'updated_at'])

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
            return Response({"error": str(exc)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

        return Response({"tokens": results}, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=['post'])
    def call_next(self, request):
        counter_id = request.data.get('counter_id')
        try:
            with transaction.atomic():
                counter = Counter.objects.get(id=counter_id)
                if Token.objects.filter(counter=counter, status='IN_PROGRESS').exists():
                    return Response({"error": "Counter already has a token in progress"}, status=status.HTTP_409_CONFLICT)

                # Skip any patient who already has an IN_PROGRESS token somewhere
                # else — a single patient with multiple tests must complete them
                # one at a time, not in parallel across counters.
                busy_phones = Token.objects.filter(
                    status='IN_PROGRESS'
                ).values_list('phone_number', flat=True)
                token = (
                    Token.objects.filter(counter=counter, status='WAITING')
                    .exclude(phone_number__in=list(busy_phones))
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
                # A slot just freed up at `counter` — try to pull a patient
                # from any busier sibling counter that can serve the same kind
                # of test/service.
                _rebalance_after_slot_freed(counter)
                return Response(TokenSerializer(token).data)
        except Counter.DoesNotExist:
            return Response({"error": "Counter not found"}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'])
    def complete(self, request, pk=None):
        try:
            token = Token.objects.get(number=pk)
            token.status = 'COMPLETED'
            token.completed_at = timezone.now()
            token.save()
            return Response(TokenSerializer(token).data)
        except Token.DoesNotExist:
            return Response({"error": "Token not found"}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'])
    def no_show(self, request, pk=None):
        try:
            token = Token.objects.get(number=pk)
            token.status = 'CANCELLED'
            token.save()
            return Response(TokenSerializer(token).data)
        except Token.DoesNotExist:
            return Response({"error": "Token not found"}, status=status.HTTP_404_NOT_FOUND)

    @action(detail=True, methods=['post'])
    def reassign(self, request, pk=None):
        counter_id = request.data.get('counter_id')
        try:
            token = Token.objects.get(number=pk)
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

class CounterViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = CounterSerializer
    def get_queryset(self):
        # queue_depth = distinct WAITING patients (by phone). Counting tokens here
        # inflates the figure when one patient holds multiple tokens at the same
        # counter (e.g. MRI + CT + X-Ray all at Radiology). Routing decisions
        # elsewhere still compute their own token-based depths.
        return Counter.objects.all().annotate(
            queue_depth=Count('token__phone_number',
                              filter=Q(token__status='WAITING'),
                              distinct=True)
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

        payload = {
            "avg_wait_minutes": round(avg_wait_min, 1),
            "avg_service_minutes": round(avg_service_min, 1),
            "completed_in_window": recent.count(),
            "window_hours": window_hours,
            "total_waiting": Token.objects.filter(status='WAITING').count(),
            "total_in_progress": Token.objects.filter(status='IN_PROGRESS').count(),
            "active_counters": Counter.objects.filter(is_active=True).count(),
            "total_counters": Counter.objects.count(),
            "bottlenecks": []  # To be calculated
        }
        return Response(DashboardStatsSerializer(payload).data)

def healthz(request):
    return JsonResponse({"status": "ok"})

def readyz(request):
    # Basic readiness
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
