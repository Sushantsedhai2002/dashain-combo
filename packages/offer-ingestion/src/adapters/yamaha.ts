import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { calendarDate } from "./campaign-date.ts";
const ORIGIN = "https://www.maw2wheelers.com";
// Dated promotional news cards; undated navigation banners are excluded.
export function createYamahaAdapter(fetchPage: PageFetcher): SourceAdapter {
  return Object.freeze({
    sourceId: "yamaha-nepal",
    async scan(source) {
      if (
        source.id !== "yamaha-nepal" ||
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
      const $ = load(response.body),
        cards = $(".ym_home_blogs.post-card");
      if (!cards.length) return { ok: false, reason: "STRUCTURE_CHANGED" };
      const offers: CandidateOffer[] = [];
      const seen = new Set<string>();
      for (const element of cards.toArray()) {
        const card = $(element),
          link = card.find("h5 a[href]").first();
        const title = link.text().trim().replace(/\s+/g, " ");
        const summaryElement = card.find(".fusion-content-tb").first().clone();
        summaryElement.find("a,script,style").remove();
        const summary = summaryElement.text().trim().replace(/\s+/g, " ");
        if (
          !/(?:festive|Dashain|Tihar|offer)/i.test(summary) ||
          !/(?:win|prize|discount|cashback)/i.test(summary) ||
          !title ||
          title.length > 300
        )
          continue;
        const published = calendarDate(card.find(".fusion-text p").first().text());
        if (!published) continue;
        let url;
        try {
          url = new URL(link.attr("href") ?? "", ORIGIN);
        } catch {
          continue;
        }
        if (
          url.origin !== ORIGIN ||
          url.username ||
          url.password ||
          url.search ||
          url.hash ||
          !/^\/[a-z0-9-]+\/$/.test(url.pathname) ||
          seen.has(url.href)
        )
          continue;
        seen.add(url.href);
        const img =
          card.find("img").first().attr("data-orig-src") ?? card.find("img").first().attr("src");
        let imageUrl: string | null = null;
        if (img) {
          try {
            const image = new URL(img, ORIGIN);
            if (image.origin === ORIGIN && !image.username && !image.password)
              imageUrl = image.href;
          } catch {
            /* Missing image does not invalidate dated text evidence. */
          }
        }
        offers.push({
          sourceOfferKey: `yamaha-nepal:${createHash("sha256").update(url.pathname).digest("hex")}`,
          title,
          summary: summary.slice(0, 2000),
          category: "AUTOMOTIVE",
          brandName: "Yamaha",
          destinationUrl: url.href,
          imageUrl,
          sourcePublishedAt: { kind: "KATHMANDU_DATE", value: published },
        });
      }
      return { ok: true, offers: Object.freeze(offers) };
    },
  });
}
