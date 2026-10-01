import type { Offer } from "./contract.ts";

export const DASHAIN_PRODUCT_TYPES = [
  "PRODUCT_DISCOUNT",
  "GIFT_WITH_PURCHASE",
  "BUNDLE",
  "SERVICE_BENEFIT",
] as const;
export const DASHAIN_PRICE_EVIDENCE = [
  "campaign",
  "membership",
  "product",
  "salePrice",
  "originalPrice",
] as const;
export const DASHAIN_FRESHNESS_MS = 48 * 3600000;

/** The public collection requires an evidenced product price, independently of gifts. */
export function isCurrentDashainDiscount(offer: Offer, now: Date = new Date()): boolean {
  const d = offer.discovery;
  const campaign = d?.campaign;
  if (!d || !campaign || !d.product || d.qualification !== "QUALIFIED") return false;
  if (!(DASHAIN_PRODUCT_TYPES as readonly string[]).includes(d.offerType)) return false;
  const season = Number(
    new Intl.DateTimeFormat("en", {
      timeZone: "Asia/Kathmandu",
      year: "numeric",
    }).format(now),
  );
  const time = now.getTime();
  const recent = (value: string | null) =>
    value !== null &&
    Date.parse(value) > time - DASHAIN_FRESHNESS_MS &&
    Date.parse(value) <= time + 60000;
  const fields = new Set(d.evidence.flatMap((e) => (recent(e.fetchedAt) ? e.fields : [])));
  return (
    campaign.festivals.includes("DASHAIN") &&
    campaign.seasonAD === season &&
    recent(d.lastVerifiedAt) &&
    recent(d.priceObservedAt) &&
    DASHAIN_PRICE_EVIDENCE.every((field) => fields.has(field)) &&
    d.availability !== "OUT_OF_STOCK" &&
    offer.originalPrice !== null &&
    offer.salePrice !== null &&
    offer.originalPrice.currency === "NPR" &&
    offer.salePrice.currency === "NPR" &&
    offer.salePrice.amountMinor > 0 &&
    offer.salePrice.amountMinor < offer.originalPrice.amountMinor &&
    offer.withdrawnAt === null &&
    Date.parse(offer.expiresAt) > time &&
    (offer.validityStartsAt === null || Date.parse(offer.validityStartsAt) <= time) &&
    (campaign.startsAt === null || Date.parse(campaign.startsAt) <= time) &&
    (campaign.endsAt === null || Date.parse(campaign.endsAt) > time)
  );
}
