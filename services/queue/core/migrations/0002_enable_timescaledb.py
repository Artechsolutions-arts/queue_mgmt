from django.db import migrations


def enable_timescaledb(apps, schema_editor):
    if schema_editor.connection.vendor != 'postgresql':
        return
    with schema_editor.connection.cursor() as cursor:
        cursor.execute(
            "SELECT 1 FROM pg_available_extensions WHERE name = 'timescaledb';"
        )
        if cursor.fetchone() is None:
            return
    schema_editor.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;")


def noop_reverse(apps, schema_editor):
    # Extensions are intentionally not dropped on rollback.
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(enable_timescaledb, noop_reverse),
    ]
