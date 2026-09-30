import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { parsePublishOfferInput } from "../../offer-catalog/src/schema.ts";
import { createDarazAdapter } from "../src/adapters/daraz.ts";

const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw new Error("Invalid registry");
const source = registry.sources.find((entry) => entry.id === "daraz-nepal");
if (!source) throw new Error("Missing Daraz");
const fixture = await readFile(new URL("./fixtures/daraz-nepal.html", import.meta.url), "utf8");
const product = {
  itemId: 123,
  itemTitle: "Samsung Galaxy Phone",
  currency: "Rs.",
  itemPrice: "20000",
  itemDiscountPrice: "18000",
  itemHaveStock: 1,
  itemUrl: "//www.daraz.com.np/products/phone-i123-s456.html?tracking=one",
  itemImg: "https://np-live-21.slatic.net/kf/phone.jpg",
};
function page(items: readonly unknown[], moduleId = "flashSalePC"): string {
  const data = {
    modules: [{ name: "lzdrwb-homepage-react", uuid: "module", hidden: "false" }],
    data: {
      module: { pcHomepageData: { sections: [{ moduleId, fields: { datas: [{ items }] } }] } },
    },
  };
  return `<script>window.__FIRST_SCREEN_DATA=${JSON.stringify(data)};</script>`;
}

describe("Daraz homepage flash-sale data", () => {
  it("extracts recorded price pairs and produces catalog-compatible offers", async () => {
    const adapter = createDarazAdapter(async () => ({ status: 200, body: fixture }));
    const result = await adapter.scan(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offers).toHaveLength(7);
    expect(result.offers[0]).toMatchObject({
      title: "Bare Anatomy Anti Hairfall Shampoo - 250ML",
      originalPrice: { currency: "NPR", amountMinor: 77400 },
      salePrice: { currency: "NPR", amountMinor: 67800 },
    });
    for (const offer of result.offers) {
      expect(parsePublishOfferInput({ ...offer, source }).ok).toBe(true);
      expect(new URL(offer.destinationUrl).search).toBe("");
    }
    expect(await adapter.scan(source)).toEqual(result);
  });
  it("drops tracking parameters, keeps SKU identity stable, and rejects unsupported evidence", async () => {
    const items = [
      product,
      { ...product, itemUrl: product.itemUrl.replace("one", "two") },
      { ...product, itemUrl: product.itemUrl.replace("s456", "s789") },
      { ...product, itemPrice: "18000" },
      { ...product, itemHaveStock: 0 },
      { ...product, currency: "$" },
      { ...product, itemDiscountPrice: "100-200" },
      { ...product, itemUrl: "https://evil.test/products/phone-i123-s456.html" },
      { ...product, itemUrl: "http://www.daraz.com.np/products/phone-i123-s456.html" },
      { ...product, itemUrl: "https://user:pass@www.daraz.com.np/products/phone-i123-s456.html" },
      { ...product, itemId: 999 },
      { ...product, itemId: 1e20 },
      { ...product, itemTitle: "" },
      null,
    ];
    const result = await createDarazAdapter(async () => ({ status: 200, body: page(items) })).scan(
      source,
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offers).toHaveLength(2);
    expect(result.offers[0]).toMatchObject({
      destinationUrl: "https://www.daraz.com.np/products/phone-i123-s456.html",
      imageUrl: "https://np-live-21.slatic.net/kf/phone.jpg",
      category: "MOBILE_AND_TABLETS",
      brandName: "Samsung",
    });
    expect(result.offers[0]?.sourceOfferKey).not.toBe(result.offers[1]?.sourceOfferKey);
    const changed = await createDarazAdapter(async () => ({
      status: 200,
      body: page([{ ...product, itemUrl: product.itemUrl.replace("phone-", "renamed-") }]),
    })).scan(source);
    if (!changed.ok) throw new Error("Expected successful scan");
    expect(changed.offers[0]?.sourceOfferKey).toBe(result.offers[0]?.sourceOfferKey);
  });
  it("fails closed for malformed or changed data and handles access failures", async () => {
    for (const body of [
      "<html>Blocked</html>",
      "<script>window.__FIRST_SCREEN_DATA={invalid};</script>",
      page([], "unrelated"),
      page([]).replace('"module"', "null"),
    ]) {
      await expect(
        createDarazAdapter(async () => ({ status: 200, body })).scan(source),
      ).resolves.toEqual({ ok: false, reason: "STRUCTURE_CHANGED" });
    }
    await expect(
      createDarazAdapter(async () => ({ status: 503, body: "" })).scan(source),
    ).resolves.toEqual({ ok: false, reason: "NETWORK_ERROR" });
    await expect(
      createDarazAdapter(async () => {
        throw new Error("offline");
      }).scan(source),
    ).resolves.toEqual({ ok: false, reason: "NETWORK_ERROR" });
    await expect(
      createDarazAdapter(async () => ({ status: 200, body: fixture })).scan({
        ...source,
        channels: [],
      }),
    ).resolves.toEqual({ ok: false, reason: "UNSUPPORTED_SOURCE" });
  });
});
