"""Authentication endpoints — JWT login + refresh.

Wraps the simplejwt views with our own ScopedRateThrottle so login
brute-forcing is meaningfully expensive.
"""

from rest_framework.permissions import AllowAny
from rest_framework.throttling import ScopedRateThrottle
from rest_framework_simplejwt.views import (
    TokenObtainPairView,
    TokenRefreshView,
)


class LoginView(TokenObtainPairView):
    permission_classes = (AllowAny,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = 'login'


class RefreshView(TokenRefreshView):
    permission_classes = (AllowAny,)
    throttle_classes = (ScopedRateThrottle,)
    throttle_scope = 'login'
