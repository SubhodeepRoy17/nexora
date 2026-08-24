import hashlib
import math
import re
from typing import Any


EMBEDDING_DIMENSIONS = 128


def catalog_text_embedding(*parts: Any) -> list[float]:
    """Create a stable, local feature-hash embedding without an external provider."""

    text = " ".join(str(part) for part in parts if part is not None).lower()
    words = re.findall(r"[a-z0-9]+", text)
    features = [*words, *(f"{left}_{right}" for left, right in zip(words, words[1:]))]
    vector = [0.0] * EMBEDDING_DIMENSIONS
    for feature in features:
        digest = hashlib.blake2b(feature.encode("utf-8"), digest_size=8).digest()
        bucket = int.from_bytes(digest[:4], "big") % EMBEDDING_DIMENSIONS
        sign = 1.0 if digest[4] & 1 else -1.0
        vector[bucket] += sign

    norm = math.sqrt(sum(value * value for value in vector))
    return [value / norm for value in vector] if norm else vector
