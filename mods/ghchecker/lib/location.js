// Where the focused terminal is, and which GitHub repository that folder belongs to.

// The focused terminal's folder, machine and git branch. `on` is the machine of a remote terminal (null on this
// computer): a terminal block shown in the layout has no pane, its address "<machine>/<id>" names it.
// A focused mod pane or mod block has no folder of its own: it keeps the last location.
// Adapted from jankeesvw/herdr-issues (MIT), mods/issues/main.js, location().
export function locationOf({ spaces, focused, panes }, last = null) {
  const space = (spaces ?? []).find((s) => s.active), f = focused;
  const pane = f?.pane ? (panes ?? []).find((p) => p.pane === f.pane) : null;
  if (pane && !pane.terminal && last) return last;
  // A layout block of a mod has the keyboard (a click into this panel, or into Files): no pane, no terminal.
  if (f && !f.pane && !f.terminal && last) return last;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder || null, on, branch: pane?.branch ?? space?.branch ?? null };
}

// One key per folder and machine, for the cache of folder -> repository. Null without a folder.
export const locationKey = (loc) => loc?.cwd ? JSON.stringify([loc.on ?? null, loc.cwd]) : null;

// "owner/name" of a github.com remote URL (https, ssh or git@), or null. Only GitHub's own name characters
// pass: the name goes into gh arguments and API paths.
// Adapted from herdr-github by alarboulletmarin (MIT), mods/github/gh.js at 75a2b40.
export function slugOf(remote) {
  const m = /github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/.exec(String(remote ?? "").trim());
  return m && /^[\w.-]+$/.test(m[1]) && /^[\w.-]+$/.test(m[2]) ? `${m[1]}/${m[2]}` : null;
}

// The repository of `git remote -v` output: origin when it is on GitHub, else the first GitHub remote.
export function pickRemote(text) {
  const remotes = String(text ?? "").split("\n").map((l) => l.trim().split(/\s+/)).filter((p) => p.length >= 2)
    .map(([name, url]) => ({ name, slug: slugOf(url) })).filter((r) => r.slug);
  return (remotes.find((r) => r.name === "origin") ?? remotes[0])?.slug ?? null;
}

// The folder for the empty state, with the home folder as "~".
export function shortPath(cwd, home) {
  if (!cwd) return "";
  return home && (cwd === home || cwd.startsWith(`${home}/`)) ? `~${cwd.slice(home.length)}` : cwd;
}

// The repository's page on GitHub, for the clickable name in the header; null for anything but "owner/name".
export const repoUrl = (slug) => /^[\w.-]+\/[\w.-]+$/.test(String(slug ?? "")) ? `https://github.com/${slug}` : null;
