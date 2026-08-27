import json
import logging
import os
import re
from typing import Any, Literal

import httpx
from django.conf import settings
from google import genai
from google.genai import errors as genai_errors
from google.genai import types as genai_types
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .prompts import (
    BUYER_AGENT_SYSTEM_PROMPT,
    CONVERSATION_SYSTEM_PROMPT,
    NO_RESULT_SYSTEM_PROMPT,
    RECOMMENDATION_SYSTEM_PROMPT,
)
from .tools import (
    SEARCH_MERCHANT_PRODUCTS_FUNCTION,
    ProductSearchSchema,
    deterministic_search_arguments,
    extract_max_price,
    fallback_product_search,
    search_merchant_products,
    serialize_product,
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


class NoResultExplanation(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    summary_reasoning: str = Field(min_length=20, max_length=900)
    suggested_query: str = Field(min_length=3, max_length=300)


class ConversationTurn(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    turn_type: Literal["SHOPPING_SEARCH", "GREETING", "OFF_TOPIC", "FOLLOW_UP"]
    response: str = Field(min_length=1, max_length=900)
    search_query: str | None = Field(default=None, min_length=3, max_length=500)


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
                    "reason": _public_facing_text(recommendation.reason),
                    "tradeoffs": [
                        _public_facing_text(item) for item in recommendation.tradeoffs
                    ],
                }
            )
        )

    if candidates and not grounded:
        raise AgentServiceError("Gemini recommendations did not reference catalog products")
    return response.model_copy(
        update={
            "recommendations": grounded,
            "summary_reasoning": _public_facing_text(response.summary_reasoning),
        }
    )


def _public_facing_text(value: str) -> str:
    """Remove model wording that exposes internal language to a public shopper."""

    text = re.sub(
        r"\bthe\s+(?:user|buyer|shopper)\s+(?:requested|asked\s+for)\b",
        "you asked for",
        value,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"\bthe\s+(?:user|buyer|shopper)['’]s\b",
        "your",
        text,
        flags=re.IGNORECASE,
    )
    grammar = {
        "is": "are",
        "has": "have",
        "wants": "want",
        "needs": "need",
        "prefers": "prefer",
    }
    text = re.sub(
        r"\bthe\s+(?:user|buyer|shopper)\s+(is|has|wants|needs|prefers)\b",
        lambda match: f"you {grammar[match.group(1).lower()]}",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(
        r"\s+(?:in\s+the\s+catalog\s+)?(?:under\s+)?"
        r"(?:product[_\s-]*)?id\s*[:#-]?\s*[a-z0-9-]+",
        "",
        text,
        flags=re.IGNORECASE,
    )
    text = re.sub(r"\bthe\s+(?:user|buyer|shopper)\b", "you", text, flags=re.IGNORECASE)
    text = re.sub(r"\s+([,.;!?])", r"\1", text)
    text = text.strip()
    return text[:1].upper() + text[1:] if text else text


def _empty_response(source_notice: str, summary: str) -> BuyerAgentResponse:
    return BuyerAgentResponse(
        thought_process=[source_notice, "No active, in-stock catalog matches were found."],
        recommendations=[],
        summary_reasoning=summary,
    )


def _active_catalog_queryset(arguments: ProductSearchSchema):
    from apps.merchants.models import Product

    queryset = Product.objects.filter(is_active=True, stock_quantity__gt=0)
    if arguments.category:
        queryset = queryset.filter(category__icontains=arguments.category)
    return queryset


def _catalog_no_result_diagnostics(arguments: ProductSearchSchema) -> dict[str, Any]:
    """Build bounded catalog facts for Gemini; no model determines inventory truth."""

    category_queryset = _active_catalog_queryset(arguments)
    category_count = category_queryset.count()
    budget_queryset = category_queryset
    if arguments.max_price is not None:
        from decimal import Decimal

        budget_queryset = budget_queryset.filter(
            price__lte=Decimal(str(arguments.max_price))
        )
    budget_count = budget_queryset.count()
    cheapest = category_queryset.order_by("price", "-rating").values(
        "title", "price", "category"
    ).first()
    reasons = []
    if category_count == 0:
        reasons.append(
            {
                "code": "CATEGORY_UNAVAILABLE",
                "category": arguments.category,
                "message": "No active, in-stock product exists in the requested category.",
            }
        )
    elif arguments.max_price is not None and budget_count == 0:
        cheapest_price = float(cheapest["price"]) if cheapest else None
        reasons.append(
            {
                "code": "BUDGET_TOO_LOW",
                "requested_max_price": arguments.max_price,
                "cheapest_product": cheapest["title"] if cheapest else None,
                "cheapest_price": cheapest_price,
                "budget_shortfall": (
                    round(cheapest_price - arguments.max_price, 2)
                    if cheapest_price is not None
                    else None
                ),
            }
        )

    spec_base = budget_queryset
    for key, requested_value in arguments.required_specs.items():
        values = []
        for specifications in category_queryset.values_list("specifications", flat=True)[:100]:
            value = (specifications or {}).get(key)
            if value not in (None, "", []):
                rendered = ", ".join(map(str, value)) if isinstance(value, list) else str(value)
                if rendered.casefold() not in {item.casefold() for item in values}:
                    values.append(rendered)
        matching = spec_base.filter(**{f"specifications__{key}": requested_value}).count()
        if matching == 0:
            reasons.append(
                {
                    "code": "SPEC_UNAVAILABLE",
                    "specification": key,
                    "requested_value": requested_value,
                    "available_values": sorted(values, key=str.casefold)[:10],
                }
            )

    if not reasons:
        reasons.append(
            {
                "code": "COMBINATION_UNAVAILABLE",
                "message": "No single active, in-stock product satisfies the complete constraint combination.",
            }
        )
    return {
        "requested": {
            "category": arguments.category,
            "max_price": arguments.max_price,
            "required_specs": arguments.required_specs,
        },
        "catalog": {
            "active_in_stock_in_category": category_count,
            "within_budget_before_specs": budget_count,
            "cheapest_in_category": (
                {
                    "title": cheapest["title"],
                    "price": float(cheapest["price"]),
                    "category": cheapest["category"],
                }
                if cheapest
                else None
            ),
        },
        "reasons": reasons,
    }


def _money(value: float) -> str:
    return f"₹{value:,.2f}".rstrip("0").rstrip(".")


def _deterministic_no_result_explanation(
    arguments: ProductSearchSchema, diagnostics: dict[str, Any]
) -> NoResultExplanation:
    reasons = diagnostics["reasons"]
    primary = reasons[0]
    category = arguments.category or "product"
    category_label = category.lower()
    if primary["code"] == "BUDGET_TOO_LOW":
        cheapest_price = primary.get("cheapest_price")
        cheapest_title = primary.get("cheapest_product")
        shortfall = primary.get("budget_shortfall")
        summary = (
            f"I couldn't find an active, in-stock {category_label} at or below "
            f"{_money(arguments.max_price)}. The least expensive current match is "
            f"{cheapest_title} at {_money(cheapest_price)}, which is "
            f"{_money(shortfall)} above that budget. Raise the budget to at least "
            f"{_money(cheapest_price)} or change the requested category."
        )
        suggested = f"Find a {category_label.rstrip('s')} under {_money(cheapest_price)}"
    elif primary["code"] == "SPEC_UNAVAILABLE":
        specification = primary["specification"].replace("_", " ")
        requested = primary["requested_value"]
        available = primary.get("available_values", [])
        availability = (
            f" Available catalog values are: {', '.join(available)}."
            if available
            else f" Current matching products do not list another structured {specification} value."
        )
        budget_phrase = (
            f" within {_money(arguments.max_price)}" if arguments.max_price is not None else ""
        )
        summary = (
            f"I couldn't find an active, in-stock {category_label} with {specification} "
            f"{requested}{budget_phrase}.{availability} Try another {specification} or remove that constraint."
        )
        suggested = f"Show active in-stock {category_label} without the {specification} constraint"
    elif primary["code"] == "CATEGORY_UNAVAILABLE":
        summary = (
            f"I couldn't find any active, in-stock products in {category}. "
            "Try a different category or check again after the merchant updates inventory."
        )
        suggested = "Show active in-stock products in a similar category"
    else:
        summary = (
            "I couldn't find one active, in-stock catalog product satisfying the complete "
            "combination of requested constraints. Remove one constraint at a time to see which alternatives remain."
        )
        suggested = f"Show active in-stock {category_label} with fewer constraints"
    return NoResultExplanation(summary_reasoning=summary, suggested_query=suggested)


def _gemini_no_result_explanation(client, prompt: str, diagnostics: dict[str, Any]):
    response = client.models.generate_content(
        model=_model_name(),
        contents=(
            f"Buyer request: {prompt}\n"
            "Authoritative catalog diagnostics:\n"
            f"{json.dumps(diagnostics, separators=(',', ':'))}"
        ),
        config=genai_types.GenerateContentConfig(
            system_instruction=NO_RESULT_SYSTEM_PROMPT,
            thinking_config=_thinking_config(),
            automatic_function_calling=genai_types.AutomaticFunctionCallingConfig(disable=True),
            response_mime_type="application/json",
            response_json_schema=NoResultExplanation.model_json_schema(),
            max_output_tokens=600,
        ),
    )
    return NoResultExplanation.model_validate_json(response.text or "")


def _no_result_payload(prompt: str, arguments: ProductSearchSchema) -> dict[str, Any]:
    diagnostics = _catalog_no_result_diagnostics(arguments)
    client = None
    source = "FALLBACK"
    try:
        client = _gemini_client()
        explanation = _gemini_no_result_explanation(client, prompt, diagnostics)
        source = "GEMINI"
    except (
        genai_errors.APIError,
        httpx.HTTPError,
        AgentServiceError,
        ValidationError,
        ValueError,
    ) as exc:
        logger.warning("Gemini no-result fallback after %s", type(exc).__name__)
        explanation = _deterministic_no_result_explanation(arguments, diagnostics)
    finally:
        close = getattr(client, "close", None)
        if callable(close):
            try:
                close()
            except Exception:
                logger.debug("Gemini client cleanup failed.", exc_info=True)

    result = _empty_response(
        "Diagnosed the requested constraints against active, in-stock inventory.",
        _public_facing_text(explanation.summary_reasoning),
    ).model_dump(mode="json")
    result["turn_type"] = "SHOPPING_SEARCH"
    result["suggested_query"] = explanation.suggested_query
    result["no_result"] = diagnostics
    result["_audit_context"] = {
        "provider_source": source,
        "parsed_constraints": arguments.model_dump(mode="json"),
        "catalog_candidate_ids": [],
    }
    _record_search(
        prompt,
        [],
        source,
        max_price=arguments.max_price,
        category=arguments.category,
    )
    return result


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
        diagnostics = _catalog_no_result_diagnostics(constraints)
        explanation = _deterministic_no_result_explanation(constraints, diagnostics)
        return _empty_response(
            "The bounded catalog search completed without a matching item.",
            explanation.summary_reasoning,
        )

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


def _bounded_conversation_history(
    conversation_context: list[dict[str, Any]] | None,
) -> list[dict[str, Any]]:
    history = []
    for message in (conversation_context or [])[-8:]:
        metadata = message.get("metadata") or {}
        recommendations = [
            {
                "product_id": item.get("product_id"),
                "title": item.get("title"),
                "price": item.get("price"),
                "reason": item.get("reason"),
            }
            for item in (metadata.get("recommendations") or [])[:5]
        ]
        history.append(
            {
                "role": message.get("role"),
                "content": str(message.get("content") or "")[:1_200],
                "recommendations": recommendations,
            }
        )
    return history


def _previous_recommendations(history: list[dict[str, Any]]) -> list[dict[str, Any]]:
    for message in reversed(history):
        recommendations = message.get("recommendations") or []
        if recommendations:
            return recommendations
    return []


def _is_prior_result_follow_up(prompt: str, previous: list[dict[str, Any]]) -> bool:
    if not previous or deterministic_search_arguments(prompt).category:
        return False
    return bool(
        re.search(
            r"\b(which|one|ones|these|those|them|option|options|result|results|"
            r"best|better|cheapest|first|second|third|compare|pick|choose)\b",
            prompt,
            flags=re.IGNORECASE,
        )
    )


def _is_direct_catalog_request(prompt: str) -> bool:
    arguments = deterministic_search_arguments(prompt)
    return bool(
        arguments.category
        or arguments.max_price is not None
        or arguments.required_specs
    )


def _looks_like_greeting(prompt: str) -> bool:
    return bool(
        re.fullmatch(
            r"\s*(hi|hello|hey|hiya|namaste|good\s+(morning|afternoon|evening))[!.?\s]*",
            prompt,
            flags=re.IGNORECASE,
        )
    )


def _live_previous_candidates(previous: list[dict[str, Any]]) -> list[dict[str, Any]]:
    from apps.merchants.models import Product

    product_ids = [item.get("product_id") for item in previous if item.get("product_id")]
    products = Product.objects.select_related("merchant").filter(
        id__in=product_ids,
        is_active=True,
        stock_quantity__gt=0,
    ).in_bulk()
    return [serialize_product(products[product_id]) for product_id in product_ids if product_id in products]


def _gemini_conversation_turn(
    client: genai.Client,
    prompt: str,
    history: list[dict[str, Any]],
) -> ConversationTurn:
    response = client.models.generate_content(
        model=_model_name(),
        contents=(
            "Bounded conversation history:\n"
            f"{json.dumps(history, separators=(',', ':'))}\n\n"
            f"Latest shopper message: {prompt}"
        ),
        config=genai_types.GenerateContentConfig(
            system_instruction=CONVERSATION_SYSTEM_PROMPT,
            thinking_config=_thinking_config(),
            automatic_function_calling=genai_types.AutomaticFunctionCallingConfig(disable=True),
            response_mime_type="application/json",
            response_json_schema=ConversationTurn.model_json_schema(),
            max_output_tokens=700,
        ),
    )
    turn = ConversationTurn.model_validate_json(response.text or "")
    if turn.turn_type == "SHOPPING_SEARCH" and not turn.search_query:
        raise AgentServiceError("Gemini omitted the contextualized catalog query")
    return turn


def _conversation_payload(turn: ConversationTurn, source: str) -> dict[str, Any]:
    result = BuyerAgentResponse(
        thought_process=["Handled the message as a conversational turn."],
        recommendations=[],
        summary_reasoning=_public_facing_text(turn.response),
    ).model_dump(mode="json")
    result["turn_type"] = turn.turn_type
    result["_audit_context"] = {
        "provider_source": source,
        "parsed_constraints": {"turn_type": turn.turn_type},
        "catalog_candidate_ids": [],
    }
    return result


def _close_gemini_client(client) -> None:
    close = getattr(client, "close", None)
    if callable(close):
        try:
            close()
        except Exception:
            logger.debug("Gemini client cleanup failed.", exc_info=True)


def _follow_up_prompt(
    prompt: str,
    history: list[dict[str, Any]],
) -> str:
    return (
        "Use the shopper's earlier requirements and the previous result set to answer this "
        "follow-up. Rank only the supplied previous products and put the single best answer "
        "first.\n"
        f"Conversation history: {json.dumps(history, separators=(',', ':'))}\n"
        f"Latest follow-up: {prompt}"
    )


def run_buyer_agent(
    user_prompt: str,
    conversation_context: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    """Handle a bounded conversation turn and ground every product claim in live catalog data."""

    prompt = user_prompt.strip()
    if not prompt:
        raise ValueError("user_prompt cannot be empty")
    if len(prompt) > 2_000:
        raise ValueError("user_prompt cannot exceed 2,000 characters")

    client = None
    history = _bounded_conversation_history(conversation_context)
    previous = _previous_recommendations(history)

    if _is_prior_result_follow_up(prompt, previous):
        candidates = _live_previous_candidates(previous)
        if not candidates:
            fallback_turn = ConversationTurn(
                turn_type="FOLLOW_UP",
                response=(
                    "Those earlier options are no longer available in the live catalog. "
                    "Tell me whether you want me to run a fresh search with the same requirements."
                ),
            )
            return _conversation_payload(fallback_turn, "FALLBACK")
        try:
            client = _gemini_client()
            response = _parse_recommendations(
                client,
                _follow_up_prompt(prompt, history),
                candidates,
            )
            selected = response.recommendations[:1]
            response = response.model_copy(
                update={
                    "recommendations": selected,
                    "primary_recommendation_id": selected[0].product_id if selected else None,
                    "add_on_suggestions": [],
                }
            )
            result = response.model_dump(mode="json")
            result["turn_type"] = "FOLLOW_UP"
            result["_audit_context"] = {
                "provider_source": "GEMINI",
                "parsed_constraints": {"turn_type": "FOLLOW_UP", "scope": "PREVIOUS_RESULTS"},
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
            logger.warning("Gemini follow-up fallback after %s", type(exc).__name__)
            response = _fallback_response(
                prompt,
                "provider request failed",
                constraints=ProductSearchSchema(search_query=prompt, limit=1),
                candidates=candidates[:1],
            )
            response = response.model_copy(
                update={
                    "recommendations": response.recommendations[:1],
                    "primary_recommendation_id": (
                        response.recommendations[0].product_id
                        if response.recommendations
                        else None
                    ),
                }
            )
            result = response.model_dump(mode="json")
            result["turn_type"] = "FOLLOW_UP"
            result["_audit_context"] = {
                "provider_source": "FALLBACK",
                "parsed_constraints": {"turn_type": "FOLLOW_UP", "scope": "PREVIOUS_RESULTS"},
                "catalog_candidate_ids": [candidate["id"] for candidate in candidates],
            }
            return result
        finally:
            _close_gemini_client(client)

    effective_prompt = prompt
    if not _is_direct_catalog_request(prompt):
        try:
            client = _gemini_client()
            turn = _gemini_conversation_turn(client, prompt, history)
            if turn.turn_type != "SHOPPING_SEARCH":
                result = _conversation_payload(turn, "GEMINI")
                _close_gemini_client(client)
                client = None
                return result
            effective_prompt = turn.search_query or prompt
        except (
            genai_errors.APIError,
            httpx.HTTPError,
            AgentServiceError,
            ValidationError,
            ValueError,
        ) as exc:
            logger.warning("Gemini conversation fallback after %s", type(exc).__name__)
            _close_gemini_client(client)
            client = None
            if _looks_like_greeting(prompt):
                return _conversation_payload(
                    ConversationTurn(
                        turn_type="GREETING",
                        response="Hi! Tell me what you are shopping for and what matters most to you.",
                    ),
                    "FALLBACK",
                )
            return _conversation_payload(
                ConversationTurn(
                    turn_type="OFF_TOPIC",
                    response=(
                        "I can help with product discovery and comparisons. Tell me what you "
                        "would like to shop for, along with any budget or preferences."
                    ),
                ),
                "FALLBACK",
            )

    arguments = deterministic_search_arguments(effective_prompt)
    candidates = search_merchant_products(arguments)
    if not candidates:
        _close_gemini_client(client)
        client = None
        return _no_result_payload(effective_prompt, arguments)

    try:
        client = client or _gemini_client()
        response = _attach_growth_suggestions(
            _parse_recommendations(client, effective_prompt, candidates),
            arguments.model_dump(mode="json"),
        )
        recommended_ids = {item.product_id for item in response.recommendations}
        recommended_candidates = [item for item in candidates if item["id"] in recommended_ids]
        _record_search(
            effective_prompt,
            recommended_candidates,
            "GEMINI",
            max_price=arguments.max_price,
            category=arguments.category,
        )
        result = response.model_dump(mode="json")
        result["turn_type"] = "SHOPPING_SEARCH"
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
                effective_prompt,
                reason,
                constraints=arguments,
                candidates=candidates,
            ),
            {"max_price": extract_max_price(effective_prompt)},
        )
        result = response.model_dump(mode="json")
        result["turn_type"] = "SHOPPING_SEARCH"
        result["_audit_context"] = {
            "provider_source": "FALLBACK",
            "parsed_constraints": deterministic_search_arguments(effective_prompt).model_dump(mode="json"),
            "catalog_candidate_ids": [item.product_id for item in response.recommendations],
        }
        return result
    finally:
        _close_gemini_client(client)
