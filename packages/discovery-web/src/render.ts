import {
  OFFER_TYPES,
  DASHAIN_PRODUCT_TYPES,
  parseBudgetIntent,
  type Money,
  type Offer,
  type OfferPage,
} from "@dashain-offer/offer-catalog";
import { CATEGORIES, SORTS } from "./query.ts";

export function escapeHtml(value: string): string {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character] ?? "",
  );
}
function safeUrl(value: string | null): string | null {
  if (value === null) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" && !url.username && !url.password
      ? escapeHtml(url.href)
      : null;
  } catch {
    return null;
  }
}
function money(value: Money | null): string {
  return value === null
    ? "See seller for price"
    : escapeHtml(
        new Intl.NumberFormat("en-NP", {
          style: "currency",
          currency: value.currency,
          currencyDisplay: "code",
          maximumFractionDigits: 2,
        }).format(value.amountMinor / 100),
      );
}
function offerPrice(offer: Offer): string {
  if (!offer.salePrice && !offer.originalPrice) {
    if (offer.discovery?.offerType === "CASHBACK") return "Payment cashback · eligibility applies";
    if (offer.discovery?.offerType === "PRIZE_DRAW")
      return "Prize draw · winnings are not guaranteed";
    if (offer.discovery?.offerType === "COUPON") return "Coupon offer · conditions apply";
  }
  return money(offer.salePrice ?? offer.originalPrice);
}
function date(instant: string): string {
  return escapeHtml(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Kathmandu",
      day: "numeric",
      month: "short",
      year: "numeric",
    }).format(new Date(instant)),
  );
}
function image(offer: Offer, detail = false): string {
  const url = safeUrl(offer.imageUrl);
  return `<div class="product-image">${url === null ? '<span class="image-placeholder" aria-hidden="true">↗</span>' : `<img src="${url}" alt="${escapeHtml(offer.productName ?? offer.title)}" ${detail ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async" referrerpolicy="no-referrer" width="480" height="360">`}${offer.discountPercent === null ? "" : `<span class="discount">${offer.discountPercent === 0 ? "Sale" : `${offer.discountPercent}% off`}</span>`}</div>`;
}
export function layout(title: string, content: string): string {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="description" content="Discover current offers from trusted Nepal retailers. Compare deals and shop directly with the seller."><meta name="theme-color" content="#8d2526"><title>${escapeHtml(title)} · Dashain Offer Radar</title><link rel="stylesheet" href="/assets/style.css"></head><body><a class="skip-link" href="#main">Skip to offers</a><header><div class="shell header-inner"><a class="brand" href="/" aria-label="Dashain Offer Radar home"><span class="brand-symbol" aria-hidden="true">✳</span><span>Dashain<span class="brand-sub">OFFER RADAR</span></span></a><span class="header-note">A little more joy in every find.</span><a class="header-link" href="/#offers">Explore offers <span aria-hidden="true">↗</span></a></div></header>${content}<footer class="shell"><span>Dashain Offer Radar</span><p>Discover here. Shop with the original seller.<br>Prices and availability can change. Confirm the offer before buying.</p><span>Made for Nepal · English</span></footer></body></html>`;
}
function discoveryDetails(offer: Offer, full = false): string {
  const d = offer.discovery;
  if (!d) return "";
  return `<div class="combo-details">${d.campaign ? `<p class="campaign">${escapeHtml(d.campaign.title)}</p>` : ""}${d.product ? `<p>Model: ${escapeHtml(d.product.model)}</p>` : ""}${d.benefits.map((benefit) => `<p><strong>${escapeHtml(benefit.description)}</strong> · ${escapeHtml(benefit.status.toLowerCase())}${full && benefit.conditions ? `<br>${escapeHtml(benefit.conditions)}` : ""}</p>`).join("")}<p>Stock: ${escapeHtml(d.availability.toLowerCase().replaceAll("_", " "))} · Checked ${date(d.lastVerifiedAt)}</p>${
    full
      ? `<ul>${d.components.map((item) => `<li>${item.quantity ?? "Quantity unknown"} ${escapeHtml(item.unit ?? "")} ${escapeHtml(item.description)} (${escapeHtml(item.role.toLowerCase().replaceAll("_", " "))})</li>`).join("")}</ul><p>Delivery charges ${d.eligibility.mandatoryChargesMinor === null ? "unknown; confirm with seller" : money({ currency: "NPR", amountMinor: d.eligibility.mandatoryChargesMinor })}. Combining promotions: ${escapeHtml(d.eligibility.combinability.toLowerCase())}.</p>${[
          d.eligibility.paymentMethod,
          d.eligibility.bankOrCard,
          d.eligibility.coupon,
          d.eligibility.location,
          d.eligibility.usageLimit,
        ]
          .filter(Boolean)
          .map((condition) => `<p>${escapeHtml(condition ?? "")}</p>`)
          .join(
            "",
          )}${d.evidence.map((evidence) => `<p><a href="${safeUrl(evidence.url) ?? "#"}" target="_blank" rel="noopener noreferrer">Original offer evidence ↗</a></p>`).join("")}`
      : ""
  }</div>`;
}
function card(offer: Offer): string {
  return `<li class="offer-card">${image(offer)}<div class="card-body"><p class="seller">${escapeHtml(offer.sellerDisplayName)} <span>· ${escapeHtml(CATEGORIES[offer.category])}</span></p><h3><a href="/offers/${encodeURIComponent(offer.id)}">${escapeHtml(offer.title)}</a></h3><p class="prices"><strong>${offerPrice(offer)}</strong>${offer.originalPrice === null ? "" : ` <s>${money(offer.originalPrice)}</s> <span>Seller reference price</span>`}</p>${discoveryDetails(offer)}<div class="card-bottom"><span>${offer.explicitValidityEnd === null ? "Listed until" : "Ends"} ${date(new Date(Date.parse(offer.expiresAt) - 1).toISOString())}</span><a aria-label="Details for ${escapeHtml(offer.title)}" href="/offers/${encodeURIComponent(offer.id)}">View offer ↗</a></div></div></li>`;
}
function filterForm(params: URLSearchParams): string {
  const selectedCategories = params.getAll("category");
  const selectedSources = params.getAll("source");
  return `<form class="filter-form" action="/" method="get"><div class="search-field"><label for="q">What are you looking for?</label><div class="search-control"><input id="q" name="q" type="search" maxlength="200" value="${escapeHtml(params.get("q") ?? "")}" placeholder="Try headphones, shoes, a fridge…"><button type="submit">Search ↗</button></div></div><div class="filter-body">${params.get("scope") === "DASHAIN" ? '<input type="hidden" name="scope" value="DASHAIN"><p>Current Dashain product discounts</p>' : '<input type="hidden" name="scope" value="ALL">'}<label for="brand">Brand</label><input id="brand" name="brand" value="${escapeHtml(params.get("brand") ?? "")}" maxlength="200"><label for="min">Minimum price (NPR)</label><input id="min" name="min" type="number" min="0" step="0.01" value="${escapeHtml(params.get("min") ?? "")}"><label for="max">Maximum price (NPR)</label><input id="max" name="max" type="number" min="0" step="0.01" value="${escapeHtml(params.get("max") ?? (parseBudgetIntent(params.get("q") ?? "").maxPriceMinor === null ? "" : String((parseBudgetIntent(params.get("q") ?? "").maxPriceMinor ?? 0) / 100)))}"><fieldset><legend>Offer type</legend>${(params.get("scope") === "DASHAIN" ? DASHAIN_PRODUCT_TYPES : OFFER_TYPES).map((type) => `<label class="check-option"><input type="checkbox" name="type" value="${type}"${params.getAll("type").includes(type) ? " checked" : ""}>${escapeHtml(type.toLowerCase().replaceAll("_", " "))}</label>`).join("")}</fieldset><label class="check-option"><input type="checkbox" name="stock" value="IN_STOCK"${params.has("stock") ? " checked" : ""}>Verified in stock</label><details class="category-filter"${selectedCategories.length ? " open" : ""}><summary>Categories${selectedCategories.length ? ` (${selectedCategories.length})` : ""}</summary><fieldset><legend class="sr-only">Filter by category</legend>${Object.entries(
    CATEGORIES,
  )
    .map(
      ([value, label]) =>
        `<label class="check-option"><input type="checkbox" name="category" value="${value}"${selectedCategories.includes(value) ? " checked" : ""}><span>${escapeHtml(label)}</span></label>`,
    )
    .join(
      "",
    )}</fieldset></details><label class="sort-label" for="sort">Sort offers</label><select id="sort" name="sort">${Object.entries(
    SORTS,
  )
    .map(
      ([value, label]) =>
        `<option value="${value}"${(params.get("sort") ?? (params.get("q") ? "RELEVANCE" : "NEWEST")) === value ? " selected" : ""}>${escapeHtml(label)}</option>`,
    )
    .join(
      "",
    )}</select><div class="filter-actions"><button type="submit">Apply filters</button><a href="/">Clear all</a></div></div></form>`;
}
function loadingIntro(note = "Gathering good finds"): string {
  return `<div class="page-intro" aria-hidden="true"><div class="page-intro-inner"><div class="page-intro-flight"><span class="page-intro-kite"></span><span class="page-intro-tail"></span></div><p class="page-intro-title">Dashain <span>2083</span></p><p class="page-intro-note">${escapeHtml(note)}</p><span class="page-intro-progress"></span></div></div>`;
}

export function renderHome(page: OfferPage, params: URLSearchParams, showIntro = false): string {
  const filtered = [...params.keys()].some((key) => key !== "cursor" && key !== "sort");
  const next = new URLSearchParams(params);
  if (page.nextCursor !== null) next.set("cursor", page.nextCursor);
  return layout(
    "Discover offers",
    `${showIntro ? loadingIntro() : ""}<main id="main" tabindex="-1" class="shell"><section class="intro" aria-labelledby="intro-title"><div class="intro-content"><p class="eyebrow">DASHAIN 2083 · MADE FOR NEPAL</p><h1 id="intro-title">Good finds for<br><em>great celebrations.</em></h1><p class="intro-copy">From the first kite in the sky to the last family gathering, find verified Dashain product discounts worth bringing home.</p><div class="intro-actions"><a class="button" href="#offers">Explore offers <span aria-hidden="true">↗</span></a><a class="text-link" href="/?scope=DASHAIN#offers">See Dashain offers <span aria-hidden="true">→</span></a></div></div><div class="festival-art" aria-hidden="true"><span class="festival-sun"></span><span class="kite kite-one"><i></i></span><span class="kite kite-two"><i></i></span><span class="kite kite-three"><i></i></span><span class="festival-hill hill-one"></span><span class="festival-hill hill-two"></span><span class="festival-flower flower-one">✺</span><span class="festival-flower flower-two">✺</span><span class="festival-caption">LET THE GOOD FINDS FLY</span></div></section><div class="discovery-layout">${filterForm(params)}<section id="offers" class="results" aria-labelledby="results-heading"><div class="results-heading"><div><p class="eyebrow">${filtered ? "YOUR SEARCH" : "FRESH FINDS"}</p><h2 id="results-heading">${filtered ? "Matching offers" : "Explore the latest"}</h2></div><span>${page.items.length} ${page.items.length === 1 ? "offer" : "offers"} on this page</span></div>${page.items.length === 0 ? `<div class="empty" role="status"><span aria-hidden="true">✳</span><h3>${params.get("scope") === "DASHAIN" ? "No verified current Dashain offers match" : "No offers found"}</h3><p>Try a different search or clear your filters.<br>Fresh offers appear as stores publish them.</p><a class="button" href="/">Clear filters</a></div>` : `<ul class="offer-grid">${page.items.map(card).join("")}</ul>`}${page.nextCursor === null ? "" : `<nav class="pagination" aria-label="Offer pages"><a class="button" href="/?${escapeHtml(next.toString())}">More offers →</a></nav>`}</section></div></main>`,
  );
}
export function renderDetail(offer: Offer): string {
  const destination = safeUrl(offer.destinationUrl);
  return layout(
    offer.title,
    `${loadingIntro("Opening your offer")}<main id="main" tabindex="-1" class="shell detail"><a class="back-link" href="/">← All offers</a><article class="detail-grid">${image(offer, true)}<div class="detail-copy"><p class="eyebrow">${escapeHtml(CATEGORIES[offer.category])}</p><p class="seller">${escapeHtml(offer.sellerDisplayName)}</p><h1>${escapeHtml(offer.title)}</h1>${offer.summary === null ? "" : `<p class="detail-summary">${escapeHtml(offer.summary)}</p>`}<p class="prices"><strong>${offerPrice(offer)}</strong>${offer.originalPrice === null ? "" : ` <s>${money(offer.originalPrice)}</s> <span>Seller reference price</span>`}</p>${offer.discountLabel === null ? "" : `<p>${escapeHtml(offer.discountLabel)}</p>`}${destination === null ? "" : `<a class="button seller-button" href="${destination}" target="_blank" rel="noopener noreferrer">Visit ${escapeHtml(offer.sellerDisplayName)} ↗<span class="sr-only"> (opens in a new tab)</span></a>`}${discoveryDetails(offer, true)}${offer.discovery?.product && offer.brandName ? `<p><a href="/offers/${encodeURIComponent(offer.id)}/compare">Compare this model and variant</a></p>` : ""}<p class="purchase-note">You'll complete your purchase with the seller.</p><dl class="offer-facts">${offer.brandName === null ? "" : `<div><dt>Brand</dt><dd>${escapeHtml(offer.brandName)}</dd></div>`}<div><dt>${offer.explicitValidityEnd === null ? "Listed until" : "Offer ends"}</dt><dd>${date(new Date(Date.parse(offer.expiresAt) - 1).toISOString())} · Nepal time</dd></div><div><dt>First spotted</dt><dd>${date(offer.firstDiscoveredAt)}</dd></div></dl>${offer.explicitValidityEnd === null ? '<p class="expiry-note">The seller has not provided an end date. This listing uses our automatic expiry policy.</p>' : ""}${offer.terms === null ? "" : `<section class="terms"><h2>Offer terms</h2><p>${escapeHtml(offer.terms)}</p></section>`}</div></article></main>`,
  );
}
export function renderMessage(title: string, message: string): string {
  return layout(
    title,
    `<main id="main" tabindex="-1" class="shell message"><p class="eyebrow">DASHAIN OFFER RADAR</p><h1>${escapeHtml(title)}</h1><p>${escapeHtml(message)}</p><a class="button" href="/">Back to offers</a></main>`,
  );
}

export function renderComparison(reference: Offer, offers: readonly Offer[]): string {
  return layout(
    `Compare ${reference.discovery?.product?.model ?? reference.title}`,
    `<main id="main" tabindex="-1" class="shell detail"><h1>Compare ${escapeHtml(reference.discovery?.product?.model ?? reference.title)}</h1><p>Matching brand, model and variant. Seller offers and gifts remain separate. Delivery costs may be extra.</p>${offers.length < 2 ? "<p>No other verified matching offers are currently available.</p>" : ""}<ul class="offer-grid">${offers.map(card).join("")}</ul><a href="/offers/${encodeURIComponent(reference.id)}">Back to offer</a></main>`,
  );
}
