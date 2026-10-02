import { describe, expect, it } from "vitest";
import { readFile } from "node:fs/promises";
import { parseSourceRegistry } from "@dashain-offer/source-registry";

import { productPageImage, sellerImageUrl } from "../src/adapters/product-image.ts";
import { createIngestionRuntime } from "../src/cli/runtime.ts";
import pages from "./fixtures/pages.json" with { type: "json" };

describe("seller product images", () => {
  it("resolves a seller-hosted image from a collection card", () => {
    expect(sellerImageUrl("/media/catalog/table.webp", "https://shop.example/collection")).toBe(
      "https://shop.example/media/catalog/table.webp",
    );
  });

  it("accepts a product page image for a variant URL", () => {
    const html = `<link rel="canonical" href="https://shop.example/products/table"><meta property="og:image" content="http://shop.example/images/table.jpg">`;
    expect(productPageImage(html, "https://shop.example/products/table?variant=2")).toBe(
      "https://shop.example/images/table.jpg",
    );
  });

  it("rejects another product's page image and third-party images", () => {
    const wrongProduct = `<link rel="canonical" href="https://shop.example/products/chair"><meta property="og:image" content="https://shop.example/images/chair.jpg">`;
    expect(productPageImage(wrongProduct, "https://shop.example/products/table")).toBeNull();
    expect(
      sellerImageUrl("https://tracker.example/image.jpg", "https://shop.example/products/table"),
    ).toBeNull();
    expect(sellerImageUrl("  ", "https://shop.example/products/table")).toBeNull();
  });

  it("attaches fetched product photos to Wild Yak variants", async () => {
    const runtime = createIngestionRuntime(
      undefined,
      { stdout: () => {}, stderr: () => {} },
      {
        sourceIds: ["wild-yak-gear"],
        fetchPage: async (url) => ({
          status: 200,
          body: url.endsWith("/robots.txt")
            ? "User-agent: *\nAllow: /"
            : await readFile(
                new URL(`./fixtures/${pages[url as keyof typeof pages]}`, import.meta.url),
                "utf8",
              ),
        }),
      },
    );
    try {
      const registry = parseSourceRegistry(JSON.parse(await runtime.dependencies.readRegistry()));
      if (!registry.ok) throw Error("Invalid registry");
      const source = registry.sources.find((entry) => entry.id === "wild-yak-gear")!;
      const result = await runtime.dependencies.scan(source);
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.offers).toHaveLength(40);
        expect(
          result.offers.every((offer) => offer.imageUrl?.startsWith("https://wildyakgear.com/")),
        ).toBe(true);
      }
    } finally {
      await runtime.close();
    }
  }, 15_000);
});
