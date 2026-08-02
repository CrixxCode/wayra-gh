# Generated manually to set default avatar for new and existing users without custom image.

from django.db import migrations, models


def set_default_avatar(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    User.objects.filter(models.Q(avatar__isnull=True) | models.Q(avatar='')).update(
        avatar='avatars/default-avatar.png'
    )


def unset_default_avatar(apps, schema_editor):
    User = apps.get_model('accounts', 'User')
    User.objects.filter(avatar='avatars/default-avatar.png').update(avatar=None)


class Migration(migrations.Migration):

    dependencies = [
        ('accounts', '0002_user_avatar'),
    ]

    operations = [
        migrations.AlterField(
            model_name='user',
            name='avatar',
            field=models.ImageField(
                blank=True,
                default='avatars/default-avatar.png',
                null=True,
                upload_to='avatars/',
            ),
        ),
        migrations.RunPython(set_default_avatar, unset_default_avatar),
    ]
