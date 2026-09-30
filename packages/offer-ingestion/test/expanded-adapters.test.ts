import { readFile } from "node:fs/promises";
import { describe, expect, it, vi } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { createListingAdapter, LISTING_PROFILES } from "../src/adapters/listings.ts";
import { inferProductDetails, parseNprPrice } from "../src/adapters/product-details.ts";
import { robotsAllows, createRobotsAwareFetcher } from "../src/http/robots.ts";

const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw new Error("Invalid test registry");

describe("recorded source adapters", () => {
  it.each([
    [
      "choicemandu",
      "https://choicemandu.com/personalized-ranjana-lipi-wall-clock-online",
      276000,
      246000,
    ],
    ["big-digital", "https://bigdigital.com.np/product/ys-331h", 301000, 285950],
  ])("supports the newly assessed %s listing", async (id, destinationUrl, original, sale) => {
    const profile = LISTING_PROFILES.find((entry) => entry.sourceId === id);
    const source = registry.sources.find((entry) => entry.id === id);
    expect(profile).toBeDefined();
    if (!profile || !source) throw new Error("Missing new source adapter");
    const html = await readFile(new URL(`./fixtures/${id}.html`, import.meta.url), "utf8");
    const result = await createListingAdapter(profile, async () => ({
      status: 200,
      body: html,
    })).scan(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offers.find((offer) => offer.destinationUrl === destinationUrl)).toMatchObject({
      originalPrice: { currency: "NPR", amountMinor: original },
      salePrice: { currency: "NPR", amountMinor: sale },
    });
  });
  for (const profile of LISTING_PROFILES) {
    it(`extracts explicit discounts and stable keys from ${profile.sourceId}`, async () => {
      const source = registry.sources.find((s) => s.id === profile.sourceId);
      if (source === undefined) throw new Error("Missing source");
      const html = await readFile(
        new URL(`./fixtures/${profile.sourceId}.html`, import.meta.url),
        "utf8",
      );
      const fetch = vi.fn(async () => ({ status: 200, body: html }));
      const adapter = createListingAdapter(profile, fetch);
      const result = await adapter.scan(source);
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.offers.length).toBeGreaterThan(0);
      const urls = new Set(result.offers.map((o) => o.destinationUrl));
      expect(urls.size).toBe(result.offers.length);
      for (const offer of result.offers) {
        expect(offer.salePrice?.amountMinor).toBeLessThan(offer.originalPrice?.amountMinor ?? 0);
        expect(offer.salePrice?.currency).toBe("NPR");
        expect(new URL(offer.destinationUrl).origin).toBe(new URL(profile.listingUrl).origin);
        expect(offer.sourceOfferKey).toMatch(new RegExp(`^${profile.sourceId}:[a-f0-9]{64}$`));
      }
      expect(await adapter.scan(source)).toEqual(result);
      await expect(
        createListingAdapter(profile, async () => ({ status: 200, body: "<h1>Blocked</h1>" })).scan(
          source,
        ),
      ).resolves.toEqual({ ok: false, reason: "STRUCTURE_CHANGED" });
      await expect(
        createListingAdapter(profile, async () => ({ status: 403, body: "" })).scan(source),
      ).resolves.toEqual({ ok: false, reason: "NETWORK_ERROR" });
      await expect(
        createListingAdapter(profile, async () => {
          throw new Error("offline");
        }).scan(source),
      ).resolves.toEqual({ ok: false, reason: "NETWORK_ERROR" });
      await expect(adapter.scan({ ...source, id: "other" })).resolves.toEqual({
        ok: false,
        reason: "UNSUPPORTED_SOURCE",
      });
    });
  }
  it("rejects malformed/ambiguous prices, off-origin links, and duplicate cards", async () => {
    const profile = LISTING_PROFILES.find((p) => p.sourceId === "online-saathi");
    const source = registry.sources.find((s) => s.id === "online-saathi");
    if (!profile || !source) throw new Error("Missing profile");
    const card = (href: string, price: string) =>
      `<div class="single-product"><a href="${href}"><span class="prd-name">Samsung Galaxy F22</span><span class="prd-price">${price}<font class="cut-prd-price">Rs 24,499</font></span></a></div>`;
    const result = await createListingAdapter(profile, async () => ({
      status: 200,
      body:
        card("/phone", "Rs 23,999") +
        card("/phone", "Rs 23,999") +
        card("https://evil.test/phone", "Rs 23,999") +
        card("/bad", "Rs 12,34") +
        card("/range", "Rs 100–200") +
        card("/high", "Rs 30,000"),
    })).scan(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({
      brandName: "Samsung",
      category: "MOBILE_AND_TABLETS",
      salePrice: { amountMinor: 2399900 },
      originalPrice: { amountMinor: 2449900 },
    });
  });
});

describe("product evidence normalization", () => {
  it.each([
    ["NPR 42,900", 4290000],
    ["Rs.3,800", 380000],
    ["Nrs. 61,750.00", 6175000],
    ["NPR1,990.50", 199050],
    ["Rs 1,00,000", 10000000],
    ["Rs 0", 0],
    ["Rs 12,34", null],
    ["$30", null],
    ["Rs -1", null],
    ["Rs 100–200", null],
    ["Rs 999999999999999999", null],
    ["", null],
  ])("parses %s strictly", (text, expected) => {
    expect(parseNprPrice(String(text))).toBe(expected);
  });
  it.each([
    ["Apple iPhone 16", "MOBILE_AND_TABLETS", "Apple"],
    ["Samsung Galaxy S24", "MOBILE_AND_TABLETS", "Samsung"],
    ["Lenovo Laptop 16GB", "COMPUTERS_AND_ACCESSORIES", "Lenovo"],
    ["Marshall Bluetooth Speaker", "CONSUMER_ELECTRONICS", "Marshall"],
    ["Midea Refrigerator 250L", "HOME_APPLIANCES", "Midea"],
    ["Caliber Sneakers", "FASHION_AND_LIFESTYLE", "Caliber"],
    ["Unknown item", "OTHER", null],
  ])("classifies explicit title evidence in %s", (title, category, brandName) => {
    expect(inferProductDetails(title)).toEqual({ category, brandName });
  });
});

describe("robots policy", () => {
  it("fetches each origin policy once, denies disallowed requests, and treats a missing policy as allowed", async () => {
    const source = registry.sources.find((s) => s.id === "online-saathi");
    if (!source) throw new Error("Missing source");
    const fetch = vi.fn(async (url: string) => ({
      status: 200,
      body: url.endsWith("robots.txt") ? "User-agent: *\nDisallow: /private" : "<html></html>",
    }));
    const guarded = createRobotsAwareFetcher(fetch);
    await guarded("https://onlinesaathi.com/", source);
    await guarded("https://onlinesaathi.com/phone", source);
    await expect(guarded("https://onlinesaathi.com/private", source)).rejects.toThrow(/disallowed/);
    expect(fetch).toHaveBeenCalledTimes(3);
    const missing = createRobotsAwareFetcher(async (url) => ({
      status: url.endsWith("robots.txt") ? 404 : 200,
      body: "",
    }));
    await expect(missing("https://onlinesaathi.com/", source)).resolves.toEqual({
      status: 200,
      body: "",
    });
  });
  it("fails closed for unavailable or invalid policies and honors crawl-delay with injected time", async () => {
    const source = registry.sources.find((s) => s.id === "online-saathi");
    if (!source) throw new Error("Missing source");
    for (const response of [
      { status: 503, body: "" },
      { status: 200, body: "<html>Blocked</html>" },
    ]) {
      const guarded = createRobotsAwareFetcher(async () => response);
      await expect(guarded("https://onlinesaathi.com/", source)).rejects.toThrow();
    }
    let time = 0;
    const pauses: number[] = [];
    const guarded = createRobotsAwareFetcher(
      async (url) => ({
        status: 200,
        body: url.endsWith("robots.txt") ? "User-agent: *\nCrawl-delay: 10" : "<html></html>",
      }),
      {
        now: () => time,
        sleep: async (ms) => {
          pauses.push(ms);
          time += ms;
        },
      },
    );
    await guarded("https://onlinesaathi.com/", source);
    await guarded("https://onlinesaathi.com/phone", source);
    expect(pauses).toEqual([10000]);
  });
  it("uses longest matching rule, allows ties, matches query/wildcards/end anchors", () => {
    const robots =
      "User-agent: *\nDisallow: /admin/\nDisallow: /*?\nAllow: /admin/public\nDisallow: /secret$";
    expect(robotsAllows(robots, "https://site.test/admin/x")).toBe(false);
    expect(robotsAllows(robots, "https://site.test/admin/public")).toBe(true);
    expect(robotsAllows(robots, "https://site.test/page?x=1")).toBe(false);
    expect(robotsAllows(robots, "https://site.test/secret")).toBe(false);
    expect(robotsAllows(robots, "https://site.test/secret-more")).toBe(true);
    expect(robotsAllows("User-agent: *\nDisallow: /\nAllow: /", "https://site.test/")).toBe(true);
  });
  it("prefers matching agent groups and merges equally specific groups", () => {
    expect(
      robotsAllows(
        "User-agent: *\nDisallow: /\n\nUser-agent: DashainOfferRadar\nAllow: /",
        "https://site.test/",
      ),
    ).toBe(true);
    expect(robotsAllows("User-agent: googlebot\nDisallow: /", "https://site.test/")).toBe(true);
    expect(
      robotsAllows(
        "User-agent: *\nUser-agent: Bingbot\nDisallow: /private # comment\n",
        "https://site.test/private",
      ),
    ).toBe(false);
    expect(robotsAllows("User-agent: *\nDisallow:\n", "https://site.test/")).toBe(true);
  });
});
