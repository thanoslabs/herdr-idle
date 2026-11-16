// Idle RPG's party in a fight: the monster attacks back. Plain data and plain
// functions with no host calls, like rules.js, so main.js does the drawing and
// these can be run on their own.
//
// Only characters attacking the monster can be hit: the working agents in the
// fight, and you while you fight beside them. Each has HP of its own, kept in
// memory only (agents are short-lived; nothing here is saved): one who stops
// attacking leaves the party, and one who comes back starts at full HP. The
// monster attacks on its own rhythm: mostly a single blow at one attacker
// picked at random, now and then an area attack, aimed at an attacker's spot
// and shown on the floor before it lands, that hits everyone attacking within
// a ring around that spot (AREA_RADIUS, AREA_DEPTH). A character at 0 HP is
// knocked out: it stops attacking (though it is still working) and rests
// KO_TICKS, then comes back at full HP. If a blow knocks out the last one
// standing, the party is wiped and the attempt fails. A healer with the Heal
// Vial heals the most hurt attacker instead of attacking while anyone is under
// HEAL_BELOW of their HP. Max HP, the boss's damage at a stage and what a heal
// restores are stats, in rules.js (maxHpOf, stageDamage, healOf); HP is a real
// number, like damage.
//
// Time is counted in the attack clock's ticks (TICK_STEP, 250ms), so main.js
// calls monsterTick from its own tick and needs no timer of its own. Anything
// random takes `random`, a function returning a number from 0 to 1 (below 1),
// so the same draws give the same fight.
//
// The party is a plain object (see newParty) that these functions change in
// place, as rules.js changes the progress:
//   {
//     members: { <key>: { hp, maxHp, x, y, down, hitAt, healedAt } },  (no prototype)
//     foe: { next, singles, pending, last, seq },
//   }
// A member's `down` is the tick it gets back up while it is knocked out, or
// null; `hitAt` and `healedAt` the tick it was last hit or healed (null if
// never), for main.js to flash it. `x`, `y` are where it stands, in floor px
// (its feet). The foe's `next` is the tick its next attack starts (null until
// someone is there to attack), `singles` how many single blows come before its
// next area attack, `pending` the attack under way (see Attack below) or null,
// `last` the latest attack that landed (for its impact), and `seq` the last
// attack's id.
//
// An attack is { id, kind, target, x, y, start, lands }: "single" or "area";
// the key it was aimed at; the spot it was aimed at (the target's feet when it
// started); the tick it started (its wind-up, or the marker on the floor) and
// the tick it lands.

import { TICK_STEP } from "./rules.js";

// Defaults chosen to be retuned; nothing else depends on their values.
const SECOND = 1000 / TICK_STEP; // ticks
export const MONSTER_ATTACK_TICKS = 4 * SECOND; // from the start of one of the monster's attacks to the next, on average
export const MONSTER_ATTACK_JITTER = 2; // each gap is that many ticks either way off it, at random
export const SINGLE_WINDUP_TICKS = 2; // a single blow lands this long after it starts (its lunge or swing)
export const AREA_WARNING_TICKS = SECOND; // an area attack's marker shows on the floor this long before it lands
export const MIN_MONSTER_TICKS = AREA_WARNING_TICKS + 2; // so one attack has landed and faded before the next starts
export const FIRST_ATTACK_TICKS = 4; // the soonest the first attack of a fight starts (see firstGap)
// Single blows between two area attacks: one of these at random, evenly, so
// about every third attack hits an area.
export const SINGLES_BETWEEN = [1, 2, 3];
export const AREA_RADIUS = 70; // px either side of the spot an area attack is aimed at
export const AREA_DEPTH = 0.5; // and this much of it up and down the floor, which is seen at a slant (foe/marker is drawn so)
// A knocked-out character rests this long, then gets up at full HP: 30
// seconds, the owner's number, with a countdown by the character (main.js).
// An attempt has 10 minutes (STAGE_MS), so one knocked out comes back
// mid-fight.
export const KO_TICKS = 30 * SECOND;
// The monster's damage is the stage's (an input: see hitDamage), which is
// what one blow does to a party of PARTY_SIZE attackers. With n attackers
// standing a blow does (n / PARTY_SIZE) ** SCALE_POWER of it: softer for
// fewer, so one or two attackers are not swept away by blows meant for a
// crowd, and the last ones standing in a long fight take smaller blows while
// the knocked out rest. At a power of 1 each attacker's share of the
// monster's damage is the same however many there are (it was 1.5 while
// attempts lasted 30 seconds; in 10-minute fights that made a small party
// stronger per character than a big one).
export const PARTY_SIZE = 4;
export const SCALE_POWER = 1;
// Healing: a healer holding a potion of HEAL_POTION heals instead of attacking
// while any attacker (itself included) is below HEAL_BELOW of its max HP, the
// one with the least HP for its max (by healOf in rules.js).
export const HEAL_POTION = "heal";
export const HEAL_BELOW = 0.6;

const finite = (v) => typeof v === "number" && Number.isFinite(v);
const positive = (v) => (finite(v) && v > 0 ? v : 0);
// a whole number from 0 up to n - 1 from a draw of `random`; a bad draw counts as 0
const pick = (random, n) => {
  const r = random();
  return Math.min(n - 1, Math.max(0, Math.floor((finite(r) ? r : 0) * n)));
};

export function newParty() {
  // no prototype, so no key (an agent's address) can reach one
  // `singles` is drawn as the first attack is set (syncParty, resetParty)
  return { members: Object.create(null), foe: { next: null, singles: 0, pending: null, last: null, seq: 0 } };
}

// What one of the monster's blows does to each character it hits, when
// `attackers` are attacking (see SCALE_POWER): a real number, 0 for anything
// that is not damage.
export function hitDamage(damage, attackers) {
  const d = positive(damage);
  if (!d) return 0;
  const n = finite(attackers) && attackers > 0 ? Math.floor(attackers) : 1;
  const hit = d * (n / PARTY_SIZE) ** SCALE_POWER;
  return Number.isFinite(hit) ? hit : Number.MAX_VALUE;
}

// The gap before the monster's next attack: MONSTER_ATTACK_TICKS give or take
// MONSTER_ATTACK_JITTER, evenly, never under MIN_MONSTER_TICKS.
export function monsterGap(random) {
  const j = MONSTER_ATTACK_JITTER;
  return Math.max(MIN_MONSTER_TICKS, MONSTER_ATTACK_TICKS - j + pick(random, 2 * j + 1));
}

// The wait before the monster's first attack on a party that has just formed
// (or a fresh attempt, or a new boss): anywhere from FIRST_ATTACK_TICKS to a
// whole gap, evenly, so a fight is not a free few seconds at the start.
export function firstGap(random) {
  return FIRST_ATTACK_TICKS + pick(random, MONSTER_ATTACK_TICKS - FIRST_ATTACK_TICKS + 1);
}

// Whether `key` is in the fight and on its feet (so attacks, and can be hit and healed).
export function standing(party, key) {
  const m = Object.prototype.hasOwnProperty.call(party.members, key) ? party.members[key] : null;
  return Boolean(m) && m.down === null;
}

// The keys of everyone in the fight who is on their feet, in the order they joined.
export function up(party) {
  return Object.keys(party.members).filter((key) => party.members[key].down === null);
}

// The keys of everyone knocked out, in the order they joined.
export function down(party) {
  return Object.keys(party.members).filter((key) => party.members[key].down !== null);
}

// Brings the party in line with who is fighting now, on tick `tick`.
// `fighters` is every character attacking the monster or knocked out while
// doing it (a knocked-out agent is still working, so it stays): a list of
// { key, maxHp, x, y }. Newcomers join at full HP; anyone not in the list
// leaves, and if they come back they start afresh. Positions are updated, and
// a change of max HP keeps the HP lost: a rise adds to it, a fall cuts it to
// the new max. Once someone is there, the monster's first attack is set within
// a gap from now (firstGap), and how many single blows come before the
// first area attack drawn. Once nobody is left, the boss's attack under way
// and the last one that landed are dropped (they never land or show). Returns
// the keys that joined and left.
export function syncParty(party, fighters, tick, random) {
  const seen = new Set();
  const joined = [];
  for (const f of Array.isArray(fighters) ? fighters : []) {
    if (!f || typeof f.key !== "string" || seen.has(f.key)) continue;
    seen.add(f.key);
    const maxHp = Math.min(positive(f.maxHp) || 1, Number.MAX_VALUE);
    const m = Object.prototype.hasOwnProperty.call(party.members, f.key) ? party.members[f.key] : null;
    if (!m) {
      party.members[f.key] = { hp: maxHp, maxHp, x: f.x, y: f.y, down: null, hitAt: null, healedAt: null };
      joined.push(f.key);
      continue;
    }
    if (maxHp !== m.maxHp) {
      if (m.down === null) m.hp = Math.min(maxHp, Math.max(Number.MIN_VALUE, m.hp + Math.max(0, maxHp - m.maxHp)));
      m.maxHp = maxHp;
    }
    m.x = f.x;
    m.y = f.y;
  }
  const left = Object.keys(party.members).filter((key) => !seen.has(key));
  for (const key of left) delete party.members[key];
  if (!Object.keys(party.members).length) {
    // nobody left to fight: the boss's attack under way, and what last landed, go with them
    party.foe.next = party.foe.pending = party.foe.last = null;
  } else if (party.foe.next === null) {
    party.foe.next = tick + firstGap(random);
    party.foe.singles = SINGLES_BETWEEN[pick(random, SINGLES_BETWEEN.length)];
  }
  return { joined, left };
}

// Starts afresh, as at a new attempt at the stage (after a wipe or when the
// time runs out): everyone up at full HP, no attack under way, and the
// monster's first attack within a gap of `tick` (firstGap).
export function resetParty(party, tick, random) {
  for (const m of Object.values(party.members)) {
    m.hp = m.maxHp;
    m.down = m.hitAt = m.healedAt = null;
  }
  party.foe.pending = party.foe.last = null;
  party.foe.singles = SINGLES_BETWEEN[pick(random, SINGLES_BETWEEN.length)];
  party.foe.next = Object.keys(party.members).length ? tick + firstGap(random) : null;
}

// Anyone whose rest is over gets up at full HP, on tick `tick`. Returns their
// keys. monsterTick does this first; call it on its own on ticks with no boss
// to fight (between a kill and the next), so rests run on.
export function rise(party, tick) {
  const back = [];
  for (const [key, m] of Object.entries(party.members)) {
    if (m.down !== null && tick >= m.down) {
      m.down = null;
      m.hp = m.maxHp;
      back.push(key);
    }
  }
  return back;
}

// Who is inside the ring an area attack aimed at x, y covers (AREA_RADIUS
// either side, AREA_DEPTH of it up and down the floor), on their feet, in the
// order they joined. A spot or a position that is not a number is never
// inside it.
export function inArea(party, x, y) {
  return up(party).filter((key) => {
    const m = party.members[key];
    const dx = (m.x - x) / AREA_RADIUS;
    const dy = (m.y - y) / (AREA_RADIUS * AREA_DEPTH);
    return finite(dx) && finite(dy) && dx * dx + dy * dy <= 1;
  });
}

// One tick of the monster's side of the fight, on tick `tick` (call it after
// syncParty, on every tick of the attack clock). `damage` is the stage's
// (see hitDamage). In order: anyone whose rest is over gets up at full HP;
// an attack due to land lands; a new one starts if it is time and anyone is
// standing. Returns what happened, for main.js to show:
//   { back: [<key>], landed: Attack | null, hits: [{ key, damage, hp, down }],
//     started: Attack | null, wiped }
// `hits` holds each character the blow reached, the damage it took and the
// HP left, `down` whether that knocked it out; a single blow whose target has
// left or been knocked out by then lands on nobody. `wiped` is true when this
// tick's blow knocked out the last one standing: the attempt has failed, and
// main.js resets the stage and calls resetParty.
export function monsterTick(party, tick, damage, random) {
  const foe = party.foe;
  const out = { back: rise(party, tick), landed: null, hits: [], started: null, wiped: false };
  const a = foe.pending;
  if (a && tick >= a.lands) {
    foe.pending = null;
    foe.last = a;
    out.landed = a;
    const struck = a.kind === "area" ? inArea(party, a.x, a.y) : standing(party, a.target) ? [a.target] : [];
    const dealt = hitDamage(damage, up(party).length);
    for (const key of struck) {
      const m = party.members[key];
      m.hp = m.hp - dealt > 0 ? m.hp - dealt : 0;
      m.hitAt = tick;
      const ko = m.hp === 0;
      if (ko) m.down = tick + KO_TICKS;
      out.hits.push({ key, damage: dealt, hp: m.hp, down: ko });
    }
    out.wiped = out.hits.some((h) => h.down) && up(party).length === 0;
  }
  const standingNow = up(party);
  if (!foe.pending && foe.next !== null && tick >= foe.next && standingNow.length && !out.wiped) {
    const target = standingNow[pick(random, standingNow.length)];
    const m = party.members[target];
    const area = foe.singles <= 0;
    foe.singles = area ? SINGLES_BETWEEN[pick(random, SINGLES_BETWEEN.length)] : foe.singles - 1;
    foe.seq += 1;
    foe.pending = {
      id: foe.seq,
      kind: area ? "area" : "single",
      target,
      x: m.x,
      y: m.y,
      start: tick,
      lands: tick + (area ? AREA_WARNING_TICKS : SINGLE_WINDUP_TICKS),
    };
    foe.next = tick + monsterGap(random);
    out.started = foe.pending;
  }
  return out;
}

// Whether a character of class `cls` throwing a potion of `potion` heals (the
// healer's Heal Vial; the other potions never do).
export const heals = (cls, potion) => cls === "healer" && potion === HEAL_POTION;

// Who a healer `key` would heal now instead of attacking, or null to attack:
// the standing attacker (itself included) with the least HP for its max, if
// that is under HEAL_BELOW of it; the first to join on a tie. Never someone
// knocked out, and nobody while the healer itself is down. main.js asks as
// the healer's attack starts, and again at its impact (whoever it aimed at may
// have left, fallen or been topped up), then heals with healParty (healOf).
// `taken`: allies another healer is already healing this tick, passed over
// while anyone else qualifies.
export function healTarget(party, key, taken = []) {
  if (!standing(party, key)) return null;
  const lowest = (skip) => {
    let best = null;
    let low = HEAL_BELOW;
    for (const k of up(party)) {
      if (skip.includes(k)) continue;
      const m = party.members[k];
      const share = m.hp / m.maxHp;
      if (share < low) {
        best = k;
        low = share;
      }
    }
    return best;
  };
  return lowest(Array.isArray(taken) ? taken : []) ?? lowest([]);
}

// Heals `key` by `amount` on tick `tick`, up to its max HP; nothing if it has
// left or been knocked out. Returns the HP it got back.
export function healParty(party, key, amount, tick) {
  if (!standing(party, key)) return 0;
  const m = party.members[key];
  const got = Math.min(m.maxHp - m.hp, positive(amount));
  if (got <= 0) return 0;
  m.hp += got;
  m.healedAt = tick;
  return got;
}

// The whole seconds of rest a knocked-out character has left as of tick
// `tick` (rounded up, at most KO_TICKS' worth), for the number counting down
// by it; 0 for anyone standing or not in the fight.
export function restSeconds(party, key, tick) {
  const m = Object.prototype.hasOwnProperty.call(party.members, key) ? party.members[key] : null;
  if (!m || m.down === null || !finite(tick)) return 0;
  return Math.min(KO_TICKS / SECOND, Math.max(0, Math.ceil((m.down - tick) / SECOND)));
}

// How much of its rest a knocked-out character has left, from 1 (just
// knocked out) to 0 (getting up), for its countdown; 0 for anyone standing.
export function restLeft(party, key, tick) {
  const m = Object.prototype.hasOwnProperty.call(party.members, key) ? party.members[key] : null;
  if (!m || m.down === null) return 0;
  return Math.min(1, Math.max(0, (m.down - tick) / KO_TICKS));
}
