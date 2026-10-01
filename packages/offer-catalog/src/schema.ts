import {
  DiscoverySchema,
  OFFER_TYPES,
  parseBudgetIntent,
  type OfferDiscovery,
  type OfferType,
} from "./discovery.ts";
import { parseSourceRegistry, type SourceDefinition } from "@dashain-offer/source-registry";
import { z } from "zod";

import {
  OFFER_CATEGORIES,
  OFFER_SORTS,
  type CatalogIssue,
  type CatalogResult,
  type Money,
  type OfferCategory,
  type OfferSort,
  type SourceTime,
} from "./contract.ts";

const SOURCE_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SOURCE_ID_MAXIMUM = 100;
const SELLER_DISPLAY_NAME_MAXIMUM = 300;
const CURRENCY_PATTERN = /^[A-Z]{3}$/;

const requiredText = (maximum: number) => z.string().trim().min(1).max(maximum);
const optionalText = (maximum: number) =>
  z
    .string()
    .trim()
    .min(1)
    .max(maximum)
    .nullish()
    .transform((value) => value ?? null);

const HttpsUrlSchema = z.url().max(2_048).startsWith("https://");
const SourceIdSchema = z.string().max(SOURCE_ID_MAXIMUM).regex(SOURCE_ID_PATTERN);
const CurrencySchema = z.string().regex(CURRENCY_PATTERN);
const InstantSchema = z.iso.datetime({ offset: true });

function isCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (match === null) return false;

  const yearText = match[1];
  const monthText = match[2];
  const dayText = match[3];
  if (yearText === undefined || monthText === undefined || dayText === undefined) {
    return false;
  }

  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

const KathmanduDateSchema = z.string().refine(isCalendarDate, {
  message: "Invalid Kathmandu calendar date",
});

const SourceTimeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("INSTANT"), value: InstantSchema }).strict(),
  z
    .object({
      kind: z.literal("KATHMANDU_DATE"),
      value: KathmanduDateSchema,
    })
    .strict(),
]);

const MoneySchema = z
  .object({
    currency: CurrencySchema,
    amountMinor: z.number().int().nonnegative().safe(),
  })
  .strict();

const PublishOfferSchema = z
  .object({
    discovery: DiscoverySchema.nullish().transform((value) => value ?? null),
    source: z.unknown(),
    sourceOfferKey: requiredText(200),
    title: requiredText(300),
    summary: optionalText(2_000),
    productName: optionalText(200),
    brandName: optionalText(200),
    category: z.enum(OFFER_CATEGORIES),
    imageUrl: HttpsUrlSchema.nullish().transform((value) => value ?? null),
    destinationUrl: HttpsUrlSchema,
    originalPrice: MoneySchema.nullish().transform((value) => value ?? null),
    salePrice: MoneySchema.nullish().transform((value) => value ?? null),
    discountPercent: z
      .number()
      .min(0)
      .max(100)
      .nullish()
      .transform((value) => value ?? null),
    discountLabel: optionalText(500),
    terms: optionalText(5_000),
    sourcePublishedAt: SourceTimeSchema.nullish().transform((value) => value ?? null),
    validityStartsAt: InstantSchema.nullish().transform((value) => value ?? null),
    explicitValidityEnd: SourceTimeSchema.nullish().transform((value) => value ?? null),
  })
  .strict()
  .superRefine((value, context) => {
    if (
      value.originalPrice !== null &&
      value.salePrice !== null &&
      value.originalPrice.currency !== value.salePrice.currency
    ) {
      context.addIssue({
        code: "custom",
        path: ["salePrice", "currency"],
        message: "Sale and original prices must use the same currency",
      });
    }

    if (
      value.originalPrice !== null &&
      value.salePrice !== null &&
      value.originalPrice.currency === value.salePrice.currency &&
      value.salePrice.amountMinor > value.originalPrice.amountMinor
    ) {
      context.addIssue({
        code: "custom",
        path: ["salePrice", "amountMinor"],
        message: "Sale price cannot exceed original price",
      });
    }
  });

const WithdrawOfferSchema = z
  .object({
    sourceId: SourceIdSchema,
    sourceOfferKey: requiredText(200),
  })
  .strict();

const OfferIdSchema = z.uuid();

const SearchOffersSchema = z
  .object({
    model: requiredText(200).optional(),
    variant: requiredText(200).optional(),
    scope: z.enum(["ALL", "DASHAIN"]).default("ALL"),
    season: z.number().int().min(2000).max(2200).optional(),
    brands: z.array(requiredText(200)).max(50).default([]),
    offerTypes: z.array(z.enum(OFFER_TYPES)).default([]),
    availability: z.literal("IN_STOCK").optional(),
    minPriceMinor: z.number().int().nonnegative().safe().optional(),
    maxPriceMinor: z.number().int().nonnegative().safe().optional(),
    text: z
      .string()
      .trim()
      .max(200)
      .nullish()
      .transform((value) => (value === undefined || value === "" ? null : value)),
    categories: z
      .array(z.enum(OFFER_CATEGORIES))
      .max(OFFER_CATEGORIES.length)
      .default([])
      .transform((values) => [...new Set(values)]),
    sourceIds: z
      .array(SourceIdSchema)
      .max(50)
      .default([])
      .transform((values) => [...new Set(values)]),
    currency: CurrencySchema.nullish().transform((value) => value ?? null),
    sort: z.enum(OFFER_SORTS).optional(),
    limit: z.number().int().min(1).max(100).default(20),
    cursor: z
      .string()
      .trim()
      .min(1)
      .max(2_048)
      .nullish()
      .transform((value) => value ?? null),
  })
  .strict();

export type NormalizedPublishOfferInput = Readonly<{
  discovery: OfferDiscovery | null;
  source: SourceDefinition;
  sourceOfferKey: string;
  title: string;
  summary: string | null;
  productName: string | null;
  brandName: string | null;
  category: OfferCategory;
  imageUrl: string | null;
  destinationUrl: string;
  originalPrice: Money | null;
  salePrice: Money | null;
  discountPercent: number | null;
  discountLabel: string | null;
  terms: string | null;
  sourcePublishedAt: SourceTime | null;
  validityStartsAt: string | null;
  explicitValidityEnd: SourceTime | null;
}>;

export type NormalizedWithdrawOfferInput = Readonly<{
  sourceId: string;
  sourceOfferKey: string;
}>;

export type NormalizedSearchOffersQuery = Readonly<{
  model?: string | undefined;
  variant?: string | undefined;
  scope: "ALL" | "DASHAIN";
  season?: number | undefined;
  brands: readonly string[];
  offerTypes: readonly OfferType[];
  availability?: "IN_STOCK" | undefined;
  minPriceMinor?: number | undefined;
  maxPriceMinor?: number | undefined;
  text: string | null;
  categories: readonly OfferCategory[];
  sourceIds: readonly string[];
  currency: string | null;
  sort: OfferSort;
  limit: number;
  cursor: string | null;
}>;

function pathText(path: readonly PropertyKey[]): string {
  return path.map(String).join(".");
}

function issuesFromZod(error: z.ZodError): readonly CatalogIssue[] {
  const issues: CatalogIssue[] = [];

  for (const issue of error.issues) {
    if (issue.code === "unrecognized_keys") {
      for (const key of issue.keys) {
        issues.push({
          code: "INVALID_INPUT",
          path: pathText([...issue.path, key]),
          message: "Unexpected input field",
        });
      }
    } else {
      issues.push({
        code: "INVALID_INPUT",
        path: pathText(issue.path),
        message: issue.message,
      });
    }
  }

  return Object.freeze(
    issues.sort((left, right) =>
      left.path === right.path
        ? left.message.localeCompare(right.message)
        : left.path.localeCompare(right.path),
    ),
  );
}

function invalid<T>(issues: readonly CatalogIssue[]): CatalogResult<T> {
  return Object.freeze({
    ok: false,
    issues: Object.freeze(issues.map((issue) => Object.freeze({ ...issue }))),
  });
}

function valid<T>(value: T): CatalogResult<T> {
  return Object.freeze({ ok: true, value });
}

export function parsePublishOfferInput(input: unknown): CatalogResult<NormalizedPublishOfferInput> {
  const parsed = PublishOfferSchema.safeParse(input);
  if (!parsed.success) return invalid(issuesFromZod(parsed.error));

  const sourceResult = parseSourceRegistry([parsed.data.source]);
  if (!sourceResult.ok) {
    return invalid(
      sourceResult.issues.map((issue) => ({
        code: "INVALID_INPUT",
        path: issue.path.replace(/^\$\[0\]/, "source"),
        message: "Source does not match the source-registry contract",
      })),
    );
  }

  const source = sourceResult.sources[0];
  if (source === undefined) {
    return invalid([
      {
        code: "INVALID_INPUT",
        path: "source",
        message: "Source is required",
      },
    ]);
  }

  const sourceIssues: CatalogIssue[] = [];
  if (source.displayName.length > SELLER_DISPLAY_NAME_MAXIMUM) {
    sourceIssues.push({
      code: "INVALID_INPUT",
      path: "source.displayName",
      message: `Source display name must contain at most ${SELLER_DISPLAY_NAME_MAXIMUM} characters`,
    });
  }
  if (source.id.length > SOURCE_ID_MAXIMUM) {
    sourceIssues.push({
      code: "INVALID_INPUT",
      path: "source.id",
      message: `Source ID must contain at most ${SOURCE_ID_MAXIMUM} characters`,
    });
  }
  if (source.status !== "ACTIVE") {
    sourceIssues.push({
      code: "SOURCE_NOT_ACTIVE",
      path: "source.status",
      message: "Source must be ACTIVE",
    });
  }
  const discovery = parsed.data.discovery;
  if (discovery !== null) {
    const approved = (url: string) =>
      source.channels.some(
        (channel) =>
          channel.kind === "WEBSITE" &&
          channel.isEnabled &&
          new URL(channel.url).origin === new URL(url).origin,
      );
    if (
      discovery.evidence.some((evidence) => !approved(evidence.url)) ||
      (discovery.campaign && !approved(discovery.campaign.evidenceUrl))
    )
      sourceIssues.push({
        code: "INVALID_INPUT",
        path: "discovery.evidence",
        message: "Evidence must use an approved source origin",
      });
    if (discovery.qualification === "QUALIFIED") {
      const fields = new Set(discovery.evidence.flatMap((entry) => entry.fields));
      for (const field of ["salePrice", "originalPrice"] as const)
        if (parsed.data[field] !== null && !fields.has(field))
          sourceIssues.push({
            code: "INVALID_INPUT",
            path: `discovery.evidence`,
            message: `Missing evidence for ${field}`,
          });
      if (discovery.offerType === "BUNDLE" && discovery.components.length < 2)
        sourceIssues.push({
          code: "INVALID_INPUT",
          path: "discovery.components",
          message: "A bundle needs at least two sourced components",
        });
    }
  }
  if (sourceIssues.length > 0) return invalid(sourceIssues);

  return valid(Object.freeze({ ...parsed.data, source }));
}

export function parseWithdrawOfferInput(
  input: unknown,
): CatalogResult<NormalizedWithdrawOfferInput> {
  const parsed = WithdrawOfferSchema.safeParse(input);
  return parsed.success ? valid(Object.freeze(parsed.data)) : invalid(issuesFromZod(parsed.error));
}

export function parseOfferId(input: unknown): CatalogResult<string> {
  const parsed = OfferIdSchema.safeParse(input);
  return parsed.success
    ? valid(parsed.data)
    : invalid(issuesFromZod(parsed.error).map((issue) => ({ ...issue, path: "id" })));
}

export function parseSearchOffersQuery(input: unknown): CatalogResult<NormalizedSearchOffersQuery> {
  const parsed = SearchOffersSchema.safeParse(input);
  if (!parsed.success) return invalid(issuesFromZod(parsed.error));

  if (
    (parsed.data.sort === "PRICE_ASC" || parsed.data.sort === "PRICE_DESC") &&
    parsed.data.currency === null
  ) {
    return invalid([
      {
        code: "INVALID_INPUT",
        path: "currency",
        message: "Currency is required for price sorting",
      },
    ]);
  }

  const intent = parseBudgetIntent(parsed.data.text ?? "");
  const maxPriceMinor = parsed.data.maxPriceMinor ?? intent.maxPriceMinor ?? undefined;
  if (
    parsed.data.minPriceMinor !== undefined &&
    maxPriceMinor !== undefined &&
    parsed.data.minPriceMinor > maxPriceMinor
  )
    return invalid([
      {
        code: "INVALID_INPUT",
        path: "maxPriceMinor",
        message: "Maximum budget must be at least minimum budget",
      },
    ]);
  if (
    (parsed.data.minPriceMinor !== undefined || maxPriceMinor !== undefined) &&
    parsed.data.currency === null
  )
    return invalid([
      {
        code: "INVALID_INPUT",
        path: "currency",
        message: "Currency is required for budget filtering",
      },
    ]);
  return valid(
    Object.freeze({
      ...parsed.data,
      text: intent.text || null,
      sort: parsed.data.sort ?? (intent.text ? "RELEVANCE" : "NEWEST"),
      ...(maxPriceMinor !== undefined ? { maxPriceMinor } : {}),
    }),
  );
}
