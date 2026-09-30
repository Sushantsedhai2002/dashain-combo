import type { SourceDefinition } from "@dashain-offer/source-registry";
import type { PublishOfferInput } from "../../src/contract.ts";

export const activeSource: SourceDefinition = {
  id: "daraz-nepal",
  displayName: "Daraz Nepal",
  status: "ACTIVE",
  supportedMarkets: ["NP"],
  marketSegments: ["GENERAL_RETAIL"],
  channels: [
    {
      kind: "WEBSITE",
      url: "https://www.daraz.com.np/",
      isEnabled: true,
    },
  ],
  verification: {
    verifiedAt: "2026-09-01T00:00:00Z",
    evidenceUrl: "https://www.daraz.com.np/",
  },
};

export const textOnlyOffer: PublishOfferInput = {
  source: activeSource,
  sourceOfferKey: "dashain-sale-2026",
  title: "Dashain sale up to 50%",
  category: "GENERAL_RETAIL",
  destinationUrl: "https://www.daraz.com.np/dashain-sale",
};
