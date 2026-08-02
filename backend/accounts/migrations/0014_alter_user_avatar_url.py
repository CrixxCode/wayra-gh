from django.db import migrations, models


def cleanup_legacy_avatar_path(apps, schema_editor):
    User = apps.get_model("accounts", "User")
    User.objects.filter(avatar="avatars/default-avatar.png").update(avatar="")


class Migration(migrations.Migration):

    dependencies = [
        ("accounts", "0013_user_job_title"),
    ]

    operations = [
        migrations.AlterField(
            model_name="user",
            name="avatar",
            field=models.URLField(blank=True, default=""),
        ),
        migrations.RunPython(cleanup_legacy_avatar_path, migrations.RunPython.noop),
    ]
