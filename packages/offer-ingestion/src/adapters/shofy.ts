import { createHash } from "node:crypto";
import { UNKNOWN_ELIGIBILITY } from "@dashain-offer/offer-catalog";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";

export const SHOFY_STORE = "https://shofydrop.com/store/sugandha_griha";
export const SHOFY_OFFERS =
  "https://shofydrop.com/api/products/product/offerProduct?offset=0&noOfRows=100";
export const SHOFY_PRODUCT = "https://shofydrop.com/api/products/product/id?id=774";
export const SHOFY_SELLER =
  "https://shofydrop.com/api/vendor/vendorDescription/?username=sugandha_griha";
export const SHOFY_FEEDS = [SHOFY_OFFERS, SHOFY_PRODUCT, SHOFY_SELLER] as const;
function record(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function array(html: string): readonly Record<string, unknown>[] | null {
  try {
    const v: unknown = JSON.parse(html);
    return Array.isArray(v) && v.length <= 100 && v.every(record) ? v : null;
  } catch {
    return null;
  }
}
function minor(v: unknown): number | null {
  if (typeof v !== "number" || !Number.isFinite(v) || v <= 0 || v > 10_000_000) return null;
  const m = Math.round(v * 100);
  return Math.abs(v * 100 - m) < 0.00001 ? m : null;
}
export function extractShofy(
  offerBody: string,
  productBody: string,
  sellerBody: string,
  fetchedAt: string,
): CandidateOffer | null {
  const offers = array(offerBody),
    products = array(productBody),
    sellers = array(sellerBody);
  if (!offers || products?.length !== 1 || sellers?.length !== 1) return null;
  const p = products[0]!,
    seller = sellers[0]!;
  const identity = (r: Record<string, unknown>) =>
    r.vendorId === 153 && r.shopName === "Sugandha Griha" && r.username === "sugandha_griha";
  if (
    !identity(p) ||
    !identity(seller) ||
    seller.status !== 1 ||
    seller.vendorAddress !== "Old Baneshwor, Kathmandu, Bagmati Province" ||
    p.id !== 774 ||
    p.productName !== "Blanko Dawn Perfume 100ML" ||
    p.status !== 1 ||
    typeof p.stock !== "number" ||
    !Number.isSafeInteger(p.stock) ||
    p.stock <= 0 ||
    p.variable !== false ||
    !Array.isArray(p.variables) ||
    p.variables.length ||
    p.sku !== "blanko_da_774"
  )
    return null;
  const now = Date.parse(fetchedAt),
    season = new Date(fetchedAt).getUTCFullYear();
  const memberships = offers.filter(
    (o) =>
      o.id === p.id &&
      identity(o) &&
      typeof o.offerName === "string" &&
      /^Dashain Sale Offer!!$/i.test(o.offerName) &&
      o.status === 1 &&
      typeof o.startDate === "number" &&
      typeof o.endDate === "number" &&
      Number.isSafeInteger(o.startDate) &&
      Number.isSafeInteger(o.endDate) &&
      new Date(o.startDate).getUTCFullYear() === season &&
      new Date(o.endDate).getUTCFullYear() === season &&
      o.startDate <= now &&
      now < o.endDate,
  );
  if (!Number.isFinite(now) || memberships.length !== 1) return null;
  const o = memberships[0]!,
    original = minor(p.price),
    amount = minor(p.discountedPrice);
  // This API's discountedPrice is an absolute reduction, as used by the first-party
  // storefront renderer. Never treat it as a sale price or apply the campaign percentage.
  if (
    original === null ||
    amount === null ||
    amount >= original ||
    o.productName !== p.productName ||
    minor(o.price) !== original ||
    minor(o.discountedPrice) !== amount ||
    typeof o.discountPercent !== "number" ||
    Math.abs(o.discountPercent - amount / original) > 0.000001 ||
    p.discountPercent !== Math.round((amount / original) * 100) ||
    typeof o.remainingOfferProduct !== "number" ||
    o.remainingOfferProduct <= 0 ||
    typeof o.noOfProduct !== "number" ||
    o.noOfProduct <= 0 ||
    typeof o.offerId !== "number" ||
    !Number.isSafeInteger(o.offerId)
  )
    return null;
  const sale = original - amount,
    key = `sugandha-griha-dashain-${season}`,
    url = `${SHOFY_STORE}/product/774`;
  let imageUrl: string | null = null;
  if (
    typeof o.productImage === "string" &&
    record(p.productImages) &&
    Object.values(p.productImages).some(
      (entry) => record(entry) && entry.thumbnail === true && entry.image === o.productImage,
    )
  ) {
    try {
      const image = new URL(o.productImage);
      if (
        image.protocol === "https:" &&
        image.hostname === "shofydroplive.s3.ap-south-1.amazonaws.com" &&
        image.pathname.startsWith("/live/") &&
        !image.username &&
        !image.password
      )
        imageUrl = image.href;
    } catch {
      // An invalid image does not invalidate the verified product price.
    }
  }
  return {
    sourceOfferKey: `${key}:774`,
    title: "Blanko Dawn Perfume 100ML",
    productName: "Blanko Dawn Perfume 100ML",
    brandName: null,
    category: "FASHION_AND_LIFESTYLE",
    destinationUrl: url,
    imageUrl,
    originalPrice: { currency: "NPR", amountMinor: original },
    salePrice: { currency: "NPR", amountMinor: sale },
    discountPercent: Math.round((amount / original) * 100),
    explicitValidityEnd: null,
    terms: null,
    discovery: {
      offerType: "PRODUCT_DISCOUNT",
      qualification: "QUALIFIED",
      ruleVersion: "dashain-price-v2",
      reasons: [
        "DATED_DASHAIN_EXACT_PRODUCT_MEMBERSHIP",
        "REVIEWED_INDEPENDENT_MARKETPLACE_SELLER",
        "CAMPAIGN_AND_PRODUCT_DISCOUNT_AMOUNT_AGREE",
        "SIMPLE_PRODUCT_WITH_AVAILABLE_STOCK",
      ],
      campaign: {
        key,
        title: String(o.offerName),
        festivals: ["DASHAIN"],
        seasonAD: season,
        seasonBS: null,
        publishedAt: null,
        startsAt: new Date(Number(o.startDate)).toISOString(),
        endsAt: new Date(Number(o.endDate) - 1).toISOString(),
        originalDateText: `${o.startDate}–${o.endDate} (source epoch milliseconds)`,
        dateCalendar: "AD",
        evidenceUrl: SHOFY_OFFERS,
        membership: "EXPLICIT_PRODUCT",
      },
      product: {
        key: "774",
        model: String(p.sku),
        variant: "Blanko Dawn Perfume 100ML",
        gtin: null,
        attributes: { sku: String(p.sku), volume: "100 ML" },
      },
      merchant: "Sugandha Griha",
      availability: "IN_STOCK",
      lastVerifiedAt: fetchedAt,
      priceObservedAt: fetchedAt,
      components: [
        { description: "Blanko Dawn Perfume 100ML", quantity: 1, unit: "item", role: "MAIN_ITEM" },
      ],
      eligibility: { ...UNKNOWN_ELIGIBILITY },
      benefits: [],
      evidence: [
        {
          url: SHOFY_OFFERS,
          fetchedAt,
          contentHash: createHash("sha256").update(offerBody).digest("hex"),
          excerpt: `${o.offerName}; product 774; vendor 153; validity ${o.startDate}–${o.endDate}; original NPR ${original / 100}; discount amount NPR ${amount / 100}; price NPR ${sale / 100}`,
          path: "reviewed public offerProduct response; exact active product/seller/date membership",
          extractorVersion: "shofy-v1",
          fields: ["campaign", "membership", "offerType", "product", "originalPrice", "salePrice"],
        },
        {
          url: SHOFY_PRODUCT,
          fetchedAt,
          contentHash: createHash("sha256").update(productBody).digest("hex"),
          excerpt: `${p.productName}; SKU ${p.sku}; stock ${p.stock}; no variables; original NPR ${original / 100}; discount amount NPR ${amount / 100}; price NPR ${sale / 100}`,
          path: "public exact product record; storefront's original minus absolute discount amount contract",
          extractorVersion: "shofy-v1",
          fields: ["product", "originalPrice", "salePrice", "components", "eligibility"],
        },
        {
          url: SHOFY_SELLER,
          fetchedAt,
          contentHash: createHash("sha256").update(sellerBody).digest("hex"),
          excerpt:
            "Vendor 153: Sugandha Griha; sugandha_griha; active; Old Baneshwor, Kathmandu, Bagmati Province",
          path: "public merchant profile identity corroborates campaign and product",
          extractorVersion: "shofy-v1",
          fields: ["membership"],
        },
      ],
    },
  };
}
export function createShofyAdapter(
  fetchPage: PageFetcher,
  clock = () => new Date(),
): SourceAdapter {
  return {
    sourceId: "sugandha-griha",
    async scan(source) {
      if (
        source.id !== "sugandha-griha" ||
        !SHOFY_FEEDS.every((u) => source.publicEvidenceFeeds?.includes(u))
      )
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const bodies: string[] = [];
        for (const url of SHOFY_FEEDS) {
          const r = await fetchPage(url, source);
          if (r.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
          bodies.push(r.body);
        }
        const offer = extractShofy(bodies[0]!, bodies[1]!, bodies[2]!, clock().toISOString());
        return offer
          ? { ok: true, offers: [offer], partial: true }
          : { ok: false, reason: "STRUCTURE_CHANGED" };
      } catch {
        return { ok: false, reason: "NETWORK_ERROR" };
      }
    },
  };
}
