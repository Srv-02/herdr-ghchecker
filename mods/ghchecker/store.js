// What the panel knows per repository, in memory and on disk (data/ghchecker/ of the herdr app folder):
// switching tabs shows the last state at once while a sync runs in the background.
import * as fs from "fs/promises";
import { appHome } from "herdr";
import { load } from "./gh.js";

const VERSION = 1; // a cache file of another version is ignored
const folder = () => `${appHome()}/data/ghchecker`;
const fileOf = (repo) => `${folder()}/repo-${repo.replace("/", "__")}.json`;

// The parts a sync can fetch: "issues:open", "issues:closed", "prs:open|merged|closed", "runs", "milestones", "info", "stats".
function fetchPart(repo, part) {
  const [kind, state] = part.split(":");
  return kind === "issues" || kind === "prs" ? load[kind](repo, state) : load[kind](repo);
}

export class Store {
  constructor() { this.repos = {}; }

  // { repo, data: { [part]: value }, at (last full sync), runsAt, syncing, error }
  entry(repo) {
    return (this.repos[repo] ??= { repo, data: {}, at: 0, runsAt: 0, syncing: false, error: null, read: null });
  }

  // The cache file, read once per repository; a sync that finished first wins.
  read(repo) {
    const e = this.entry(repo);
    e.read ??= fs.readFile(fileOf(repo), "utf8").then((text) => {
      const saved = JSON.parse(text);
      if (saved?.version !== VERSION || e.at) return;
      e.data = { ...saved.data, ...e.data }; e.at = saved.at ?? 0; e.runsAt = saved.at ?? 0;
    }).catch(() => null);
    return e.read;
  }

  // Fetches the parts side by side. A part that fails keeps its last value; the first error is kept to show.
  async sync(repo, parts, { full = true } = {}) {
    const e = this.entry(repo);
    if (e.syncing) return;
    e.syncing = true;
    try {
      await this.read(repo);
      const got = await Promise.allSettled(parts.map((p) => fetchPart(repo, p)));
      let error = null;
      got.forEach((r, n) => { if (r.status === "fulfilled") e.data[parts[n]] = r.value; else error ??= String(r.reason?.message ?? r.reason); });
      e.error = error;
      const now = Date.now();
      e.runsAt = now;
      if (full) e.at = now;
      await fs.mkdir(folder(), { recursive: true });
      await fs.writeFile(fileOf(repo), JSON.stringify({ version: VERSION, at: e.at, data: e.data }));
    } catch (err) { e.error = String(err?.message ?? err); }
    finally { e.syncing = false; }
  }
}
