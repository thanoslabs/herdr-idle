#!/usr/bin/env node
// A balance simulation for the idle RPG: plays the real rules.js, party.js and
// effects.js headlessly, the way mods/idle-rpg/main.js runs a fight, and
// reports how long a party takes to clear each stage. Dependency-free.
//
//   node tools/sim.mjs                         # 3 agents and you, training both, 5 seeds, to stage 50
//   node tools/sim.mjs --agents 1 --until 25   # one agent
//   node tools/sim.mjs --policy attack         # trains Attack only (or: both, none)
//   node tools/sim.mjs --smoke                 # a quick run (the tests run it)
//   node tools/sim.mjs --help
//
// The fight (class Fight below) is main.js's attack clock and watch, line for
// line where it matters to the outcome: every 250ms tick brings the party in
// line with who fights (muster), runs the boss's tick (monsterTick: rests end,
// its attacks land and start), returns early on a wipe (fail), starts each
// attacker's attacks on its own rhythm (cadence, nextGap), ticks the statuses,
// heals at the impact, lands the blows (strike) and once a second the damage
// over time, books a kill (slay) and runs the attempt's time down (fail on
// time-out); the 1s watch brings the next boss 3s after a kill (5s after a
// first clear) and restarts the clock. It draws from its random source in the
// same order main.js draws from Math.random, so a view and a Fight given the
// same seed and party play the same fight (tests/view/parity.test.mjs checks
// it). Rendering, notes and sounds are left out. When main.js's fight changes,
// change Fight to match: the parity test fails until it does.
//
// The player (Player below) is a policy on top: spend skill points on the rank
// that adds most damage a second; buy training (Attack and Health evenly,
// cheapest first; Attack only; or nothing); press the next arrow after a
// purchase or every N minutes; drop back one stage on a failure (main.js's
// rule) or more (--drop, an experiment).

import { pathToFileURL } from "node:url";
import {
  ATTACK_PHASES,
  CLASSES,
  CLASS_SKILLS,
  CRIT_MULTIPLIER,
  MAX_RANK,
  TICK_STEP,
  YOU,
  attackTicksOf,
  bossOf,
  canRaise,
  canTrain,
  catalogue,
  credit,
  critChanceOf,
  damageOf,
  equip,
  equipped,
  failStage,
  healOf,
  maxHpOf,
  newProgress,
  pointsLeft,
  powerOf,
  raise,
  selectStage,
  slay,
  stageDamage,
  stageTime,
  train,
  trainingOf,
  trainingPrice,
} from "../mods/idle-rpg/rules.js";
import { down, healParty, healTarget, heals, monsterTick, newParty, resetParty, rise, standing, syncParty } from "../mods/idle-rpg/party.js";
import { cadence, elementFactor, newStatuses, nextGap, partyAuras, statsOf, strike, tickStatuses } from "../mods/idle-rpg/effects.js";

// ---- main.js's constants that shape a fight ---------------------------------
export const WATCH_MS = 1000;
export const RESPAWN_MS = 3000;
export const ADVANCE_MS = 5000;
export const DOT_TICKS = 4;
const FLOOR_H = 152;
const MONSTER_Y = 108;
const CRITTER_Y = [16, FLOOR_H - 42];
const YOU_Y = [12, FLOOR_H - 24];
const SWORD = 44;
const RANGE = 360;
const MELEE = 90;
// each kind's picture width and bulk (MONSTERS in main.js): where the party stands
export const MONSTERS = {
  slime: { w: 136, core: { x: 0, half: 60 } },
  ogre: { w: 200, core: { x: 0, half: 62 } },
  dragon: { w: 328, core: { x: 12, half: 84 } },
};
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));

// A seeded random source (mulberry32), the same one the view harness uses.
export function seeded(seed) {
  let a = seed >>> 0 || 1;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * One raid, as main.js runs it.
 * @param {object} o
 * @param {object} o.progress rules.js progress (newProgress(), or a loaded save's)
 * @param {string[]} o.agents the working agents' addresses, in agents() order
 * @param {object} o.sprites the class of each address, and of YOU
 * @param {object|null} [o.you] where you stand ({ x, y }), or null for you not fighting
 * @param {object} [o.settings] { advance } (the setting; default on)
 * @param {number} [o.width=1280] the scene's width
 * @param {() => number} [o.random] the random source (Math.random in main.js)
 */
export class Fight {
  constructor({ progress, agents, sprites, you = { x: 154, y: 16 }, settings = { advance: true }, width = 1280, random = Math.random }) {
    this.progress = progress;
    this.agents = agents;
    this.sprites = sprites;
    this.you = you && { x: Math.round(clamp(you.x, 30, width - 30)), y: Math.round(clamp(you.y, YOU_Y[0], YOU_Y[1])) };
    this.settings = settings;
    this.W = Math.max(320, width);
    this.random = random;
    this.now = 0; // ms since the view started
    this.monster = bossOf(progress.stage, 1);
    this.left = stageTime(this.monster.stage);
    this.koBeat = 0;
    this.party = newParty();
    this.statuses = newStatuses();
    this.dots = Object.create(null);
    this.clock = 0;
    this.rhythm = Object.create(null);
    this.ticking = false;
    this.nextTick = null; // the ms the next tick runs at, while ticking
    this.stats = { kills: 0, fails: 0, wipes: 0, timeouts: 0, knockouts: 0, heals: 0, blows: 0, saves: 0, firstClears: {}, killTimes: [] };
    this.onFail = null; // (fight, why) after a failed attempt, for the player
  }

  // ---- who fights (fighters, joins, attackers in main.js) ----------------------
  joins(alive = true) {
    const kind = MONSTERS[this.monster?.kind];
    if (!this.you || !kind || (alive && !(this.monster.hp > 0))) return false;
    return this.sprites[YOU] !== "warrior" || Math.abs(this.you.x - (this.W / 2 + kind.core.x)) - kind.core.half <= MELEE;
  }
  fighters() {
    const keys = [...this.agents];
    if (keys.length && this.joins(false)) keys.push(YOU);
    return keys;
  }
  knocked(key) {
    return key in this.party.members && !standing(this.party, key);
  }
  attackers() {
    if (!(this.monster?.hp > 0)) return [];
    return this.fighters().filter((key) => !this.knocked(key));
  }
  auras() {
    return partyAuras(this.attackers().map((key) => ({ cls: this.sprites[key], weapon: equipped(this.progress, this.sprites[key], "weapon") })));
  }
  formation(kind) {
    const mid = Math.round(this.W / 2);
    const half = kind.w / 2;
    const reach = Math.max(110, Math.min(RANGE, mid - half - 60));
    const rows = [96, 60];
    const spots = {};
    const count = { melee: 0, ranged: 0 };
    for (const key of this.agents) {
      const melee = this.sprites[key] === "warrior";
      const i = melee ? count.melee++ : count.ranged++;
      const side = i % 2 ? 1 : -1;
      const n = Math.floor(i / 2);
      const x = melee ? mid + kind.core.x + side * (kind.core.half + SWORD + n * 62) : mid + side * (half + reach + n * 62);
      spots[key] = { x: Math.round(clamp(x, 36, this.W - 36)), y: melee ? MONSTER_Y + 6 : clamp(rows[n % rows.length], CRITTER_Y[0], CRITTER_Y[1] + 12) };
    }
    return spots;
  }
  muster() {
    const keys = this.fighters();
    const kind = MONSTERS[this.monster?.kind];
    const at = keys.length && kind ? this.formation(kind) : {};
    const fighters = keys.map((key) => ({ key, maxHp: maxHpOf(this.progress, this.sprites[key]), ...(key === YOU ? this.you : at[key]) }));
    syncParty(this.party, fighters, this.clock, this.random);
    return keys;
  }
  potionOf(cls) {
    const id = equipped(this.progress, cls, "weapon");
    return catalogue(cls, "weapon").find((it) => it.id === id)?.potion;
  }

  // ---- attempts (newBoss, fail, toStage) ---------------------------------------
  clearEffects() {
    this.statuses = newStatuses();
    this.dots = Object.create(null);
  }
  newBoss() {
    this.monster = bossOf(this.progress.stage, (this.monster?.id ?? 0) + 1);
    this.left = stageTime(this.monster.stage);
    this.clearEffects();
    resetParty(this.party, this.clock, this.random);
  }
  fail(why = "time") {
    const from = this.monster.stage;
    const to = failStage(this.progress);
    if (to !== from) this.newBoss();
    else {
      this.monster.hp = this.monster.maxHp;
      this.left = stageTime(this.monster.stage);
      this.clearEffects();
      resetParty(this.party, this.clock, this.random);
    }
    this.stats.fails += 1;
    this.stats[why === "wiped" ? "wipes" : "timeouts"] += 1;
    this.stats.saves += 1;
    this.onFail?.(this, why);
  }
  // the stage arrows: a stage reached, a fresh attempt, the clock woken
  toStage(s) {
    if (!selectStage(this.progress, s)) return false;
    this.newBoss();
    this.stats.saves += 1;
    this.wake();
    return true;
  }

  // ---- blows (fight in main.js) ------------------------------------------------
  fight(blows = []) {
    const m = this.monster;
    if (m.hp <= 0 && this.now - (m.slainAt ?? 0) >= (m.advancing ? ADVANCE_MS : RESPAWN_MS)) {
      this.newBoss();
      return true;
    }
    const attackers = Math.max(1, this.fighters().length);
    let landed = false;
    for (const { key, damage, cls, shares: owed = null } of blows) {
      if (m.hp <= 0) break;
      const dealt = Math.min(damage, m.hp);
      m.hp -= dealt;
      landed = true;
      const by = cls ?? this.sprites[key];
      const aura = owed ? owed.haste + owed.might + owed.hex : 0;
      for (const [c, part] of [[by, 1 - aura], ["healer", aura]]) {
        if (!(part > 0)) continue;
        credit(this.progress, c, dealt * part, m, attackers);
      }
    }
    if (!landed) return false;
    if (m.hp <= 0) {
      m.hp = 0;
      m.slainAt = this.now;
      this.clearEffects();
      const best = this.progress.best;
      slay(this.progress, m, this.settings.advance, attackers);
      if (this.progress.best > best) this.stats.firstClears[m.stage] = this.now;
      // how long the attempt's clock ran: a push (the first clear) or a repeat
      this.stats.killTimes.push({ stage: m.stage, ms: stageTime(m.stage) - this.left, first: this.progress.best > best });
      if (this.progress.best > best && this.progress.stage === this.progress.best && this.progress.stage !== m.stage) m.advancing = this.progress.stage;
      this.stats.kills += 1;
      this.stats.saves += 1;
    }
    return true;
  }
  healXp(key, got) {
    const cls = this.sprites[key];
    const m = this.monster;
    const full = healOf(this.progress, cls);
    if (!(m?.hp > 0) || !(full > 0)) return;
    const size = damageOf(this.progress, cls) * Math.min(1, got / full);
    credit(this.progress, cls, Math.min(size, m.hp), m, Math.max(1, this.fighters().length));
  }

  // ---- the clock (wake, tick, the watch) ----------------------------------------
  wake() {
    if (this.ticking || (!this.attackers().length && !down(this.party).length)) return;
    this.ticking = true;
    this.nextTick = this.now + TICK_STEP;
  }
  watch() {
    this.muster();
    if (this.W < 640) return;
    this.fight();
    this.wake();
  }
  tick() {
    const t = (this.clock += 1);
    const inFight = this.muster();
    const alive = this.monster.hp > 0;
    const e = alive ? monsterTick(this.party, t, stageDamage(this.monster.stage), this.random) : { back: rise(this.party, t), hits: [], wiped: false };
    this.stats.knockouts += e.hits.filter((h) => h.down).length;
    if (e.wiped) {
      this.fail("wiped");
      return true;
    }
    const keys = this.attackers();
    const auras = this.auras();
    for (const key of Object.keys(this.rhythm)) if (!keys.includes(key)) delete this.rhythm[key];
    const aimed = [];
    for (const key of keys) {
      const cls = this.sprites[key];
      const pace = cadence(attackTicksOf(this.progress.skills[cls]), cls, equipped(this.progress, cls, "weapon"), auras);
      const r = (this.rhythm[key] ??= { start: null, next: t + 1 + this.random() * Math.max(0, pace.ticks - 1), seed: 0, factor: 1 });
      if (r.start !== null && t - r.start > ATTACK_PHASES) r.start = null;
      if (r.start === null && t >= r.next) {
        r.start = r.seed = t;
        r.factor = pace.factor;
        r.haste = pace.haste;
        r.next = Math.max(r.next, t - 1) + nextGap(pace.ticks, this.random());
        r.heal = heals(cls, this.potionOf(cls)) ? healTarget(this.party, key, aimed) : null;
        if (r.heal) aimed.push(r.heal);
      }
    }
    const kind = this.monster.kind;
    if (keys.length && this.monster.hp > 0) {
      for (const d of tickStatuses(this.statuses, kind, auras)) {
        const p = (this.dots[`${d.cls}/${d.status}`] ??= { cls: d.cls, status: d.status, n: 0, owed: { attacker: 0, haste: 0, might: 0, hex: 0 } });
        p.n += d.damage;
        for (const k of Object.keys(p.owed)) p.owed[k] += d.damage * d.shares[k];
      }
    }
    const phaseOf = (key) => {
      const r = this.rhythm[key];
      const k = r && r.start !== null ? this.clock - r.start : -1;
      return k >= 0 && k < ATTACK_PHASES ? k + 1 : 0;
    };
    const landing = keys.filter((key) => phaseOf(key) === ATTACK_PHASES);
    const healed = [];
    for (const key of landing.filter((k) => this.rhythm[k].heal)) {
      const cls = this.sprites[key];
      const to = heals(cls, this.potionOf(cls)) ? healTarget(this.party, key, healed) : null;
      this.rhythm[key].heal = to;
      if (!to) continue;
      healed.push(to);
      const got = healParty(this.party, to, healOf(this.progress, cls), t);
      if (got > 0) {
        this.stats.heals += 1;
        this.healXp(key, got);
      }
    }
    const blows = [];
    for (const key of landing.filter((k) => !this.rhythm[k].heal)) {
      const r = this.rhythm[key];
      const cls = this.sprites[key];
      const out = strike(
        { cls, weapon: equipped(this.progress, cls, "weapon"), damage: damageOf(this.progress, cls), critChance: critChanceOf(this.progress.skills[cls]), factor: r.factor, haste: r.haste },
        kind,
        this.statuses,
        auras,
        this.random,
      );
      for (const h of out.hits) blows.push({ key, cls, damage: h.damage, shares: out.shares });
    }
    const turning = keys.length && this.monster.hp > 0 ? Math.ceil((this.left - TICK_STEP) / 1000) !== Math.ceil(this.left / 1000) : t % DOT_TICKS === 0;
    if (turning && this.monster.hp > 0) {
      for (const p of Object.values(this.dots)) {
        if (p.n > 0) {
          const owed = Object.fromEntries(Object.entries(p.owed).map(([k, n]) => [k, n / p.n]));
          blows.push({ key: null, cls: p.cls, damage: p.n, shares: owed });
        }
      }
      this.dots = Object.create(null);
    }
    this.stats.blows += blows.length;
    if (blows.length) this.fight(blows);
    const plateTurn = keys.length > 0 && this.monster.hp > 0 && turning;
    if (turning && (plateTurn || t - this.koBeat >= DOT_TICKS) && down(this.party).length) this.koBeat = t;
    if (keys.length && this.monster.hp > 0) {
      this.left -= TICK_STEP;
      if (this.left <= 0) this.fail("time");
    }
    return keys.length > 0 || (inFight.length > 0 && down(this.party).length > 0);
  }

  // Moves time on by one TICK_STEP: the watch when its second comes round,
  // then the attack clock's tick if it is due (the order the view's timers run in).
  step() {
    this.now += TICK_STEP;
    if (this.now % WATCH_MS === 0) this.watch();
    if (this.ticking && this.nextTick === this.now) {
      if (this.tick()) this.nextTick = this.now + TICK_STEP;
      else {
        this.ticking = false;
        this.nextTick = null;
      }
    }
  }

  // What a test compares with the view: the progress and the fight's state.
  snapshot() {
    const p = this.progress;
    return {
      stage: p.stage,
      best: p.best,
      farming: p.farming,
      slain: p.slain,
      gold: p.gold,
      kills: { ...p.kills },
      xp: Object.fromEntries(Object.entries(p.xp).map(([k, v]) => [k, Math.round(v * 1e6) / 1e6])),
      monster: { stage: this.monster.stage, id: this.monster.id, hp: Math.round(this.monster.hp * 1e6) / 1e6 },
      left: this.left,
      clock: this.clock,
      party: Object.fromEntries(Object.entries(this.party.members).map(([k, m]) => [k, { hp: Math.round(m.hp * 1e6) / 1e6, down: m.down }])),
    };
  }
}

// ---- the player ------------------------------------------------------------------

// What a class's skill ranks give in damage a second, relative: Power, Crit, Haste.
function dpsOf(ranks) {
  return (powerOf(ranks) * (1 + critChanceOf(ranks) * (CRIT_MULTIPLIER - 1))) / attackTicksOf(ranks);
}

// Spends every class's points, each on the skill that adds most damage a second.
export function spendPoints(progress) {
  for (const cls of CLASSES) {
    while (pointsLeft(progress, cls) > 0) {
      const ranks = progress.skills[cls];
      let best = null;
      let gain = 0;
      for (const k of CLASS_SKILLS[cls]) {
        if (!canRaise(progress, cls, k) || (ranks[k] ?? 0) >= MAX_RANK) continue;
        const g = dpsOf({ ...ranks, [k]: (ranks[k] ?? 0) + 1 }) / dpsOf(ranks);
        if (g > gain) [best, gain] = [k, g];
      }
      if (!best || !raise(progress, cls, best)) break;
    }
  }
}

// Buys the cheapest affordable training for the classes in use, by policy:
// "both" (Attack and Health, cheapest first), "attack" or "none". Returns how many levels it bought.
export function buyTraining(progress, classes, policy) {
  if (policy === "none") return 0;
  const kinds = policy === "attack" ? ["attack"] : ["attack", "health"];
  let bought = 0;
  for (;;) {
    let pick = null;
    for (const cls of classes)
      for (const key of kinds) {
        if (!canTrain(progress, cls, key)) continue;
        const price = trainingPrice(trainingOf(progress, cls, key));
        if (!pick || price < pick.price) pick = { cls, key, price };
      }
    if (!pick || !train(progress, pick.cls, pick.key)) return bought;
    bought += 1;
  }
}

// The weapon a class does most damage with on a boss kind, by a rule of thumb:
// its element's factor there, and +20% for an element's status (burn, chain,
// venom; chill counts as the crit it adds).
export function bestWeapon(cls, kind) {
  let best = catalogue(cls, "weapon")[0];
  let score = 0;
  for (const it of catalogue(cls, "weapon")) {
    if (cls === "healer") continue;
    const w = statsOf(cls, it.id);
    const s = w.element ? elementFactor(kind, w.element) * 1.2 : 1;
    if (s > score) [best, score] = [it, s];
  }
  return best.id;
}

const CYCLE = ["warrior", "archer", "wizard", "healer"];

/**
 * Plays one run from a fresh save. Returns { firstClears: { stage: ms }, stats, best, days }.
 * @param {object} o see parse() for the options
 */
export function play(o) {
  const random = seeded(o.seed);
  const progress = newProgress();
  const agents = Array.from({ length: o.agents }, (_, i) => `t${i + 1}`);
  const sprites = Object.fromEntries(agents.map((k, i) => [k, o.classes[i % o.classes.length]]));
  if (o.you) sprites[YOU] = o.you;
  const classes = [...new Set(Object.values(sprites))];
  // weapons: a fixed loadout, or the best for each boss (re-equipped as it comes)
  const own = (cls, id) => {
    const item = catalogue(cls, "weapon").find((it) => it.id === id);
    if (!item) return;
    if (!progress.looks[cls].weapon.owned.includes(id)) progress.looks[cls].weapon.owned.push(id);
    equip(progress, cls, "weapon", id);
  };
  for (const [cls, id] of Object.entries(o.loadout)) own(cls, id);
  if (o.vial && sprites[YOU] === "healer") own("healer", o.vial);
  const fight = new Fight({ progress, agents, sprites, you: o.you ? { x: 154, y: 16 } : null, random, width: 1280 });
  const limit = o.maxDays * 86400 * 1000;
  const every = o.next === "purchase" ? null : Number(o.next) * 60000;
  let lastNext = 0;
  let kind = null;
  fight.onFail = (f) => {
    // drop back further than main.js's one stage (an experiment)
    if (o.drop > 1) progress.stage = Math.max(1, f.monster.stage - (o.drop - 1));
    if (o.drop > 1) f.newBoss();
  };
  while (fight.now < limit && !(fight.stats.firstClears[o.until] !== undefined)) {
    fight.step();
    if (fight.now % WATCH_MS) continue;
    if (o.weapons === "best" && fight.monster.kind !== kind) {
      kind = fight.monster.kind;
      for (const cls of classes) if (cls !== "healer") own(cls, bestWeapon(cls, kind));
    }
    if (o.policy === "none") continue;
    spendPoints(progress);
    const bought = buyTraining(progress, classes, o.policy);
    const behind = progress.stage < progress.best;
    if (behind && ((every === null && bought > 0) || (every !== null && fight.now - lastNext >= every))) {
      lastNext = fight.now;
      fight.toStage(progress.best);
    }
  }
  return { firstClears: fight.stats.firstClears, stats: fight.stats, best: progress.best, ms: fight.now, levels: Object.fromEntries(CLASSES.map((c) => [c, progress.xp[c]])) };
}

// ---- the command line -----------------------------------------------------------

const DEFAULTS = { agents: 3, classes: CYCLE, you: "healer", policy: "both", next: "purchase", weapons: "default", loadout: {}, vial: null, seeds: 5, seed: 1, drop: 1, until: 50, maxDays: 8, stages: [1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50] };

const HELP = `node tools/sim.mjs [options]
  --agents N        working agents (default 3), classes cycling --classes
  --classes a,b,..  the agents' classes in turn (default warrior,archer,wizard,healer)
  --you CLASS|none  you join as this class (default healer), or do not fight
  --policy P        both (Attack and Health, cheapest first), attack, or none (hands-off: no training, no points, no next)
  --next W          press the next arrow after each purchase (purchase, default) or every W minutes
  --weapons W       default, best (each class's best for each boss), or class=id,... (a fixed loadout)
  --vial V          your healer's vial: heal (default), haste, might, hex
  --drop N          stages to drop back on a failure (default 1, main.js's rule)
  --seeds N --seed S  how many runs, from which seed (default 5 from 1)
  --until S         stop at the first clear of stage S (default 50)
  --max-days D      give up after D days of fighting (default 8)
  --stages a,b,..   the stages to report
  --smoke           a quick run: 1 seed, to stage 5
  --json            print JSON`;

export function parse(argv) {
  const o = { ...DEFAULTS, loadout: {} };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const val = () => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${a} needs a value`);
      return v;
    };
    if (a === "--help" || a === "-h") o.help = true;
    else if (a === "--agents") o.agents = Number(val());
    else if (a === "--classes") o.classes = val().split(",");
    else if (a === "--you") o.you = val() === "none" ? null : argv[i];
    else if (a === "--policy") o.policy = val();
    else if (a === "--next") o.next = val();
    else if (a === "--weapons") {
      const v = val();
      if (v === "best" || v === "default") o.weapons = v;
      else for (const pair of v.split(",")) o.loadout[pair.split("=")[0]] = pair.split("=")[1];
    } else if (a === "--vial") o.vial = val();
    else if (a === "--drop") o.drop = Number(val());
    else if (a === "--seeds") o.seeds = Number(val());
    else if (a === "--seed") o.seed = Number(val());
    else if (a === "--until") o.until = Number(val());
    else if (a === "--max-days") o.maxDays = Number(val());
    else if (a === "--stages") o.stages = val().split(",").map(Number);
    else if (a === "--smoke") Object.assign(o, { smoke: true, seeds: 1, until: 5, stages: [1, 2, 3, 5] });
    else if (a === "--json") o.json = true;
    else throw new Error(`unknown option ${a} (see --help)`);
  }
  if (!["both", "attack", "none"].includes(o.policy)) throw new Error(`--policy is both, attack or none`);
  if (!(o.agents >= 0) || !(o.seeds >= 1) || !(o.drop >= 1)) throw new Error("--agents, --seeds and --drop need numbers");
  for (const c of [...o.classes, ...(o.you ? [o.you] : [])]) if (!CLASSES.includes(c)) throw new Error(`unknown class ${c}`);
  if (o.next !== "purchase" && !(Number(o.next) > 0)) throw new Error("--next is purchase or a number of minutes");
  return o;
}

export function time(ms) {
  if (ms === undefined) return "never";
  const s = ms / 1000;
  if (s < 60) return `${Math.round(s)}s`;
  if (s < 3600) return `${(s / 60).toFixed(1)}m`;
  if (s < 86400) return `${(s / 3600).toFixed(1)}h`;
  return `${(s / 86400).toFixed(2)}d`;
}

const median = (xs) => {
  const s = xs.filter((x) => x !== undefined).sort((a, b) => a - b);
  // a stage some seeds never cleared: the median counts them as never
  if (s.length * 2 <= xs.length) return undefined;
  return s[Math.floor((xs.length - 1) / 2)];
};

// Runs every seed and sums them up: { stages: { stage: median ms }, runs, ... }.
export function simulate(o) {
  const runs = Array.from({ length: o.seeds }, (_, i) => play({ ...o, seed: o.seed + i }));
  const stages = Object.fromEntries(o.stages.map((s) => [s, median(runs.map((r) => r.firstClears[s]))]));
  const sum = (k) => runs.reduce((n, r) => n + r.stats[k], 0) / runs.length;
  return { options: o, stages, best: runs.map((r) => r.best), kills: sum("kills"), knockouts: sum("knockouts"), wipes: sum("wipes"), timeouts: sum("timeouts"), heals: sum("heals"), runs };
}

function main(argv) {
  const o = parse(argv);
  if (o.help) return console.log(HELP);
  const started = process.hrtime.bigint();
  const r = simulate(o);
  const secs = Number(process.hrtime.bigint() - started) / 1e9;
  if (o.json) return console.log(JSON.stringify({ ...r, runs: r.runs.map(({ firstClears, stats, best }) => ({ firstClears, stats, best })) }, null, 2));
  const party = `${o.agents} agent${o.agents === 1 ? "" : "s"} (${Array.from({ length: o.agents }, (_, i) => o.classes[i % o.classes.length]).join(", ")})${o.you ? ` and you (${o.you}${o.vial ? `, ${o.vial} vial` : ""})` : ""}`;
  console.log(`${party}; policy ${o.policy}; next ${o.next === "purchase" ? "after each purchase" : `every ${o.next}m`}; weapons ${o.weapons === "default" && Object.keys(o.loadout).length ? JSON.stringify(o.loadout) : o.weapons}; drop ${o.drop}; median of ${o.seeds} seed${o.seeds === 1 ? "" : "s"}`);
  console.log("time of fighting to first clear:");
  for (const s of o.stages) console.log(`  stage ${String(s).padStart(3)}  ${time(r.stages[s])}`);
  console.log(`per run: ${r.kills.toFixed(0)} kills, ${r.knockouts.toFixed(0)} knockouts, ${r.wipes.toFixed(0)} wipes, ${r.timeouts.toFixed(0)} time-outs, ${r.heals.toFixed(0)} heals; best stage ${r.best.join(", ")}`);
  // kill times (the attempt's clock) over the last ten stages each run reached
  const late = r.runs.flatMap((run) => run.stats.killTimes.filter((k) => k.stage > run.best - 11));
  const mid = (ks) => (ks.length ? time(median(ks.map((k) => k.ms))) : "none");
  console.log(`kill times over the last 10 stages (median): first clears ${mid(late.filter((k) => k.first))}, repeats ${mid(late.filter((k) => !k.first))}`);
  console.log(`(${secs.toFixed(1)}s)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (e) {
    console.error(e.message);
    process.exit(2);
  }
}
