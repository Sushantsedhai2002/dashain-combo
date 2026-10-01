import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { DiscoverySchema } from "@dashain-offer/offer-catalog";
import {
  createSukumartAdapter,
  extractSukumartPage,
  SUKUMART_HOME,
  SUKUMART_CAMPAIGN,
} from "../src/adapters/sukumart.ts";
const home = await readFile(new URL("./fixtures/sukumart-home.html", import.meta.url), "utf8");
const pages = await Promise.all(
  [1, 2, 3].map((i) => readFile(new URL(`./fixtures/sukumart-${i}.html`, import.meta.url), "utf8")),
);
const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw Error("Invalid registry");
const source = registry.sources.find((s) => s.id === "sukumart")!;
const now = "2026-10-01T07:00:00Z";
const fetch = async (url: string) => ({
  status: 200,
  body: url === SUKUMART_HOME ? home : pages[Number(/page\/(\d+)/.exec(url)?.[1] ?? 1) - 1]!,
});
describe("Sukumart current collection", () => {
  it("uses stable date ordering and current banner evidence across all three pages", async () => {
    const result = await createSukumartAdapter(fetch, () => new Date(now)).scan(source);
    expect(result.ok).toBe(true);
    if (!result.ok) throw Error("Failed scan");
    expect(result.offers).toHaveLength(24);
    expect(new Set(result.offers.map((o) => o.sourceOfferKey)).size).toBe(24);
    for (const offer of result.offers)
      expect(DiscoverySchema.safeParse(offer.discovery).success).toBe(true);
    expect(
      result.offers.some((o) => o.title.includes("HY320") && o.salePrice?.amountMinor === 1199000),
    ).toBe(true);
  });
  it("excludes full-price products and rejects stale season, unproven membership and off-origin links", () => {
    expect(
      extractSukumartPage(pages[0]!, home, SUKUMART_CAMPAIGN, now)?.offers.length,
    ).toBeLessThan(16);
    expect(
      extractSukumartPage(
        pages[0]!,
        home.replaceAll("dashain-offer-2083", "dashain-offer-2082"),
        SUKUMART_CAMPAIGN,
        now,
      ),
    ).toBeNull();
    expect(
      extractSukumartPage(pages[0]!, home, SUKUMART_CAMPAIGN, "2027-10-01T07:00:00Z"),
    ).toBeNull();
    expect(
      extractSukumartPage(
        pages[0]!.replaceAll(
          'href="https://www.sukumart.com/product/',
          'href="https://attacker.test/product/',
        ),
        home,
        SUKUMART_CAMPAIGN,
        now,
      ),
    ).toBeNull();
    expect(extractSukumartPage("", home, SUKUMART_CAMPAIGN, now)).toBeNull();
  });
  it("suppresses failed, incomplete and duplicate scans", async () => {
    for (const callback of [
      async () => ({ status: 503, body: "" }),
      async () => {
        throw Error("timeout");
      },
      async (url: string) => ({ status: 200, body: url === SUKUMART_HOME ? home : "" }),
      async (url: string) => ({ status: 200, body: url === SUKUMART_HOME ? home : pages[0]! }),
    ])
      expect((await createSukumartAdapter(callback, () => new Date(now)).scan(source)).ok).toBe(
        false,
      );
    expect(await createSukumartAdapter(fetch).scan({ ...source, campaignEntryPoints: [] })).toEqual(
      { ok: false, reason: "UNSUPPORTED_SOURCE" },
    );
  });
});
