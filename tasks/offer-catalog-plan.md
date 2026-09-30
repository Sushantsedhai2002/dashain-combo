# Implementation Plan: Offer Catalog

**Spec:** [`SPEC-offer-catalog.md`](../SPEC-offer-catalog.md)
**Module:** `offer-catalog`
**Task list:** [`tasks/offer-catalog-todo.md`](./offer-catalog-todo.md)

## Overview

Build `@dashain-offer/offer-catalog` as a narrow TypeScript package around PostgreSQL. The implementation begins with its public contract and pure lifecycle rules, proves the migration path against a disposable real database, then adds publication, withdrawal, retrieval, and paginated discovery in vertical slices. Default workspace checks stay network-free and do not require PostgreSQL; the catalog integration command is an additional mandatory completion gate.

The completed `source-registry` plan and task list remain at `tasks/plan.md` and `tasks/todo.md`. They are not overwritten by this module plan.

## Current State

- `source-registry` exists and exports the trusted `SourceDefinition` contract used by publication.
- The root workspace already provides strict TypeScript, ESLint, Prettier, Vitest, coverage, and recursive build scripts.
- `SPEC-offer-catalog.md` is approved.
- PostgreSQL infrastructure and the `offer-catalog` package do not yet exist.
- The working tree contains unrelated source-registry changes. Catalog implementation must not edit, stage, revert, or commit those files; implementation should begin only after the human either commits them or explicitly chooses an isolated worktree/branch strategy.

## Verified Dependency Choice

Use these exact package versions when Task 1 updates the lockfile:

- `pg` `8.23.0` — runtime PostgreSQL driver; its package metadata supports Node `>=16`, including the project's Node `24.21.0`.
- `@types/pg` `8.23.1` — development type declarations.
- `zod` `4.6.5` — existing boundary-validation version.
- workspace dependency `@dashain-offer/source-registry` — source identity contract.

No ORM, migration framework, timezone package, cursor package, or UUID package is needed. Node's built-in `crypto`, `fs`, and `Buffer` APIs cover IDs, migration checksums, and cursor encoding.

Authoritative implementation references:

- Parameterized node-postgres queries: <https://node-postgres.com/features/queries>
- node-postgres transactions and same-client requirement: <https://node-postgres.com/features/transactions>
- PostgreSQL `INSERT ... ON CONFLICT`: <https://www.postgresql.org/docs/17/sql-insert.html>
- PostgreSQL date/time types: <https://www.postgresql.org/docs/17/datatype-datetime.html>
- PostgreSQL pattern matching: <https://www.postgresql.org/docs/17/functions-matching.html>
- PostgreSQL transaction-level advisory locks: <https://www.postgresql.org/docs/17/explicit-locking.html#ADVISORY-LOCKS>

Implementation tasks must re-open the relevant official page before coding version-specific behavior and record any conflict with this plan.

## Architecture Decisions

### Contract before adapter

`contract.ts` and `schema.ts` define the only consumer-facing vocabulary. `index.ts` deliberately exports the contract and the catalog factory, not Zod schemas, SQL helpers, pool objects, rows, or migration internals.

`createOfferCatalog` receives a private repository and an injected clock. Production construction wires the PostgreSQL repository; unit tests use a narrow fake repository. The fake proves domain behavior but never substitutes for required real-PostgreSQL integration tests.

### Trusted source input

`PublishOfferInput` includes a `SourceDefinition` from `source-registry`. Boundary validation requires `status === "ACTIVE"`; `sourceId` and `displayName` become the persisted identity snapshot. Callers cannot provide an unrelated seller name.

### Lifecycle as pure policy

`lifecycle.ts` owns strict date parsing, Kathmandu date conversion, expiry precedence, and derived status. Offer validity dates are current/future Nepal-market dates, so Kathmandu calendar midnight is represented with Nepal's current fixed `+05:45` offset. No general timezone library is added. The injected clock supplies first discovery and query visibility instants.

The database persists source metadata, `first_discovered_at`, `expires_at`, and `withdrawn_at`, but not a mutable lifecycle-status column. Public status is derived and public SQL filters enforce the same boundaries.

### PostgreSQL persistence

A private `pg.Pool`-backed repository uses parameterized values exclusively. Multi-statement work checks out one client and runs on that client for the entire transaction, following node-postgres's transaction contract.

Publication uses one `INSERT ... ON CONFLICT (source_id, source_offer_key) DO UPDATE` statement. The database unique constraint is the concurrency mechanism. Update expressions preserve `id`, `first_discovered_at`, and `withdrawn_at`, while recalculating expiry from newly supplied metadata and the preserved discovery time.

Database `bigint` monetary values are mapped through strings and checked before conversion to JavaScript safe integers. PostgreSQL `timestamptz` values are normalized to UTC ISO strings at the package boundary.

### Forward-only migrations

The package owns a small migration runner rather than adding a framework. It:

1. acquires a transaction-level advisory lock;
2. creates the migration metadata table if absent;
3. computes SHA-256 for ordered SQL files;
4. rejects a checksum mismatch for an already-applied migration;
5. applies and records each pending migration on one transaction client.

The CLI reads only `DATABASE_URL`, validates that it exists, sanitizes expected failures, and never prints credentials.

### Search and cursor policy

Search uses escaped, parameterized `ILIKE` patterns over the five approved text fields. The initial MVP does not add `pg_trgm`; representative query plans are reviewed before any extension is proposed.

Each sort has a complete keyset predicate and always ends with offer ID as a tie-breaker. Null prices and discounts sort last. A price sort requires one currency filter. The cursor is versioned base64url JSON validated through a private schema; decoded cursor structure is not public API.

### Test separation

- Unit and package contract tests use the existing workspace Vitest configuration and require no service.
- PostgreSQL tests use a separate catalog integration configuration and files named `*.integration.ts`, so default `pnpm check` cannot accidentally connect to a database.
- Docker Compose provides a disposable database named clearly as a test database. Integration setup refuses any database whose name does not contain `test`.
- Catalog completion requires both `pnpm check` and `pnpm catalog:test:integration`.

## Dependency Graph

```text
Task 1: package shell and pinned dependencies
  └─ Task 2: public contract and validation
       ├─ Task 3: lifecycle policy
       │    └─ Task 7: publish a new offer
       └─ Task 10: cursor codec

Task 4: disposable PostgreSQL harness
  └─ Task 5: migration runner
       └─ Task 6: catalog schema migration
            └─ Task 7: publish a new offer
                 └─ Task 8: idempotent update and concurrency
                      └─ Task 9: withdrawal and visible lookup
                           └─ Task 11: searchable visible feed
                                └─ Task 12: remaining sort modes

Tasks 2, 3, and 10 feed Task 13: public contract and error hardening
Tasks 1–13 feed Task 14: final quality and integration gate
```

## Implementation Phases

### Phase 1: Package contract and lifecycle

- Task 1: Create the package shell and pin approved dependencies.
- Task 2: Define public types, inputs, results, and boundary validation.
- Task 3: Implement expiry calculation and derived lifecycle status.

**Checkpoint:** strict package build succeeds; focused contract and lifecycle tests pass without a database; no public database or Zod internals exist.

### Phase 2: Reproducible persistence foundation

- Task 4: Add the disposable PostgreSQL test harness.
- Task 5: Implement checksum-protected forward migrations.
- Task 6: Add the constrained offer schema migration.

**Checkpoint:** an empty disposable PostgreSQL database migrates successfully, a second run is idempotent, and a changed applied migration fails safely.

### Phase 3: Publication and lifecycle operations

- Task 7: Publish and retrieve a newly normalized offer.
- Task 8: Make updates and concurrent retries idempotent.
- Task 9: Withdraw offers and enforce public visible lookup.

**Checkpoint:** real PostgreSQL tests prove stable identity, immutable first discovery, explicit metadata precedence, concurrency safety, and hidden scheduled/expired/withdrawn records.

### Phase 4: Discovery queries

- Task 10: Add the versioned opaque cursor codec.
- Task 11: Add visible search, filters, and newest/expiring keyset pages.
- Task 12: Add discount and currency-safe price sorts.

**Checkpoint:** every approved filter and sort is deterministic across pages, treats search wildcards literally, and never leaks hidden offers.

### Phase 5: Contract hardening and completion

- Task 13: Enforce deliberate exports and sanitize package-owned errors.
- Task 14: Wire final commands, coverage, and end-to-end quality gates.

**Checkpoint:** all 12 spec success criteria are demonstrated; default checks remain service-free; real-PostgreSQL integration passes separately; the diff contains no source-registry WIP or out-of-scope product modules.

## Verification Strategy

Every behavioral task follows red → green → refactor:

1. Add the smallest focused failing test.
2. Run it and confirm the expected failure.
3. Implement only that task's behavior.
4. Run focused tests, package typecheck, and package lint.
5. At each checkpoint, run the complete checks named above.

For PostgreSQL tasks, the test must fail for the intended database behavior before implementation. Mocked SQL strings are not accepted as evidence for migrations, constraints, `ON CONFLICT`, transactions, or keyset pagination.

Final commands:

```bash
pnpm install --frozen-lockfile
pnpm catalog:db:up
pnpm catalog:migrate
pnpm catalog:test:integration
pnpm check
pnpm build
pnpm catalog:db:down
```

## Parallelization

### Safe after contract stabilization

- Task 3 lifecycle logic and Task 4 database harness can proceed in parallel after Tasks 1–2.
- Task 10 cursor logic can proceed after Task 2 while persistence tasks continue.
- Documentation and operator-command review can proceed while Task 12 is tested.

### Must remain sequential

- Package shell → public contract.
- Database harness → migration runner → schema migration.
- Schema migration → publication → idempotent update → withdrawal/lookup → search.
- Search base query → additional sort modes → public contract hardening.

### Coordination rule

Only one owner edits `contract.ts`, `schema.ts`, the initial SQL migration, or `package.json` at a time. Parallel work uses separate worktrees and merges through one integration owner.

## Checkpoint and Commit Strategy

After unrelated working-tree changes are isolated, use a short-lived `feature/offer-catalog` branch. Create atomic save points only after the relevant checkpoint passes:

1. `feat: define offer catalog contract and lifecycle`
2. `feat: add catalog postgres migration foundation`
3. `feat: persist and manage offer lifecycle`
4. `feat: add paginated offer discovery`
5. `test: enforce offer catalog production contract`

Before each commit, inspect the staged diff, scan it for secrets, and ensure no source-registry WIP is staged.

## Risks and Mitigations

| Risk | Impact | Mitigation |
|---|---|---|
| Existing unrelated WIP is mixed into catalog commits | High | Do not start implementation until it is committed separately or catalog work is isolated in an approved worktree. |
| Upsert resets fallback expiry | High | Preserve `first_discovered_at` in SQL and test repeated and concurrent deliveries at fixed times. |
| Lifecycle differs between TypeScript and SQL filtering | High | Keep one boundary truth table and run every boundary scenario through pure unit tests and repository integration tests. |
| A migration is edited after deployment | High | Store SHA-256 checksums and fail before applying later migrations. |
| Concurrent migration processes race | High | Acquire a PostgreSQL transaction advisory lock before reading or writing migration metadata. |
| Cursor pagination skips or duplicates tied rows | High | Define complete per-sort keysets with ID tie-breakers and test ties across multiple pages. |
| `ILIKE` substring search becomes slow | Medium | Keep MVP query simple, seed representative volume, inspect `EXPLAIN ANALYZE`, and ask before adding `pg_trgm`. |
| Currency-mixed price ordering is misleading | High | Require exactly one currency for price sorts and reject ambiguous requests. |
| Driver date/bigint conversion loses information | High | Normalize timestamps explicitly and range-check bigint strings before number conversion. |
| Docker is unavailable on a contributor machine | Medium | Keep unit checks independent; document Docker as the integration prerequisite and allow an explicitly configured disposable test PostgreSQL URL. |
| A destructive integration URL targets real data | High | Refuse databases whose parsed database name does not clearly include `test`; use a dedicated Compose database. |

## Open Questions

None blocking. The exact pinned PostgreSQL container patch/digest will be selected from the official image during Task 4 and recorded in the lock-step infrastructure diff.
