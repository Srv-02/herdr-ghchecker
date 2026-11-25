# Screenshots

The README images in `screenshots/` and `preview.png` are cards: crops of a running Herdr window, placed on a shared frame and gradient and rendered at 2x with a transparent outside. Everything shown comes from made-up data for the repository `acme/acme-app`, never from a real repository or account.

## One command

```sh
scripts/screenshots/shoot.sh
```

`scripts/screenshots/shoot.sh issues prs` shoots only the named cards (issues, prs, actions, pr-overlay, run-overlay, settings, hero); `hero` renders `preview.png` at the top of the README, with its feature list as text on the card (`cards/hero.html`, keep it in line with the README intro); `CROP_ONLY=1` re-crops and renders from the raw shots in `tmp/shots-raw` without launching anything.

It prepares a separate Herdr instance, launches it once, sets every state through the mod's own commands (`herdr-app do ghchecker.issues|prs|actions|failed|group|open`, the ones `keys.json` can bind), takes the shots, quits the instance, crops them and renders all cards. Needs macOS with a Retina display, Herdr.app, Microsoft Edge (headless, no window), `node`, `git` and `sips`. Look at every image before you commit it: no user name, no real path, no real host, no real repository.

What it never does: touch your own Herdr or its installed mod, call the real `gh`, use mouse or keyboard automation, or raise a window. The one focus change is macOS giving a new app instance the focus when it launches. The window must stay visible: Herdr draws nothing new in a minimized or fully covered window, and the shots would show an old frame.

## Files

- `shoot.sh`: the whole run (prepare, launch, drive, shoot, quit, clean, crop, render). The crop boxes are raw pixels of the demo window (1280 x 940 points at 2x, panel 446 points wide, app zoom 1); the window is that tall so the Settings dialog fits whole.
- `demo-instance.sh`: `prepare | start | space | quit | clean` for the separate instance. Its `HERDR_APP_HOME` is `tmp/shots-home` and its core session `ghcshots`. `prepare` creates the demo project `tmp/acme-app` (a git repository with the remote `github.com/acme/acme-app`, on the branch `fix/empty-cart`), copies the mod of this checkout, patches that copy with `demo-hook.mjs`, and writes a layout with the panel shown and the GitHub button in the tab bar. It also marks the welcome screen and the what's-new window as done, so no popup needs a click, and the update check as done today (up to date; `DEMO_UPDATE=1` makes a release 1.1.0 available, for the gold Settings button, never for the README).
- `demo-hook.mjs`: patches the instance's copy of the mod (never `mods/ghchecker`, never your installed mod): `gh.js` calls `demo/gh` instead of `gh`, and `media.js` draws initials instead of downloading avatars. It stops loudly when an anchor in the mod has moved; `test/screenshot-hook.test.js` applies it to the current mod on every `npm test`, and checks that the shipped mod has no trace of it.
- `demo/gh`, `demo/gh.mjs`: the fake GitHub CLI. It answers every call the panel makes with made-up issues (with milestones), pull requests (from a fork, a draft, failed checks, a bot) and runs (one in progress, one failed), with times relative to now. Writes such as merge, re-run or cancel print `ok` and change nothing. `GHC_DEMO_MANY=1` in the instance's environment adds 200 issues with long titles, to try scrolling.
- `render.sh`: renders a card into a PNG with headless Microsoft Edge (`EDGE=/path/to/browser` picks another Chromium-based browser).
- `cards/card.css`, `cards/*.html`: the shared frame and one card per image. The crops (`cards/*.png`) and the browser profile are ignored by git: they hold window content, only the finished card goes into `screenshots/`.
