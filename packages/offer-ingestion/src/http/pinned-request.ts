import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

export type TransportResult = Readonly<{
  status: number;
  body: string;
  contentType: string;
  cartToken?: string;
}>;

export function createPinnedRequest(startRequest: typeof httpsRequest = httpsRequest) {
  return function requestPinned(
    url: string,
    addresses: readonly string[],
    timeoutMs: number,
    maxBytes: number,
    cart?: Readonly<{ token: string; productId: 1075 }>,
  ): Promise<TransportResult> {
    const records = addresses.map((address) => ({ address, family: isIP(address) }));
    return new Promise((resolve, reject) => {
      const request = startRequest(
        url,
        {
          method: cart ? "POST" : "GET",
          signal: AbortSignal.timeout(timeoutMs),
          headers: {
            ...(cart ? { "Content-Type": "application/json", "Cart-Token": cart.token } : {}),
            Accept: "text/html,application/xhtml+xml,text/plain,application/json",
            "Accept-Encoding": "identity",
            "User-Agent": "DashainOfferRadar/0.1 (+public-offer-monitor)",
          },
          lookup: (_hostname, options, callback) => {
            const requestedFamily = typeof options === "number" ? options : (options.family ?? 0);
            const matches =
              requestedFamily === 0
                ? records
                : records.filter((record) => record.family === requestedFamily);
            const first = matches[0];
            if (first === undefined) {
              callback(new Error("No validated address matches the requested IP family."), []);
            } else if (typeof options === "object" && options.all) {
              callback(null, matches);
            } else {
              callback(null, first.address, first.family);
            }
          },
        },
        (response) => {
          const status = response.statusCode ?? 0;
          const contentType = String(response.headers["content-type"] ?? "");
          if (status !== 200 && !(cart && status === 201)) {
            response.resume();
            resolve({ status, body: "", contentType });
            return;
          }
          if (Number(response.headers["content-length"] ?? 0) > maxBytes) {
            response.destroy();
            reject(new Error("Response too large"));
            return;
          }
          const chunks: Buffer[] = [];
          let totalBytes = 0;
          response.on("data", (chunk: Buffer) => {
            totalBytes += chunk.length;
            if (totalBytes > maxBytes) {
              response.destroy();
              reject(new Error("Response too large"));
              return;
            }
            chunks.push(chunk);
          });
          response.on("end", () => {
            const cartToken = response.headers["cart-token"];
            resolve({
              status,
              body: Buffer.concat(chunks).toString("utf8"),
              contentType,
              ...(typeof cartToken === "string" && cartToken.length <= 4096 ? { cartToken } : {}),
            });
          });
          response.on("error", reject);
        },
      );
      request.on("error", reject);
      request.end(cart ? JSON.stringify({ id: cart.productId, quantity: 1 }) : undefined);
    });
  };
}

export const requestPinned = createPinnedRequest();
