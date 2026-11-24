// A fake GitHub CLI for the screenshot instance: answers the calls the mod makes with made-up data for the
// repository acme/acme-app, so the README images never show a real repository, person or token.
// The demo hook (../demo-hook.mjs) points the instance's copy of the mod at the `gh` wrapper next to this file.
// Times are relative to now, so "14m ago" stays 14 minutes old whenever the shots are taken.
// Writes (merge, comment, close, rerun, cancel) change nothing: they print "ok" and exit 0.

const ME = "mona";
const REPO = "acme/acme-app";
const now = Date.now();
const at = (minutes) => new Date(now - minutes * 60000).toISOString();
const person = (login) => ({ login, is_bot: false, name: "" });
const bot = (login) => ({ login: `app/${login}`, is_bot: true, name: "" });
const label = (name, color) => ({ name, color, description: "" });
const BUG = label("bug", "f28b82"), FEATURE = label("enhancement", "7ab6ff"), DOCS = label("documentation", "9fd9a0"), GOOD = label("good first issue", "c9a3ff");
const V10 = { number: 1, title: "v1.0", description: "", dueOn: at(-60 * 24 * 17) }, V11 = { number: 2, title: "v1.1", description: "", dueOn: null };

const issue = (number, title, author, minutes, labels, milestone, comments, body, extra = {}) => ({
  number, title, url: `https://github.com/${REPO}/issues/${number}`, state: "OPEN", stateReason: null, labels, assignees: author === ME ? [person(ME)] : [],
  author: person(author), createdAt: at(minutes), updatedAt: at(minutes / 2), milestone,
  comments: Array.from({ length: comments }, (_, n) => ({ author: person(n % 2 ? ME : "octocat"), body: n % 2 ? "Thanks, I'll take a look." : "Still happens on the latest build.", createdAt: at(minutes - 5 - n), authorAssociation: n % 2 ? "OWNER" : "NONE", reactionGroups: [] })),
  body, reactionGroups: [], closedByPullRequestsReferences: [], ...extra,
});

const ISSUES_OPEN = [
  issue(46, "Checkout fails when the cart is empty", "octocat", 14, [BUG], V10, 1, "Steps:\n\n1. Open the shop with an empty cart\n2. Press **Checkout**\n\nThe page shows a blank screen instead of a hint."),
  issue(41, "Remember the last payment method", ME, 130, [FEATURE], V11, 3, "Returning customers pick the same method every time. Preselect it."),
  issue(38, "Prices round wrong for currencies with three decimals", "hubot", 60 * 26, [BUG, GOOD], V10, 2, "KWD and BHD prices lose their last digit in the cart."),
  issue(35, "Order page: dark mode", ME, 60 * 24 * 3, [FEATURE], V11, 0, "The order page ignores the system appearance."),
  issue(33, "Explain webhook retries in the docs", ME, 60 * 24 * 4, [DOCS], null, 0, "How often and how long do we retry a failed webhook?"),
  issue(29, "Flaky test in cart totals", ME, 60 * 24 * 6, [BUG], V10, 1, "`cart totals > applies coupons` fails about once in twenty runs."),
];
// GHC_DEMO_MANY=1 in the instance's environment adds 200 more issues, to try scrolling and long titles.
if (process.env.GHC_DEMO_MANY) for (let n = 0; n < 200; n++) {
  ISSUES_OPEN.push(issue(300 + n, `Generated issue ${n} with a rather long title that does not fit on one line of the panel at all`, n % 3 ? ME : "octocat", 60 * 24 * 7 + n * 30, n % 2 ? [BUG] : [FEATURE, DOCS], n % 4 ? V11 : null, n % 5, ""));
}
const ISSUES_CLOSED = [
  { ...issue(31, "Coupon field accepts spaces", "octocat", 60 * 24 * 9, [BUG], V10, 2, "Trim the code before checking it."), state: "CLOSED", stateReason: "COMPLETED" },
  { ...issue(27, "Add a sitemap", ME, 60 * 24 * 12, [FEATURE], null, 0, ""), state: "CLOSED", stateReason: "NOT_PLANNED" },
];
const MILESTONES = [
  { number: 1, title: "v1.0", state: "open", open_issues: 3, closed_issues: 5, due_on: V10.dueOn },
  { number: 2, title: "v1.1", state: "open", open_issues: 2, closed_issues: 1, due_on: null },
];

const check = (name, workflowName, status, conclusion, minutes, took = 0) => ({ __typename: "CheckRun", name, workflowName, status, conclusion,
  detailsUrl: `https://github.com/${REPO}/actions`, startedAt: at(minutes), completedAt: status === "COMPLETED" ? at(minutes - took) : null });
const pr = (number, title, author, minutes, head, extra = {}) => ({
  number, title, url: `https://github.com/${REPO}/pull/${number}`, state: "OPEN", isDraft: false, labels: [], author: person(author), assignees: [],
  createdAt: at(minutes + 10), updatedAt: at(minutes), headRefName: head, baseRefName: "main", headRepositoryOwner: { login: author === ME ? "acme" : author },
  isCrossRepository: author !== ME, reviewDecision: "", reviewRequests: [], statusCheckRollup: [], comments: [], mergedAt: null,
  mergeable: "MERGEABLE", additions: 12, deletions: 3, changedFiles: 1, files: [], commits: [{}], reviews: [], milestone: null, reactionGroups: [], closingIssuesReferences: [],
  body: "", ...extra,
});
const PRS_OPEN = [
  pr(47, "docs: fix the install path in the README", "octocat", 20, "patch-1", {
    headRefOid: "4b825dc642cb6eb9a060e54bf8d69288fbee4904",
    reviewDecision: "REVIEW_REQUIRED", reviewRequests: [person(ME)], statusCheckRollup: [check("lint", "CI", "QUEUED", "", 19), check("test", "CI", "QUEUED", "", 19)],
    additions: 2, deletions: 2, files: [{ path: "README.md", additions: 2, deletions: 2 }], labels: [DOCS],
    body: "The README says to copy the app to `~/acme`, but the installer uses `~/.acme`. Fixed both places.",
    comments: [{ author: bot("github-actions"), body: "Workflows from first-time contributors need approval before they run.", createdAt: at(19), authorAssociation: "NONE", reactionGroups: [] }],
  }),
  pr(44, "fix: guard the empty cart in checkout", ME, 62, "fix/empty-cart", {
    statusCheckRollup: [check("lint", "CI", "COMPLETED", "SUCCESS", 60, 0.3), check("test (macos-latest)", "CI", "IN_PROGRESS", "", 1), check("test (ubuntu-latest)", "CI", "COMPLETED", "SUCCESS", 2, 1)],
    closingIssuesReferences: [{ number: 46, url: `https://github.com/${REPO}/issues/46`, repository: { name: "acme-app", owner: { login: "acme" } } }],
    files: [{ path: "src/checkout.ts", additions: 9, deletions: 2 }, { path: "test/checkout.test.ts", additions: 21, deletions: 0 }], additions: 30, deletions: 2, changedFiles: 2,
    body: "Shows a hint instead of an empty page. Closes #46.",
  }),
  pr(43, "feat: remember the payment method", ME, 60 * 5, "feat/payment-memory", {
    reviewDecision: "CHANGES_REQUESTED", statusCheckRollup: [check("lint", "CI", "COMPLETED", "SUCCESS", 300, 0.3), check("test (macos-latest)", "CI", "COMPLETED", "FAILURE", 300, 1.8), check("test (ubuntu-latest)", "CI", "COMPLETED", "FAILURE", 300, 1.5)],
    labels: [FEATURE], body: "Stores the last method per customer. Closes #41.",
  }),
  pr(42, "refactor: split the pricing module", ME, 60 * 24 * 2, "refactor/pricing", {
    isDraft: true, statusCheckRollup: [check("lint", "CI", "COMPLETED", "SUCCESS", 2880, 0.3), check("test", "CI", "COMPLETED", "SUCCESS", 2880, 2)], body: "Work in progress.",
  }),
  pr(39, "chore(deps): bump vite from 6.1.0 to 6.2.1", "app/dependabot", 60 * 24 * 3, "dependabot/npm_and_yarn/vite-6.2.1", {
    author: bot("dependabot"), headRepositoryOwner: { login: "acme" }, isCrossRepository: false,
    statusCheckRollup: [check("lint", "CI", "COMPLETED", "SUCCESS", 4320, 0.3), check("test", "CI", "COMPLETED", "SUCCESS", 4320, 2)], body: "Bumps vite.",
  }),
];
const PRS_MERGED = [pr(40, "fix: trim coupon codes", ME, 60 * 24 * 8, "fix/coupon-trim", { state: "MERGED", mergedAt: at(60 * 24 * 8), statusCheckRollup: [check("test", "CI", "COMPLETED", "SUCCESS", 11520, 2)] })];
const PRS_CLOSED = [pr(36, "feat: gift wrapping", "octocat", 60 * 24 * 10, "gift-wrap", { state: "CLOSED" })];

const run = (id, number, title, workflowName, event, branch, status, conclusion, startMin, tookMin) => ({
  databaseId: id, number, displayTitle: title, status, conclusion, workflowName, headBranch: branch, headSha: (id * 2654435761 % 0xfffffff).toString(16).padStart(7, "0"),
  event, createdAt: at(startMin), startedAt: at(startMin), updatedAt: status === "completed" ? at(startMin - tookMin) : at(0), url: `https://github.com/${REPO}/actions/runs/${id}`, attempt: 1,
});
const RUNS = [
  run(9128, 128, "fix: guard the empty cart in checkout", "CI", "pull_request", "fix/empty-cart", "in_progress", "", 1.2, 0),
  run(9127, 127, "feat: remember the payment method", "CI", "pull_request", "feat/payment-memory", "completed", "failure", 300, 3.67),
  run(9126, 126, "chore: release 0.9.2", "Release", "push", "v0.9.2", "completed", "success", 60 * 26, 4.03),
  run(9125, 125, "chore: release 0.9.2", "CI", "push", "main", "completed", "success", 60 * 26 + 2, 2.85),
  run(9124, 124, "refactor: split the pricing module", "CI", "pull_request", "refactor/pricing", "completed", "cancelled", 60 * 48, 0.67),
  run(9031, 31, "Nightly dependency check", "Deps", "schedule", "main", "completed", "success", 60 * 50, 0.37),
];
const step = (number, name, status, conclusion, startMin, tookSec) => ({ number, name, status, conclusion, startedAt: at(startMin), completedAt: status === "completed" ? new Date(Date.parse(at(startMin)) + tookSec * 1000).toISOString() : null });
const job = (id, name, status, conclusion, startMin, tookSec, steps) => ({ databaseId: id, name, status, conclusion, startedAt: at(startMin),
  completedAt: status === "completed" ? new Date(Date.parse(at(startMin)) + tookSec * 1000).toISOString() : null, url: `https://github.com/${REPO}/actions/runs/1/job/${id}`, steps });
const JOBS = {
  9128: [
    job(1, "lint", "completed", "success", 1.2, 18, [step(1, "Set up job", "completed", "success", 1.2, 2), step(2, "Run lint", "completed", "success", 1.15, 14)]),
    job(2, "test (macos-latest)", "in_progress", "", 1.1, 0, [step(1, "Set up job", "completed", "success", 1.1, 2), step(2, "Checkout", "completed", "success", 1.05, 3), step(3, "Setup Node 24", "completed", "success", 1, 9),
      step(4, "npm ci", "completed", "success", 0.85, 21), step(5, "npm test", "in_progress", "", 0.45, 0), step(6, "Upload coverage", "queued", "", 0, 0)]),
    job(3, "test (ubuntu-latest)", "completed", "success", 1.1, 54, [step(1, "Set up job", "completed", "success", 1.1, 2), step(2, "npm test", "completed", "success", 1, 44)]),
    job(4, "build", "queued", "", 0, 0, []),
  ],
  9127: [
    job(11, "lint", "completed", "success", 300, 17, [step(1, "Set up job", "completed", "success", 300, 2), step(2, "Run lint", "completed", "success", 299.9, 13)]),
    job(12, "test (macos-latest)", "completed", "failure", 300, 108, [step(1, "Set up job", "completed", "success", 300, 2), step(2, "Checkout", "completed", "success", 299.95, 3),
      step(3, "Setup Node 24", "completed", "success", 299.9, 8), step(4, "npm ci", "completed", "success", 299.75, 22), step(5, "npm test", "completed", "failure", 299.4, 73), step(6, "Upload coverage", "completed", "skipped", 298.2, 0)]),
    job(13, "test (ubuntu-latest)", "completed", "failure", 300, 91, [step(1, "Set up job", "completed", "success", 300, 2), step(2, "npm test", "completed", "failure", 299.9, 80)]),
    job(14, "build", "completed", "skipped", 298, 0, []),
  ],
};
const logLine = (jobName, text) => `${jobName}\tnpm test\t2026-01-01T10:00:00.0000000Z ${text}`;
const FAILED_LOG = ["test (macos-latest)", "test (ubuntu-latest)"].flatMap((j) => [
  "> acme-app@0.9.2 test", "> node --test", "✔ cart totals (12 tests) 204ms", "✖ payment memory", "  ✖ preselects the last method",
  "    AssertionError: expected 'card' to equal 'invoice'", "      at test/payment.test.ts:41:12", "  ✔ falls back to the default", "ℹ tests 38 · pass 37 · fail 1",
  "##[error]Process completed with exit code 1.",
].map((l) => logLine(j, l))).join("\n");
const JOB_LOG = ["Run npm run lint", "> acme-app@0.9.2 lint", "> eslint src test", "✔ 0 problems", "Done in 13.2s"].map((l) => logLine("lint", l)).join("\n");

const TIMELINE = {
  47: [{ event: "commented", actor: bot("github-actions"), created_at: at(19), body: "Workflows from first-time contributors need approval before they run.", author_association: "NONE" },
    { event: "review_requested", actor: person("octocat"), created_at: at(18) }],
  46: [{ event: "labeled", actor: person(ME), created_at: at(12), label: BUG }, { event: "milestoned", actor: person(ME), created_at: at(12), milestone: { title: "v1.0" } },
    { event: "commented", actor: person(ME), created_at: at(10), body: "Reproduced. #44 fixes it.", author_association: "OWNER" }],
};

const args = process.argv.slice(2), has = (f) => args.includes(f), val = (f) => args[args.indexOf(f) + 1];
// One answer per call; written with a callback, so a large answer is flushed before the process ends.
const findIn = (lists, n) => lists.flat().find((x) => x.number === n);

function answer() {
  const [a, b] = args;
  if (a === "api" && b === "user") return (`${ME}\n`);
  if (a === "api" && args.some((x) => /\/milestones/.test(x))) return (MILESTONES);
  if (a === "api" && args.some((x) => /\/actions\/runs\?head_sha=4b825dc/.test(x))) return ({ workflow_runs: [{ id: 9129, name: "CI", status: "action_required", conclusion: null }] });
  if (a === "api" && args.some((x) => /\/actions\/runs\?head_sha=/.test(x))) return ({ workflow_runs: [] });
  if (a === "api" && args.some((x) => /^(repos\/[^/]+\/[^/]+|orgs\/[^/]+)\/actions\/runners/.test(x))) return ({ total_count: 0, runners: [] });
  if (a === "api" && args.includes("POST")) return ("");
  if (a === "api" && args.some((x) => /\/timeline/.test(x))) { const n = Number(/issues\/(\d+)\/timeline/.exec(args.find((x) => /timeline/.test(x)))[1]); return ([TIMELINE[n] ?? []]); }
  if (a === "repo" && b === "view") return ({ defaultBranchRef: { name: "main" }, squashMergeAllowed: true, mergeCommitAllowed: true, rebaseMergeAllowed: false, deleteBranchOnMerge: true,
    stargazerCount: 128, forkCount: 14, watchers: { totalCount: 9 }, issues: { totalCount: ISSUES_OPEN.length }, pullRequests: { totalCount: PRS_OPEN.length },
    latestRelease: { tagName: "v0.9.2", name: "0.9.2" } });
  if (a === "issue" && b === "list") return (val("--state") === "closed" ? ISSUES_CLOSED : ISSUES_OPEN);
  if (a === "pr" && b === "list") return ({ open: PRS_OPEN, merged: PRS_MERGED, closed: PRS_CLOSED }[val("--state")] ?? []);
  if (a === "issue" && b === "view") return (findIn([ISSUES_OPEN, ISSUES_CLOSED], Number(args[2])) ?? {});
  if (a === "pr" && b === "view") return (findIn([PRS_OPEN, PRS_MERGED, PRS_CLOSED], Number(args[2])) ?? {});
  if (a === "run" && b === "list") return (RUNS);
  if (a === "run" && b === "view" && has("--log-failed")) return (FAILED_LOG);
  if (a === "run" && b === "view" && has("--job")) return (JOB_LOG);
  if (a === "run" && b === "view") { const r = RUNS.find((x) => String(x.databaseId) === args[2]) ?? RUNS[0]; return ({ ...r, jobs: JOBS[r.databaseId] ?? [] }); }
  if (["merge", "comment", "close", "reopen", "edit", "rerun", "cancel"].includes(b)) return ("ok\n");
  return undefined;
}

const got = answer();
if (got === undefined) { process.stderr.write(`demo gh: no answer for: gh ${args.join(" ")}\n`); process.exitCode = 1; }
else process.stdout.write(typeof got === "string" ? got : JSON.stringify(got));
