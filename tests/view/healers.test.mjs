// Healers, through the real main.js: every healer heals, on a rhythm of its
// own (party.js: HEAL_GAP_TICKS, half that with the Heal Vial). One whose
// agent is not working stands by in its formation spot and only heals: never
// a target, no aura, no part of the gold, the experience shares or the clock,
// and nothing while nobody fights. A working one (and you as a healer) heals
// on that rhythm and attacks on its own with its vial's potion; when both
// fall due the heal goes first and the attack waits for it to finish.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { HEAL_GAP_TICKS, HEAL_JITTER, HEAL_VIAL_GAP_TICKS } from "../../mods/idle-rpg/party.js";
import { ATTACK_PHASES, PLAYER_XP_SHARE, YOU, blowXp, damageOf, healOf, stageGold } from "../../mods/idle-rpg/rules.js";
import { mountRaid } from "../harness/view.mjs";

// a warrior and an archer fighting, and t3 a healer standing by (idle); you an archer
const SIDE = { classes: ["warrior", "archer", "healer"], statuses: ["working", "working", "idle"], you: "archer", stage: 6, health: 4 };

// Steps `v` a tick at a time for `ms`, calling `each` after every tick.
function watch(v, ms, each) {
  for (let t = 0; t < ms; t += 250) {
    v.advance(250);
    each(v.view);
  }
}

// The ticks key's heals and attacks started on, over `ms`.
function starts(v, key, ms) {
  const out = { heal: [], attack: [] };
  let last = null;
  watch(v, ms, (view) => {
    const r = view.rhythm[key];
    if (r && r.start !== null && r.start !== last) {
      last = r.start;
      out[r.heal ? "heal" : "attack"].push(r.start);
    }
  });
  return out;
}

// The successive heal due ticks (r.mend) key's rhythm went through over `ms`,
// and the gaps between them (within one rhythm: a knockout starts a new one).
function dues(v, key, ms) {
  const seen = [];
  const gaps = [];
  let was = null;
  watch(v, ms, (view) => {
    const r = view.rhythm[key];
    const m = r?.mend;
    if (m == null || m === seen.at(-1)) return;
    if (r === was) gaps.push(m - seen.at(-1));
    seen.push(m);
    was = r;
  });
  return Object.assign(seen, { gaps });
}

// Stops the boss and every attacker for a quiet, controlled moment: nobody is hit, nobody attacks.
function freeze(v) {
  v.view.party.foe.next = 1e9;
  v.view.party.foe.pending = null;
  for (const r of Object.values(v.view.rhythm)) {
    if (r.next != null) r.next = 1e9;
    if (!r.heal) r.start = null; // an attack under way is called off
  }
}

describe("a healer standing by", () => {
  test("throws a heal at the fighter lowest on HP, on its rhythm (the Heal Vial's, about 3s)", async () => {
    const v = await mountRaid(SIDE);
    const seen = starts(v, "t3", 120000);
    assert.ok(seen.heal.length >= 8, `${seen.heal.length} heals`);
    assert.deepEqual(seen.attack, [], "it never attacks");
    const { gaps } = dues(v, "t3", 60000);
    assert.ok(gaps.length >= 15);
    for (const g of gaps) assert.ok(g >= HEAL_VIAL_GAP_TICKS - HEAL_JITTER - 1e-9 && g <= HEAL_VIAL_GAP_TICKS + HEAL_JITTER + 1e-9, `gap ${g}`);
  });

  test("its heal lands on the lowest fighter for its max, and earns the healer class experience", async () => {
    const v = await mountRaid(SIDE);
    v.advance(3000);
    freeze(v);
    const p = v.view.party.members;
    p.t1.hp = p.t1.maxHp * 0.5;
    p.t2.hp = p.t2.maxHp * 0.3; // the lowest
    p.you.hp = p.you.maxHp * 0.9;
    const xp = { ...v.view.progress.xp };
    const r = v.view.rhythm.t3;
    r.mend = v.view.clock + 1;
    v.advance(250);
    assert.equal(r.heal, "t2", "aimed at the lowest");
    v.until((h) => h.view.phaseOf("t3") === ATTACK_PHASES, 3000, 250);
    const full = healOf(v.view.progress, "healer");
    assert.equal(p.t2.hp, Math.min(p.t2.maxHp, p.t2.maxHp * 0.3 + full));
    assert.equal(p.t2.healedAt, v.view.clock);
    // experience: what one of its blows would earn, sized by the heal, with the fighters (3: t1, t2, you) as the attackers
    const got = p.t2.hp - p.t2.maxHp * 0.3;
    const earned = blowXp(Math.min(damageOf(v.view.progress, "healer") * Math.min(1, got / full), v.view.monster.hp), v.view.monster, 3);
    const after = v.view.progress.xp;
    assert.ok(earned > 0);
    assert.ok(Math.abs(after.healer - xp.healer - earned) < 1e-9, `${after.healer - xp.healer} against ${earned}`);
    assert.ok(Math.abs(after[YOU] - xp[YOU] - earned * PLAYER_XP_SHARE) < 1e-9);
    for (const c of ["warrior", "archer", "wizard"]) assert.equal(after[c], xp[c], `${c} earned nothing`);
  });

  test("it is drawn throwing from its spot: the wind-up, the heal potion flying to the ally, the splash and the plus; its bubble stays, no HP bar", async () => {
    const v = await mountRaid({ ...SIDE, weapons: { healer: "might" } });
    v.advance(3000);
    freeze(v);
    const p = v.view.party.members;
    p.t1.hp = p.t1.maxHp * 0.2;
    v.view.rhythm.t3.mend = v.view.clock + 1;
    v.advance(250); // phase 1: the wind-up
    const at = v.view.at.t3;
    assert.ok(v.images("critter-t3").some((i) => i.includes("/windup/")), v.images("critter-t3").join());
    // the potion it holds up and throws is the Heal Vial's, whatever vial it has on
    assert.ok(v.images("idle-rpg-shot-t3").some((i) => i.endsWith("attacks/potion/heal.png")));
    const shot = v.get("idle-rpg-shot-t3").style;
    assert.deepEqual([shot.left, shot.top], [at.x + at.dir * 24 - 14, at.y - 40 - 18], "from its hand, where it stands");
    v.advance(250); // phase 2: flying to the ally
    const ally = v.view.at.t1;
    assert.deepEqual([v.get("idle-rpg-shot-t3").style.left, v.get("idle-rpg-shot-t3").style.top, v.get("idle-rpg-shot-t3").style.opacity], [ally.x - 14, ally.y - 36 - 18, 1]);
    v.advance(500); // phase 4: the splash on the ally, and the plus over it
    assert.ok(v.images("idle-rpg-hit-t3").some((i) => i.endsWith("attacks/splash/heal.png")));
    assert.equal(v.get("idle-rpg-hit-t3").style.opacity, 1);
    assert.ok(v.images(`idle-rpg-healed-t1-${v.view.clock}`).some((i) => i.endsWith("status/heal.png")));
    // still idle: its Zz, no HP bar, not in the party
    assert.ok(v.images().some((i) => i.endsWith("status/z-1.png")));
    assert.equal(v.find("idle-rpg-hp-t3"), null);
    assert.equal(v.find("idle-rpg-vitals-t3"), null);
    assert.equal("t3" in v.view.party.members, false);
  });

  test("never targeted, no aura, and not one of the fighters (gold, experience shares, the clock)", async () => {
    const v = await mountRaid({ ...SIDE, weapons: { healer: "might" }, level: 8 });
    const targets = new Set();
    v.until((h) => {
      const f = h.view.party.foe.pending;
      if (f) targets.add(f.target);
      assert.deepEqual(Object.values(h.view.auras()), [false, false, false], "no aura from it");
      return h.view.monster.hp <= 0;
    }, 600000, 250);
    assert.ok(targets.size >= 2 && !targets.has("t3"), [...targets].join());
    assert.equal(v.find("idle-rpg-aura-t3"), null);
    assert.deepEqual(v.view.fighters(), ["t1", "t2", YOU]);
    assert.equal(v.view.progress.gold, stageGold(6, 3), "the kill's gold is for the three fighting");
  });

  test("nothing when nobody is hurt", async () => {
    const v = await mountRaid(SIDE);
    v.advance(2000);
    freeze(v);
    for (const m of Object.values(v.view.party.members)) m.hp = m.maxHp;
    const seen = starts(v, "t3", 30000);
    assert.deepEqual(seen.heal, []);
    assert.ok(dues(v, "t3", 10000).length >= 2, "its rhythm runs on: a due heal with nobody to heal is not thrown");
  });

  test("never heals the knocked out", async () => {
    const v = await mountRaid(SIDE);
    v.advance(2000);
    freeze(v);
    const p = v.view.party.members;
    for (const m of Object.values(p)) m.hp = m.maxHp;
    Object.assign(p.t1, { hp: 0, down: v.view.clock + 400 });
    const seen = starts(v, "t3", 20000);
    assert.deepEqual(seen.heal, []);
    assert.equal(p.t1.healedAt, null);
  });

  test("nothing while nobody fights: no rhythm, no tick, no throw", async () => {
    const v = await mountRaid({ ...SIDE, statuses: ["idle", "done", "idle"] });
    v.advance(30000);
    assert.deepEqual(v.view.fighters(), []);
    assert.deepEqual(v.view.standby(), ["t3"]);
    assert.deepEqual([v.view.ticking, v.view.clock, Object.keys(v.view.rhythm)], [false, 0, []]);
    assert.equal(v.view.left, 600000);
  });

  test("done and blocked healers stand by too; a carried one does not throw", async () => {
    const v = await mountRaid({ classes: ["warrior", "healer", "healer", "healer"], statuses: ["working", "done", "blocked", "idle"] });
    assert.deepEqual(v.view.standby(), ["t2", "t3", "t4"]);
    v.view.drag = { address: "t4", x: 400, y: 60, vx: 0, last: 0 };
    assert.deepEqual(v.view.standby(), ["t2", "t3"]);
  });

  test("one that stops working mid-attack lands no blow: it only heals from then on", async () => {
    const v = await mountRaid({ ...SIDE, statuses: [] });
    v.until((h) => h.view.phaseOf("t3") === 1 && !h.view.rhythm.t3.heal, 60000, 250);
    const from = v.view.clock;
    v.setAgents(v.world.agents.map((a) => (a.address === "t3" ? { ...a, status: "idle" } : a)));
    v.advance(1000); // past where its blow would have landed
    assert.deepEqual(v.view.damage.filter((d) => d.key === "t3" && d.tick > from), [], "no number of its own");
    const seen = starts(v, "t3", 20000);
    assert.deepEqual(seen.attack, []);
    assert.equal("t3" in v.view.party.members, false);
  });

  test("one that starts working joins the fight and attacks as well", async () => {
    const v = await mountRaid(SIDE);
    v.advance(5000);
    assert.ok(v.view.rhythm.t3 && v.view.rhythm.t3.next === null);
    v.setAgents(v.world.agents.map((a) => ({ ...a, status: "working" })));
    const seen = starts(v, "t3", 60000);
    assert.ok("t3" in v.view.party.members);
    assert.ok(seen.attack.length >= 10, `${seen.attack.length} attacks`);
  });
});

describe("a working healer", () => {
  for (const vial of ["default", "haste", "might", "hex"]) {
    test(`on the ${vial === "default" ? "Heal" : vial} Vial heals on its rhythm and attacks on its own`, async () => {
      const v = await mountRaid({ classes: ["warrior", "archer", "healer"], you: "archer", stage: 6, health: 4, weapons: { healer: vial } });
      const seen = starts(v, "t3", 120000);
      assert.ok(seen.heal.length >= 4, `${seen.heal.length} heals`);
      assert.ok(seen.attack.length >= 25, `${seen.attack.length} attacks`);
      const { gaps } = dues(v, "t3", 120000);
      const want = vial === "default" ? HEAL_VIAL_GAP_TICKS : HEAL_GAP_TICKS;
      assert.ok(gaps.length >= 3);
      // a heal falling due during an attack waits for it, and the next is a gap from when it went
      for (const g of gaps) assert.ok(g >= want - HEAL_JITTER - 1e-9 && g <= want + HEAL_JITTER + ATTACK_PHASES + 1e-9, `gap ${g} against ${want}`);
      // its attacks are blows on the boss with its own vial's potion
      if (vial !== "default") assert.ok(v.images("idle-rpg-aura-t3").some((i) => i.endsWith(`effects/icons/${vial}.png`)));
    });
  }

  test("the Heal Vial heals twice as often as an aura vial", async () => {
    const count = async (vial) => {
      const v = await mountRaid({ classes: ["warrior", "archer", "healer"], you: "archer", stage: 6, health: 4, weapons: { healer: vial } }, { seed: 4 });
      const { gaps } = dues(v, "t3", 240000);
      return gaps.reduce((n, g) => n + g, 0) / gaps.length; // the mean gap
    };
    const heal = await count("default");
    const might = await count("might");
    assert.ok(Math.abs(might / heal - 2) < 0.15, `mean gaps ${heal} and ${might}`);
  });
  test("a heal and an attack due together: the heal first, the attack once it has finished", async () => {
    const v = await mountRaid({ classes: ["warrior", "healer"], you: "archer", stage: 6, health: 4 });
    v.advance(3000);
    freeze(v);
    v.until((h) => h.view.rhythm.t2.start === null, 3000, 250);
    v.view.party.members.t1.hp = 10;
    const t = v.view.clock + 1;
    Object.assign(v.view.rhythm.t2, { mend: t, next: t });
    v.advance(250);
    assert.deepEqual([v.view.rhythm.t2.start, v.view.rhythm.t2.heal], [t, "t1"], "the heal first");
    const seen = starts(v, "t2", 2000);
    assert.deepEqual(seen.attack, [t + ATTACK_PHASES + 1], "the attack as soon as the heal's rest is drawn");
    assert.equal(v.view.rhythm.t2.heal, null);
  });

  test("an attack under way makes a due heal wait for it", async () => {
    const v = await mountRaid({ classes: ["warrior", "healer"], you: "archer", stage: 6, health: 4 });
    v.advance(3000);
    freeze(v);
    v.until((h) => h.view.rhythm.t2.start === null, 3000, 250);
    v.view.party.members.t1.hp = 10;
    const t = v.view.clock + 1;
    Object.assign(v.view.rhythm.t2, { next: t, mend: t + 2 });
    const seen = starts(v, "t2", 3000);
    assert.deepEqual([seen.attack[0], seen.heal[0]], [t, t + ATTACK_PHASES + 1]);
  });

  test("knocked out, it neither heals nor attacks", async () => {
    const v = await mountRaid({ classes: ["warrior", "healer"], you: "archer", stage: 6, health: 4 });
    v.advance(3000);
    freeze(v);
    const p = v.view.party.members;
    Object.assign(p.t2, { hp: 0, down: v.view.clock + 200 });
    p.t1.hp = 10;
    const seen = starts(v, "t2", 20000);
    assert.deepEqual(seen, { heal: [], attack: [] });
    assert.equal(p.t1.healedAt, null);
  });
});

describe("you as a healer", () => {
  test("heal on the working healer's rhythm while in the fight, and attack", async () => {
    const v = await mountRaid({ classes: ["warrior", "archer"], you: "healer", stage: 6, health: 4 });
    const seen = starts(v, YOU, 120000);
    assert.ok(seen.heal.length >= 4 && seen.attack.length >= 25, JSON.stringify({ heals: seen.heal.length, attacks: seen.attack.length }));
  });

  test("not while you are out of the fight (nobody working)", async () => {
    const v = await mountRaid({ classes: ["warrior"], you: "healer", status: "idle", stage: 6 });
    v.advance(20000);
    assert.equal(v.view.rhythm[YOU], undefined);
    assert.deepEqual(v.view.standby(), [], "you are never one standing by");
  });
});
