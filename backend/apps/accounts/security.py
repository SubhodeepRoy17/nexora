import logging


logger = logging.getLogger("nexora.security")


def _client_ip(request) -> str:
    forwarded = request.META.get("HTTP_X_FORWARDED_FOR", "")
    return (forwarded.split(",", 1)[0].strip() if forwarded else request.META.get("REMOTE_ADDR", ""))[:64]


def log_security_event(request, event: str, *, user_id=None, outcome: str, reason: str = "") -> None:
    logger.info(
        "security_event",
        extra={
            "security_event": {
                "event": event,
                "outcome": outcome,
                "user_id": user_id,
                "client_ip": _client_ip(request),
                "reason": reason[:120],
            }
        },
    )
