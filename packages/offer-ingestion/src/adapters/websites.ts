import { createSaraAdapter } from "./sara-worldwide.ts";
import { createS3TechAdapter } from "./s3-tech.ts";
import { createCgDigitalAdapter } from "./cg-digital.ts";
import { createEvoStoreAdapter, type PageFetcher } from "./evostore.ts";
import { createIttiAdapter } from "./itti.ts";
import { createKhaltiAdapter } from "./khalti.ts";
import { createYamahaAdapter } from "./yamaha.ts";
import { createFonepayAdapter } from "./fonepay.ts";
import { createOlizAdapter } from "./oliz.ts";
import { createDarazAdapter } from "./daraz.ts";
import { createListingAdapter, LISTING_PROFILES } from "./listings.ts";
import type { SourceAdapter } from "../runner.ts";
import type { SourceDefinition } from "@dashain-offer/source-registry";
import { createSocialFeedAdapter, withSocialFeed } from "./social-feed.ts";
import { createItMonsterAdapter } from "./it-monster.ts";
import { createDatedCampaignAdapter, DATED_CAMPAIGNS } from "./dated-campaigns.ts";
import { createSbFurnitureAdapter } from "./sb-furniture.ts";
import { createSukumartAdapter } from "./sukumart.ts";
import { createSabkoAdapter } from "./sabko-phone.ts";
import { createDealayoAdapter } from "./dealayo.ts";
import { createMaskQueenAdapter } from "./mask-queen.ts";
import { createMypowerAdapter } from "./mypower.ts";
import { createShofyAdapter } from "./shofy.ts";
import { createGiftmanduAdapter } from "./giftmandu.ts";
import { createMaakeAdapter } from "./maake.ts";
import { createMuditaAdapter } from "./mudita.ts";
import { createAcGharAdapter } from "./ac-ghar.ts";
import { createWildYakAdapter } from "./wild-yak.ts";
import { createInfotechsAdapter } from "./infotechs.ts";

export function createWebsiteAdapters(
  fetchPage: PageFetcher,
  sources: readonly SourceDefinition[] = [],
  clock = () => new Date(),
): readonly SourceAdapter[] {
  const websites = [
    createCgDigitalAdapter(fetchPage, clock),
    createItMonsterAdapter(fetchPage, clock),
    createSbFurnitureAdapter(fetchPage, clock),
    createSukumartAdapter(fetchPage, clock),
    createInfotechsAdapter(fetchPage, clock),
    createWildYakAdapter(fetchPage, clock),
    createAcGharAdapter(fetchPage, clock),
    createMuditaAdapter(fetchPage, clock),
    createSabkoAdapter(fetchPage, clock),
    createDealayoAdapter(fetchPage, clock),
    createMaskQueenAdapter(fetchPage, clock),
    createMaakeAdapter(fetchPage, clock),
    createGiftmanduAdapter(fetchPage, clock),
    createShofyAdapter(fetchPage, clock),
    createMypowerAdapter(fetchPage, clock),
    createS3TechAdapter(fetchPage, clock),
    createSaraAdapter(fetchPage, clock),
    ...DATED_CAMPAIGNS.map((profile) => createDatedCampaignAdapter(profile, fetchPage, clock)),
    createEvoStoreAdapter(fetchPage),
    createIttiAdapter(fetchPage),
    createDarazAdapter(fetchPage),
    createOlizAdapter(fetchPage),
    createFonepayAdapter(fetchPage),
    createYamahaAdapter(fetchPage),
    createKhaltiAdapter(fetchPage),
    ...LISTING_PROFILES.map((profile) => createListingAdapter(profile, fetchPage)),
  ];
  return [
    ...websites.map((adapter) => withSocialFeed(adapter, fetchPage)),
    ...sources
      .filter(
        (source) =>
          source.socialPromotionFeeds?.length &&
          !websites.some((adapter) => adapter.sourceId === source.id),
      )
      .map((source) => createSocialFeedAdapter(source.id, fetchPage)),
  ];
}
