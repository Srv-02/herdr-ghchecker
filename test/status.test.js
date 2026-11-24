import { test } from "node:test";
import assert from "node:assert/strict";
import { issueState, prState, runState, checksOf, checksSummary, reviewOf, isBot, isExternal, actionsDot, running, failed } from "../mods/ghchecker/lib/status.js";

test("issue states: open, closed as completed, not planned", () => {
  assert.equal(issueState({ state: "OPEN" }).tone, "open");
  assert.deepEqual(issueState({ state: "CLOSED", stateReason: "COMPLETED" }), { icon: "issue-done", tone: "done", label: "Closed" });
  assert.equal(issueState({ state: "CLOSED", stateReason: "NOT_PLANNED" }).label, "Not planned");
});

test("pull request states: merged wins, then closed, draft, open", () => {
  assert.equal(prState({ state: "MERGED" }).label, "Merged");
  assert.equal(prState({ state: "CLOSED", mergedAt: "2026-01-01T00:00:00Z" }).label, "Merged");
  assert.equal(prState({ state: "CLOSED", isDraft: true }).label, "Closed");
  assert.equal(prState({ state: "OPEN", isDraft: true }).tone, "neutral");
  assert.equal(prState({ state: "OPEN" }).icon, "pr-open");
});

test("run states from status and conclusion", () => {
  const label = (status, conclusion) => runState({ status, conclusion }).label;
  assert.equal(label("in_progress", ""), "Running");
  assert.equal(runState({ status: "in_progress" }).icon, "spin");
  assert.equal(label("queued", null), "Queued");
  assert.equal(label("waiting", null), "Waiting");
  assert.equal(label("completed", "success"), "Success");
  for (const c of ["failure", "timed_out", "startup_failure", "FAILURE"]) assert.equal(label("completed", c), "Failed", c);
  assert.equal(label("completed", "cancelled"), "Cancelled");
  assert.equal(label("completed", "skipped"), "Skipped");
  assert.equal(label("completed", "stale"), "Stale");
  assert.equal(running({ status: "queued" }), true);
  assert.equal(running({ status: "completed" }), false);
  assert.equal(failed({ status: "completed", conclusion: "failure" }), true);
  assert.equal(failed({ status: "in_progress", conclusion: "failure" }), false);
});

const checkRun = (status, conclusion) => ({ __typename: "CheckRun", name: "test", workflowName: "CI", status, conclusion, detailsUrl: "https://example.com/c" });

test("checksOf: failing beats pending beats passing; commit statuses count too", () => {
  assert.equal(checksOf({}).state, null);
  assert.equal(checksOf({ statusCheckRollup: [checkRun("COMPLETED", "SUCCESS")] }).state, "success");
  assert.equal(checksOf({ statusCheckRollup: [checkRun("COMPLETED", "SUCCESS"), checkRun("IN_PROGRESS", "")] }).state, "pending");
  const mixed = checksOf({ statusCheckRollup: [checkRun("IN_PROGRESS", ""), checkRun("COMPLETED", "FAILURE"), { __typename: "StatusContext", context: "ci/legacy", state: "ERROR", targetUrl: "u" }] });
  assert.equal(mixed.state, "failure");
  assert.equal(mixed.failed.length, 2);
  assert.deepEqual(mixed.runs[2], { name: "ci/legacy", workflow: null, status: "completed", conclusion: "failure", url: "u", startedAt: null, completedAt: null });
  assert.equal(checksOf({ statusCheckRollup: [{ __typename: "StatusContext", context: "x", state: "PENDING" }] }).state, "pending");
  assert.equal(checksOf({ statusCheckRollup: [checkRun("COMPLETED", "CANCELLED")] }).state, "failure");
});

test("checksSummary: the words of the checks column", () => {
  const sum = (...runs) => checksSummary({ statusCheckRollup: runs }).label;
  assert.equal(sum(), "No checks");
  assert.equal(sum(checkRun("COMPLETED", "SUCCESS")), "Passed");
  assert.equal(sum(checkRun("IN_PROGRESS", ""), checkRun("COMPLETED", "SUCCESS")), "Running");
  assert.equal(sum(checkRun("QUEUED", "")), "Waiting");
  assert.equal(sum(checkRun("COMPLETED", "FAILURE"), checkRun("COMPLETED", "FAILURE"), checkRun("QUEUED", "")), "2 failed");
});

test("reviewOf: the review decision", () => {
  assert.equal(reviewOf({ reviewDecision: "APPROVED" }).label, "Approved");
  assert.equal(reviewOf({ reviewDecision: "CHANGES_REQUESTED" }).tone, "failure");
  assert.equal(reviewOf({ reviewDecision: "REVIEW_REQUIRED" }).label, "Review needed");
  assert.equal(reviewOf({ reviewDecision: "" }).label, "No review");
});

test("isBot: gh apps, REST bots, is_bot", () => {
  assert.equal(isBot({ login: "app/dependabot" }), true);
  assert.equal(isBot({ login: "github-actions[bot]", type: "Bot" }), true);
  assert.equal(isBot({ login: "renovate", is_bot: true }), true);
  assert.equal(isBot({ login: "octocat", is_bot: false }), false);
  assert.equal(isBot(null), false);
});

test("isExternal: someone else, bots only with external.includeBots, never ignored logins", () => {
  const by = (login, extra = {}) => ({ author: { login, ...extra } });
  assert.equal(isExternal(by("octocat"), "mona"), true);
  assert.equal(isExternal(by("mona"), "mona"), false);
  assert.equal(isExternal(by("octocat"), null), false, "not signed in: nobody is external");
  assert.equal(isExternal({}, "mona"), false);
  assert.equal(isExternal(by("app/dependabot", { is_bot: true }), "mona"), false);
  assert.equal(isExternal(by("app/dependabot", { is_bot: true }), "mona", { "external.includeBots": false }), false);
  assert.equal(isExternal(by("app/dependabot", { is_bot: true }), "mona", { "external.includeBots": true }), true);
  assert.equal(isExternal(by("octocat"), "mona", { "external.ignoreAuthors": ["octocat"] }), false);
  assert.equal(isExternal(by("app/dependabot", { is_bot: true }), "mona", { "external.includeBots": true, "external.ignoreAuthors": ["dependabot"] }), false);
});

test("actionsDot: running beats a red default branch", () => {
  const run = (status, conclusion, headBranch, createdAt) => ({ status, conclusion, headBranch, createdAt });
  assert.equal(actionsDot([], "main"), null);
  assert.equal(actionsDot(null, "main"), null);
  assert.equal(actionsDot([run("in_progress", "", "feature", "2026-01-02T00:00:00Z"), run("completed", "failure", "main", "2026-01-01T00:00:00Z")], "main"), "running");
  assert.equal(actionsDot([run("completed", "failure", "main", "2026-01-02T00:00:00Z"), run("completed", "success", "main", "2026-01-01T00:00:00Z")], "main"), "failed");
  assert.equal(actionsDot([run("completed", "success", "main", "2026-01-03T00:00:00Z"), run("completed", "failure", "main", "2026-01-02T00:00:00Z")], "main"), null, "only the newest counts");
  assert.equal(actionsDot([run("completed", "failure", "feature", "2026-01-03T00:00:00Z"), run("completed", "success", "main", "2026-01-01T00:00:00Z")], "main"), null, "other branches don't count");
  assert.equal(actionsDot([run("completed", "failure", "feature", "2026-01-03T00:00:00Z")], null), "failed", "default branch unknown: the newest run");
});
