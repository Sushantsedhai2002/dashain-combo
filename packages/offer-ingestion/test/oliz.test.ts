import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { createOlizAdapter } from "../src/adapters/oliz.ts";
const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw new Error("Invalid registry");
const source = registry.sources.find((s) => s.id === "oliz-store");
if (!source) throw new Error("Missing source");
const product = {
  _id: "691f380e5d92ef32448486c9",
  name: "DJI Osmo Action 6 Adventure Combo",
  slug: "dji-osmo-action-6-adventure-combo-price-in-nepal",
  price: 83500,
  compare_at_price: 88800,
  in_stock: true,
  status: "Active",
  has_variants: false,
  min_price: null,
  max_price: null,
  image_urls: [],
};
const page = (products: readonly unknown[]) =>
  `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({ props: { pageProps: { response: { products } } } })}</script>`;
describe("Oliz recorded product data", () => {
  it("extracts explicit discounts from recorded homepage products", async () => {
    const result = await createOlizAdapter(async () => ({
      status: 200,
      body: await readFile(new URL("./fixtures/oliz-store.html", import.meta.url), "utf8"),
    })).scan(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({
      title: product.name,
      originalPrice: { amountMinor: 8880000 },
      salePrice: { amountMinor: 8350000 },
      brandName: "DJI",
    });
  });
  it("rejects ordinary prices, variants, unavailable products, unsafe slugs and duplicate identities", async () => {
    const products = [
      product,
      product,
      { ...product, compare_at_price: 0 },
      { ...product, in_stock: false },
      { ...product, has_variants: true },
      { ...product, slug: "../x" },
      { ...product, price: -1 },
      { ...product, status: "Draft" },
      { ...product, name: "" },
      { ...product, price: 1e20 },
    ];
    const result = await createOlizAdapter(async () => ({
      status: 200,
      body: page(products),
    })).scan(source);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.offers).toHaveLength(1);
  });
  it("fails closed on malformed data, blocked responses and unsupported identity", async () => {
    for (const body of [
      "<h1>Blocked</h1>",
      '<script id="__NEXT_DATA__">not json</script>',
      page([]).replace('"products"', '"unknown"'),
    ])
      expect(await createOlizAdapter(async () => ({ status: 200, body })).scan(source)).toEqual({
        ok: false,
        reason: "STRUCTURE_CHANGED",
      });
    expect(await createOlizAdapter(async () => ({ status: 403, body: "" })).scan(source)).toEqual({
      ok: false,
      reason: "NETWORK_ERROR",
    });
    expect(
      await createOlizAdapter(async () => {
        throw Error("offline");
      }).scan(source),
    ).toEqual({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createOlizAdapter(async () => ({ status: 200, body: page([]) })).scan({
        ...source,
        channels: [],
      }),
    ).toEqual({ ok: false, reason: "UNSUPPORTED_SOURCE" });
  });
});
