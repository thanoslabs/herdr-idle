// Idle RPG's party in a fight: the monster attacks back. Plain data and plain
// functions with no host calls, like rules.js, so main.js does the drawing and
// these can be run on their own.
//
// Only characters attacking the monster can be hit: the working agents in the
// fight, and you while you fight beside them. Each has HP of its own, kept in
// memory only (agents are short-lived; nothing here is saved): one who stops
// attacking leaves the party, and comes back as it left within the attempt
// (see syncParty), fresh at the next. The monster attacks on its own rhythm:
// mostly a single blow at one attacker picked at random, now and then an
// area attack, aimed at an attacker's spot
// and shown on the floor before it lands, that hits everyone attacking within
// a ring around that spot (AREA_RADIUS, AREA_DEPTH). A character at 0 HP is
// knocked out: it stops attacking (though it is still working) and rests
// KO_TICKS, then comes back at full HP. Everyone down at once ends nothing:
// the boss waits for someone to get up (see monsterTick), and only the clock
// running out loses the attempt. Every healer heals, on a rhythm of its own
// (healTicks: HEAL_GAP_TICKS, half that with the Heal Vial), whether its agent
// is working or not: a potion to the standing fighter lowest on HP for its max
// (healTarget). Max HP, the boss's damage at a stage and what a heal restores
// are stats, in rules.js (maxHpOf, stageDamage, healOf); HP is a real number,
// like damage.
//
// Time is counted in the attack clock's ticks (TICK_STEP, 250ms), so main.js
// calls monsterTick from its own tick and needs no timer of its own. Anything
// random takes `random`, a function returning a number from 0 to 1 (below 1),
// so the same draws give the same fight.
//
// The party is a plain object (see newParty) that these functions change in
// place, as rules.js changes the progress:
//   {
//     members: { <key>: { hp, maxHp, x, y, down, hitAt, healedAt, back? } },  (no prototype)
//     away: { <key>: { hp, maxHp, rest } },  (who left this attempt; rest: ticks of it left, or null)
//     foe: { next, singles, pending, last, seq },
//   }
// A member's `down` is the tick it gets back up while it is knocked out, or
// null; `hitAt` and `healedAt` the tick it was last hit or healed (null if
// never), for main.js to flash it; `back`, only while one came back from away
// still knocked out, the tick it came back (its countdown counts from there). `x`, `y` are where it stands, in floor px
// (its feet). The foe's `next` is the tick its next attack starts (null until
// someone is there to attack), `singles` how many single blows come before its
// next area attack, `pending` the attack under way (see Attack below) or null,
// `last` the latest attack that landed (for its impact), and `seq` the last
// attack's id.
//
// An attack is { id, kind, target, x, y, ox, oy, start, lands }: "single" or "area";
// the key it was aimed at; the spot it was aimed at (the target's feet when it
// started, as drawn and in the old formation: see caught); the tick it started (its wind-up, or the marker on the floor) and
// the tick it lands.

import { KO_SECONDS, TICK_STEP } from "./rules.js";

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
// seconds (KO_SECONDS in rules.js, which numbers the countdown's ring), the
// owner's number, with a countdown by the character (main.js).
// An attempt has 10 minutes (STAGE_MS), so one knocked out comes back
// mid-fight.
export const KO_TICKS = KO_SECONDS * SECOND;
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
// Healing: every healer throws a healing potion now and then, at the standing
// fighter with the least HP for its max (healTarget; healOf in rules.js says
// how much), whatever vial it holds and whether its agent is working or not:
// one standing by (idle, done or blocked) only heals; a working one heals on
// this rhythm as well as attacking on its own. The gap is HEAL_GAP_TICKS give
// or take HEAL_JITTER, evenly (a real number, carried like an attack's), and
// neither Haste nor an aura changes it. The Heal Vial (HEAL_POTION), which
// gives no aura, heals twice as often (HEAL_VIAL_GAP_TICKS).
export const HEAL_POTION = "heal";
export const HEAL_GAP_TICKS = 6 * SECOND;
export const HEAL_VIAL_GAP_TICKS = 3 * SECOND;
export const HEAL_JITTER = 2;

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
  return { members: Object.create(null), away: Object.create(null), foe: { next: null, singles: 0, pending: null, last: null, seq: 0 } };
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
// { key, maxHp, x, y, ox?, oy? }: where each is drawn, and, only while main.js
// draws a crowd elsewhere, where it would stand in the formation a small
// party stands in (else the same as x, y; see caught). Newcomers join at full HP; anyone not in the list
// leaves, remembered in `away` for the attempt: coming back within it they
// have the HP they left with (a change of max HP as below) or, knocked out,
// the rest they had left (frozen while away, so leaving never cuts a rest);
// a new attempt (resetParty) forgets them. Positions are updated, and
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
      // back within the attempt: as it left (its HP lost, its rest still to run), else fresh
      const was = Object.prototype.hasOwnProperty.call(party.away, f.key) ? party.away[f.key] : null;
      const down = was && was.rest !== null ? tick + was.rest : null;
      const hp = !was ? maxHp : down !== null ? 0 : Math.min(maxHp, Math.max(Number.MIN_VALUE, was.hp + Math.max(0, maxHp - was.maxHp)));
      if (was) delete party.away[f.key];
      party.members[f.key] = { hp, maxHp, x: f.x, y: f.y, down, hitAt: null, healedAt: null };
      if (down !== null) party.members[f.key].back = tick;
      if (f.ox !== undefined) Object.assign(party.members[f.key], { ox: f.ox, oy: f.oy });
      joined.push(f.key);
      continue;
    }
    if (maxHp !== m.maxHp) {
      if (m.down === null) m.hp = Math.min(maxHp, Math.max(Number.MIN_VALUE, m.hp + Math.max(0, maxHp - m.maxHp)));
      m.maxHp = maxHp;
    }
    m.x = f.x;
    m.y = f.y;
    if (f.ox !== undefined) Object.assign(m, { ox: f.ox, oy: f.oy });
    else {
      delete m.ox;
      delete m.oy;
    }
  }
  const left = Object.keys(party.members).filter((key) => !seen.has(key));
  for (const key of left) {
    // remembered for the attempt, so leaving and coming back neither heals nor cuts a rest
    const m = party.members[key];
    party.away[key] = { hp: m.hp, maxHp: m.maxHp, rest: m.down === null ? null : Math.max(0, m.down - tick) };
    delete party.members[key];
  }
  if (!Object.keys(party.members).length) {
    // nobody left to fight: the boss's attack under way, and what last landed, go with them
    party.foe.next = party.foe.pending = party.foe.last = null;
  } else if (party.foe.next === null) {
    party.foe.next = tick + firstGap(random);
    party.foe.singles = SINGLES_BETWEEN[pick(random, SINGLES_BETWEEN.length)];
  }
  return { joined, left };
}

// Starts afresh, as at a new attempt at the stage (a new boss, or when the
// time runs out): everyone up at full HP, no attack under way, and the
// monster's first attack within a gap of `tick` (firstGap).
export function resetParty(party, tick, random) {
  party.away = Object.create(null); // who left the last attempt hurt or resting comes back fresh
  for (const m of Object.values(party.members)) {
    m.hp = m.maxHp;
    m.down = m.hitAt = m.healedAt = null;
    delete m.back;
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
      delete m.back;
      m.hp = m.maxHp;
      back.push(key);
    }
  }
  return back;
}

// How far a position p is from an area attack aimed at x, y, in its ring's
// own measure (1 its edge: AREA_RADIUS either side, AREA_DEPTH of it up and
// down the floor), squared; Infinity for a position that is not a number.
function ringDistance(px, py, x, y) {
  const dx = (px - x) / AREA_RADIUS;
  const dy = (py - y) / (AREA_RADIUS * AREA_DEPTH);
  return finite(dx) && finite(dy) ? dx * dx + dy * dy : Infinity;
}

// Who is inside the ring an area attack aimed at x, y covers (AREA_RADIUS
// either side, AREA_DEPTH of it up and down the floor), on their feet, in the
// order they joined. A spot or a position that is not a number is never
// inside it. `old`: by everyone's position in the formation a small party
// stands in (`ox`, `oy`, see syncParty) rather than where they are drawn.
export function inArea(party, x, y, old = false) {
  return up(party).filter((key) => {
    const m = party.members[key];
    return ringDistance(old ? (m.ox ?? m.x) : m.x, old ? (m.oy ?? m.y) : m.y, x, y) <= 1;
  });
}

// Who an area attack `a` (see monsterTick) catches as it lands, in the order
// they joined. How many is decided as for a small party, whatever the
// party's size: those standing inside the ring round the target's spot in the
// old formation (`a.ox`, `a.oy` and each member's `ox`, `oy`), so how a crowd
// is drawn never changes the fight (tools/sim.mjs keeps the old formation).
// Who: that many of those standing nearest to where the attack is drawn
// (`a.x`, `a.y`, the target's drawn spot), by the ring's own measure, the
// first to join on a tie. Where the drawn and old positions are the same (a
// small party) that is exactly who stands inside the ring.
export function caught(party, a) {
  const n = inArea(party, a.ox ?? a.x, a.oy ?? a.y, true).length;
  if (n === 0) return [];
  const standingNow = up(party);
  const order = new Map(standingNow.map((key, i) => [key, i]));
  const near = standingNow
    .map((key) => ({ key, d: ringDistance(party.members[key].x, party.members[key].y, a.x, a.y) }))
    .sort((p, q) => p.d - q.d || order.get(p.key) - order.get(q.key))
    .slice(0, n);
  const hit = new Set(near.map((p) => p.key));
  return standingNow.filter((key) => hit.has(key));
}

// One tick of the monster's side of the fight, on tick `tick` (call it after
// syncParty, on every tick of the attack clock). `damage` is the stage's
// (see hitDamage). In order: anyone whose rest is over gets up at full HP;
// an attack due to land lands; a new one starts if it is time and anyone is
// standing. With everyone knocked out the boss waits: its next attack is
// kept at least FIRST_ATTACK_TICKS off, so it comes no sooner than that after
// the last tick nobody stood (no draw, so it is the same in any fight).
// Returns what happened, for main.js to show:
//   { back: [<key>], landed: Attack | null, hits: [{ key, damage, hp, down }],
//     started: Attack | null }
// `hits` holds each character the blow reached, the damage it took and the
// HP left, `down` whether that knocked it out; a single blow whose target has
// left or been knocked out by then lands on nobody. A blow that knocks out the
// last one standing ends nothing: they rest and get up as ever.
export function monsterTick(party, tick, damage, random) {
  const foe = party.foe;
  const out = { back: rise(party, tick), landed: null, hits: [], started: null };
  const a = foe.pending;
  if (a && tick >= a.lands) {
    foe.pending = null;
    foe.last = a;
    out.landed = a;
    const struck = a.kind === "area" ? caught(party, a) : standing(party, a.target) ? [a.target] : [];
    const dealt = hitDamage(damage, up(party).length);
    for (const key of struck) {
      const m = party.members[key];
      m.hp = m.hp - dealt > 0 ? m.hp - dealt : 0;
      m.hitAt = tick;
      const ko = m.hp === 0;
      if (ko) m.down = tick + KO_TICKS;
      out.hits.push({ key, damage: dealt, hp: m.hp, down: ko });
    }
  }
  const standingNow = up(party);
  // nobody on their feet: nothing to aim at, so the attack waits for someone to get up
  if (!foe.pending && foe.next !== null && !standingNow.length) foe.next = Math.max(foe.next, tick + FIRST_ATTACK_TICKS);
  if (!foe.pending && foe.next !== null && tick >= foe.next && standingNow.length) {
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
      ...(m.ox !== undefined ? { ox: m.ox, oy: m.oy } : {}),
      start: tick,
      lands: tick + (area ? AREA_WARNING_TICKS : SINGLE_WINDUP_TICKS),
    };
    foe.next = tick + monsterGap(random);
    out.started = foe.pending;
  }
  return out;
}

// The mean gap between a healer's heals, in ticks, by the potion it holds:
// HEAL_VIAL_GAP_TICKS with the Heal Vial, else HEAL_GAP_TICKS.
export const healTicks = (potion) => (potion === HEAL_POTION ? HEAL_VIAL_GAP_TICKS : HEAL_GAP_TICKS);

// The gap before a healer's next heal, given its mean `ticks` (healTicks) and
// a draw `r` from 0 up to 1: HEAL_JITTER either way, evenly (a bad draw is the
// middle), never under one tick. A real number, added to when the last heal
// was due, so none is lost to rounding.
export function healGap(ticks, r) {
  const mean = Math.max(1, positive(ticks) || HEAL_GAP_TICKS);
  const spread = Math.min(HEAL_JITTER, mean - 1);
  const x = finite(r) ? Math.min(Math.max(r, 0), 1) : 0.5;
  return mean + spread * (2 * x - 1);
}

// How many ticks from now the first heal of a healer that has just come into
// the fight is due, given a draw `r`: anywhere in its first gap (from 1 tick),
// so healers that arrive together do not throw as one.
export function firstHeal(ticks, r) {
  const mean = Math.max(1, positive(ticks) || HEAL_GAP_TICKS);
  const x = finite(r) ? Math.min(Math.max(r, 0), 1) : 0.5;
  return 1 + x * (mean - 1);
}

// Who a heal goes to now, or null for nobody: the standing fighter with the
// least HP for its max, if under its max; the first to join on a tie. Never
// someone knocked out or not in the fight. Any healer asks (one standing by
// is not in the party; a working one may heal itself): main.js asks as the
// throw starts (no throw if nobody), and again at its impact (whoever it aimed
// at may have left, fallen or been topped up), then heals with healParty
// (healOf). `taken`: allies another healer is already healing this tick,
// passed over while anyone else qualifies.
export function healTarget(party, taken = []) {
  const lowest = (skip) => {
    let best = null;
    let low = 1;
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
