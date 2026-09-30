import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
const ORIGIN = "https://fonepay.com";
import { calendarDate } from "./campaign-date.ts";
function approvedArticle(raw: string | undefined): string | null {
  try {
    const url = new URL(raw ?? "", ORIGIN);
    return url.origin === ORIGIN &&
      !url.username &&
      !url.password &&
      !url.search &&
      !url.hash &&
      /^\/blogs\/[a-z0-9-]+$/i.test(url.pathname)
      ? url.href
      : null;
  } catch {
    return null;
  }
}
// Only dated campaign links in the recorded first blog page are collected.
export function createFonepayAdapter(fetchPage: PageFetcher): SourceAdapter {
  return Object.freeze({
    sourceId: "fonepay",
    async scan(source) {
      if (
        source.id !== "fonepay" ||
        !source.channels.some(
          (c) => c.kind === "WEBSITE" && c.isEnabled && new URL(c.url).origin === ORIGIN,
        )
      )
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const listing = await fetchPage(`${ORIGIN}/blogs`, source);
        if (listing.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
        const $ = load(listing.body);
        const cards = $(".blog-item");
        if (!cards.length) return { ok: false, reason: "STRUCTURE_CHANGED" };
        const links = new Map<string, string>();
        for (const element of cards.toArray()) {
          const card = $(element),
            link = card.find("h3 a[href]").first();
          if (!/cashback|discount|\boffer\b|\bdeals?\b/i.test(link.text())) continue;
          const url = approvedArticle(link.attr("href")),
            date = calendarDate(card.find(".date, .blog-post-meta .category.two").first().text());
          if (url && date) links.set(url, date);
        }
        if (links.size > 8) return { ok: false, reason: "STRUCTURE_CHANGED" };
        const offers: CandidateOffer[] = [];
        for (const [url, published] of links) {
          const detail = await fetchPage(url, source);
          if (detail.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
          const doc = load(detail.body),
            content = doc(".blog-content-area").first();
          content.find("script,style,form").remove();
          const title = content.find("h1").first().text().trim().replace(/\s+/g, " ");
          if (!content.length || !title || title.length > 300)
            return { ok: false, reason: "STRUCTURE_CHANGED" };
          const text = content.text().replace(/\s+/g, " ").trim();
          if (!/cashback|discount|promo code/i.test(text)) continue;
          const endMatches = [
            ...text.matchAll(
              /(?:runs through|available until|campaign runs from [A-Za-z]+ \d{1,2},? \d{4} to)\s+([A-Za-z]+\s+\d{1,2},?\s+\d{4}|\d{1,2}\s+[A-Za-z]+\s+\d{4})/gi,
            ),
          ];
          const ends = [...new Set(endMatches.map((m) => calendarDate(m[1] ?? "")))];
          if (ends.includes(null) || ends.length > 1)
            return { ok: false, reason: "STRUCTURE_CHANGED" };
          const end = ends[0] ?? null;
          if (end !== null && end < published) return { ok: false, reason: "STRUCTURE_CHANGED" };
          const heading = content
            .find("h2,h3,h4")
            .filter((_, e) => /^terms\s*(?:&|and)\s*conditions$/i.test(doc(e).text().trim()))
            .first();
          const terms = heading.nextUntil("h2,h3,h4").text().replace(/\s+/g, " ").trim() || null;
          if (terms !== null && terms.length > 5000)
            return { ok: false, reason: "STRUCTURE_CHANGED" };
          offers.push({
            sourceOfferKey: `fonepay:${createHash("sha256").update(new URL(url).pathname).digest("hex")}`,
            title,
            category: "PAYMENTS_AND_FINANCE",
            destinationUrl: url,
            sourcePublishedAt: { kind: "KATHMANDU_DATE", value: published },
            explicitValidityEnd: end ? { kind: "KATHMANDU_DATE", value: end } : null,
            summary: content.find("p").first().text().trim().slice(0, 2000) || null,
            terms,
          });
        }
        return { ok: true, offers: Object.freeze(offers) };
      } catch {
        return { ok: false, reason: "NETWORK_ERROR" };
      }
    },
  });
}
