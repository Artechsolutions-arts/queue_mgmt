"""Shared HTTP sessions with retries.

A long-lived `requests.Session` per upstream lets urllib3 reuse the
TCP connection. The `Retry` policy makes transient prediction-service
hiccups invisible — we still fall back to shortest-queue heuristics if
all retries fail.
"""

from __future__ import annotations

import os

import requests
from requests.adapters import HTTPAdapter
from urllib3.util.retry import Retry


def _build_session(prefix: str = '') -> requests.Session:
    s = requests.Session()
    retry = Retry(
        total=int(os.getenv(f'{prefix}HTTP_RETRIES', '2')),
        connect=2,
        read=2,
        backoff_factor=float(os.getenv(f'{prefix}HTTP_BACKOFF', '0.2')),
        status_forcelist=(502, 503, 504),
        allowed_methods=('GET', 'POST'),
        raise_on_status=False,
    )
    adapter = HTTPAdapter(max_retries=retry, pool_connections=10, pool_maxsize=20)
    s.mount('http://', adapter)
    s.mount('https://', adapter)
    return s


prediction_session = _build_session('PREDICTION_')
