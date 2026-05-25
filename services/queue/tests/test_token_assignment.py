import pytest
from django.urls import reverse
from core.models import Token, Counter, ServiceType
from unittest.mock import patch

@pytest.mark.django_db
class TestTokenAssignment:
    def setup_method(self):
        self.st = ServiceType.objects.create(name="General", prefix="GEN")
        self.c1 = Counter.objects.create(name="C1", is_active=True)
        self.c2 = Counter.objects.create(name="C2", is_active=True)
        self.c1.service_types.add(self.st)
        self.c2.service_types.add(self.st)

    def test_token_increment(self, client):
        resp = client.post(reverse('queue-register'), {
            'patient_name': 'Alice',
            'phone_number': '123',
            'service_type_id': self.st.id
        })
        assert resp.data['token_number'] == 'GEN-001'
        
        resp = client.post(reverse('queue-register'), {
            'patient_name': 'Bob',
            'phone_number': '456',
            'service_type_id': self.st.id
        })
        assert resp.data['token_number'] == 'GEN-002'

    def test_shortest_queue_assignment(self, client):
        # Fill C1
        Token.objects.create(number='GEN-001', service_type=self.st, counter=self.c1, status='WAITING')
        
        # New registration should go to C2 (shortest)
        with patch('requests.post') as mock_post:
            # Mock prediction service to fail so fallback logic triggers
            mock_post.side_effect = Exception("Service Down")
            resp = client.post(reverse('queue-register'), {
                'patient_name': 'Charlie',
                'phone_number': '789',
                'service_type_id': self.st.id
            })
            assert resp.data['counter'] == 'C2'

    def test_equal_queue_depth_lower_id_wins(self, client):
        with patch('requests.post') as mock_post:
            mock_post.side_effect = Exception("Service Down")
            resp = client.post(reverse('queue-register'), {
                'patient_name': 'Charlie',
                'phone_number': '789',
                'service_type_id': self.st.id
            })
            # Both empty, C1 (lower ID) wins
            assert resp.data['counter'] == 'C1'
