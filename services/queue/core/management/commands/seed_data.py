from django.core.management.base import BaseCommand

from core.models import Counter, ServiceType

CONSULTATION = "CONSULTATION"
DIAGNOSTIC = "DIAGNOSTIC"

# (name, prefix, kind)
DEFAULT_SERVICES = [
    # Consultations / departments
    ("General Consultation", "GEN", CONSULTATION),
    ("Pediatrics", "PED", CONSULTATION),
    ("Cardiology", "CARD", CONSULTATION),
    ("Orthopedics", "ORTHO", CONSULTATION),
    ("Dermatology", "DERM", CONSULTATION),
    ("ENT (Ear, Nose, Throat)", "ENT", CONSULTATION),
    ("Ophthalmology", "OPHT", CONSULTATION),
    ("Gynecology", "GYN", CONSULTATION),
    ("Neurology", "NEUR", CONSULTATION),
    ("Dental", "DENT", CONSULTATION),
    ("Psychiatry", "PSY", CONSULTATION),
    ("General Surgery", "SURG", CONSULTATION),
    # Diagnostic tests
    ("Blood Test", "BLD", DIAGNOSTIC),
    ("Urine Test", "URN", DIAGNOSTIC),
    ("X-Ray", "XRY", DIAGNOSTIC),
    ("MRI Scan", "MRI", DIAGNOSTIC),
    ("CT Scan", "CT", DIAGNOSTIC),
    ("Ultrasound", "ULT", DIAGNOSTIC),
    ("Mammography", "MAM", DIAGNOSTIC),
    ("PFT (Pulmonary Function Test)", "PFT", DIAGNOSTIC),
    ("ECG", "ECG", DIAGNOSTIC),
    ("Echocardiogram", "ECHO", DIAGNOSTIC),
    ("EEG", "EEG", DIAGNOSTIC),
    ("Endoscopy", "ENDO", DIAGNOSTIC),
    ("Biopsy", "BIO", DIAGNOSTIC),
]

DEFAULT_COUNTERS = [
    # Original counters (kept for backwards compat with existing tokens)
    ("Counter 1", "Main Hall, next to the pharmacy", ["GEN"]),
    ("Counter 2", "East Wing, behind the elevator", ["PED"]),
    ("Counter 3", "West Wing, near the cafeteria", ["CARD"]),
    ("Counter 4", "Main Hall, opposite the reception", ["GEN", "ORTHO"]),
    ("Lab Counter 5", "Pathology Lab, 1st floor", ["BLD", "URN", "PFT"]),
    ("Radiology Counter 6", "Radiology Dept, ground floor", ["XRY", "MRI", "ULT", "CT", "MAM"]),
    # New counters covering the added departments + tests
    ("Counter 7", "East Wing, 2nd floor — Skin & Senses", ["DERM", "ENT", "OPHT"]),
    ("Counter 8", "West Wing, 2nd floor — Women & Brain", ["GYN", "NEUR"]),
    ("Counter 9", "South Wing, ground floor — Dental & Mental Health", ["DENT", "PSY"]),
    ("Counter 10", "South Wing, 1st floor — Surgery Consult", ["SURG"]),
    ("Cardio Counter 11", "Cardiology Lab, 2nd floor", ["ECG", "ECHO", "EEG"]),
    ("Endoscopy Suite 12", "Endoscopy Suite, 3rd floor", ["ENDO", "BIO"]),
]


class Command(BaseCommand):
    help = "Seed demo service types and counters (idempotent)."

    def handle(self, *args, **options):
        services = {}
        for name, prefix, kind in DEFAULT_SERVICES:
            obj, created = ServiceType.objects.get_or_create(
                prefix=prefix,
                defaults={"name": name, "kind": kind},
            )
            # Refresh name + kind so reseeding fixes drift on rows that pre-date the kind field.
            changed = False
            if obj.name != name:
                obj.name = name
                changed = True
            if obj.kind != kind:
                obj.kind = kind
                changed = True
            if changed and not created:
                obj.save(update_fields=["name", "kind"])
            services[prefix] = obj
            tag = "created" if created else ("updated" if changed else "exists")
            self.stdout.write(self.style.SUCCESS(f"{tag}: service {obj} [{kind}]"))

        for name, location, prefixes in DEFAULT_COUNTERS:
            counter, created = Counter.objects.get_or_create(
                name=name,
                defaults={"location_description": location, "is_active": True},
            )
            counter.service_types.set([services[p] for p in prefixes])
            self.stdout.write(
                self.style.SUCCESS(f"{'created' if created else 'exists'}: {counter.name}")
            )

        self.stdout.write(self.style.SUCCESS("Seed complete."))
