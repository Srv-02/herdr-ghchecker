// Avatars and the pictures in issue bodies, each fetched once into data/ghchecker/ of the herdr app folder.
// From herdr-github by alarboulletmarin (MIT), mods/github/media.js at 75a2b40 (the pure parts are in lib/markdown.js).
import * as fs from "fs/promises";
import { appHome, exec } from "herdr";
import { sizeOf } from "./lib/markdown.js";

const known = new Map(); // key → "loading" | "missing" | { path, file, width?, height? }
const nameOf = (s) => { let h = 5381; for (const c of s) h = ((h * 33) ^ c.charCodeAt(0)) >>> 0; return h.toString(36); };

async function fetchTo(url, file) {
  // Private attachments need the gh token: it goes only to github.com, on stdin (printf is a shell
  // builtin, so never on a command line), and curl drops it on GitHub's redirect to its storage host.
  const get = /^https:\/\/github\.com\//.test(url)
    ? 'printf "Authorization: token %s\\n" "$(gh auth token)" | curl -fsSL --max-time 30 -H @- -o "$1" "$2"'
    : 'curl -fsSL --max-time 30 -o "$1" "$2"';
  const r = await exec("sh", ["-c", `${get} || { rm -f "$1"; exit 1; }`, "sh", file, url]).catch(() => null);
  return r?.code === 0;
}

async function measure(file) {
  const r = await exec("file", ["-b", file]).catch(() => null);
  const head = r?.stdout.includes("SVG") || !r ? (await fs.readFile(file, "utf8").catch(() => "")).slice(0, 4000) : "";
  return sizeOf(r?.stdout ?? "", head);
}

// The file for `url` once it's on disk, "missing", or null while it loads. The first call starts the
// download and also returns `pending`, a promise that settles when it's done (to redraw then).
export function want(url, { dir = "images", key = url, sized = true } = {}) {
  const got = known.get(key);
  if (got !== undefined) return { got: got === "loading" ? null : got };
  known.set(key, "loading");
  const pending = (async () => {
    const path = `data/ghchecker/${dir}/${nameOf(key)}.png` /* the loader sniffs the format; the extension only has to be one it knows */, file = `${appHome()}/${path}`;
    try {
      if (!await fs.exists(file)) {
        await fs.mkdir(`${appHome()}/data/ghchecker/${dir}`, { recursive: true });
        if (!await fetchTo(url, file)) throw new Error("download failed");
      }
      const size = sized ? await measure(file) : {};
      if (!size) throw new Error("not an image");
      known.set(key, { path, file, ...size });
    } catch { known.set(key, "missing"); }
  })();
  return { got: null, pending };
}

// A login's avatar: the timeline's URL when there is one, else github.com/<login>.png. Apps have none.
export const avatar = (login, url) => /^app\//.test(login) && !url ? { got: "missing" }
  : want(url ?? `https://github.com/${login}.png?size=80`, { dir: "avatars", key: `@${login}`, sized: false });
