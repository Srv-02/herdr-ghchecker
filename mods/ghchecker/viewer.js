// One issue or pull request in a large overlay: the conversation with pictures and events, comment, close
// or reopen; for a pull request also its checks, its files and the merge box.
// Adapted from herdr-github by alarboulletmarin (MIT), mods/github/viewer.js at 75a2b40: without the agent
// briefs, work stages and label editing; with sections and a merge box of its own.
import { div, image } from "gpui-kit";
import { v_flex, h_flex, TextView, TextareaState, Textarea } from "gpui-base";
import { theme, closeOverlay, setShared, notify } from "herdr";
import { want, avatar } from "./media.js";
import { gh, ghJson } from "./gh.js";
import { tones, alpha, glyph, glyphOf, spinner, button, segmented, labelChip, pill, checkbox, openUrl, MONO, CLEAR } from "./ui.js";
import { issueState, prState, runState, checksOf, reviewOf } from "./lib/status.js";
import { entries, tally, loginOf } from "./lib/timeline.js";
import { split, linkRefs } from "./lib/markdown.js";
import { hostOf } from "./lib/images.js";
import { mergeMethods, preferredMethod, mergeBlocked, canDeleteBranch, mergeArgs } from "./lib/merge.js";
import { ago, duration } from "./lib/time.js";

const FIELDS = {
  issue: "number,title,body,author,state,stateReason,labels,assignees,createdAt,updatedAt,comments,url,milestone,closedByPullRequestsReferences,reactionGroups",
  pr: "number,title,body,author,state,isDraft,labels,assignees,createdAt,updatedAt,comments,url,milestone,reactionGroups,headRefName,baseRefName,headRepositoryOwner,isCrossRepository,additions,deletions,changedFiles,files,commits,reviewDecision,statusCheckRollup,mergeable,reviewRequests,reviews,closingIssuesReferences,mergedAt",
};
const INFO = "squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed,deleteBranchOnMerge";
const LINK = /^https:\/\/github\.com\/([\w.-]+\/[\w.-]+)\/(issues|pull)\/(\d+)(?:[/?#].*)?$/;
const ROLE = { OWNER: "Owner", MEMBER: "Member", COLLABORATOR: "Collaborator", CONTRIBUTOR: "Contributor" };
const VERDICT = { APPROVED: ["check-circle", "success", "approved these changes"], CHANGES_REQUESTED: ["x-circle", "failure", "requested changes"], COMMENTED: ["comment", null, "reviewed"], DISMISSED: ["skip", null, "had a review dismissed"] };

const display = (name) => name.replace(/^app\//, "").replace(/\[bot\]$/, "");
const isBot = (name) => /^app\/|\[bot\]$/.test(name);
const upper = (s) => String(s ?? "").toUpperCase();
const small = (label, t, color = null) => div().flex_none().px(7).rounded(9).border_1().border_color(t.border).text_size(11).text_color(color ?? t.muted).child(label);

// The last merge method picked, for the next merge box (per viewer of this mod, kept in its storage).
const lastMethod = () => { try { return localStorage.getItem("merge-method"); } catch { return null; } };
const keepMethod = (m) => { try { localStorage.setItem("merge-method", m); } catch { /* memory only */ } };

export class Viewer {
  // { kind: "issue" | "pr", repo, number, me, data (the list row, drawn until the full item is in) }
  constructor({ kind, repo, number, data, me }, overlay, cx) {
    Object.assign(this, { kind, repo, number, me, overlay });
    this.trail = []; this.items = {}; this.threads = {}; this.mode = "write"; this.section = "conversation";
    if (data) this.items[this.key()] = data;
    this.box = TextareaState.new({ placeholder: "Leave a comment (Markdown)" });
    this.box.set_auto_grow(3, 12);
    this.box.on("change", (_e, cx) => { const any = Boolean(this.box.value().trim()); if (any !== this.typed) { this.typed = any; cx.notify(); } });
    this.box.on("submit", (e, cx) => { if (e.secondary) this.comment(cx); });
    this.load(cx);
  }

  key() { return `${this.repo}#${this.number}`; }
  pr() { return this.kind === "pr"; }
  open() { return upper(this.item?.state) === "OPEN"; }

  // Item and timeline together; a stale answer (a link was followed meanwhile) is dropped.
  load(cx) {
    const key = this.key(), kind = this.kind, still = () => this.key() === key;
    this.item = this.items[key] ?? null; this.error = null; this.loading = true;
    if (kind === "pr" && !this.info) this.loadInfo(cx);
    cx.spawn(async (cx) => {
      try {
        const [item, pages] = await Promise.all([
          ghJson([kind, "view", String(this.number), "-R", this.repo, "--json", FIELDS[kind]]),
          ghJson(["api", "--paginate", "--slurp", `repos/${this.repo}/issues/${this.number}/timeline?per_page=100`]).catch(() => null),
        ]);
        if (kind === "issue" && item.url.includes("/pull/")) { this.kind = "pr"; return this.load(cx); } // #12 can be a pull request
        Object.assign(item, { repo: this.repo }, kind === "pr" ? { checks: checksOf(item) } : {});
        this.items[key] = item;
        if (pages) this.threads[key] = entries(pages.flat());
        if (still()) this.item = item;
      } catch (e) { if (still()) this.error = String(e?.message ?? e); }
      finally { if (still()) { this.loading = false; cx.notify(); } }
    });
  }

  // The merge methods this repository allows, once per overlay.
  loadInfo(cx) {
    this.info = { loading: true };
    cx.spawn(async (cx) => {
      try { this.info = await ghJson(["repo", "view", this.repo, "--json", INFO]); }
      catch (e) { this.info = { error: String(e?.message ?? e) }; }
      this.deleteBranch = this.info?.deleteBranchOnMerge === true;
      cx.notify();
    });
  }

  goTo(repo, number, kind, cx) {
    if (repo === this.repo && number === this.number) return;
    this.trail.push({ repo: this.repo, number: this.number, kind: this.kind, section: this.section });
    if (repo !== this.repo) this.info = null;
    Object.assign(this, { repo, number, kind, section: "conversation", confirming: false });
    this.load(cx); cx.notify();
  }
  goBack(cx) {
    const prev = this.trail.pop();
    if (!prev) return;
    if (prev.repo !== this.repo) this.info = null;
    Object.assign(this, prev, { confirming: false }); this.load(cx); cx.notify();
  }
  follow(url, cx) {
    const m = LINK.exec(url);
    if (m) this.goTo(m[1], Number(m[3]), m[2] === "pull" ? "pr" : "issue", cx); else openUrl(url);
  }

  // Runs gh, then reloads and tells the panel to sync.
  act(doing, args, cx, done) {
    if (this.busy) return;
    const repo = this.repo, key = this.key();
    this.busy = doing; this.error = null;
    cx.spawn(async (cx) => {
      try { await gh(args); done?.(); }
      catch (e) { this.error = String(e?.message ?? e); }
      finally {
        this.busy = null;
        setShared("ghchecker.changed", { repo, at: Date.now() });
        if (this.key() === key) this.load(cx);
        cx.notify();
      }
    });
    cx.notify();
  }
  typedText() { return this.box.value().trim(); }
  clearBox() { this.box.set_value(""); this.typed = false; this.mode = "write"; }
  verb(v, extra) { return [this.kind, v, String(this.number), "-R", this.repo, ...extra]; }
  comment(cx) { if (this.typedText()) this.act("Commenting", this.verb("comment", ["--body", this.typedText()]), cx, () => this.clearBox()); }
  close(reason, cx) {
    const extra = [...(this.pr() ? [] : ["--reason", reason]), ...(this.typedText() ? ["--comment", this.typedText()] : [])];
    this.act("Closing", this.verb("close", extra), cx, () => this.clearBox());
  }
  reopen(cx) { this.act("Reopening", this.verb("reopen", this.typedText() ? ["--comment", this.typedText()] : []), cx, () => this.clearBox()); }

  // The merge: a first click asks, the second merges.
  merge(cx) {
    if (!this.confirming) { this.confirming = true; cx.notify(); return; }
    this.confirming = false;
    const method = this.method;
    keepMethod(method);
    this.act("Merging", mergeArgs(this.number, this.repo, method, this.deleteBranch && canDeleteBranch(this.item)), cx,
      () => notify({ title: "Pull request merged", body: `${this.repo}#${this.number}`, level: "success", timeout: 3000 }));
  }

  copy(cx, text, what) {
    cx.write_to_clipboard(text);
    notify({ title: `${what} copied`, body: text, level: "success", timeout: 2500 });
  }

  // ---- pieces ----
  // Redraws once a download started by this render settles.
  waitFor(pending, cx) { if (pending) cx.spawn(async (cx) => { await pending; cx.notify(); }); }

  face(login, url, size, t, cx) {
    const { got, pending } = avatar(login, url);
    this.waitFor(pending, cx);
    if (got?.path) return image(got.path).size(size).flex_none().rounded(size / 2);
    const hues = [t.ansi1, t.ansi2, t.ansi3, t.ansi4, t.ansi5, t.ansi6], tint = hues[(login.length * 7 + login.charCodeAt(0)) % hues.length];
    return div().size(size).flex_none().rounded(size / 2).bg(alpha(tint, "33")).text_color(tint).font_semibold().text_size(Math.round(size / 2))
      .flex().items_center().justify_center().child(display(login).charAt(0).toUpperCase());
  }

  // Markdown with its pictures drawn between the text runs.
  prose(key, body, t, cx) {
    return v_flex().gap(12).children(split(body).map((part, n) => part.image ? this.shot(`${key}-${n}`, part, t, cx)
      : TextView.markdown(`${key}-${n}`, linkRefs(part.text, this.repo)).selectable(true).on_link_click((url, cx) => this.follow(url, cx))));
  }

  shot(key, part, t, cx) {
    const { got, pending } = want(part.image);
    this.waitFor(pending, cx);
    if (!got?.path) {
      // Not loaded from outside GitHub (lib/images.js): a link to open it in the browser.
      if (got === "blocked") {
        return h_flex().id(key).h(36).w_full().flex_none().px(12).gap(8).items_center().justify_center().rounded(6).border_1().border_color(t.border).bg(t.raised)
          .text_size(12).text_color(t.muted).cursor_pointer().tooltip(part.image).hover((s) => s.text_color(t.foreground)).on_click(() => openUrl(part.image))
          .child(glyph("image", 14, t.muted))
          .child(div().min_w(0).truncate().child(`Image from ${hostOf(part.image)}${part.alt ? ` (${part.alt})` : ""} · open it`));
      }
      const lost = got === "missing";
      return h_flex().id(key).h(lost ? 36 : 120).w_full().flex_none().px(12).gap(8).items_center().justify_center().rounded(6).border_1().border_color(t.border).bg(t.raised)
        .text_size(12).text_color(t.muted).cursor_pointer().on_click(() => openUrl(part.image))
        .child(lost ? glyph("image", 14, t.muted) : spinner(14, t.muted))
        .child(div().min_w(0).truncate().child(lost ? `Couldn't show this image${part.alt ? ` (${part.alt})` : ""} · open it` : "Loading image…"));
    }
    const fit = Math.max(200, (this.column ?? 760) - 34), w = Math.min(part.width ?? got.width, got.width, fit);
    return div().id(key).flex_none().child(image(got.path).w(w).h(Math.round(got.height * w / got.width)).rounded(6));
  }

  // A comment or review: avatar, who, when, roles, the text, its reactions.
  card(key, item, entry, t, cx) {
    const c = tones(t), verdict = entry.review ? VERDICT[entry.review] : null, author = loginOf(item.author);
    const head = h_flex().h(36).px(12).gap(8).items_center().bg(t.raised).border_b(1).border_color(t.border).text_size(12)
      .child(this.face(entry.who, entry.avatar, 20, t, cx))
      .child(div().font_semibold().child(display(entry.who)))
      .when(isBot(entry.who), (e) => e.child(small("bot", t)))
      .when(Boolean(verdict), (e) => e.child(glyph(verdict[0], 14, verdict[1] ? c[verdict[1]] : t.muted)).child(div().text_color(t.muted).child(verdict[2])))
      .child(div().text_color(t.muted).child(entry.opening ? `opened ${ago(entry.at)}` : ago(entry.at)))
      .child(div().flex_1())
      .when(!entry.opening && entry.who === author, (e) => e.child(small("Author", t)))
      .when(!entry.opening && Boolean(ROLE[entry.role]), (e) => e.child(small(ROLE[entry.role], t)));
    const text = entry.body?.trim();
    return v_flex().flex_none().rounded(9).overflow_hidden().border_1().border_color(entry.review === "CHANGES_REQUESTED" ? alpha(c.failure, "88") : t.border)
      .child(head)
      .when(Boolean(text) || entry.opening, (e) => e.child(div().px(14).py(12).text_size(13)
        .child(text ? this.prose(key, text, t, cx) : div().italic().text_color(t.muted).child("No description provided."))))
      .when(entry.reactions?.length > 0, (e) => e.child(h_flex().px(14).pb(10).gap(6).flex_wrap()
        .children(entry.reactions.map((r) => div().px(8).py(1).rounded(12).border_1().border_color(t.border).text_size(12).text_color(t.muted).child(r)))));
  }

  // An event as an icon and a line of words; words are text, { b } bold, { label }, { code } or { struck }.
  line(e, c) {
    const pr = this.pr();
    if (e.labels) {
      const { added, removed } = e.labels;
      return ["tag", null, [...(added.length ? ["added", ...added.map((label) => ({ label }))] : []), ...(added.length && removed.length ? ["and"] : []),
        ...(removed.length ? ["removed", ...removed.map((label) => ({ label }))] : []), added.length + removed.length > 1 ? "labels" : "label"]];
    }
    if (e.assigned) return ["user", null, e.assigned === e.who ? ["self-assigned this"] : ["assigned", { b: display(e.assigned) }]];
    if (e.unassigned) return ["user", null, e.unassigned === e.who ? ["removed their assignment"] : ["unassigned", { b: display(e.unassigned) }]];
    if (e.closed) return e.closed === "not_planned" ? ["issue-skip", c.neutral, ["closed this as not planned"]]
      : [pr ? "pr-closed" : "issue-done", pr ? c.closed : c.done, [pr ? "closed this" : "closed this as completed"]];
    if (e.reopened) return [pr ? "pr-open" : "issue-open", c.open, ["reopened this"]];
    if (e.merged) return ["pr-merged", c.done, ["merged commit", { code: e.merged.sha }]];
    if (e.renamed) return ["tag", null, ["changed the title", { struck: e.renamed.from }, { b: e.renamed.to }]];
    if (e.milestone) return ["milestone", null, [e.milestone.added ? "added this to the" : "removed this from the", { b: e.milestone.title }, "milestone"]];
    if (e.mention) return ["link", null, ["mentioned this"]];
    if (e.commit) return ["commit", null, [e.commit.message ? "committed" : "added a commit that references this"]];
    return ["dot", null, []];
  }

  event(key, e, t, cx) {
    const c = tones(t), [name, fill, words] = this.line(e, c);
    const word = (w) => typeof w === "string" ? div().child(w) : w.b !== undefined ? div().font_semibold().text_color(t.foreground).child(w.b)
      : w.label ? labelChip(w.label, t) : w.code ? div().font_family(MONO).text_size(12).child(w.code) : div().line_through().child(w.struck ?? "");
    const target = e.mention ?? (e.commit?.url ? e.commit : null);
    const mark = h_flex().size(26).flex_none().justify_center().items_center().rounded(13).border_1()
      .bg(fill ? alpha(fill, "2e") : t.raised).border_color(fill ?? t.border).child(glyph(name, 13, fill ?? t.muted));
    return v_flex().flex_none().gap(6)
      .child(h_flex().pl(6).gap(10).items_center().child(mark)
        .child(h_flex().flex_1().min_w(0).gap(5).flex_wrap().items_center().text_size(12).text_color(t.muted)
          .when(!e.commit, (x) => x.child(this.face(e.who, e.avatar, 16, t, cx)))
          .child(div().font_semibold().text_color(t.foreground).child(display(e.who)))
          .children(words.map(word))
          .child(div().child(ago(e.at)))))
      .when(Boolean(target), (x) => x.child(h_flex().id(key).ml(42).gap(8).items_center().cursor_pointer().text_size(12)
        .on_click((_ev, cx) => this.follow(target.url, cx))
        .when(Boolean(e.mention), (y) => y.child(glyph(e.mention.pr ? (e.mention.merged ? "pr-merged" : "pr-open") : "issue-open", 15, e.mention.open ? c.open : c.done))
          .child(div().font_semibold().text_color(t.foreground).hover((s) => s.text_color(c.link)).child(e.mention.title ?? ""))
          .child(div().text_color(t.muted).child(`${e.mention.repo === this.repo ? "" : e.mention.repo ?? ""}#${e.mention.number}`)))
        .when(Boolean(e.commit), (y) => y.when(Boolean(e.commit.message), (z) => z.child(div().flex_1().min_w(0).truncate().text_color(t.foreground).child(e.commit.message)))
          .child(div().px(6).py(1).rounded(5).bg(t.raised).border_1().border_color(t.border).font_family(MONO).text_color(t.muted).child(e.commit.sha)))));
  }

  // The opening post, then the timeline (or, before it loads, the comments gh returned).
  conversation(i, t, cx) {
    const thread = this.threads[this.key()]
      ?? (Array.isArray(i.comments) ? i.comments : []).map((cm) => ({ card: "comment", who: loginOf(cm.author), at: cm.createdAt, body: cm.body, role: cm.authorAssociation, reactions: tally(cm.reactionGroups) }));
    const opening = { card: "comment", opening: true, who: loginOf(i.author), at: i.createdAt, body: i.body, reactions: tally(i.reactionGroups) };
    const rail = () => div().flex_none().ml(18).w(2).h(14).bg(t.border);
    return [this.card("opening", i, opening, t, cx), ...thread.flatMap((e, n) => [rail(), e.card ? this.card(`c${n}`, i, e, t, cx) : this.event(`e${n}`, e, t, cx)])];
  }

  // Write or preview, then close or reopen, and comment.
  composer(i, t, cx) {
    const c = tones(t), busy = Boolean(this.busy), pr = this.pr(), open = this.open(), noun = pr ? "pull request" : "issue";
    const body = this.mode === "write"
      ? div().id("box").px(11).py(9).cursor_text().child(Textarea.new(this.box).w_full().text_size(13).text_color(t.foreground))
      : div().px(14).py(12).min_h(90).text_size(13).child(this.typed
        ? TextView.markdown("preview", linkRefs(this.box.value(), this.repo)).on_link_click((url, cx) => this.follow(url, cx))
        : div().text_color(t.muted).child("Nothing to preview"));
    const actions = upper(i.state) === "MERGED" ? [] : open
      ? [button("close", this.typed ? "Close with comment" : `Close ${noun}`, t, (_e, cx) => this.close("completed", cx), { enabled: !busy, icon: pr ? "pr-closed" : "issue-done", tint: pr ? c.closed : c.done }),
        ...(pr ? [] : [button("not-planned", "", t, (_e, cx) => this.close("not planned", cx), { enabled: !busy, icon: "issue-skip", tint: c.neutral, tooltip: "Close as not planned" })])]
      : [button("reopen", this.typed ? "Reopen with comment" : `Reopen ${noun}`, t, (_e, cx) => this.reopen(cx), { enabled: !busy, icon: pr ? "pr-open" : "issue-open", tint: c.open })];
    return v_flex().flex_none().gap(8)
      .child(h_flex().items_center().child(div().flex_1().font_semibold().child("Add a comment"))
        .child(segmented("mode", [["write", "Write"], ["preview", "Preview"]], this.mode, t, (mode, cx) => { this.mode = mode; cx.notify(); })))
      .child(v_flex().rounded(9).border_1().border_color(t.border).overflow_hidden()
        .child(body)
        .child(h_flex().px(10).py(8).gap(8).items_center().border_t(1).border_color(t.border)
          .child(div().flex_1().text_size(11).text_color(t.muted).child("Ctrl+Enter to comment"))
          .children(actions)
          .child(button("comment", "Comment", t, (_e, cx) => this.comment(cx), { primary: true, enabled: this.typed && !busy }))));
  }

  // ---- pull request sections ----
  checksList(i, t) {
    const c = tones(t), runs = i.checks?.runs ?? [];
    if (!runs.length) return [div().py(20).text_color(t.muted).child(i.statusCheckRollup ? "No checks on this pull request." : "Loading checks…")];
    return [v_flex().flex_none().rounded(9).border_1().border_color(t.border).overflow_hidden().children(runs.map((r, n) => {
      const s = runState(r);
      return h_flex().id(`check-${n}`).px(12).py(8).gap(9).items_center().text_size(12).border_b(1).border_color(t.border).cursor_pointer()
        .hover((x) => x.bg(t.hover)).on_click(() => openUrl(r.url))
        .child(glyphOf(s.icon, 14, c[s.tone]))
        .child(div().flex_1().min_w(0).truncate().child(`${r.workflow ? `${r.workflow} / ` : ""}${r.name}`))
        .child(div().text_color(c[s.tone]).child(s.label))
        .when(Boolean(r.startedAt && r.completedAt), (x) => x.child(div().w(56).text_right().text_color(t.muted).child(duration(r.startedAt, r.completedAt))))
        .child(glyph("external", 12, t.dim));
    }))];
  }

  filesList(i, t) {
    const c = tones(t), files = i.files ?? [];
    if (!files.length) return [div().py(20).text_color(t.muted).child(i.files ? "No files changed." : "Loading files…")];
    return [v_flex().flex_none().rounded(9).border_1().border_color(t.border).overflow_hidden().children(files.map((f, n) => h_flex().id(`file-${n}`).px(12).py(7).gap(10).items_center()
      .text_size(12).border_b(1).border_color(t.border)
      .child(div().flex_1().min_w(0).truncate().font_family(MONO).child(f.path))
      .child(div().text_color(c.success).child(`+${f.additions}`))
      .child(div().w(44).text_color(c.failure).child(`−${f.deletions}`))))];
  }

  sections(i, t) {
    const runs = i.checks?.runs ?? [], passed = runs.filter((r) => r.conclusion === "success").length;
    const talk = (this.threads[this.key()]?.filter((e) => e.card).length ?? (Array.isArray(i.comments) ? i.comments.length : i.commentCount ?? 0)) + 1;
    const items = [["conversation", "Conversation", String(talk)], ["checks", "Checks", runs.length ? `${passed}/${runs.length}` : ""],
      ["files", "Files", i.changedFiles !== undefined ? `${i.changedFiles} · +${i.additions} −${i.deletions}` : ""]];
    return h_flex().flex_none().px(14).py(6).gap(4).border_b(1).border_color(t.border).children(items.map(([key, label, note]) => {
      const on = this.section === key;
      return h_flex().id(`section-${key}`).px(12).py(6).gap(6).rounded(7).cursor_pointer().bg(on ? t.selected : CLEAR).text_color(on ? t.foreground : t.muted)
        .when(on, (e) => e.font_medium()).hover((s) => s.bg(on ? t.selected : t.hover))
        .on_click((_e, cx) => { this.section = key; cx.notify(); })
        .child(label).when(Boolean(note), (e) => e.child(div().text_color(t.muted).font_normal().child(note)));
    }));
  }

  // ---- the merge box ----
  // Below the conversation of an open pull request: conflicts, checks and review, then the methods the
  // repository allows, Delete branch, and the merge button (a first click asks, the second merges).
  mergeBox(i, t) {
    const c = tones(t), checks = i.checks ?? checksOf(i), review = reviewOf(i), blocked = mergeBlocked(i, checks), busy = Boolean(this.busy);
    const conflict = upper(i.mergeable) === "CONFLICTING", known = Boolean(i.mergeable) && upper(i.mergeable) !== "UNKNOWN";
    const line = (color, text) => h_flex().gap(8).items_center().text_color(color).child(div().size(7).flex_none().rounded(4).bg(color)).child(text);
    const lines = v_flex().gap(6).px(12).py(10).text_size(12).border_b(1).border_color(t.border)
      .child(!known ? line(t.muted, "Checking for conflicts…") : conflict ? line(c.failure, `Conflicts with ${i.baseRefName}`) : line(c.success, `No conflicts with ${i.baseRefName}`))
      .child(checks.state === "failure" ? line(c.failure, `${checks.failed.length} check${checks.failed.length === 1 ? "" : "s"} failed`)
        : checks.state === "pending" ? line(c.running, "Checks running or waiting") : checks.state === "success" ? line(c.success, "All checks passed") : line(t.muted, "No checks"))
      .child(line(c[review.tone], review.label === "No review" ? "No review required" : review.label))
      .when(Boolean(i.isDraft), (e) => e.child(line(t.muted, "Still a draft")));
    const bar = h_flex().gap(10).flex_wrap().items_center().px(12).py(10).bg(t.raised).text_size(12);
    const box = v_flex().flex_none().rounded(9).border_1().border_color(t.border).overflow_hidden().child(lines);
    if (!this.info || this.info.loading) return box.child(bar.child(div().text_color(t.muted).child("Reading the merge settings…")));
    if (this.info.error) return box.child(bar.child(div().text_color(c.failure).child(`Merge settings unavailable: ${this.info.error}`)));
    const methods = mergeMethods(this.info);
    if (!methods.length) return box.child(bar.child(div().text_color(t.muted).child("This repository allows no merge method.")));
    this.method = preferredMethod(methods, this.method ?? lastMethod());
    const label = methods.find((m) => m.method === this.method)?.label ?? "Merge", fork = !canDeleteBranch(i), del = this.deleteBranch && !fork;
    if (this.confirming) {
      return box.child(bar
        .child(div().flex_1().min_w(0).text_color(t.foreground).child(`${label} #${i.number} into ${i.baseRefName}${del ? " and delete the branch" : ""}?`))
        .child(button("merge-cancel", "Cancel", t, (_e, cx) => { this.confirming = false; cx.notify(); }))
        .child(button("merge-confirm", "Confirm merge", t, (_e, cx) => this.merge(cx), { tone: c.success, enabled: !busy, icon: "pr-merged" })));
    }
    return box.child(bar
      .child(segmented("merge-method", methods.map((m) => [m.method, m.short]), this.method, t, (k, cx) => { this.method = k; cx.notify(); }))
      .child(checkbox("delete-branch", "Delete branch", del, t, (_e, cx) => { this.deleteBranch = !this.deleteBranch; cx.notify(); }, !fork && !busy))
      .child(div().flex_1())
      .when(Boolean(blocked), (e) => e.child(div().text_color(t.muted).child(blocked)))
      .child(button("merge", label, t, (_e, cx) => this.merge(cx), { tone: c.success, enabled: !blocked && !busy, icon: "pr-merged", tooltip: fork ? "The branch lives in a fork: it stays" : null })));
  }

  // ---- the right column ----
  aside(i, t, cx) {
    const c = tones(t), pr = this.pr(), quiet = (text, color = null) => div().text_color(color ?? t.muted).child(text);
    const part = (title, body) => v_flex().flex_none().gap(6).child(div().text_color(t.muted).font_medium().child(title)).child(body);
    const checks = i.checks ?? checksOf(i), review = reviewOf(i);
    const checkLine = !checks.state ? quiet("No checks") : h_flex().gap(6).items_center()
      .text_color(checks.state === "failure" ? c.failure : checks.state === "pending" ? c.running : c.success)
      .child(div().size(7).rounded(4).bg(checks.state === "failure" ? c.failure : checks.state === "pending" ? c.running : c.success))
      .child(checks.state === "failure" ? `${checks.failed.length} failed` : checks.state === "pending" ? `${checks.pending.length} running or waiting` : "All checks passed");
    const linked = pr ? i.closingIssuesReferences ?? [] : i.closedByPullRequestsReferences ?? [];
    return v_flex().id("aside").w(250).flex_none().min_h(0).overflow_y_scrollbar().border_l(1).border_color(t.border).px(16).py(18).gap(18).text_size(12)
      .when(pr, (e) => e
        .child(part("Checks", checkLine))
        .child(part("Review", quiet(review.label, c[review.tone]))))
      .child(part("Assignees", (i.assignees ?? []).length ? v_flex().gap(6).children(i.assignees.map((a) => h_flex().gap(8).items_center()
        .child(this.face(a.login, null, 18, t, cx)).child(div().truncate().child(display(a.login))))) : quiet("No one")))
      .child(part("Labels", (i.labels ?? []).length ? h_flex().gap(4).flex_wrap().children(i.labels.map((l) => labelChip(l, t))) : quiet("None")))
      .child(part("Milestone", i.milestone?.title ? h_flex().gap(6).items_center().child(glyph("milestone", 13, t.muted)).child(i.milestone.title) : quiet("None")))
      .when(linked.length > 0, (e) => e.child(part(pr ? "Closes" : "Development", v_flex().gap(6).children(linked.map((x) => h_flex().id(`dev-${x.number}`).gap(6).items_center().cursor_pointer()
        .on_click((_e, cx) => this.follow(x.url, cx))
        .child(glyph(pr ? "issue-open" : "pr-open", 13, c.open)).child(div().hover((s) => s.text_color(c.link)).child(`#${x.number}`)))))))
      .child(part("Copy", h_flex().gap(6).flex_wrap()
        .child(button("copy-link", "Link", t, (_e, cx) => this.copy(cx, i.url, "Link"), { small: true }))
        .child(pr ? button("copy-checkout", "Checkout cmd", t, (_e, cx) => this.copy(cx, `gh pr checkout ${i.number} -R ${this.repo}`, "Command"), { small: true })
          : button("copy-ref", "Reference", t, (_e, cx) => this.copy(cx, `${this.repo}#${i.number}`, "Reference"), { small: true }))));
  }

  // ---- the top ----
  top(i, t) {
    const c = tones(t), pr = this.pr(), s = i ? (pr ? prState(i) : issueState(i)) : null;
    const head = pr && i?.isCrossRepository && i.headRepositoryOwner?.login ? `${i.headRepositoryOwner.login}:${i.headRefName}` : i?.headRefName;
    const commits = Array.isArray(i?.commits) ? i.commits.length : null;
    const code = (text) => div().font_family(MONO).text_color(t.foreground).child(text ?? "");
    return v_flex().flex_none().gap(10).px(20).pt(18).pb(14).border_b(1).border_color(t.border)
      .child(h_flex().gap(10).items_start()
        .when(this.trail.length > 0, (e) => e.child(button("back", "", t, (_e, cx) => this.goBack(cx), { icon: "back", tooltip: "Back" })))
        .child(h_flex().flex_1().min_w(0).gap(8).flex_wrap().text_size(18).font_semibold()
          .child(div().child(i?.title ?? `Loading #${this.number}…`)).child(div().font_normal().text_color(t.muted).child(`#${this.number}`)))
        .when(this.loading || Boolean(this.busy), (e) => e.child(h_flex().h(30).gap(6).items_center().text_size(12).text_color(t.muted).child(spinner(12, t.muted)).child(this.busy ?? "Refreshing")))
        .when(!this.loading && !this.busy && Boolean(i), (e) => e.child(button("reload", "", t, (_e, cx) => this.load(cx), { icon: "refresh", tooltip: "Refresh" })))
        .when(Boolean(i?.url), (e) => e.child(button("github", "Open on GitHub", t, () => openUrl(i.url), { icon: "external" })))
        .child(button("close-overlay", "", t, () => closeOverlay(this.overlay), { icon: "close", tooltip: "Close (Esc)" })))
      .when(Boolean(i), (e) => e.child(h_flex().gap(8).items_center().flex_wrap().text_size(12).text_color(t.muted)
        .child(pill(s.label, c[s.tone], s.icon))
        .when(pr, (x) => x.child(div().font_semibold().text_color(t.foreground).child(loginOf(i.author)))
          .child(div().child(upper(i.state) === "MERGED" ? "merged" : "wants to merge"))
          .when(commits !== null, (y) => y.child(div().child(`${commits} commit${commits === 1 ? "" : "s"}`)))
          .child(div().child("into")).child(code(i.baseRefName)).child(div().child("from")).child(code(head))
          .child(div().child(`· ${ago(i.createdAt)}`)))
        .when(!pr, (x) => x.child(div().font_semibold().text_color(t.foreground).child(loginOf(i.author)))
          .child(div().child(`opened ${ago(i.createdAt)}`)))))
      .when(Boolean(this.error), (e) => e.child(div().text_size(12).text_color(c.failure).child(this.error)));
  }

  render(cx) {
    const t = theme(), i = this.item, pr = this.pr();
    const frame = v_flex().id("viewer").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(13);
    if (!i) return frame.child(this.top(null, t));
    const body = this.section === "checks" && pr ? this.checksList(i, t) : this.section === "files" && pr ? this.filesList(i, t)
      : [...this.conversation(i, t, cx), ...(pr && this.open() ? [div().flex_none().h(4), this.mergeBox(i, t)] : []), div().flex_none().h(12), this.composer(i, t, cx)];
    return frame
      .child(this.top(i, t))
      .when(pr, (e) => e.child(this.sections(i, t)))
      .child(h_flex().flex_1().min_h(0).items_start()
        .child(v_flex().id(`thread-${this.key()}-${this.section}`).flex_1().min_w(0).h_full().overflow_y_scrollbar().px(20).py(18).gap(10)
          .on_size_change((size, cx) => { if (size.width !== this.column) { this.column = size.width; cx.notify(); } })
          .children(body)
          .child(div().flex_none().h(16)))
        .child(this.aside(i, t, cx).h_full()));
  }
}
