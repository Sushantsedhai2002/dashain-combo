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
