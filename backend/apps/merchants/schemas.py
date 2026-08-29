from typing import Annotated, Any

from django.core.exceptions import ValidationError as DjangoValidationError
from pydantic import BaseModel, ConfigDict, Field, ValidationError, field_validator


NonEmptyText = Annotated[str, Field(strict=True, min_length=1, max_length=200)]


class Dimensions(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)

    width_mm: float | None = Field(default=None, gt=0)
    depth_mm: float | None = Field(default=None, gt=0)
    height_mm: float | None = Field(default=None, gt=0)
    weight_grams: float | None = Field(default=None, gt=0)


class ProductSpecifications(BaseModel):
    """Category-neutral product attributes exposed to buyer-agent tools."""

    model_config = ConfigDict(extra="forbid", strict=True)

    switches: NonEmptyText | None = None
    connectivity: list[NonEmptyText] = Field(default_factory=list, max_length=8)
    battery_life_hours: float | None = Field(default=None, ge=0)
    dimensions: Dimensions | None = None
    layout: NonEmptyText | None = None
    keycaps: NonEmptyText | None = None
    hot_swappable: bool | None = None
    color: NonEmptyText | None = None
    material: NonEmptyText | None = None
    warranty_months: int | None = Field(default=None, ge=0, le=240)
    brand: NonEmptyText | None = None
    sku: NonEmptyText | None = None
    shipping_information: NonEmptyText | None = None
    return_policy: NonEmptyText | None = None

    @field_validator("connectivity")
    @classmethod
    def connectivity_must_be_unique(cls, value: list[str]) -> list[str]:
        normalized = [item.strip() for item in value]
        if len(normalized) != len(set(item.casefold() for item in normalized)):
            raise ValueError("connectivity values must be unique")
        return normalized


def validate_specifications(value: Any) -> dict:
    try:
        return ProductSpecifications.model_validate(value).model_dump(exclude_none=True)
    except ValidationError as exc:
        raise DjangoValidationError(
            "Specifications do not match catalog.product.v1.",
            params={"errors": exc.errors(include_url=False)},
        ) from exc


def validate_tags(value: Any) -> list[str]:
    if not isinstance(value, list):
        raise DjangoValidationError("Tags must be a JSON array of strings.")
    if len(value) > 30:
        raise DjangoValidationError("A product may have at most 30 tags.")

    normalized = []
    for tag in value:
        if not isinstance(tag, str):
            raise DjangoValidationError("Every tag must be a string.")
        clean_tag = tag.strip().lower()
        if not clean_tag or len(clean_tag) > 50:
            raise DjangoValidationError("Tags must contain 1 to 50 characters.")
        normalized.append(clean_tag)

    if len(normalized) != len(set(normalized)):
        raise DjangoValidationError("Tags must be unique.")
    return normalized
