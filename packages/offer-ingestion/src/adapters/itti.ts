import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { inferProductDetails, parseNprPrice } from "./product-details.ts";

const ORIGIN = "https://itti.com.np";
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// Decode only JSON arguments of the observed Flight push syntax; never execute site scripts.
// Records may span multiple script chunks. Only the named homepage query is consumed.
function homeData(html: string): Record<string, unknown> | null {
  const $ = load(html);
  let flight = "";
  for (const element of $("script").toArray()) {
    const match = /^self\.__next_f\.push\((\[.*\])\);?$/s.exec($(element).text().trim());
    if (!match?.[1]) continue;
    try {
      const chunk: unknown = JSON.parse(match[1]);
      if (Array.isArray(chunk) && chunk[0] === 1 && typeof chunk[1] === "string")
        flight += chunk[1];
    } catch {
      return null;
    }
  }
  for (const line of flight.split("\n")) {
    if (!/^[a-f0-9]+:\[/i.test(line)) continue;
    try {
      const record: unknown = JSON.parse(line.slice(line.indexOf(":") + 1));
      if (!Array.isArray(record) || !isRecord(record[3]) || !isRecord(record[3].state)) continue;
      const queries = record[3].state.queries;
      if (!Array.isArray(queries)) continue;
      for (const query of queries) {
        if (
          isRecord(query) &&
          Array.isArray(query.queryKey) &&
          query.queryKey.length === 1 &&
          query.queryKey[0] === "get-all-home-data" &&
          isRecord(query.state) &&
          isRecord(query.state.data)
        )
          return query.state.data;
      }
    } catch {
      // Flight also contains non-JSON records; these are outside this extraction contract.
      continue;
    }
  }
  return null;
}

function productImage(product: Record<string, unknown>): string | null {
  if (!isRecord(product.image) || typeof product.image.image !== "string") return null;
  try {
    const url = new URL(product.image.image);
    return url.origin === "https://admin.itti.com.np" &&
      url.pathname.startsWith("/storage/") &&
      !url.username &&
      !url.password
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function createIttiAdapter(fetchPage: PageFetcher): SourceAdapter {
  return Object.freeze({
    sourceId: "itti",
    async scan(source) {
      if (
        source.id !== "itti" ||
        !source.channels.some(
          (channel) =>
            channel.kind === "WEBSITE" &&
            channel.isEnabled &&
            new URL(channel.url).origin === ORIGIN,
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
      const home = homeData(response.body);
      if (home === null) return { ok: false, reason: "STRUCTURE_CHANGED" };
      const sections = [
        ...(Array.isArray(home.mobile_category) ? home.mobile_category : []),
        home.clearance,
        home.deal_of_month,
        home.best_seller,
        home.under_ru,
        home.trending_tech,
        home.featured,
        home.ai_picks,
        home.category,
      ]
        .filter(isRecord)
        .filter((section) => Array.isArray(section.data));
      if (sections.length === 0) return { ok: false, reason: "STRUCTURE_CHANGED" };
      const offers: CandidateOffer[] = [];
      const seen = new Set<string>();
      for (const section of sections) {
        if (!Array.isArray(section.data)) continue;
        for (const product of section.data) {
          if (
            !isRecord(product) ||
            !isRecord(product.price) ||
            typeof product.name !== "string" ||
            typeof product.slug !== "string" ||
            !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug) ||
            product.slug.length > 300 ||
            product.price.in_stock !== true ||
            product.coming_soon !== 0 ||
            typeof product.price.mark_price !== "number" ||
            typeof product.price.selling_price !== "number"
          )
            continue;
          const title = product.name.trim().replace(/\s+/g, " ");
          const original = parseNprPrice(`NPR ${product.price.mark_price}`);
          const sale = parseNprPrice(`NPR ${product.price.selling_price}`);
          if (
            !title ||
            title.length > 300 ||
            original === null ||
            sale === null ||
            sale <= 0 ||
            original <= sale ||
            seen.has(product.slug)
          )
            continue;
          seen.add(product.slug);
          const destinationUrl = `${ORIGIN}/product/${product.slug}`;
          const productName =
            typeof product.short_name === "string" ? product.short_name.trim() : title;
          offers.push({
            sourceOfferKey: `itti:${createHash("sha256").update(new URL(destinationUrl).pathname).digest("hex")}`,
            title,
            productName: productName && productName.length <= 200 ? productName : null,
            ...inferProductDetails(title, "COMPUTERS_AND_ACCESSORIES"),
            destinationUrl,
            imageUrl: productImage(product),
            originalPrice: { currency: "NPR", amountMinor: original },
            salePrice: { currency: "NPR", amountMinor: sale },
            discountPercent: Math.round(((original - sale) / original) * 100),
          });
        }
      }
      return { ok: true, offers: Object.freeze(offers) };
    },
  });
}
