from django.db import migrations, models
import django.utils.timezone


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_enable_timescaledb'),
    ]

    operations = [
        migrations.AlterField(
            model_name='visionmetric',
            name='timestamp',
            field=models.DateTimeField(default=django.utils.timezone.now),
        ),
        migrations.AddIndex(
            model_name='visionmetric',
            index=models.Index(fields=['timestamp', 'zone_id'], name='core_vision_ts_zone_idx'),
        ),
    ]
