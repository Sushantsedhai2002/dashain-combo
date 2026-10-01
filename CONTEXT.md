# Dashain Offer Radar

A shared vocabulary for trusted promotion sources and the normalized offers made discoverable to Nepali shoppers.

## Language

**Source**:
An official brand or retailer identity approved by the source registry. A source may expose multiple collection channels.
_Avoid_: Seller account, scraper target

**Channel**:
A website or official social-media location through which a source publishes promotions.
_Avoid_: Source, seller

**Offer**:
The catalog's normalized representation of one promotion published by a trusted source. It may describe a priced product, a discount, a coupon, or another useful promotion.
_Avoid_: Scraped item, product, deal row

**Source offer key**:
A stable identifier assigned by ingestion to one promotion at one source and reused on every delivery of that promotion.
_Avoid_: Request ID, catalog ID, deduplication score

**Catalog ID**:
The stable identifier assigned by the catalog to an offer when it is first persisted.
_Avoid_: Source offer key, product ID

**First discovery time**:
The instant when the catalog first receives an offer identity. Rediscovery never changes it.
_Avoid_: Source publication time, update time

**Source publication time**:
The date or instant when the source originally published the promotion, when that information is available.
_Avoid_: First discovery time, catalog creation time

**Explicit validity end**:
A final date or instant stated by the source as the end of a promotion.
_Avoid_: Fallback expiry

**Fallback expiry**:
The catalog's safety cutoff for an offer without an explicit validity end: 20 days after source publication, or 20 days after first discovery when source publication is unavailable. It is not a seller validity claim.
_Avoid_: Explicit validity end

**Visible offer**:
An offer that has started, has not reached its expiry instant, and has not been withdrawn.
_Avoid_: Stored offer, published row

**Withdrawn offer**:
An offer hidden before expiry because the source promotion was removed or found unsuitable. Withdrawal is distinct from natural expiry.
_Avoid_: Deleted offer, expired offer

**Offer category**:
A controlled classification of the promoted item or service, independent of the source's market segment.
_Avoid_: Source segment, arbitrary tag

## Campaign discovery contract (2026-10-01)

A **campaign instance** is a source's evidenced promotion for a specific season. Festival keywords alone do not establish membership. A **product variant** uses a source product key, exact model and variant attributes. A **combo** is either a priced bundle with explicit components, a product with an applicable gift/service, or separately eligible payment promotions whose combination is expressly permitted.

**Qualification** is a versioned rule result, supported by field-level source evidence. Unclassified legacy records remain in All offers; quarantined records remain nonpublic. Current Dashain requires qualified membership, the current AD season, valid lifecycle and recent verification. A new season uses a new campaign identity. Verification never extends fallback expiry. Unknown delivery, stock, expiry and combination permission remain unknown.
