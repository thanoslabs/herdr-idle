// rules.js: levels, skill points, stages, the boss's numbers, damage and HP,
// training, picking and failing stages, kills, and how numbers and times are
// written. (The shop is in rules-shop, the art paths in rules-art, loading
// saved state in rules-load.)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as R from "../mods/idle-rpg/rules.js";
import { afterFail } from "./view/expect.mjs";

const fresh = () => R.newProgress();
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} is not ${b}`);

describe("levels from experience", () => {
  test("a class goes from level n to n + 1 for 100 x n", () => {
    assert.deepEqual(R.classLevel(0), { level: 1, into: 0, need: 100 });
    assert.deepEqual(R.classLevel(99), { level: 1, into: 99, need: 100 });
    assert.deepEqual(R.classLevel(100), { level: 2, into: 0, need: 200 });
    assert.deepEqual(R.classLevel(299), { level: 2, into: 199, need: 200 });
    assert.deepEqual(R.classLevel(300), { level: 3, into: 0, need: 300 });
  });
  test("you level on 250 x n", () => {
    assert.equal(R.playerLevel(249).level, 1);
    assert.equal(R.playerLevel(250).level, 2);
    assert.equal(R.playerLevel(750).level, 3);
  });
  test("every level boundary is exact, far up (no square-root drift)", () => {
    for (const level of [10, 100, 1000, 12345, 1e6]) {
      const at = R.xpFor(level, 100);
      assert.equal(R.classLevel(at).level, level);
      assert.equal(R.classLevel(at - 1).level, level - 1);
      assert.equal(R.classLevel(at).into, 0);
    }
  });
  test("fractions of a point do not count; anything that is not experience is level 1", () => {
    assert.equal(R.classLevel(99.999).level, 1);
    for (const bad of [-5, NaN, Infinity, -Infinity, "500", null, undefined, {}, [300]]) assert.deepEqual(R.classLevel(bad), { level: 1, into: 0, need: 100 });
  });
  test("the most experience a save can hold still has a level", () => {
    const { level } = R.classLevel(Number.MAX_SAFE_INTEGER);
    assert.ok(Number.isInteger(level) && level > 1e7);
  });
});

describe("skill points and ranks", () => {
  test("a point a level past 1, a rank costs one, five ranks at most", () => {
    const p = fresh();
    p.xp.wizard = R.xpFor(4, 100); // level 4: 3 points
    assert.equal(R.pointsEarned(p.xp.wizard), 3);
    assert.equal(R.pointsLeft(p, "wizard"), 3);
    assert.ok(R.raise(p, "wizard", "power"));
    assert.ok(R.raise(p, "wizard", "power"));
    assert.ok(R.raise(p, "wizard", "crit"));
    assert.equal(R.pointsLeft(p, "wizard"), 0);
    assert.equal(R.raise(p, "wizard", "haste"), false, "no point left");
    assert.deepEqual(p.skills.wizard, { power: 2, haste: 0, crit: 1 });
  });
  test("no rank past MAX_RANK", () => {
    const p = fresh();
    p.xp.archer = R.xpFor(20, 100);
    for (let i = 0; i < 5; i++) assert.ok(R.raise(p, "archer", "haste"));
    assert.equal(R.raise(p, "archer", "haste"), false);
    assert.equal(p.skills.archer.haste, R.MAX_RANK);
  });
  test("reset gives every point back, and is a no-op with nothing spent", () => {
    const p = fresh();
    p.xp.healer = R.xpFor(3, 100);
    assert.equal(R.resetSkills(p, "healer"), false);
    R.raise(p, "healer", "power");
    assert.equal(R.pointsLeft(p, "healer"), 1);
    assert.ok(R.resetSkills(p, "healer"));
    assert.equal(R.pointsLeft(p, "healer"), 2);
  });
  test("points across all classes add up (the sign's star)", () => {
    const p = fresh();
    p.xp.wizard = R.xpFor(3, 100);
    p.xp.warrior = R.xpFor(5, 100);
    assert.equal(R.pointsLeftAll(p), 6);
  });
  test("unknown classes and skills are refused, not thrown", () => {
    const p = fresh();
    p.xp.wizard = R.xpFor(9, 100);
    for (const [cls, skill] of [["bard", "power"], ["wizard", "fly"], ["__proto__", "power"], ["constructor", "haste"], [undefined, undefined]]) {
      assert.equal(R.canRaise(p, cls, skill), false);
      assert.equal(R.raise(p, cls, skill), false);
    }
    assert.equal(R.resetSkills(p, "__proto__"), false);
  });
  test("what ranks give: Power +20%, Crit +5%, Haste a tick less (3s to 1.75s)", () => {
    assert.equal(R.powerOf({ power: 3 }), 1.6);
    close(R.critChanceOf({ crit: 5 }), 0.25);
    assert.deepEqual([0, 1, 2, 3, 4, 5].map((haste) => R.attackTicksOf({ haste })), [12, 11, 10, 9, 8, 7]);
    // a missing, broken or absurd rank counts as 0 or the most
    assert.equal(R.powerOf(undefined), 1);
    assert.equal(R.powerOf({ power: 2.5 }), 1);
    assert.equal(R.powerOf({ power: 99 }), 1 + 0.2 * R.MAX_RANK);
    assert.equal(R.attackTicksOf({ haste: -3 }), 12);
  });
});

describe("stages and the boss's numbers", () => {
  test("the kinds cycle slime, ogre, dragon", () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map(R.stageKind), ["slime", "ogre", "dragon", "slime", "ogre", "dragon", "slime"]);
  });
  test("a stage is a whole number from 1 to MAX_STAGE", () => {
    assert.equal(R.stageOf(7.9), 7);
    assert.equal(R.stageOf(5000), R.MAX_STAGE);
    for (const bad of [0, -3, NaN, Infinity, "4", null]) assert.equal(R.stageOf(bad), 1);
  });
  test("boss HP: 900 x 1.175^(s-1), as PLAN.md quotes (3.8K at 10, 43K at 25, 2.4M at 50)", () => {
    assert.equal(R.bossHp(1), 900);
    close(R.bossHp(2), 900 * 1.175);
    assert.equal(R.shortNumber(R.bossHp(10)), "3.8K");
    assert.equal(R.shortNumber(R.bossHp(25)), "43K");
    assert.equal(R.shortNumber(R.bossHp(50)), "2.4M");
    for (let s = 1; s < 60; s++) assert.ok(R.bossHp(s + 1) > R.bossHp(s));
  });
  test("bossOf gives the stage's boss at full HP", () => {
    assert.deepEqual(R.bossOf(5, 9), { kind: "ogre", hp: R.bossHp(5), maxHp: R.bossHp(5), stage: 5, id: 9 });
    assert.equal(R.bossOf("junk").stage, 1);
  });
  test("the boss's blow: 5 x 1.175^(s-1) x s^0.5", () => {
    assert.equal(R.stageDamage(1), 5);
    close(R.stageDamage(4), 5 * 1.175 ** 3 * 2);
  });
  test("gold: 0.5 per attacker x 1.23^(s-1), rounded down, never under 1", () => {
    assert.equal(R.stageGold(1, 4), 2);
    assert.equal(R.stageGold(1, 1), 1, "never under 1");
    assert.equal(R.stageGold(1), 2, "4 attackers when not told");
    assert.equal(R.stageGold(10, 4), Math.floor(2 * 1.23 ** 9));
    assert.equal(R.stageGold(10, 20), R.stageGold(10, 999), "a crowd past 20 pays as 20");
    for (const bad of [0, -2, NaN, "5", null]) assert.equal(R.stageGold(10, bad), R.stageGold(10, 1));
    assert.equal(R.stageGold(R.MAX_STAGE, 20), Number.MAX_SAFE_INTEGER, "capped, never Infinity");
    for (let s = 1; s < 40; s++) assert.ok(R.stageGold(s + 1, 4) >= R.stageGold(s, 4));
  });
  test("experience for a kill: 200 per attacker x 1.03^(s-1)", () => {
    assert.equal(R.stageXp(1, 2), 400);
    close(R.stageXp(11, 3), 600 * 1.03 ** 10);
    assert.equal(R.stageXp(1, 50), R.stageXp(1, R.MAX_GOLD_ATTACKERS));
  });
  test("a blow earns its share of the HP it took, never more than the whole", () => {
    const m = { maxHp: 1000, stage: 1 };
    close(R.blowXp(250, m, 4), 200);
    close(R.blowXp(5000, m, 4), 800);
    for (const bad of [0, -5, NaN, Infinity]) assert.equal(R.blowXp(bad, m), 0);
    assert.equal(R.blowXp(10, { maxHp: 0, stage: 1 }), 0);
    assert.equal(R.blowXp(10, null), 0);
  });
  test("credit: to the class and to you, and says who levelled", () => {
    const p = fresh();
    const m = { maxHp: 100, stage: 1 }; // a whole kill by 2 attackers: 400 xp
    assert.deepEqual(R.credit(p, "warrior", 100, m, 2), ["warrior", "you"]);
    assert.equal(p.xp.warrior, 400);
    assert.equal(p.xp.you, 400);
    assert.deepEqual(R.credit(p, "warrior", 0, m, 2), []);
    // an unknown class: only you
    assert.deepEqual(R.credit(p, "bard", 25, m, 2), []);
    assert.equal(p.xp.you, 500);
    assert.equal(p.xp.bard, undefined);
  });
  test("the time limit is 10 minutes at every stage", () => {
    for (const s of [1, 50, 999]) assert.equal(R.stageTime(s), 600000);
  });
});

describe("damage and max HP", () => {
  test("a blow: 10 x level bonus x Attack training x Power", () => {
    const p = fresh();
    assert.equal(R.damageOf(p, "warrior"), 10);
    p.xp.warrior = R.xpFor(11, 100); // level 11: x2.2
    close(R.damageOf(p, "warrior"), 22);
    p.training.warrior.attack = 2;
    close(R.damageOf(p, "warrior"), 22 * 1.12 ** 2);
    p.skills.warrior.power = 5;
    close(R.damageOf(p, "warrior"), 22 * 1.12 ** 2 * 2);
    assert.equal(R.damageOf(p, "bard"), R.BASE_DAMAGE);
  });
  test("a critical blow doubles, by the roll against the crit chance", () => {
    const p = fresh();
    p.skills.archer.crit = 2; // 10%
    assert.deepEqual(R.blow(p, "archer", 0.05), { damage: 20, crit: true });
    assert.deepEqual(R.blow(p, "archer", 0.1), { damage: 10, crit: false });
  });
  test("max HP: the class's base x level bonus x 1.12^Health", () => {
    const p = fresh();
    assert.deepEqual(Object.fromEntries(R.CLASSES.map((c) => [c, R.maxHpOf(p, c)])), { wizard: 100, healer: 100, warrior: 200, archer: 130 });
    p.xp.archer = R.xpFor(6, 100);
    p.training.archer.health = 3;
    close(R.maxHpOf(p, "archer"), 130 * 1.6 * 1.12 ** 3);
    assert.equal(R.maxHpOf(p, "ghost"), 100, "an unknown class has the lowest base");
    close(R.healOf(p, "archer"), R.maxHpOf(p, "archer"), 1e-12);
  });
  test("training bonuses are capped at MAX_TRAINING levels and never Infinity", () => {
    assert.equal(R.trainingBonus(5000), R.trainingBonus(R.MAX_TRAINING));
    assert.ok(Number.isFinite(R.trainingBonus(R.MAX_TRAINING)));
    assert.equal(R.healthBonus(-4), 1);
    assert.equal(R.trainingBonus(NaN), 1);
  });
});

describe("training", () => {
  test("prices: 5, then x1.45 a level, rounded down; each kind on its own level", () => {
    assert.deepEqual([0, 1, 2, 3, 4].map(R.trainingPrice), [5, 7, 10, 15, 22]);
    assert.equal(R.trainingPrice(R.MAX_TRAINING), Number.MAX_SAFE_INTEGER);
  });
  test("buying takes the price and raises that kind one level", () => {
    const p = fresh();
    p.gold = 12;
    assert.ok(R.train(p, "wizard", "attack"));
    assert.equal(p.gold, 7);
    assert.ok(R.train(p, "wizard", "health"));
    assert.equal(p.gold, 2);
    assert.deepEqual(p.training.wizard, { attack: 1, health: 1 });
    assert.equal(R.train(p, "wizard", "attack"), false, "7 gold short");
    assert.equal(p.gold, 2);
  });
  test("no kind, class or gold that is not there", () => {
    const p = fresh();
    p.gold = 1e6;
    for (const [c, k] of [["wizard", "magic"], ["bard", "attack"], ["__proto__", "attack"], ["wizard", "__proto__"]]) assert.equal(R.train(p, c, k), false);
    assert.equal(p.gold, 1e6);
  });
  test("capped at MAX_TRAINING", () => {
    const p = fresh();
    p.gold = Number.MAX_SAFE_INTEGER;
    p.training.healer.attack = R.MAX_TRAINING;
    assert.equal(R.canTrain(p, "healer", "attack"), false);
    p.training.healer.attack = R.MAX_TRAINING - 1;
    p.gold = R.trainingPrice(R.MAX_TRAINING - 1);
    assert.ok(R.train(p, "healer", "attack"));
    assert.equal(R.trainingOf(p, "healer", "attack"), R.MAX_TRAINING);
  });
  test("buying for a class with no training yet makes its record", () => {
    const p = fresh();
    delete p.training.archer;
    p.gold = 5;
    assert.ok(R.train(p, "archer", "health"));
    assert.deepEqual(p.training.archer, { attack: 0, health: 1 });
  });
});

describe("picking, clearing and failing stages", () => {
  test("selectStage: 1 to best, not the one it is on; it ends farming", () => {
    const p = fresh();
    Object.assign(p, { stage: 4, best: 6, farming: true });
    for (const bad of [0, 7, 4, 2.5, "3", NaN, -1]) assert.equal(R.selectStage(p, bad), false, String(bad));
    assert.equal(p.farming, true);
    assert.ok(R.selectStage(p, 6));
    assert.deepEqual([p.stage, p.farming], [6, false]);
    assert.ok(R.selectStage(p, 1));
  });
  test("a kill pays, counts its kind and reaches the next stage; advancing moves on", () => {
    const p = fresh();
    R.slay(p, R.bossOf(1), true, 4);
    assert.deepEqual([p.slain, p.kills.slime, p.gold, p.best, p.stage], [1, 1, 2, 2, 2]);
  });
  test("with advance off a kill repeats the stage (but still reaches the next)", () => {
    const p = fresh();
    R.slay(p, R.bossOf(1), false, 4);
    assert.deepEqual([p.stage, p.best], [1, 2]);
  });
  test("a kill below the best does not move the best", () => {
    const p = fresh();
    Object.assign(p, { stage: 2, best: 9 });
    R.slay(p, R.bossOf(2), true);
    assert.deepEqual([p.stage, p.best], [3, 9]);
  });
  test("failStage: where a failed attempt goes (the rule is afterFail in view/expect.mjs), and kills there repeat it", () => {
    for (const [stage, best] of [[8, 8], [5, 8], [2, 2], [1, 1], [1, 5]]) {
      const p = fresh();
      Object.assign(p, { stage, best });
      const want = afterFail(stage, best);
      assert.equal(R.failStage(p), want.stage, `${stage} of ${best}`);
      assert.deepEqual([p.stage, p.best], [want.stage, best]);
      if (want.farming !== null) assert.equal(p.farming, want.farming, `${stage} of ${best}`);
    }
    // farming: kills repeat the stage whatever the setting says; the next arrow ends it
    const p = fresh();
    Object.assign(p, { stage: 8, best: 8 });
    R.failStage(p);
    R.slay(p, R.bossOf(p.stage), true);
    assert.deepEqual([p.stage, p.farming], [afterFail(8, 8).stage, true]);
    assert.ok(R.selectStage(p, 8));
    assert.equal(p.farming, false);
  });
  test("a kill at the last stage stays there", () => {
    const p = fresh();
    Object.assign(p, { stage: R.MAX_STAGE, best: R.MAX_STAGE });
    R.slay(p, R.bossOf(R.MAX_STAGE), true, 4);
    assert.deepEqual([p.stage, p.best], [R.MAX_STAGE, R.MAX_STAGE]);
  });
  test("counts never pass the safe integer limit", () => {
    const p = fresh();
    p.slain = Number.MAX_SAFE_INTEGER;
    p.gold = Number.MAX_SAFE_INTEGER;
    R.slay(p, R.bossOf(50), true, 20);
    assert.equal(p.slain, Number.MAX_SAFE_INTEGER);
    assert.equal(p.gold, Number.MAX_SAFE_INTEGER);
  });
});

describe("attack timing", () => {
  test("attackGap: the rank's gap give or take 2, never under the floor", () => {
    for (let haste = 0; haste <= 5; haste++) {
      const base = R.attackTicksOf({ haste });
      const gaps = new Set();
      for (let i = 0; i < 1000; i++) gaps.add(R.attackGap({ haste }, i / 1000));
      assert.ok(Math.min(...gaps) >= R.MIN_ATTACK_TICKS);
      assert.ok(Math.max(...gaps) <= base + 2);
      const mean = [...Array(1000).keys()].reduce((s, i) => s + R.attackGap({ haste }, (i + 0.5) / 1000), 0) / 1000;
      close(mean, base, 0.01);
    }
  });
  test("firstAttack is somewhere in the first gap", () => {
    for (let i = 0; i < 100; i++) {
      const t = R.firstAttack({}, i / 100);
      assert.ok(t >= 1 && t <= 12);
    }
  });
});

describe("shortNumber", () => {
  const cases = [
    [0, "0"], [0.4, "0"], [0.5, "1"], [7, "7"], [999, "999"], [999.4, "999"], [999.5, "1K"],
    [1000, "1K"], [1049, "1K"], [1050, "1.1K"], [1234, "1.2K"], [9949, "9.9K"], [9950, "10K"], [12345, "12K"],
    [345678, "346K"], [999499, "999K"], [999500, "1M"], [1.25e6, "1.3M"], [3.4e9, "3.4B"], [5.6e12, "5.6T"],
    [999.4e12, "999T"], [999.5e12, "1E15"], [1e15, "1E15"], [1.234e18, "1.2E18"], [9.96e20, "1E21"], [Number.MAX_VALUE, "1.8E308"],
  ];
  for (const [n, s] of cases) test(`${n} is "${s}"`, () => assert.equal(R.shortNumber(n), s));
  test("anything that is not a number from 0 up is 0", () => {
    for (const bad of [-1, -0.5, NaN, Infinity, -Infinity, "12", null, undefined, {}, 10n]) assert.equal(R.shortNumber(bad), "0");
  });
  test("never longer than 6 characters below 1E100 (7 past it), and only in the pixel font's characters", () => {
    for (let n = 0.3; n < 1e300; n = n * 1.173 + 0.7) {
      const s = R.shortNumber(n);
      assert.ok(s.length <= (n < 9.95e99 ? 6 : 7), `${n}: ${s}`);
      assert.ok([...s].every((ch) => R.GLYPHS.includes(ch)), `${n}: ${s}`);
    }
  });
  test("it never goes down as the number goes up", () => {
    const value = (s) => {
      const m = /^([\d.]+)(K|M|B|T|E(\d+))?$/.exec(s);
      const pow = { K: 3, M: 6, B: 9, T: 12 };
      return Number(m[1]) * 10 ** (m[3] ? Number(m[3]) : (pow[m[2]] ?? 0));
    };
    let last = 0;
    for (let n = 1; n < 1e30; n *= 1.0137) {
      const v = value(R.shortNumber(n));
      assert.ok(v >= last, `${n}: ${R.shortNumber(n)} after ${last}`);
      last = v;
    }
  });
});

describe("clockText", () => {
  const cases = [[600000, "10:00"], [599001, "10:00"], [599000, "9:59"], [582000, "9:42"], [60000, "1:00"], [59001, "1:00"], [1000, "0:01"], [1, "0:01"], [0, "0:00"], [3600000, "60:00"]];
  for (const [ms, s] of cases) test(`${ms}ms is ${s}`, () => assert.equal(R.clockText(ms), s));
  test("anything that is not a time from 0 up is 0:00", () => {
    for (const bad of [-1, NaN, Infinity, "600000", null, undefined]) assert.equal(R.clockText(bad), "0:00");
  });
  test("every time it writes can be lettered", () => {
    for (let ms = 0; ms <= 600000; ms += 250) assert.ok(R.letterable(R.clockText(ms)));
  });
});

describe("labels", () => {
  test("every HUD label can be lettered, with any stage and countdown", () => {
    for (const n of [1, 9, 10, 99, 100, 999, R.MAX_STAGE]) {
      for (const text of [R.LABELS.title, R.LABELS.start, R.LABELS.stop, R.LABELS.empty, R.LABELS.farm, R.LABELS.stage(n), R.LABELS.timesUp, R.LABELS.wiped, R.LABELS.back(R.LABELS.timesUp, n), R.LABELS.back(R.LABELS.wiped, n), R.LABELS.moving(n, 5)])
        assert.ok(R.letterable(text), text);
    }
  });
  test("the settings list has a key, a name and a boolean default each", () => {
    assert.deepEqual(R.SETTINGS.map((s) => [s.key, typeof s.name, s.default]), [["damageNumbers", "string", true], ["advance", "string", true]]);
  });
});
