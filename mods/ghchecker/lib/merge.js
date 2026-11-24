// The merge box of a pull request: which methods the repository allows, whether merging is possible
// now, and the gh command for it.

const METHODS = [
  ["squash", "squashMergeAllowed", "Squash and merge", "Squash"],
  ["merge", "mergeCommitAllowed", "Create a merge commit", "Merge commit"],
  ["rebase", "rebaseMergeAllowed", "Rebase and merge", "Rebase"],
];

// info: `gh repo view --json squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed,deleteBranchOnMerge`.
// Returns [{ method, label, short }] in GitHub's order; none when the info is missing.
export function mergeMethods(info) {
  if (!info) return [];
  return METHODS.filter(([, flag]) => info[flag] === true).map(([method, , label, short]) => ({ method, label, short }));
}

// The method to preselect: the last one used if it is still allowed, else the first allowed one.
export function preferredMethod(methods, last) {
  return methods.find((m) => m.method === last)?.method ?? methods[0]?.method ?? null;
}

// Why the pull request can't be merged from here, or null. checks: checksOf(pr).
export function mergeBlocked(pr, checks) {
  const state = String(pr?.state ?? "").toUpperCase();
  if (!pr) return "Loading";
  if (state === "MERGED" || pr.mergedAt) return "Already merged";
  if (state === "CLOSED") return "The pull request is closed";
  if (pr.isDraft) return "Draft pull requests can't be merged";
  if (String(pr.mergeable).toUpperCase() === "CONFLICTING") return "This branch has conflicts";
  if (checks?.state === "failure") return "Some checks failed";
  return null;
}

// A branch can be deleted with the merge only when it lives in this repository (not in a fork).
export const canDeleteBranch = (pr) => !pr?.isCrossRepository;

// gh pr merge <n> -R <repo> --squash|--merge|--rebase [--delete-branch]
export function mergeArgs(number, repo, method, deleteBranch) {
  if (!METHODS.some(([m]) => m === method)) throw new Error(`unknown merge method: ${method}`);
  return ["pr", "merge", String(number), "-R", repo, `--${method}`, ...(deleteBranch ? ["--delete-branch"] : [])];
}
