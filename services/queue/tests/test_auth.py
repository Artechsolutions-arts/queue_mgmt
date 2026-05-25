import pytest
from django.contrib.auth import get_user_model
from rest_framework.test import APIClient

from core.models import Counter, ServiceType


@pytest.fixture
def fixtures(db):
    svc = ServiceType.objects.create(name='General', prefix='GEN', avg_service_time=10)
    c = Counter.objects.create(number=1, current_service_type=svc)
    return svc, c


def _staff():
    return get_user_model().objects.create_user(
        username='auth-staff', password='x', is_staff=True,
    )


def _user():
    return get_user_model().objects.create_user(
        username='auth-user', password='x', is_staff=False,
    )


@pytest.mark.django_db
class TestPermissions:
    def test_call_next_requires_auth(self, fixtures):
        _, counter = fixtures
        c = APIClient()
        resp = c.post('/api/queue/call_next/', {'counter_id': counter.id})
        assert resp.status_code == 401

    def test_call_next_rejects_non_staff(self, fixtures):
        _, counter = fixtures
        c = APIClient()
        c.force_authenticate(_user())
        resp = c.post('/api/queue/call_next/', {'counter_id': counter.id})
        assert resp.status_code == 403

    def test_call_next_accepts_staff(self, fixtures):
        svc, counter = fixtures
        c = APIClient()
        c.force_authenticate(_staff())
        # No waiting tokens yet → 404, but we passed auth (not 401/403).
        resp = c.post('/api/queue/call_next/', {'counter_id': counter.id})
        assert resp.status_code in (200, 404)

    def test_register_is_public(self, fixtures):
        svc, _ = fixtures
        c = APIClient()
        resp = c.post('/api/queue/register/', {
            'name': 'P1', 'phone': '+12025550106', 'service_type': svc.id,
        })
        assert resp.status_code == 201

    def test_counter_list_is_public(self, fixtures):
        c = APIClient()
        resp = c.get('/api/counters/')
        assert resp.status_code == 200

    def test_counter_patch_requires_staff(self, fixtures):
        _, counter = fixtures
        c = APIClient()
        resp = c.patch(f'/api/counters/{counter.id}/', {'is_active': False}, format='json')
        assert resp.status_code in (401, 403)

    def test_stats_is_public(self, fixtures):
        c = APIClient()
        resp = c.get('/api/stats/dashboard/')
        assert resp.status_code == 200

    def test_health_probes_are_public(self):
        c = APIClient()
        assert c.get('/api/healthz/').status_code == 200


@pytest.mark.django_db
class TestLoginFlow:
    def test_login_issues_tokens(self):
        get_user_model().objects.create_user(
            username='login-user', password='topsecretpass', is_staff=True,
        )
        c = APIClient()
        resp = c.post('/api/auth/login/', {
            'username': 'login-user', 'password': 'topsecretpass',
        }, format='json')
        assert resp.status_code == 200
        assert 'access' in resp.data and 'refresh' in resp.data

    def test_login_rejects_bad_password(self):
        get_user_model().objects.create_user(
            username='login-user2', password='topsecretpass', is_staff=True,
        )
        c = APIClient()
        resp = c.post('/api/auth/login/', {
            'username': 'login-user2', 'password': 'wrong',
        }, format='json')
        assert resp.status_code == 401
