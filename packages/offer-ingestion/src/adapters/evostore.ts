import { createHash } from "node:crypto";

import { load } from "cheerio";

import type { SourceDefinition } from "@dashain-offer/source-registry";
import type { CandidateOffer, ScanResult, SourceAdapter } from "../runner.ts";
import { inferProductDetails, parseNprPrice } from "./product-details.ts";

const ORIGIN = "https://evostore.com.np";
const LISTING_URL = `${ORIGIN}/special-offers`;
const MAX_PAGES = 20;

export type PageFetcher = (
  url: string,
  source: SourceDefinition,
) => Promise<Readonly<{ status: number; body: string }>>;

function productUrl(href: string | undefined): string | null {
  if (href === undefined) return null;
  try {
    const url = new URL(href, ORIGIN);
    const backlinkPage = Number(url.searchParams.get("page"));
    if (
      url.origin !== ORIGIN ||
      url.username !== "" ||
      url.password !== "" ||
      (url.search !== "" &&
        (url.searchParams.size !== 1 ||
          !Number.isInteger(backlinkPage) ||
          backlinkPage < 1 ||
          backlinkPage > MAX_PAGES)) ||
      url.pathname === "/" ||
      url.pathname === "/special-offers"
    ) {
      return null;
    }
    return `${ORIGIN}${url.pathname.replace(/\/+$/, "")}`;
  } catch {
    return null;
  }
}

function imageUrl(src: string | undefined): string | null {
  if (src === undefined) return null;
  try {
    const url = new URL(src, ORIGIN);
    return url.origin === ORIGIN && url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

function parsePage(html: string): readonly CandidateOffer[] | null {
  const $ = load(html);
  const cards = $(".products-list-container .common-item.grey-white");
  if (cards.length === 0) return null;

  const offers: CandidateOffer[] = [];
  cards.each((_index, element) => {
    const card = $(element);
    const destinationUrl = productUrl(card.children("a[href]").first().attr("href"));
    const title = card.find(".name p").first().text().trim().replace(/\s+/g, " ");
    const priceElement = card.find(".price p").first();
    const originalText = priceElement.find("s").first().text().trim();
    const saleText = priceElement.clone().find("s").remove().end().text().trim();
    const originalMinor = parseNprPrice(originalText);
    const saleMinor = parseNprPrice(saleText);
    if (
      destinationUrl === null ||
      title.length === 0 ||
      title.length > 300 ||
      originalMinor === null ||
      saleMinor === null ||
      originalMinor <= saleMinor ||
      originalMinor === 0
    ) {
      return;
    }
    const discountPercent = Math.round(((originalMinor - saleMinor) / originalMinor) * 100);
    offers.push({
      sourceOfferKey: `evostore:${createHash("sha256").update(new URL(destinationUrl).pathname).digest("hex")}`,
      title,
      productName: title,
      ...inferProductDetails(title),
      destinationUrl,
      imageUrl: imageUrl(card.find(".img-container img").first().attr("src")),
      originalPrice: { currency: "NPR", amountMinor: originalMinor },
      salePrice: { currency: "NPR", amountMinor: saleMinor },
      discountPercent,
    });
  });

  return offers;
}

export function createEvoStoreAdapter(fetchPage: PageFetcher): SourceAdapter {
  return Object.freeze({
    sourceId: "evostore",
    async scan(source: SourceDefinition): Promise<ScanResult> {
      if (
        source.id !== "evostore" ||
        !source.channels.some(
          (channel) =>
            channel.kind === "WEBSITE" &&
            channel.isEnabled &&
            new URL(channel.url).origin === ORIGIN,
        )
      ) {
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      }

      let response: Readonly<{ status: number; body: string }>;
      try {
        response = await fetchPage(LISTING_URL, source);
      } catch {
        return { ok: false, reason: "NETWORK_ERROR" };
      }
      if (response.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
      const offers = parsePage(response.body);
      if (offers === null) return { ok: false, reason: "STRUCTURE_CHANGED" };
      return { ok: true, offers: Object.freeze(offers) };
    },
  });
}
