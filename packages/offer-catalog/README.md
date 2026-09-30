# `@dashain-offer/offer-catalog`

PostgreSQL-backed canonical offer storage for Dashain Offer Radar. The package validates normalized offers from trusted source-registry entries, applies deterministic lifecycle rules, and exposes visible-offer lookup and discovery.

## Public API

```ts
import { createOfferCatalog } from "@dashain-offer/offer-catalog";

const catalog = createOfferCatalog({ databaseUrl: process.env.DATABASE_URL! });

const page = await catalog.searchVisibleOffers({
  text: "phone",
  categories: ["MOBILE_AND_TABLETS"],
  sort: "PRICE_ASC",
  currency: "NPR",
  limit: 20,
});
```

The package root exports `createOfferCatalog` plus TypeScript contract types. PostgreSQL pools, rows, migrations, Zod schemas, and cursor payloads are implementation details.

Expected validation, not-found, and cursor failures are returned as structured `CatalogResult` values. Unexpected storage failures throw a sanitized `CatalogStorageError` without SQL, credentials, or driver details.

## Lifecycle policy

- Explicit validity takes precedence over fallback expiry.
- A Kathmandu final date remains visible through that complete local date and expires at the next local midnight.
- Without explicit validity, an offer expires 20 × 24 hours after source publication or, when unavailable, first discovery.
- Rediscovery does not change first discovery or extend fallback expiry.
- Scheduled, expired, and withdrawn offers are excluded from all public reads.
- Withdrawal is permanent and idempotent for the current contract.

## Local PostgreSQL

From the repository root:

```bash
pnpm catalog:db:up
pnpm catalog:migrate
pnpm catalog:test:integration
pnpm catalog:test:integration:coverage
pnpm catalog:db:down
```

The disposable service uses the test-only settings in `config/postgres.compose.yml`. Integration safety checks reject a database whose parsed name does not contain `test`. `catalog:db:down` removes the disposable volume.

For another database, set `DATABASE_URL` before running `pnpm catalog:migrate`. Migrations are forward-only and checksum protected; never edit a migration after it has been applied.

## Verification

Default checks require no running database and make no external network requests:

```bash
pnpm --filter @dashain-offer/offer-catalog test
pnpm --filter @dashain-offer/offer-catalog test:coverage
pnpm check
pnpm build
```

Real PostgreSQL verification is intentionally separate:

```bash
pnpm catalog:db:up
pnpm catalog:test:integration
pnpm catalog:test:integration:coverage
pnpm catalog:db:down
```

## Success-criteria traceability

| Spec criterion | Evidence |
| --- | --- |
| Empty-database and checksum-protected migrations | `test/postgres/migrations.integration.ts` |
| Text-only publication and retrieval | `test/catalog.test.ts`, `test/postgres/offer-repository.integration.ts` |
| Concurrency-safe stable identity | `test/postgres/offer-repository.integration.ts` |
| Kathmandu end-of-date boundary | `test/lifecycle.test.ts`, `test/postgres/visibility.integration.ts` |
| 20-day source/discovery fallback | `test/lifecycle.test.ts`, `test/catalog.test.ts` |
| Rediscovery stability and explicit metadata precedence | `test/postgres/offer-repository.integration.ts` |
| Hidden-state exclusion | `test/postgres/visibility.integration.ts`, `test/postgres/search.integration.ts` |
| Search, filters, sorts, and keyset pages | `test/postgres/search.integration.ts`, `test/cursor.test.ts` |
| Structured validation and sanitized errors | `test/schema.test.ts`, `test/catalog.test.ts`, `test/package-contract.test.ts` |
| Deliberate public package surface | `test/package-contract.test.ts`, `test/package-smoke.test.ts` |
| Unit coverage and real PostgreSQL suites | `test:coverage` and `catalog:test:integration` scripts |
| Scope remains catalog-only | `SPEC-offer-catalog.md` and final diff review |
