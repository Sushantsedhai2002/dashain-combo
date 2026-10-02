import { createHash } from "node:crypto";
import { UNKNOWN_ELIGIBILITY, type OfferType } from "@dashain-offer/offer-catalog";
import type { SourceDefinition } from "@dashain-offer/source-registry";
import type { CandidateOffer, ScanResult, SourceAdapter } from "../runner.ts";
import type { PageFetcher } from "./evostore.ts";
import { inferProductDetails } from "./product-details.ts";

// Generic collectors for the two platforms most Nepali online shops run on. They read only
// the platforms' anonymous public catalogue JSON, on the source's enabled website origin:
// Shopify: https://shopify.dev/docs/storefronts/themes/architecture/templates/product#json
// WooCommerce Store API: https://developer.woocommerce.com/docs/apis/store-api/resources-endpoints/products
// Membership comes from the merchant's own Dashain labelling of a collection, category,
// tag or product title; product descriptions alone never establish membership.

export const DASHAIN_LABEL =
  /dashain|dasain|dashai|dasai|दशैं|दशैँ|दशै|vijaya\s*dashami|bijaya\s*dashami/i;
const COMBO =
  /\b(?:combo|bundle|hamper|gift\s*(?:set|box|pack)|set\s+of|\d+\s*in\s*1|pack\s+of)\b/i;
const MAX_OFFERS = 500;
// Shopify product JSON includes full descriptions; 100 per page stays under the 3 MB fetch cap.
const SHOPIFY_PAGE = 100;
const MAX_PAGES = 6;
const MAX_LABELS = 5;

type Json = Record<string, unknown>;
function record(v: unknown): v is Json {
  return !!v && typeof v === "object" && !Array.isArray(v);
}
function parse(body: string): unknown {
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return undefined;
  }
}
function text(v: unknown, max = 300): string | null {
  return typeof v === "string" && v.trim() ? v.trim().replace(/\s+/g, " ").slice(0, max) : null;
}
function hash(body: string): string {
  return createHash("sha256").update(body).digest("hex");
}
function kathmanduYear(instant: string): number {
  return Number(
    new Intl.DateTimeFormat("en", { timeZone: "Asia/Kathmandu", year: "numeric" }).format(
      new Date(instant),
    ),
  );
}
/** A label naming another year ("Dashain 2025", "दशैं 2082") belongs to another season. */
export function isCurrentSeasonLabel(label: string, seasonAD: number): boolean {
  const digits = label.replace(/[०-९]/g, (d) => String("०१२३४५६७८९".indexOf(d)));
  // Dashain (Asoj/Kartik) always falls in BS year AD + 57.
  return [...digits.matchAll(/(?<!\d)(20\d{2})(?!\d)/g)]
    .map((m) => Number(m[1]))
    .every((year) => year === seasonAD || year === seasonAD + 57);
}
export function storefrontOrigin(source: SourceDefinition): string | null {
  const site = source.channels.find((channel) => channel.kind === "WEBSITE" && channel.isEnabled);
  return site ? new URL(site.url).origin : null;
}
/** Paths the safe fetcher may read as JSON for a registered storefront platform. */
export function isStorefrontApiUrl(source: SourceDefinition, raw: string): boolean {
  const platform = source.storefront?.platform;
  const origin = storefrontOrigin(source);
  if (!platform || origin === null) return false;
  const url = new URL(raw);
  if (url.origin !== origin) return false;
  return platform === "SHOPIFY"
    ? /^\/(?:collections\.json|products\.json|collections\/[a-z0-9][a-z0-9-]{0,200}\/products\.json)$/.test(
        url.pathname,
      )
    : /^\/wp-json\/wc\/store\/v1\/products(?:\/categories|\/tags)?$/.test(url.pathname);
}

type Item = Readonly<{
  productKey: string;
  title: string;
  model: string;
  variant: string;
  url: string;
  imageUrl: string | null;
  saleMinor: number;
  originalMinor: number | null;
  inStock: boolean;
  tags: readonly string[];
  attributes: Record<string, string>;
}>;
type Membership = Readonly<{
  label: string;
  evidenceUrl: string;
  pageUrl: string;
  pageBody: string;
  how: "collection" | "category" | "tag" | "title";
}>;

function candidate(
  source: SourceDefinition,
  item: Item,
  membership: Membership,
  fetchedAt: string,
  seasonAD: number,
): CandidateOffer {
  const discounted = item.originalMinor !== null && item.originalMinor > item.saleMinor;
  // The catalog requires a bundle's components. Only titles that list them ("A + B",
  // "A | B") become bundles; other combo wording stays a discount or festive listing.
  const parts = item.title
    .replace(/\(([^)]*)\)/g, " ")
    .split(/\s+(?:\+|&|with)\s+|\s*\|\s*|\s+\+\s*/i)
    .map((part) => part.trim())
    .filter((part) => part.length > 1);
  const bundle =
    COMBO.test(`${item.title} ${item.tags.join(" ")}`) && parts.length >= 2 && parts.length <= 10;
  const offerType: OfferType = bundle
    ? "BUNDLE"
    : discounted
      ? "PRODUCT_DISCOUNT"
      : "FESTIVE_LISTING";
  const components = bundle
    ? parts.map((description, index) => ({
        description: description.slice(0, 2000),
        quantity: null,
        unit: null,
        role: index === 0 ? ("MAIN_ITEM" as const) : ("INCLUDED_ITEM" as const),
      }))
    : [{ description: item.title, quantity: 1, unit: "item", role: "MAIN_ITEM" as const }];
  const campaignKey = `${source.id}-dashain-${seasonAD}`;
  const details = inferProductDetails(item.title, "GENERAL_RETAIL");
  const price = (minor: number) => `NPR ${minor / 100}`;
  return {
    sourceOfferKey: `${campaignKey}:${item.productKey}`,
    title: item.title,
    productName: item.title,
    brandName: details.brandName,
    category: details.category,
    imageUrl: item.imageUrl,
    destinationUrl: item.url,
    originalPrice: discounted ? { currency: "NPR", amountMinor: item.originalMinor! } : null,
    salePrice: { currency: "NPR", amountMinor: item.saleMinor },
    discountPercent: discounted
      ? Math.round((1 - item.saleMinor / item.originalMinor!) * 100)
      : null,
    explicitValidityEnd: null,
    terms: null,
    discovery: {
      offerType,
      qualification: "QUALIFIED",
      ruleVersion: "storefront-dashain-v1",
      reasons: [
        `MERCHANT_DASHAIN_${membership.how.toUpperCase()}_LABEL`,
        "CURRENT_SEASON_LABEL",
        "ANONYMOUS_PLATFORM_CATALOGUE",
        ...(discounted ? ["PLATFORM_COMPARE_AT_PRICE_HIGHER"] : ["NO_EVIDENCED_PRICE_CUT"]),
      ],
      campaign: {
        key: campaignKey,
        title: membership.label.slice(0, 200),
        festivals: ["DASHAIN"],
        seasonAD,
        seasonBS: null,
        publishedAt: null,
        startsAt: null,
        endsAt: null,
        originalDateText: null,
        dateCalendar: "UNKNOWN",
        evidenceUrl: membership.evidenceUrl,
        membership: "EXPLICIT_PRODUCT",
      },
      product: {
        key: item.productKey,
        model: item.model,
        variant: item.variant,
        gtin: null,
        attributes: item.attributes,
      },
      merchant: source.displayName,
      availability: item.inStock ? "IN_STOCK" : "OUT_OF_STOCK",
      lastVerifiedAt: fetchedAt,
      priceObservedAt: fetchedAt,
      components,
      eligibility: { ...UNKNOWN_ELIGIBILITY },
      benefits: [],
      evidence: [
        {
          url: membership.pageUrl,
          fetchedAt,
          contentHash: hash(membership.pageBody),
          excerpt:
            `${membership.how} "${membership.label}"; ${item.title}; variant ${item.variant}; price ${price(item.saleMinor)}${discounted ? `; compare-at ${price(item.originalMinor!)}` : ""}`.slice(
              0,
              2000,
            ),
          path: `public ${source.storefront?.platform.toLowerCase()} catalogue JSON; merchant Dashain ${membership.how}`,
          extractorVersion: "storefront-v1",
          fields: [
            "campaign",
            "membership",
            "offerType",
            "product",
            "components",
            "eligibility",
            "salePrice",
            ...(discounted ? ["originalPrice"] : []),
          ],
        },
      ],
    },
  };
}

// ---------- Shopify ----------
function shopifyMinor(v: unknown): number | null {
  if (typeof v !== "string" || !/^\d{1,10}(?:\.\d{1,2})?$/.test(v)) return null;
  const minor = Math.round(Number(v) * 100);
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}
export function shopifyCurrency(home: string): string | null {
  return /Shopify\.currency\s*=\s*\{\s*"active"\s*:\s*"([A-Z]{3})"/.exec(home)?.[1] ?? null;
}
export function shopifyItems(origin: string, product: Json, seasonAD: number): Item[] {
  const title = text(product.title, 300);
  const handle = typeof product.handle === "string" ? product.handle : null;
  if (title === null || handle === null || !/^[a-z0-9][a-z0-9-]{0,200}$/.test(handle)) return [];
  // An unchanged listing from an earlier Dashain is not evidence for this season.
  const touched = [product.updated_at, product.published_at]
    .filter((v): v is string => typeof v === "string" && Number.isFinite(Date.parse(v)))
    .map(kathmanduYear);
  if (!touched.some((year) => year === seasonAD)) return [];
  const tags = Array.isArray(product.tags)
    ? product.tags.filter((t): t is string => typeof t === "string")
    : typeof product.tags === "string"
      ? product.tags.split(",").map((t) => t.trim())
      : [];
  const images = Array.isArray(product.images) ? product.images.filter(record) : [];
  const image = images.find((i) => typeof i.src === "string" && i.src.startsWith("https://"));
  const variants = Array.isArray(product.variants) ? product.variants.filter(record) : [];
  return variants.flatMap((v): Item[] => {
    const sale = shopifyMinor(v.price);
    const compare = shopifyMinor(v.compare_at_price);
    if (sale === null || typeof v.id !== "number" || typeof product.id !== "number") return [];
    const name = text(v.title, 200);
    const variant = name === null || name === "Default Title" ? title : name;
    return [
      {
        productKey: `${product.id}:${v.id}`,
        title: variant === title ? title : `${title} – ${variant}`.slice(0, 300),
        model: handle,
        variant,
        url: `${origin}/products/${handle}?variant=${v.id}`,
        imageUrl: typeof image?.src === "string" ? image.src : null,
        saleMinor: sale,
        originalMinor: compare,
        inStock: v.available !== false,
        tags,
        attributes: Object.fromEntries(
          [
            ["sku", text(v.sku, 200)],
            ["vendor", text(product.vendor, 200)],
            ["productType", text(product.product_type, 200)],
          ].filter((e): e is [string, string] => e[1] !== null),
        ),
      },
    ];
  });
}

async function json(
  fetchPage: PageFetcher,
  source: SourceDefinition,
  url: string,
): Promise<{ body: string; value: unknown } | null> {
  const response = await fetchPage(url, source);
  if (response.status === 404) return null;
  if (response.status !== 200) throw new Error(`HTTP ${response.status}`);
  const value = parse(response.body);
  if (value === undefined) throw new Error("Invalid JSON");
  return { body: response.body, value };
}

async function scanShopify(
  fetchPage: PageFetcher,
  source: SourceDefinition,
  origin: string,
  fetchedAt: string,
): Promise<ScanResult> {
  const season = kathmanduYear(fetchedAt);
  const home = await fetchPage(`${origin}/`, source);
  if (home.status !== 200) return { ok: false, reason: "NETWORK_ERROR" };
  if (shopifyCurrency(home.body) !== "NPR") return { ok: false, reason: "STRUCTURE_CHANGED" };
  const found = new Map<string, CandidateOffer>();
  const add = (product: Json, membership: Membership) => {
    for (const item of shopifyItems(origin, product, season)) {
      const offer = candidate(source, item, membership, fetchedAt, season);
      if (found.size < MAX_OFFERS && !found.has(offer.sourceOfferKey))
        found.set(offer.sourceOfferKey, offer);
    }
  };
  const collections = await json(fetchPage, source, `${origin}/collections.json?limit=250`);
  const labelled = (
    record(collections?.value) && Array.isArray(collections.value.collections)
      ? collections.value.collections.filter(record)
      : []
  )
    .filter((c) => {
      // Handles outlive renamed collections, so only the visible title counts.
      const label = String(c.title ?? "");
      return DASHAIN_LABEL.test(label) && isCurrentSeasonLabel(label, season);
    })
    .slice(0, MAX_LABELS);
  for (const collection of labelled) {
    const handle = String(collection.handle);
    if (!/^[a-z0-9][a-z0-9-]{0,200}$/.test(handle)) continue;
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${origin}/collections/${handle}/products.json?limit=${SHOPIFY_PAGE}&page=${page}`;
      const result = await json(fetchPage, source, url);
      const products =
        record(result?.value) && Array.isArray(result.value.products)
          ? result.value.products.filter(record)
          : [];
      for (const product of products)
        add(product, {
          label: text(collection.title, 200) ?? handle,
          evidenceUrl: `${origin}/collections/${handle}`,
          pageUrl: url,
          pageBody: result!.body,
          how: "collection",
        });
      if (products.length < SHOPIFY_PAGE) break;
    }
  }
  for (let page = 1; page <= MAX_PAGES; page++) {
    const url = `${origin}/products.json?limit=${SHOPIFY_PAGE}&page=${page}`;
    const result = await json(fetchPage, source, url);
    const products =
      record(result?.value) && Array.isArray(result.value.products)
        ? result.value.products.filter(record)
        : [];
    for (const product of products) {
      const tags = Array.isArray(product.tags)
        ? product.tags.join(" ")
        : String(product.tags ?? "");
      const title = String(product.title ?? "");
      const label = DASHAIN_LABEL.test(title) ? title : DASHAIN_LABEL.test(tags) ? tags : null;
      if (label === null || !isCurrentSeasonLabel(label, season)) continue;
      add(product, {
        label: label.slice(0, 200),
        evidenceUrl: `${origin}/products/${String(product.handle)}`,
        pageUrl: url,
        pageBody: result!.body,
        how: label === title ? "title" : "tag",
      });
    }
    if (products.length < SHOPIFY_PAGE) break;
  }
  return { ok: true, offers: [...found.values()], partial: true };
}

// ---------- WooCommerce ----------
export function wooMinor(prices: Json, key: string): number | null {
  const raw = prices[key];
  const unit = prices.currency_minor_unit;
  if (typeof raw !== "string" || !/^\d{1,14}$/.test(raw) || typeof unit !== "number") return null;
  if (!Number.isInteger(unit) || unit < 0 || unit > 4) return null;
  const minor = Math.round(Number(raw) * 10 ** (2 - unit));
  return Number.isSafeInteger(minor) && minor > 0 ? minor : null;
}
export function wooItem(origin: string, product: Json): Item | null {
  const title = text(product.name, 300);
  const prices = record(product.prices) ? product.prices : null;
  if (
    title === null ||
    typeof product.id !== "number" ||
    typeof product.permalink !== "string" ||
    !prices ||
    prices.currency_code !== "NPR" ||
    // A price range has no single exact-variant price.
    (prices.price_range !== null && prices.price_range !== undefined)
  )
    return null;
  let permalink: URL;
  try {
    permalink = new URL(product.permalink);
  } catch {
    return null;
  }
  if (permalink.origin !== origin) return null;
  const sale = wooMinor(prices, "price");
  const regular = wooMinor(prices, "regular_price");
  if (sale === null) return null;
  const images = Array.isArray(product.images) ? product.images.filter(record) : [];
  const image = images.find((i) => typeof i.src === "string" && i.src.startsWith("https://"));
  const names = (v: unknown) =>
    Array.isArray(v) ? v.filter(record).map((t) => String(t.name ?? "")) : [];
  return {
    productKey: String(product.id),
    title: decodeEntities(title),
    model: text(product.sku, 200) || text(product.slug, 200) || String(product.id),
    variant: decodeEntities(title),
    url: permalink.href,
    imageUrl: typeof image?.src === "string" ? image.src : null,
    saleMinor: sale,
    originalMinor: regular,
    inStock: product.is_in_stock !== false,
    tags: [...names(product.tags), ...names(product.categories)],
    attributes: Object.fromEntries(
      [
        ["sku", text(product.sku, 200)],
        ["type", text(product.type, 50)],
      ].filter((e): e is [string, string] => e[1] !== null),
    ),
  };
}
// Store API product names are HTML-escaped.
function decodeEntities(value: string): string {
  return value
    .replace(/&#8211;|&ndash;/g, "–")
    .replace(/&amp;/g, "&")
    .replace(/&#0?39;|&#8217;/g, "'")
    .replace(/&quot;/g, '"');
}

async function scanWoo(
  fetchPage: PageFetcher,
  source: SourceDefinition,
  origin: string,
  fetchedAt: string,
): Promise<ScanResult> {
  const season = kathmanduYear(fetchedAt);
  const api = `${origin}/wp-json/wc/store/v1/products`;
  const found = new Map<string, CandidateOffer>();
  const pages = async (
    query: string,
    membership: (product: Json) => Omit<Membership, "pageUrl" | "pageBody"> | null,
    termImage: string | null = null,
  ) => {
    for (let page = 1; page <= MAX_PAGES; page++) {
      const url = `${api}?${query}&per_page=100&page=${page}`;
      const result = await json(fetchPage, source, url);
      const products = Array.isArray(result?.value) ? result.value.filter(record) : [];
      for (const product of products) {
        const m = membership(product);
        const item = m && wooItem(origin, product);
        if (!m || !item || !isCurrentSeasonLabel(m.label, season)) continue;
        // The Store API exposes no product dates. WordPress upload paths (/uploads/YYYY/)
        // date the merchant's category banner or product image; a label naming this
        // season's year also counts. Otherwise a reused category may be last year's.
        const uploaded = `/wp-content/uploads/${season}/`;
        if (
          !new RegExp(`(?<!\\d)(?:${season}|${season + 57})(?!\\d)`).test(m.label) &&
          !termImage?.includes(uploaded) &&
          !item.imageUrl?.includes(uploaded)
        )
          continue;
        const offer = candidate(
          source,
          item,
          { ...m, pageUrl: url, pageBody: result!.body },
          fetchedAt,
          season,
        );
        if (found.size < MAX_OFFERS && !found.has(offer.sourceOfferKey))
          found.set(offer.sourceOfferKey, offer);
      }
      if (products.length < 100) break;
    }
  };
  const taxonomies = [
    ["categories", "category", "category"],
    ["tags", "tag", "tag"],
  ] as const;
  let reachable = false;
  for (const [path, param, how] of taxonomies) {
    const list = await json(fetchPage, source, `${api}/${path}?per_page=100`);
    if (list) reachable = true;
    const terms = (Array.isArray(list?.value) ? list.value.filter(record) : [])
      .filter(
        (t) =>
          typeof t.id === "number" && DASHAIN_LABEL.test(`${String(t.name)} ${String(t.slug)}`),
      )
      .slice(0, MAX_LABELS);
    for (const term of terms) {
      const label = decodeEntities(text(term.name, 200) ?? String(term.slug));
      await pages(
        `${param}=${term.id as number}`,
        () => ({
          label,
          evidenceUrl:
            typeof term.permalink === "string" && term.permalink.startsWith(origin)
              ? term.permalink
              : `${origin}/`,
          how,
        }),
        record(term.image) && typeof term.image.src === "string" ? term.image.src : null,
      );
    }
  }
  for (const term of ["dashain", "dasain"])
    await pages(`search=${term}`, (product) => {
      const title = decodeEntities(String(product.name ?? ""));
      const labels = [
        ...(Array.isArray(product.tags) ? product.tags : []),
        ...(Array.isArray(product.categories) ? product.categories : []),
      ]
        .filter(record)
        .map((t) => decodeEntities(String(t.name ?? "")));
      const tag = labels.find((l) => DASHAIN_LABEL.test(l));
      // Search also matches descriptions, which never establish membership on their own.
      return DASHAIN_LABEL.test(title)
        ? { label: title, evidenceUrl: String(product.permalink), how: "title" }
        : tag
          ? { label: tag, evidenceUrl: String(product.permalink), how: "tag" }
          : null;
    });
  return reachable
    ? { ok: true, offers: [...found.values()], partial: true }
    : { ok: false, reason: "STRUCTURE_CHANGED" };
}

export function createStorefrontAdapter(
  sourceId: string,
  fetchPage: PageFetcher,
  clock = () => new Date(),
): SourceAdapter {
  return {
    sourceId,
    async scan(source) {
      const origin = storefrontOrigin(source);
      if (source.id !== sourceId || !source.storefront || origin === null)
        return { ok: false, reason: "UNSUPPORTED_SOURCE" };
      try {
        const fetchedAt = clock().toISOString();
        return source.storefront.platform === "SHOPIFY"
          ? await scanShopify(fetchPage, source, origin, fetchedAt)
          : await scanWoo(fetchPage, source, origin, fetchedAt);
      } catch (error) {
        if (process.env.STOREFRONT_DEBUG) console.error(source.id, error);
        return { ok: false, reason: "NETWORK_ERROR" };
      }
    },
  };
}
