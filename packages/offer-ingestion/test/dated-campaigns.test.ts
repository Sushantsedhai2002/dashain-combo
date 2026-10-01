import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { DiscoverySchema } from "@dashain-offer/offer-catalog";
import { createItMonsterAdapter, extractItMonsterCampaign } from "../src/adapters/it-monster.ts";
import {
  createDatedCampaignAdapter,
  DATED_CAMPAIGNS,
  MAXELL_COLLECTION,
  extractDatedCampaign,
} from "../src/adapters/dated-campaigns.ts";
const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw new Error("Invalid registry");
const now = "2026-10-01T07:00:00Z";
const monster = await readFile(new URL("./fixtures/it-monster.html", import.meta.url), "utf8");
describe("dated seller campaign collectors", () => {
  it("extracts IT Monster product badges with visible and structured prices agreeing", () => {
    const offers = extractItMonsterCampaign(monster, now)!;
    expect(offers).toHaveLength(24);
    expect(new Set(offers.map((o) => o.destinationUrl)).size).toBe(24);
    for (const o of offers) expect(DiscoverySchema.safeParse(o.discovery).success).toBe(true);
    expect(extractItMonsterCampaign(monster, "2027-10-01T00:00:00Z")).toBeNull();
    expect(
      extractItMonsterCampaign(monster.replaceAll("DASHAIN", "Ordinary Sale"), now),
    ).toBeNull();
    expect(
      extractItMonsterCampaign(monster.replaceAll("Dashain Deals", "General Deals"), now),
    ).toBeNull();
    expect(
      extractItMonsterCampaign(
        monster.replaceAll('href="/product/', 'href="https://attacker.test/product/'),
        now,
      ),
    ).toBeNull();
    expect(extractItMonsterCampaign("<h2>Dashain Deals</h2>", now)).toBeNull();
  });
  for (const profile of DATED_CAMPAIGNS) {
    it(`extracts ${profile.id} current members and rejects missing campaign evidence`, async () => {
      const html = await readFile(
        new URL(`./fixtures/${profile.id}.html`, import.meta.url),
        "utf8",
      );
      const offers = extractDatedCampaign(profile, html, now)!;
      expect(offers).toHaveLength(profile.id === "maxell" ? 10 : 8);
      for (const o of offers) expect(DiscoverySchema.safeParse(o.discovery).success).toBe(true);
      if (profile.id === "proud-nepal")
        expect(offers.find((o) => o.title.includes("801"))?.salePrice?.amountMinor).toBe(150000);
      else
        expect(offers.find((o) => o.title.includes("A514-54H"))?.salePrice?.amountMinor).toBe(
          12199900,
        );
      expect(extractDatedCampaign(profile, html, "2027-10-01T00:00:00Z")).toBeNull();
      expect(
        extractDatedCampaign(
          profile,
          html.replaceAll('href="/product', 'href="https://attacker.test/product'),
          now,
        ),
      ).toBeNull();
      expect(
        extractDatedCampaign(profile, html.replaceAll("dashain-tihar", "ordinary-sale"), now),
      ).toBeNull();
      expect(extractDatedCampaign(profile, "", now)).toBeNull();
    });
  }
  it("collects the complete 94-member Maxell category with 84 exact discounted price pairs", async () => {
    const source = registry.sources.find((s) => s.id === "maxell")!;
    const mapping = JSON.parse(
      await readFile(new URL("./fixtures/pages.json", import.meta.url), "utf8"),
    );
    const fetch = async (url: string) => ({
      status: 200,
      body: await readFile(new URL(`./fixtures/${mapping[url]}`, import.meta.url), "utf8"),
    });
    const result = await createDatedCampaignAdapter(
      DATED_CAMPAIGNS[0],
      fetch,
      () => new Date(now),
    ).scan(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offers).toHaveLength(84);
    expect(result.offers.filter((o) => o.discovery?.availability !== "OUT_OF_STOCK")).toHaveLength(
      20,
    );
    for (const o of result.offers)
      expect(DiscoverySchema.safeParse(o.discovery).success).toBe(true);
    const campaign = await readFile(new URL("./fixtures/maxell.html", import.meta.url), "utf8");
    const page = await readFile(
      new URL("./fixtures/maxell-collection-1.html", import.meta.url),
      "utf8",
    );
    expect(
      extractDatedCampaign(DATED_CAMPAIGNS[0], page, now, {
        campaignHtml: campaign,
        url: MAXELL_COLLECTION + "?brand=acer",
      }),
    ).toBeNull();
    expect(
      extractDatedCampaign(DATED_CAMPAIGNS[0], page, now, {
        campaignHtml: campaign.replaceAll("/category/dashain-offer", "/category/laptops"),
        url: MAXELL_COLLECTION,
      }),
    ).toBeNull();
    expect(
      await createDatedCampaignAdapter(
        DATED_CAMPAIGNS[0],
        async (url) => {
          const response = await fetch(url);
          return url === MAXELL_COLLECTION
            ? {
                ...response,
                body: response.body.replaceAll(
                  'href="/category/dashain-offer?page=2"',
                  'href="/category/dashain-offer?page=1"',
                ),
              }
            : response;
        },
        () => new Date(now),
      ).scan(source),
    ).toEqual({ ok: false, reason: "STRUCTURE_CHANGED" });
    expect(
      extractDatedCampaign(
        DATED_CAMPAIGNS[0],
        campaign.replaceAll("2026-09-20T18:15:00.000000Z", "invalid-date"),
        now,
      ),
    ).toBeNull();
  });
  it("uses approved URLs and suppresses failed scans instead of withdrawing partial pages", async () => {
    for (const id of ["it-monster", ...DATED_CAMPAIGNS.map((p) => p.id)]) {
      const source = registry.sources.find((s) => s.id === id)!;
      const profile = DATED_CAMPAIGNS.find((p) => p.id === id)!;
      const create = (fetch: Parameters<typeof createItMonsterAdapter>[0]) =>
        id === "it-monster"
          ? createItMonsterAdapter(fetch, () => new Date(now))
          : createDatedCampaignAdapter(profile, fetch, () => new Date(now));
      const html = await readFile(new URL(`./fixtures/${id}.html`, import.meta.url), "utf8");
      expect(
        await create(async () => ({ status: 200, body: html })).scan({
          ...source,
          campaignEntryPoints: source.campaignEntryPoints?.filter(
            (url) => url !== MAXELL_COLLECTION,
          ),
        }),
      ).toMatchObject({
        ok: true,
        authoritative: true,
      });
      expect(await create(async () => ({ status: 503, body: "" })).scan(source)).toEqual({
        ok: false,
        reason: "NETWORK_ERROR",
      });
      expect(await create(async () => ({ status: 200, body: "" })).scan(source)).toEqual({
        ok: false,
        reason: "STRUCTURE_CHANGED",
      });
      expect(
        await create(async () => {
          throw Error("timeout");
        }).scan(source),
      ).toEqual({ ok: false, reason: "NETWORK_ERROR" });
      expect(
        await create(async () => ({ status: 200, body: html })).scan({
          ...source,
          campaignEntryPoints: [],
        }),
      ).toEqual({ ok: false, reason: "UNSUPPORTED_SOURCE" });
    }
  });
});
