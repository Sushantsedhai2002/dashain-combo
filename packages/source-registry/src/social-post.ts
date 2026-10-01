import type { SourceDefinition } from "./index.ts";
import { canonicalizeChannelUrl } from "./canonicalize-channel-url.ts";

/** The merchant feed attests attribution; Instagram permalinks do not encode an owner. */
export function isRegisteredSocialPost(
  source: SourceDefinition,
  accountUrl: string,
  postUrl: string,
): boolean {
  try {
    const pattern =
      /^https:\/\/(www\.)?(facebook\.com|instagram\.com|tiktok\.com)(\/[^?#]*)(?:\?[^#]*)?(?:#.*)?$/;
    const account = pattern.exec(accountUrl);
    const post = pattern.exec(postUrl);
    if (!account || !post || account[1] !== post[1] || account[2] !== post[2]) return false;
    const channel = source.channels.find(
      (entry) =>
        entry.isEnabled &&
        entry.kind !== "WEBSITE" &&
        canonicalizeChannelUrl(entry.url) === canonicalizeChannelUrl(accountUrl),
    );
    if (!channel) return false;
    const host = post[2];
    const path = account[3]!.replace(/\/$/, "");
    const postPath = post[3]!;
    if (!path || path === "/") return false;
    if (channel.kind === "INSTAGRAM")
      return host === "instagram.com" && /^\/(?:p|reel)\/[A-Za-z0-9_-]+\/?$/.test(postPath);
    if (channel.kind === "FACEBOOK")
      return (
        host === "facebook.com" &&
        (postPath.startsWith(`${path}/posts/`) || postPath.startsWith(`${path}/videos/`))
      );
    return (
      channel.kind === "TIKTOK" &&
      host === "tiktok.com" &&
      postPath.startsWith(`${path}/video/`) &&
      /^\/@[^/]+\/video\/\d+\/?$/.test(postPath)
    );
  } catch {
    return false;
  }
}
