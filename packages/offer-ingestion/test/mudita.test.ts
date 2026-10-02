import { load } from "cheerio";
import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { DiscoverySchema } from "@dashain-offer/offer-catalog";
import { createMuditaAdapter, extractMuditaCampaign } from "../src/adapters/mudita.ts";
const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw Error("Invalid registry");
const source = registry.sources.find((s) => s.id === "mudita-store")!;
const now = "2026-10-01T07:00:00Z",
  html = await readFile(new URL("./fixtures/mudita-campaign.html", import.meta.url), "utf8");
describe("Mudita dated Dashain product section", () => {
  it("deduplicates 233 exact product identities and excludes recommendations and separate deadlines", () => {
    const offers = extractMuditaCampaign(html, now)!;
    expect(offers).toHaveLength(233);
    expect(offers.every((offer) => offer.imageUrl?.startsWith("https://mudita.com.np/"))).toBe(
      true,
    );
    expect(new Set(offers.map((o) => o.sourceOfferKey)).size).toBe(233);
    for (const o of offers) expect(DiscoverySchema.safeParse(o.discovery).success).toBe(true);
    expect(offers.some((o) => o.title.startsWith("AMD Ryzen 7 5700X Tray"))).toBe(false);
    expect(offers.every((o) => o.explicitValidityEnd?.value === "2026-10-17T00:00:00.000Z")).toBe(
      true,
    );
    const longTitle = offers[0]!.title + " | " + "Explicit documented warranty detail ".repeat(10);
    const changed = load(html);
    changed(".product-item-name .product-item-link")
      .filter((_i, e) => changed(e).attr("href") === offers[0]!.destinationUrl)
      .text(longTitle)
      .attr("title", longTitle);
    const long = extractMuditaCampaign(changed.html(), now)!.find(
      (o) => o.destinationUrl === offers[0]!.destinationUrl,
    )!;
    expect(long.title.length).toBeLessThanOrEqual(300);
    expect(long.discovery?.product?.variant).toBe(longTitle.trim());
  });
  it("rejects stale dates, missing explicit section, unsafe links and conflicting structured prices", () => {
    for (const changed of [
      "",
      html.replaceAll("2026-10-17T00:00:00+00:00", "2025-10-17T00:00:00+00:00"),
      html.replaceAll("Dashain Deals", "Other Deals"),
      html.replaceAll(
        'href="https://mudita.com.np/acer-aspire-lite-15-core-3-n350-price-nepal.html"',
        'href="https://attacker.test/acer-aspire-lite-15-core-3-n350-price-nepal.html"',
      ),
      html.replaceAll('data-price-amount="68999"', 'data-price-amount="1"'),
      html.replaceAll("data-mage-init=", "invalid-config="),
    ])
      expect(extractMuditaCampaign(changed, now)).toBeNull();
    expect(extractMuditaCampaign(html, "2027-10-01T07:00:00Z")).toBeNull();
    expect(extractMuditaCampaign(html, "2026-10-17T00:00:00Z")).toBeNull();
  });
  it("does not withdraw based on a subset and suppresses failed or unsupported scans", async () => {
    expect(
      await createMuditaAdapter(
        async () => ({ status: 200, body: html }),
        () => new Date(now),
      ).scan(source),
    ).toMatchObject({ ok: true, partial: true });
    expect(await createMuditaAdapter(async () => ({ status: 503, body: "" })).scan(source)).toEqual(
      { ok: false, reason: "NETWORK_ERROR" },
    );
    expect(await createMuditaAdapter(async () => ({ status: 200, body: "" })).scan(source)).toEqual(
      { ok: false, reason: "STRUCTURE_CHANGED" },
    );
    expect(
      await createMuditaAdapter(async () => {
        throw Error("timeout");
      }).scan(source),
    ).toEqual({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createMuditaAdapter(async () => ({ status: 200, body: html })).scan({
        ...source,
        campaignEntryPoints: [],
      }),
    ).toEqual({ ok: false, reason: "UNSUPPORTED_SOURCE" });
  });
});
