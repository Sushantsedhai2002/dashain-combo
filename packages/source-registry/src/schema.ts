import { z } from "zod";

const SOURCE_STATUSES = ["CANDIDATE", "ACTIVE", "PAUSED", "RETIRED"] as const;
const CHANNEL_KINDS = ["WEBSITE", "FACEBOOK", "INSTAGRAM", "TIKTOK"] as const;
const httpsUrl = z
  .url()
  .regex(/^https:\/\//i)
  .refine((value) => !/^https:\/\/[^/?#]*@/i.test(value));

export const SourceChannelSchema = z
  .strictObject({
    kind: z.enum(CHANNEL_KINDS),
    url: httpsUrl,
    isEnabled: z.boolean(),
  })
  .readonly();

export const VerificationEvidenceSchema = z
  .strictObject({
    verifiedAt: z.iso.datetime({ offset: true }),
    evidenceUrl: httpsUrl,
  })
  .readonly();

export const SourceDefinitionSchema = z
  .strictObject({
    id: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    displayName: z.string().trim().min(1),
    status: z.enum(SOURCE_STATUSES),
    supportedMarkets: z.tuple([z.literal("NP")]).readonly(),
    marketSegments: z.array(z.string().trim().min(1)).min(1).readonly(),
    channels: z.array(SourceChannelSchema).readonly(),
    verification: VerificationEvidenceSchema.nullable(),
    campaignEntryPoints: z.array(httpsUrl).max(20).readonly().optional(),
    requestTimeoutMs: z.number().int().min(1_000).max(30_000).optional(),
    socialPromotionFeeds: z.array(httpsUrl).max(5).readonly().optional(),
    // Reviewed anonymous first-party campaign/product/seller JSON endpoints.
    // Exact URLs only; this does not authorize arbitrary APIs or authenticated data.
    publicEvidenceFeeds: z.array(httpsUrl).max(5).readonly().optional(),
    // Generic e-commerce platform collection: the worker reads the platform's anonymous
    // public catalogue endpoints on the enabled website origin and keeps Dashain items only.
    storefront: z
      .strictObject({ platform: z.enum(["SHOPIFY", "WOOCOMMERCE"]) })
      .readonly()
      .optional(),
    capabilities: z
      .array(z.enum(["CAMPAIGN", "PRODUCT", "DOCUMENT", "REVALIDATION"]))
      .readonly()
      .optional(),
  })
  .superRefine((source, ctx) => {
    for (const url of [
      ...(source.campaignEntryPoints ?? []),
      ...(source.socialPromotionFeeds ?? []),
      ...(source.publicEvidenceFeeds ?? []),
    ]) {
      if (
        !source.channels.some(
          (channel) =>
            channel.kind === "WEBSITE" &&
            channel.isEnabled &&
            channel.url.split("/")[2] === url.split("/")[2],
        )
      )
        ctx.addIssue({
          code: "custom",
          path: ["campaignEntryPoints", "socialPromotionFeeds", "publicEvidenceFeeds"],
          message: "Collection entry point must use an enabled website origin",
        });
    }
    if (
      source.storefront &&
      !source.channels.some((channel) => channel.kind === "WEBSITE" && channel.isEnabled)
    )
      ctx.addIssue({
        code: "custom",
        path: ["storefront"],
        message: "Storefront collection requires an enabled website channel",
      });
    if (
      source.publicEvidenceFeeds?.some((url) => url.includes("#")) ||
      new Set(source.publicEvidenceFeeds).size !== (source.publicEvidenceFeeds?.length ?? 0)
    )
      ctx.addIssue({
        code: "custom",
        path: ["publicEvidenceFeeds"],
        message: "Public evidence feeds must be distinct URLs without fragments",
      });
  })
  .readonly();

export const SourceRegistrySchema = z.array(SourceDefinitionSchema).readonly();
