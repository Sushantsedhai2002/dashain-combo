import { createHash } from "node:crypto";
import { load } from "cheerio";
import type { CandidateOffer, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { calendarDate } from "./campaign-date.ts";
const ORIGIN = "https://blog.khalti.com";
// Official homepage links to this blog. Only the first dated trending module is supported.
export function createKhaltiAdapter(fetchPage: PageFetcher): SourceAdapter {
  return Object.freeze({
    sourceId: "khalti",
    async scan(source) {
      if (
        source.id !== "khalti" ||
        !source.channels.some(
          (c) => c.kind === "WEBSITE" && c.isEnabled && new URL(c.url).origin === ORIGIN,
        )
      )
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const listing = await fetchPage(`${ORIGIN}/`, source);
        if (listing.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
        const $ = load(listing.body);
        const cards = $(".et_pb_blog_0 .et_pb_post");
        if (!cards.length || cards.length > 3) return { ok: false, reason: "STRUCTURE_CHANGED" };
        const links = new Map<string, string>();
        for (const element of cards.toArray()) {
          const card = $(element),
            date = calendarDate(card.find(".published").first().text());
          if (!date) continue;
          try {
            const url = new URL(
              card.find(".entry-title a[href]").first().attr("href") ?? "",
              ORIGIN,
            );
            if (
              url.origin === ORIGIN &&
              !url.username &&
              !url.password &&
              !url.search &&
              !url.hash &&
              /^\/(home|featured|offers)\/[a-z0-9-]+\/$/.test(url.pathname)
            )
              links.set(url.href, date);
          } catch {
            /* Untrusted destinations are excluded. */
          }
        }
        const offers: CandidateOffer[] = [];
        for (const [url, published] of links) {
          const response = await fetchPage(url, source);
          if (response.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
          const doc = load(response.body),
            content = doc("article .entry-content").first();
          content.find("script,style,form,.shareaholic-canvas").remove();
          const title = doc("h1.entry-title").first().text().trim().replace(/\s+/g, " ");
          if (
            !content.length ||
            !title ||
            title.length > 300 ||
            calendarDate(doc(".post-meta .published, article > .published").first().text()) !==
              published
          )
            return { ok: false, reason: "STRUCTURE_CHANGED" };
          const text = content.text().replace(/\s+/g, " ").trim();
          if (!/cashback|grand prize|lucky draw/i.test(text)) continue;
          const sections = content
            .find("h2,h3,h4")
            .toArray()
            .filter((e) =>
              /^(?:terms\s*(?:&|and)\s*conditions?|(?:driver|passenger)\s+T&Cs)$/i.test(
                doc(e).text().trim(),
              ),
            );
          const terms =
            sections
              .map((e) => `${doc(e).text().trim()}: ${doc(e).nextUntil("h2,h3,h4").text().trim()}`)
              .join("\n")
              .replace(/\s+/g, " ")
              .trim() || null;
          if (terms !== null && terms.length > 5000)
            return { ok: false, reason: "STRUCTURE_CHANGED" };
          offers.push({
            sourceOfferKey: `khalti:${createHash("sha256").update(new URL(url).pathname).digest("hex")}`,
            title,
            category: "PAYMENTS_AND_FINANCE",
            destinationUrl: url,
            sourcePublishedAt: { kind: "KATHMANDU_DATE", value: published },
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
