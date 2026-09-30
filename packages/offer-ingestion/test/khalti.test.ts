import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { createKhaltiAdapter } from "../src/adapters/khalti.ts";
const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw Error("Registry");
const source = registry.sources.find((s) => s.id === "khalti");
if (!source) throw Error("Source");
const listing = `<div class="et_pb_blog_0"><article class="et_pb_post"><h2 class="entry-title"><a href="https://blog.khalti.com/home/reward/">Reward campaign</a></h2><span class="published">Sep 23, 2026</span></article></div>`;
const article = `<article><h1 class="entry-title">Reward campaign</h1><span class="published">Sep 23, 2026</span><div class="entry-content"><p>Top up to win a grand prize.</p><h3>Terms and Conditions</h3><ul><li>Valid from Ashoj 2 to Kartik 17.</li><li>KYC required.</li></ul><h3>Apply Now</h3><p>Download app.</p></div></article>`;
describe("Khalti campaign feed", () => {
  it("requires the verified blog channel and dated promotion evidence", async () => {
    const adapter = createKhaltiAdapter(async (url) => ({
      status: 200,
      body: url === "https://blog.khalti.com/" ? listing : article,
    }));
    const result = await adapter.scan(source);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.offers).toHaveLength(1);
      expect(result.offers[0]).toMatchObject({
        category: "PAYMENTS_AND_FINANCE",
        sourcePublishedAt: { kind: "KATHMANDU_DATE", value: "2026-09-23" },
        terms: "Terms and Conditions: Valid from Ashoj 2 to Kartik 17.KYC required.",
      });
      expect(result.offers[0]?.explicitValidityEnd).toBeUndefined();
      expect(result.offers[0]?.salePrice).toBeUndefined();
    }
    expect((await adapter.scan({ ...source, channels: [] })).ok).toBe(false);
  });
  it("rejects an incomplete scan, mismatching dates and untrusted links", async () => {
    for (const response of [
      { status: 503, body: "" },
      { status: 200, body: article.replace("Sep 23", "Sep 24") },
      { status: 200, body: "changed" },
    ]) {
      expect(
        (
          await createKhaltiAdapter(async (url) =>
            url === "https://blog.khalti.com/" ? { status: 200, body: listing } : response,
          ).scan(source)
        ).ok,
      ).toBe(false);
    }
    expect(
      await createKhaltiAdapter(async () => {
        throw Error("offline");
      }).scan(source),
    ).toEqual({ ok: false, reason: "NETWORK_ERROR" });
    for (const body of [
      listing.replace("https://blog.khalti.com", "https://evil.test"),
      listing.replace("Sep 23", "Feb 30"),
    ]) {
      const result = await createKhaltiAdapter(async () => ({ status: 200, body })).scan(source);
      expect(result).toEqual({ ok: true, offers: [] });
    }
    const result = await createKhaltiAdapter(async (url) => ({
      status: 200,
      body:
        url === "https://blog.khalti.com/"
          ? listing
          : article.replace("Top up to win a grand prize.", "General company news."),
    })).scan(source);
    expect(result).toEqual({ ok: true, offers: [] });
  });
});
