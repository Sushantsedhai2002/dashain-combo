export function canonicalizeChannelUrl(value: string): string {
  const parts = /^https:\/\/([^/?#]+)([^?#]*)(\?[^#]*)?(?:#.*)?$/i.exec(value);
  if (parts === null || parts[1] === undefined) {
    throw new TypeError("Channel URL must be an absolute HTTPS URL.");
  }

  const canonicalAuthority = parts[1].toLowerCase().replace(/:443$/, "");
  const configuredPath = parts[2] ?? "";
  const path =
    configuredPath === ""
      ? "/"
      : configuredPath !== "/" && configuredPath.endsWith("/")
        ? configuredPath.slice(0, -1)
        : configuredPath;
  const query = parts[3] ?? "";

  return `https://${canonicalAuthority}${path}${query}`;
}
