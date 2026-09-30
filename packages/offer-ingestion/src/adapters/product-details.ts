import type { OfferCategory } from "@dashain-offer/offer-catalog";

export function parseNprPrice(text: string): number | null {
  const match =
    /^(?:NPR|Nrs\.?|Rs\.?|₨)\s*((?:\d{1,3}(?:,\d{3})+|\d{1,2}(?:,\d{2})+,\d{3}|\d+))(?:\.(\d{1,2}))?$/i.exec(
      text.trim(),
    );
  if (match === null) return null;
  const amount =
    Number(match[1]?.replaceAll(",", "")) * 100 + Number((match[2] ?? "").padEnd(2, "0"));
  return Number.isSafeInteger(amount) ? amount : null;
}
const BRANDS = [
  "Apple",
  "Samsung",
  "Xiaomi",
  "Lenovo",
  "Asus",
  "Acer",
  "Dell",
  "HP",
  "MSI",
  "Marshall",
  "JBL",
  "Sony",
  "Boya",
  "Midea",
  "Caliber",
  "LG",
  "Himstar",
  "CG",
  "Realme",
  "Oppo",
  "Vivo",
  "OnePlus",
  "Anker",
  "Belkin",
  "Logitech",
  "Huawei",
  "Nothing",
  "Honor",
  "Beats",
  "DJI",
  "Panasonic",
  "Symphony",
  "Baltra",
  "Rapoo",
  "Imperion",
  "Poooli",
];
const CATEGORY_RULES: readonly Readonly<{ category: OfferCategory; pattern: RegExp }>[] = [
  {
    category: "MOBILE_AND_TABLETS",
    pattern: /\b(?:iphone|ipad|galaxy|smartphone|tablet|phone|redmi|poco|oppo\s+a\d+)\b/i,
  },
  {
    category: "COMPUTERS_AND_ACCESSORIES",
    pattern:
      /\b(?:macbook|imac|laptop|notebook|desktop|thinkpad|ideapad|vivobook|zenbook|inspiron|monitor|keyboard|mouse|ssd|usb|adapter|charger|charging|hdmi|lightning|printer|gaming\s+(?:t500|pc))\b/i,
  },
  {
    category: "HOME_APPLIANCES",
    pattern:
      /\b(?:refrigerator|fridge|washing|washer|dryer|dishwasher|microwave|oven|cooker|air\s*(?:conditioner|cooler|fryer)|de-?humidifier|water\s*(?:heater|purifier)|vacuum|freezer|induction|blender|kettle|fan)\b/i,
  },
  {
    category: "FASHION_AND_LIFESTYLE",
    pattern:
      /\b(?:shoe|shoes|sneaker|sneakers|sandal|sandals|boot|boots|slipper|jacket|shirt|pants|gown|lehenga|kurta|saree|leather|caliber|poncho|bridal|necklace|neckless)\b/i,
  },
  {
    category: "CONSUMER_ELECTRONICS",
    pattern:
      /\b(?:speakers?|headphones?|headsets?|earphones?|earbuds?|airpods|microphone|soundbar|television|tv|camera|watch|marshall|acton|stanmore|woburn|emberton|kilburn|willen|beats|dji)\b/i,
  },
];
export function inferProductDetails(
  title: string,
  fallback: OfferCategory = "OTHER",
  explicitBrand: string | null = null,
): Readonly<{ category: OfferCategory; brandName: string | null }> {
  const brandName =
    explicitBrand ?? BRANDS.find((brand) => new RegExp(`\\b${brand}\\b`, "i").test(title)) ?? null;
  return {
    category: CATEGORY_RULES.find((rule) => rule.pattern.test(title))?.category ?? fallback,
    brandName,
  };
}
