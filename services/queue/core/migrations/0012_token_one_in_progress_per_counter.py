from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0011_token_indexes'),
    ]

    operations = [
        migrations.AddConstraint(
            model_name='token',
            constraint=models.UniqueConstraint(
                condition=models.Q(status='IN_PROGRESS'),
                fields=['counter'],
                name='one_in_progress_per_counter',
            ),
        ),
    ]
