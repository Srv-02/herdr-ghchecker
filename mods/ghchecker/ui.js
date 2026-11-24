// Shared pieces of the panel and its overlays: theme colors for the states, icons, buttons, chips.
// Buttons, segmented control and blankslate adapted from herdr-github by alarboulletmarin (MIT), mods/github/ui.js at 75a2b40;
// the colors come from the herdr theme instead of GitHub's Primer palette.
import { div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { exec } from "herdr";

export const MONO = "JetBrains Mono";
export const CLEAR = "#00000000";

// Tone (lib/status.js) to a color of the theme: ANSI green, red, yellow, magenta and blue, so every theme,
// light or dark, draws the states in its own palette.
export function tones(t) {
  const green = t.ansi2 ?? t.done, red = t.ansi1 ?? t.blocked, yellow = t.ansi3 ?? t.working, magenta = t.ansi5 ?? t.accent;
  return { open: green, success: green, done: magenta, closed: red, failure: red, running: yellow, neutral: t.muted, link: t.ansi4 ?? t.accent };
}

// A theme color with an alpha, for tinted backgrounds and borders. Only #rrggbb gets one.
export const alpha = (color, a) => /^#[0-9a-f]{6}$/i.test(color ?? "") ? `${color}${a}` : color;

const icon = (name) => `mods/ghchecker/icons/${name}.svg`;
export const glyph = (name, size, color) => svg(icon(name)).size(size).flex_none().text_color(color);
export const spinner = (size, color) => svg("mods/workspace-chrome/spinner.svg").size(size).flex_none().text_color(color).spin(900);
export const glyphOf = (name, size, color) => name === "spin" ? spinner(size, color) : glyph(name, size, color);

export function openUrl(url) {
  if (!/^https?:\/\//.test(String(url ?? ""))) return;
  exec("open", [url]).catch(() => exec("xdg-open", [url]).catch(() => null));
}

// Buttons: default (bordered), primary (the theme's accent), filled with a tone color (the merge button),
// invisible (no border).
export function button(id, label, t, onClick, { primary = false, tone = null, invisible = false, enabled = true, icon: name = null, tint = null, small = false, tooltip = null } = {}) {
  const fill = enabled ? (tone ?? (primary ? t.accent : null)) : null, h = small ? 26 : 30;
  const ink = fill ? (tone ? t.background : t.accent_foreground ?? t.background) : enabled ? (invisible ? t.muted : t.foreground) : t.dim;
  return h_flex().id(id).h(h).px(label === "" ? (small ? 6 : 8) : (small ? 8 : 11)).gap(6).flex_none().items_center().justify_center().rounded(7)
    .text_size(12).font_medium()
    .bg(fill ?? CLEAR).border_1().border_color(fill ?? (invisible ? CLEAR : t.border))
    .text_color(ink)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .when(enabled, (e) => e.cursor_pointer().hover((s) => s.bg(fill ? alpha(fill, "dd") : t.hover)).on_click(onClick))
    .when(Boolean(tooltip), (e) => e.tooltip(tooltip))
    .when(Boolean(name), (e) => e.child(glyphOf(name, 13, tint ?? ink)))
    .when(label !== "", (e) => e.child(label));
}

// A segmented control: items [[key, label]], the one equal to `value` selected.
export function segmented(id, items, value, t, onPick) {
  return h_flex().id(id).flex_none().p(2).gap(2).rounded(8).border_1().border_color(t.border)
    .children(items.map(([key, label]) => {
      const on = key === value;
      return div().id(`${id}-${key}`).px(8).py(3).rounded(6).text_size(12).cursor_pointer()
        .bg(on ? t.selected : CLEAR).text_color(on ? t.foreground : t.muted)
        .hover((s) => s.text_color(t.foreground))
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => onPick(key, cx)).child(label);
    }));
}

// A rounded outline chip in one color ("draft").
export const chip = (label, color, small = true) => div().flex_none().px(small ? 7 : 8).py(small ? 0 : 1).rounded(9).border_1().border_color(color)
  .text_size(small ? 11 : 12).text_color(color).child(label);

// A repository label: outlined in its own color, as on GitHub (the color is the label's, not the theme's).
export function labelChip(l, t) {
  const c = `#${String(l.color ?? "888888").replace("#", "")}`;
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
  const visible = (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.3;
  return chip(l.name, visible ? c : t.muted);
}

// A pill filled with a tint of the color: the state in an overlay's byline.
export const pill = (label, color, name = null) => h_flex().flex_none().h(24).px(10).gap(5).items_center().rounded(12).bg(alpha(color, "2e"))
  .text_size(12).font_medium().text_color(color)
  .when(Boolean(name), (e) => e.child(glyphOf(name, 13, color))).child(label);

// A checkbox with its label.
export function checkbox(id, label, on, t, onFlip, enabled = true) {
  return h_flex().id(id).gap(7).items_center().text_size(12).text_color(enabled ? t.foreground : t.dim)
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
    .when(enabled, (e) => e.cursor_pointer().on_click(onFlip))
    .child(div().size(14).flex_none().flex().items_center().justify_center().rounded(3).border_1()
      .border_color(on && enabled ? t.accent : t.border).bg(on && enabled ? t.accent : CLEAR)
      .when(on && enabled, (x) => x.child(glyph("check", 11, t.accent_foreground ?? t.background))))
    .child(label);
}

// An empty or failed state: an icon, a heading, a line, and what to do next.
export function blankslate(t, { icon: name = null, title, body = null, actions = [], code = null, tone = null }) {
  return v_flex().flex_1().w_full().items_center().justify_center().px(32).gap(10)
    .when(Boolean(name), (e) => e.child(glyphOf(name, 22, tone ?? t.dim)))
    .child(div().font_semibold().text_color(t.foreground).text_center().child(title))
    .when(Boolean(body), (e) => e.child(div().max_w(320).text_size(12).text_color(t.muted).text_center().child(body)))
    .when(Boolean(code), (e) => e.child(div().px(10).py(6).rounded(6).bg(t.raised).border_1().border_color(t.border)
      .font_family(MONO).text_size(11.5).text_color(t.foreground).child(code)))
    .when(actions.length > 0, (e) => e.child(h_flex().mt(4).gap(8).flex_wrap().justify_center().children(actions)));
}
