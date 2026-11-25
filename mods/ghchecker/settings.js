// The Settings dialog (an overlay of this mod, props { settings: true }), laid out like Filer Pro's: Updates on top
// (the installed version, Check now, and what to do when a new release is out), then the settings of lib/settings.js,
// then the links. Every change is written to ghchecker.json at once and the panel reads it again (shared
// "ghchecker.config"); there is no Save button.
// Layout and controls adapted from filer-pro by Michael Mayer (MIT), mods/filer-pro/ui/settings.js.
import { div } from "gpui-kit";
import { v_flex, h_flex, InputState, Input, Scrollbar } from "gpui-base";
import { theme, closeOverlay, appHome, readTextFile, writeTextFile, shared, setShared, notify } from "herdr";
import { glyph, spinner, openUrl } from "./ui.js";
import { SETTINGS, CONFIG_FILE, parseSettings, parseLogins, saveSettings } from "./lib/settings.js";
import { fetchRelease, localVersion, updateStatus, checkedAt, GITHUB_URL, COFFEE_URL, UPDATE_PROMPT } from "./lib/update.js";

const help = (t, text, color = null) => div().text_size(12.5).line_height("18px").text_color(color ?? t.muted).child(text);
const heading = (t, text, first = false) => div().pt(first ? 4 : 22).pb(8).text_size(12).font_semibold().text_color(t.muted).child(text.toUpperCase());

// One setting: the label, its help line below it, the control on the right.
function row(t, id, title, about, controls, last = false) {
  return h_flex().id(id).w_full().gap(16).py(12).items_center()
    .when(!last, (el) => el.border_b(1).border_color(t.border))
    .child(v_flex().flex_1().min_w(0).gap(3).child(div().text_size(14).text_color(t.foreground).child(title)).child(about))
    .child(h_flex().flex_none().gap(8).items_center().children(controls));
}

// Herdr's own switch: 36x20, knob 16, accent when on.
const toggle = (t, id, on, onClick) => div().id(id).w(36).h(20).flex_none().rounded(10).p(2).flex().bg(on ? t.accent : t.hover)
  .when(on, (el) => el.justify_end()).cursor_pointer().on_click(onClick)
  .child(div().w(16).h(16).rounded(8).bg(on ? t.accent_foreground : t.muted));

const button = (t, id, text, onClick, primary = false) => h_flex().id(id).px(12).py(5).gap(6).items_center().rounded(7).cursor_pointer().text_size(13)
  .when(primary, (el) => el.bg(t.accent).text_color(t.accent_foreground).font_semibold())
  .when(!primary, (el) => el.border_1().border_color(t.border).bg(t.raised).text_color(t.foreground))
  .hover((s) => s.opacity(0.88)).on_click((_e, cx) => onClick(cx)).child(text);

const link = (t, id, text, icon, url) => h_flex().id(id).gap(6).items_center().cursor_pointer().text_size(12.5).text_color(t.muted)
  .hover((s) => s.text_color(t.foreground)).on_click(() => openUrl(url)).child(glyph(icon, 14, t.muted)).child(text);

export class SettingsDialog {
  constructor(overlay, cx) {
    this.overlay = overlay; this.values = null; this.error = null; this.check = { phase: "idle" }; this.version = null;
    this.handle = cx.focus_handle();
    this.authors = InputState.new({ placeholder: "hubot, octocat" });
    this.authors.on("blur", (_e, cx) => this.saveAuthors(cx));
    this.authors.on("submit", (_e, cx) => this.saveAuthors(cx));
    cx.spawn(async (cx) => {
      const [text, mod] = await Promise.all([readTextFile(`${appHome()}/${CONFIG_FILE}`).catch(() => null), readTextFile(`${appHome()}/mods/ghchecker/mod.json`).catch(() => null)]);
      const { values, problems } = parseSettings(text);
      this.values = values; this.version = localVersion(mod);
      if (problems.includes(CONFIG_FILE)) this.error = `${CONFIG_FILE} has a typo: fix or delete it, then reopen Settings.`;
      this.authors.set_value(values["external.ignoreAuthors"].join(", "));
      cx.notify();
    });
    this.handle.focus();
  }

  close() { closeOverlay(this.overlay); }

  // One change, written at once; the panel reads the file again.
  save(edits, cx) {
    if (this.error?.includes("typo")) return;
    Object.assign(this.values, edits); cx.notify();
    cx.spawn(async (cx) => {
      try { await saveSettings(edits, { readTextFile, writeTextFile, appHome }); setShared("ghchecker.config", { at: Date.now() }); }
      catch (e) { this.error = `Not saved: ${String(e?.message ?? e)}`; cx.notify(); }
    });
  }
  saveAuthors(cx) {
    const list = parseLogins(this.authors.value());
    if (JSON.stringify(list) !== JSON.stringify(this.values?.["external.ignoreAuthors"])) this.save({ "external.ignoreAuthors": list }, cx);
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
        if (this.version && this.values?.update_check !== false) setShared("ghchecker.update", state);
        this.check = { phase: "done", state };
      }
      cx.notify();
    });
  }

  updates(t) {
    const status = updateStatus(this.check, shared("ghchecker.update"), this.version);
    const title = this.version ? `GitHub Checker ${this.version}` : "GitHub Checker";
    const line = {
      checking: () => help(t, "Asking GitHub for the latest version…"),
      failed: () => help(t, "Could not reach GitHub. Check your connection and try again.", t.ansi1),
      available: () => h_flex().gap(6).items_center().child(div().w(7).h(7).flex_none().rounded(4).bg(t.ansi4)).child(help(t, `${status.version} available`, t.foreground)),
      uptodate: () => h_flex().gap(6).items_center().child(glyph("check", 13, t.ansi2)).child(help(t, `You’re up to date. Last checked ${checkedAt(status.at, Date.now())}.`)),
      unchecked: () => help(t, "Not checked yet."),
    }[status.kind]();
    const control = {
      checking: () => h_flex().px(12).py(5).gap(6).items_center().text_size(13).text_color(t.muted).child(spinner(13, t.muted)).child("Checking…"),
      failed: () => button(t, "settings-retry", "Try again", (cx) => this.checkNow(cx)),
      available: () => button(t, "settings-release", h_flex().gap(6).items_center().child(`What’s new in ${status.version}`).child(glyph("external", 13, t.accent_foreground)), () => openUrl(status.url), true),
      uptodate: () => button(t, "settings-check", "Check now", (cx) => this.checkNow(cx)),
      unchecked: () => button(t, "settings-check", "Check now", (cx) => this.checkNow(cx)),
    }[status.kind]();
    const out = [row(t, "settings-version", title, line, [control], false)];
    if (status.kind === "available") {
      out.push(v_flex().id("settings-how").gap(6).my(10).px(12).py(10).rounded(8).bg(t.hover)
        .child(help(t, "To update, ask your agent in Herdr:"))
        .child(h_flex().gap(8).items_center()
          .child(div().flex_1().min_w(0).px(8).py(5).rounded(6).bg(t.background).font_family("JetBrains Mono").text_size(11.5).text_color(t.foreground).child(UPDATE_PROMPT))
          .child(button(t, "settings-copy-prompt", "Copy", (cx) => { cx.write_to_clipboard(UPDATE_PROMPT); notify({ title: "Copied", body: "Paste it to your agent in Herdr.", level: "success", timeout: 2500 }); }))));
    }
    return out;
  }

  switchRow(t, key, last = false) {
    const s = SETTINGS.find((x) => x.key === key), on = this.values[key] === true;
    return row(t, `settings-${key}`, s.label, help(t, s.about), [toggle(t, `settings-${key}-switch`, on, (_e, cx) => this.save({ [key]: !on }, cx))], last);
  }

  // A choice as Herdr's segmented picker; dimmed while labels are hidden.
  choiceRow(t, key, last = false) {
    const s = SETTINGS.find((x) => x.key === key), value = this.values[key], off = key.startsWith("labels.") && this.values["labels.show"] === false;
    const picker = h_flex().id(`settings-${key}-picker`).gap(2).p(2).rounded(8).border_1().border_color(t.border).bg(t.background)
      .children(s.choices.map((choice) => div().id(`settings-${key}-${choice}`).px(12).py(4).rounded(6).text_size(13).border_1().cursor_pointer()
        .when(choice === value, (el) => el.bg(t.raised).text_color(t.foreground).border_color(t.border))
        .when(choice !== value, (el) => el.border_color("#00000000").text_color(t.muted).hover((x) => x.text_color(t.foreground)))
        .on_click((_e, cx) => { if (choice !== value) this.save({ [key]: choice }, cx); })
        .child(choice[0].toUpperCase() + choice.slice(1))));
    return row(t, `settings-${key}`, s.label, help(t, s.about), [picker], last).when(off, (el) => el.opacity(0.45));
  }

  render(cx) {
    const t = theme(), ready = Boolean(this.values);
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
      v_flex().id("settings-ignore").gap(8).py(12)
        .child(v_flex().gap(3).child(div().text_size(14).child(authors.label)).child(help(t, authors.about)))
        .child(Input.new(this.authors).w_full().h(28).px(8).rounded(6).border_1().border_color(t.input ?? t.border).bg(t.background).text_size(13).text_color(t.foreground)),
      h_flex().id("settings-footer").gap(18).pt(26).pb(6).items_center().flex_wrap()
        .child(div().flex_1().text_size(12.5).text_color(t.muted).child("GitHub Checker is free and open source."))
        .child(link(t, "settings-github", "GitHub", "github", GITHUB_URL))
        .child(link(t, "settings-coffee", "Buy me a coffee", "coffee", COFFEE_URL)),
    ];
    return v_flex().id("settings").track_focus(this.handle)
      .on_key_down((e, cx) => { if (e.key === "escape") { this.close(); cx.stop_propagation(); } })
      .size_full().bg(t.popover).text_color(t.foreground)
      .child(h_flex().flex_none().items_center().px(24).pt(18).pb(10)
        .child(div().flex_1().text_size(15).font_semibold().child("GitHub Checker Settings"))
        .child(div().id("settings-esc").px(6).py(2).rounded(5).border_1().border_color(t.border).text_size(11).text_color(t.muted)
          .cursor_pointer().hover((s) => s.bg(t.hover)).tooltip("Close").on_click(() => this.close()).child("Esc")))
      .child(div().relative().flex_1().min_h(0)
        .child(div().id("settings-body").size_full().overflow_y_scroll().child(v_flex().px(24).pt(4).pb(18).children(body)))
        .child(Scrollbar.vertical("settings-body").absolute().inset_0()))
      .child(h_flex().flex_none().gap(8).px(24).py(12).items_center().border_t(1).border_color(t.border)
        .child(div().flex_1().min_w(0).text_size(11.5).text_color(t.ansi1).child(this.error ?? ""))
        .child(h_flex().id("settings-done").h(32).px(14).items_center().rounded(8).bg(t.solid ?? t.accent).text_color(t.solid_foreground ?? t.accent_foreground)
          .text_size(12.5).font_medium().cursor_pointer().hover((s) => s.opacity(0.88)).on_click(() => this.close()).child("Done")));
  }
}
