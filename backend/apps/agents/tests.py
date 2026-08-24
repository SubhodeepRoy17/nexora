from unittest.mock import patch

from django.test import SimpleTestCase
from pydantic import ValidationError

from .services import BuyerAgentResponse, ProductRecommendation, _ground_recommendations
from .tools import ProductSearchSchema, fallback_product_search


class ProductSearchSchemaTests(SimpleTestCase):
    def test_rejects_unknown_tool_arguments(self):
        with self.assertRaises(ValidationError):
            ProductSearchSchema(search_query="keyboard", unsupported_filter=True)

    def test_rejects_unknown_specification_keys(self):
        with self.assertRaises(ValidationError):
            ProductSearchSchema(search_query="keyboard", required_specs={"noise_score": 2})

    @patch("apps.agents.tools.search_merchant_products", return_value=[])
    def test_fallback_extracts_indian_currency_budget(self, search_mock):
        fallback_product_search("wireless keyboard under ₹8,000")
        arguments = search_mock.call_args.args[0]
        self.assertEqual(arguments.max_price, 8000)


class RecommendationGroundingTests(SimpleTestCase):
    def test_catalog_data_overrides_model_supplied_product_fields(self):
        response = BuyerAgentResponse(
            thought_process=["Compared catalog candidates."],
            recommendations=[
                ProductRecommendation(
                    product_id=7,
                    title="Invented title",
                    merchant="Invented merchant",
                    price=1,
                    match_score=91,
                    key_specs={},
                    reason="Matches the requested constraints.",
                )
            ],
            summary_reasoning="One grounded match.",
        )
        candidates = [
            {
                "id": 7,
                "title": "Keychron K2 Pro",
                "price": "7999.00",
                "merchant": {"name": "Verified Keyboards"},
                "specifications": {"switches": "Brown tactile"},
            }
        ]

        grounded = _ground_recommendations(response, candidates)

        self.assertEqual(grounded.recommendations[0].title, "Keychron K2 Pro")
        self.assertEqual(grounded.recommendations[0].price, 7999.0)
        self.assertEqual(grounded.recommendations[0].stock_quantity, 0)
