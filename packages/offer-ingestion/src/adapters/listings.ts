import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { OfferCategory } from "@dashain-offer/offer-catalog";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { inferProductDetails, parseNprPrice } from "./product-details.ts";

type ListingProfile = Readonly<{
  sourceId: string;
  listingUrl: string;
  cards: string;
  title: string;
  link: string;
  original: string;
  sale: string;
  removeFromSale?: string;
  image: string;
  fallback: OfferCategory;
  fixedCategory?: OfferCategory;
  brand?: string;
  brandSelector?: string;
  summary?: string;
}>;
// Selectors verified against recorded public HTML on 2026-09-30.
// Cheerio selection API: https://cheerio.js.org/docs/basics/selecting/
export const LISTING_PROFILES: readonly ListingProfile[] = Object.freeze([
  {
    sourceId: "ishop-nepal",
    listingUrl: "https://ishop.com.np/",
    cards: ".product-miniature",
    title: ".product-title a",
    link: ".product-title a[href]",
    original: ".regular-price",
    sale: ".product-price-and-shipping .price",
    image: ".product-thumbnail img",
    fallback: "GENERAL_RETAIL",
  },
  {
    sourceId: "moto-world-nepal",
    listingUrl: "https://motoworldnepal.com/",
    cards: ".stm-product-inner",
    title: "h5 a",
    link: "h5 a[href]",
    original: ".price del .amount",
    sale: ".price ins .amount",
    image: ".product_thumbnail img",
    fallback: "AUTOMOTIVE",
    fixedCategory: "AUTOMOTIVE",
  },
  {
    sourceId: "yantra-nepal",
    listingUrl: "https://yantranepal.com/",
    cards: ".type-product",
    title: ".product_title a",
    link: ".product_title a[href]",
    original: ".price del .amount",
    sale: ".price ins .amount",
    image: ".elementor-widget-image img",
    fallback: "CONSUMER_ELECTRONICS",
  },
  {
    sourceId: "nagmani",
    listingUrl: "https://nagmani.com.np/",
    cards: ".product-item",
    title: ".product-item-name a",
    link: ".product-item-name a[href]",
    original: ".old-price .price",
    sale: ".special-price .price",
    image: ".product-image-photo",
    fallback: "COMPUTERS_AND_ACCESSORIES",
  },
  {
    sourceId: "gadget-house-nepal",
    listingUrl: "https://gadgethousenepal.com/",
    cards: ".product-grid-item",
    title: ".wd-entities-title",
    link: ".wd-entities-title a[href]",
    original: ".price del .amount",
    sale: ".price ins .amount",
    image: ".product-image-link img",
    fallback: "CONSUMER_ELECTRONICS",
  },
  {
    sourceId: "khudra",
    listingUrl: "https://www.khudra.com.np/",
    cards: ".product-item__inner",
    title: ".product-item__title a",
    link: ".product-item__title a[href]",
    original: ".prodcut-price del",
    sale: ".prodcut-price ins",
    image: "img.thumbnail",
    fallback: "GENERAL_RETAIL",
  },
  {
    sourceId: "aadima-nepal",
    listingUrl: "https://aadimanepal.com/collections/sale",
    cards: ".card--product",
    title: ".card__title a",
    link: ".card__title a[href]",
    original: ".price__was .js-value",
    sale: ".price__current .js-value",
    image: ".card__main-image",
    fallback: "FASHION_AND_LIFESTYLE",
    brandSelector: ".card__vendor",
  },
  {
    sourceId: "shoes4less-nepal",
    listingUrl: "https://shoes4lessnepal.com/collections/sale",
    cards: ".collection__page-product",
    title: ".prod-title",
    link: ".product-info a[href]",
    original: ".price__sale s.price-item--regular",
    sale: ".price__sale .price-item--sale",
    image: "img",
    fallback: "FASHION_AND_LIFESTYLE",
  },
  {
    sourceId: "ekjor",
    listingUrl: "https://www.ekjor.com/",
    cards: "a.col-span-1",
    title: "span.line-clamp-2",
    link: "",
    original: "del",
    sale: "span.text-blue-700",
    image: "img",
    fallback: "FASHION_AND_LIFESTYLE",
  },

  {
    sourceId: "choicemandu",
    listingUrl: "https://choicemandu.com/index.php?route=product/special",
    cards: ".product-layout",
    title: "h4 a",
    link: "h4 a[href]",
    original: ".price-old",
    sale: ".price-new",
    image: ".product-image-container img",
    fallback: "GENERAL_RETAIL",
  },
  {
    sourceId: "big-digital",
    listingUrl: "https://bigdigital.com.np/",
    cards: ".product-card",
    title: ".product-card-title a",
    link: ".product-card-title a[href]",
    original: ".regular-price.on-offer",
    sale: ".offer-price",
    image: ".card-img img",
    fallback: "HOME_APPLIANCES",
  },
  {
    sourceId: "online-saathi",
    listingUrl: "https://onlinesaathi.com/",
    cards: ".single-product",
    title: ".prd-name",
    link: "a[href]",
    original: ".cut-prd-price",
    sale: ".prd-price",
    removeFromSale: ".cut-prd-price",
    image: ".single-prd-img",
    fallback: "GENERAL_RETAIL",
  },
  {
    sourceId: "midea-nepal",
    listingUrl: "https://midea.com.np/",
    cards: ".product",
    title: ".product_title",
    link: ".product_title a[href]",
    original: ".product_price del",
    sale: ".product_price .price",
    image: ".product_img img",
    fallback: "HOME_APPLIANCES",
    brand: "Midea",
    summary: ".product_price p",
  },
  {
    sourceId: "neo-store",
    listingUrl: "https://www.neostore.com.np/product-category/weekly-deals",
    cards: ".product-item-box",
    title: ".product-title a",
    link: ".product-title a[href]",
    original: ".price-second",
    sale: ".price-first",
    image: "img",
    fallback: "OTHER",
  },
  {
    sourceId: "caliber-shoes",
    listingUrl: "https://calibershoes.com/shop/?stock_status=onsale",
    cards: ".product-grid-item",
    title: ".wd-entities-title",
    link: ".wd-entities-title a[href]",
    original: ".price del .amount",
    sale: ".price ins .amount",
    image: ".product-image-link img",
    fallback: "FASHION_AND_LIFESTYLE",
    brand: "Caliber",
  },
]);

function approvedUrl(raw: string | undefined, origin: string, product: boolean): string | null {
  if (raw === undefined) return null;
  try {
    const url = new URL(raw, origin);
    if (
      url.origin !== origin ||
      url.username ||
      url.password ||
      url.protocol !== "https:" ||
      (product && (url.pathname === "/" || url.search !== ""))
    )
      return null;
    url.hash = "";
    return url.href;
  } catch {
    return null;
  }
}
export function createListingAdapter(
  profile: ListingProfile,
  fetchPage: PageFetcher,
): SourceAdapter {
  const origin = new URL(profile.listingUrl).origin;
  return Object.freeze({
    sourceId: profile.sourceId,
    async scan(source) {
      if (
        source.id !== profile.sourceId ||
        !source.channels.some(
          (channel) =>
            channel.kind === "WEBSITE" &&
            channel.isEnabled &&
            new URL(channel.url).origin === origin,
        )
      )
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      let response;
      try {
        response = await fetchPage(profile.listingUrl, source);
      } catch {
        return { ok: false, reason: "NETWORK_ERROR" };
      }
      if (response.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
      const $ = load(response.body);
      const cards = $(profile.cards);
      if (cards.length === 0) return { ok: false, reason: "STRUCTURE_CHANGED" };
      const offers: CandidateOffer[] = [];
      const seen = new Set<string>();
      cards.each((_index, element) => {
        const card = $(element);
        const titleElement = card.find(profile.title).first();
        const title = (titleElement.attr("title") ?? titleElement.text())
          .trim()
          .replace(/\s+/g, " ");
        const url = approvedUrl(
          (profile.link ? card.find(profile.link).first() : card).attr("href"),
          origin,
          true,
        );
        const original = parseNprPrice(card.find(profile.original).first().text());
        const price = card.find(profile.sale).first().clone();
        if (profile.removeFromSale) price.find(profile.removeFromSale).remove();
        const sale = parseNprPrice(price.text());
        if (
          !url ||
          seen.has(url) ||
          !title ||
          title.length > 300 ||
          original === null ||
          sale === null ||
          original <= sale ||
          original <= 0
        )
          return;
        seen.add(url);
        const img = card.find(profile.image).first();
        offers.push({
          sourceOfferKey: `${profile.sourceId}:${createHash("sha256").update(new URL(url).pathname).digest("hex")}`,
          title,
          productName: title.length <= 200 ? title : null,
          ...inferProductDetails(
            title,
            profile.fallback,
            profile.brand ??
              (profile.brandSelector
                ? card.find(profile.brandSelector).first().text().split("|")[0]?.trim() || null
                : null),
          ),
          ...(profile.fixedCategory ? { category: profile.fixedCategory } : {}),
          destinationUrl: url,
          imageUrl: approvedUrl(img.attr("data-src") ?? img.attr("src"), origin, false),
          summary: profile.summary
            ? card.find(profile.summary).first().text().trim() || null
            : null,
          originalPrice: { currency: "NPR", amountMinor: original },
          salePrice: { currency: "NPR", amountMinor: sale },
          discountPercent: Math.round(((original - sale) / original) * 100),
        });
      });
      return { ok: true, offers: Object.freeze(offers) };
    },
  });
}
