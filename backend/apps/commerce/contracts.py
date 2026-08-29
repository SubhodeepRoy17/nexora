from django.conf import settings
from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field


CONTRACT_VERSION = "1.0.0"
API_VERSION = "v1"


class ContractModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class MerchantIdentityContract(ContractModel):
    id: int
    name: str


class AvailabilityContract(ContractModel):
    available: bool
    stock_quantity: int = Field(ge=1)


class RelatedProductContract(ContractModel):
    id: int
    title: str
    merchant: str
    category: str
    price: Decimal = Field(ge=0)
    compare_at_price: Decimal | None = Field(default=None, ge=0)
    image_url: str = ""
    currency: str
    available: bool
    updated_at: datetime


class RelationshipContract(ContractModel):
    id: int
    relationship_type: Literal["ACCESSORY", "COMPLEMENT", "SUBSTITUTE", "BUNDLE"]
    related_product: RelatedProductContract
    compatibility: dict[str, Any]
    benefit: str
    trade_off: str
    offer_label: str
    updated_at: datetime


class CatalogProductContract(ContractModel):
    id: int
    merchant: MerchantIdentityContract
    title: str
    description: str
    category: str
    price: Decimal = Field(ge=0)
    compare_at_price: Decimal | None = Field(default=None, ge=0)
    image_url: str = ""
    currency: str
    availability: AvailabilityContract
    rating: float = Field(ge=0, le=5)
    specifications: dict[str, Any]
    tags: list[str]
    relationships: list[RelationshipContract]
    updated_at: datetime


def product_schema():
    schema = CatalogProductContract.model_json_schema()
    schema.update(
        {
            "$schema": "https://json-schema.org/draft/2020-12/schema",
            "$id": "https://nexora.example/schemas/commerce-v1-product.json",
            "title": "Nexora commerce catalog product",
        }
    )
    schema["properties"]["currency"] = {"const": settings.MONEY_SUPPORTED_CURRENCY}
    return schema


def openapi_document(base_url: str):
    return {
        "openapi": "3.1.0",
        "info": {
            "title": "Nexora Agent Commerce API",
            "version": CONTRACT_VERSION,
            "description": "Human-approved, test-mode agent commerce contract.",
        },
        "servers": [{"url": base_url.rstrip("/")}],
        "paths": {
            "/api/commerce/v1/catalog/products/": {
                "get": {
                    "operationId": "discoverProducts",
                    "parameters": [
                        {"name": "q", "in": "query", "schema": {"type": "string", "maxLength": 200}},
                        {"name": "category", "in": "query", "schema": {"type": "string", "maxLength": 120}},
                        {"name": "merchant_id", "in": "query", "schema": {"type": "integer"}},
                        {"name": "min_price", "in": "query", "schema": {"type": "number", "minimum": 0}},
                        {"name": "max_price", "in": "query", "schema": {"type": "number", "minimum": 0}},
                        {"name": "cursor", "in": "query", "schema": {"type": "string"}},
                    ],
                    "responses": {"200": {"description": "Cursor-paginated active catalog"}},
                }
            },
            "/api/commerce/v1/catalog/products/{product_id}/": {
                "get": {
                    "operationId": "getProduct",
                    "parameters": [{"$ref": "#/components/parameters/ProductId"}],
                    "responses": {
                        "200": {
                            "description": "Eligible public product",
                            "content": {
                                "application/json": {
                                    "schema": {"$ref": "#/components/schemas/CatalogProduct"}
                                }
                            },
                        },
                        "404": {"description": "Product unavailable"},
                    },
                }
            },
            "/api/commerce/v1/catalog/merchants/": {
                "get": {
                    "operationId": "discoverMerchants",
                    "responses": {"200": {"description": "Eligible public merchants"}},
                }
            },
            "/api/commerce/v1/quotes/": {
                "post": {
                    "operationId": "createExactQuote",
                    "security": [{"cookieSession": [], "csrfHeader": []}],
                    "parameters": [{"name": "Idempotency-Key", "in": "header", "required": True, "schema": {"type": "string"}}],
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/QuoteRequest"}
                            }
                        },
                    },
                    "responses": {"201": {"description": "Exact expiring server quote"}},
                }
            },
            "/api/commerce/v1/quotes/{quote_id}/approve/": {
                "post": {
                    "operationId": "recordHumanApproval",
                    "security": [{"cookieSession": [], "csrfHeader": []}],
                    "parameters": [
                        {"$ref": "#/components/parameters/QuoteId"},
                        {"$ref": "#/components/parameters/IdempotencyKey"},
                    ],
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "properties": {"confirmed": {"const": True}},
                                    "required": ["confirmed"],
                                    "additionalProperties": False,
                                }
                            }
                        },
                    },
                    "responses": {"201": {"description": "Short-lived signed approval grant"}},
                }
            },
            "/api/commerce/v1/checkout-orders/": {
                "post": {
                    "operationId": "createRazorpayHandoff",
                    "security": [{"cookieSession": [], "csrfHeader": []}],
                    "parameters": [{"$ref": "#/components/parameters/IdempotencyKey"}],
                    "requestBody": {
                        "required": True,
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/CheckoutRequest"}
                            }
                        },
                    },
                    "responses": {"201": {"description": "Razorpay test checkout handoff"}},
                }
            },
            "/api/commerce/v1/orders/{order_id}/": {
                "get": {
                    "operationId": "getAuthoritativeOrderStatus",
                    "security": [{"cookieSession": []}],
                    "parameters": [{"$ref": "#/components/parameters/OrderId"}],
                    "responses": {"200": {"description": "Webhook-authoritative order"}},
                }
            },
            "/api/commerce/v1/policies/money-actions/": {
                "get": {
                    "operationId": "getMoneyActionPolicy",
                    "responses": {"200": {"description": "Current deterministic limits"}},
                }
            },
        },
        "components": {
            "securitySchemes": {
                "cookieSession": {"type": "apiKey", "in": "cookie", "name": "sessionid"},
                "csrfHeader": {"type": "apiKey", "in": "header", "name": "X-CSRFToken"},
            },
            "parameters": {
                "IdempotencyKey": {
                    "name": "Idempotency-Key", "in": "header", "required": True,
                    "schema": {"type": "string", "minLength": 8, "maxLength": 128},
                },
                "ProductId": {
                    "name": "product_id", "in": "path", "required": True,
                    "schema": {"type": "integer", "minimum": 1},
                },
                "QuoteId": {
                    "name": "quote_id", "in": "path", "required": True,
                    "schema": {"type": "string", "format": "uuid"},
                },
                "OrderId": {
                    "name": "order_id", "in": "path", "required": True,
                    "schema": {"type": "string", "format": "uuid"},
                },
            },
            "schemas": {
                "CatalogProduct": product_schema(),
                "QuoteRequest": {
                    "type": "object",
                    "properties": {
                        "intent": {"type": "string", "maxLength": 2000},
                        "items": {
                            "type": "array", "minItems": 1,
                            "maxItems": settings.ORDER_MAX_CART_ITEMS,
                            "items": {
                                "type": "object",
                                "properties": {
                                    "product_id": {"type": "integer", "minimum": 1},
                                    "quantity": {
                                        "type": "integer", "minimum": 1,
                                        "maximum": settings.MONEY_MAX_ITEM_QUANTITY,
                                    },
                                },
                                "required": ["product_id", "quantity"],
                                "additionalProperties": False,
                            },
                        },
                    },
                    "required": ["items"],
                    "additionalProperties": False,
                },
                "CheckoutRequest": {
                    "type": "object",
                    "properties": {
                        "quote_id": {"type": "string", "format": "uuid"},
                        "approval_token": {"type": "string"},
                    },
                    "required": ["quote_id", "approval_token"],
                    "additionalProperties": False,
                },
            },
        },
    }
