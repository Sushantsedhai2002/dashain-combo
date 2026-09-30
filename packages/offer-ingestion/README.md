# Offer ingestion

This package collects priced product promotions and dated campaigns through 22 verified adapters. It uses the validated source registry and publishes normalized offers through `@dashain-offer/offer-catalog`. Nine unsuitable sources have verified replacements within the same market segment; original identities remain retired. The registry retains exactly 50 active sources, with 28 still unsupported. See the [source assessment](../../docs/ingestion-assessment.md) for every integration and remaining requirement.

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

Every runtime collection and removal probe checks the origin's robots.txt and respects disallows and crawl delays. Failed policy requests do not publish or withdraw offers. The first listing page per adapter is the supported scope. Fonepay additionally reads up to eight dated same-origin campaign details; Khalti reads up to three details from its first trending module. A failed detail request fails the whole scan. Categories and brands use explicit title/source evidence; Midea also supplies the model text as a summary. Unknown brands remain unknown.

The default `pnpm check` is offline and requires no database. The dry-run makes public website requests but does not publish. The disposable PostgreSQL service stores data in temporary memory and is intended for tests only.

## Pilot limits

- The first page yields a subset of EvoStore's specials. Additional pages are excluded because of the site's crawler rules.
- Title-based category inference covers known product terms and retains source-specific fallbacks for unfamiliar titles.
- Items without an explicit end date expire according to the catalog's 20-day fallback. Rediscovery does not extend that expiry.
- ITTI reads the named homepage product query from server-delivered JSON chunks without executing JavaScript. Only available, non-coming-soon products with a lower selling price are published. Its verified image origin is `https://admin.itti.com.np/storage/`.
- Choicemandu covers the first Special Offers page. Big Digital covers homepage cards at its verified non-www origin; displayed titles may be truncated by the seller.
- Daraz covers only the homepage flash-sale module, decoding strict first-screen JSON and retaining available discounted items. Product links lose tracking parameters and identity uses the item/SKU pair. Its campaign subdomain and broader marketplace are outside this adapter's scope. Missing validity ends use the catalog's existing fallback; campaign end dates are not inferred.
- Oliz reads homepage product JSON and requires available, non-variant products with explicit original/sale prices. Nagmani, Gadget House Nepal, Khudra, Aadima Nepal, Shoes4Less Nepal, Ekjor, iShop Nepal, Moto World Nepal and Yantra Nepal use verified price-card profiles.
- Fonepay and Yamaha retain sourced publication dates. Fonepay parses explicit supported Gregorian campaign ends and terms; cashback and prize campaigns never receive invented product prices or discount percentages.
- Khalti's blog origin is explicitly registered using the link from its official homepage. Publication dates and heading-based terms are retained. Bikram Sambat dates remain in terms until a verified conversion contract exists; the 20-day fallback can expire campaigns early.
- The remaining 28 active sources need the access or extraction work documented in the assessment before activation.
- The offline evaluation compares 1,351 fields across 135 distinct reviewed promotions and excludes 18 negative examples. Duplicate/conflicting annotations and duplicate extraction identities fail evaluation. This is recorded-sample accuracy, without a claim of full-source recall or future live accuracy.
- New fixtures preserve the relevant raw product/campaign evidence while removing unrelated page scripts and controls. Campaign detail requests use the explicit `test/fixtures/pages.json` manifest.
