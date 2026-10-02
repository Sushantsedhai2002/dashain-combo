import { describe, expect, it } from "vitest";
import { DiscoverySchema } from "@dashain-offer/offer-catalog";
import type { SourceDefinition } from "@dashain-offer/source-registry";
import {
  createStorefrontAdapter,
  isCurrentSeasonLabel,
  isStorefrontApiUrl,
} from "../src/adapters/storefront.ts";
import type { PageFetcher } from "../src/adapters/evostore.ts";

const clock = () => new Date("2026-10-02T06:00:00Z");
function source(platform: "SHOPIFY" | "WOOCOMMERCE"): SourceDefinition {
  return {
    id: "example-shop",
    displayName: "Example Shop",
    status: "ACTIVE",
    supportedMarkets: ["NP"],
    marketSegments: ["general-retail"],
    channels: [{ kind: "WEBSITE", url: "https://shop.example.com.np/", isEnabled: true }],
    verification: null,
    storefront: { platform },
  };
}
function fetcher(pages: Record<string, unknown>): PageFetcher & { calls: string[] } {
  const calls: string[] = [];
  const fn = async (url: string) => {
    calls.push(url);
    const page = pages[url];
    if (page === undefined) return { status: 404, body: "" };
    return { status: 200, body: typeof page === "string" ? page : JSON.stringify(page) };
  };
  return Object.assign(fn, { calls });
}
const O = "https://shop.example.com.np";

function shopifyProduct(id: number, title: string, overrides: Record<string, unknown> = {}) {
  return {
    id,
    title,
    handle: `product-${id}`,
    vendor: "Acme",
    product_type: "Hamper",
    tags: [],
    updated_at: "2026-09-28T10:00:00+05:45",
    published_at: "2026-09-20T10:00:00+05:45",
    images: [{ src: `https://cdn.shopify.com/${id}.jpg` }],
    variants: [
      {
        id: id * 10,
        title: "Default Title",
        price: "2500.00",
        compare_at_price: null,
        available: true,
      },
    ],
    ...overrides,
  };
}

describe("Shopify storefront collector", () => {
  const home = `<script>Shopify.currency = {"active":"NPR","rate":"1.0"};</script>`;
  it("collects Dashain collection products, combos and discounted variants", async () => {
    const fetch = fetcher({
      [`${O}/`]: home,
      [`${O}/collections.json?limit=250`]: {
        collections: [
          { title: "Dashain Special 2083", handle: "dashain-special" },
          { title: "Dashain 2025 archive", handle: "dashain-2025" },
          { title: "New arrivals", handle: "new" },
        ],
      },
      [`${O}/collections/dashain-special/products.json?limit=100&page=1`]: {
        products: [
          shopifyProduct(1, "Dry fruit combo hamper"),
          shopifyProduct(7, "Tika combo: Thali + Diyo + Abir"),
          shopifyProduct(2, "Silk saree", {
            variants: [
              {
                id: 21,
                title: "Red",
                price: "4000.00",
                compare_at_price: "5000.00",
                available: true,
              },
              { id: 22, title: "Blue", price: "4000.00", compare_at_price: null, available: false },
            ],
          }),
          shopifyProduct(3, "Old listing", {
            updated_at: "2025-09-01T00:00:00Z",
            published_at: "2025-09-01T00:00:00Z",
          }),
        ],
      },
      [`${O}/products.json?limit=100&page=1`]: {
        products: [
          shopifyProduct(4, "Dashain Tika Set", { tags: [] }),
          shopifyProduct(5, "Everyday mug", { tags: ["kitchen"] }),
          shopifyProduct(6, "Watch", { tags: ["Dasain Offer"] }),
        ],
      },
    });
    const result = await createStorefrontAdapter("example-shop", fetch, clock).scan(
      source("SHOPIFY"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(fetch.calls).not.toContain(
      `${O}/collections/dashain-2025/products.json?limit=100&page=1`,
    );
    const byTitle = Object.fromEntries(result.offers.map((o) => [o.title, o]));
    expect(Object.keys(byTitle).sort()).toEqual(
      [
        "Dashain Tika Set",
        "Tika combo: Thali + Diyo + Abir",
        "Dry fruit combo hamper",
        "Silk saree – Blue",
        "Silk saree – Red",
        "Watch",
      ].sort(),
    );
    // Combo wording without listed components cannot satisfy the catalog's bundle contract.
    expect(byTitle["Dry fruit combo hamper"]?.discovery?.offerType).toBe("FESTIVE_LISTING");
    expect(byTitle["Tika combo: Thali + Diyo + Abir"]?.discovery).toMatchObject({
      offerType: "BUNDLE",
      components: [
        { description: "Tika combo: Thali", role: "MAIN_ITEM" },
        { description: "Diyo", role: "INCLUDED_ITEM" },
        { description: "Abir", role: "INCLUDED_ITEM" },
      ],
    });
    expect(byTitle["Silk saree – Red"]).toMatchObject({
      originalPrice: { currency: "NPR", amountMinor: 500000 },
      salePrice: { currency: "NPR", amountMinor: 400000 },
      discountPercent: 20,
      destinationUrl: `${O}/products/product-2?variant=21`,
      discovery: { offerType: "PRODUCT_DISCOUNT", availability: "IN_STOCK" },
    });
    expect(byTitle["Silk saree – Blue"]?.discovery?.availability).toBe("OUT_OF_STOCK");
    expect(byTitle["Dashain Tika Set"]?.discovery).toMatchObject({
      offerType: "FESTIVE_LISTING",
      reasons: expect.arrayContaining(["MERCHANT_DASHAIN_TITLE_LABEL"]),
    });
    expect(byTitle["Watch"]?.discovery?.reasons).toContain("MERCHANT_DASHAIN_TAG_LABEL");
    for (const offer of result.offers) {
      expect(DiscoverySchema.safeParse(offer.discovery).success).toBe(true);
      expect(offer.discovery?.campaign).toMatchObject({ festivals: ["DASHAIN"], seasonAD: 2026 });
    }
  });
  it("refuses shops not priced in NPR", async () => {
    const fetch = fetcher({ [`${O}/`]: `Shopify.currency = {"active":"USD"}` });
    expect(
      await createStorefrontAdapter("example-shop", fetch, clock).scan(source("SHOPIFY")),
    ).toEqual({
      ok: false,
      reason: "STRUCTURE_CHANGED",
    });
  });
});

describe("WooCommerce storefront collector", () => {
  const api = `${O}/wp-json/wc/store/v1/products`;
  const product = (id: number, name: string, extra: Record<string, unknown> = {}) => ({
    id,
    name,
    slug: `p-${id}`,
    sku: `SKU-${id}`,
    type: "simple",
    permalink: `${O}/product/p-${id}/`,
    is_in_stock: true,
    images: [{ src: `${O}/wp-content/uploads/2025/01/${id}.jpg` }],
    categories: [],
    tags: [],
    prices: {
      price: "180000",
      regular_price: "200000",
      sale_price: "180000",
      price_range: null,
      currency_code: "NPR",
      currency_minor_unit: 2,
    },
    ...extra,
  });
  it("collects Dashain categories and labelled search hits only", async () => {
    const fetch = fetcher({
      [`${api}/categories?per_page=100`]: [
        {
          id: 7,
          name: "Dashain Offers",
          slug: "dashain-offers",
          permalink: `${O}/c/dashain/`,
          image: { src: `${O}/wp-content/uploads/2026/09/banner.jpg` },
        },
        { id: 9, name: "Dashain Sale", slug: "dashain-sale" },
        { id: 8, name: "Shoes", slug: "shoes" },
      ],
      [`${api}/tags?per_page=100`]: [],
      // An undated category reused from an earlier season.
      [`${api}?category=9&per_page=100&page=1`]: [product(6, "Last year's hamper")],
      [`${api}?category=7&per_page=100&page=1`]: [
        product(1, "Kurta &amp; shawl combo"),
        product(2, "Variable thing", {
          prices: { ...product(0, "").prices, price_range: { min_amount: "1", max_amount: "2" } },
        }),
      ],
      [`${api}?search=dashain&per_page=100&page=1`]: [
        product(3, "Plain socks"),
        product(4, "Lamp", {
          tags: [{ name: "Dashain" }],
          images: [{ src: `${O}/wp-content/uploads/2026/09/lamp.jpg` }],
        }),
        product(5, "Old Dashain mug"),
      ],
      [`${api}?search=dasain&per_page=100&page=1`]: [],
    });
    const result = await createStorefrontAdapter("example-shop", fetch, clock).scan(
      source("WOOCOMMERCE"),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offers.map((o) => o.title).sort()).toEqual(["Kurta & shawl combo", "Lamp"]);
    expect(result.offers.find((o) => o.title === "Lamp")).toMatchObject({
      salePrice: { amountMinor: 180000 },
      originalPrice: { amountMinor: 200000 },
      discovery: { offerType: "PRODUCT_DISCOUNT", product: { model: "SKU-4" } },
    });
    expect(result.offers.find((o) => o.title.startsWith("Kurta"))?.discovery?.offerType).toBe(
      "BUNDLE",
    );
    for (const offer of result.offers)
      expect(DiscoverySchema.safeParse(offer.discovery).success).toBe(true);
  });
  it("fails when the Store API is unavailable", async () => {
    expect(
      await createStorefrontAdapter("example-shop", fetcher({}), clock).scan(source("WOOCOMMERCE")),
    ).toEqual({ ok: false, reason: "STRUCTURE_CHANGED" });
  });
});

describe("storefront helpers", () => {
  it("accepts only current-season year labels", () => {
    expect(isCurrentSeasonLabel("Dashain Offer", 2026)).toBe(true);
    expect(isCurrentSeasonLabel("Dashain 2083 dhamaka", 2026)).toBe(true);
    expect(isCurrentSeasonLabel("दशैं २०८३", 2026)).toBe(true);
    expect(isCurrentSeasonLabel("Dashain 2025", 2026)).toBe(false);
    expect(isCurrentSeasonLabel("Dashain MahaUtsav Sale 2082", 2026)).toBe(false);
    expect(isCurrentSeasonLabel("दशैं २०८१", 2026)).toBe(false);
  });
  it("allows JSON only for platform catalogue paths on the enabled origin", () => {
    const shopify = source("SHOPIFY");
    expect(isStorefrontApiUrl(shopify, `${O}/products.json?limit=100&page=1`)).toBe(true);
    expect(isStorefrontApiUrl(shopify, `${O}/collections/dashain/products.json`)).toBe(true);
    expect(isStorefrontApiUrl(shopify, `${O}/cart.json`)).toBe(false);
    expect(isStorefrontApiUrl(shopify, "https://evil.example/products.json")).toBe(false);
    const woo = source("WOOCOMMERCE");
    expect(isStorefrontApiUrl(woo, `${O}/wp-json/wc/store/v1/products?search=x`)).toBe(true);
    expect(isStorefrontApiUrl(woo, `${O}/wp-json/wc/store/v1/cart`)).toBe(false);
    expect(
      isStorefrontApiUrl({ ...woo, storefront: undefined }, `${O}/wp-json/wc/store/v1/products`),
    ).toBe(false);
  });
});
