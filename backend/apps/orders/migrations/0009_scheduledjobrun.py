import uuid

from django.db import migrations, models


class Migration(migrations.Migration):
    dependencies = [("orders", "0008_alter_moneyactionaudit_action_and_more")]

    operations = [
        migrations.CreateModel(
            name="ScheduledJobRun",
            fields=[
                ("run_id", models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ("job", models.CharField(choices=[("EXPIRE_CHECKOUTS", "Expire checkouts"), ("RECONCILE_RAZORPAY", "Reconcile Razorpay")], db_index=True, max_length=24)),
                ("status", models.CharField(choices=[("RUNNING", "Running"), ("SUCCEEDED", "Succeeded"), ("FAILED", "Failed")], db_index=True, default="RUNNING", max_length=12)),
                ("summary", models.JSONField(default=dict)),
                ("error_code", models.CharField(blank=True, max_length=80)),
                ("release_sha", models.CharField(blank=True, max_length=64)),
                ("started_at", models.DateTimeField(auto_now_add=True)),
                ("completed_at", models.DateTimeField(blank=True, null=True)),
            ],
            options={
                "ordering": ["-started_at"],
                "indexes": [models.Index(fields=["job", "status", "completed_at"], name="orders_sche_job_dd3aeb_idx")],
            },
        ),
    ]
