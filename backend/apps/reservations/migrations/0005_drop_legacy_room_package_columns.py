from django.db import migrations


LEGACY_ROOM_COLUMNS = (
    "package_name",
    "package_price",
)


def _get_table_columns(connection, table_name: str) -> set[str]:
    with connection.cursor() as cursor:
        description = connection.introspection.get_table_description(cursor, table_name)
    return {column.name for column in description}


def drop_legacy_room_package_columns(apps, schema_editor):
    table_name = "reservation_room"
    existing_columns = _get_table_columns(schema_editor.connection, table_name)
    quoted_table = schema_editor.quote_name(table_name)

    for column_name in LEGACY_ROOM_COLUMNS:
        if column_name not in existing_columns:
            continue

        quoted_column = schema_editor.quote_name(column_name)
        schema_editor.execute(f"ALTER TABLE {quoted_table} DROP COLUMN {quoted_column}")


class Migration(migrations.Migration):

    dependencies = [
        ("reservations", "0004_reservation_package_fields"),
    ]

    operations = [
        migrations.RunPython(
            code=drop_legacy_room_package_columns,
            reverse_code=migrations.RunPython.noop,
        ),
    ]

