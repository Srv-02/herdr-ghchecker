// GitHub Checker: a side panel that follows the focused tab and shows its repository's issues, pull requests
// and Actions runs. A click opens the item in a large overlay (viewer.js, run.js).
// One mod, several roles by props: the panel (none), its button in the tab bar ({ button: true }), and as
// overlays of the panel the issue or pull request ({ item }), the run ({ run }) and the small menus ({ menu }).
import { View, div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, v_virtual_list, Scrollbar } from "gpui-base";
import { spaces, panes, focused, home, appHome, readTextFile, layout, theme, openOverlay, closeOverlay, props, shared, setShared, run, nextCommand, checking, window as hostWindow } from "herdr";
import { account, repoOf } from "./gh.js";
import { Store } from "./store.js";
import { Viewer } from "./viewer.js";
import { RunView } from "./run.js";
import { tones, alpha, glyph, glyphOf, spinner, button, segmented, chip, labelChip, blankslate, openUrl, MONO, CLEAR } from "./ui.js";
import { issueState, prState, runState, checksSummary, reviewOf, actionsDot, running } from "./lib/status.js";
import { ago, age, day, duration } from "./lib/time.js";
import { groupByMilestone } from "./lib/milestones.js";
import { SORTS, DEFAULTS, filterIssues, filterPrs, filterRuns, workflowsOf, filtersActive } from "./lib/filters.js";
import { locationOf, locationKey, shortPath, repoUrl } from "./lib/location.js";
import { loadSettings, defaults } from "./lib/settings.js";
import { statsOf, statsDue } from "./lib/stats.js";

const MOD = "ghchecker";
const TICK = 3000;     // how often the panel looks at the focused folder and at what is due
const SYNC = 60000;    // a full sync of the shown repository
const LIVE = 12000;    // the runs while one is queued or in progress
const FRESH = 15000;   // switching to a repository synced this recently fetches nothing
const MISS = 30000;    // a folder without a GitHub remote is asked again after this
const TABS = [["issues", "Issues", "issue-open"], ["prs", "PRs", "pr-open"], ["actions", "Actions", "actions"]];

// An author as GitHub shows one: apps without their "app/" prefix, a deleted account as "ghost".
const who = (author) => String(author?.login ?? "ghost").replace(/^app\//, "");
const remembered = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key) ?? "null") ?? fallback; } catch { return fallback; } };
const keep = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* storage full: memory only */ } };

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) { const f = find(child, id); if (f) return f; }
  return null;
}

// As one of the side panels, only the shown one works. The panel's block is found by its mod, whatever its id.
// Adapted from jankeesvw/herdr-issues (MIT), mods/issues/main.js, hidden().
function hidden() {
  const root = layout(), body = find(root, "panel-body"), mine = body?.children?.find((c) => c.content?.mod === MOD && !c.content?.props?.button);
  if (!mine) return false;
  if (body.type !== "stack") return Boolean(find(root, "panel")?.hidden || mine.hidden);
  return Boolean(find(root, "panel")?.hidden || body.active !== mine.id);
}

export default class GhChecker extends View {
  init(_props, cx) {
    const p = props() ?? {};
    if (p.item) { this.viewer = new Viewer(p.item, p.overlay, cx); return; }
    if (p.run) { this.runView = new RunView(p.run, p.overlay, cx); return; }
    if (p.menu) { this.menu = { ...p.menu, overlay: p.overlay }; return; }
    if (p.button) {
      // The tab bar restores each space's panel only if it is one of these.
      const panels = shared("workspace.panels") ?? ["files", "changes"];
      if (!panels.includes(MOD)) setShared("workspace.panels", [...panels, MOD]);
      this.button = true;
      return;
    }
    this.store = new Store();
    this.settings = defaults(); // ghchecker.json, read again with every full sync (lib/settings.js)
    this.repos = {};          // locationKey -> { slug, at }: the folder's repository, asked of git once
    this.tab = remembered("tab", "issues");
    const saved = remembered("filters", {});
    this.f = Object.fromEntries(Object.entries(DEFAULTS).map(([k, v]) => [k, { ...v, ...(saved[k] ?? {}) }]));
    this.query = { issues: "", prs: "" }; this.compact = remembered("compact", false); this.filtering = remembered("filtering", false);
    this.inputs = {};
    for (const [tab, placeholder] of [["issues", "Filter issues"], ["prs", "Filter pull requests"]]) {
      const input = InputState.new({ placeholder });
      input.on("change", (_e, cx) => { this.query[tab] = input.value(); cx.notify(); });
      this.inputs[tab] = input;
    }
    this.pickedAt = shared("ghchecker.pick")?.at; this.changedAt = shared("ghchecker.changed")?.at;
    if (checking()) return; // herdr-app check runs init: no gh calls there
    cx.spawn(async (cx) => { this.account = await account(); cx.notify(); });
    this.readSettings(cx);
    cx.timer.every(TICK, (cx) => this.tick(cx));
    // keys.json: "alt-g i": "ghchecker:issues", or prs, actions, refresh, open (the first row), group (by milestone),
    // failed (the failed runs), compact (one line per row, or two), filter (show or hide the filters).
    cx.spawn(async (cx) => {
      for (;;) {
        const c = await nextCommand();
        if (TABS.some(([k]) => k === c)) this.setTab(c, cx);
        else if (c === "refresh") this.sync(cx, true);
        else if (c === "open") this.openFirst();
        else if (c === "group") this.setFilter("issues", { group: !this.f.issues.group }, cx);
        else if (c === "compact") this.setCompact(!this.compact, cx);
        else if (c === "filter") this.setFiltering(!this.filtering, cx);
        else if (c === "failed") { this.setFilter("actions", { show: "failed" }, cx); this.setTab("actions", cx); }
        cx.notify();
      }
    });
  }

  // ---- where the focused tab is ----
  where() { return (this.here ??= (this.last = locationOf({ spaces: spaces(), focused: focused(), panes: panes() }, this.last))); }

  // The repository of the focused folder: a slug, null (none), or undefined while git is asked.
  repo(cx) {
    const loc = this.where(), key = locationKey(loc);
    if (!key) return null;
    const known = this.repos[key];
    if (known && (known.slug || Date.now() - known.at < MISS)) return known.slug;
    if (!this.asking?.[key]) {
      (this.asking ??= {})[key] = true;
      cx.spawn(async (cx) => {
        const slug = await repoOf(loc.cwd, loc.on);
        this.repos[key] = { slug, at: Date.now() }; delete this.asking[key];
        cx.notify();
      });
    }
    return known?.slug ?? undefined;
  }

  // ---- syncing ----
  // The parts every full sync fetches, plus the closed or merged lists while one of them is shown.
  parts() {
    const out = ["issues:open", "prs:open", "runs", "milestones", "info"];
    if (statsDue(this.data().stats)) out.push("stats");
    if (this.f.issues.state !== "open") out.push(`issues:${this.f.issues.state}`);
    if (this.f.prs.state !== "open") out.push(`prs:${this.f.prs.state}`);
    return out;
  }
  readSettings(cx) {
    cx.spawn(async (cx) => { this.settings = (await loadSettings(readTextFile, appHome)).values; cx.notify(); });
  }
  sync(cx, full = true, parts = this.parts()) {
    const repo = this.shown;
    if (full) this.readSettings(cx);
    if (!repo || this.account?.state !== "ready") return;
    cx.spawn(async (cx) => { const p = this.store.sync(repo, parts, { full }); cx.notify(); await p; cx.notify(); });
  }
  tick(cx) {
    // Nothing to do while the panel is hidden or the window can't be seen (minimized, covered, another Space).
    if (hidden() || hostWindow()?.visible === false) { this.away = true; return; }
    // A cd in the terminal changes no state herdr re-renders for: compare the folder here.
    this.here = null;
    const ctx = locationKey(this.where());
    this.here = null;
    if (ctx !== this.ctx || this.away) { this.ctx = ctx; cx.notify(); return; }
    const repo = this.shown;
    if (!repo) return;
    const e = this.store.entry(repo), now = Date.now();
    if (!e.syncing && now - e.at > SYNC) this.sync(cx);
    else if (!e.syncing && (e.data.runs ?? []).some(running) && now - e.runsAt > LIVE) this.sync(cx, false, ["runs"]);
    else if (now - (this.drawnAt ?? 0) > 30000) cx.notify(); // "Updated 2m ago" moves on
  }

  setCompact(on, cx) { this.compact = on; keep("compact", on); cx.notify(); }
  setFiltering(on, cx) { this.filtering = on; keep("filtering", on); cx.notify(); }
  setTab(tab, cx) { this.tab = tab; keep("tab", tab); cx.notify(); }
  setFilter(tab, patch, cx) {
    this.f[tab] = { ...this.f[tab], ...patch };
    keep("filters", this.f);
    const part = tab === "issues" || tab === "prs" ? `${tab}:${this.f[tab].state}` : null;
    if (part && this.shown && !(part in this.store.entry(this.shown).data)) this.sync(cx, false, [part]);
    cx.notify();
  }

  // ---- opening ----
  openItem(item, kind) {
    openOverlay({ mod: MOD, kind: "dialog", width: 0.88, height: 0.9, props: { item: { kind, repo: this.shown, number: item.number, me: this.account?.login ?? null, data: item } } });
  }
  openRun(r) {
    openOverlay({ mod: MOD, kind: "dialog", width: 0.86, height: 0.88, props: { run: { repo: this.shown, run: r } } });
  }
  openFirst() {
    const rows = this.rows();
    if (!rows?.length) return;
    if (this.tab === "actions") this.openRun(rows[0]); else this.openItem(rows[0], this.tab === "prs" ? "pr" : "issue");
  }
  // A popup menu under the pointer; the pick comes back through shared "ghchecker.pick".
  openMenu(kind, tab, items, value) {
    openOverlay({ mod: MOD, kind: "popup", width: 220, height: 12 + items.length * 30, props: { menu: { kind, tab, items, value } } });
  }

  // ---- what the lists show ----
  data() { return this.shown ? this.store.entry(this.shown).data : {}; }
  me() { return this.account?.login ?? null; }
  rows() {
    const d = this.data(), f = this.f[this.tab];
    if (this.tab === "issues") return d[`issues:${f.state}`] && filterIssues(d[`issues:${f.state}`], { ...f, query: this.query.issues }, this.me(), this.settings);
    if (this.tab === "prs") return d[`prs:${f.state}`] && filterPrs(d[`prs:${f.state}`], { ...f, query: this.query.prs }, this.me(), this.settings);
    return d.runs && filterRuns(d.runs, f, this.where().branch);
  }

  // ---- drawing: rows ----
  // Rows have a fixed height (one line in compact view, two otherwise) so the list can be virtual: only what is
  // on screen is drawn, which keeps scrolling smooth with hundreds of issues. A virtual list's rows take no
  // handlers; the list reports clicks by key (list() below).
  row(size, t) {
    return h_flex().h(size).w_full().flex_none().px(8).gap(9).items_center().rounded(7).cursor_pointer().overflow_hidden().hover((s) => s.bg(t.hover));
  }
  // Title line and meta line of a two-line row; the meta line never wraps.
  lines(title, meta, chips, t, extra = null) {
    return v_flex().flex_1().min_w(0).gap(3)
      .child(div().truncate().font_medium().child(title))
      .child(h_flex().gap(6).items_center().overflow_hidden().text_size(11).text_color(t.muted)
        .child(div().flex_none().child(meta)).children(chips)
        .when(Boolean(extra), (e) => e.child(div().min_w(0).truncate().text_color(t.dim).font_family(MONO).child(extra))));
  }
  side(t, top, bottom) {
    return v_flex().flex_none().items_end().gap(3).text_size(11).text_color(t.muted).child(top).when(Boolean(bottom), (e) => e.child(bottom));
  }

  issueRow(i, t, c, size) {
    const s = issueState(i), comments = i.commentCount > 0
      ? h_flex().gap(3).items_center().child(glyph("comment", 12, t.muted)).child(String(i.commentCount)) : div();
    if (this.compact) return this.row(size, t).child(glyph(s.icon, 14, c[s.tone]))
      .child(div().w(42).flex_none().text_size(11).text_color(t.muted).child(`#${i.number}`))
      .child(div().flex_1().min_w(0).truncate().child(i.title))
      .child(div().flex_none().text_size(11).text_color(t.muted).child(comments));
    return this.row(size, t).child(glyph(s.icon, 15, c[s.tone]))
      .child(this.lines(i.title, `#${i.number} · ${ago(i.createdAt)} by ${who(i.author)}`, (i.labels ?? []).slice(0, 3).map((l) => labelChip(l, t)), t))
      .child(this.side(t, comments));
  }

  prRow(p, t, c, size) {
    const s = prState(p), checks = checksSummary(p), review = reviewOf(p), open = String(p.state).toUpperCase() === "OPEN";
    const head = p.isCrossRepository && p.headRepositoryOwner?.login ? `${p.headRepositoryOwner.login}:${p.headRefName}` : p.headRefName;
    const dot = h_flex().gap(4).items_center().text_color(c[checks.tone]).child(div().size(7).rounded(4).bg(c[checks.tone])).child(checks.label);
    if (this.compact) return this.row(size, t).child(glyph(s.icon, 14, c[s.tone]))
      .child(div().w(42).flex_none().text_size(11).text_color(t.muted).child(`#${p.number}`))
      .child(div().flex_1().min_w(0).truncate().child(p.title))
      .child(div().flex_none().text_size(11).child(dot));
    const chips = [...(p.isDraft ? [chip("draft", t.muted)] : []), ...(p.labels ?? []).slice(0, 2).map((l) => labelChip(l, t))];
    return this.row(size, t).child(glyph(s.icon, 15, c[s.tone]))
      .child(this.lines(p.title, `#${p.number} · ${ago(p.updatedAt)} by ${who(p.author)}`, chips, t, `${head} → ${p.baseRefName}`))
      .child(this.side(t, dot, open ? div().text_color(c[review.tone]).child(review.label) : null));
  }

  runRow(r, t, c, size) {
    const s = runState(r), done = !running(r);
    const took = done ? duration(r.startedAt ?? r.createdAt, r.updatedAt) : duration(r.startedAt ?? r.createdAt, null);
    const time = done ? `${took} · ${age(r.createdAt)}` : took;
    if (this.compact) return this.row(size, t).child(glyphOf(s.icon, 14, c[s.tone]))
      .child(div().flex_1().min_w(0).truncate().child(r.displayTitle))
      .child(div().flex_none().text_size(11).text_color(c[s.tone]).child(s.label))
      .child(div().flex_none().text_size(11).text_color(t.muted).child(time));
    return this.row(size, t).child(glyphOf(s.icon, 15, c[s.tone]))
      .child(this.lines(r.displayTitle, `${r.workflowName} #${r.number} · ${r.event}`, [], t, r.headBranch ?? ""))
      .child(this.side(t, div().text_color(c[s.tone]).child(s.label), div().child(time)));
  }

  // A milestone's heading: its name, when it is due, how many of its issues are done, and a bar.
  groupHeading(g, t, c, size) {
    const share = g.total ? Math.round((g.done * 100) / g.total) : 0;
    return v_flex().h(size).w_full().flex_none().px(8).pt(10).gap(5)
      .child(h_flex().gap(8).items_center().text_size(12)
        .child(div().min_w(0).truncate().font_semibold().text_color(g.progress ? t.foreground : t.muted).child(g.title))
        .when(Boolean(g.progress), (e) => e.child(div().flex_none().text_color(t.muted).child(g.due ? `due ${day(g.due)}` : "no due date")))
        .child(div().flex_1())
        .when(Boolean(g.progress), (e) => e.child(div().flex_none().text_color(t.muted).child(g.progress))))
      .when(Boolean(g.progress), (e) => e.child(div().h(4).w_full().rounded(2).bg(t.raised).overflow_hidden()
        .child(div().h_full().w(`${share}%`).bg(c.success))));
  }

  // ---- drawing: bars ----
  header(t, c, repo) {
    const e = repo ? this.store.entry(repo) : null, live = (e?.data.runs ?? []).filter(running).length;
    let status = null, tone = t.muted;
    if (e?.syncing) status = e.at ? `Updated ${ago(new Date(e.at).toISOString())} · syncing` : "Syncing…";
    else if (e?.error) { status = `Sync failed${e.at ? ` · updated ${ago(new Date(e.at).toISOString())}` : ""}`; tone = c.failure; }
    else if (live && this.tab === "actions") { status = `${live} run${live > 1 ? "s" : ""} in progress · every ${LIVE / 1000} s`; tone = c.running; }
    else if (e?.at) status = `Updated ${ago(new Date(e.at).toISOString())}`;
    const where = repo === null ? shortPath(this.where().cwd, home()) : repo;
    return h_flex().h(44).flex_none().pl(14).pr(10).gap(8).items_center().border_b(1).border_color(t.border)
      .child(glyph("github", 15, t.foreground))
      .child(div().font_semibold().child("GitHub"))
      .child(v_flex().flex_1().min_w(0).items_end()
        .child(repoUrl(repo)
          // The name opens the repository on GitHub.
          ? div().id("repo-link").max_w_full().truncate().text_size(12).text_color(t.foreground).cursor_pointer().tooltip("Open on GitHub")
            .hover((s) => s.underline()).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .on_click(() => openUrl(repoUrl(repo))).child(repo)
          : div().max_w_full().truncate().text_size(12).text_color(t.muted).font_family(MONO).child(where ?? ""))
        .when(Boolean(status), (x) => x.child(div().id("sync-status").max_w_full().truncate().text_size(11).text_color(tone).when(Boolean(e?.error), (y) => y.tooltip(e.error)).child(status))))
      .when(Boolean(repo), (x) => x.child(this.headButton("filter", "filter", this.filtering, filtersActive(this.tab, this.f[this.tab], this.query[this.tab]),
        this.filtering ? "Hide filters" : "Show filters", (cx) => this.setFiltering(!this.filtering, cx), t, c)))
      .when(Boolean(repo), (x) => x.child(this.headButton("compact", "list", this.compact, false,
        this.compact ? "Two lines per row" : "Compact view", (cx) => this.setCompact(!this.compact, cx), t, c)))
      .when(Boolean(repo), (x) => x.child(div().id("refresh").size(30).flex_none().flex().items_center().justify_center().rounded(7).border_1().border_color(t.border)
        .cursor_pointer().hover((s) => s.bg(t.hover)).tooltip("Refresh")
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => this.sync(cx))
        .child(e?.syncing ? spinner(13, t.muted) : glyph("refresh", 13, t.muted))));
  }

  // A square button in the header; `marked` shows a dot (a filter is set while the bar is hidden).
  headButton(id, name, on, marked, tip, onClick, t, c) {
    return div().id(id).relative().size(30).flex_none().flex().items_center().justify_center().rounded(7).border_1()
      .border_color(on ? alpha(c.link, "99") : t.border).bg(on ? alpha(c.link, "1f") : CLEAR)
      .cursor_pointer().hover((s) => s.bg(t.hover)).tooltip(tip)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => onClick(cx))
      .child(glyph(name, 13, on || marked ? c.link : t.muted))
      .when(marked && !on, (e) => e.child(div().absolute().top(4).right(4).size(6).rounded(3).bg(c.link)));
  }

  tabs(t, c) {
    const d = this.data(), dot = actionsDot(d.runs, d.info?.defaultBranchRef?.name);
    return h_flex().flex_none().px(6).py(4).gap(4).border_b(1).border_color(t.border)
      .children(TABS.map(([key, label, name]) => {
        const on = key === this.tab;
        return h_flex().id(`tab-${key}`).flex_1().min_w(0).h(26).gap(5).text_size(12).items_center().justify_center().rounded(7).cursor_pointer()
          .bg(on ? t.selected : CLEAR).text_color(on ? t.foreground : t.muted).when(on, (e) => e.font_medium())
          .hover((s) => s.bg(on ? t.selected : t.hover))
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click((_e, cx) => this.setTab(key, cx))
          .child(glyph(name, 14, on && key !== "actions" ? c.open : on ? t.foreground : t.muted))
          .child(label)
          .when(key === "actions" && Boolean(dot), (e) => e.child(div().size(7).flex_none().rounded(4).bg(dot === "running" ? c.running : c.failure)));
      }));
  }

  filterInput(tab, t, sortKey) {
    return h_flex().gap(6)
      .child(div().id(`filter-${tab}`).flex_1().min_w(0).h(26).px(8).flex().items_center().rounded(7).border_1().border_color(t.border).cursor_text()
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .child(Input.new(this.inputs[tab]).w_full().h_full().text_size(12).text_color(t.foreground)))
      .child(this.dropButton(`sort-${tab}`, SORTS[sortKey]?.label ?? "Newest", t,
        () => this.openMenu("sort", tab, Object.entries(SORTS).map(([k, s]) => [k, s.label]), sortKey)));
  }
  dropButton(id, label, t, onClick, grow = false) {
    return h_flex().id(id).h(26).px(8).gap(6).items_center().rounded(7).border_1().border_color(t.border).text_size(12).text_color(t.muted)
      .when(grow, (e) => e.flex_1().min_w(0).justify_between()).when(!grow, (e) => e.flex_none())
      .cursor_pointer().hover((s) => s.bg(t.hover).text_color(t.foreground))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click(onClick)
      .child(div().truncate().child(label)).child(glyph("chevron-down", 12, t.muted));
  }

  filterBar(t, c) {
    const d = this.data(), bar = v_flex().flex_none().px(6).py(5).gap(5).border_b(1).border_color(t.border);
    if (this.tab === "issues") {
      const f = this.f.issues;
      return bar.child(this.filterInput("issues", t, f.sort))
        .child(h_flex().gap(6).items_center()
          .child(segmented("issue-state", [["open", "Open"], ["closed", "Closed"]], f.state, t, (k, cx) => this.setFilter("issues", { state: k }, cx)))
          .child(h_flex().id("group-toggle").h(24).px(7).gap(5).flex_none().items_center().rounded(7).border_1().text_size(12).cursor_pointer()
            .border_color(f.group ? alpha(c.link, "99") : t.border).bg(f.group ? alpha(c.link, "1f") : CLEAR).text_color(f.group ? t.foreground : t.muted)
            .hover((s) => s.text_color(t.foreground)).tooltip("Group by milestone")
            .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
            .on_click((_e, cx) => this.setFilter("issues", { group: !f.group }, cx))
            .child(glyph("milestone", 12, f.group ? c.link : t.muted)).child("Milestones"))
          .child(div().flex_1())
          .child(segmented("issue-who", [["all", "All"], ["mine", "Mine"], ["external", "External"]], f.who, t, (k, cx) => this.setFilter("issues", { who: k }, cx))));
    }
    if (this.tab === "prs") {
      const f = this.f.prs;
      return bar.child(this.filterInput("prs", t, f.sort))
        .child(h_flex().gap(6).items_center()
          .child(segmented("pr-state", [["open", "Open"], ["merged", "Merged"], ["closed", "Closed"]], f.state, t, (k, cx) => this.setFilter("prs", { state: k }, cx)))
          .child(div().flex_1())
          .child(segmented("pr-who", [["all", "All"], ["mine", "Mine"], ["review", "Review"], ["external", "External"]], f.who, t, (k, cx) => this.setFilter("prs", { who: k }, cx))));
    }
    const f = this.f.actions, flows = workflowsOf(d.runs);
    return bar.child(h_flex().gap(6).items_center()
      .child(this.dropButton("workflow", f.workflow ?? "All workflows", t,
        () => this.openMenu("workflow", "actions", [["", "All workflows"], ...flows.map((w) => [w, w])], f.workflow ?? ""), true))
      .child(segmented("run-show", [["all", "All"], ["failed", "Failed"], ["branch", "This branch"]], f.show, t, (k, cx) => this.setFilter("actions", { show: k }, cx))));
  }

  // The status bar: the same on every tab. Open issues and pull requests jump to their tab, filtered to Open.
  statusBar(t) {
    const d = this.data(), { entries, release } = statsOf(d.stats, { issues: d["issues:open"], prs: d["prs:open"] });
    const item = (id, name, tip, value) => h_flex().id(id).flex_none().gap(5).items_center().tooltip(tip).child(glyph(name, 13, t.muted)).child(String(value));
    return h_flex().id("status-bar").h(34).flex_none().px(14).gap(14).items_center().border_t(1).border_color(t.border).bg(t.chrome ?? t.background)
      .text_size(11.5).text_color(t.muted)
      .children(entries.map((e) => item(`stat-${e.key}`, e.icon, e.tip, e.value)
        .when(Boolean(e.tab), (x) => x.cursor_pointer().hover((s) => s.text_color(t.foreground))
          .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
          .on_click((_e, cx) => { this.setFilter(e.tab, { state: "open" }, cx); this.setTab(e.tab, cx); }))))
      .child(div().flex_1())
      .when(Boolean(release), (x) => x.child(item("stat-release", "tag", "Latest release", release)));
  }

  // ---- drawing: the list ----
  empty(t, text) { return div().px(16).py(28).text_size(12).text_center().text_color(t.dim).child(text); }

  // The rows as entries { key, size, draw, open }: what the virtual list places and what a click opens.
  entries(rows, t, c) {
    const tab = this.tab, size = this.compact ? 28 : 46, entry = (key, draw, open) => ({ key, size, draw, open });
    if (tab === "issues" && this.f.issues.group) {
      return groupByMilestone(rows, this.data().milestones ?? []).flatMap((g) => [
        { key: `g:${g.key}`, size: g.progress ? 40 : 32, draw: (sz) => this.groupHeading(g, t, c, sz), open: null },
        ...g.items.map((i) => entry(`i:${i.number}`, (sz) => this.issueRow(i, t, c, sz), () => this.openItem(i, "issue"))),
      ]);
    }
    if (tab === "issues") return rows.map((i) => entry(`i:${i.number}`, (sz) => this.issueRow(i, t, c, sz), () => this.openItem(i, "issue")));
    if (tab === "prs") return rows.map((p) => entry(`p:${p.number}`, (sz) => this.prRow(p, t, c, sz), () => this.openItem(p, "pr")));
    return rows.map((r) => entry(`r:${r.databaseId}`, (sz) => this.runRow(r, t, c, sz), () => this.openRun(r)));
  }

  list(t, c) {
    const e = this.store.entry(this.shown), rows = this.rows(), tab = this.tab, f = this.f[tab];
    const box = v_flex().flex_1().min_h(0).relative().px(6).py(4);
    if (!rows) return box.child(e.error && !e.syncing ? this.empty(t, e.error) : this.empty(t, tab === "actions" ? "Loading runs…" : tab === "prs" ? "Loading pull requests…" : "Loading issues…"));
    if (!rows.length) {
      const what = tab === "actions" ? (f.show === "failed" ? "No failed runs" : f.show === "branch" ? `No runs on ${this.where().branch ?? "this branch"}` : "No workflow runs")
        : tab === "prs" ? (this.query.prs.trim() ? "No pull requests match" : `No ${f.state} pull requests${{ mine: " by you", review: " waiting for your review", external: " by others" }[f.who] ?? ""}`)
        : this.query.issues.trim() ? "No issues match" : `No ${f.state} issues${{ mine: " of yours", external: " by others" }[f.who] ?? ""}`;
      return box.child(this.empty(t, what));
    }
    const items = this.entries(rows, t, c), byKey = new Map(items.map((x) => [x.key, x]));
    const id = `list-${tab}`;
    return box
      .child(v_virtual_list(id, items.length, items.map((x) => x.size), (n) => items[n].key,
        (range) => items.slice(range.start, range.end).map((x) => x.draw(x.size)))
        .size_full()
        .on_item_click((key) => byKey.get(key)?.open?.()))
      .child(Scrollbar.vertical(id).absolute().inset_0());
  }

  shell(t) {
    return v_flex().id(MOD).size_full().min_h(0).rounded(10).overflow_hidden().bg(t.background).border_1().border_color(t.border).text_color(t.foreground).text_size(13);
  }

  // ---- the tab bar button ----
  // Adapted from jankeesvw/herdr-issues (MIT), mods/issues/main.js, toolbar().
  toolbar(t) {
    const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
    const id = body?.children?.find((c) => c.content?.mod === MOD && !c.content?.props?.button)?.id ?? MOD;
    // panel-body is a stack (one panel at a time) or a column (panels stacked, each toggled).
    const stack = body?.type === "stack", ids = stack ? [body?.active] : (body?.children ?? []).filter((c) => !c.hidden).map((c) => c.id);
    const on = Boolean(panel) && !panel.hidden && ids.includes(id);
    return h_flex().size_full().pr(10).items_center().justify_end().bg(t.chrome).border_b(1).border_color(t.border)
      .child(h_flex().id("panel-ghchecker").h(26).px(8).gap(5).flex_none().items_center().rounded(6).cursor_pointer()
        .text_size(12).bg(on ? t.selected : t.chrome).text_color(on ? t.foreground : t.muted)
        .hover((s) => s.bg(t.hover)).on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click(() => {
          if (stack) {
            if (on) run("layout.hide", { id: "panel" });
            else { run("layout.select", { stack: "panel-body", child: id }); run("layout.show", { id: "panel" }); }
            return;
          }
          const now = panel?.hidden ? [] : ids, want = on ? now.filter((x) => x !== id) : [...now, id];
          if (!want.length) { run("layout.hide", { id: "panel" }); return; }
          for (const child of body.children) run(want.includes(child.id) ? "layout.show" : "layout.hide", { id: child.id });
          run("layout.show", { id: "panel" });
        })
        .child(glyph("github", 14, on ? t.foreground : t.muted)).child("GitHub"));
  }

  // ---- the sort and workflow menus (popups of this mod) ----
  renderMenu(t) {
    const m = this.menu;
    return v_flex().id("menu").size_full().p(6).gap(1).bg(t.popover).text_color(t.foreground).text_size(12)
      .children(m.items.map(([value, label]) => h_flex().id(`menu-${value || "all"}`).h(28).flex_none().px(8).gap(8).items_center().rounded(6).cursor_pointer()
        .hover((s) => s.bg(t.hover))
        .on_click(() => { setShared("ghchecker.pick", { kind: m.kind, tab: m.tab, value, at: Date.now() }); closeOverlay(m.overlay); })
        .child(div().w(14).flex_none().child(value === m.value ? glyph("check", 13, t.foreground) : div()))
        .child(div().flex_1().truncate().child(label))));
  }

  // ---- render ----
  render(cx) {
    const t = theme();
    if (this.viewer) return this.viewer.render(cx);
    if (this.runView) return this.runView.render(cx);
    if (this.menu) return this.renderMenu(t);
    if (this.button) return this.toolbar(t);
    this.here = null; this.drawnAt = Date.now();
    if (hidden()) { this.away = true; return this.shell(t); }
    const c = tones(t), a = this.account;
    const pick = shared("ghchecker.pick");
    if (pick?.at && pick.at !== this.pickedAt) {
      this.pickedAt = pick.at;
      if (pick.kind === "sort") this.setFilter(pick.tab, { sort: pick.value }, cx);
      if (pick.kind === "workflow") this.setFilter("actions", { workflow: pick.value || null }, cx);
    }
    if (!a) return this.shell(t).child(this.header(t, c, undefined)).child(blankslate(t, { icon: "spin", title: "Connecting to GitHub…", body: "Reading your gh session." }));
    if (a.state === "missing") return this.shell(t).child(this.header(t, c, undefined)).child(blankslate(t, { icon: "github", title: "GitHub CLI not found", body: "This panel talks to GitHub through gh. Install it and sign in.",
      actions: [button("install", "Install gh", t, () => openUrl("https://cli.github.com"), { icon: "external" })] }));
    if (a.state !== "ready") return this.shell(t).child(this.header(t, c, undefined)).child(blankslate(t, { icon: "key", title: a.state === "logged_out" ? "Sign in to GitHub" : "GitHub is unreachable",
      body: a.state === "logged_out" ? "Run this in a terminal, then check again." : a.detail, code: a.state === "logged_out" ? "gh auth login" : null,
      actions: [button("recheck", "Check again", t, (_e, cx) => { this.account = null; cx.spawn(async (cx) => { this.account = await account(); cx.notify(); }); cx.notify(); }, { icon: "refresh" })] }));

    this.ctx = locationKey(this.where());
    const repo = this.repo(cx);
    if (repo !== this.shown && repo !== undefined) {
      this.shown = repo;
      if (repo) {
        const e = this.store.entry(repo);
        cx.spawn(async (cx) => { await this.store.read(repo); cx.notify(); if (Date.now() - e.at > FRESH) this.sync(cx); });
      }
    }
    const changed = shared("ghchecker.changed");
    if (changed?.at && changed.at !== this.changedAt) { this.changedAt = changed.at; if (changed.repo === this.shown) this.sync(cx); }
    if (this.away) { this.away = false; if (this.shown && Date.now() - this.store.entry(this.shown).at > FRESH) this.sync(cx); }

    if (repo === undefined && !this.shown) return this.shell(t).child(this.header(t, c, undefined)).child(blankslate(t, { icon: "spin", title: "Looking for a repository…" }));
    if (!this.shown) return this.shell(t).child(this.header(t, c, null)).child(blankslate(t, { title: "No repository in this folder",
      body: "This tab's terminal is in a folder without a GitHub remote. Switch to a tab inside a repository." }));
    return this.shell(t)
      .child(this.header(t, c, this.shown))
      .child(this.tabs(t, c))
      .when(this.filtering, (x) => x.child(this.filterBar(t, c)))
      .child(this.list(t, c))
      .child(this.statusBar(t));
  }
}
