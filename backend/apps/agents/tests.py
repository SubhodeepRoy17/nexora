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

from .models import AgentSession, ChatConversation, ChatMessage
from .services import (
    AgentServiceError,
    BuyerAgentResponse,
    ProductRecommendation,
    _extract_tool_call,
    _fallback_response,
    _ground_recommendations,
    _gemini_client,
    _model_name,
    _parse_recommendations,
    _thinking_config,
    generate_conversation_title,
    run_buyer_agent,
)
from .tools import (
    ProductSearchSchema,
    _contains_term,
    calculate_match_score,
    deterministic_search_arguments,
    fallback_product_search,
    search_merchant_products,
)


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

    def test_deterministic_parser_retains_explicit_color(self):
        arguments = deterministic_search_arguments("Find a red keyboard under ₹5,000")

        self.assertEqual(arguments.category, "Keyboards")
        self.assertEqual(arguments.max_price, 5000)
        self.assertEqual(arguments.required_specs, {"color": "Red"})

    def test_deterministic_parser_retains_hot_swap_and_multiword_category(self):
        keyboard = deterministic_search_arguments("Hot-swappable keyboard under 10000")
        stand = deterministic_search_arguments("Laptop stand under 3000")

        self.assertEqual(keyboard.required_specs, {"hot_swappable": True})
        self.assertEqual(stand.category, "Laptop Stands")

    def test_deterministic_parser_recognizes_common_accessory_categories(self):
        self.assertEqual(
            deterministic_search_arguments("wireless mouse under 5000").category,
            "Mice",
        )
        self.assertEqual(
            deterministic_search_arguments("noise cancelling headphones").category,
            "Headphones",
        )

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


class PromptMatchScoreTests(SimpleTestCase):
    def candidate(self, **overrides):
        candidate = {
            "title": "Standard Office Keyboard",
            "description": "A full-size keyboard for everyday office work.",
            "category": "Keyboards",
            "price": "4999.00",
            "rating": 4.2,
            "tags": ["keyboard", "office"],
            "specifications": {"connectivity": ["USB"], "hot_swappable": False},
        }
        candidate.update(overrides)
        return candidate

    def test_prompt_terms_change_the_score_for_products_in_the_same_category(self):
        search = ProductSearchSchema(
            search_query="quiet keyboard for coding",
            category="Keyboards",
            max_price=8000,
        )
        close_match = self.candidate(
            title="Quiet Coding Keyboard",
            description="Silent keyboard designed for programming and productivity.",
            tags=["keyboard", "quiet", "coding", "productivity"],
        )

        self.assertGreater(
            calculate_match_score(close_match, search),
            calculate_match_score(self.candidate(), search),
        )

    def test_explicit_specifications_and_budget_are_scored_independently(self):
        search = ProductSearchSchema(
            search_query="hot-swappable keyboard under 6000",
            category="Keyboards",
            max_price=6000,
            required_specs={"hot_swappable": True},
        )

        matching = calculate_match_score(
            self.candidate(
                title="Hot-Swappable Mechanical Keyboard",
                specifications={"hot_swappable": True},
            ),
            search,
        )
        failing = calculate_match_score(
            self.candidate(price="7000.00"),
            search,
        )

        self.assertGreater(matching, failing)
        self.assertLessEqual(matching, 100)

    def test_lexical_matching_uses_word_boundaries(self):
        self.assertFalse(_contains_term("wired keyboard", "red"))
        self.assertTrue(_contains_term("hot_swappable keyboard", "hot-swappable"))
        self.assertTrue(_contains_term("Keyboards", "keyboard"))


class CatalogRelevanceTests(TestCase):
    def setUp(self):
        owner = get_user_model().objects.create_user(username="relevance-owner")
        merchant = Merchant.objects.create(
            owner=owner,
            name="Relevance Catalog",
            email="relevance@test.invalid",
        )
        Product.objects.create(
            merchant=merchant,
            title="Aluminium Laptop Stand",
            description="An adjustable stand for a laptop.",
            category="Laptop Accessories",
            price="1499.00",
            stock_quantity=8,
            rating=4.7,
            tags=["laptop", "stand"],
        )

    @patch("apps.agents.tools.vector_index_available", return_value=False)
    def test_unavailable_product_does_not_broaden_to_unrelated_budget_items(self, _vector):
        arguments = deterministic_search_arguments("Please show me some watches under 2000")

        results = search_merchant_products(arguments)

        self.assertEqual(arguments.category, "Watches")
        self.assertEqual(results, [])

    @patch("apps.agents.tools.vector_index_available", return_value=False)
    def test_constraint_only_budget_query_can_still_browse_matching_inventory(self, _vector):
        arguments = deterministic_search_arguments("Show me products under 2000")

        results = search_merchant_products(arguments)

        self.assertEqual([item["title"] for item in results], ["Aluminium Laptop Stand"])

    @patch("apps.agents.tools.vector_index_available", return_value=False)
    def test_generic_gift_and_rating_language_browses_ranked_inventory(self, _vector):
        gift = search_merchant_products(
            deterministic_search_arguments("Suggest a useful tech gift under ₹2000")
        )
        highest_rated = search_merchant_products(
            deterministic_search_arguments("Show the highest rated product")
        )

        self.assertEqual([item["title"] for item in gift], ["Aluminium Laptop Stand"])
        self.assertEqual([item["title"] for item in highest_rated], ["Aluminium Laptop Stand"])


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
                "match_score": 42,
                "specifications": {"switches": "Brown tactile"},
            }
        ]

        grounded = _ground_recommendations(response, candidates)

        self.assertEqual(grounded.recommendations[0].title, "Keychron K2 Pro")
        self.assertEqual(grounded.recommendations[0].price, 7999.0)
        self.assertEqual(grounded.recommendations[0].match_score, 42)
        self.assertEqual(grounded.recommendations[0].stock_quantity, 0)

    def test_buyer_facing_copy_hides_internal_ids_and_addresses_person_directly(self):
        response = BuyerAgentResponse(
            thought_process=["Compared catalog candidates."],
            recommendations=[
                ProductRecommendation(
                    product_id=108,
                    title="Model title",
                    merchant="Model merchant",
                    price=1,
                    match_score=95,
                    reason="The user requested this item under product ID 108.",
                )
            ],
            summary_reasoning=(
                "The user requested the Nexora Full-Size Wrist Rest, which is "
                "available in the catalog under product ID 108."
            ),
        )
        candidates = [
            {
                "id": 108,
                "title": "Nexora Full-Size Wrist Rest",
                "price": "1499.00",
                "merchant": {"name": "Nexora Store"},
                "specifications": {},
            }
        ]

        grounded = _ground_recommendations(response, candidates)

        self.assertEqual(
            grounded.summary_reasoning,
            "You asked for the Nexora Full-Size Wrist Rest, which is available.",
        )
        self.assertNotIn("product ID", grounded.recommendations[0].reason)
        self.assertNotIn("The user", grounded.recommendations[0].reason)


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

    @patch("apps.agents.services._gemini_client")
    def test_gemini_suggests_a_short_conversation_title(self, client_factory):
        captured = {}

        def generate_content(**kwargs):
            captured.update(kwargs)
            return SimpleNamespace(text=json.dumps({"title": "Quiet Coding Keyboards"}))

        client_factory.return_value = SimpleNamespace(
            models=SimpleNamespace(generate_content=generate_content), close=lambda: None
        )

        title = generate_conversation_title(
            "Show me some quiet keyboards for coding",
            "I found three options that fit your preferences.",
        )

        self.assertEqual(title, "Quiet Coding Keyboards")
        self.assertEqual(captured["config"].max_output_tokens, 120)
        self.assertTrue(captured["config"].automatic_function_calling.disable)

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
        self.assertNotEqual(parsed.recommendations[0].match_score, 90)
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


class DynamicNoResultTests(TestCase):
    def setUp(self):
        owner = get_user_model().objects.create_user(username="no-result-owner")
        merchant = Merchant.objects.create(
            owner=owner, name="No Result Catalog", email="no-result@test.invalid"
        )
        Product.objects.create(
            merchant=merchant,
            title="Black Entry Keyboard",
            description="Entry keyboard with a structured black color.",
            category="Keyboards",
            price="2499.00",
            stock_quantity=5,
            rating=4.5,
            specifications={"color": "Black", "layout": "75%"},
            tags=["keyboard", "black"],
        )

    @patch("apps.agents.tools.vector_index_available", return_value=False)
    @patch("apps.agents.services._gemini_client", side_effect=AgentServiceError("offline"))
    def test_budget_failure_names_cheapest_product_and_shortfall(self, _gemini, _vector):
        result = run_buyer_agent("Find a keyboard under ₹100")

        self.assertEqual(result["_audit_context"]["provider_source"], "FALLBACK")
        self.assertIn("Black Entry Keyboard", result["summary_reasoning"])
        self.assertIn("₹2,499", result["summary_reasoning"])
        self.assertIn("₹2,399", result["summary_reasoning"])
        self.assertEqual(result["no_result"]["reasons"][0]["code"], "BUDGET_TOO_LOW")
        self.assertIn("₹2,499", result["suggested_query"])

    @patch("apps.agents.tools.vector_index_available", return_value=False)
    @patch("apps.agents.services._gemini_client", side_effect=AgentServiceError("offline"))
    def test_color_failure_names_requested_and_available_values(self, _gemini, _vector):
        result = run_buyer_agent("Find a red keyboard")

        self.assertIn("color Red", result["summary_reasoning"])
        self.assertIn("Black", result["summary_reasoning"])
        reason = result["no_result"]["reasons"][0]
        self.assertEqual(reason["code"], "SPEC_UNAVAILABLE")
        self.assertEqual(reason["requested_value"], "Red")
        self.assertEqual(reason["available_values"], ["Black"])

    @patch("apps.agents.tools.vector_index_available", return_value=False)
    @patch("apps.agents.services._gemini_client")
    def test_gemini_phrases_only_the_grounded_no_result_diagnostics(
        self, client_factory, _vector
    ):
        captured = {}
        model_payload = {
            "summary_reasoning": (
                "No active keyboard is available under ₹100. The catalog's least expensive "
                "keyboard is Black Entry Keyboard at ₹2,499, so the budget is short by ₹2,399."
            ),
            "suggested_query": "Find a keyboard under ₹2,499",
        }

        def generate_content(**kwargs):
            captured.update(kwargs)
            return SimpleNamespace(text=json.dumps(model_payload))

        client_factory.return_value = SimpleNamespace(
            models=SimpleNamespace(generate_content=generate_content), close=lambda: None
        )

        result = run_buyer_agent("Find a keyboard under ₹100")

        self.assertEqual(result["_audit_context"]["provider_source"], "GEMINI")
        self.assertEqual(result["summary_reasoning"], model_payload["summary_reasoning"])
        self.assertIn("BUDGET_TOO_LOW", captured["contents"])
        self.assertIn('"budget_shortfall":2399.0', captured["contents"])
        self.assertTrue(captured["config"].automatic_function_calling.disable)


class ContextAwareConversationTests(TestCase):
    def setUp(self):
        owner = get_user_model().objects.create_user(username="context-owner")
        merchant = Merchant.objects.create(
            owner=owner, name="Context Catalog", email="context@test.invalid"
        )
        self.first = Product.objects.create(
            merchant=merchant,
            title="Code Board One",
            description="Hot-swappable keyboard for coding.",
            category="Keyboards",
            price="7999.00",
            stock_quantity=5,
            rating=4.6,
            specifications={"hot_swappable": True, "switches": "Brown tactile"},
            tags=["keyboard", "coding"],
        )
        self.second = Product.objects.create(
            merchant=merchant,
            title="Code Board Two",
            description="Compact hot-swappable keyboard for coding.",
            category="Keyboards",
            price="8999.00",
            stock_quantity=3,
            rating=4.9,
            specifications={"hot_swappable": True, "switches": "Silent tactile"},
            tags=["keyboard", "coding", "quiet"],
        )

    @patch("apps.agents.services.search_merchant_products")
    @patch("apps.agents.services._gemini_client")
    def test_greeting_uses_gemini_conversation_reply_without_catalog_search(
        self, client_factory, product_search
    ):
        model_payload = {
            "turn_type": "GREETING",
            "response": "Hey! Happy to help—what are you hoping to find today?",
            "search_query": None,
        }
        client_factory.return_value = SimpleNamespace(
            models=SimpleNamespace(
                generate_content=lambda **kwargs: SimpleNamespace(text=json.dumps(model_payload))
            ),
            close=lambda: None,
        )

        result = run_buyer_agent("Hi")

        self.assertEqual(result["turn_type"], "GREETING")
        self.assertEqual(result["summary_reasoning"], model_payload["response"])
        self.assertEqual(result["recommendations"], [])
        self.assertEqual(result["_audit_context"]["provider_source"], "GEMINI")
        product_search.assert_not_called()

    @patch("apps.agents.services.search_merchant_products")
    @patch("apps.agents.services._gemini_client")
    def test_off_topic_reply_is_generated_by_gemini_and_redirects_naturally(
        self, client_factory, product_search
    ):
        model_payload = {
            "turn_type": "OFF_TOPIC",
            "response": "That takes us away from shopping, but I can help you choose the right product whenever you're ready.",
            "search_query": None,
        }
        client_factory.return_value = SimpleNamespace(
            models=SimpleNamespace(
                generate_content=lambda **kwargs: SimpleNamespace(text=json.dumps(model_payload))
            ),
            close=lambda: None,
        )

        result = run_buyer_agent("Write a long poem about the moon")

        self.assertEqual(result["turn_type"], "OFF_TOPIC")
        self.assertEqual(result["summary_reasoning"], model_payload["response"])
        product_search.assert_not_called()

    @patch("apps.agents.services.search_merchant_products")
    @patch("apps.agents.services._gemini_client", side_effect=AgentServiceError("offline"))
    def test_ambiguous_shopping_request_still_searches_during_provider_outage(
        self, _client_factory, product_search
    ):
        product_search.return_value = [
            {
                "id": self.first.id,
                "title": self.first.title,
                "description": self.first.description,
                "merchant": {"id": self.first.merchant_id, "name": "Context Catalog"},
                "price": str(self.first.price),
                "category": self.first.category,
                "stock_quantity": self.first.stock_quantity,
                "rating": self.first.rating,
                "specifications": self.first.specifications,
            }
        ]

        result = run_buyer_agent("I need something portable for work")

        self.assertEqual(result["turn_type"], "SHOPPING_SEARCH")
        self.assertEqual(result["_audit_context"]["provider_source"], "FALLBACK")
        self.assertTrue(result["recommendations"])
        product_search.assert_called_once()

    @patch("apps.agents.services.search_merchant_products")
    @patch("apps.agents.services._gemini_client", side_effect=AgentServiceError("offline"))
    def test_off_topic_message_stays_conversational_during_provider_outage(
        self, _client_factory, product_search
    ):
        result = run_buyer_agent("Write a long poem about the moon")

        self.assertEqual(result["turn_type"], "OFF_TOPIC")
        self.assertEqual(result["_audit_context"]["provider_source"], "FALLBACK")
        product_search.assert_not_called()

    @patch("apps.agents.services.search_merchant_products")
    @patch("apps.agents.services._gemini_client")
    def test_best_follow_up_is_limited_to_previous_live_results(
        self, client_factory, product_search
    ):
        captured = {}
        model_payload = {
            "thought_process": ["Compared only the prior options against the coding request."],
            "primary_recommendation_id": self.second.id,
            "recommendations": [
                {
                    "product_id": self.second.id,
                    "title": "Model supplied title",
                    "merchant": "Model supplied merchant",
                    "price": 1,
                    "match_score": 96,
                    "reason": "Best balance of quiet switches and coding comfort.",
                },
                {
                    "product_id": self.first.id,
                    "title": "Another model title",
                    "merchant": "Another merchant",
                    "price": 1,
                    "match_score": 88,
                    "reason": "Good alternative.",
                },
            ],
            "add_on_suggestions": [],
            "summary_reasoning": "Code Board Two is the best fit from the options already shown.",
        }

        def generate_content(**kwargs):
            captured.update(kwargs)
            return SimpleNamespace(text=json.dumps(model_payload))

        client_factory.return_value = SimpleNamespace(
            models=SimpleNamespace(generate_content=generate_content), close=lambda: None
        )
        context = [
            {
                "role": "USER",
                "content": "Show me hot-swappable keyboards for coding under ₹10,000",
                "metadata": {},
            },
            {
                "role": "ASSISTANT",
                "content": "I found two matching keyboards.",
                "metadata": {
                    "recommendations": [
                        {"product_id": self.first.id, "title": self.first.title},
                        {"product_id": self.second.id, "title": self.second.title},
                    ]
                },
            },
        ]

        result = run_buyer_agent("Which one is best for me?", conversation_context=context)

        self.assertEqual(result["turn_type"], "FOLLOW_UP")
        self.assertEqual(len(result["recommendations"]), 1)
        self.assertEqual(result["recommendations"][0]["product_id"], self.second.id)
        self.assertEqual(result["recommendations"][0]["title"], self.second.title)
        self.assertEqual(
            result["_audit_context"]["catalog_candidate_ids"],
            [self.first.id, self.second.id],
        )
        self.assertIn("Latest follow-up: Which one is best for me?", captured["contents"])
        product_search.assert_not_called()



class ConversationPrivacyTests(TestCase):
    def setUp(self):
        self.client = APIClient()
        self.user = get_user_model().objects.create_user(username="buyer-one", password="test")
        self.other_user = get_user_model().objects.create_user(username="buyer-two", password="test")
        self.title_patcher = patch(
            "apps.agents.views.generate_conversation_title",
            side_effect=lambda first_message, assistant_response: " ".join(
                first_message.split()
            )[:120],
        )
        self.title_patcher.start()
        self.addCleanup(self.title_patcher.stop)

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

    @patch("apps.agents.views.generate_conversation_title", return_value="Quiet Coding Keyboards")
    @patch("apps.agents.views.run_buyer_agent")
    def test_ai_title_can_be_renamed_and_custom_name_survives_first_message_edit(
        self, run_mock, title_mock
    ):
        run_mock.side_effect = lambda *args, **kwargs: self.agent_result()
        self.client.force_authenticate(self.user)
        created = self.client.post(
            reverse("agents:search"),
            {"query": "show me a quiet keyboard for coding"},
            format="json",
        )
        self.assertEqual(created.status_code, 200)
        self.assertEqual(created.data["conversation_title"], "Quiet Coding Keyboards")
        conversation_id = created.data["conversation_id"]

        renamed = self.client.patch(
            reverse(
                "agents:conversation-detail",
                kwargs={"conversation_id": conversation_id},
            ),
            {"title": "My Office Keyboard List"},
            format="json",
        )
        self.assertEqual(renamed.status_code, 200)
        self.assertEqual(renamed.data["title"], "My Office Keyboard List")
        conversation = ChatConversation.objects.get(pk=conversation_id)
        self.assertTrue(conversation.title_is_custom)

        first_message = conversation.messages.filter(role=ChatMessage.Role.USER).get()
        edited = self.client.post(
            reverse("agents:search"),
            {
                "query": "show me a compact keyboard for coding",
                "conversation_id": conversation_id,
                "edit_message_id": first_message.message_id,
            },
            format="json",
        )
        self.assertEqual(edited.status_code, 200)
        self.assertEqual(edited.data["conversation_title"], "My Office Keyboard List")
        self.assertEqual(title_mock.call_count, 1)

    def test_chat_search_matches_owned_titles_and_message_content(self):
        title_match = ChatConversation.objects.create(
            buyer=self.user, title="Ergonomic Desk Setup"
        )
        message_match = ChatConversation.objects.create(
            buyer=self.user, title="Work accessories"
        )
        hidden = ChatConversation.objects.create(
            buyer=self.other_user, title="Private keyboard notes"
        )
        ChatMessage.objects.create(
            conversation=message_match,
            role=ChatMessage.Role.USER,
            content="I need a silent keyboard",
        )
        ChatMessage.objects.create(
            conversation=hidden,
            role=ChatMessage.Role.USER,
            content="silent keyboard",
        )
        self.client.force_authenticate(self.user)

        by_title = self.client.get(reverse("agents:conversation-list"), {"q": "desk"})
        self.assertEqual(
            [item["conversation_id"] for item in by_title.data["results"]],
            [str(title_match.conversation_id)],
        )
        by_message = self.client.get(
            reverse("agents:conversation-list"), {"q": "silent keyboard"}
        )
        self.assertEqual(
            [item["conversation_id"] for item in by_message.data["results"]],
            [str(message_match.conversation_id)],
        )

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
        passed_context = run_mock.call_args.kwargs["conversation_context"]
        self.assertEqual([item["role"] for item in passed_context], ["USER", "ASSISTANT"])
        self.assertEqual(passed_context[0]["content"], "quiet keyboard")
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

    @patch("apps.agents.views.run_buyer_agent")
    def test_recent_conversations_are_sorted_by_latest_activity(self, run_mock):
        run_mock.side_effect = lambda *args, **kwargs: self.agent_result()
        self.client.force_authenticate(self.user)
        older = self.client.post(
            reverse("agents:search"), {"query": "first keyboard search"}, format="json"
        ).data
        newer = self.client.post(
            reverse("agents:search"), {"query": "second keyboard search"}, format="json"
        ).data

        initial = self.client.get(reverse("agents:conversation-list")).data["results"]
        self.assertEqual(initial[0]["conversation_id"], newer["conversation_id"])

        self.client.post(
            reverse("agents:search"),
            {"query": "continue the first search", "conversation_id": older["conversation_id"]},
            format="json",
        )
        refreshed = self.client.get(reverse("agents:conversation-list")).data["results"]
        self.assertEqual(refreshed[0]["conversation_id"], older["conversation_id"])

    @patch("apps.agents.views.run_buyer_agent")
    def test_editing_a_user_message_replaces_the_later_chat_branch(self, run_mock):
        run_mock.side_effect = lambda *args, **kwargs: self.agent_result()
        self.client.force_authenticate(self.user)
        first = self.client.post(
            reverse("agents:search"), {"query": "quiet keyboard"}, format="json"
        ).data
        first_message_id = first["user_message_id"]
        self.client.post(
            reverse("agents:search"),
            {"query": "which one is best?", "conversation_id": first["conversation_id"]},
            format="json",
        )

        edited = self.client.post(
            reverse("agents:search"),
            {
                "query": "quiet keyboard for a Mac",
                "conversation_id": first["conversation_id"],
                "edit_message_id": first_message_id,
            },
            format="json",
        )

        self.assertEqual(edited.status_code, 200)
        messages = ChatMessage.objects.filter(
            conversation_id=first["conversation_id"]
        )
        self.assertEqual(
            list(messages.values_list("content", flat=True)),
            ["quiet keyboard for a Mac", "No grounded result in this test fixture."],
        )
        self.assertEqual(run_mock.call_args.kwargs["conversation_context"], [])
        self.assertEqual(
            AgentSession.objects.filter(conversation_id=first["conversation_id"]).count(),
            3,
        )

    @patch("apps.agents.views.run_buyer_agent")
    def test_owner_can_create_a_private_share_token_for_a_public_transcript(self, run_mock):
        run_mock.return_value = self.agent_result()
        self.client.force_authenticate(self.user)
        created = self.client.post(
            reverse("agents:search"), {"query": "share this keyboard search"}, format="json"
        ).data
        share_url = reverse(
            "agents:conversation-share",
            kwargs={"conversation_id": created["conversation_id"]},
        )
        shared = self.client.post(share_url, {}, format="json")
        self.assertEqual(shared.status_code, 200)

        self.client.force_authenticate(self.other_user)
        self.assertEqual(self.client.post(share_url, {}, format="json").status_code, 404)

        self.client.force_authenticate(user=None)
        public = self.client.get(
            reverse(
                "agents:shared-conversation-detail",
                kwargs={"share_token": shared.data["share_token"]},
            )
        )
        self.assertEqual(public.status_code, 200)
        self.assertEqual(public.data["title"], "share this keyboard search")
        self.assertEqual(len(public.data["messages"]), 2)
        self.assertNotIn("provider_source", public.data["messages"][1]["metadata"])
        self.assertNotIn("agent_session_id", public.data["messages"][1]["metadata"])
