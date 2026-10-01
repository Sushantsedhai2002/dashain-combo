import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { DiscoverySchema } from "@dashain-offer/offer-catalog";
import {
  createSabkoAdapter,
  extractSabkoPhone,
  sabkoCampaign,
  sabkoMembers,
  SABKO_CAMPAIGN,
  SABKO_SHOP,
} from "../src/adapters/sabko-phone.ts";
const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw Error("Invalid registry");
const source = registry.sources.find((s) => s.id === "sabko-phone")!;
const pages = JSON.parse(await readFile(new URL("./fixtures/pages.json", import.meta.url), "utf8"));
const fetch = async (url: string) => ({
  status: 200,
  body: await readFile(new URL(`./fixtures/${pages[url]}`, import.meta.url), "utf8"),
});
const now = "2026-10-01T07:00:00Z",
  campaign = (await fetch(SABKO_CAMPAIGN)).body,
  shop = (await fetch(SABKO_SHOP + "?product-page=9")).body,
  member = sabkoMembers(shop)![0]!,
  html = (await fetch(member.url)).body;
describe("Sabko dated warranty and exact discounted units", () => {
  it("collects the complete 12-page shop while qualifying only two discounted stock units", async () => {
    const seen: string[] = [];
    const result = await createSabkoAdapter(
      async (url) => {
        seen.push(url);
        return fetch(url);
      },
      () => new Date(now),
    ).scan(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offers).toHaveLength(2);
    expect(seen).toHaveLength(15);
    expect(result).toMatchObject({ partial: true });
    for (const o of result.offers) {
      expect(DiscoverySchema.safeParse(o.discovery).success).toBe(true);
      expect(o.discovery?.offerType).toBe("SERVICE_BENEFIT");
      expect(o.discovery?.eligibility.minimumSpendMinor).toBe(4000001);
      expect(o.discovery?.product?.attributes.condition).toBe("REFURBISHED");
      expect(o.discovery?.benefits[0]?.percent).toBeNull();
    }
    expect(result.offers[0]?.discovery?.product?.attributes).toMatchObject({
      inventoryUnit: "P6182",
      ram: "6GB",
      storage: "128GB",
      color: "Gold",
    });
    expect(result.offers[0]?.terms).toContain("MDMS is not registered");
  });
  it("rejects stale campaigns, missing warranty scope, unsupported prices and incomplete identities", () => {
    expect(sabkoCampaign(campaign, "2027-10-01T07:00:00Z")).toBeNull();
    expect(
      sabkoCampaign(campaign.replaceAll("6-month warranty", "3-month warranty"), now),
    ).toBeNull();
    expect(sabkoMembers("")).toBeNull();
    expect(
      sabkoMembers(
        shop.replaceAll(
          'href="https://sabkophone.com/product/',
          'href="https://attacker.test/product/',
        ),
      ),
    ).toBeNull();
    expect(sabkoMembers(shop.replaceAll("68,499.00", "1.00"))).not.toEqual(sabkoMembers(shop));
    for (const changed of [
      "",
      html.replaceAll("68,499.00", "68,498.00"),
      html.replaceAll("Storage: 128GB", "Storage: unknown"),
      html.replaceAll("p6182", "unknown-unit"),
      html.replaceAll("Refurbished note:", "Unknown condition:"),
      html.replaceAll(`value="${member.id}"`, 'value="999"'),
    ])
      expect(extractSabkoPhone(campaign, changed, member, now)).toBeNull();
    expect(extractSabkoPhone(campaign, html, { ...member, price: 4000000 }, now)).toBeNull();
  });
  it("suppresses fetch failures and never treats failed pagination as removal evidence", async () => {
    expect(await createSabkoAdapter(fetch).scan({ ...source, campaignEntryPoints: [] })).toEqual({
      ok: false,
      reason: "UNSUPPORTED_SOURCE",
    });
    expect(await createSabkoAdapter(async () => ({ status: 503, body: "" })).scan(source)).toEqual({
      ok: false,
      reason: "NETWORK_ERROR",
    });
    expect(await createSabkoAdapter(async () => ({ status: 200, body: "" })).scan(source)).toEqual({
      ok: false,
      reason: "STRUCTURE_CHANGED",
    });
    expect(
      await createSabkoAdapter(async () => {
        throw Error("timeout");
      }).scan(source),
    ).toEqual({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createSabkoAdapter(
        async (url) => (url === SABKO_CAMPAIGN ? fetch(url) : { status: 503, body: "" }),
        () => new Date(now),
      ).scan(source),
    ).toEqual({ ok: false, reason: "NETWORK_ERROR" });
  });
});
