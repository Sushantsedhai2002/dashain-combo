# Spec: Offer Catalog

**Module ID:** `offer-catalog`
**Status:** Approved on 2026-09-30
**Capability map:** [`CAPABILITY_MAP.md`](./CAPABILITY_MAP.md)
**Product direction:** [`docs/ideas/dashain-offer-radar.md`](./docs/ideas/dashain-offer-radar.md)
**Implementation plan:** [`tasks/offer-catalog-plan.md`](./tasks/offer-catalog-plan.md)
**Task list:** [`tasks/offer-catalog-todo.md`](./tasks/offer-catalog-todo.md)

## Objective

Create the authoritative catalog of normalized Dashain offers. The catalog accepts offers from trusted sources, persists their canonical representation in PostgreSQL, calculates visibility and expiry, and exposes stable write and query interfaces to downstream modules.

The module serves three consumers:

- **`offer-ingestion`:** idempotently publishes normalized offers and withdraws offers removed at the source.
- **`discovery-web`:** searches, filters, sorts, and retrieves currently visible offers.
- **`watchlists`:** queries currently visible offers that match saved criteria.

The catalog does not collect or extract source content, decide whether two different source promotions describe the same deal, render a website, send notifications, or process purchases.

## Functional Requirements

1. Persist canonical offers in PostgreSQL using version-controlled, forward-only migrations.
2. Associate every offer with a stable source ID from `source-registry` and retain the seller display name used when the offer was published.
3. Require an ingestion-provided `sourceOfferKey` that is stable for one promotion at one source.
4. Make publication idempotent under the unique identity `(sourceId, sourceOfferKey)`:
   - retrying the same promotion updates mutable content;
   - the catalog offer ID and `firstDiscoveredAt` remain unchanged;
   - concurrent retries cannot create duplicate rows.
5. Validate every write and query at the package boundary and never expose raw Zod or PostgreSQL errors.
6. Permit useful promotions without an image, numeric price, discount, terms, source publication time, or explicit validity end.
7. Require a title, trusted source identity, controlled category, HTTPS destination URL, and stable source offer key.
8. Store monetary values as non-negative integer minor units with an ISO 4217 currency code. NPR is expected but not hard-coded.
9. Support a controlled offer-category taxonomy with `OTHER` as the safe fallback.
10. Calculate a single immutable `firstDiscoveredAt` and a recalculable `expiresAt` according to the lifecycle rules below.
11. Keep expired and withdrawn records for identity, auditing, and idempotency; do not hard-delete them through the public API.
12. Return only currently visible offers from discovery queries unless a non-public/operator query explicitly requests another lifecycle state.
13. Support case-insensitive literal prefix/substring search across title, seller name, category label, product name, and brand name.
14. Support category and source filters, stable sorting, and opaque cursor pagination.
15. Keep default checks deterministic and free from external network access.

Idempotent publication prevents repeated delivery of the same source promotion. It is not semantic deduplication across different source offer keys or different sellers; that belongs to `offer-ingestion`.

## Canonical Domain Model

```ts
export type OfferCategory =
  | "GENERAL_RETAIL"
  | "MOBILE_AND_TABLETS"
  | "COMPUTERS_AND_ACCESSORIES"
  | "CONSUMER_ELECTRONICS"
  | "HOME_APPLIANCES"
  | "FASHION_AND_LIFESTYLE"
  | "AUTOMOTIVE"
  | "TRAVEL"
  | "FOOD_AND_DELIVERY"
  | "PAYMENTS_AND_FINANCE"
  | "OTHER";

export type OfferLifecycleStatus =
  | "SCHEDULED"
  | "ACTIVE"
  | "EXPIRED"
  | "WITHDRAWN";

export type Money = Readonly<{
  currency: string;
  amountMinor: number;
}>;

export type SourceTime =
  | Readonly<{ kind: "INSTANT"; value: string }>
  | Readonly<{ kind: "KATHMANDU_DATE"; value: string }>;

export type Offer = Readonly<{
  id: string;
  sourceId: string;
  sourceOfferKey: string;
  sellerDisplayName: string;
  title: string;
  summary: string | null;
  productName: string | null;
  brandName: string | null;
  category: OfferCategory;
  imageUrl: string | null;
  destinationUrl: string;
  originalPrice: Money | null;
  salePrice: Money | null;
  discountPercent: number | null;
  discountLabel: string | null;
  terms: string | null;
  sourcePublishedAt: SourceTime | null;
  validityStartsAt: string | null;
  explicitValidityEnd: SourceTime | null;
  firstDiscoveredAt: string;
  expiresAt: string;
  withdrawnAt: string | null;
  lifecycleStatus: OfferLifecycleStatus;
  createdAt: string;
  updatedAt: string;
}>;
```

Public timestamps are UTC ISO-8601 instants. `KATHMANDU_DATE` values are strict `YYYY-MM-DD` calendar dates interpreted in `Asia/Kathmandu`. Output values are immutable snapshots.

### Pricing rules

- `amountMinor` must be a non-negative safe integer.
- Original and sale prices, when both exist, must use the same currency.
- A sale price greater than the original price is invalid.
- `discountPercent`, when present, is between `0` and `100` inclusive.
- The catalog does not infer a price or discount from another field and does not verify price history.
- A text-only promotion such as “Dashain sale up to 50%” is valid without a `Money` value.

### Category rules

The taxonomy describes the promoted item or service, not the source's market segment. For example, a phone sold by a general marketplace is `MOBILE_AND_TABLETS`, not `GENERAL_RETAIL`. Ingestion uses `OTHER` when no controlled category is reliable; it must not create arbitrary category values.

Changing or removing an existing category is a contract change. New categories should be additive and require an approved spec update.

## Lifecycle and Visibility

### Expiry precedence

The catalog calculates `expiresAt` using the first available rule:

1. **Explicit instant:** expire at that exact instant.
2. **Explicit Kathmandu final date:** remain visible for the full date and expire at `00:00:00` on the following date in `Asia/Kathmandu`.
3. **Source publication instant:** expire exactly 20 × 24 hours later.
4. **Source publication date:** treat publication as `00:00:00` on that date in `Asia/Kathmandu`, then expire 20 × 24 hours later.
5. **No source publication time:** expire exactly 20 × 24 hours after `firstDiscoveredAt`.

An explicit validity end always overrides a fallback. If better metadata appears on a later idempotent update, `expiresAt` is recalculated from that metadata. Rediscovery alone never changes `firstDiscoveredAt` and therefore never extends fallback expiry.

### Derived lifecycle status

Lifecycle status is derived for a supplied clock instant rather than trusted as a potentially stale database flag:

- `WITHDRAWN`: `withdrawnAt` is set.
- `SCHEDULED`: not withdrawn and `validityStartsAt` is after the supplied instant.
- `ACTIVE`: not withdrawn, started, and the supplied instant is earlier than `expiresAt`.
- `EXPIRED`: not withdrawn and the supplied instant is equal to or later than `expiresAt`.

An offer is publicly visible only while `ACTIVE`. Expiry therefore takes effect immediately without waiting for a scheduled cleanup job.

Withdrawal is idempotent. Publishing the same key again does not silently reactivate a withdrawn offer; restoration, if later required, must be an explicit additive operation approved in the contract.

## Module Contract

Consumers import the package API instead of reading catalog tables directly. The exact schema types are implementation-owned, but the public package must provide this semantic surface:

```ts
export type CatalogIssue = Readonly<{
  code:
    | "INVALID_INPUT"
    | "SOURCE_NOT_ACTIVE"
    | "OFFER_NOT_FOUND"
    | "CURSOR_INVALID";
  path: string;
  message: string;
}>;

export type CatalogResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; issues: readonly CatalogIssue[] }>;

export interface OfferCatalog {
  publishOffer(input: PublishOfferInput): Promise<CatalogResult<Offer>>;
  withdrawOffer(input: WithdrawOfferInput): Promise<CatalogResult<Offer>>;
  getVisibleOffer(id: string): Promise<CatalogResult<Offer>>;
  searchVisibleOffers(
    query: SearchOffersQuery,
  ): Promise<CatalogResult<OfferPage>>;
}
```

Contract rules:

- `PublishOfferInput` accepts a validated active `SourceDefinition` from `source-registry`; seller identity is not accepted as an unrelated free-form string.
- Inputs and expected failures use structured results. Unexpected connection, migration, or invariant failures throw a catalog-owned error with no credentials, SQL text, or driver error object exposed.
- Publication is atomic and concurrency-safe through a database unique constraint, not a check-then-insert sequence.
- Updating an existing identity changes only caller-owned mutable offer content and `updatedAt`; it preserves `id`, `firstDiscoveredAt`, and withdrawal state.
- `getVisibleOffer` returns `OFFER_NOT_FOUND` for missing, scheduled, expired, or withdrawn offers so public consumers cannot infer hidden catalog state.
- Public methods return readonly data and never return database row objects.
- Database pools and transactions remain private implementation details.

## Search, Filtering, Sorting, and Pagination

`searchVisibleOffers` supports:

- optional literal text query;
- zero or more categories;
- zero or more source IDs;
- sorting by `NEWEST`, `EXPIRING_SOON`, `DISCOUNT_DESC`, `PRICE_ASC`, or `PRICE_DESC`;
- `limit` from 1 through 100, defaulting to 20;
- an opaque continuation cursor.

Search is case-insensitive and matches title, seller display name, category label, product name, and brand name. User `%` and `_` characters are treated literally rather than as SQL wildcards. Typo tolerance, stemming guarantees, synonym expansion, ranking personalization, and semantic/vector search are out of scope.

Ordering is deterministic. Every sort includes offer ID as a final tie-breaker. Missing discount or price values sort after populated values. Price sorting rejects a query that could mix currencies unless the query selects one currency.

The page result provides `items` and `nextCursor`; it does not expose database offsets or promise a total count. Cursors are versioned, opaque values whose complete decoded shape is validated and may be rejected with `CURSOR_INVALID`.

## Persistence

- PostgreSQL 17 or newer is the production datastore.
- Numbered SQL migrations live with the package and apply once in a transaction where PostgreSQL permits.
- A migration metadata table records applied migration names and checksums; changing an applied migration is an error.
- Tables use database constraints for identity uniqueness, required values, percentages, prices, URL length bounds, and timestamp relationships where practical.
- Queries are parameterized. Search input is never interpolated into SQL.
- Repository transactions are short and never perform external network calls.
- Expired and withdrawn offers remain stored. Data-retention or archival policy is deferred until production volume is known.
- No database credentials or local data directories are committed.

## Tech Stack

- Node.js `24.21.0`
- pnpm `10.26.1`
- TypeScript `7.0.2`, strict mode
- PostgreSQL `17+`
- Zod `4.6.5` for package-boundary validation
- `pg` `8.23.0` with `@types/pg` `8.23.1`
- Vitest `5.0.2`
- Existing ESLint and Prettier configuration
- Docker Compose for the disposable local integration database; production does not depend on Docker Compose

No ORM, HTTP framework, search service, cache, queue, or timezone package is introduced unless implementation planning demonstrates a concrete need and the human approves it.

## Commands

Commands run from the repository root. The plan may refine script names but must preserve these capabilities:

```bash
# Install exactly from the lockfile
pnpm install --frozen-lockfile

# Start and stop the disposable local PostgreSQL service
pnpm catalog:db:up
pnpm catalog:db:down

# Apply catalog migrations to DATABASE_URL
pnpm catalog:migrate

# Package unit and contract tests
pnpm --filter @dashain-offer/offer-catalog test
pnpm --filter @dashain-offer/offer-catalog test:coverage

# Real-PostgreSQL migration and repository tests
pnpm catalog:test:integration

# Type, lint, test, coverage, build, and deterministic workspace checks
pnpm check

# Build all workspace packages
pnpm build
```

The default unit suite performs no external network requests. Real-PostgreSQL integration tests use only the disposable local database and must run before catalog completion; they are separate from the default root check so source-registry development does not require a running service.

## Project Structure

```text
SPEC-offer-catalog.md
CONTEXT.md
config/
  postgres.compose.yml
packages/
  offer-catalog/
    package.json
    migrations/
      0001-create-offer-catalog.sql
    src/
      index.ts
      contract.ts
      schema.ts
      lifecycle.ts
      cursor.ts
      catalog.ts
      postgres/
        migrate.ts
        offer-repository.ts
        errors.ts
      cli/
        migrate.ts
    test/
      fixtures/
      lifecycle.test.ts
      catalog.test.ts
      cursor.test.ts
      package-contract.test.ts
      postgres/
        migrations.integration.ts
        offer-repository.integration.ts
```

Applications must not import files below `src/postgres/` or read catalog tables directly.

## Code Style

- Use kebab-case filenames, camelCase values/functions, PascalCase types, and UPPER_SNAKE_CASE enum values.
- Prefer small pure lifecycle and validation functions around a narrow stateful PostgreSQL adapter.
- Inject the clock used by lifecycle operations and tests; do not scatter `new Date()` calls.
- Use readonly public values and discriminated unions.
- Do not use `any`, non-null assertions, TypeScript suppression comments, unchecked type assertions, or raw SQL string interpolation.
- Return expected boundary errors and reserve exceptions for unavailable infrastructure or violated programmer invariants.

```ts
const expiry = calculateExpiry({
  explicitValidityEnd: input.explicitValidityEnd,
  sourcePublishedAt: input.sourcePublishedAt,
  firstDiscoveredAt,
});

if (now.getTime() >= expiry.getTime()) {
  return "EXPIRED";
}
```

## Testing Strategy

### Unit tests

Test all validation boundaries, category rules, money invariants, lifecycle precedence, exact Kathmandu end-of-day behavior, 20-day fallback behavior, immutability, query normalization, cursor validation, and deterministic ordering helpers.

Lifecycle tests use fixed instants immediately before, at, and after expiry. They prove that rediscovery does not extend fallback expiry and that newly discovered explicit metadata correctly takes precedence.

### Package contract tests

Test deliberate public exports, readonly semantic output, structured expected errors, source-registry compatibility, hidden-offer not-found behavior, and the absence of leaked Zod/PostgreSQL errors.

### PostgreSQL integration tests

Against a disposable real PostgreSQL instance:

- apply every migration from an empty database;
- reject modified migration checksums;
- prove concurrent publication creates one offer identity;
- prove upserts preserve IDs and first discovery times;
- prove withdrawal is idempotent and cannot be silently reversed;
- exercise every search filter and sort with null values and stable cursors;
- prove expiry filtering at the exact boundary;
- verify rollback behavior and map expected constraint failures.

Integration tests use a dedicated database and must refuse to run when the configured database name does not clearly identify it as a test database.

### Quality threshold

- At least 80% line coverage per changed executable file in deterministic tests.
- Zero TypeScript, lint, and formatting errors.
- No skipped tests, suppression comments, committed secrets, unimplemented stubs, or database-dependent tests disguised as unit tests.
- Unit tests complete within 30 seconds; integration tests complete within 90 seconds on the development machine.

## Boundaries

### Always do

- Validate package inputs before database access.
- Use the stable `(sourceId, sourceOfferKey)` identity for idempotent publication.
- Calculate visibility against an injected clock and enforce it in SQL queries as well as returned status.
- Parameterize every SQL value.
- Preserve original discovery time across retries and updates.
- Run real PostgreSQL integration tests before declaring persistence complete.
- Keep public output immutable and database implementation details private.

### Ask first

- Change fallback expiry away from 20 days.
- Add, remove, or rename a controlled category.
- Add a new lifecycle state or make hidden offers publicly distinguishable.
- Add an ORM, search engine, cache, queue, timezone dependency, or PostgreSQL extension.
- Expose an HTTP API or allow consumers to read catalog tables directly.
- Add hard deletion, restoration, or retention behavior.
- Change the idempotency identity or permit inactive sources to publish.

### Never do

- Reset `firstDiscoveredAt` because an offer was rediscovered.
- Keep an offer visible at or after `expiresAt`.
- Invent missing prices, discounts, publication dates, or validity dates.
- Treat fallback expiry as an explicit seller validity claim.
- Publish offers from arbitrary or inactive source identities.
- Store credentials, cookies, access tokens, scraped HTML, or personal data in offers.
- Leak SQL, database credentials, driver errors, or raw validation-library errors.
- Use semantic search, external network calls, or source collection inside this module.

## Success Criteria

The module is complete when all of the following are demonstrably true:

1. PostgreSQL migrations create the catalog from an empty test database and cannot be silently modified after application.
2. Valid normalized promotions, including text-only promotions without prices, can be published and retrieved.
3. Concurrent retries for one `(sourceId, sourceOfferKey)` produce exactly one stable catalog identity.
4. An explicit validity date remains visible through `23:59:59.999...` in `Asia/Kathmandu` and is hidden at the next local midnight.
5. Offers without explicit validity expire 20 × 24 hours after source publication, or after first discovery when publication time is unavailable.
6. Rediscovery never extends fallback expiry; later explicit metadata takes precedence deterministically.
7. Scheduled, expired, and withdrawn offers never appear in public get or search results.
8. Keyword search, category/source filters, all approved sorts, and cursor pagination return deterministic results.
9. Invalid writes and cursors return stable structured issues without partial writes or leaked implementation errors.
10. Public exports match the documented contract and downstream modules do not need database access.
11. Unit, contract, migration, concurrency, and repository integration tests pass at the stated coverage and time thresholds.
12. No ingestion, semantic deduplication, UI, watchlist delivery, authentication, price-history verification, or purchasing behavior enters the module.

## Open Questions

None blocking. The PostgreSQL driver versions were verified and pinned during implementation planning.
