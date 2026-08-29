from django.db import migrations, models
import django.core.validators


class Migration(migrations.Migration):
    dependencies = [("merchants", "0005_product_is_demo_product_source_license_and_more")]

    operations = [
        migrations.AddField(
            model_name="product",
            name="compare_at_price",
            field=models.DecimalField(
                blank=True,
                decimal_places=2,
                help_text="Optional reference price; checkout always charges price.",
                max_digits=12,
                null=True,
                validators=[django.core.validators.MinValueValidator(0)],
            ),
        ),
        migrations.AddField(
            model_name="product",
            name="image_url",
            field=models.URLField(blank=True, max_length=1000),
        ),
    ]
