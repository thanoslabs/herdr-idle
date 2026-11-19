// The three views of the one game (main.js setView): the town, the raid and
// the board. The agents' fight runs in each exactly as in the raid (the same
// seed, the same kills, gold, experience, stage and party after minutes,
// switching or not); you are in it only in the raid view (knocked out, until
// your rest is over, wherever you look, and never walking); nothing of the
// fight is drawn out of the raid but a knockout; the sign's button goes
// between the town and the raid, the board chip opens the board and goes
// back; the view and the board's way back are saved (the view also read from
// an older save's `battle`); the board's placeholder lays out at every size,
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

// Whether `v` draws anything of the fight (`down`: a knockout's lying pose,
// stars and rest are allowed, as in town): what it is, or null.
const FIGHT_IDS = ["idle-rpg-hp-", "idle-rpg-hurt-", "idle-rpg-healed-", "idle-rpg-aura-", "idle-rpg-damage-", "idle-rpg-crit-", "idle-rpg-shot-", "idle-rpg-lob-", "idle-rpg-foe-", "idle-rpg-marker-", "idle-rpg-monster", "idle-rpg-plate", "idle-rpg-roar-"];
const FIGHT_ART = ["/stance/", "/windup/", "/strike/", "art/attacks/", "art/effects/", "art/foe/", "art/monsters/", "status/heal.png", "status/sparkle.png"];
function fightDrawn(v, down = false) {
  const id = FIGHT_IDS.flatMap((p) => v.ids(p)).filter((i) => i !== "idle-rpg-monster-time")[0]; // (the stage section's bar, not the monster's)
  if (id) return id;
  const art = v.images().find((p) => FIGHT_ART.some((f) => p.includes(f)) || (!down && (p.includes("/down/") || p.includes("status/dizzy.png") || p.includes("status/rest/"))));
  if (art) return art;
  const ring = !down && v.ids("idle-rpg-rest-")[0];
  return ring || (v.view.youFights ? "youFights" : null);
}

describe("the fight runs in every view as in the raid (for the agents)", () => {
  const minutes = THOROUGH ? 20 : 4;
  const seeds = THOROUGH ? [1, 7, 42] : [3];
  // a party with a healer standing by, through first clears, knockouts and heals
  const SETUPS = {
    "you a healer (ranged: in the raid's fight from anywhere)": { classes: ["warrior", "archer", "wizard", "healer"], statuses: ["working", "working", "working", "idle"], you: "healer", stage: 9, level: 6 },
    "you a warrior out of reach": { classes: ["warrior", "archer", "healer"], statuses: ["working", "working", "working"], you: "warrior", stage: 6, level: 5 },
    "you a warrior beside the boss": { classes: ["wizard", "archer"], you: "warrior", youAt: { x: 640, y: 120 }, stage: 6, level: 8 },
    // where the town's campfire is: drawn in front of it in town, never moved there
    "you an archer in the campfire's place": { classes: ["warrior", "wizard"], you: "archer", youAt: { x: 640, y: 100 }, stage: 5, level: 6 },
  };
  // you are in the fight only in the raid view: town and board are the same
  // fight whatever you are, and you never in it
  for (const [name, o] of Object.entries(SETUPS))
    test(`${name}: town, board and switching between them the same fight after ${minutes} minutes, you never in it`, async () => {
      for (const seed of seeds) {
        const town = await mountRaid({ ...o, view: "town" }, { seed });
        const board = await mountRaid({ ...o, view: "board" }, { seed });
        const switching = await mountRaid({ ...o, view: "town" }, { seed });
        for (let s = 1; s <= minutes * 60; s++) {
          // at odd moments: between ticks and on them
          for (const v of [town, board]) v.advance(1000);
          switching.advance(s % 3 ? 1000 : 375);
          if (s % 5 === 0 || s % 7 === 0) switching.click("idle-rpg-board-chip");
          if (!(s % 3)) switching.advance(625);
          for (const v of [town, board, switching]) {
            assert.ok(!v.view.fighters().includes("you") && !v.view.standby().includes("you"), `you in the fight at ${s}s`);
            assert.ok(!("you" in v.view.party.members) && !("you" in v.view.party.away) && !("you" in v.view.rhythm), `you in the party at ${s}s`);
          }
          if (s % 10 === 0) {
            const want = snapshot(town.view);
            for (const [label, v] of [["board", board], ["switching", switching]]) assert.deepEqual(snapshot(v.view), want, `${label} parts from the town at ${s}s (seed ${seed})`);
          }
        }
        assert.ok(town.view.progress.slain >= 1, `a kill to compare (seed ${seed})`);
        assert.ok(town.view.progress.gold > 0 && town.view.progress.xp[o.classes[0]] > 0, "town earns gold and experience");
      }
    });

  // with you out of the raid's fight too, every view is the same fight,
  // switching among all three at any moment included
  const OUT = {
    "you a warrior out of reach": SETUPS["you a warrior out of reach"],
    "you a warrior out of reach, a healer standing by": { classes: ["warrior", "archer", "wizard", "healer"], statuses: ["working", "working", "working", "idle"], you: "warrior", stage: 9, level: 4 },
    "you a warrior out of reach, the agents knocked out": { classes: ["warrior", "archer", "wizard"], you: "warrior", stage: 6, level: 2 },
  };
  for (const [name, o] of Object.entries(OUT))
    test(`${name}: the same kills, gold, experience, stage and party after ${minutes} minutes, in the raid, in town, on the board and switching`, async () => {
      for (const seed of seeds) {
        const raidView = await mountRaid({ ...o, view: "raid" }, { seed });
        const town = await mountRaid({ ...o, view: "town" }, { seed });
        const board = await mountRaid({ ...o, view: "board" }, { seed });
        const switching = await mountRaid({ ...o, view: "raid" }, { seed });
        const odd = await mountRaid({ ...o, view: "town" }, { seed });
        const order = ["idle-rpg-view-toggle", "idle-rpg-board-chip", "idle-rpg-board-chip", "idle-rpg-view-toggle", "idle-rpg-board-chip", "idle-rpg-view-toggle"];
        let downs = 0;
        for (let s = 1; s <= minutes * 60; s++) {
          for (const v of [raidView, town, board, switching]) v.advance(1000);
          if (s % 7 === 0) switching.click(order[(s / 7) % order.length]);
          // and one switching between ticks, several times a second at times
          for (const [ms, id] of s % 4 ? [[1000, null]] : [[130, "idle-rpg-view-toggle"], [250, "idle-rpg-board-chip"], [620, "idle-rpg-board-chip"]]) {
            odd.advance(ms);
            if (id) odd.click(id);
          }
          downs += Object.values(raidView.view.party.members).filter((m) => m.down !== null).length > 0;
          if (s % 10 === 0) {
            const want = snapshot(raidView.view);
            for (const [label, v] of [["town", town], ["board", board], ["switching", switching], ["odd", odd]]) assert.deepEqual(snapshot(v.view), want, `${label} parts from the raid at ${s}s (seed ${seed})`);
          }
        }
        assert.ok(raidView.view.progress.slain >= 1, `a kill to compare (seed ${seed})`);
        if (name.includes("knocked out")) assert.ok(downs > 0, "knockouts to compare");
        assert.equal(town.view.view, "town");
        assert.equal(board.view.view, "board");
      }
    });

  test("you join only in the raid view: a warrior within reach of the boss and an archer anywhere fight there, never in town or on the board", async () => {
    for (const [you, youAt] of [["warrior", { x: 640, y: 120 }], ["archer", { x: 154, y: 16 }]]) {
      for (const view of VIEWS) {
        const v = await mountRaid({ classes: ["archer"], you, youAt, view, stage: 3 });
        v.advance(4000);
        const joined = view === "raid";
        assert.equal("you" in v.view.party.members, joined, `${you} in the ${view}`);
        assert.equal(v.view.fighters().includes("you"), joined);
        assert.equal(v.view.joins(1280), joined);
        assert.equal(v.has("idle-rpg-plate"), joined, "the fight is drawn only in the raid");
        assert.ok(v.has("idle-rpg-stage"), "the stage section shows it everywhere");
      }
    }
  });

  test("leaving the raid on your feet takes you out of the fight (your HP kept for the attempt), back in it you return so", async () => {
    const v = await mountRaid({ classes: ["wizard", "archer"], you: "archer", stage: 12, level: 3 });
    v.until((h) => h.view.party.members.you?.hp < h.view.party.members.you?.maxHp && h.view.party.members.you.down === null, 120000);
    v.click("idle-rpg-view-toggle");
    assert.ok(!v.view.fighters().includes("you"), "out of the fight at once");
    v.advance(250);
    const away = { ...v.view.party.away.you, monster: v.view.monster.id };
    assert.ok(!("you" in v.view.party.members) && away && away.rest === null && away.hp < away.maxHp, "gone, its HP kept");
    assert.ok(!("you" in v.view.rhythm));
    v.advance(10000);
    assert.ok(!("you" in v.view.party.members), "never back in it in town");
    v.click("idle-rpg-view-toggle");
    v.advance(250);
    assert.ok("you" in v.view.party.members, "back in the fight in the raid");
    if (v.view.monster.id === away.monster) assert.equal(v.view.party.members.you.hp, away.hp, "with the HP you left with");
  });

  test("knocked out in the raid, then in town: lying down with stars and the rest counting down, still in the fight (never hit), no walking until you get up", async () => {
    const v = await mountRaid({ classes: ["wizard", "archer"], you: "archer", stage: 30 });
    v.until((h) => h.view.knocked("you"), 120000);
    const up = v.view.party.members.you.down;
    const hit = v.view.party.members.you.hitAt;
    v.click("idle-rpg-view-toggle");
    assert.equal(v.view.view, "town");
    v.advance(1000);
    assert.ok(v.view.knocked("you") && v.view.fighters().includes("you"), "still in the fight, down");
    assert.equal(v.view.party.members.you.down, up, "the rest neither frozen nor cut");
    assert.ok(v.images("idle-rpg-you").some((p) => p.includes("/down/")), "lying down in town");
    assert.ok(v.has("idle-rpg-rest-ring-you"), "the rest's ring over you");
    const shown = Number(v.text("idle-rpg-rest-count-you").join(""));
    assert.ok(shown > 0 && shown <= 30, String(shown));
    assert.equal(fightDrawn(v, true), null, "nothing else of the fight");
    v.click("idle-rpg-you");
    assert.match(v.text("idle-rpg-card-health").join(" "), /Knocked out · \d+s/);
    v.click("idle-rpg-card-x");
    const there = { ...v.view.you };
    v.clickFloor(300, 100);
    assert.deepEqual([v.view.you, v.view.walking], [there, false], "no walking while knocked out in town");
    v.advance(4000);
    assert.ok(Number(v.text("idle-rpg-rest-count-you").join("")) < shown, "the countdown runs on in town");
    assert.equal(v.view.party.members.you.hitAt, hit, "never hit while down");
    // the board: still down, the rest running
    v.click("idle-rpg-board-chip");
    v.advance(1000);
    assert.ok(v.view.knocked("you"));
    v.click("idle-rpg-board-chip");
    // up: out of the fight at once in town, on your feet, free to walk
    v.until((h) => !h.view.knocked("you"), 60000);
    assert.ok(v.view.clock >= up, "got up when the rest was over");
    v.advance(250);
    assert.ok(!("you" in v.view.party.members), "out of the fight once up");
    assert.ok(v.images("idle-rpg-you").some((p) => p.endsWith("/stand.png")));
    assert.ok(!v.has("idle-rpg-rest-ring-you"));
    v.clickFloor(300, 100);
    assert.notDeepEqual(v.view.you, there, "you walk");
  });

  test("knocked out in town while every agent stops: your rest freezes, and runs on when they work again (never stuck down in town)", async () => {
    const v = await mountRaid({ classes: ["wizard", "archer"], you: "archer", stage: 30 });
    v.until((h) => h.view.knocked("you"), 120000);
    v.click("idle-rpg-view-toggle");
    v.advance(1000);
    const agents = v.world.agents;
    v.setAgents(agents.map((a) => ({ ...a, status: "idle" })));
    v.advance(1000);
    assert.ok(!("you" in v.view.party.members) && v.view.party.away.you.rest > 0, "out of the fight, the rest frozen");
    v.setAgents(agents.map((a) => ({ ...a, status: "working" })));
    v.advance(1000);
    assert.ok(v.view.knocked("you"), "back in the fight, still down, in town");
    v.until((h) => !h.view.knocked("you"), 60000);
    v.advance(250);
    assert.ok(!("you" in v.view.party.members) && v.view.party.away.you?.rest == null, "up, and out of the fight in town");
    v.click("idle-rpg-you");
    assert.doesNotMatch(v.text("idle-rpg-card-health").join(" "), /Knocked out/);
  });

  test("knocked out in the raid view: no walking either (in every view)", async () => {
    const v = await mountRaid({ classes: ["wizard", "archer"], you: "archer", stage: 30 });
    v.until((h) => h.view.knocked("you"), 120000);
    const there = { ...v.view.you };
    v.clickFloor(500, 100);
    assert.deepEqual(v.view.you, there);
    assert.ok(v.images("idle-rpg-you").some((p) => p.includes("/down/")));
  });

  test("nothing of the fight drawn in town or on the board, for anyone, through kills and knockouts; in town a knocked-out agent lies down with its stars and rest", async () => {
    const o = { classes: ["warrior", "archer", "wizard"], you: "archer", stage: 6, level: 2, settings: { damageNumbers: true } };
    for (const view of ["town", "board"]) {
      const v = await mountRaid({ ...o, view });
      let downs = 0;
      for (let s = 0; s < (THOROUGH ? 600 : 240) * 4; s++) {
        v.advance(250);
        const drawn = fightDrawn(v, view === "town");
        assert.equal(drawn, null, `${view} at ${s / 4}s`);
        const out = Object.keys(v.view.party.members).filter((k) => v.view.knocked(k));
        downs += out.length > 0;
        if (view === "town")
          for (const k of out) {
            assert.ok(v.has(`idle-rpg-rest-ring-${k}`), `${k}'s ring in town`);
            assert.ok(v.images(`critter-${k}`).some((p) => p.includes("/down/")), `${k} lying down`);
          }
        if (view === "board") assert.ok(!v.has("idle-rpg-you") && !v.ids("critter-").length, "nobody drawn on the board");
      }
      assert.ok(downs > 0 && v.view.progress.slain > 0, `${view}: knockouts and kills happened (${downs}, ${v.view.progress.slain})`);
    }
  });

  test("in the campfire's place: drawn in front of it in town, your spot unchanged (the raid's fight reads it); a walk there likewise", async () => {
    const v = await mountRaid({ classes: ["warrior"], you: "archer", youAt: { x: 640, y: 100 }, view: "town" });
    v.advance(2000);
    assert.deepEqual(v.view.you, { x: 640, y: 100 });
    assert.equal(v.box("idle-rpg-you").y, v.size.height - 152 + 112 - 66, "drawn at the stones' front");
    v.click("idle-rpg-view-toggle");
    v.advance(2000);
    assert.equal(v.view.party.members.you.y, 100, "your spot in the raid's fight");
    v.click("idle-rpg-view-toggle");
    v.clickFloor(200, 40);
    v.advance(3000);
    v.clickFloor(650, 30);
    v.advance(3000);
    assert.deepEqual(v.view.you, { x: 650, y: 30 }, "walked where clicked");
    assert.equal(v.box("idle-rpg-you").y, v.size.height - 152 + 112 - 66);
    assert.deepEqual(v.stored.you, { x: 650, y: 30 });
  });

  test("carrying a healer standing by in town changes nothing in the fight", async () => {
    const o = { classes: ["warrior", "archer", "healer"], statuses: ["working", "working", "idle"], you: "wizard", stage: 9, level: 4, view: "town" };
    const town = await mountRaid(o);
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
    // the town: stations and campfire, no boss, the stage section running on, the sign and the strip as in the raid
    for (const id of ["idle-rpg-station-shop", "idle-rpg-fire-glow", "idle-rpg-stage", "idle-rpg-gold", "idle-rpg-slain", "idle-rpg-map", "idle-rpg-board-chip"]) assert.ok(v.has(id), id);
    for (const id of ["idle-rpg-plate", "idle-rpg-board"]) assert.ok(!v.has(id), id);
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
      assert.ok(v.has("idle-rpg-map"), "the map on the board, as in every view");
      assert.ok(v.has("idle-rpg-gold") && v.has("idle-rpg-slain"), "the kill and gold chips on the board's sign, as in every view");
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

  test("the board's way back saved as `back` and loaded: a reload on the board still goes back where it came from", async () => {
    for (const from of ["town", "raid"]) {
      const v = await mountRaid({ view: from });
      v.click("idle-rpg-board-chip");
      assert.deepEqual([v.stored.view, v.stored.back], ["board", from]);
      const again = await mountView({ saved: v.stored, agents: v.world.agents });
      assert.deepEqual([again.view.view, again.view.back], ["board", from]);
      assert.equal(again.text("idle-rpg-view-toggle")[0], up(from === "raid" ? LABELS.toTown : LABELS.toRaid), "the sign's button to the other");
      again.click("idle-rpg-board-chip");
      assert.equal(again.view.view, from, "back where it came from");
      assert.equal(again.stored.back, from, "kept while it does not change");
    }
  });

  test("a `back` that is not the town or the raid (the board, anything else, none) goes back to the raid", async () => {
    for (const back of ["board", "lobby", "Town", 7, null, ["town"], undefined]) {
      const v = await mountRaid({ view: "board", back });
      assert.equal(v.view.back, "raid", JSON.stringify(back));
      v.click("idle-rpg-board-chip");
      assert.equal(v.view.view, "raid", JSON.stringify(back));
      assert.equal(v.stored.back, "raid");
    }
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
  test("never over a station (its tag and hover arrow), nor a small party's spots but where neither row has room, at every size; compact where the full one does not fit", async () => {
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
        // (the sign and the strip stay where they are in the raid, so with the sign at
        // its widest the section has no room clear of everyone at 640px in the lowest scenes)
        for (const id of ["idle-rpg-you", "critter-t1", "critter-t2", "critter-t3"]) if (overlap(st, v.box(id)) && !(w < 656 && h < 250)) problems.push(`${w}x${h}: over ${id}`);
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
  test("the board chip at every width in every view, the map from 640 in every view; inside the strip, apart", async () => {
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
            const map = w >= 640;
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
