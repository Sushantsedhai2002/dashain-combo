# Ingestion source assessment

All 50 registry entries (including the 49 beyond EvoStore) were assessed on 2026-09-30. Eight adapters are enabled. The remaining 42 require the access or extraction work listed below; they are not represented as working integrations.

The live robots-aware dry-run found 56 candidates: EvoStore 16, Online Saathi 17, Midea 8, Neo Store 8, Caliber 7. Online Saathi rotates homepage recommendations; its recorded fixture contains 20 candidates. These counts measure extraction yield, not stock availability or discount authenticity.

The expansion live dry-runs found 46 additional candidates: ITTI 43, Choicemandu 2, and Big Digital 1. Network timeouts are possible; a later successful run does not imply continuous availability. Big Digital's existing www channel redirects to the non-www origin, independently verified by the official site's organization schema and added to the registry. No automatic redirect following was introduced.

The reproducible evaluation checks 147 fields across 21 reviewed offers. All 147 match. This small recorded sample does not establish full-source recall, false-positive rate, date accuracy, or future live accuracy. Expand the annotated sample before treating the intended 100-promotion validation milestone as complete.

## Recorded assessment

| Source | Status | Evidence / next requirement |
|---|---|---|
| Daraz Nepal | NEEDS_EXTRACTION_CONTRACT | Homepage campaign links use pages.daraz.com.np, outside the registered website origin; product/price content requires a separately assessed dynamic integration. |
| Bhat-Bhateni Super Market | NEEDS_EXTRACTION_CONTRACT | Accessible informational homepage; no machine-readable discounted product cards or current dated promotion listing found. |
| Big Mart Nepal | ACCESS_BLOCKED | Registered HTTPS URL redirects to HTTP. The ingestion HTTPS boundary forbids following it. |
| Online Saathi | ENABLED | Recorded price-card fixtures and a live robots-aware dry-run passed; only the configured listing scope is supported. |
| Hamrobazar | ACCESS_BLOCKED | Bounded homepage and robots requests timed out; classifieds also need a policy for promotion evidence versus ordinary asking prices. |
| Muncha | NEEDS_EXTRACTION_CONTRACT | Accessible general shopping content but no verified two-price promotion-card contract found in the homepage. |
| Choicemandu | ENABLED | A later robots-aware request succeeded. First Special Offers page exposes explicit original/sale price pairs; full-page fixture, annotations, and live dry-run passed (2 candidates). |
| Jeevee | NEEDS_EXTRACTION_CONTRACT | Homepage exposes Next.js section configuration; product promotion data requires a separately verified dynamic data contract. |
| Hukut | NEEDS_EXTRACTION_CONTRACT | Homepage contains a client-rendered application shell rather than stable priced product cards. |
| Mudita Store | ACCESS_BLOCKED | Homepage exceeded the 2 MB boundary; a smaller permitted listing or structured endpoint must be assessed. |
| Oliz Store | ACCESS_BLOCKED | Homepage returned HTTP 403. No access-control bypass attempted. |
| EvoStore | ENABLED | Recorded price-card fixtures and a live robots-aware dry-run passed; only the configured listing scope is supported. |
| Big Digital | ENABLED | Verified non-www origin added explicitly to the registry. Homepage original/offer price cards, full-page fixture, annotations, and live dry-run passed (1 candidate); seller titles may be truncated. |
| ITTI | ENABLED | Named homepage query decoded from JSON Flight chunks, with explicit mark/selling prices and stock checks; full-page fixture, annotations, and live dry-run passed (43 candidates). |
| Neo Store | ENABLED | Recorded price-card fixtures and a live robots-aware dry-run passed; only the configured listing scope is supported. |
| CG Digital | NEEDS_EXTRACTION_CONTRACT | Homepage is a client application shell without reliable discounted product cards. |
| Samsung Nepal | SOCIAL_ONLY | No enabled website channel. A permitted reliable Facebook access method has not been configured. |
| Xiaomi Nepal | NEEDS_EXTRACTION_CONTRACT | Nepal brand landing page and WebPage schema; no reliable original/sale-price pair found. |
| vivo Nepal | NEEDS_EXTRACTION_CONTRACT | Brand product landing page without verified promotion-price or dated offer extraction. |
| OPPO Nepal | NEEDS_EXTRACTION_CONTRACT | Brand product landing page without verified promotion-price or dated offer extraction. |
| realme Nepal | NEEDS_EXTRACTION_CONTRACT | Brand/product landing schema does not establish a current promotion-price pair. |
| LG Nepal | ACCESS_BLOCKED | Registered Nepal URL redirects to HTTP; no automatic redirect followed. |
| Panasonic Nepal | SOCIAL_ONLY | No enabled website channel. A permitted reliable Facebook access method has not been configured. |
| TCL Nepal | SOCIAL_ONLY | No enabled website channel. A permitted reliable Facebook access method has not been configured. |
| Midea Nepal | ENABLED | Recorded price-card fixtures and a live robots-aware dry-run passed; only the configured listing scope is supported. |
| CG Electronics | NEEDS_EXTRACTION_CONTRACT | Corporate/catalogue site; Online Sales link is not itself evidence of a specific promotion. |
| Godrej Nepal | NEEDS_EXTRACTION_CONTRACT | Nepal landing page is a client shell; no verified promotion extraction contract. |
| Himstar | NEEDS_EXTRACTION_CONTRACT | Offer URLs are accessible but content includes client templates and banners; current offer dates/terms are not reliably extractable. |
| Goldstar Shoes | NEEDS_EXTRACTION_CONTRACT | Public Offers category explicitly reports no matching products; ordinary shoe prices are not promotion evidence. |
| Caliber Shoes | ENABLED | Recorded price-card fixtures and a live robots-aware dry-run passed; only the configured listing scope is supported. |
| KTM CTY | ACCESS_BLOCKED | Homepage returned HTTP 406; robots.txt returned 404. No alternate-access bypass attempted. |
| Sonam Gear | NEEDS_EXTRACTION_CONTRACT | Public Sale listing reports zero products. Ordinary products are not automatically treated as sales. |
| Latido Leathers | NEEDS_EXTRACTION_CONTRACT | No explicit original/sale-price pair or current dated campaign found in accessible homepage. |
| Shikhar Shoes | NEEDS_EXTRACTION_CONTRACT | Accessible brand page without a verified structured current-discount contract. |
| Hyundai Nepal | NEEDS_EXTRACTION_CONTRACT | Special Offers page lists a 2080 campaign. Publication needs an explicit current validity/publication signal rather than rediscovering old content. |
| Tata Motors Nepal | NEEDS_EXTRACTION_CONTRACT | Vehicle information and social embeds; no reliable current dated campaign or price-discount pair found. |
| Kia Nepal | NEEDS_EXTRACTION_CONTRACT | Accessible vehicle/dealer catalogue; no verified current promotion structure. |
| Suzuki Nepal | NEEDS_EXTRACTION_CONTRACT | Vehicle/dealer catalogue; no verified current promotion structure. |
| Toyota Nepal | NEEDS_EXTRACTION_CONTRACT | Vehicle catalogue and organization schema; no reliable current discounted-offer structure found. |
| Honda Nepal | NEEDS_EXTRACTION_CONTRACT | Recent Offers listing is image-led with no extractable current price/date/terms contract. |
| Yamaha Nepal | NEEDS_EXTRACTION_CONTRACT | A public festive prize campaign is readable, but verified publication/end dates are needed before automatically presenting it as current. |
| Bajaj Nepal | NEEDS_EXTRACTION_CONTRACT | Nepal vehicle catalogue with ordinary product information; no verified current promotion contract. |
| Buddha Air | NEEDS_EXTRACTION_CONTRACT | Booking and destination content; routine fares are not promotions without discount evidence. |
| Yeti Airlines | NEEDS_EXTRACTION_CONTRACT | Booking and general airline content; no verified current promotion extraction contract. |
| Shree Airlines | NEEDS_EXTRACTION_CONTRACT | Booking/general airline content; no verified current promotion extraction contract. |
| Foodmandu | NEEDS_EXTRACTION_CONTRACT | Client restaurant/order content requires an assessed data interface and location context for promotion validity. |
| Pathao Nepal | NEEDS_EXTRACTION_CONTRACT | Corporate service landing page; no verified current promotion listing. |
| eSewa | NEEDS_EXTRACTION_CONTRACT | Client application shell; promotion information needs an assessed public source interface. |
| Khalti by IME | NEEDS_EXTRACTION_CONTRACT | Offer links lead to blog.khalti.com outside the registered website origin and include historical posts; origin approval and freshness checks needed. |
| Fonepay | NEEDS_EXTRACTION_CONTRACT | Corporate/service page with organization schemas rather than a verified current offer listing. |

Raw normalized observations are in [ingestion-source-assessment.json](./ingestion-source-assessment.json). Recorded card fixtures and sample annotations are in `packages/offer-ingestion/test/fixtures`. `pnpm ingestion:evaluate` reproduces the field report without a network or database.

## Activation gate

For each additional source: identify a permitted, registered-origin listing; record complete HTML; independently annotate positive and negative examples; verify price/date/terms precision; add regression tests; run a live dry-run; then publish into a disposable database. Never infer a current promotion solely from a campaign name, image, routine price, or rediscovered historical page.
