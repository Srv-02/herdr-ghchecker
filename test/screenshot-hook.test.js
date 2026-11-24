// The screenshot hook (scripts/screenshots/demo-hook.mjs) patches a COPY of the mod for the demo instance. Its anchors are exact
// text of the mod, so a change of the mod can break it silently: this test applies it to a fresh copy of mods/ghchecker and fails
// when an anchor is gone. It also checks that the shipped mod itself carries no trace of the hook or the demo data.
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { mkTmpSync } from "./tmp-helper.js";

const root = path.resolve(import.meta.dirname, "..");
const mod = path.join(root, "mods/ghchecker");
const hook = path.join(root, "scripts/screenshots/demo-hook.mjs");

function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const p = path.join(dir, e.name);
    return e.isDirectory() ? files(p) : [p];
  });
}

test("the hook and the demo are not part of the shipped mod", () => {
  for (const f of files(mod)) {
    const text = fs.readFileSync(f, "utf8");
    for (const trace of ["demo-hook", "screenshots/demo", "acme-app", "realAvatar", "mona"]) {
      assert.ok(!text.includes(trace), `${path.relative(root, f)} must not contain "${trace}"`);
    }
  }
});

test("demo-hook.mjs applies to the current mod and the result still parses", () => {
  const copy = path.join(mkTmpSync("ghchecker-hook-"), "ghchecker");
  fs.cpSync(mod, copy, { recursive: true });
  const r = spawnSync("node", [hook, copy], { encoding: "utf8" });
  assert.equal(r.status, 0, r.stderr);
  const gh = fs.readFileSync(path.join(copy, "gh.js"), "utf8"), media = fs.readFileSync(path.join(copy, "media.js"), "utf8");
  assert.ok(gh.includes(JSON.stringify(path.join(root, "scripts/screenshots/demo/gh"))));
  assert.ok(media.includes('export const avatar = () => ({ got: "missing" });'));
  for (const text of [gh, media]) {
    const c = spawnSync("node", ["--check", "--input-type=module"], { input: text, encoding: "utf8" });
    assert.equal(c.status, 0, c.stderr);
  }
  assert.ok(!fs.readFileSync(path.join(mod, "gh.js"), "utf8").includes("demo-hook"), "the repo's mod is untouched");
});

test("demo-hook.mjs fails loudly when an anchor is missing", () => {
  const copy = path.join(mkTmpSync("ghchecker-hook-"), "ghchecker");
  fs.cpSync(mod, copy, { recursive: true });
  const file = path.join(copy, "gh.js");
  fs.writeFileSync(file, fs.readFileSync(file, "utf8").replace('const GH = "gh";', 'const GH = "/usr/bin/gh";'));
  const r = spawnSync("node", [hook, copy], { encoding: "utf8" });
  assert.notEqual(r.status, 0);
  assert.match(r.stderr, /anchor not found/);
});

test("the fake gh answers every call the panel makes", () => {
  const gh = (...args) => spawnSync(path.join(root, "scripts/screenshots/demo/gh"), args, { encoding: "utf8" });
  assert.equal(gh("api", "user", "--jq", ".login").stdout.trim(), "mona");
  for (const args of [["issue", "list", "-R", "acme/acme-app", "--state", "open"], ["pr", "list", "-R", "acme/acme-app", "--state", "merged"], ["run", "list", "-R", "acme/acme-app"],
    ["api", "repos/acme/acme-app/milestones?state=all&per_page=100"], ["repo", "view", "acme/acme-app"], ["pr", "view", "47"], ["issue", "view", "46"], ["run", "view", "9127", "--json", "jobs"],
    ["api", "--paginate", "--slurp", "repos/acme/acme-app/issues/47/timeline?per_page=100"]]) {
    const r = gh(...args);
    assert.equal(r.status, 0, args.join(" "));
    assert.doesNotThrow(() => JSON.parse(r.stdout), args.join(" "));
  }
  assert.equal(gh("pr", "merge", "47", "-R", "acme/acme-app", "--squash").stdout.trim(), "ok", "writes change nothing");
  assert.notEqual(gh("secret", "list").status, 0);
});
