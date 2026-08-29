import re
from collections.abc import Mapping
from decimal import Decimal
from math import fsum
from typing import Any

from django.db import DatabaseError
from django.db.models import Case, ExpressionWrapper, F, FloatField, Q, QuerySet, Value, When
from pgvector.django import CosineDistance
from pydantic import BaseModel, ConfigDict, Field, field_validator

from apps.merchants.embeddings import catalog_text_embedding
from apps.merchants.models import Product
from apps.merchants.schemas import ProductSpecifications
from apps.merchants.vector_setup import vector_index_available


ALLOWED_SPEC_KEYS = frozenset(ProductSpecifications.model_fields)
MAX_SEARCH_RESULTS = 10
SEARCH_STOP_WORDS = {
    "a", "an", "and", "at", "below", "best", "bring", "buy", "compare", "details",
    "find", "for", "from", "gift", "give", "highest", "in", "item", "items", "list",
    "looking", "me", "most", "need", "of", "options", "or", "please", "prefer",
    "prioritize", "product", "products", "rated", "recommend", "result", "shop", "shopping",
    "show", "some", "suggest", "tech", "than", "that", "the", "to", "under", "useful",
    "value", "want", "what", "with", "worth",
}
CATEGORY_ALIASES = {
    "keyboard": "Keyboards",
    "keyboards": "Keyboards",
    "laptop": "Laptops",
    "laptops": "Laptops",
    "phone": "Smartphones",
    "phones": "Smartphones",
    "smartphone": "Smartphones",
    "smartphones": "Smartphones",
    "backpack": "Laptop Backpacks",
    "backpacks": "Laptop Backpacks",
    "tablet": "Tablets",
    "tablets": "Tablets",
    "watch": "Watches",
    "watches": "Watches",
    "smartwatch": "Watches",
    "smartwatches": "Watches",
    "grocery": "Groceries",
    "groceries": "Groceries",
    "furniture": "Furniture",
    "decor": "Home Decoration",
    "decoration": "Home Decoration",
    "appliance": "Kitchen Accessories",
    "appliances": "Kitchen Accessories",
    "beauty": "Beauty",
    "fragrance": "Fragrances",
    "fragrances": "Fragrances",
    "skincare": "Skin Care",
    "shirt": "Shirts",
    "shirts": "Shirts",
    "dress": "Dresses",
    "dresses": "Dresses",
    "shoes": "Shoes",
    "sunglasses": "Sunglasses",
    "jewellery": "Jewellery",
    "handbag": "Bags",
    "handbags": "Bags",
    "mouse": "Mice",
    "mice": "Mice",
    "headphone": "Headphones",
    "headphones": "Headphones",
    "headset": "Headphones",
    "headsets": "Headphones",
    "monitor": "Monitors",
    "monitors": "Monitors",
    "webcam": "Webcams",
    "webcams": "Webcams",
    "hub": "USB Hubs",
    "powerbank": "Power Banks",
    "lamp": "Desk Lamps",
    "lamps": "Desk Lamps",
}
CATEGORY_PHRASE_ALIASES = {
    "keyboard accessory": "Keyboard Accessories",
    "keyboard accessories": "Keyboard Accessories",
    "laptop backpack": "Laptop Backpacks",
    "laptop backpacks": "Laptop Backpacks",
    "laptop stand": "Laptop Stands",
    "laptop stands": "Laptop Stands",
    "power bank": "Power Banks",
    "power banks": "Power Banks",
    "desk lamp": "Desk Lamps",
    "desk lamps": "Desk Lamps",
    "usb hub": "USB Hubs",
    "usb hubs": "USB Hubs",
}
TERM_EXPANSIONS = {
    "mac": ["mac", "macos", "macbook"],
    "macos": ["macos", "mac", "macbook"],
    "silent": ["silent", "quiet"],
    "quiet": ["quiet", "silent"],
    "coding": ["coding", "productivity", "programming"],
    "hot-swappable": ["hot-swappable", "hot-swap", "hotswap"],
    "hotswap": ["hotswap", "hot-swap", "hot-swappable"],
}
COLOR_CANONICAL = {
    color: color.title()
    for color in (
        "black", "white", "red", "blue", "green", "silver", "gold", "pink",
        "purple", "orange", "yellow", "brown", "beige", "graphite",
    )
}
COLOR_CANONICAL.update({"gray": "Gray", "grey": "Grey"})


class ProductSearchSchema(BaseModel):
    """Strict arguments accepted by the merchant catalog search tool."""

    model_config = ConfigDict(extra="forbid", strict=True)

    category: str | None = Field(default=None, min_length=1, max_length=120)
    max_price: float | None = Field(default=None, gt=0)
    min_rating: float | None = Field(default=None, ge=0, le=5)
    required_specs: dict[
        str,
        str | bool | int | float | list[str] | dict[str, float],
    ] = Field(default_factory=dict)
    search_query: str = Field(min_length=1, max_length=500)
    limit: int = Field(default=5, ge=1, le=MAX_SEARCH_RESULTS)

    @field_validator("required_specs")
    @classmethod
    def validate_required_specs(cls, value: dict[str, Any]) -> dict[str, Any]:
        unknown = set(value) - ALLOWED_SPEC_KEYS
        if unknown:
            raise ValueError(f"Unsupported specification keys: {', '.join(sorted(unknown))}")
        return value


def _keyword_concepts(search_query: str) -> list[list[str]]:
    extracted = re.findall(r"[\w+-]+", search_query.lower())
    base_tokens = [
        token for token in dict.fromkeys(extracted)
        if len(token) > 2 and not token.isdigit() and token not in SEARCH_STOP_WORDS
    ][:10]
    return [TERM_EXPANSIONS.get(token, [token]) for token in base_tokens]


def _keyword_tokens(search_query: str) -> list[str]:
    return list(dict.fromkeys(
        token for concept in _keyword_concepts(search_query) for token in concept
    ))[:20]


def _keyword_query(search_query: str) -> Q:
    tokens = _keyword_tokens(search_query)
    if not tokens:
        return Q()

    keyword_query = Q()
    for token in tokens:
        keyword_query |= Q(title__icontains=token)
        keyword_query |= Q(description__icontains=token)
        keyword_query |= Q(category__icontains=token)
        keyword_query |= Q(tags__contains=[token])
    return keyword_query


def _keyword_filter(queryset: QuerySet[Product], search_query: str) -> QuerySet[Product]:
    keyword_query = _keyword_query(search_query)
    return queryset.filter(keyword_query) if keyword_query else queryset


def serialize_product(product: Product) -> dict[str, Any]:
    return {
        "id": product.id,
        "title": product.title,
        "description": product.description,
        "category": product.category,
        "price": str(product.price),
        "compare_at_price": str(product.compare_at_price) if product.compare_at_price else None,
        "image_url": product.image_url,
        "stock_quantity": product.stock_quantity,
        "rating": product.rating,
        "specifications": product.specifications,
        "tags": product.tags,
        "merchant": {
            "id": product.merchant_id,
            "name": product.merchant.name,
        },
        "data_provenance": {
            "source_name": product.source_name,
            "source_url": product.source_url,
            "source_license": product.source_license,
            "is_demo": product.is_demo,
        },
    }


def _flatten_searchable(value: Any) -> str:
    if isinstance(value, Mapping):
        return " ".join(
            f"{key} {_flatten_searchable(item)}" for key, item in value.items()
        )
    if isinstance(value, (list, tuple, set)):
        return " ".join(_flatten_searchable(item) for item in value)
    return str(value or "")


def _contains_term(text: str, term: str) -> bool:
    normalized_text = re.sub(r"[\W_]+", " ", text.casefold()).strip()
    normalized_term = re.sub(r"[\W_]+", " ", term.casefold()).strip()
    if not normalized_term:
        return False
    variants = [normalized_term]
    if " " not in normalized_term and not normalized_term.endswith("s"):
        variants.extend((f"{normalized_term}s", f"{normalized_term}es"))
    return any(
        re.search(rf"(?<!\w){re.escape(variant)}(?!\w)", normalized_text)
        for variant in variants
    )


def _normalized_value(value: Any) -> Any:
    if isinstance(value, str):
        return value.strip().casefold()
    if isinstance(value, list):
        return [_normalized_value(item) for item in value]
    if isinstance(value, Mapping):
        return {key: _normalized_value(item) for key, item in value.items()}
    return value


def _specification_match(actual: Any, expected: Any) -> float:
    normalized_actual = _normalized_value(actual)
    normalized_expected = _normalized_value(expected)
    if isinstance(normalized_expected, list):
        if not isinstance(normalized_actual, list) or not normalized_expected:
            return 0.0
        return (
            sum(item in normalized_actual for item in normalized_expected)
            / len(normalized_expected)
        )
    return 1.0 if normalized_actual == normalized_expected else 0.0


def calculate_match_score(
    candidate: dict[str, Any],
    arguments: ProductSearchSchema | dict[str, Any],
) -> int:
    """Return an explainable prompt-to-product relevance percentage.

    Only requested dimensions enter the denominator. Text intent combines
    field-weighted token coverage with the same local semantic embedding used
    by retrieval; explicit category, budget, rating, and specification rules
    are scored independently.
    """

    search = (
        arguments
        if isinstance(arguments, ProductSearchSchema)
        else ProductSearchSchema.model_validate(arguments)
    )
    components: list[tuple[float, float]] = []
    concepts = _keyword_concepts(search.search_query)
    if concepts:
        fields = (
            (str(candidate.get("title") or "").casefold(), 1.0),
            (str(candidate.get("category") or "").casefold(), 0.95),
            (_flatten_searchable(candidate.get("tags") or []).casefold(), 0.85),
            (_flatten_searchable(candidate.get("specifications") or {}), 0.8),
            (str(candidate.get("description") or "").casefold(), 0.65),
        )
        lexical_coverage = sum(
            max(
                (
                    weight
                    for text, weight in fields
                    if any(_contains_term(text, token) for token in concept)
                ),
                default=0.0,
            )
            for concept in concepts
        ) / len(concepts)
        query_vector = catalog_text_embedding(
            search.search_query, search.category, search.required_specs
        )
        product_vector = catalog_text_embedding(
            candidate.get("title"), candidate.get("description"),
            candidate.get("category"), candidate.get("specifications"),
            candidate.get("tags"),
        )
        semantic_similarity = max(
            0.0,
            min(
                1.0,
                fsum(left * right for left, right in zip(query_vector, product_vector)),
            ),
        )
        components.append((0.75 * lexical_coverage + 0.25 * semantic_similarity, 55.0))

    if search.category:
        requested = search.category.casefold()
        actual = str(candidate.get("category") or "").casefold()
        components.append((1.0 if requested in actual else 0.0, 20.0))
    if search.max_price is not None:
        price = Decimal(str(candidate.get("price") or 0))
        components.append((1.0 if price <= Decimal(str(search.max_price)) else 0.0, 10.0))
    if search.min_rating is not None:
        rating = float(candidate.get("rating") or 0)
        components.append((1.0 if rating >= search.min_rating else 0.0, 5.0))
    if search.required_specs:
        specifications = candidate.get("specifications") or {}
        spec_score = sum(
            _specification_match(specifications.get(key), expected)
            for key, expected in search.required_specs.items()
        ) / len(search.required_specs)
        components.append((spec_score, 25.0))

    if not components:
        return 100
    weighted_score = sum(score * weight for score, weight in components)
    total_weight = sum(weight for _, weight in components)
    return max(0, min(100, round(100 * weighted_score / total_weight)))


def search_merchant_products(arguments: ProductSearchSchema | dict[str, Any]) -> list[dict[str, Any]]:
    """Hybrid SQL filtering plus pgvector cosine ranking with a SQL fallback."""

    search = arguments if isinstance(arguments, ProductSearchSchema) else ProductSearchSchema.model_validate(arguments)
    queryset = Product.objects.select_related("merchant").filter(is_active=True, stock_quantity__gt=0)

    if search.category:
        queryset = queryset.filter(category__icontains=search.category)
    if search.max_price is not None:
        queryset = queryset.filter(price__lte=Decimal(str(search.max_price)))
    if search.min_rating is not None:
        queryset = queryset.filter(rating__gte=search.min_rating)
    for key, value in search.required_specs.items():
        if isinstance(value, list):
            for item in value:
                queryset = queryset.filter(**{f"specifications__{key}__contains": [item]})
        else:
            queryset = queryset.filter(**{f"specifications__{key}": value})

    search_tokens = _keyword_tokens(search.search_query)
    sql_queryset = _keyword_filter(queryset, search.search_query)
    keyword_query = _keyword_query(search.search_query)
    query_embedding = catalog_text_embedding(search.search_query, search.category, search.required_specs)

    pool_limit = max(25, search.limit * 5)
    if not vector_index_available():
        # Never broaden a meaningful product phrase to every item that merely
        # satisfies the budget. Constraint-only queries may still browse all
        # matching inventory.
        ranked_queryset = sql_queryset if search_tokens else queryset
        products = list(ranked_queryset.order_by("-rating", "price", "-stock_quantity")[:pool_limit])
    else:
        try:
            relevant_queryset = sql_queryset if search_tokens else queryset
            vector_queryset = relevant_queryset.filter(semantic_index__embedding__isnull=False).annotate(
                semantic_distance=CosineDistance("semantic_index__embedding", query_embedding),
                keyword_bonus=Case(
                    When(keyword_query, then=Value(0.25)),
                    default=Value(0.0),
                    output_field=FloatField(),
                ) if keyword_query else Value(0.0, output_field=FloatField()),
            ).annotate(
                hybrid_score=ExpressionWrapper(
                    (Value(1.0) - F("semantic_distance")) * Value(0.75) + F("keyword_bonus"),
                    output_field=FloatField(),
                )
            )
            products = list(vector_queryset.order_by("-hybrid_score", "-rating", "price")[:pool_limit])
            if not products:
                ranked_queryset = sql_queryset if search_tokens else queryset
                products = list(ranked_queryset.order_by("-rating", "price", "-stock_quantity")[:pool_limit])
        except DatabaseError:
            ranked_queryset = sql_queryset if search_tokens else queryset
            products = list(ranked_queryset.order_by("-rating", "price", "-stock_quantity")[:pool_limit])
    candidates = [serialize_product(product) for product in products]
    for candidate in candidates:
        candidate["match_score"] = calculate_match_score(candidate, search)
    return sorted(
        candidates,
        key=lambda item: (-item["match_score"], -item["rating"], Decimal(item["price"])),
    )[: search.limit]


def extract_max_price(user_prompt: str) -> float | None:
    compact_prompt = user_prompt.replace(",", "")
    budget_match = re.search(
        r"(?:under|below|less than|max(?:imum)?|budget(?: of)?)\s*"
        r"(?:(?:worth|value|price|priced)\s*(?:of|at)?\s*)?"
        r"(?:₹|rs\.?|inr)?\s*(\d+(?:\.\d+)?)\s*(k|l|lakh)?",
        compact_prompt,
        flags=re.IGNORECASE,
    )
    max_price = None
    if budget_match:
        max_price = float(budget_match.group(1))
        suffix = (budget_match.group(2) or "").lower()
        if suffix == "k":
            max_price *= 1_000
        elif suffix in {"l", "lakh"}:
            max_price *= 100_000

    return max_price


def extract_category(user_prompt: str) -> str | None:
    lowered = user_prompt.lower()
    phrase_match = next((
        category for phrase, category in CATEGORY_PHRASE_ALIASES.items()
        if re.search(rf"\b{re.escape(phrase)}\b", lowered)
    ), None)
    if phrase_match:
        return phrase_match
    tokens = re.findall(r"[\w-]+", lowered)
    return next((CATEGORY_ALIASES[token] for token in tokens if token in CATEGORY_ALIASES), None)


def extract_required_specs(user_prompt: str) -> dict[str, Any]:
    """Retain only explicit, reliably parsed structured constraints."""

    lowered = user_prompt.lower()
    category_terms = "|".join(sorted(CATEGORY_ALIASES, key=len, reverse=True))
    color_terms = "|".join(COLOR_CANONICAL)
    patterns = (
        rf"\b(?:in|color|colour)\s+(?P<color>{color_terms})\b",
        rf"\b(?P<color>{color_terms})\s+(?:colored?\s+|coloured?\s+)?(?:{category_terms})\b",
        rf"\b(?:{category_terms})\s+(?:in\s+)?(?P<color>{color_terms})\b",
    )
    specifications = {}
    for pattern in patterns:
        match = re.search(pattern, lowered)
        if match:
            specifications["color"] = COLOR_CANONICAL[match.group("color")]
            break
    if re.search(r"\b(?:hot[\s-]?swappable|hot[\s-]?swap|hotswap)\b", lowered):
        specifications["hot_swappable"] = True
    return specifications


def deterministic_search_arguments(user_prompt: str, limit: int = 5) -> ProductSearchSchema:
    """Parse reliable hard constraints without allowing prose to over-constrain retrieval."""

    return ProductSearchSchema(
        search_query=user_prompt,
        category=extract_category(user_prompt),
        max_price=extract_max_price(user_prompt),
        required_specs=extract_required_specs(user_prompt),
        limit=min(limit, MAX_SEARCH_RESULTS),
    )


def fallback_product_search(user_prompt: str, limit: int = 5) -> list[dict[str, Any]]:
    """Deterministic keyword/price fallback used when model inference is unavailable."""

    return search_merchant_products(deterministic_search_arguments(user_prompt, limit))


SEARCH_MERCHANT_PRODUCTS_FUNCTION = {
    "name": "search_merchant_products",
    "description": (
        "Search the Nexora merchant catalog for active, in-stock products. "
        "Use explicit price, category, rating, and structured specification constraints from the buyer intent."
    ),
    "parameters_json_schema": ProductSearchSchema.model_json_schema(),
}
