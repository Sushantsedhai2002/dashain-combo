# changesNew — Dashain product and combo discovery

Research and repository review: 1 October 2026.

Status: proposed product correction and implementation plan. This document does not claim that the application changes below have already been implemented. Repository findings are from the checked-in code and recorded assessments; external research is linked inline. Live research access does not establish that the production crawler can access a page.

## 1. The product we should build

**Help Nepali shoppers find current Dashain offers for the products they need, understand the full combo and its conditions, compare relevant options, and visit the original seller.**

A shopper should be able to search for “washing machine under 60000,” choose Dashain offers, and see the eligible models, price, included gifts, seller, validity, and purchase conditions. Someone browsing should be able to explore appliances, clothing, groceries, phones, and other categories without knowing a campaign name.

“Combo” needs three distinct meanings:

| Meaning | Example | Required treatment |
| --- | --- | --- |
| Seller bundle | Multiple products sold together for one price | Store the components, quantities, and bundle price |
| Product with a benefit | Appliance with a free accessory or installation | Attach the benefit to the eligible product or variant |
| Combined promotions | Product discount plus an eligible wallet cashback | Calculate together only when the terms explicitly permit combining them |

Do not require every offer to be a combo. A genuine Dashain discount on a single product is still useful. Give shoppers separate filters for bundles, free gifts, discounts, and payment offers.

I interpret “scan” here as browsing/scanning available offers. Camera, barcode, and promotional-poster scanning are optional later capabilities, not prerequisites for the discovery MVP.

## 2. Why the current implementation misses this goal

The existing four-package architecture is worth keeping. It already has a source registry, PostgreSQL catalog, ingestion worker, and responsive discovery website. The product mismatch crosses their boundaries; adding more adapters alone will not resolve it.

| Finding in this repository | Consequence | Needed change |
| --- | --- | --- |
| `packages/offer-ingestion/src/adapters/listings.ts` accepts explicit original/sale price pairs; `daraz.ts` reads the homepage flash-sale module | Ordinary sales can populate a site branded around Dashain without evidence of festival relevance | Treat generic sales separately and require campaign evidence for the Dashain view |
| `docs/ingestion-assessment.md` records 22 supported adapters among 50 active sources, with 28 unsupported | Source count overstates the amount of usable shopping coverage | Track current campaign and product coverage by category |
| The same assessment records retiring CG Digital because its homepage lacked extractable cards | A valuable source can be lost because the wrong collection entry point was assessed | Evaluate campaign pages, detail pages, feeds, and promotional documents before abandoning a source |
| `packages/offer-catalog/src/contract.ts` has prices, text terms, and a single optional product name | No structured campaign membership, bundle contents, gift eligibility, or benefit combinations | Add campaigns, product references, components, benefits, and evidence |
| `packages/offer-catalog/src/postgres/offer-repository.ts` searches with a whole-query `ILIKE` pattern across title, seller, category, product, and brand | Queries like “LG fridge combo” depend on that phrase occurring in one field; summaries and terms are not searched | Add token-based relevance, aliases, model matching, and benefit indexing |
| `packages/discovery-web/src/query.ts` accepts search, category, source, sort, and cursor | No budget, brand, festival, combo, payment, or location filters | Extend catalog and web query contracts together |
| `packages/discovery-web/src/render.ts` centers cards on price and percentage discount | A gift, bundle, installation benefit, or payment condition is difficult to compare at a glance | Render offer-type-specific information |
| `packages/offer-ingestion/src/http/safe-fetch.ts` treats HTTP 200 as presence | A product page can remain available after its promotion ends or price changes | Revalidate the promotion's content, not just the page's existence |
| `packages/offer-catalog/src/lifecycle.ts` applies the recorded 20-day fallback policy | Unknown-end offers have a cutoff, but that cutoff cannot prove current campaign validity | Keep expiry separate from evidence freshness and campaign confidence |
| `campaign-date.ts` handles supported English Gregorian dates; the ingestion README explicitly defers BS conversion | Nepali campaign end dates may remain unstructured | Add verified BS date handling and preserve original date text |

The repository's recorded evaluation covers 135 reviewed promotions, 1,351 field checks, and 18 negative examples. Those are useful extraction checks. They do not establish Dashain relevance, complete source recall, combo correctness, or ongoing price accuracy. I did not rerun that evaluation for this document.

### Existing constraints to preserve

`CAPABILITY_MAP.md` records an English-first responsive website, automatic publication without manual deal review, outbound purchases, and free/open-source dependencies where possible. Email alerts are explicitly deferred. These remain the baseline.

Two deliberate proposed changes to earlier scope are: measure useful coverage instead of insisting on exactly 50 active sources, and support Nepali query aliases/source interpretation while keeping the interface English-first. Merchant submissions, full bilingual UI, and alerts remain later options.

## 3. What the external research shows

### A. Campaign pages can contain what homepage scrapers miss

CG Digital's official LG Dashain/Tihar 2083 page exposes model-level price tables and product-specific gifts, including different detergent quantities for washing-machine types. Its FAQ does not supply an exact expiry date. This is a promising campaign-adapter pilot, with unknown expiry represented honestly. The page also has wording that needs careful eligibility interpretation; broad benefits must not be assigned to every model. [Official LG campaign page](https://cgdigital.com.np/offers/lg-dashain-tihar-offer-83/index.html).

**Inference:** source discovery should begin with festival campaigns and follow their product links. A homepage-only failure is insufficient evidence that the brand has no useful offers. Reassess CG Digital's original registry identity and approved origins; do not merge it into the replacement retailer or automatically reactivate it solely from this research result.

### B. A festival page's existence does not establish current inventory

Daraz has a page titled “Bundles & Combos | Dashain Dhamaka.” The research reader exposed mostly navigation, without a verifiable current bundle inventory or validity window. It is a discovery lead, not proof of active 2026 combos. [Official Daraz combo page](https://www.daraz.com.np/wow/gcp/daraz/megascenario/np/Dashain_Dhamaka/3Q73QXTAkm).

**Recommendation:** assess the current festival landing page, its collection links, and an accessible data contract. Keep the existing flash-sale adapter for general offers. A page title, festival keyword, or search-engine crawl date alone must not create current Dashain membership.

### C. Payment offers need structured conditions and historical filtering

Khalti's historical Dashain article contains separate cashback offers and terms. Old promotional pages remain discoverable, so collection date cannot substitute for the original campaign period. Use this as a historical negative fixture and a terms-extraction example, not a current offer. [Official Khalti article](https://blog.khalti.com/offers/dashain-khalti-offer/).

### D. The existing stack can support the first correction

Schema.org's `Offer` vocabulary includes concepts for offered items, included objects, eligibility, price, and validity. Use these where publishers supply them, but do not assume a structured product price establishes a discount or Dashain participation. [Schema.org Offer](https://schema.org/Offer).

PostgreSQL supports weighted full-text search and ranking; `pg_trgm` adds similarity matching and indexes. Start with these inside the existing database, and measure search quality before adding a separate search service. [Text search controls](https://www.postgresql.org/docs/current/textsearch-controls.html), [pg_trgm](https://www.postgresql.org/docs/current/pgtrgm.html).

Tesseract publishes English and Nepali language data. It is a candidate for extracting text from official promotional posters, but language availability does not guarantee accurate prices or fine-print interpretation. Benchmark it on actual posters before enabling automatic publication from OCR. [Tesseract language data](https://tesseract-ocr.github.io/tessdoc/Data-Files-in-different-versions.html).

## 4. Collection architecture

```text
Verified source + approved campaign entry points
    -> discover campaign pages and linked products
    -> fetch bounded HTML / structured data / permitted documents
    -> retain evidence and extraction version
    -> extract campaign, product, benefit, and eligibility candidates
    -> validate facts, season, dates, and product applicability
    -> publish qualified records; quarantine ambiguous candidates
    -> index for browsing and product search
    -> recheck prices, benefits, stock, and validity
```

“Quarantine” is an internal nonpublic state with reason codes and automatic retry. It does not introduce mandatory human approval for every deal. Unsupported or ambiguous evidence stays unpublished; the source-health view makes the coverage gap visible.

### Adapter responsibilities

Keep source-specific adapters, but give them explicit capabilities:

1. **Campaign discovery:** follow approved offers/news sections, sitemaps, and festival links within bounded scope. Detect Dashain, Dashain/Tihar, Dashain Dhamaka, दशैं, दशैँ, and दशain spelling variants as candidate signals; require context and year evidence before classification.
2. **Campaign extraction:** capture campaign name, season, terms, stated dates, eligible models/categories, benefits, and product links.
3. **Product extraction:** capture exact model/variant, price, availability, and purchase URL. Associate it with a campaign only through explicit membership or an unambiguous eligibility rule.
4. **Document extraction:** optionally process official PDFs/posters using text extraction or OCR. Preserve the source, page/region, and raw text behind each fact.
5. **Revalidation:** check that the same promotion and benefits remain valid, even if the page still returns 200.

Prefer server-delivered HTML/JSON and official permitted feeds. Use browser rendering only where a specific source needs it and the VPS can support bounded work. Preserve current HTTPS, public-IP, redirect, robots, timeout, and response-size protections for every discovered URL and any browser subrequests. Do not loosen origin checks just because a campaign links elsewhere; verify and register the new origin.

Social channels should remain capability-specific: use a supported, permitted interface or an official website mirror. Record inaccessible channels as coverage gaps. Do not make universal social scraping a launch dependency.

### Source priorities

| Priority | Work | Completion evidence |
| --- | --- | --- |
| First pilot | Reassess CG Digital's explicit festive page | Production-safe fetch succeeds; model/benefit mappings pass fixtures; origin and registry status are resolved |
| Next | Assess current Daraz campaign and combo collections | Current campaign membership and actual product records can be verified; otherwise report unsupported |
| Next | Extend an existing electronics adapter with a verified campaign entry point | Searchable current product offers with explicit campaign links |
| Supporting | Extend existing Khalti/Fonepay terms extraction | Caps, minimum spend, eligible merchants, dates, and payment requirements are structured |
| Expansion | Fashion, groceries, and other demand-led categories | Each category has measured current offers, not just configured sources |

Do not replace strategically important brands merely to improve an adapter-count target. Keep their unsupported status and next collection route visible. Preserve previous source identities and historical records.

## 5. Data model changes

Use additive PostgreSQL migrations and shared TypeScript/Zod contracts. Keep the existing offer ID, money-in-minor-units representation, source provenance, and outbound URL behavior.

| Record | Minimum additions |
| --- | --- |
| Campaign | Source campaign key, title, festival tags, AD/BS season labels, publication time, stated start/end, original date text, evidence URL |
| Product/variant | Brand, model/MPN or GTIN when supplied, attributes such as storage/capacity/size, source product key |
| Offer | Campaign reference, product reference, offer type, qualification state, availability, last verified time, price timestamp |
| Bundle component | Offer reference, product or explicit description, quantity/unit, role: main item / included item / gift |
| Benefit | Type, guaranteed/conditional/chance status, amount/percentage/cap, eligible product scope, conditions |
| Eligibility | Minimum spend, coupon, payment method, bank/card restrictions, channel, location, usage limit, combinability status |
| Evidence | URL, fetched time, content hash, relevant excerpt/structured path, extractor version, supported field references |
| Price observation | Source product/variant, amount, currency, observation time, stated reference price when available |

Offer types can include `PRODUCT_DISCOUNT`, `BUNDLE`, `GIFT_WITH_PURCHASE`, `CASHBACK`, `COUPON`, `SERVICE_BENEFIT`, and `PRIZE_DRAW`. An offer can carry multiple benefits; avoid forcing a discount-plus-gift into only one piece of information.

Separate the marketplace/publisher from the actual merchant where available. “Trusted source” does not automatically establish the trustworthiness of every marketplace seller.

### Publication rules

- A lower sale price proves a stated discount, not a festival relationship.
- A festival keyword in navigation or an unrelated sidebar does not qualify a product.
- An offer can enter the Dashain view through its own explicit evidence or a verified parent campaign with applicable product membership.
- Keep generic discounts discoverable under “All offers,” without inventing festival tags.
- Missing price may be acceptable for a campaign, but exclude it from price comparisons and budget-qualified product results.
- A gift-only promotion is valid without an original/sale price pair.
- Keep guaranteed benefits separate from scratch-card maxima and lucky draws.
- “Up to 25%” is campaign-level wording; never assign 25% to every product.
- Unknown stock, expiry, delivery charge, or combinability remains unknown.
- Conflicting price/eligibility evidence blocks that specific derived claim. Do not average conflicting prices or attach a disputed gift.

Require evidence for mandatory fields and explicit rule results rather than trusting one opaque confidence score. Version the rules and record why a candidate was accepted or rejected.

### Identity and lifecycle

Use source product identity + variant + campaign instance to distinguish offers. Reuse the same identity during rescans; a genuinely new year's campaign gets a new campaign identity even when the product URL is unchanged. A changed timestamp or content hash alone must not manufacture a new offer.

Preserve Nepal-time final-date behavior and the current no-refresh-on-rediscovery fallback. Add `lastVerifiedAt` separately: fetching an offer again does not extend its validity. Freshness limits should vary by offer type, with shorter checks for flash sales, and be configured from measured source behavior.

Store BS input and its calendar explicitly. Add conversion only with a verified calendar dataset/library and boundary fixtures; never convert by subtracting a fixed number of years. Unresolved dates cannot be presented as exact deadlines.

## 6. Product search and comparison

### Search pipeline

1. Normalize Unicode, whitespace, Nepali digits, and common abbreviations.
2. Recognize common intent such as “under 60k” and map it to visible editable budget filters. Avoid silently treating a model number as a price.
3. Expand a small maintained alias dictionary: fridge/refrigerator, TV/television, washing machine/washer, and tested Nepali/romanized equivalents.
4. Search product names, exact model identifiers, brands, campaign names, component names, and benefit text with different weights.
5. Apply current season, visibility, budget, category, and eligibility filters before ranking.
6. Rank exact model matches first, then product relevance, verified applicability, and freshness. Add typo matching as a controlled fallback.

Use a `simple` text-search configuration for identifier/mixed-language fields where appropriate and test Nepali behavior explicitly. Trigram matching alone does not provide translation or transliteration. Make `RELEVANCE` the default when a search term exists; retain explicit user-selected sorting. Update cursor encoding and query fingerprints for new filters and ranking keys, with a stable ID tie-breaker.

### Initial filters

Current Dashain season, category, brand, seller, budget, offer type, and verified availability. Add payment method and location once those fields have reliable coverage; showing empty or invented filters would be misleading.

### Cards and detail pages

Cards should answer: **What product? What price? What else is included? What conditions apply? Where do I buy it?** Show the model, seller, bundle/gift summary, campaign, freshness, and known expiry. Detail pages show item quantities, eligibility, the original source, and the full terms.

A generic “See seller for price” card is insufficient for a cashback or prize campaign. Give those records a suitable presentation and keep them out of product price rankings.

Comparison should group the same model and variant across sellers while keeping each seller's offer distinct. Never compare a different storage size, capacity, or bundle as an identical product solely because titles look similar.

### Cost calculation

When the conditions are known:

```text
payable now = listed price - applicable instant discount + known mandatory charges
effective cash cost = payable now - confirmed eligible cashback
```

Cashback needs its cap, minimum spend, payment method, eligible amount basis, and timing. Missing delivery cost produces “delivery extra/unknown,” not an exact delivered total. Unknown promotion combinability means show alternative scenarios rather than adding discounts. Do not subtract an advertised gift value or possible prize from the price.

## 7. Missing features worth having

| Priority | Feature | Why it matters |
| --- | --- | --- |
| P0 | Campaign proof and current season | Prevent generic or old promotions from masquerading as Dashain offers |
| P0 | Structured bundle contents and eligibility | Makes the core combo-discovery promise useful |
| P0 | Budget filtering and relevant product search | Lets people find what they actually need |
| P0 | Content rechecks, freshness, and accurate expiry labels | Avoids sending shoppers to changed offers |
| P0 | Evidence and source-health records | Makes bad extraction diagnosable and coverage honest |
| P0 | Persistent production database, backup and restore check | The repository's Compose database is explicitly temporary test storage |
| P1 | Same-model comparison with warranty/merchant information when sourced | Helps shoppers choose between real alternatives |
| P1 | Nepali and romanized query aliases | Supports how people search while retaining English UI |
| P1 | Report incorrect/expired offer | Provides feedback; reports trigger rechecks, not automatic publication edits |
| P1 | Start collecting price history | Enables later assessment of savings versus observed prices; distinguish this from seller-stated MRP discounts |
| P1 | Delivery area, stock, installation, VAT and return information | Makes offers useful outside a single assumed location |
| P1 | Search analytics | Track no-result queries, useful clicks, category gaps, and failed redirects; avoid collecting unnecessary personal data |
| P1 | Shareable filters and campaign/product landing pages | Supports repeat discovery and sharing through messaging apps |
| Later | Saved comparisons and watchlists | Useful retention features; email alerts remain deferred per existing scope |
| Later | Merchant submissions or poster uploads | Could address missing sources, but requires an explicit scope and validation policy |
| Later | Camera/barcode/poster scan | A separate input flow that should resolve to catalog products and evidenced offers |

Preserve mobile performance, keyboard navigation, clear labels, and useful no-result states. When no verified current offer matches, say that; offer an explicit route to general discounts rather than silently mixing them in.

## 8. Implementation sequence and repository changes

### Phase 1 — Establish the corrected contract

- Update `CONTEXT.md`, `CAPABILITY_MAP.md`, and the affected `SPEC-*.md` files with campaign, product, combo, and qualification semantics.
- Extend `packages/offer-catalog/src/contract.ts` and `schema.ts`; add migrations, row mapping, repository behavior, and in-memory parity.
- Add campaign/product/benefit/evidence fields without deleting current offers. Backfill legacy records as unclassified festival relevance; explicit existing evidence can be reassessed.
- Add explicit general-offer and current-Dashain query scopes. Activate the new default after the first verified pilot supplies useful inventory.

**Done when:** gift-only and priced bundle records round-trip through the catalog, legacy records remain accessible, and unsupported festival claims cannot enter the Dashain view.

### Phase 2 — Complete one real campaign end to end

- Assess the LG campaign through the production safe fetcher and current source policy.
- Extend `packages/source-registry/src/schema.ts` and `config/sources.json` to describe approved campaign entry points and capabilities. Resolve the existing exactly-50-source contract explicitly before reactivation or expansion.
- Add a campaign adapter under `packages/offer-ingestion/src/adapters/`; register it in `websites.ts`.
- Evolve `runner.ts` from direct candidate publication to extraction, qualification, evidence persistence, and publication.
- Preserve complete/partial/failed scan distinctions: a failed detail page must not imply that unrelated offers disappeared.
- Add real source fixtures with eligible and ineligible variants, unknown dates, and conflicting terms.

**Done when:** one shopper can find an actual eligible product with its sourced combo benefit and navigate to the seller. If no current campaign passes validation, retain the empty state and resolve the source gap rather than fabricate inventory.

### Phase 3 — Make that inventory searchable

- Extend `offer-repository.ts`, the in-memory catalog, and `cursor.ts` for new filters and ranked search.
- Add appropriate search indexes through migrations and verify query plans on representative data.
- Extend `packages/discovery-web/src/query.ts`, `render.ts`, and `style.css` for budget, festival, and benefit discovery.
- Add clear campaign, product, and benefit details. Start same-model comparison only when model identity is reliable.

**Done when:** shoppers can discover the pilot through product, model, budget, and combo queries without knowing the campaign title.

### Phase 4 — Expand coverage and operate reliably

- Add more campaign sources after each passes the same evidence and search checks.
- Extend the current six-hour worker with per-source/type due times, bounded retries, backoff, and persistent scan outcomes. Retain advisory locking; do not introduce a queue service until measured needs justify one.
- Add promotion-content rechecks and quarantine reason reporting.
- Build coverage reporting for supported sources, active campaigns, searchable products, stale offers, and blocked collection paths.
- Update `docs/ingestion-assessment.md` and the evaluation corpus to measure the new product objective.

**Done when:** coverage grows without a decline in verified campaign membership or combo accuracy, and an operator can identify stale/broken sources quickly.

## 9. Acceptance checks and success measures

These are proposed release gates, not measured results:

1. An ordinary homepage sale without campaign evidence is absent from the Dashain-only view and available under general offers.
2. A current campaign-linked product appears even if its own title omits “Dashain.”
3. A product with a free gift is accepted without an original/sale price pair.
4. A bundle exposes every sourced component and quantity; unsupported component details stay unknown.
5. Category-limited gifts never leak onto ineligible models or variants.
6. Old campaigns remain historical after rescanning; a 2026 fetch does not relabel an old promotion as 2026.
7. Final-date expiry works at midnight after the stated day in Nepal; rediscovery does not reset the fallback.
8. HTTP 200 with a removed benefit or changed price updates or suppresses the promotion appropriately; timeouts do not count as confirmed removal.
9. Budget queries enforce actual known product/bundle price; unknown-price campaigns do not appear as zero-cost products.
10. Search handles token reordering, known aliases, exact models, and selected typo cases. It preserves filter/cursor consistency across pages.
11. Cashback caps, minimum spends, and payment conditions produce correct scenarios; unknown stackability is never assumed.
12. Ingestion reruns preserve identities and avoid duplicate publication; source failures preserve unaffected data.

Build an annotated evaluation set spanning ordinary discounts, bundles, gifts, cashback, old campaigns, image-led evidence, ambiguous dates, and negative examples. Label campaign membership, component boundaries, eligibility, and currentness in addition to prices. Include every supported offer type; do not let numerous easy price cards dominate the score.

Report publication precision and recall against a manually enumerated, bounded source sample, explicitly naming its date and page scope. Also report current verified offers per category, percentage with resolved eligibility, freshness distribution, broken destination rate, and relevant results in the top five for a fixed shopper-query set. Offline fixture annotation is development validation, not mandatory manual production review.

For implementation, run focused schema/adapter/search/HTTP tests first, then the existing `pnpm check` and relevant catalog/ingestion PostgreSQL integration suites. Add a read-only live dry-run to validate collection access. Do not treat fixture success as live-source verification.

## 10. Recommended first milestone

Deliver **one verified Dashain campaign → eligible products → correct combo benefits → budget/search discovery → seller link**, then repeat that process across the categories shoppers request.

The key change is to make the unit of value a useful, evidenced shopping offer. Adapter count becomes an operational metric rather than the definition of product success.
