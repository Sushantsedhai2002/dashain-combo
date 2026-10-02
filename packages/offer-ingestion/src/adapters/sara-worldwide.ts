import { createHash } from "node:crypto";
import { load } from "cheerio";
import { UNKNOWN_ELIGIBILITY } from "@dashain-offer/offer-catalog";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { sellerImageUrl } from "./product-image.ts";
export const SARA_ROOT = "https://saraworldwide.com.np/";
export const SARA_PRODUCT = `${SARA_ROOT}wp-json/wc/store/v1/products/1075`;
export const SARA_CART = `${SARA_ROOT}wp-json/wc/store/v1/cart`;
export const SARA_ADD = `${SARA_CART}/add-item`;
const URL = `${SARA_ROOT}product/black-salt/`;
const END = "2026-11-16T18:14:59.999Z";
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function json(raw: string): Record<string, unknown> | null {
  try {
    if (raw.length > 100_000) return null;
    const v: unknown = JSON.parse(raw);
    return record(v) ? v : null;
  } catch {
    return null;
  }
}
function empty(v: unknown): boolean {
  return Array.isArray(v) && v.length === 0;
}
function npr(v: unknown): v is Record<string, unknown> {
  return record(v) && v.currency_code === "NPR" && v.currency_minor_unit === 2;
}
function minor(v: unknown): number | null {
  return typeof v === "string" && /^\d{1,12}$/.test(v) && Number.isSafeInteger(Number(v))
    ? Number(v)
    : null;
}
export function extractSara(
  root: string,
  product: string,
  cart: string,
  fetchedAt: string,
): CandidateOffer | null {
  const $ = load(root),
    text = $("body").text().replace(/\s+/g, " ");
  const now = Date.parse(fetchedAt);
  if (
    !Number.isFinite(now) ||
    new Date(now).getUTCFullYear() !== 2026 ||
    now > Date.parse(END) ||
    !text.includes(
      "Celebrate Dashain, Tihar and Chhath with 10% off every product across Sara Foods and Sara Organics.",
    ) ||
    !text.includes("November 16, 2026") ||
    !text.includes("SARA WORLDWIDE BUSINESS PVT. LTD.")
  )
    return null;
  const p = json(product),
    c = json(cart);
  if (
    !p ||
    !c ||
    p.id !== 1075 ||
    p.name !== "Black Salt" ||
    p.type !== "simple" ||
    p.parent !== 0 ||
    p.permalink !== URL ||
    p.has_options !== false ||
    !empty(p.attributes) ||
    !empty(p.variations) ||
    !empty(p.grouped_products) ||
    p.is_purchasable !== true ||
    p.is_in_stock !== true ||
    p.is_on_backorder !== false ||
    p.is_password_protected !== false ||
    typeof p.description !== "string" ||
    !load(p.description).text().includes("250gm Rs 150") ||
    !npr(p.prices) ||
    minor(p.prices.price) !== 15000 ||
    minor(p.prices.regular_price) !== 15000 ||
    p.prices.price_range !== null ||
    !Array.isArray(c.items) ||
    c.items.length !== 1 ||
    c.items_count !== 1 ||
    !empty(c.errors) ||
    !empty(c.fees) ||
    !Array.isArray(c.coupons) ||
    c.coupons.length !== 1 ||
    !npr(c.totals)
  )
    return null;
  const item: unknown = c.items[0],
    coupon: unknown = c.coupons[0];
  if (
    !record(item) ||
    item.id !== p.id ||
    item.name !== p.name ||
    item.permalink !== URL ||
    item.quantity !== 1 ||
    !empty(item.variation) ||
    !npr(item.prices) ||
    minor(item.prices.price) !== 15000 ||
    !npr(item.totals) ||
    minor(item.totals.line_subtotal) !== 15000 ||
    minor(item.totals.line_total) !== 13500 ||
    minor(item.totals.line_subtotal_tax) !== 0 ||
    minor(item.totals.line_total_tax) !== 0 ||
    !record(coupon) ||
    coupon.code !== "sara-festive-10" ||
    coupon.discount_type !== "percent" ||
    !npr(coupon.totals) ||
    minor(coupon.totals.total_discount) !== 1500 ||
    minor(c.totals.total_items) !== 15000 ||
    minor(c.totals.total_discount) !== 1500 ||
    minor(c.totals.total_price) !== 13500 ||
    minor(c.totals.total_tax) !== 0 ||
    minor(c.totals.total_fees) !== 0 ||
    c.totals.total_shipping !== null
  )
    return null;
  const terms =
    "Automatic sara-festive-10 cart discount verified for one Black Salt 250g pack in an empty anonymous cart. NPR 150 item subtotal and NPR 135 item total; delivery charges are excluded and depend on destination. No order is placed. Sara Foods and Sara Organics are one seller.";
  const key = "sara-festive-2026";
  return {
    sourceOfferKey: `${key}:1075`,
    title: "Black Salt 250g",
    productName: "Black Salt 250g",
    brandName: "Sara Foods",
    category: "FOOD_AND_DELIVERY",
    destinationUrl: URL,
    imageUrl: sellerImageUrl(
      Array.isArray(p.images) && record(p.images[0]) && typeof p.images[0].src === "string"
        ? p.images[0].src
        : undefined,
      URL,
    ),
    originalPrice: { currency: "NPR", amountMinor: 15000 },
    salePrice: { currency: "NPR", amountMinor: 13500 },
    discountPercent: 10,
    terms,
    explicitValidityEnd: { kind: "INSTANT", value: END },
    discovery: {
      offerType: "PRODUCT_DISCOUNT",
      qualification: "QUALIFIED",
      ruleVersion: "dashain-price-v2",
      reasons: [
        "DATED_SITEWIDE_DASHAIN_CAMPAIGN",
        "EXACT_SIMPLE_PRODUCT_AND_PACK",
        "MERCHANT_CART_SUBTOTAL_AND_DISCOUNTED_TOTAL",
      ],
      campaign: {
        key,
        title: "Sara festive season sale 2026",
        festivals: ["DASHAIN", "TIHAR"],
        seasonAD: 2026,
        seasonBS: null,
        publishedAt: null,
        startsAt: null,
        endsAt: END,
        originalDateText: "Valid till November 16, 2026",
        dateCalendar: "AD",
        evidenceUrl: SARA_ROOT,
        membership: "ELIGIBLE_CATEGORY",
      },
      product: {
        key: "1075",
        model: "Sara Black Salt",
        variant: "250g",
        gtin: null,
        attributes: { pack: "250g" },
      },
      merchant: "Sara Worldwide",
      availability: "IN_STOCK",
      lastVerifiedAt: fetchedAt,
      priceObservedAt: fetchedAt,
      components: [
        { description: "Black Salt 250g", quantity: 1, unit: "pack", role: "MAIN_ITEM" },
      ],
      eligibility: { ...UNKNOWN_ELIGIBILITY },
      benefits: [],
      evidence: [
        {
          url: SARA_ROOT,
          fetchedAt,
          contentHash: createHash("sha256").update(root).digest("hex"),
          excerpt:
            "Sara Worldwide Business Pvt. Ltd.; Dashain, Tihar and Chhath; automatic 10% off every product; valid till November 16, 2026",
          path: "dated sitewide campaign and merchant identity",
          extractorVersion: "sara-cart-v1",
          fields: ["campaign", "membership", "offerType"],
        },
        {
          url: SARA_PRODUCT,
          fetchedAt,
          contentHash: createHash("sha256").update(product).digest("hex"),
          excerpt:
            "Product 1075; Black Salt; 250gm Rs 150; simple, purchasable, in stock, no options",
          path: "public Store API product, exact pack and price",
          extractorVersion: "sara-cart-v1",
          fields: ["product", "originalPrice", "components"],
        },
        {
          url: SARA_ADD,
          fetchedAt,
          contentHash: createHash("sha256").update(cart).digest("hex"),
          excerpt:
            "Anonymous single-item cart: product 1075, quantity 1, NPR 150 subtotal, sara-festive-10 reduction NPR 15, NPR 135 line total; no tax/fees; shipping not calculated",
          path: "merchant anonymous cart response; observed line price after automatic discount",
          extractorVersion: "sara-cart-v1",
          fields: ["salePrice", "originalPrice", "eligibility"],
        },
      ],
    },
  };
}
export function createSaraAdapter(fetchPage: PageFetcher, clock = () => new Date()): SourceAdapter {
  return {
    sourceId: "sara-worldwide",
    async scan(source) {
      if (source.id !== "sara-worldwide" || !source.campaignEntryPoints?.includes(SARA_ROOT))
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const fetchedAt = clock().toISOString();
        const root = await fetchPage(SARA_ROOT, source),
          product = await fetchPage(SARA_PRODUCT, source),
          cart = await fetchPage(SARA_CART, source);
        if ([root, product, cart].some((r) => r.status !== 200))
          return { ok: false, reason: "NETWORK_ERROR" };
        const initial = json(cart.body);
        if (!initial || !empty(initial.items) || initial.items_count !== 0 || !cart.cartToken)
          return { ok: false, reason: "STRUCTURE_CHANGED" };
        const priced = await fetchPage(SARA_ADD, source, {
          kind: "SARA_CART_ADD",
          productId: 1075,
          cartToken: cart.cartToken,
        });
        if (priced.status !== 200 && priced.status !== 201)
          return { ok: false, reason: "NETWORK_ERROR" };
        const offer = extractSara(root.body, product.body, priced.body, fetchedAt);
        return offer
          ? { ok: true, offers: [offer], partial: true }
          : { ok: false, reason: "STRUCTURE_CHANGED" };
      } catch {
        return { ok: false, reason: "NETWORK_ERROR" };
      }
    },
  };
}
