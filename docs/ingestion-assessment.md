# Ingestion source assessment

There are **22 supported adapters among 50 active sources**. Nine inaccessible or unsuitable sources were retired and replaced with verified Nepal sources in the same registry market segment, as authorized by the user. Retired identities remain in the registry (59 total records). **The requested full coverage is incomplete: 28 active sources still require access or extraction work.**

The 100-promotion validation milestone is complete. The offline corpus contains 135 distinct reviewed promotions across every enabled adapter, with 1,351 matching field checks and 18 negative examples excluded. Review covers raw titles, URLs, original/sale prices, categories and brands; dated campaigns also cover sourced dates and terms. Duplicate/conflicting annotations and duplicate extraction identities fail evaluation. These recorded results do not establish full-site recall, an overall false-positive rate, stock availability, discount authenticity or ongoing live accuracy.

The recorded adapters yield 289 candidates across 22 sources. Candidate counts fluctuate live; some campaign candidates are historical and the catalog lifecycle hides expired offers. Collection never converts rediscovery into a new publication date.

## Authorized replacements

Verification used each first-party listing's Nepal business/store information and its actual product assortment. Retailers may sell multiple brands; inferred product brands come from explicit card/title evidence. Replacing a brand page with an electronics retailer changes the seller, so the new seller retains its own identity.

| Retired source | Verified replacement | Same market segment | Evidence |
|---|---|---|---|
| Bhat-Bhateni Super Market | iShop Nepal | general-retail | [Official listing](https://ishop.com.np/) |
| Hamrobazar | Khudra Online Shopping | general-retail | [Official listing](https://www.khudra.com.np/) |
| Mudita Store | Nagmani International | electronics-retail | [Official listing](https://nagmani.com.np/) |
| CG Digital | Gadget House Nepal | electronics-retail | [Official listing](https://gadgethousenepal.com/) |
| Samsung Nepal | Yantra Nepal | consumer-electronics-appliances | [Official listing](https://yantranepal.com/) |
| KTM CTY | Aadima Nepal | fashion-lifestyle | [Official listing](https://aadimanepal.com/collections/sale) |
| Sonam Gear | Shoes4Less Nepal | fashion-lifestyle | [Official listing](https://shoes4lessnepal.com/collections/sale) |
| Shikhar Shoes | Ekjor | fashion-lifestyle | [Official listing](https://www.ekjor.com/) |
| Hyundai Nepal | Moto World Nepal | automotive | [Official listing](https://motoworldnepal.com/) |

## Recorded assessment

Every original website was rechecked through the production HTTPS, public-IP, timeout, size and robots boundaries. An accessible homepage alone was insufficient for activation. The normalized record retains earlier observations alongside the fresh recheck.

| Source | Status | Evidence / next requirement |
|---|---|---|
| Daraz Nepal | ENABLED | Homepage first-screen JSON exposes a named flash-sale module with explicit NPR price pairs and available-stock flags. Full-page fixture, reviewed annotations and live robots-aware dry-run passed. Product URLs remain on the registered origin; stable item/SKU keys strip tracking. Campaign subdomain excluded; missing validity ends use the catalog fallback. |
| Bhat-Bhateni Super Market | RETIRED → ishop-nepal | Accessible informational homepage; no machine-readable discounted product cards or current dated promotion listing found. Retired with user authorization; replacement verified within the same market segment. |
| Big Mart Nepal | ACCESS_BLOCKED | Registered HTTPS URL redirects to HTTP. The ingestion HTTPS boundary forbids following it. |
| Online Saathi | ENABLED | Recorded price-card fixtures and a live robots-aware dry-run passed; only the configured listing scope is supported. |
| Hamrobazar | RETIRED → khudra | Bounded homepage and robots requests timed out; classifieds also need a policy for promotion evidence versus ordinary asking prices. Retired with user authorization; replacement verified within the same market segment. |
| Muncha | NEEDS_EXTRACTION_CONTRACT | Accessible general shopping content but no verified two-price promotion-card contract found in the homepage. |
| Choicemandu | ENABLED | Later request succeeded after an initial timeout; first Special Offers listing has explicit original/sale price pairs. Full-page fixture, reviewed annotations and live robots-aware dry-run passed. |
| Jeevee | NEEDS_EXTRACTION_CONTRACT | Homepage exposes Next.js section configuration; product promotion data requires a separately verified dynamic data contract. |
| Hukut | NEEDS_EXTRACTION_CONTRACT | Homepage contains a client-rendered application shell rather than stable priced product cards. |
| Mudita Store | RETIRED → nagmani | Homepage exceeded the 2 MB boundary; a smaller permitted listing or structured endpoint must be assessed. Retired with user authorization; replacement verified within the same market segment. |
| Oliz Store | ENABLED | Verified homepage __NEXT_DATA__ products. JSON only; explicit lower price and compare-at pair, Active/in_stock flags, and unambiguous non-variant pricing. Live robots-aware scan yielded 1 candidate. |
| EvoStore | ENABLED | Recorded price-card fixtures and a live robots-aware dry-run passed; only the configured listing scope is supported. |
| Big Digital | ENABLED | Official non-www origin independently verified through organization schema and explicitly added to registry. Homepage explicit regular/offer price cards, full-page fixture, reviewed annotation and live robots-aware dry-run passed. |
| ITTI | ENABLED | Named homepage product query decoded from server-delivered JSON chunks without script execution; explicit numeric mark/selling prices, stock checks, full-page fixture and reviewed annotations; live robots-aware dry-run passed. |
| Neo Store | ENABLED | Recorded price-card fixtures and a live robots-aware dry-run passed; only the configured listing scope is supported. |
| CG Digital | RETIRED → gadget-house-nepal | Homepage is a client application shell without reliable discounted product cards. Retired with user authorization; replacement verified within the same market segment. |
| Samsung Nepal | RETIRED → yantra-nepal | No enabled website channel. A permitted reliable Facebook access method has not been configured. Retired with user authorization; replacement verified within the same market segment. |
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
| KTM CTY | RETIRED → aadima-nepal | Homepage returned HTTP 406; robots.txt returned 404. No alternate-access bypass attempted. Retired with user authorization; replacement verified within the same market segment. |
| Sonam Gear | RETIRED → shoes4less-nepal | Public Sale listing reports zero products. Ordinary products are not automatically treated as sales. Retired with user authorization; replacement verified within the same market segment. |
| Latido Leathers | NEEDS_EXTRACTION_CONTRACT | No explicit original/sale-price pair or current dated campaign found in accessible homepage. |
| Shikhar Shoes | RETIRED → ekjor | Accessible brand page without a verified structured current-discount contract. Retired with user authorization; replacement verified within the same market segment. |
| Hyundai Nepal | RETIRED → moto-world-nepal | Special Offers page lists a 2080 campaign. Publication needs an explicit current validity/publication signal rather than rediscovering old content. Retired with user authorization; replacement verified within the same market segment. |
| Tata Motors Nepal | NEEDS_EXTRACTION_CONTRACT | Vehicle information and social embeds; no reliable current dated campaign or price-discount pair found. |
| Kia Nepal | NEEDS_EXTRACTION_CONTRACT | Accessible vehicle/dealer catalogue; no verified current promotion structure. |
| Suzuki Nepal | NEEDS_EXTRACTION_CONTRACT | Vehicle/dealer catalogue; no verified current promotion structure. |
| Toyota Nepal | NEEDS_EXTRACTION_CONTRACT | Vehicle catalogue and organization schema; no reliable current discounted-offer structure found. |
| Honda Nepal | NEEDS_EXTRACTION_CONTRACT | Official Honda Cars Offer detail explicitly expires 7 May 2022. Recent Offers is image-led; a reliable current dated extraction contract or comparable replacement is needed. |
| Yamaha Nepal | ENABLED | Dated homepage news card has both festive campaign and prize evidence. Source publication date 2026-09-15 is retained; no end date invented. Live scan yielded 1 candidate. |
| Bajaj Nepal | NEEDS_EXTRACTION_CONTRACT | Nepal vehicle catalogue with ordinary product information; no verified current promotion contract. |
| Buddha Air | NEEDS_EXTRACTION_CONTRACT | Booking and destination content; routine fares are not promotions without discount evidence. |
| Yeti Airlines | NEEDS_EXTRACTION_CONTRACT | Official Travel Card article has explicit discounted benefits but sidebar articles all display collection-day dates, which are not reliable publication evidence. Needs a verified publication/end signal and prepaid membership terms handling. |
| Shree Airlines | NEEDS_EXTRACTION_CONTRACT | Booking/general airline content; no verified current promotion extraction contract. |
| Foodmandu | NEEDS_EXTRACTION_CONTRACT | Client restaurant/order content requires an assessed data interface and location context for promotion validity. |
| Pathao Nepal | NEEDS_EXTRACTION_CONTRACT | Official Promotions archive is accessible and dated; most recent true discounted campaign is Sep 1, 2026. Needs a detail-page contract and verified multilingual terms/end dates before activation. |
| eSewa | NEEDS_EXTRACTION_CONTRACT | Client application shell; promotion information needs an assessed public source interface. |
| Khalti by IME | ENABLED | Official khalti.com links to blog.khalti.com, added as an explicitly verified channel. First trending module and up to three dated detail pages; promotion evidence and heading-based terms retained. Live scan yielded 3 candidates. Bikram Sambat dates remain in terms, without guessing a Gregorian conversion. |
| Fonepay | ENABLED | First dated blog page plus up to eight same-origin detail pages. Explicit cashback/discount evidence, source publication dates, Gregorian end dates and terms; historical campaigns retain original dates. Live scan yielded 4 candidates. |
| Nagmani International | ENABLED | Verified Nepal computer/electronics retailer; explicit old-price and special-price pairs on homepage cards. |
| Gadget House Nepal | ENABLED | Verified Nepal electronics retailer; WooCommerce original/sale price pairs on homepage cards. |
| Khudra Online Shopping | ENABLED | Verified Nepal general retailer; explicit crossed-out original and sale prices on homepage cards. |
| Aadima Nepal | ENABLED | Verified Nepal fashion retailer; first Sale collection, explicit original/current prices and displayed vendor brand. |
| Shoes4Less Nepal | ENABLED | Verified Nepal footwear retailer; first Sale collection and explicit original/sale prices. |
| Ekjor | ENABLED | Verified Nepal footwear retailer; homepage product-card original/sale prices. Off-origin product images omitted. |
| iShop Nepal | ENABLED | Verified Nepal general retailer; homepage price cards expose explicit original/sale prices and canonical product links. |
| Moto World Nepal | ENABLED | Verified Nepal motorcycle gear/accessories retailer; WooCommerce original/sale pairs. Automotive category is fixed by the source; unapproved CDN images omitted. |
| Yantra Nepal | ENABLED | Verified Nepal electronics/appliance retailer; original/sale price pairs on homepage cards. |

## Reproducible verification

Run `pnpm ingestion:evaluate` for the offline annotation report, `pnpm check` for deterministic quality gates, and `pnpm ingestion:test:integration:coverage` against the disposable test PostgreSQL service for publication and identity preservation. The first-party live robots-aware scans passed for all thirteen additional adapters. No redirect, robots, response-size, credential or SSRF protection was relaxed.

New HTML fixtures are extraction-scope projections of captured first-party pages: unrelated scripts, metadata, navigation and form controls are removed while product cards and campaign text remain. Oliz preserves the relevant raw product JSON. Campaign detail requests are mapped explicitly in `test/fixtures/pages.json`. Earlier nine-source fixtures remain available. Raw normalized observations are in [ingestion-source-assessment.json](./ingestion-source-assessment.json).

Fonepay reads at most eight details; Khalti reads at most three. Missing ends use the catalog's existing 20-day fallback from source publication or first discovery. Khalti's Bikram Sambat date wording remains in source terms and is not converted without a verified calendar contract; this can cause early fallback expiry. Yamaha's end date is unknown. Multi-page scans fail completely when any required detail request or structure check fails.

## Activation gate

For each of the remaining 28 sources: establish a permitted, explicitly verified origin and bounded listing/detail contract; capture relevant first-party evidence; independently annotate positive and negative examples; verify prices, dates and terms; add regression tests; run a live robots-aware scan; then verify publication into the disposable database. Continue searching comparable verified replacements when a registered feed is unreliable. An expired campaign, routine price, image-only banner or guessed endpoint does not establish a current promotion.

Final deterministic gate: `corepack pnpm check` passed 268 tests with 94.84% total line coverage and all per-file gates. Registry validation passed with exactly 50 active sources among 59 records. No dependency or quality-threshold changes were introduced.
