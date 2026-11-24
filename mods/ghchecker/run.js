// One workflow run in a large overlay: its jobs on the left, the chosen job's steps and log on the right,
// and Re-run or Cancel run. Refreshes itself while the run is queued or in progress.
// Adapted from herdr-github by alarboulletmarin (MIT), mods/github/run.js at 75a2b40: without the agent brief;
// with the job list, the job's own log and Cancel run.
import { div } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { theme, closeOverlay, setShared, notify } from "herdr";
import { ghJson, gh, failedLog, jobLog } from "./gh.js";
import { tones, glyphOf, spinner, button, pill, openUrl, MONO, CLEAR } from "./ui.js";
import { runState, running, failed } from "./lib/status.js";
import { ago, duration } from "./lib/time.js";

const LIVE = 10000; // reload while the run is not finished
const conclusion = (x) => String(x.conclusion ?? "").toLowerCase();

export class RunView {
  // { repo, run (the list row) }
  constructor({ repo, run }, overlay, cx) {
    Object.assign(this, { repo, run, overlay, jobs: null, logs: {}, picked: null });
    this.load(cx);
    cx.timer.every(LIVE, (cx) => { if (running(this.run) && !this.loading) this.load(cx); });
  }

  load(cx) {
    this.loading = true; this.error = null;
    cx.spawn(async (cx) => {
      try {
        const r = await ghJson(["run", "view", String(this.run.databaseId), "-R", this.repo, "--json", "jobs,status,conclusion,attempt,updatedAt,startedAt,headSha,event,url"]);
        Object.assign(this.run, r, { jobs: undefined });
        this.jobs = r.jobs ?? [];
        // The first failed job, else the first running one, else the first.
        if (!this.jobs.some((j) => j.databaseId === this.picked)) {
          this.picked = (this.jobs.find(failed) ?? this.jobs.find(running) ?? this.jobs[0])?.databaseId ?? null;
        }
        this.logs = {};
        cx.notify();
        await this.loadLog(cx);
      } catch (e) { this.error = String(e?.message ?? e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  // The log of the picked job: its error lines when it failed, its last lines when it passed,
  // nothing while it runs (GitHub serves a job's log once the job is done).
  async loadLog(cx) {
    const job = this.job();
    if (!job || running(job) || this.logs[job.databaseId] !== undefined) return;
    this.logs[job.databaseId] = null; cx.notify();
    if (failed(job)) {
      const all = await failedLog(this.repo, this.run.databaseId);
      const mine = all.split("\n").filter((l) => l.startsWith(`${job.name} |`)).map((l) => l.slice(job.name.length + 3)).join("\n");
      this.logs[job.databaseId] = mine || all;
    } else {
      this.logs[job.databaseId] = (await jobLog(this.repo, job.databaseId)).split("\n").map((l) => l.replace(/^[^|]*\| /, "")).join("\n");
    }
    cx.notify();
  }

  job() { return (this.jobs ?? []).find((j) => j.databaseId === this.picked) ?? null; }
  pick(id, cx) { this.picked = id; cx.notify(); cx.spawn(async (cx) => this.loadLog(cx)); }

  // Re-run and Cancel: gh, then reload and tell the panel. Cancel asks first (a second click).
  act(doing, args, cx) {
    if (this.busy) return;
    this.busy = doing; this.error = null; this.confirming = false;
    cx.spawn(async (cx) => {
      try { await gh(args); setShared("ghchecker.changed", { repo: this.repo, at: Date.now() }); notify({ title: doing, body: `${this.run.workflowName} #${this.run.number}`, level: "success", timeout: 2500 }); }
      catch (e) { this.error = String(e?.message ?? e); }
      finally { this.busy = null; this.load(cx); }
    });
    cx.notify();
  }
  rerun(cx, onlyFailed) { this.act(onlyFailed ? "Re-running failed jobs" : "Re-running all jobs", ["run", "rerun", String(this.run.databaseId), "-R", this.repo, ...(onlyFailed ? ["--failed"] : [])], cx); }
  cancel(cx) {
    if (!this.confirming) { this.confirming = true; cx.notify(); return; }
    this.act("Cancelling the run", ["run", "cancel", String(this.run.databaseId), "-R", this.repo], cx);
  }

  actions(t) {
    const r = this.run, busy = Boolean(this.busy), done = !running(r), anyFailed = (this.jobs ?? []).some(failed) || failed(r);
    return h_flex().flex_none().gap(8).items_center()
      .when(!done && !this.confirming, (e) => e.child(button("cancel", "Cancel run", t, (_e, cx) => this.cancel(cx), { enabled: !busy, icon: "skip" })))
      .when(!done && Boolean(this.confirming), (e) => e
        .child(button("cancel-confirm", "Confirm cancel", t, (_e, cx) => this.cancel(cx), { primary: true, enabled: !busy }))
        .child(button("cancel-keep", "Keep running", t, (_e, cx) => { this.confirming = false; cx.notify(); })))
      .when(done && anyFailed, (e) => e.child(button("rerun-failed", "Re-run failed jobs", t, (_e, cx) => this.rerun(cx, true), { primary: true, enabled: !busy, icon: "refresh" })))
      .when(done, (e) => e.child(button("rerun-all", "Re-run all", t, (_e, cx) => this.rerun(cx, false), { enabled: !busy, icon: anyFailed ? null : "refresh" })));
  }

  top(t) {
    const c = tones(t), r = this.run, s = runState(r), took = duration(r.startedAt ?? r.createdAt, running(r) ? null : r.updatedAt);
    const code = (text) => div().font_family(MONO).text_color(t.foreground).child(text ?? "");
    return v_flex().flex_none().gap(10).px(20).pt(18).pb(14).border_b(1).border_color(t.border)
      .child(h_flex().gap(10).items_start()
        .child(h_flex().flex_1().min_w(0).gap(8).flex_wrap().text_size(18).font_semibold()
          .child(div().child(r.displayTitle)).child(div().font_normal().text_color(t.muted).child(`${r.workflowName} #${r.number}`)))
        .when(this.loading || Boolean(this.busy), (e) => e.child(h_flex().h(30).gap(6).items_center().text_size(12).text_color(t.muted).child(spinner(12, t.muted)).child(this.busy ?? "Refreshing")))
        .child(this.actions(t))
        .child(button("github", "Open on GitHub", t, () => openUrl(r.url), { icon: "external" }))
        .child(button("close-overlay", "", t, () => closeOverlay(this.overlay), { icon: "close", tooltip: "Close (Esc)" })))
      .child(h_flex().gap(8).items_center().flex_wrap().text_size(12).text_color(t.muted)
        .child(pill(took ? `${s.label} · ${took}` : s.label, c[s.tone], s.icon))
        .child(div().child(r.event ?? ""))
        .child(code(r.headBranch))
        .child(code(String(r.headSha ?? "").slice(0, 7)))
        .child(div().child(`${running(r) ? "started" : "ran"} ${ago(r.startedAt ?? r.createdAt)}`))
        .when((r.attempt ?? 1) > 1, (e) => e.child(div().child(`attempt ${r.attempt}`))))
      .when(Boolean(this.error), (e) => e.child(div().text_size(12).text_color(c.failure).child(this.error)));
  }

  jobList(t) {
    const c = tones(t);
    return v_flex().id("jobs").w(260).flex_none().h_full().min_h(0).overflow_y_scrollbar().border_r(1).border_color(t.border).p(10).gap(2)
      .child(div().px(8).py(6).text_size(11).font_medium().text_color(t.muted).child("Jobs"))
      .when(!this.jobs, (e) => e.child(div().px(8).py(6).text_size(12).text_color(t.muted).child("Loading jobs…")))
      .when(this.jobs?.length === 0, (e) => e.child(div().px(8).py(6).text_size(12).text_color(t.muted).child("No jobs yet.")))
      .children((this.jobs ?? []).map((j) => {
        const s = runState(j), on = j.databaseId === this.picked;
        const started = j.startedAt && conclusion(j) !== "skipped" && (!running(j) || String(j.status).toLowerCase() === "in_progress");
        const time = started ? duration(j.startedAt, running(j) ? null : j.completedAt) : s.label.toLowerCase();
        return h_flex().id(`job-${j.databaseId}`).flex_none().px(8).py(8).gap(9).items_center().rounded(7).cursor_pointer()
          .bg(on ? t.selected : CLEAR).hover((x) => x.bg(on ? t.selected : t.hover))
          .on_click((_e, cx) => this.pick(j.databaseId, cx))
          .child(glyphOf(s.icon, 14, c[s.tone]))
          .child(div().flex_1().min_w(0).truncate().child(j.name))
          .child(div().text_size(11).text_color(t.muted).child(time));
      }));
  }

  detail(t) {
    const c = tones(t), j = this.job();
    const box = v_flex().id(`job-detail-${this.picked}`).flex_1().min_w(0).h_full().min_h(0).overflow_y_scrollbar().px(20).py(16).gap(10);
    if (!j) return box.child(div().text_color(t.muted).child(this.jobs ? "Pick a job." : ""));
    const log = this.logs[j.databaseId];
    return box
      .child(h_flex().gap(8).items_center().child(div().flex_1().min_w(0).truncate().font_semibold().child(j.name))
        .when(Boolean(j.url), (e) => e.child(button("job-github", "", t, () => openUrl(j.url), { icon: "external", small: true, tooltip: "Open the job on GitHub" }))))
      .child(v_flex().flex_none().rounded(9).border_1().border_color(t.border).overflow_hidden().children((j.steps ?? []).map((s, n) => {
        const st = runState(s), bad = failed(s);
        return h_flex().px(12).py(8).gap(9).items_center().border_b(1).border_color(t.border).bg(t.raised)
          .child(glyphOf(st.icon, 13, c[st.tone]))
          .child(div().flex_1().min_w(0).truncate().text_color(bad || running(s) || st.tone === "success" ? t.foreground : t.muted).child(s.name ?? `Step ${n + 1}`))
          .child(div().text_size(11).text_color(t.muted).child(conclusion(s) === "skipped" ? "skipped" : s.startedAt && s.completedAt ? duration(s.startedAt, s.completedAt) : ""));
      })))
      .child(h_flex().pt(4).items_center().text_size(11).text_color(t.muted)
        .child(div().flex_1().child(failed(j) ? "Failed step log (trimmed)" : "Last log lines"))
        .when(Boolean(log), (e) => e.child(div().id("copy-log").text_color(c.link).cursor_pointer().hover((s) => s.underline())
          .on_click((_e, cx) => { cx.write_to_clipboard(log); notify({ title: "Log copied", body: j.name, level: "success", timeout: 2500 }); })
          .child("Copy log"))))
      .child(div().id("log").flex_none().p(12).rounded(9).bg(t.raised).border_1().border_color(t.border)
        .font_family(MONO).text_size(11.5).text_color(log ? t.foreground : t.muted)
        .child(running(j) ? "The log shows up here when this job has finished." : log === undefined || log === null ? "Loading the log…" : log || "No log lines."));
  }

  render(cx) {
    const t = theme();
    return v_flex().id("run").size_full().min_h(0).bg(t.background).text_color(t.foreground).text_size(13)
      .child(this.top(t))
      .child(h_flex().flex_1().min_h(0).items_start().child(this.jobList(t)).child(this.detail(t)));
  }
}
