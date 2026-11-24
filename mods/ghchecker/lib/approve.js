// "Approve and run": workflow runs of a pull request that wait for a maintainer's approval (first-time
// contributors, forks). GitHub marks them action_required; approving runs the pull request's code on the
// repository's runners.

const ACTION_REQUIRED = "action_required";

// The API query for the runs of a commit that wait for approval.
export const awaitingPath = (repo, sha) => `repos/${repo}/actions/runs?head_sha=${encodeURIComponent(sha)}&status=${ACTION_REQUIRED}&per_page=50`;

// The ids of the runs that wait, from that query's answer (status or conclusion action_required).
export function awaitingRuns(answer) {
  return (answer?.workflow_runs ?? []).filter((r) => r.status === ACTION_REQUIRED || r.conclusion === ACTION_REQUIRED)
    .map((r) => ({ id: r.id, name: r.name ?? r.display_title ?? "workflow" }));
}

// gh api -X POST repos/<repo>/actions/runs/<id>/approve
export function approveArgs(repo, id) {
  if (!Number.isInteger(Number(id)) || Number(id) <= 0) throw new Error(`not a run id: ${id}`);
  return ["api", "-X", "POST", `repos/${repo}/actions/runs/${Number(id)}/approve`];
}

// Self-hosted runners keep what a job leaves behind, so a stranger's code is never approved onto them.
// The runners of the repository and of its organisation (each asked of the API; reading them needs admin
// rights, so an answer may be missing).
export const runnerPaths = (repo) => [`repos/${repo}/actions/runners?per_page=1`, `orgs/${repo.split("/")[0]}/actions/runners?per_page=1`];

// From the two answers (null when the call failed): { blocked, note }. Any self-hosted runner blocks.
// No answer at all: not blocked, but said so.
export function runnerVerdict(repoAnswer, orgAnswer) {
  const count = (a) => Number.isFinite(a?.total_count) ? a.total_count : null;
  const own = count(repoAnswer), org = count(orgAnswer);
  if (own > 0 || org > 0) return { blocked: true, note: "This repository can use self-hosted runners: approve it on GitHub, if at all." };
  if (own === null && org === null) return { blocked: false, note: "Runners not checked (needs admin rights): approve only on GitHub-hosted runners." };
  return { blocked: false, note: null };
}
