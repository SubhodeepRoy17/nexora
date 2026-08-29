import django.db.models.deletion
import uuid
from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [
        ("agents", "0006_chatconversation_title_is_custom"),
        ("merchants", "0006_product_offer_and_image"),
    ]

    operations = [
        migrations.CreateModel(
            name="GrowthExperimentAssignment",
            fields=[
                ("assignment_id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("experiment_key", models.CharField(db_index=True, max_length=80)),
                ("variant", models.CharField(choices=[("CONTROL", "No add-on offer"), ("TREATMENT", "Eligible add-on offer")], db_index=True, max_length=12)),
                ("assignment_unit_hash", models.CharField(max_length=64)),
                ("eligibility_snapshot", models.JSONField(default=dict)),
                ("offers_shown", models.PositiveSmallIntegerField(default=0)),
                ("is_synthetic", models.BooleanField(db_index=True, default=False)),
                ("created_at", models.DateTimeField(auto_now_add=True)),
                ("eligible_addon_product", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="eligible_growth_experiment_assignments", to="merchants.product")),
                ("merchant", models.ForeignKey(on_delete=django.db.models.deletion.PROTECT, related_name="growth_experiment_assignments", to="merchants.merchant")),
                ("primary_decision", models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name="growth_experiment_assignment", to="agents.recommendationdecision")),
                ("session", models.OneToOneField(on_delete=django.db.models.deletion.PROTECT, related_name="growth_experiment_assignment", to="agents.agentsession")),
            ],
            options={"ordering": ["created_at"]},
        ),
        migrations.AddIndex(
            model_name="growthexperimentassignment",
            index=models.Index(fields=["merchant", "experiment_key", "variant", "is_synthetic"], name="agents_grow_merchan_a015a3_idx"),
        ),
        migrations.AddField(
            model_name="growthoffer",
            name="experiment_assignment",
            field=models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.PROTECT, related_name="offers", to="agents.growthexperimentassignment"),
        ),
    ]
