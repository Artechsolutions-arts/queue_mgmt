import re

from rest_framework import serializers
from .models import ServiceType, Counter, Token, Patient, VisionMetric, NotificationLog, EscalationRule, EscalationAlert, PatientVisit, Doctor


def normalize_phone(value: str) -> str:
    """Collapse a typed phone number to E.164 form (digits with a single
    leading +). Twilio's WhatsApp channel rejects numbers containing spaces
    (error 21211), so anything other than digits and a leading + is stripped.
    SMS tolerates the spaces, which is why a malformed number silently fell
    back to SMS-only."""
    digits = re.sub(r"\D", "", value or "")
    return f"+{digits}" if digits else ""

class ServiceTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = ServiceType
        fields = '__all__'

class CounterSerializer(serializers.ModelSerializer):
    queue_depth = serializers.IntegerField(read_only=True)
    current_token = serializers.SerializerMethodField()
    next_tokens = serializers.SerializerMethodField()

    class Meta:
        model = Counter
        fields = ['id', 'name', 'location_description', 'is_active', 'service_types', 'queue_depth', 'current_token', 'next_tokens']

    def get_current_token(self, obj):
        # Use prefetched data if available (CounterViewSet.get_queryset prefetches these).
        if hasattr(obj, '_prefetched_in_progress'):
            tokens = obj._prefetched_in_progress
            return tokens[0].number if tokens else None
        token = Token.objects.filter(counter=obj, status='IN_PROGRESS').first()
        return token.number if token else None

    def get_next_tokens(self, obj):
        if hasattr(obj, '_prefetched_waiting'):
            return [t.number for t in obj._prefetched_waiting[:3]]
        tokens = Token.objects.filter(counter=obj, status='WAITING').order_by('created_at')[:3]
        return [t.number for t in tokens]

class TokenSerializer(serializers.ModelSerializer):
    actual_wait_minutes = serializers.ReadOnlyField()
    service_type_name = serializers.CharField(source='service_type.name', read_only=True)
    counter_name = serializers.CharField(source='counter.name', read_only=True)
    patient_id = serializers.SerializerMethodField()
    visit_id = serializers.IntegerField(source='visit.id', read_only=True, default=None)

    def get_patient_id(self, obj):
        return obj.patient.patient_id if obj.patient_id else None

    class Meta:
        model = Token
        # medical_notes is PHI — excluded from list responses to limit exposure.
        # Use TokenDetailSerializer when medical_notes is specifically needed.
        fields = [
            'id', 'number', 'status', 'service_type', 'service_type_name',
            'counter', 'counter_name', 'patient_name', 'phone_number',
            'created_at', 'service_start_at', 'completed_at',
            'actual_wait_minutes', 'predicted_wait_minutes',
            'patient_id', 'visit_id',
        ]


class TokenDetailSerializer(TokenSerializer):
    """Full token representation including medical_notes — use only where PHI access is justified."""
    class Meta(TokenSerializer.Meta):
        fields = TokenSerializer.Meta.fields + ['medical_notes']


class VisitTokenSerializer(serializers.ModelSerializer):
    """Lightweight token representation used inside a visit journey."""
    service_type_name = serializers.CharField(source='service_type.name', read_only=True)
    counter_name = serializers.CharField(source='counter.name', read_only=True, default=None)

    class Meta:
        model = Token
        fields = ['id', 'number', 'service_type_name', 'counter_name', 'status', 'created_at', 'service_start_at', 'completed_at', 'actual_wait_minutes']


class PatientVisitSerializer(serializers.ModelSerializer):
    tokens = VisitTokenSerializer(many=True, read_only=True)
    patient_name = serializers.CharField(source='patient.name', read_only=True)
    patient_id = serializers.CharField(source='patient.patient_id', read_only=True)

    class Meta:
        model = PatientVisit
        fields = ['id', 'patient_id', 'patient_name', 'created_at', 'notes', 'tokens']


class PatientSerializer(serializers.ModelSerializer):
    patient_id = serializers.ReadOnlyField()
    visit_count = serializers.IntegerField(read_only=True)
    last_visit_at = serializers.DateTimeField(read_only=True)
    open_tokens = serializers.IntegerField(read_only=True)

    class Meta:
        model = Patient
        fields = [
            'id', 'patient_id', 'name', 'phone_number',
            'created_at', 'updated_at',
            'visit_count', 'last_visit_at', 'open_tokens',
        ]


class PatientDetailSerializer(PatientSerializer):
    """Patient detail also returns full token history (newest first)."""
    tokens = TokenSerializer(many=True, read_only=True)

    class Meta(PatientSerializer.Meta):
        fields = PatientSerializer.Meta.fields + ['tokens']

class RegisterTokenSerializer(serializers.Serializer):
    patient_name = serializers.CharField(max_length=100)
    phone_number = serializers.CharField(max_length=20)
    service_type_id = serializers.IntegerField()
    medical_notes = serializers.CharField(required=False, allow_blank=True, default="")
    is_simulated = serializers.BooleanField(required=False, default=False)

    def validate_phone_number(self, value):
        cleaned = normalize_phone(value)
        if len(cleaned) < 8:  # "+" plus at least 7 digits
            raise serializers.ValidationError("Enter a valid phone number with country code.")
        return cleaned


class RegisterMultiSerializer(serializers.Serializer):
    """Register one patient against multiple services and/or diagnostic tests.

    At least one of `service_type_ids` or `test_ids` must be non-empty. Both
    are simple lists of ServiceType ids — the worker doesn't care which kind
    a token is, only the form does.
    """
    patient_name = serializers.CharField(max_length=100)
    phone_number = serializers.CharField(max_length=20)
    service_type_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )
    test_ids = serializers.ListField(
        child=serializers.IntegerField(), required=False, default=list
    )
    medical_notes = serializers.CharField(required=False, allow_blank=True, default="")
    is_simulated = serializers.BooleanField(required=False, default=False)

    def validate_phone_number(self, value):
        cleaned = normalize_phone(value)
        if len(cleaned) < 8:  # "+" plus at least 7 digits
            raise serializers.ValidationError("Enter a valid phone number with country code.")
        return cleaned

    def validate(self, data):
        if not data.get("service_type_ids") and not data.get("test_ids"):
            raise serializers.ValidationError(
                "Select at least one service or diagnostic test."
            )
        return data

class EscalationAlertSerializer(serializers.ModelSerializer):
    rule_name = serializers.CharField(source='rule.name', read_only=True)
    threshold_type = serializers.CharField(source='rule.threshold_type', read_only=True)
    counter_name = serializers.CharField(source='counter.name', read_only=True, default=None)
    service_type_name = serializers.CharField(source='service_type.name', read_only=True, default=None)
    is_acknowledged = serializers.SerializerMethodField()

    def get_is_acknowledged(self, obj):
        return obj.acknowledged_at is not None

    class Meta:
        model = EscalationAlert
        fields = ['id', 'rule_name', 'threshold_type', 'counter_name', 'service_type_name',
                  'triggered_value', 'message', 'created_at', 'acknowledged_at', 'is_acknowledged']


class DoctorSerializer(serializers.ModelSerializer):
    service_type_name = serializers.CharField(source='service_type.name', read_only=True)
    is_available = serializers.SerializerMethodField()

    def get_is_available(self, obj):
        return obj.status == Doctor.AVAILABLE

    class Meta:
        model = Doctor
        fields = ['id', 'name', 'service_type', 'service_type_name', 'status',
                  'delay_minutes', 'notes', 'updated_at', 'is_available']
        read_only_fields = ['updated_at']


class DashboardStatsSerializer(serializers.Serializer):
    avg_wait_minutes = serializers.FloatField()
    avg_service_minutes = serializers.FloatField()
    completed_in_window = serializers.IntegerField()
    window_hours = serializers.IntegerField()
    total_waiting = serializers.IntegerField()
    total_in_progress = serializers.IntegerField()
    active_counters = serializers.IntegerField()
    total_counters = serializers.IntegerField()
    bottlenecks = serializers.ListField(child=serializers.DictField())
