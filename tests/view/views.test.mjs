// The three views of the one game (main.js setView): the town, the raid and
// the board. The fight runs in each exactly as in the raid (the same seed,
// the same kills, gold, experience, stage and party after minutes, switching
// or not); the sign's button goes between the town and the raid, the board
// chip opens the board and goes back; the view is saved (and read from an
// older save's `battle`); the board's placeholder lays out at every size,
// cards and all, under the HUD; the strip keeps its chips at narrow widths;
// and no view renders more often than the raid.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { LABELS, VIEWS } from "../../mods/idle-rpg/rules.js";
import { agent, mountRaid, mountView, raid, savedState } from "../harness/view.mjs";

const THOROUGH = Boolean(process.env.HERDR_TESTS_THOROUGH);
const up = (t) => t.toUpperCase();
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (k, b) => k.x >= b.x && k.y >= b.y && k.x + k.w <= b.x + b.w && k.y + k.h <= b.y + b.h;

// Everything that decides the fight's outcome, and every attacker's rhythm.
function snapshot(x) {
  const round = (n) => Math.round(n * 1e6) / 1e6;
  return {
    stage: x.progress.stage,
    best: x.progress.best,
    farming: x.progress.farming,
    slain: x.progress.slain,
    gold: x.progress.gold,
    kills: { ...x.progress.kills },
    xp: Object.fromEntries(Object.entries(x.progress.xp).map(([k, v]) => [k, round(v)])),
    boss: [x.monster.stage, x.monster.id, round(x.monster.hp)],
    left: x.left,
    clock: x.clock,
    party: Object.entries(x.party.members).map(([k, m]) => [k, round(m.hp), m.down, m.x, m.y, m.ox, m.oy]),
    members: JSON.stringify(x.party.members),
    away: JSON.stringify(x.party.away),
    foe: JSON.stringify(x.party.foe),
    you: JSON.stringify(x.you),
    rhythm: JSON.stringify(x.rhythm),
    statuses: JSON.stringify(x.statuses),
  };
}

describe("the fight runs in every view as in the raid", () => {
  const minutes = THOROUGH ? 20 : 4;
  // a party with a healer standing by, through first clears, knockouts and heals
  const SETUPS = {
    "you a healer (ranged: in the fight from anywhere)": { classes: ["warrior", "archer", "wizard", "healer"], statuses: ["working", "working", "working", "idle"], you: "healer", stage: 9, level: 6 },
    "you a warrior out of reach": { classes: ["warrior", "archer", "healer"], statuses: ["working", "working", "working"], you: "warrior", stage: 6, level: 5 },
    "you a warrior beside the boss": { classes: ["wizard", "archer"], you: "warrior", youAt: { x: 640, y: 120 }, stage: 6, level: 8 },
    // where the town's campfire is: drawn in front of it in town, never moved there
    "you an archer in the campfire's place": { classes: ["warrior", "wizard"], you: "archer", youAt: { x: 640, y: 100 }, stage: 5, level: 6 },
  };
  for (const [name, o] of Object.entries(SETUPS))
    test(`${name}: the same kills, gold, experience, stage and party after ${minutes} minutes, in town, on the board and switching`, async () => {
      for (const seed of THOROUGH ? [1, 7, 42] : [3]) {
        const raidView = await mountRaid({ ...o, view: "raid" }, { seed });
        const town = await mountRaid({ ...o, view: "town" }, { seed });
        const board = await mountRaid({ ...o, view: "board" }, { seed });
        const switching = await mountRaid({ ...o, view: "raid" }, { seed });
        const order = ["idle-rpg-view-toggle", "idle-rpg-board-chip", "idle-rpg-board-chip", "idle-rpg-view-toggle", "idle-rpg-board-chip", "idle-rpg-view-toggle"];
        let kills = 0;
        for (let s = 1; s <= minutes * 60; s++) {
          for (const v of [raidView, town, board, switching]) v.advance(1000);
          if (s % 7 === 0) switching.click(order[(s / 7) % order.length]);
          if (s % 10 === 0) {
            const want = snapshot(raidView.view);
            for (const [label, v] of [["town", town], ["board", board], ["switching", switching]]) assert.deepEqual(snapshot(v.view), want, `${label} parts from the raid at ${s}s (seed ${seed})`);
          }
          kills = raidView.view.progress.slain;
        }
        assert.ok(kills >= 1, `a kill to compare (seed ${seed}): ${kills}`);
        assert.equal(town.view.view, "town");
        assert.equal(board.view.view, "board");
        assert.ok(town.view.progress.gold > 0 && town.view.progress.xp.you > 0, "town earns gold and experience");
      }
    });

  test("you join by your one spot, the same in every view: a warrior in town within reach of the boss's spot fights, out of it not", async () => {
    for (const [youAt, joins] of [[{ x: 640, y: 120 }, true], [{ x: 154, y: 16 }, false]]) {
      const v = await mountRaid({ classes: ["archer"], you: "warrior", youAt, view: "town", stage: 3 });
      v.advance(2000);
      assert.equal("you" in v.view.party.members, joins, JSON.stringify(youAt));
      assert.ok(!v.has("idle-rpg-plate"), "the fight is not drawn in town");
      assert.ok(v.has("idle-rpg-stage"), "but the stage section shows it");
    }
  });

  test("knocked out in town: drawn standing at your spot, your card's Health row counts the rest; you may walk off, your rest waits", async () => {
    const v = await mountRaid({ classes: ["wizard", "archer"], you: "archer", stage: 30, view: "town" });
    v.until((h) => h.view.knocked("you"), 120000);
    assert.ok(v.images("idle-rpg-you").some((p) => p.endsWith("/stand.png")), "standing in town");
    v.click("idle-rpg-you");
    assert.match(v.text("idle-rpg-card-health").join(" "), /Knocked out · \d+s/);
    v.click("idle-rpg-card-x");
    const was = { ...v.view.you };
    v.clickFloor(300, 100);
    assert.notDeepEqual(v.view.you, was, "you walk");
    v.advance(250);
    const rest = v.view.party.away.you?.rest ?? null;
    assert.ok(rest !== null, "out of the fight while walking, the rest kept");
    v.advance(3000); // arrived: back in the fight, still down
    assert.ok(v.view.knocked("you"));
    // in the raid view you lie there and cannot walk
    v.click("idle-rpg-view-toggle");
    const there = { ...v.view.you };
    v.clickFloor(500, 100);
    assert.deepEqual(v.view.you, there);
  });

  test("in the campfire's place: drawn in front of it in town, your spot (and the fight's) unchanged; a walk there likewise", async () => {
    const v = await mountRaid({ classes: ["warrior"], you: "archer", youAt: { x: 640, y: 100 }, view: "town" });
    v.advance(2000);
    assert.deepEqual(v.view.you, { x: 640, y: 100 });
    assert.equal(v.view.party.members.you.y, 100, "your spot in the fight");
    assert.equal(v.box("idle-rpg-you").y, v.size.height - 152 + 112 - 66, "drawn at the stones' front");
    v.clickFloor(200, 40);
    v.advance(3000);
    v.clickFloor(650, 30);
    v.advance(3000);
    assert.deepEqual(v.view.you, { x: 650, y: 30 }, "walked where clicked");
    assert.equal(v.box("idle-rpg-you").y, v.size.height - 152 + 112 - 66);
    assert.deepEqual(v.stored.you, { x: 650, y: 30 });
  });

  test("carrying a healer standing by in town changes nothing in the fight", async () => {
    const o = { classes: ["warrior", "archer", "healer"], statuses: ["working", "working", "idle"], you: "wizard", stage: 9, level: 4 };
    const town = await mountRaid({ ...o, view: "town" });
    const twin = await mountRaid(o);
    town.advance(5000);
    twin.advance(5000);
    town.press("critter-t3");
    town.move({ x: 300, y: 250 });
    assert.equal(town.view.drag?.address, "t3", "carried");
    for (let s = 0; s < 40; s++) {
      town.advance(1000);
      twin.advance(1000);
    }
    assert.ok(Object.keys(twin.view.rhythm).includes("t3"), "it heals");
    assert.deepEqual(snapshot(town.view), snapshot(twin.view));
  });

  test("too narrow for the fight pauses it in every view alike", async () => {
    for (const view of VIEWS) {
      const v = await mountRaid({ view, stage: 2 }, { width: 600 });
      v.advance(10000);
      assert.deepEqual([v.view.clock, Object.keys(v.view.party.members).length, v.has("idle-rpg-stage")], [0, 0, false], view);
    }
  });
});

describe("switching views", () => {
  const label = (v) => v.text("idle-rpg-view-toggle")[0];
  test("the sign's button: To town in the raid, To the raid in town; neither starts nor stops anything", async () => {
    const v = await mountRaid({ stage: 4, gold: 5, slain: 2 });
    assert.equal(label(v), up(LABELS.toTown));
    assert.ok(v.has("idle-rpg-plate") && v.has("idle-rpg-gold"));
    v.advance(3000);
    const before = { clock: v.view.clock, hp: v.view.monster.hp, id: v.view.monster.id, statuses: JSON.stringify(v.view.statuses), ticking: v.view.ticking };
    v.click("idle-rpg-view-toggle");
    assert.deepEqual({ clock: v.view.clock, hp: v.view.monster.hp, id: v.view.monster.id, statuses: JSON.stringify(v.view.statuses), ticking: v.view.ticking }, before, "the switch itself changes nothing in the fight");
    assert.equal(v.view.view, "town");
    assert.equal(label(v), up(LABELS.toRaid));
    assert.equal(v.runs("idle-rpg-view-toggle")[0].colours[0], "white");
    // the town: stations and campfire, no boss, the stage section running on, the kill and gold chips gone to the stations
    for (const id of ["idle-rpg-station-shop", "idle-rpg-fire-glow", "idle-rpg-stage", "idle-rpg-map", "idle-rpg-board-chip"]) assert.ok(v.has(id), id);
    for (const id of ["idle-rpg-plate", "idle-rpg-gold", "idle-rpg-slain", "idle-rpg-board"]) assert.ok(!v.has(id), id);
    const clock = v.view.left;
    v.advance(5000);
    assert.ok(v.view.left < clock, "the attempt's time runs in town");
    assert.notEqual(v.text("idle-rpg-stage-clock")[0], undefined);
    v.click("idle-rpg-view-toggle");
    assert.equal(v.view.view, "raid");
    assert.ok(v.has("idle-rpg-plate"));
  });

  test("the board chip opens the board and goes back to where it came from; the sign's button on the board goes to the other", async () => {
    for (const from of ["raid", "town"]) {
      const v = await mountRaid({ view: from, gold: 5, slain: 2 });
      v.click("idle-rpg-board-chip");
      assert.deepEqual([v.view.view, v.view.back], ["board", from]);
      assert.ok(v.has("idle-rpg-board"));
      assert.equal(v.get("idle-rpg-board-chip").style.bg, "#00000050", "sunk while the board shows");
      assert.equal(v.get("idle-rpg-board-chip").tip, "Back");
      assert.ok(!v.has("idle-rpg-map"), "no map on the board");
      assert.ok(v.has("idle-rpg-gold") && v.has("idle-rpg-slain"), "the kill and gold chips on the board's sign (no stations there)");
      for (const id of ["idle-rpg-plate", "idle-rpg-station-shop", "idle-rpg-fire-glow", "idle-rpg-you"]) assert.ok(!v.has(id), `${id} on the board`);
      assert.equal(label(v), up(from === "raid" ? LABELS.toTown : LABELS.toRaid));
      v.click("idle-rpg-board-chip");
      assert.equal(v.view.view, from, "back where it came from");
      assert.equal(v.get("idle-rpg-board-chip").tip, "Board");
      v.click("idle-rpg-board-chip");
      v.click("idle-rpg-view-toggle");
      assert.equal(v.view.view, from === "raid" ? "town" : "raid", "the sign's button to the other");
    }
  });

  test("a switch closes the panels; the board closes a card; a press on the board walks nobody", async () => {
    const v = await mountRaid({ gold: 50, slain: 2, level: 3, status: "idle" });
    v.click("idle-rpg-gold");
    assert.ok(v.has("idle-rpg-shop"));
    v.click("idle-rpg-view-toggle");
    assert.ok(!v.has("idle-rpg-shop"));
    v.click("critter-t1");
    assert.ok(v.has("idle-rpg-card"));
    v.click("idle-rpg-board-chip");
    assert.ok(!v.has("idle-rpg-card") && v.view.card === null);
    // panels open over the board
    v.click("idle-rpg-gold");
    assert.ok(v.has("idle-rpg-shop"));
    const you = { ...v.view.you };
    v.click("idle-rpg-board");
    assert.ok(!v.has("idle-rpg-shop"), "a press on the board closes a panel, as one on a frame does");
    v.clickFloor(4, 148); // beside the board, at the scene's edge
    v.clickFloor(600, 100);
    assert.deepEqual([v.view.you, v.view.walking], [you, false]);
  });
});

describe("the saved view", () => {
  test("saved on each switch as `view` (no `battle`), and loaded back", async () => {
    const v = await mountRaid({});
    v.click("idle-rpg-board-chip");
    assert.equal(v.stored.view, "board");
    assert.ok(!("battle" in v.stored));
    const back = await mountView({ saved: v.stored, agents: v.world.agents });
    assert.equal(back.view.view, "board");
    assert.ok(back.has("idle-rpg-board"));
    v.click("idle-rpg-board-chip");
    v.click("idle-rpg-view-toggle");
    assert.equal(v.stored.view, "town");
  });

  test("an older save's `battle` becomes the view: true the raid, false the town", async () => {
    for (const [battle, view] of [[true, "raid"], [false, "town"]]) {
      const v = await mountView({ saved: savedState(9, { extra: { battle } }), agents: [agent("t1", "idle")] });
      assert.equal(v.view.view, view);
      v.click("idle-rpg-view-toggle");
      assert.deepEqual([v.stored.view, "battle" in v.stored], [view === "raid" ? "town" : "raid", false]);
    }
  });
});

// Fixture cards for the board's placeholder (main.js boardCard).
function cards(n = { progress: 12, review: 3, completed: 1 }) {
  const out = [];
  for (const [column, count] of Object.entries(n))
    for (let i = 0; i < count; i++)
      out.push({ id: `${column}-${i}`, column, repo: i % 2 ? "herdr-idle" : "a-very-long-repository-name-that-goes-on-and-on-and-on-and-on-and-on", branch: `feat/card-${i}`, project: "Idle", tickets: [], prs: [], agents: i % 3 ? [{ address: "t1", status: "working" }] : [{ address: "nobody", status: "idle" }] });
  out.push({ id: "elsewhere", column: "backlog", repo: "x", branch: "y", project: "", tickets: [], prs: [], agents: [] }); // a column the board has not: not drawn
  return out;
}

describe("the board's placeholder", () => {
  const range = (a, b, step) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, i) => a + i * step);
  const widths = THOROUGH ? [...range(320, 2918, 13), 2918] : [320, 321, 400, 479, 560, 639, 640, 700, 1024, 1280, 1920, 2918];
  const heights = THOROUGH ? range(230, 560, 10) : [230, 296, 360, 560];

  test("with no cards: three titled columns and one line saying there is no work, nothing else", async () => {
    const v = await mountRaid({ view: "board" });
    assert.deepEqual(v.text("idle-rpg-board"), [up(LABELS.inProgress), up(LABELS.inReview), up(LABELS.completed), up(LABELS.noWork)]);
    assert.deepEqual(v.ids("idle-rpg-board-card-"), []);
    assert.deepEqual(v.runs("idle-rpg-board-empty")[0].colours, ["grey"]);
    for (const col of ["progress", "review", "completed"]) assert.equal(v.get(`idle-rpg-board-${col}`).style.overflow_y_scroll, true);
  });

  test(`at every size (${widths.length} widths x ${heights.length} heights), with and without cards: inside the scene, under the HUD, columns apart, cards in their wells`, async () => {
    const problems = [];
    for (const fixture of [[], cards()]) {
      const v = await mountRaid({ view: "board", classes: ["archer", "wizard"], statuses: ["working", "blocked"], gold: 9.9e15, slain: 9.9e15, stage: 999, best: 1000 });
      v.view.cards = fixture;
      for (const h of heights)
        for (const w of widths) {
          v.resize(w, h);
          const tag = `${fixture.length} cards at ${w}x${h}`;
          const b = v.box("idle-rpg-board");
          if (!inside(b, { x: 0, y: 0, w, h })) problems.push(`${tag}: the board ${JSON.stringify(b)} leaves the scene`);
          for (const id of ["idle-rpg-sign", "idle-rpg-hud", "idle-rpg-stage"]) if (v.has(id) && overlap(b, v.box(id))) problems.push(`${tag}: the board meets ${id}`);
          if (b.h < 60) problems.push(`${tag}: only ${b.h}px high`);
          const wells = ["progress", "review", "completed"].map((c) => v.box(`idle-rpg-board-${c}`));
          wells.forEach((k, i) => {
            if (!inside(k, b)) problems.push(`${tag}: well ${i} outside the board`);
            if (i && k.x < wells[i - 1].x + wells[i - 1].w + 8) problems.push(`${tag}: wells ${i - 1} and ${i} closer than 8px`);
          });
          ["progress", "review", "completed"].forEach((c, i) => {
            const t = v.box(`idle-rpg-board-title-${c}`);
            if (t.x < wells[i].x || t.x + t.w > wells[i].x + wells[i].w || t.y < b.y || t.y + t.h > wells[i].y) problems.push(`${tag}: ${c}'s title off its column`);
          });
          if (!fixture.length) {
            const e = v.box("idle-rpg-board-empty");
            if (!inside(e, b)) problems.push(`${tag}: the empty line outside the board`);
            continue;
          }
          if (v.has("idle-rpg-board-empty")) problems.push(`${tag}: the empty line with cards`);
          if (v.has("idle-rpg-board-card-elsewhere")) problems.push(`${tag}: a card of no column drawn`);
          for (const [i, col] of ["progress", "review", "completed"].entries()) {
            const ids = v.ids(`idle-rpg-board-card-${col}-`);
            const want = fixture.filter((c) => c.column === col).map((c) => `idle-rpg-board-card-${c.id}`);
            if (ids.join() !== want.join()) problems.push(`${tag}: ${col} holds ${ids.join()}`);
            const boxes = ids.map((id) => v.box(id));
            boxes.forEach((k, j) => {
              if (k.x < wells[i].x || k.x + k.w > wells[i].x + wells[i].w || k.y < wells[i].y) problems.push(`${tag}: ${ids[j]} off its well`);
              if (j && k.y < boxes[j - 1].y + boxes[j - 1].h) problems.push(`${tag}: ${ids[j]} over the one before`);
              const text = v.runs(ids[j]);
              if (text.length !== 1 || !inside(v.box(text[0].el), k)) problems.push(`${tag}: ${ids[j]}'s line ${JSON.stringify(text.map((r) => r.text))} not inside it`);
            });
            // the cards past the well's bottom are there to scroll to: the content is as tall as they are
            const content = v.get(`idle-rpg-board-${col}`).kids[0];
            const last = boxes.at(-1);
            if (last && content.style.h < last.y + last.h - wells[i].y) problems.push(`${tag}: ${col}'s content shorter than its cards`);
          }
        }
    }
    assert.deepEqual(problems.slice(0, 8), [], `${problems.length} problems`);
  });

  test("a card: its first agent with a class drawn, its repo and branch cut to fit; twelve overflow a well and scroll", async () => {
    const v = await mountRaid({ view: "board", classes: ["archer"] }, { width: 1280, height: 360 });
    v.view.cards = cards();
    v.render();
    assert.ok(v.images("idle-rpg-board-card-progress-1").some((p) => p.includes("classes/archer/")), "t1, an archer");
    assert.ok(!v.images("idle-rpg-board-card-progress-0").some((p) => p.includes("classes/")), "an agent with no class: no picture");
    assert.deepEqual(v.text("idle-rpg-board-card-progress-1"), ["HERDR-IDLE/FEAT/CARD-1"]);
    assert.match(v.text("idle-rpg-board-card-progress-0")[0], /^A-VERY-LONG.*…$/);
    const well = v.box("idle-rpg-board-progress");
    const last = v.box("idle-rpg-board-card-progress-11");
    assert.ok(last.y + last.h > well.y + well.h, "past the well's bottom");
    assert.equal(v.get("idle-rpg-board-progress").style.overflow_y_scroll, true);
    // the shorter titles where a column is narrow
    v.resize(320, 360);
    assert.deepEqual(["progress", "review", "completed"].map((c) => v.text(`idle-rpg-board-title-${c}`)[0]), [up(LABELS.doing), up(LABELS.inReview), up(LABELS.completed)]);
  });
});

describe("the stage section in town", () => {
  test("never over a station (its tag and hover arrow), nor a small party's spots, at every size; compact where the full one does not fit", async () => {
    const range = (a, b, step) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, i) => a + i * step);
    const widths = THOROUGH ? range(320, 2918, 3) : [...range(320, 1400, 16), 1920, 2918];
    const heights = THOROUGH ? range(230, 560, 5) : range(230, 560, 10);
    const v = await mountRaid({ view: "town", classes: ["warrior", "archer", "wizard"], statuses: ["working", "idle", "blocked"], stage: 999, best: 1000, farming: true, gold: 9.9e15, slain: 9.9e15 });
    const problems = [];
    let compact = 0;
    for (const h of heights)
      for (const w of widths) {
        v.resize(w, h);
        if (!v.has("idle-rpg-stage")) continue;
        const st = v.box("idle-rpg-stage");
        const top = h - 152;
        for (const id of ["codex", "skills", "shop"]) {
          const b = v.box(`idle-rpg-station-${id}`);
          const tag = v.box(`idle-rpg-station-${id}-tag`);
          const arrow = { x: b.x + b.w / 2 - 14, y: b.y - 38, w: 28, h: 28 }; // the arrow over it, hovered
          for (const [what, k] of [["", b], [" tag", tag], [" arrow", arrow]]) if (overlap(st, k)) problems.push(`${w}x${h}: over the ${id}${what}`);
        }
        for (const id of ["idle-rpg-you", "critter-t1", "critter-t2", "critter-t3"]) if (overlap(st, v.box(id))) problems.push(`${w}x${h}: over ${id}`);
        if (st.w < v.view.stageWidth(w)) {
          compact += 1;
          if (v.has("idle-rpg-stage-paused") || v.has("idle-rpg-stage-farm")) problems.push(`${w}x${h}: compact with the full section's marks`);
          assert.deepEqual(v.text("idle-rpg-stage").slice(0, 1), ["STAGE 999"]);
        }
        if (!inside(st, { x: 0, y: 0, w, h })) problems.push(`${w}x${h}: outside the scene`);
        for (const id of ["idle-rpg-sign", "idle-rpg-hud"]) if (overlap(st, v.box(id))) problems.push(`${w}x${h}: meets ${id}`);
      }
    assert.deepEqual(problems.slice(0, 8), [], `${problems.length} problems`);
    assert.ok(compact > 0, "the compact section among the sizes");
  });
});

describe("the strip's chips", () => {
  test("the board chip at every width in every view, the map from 640 in town and the raid only; inside the strip, apart", async () => {
    const problems = [];
    const widths = THOROUGH ? Array.from({ length: 401 }, (_, i) => 320 + i) : [320, 360, 400, 480, 560, 639, 640, 700, 900, 1280];
    for (const view of VIEWS)
      for (const statuses of [["working"], ["blocked", "working", "done", "idle"]]) {
        const { saved } = raid({ view, gold: 9.9e15, slain: 9.9e15, stage: 999, best: 1000 });
        const v = await mountView({ saved, agents: statuses.flatMap((s, i) => Array.from({ length: 120 }, (_, k) => agent(`a${i}-${k}`, s))) });
        for (const w of widths)
          for (const h of [230, 560]) {
            v.resize(w, h);
            const tag = `${view} ${statuses.length} statuses ${w}x${h}`;
            const strip = v.box("idle-rpg-hud");
            if (!inside(strip, { x: 0, y: 0, w, h })) problems.push(`${tag}: the strip leaves the scene`);
            const map = w >= 640 && view !== "board";
            if (v.has("idle-rpg-map") !== map) problems.push(`${tag}: the map ${map ? "missing" : "shown"}`);
            const chips = ["idle-rpg-board-chip", "idle-rpg-map", "idle-rpg-gear"].filter((id) => v.has(id)).map((id) => [id, v.box(id)]);
            if (chips.length !== (map ? 3 : 2)) problems.push(`${tag}: ${chips.map(([id]) => id)}`);
            const icons = v.ids("idle-rpg-status-").map((id) => [id, v.box(id)]);
            const all = [...icons, ...chips];
            all.forEach(([id, k], i) => {
              if (!inside(k, strip)) problems.push(`${tag}: ${id} outside the strip`);
              if (i && k.x < all[i - 1][1].x + all[i - 1][1].w) problems.push(`${tag}: ${id} over ${all[i - 1][0]}`);
            });
            for (const id of ["idle-rpg-sign", "idle-rpg-stage"]) if (v.has(id) && overlap(strip, v.box(id))) problems.push(`${tag}: the strip meets ${id}`);
          }
      }
    assert.deepEqual(problems.slice(0, 8), [], `${problems.length} problems`);
  });
});

describe("renders and timers per view", () => {
  test("town and board render no more often than the raid, the same fight; no timer the raid does not have", async () => {
    const o = { classes: ["warrior", "archer", "wizard", "healer"], statuses: ["working", "working", "working", "idle"], you: "archer", stage: 8, level: 4 };
    const counts = {};
    const timers = {};
    for (const view of VIEWS) {
      const v = await mountRaid({ ...o, view });
      const from = v.renders;
      v.advance(120000);
      counts[view] = v.renders - from;
      timers[view] = v.pendingTimers().filter((t) => t.every).map((t) => t.every).sort((a, b) => a - b);
    }
    assert.ok(counts.town <= counts.raid && counts.board <= counts.raid, JSON.stringify(counts));
    assert.ok(counts.board <= counts.town + 1, `the board no more than town: ${JSON.stringify(counts)}`);
    assert.deepEqual(timers.town, timers.raid);
    assert.deepEqual(timers.board, timers.raid);
  });

  test("in town with nobody working the fight is idle: only the sky renders", async () => {
    for (const view of ["town", "board"]) {
      const v = await mountRaid({ view, status: "idle" });
      const from = v.renders;
      v.advance(60000);
      assert.equal(v.renders - from, 6, `${view}: the sky every 10s`);
      assert.equal(v.view.clock, 0);
    }
  });
});
