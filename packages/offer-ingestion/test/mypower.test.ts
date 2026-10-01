import { readFile } from "node:fs/promises";
import { load } from "cheerio";
import { describe, it, expect } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { DiscoverySchema } from "@dashain-offer/offer-catalog";
import {
  MYPOWER_ROOT,
  mypowerMembers,
  extractMypower,
  createMypowerAdapter,
} from "../src/adapters/mypower.ts";
import pages from "./fixtures/pages.json" with { type: "json" };
const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw Error("Invalid registry");
const source = registry.sources.find((s) => s.id === "mypower")!;
const fixturePages: Readonly<Record<string, string>> = pages;
const fetch = async (url: string) => ({
  status: 200,
  body: await readFile(new URL(`./fixtures/${fixturePages[url]}`, import.meta.url), "utf8"),
});
const now = "2026-10-01T19:00:00Z",
  root = (await fetch(MYPOWER_ROOT)).body,
  member = mypowerMembers(root)![0]!,
  url = `${MYPOWER_ROOT}product/${member.unique_id}`,
  html = (await fetch(url)).body;
function mutate(body: string, from: string, to: string) {
  const $ = load(body);
  let changed = false;
  $("script").each((_i, e) => {
    const m = /^self\.__next_f\.push\((\[.*\])\);?$/s.exec($(e).text().trim());
    if (!m) return;
    const a = JSON.parse(m[1]!);
    if (a[0] === 1 && typeof a[1] === "string" && a[1].includes(from)) {
      a[1] = a[1].replaceAll(from, to);
      $(e).text(`self.__next_f.push(${JSON.stringify(a)})`);
      changed = true;
    }
  });
  expect(changed).toBe(true);
  return $.html();
}
describe("MyPower exact advertised bundle SKUs", () => {
  it("publishes each bundle once with fixed corroborated price and no color-stock claim", async () => {
    const r = await createMypowerAdapter(fetch, () => new Date(now)).scan(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.offers).toHaveLength(3);
    expect(r.partial).toBe(true);
    for (const o of r.offers) {
      expect(DiscoverySchema.safeParse(o.discovery).success).toBe(true);
      expect(o.discovery?.offerType).toBe("BUNDLE");
      expect(o.discovery?.availability).toBe("UNKNOWN");
      expect(o.discovery?.components).toHaveLength(3);
      expect(o.discovery?.product?.variant).toContain("color unspecified");
    }
    expect(r.offers[0]).toMatchObject({
      originalPrice: { amountMinor: 708500 },
      salePrice: { amountMinor: 456000 },
      discovery: {
        campaign: {
          seasonBS: "2083",
          dateCalendar: "UNKNOWN",
          startsAt: "2026-10-01T18:15:00.000Z",
          endsAt: "2026-10-16T18:14:59.999Z",
        },
      },
    });
    expect(r.offers.map((o) => o.salePrice?.amountMinor)).toEqual([456000, 262200, 327700]);
  });
  it("rejects premature/stale campaigns, conflicting prices, hidden stock and new variant pricing", () => {
    for (const d of [
      "2026-10-01T07:00:00Z",
      "2026-10-17T00:00:00Z",
      "2027-10-02T00:00:00Z",
      "invalid",
    ])
      expect(extractMypower(root, html, member, d)).toBeNull();
    expect(mypowerMembers("")).toBeNull();
    expect(extractMypower(root, "", member, now)).toBeNull();
    for (const [from, to] of [
      ['"outofstock":0', '"outofstock":1'],
      ['"hidden":0', '"hidden":1'],
      ['"price":"7085.00"', '"price":"7084.00"'],
      ['"discounted_price":"4560.00"', '"discounted_price":"4561.00"'],
      ['"sale":1', '"sale":0'],
      ["2026-09-29", "2025-09-29"],
      ["2nd OCT – 16th OCT 2083", "2nd OCT – 16th OCT 2082"],
      ["MP-DASH-COMBO-01-2083", "MP-DASH-COMBO-01-2082"],
      ['"colors":[', '"variants":[{"price":100}],"colors":['],
    ])
      expect(extractMypower(root, mutate(html, from!, to!), member, now)).toBeNull();
    expect(extractMypower(root, html, { ...member, colors: [] }, now)).toBeNull();
    expect(
      extractMypower(mutate(root, "Offer Rs. 4,560", "Offer Rs. 4,561"), html, member, now),
    ).toBeNull();
  });
  it("fails incomplete refreshes and unsupported sources", async () => {
    expect(await createMypowerAdapter(fetch).scan({ ...source, id: "other" })).toMatchObject({
      ok: false,
      reason: "UNSUPPORTED_SOURCE",
    });
    expect(
      await createMypowerAdapter(async () => {
        throw Error("offline");
      }).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createMypowerAdapter(async () => ({ status: 503, body: "" })).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createMypowerAdapter(
        async () => ({ status: 200, body: "" }),
        () => new Date(now),
      ).scan(source),
    ).toMatchObject({ ok: false, reason: "STRUCTURE_CHANGED" });
    expect(
      await createMypowerAdapter(
        async (u) => (u === MYPOWER_ROOT ? fetch(u) : { status: 503, body: "" }),
        () => new Date(now),
      ).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createMypowerAdapter(
        async (u) => (u === MYPOWER_ROOT ? fetch(u) : { status: 200, body: "" }),
        () => new Date(now),
      ).scan(source),
    ).toMatchObject({ ok: false, reason: "STRUCTURE_CHANGED" });
  });
});
