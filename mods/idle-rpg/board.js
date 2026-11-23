// Idle RPG's quest board: a read-only kanban of what the agents are working
// on, one card per repo and branch an agent is on (not the default branch),
// in three columns: "progress" (no pull request link seen yet), "review" (a
// pull request link seen) and "completed" (the branch has been merged, per
// local git, or deleted here and on its remote after a pull request: Gone).
//
// Everything comes from the agents' own sessions and local files; nothing
// goes over the network (git is run hardened against a repo's own settings:
// GIT_PREFIX). The owner: "it shouldnt run gh, cant this relevant
// information be pulled from agent sessions?" So:
//
// - Which repo and branch: the agent's pane (`panes()`: `cwd`, `branch`).
// - Who: every agent seen on the card, remembered after it moves to another
//   branch (mergeAgents): those on it now are `present`, with their live
//   status; the rest keep their last status and when they were last here.
// - The project: the agent's Herdr space name.
// - The repo's name: owner/name from the repo's git remote URL, read from its
//   git config with `readTextFile` (credentials in the URL are never kept);
//   else the folder's name.
// - Pull request links and ticket keys: the agent's terminal text, through
//   `hc read <address> --json --lines N` (and ticket keys in the branch
//   name). A pull request link counts for a card only if its number is above
//   the highest of the repo's in that terminal when first read for the card,
//   or the text ties it to the branch ("pull request for <branch>", --head
//   <branch>, what `gh pr create` printed while on the branch): links from an
//   agent's earlier branches stay off a new one. Results are cached per card,
//   so they outlive the session's scrollback.
// - Merged: the branch's head commit is an ancestor of the local
//   remote-tracking default branch (refs/remotes/<remote>/HEAD). The two
//   commits are read from git's ref files; ancestry needs git itself:
//   `git <GIT_PREFIX> merge-base --is-ancestor <sha> <sha>`, run only when
//   either commit changed (and once more to check a merged head carries on
//   from the work seen). Completed needs the branch to have been seen not
//   merged first (a commit of its own), so a branch just made from main is
//   never done; a merged branch whose head moves on, or a merged head that is
//   not the work seen, starts the card over (the name was reused). A squash or
//   rebase merge leaves the branch's own commits out of the default branch, so
//   ancestry misses it; instead:
// - Gone: no agent's pane names the branch, and neither refs/heads/<branch>
//   nor refs/remotes/<remote>/<branch> is in the ref files (loose or
//   packed-refs; in a reftable repo, `rev-parse --verify` says there is no
//   such ref), on two checks in a row. Finished (completed) if it had a pull
//   request link, or was seen with a commit of its own and seen pushed (its
//   remote-tracking ref); otherwise abandoned, and the card goes.
// - The default branch (origin/HEAD's, else main or master) gets no card.
//   For a space on another machine, files are read and git is run on that
//   machine, through herdr-core (`on`).
//
// The host passes `wait(ms)` (in main.js: `(ms) => new Promise((r) =>
// cx.timer.after(ms, r))`; Herdr's engine has no usable setTimeout) to time
// out calls. Without it calls are not timed out one by one, but a refresh
// that has run longer than `refreshStallMs` (by the times given to refresh())
// is abandoned on the next refresh() and its late answers ignored.
//
// Plain functions and a small collector (`Board`) that takes the herdr
// functions as arguments, so the tests run it with fakes and main.js decides
// when to call it. Nothing typed by a person or read from a terminal becomes
// a file path, a command argument or a picture path: paths come from Herdr's
// panes and git's own files, and git is run only with commit ids read from
// those files (40 or 64 hex digits) or ref names checked by `safeRef`.

// How often the view should call refresh(): while the board is open, and
// in the background while it is closed (0: not at all; the cards keep).
export const BOARD_REFRESH_OPEN_MS = 30_000;
export const BOARD_REFRESH_CLOSED_MS = 0;

export const COLUMNS = ["progress", "review", "completed"];

export const BOARD_LIMITS = {
  readsPerRefresh: 4, // `hc read` calls per refresh (terminals read in turn)
  terminalLines: 3000, // lines of history asked of `hc read`
  textChars: 400_000, // characters of a terminal's text looked at (its end)
  rereadMs: 60_000, // a terminal is read again at most this often
  gitChecksPerRefresh: 6, // cards whose merged state is checked per refresh
  gitCheckMs: 60_000, // a card's merged state is checked at most this often
  execPerRefresh: 6, // `git` runs per refresh
  execTimeoutMs: 5_000,
  callTimeoutMs: 10_000, // `hc` and file reads, when the host passes `wait`
  refreshStallMs: 120_000, // a refresh still running after this is abandoned
  contextChars: 2_000, // a PR link this soon after "pull request for <branch>" and the like is the branch's
  createdChars: 20_000, // the first PR link this soon after `gh pr create` is what it made
  fileReadsPerRefresh: 150,
  walkDepth: 24, // folders walked up from a pane's cwd looking for `.git`
  repoCacheMs: 10 * 60_000, // a folder's repo, once found (or not)
  agentsPerRefresh: 500,
  maxCards: 60,
  maxTickets: 4,
  agentsPerCard: 12, // agents a card remembers: all those on it now, then the most recently gone
  completedKeepMs: 24 * 3600_000, // completed cards stay a day after first seen completed
  orphanKeepMs: 24 * 3600_000, // cards in review with no agent left stay a day
  abandonedKeepMs: 2 * 3600_000, // cards in progress (no pull request link) with no agent left stay 2 hours
};

const TEXT_MAX = { repo: 120, branch: 120, project: 60, ticket: 32, url: 300 };

// Every git run starts with these: no fetching of missing objects (a partial
// clone would otherwise fetch, running the repo's own ssh command or ext::
// helper), no index refresh, no fsmonitor helper, no hooks. Needs a git that
// has --no-lazy-fetch (2.50.1, the owner's, does); one without it exits 129
// with "unknown option", and the merged check is turned off on that machine.
export const GIT_PREFIX = ["--no-lazy-fetch", "--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null"];

// ---- Small helpers ----------------------------------------------------------

// Text fit to show: no control or bidi-override characters, trimmed, at most `max`.
export function clean(value, max = 120) {
  if (typeof value !== "string") return "";
  // eslint-disable-next-line no-control-regex
  const s = value.replace(/[\u0000-\u001f\u007f-\u009f\u061c\u200b-\u200f\u2028-\u202e\u2060-\u2064\u2066-\u2069\ufeff\u{E0000}-\u{E007F}]/gu, "").trim();
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// A short, stable id from a string (FNV-1a), so card ids carry no paths.
export function hashId(s) {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return "card-" + h.toString(36);
}

const SHA = /^(?:[0-9a-f]{40}|[0-9a-f]{64})$/;
export const isSha = (s) => typeof s === "string" && SHA.test(s);

// A ref or remote name safe to put after refs/heads/ in a path and to hand to
// git: plain characters, no "..", no empty, hidden or leading-dash parts.
export function safeRef(name, { slash = true } = {}) {
  if (typeof name !== "string" || name.length === 0 || name.length > 200) return false;
  if (!/^[A-Za-z0-9._+\/-]+$/.test(name)) return false;
  if (!slash && name.includes("/")) return false;
  if (name.includes("..") || name.includes("//") || name.endsWith(".lock") || name.endsWith(".")) return false;
  return name.split("/").every((part) => part.length > 0 && !part.startsWith(".") && !part.startsWith("-"));
}

// ---- Paths (POSIX and Windows) ----------------------------------------------

function sepOf(p) {
  return p.includes("\\") && !p.includes("/") ? "\\" : "/";
}
function isAbsolute(p) {
  return p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p) || p.startsWith("\\\\");
}
// Splits a path into its root ("/", "C:\", "\\") and parts, resolving "." and "..".
function splitPath(p) {
  let root = "";
  let rest = p;
  const drive = /^([A-Za-z]:)[\\/]/.exec(p);
  if (drive) {
    root = drive[1] + sepOf(p);
    rest = p.slice(3);
  } else if (p.startsWith("\\\\")) {
    root = "\\\\";
    rest = p.slice(2);
  } else if (p.startsWith("/")) {
    root = "/";
    rest = p.slice(1);
  }
  const parts = [];
  for (const part of rest.split(/[\\/]+/)) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return { root, parts, sep: sepOf(p) };
}
export function joinPath(base, ...more) {
  const sep = sepOf(base);
  let p = base;
  for (const m of more) {
    if (isAbsolute(m)) p = m;
    else p = p.replace(/[\\/]+$/, "") + sep + m.replace(/\//g, sep);
  }
  const { root, parts } = splitPath(p);
  return root + parts.join(sep);
}
export function parentPath(p) {
  const { root, parts, sep } = splitPath(p);
  if (parts.length === 0) return null;
  return root + parts.slice(0, -1).join(sep);
}
export function baseName(p) {
  const { parts } = splitPath(p);
  return parts.length ? parts[parts.length - 1] : "";
}

// ---- Git remotes ------------------------------------------------------------

const HOST = /^(?=.{1,253}$)[a-z0-9](?:[a-z0-9-]{0,62})(?:\.[a-z0-9](?:[a-z0-9-]{0,62}))*$/;
const REPO_PATH = /^[A-Za-z0-9._~-]+(?:\/[A-Za-z0-9._~-]+){1,5}$/;

// A remote URL to { host, slug, owner, name }, or null (a local path, junk).
// Accepts https/http/ssh/git URLs and scp-like "git@host:owner/name.git".
// Credentials ("user:token@") are dropped, never returned.
export function parseRemote(url) {
  if (typeof url !== "string") return null;
  const u = url.trim();
  if (!u || u.length > 1000 || /\s/.test(u)) return null;
  let host;
  let path;
  const full = /^(?:https?|ssh|git|git\+ssh|ssh\+git):\/\/(?:[^/]*@)?([^/:?#]+)(?::\d+)?\/([^?#]*)/i.exec(u);
  if (full) {
    host = full[1];
    path = full[2];
  } else {
    const scp = /^(?:[^@/:]+@)?([^/:]{2,}):(?!\/\/)([^?#]+)$/.exec(u); // not "C:\..." (one letter)
    if (!scp) return null;
    host = scp[1];
    path = scp[2];
  }
  host = host.toLowerCase();
  if (!HOST.test(host)) return null; // a plain name ("github", an ssh alias) is fine too
  path = path.replace(/^\/+|\/+$/g, "").replace(/\.git$/i, "");
  // Bitbucket Server / Azure DevOps style prefixes are kept as they are; only
  // the last two parts make owner/name.
  if (!REPO_PATH.test(path)) return null;
  if (path.split("/").some((part) => part === "." || part === "..")) return null;
  const parts = path.split("/");
  const name = parts[parts.length - 1];
  const owner = parts.slice(0, -1).join("/");
  return { host, slug: `${owner}/${name}`, owner, name };
}

// Git's config text to its remotes' URLs, { name: url }, in order.
export function parseGitConfigRemotes(text) {
  const remotes = {};
  if (typeof text !== "string") return remotes;
  let current = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#") || line.startsWith(";")) continue;
    const section = /^\[\s*([A-Za-z0-9.-]+)(?:\s+"((?:[^"\\]|\\.)*)")?\s*\]/.exec(line);
    if (section) {
      current = section[1].toLowerCase() === "remote" && section[2] != null ? section[2] : null;
      continue;
    }
    if (current == null) continue;
    const kv = /^url\s*=\s*(.*)$/i.exec(line);
    if (kv && !(current in remotes)) {
      let v = kv[1].trim();
      if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) v = v.slice(1, -1);
      remotes[current] = v;
    }
  }
  return remotes;
}

// The remote to name the repo by: origin, else the first one with a URL we read.
export function pickRemote(remotes) {
  const names = Object.keys(remotes);
  const order = names.includes("origin") ? ["origin", ...names.filter((n) => n !== "origin")] : names;
  for (const n of order) {
    if (!safeRef(n, { slash: false })) continue;
    const parsed = parseRemote(remotes[n]);
    if (parsed) return { remote: n, ...parsed };
  }
  return null;
}

// ---- Refs ---------------------------------------------------------------------

// packed-refs text to { ref: sha }.
export function parsePackedRefs(text) {
  const refs = {};
  if (typeof text !== "string") return refs;
  for (const line of text.split(/\r?\n/)) {
    if (!line || line.startsWith("#") || line.startsWith("^")) continue;
    const m = /^([0-9a-f]{40}|[0-9a-f]{64}) (refs\/\S+)$/.exec(line);
    if (m) refs[m[2]] = m[1];
  }
  return refs;
}

// ---- Terminal text: pull requests and tickets ----------------------------------

const ANSI = /\x1b\[[0-9;?]*[ -\/]*[@-~]|\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g;
const URL_RE = /https?:\/\/[^\s<>"'`()\[\]{}|\\^]+/g;
const SEG = "[A-Za-z0-9._~-]+";

// One URL to a pull/merge request { url, number, host, slug }, or null. The URL
// returned is rebuilt from its parts: no credentials, query or fragment.
export function parsePrUrl(raw) {
  if (typeof raw !== "string" || raw.length > 1000) return null;
  const m = /^https?:\/\/(?:[^/\s]*@)?([A-Za-z0-9.-]+)(?::\d+)?(\/[^?#\s]*)/.exec(raw);
  if (!m) return null;
  const host = m[1].toLowerCase();
  const path = m[2];
  let hit;
  // GitHub (and GitHub Enterprise): /owner/name/pull/123
  if ((hit = new RegExp(`^/(${SEG})/(${SEG})/pull/(\\d{1,9})(?:[/.,;:!?]|$)`).exec(path))) {
    return pr(host, `${hit[1]}/${hit[2]}`, `/pull/${hit[3]}`, hit[3]);
  }
  // GitLab: /group[/sub]/name/-/merge_requests/123
  if ((hit = new RegExp(`^/(${SEG}(?:/${SEG}){1,5})/-/merge_requests/(\\d{1,9})(?:[/.,;:!?]|$)`).exec(path))) {
    return pr(host, hit[1], `/-/merge_requests/${hit[2]}`, hit[2]);
  }
  // Bitbucket Cloud: /owner/name/pull-requests/123
  if ((hit = new RegExp(`^/(${SEG})/(${SEG})/pull-requests/(\\d{1,9})(?:[/.,;:!?]|$)`).exec(path))) {
    return pr(host, `${hit[1]}/${hit[2]}`, `/pull-requests/${hit[3]}`, hit[3]);
  }
  // Bitbucket Server: /projects/KEY/repos/name/pull-requests/123
  if ((hit = new RegExp(`^/projects/(${SEG})/repos/(${SEG})/pull-requests/(\\d{1,9})(?:[/.,;:!?]|$)`).exec(path))) {
    return { ...pr(host, `${hit[1]}/${hit[2]}`, "", hit[3]), url: `https://${host}/projects/${hit[1]}/repos/${hit[2]}/pull-requests/${hit[3]}` };
  }
  return null;
}
function pr(host, slug, tail, number) {
  const clean = slug.replace(/\.git$/i, "");
  return { url: `https://${host}/${clean}${tail}`, number: Number(number), host, slug: clean };
}

// A key: 2 to 10 capital letters, a dash, a number. Jira allows digits in a
// project key; a person whose keys have them passes their own pattern.
export const DEFAULT_TICKET_PATTERN = "\\b[A-Z][A-Z]{1,9}-\\d+\\b";
export const TICKET_PREFIX_MAX = 10;
// Hosts whose /browse/KEY-1 links are ticket links (the host or under it).
export const DEFAULT_TICKET_HOSTS = ["atlassian.net", "linear.app"];
// Prefixes of things that look like ticket keys but are not.
export const DEFAULT_TICKET_DENY = [
  "UTF", "UCS", "SHA", "MD", "ISO", "IEC", "IEEE", "HTTP", "HTTPS", "TLS", "SSL", "RFC", "CVE", "CWE", "GHSA",
  "AES", "RSA", "DES", "ECDSA", "ED", "HMAC", "CRC", "BASE", "ASCII", "ANSI", "LATIN", "CP", "WIN", "WINDOWS",
  "EUC", "KOI", "BIG", "GB", "PEP", "ES", "ECMA", "IPV", "X", "COVID", "GPT", "PR", "MR", "TOP", "LAYER", "WCAG",
  "H", "P", "K", "ARM", "AMD", "UTC", "GMT", "PST", "EST", "CET", "Q", "FY", "V", "VERSION", "RELEASE",
  // Status words with a number: "ERR-404", "PORT-8080", "EXIT-1".
  "ERR", "ERROR", "PORT", "EXIT", "OOMKILLED", "CODE", "STATUS", "SIG", "SIGNAL", "PID", "LINE", "STEP", "RETRY", "TIMEOUT",
  // AWS key id prefixes: secret-shaped, never tickets.
  "AKIA", "ASIA", "AIDA", "AROA", "AIPA", "ANPA", "ANVA", "APKA", "AGPA",
];

// A ticket finder from a pattern and a deny list (the view may pass the
// person's own). A pattern that fails to compile falls back to the default.
export function ticketMatcher(pattern = DEFAULT_TICKET_PATTERN, deny = DEFAULT_TICKET_DENY) {
  let re;
  try {
    re = pattern instanceof RegExp ? new RegExp(pattern.source, pattern.flags.includes("g") ? pattern.flags : pattern.flags + "g") : new RegExp(pattern, "g");
  } catch {
    re = new RegExp(DEFAULT_TICKET_PATTERN, "g");
  }
  const denied = new Set(deny.map((d) => String(d).toUpperCase()));
  return function find(text) {
    const found = []; // [{ key, at }] in order of appearance
    if (typeof text !== "string" || !text) return found;
    re.lastIndex = 0;
    let m;
    let guard = 0;
    while ((m = re.exec(text)) && guard++ < 20000) {
      if (m[0].length === 0) {
        re.lastIndex++;
        continue;
      }
      const key = m[0];
      if (key.length > TEXT_MAX.ticket) continue;
      const dash = key.lastIndexOf("-");
      const prefix = key.slice(0, dash).toUpperCase();
      const num = key.slice(dash + 1);
      if (dash <= 0 || prefix.length > TICKET_PREFIX_MAX || denied.has(prefix) || /^0/.test(num) || /^\d+$/.test(prefix)) continue;
      const after = text.slice(m.index + key.length, m.index + key.length + 2);
      if (/^\.\d/.test(after)) continue; // a version: "GCC-12.2"
      const before = text[m.index - 1];
      if (before === "-" || before === "." || before === "/" && !/\/browse\/$|\/issue\/$|\/issues\/$/.test(text.slice(Math.max(0, m.index - 8), m.index))) continue;
      found.push({ key, at: m.index });
    }
    return found;
  };
}

export const hostIn = (host, hosts) => hosts.some((h) => host === h || host.endsWith("." + h));

// Ticket links: Jira (/browse/KEY-1, selectedIssue=KEY-1) and Linear
// (linear.app/team/issue/KEY-1), only on ticket hosts (`hosts`, each the
// host or a parent of it). Rebuilt from their parts.
export function parseTicketUrl(raw, hosts = DEFAULT_TICKET_HOSTS) {
  if (typeof raw !== "string" || raw.length > 1000) return null;
  const m = /^https?:\/\/(?:[^/\s]*@)?([A-Za-z0-9.-]+)(?::\d+)?(\/[^#\s]*)/.exec(raw);
  if (!m) return null;
  const host = m[1].toLowerCase();
  if (!hostIn(host, hosts)) return null;
  const rest = m[2];
  let hit;
  if (host === "linear.app" && (hit = /^\/([A-Za-z0-9_-]+)\/issue\/([A-Z][A-Z0-9]+-\d{1,9})\b/.exec(rest))) {
    return { key: hit[2], url: `https://linear.app/${hit[1]}/issue/${hit[2]}` };
  }
  if ((hit = /\/browse\/([A-Z][A-Z0-9]+-\d{1,9})\b/.exec(rest)) || (hit = /[?&]selectedIssue=([A-Z][A-Z0-9]+-\d{1,9})\b/.exec(rest))) {
    return { key: hit[1], url: `https://${host}/browse/${hit[1]}` };
  }
  return null;
}

// Where `branch` is mentioned in `text` as a whole word (at most 1000 places).
export function branchMentions(text, branch) {
  const at = [];
  if (typeof text !== "string" || typeof branch !== "string" || branch.length < 2) return at;
  const word = /[A-Za-z0-9._\/-]/;
  for (let i = text.indexOf(branch); i >= 0 && at.length < 1000; i = text.indexOf(branch, i + 1)) {
    if (word.test(text[i - 1] ?? " ") || word.test(text[i + branch.length] ?? " ")) continue;
    at.push(i);
  }
  return at;
}

const YEAR = /^(?:19|20)\d\d$/;

const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const END = "(?![A-Za-z0-9._/-])";
const URL_TAIL = "(?![A-Za-z0-9._~%/-])"; // the branch is the whole rest of a URL path part

// Whether a branch name is specific enough to recognise in text: at least 4
// characters, or with a "/" ("dev" is a word; "feat/x" is not).
export const distinctBranch = (branch) => typeof branch === "string" && (branch.length >= 4 || branch.includes("/"));

// Places in `text` that say "this is <branch>'s pull request" (each with how
// far after it a link still counts): "pull request for <branch>" (gh pr create),
// `--head <branch>` / `-H <branch>`, "[new branch] <branch>" (git push), and
// .../compare/<branch> or .../tree/<branch>. Never "into <branch>" (that is
// the base of someone else's pull request).
export function branchContexts(text, branch, window = BOARD_LIMITS.contextChars) {
  const out = [];
  if (typeof text !== "string" || !distinctBranch(branch)) return out;
  const b = escapeRe(branch);
  const re = new RegExp(`pull request for ['"]?${b}${END}|(?:--head|-H)[ =]['"]?${b}${END}|\\[new branch\\]\\s+${b}${END}|/(?:compare|tree)/${b}${URL_TAIL}`, "g");
  for (const m of text.matchAll(re)) {
    out.push({ at: m.index, until: m.index + m[0].length + window });
    if (out.length >= 1000) break;
  }
  return out;
}

// The branch a terminal was last on before `pos`, as git said it: the last of
// `git push ... <branch>`, "[new branch] <branch>", "Switched to (a new) branch
// '<branch>'" and "branch '<branch>' set up to track". Null when none.
export function branchBefore(text, pos) {
  const head = text.slice(Math.max(0, pos - 200_000), pos);
  let best = null;
  const see = (at, name) => {
    if (name && name !== "HEAD" && (!best || at >= best.at)) best = { at, name };
  };
  for (const m of head.matchAll(/git push\b([^\n)"'`;&|]*)/g)) {
    const words = m[1].trim().split(/\s+/).filter((w) => w && !w.startsWith("-"));
    if (words.length >= 2) see(m.index, words[words.length - 1].replace(/^\+/, "").split(":")[0]);
  }
  for (const m of head.matchAll(/\[new branch\]\s+(\S+)/g)) see(m.index, m[1]);
  for (const m of head.matchAll(/Switched to (?:a new )?branch '([^'\n]+)'/g)) see(m.index, m[1]);
  for (const m of head.matchAll(/branch '([^'\n]+)' set up to track/g)) see(m.index, m[1]);
  return best ? best.name : null;
}

// What `gh pr create` / `glab mr create` made: for each such command, the
// first of `prs` (this repo's) within `window` after it, with the branch the
// command was for: its --head/-H, else the branch git last named before it
// (null: unknown).
export function createdPrs(text, prs, window = BOARD_LIMITS.createdChars) {
  const out = [];
  if (typeof text !== "string") return out;
  for (const m of text.matchAll(/\b(?:gh pr create|glab mr create)\b/g)) {
    const at = m.index;
    let first = null;
    for (const p of prs) for (const x of p.ats) if (x > at && x <= at + window && (!first || x < first.x)) first = { p, x };
    if (!first) continue;
    const line = text.slice(at, Math.min(first.x, text.indexOf("\n", at) < 0 ? first.x : text.indexOf("\n", at)));
    const head = /(?:--head|-H)[ =]['"]?([A-Za-z0-9._\/+-]+)/.exec(line);
    out.push({ url: first.p.url, branch: head ? head[1] : branchBefore(text, at) });
    if (out.length >= 100) break;
  }
  return out;
}

// What a terminal's text says: pull requests (in order of appearance, `ats`
// every place, `at` the last), ticket keys (by last mention, most recent
// first) and ticket links. Given `branch` and `remote`, also which of the
// repo's links the text ties to the branch (`tied`), and what `gh pr create`
// made for an unknown branch (`createdUnsure`). A key whose number looks like
// a year ("HUNTER-2024") counts only if its prefix also comes with another
// number, or is in `knownPrefixes`.
export function scanText(text, findTickets = ticketMatcher(), { maxChars = BOARD_LIMITS.textChars, ticketHosts = DEFAULT_TICKET_HOSTS, branch = null, remote = null, knownPrefixes = [] } = {}) {
  const out = { prs: [], tickets: [], ticketUrls: {}, tied: [], createdUnsure: [] };
  if (typeof text !== "string" || !text) return out;
  let t = text.length > maxChars ? text.slice(text.length - maxChars) : text;
  t = t.replace(ANSI, "");
  const seenPr = new Set();
  for (const m of t.matchAll(URL_RE)) {
    const raw = m[0].replace(/[.,;:!?]+$/, "");
    const p = parsePrUrl(raw);
    if (p) {
      if (!seenPr.has(p.url) && p.url.length <= TEXT_MAX.url) {
        seenPr.add(p.url);
        out.prs.push({ ...p, at: m.index, ats: [m.index] });
      } else {
        const prev = out.prs.find((x) => x.url === p.url);
        if (prev) {
          prev.at = m.index;
          if (prev.ats.length < 200) prev.ats.push(m.index);
        }
      }
      continue;
    }
    const tk = parseTicketUrl(raw, ticketHosts);
    if (tk && tk.url.length <= TEXT_MAX.url) out.ticketUrls[tk.key] = tk.url;
  }
  const found = findTickets(t);
  const prefix = (key) => key.slice(0, key.lastIndexOf("-"));
  const known = new Set([...knownPrefixes, ...Object.keys(out.ticketUrls).map(prefix)]);
  for (const { key } of found) if (!YEAR.test(key.slice(key.lastIndexOf("-") + 1))) known.add(prefix(key));
  const last = new Map();
  for (const { key, at } of found) if (known.has(prefix(key))) last.set(key, at);
  for (const key of Object.keys(out.ticketUrls)) if (!last.has(key)) last.set(key, t.length);
  out.tickets = [...last.entries()].sort((a, b) => b[1] - a[1]).map(([k]) => k);
  if (branch && remote) {
    const mine = prsForRepo(out.prs, remote);
    const contexts = branchContexts(t, branch);
    const tied = new Set(mine.filter((p) => p.ats.some((x) => contexts.some((c) => x > c.at && x <= c.until))).map((p) => p.url));
    const unsure = new Set();
    for (const c of createdPrs(t, mine)) {
      if (c.branch === branch) tied.add(c.url);
      else if (c.branch == null) unsure.add(c.url);
    }
    out.tied = [...tied];
    out.createdUnsure = [...unsure].filter((u) => !tied.has(u));
  }
  return out;
}

// Ticket keys in a branch name ("feat/PROJ-123-thing").
export function branchTickets(branch, findTickets = ticketMatcher()) {
  if (typeof branch !== "string") return [];
  // Looks at each part between "/" and "_" on its own ("_" is a word character,
  // and a key right after "/" is otherwise taken for a path).
  const keys = [];
  for (const part of branch.split(/[\/_]/)) for (const { key } of findTickets(" " + part)) if (!keys.includes(key)) keys.push(key);
  return keys;
}

// Whether a pull request's host is the remote's: the same, the remote's ssh
// endpoint ("ssh.github.com", "altssh.gitlab.com"), or any host when the
// remote names an ssh alias ("github-work:owner/name": no dot).
export function hostMatches(remoteHost, prHost) {
  if (remoteHost === prHost) return true;
  if (!remoteHost.includes(".")) return true;
  return remoteHost.replace(/^(?:alt)?ssh\./, "") === prHost;
}

// Pull requests that belong to this repo (its host, and owner/name in any case).
export function prsForRepo(prs, remote) {
  if (!remote) return [];
  const slug = remote.slug.toLowerCase();
  return prs.filter((p) => hostMatches(remote.host, p.host) && p.slug.toLowerCase() === slug);
}

// ---- Columns, merging and order --------------------------------------------------

// The column a card belongs in. Merged counts only once the branch has been
// seen not merged (a commit of its own): a branch just made from the default
// branch is an ancestor of it too, link or no link. A branch gone both here
// and as the remote's (`gone`: deleted after a squash or rebase merge, then
// pruned) counts as finished only with evidence it was merged work
// (goneFinished); otherwise it is abandoned and expires (cardAlive).
export function columnOf(card) {
  if (!card.isDefault && card.merged && card.hadOwnCommits) return "completed";
  if (!card.isDefault && card.gone && goneFinished(card)) return "completed";
  return card.pr ? "review" : "progress";
}

// Whether a gone branch was finished work: it had a pull request link, or it
// was seen with a commit of its own and seen pushed (its remote-tracking ref),
// before both refs went. A branch never pushed and deleted is abandoned.
export const goneFinished = (card) => !!card.pr || (!!card.hadOwnCommits && !!card.seenRemote);

// Whether any agent is on the card's branch now (not only remembered).
export const hasPresent = (card) => Array.isArray(card.agents) && card.agents.some((a) => a && a.present);

// Whether a card is still shown at `now`. "No agent left" means none on the
// branch now: the agents it only remembers do not keep it. Completed: a day
// after first seen completed. Otherwise, with nobody on it: gone (its branch
// deleted everywhere, not finished) at once; in progress 2 hours, in review a
// day after an agent was last on it.
export function cardAlive(card, now, limits = BOARD_LIMITS) {
  if (card.column === "completed") return !(card.completedAt != null && now - card.completedAt > limits.completedKeepMs);
  if (hasPresent(card)) return true;
  if (card.gone) return false;
  const keep = card.column === "progress" ? limits.abandonedKeepMs : limits.orphanKeepMs;
  return now - (card.lastSeenAt ?? 0) <= keep;
}

// Whether `branch` is the repo's default branch, as board.js knows it: the
// one origin/HEAD names, else "main" or "master". Agents on it get no card.
export function isDefaultBranch(repo, branch) {
  return repo && repo.defaultBranch != null ? branch === repo.defaultBranch : branch === "main" || branch === "master";
}

// Every agent a card has seen, merged with those on its branch now (`here`:
// [{ address, status, app }]). The owner: "sometimes an agent has worked on
// a few things at once - so i would remember who worked on what. just because
// they arent currently working or focused on it doesnt mean they never worked
// on it." Those here are `present`, with their live status and `lastSeenAt`
// now; the others keep their last status and when they were last here. Order:
// present first (working and blocked before idle and done, otherwise as
// given), then the rest by most recently here (then by address). At most
// `max`: every present agent is kept, then as many of the rest as fit.
export function mergeAgents(previous, here, now, max = BOARD_LIMITS.agentsPerCard) {
  const live = new Map();
  for (const a of here || []) if (a && !live.has(a.address)) live.set(a.address, { address: a.address, app: a.app ?? null, status: a.status, lastSeenAt: now, present: true });
  const past = new Map();
  for (const a of previous || []) {
    if (!a || live.has(a.address) || past.has(a.address)) continue;
    past.set(a.address, { address: a.address, app: a.app ?? null, status: a.status, lastSeenAt: a.lastSeenAt ?? 0, present: false });
  }
  const resting = (a) => (a.status === "working" || a.status === "blocked" ? 0 : 1);
  const present = [...live.values()].sort((x, y) => resting(x) - resting(y));
  const gone = [...past.values()].sort((x, y) => y.lastSeenAt - x.lastSeenAt || (x.address < y.address ? -1 : x.address > y.address ? 1 : 0));
  return [...present, ...gone.slice(0, Math.max(0, max - present.length))];
}

// Most recently active first, then by id (stable).
export function orderCards(cards) {
  return [...cards].sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

// Folds a pull request into what a card knew: the highest number wins (numbers
// only grow, so it is the most recently opened of those seen).
export function betterPr(current, next) {
  if (!next) return current ?? null;
  if (!current) return next;
  return next.number > current.number ? next : current;
}

// Merges ticket keys: the branch's first, then the most recently mentioned.
export function mergeTickets(branchKeys, scanned, previous, max = BOARD_LIMITS.maxTickets) {
  const out = [];
  for (const k of [...branchKeys, ...scanned, ...previous]) {
    const key = clean(k, TEXT_MAX.ticket);
    if (key && !out.includes(key)) out.push(key);
    if (out.length >= max) break;
  }
  return out;
}

// ---- The collector -------------------------------------------------------------------

function settle(promise, ms, wait) {
  if (typeof wait !== "function" || !ms) return Promise.resolve(promise);
  let timer;
  try {
    timer = Promise.resolve(wait(ms)).then(() => Promise.reject(new Error("timed out")));
  } catch {
    return Promise.resolve(promise); // the host's timer failed: no per-call timeout
  }
  timer.catch(() => {}); // a timer that loses the race is not an unhandled rejection
  return Promise.race([Promise.resolve(promise), timer]);
}
const ADDRESS = /^(?:[A-Za-z0-9_.-]{1,64}\/)?[A-Za-z0-9_.-]{1,64}$/;
const STATUSES = new Set(["working", "blocked", "done", "idle"]);
const ABANDONED = new Error("refresh abandoned");
const MISSING = "missing"; // rev-parse said there is no such ref (not: it failed)
const OUT_OF_READS = new Error("out of file reads");
const READ_FAILED = Symbol("read failed"); // readTextFile rejected or timed out (not: the file is absent)
const READ_MAX = 1024 * 1024; // readTextFile reads up to 1 MiB
const STDOUT_MAX = 9 * 1024 * 1024; // more than exec and hc ever give (8 MiB)

// new Board({ agents, panes, spaces, hc, exec, readTextFile, wait? }, options?)
//   wait(ms): a promise resolved after ms, from the host's timers (see the top)
//   options: { limits, ticketPattern, ticketDeny, ticketHosts }
//   await board.refresh(now)  -> { hc, exec, reads } calls made
//   board.cards(now)          -> shown cards, most recently active first
//   board.columns(now)        -> { progress, review, completed }
//   board.revision            -> goes up whenever what cards() shows changes
//   board.toJSON() / board.restore(json, now): what to keep in shared state
export class Board {
  constructor(deps, options = {}) {
    this.deps = deps;
    this.limits = { ...BOARD_LIMITS, ...(options.limits || {}) };
    this.findTickets = ticketMatcher(options.ticketPattern ?? DEFAULT_TICKET_PATTERN, options.ticketDeny ?? DEFAULT_TICKET_DENY);
    this.ticketHosts = [...DEFAULT_TICKET_HOSTS, ...(Array.isArray(options.ticketHosts) ? options.ticketHosts.filter((h) => typeof h === "string" && /^[a-z0-9.-]{1,253}$/.test(h)) : [])];
    this.wait = typeof deps.wait === "function" ? deps.wait : null;
    this.records = new Map(); // id -> card record (with its git facts, never shown)
    this.repos = new Map(); // machine\0cwd -> { at, repo | null }
    this.terminals = new Map(); // address -> { readAt, seq, card }
    this.running = null;
    this.runningSince = 0;
    this.generation = 0; // a refresh whose generation is not this one is abandoned
    this.oldGit = new Set(); // machines ("" here) whose git lacks GIT_PREFIX's flags: no merged checks there
    this.lastNow = null; // the last refresh's time: cards() shows what was alive then
    this.revision = 0;
  }

  refresh(now) {
    if (this.running && now - this.runningSince > this.limits.refreshStallMs) {
      this.generation++; // a call never answered: let it go, ignore what it says later
      this.running = null;
    }
    if (!this.running) {
      const generation = ++this.generation;
      this.runningSince = now;
      const run = this.#refresh(now, generation).finally(() => {
        if (this.running === run) this.running = null;
      });
      this.running = run;
    }
    return this.running;
  }

  cards(now = this.lastNow ?? Infinity) {
    const shown = [...this.records.values()].filter((r) => now === Infinity || cardAlive(r, now, this.limits));
    return orderCards(shown).map(view);
  }

  columns(now) {
    const out = { progress: [], review: [], completed: [] };
    for (const c of this.cards(now)) out[c.column].push(c);
    return out;
  }

  toJSON() {
    return { version: 1, cards: orderCards([...this.records.values()]).slice(0, this.limits.maxCards).map((r) => persisted(r, this.limits)) };
  }

  restore(data, now = 0) {
    if (!data || data.version !== 1 || !Array.isArray(data.cards)) return;
    for (const raw of data.cards.slice(0, this.limits.maxCards)) {
      const r = revive(raw, this.ticketHosts, this.limits);
      // A card for main or master never seen with work of its own: an agent on
      // the default branch (saved before those got no card). Gone.
      if (r && (r.branch === "main" || r.branch === "master") && !r.hadOwnCommits) continue;
      if (r && !this.records.has(r.id) && cardAlive(r, now, this.limits)) this.records.set(r.id, r);
    }
  }

  async #refresh(now, generation) {
    const shownBefore = JSON.stringify(this.cards(now));
    let used;
    try {
      used = await this.#scan(now, generation);
    } catch (e) {
      if (e === ABANDONED) return { hc: 0, exec: 0, reads: 0, abandoned: true };
      throw e;
    }
    this.lastNow = now;
    if (JSON.stringify(this.cards(now)) !== shownBefore) this.revision++;
    return used;
  }

  // Throws once this refresh has been abandoned: called after every host call.
  #live(call) {
    if (call.generation !== this.generation) throw ABANDONED;
  }

  async #scan(now, generation) {
    const budget = { hc: this.limits.readsPerRefresh, exec: this.limits.execPerRefresh, reads: this.limits.fileReadsPerRefresh };
    const used = { hc: 0, exec: 0, reads: 0 };
    const call = { budget, used, generation };
    const list = (fn) => {
      try {
        const v = fn ? fn() : [];
        return Array.isArray(v) ? v : [];
      } catch {
        return [];
      }
    };
    const agents = list(this.deps.agents).slice(0, this.limits.agentsPerRefresh);
    const panes = new Map(list(this.deps.panes).filter((p) => p && typeof p.pane === "string").map((p) => [p.pane, p]));
    const machines = new Map(list(this.deps.spaces).filter((s) => s && typeof s.id === "string").map((s) => [s.id, typeof s.machine === "string" ? s.machine : null]));

    // 1. Who is where. An agent on the repo's default branch gets no card.
    const present = new Map(); // id -> { repo, branch, agents: [...] }
    const onDefault = new Set(); // ids of default-branch "cards": none kept
    const seenRepos = new Map(); // key -> repo, for restored cards (below)
    for (const a of agents) {
      if (!a || typeof a.address !== "string" || !ADDRESS.test(a.address) || a.address.startsWith("-")) continue;
      const pane = panes.get(a.pane);
      if (!pane || typeof pane.cwd !== "string" || !pane.cwd || typeof pane.branch !== "string" || !pane.branch) continue;
      const machine = machines.get(a.space) ?? null;
      const repo = await this.#repoOf(machine, pane.cwd, now, call);
      if (!repo) continue;
      seenRepos.set(repo.key, repo);
      const branch = pane.branch;
      const id = hashId(`${repo.key}\n${branch}`);
      if (isDefaultBranch(repo, branch)) {
        onDefault.add(id);
        continue;
      }
      let p = present.get(id);
      if (!p) present.set(id, (p = { repo, branch, agents: [] }));
      p.agents.push({
        address: a.address,
        status: STATUSES.has(a.status) ? a.status : "idle",
        app: typeof a.app === "string" ? clean(a.app, 32) : null,
        project: clean(typeof a.space_name === "string" ? a.space_name : "", TEXT_MAX.project),
        seq: Number.isFinite(a.seq) ? a.seq : 0,
      });
    }

    for (const id of onDefault) this.records.delete(id); // a saved one, or one from before

    // 2. Cards for them.
    for (const [id, p] of present) {
      let r = this.records.get(id);
      const isNew = !r;
      if (!r) {
        r = { id, pr: null, tickets: [], ticketUrls: {}, branchKeys: [], merged: false, hadOwnCommits: false, completedAt: null, column: "progress", createdAt: now, updatedAt: now, gitCheckedAt: -Infinity };
        this.records.set(id, r);
      }
      r.prFloor ??= new Map(); // address -> highest PR number of this repo in that terminal when first read for this card
      r.gen ??= 0; // goes up when the branch name is reused for new work
      const before = signature(r);
      r.repo = p.repo.display;
      r.remote = p.repo.remote;
      r.branch = clean(p.branch, TEXT_MAX.branch);
      r.rawBranch = p.branch;
      r.isDefault = isDefaultBranch(p.repo, p.branch); // false: those get no card (above)
      r.git = p.repo;
      if (r.gone || r.goneAt != null) {
        // An agent's pane names the branch: it is not gone. Confirmed gone
        // before, it was made again: new work under the same name.
        if (r.gone) this.#newGeneration(r);
        r.gone = false;
        r.goneAt = null;
        r.gitCheckedAt = -Infinity;
      }
      const agentsBySeq = [...p.agents].sort((x, y) => y.seq - x.seq);
      r.project = agentsBySeq.find((x) => x.project)?.project ?? r.project ?? "";
      r.agents = mergeAgents(r.agents, p.agents, now, this.limits.agentsPerCard);
      r.lastSeenAt = now;
      r.branchKeys = branchTickets(p.branch, this.findTickets);
      r.tickets = mergeTickets(r.branchKeys, [], r.tickets, this.limits.maxTickets);
      if (isNew || signature(r) !== before || r.agents.some((x) => x.present && (x.status === "working" || x.status === "blocked"))) r.updatedAt = now;
    }
    // Cards nobody is on now keep their agents, remembered (not present).
    for (const r of this.records.values()) if (!present.has(r.id)) r.agents = mergeAgents(r.agents, [], now, this.limits.agentsPerCard);
    // Restored cards (no paths in the save) get their repo back when an agent
    // shows it again: the card's id is that repo's key and the branch, so
    // they are checked again (merged, gone); one on its default branch goes.
    for (const r of this.records.values()) {
      if (r.git || !r.remote || !safeRef(r.branch)) continue;
      for (const repo of seenRepos.values()) {
        if (!repo.remote || hashId(`${repo.key}\n${r.branch}`) !== r.id) continue;
        if (isDefaultBranch(repo, r.branch)) this.records.delete(r.id);
        else {
          r.git = repo;
          r.rawBranch = r.branch;
          r.remote = repo.remote;
        }
        break;
      }
    }

    // 3. Terminals, a few per refresh: never read first, then the longest unread.
    const candidates = [];
    for (const [id, p] of present) {
      for (const a of p.agents) {
        const t = this.terminals.get(a.address);
        const changed = !t || t.seq !== a.seq || a.status === "working";
        if (!t || t.card !== cardKey(this.records.get(id))) candidates.push({ id, a, due: -Infinity });
        else if (changed && now - t.readAt >= this.limits.rereadMs) candidates.push({ id, a, due: t.readAt });
      }
    }
    candidates.sort((x, y) => x.due - y.due || (x.a.address < y.a.address ? -1 : 1));
    for (const { id, a } of candidates) {
      if (used.hc >= budget.hc) break;
      used.hc++;
      const r = this.records.get(id);
      const key = cardKey(r);
      const before = this.terminals.get(a.address);
      const wasThisCard = !!before && before.card === key;
      this.terminals.set(a.address, { readAt: now, seq: a.seq, card: key }); // a new card (branch switch) reads at once
      const text = await this.#readTerminal(a.address, call);
      if (text == null || !this.records.has(id)) continue;
      const found = scanText(text, this.findTickets, {
        maxChars: this.limits.textChars,
        ticketHosts: this.ticketHosts,
        branch: r.isDefault ? null : r.rawBranch,
        remote: r.remote,
        knownPrefixes: r.branchKeys.map((k) => k.slice(0, k.lastIndexOf("-"))),
      });
      const shown = signature(r);
      this.#takePrs(r, a.address, prsForRepo(found.prs, r.remote), found, wasThisCard);
      for (const [k, u] of Object.entries(found.ticketUrls)) r.ticketUrls[k] = u;
      r.tickets = mergeTickets(r.branchKeys, found.tickets, r.tickets, this.limits.maxTickets);
      r.ticketUrls = Object.fromEntries(Object.entries(r.ticketUrls).filter(([k]) => r.tickets.includes(k)));
      if (signature(r) !== shown) r.updatedAt = now;
    }
    // Forget terminals that are gone.
    const live = new Set(agents.map((a) => a && a.address));
    for (const addr of this.terminals.keys()) if (!live.has(addr)) this.terminals.delete(addr);

    // 4. Merged, for a few cards per refresh (those with agents first).
    const due = [...this.records.values()]
          .filter((r) => r.git && !r.isDefault && !r.gone && !this.oldGit.has(r.git.machine ?? "") && now - r.gitCheckedAt >= this.limits.gitCheckMs)
          .sort((x, y) => hasPresent(y) - hasPresent(x) || x.gitCheckedAt - y.gitCheckedAt);
    for (const r of due.slice(0, this.limits.gitChecksPerRefresh)) {
      r.gitCheckedAt = now;
      await this.#checkMerged(r, call, now);
    }

    // 5. Columns, expiry and the cap.
    for (const r of this.records.values()) {
      const column = columnOf(r);
      if (column !== r.column) {
        r.column = column;
        r.updatedAt = now;
      }
      if (column === "completed") r.completedAt ??= now;
      else r.completedAt = null;
      if (!cardAlive(r, now, this.limits) && !hasPresent(r)) this.records.delete(r.id);
    }
    if (this.records.size > this.limits.maxCards) {
      const keep = new Set(orderCards([...this.records.values()]).slice(0, this.limits.maxCards).map((r) => r.id));
      for (const id of this.records.keys()) if (!keep.has(id)) this.records.delete(id);
    }
    for (const [k, v] of this.repos) if (now - v.at > this.limits.repoCacheMs) this.repos.delete(k);
    return { ...used };
  }

  // Which of a terminal's PR links (this repo's) are the card's. On the first
  // read of a terminal for the card, the highest PR number there is remembered:
  // links at or below it are an agent's earlier work and are left out, unless
  // the text ties them to this branch (`tied`: "pull request for <branch>",
  // --head <branch>, what `gh pr create` made while on it). Links above it,
  // seen later, count. What `gh pr create` made on an unknown branch counts if
  // the terminal was last read for this card. Once the branch name has been
  // reused, ties no longer count: only links above the floor.
  #takePrs(r, address, mine, found, wasThisCard) {
    let floor = r.prFloor.get(address);
    if (floor == null) {
      floor = mine.reduce((m, p) => Math.max(m, p.number), 0);
      r.prFloor.set(address, floor);
    }
    const tied = new Set(found.tied);
    if (wasThisCard) for (const u of found.createdUnsure) tied.add(u);
    // A reused branch name (generation > 0): the scrollback's ties may be the
    // old work's, so only links above the floor count.
    const tiesCount = !(r.gen > 0);
    for (const p of mine) if (p.number > floor || (tiesCount && tied.has(p.url))) r.pr = betterPr(r.pr, { url: p.url, number: p.number });
  }

  async #read(path, machine, call) {
    const text = await this.#readOrFail(path, machine, call);
    return text === READ_FAILED ? null : text;
  }

  // The same, telling a file that is absent (null: readTextFile's answer for
  // one) from a read that failed or timed out (READ_FAILED).
  async #readOrFail(path, machine, call) {
    if (call.used.reads >= call.budget.reads) throw OUT_OF_READS;
    call.used.reads++;
    let text;
    try {
      text = await settle(this.deps.readTextFile(path, machine ? { on: machine } : undefined), this.limits.callTimeoutMs, this.wait);
    } catch {
      text = READ_FAILED;
    }
    this.#live(call);
    return typeof text === "string" || text === READ_FAILED ? text : null;
  }

  async #git(args, cwd, machine, call) {
    if (this.oldGit.has(machine ?? "") || call.used.exec >= call.budget.exec) return null;
    call.used.exec++;
    let r;
    try {
      const opts = { cwd, timeout: this.limits.execTimeoutMs };
      if (machine) opts.on = machine;
      r = await settle(this.deps.exec("git", [...GIT_PREFIX, ...args], opts), this.limits.execTimeoutMs + 1000, this.wait);
    } catch {
      r = null;
    }
    this.#live(call);
    if (!r || typeof r.code !== "number") return null;
    if (r.code === 129 && /unknown option/i.test(String(r.stderr ?? ""))) {
      this.oldGit.add(machine ?? ""); // a git without GIT_PREFIX's flags there; never fall back to an unhardened run
      return null;
    }
    return r;
  }

  async #readTerminal(address, call) {
    let r;
    try {
      r = await settle(this.deps.hc(["read", address, "--json", "--lines", String(this.limits.terminalLines)]), this.limits.callTimeoutMs, this.wait);
    } catch {
      r = null;
    }
    this.#live(call);
    if (!r || r.code !== 0 || typeof r.stdout !== "string") return null;
    const out = r.stdout;
    let text = null;
    if (out.length <= STDOUT_MAX && out.trimStart().startsWith("{")) {
      try {
        const j = JSON.parse(out);
        if (j && typeof j.text === "string") text = j.text;
      } catch {
        // not JSON: read it as text
      }
    }
    text ??= out;
    return text.length > this.limits.textChars ? text.slice(text.length - this.limits.textChars) : text;
  }

  // The repo a folder is in: walks up to the folder holding `.git` (a folder,
  // or a file "gitdir: ..." as in worktrees, whose "commondir" names the
  // shared one), then reads the remote from config. Cached, found or not.
  async #repoOf(machine, cwd, now, call) {
    const key = `${machine ?? ""}\0${cwd}`;
    const hit = this.repos.get(key);
    if (hit && now - hit.at <= this.limits.repoCacheMs) return hit.repo;
    let repo = null;
    try {
      repo = await this.#findRepo(machine, cwd, call);
    } catch (e) {
      if (e === ABANDONED) throw e;
      return null; // out of reads: try again next refresh, not cached
    }
    this.repos.set(key, { at: now, repo });
    return repo;
  }

  async #findRepo(machine, cwd, call) {
    if (!isAbsolute(cwd) || cwd.length > 4096) return null;
    let dir = joinPath(cwd);
    for (let depth = 0; dir != null && depth < this.limits.walkDepth; depth++) {
      const dotGit = joinPath(dir, ".git");
      let gitDir = null;
      const head = await this.#read(joinPath(dotGit, "HEAD"), machine, call);
      if (head != null) gitDir = dotGit;
      else {
        const file = await this.#read(dotGit, machine, call);
        const m = file && /^gitdir:\s*(.+?)\s*$/m.exec(file);
        // Only a local folder that looks like a git folder (it has a HEAD).
        if (m && m[1].length < 4096 && !networkPath(m[1]) && !networkPath(joinPath(dir, m[1])) && (await this.#read(joinPath(dir, m[1], "HEAD"), machine, call)) != null) gitDir = joinPath(dir, m[1]);
      }
      if (gitDir) {
        let commonDir = gitDir;
        const common = await this.#read(joinPath(gitDir, "commondir"), machine, call);
        if (common && common.trim() && common.trim().length < 4096) {
          commonDir = joinPath(gitDir, common.trim());
          if (networkPath(common.trim()) || networkPath(commonDir)) return null;
          if ((await this.#read(joinPath(commonDir, "HEAD"), machine, call)) == null) return null;
        }
        const config = await this.#read(joinPath(commonDir, "config"), machine, call);
        // A reftable repo keeps no ref files: a ref missing from them says nothing.
        const refFiles = !/^\s*refstorage\s*=\s*"?reftable"?\s*$/im.test(config ?? "");
        const remote = pickRemote(parseGitConfigRemotes(config));
        const folder = baseName(commonDir) === ".git" ? baseName(parentPath(commonDir) ?? "") : baseName(dir);
        const display = remote ? clean(remote.slug, TEXT_MAX.repo) : clean(folder || baseName(dir), TEXT_MAX.repo);
        const key = remote ? `${remote.host}/${remote.slug.toLowerCase()}` : `local:${machine ?? ""}:${commonDir}`;
        let defaultBranch = null;
        let defaultRef = null;
        if (remote) {
          const sym = await this.#read(joinPath(commonDir, "refs", "remotes", remote.remote, "HEAD"), machine, call);
          const m = sym && /^ref:\s*refs\/remotes\/([^\s]+)\s*$/m.exec(sym);
          if (m && m[1].startsWith(remote.remote + "/") && safeRef(m[1])) {
            defaultRef = `refs/remotes/${m[1]}`;
            defaultBranch = m[1].slice(remote.remote.length + 1);
          }
        }
        return { key, display, remote: remote ? { host: remote.host, slug: remote.slug, name: remote.remote } : null, root: dir, gitDir, commonDir, machine, defaultRef, defaultBranch, refFiles };
      }
      dir = parentPath(dir);
    }
    return null;
  }

  // A ref's commit from git's files: the loose ref, else packed-refs. Sets
  // `packed.unsure` when a miss proves nothing: a read failed, the loose file
  // is there but holds no commit (a symbolic ref), or packed-refs may be cut
  // short (readTextFile's 1 MiB; git ends the file with a newline).
  async #resolveRef(git, ref, call, packed) {
    const loose = await this.#readOrFail(joinPath(git.commonDir, ...ref.split("/")), git.machine, call);
    if (loose === READ_FAILED) packed.unsure = true;
    else if (loose != null) {
      const sha = loose.trim();
      if (isSha(sha)) return sha;
      packed.unsure = true;
    }
    if (!packed.refs) {
      const text = await this.#readOrFail(joinPath(git.commonDir, "packed-refs"), git.machine, call);
      if (text === READ_FAILED || (typeof text === "string" && text && (!text.endsWith("\n") || text.length >= READ_MAX / 2))) packed.badPacked = true;
      packed.refs = parsePackedRefs(text === READ_FAILED ? null : text);
    }
    if (packed.badPacked) packed.unsure = true;
    return isSha(packed.refs[ref]) ? packed.refs[ref] : null;
  }

  // A ref's commit from git itself (reftable repos, refs the files lack).
  async #revParse(git, ref, call) {
    const s = await this.#revParseState(git, ref, call);
    return isSha(s) ? s : null;
  }

  // The same, telling "no such ref" (MISSING: exit 1, nothing printed) from
  // a failure or no git runs left (null).
  async #revParseState(git, ref, call) {
    const r = await this.#git(["rev-parse", "--verify", "--quiet", "--end-of-options", `${ref}^{commit}`], git.root, git.machine, call);
    if (!r) return null;
    const out = typeof r.stdout === "string" ? r.stdout.trim() : "";
    if (r.code === 0) return isSha(out) ? out : null;
    return r.code === 1 && !out ? MISSING : null;
  }

  // The default branch's ref and its commit: <remote>/HEAD's file, else the
  // <remote>/main or /master files (loose or packed), and only then git's
  // rev-parse of <remote>/HEAD, /main, /master. Which ref it is (or that there
  // is none) is kept with the repo for `repoCacheMs`.
  async #resolveBase(git, call, packed, now) {
    if (git.base !== undefined && now - git.baseAt <= this.limits.repoCacheMs) {
      if (git.base === null) return null;
      const sha = git.base.viaGit ? await this.#revParse(git, git.base.ref, call) : await this.#resolveRef(git, git.base.ref, call, packed);
      if (sha) return { ref: git.base.ref, sha };
      if (!git.base.viaGit) git.base = undefined; // the file went: look again next time
      return null;
    }
    const remote = git.remote.name;
    const names = [git.defaultRef, `refs/remotes/${remote}/main`, `refs/remotes/${remote}/master`].filter(Boolean);
    for (const ref of names) {
      const sha = await this.#resolveRef(git, ref, call, packed);
      if (sha) {
        git.base = { ref, viaGit: false };
        git.baseAt = now;
        return { ref, sha };
      }
    }
    for (const ref of [git.defaultRef ?? `refs/remotes/${remote}/HEAD`, `refs/remotes/${remote}/main`, `refs/remotes/${remote}/master`]) {
      const sha = await this.#revParse(git, ref, call);
      if (sha) {
        git.base = { ref, viaGit: true };
        git.baseAt = now;
        return { ref, sha };
      }
    }
    if (call.used.exec < call.budget.exec) {
      git.base = null; // none (not just out of git runs): don't ask again for a while
      git.baseAt = now;
    }
    return null;
  }

  // The branch name is reused for new work: the card starts over (no link, no
  // work of its own seen), and its terminals are read again for it.
  #newGeneration(r) {
    r.gen = (r.gen ?? 0) + 1;
    r.pr = null;
    r.prFloor = new Map();
    r.merged = false;
    r.hadOwnCommits = false;
    r.unmergedHead = null;
    r.mergedHead = null;
    r.descent = null;
    r.mergeCheck = null;
    r.seenRemote = false;
    r.gone = false;
    r.goneAt = null;
  }

  async #checkMerged(r, call, now) {
    const git = r.git;
    try {
      if (!git.remote || !safeRef(r.rawBranch)) return;
      const packed = {};
      const branchRef = `refs/heads/${r.rawBranch}`;
      const trackingRef = `refs/remotes/${git.remote.name}/${r.rawBranch}`;
      // The branch's commit: refs/heads/<branch>; its remote-tracking ref is
      // read until it has been seen once (the branch was pushed), and
      // whenever the local one is missing. Files only: no git run.
      const local = await this.#resolveRef(git, branchRef, call, packed);
      const tracking = !local || !r.seenRemote ? await this.#resolveRef(git, trackingRef, call, packed) : null;
      if (tracking) r.seenRemote = true;
      const found = await this.#resolveBase(git, call, packed, now);
      if (!found) return;
      if (found.ref === trackingRef) return; // the default branch itself
      let head = local ?? tracking;
      let gone = false;
      if (!head) {
        if (git.refFiles !== false && git.base && !git.base.viaGit) gone = !packed.unsure; // refs are in files (the default's was), and neither is there (every read answered)
        else {
          // Refs only git can read (reftable): ask it, within the budget.
          const l = await this.#revParseState(git, branchRef, call);
          if (isSha(l)) head = l;
          else if (l === MISSING && !hasPresent(r)) {
            const t = await this.#revParseState(git, trackingRef, call);
            if (isSha(t)) {
              head = t;
              r.seenRemote = true;
            } else if (t === MISSING) gone = true;
          }
        }
      }
      if (gone && !hasPresent(r)) {
        // Gone both here and as the remote's. Seen so on two checks (a minute
        // or more apart), so one failed read is not taken for a deletion.
        if (r.goneAt == null) r.goneAt = now;
        else if (now > r.goneAt) r.gone = true;
        return;
      }
      r.goneAt = null;
      if (!head && hasPresent(r)) {
        // An agent on it, detached: HEAD's commit. (With nobody on it, the
        // worktree's HEAD is another branch's, or another task's.)
        const h = await this.#read(joinPath(git.gitDir, "HEAD"), git.machine, call);
        if (isSha(h && h.trim())) head = h.trim();
      }
      if (!head) return;
      const base = found.sha;
      if (r.mergeCheck && r.mergeCheck.head === head && r.mergeCheck.base === base) return; // nothing moved
      // Merged at one commit, now at another: new work under the same name.
      if (r.mergedHead && head !== r.mergedHead) this.#newGeneration(r);
      let merged;
      if (head === base) merged = false; // nothing of its own yet (or fast-forwarded): not counted
      else {
        const res = await this.#git(["merge-base", "--is-ancestor", head, base], git.root, git.machine, call);
        if (!res || (res.code !== 0 && res.code !== 1)) return; // failed: ask again next time
        merged = res.code === 0;
      }
      if (!merged && head !== base) {
        r.hadOwnCommits = true;
        r.unmergedHead = head;
      }
      if (merged && r.unmergedHead && head !== r.unmergedHead) {
        // Merged: but is it the work seen, carried on? (else the name was reused)
        if (!r.descent || r.descent.from !== r.unmergedHead || r.descent.head !== head) {
          const res = await this.#git(["merge-base", "--is-ancestor", r.unmergedHead, head], git.root, git.machine, call);
          if (!res || (res.code !== 0 && res.code !== 1)) return;
          r.descent = { from: r.unmergedHead, head, ok: res.code === 0 };
        }
        if (!r.descent.ok) {
          this.#newGeneration(r);
          merged = false;
        }
      }
      r.mergeCheck = { head, base };
      r.merged = merged;
      if (merged && r.hadOwnCommits) r.mergedHead = head;
    } catch (e) {
      if (e === ABANDONED) throw e;
      // out of reads or a junk answer: the card keeps what it knew
    }
  }
}

// A card's key for its terminals: its id and generation.
const cardKey = (r) => `${r.id}#${r.gen ?? 0}`;

// A path on another computer (UNC, or the automounter's /net and /Network):
// reading it would open a network connection.
export function networkPath(p) {
  return typeof p !== "string" || p.startsWith("\\\\") || p.startsWith("//") || /^\/(?:net|Network)(?:\/|$)/.test(p);
}

// What a card's activity is judged by (updatedAt): the agents on it now and
// their statuses; remembered agents, and when present ones were last seen
// (every refresh), are left out so they never make a card look active.
function signature(r) {
  return JSON.stringify([r.repo, r.branch, r.project, r.pr && r.pr.url, r.tickets, (r.agents || []).filter((a) => a.present).map((a) => a.address + a.status)]);
}

// What the view gets: copies, every string capped.
function view(r) {
  return {
    id: r.id,
    column: r.column,
    repo: r.repo ?? "",
    branch: r.branch ?? "",
    project: r.project ?? "",
    tickets: [...r.tickets],
    ticketUrls: { ...r.ticketUrls },
    prs: r.pr ? [{ url: r.pr.url, number: r.pr.number }] : [],
    // when a present agent was last seen moves every refresh: left out, so
    // the revision moves only when what is drawn does
    agents: (r.agents || []).map((a) => ({ address: a.address, status: a.status, app: a.app ?? null, present: !!a.present, lastSeenAt: a.present ? null : a.lastSeenAt })),
    updatedAt: r.updatedAt,
    completedAt: r.completedAt,
  };
}

// What is kept in shared state (every mod can read it): no paths, no git
// internals beyond the flags, and of the tickets only those the branch names
// or that came with a ticket link: other keys read from a terminal stay in
// memory, in case one is a secret that happens to look like a key.
function persisted(r, limits = BOARD_LIMITS) {
  const tickets = r.tickets.filter((k) => (r.branchKeys || []).includes(k) || r.ticketUrls[k]);
  return {
    id: r.id,
    column: r.column,
    repo: r.repo,
    host: r.remote ? r.remote.host : null,
    slug: r.remote ? r.remote.slug : null,
    branch: r.branch,
    project: r.project,
    tickets,
    branchKeys: tickets.filter((k) => (r.branchKeys || []).includes(k)),
    ticketUrls: Object.fromEntries(tickets.filter((k) => r.ticketUrls[k]).map((k) => [k, r.ticketUrls[k]])),
    pr: r.pr,
    // who worked on it: address, app, last status and when last seen (whether
    // one is here now is not kept: after a reload every agent is remembered
    // until the first refresh finds it on the branch again)
    agents: (r.agents || []).slice(0, limits.agentsPerCard).map((a) => ({ address: a.address, app: a.app ?? null, status: a.status, lastSeenAt: a.lastSeenAt })),
    merged: r.merged,
    hadOwnCommits: r.hadOwnCommits,
    unmergedHead: r.unmergedHead ?? null,
    mergedHead: r.mergedHead ?? null,
    seenRemote: !!r.seenRemote,
    gone: !!r.gone,
    gen: r.gen ?? 0,
    completedAt: r.completedAt,
    lastSeenAt: r.lastSeenAt,
    updatedAt: r.updatedAt,
  };
}

// Saved agents back, all remembered (not present): only well-formed
// addresses (ADDRESS, no leading dash), once each; an unknown status is
// idle, an app is cleaned text or null, a time not a finite number is the
// card's last-seen time. At most `max`, most recently seen first.
function reviveAgents(list, cardSeenAt, max) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const a of list.slice(0, 4 * max)) {
    if (!a || typeof a !== "object" || typeof a.address !== "string" || !ADDRESS.test(a.address) || a.address.startsWith("-")) continue;
    if (out.some((x) => x.address === a.address)) continue;
    out.push({
      address: a.address,
      app: typeof a.app === "string" && clean(a.app, 32) ? clean(a.app, 32) : null,
      status: STATUSES.has(a.status) ? a.status : "idle",
      // never before 0 nor after the card itself was last seen (a garbage time would sort first or read "1e300d ago")
      lastSeenAt: Number.isFinite(a.lastSeenAt) ? Math.min(Math.max(0, a.lastSeenAt), cardSeenAt) : cardSeenAt,
    });
  }
  return mergeAgents(out, [], 0, max);
}

function revive(raw, ticketHosts = DEFAULT_TICKET_HOSTS, limits = BOARD_LIMITS) {
  if (!raw || typeof raw !== "object" || typeof raw.id !== "string" || !/^card-[0-9a-z]{1,8}$/.test(raw.id)) return null;
  const num = (v) => (Number.isFinite(v) ? v : null);
  const pr = raw.pr && typeof raw.pr.url === "string" ? parsePrUrl(raw.pr.url) : null;
  const tickets = Array.isArray(raw.tickets) ? raw.tickets.filter((t) => typeof t === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(t)).slice(0, BOARD_LIMITS.maxTickets) : [];
  const ticketUrls = {};
  if (raw.ticketUrls && typeof raw.ticketUrls === "object") {
    for (const k of tickets) {
      const t = parseTicketUrl(raw.ticketUrls[k], ticketHosts);
      if (t && t.key === k) ticketUrls[k] = t.url;
    }
  }
  const r = {
    id: raw.id,
    repo: clean(raw.repo, TEXT_MAX.repo),
    remote: typeof raw.host === "string" && typeof raw.slug === "string" ? parseRemote(`https://${raw.host}/${raw.slug}`) : null,
    branch: clean(raw.branch, TEXT_MAX.branch),
    rawBranch: null,
    project: clean(raw.project, TEXT_MAX.project),
    tickets,
    branchKeys: Array.isArray(raw.branchKeys) ? tickets.filter((k) => raw.branchKeys.includes(k)) : [],
    ticketUrls,
    pr: pr ? { url: pr.url, number: pr.number } : null,
    prFloor: new Map(),
    gen: Number.isInteger(raw.gen) && raw.gen >= 0 ? raw.gen : 0,
    merged: raw.merged === true,
    hadOwnCommits: raw.hadOwnCommits === true,
    unmergedHead: isSha(raw.unmergedHead) ? raw.unmergedHead : null,
    mergedHead: isSha(raw.mergedHead) ? raw.mergedHead : null,
    seenRemote: raw.seenRemote === true,
    gone: raw.gone === true,
    goneAt: null,
    isDefault: false,
    completedAt: num(raw.completedAt),
    lastSeenAt: num(raw.lastSeenAt) ?? 0,
    updatedAt: num(raw.updatedAt) ?? 0,
    agents: [],
    git: null,
    gitCheckedAt: -Infinity,
  };
  if (r.remote) r.remote = { host: r.remote.host, slug: r.remote.slug, name: null };
  r.agents = reviveAgents(raw.agents, r.lastSeenAt, limits.agentsPerCard);
  // a pull request only of the card's own repo, as when it was read (prsForRepo):
  // shared state any mod can write must not hand the browser another address
  if (pr && !prsForRepo([pr], r.remote).length) r.pr = null;
  r.column = columnOf(r);
  if (r.column === "completed") r.completedAt ??= r.lastSeenAt;
  return r;
}
