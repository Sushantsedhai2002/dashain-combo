import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { DiscoverySchema } from "@dashain-offer/offer-catalog";
import {
  createInfotechsAdapter,
  extractInfotechsCampaign,
  INFOTECHS_CAMPAIGN,
} from "../src/adapters/infotechs.ts";
const html = await readFile(new URL("./fixtures/infotechs-nepal.html", import.meta.url), "utf8");
const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw Error("Invalid registry");
const source = registry.sources.find((s) => s.id === "infotechs-nepal")!;
const now = "2026-10-01T07:00:00Z";
describe("InfoTechs current campaign showcase", () => {
  it("uses campaign-page update and banner dates, exact NPR prices and listed bundles", () => {
    const offers = extractInfotechsCampaign(html, now)!;
    expect(offers).toHaveLength(34);
    expect(offers[0]?.salePrice?.amountMinor).toBe(10999900);
    expect(offers[0]?.originalPrice?.amountMinor).toBe(12900000);
    expect(offers.some((o) => o.discovery?.offerType === "BUNDLE")).toBe(true);
    const combo = offers.find((o) => o.title.startsWith("Gaming Combo |"))!;
    expect(combo.discovery?.components.map((c) => c.description)).toEqual([
      "Redragon H120 Headset",
      "LOK AI R-290 Keyboard",
      "Razer DeathAdder Essential",
      "P001 Mousepad",
      "FN-818 Cooler",
    ]);
    for (const offer of offers)
      expect(DiscoverySchema.safeParse(offer.discovery).success).toBe(true);
  });
  it("fails closed when either campaign date proof disappears or price evidence conflicts", () => {
    for (const changed of [
      "",
      html.replaceAll("/2026/09/dashain.jpg", "/2025/09/dashain.jpg"),
      html.replaceAll("og:updated_time", "unknown_time"),
      html.replaceAll("2026-09-30T06:38:20+00:00", "2027-09-30T06:38:20+00:00"),
      html.replaceAll(
        'href="https://infotechsnepal.com.np/product/',
        'href="https://attacker.test/product/',
      ),
      html.replace("109,999.00", "129,000.00"),
    ])
      expect(extractInfotechsCampaign(changed, now)).toBeNull();
    expect(extractInfotechsCampaign(html, "2027-10-01T07:00:00Z")).toBeNull();
  });
  it("follows the three dated campaign collections and deduplicates 124 price pairs", async () => {
    const pages = JSON.parse(
      await readFile(new URL("./fixtures/pages.json", import.meta.url), "utf8"),
    );
    const seen: string[] = [];
    const result = await createInfotechsAdapter(
      async (url) => {
        seen.push(url);
        return {
          status: 200,
          body: await readFile(new URL(`./fixtures/${pages[url]}`, import.meta.url), "utf8"),
        };
      },
      () => new Date(now),
    ).scan(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offers).toHaveLength(124);
    expect(seen).toHaveLength(9);
    expect(new Set(result.offers.map((o) => o.sourceOfferKey)).size).toBe(124);
    expect(
      result.offers.some((o) => o.discovery?.campaign?.membership === "ELIGIBLE_CATEGORY"),
    ).toBe(true);
    for (const offer of result.offers)
      expect(DiscoverySchema.safeParse(offer.discovery).success).toBe(true);
    const collection = await readFile(
      new URL("./fixtures/infotechs-laptop-delas-1.html", import.meta.url),
      "utf8",
    );
    expect(
      extractInfotechsCampaign(collection, now, {
        campaignHtml: html,
        url: "https://attacker.test/offers/laptop-delas/",
      }),
    ).toBeNull();
    expect(
      extractInfotechsCampaign(collection, now, {
        campaignHtml: html.replaceAll("More Offers", "Other products"),
        url: "https://infotechsnepal.com.np/offers/laptop-delas/",
      }),
    ).toBeNull();
  });
  it("does not confirm removal based on a partial showcase and retries failed scans", async () => {
    expect(
      await createInfotechsAdapter(
        async () => ({ status: 200, body: html }),
        () => new Date(now),
      ).scan({ ...source, campaignEntryPoints: [INFOTECHS_CAMPAIGN] }),
    ).toMatchObject({ ok: true, partial: true });
    expect(
      await createInfotechsAdapter(async () => ({ status: 503, body: "" })).scan(source),
    ).toEqual({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createInfotechsAdapter(async () => ({ status: 200, body: "" })).scan(source),
    ).toEqual({ ok: false, reason: "STRUCTURE_CHANGED" });
    expect(
      await createInfotechsAdapter(async () => {
        throw Error("timeout");
      }).scan(source),
    ).toEqual({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createInfotechsAdapter(async () => ({ status: 200, body: html })).scan({
        ...source,
        campaignEntryPoints: [],
      }),
    ).toEqual({ ok: false, reason: "UNSUPPORTED_SOURCE" });
  });
});
