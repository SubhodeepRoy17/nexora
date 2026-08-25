import json
import logging
import os
from typing import Any

import httpx
from django.conf import settings
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .prompts import BUYER_AGENT_SYSTEM_PROMPT, RECOMMENDATION_SYSTEM_PROMPT
from .tools import (
    SEARCH_MERCHANT_PRODUCTS_FUNCTION,
    ProductSearchSchema,
    deterministic_search_arguments,
    extract_max_price,
    fallback_product_search,
    search_merchant_products,
)


DEFAULT_GEMINI_MODEL = "gemini-3.5-flash-lite"
DEFAULT_GEMINI_REQUEST_TIMEOUT_MS = 25_000
DEFAULT_GEMINI_RETRY_ATTEMPTS = 1
MAX_TOOL_ATTEMPTS = 2
MAX_OUTPUT_ATTEMPTS = 2
logger = logging.getLogger(__name__)


class AgentServiceError(Exception):
    """Raised for invalid or incomplete model responses."""


class ProductRecommendation(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    product_id: int
    title: str = Field(min_length=1, max_length=255)
    merchant: str = Field(min_length=1, max_length=200)
    price: float = Field(ge=0)
    category: str = ""
    stock_quantity: int = Field(default=0, ge=0)
    rating: float = Field(default=0, ge=0, le=5)
    match_score: int = Field(ge=0, le=100)
    key_specs: dict[str, Any] = Field(default_factory=dict)
    reason: str = Field(min_length=1, max_length=800)
    tradeoffs: list[str] = Field(default_factory=list, max_length=5)


class AddOnSuggestion(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    relationship_id: int
    primary_product_id: int
    product_id: int
    title: str = Field(min_length=1, max_length=255)
    merchant: str = Field(min_length=1, max_length=200)
    relationship_type: str
    offer_label: str = Field(default="", max_length=120)
    incremental_cost: float = Field(ge=0)
    stock_quantity: int = Field(ge=1)
    key_specs: dict[str, Any] = Field(default_factory=dict)
    compatibility: dict[str, Any] = Field(default_factory=dict)
    constraint_evidence: list[str] = Field(default_factory=list, max_length=5)
    benefit: str = Field(min_length=1, max_length=800)
    trade_off: str = Field(default="", max_length=500)


class BuyerAgentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    thought_process: list[str] = Field(min_length=1, max_length=8)
    primary_recommendation_id: int | None = None
    recommendations: list[ProductRecommendation] = Field(default_factory=list, max_length=3)
    add_on_suggestions: list[AddOnSuggestion] = Field(default_factory=list, max_length=3)
    summary_reasoning: str = Field(min_length=1, max_length=1500)


def _compatibility_matches(relationship) -> bool:
    rules = relationship.compatibility or {}
    required_specs = rules.get("source_specs", {})
    if not isinstance(required_specs, dict):
        return False
    source_specs = relationship.source_product.specifications or {}
    return all(source_specs.get(key) == value for key, value in required_specs.items())


def _attach_growth_suggestions(
    response: BuyerAgentResponse, constraints: dict[str, Any] | None = None
) -> BuyerAgentResponse:
    if not response.recommendations or settings.GROWTH_MAX_ADDON_OFFERS == 0:
        return response.model_copy(
            update={
                "primary_recommendation_id": (
                    response.recommendations[0].product_id if response.recommendations else None
                ),
                "add_on_suggestions": [],
            }
        )
    from apps.merchants.models import ProductRelationship

    primary_id = response.recommendations[0].product_id
    primary_price = response.recommendations[0].price
    constraints = constraints or {}
    max_price = constraints.get("max_price")
    relationships = ProductRelationship.objects.select_related(
        "source_product__merchant", "related_product__merchant"
    ).filter(
        source_product_id=primary_id,
        relationship_type__in=[
            ProductRelationship.Kind.ACCESSORY,
            ProductRelationship.Kind.COMPLEMENT,
            ProductRelationship.Kind.BUNDLE,
        ],
        is_active=True,
        source_product__is_active=True,
        related_product__is_active=True,
        related_product__stock_quantity__gt=0,
    ).order_by("priority", "id")
    suggestions = []
    for relationship in relationships:
        if not _compatibility_matches(relationship):
            continue
        product = relationship.related_product
        if max_price is not None and primary_price + float(product.price) > float(max_price):
            continue
        constraint_evidence = [
            f"Compatibility checked against {len((relationship.compatibility or {}).get('source_specs', {}))} source specification rule(s)."
        ]
        if max_price is not None:
            constraint_evidence.append(
                f"Primary plus add-on remains within the stated ₹{float(max_price):.2f} basket limit."
            )
        suggestions.append(
            AddOnSuggestion(
                relationship_id=relationship.id,
                primary_product_id=primary_id,
                product_id=product.id,
                title=product.title,
                merchant=product.merchant.name,
                relationship_type=relationship.relationship_type,
                offer_label=relationship.offer_label,
                incremental_cost=float(product.price),
                stock_quantity=product.stock_quantity,
                key_specs=product.specifications,
                compatibility=relationship.compatibility,
                constraint_evidence=constraint_evidence,
                benefit=relationship.benefit,
                trade_off=relationship.trade_off,
            )
        )
        if len(suggestions) >= settings.GROWTH_MAX_ADDON_OFFERS:
            break
    # Re-validate the complete deterministic output at the same boundary as model output.
    return BuyerAgentResponse.model_validate(
        response.model_copy(
            update={
                "primary_recommendation_id": primary_id,
                "add_on_suggestions": suggestions,
            }
        ).model_dump()
    )


def _gemini_client() -> genai.Client:
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        raise AgentServiceError("GEMINI_API_KEY is not configured")
    timeout_ms = min(
        30_000,
        max(10_000, int(os.getenv("GEMINI_REQUEST_TIMEOUT_MS", DEFAULT_GEMINI_REQUEST_TIMEOUT_MS))),
    )
    retry_attempts = min(
        2,
        max(1, int(os.getenv("GEMINI_RETRY_ATTEMPTS", DEFAULT_GEMINI_RETRY_ATTEMPTS))),
    )
    return genai.Client(
        api_key=api_key,
        http_options=genai_types.HttpOptions(
            timeout=timeout_ms,
            retry_options=genai_types.HttpRetryOptions(
                attempts=retry_attempts,
                initial_delay=0.25,
                max_delay=1.0,
                exp_base=2.0,
                jitter=0.1,
                http_status_codes=[408, 429, 500, 502, 503, 504],
            ),
        ),
    )


def _model_name() -> str:
    return os.getenv("GEMINI_MODEL", DEFAULT_GEMINI_MODEL)


def _thinking_config() -> genai_types.ThinkingConfig:
    level = os.getenv("GEMINI_THINKING_LEVEL", "low").strip().lower()
    if level not in {"low", "medium", "high"}:
        level = "low"
    return genai_types.ThinkingConfig(thinking_level=level)


def _extract_tool_call(client: genai.Client, user_prompt: str) -> ProductSearchSchema:
    tool = genai_types.Tool(
        function_declarations=[
            genai_types.FunctionDeclaration(**SEARCH_MERCHANT_PRODUCTS_FUNCTION)
        ]
    )
    last_error: Exception | None = None

    for attempt in range(MAX_TOOL_ATTEMPTS):
        retry_instruction = (
            "\nRetry with exactly one valid search_merchant_products call using its strict schema."
            if attempt
            else ""
        )
        response = client.models.generate_content(
            model=_model_name(),
            contents=user_prompt + retry_instruction,
            config=genai_types.GenerateContentConfig(
                system_instruction=BUYER_AGENT_SYSTEM_PROMPT,
                thinking_config=_thinking_config(),
                automatic_function_calling=genai_types.AutomaticFunctionCallingConfig(
                    disable=True
                ),
                tools=[tool],
                tool_config=genai_types.ToolConfig(
                    function_calling_config=genai_types.FunctionCallingConfig(
                        mode=genai_types.FunctionCallingConfigMode.ANY,
                        allowed_function_names=["search_merchant_products"],
                    )
                ),
                max_output_tokens=700,
            ),
        )
        function_calls = response.function_calls or []
        if function_calls:
            function_call = function_calls[0]
            if function_call.name != "search_merchant_products":
                last_error = AgentServiceError("Model selected an unsupported tool")
            else:
                try:
                    return ProductSearchSchema.model_validate(function_call.args or {})
                except ValidationError as exc:
                    last_error = exc
        else:
            last_error = AgentServiceError("Model did not request a catalog search")

    raise AgentServiceError("Gemini returned invalid tool arguments") from last_error


def _parse_recommendations(
    client: genai.Client,
    user_prompt: str,
    candidates: list[dict[str, Any]],
) -> BuyerAgentResponse:
    base_prompt = (
        f"Buyer request: {user_prompt}\n\n"
        "Compare only these exact catalog candidates and return the grounded recommendation object:\n"
        f"{json.dumps(candidates, separators=(',', ':'))}"
    )
    last_error: Exception | None = None

    for attempt in range(MAX_OUTPUT_ATTEMPTS):
        correction = (
            "\nThe previous output failed validation. Return a corrected object matching the schema exactly."
            if attempt
            else ""
        )
        response = client.models.generate_content(
            model=_model_name(),
            contents=base_prompt + correction,
            config=genai_types.GenerateContentConfig(
                system_instruction=RECOMMENDATION_SYSTEM_PROMPT,
                thinking_config=_thinking_config(),
                automatic_function_calling=genai_types.AutomaticFunctionCallingConfig(
                    disable=True
                ),
                response_mime_type="application/json",
                response_json_schema=BuyerAgentResponse.model_json_schema(),
                max_output_tokens=1800,
            ),
        )
        try:
            parsed = BuyerAgentResponse.model_validate_json(response.text or "")
            return _ground_recommendations(parsed, candidates)
        except (ValidationError, ValueError) as exc:
            last_error = exc

    raise AgentServiceError("Gemini returned invalid recommendation JSON") from last_error


def _ground_recommendations(
    response: BuyerAgentResponse,
    candidates: list[dict[str, Any]],
) -> BuyerAgentResponse:
    candidates_by_id = {candidate["id"]: candidate for candidate in candidates}
    grounded = []
    seen_ids = set()

    for recommendation in response.recommendations:
        candidate = candidates_by_id.get(recommendation.product_id)
        if not candidate or recommendation.product_id in seen_ids:
            continue
        seen_ids.add(recommendation.product_id)
        grounded.append(
            recommendation.model_copy(
                update={
                    "title": candidate["title"],
                    "merchant": candidate["merchant"]["name"],
                    "price": float(candidate["price"]),
                    "category": candidate.get("category", ""),
                    "stock_quantity": candidate.get("stock_quantity", 0),
                    "rating": candidate.get("rating", 0),
                    "key_specs": candidate["specifications"],
                }
            )
        )

    if candidates and not grounded:
        raise AgentServiceError("Gemini recommendations did not reference catalog products")
    return response.model_copy(update={"recommendations": grounded})


def _empty_response(source_notice: str) -> BuyerAgentResponse:
    return BuyerAgentResponse(
        thought_process=[source_notice, "No active, in-stock catalog matches were found."],
        recommendations=[],
        summary_reasoning="Try broadening the category, budget, or required specifications.",
    )


def _record_search(
    prompt: str,
    candidates: list[dict[str, Any]],
    source: str,
    *,
    max_price: float | None = None,
    category: str | None = None,
) -> None:
    try:
        from apps.analytics.services import record_search_analytics

        record_search_analytics(
            query=prompt,
            recommendations=candidates,
            source=source,
            max_price=max_price,
            category=category,
        )
    except Exception:
        logger.exception("Analytics tracking failed without interrupting the buyer response.")


def _evidence_reason(candidate: dict[str, Any], constraints: ProductSearchSchema) -> tuple[str, list[str]]:
    evidence = [f"₹{float(candidate['price']):,.0f} and currently in stock"]
    if constraints.category:
        evidence.append(f"listed in {candidate['category']}")
    specs = candidate.get("specifications", {})
    for label, key in (
        ("connectivity", "connectivity"),
        ("switch type", "switches"),
        ("layout", "layout"),
        ("battery", "battery_life_hours"),
    ):
        value = specs.get(key)
        if value not in (None, "", []):
            formatted = ", ".join(map(str, value)) if isinstance(value, list) else str(value)
            evidence.append(f"{label}: {formatted}")
        if len(evidence) == 4:
            break
    tradeoffs = []
    if not specs.get("battery_life_hours"):
        tradeoffs.append("Battery endurance is not specified in the catalog data.")
    if specs.get("hot_swappable") is False:
        tradeoffs.append("The switches are not listed as hot-swappable.")
    return "Catalog evidence: " + "; ".join(evidence) + ".", tradeoffs


def _fallback_response(
    user_prompt: str,
    reason: str,
    *,
    constraints: ProductSearchSchema | None = None,
    candidates: list[dict[str, Any]] | None = None,
) -> BuyerAgentResponse:
    constraints = constraints or deterministic_search_arguments(user_prompt)
    if candidates is None:
        candidates = fallback_product_search(user_prompt)
    if not candidates:
        _record_search(
            user_prompt,
            [],
            "FALLBACK",
            max_price=extract_max_price(user_prompt),
        )
        return _empty_response("The bounded catalog search completed without a matching item.")

    recommendations = []
    for candidate in candidates[:3]:
        score = min(96, round(68 + (candidate["rating"] * 5)))
        evidence_reason, tradeoffs = _evidence_reason(candidate, constraints)
        recommendations.append(
            ProductRecommendation(
                product_id=candidate["id"],
                title=candidate["title"],
                merchant=candidate["merchant"]["name"],
                price=float(candidate["price"]),
                category=candidate["category"],
                stock_quantity=candidate["stock_quantity"],
                rating=candidate["rating"],
                match_score=score,
                key_specs=candidate["specifications"],
                reason=evidence_reason,
                tradeoffs=tradeoffs,
            )
        )
    response = BuyerAgentResponse(
        thought_process=[
            "Parsed the requested product type, budget, and explicit constraints.",
            f"Checked active inventory and ranked {len(candidates)} matching catalog products.",
        ],
        recommendations=recommendations,
        summary_reasoning=(
            f"I found {len(recommendations)} active, in-stock catalog "
            f"option{'s' if len(recommendations) != 1 else ''}"
            f"{' in ' + constraints.category if constraints.category else ''}"
            f"{' within your ₹' + format(constraints.max_price, ',.0f') + ' budget' if constraints.max_price is not None else ''}. "
            "They are ranked using verified price, availability, rating, and product specifications; "
            "compare the evidence and trade-offs before approving one."
        ),
    )
    _record_search(
        user_prompt,
        candidates[:3],
        "FALLBACK",
        max_price=extract_max_price(user_prompt),
    )
    return response


def run_buyer_agent(user_prompt: str) -> dict[str, Any]:
    """Retrieve deterministically, then use one bounded Gemini comparison pass."""

    prompt = user_prompt.strip()
    if not prompt:
        raise ValueError("user_prompt cannot be empty")
    if len(prompt) > 2_000:
        raise ValueError("user_prompt cannot exceed 2,000 characters")

    client = None
    arguments = deterministic_search_arguments(prompt)
    candidates = search_merchant_products(arguments)
    if not candidates:
        _record_search(
            prompt,
            [],
            "FALLBACK",
            max_price=arguments.max_price,
            category=arguments.category,
        )
        result = _empty_response(
            "Parsed the intent and searched active, in-stock merchant inventory."
        ).model_dump(mode="json")
        result["_audit_context"] = {
            "provider_source": "FALLBACK",
            "parsed_constraints": arguments.model_dump(mode="json"),
            "catalog_candidate_ids": [],
        }
        return result

    try:
        client = _gemini_client()
        response = _attach_growth_suggestions(
            _parse_recommendations(client, prompt, candidates),
            arguments.model_dump(mode="json"),
        )
        recommended_ids = {item.product_id for item in response.recommendations}
        recommended_candidates = [item for item in candidates if item["id"] in recommended_ids]
        _record_search(
            prompt,
            recommended_candidates,
            "GEMINI",
            max_price=arguments.max_price,
            category=arguments.category,
        )
        result = response.model_dump(mode="json")
        result["_audit_context"] = {
            "provider_source": "GEMINI",
            "parsed_constraints": arguments.model_dump(mode="json"),
            "catalog_candidate_ids": [candidate["id"] for candidate in candidates],
        }
        return result
    except (
        genai_errors.APIError,
        httpx.HTTPError,
        AgentServiceError,
        ValidationError,
        ValueError,
    ) as exc:
        logger.warning("Gemini buyer-agent fallback after %s", type(exc).__name__)
        reason = (
            "provider request failed"
            if isinstance(exc, genai_errors.APIError)
            else "configuration or provider output error"
        )
        response = _attach_growth_suggestions(
            _fallback_response(
                prompt,
                reason,
                constraints=arguments,
                candidates=candidates,
            ),
            {"max_price": extract_max_price(prompt)},
        )
        result = response.model_dump(mode="json")
        result["_audit_context"] = {
            "provider_source": "FALLBACK",
            "parsed_constraints": deterministic_search_arguments(prompt).model_dump(mode="json"),
            "catalog_candidate_ids": [item.product_id for item in response.recommendations],
        }
        return result
    finally:
        close = getattr(client, "close", None)
        if callable(close):
            try:
                close()
            except Exception:
                logger.debug("Gemini client cleanup failed.", exc_info=True)
