import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { DiscoverySchema } from "@dashain-offer/offer-catalog";
import {
  createAcGharAdapter,
  acGharMembers,
  extractAcGharProduct,
  AC_GHAR_HOME,
} from "../src/adapters/ac-ghar.ts";
const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw Error("Invalid registry");
const source = registry.sources.find((s) => s.id === "ac-ghar")!;
const now = "2026-10-01T07:00:00Z";
const pages = JSON.parse(await readFile(new URL("./fixtures/pages.json", import.meta.url), "utf8"));
const fetch = async (url: string) => ({
  status: 200,
  body: await readFile(new URL(`./fixtures/${pages[url]}`, import.meta.url), "utf8"),
});
const home = (await fetch(AC_GHAR_HOME)).body,
  member = acGharMembers(home)![0]!,
  html = (await fetch(member.url)).body;
describe("AC Ghar current festive models", () => {
  it("requires current product banners, explicit festive price, exact models and agreeing NPR prices", async () => {
    const result = await createAcGharAdapter(fetch, () => new Date(now)).scan(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offers).toHaveLength(6);
    expect(result).toMatchObject({ partial: true });
    for (const o of result.offers)
      expect(DiscoverySchema.safeParse(o.discovery).success).toBe(true);
    expect(result.offers[0]).toMatchObject({
      salePrice: { amountMinor: 13050000 },
      originalPrice: { amountMinor: 14500000 },
      discovery: { product: { model: "MSEZD-24HRFN8" }, availability: "IN_STOCK" },
    });
  });
  it("rejects missing current membership, mismatched model/price/availability and unsafe product URLs", () => {
    expect(acGharMembers("")).toBeNull();
    expect(acGharMembers(home.replaceAll("सबै ब्रान्डका", "Other brands"))).toBeNull();
    expect(
      acGharMembers(
        home.replaceAll(
          'href="https://www.acghar.com/product/',
          'href="https://attacker.test/product/',
        ),
      ),
    ).toBeNull();
    expect(extractAcGharProduct(home, html, member, "2027-10-01T07:00:00Z")).toBeNull();
    expect(
      extractAcGharProduct(home, html, { ...member, url: AC_GHAR_HOME + "product/unlisted" }, now),
    ).toBeNull();
    for (const changed of [
      "",
      html.replaceAll("2083-acghar.gif", "2082-acghar.gif"),
      html.replaceAll("Festive Offer Price", "Price"),
      html.replaceAll("Rs 130,500", "Rs 130,501"),
      html.replaceAll('"price":"130500"', '"price":"130501"'),
      html.replaceAll('"value":"MSEZD-24HRFN8"', '"value":"OTHER-MODEL"'),
      html.replaceAll(
        '"availability":"https://schema.org/InStock"',
        '"availability":"https://schema.org/OutOfStock"',
      ),
      html.replaceAll('"name":"Midea"', '"name":null'),
      html.replaceAll('"@type":"Product"', '"@type":"OtherType"'),
    ])
      expect(extractAcGharProduct(home, changed, member, now)).toBeNull();
  });
  it("suppresses incomplete fetches and unsupported source configuration", async () => {
    expect(await createAcGharAdapter(fetch).scan({ ...source, campaignEntryPoints: [] })).toEqual({
      ok: false,
      reason: "UNSUPPORTED_SOURCE",
    });
    expect(await createAcGharAdapter(async () => ({ status: 503, body: "" })).scan(source)).toEqual(
      { ok: false, reason: "NETWORK_ERROR" },
    );
    expect(await createAcGharAdapter(async () => ({ status: 200, body: "" })).scan(source)).toEqual(
      { ok: false, reason: "STRUCTURE_CHANGED" },
    );
    expect(
      await createAcGharAdapter(async () => {
        throw Error("timeout");
      }).scan(source),
    ).toEqual({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createAcGharAdapter(
        async (url) => (url === AC_GHAR_HOME ? fetch(url) : { status: 503, body: "" }),
        () => new Date(now),
      ).scan(source),
    ).toEqual({ ok: false, reason: "NETWORK_ERROR" });
  });
});
