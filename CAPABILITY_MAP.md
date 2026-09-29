# Capability Map: Dashain Offer Radar

## Confirmed product constraints

- Responsive web application; no native app in the MVP.
- English-only initial release.
- Fifty trusted sources across multiple Nepal market categories.
- Collection and publication are automatic, without manual review.
- Offers remain visible through `23:59:59` on their final validity date in `Asia/Kathmandu` and expire immediately afterward.
- Users leave the platform to complete purchases with the original seller.
- Only the VPS and domain should incur mandatory costs; prefer free and open-source dependencies.
- Email watchlists are part of the intended MVP.
- Monetization, on-site purchasing, and universal social-media coverage are out of scope.

## Modules

| Module ID | Responsibility | Depends on |
|---|---|---|
| `source-registry` | Define, verify, and configure the 50 trusted websites and social accounts | — |
| `offer-catalog` | Canonical offer model, storage, lifecycle, categories, search, and query interfaces | `source-registry` |
| `offer-ingestion` | Schedule collection, extract and normalize promotions, deduplicate, and publish automatically | `source-registry`, `offer-catalog` |
| `discovery-web` | Responsive homepage, search, filters, offer presentation, and outbound links | `offer-catalog` |
| `watchlists` | Verified-email subscriptions, offer matching, and notifications | `offer-catalog` |

## Build order

`source-registry` → `offer-catalog` → `offer-ingestion` → (`discovery-web` and `watchlists`)

`discovery-web` and `watchlists` may proceed in parallel after the catalog contract is stable and ingestion has produced representative test data.

## Unresolved cross-module decisions

- Fallback lifecycle for offers with no trustworthy validity end date
- Minimum extraction confidence required for automatic publication
- Collection frequency within the VPS resource budget
- Exact social-media access methods permitted by each platform
- Whether watchlists use verified email only or full user accounts
