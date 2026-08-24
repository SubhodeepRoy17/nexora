import hashlib
import json
import re

from .policy import ReasonCode


KEY_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{8,128}$")


class IdempotencyKeyError(ValueError):
    def __init__(self, reason_code):
        self.reason_code = reason_code
        super().__init__(reason_code)


def require_idempotency_key(request) -> str:
    key = request.headers.get("Idempotency-Key", "")
    if not key:
        raise IdempotencyKeyError(ReasonCode.IDEMPOTENCY_KEY_REQUIRED)
    if not KEY_PATTERN.fullmatch(key):
        raise IdempotencyKeyError(ReasonCode.IDEMPOTENCY_KEY_INVALID)
    return key


def request_fingerprint(payload) -> str:
    canonical = json.dumps(payload, sort_keys=True, separators=(",", ":"), default=str)
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()
