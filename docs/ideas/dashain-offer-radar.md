# Dashain Offer Radar

## Problem Statement

How might we help Nepali shoppers find worthwhile, current Dashain promotions in one place—whether browsing casually or searching for a planned purchase—without manually collecting every offer?

## Recommended Direction

Build a **trusted-source deal radar** that automatically monitors an allowlist of 50 official sources serving the Nepali market. Sources may be retailer websites, brand websites, or official social-media accounts. The system extracts and normalizes promotions, removes duplicates, expires outdated offers, and links visitors to the original source.

The English-language homepage supports casual discovery, while search and email watchlists help shoppers find deals for planned purchases and encourage repeat visits. Social offers are included where reliable access is technically and legally possible; the product does not promise universal social-media coverage.

## Key Assumptions to Validate

- [ ] **The 50-source portfolio produces enough useful offers.** Run collection against the candidate portfolio and measure how many current, distinct offers are found each week.
- [ ] **Extraction works accurately without manual review.** Evaluate prices, dates, products, discounts, and source links from at least 100 collected promotions.
- [ ] **A centralized feed is better than following brand pages individually.** Test the prototype with Nepali shoppers who currently discover deals through brand pages, TikTok, and Meta ads.
- [ ] **Watchlists create recurring visitors.** Let early users track products and measure whether they return or open notifications when matching deals appear.
- [ ] **Social-platform restrictions still permit useful coverage.** Test each platform independently before treating it as a dependable source.

## Initial 50-Source Portfolio

These are candidates, not guaranteed integrations. Each source must pass an accessibility, authenticity, activity, and extraction-quality check before activation. If a candidate fails, replace it with another source in the same market category.

### Marketplaces and general retail

1. Daraz Nepal
2. Bhat-Bhateni Super Market
3. Big Mart Nepal
4. SalesBerry
5. SmartDoko
6. Gyapu
7. Thulo.com
8. Jeevee

### Electronics retailers

9. Hukut
10. Mudita Store
11. Oliz Store
12. EvoStore
13. Big Digital
14. ITTI
15. Neo Store
16. CG Digital

### Consumer electronics and appliances

17. Samsung Nepal
18. Xiaomi Nepal
19. vivo Nepal
20. OPPO Nepal
21. realme Nepal
22. LG Nepal
23. Panasonic Nepal
24. TCL Nepal
25. Hisense Nepal
26. CG Electronics
27. Baltra Home Appliances
28. Himstar

### Fashion and lifestyle

29. Goldstar Shoes
30. Caliber Shoes
31. KTM CTY
32. Sonam Gear
33. Dulla
34. Shikhar Shoes

### Automotive

35. Hyundai Nepal
36. Tata Motors Nepal
37. Kia Nepal
38. Suzuki Nepal
39. Toyota Nepal
40. Honda Nepal
41. Yamaha Nepal
42. Bajaj Nepal

### Travel, delivery, and payments

43. Buddha Air
44. Yeti Airlines
45. Shree Airlines
46. Foodmandu
47. Pathao Nepal
48. eSewa
49. Khalti
50. IME Pay

## MVP Scope

- A manually configured allowlist of 50 trusted sources
- Automatic recurring monitoring of source websites
- Monitoring of selected official social accounts where access permits
- Extraction of title, image, seller, price, discount, validity dates, terms, category, and original URL
- Automated source validation, deduplication, and expiration
- An English-language promotion homepage for casual browsing
- Search and basic category filtering
- Email-based product watchlists and matching alerts
- Direct links or embeds leading to the original seller or social post
- A responsive website usable on mobile and desktop
- Generic category support without guaranteeing equal coverage
- Offers remain visible throughout their final validity date and expire immediately afterward, using Nepal time (`Asia/Kathmandu`)

## Not Doing (and Why)

- **Crawling the entire internet or every social account** — infeasible for a solo, near-zero-budget MVP.
- **Guaranteeing complete social coverage** — platform restrictions are outside the product's control.
- **Understanding every promotional video** — transcription and visual interpretation add cost and unreliability.
- **Community or merchant submissions** — useful fallback, but first validate trusted-source monitoring.
- **Manual deal review** — conflicts with the automation goal; source allowlisting and automated checks provide initial safeguards.
- **On-site purchasing and payments** — sellers remain responsible for transactions, inventory, delivery, and support.
- **Price-history verification** — valuable later, but requires sustained historical data.
- **Monetization** — first prove that the service solves the discovery problem.
- **Native mobile applications** — a responsive website is sufficient for validation.

## Open Questions

- What happens when a promotion has no extractable validity end date?
- What minimum extraction confidence is required for automatic publication?
- How often should each source be checked within the VPS resource budget?
- Which social integrations are permitted and reliable enough to activate?
- Should email watchlists require a full user account or only a verified email address?
