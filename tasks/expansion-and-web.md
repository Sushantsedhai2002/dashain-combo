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
- [ ] Enable the remaining 42 sources after completing their specific access/extraction contracts in `docs/ingestion-assessment.md`.
- [ ] Expand accuracy validation to the intended 100-promotion sample; current sample is 21 offers / 147 fields.
- [x] Run PostgreSQL integration tests for the multi-source runtime on an accessible disposable database. An isolated PostgreSQL 17 cluster on this Windows machine verified publication of all eight sources (105 offers) and stable catalog identities on rediscovery; integration coverage passed at 90.47% lines.

No registered source is counted as an enabled integration merely because its homepage responds. Social-only channels require an available permitted access method. A failed assessment does not modify the trusted registry.

Verification on 2026-09-30: `corepack pnpm check` passed (216 tests, 94.5% total line coverage, all per-file gates passed); frozen-lockfile installation passed. Five-source live dry-run passed with 56 candidates. Offline evaluation passed all 105 field comparisons. Isolated Chromium 153 with JavaScript disabled verified 320/768/1024/1440px layouts, zero horizontal overflow, labelled controls, combined filters, price sorting, pagination, seller links, and keyboard skip-link focus. Browser checks use recorded-fixture catalog data; real database integration remains pending.
