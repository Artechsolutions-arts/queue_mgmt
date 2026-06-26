import json
from channels.generic.websocket import AsyncWebsocketConsumer


class QueueConsumer(AsyncWebsocketConsumer):
    async def connect(self):
        # Lazy import avoids triggering Django app registry before setup.
        from rest_framework_simplejwt.tokens import AccessToken
        from rest_framework_simplejwt.exceptions import InvalidToken, TokenError

        # Require a valid JWT passed as ?token=<access_token> in the WS URL.
        # Unauthenticated clients get closed with code 4003 (policy violation).
        scope_query = dict(
            (k.decode(), v.decode())
            for k, v in (
                param.split(b'=', 1) for param in
                self.scope.get('query_string', b'').split(b'&')
                if b'=' in param
            )
        )
        raw_token = scope_query.get('token', '')
        if not raw_token:
            await self.close(code=4003)
            return
        try:
            AccessToken(raw_token)
        except (InvalidToken, TokenError):
            await self.close(code=4003)
            return

        self.group_name = "queue_updates"
        await self.channel_layer.group_add(
            self.group_name,
            self.channel_name
        )
        await self.accept()

    async def disconnect(self, close_code):
        if hasattr(self, 'group_name'):
            await self.channel_layer.group_discard(
                self.group_name,
                self.channel_name
            )

    async def queue_update(self, event):
        # Sends a tick only message as per specs
        await self.send(text_data=json.dumps({
            'type': 'tick'
        }))
