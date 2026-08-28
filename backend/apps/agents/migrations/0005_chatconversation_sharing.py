from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [("agents", "0004_replace_groq_source_with_gemini")]

    operations = [
        migrations.AddField(
            model_name="chatconversation",
            name="share_token",
            field=models.UUIDField(blank=True, editable=False, null=True, unique=True),
        ),
        migrations.AddField(
            model_name="chatconversation",
            name="shared_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
    ]
