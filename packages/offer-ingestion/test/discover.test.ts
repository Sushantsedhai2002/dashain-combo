import { describe, expect, it } from "vitest";
import {
  detectPlatform,
  discoverStorefront,
  normalizeOrigin,
  searchResultOrigins,
  sourceIdFor,
} from "../src/discover.ts";
import type { PageFetcher } from "../src/adapters/evostore.ts";

const clock = () => new Date("2026-10-02T06:00:00Z");
describe("vendor discovery", () => {
  it("detects storefront platforms from home page markup", () => {
    expect(detectPlatform('<link href="//cdn.shopify.com/s/x.css">')).toBe("SHOPIFY");
    expect(detectPlatform('<body class="woocommerce-no-js">')).toBe("WOOCOMMERCE");
    expect(detectPlatform("<html>plain</html>")).toBeNull();
  });
  it("normalizes origins and derives registry ids", () => {
    expect(normalizeOrigin("Shop.Example.com.np/path")).toBe("https://shop.example.com.np");
    expect(normalizeOrigin("http://x.com")).toBe("https://x.com");
    expect(normalizeOrigin("::bad")).toBeNull();
    expect(sourceIdFor("https://www.juta-pasal.com.np")).toBe("juta-pasal");
  });
  it("keeps shop domains from search results and skips social sites", () => {
    expect(
      searchResultOrigins({
        web: {
          results: [
            { url: "https://shop.example.com.np/collections/dashain" },
            { url: "https://www.facebook.com/x" },
            { url: "https://shop.example.com.np/other" },
            { nope: 1 },
          ],
        },
      }),
    ).toEqual(["https://shop.example.com.np"]);
    expect(searchResultOrigins(null)).toEqual([]);
  });
  it("produces a CANDIDATE storefront entry and retries the www sibling", async () => {
    const pages: Record<string, string> = {
      "https://www.shop.example.com.np/": `<script>Shopify.shop = "x"; Shopify.currency = {"active":"NPR"};</script>`,
      "https://www.shop.example.com.np/collections.json?limit=250": JSON.stringify({
        collections: [{ title: "Dashain Offer", handle: "dashain" }],
      }),
      "https://www.shop.example.com.np/collections/dashain/products.json?limit=100&page=1":
        JSON.stringify({
          products: [
            {
              id: 1,
              title: "Tika plate",
              handle: "tika-plate",
              updated_at: "2026-09-30T00:00:00Z",
              variants: [{ id: 2, title: "Default Title", price: "900.00", available: true }],
            },
          ],
        }),
      "https://www.shop.example.com.np/products.json?limit=100&page=1": '{"products":[]}',
    };
    const fetchPage: PageFetcher = async (url) => {
      if (url.startsWith("https://shop.")) throw new Error("Robots policy unavailable");
      return pages[url] === undefined
        ? { status: 404, body: "" }
        : { status: 200, body: pages[url] };
    };
    const report = await discoverStorefront("shop.example.com.np", fetchPage, clock);
    expect(report).toMatchObject({
      origin: "https://www.shop.example.com.np",
      platform: "SHOPIFY",
      dashainOffers: 1,
      sample: ["Tika plate"],
      entry: { id: "shop-example", status: "CANDIDATE", storefront: { platform: "SHOPIFY" } },
    });
    expect(
      await discoverStorefront("plain.example", async () => ({ status: 200, body: "<html>" })),
    ).toMatchObject({ platform: null, error: "UNSUPPORTED_PLATFORM" });
    expect(
      await discoverStorefront("gone.example", async () => ({ status: 500, body: "" })),
    ).toMatchObject({ platform: null, error: "HTTP_500" });
  });
});
