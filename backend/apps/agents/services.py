import json
import logging
import os
from typing import Any

from groq import APIError, Groq
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .prompts import BUYER_AGENT_SYSTEM_PROMPT, RECOMMENDATION_SYSTEM_PROMPT
from .tools import (
    SEARCH_MERCHANT_PRODUCTS_TOOL,
    ProductSearchSchema,
    extract_max_price,
    fallback_product_search,
    search_merchant_products,
)


DEFAULT_GROQ_MODEL = "llama-3.3-70b-versatile"
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


class BuyerAgentResponse(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    thought_process: list[str] = Field(min_length=1, max_length=8)
    recommendations: list[ProductRecommendation] = Field(default_factory=list, max_length=5)
    summary_reasoning: str = Field(min_length=1, max_length=1500)


def _groq_client() -> Groq:
    api_key = os.getenv("GROQ_API_KEY")
    if not api_key:
        raise AgentServiceError("GROQ_API_KEY is not configured")
    return Groq(api_key=api_key, timeout=20, max_retries=1)


def _model_name() -> str:
    return os.getenv("GROQ_MODEL", DEFAULT_GROQ_MODEL)


def _extract_tool_call(client: Groq, user_prompt: str):
    messages = [
        {"role": "system", "content": BUYER_AGENT_SYSTEM_PROMPT},
        {"role": "user", "content": user_prompt},
    ]
    last_error: Exception | None = None

    for attempt in range(MAX_TOOL_ATTEMPTS):
        completion = client.chat.completions.create(
            model=_model_name(),
            messages=messages,
            tools=[SEARCH_MERCHANT_PRODUCTS_TOOL],
            tool_choice="required",
            parallel_tool_calls=False,
            temperature=0,
            max_completion_tokens=700,
        )
        message = completion.choices[0].message
        tool_calls = message.tool_calls or []
        if tool_calls:
            tool_call = tool_calls[0]
            if tool_call.function.name != "search_merchant_products":
                last_error = AgentServiceError("Model selected an unsupported tool")
            else:
                try:
                    arguments = ProductSearchSchema.model_validate_json(tool_call.function.arguments)
                    return messages, message, tool_call, arguments
                except ValidationError as exc:
                    last_error = exc
        else:
            last_error = AgentServiceError("Model did not request a catalog search")

        if attempt + 1 < MAX_TOOL_ATTEMPTS:
            messages.append(
                {
                    "role": "user",
                    "content": "Retry with exactly one valid search_merchant_products call using its strict schema.",
                }
            )

    raise AgentServiceError("Groq returned invalid tool arguments") from last_error


def _parse_recommendations(
    client: Groq,
    messages: list[dict[str, Any]],
    candidates: list[dict[str, Any]],
) -> BuyerAgentResponse:
    schema = BuyerAgentResponse.model_json_schema()
    final_messages = [
        *messages,
        {
            "role": "user",
            "content": (
                f"{RECOMMENDATION_SYSTEM_PROMPT}\n\n"
                "Compare the catalog results and return recommendation JSON. "
                f"The exact output schema is: {json.dumps(schema, separators=(',', ':'))}"
            ),
        },
    ]
    last_error: Exception | None = None

    for attempt in range(MAX_OUTPUT_ATTEMPTS):
        completion = client.chat.completions.create(
            model=_model_name(),
            messages=final_messages,
            response_format={"type": "json_object"},
            temperature=0,
            max_completion_tokens=1800,
        )
        content = completion.choices[0].message.content or ""
        try:
            response = BuyerAgentResponse.model_validate_json(content)
            return _ground_recommendations(response, candidates)
        except (ValidationError, ValueError) as exc:
            last_error = exc
            if attempt + 1 < MAX_OUTPUT_ATTEMPTS:
                final_messages.extend(
                    [
                        {"role": "assistant", "content": content},
                        {
                            "role": "user",
                            "content": "The previous JSON failed strict validation. Correct it to match the schema exactly, with no markdown.",
                        },
                    ]
                )

    raise AgentServiceError("Groq returned invalid recommendation JSON") from last_error


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
        raise AgentServiceError("Groq recommendations did not reference catalog products")
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


def _fallback_response(user_prompt: str, reason: str) -> BuyerAgentResponse:
    candidates = fallback_product_search(user_prompt)
    if not candidates:
        _record_search(
            user_prompt,
            [],
            "FALLBACK",
            max_price=extract_max_price(user_prompt),
        )
        return _empty_response(f"Groq unavailable ({reason}); exact ORM keyword fallback completed.")

    recommendations = []
    for candidate in candidates[:3]:
        score = min(96, round(68 + (candidate["rating"] * 5)))
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
                reason="Matched the available catalog using exact keyword, price, and availability filters.",
                tradeoffs=["Comparative LLM evaluation was unavailable for this response."],
            )
        )
    response = BuyerAgentResponse(
        thought_process=[
            f"Groq unavailable ({reason}); switched to exact ORM keyword matching.",
            f"Filtered active inventory and ranked {len(candidates)} candidate products.",
        ],
        recommendations=recommendations,
        summary_reasoning="These fallback results are deterministic catalog matches. Review specifications before approval.",
    )
    _record_search(
        user_prompt,
        candidates[:3],
        "FALLBACK",
        max_price=extract_max_price(user_prompt),
    )
    return response


def run_buyer_agent(user_prompt: str) -> dict[str, Any]:
    """Parse buyer intent, execute a bounded catalog tool, and compare grounded results."""

    prompt = user_prompt.strip()
    if not prompt:
        raise ValueError("user_prompt cannot be empty")
    if len(prompt) > 2_000:
        raise ValueError("user_prompt cannot exceed 2,000 characters")

    try:
        client = _groq_client()
        messages, assistant_message, tool_call, arguments = _extract_tool_call(client, prompt)
        candidates = search_merchant_products(arguments)
        if not candidates:
            _record_search(
                prompt,
                [],
                "GROQ",
                max_price=arguments.max_price,
                category=arguments.category,
            )
            return _empty_response("Parsed intent and searched active merchant inventory.").model_dump(mode="json")

        messages.extend(
            [
                assistant_message.model_dump(exclude_none=True),
                {
                    "role": "tool",
                    "tool_call_id": tool_call.id,
                    "name": tool_call.function.name,
                    "content": json.dumps(candidates, separators=(",", ":")),
                },
            ]
        )
        response = _parse_recommendations(client, messages, candidates)
        recommended_ids = {item.product_id for item in response.recommendations}
        recommended_candidates = [item for item in candidates if item["id"] in recommended_ids]
        _record_search(
            prompt,
            recommended_candidates,
            "GROQ",
            max_price=arguments.max_price,
            category=arguments.category,
        )
        return response.model_dump(mode="json")
    except (APIError, AgentServiceError, ValidationError, json.JSONDecodeError, ValueError) as exc:
        reason = "provider request failed" if isinstance(exc, APIError) else "configuration or provider output error"
        return _fallback_response(prompt, reason).model_dump(mode="json")
