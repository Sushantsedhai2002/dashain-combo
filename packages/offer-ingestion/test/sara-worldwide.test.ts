import { readFile } from "node:fs/promises";
import { describe, it, expect } from "vitest";
import { DiscoverySchema } from "@dashain-offer/offer-catalog";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import {
  createSaraAdapter,
  extractSara,
  SARA_ROOT,
  SARA_CART,
  SARA_ADD,
} from "../src/adapters/sara-worldwide.ts";
import type { PageFetcher } from "../src/adapters/evostore.ts";
import pages from "./fixtures/pages.json" with { type: "json" };
const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw Error("registry");
const source = registry.sources.find((s) => s.id === "sara-worldwide")!;
const p: Readonly<Record<string, string>> = pages;
const fetch: PageFetcher = async (url, _source, operation) => {
  if (url === SARA_ADD)
    expect(operation).toEqual({
      kind: "SARA_CART_ADD",
      productId: 1075,
      cartToken: "recorded-anonymous-session",
    });
  return {
    status: 200,
    body: await readFile(new URL(`./fixtures/${p[url]}`, import.meta.url), "utf8"),
    ...(url === SARA_CART ? { cartToken: "recorded-anonymous-session" } : {}),
  };
};
const now = "2026-10-01T19:00:00Z";
const root = await readFile(new URL("./fixtures/sara-0.html", import.meta.url), "utf8"),
  product = await readFile(new URL("./fixtures/sara-1.json", import.meta.url), "utf8"),
  cart = await readFile(new URL("./fixtures/sara-3.json", import.meta.url), "utf8");
describe("Sara anonymous observed cart discount", () => {
  it("publishes exact 250g pack with an observed discounted line price", async () => {
    const r = await createSaraAdapter(fetch, () => new Date(now)).scan(source);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.partial).toBe(true);
    expect(r.offers).toHaveLength(1);
    expect(r.offers[0]?.salePrice?.amountMinor).toBe(13500);
    expect(DiscoverySchema.safeParse(r.offers[0]?.discovery).success).toBe(true);
    expect(r.offers[0]?.discovery?.product?.variant).toBe("250g");
  });
  it("rejects unconfirmed campaign, pack, stock, options, coupons, prices and shared carts", () => {
    expect(extractSara(root, product, cart, "invalid")).toBeNull();
    expect(extractSara(root, product, cart, "2026-11-17T00:00:00Z")).toBeNull();
    expect(
      extractSara(root.replaceAll("November 16, 2026", "November 16, 2025"), product, cart, now),
    ).toBeNull();
    for (const change of [
      { id: 999 },
      { type: "variable" },
      { has_options: true },
      { is_in_stock: false },
      { description: "250gm Rs 250" },
      { attributes: [{ name: "size" }] },
      {
        prices: {
          price: "15000",
          regular_price: "15000",
          currency_code: "USD",
          currency_minor_unit: 2,
        },
      },
    ])
      expect(
        extractSara(root, JSON.stringify({ ...JSON.parse(product), ...change }), cart, now),
      ).toBeNull();
    for (const change of [
      { items: [] },
      { items_count: 2 },
      { coupons: [] },
      { fees: [{ name: "fee" }] },
      { errors: ["error"] },
      { totals: { currency_code: "NPR", currency_minor_unit: 2, total_price: "15000" } },
    ])
      expect(
        extractSara(root, product, JSON.stringify({ ...JSON.parse(cart), ...change }), now),
      ).toBeNull();
    expect(extractSara(root, product, cart.replaceAll("13500", "13400"), now)).toBeNull();
    expect(extractSara(root, "invalid", cart, now)).toBeNull();
  });
  it("fails missing session and unavailable pages without authoritative removal", async () => {
    expect(await createSaraAdapter(fetch).scan({ ...source, id: "other" })).toMatchObject({
      ok: false,
      reason: "UNSUPPORTED_SOURCE",
    });
    expect(
      await createSaraAdapter(async () => ({ status: 503, body: "" })).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createSaraAdapter(async () => {
        throw Error("offline");
      }).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
    const missing: PageFetcher = async (u, s, o) => {
      const r = await fetch(u, s, o);
      return { status: r.status, body: r.body };
    };
    expect(await createSaraAdapter(missing).scan(source)).toMatchObject({
      ok: false,
      reason: "STRUCTURE_CHANGED",
    });
    expect(
      await createSaraAdapter(async (u, s, o) =>
        u === SARA_ADD ? { status: 404, body: "" } : fetch(u, s, o),
      ).scan(source),
    ).toMatchObject({ ok: false, reason: "NETWORK_ERROR" });
  });
});
