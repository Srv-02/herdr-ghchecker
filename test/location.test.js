import { test } from "node:test";
import assert from "node:assert/strict";
import { locationOf, locationKey, slugOf, pickRemote, shortPath, repoUrl } from "../mods/ghchecker/lib/location.js";

const spaces = [{ id: "s1", active: true, folder: "/Users/mona/git/acme-app", machine: null, branch: "main" }];
const panes = [
  { pane: "p1", terminal: "t1", cwd: "/Users/mona/git/acme-app/src", branch: "fix/empty-cart" },
  { pane: "p2", terminal: null, mod: "ghchecker" },
];

test("locationOf: the focused pane's folder and branch on this computer", () => {
  assert.deepEqual(locationOf({ spaces, panes, focused: { space: "s1", pane: "p1", terminal: "t1", cwd: null } }),
    { cwd: "/Users/mona/git/acme-app/src", on: null, branch: "fix/empty-cart" });
});

test("locationOf: a terminal block of a remote machine names its machine", () => {
  assert.deepEqual(locationOf({ spaces, panes, focused: { space: "s1", pane: null, terminal: "devbox/t7", cwd: "/srv/app" } }),
    { cwd: "/srv/app", on: "devbox", branch: "main" });
  assert.equal(locationOf({ spaces, panes, focused: { space: "s1", pane: null, terminal: "t7", cwd: "/x" } }).on, null);
});

test("locationOf: a space on a machine, and the space folder when nothing is focused", () => {
  const remote = [{ id: "s2", active: true, folder: "/home/dev/app", machine: "devbox", branch: null }];
  assert.deepEqual(locationOf({ spaces: remote, panes: [], focused: null }), { cwd: "/home/dev/app", on: "devbox", branch: null });
});

test("locationOf: a focused mod pane keeps the last location", () => {
  const last = { cwd: "/a", on: null, branch: "main" };
  assert.equal(locationOf({ spaces, panes, focused: { space: "s1", pane: "p2", terminal: null } }, last), last);
  assert.equal(locationOf({ spaces, panes, focused: { space: "s1", pane: "p2", terminal: null } }).cwd, "/Users/mona/git/acme-app", "no last: the space folder");
});

test("locationKey: folder and machine, null without a folder", () => {
  assert.equal(locationKey({ cwd: "/a", on: null }), '[null,"/a"]');
  assert.equal(locationKey({ cwd: "/a", on: "devbox" }), '["devbox","/a"]');
  assert.notEqual(locationKey({ cwd: "/a", on: "devbox" }), locationKey({ cwd: "/a", on: null }));
  assert.equal(locationKey({ cwd: "/a", on: null, branch: "x" }), locationKey({ cwd: "/a", on: null, branch: "y" }), "the branch is no part of it");
  assert.equal(locationKey({ cwd: null }), null);
  assert.equal(locationKey(null), null);
});

test("slugOf: https, ssh and scp-style remotes on github.com", () => {
  assert.equal(slugOf("https://github.com/acme/acme-app.git"), "acme/acme-app");
  assert.equal(slugOf("git@github.com:acme/acme-app.git\n"), "acme/acme-app");
  assert.equal(slugOf("ssh://git@github.com/acme/acme.app"), "acme/acme.app");
  assert.equal(slugOf("https://github.com/acme/acme-app/"), "acme/acme-app");
  assert.equal(slugOf("https://gitlab.com/acme/acme-app.git"), null);
  assert.equal(slugOf("https://github.com/acme/a?b"), null, "only name characters");
  assert.equal(slugOf(null), null);
});

test("pickRemote: origin when on GitHub, else the first GitHub remote", () => {
  const v = (lines) => lines.map(([n, u]) => `${n}\t${u} (fetch)\n${n}\t${u} (push)`).join("\n");
  assert.equal(pickRemote(v([["upstream", "https://github.com/octo/app.git"], ["origin", "git@github.com:acme/acme-app.git"]])), "acme/acme-app");
  assert.equal(pickRemote(v([["origin", "https://gitlab.com/acme/app.git"], ["mirror", "https://github.com/acme/mirror.git"]])), "acme/mirror");
  assert.equal(pickRemote(v([["origin", "https://example.com/app.git"]])), null);
  assert.equal(pickRemote(""), null);
});

test("shortPath and repoUrl", () => {
  assert.equal(shortPath("/Users/mona/git", "/Users/mona"), "~/git");
  assert.equal(shortPath("/Users/mona", "/Users/mona"), "~");
  assert.equal(shortPath("/Users/monak/git", "/Users/mona"), "/Users/monak/git");
  assert.equal(shortPath(null, "/Users/mona"), "");
  assert.equal(repoUrl("acme/acme-app"), "https://github.com/acme/acme-app");
  assert.equal(repoUrl(null), null, "no repository: no link");
  assert.equal(repoUrl(undefined), null);
  assert.equal(repoUrl("acme/acme-app/issues"), null);
  assert.equal(repoUrl("javascript:alert(1)"), null);
});

test("locationOf: a click into a mod block (no pane, no terminal) keeps the last location", () => {
  const last = { cwd: "/Users/mona/git/acme-app", on: null, branch: "main" };
  const other = [{ id: "s1", active: true, folder: "/Users/mona", machine: null, branch: null }];
  assert.equal(locationOf({ spaces: other, panes, focused: { space: "s1", pane: null, terminal: null, cwd: null } }, last), last);
  assert.equal(locationOf({ spaces: other, panes, focused: { space: "s1", pane: null, terminal: null, cwd: null } }).cwd, "/Users/mona", "no last: the space folder");
});
