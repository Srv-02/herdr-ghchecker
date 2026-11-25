#!/bin/bash
# Re-creates every README image end to end with one command: prepare the demo instance (demo-instance.sh, with the fake gh of
# demo/ patched into the instance's copy of the mod only), launch it once, set each state through the mod's own commands
# (herdr-app do ghchecker.<command>, the ones keys.json can bind), take the shots with `herdr-app shot`, quit the instance, then
# crop and render the cards with headless Edge. No mouse, no keyboard, no focus change: the one focus the new window takes on
# launch is macOS's own. Needs: macOS, Herdr.app, Microsoft Edge, node, git, sips.
# Usage: shoot.sh [card ...]   (issues prs actions pr-overlay run-overlay settings hero; none = all)
# CROP_ONLY=1 skips the instance and re-crops and renders from the raw shots in tmp/shots-raw.
# The crop boxes below are raw pixels of the demo window (1280 x 940 points at 2x, panel 446 points wide, app zoom 1).
set -eu
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
S="$ROOT/scripts/screenshots"
RAW="$ROOT/tmp/shots-raw"
export HERDR_APP_HOME="$ROOT/tmp/shots-home" HC_SESSION=ghcshots
ONLY="$*"
want() { [ -z "$ONLY" ] && return 0; for w in $ONLY; do [ "$w" = "$1" ] && return 0; done; return 1; }
inst() { "$S/demo-instance.sh" "$@"; }
cleanup() { inst quit >/dev/null 2>&1 || true; inst clean >/dev/null 2>&1 || true; }
do_() { herdr-app do "$@" > /dev/null; }
shot() { herdr-app shot "$RAW/$1.png" > /dev/null; }

if [ "${CROP_ONLY:-0}" != 1 ]; then
trap cleanup EXIT
inst prepare
inst start
for _ in $(seq 1 40); do herdr-app status > /dev/null 2>&1 && break; sleep 1; done
sleep 4
herdr-app shot "$RAW/probe.png" > /dev/null
[ "$(sips -g pixelWidth "$RAW/probe.png" | awk '/pixelWidth/ {print $2}')" = 2560 ] || { echo "the window is not 2560 pixels wide: shoot on a Retina display" >&2; exit 1; }
rm -f "$RAW/probe.png"
inst space > /dev/null
sleep 5
do_ layout.show '{"id":"panel"}'
sleep 6
# Each card: the panel or overlay in its state, set by the mod's commands.
if want issues || want hero; then do_ ghchecker.issues; do_ ghchecker.filter; do_ ghchecker.group; sleep 3; shot issues; do_ ghchecker.group; do_ ghchecker.filter; fi
if want prs || want hero; then do_ ghchecker.prs; sleep 3; shot prs; fi
if want pr-overlay || want hero; then do_ ghchecker.prs; sleep 1; do_ ghchecker.open; sleep 5; shot pr-overlay; do_ overlay.close; sleep 1; fi
if want actions; then do_ ghchecker.actions; sleep 3; shot actions; fi
if want run-overlay; then do_ ghchecker.failed; sleep 2; do_ ghchecker.open; sleep 5; shot run-overlay; do_ overlay.close; sleep 1; fi
if want settings; then do_ ghchecker.settings; sleep 3; shot settings; do_ overlay.close; sleep 1; fi
inst quit
echo "shots done, instance closed"
fi

# Crop (raw pixels of the demo window: 2560 x 1880)
C="$S/cards"
panel() { sips -c 1704 888 --cropOffset 102 1653 "$RAW/$1.png" --out "$C/$2.png" > /dev/null; }
# box <raw> <y> <x> <width> <height> <out>
box() { sips -c "$5" "$4" --cropOffset "$2" "$3" "$RAW/$1.png" --out "$C/$6.png" > /dev/null; }
R="$S/render.sh"
mkdir -p "$ROOT/screenshots"
if want issues && [ -f "$RAW/issues.png" ]; then panel issues issues-panel; "$R" "$C/issues.html" "$ROOT/screenshots/issues.png" 880 920 > /dev/null; fi
if want prs && [ -f "$RAW/prs.png" ]; then panel prs prs-panel; "$R" "$C/prs.html" "$ROOT/screenshots/prs.png" 880 920 > /dev/null; fi
if want actions && [ -f "$RAW/actions.png" ]; then panel actions actions-panel; "$R" "$C/actions.html" "$ROOT/screenshots/actions.png" 880 920 > /dev/null; fi
if want pr-overlay && [ -f "$RAW/pr-overlay.png" ]; then box pr-overlay 96 156 2248 1688 pr-overlay-window; "$R" "$C/pr-overlay.html" "$ROOT/screenshots/pr-overlay.png" 880 690 > /dev/null; fi
if want run-overlay && [ -f "$RAW/run-overlay.png" ]; then box run-overlay 116 181 2198 1648 run-overlay-window; "$R" "$C/run-overlay.html" "$ROOT/screenshots/run-overlay.png" 880 690 > /dev/null; fi
if want settings && [ -f "$RAW/settings.png" ]; then box settings 96 662 1236 1688 settings-window; "$R" "$C/settings.html" "$ROOT/screenshots/settings.png" 880 845 > /dev/null; fi
# The hero shows the whole panel, so no row is cut at the bottom.
if want hero && [ -f "$RAW/issues.png" ]; then
  panel issues hero-panel
  "$R" "$C/hero.html" "$ROOT/preview.png" 1022 916 > /dev/null
fi
echo "rendered into screenshots/ and preview.png. Look at every image before you commit it: no user name, no real path, no real host."
