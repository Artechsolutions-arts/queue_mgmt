from datetime import timedelta

import pytest
from django.contrib.auth import get_user_model
from django.utils import timezone
from rest_framework.test import APIClient

from core.models import Counter, ServiceType, Token


@pytest.fixture
def setup_counters(db):
    svc = ServiceType.objects.create(name="General", prefix="GEN", avg_service_time=10)
    c1 = Counter.objects.create(number=1, current_service_type=svc)
    c2 = Counter.objects.create(number=2, current_service_type=svc)
    return svc, c1, c2


@pytest.fixture
def staff_user(db):
    User = get_user_model()
    return User.objects.create_user(
        username='unittest-staff',
        password='x',
        is_staff=True,
    )


@pytest.fixture
def client(staff_user):
    """APIClient authenticated as a staff user — mutating endpoints require it."""
    c = APIClient()
    c.force_authenticate(user=staff_user)
    return c


@pytest.mark.django_db
class TestCallNext:
    def test_calls_oldest_waiting_token(self, client, setup_counters):
        svc, c1, _ = setup_counters
        older = Token.objects.create(
            number='GEN-001', patient_name='A', phone_number='1',
            service_type=svc, counter=c1, status='WAITING',
        )
        # Force created_at ordering so the assertion is stable.
        Token.objects.filter(pk=older.pk).update(created_at=timezone.now() - timedelta(minutes=5))
        Token.objects.create(
            number='GEN-002', patient_name='B', phone_number='2',
            service_type=svc, counter=c1, status='WAITING',
        )

        resp = client.post('/api/queue/call_next/', {'counter_id': c1.id})
        assert resp.status_code == 200, resp.data
        assert resp.data['number'] == 'GEN-001'
        assert resp.data['status'] == 'IN_PROGRESS'
        assert resp.data['service_start_at'] is not None

    def test_rejects_when_token_already_in_progress(self, client, setup_counters):
        svc, c1, _ = setup_counters
        Token.objects.create(
            number='GEN-001', patient_name='A', phone_number='1',
            service_type=svc, counter=c1, status='IN_PROGRESS',
            service_start_at=timezone.now(),
        )
        Token.objects.create(
            number='GEN-002', patient_name='B', phone_number='2',
            service_type=svc, counter=c1, status='WAITING',
        )
        resp = client.post('/api/queue/call_next/', {'counter_id': c1.id})
        assert resp.status_code == 409

    def test_returns_404_when_no_waiting(self, client, setup_counters):
        _, c1, _ = setup_counters
        resp = client.post('/api/queue/call_next/', {'counter_id': c1.id})
        assert resp.status_code == 404

    def test_rejects_inactive_counter(self, client, setup_counters):
        _, c1, _ = setup_counters
        c1.is_active = False
        c1.save()
        resp = client.post('/api/queue/call_next/', {'counter_id': c1.id})
        assert resp.status_code == 400

    def test_requires_counter_id(self, client, setup_counters):
        resp = client.post('/api/queue/call_next/', {})
        assert resp.status_code == 400


@pytest.mark.django_db
class TestComplete:
    def test_marks_completed_and_sets_timestamps(self, client, setup_counters):
        svc, c1, _ = setup_counters
        started = timezone.now() - timedelta(minutes=4)
        Token.objects.create(
            number='GEN-001', patient_name='A', phone_number='1',
            service_type=svc, counter=c1, status='IN_PROGRESS',
            service_start_at=started,
        )
        resp = client.post('/api/queue/GEN-001/complete/')
        assert resp.status_code == 200, resp.data
        assert resp.data['status'] == 'COMPLETED'
        assert resp.data['completed_at'] is not None

    def test_rejects_waiting_token(self, client, setup_counters):
        svc, c1, _ = setup_counters
        Token.objects.create(
            number='GEN-001', patient_name='A', phone_number='1',
            service_type=svc, counter=c1, status='WAITING',
        )
        resp = client.post('/api/queue/GEN-001/complete/')
        assert resp.status_code == 409

    def test_returns_404_for_unknown_token(self, client, setup_counters):
        resp = client.post('/api/queue/GEN-999/complete/')
        assert resp.status_code == 404


@pytest.mark.django_db
class TestNoShow:
    def test_cancels_waiting_token(self, client, setup_counters):
        svc, c1, _ = setup_counters
        Token.objects.create(
            number='GEN-001', patient_name='A', phone_number='1',
            service_type=svc, counter=c1, status='WAITING',
        )
        resp = client.post('/api/queue/GEN-001/no_show/')
        assert resp.status_code == 200
        assert resp.data['status'] == 'CANCELLED'

    def test_rejects_completed_token(self, client, setup_counters):
        svc, c1, _ = setup_counters
        Token.objects.create(
            number='GEN-001', patient_name='A', phone_number='1',
            service_type=svc, counter=c1, status='COMPLETED',
            service_start_at=timezone.now(), completed_at=timezone.now(),
        )
        resp = client.post('/api/queue/GEN-001/no_show/')
        assert resp.status_code == 409


@pytest.mark.django_db
class TestReassign:
    def test_moves_token_to_new_counter(self, client, setup_counters):
        svc, c1, c2 = setup_counters
        Token.objects.create(
            number='GEN-001', patient_name='A', phone_number='1',
            service_type=svc, counter=c1, status='WAITING',
        )
        resp = client.post('/api/queue/GEN-001/reassign/', {'counter_id': c2.id})
        assert resp.status_code == 200
        assert resp.data['counter_number'] == 2

    def test_rejects_when_target_serves_different_service(self, client, setup_counters):
        svc, c1, _ = setup_counters
        other_svc = ServiceType.objects.create(name='Lab', prefix='LAB', avg_service_time=5)
        c3 = Counter.objects.create(number=3, current_service_type=other_svc)
        Token.objects.create(
            number='GEN-001', patient_name='A', phone_number='1',
            service_type=svc, counter=c1, status='WAITING',
        )
        resp = client.post('/api/queue/GEN-001/reassign/', {'counter_id': c3.id})
        assert resp.status_code == 400

    def test_rejects_non_waiting_token(self, client, setup_counters):
        svc, c1, c2 = setup_counters
        Token.objects.create(
            number='GEN-001', patient_name='A', phone_number='1',
            service_type=svc, counter=c1, status='IN_PROGRESS',
            service_start_at=timezone.now(),
        )
        resp = client.post('/api/queue/GEN-001/reassign/', {'counter_id': c2.id})
        assert resp.status_code == 409


@pytest.mark.django_db
class TestDashboardStats:
    def test_empty_state_returns_zeros(self, client, setup_counters):
        _, _, _ = setup_counters
        resp = client.get('/api/stats/dashboard/')
        assert resp.status_code == 200
        data = resp.data
        assert data['total_waiting'] == 0
        assert data['avg_wait_minutes'] == 0.0
        assert data['active_counters'] == 2
        assert data['total_counters'] == 2
        assert data['bottlenecks'] == []

    def test_aggregates_waits_and_service_time(self, client, setup_counters):
        svc, c1, _ = setup_counters
        now = timezone.now()

        # Completed token: waited 10 min, served 5 min.
        Token.objects.create(
            number='GEN-001', patient_name='A', phone_number='1',
            service_type=svc, counter=c1, status='COMPLETED',
            service_start_at=now - timedelta(minutes=5),
            completed_at=now,
        )
        Token.objects.filter(number='GEN-001').update(
            created_at=now - timedelta(minutes=15),
        )

        # One waiting, one in progress.
        Token.objects.create(
            number='GEN-002', patient_name='B', phone_number='2',
            service_type=svc, counter=c1, status='WAITING',
        )
        Token.objects.create(
            number='GEN-003', patient_name='C', phone_number='3',
            service_type=svc, counter=c1, status='IN_PROGRESS',
            service_start_at=now,
        )

        resp = client.get('/api/stats/dashboard/')
        assert resp.status_code == 200
        data = resp.data
        assert data['total_waiting'] == 1
        assert data['total_in_progress'] == 1
        assert data['completed_in_window'] == 1
        # 10 minute wait, 5 minute service — small floating-point tolerance.
        assert abs(data['avg_wait_minutes'] - 10.0) < 0.1
        assert abs(data['avg_service_minutes'] - 5.0) < 0.1

    def test_flags_bottleneck_counter(self, client, setup_counters):
        svc, c1, _ = setup_counters
        # avg_service_time=10, threshold default 20 → 3 waiting × 10 = 30 ≥ 20.
        for i in range(3):
            Token.objects.create(
                number=f'GEN-{i:03d}', patient_name='X', phone_number='1',
                service_type=svc, counter=c1, status='WAITING',
            )
        resp = client.get('/api/stats/dashboard/')
        assert resp.status_code == 200
        bottlenecks = resp.data['bottlenecks']
        assert len(bottlenecks) == 1
        assert bottlenecks[0]['counter_number'] == 1
        assert bottlenecks[0]['queue_depth'] == 3


@pytest.mark.django_db
class TestCounterListAnnotations:
    def test_counter_response_includes_queue_depth_and_current_token(self, client, setup_counters):
        svc, c1, c2 = setup_counters
        Token.objects.create(
            number='GEN-001', patient_name='A', phone_number='1',
            service_type=svc, counter=c1, status='WAITING',
        )
        Token.objects.create(
            number='GEN-002', patient_name='B', phone_number='2',
            service_type=svc, counter=c1, status='IN_PROGRESS',
            service_start_at=timezone.now(),
        )
        resp = client.get('/api/counters/')
        assert resp.status_code == 200
        by_number = {c['number']: c for c in resp.data}
        assert by_number[1]['queue_depth'] == 1
        assert by_number[1]['current_token']['number'] == 'GEN-002'
        assert by_number[2]['queue_depth'] == 0
        assert by_number[2]['current_token'] is None

    def test_counter_response_includes_next_tokens(self, client, setup_counters):
        svc, c1, _ = setup_counters
        now = timezone.now()
        for i in range(5):
            t = Token.objects.create(
                number=f'GEN-{i+1:03d}', patient_name=f'P{i}', phone_number='1',
                service_type=svc, counter=c1, status='WAITING',
            )
            # Spread created_at so ordering is deterministic.
            Token.objects.filter(pk=t.pk).update(created_at=now + timedelta(seconds=i))

        resp = client.get('/api/counters/')
        assert resp.status_code == 200
        by_number = {c['number']: c for c in resp.data}
        next_tokens = by_number[1]['next_tokens']
        assert [t['number'] for t in next_tokens] == ['GEN-001', 'GEN-002', 'GEN-003']


@pytest.mark.django_db
class TestFullLifecycleIntegration:
    def test_register_to_complete_populates_retraining_inputs(self, client, setup_counters):
        """End-to-end: register → call_next → complete writes the timestamps the
        retraining service needs to compute actual_wait_time."""
        svc, c1, _ = setup_counters

        reg = client.post('/api/queue/register/', {
            'name': 'Patient', 'phone': '+12025550199', 'service_type': svc.id,
        })
        assert reg.status_code == 201
        token_number = reg.data['number']

        called = client.post('/api/queue/call_next/', {'counter_id': c1.id})
        assert called.status_code == 200
        assert called.data['service_start_at'] is not None

        done = client.post(f'/api/queue/{token_number}/complete/')
        assert done.status_code == 200
        assert done.data['service_start_at'] is not None
        assert done.data['completed_at'] is not None
