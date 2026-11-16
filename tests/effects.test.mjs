// effects.js: what weapons do in a fight: weapon factors and cadence, the
// equal damage per second of plain weapons, weaknesses, the four statuses,
// the vials' auras, experience shares, and the shop's lines.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as E from "../mods/idle-rpg/effects.js";
import * as R from "../mods/idle-rpg/rules.js";
import { seeded } from "./harness/clock.mjs";

const THOROUGH = Boolean(process.env.HERDR_TESTS_THOROUGH);
const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) <= eps * Math.max(1, Math.abs(b)), `${a} is not ${b}`);
const never = () => 0.999999; // no crit, no chain
const always = () => 0; // crit and chain whenever they can
const blow = (o = {}) => ({ cls: "warrior", weapon: "default", damage: 100, critChance: 0, ...o });

describe("weapons", () => {
  test("every catalogue weapon has stats: a factor, its element, the healer's potion", () => {
    for (const c of R.CLASSES)
      for (const it of R.catalogue(c, "weapon")) {
        const s = E.statsOf(c, it.id);
        assert.equal(s.id, it.id);
        assert.ok(s.factor > 0 && Number.isFinite(s.factor), `${c} ${it.id}`);
        assert.ok(Object.hasOwn(E.WEAPON_FACTORS[c], it.id), `${c} ${it.id} has no factor in WEAPON_FACTORS`);
        assert.equal(s.element, it.element);
        assert.equal(s.potion, it.potion ?? null);
      }
  });
  test("the factors PLAN.md lists", () => {
    const f = (c, w) => E.gapFactor(c, w);
    assert.deepEqual([f("warrior", "default"), f("warrior", "axe"), f("warrior", "hammer"), f("warrior", "flame")], [1, 1.5, 2, 1]);
    assert.deepEqual([f("wizard", "frost"), f("wizard", "storm"), f("wizard", "venom")], [0.75, 1, 0.75]);
    assert.deepEqual([f("archer", "crossbow"), f("healer", "might")], [2, 1]);
  });
  test("an unknown weapon is the class's default; an unknown class is plain, with no class", () => {
    assert.deepEqual(E.statsOf("archer", "laser"), E.statsOf("archer", "default"));
    assert.deepEqual(E.statsOf("archer", "__proto__"), E.statsOf("archer", "default"));
    assert.deepEqual(E.statsOf("bard", "axe"), { cls: null, id: "default", factor: 1, element: null, potion: null });
  });
});

describe("cadence and its floor", () => {
  test("the gap is the class's times the weapon's factor; damage scales the same", () => {
    assert.deepEqual(E.cadence(12, "warrior", "hammer", {}), { ticks: 24, factor: 2, haste: 0 });
    assert.deepEqual(E.cadence(12, "wizard", "frost", {}), { ticks: 9, factor: 0.75, haste: 0 });
  });
  test("the haste aura takes 15% off the class's gap before the weapon's factor", () => {
    const c = E.cadence(12, "archer", "crossbow", { haste: true });
    close(c.ticks, 12 * 0.85 * 2);
    close(c.factor, 2);
    close(c.haste, 0.15);
  });
  test("no gap under MIN_ATTACK_TICKS: a fast weapon is held there and hits harder to match", () => {
    const c = E.cadence(7, "wizard", "venom", {}); // 5.25 ticks wanted
    assert.equal(c.ticks, R.MIN_ATTACK_TICKS);
    close(c.factor, 6 / 7);
    const h = E.cadence(7, "warrior", "default", { haste: true }); // 5.95: held at 6
    assert.equal(h.ticks, 6);
    close(h.haste, 1 - 6 / 7, 1e-12);
    assert.equal(E.cadence(6, "warrior", "default", { haste: true }).haste, 0, "nothing to take off at the floor");
  });
  test("odd inputs: the default gap, never under the floor, never Infinity", () => {
    for (const b of [0, -3, NaN, undefined, "12"]) assert.deepEqual(E.cadence(b, "warrior", "default", {}), E.cadence(12, "warrior", "default", {}));
    assert.ok(Number.isFinite(E.cadence(Infinity, "warrior", "hammer", null).ticks));
    assert.deepEqual(E.cadence(12, "warrior", "default", { haste: "yes" }), E.cadence(12, "warrior", "default", {}), "only a true aura counts");
  });
  test("nextGap: its mean give or take 2, never under the floor, and a bad draw is the mean", () => {
    assert.equal(E.nextGap(12, 0), 10);
    assert.equal(E.nextGap(12, 1), 14);
    assert.equal(E.nextGap(7, 0), 6, "spread narrowed at the floor");
    assert.equal(E.nextGap(6, 0), 6);
    assert.equal(E.nextGap(12, NaN), 12);
    assert.equal(E.nextGap(-1, 0.5), 12);
    assert.ok(Number.isFinite(E.nextGap(Infinity, 0.5)));
  });
});

// Plays one character's attacks for `ticks` ticks as main.js schedules them
// (tick(): a newcomer starts in its first gap, the next is due a gap after the
// last was due, a blow lands on the 4th phase) and returns its direct damage a
// tick (a chained second strike left out: that is the Bolt Staff's status).
function dps(cls, weapon, { haste = 0, auras = {}, ticks = 100000, seed = 1 } = {}) {
  const rnd = seeded(seed);
  const pace = E.cadence(R.attackTicksOf({ haste }), cls, weapon, auras);
  const r = { start: null, next: 1 + rnd() * Math.max(0, pace.ticks - 1) };
  let total = 0;
  for (let t = 1; t <= ticks; t++) {
    if (r.start !== null && t - r.start > R.ATTACK_PHASES) r.start = null;
    if (r.start === null && t >= r.next) {
      r.start = t;
      r.next = Math.max(r.next, t - 1) + E.nextGap(pace.ticks, rnd());
    }
    if (r.start !== null && t - r.start === R.ATTACK_PHASES - 1) {
      const out = E.strike({ cls, weapon, damage: 100, critChance: 0, factor: pace.factor }, null, E.newStatuses(), auras, never);
      total += out.hits[0].damage;
    }
  }
  return total / ticks;
}

describe("equal damage per second", () => {
  const ticks = THOROUGH ? 400000 : 60000;
  const plain = (c) => R.catalogue(c, "weapon").filter((it) => !E.AURAS.includes(it.potion)).map((it) => it.id);
  for (const c of R.CLASSES)
    test(`${c}: every weapon but an aura vial deals what the default does a second, within 1% (by simulation)`, () => {
      const hastes = THOROUGH ? [0, 1, 2, 3, 4, 5] : [0, 5];
      for (const haste of hastes)
        for (const auras of [{}, { haste: true }]) {
          const base = dps(c, "default", { haste, auras, ticks });
          for (const w of plain(c)) {
            const d = dps(c, w, { haste, auras, ticks, seed: 7 });
            assert.ok(Math.abs(d / base - 1) < 0.01, `${c} ${w} haste ${haste} ${auras.haste ? "hasted" : ""}: ${(d / base).toFixed(4)}`);
          }
        }
    });
  test("an aura vial's healer deals half", () => {
    const base = dps("healer", "default", { ticks });
    for (const w of ["haste", "might", "hex"]) close(dps("healer", w, { ticks, seed: 3 }) / base, 0.5, 0.02);
  });
});

describe("weakness and resistance", () => {
  test("each kind is weak to one element and resists one", () => {
    const table = Object.fromEntries(R.KINDS.map((k) => [k, Object.fromEntries(R.ELEMENTS.map((el) => [el, E.matchup(k, el)]))]));
    assert.deepEqual(table, {
      slime: { fire: null, frost: "weak", storm: null, poison: "resist" },
      ogre: { fire: "weak", frost: null, storm: "resist", poison: null },
      dragon: { fire: "resist", frost: "weak", storm: null, poison: null },
    });
  });
  test("a weakness takes x1.5, a resistance x0.75, the rest x1", () => {
    assert.equal(E.strike(blow({ cls: "wizard" }), "ogre", null, {}, never).damage, 150);
    assert.equal(E.strike(blow({ cls: "wizard" }), "dragon", null, {}, never).damage, 75);
    assert.equal(E.strike(blow({ cls: "wizard" }), "slime", null, {}, never).damage, 100);
    assert.equal(E.strike(blow(), "dragon", null, {}, never).damage, 100, "no element");
    assert.equal(E.strike(blow({ cls: "wizard" }), "ogre", null, {}, never).matchup, "weak");
  });
  test("odd kinds and elements meet nothing", () => {
    for (const k of [undefined, "hydra", "__proto__", "constructor"]) assert.equal(E.matchup(k, "fire"), null);
    assert.equal(E.matchup("slime", undefined), null);
    assert.equal(E.elementFactor("__proto__", "fire"), 1);
  });
});

describe("statuses", () => {
  test("burn: 20% of the blow over 3s; another fire hit adds its share and restarts the 3s; each class its own", () => {
    const st = E.newStatuses();
    E.strike(blow({ cls: "wizard" }), "slime", st, {}, never);
    assert.deepEqual(st.burn.wizard, { left: 20, ticks: 12, haste: 0, might: 0 });
    for (let i = 0; i < 6; i++) E.tickStatuses(st, "slime", {});
    close(st.burn.wizard.left, 10);
    E.strike(blow({ cls: "wizard" }), "slime", st, {}, never);
    close(st.burn.wizard.left, 30);
    assert.equal(st.burn.wizard.ticks, 12);
    E.strike(blow({ cls: "warrior", weapon: "flame" }), "slime", st, {}, never);
    assert.deepEqual(Object.keys(st.burn).sort(), ["warrior", "wizard"]);
  });
  test("burn deals all of it by its last tick, with the weakness and the hex as it ticks, then is gone", () => {
    const st = E.newStatuses();
    E.strike(blow({ cls: "archer", weapon: "flame" }), "ogre", st, {}, never);
    let sum = 0;
    for (let i = 0; i < 12; i++) for (const d of E.tickStatuses(st, "ogre", { hex: true })) sum += d.damage;
    close(sum, 20 * 1.5 * 1.15);
    assert.deepEqual(st.burn, {});
  });
  test("chill: the 16 ticks after a frost hit, every blow has 10% more crit chance", () => {
    const st = E.newStatuses();
    E.strike(blow({ cls: "archer", weapon: "frost" }), "ogre", st, {}, never);
    const crit = () => E.strike(blow(), "ogre", st, {}, () => 0.05).hits[0].crit; // a roll of 5%: crit only while chilled
    let chilled = 0;
    for (let i = 0; i < 20; i++) {
      E.tickStatuses(st, "ogre", {});
      if (crit()) chilled += 1;
    }
    assert.equal(chilled, E.CHILL_TICKS);
    assert.equal(st.chill, 0);
  });
  test("chain: a storm blow strikes twice on a roll under 20%, the second the same", () => {
    const two = E.strike(blow({ cls: "wizard", weapon: "storm" }), "slime", null, {}, draws(0.9, 0.19));
    assert.equal(two.hits.length, 2);
    assert.equal(two.hits[1].chain, true);
    assert.equal(two.hits[1].damage, two.hits[0].damage);
    assert.equal(two.damage, 200);
    assert.equal(E.strike(blow({ cls: "wizard", weapon: "storm" }), "slime", null, {}, draws(0.9, 0.2)).hits.length, 1);
    assert.equal(E.strike(blow(), "slime", null, {}, always).hits.length, 1, "only storm chains");
  });
  test("venom: a stack per hit, 20% over 6s, at most 5; a sixth replaces the one with least left", () => {
    const st = E.newStatuses();
    for (let i = 0; i < 5; i++) {
      E.strike(blow({ cls: "wizard", weapon: "venom", damage: 100 + i }), "ogre", st, {}, never);
      E.tickStatuses(st, "ogre", {});
    }
    assert.equal(st.venom.length, 5);
    const least = Math.min(...st.venom.map((v) => v.left));
    E.strike(blow({ cls: "wizard", weapon: "venom" }), "ogre", st, {}, never);
    assert.equal(st.venom.length, 5);
    assert.ok(!st.venom.some((v) => v.left === least), "the least-left stack went");
    let sum = 0;
    const one = E.newStatuses();
    E.strike(blow({ cls: "wizard", weapon: "venom" }), "dragon", one, {}, never);
    for (let i = 0; i < 30; i++) for (const d of E.tickStatuses(one, "dragon", {})) sum += d.damage;
    close(sum, 100 * 0.75 * 0.2, 1e-9); // the Toxic Rod's 0.75: its factor (no cadence given) on the blow
    assert.deepEqual(one.venom, []);
  });
  test("venom: the stack replaced is the one with least left, not the oldest", () => {
    const st = E.newStatuses();
    // the oldest is the biggest; the third the smallest
    for (const damage of [1000, 400, 10, 300, 200]) E.strike(blow({ cls: "wizard", weapon: "venom", damage }), "ogre", st, {}, never);
    const smallest = st.venom[2].left;
    E.strike(blow({ cls: "wizard", weapon: "venom", damage: 500 }), "ogre", st, {}, never);
    const left = st.venom.map((v) => v.left);
    assert.ok(left.includes(1000 * 0.75 * 0.2), "the oldest stays");
    assert.ok(!left.includes(smallest), "the least-left one went");
  });
  test("statuses are shares of the blow as dealt: crit and might in", () => {
    const st = E.newStatuses();
    E.strike(blow({ cls: "wizard", critChance: 1 }), "slime", st, { might: true }, never);
    close(st.burn.wizard.left, 100 * 2 * 1.3 * 0.2);
    close(st.burn.wizard.might, st.burn.wizard.left * (0.3 / 1.3));
  });
  test("malformed statuses are made good in place, never thrown on", () => {
    const st = { burn: { wizard: { left: 5, ticks: 2.5 }, bard: { left: 5, ticks: 3 }, __proto__: null }, chill: -2, venom: [null, { cls: "wizard", left: 4, ticks: 2, haste: 9 }, { cls: "x", left: 1, ticks: 1 }] };
    const out = E.tickStatuses(st, "slime", {});
    assert.deepEqual(Object.keys(st.burn), []);
    assert.equal(st.chill, 0);
    assert.equal(out.length, 1);
    close(out[0].damage, 2 * 0.75); // half of what is left, and the slime resists poison
    for (const junk of [null, 5, "x", []]) assert.deepEqual(E.tickStatuses(junk, "slime", {}), []);
  });
  test("plate icons: burn, chill, venom with its stacks, then the hex", () => {
    const st = E.newStatuses();
    assert.deepEqual(E.plateIcons(st, {}), []);
    E.strike(blow({ cls: "wizard" }), "slime", st, {}, never);
    E.strike(blow({ cls: "archer", weapon: "frost" }), "slime", st, {}, never);
    E.strike(blow({ cls: "wizard", weapon: "venom" }), "slime", st, {}, never);
    E.strike(blow({ cls: "wizard", weapon: "venom" }), "slime", st, {}, never);
    assert.deepEqual(E.plateIcons(st, { hex: true }), [{ id: "burn", n: 1 }, { id: "chill", n: 1 }, { id: "venom", n: 2 }, { id: "hex", n: 1 }]);
  });
});

describe("auras", () => {
  test("a healer's Haste, Might or Hex Vial gives its aura; two on one vial give it once; the Heal Vial none", () => {
    assert.deepEqual(E.partyAuras([{ cls: "healer", weapon: "might" }, { cls: "healer", weapon: "might" }, { cls: "healer", weapon: "hex" }]), { haste: false, might: true, hex: true });
    assert.deepEqual(E.partyAuras([{ cls: "healer", weapon: "default" }, { cls: "wizard", weapon: "might" }]), E.noAuras());
    assert.deepEqual(E.partyAuras([null, 5, { cls: "healer" }]), E.noAuras());
    assert.deepEqual(E.partyAuras("x"), E.noAuras());
  });
  test("might: +30% to every blow; hex: +15% taken from everything; the aura healer deals half", () => {
    assert.equal(E.strike(blow(), "slime", null, { might: true }, never).damage, 130);
    close(E.strike(blow(), "slime", null, { hex: true }, never).damage, 115);
    close(E.strike(blow({ cls: "healer", weapon: "might" }), "slime", null, { might: true }, never).damage, 65);
  });
});

describe("experience shares", () => {
  test("they add up to 1 in every combination of auras and haste", () => {
    for (const haste of [false, true])
      for (const might of [false, true])
        for (const hex of [false, true])
          for (const h of [0, 0.15, 0.5, 1, 7, -1, NaN]) {
            const s = E.shares({ haste, might, hex }, h);
            close(s.attacker + s.haste + s.might + s.hex, 1);
            for (const v of Object.values(s)) assert.ok(v >= 0 && v <= 1);
          }
  });
  test("hex's added share first, then might's of what is left, then haste's", () => {
    const s = E.shares({ haste: true, might: true, hex: true }, 0.15);
    close(s.hex, 0.15 / 1.15);
    close(s.might, (1 - 0.15 / 1.15) * (0.3 / 1.3));
    close(s.haste, (1 - s.hex - s.might) * 0.15);
    assert.deepEqual(E.shares({}, 0.15), { attacker: 1, haste: 0, might: 0, hex: 0 });
  });
  test("damage over time carries the shares it was put on with", () => {
    const st = E.newStatuses();
    E.strike({ ...blow({ cls: "wizard" }), haste: 0.15 }, "slime", st, { might: true, haste: true }, never);
    const [d] = E.tickStatuses(st, "slime", { hex: true });
    close(d.shares.attacker + d.shares.haste + d.shares.might + d.shares.hex, 1);
    close(d.shares.hex, 0.15 / 1.15);
    assert.ok(d.shares.might > 0 && d.shares.haste > 0);
  });
});

// Geist's advance widths (units per em 1000, Regular), for the characters the
// shop's lines use; the first line is semibold, taken as 6% wider.
const GEIST = { " ": 250, "!": 213, "%": 802, "+": 558, ",": 201, "-": 419, ".": 201, "/": 480, ":": 297, "·": 201, "×": 502, 0: 663, 1: 384, 2: 619, 3: 613, 4: 615, 5: 626, 6: 593, 7: 524, 8: 604, 9: 593, A: 668, B: 680, C: 703, D: 694, E: 603, F: 590, G: 700, H: 713, I: 270, J: 597, K: 640, L: 580, M: 877, N: 743, O: 739, P: 650, Q: 733, R: 672, S: 640, T: 552, U: 689, V: 667, W: 945, X: 606, Y: 576, Z: 544, a: 551, b: 595, c: 546, d: 595, e: 561, f: 395, g: 594, h: 581, i: 244, j: 260, k: 590, l: 267, m: 877, n: 581, o: 573, p: 595, q: 595, r: 379, s: 520, t: 392, u: 575, v: 536, w: 819, x: 585, y: 537, z: 537 };
const widthAt10 = (text, bold) => ([...text].reduce((w, ch) => w + (GEIST[ch] ?? 1000), 0) / 100) * (bold ? 1.06 : 1);

describe("the shop's lines", () => {
  test("each weapon's two lines fit the 210px column at size 10", () => {
    for (const c of R.CLASSES)
      for (const it of R.catalogue(c, "weapon")) {
        const [a, b] = E.shopLines(c, it.id);
        assert.ok(widthAt10(a, true) <= 210, `${a}: ${widthAt10(a, true).toFixed(0)}px`);
        assert.ok(widthAt10(b, false) <= 210, `${b}: ${widthAt10(b, false).toFixed(0)}px`);
      }
  });
  test("what they say", () => {
    assert.deepEqual(E.shopLines("archer", "flame"), ["Fire Bow: Burn: +20% in 3s", "Normal speed · Weak: ogre · Resist: dragon"]);
    assert.deepEqual(E.shopLines("warrior", "hammer"), ["Hammer: 2× damage, half speed", "No element"]);
    assert.deepEqual(E.shopLines("wizard", "frost"), ["Ice Wand: 0.75× damage, 4/3 speed", "Chill: +10% crit for all · Weak: slime, dragon"]);
    assert.deepEqual(E.shopLines("healer", "hex"), ["Hex Vial: Aura: foe takes +15%", "Normal speed · Half damage itself"]);
    assert.deepEqual(E.shopLines("warrior", "axe")[0], "War Axe: 1.5× damage, 2/3 speed");
  });
  test("odd inputs: the class's default, or a plain weapon", () => {
    assert.deepEqual(E.shopLines("archer", "nope"), E.shopLines("archer", "default"));
    assert.deepEqual(E.shopLines("bard", "x"), ["Weapon: Normal speed", "No element"]);
  });
});

describe("odd blows", () => {
  test("a blow that is not one deals nothing and puts nothing on", () => {
    const st = E.newStatuses();
    for (const b of [null, undefined, 5, {}, { cls: "wizard", damage: -5 }, { cls: "wizard", damage: NaN }]) {
      const out = E.strike(b, "slime", st, {}, never);
      assert.equal(out.damage, 0);
    }
    assert.deepEqual(st, E.newStatuses());
  });
  test("a bad random source is a middling roll", () => {
    for (const r of [() => NaN, () => -3, () => 9, "x"]) assert.ok(Number.isFinite(E.strike(blow({ critChance: 0.5 }), "slime", null, {}, r).damage));
  });
});

function draws(...xs) {
  let i = 0;
  return () => xs[Math.min(i++, xs.length - 1)];
}
