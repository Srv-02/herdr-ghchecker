// Patches a COPY of the mod for the screenshot instance (never mods/ghchecker, never an installed mod):
// - gh.js calls the fake GitHub CLI in demo/ (made-up data for acme/acme-app) instead of the real gh;
// - media.js draws initials instead of fetching avatars, so the shots need no network.
// Each anchor is exact text of the mod; when one is gone the hook stops loudly (test/screenshot-hook.test.js
// applies it to the current mod on every npm test). Usage: node demo-hook.mjs <copy of mods/ghchecker>
import fs from "node:fs";
import path from "node:path";

const mod = process.argv[2];
if (!mod) { console.error("usage: demo-hook.mjs <mod copy>"); process.exit(2); }
const fake = path.resolve(import.meta.dirname, "demo/gh");

const patches = [
  ["gh.js", 'const GH = "gh";', `const GH = ${JSON.stringify(fake)}; // demo-hook: the fake gh of the screenshots`],
  ["media.js", "export const avatar = (login, url) =>", 'export const avatar = () => ({ got: "missing" }); // demo-hook: no avatar downloads\nexport const realAvatar = (login, url) =>'],
];

for (const [file, anchor, replacement] of patches) {
  const p = path.join(mod, file), text = fs.readFileSync(p, "utf8");
  if (text.split(anchor).length !== 2) { console.error(`demo-hook: anchor not found once in ${file}: ${anchor}`); process.exit(1); }
  fs.writeFileSync(p, text.replace(anchor, replacement));
}
console.log(`demo-hook: patched ${mod}`);
