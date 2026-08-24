import hashlib

from django.conf import settings
from django.core import signing


DECISION_SALT = "nexora.money.decision.v1"
APPROVAL_SALT = "nexora.money.approval.v1"
GROWTH_OFFER_SALT = "nexora.growth.offer.v1"


def issue_decision_token(session, decision) -> str:
    return signing.dumps(
        {
            "session_id": str(session.session_id),
            "decision_id": str(decision.decision_id),
            "product_id": decision.product_id,
        },
        salt=DECISION_SALT,
        compress=True,
    )


def read_decision_token(token: str) -> dict:
    return signing.loads(
        token,
        salt=DECISION_SALT,
        max_age=settings.MONEY_DECISION_TOKEN_TTL_SECONDS,
    )


def issue_growth_offer_token(offer) -> str:
    return signing.dumps(
        {
            "offer_id": str(offer.offer_id),
            "session_id": str(offer.session_id),
            "decision_id": str(offer.addon_decision_id),
            "product_id": offer.product_id,
        },
        salt=GROWTH_OFFER_SALT,
        compress=True,
    )


def read_growth_offer_token(token: str) -> dict:
    return signing.loads(
        token,
        salt=GROWTH_OFFER_SALT,
        max_age=settings.MONEY_DECISION_TOKEN_TTL_SECONDS,
    )


def issue_approval_token(grant) -> str:
    quote = grant.quote
    return signing.Signer(salt=APPROVAL_SALT).sign_object(
        {
            "grant_id": str(grant.grant_id),
            "quote_id": str(quote.quote_id),
            "buyer_id": grant.buyer_id,
            "total_amount": str(quote.total_amount),
            "currency": quote.currency,
        },
        compress=True,
    )


def read_approval_token(token: str) -> dict:
    return signing.Signer(salt=APPROVAL_SALT).unsign_object(token)


def token_digest(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()
