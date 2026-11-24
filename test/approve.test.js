import { test } from "node:test";
import assert from "node:assert/strict";
import { awaitingPath, awaitingRuns, approveArgs, runnerPaths, runnerVerdict } from "../mods/ghchecker/lib/approve.js";

test("awaitingPath asks for the runs of the head commit that wait for approval", () => {
  assert.equal(awaitingPath("acme/acme-app", "4b825dc6"), "repos/acme/acme-app/actions/runs?head_sha=4b825dc6&status=action_required&per_page=50");
  assert.match(awaitingPath("acme/acme-app", "a&b=c"), /head_sha=a%26b%3Dc&/);
});

test("awaitingRuns keeps runs that wait for approval", () => {
  const answer = { workflow_runs: [
    { id: 1, name: "CI", status: "action_required", conclusion: null },
    { id: 2, name: "Lint", status: "completed", conclusion: "action_required" },
    { id: 3, name: "Deploy", status: "completed", conclusion: "success" },
  ] };
  assert.deepEqual(awaitingRuns(answer), [{ id: 1, name: "CI" }, { id: 2, name: "Lint" }]);
  assert.deepEqual(awaitingRuns(null), []);
  assert.deepEqual(awaitingRuns({}), []);
});

test("approveArgs: the gh call, only for a run id", () => {
  assert.deepEqual(approveArgs("acme/acme-app", 9129), ["api", "-X", "POST", "repos/acme/acme-app/actions/runs/9129/approve"]);
  assert.deepEqual(approveArgs("acme/acme-app", "42")[3], "repos/acme/acme-app/actions/runs/42/approve");
  for (const bad of ["1/../x", "abc", 0, -3, null]) assert.throws(() => approveArgs("acme/acme-app", bad), /not a run id/, String(bad));
});

test("runnerPaths: the repository's and the organisation's runners", () => {
  assert.deepEqual(runnerPaths("acme/acme-app"), ["repos/acme/acme-app/actions/runners?per_page=1", "orgs/acme/actions/runners?per_page=1"]);
});

test("runnerVerdict: any self-hosted runner blocks; no answer is said, not blocked", () => {
  assert.deepEqual(runnerVerdict({ total_count: 0 }, { total_count: 0 }), { blocked: false, note: null });
  assert.deepEqual(runnerVerdict({ total_count: 0 }, null), { blocked: false, note: null }, "a personal account has no organisation");
  assert.equal(runnerVerdict({ total_count: 2 }, null).blocked, true);
  assert.equal(runnerVerdict(null, { total_count: 1 }).blocked, true);
  assert.equal(runnerVerdict({ total_count: 0 }, { total_count: 3 }).blocked, true);
  const unknown = runnerVerdict(null, null);
  assert.equal(unknown.blocked, false);
  assert.match(unknown.note, /not checked/);
  assert.equal(runnerVerdict({ message: "Not Found" }, { message: "Must have admin rights" }).blocked, false);
});
