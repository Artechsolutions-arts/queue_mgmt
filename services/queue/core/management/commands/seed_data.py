from django.core.management.base import BaseCommand

from core.models import Counter, ServiceType, EscalationRule, Doctor

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
    ("OPD Desk A",          "Main Hall, ground floor",                      ["GEN"]),
    ("Paediatrics Desk",    "East Wing, ground floor",                      ["PED"]),
    ("Cardiology Desk",     "West Wing, ground floor",                      ["CARD"]),
    ("OPD Desk B",          "Main Hall, opposite the reception",            ["GEN", "ORTHO"]),
    ("Pathology Lab",       "Pathology Lab, 1st floor",                     ["BLD", "URN", "PFT"]),
    ("Radiology Suite",     "Radiology Dept, ground floor",                 ["XRY", "MRI", "ULT", "CT", "MAM"]),
    ("Dermatology Desk",    "East Wing, 2nd floor",                         ["DERM"]),
    ("Senses Desk",         "East Wing, 2nd floor — ENT & Ophthalmology",   ["ENT", "OPHT"]),
    ("Gynecology Desk",    "West Wing, 2nd floor",                         ["GYN"]),
    ("Neurology Desk",      "West Wing, 2nd floor — Neurology",             ["NEUR"]),
    ("Dental Desk",         "South Wing, ground floor",                     ["DENT"]),
    ("Psychiatry Desk",     "South Wing, ground floor — Mental Health",     ["PSY"]),
    ("Surgical Desk",       "South Wing, 1st floor",                        ["SURG"]),
    ("Cardiology Lab",      "Cardiology Lab, 2nd floor",                    ["ECG", "ECHO", "EEG"]),
    ("Endoscopy Suite",     "Endoscopy Suite, 3rd floor",                   ["ENDO", "BIO"]),
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
            counter, created = Counter.objects.update_or_create(
                name=name,
                defaults={"location_description": location, "is_active": True},
            )
            counter.service_types.set([services[p] for p in prefixes])
            self.stdout.write(
                self.style.SUCCESS(f"{'created' if created else 'activated'}: {counter.name}")
            )

        for name, threshold_type, threshold_value in [
            ("High queue depth", EscalationRule.QUEUE_DEPTH, 5),
            ("Long avg wait",    EscalationRule.AVG_WAIT,    20),
        ]:
            _, created = EscalationRule.objects.get_or_create(
                name=name,
                defaults={"threshold_type": threshold_type, "threshold_value": threshold_value, "is_active": True},
            )
            self.stdout.write(self.style.SUCCESS(f"{'created' if created else 'exists'}: escalation rule '{name}'"))

        DEFAULT_DOCTORS = [
            ("Ananya Sharma",    "GEN"),
            ("Rajesh Kumar",     "GEN"),
            ("Priya Nair",       "CARD"),
            ("Suresh Menon",     "NEUR"),
            ("Deepa Iyer",       "GYN"),
            ("Arjun Patel",      "ORTHO"),
            ("Kavita Reddy",     "PED"),
            ("Mohammed Farooq",  "DERM"),
            ("Sunita Joshi",     "PSY"),
            ("Vikram Singh",     "SURG"),
            ("Lakshmi Venkat",   "ENT"),
            ("Arun Krishnan",    "OPHT"),
            ("Meera Pillai",     "DENT"),
        ]
        for name, prefix in DEFAULT_DOCTORS:
            st = services.get(prefix)
            if not st:
                continue
            _, created = Doctor.objects.get_or_create(
                name=name, service_type=st,
                defaults={"status": Doctor.AVAILABLE},
            )
            self.stdout.write(self.style.SUCCESS(f"{'created' if created else 'exists'}: Dr. {name} [{st.name}]"))

        self.stdout.write(self.style.SUCCESS("Seed complete."))
