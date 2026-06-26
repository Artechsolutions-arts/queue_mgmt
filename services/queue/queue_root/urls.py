import os
from django.contrib import admin
from django.urls import path, include

# Randomise the admin URL in production so it's not guessable.
# Set DJANGO_ADMIN_URL to a secret path (e.g. "xk92mz-admin/") in prod.
ADMIN_URL = os.getenv('DJANGO_ADMIN_URL', 'admin/')

urlpatterns = [
    path(ADMIN_URL, admin.site.urls),
    path('api/', include('core.urls')),
]
