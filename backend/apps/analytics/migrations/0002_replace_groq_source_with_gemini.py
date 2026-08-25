from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("analytics", "0001_initial")]

    operations = [
        migrations.AlterField(
            model_name="agentsearchimpression",
            name="source",
            field=models.CharField(
                choices=[
                    ("GEMINI", "Gemini"),
                    ("GROQ", "Groq (legacy)"),
                    ("FALLBACK", "ORM fallback"),
                ],
                max_length=12,
            ),
        ),
    ]
