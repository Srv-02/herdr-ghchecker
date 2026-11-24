// The status bar at the bottom of the panel: stars, forks, watchers, open issues and pull requests, and the
// latest release. Read with `gh repo view`, seldom: these numbers move slowly.

export const STATS_FIELDS = "stargazerCount,forkCount,watchers,issues,pullRequests,latestRelease";
const STATS_EVERY = 10 * 60000; // fetched again after ten minutes, or when the cached copy has no time

// Due for a fetch: never fetched, or older than STATS_EVERY.
export const statsDue = (stats, now = Date.now()) => !stats?.at || now - stats.at > STATS_EVERY;

const count = (v) => Number.isFinite(v) ? v : Number.isFinite(v?.totalCount) ? v.totalCount : null;

// The entries left to right ({ key, icon, tip, value, tab? }) and the release tag on the right (or null).
// Open issues and pull requests: the repository's totals, else the length of the loaded open lists.
export function statsOf(stats, lists = {}) {
  const issues = count(stats?.issues) ?? lists.issues?.length ?? null, prs = count(stats?.pullRequests) ?? lists.prs?.length ?? null;
  const entries = [
    { key: "stars", icon: "star", tip: "Stars", value: count(stats?.stargazerCount) },
    { key: "forks", icon: "fork", tip: "Forks", value: count(stats?.forkCount) },
    { key: "watchers", icon: "eye", tip: "Watchers", value: count(stats?.watchers) },
    { key: "issues", icon: "issue-open", tip: "Open issues", value: issues, tab: "issues" },
    { key: "prs", icon: "pr-open", tip: "Open pull requests", value: prs, tab: "prs" },
  ].filter((e) => e.value !== null);
  const tag = stats?.latestRelease?.tagName || stats?.latestRelease?.name || null;
  return { entries, release: tag };
}
