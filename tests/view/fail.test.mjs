// Failed attempts through main.js: only running out of time, with the boss
// alive, loses one: it drops the fight back (failStage; the rule is in
// ./expect.mjs) into farming, with a note under the stage section, saved once;
// the pulsing next arrow ends it. Everyone knocked out at once ends nothing:
// they rest and get up, and the time runs on.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bossHp } from "../../mods/idle-rpg/rules.js";
import { up } from "../../mods/idle-rpg/party.js";
import { mountRaid } from "../harness/view.mjs";
import { afterFail, stageTexts } from "./expect.mjs";

// a party too tough to wipe and too weak to kill at stage 15: it times out
const STALEMATE = { classes: ["warrior"], you: "healer", stage: 15, health: 40 };
// a fresh party at stage 30: all knocked out within seconds, again and again
const DOOMED = { classes: ["wizard", "archer"], you: "archer", stage: 30 };

describe("a time-out", () => {
  test("after 10 minutes of fighting: back a stage, farming, a red note, saved once", async () => {
    const v = await mountRaid(STALEMATE);
    const saves = v.saves.length;
    v.until((h) => h.view.timesUp, 11 * 60000, 1000);
    const want = afterFail(15, 15);
    const p = v.view.progress;
    assert.deepEqual([p.stage, p.best, p.farming], [want.stage, 15, want.farming]);
    assert.equal(v.saves.length, saves + 1);
    assert.deepEqual(v.stored.stage, want.stage);
    assert.deepEqual([v.view.monster.stage, v.view.monster.hp, v.view.left], [want.stage, bossHp(want.stage), 600000]);
    const note = v.ids("idle-rpg-timesup-")[0];
    assert.deepEqual(v.text(note), [`TIME'S UP! BACK TO STAGE ${want.stage}`]);
    assert.deepEqual(v.runs(note)[0].colours, ["red"]);
    assert.deepEqual(v.text("idle-rpg-stage").slice(0, 2), stageTexts({ stage: want.stage, farming: true, clock: "x" }).slice(0, 2));
  });

  test("the note fades a second later and is gone after 2.6s", async () => {
    const v = await mountRaid(STALEMATE);
    v.view.left = 2000; // the last two seconds of an attempt (the 10 minutes are the test above's)
    v.until((h) => h.view.timesUp, 5000);
    const id = v.ids("idle-rpg-timesup-")[0];
    assert.equal(v.get(id).style.opacity, 1);
    v.advance(1250);
    assert.equal(v.get(id).style.opacity, 0, "fading");
    assert.equal(v.get(id).transitions.opacity.duration, 1600);
    v.advance(2000);
    assert.equal(v.find(id), null);
  });

  test("at stage 1 the same boss is simply back, with the full time", async () => {
    const v = await mountRaid({ ...STALEMATE, stage: 1, level: 1, classes: ["healer"], you: "healer" });
    v.view.left = 1000;
    v.view.monster.hp = 1e9; // never killed in that second
    v.until((h) => h.view.timesUp, 5000);
    const id = v.view.monster.id;
    assert.deepEqual([v.view.progress.stage, v.view.monster.id, v.view.monster.hp, v.view.left], [1, id, bossHp(1), 600000]);
    assert.deepEqual(v.text(v.ids("idle-rpg-timesup-")[0]), ["TIME'S UP!"]);
  });
});

describe("everyone down at once", () => {
  // the first moment nobody in the fight is standing
  const allDown = (h) => Object.keys(h.view.party.members).length > 0 && up(h.view.party).length === 0;

  test("nobody loses: no note, no drop back, nothing saved, and the time runs on, white, not paused", async () => {
    const v = await mountRaid(DOOMED);
    const saves = v.saves.length;
    v.until(allDown, 120000, 250);
    const [left, clock] = [v.view.left, v.view.clock];
    assert.equal(v.view.timesUp, null);
    assert.deepEqual([v.view.progress.stage, v.view.progress.farming, v.view.monster.stage], [30, false, 30]);
    assert.equal(v.saves.length, saves);
    assert.equal(v.find("idle-rpg-stage-paused"), null);
    v.advance(2000);
    assert.ok(allDown(v), "still all down two seconds later");
    assert.equal(v.view.left, left - (v.view.clock - clock) * 250, "the time ran every tick");
    assert.ok(v.view.clock - clock >= 7);
    assert.deepEqual(v.text("idle-rpg-stage"), stageTexts({ stage: 30, clock: v.text("idle-rpg-stage-clock")[0], running: true }));
    assert.deepEqual(v.runs("idle-rpg-stage-clock")[0].colours, ["white"]);
    assert.equal(v.get("idle-rpg-monster-time").style.bg, "#5cc8ff");
    assert.equal(v.saves.length, saves);
  });

  test("the boss waits while nobody stands; they get up after their rests at full HP, and the fight goes on", async () => {
    const v = await mountRaid(DOOMED);
    v.until(allDown, 120000, 250);
    const members = v.view.party.members;
    const first = Math.min(...Object.values(members).map((m) => m.down));
    v.until((h) => {
      if (allDown(h)) assert.equal(h.view.party.foe.pending?.start >= h.view.clock - 1 ? h.view.party.foe.pending.start : null, null, "no attack starts with nobody standing");
      return !allDown(h);
    }, 31000, 250);
    assert.equal(v.view.clock, first, "up the tick its rest ends");
    const back = Object.entries(members).filter(([, m]) => m.down === null);
    assert.ok(back.length >= 1);
    for (const [, m] of back) assert.equal(m.hp, m.maxHp);
    assert.ok(v.find(`idle-rpg-hp-${back[0][0]}`), "its HP bar is back");
    assert.equal(v.view.timesUp, null);
    // the boss's next attack comes at least FIRST_ATTACK_TICKS after the last tick nobody stood
    assert.ok(v.view.party.foe.next >= first + 3, `${v.view.party.foe.next} against ${first}`);
  });

  test("a hopeless attempt is lost only at 0:00, after ten minutes of fighting: then back a stage, farming, saved once, with its experience", async () => {
    const v = await mountRaid(DOOMED);
    const saves = v.saves.length;
    const before = { ...v.view.progress.xp };
    let downs = 0;
    let was = false;
    v.until((h) => {
      const now = allDown(h);
      if (now && !was) downs += 1;
      was = now;
      if (!h.view.timesUp) assert.equal(h.saves.length, saves, "nothing saved before the time runs out");
      return h.view.timesUp;
    }, 11 * 60000, 250);
    assert.ok(downs >= 5, `everyone was down at once ${downs} times`);
    // the time ran on every tick from the first (1.25s) to the 2400th
    assert.equal(v.view.clock, 2400);
    const want = afterFail(30, 30);
    assert.deepEqual([v.view.progress.stage, v.view.progress.farming], [want.stage, want.farming]);
    assert.deepEqual(v.text(v.ids("idle-rpg-timesup-")[0]), [`TIME'S UP! BACK TO STAGE ${want.stage}`]);
    assert.equal(v.saves.length, saves + 1);
    assert.equal(v.view.left, 600000, "a fresh attempt");
    for (const m of Object.values(v.view.party.members)) assert.deepEqual([m.hp === m.maxHp, m.down], [true, null]);
    const xp = v.view.progress.xp;
    for (const k of ["you", "wizard", "archer"]) assert.ok(xp[k] > before[k], `${k} earned nothing`);
    assert.deepEqual(v.stored.xp, JSON.parse(JSON.stringify(xp)), "every total saved as it is");
  });
});

describe("farming", () => {
  test("kills repeat the stage whatever the setting says, and the next arrow pulses", async () => {
    const v = await mountRaid({ classes: ["warrior", "archer", "wizard"], you: "archer", stage: 3, best: 4, farming: true, level: 8 });
    assert.deepEqual(v.text("idle-rpg-stage").slice(0, 2), ["STAGE 3", "FARM"]);
    assert.deepEqual(v.runs("idle-rpg-stage-farm")[0].colours, ["green"]);
    assert.deepEqual(v.get("idle-rpg-stage-next").loops.opacity, { from: 0.45, to: 1, period: 900 });
    v.until((h) => h.view.progress.slain > 0, 300000);
    const id = v.view.monster.id;
    v.until((h) => h.view.monster.id !== id, 6000);
    assert.deepEqual([v.view.progress.stage, v.view.monster.stage, v.view.progress.farming], [3, 3, true]);
  });

  test("the next arrow ends it: the stage after, a fresh attempt, saved", async () => {
    const v = await mountRaid({ stage: 7, best: 8, farming: true });
    const saves = v.saves.length;
    v.click("idle-rpg-stage-next");
    assert.deepEqual([v.view.progress.stage, v.view.progress.farming, v.view.monster.stage], [8, false, 8]);
    assert.equal(v.saves.length, saves + 1);
    assert.equal(v.find("idle-rpg-stage-farm"), null);
    assert.equal(v.get("idle-rpg-stage-next").style.opacity, 0.3, "dead at the best");
    v.click("idle-rpg-stage-next");
    assert.equal(v.view.progress.stage, 8, "nothing past the best");
    v.click("idle-rpg-stage-prev");
    assert.equal(v.view.progress.stage, 7);
  });

  test("the prev arrow is dead at stage 1", async () => {
    const v = await mountRaid({ stage: 1, best: 3 });
    assert.equal(v.get("idle-rpg-stage-prev").style.opacity, 0.3);
    assert.equal(v.get("idle-rpg-stage-prev").handlers.click, undefined);
    v.click("idle-rpg-stage-prev");
    assert.equal(v.view.progress.stage, 1);
  });
});
