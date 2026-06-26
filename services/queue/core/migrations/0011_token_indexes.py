from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0010_doctor'),
    ]

    operations = [
        # phone_number is a hot lookup in call_next (busy_phones),
        # duplicate-registration checks, and notification event routing.
        migrations.AlterField(
            model_name='token',
            name='phone_number',
            field=models.CharField(max_length=20, db_index=True),
        ),
        # status is filtered on in virtually every queue query (WAITING, IN_PROGRESS).
        migrations.AlterField(
            model_name='token',
            name='status',
            field=models.CharField(
                max_length=20,
                db_index=True,
                default='WAITING',
                choices=[
                    ('WAITING', 'Waiting'),
                    ('IN_PROGRESS', 'In Progress'),
                    ('COMPLETED', 'Completed'),
                    ('NO_SHOW', 'No Show'),
                    ('CANCELLED', 'Cancelled'),
                ],
            ),
        ),
    ]
