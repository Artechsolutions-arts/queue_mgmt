"""
Request correlation IDs. The middleware:

1. Picks up an incoming `X-Request-ID` header if present (so an upstream
   proxy / gateway can pin a trace ID across services), otherwise mints
   a new UUID4.
2. Stashes the id on a contextvar so `RequestIDFilter` can attach it to
   every log record emitted while handling the request.
3. Echoes it back in the response so callers can correlate.
"""

from __future__ import annotations

import uuid
from contextvars import ContextVar

_request_id: ContextVar[str] = ContextVar('request_id', default='-')

HEADER_NAME = 'X-Request-ID'
META_KEY = 'HTTP_X_REQUEST_ID'


def get_request_id() -> str:
    return _request_id.get()


def set_request_id(value: str) -> None:
    _request_id.set(value)


class RequestIDMiddleware:
    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        incoming = request.META.get(META_KEY)
        rid = incoming if incoming and len(incoming) <= 128 else uuid.uuid4().hex
        token = _request_id.set(rid)
        try:
            response = self.get_response(request)
        finally:
            _request_id.reset(token)
        response[HEADER_NAME] = rid
        return response
