from rest_framework.exceptions import AuthenticationFailed
from rest_framework_simplejwt.authentication import JWTAuthentication


class SilentJWTAuthentication(JWTAuthentication):
    """Like JWTAuthentication but treats expired/invalid tokens as anonymous.

    Standard JWTAuthentication raises AuthenticationFailed (→ 401) when a bad
    token is present, which fires before any permission check. That means public
    GET endpoints still return 401 when the client sends a stale token — even
    though IsStaffOrReadOnly would allow the request through.

    Returning None here lets the request fall through to the permission layer,
    where IsStaffOrReadOnly grants the read and requires staff auth only for writes.
    """

    def authenticate(self, request):
        try:
            return super().authenticate(request)
        except AuthenticationFailed:
            return None
