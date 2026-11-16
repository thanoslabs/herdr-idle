// Failed attempts through main.js: running out of time and being wiped both
// drop the fight back (failStage; the rule is in ./expect.mjs) into farming,
// with a note under the stage section, saved once; the pulsing next arrow ends it.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bossHp } from "../../mods/idle-rpg/rules.js";
import { mountRaid } from "../harness/view.mjs";
import { afterFail, stageTexts } from "./expect.mjs";

// a party too tough to wipe and too weak to kill at stage 15: it times out
const STALEMATE = { classes: ["warrior"], you: "healer", stage: 15, health: 40 };
// a fresh party at stage 30: wiped within seconds
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

describe("a wipe", () => {
  test("the last one standing falls: back a stage, farming, 'WIPED!', saved once", async () => {
    const v = await mountRaid(DOOMED);
    const saves = v.saves.length;
    v.until((h) => h.view.timesUp, 120000);
    const want = afterFail(30, 30);
    assert.deepEqual([v.view.progress.stage, v.view.progress.farming], [want.stage, want.farming]);
    assert.deepEqual(v.text(v.ids("idle-rpg-timesup-")[0]), [`WIPED! BACK TO STAGE ${want.stage}`]);
    assert.equal(v.saves.length, saves + 1);
    assert.ok(v.view.left > 590000, "a fresh attempt");
    for (const m of Object.values(v.view.party.members)) assert.deepEqual([m.hp === m.maxHp, m.down], [true, null]);
  });

  test("the experience the attempt earned is kept and saved", async () => {
    const v = await mountRaid(DOOMED);
    v.until((h) => h.view.timesUp, 120000);
    assert.ok(v.stored.xp.wizard > 0 || v.stored.xp.archer > 0);
    assert.equal(v.stored.xp.you, v.view.progress.xp.you);
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
