import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { hoverWithoutId } from "../scripts/hoverids.mjs";

// GPUI (gpui-pre 0.3.8, div.rs) notifies the view of a hover change only through the element's hover state, and an
// element has that state only with an identity. A row of the virtual list without .id() kept its old look until some
// other repaint came along, so the hover background showed late.
test("the rows of the virtual list carry their key as element id", () => {
  const src = fs.readFileSync(new URL("../mods/ghchecker/main.js", import.meta.url), "utf8");
  assert.match(src, /row\(key, size, t\) \{\s*return h_flex\(\)\.id\(key\)/);
  assert.match(src, /draw: \(sz\) => draw\(sz, key\)/);
});

test("hoverWithoutId: finds a hover without id, also through .when() and helpers", () => {
  const lines = (src) => hoverWithoutId(src).map((h) => h.line);
  assert.deepEqual(lines("div().px(4).hover((s) => s.bg(x)).child(\"a\")"), [1]);
  assert.deepEqual(lines("h_flex().id(\"a\").px(4).hover((s) => s.bg(x))"), []);
  assert.deepEqual(lines("div().hover((s) => s.bg(x)).id(`a-${n}`)"), [], "an id after the hover counts");
  assert.deepEqual(lines("div().id(\"a\")\n  .when(on, (e) => e.cursor_pointer().hover((s) => s.bg(x)))"), [], "through .when()");
  assert.deepEqual(lines("div()\n  .when(on, (e) => e.hover((s) => s.bg(x)))"), [2]);
  assert.deepEqual(lines("h_flex().id(\"a\").child(div().hover((s) => s.bg(x)))"), [1], "the parent's id is not the child's");
  assert.deepEqual(lines("this.row(size, t).hover((s) => s.bg(x))"), [1], "a helper's chain needs the id at the call site");
  assert.deepEqual(lines("// div().hover((s) => s.bg(x))\nconst t = \".hover(\";"), [], "comments and strings are not code");
});

test("no element in the mod has .hover() without .id()", () => {
  const dir = new URL("../mods/ghchecker/", import.meta.url).pathname;
  const files = fs.readdirSync(dir, { recursive: true }).filter((f) => f.endsWith(".js"));
  const found = files.flatMap((f) => hoverWithoutId(fs.readFileSync(path.join(dir, f), "utf8")).map((h) => `${f}:${h.line} ${h.chain}`));
  assert.deepEqual(found, []);
});
