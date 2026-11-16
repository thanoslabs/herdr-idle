// Weapon effects as drawn: the weakness and resistance marks after damage
// numbers, status icons on the plate and pictures on the boss, burn and venom
// landing once a second in their colours, the chain's second arc, and auras.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { mountRaid } from "../harness/view.mjs";

// Runs `v` until `pred` is true, keeping every picture and pixel-text run seen on the way.
function watch(v, pred, max = 120000) {
  const pics = new Set();
  const runs = [];
  v.until((h) => {
    for (const p of h.images()) pics.add(p.replace("mods/idle-rpg/art/", ""));
    for (const id of h.ids("idle-rpg-damage-")) runs.push(...h.runs(id).map((r) => ({ ...r, id })));
    return pred(h, pics, runs);
  }, max);
  return { pics, runs };
}

describe("marks", () => {
  test("a blow on the boss's weakness has the orange arrow up; one it resists the grey arrow down", async () => {
    // fire wizards on the ogre (weak) and frost archers; then fire on the dragon (resists)
    const ogre = await mountRaid({ classes: ["wizard"], you: "archer", stage: 2, level: 3, health: 20 });
    const { pics } = watch(ogre, (h, pics) => pics.has("effects/marks/weak.png"));
    assert.ok(pics.has("effects/marks/weak.png"));
    const dragon = await mountRaid({ classes: ["wizard"], you: "archer", stage: 3, level: 3, health: 20 });
    assert.ok(watch(dragon, (h, pics) => pics.has("effects/marks/resist.png")).pics.has("effects/marks/resist.png"));
  });
  test("a plain weapon's blow has no mark", async () => {
    const v = await mountRaid({ classes: ["warrior"], you: "archer", stage: 2, level: 3, health: 20 });
    const { pics } = watch(v, (h, pics, runs) => runs.length > 20);
    assert.ok(![...pics].some((p) => p.startsWith("effects/marks/")));
  });
});

describe("statuses", () => {
  test("burn: an icon on the plate, flames on the boss, and an ember number once a second", async () => {
    const v = await mountRaid({ classes: ["wizard"], you: "archer", stage: 4, level: 3, health: 20 });
    const { pics, runs } = watch(v, (h, pics, runs) => runs.some((r) => r.colours.includes("ember")) && h.has("idle-rpg-plate-burn"));
    assert.ok(v.images("idle-rpg-plate-burn").some((p) => p.endsWith("effects/icons/burn.png")));
    assert.ok(pics.has("effects/burn/flame-1.png") && pics.has("effects/burn/flame-2.png"));
    assert.ok(runs.some((r) => r.colours.includes("ember") && /^\d+$/.test(r.text)));
  });
  test("chill: an icon, crystals and a glint", async () => {
    const v = await mountRaid({ classes: ["archer"], weapons: { archer: "frost" }, you: "warrior", youAt: { x: 640, y: 120 }, stage: 1, level: 3 });
    const { pics } = watch(v, (h, pics) => h.has("idle-rpg-plate-chill") && pics.has("effects/chill/glint.png"));
    assert.ok(pics.has("effects/chill/crystal.png"));
  });
  test("venom: stacks counted on its icon, drips per stack, and a green number", async () => {
    const v = await mountRaid({ classes: ["wizard", "wizard", "wizard"], weapons: { wizard: "venom" }, you: "wizard", stage: 5, level: 3, health: 20 });
    const { pics, runs } = watch(v, (h, pics, runs) => h.has("idle-rpg-plate-venom") && Number(h.text("idle-rpg-plate-venom")[0]) >= 3 && runs.some((r) => r.colours.includes("venom")));
    assert.ok(pics.has("effects/venom/drip-1.png") && pics.has("effects/venom/drip-2.png"));
    assert.ok(Number(v.text("idle-rpg-plate-venom")[0]) <= 5);
  });
  test("chain: a second number at the end of a second arc", async () => {
    const v = await mountRaid({ classes: ["wizard", "wizard"], weapons: { wizard: "storm" }, you: "archer", stage: 1, level: 2 });
    const { pics } = watch(v, (h, pics) => pics.has("effects/chain/arc/l.png") || pics.has("effects/chain/arc/r.png"));
    assert.ok(pics.has("effects/chain/arc/l.png") || pics.has("effects/chain/arc/r.png"));
    // only a chained blow draws one
    assert.ok(v.ids("idle-rpg-chain-").length > 0);
  });
  test("statuses go with the boss: a new one starts clean", async () => {
    const v = await mountRaid({ classes: ["wizard"], you: "archer", stage: 1, level: 6 });
    v.until((h) => h.has("idle-rpg-plate-burn"), 60000);
    v.until((h) => h.view.monster.hp <= 0, 120000);
    assert.equal(v.find("idle-rpg-plate-burn"), null);
    assert.deepEqual(v.view.statuses, { burn: {}, chill: 0, venom: [] });
  });
});

describe("auras", () => {
  test("the hex is on the plate while its healer stands", async () => {
    const v = await mountRaid({ classes: ["warrior", "healer"], weapons: { healer: "hex" }, you: "archer", stage: 2, level: 3, health: 20 });
    v.advance(6000);
    assert.ok(v.images("idle-rpg-plate-hex").some((p) => p.endsWith("effects/icons/hex.png")));
    assert.ok(v.images("idle-rpg-aura-t2").some((p) => p.endsWith("effects/icons/hex.png")));
  });
  test("haste and might show by their healer's bar", async () => {
    for (const vial of ["haste", "might"]) {
      const v = await mountRaid({ classes: ["healer"], weapons: { healer: vial }, you: "archer", stage: 1 });
      v.advance(6000);
      assert.ok(v.images("idle-rpg-aura-t1").some((p) => p.endsWith(`effects/icons/${vial}.png`)), vial);
    }
  });
});

describe("who an aura and damage over time are owed to", () => {
  test("an aura goes while its healer is knocked out, and comes back when it rises", async () => {
    const v = await mountRaid({ classes: ["warrior", "healer"], weapons: { healer: "hex" }, you: "archer", stage: 2, health: 20 });
    v.advance(6000);
    assert.equal(v.view.auras().hex, true);
    Object.assign(v.view.party.members.t2, { hp: 0, down: v.view.clock + 8 });
    assert.equal(v.view.auras().hex, false);
    v.setAgents([...v.world.agents]);
    assert.equal(v.find("idle-rpg-plate-hex"), null);
    v.advance(4000);
    assert.equal(v.view.auras().hex, true);
  });

  test("burn keeps earning for the class that put it on after its character has left", async () => {
    const v = await mountRaid({ classes: ["wizard", "warrior"], you: "archer", stage: 4, level: 3, health: 20 });
    v.until((h) => Object.keys(h.view.statuses.burn).includes("wizard"), 60000);
    const [wizard, warrior] = v.world.agents;
    v.setAgents([{ ...wizard, status: "idle" }, warrior]);
    const before = v.view.progress.xp.wizard;
    v.advance(3000); // the burn still ticks while the warrior and you attack
    assert.ok(!v.view.fighters().includes("t1"));
    assert.ok(v.view.progress.xp.wizard > before, "the wizard class earned by its burn");
  });

  test("what the Might aura adds to a blow earns for the healer class (0.3 of 1.3), the rest for the attacker's", async () => {
    const v = await mountRaid({ classes: ["warrior", "healer"], weapons: { healer: "might" }, you: "archer", youAt: { x: 154, y: 16 }, stage: 3, level: 2, health: 20 });
    let checked = 0;
    v.until(() => {
      const xp = { ...v.view.progress.xp };
      v.advance(250);
      const view = v.view;
      const landing = view.attackers().filter((k) => view.phaseOf(k) === 4);
      const dot = view.damage.some((d) => d.tick === view.clock && d.dot);
      if (landing.length === 1 && landing[0] === "t1" && !dot && view.monster.hp > 0) {
        const warrior = view.progress.xp.warrior - xp.warrior;
        const healer = view.progress.xp.healer - xp.healer;
        assert.ok(warrior > 0);
        assert.ok(Math.abs(healer / warrior - 0.3) < 1e-9, `healer ${healer}, warrior ${warrior}`);
        checked += 1;
      }
      return checked >= 3;
    }, 120000, 0);
  });
});

describe("weapons in hand", () => {
  test("each class fights with its weapon's pictures and its attack's", async () => {
    const v = await mountRaid({ classes: ["warrior", "archer", "wizard", "healer"], weapons: { warrior: "hammer", archer: "crossbow", wizard: "frost", healer: "might" }, you: "archer", stage: 1, level: 2 });
    const want = ["attacks/slash/smash/", "attacks/arrow/bolt/", "attacks/spell/frost/", "attacks/potion/might", "weapons/warrior/hammer/strike/", "weapons/healer/might/windup/"];
    const { pics } = watch(v, (h, pics) => want.every((s) => [...pics].some((p) => p.startsWith(s))), 60000);
    for (const w of ["weapons/warrior/hammer/", "weapons/archer/crossbow/", "weapons/wizard/frost/", "weapons/healer/might/windup/"]) assert.ok([...pics].some((p) => p.startsWith(w)), w);
  });
});
