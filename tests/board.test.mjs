// board.js: the quest board's cards from agents' sessions and local git, with
// fake herdr functions (no real hc, git, files or clock).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as B from "../mods/idle-rpg/board.js";

const HOUR = 3600_000;
const sha = (c) => c.repeat(40);
const MAIN = sha("a");
const TIP = sha("b");
const GIT = ["--no-lazy-fetch", "--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "core.hooksPath=/dev/null"];

// A fake machine: files by path, terminals by address, a git that answers
// merge-base from a table of ancestry and rev-parse from a table of refs,
// and every call recorded. Answers come after a tick, as the host's do.
function fakeHost({ files = {}, terminals = {}, ancestors = new Set(), revs = {}, agents = [], panes = [], spaces = [] } = {}) {
  const calls = { hc: [], exec: [], reads: [] };
  const later = (v) => new Promise((r) => setImmediate(() => r(v)));
  const host = {
    files,
    terminals,
    ancestors,
    revs,
    agents,
    panes,
    spaces,
    calls,
    deps: {
      agents: () => host.agents,
      panes: () => host.panes,
      spaces: () => host.spaces,
      hc: async (args) => {
        calls.hc.push(args);
        const t = host.terminals[args[1]];
        if (t instanceof Error) throw t;
        if (t == null) return later({ code: 1, stdout: "", stderr: "no such terminal" });
        return later({ code: 0, stdout: JSON.stringify({ complete: false, how: "screen", text: t }), stderr: "" });
      },
      exec: async (cmd, args, opts) => {
        calls.exec.push({ cmd, args, opts });
        if (host.execFails) throw new Error("git not found");
        if (host.oldGit) return later({ code: 129, stdout: "", stderr: "unknown option: --no-lazy-fetch" });
        const i = args.indexOf("--is-ancestor");
        if (cmd === "git" && i >= 0) return later({ code: host.ancestors.has(`${args[i + 1]}>${args[i + 2]}`) ? 0 : 1, stdout: "", stderr: "" });
        if (cmd === "git" && args.includes("rev-parse")) {
          const ref = args[args.length - 1].replace(/\^\{commit\}$/, "");
          return later(host.revs[ref] ? { code: 0, stdout: host.revs[ref] + "\n", stderr: "" } : { code: 1, stdout: "", stderr: "" });
        }
        return later({ code: 128, stdout: "", stderr: "unknown" });
      },
      readTextFile: async (path, opts) => {
        calls.reads.push({ path, on: opts?.on ?? null });
        const v = host.files[path];
        if (v instanceof Error) throw v;
        return later(v ?? null);
      },
    },
  };
  return host;
}

// A repo at `root` on `branch`, with origin and refs.
function repo(files, root, { remote = "git@github.com:acme/widgets.git", branch = "feat/PROJ-7-x", tip = TIP, main = MAIN, packed = false, originHead = true } = {}) {
  files[`${root}/.git/HEAD`] = `ref: refs/heads/${branch}\n`;
  files[`${root}/.git/config`] = `[core]\n\tbare = false\n[remote "origin"]\n\turl = ${remote}\n\tfetch = +refs/heads/*:refs/remotes/origin/*\n`;
  if (originHead) files[`${root}/.git/refs/remotes/origin/HEAD`] = "ref: refs/remotes/origin/main\n";
  if (packed) files[`${root}/.git/packed-refs`] = `# pack-refs with: peeled fully-peeled sorted\n${tip} refs/heads/${branch}\n${main} refs/remotes/origin/main\n^${sha("f")}\n`;
  else {
    files[`${root}/.git/refs/heads/${branch}`] = `${tip}\n`;
    files[`${root}/.git/refs/remotes/origin/main`] = `${main}\n`;
  }
}
const agent = (n, extra = {}) => ({ address: `t${n}`, pane: `p${n}`, space: "s1", space_name: "Widgets", status: "working", seq: n, app: "claude-code", ...extra });
const pane = (n, cwd, branch = "feat/PROJ-7-x") => ({ pane: `p${n}`, terminal: `t${n}`, cwd, branch });
// What `gh pr create` prints: the branch, then the link.
const created = (branch, n, slug = "acme/widgets") => `$ gh pr create\nCreating pull request for ${branch} into main in ${slug}\n\nhttps://github.com/${slug}/pull/${n}\n`;

function board(host, options) {
  return new B.Board(host.deps, options);
}

describe("parsing remotes", () => {
  test("ssh, scp-like, https and GitLab subgroups; .git dropped", () => {
    assert.deepEqual(B.parseRemote("git@github.com:acme/widgets.git"), { host: "github.com", slug: "acme/widgets", owner: "acme", name: "widgets" });
    assert.equal(B.parseRemote("ssh://git@github.com:22/acme/widgets.git").slug, "acme/widgets");
    assert.equal(B.parseRemote("https://github.com/acme/widgets").slug, "acme/widgets");
    assert.equal(B.parseRemote("https://GitLab.Example.com/g/sub/r.git").host, "gitlab.example.com");
    assert.equal(B.parseRemote("https://gitlab.example.com/g/sub/r.git").slug, "g/sub/r");
    assert.equal(B.parseRemote("github-work:acme/widgets.git").host, "github-work"); // an ssh alias
  });
  test("credentials are never kept", () => {
    for (const url of ["https://user:ghp_secret@github.com/acme/widgets.git", "https://ghp_secret@github.com/acme/widgets", "https://u:p@ss@github.com/acme/widgets.git"]) {
      const r = B.parseRemote(url);
      assert.equal(r.slug, "acme/widgets", url);
      assert.ok(!JSON.stringify(r).includes("secret") && !JSON.stringify(r).includes("ss@"), url);
    }
  });
  test("local paths, Windows paths and junk are not remotes", () => {
    for (const url of ["/srv/git/widgets.git", "C:\\repos\\widgets", "file:///srv/widgets.git", "", "https://github.com/", "https://github.com/../x", "https://exa mple.com/a/b", "https://evil.com/a/b c", null, 42]) {
      assert.equal(B.parseRemote(url), null, String(url));
    }
  });
  test("git config: origin first, quoted values, other sections ignored", () => {
    const text = `[core]\n url = nope\n[remote "upstream"]\n\turl = https://github.com/up/widgets.git\n[remote "origin"]\n\turl = "git@github.com:acme/widgets.git"\n`;
    assert.deepEqual(B.parseGitConfigRemotes(text), { upstream: "https://github.com/up/widgets.git", origin: "git@github.com:acme/widgets.git" });
    assert.equal(B.pickRemote(B.parseGitConfigRemotes(text)).slug, "acme/widgets");
    assert.equal(B.pickRemote(B.parseGitConfigRemotes(`[remote "fork"]\nurl = /local/path\n[remote "up"]\nurl = git@h.com:a/b\n`)).remote, "up");
    assert.equal(B.pickRemote({}), null);
  });
  test("packed-refs", () => {
    assert.deepEqual(B.parsePackedRefs(`# header\n${MAIN} refs/remotes/origin/main\n^${TIP}\njunk line\n`), { "refs/remotes/origin/main": MAIN });
  });
  test("safe ref names", () => {
    for (const ok of ["main", "feat/PROJ-1-x", "a/b/c", "v1.2"]) assert.ok(B.safeRef(ok), ok);
    for (const bad of ["", "../x", "a/../b", "-x", "a//b", "/a", "a/", ".hidden", "a.lock", "a b", "a\\b", "x\n", "a:b", "x".repeat(201)]) assert.ok(!B.safeRef(bad), bad);
  });
});

describe("paths", () => {
  test("POSIX and Windows joins, parents and relative gitdirs", () => {
    assert.equal(B.joinPath("/w/repo", ".git", "HEAD"), "/w/repo/.git/HEAD");
    assert.equal(B.joinPath("/w/wt", "../repo/.git/worktrees/wt"), "/w/repo/.git/worktrees/wt");
    assert.equal(B.joinPath("/w/wt", "/abs/.git"), "/abs/.git");
    assert.equal(B.joinPath("C:\\w\\repo", ".git"), "C:\\w\\repo\\.git");
    assert.equal(B.parentPath("C:\\w"), "C:\\");
    assert.equal(B.parentPath("C:\\"), null);
    assert.equal(B.parentPath("/"), null);
    assert.equal(B.baseName("/w/repo/"), "repo");
  });
});

describe("pull requests and tickets in text", () => {
  test("GitHub, GitLab and Bitbucket links, rebuilt without credentials or queries", () => {
    const t = [
      "Created https://x:tok@github.com/acme/widgets/pull/42?w=1#top.",
      "MR: https://gitlab.example.com/g/sub/r/-/merge_requests/7/diffs",
      "https://bitbucket.org/team/repo/pull-requests/3",
      "https://git.corp.com/projects/PRJ/repos/svc/pull-requests/9/overview",
      "not: https://github.com/acme/widgets/pulls https://github.com/acme/widgets/issues/5",
    ].join("\n");
    const { prs } = B.scanText(t);
    assert.deepEqual(prs.map((p) => p.url), [
      "https://github.com/acme/widgets/pull/42",
      "https://gitlab.example.com/g/sub/r/-/merge_requests/7",
      "https://bitbucket.org/team/repo/pull-requests/3",
      "https://git.corp.com/projects/PRJ/repos/svc/pull-requests/9",
    ]);
    assert.equal(prs[0].number, 42);
  });
  test("only this repo's pull requests (host and owner/name, any case)", () => {
    const { prs } = B.scanText("https://github.com/Acme/Widgets/pull/1 https://github.com/other/widgets/pull/2 https://ghe.corp/acme/widgets/pull/3");
    assert.deepEqual(B.prsForRepo(prs, { host: "github.com", slug: "acme/widgets" }).map((p) => p.number), [1]);
    assert.deepEqual(B.prsForRepo(prs, null), []);
  });
  test("ssh aliases and ssh endpoints match their web host", () => {
    const { prs } = B.scanText("https://github.com/acme/widgets/pull/1 https://gitlab.com/acme/widgets/-/merge_requests/2");
    assert.deepEqual(B.prsForRepo(prs, B.parseRemote("github-work:acme/widgets.git")).map((p) => p.number), [1, 2], "an alias: owner/name decides");
    assert.deepEqual(B.prsForRepo(prs, B.parseRemote("ssh://git@ssh.github.com:443/acme/widgets.git")).map((p) => p.number), [1]);
    assert.deepEqual(B.prsForRepo(prs, B.parseRemote("ssh://git@altssh.gitlab.com:443/acme/widgets.git")).map((p) => p.number), [2]);
    assert.deepEqual(B.prsForRepo(prs, B.parseRemote("git@evil.com:acme/widgets.git")), []);
  });
  test("the most recent pull request is the highest number", () => {
    assert.equal(B.betterPr({ url: "u5", number: 5 }, { url: "u3", number: 3 }).number, 5);
    assert.equal(B.betterPr({ url: "u5", number: 5 }, { url: "u8", number: 8 }).number, 8);
    assert.equal(B.betterPr(null, null), null);
  });
  test("ticket keys, most recent mention first; false positives left out", () => {
    const t = "PROJ-1 then UTF-8, SHA-256, ISO-8601, HTTP-2, CVE-2024-1234, MD-5, PR-12, GCC-12.2, ABC-007, src/DEF-3.ts, x-ABC-4, then OPS-22 and PROJ-1 again";
    assert.deepEqual(B.scanText(t).tickets, ["PROJ-1", "OPS-22"]);
  });
  test("secret-shaped strings are not tickets", () => {
    const t = "password HUNTER2-2024 key AKIA1-23456789 AKIA-123 id ABCDEFGHIJK-12 token HUNTER-2024 plain OPS-1";
    assert.deepEqual(B.scanText(t).tickets, ["OPS-1"]);
    // A year-like number counts when the prefix also comes with another number, or the branch names it.
    assert.deepEqual(B.scanText("REL-2024 and REL-7").tickets, ["REL-7", "REL-2024"]);
    assert.deepEqual(B.scanText("REL-2024", undefined, { knownPrefixes: ["REL"] }).tickets, ["REL-2024"]);
  });
  test("ANSI colours are stripped first", () => {
    assert.deepEqual(B.scanText("\x1b[1;31mOPS-9\x1b[0m").tickets, ["OPS-9"]);
  });
  test("Jira and Linear links give a key and a clean link, only on ticket hosts", () => {
    const r = B.scanText("see https://me:pw@acme.atlassian.net/browse/OPS-5?focus=1 and https://linear.app/acme/issue/ENG-12/fix-it and https://acme.atlassian.net/jira/software/projects/OPS/boards/1?selectedIssue=OPS-6 and https://evil.com/browse/BAD-1");
    assert.deepEqual(r.ticketUrls, {
      "OPS-5": "https://acme.atlassian.net/browse/OPS-5",
      "ENG-12": "https://linear.app/acme/issue/ENG-12",
      "OPS-6": "https://acme.atlassian.net/browse/OPS-6",
    });
    assert.ok(r.tickets.includes("OPS-5") && r.tickets.includes("ENG-12"));
    assert.equal(B.parseTicketUrl("https://jira.corp.com/browse/OPS-1"), null);
    assert.equal(B.parseTicketUrl("https://jira.corp.com/browse/OPS-1", ["corp.com"]).url, "https://jira.corp.com/browse/OPS-1");
    assert.equal(B.parseTicketUrl("https://notatlassian.net/browse/OPS-1"), null);
  });
  test("a configurable pattern and deny list; a broken pattern falls back", () => {
    const find = B.ticketMatcher(B.DEFAULT_TICKET_PATTERN, ["OPS"]);
    assert.deepEqual(find("OPS-1 WEB-2").map((x) => x.key), ["WEB-2"]);
    assert.deepEqual(B.ticketMatcher("([", [])("WEB-2").map((x) => x.key), ["WEB-2"]);
    assert.deepEqual(B.ticketMatcher("\\b[A-Z][A-Z0-9]+-\\d+\\b", [])("AB2-5 XY-1").map((x) => x.key), ["AB2-5", "XY-1"], "digits when the person's pattern allows them");
    assert.deepEqual(B.ticketMatcher("\\b[A-Z]+-\\d+\\b", [])("ABCDEFGHIJK-1").map((x) => x.key), [], "prefix at most 10 whatever the pattern");
  });
  test("keys in branch names", () => {
    assert.deepEqual(B.branchTickets("feat/PROJ-123-thing"), ["PROJ-123"]);
    assert.deepEqual(B.branchTickets("PROJ-1/OPS-2_more"), ["PROJ-1", "OPS-2"]);
    assert.deepEqual(B.branchTickets("feat/utf-8-fix"), []);
    assert.deepEqual(B.branchTickets("fix/UTF-8"), []);
    assert.deepEqual(B.branchTickets(null), []);
  });
  test("branch mentions are whole words", () => {
    assert.deepEqual(B.branchMentions("feat2 feat20 xfeat2 (feat2) feat2/", "feat2"), [0, 21]);
  });
  test("huge text: only its end is looked at", () => {
    const text = "OLD-1 " + "x".repeat(500_000) + " NEW-2";
    assert.deepEqual(B.scanText(text).tickets, ["NEW-2"]);
  });
  test("shown text is capped and cleaned", () => {
    assert.equal(B.clean("a\u202eb\x07c"), "abc");
    assert.equal(B.clean("a\u061cb\u2028c\u2029d\u2060e\u2064f\u{E0001}g\u{E007F}h"), "abcdefgh");
    assert.equal(B.clean("x".repeat(200), 10).length, 10);
    assert.equal(B.clean(5), "");
  });
});

describe("columns and order", () => {
  test("no link: progress; a link: review; merged after a commit of its own: completed", () => {
    assert.equal(B.columnOf({ pr: null }), "progress");
    assert.equal(B.columnOf({ pr: { number: 1 } }), "review");
    assert.equal(B.columnOf({ pr: { number: 1 }, merged: true, hadOwnCommits: true }), "completed");
    assert.equal(B.columnOf({ pr: null, merged: true, hadOwnCommits: true }), "completed");
    assert.equal(B.columnOf({ pr: { number: 1 }, merged: true }), "review", "never seen with work of its own");
    assert.equal(B.columnOf({ pr: null, merged: true }), "progress", "a branch just made from main is not done");
    assert.equal(B.columnOf({ pr: { number: 1 }, merged: true, hadOwnCommits: true, isDefault: true }), "review");
  });
  test("most recently active first, ties by id", () => {
    assert.deepEqual(B.orderCards([{ id: "b", updatedAt: 1 }, { id: "a", updatedAt: 1 }, { id: "c", updatedAt: 5 }]).map((c) => c.id), ["c", "a", "b"]);
  });
});

describe("the collector", () => {
  function oneAgent(opts = {}) {
    const files = {};
    repo(files, "/w/widgets", opts);
    return fakeHost({ files, agents: [agent(1)], panes: [pane(1, "/w/widgets/src/deep", opts.branch)], spaces: [{ id: "s1", machine: null }], terminals: { t1: opts.text ?? "working on it" } });
  }
  // Moves origin/main on to a commit that has the branch in it (the person fetched).
  function mergeIt(h, root = "/w/widgets", c = "c") {
    h.files[`${root}/.git/refs/remotes/origin/main`] = sha(c) + "\n";
    h.ancestors.add(`${TIP}>${sha(c)}`);
  }

  test("one card from an agent's pane: repo from the remote, project from its space, tickets from the branch", async () => {
    const h = oneAgent();
    const b = board(h);
    await b.refresh(1000);
    const [c] = b.cards();
    assert.equal(c.repo, "acme/widgets");
    assert.equal(c.branch, "feat/PROJ-7-x");
    assert.equal(c.project, "Widgets");
    assert.deepEqual(c.tickets, ["PROJ-7"]);
    assert.equal(c.column, "progress");
    assert.deepEqual(c.agents, [{ address: "t1", status: "working", app: "claude-code", present: true, lastSeenAt: null }]);
    assert.match(c.id, /^card-[0-9a-z]+$/);
    assert.deepEqual(h.calls.hc, [["read", "t1", "--json", "--lines", "3000"]]);
  });

  test("git runs with exactly the hardened arguments", async () => {
    const h = oneAgent();
    const b = board(h);
    await b.refresh(0);
    assert.deepEqual(B.GIT_PREFIX, GIT);
    assert.deepEqual(h.calls.exec.map((e) => [e.cmd, ...e.args]), [["git", ...GIT, "merge-base", "--is-ancestor", TIP, MAIN]]);
    assert.deepEqual(h.calls.exec[0].opts, { cwd: "/w/widgets", timeout: 5000 });
  });

  test("a git too old for the hardened arguments (exit 129) turns the merged check off, never runs git without them", async () => {
    const h = oneAgent({ text: created("feat/PROJ-7-x", 12) });
    h.oldGit = true;
    const b = board(h);
    await b.refresh(0);
    mergeIt(h);
    for (let t = 1; t < 5; t++) await b.refresh(t * 61_000);
    assert.equal(h.calls.exec.length, 1);
    assert.ok(h.calls.exec.every((e) => e.args.slice(0, GIT.length).join(" ") === GIT.join(" ")));
    assert.equal(b.cards()[0].column, "review");
  });

  test("a pull request link created for the branch moves it to review; merged (per git) to completed", async () => {
    const h = oneAgent({ text: created("feat/PROJ-7-x", 12) + "and https://github.com/acme/other/pull/99" });
    const b = board(h);
    await b.refresh(1000);
    assert.equal(b.cards()[0].column, "review");
    assert.deepEqual(b.cards()[0].prs, [{ url: "https://github.com/acme/widgets/pull/12", number: 12 }]);
    mergeIt(h);
    await b.refresh(1000 + 30_000);
    assert.equal(b.cards()[0].column, "review", "checked at most once a minute");
    await b.refresh(1000 + 61_000);
    assert.equal(b.cards()[0].column, "completed");
    assert.equal(b.cards()[0].completedAt, 62_000);
  });

  test("the reviewer's case: a new branch from main after an earlier PR is in progress, not completed with the old PR", async () => {
    const files = {};
    repo(files, "/r", { remote: "git@github.com:o/r.git", branch: "feat2", tip: MAIN });
    const h = fakeHost({
      files,
      agents: [agent(1)],
      panes: [pane(1, "/r", "feat2")],
      terminals: { t1: "earlier work on feat1: https://github.com/o/r/pull/41 merged.\n$ git checkout main && git pull && git checkout -b feat2\n" },
    });
    h.ancestors.add(`${MAIN}>${MAIN}`);
    const b = board(h);
    await b.refresh(1000);
    assert.deepEqual(b.cards().map((c) => [c.branch, c.column, c.prs]), [["feat2", "progress", []]]);
    // Later reads still leave #41 out; a new PR for feat2 is taken.
    h.terminals.t1 += "...\nhttps://github.com/o/r/pull/41 again\n" + created("feat2", 43, "o/r");
    await b.refresh(62_000);
    assert.deepEqual(b.cards()[0].prs.map((p) => p.number), [43]);
  });

  test("a link that first appears after the card was read is the card's, wherever it is", async () => {
    const h = oneAgent({ text: "old https://github.com/acme/widgets/pull/5" });
    const b = board(h);
    await b.refresh(0);
    assert.deepEqual(b.cards()[0].prs, []);
    h.terminals.t1 += "\nOpened https://github.com/acme/widgets/pull/9";
    await b.refresh(61_000);
    assert.deepEqual(b.cards()[0].prs.map((p) => p.number), [9]);
  });

  test("an agent switching branches is read at once for the new card", async () => {
    const h = oneAgent({ text: "x" });
    h.files["/w/widgets/.git/refs/heads/feat/next"] = TIP;
    const b = board(h);
    await b.refresh(0);
    h.panes = [pane(1, "/w/widgets", "feat/next")];
    await b.refresh(1000);
    assert.equal(h.calls.hc.length, 2);
  });

  test("git is not run again while neither commit moves", async () => {
    const h = oneAgent();
    const b = board(h);
    for (let t = 0; t < 10; t++) await b.refresh(t * 61_000);
    assert.equal(h.calls.exec.length, 1);
  });

  test("refs from packed-refs; no origin/HEAD file: origin/main's file before any git", async () => {
    const h = oneAgent({ packed: true, originHead: false });
    const b = board(h);
    await b.refresh(0);
    assert.deepEqual(h.calls.exec.map((e) => e.args.slice(GIT.length)), [["merge-base", "--is-ancestor", TIP, MAIN]]);
    h.files["/w/widgets/.git/packed-refs"] = h.files["/w/widgets/.git/packed-refs"].replace(MAIN, sha("c"));
    h.ancestors.add(`${TIP}>${sha("c")}`);
    await b.refresh(61_000);
    assert.equal(b.cards()[0].column, "completed");
  });

  test("reftable-style repos: both commits from git rev-parse", async () => {
    const files = { "/w/rt/.git/HEAD": "ref: refs/heads/.invalid\n", "/w/rt/.git/config": '[remote "origin"]\nurl = git@github.com:acme/rt.git\n' };
    const h = fakeHost({ files, agents: [agent(1)], panes: [pane(1, "/w/rt", "feat/x")], terminals: { t1: "" }, revs: { "refs/heads/feat/x": TIP, "refs/remotes/origin/HEAD": MAIN } });
    const b = board(h);
    await b.refresh(0);
    assert.deepEqual(h.calls.exec.map((e) => e.args[GIT.length]), ["rev-parse", "rev-parse", "merge-base"]);
  });

  test("a branch just made from main (same commit, no git run) stays in progress; work then merge completes it", async () => {
    const h = oneAgent({ tip: MAIN });
    const b = board(h);
    await b.refresh(0);
    assert.equal(b.cards()[0].column, "progress");
    assert.equal(h.calls.exec.length, 0, "same commit: no git needed");
    h.files["/w/widgets/.git/refs/heads/feat/PROJ-7-x"] = TIP; // a commit of its own
    await b.refresh(61_000);
    assert.equal(b.cards()[0].column, "progress");
    mergeIt(h, "/w/widgets", "d"); // merged locally, no PR
    await b.refresh(122_000);
    assert.equal(b.cards()[0].column, "completed");
  });

  test("a branch first seen already merged is never completed (no work of its own seen)", async () => {
    const h = oneAgent({ text: created("feat/PROJ-7-x", 3) });
    h.ancestors.add(`${TIP}>${MAIN}`);
    const b = board(h);
    await b.refresh(0);
    assert.equal(b.cards()[0].column, "review");
  });

  test("an agent on the default branch gets no card: no terminal read, no git", async () => {
    const h = oneAgent({ branch: "main" });
    const b = board(h);
    await b.refresh(0);
    h.terminals.t1 = "https://github.com/acme/widgets/pull/3";
    await b.refresh(61_000);
    assert.deepEqual(b.cards(), []);
    assert.equal(h.calls.hc.length, 0);
    assert.equal(h.calls.exec.length, 0);
  });

  test("worktrees: .git is a file naming the git dir, whose commondir is the shared one", async () => {
    const files = {};
    repo(files, "/w/widgets", { branch: "main" });
    files["/w/widgets-wt/.git"] = "gitdir: ../widgets/.git/worktrees/widgets-wt\n";
    files["/w/widgets/.git/worktrees/widgets-wt/HEAD"] = "ref: refs/heads/feat/OPS-3\n";
    files["/w/widgets/.git/worktrees/widgets-wt/commondir"] = "../..\n";
    files["/w/widgets/.git/refs/heads/feat/OPS-3"] = TIP;
    const h = fakeHost({ files, agents: [agent(1)], panes: [pane(1, "/w/widgets-wt", "feat/OPS-3")], spaces: [], terminals: { t1: "" } });
    const b = board(h);
    await b.refresh(0);
    const [c] = b.cards();
    assert.equal(c.repo, "acme/widgets");
    assert.deepEqual(c.tickets, ["OPS-3"]);
    assert.equal(h.calls.exec[0].opts.cwd, "/w/widgets-wt");
    assert.ok(h.calls.reads.some((r) => r.path === "/w/widgets/.git/config"));
  });

  test("a gitdir or commondir that is not a git folder (no HEAD) is not a repo", async () => {
    const files = { "/w/a/.git": "gitdir: /etc\n", "/w/b/.git": "gitdir: /w/real\n", "/w/real/HEAD": "ref: refs/heads/x\n", "/w/real/commondir": "/tmp\n" };
    const h = fakeHost({ files, agents: [agent(1), agent(2)], panes: [pane(1, "/w/a", "x"), pane(2, "/w/b", "x")], terminals: {} });
    const b = board(h);
    await b.refresh(0);
    assert.deepEqual(b.cards(), []);
    assert.ok(!h.calls.reads.some((r) => r.path === "/etc/config" || r.path === "/tmp/config"));
  });

  test("no remote: the folder's name; no pull requests taken", async () => {
    const files = { "/w/notes/.git/HEAD": "ref: refs/heads/feat/x\n", "/w/notes/.git/config": "[core]\n" };
    const h = fakeHost({ files, agents: [agent(1)], panes: [pane(1, "/w/notes", "feat/x")], terminals: { t1: created("feat/x", 1, "acme/notes") } });
    const b = board(h);
    await b.refresh(0);
    assert.equal(b.cards()[0].repo, "notes");
    assert.equal(b.cards()[0].column, "progress");
    assert.equal(h.calls.exec.length, 0);
  });

  test("Windows paths", async () => {
    const files = {};
    files["C:\\w\\widgets\\.git\\HEAD"] = "ref: refs/heads/feat/x\n";
    files["C:\\w\\widgets\\.git\\config"] = '[remote "origin"]\nurl = https://github.com/acme/widgets.git\n';
    const h = fakeHost({ files, agents: [agent(1)], panes: [pane(1, "C:\\w\\widgets\\src", "feat/x")] });
    const b = board(h);
    await b.refresh(0);
    assert.equal(b.cards()[0].repo, "acme/widgets");
  });

  test("agents on one repo and branch share a card; another branch is another card", async () => {
    const files = {};
    repo(files, "/w/widgets");
    files["/w/widgets2/.git/HEAD"] = "x";
    files["/w/widgets2/.git/config"] = '[remote "origin"]\nurl = https://github.com/acme/widgets\n';
    const h = fakeHost({
      files,
      agents: [agent(1), agent(2, { status: "blocked", space_name: "Other" }), agent(3, { status: "idle" })],
      panes: [pane(1, "/w/widgets"), pane(2, "/w/widgets2"), pane(3, "/w/widgets", "feat/y")],
      terminals: { t1: "", t2: "", t3: "" },
    });
    const b = board(h);
    await b.refresh(0);
    const cards = b.cards();
    assert.equal(cards.length, 2);
    const shared = cards.find((c) => c.branch === "feat/PROJ-7-x");
    assert.deepEqual(shared.agents.map((a) => [a.address, a.status]), [["t1", "working"], ["t2", "blocked"]]);
    assert.equal(shared.project, "Other", "the most recently changed agent's space");
  });

  test("agents not in a git repo, without a branch, or with bad addresses make no card", async () => {
    const h = fakeHost({
      agents: [agent(1), agent(2), agent(3, { address: "-rf" }), null, { address: 5 }],
      panes: [pane(1, "/tmp/plain", "x"), pane(2, "/w/r", null), pane(3, "/w/r")],
      terminals: {},
    });
    const b = board(h);
    await b.refresh(0);
    assert.deepEqual(b.cards(), []);
    assert.equal(h.calls.hc.length, 0);
  });

  test("remote machines: files and git are asked of that machine", async () => {
    const h = oneAgent();
    h.spaces = [{ id: "s1", machine: "vps" }];
    const b = board(h);
    await b.refresh(0);
    assert.equal(b.cards().length, 1);
    assert.ok(h.calls.reads.every((r) => r.on === "vps"));
    assert.equal(h.calls.exec[0].opts.on, "vps");
  });

  test("results outlive the scrollback and the session", async () => {
    const h = oneAgent({ text: created("feat/PROJ-7-x", 12) + " OPS-9" });
    const b = board(h);
    await b.refresh(0);
    h.terminals.t1 = "cleared";
    await b.refresh(61_000);
    assert.deepEqual(b.cards()[0].prs.map((p) => p.number), [12]);
    assert.deepEqual(b.cards()[0].tickets, ["PROJ-7", "OPS-9"]);
    h.agents = [];
    await b.refresh(122_000);
    assert.deepEqual(b.cards()[0].agents, [{ address: "t1", status: "working", app: "claude-code", present: false, lastSeenAt: 61_000 }], "remembered, not present");
    assert.equal(b.cards()[0].column, "review");
  });

  test("an older pull request mentioned later does not replace a newer one", async () => {
    const h = oneAgent({ text: created("feat/PROJ-7-x", 12) });
    const b = board(h);
    await b.refresh(0);
    h.terminals.t1 = "like https://github.com/acme/widgets/pull/4";
    await b.refresh(61_000);
    assert.equal(b.cards()[0].prs[0].number, 12);
  });

  test("hc's whole JSON is parsed before its text is cut: keys after escapes are found", async () => {
    const h = oneAgent();
    const text = "x\n".repeat(450_000) + "\x1b[32mOPS-77\x1b[0m\nlast";
    h.deps.hc = async () => ({ code: 0, stdout: JSON.stringify({ complete: true, how: "history", text }), stderr: "" });
    const b = board(h);
    await b.refresh(0);
    assert.deepEqual(b.cards()[0].tickets, ["PROJ-7", "OPS-77"]);
  });

  test("expiry: a finished card a day after first seen completed; one in review a day after its agents left", async () => {
    const h = oneAgent({ text: created("feat/PROJ-7-x", 12) });
    const b = board(h);
    await b.refresh(0);
    mergeIt(h);
    await b.refresh(61_000);
    assert.equal(b.cards()[0].column, "completed");
    await b.refresh(61_000 + 23 * HOUR);
    assert.equal(b.cards().length, 1);
    await b.refresh(61_000 + 24 * HOUR + 1);
    assert.equal(b.cards().length, 0, "hidden though its agent is still there");
    // A card in review whose agent left (in progress: 2 hours, below).
    const h2 = oneAgent({ text: created("feat/PROJ-7-x", 12) });
    const b2 = board(h2);
    await b2.refresh(0);
    h2.agents = [];
    await b2.refresh(HOUR);
    assert.equal(b2.cards().length, 1);
    await b2.refresh(24 * HOUR);
    assert.equal(b2.cards()[0].column, "review");
    await b2.refresh(24 * HOUR + 1);
    assert.equal(b2.cards().length, 0);
    assert.equal(b2.toJSON().cards.length, 0, "and forgotten");
  });

  test("ordering: most recently active first", async () => {
    const files = {};
    repo(files, "/w/a", { remote: "git@github.com:acme/a.git" });
    repo(files, "/w/b", { remote: "git@github.com:acme/b.git" });
    const h = fakeHost({ files, agents: [agent(1), agent(2)], panes: [pane(1, "/w/a"), pane(2, "/w/b")], terminals: { t1: "", t2: "" } });
    const b = board(h);
    await b.refresh(0);
    h.agents = [agent(1, { status: "idle" }), agent(2)];
    await b.refresh(10_000);
    assert.deepEqual(b.cards().map((c) => c.repo), ["acme/b", "acme/a"]);
  });

  test("many agents: hc reads, git runs and file reads are capped per refresh and taken in turn", async () => {
    const files = {};
    const agents = [];
    const panes = [];
    const terminals = {};
    for (let i = 1; i <= 40; i++) {
      repo(files, `/w/r${i}`, { remote: `git@github.com:acme/r${i}.git` });
      agents.push(agent(i));
      panes.push(pane(i, `/w/r${i}`));
      terminals[`t${i}`] = created("feat/PROJ-7-x", i, `acme/r${i}`);
    }
    const h = fakeHost({ files, agents, panes, terminals });
    const b = board(h);
    const used = [await b.refresh(0)];
    // The first refresh spends its file reads finding repos (four each here).
    assert.deepEqual(used[0], { hc: 4, exec: 0, reads: 150 });
    assert.equal(h.calls.hc.length, 4);
    assert.equal(h.calls.reads.length, 150);
    // Over refreshes every repo is found and every terminal read once, oldest first.
    for (let t = 1; t <= 12; t++) used.push(await b.refresh(t * 1000));
    for (const u of used) assert.ok(u.hc <= 4 && u.exec <= 6 && u.reads <= 150, JSON.stringify(u));
    assert.ok(used.some((u) => u.exec === 6));
    assert.equal(b.cards().length, 40);
    assert.equal(new Set(h.calls.hc.map((c) => c[1])).size, 40);
    assert.equal(h.calls.hc.length, 40, "nobody read twice within a minute");
    assert.equal(b.cards().filter((c) => c.column === "review").length, 40);
  });

  test("an idle terminal whose agent has not changed is not read again", async () => {
    const h = oneAgent();
    h.agents = [agent(1, { status: "idle" })];
    const b = board(h);
    await b.refresh(0);
    await b.refresh(5 * 60_000);
    assert.equal(h.calls.hc.length, 1);
    h.agents = [agent(1, { status: "idle", seq: 9 })];
    await b.refresh(6 * 60_000);
    assert.equal(h.calls.hc.length, 2);
  });

  test("a terminal whose read fails is not read again every refresh", async () => {
    const h = oneAgent();
    h.terminals.t1 = new Error("gone");
    const b = board(h);
    for (let t = 0; t < 5; t++) await b.refresh(t * 1000);
    assert.equal(h.calls.hc.length, 1);
  });

  test("failures: rejections, junk answers, git missing; the card keeps what it knew", async () => {
    const h = oneAgent({ text: created("feat/PROJ-7-x", 12) });
    const b = board(h);
    await b.refresh(0);
    h.terminals.t1 = new Error("hc gone");
    h.execFails = true;
    h.files["/w/widgets/.git/refs/heads/feat/PROJ-7-x"] = sha("e");
    h.files["/w/widgets/.git/config"] = new Error("EACCES");
    await b.refresh(61_000);
    assert.equal(b.cards()[0].column, "review");
    assert.equal(b.cards()[0].prs[0].number, 12);
    // Every host function throwing or returning junk.
    const bad = new B.Board({
      agents: () => {
        throw new Error("x");
      },
      panes: () => "junk",
      spaces: () => null,
      hc: async () => null,
      exec: async () => ({}),
      readTextFile: async () => 7,
    });
    assert.deepEqual(await bad.refresh(0), { hc: 0, exec: 0, reads: 0 });
    const junk = oneAgent();
    junk.deps.hc = async () => ({ code: 0, stdout: "{not json OPS-4" });
    junk.deps.exec = async () => ({ code: 2, stdout: "", stderr: "fatal" });
    const j = board(junk);
    await j.refresh(0);
    assert.deepEqual(j.cards()[0].tickets, ["PROJ-7", "OPS-4"], "non-JSON output read as text");
    assert.equal(j.cards()[0].column, "progress");
  });

  test("a host whose setTimeout throws (as Herdr's does) still gets cards: no timer is used unless passed", async () => {
    const real = globalThis.setTimeout;
    globalThis.setTimeout = () => {
      throw new Error("`setTimeout` is not available in the shell: use cx.timer.after");
    };
    try {
      const h = oneAgent({ text: created("feat/PROJ-7-x", 12) });
      const b = board(h);
      await b.refresh(0);
      assert.equal(b.cards()[0].column, "review");
    } finally {
      globalThis.setTimeout = real;
    }
  });

  test("with the host's wait, a call that never answers times out", async () => {
    const h = oneAgent();
    h.deps.hc = () => new Promise(() => {});
    h.deps.wait = () => new Promise((r) => setImmediate(() => setImmediate(r))); // after the fake files answer
    const b = board(h);
    await b.refresh(0);
    assert.equal(b.cards().length, 1);
  });

  test("a wait that throws is no timeout, not a failure", async () => {
    const h = oneAgent({ text: created("feat/PROJ-7-x", 12) });
    h.deps.wait = () => {
      throw new Error("no timers");
    };
    const b = board(h);
    await b.refresh(0);
    assert.equal(b.cards()[0].column, "review");
  });

  test("without wait, a refresh stuck on a call that never answers is abandoned on a later refresh, its late answer ignored", async () => {
    const h = oneAgent();
    let answer;
    h.deps.hc = () => new Promise((r) => (answer = r));
    const b = board(h);
    const stuck = b.refresh(0);
    while (!answer) await new Promise((r) => setImmediate(r));
    assert.equal(b.refresh(60_000), stuck, "still running, not yet stalled");
    h.deps.hc = async () => ({ code: 0, stdout: JSON.stringify({ text: "fresh OPS-2" }) });
    const next = b.refresh(121_000);
    assert.notEqual(next, stuck);
    await next;
    assert.deepEqual(b.cards()[0].tickets, ["PROJ-7", "OPS-2"]);
    answer({ code: 0, stdout: JSON.stringify({ text: "late LATE-9 " + created("feat/PROJ-7-x", 99) }) });
    assert.deepEqual(await stuck, { hc: 0, exec: 0, reads: 0, abandoned: true });
    assert.deepEqual(b.cards()[0].tickets, ["PROJ-7", "OPS-2"]);
    assert.deepEqual(b.cards()[0].prs, []);
    assert.equal(b.running, null);
  });

  test("a refresh asked for while one runs is the same refresh", async () => {
    const h = oneAgent();
    const b = board(h);
    const [x, y] = [b.refresh(0), b.refresh(0)];
    assert.equal(x, y);
    await x;
    assert.equal(h.calls.hc.length, 1);
  });

  test("revision goes up only when what is shown changes", async () => {
    const h = oneAgent();
    h.agents = [agent(1, { status: "idle" })];
    const b = board(h);
    await b.refresh(0);
    assert.equal(b.revision, 1);
    await b.refresh(1000);
    assert.equal(b.revision, 1);
    h.agents = [agent(1, { status: "blocked" })];
    await b.refresh(2000);
    assert.equal(b.revision, 2);
  });

  test("saved and restored: no paths, credentials or terminal-only ticket keys kept; junk dropped, strings capped", async () => {
    const h = oneAgent({ remote: "https://me:ghp_secret@github.com/acme/widgets.git", text: created("feat/PROJ-7-x", 12) + " SECRET-4 https://acme.atlassian.net/browse/OPS-5" });
    const b = board(h);
    await b.refresh(0);
    assert.deepEqual(b.cards()[0].tickets, ["PROJ-7", "OPS-5", "SECRET-4"], "shown while in memory");
    const saved = JSON.parse(JSON.stringify(b.toJSON()));
    const text = JSON.stringify(saved);
    assert.ok(!text.includes("/w/widgets") && !text.includes("secret") && !text.includes("SECRET"), text);
    const again = new B.Board(fakeHost().deps);
    again.restore(saved, 1000);
    assert.deepEqual(again.cards(1000).map((c) => [c.repo, c.column, c.prs[0].number, c.tickets, c.ticketUrls]), [
      ["acme/widgets", "review", 12, ["PROJ-7", "OPS-5"], { "OPS-5": "https://acme.atlassian.net/browse/OPS-5" }],
    ]);
    assert.deepEqual(again.toJSON().cards[0].tickets, ["PROJ-7", "OPS-5"], "a restored branch key stays saveable");
    const junk = new B.Board(fakeHost().deps);
    junk.restore({ version: 1, cards: [null, { id: "../x" }, { id: "card-1", repo: "r".repeat(500), branch: "b\u202e", tickets: ["OK-1", "../x", 5], ticketUrls: { "OK-1": "https://evil.com/browse/OK-1" }, pr: { url: "javascript:alert(1)" }, lastSeenAt: 0 }] }, 0);
    const [c] = junk.cards(0);
    assert.equal(c.repo.length, 120);
    assert.equal(c.branch, "b");
    assert.deepEqual(c.tickets, ["OK-1"]);
    assert.deepEqual(c.ticketUrls, {});
    assert.deepEqual(c.prs, []);
    // a pull request of another host or repo than the card's (shared state any mod can write): dropped
    const other = new B.Board(fakeHost().deps);
    const card = (id, url, host = "github.com") => ({ id, repo: "gears", host, slug: "acme/gears", branch: "b", tickets: [], pr: { url, number: 1 }, lastSeenAt: 0 });
    other.restore({ version: 1, cards: [card("card-2", "https://github.com/acme/gears/pull/1"), card("card-3", "https://evil.example/acme/gears/pull/1"), card("card-4", "https://github.com/other/gears/pull/1"), card("card-5", "https://github.com/acme/gears/pull/1", null)] }, 0);
    assert.deepEqual(Object.fromEntries(other.cards(0).map((k) => [k.id, k.prs.map((p) => p.url)])), { "card-2": ["https://github.com/acme/gears/pull/1"], "card-3": [], "card-4": [], "card-5": [] });
    junk.restore({ version: 2, cards: [] });
    junk.restore(null);
  });

  test("a branch name that is not a safe ref is shown but never put in a path or given to git", async () => {
    const h = oneAgent({ branch: "feat/../../etc" });
    const b = board(h);
    await b.refresh(0);
    assert.equal(b.cards().length, 1);
    assert.ok(!h.calls.reads.some((r) => r.path.includes("etc")));
    assert.equal(h.calls.exec.length, 0);
  });
});

describe("remembered agents: who worked on what", () => {
  // t1 on widgets' feat/PROJ-7-x, whose repo also has feat/next.
  function twoBranches() {
    const files = {};
    repo(files, "/w/widgets");
    files["/w/widgets/.git/refs/heads/feat/next"] = TIP;
    return fakeHost({ files, agents: [agent(1)], panes: [pane(1, "/w/widgets")], spaces: [{ id: "s1", machine: null }], terminals: { t1: "", t2: "" } });
  }
  const on = (b, branch) => b.cards().find((c) => c.branch === branch);
  const who = (c) => c.agents.map((a) => [a.address, a.present, a.status, a.lastSeenAt]);

  test("an agent that moves branch stays on the old card, remembered, and is present on the new one; back again, present again", async () => {
    const h = twoBranches();
    const b = board(h);
    await b.refresh(0);
    h.panes = [pane(1, "/w/widgets", "feat/next")];
    h.agents = [agent(1, { status: "idle" })];
    await b.refresh(HOUR);
    assert.deepEqual(who(on(b, "feat/PROJ-7-x")), [["t1", false, "working", 0]], "its last status, and when it was last here");
    assert.deepEqual(who(on(b, "feat/next")), [["t1", true, "idle", null]]);
    h.panes = [pane(1, "/w/widgets")];
    h.agents = [agent(1)];
    await b.refresh(2 * HOUR);
    assert.deepEqual(who(on(b, "feat/PROJ-7-x")), [["t1", true, "working", null]]);
    assert.deepEqual(who(on(b, "feat/next")), [["t1", false, "idle", HOUR]]);
  });

  test("an agent on two cards: present on the one it is on, remembered on the other; each card's agents ordered", async () => {
    const h = twoBranches();
    h.agents = [agent(1), agent(2, { status: "idle" }), agent(3, { status: "done" })];
    h.panes = [pane(1, "/w/widgets"), pane(2, "/w/widgets"), pane(3, "/w/widgets", "feat/next")];
    h.terminals.t3 = "";
    const b = board(h);
    await b.refresh(0);
    // t2 goes to feat/next at 1h, t1 at 2h; t3 works there
    h.agents = [agent(1), agent(2, { status: "idle" }), agent(3, { status: "working" })];
    h.panes = [pane(1, "/w/widgets"), pane(2, "/w/widgets", "feat/next"), pane(3, "/w/widgets", "feat/next")];
    await b.refresh(HOUR);
    h.panes = [pane(1, "/w/widgets", "feat/next"), pane(2, "/w/widgets", "feat/next"), pane(3, "/w/widgets", "feat/next")];
    h.agents = [agent(1, { status: "done" }), agent(2), agent(3, { status: "blocked" })];
    await b.refresh(2 * HOUR);
    // present: working and blocked first (as given), then resting
    assert.deepEqual(who(on(b, "feat/next")), [["t2", true, "working", null], ["t3", true, "blocked", null], ["t1", true, "done", null]]);
    // nobody here now: most recently here first
    assert.deepEqual(who(on(b, "feat/PROJ-7-x")), [["t1", false, "working", HOUR], ["t2", false, "idle", 0]]);
  });

  test("mergeAgents: present first (busy before resting), then past by most recent; capped, every present agent kept", () => {
    const past = Array.from({ length: 20 }, (_, i) => ({ address: `p${i}`, status: "done", app: null, lastSeenAt: i * 1000, present: false }));
    const here = [{ address: "a", status: "idle" }, { address: "b", status: "working" }, { address: "p3", status: "blocked" }];
    const out = B.mergeAgents(past, here, 50_000, 12);
    assert.equal(out.length, 12);
    assert.deepEqual(out.slice(0, 3).map((a) => [a.address, a.present]), [["b", true], ["p3", true], ["a", true]]);
    assert.deepEqual(out.slice(3).map((a) => a.address), ["p19", "p18", "p17", "p16", "p15", "p14", "p13", "p12", "p11"]);
    assert.ok(!out.slice(3).some((a) => a.address === "p3"), "once each");
    const crowd = Array.from({ length: 15 }, (_, i) => ({ address: `c${i}`, status: "working" }));
    assert.equal(B.mergeAgents(past, crowd, 0, 12).length, 15, "agents on the branch now are never dropped");
    assert.equal(B.BOARD_LIMITS.agentsPerCard, 12);
  });

  test("a card remembers at most agentsPerCard agents, the longest gone dropped first", async () => {
    const h = twoBranches();
    const b = board(h, { limits: { agentsPerCard: 3 } });
    for (let i = 1; i <= 5; i++) {
      h.agents = [agent(i)];
      h.panes = [pane(i, "/w/widgets")];
      h.terminals[`t${i}`] = "";
      await b.refresh(i * HOUR);
    }
    assert.deepEqual(who(b.cards()[0]), [["t5", true, "working", null], ["t4", false, "working", 4 * HOUR], ["t3", false, "working", 3 * HOUR]]);
    assert.equal(b.toJSON().cards[0].agents.length, 3);
  });

  test("the revision does not move every refresh for remembered agents or the present ones' last-seen times", async () => {
    const h = twoBranches();
    h.agents = [agent(1, { status: "idle" })];
    const b = board(h);
    await b.refresh(0);
    h.panes = [pane(1, "/w/widgets", "feat/next")];
    await b.refresh(1000);
    const rev = b.revision;
    const updated = on(b, "feat/PROJ-7-x").updatedAt;
    for (let i = 2; i < 6; i++) await b.refresh(i * 60_000);
    assert.equal(b.revision, rev);
    assert.equal(on(b, "feat/PROJ-7-x").updatedAt, updated, "a card nobody is on does not look active");
  });

  test("saved and restored: only address, app, status and last seen; all remembered until a refresh finds them; junk dropped", async () => {
    const h = twoBranches();
    const b = board(h);
    await b.refresh(0);
    h.panes = [pane(1, "/w/widgets", "feat/next")];
    await b.refresh(HOUR);
    const saved = JSON.parse(JSON.stringify(b.toJSON()));
    for (const c of saved.cards) for (const a of c.agents) assert.deepEqual(Object.keys(a).sort(), ["address", "app", "lastSeenAt", "status"]);
    const again = new B.Board(h.deps);
    again.restore(saved, HOUR + 1);
    assert.deepEqual(who(on(again, "feat/PROJ-7-x")), [["t1", false, "working", 0]]);
    assert.deepEqual(who(on(again, "feat/next")), [["t1", false, "working", HOUR]], "not present until a refresh sees it");
    await again.refresh(HOUR + 2);
    assert.deepEqual(who(on(again, "feat/next")), [["t1", true, "working", null]]);
    assert.deepEqual(who(on(again, "feat/PROJ-7-x")), [["t1", false, "working", 0]]);
    // junk: bad addresses, repeats, unknown statuses, odd apps and times
    const junk = new B.Board(fakeHost().deps);
    const agents = [null, 5, { address: "-rf" }, { address: "a/b/c" }, { address: "a b" }, { address: "t\n1" }, { address: "x".repeat(65) }, { address: "t9", status: "evil", app: 5, lastSeenAt: "x" }, { address: "t9", status: "working" }, { address: "s/t2", status: "done", app: "codex\u202e", lastSeenAt: 7, present: true, secret: "no" }];
    junk.restore({ version: 1, cards: [{ id: "card-1", repo: "r", branch: "b", tickets: [], lastSeenAt: 100, agents }] }, 100);
    assert.deepEqual(junk.cards(100)[0].agents, [
      { address: "t9", status: "idle", app: null, present: false, lastSeenAt: 100 },
      { address: "s/t2", status: "done", app: "codex", present: false, lastSeenAt: 7 },
    ]);
    assert.deepEqual(Object.keys(junk.toJSON().cards[0].agents[1]).sort(), ["address", "app", "lastSeenAt", "status"]);
    const many = new B.Board(fakeHost().deps);
    many.restore({ version: 1, cards: [{ id: "card-2", repo: "r", branch: "b", lastSeenAt: 0, agents: Array.from({ length: 500 }, (_, i) => ({ address: `t${i}`, lastSeenAt: i })) }] }, 0);
    assert.equal(many.cards(0)[0].agents.length, B.BOARD_LIMITS.agentsPerCard);
    for (const notList of [null, "t1", { address: "t1" }]) {
      const n = new B.Board(fakeHost().deps);
      n.restore({ version: 1, cards: [{ id: "card-3", repo: "r", branch: "b", lastSeenAt: 0, agents: notList }] }, 0);
      assert.deepEqual(n.cards(0)[0].agents, []);
    }
  });

  test("expiry: remembered agents keep no card; 2 hours after the last agent on an in-progress card left, it goes", async () => {
    const h = twoBranches();
    const b = board(h);
    await b.refresh(0);
    h.panes = [pane(1, "/w/widgets", "feat/next")];
    await b.refresh(HOUR);
    assert.equal(b.cards().length, 2);
    await b.refresh(2 * HOUR);
    assert.ok(on(b, "feat/PROJ-7-x"), "2 hours after its last agent was seen on it (at 0)");
    await b.refresh(2 * HOUR + 1);
    assert.equal(on(b, "feat/PROJ-7-x"), undefined, "gone though it still remembers t1");
    assert.deepEqual(b.toJSON().cards.map((c) => c.branch), ["feat/next"], "and forgotten");
    assert.deepEqual(who(on(b, "feat/next")), [["t1", true, "working", null]]);
  });
});

describe("the second review's cases", () => {
  const PR = (n, slug = "o/r") => `https://github.com/${slug}/pull/${n}`;
  // One agent on `branch` in /r (git@github.com:o/r.git), its terminal's text from `texts` in turn.
  function scene({ branch = "feat/x", texts = [""], originHead = true, machine = null } = {}) {
    const files = {};
    repo(files, "/r", { remote: "git@github.com:o/r.git", branch, originHead });
    const h = fakeHost({ files, agents: [agent(1)], panes: [pane(1, "/r", branch)], spaces: [{ id: "s1", machine }], terminals: { t1: texts[0] } });
    let i = 0;
    h.next = () => (h.terminals.t1 = texts[Math.min(++i, texts.length - 1)]);
    return h;
  }
  const prsOf = (b) => b.cards()[0].prs.map((p) => p.number);

  test("a long list of old links at first read: none of them count later (no capped set)", async () => {
    const list = Array.from({ length: 80 }, (_, k) => `{"number":${k + 1},"url":"${PR(k + 1)}"}`).join("\n");
    const h = scene({ texts: [list, list + "\nok"] });
    const b = board(h);
    await b.refresh(0);
    h.next();
    await b.refresh(70_000);
    assert.deepEqual(prsOf(b), []);
  });

  test("a later link numbered at or below the first read's highest is left out; above it counts", async () => {
    const h = scene({ texts: [PR(40), PR(40) + " " + PR(12), PR(40) + " " + PR(12) + " " + PR(41)] });
    const b = board(h);
    await b.refresh(0);
    h.next();
    await b.refresh(61_000);
    assert.deepEqual(prsOf(b), []);
    h.next();
    await b.refresh(122_000);
    assert.deepEqual(prsOf(b), [41]);
  });

  test("a short, common branch name ties nothing ('dev' then an old link)", async () => {
    const h = scene({ branch: "dev", texts: ["Starting the dev server...\nSee " + PR(12) + " for the old fix\nCreating pull request for dev into main\n" + PR(13)] });
    const b = board(h);
    await b.refresh(0);
    assert.deepEqual(prsOf(b), []);
  });

  test("stacked pull requests: 'into <branch>' is someone else's, never this branch's", async () => {
    const h = scene({ branch: "feat/base", texts: ["Creating pull request for feat/child into feat/base in o/r\n\n" + PR(30) + "\n$ git checkout feat/base\n"] });
    const b = board(h);
    await b.refresh(0);
    assert.deepEqual(prsOf(b), []);
  });

  test("branch-specific contexts tie a link: 'pull request for', --head, [new branch], /compare/, /tree/", () => {
    const t = (s) => B.branchContexts(s, "feat/x").length;
    assert.equal(t("Creating pull request for feat/x into main"), 1);
    assert.equal(t("gh pr create --head feat/x"), 1);
    assert.equal(t("gh pr create -H 'feat/x'"), 1);
    assert.equal(t(" * [new branch]      feat/x -> feat/x"), 1);
    assert.equal(t("https://github.com/o/r/compare/feat/x?expand=1 https://github.com/o/r/tree/feat/x"), 2);
    assert.equal(t("pull request for feat/x2, into feat/x, /tree/feat/x/sub, feat/x"), 0);
    assert.equal(B.branchContexts("pull request for dev", "dev").length, 0);
  });

  // What Claude Code shows when an agent opens a pull request: gh is not on a
  // terminal, so it prints only the link, after a long heredoc body.
  const claude = (branch, n, { push = branch, head = null } = {}) =>
    `⏺ Bash(git push -u origin ${push})\n  ⎿  branch '${push}' set up to track 'origin/${push}'.\n` +
    `⏺ Bash(gh pr create --title "Fix it"${head ? ` --head ${head}` : ""} --body "$(cat <<'EOF'\n` +
    "## Summary\n" + "- a line of the body\n".repeat(150) + "EOF\n)\")\n  ⎿  " + PR(n) + "\n";

  test("Claude Code's gh pr create, done before the board first read the terminal: its link is the branch's", async () => {
    const h = scene({ texts: ["earlier " + PR(9) + "\n" + claude("feat/x", 41)] });
    const b = board(h);
    await b.refresh(0);
    assert.deepEqual(prsOf(b), [41]);
  });

  test("gh pr create while git last named another branch, or --head another branch: not this card's", async () => {
    for (const text of [claude("feat/x", 41, { push: "feat/other" }), claude("feat/x", 41, { head: "feat/other" })]) {
      const h = scene({ texts: [text] });
      const b = board(h);
      await b.refresh(0);
      assert.deepEqual(prsOf(b), [], text.slice(0, 60));
    }
    assert.deepEqual(B.createdPrs("gh pr create -H feat/a\n" + PR(3), [{ url: PR(3), ats: [22] }]), [{ url: PR(3), branch: "feat/a" }]);
    assert.equal(B.branchBefore("git push origin HEAD:feat/a\nSwitched to branch 'feat/b'\nx", 60), "feat/b");
    assert.equal(B.branchBefore("git push origin +feat/a:feat/a", 40), "feat/a");
  });

  test("gh pr create with no branch said: counts only if the terminal was already read for this card", async () => {
    const make = "gh pr create --fill\n" + PR(41) + "\n";
    const first = scene({ texts: [make] });
    const b1 = board(first);
    await b1.refresh(0);
    assert.deepEqual(prsOf(b1), [], "first read: whose branch was it?");
    const h = scene({ texts: [PR(50), PR(50) + "\n" + make] });
    const b = board(h);
    await b.refresh(0);
    h.next();
    await b.refresh(61_000);
    assert.deepEqual(prsOf(b), [41], "read for this card before: its link, though below 50");
  });

  test("a reused branch name: merged, then made again from main, starts over (no old link, not completed)", async () => {
    const h = scene({ texts: [claude("feat/x", 41)] });
    const b = board(h);
    await b.refresh(0); // TIP not in MAIN: work of its own
    assert.equal(b.cards()[0].column, "review");
    const m1 = sha("c");
    h.files["/r/.git/refs/remotes/origin/main"] = m1; // merged and fetched
    h.ancestors.add(`${TIP}>${m1}`);
    await b.refresh(61_000);
    assert.equal(b.cards()[0].column, "completed");
    // Deleted and made again from the new main (which has the old work in it).
    h.files["/r/.git/refs/heads/feat/x"] = m1;
    h.ancestors.add(`${TIP}>${m1}`);
    await b.refresh(122_000);
    assert.deepEqual(b.cards().map((c) => [c.column, c.prs]), [["progress", []]]);
    // Someone fetches: the new branch is an ancestor of main, but has no work of its own.
    const m2 = sha("d");
    h.files["/r/.git/refs/remotes/origin/main"] = m2;
    h.ancestors.add(`${m1}>${m2}`);
    await b.refresh(183_000);
    assert.deepEqual(b.cards().map((c) => [c.column, c.prs]), [["progress", []]]);
    assert.ok(h.calls.hc.length >= 2, "its terminal read again for the new start");
  });

  test("merged at a head that is not the work seen (the name reused before the board saw the merge): starts over", async () => {
    const h = scene({ texts: [claude("feat/x", 41)] });
    const b = board(h);
    await b.refresh(0);
    const other = sha("e");
    h.files["/r/.git/refs/heads/feat/x"] = other;
    h.files["/r/.git/refs/remotes/origin/main"] = sha("f");
    h.ancestors.add(`${other}>${sha("f")}`); // merged; TIP is not an ancestor of it
    await b.refresh(61_000);
    assert.deepEqual(b.cards().map((c) => [c.column, c.prs]), [["progress", []]]);
    assert.deepEqual(h.calls.exec.at(-1).args.slice(GIT.length), ["merge-base", "--is-ancestor", TIP, other]);
  });

  test("work carried on and merged (a descendant of what was seen) completes", async () => {
    const h = scene({ texts: [claude("feat/x", 41)] });
    const b = board(h);
    await b.refresh(0);
    const more = sha("e");
    h.files["/r/.git/refs/heads/feat/x"] = more;
    h.files["/r/.git/refs/remotes/origin/main"] = sha("f");
    h.ancestors.add(`${more}>${sha("f")}`).add(`${TIP}>${more}`);
    await b.refresh(61_000);
    assert.deepEqual(b.cards().map((c) => [c.column, c.prs.map((p) => p.number)]), [["completed", [41]]]);
    const again = new B.Board(fakeHost().deps);
    again.restore(JSON.parse(JSON.stringify(b.toJSON())), 62_000);
    assert.equal(again.toJSON().cards[0].unmergedHead, TIP, "kept across a restart");
  });

  test("an old git on one machine turns the check off there only, and only on 'unknown option'", async () => {
    const files = {};
    repo(files, "/r", { remote: "git@github.com:o/r.git" });
    repo(files, "/l", { remote: "git@github.com:o/l.git" });
    const h = fakeHost({ files, agents: [agent(1, { space: "remote" }), agent(2, { space: "local" })], panes: [pane(1, "/r"), pane(2, "/l")], spaces: [{ id: "remote", machine: "vps" }, { id: "local", machine: null }], terminals: { t1: "", t2: "" } });
    const exec = h.deps.exec;
    h.deps.exec = async (cmd, args, opts) => (opts.on === "vps" ? (h.calls.exec.push({ cmd, args, opts }), { code: 129, stdout: "", stderr: "error: unknown option `no-lazy-fetch'" }) : exec(cmd, args, opts));
    const b = board(h);
    await b.refresh(0);
    h.files["/r/.git/refs/heads/feat/PROJ-7-x"] = sha("1");
    h.files["/l/.git/refs/heads/feat/PROJ-7-x"] = sha("2");
    await b.refresh(61_000);
    const on = (m) => h.calls.exec.filter((e) => (e.opts.on ?? null) === m).length;
    assert.equal(on("vps"), 1);
    assert.equal(on(null), 2);
    // A 129 for another reason does not turn it off.
    const h2 = scene();
    h2.deps.exec = async (cmd, args) => (h2.calls.exec.push({ cmd, args }), { code: 129, stdout: "", stderr: "usage: git merge-base" });
    const b2 = board(h2);
    await b2.refresh(0);
    h2.files["/r/.git/refs/heads/feat/x"] = sha("3");
    await b2.refresh(61_000);
    assert.equal(h2.calls.exec.length, 2);
  });

  test("no origin/HEAD file: the default ref is found once and kept; git runs stay at 0 while nothing moves", async () => {
    const h = scene({ originHead: false });
    h.agents = [agent(1, { status: "idle" })];
    const b = board(h);
    const used = [];
    for (let k = 0; k < 5; k++) used.push(await b.refresh(k * 61_000));
    assert.deepEqual(used.map((u) => u.exec), [1, 0, 0, 0, 0]);
    // Nothing to find (no remote-tracking refs at all): git asked once, then not for 10 minutes.
    const files = { "/n/.git/HEAD": "ref: refs/heads/feat/x\n", "/n/.git/config": '[remote "origin"]\nurl = git@github.com:o/n.git\n', "/n/.git/refs/heads/feat/x": TIP };
    const h2 = fakeHost({ files, agents: [agent(1, { status: "idle" })], panes: [pane(1, "/n", "feat/x")], terminals: { t1: "" } });
    const b2 = board(h2);
    for (let k = 0; k < 5; k++) await b2.refresh(k * 61_000);
    assert.equal(h2.calls.exec.length, 3, "origin/HEAD, main and master once");
    await b2.refresh(11 * 60_000);
    assert.equal(h2.calls.exec.length, 6, "asked again after 10 minutes");
  });

  test("gitdir and commondir on network paths are never read", async () => {
    for (const target of ["//host/share/.git", "\\\\host\\share\\.git", "/net/host/repo/.git", "/Network/Servers/h/.git"]) {
      const files = { "/w/a/.git": `gitdir: ${target}\n` };
      const h = fakeHost({ files, agents: [agent(1)], panes: [pane(1, "/w/a", "x")], terminals: {} });
      const b = board(h);
      await b.refresh(0);
      assert.deepEqual(h.calls.reads.map((r) => r.path), ["/w/a/.git/HEAD", "/w/a/.git", "/w/.git/HEAD", "/w/.git", "/.git/HEAD", "/.git"], target);
    }
    const files = { "/w/a/.git": "gitdir: /w/g\n", "/w/g/HEAD": "ref: refs/heads/x\n", "/w/g/commondir": "/net/h/common\n" };
    const h = fakeHost({ files, agents: [agent(1)], panes: [pane(1, "/w/a", "x")], terminals: {} });
    await board(h).refresh(0);
    assert.ok(!h.calls.reads.some((r) => r.path.startsWith("/net/")));
    assert.ok(B.networkPath("//x") && B.networkPath("/net") && !B.networkPath("/Volumes/x") && !B.networkPath("/network-tools"));
  });

  test("status words with numbers are not tickets", () => {
    assert.deepEqual(B.scanText("ERR-404 PORT-8080 EXIT-1 OOMKILLED-1 ERROR-2 STATUS-3 SIG-9 OPS-1").tickets, ["OPS-1"]);
  });
});

describe("accurate columns: gone branches, abandoned cards, the default branch", () => {
  const PR = (n) => `https://github.com/o/r/pull/${n}`;
  const BR = "feat/x";
  const LOCAL = `/r/.git/refs/heads/${BR}`;
  const TRACKING = `/r/.git/refs/remotes/origin/${BR}`;
  // t1 on feat/x in /r (o/r), its own commit TIP over origin/main's MAIN;
  // pushed (origin/feat/x's file) unless `pushed` is false.
  function scene({ text = "", pushed = true, packed = false, originHead = true } = {}) {
    const files = {};
    repo(files, "/r", { remote: "git@github.com:o/r.git", branch: BR, packed, originHead });
    if (pushed) files[TRACKING] = TIP + "\n";
    return fakeHost({ files, agents: [agent(1)], panes: [pane(1, "/r", BR)], spaces: [{ id: "s1", machine: null }], terminals: { t1: text } });
  }
  // The agent moves to main (no card there), its branch's refs deleted (as
  // `gh pr merge --delete-branch` then `git fetch --prune` leave them).
  function leaveAndDelete(h, { local = true, tracking = true } = {}) {
    h.panes = [pane(1, "/r", "main")];
    if (local) delete h.files[LOCAL];
    if (tracking) delete h.files[TRACKING];
  }
  const card = (b) => b.cards().find((c) => c.branch === BR);

  test("columnOf and goneFinished: gone with a link, or pushed with work of its own, is completed; else not", () => {
    assert.equal(B.columnOf({ gone: true, pr: { number: 1 } }), "completed");
    assert.equal(B.columnOf({ gone: true, pr: null, hadOwnCommits: true, seenRemote: true }), "completed");
    assert.equal(B.columnOf({ gone: true, pr: null, hadOwnCommits: true, seenRemote: false }), "progress", "never pushed");
    assert.equal(B.columnOf({ gone: true, pr: null, hadOwnCommits: false, seenRemote: true }), "progress", "no work of its own seen");
    assert.equal(B.columnOf({ gone: true, pr: { number: 1 }, isDefault: true }), "review");
    assert.equal(B.columnOf({ gone: false, pr: null, hadOwnCommits: true, seenRemote: true }), "progress");
  });

  test("cardAlive: in progress 2 hours with nobody on it, in review a day, gone and unfinished at once, anything with an agent on it kept", () => {
    const L = B.BOARD_LIMITS;
    assert.equal(L.abandonedKeepMs, 2 * HOUR);
    assert.equal(L.orphanKeepMs, 24 * HOUR);
    assert.equal(L.completedKeepMs, 24 * HOUR);
    const at = (column, extra = {}) => ({ column, lastSeenAt: 0, agents: [], ...extra });
    assert.ok(B.cardAlive(at("progress"), 2 * HOUR));
    assert.ok(!B.cardAlive(at("progress"), 2 * HOUR + 1));
    assert.ok(B.cardAlive(at("review"), 24 * HOUR));
    assert.ok(!B.cardAlive(at("review"), 24 * HOUR + 1));
    assert.ok(!B.cardAlive(at("progress", { gone: true }), 1));
    assert.ok(B.cardAlive(at("progress", { gone: true, agents: [{ address: "t1", present: true }] }), 1));
    assert.ok(B.cardAlive(at("progress", { agents: [{ address: "t1", present: true }] }), 100 * HOUR));
    assert.ok(B.cardAlive(at("completed", { completedAt: 0 }), 24 * HOUR));
    assert.ok(!B.cardAlive(at("completed", { completedAt: 0 }), 24 * HOUR + 1));
  });

  test("the owner's case: squash-merged, the branch deleted and pruned, no link seen: completed after two checks, with no git run", async () => {
    const h = scene();
    const b = board(h);
    await b.refresh(0);
    assert.equal(card(b).column, "progress");
    assert.equal(h.calls.exec.length, 1, "the first merged check");
    leaveAndDelete(h);
    await b.refresh(61_000);
    assert.equal(card(b).column, "progress", "seen gone once: a failed read looks the same");
    await b.refresh(122_000);
    assert.equal(card(b).column, "completed");
    assert.equal(card(b).completedAt, 122_000);
    assert.equal(h.calls.exec.length, 1, "files only: no git run to see it gone");
    assert.ok(!h.calls.exec.some((e) => e.args.includes("fetch") || e.cmd !== "git"));
    const reads = h.calls.reads.length;
    await b.refresh(183_000);
    assert.equal(h.calls.reads.length, reads, "a gone card is not checked again");
    assert.equal(card(b).column, "completed");
    await b.refresh(122_000 + 24 * HOUR + 1);
    assert.equal(card(b), undefined, "a day after, like any completed card");
  });

  test("the same from packed-refs: gone from packed-refs and loose files both", async () => {
    const h = scene({ packed: true, pushed: false });
    h.files["/r/.git/packed-refs"] += `${TIP} refs/remotes/origin/${BR}\n`;
    const b = board(h);
    await b.refresh(0);
    h.panes = [pane(1, "/r", "main")];
    h.files["/r/.git/packed-refs"] = `# pack-refs with: peeled fully-peeled sorted\n${MAIN} refs/remotes/origin/main\n`;
    await b.refresh(61_000);
    await b.refresh(122_000);
    assert.equal(card(b).column, "completed");
  });

  test("a card in review whose branch is gone both places: completed, pushed or not as far as the board saw", async () => {
    const h = scene({ text: created(BR, 12, "o/r"), pushed: false });
    const b = board(h);
    await b.refresh(0);
    assert.equal(card(b).column, "review");
    leaveAndDelete(h);
    await b.refresh(61_000);
    await b.refresh(122_000);
    assert.deepEqual([card(b).column, card(b).prs.map((p) => p.number)], ["completed", [12]]);
  });

  test("deleted here but still on origin: not finished (its head read from origin's ref, no extra git)", async () => {
    const h = scene();
    const b = board(h);
    await b.refresh(0);
    leaveAndDelete(h, { tracking: false });
    for (let k = 1; k <= 3; k++) await b.refresh(k * 61_000);
    assert.equal(card(b).column, "progress");
    assert.equal(h.calls.exec.length, 1, "the same commit as before: nothing moved");
    // merged (a merge commit) and fetched, origin's branch still there: completed as before
    mergeItTo(h, sha("c"));
    await b.refresh(4 * 61_000);
    assert.equal(card(b).column, "completed");
  });
  function mergeItTo(h, c) {
    h.files["/r/.git/refs/remotes/origin/main"] = c + "\n";
    h.ancestors.add(`${TIP}>${c}`);
  }

  test("never pushed, deleted here, no link: abandoned, the card goes (not completed)", async () => {
    const h = scene({ pushed: false });
    const b = board(h);
    await b.refresh(0);
    leaveAndDelete(h);
    await b.refresh(61_000);
    assert.ok(card(b), "seen gone once");
    await b.refresh(122_000);
    assert.equal(card(b), undefined);
    assert.deepEqual(b.toJSON().cards, [], "and forgotten");
  });

  test("a branch first seen already merged, then deleted: no work of its own seen, so it goes, never completed", async () => {
    const h = scene();
    h.ancestors.add(`${TIP}>${MAIN}`);
    const b = board(h);
    await b.refresh(0);
    leaveAndDelete(h);
    await b.refresh(61_000);
    await b.refresh(122_000);
    assert.equal(card(b), undefined);
  });

  test("an agent whose pane still names the branch keeps it from being gone, refs or no refs", async () => {
    const h = scene();
    const b = board(h);
    await b.refresh(0);
    delete h.files[LOCAL];
    delete h.files[TRACKING];
    for (let k = 1; k <= 3; k++) await b.refresh(k * 61_000);
    assert.equal(card(b).column, "progress");
    assert.equal(card(b).agents[0].present, true);
  });

  test("one missed read is not a deletion: gone once, there again, gone once more is still not two in a row", async () => {
    const h = scene();
    const b = board(h);
    await b.refresh(0);
    h.panes = [pane(1, "/r", "main")];
    h.files[LOCAL] = new Error("EIO");
    h.files[TRACKING] = new Error("EIO");
    await b.refresh(61_000);
    h.files[LOCAL] = TIP;
    h.files[TRACKING] = TIP;
    await b.refresh(122_000);
    delete h.files[LOCAL];
    delete h.files[TRACKING];
    await b.refresh(183_000);
    assert.equal(card(b).column, "progress");
    await b.refresh(244_000);
    assert.equal(card(b).column, "completed");
  });

  test("no default ref in the files (only git could say): nothing is taken as gone from missing files", async () => {
    const h = scene({ originHead: false });
    delete h.files["/r/.git/refs/remotes/origin/main"];
    h.revs["refs/remotes/origin/HEAD"] = MAIN;
    h.revs[`refs/heads/${BR}`] = TIP;
    h.revs[`refs/remotes/origin/${BR}`] = TIP;
    const b = board(h);
    await b.refresh(0);
    leaveAndDelete(h);
    for (let k = 1; k <= 3; k++) await b.refresh(k * 61_000);
    assert.equal(card(b).column, "progress", "git still has both refs");
  });

  test("reftable: gone per git rev-parse (no such ref, twice), within the git budget; a failed run is not 'gone'", async () => {
    const files = { "/w/rt/.git/HEAD": "ref: refs/heads/.invalid\n", "/w/rt/.git/config": '[core]\n\trepositoryformatversion = 1\n[extensions]\n\trefStorage = reftable\n[remote "origin"]\nurl = git@github.com:o/rt.git\n' };
    const revs = { [`refs/heads/${BR}`]: TIP, [`refs/remotes/origin/${BR}`]: TIP, "refs/remotes/origin/HEAD": MAIN };
    const h = fakeHost({ files, agents: [agent(1)], panes: [pane(1, "/w/rt", BR)], terminals: { t1: created(BR, 5, "o/rt") }, revs });
    const b = board(h);
    await b.refresh(0);
    assert.equal(card(b).column, "review");
    const steady = h.calls.exec.length;
    await b.refresh(61_000);
    assert.equal(h.calls.exec.length - steady, 2, "steady state as before: the two rev-parses, no merge-base");
    h.panes = [pane(1, "/w/rt", "main")];
    delete h.revs[`refs/heads/${BR}`];
    delete h.revs[`refs/remotes/origin/${BR}`];
    // a git that fails (not "no such ref") says nothing
    const exec = h.deps.exec;
    h.deps.exec = async (cmd, args, opts) => (args.includes(`refs/heads/${BR}^{commit}`) ? (h.calls.exec.push({ cmd, args, opts }), { code: 128, stdout: "", stderr: "fatal" }) : exec(cmd, args, opts));
    for (let k = 2; k <= 4; k++) await b.refresh(k * 61_000);
    assert.equal(card(b).column, "review");
    h.deps.exec = exec;
    const before = h.calls.exec.length;
    const used = await b.refresh(5 * 61_000);
    assert.ok(used.exec <= B.BOARD_LIMITS.execPerRefresh);
    assert.deepEqual(h.calls.exec.slice(before).map((e) => e.args.at(-1)), ["refs/remotes/origin/HEAD^{commit}", `refs/heads/${BR}^{commit}`, `refs/remotes/origin/${BR}^{commit}`]);
    await b.refresh(6 * 61_000);
    assert.equal(card(b).column, "completed");
    // no git runs left: skipped, not gone
    const h2 = fakeHost({ files, agents: [agent(1)], panes: [pane(1, "/w/rt", BR)], terminals: { t1: created(BR, 5, "o/rt") }, revs: { ...revs } });
    const b2 = board(h2, { limits: { execPerRefresh: 2 } });
    await b2.refresh(0);
    h2.panes = [pane(1, "/w/rt", "main")];
    delete h2.revs[`refs/heads/${BR}`];
    delete h2.revs[`refs/remotes/origin/${BR}`];
    for (let k = 1; k <= 3; k++) await b2.refresh(k * 61_000);
    assert.equal(card(b2).column, "review", "origin's ref never asked: out of git runs");
    assert.ok(h2.calls.exec.length <= 2 * 4);
  });

  test("a reftable repo is never judged by missing files, even when the default ref's file is there", async () => {
    const h = scene({ text: created(BR, 5, "o/r") });
    h.files["/r/.git/config"] += "[extensions]\n\trefstorage = reftable\n";
    h.revs[`refs/heads/${BR}`] = TIP;
    const b = board(h);
    await b.refresh(0);
    leaveAndDelete(h);
    for (let k = 1; k <= 3; k++) await b.refresh(k * 61_000);
    assert.equal(card(b).column, "review", "git still has refs/heads/feat/x");
  });

  test("a gone card's branch made again (an agent back on the name): starts over in progress, no old link", async () => {
    const h = scene({ text: created(BR, 12, "o/r") });
    const b = board(h);
    await b.refresh(0);
    leaveAndDelete(h);
    await b.refresh(61_000);
    await b.refresh(122_000);
    assert.equal(card(b).column, "completed");
    h.files[LOCAL] = MAIN + "\n";
    h.panes = [pane(1, "/r", BR)];
    await b.refresh(130_000);
    assert.deepEqual([card(b).column, card(b).prs], ["progress", []]);
  });

  test("an in-progress card nobody is on goes 2 hours after an agent was last on it; one in review stays a day", async () => {
    const files = {};
    repo(files, "/r", { remote: "git@github.com:o/r.git", branch: BR });
    files["/r/.git/refs/heads/feat/y"] = TIP;
    const h = fakeHost({ files, agents: [agent(1), agent(2)], panes: [pane(1, "/r", BR), pane(2, "/r", "feat/y")], terminals: { t1: "", t2: created("feat/y", 7, "o/r") } });
    const b = board(h);
    await b.refresh(0);
    h.agents = [];
    await b.refresh(2 * HOUR);
    assert.deepEqual(b.cards().map((c) => c.column).sort(), ["progress", "review"]);
    await b.refresh(2 * HOUR + 1);
    assert.deepEqual(b.cards().map((c) => c.column), ["review"]);
    await b.refresh(24 * HOUR + 1);
    assert.deepEqual(b.cards(), []);
  });

  test("steady state unchanged: no git runs while nothing moves, and the tracking ref read only until seen", async () => {
    const h = scene();
    h.agents = [agent(1, { status: "idle" })];
    const b = board(h);
    const used = [];
    for (let k = 0; k < 5; k++) used.push(await b.refresh(k * 61_000));
    assert.deepEqual(used.map((u) => u.exec), [1, 0, 0, 0, 0]);
    const trackingReads = h.calls.reads.filter((r) => r.path === TRACKING).length;
    assert.equal(trackingReads, 1, "pushed once seen: not read again while the branch is here");
    assert.ok(used.slice(1).every((u) => u.reads <= 2), JSON.stringify(used));
  });

  test("the default branch: origin/HEAD's when it names one, else main or master; a card for it from before goes", async () => {
    // origin/HEAD names develop: develop gets no card, main is a branch like any other
    const files = {};
    repo(files, "/r", { remote: "git@github.com:o/r.git", branch: "main" });
    files["/r/.git/refs/remotes/origin/HEAD"] = "ref: refs/remotes/origin/develop\n";
    files["/r/.git/refs/remotes/origin/develop"] = MAIN;
    files["/r/.git/refs/heads/develop"] = MAIN;
    const h = fakeHost({ files, agents: [agent(1), agent(2)], panes: [pane(1, "/r", "main"), pane(2, "/r", "develop")], terminals: { t1: "", t2: "" } });
    const b = board(h);
    await b.refresh(0);
    assert.deepEqual(b.cards().map((c) => c.branch), ["main"]);
    assert.ok(!h.calls.hc.some((c) => c[1] === "t2"), "its terminal not read");
    // no origin/HEAD: main and master get no card
    const h2 = fakeHost({ files: (() => { const f = {}; repo(f, "/m", { remote: "git@github.com:o/m.git", branch: "master", originHead: false }); return f; })(), agents: [agent(1)], panes: [pane(1, "/m", "master")], terminals: { t1: "" } });
    const b2 = board(h2);
    await b2.refresh(0);
    assert.deepEqual(b2.cards(), []);
  });

  test("restored: an old save's card for main goes; one for another branch stays; a card of the repo's own default (develop) goes once the repo is seen", async () => {
    const id = (repoKey, branch) => B.hashId(`${repoKey}\n${branch}`);
    const old = (branch, extra = {}) => ({ id: id("github.com/o/r", branch), repo: "o/r", host: "github.com", slug: "o/r", branch, project: "P", tickets: [], pr: null, agents: [{ address: "t1", status: "idle", lastSeenAt: 1000 }], merged: false, hadOwnCommits: false, completedAt: null, lastSeenAt: 1000, updatedAt: 1000, ...extra });
    // as the board saved them before: no `gone` or `seenRemote`
    const saved = { version: 1, cards: [old("main"), old("master", { pr: { url: PR(3), number: 3 } }), old("develop"), old(BR, { hadOwnCommits: true, unmergedHead: TIP })] };
    const files = {};
    repo(files, "/r", { remote: "git@github.com:o/r.git", branch: "feat/other" });
    files["/r/.git/refs/remotes/origin/HEAD"] = "ref: refs/remotes/origin/develop\n";
    files["/r/.git/refs/remotes/origin/develop"] = MAIN;
    const h = fakeHost({ files, agents: [agent(2)], panes: [pane(2, "/r", "feat/other")], terminals: { t2: "" } });
    const b = board(h);
    b.restore(JSON.parse(JSON.stringify(saved)), 2000);
    assert.deepEqual(b.cards(2000).map((c) => c.branch).sort(), ["develop", BR].sort(), "main and master dropped at once");
    await b.refresh(3000);
    assert.deepEqual(b.cards().map((c) => c.branch).sort(), [BR, "feat/other"].sort(), "develop, the repo's default, gone once the repo is seen");
    // A restored card is checked again once its repo is seen: here, gone both places
    // with no link and never seen pushed (the old save cannot say): it goes.
    await b.refresh(64_000);
    await b.refresh(125_000);
    assert.deepEqual(b.cards().map((c) => c.branch), ["feat/other"]);
    // gone and seenRemote round-trip; junk is false
    const r2 = new B.Board(fakeHost().deps);
    r2.restore({ version: 1, cards: [old(BR, { gone: true, seenRemote: true, hadOwnCommits: true }), old("feat/q", { gone: "yes", seenRemote: 1 }), old("feat/z", { gone: true, hadOwnCommits: true })] }, 2000);
    assert.deepEqual(r2.cards(2000).map((c) => [c.branch, c.column]).sort(), [["feat/q", "progress"], [BR, "completed"]], "gone and unfinished (feat/z): not kept");
    assert.deepEqual(r2.toJSON().cards.map((c) => [c.branch, c.gone, c.seenRemote]).sort(), [["feat/q", false, false], [BR, true, true]]);
  });

  test("a restored, pushed card squash-merged while Herdr was closed completes once its repo is seen again", async () => {
    const h = scene();
    const b = board(h);
    await b.refresh(0);
    const saved = JSON.parse(JSON.stringify(b.toJSON()));
    assert.equal(saved.cards[0].seenRemote, true);
    leaveAndDelete(h);
    const again = board(h);
    again.restore(saved, 1000);
    await again.refresh(2000);
    await again.refresh(63_000);
    assert.equal(card(again).column, "completed");
    assert.ok(!h.calls.exec.some((e) => !e.args.slice(0, GIT.length).every((a, i) => a === GIT[i])));
  });

  test("a miss that proves nothing is not gone: packed-refs unreadable or cut short, a symbolic ref, with a link", async () => {
    // the branch's refs only in packed-refs (after `git gc`), the default's loose
    const packedScene = () => {
      const h = scene({ text: created(BR, 12, "o/r"), packed: true, pushed: false });
      h.files["/r/.git/refs/remotes/origin/main"] = MAIN + "\n";
      h.files["/r/.git/packed-refs"] += `${TIP} refs/remotes/origin/${BR}\n`;
      return h;
    };
    const runs = async (h, b) => {
      for (let k = 1; k <= 4; k++) await b.refresh(k * 61_000);
      return card(b).column;
    };
    // packed-refs fails to read on every check (too big, EIO): unknown, not gone
    let h = packedScene();
    let b = board(h);
    await b.refresh(0);
    h.panes = [pane(1, "/r", "main")];
    h.files["/r/.git/packed-refs"] = new Error("EIO");
    assert.equal(await runs(h, b), "review");
    // packed-refs cut short (no final newline): its refs may be past the cut
    h = packedScene();
    b = board(h);
    await b.refresh(0);
    h.panes = [pane(1, "/r", "main")];
    h.files["/r/.git/packed-refs"] = h.files["/r/.git/packed-refs"].split("\n").slice(0, 2).join("\n").slice(0, -3);
    assert.equal(await runs(h, b), "review");
    // the branch's loose file is a symbolic ref: it is there
    h = scene({ text: created(BR, 12, "o/r") });
    b = board(h);
    await b.refresh(0);
    h.panes = [pane(1, "/r", "main")];
    h.files[LOCAL] = "ref: refs/heads/feat/other\n";
    delete h.files[TRACKING];
    assert.equal(await runs(h, b), "review");
  });

  test("a card nobody is on never takes the worktree's HEAD for its head (another task's commit)", async () => {
    const h = scene({ pushed: false });
    h.files["/r/.git/refs/heads/feat/x"] = new Error("EIO");
    const b = board(h);
    await b.refresh(0);
    h.panes = [pane(1, "/r", "main")];
    h.files["/r/.git/HEAD"] = sha("d") + "\n"; // detached at some other commit
    const before = h.calls.exec.length;
    for (let k = 1; k <= 3; k++) await b.refresh(k * 61_000);
    assert.equal(h.calls.exec.length, before, "no merge-base on another commit");
    assert.equal(card(b).column, "progress");
  });
});
