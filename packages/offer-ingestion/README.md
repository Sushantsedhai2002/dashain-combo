# Offer ingestion pilot

This package collects discounted products from the first page of EvoStore's public [Special Offers](https://evostore.com.np/special-offers) listing. It uses the validated source registry and publishes normalized offers through `@dashain-offer/offer-catalog`. Other registered sources are not enabled for ingestion yet.

EvoStore's [robots.txt](https://evostore.com.np/robots.txt) disallows the query URLs used for listing pagination. The adapter requests only the first listing page and same-origin product pages when checking whether a previously observed offer was removed. A product is withdrawn only after its page returns `404` or `410` on two probes without an intervening non-removal result. Fetch failures and other response codes never withdraw an offer.

## Local commands

From the repository root:

```powershell
pnpm ingestion:once -- --dry-run

$env:DATABASE_URL = "postgresql://dashain:dashain_test_only@127.0.0.1:55432/dashain_offer_catalog_test"
pnpm catalog:db:up
pnpm catalog:migrate
pnpm ingestion:once
pnpm ingestion:test:integration
pnpm ingestion:test:integration:coverage
pnpm catalog:db:down
```

`ingestion:once` publishes to the configured database and applies its own versioned observation migrations. `ingestion:worker` runs immediately and then every six hours. It needs a migrated catalog database and `DATABASE_URL`. PostgreSQL advisory locking prevents overlapping runs from separate processes.

The default `pnpm check` is offline and requires no database. The dry-run makes public website requests but does not publish. The disposable PostgreSQL service stores data in temporary memory and is intended for tests only.

## Pilot limits

- The first page yields a subset of EvoStore's specials. Additional pages are excluded because of the site's crawler rules.
- Product categories use `OTHER` until a reliable category mapping is available.
- Items without an explicit end date expire according to the catalog's 20-day fallback. Rediscovery does not extend that expiry.
- The remaining 49 registered sources need their own access and extraction assessment before activation.
