import { test } from "node:test";
import assert from "node:assert/strict";
import { ago, age, day, seconds, duration } from "../mods/ghchecker/lib/time.js";
import { withoutIntl } from "./no-intl.js";

const NOW = Date.parse("2026-11-24T12:00:00Z");
const before = (s) => new Date(NOW - s * 1000).toISOString();

test("ago: GitHub's relative times", () => {
  assert.equal(ago(before(10), NOW), "just now");
  assert.equal(ago(before(14 * 60), NOW), "14m ago");
  assert.equal(ago(before(5 * 3600), NOW), "5h ago");
  assert.equal(ago(before(3 * 86400), NOW), "3d ago");
  assert.equal(ago("2026-09-21T10:00:00Z", NOW), "on Sep 21");
  assert.equal(ago("2025-09-21T10:00:00Z", NOW), "on Sep 21, 2025");
  assert.equal(ago(null, NOW), "");
  assert.equal(ago("not a date", NOW), "");
});

test("age: the short form of a list column", () => {
  assert.equal(age(before(5 * 3600), NOW), "5h");
  assert.equal(age(before(10), NOW), "just now");
  assert.equal(age("2026-09-21T10:00:00Z", NOW), "Sep 21");
  assert.equal(day("2026-12-12T00:00:00Z", NOW), "Dec 12");
});

test("seconds and duration: 40s, 4m 02s, 1h 05m", () => {
  assert.deepEqual([0, 40, 60, 242, 3599, 3900, -5].map(seconds), ["0s", "40s", "1m 00s", "4m 02s", "59m 59s", "1h 05m", "0s"]);
  assert.equal(duration("2026-11-24T11:56:20Z", "2026-11-24T12:00:00Z"), "3m 40s");
  assert.equal(duration(before(72), null, NOW), "1m 12s", "still running: up to now");
  assert.equal(duration(null, "2026-11-24T12:00:00Z"), "");
});

test("no Intl needed", async () => {
  await withoutIntl(() => assert.equal(ago(before(3 * 86400 * 30), NOW), "on Aug 26"));
});
