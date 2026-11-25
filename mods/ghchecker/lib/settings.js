// The settings of the mod, defined in one place: key, type, default and what it does. They live in
// ghchecker.json in the herdr app folder (~/.config/herdr-app/ghchecker.json), as nested objects:
//   { "external": { "includeBots": true, "ignoreAuthors": ["hubot"] } }
// A dotted key ("external.includeBots") works too. A missing or broken file, or a value of the wrong type,
// means the default. A settings page can be built on SETTINGS later.

export const CONFIG_FILE = "ghchecker.json";

export const SETTINGS = [
  { key: "update_check", type: "boolean", default: true, label: "Check for updates automatically",
    about: "Once a day, GitHub Checker asks GitHub whether a new version exists. Nothing about you or your repositories is sent, but GitHub sees your IP address." },
  { key: "compact_rows", type: "boolean", default: false, label: "Compact rows",
    about: "One line per issue, pull request or run: number and title. Off: a second line with age, author and labels." },
  { key: "labels.show", type: "boolean", default: true, label: "Show labels",
    about: "Labels in the lists and in the overlay. The filter still finds them when they are hidden." },
  { key: "labels.color", type: "choice", choices: ["color", "mono"], default: "color", label: "Label colors",
    about: "Mono draws every label in one quiet color instead of its GitHub color." },
  { key: "external.includeBots", type: "boolean", default: false, label: "Count bots as external",
    about: "Off: dependabot, github-actions and other bots never show under External." },
  { key: "external.ignoreAuthors", type: "logins", default: [], label: "Never external",
    about: "Logins that count as yours, comma separated. For a second account or a co-maintainer." },
];

const CHECK = {
  boolean: (v) => typeof v === "boolean" ? v : undefined,
  // One of the setting's choices (checked in parseSettings and withSettings with the setting at hand).
  choice: (v, s) => s?.choices?.includes(v) ? v : undefined,
  // A list of GitHub logins: strings only, trimmed, empty ones and duplicates dropped.
  logins: (v) => Array.isArray(v) && v.every((x) => typeof x === "string")
    ? [...new Set(v.map((x) => x.trim()).filter(Boolean))] : undefined,
};

const fresh = (v) => Array.isArray(v) ? [...v] : v; // a default list is never shared between loads
const at = (cfg, key) => key in cfg ? cfg[key] : key.split(".").reduce((o, k) => o && typeof o === "object" ? o[k] : undefined, cfg);

// The settings from the file's text: every key of SETTINGS, each its default when missing or wrong.
// `problems` names the keys that were present but unusable, and a file that is not a JSON object.
export function parseSettings(text) {
  let cfg = null;
  const problems = [];
  if (text != null && String(text).trim() !== "") {
    try { cfg = JSON.parse(text); } catch { problems.push(CONFIG_FILE); }
    if (cfg !== null && (typeof cfg !== "object" || Array.isArray(cfg))) { problems.push(CONFIG_FILE); cfg = null; }
  }
  const values = {};
  for (const s of SETTINGS) {
    const raw = cfg ? at(cfg, s.key) : undefined, value = raw === undefined ? undefined : CHECK[s.type](raw, s);
    if (raw !== undefined && value === undefined) problems.push(s.key);
    values[s.key] = value ?? fresh(s.default);
  }
  return { values, problems };
}

export const defaults = () => parseSettings(null).values;

// Reads the file through herdr's readTextFile (null when absent); a read that fails means the defaults.
export async function loadSettings(readTextFile, appHome) {
  const text = await readTextFile(`${appHome()}/${CONFIG_FILE}`).catch(() => null);
  return parseSettings(text);
}

// A list of logins as typed into the dialog: separated by commas or spaces, an @ in front ignored.
export const parseLogins = (text) => CHECK.logins(String(text ?? "").split(/[\s,]+/).map((x) => x.replace(/^@/, "")));

// The file's new text with `edits` ({ key: value }) written in: a dotted key as a nested object, other keys kept as
// they are. A broken file is never overwritten: it throws, and the dialog says so.
export function withSettings(text, edits) {
  let cfg = {};
  if (text != null && String(text).trim() !== "") {
    cfg = JSON.parse(text);
    if (!cfg || typeof cfg !== "object" || Array.isArray(cfg)) throw new Error(`${CONFIG_FILE} is not a JSON object`);
  }
  for (const [key, value] of Object.entries(edits)) {
    const s = SETTINGS.find((x) => x.key === key);
    if (!s || CHECK[s.type](value, s) === undefined) throw new Error(`not a setting: ${key}`);
    if (key in cfg) { cfg[key] = value; continue; } // a dotted key the person wrote stays dotted
    const parts = key.split("."), last = parts.pop();
    let node = cfg;
    for (const p of parts) node = node[p] = node[p] && typeof node[p] === "object" && !Array.isArray(node[p]) ? node[p] : {};
    node[last] = value;
  }
  return `${JSON.stringify(cfg, null, 2)}\n`;
}

// Writes `edits` with herdr's writeTextFile, which refuses when the file changed since it was read.
export async function saveSettings(edits, { readTextFile, writeTextFile, appHome }) {
  const path = `${appHome()}/${CONFIG_FILE}`, text = await readTextFile(path);
  await writeTextFile(path, withSettings(text, edits), text);
}

// The keys whose value differs between two value sets (what Save writes).
export function changedSettings(before, after) {
  return Object.fromEntries(SETTINGS.map((x) => x.key).filter((k) => JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])).map((k) => [k, after[k]]));
}
