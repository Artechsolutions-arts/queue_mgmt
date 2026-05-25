from django.db import migrations, models
import django.db.models.deletion
import django.utils.timezone

class Migration(migrations.Migration):
    initial = True

    dependencies = []

    operations = [
        migrations.CreateModel(
            name='ServiceType',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('prefix', models.CharField(max_length=5)),
                ('next_number', models.PositiveIntegerField(default=1)),
            ],
        ),
        migrations.CreateModel(
            name='Counter',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('location_description', models.TextField(blank=True)),
                ('is_active', models.BooleanField(default=True)),
                ('service_types', models.ManyToManyField(related_name='counters', to='core.servicetype')),
            ],
        ),
        migrations.CreateModel(
            name='VisionMetric',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('timestamp', models.DateTimeField(db_index=True, default=django.utils.timezone.now)),
                ('zone_id', models.CharField(max_length=50)),
                ('headcount', models.IntegerField()),
                ('density_score', models.FloatField(default=0.0)),
            ],
            options={
                'ordering': ['-timestamp'],
            },
        ),
        migrations.CreateModel(
            name='Token',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('number', models.CharField(max_length=20, unique=True)),
                ('patient_name', models.CharField(max_length=100)),
                ('phone_number', models.CharField(max_length=20)),
                ('status', models.CharField(choices=[('WAITING', 'Waiting'), ('IN_PROGRESS', 'In Progress'), ('COMPLETED', 'Completed'), ('CANCELLED', 'Cancelled')], default='WAITING', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('service_start_at', models.DateTimeField(blank=True, null=True)),
                ('completed_at', models.DateTimeField(blank=True, null=True)),
                ('predicted_wait_minutes', models.IntegerField(default=0)),
                ('counter', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, to='core.counter')),
                ('service_type', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, to='core.servicetype')),
            ],
        ),
        migrations.CreateModel(
            name='NotificationLog',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('channel', models.CharField(choices=[('whatsapp', 'WhatsApp'), ('sms', 'SMS')], max_length=20)),
                ('status', models.CharField(choices=[('sent', 'Sent'), ('failed', 'Failed'), ('fallback', 'Fallback')], max_length=20)),
                ('timestamp', models.DateTimeField(auto_now_add=True)),
                ('error_message', models.TextField(blank=True, null=True)),
                ('token', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='notifications', to='core.token')),
            ],
        ),
    ]
