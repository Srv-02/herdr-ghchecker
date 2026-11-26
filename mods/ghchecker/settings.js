// The Settings dialog (an overlay of this mod, props { settings: true }), laid out like Filer Pro's: Updates on top
// (a gold box when a new release is out, the installed version and Check now), then the settings of lib/settings.js,
// then the links, and Cancel / Save at the bottom. Save writes the changed keys to ghchecker.json; the panel reads it
// again (shared "ghchecker.config").
// Layout and controls adapted from filer-pro by Michael Mayer (MIT), mods/filer-pro/ui/settings.js.
import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar } from "gpui-base";
import { theme, closeOverlay, appHome, readTextFile, writeTextFile, shared, setShared, notify } from "herdr";
import { glyph, spinner, openUrl, alpha, GOLD } from "./ui.js";
import { SETTINGS, CONFIG_FILE, parseSettings, parseLogins, saveSettings, changedSettings } from "./lib/settings.js";
import { fetchRelease, localVersion, updateStatus, checkedAt, GITHUB_URL, COFFEE_URL, UPDATE_PROMPT } from "./lib/update.js";

const help = (t, text, color = null) => div().text_size(12.5).line_height("19px").text_color(color ?? t.muted).child(text);
const heading = (t, text, first = false) => div().pt(first ? 12 : 26).pb(6).text_size(12.5).text_color(t.muted).child(text.toUpperCase());

// One setting: the label, its help line below it, the control on the right.
function row(t, id, title, about, controls, last = false) {
  return h_flex().id(id).w_full().gap(18).py(13).items_center()
    .when(!last, (el) => el.border_b(1).border_color(t.border))
    .child(v_flex().flex_1().min_w(0).gap(3).child(div().text_size(14.5).text_color(t.foreground).child(title)).child(about))
    .child(h_flex().flex_none().gap(8).items_center().children(controls));
}

// Herdr's switch, as in the design: 42x24, knob 18, accent when on.
const toggle = (t, id, on, onClick) => div().id(id).w(42).h(24).flex_none().rounded(12).p(3).flex().bg(on ? t.accent : t.hover)
  .when(on, (el) => el.justify_end()).cursor_pointer().on_click(onClick)
  .child(div().w(18).h(18).rounded(9).bg(on ? t.accent_foreground : t.muted));

const button = (t, id, text, onClick, { primary = false, color = null } = {}) => h_flex().id(id).h(34).px(16).gap(6).items_center().rounded(8).cursor_pointer().text_size(13.5)
  .border_1().border_color(primary ? t.solid ?? t.foreground : color ? alpha(color, "88") : t.border)
  .bg(primary ? t.solid ?? t.foreground : "#00000000").text_color(primary ? t.solid_foreground ?? t.background : color ?? t.foreground)
  .when(primary, (el) => el.font_medium())
  .hover((s) => s.opacity(0.88)).on_click((_e, cx) => onClick(cx)).child(text);

const link = (t, id, text, icon, url) => h_flex().id(id).gap(6).items_center().cursor_pointer().text_size(12.5).text_color(t.muted)
  .hover((s) => s.text_color(t.foreground)).on_click(() => openUrl(url)).child(glyph(icon, 14, t.muted)).child(text);

export class SettingsDialog {
  constructor(overlay, cx) {
    this.overlay = overlay; this.saved = null; this.draft = null; this.error = null; this.broken = false; this.busy = false;
    this.check = { phase: "idle" }; this.version = null;
    this.handle = cx.focus_handle();
    this.authors = InputState.new({ placeholder: "octocat, hubot" });
    cx.spawn(async (cx) => {
      const [text, mod] = await Promise.all([readTextFile(`${appHome()}/${CONFIG_FILE}`).catch(() => null), readTextFile(`${appHome()}/mods/ghchecker/mod.json`).catch(() => null)]);
      const { values, problems } = parseSettings(text);
      this.saved = values; this.draft = { ...values }; this.version = localVersion(mod);
      if (problems.includes(CONFIG_FILE)) { this.broken = true; this.error = `${CONFIG_FILE} has a typo: fix or delete it, then reopen Settings.`; }
      this.authors.set_value(values["external.ignoreAuthors"].join(", "));
      cx.notify();
    });
    this.handle.focus();
  }

  close() { closeOverlay(this.overlay); }
  set(key, value, cx) { this.draft[key] = value; cx.notify(); }

  // Save: the changed keys only, then every panel reads the file again.
  save(cx) {
    if (this.busy || this.broken || !this.draft) return;
    const edits = changedSettings(this.saved, { ...this.draft, "external.ignoreAuthors": parseLogins(this.authors.value()) });
    if (!Object.keys(edits).length) { this.close(); return; }
    this.busy = true; this.error = null; cx.notify();
    cx.spawn(async (cx) => {
      try {
        await saveSettings(edits, { readTextFile, writeTextFile, appHome });
        setShared("ghchecker.config", { at: Date.now() });
        this.close();
      } catch (e) { this.error = `Not saved: ${String(e?.message ?? e)}`; this.busy = false; cx.notify(); }
    });
  }

  // Check now: one request from this dialog, also with the daily check off. A result goes to shared for the panels
  // while the daily check is on. From filer-pro's checkNow.
  checkNow(cx) {
    if (this.check.phase === "checking") return;
    this.check = { phase: "checking" }; cx.notify();
    cx.spawn(async (cx) => {
      const r = await fetchRelease(globalThis.fetch, (ms) => cx.sleep(ms));
      if (r.error) this.check = { phase: "failed" };
      else {
        const state = { at: Date.now(), local: this.version, latest: r.tag };
        if (this.version && this.saved?.update_check !== false) setShared("ghchecker.update", state);
        this.check = { phase: "done", state };
      }
      cx.notify();
    });
  }

  // The gold box of a new release: what is out, the release notes, and what to ask the agent.
  available(t, status) {
    return v_flex().id("settings-update").gap(10).mt(4).mb(6).px(18).py(16).rounded(10).border_1().border_color(alpha(GOLD, "66")).bg(alpha(GOLD, "14"))
      .child(h_flex().gap(10).items_center()
        .child(glyph("settings", 18, GOLD))
        .child(div().flex_1().min_w(0).text_size(15).font_medium().text_color(GOLD).child(`GitHub Checker ${status.version} is available`))
        .child(div().id("settings-notes").text_size(12.5).text_color(GOLD).cursor_pointer().hover((s) => s.underline()).on_click(() => openUrl(status.url)).child("Release notes")))
      .child(help(t, `You have ${this.version}. To update, ask your agent in Herdr:`, t.foreground))
      .child(h_flex().gap(8).items_center()
        .child(div().flex_1().min_w(0).truncate().px(10).py(8).rounded(7).bg(t.background).border_1().border_color(alpha(GOLD, "44"))
          .font_family("JetBrains Mono").text_size(12).text_color(t.foreground).child(UPDATE_PROMPT))
        .child(button(t, "settings-copy-prompt", "Copy", (cx) => { cx.write_to_clipboard(UPDATE_PROMPT); notify({ title: "Copied", body: "Paste it to your agent in Herdr.", level: "success", timeout: 2500 }); }, { color: GOLD })));
  }

  updates(t) {
    const stored = shared("ghchecker.update"), status = updateStatus(this.check, stored, this.version);
    const title = this.version ? `GitHub Checker ${this.version}` : "GitHub Checker";
    const last = (at) => `Last checked ${checkedAt(at, Date.now())}.`;
    const shownAt = this.check.phase === "done" ? this.check.state.at : stored?.at;
    const line = {
      checking: () => help(t, "Asking GitHub for the latest version…"),
      failed: () => help(t, "Could not reach GitHub. Check your connection and try again.", t.ansi1),
      available: () => help(t, typeof shownAt === "number" ? last(shownAt) : "Not checked yet."),
      uptodate: () => h_flex().gap(6).items_center().child(glyph("check", 13, t.ansi2)).child(help(t, `You’re up to date. ${last(status.at)}`)),
      unchecked: () => help(t, "Not checked yet."),
    }[status.kind]();
    const control = status.kind === "checking"
      ? h_flex().h(34).px(16).gap(6).items_center().text_size(13.5).text_color(t.muted).child(spinner(13, t.muted)).child("Checking…")
      : button(t, "settings-check", status.kind === "failed" ? "Try again" : "Check now", (cx) => this.checkNow(cx));
    return [...(status.kind === "available" ? [this.available(t, status)] : []), row(t, "settings-version", title, line, [control])];
  }

  switchRow(t, key, last = false) {
    const s = SETTINGS.find((x) => x.key === key), on = this.draft[key] === true;
    return row(t, `settings-${key}`, s.label, help(t, s.about), [toggle(t, `settings-${key}-switch`, on, (_e, cx) => this.set(key, !on, cx))], last);
  }

  // A choice as Herdr's segmented picker; dimmed while labels are hidden.
  choiceRow(t, key, last = false) {
    const s = SETTINGS.find((x) => x.key === key), value = this.draft[key], off = key.startsWith("labels.") && this.draft["labels.show"] === false;
    const picker = h_flex().id(`settings-${key}-picker`).gap(2).p(2).rounded(8).border_1().border_color(t.border)
      .children(s.choices.map((choice) => div().id(`settings-${key}-${choice}`).px(12).py(5).rounded(6).text_size(13).cursor_pointer()
        .bg(choice === value ? t.selected : "#00000000").text_color(choice === value ? t.foreground : t.muted)
        .hover((x) => x.text_color(t.foreground))
        .on_click((_e, cx) => this.set(key, choice, cx))
        .child(choice[0].toUpperCase() + choice.slice(1))));
    return row(t, `settings-${key}`, s.label, help(t, s.about), [picker], last).when(off, (el) => el.opacity(0.45));
  }

  render() {
    const t = theme(), ready = Boolean(this.draft);
    const authors = SETTINGS.find((x) => x.key === "external.ignoreAuthors");
    const body = !ready ? [help(t, "Reading the settings…")] : [
      heading(t, "Updates", true),
      ...this.updates(t),
      this.switchRow(t, "update_check", true),
      heading(t, "List"),
      this.switchRow(t, "compact_rows"),
      this.switchRow(t, "labels.show"),
      this.choiceRow(t, "labels.color", true),
      heading(t, "External filter"),
      this.switchRow(t, "external.includeBots"),
      row(t, "settings-ignore", authors.label, help(t, authors.about),
        [div().id("settings-ignore-field").w(200).h(34).px(11).flex().items_center().rounded(8).border_1().border_color(t.border).bg(t.background).cursor_text()
          .child(Input.new(this.authors).w_full().text_size(13).text_color(t.foreground))], true),
      h_flex().id("settings-footer").gap(18).pt(26).pb(6).items_center().flex_wrap()
        .child(div().flex_1().text_size(12.5).text_color(t.muted).child("GitHub Checker is free and open source."))
        .child(link(t, "settings-github", "GitHub", "github", GITHUB_URL))
        .child(link(t, "settings-coffee", "Buy me a coffee", "coffee", COFFEE_URL)),
    ];
    // The overlay has no frame and is only the room for the dialog: the card below is as tall as its content, centered,
    // and never taller than the room; then the body shrinks and scrolls, header and footer stay.
    const card = v_flex().id("settings").track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { this.close(); cx.stop_propagation(); } })
      .w_full().max_h_full().overflow_hidden().rounded(10).border_1().border_color(t.border).shadow_xl().bg(t.popover).text_color(t.foreground)
      .child(h_flex().flex_none().items_center().px(30).pt(22).pb(8)
        .child(div().flex_1().text_size(17).font_medium().child("GitHub Checker Settings"))
        .child(div().id("settings-esc").px(7).py(3).rounded(6).border_1().border_color(t.border).text_size(11.5).text_color(t.muted)
          .cursor_pointer().hover((s) => s.bg(t.hover)).tooltip("Close").on_click(() => this.close()).child("Esc")))
      .child(v_flex().relative().flex_shrink(1).min_h(0)
        .child(div().id("settings-body").flex_shrink(1).min_h(0).overflow_y_scroll().child(v_flex().px(30).pb(10).children(body)))
        .child(Scrollbar.vertical("settings-body").absolute().inset_0()))
      .child(h_flex().flex_none().gap(10).px(30).py(16).items_center().border_t(1).border_color(t.border)
        .child(div().flex_1().min_w(0).text_size(11.5).text_color(t.ansi1).child(this.error ?? ""))
        .child(button(t, "settings-cancel", "Cancel", () => this.close()))
        .child(button(t, "settings-save", this.busy ? "Saving…" : "Save", (cx) => this.save(cx), { primary: true })));
    return v_flex().size_full().justify_center().child(card);
  }
}
