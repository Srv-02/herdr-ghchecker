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
