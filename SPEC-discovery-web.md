# Spec: Discovery Web

Status: Implementation authorized by the user's request on 2026-09-30.
Module: `discovery-web`; depends on `offer-catalog` and `source-registry`.

## Campaign discovery amendment — 2026-10-01

This amendment supersedes conflicting earlier scope below.

- Shareable query fields add scope (ALL/DASHAIN), brand, type, min/max NPR budget and known stock. Text queries default to RELEVANCE; explicit sorting is preserved. Parsed budget intent is displayed in the editable maximum-price control.
- Cards and detail pages expose model, campaign, component quantities, guaranteed/conditional/chance benefits, verification date, stock uncertainty, evidence links and applicable conditions. Automatic listing cutoffs are not represented as stated offer deadlines.
- DASHAIN empty states explicitly say no verified current matches and link to `?scope=ALL`. Set DEFAULT_OFFER_SCOPE=DASHAIN only after migrating and publishing the verified pilot; compatibility default is ALL until that rollout step.

## Objective and acceptance criteria

Build an English, responsive offer discovery website with a homepage, offer detail pages, literal text search, category and source filtering, all five catalog sorts, cursor pagination, and original seller links. Only publicly visible catalog offers appear. Empty, invalid-query, unavailable-database, and missing-offer states must be usable. Price sorting uses NPR explicitly. Filters persist in the URL and work without JavaScript.

## Architecture and commands

Use the existing Node 24 runtime and TypeScript workspace without new runtime dependencies. Server-render semantic HTML through small escaped presentation functions; the Node HTTP handler consumes the catalog's public interface. Static CSS is local. `packages/discovery-web` follows the existing package layout. `pnpm web:dev` starts the server; `pnpm check` checks the package with the rest of the workspace. Configure `DATABASE_URL`, `HOST`, and `PORT` through the environment.

## Design contract

Content-first shopping directory: warm off-white canvas, dark ink, forest-green accents, restrained red discount labels, compact source/category metadata, generous product images, and legible price hierarchy. Search is the primary action. Desktop uses a filter sidebar and three-column offer listing; mobile stacks controls and cards without horizontal overflow. Native labels, links, focus indicators, and a skip link provide keyboard access. No external fonts or scripts.

## Code and security boundaries

Small pure functions, strict types, and dependency injection follow the existing code. Encode every catalog and query string at HTML boundaries; allow only HTTPS outbound/image URLs; use security headers and bounded URL/query input. No public write API, credentials, user accounts, watchlists, invented offers, or production deployment.

## Verification

Behavior tests cover query parsing, filter-preserving pagination, hidden-offer lookup, escaped hostile input, safe URLs, error responses, and real HTTP request handling with an injected catalog. Run format, lint, typecheck, tests, coverage, and build. Verify rendered output in a real browser when tooling is available; record any tooling limitation honestly.

## References

- Node HTTP server: https://nodejs.org/docs/latest-v24.x/api/http.html#httpcreateserveroptions-requestlistener
- Cheerio selectors used by ingestion: https://cheerio.js.org/docs/basics/selecting/
