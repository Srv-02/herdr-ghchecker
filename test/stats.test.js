import { test } from "node:test";
import assert from "node:assert/strict";
import { STATS_FIELDS, statsDue, statsOf } from "../mods/ghchecker/lib/stats.js";

test("the status bar asks gh for these fields", () => {
  assert.deepEqual(STATS_FIELDS.split(","), ["stargazerCount", "forkCount", "watchers", "issues", "pullRequests", "latestRelease"]);
});

test("statsDue: never fetched, or older than ten minutes", () => {
  const now = 1_000_000_000;
  assert.equal(statsDue(undefined, now), true);
  assert.equal(statsDue({}, now), true);
  assert.equal(statsDue({ at: now - 60000 }, now), false);
  assert.equal(statsDue({ at: now - 11 * 60000 }, now), true);
});

test("statsOf: icons and numbers, open counts from the repository, the release on the right", () => {
  const { entries, release } = statsOf({ stargazerCount: 128, forkCount: 14, watchers: { totalCount: 9 }, issues: { totalCount: 6 }, pullRequests: { totalCount: 5 }, latestRelease: { tagName: "v0.9.2" } });
  assert.deepEqual(entries.map((e) => [e.icon, e.tip, e.value]), [["star", "Stars", 128], ["fork", "Forks", 14], ["eye", "Watchers", 9], ["issue-open", "Open issues", 6], ["pr-open", "Open pull requests", 5]]);
  assert.deepEqual(entries.filter((e) => e.tab).map((e) => e.tab), ["issues", "prs"]);
  assert.equal(release, "v0.9.2");
});

test("statsOf: no release, no entry; not read yet, the loaded lists count", () => {
  assert.equal(statsOf({ stargazerCount: 0, latestRelease: null }).release, null);
  assert.deepEqual(statsOf({ stargazerCount: 0 }).entries.map((e) => e.value), [0], "zero is shown, missing is left out");
  assert.deepEqual(statsOf(undefined, { issues: [1, 2], prs: [] }).entries.map((e) => [e.key, e.value]), [["issues", 2], ["prs", 0]]);
  assert.deepEqual(statsOf(null).entries, []);
  assert.equal(statsOf({ latestRelease: { tagName: "", name: "Spring" } }).release, "Spring");
});
