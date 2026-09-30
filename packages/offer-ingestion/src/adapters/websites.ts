import { createEvoStoreAdapter, type PageFetcher } from "./evostore.ts";
import { createIttiAdapter } from "./itti.ts";
import { createDarazAdapter } from "./daraz.ts";
import { createListingAdapter, LISTING_PROFILES } from "./listings.ts";
import type { SourceAdapter } from "../runner.ts";

export function createWebsiteAdapters(fetchPage: PageFetcher): readonly SourceAdapter[] {
  return [
    createEvoStoreAdapter(fetchPage),
    createIttiAdapter(fetchPage),
    createDarazAdapter(fetchPage),
    ...LISTING_PROFILES.map((profile) => createListingAdapter(profile, fetchPage)),
  ];
}
