import { describe, expect, it, vi } from "vitest";

import type { SourceDefinition } from "@dashain-offer/source-registry";
import {
  createSafePageFetcher,
  checkOfferPresence,
  isPublicIpAddress,
} from "../src/http/safe-fetch.ts";

const source: SourceDefinition = {
  id: "evostore",
  displayName: "EvoStore",
  status: "ACTIVE",
  supportedMarkets: ["NP"],
  marketSegments: ["electronics-retail"],
  channels: [{ kind: "WEBSITE", url: "https://evostore.com.np/", isEnabled: true }],
  verification: {
    verifiedAt: "2026-09-30T00:00:00+05:45",
    evidenceUrl: "https://evostore.com.np/",
  },
};

describe("safe website fetch", () => {
  it("restricts anonymous cart POST to the exact reviewed seller, item, origin and endpoint", async () => {
    const url = "https://saraworldwide.com.np/wp-json/wc/store/v1/cart/add-item";
    const registered = {
      ...source,
      id: "sara-worldwide",
      channels: [
        { kind: "WEBSITE" as const, url: "https://saraworldwide.com.np/", isEnabled: true },
      ],
      publicEvidenceFeeds: [url],
    };
    const request = vi.fn(async () => ({
      status: 200,
      body: "{}",
      contentType: "application/json",
    }));
    const fetch = createSafePageFetcher({ resolveHostname: async () => ["8.8.8.8"], request });
    const op = {
      kind: "SARA_CART_ADD" as const,
      productId: 1075 as const,
      cartToken: "fresh-anonymous-session-token",
    };
    await fetch(url, registered, op);
    expect(request).toHaveBeenCalledWith(url, ["8.8.8.8"], 10000, 3000000, {
      token: op.cartToken,
      productId: 1075,
    });
    request.mockClear();
    for (const target of [
      url + "?other=1",
      url.replace("add-item", "checkout"),
      url.replace("add-item", "orders"),
    ])
      await expect(fetch(target, registered, op)).rejects.toThrow(
        "Unsupported anonymous cart operation",
      );
    await expect(fetch(url, { ...registered, id: "other" }, op)).rejects.toThrow(
      "Unsupported anonymous cart operation",
    );
    await expect(fetch(url, { ...registered, publicEvidenceFeeds: [] }, op)).rejects.toThrow(
      "Unsupported anonymous cart operation",
    );
    await expect(
      fetch(url, registered, { ...op, cartToken: "token\r\nInjected: value" }),
    ).rejects.toThrow("Unsupported anonymous cart operation");
    expect(request).not.toHaveBeenCalled();
  });
  it("accepts anonymous public JSON evidence only at exact reviewed URLs with existing transport limits", async () => {
    const url = "https://evostore.com.np/api/products?id=774";
    const request = vi.fn(async () => ({
      status: 200,
      body: "{}",
      contentType: "application/json",
    }));
    const fetch = createSafePageFetcher({ resolveHostname: async () => ["8.8.8.8"], request });
    const registered = { ...source, publicEvidenceFeeds: [url] };
    await expect(fetch(url, registered)).resolves.toMatchObject({ status: 200 });
    expect(request).toHaveBeenCalledWith(url, ["8.8.8.8"], 10_000, 3_000_000);
    for (const other of [url.replace("774", "775"), url + "&other=1", "https://evostore.com.np/"])
      await expect(fetch(other, registered)).rejects.toThrow("Unsupported website response");
    await expect(fetch(url, source)).rejects.toThrow("Unsupported website response");
    await expect(fetch("https://attacker.test/api/products?id=774", registered)).rejects.toThrow(
      "URL outside approved website origin",
    );
  });
  it("uses a bounded registered timeout and rejects invalid values before transport", async () => {
    const request = vi.fn(async () => ({
      status: 200,
      body: "<html></html>",
      contentType: "text/html",
    }));
    const fetch = createSafePageFetcher({ resolveHostname: async () => ["8.8.8.8"], request });
    await fetch("https://evostore.com.np/", { ...source, requestTimeoutMs: 30_000 });
    expect(request).toHaveBeenLastCalledWith(
      "https://evostore.com.np/",
      ["8.8.8.8"],
      30_000,
      3_000_000,
    );
    request.mockClear();
    for (const requestTimeoutMs of [NaN, Infinity, 999, 30_001, 10_000.5])
      await expect(
        fetch("https://evostore.com.np/", { ...source, requestTimeoutMs }),
      ).rejects.toThrow("Invalid website request timeout");
    expect(request).not.toHaveBeenCalled();
  });
  it("accepts JSON only at explicitly registered merchant feed URLs", async () => {
    const feedUrl = "https://evostore.com.np/social-promotions.json";
    const fetchPage = createSafePageFetcher({
      resolveHostname: async () => ["8.8.8.8"],
      request: async () => ({
        status: 200,
        body: "{}",
        contentType: "application/json; charset=utf-8",
      }),
    });
    await expect(
      fetchPage(feedUrl, { ...source, socialPromotionFeeds: [feedUrl] }),
    ).resolves.toMatchObject({ status: 200 });
    await expect(fetchPage(feedUrl, source)).rejects.toThrow();
    await expect(
      fetchPage(feedUrl + "?other=1", { ...source, socialPromotionFeeds: [feedUrl] }),
    ).rejects.toThrow();
  });
  it("allows bounded plain-text robots responses only at the robots path", async () => {
    const fetchPage = createSafePageFetcher({
      resolveHostname: async () => ["8.8.8.8"],
      request: async () => ({
        status: 200,
        body: "User-agent: *\nAllow: /",
        contentType: "text/plain; charset=UTF-8",
      }),
    });
    await expect(fetchPage("https://evostore.com.np/robots.txt", source)).resolves.toMatchObject({
      status: 200,
    });
    await expect(fetchPage("https://evostore.com.np/special-offers", source)).rejects.toThrow();
  });
  it("rejects private addresses and off-origin URLs before requesting", async () => {
    const request = vi.fn(async () => ({
      status: 200,
      body: "<html></html>",
      contentType: "text/html",
    }));
    const fetchPage = createSafePageFetcher({
      resolveHostname: async () => ["127.0.0.1"],
      request,
    });
    await expect(fetchPage("https://evostore.com.np/special-offers", source)).rejects.toThrow();
    await expect(fetchPage("https://example.com/", source)).rejects.toThrow();
    expect(request).not.toHaveBeenCalled();
  });

  it("passes only validated public addresses to the pinned transport", async () => {
    const request = vi.fn(async () => ({
      status: 200,
      body: "<html></html>",
      contentType: "text/html",
    }));
    const fetchPage = createSafePageFetcher({
      resolveHostname: async () => ["8.8.8.8"],
      request,
    });
    await expect(fetchPage("https://evostore.com.np/special-offers", source)).resolves.toEqual({
      status: 200,
      body: "<html></html>",
    });
    expect(request).toHaveBeenCalledWith(
      "https://evostore.com.np/special-offers",
      ["8.8.8.8"],
      expect.any(Number),
      expect.any(Number),
    );
  });

  it("rejects oversized or non-HTML success responses", async () => {
    const fetchPage = createSafePageFetcher({
      resolveHostname: async () => ["8.8.8.8"],
      request: async () => ({ status: 200, body: "x".repeat(3_000_001), contentType: "text/html" }),
    });
    await expect(fetchPage("https://evostore.com.np/special-offers", source)).rejects.toThrow();
    const nonHtml = createSafePageFetcher({
      resolveHostname: async () => ["8.8.8.8"],
      request: async () => ({ status: 200, body: "{}", contentType: "application/json" }),
    });
    await expect(nonHtml("https://evostore.com.np/special-offers", source)).rejects.toThrow();
  });

  it("confirms removal only for 404 or 410; other statuses are inconclusive", async () => {
    for (const [status, expected] of [
      [404, "REMOVED"],
      [410, "REMOVED"],
      [403, "UNKNOWN"],
      [503, "UNKNOWN"],
      [301, "UNKNOWN"],
      [200, "PRESENT"],
    ] as const) {
      const fetchPage = vi.fn(async () => ({ status, body: "" }));
      await expect(
        checkOfferPresence("https://evostore.com.np/item", source, fetchPage),
      ).resolves.toBe(expected);
    }
  });

  it("blocks mapped loopback and private IPv4 addresses", () => {
    expect(isPublicIpAddress("127.0.0.1")).toBe(false);
    expect(isPublicIpAddress("10.1.2.3")).toBe(false);
    expect(isPublicIpAddress("::ffff:127.0.0.1")).toBe(false);
    expect(isPublicIpAddress("::1")).toBe(false);
    expect(isPublicIpAddress("8.8.8.8")).toBe(true);
  });
});
