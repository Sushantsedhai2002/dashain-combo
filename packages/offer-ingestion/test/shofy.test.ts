import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { DiscoverySchema } from "@dashain-offer/offer-catalog";
import { SHOFY_FEEDS, createShofyAdapter, extractShofy } from "../src/adapters/shofy.ts";
import pages from "./fixtures/pages.json" with { type: "json" };
const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw Error("Invalid registry");
const source = registry.sources.find((s) => s.id === "sugandha-griha")!;
const fixturePages: Readonly<Record<string, string>> = pages;
const fetch = async (url: string) => ({
  status: 200,
  body: await readFile(new URL(`./fixtures/${fixturePages[url]}`, import.meta.url), "utf8"),
});
const bodies = await Promise.all(SHOFY_FEEDS.map(async (u) => (await fetch(u)).body));
const now = "2026-10-01T07:00:00Z";
function extract(offer = bodies[0]!, product = bodies[1]!, seller = bodies[2]!, date = now) {
  return extractShofy(offer, product, seller, date);
}
function change(body: string, field: string, value: unknown, index = 0) {
  const a = JSON.parse(body);
  a[index][field] = value;
  return JSON.stringify(a);
}
describe("reviewed Sugandha Griha public campaign and product evidence", () => {
  it("publishes one active exact merchant product and respects absolute discount semantics", async () => {
    const r = await createShofyAdapter(fetch, () => new Date(now)).scan(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.partial).toBe(true);
    expect(r.offers).toHaveLength(1);
    const o = r.offers[0]!;
    expect(DiscoverySchema.safeParse(o.discovery).success).toBe(true);
    expect(o).toMatchObject({
      originalPrice: { amountMinor: 159800 },
      salePrice: { amountMinor: 135800 },
      discountPercent: 15,
      discovery: {
        merchant: "Sugandha Griha",
        availability: "IN_STOCK",
        campaign: { startsAt: "2026-09-23T18:15:00.000Z", endsAt: "2026-10-14T18:14:59.999Z" },
      },
    });
    expect(o.discovery?.evidence).toHaveLength(3);
    expect(o.salePrice?.amountMinor).not.toBe(24000);
  });
  it("rejects uncertain merchant/variant/stock/prices and stale or unrelated memberships", () => {
    for (const [field, value] of [
      ["vendorId", 93],
      ["shopName", "Other"],
      ["username", "other"],
      ["stock", 0],
      ["stock", 0.5],
      ["variable", true],
      ["variables", [{ id: 1 }]],
      ["price", 1600],
      ["discountedPrice", 230],
      ["discountedPrice", 1598],
      ["discountedPrice", 240.005],
      ["discountPercent", 14],
      ["sku", "unknown"],
      ["status", 0],
      ["id", 775],
      ["productName", "Other"],
    ] as const)
      expect(extract(bodies[0], change(bodies[1]!, field, value))).toBeNull();
    for (const [field, value] of [
      ["vendorId", 93],
      ["status", 0],
      ["vendorAddress", "Other"],
    ] as const)
      expect(extract(bodies[0], bodies[1], change(bodies[2]!, field, value))).toBeNull();
    for (const [field, value] of [
      ["offerName", "Rakshya Bandan Gift!!"],
      ["endDate", 1790187300000],
      ["startDate", 1792001700000],
      ["status", 0],
      ["remainingOfferProduct", 0],
      ["noOfProduct", 0],
      ["price", 1600],
      ["discountPercent", 0.1],
      ["offerId", 13.5],
    ] as const)
      expect(extract(change(bodies[0]!, field, value, 2))).toBeNull();
    for (const date of [
      "invalid",
      "2027-10-01T00:00:00Z",
      "2026-09-20T00:00:00Z",
      "2026-10-15T00:00:00Z",
    ])
      expect(extract(undefined, undefined, undefined, date)).toBeNull();
    const offers = JSON.parse(bodies[0]!);
    offers.push(offers[2]);
    expect(extract(JSON.stringify(offers))).toBeNull();
    expect(extract(JSON.stringify(Array.from({ length: 101 }, () => offers[2])))).toBeNull();
    expect(extract("{}")).toBeNull();
    expect(extract("broken")).toBeNull();
    expect(extract(undefined, "[]")).toBeNull();
    expect(extract(undefined, undefined, "[]")).toBeNull();
  });
  it("requires registered public endpoints and fails incomplete refreshes", async () => {
    expect(
      await createShofyAdapter(fetch).scan({ ...source, publicEvidenceFeeds: [] }),
    ).toMatchObject({ ok: false, reason: "UNSUPPORTED_SOURCE" });
    expect(await createShofyAdapter(fetch).scan({ ...source, id: "other" })).toMatchObject({
      ok: false,
      reason: "UNSUPPORTED_SOURCE",
    });
    expect(
      await createShofyAdapter(async () => {
        throw Error("offline");
      }).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createShofyAdapter(async () => ({ status: 503, body: "" })).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createShofyAdapter(
        async () => ({ status: 200, body: "[]" }),
        () => new Date(now),
      ).scan(source),
    ).toMatchObject({ ok: false, reason: "STRUCTURE_CHANGED" });
  });
});
