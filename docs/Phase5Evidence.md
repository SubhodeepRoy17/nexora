# P0.5 Evidence — Clean CI Quality Gate

Implemented on 2026-08-26. Phase 4 was first verified from `docs/Phase4Evidence.md`, its one-command
Playwright harness, and commit `bc697f1` on `main`. Phase 5 makes those claims reproducible from a
clean GitHub-hosted runner rather than relying on a developer workstation.

## Required gate

`.github/workflows/ci.yml` runs for every pull request, push to `main`, and manual dispatch. Its final
`Phase 5 required gate` succeeds only when every independent job succeeds:

| Gate | Clean-run evidence |
| --- | --- |
| Backend | PostgreSQL 16 with pgvector 0.8.6, hash-locked Python install, Django system check, migration drift check, migrations, vector index setup, and every non-browser backend suite |
| Frontend | npm lockfile install, Vitest suite, production Vite build, and a high-severity production dependency audit |
| Critical E2E | Fresh Python and npm installs, isolated pgvector database, and the P0.4 Playwright buyer/merchant journey plus HTTP-only reference buyer |
| Security | Full-history Gitleaks scan and a machine-readable `pip-audit` report against the hash-locked backend graph |

Each job publishes its logs or JSON report as a 14-day `phase5-*` artifact. The final job also writes
the four outcomes to the GitHub Actions run summary. Third-party actions are pinned to immutable
commit SHAs, workflow permissions are read-only, and concurrent stale runs are cancelled.
`.gitleaks.toml` contains one exact-value exception for the public, fixed idempotency-key example in
`docs/API.md`; it does not exempt a file, secret class, or general key pattern.

## Reproducible dependencies and audit remediation

`backend/requirements.lock` pins every transitive Python package with package-index hashes; CI
installs it with `pip --require-hashes`. The frontend already uses `package-lock.json` and CI installs
it with `npm ci`. Dependabot is configured weekly for pip, npm, and GitHub Actions so updates arrive
as separately testable pull requests.

The initial backend audit exposed a setuptools advisory pulled in solely because Razorpay's Python
SDK imported the removed `pkg_resources` API. Upgrading setuptools would break that SDK. Nexora now
uses `apps/orders/razorpay_gateway.py`, a deliberately narrow HTTP adapter for only the five provider
operations the application needs: create/fetch order, list order payments, fetch payment, and create
refund. It retains HTTP Basic authentication, bounded timeouts, typed failure handling, escaped
resource IDs, constant-time checkout/webhook HMAC verification, and the existing provider-authority
money-state rules. Adapter tests cover endpoints, authentication, payloads, signatures, path safety,
and malformed/rejected responses. The obsolete Razorpay SDK and runtime setuptools dependency were
then removed; `pip-audit` reports no known vulnerabilities in the resulting lock.

## Local verification commands

Use Python 3.12, Node 22, PostgreSQL with pgvector, and the environment variables in
`backend/.env.example`:

```bash
python -m pip install --require-hashes -r backend/requirements.lock
cd backend
python manage.py check
python manage.py makemigrations --check --dry-run
python manage.py migrate --noinput
python manage.py setup_pgvector
python manage.py test apps.accounts apps.merchants apps.agents apps.orders apps.analytics apps.commerce --keepdb

cd ../frontend
npm ci
npm test
npm run build
npm run test:e2e
```

Security parity commands are `pip-audit -r backend/requirements.lock` and
`npm audit --omit=dev --audit-level=high`. Gitleaks runs against complete Git history in CI, where a
fresh clone and the provider service container supply the final acceptance boundary.

## Scope boundary

This gate proves deterministic provider-double E2E, application invariants, build reproducibility,
and dependency/secret scanning. It does not claim public Razorpay webhook delivery or redelivery;
that remains the P0.7 deployed-sandbox requirement. It also does not claim causal merchant revenue
lift, which remains the P1 evaluation workstream.
