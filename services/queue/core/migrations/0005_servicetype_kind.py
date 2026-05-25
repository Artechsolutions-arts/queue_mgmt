from django.db import migrations, models


DIAGNOSTIC_PREFIXES = {"BLD", "XRY", "MRI", "PFT", "ULT", "ECG", "CT", "USG"}


def backfill_kind(apps, schema_editor):
    ServiceType = apps.get_model("core", "ServiceType")
    for st in ServiceType.objects.all():
        st.kind = "DIAGNOSTIC" if st.prefix.upper() in DIAGNOSTIC_PREFIXES else "CONSULTATION"
        st.save(update_fields=["kind"])


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0004_remove_visionmetric_core_vision_ts_zone_idx_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="servicetype",
            name="kind",
            field=models.CharField(
                choices=[("CONSULTATION", "Consultation"), ("DIAGNOSTIC", "Diagnostic test")],
                default="CONSULTATION",
                max_length=20,
            ),
        ),
        migrations.RunPython(backfill_kind, reverse_code=reverse_noop),
    ]
