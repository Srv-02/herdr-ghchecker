#!/bin/bash
# Re-creates every README image end to end with one command: for each card, prepare the demo instance (demo-instance.sh, with
# the fake gh of demo/ patched into the instance's copy of the mod only) at the window size of that card, launch it, set each
# state through the mod's own commands (herdr-app do ghchecker.<command>, the ones keys.json can bind), take the shots with
# `herdr-app shot`, quit and clean the instance, then crop and render the cards with headless Edge. No mouse, no keyboard, no
# focus change: the one focus a new window takes on launch is macOS's own. Needs: macOS, Herdr.app, Microsoft Edge, node, git, sips.
# Usage: shoot.sh [card ...]   (hero issues prs actions settings; none = all)
# CROP_ONLY=1 skips the instance and re-crops and renders from the raw shots in tmp/shots-raw.
#
# Sizes: every window is W = 860 points wide (1720 pixels at 2x, panel 446 points, app zoom 1). Its height H sets the panel
# height (2H - 176 pixels), so H is chosen per card for whole rows down to the status bar: the panel then fills its card
# (H - 28 CSS pixels tall, 2H - 56 pixels as PNG). The hero is 2044 x 1144 (H 600, compact rows), the feature cards 1760 wide
# and 1200 to 1320 tall. Change the fixtures in demo/gh.mjs and the rows move: look at every card again.
set -eu
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
S="$ROOT/scripts/screenshots"
RAW="$ROOT/tmp/shots-raw"
export HERDR_APP_HOME="$ROOT/tmp/shots-home" HC_SESSION=ghcshots
W=860
H_HERO=600 H_ISSUES=682 H_PRS=649 H_ACTIONS=650 H_SETTINGS=650
# The overlays and the dialog get windows of their own, tall enough that the part shown beside the panel is as tall as the
# panel: an issue or pull request overlay is 0.9 H tall (shown at 372 / 1010), a run overlay 0.88 H (shown at 372 / 954).
H_ISSUE_OVERLAY=896 H_PR_OVERLAY=846 H_RUN_OVERLAY=971 H_DIALOG=940
ONLY="$*"
want() { [ -z "$ONLY" ] && return 0; for w in $ONLY; do [ "$w" = "$1" ] && return 0; done; return 1; }
inst() { "$S/demo-instance.sh" "$@"; }
cleanup() { inst quit >/dev/null 2>&1 || true; inst clean >/dev/null 2>&1 || true; }
do_() { herdr-app do "$@" > /dev/null; }
shot() { herdr-app shot "$RAW/$1.png" > /dev/null; }
# A fresh instance with a window of W x $1 points, the demo space open and the panel shown.
scene() {
  cleanup
  WIN_W=$W WIN_H="$1" inst prepare
  # A launch right after the last quit sometimes never opens its window: then launch once more.
  for try in 1 2; do
    inst start > /dev/null
    for _ in $(seq 1 40); do herdr-app status > /dev/null 2>&1 && break; sleep 1; done
    herdr-app status > /dev/null 2>&1 && break
    [ "$try" = 2 ] && { echo "the demo instance did not start" >&2; exit 1; }
    inst quit > /dev/null 2>&1 || true; sleep 3
  done
  sleep 4
  herdr-app shot "$RAW/probe.png" > /dev/null
  [ "$(sips -g pixelWidth "$RAW/probe.png" | awk '/pixelWidth/ {print $2}')" = $((2 * W)) ] || { echo "the window is not $((2 * W)) pixels wide: shoot on a Retina display" >&2; exit 1; }
  rm -f "$RAW/probe.png"
  inst space > /dev/null
  sleep 5
  do_ layout.show '{"id":"panel"}'
  sleep 6
}

if [ "${CROP_ONLY:-0}" != 1 ]; then
trap cleanup EXIT
mkdir -p "$RAW"
# Hero: compact rows, the issues grouped by milestone.
if want hero; then scene $H_HERO; do_ ghchecker.compact; do_ ghchecker.issues; do_ ghchecker.group; sleep 3; shot hero; fi
# Issues: grouped by milestone, and the first issue in its overlay.
if want issues; then
  scene $H_ISSUES; do_ ghchecker.issues; do_ ghchecker.group; sleep 3; shot issues
  scene $H_ISSUE_OVERLAY; do_ ghchecker.issues; do_ ghchecker.group; sleep 3; do_ ghchecker.open; sleep 5; shot issue-overlay
fi
# PRs: the list, and the first pull request in its overlay with the merge box.
if want prs; then
  scene $H_PRS; do_ ghchecker.prs; sleep 3; shot prs
  scene $H_PR_OVERLAY; do_ ghchecker.prs; sleep 3; do_ ghchecker.open; sleep 5; shot pr-overlay
fi
# Actions: all runs, then the latest failed run in its overlay.
if want actions; then
  scene $H_ACTIONS; do_ ghchecker.actions; sleep 3; shot actions
  scene $H_RUN_OVERLAY; do_ ghchecker.failed; sleep 3; do_ ghchecker.open; sleep 5; shot run-overlay
fi
# Settings: the compact list, and the dialog in a window tall enough for all of it.
if want settings; then
  scene $H_SETTINGS; do_ ghchecker.compact; do_ ghchecker.issues; sleep 3; shot settings-panel
  scene $H_DIALOG; do_ ghchecker.compact; do_ ghchecker.settings; sleep 3; shot settings-dialog
fi
cleanup
trap - EXIT
echo "shots done, instance closed and cleaned"
fi

# Crop (raw pixels of a window 1720 pixels wide)
C="$S/cards"
# panel <raw> <H> <out>: the whole panel, from its top border to below its status bar.
panel() { sips -c $((2 * $2 - 176)) 888 --cropOffset 102 $((2 * W - 907)) "$RAW/$1.png" --out "$C/$3.png" > /dev/null; }
# box <raw> <y> <x> <width> <height> <out>
box() { sips -c "$5" "$4" --cropOffset "$2" "$3" "$RAW/$1.png" --out "$C/$6.png" > /dev/null; }
# card <name> <H> <out.png> [width]: render cards/<name>.html at its size.
card() { "$S/render.sh" "$C/$1.html" "$3" "${4:-880}" $(($2 - 28)) > /dev/null; }
mkdir -p "$ROOT/screenshots"
if want hero && [ -f "$RAW/hero.png" ]; then panel hero $H_HERO hero-panel; card hero $H_HERO "$ROOT/preview.png" 1022; fi
# Panels and overlays are separate cards, each at its own size (2x): a panel never looks bigger than an overlay.
# render <card> <width> <height>: cards/<card>.html into screenshots/<card>.png.
render() { "$S/render.sh" "$C/$1.html" "$ROOT/screenshots/$1.png" "$2" "$3" > /dev/null; }
# A list ends after its last whole row and joins the status bar (the card stacks both). sips ignores a crop offset of
# 0, so a crop from the top starts at row 1.
if want issues && [ -f "$RAW/issues.png" ]; then
  panel issues $H_ISSUES issues-panel
  sips -c 963 888 --cropOffset 1 0 "$C/issues-panel.png" --out "$C/issues-panel-top.png" > /dev/null
  sips -c 58 888 --cropOffset 1119 0 "$C/issues-panel.png" --out "$C/issues-panel-foot.png" > /dev/null
  render issues 1022 631
  # The whole issue overlay, down to its comment box.
  box issue-overlay 91 105 1510 1444 issue-overlay; render issue-overlay 1022 842
fi
if want prs && [ -f "$RAW/prs.png" ]; then
  panel prs $H_PRS prs-panel; render prs 1022 722
  box pr-overlay 86 105 1510 1520 pr-overlay; render pr-overlay 1022 880
fi
if want actions && [ -f "$RAW/actions.png" ]; then
  panel actions $H_ACTIONS actions-panel
  sips -c 965 888 --cropOffset 1 0 "$C/actions-panel.png" --out "$C/actions-panel-top.png" > /dev/null
  sips -c 60 888 --cropOffset 1047 0 "$C/actions-panel.png" --out "$C/actions-panel-foot.png" > /dev/null
  render actions 1022 633
  # The whole run overlay, down to the end of the log.
  box run-overlay 118 122 1476 1357 run-overlay; render run-overlay 1022 799
fi
if want settings && [ -f "$RAW/settings-panel.png" ]; then
  box settings-dialog 96 242 1236 1688 settings-dialog; render settings 1022 964
fi
echo "rendered into screenshots/ and preview.png. Look at every image before you commit it: no user name, no real path, no real host."
