import re
from decimal import Decimal
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
}
TERM_EXPANSIONS = {
    "mac": ["macos"],
    "macos": ["macos", "mac"],
    "silent": ["silent", "quiet"],
    "quiet": ["quiet", "silent"],
    "coding": ["coding", "productivity"],
    "hot-swappable": ["hot-swap"],
    "hotswap": ["hot-swap"],
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


def _keyword_tokens(search_query: str) -> list[str]:
    extracted = re.findall(r"[\w+-]+", search_query.lower())
    base_tokens = [
        token for token in dict.fromkeys(extracted)
        if len(token) > 2 and not token.isdigit() and token not in SEARCH_STOP_WORDS
    ][:10]
    tokens = []
    for token in base_tokens:
        tokens.extend(TERM_EXPANSIONS.get(token, [token]))
    return list(dict.fromkeys(tokens))[:12]


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

    if not vector_index_available():
        # Never broaden a meaningful product phrase to every item that merely
        # satisfies the budget. Constraint-only queries may still browse all
        # matching inventory.
        ranked_queryset = sql_queryset if search_tokens else queryset
        products = list(ranked_queryset.order_by("-rating", "price", "-stock_quantity")[: search.limit])
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
            products = list(vector_queryset.order_by("-hybrid_score", "-rating", "price")[: search.limit])
            if not products:
                ranked_queryset = sql_queryset if search_tokens else queryset
                products = list(ranked_queryset.order_by("-rating", "price", "-stock_quantity")[: search.limit])
        except DatabaseError:
            ranked_queryset = sql_queryset if search_tokens else queryset
            products = list(ranked_queryset.order_by("-rating", "price", "-stock_quantity")[: search.limit])
    return [serialize_product(product) for product in products]


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
    tokens = re.findall(r"[\w-]+", user_prompt.lower())
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
    for pattern in patterns:
        match = re.search(pattern, lowered)
        if match:
            return {"color": COLOR_CANONICAL[match.group("color")]}
    return {}


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
