import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

import type { SourceDefinition } from "@dashain-offer/source-registry";
import type { PageFetcher } from "../adapters/evostore.ts";
import type { Presence } from "../runner.ts";
import { requestPinned, type TransportResult } from "./pinned-request.ts";

const TIMEOUT_MS = 10_000;
// Recorded SB Furniture campaign pages are about 2.2 MB. Keep a bounded 3 MB ceiling.
const MAX_BYTES = 3_000_000;
const blocked = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blocked.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["64:ff9b:1::", 48],
  ["100::", 64],
  ["2001::", 23],
  ["2001:db8::", 32],
  ["2002::", 16],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

export function isPublicIpAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 6 && address.toLowerCase().startsWith("::ffff:")) return false;
  return family !== 0 && !blocked.check(address, family === 4 ? "ipv4" : "ipv6");
}

type SafeFetchDependencies = Readonly<{
  resolveHostname(hostname: string): Promise<readonly string[]>;
  request(
    url: string,
    addresses: readonly string[],
    timeoutMs: number,
    maxBytes: number,
  ): Promise<TransportResult>;
}>;

async function resolveHostname(hostname: string): Promise<readonly string[]> {
  return (await lookup(hostname, { all: true })).map((record) => record.address);
}

export function createSafePageFetcher(
  dependencies: SafeFetchDependencies = { resolveHostname, request: requestPinned },
): PageFetcher {
  return async (rawUrl, source) => {
    const url = new URL(rawUrl);
    if (
      url.protocol !== "https:" ||
      url.username !== "" ||
      url.password !== "" ||
      !source.channels.some(
        (channel) =>
          channel.kind === "WEBSITE" &&
          channel.isEnabled &&
          new URL(channel.url).origin === url.origin,
      )
    ) {
      throw new Error("URL outside approved website origin");
    }
    const timeoutMs = source.requestTimeoutMs ?? TIMEOUT_MS;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 1_000 || timeoutMs > 30_000)
      throw new Error("Invalid website request timeout");
    const addresses = await dependencies.resolveHostname(url.hostname);
    if (addresses.length === 0 || addresses.some((address) => !isPublicIpAddress(address))) {
      throw new Error("Unsafe website address");
    }
    const response = await dependencies.request(url.href, addresses, timeoutMs, MAX_BYTES);
    if (
      response.body.length > MAX_BYTES ||
      (response.status === 200 &&
        !(url.pathname === "/robots.txt"
          ? /^text\/plain(?:;|$)/i.test(response.contentType)
          : source.socialPromotionFeeds?.includes(url.href)
            ? /^application\/json(?:;|$)/i.test(response.contentType)
            : /^(?:text\/html|application\/xhtml\+xml)(?:;|$)/i.test(response.contentType)))
    ) {
      throw new Error("Unsupported website response");
    }
    return { status: response.status, body: response.body };
  };
}

export async function checkOfferPresence(
  url: string,
  source: SourceDefinition,
  fetchPage: PageFetcher,
): Promise<Presence> {
  try {
    const response = await fetchPage(url, source);
    if (response.status === 404 || response.status === 410) return "REMOVED";
    return response.status === 200 ? "PRESENT" : "UNKNOWN";
  } catch {
    return "UNKNOWN";
  }
}
