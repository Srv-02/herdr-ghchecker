import { test } from "node:test";
import assert from "node:assert/strict";
import { SETTINGS, CONFIG_FILE, parseSettings, defaults, loadSettings } from "../mods/ghchecker/lib/settings.js";

test("every setting has a key, a type, a default and a description", () => {
  assert.equal(CONFIG_FILE, "ghchecker.json");
  for (const s of SETTINGS) {
    assert.match(s.key, /^[a-z]+\.[a-zA-Z]+$/);
    assert.ok(["boolean", "logins"].includes(s.type), s.key);
    assert.ok(s.about.length > 10, s.key);
    assert.ok("default" in s, s.key);
  }
  assert.deepEqual(defaults(), { "external.includeBots": false, "external.ignoreAuthors": [] });
});

test("a missing or empty file means the defaults, without problems", () => {
  for (const text of [null, undefined, "", "  \n"]) assert.deepEqual(parseSettings(text), { values: defaults(), problems: [] });
});

test("nested and dotted keys", () => {
  assert.deepEqual(parseSettings('{ "external": { "includeBots": true, "ignoreAuthors": [" hubot ", "hubot", ""] } }').values,
    { "external.includeBots": true, "external.ignoreAuthors": ["hubot"] });
  assert.equal(parseSettings('{ "external.includeBots": true }').values["external.includeBots"], true);
});

test("broken values fall back to the default and are named", () => {
  const r = parseSettings('{ "external": { "includeBots": "yes", "ignoreAuthors": ["ok", 3] } }');
  assert.deepEqual(r.values, defaults());
  assert.deepEqual(r.problems, ["external.includeBots", "external.ignoreAuthors"]);
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
