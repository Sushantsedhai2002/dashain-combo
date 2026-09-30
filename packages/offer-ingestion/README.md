# Offer ingestion

This package collects explicitly discounted products from five public listings: EvoStore, Online Saathi, Midea Nepal, Neo Store, and Caliber Shoes. It uses the validated source registry and publishes normalized offers through `@dashain-offer/offer-catalog`. All 50 sources have an [assessment record](../../docs/ingestion-assessment.md); the remaining 45 are not enabled yet.

EvoStore's [robots.txt](https://evostore.com.np/robots.txt) disallows the query URLs used for listing pagination. The adapter requests only the first listing page and same-origin product pages when checking whether a previously observed offer was removed. A product is withdrawn only after its page returns `404` or `410` on two probes without an intervening non-removal result. Fetch failures and other response codes never withdraw an offer.

## Local commands

From the repository root:

```powershell
pnpm ingestion:once -- --dry-run
pnpm ingestion:once -- --dry-run --source midea-nepal
pnpm ingestion:evaluate

$env:DATABASE_URL = "postgresql://dashain:dashain_test_only@127.0.0.1:55432/dashain_offer_catalog_test"
pnpm catalog:db:up
pnpm catalog:migrate
pnpm ingestion:once
pnpm ingestion:test:integration
pnpm ingestion:test:integration:coverage
pnpm catalog:db:down
```

`ingestion:once` publishes to the configured database and applies its own versioned observation migrations. `ingestion:worker` runs immediately and then every six hours. It needs a migrated catalog database and `DATABASE_URL`. PostgreSQL advisory locking prevents overlapping runs from separate processes.

Every runtime collection and removal probe checks the origin's robots.txt and respects disallows and crawl delays. Failed policy requests do not publish or withdraw offers. The first listing page per adapter is the supported scope. Categories and brands use explicit title/source evidence; Midea also supplies the model text as a summary. Unknown brands remain unknown.

The default `pnpm check` is offline and requires no database. The dry-run makes public website requests but does not publish. The disposable PostgreSQL service stores data in temporary memory and is intended for tests only.

## Pilot limits

- The first page yields a subset of EvoStore's specials. Additional pages are excluded because of the site's crawler rules.
- Title-based category inference covers known product terms and retains source-specific fallbacks for unfamiliar titles.
- Items without an explicit end date expire according to the catalog's 20-day fallback. Rediscovery does not extend that expiry.
- The remaining 45 registered sources need the access or extraction work documented in the assessment before activation.
- The offline evaluation compares 105 fields across 15 reviewed offers. It does not establish full-source recall or future live accuracy.
