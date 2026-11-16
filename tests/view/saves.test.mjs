// Saving (setShared re-renders every mod in the window, so main.js saves
// only on the events PLAN.md lists): a kill, a failed attempt, a stage
// picked, buying or equipping, a skill point, a setting, a class change, the
// raid toggle, moving yourself or an agent, a newcomer's class, closing.
// Never on a blow, a tick, a new boss, opening a panel or hovering.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { agent, mountRaid, mountView, raid } from "../harness/view.mjs";

// Runs `act` on `v` and returns how many saves it made.
const saving = (v, act) => {
  const n = v.saves.length;
  act(v);
  return v.saves.length - n;
};

describe("saving on the documented events", () => {
  test("a fresh start saves your new class once, and a newcomer agent's once", async () => {
    const v = await mountView({ agents: [agent("t1", "idle")] });
    assert.equal(v.saves.length, 2);
    assert.ok(v.stored.sprites.you && v.stored.sprites.t1);
    v.advance(30000);
    assert.equal(v.saves.length, 2, "not again");
    v.setAgents([agent("t1", "idle"), agent("t2", "idle")]);
    assert.equal(v.saves.length, 3);
  });
  test("a newcomer's class is saved from inside render (place), so its arrival renders the view twice", async () => {
    // a finding, not a bug: setShared during a render makes the app render every mod again;
    // nothing changes on the second render (the newcomer has its class by then)
    const v = await mountView({ agents: [agent("t1", "idle")] });
    const [renders, inRender] = [v.renders, v.world.savedWhileRendering];
    v.setAgents([agent("t1", "idle"), agent("t2", "idle")]);
    assert.equal(v.world.savedWhileRendering - inRender, 1);
    assert.equal(v.renders - renders, 2);
    const n = v.renders;
    v.setAgents([...v.world.agents]);
    assert.equal(v.renders - n, 1, "once the class is known, one render");
  });
  test("a fight saves once per kill and never on a blow, a tick or the next boss", async () => {
    const v = await mountRaid({ classes: ["warrior", "archer", "wizard"], you: "archer", level: 6 });
    let kills = 0;
    let saves = 0;
    const id = () => v.view.monster.id;
    let last = id();
    for (let i = 0; i < 4 * 60 * 5; i++) {
      saves += saving(v, (h) => h.advance(250));
      if (v.view.monster.hp <= 0 && id() === last) {
        kills += 1;
        last = -1;
      }
      if (id() !== last && v.view.monster.hp > 0) last = id();
    }
    assert.ok(kills >= 3, `${kills} kills`);
    assert.equal(saves, kills);
    assert.equal(v.stored.slain, kills);
  });
  test("a time-out saves once", async () => {
    const v = await mountRaid({ classes: ["warrior"], stage: 15, health: 40 });
    v.view.left = 1500;
    assert.equal(saving(v, (h) => h.advance(5000)), 1);
  });
  test("deliberate actions save at once, once", async () => {
    const v = await mountRaid({ gold: 500, slain: 1, level: 4, stage: 3, best: 5 });
    const once = [
      ["picking a stage", (h) => h.click("idle-rpg-stage-next")],
      ["spending a point", (h) => (h.click("idle-rpg-points"), h.click("idle-rpg-skill-power"))],
      ["resetting points", (h) => h.click("idle-rpg-skills-reset")],
      ["buying training", (h) => h.click("idle-rpg-train-attack")],
      ["buying in the shop (and putting it on)", (h) => (h.click("idle-rpg-gold"), h.click("idle-rpg-shop-buy-rose"))],
      ["equipping", (h) => h.click("idle-rpg-shop-equip-default")],
      ["a setting", (h) => (h.click("idle-rpg-gear"), h.click("idle-rpg-setting-damageNumbers"))],
      ["moving yourself", (h) => h.clickFloor(400, 100)],
      ["changing a class", (h) => (h.click("idle-rpg-you"), h.release("idle-rpg-you"), h.click("idle-rpg-card-wrench"), h.click("idle-rpg-pick-wizard"))],
      ["the raid toggle", (h) => h.click("idle-rpg-battle-toggle")],
    ];
    for (const [what, act] of once) assert.equal(saving(v, act), 1, what);
  });
  test("dragging an agent saves where it is dropped", async () => {
    const { saved } = raid({ battle: false, classes: ["archer"] });
    const v = await mountView({ saved, agents: [agent("t1", "idle")] });
    const n = v.saves.length;
    v.press("critter-t1");
    v.move({ x: 700, y: 300 });
    v.move({ x: 720, y: 300 });
    assert.ok(v.view.drag);
    v.release({ x: 720, y: 300 });
    assert.equal(v.saves.length, n + 1);
    assert.deepEqual(v.stored.spots.t1, { x: 720, y: 300 - (360 - 152) });
  });
  test("closing saves the fight's experience", async () => {
    const v = await mountRaid({ stage: 20, health: 30 });
    v.advance(20000);
    const xp = v.view.progress.xp.you;
    assert.ok(xp > 0);
    assert.equal(saving(v, (h) => h.close()), 1);
    assert.equal(v.stored.xp.you, xp);
  });
});

describe("not saving", () => {
  test("opening and closing panels, hovering, the codex, the shop's tabs, a card: nothing", async () => {
    const v = await mountRaid({ gold: 50, slain: 2, level: 3, battle: false });
    const none = [
      (h) => h.click("idle-rpg-station-shop"),
      (h) => h.click("idle-rpg-shop-kind-hat"),
      (h) => h.click("idle-rpg-shop-archer"),
      (h) => h.click("idle-rpg-shop-x"),
      (h) => h.click("idle-rpg-station-skills"),
      (h) => h.click("idle-rpg-skills-healer"),
      (h) => h.click("idle-rpg-gear"),
      (h) => h.hover("idle-rpg-station-shop"),
      (h) => h.hover("idle-rpg-station-shop", false),
      (h) => (h.press("critter-t1"), h.release("critter-t1")),
      (h) => h.click("idle-rpg-card-x"),
      (h) => h.advance(60000),
    ];
    none.forEach((act, i) => assert.equal(saving(v, act), 0, `action ${i}`));
  });
  test("a later version's state is never written", async () => {
    const { saved } = raid({ classes: ["warrior", "archer", "wizard"], you: "archer", level: 6 });
    const v = await mountView({ saved: { ...saved, version: 99 }, agents: [agent("t1"), agent("t2"), agent("t3"), agent("t9")] });
    v.until((h) => h.view.progress.slain > 0, 120000);
    v.clickFloor(300, 60);
    v.close();
    assert.deepEqual(v.saves, []);
  });
});
