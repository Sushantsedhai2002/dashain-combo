// Usage:
//   pnpm sources:discover shop-one.com.np shop-two.com
//   pnpm sources:discover --file candidates.txt --out discovered.json
//   BRAVE_SEARCH_API_KEY=... pnpm sources:discover --search
// Prints a report and writes CANDIDATE registry entries for shops with Dashain items.
import { readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import {
  DISCOVERY_QUERIES,
  discoverStorefront,
  normalizeOrigin,
  searchResultOrigins,
} from "../discover.ts";
import { createRobotsAwareFetcher } from "../http/robots.ts";
import { createSafePageFetcher } from "../http/safe-fetch.ts";

const args = process.argv.slice(2);
const option = (name) => {
  const index = args.indexOf(name);
  return index === -1 ? undefined : args.splice(index, 2)[1];
};
// pnpm runs package scripts in the package directory; resolve paths from the caller's.
const here = (path) => resolve(process.env.INIT_CWD ?? process.cwd(), path);
const file = option("--file");
const out = here(option("--out") ?? "discovered-sources.json");
const search = args.includes("--search");
const inputs = args.filter((arg) => !arg.startsWith("--"));
if (file)
  inputs.push(
    ...(await readFile(here(file), "utf8"))
      .split(/\r?\n/)
      .map((line) => line.replace(/#.*/, "").trim())
      .filter(Boolean),
  );
if (search) {
  const key = process.env.BRAVE_SEARCH_API_KEY;
  if (!key) throw new Error("BRAVE_SEARCH_API_KEY is required for --search");
  for (const q of DISCOVERY_QUERIES) {
    const url = `https://api.search.brave.com/res/v1/web/search?country=np&count=20&q=${encodeURIComponent(q)}`;
    const response = await fetch(url, { headers: { "X-Subscription-Token": key } });
    if (response.ok) inputs.push(...searchResultOrigins(await response.json()));
    else console.error(`search failed (${response.status}): ${q}`);
  }
}
const registry = JSON.parse(
  await readFile(new URL("../../../../config/sources.json", import.meta.url), "utf8"),
);
const known = new Set(
  registry.flatMap((s) => s.channels.map((c) => normalizeOrigin(c.url)?.replace("://www.", "://"))),
);
const origins = [...new Set(inputs.map(normalizeOrigin).filter(Boolean))].filter(
  (o) => !known.has(o.replace("://www.", "://")),
);
const fetchPage = createRobotsAwareFetcher(createSafePageFetcher());
const reports = [];
for (const origin of origins) {
  const report = await discoverStorefront(origin, fetchPage);
  reports.push(report);
  console.log(
    `${report.dashainOffers > 0 ? "✓" : "·"} ${report.origin} ${report.platform ?? "-"} ${report.dashainOffers} ${report.error ?? ""} ${report.sample.slice(0, 2).join(" | ")}`,
  );
}
const found = reports.filter((r) => r.dashainOffers > 0 && r.entry).map((r) => r.entry);
await writeFile(out, `${JSON.stringify({ reports, entries: found }, null, 2)}\n`);
console.log(`\n${found.length} of ${origins.length} new shops have Dashain items → ${out}`);
