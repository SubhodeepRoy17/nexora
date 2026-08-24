from functools import lru_cache

from django.db import DatabaseError
from django.db import connections

from .embeddings import catalog_text_embedding


@lru_cache(maxsize=4)
def vector_index_available(using: str = "default") -> bool:
    try:
        with connections[using].cursor() as cursor:
            cursor.execute("SELECT to_regclass('merchants_product_embedding') IS NOT NULL")
            return bool(cursor.fetchone()[0])
    except DatabaseError:
        return False


def setup_vector_index(using: str = "default") -> bool:
    """Create/backfill the optional pgvector table when server binaries exist."""

    connection = connections[using]
    with connection.cursor() as cursor:
        cursor.execute("SELECT EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'vector')")
        if not cursor.fetchone()[0]:
            vector_index_available.cache_clear()
            return False
        cursor.execute("CREATE EXTENSION IF NOT EXISTS vector")
        cursor.execute(
            """
            CREATE TABLE IF NOT EXISTS merchants_product_embedding (
                product_id bigint PRIMARY KEY REFERENCES merchants_product(id) ON DELETE CASCADE,
                embedding vector(128) NOT NULL,
                updated_at timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )
        cursor.execute(
            """
            CREATE INDEX IF NOT EXISTS product_embedding_hnsw
            ON merchants_product_embedding
            USING hnsw (embedding vector_cosine_ops)
            WITH (m = 16, ef_construction = 64)
            """
        )
        cursor.execute(
            "SELECT id, title, description, category, specifications, tags FROM merchants_product"
        )
        products = cursor.fetchall()
        for product_id, title, description, category, specifications, tags in products:
            embedding = catalog_text_embedding(title, description, category, specifications, tags)
            vector_literal = "[" + ",".join(f"{value:.10f}" for value in embedding) + "]"
            cursor.execute(
                """
                INSERT INTO merchants_product_embedding (product_id, embedding, updated_at)
                VALUES (%s, %s::vector, CURRENT_TIMESTAMP)
                ON CONFLICT (product_id) DO UPDATE
                SET embedding = EXCLUDED.embedding, updated_at = CURRENT_TIMESTAMP
                """,
                [product_id, vector_literal],
            )
    vector_index_available.cache_clear()
    return True
