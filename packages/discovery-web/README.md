# Discovery website

Server-rendered English offer discovery built on the public catalog contract. Features include responsive cards, offer detail pages, text search, multiple categories and sources, all five catalog sorts, filter-preserving cursor pagination, and original seller links. Native GET forms work with JavaScript disabled. Scheduled, expired, and withdrawn offers remain hidden through the catalog API.

From the repository root, set `DATABASE_URL` to an existing migrated catalog database, then run:

```sh
pnpm catalog:migrate
pnpm ingestion:once
pnpm web:dev
```

Open `http://127.0.0.1:3000`. `HOST` defaults to `127.0.0.1`; `PORT` defaults to `3000`. The commands use environment variables already exported by the shell; they do not automatically load `.env` files. `pnpm web:start` uses the same server entry point. Deploy behind your existing HTTPS reverse proxy when preparing production.

For everyday localhost browsing, use the persistent local database rather than the disposable test database:

```sh
docker compose -p dashain-local -f config/postgres.local.compose.yml up -d --wait
export DATABASE_URL=postgresql://dashain:dashain_local_only@127.0.0.1:55433/dashain_offer_catalog_local
pnpm catalog:migrate
pnpm ingestion:once
pnpm web:dev
```

In a second terminal, export the same `DATABASE_URL` and run `pnpm ingestion:worker` to refresh sources on their schedule. After adapter changes, run `pnpm ingestion:once` again; `--dry-run` never publishes. The local database uses a named volume and survives container restarts. Its credentials are for localhost development only. Avoid `down --volumes` when preserving local offers.

The public website always shows current Dashain product discounts. `scope=ALL` is rejected; older general promotions remain available to internal catalog callers. Listings, direct detail URLs and comparisons require an exact product, evidenced current-season campaign membership, positive NPR offer price below the seller reference price, fresh price/evidence verification within 48 hours, and valid lifecycle. Discounted products with gifts remain eligible; coupons, prize draws, cashback-only promotions and explicitly out-of-stock products do not. Unknown stock is labelled unknown. Most adapters, including Yamaha and the generic Daraz flash-sale collector, still need campaign evidence before their offers appear. A fresh publishing scan is required after collector changes; a dry-run never updates the catalog.

For example, in a POSIX shell with a disposable local database:

```sh
export DATABASE_URL=postgresql://dashain:dashain_test_only@127.0.0.1:55432/dashain_offer_catalog_test
pnpm catalog:db:up
pnpm catalog:migrate
pnpm ingestion:once
pnpm web:dev
```

The provided Compose database stores data in temporary memory and is for tests only. Production needs persistent PostgreSQL storage.

Search state lives in `q`, repeated `category`, repeated `source`, `sort`, and `cursor` query parameters. A filter submission begins a fresh page. Price sorts explicitly select NPR. Only validated known sources/categories and bounded search/cursor strings reach the catalog. Rendering escapes all text and permits only HTTPS seller/image URLs; CSP forbids browser scripts.

`pnpm check` includes unit/HTTP tests, strict type checking, coverage, lint, formatting, and builds. HTTP tests bind a temporary localhost port, but need no external network or database. Database-backed operation additionally needs the existing PostgreSQL integration suites.

The public website shows only verified current-season Dashain product discounts. General offers cannot be enabled with `scope=ALL`. Listings, direct offer URLs, and comparisons require evidenced campaign membership, a positive NPR sale price below the seller reference price, verification and price evidence within 48 hours, and an active offer and campaign. Discounted gifts and bundles qualify; generic sales, prior seasons, expired campaigns, coupons, prize draws, cashback-only promotions, and out-of-stock products are excluded. Unknown availability is labelled. Internal catalog callers can still request `scope=ALL`.
