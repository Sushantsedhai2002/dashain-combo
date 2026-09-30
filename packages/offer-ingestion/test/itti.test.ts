import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { parsePublishOfferInput } from "../../offer-catalog/src/schema.ts";
import { createIttiAdapter } from "../src/adapters/itti.ts";

const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw new Error("Invalid registry");
const source = registry.sources.find((entry) => entry.id === "itti");
if (!source) throw new Error("Missing ITTI");
const fixture = await readFile(new URL("./fixtures/itti.html", import.meta.url), "utf8");

function page(products: readonly unknown[]): string {
  const record = [
    "$",
    "$L3d",
    null,
    {
      state: {
        queries: [
          { queryKey: ["get-all-home-data"], state: { data: { clearance: { data: products } } } },
        ],
      },
    },
  ];
  const flight = `37:${JSON.stringify(record)}\n`;
  // Splitting a JSON record across streamed script chunks must preserve the data.
  return [flight.slice(0, 80), flight.slice(80)]
    .map((chunk) => `<script>self.__next_f.push(${JSON.stringify([1, chunk])})</script>`)
    .join("");
}
const product = {
  name: "Lenovo ThinkPad Z13",
  slug: "lenovo-thinkpad-z13",
  coming_soon: 0,
  price: { mark_price: 199000, selling_price: 175120, in_stock: true },
};

describe("ITTI server-delivered product data", () => {
  it("extracts recorded discounts with stable product URLs and keys", async () => {
    const adapter = createIttiAdapter(async () => ({ status: 200, body: fixture }));
    const result = await adapter.scan(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offers.length).toBeGreaterThan(0);
    expect(
      result.offers.find(
        (offer) =>
          offer.destinationUrl ===
          "https://itti.com.np/product/asus-vivobook-15-k513ea-price-nepal",
      ),
    ).toMatchObject({
      originalPrice: { currency: "NPR", amountMinor: 10500000 },
      salePrice: { currency: "NPR", amountMinor: 8500000 },
      brandName: "Asus",
    });
    expect(new Set(result.offers.map((offer) => offer.destinationUrl)).size).toBe(
      result.offers.length,
    );
    for (const offer of result.offers) {
      expect(parsePublishOfferInput({ ...offer, source }).ok).toBe(true);
    }
    expect(await adapter.scan(source)).toEqual(result);
  });
  it("preserves long offer titles while respecting the shorter product-name limit", async () => {
    const title = "Lenovo " + "x".repeat(210);
    const body = page([
      { ...product, name: title, short_name: "Lenovo ThinkPad Z13" },
      { ...product, slug: "long-product", name: title },
    ]);
    const result = await createIttiAdapter(async () => ({ status: 200, body })).scan(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offers).toHaveLength(2);
    expect(result.offers[0]).toMatchObject({ title, productName: "Lenovo ThinkPad Z13" });
    expect(result.offers[1]).toMatchObject({ title, productName: null });
  });
  it("skips ordinary prices, unavailable items, invalid money, unsafe slugs and duplicates", async () => {
    const body = page([
      product,
      product,
      { ...product, price: { ...product.price, selling_price: 199000 } },
      { ...product, price: { ...product.price, in_stock: false } },
      { ...product, coming_soon: 1 },
      { ...product, price: { ...product.price, selling_price: "100" } },
      { ...product, price: { ...product.price, selling_price: -1 } },
      { ...product, price: { ...product.price, mark_price: 1e20 } },
      { ...product, slug: "https://evil.test/x" },
      { ...product, slug: "../admin" },
      { ...product, name: "" },
      null,
    ]);
    const result = await createIttiAdapter(async () => ({ status: 200, body })).scan(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({
      category: "COMPUTERS_AND_ACCESSORIES",
      brandName: "Lenovo",
      originalPrice: { amountMinor: 19900000 },
      salePrice: { amountMinor: 17512000 },
    });
    expect(result.offers[0]?.sourceOfferKey).toMatch(/^itti:[a-f0-9]{64}$/);
  });
  it("fails safely for changed or malformed data, blocked responses and network failure", async () => {
    for (const body of [
      "<html>Blocked</html>",
      '<script>self.__next_f.push([1,"bad"])</script>',
      "<script>self.__next_f.push([1,invalid])</script>",
      page([]).replace("get-all-home-data", "unrelated-data"),
    ]) {
      await expect(
        createIttiAdapter(async () => ({ status: 200, body })).scan(source),
      ).resolves.toEqual({ ok: false, reason: "STRUCTURE_CHANGED" });
    }
    await expect(
      createIttiAdapter(async () => ({ status: 403, body: "" })).scan(source),
    ).resolves.toEqual({ ok: false, reason: "NETWORK_ERROR" });
    await expect(
      createIttiAdapter(async () => {
        throw new Error("offline");
      }).scan(source),
    ).resolves.toEqual({ ok: false, reason: "NETWORK_ERROR" });
    await expect(
      createIttiAdapter(async () => ({ status: 200, body: fixture })).scan({
        ...source,
        channels: [],
      }),
    ).resolves.toEqual({ ok: false, reason: "UNSUPPORTED_SOURCE" });
    await expect(
      createIttiAdapter(async () => ({ status: 200, body: fixture })).scan({
        ...source,
        id: "other",
      }),
    ).resolves.toEqual({ ok: false, reason: "UNSUPPORTED_SOURCE" });
  });
});
