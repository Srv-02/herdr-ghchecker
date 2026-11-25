import { test } from "node:test";
import assert from "node:assert/strict";
import { SETTINGS, CONFIG_FILE, parseSettings, defaults, loadSettings, parseLogins, withSettings, saveSettings } from "../mods/ghchecker/lib/settings.js";

test("every setting has a key, a type, a default and a description", () => {
  assert.equal(CONFIG_FILE, "ghchecker.json");
  for (const s of SETTINGS) {
    assert.match(s.key, /^[a-z_]+(\.[a-zA-Z]+)?$/);
    assert.ok(["boolean", "logins", "choice"].includes(s.type), s.key);
    assert.ok(s.label, s.key);
    assert.ok(s.about.length > 10, s.key);
    assert.ok("default" in s, s.key);
  }
  assert.deepEqual(defaults(), { update_check: true, compact_rows: false, "labels.show": true, "labels.color": "color", "external.includeBots": false, "external.ignoreAuthors": [] });
});

test("a missing or empty file means the defaults, without problems", () => {
  for (const text of [null, undefined, "", "  \n"]) assert.deepEqual(parseSettings(text), { values: defaults(), problems: [] });
});

test("nested and dotted keys", () => {
  assert.deepEqual(parseSettings('{ "update_check": false, "labels": { "color": "mono" }, "external": { "includeBots": true, "ignoreAuthors": [" hubot ", "hubot", ""] } }').values,
    { ...defaults(), update_check: false, "labels.color": "mono", "external.includeBots": true, "external.ignoreAuthors": ["hubot"] });
  assert.equal(parseSettings('{ "external.includeBots": true }').values["external.includeBots"], true);
});

test("broken values fall back to the default and are named", () => {
  const r = parseSettings('{ "compact_rows": 1, "labels": { "show": "no", "color": "rainbow" }, "external": { "includeBots": "yes", "ignoreAuthors": ["ok", 3] } }');
  assert.deepEqual(r.values, defaults());
  assert.deepEqual(r.problems, ["compact_rows", "labels.show", "labels.color", "external.includeBots", "external.ignoreAuthors"]);
  assert.deepEqual(parseSettings("{ not json").problems, ["ghchecker.json"]);
  assert.deepEqual(parseSettings("{ not json").values, defaults());
  assert.deepEqual(parseSettings("[1, 2]").values, defaults());
  assert.deepEqual(parseSettings('"text"').problems, ["ghchecker.json"]);
  assert.deepEqual(parseSettings('{ "other": 1 }'), { values: defaults(), problems: [] }, "unknown keys are left alone");
});

test("defaults are fresh copies", () => {
  const a = defaults(); a["external.ignoreAuthors"].push("x");
  assert.deepEqual(defaults()["external.ignoreAuthors"], []);
});

test("loadSettings reads ghchecker.json in the app folder; a failed read means the defaults", async () => {
  const asked = [];
  const r = await loadSettings(async (p) => { asked.push(p); return '{ "external": { "includeBots": true } }'; }, () => "/app");
  assert.deepEqual(asked, ["/app/ghchecker.json"]);
  assert.equal(r.values["external.includeBots"], true);
  assert.deepEqual((await loadSettings(async () => null, () => "/app")).values, defaults());
  assert.deepEqual((await loadSettings(async () => { throw new Error("denied"); }, () => "/app")).values, defaults());
});

test("parseLogins: commas or spaces, @ dropped, duplicates once", () => {
  assert.deepEqual(parseLogins(" @hubot, octocat  hubot,,"), ["hubot", "octocat"]);
  assert.deepEqual(parseLogins(""), []);
});

test("withSettings writes nested keys, keeps the rest and a dotted key the person wrote", () => {
  const out = JSON.parse(withSettings('{ "other": 1, "external.includeBots": false }', { "external.includeBots": true, "labels.color": "mono", compact_rows: true }));
  assert.deepEqual(out, { other: 1, "external.includeBots": true, labels: { color: "mono" }, compact_rows: true });
  assert.deepEqual(JSON.parse(withSettings(null, { update_check: false })), { update_check: false });
  assert.deepEqual(JSON.parse(withSettings('{ "labels": "x" }', { "labels.show": false })), { labels: { show: false } }, "a non-object in the way is replaced");
  assert.throws(() => withSettings("{ broken", { update_check: false }));
  assert.throws(() => withSettings("[1]", { update_check: false }), /not a JSON object/);
  assert.throws(() => withSettings("{}", { "labels.color": "rainbow" }), /not a setting/);
  assert.throws(() => withSettings("{}", { nope: true }), /not a setting/);
});

test("saveSettings reads, then writes only if the file is unchanged (expected text)", async () => {
  const calls = [];
  await saveSettings({ compact_rows: true }, { readTextFile: async () => null, writeTextFile: async (...a) => { calls.push(a); }, appHome: () => "/app" });
  assert.deepEqual(calls, [["/app/ghchecker.json", '{\n  "compact_rows": true\n}\n', null]]);
});

test("changedSettings: only what differs goes to the file", async () => {
  const { changedSettings } = await import("../mods/ghchecker/lib/settings.js");
  const before = defaults();
  assert.deepEqual(changedSettings(before, { ...before }), {});
  assert.deepEqual(changedSettings(before, { ...before, compact_rows: true, "external.ignoreAuthors": ["hubot"] }), { compact_rows: true, "external.ignoreAuthors": ["hubot"] });
});
