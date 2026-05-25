from django.db import migrations, models


def backfill_patients(apps, schema_editor):
    """For every distinct (phone_number) in Token, ensure a Patient exists and
    link each token to it. Picks the most recent token's patient_name as the
    canonical name for that phone — newer name beats older."""
    Patient = apps.get_model("core", "Patient")
    Token = apps.get_model("core", "Token")

    # Walk tokens newest-first; first time we see a phone, use that name.
    canonical = {}  # phone -> name
    for t in Token.objects.order_by('-created_at').values('phone_number', 'patient_name'):
        if t['phone_number'] and t['phone_number'] not in canonical:
            canonical[t['phone_number']] = t['patient_name'] or '(unknown)'

    phone_to_patient = {}
    for phone, name in canonical.items():
        patient, _ = Patient.objects.get_or_create(
            phone_number=phone,
            defaults={'name': name},
        )
        phone_to_patient[phone] = patient

    # Bulk-update tokens to point at their Patient.
    for phone, patient in phone_to_patient.items():
        Token.objects.filter(phone_number=phone, patient__isnull=True).update(patient=patient)


def reverse_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):
    dependencies = [
        ("core", "0005_servicetype_kind"),
    ]

    operations = [
        migrations.CreateModel(
            name='Patient',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('phone_number', models.CharField(db_index=True, max_length=20, unique=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
        ),
        migrations.AddField(
            model_name='token',
            name='patient',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=models.deletion.PROTECT,
                related_name='tokens',
                to='core.patient',
            ),
        ),
        migrations.RunPython(backfill_patients, reverse_code=reverse_noop),
    ]
