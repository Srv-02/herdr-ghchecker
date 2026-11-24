import { test } from "node:test";
import assert from "node:assert/strict";
import { groupByMilestone } from "../mods/ghchecker/lib/milestones.js";

const issue = (number, milestone, state = "OPEN") => ({ number, state, milestone: milestone ? { title: milestone } : null });
const MILESTONES = [
  { number: 2, title: "v1.1", open: 2, closed: 1, due: null },
  { number: 1, title: "v1.0", open: 3, closed: 5, due: "2026-12-12T00:00:00Z" },
  { number: 3, title: "v0.9", open: 0, closed: 4, due: "2026-11-01T00:00:00Z" },
];

test("one group per milestone with issues, in due date order, without a milestone last", () => {
  const groups = groupByMilestone([issue(46, "v1.0"), issue(41, "v1.1"), issue(33, null), issue(29, "v1.0")], MILESTONES);
  assert.deepEqual(groups.map((g) => g.title), ["v1.0", "v1.1", "No milestone"], "v0.9 has no shown issue: no heading");
  assert.deepEqual(groups.map((g) => g.items.map((i) => i.number)), [[46, 29], [41], [33]], "list order kept inside a group");
  assert.equal(groups[0].progress, "5 / 8 done");
  assert.deepEqual([groups[0].done, groups[0].total, groups[0].due], [5, 8, "2026-12-12T00:00:00Z"]);
  assert.equal(groups[2].progress, null);
  assert.equal(groups[2].key, "none");
});

test("a milestone missing from the list counts the shown issues", () => {
  const [g] = groupByMilestone([issue(1, "gone"), issue(2, "gone", "CLOSED")], []);
  assert.deepEqual([g.title, g.progress, g.due], ["gone", "1 / 2 done", null]);
});

test("milestones without a due date sort by title after dated ones", () => {
  const groups = groupByMilestone([issue(1, "b"), issue(2, "a"), issue(3, "v1.0")], MILESTONES);
  assert.deepEqual(groups.map((g) => g.title), ["v1.0", "a", "b"]);
});

test("nothing to group", () => {
  assert.deepEqual(groupByMilestone([], MILESTONES), []);
  assert.deepEqual(groupByMilestone(null, null), []);
  assert.deepEqual(groupByMilestone([issue(1, null)]).map((g) => g.title), ["No milestone"]);
});
