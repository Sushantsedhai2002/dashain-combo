export type ChannelKind = "WEBSITE" | "FACEBOOK" | "INSTAGRAM" | "TIKTOK";

export type SourceStatus = "CANDIDATE" | "ACTIVE" | "PAUSED" | "RETIRED";

export type SourceChannel = Readonly<{
  kind: ChannelKind;
  url: string;
  isEnabled: boolean;
}>;

export type VerificationEvidence = Readonly<{
  verifiedAt: string;
  evidenceUrl: string;
}>;

export type SourceDefinition = Readonly<{
  id: string;
  displayName: string;
  status: SourceStatus;
  supportedMarkets: readonly ["NP"];
  marketSegments: readonly string[];
  channels: readonly SourceChannel[];
  verification: VerificationEvidence | null;
}>;

export type RegistryIssue = Readonly<{
  code:
    | "INVALID_SCHEMA"
    | "DUPLICATE_SOURCE_ID"
    | "DUPLICATE_CHANNEL_URL"
    | "ACTIVE_SOURCE_NOT_VERIFIED"
    | "ACTIVE_SOURCE_WITHOUT_CHANNEL";
  path: string;
  message: string;
  sourceId?: string;
}>;

export type RegistryResult =
  | Readonly<{ ok: true; sources: readonly SourceDefinition[] }>
  | Readonly<{ ok: false; issues: readonly RegistryIssue[] }>;

export { getActiveSources } from "./get-active-sources.ts";
export { parseSourceRegistry } from "./parse-source-registry.ts";
