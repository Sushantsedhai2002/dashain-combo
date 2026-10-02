import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { DiscoverySchema } from "@dashain-offer/offer-catalog";
import {
  createSbFurnitureAdapter,
  extractSbCampaign,
  SB_CAMPAIGN_URL,
} from "../src/adapters/sb-furniture.ts";
const pages = await Promise.all(
  Array.from({ length: 9 }, (_, i) =>
    readFile(new URL(`./fixtures/sb-furniture-${i + 1}.html`, import.meta.url), "utf8"),
  ),
);
const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw Error("Invalid registry");
const source = registry.sources.find((s) => s.id === "sb-furniture")!;
const now = "2026-10-01T07:00:00Z";
describe("SB Furniture seasonal collection", () => {
  const fetch = async (url: string) => ({
    status: 200,
    body: pages[Number(/page\/(\d+)$/.exec(url)?.[1] ?? 1) - 1]!,
  });
  it("follows the observed pagination and extracts all distinct current campaign products", async () => {
    const result = await createSbFurnitureAdapter(fetch, () => new Date(now)).scan(source);
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error("Scan failed");
    expect(result.offers).toHaveLength(210);
    expect(
      result.offers.every((offer) => offer.imageUrl?.startsWith("https://sbfurniturenepal.com/")),
    ).toBe(true);
    expect(result.offers[0]?.salePrice?.amountMinor).toBe(1755000);
    expect(result.offers[0]?.originalPrice?.amountMinor).toBe(2340000);
    for (const offer of result.offers)
      expect(DiscoverySchema.safeParse(offer.discovery).success).toBe(true);
  });
  it("rejects old seasons, missing badges and unsafe links", () => {
    for (const html of [
      "",
      pages[0]!.replaceAll("2083", "2082"),
      pages[0]!.replaceAll("Dashain Sale", "Regular Sale"),
      pages[0]!.replaceAll(
        'href="/shop/dashain-sale',
        'href="https://attacker.test/shop/dashain-sale',
      ),
      pages[0]!.replace(
        'href="/shop/category/dashain-sale-2083-10442/page/2"',
        'href="https://attacker.test/page/2"',
      ),
    ])
      expect(extractSbCampaign(html, SB_CAMPAIGN_URL, now)).toBeNull();
    expect(extractSbCampaign(pages[0]!, SB_CAMPAIGN_URL, "2027-10-01T07:00:00Z")).toBeNull();
  });
  it("suppresses partial, cyclic, duplicate and inconsistent scans", async () => {
    const variants = [
      async () => ({ status: 503, body: "" }),
      async () => {
        throw Error("timeout");
      },
      async () => ({ status: 200, body: "" }),
      async () => ({ status: 200, body: pages[0]! }),
      async (url: string) => ({
        status: 200,
        body:
          url === SB_CAMPAIGN_URL
            ? pages[0]!
            : pages[1]!.replaceAll("210 items found.", "211 items found."),
      }),
      async (url: string) => ({
        status: 200,
        body: (await fetch(url)).body.replace(
          /<a href="\/shop\/category\/dashain-sale-2083-10442\/page\/2"[^>]*>[\s\S]*?<\/a>/,
          " ",
        ),
      }),
    ];
    for (const variant of variants)
      expect((await createSbFurnitureAdapter(variant, () => new Date(now)).scan(source)).ok).toBe(
        false,
      );
    expect(
      await createSbFurnitureAdapter(fetch).scan({ ...source, campaignEntryPoints: [] }),
    ).toEqual({ ok: false, reason: "UNSUPPORTED_SOURCE" });
  });
});
