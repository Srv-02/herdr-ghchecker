// Times as GitHub writes them: "3h ago", "on Sep 21", and run durations like "4m 02s".
// Plain string building only: herdr runs mods on QuickJS without Intl.

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// "just now", "14m ago", "2h ago", "3d ago", then "on Sep 21" (with the year when it is not this one).
export function ago(iso, now = Date.now()) {
  if (!iso) return "";
  const s = (now - Date.parse(iso)) / 1000;
  if (!Number.isFinite(s)) return "";
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.round(s / 86400)}d ago`;
  return `on ${day(iso, now)}`;
}

// The short form for a list column: "5h", "2d", "just now".
export function age(iso, now = Date.now()) {
  const a = ago(iso, now);
  return a.endsWith(" ago") ? a.slice(0, -4) : a.replace(/^on /, "");
}

export function day(iso, now = Date.now()) {
  const d = new Date(iso), year = d.getUTCFullYear() === new Date(now).getUTCFullYear() ? "" : `, ${d.getUTCFullYear()}`;
  return `${MONTHS[d.getUTCMonth()]} ${d.getUTCDate()}${year}`;
}

const pad = (n) => String(n).padStart(2, "0");

// Seconds as "40s", "4m 02s", "1h 05m".
export function seconds(total) {
  const s = Math.max(0, Math.round(total));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${pad(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${pad(Math.floor((s % 3600) / 60))}m`;
}

// From one ISO time to another (or to now when `to` is missing): "", when `from` is missing.
export function duration(from, to, now = Date.now()) {
  if (!from) return "";
  const end = to ? Date.parse(to) : now, start = Date.parse(from);
  return Number.isFinite(end) && Number.isFinite(start) ? seconds((end - start) / 1000) : "";
}
