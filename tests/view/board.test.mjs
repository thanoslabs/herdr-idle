// The quest board's cards in the view (main.js board, boardCard, boardChip,
// boardPace, refreshBoard) with board.js gathering them from fake herdr
// functions (mountView's `panes` and `host`: no real hc, git or files): cards
// in each column with their project, repo, branch, tickets, pull requests and
// agents; links that open in the browser (cx.open_url) and nothing else that
// does anything; narrow columns; the refresh's cadence (at once on opening,
// every 30s while open, never while closed, never two at once, a render only
// when the cards changed, a call that never answers wedging nothing); and the
// cards kept with the save.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BOARD_LIMITS, BOARD_REFRESH_OPEN_MS } from "../../mods/idle-rpg/board.js";
import { all, mountView, raid } from "../harness/view.mjs";

const sha = (c) => c.repeat(40);
const MAIN = sha("a");
const inside = (k, b) => k.x >= b.x && k.y >= b.y && k.x + k.w <= b.x + b.w && k.y + k.h <= b.y + b.h;
const later = (v) => new Promise((r) => setImmediate(() => r(v)));

// A fake machine for board.js: git files by path, terminals' text by address,
// and a git that answers `merge-base --is-ancestor` from `ancestors`.
function machine() {
  const m = { files: {}, terminals: {}, ancestors: new Set(), hcHangs: false };
  m.host = {
    hc: (args) => (m.hcHangs ? new Promise(() => {}) : later(m.terminals[args[1]] == null ? { code: 1, stdout: "", stderr: "" } : { code: 0, stdout: JSON.stringify({ text: m.terminals[args[1]] }), stderr: "" })),
    exec: (cmd, args) => {
      const i = args.indexOf("--is-ancestor");
      return later(cmd === "git" && i >= 0 ? { code: m.ancestors.has(`${args[i + 1]}>${args[i + 2]}`) ? 0 : 1, stdout: "", stderr: "" } : { code: 128, stdout: "", stderr: "" });
    },
    readTextFile: (path) => later(m.files[path] ?? null),
  };
  return m;
}
// A repo at `root` with origin on GitHub, on `branch` at `tip`.
function repo(m, root, slug, branch, tip) {
  m.files[`${root}/.git/HEAD`] = `ref: refs/heads/${branch}\n`;
  m.files[`${root}/.git/config`] = `[remote "origin"]\n\turl = git@github.com:${slug}.git\n`;
  m.files[`${root}/.git/refs/remotes/origin/HEAD`] = "ref: refs/remotes/origin/main\n";
  m.files[`${root}/.git/refs/remotes/origin/main`] = `${MAIN}\n`;
  m.files[`${root}/.git/refs/heads/${branch}`] = `${tip}\n`;
}
const created = (branch, slug, n) => `$ gh pr create\nCreating pull request for ${branch} into main in ${slug}\n\nhttps://github.com/${slug}/pull/${n}\n`;

// Three agents on three repos: t1 working on acme/widgets (a ticket link in
// its terminal), t2 resting on acme/gears with a pull request made, t3 on
// acme/bolts, whose branch gets merged; each in its own pane, all in the
// space "Widgets".
function world({ statuses = ["working", "idle", "working"], view = "board", ...more } = {}) {
  const m = machine();
  repo(m, "/w/widgets", "acme/widgets", "feat/PROJ-7-cards", sha("b"));
  repo(m, "/w/gears", "acme/gears", "fix/teeth", sha("c"));
  repo(m, "/w/bolts", "acme/bolts", "feat/OPS-3-nuts", sha("d"));
  m.terminals.t1 = "Looking at https://acme.atlassian.net/browse/PROJ-7 now";
  m.terminals.t2 = created("fix/teeth", "acme/gears", 12);
  m.terminals.t3 = created("feat/OPS-3-nuts", "acme/bolts", 40);
  const { saved, agents } = raid({ classes: ["archer", "wizard", "warrior"], statuses, view, ...more });
  for (const a of agents) a.space_name = "Widgets";
  const panes = [
    { pane: "p-t1", terminal: "t1", cwd: "/w/widgets/src", branch: "feat/PROJ-7-cards" },
    { pane: "p-t2", terminal: "t2", cwd: "/w/gears", branch: "fix/teeth" },
    { pane: "p-t3", terminal: "t3", cwd: "/w/bolts", branch: "feat/OPS-3-nuts" },
  ];
  return { m, saved, agents, panes, spaces: [{ id: "s1", machine: null }] };
}
async function mountWorld(o = {}, view = {}) {
  const w = world(o);
  const h = await mountView({ saved: w.saved, agents: w.agents, panes: w.panes, spaces: w.spaces, host: w.m.host, width: 1280, height: 360, ...view });
  await h.settle();
  return { v: h, m: w.m };
}
// The card in `column` whose text includes `repo`: its id, or undefined.
const cardOf = (v, column, repo) => v.ids(`idle-rpg-board-card-`).find((id) => v.text(id).includes(repo.toUpperCase()) && v.find(`idle-rpg-board-${column}`) && all(v.get(`idle-rpg-board-${column}`), (n) => n.key === id).length);
// Counts the board's refreshes (Board.refresh calls) and when they were asked for.
function countRefreshes(v) {
  const feed = v.view.boardFeed;
  const real = feed.refresh.bind(feed);
  const at = [];
  feed.refresh = (now) => {
    at.push(now);
    return real(now);
  };
  return at;
}

describe("the quest board's cards", () => {
  test("cards in each column, from the agents' panes, terminals and git: project, repo, branch, tickets, pull requests and agents", async () => {
    const { v, m } = await mountWorld();
    const widgets = cardOf(v, "progress", "acme/widgets");
    const gears = cardOf(v, "review", "acme/gears");
    assert.ok(widgets && gears, v.ids("idle-rpg-board-card-").join());
    assert.ok(!v.has("idle-rpg-board-empty"));
    assert.deepEqual(v.text(widgets), ["WIDGETS", "ACME/WIDGETS", "FEAT/PROJ-7-CARDS", "PROJ-7"]);
    assert.deepEqual(v.text(gears), ["WIDGETS", "ACME/GEARS", "FIX/TEETH", "#12"]);
    // the colours: the project gold, the repo white, the branch grey, a pull request green
    assert.deepEqual(v.runs(gears).map((r) => r.colours[0]), ["gold", "white", "grey", "green"]);
    // each agent a small picture of its class (t1 an archer, t2 a wizard), at full brightness
    // whatever its status, which is a pip of its colour in the corner
    assert.ok(v.images(widgets).some((p) => p.includes("classes/archer/")));
    assert.ok(v.images(gears).some((p) => p.includes("classes/wizard/")));
    const id = (card, t) => `idle-rpg-board-agent-${card.slice("idle-rpg-board-card-".length)}-${t}`;
    const pipId = (card, t) => `idle-rpg-board-pip-${card.slice("idle-rpg-board-card-".length)}-${t}`;
    assert.equal(v.get(id(widgets, "t1")).style.opacity, 1);
    assert.equal(v.get(id(gears, "t2")).style.opacity, 1, "t2 is idle, and not dimmed for it");
    const pip = (card, t) => v.get(pipId(card, t)).kids[0].style.bg;
    assert.equal(pip(widgets, "t1"), "#ffd166", "working");
    assert.equal(pip(gears, "t2"), "#9fb4cc", "resting");
    assert.ok(inside(v.box(pipId(gears, "t2")), v.box(id(gears, "t2"))), "the pip inside the picture");
    assert.match(v.get(id(gears, "t2")).tip, /Resting/);
    assert.match(v.get(id(widgets, "t1")).tip, /Working/);
    // t3's branch merged (the person fetched): completed, once git has been asked (at most once a minute)
    m.files["/w/bolts/.git/refs/remotes/origin/main"] = `${sha("e")}\n`;
    m.ancestors.add(`${sha("d")}>${sha("e")}`);
    for (let i = 0; i < 2; i++) {
      v.advance(BOARD_REFRESH_OPEN_MS);
      await v.settle();
    }
    assert.ok(cardOf(v, "completed", "acme/bolts"), "acme/bolts completed");
    assert.deepEqual(v.text(cardOf(v, "completed", "acme/bolts")).slice(1), ["ACME/BOLTS", "FEAT/OPS-3-NUTS", "OPS-3", "#40"]);
  });

  test("a pull request and a linked ticket open in the browser on a click; nothing else on a card does anything", async () => {
    const { v } = await mountWorld();
    const gears = cardOf(v, "review", "acme/gears").slice("idle-rpg-board-card-".length);
    const widgets = cardOf(v, "progress", "acme/widgets").slice("idle-rpg-board-card-".length);
    const saves = v.saves.length;
    v.click(`idle-rpg-board-pr-${gears}-12`);
    assert.deepEqual(v.opened, ["https://github.com/acme/gears/pull/12"]);
    v.click(`idle-rpg-board-ticket-${widgets}-PROJ-7`);
    assert.deepEqual(v.opened.at(-1), "https://acme.atlassian.net/browse/PROJ-7");
    assert.equal(v.get(`idle-rpg-board-pr-${gears}-12`).tip, "https://github.com/acme/gears/pull/12");
    // the card, its agents and its text: no handler, so a press is one on the board (a frame: nobody walks)
    for (const id of [`idle-rpg-board-card-${gears}`, `idle-rpg-board-agent-${gears}-t2`]) {
      assert.deepEqual(Object.keys(v.get(id).handlers), [], id);
      v.click(id);
    }
    assert.equal(v.opened.length, 2);
    assert.equal(v.view.view, "board");
    assert.equal(v.view.walking, false);
    assert.equal(v.saves.length, saves, "nothing saved: the board is read-only");
  });

  test("a ticket with no link is only text", async () => {
    const { v } = await mountWorld();
    const bolts = cardOf(v, "review", "acme/bolts").slice("idle-rpg-board-card-".length);
    const chip = v.get(`idle-rpg-board-ticket-${bolts}-OPS-3`);
    assert.deepEqual(Object.keys(chip.handlers), []);
    v.click(`idle-rpg-board-ticket-${bolts}-OPS-3`);
    assert.deepEqual(v.opened, []);
  });

  test("narrow columns (a 320px scene): every card, picture, line and chip inside its card and well; text cut, never spilling", async () => {
    const { v } = await mountWorld({ statuses: ["working", "working", "working"] });
    // more agents than fit on a narrow card: "+N"
    v.view.cards = v.view.cards.map((c, i) => (i ? c : { ...c, agents: ["t1", "t2", "t3", "t1", "t2"].map((address) => ({ address, status: "working" })), tickets: ["LONGPROJECT-1234567", ...c.tickets] }));
    for (const [w, h] of [
      [320, 230],
      [320, 360],
      [400, 230],
      [640, 230],
    ]) {
      v.resize(w, h);
      for (const col of ["progress", "review", "completed"]) {
        const well = v.box(`idle-rpg-board-${col}`);
        for (const id of v.ids("idle-rpg-board-card-").filter((id) => all(v.get(`idle-rpg-board-${col}`), (n) => n.key === id).length)) {
          const k = v.box(id);
          assert.ok(k.x >= well.x && k.x + k.w <= well.x + well.w, `${id} across its well at ${w}x${h}`);
          for (const p of all(v.get(id), (n) => n.key && n.key !== id)) assert.ok(inside(v.box(p), k), `${p.key} outside ${id} at ${w}x${h}`);
          for (const r of v.runs(id)) assert.ok(inside(v.box(r.el), k), `${r.text} outside ${id} at ${w}x${h}`);
        }
      }
    }
    v.resize(320, 360);
    const first = v.view.cards[0].id;
    assert.ok(v.text(`idle-rpg-board-card-${first}`).some((t) => /^\+\d$/.test(t)), "+N for the agents that do not fit");
    assert.ok(v.text(`idle-rpg-board-card-${first}`).some((t) => t.endsWith("…")), "the long ticket cut");
  });

  test("many cards: each as tall as it needs, none over another, the well's content as tall as them all, scrolling", async () => {
    const { v } = await mountWorld();
    const base = v.view.cards[0];
    v.view.cards = Array.from({ length: 30 }, (_, i) => ({ ...base, id: `card-${i}`, column: "progress", tickets: i % 2 ? ["PROJ-1", "PROJ-2", "PROJ-3", "PROJ-4"] : [] }));
    v.resize(400, 300);
    const well = v.box("idle-rpg-board-progress");
    const boxes = Array.from({ length: 30 }, (_, i) => v.box(`idle-rpg-board-card-card-${i}`));
    assert.notEqual(boxes[0].h, boxes[1].h, "a card with more chips is taller");
    boxes.forEach((k, i) => i && assert.ok(k.y >= boxes[i - 1].y + boxes[i - 1].h, `card ${i} over the one before`));
    assert.ok(boxes.at(-1).y > well.y + well.h, "past the well's bottom");
    assert.ok(v.get("idle-rpg-board-progress").kids[0].style.h >= boxes.at(-1).y + boxes.at(-1).h - well.y);
    assert.equal(v.get("idle-rpg-board-progress").style.overflow_y_scroll, true);
  });
});

describe("the agents who worked on a card", () => {
  const short = (c) => c.slice("idle-rpg-board-card-".length);
  const id = (card, t) => `idle-rpg-board-agent-${short(card)}-${t}`;
  const pipId = (card, t) => `idle-rpg-board-pip-${short(card)}-${t}`;
  const unknownId = (card, t) => `idle-rpg-board-unknown-${short(card)}-${t}`;

  test("an agent that moved to another branch stays on the old card, dimmed, no pip, 'last here' in its tooltip; present on the new one", async () => {
    const { v, m } = await mountWorld();
    const gears = cardOf(v, "review", "acme/gears");
    assert.equal(v.get(id(gears, "t2")).style.opacity, 1);
    // t2 goes to a new branch of acme/widgets (t1's repo) and starts working
    m.files["/w/widgets/.git/refs/heads/feat/other"] = `${sha("f")}\n`;
    v.setAgents(v.world.agents.map((a) => (a.address === "t2" ? { ...a, status: "working", seq: a.seq + 1 } : a)));
    v.world.panes = v.world.panes.map((p) => (p.pane === "p-t2" ? { ...p, cwd: "/w/widgets", branch: "feat/other" } : p));
    v.advance(BOARD_REFRESH_OPEN_MS);
    await v.settle();
    v.advance(3 * 3600_000);
    const name = v.view.cards.find((c) => c.branch === "fix/teeth").agents[0];
    assert.deepEqual([name.address, name.present], ["t2", false]);
    const past = v.get(id(gears, "t2"));
    assert.equal(past.style.opacity, 0.55, "dimmed, still readable");
    assert.ok(!v.has(pipId(gears, "t2")), "no status pip");
    assert.match(past.tip, /: last here 3h ago$/);
    assert.ok(!past.tip.startsWith("t2:"), "its live name, not its address");
    assert.ok(v.images(id(gears, "t2")).some((p) => p.includes("classes/wizard/")), "still its class");
    const other = v.ids("idle-rpg-board-card-").find((c) => v.text(c).includes("FEAT/OTHER"));
    assert.ok(other, "a card for the new branch");
    assert.equal(v.get(id(other, "t2")).style.opacity, 1);
    assert.match(v.get(id(other, "t2")).tip, /: Working$/);
    assert.ok(v.has(pipId(other, "t2")));
  });

  test("present agents drawn first, then remembered ones; one with no class a '?', its address in the tooltip; '+N' counts them all", async () => {
    const { v } = await mountWorld();
    const now = v.now;
    const first = v.view.cards[0];
    v.view.cards = [
      {
        ...first,
        agents: [
          { address: "t1", status: "done", present: true, lastSeenAt: null },
          { address: "t3", status: "working", present: false, lastSeenAt: now - 5 * 60_000 },
          { address: "gone", status: "idle", present: false, lastSeenAt: now - 3 * 86_400_000 },
          { address: "t2", status: "idle", present: false, lastSeenAt: now - 2 * 3600_000 },
        ],
      },
    ];
    v.resize(1280, 360);
    const card = `idle-rpg-board-card-${first.id}`;
    const xs = ["t1", "t3", "gone", "t2"].map((t) => v.box(id(card, t)).x);
    assert.deepEqual([...xs].sort((a, b) => a - b), xs, "in the order given");
    assert.equal(v.get(id(card, "t1")).style.opacity, 1, "done, present: not dimmed");
    assert.equal(v.get(pipId(card, "t1")).kids[0].style.bg, "#6fdc9a");
    assert.match(v.get(id(card, "t3")).tip, /: last here 5m ago$/);
    assert.equal(v.get(id(card, "gone")).tip, "gone: last here 3d ago");
    assert.equal(v.get(id(card, "gone")).style.opacity, 0.55);
    assert.deepEqual(v.text(unknownId(card, "gone")), ["?"]);
    assert.ok(!v.images(id(card, "gone")).some((p) => p.includes("classes/")));
    // narrow: two pictures fit an 80px card, then "+N" for the rest, remembered ones included
    v.resize(320, 360);
    assert.ok(v.text(card).includes("+3"), v.text(card).join());
    assert.ok(v.has(id(card, "t1")) && !v.has(id(card, "t2")));
  });

  test("every id on a card unique, even for addresses ending like a part's name ('x' and 'x-status')", async () => {
    const { v } = await mountWorld();
    const first = v.view.cards[0];
    const agents = ["x", "x-status", "x-unknown", "y-pip"].map((address) => ({ address, status: "working", present: true, lastSeenAt: null }));
    v.view.cards = [{ ...first, agents }];
    v.resize(1280, 360);
    const ids = v.ids("idle-rpg-board-");
    assert.equal(new Set(ids).size, ids.length, ids.join());
  });
});

describe("the board's refresh", () => {
  test("at once when the board opens, every 30s while it shows, never while it does not", async () => {
    const { v } = await mountWorld({ view: "town" });
    const at = countRefreshes(v);
    v.advance(5 * 60_000);
    await v.settle();
    assert.deepEqual(at, [], "never in town");
    assert.deepEqual(v.world.calls, [], "no hc, git or file read while closed");
    assert.ok(!v.pendingTimers().some((t) => t.every === BOARD_REFRESH_OPEN_MS));
    const opened = v.now;
    v.click("idle-rpg-board-chip");
    await v.settle();
    assert.deepEqual(at, [opened], "at once");
    assert.ok(v.ids("idle-rpg-board-card-").length === 3, "the cards drawn as soon as it is done");
    for (let i = 0; i < 3; i++) {
      v.advance(30_000);
      await v.settle(); // (each done before the next is due, as in the app; see "never two at once")
    }
    v.advance(5_000);
    assert.deepEqual(at, [opened, opened + 30_000, opened + 60_000, opened + 90_000]);
    v.click("idle-rpg-board-chip"); // back to town
    const calls = v.world.calls.length;
    v.advance(10 * 60_000);
    await v.settle();
    assert.equal(at.length, 4, "none once closed");
    assert.equal(v.world.calls.length, calls);
    assert.ok(!v.pendingTimers().some((t) => t.every === BOARD_REFRESH_OPEN_MS));
    // opening again: at once again
    v.click("idle-rpg-board-chip");
    await v.settle();
    assert.equal(at.at(-1), v.now);
  });

  test("a reload on the board refreshes at once; the raid's sign button away from it stops it", async () => {
    const { v } = await mountWorld();
    assert.equal(v.ids("idle-rpg-board-card-").length, 3);
    const at = countRefreshes(v);
    v.click("idle-rpg-view-toggle"); // the sign's button: to the other of the town and the raid
    assert.notEqual(v.view.view, "board");
    v.advance(2 * 60_000);
    await v.settle();
    assert.deepEqual(at, []);
  });

  test("never two at once: one still running when the next is due is left to finish", async () => {
    const { v } = await mountWorld();
    const feed = v.view.boardFeed;
    const asked = [];
    let finish;
    feed.refresh = (now) => {
      asked.push(now);
      return new Promise((r) => (finish = r));
    };
    v.advance(30_000);
    await v.settle();
    v.advance(30_000);
    await v.settle();
    v.advance(30_000);
    await v.settle();
    assert.equal(asked.length, 1, "the first is still running");
    finish({});
    await v.settle();
    v.advance(30_000);
    await v.settle();
    assert.equal(asked.length, 2, "the next on the next beat");
  });

  test("renders only when what the cards show changed (board.js's revision)", async () => {
    // everyone resting: nothing changes between refreshes
    const { v, m } = await mountWorld({ statuses: ["idle", "idle", "idle"] });
    const before = v.view.boardFeed.revision;
    for (let i = 0; i < 4; i++) {
      v.advance(30_000);
      const renders = v.renders;
      await v.settle();
      assert.equal(v.renders, renders, `refresh ${i + 1}: no render of its own`);
    }
    assert.equal(v.view.boardFeed.revision, before);
    // t1 makes a pull request: its terminal is read again (it changed), the card moves to review, one render
    m.terminals.t1 += "\n" + created("feat/PROJ-7-cards", "acme/widgets", 77);
    v.setAgents(v.world.agents.map((a) => (a.address === "t1" ? { ...a, seq: a.seq + 100 } : a)));
    v.advance(30_000);
    const renders = v.renders;
    await v.settle();
    assert.equal(v.renders, renders + 1, "one render for the change");
    assert.ok(cardOf(v, "review", "acme/widgets"));
  });

  test("a terminal that never answers wedges nothing: each read times out (cx.timer), the refresh ends, the next comes on time", async () => {
    const { v, m } = await mountWorld({ view: "town" });
    m.hcHangs = true;
    const at = countRefreshes(v);
    v.click("idle-rpg-board-chip");
    await v.settle();
    assert.ok(v.view.boardRun, "running: waiting on hc");
    // each hc read times out after 10s on the view's own timers (Herdr's setTimeout throws)
    for (let i = 0; i < 4; i++) {
      v.advance(BOARD_LIMITS.callTimeoutMs);
      await v.settle();
    }
    assert.equal(v.view.boardRun, null, "the refresh finished");
    assert.equal(v.ids("idle-rpg-board-card-").length, 3, "the cards from git files, with no terminal");
    v.advance(30_000);
    await v.settle();
    assert.equal(at.length >= 2, true, "refreshed again");
    // the view still answers
    v.click("idle-rpg-board-chip");
    assert.equal(v.view.view, "town", "back where it was opened from");
    assert.deepEqual(v.taskErrors, []);
  });

  test("a refresh that never ends at all is let go after board.js's stall time, and the next one starts", async () => {
    const { v } = await mountWorld();
    const asked = [];
    v.view.boardFeed.refresh = (now) => {
      asked.push(now);
      return new Promise(() => {});
    };
    v.advance(30_000);
    await v.settle();
    assert.equal(asked.length, 1);
    v.advance(BOARD_LIMITS.refreshStallMs);
    await v.settle();
    assert.equal(asked.length, 1, "none other before the stall time");
    v.advance(30_000);
    await v.settle();
    assert.equal(asked.length, 2, "let go (Board abandons it), and a new one");
    assert.equal(asked[1] - asked[0], BOARD_LIMITS.refreshStallMs + 30_000);
    assert.equal(v.taskErrors.length, 0);
  });

  test("a refresh that fails says nothing and changes nothing", async () => {
    const { v } = await mountWorld();
    const ids = v.ids("idle-rpg-board-card-");
    v.view.boardFeed.refresh = () => Promise.reject(new Error("boom"));
    v.advance(30_000);
    const renders = v.renders;
    await v.settle();
    assert.equal(v.renders, renders);
    assert.deepEqual(v.ids("idle-rpg-board-card-"), ids);
    assert.equal(v.taskErrors.length, 0);
    assert.equal(v.view.boardRun, null);
  });
});

describe("the board's cards in the save", () => {
  test("saved with everything else (only what the cards show: no paths), and back at once after a reload", async () => {
    const { v } = await mountWorld();
    v.click("idle-rpg-board-chip"); // back to the raid: a switch saves
    const stored = v.stored;
    assert.equal(stored.board.version, 1);
    assert.equal(stored.board.cards.length, 3);
    const text = JSON.stringify(stored.board);
    assert.ok(!text.includes("/w/"), "no paths");
    assert.ok(!text.includes("git@"), "no remote URLs");
    assert.ok(text.includes("acme/gears/pull/12"));
    // a reload with no agents and nothing to read: the cards are there on the board
    const again = await mountView({ saved: stored, agents: [] });
    again.click("idle-rpg-board-chip");
    await again.settle();
    assert.equal(again.ids("idle-rpg-board-card-").length, 3);
    assert.ok(again.text(cardOf(again, "review", "acme/gears")).includes("#12"));
    assert.deepEqual(again.world.calls, [], "nothing to read with no agents");
  });

  test("a save with cards an older copy of the mod or another mod wrote badly: no cards, no throw", async () => {
    for (const board of [null, 7, "x", { version: 2, cards: [] }, { version: 1, cards: [{ id: "../x" }, null, 5] }, { version: 1, cards: "no" }]) {
      const { saved } = raid({ view: "board" });
      const v = await mountView({ saved: { ...saved, board } });
      await v.settle();
      assert.deepEqual(v.ids("idle-rpg-board-card-"), [], JSON.stringify(board));
      assert.ok(v.has("idle-rpg-board-empty"));
    }
  });
});
