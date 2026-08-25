from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def assign_legacy_owners(apps, schema_editor):
    Merchant = apps.get_model("merchants", "Merchant")
    app_label, model_name = settings.AUTH_USER_MODEL.split(".")
    User = apps.get_model(app_label, model_name)

    for merchant in Merchant.objects.filter(owner__isnull=True).iterator():
        username = f"legacy_merchant_{merchant.pk}"
        suffix = 1
        while User.objects.filter(username=username).exists():
            suffix += 1
            username = f"legacy_merchant_{merchant.pk}_{suffix}"
        user = User(username=username, email=merchant.email, is_active=True)
        user.set_unusable_password()
        user.save()
        merchant.owner_id = user.pk
        merchant.save(update_fields=["owner"])


class Migration(migrations.Migration):
    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ("merchants", "0002_productembedding_and_more"),
    ]

    operations = [
        migrations.AddField(
            model_name="merchant",
            name="owner",
            field=models.OneToOneField(
                null=True,
                on_delete=django.db.models.deletion.PROTECT,
                related_name="merchant_profile",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
        migrations.RunPython(assign_legacy_owners, migrations.RunPython.noop),
        migrations.AlterField(
            model_name="merchant",
            name="owner",
            field=models.OneToOneField(
                on_delete=django.db.models.deletion.PROTECT,
                related_name="merchant_profile",
                to=settings.AUTH_USER_MODEL,
            ),
        ),
    ]
