# Capability Map: Dashain Offer Radar

## Confirmed product constraints

- Responsive web application; no native app in the MVP.
- English-first interface with maintained Nepali and romanized query aliases.
- Expansion target: 20 independent sellers, at least five meaningful product categories, and 500 distinct fresh, verified current Dashain product offers. Candidate URLs and multiple channels do not count as independent sellers.
- Collection and publication are automatic, without manual review.
- Offers remain visible through `23:59:59` on their final validity date in `Asia/Kathmandu` and expire immediately afterward.
- Offers without an explicit validity end expire 20 days after source publication, falling back to first discovery when source publication is unavailable; rediscovery does not extend expiry.
- Users leave the platform to complete purchases with the original seller.
- Only the VPS and domain should incur mandatory costs; prefer free and open-source dependencies.
- Email watchlists and alerts are deferred at the user's request; the current priority is source coverage.
- Monetization, on-site purchasing, and universal social-media coverage are out of scope.

## Modules

| Module ID | Responsibility | Depends on |
|---|---|---|
| `source-registry` | Define, verify, and configure trusted identities, approved campaign entry points and collection capabilities | — |
| `offer-catalog` | Canonical offer model, storage, lifecycle, categories, search, and query interfaces | `source-registry` |
| `offer-ingestion` | Schedule collection, extract and normalize promotions, deduplicate, and publish automatically | `source-registry`, `offer-catalog` |
| `discovery-web` | Responsive homepage, search, filters, offer presentation, and outbound links | `offer-catalog` |
| `watchlists` | Verified-email subscriptions, offer matching, and notifications | `offer-catalog` |

## Build order

`source-registry` → `offer-catalog` → `offer-ingestion` → (`discovery-web` and `watchlists`)

`discovery-web` and `watchlists` may proceed in parallel after the catalog contract is stable and ingestion has produced representative test data.

## Unresolved cross-module decisions

- Automatic publication uses explicit evidence and rule results; ambiguous candidates are quarantined for automatic retry
- Collection frequency within the VPS resource budget
- Exact social-media access methods permitted by each platform
- Whether watchlists use verified email only or full user accounts

## Implemented campaign pilot

CG Digital retains its original identity and is active after a successful production-safe fetch. The LG 2083 washing-machine campaign supplies evidenced model prices and category-specific gifts. Shared discovery contracts, additive PostgreSQL storage, current-Dashain scope, budget/brand/type/stock filters, ranked token search, source outcomes, backoff and quarantine are implemented. See [rollout and validation](docs/campaign-discovery.md).

## Discounted-product and social-feed implementation

The public website now enforces fresh evidenced Dashain product discounts across listings, details and comparisons. CG Digital collection covers five reviewed product price tables (78 products in the saved fixture and fresh live dry-run). Merchant-provided structured social-promotion feeds are supported by the registry and worker, with exact registered account attribution, explicit product prices, merchant verification timestamps and partial-channel removal protection. Collectors now include IT Monster, Maxell, Proud Nepal, SB Furniture, Sukumart, InfoTechs Nepal and Wild Yak Gear. No real merchant feed has yet been configured; direct social APIs and OCR remain expansion work. The full expansion target is still unmet; see docs/source-expansion-coverage.json and config/source-discovery.json.
