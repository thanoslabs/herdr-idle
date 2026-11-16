// Render discipline: every render of a mod redraws the whole window, so
// main.js renders only when something it shows changed. Nothing renders
// while nothing changes; between attacks the attempt's clock and the
// knocked-out's countdowns cost at most one render a second; and no timer
// but the five standing ones (sky, blink, two roars, the watch) is left once
// the fight is idle, healers standing by or not.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { agent, mountRaid, mountView, raid } from "../harness/view.mjs";

// Records each render's attack-clock tick on `v`.
function count(v) {
  const log = [];
  const render = v.view.render.bind(v.view);
  v.view.render = (...a) => {
    log.push({ tick: v.view.clock, at: v.now });
    return render(...a);
  };
  return log;
}
const STANDING = [1000, 5200, 10000, 14000, 19000].sort((a, b) => a - b); // the every() timers init sets

describe("nothing changing", () => {
  test("in town with nobody working: only the sky's move every 10s", async () => {
    const { saved } = raid({ battle: false });
    const v = await mountView({ saved, agents: [agent("t1", "idle"), agent("t2", "done")] });
    const log = count(v);
    v.advance(60000);
    assert.deepEqual(log.map((r) => r.at - log[0].at), [0, 10000, 20000, 30000, 40000, 50000]);
  });
  test("in a raid with nobody working: the blink (two renders) and the sky; no attack clock", async () => {
    const v = await mountRaid({ status: "idle", stage: 1 });
    const log = count(v);
    v.advance(52000);
    // blinks on at 5.2s, 10.4s, ... 52s and off 170ms later (the last off is past the end); the sky at 10s, 20s, ... 50s
    assert.equal(log.length, 10 + 9 + 5);
    assert.equal(v.view.ticking, false);
    assert.equal(v.view.clock, 0, "not one tick");
  });
  test("with only healers standing by (nobody working): no attack clock, no throw", async () => {
    const v = await mountRaid({ classes: ["healer", "healer", "warrior"], status: "idle", stage: 1 });
    const log = count(v);
    v.advance(52000);
    assert.equal(log.length, 10 + 9 + 5, "the blink and the sky only");
    assert.deepEqual([v.view.ticking, v.view.clock, Object.keys(v.view.rhythm)], [false, 0, []]);
    v.advance(1000); // the last blink's off
    assert.deepEqual(v.pendingTimers().map((t) => t.every).sort((a, b) => a - b), STANDING);
  });
  test("once the fight stops, only the standing timers are left, healers standing by or not", async () => {
    const v = await mountRaid({ classes: ["warrior", "healer", "archer"], statuses: ["working", "idle", "working"], stage: 3 });
    v.advance(30000);
    assert.ok(v.view.rhythm.t2, "the healer standing by heals while the fight is on");
    v.setAgents(v.world.agents.map((a) => ({ ...a, status: "idle" })));
    v.advance(5000);
    assert.deepEqual(v.pendingTimers().map((t) => t.every).sort((a, b) => a - b), STANDING);
    assert.deepEqual([v.view.ticking, Object.keys(v.view.rhythm)], [false, []]);
  });
});

describe("in a fight", () => {
  // Plays a fight with knockouts and heals, and says which renders fell on a
  // quiet tick: nobody mid-attack, no boss attack starting, flying or
  // landing, no hit, heal, rise or fresh number. Each must be the attempt's
  // clock turning a second, or the countdowns' beat.
  async function quietRenders(o) {
    const v = await mountRaid(o);
    const log = v.renderLog;
    const bad = [];
    let quiet = 0;
    let lastSecond = Math.ceil(v.view.left / 1000);
    let lastIcons = v.view.iconKey();
    for (let i = 0; i < 4 * 240; i++) {
      const before = log.length;
      const downBefore = JSON.stringify(Object.values(v.view.party.members).map((m) => m.down));
      v.advance(250);
      const view = v.view;
      const t = view.clock;
      const foe = view.party.foe;
      const busy =
        Object.values(view.rhythm).some((r) => r.start !== null && t - r.start <= 4) ||
        (foe.pending && t - foe.pending.start <= 1) ||
        (foe.last && t - foe.last.lands <= 2) ||
        Object.values(view.party.members).some((m) => (m.hitAt !== null && t - m.hitAt <= 2) || (m.healedAt !== null && t - m.healedAt <= 2)) ||
        JSON.stringify(Object.values(view.party.members).map((m) => m.down)) !== downBefore ||
        view.damage.some((d) => t - d.tick <= 1) ||
        view.monster.hp <= 0 ||
        view.timesUp ||
        view.iconKey() !== lastIcons;
      lastIcons = view.iconKey();
      const second = Math.ceil(view.left / 1000);
      // a render the attack clock asked for (not the sky, a blink, a roar or the watch)
      // (the watch, every 1000ms, runs at the same instant as every fourth tick, and asks for no render of its own here)
      const clockTimer = (c) => c.every === null && c.name === "next";
      const rendered = log.slice(before).some((r) => r.causes.some(clockTimer) && r.causes.every((c) => clockTimer(c) || c.every === 1000));
      if (rendered && !busy) {
        quiet += 1;
        if (second === lastSecond && view.koBeat !== t) bad.push(t);
      }
      lastSecond = second;
    }
    return { quiet, bad, v };
  }

  test("between attacks a render is the clock's second turning, at most once a second", async () => {
    const { quiet, bad } = await quietRenders({ classes: ["warrior", "archer"], weapons: { warrior: "hammer", archer: "crossbow" }, stage: 8, health: 30 });
    assert.ok(quiet > 10, `${quiet} quiet renders`);
    assert.deepEqual(bad, []);
  });

  test("healers standing by add their throws, and no render between them", async () => {
    const { quiet, bad, v } = await quietRenders({ classes: ["warrior", "archer", "healer", "healer"], statuses: ["working", "working", "idle", "done"], you: "archer", stage: 8, health: 30 });
    assert.ok(v.view.rhythm.t3 && v.view.rhythm.t4);
    assert.ok(quiet > 5, `${quiet} quiet renders`);
    assert.deepEqual(bad, []);
  });

  test("everyone knocked out: one render a second, the clock's", async () => {
    const v = await mountRaid({ classes: ["warrior", "archer"], you: "archer", stage: 8, health: 30 });
    v.advance(3000);
    for (const m of Object.values(v.view.party.members)) Object.assign(m, { hp: 0, down: v.view.clock + 200 });
    v.view.party.foe.pending = null;
    v.advance(2000); // the cut-off attacks and fading numbers drawn
    const from = v.renderLog.length;
    const start = v.now;
    v.advance(10000);
    // the attack clock's renders (not the blink's, the sky's or a roar's, which may also follow a tick)
    const ticks = v.renderLog.slice(from).filter((r) => r.causes.some((c) => c.name === "next") && r.causes.every((c) => c.name === "next" || c.every === 1000));
    const perSecond = new Map();
    for (const r of ticks) perSecond.set(Math.floor((r.at - start) / 1000), (perSecond.get(Math.floor((r.at - start) / 1000)) ?? 0) + 1);
    for (const [s, n] of perSecond) assert.equal(n, 1, `${n} of the attack clock's renders in second ${s}`);
    assert.ok(perSecond.size >= 6, `${perSecond.size} seconds with a render`);
  });

  test("the knocked out's countdowns share that beat", async () => {
    const { bad, v } = await quietRenders({ classes: ["wizard", "warrior"], you: "warrior", youAt: { x: 640, y: 120 }, stage: 12 });
    assert.ok(Object.values(v.view.party.members).length > 0);
    assert.deepEqual(bad, []);
  });

  test("with everyone resting after a kill, the countdowns render once a second, no more", async () => {
    const v = await mountRaid({ classes: ["wizard", "warrior"], you: "warrior", youAt: { x: 640, y: 120 }, stage: 12 });
    v.until((h) => h.view.knocked("t1"), 120000);
    // the boss falls while t1 rests (as if the warriors finished it)
    const m = v.view.monster;
    v.view.fight([{ key: "you", cls: "warrior", damage: m.hp, crit: false, seed: 0 }]);
    v.advance(1000); // the kill's own renders (the cut-off attacks, its number's fade)
    const from = v.renderLog.length;
    const start = v.now;
    v.advance(3000); // inside the 5s before the next boss
    assert.ok(v.view.knocked("t1"));
    const ticks = v.renderLog.slice(from).filter((r) => r.causes.some((c) => c.name === "next"));
    const perSecond = new Map();
    for (const r of ticks) perSecond.set(Math.floor((r.at - start) / 1000), (perSecond.get(Math.floor((r.at - start) / 1000)) ?? 0) + 1);
    assert.equal(perSecond.size, 3, "a beat each second");
    for (const [s, n] of perSecond) assert.equal(n, 1, `${n} of the attack clock's renders in second ${s}`);
  });
});
