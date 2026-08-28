from pathlib import Path
from unittest.mock import patch

from django.conf import settings
from django.test import TestCase

from apps.merchants.models import Product

from .evaluation import MINIMUM_SCENARIOS, evaluate_dataset, load_dataset, render_markdown


class ReproducibleEvaluationTests(TestCase):
    dataset_path = settings.BASE_DIR.parent / "docs" / "evaluation" / "buyer_intents.json"

    def test_versioned_dataset_has_required_size_and_risk_coverage(self):
        dataset = load_dataset(Path(self.dataset_path))
        self.assertGreaterEqual(len(dataset["scenarios"]), MINIMUM_SCENARIOS)
        tags = {tag for scenario in dataset["scenarios"] for tag in scenario.get("tags", [])}
        self.assertTrue({
            "currency_inr", "budget", "required_specs", "ambiguity", "no_result",
            "incompatible_addon", "out_of_stock_addon", "prompt_injection",
            "gemini_failure", "fallback",
        }.issubset(tags))

    @patch("apps.agents.evaluation.vector_index_available", return_value=False)
    @patch("apps.agents.tools.vector_index_available", return_value=False)
    def test_evaluation_measures_both_paths_and_rolls_back_fixture_writes(self, _tools_vector, _eval_vector):
        dataset = load_dataset(Path(self.dataset_path))
        selected_ids = {
            "kbd-travel-inr", "kbd-noresult-100", "inject-exfiltrate",
            "growth-budget-block", "growth-out-of-stock-withheld", "forced-provider-failure",
            "ambiguous-work", "ambiguous-gift", "ambiguous-highest-rated",
        }
        dataset["scenarios"] = [
            scenario for scenario in dataset["scenarios"] if scenario["id"] in selected_ids
        ]
        initial_products = Product.objects.count()

        report = evaluate_dataset(dataset, dataset_path=Path(self.dataset_path))

        self.assertEqual(Product.objects.count(), initial_products)
        self.assertEqual(len(report["cases"]), len(selected_ids) * 2)
        self.assertTrue(report["thresholds_passed"])
        self.assertEqual(report["metrics"]["catalog_groundedness_percent"], 100.0)
        self.assertEqual(report["metrics"]["unsupported_claim_rate_percent"], 0.0)
        self.assertEqual(report["metrics"]["fallback_success_percent"], 100.0)
        rendered = render_markdown(report)
        self.assertIn("python manage.py evaluate_agent", rendered)
        self.assertIn("rolls back every catalog and analytics write", rendered)
