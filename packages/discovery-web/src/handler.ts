import type { OfferCatalog } from "@dashain-offer/offer-catalog";
import { parseDiscoveryQuery, type SourceOption } from "./query.ts";
import { renderDetail, renderHome, renderMessage } from "./render.ts";

type WebResponse = Readonly<{
  status: number;
  headers: Readonly<Record<string, string>>;
  body: string;
}>;
const HEADERS = Object.freeze({
  "Content-Security-Policy":
    "default-src 'self'; script-src 'none'; style-src 'self'; img-src 'self' https:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'",
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "no-referrer",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  "Cache-Control": "no-store",
});
export function createWebHandler(
  dependencies: Readonly<{
    catalog: Pick<OfferCatalog, "searchVisibleOffers" | "getVisibleOffer">;
    sources: readonly SourceOption[];
    stylesheet: string;
  }>,
): (method: string, target: string) => Promise<WebResponse> {
  return async (method, target) => {
    const response = (
      status: number,
      body: string,
      contentType = "text/html; charset=utf-8",
    ): WebResponse => ({ status, body, headers: { ...HEADERS, "Content-Type": contentType } });
    if (!["GET", "HEAD"].includes(method))
      return {
        ...response(
          405,
          renderMessage("Method not allowed", "Use a GET request to browse offers."),
        ),
        headers: { ...HEADERS, Allow: "GET, HEAD", "Content-Type": "text/html; charset=utf-8" },
      };
    if (target.length > 8192)
      return response(414, renderMessage("Address too long", "Try a shorter search."));
    try {
      const url = new URL(target, "http://localhost");
      if (url.pathname === "/assets/style.css")
        return response(200, dependencies.stylesheet, "text/css; charset=utf-8");
      if (url.pathname === "/") {
        const parsed = parseDiscoveryQuery(url.searchParams, dependencies.sources);
        if (!parsed.ok)
          return response(
            400,
            renderMessage(
              "Check your filters",
              "One of the search filters is invalid. Start a new search.",
            ),
          );
        const result = await dependencies.catalog.searchVisibleOffers(parsed.query);
        return result.ok
          ? response(200, renderHome(result.value, url.searchParams, dependencies.sources))
          : response(
              400,
              renderMessage(
                "Start a new search",
                "This page link is invalid. Try searching again.",
              ),
            );
      }
      const match =
        /^\/offers\/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})$/i.exec(
          url.pathname,
        );
      if (match?.[1] !== undefined) {
        const result = await dependencies.catalog.getVisibleOffer(match[1]);
        if (result.ok) return response(200, renderDetail(result.value));
      }
      return response(
        404,
        renderMessage(
          "Offer not found",
          "This offer may have ended, or the address may be incorrect.",
        ),
      );
    } catch {
      return response(
        503,
        renderMessage("Offers are temporarily unavailable", "Please try again shortly."),
      );
    }
  };
}
