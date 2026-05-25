from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views
from .auth_views import LoginView, RefreshView

router = DefaultRouter()
router.register(r'queue', views.QueueViewSet, basename='queue')
router.register(r'counters', views.CounterViewSet, basename='counter')
router.register(r'service-types', views.ServiceTypeViewSet, basename='service-type')
router.register(r'stats', views.StatsViewSet, basename='stats')
router.register(r'patients', views.PatientViewSet, basename='patient')

urlpatterns = [
    path('', include(router.urls)),
    path('auth/login/', LoginView.as_view(), name='auth-login'),
    path('auth/refresh/', RefreshView.as_view(), name='auth-refresh'),
    path('healthz/', views.healthz),
    path('readyz/', views.readyz),
    path('notifications/twilio-status/', views.twilio_status_callback,
         name='twilio-status-callback'),
]
