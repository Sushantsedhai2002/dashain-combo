import { createHash } from "node:crypto";
import { load } from "cheerio";
import { UNKNOWN_ELIGIBILITY } from "@dashain-offer/offer-catalog";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { readFlightRecords, flightObjects, isRecord } from "./flight-records.ts";
import { parseNprPrice } from "./product-details.ts";
export const MYPOWER_ROOT = "https://www.mypower.com.np/";
const BUNDLES = [147, 148, 149] as const;
function objects(html: string) {
  const r = readFlightRecords(html);
  return r ? flightObjects(r) : [];
}
export function mypowerMembers(html: string): readonly Record<string, unknown>[] | null {
  const roots = objects(html).filter(
    (o) => Array.isArray(o.covers) && Array.isArray(o.featured_products),
  );
  if (roots.length !== 1 || !Array.isArray(roots[0]!.featured_products)) return null;
  const members = roots[0]!.featured_products.filter(
    (p): p is Record<string, unknown> => isRecord(p) && BUNDLES.some((id) => id === p.id),
  );
  return members.length === 3 && new Set(members.map((p) => p.id)).size === 3 ? members : null;
}
export function extractMypower(
  root: string,
  html: string,
  member: Record<string, unknown>,
  fetchedAt: string,
): CandidateOffer | null {
  const index = BUNDLES.findIndex((id) => id === member.id),
    number = index + 1;
  if (index < 0) return null;
  const uid = `MYPOWER-DASHAIN-COMBO-0${number}-2083`,
    sku = `MP-DASH-COMBO-0${number}-2083`,
    url = `${MYPOWER_ROOT}product/${uid}`;
  const products = objects(html).filter(
    (p) => p.id === member.id && p.unique_id === uid && typeof p.name === "string",
  );
  if (products.length !== 1) return null;
  const p = products[0]!,
    $ = load(html);
  if (
    $('link[rel="canonical"]').attr("href") !== url ||
    p.sku !== sku ||
    member.sku !== sku ||
    member.unique_id !== uid ||
    p.name !== member.name ||
    typeof p.name !== "string" ||
    p.name.length > 200 ||
    !p.name.startsWith(`MY POWER Dashain Combo Offer ${number} – `) ||
    p.sale !== 1 ||
    p.hidden !== 0 ||
    p.outofstock !== 0 ||
    p.deleted_at !== null ||
    !isRecord(p.specifications) ||
    typeof p.details !== "string"
  )
    return null;
  const spec = p.specifications;
  const original = parseNprPrice(`NPR ${String(p.price)}`),
    sale = parseNprPrice(`NPR ${String(p.discounted_price)}`);
  if (
    original === null ||
    sale === null ||
    original <= sale ||
    sale <= 0 ||
    p.price !== member.price ||
    p.discounted_price !== member.discounted_price ||
    spec.Brand !== "MY POWER" ||
    spec.Campaign !== "Dashain Special Offer 2083" ||
    spec["Bundle Type"] !== "3-Product Combo" ||
    parseNprPrice(String(spec["Original MRP"] ?? spec["Original Combo MRP"])) !== original ||
    parseNprPrice(String(spec["Dashain Offer Price"])) !== sale
  )
    return null;
  const descriptions = [spec["Product 1"], spec["Product 2"], spec["Product 3"]];
  if (
    !descriptions.every(
      (v): v is string => typeof v === "string" && v.startsWith("MY POWER ") && v.length < 150,
    ) ||
    new Set(descriptions).size !== 3
  )
    return null;
  if (
    !Array.isArray(p.colors) ||
    !Array.isArray(member.colors) ||
    JSON.stringify(p.colors) !== JSON.stringify(member.colors) ||
    p.colors.length > 10 ||
    p.colors.some(
      (v) =>
        !isRecord(v) ||
        Object.keys(v).length !== 1 ||
        typeof v.color !== "string" ||
        !/^#[a-f0-9]{6}$/i.test(v.color),
    )
  )
    return null;
  // These are three explicitly identified bundle SKUs with one fixed bundle price.
  // Color preferences have no separate priced SKU; do not multiply them into offers
  // or claim availability for an unselected color. Any new variation pricing needs review.
  for (const key of ["variants", "variations", "sizes"])
    if (p[key] !== undefined && (!Array.isArray(p[key]) || p[key].length)) return null;
  const plain = load(p.details).text().replace(/\s+/g, " ");
  const dateText = "2nd OCT – 16th OCT 2083";
  if (
    !plain.includes(dateText) ||
    !plain.includes(`Rs. ${(sale / 100).toLocaleString("en-US")}`) ||
    !plain.includes(`Rs. ${(original / 100).toLocaleString("en-US")}`) ||
    !descriptions.every((d) => plain.includes(d))
  )
    return null;
  // October is explicitly named in English; 2083 identifies the BS season.
  // The same campaign's product metadata corroborates September 2026 publication.
  if (
    typeof p.created_at !== "string" ||
    !/^2026-09-\d{2}T/.test(p.created_at) ||
    !Number.isFinite(Date.parse(p.created_at)) ||
    Date.parse(p.created_at) > Date.parse(fetchedAt)
  )
    return null;
  const startsAt = "2026-10-01T18:15:00.000Z",
    endsAt = "2026-10-16T18:14:59.999Z",
    now = Date.parse(fetchedAt);
  if (!Number.isFinite(now) || now < Date.parse(startsAt) || now > Date.parse(endsAt)) return null;
  const roots = objects(root).filter((o) => Array.isArray(o.covers));
  if (
    roots.length !== 1 ||
    !Array.isArray(roots[0]!.covers) ||
    !roots[0]!.covers.some(
      (cover) =>
        isRecord(cover) &&
        cover.id === number + 2 &&
        typeof cover.main_text === "string" &&
        cover.main_text.startsWith("Dashain ") &&
        typeof cover.sub_text === "string" &&
        cover.sub_text.includes(`MRP Rs. ${(original / 100).toLocaleString("en-US")}`) &&
        cover.sub_text.includes(`Offer Rs. ${(sale / 100).toLocaleString("en-US")}`) &&
        typeof cover.created_at === "string" &&
        cover.created_at.startsWith("2026-09-"),
    )
  )
    return null;
  const key = "mypower-dashain-2026",
    terms =
      "Price is for the named three-product bundle. Color is unspecified; confirm color availability with MyPower. No separate color offers or lucky-draw savings are included.";
  return {
    sourceOfferKey: `${key}:${member.id}`,
    title: p.name,
    productName: p.name,
    brandName: "MY POWER",
    category: "CONSUMER_ELECTRONICS",
    destinationUrl: url,
    originalPrice: { currency: "NPR", amountMinor: original },
    salePrice: { currency: "NPR", amountMinor: sale },
    discountPercent: Math.round((1 - sale / original) * 100),
    terms,
    explicitValidityEnd: null,
    discovery: {
      offerType: "BUNDLE",
      qualification: "QUALIFIED",
      ruleVersion: "dashain-price-v2",
      reasons: [
        "CURRENT_2083_EXACT_BUNDLE_SKU",
        "EXPLICIT_OCTOBER_WINDOW_AND_2026_PUBLICATION_METADATA",
        "HOMEPAGE_COVER_PRODUCT_DETAIL_AND_SPECIFICATION_PRICES_AGREE",
        "COLOR_UNSPECIFIED_NO_VARIANT_COUNT_INFLATION",
      ],
      campaign: {
        key,
        title: "MY POWER Dashain Special Offer 2083",
        festivals: ["DASHAIN"],
        seasonAD: 2026,
        seasonBS: "2083",
        publishedAt: null,
        startsAt,
        endsAt,
        originalDateText: `${dateText}; campaign bundle created ${p.created_at}`,
        dateCalendar: "UNKNOWN",
        evidenceUrl: url,
        membership: "EXPLICIT_PRODUCT",
      },
      product: {
        key: String(member.id),
        model: sku,
        variant: `${p.name}; color unspecified`,
        gtin: null,
        attributes: { sku, bundleType: "3-Product Combo" },
      },
      merchant: "MyPower",
      availability: "UNKNOWN",
      lastVerifiedAt: fetchedAt,
      priceObservedAt: fetchedAt,
      components: descriptions.map((description, i) => ({
        description,
        quantity: null,
        unit: null,
        role: i === 0 ? "MAIN_ITEM" : "INCLUDED_ITEM",
      })),
      benefits: [],
      eligibility: { ...UNKNOWN_ELIGIBILITY },
      evidence: [
        {
          url: MYPOWER_ROOT,
          fetchedAt,
          contentHash: createHash("sha256").update(root).digest("hex"),
          excerpt: `Dashain Combo ${number}; SKU ${sku}; MRP NPR ${original / 100}; offer NPR ${sale / 100}; dated cover metadata September 2026`,
          path: "Flight homepage featured_products and matching Dashain cover",
          extractorVersion: "mypower-v1",
          fields: ["campaign", "membership", "product", "originalPrice", "salePrice"],
        },
        {
          url,
          fetchedAt,
          contentHash: createHash("sha256").update(html).digest("hex"),
          excerpt: `${p.name}; SKU ${sku}; ${dateText}; MRP NPR ${original / 100}; offer NPR ${sale / 100}; ${descriptions.join(" + ")}; ${terms}`,
          path: "Flight exact bundle; details and specifications; fixed SKU price; unspecified color",
          extractorVersion: "mypower-v1",
          fields: [
            "campaign",
            "membership",
            "offerType",
            "product",
            "originalPrice",
            "salePrice",
            "components",
            "eligibility",
          ],
        },
      ],
    },
  };
}
export function createMypowerAdapter(
  fetchPage: PageFetcher,
  clock = () => new Date(),
): SourceAdapter {
  return {
    sourceId: "mypower",
    async scan(source) {
      if (source.id !== "mypower" || !source.campaignEntryPoints?.includes(MYPOWER_ROOT))
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const fetchedAt = clock().toISOString(),
          root = await fetchPage(MYPOWER_ROOT, source);
        if (root.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
        const members = mypowerMembers(root.body);
        if (!members) return { ok: false, reason: "STRUCTURE_CHANGED" };
        const offers: CandidateOffer[] = [];
        for (const member of members) {
          const number = BUNDLES.findIndex((id) => id === member.id) + 1;
          const r = await fetchPage(
            `${MYPOWER_ROOT}product/MYPOWER-DASHAIN-COMBO-0${number}-2083`,
            source,
          );
          if (r.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
          const o = extractMypower(root.body, r.body, member, fetchedAt);
          if (o) offers.push(o);
        }
        return offers.length
          ? { ok: true, offers, partial: true }
          : { ok: false, reason: "STRUCTURE_CHANGED" };
      } catch {
        return { ok: false, reason: "NETWORK_ERROR" };
      }
    },
  };
}
