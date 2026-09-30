import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { inferProductDetails, parseNprPrice } from "./product-details.ts";

const ORIGIN = "https://www.daraz.com.np";
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function flashSaleItems(html: string): readonly unknown[] | null {
  const $ = load(html);
  for (const element of $("script").toArray()) {
    // Parse the observed single-line JSON assignment, never the surrounding JavaScript.
    const match = /(?:^|\n)window\.__FIRST_SCREEN_DATA=(\{[^\n]*\});(?:\r?\n|$)/.exec(
      $(element).text(),
    );
    if (!match?.[1]) continue;
    let screen: unknown;
    try {
      screen = JSON.parse(match[1]);
    } catch {
      return null;
    }
    if (!isRecord(screen) || !Array.isArray(screen.modules) || !isRecord(screen.data)) return null;
    const items: unknown[] = [];
    let found = false;
    for (const module of screen.modules) {
      if (
        !isRecord(module) ||
        module.name !== "lzdrwb-homepage-react" ||
        module.hidden !== "false" ||
        typeof module.uuid !== "string"
      )
        continue;
      const data = screen.data[module.uuid];
      if (
        !isRecord(data) ||
        !isRecord(data.pcHomepageData) ||
        !Array.isArray(data.pcHomepageData.sections)
      )
        continue;
      for (const section of data.pcHomepageData.sections) {
        if (
          !isRecord(section) ||
          section.moduleId !== "flashSalePC" ||
          !isRecord(section.fields) ||
          !Array.isArray(section.fields.datas)
        )
          continue;
        for (const listing of section.fields.datas) {
          if (!isRecord(listing) || !Array.isArray(listing.items)) return null;
          found = true;
          items.push(...listing.items);
        }
      }
    }
    return found ? items : null;
  }
  return null;
}

function productUrl(raw: string, itemId: number): { url: string; sku: string } | null {
  try {
    const url = new URL(raw, ORIGIN);
    const identity = /^\/products\/[^/]+-i(\d+)-s(\d+)\.html$/.exec(url.pathname);
    if (
      url.origin !== ORIGIN ||
      url.username ||
      url.password ||
      !identity ||
      identity[1] !== String(itemId) ||
      !identity[2]
    )
      return null;
    url.search = "";
    url.hash = "";
    return { url: url.href, sku: identity[2] };
  } catch {
    return null;
  }
}
function imageUrl(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  try {
    const url = new URL(raw, ORIGIN);
    return url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      ["np-live-21.slatic.net", "img.lazcdn.com"].includes(url.hostname) &&
      !url.port
      ? url.href
      : null;
  } catch {
    return null;
  }
}

export function createDarazAdapter(fetchPage: PageFetcher): SourceAdapter {
  return Object.freeze({
    sourceId: "daraz-nepal",
    async scan(source) {
      if (
        source.id !== "daraz-nepal" ||
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
      const items = flashSaleItems(response.body);
      if (items === null) return { ok: false, reason: "STRUCTURE_CHANGED" };
      const offers: CandidateOffer[] = [];
      const seen = new Set<string>();
      for (const item of items) {
        if (
          !isRecord(item) ||
          typeof item.itemTitle !== "string" ||
          typeof item.itemId !== "number" ||
          !Number.isSafeInteger(item.itemId) ||
          item.itemId <= 0 ||
          typeof item.itemUrl !== "string" ||
          item.itemHaveStock !== 1 ||
          item.currency !== "Rs." ||
          typeof item.itemPrice !== "string" ||
          typeof item.itemDiscountPrice !== "string"
        )
          continue;
        const title = item.itemTitle.trim().replace(/\s+/g, " ");
        const destination = productUrl(item.itemUrl, item.itemId);
        const original = parseNprPrice(`Rs. ${item.itemPrice}`);
        const sale = parseNprPrice(`Rs. ${item.itemDiscountPrice}`);
        if (
          !destination ||
          !title ||
          title.length > 300 ||
          original === null ||
          sale === null ||
          sale <= 0 ||
          original <= sale
        )
          continue;
        const identity = `${item.itemId}:${destination.sku}`;
        if (seen.has(identity)) continue;
        seen.add(identity);
        offers.push({
          sourceOfferKey: `daraz-nepal:${createHash("sha256").update(identity).digest("hex")}`,
          title,
          productName: title.length <= 200 ? title : null,
          ...inferProductDetails(title, "GENERAL_RETAIL"),
          destinationUrl: destination.url,
          imageUrl: imageUrl(item.itemImg),
          originalPrice: { currency: "NPR", amountMinor: original },
          salePrice: { currency: "NPR", amountMinor: sale },
          discountPercent: Math.round(((original - sale) / original) * 100),
        });
      }
      return { ok: true, offers: Object.freeze(offers) };
    },
  });
}
