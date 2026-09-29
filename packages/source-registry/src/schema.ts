import { z } from "zod";

const SOURCE_STATUSES = ["CANDIDATE", "ACTIVE", "PAUSED", "RETIRED"] as const;
const CHANNEL_KINDS = ["WEBSITE", "FACEBOOK", "INSTAGRAM", "TIKTOK"] as const;
const httpsUrl = z.url().regex(/^https:\/\//i);

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
  })
  .readonly();

export const SourceRegistrySchema = z.array(SourceDefinitionSchema).readonly();
