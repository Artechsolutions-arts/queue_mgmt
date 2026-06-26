from django.db import models
from django.db.models import Q
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
        return f"P-{self.pk:03d}"

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
        ('NO_SHOW', 'No Show'),
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
    visit = models.ForeignKey(
        'PatientVisit', on_delete=models.SET_NULL, null=True, blank=True, related_name='tokens'
    )
    
    class Meta:
        constraints = [
            # Enforce at the DB level that at most one token per counter can be
            # IN_PROGRESS at a time. The app-level check in call_next is the
            # first line of defence; this partial index is the backstop.
            models.UniqueConstraint(
                fields=['counter'],
                condition=Q(status='IN_PROGRESS'),
                name='one_in_progress_per_counter',
            ),
        ]

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

class PatientVisit(models.Model):
    """Groups all tokens issued during a single hospital visit under one record.

    Created at first registration (single or multi). Transfer adds new tokens
    to the same visit so the full patient journey is traceable.
    """
    patient = models.ForeignKey(Patient, on_delete=models.PROTECT, related_name='visits')
    created_at = models.DateTimeField(auto_now_add=True)
    notes = models.TextField(blank=True)

    def __str__(self):
        return f"Visit {self.pk} · {self.patient}"


class Doctor(models.Model):
    AVAILABLE = 'AVAILABLE'
    DELAYED   = 'DELAYED'
    ON_LEAVE  = 'ON_LEAVE'
    EMERGENCY = 'EMERGENCY'
    STATUS_CHOICES = [
        (AVAILABLE, 'Available'),
        (DELAYED,   'Delayed'),
        (ON_LEAVE,  'On Leave'),
        (EMERGENCY, 'Emergency'),
    ]

    name         = models.CharField(max_length=100)
    service_type = models.ForeignKey(ServiceType, on_delete=models.CASCADE, related_name='doctors')
    status       = models.CharField(max_length=20, choices=STATUS_CHOICES, default=AVAILABLE)
    delay_minutes = models.PositiveIntegerField(default=0)
    notes        = models.TextField(blank=True)
    updated_at   = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f"Dr. {self.name} [{self.service_type}]"


class EscalationRule(models.Model):
    QUEUE_DEPTH = 'QUEUE_DEPTH'
    AVG_WAIT = 'AVG_WAIT'
    TYPE_CHOICES = [
        (QUEUE_DEPTH, 'Queue depth exceeds'),
        (AVG_WAIT, 'Avg wait (min) exceeds'),
    ]

    name = models.CharField(max_length=100)
    threshold_type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    threshold_value = models.FloatField()
    service_type = models.ForeignKey(
        ServiceType, on_delete=models.CASCADE, null=True, blank=True,
        related_name='escalation_rules',
        help_text="Leave blank to apply across all service types.",
    )
    is_active = models.BooleanField(default=True)

    def __str__(self):
        scope = f" [{self.service_type}]" if self.service_type_id else ""
        return f"{self.name}{scope} ({self.get_threshold_type_display()} > {self.threshold_value})"


class EscalationAlert(models.Model):
    rule = models.ForeignKey(EscalationRule, on_delete=models.CASCADE, related_name='alerts')
    counter = models.ForeignKey(
        Counter, on_delete=models.SET_NULL, null=True, blank=True, related_name='escalation_alerts'
    )
    service_type = models.ForeignKey(
        ServiceType, on_delete=models.SET_NULL, null=True, blank=True, related_name='escalation_alerts'
    )
    triggered_value = models.FloatField()
    message = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    acknowledged_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-created_at']

    def __str__(self):
        return f"Alert [{self.rule.name}] @ {self.created_at:%Y-%m-%d %H:%M}"


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
