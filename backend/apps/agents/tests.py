import json
import os
from types import SimpleNamespace
from unittest.mock import patch

from django.contrib.auth import get_user_model
from django.test import SimpleTestCase, TestCase
from django.urls import reverse
from google.genai import errors as genai_errors
from pydantic import ValidationError
from rest_framework.test import APIClient

from apps.merchants.models import Merchant, Product

from .models import AgentSession, ChatConversation
from .services import (
    BuyerAgentResponse,
    ProductRecommendation,
    _extract_tool_call,
    _fallback_response,
    _ground_recommendations,
    _gemini_client,
    _model_name,
    _parse_recommendations,
    _thinking_config,
    run_buyer_agent,
)
from .tools import ProductSearchSchema, deterministic_search_arguments, fallback_product_search


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

    def test_deterministic_parser_handles_natural_backpack_budget_phrase(self):
        arguments = deterministic_search_arguments("Backpack under worth of 6000")

        self.assertEqual(arguments.category, "Laptop Backpacks")
        self.assertEqual(arguments.max_price, 6000)

    @patch("apps.agents.services._record_search")
    @patch("apps.agents.services.fallback_product_search")
    def test_fallback_summary_describes_matches_instead_of_provider_failure(
        self, product_search, _record_search
    ):
        product_search.return_value = [{
            "id": 7,
            "title": "Quiet Keyboard",
            "merchant": {"name": "Catalog Merchant"},
            "price": "7499.00",
            "category": "Keyboards",
            "stock_quantity": 4,
            "rating": 4.8,
            "specifications": {"layout": "75%"},
        }]

        response = _fallback_response("quiet keyboard under 8000", "provider request failed")

        self.assertIn("active, in-stock catalog option", response.summary_reasoning.lower())
        self.assertIn("in keyboards", response.summary_reasoning.lower())
        self.assertIn("₹8,000 budget", response.summary_reasoning)
        self.assertNotIn("fallback", response.summary_reasoning.lower())


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


class GeminiProviderTests(SimpleTestCase):
    @patch.dict(os.environ, {"GEMINI_MODEL": "gemini-test-model"})
    def test_model_name_uses_gemini_environment(self):
        self.assertEqual(_model_name(), "gemini-test-model")

    @patch.dict(os.environ, {"GEMINI_THINKING_LEVEL": "low"})
    def test_latency_sensitive_search_uses_low_thinking(self):
        self.assertEqual(_thinking_config().thinking_level.value, "LOW")

    @patch.dict(os.environ, {"GEMINI_THINKING_LEVEL": "unsupported"})
    def test_invalid_thinking_level_fails_safe_to_low(self):
        self.assertEqual(_thinking_config().thinking_level.value, "LOW")

    @patch("apps.agents.services.genai.Client")
    @patch.dict(
        os.environ,
        {
            "GEMINI_API_KEY": "test-only-key",
            "GEMINI_REQUEST_TIMEOUT_MS": "25000",
            "GEMINI_RETRY_ATTEMPTS": "1",
        },
    )
    def test_client_has_bounded_interactive_timeout_and_retries(self, client_class):
        _gemini_client()

        options = client_class.call_args.kwargs["http_options"]
        self.assertEqual(options.timeout, 25000)
        self.assertEqual(options.retry_options.attempts, 1)

    @patch("apps.agents.services.search_merchant_products")
    @patch("apps.agents.services._fallback_response")
    @patch("apps.agents.services._gemini_client")
    def test_server_error_returns_deterministic_fallback(
        self, client_factory, fallback_response, product_search
    ):
        client = SimpleNamespace(
            models=SimpleNamespace(
                generate_content=lambda **kwargs: (_ for _ in ()).throw(
                    genai_errors.ServerError(503, {"message": "provider unavailable"})
                )
            ),
            close=lambda: None,
        )
        client_factory.return_value = client
        product_search.return_value = [{
            "id": 7,
            "title": "Backpack",
            "merchant": {"name": "Catalog Merchant"},
            "price": "4299.00",
            "category": "Laptop Backpacks",
            "stock_quantity": 4,
            "rating": 4.8,
            "specifications": {},
        }]
        fallback_response.return_value = BuyerAgentResponse(
            thought_process=["Used deterministic retrieval."],
            recommendations=[],
            summary_reasoning="The catalog fallback completed safely.",
        )

        result = run_buyer_agent("Backpack under worth of 6000")

        self.assertEqual(result["_audit_context"]["provider_source"], "FALLBACK")
        self.assertEqual(result["summary_reasoning"], "The catalog fallback completed safely.")
        self.assertEqual(
            fallback_response.call_args.kwargs["candidates"], product_search.return_value
        )

    def test_gemini_function_call_is_strictly_validated(self):
        captured = {}
        response = SimpleNamespace(
            function_calls=[
                SimpleNamespace(
                    name="search_merchant_products",
                    args={"search_query": "quiet keyboard", "max_price": 8000, "limit": 3},
                )
            ]
        )
        def generate_content(**kwargs):
            captured.update(kwargs)
            return response

        client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))

        arguments = _extract_tool_call(client, "quiet keyboard under ₹8,000")

        self.assertEqual(arguments.search_query, "quiet keyboard")
        self.assertEqual(arguments.max_price, 8000)
        self.assertEqual(arguments.limit, 3)
        self.assertEqual(captured["config"].thinking_config.thinking_level.value, "LOW")
        self.assertTrue(captured["config"].automatic_function_calling.disable)

    def test_gemini_structured_output_is_grounded_in_catalog(self):
        captured = {}
        model_payload = {
            "thought_process": ["Compared the supplied catalog candidates."],
            "primary_recommendation_id": 7,
            "recommendations": [{
                "product_id": 7,
                "title": "Invented title",
                "merchant": "Invented merchant",
                "price": 1,
                "match_score": 90,
                "reason": "Matches the request.",
            }],
            "add_on_suggestions": [],
            "summary_reasoning": "One grounded match.",
        }
        response = SimpleNamespace(text=json.dumps(model_payload))
        def generate_content(**kwargs):
            captured.update(kwargs)
            return response

        client = SimpleNamespace(models=SimpleNamespace(generate_content=generate_content))
        candidates = [{
            "id": 7,
            "title": "Live Keyboard",
            "merchant": {"name": "Live Merchant"},
            "price": "7999.00",
            "category": "Keyboards",
            "stock_quantity": 4,
            "rating": 4.8,
            "specifications": {"layout": "75%"},
        }]

        parsed = _parse_recommendations(client, "quiet keyboard", candidates)

        self.assertEqual(parsed.recommendations[0].title, "Live Keyboard")
        self.assertEqual(parsed.recommendations[0].merchant, "Live Merchant")
        self.assertEqual(parsed.recommendations[0].price, 7999.0)
        self.assertEqual(captured["config"].thinking_config.thinking_level.value, "LOW")
        self.assertTrue(captured["config"].automatic_function_calling.disable)


class CatalogRecallTests(TestCase):
    def setUp(self):
        owner = get_user_model().objects.create_user(username="catalog-owner")
        merchant = Merchant.objects.create(owner=owner, name="Catalog", email="catalog@test.invalid")
        Product.objects.create(
            merchant=merchant,
            title="Quiet Code Keyboard",
            description="A wireless mechanical keyboard for programming.",
            category="Keyboards",
            price="7499.00",
            stock_quantity=5,
            rating=4.8,
            specifications={
                "switches": "Silent tactile",
                "connectivity": ["Bluetooth", "USB-C"],
                "layout": "75%",
                "hot_swappable": True,
            },
            tags=["keyboard", "quiet", "coding", "wireless"],
        )

    def test_verbose_buyer_prompt_returns_bounded_results(self):
        results = fallback_product_search(
            "I need a quiet wireless mechanical keyboard under ₹8,000 for coding on macOS; "
            "please prioritize a compact layout and hot-swap support."
        )
        self.assertEqual(len(results), 1)
        self.assertEqual(results[0]["title"], "Quiet Code Keyboard")



class ConversationPrivacyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="buyer-one", password="test")
        self.other_user = get_user_model().objects.create_user(username="buyer-two", password="test")

    @staticmethod
    def agent_result():
        return {
            "thought_process": ["Searched the catalog."],
            "primary_recommendation_id": None,
            "recommendations": [],
            "add_on_suggestions": [],
            "summary_reasoning": "No grounded result in this test fixture.",
            "_audit_context": {
                "provider_source": "FALLBACK",
                "parsed_constraints": {"search_query": "keyboard", "limit": 5},
                "catalog_candidate_ids": [],
            },
        }

    @patch("apps.agents.views.run_buyer_agent")
    def test_authenticated_history_is_private_and_reusable(self, run_mock):
        run_mock.return_value = self.agent_result()
        self.client.force_authenticate(self.user)
        response = self.client.post(
            reverse("agents:search"), {"query": "quiet keyboard"}, format="json"
        )
        self.assertEqual(response.status_code, 200)
        conversation_id = response.data["conversation_id"]
        self.assertNotIn("conversation_token", response.data)

        list_response = self.client.get(reverse("agents:conversation-list"))
        self.assertEqual(list_response.status_code, 200)
        self.assertEqual(list_response.data["results"][0]["conversation_id"], conversation_id)

        self.client.force_authenticate(self.other_user)
        detail = self.client.get(
            reverse("agents:conversation-detail", kwargs={"conversation_id": conversation_id})
        )
        self.assertEqual(detail.status_code, 404)

    @patch("apps.agents.views.run_buyer_agent")
    def test_authenticated_user_can_delete_only_their_chat_history(self, run_mock):
        run_mock.return_value = self.agent_result()
        self.client.force_authenticate(self.user)
        created = self.client.post(
            reverse("agents:search"), {"query": "temporary keyboard chat"}, format="json"
        )
        conversation_id = created.data["conversation_id"]
        session_id = created.data["agent_session_id"]

        self.client.force_authenticate(self.other_user)
        denied = self.client.delete(
            reverse("agents:conversation-detail", kwargs={"conversation_id": conversation_id})
        )
        self.assertEqual(denied.status_code, 404)
        self.assertTrue(ChatConversation.objects.filter(pk=conversation_id).exists())

        self.client.force_authenticate(self.user)
        deleted = self.client.delete(
            reverse("agents:conversation-detail", kwargs={"conversation_id": conversation_id})
        )
        self.assertEqual(deleted.status_code, 204)
        self.assertFalse(ChatConversation.objects.filter(pk=conversation_id).exists())
        self.assertIsNone(AgentSession.objects.get(pk=session_id).conversation_id)

    @patch("apps.agents.views.run_buyer_agent")
    def test_guest_can_continue_only_with_signed_token_and_cannot_list(self, run_mock):
        run_mock.return_value = self.agent_result()
        first = self.client.post(
            reverse("agents:search"), {"query": "quiet keyboard"}, format="json"
        )
        self.assertEqual(first.status_code, 200)
        conversation_id = first.data["conversation_id"]
        token = first.data["conversation_token"]

        second = self.client.post(
            reverse("agents:search"),
            {
                "query": "which one has bluetooth?",
                "conversation_id": conversation_id,
                "conversation_token": token,
            }, format="json",
        )
        self.assertEqual(second.status_code, 200)
        self.assertEqual(second.data["conversation_id"], conversation_id)
        self.assertEqual(ChatConversation.objects.get(pk=conversation_id).messages.count(), 4)
        self.assertEqual(self.client.get(reverse("agents:conversation-list")).status_code, 401)

        rejected = self.client.post(
            reverse("agents:search"),
            {
                "query": "continue",
                "conversation_id": conversation_id,
                "conversation_token": token + "tampered",
            }, format="json",
        )
        self.assertEqual(rejected.status_code, 400)
