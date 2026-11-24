// "Group by milestone" in the Issues tab: one heading per milestone with its progress, the issues
// without a milestone last.

// milestones: from `repos/:repo/milestones` (gh.js keeps number, title, open, closed, due).
// Returns [{ key, title, progress, done, total, due, items }], in due date order (none last, then by title).
export function groupByMilestone(issues, milestones = []) {
  const known = new Map((milestones ?? []).map((m) => [m.title, m]));
  const groups = new Map(), none = [];
  for (const i of issues ?? []) {
    const title = i.milestone?.title;
    if (!title) { none.push(i); continue; }
    if (!groups.has(title)) groups.set(title, []);
    groups.get(title).push(i);
  }
  const out = [...groups].map(([title, items]) => {
    const m = known.get(title);
    // Not in the milestone list (deleted meanwhile, or the list failed): count what the list shows.
    const done = m ? m.closed : items.filter((i) => String(i.state).toUpperCase() !== "OPEN").length;
    const total = m ? m.open + m.closed : items.length;
    return { key: `m:${title}`, title, done, total, due: m?.due ?? null, progress: `${done} / ${total} done`, items };
  });
  out.sort((a, b) => (a.due ? Date.parse(a.due) : Infinity) - (b.due ? Date.parse(b.due) : Infinity) || a.title.localeCompare(b.title));
  if (none.length) out.push({ key: "none", title: "No milestone", done: null, total: null, due: null, progress: null, items: none });
  return out;
}

