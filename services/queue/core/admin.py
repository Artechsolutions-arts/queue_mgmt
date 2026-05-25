from django.contrib import admin
from .models import ServiceType, Counter, Token, VisionMetric

@admin.register(ServiceType)
class ServiceTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'prefix', 'next_number')

@admin.register(Counter)
class CounterAdmin(admin.ModelAdmin):
    list_display = ('name', 'location_description', 'is_active')
    list_editable = ('is_active',)

@admin.register(Token)
class TokenAdmin(admin.ModelAdmin):
    list_display = ('number', 'patient_name', 'service_type', 'status', 'created_at')
    list_filter = ('status', 'service_type', 'counter')
    search_fields = ('number', 'patient_name', 'phone_number')

@admin.register(VisionMetric)
class VisionMetricAdmin(admin.ModelAdmin):
    list_display = ('zone_id', 'headcount', 'timestamp')
    list_filter = ('zone_id',)
