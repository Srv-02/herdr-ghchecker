// Which pictures the panel loads by itself. Issue and pull request bodies are written by anyone, so a picture
// from any URL would let a stranger see your IP address and when you looked (a tracking pixel), or make this
// computer request an internal address (http://10.x, localhost). Only GitHub's own image hosts are loaded;
// every other picture stays a link (viewer.js). Checked with URL, never with a pattern on the string.

// Hosts whose pictures load: avatars, camo (GitHub's image proxy), user-images, private-user-images, raw.
const SUFFIX = ".githubusercontent.com";

function parse(raw) {
  try { return new URL(String(raw ?? "")); } catch { return null; }
}

// https only, no user:password@, no port, no IP address; github.com only for attachments and avatars
// (/user-attachments/…, /<login>.png).
export function imageAllowed(raw) {
  const u = parse(raw);
  if (!u || u.protocol !== "https:" || u.username || u.password || u.port) return false;
  const host = u.hostname.toLowerCase();
  if (host === "github.com") return /^\/user-attachments\/[^/]/.test(u.pathname) || /^\/[A-Za-z0-9-]+\.png$/.test(u.pathname);
  return host.endsWith(SUFFIX) && host.length > SUFFIX.length && /^[a-z0-9.-]+$/.test(host);
}

// The gh token goes along only to github.com itself (private attachments).
export const sendsToken = (raw) => imageAllowed(raw) && parse(raw).hostname.toLowerCase() === "github.com";

// The host to name in the placeholder of a picture that is not loaded.
export const hostOf = (raw) => parse(raw)?.hostname || "an unknown host";
