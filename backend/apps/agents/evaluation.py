"""Reproducible, rollback-only evaluation for buyer recommendations and growth offers."""

import hashlib
import json
import math
import platform
import statistics
import time
from dataclasses import dataclass
from datetime import date
from decimal import Decimal
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch

import django
from django.conf import settings
from django.contrib.auth import get_user_model
from django.db import connection, transaction
from django.test import override_settings

from apps.merchants.models import Merchant, Product, ProductRelationship
from apps.merchants.vector_setup import vector_index_available

from .services import AgentServiceError, run_buyer_agent


DATASET_VERSION = "p06-buyer-intents-v1"
CATALOG_VERSION = "p06-catalog-v1"
MINIMUM_SCENARIOS = 50
QUALITY_THRESHOLDS = {
    "constraint_satisfaction_percent": 95.0,
    "catalog_groundedness_percent": 100.0,
    "top_k_relevance_percent": 95.0,
    "correct_no_result_percent": 100.0,
    "addon_compatibility_percent": 100.0,
    "fallback_success_percent": 95.0,
    "unsupported_claim_rate_percent": 0.0,
}


CATALOG = {
    "nomad_keyboard": {
        "title": "Eval Nomad 75 Keyboard",
        "description": "Quiet wireless mechanical keyboard for coding, travel, and portable work.",
        "category": "Keyboards",
        "price": "7499.00",
        "stock_quantity": 12,
        "rating": 4.9,
        "specifications": {
            "switches": "Silent tactile", "connectivity": ["Bluetooth 5.1", "USB-C"],
            "battery_life_hours": 180.0, "layout": "75%", "keycaps": "PBT",
            "hot_swappable": True, "color": "Black", "warranty_months": 24,
        },
        "tags": ["keyboard", "quiet", "wireless", "travel", "coding", "portable"],
    },
    "budget_keyboard": {
        "title": "Eval Everyday Keyboard",
        "description": "Affordable white wired keyboard for everyday home use.",
        "category": "Keyboards",
        "price": "2499.00",
        "stock_quantity": 20,
        "rating": 4.2,
        "specifications": {
            "switches": "Membrane", "connectivity": ["USB-C"], "layout": "Full size",
            "hot_swappable": False, "color": "White", "warranty_months": 12,
        },
        "tags": ["keyboard", "budget", "wired", "home"],
    },
    "office_keyboard": {
        "title": "Eval Office TKL Keyboard",
        "description": "Quiet white tenkeyless wireless keyboard for office productivity.",
        "category": "Keyboards",
        "price": "6799.00",
        "stock_quantity": 8,
        "rating": 4.6,
        "specifications": {
            "switches": "Quiet tactile", "connectivity": ["Bluetooth 5.1", "USB-C"],
            "battery_life_hours": 150.0, "layout": "TKL", "keycaps": "PBT",
            "hot_swappable": True, "color": "White", "warranty_months": 12,
        },
        "tags": ["keyboard", "office", "quiet", "wireless", "productivity"],
    },
    "basic_phone": {
        "title": "Eval Metro Smartphone",
        "description": "Affordable black smartphone for calls, messaging, and commuting.",
        "category": "Smartphones",
        "price": "9999.00", "stock_quantity": 14, "rating": 4.4,
        "specifications": {"color": "Black", "warranty_months": 12},
        "tags": ["smartphone", "phone", "budget", "commute"],
    },
    "pro_phone": {
        "title": "Eval Horizon Smartphone",
        "description": "Blue premium smartphone for photography and fast mobile work.",
        "category": "Smartphones",
        "price": "24999.00", "stock_quantity": 9, "rating": 4.8,
        "specifications": {"color": "Blue", "warranty_months": 24},
        "tags": ["smartphone", "phone", "camera", "premium", "work"],
    },
    "silver_laptop": {
        "title": "Eval Swift Laptop",
        "description": "Silver portable laptop for students, coding, and office work.",
        "category": "Laptops",
        "price": "49999.00", "stock_quantity": 7, "rating": 4.7,
        "specifications": {"color": "Silver", "warranty_months": 24},
        "tags": ["laptop", "portable", "student", "coding", "office"],
    },
    "black_laptop": {
        "title": "Eval Studio Laptop",
        "description": "Black high-performance laptop for creators and demanding development.",
        "category": "Laptops",
        "price": "79999.00", "stock_quantity": 5, "rating": 4.9,
        "specifications": {"color": "Black", "warranty_months": 36},
        "tags": ["laptop", "creator", "development", "performance"],
    },
    "tablet": {
        "title": "Eval Slate Tablet",
        "description": "Silver tablet for reading, media, notes, and light travel.",
        "category": "Tablets",
        "price": "15999.00", "stock_quantity": 11, "rating": 4.5,
        "specifications": {"color": "Silver", "warranty_months": 12},
        "tags": ["tablet", "reading", "notes", "travel", "media"],
    },
    "backpack": {
        "title": "Eval Commuter Laptop Backpack",
        "description": "Black water-resistant backpack that protects a laptop while commuting.",
        "category": "Laptop Backpacks",
        "price": "1999.00", "stock_quantity": 18, "rating": 4.6,
        "specifications": {"color": "Black", "material": "Recycled nylon", "warranty_months": 12},
        "tags": ["backpack", "laptop", "commute", "travel", "protection"],
    },
    "mouse": {
        "title": "Eval Quiet Wireless Mouse",
        "description": "Compact black quiet wireless mouse for travel and office work.",
        "category": "Computer Mice",
        "price": "1299.00", "stock_quantity": 17, "rating": 4.5,
        "specifications": {"color": "Black", "warranty_months": 12},
        "tags": ["mouse", "quiet", "wireless", "travel", "office"],
    },
    "travel_case": {
        "title": "Eval Nomad 75 Travel Case",
        "description": "Black fitted protective case for the Eval Nomad 75 keyboard.",
        "category": "Keyboard Accessories",
        "price": "999.00", "stock_quantity": 15, "rating": 4.7,
        "specifications": {"color": "Black", "material": "Recycled felt", "warranty_months": 6},
        "tags": ["keyboard", "case", "travel", "protection"],
    },
    "wrist_rest": {
        "title": "Eval Full-Size Wrist Rest",
        "description": "Full-size keyboard wrist support, incompatible with a 75% layout.",
        "category": "Keyboard Accessories",
        "price": "899.00", "stock_quantity": 10, "rating": 4.3,
        "specifications": {"color": "Black", "material": "Memory foam", "warranty_months": 6},
        "tags": ["keyboard", "wrist-rest", "full-size"],
    },
    "organizer": {
        "title": "Eval Cable Organizer",
        "description": "Travel cable organizer intentionally kept out of stock.",
        "category": "Keyboard Accessories",
        "price": "399.00", "stock_quantity": 0, "rating": 4.1,
        "specifications": {"color": "Black", "material": "Nylon"},
        "tags": ["cable", "organizer", "travel"],
    },
}


@dataclass
class EvaluationCatalog:
    merchant: Merchant
    products: dict[str, Product]


class EvaluationDatasetError(ValueError):
    pass


class _EvaluationGeminiClient:
    """Deterministic provider double; server grounding still executes unchanged."""

    def __init__(self, scenario):
        self.scenario = scenario
        self.models = self

    def generate_content(self, **kwargs):
        contents = kwargs.get("contents", "")
        if (
            "Bounded conversation history:" in contents
            and "Latest shopper message:" in contents
        ):
            return SimpleNamespace(
                text=json.dumps(
                    {
                        "turn_type": "SHOPPING_SEARCH",
                        "response": "I will search the bounded catalog using those requirements.",
                        "search_query": self.scenario["intent"],
                    }
                ),
                function_calls=[],
            )

        if "Authoritative catalog diagnostics:" in contents:
            reason = self.scenario.get("expected_reason", "COMBINATION_UNAVAILABLE")
            payload = {
                "summary_reasoning": (
                    f"No catalog product satisfies this request. Server diagnostics identify {reason}; "
                    "change the stated constraint and try again."
                ),
                "suggested_query": "Show the closest active in-stock catalog alternatives",
            }
            return SimpleNamespace(text=json.dumps(payload), function_calls=[])

        marker = "return the grounded recommendation object:\n"
        if marker not in contents:
            raise EvaluationDatasetError(
                "The deterministic Gemini double received an unsupported prompt contract."
            )
        candidates = json.loads(contents.split(marker, 1)[1])
        recommendations = [
            {
                "product_id": item["id"],
                "title": "Untrusted model title",
                "merchant": "Untrusted model merchant",
                "price": 0.0,
                "category": "Untrusted model category",
                "stock_quantity": 0,
                "rating": 0.0,
                "match_score": max(70, 94 - index),
                "key_specs": {},
                "reason": "Selected from the bounded server-provided candidate set.",
                "tradeoffs": [],
            }
            for index, item in enumerate(candidates[:3])
        ]
        payload = {
            "thought_process": ["Compared only the bounded catalog candidates."],
            "primary_recommendation_id": recommendations[0]["product_id"] if recommendations else None,
            "recommendations": recommendations,
            "add_on_suggestions": [],
            "summary_reasoning": "Grounded comparison of active in-stock catalog candidates.",
        }
        return SimpleNamespace(text=json.dumps(payload), function_calls=[])

    def close(self):
        return None


def load_dataset(path: Path, *, minimum_scenarios=MINIMUM_SCENARIOS):
    payload = json.loads(path.read_text(encoding="utf-8"))
    if payload.get("version") != DATASET_VERSION:
        raise EvaluationDatasetError(f"Dataset version must be {DATASET_VERSION}.")
    scenarios = payload.get("scenarios")
    if not isinstance(scenarios, list) or len(scenarios) < minimum_scenarios:
        raise EvaluationDatasetError(f"Dataset must contain at least {minimum_scenarios} scenarios.")
    identifiers = [item.get("id") for item in scenarios]
    if len(set(identifiers)) != len(identifiers) or any(not item for item in identifiers):
        raise EvaluationDatasetError("Every scenario ID must be non-empty and unique.")
    for scenario in scenarios:
        if not isinstance(scenario.get("intent"), str) or not scenario["intent"].strip():
            raise EvaluationDatasetError(f"Scenario {scenario['id']} has no buyer intent.")
        if not isinstance(scenario.get("relevant"), list):
            raise EvaluationDatasetError(f"Scenario {scenario['id']} has no relevance labels.")
        unknown = set(scenario["relevant"] + scenario.get("expected_addons", []) + scenario.get("forbidden_addons", [])) - set(CATALOG)
        if unknown:
            raise EvaluationDatasetError(f"Scenario {scenario['id']} references unknown fixtures: {sorted(unknown)}")
    return payload


def _create_catalog() -> EvaluationCatalog:
    Product.objects.update(is_active=False)
    username = "nexora-p06-evaluation-owner"
    owner = get_user_model().objects.create_user(username=username)
    merchant = Merchant.objects.create(
        owner=owner,
        name="Nexora P0.6 Evaluation Merchant",
        email="p06-evaluation@nexora.invalid",
    )
    products = {}
    for key, fixture in CATALOG.items():
        product = Product.objects.create(
            merchant=merchant,
            source_name="Nexora P0.6 versioned evaluation fixture",
            source_license="CC0-1.0",
            is_demo=True,
            is_active=True,
            **fixture,
        )
        products[key] = product

    ProductRelationship.objects.create(
        source_product=products["nomad_keyboard"],
        related_product=products["travel_case"],
        relationship_type=ProductRelationship.Kind.ACCESSORY,
        compatibility={"source_specs": {"layout": "75%"}},
        benefit="Protects the catalog-listed 75% keyboard while travelling.",
        trade_off="Adds one basket line and ₹999 to the exact quote.",
        offer_label="Fitted travel companion",
        priority=1,
    )
    ProductRelationship.objects.create(
        source_product=products["nomad_keyboard"],
        related_product=products["wrist_rest"],
        relationship_type=ProductRelationship.Kind.COMPLEMENT,
        compatibility={"source_specs": {"layout": "Full size"}},
        benefit="Supports full-size keyboards.",
        trade_off="Does not fit the selected 75% layout.",
        offer_label="Layout-specific support",
        priority=2,
    )
    # Create an inactive relationship to an unavailable product so the evaluator
    # proves that stock and relationship state suppress the offer.
    ProductRelationship.objects.create(
        source_product=products["nomad_keyboard"],
        related_product=products["organizer"],
        relationship_type=ProductRelationship.Kind.COMPLEMENT,
        compatibility={"source_specs": {"layout": "75%"}},
        benefit="Organizes the travel cable.",
        trade_off="Currently unavailable.",
        offer_label="Cable companion",
        priority=3,
        is_active=False,
    )
    return EvaluationCatalog(merchant=merchant, products=products)


def _percent(numerator, denominator):
    return round((numerator / denominator) * 100, 2) if denominator else 100.0


def _percentile(values, percentile):
    if not values:
        return 0.0
    ordered = sorted(values)
    index = max(0, math.ceil((percentile / 100) * len(ordered)) - 1)
    return round(ordered[index], 2)


def _evaluate_case(scenario, result, catalog, pathway, latency_ms):
    by_id = {product.pk: (key, product) for key, product in catalog.products.items()}
    recommendations = result.get("recommendations", [])
    recommendation_keys = [by_id[item["product_id"]][0] for item in recommendations if item.get("product_id") in by_id]
    expected_no_result = scenario.get("expected_no_result", False)
    constraints = scenario.get("constraints", {})

    constraints_ok = True
    for item in recommendations:
        product_entry = by_id.get(item.get("product_id"))
        if not product_entry:
            constraints_ok = False
            continue
        product = product_entry[1]
        product_price = Decimal(str(product.price))
        if constraints.get("category") and product.category != constraints["category"]:
            constraints_ok = False
        if constraints.get("max_price") is not None and product_price > Decimal(str(constraints["max_price"])):
            constraints_ok = False
        if constraints.get("color") and product.specifications.get("color") != constraints["color"]:
            constraints_ok = False

    unsupported = 0
    for item in recommendations:
        product_entry = by_id.get(item.get("product_id"))
        if not product_entry:
            unsupported += 1
            continue
        product = product_entry[1]
        product_price = Decimal(str(product.price))
        if any((
            item.get("title") != product.title,
            item.get("merchant") != catalog.merchant.name,
            Decimal(str(item.get("price"))) != product_price,
            item.get("category") != product.category,
            item.get("stock_quantity") != product.stock_quantity,
            item.get("key_specs") != product.specifications,
        )):
            unsupported += 1
    grounded = unsupported == 0
    relevant = scenario["relevant"]
    relevance_ok = expected_no_result or bool(set(recommendation_keys) & set(relevant))
    no_result_ok = (not recommendations) == expected_no_result
    if expected_no_result and scenario.get("expected_reason"):
        reasons = [item.get("code") for item in result.get("no_result", {}).get("reasons", [])]
        no_result_ok = no_result_ok and scenario["expected_reason"] in reasons

    addon_keys = [
        by_id[item["product_id"]][0]
        for item in result.get("add_on_suggestions", [])
        if item.get("product_id") in by_id
    ]
    expected_addons = scenario.get("expected_addons", [])
    forbidden_addons = scenario.get("forbidden_addons", [])
    addon_evaluated = scenario.get("check_addons", True)
    addon_ok = (
        True
        if not addon_evaluated
        else set(addon_keys) == set(expected_addons) and not (set(addon_keys) & set(forbidden_addons))
    )
    source_ok = result.get("_audit_context", {}).get("provider_source") == pathway
    core_success = all((constraints_ok, grounded, relevance_ok, no_result_ok, addon_ok, source_ok))
    return {
        "id": scenario["id"],
        "tags": scenario.get("tags", []),
        "pathway": pathway,
        "latency_ms": round(latency_ms, 2),
        "recommendations": recommendation_keys,
        "addons": addon_keys,
        "constraint_satisfied": constraints_ok,
        "catalog_grounded": grounded,
        "unsupported_claims": unsupported,
        "recommendation_claim_sets": len(recommendations),
        "top_k_relevant": relevance_ok,
        "no_result_correct": no_result_ok,
        "addon_evaluated": addon_evaluated,
        "addon_compatible": addon_ok,
        "source_correct": source_ok,
        "success": core_success,
    }


def _aggregate(cases):
    recommendation_cases = [case for case in cases if "no_result" not in case["tags"]]
    addon_cases = [case for case in cases if case["addon_evaluated"]]
    claim_sets = sum(case["recommendation_claim_sets"] for case in cases)
    unsupported = sum(case["unsupported_claims"] for case in cases)
    return {
        "scenario_count": len(cases),
        "constraint_satisfaction_percent": _percent(sum(case["constraint_satisfied"] for case in cases), len(cases)),
        "catalog_groundedness_percent": _percent(sum(case["catalog_grounded"] for case in cases), len(cases)),
        "top_k_relevance_percent": _percent(sum(case["top_k_relevant"] for case in recommendation_cases), len(recommendation_cases)),
        "unsupported_claim_rate_percent": _percent(unsupported, claim_sets) if claim_sets else 0.0,
        "correct_no_result_percent": _percent(sum(case["no_result_correct"] for case in cases), len(cases)),
        "addon_compatibility_percent": _percent(sum(case["addon_compatible"] for case in addon_cases), len(addon_cases)),
        "success_percent": _percent(sum(case["success"] for case in cases), len(cases)),
        "latency_ms": {
            "p50": round(statistics.median(case["latency_ms"] for case in cases), 2),
            "p95": _percentile([case["latency_ms"] for case in cases], 95),
        },
    }


def evaluate_dataset(dataset, *, dataset_path):
    cases = []
    pgvector_enabled = False
    with transaction.atomic(), override_settings(GROWTH_MAX_ADDON_OFFERS=2):
        catalog = _create_catalog()
        pgvector_enabled = vector_index_available()
        for scenario in dataset["scenarios"]:
            for pathway in ("GEMINI", "FALLBACK"):
                provider = (
                    patch("apps.agents.services._gemini_client", return_value=_EvaluationGeminiClient(scenario))
                    if pathway == "GEMINI"
                    else patch("apps.agents.services._gemini_client", side_effect=AgentServiceError("forced evaluation outage"))
                )
                with provider:
                    started = time.perf_counter()
                    result = run_buyer_agent(scenario["intent"])
                    latency_ms = (time.perf_counter() - started) * 1000
                cases.append(_evaluate_case(scenario, result, catalog, pathway, latency_ms))
        transaction.set_rollback(True)

    pathways = {
        pathway: _aggregate([case for case in cases if case["pathway"] == pathway])
        for pathway in ("GEMINI", "FALLBACK")
    }
    fallback = pathways["FALLBACK"]
    metrics = {
        "constraint_satisfaction_percent": min(value["constraint_satisfaction_percent"] for value in pathways.values()),
        "catalog_groundedness_percent": min(value["catalog_groundedness_percent"] for value in pathways.values()),
        "top_k_relevance_percent": min(value["top_k_relevance_percent"] for value in pathways.values()),
        "unsupported_claim_rate_percent": max(value["unsupported_claim_rate_percent"] for value in pathways.values()),
        "correct_no_result_percent": min(value["correct_no_result_percent"] for value in pathways.values()),
        "addon_compatibility_percent": min(value["addon_compatibility_percent"] for value in pathways.values()),
        "fallback_success_percent": fallback["success_percent"],
    }
    dataset_bytes = Path(dataset_path).read_bytes()
    coverage = {}
    for scenario in dataset["scenarios"]:
        for tag in scenario.get("tags", []):
            coverage[tag] = coverage.get(tag, 0) + 1
    return {
        "report_version": "p06-report-v1",
        "generated_on": date.today().isoformat(),
        "dataset": {
            "version": dataset["version"],
            "scenario_count": len(dataset["scenarios"]),
            "sha256": hashlib.sha256(dataset_bytes).hexdigest(),
            "synthetic": True,
            "coverage": dict(sorted(coverage.items())),
        },
        "catalog_version": CATALOG_VERSION,
        "environment": {
            "python": platform.python_version(),
            "django": django.get_version(),
            "database": connection.vendor,
            "pgvector_available": pgvector_enabled,
            "gemini_mode": "deterministic provider double; no network request",
            "fallback_mode": "forced AgentServiceError through production fallback",
        },
        "metrics": metrics,
        "pathways": pathways,
        "thresholds": QUALITY_THRESHOLDS,
        "thresholds_passed": all(
            metrics[name] <= threshold if name == "unsupported_claim_rate_percent" else metrics[name] >= threshold
            for name, threshold in QUALITY_THRESHOLDS.items()
        ),
        "cases": cases,
    }


def render_markdown(report):
    metrics = report["metrics"]
    gemini = report["pathways"]["GEMINI"]
    fallback = report["pathways"]["FALLBACK"]
    failures = [case for case in report["cases"] if not case["success"]]
    representative = failures[:5]
    if not representative:
        for tag in ("no_result", "prompt_injection", "out_of_stock_addon", "incompatible_addon", "gemini_failure"):
            match = next((
                case for case in report["cases"]
                if tag in case["tags"] and (case["pathway"] == "FALLBACK" or tag != "gemini_failure")
            ), None)
            if match:
                representative.append(match)
    status = "PASS" if report["thresholds_passed"] else "FAIL"
    lines = [
        "# Nexora Recommendation and Growth Evaluation",
        "",
        f"Generated on {report['generated_on']} by the versioned P0.6 evaluator. Overall gate: **{status}**.",
        "",
        "## Reproduce",
        "",
        "```bash",
        "cd backend",
        "python manage.py evaluate_agent",
        "```",
        "",
        "The command creates an isolated synthetic catalog inside one transaction, runs both pathways, writes this report and `docs/evaluation/results.json`, then rolls back every catalog and analytics write.",
        "",
        "## Environment and data",
        "",
        f"- Dataset: `{report['dataset']['version']}` with {report['dataset']['scenario_count']} synthetic buyer intents (`sha256:{report['dataset']['sha256']}`).",
        f"- Catalog: `{report['catalog_version']}`; database `{report['environment']['database']}`; pgvector available: `{str(report['environment']['pgvector_available']).lower()}`.",
        f"- Runtime: Python {report['environment']['python']}, Django {report['environment']['django']}.",
        "- Coverage counts: " + ", ".join(f"`{key}`={value}" for key, value in report["dataset"]["coverage"].items()) + ".",
        "- Gemini pathway: deterministic provider double followed by the production grounding and growth-policy code; no external model/network latency is claimed.",
        "- Fallback pathway: a forced provider failure followed by the production deterministic fallback.",
        "",
        "## Measured results",
        "",
        "| Metric | Result | Denominator / meaning |",
        "| --- | ---: | --- |",
        f"| Constraint satisfaction | {metrics['constraint_satisfaction_percent']:.2f}% | Cases whose returned products satisfy explicit category, maximum-price, and color constraints |",
        f"| Catalog groundedness | {metrics['catalog_groundedness_percent']:.2f}% | Cases with no structured recommendation fact differing from the database snapshot |",
        f"| Top-3 relevance | {metrics['top_k_relevance_percent']:.2f}% | Non-no-result cases containing at least one labelled relevant product in the first three results |",
        f"| Unsupported structured-claim rate | {metrics['unsupported_claim_rate_percent']:.2f}% | Recommendation fact bundles with any invented ID/title/merchant/price/category/stock/spec value |",
        f"| Correct no-result behavior | {metrics['correct_no_result_percent']:.2f}% | All cases correctly returning results or a reason-coded empty response |",
        f"| Add-on compatibility/refusal | {metrics['addon_compatibility_percent']:.2f}% | Labelled add-on cases returning exactly eligible products and withholding incompatible/out-of-stock/budget-breaking offers |",
        f"| Forced-failure fallback success | {metrics['fallback_success_percent']:.2f}% | Fallback cases satisfying every constraint, grounding, relevance/refusal, add-on, and source check |",
        "",
        "| Pathway | Scenarios | p50 | p95 | Success |",
        "| --- | ---: | ---: | ---: | ---: |",
        f"| Gemini orchestration (provider double) | {gemini['scenario_count']} | {gemini['latency_ms']['p50']:.2f} ms | {gemini['latency_ms']['p95']:.2f} ms | {gemini['success_percent']:.2f}% |",
        f"| Forced Gemini failure → fallback | {fallback['scenario_count']} | {fallback['latency_ms']['p50']:.2f} ms | {fallback['latency_ms']['p95']:.2f} ms | {fallback['success_percent']:.2f}% |",
        "",
        "Latency measures local application/database execution. It excludes public-network Gemini latency and must not be presented as model-provider performance.",
        "",
        "## Representative failures and safe refusals",
        "",
    ]
    for case in representative:
        lines.append(
            f"- `{case['id']}` / `{case['pathway']}`: "
            f"{'passed the expected safe behavior' if case['success'] else 'FAILED one or more expectations'}; "
            f"recommendations={case['recommendations']}, add-ons={case['addons']}."
        )
    lines.extend([
        "",
        "## Analytics denominators and claim boundary",
        "",
        "Merchant analytics definitions are versioned in `docs/Analytics.md`. Real buyer traffic and synthetic/demo traffic are separate segments. Paid add-on revenue is recorded attribution from verified paid order lines, not an estimate of causal revenue lift. This evaluation measures catalog quality and refusal safety; it does not measure buyer behavior or incremental lift.",
        "",
        "## Limitations",
        "",
        "- The intent labels and catalog are synthetic and deliberately bounded; they are not a population-representative relevance benchmark.",
        "- The reproducible Gemini pathway uses a deterministic provider double, so live model wording quality, availability, token usage, and network latency remain unmeasured.",
        "- Top-k relevance is labelled-product recall, not human preference or normalized discounted cumulative gain.",
        "- Unsupported-claim rate covers structured product facts that Nexora can verify; subjective prose quality still requires human review.",
        "- Revenue metrics remain observational attribution. No causal merchant revenue-growth claim is supported by this report.",
        "",
    ])
    return "\n".join(lines)
