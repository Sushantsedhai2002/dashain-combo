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
      request: async () => ({ status: 200, body: "x".repeat(2_000_001), contentType: "text/html" }),
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
