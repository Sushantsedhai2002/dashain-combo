import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { DiscoverySchema } from "@dashain-offer/offer-catalog";
import {
  createWildYakAdapter,
  extractWildYakVariants,
  wildYakMembers,
  WILD_YAK_HOME,
} from "../src/adapters/wild-yak.ts";
const now = "2026-10-01T07:00:00Z";
const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw Error("Invalid registry");
const source = registry.sources.find((s) => s.id === "wild-yak-gear")!;
const pages = JSON.parse(await readFile(new URL("./fixtures/pages.json", import.meta.url), "utf8"));
const fetch = async (url: string) => ({
  status: 200,
  body: await readFile(new URL(`./fixtures/${pages[url]}`, import.meta.url), "utf8"),
});
const home = (await fetch(WILD_YAK_HOME)).body;
const url = "https://wildyakgear.com/product/women-base-layer/";
const html = (await fetch(url)).body;
describe("Wild Yak current selected variants", () => {
  it("publishes 40 exact size/color choices with visible and structured prices agreeing", async () => {
    const result = await createWildYakAdapter(fetch, () => new Date(now)).scan(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offers).toHaveLength(40);
    expect(new Set(result.offers.map((o) => o.destinationUrl)).size).toBe(40);
    expect(result).toMatchObject({ partial: true });
    for (const o of result.offers) {
      expect(DiscoverySchema.safeParse(o.discovery).success).toBe(true);
      expect(o.discovery?.availability).toBe("IN_STOCK");
      expect(new URL(o.destinationUrl).searchParams.get("attribute_pa_size")).toBeTruthy();
    }
  });
  it("rejects old seasons, unsafe membership and incomplete variant evidence", () => {
    expect(wildYakMembers(home, "2027-10-01T07:00:00Z")).toBeNull();
    expect(
      wildYakMembers(
        home.replaceAll(
          'href="https://wildyakgear.com/product/',
          'href="https://attacker.test/product/',
        ),
        now,
      ),
    ).toBeNull();
    for (const changed of [
      "",
      html.replaceAll("data-product_variations", "other_data"),
      html.replaceAll("&quot;display_price&quot;:2355", "&quot;display_price&quot;:1"),
      html.replaceAll(
        "&quot;attribute_pa_size&quot;:&quot;large&quot;",
        "&quot;attribute_pa_size&quot;:&quot;&quot;",
      ),
      html.replaceAll("&quot;variation_id&quot;:5067", "&quot;variation_id&quot;:5068"),
      html.replaceAll('name="attribute_pa_size"', 'name="attribute_pa_other"'),
    ])
      expect(extractWildYakVariants(home, changed, url, now)).toBeNull();
    expect(
      extractWildYakVariants(home, html, "https://wildyakgear.com/product/unlisted/", now),
    ).toBeNull();
  });
  it("suppresses failed scans and unsupported source configuration", async () => {
    expect(await createWildYakAdapter(fetch).scan({ ...source, campaignEntryPoints: [] })).toEqual({
      ok: false,
      reason: "UNSUPPORTED_SOURCE",
    });
    expect(
      await createWildYakAdapter(async () => ({ status: 503, body: "" })).scan(source),
    ).toEqual({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createWildYakAdapter(async () => ({ status: 200, body: "" })).scan(source),
    ).toEqual({ ok: false, reason: "STRUCTURE_CHANGED" });
    expect(
      await createWildYakAdapter(async () => {
        throw Error("timeout");
      }).scan(source),
    ).toEqual({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createWildYakAdapter(
        async (page) => (page === WILD_YAK_HOME ? fetch(page) : { status: 503, body: "" }),
        () => new Date(now),
      ).scan(source),
    ).toEqual({ ok: false, reason: "NETWORK_ERROR" });
  });
});
