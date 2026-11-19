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
const KEYS = ["version", "you", "spots", "sprites", "seen", "view", "back", "stage", "best", "farming", "slain", "gold", "kills", "xp", "skills", "training", "looks", "hats", "decor", "settings"];

describe("every version", () => {
  test("a fresh start (nothing saved) is a new party", () => {
    const s = R.loadState(undefined);
    assert.deepEqual(Object.keys(s).sort(), [...KEYS].sort());
    const p = R.newProgress();
    for (const k of ["stage", "best", "farming", "slain", "gold", "kills", "xp", "skills", "training", "looks", "hats", "decor"]) assert.deepEqual(s[k], p[k], k);
    assert.deepEqual(s.settings, { damageNumbers: true, advance: true, seasonal: true, seasonFirst: true });
    assert.deepEqual([s.version, s.view, s.back, s.you], [R.STATE_VERSION, "raid", "raid", { x: 154, y: 16 }]);
  });
  test("the view: saved as one of VIEWS; a save from before the board has `battle` instead (true the raid, false the town); anything else the raid", () => {
    for (const view of R.VIEWS) assert.equal(R.loadState({ version: 9, view }).view, view);
    assert.equal(R.loadState({ version: 9, view: "board", battle: false }).view, "board", "the view wins over a stale `battle`");
    for (const [battle, view] of [[true, "raid"], [false, "town"], [undefined, "raid"], ["no", "raid"], [0, "raid"]])
      for (const v of [0, 1, 8, 9]) assert.equal(R.loadState(savedState(v, { now: NOW, extra: { battle } })).view, view, `v${v} battle ${battle}`);
    for (const view of ["lobby", "", 3, null, ["town"], "Town"]) assert.equal(R.loadState({ version: 9, view, battle: false }).view, "town", `${JSON.stringify(view)} falls back to battle`);
  });
  test("the board's way back: the town or the raid as saved; the board, anything else or nothing the raid (no new version)", () => {
    for (const back of ["town", "raid"]) assert.equal(R.loadState({ version: 9, view: "board", back }).back, back);
    for (const back of ["board", "lobby", "", "Town", 3, null, ["town"], { town: 1 }, true, undefined]) assert.equal(R.loadState({ version: 9, view: "board", back }).back, "raid", JSON.stringify(back));
    for (const v of [0, 1, 8, 9]) assert.equal(R.loadState(savedState(v, { now: NOW })).back, "raid", `v${v}`);
    assert.equal(R.STATE_VERSION, 9, "an optional key needs no new version");
  });
  test("before versions (an older key's state): positions and classes kept", () => {
    const s = R.loadState(savedState(0, { now: NOW }));
    assert.deepEqual(s.spots, { t1: { x: 250, y: 64 } });
    assert.deepEqual(s.sprites, { you: "wizard", t1: "warrior" });
    assert.equal(s.slain, 0);
  });
  test("v1: progress kept, no ranks, default looks, stage 1, default settings; its saved monster is dropped", () => {
    const s = load(1);
    assert.deepEqual([s.slain, s.gold, s.kills], [42, 120, { goblin: 0, lizard: 0, slime: 10, orc: 0, ogre: 7, "chief-ogre": 0, wyvern: 0, draconian: 0, dragon: 3, imp: 0, "magma-slime": 0, "goblin-mage": 0, demon: 0 }]);
    assert.equal(s.xp.warrior, 2500);
    assert.equal(R.pointsSpent(s.skills.wizard), 0);
    assert.equal(s.looks.wizard.armour.equipped, "default");
    assert.deepEqual([s.stage, s.best, s.farming], [1, 1, false]);
    assert.deepEqual(s.settings, { damageNumbers: true, advance: true, seasonal: true, seasonFirst: true });
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
    assert.deepEqual(s.settings, { damageNumbers: false, advance: true, seasonal: true, seasonFirst: true });
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
    assert.deepEqual(s.settings, { damageNumbers: false, advance: false, seasonal: true, seasonFirst: true });
  });
  test("seasonal decorations: on in every save from before them, a saved switch kept", () => {
    for (const v of [0, 1, 2, 3, 4, 5, 6, 7, 8]) assert.equal(load(v).settings.seasonal, true, `v${v}`);
    assert.equal(R.loadState({ version: 7, settings: { seasonal: false } }).settings.seasonal, false);
    assert.equal(R.loadState({ version: 7, settings: { seasonal: "no" } }).settings.seasonal, true, "not a boolean: the default");
  });
  test("v7: Health training", () => {
    const s = load(7);
    assert.deepEqual(s.training.warrior, { attack: 3, health: 2 });
    assert.deepEqual(s.training.wizard, { attack: 1, health: 0 });
    assert.equal(s.version, R.STATE_VERSION, "and saves as this version");
  });
  test("v8: town decor, owned and equipped, kept; settings without seasonFirst get it on", () => {
    const s = load(8);
    assert.deepEqual(s.decor, { owned: ["default", "halloween"], equipped: "halloween" });
    assert.equal(s.settings.seasonFirst, true);
    assert.equal(s.version, R.STATE_VERSION, "and saves as this version");
    assert.equal(R.loadState({ version: 8, settings: { seasonFirst: false } }).settings.seasonFirst, false);
  });
  test("v9: kills of the biomes' thirteen kinds kept", () => {
    const s = load(9);
    assert.deepEqual(s.kills, { ...R.newProgress().kills, goblin: 5, slime: 10, ogre: 7, "chief-ogre": 2, dragon: 3, demon: 1 });
    assert.equal(s.version, 9);
    assert.equal(s.slain, 42, "the total is the total, as saved");
  });
  test("v1 to v8 kept their slime, ogre and dragon counts; any other kind is 0 whatever they say (it came in v9)", () => {
    for (const v of [1, 2, 3, 4, 5, 6, 7, 8]) {
      const s = load(v, { kills: { slime: 10, ogre: 7, dragon: 3, goblin: 99, demon: 4, hydra: 1 } });
      assert.deepEqual(s.kills, { ...R.newProgress().kills, slime: 10, ogre: 7, dragon: 3 }, `v${v}`);
      assert.deepEqual(Object.keys(s.kills), R.KINDS, `v${v}: every kind, in order`);
    }
    assert.deepEqual(load(0).kills, R.newProgress().kills, "before versions: none");
  });
  test("a v8 save loads with its progress as it was, the new kinds' counts at 0", () => {
    const v8 = savedState(8, { now: NOW });
    const s = R.loadState(v8);
    for (const k of ["stage", "best", "farming", "slain", "gold", "xp", "decor", "hats"]) assert.deepEqual(s[k], R.loadState({ ...v8, version: 9 })[k], k);
    assert.deepEqual([s.stage, s.best, s.farming, s.slain, s.gold], [4, 6, true, 42, 120]);
    assert.deepEqual(s.xp, { you: 1200, wizard: 900, healer: 300, warrior: 2500, archer: 40 });
    assert.deepEqual(s.training.warrior, { attack: 3, health: 2 });
    assert.deepEqual(s.looks.warrior.weapon, { owned: ["default", "axe"], equipped: "axe" });
    assert.deepEqual(s.looks.wizard.armour, { owned: ["default", "crimson"], equipped: "crimson" });
    assert.deepEqual([s.hats, s.decor], [["party"], { owned: ["default", "halloween"], equipped: "halloween" }]);
    assert.deepEqual(s.settings, { damageNumbers: false, advance: false, seasonal: true, seasonFirst: true });
    assert.deepEqual(s.kills, { ...R.newProgress().kills, slime: 10, ogre: 7, dragon: 3 });
  });
  test("v1 to v7 own no town decor whatever they say (it came in v8), and nothing saved is none", () => {
    for (const v of [0, 1, 2, 3, 4, 5, 6, 7]) assert.deepEqual(load(v, { decor: { owned: ["default", "winter"], equipped: "winter" } }).decor, { owned: ["default"], equipped: "default" }, `v${v}`);
    assert.deepEqual(R.loadState({ version: 8 }).decor, { owned: ["default"], equipped: "default" });
    assert.deepEqual(R.loadState(undefined).decor, R.newProgress().decor);
  });
  test("a later version loads what it knows and keeps its number (read-only in main.js)", () => {
    const s = load(10);
    assert.equal(s.version, 10);
    assert.equal(s.kills.demon, 1);
    assert.deepEqual(s.training.warrior, { attack: 3, health: 2 });
    assert.equal(s.relics, undefined, "what it does not know is not carried");
  });
  test("loading is idempotent: a loaded state loads to itself", () => {
    for (const v of [0, 1, 3, 5, 7, 8, 9]) {
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
      version: "7", you: { x: "1", y: 2 }, spots: [1], sprites: "x", seen: 5, view: "lobby", back: 7, battle: "yes", stage: "4", best: {}, farming: "true",
      slain: -4, gold: "100", kills: [], xp: null, skills: 7, training: [], looks: "x", hats: {}, settings: [],
    };
    for (const decor of ["x", 5, null, [], ["winter"], { owned: "winter", equipped: "winter" }, { owned: { 0: "winter" } }, { equipped: "winter" }])
      assert.deepEqual(R.loadState({ version: 8, decor }).decor, { owned: ["default"], equipped: "default" }, JSON.stringify(decor));
    const s = R.loadState(g);
    assert.deepEqual([s.version, s.you, s.spots, s.sprites, s.seen, s.view, s.back], [R.STATE_VERSION, { x: 154, y: 16 }, {}, {}, {}, "raid", "raid"]);
    assert.deepEqual([s.stage, s.best, s.farming, s.slain, s.gold], [1, 1, false, 0, 0]);
    assert.deepEqual(s.hats, []);
    assert.deepEqual(s.settings, { damageNumbers: true, advance: true, seasonal: true, seasonFirst: true });
  });
  test("bad entries are dropped one by one, good ones kept", () => {
    const s = R.loadState({
      version: 7,
      spots: { a: { x: 1, y: 2 }, b: { x: NaN, y: 1 }, c: null, d: { x: 3 } },
      sprites: { a: "wizard", b: "bard", c: 4, you: "healer" },
      seen: { a: 5, b: "x", c: Infinity },
      kills: { slime: 2, ogre: -1, dragon: 2.7, hydra: 9, goblin: 4 },
      xp: { you: 10.5, wizard: -3, warrior: "9", bard: 50 },
      skills: { wizard: { power: 9, haste: 1.5, crit: -1 } },
      looks: { archer: { armour: { owned: ["dusk", "dusk", "bogus", "crimson", "default"], equipped: "bogus" }, hat: { equipped: "santa" } } },
      hats: ["pumpkin", "pumpkin", "crown", "default"],
      settings: { damageNumbers: "no", advance: false, extra: true },
    });
    const decor = (d) => R.loadState({ version: 8, decor: d }).decor;
    assert.deepEqual(decor({ owned: ["winter", "winter", "spring", "default", 3, null, "halloween"], equipped: "spring" }), { owned: ["default", "halloween", "winter"], equipped: "default" }, "known ids once, in catalogue order; an unknown one is not on");
    assert.deepEqual(decor({ owned: ["winter"], equipped: "halloween" }), { owned: ["default", "winter"], equipped: "default" }, "on, but not owned: none");
    assert.deepEqual(decor({ owned: ["winter"], equipped: "winter" }), { owned: ["default", "winter"], equipped: "winter" });
    assert.deepEqual(s.spots, { a: { x: 1, y: 2 } });
    assert.deepEqual(s.sprites, { a: "wizard", you: "healer" });
    assert.deepEqual(s.seen, { a: 5 });
    assert.deepEqual(s.kills, { ...R.newProgress().kills, slime: 2, ogre: 0, dragon: 2 }, "a version 7 save: no goblin");
    const k9 = R.loadState({ version: 9, kills: { goblin: 4, imp: -2, demon: "3", lizard: 1.9, "magma-slime": Infinity, wyvern: NaN, hydra: 9, toString: 5 } }).kills;
    assert.deepEqual(k9, { ...R.newProgress().kills, goblin: 4, lizard: 1 });
    assert.deepEqual(Object.keys(k9), R.KINDS, "only the kinds, in order");
    assert.deepEqual(s.xp, { you: 10.5, wizard: 0, healer: 0, warrior: 0, archer: 0 });
    assert.deepEqual(s.skills.wizard, { power: 0, haste: 0, crit: 0 });
    assert.deepEqual(s.looks.archer.armour, { owned: ["default", "dusk"], equipped: "default" });
    assert.deepEqual(s.hats, ["pumpkin"]);
    assert.equal(s.looks.archer.hat.equipped, "default", "a hat nobody owns is not worn");
    assert.deepEqual(s.settings, { damageNumbers: true, advance: false, seasonal: true, seasonFirst: true });
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
      '{"version":8,"__proto__":{"gold":999,"polluted":true},"spots":{"__proto__":{"x":1,"y":2},"constructor":{"x":3,"y":4}},' +
        '"sprites":{"__proto__":"wizard","toString":"archer"},"xp":{"__proto__":5,"constructor":7},' +
        '"kills":{"__proto__":{"goblin":5},"constructor":3,"goblin":2},"skills":{"__proto__":{"power":5}},"training":{"__proto__":{"attack":9},"constructor":{"attack":9}},' +
        '"looks":{"__proto__":{"armour":{"owned":["crimson"],"equipped":"crimson"}},"constructor":{}},"settings":{"__proto__":{"advance":false}},' +
        '"hats":["__proto__","constructor"],"decor":{"__proto__":{"owned":["winter"],"equipped":"winter"},"owned":["__proto__","constructor","toString"],"equipped":"__proto__"}}',
    );
  test("no key reaches a prototype, and nothing is polluted", () => {
    const s = R.loadState(hostile());
    assert.equal({}.polluted, undefined);
    assert.equal(Object.prototype.polluted, undefined);
    assert.equal(s.gold, 0);
    assert.deepEqual(s.kills, R.newProgress().kills, "a version 8 save: no goblin kills, and no prototype's");
    assert.deepEqual(R.loadState({ ...hostile(), version: 9 }).kills, { ...R.newProgress().kills, goblin: 2 });
    assert.equal(Object.getPrototypeOf(R.loadState({ ...hostile(), version: 9 }).kills), Object.prototype);
    assert.equal(Object.getPrototypeOf(s.spots), Object.prototype);
    assert.equal(Object.hasOwn(s.spots, "__proto__"), false);
    assert.equal(Object.hasOwn(s.sprites, "__proto__"), false);
    assert.equal(s.xp.constructor, Object, "xp keeps only the known keys");
    assert.deepEqual(s.settings, { damageNumbers: true, advance: true, seasonal: true, seasonFirst: true });
    assert.deepEqual(s.hats, []);
    assert.deepEqual(s.decor, { owned: ["default"], equipped: "default" });
    assert.equal(Object.getPrototypeOf(s.decor), Object.prototype);
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
      version: 9, gold: 1e300, slain: 1e308, kills: { slime: 1e200, demon: 1e300 }, xp: { you: 1e300, wizard: Number.MAX_VALUE },
      stage: 1e9, best: 1e9, training: { warrior: { attack: 1e9, health: 5e3 } }, you: { x: 1e308, y: -1e308 },
    });
    assert.deepEqual([s.gold, s.slain, s.kills.slime, s.kills.demon, s.xp.you, s.xp.wizard], Array(6).fill(Number.MAX_SAFE_INTEGER));
    assert.deepEqual([s.stage, s.best], [R.MAX_STAGE, R.MAX_STAGE]);
    assert.deepEqual(s.training.warrior, { attack: R.MAX_TRAINING, health: R.MAX_TRAINING });
    assert.deepEqual(s.you, { x: 1e308, y: -1e308 }, "kept: the view clamps where you stand");
  });
  test("what absurd progress plays into is finite", () => {
    const s = R.loadState({ version: 7, xp: { warrior: Number.MAX_VALUE }, training: { warrior: { attack: 1e9, health: 1e9 } }, skills: { warrior: { power: 5 } } });
    for (const v of [R.damageOf(s, "warrior"), R.maxHpOf(s, "warrior"), R.trainingPrice(1e9), R.pointsLeft(s, "warrior")]) assert.ok(Number.isFinite(v), String(v));
  });
});
