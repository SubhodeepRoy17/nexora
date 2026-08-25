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
