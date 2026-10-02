import { load } from "cheerio";

function productPath(raw: string): string | null {
  try {
    const url = new URL(raw);
    return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
  } catch {
    return null;
  }
}

/** Accept only images hosted by the seller whose page supplied the URL. */
export function sellerImageUrl(raw: string | undefined, pageUrl: string): string | null {
  if (!raw || !raw.trim() || raw.length > 2048) return null;
  try {
    const page = new URL(pageUrl);
    const image = new URL(raw.trim(), page);
    const sellerDomain = page.hostname.replace(/^www\./, "");
    const sellerHosted =
      image.hostname === sellerDomain || image.hostname.endsWith(`.${sellerDomain}`);
    if (image.protocol === "http:" && sellerHosted && !image.port) image.protocol = "https:";
    if (
      image.protocol !== "https:" ||
      !sellerHosted ||
      image.username ||
      image.password ||
      image.hash
    )
      return null;
    return image.href;
  } catch {
    return null;
  }
}

export function productPageImage(html: string, pageUrl: string): string | null {
  const $ = load(html);
  const canonical = $('link[rel="canonical"]').attr("href");
  if (canonical) {
    try {
      if (productPath(new URL(canonical, pageUrl).href) !== productPath(pageUrl)) return null;
    } catch {
      return null;
    }
  }
  const raw =
    $('meta[property="og:image:secure_url"]').attr("content") ??
    $('meta[property="og:image"]').attr("content") ??
    $('meta[name="twitter:image"]').attr("content") ??
    $(".woocommerce-product-gallery img, .product-image-main img, product-info img")
      .first()
      .attr("src");
  return sellerImageUrl(raw, pageUrl);
}
