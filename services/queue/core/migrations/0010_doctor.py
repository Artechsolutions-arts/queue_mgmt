from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0009_patientvisit_token_visit'),
    ]

    operations = [
        migrations.CreateModel(
            name='Doctor',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('status', models.CharField(
                    choices=[('AVAILABLE', 'Available'), ('DELAYED', 'Delayed'), ('ON_LEAVE', 'On Leave'), ('EMERGENCY', 'Emergency')],
                    default='AVAILABLE', max_length=20,
                )),
                ('delay_minutes', models.PositiveIntegerField(default=0)),
                ('notes', models.TextField(blank=True)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('service_type', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='doctors',
                    to='core.servicetype',
                )),
            ],
        ),
    ]
