import { test } from "node:test";
import assert from "node:assert/strict";
import { mergeMethods, preferredMethod, mergeBlocked, canDeleteBranch, mergeArgs } from "../mods/ghchecker/lib/merge.js";

test("mergeMethods: only what the repository allows, in GitHub's order", () => {
  const all = { squashMergeAllowed: true, mergeCommitAllowed: true, rebaseMergeAllowed: true };
  assert.deepEqual(mergeMethods(all).map((m) => m.method), ["squash", "merge", "rebase"]);
  assert.deepEqual(mergeMethods({ squashMergeAllowed: false, mergeCommitAllowed: true, rebaseMergeAllowed: true }).map((m) => m.short), ["Merge commit", "Rebase"]);
  assert.deepEqual(mergeMethods({ squashMergeAllowed: true }).map((m) => m.label), ["Squash and merge"]);
  assert.deepEqual(mergeMethods({}), []);
  assert.deepEqual(mergeMethods(null), []);
  assert.deepEqual(mergeMethods({ squashMergeAllowed: "true" }), [], "only a real true allows");
});

test("preferredMethod: the last used when still allowed, else the first", () => {
  const methods = mergeMethods({ squashMergeAllowed: true, rebaseMergeAllowed: true });
  assert.equal(preferredMethod(methods, "rebase"), "rebase");
  assert.equal(preferredMethod(methods, "merge"), "squash");
  assert.equal(preferredMethod(methods, null), "squash");
  assert.equal(preferredMethod([], "squash"), null);
});

test("mergeBlocked: drafts, conflicts, failed checks and finished pull requests can't merge", () => {
  const open = { state: "OPEN", isDraft: false, mergeable: "MERGEABLE" };
  assert.equal(mergeBlocked(open, { state: "success" }), null);
  assert.equal(mergeBlocked(open, { state: "pending" }), null, "pending checks don't block");
  assert.equal(mergeBlocked(open, { state: null }), null);
  assert.match(mergeBlocked({ ...open, isDraft: true }, null), /Draft/);
  assert.match(mergeBlocked({ ...open, mergeable: "CONFLICTING" }, null), /conflicts/);
  assert.match(mergeBlocked(open, { state: "failure" }), /checks failed/);
  assert.match(mergeBlocked({ ...open, state: "MERGED" }, null), /merged/);
  assert.match(mergeBlocked({ ...open, state: "CLOSED" }, null), /closed/);
  assert.equal(mergeBlocked(null, null), "Loading");
});

test("canDeleteBranch: not for a fork's branch", () => {
  assert.equal(canDeleteBranch({ isCrossRepository: false }), true);
  assert.equal(canDeleteBranch({ isCrossRepository: true }), false);
});

test("mergeArgs: the gh command", () => {
  assert.deepEqual(mergeArgs(47, "acme/acme-app", "squash", true), ["pr", "merge", "47", "-R", "acme/acme-app", "--squash", "--delete-branch"]);
  assert.deepEqual(mergeArgs(47, "acme/acme-app", "rebase", false), ["pr", "merge", "47", "-R", "acme/acme-app", "--rebase"]);
  assert.deepEqual(mergeArgs("3", "acme/acme-app", "merge", false).slice(2, 6), ["3", "-R", "acme/acme-app", "--merge"]);
  assert.throws(() => mergeArgs(1, "acme/acme-app", "--admin", false), /unknown merge method/);
});
