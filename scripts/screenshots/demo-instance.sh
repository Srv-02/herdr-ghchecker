#!/bin/sh
# A separate Herdr instance for the README screenshots, so the demo never runs in your own Herdr: own HERDR_APP_HOME
# (below tmp/ of this checkout, gitignored) and own core session (HC_SESSION). shoot.sh drives it end to end; the steps
# are here for manual use.
# Usage: scripts/screenshots/demo-instance.sh prepare|start|space|quit|clean
#   prepare: create the demo project tmp/acme-app (a git repository with the remote github.com/acme/acme-app, on the
#            branch fix/empty-cart); copy the mod of this checkout into the instance home, patched by demo-hook.mjs
#            (in that copy only) to use the fake gh of demo/; write a layout with the panel shown and its tab bar button
#   start:   launch the window (macOS gives a new instance the focus once; nothing here raises or focuses it afterwards)
#   space:   open the demo space with a neutral prompt        quit: close the instance and stop its core session
#   clean:   delete the demo project, the instance home and the core session state
# WIN_W and WIN_H at prepare: the window size in points (default 1280 x 940); shoot.sh prepares one size per card.
# DEMO_UPDATE=1 at prepare: a made-up release 1.1.0 is "available" (the gold Settings button); otherwise up to date.
set -eu
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export HERDR_APP_HOME="$ROOT/tmp/shots-home"
export HC_SESSION=ghcshots
DEMO="${DEMO_DIR:-$ROOT/tmp/acme-app}"
APP="${HERDR_APP:-/Applications/Herdr.app/Contents/MacOS/Herdr}"
STATE="${XDG_STATE_HOME:-$HOME/.local/state}/herdr-core/$HC_SESSION"

prepare() {
  [ ! -e "$DEMO" ] || { echo "$DEMO exists: run clean first (or set DEMO_DIR)" >&2; exit 1; }
  rm -rf "$HERDR_APP_HOME" "$STATE"
  mkdir -p "$HERDR_APP_HOME/mods" "$HERDR_APP_HOME/layouts" "$ROOT/tmp/shots-raw" "$DEMO/src"
  printf '# acme-app\n\nThe shop of ACME Corp GmbH.\n' > "$DEMO/README.md"
  printf 'export const checkout = (cart) => cart.items.length ? cart : null;\n' > "$DEMO/src/checkout.ts"
  # A fixed author and date, so the repository holds nothing of the person running this.
  git -C "$DEMO" init -q -b main
  git -C "$DEMO" add -A
  GIT_AUTHOR_NAME=mona GIT_AUTHOR_EMAIL=mona@example.com GIT_COMMITTER_NAME=mona GIT_COMMITTER_EMAIL=mona@example.com \
    GIT_AUTHOR_DATE=2026-01-01T10:00:00Z GIT_COMMITTER_DATE=2026-01-01T10:00:00Z git -C "$DEMO" commit -q -m "chore: start"
  git -C "$DEMO" checkout -q -b fix/empty-cart
  git -C "$DEMO" remote add origin https://github.com/acme/acme-app.git
  cp -R "$ROOT/mods/ghchecker" "$HERDR_APP_HOME/mods/ghchecker"
  node "$ROOT/scripts/screenshots/demo-hook.mjs" "$HERDR_APP_HOME/mods/ghchecker" > /dev/null
  # The default layout of your Herdr (read only) with the panel as the first child of panel-body, shown from the start,
  # and the GitHub button beside the tabs.
  node -e '
    const fs = require("fs"), home = process.env.HERDR_APP_HOME;
    const src = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const find = (n, id) => n.id === id ? n : (n.children || []).map((c) => find(c, id)).find(Boolean);
    const parent = (n, id) => (n.children || []).some((c) => c.id === id) ? n : (n.children || []).map((c) => parent(c, id)).find(Boolean);
    const panel = find(src, "panel"), body = find(src, "panel-body"), bar = parent(src, "tabs");
    delete panel.hidden;
    panel.size = { px: Number(process.env.PANEL_PX || 446) };
    body.active = "ghchecker";
    body.children.unshift({ id: "ghchecker", type: "block", content: { mod: "ghchecker" } });
    const tabs = bar.children.findIndex((c) => c.id === "tabs");
    bar.children[tabs] = { id: "tab-bar", type: "row", size: { px: 42 }, resizable: false, children: [
      { ...bar.children[tabs], size: undefined },
      { id: "ghchecker-button", type: "block", content: { mod: "ghchecker", props: { button: true } }, size: { px: 92 }, window_drag: true },
    ] };
    fs.writeFileSync(home + "/layouts/demo.json", JSON.stringify(src, null, 2));
    // A new instance opens the welcome screen and the what-is-new window: pre-seed both as done.
    // The update check counts as done today, so the demo asks GitHub nothing: up to date, or with DEMO_UPDATE=1 a
    // made-up newer release (the gold Settings button).
    const update = { at: Date.now(), local: "1.0.0", latest: process.env.DEMO_UPDATE === "1" ? "v1.1.0" : "v1.0.0" };
    fs.writeFileSync(home + "/shared.json", JSON.stringify({ layout: "demo", "frame.welcomed": "finished", "workspace.panels": ["files", "changes", "ghchecker"], "ghchecker.update": update }));
    fs.writeFileSync(home + "/update-notes.json", JSON.stringify({ last_run: process.argv[2], presented: [] }));
  ' "${DEFAULT_LAYOUT:-$HOME/.config/herdr-app/layouts/main.json}" "$("${HERDR_APP_CLI:-herdr-app}" --version | awk '{print $NF}')"
  # The window size in points, read by the app when it starts.
  printf '{"state":"windowed","bounds":[60,30,%s,%s]}' "${WIN_W:-1280}" "${WIN_H:-940}" > "$HERDR_APP_HOME/window.json"
}

case "${1:-}" in
  prepare) prepare ;;
  start) nohup "$APP" > "$ROOT/tmp/shots-app.log" 2>&1 & echo "started; HERDR_APP_HOME=$HERDR_APP_HOME HC_SESSION=$HC_SESSION" ;;
  space) herdr-app do space.new '{"name":"acme-app","folder":"'"$DEMO"'","tab":"acme-app","argv":["env","BASH_SILENCE_DEPRECATION_WARNING=1","PS1=acme-app $ ","/bin/bash","--norc","--noprofile"]}' ;;
  quit) herdr-app do app.quit || true; sleep 2; hc server stop || true ;;
  clean) rm -rf "$DEMO" "$HERDR_APP_HOME" "$STATE" ;;
  *) echo "usage: $0 prepare|start|space|quit|clean" >&2; exit 2 ;;
esac
