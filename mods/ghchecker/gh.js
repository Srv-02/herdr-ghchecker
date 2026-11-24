// Every GitHub call goes through the GitHub CLI: its sign-in, its host, its pagination.
// gh and the loaders adapted from herdr-github by alarboulletmarin (MIT), mods/github/gh.js at 75a2b40.
import { exec } from "herdr";
import { pickRemote } from "./lib/location.js";
import { trimLog } from "./lib/log.js";
import { STATS_FIELDS } from "./lib/stats.js";

const GH = "gh";

export async function gh(args, opts = {}) {
  const r = await exec(GH, args, { timeout: 60000, ...opts }).catch((e) => ({ code: 127, stdout: "", stderr: String(e?.message ?? e) }));
  if (r.code !== 0) {
    const err = new Error((r.stderr || r.stdout || "gh failed").trim().split("\n").slice(-3).join(" ").slice(0, 300));
    err.code = r.code;
    throw err;
  }
  return r.stdout;
}
export const ghJson = async (args, opts) => JSON.parse(await gh(args, opts) || "null");

// What stops the panel before any repository: gh missing, signed out, or ready with the login.
export async function account() {
  const r = await exec(GH, ["api", "user", "--jq", ".login"]).catch(() => null);
  if (!r) return { state: "missing" };
  if (r.code !== 0) return { state: /401|auth|log ?in|token/i.test(r.stderr) ? "logged_out" : "error", detail: r.stderr.trim().split("\n").pop() };
  return { state: "ready", login: r.stdout.trim() };
}

// The GitHub repository of a folder from its remotes (git only, no network). `on`: a remote machine.
export async function repoOf(cwd, on) {
  const r = await exec("git", ["remote", "-v"], { cwd, on, timeout: 10000 }).catch(() => null);
  return r?.code === 0 ? pickRemote(r.stdout) : null;
}

const ISSUE = "number,title,url,state,stateReason,labels,assignees,author,createdAt,updatedAt,comments,milestone";
const PR = "number,title,url,state,isDraft,labels,author,assignees,createdAt,updatedAt,headRefName,baseRefName,headRepositoryOwner,isCrossRepository,reviewDecision,reviewRequests,statusCheckRollup,comments,mergedAt";
const RUN = "databaseId,number,displayTitle,status,conclusion,workflowName,headBranch,headSha,event,createdAt,updatedAt,startedAt,url,attempt";

// The lists keep a comment count, not the comments.
const slim = (list) => (list ?? []).map(({ comments, ...i }) => ({ ...i, commentCount: Array.isArray(comments) ? comments.length : 0 }));

export const load = {
  issues: async (repo, state) => slim(await ghJson(["issue", "list", "-R", repo, "--state", state, "--limit", "200", "--json", ISSUE])),
  prs: async (repo, state) => slim(await ghJson(["pr", "list", "-R", repo, "--state", state, "--limit", "100", "--json", PR])),
  runs: async (repo) => await ghJson(["run", "list", "-R", repo, "--limit", "40", "--json", RUN]) ?? [],
  async milestones(repo) {
    const list = await ghJson(["api", `repos/${repo}/milestones?state=all&per_page=100`]) ?? [];
    return list.map((m) => ({ number: m.number, title: m.title, state: m.state, open: m.open_issues, closed: m.closed_issues, due: m.due_on }));
  },
  // The default branch (the Actions dot) and the merge methods the repository allows (the merge box).
  info: async (repo) => await ghJson(["repo", "view", repo, "--json", "defaultBranchRef,squashMergeAllowed,mergeCommitAllowed,rebaseMergeAllowed,deleteBranchOnMerge"]),
  // The status bar (lib/stats.js), with the time it was read.
  stats: async (repo) => ({ ...await ghJson(["repo", "view", repo, "--json", STATS_FIELDS]), at: Date.now() }),
};

// A run's failed log, trimmed (lib/log.js); "" when it can't be read.
export async function failedLog(repo, id) {
  return trimLog(await gh(["run", "view", String(id), "-R", repo, "--log-failed"]).catch(() => ""));
}

// The last lines of one finished job's log.
export async function jobLog(repo, jobId, lines = 40) {
  return trimLog(await gh(["run", "view", "--job", String(jobId), "-R", repo, "--log"]).catch(() => ""), lines);
}
