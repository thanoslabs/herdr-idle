// A fight through the real main.js: blows land on the impact phase, the boss's
// HP falls, a kill clears the stage and pays once, the next boss comes after
// the wait (with the countdown on a first clear), and the attempt's clock
// runs only while anyone is in the fight (a working agent), standing or not.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CLASSES, bossHp, shortNumber, stageGold, stageXp } from "../../mods/idle-rpg/rules.js";
import { mountRaid } from "../harness/view.mjs";
import { stageTexts } from "./expect.mjs";

const classXp = (v) => CLASSES.reduce((s, c) => s + v.view.progress.xp[c], 0);
// a party with no healer, so every point of experience comes from blows
const NO_HEALER = { classes: ["warrior", "archer", "wizard"], you: "archer" };

describe("blows", () => {
  test("damage comes off only on someone's impact phase (or as a second's damage over time)", async () => {
    const v = await mountRaid({ ...NO_HEALER, stage: 3, level: 3 });
    let landings = 0;
    for (let i = 0; i < 240 && v.view.monster.hp > 0; i++) {
      const before = v.view.monster.hp;
      v.advance(250);
      const view = v.view;
      const impact = view.attackers().filter((k) => view.phaseOf(k) === 4 && !view.rhythm[k]?.heal);
      const dot = view.damage.some((d) => d.tick === view.clock && d.dot);
      if (view.monster.hp < before) {
        landings += 1;
        assert.ok(impact.length > 0 || dot, `HP fell on tick ${view.clock} with nobody landing a blow`);
      } else if (view.monster.hp > 0) assert.equal(impact.length, 0, `${impact} landed on tick ${view.clock} and took nothing`);
    }
    assert.ok(landings > 10);
  });

  test("the plate's HP and bar fall as blows land", async () => {
    const v = await mountRaid({ ...NO_HEALER, stage: 4 });
    const max = bossHp(4);
    assert.deepEqual(v.text("idle-rpg-plate"), ["GOBLIN", `${shortNumber(max)}/${shortNumber(max)}`]);
    // the bar's fill spans the inside of its 2px outline at full HP
    const full = v.get("idle-rpg-monster-hp").parent.style.w - 4;
    assert.equal(v.get("idle-rpg-monster-hp").style.w, full);
    v.advance(20000);
    const [, hp] = v.text("idle-rpg-plate");
    const shown = Number(hp.split("/")[0].replace("K", "e3"));
    assert.ok(shown < max && shown > 0, hp);
    assert.equal(v.get("idle-rpg-monster-hp").style.w, Math.round((full * v.view.monster.hp) / max));
  });

  test("a damage number pops in where the blow lands, then rises and fades on the next tick", async () => {
    const v = await mountRaid({ ...NO_HEALER, stage: 2 });
    v.until((h) => h.ids("idle-rpg-damage-").length > 0, 20000);
    const id = v.ids("idle-rpg-damage-")[0];
    const fresh = v.get(id);
    assert.equal(fresh.style.opacity, 1);
    const top = fresh.style.top;
    v.advance(250);
    const later = v.find(id);
    assert.equal(later.style.opacity, 0);
    assert.equal(later.style.top, top - 36);
    assert.deepEqual(later.transitions.opacity, { duration: 800, easing: "ease-in" });
  });
});

describe("a kill", () => {
  test("clears the stage: gold and the kind's count once, a kill's experience in all, and the next stage reached", async () => {
    const v = await mountRaid({ ...NO_HEALER, stage: 1, level: 4 });
    const xp0 = classXp(v);
    v.until((h) => h.view.monster.hp <= 0, 120000);
    const p = v.view.progress;
    const attackers = v.view.fighters().length;
    assert.equal(attackers, 4);
    assert.deepEqual([p.slain, p.kills.goblin, p.gold, p.best, p.stage], [1, 1, stageGold(1, attackers), 2, 2]);
    assert.ok(Math.abs(classXp(v) - xp0 - stageXp(1, attackers)) < 1e-6, "the classes earned exactly one kill's experience");
    assert.ok(Math.abs(p.xp.you - stageXp(1, attackers)) < 1e-6, "and so did you");
    assert.deepEqual(v.text("idle-rpg-plate"), ["GOBLIN"], "the plate keeps its name; the stage section says it was slain");
    assert.deepEqual(v.text(`idle-rpg-stage-slain-${v.view.monster.id}`), ["GOBLIN SLAIN! NEXT: STAGE 2 IN 5"]);
    // nothing more is paid while it lies there
    const snapshot = JSON.stringify(p);
    v.advance(3000);
    assert.equal(JSON.stringify(v.view.progress), snapshot);
  });

  test("its gold is for everyone in the fight: 2 fighters, then 6", async () => {
    for (const classes of [["warrior"], ["warrior", "archer", "wizard", "archer", "wizard"]]) {
      const v = await mountRaid({ classes, you: "archer", stage: 5, best: 5, level: 15, health: 20 });
      v.until((h) => h.view.progress.slain === 1, 300000);
      const n = classes.length + 1;
      assert.equal(v.view.fighters().length, n);
      assert.equal(v.view.progress.gold, stageGold(5, n), `${n} fighters`);
      assert.notEqual(stageGold(5, n), stageGold(5), "not the 4 a kill is reckoned with by default");
    }
  });

  test("a first clear counts down five seconds in the stage section, then the next boss comes", async () => {
    const v = await mountRaid({ ...NO_HEALER, stage: 1, level: 4 });
    v.until((h) => h.view.monster.hp <= 0, 120000);
    const slain = v.view.monster;
    assert.equal(slain.advancing, 2);
    const notes = new Set();
    v.until((h) => {
      for (const id of h.ids("idle-rpg-stage-slain-")) notes.add(h.text(id).join(" "));
      return h.view.monster.id !== slain.id;
    }, 8000);
    assert.ok(v.now - (slain.slainAt) >= 5000 && v.now - slain.slainAt < 6000, `came after ${v.now - slain.slainAt}ms`);
    assert.deepEqual([...notes], [5, 4, 3, 2, 1].map((s) => `GOBLIN SLAIN! NEXT: STAGE 2 IN ${s}`));
    assert.deepEqual([v.view.monster.stage, v.view.monster.hp, v.view.monster.id], [2, bossHp(2), slain.id + 1]);
    assert.deepEqual(v.ids("idle-rpg-stage-slain-"), [], "the message goes with it");
    assert.deepEqual(v.text("idle-rpg-stage-clock"), ["10:00"], "and the time is back");
    assert.equal(v.view.left, 600000, "a fresh attempt");
  });

  test("a kill below the best (or with advance off) brings the same stage's next boss after 3s, no countdown", async () => {
    for (const o of [{ stage: 1, best: 5 }, { stage: 1, settings: { advance: false } }]) {
      const v = await mountRaid({ ...NO_HEALER, level: 4, ...o });
      v.until((h) => h.view.monster.hp <= 0, 120000);
      const slain = v.view.monster;
      assert.equal(slain.advancing, undefined);
      assert.deepEqual(v.text(`idle-rpg-stage-slain-${slain.id}`), ["GOBLIN SLAIN!"], "slain, no countdown");
      v.until((h) => h.view.monster.id !== slain.id, 5000);
      assert.ok(v.now - slain.slainAt >= 3000 && v.now - slain.slainAt < 4000);
      assert.deepEqual(v.ids("idle-rpg-stage-slain-"), []);
      assert.equal(v.view.monster.stage, o.best ? 2 : 1);
    }
  });

  test("everyone is back at full HP for the next boss", async () => {
    const v = await mountRaid({ ...NO_HEALER, stage: 4, level: 6 });
    v.until((h) => Object.values(h.view.party.members).some((m) => m.hp < m.maxHp), 60000);
    v.until((h) => h.view.monster.hp <= 0, 300000);
    const id = v.view.monster.id;
    v.until((h) => h.view.monster.id !== id, 8000);
    for (const m of Object.values(v.view.party.members)) assert.deepEqual([m.hp, m.down], [m.maxHp, null]);
  });
});

describe("the attempt's clock", () => {
  test("runs while anyone is in the fight, shown as minutes and seconds with a bar", async () => {
    const v = await mountRaid({ ...NO_HEALER, stage: 30 , health: 60 });
    // working agents are attackers from the start: the clock reads as running (white, not paused) before the first tick
    assert.deepEqual(v.text("idle-rpg-stage"), stageTexts({ stage: 30, clock: "10:00", running: true }));
    v.advance(10000);
    const left = v.view.left;
    // the clock started with the first tick at 1.25s: 36 ticks of 250ms by 10s
    assert.equal(left, 600000 - 36 * 250);
    assert.deepEqual(v.text("idle-rpg-stage"), stageTexts({ stage: 30, clock: `9:${String(Math.ceil(left / 1000) - 540).padStart(2, "0")}` }));
    assert.deepEqual(v.runs("idle-rpg-stage-clock")[0].colours, ["white"]);
    assert.equal(v.get("idle-rpg-monster-time").style.bg, "#5cc8ff");
  });

  test("pauses when nobody is in the fight (no agent working), grey, and goes on when one works", async () => {
    const v = await mountRaid({ ...NO_HEALER, stage: 30, health: 60 });
    v.advance(5000);
    const working = v.world.agents;
    v.setAgents(working.map((a) => ({ ...a, status: "idle" })));
    v.advance(2000); // the last tick and the watch see them stop
    const left = v.view.left;
    v.advance(60000);
    assert.equal(v.view.left, left, "the time stood still");
    assert.equal(v.view.ticking, false, "and so did the attack clock");
    assert.deepEqual(v.runs("idle-rpg-stage-clock")[0].colours, ["grey"]);
    assert.deepEqual(v.text("idle-rpg-stage"), stageTexts({ stage: 30, clock: v.text("idle-rpg-stage-clock")[0], running: false }));
    assert.equal(v.get("idle-rpg-monster-time").style.bg, "#5d7088");
    v.setAgents(working);
    v.advance(5000);
    assert.ok(v.view.left < left);
  });

  test("runs on with everyone knocked out, and with only you standing", async () => {
    const v = await mountRaid({ ...NO_HEALER, stage: 30, health: 60 });
    v.advance(5000);
    for (const m of Object.values(v.view.party.members)) Object.assign(m, { hp: 0, down: v.view.clock + 200 });
    const left = v.view.left;
    v.advance(10000);
    assert.equal(v.view.left, left - 40 * 250);
    assert.deepEqual(v.view.attackers(), []);
    assert.deepEqual(v.text("idle-rpg-stage"), stageTexts({ stage: 30, clock: v.text("idle-rpg-stage-clock")[0], running: true }));
    assert.deepEqual(v.runs("idle-rpg-stage-clock")[0].colours, ["white"]);
    v.view.party.members.you.down = null; // you get up first: the agents still rest
    v.view.party.members.you.hp = 1;
    v.advance(1000);
    assert.equal(v.view.left, left - 44 * 250);
  });

  test("you alone do not keep the clock going: it needs a working agent", async () => {
    const v = await mountRaid({ ...NO_HEALER, stage: 30, status: "idle" });
    v.advance(30000);
    assert.equal(v.view.left, 600000);
    assert.deepEqual(v.view.fighters(), []);
  });
});
