# Catalog Data and Attribution

Nexora's expanded buildathon catalog is reproducible and separates imported facts from authored demo scenarios.

## Sources

- `DummyJSON` product records are downloaded from commit `55ca918227aed430409a1ae46271448cb102d7f3` of [Ovi/DummyJSON](https://github.com/Ovi/DummyJSON). That repository is MIT licensed. Nexora imports a bounded subset of electronics and accessories, converts source USD prices to illustrative INR at a fixed ₹83/USD, and marks every record as demo data. The conversion is not a live exchange-rate or merchant offer.
- Keyboard and keyboard-accessory scenarios are authored for Nexora and dedicated to the public domain under CC0-1.0. They exist to exercise quiet, wireless, layout, budget, compatibility, and add-on paths; they are not claims about real brands or current retail listings.

Every seeded `Product` stores `source_name`, `source_url`, `source_license`, and `is_demo`. The command uses a pinned upstream revision so repeated runs are stable and auditable.

## Loading the catalog

```bash
python manage.py seed_open_catalog --external-limit 60
```

The command is idempotent. Use `--skip-external` for the offline CC0 set. Seeded service accounts have unusable passwords and cannot be used to log in.

## Loading the Track demonstration

After configuring the `DEMO_*` account variables, load the login-ready merchant scenario:

```bash
python manage.py seed_track_demo
```

The command is offline, idempotent, and scoped to the configured demo merchant. It creates:

- `Nexora Nomad 75` as the deterministic primary recommendation;
- `Nexora Nomad 75 Travel Case` as the only compatible, available growth offer;
- two legitimate comparison alternatives;
- one active but incompatible relationship that must not be offered;
- one zero-stock relationship that remains inactive and must not be offered.

Recommended successful prompt: `Find a quiet wireless keyboard for travel under ₹9000`.

Recommended no-result prompt: `Find a keyboard under ₹100`.

The primary and accepted add-on total ₹8,498, within the successful prompt's ₹9,000 basket limit. All records use the CC0 provenance above and are marked `is_demo`. The command never deletes products and refuses to overwrite a non-demo product with a colliding title.
