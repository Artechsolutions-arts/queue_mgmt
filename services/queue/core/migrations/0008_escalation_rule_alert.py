from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0007_token_no_show_status'),
    ]

    operations = [
        migrations.CreateModel(
            name='EscalationRule',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100)),
                ('threshold_type', models.CharField(choices=[('QUEUE_DEPTH', 'Queue depth exceeds'), ('AVG_WAIT', 'Avg wait (min) exceeds')], max_length=20)),
                ('threshold_value', models.FloatField()),
                ('is_active', models.BooleanField(default=True)),
                ('service_type', models.ForeignKey(blank=True, help_text='Leave blank to apply across all service types.', null=True, on_delete=django.db.models.deletion.CASCADE, related_name='escalation_rules', to='core.servicetype')),
            ],
        ),
        migrations.CreateModel(
            name='EscalationAlert',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('triggered_value', models.FloatField()),
                ('message', models.CharField(max_length=255)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('acknowledged_at', models.DateTimeField(blank=True, null=True)),
                ('rule', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='alerts', to='core.escalationrule')),
                ('counter', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='escalation_alerts', to='core.counter')),
                ('service_type', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='escalation_alerts', to='core.servicetype')),
            ],
            options={
                'ordering': ['-created_at'],
            },
        ),
    ]
