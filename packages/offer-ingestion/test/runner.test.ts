import { describe, expect, it, vi } from "vitest";

import type { OfferCatalog, PublishOfferInput } from "@dashain-offer/offer-catalog";
import type { SourceDefinition } from "@dashain-offer/source-registry";
import { createIngestionRunner, type ObservationStore } from "../src/runner.ts";

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

const candidate = {
  sourceOfferKey: "evostore:abc",
  title: "Speaker sale",
  category: "OTHER" as const,
  destinationUrl: "https://evostore.com.np/speaker",
  originalPrice: { currency: "NPR", amountMinor: 500000 },
  salePrice: { currency: "NPR", amountMinor: 400000 },
};

function catalog() {
  const published: PublishOfferInput[] = [];
  const withdrawn: { sourceId: string; sourceOfferKey: string }[] = [];
  const instance = {
    async publishOffer(input: PublishOfferInput) {
      published.push(input);
      return { ok: true as const, value: { sourceOfferKey: input.sourceOfferKey } };
    },
    async withdrawOffer(input: { sourceId: string; sourceOfferKey: string }) {
      withdrawn.push(input);
      return { ok: true as const, value: { sourceOfferKey: input.sourceOfferKey } };
    },
  } as unknown as OfferCatalog;
  return { instance, published, withdrawn };
}

function observations(): ObservationStore & {
  entries: Map<string, string>;
  withdrawn: Set<string>;
} {
  const entries = new Map<string, string>();
  const withdrawn = new Set<string>();
  const removalCounts = new Map<string, number>();
  return {
    entries,
    withdrawn,
    async list() {
      return [...entries]
        .filter(([key]) => !withdrawn.has(key))
        .map(([sourceOfferKey, destinationUrl]) => ({ sourceOfferKey, destinationUrl }));
    },
    async resolveKey(_sourceId, baseKey) {
      return withdrawn.has(baseKey) ? `${baseKey}:g2` : baseKey;
    },
    async remember(_sourceId, _baseKey, offer) {
      entries.set(offer.sourceOfferKey, offer.destinationUrl);
      removalCounts.delete(offer.sourceOfferKey);
    },
    async recordPresence(_sourceId, key, presence) {
      const count = presence === "REMOVED" ? (removalCounts.get(key) ?? 0) + 1 : 0;
      removalCounts.set(key, count);
      return count >= 2;
    },
    async markWithdrawn(_sourceId, sourceOfferKey) {
      withdrawn.add(sourceOfferKey);
    },
  };
}

describe("ingestion runner", () => {
  it("publishes each stable key once and records successful observations", async () => {
    const offers = catalog();
    const store = observations();
    const runner = createIngestionRunner({
      sources: [source],
      adapters: [
        { sourceId: "evostore", scan: async () => ({ ok: true, offers: [candidate, candidate] }) },
      ],
      catalog: offers.instance,
      observations: store,
      checkPresence: async () => "PRESENT",
    });

    await expect(runner.runOnce()).resolves.toEqual([
      { sourceId: "evostore", status: "COMPLETE", published: 1, withdrawn: 0, skipped: 1 },
    ]);
    expect(offers.published).toHaveLength(1);
    expect(offers.published[0]?.source).toEqual(source);
    expect(store.entries.get(candidate.sourceOfferKey)).toBe(candidate.destinationUrl);
  });

  it("does not withdraw on a failed scan or an inconclusive detail probe", async () => {
    const offers = catalog();
    const store = observations();
    store.entries.set(candidate.sourceOfferKey, candidate.destinationUrl);
    const checkPresence = vi.fn(async () => "UNKNOWN" as const);
    const runner = createIngestionRunner({
      sources: [source],
      adapters: [
        { sourceId: "evostore", scan: async () => ({ ok: false, reason: "STRUCTURE_CHANGED" }) },
      ],
      catalog: offers.instance,
      observations: store,
      checkPresence,
    });

    await expect(runner.runOnce()).resolves.toEqual([
      { sourceId: "evostore", status: "FAILED", reason: "STRUCTURE_CHANGED" },
    ]);
    expect(checkPresence).not.toHaveBeenCalled();
    expect(offers.withdrawn).toHaveLength(0);
  });

  it("withdraws only after two consecutive confirmed removals", async () => {
    const offers = catalog();
    const store = observations();
    store.entries.set(candidate.sourceOfferKey, candidate.destinationUrl);
    const runner = createIngestionRunner({
      sources: [source],
      adapters: [{ sourceId: "evostore", scan: async () => ({ ok: true, offers: [] }) }],
      catalog: offers.instance,
      observations: store,
      checkPresence: async () => "REMOVED",
    });

    await expect(runner.runOnce()).resolves.toEqual([
      { sourceId: "evostore", status: "COMPLETE", published: 0, withdrawn: 0, skipped: 0 },
    ]);
    expect(offers.withdrawn).toHaveLength(0);
    await expect(runner.runOnce()).resolves.toEqual([
      { sourceId: "evostore", status: "COMPLETE", published: 0, withdrawn: 1, skipped: 0 },
    ]);
    expect(offers.withdrawn).toEqual([
      { sourceId: "evostore", sourceOfferKey: candidate.sourceOfferKey },
    ]);
    expect(store.withdrawn.has(candidate.sourceOfferKey)).toBe(true);
  });

  it("assigns a new catalog key when a removed product returns", async () => {
    const offers = catalog();
    const store = observations();
    store.entries.set(candidate.sourceOfferKey, candidate.destinationUrl);
    store.withdrawn.add(candidate.sourceOfferKey);
    const runner = createIngestionRunner({
      sources: [source],
      adapters: [{ sourceId: "evostore", scan: async () => ({ ok: true, offers: [candidate] }) }],
      catalog: offers.instance,
      observations: store,
      checkPresence: async () => "PRESENT",
    });

    await runner.runOnce();
    expect(offers.published[0]?.sourceOfferKey).toBe(`${candidate.sourceOfferKey}:g2`);
  });

  it("ignores inactive sources and disabled website channels", async () => {
    const scan = vi.fn(async () => ({ ok: true as const, offers: [candidate] }));
    const runner = createIngestionRunner({
      sources: [
        { ...source, status: "PAUSED" },
        { ...source, id: "disabled", channels: [{ ...source.channels[0]!, isEnabled: false }] },
      ],
      adapters: [{ sourceId: "evostore", scan }],
      catalog: catalog().instance,
      observations: observations(),
      checkPresence: async () => "UNKNOWN",
    });

    await expect(runner.runOnce()).resolves.toEqual([]);
    expect(scan).not.toHaveBeenCalled();
  });
});

describe("campaign scan completeness", () => {
  it("withdraws removed campaign members after complete scans even when the page exists", async () => {
    const offers = catalog();
    const store = observations();
    store.entries.set(candidate.sourceOfferKey, candidate.destinationUrl);
    const checkPresence = vi.fn(async () => "PRESENT" as const);
    const runner = createIngestionRunner({
      sources: [source],
      adapters: [
        { sourceId: source.id, scan: async () => ({ ok: true, offers: [], authoritative: true }) },
      ],
      catalog: offers.instance,
      observations: store,
      checkPresence,
    });
    await runner.runOnce();
    await runner.runOnce();
    expect(offers.withdrawn).toHaveLength(1);
    expect(checkPresence).not.toHaveBeenCalled();
  });
  it("does not infer removal from a partial scan", async () => {
    const offers = catalog();
    const store = observations();
    store.entries.set(candidate.sourceOfferKey, candidate.destinationUrl);
    const checkPresence = vi.fn(async () => "REMOVED" as const);
    const runner = createIngestionRunner({
      sources: [source],
      adapters: [
        {
          sourceId: source.id,
          scan: async () => ({ ok: true, offers: [], authoritative: true, partial: true }),
        },
      ],
      catalog: offers.instance,
      observations: store,
      checkPresence,
    });
    expect(await runner.runOnce()).toMatchObject([{ status: "PARTIAL" }]);
    await runner.runOnce();
    expect(offers.withdrawn).toHaveLength(0);
    expect(checkPresence).not.toHaveBeenCalled();
  });
});
