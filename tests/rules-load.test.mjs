// loadState (rules.js): saved state from every version, garbage, prototype
// keys and absurd numbers all load without throwing into what this version
// keeps; a later version's save keeps its version number (main.js then never
// writes over it).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as R from "../mods/idle-rpg/rules.js";
import { savedState } from "./harness/fixtures.mjs";

const NOW = 1_800_000_000_000;
const load = (v, extra) => R.loadState(savedState(v, { now: NOW, extra }));
const KEYS = ["version", "you", "spots", "sprites", "seen", "battle", "stage", "best", "farming", "slain", "gold", "kills", "xp", "skills", "training", "looks", "hats", "settings"];

describe("every version", () => {
  test("a fresh start (nothing saved) is a new party", () => {
    const s = R.loadState(undefined);
    assert.deepEqual(Object.keys(s).sort(), [...KEYS].sort());
    const p = R.newProgress();
    for (const k of ["stage", "best", "farming", "slain", "gold", "kills", "xp", "skills", "training", "looks", "hats"]) assert.deepEqual(s[k], p[k], k);
    assert.deepEqual(s.settings, { damageNumbers: true, advance: true, seasonal: true });
    assert.deepEqual([s.version, s.battle, s.you], [R.STATE_VERSION, true, { x: 154, y: 16 }]);
  });
  test("before versions (an older key's state): positions and classes kept", () => {
    const s = R.loadState(savedState(0, { now: NOW }));
    assert.deepEqual(s.spots, { t1: { x: 250, y: 64 } });
    assert.deepEqual(s.sprites, { you: "wizard", t1: "warrior" });
    assert.equal(s.slain, 0);
  });
  test("v1: progress kept, no ranks, default looks, stage 1, default settings; its saved monster is dropped", () => {
    const s = load(1);
    assert.deepEqual([s.slain, s.gold, s.kills], [42, 120, { slime: 10, ogre: 7, dragon: 3 }]);
    assert.equal(s.xp.warrior, 2500);
    assert.equal(R.pointsSpent(s.skills.wizard), 0);
    assert.equal(s.looks.wizard.armour.equipped, "default");
    assert.deepEqual([s.stage, s.best, s.farming], [1, 1, false]);
    assert.deepEqual(s.settings, { damageNumbers: true, advance: true, seasonal: true });
    assert.equal(s.monster, undefined);
  });
  test("v2: ranks kept while the class earned the points; more than earned resets that class", () => {
    const s = load(2);
    // wizard 900 xp: level 4, 3 points; power 2 + haste 1 = 3: kept
    assert.deepEqual(s.skills.wizard, { power: 2, haste: 1, crit: 0 });
    // warrior 2500 xp: level 7, 6 points; 3 spent: kept
    assert.deepEqual(s.skills.warrior, { power: 1, haste: 1, crit: 1 });
    const t = load(2, { xp: { wizard: 150 } }); // level 2: 1 point, 3 claimed
    assert.deepEqual(t.skills.wizard, { power: 0, haste: 0, crit: 0 });
  });
  test("v3: colourways saved as `colour` are armours", () => {
    const s = load(3);
    assert.deepEqual(s.looks.wizard.armour, { owned: ["default", "crimson"], equipped: "crimson" });
    assert.deepEqual(s.hats, []);
  });
  test("v4: hats and the damage numbers setting", () => {
    const s = load(4);
    assert.deepEqual(s.hats, ["party"]);
    assert.equal(s.looks.wizard.hat.equipped, "party");
    assert.deepEqual(s.settings, { damageNumbers: false, advance: true, seasonal: true });
  });
  test("v1 to v4 hold only the default weapon whatever they say (weapons came in v5)", () => {
    for (const v of [1, 2, 3, 4]) {
      const s = load(v, { looks: { warrior: { weapon: { owned: ["default", "axe"], equipped: "axe" } } } });
      assert.deepEqual(s.looks.warrior.weapon, { owned: ["default"], equipped: "default" }, `v${v}`);
    }
  });
  test("v5: weapons kept; still stage 1 and no training", () => {
    const s = load(5);
    assert.deepEqual(s.looks.warrior.weapon, { owned: ["default", "axe"], equipped: "axe" });
    assert.deepEqual([s.stage, s.best], [1, 1]);
    assert.deepEqual(s.training.warrior, { attack: 0, health: 0 });
  });
  test("v6: stages, farming and Attack training; Health was not there yet", () => {
    const s = load(6);
    assert.deepEqual([s.stage, s.best, s.farming], [4, 6, true]);
    assert.deepEqual(s.training.warrior, { attack: 3, health: 0 });
    assert.deepEqual(s.settings, { damageNumbers: false, advance: false, seasonal: true });
  });
  test("seasonal decorations: on in every save from before them, a saved switch kept", () => {
    for (const v of [0, 1, 2, 3, 4, 5, 6, 7]) assert.equal(load(v).settings.seasonal, true, `v${v}`);
    assert.equal(R.loadState({ version: 7, settings: { seasonal: false } }).settings.seasonal, false);
    assert.equal(R.loadState({ version: 7, settings: { seasonal: "no" } }).settings.seasonal, true, "not a boolean: the default");
  });
  test("v7: Health training", () => {
    const s = load(7);
    assert.deepEqual(s.training.warrior, { attack: 3, health: 2 });
    assert.deepEqual(s.training.wizard, { attack: 1, health: 0 });
    assert.equal(s.version, 7);
  });
  test("a later version loads what it knows and keeps its number (read-only in main.js)", () => {
    const s = load(8);
    assert.equal(s.version, 8);
    assert.deepEqual(s.training.warrior, { attack: 3, health: 2 });
    assert.equal(s.relics, undefined, "what it does not know is not carried");
  });
  test("loading is idempotent: a loaded state loads to itself", () => {
    for (const v of [0, 1, 3, 5, 7]) {
      const once = load(v);
      assert.deepEqual(R.loadState(JSON.parse(JSON.stringify(once))), once, `v${v}`);
    }
  });
});

describe("garbage", () => {
  test("anything that is not a state is a fresh one", () => {
    for (const g of [null, 0, 42, "state", true, [], [1, 2], () => 1, new Date(0), NaN]) {
      const s = R.loadState(g);
      assert.equal(s.slain, 0);
      assert.equal(s.version, R.STATE_VERSION);
    }
  });
  test("every field of the wrong type falls back, nothing throws", () => {
    const g = {
      version: "7", you: { x: "1", y: 2 }, spots: [1], sprites: "x", seen: 5, battle: "yes", stage: "4", best: {}, farming: "true",
      slain: -4, gold: "100", kills: [], xp: null, skills: 7, training: [], looks: "x", hats: {}, settings: [],
    };
    const s = R.loadState(g);
    assert.deepEqual([s.version, s.you, s.spots, s.sprites, s.seen, s.battle], [R.STATE_VERSION, { x: 154, y: 16 }, {}, {}, {}, true]);
    assert.deepEqual([s.stage, s.best, s.farming, s.slain, s.gold], [1, 1, false, 0, 0]);
    assert.deepEqual(s.hats, []);
    assert.deepEqual(s.settings, { damageNumbers: true, advance: true, seasonal: true });
  });
  test("bad entries are dropped one by one, good ones kept", () => {
    const s = R.loadState({
      version: 7,
      spots: { a: { x: 1, y: 2 }, b: { x: NaN, y: 1 }, c: null, d: { x: 3 } },
      sprites: { a: "wizard", b: "bard", c: 4, you: "healer" },
      seen: { a: 5, b: "x", c: Infinity },
      kills: { slime: 2, ogre: -1, dragon: 2.7, hydra: 9 },
      xp: { you: 10.5, wizard: -3, warrior: "9", bard: 50 },
      skills: { wizard: { power: 9, haste: 1.5, crit: -1 } },
      looks: { archer: { armour: { owned: ["dusk", "dusk", "bogus", "crimson", "default"], equipped: "bogus" }, hat: { equipped: "santa" } } },
      hats: ["pumpkin", "pumpkin", "crown", "default"],
      settings: { damageNumbers: "no", advance: false, extra: true },
    });
    assert.deepEqual(s.spots, { a: { x: 1, y: 2 } });
    assert.deepEqual(s.sprites, { a: "wizard", you: "healer" });
    assert.deepEqual(s.seen, { a: 5 });
    assert.deepEqual(s.kills, { slime: 2, ogre: 0, dragon: 2 });
    assert.deepEqual(s.xp, { you: 10.5, wizard: 0, healer: 0, warrior: 0, archer: 0 });
    assert.deepEqual(s.skills.wizard, { power: 0, haste: 0, crit: 0 });
    assert.deepEqual(s.looks.archer.armour, { owned: ["default", "dusk"], equipped: "default" });
    assert.deepEqual(s.hats, ["pumpkin"]);
    assert.equal(s.looks.archer.hat.equipped, "default", "a hat nobody owns is not worn");
    assert.deepEqual(s.settings, { damageNumbers: true, advance: false, seasonal: true });
  });
  test("a stage past the best, or not a whole number, is the best", () => {
    assert.equal(R.loadState({ version: 7, stage: 9, best: 6 }).stage, 6);
    assert.equal(R.loadState({ version: 7, stage: 2.5, best: 6 }).stage, 6);
    assert.equal(R.loadState({ version: 7, stage: 0, best: 6 }).stage, 6);
    assert.equal(R.loadState({ version: 7, stage: 3, best: 6 }).stage, 3);
  });
});

describe("prototype keys", () => {
  const hostile = () =>
    JSON.parse(
      '{"version":7,"__proto__":{"gold":999,"polluted":true},"spots":{"__proto__":{"x":1,"y":2},"constructor":{"x":3,"y":4}},' +
        '"sprites":{"__proto__":"wizard","toString":"archer"},"xp":{"__proto__":5,"constructor":7},' +
        '"skills":{"__proto__":{"power":5}},"training":{"__proto__":{"attack":9},"constructor":{"attack":9}},' +
        '"looks":{"__proto__":{"armour":{"owned":["crimson"],"equipped":"crimson"}},"constructor":{}},"settings":{"__proto__":{"advance":false}},' +
        '"hats":["__proto__","constructor"]}',
    );
  test("no key reaches a prototype, and nothing is polluted", () => {
    const s = R.loadState(hostile());
    assert.equal({}.polluted, undefined);
    assert.equal(Object.prototype.polluted, undefined);
    assert.equal(s.gold, 0);
    assert.equal(Object.getPrototypeOf(s.spots), Object.prototype);
    assert.equal(Object.hasOwn(s.spots, "__proto__"), false);
    assert.equal(Object.hasOwn(s.sprites, "__proto__"), false);
    assert.equal(s.xp.constructor, Object, "xp keeps only the known keys");
    assert.deepEqual(s.settings, { damageNumbers: true, advance: true, seasonal: true });
    assert.deepEqual(s.hats, []);
    for (const c of R.CLASSES) assert.deepEqual(s.training[c], { attack: 0, health: 0 });
  });
  test("a loaded hostile state still saves and loads cleanly", () => {
    const s = R.loadState(hostile());
    assert.deepEqual(R.loadState(JSON.parse(JSON.stringify(s))), s);
  });
});

describe("absurd numbers", () => {
  test("counts and amounts are capped at the largest safe integer, training at MAX_TRAINING, stages at MAX_STAGE", () => {
    const s = R.loadState({
      version: 7, gold: 1e300, slain: 1e308, kills: { slime: 1e200 }, xp: { you: 1e300, wizard: Number.MAX_VALUE },
      stage: 1e9, best: 1e9, training: { warrior: { attack: 1e9, health: 5e3 } }, you: { x: 1e308, y: -1e308 },
    });
    assert.deepEqual([s.gold, s.slain, s.kills.slime, s.xp.you, s.xp.wizard], Array(5).fill(Number.MAX_SAFE_INTEGER));
    assert.deepEqual([s.stage, s.best], [R.MAX_STAGE, R.MAX_STAGE]);
    assert.deepEqual(s.training.warrior, { attack: R.MAX_TRAINING, health: R.MAX_TRAINING });
    assert.deepEqual(s.you, { x: 1e308, y: -1e308 }, "kept: the view clamps where you stand");
  });
  test("what absurd progress plays into is finite", () => {
    const s = R.loadState({ version: 7, xp: { warrior: Number.MAX_VALUE }, training: { warrior: { attack: 1e9, health: 1e9 } }, skills: { warrior: { power: 5 } } });
    for (const v of [R.damageOf(s, "warrior"), R.maxHpOf(s, "warrior"), R.trainingPrice(1e9), R.pointsLeft(s, "warrior")]) assert.ok(Number.isFinite(v), String(v));
  });
});
