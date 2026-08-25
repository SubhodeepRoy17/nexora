from django.conf import settings
from django.core import signing


SALT = "nexora.anonymous-conversation.v1"


def issue_anonymous_conversation_token(conversation) -> str:
    return signing.dumps(
        {"conversation_id": str(conversation.conversation_id)}, salt=SALT, compress=True
    )


def read_anonymous_conversation_token(token: str) -> dict:
    return signing.loads(
        token,
        salt=SALT,
        max_age=getattr(settings, "CHAT_ANONYMOUS_TOKEN_TTL_SECONDS", 43_200),
    )
