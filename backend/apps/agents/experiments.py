import hashlib
import hmac

from django.conf import settings

from .models import GrowthExperimentAssignment


def assign_growth_experiment(*, session, primary_decision, suggestions):
    """Assign one eligible agent session without consulting model output for the arm.

    HMAC bucketing is deterministic, uniformly distributed, auditable without
    exposing the Django secret, and evaluated only after deterministic add-on
    eligibility has been established.
    """

    if not settings.GROWTH_EXPERIMENT_ENABLED or not suggestions:
        return None, True

    experiment_key = settings.GROWTH_EXPERIMENT_KEY
    unit = f"agent-session:{session.session_id}"
    digest = hmac.new(
        str(settings.SECRET_KEY).encode(),
        f"{experiment_key}:{unit}".encode(),
        hashlib.sha256,
    ).hexdigest()
    bucket = int(digest[:8], 16) % 10_000
    variant = (
        GrowthExperimentAssignment.Variant.TREATMENT
        if bucket < settings.GROWTH_EXPERIMENT_TREATMENT_BPS
        else GrowthExperimentAssignment.Variant.CONTROL
    )
    first = suggestions[0]
    assignment = GrowthExperimentAssignment.objects.create(
        session=session,
        primary_decision=primary_decision,
        merchant=primary_decision.product.merchant,
        eligible_addon_product_id=first["product_id"],
        experiment_key=experiment_key,
        variant=variant,
        assignment_unit_hash=hashlib.sha256(unit.encode()).hexdigest(),
        eligibility_snapshot={
            "primary_product_id": primary_decision.product_id,
            "eligible_addon_product_ids": [item["product_id"] for item in suggestions],
            "eligible_offer_count": len(suggestions),
            "randomization_unit": "agent_session",
            "treatment_basis_points": settings.GROWTH_EXPERIMENT_TREATMENT_BPS,
        },
    )
    return assignment, variant == GrowthExperimentAssignment.Variant.TREATMENT
