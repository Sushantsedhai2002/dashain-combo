# Ingestion expansion and discovery website

Authorized scope: assess the remaining 49 sources, add demonstrably reliable adapters, improve extracted details/categories, measure extraction accuracy, and implement discovery-web.

- [x] Assess all 50 registered sources, record HTTP/access/robots evidence and a specific reason for every unsupported source.
- [x] Add four measured adapters from recorded public listing HTML; preserve safe fetches, stable keys, strict discount evidence, and safe withdrawal behavior.
- [x] Enrich categories/brands when explicit title or source evidence supports them.
- [x] Add fixture annotations and reproducible field-accuracy evaluation; distinguish recorded-fixture accuracy from live/general accuracy.
- [x] Wire all five enabled adapters into dry-run, single-run, and recurring ingestion commands.
- [x] Build the responsive discovery homepage, filters, sorts, cursor pagination, and offer detail pages.
- [x] Verify deterministic quality gates and browser rendering; document commands and remaining access restrictions.
- [x] Add ITTI, Choicemandu, and Big Digital with recorded full-page fixtures, reviewed annotations, and robots-aware live dry-runs (46 additional candidates).
- [x] Add Daraz's measured homepage flash-sale adapter with strict JSON parsing, stable item/SKU keys, and a robots-aware live dry-run (7 additional candidates).
- [ ] Enable the remaining 41 sources after completing their specific access/extraction contracts in `docs/ingestion-assessment.md`.
- [ ] Expand accuracy validation to the intended 100-promotion sample; current sample is 24 offers / 168 fields.
- [x] Run PostgreSQL integration tests for the multi-source runtime on an accessible disposable database. An isolated PostgreSQL 17 cluster on this Windows machine verified publication of all nine sources (112 offers) and stable catalog identities on rediscovery; integration coverage passed at 90.47% lines.

No registered source is counted as an enabled integration merely because its homepage responds. Social-only channels require an available permitted access method. A failed assessment does not modify the trusted registry.

Earlier verification on 2026-09-30: `corepack pnpm check` passed (216 tests, 94.5% total line coverage, all per-file gates passed); frozen-lockfile installation passed. Five-source live dry-run passed with 56 candidates. Offline evaluation passed all 105 field comparisons. Isolated Chromium 153 with JavaScript disabled verified 320/768/1024/1440px layouts, zero horizontal overflow, labelled controls, combined filters, price sorting, pagination, seller links, and keyboard skip-link focus. Browser checks used recorded-fixture catalog data; database integration was pending at that checkpoint.

Source expansion verification on 2026-09-30: `corepack pnpm check` passed (227 tests, 94.7% total line coverage, all per-file gates passed). Frozen-lockfile installation restored missing discovery-web workspace links without changing the lockfile. Offline evaluation passed all 168 comparisons across 24 reviewed offers. `corepack pnpm ingestion:test:integration:coverage` passed all six tests against an isolated local PostgreSQL 17 cluster, verifying 112 recorded offers across nine sources and idempotent rediscovery. Separate real-network runs published ITTI 43, Choicemandu 2, Big Digital 1, and Daraz 7 into the disposable database. Existing PostgreSQL service data was not used. Watchlists and alerts are deferred per the user's instruction.
