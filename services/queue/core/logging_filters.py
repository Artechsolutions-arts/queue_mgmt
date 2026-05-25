"""Logging filter that injects the current request id onto every log record."""

import logging

from .middleware import get_request_id


class RequestIDFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:  # noqa: D401
        record.request_id = get_request_id()
        return True
