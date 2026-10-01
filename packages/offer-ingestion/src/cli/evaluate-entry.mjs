import { readFile } from "node:fs/promises";
import { parseSourceRegistry } from "@dashain-offer/source-registry";
import { createWebsiteAdapters } from "../adapters/websites.ts";
import { evaluateExtraction } from "../evaluate.ts";

const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw new Error("Invalid source registry");
const annotations = JSON.parse(
  await readFile(new URL("../../test/fixtures/annotations.json", import.meta.url), "utf8"),
);
const pages = JSON.parse(
  await readFile(new URL("../../test/fixtures/pages.json", import.meta.url), "utf8"),
);
const candidates = new Map();
const candidateCounts = {};
const fetchPage = async (url, source) => ({
  status: 200,
  ...(url === "https://saraworldwide.com.np/wp-json/wc/store/v1/cart"
    ? { cartToken: "recorded-anonymous-session" }
    : {}),
  body: await readFile(
    new URL(`../../test/fixtures/${pages[url] ?? `${source.id}.html`}`, import.meta.url),
    "utf8",
  ),
});
for (const adapter of createWebsiteAdapters(
  fetchPage,
  [],
  () => new Date("2026-10-01T19:00:00Z"),
)) {
  const source = registry.sources.find((entry) => entry.id === adapter.sourceId);
  const result = await adapter.scan(source);
  if (!result.ok) throw new Error(`Recorded scan failed: ${adapter.sourceId}`);
  candidates.set(adapter.sourceId, result.offers);
  candidateCounts[adapter.sourceId] = result.offers.length;
}
const report = evaluateExtraction(annotations.offers, candidates, annotations.negatives);
console.log(
  JSON.stringify(
    { recordedAt: annotations.recordedAt, scope: annotations.method, candidateCounts, ...report },
    null,
    2,
  ),
);
process.exitCode = report.mismatches.length || report.annotatedOffers < 100 ? 1 : 0;
