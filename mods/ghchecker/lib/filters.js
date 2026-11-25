// What a list shows: the text filter, All / Mine / Review / External, the sort order, and the Actions filters.
import { isExternal } from "./status.js";

const lower = (s) => String(s ?? "").toLowerCase();

export const SORTS = {
  newest: { label: "Newest", by: (a, b) => b.number - a.number },
  oldest: { label: "Oldest", by: (a, b) => a.number - b.number },
  updated: { label: "Updated", by: (a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt) },
};

// Title, #number, author and labels contain the text (case does not matter).
export function matches(item, query) {
  const q = lower(query).trim();
  if (!q) return true;
  return lower(`#${item.number} ${item.title} ${item.author?.login ?? ""} ${(item.labels ?? []).map((l) => l.name).join(" ")}`).includes(q);
}

// Issues: "mine" means opened by or assigned to the signed-in person, "external" opened by someone else
// (bots only with external.includeBots, see isExternal in lib/status.js).
export function filterIssues(items, { query = "", who = "all", sort = "newest" } = {}, me = null, settings = {}) {
  const mine = (i) => i.author?.login === me || (i.assignees ?? []).some((a) => a.login === me);
  const keep = { all: () => true, mine, external: (i) => isExternal(i, me, settings) }[who] ?? (() => true);
  return (items ?? []).filter((i) => matches(i, query) && keep(i)).sort((SORTS[sort] ?? SORTS.newest).by);
}

// Pull requests: "mine" are opened by the signed-in person, "review" ask them for a review, "external" are
// opened by someone else (as for issues).
export function filterPrs(items, { query = "", who = "all", sort = "updated" } = {}, me = null, settings = {}) {
  const keep = {
    all: () => true,
    mine: (p) => p.author?.login === me,
    review: (p) => (p.reviewRequests ?? []).some((r) => r.login === me),
    external: (p) => isExternal(p, me, settings),
  }[who] ?? (() => true);
  return (items ?? []).filter((p) => matches(p, query) && keep(p)).sort((SORTS[sort] ?? SORTS.updated).by);
}

// Runs: All / Failed / This branch (the local checkout's branch), and one workflow or all.
export function filterRuns(runs, { show = "all", workflow = null } = {}, branch = null) {
  return (runs ?? []).filter((r) => (!workflow || r.workflowName === workflow)
    && (show !== "failed" || (lower(r.status) === "completed" && /^(failure|timed_out|startup_failure)$/.test(lower(r.conclusion))))
    && (show !== "branch" || (branch && r.headBranch === branch)));
}

// The workflows that appear in the runs, for the workflow menu.
export const workflowsOf = (runs) => [...new Set((runs ?? []).map((r) => r.workflowName).filter(Boolean))].sort();

// The defaults of each tab's filters.
export const DEFAULTS = {
  issues: { state: "open", who: "all", sort: "newest", group: false },
  prs: { state: "open", who: "all", sort: "updated" },
  actions: { show: "all", workflow: null },
};

// The filter button hides the text filter and the sort menu (on Actions: the workflow menu). While they are
// hidden, it is marked when one of them is set, so nothing filters unnoticed.
export function hiddenFiltersSet(tab, f = {}, query = "") {
  if (tab === "actions") return Boolean(f.workflow);
  const base = DEFAULTS[tab];
  return Boolean(base) && (Boolean(String(query ?? "").trim()) || (f.sort ?? base.sort) !== base.sort);
}
