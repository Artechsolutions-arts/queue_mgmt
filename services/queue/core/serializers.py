from rest_framework import serializers
from .models import ServiceType, Counter, Token, Patient, VisionMetric, NotificationLog

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
        token = Token.objects.filter(counter=obj, status='IN_PROGRESS').first()
        return token.number if token else None

    def get_next_tokens(self, obj):
        tokens = Token.objects.filter(counter=obj, status='WAITING').order_by('created_at')[:3]
        return [t.number for t in tokens]

class TokenSerializer(serializers.ModelSerializer):
    actual_wait_minutes = serializers.ReadOnlyField()
    service_type_name = serializers.CharField(source='service_type.name', read_only=True)
    counter_name = serializers.CharField(source='counter.name', read_only=True)
    # Human-readable patient id (P-000001 etc.). null for legacy tokens not yet linked.
    patient_id = serializers.SerializerMethodField()

    def get_patient_id(self, obj):
        return obj.patient.patient_id if obj.patient_id else None

    class Meta:
        model = Token
        fields = '__all__'


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

    def validate(self, data):
        if not data.get("service_type_ids") and not data.get("test_ids"):
            raise serializers.ValidationError(
                "Select at least one service or diagnostic test."
            )
        return data

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
