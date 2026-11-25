# GitHub Checker guide

Everything GitHub Checker does, in detail. For the overview, see the [README](../README.md).

## Contents

- [Requirements](#requirements)
- [Install](#install): [Manual install](#manual-install)
- [The panel](#the-panel): [Following the tab](#following-the-tab), [Syncing](#syncing), [Status bar](#status-bar)
- [Issues](#issues)
- [Pull requests](#pull-requests): [Approve and run](#approve-and-run), [Merge box](#merge-box)
- [Actions](#actions)
- [Keys](#keys)
- [Settings](#settings)
- [What it runs and touches](#what-it-runs-and-touches)
- [Removing](#removing)
- [Development](#development)

## Requirements

- Herdr app 0.1.18 or newer on macOS.
- The [GitHub CLI](https://cli.github.com) `gh`, signed in with `gh auth login`. Every GitHub call goes through it, with its account and host.
- `git` in the folder of the terminal (on the remote machine for a remote terminal).

## Install

In Herdr, ask your agent:

```text
Read ~/.config/herdr-app/AGENTS.md, then add this mod: https://github.com/Srv-02/herdr-ghchecker/tree/main
```

Then click `GitHub` in the tab bar.

### Manual install

1. Copy the mod folder. The folder must be named `ghchecker`.

   ```sh
   cp -R mods/ghchecker ~/.config/herdr-app/mods/ghchecker
   herdr-app check ~/.config/herdr-app/mods/ghchecker
   ```

2. Clone a layout (`herdr-app do layout.clone '{"name":"main","as":"my-layout"}'`) and in `~/.config/herdr-app/layouts/my-layout.json` replace the `tabs` block with:

   ```json
   { "id": "tab-bar", "type": "row", "size": { "px": 42 }, "resizable": false, "children": [
     { "id": "tabs", "type": "block", "content": { "mod": "tabs" }, "window_drag": true },
     { "id": "ghchecker-button", "type": "block", "content": { "mod": "ghchecker", "props": { "button": true } }, "size": { "px": 92 }, "window_drag": true }
   ] }
   ```

   Add the panel as a child of `panel` > `panel-body`:

   ```json
   { "id": "ghchecker", "type": "block", "content": { "mod": "ghchecker" }, "size": { "weight": 1 }, "min": 120 }
   ```

   The button finds the panel by its mod, whatever its `id`. In a `panel-body` of type `stack` it shows the panel alone; in a `column` it switches the panel on and off beside the others.

## The panel

### Following the tab

- The panel shows the GitHub repository of the focused terminal's folder: the `origin` remote, else the first remote on `github.com`.
- **Remote terminals:** for a terminal on an SSH machine, `git remote -v` runs on that machine; the GitHub calls still run here.
- **No repository:** a folder without a GitHub remote shows "No repository in this folder" with the folder in the header. The panel never keeps showing the last repository.
- A focused mod pane keeps the last folder. A `cd` in the terminal is noticed within 3 seconds.
- **The repository name** in the header opens `https://github.com/<owner>/<name>` in your browser.

### Syncing

- Switching to a repository shows its last state at once, from memory or from the cache file, and syncs in the background when that state is older than 15 seconds; the refresh icon turns meanwhile.
- While the panel is shown: a full sync every 60 seconds; every 12 seconds the runs alone while a run is queued or in progress (the yellow dot on Actions). Nothing runs while the panel is hidden or the window is not visible.
- The refresh button in the header syncs at once. A failed sync keeps the last lists and turns the refresh icon red (the error is in its tooltip).
- Lists: up to 200 issues and 100 pull requests per state, the 40 latest runs. Only the rows on screen are drawn, so long lists scroll smoothly.
- **Search and sort:** the funnel in the header shows or hides the text filter and the sort menu (on Actions: the workflow menu). State, All / Mine / … and Milestones stay visible. A dot on the funnel says the hidden search, sort or workflow is set.
- **The refresh icon** turns while a sync runs and turns red with a dot when the last sync failed (offline, signed out); its tooltip says why and when the panel was last updated.
- **Compact view:** the list button left of refresh switches between two lines per row (title, then number, age, author, labels) and one line (number and title). Long titles are cut at the end of the line; the overlay shows them in full.
- A click into the panel (or into another panel) keeps the repository of the last focused terminal.

### Status bar

At the bottom, the same on every tab: stars, forks, watchers, open issues, open pull requests and, on the right, the latest release's tag (left out when there is none). A click on open issues or pull requests opens that tab with **Open**. The numbers are read with `gh repo view` every 10 minutes.

## Issues

- **Open / Closed.** Closed issues are fetched the first time you pick Closed.
- **All / Mine / External.** Mine: opened by you or assigned to you. External: opened by someone else; bots (github-actions, dependabot) don't count unless [`external.includeBots`](#settings) is on.
- **Newest / Oldest / Updated** in the sort menu, and a text filter for title, `#number`, author and labels.
- **Milestones:** groups the list under one heading per milestone, with its due date, `done / total` and a bar (counted over all of the milestone's issues, open and closed). Milestones are ordered by due date, those without one by name; issues without a milestone come last.
- A click opens the issue in an overlay: the conversation with pictures and events, assignees, labels, milestone and linked pull requests. Comment, close (completed or not planned) or reopen; Copy the link or the reference.

## Pull requests

- **Open / Merged / Closed** and **All / Mine / Review / External**. Review: you are asked for a review. External: as for issues.
- **Each row:** state icon (open, draft, merged, closed), labels, `head → base` (`owner:branch` for a fork), the checks (`2 failed`, `Running`, `Waiting`, `Passed`, `No checks`) and the review decision.
- **The overlay** has three sections: **Conversation**, **Checks** (each check with its time; a click opens it on GitHub) and **Files** (with lines added and removed). On the right: checks, review, assignees, labels, milestone, the issues it closes, and Copy for the link and `gh pr checkout <n> -R <repo>`.

### Approve and run

Workflow runs of a first-time contributor or a fork wait for a maintainer's approval. The PR overlay then shows `1 run awaiting approval` under Checks and **Approve and run**. The first click asks, the second approves every waiting run (`gh api -X POST repos/<repo>/actions/runs/<id>/approve`). Approving runs the pull request's code on the repository's runners: read the changes (Files) first. On GitHub-hosted runners each job gets a fresh machine, a pull request from a fork gets a read-only token and no secrets. Self-hosted runners keep what a job leaves behind: before the button works, the panel asks for the runners of the repository and of its organisation (`gh api repos/<repo>/actions/runners`, `gh api orgs/<owner>/actions/runners`). Any self-hosted runner locks the button with a note; approve such runs on GitHub, if at all. Reading the runners needs admin rights: without them the button works and says that the runners were not checked.

### Merge box

Below the conversation of an open pull request:

- Conflicts with the base branch, the checks and the review, each in one line.
- The merge methods the repository allows (`gh repo view --json squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed,deleteBranchOnMerge`), nothing else. The last method you used is picked first.
- **Delete branch**, preset from the repository's own setting. Not possible for a branch in a fork.
- **Locked** for drafts, conflicts and failed checks (pending checks don't lock it), with the reason beside the button.
- **The first click asks** (`Squash and merge #47 into main?`), **Confirm merge** runs `gh pr merge <n> -R <repo> --squash|--merge|--rebase [--delete-branch]`.

## Actions

- **Each row:** status, title, workflow and number, the event, the branch, and the time (`1m 12s` while it runs, `3m 40s · 5h` when done).
- **All / Failed / This branch** (the branch of the focused terminal) and the workflow menu.
- **The tab's dot:** yellow while a run is queued or in progress, red when the newest finished run on the default branch failed.
- **The overlay:** jobs on the left (the failed one, else the running one, picked first), its steps on the right, then the failed step log (trimmed to the errors, with Copy log) or the last lines of a passed job. While the run is in progress it refreshes every 10 seconds.
- **Re-run failed jobs** and **Re-run all** for a finished run; **Cancel run** while it runs, with a second click to confirm.

## Keys

The panel takes these commands, for `keys.json` (`"alt-g i": "ghchecker:issues"`) or `herdr-app do ghchecker.<command>`:

| Command | What it does |
|---|---|
| `issues`, `prs`, `actions` | Shows that tab |
| `failed` | Shows the failed runs |
| `group` | Groups issues by milestone, or stops |
| `open` | Opens the first row in its overlay |
| `compact` | Switches between one and two lines per row |
| `filter` | Shows or hides search and sort |
| `refresh` | Syncs now |

## Settings

The settings live in `ghchecker.json` in the Herdr app folder (`~/.config/herdr-app/ghchecker.json`). There is no settings page yet: edit the file. A missing file means the defaults; a broken file, or a value of the wrong type, means the default for that value. The panel reads the file again with every full sync, so a change applies within a minute or with the refresh button.

| Key | Type | Default | What it does |
|---|---|---|---|
| `external.includeBots` | true / false | `false` | The External filter also lists items opened by bots (github-actions, dependabot, any `[bot]` account). |
| `external.ignoreAuthors` | list of logins | `[]` | Logins the External filter never lists, e.g. teammates. |

```json
{
  "external": {
    "includeBots": true,
    "ignoreAuthors": ["hubot", "octocat"]
  }
}
```

A dotted key (`"external.includeBots": true`) works too. All settings are defined in one place, `mods/ghchecker/lib/settings.js`.

## What it runs and touches

- **gh**, here: `gh api user`, `gh issue list|view|comment|close|reopen`, `gh pr list|view|comment|close|reopen|merge`, `gh run list|view|rerun|cancel`, `gh repo view`, `gh api repos/<repo>/milestones` and `gh api repos/<repo>/issues/<n>/timeline`. `gh api repos/<repo>/actions/runs?head_sha=…`, `gh api repos/<repo>/actions/runners`, `gh api orgs/<owner>/actions/runners` and `gh api -X POST …/approve`. Writes run only on your click: comment, close, reopen, merge, re-run, cancel, approve.
- **git**, in the terminal's folder (on its machine): `git remote -v`. Nothing else.
- **Pictures** in issue bodies and avatars are downloaded with `curl`, but only from GitHub's own hosts: `github.com` (attachments under `/user-attachments/` and `/<login>.png` avatars), `avatars.githubusercontent.com`, `camo.githubusercontent.com` and the other `*.githubusercontent.com` hosts, over https only (also after redirects, at most 5), at most 20 MB. A picture from anywhere else is not loaded: it shows as `Image from <host> · open it`, a link to your browser. So a stranger's issue can't track when you read it or make this computer call an internal address.
- **The gh token** goes along only for `github.com` itself (private attachments), on stdin, never on a command line. curl drops it when GitHub redirects to its storage host.
- **Files:** `data/ghchecker/` in the Herdr app folder holds one cache file per repository, the pictures and the avatars. The filters, the tab and the last merge method are kept in the mod's own storage. `ghchecker.json` is only read.
- **Shared values:** `workspace.panels` (adds `ghchecker` so the tab bar restores the panel), `ghchecker.pick` (menus to the panel) and `ghchecker.changed` (an overlay asks the panel to sync).

## Removing

Delete `~/.config/herdr-app/mods/ghchecker`, the two blocks from your layout, and, if you like, `~/.config/herdr-app/data/ghchecker` and `~/.config/herdr-app/ghchecker.json`.

## Development

```sh
npm test      # node --test, no network (test/no-network.js)
npm run lint  # parse checks, no Intl, no unused imports, exports or icons
```

- **Pure logic** lives in `mods/ghchecker/lib/` (states, times, milestones, merge, filters, location, settings, status bar) and is tested in `test/`.
- **Screenshots:** `scripts/screenshots/shoot.sh` builds every README image in a separate Herdr instance with made-up data (see [its README](../scripts/screenshots/README.md)).
- Test changes in a separate Herdr instance with its own `HERDR_APP_HOME` and `HC_SESSION`, never in the Herdr you work in.
