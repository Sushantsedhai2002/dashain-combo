# Offer ingestion

This package collects explicitly discounted products from nine public listings: EvoStore, Online Saathi, Midea Nepal, Neo Store, Caliber Shoes, ITTI, Choicemandu, Big Digital, and Daraz Nepal. It uses the validated source registry and publishes normalized offers through `@dashain-offer/offer-catalog`. All 50 sources have an [assessment record](../../docs/ingestion-assessment.md); the remaining 41 are not enabled yet.

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
- ITTI reads the named homepage product query from server-delivered JSON chunks without executing JavaScript. Only available, non-coming-soon products with a lower selling price are published. Its verified image origin is `https://admin.itti.com.np/storage/`.
- Choicemandu covers the first Special Offers page. Big Digital covers homepage cards at its verified non-www origin; displayed titles may be truncated by the seller.
- Daraz covers only the homepage flash-sale module, decoding strict first-screen JSON and retaining available discounted items. Product links lose tracking parameters and identity uses the item/SKU pair. Its campaign subdomain and broader marketplace are outside this adapter's scope. Missing validity ends use the catalog's existing fallback; campaign end dates are not inferred.
- The remaining 41 registered sources need the access or extraction work documented in the assessment before activation.
- The offline evaluation compares 168 fields across 24 reviewed offers. It does not establish full-source recall or future live accuracy.
