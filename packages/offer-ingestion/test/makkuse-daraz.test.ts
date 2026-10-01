import { readFile } from "node:fs/promises";
import { load } from "cheerio";
import { describe, it, expect } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { DiscoverySchema } from "@dashain-offer/offer-catalog";
import {
  createMakkuseAdapter,
  extractMakkuse,
  MAKKUSE_FEED,
  MAKKUSE_DETAIL,
} from "../src/adapters/makkuse-daraz.ts";
import pages from "./fixtures/pages.json" with { type: "json" };
const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw Error("registry");
const source = registry.sources.find((s) => s.id === "makkuse-daraz")!;
const p: Readonly<Record<string, string>> = pages;
const fetch = async (u: string) => ({
  status: 200,
  body: await readFile(new URL(`./fixtures/${p[u]}`, import.meta.url), "utf8"),
});
const feed = (await fetch(MAKKUSE_FEED)).body,
  html = (await fetch(MAKKUSE_DETAIL)).body,
  now = "2026-10-01T19:00:00Z";
function changeFeed(change: Record<string, unknown>) {
  const v = JSON.parse(feed);
  Object.assign(
    v.mods.listItems.find((x: { itemId: string }) => x.itemId === "1548175752"),
    change,
  );
  return JSON.stringify(v);
}
function changeModule(change: (fields: Record<string, any>) => void) {
  const $ = load(html);
  $("script").each((i, e) => {
    const s = $(e).text(),
      m = /var __moduleData__ = (\{[^\n]*\});/.exec(s);
    if (m?.[1]) {
      const v = JSON.parse(m[1]);
      change(v.data.root.fields);
      $(e).text(s.replace(m[1], JSON.stringify(v)));
    }
  });
  return $.html();
}
describe("Makkuse independently named marketplace seller", () => {
  it("corroborates current campaign price, seller, single SKU and exact pack components", async () => {
    const r = await createMakkuseAdapter(fetch, () => new Date(now)).scan(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.partial).toBe(true);
    expect(r.offers).toHaveLength(1);
    const o = r.offers[0]!;
    expect(o.salePrice?.amountMinor).toBe(143900);
    expect(o.originalPrice?.amountMinor).toBe(159900);
    expect(DiscoverySchema.safeParse(o.discovery).success).toBe(true);
    expect(o.discovery?.merchant).toBe("Makkuse");
    expect(o.discovery?.components?.map((x) => x.quantity)).toEqual([20, 20, 20]);
    expect(o.destinationUrl).toBe(MAKKUSE_DETAIL);
  });
  it("rejects missing current season, seller, stock, price, SKU and unresolved options", () => {
    expect(extractMakkuse(feed, html, "invalid")).toBeNull();
    expect(extractMakkuse(feed, html, "2027-10-01T00:00:00Z")).toBeNull();
    expect(extractMakkuse("invalid", html, now)).toBeNull();
    expect(extractMakkuse(feed, "", now)).toBeNull();
    for (const change of [
      { name: "Makkusé Dashain Ashirbaad Pack 2082" },
      { sellerName: "" },
      { sellerId: "999" },
      { skuId: "999" },
      { inStock: false },
      { originalPrice: "1439" },
      { price: "0" },
      { priceShow: "Rs. 1440" },
      { skus: [{ id: "unknown" }] },
    ])
      expect(extractMakkuse(changeFeed(change), html, now)).toBeNull();
    for (const mutate of [
      (f: Record<string, any>) => {
        f.productOption.options = [{ name: "Choose" }];
      },
      (f: Record<string, any>) => {
        f.productOption.skuBase.skus.push({ ...f.productOption.skuBase.skus[0], skuId: "999" });
      },
      (f: Record<string, any>) => {
        f.primaryKey.sellerId = "999";
      },
      (f: Record<string, any>) => {
        f.globalConfig.currency = "USD";
      },
      (f: Record<string, any>) => {
        f.skuInfos["12376453054"].operation.disable = true;
      },
      (f: Record<string, any>) => {
        f.skuInfos["12376453054"].quantity.limit.max = 0;
      },
      (f: Record<string, any>) => {
        f.product.desc = "Unspecified gift pack";
      },
    ])
      expect(extractMakkuse(feed, changeModule(mutate), now)).toBeNull();
    expect(
      extractMakkuse(
        feed,
        html.replace("var __moduleData__ = {", "var __moduleData__ = evil({"),
        now,
      ),
    ).toBeNull();
  });
  it("fails missing registry evidence, unavailable pages or changed structures as a partial-source failure", async () => {
    expect(await createMakkuseAdapter(fetch).scan({ ...source, id: "other" })).toMatchObject({
      ok: false,
      reason: "UNSUPPORTED_SOURCE",
    });
    expect(
      await createMakkuseAdapter(async () => ({ status: 503, body: "" })).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createMakkuseAdapter(async () => {
        throw Error("offline");
      }).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createMakkuseAdapter(async () => ({ status: 200, body: "" })).scan(source),
    ).toMatchObject({ ok: false, reason: "STRUCTURE_CHANGED" });
  });
});
