export function canonicalizeChannelUrl(value: string): string {
  const parts = /^https:\/\/([^/?#]+)([^?#]*)(\?[^#]*)?(?:#.*)?$/i.exec(value);
  if (parts === null || parts[1] === undefined) {
    throw new TypeError("Channel URL must be an absolute HTTPS URL.");
  }

  const canonicalAuthority = parts[1].toLowerCase().replace(/:443$/, "");
  let path = parts[2] || "/";
  if (path !== "/" && path.endsWith("/")) {
    path = path.slice(0, -1);
  }

  const query = parts[3] ?? "";

  return `https://${canonicalAuthority}${path}${query}`;
}
