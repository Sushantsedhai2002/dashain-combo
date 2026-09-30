# Task List: Offer Catalog

**Spec:** [`SPEC-offer-catalog.md`](../SPEC-offer-catalog.md)  
**Plan:** [`tasks/offer-catalog-plan.md`](./offer-catalog-plan.md)

## Phase 1: Package contract and lifecycle

### Task 1: Create the offer-catalog package shell

**Description:** Add the private workspace package with strict TypeScript and focused test scripts. Pin the approved PostgreSQL driver, declarations, Zod, and source-registry workspace dependency without exposing implementation internals.

**Acceptance criteria:**
- [x] `@dashain-offer/offer-catalog` is discovered by pnpm and uses `pg@8.23.0`, `@types/pg@8.23.1`, and `zod@4.6.5`.
- [x] The package compiles under the root strict TypeScript settings and has a deliberately narrow `src/index.ts`.
- [x] A smoke test proves package resolution and focused Vitest execution.

**Verification:**
- [x] Run `pnpm install` and inspect the lockfile diff for only approved dependencies.
- [x] Run `pnpm --filter @dashain-offer/offer-catalog typecheck`.
- [x] Run `pnpm --filter @dashain-offer/offer-catalog test` and `pnpm build`.

**Dependencies:** None

**Files likely touched:**
- `pnpm-lock.yaml`
- `packages/offer-catalog/package.json`
- `packages/offer-catalog/tsconfig.json`
- `packages/offer-catalog/src/index.ts`
- `packages/offer-catalog/test/package-smoke.test.ts`

**Estimated scope:** Medium (5 files)

### Task 2: Define the public catalog contract and validation boundary

**Description:** Test-first, define controlled categories, lifecycle status, money, source-time variants, offer inputs/outputs, result issues, search queries, and package-boundary validation. Keep schema-library objects private.

**Acceptance criteria:**
- [x] Public readonly types represent the approved semantic model and accept active `SourceDefinition` values only.
- [x] Invalid IDs, URLs, dates, currencies, money, discounts, source status, text lengths, filters, limits, and price-sort currency combinations return ordered structured issues.
- [x] Text-only offers are valid while unknown fields and unsupported enum values are rejected.

**Verification:**
- [x] Observe focused schema/contract tests fail before implementation.
- [x] Run `pnpm --filter @dashain-offer/offer-catalog test -- schema.test.ts`.
- [x] Run package typecheck and lint.

**Dependencies:** Task 1

**Files likely touched:**
- `packages/offer-catalog/src/contract.ts`
- `packages/offer-catalog/src/schema.ts`
- `packages/offer-catalog/src/index.ts`
- `packages/offer-catalog/test/schema.test.ts`

**Estimated scope:** Medium (4 files)

### Task 3: Implement deterministic lifecycle policy

**Description:** Test-first, implement strict source-time parsing, Kathmandu final-date conversion, 20-day fallback precedence, and lifecycle status derivation using injected instants.

**Acceptance criteria:**
- [x] Explicit instants and Kathmandu dates produce exact expiry boundaries; malformed or impossible dates fail validation.
- [x] Source publication fallback takes precedence over first discovery and adds exactly 20 × 24 hours.
- [x] Status derivation covers scheduled, active, exact-boundary expired, and withdrawn cases without reading the system clock internally.

**Verification:**
- [x] Observe lifecycle tests fail before implementation.
- [x] Run `pnpm --filter @dashain-offer/offer-catalog test -- lifecycle.test.ts`.
- [x] Run package typecheck, lint, and coverage.

**Dependencies:** Task 2

**Files likely touched:**
- `packages/offer-catalog/src/lifecycle.ts`
- `packages/offer-catalog/test/lifecycle.test.ts`

**Estimated scope:** Small (2 files)

## Checkpoint: Contract and lifecycle

- [x] Package build, typecheck, lint, unit tests, and per-file coverage pass.
- [x] Lifecycle tests prove visibility immediately before and at expiry.
- [x] Public exports contain no Zod, `pg`, SQL, or migration internals.
- [x] Human approved the contract before persistence work expanded its observable behavior.

## Phase 2: Reproducible persistence foundation

### Task 4: Add a disposable PostgreSQL integration harness

**Description:** Add a pinned official PostgreSQL 17+ Compose service, safe test environment template, separate integration Vitest configuration, and root operator scripts. Keep default tests independent of Docker.

**Acceptance criteria:**
- [x] `pnpm catalog:db:up` starts a healthy dedicated test database and `pnpm catalog:db:down` removes it.
- [x] Integration setup accepts only a parsed database name containing `test` and rejects unsafe or missing URLs before SQL runs.
- [x] Integration files are excluded from default `pnpm test` and execute only through `pnpm catalog:test:integration`.

**Verification:**
- [x] Run the safety tests without Docker and observe unsafe URLs rejected.
- [x] Run `pnpm catalog:db:up`, the integration smoke test, and `pnpm catalog:db:down`.
- [x] Run default `pnpm test` with PostgreSQL stopped.

**Dependencies:** Task 1

**Files likely touched:**
- `config/postgres.compose.yml`
- `.env.example`
- `package.json`
- `packages/offer-catalog/vitest.integration.config.ts`
- `packages/offer-catalog/test/postgres/database-safety.integration.ts`

**Estimated scope:** Medium (5 files)

### Task 5: Implement checksum-protected migrations

**Description:** Test-first against real PostgreSQL, implement ordered SQL discovery, SHA-256 checksums, an advisory-lock transaction, migration metadata, and a sanitized CLI.

**Acceptance criteria:**
- [x] An empty test database applies ordered migrations once and a second run performs no work.
- [x] A changed checksum for an applied migration fails before later migrations run; concurrent migrators serialize safely.
- [x] The CLI requires `DATABASE_URL`, uses one transaction client, and never prints credentials or raw driver errors.

**Verification:**
- [x] Observe migration integration tests fail before implementation.
- [x] Run `pnpm catalog:test:integration -- migrations.integration.ts` twice.
- [x] Run focused CLI tests, package typecheck, and lint.

**Dependencies:** Task 4

**Files likely touched:**
- `packages/offer-catalog/src/postgres/migrate.ts`
- `packages/offer-catalog/src/postgres/errors.ts`
- `packages/offer-catalog/src/cli/migrate.ts`
- `packages/offer-catalog/test/postgres/migrations.integration.ts`
- `packages/offer-catalog/test/migrate-cli.test.ts`

**Estimated scope:** Medium (5 files)

### Task 6: Add the constrained offer schema migration

**Description:** Define the initial offer table and indexes with stable identity, lifecycle timestamps, optional promotion details, and database-level constraints matching the approved contract.

**Acceptance criteria:**
- [x] The migration enforces unique `(source_id, source_offer_key)`, required identifiers/text, safe monetary ranges, discount bounds, and valid timestamp relationships where practical.
- [x] Indexes support visible source/category filtering and each approved stable sort without adding an unapproved extension.
- [x] Integration tests prove valid text-only rows succeed and representative invalid rows fail atomically.

**Verification:**
- [x] Apply migrations from an empty database.
- [x] Run `pnpm catalog:test:integration -- offer-schema.integration.ts`.
- [x] Inspect the migration for secrets, destructive statements, and unparameterized runtime values.

**Dependencies:** Task 5

**Files likely touched:**
- `packages/offer-catalog/migrations/0001-create-offer-catalog.sql`
- `packages/offer-catalog/test/postgres/offer-schema.integration.ts`
- `packages/offer-catalog/test/postgres/integration-environment.ts`

**Estimated scope:** Medium (3 files)

## Checkpoint: Persistence foundation

- [x] Empty-database, repeated-run, checksum-mismatch, and concurrent-migrator tests pass.
- [x] Default tests still pass with PostgreSQL stopped.
- [x] Schema constraints agree with package validation and the approved spec.
- [x] Docker image reference is pinned and no production credentials or database data are tracked.

## Phase 3: Publication and lifecycle operations

### Task 7: Publish and retrieve a new offer

**Description:** Build the catalog service and PostgreSQL repository path for publishing one validated active-source offer, calculating expiry, mapping the row to immutable output, and retrieving it while visible.

**Acceptance criteria:**
- [x] Publishing a valid priced or text-only offer creates one row with a generated catalog ID, injected first-discovery time, calculated expiry, and active-source seller snapshot.
- [x] Returned timestamps are normalized UTC ISO strings, money is range-checked, and lifecycle status is derived for the injected clock.
- [x] Invalid input returns structured issues before SQL; unexpected storage failures expose only a catalog-owned sanitized error.

**Verification:**
- [x] Observe catalog unit and repository integration tests fail before implementation.
- [x] Run focused `catalog.test.ts` and `offer-repository.integration.ts` tests.
- [x] Run package typecheck, lint, and unit coverage.

**Dependencies:** Tasks 3 and 6

**Files likely touched:**
- `packages/offer-catalog/src/catalog.ts`
- `packages/offer-catalog/src/postgres/offer-repository.ts`
- `packages/offer-catalog/src/postgres/row-mapper.ts`
- `packages/offer-catalog/test/catalog.test.ts`
- `packages/offer-catalog/test/postgres/offer-repository.integration.ts`

**Estimated scope:** Medium (5 files)

### Task 8: Make publication updates and retries idempotent

**Description:** Extend publication with atomic `ON CONFLICT` updates that preserve stable identity, discovery, and withdrawal while allowing corrected metadata to recalculate expiry.

**Acceptance criteria:**
- [x] Repeated delivery preserves `id` and `firstDiscoveredAt`; rediscovery alone never extends fallback expiry.
- [x] Later explicit validity metadata deterministically overrides fallback expiry without clearing withdrawal.
- [x] Concurrent publication of the same source identity produces one row and consistent successful results.

**Verification:**
- [x] Add focused repeated/concurrent publication tests around the atomic upsert implemented with publication.
- [x] Run focused catalog and repository integration concurrency tests repeatedly.
- [x] Query the test database and confirm exactly one matching identity remains.

**Dependencies:** Task 7

**Files likely touched:**
- `packages/offer-catalog/src/catalog.ts`
- `packages/offer-catalog/src/postgres/offer-repository.ts`
- `packages/offer-catalog/test/catalog.test.ts`
- `packages/offer-catalog/test/postgres/offer-repository.integration.ts`

**Estimated scope:** Medium (4 files)

### Task 9: Add withdrawal and visibility-safe lookup

**Description:** Implement idempotent withdrawal and public lookup that intentionally makes missing, scheduled, expired, and withdrawn offers indistinguishable.

**Acceptance criteria:**
- [x] Withdrawal records its first withdrawal instant once and repeated calls return the same hidden offer state.
- [x] Republishing does not reactivate a withdrawn identity.
- [x] Public lookup returns `OFFER_NOT_FOUND` for every hidden state and returns only active offers before exact expiry.

**Verification:**
- [x] Observe withdrawal and visibility tests fail before implementation.
- [x] Run focused catalog tests and repository integration boundary tests.
- [x] Run package typecheck, lint, unit coverage, and the complete integration suite.

**Dependencies:** Task 8

**Files likely touched:**
- `packages/offer-catalog/src/catalog.ts`
- `packages/offer-catalog/src/postgres/offer-repository.ts`
- `packages/offer-catalog/test/catalog.test.ts`
- `packages/offer-catalog/test/postgres/offer-repository.integration.ts`

**Estimated scope:** Medium (4 files)

## Checkpoint: Publication lifecycle

- [x] New, repeated, corrected, concurrent, and withdrawn publication scenarios pass against real PostgreSQL.
- [x] Catalog IDs and first discovery remain stable.
- [x] Scheduled, expired, and withdrawn offers cannot be retrieved publicly.
- [x] No restoration, hard deletion, extraction, or semantic deduplication was added.

## Phase 4: Discovery queries

### Task 10: Add the versioned opaque cursor codec

**Description:** Test-first, encode and decode sort-specific keysets as versioned base64url cursors with complete private-schema validation and structured invalid-cursor results.

**Acceptance criteria:**
- [x] Every approved sort round-trips its complete keyset, including null markers and ID tie-breaker.
- [x] Malformed base64, invalid JSON, unknown versions, wrong sort shapes, unsafe values, and trailing fields return `CURSOR_INVALID` without throwing implementation errors.
- [x] Cursor implementation types are not exported publicly.

**Verification:**
- [x] Observe cursor tests fail before implementation.
- [x] Run `pnpm --filter @dashain-offer/offer-catalog test -- cursor.test.ts`.
- [x] Run package typecheck, lint, and coverage.

**Dependencies:** Task 2

**Files likely touched:**
- `packages/offer-catalog/src/cursor.ts`
- `packages/offer-catalog/test/cursor.test.ts`

**Estimated scope:** Small (2 files)

### Task 11: Add searchable visible feeds and base sorts

**Description:** Implement public active-offer search with literal case-insensitive text matching, category/source filters, and keyset pages for `NEWEST` and `EXPIRING_SOON`.

**Acceptance criteria:**
- [x] Search matches the five approved fields and treats `%`, `_`, and backslash literally through parameterized SQL.
- [x] Category/source filters combine predictably and all queries exclude scheduled, expired, and withdrawn records at the supplied clock instant.
- [x] Newest and expiring pages have stable ID tie-breakers, no duplicates across pages, limits from 1–100, and a correct `nextCursor`.

**Verification:**
- [x] Observe focused search integration tests fail before implementation.
- [x] Run search tests with tied values, hidden offers, special characters, and multi-page fixtures.
- [x] Run package typecheck, lint, unit tests, and integration tests.

**Dependencies:** Tasks 9 and 10

**Files likely touched:**
- `packages/offer-catalog/src/catalog.ts`
- `packages/offer-catalog/src/postgres/offer-repository.ts`
- `packages/offer-catalog/test/catalog.test.ts`
- `packages/offer-catalog/test/postgres/search.integration.ts`

**Estimated scope:** Medium (4 files)

### Task 12: Add discount and currency-safe price sorts

**Description:** Extend keyset discovery with `DISCOUNT_DESC`, `PRICE_ASC`, and `PRICE_DESC`, preserving null-last behavior and preventing misleading mixed-currency ordering.

**Acceptance criteria:**
- [x] Discount and price sorts are deterministic across ties and pages, with missing values always last.
- [x] Price sorts require one currency while non-price sorts may omit it; invalid combinations return `INVALID_INPUT` before SQL.
- [x] Ascending and descending keyset predicates return every matching offer exactly once across pages.

**Verification:**
- [x] Observe price-sort tests fail because missing prices were filtered instead of sorted last.
- [x] Run focused unit and PostgreSQL integration tests with multiple currencies, ties, and nulls.
- [x] Run the complete unit and integration suites.

**Dependencies:** Task 11

**Files likely touched:**
- `packages/offer-catalog/src/cursor.ts`
- `packages/offer-catalog/src/postgres/offer-repository.ts`
- `packages/offer-catalog/test/cursor.test.ts`
- `packages/offer-catalog/test/postgres/search.integration.ts`

**Estimated scope:** Medium (4 files)

## Checkpoint: Discovery contract

- [x] Every approved search field, filter, sort, and page boundary passes.
- [x] Wildcard characters remain literal and SQL values remain parameterized.
- [x] Hidden offers do not appear in any page.
- [x] No index or PostgreSQL extension beyond the reviewed approved migration was proposed.

## Phase 5: Contract hardening and completion

### Task 13: Harden public exports and error semantics

**Description:** Add package-level contract tests proving consumers see only approved types/factories, expected failures remain structured, and internal libraries or error details never cross the boundary.

**Acceptance criteria:**
- [x] Root package exports match the approved module contract and source-registry types compose without raw JSON access.
- [x] Zod issues, SQL text, connection strings, driver codes, row objects, and pool/client objects are absent from public results and expected error output.
- [x] All public returned arrays and objects meet readonly/immutability expectations without mutating caller input.

**Verification:**
- [x] Run `pnpm --filter @dashain-offer/offer-catalog test -- package-contract.test.ts`.
- [x] Run focused failure tests with synthetic Zod and PostgreSQL errors.
- [x] Run package typecheck, lint, build, and coverage.

**Dependencies:** Tasks 3, 9, 10, and 12

**Files likely touched:**
- `packages/offer-catalog/src/index.ts`
- `packages/offer-catalog/src/postgres/errors.ts`
- `packages/offer-catalog/test/package-contract.test.ts`
- `packages/offer-catalog/test/catalog.test.ts`

**Estimated scope:** Medium (4 files)

### Task 14: Enforce the final catalog quality gate

**Description:** Finish root/package command wiring, document local operation, run every deterministic and database gate, and verify all approved success criteria without absorbing unrelated source-registry work.

**Acceptance criteria:**
- [x] Root/package scripts provide all approved database, migration, test, coverage, typecheck, lint, and build commands while default checks remain service-free.
- [x] Unit and PostgreSQL adapter coverage is at least 80% per applicable executable file, no tests are skipped, and integration tests complete against a fresh disposable PostgreSQL database.
- [x] All 12 spec success criteria are traceable to passing tests or an explicit operator verification, with no secrets, stubs, generated database data, or out-of-scope modules in the diff.

**Verification:**
- [x] Run `pnpm install --frozen-lockfile`, `pnpm check`, and `pnpm build`.
- [x] Run `pnpm catalog:db:up`, `pnpm catalog:migrate`, `pnpm catalog:test:integration`, `pnpm catalog:test:integration:coverage`, then `pnpm catalog:db:down`.
- [x] Inspect the diff, dependency tree, public exports, test timings, dependency audit, and secret scan before review.

**Dependencies:** Tasks 1–13

**Files likely touched:**
- `package.json`
- `packages/offer-catalog/package.json`
- `packages/offer-catalog/README.md`
- `SPEC-offer-catalog.md`
- `tasks/offer-catalog-todo.md`

**Estimated scope:** Medium (5 files)

## Final Checkpoint

- [x] Every success criterion in `SPEC-offer-catalog.md` is demonstrated.
- [x] Default checks pass with PostgreSQL stopped.
- [x] Real-PostgreSQL migration, concurrency, repository, and search integration tests pass from an empty database.
- [x] No external network request occurs during tests.
- [x] No unrelated source-registry working-tree change is staged or committed with catalog work.
- [x] Human reviews and approves the completed module before planning `offer-ingestion`.
