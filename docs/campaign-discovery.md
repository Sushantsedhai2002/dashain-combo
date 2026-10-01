# Campaign discovery rollout

Implemented from changesNew.md on 1 October 2026. The first campaign is LG Dashain/Tihar 2083 at CG Digital, scoped to its washing-machine price table. The original source identity is preserved. A production-safe, robots-aware live dry-run returned 19 candidates, 15 with category-specific detergent gifts. The saved HTML fixture is the 160,206-character response, not synthetic inventory. The FAQ does not state a campaign end; JSON-LD price validity is not treated as a blanket gift deadline. Stock remains unknown.

## Run locally or deploy

1. Set DATABASE_URL for the target database and run `pnpm catalog:migrate`. The ingestion runtime applies its own additive migrations.
2. Run `pnpm ingestion:once --dry-run --source cg-digital` to independently verify current access.
3. Run `pnpm ingestion:once --source cg-digital` to publish. This uses current live evidence, not the fixture.
4. Start the web server with `DEFAULT_OFFER_SCOPE=DASHAIN pnpm web:start` after publication. Until explicitly activated, All offers remains the compatibility default.
5. Start `pnpm ingestion:worker`. Inspect `scripts/coverage-report.sql` using psql to see source outcomes, quarantine reasons, campaigns, products, stale inventory and price observations.

Example shareable search: `/?scope=DASHAIN&q=washer+under+60k&type=GIFT_WITH_PURCHASE`. Budget values in URLs are NPR major units; catalog values are integer minor units. Missing prices never match a budget. No stock claim is inferred from a price table.

## Storage and recovery

`config/postgres.compose.yml` remains disposable test storage. Production uses `config/postgres.production.compose.yml` with a named persistent volume and a required POSTGRES_PASSWORD. Run it under a distinct Compose project (`docker compose -p dashain-production -f config/postgres.production.compose.yml up -d`). Keep database access on localhost.

Use `sh scripts/catalog-backup.sh /secure/path/catalog.dump` with DATABASE_URL and an installed PostgreSQL client. Store copies outside the VPS. Verify backups by restoring into an empty disposable test database with `RESTORE_TEST_DATABASE_URL=... sh scripts/catalog-restore-check.sh /secure/path/catalog.dump`. Never restore over the live catalog. This repository does not deploy a production database or claim a production restore has occurred.

## Boundaries and next coverage work

The pilot delivers campaign → eligible product → gift → search/budget → seller navigation. Other existing adapters remain general-offer collectors unless they explicitly supply campaign evidence. Daraz festival inventory, additional electronics/fashion/grocery campaign adapters, structured source-specific payment terms, and OCR need separately verified collection contracts. No inventory is fabricated to fill those gaps.

The contract preserves unresolved BS dates; a general verified BS calendar converter is not yet enabled. Comparison pages require identical brand, model and variant, and reject differing bundle compositions. User reports, analytics and watchlists remain expansion work. The cost utility computes individual eligible cashback scenarios, not automatic stacking of unrelated offers. Source-health reporting is SQL for operators, not a public coverage dashboard.

Evidence is a source URL, fetch timestamp, SHA-256, excerpt/structured path, extraction version, and supported field names. This is stored in the offer aggregate; raw full HTML is retained as a development fixture for the pilot. Price history is stored separately. Qualification and freshness are independent of the 20-day fallback lifecycle.

Automated test annotations verify the bounded saved source table and negative variants; they do not measure complete source recall or establish continuing live inventory. Re-run the live dry-run when assessing access.

## Validation recorded on 1 October 2026

- `pnpm check`: 282 tests passed, formatting/lint/typecheck/build and registry validation passed; line coverage 94.59%.
- Catalog PostgreSQL integration: 31 tests passed. Ingestion PostgreSQL integration: 8 tests passed, including 300 extracted listing records across supported price adapters and stable rediscovery identities.
- Live production-safe CG Digital dry-run: 19 candidates. An end-to-end live scan into the isolated test database published 19 offers; the actual catalog and HTML handler returned seven eligible products for `washer under 60k`.
- Backup/restore smoke check using PostgreSQL 17 tools and a separate disposable restore database recovered 19 offers, 19 evidence aggregates and 19 price observations. The temporary restore database was removed. Production recovery still requires checking a real production backup.
- The actual ranked Dashain/budget query was explained against 5,019 test rows (5,000 synthetic distractors rolled back afterward). It returned seven products through a bitmap scan using `offers_budget`, with 1.77 ms execution on this development machine. This is a bounded query-plan check, not a production latency guarantee.
