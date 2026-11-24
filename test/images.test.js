import { test } from "node:test";
import assert from "node:assert/strict";
import { imageAllowed, sendsToken, hostOf } from "../mods/ghchecker/lib/images.js";

test("GitHub's own image hosts load", () => {
  for (const url of [
    "https://github.com/user-attachments/assets/0a1b2c3d-1234",
    "https://github.com/octocat.png?size=80",
    "https://github.com/mona-lisa.png",
    "https://avatars.githubusercontent.com/u/583231?v=4",
    "https://camo.githubusercontent.com/abc/def",
    "https://user-images.githubusercontent.com/1/2.png",
    "https://private-user-images.githubusercontent.com/1/2.png?jwt=x",
    "https://raw.githubusercontent.com/acme/acme-app/main/logo.png",
    "HTTPS://GitHub.com/user-attachments/assets/x",
  ]) assert.equal(imageAllowed(url), true, url);
});

test("everything else stays a link", () => {
  for (const url of [
    "http://github.com/user-attachments/assets/x",
    "http://avatars.githubusercontent.com/u/1",
    "https://github.com.evil.example/user-attachments/assets/x",
    "https://evil.example/github.com/user-attachments/x",
    "https://githubusercontent.com/x.png",
    "https://evilgithubusercontent.com/x.png",
    "https://githubusercontent.com.evil.example/x.png",
    "https://github.com@evil.example/x.png",
    "https://user:pass@avatars.githubusercontent.com/u/1",
    "https://avatars.githubusercontent.com:8443/u/1",
    "https://github.com/acme/acme-app/raw/main/logo.png",
    "https://github.com/user-attachments/../acme/acme-app/raw/main/x.png",
    "https://github.com./user-attachments/assets/x",
    "https://10.0.0.1/pixel.png",
    "https://127.0.0.1/x.png",
    "https://[::1]/x.png",
    "https://localhost/x.png",
    "https://example.com/pixel.gif",
    "file:///etc/passwd",
    "javascript:alert(1)",
    "data:image/png;base64,AAAA",
    "not a url",
    "",
    null,
  ]) assert.equal(imageAllowed(url), false, String(url));
});

test("the gh token goes only to github.com", () => {
  assert.equal(sendsToken("https://github.com/user-attachments/assets/x"), true);
  assert.equal(sendsToken("https://avatars.githubusercontent.com/u/1"), false);
  assert.equal(sendsToken("https://github.com.evil.example/user-attachments/assets/x"), false);
  assert.equal(sendsToken("http://github.com/user-attachments/assets/x"), false);
  assert.equal(sendsToken("https://example.com/x"), false);
});

test("hostOf names the host of a blocked picture", () => {
  assert.equal(hostOf("https://example.com/pixel.gif"), "example.com");
  assert.equal(hostOf("https://user@tracker.example:8443/p.gif"), "tracker.example");
  assert.equal(hostOf("nonsense"), "an unknown host");
});
