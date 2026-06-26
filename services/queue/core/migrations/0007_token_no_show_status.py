from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0006_patient'),
    ]

    operations = [
        migrations.AlterField(
            model_name='token',
            name='status',
            field=models.CharField(
                choices=[
                    ('WAITING', 'Waiting'),
                    ('IN_PROGRESS', 'In Progress'),
                    ('COMPLETED', 'Completed'),
                    ('NO_SHOW', 'No Show'),
                    ('CANCELLED', 'Cancelled'),
                ],
                default='WAITING',
                max_length=20,
            ),
        ),
    ]
