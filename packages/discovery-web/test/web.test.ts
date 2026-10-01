import { describe, expect, it, vi } from "vitest";
import { createServer } from "node:http";
import { once } from "node:events";
import type { Offer, OfferCatalog } from "@dashain-offer/offer-catalog";
import { parseDiscoveryQuery } from "../src/query.ts";
import { renderHome, renderDetail } from "../src/render.ts";
import { createWebHandler } from "../src/handler.ts";

const source = { id: "evostore", displayName: "EvoStore" };
const offer: Offer = {
  id: "12345678-1234-4234-8234-123456789012",
  sourceId: "evostore",
  sourceOfferKey: "speaker",
  sellerDisplayName: "EvoStore",
  title: '<script>alert("x")</script> Speaker',
  summary: "Portable speaker",
  productName: "Speaker",
  brandName: "Marshall",
  category: "CONSUMER_ELECTRONICS",
  imageUrl: "https://evostore.com.np/image.png",
  destinationUrl: "https://evostore.com.np/speaker",
  originalPrice: { currency: "NPR", amountMinor: 500000 },
  salePrice: { currency: "NPR", amountMinor: 400000 },
  discountPercent: 20,
  discountLabel: null,
  terms: "While stocks last",
  sourcePublishedAt: null,
  validityStartsAt: null,
  explicitValidityEnd: null,
  firstDiscoveredAt: "2026-09-30T00:00:00Z",
  expiresAt: "2026-10-20T00:00:00Z",
  withdrawnAt: null,
  lifecycleStatus: "ACTIVE",
  createdAt: "2026-09-30T00:00:00Z",
  updatedAt: "2026-09-30T00:00:00Z",
};

describe("discovery query boundary", () => {
  it("validates and combines search, repeated categories/sources, sorts, and cursor", () => {
    expect(
      parseDiscoveryQuery(
        new URLSearchParams(
          "q= speaker &category=CONSUMER_ELECTRONICS&source=evostore&sort=PRICE_ASC&cursor=abc",
        ),
        [source],
      ),
    ).toEqual({
      ok: true,
      query: {
        scope: "ALL",
        brands: [],
        offerTypes: [],
        text: "speaker",
        categories: ["CONSUMER_ELECTRONICS"],
        sourceIds: ["evostore"],
        sort: "PRICE_ASC",
        currency: "NPR",
        limit: 24,
        cursor: "abc",
      },
    });
  });
  it.each([
    "sort=DROP",
    "category=BAD",
    "source=unknown",
    "q=" + "x".repeat(201),
    "cursor=" + "x".repeat(4097),
    "sort=NEWEST&sort=PRICE_ASC",
    "extra=x",
  ])("rejects invalid input %s", (value) => {
    expect(parseDiscoveryQuery(new URLSearchParams(value), [source]).ok).toBe(false);
  });
  it("has a default newest page and deduplicates filters", () => {
    expect(
      parseDiscoveryQuery(new URLSearchParams("source=evostore&source=evostore"), [source]),
    ).toEqual({
      ok: true,
      query: {
        scope: "ALL",
        brands: [],
        offerTypes: [],
        text: null,
        categories: [],
        sourceIds: ["evostore"],
        sort: "NEWEST",
        limit: 24,
        cursor: null,
      },
    });
  });
});

describe("presentation", () => {
  it("escapes hostile content and preserves filters in pagination", () => {
    const html = renderHome(
      { items: [offer], nextCursor: "next+cursor" },
      new URLSearchParams("q=speaker&source=evostore"),
      [source],
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("cursor=next%2Bcursor");
    expect(html).toContain("source=evostore");
    expect(html).toContain('loading="lazy"');
    expect(html).toContain("NPR");
  });
  it("renders detail metadata, terms, and safe original seller links", () => {
    const html = renderDetail(offer);
    expect(html).toContain("While stocks last");
    expect(html).toContain("Marshall");
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("Visit EvoStore");
    const unsafe = renderDetail({
      ...offer,
      destinationUrl: "javascript:alert(1)",
      imageUrl: "data:image/svg+xml,evil",
      salePrice: null,
      originalPrice: null,
      discountPercent: null,
      summary: null,
      terms: null,
      brandName: null,
      explicitValidityEnd: { kind: "KATHMANDU_DATE", value: "2026-10-20" },
    });
    expect(unsafe).not.toContain("javascript:");
    expect(unsafe).not.toContain("data:image");
    expect(unsafe).toContain("See seller for price");
  });
  it("shows a usable empty state and selected filters", () => {
    const html = renderHome(
      { items: [], nextCursor: null },
      new URLSearchParams("category=TRAVEL&sort=EXPIRING_SOON"),
      [source],
    );
    expect(html).toContain("No offers found");
    expect(html).toContain("checked");
    expect(html).toContain("selected");
  });
  it("shows the final validity date rather than the exclusive expiry date", () => {
    const html = renderDetail({
      ...offer,
      explicitValidityEnd: { kind: "KATHMANDU_DATE", value: "2026-10-20" },
      expiresAt: "2026-10-20T18:15:00.000Z",
    });
    expect(html).toContain("20 Oct 2026 · Nepal time");
    expect(html).not.toContain("21 Oct 2026");
  });
});

describe("HTTP routes", () => {
  const catalog: Pick<OfferCatalog, "searchVisibleOffers" | "getVisibleOffer"> = {
    searchVisibleOffers: vi.fn<OfferCatalog["searchVisibleOffers"]>(async () => ({
      ok: true,
      value: { items: [offer], nextCursor: null },
    })),
    getVisibleOffer: vi.fn<OfferCatalog["getVisibleOffer"]>(async () => ({
      ok: false,
      issues: [{ code: "OFFER_NOT_FOUND", path: "id", message: "Not found" }],
    })),
  };
  it("serves catalog pages with security headers and correct error statuses", async () => {
    const handler = createWebHandler({ catalog, sources: [source], stylesheet: "body{}" });
    expect((await handler("GET", "/")).status).toBe(200);
    expect((await handler("GET", "/assets/style.css")).body).toBe("body{}");
    expect((await handler("GET", "/?sort=INVALID")).status).toBe(400);
    expect((await handler("GET", "/offers/" + offer.id)).status).toBe(404);
    expect((await handler("GET", "/offers/not-a-uuid")).status).toBe(404);
    expect((await handler("GET", "/missing")).status).toBe(404);
    expect((await handler("POST", "/")).status).toBe(405);
    expect((await handler("HEAD", "/")).status).toBe(200);
    expect((await handler("GET", "/" + "x".repeat(9000))).status).toBe(414);
    expect((await handler("GET", "/")).headers["Content-Security-Policy"]).toContain(
      "script-src 'none'",
    );
  });
  it("sanitizes invalid cursors and storage failures", async () => {
    const invalid = createWebHandler({
      catalog: { ...catalog, searchVisibleOffers: async () => ({ ok: false, issues: [] }) },
      sources: [source],
      stylesheet: "",
    });
    expect((await invalid("GET", "/?cursor=bad")).status).toBe(400);
    const failing = createWebHandler({
      catalog: {
        ...catalog,
        searchVisibleOffers: async () => {
          throw new Error("postgres password");
        },
      },
      sources: [source],
      stylesheet: "",
    });
    const response = await failing("GET", "/");
    expect(response.status).toBe(503);
    expect(response.body).not.toContain("password");
    const found = createWebHandler({
      catalog: { ...catalog, getVisibleOffer: async () => ({ ok: true, value: offer }) },
      sources: [source],
      stylesheet: "",
    });
    expect((await found("GET", "/offers/" + offer.id)).status).toBe(200);
  });
  it("responds through a real Node HTTP server", async () => {
    const handler = createWebHandler({ catalog, sources: [source], stylesheet: "body{}" });
    const server = createServer((req, res) => {
      void handler(req.method ?? "GET", req.url ?? "/").then((r) => {
        res.writeHead(r.status, r.headers);
        res.end(req.method === "HEAD" ? undefined : r.body);
      });
    });
    server.listen(0, "127.0.0.1");
    await once(server, "listening");
    try {
      const address = server.address();
      if (address === null || typeof address === "string") throw new Error("Missing address");
      const response = await fetch(`http://127.0.0.1:${address.port}/?q=speaker`);
      expect(response.status).toBe(200);
      expect(await response.text()).toContain("Speaker");
      expect(
        (await fetch(`http://127.0.0.1:${address.port}/`, { method: "HEAD" })).headers.get(
          "content-type",
        ),
      ).toContain("text/html");
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((e) => (e ? reject(e) : resolve())),
      );
    }
  });
});

describe("campaign discovery UI", () => {
  it("parses visible budgets and rejects invalid filter combinations", () => {
    expect(
      parseDiscoveryQuery(
        new URLSearchParams(
          "q=washer+under+60k&scope=DASHAIN&type=GIFT_WITH_PURCHASE&stock=IN_STOCK&brand=LG",
        ),
        [source],
      ),
    ).toMatchObject({
      ok: true,
      query: {
        text: "washer",
        maxPriceMinor: 6000000,
        scope: "DASHAIN",
        sort: "RELEVANCE",
        currency: "NPR",
        availability: "IN_STOCK",
        brands: ["LG"],
      },
    });
    for (const query of [
      "scope=wrong",
      "min=-1",
      "max=bad",
      "min=100&max=50",
      "type=wrong",
      "stock=maybe",
      "min=1&min=2",
    ])
      expect(parseDiscoveryQuery(new URLSearchParams(query), [source]).ok).toBe(false);
  });
  it("shows quantities, uncertainty, evidence and an exact-model comparison", async () => {
    const { discovery } = await import("../../offer-catalog/test/fixtures/discovery.ts");
    const product = { ...offer, title: "Washer", discovery: discovery() };
    const detail = renderDetail(product);
    expect(detail).toContain("4 kg Detergent");
    expect(detail).toContain("Original offer evidence");
    expect(detail).toContain("Compare this model and variant");
    const search = vi.fn(async () => ({
      ok: true as const,
      value: { items: [product], nextCursor: null },
    }));
    const handler = createWebHandler({
      catalog: {
        getVisibleOffer: async () => ({ ok: true, value: product }),
        searchVisibleOffers: search,
      },
      sources: [source],
      stylesheet: "",
      defaultScope: "DASHAIN",
    });
    expect((await handler("GET", `/offers/${offer.id}/compare`)).body).toContain(
      "No other verified matching offers",
    );
    expect(search).toHaveBeenCalledWith(
      expect.objectContaining({ model: "LG-123", variant: "8kg", brands: ["Marshall"] }),
    );
    expect((await handler("GET", "/")).body).toContain('value="DASHAIN" selected');
    const empty = renderHome(
      { items: [], nextCursor: null },
      new URLSearchParams("scope=DASHAIN&q=washer+under+60k"),
      [source],
    );
    expect(empty).toContain("No verified current Dashain offers match");
    expect(empty).toContain('href="/?scope=ALL"');
    expect(empty).toContain('value="60000"');
  });
});
