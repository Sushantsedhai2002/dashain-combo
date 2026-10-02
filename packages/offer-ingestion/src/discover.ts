import type { SourceDefinition } from "@dashain-offer/source-registry";
import type { PageFetcher } from "./adapters/evostore.ts";
import { createStorefrontAdapter } from "./adapters/storefront.ts";

// Vendor discovery: turn candidate shop domains (typed in, or from a web search API) into
// reviewable source-registry entries. Discovery never activates a source; an operator
// reviews the sample and the shop's identity before changing status to ACTIVE.

export type Platform = "SHOPIFY" | "WOOCOMMERCE";
export type DiscoveryReport = Readonly<{
  origin: string;
  platform: Platform | null;
  dashainOffers: number;
  sample: readonly string[];
  error?: string;
  entry?: SourceDefinition;
}>;

export function detectPlatform(html: string): Platform | null {
  if (/Shopify\.shop\s*=|cdn\.shopify\.com|shopify-section/i.test(html)) return "SHOPIFY";
  if (/wp-content\/plugins\/woocommerce|woocommerce-(?:page|no-js)|wc-block/i.test(html))
    return "WOOCOMMERCE";
  return null;
}

export function normalizeOrigin(input: string): string | null {
  try {
    const url = new URL(
      /^https?:\/\//i.test(input.trim()) ? input.trim() : `https://${input.trim()}`,
    );
    if (url.protocol !== "https:" && url.protocol !== "http:") return null;
    return `https://${url.hostname.toLowerCase()}`;
  } catch {
    return null;
  }
}

export function sourceIdFor(origin: string): string {
  return new URL(origin).hostname
    .replace(/^www\./, "")
    .replace(/\.(?:com\.np|org\.np|net\.np|np|com|store|shop|co)$/, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

function draft(origin: string, platform: Platform | undefined): SourceDefinition {
  const host = new URL(origin).hostname.replace(/^www\./, "");
  return {
    id: sourceIdFor(origin),
    displayName: host,
    status: "CANDIDATE",
    supportedMarkets: ["NP"],
    marketSegments: ["general-retail"],
    channels: [{ kind: "WEBSITE", url: `${origin}/`, isEnabled: true }],
    verification: null,
    ...(platform ? { storefront: { platform } } : {}),
  };
}

export async function discoverStorefront(
  input: string,
  fetchPage: PageFetcher,
  clock = () => new Date(),
): Promise<DiscoveryReport> {
  const first = await discoverAt(input, fetchPage, clock);
  if (
    first.platform !== null ||
    first.error === "INVALID_URL" ||
    first.error === "UNSUPPORTED_PLATFORM"
  )
    return first;
  // Robots and home requests are not redirected; retry the www/apex sibling once.
  const host = new URL(first.origin).hostname;
  const sibling = await discoverAt(
    host.startsWith("www.") ? host.slice(4) : `www.${host}`,
    fetchPage,
    clock,
  );
  return sibling.platform !== null ? sibling : first;
}

async function discoverAt(
  input: string,
  fetchPage: PageFetcher,
  clock: () => Date,
): Promise<DiscoveryReport> {
  const origin = normalizeOrigin(input);
  if (origin === null)
    return { origin: input, platform: null, dashainOffers: 0, sample: [], error: "INVALID_URL" };
  try {
    const home = await fetchPage(`${origin}/`, draft(origin, undefined));
    if (home.status !== 200)
      return { origin, platform: null, dashainOffers: 0, sample: [], error: `HTTP_${home.status}` };
    const platform = detectPlatform(home.body);
    if (platform === null)
      return { origin, platform, dashainOffers: 0, sample: [], error: "UNSUPPORTED_PLATFORM" };
    const entry = draft(origin, platform);
    const result = await createStorefrontAdapter(entry.id, fetchPage, clock).scan(entry);
    if (!result.ok)
      return { origin, platform, dashainOffers: 0, sample: [], error: result.reason, entry };
    return {
      origin,
      platform,
      dashainOffers: result.offers.length,
      sample: result.offers.slice(0, 5).map((offer) => offer.title),
      entry,
    };
  } catch (error) {
    return {
      origin,
      platform: null,
      dashainOffers: 0,
      sample: [],
      error: error instanceof Error ? error.message.slice(0, 200) : "FETCH_FAILED",
    };
  }
}

/** Shop domains from a Brave Search API response, excluding marketplaces and social sites. */
export function searchResultOrigins(body: unknown): string[] {
  const results =
    body && typeof body === "object" && "web" in body
      ? ((body as { web?: { results?: unknown } }).web?.results ?? [])
      : [];
  const skip =
    /(?:^|\.)(?:facebook|instagram|tiktok|youtube|twitter|x|linkedin|reddit|wikipedia|daraz|google|pinterest)\.[a-z.]+$/;
  return [
    ...new Set(
      (Array.isArray(results) ? results : [])
        .map((r: unknown) =>
          r && typeof r === "object" && "url" in r && typeof r.url === "string" ? r.url : "",
        )
        .map(normalizeOrigin)
        .filter((o): o is string => o !== null && !skip.test(new URL(o).hostname)),
    ),
  ];
}

export const DISCOVERY_QUERIES = [
  '"dashain offer" shop online Nepal',
  '"dashain sale" online store Nepal',
  '"dashain combo" Nepal',
  '"dashain collection" Nepal',
  "दशैं अफर अनलाइन",
  '"dashain discount" site:.com.np',
] as const;
