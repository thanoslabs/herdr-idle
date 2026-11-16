// party.js: the boss's attacks on the party, HP, knockouts and rest, everyone
// down at once (no wipe), healing, joining and leaving.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as P from "../mods/idle-rpg/party.js";
import { seeded } from "./harness/clock.mjs";

// A party of `n` at full HP, spaced 200px apart along the floor (no two in one area attack).
function party(n = 3, { hp = 100, x0 = 0, gap = 200, y = 60 } = {}) {
  const p = P.newParty();
  P.syncParty(p, Array.from({ length: n }, (_, i) => ({ key: `k${i}`, maxHp: hp, x: x0 + i * gap, y })), 0, seeded(1));
  return p;
}
// A random source that returns these numbers in turn (then the last again).
const draws = (...xs) => {
  let i = 0;
  return () => xs[Math.min(i++, xs.length - 1)];
};
// Forces the boss's next attack: kind, target, landing on tick `lands`.
function aim(p, kind, target, tick = 1) {
  const m = p.members[target];
  p.foe.pending = { id: 99, kind, target, x: m.x, y: m.y, start: tick - 1, lands: tick };
  p.foe.next = tick + 100;
}

describe("joining and leaving", () => {
  test("newcomers join at full HP; the first attack is set within a gap, and the singles before the area drawn", () => {
    const p = P.newParty();
    const { joined, left } = P.syncParty(p, [{ key: "a", maxHp: 120, x: 1, y: 2 }], 10, draws(0, 0.99));
    assert.deepEqual([joined, left], [["a"], []]);
    assert.deepEqual(p.members.a, { hp: 120, maxHp: 120, x: 1, y: 2, down: null, hitAt: null, healedAt: null });
    assert.equal(p.foe.next, 10 + P.FIRST_ATTACK_TICKS);
    assert.equal(p.foe.singles, 3);
  });
  test("firstGap is FIRST_ATTACK_TICKS to a whole gap, evenly", () => {
    assert.equal(P.firstGap(() => 0), P.FIRST_ATTACK_TICKS);
    assert.equal(P.firstGap(() => 0.9999), P.MONSTER_ATTACK_TICKS);
  });
  test("leavers go, and come back within the attempt as they left: the HP lost kept, a rest not cut short", () => {
    const p = party(3);
    p.members.k1.hp = 30;
    Object.assign(p.members.k2, { hp: 0, down: 5 + 80 });
    const k0 = [{ key: "k0", maxHp: 100, x: 0, y: 60 }];
    assert.deepEqual(P.syncParty(p, k0, 5, seeded(2)).left, ["k1", "k2"]);
    assert.equal("k1" in p.members, false);
    assert.deepEqual({ ...p.away.k1 }, { hp: 30, maxHp: 100, rest: null });
    assert.deepEqual({ ...p.away.k2 }, { hp: 0, maxHp: 100, rest: 80 });
    // away 200 ticks: the rest is frozen, not run down
    const back = [...k0, { key: "k1", maxHp: 120, x: 9, y: 9 }, { key: "k2", maxHp: 100, x: 9, y: 9 }];
    assert.deepEqual(P.syncParty(p, back, 205, seeded(2)).joined, ["k1", "k2"]);
    assert.equal(p.members.k1.hp, 50, "the HP lost kept, a rise in max HP added");
    assert.deepEqual([p.members.k2.hp, p.members.k2.down], [0, 205 + 80]);
    assert.equal(P.standing(p, "k2"), false);
    assert.deepEqual(Object.keys(p.away), [], "taken back");
  });
  test("a new attempt forgets who left: they come back fresh", () => {
    const p = party(2);
    Object.assign(p.members.k1, { hp: 0, down: 90 });
    P.syncParty(p, [{ key: "k0", maxHp: 100, x: 0, y: 60 }], 5, seeded(2));
    P.resetParty(p, 6, seeded(2));
    P.syncParty(p, [{ key: "k0", maxHp: 100, x: 0, y: 60 }, { key: "k1", maxHp: 100, x: 9, y: 9 }], 7, seeded(2));
    assert.deepEqual([p.members.k1.hp, p.members.k1.down], [100, null]);
    assert.equal(Object.getPrototypeOf(p.away), null, "no prototype");
  });
  test("once nobody is left, the attack under way and the last one go with them", () => {
    const p = party(1);
    aim(p, "single", "k0", 5);
    p.foe.last = { id: 1 };
    P.syncParty(p, [], 3, seeded(1));
    assert.deepEqual([p.foe.next, p.foe.pending, p.foe.last], [null, null, null]);
  });
  test("a change of max HP keeps the HP lost: a rise adds, a fall cuts", () => {
    const p = party(1);
    p.members.k0.hp = 70;
    P.syncParty(p, [{ key: "k0", maxHp: 150, x: 0, y: 60 }], 1, seeded(1));
    assert.equal(p.members.k0.hp, 120);
    P.syncParty(p, [{ key: "k0", maxHp: 50, x: 0, y: 60 }], 2, seeded(1));
    assert.equal(p.members.k0.hp, 50);
  });
  test("odd fighters are skipped or made safe", () => {
    const p = P.newParty();
    P.syncParty(p, [null, { key: 5 }, { key: "a", maxHp: -4 }, { key: "a", maxHp: 50 }, { key: "__proto__", maxHp: 10, x: 0, y: 0 }, { key: "b", maxHp: Infinity }, { key: "c", maxHp: 1e308 }], 0, seeded(1));
    assert.deepEqual(Object.keys(p.members), ["a", "__proto__", "b", "c"]);
    assert.equal(p.members.a.maxHp, 1, "a maxHp that is not one is 1; the repeat is ignored");
    assert.equal(p.members.b.maxHp, 1, "Infinity is not a max HP either");
    assert.equal(p.members.c.maxHp, 1e308);
    assert.equal(Object.getPrototypeOf(p.members), null);
    assert.deepEqual(P.syncParty(p, "nonsense", 1, seeded(1)).left.length, 4);
  });
});

describe("the boss's attacks", () => {
  test("it only ever aims at someone standing", () => {
    const p = party(3);
    p.members.k0.down = 500;
    p.members.k2.down = 500;
    const rnd = seeded(3);
    for (let t = 1; t < 400; t++) {
      const e = P.monsterTick(p, t, 1, rnd);
      if (e.started) assert.equal(e.started.target, "k1");
      if (t > 300) p.members.k1.hp = 100; // keep it standing
    }
  });
  test("a single blow lands on its target only, after its wind-up", () => {
    const p = party(3, { gap: 0 }); // all on one spot: an area would hit all three
    p.foe.next = 1;
    p.foe.singles = 2;
    const e1 = P.monsterTick(p, 1, 40, draws(0.5));
    assert.equal(e1.started.kind, "single");
    assert.equal(e1.started.lands, 1 + P.SINGLE_WINDUP_TICKS);
    const e2 = P.monsterTick(p, 1 + P.SINGLE_WINDUP_TICKS, 40, draws(0.5));
    assert.equal(e2.hits.length, 1);
    assert.equal(e2.hits[0].key, e1.started.target);
    assert.equal(p.foe.singles, 1);
  });
  test("after its singles comes an area attack, marked for a second first", () => {
    const p = party(1);
    p.foe.next = 1;
    p.foe.singles = 0;
    const e = P.monsterTick(p, 1, 1, draws(0));
    assert.equal(e.started.kind, "area");
    assert.equal(e.started.lands - e.started.start, P.AREA_WARNING_TICKS);
    assert.ok(P.SINGLES_BETWEEN.includes(p.foe.singles));
  });
  test("the area is an ellipse: 70px either side, half that up and down the floor", () => {
    const p = P.newParty();
    const spots = { c: [0, 0], e: [70, 0], out: [71, 0], n: [0, 35], nOut: [0, 36], diag: [49, 24], diagOut: [50, 25], bad: [NaN, 0] };
    P.syncParty(p, Object.entries(spots).map(([key, [x, y]]) => ({ key, maxHp: 10, x: 500 + x, y: 50 + y })), 0, seeded(1));
    assert.deepEqual(P.inArea(p, 500, 50).sort(), ["c", "diag", "e", "n"]);
    assert.deepEqual(P.inArea(p, NaN, 50), []);
    p.members.c.down = 99;
    assert.equal(P.inArea(p, 500, 50).includes("c"), false, "the knocked out are not hit");
  });
  test("an area attack hits everyone inside it at its spot, even if its target moved", () => {
    const p = party(3, { gap: 40 }); // k0 0, k1 40, k2 80
    aim(p, "area", "k1", 4);
    p.members.k1.x = 900;
    const e = P.monsterTick(p, 4, 10, seeded(1));
    assert.deepEqual(e.hits.map((h) => h.key).sort(), ["k0", "k2"]);
  });
  test("a single blow whose target left or fell lands on nobody", () => {
    const p = party(2);
    aim(p, "single", "k1", 3);
    p.members.k1.down = 10;
    assert.deepEqual(P.monsterTick(p, 3, 999, seeded(1)).hits, []);
  });
  test("the gap between attacks is 4s give or take 2 ticks, never under the floor", () => {
    const seen = new Set();
    for (let i = 0; i < 50; i++) seen.add(P.monsterGap(() => i / 50));
    assert.deepEqual([...seen].sort((a, b) => a - b), [14, 15, 16, 17, 18]);
    assert.ok(P.monsterGap(() => NaN) >= P.MIN_MONSTER_TICKS);
    assert.ok(P.monsterGap(() => -5) >= P.MIN_MONSTER_TICKS);
  });
});

describe("damage by party size", () => {
  test("a blow does (n / 4) of the stage's damage to each it hits, n those standing", () => {
    assert.equal(P.hitDamage(100, 4), 100);
    assert.equal(P.hitDamage(100, 1), 25);
    assert.equal(P.hitDamage(100, 8), 200);
    assert.equal(P.hitDamage(100, 2.9), 50, "a whole number of attackers");
  });
  test("odd inputs: no damage, or one attacker, never NaN or Infinity", () => {
    for (const d of [0, -1, NaN, "5", null]) assert.equal(P.hitDamage(d, 3), 0);
    for (const n of [0, -2, NaN, undefined]) assert.equal(P.hitDamage(100, n), 25);
    assert.equal(P.hitDamage(Number.MAX_VALUE, 1e300), Number.MAX_VALUE);
  });
  test("the knocked out do not count: a blow scales by those standing", () => {
    const p = party(4, { gap: 0, hp: 1000 });
    p.members.k2.down = p.members.k3.down = 500;
    aim(p, "single", "k0", 2);
    assert.equal(P.monsterTick(p, 2, 40, seeded(1)).hits[0].damage, 20);
  });
  test("the standing count is taken before this blow's knockouts", () => {
    const p = party(4, { gap: 0, hp: 10 });
    aim(p, "area", "k0", 2);
    const e = P.monsterTick(p, 2, 40, seeded(1));
    assert.ok(e.hits.every((h) => h.damage === 40 && h.down));
  });
});

describe("knockouts and rest", () => {
  test("at 0 HP a character is down for KO_TICKS, then up at full HP", () => {
    const p = party(2);
    aim(p, "single", "k0", 5);
    const e = P.monsterTick(p, 5, 1000, seeded(1));
    assert.deepEqual(e.hits[0], { key: "k0", damage: 500, hp: 0, down: true });
    assert.equal(p.members.k0.down, 5 + P.KO_TICKS);
    assert.equal(P.standing(p, "k0"), false);
    assert.deepEqual(P.down(p), ["k0"]);
    assert.deepEqual(P.rise(p, 5 + P.KO_TICKS - 1), []);
    assert.deepEqual(P.rise(p, 5 + P.KO_TICKS), ["k0"]);
    assert.equal(p.members.k0.hp, 100);
  });
  test("monsterTick gets the rested up first, so they can be hit on that tick", () => {
    const p = party(2);
    p.members.k0.down = 7;
    p.members.k0.hp = 0;
    aim(p, "single", "k0", 7);
    const e = P.monsterTick(p, 7, 4, seeded(1));
    assert.deepEqual(e.back, ["k0"]);
    assert.equal(e.hits[0].key, "k0");
  });
  test("restSeconds counts whole seconds down from 30, rounded up", () => {
    const p = party(1);
    p.members.k0.down = 200;
    assert.equal(P.restSeconds(p, "k0", 200 - P.KO_TICKS), 30);
    assert.equal(P.restSeconds(p, "k0", 200 - 4), 1);
    assert.equal(P.restSeconds(p, "k0", 200 - 5), 2);
    assert.equal(P.restSeconds(p, "k0", 200), 0);
    assert.equal(P.restSeconds(p, "k0", -1e9), 30, "never more than the rest");
    assert.equal(P.restSeconds(p, "nobody", 10), 0);
    assert.equal(P.restSeconds(p, "__proto__", 10), 0);
    assert.equal(P.restSeconds(p, "k0", NaN), 0);
    assert.equal(P.restLeft(p, "k0", 200 - P.KO_TICKS / 2), 0.5);
  });
  test("resetParty: everyone up at full HP, no attack under way", () => {
    const p = party(2);
    p.members.k0.down = 50;
    p.members.k0.hp = 0;
    p.members.k1.hp = 3;
    p.members.k1.hitAt = 4;
    aim(p, "single", "k1", 9);
    P.resetParty(p, 20, draws(0.2, 0));
    assert.deepEqual(Object.values(p.members).map((m) => [m.hp, m.down, m.hitAt]), [[100, null, null], [100, null, null]]);
    assert.deepEqual([p.foe.pending, p.foe.last, p.foe.next], [null, null, 20 + P.FIRST_ATTACK_TICKS]);
    const empty = P.newParty();
    P.resetParty(empty, 5, seeded(1));
    assert.equal(empty.foe.next, null);
  });
});

describe("everyone down at once", () => {
  test("the blow that knocks out the last one standing ends nothing: no wipe, no new attack, and they rest", () => {
    const p = party(2);
    p.members.k1.down = 999;
    aim(p, "single", "k0", 3);
    const e = P.monsterTick(p, 3, 10000, seeded(1));
    assert.deepEqual(Object.keys(e).sort(), ["back", "hits", "landed", "started"], "no wipe in what it returns");
    assert.equal(e.hits[0].down, true);
    assert.equal(e.started, null, "nobody to aim at");
    assert.deepEqual(P.up(p), []);
    assert.equal(p.members.k0.down, 3 + P.KO_TICKS);
  });
  test("an area attack that knocks out everyone at once: they all rest, and all get up at full HP", () => {
    const p = party(3, { gap: 0, hp: 5 });
    aim(p, "area", "k0", 3);
    const e = P.monsterTick(p, 3, 400, seeded(1));
    assert.ok(e.hits.length === 3 && e.hits.every((h) => h.down));
    for (let t = 4; t < 3 + P.KO_TICKS; t++) assert.deepEqual(P.monsterTick(p, t, 400, seeded(t)).hits, []);
    const back = P.monsterTick(p, 3 + P.KO_TICKS, 400, seeded(1));
    assert.deepEqual(back.back, ["k0", "k1", "k2"]);
    assert.ok(Object.values(p.members).every((m) => m.hp === 5 && m.down === null));
  });
  test("while nobody stands the boss waits, and strikes FIRST_ATTACK_TICKS after the last tick nobody stood", () => {
    const p = party(2);
    for (const m of Object.values(p.members)) Object.assign(m, { hp: 0, down: 40 });
    p.members.k1.down = 60;
    p.foe.next = 10;
    for (let t = 10; t < 40; t++) {
      const e = P.monsterTick(p, t, 10, seeded(t));
      assert.equal(e.started, null, `no attack at ${t}`);
      assert.equal(p.foe.next, t + P.FIRST_ATTACK_TICKS, "kept off a tick at a time");
    }
    for (let t = 40; t < 40 + P.FIRST_ATTACK_TICKS - 1; t++) assert.equal(P.monsterTick(p, t, 10, seeded(1)).started, null);
    const e = P.monsterTick(p, 40 + P.FIRST_ATTACK_TICKS - 1, 10, seeded(1));
    assert.equal(e.started?.target, "k0", "the one who got up");
    // an attack further off than that is left alone
    const q = party(1);
    Object.assign(q.members.k0, { hp: 0, down: 500 });
    q.foe.next = 30;
    P.monsterTick(q, 5, 10, seeded(1));
    assert.equal(q.foe.next, 30);
  });
  test("putting the attack off draws nothing from the random source", () => {
    const p = party(1);
    Object.assign(p.members.k0, { hp: 0, down: 500 });
    p.foe.next = 1;
    let drawn = 0;
    for (let t = 1; t < 100; t++)
      P.monsterTick(p, t, 10, () => {
        drawn += 1;
        return 0.5;
      });
    assert.equal(drawn, 0);
  });
  test("a blow already under way when the last one falls lands on nobody", () => {
    const p = party(2);
    p.members.k1.down = 999;
    p.members.k1.hp = 0;
    aim(p, "single", "k1", 3);
    assert.deepEqual(P.monsterTick(p, 3, 10000, seeded(1)).hits, []);
  });
});

describe("healing", () => {
  test("the rhythm: HEAL_GAP_TICKS (6s), half that with the Heal Vial, whatever else the healer holds", () => {
    assert.equal(P.HEAL_GAP_TICKS, 24);
    assert.equal(P.HEAL_VIAL_GAP_TICKS, P.HEAL_GAP_TICKS / 2);
    assert.equal(P.healTicks(P.HEAL_POTION), P.HEAL_VIAL_GAP_TICKS);
    for (const potion of ["haste", "might", "hex", undefined, null, "nonsense"]) assert.equal(P.healTicks(potion), P.HEAL_GAP_TICKS, String(potion));
  });
  test("healGap is the mean give or take HEAL_JITTER, evenly, a real number, never under a tick", () => {
    assert.equal(P.healGap(24, 0), 24 - P.HEAL_JITTER);
    assert.equal(P.healGap(24, 1), 24 + P.HEAL_JITTER);
    assert.equal(P.healGap(24, 0.5), 24);
    assert.equal(P.healGap(24, 0.25), 23);
    let sum = 0;
    for (let i = 0; i < 1000; i++) sum += P.healGap(12, (i + 0.5) / 1000);
    assert.ok(Math.abs(sum / 1000 - 12) < 1e-9, "its mean is the mean");
    for (const bad of [NaN, -3, 9, undefined]) assert.ok(Number.isFinite(P.healGap(24, bad)) && P.healGap(24, bad) >= 22 && P.healGap(24, bad) <= 26);
    assert.ok(P.healGap(1, 0) >= 1 && P.healGap(0, 0) > 0 && P.healGap(NaN, 0.5) === P.HEAL_GAP_TICKS);
  });
  test("firstHeal is anywhere in the first gap, from one tick", () => {
    assert.equal(P.firstHeal(24, 0), 1);
    assert.equal(P.firstHeal(24, 1), 24);
    assert.ok(Number.isFinite(P.firstHeal(24, NaN)) && P.firstHeal(24, NaN) >= 1);
  });
  test("the target: the standing one lowest for its max, anyone under full; the first joined on a tie", () => {
    const p = party(4);
    assert.equal(P.healTarget(p), null, "nobody hurt: no throw");
    p.members.k1.hp = 99;
    assert.equal(P.healTarget(p), "k1", "anyone under full");
    p.members.k2.hp = 99;
    assert.equal(P.healTarget(p), "k1", "a tie: the first to join");
    p.members.k3.hp = 30;
    p.members.k3.down = 50; // the knocked out are never healed
    assert.equal(P.healTarget(p), "k1");
    p.members.k0.hp = 20;
    assert.equal(P.healTarget(p), "k0");
  });
  test("two healers pick different allies while another qualifies", () => {
    const p = party(3);
    p.members.k1.hp = 10;
    p.members.k2.hp = 40;
    assert.equal(P.healTarget(p, ["k1"]), "k2");
    p.members.k2.hp = 100;
    assert.equal(P.healTarget(p, ["k1"]), "k1", "nobody else qualifies: the same one");
  });
  test("nobody standing, or nobody in the fight: nobody to heal", () => {
    const p = party(2);
    for (const m of Object.values(p.members)) Object.assign(m, { hp: 0, down: 9 });
    assert.equal(P.healTarget(p), null);
    assert.equal(P.healTarget(P.newParty()), null);
    assert.equal(P.healTarget(party(1), "not a list"), null);
  });
  test("healParty restores up to the max, nothing to the down or the gone", () => {
    const p = party(2);
    p.members.k0.hp = 70;
    assert.equal(P.healParty(p, "k0", 50, 8), 30);
    assert.deepEqual([p.members.k0.hp, p.members.k0.healedAt], [100, 8]);
    assert.equal(P.healParty(p, "k0", 50, 9), 0, "already full");
    assert.equal(p.members.k0.healedAt, 8);
    p.members.k1.down = 40;
    p.members.k1.hp = 0;
    assert.equal(P.healParty(p, "k1", 50, 9), 0);
    assert.equal(P.healParty(p, "ghost", 50, 9), 0);
    for (const bad of [-5, NaN, "9"]) assert.equal(P.healParty(p, "k0", bad, 9), 0);
  });
  test("the old rules are gone: no heals() and no HEAL_BELOW", () => {
    assert.equal(P.heals, undefined);
    assert.equal(P.HEAL_BELOW, undefined);
  });
});

describe("determinism", () => {
  const run = (seed) => {
    const p = party(5, { gap: 30 });
    const rnd = seeded(seed);
    const log = [];
    for (let t = 1; t < 2000; t++) {
      const e = P.monsterTick(p, t, 30, rnd);
      log.push(JSON.stringify([e.back, e.hits, e.started?.kind, e.started?.target]));
    }
    return log;
  };
  test("the same draws give the same fight", () => {
    assert.deepEqual(run(11), run(11));
    assert.notDeepEqual(run(11), run(12));
  });
  test("a bad random source never breaks it", () => {
    const p = party(3);
    for (const r of [() => NaN, () => -1, () => 7, () => undefined]) for (let t = 1; t < 100; t++) P.monsterTick(p, t, 1, r);
    assert.ok(Object.values(p.members).every((m) => Number.isFinite(m.hp)));
  });
});
