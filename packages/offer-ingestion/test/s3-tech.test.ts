import { readFile } from "node:fs/promises";
import { load } from "cheerio";
import { describe, it, expect } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { DiscoverySchema } from "@dashain-offer/offer-catalog";
import {
  S3_ROOT,
  s3Campaign,
  s3Members,
  extractS3,
  createS3TechAdapter,
} from "../src/adapters/s3-tech.ts";
import pages from "./fixtures/pages.json" with { type: "json" };
const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw Error("Invalid registry");
const source = registry.sources.find((s) => s.id === "s3-tech")!;
const fixturePages: Readonly<Record<string, string>> = pages;
const fetch = async (url: string) => ({
  status: 200,
  body: await readFile(new URL(`./fixtures/${fixturePages[url]}`, import.meta.url), "utf8"),
});
const now = "2026-10-01T19:00:00Z",
  root = (await fetch(S3_ROOT)).body,
  member = s3Members(root)![0]!,
  html = (await fetch(member.url)).body;
function mutate(
  body: string,
  selector: string,
  f: (e: ReturnType<ReturnType<typeof load>>) => void,
) {
  const $ = load(body);
  const e = $(selector);
  expect(e.length).toBeGreaterThan(0);
  f(e);
  return $.html();
}
describe("S3 TECH explicit current Dashain product discounts", () => {
  it("corroborates simple cart/SKU identity, duplicate cards, stock and price pairs", async () => {
    const r = await createS3TechAdapter(fetch, () => new Date(now)).scan(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.partial).toBe(true);
    expect(r.offers).toHaveLength(3);
    expect(r.offers.map((o) => o.salePrice?.amountMinor)).toEqual([2115000, 248000, 45000]);
    for (const o of r.offers) {
      expect(DiscoverySchema.safeParse(o.discovery).success).toBe(true);
      expect(o.discovery?.campaign?.seasonBS).toBe("2083");
      expect(o.discovery?.availability).toBe("IN_STOCK");
      expect(o.discovery?.benefits).toEqual([]);
      expect(o.explicitValidityEnd).toBeNull();
    }
  });
  it("fails changed campaign, prices, membership, stock, identity and unresolved options", () => {
    expect(s3Campaign(root, "invalid")).toBe(false);
    expect(s3Campaign(root, "2027-10-01T00:00:00Z")).toBe(false);
    expect(s3Members("")).toBeNull();
    expect(s3Members(root.replaceAll("दशैं अफर", "Other"))).toBeNull();
    expect(s3Members(root.replace("Rs.21,150", "Rs.21,151"))).toBeNull();
    expect(extractS3(root, "", member, now)).toBeNull();
    expect(extractS3(root.replaceAll("२०८३", "२०८२"), html, member, now)).toBeNull();
    for (const bad of [
      mutate(html, ".current-product-price", (e) => e.text("Rs21,151.00")),
      mutate(html, ".product-details-content .product-price del", (e) => e.text("Rs21,150.00")),
      mutate(html, ".product-details-content h1", (e) => e.text("Other model")),
      mutate(html, 'link[rel="canonical"]', (e) => e.attr("href", S3_ROOT)),
      mutate(html, ".product-details-content .add-to-cart", (e) =>
        e.attr("data-product_id", "999"),
      ),
      mutate(html, ".product-details-content .add-to-cart", (e) => e.addClass("disabled")),
      mutate(html, ".product-details-content .badge--success", (e) => e.text("Out Of Stock")),
      mutate(html, ".quantity--amount .amount", (e) => e.text("0")),
      mutate(html, ".product-details-content", (e) =>
        e.append('<select name="variant"><option>Choose</option></select>'),
      ),
      html.replace('"priceCurrency": "NPR"', '"priceCurrency": "USD"'),
      html.replace('"price": "21150.00"', '"price": "21151.00"'),
      html.replace('"sku": "KOORUI-E2711F"', '"sku": ""'),
      html.replace('"seller": {', '"seller": null, "invalidSeller": {'),
      html.replace('"@type": "Product"', '"@type": "Other"'),
      mutate(html, 'script[type="application/ld+json"]', (e) => e.text("invalid")),
    ])
      expect(extractS3(root, bad, member, now)).toBeNull();
  });
  it("fails unavailable or changed bounded pages without authoritative removal", async () => {
    const adapter = createS3TechAdapter(fetch, () => new Date(now));
    expect(await adapter.scan({ ...source, id: "other" })).toMatchObject({
      ok: false,
      reason: "UNSUPPORTED_SOURCE",
    });
    expect(
      await createS3TechAdapter(async () => ({ status: 503, body: "" })).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createS3TechAdapter(async () => {
        throw Error("offline");
      }).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createS3TechAdapter(async (u) =>
        u === S3_ROOT ? fetch(u) : { status: 404, body: "" },
      ).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createS3TechAdapter(async (u) =>
        u === S3_ROOT ? fetch(u) : { status: 200, body: "" },
      ).scan(source),
    ).toMatchObject({ ok: false, reason: "STRUCTURE_CHANGED" });
    expect(
      await createS3TechAdapter(async () => ({ status: 200, body: "" })).scan(source),
    ).toMatchObject({ ok: false, reason: "STRUCTURE_CHANGED" });
  });
});
