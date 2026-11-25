import { test } from "node:test";
import assert from "node:assert/strict";
import { visibleLabels, labelHex } from "../mods/ghchecker/lib/labels.js";

const BUG = { name: "bug", color: "d73a4a" }, UI = { name: "ui", color: "#0E8A16" }, ODD = { name: "odd", color: "red" };

test("visibleLabels: all by default, at most max, none with labels.show off", () => {
  assert.deepEqual(visibleLabels([BUG, UI, ODD]), [BUG, UI, ODD]);
  assert.deepEqual(visibleLabels([BUG, UI, ODD], {}, 2), [BUG, UI]);
  assert.deepEqual(visibleLabels([BUG, UI], { "labels.show": true }, 3), [BUG, UI]);
  assert.deepEqual(visibleLabels([BUG, UI], { "labels.show": false }, 3), []);
  assert.deepEqual(visibleLabels(null), []);
  assert.deepEqual(visibleLabels([null, { color: "fff" }, BUG]), [BUG], "entries without a name are skipped");
});

test("labelHex: the GitHub color, or null for mono and unusable colors", () => {
  assert.equal(labelHex(BUG), "#d73a4a");
  assert.equal(labelHex(UI, { "labels.color": "color" }), "#0E8A16");
  assert.equal(labelHex(BUG, { "labels.color": "mono" }), null);
  assert.equal(labelHex(ODD), null);
  assert.equal(labelHex({ name: "x" }), null);
});
