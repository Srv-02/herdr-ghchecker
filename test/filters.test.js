import { test } from "node:test";
import assert from "node:assert/strict";
import { matches, filterIssues, filterPrs, filterRuns, workflowsOf, SORTS, DEFAULTS, filtersActive } from "../mods/ghchecker/lib/filters.js";

const ME = "mona";
const item = (number, login, extra = {}) => ({ number, title: `Item ${number}`, author: { login, ...(extra.bot ? { is_bot: true } : {}) }, labels: [], assignees: [],
  updatedAt: `2026-01-${String(10 + number).padStart(2, "0")}T00:00:00Z`, ...extra });
const ISSUES = [item(1, ME), item(2, "octocat", { labels: [{ name: "bug" }] }), item(3, "app/dependabot", { bot: true }), item(4, "hubot", { assignees: [{ login: ME }] })];
const numbers = (list) => list.map((i) => i.number);

test("matches: number, title, author and labels, any case", () => {
  assert.equal(matches(ISSUES[1], "BUG"), true);
  assert.equal(matches(ISSUES[1], "#2"), true);
  assert.equal(matches(ISSUES[1], "octo"), true);
  assert.equal(matches(ISSUES[1], "nothing"), false);
  assert.equal(matches(ISSUES[1], "  "), true);
});

test("issues: All, Mine (opened or assigned), External without bots", () => {
  assert.deepEqual(numbers(filterIssues(ISSUES, { who: "all" }, ME)), [4, 3, 2, 1], "newest first");
  assert.deepEqual(numbers(filterIssues(ISSUES, { who: "mine" }, ME)), [4, 1]);
  assert.deepEqual(numbers(filterIssues(ISSUES, { who: "external" }, ME)), [4, 2], "dependabot is a bot");
  assert.deepEqual(numbers(filterIssues(ISSUES, { who: "external" }, ME, { "external.includeBots": false })), [4, 2]);
  assert.deepEqual(numbers(filterIssues(ISSUES, { who: "external" }, ME, { "external.includeBots": true })), [4, 3, 2]);
  assert.deepEqual(numbers(filterIssues(ISSUES, { who: "external" }, ME, { "external.ignoreAuthors": ["hubot"] })), [2]);
  assert.deepEqual(numbers(filterIssues(ISSUES, { who: "external" }, null)), [], "not signed in");
  assert.deepEqual(numbers(filterIssues(ISSUES, { who: "all", sort: "oldest", query: "item" }, ME)), [1, 2, 3, 4]);
});

test("pull requests: Mine, Review, External, sorted by update", () => {
  const prs = [item(1, ME), item(2, "octocat", { reviewRequests: [{ login: ME }] }), item(5, "app/dependabot", { bot: true, reviewRequests: [{ login: "hubot" }] })];
  assert.deepEqual(numbers(filterPrs(prs, {}, ME)), [5, 2, 1], "updated first");
  assert.deepEqual(numbers(filterPrs(prs, { who: "mine" }, ME)), [1]);
  assert.deepEqual(numbers(filterPrs(prs, { who: "review" }, ME)), [2]);
  assert.deepEqual(numbers(filterPrs(prs, { who: "external" }, ME)), [2]);
  assert.deepEqual(numbers(filterPrs(prs, { who: "external" }, ME, { "external.includeBots": true })), [5, 2]);
  assert.deepEqual(numbers(filterPrs(prs, { who: "unknown" }, ME)), [5, 2, 1], "an unknown filter shows all");
  assert.deepEqual(filterPrs(null, {}, ME), []);
});

test("runs: All, Failed, This branch, one workflow", () => {
  const run = (id, workflowName, headBranch, status, conclusion) => ({ databaseId: id, workflowName, headBranch, status, conclusion });
  const runs = [run(1, "CI", "main", "completed", "success"), run(2, "CI", "fix", "completed", "failure"), run(3, "Deploy", "fix", "in_progress", ""), run(4, "Deploy", "main", "completed", "timed_out")];
  const ids = (l) => l.map((r) => r.databaseId);
  assert.deepEqual(ids(filterRuns(runs, { show: "all" }, "fix")), [1, 2, 3, 4]);
  assert.deepEqual(ids(filterRuns(runs, { show: "failed" }, "fix")), [2, 4]);
  assert.deepEqual(ids(filterRuns(runs, { show: "branch" }, "fix")), [2, 3]);
  assert.deepEqual(ids(filterRuns(runs, { show: "branch" }, null)), [], "no branch known: none");
  assert.deepEqual(ids(filterRuns(runs, { show: "all", workflow: "Deploy" }, null)), [3, 4]);
  assert.deepEqual(workflowsOf(runs), ["CI", "Deploy"]);
  assert.deepEqual(workflowsOf(null), []);
});

test("the sort orders", () => {
  assert.deepEqual(Object.keys(SORTS), ["newest", "oldest", "updated"]);
});

test("filtersActive: a query or any filter off its default marks the filter button", () => {
  assert.equal(filtersActive("issues", { ...DEFAULTS.issues }, ""), false);
  assert.equal(filtersActive("issues", {}, ""), false, "missing keys are defaults");
  assert.equal(filtersActive("issues", { ...DEFAULTS.issues }, "  bug "), true);
  assert.equal(filtersActive("issues", { ...DEFAULTS.issues, state: "closed" }), true);
  assert.equal(filtersActive("issues", { ...DEFAULTS.issues, group: true }), true);
  assert.equal(filtersActive("prs", { ...DEFAULTS.prs, who: "review" }), true);
  assert.equal(filtersActive("prs", { ...DEFAULTS.prs, sort: "newest" }), true);
  assert.equal(filtersActive("actions", { show: "all", workflow: null }), false);
  assert.equal(filtersActive("actions", { show: "all", workflow: "CI" }), true);
  assert.equal(filtersActive("unknown", {}, ""), false);
});
