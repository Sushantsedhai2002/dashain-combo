import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { DiscoverySchema } from "@dashain-offer/offer-catalog";
import {
  createCgDigitalAdapter,
  extractLgCampaign,
  LG_CAMPAIGN_URL,
} from "../src/adapters/cg-digital.ts";
const html = await readFile(new URL("./fixtures/cg-digital.html", import.meta.url), "utf8");
const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw new Error("Invalid registry");
const source = registry.sources.find((entry) => entry.id === "cg-digital")!;
const now = "2026-10-01T07:00:00Z";
describe("CG Digital campaign evidence", () => {
  it("extracts current table members and restricts gifts to explicit machine types", () => {
    const offers = extractLgCampaign(html, now)!;
    expect(offers).toHaveLength(19);
    const front = offers.find((o) => o.sourceOfferKey.endsWith(":FX1450S5B.APBP"))!;
    expect(front.salePrice?.amountMinor).toBe(10779000);
    expect(front.discovery?.components.at(-1)).toMatchObject({
      quantity: 6,
      unit: "kg",
      role: "GIFT",
    });
    expect(
      offers.find((o) => o.sourceOfferKey.endsWith(":T2107VSAGP"))?.discovery?.components.at(-1)
        ?.quantity,
    ).toBe(4);
    expect(
      offers.find((o) => o.sourceOfferKey.endsWith(":TT101R3S"))?.discovery?.components.at(-1)
        ?.quantity,
    ).toBe(2);
    expect(
      offers.find((o) => o.sourceOfferKey.endsWith(":FV1411H2B.APBP"))?.discovery?.benefits,
    ).toEqual([]);
    for (const offer of offers) {
      expect(DiscoverySchema.safeParse(offer.discovery).success).toBe(true);
      expect(offer.discovery?.campaign?.endsAt).toBeNull();
      expect(offer.discountPercent).toBeLessThan(25);
    }
    expect(extractLgCampaign(html, "2026-10-02T07:00:00Z")?.map((o) => o.sourceOfferKey)).toEqual(
      offers.map((o) => o.sourceOfferKey),
    );
  });
  it("rejects stale seasons, missing tables, conflicting prices and outside-origin links", () => {
    expect(extractLgCampaign(html.replaceAll("2083", "2082"), now)).toBeNull();
    expect(extractLgCampaign("<h1>LG Dashain Tihar 2083</h1>", now)).toBeNull();
    expect(
      extractLgCampaign(html.replace('"price": "107790"', '"price": "1"'), now)?.some((o) =>
        o.sourceOfferKey.endsWith(":FX1450S5B.APBP"),
      ),
    ).toBe(false);
    expect(
      extractLgCampaign(
        html.replaceAll(
          "https://cgdigital.com.np/api/product-",
          "https://attacker.test/api/product-",
        ),
        now,
      ),
    ).toEqual([]);
  });
  it("does not retain a removed benefit just because the campaign is HTTP 200", () => {
    const changed = html.replaceAll(
      "6 Kg Surf Excel detergent pack free",
      "Gift no longer offered",
    );
    expect(
      extractLgCampaign(changed, now)?.find((o) => o.sourceOfferKey.endsWith(":FX1450S5B.APBP"))
        ?.discovery?.benefits,
    ).toEqual([]);
  });
  it("uses the approved entry point, and fails closed on blocked or changed sources", async () => {
    expect(
      await createCgDigitalAdapter(
        async (url) => {
          expect(url).toBe(LG_CAMPAIGN_URL);
          return { status: 200, body: html };
        },
        () => new Date(now),
      ).scan(source),
    ).toMatchObject({ ok: true, authoritative: true });
    expect(
      await createCgDigitalAdapter(async () => {
        throw new Error("timeout");
      }).scan(source),
    ).toEqual({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createCgDigitalAdapter(async () => ({ status: 503, body: "" })).scan(source),
    ).toEqual({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createCgDigitalAdapter(async () => ({ status: 200, body: "" })).scan(source),
    ).toEqual({ ok: false, reason: "STRUCTURE_CHANGED" });
    expect(
      await createCgDigitalAdapter(async () => ({ status: 200, body: html })).scan({
        ...source,
        campaignEntryPoints: [],
      }),
    ).toEqual({ ok: false, reason: "UNSUPPORTED_SOURCE" });
  });
});
