import pytest
import asyncio
from unittest.mock import patch, MagicMock, AsyncMock
from worker import process_event

@pytest.mark.asyncio
class TestNotificationRetry:
    def setup_method(self):
        self.data = {
            'type': 'token.created',
            'token_id': 1,
            'patient_name': 'Test',
            'phone_number': '+1234567890',
            'token_number': 'GEN-001',
            'eta_minutes': 10,
            'counter_name': 'C1',
            'counter_location': 'Main',
            'directions': 'Go straight'
        }

    @patch('worker.client')
    @patch('worker.log_to_db')
    async def test_first_call_succeeds(self, mock_log, mock_client):
        mock_client.messages.create.return_value = MagicMock()
        await process_event(self.data)
        
        assert mock_client.messages.create.call_count == 1
        mock_log.assert_any_call(1, 'whatsapp', 'sent')

    @patch('worker.client')
    @patch('worker.log_to_db')
    @patch('asyncio.sleep', new_callable=AsyncMock)
    async def test_whatsapp_fails_sms_fallback(self, mock_sleep, mock_log, mock_client):
        # Mock 3 WhatsApp failures
        mock_client.messages.create.side_effect = [Exception("Fail"), Exception("Fail"), Exception("Fail"), MagicMock()]
        
        await process_event(self.data)
        
        # 3 WhatsApp attempts + 1 SMS attempt
        assert mock_client.messages.create.call_count == 4
        mock_log.assert_any_call(1, 'whatsapp', 'failed', 'Fail')
        mock_log.assert_any_call(1, 'sms', 'fallback')
