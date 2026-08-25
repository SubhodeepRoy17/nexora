# Neon PostgreSQL Runbook

This runbook moves Nexora from the developer's local PostgreSQL database to a
shared Neon database without putting credentials in Git. Treat the connection
string as a password.

## 1. Create the destination

1. Create a Neon project named `nexora` in the region closest to the deployed
   Django backend.
2. Prefer the same PostgreSQL major version as the local source when available.
3. In **Connect**, select the `main` branch and copy the **direct** connection
   string. Keep `sslmode=require&channel_binding=require` in the URL.
4. Do not paste the real URL into documentation, screenshots, issues, or chat.

Use a direct connection for `pg_dump`, `pg_restore`, and Django migrations.
Neon's pooled hostname contains `-pooler`; it is intended for application
traffic and must not be used for the migration.

## 2. Back up the local source

Keep the application stopped for the final dump so no writes are missed. Create
a custom-format archive outside the repository:

```bash
pg_dump --format=custom --verbose --no-owner --no-acl \
  --dbname="postgresql://LOCAL_USER:LOCAL_PASSWORD@localhost:5432/nexora" \
  --file="nexora-before-neon.dump"
```

Do not delete the local database or this backup during the cutover.

## 3. Restore into Neon

For a new, empty Neon database, restore the archive using the direct URL:

```bash
pg_restore --verbose --no-owner --no-acl \
  --dbname="$NEON_DIRECT_DATABASE_URL" \
  "nexora-before-neon.dump"
```

If the destination is not empty, stop and inspect it. Do not add `--clean` or
drop objects without a separate backup and explicit approval.

Nexora's migration enables `vector` when Neon exposes it, recreates the managed
embedding table and HNSW index, and retains indexed SQL fallback. After restore:

```bash
DATABASE_URL="$NEON_DIRECT_DATABASE_URL" python manage.py migrate
DATABASE_URL="$NEON_DIRECT_DATABASE_URL" python manage.py setup_pgvector
DATABASE_URL="$NEON_DIRECT_DATABASE_URL" python manage.py check
```

## 4. Validate before cutover

Compare source and destination counts for users, merchants, products, orders,
order items, webhook events, refunds, and audit events. Then exercise:

- health endpoint and authentication;
- merchant catalog and workspace;
- buyer conversation/order history;
- one non-money catalog search;
- payment configuration checks without initiating a charge.

Only after those checks pass, set the deployed backend's secret
`DATABASE_URL` to the Neon **direct** URL and redeploy. Nexora's current Render
Blueprint uses one URL for build-time migrations and runtime, so direct is the
safe default. If runtime pooling is introduced later, keep a separate direct
migration URL.

Set `POSTGRES_SSLMODE=require` as defense in depth. The URL's
`channel_binding=require` is preserved by Django settings. Apply the same
database secret to the expiry and Razorpay reconciliation workers.

## 5. Rollback

If validation fails, restore the deployed backend's previous database secret
and redeploy. The retained local database remains the source of truth until the
Neon cutover is verified. Never allow both databases to accept production writes
at the same time.
