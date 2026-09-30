# Spec: Offer Ingestion

**Module ID:** `offer-ingestion`
**Status:** Pilot implemented
**Dependencies:** `source-registry`, `offer-catalog`

## Objective

Collect promotions from approved source channels, turn supported evidence into catalog offers, and keep those offers current without requiring manual publication. The first website adapter covers EvoStore's public Special Offers listing. Additional sources are enabled only after their extraction rules and output have been measured against real pages. A registered channel alone does not imply that it can be ingested.

## Contract and safety rules

1. Load and validate `config/sources.json` before a run. Collect only from `ACTIVE` sources and enabled channels. Each adapter must identify one supported source and listing URL under that source's verified website origin.
2. Bound each HTTPS request by a timeout, response-size limit, and public-IP DNS validation with address pinning. Do not follow redirects automatically. Do not send credentials, cookies, or user data. Treat site content as untrusted.
3. An adapter returns a complete or failed scan of its configured listing scope. A complete scan contains normalized candidate offers and stable source-specific keys. A failed, blocked, partial, or structurally invalid scan publishes nothing and withdraws nothing.
4. Automatic publication requires an HTTPS destination on the approved source origin, a meaningful title, and explicit promotion evidence such as a sale price below an original price. Ambiguous products are skipped. Money uses integer minor units and `NPR` for the EvoStore adapter.
5. Deduplicate within a scan by `(sourceId, sourceOfferKey)` before publication. Repeated runs use the same key so catalog upsert preserves identity and first discovery. Do not infer that offers from different sellers are identical.
6. A listing's absence alone is not proof of withdrawal. The catalog's lifecycle policy expires offers after 20 days when no explicit end is available. Withdrawal requires `404` or `410` from the specific offer page on two probes without an intervening non-removal result; other statuses reset confirmation. It never follows a fetch failure or unsupported page response.
7. A run reports per-source counts and failure categories without exposing HTML, SQL, credentials, or network internals. The scheduled process prevents overlapping runs and supports a single-run command for operations.
8. Default tests use fixtures and injected I/O. No real network or PostgreSQL connection is required for `pnpm check`. Real-website and PostgreSQL verification are opt-in.

## First adapter

`evostore` reads only `https://evostore.com.np/special-offers`. EvoStore's published `robots.txt` disallows the query URLs used by pagination, so this pilot deliberately covers the first listing page only. It extracts product links, titles, current and struck-through original prices from the listing's product cards. It publishes only cards with a valid lower sale price and a unique same-origin product URL. Category falls back to `OTHER` until a trustworthy product category is available. The destination URL is the product page. No end date is inferred from listing presence.

## Commands and structure

From the repository root:

```text
pnpm ingestion:once              # one configured collection run
pnpm ingestion:worker            # recurring process
pnpm --filter @dashain-offer/offer-ingestion test
pnpm check                       # deterministic, offline quality gate
```

The new package lives in `packages/offer-ingestion`. Source adapters live under `src/adapters`, network boundary code under `src/http`, and fixture-based tests under `test`. The root CLI loads the registry and catalog only when explicitly run.

## Verification

- A recorded EvoStore fixture yields normalized discounted offers and skips non-discounted cards.
- Malformed prices and off-origin links are skipped, duplicate links collapse to one catalog key, and empty/changed markup fails safely.
- A repeated run sends the same catalog keys; a failed scan never calls `withdrawOffer`.
- Bounded requests reject internal addresses, redirects, oversized bodies, and timeouts.
- `pnpm check` passes offline. A manual opt-in run reports live collection output before publishing to PostgreSQL.

## Open decisions

- Which sources follow EvoStore in the measured rollout.
- Minimum extraction quality required to activate each adapter.
- Collection interval within the VPS resource budget; initial worker default is six hours.
- Access method for the three Facebook-only channels; they remain unsupported until a permitted, reliable method exists.
