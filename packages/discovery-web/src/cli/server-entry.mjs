import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { createOfferCatalog } from "@dashain-offer/offer-catalog";
import { getActiveSources, parseSourceRegistry } from "@dashain-offer/source-registry";
import { createWebHandler } from "../handler.ts";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("Set DATABASE_URL to the migrated offer catalog database.");
const port = Number(process.env.PORT ?? 3000);
if (!Number.isInteger(port) || port < 1 || port > 65535)
  throw new Error("PORT must be between 1 and 65535.");
const registry = parseSourceRegistry(
  JSON.parse(await readFile(new URL("../../../../config/sources.json", import.meta.url), "utf8")),
);
if (!registry.ok) throw new Error("Source registry is invalid.");
const handler = createWebHandler({
  catalog: createOfferCatalog({ databaseUrl }),
  sources: getActiveSources(registry.sources),
  stylesheet: await readFile(new URL("../style.css", import.meta.url), "utf8"),
});
// Node 24 server API: https://nodejs.org/docs/latest-v24.x/api/http.html#httpcreateserveroptions-requestlistener
const server = createServer(
  { requestTimeout: 15000, headersTimeout: 10000, maxHeaderSize: 16384 },
  (request, response) => {
    void handler(request.method ?? "GET", request.url ?? "/").then((result) => {
      response.writeHead(result.status, result.headers);
      response.end(request.method === "HEAD" ? undefined : result.body);
    });
  },
);
server.listen(port, process.env.HOST ?? "127.0.0.1", () =>
  console.log(`Offer Radar is listening on port ${port}.`),
);
for (const signal of ["SIGTERM", "SIGINT"])
  process.once(signal, () => server.close(() => process.exit(0)));
