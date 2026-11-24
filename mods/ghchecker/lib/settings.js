// The settings of the mod, defined in one place: key, type, default and what it does. They live in
// ghchecker.json in the herdr app folder (~/.config/herdr-app/ghchecker.json), as nested objects:
//   { "external": { "includeBots": true, "ignoreAuthors": ["hubot"] } }
// A dotted key ("external.includeBots") works too. A missing or broken file, or a value of the wrong type,
// means the default. A settings page can be built on SETTINGS later.

export const CONFIG_FILE = "ghchecker.json";

export const SETTINGS = [
  { key: "external.includeBots", type: "boolean", default: false,
    about: "The External filter also lists items opened by bots (github-actions, dependabot)." },
  { key: "external.ignoreAuthors", type: "logins", default: [],
    about: "Logins the External filter never lists, e.g. teammates." },
];

const CHECK = {
  boolean: (v) => typeof v === "boolean" ? v : undefined,
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
    const raw = cfg ? at(cfg, s.key) : undefined, value = raw === undefined ? undefined : CHECK[s.type](raw);
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
