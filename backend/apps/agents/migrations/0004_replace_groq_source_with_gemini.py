from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("agents", "0003_chatconversation_agentsession_conversation_and_more")]

    operations = [
        migrations.AlterField(
            model_name="agentsession",
            name="provider_source",
            field=models.CharField(
                choices=[
                    ("GEMINI", "Gemini"),
                    ("GROQ", "Groq (legacy)"),
                    ("FALLBACK", "Deterministic fallback"),
                ],
                max_length=12,
            ),
        ),
    ]
