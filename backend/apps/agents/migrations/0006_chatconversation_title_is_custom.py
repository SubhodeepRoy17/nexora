from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("agents", "0005_chatconversation_sharing"),
    ]

    operations = [
        migrations.AddField(
            model_name="chatconversation",
            name="title_is_custom",
            field=models.BooleanField(default=False),
        ),
    ]
