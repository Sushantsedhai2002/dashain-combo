import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { inferProductDetails, parseNprPrice } from "./product-details.ts";
const ORIGIN = "https://www.olizstore.com";
const STORE_ID = "682feff88c633f25b4c7ce32";
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function products(data: unknown): readonly unknown[] | null {
  if (
    !isRecord(data) ||
    !isRecord(data.props) ||
    !isRecord(data.props.pageProps) ||
    !isRecord(data.props.pageProps.response)
  )
    return null;
  return Array.isArray(data.props.pageProps.response.products)
    ? data.props.pageProps.response.products
    : null;
}
function image(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.origin === "https://cdn2.blanxer.com" &&
      !url.username &&
      !url.password &&
      (url.pathname.startsWith(`/uploads/${STORE_ID}/`) || url.pathname.startsWith(`/${STORE_ID}/`))
      ? url.href
      : null;
  } catch {
    return null;
  }
}
// Observed __NEXT_DATA__ product schema; JSON only, without executing scripts.
export function createOlizAdapter(fetchPage: PageFetcher): SourceAdapter {
  return Object.freeze({
    sourceId: "oliz-store",
    async scan(source) {
      if (
        source.id !== "oliz-store" ||
        !source.channels.some(
          (c) => c.kind === "WEBSITE" && c.isEnabled && new URL(c.url).origin === ORIGIN,
        )
      )
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      let response;
      try {
        response = await fetchPage(`${ORIGIN}/`, source);
      } catch {
        return { ok: false, reason: "NETWORK_ERROR" };
      }
      if (response.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
      let data: unknown;
      try {
        data = JSON.parse(load(response.body)("script#__NEXT_DATA__").text());
      } catch {
        return { ok: false, reason: "STRUCTURE_CHANGED" };
      }
      const items = products(data);
      if (items === null) return { ok: false, reason: "STRUCTURE_CHANGED" };
      const seen = new Set<string>();
      const offers: CandidateOffer[] = [];
      for (const p of items) {
        if (
          !isRecord(p) ||
          typeof p._id !== "string" ||
          !/^[a-f0-9]{24}$/.test(p._id) ||
          typeof p.name !== "string" ||
          !p.name.trim() ||
          p.name.length > 300 ||
          typeof p.slug !== "string" ||
          !/^[a-z0-9()]+(?:-+[a-z0-9()]+)*$/.test(p.slug) ||
          p.slug.length > 300 ||
          typeof p.price !== "number" ||
          p.price <= 0 ||
          typeof p.compare_at_price !== "number" ||
          p.status !== "Active" ||
          p.in_stock !== true ||
          p.has_variants !== false ||
          p.min_price !== null ||
          p.max_price !== null
        )
          continue;
        const original = parseNprPrice(`NPR ${p.compare_at_price}`),
          sale = parseNprPrice(`NPR ${p.price}`);
        if (original === null || sale === null || original <= sale || seen.has(p._id)) continue;
        seen.add(p._id);
        const title = p.name.trim().replace(/\s+/g, " ");
        offers.push({
          sourceOfferKey: `oliz-store:${createHash("sha256").update(p._id).digest("hex")}`,
          title,
          productName: title.length <= 200 ? title : null,
          ...inferProductDetails(title),
          destinationUrl: `${ORIGIN}/product/${p.slug}`,
          imageUrl: image(
            Array.isArray(p.image_urls) && typeof p.image_urls[0] === "string"
              ? p.image_urls[0]
              : undefined,
          ),
          originalPrice: { currency: "NPR", amountMinor: original },
          salePrice: { currency: "NPR", amountMinor: sale },
          discountPercent: Math.round(((original - sale) / original) * 100),
        });
      }
      return { ok: true, offers: Object.freeze(offers) };
    },
  });
}
