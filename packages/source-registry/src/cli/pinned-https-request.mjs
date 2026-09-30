import { request as httpsRequest } from "node:https";
import { isIP } from "node:net";

export function createPinnedHttpsRequest(startRequest = httpsRequest) {
  return function requestWithPinnedAddresses(url, options) {
    const records = options.addresses.map((address) => ({ address, family: isIP(address) }));

    return new Promise((resolveRequest, rejectRequest) => {
      const request = startRequest(
        url,
        {
          method: options.method,
          signal: options.signal,
          lookup: (_hostname, lookupOptions, callback) => {
            const requestedFamily =
              typeof lookupOptions === "number" ? lookupOptions : (lookupOptions.family ?? 0);
            const matchingRecords =
              requestedFamily === 0
                ? records
                : records.filter(({ family }) => family === requestedFamily);
            const firstRecord = matchingRecords[0];

            if (firstRecord === undefined) {
              callback(new Error("No validated address matches the requested IP family."));
            } else if (typeof lookupOptions === "object" && lookupOptions.all) {
              callback(null, matchingRecords);
            } else {
              callback(null, firstRecord.address, firstRecord.family);
            }
          },
        },
        (response) => {
          response.resume();
          resolveRequest({ status: response.statusCode ?? 0 });
        },
      );

      request.on("error", rejectRequest);
      request.end();
    });
  };
}

export const requestWithPinnedAddresses = createPinnedHttpsRequest();
