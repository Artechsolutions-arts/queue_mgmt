from django.db import models
from django.utils import timezone


class Patient(models.Model):
    """One row per real-world person. A patient's phone number is the natural
    key — repeat visits roll up under the same Patient instead of creating
    parallel records."""
    name = models.CharField(max_length=100)
    phone_number = models.CharField(max_length=20, unique=True, db_index=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    @property
    def patient_id(self) -> str:
        """Display ID such as P-000123 — derived from PK so it's stable + sortable."""
        return f"P-{self.pk:06d}"

    def __str__(self):
        return f"{self.patient_id} {self.name}"


class ServiceType(models.Model):
    CONSULTATION = 'CONSULTATION'
    DIAGNOSTIC = 'DIAGNOSTIC'
    KIND_CHOICES = [
        (CONSULTATION, 'Consultation'),
        (DIAGNOSTIC, 'Diagnostic test'),
    ]

    name = models.CharField(max_length=100)
    prefix = models.CharField(max_length=5)
    next_number = models.PositiveIntegerField(default=1)
    kind = models.CharField(max_length=20, choices=KIND_CHOICES, default=CONSULTATION)

    def __str__(self):
        return self.name

class Counter(models.Model):
    name = models.CharField(max_length=100)
    location_description = models.TextField(blank=True)
    is_active = models.BooleanField(default=True)
    service_types = models.ManyToManyField(ServiceType, related_name='counters')

    def __str__(self):
        return self.name

class Token(models.Model):
    STATUS_CHOICES = [
        ('WAITING', 'Waiting'),
        ('IN_PROGRESS', 'In Progress'),
        ('COMPLETED', 'Completed'),
        ('CANCELLED', 'Cancelled'),
    ]

    number = models.CharField(max_length=20, unique=True)
    # FK to Patient — the source of truth for who this token belongs to.
    # Nullable while migrating; new tokens always set this.
    patient = models.ForeignKey(
        'Patient', on_delete=models.PROTECT, related_name='tokens', null=True, blank=True
    )
    # Denormalised copies kept for query speed + backward compat with existing
    # code/serialisers. Always populated from Patient at write time.
    patient_name = models.CharField(max_length=100)
    phone_number = models.CharField(max_length=20)
    service_type = models.ForeignKey(ServiceType, on_delete=models.CASCADE)
    counter = models.ForeignKey(Counter, on_delete=models.SET_NULL, null=True, blank=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='WAITING')
    created_at = models.DateTimeField(auto_now_add=True)
    service_start_at = models.DateTimeField(null=True, blank=True)
    completed_at = models.DateTimeField(null=True, blank=True)
    predicted_wait_minutes = models.IntegerField(default=0)
    medical_notes = models.TextField(blank=True, null=True, help_text="Additional tests needed, disease history, etc.")
    
    @property
    def actual_wait_minutes(self):
        if self.service_start_at:
            delta = self.service_start_at - self.created_at
            return round(delta.total_seconds() / 60, 2)
        return None

    def __str__(self):
        return f"{self.number} - {self.patient_name}"


class VisionMetric(models.Model):
    # For TimescaleDB, timestamp is the primary key/partition key
    timestamp = models.DateTimeField(default=timezone.now, db_index=True)
    zone_id = models.CharField(max_length=50)
    headcount = models.IntegerField()
    density_score = models.FloatField(default=0.0)

    class Meta:
        ordering = ['-timestamp']

class NotificationLog(models.Model):
    CHANNEL_CHOICES = [('whatsapp', 'WhatsApp'), ('sms', 'SMS')]
    STATUS_CHOICES = [('sent', 'Sent'), ('failed', 'Failed'), ('fallback', 'Fallback')]

    token = models.ForeignKey(Token, on_delete=models.CASCADE, related_name='notifications')
    channel = models.CharField(max_length=20, choices=CHANNEL_CHOICES)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES)
    timestamp = models.DateTimeField(auto_now_add=True)
    error_message = models.TextField(null=True, blank=True)

    def __str__(self):
        return f"Notification for {self.token.number} via {self.channel}: {self.status}"
