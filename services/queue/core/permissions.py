"""Custom permission classes."""

from rest_framework.permissions import BasePermission, SAFE_METHODS


class IsStaffOrReadOnly(BasePermission):
    """
    GET/HEAD/OPTIONS are public; everything that mutates state requires
    an authenticated user with ``is_staff=True`` (so a separate "staff"
    JWT differs from an admin one).
    """

    def has_permission(self, request, view):
        if request.method in SAFE_METHODS:
            return True
        user = getattr(request, 'user', None)
        return bool(user and user.is_authenticated and user.is_staff)


class IsStaff(BasePermission):
    def has_permission(self, request, view):
        user = getattr(request, 'user', None)
        return bool(user and user.is_authenticated and user.is_staff)
