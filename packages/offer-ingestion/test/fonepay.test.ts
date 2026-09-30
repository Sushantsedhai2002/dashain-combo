import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { createFonepayAdapter } from "../src/adapters/fonepay.ts";
const r = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!r.ok) throw Error("Registry");
const source = r.sources.find((s) => s.id === "fonepay");
if (!source) throw Error("Source");
const listing = `<div class="blog-item"><span class="date">Sep 28, 2026</span><h3><a href="https://fonepay.com/blogs/super-yatra">Travel Home – Get Cashback</a></h3></div>`;
const article = `<div class="blog-content-area"><h1>Travel Home – Get Cashback</h1><p>Get Rs. 500 cashback with promo code YATRA83.</p><p>This offer runs through November 16, 2026.</p><h3>Terms &amp; Conditions</h3><ul><li>One claim per user.</li></ul></div>`;
describe("Fonepay campaigns", () => {
  it("records publication, explicit Nepal end date and full terms without inventing prices", async () => {
    const result = await createFonepayAdapter(async (url) => ({
      status: 200,
      body: url.endsWith("/blogs") ? listing : article,
    })).scan(source);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.offers).toHaveLength(1);
    expect(result.offers[0]).toMatchObject({
      sourcePublishedAt: { kind: "KATHMANDU_DATE", value: "2026-09-28" },
      explicitValidityEnd: { kind: "KATHMANDU_DATE", value: "2026-11-16" },
      terms: "One claim per user.",
      category: "PAYMENTS_AND_FINANCE",
    });
    expect(result.offers[0]?.salePrice).toBeUndefined();
  });
  it("requires dated, same-origin campaign links and rejects unrelated articles", async () => {
    const body =
      listing +
      listing.replace("https://fonepay.com/blogs/super-yatra", "https://evil.test/blogs/x") +
      listing.replace("Sep 28, 2026", "Feb 30, 2026") +
      listing.replace("Travel Home – Get Cashback", "Company appointment");
    const result = await createFonepayAdapter(async (url) => ({
      status: 200,
      body: url.endsWith("/blogs") ? body : article,
    })).scan(source);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.offers).toHaveLength(1);
  });
  it("publishes nothing after a failed detail fetch or structural change", async () => {
    for (const response of [
      { status: 503, body: "" },
      { status: 200, body: "<h1>Changed</h1>" },
    ])
      expect(
        (
          await createFonepayAdapter(async (url) =>
            url.endsWith("/blogs") ? { status: 200, body: listing } : response,
          ).scan(source)
        ).ok,
      ).toBe(false);
    expect(
      await createFonepayAdapter(async () => {
        throw Error("offline");
      }).scan(source),
    ).toEqual({ ok: false, reason: "NETWORK_ERROR" });
    expect(
      await createFonepayAdapter(async () => ({ status: 200, body: "<h1>Changed</h1>" })).scan(
        source,
      ),
    ).toEqual({ ok: false, reason: "STRUCTURE_CHANGED" });
    expect(
      await createFonepayAdapter(async () => ({ status: 200, body: listing })).scan({
        ...source,
        id: "other",
      }),
    ).toEqual({ ok: false, reason: "UNSUPPORTED_SOURCE" });
  });
});
