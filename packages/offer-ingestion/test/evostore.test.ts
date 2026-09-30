import { describe, expect, it, vi } from "vitest";

import type { SourceDefinition } from "@dashain-offer/source-registry";
import { createEvoStoreAdapter } from "../src/adapters/evostore.ts";

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

function card(name: string, path: string, sale: string, original?: string): string {
  return `<div class="common-item grey-white"><a href="https://evostore.com.np/${path}"><div class="inner"><div class="img-container"><img src="https://evostore.com.np/image/${path}.png"></div><div class="text"><div class="name"><p>${name}</p></div><div class="price"><p>${sale}${original === undefined ? "" : `<s>${original}</s>`}</p></div></div></div></a></div>`;
}

function page(cards: string, current: number, next?: number): string {
  return `<html><div class="products-list-container">${cards}</div><ul class="pagination"><li class="active"><span>${current}</span></li>${next === undefined ? "" : `<li><a href="https://evostore.com.np/index.php?route=product/special&amp;page=${next}">${next}</a></li>`}</ul></html>`;
}

describe("EvoStore adapter", () => {
  it("collects the permitted first listing page and publishes only clear discounted prices", async () => {
    const fetchPage = vi.fn(async () => ({
      status: 200,
      body: page(
        card("ACTON III", "acton_iii", "NPR 39,000", "NPR 42,900") +
          card("Regular product", "regular", "NPR 5,900"),
        1,
        2,
      ),
    }));
    const adapter = createEvoStoreAdapter(fetchPage);

    const result = await adapter.scan(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({
      title: "ACTON III",
      productName: "ACTON III",
      destinationUrl: "https://evostore.com.np/acton_iii",
      category: "OTHER",
      originalPrice: { currency: "NPR", amountMinor: 4290000 },
      salePrice: { currency: "NPR", amountMinor: 3900000 },
    });
    expect(result.offers[0]?.sourceOfferKey).toMatch(/^evostore:[a-f0-9]{64}$/);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("returns a failed scan for changed markup, never a false empty result", async () => {
    const adapter = createEvoStoreAdapter(async () => ({
      status: 200,
      body: "<html>Blocked</html>",
    }));
    await expect(adapter.scan(source)).resolves.toEqual({ ok: false, reason: "STRUCTURE_CHANGED" });
  });

  it("does not follow pagination links", async () => {
    const fetchPage = vi.fn(async () => ({
      status: 200,
      body: page(card("ACTON III", "acton_iii", "NPR 39,000", "NPR 42,900"), 1, 2).replace(
        "https://evostore.com.np/index.php",
        "https://localhost/index.php",
      ),
    }));
    const adapter = createEvoStoreAdapter(fetchPage);
    const result = await adapter.scan(source);
    expect(result.ok).toBe(true);
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("rejects a failed listing request", async () => {
    const adapter = createEvoStoreAdapter(async () => ({ status: 503, body: "" }));
    await expect(adapter.scan(source)).resolves.toEqual({ ok: false, reason: "NETWORK_ERROR" });
  });

  it("rejects a source whose website channel is disabled", async () => {
    const fetchPage = vi.fn(async () => ({ status: 200, body: "" }));
    const adapter = createEvoStoreAdapter(fetchPage);
    await expect(
      adapter.scan({ ...source, channels: [{ ...source.channels[0]!, isEnabled: false }] }),
    ).resolves.toEqual({ ok: false, reason: "UNSUPPORTED_SOURCE" });
    expect(fetchPage).not.toHaveBeenCalled();
  });
});
