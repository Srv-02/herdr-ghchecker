// State of an issue, pull request, check or workflow run as GitHub draws it: an icon, a tone and a word.
// The tone is a name ("open", "failure", …); ui.js turns it into a color of the herdr theme.
// Adapted from herdr-github by alarboulletmarin (MIT), mods/github/ui.js at 75a2b40 (issueState, prState, runState, checksOf).

const upper = (s) => String(s ?? "").toUpperCase();
const lower = (s) => String(s ?? "").toLowerCase();

export function issueState(i) {
  if (upper(i.state) === "OPEN") return { icon: "issue-open", tone: "open", label: "Open" };
  return upper(i.stateReason) === "NOT_PLANNED"
    ? { icon: "issue-skip", tone: "neutral", label: "Not planned" }
    : { icon: "issue-done", tone: "done", label: "Closed" };
}

export function prState(pr) {
  const s = upper(pr.state);
  if (s === "MERGED" || pr.mergedAt) return { icon: "pr-merged", tone: "done", label: "Merged" };
  if (s === "CLOSED") return { icon: "pr-closed", tone: "closed", label: "Closed" };
  if (pr.isDraft) return { icon: "pr-draft", tone: "neutral", label: "Draft" };
  return { icon: "pr-open", tone: "open", label: "Open" };
}

const FAILED = /^(failure|timed_out|startup_failure|action_required)$/;

// A workflow run, a job or a step ({ status, conclusion }).
export function runState(r) {
  const c = lower(r.conclusion), s = lower(r.status);
  if (s && s !== "completed") {
    if (s === "in_progress") return { icon: "spin", tone: "running", label: "Running" };
    if (s === "waiting" || s === "action_required") return { icon: "clock", tone: "running", label: "Waiting" };
    return { icon: "clock", tone: "neutral", label: "Queued" };
  }
  if (c === "success") return { icon: "check-circle", tone: "success", label: "Success" };
  if (FAILED.test(c)) return { icon: "x-circle", tone: "failure", label: "Failed" };
  if (c === "cancelled") return { icon: "skip", tone: "neutral", label: "Cancelled" };
  if (c === "skipped" || c === "neutral") return { icon: "skip", tone: "neutral", label: "Skipped" };
  return { icon: "dot", tone: "neutral", label: c ? c[0].toUpperCase() + c.slice(1) : "Unknown" };
}

export const running = (r) => Boolean(r.status) && lower(r.status) !== "completed";
export const failed = (r) => lower(r.status) === "completed" && FAILED.test(lower(r.conclusion));

// One summary of a pull request's checks (statusCheckRollup holds check runs and commit statuses):
// failing beats pending beats passing.
export function checksOf(pr) {
  const runs = (pr.statusCheckRollup ?? []).map((c) => {
    const status = c.__typename === "StatusContext" ? (upper(c.state) === "PENDING" || upper(c.state) === "EXPECTED" ? "queued" : "completed") : lower(c.status);
    const done = { SUCCESS: "success", PENDING: null, EXPECTED: null }, st = upper(c.state);
    const conclusion = c.__typename === "StatusContext" ? (st in done ? done[st] : "failure") : lower(c.conclusion) || null;
    return { name: c.name ?? c.context ?? "", workflow: c.workflowName ?? null, status, conclusion, url: c.detailsUrl ?? c.targetUrl ?? null, startedAt: c.startedAt ?? null, completedAt: c.completedAt ?? null };
  });
  const bad = runs.filter((r) => /^(failure|timed_out|cancelled|action_required|startup_failure)$/.test(r.conclusion ?? ""));
  const pending = runs.filter((r) => r.status !== "completed");
  const state = !runs.length ? null : bad.length ? "failure" : pending.length ? "pending" : "success";
  return { runs, failed: bad, pending, state };
}

// The checks column of a pull request row: "2 failed", "Running", "Waiting", "Passed", "No checks".
export function checksSummary(pr) {
  const c = checksOf(pr);
  if (c.state === "failure") return { tone: "failure", label: `${c.failed.length} failed` };
  if (c.state === "pending") return c.pending.some((r) => r.status === "in_progress") ? { tone: "running", label: "Running" } : { tone: "neutral", label: "Waiting" };
  if (c.state === "success") return { tone: "success", label: "Passed" };
  return { tone: "neutral", label: "No checks" };
}

// The review decision as a word.
export function reviewOf(pr) {
  return {
    APPROVED: { tone: "success", label: "Approved" },
    CHANGES_REQUESTED: { tone: "failure", label: "Changes requested" },
    REVIEW_REQUIRED: { tone: "running", label: "Review needed" },
  }[upper(pr.reviewDecision)] ?? { tone: "neutral", label: "No review" };
}

// A bot account: gh names apps "app/<name>" and marks them is_bot; REST logins end in "[bot]" with type "Bot".
export const isBot = (author) => Boolean(author?.is_bot) || author?.type === "Bot" || /^app\/|\[bot\]$/.test(author?.login ?? "");

// Someone other than the signed-in person opened it. Bots (github-actions, dependabot) count only with the
// setting external.includeBots; logins in external.ignoreAuthors never count (lib/settings.js).
// Unknown login (not signed in): nobody is external.
export function isExternal(item, me, settings = {}) {
  const who = item?.author?.login;
  if (!me || !who || who === me) return false;
  if ((settings["external.ignoreAuthors"] ?? []).includes(who.replace(/^app\//, ""))) return false;
  return settings["external.includeBots"] === true || !isBot(item.author);
}

// The dot on the Actions tab: "running" while a run is queued or in progress, else "failed" when the
// newest finished run on the default branch failed, else null.
export function actionsDot(runs, defaultBranch) {
  if ((runs ?? []).some(running)) return "running";
  const last = (runs ?? []).filter((r) => !running(r) && (!defaultBranch || r.headBranch === defaultBranch))
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  return last && failed(last) ? "failed" : null;
}
