// Idle RPG's weapon effects: what a weapon does in a fight, beyond how it
// looks. Plain functions with no host calls, like rules.js, so main.js does
// the drawing and timing and these can be run on their own.
//
// Every number here is a default chosen to be retuned.
//
// - Weapon stats: every weapon deals the same damage per second as its
//   class's default, but feels different. A weapon multiplies both the damage
//   of a blow and the gap between attacks by the same factor (WEAPON_FACTORS):
//   a hammer hits twice as hard, half as often. Gaps are real numbers of ticks
//   and their fractions carry (see cadence and nextGap), so over a long fight
//   the damage is exactly equal.
// - Elements: each monster kind is weak to one element (WEAK_FACTOR more
//   damage) and resists another (RESIST_FACTOR), and each element brings one
//   status on the monster: fire Burn (damage over time, refreshed by each
//   hit), frost Chill (while it lasts, everyone's crit chance is higher),
//   storm Chain (a chance the blow strikes twice), poison Venom (stacks, each
//   ticking damage). Damage over time is a share of the blow that applied it,
//   so it grows with the party, and it is credited to the class that applied
//   it.
// - Potions: a healer throwing the Haste, Might or Hex Vial gives the party an
//   aura while it is in the fight (faster attacks, more damage, the monster
//   taking more damage), and deals half damage itself. Several healers on the
//   same vial give one aura; different vials all count. The Heal Vial has
//   none.
//
// Effects belong to a class, not to an agent (agents are short-lived): every
// character of a class fights with the weapon the class has equipped.
// Statuses live in memory with the monster they are on and are never saved.

import { ATTACK_TICKS, CLASSES, CRIT_MULTIPLIER, DEFAULT_LOOK, KINDS, MIN_ATTACK_TICKS, SHOP } from "./rules.js";

// ---- Weapon stats ----------------------------------------------------------
// Each weapon's factor, per class and weapon id: its blows deal this many times
// its class's damage, and its attacks come this many times as far apart. The
// ids are those of SHOP.weapon in rules.js; one missing here counts as 1.
//   Warrior: Sword 1; War Axe 1.5 (hits harder, slower); Hammer 2; Fire Blade
//     1 (a sword).
//   Wizard: Fire Staff 1; Ice Wand 0.75 (a wand: faster, lighter); Bolt Staff
//     1 (a staff, like the Fire Staff); Toxic Rod 0.75 (a wand).
//   Archer: Longbow 1; Crossbow 2; Fire Bow and Ice Bow 1 (longbows with
//     elemental arrows).
//   Healer: every vial 1 (one throw is one throw).
export const WEAPON_FACTORS = {
  wizard: { [DEFAULT_LOOK]: 1, frost: 0.75, storm: 1, venom: 0.75 },
  healer: { [DEFAULT_LOOK]: 1, haste: 1, might: 1, hex: 1 },
  warrior: { [DEFAULT_LOOK]: 1, axe: 1.5, hammer: 2, flame: 1 },
  archer: { [DEFAULT_LOOK]: 1, crossbow: 2, flame: 1, frost: 1 },
};
// No gap is shorter than MIN_ATTACK_TICKS (an attack's phases and its impact's
// fade, see rules.js). A fast weapon whose gap would go under it has its gap
// held there and its damage raised to match, so it still deals what its
// class's default does per second.
export const GAP_JITTER = 2; // each gap is its mean give or take up to this many ticks, evenly
const MAX_GAP_TICKS = 1e6; // a gap past this (about three days) is taken as this, so nothing overflows

// ---- Elements --------------------------------------------------------------
export const WEAK_FACTOR = 1.5; // damage of a monster's weakness
export const RESIST_FACTOR = 0.75; // damage of the element it resists
// Each monster kind's weakness and resistance (KINDS in rules.js).
export const WEAKNESS = {
  slime: { weak: "frost", resist: "poison" },
  ogre: { weak: "fire", resist: "storm" },
  dragon: { weak: "frost", resist: "fire" },
};
// The status each element brings (ELEMENTS in rules.js).
export const ELEMENT_STATUS = { fire: "burn", frost: "chill", storm: "chain", poison: "venom" };

// Burn (fire): a hit sets the monster burning for BURN_TICKS, dealing BURN_SHARE
// of the blow's damage over that time on top of it. Another fire hit by the
// same class refreshes it: what was still to burn is kept and the new hit's
// added, spread over a fresh BURN_TICKS. Each class's burn is its own.
export const BURN_SHARE = 0.2; // like Chain's and Venom's: every damaging element is +20% on a monster neutral to it
export const BURN_TICKS = 12; // 3s
// Chill (frost): while chilled (CHILL_TICKS after the last frost hit), every
// blow on the monster, anyone's, has CHILL_CRIT more chance to be critical.
// Long enough that one frost weapon at the default pace keeps it up.
export const CHILL_CRIT = 0.1;
export const CHILL_TICKS = 16; // 4s
// Chain (storm): CHAIN_CHANCE that the blow strikes twice, the second strike
// the same as the first.
export const CHAIN_CHANCE = 0.2;
// Venom (poison): each hit adds a stack dealing VENOM_SHARE of the blow's
// damage over VENOM_TICKS. At most VENOM_STACKS on a monster, from anyone; a
// hit past that replaces the stack with the least left to deal.
export const VENOM_SHARE = 0.2;
export const VENOM_TICKS = 24; // 6s
export const VENOM_STACKS = 5;

// ---- Potions ---------------------------------------------------------------
// The auras a healer's vial gives the whole party (and the healer) while it is
// fighting, by potion (POTIONS in rules.js; the Heal Vial gives none).
export const AURAS = ["haste", "might", "hex"];
export const HASTE_AURA_SHARE = 0.15; // haste: every party member's gap this much shorter (a share; MIN_ATTACK_TICKS still the floor)
export const MIGHT_BONUS = 0.3; // might: every blow deals this much more (a share)
export const HEX_BONUS = 0.15; // hex: the monster takes this much more from everything (a share)
export const AURA_HEALER_DAMAGE = 0.5; // a healer giving an aura deals this share of its damage

// ---- Small helpers ---------------------------------------------------------
const has = (map, key) => map !== null && typeof map === "object" && Object.prototype.hasOwnProperty.call(map, key);
const finite = (v) => typeof v === "number" && Number.isFinite(v);
const nonneg = (v, fallback = 0) => (finite(v) && v >= 0 ? v : fallback);
const positive = (v, fallback) => (finite(v) && v > 0 ? v : fallback);
const random = (rand) => {
  const r = typeof rand === "function" ? rand() : Math.random();
  return finite(r) ? Math.min(Math.max(r, 0), 1) : 0.5;
};

// ---- Weapons ---------------------------------------------------------------
// What weapon `weapon` of class `cls` does: { cls, id, factor, element, potion }.
// Anything that is not one of the class's weapons is its default (as the art
// builders in rules.js treat it); an unknown class gets plain stats with no
// class (factor 1, no element, no potion), so it neither burns nor gives an
// aura.
export function statsOf(cls, weapon) {
  if (!CLASSES.includes(cls)) return { cls: null, id: DEFAULT_LOOK, factor: 1, element: null, potion: null };
  const items = SHOP.weapon.items[cls];
  const item = items.find((it) => it.id === weapon) ?? items[0];
  const factor = has(WEAPON_FACTORS[cls], item.id) ? positive(WEAPON_FACTORS[cls][item.id], 1) : 1;
  return { cls, id: item.id, factor, element: item.element ?? null, potion: item.potion ?? null };
}

// A weapon's factor (see WEAPON_FACTORS): its gap and its damage both multiply by it.
export const gapFactor = (cls, weapon) => statsOf(cls, weapon).factor;

// How an element meets a monster kind: "weak", "resist" or null.
export function matchup(kind, element) {
  if (!has(WEAKNESS, kind) || element == null) return null;
  return WEAKNESS[kind].weak === element ? "weak" : WEAKNESS[kind].resist === element ? "resist" : null;
}

// What an element's damage is multiplied by on a monster kind.
export function elementFactor(kind, element) {
  const m = matchup(kind, element);
  return m === "weak" ? WEAK_FACTOR : m === "resist" ? RESIST_FACTOR : 1;
}

// ---- Auras -----------------------------------------------------------------
// No auras: { haste: false, might: false, hex: false }.
export const noAuras = () => Object.fromEntries(AURAS.map((a) => [a, false]));

// The party's auras from who is fighting: `fighters` is a list of { cls,
// weapon }, one per character attacking (agents and you), weapon the id the
// class has equipped. A healer with the Haste, Might or Hex Vial gives that
// aura; two on one vial give it once.
export function partyAuras(fighters) {
  const out = noAuras();
  for (const f of Array.isArray(fighters) ? fighters : []) {
    const potion = f && f.cls === "healer" ? statsOf(f.cls, f.weapon).potion : null;
    if (AURAS.includes(potion)) out[potion] = true;
  }
  return out;
}

// Only the known auras, as booleans, from whatever was passed.
const aurasOf = (auras) => Object.fromEntries(AURAS.map((a) => [a, has(auras, a) && auras[a] === true]));

// Whether weapon `weapon` makes a character of `cls` an aura healer (half damage).
const givesAura = (cls, weapon) => AURAS.includes(statsOf(cls, weapon).potion);

// ---- Cadence ---------------------------------------------------------------
// One character's pace: `baseTicks` is the mean gap its class's skills give
// (attackTicksOf in rules.js), `auras` the party's. Returns { ticks, factor }:
// the mean gap in ticks (a real number, never under MIN_ATTACK_TICKS) and what
// its blows' damage is multiplied by for it (the weapon's factor, or more where
// the gap was held at the floor), so its damage per tick is the class
// default's. The haste aura takes HASTE_AURA_SHARE off the class's gap before
// the weapon's factor applies.
export function cadence(baseTicks, cls, weapon, auras) {
  const base = Math.min(positive(baseTicks, ATTACK_TICKS[0]), MAX_GAP_TICKS);
  const hasted = Math.max(MIN_ATTACK_TICKS, base * (aurasOf(auras).haste ? 1 - HASTE_AURA_SHARE : 1));
  const ticks = Math.max(MIN_ATTACK_TICKS, hasted * gapFactor(cls, weapon));
  return { ticks, factor: ticks / hasted };
}

// The gap before a character's next attack, given its mean `ticks` (from
// cadence) and a random number `r` from 0 up to 1: up to GAP_JITTER ticks either
// way, evenly, never under MIN_ATTACK_TICKS, so its mean is `ticks`. A real
// number: main.js adds it to when the last attack was due (not when it
// started), so the fractions carry and none is lost to rounding.
export function nextGap(ticks, r) {
  const mean = Math.max(MIN_ATTACK_TICKS, Math.min(positive(ticks, ATTACK_TICKS[0]), MAX_GAP_TICKS * 2));
  const spread = Math.min(GAP_JITTER, mean - MIN_ATTACK_TICKS);
  const x = finite(r) ? Math.min(Math.max(r, 0), 1) : 0.5;
  return mean + spread * (2 * x - 1);
}

// ---- Statuses --------------------------------------------------------------
// A monster's statuses, none on: { burn: { <class>: { left, ticks } }, chill,
// venom: [{ cls, left, ticks }] }. `left` is the damage still to deal (before
// the monster's weakness and the hex, which apply as it ticks), `ticks` how
// many ticks it lasts; `chill` is the ticks of chill left. Kept with the
// monster in memory, a fresh one for each monster.
export function newStatuses() {
  return { burn: {}, chill: 0, venom: [] };
}

// A statuses object to work on: the one passed if it is well formed, made so
// in place (anything malformed dropped), else a fresh one.
function statusesOf(st) {
  if (st === null || typeof st !== "object") return newStatuses();
  const dot = (d) => d !== null && typeof d === "object" && finite(d.left) && d.left > 0 && Number.isInteger(d.ticks) && d.ticks > 0;
  if (st.burn === null || typeof st.burn !== "object" || Array.isArray(st.burn)) st.burn = {};
  for (const k of Object.keys(st.burn)) if (!CLASSES.includes(k) || !dot(st.burn[k])) delete st.burn[k];
  st.chill = Number.isInteger(st.chill) && st.chill > 0 ? st.chill : 0;
  st.venom = Array.isArray(st.venom) ? st.venom.filter((v) => dot(v) && CLASSES.includes(v.cls)) : [];
  return st;
}

// Lands one blow. `blow` is { cls, weapon, damage, critChance, critMultiplier,
// factor }: the attacker's class and its weapon's id, the class's damage per
// blow before the weapon, its crit chance (0 to 1) and multiplier (rules.js's
// by default), and the damage factor from cadence (the weapon's own by
// default). `kind` is the monster's kind, `statuses` its statuses (changed in
// place: this hit's burn, chill or venom is put on), `auras` the party's, and
// `rand` a random source (rand() from 0 up to 1; two calls at most, crit then
// chain). Chill, if on, raises the crit chance before the roll.
//
// Returns { cls, element, matchup, hits: [{ damage, crit, chain }], damage }:
// one hit, or two when it chains (the second the same as the first, `chain`
// true), each damage a real number from 0 up with every multiplier in (the
// weapon, an aura healer's half, might, the crit, the monster's weakness or
// resistance, the hex); `damage` is their sum. Crediting is to `cls` (null for
// an unknown class).
export function strike(blow, kind, statuses, auras, rand) {
  const b = blow !== null && typeof blow === "object" ? blow : {};
  const st = statusesOf(statuses);
  const a = aurasOf(auras);
  const w = statsOf(b.cls, b.weapon);
  const factor = positive(b.factor, w.factor);
  const chance = Math.min(1, nonneg(b.critChance) + (st.chill > 0 ? CHILL_CRIT : 0));
  const crit = random(rand) < chance;
  const multiplier = finite(b.critMultiplier) && b.critMultiplier >= 1 ? b.critMultiplier : CRIT_MULTIPLIER;
  // what the party deals, before the monster takes it
  const dealt =
    nonneg(b.damage) * factor * (givesAura(w.cls, w.id) ? AURA_HEALER_DAMAGE : 1) * (a.might ? 1 + MIGHT_BONUS : 1) * (crit ? multiplier : 1);
  const taken = (n) => n * elementFactor(kind, w.element) * (a.hex ? 1 + HEX_BONUS : 1);
  const hit = { damage: taken(dealt), crit, chain: false };
  const hits = [hit];
  if (w.element === "storm" && random(rand) < CHAIN_CHANCE) hits.push({ ...hit, chain: true });
  if (w.cls && dealt > 0) {
    if (w.element === "fire") {
      const b0 = st.burn[w.cls];
      st.burn[w.cls] = { left: (b0 ? b0.left : 0) + dealt * BURN_SHARE, ticks: BURN_TICKS };
    } else if (w.element === "frost") st.chill = CHILL_TICKS;
    else if (w.element === "poison") {
      if (st.venom.length >= VENOM_STACKS) {
        // the stack with least left to deal goes (the oldest, of equal ones)
        let least = 0;
        st.venom.forEach((v, i) => {
          if (v.left < st.venom[least].left) least = i;
        });
        st.venom.splice(least, 1);
      }
      st.venom.push({ cls: w.cls, left: dealt * VENOM_SHARE, ticks: VENOM_TICKS });
    }
  }
  return { cls: w.cls, element: w.element, matchup: matchup(kind, w.element), hits, damage: hits.reduce((s, h) => s + h.damage, 0) };
}

// One tick of the monster's statuses (every TICK_STEP while it is being
// fought): each burn and venom stack deals its share of what it has left
// (left / ticks, so it is all dealt by its last tick), the chill wears off a
// tick, and whatever has run out is taken off. `statuses` is changed in place.
// Returns what landed: [{ cls, status, element, matchup, damage }], one per
// burning class and per venom stack, damage with the monster's weakness and
// the hex in, credited to `cls`.
export function tickStatuses(statuses, kind, auras) {
  const st = statusesOf(statuses);
  const hex = aurasOf(auras).hex ? 1 + HEX_BONUS : 1;
  const out = [];
  const step = (d) => {
    const n = d.left / d.ticks;
    d.left -= n;
    d.ticks -= 1;
    if (d.ticks === 0) d.left = 0;
    return n;
  };
  for (const cls of Object.keys(st.burn)) {
    const n = step(st.burn[cls]);
    out.push({ cls, status: "burn", element: "fire", matchup: matchup(kind, "fire"), damage: n * elementFactor(kind, "fire") * hex });
    if (st.burn[cls].ticks === 0) delete st.burn[cls];
  }
  for (const v of st.venom) {
    const n = step(v);
    out.push({ cls: v.cls, status: "venom", element: "poison", matchup: matchup(kind, "poison"), damage: n * elementFactor(kind, "poison") * hex });
  }
  st.venom = st.venom.filter((v) => v.ticks > 0);
  if (st.chill > 0) st.chill -= 1;
  return out;
}

// ---- Words, for the shop ---------------------------------------------------
const NUMBER = (n) => String(Math.round(n * 100) / 100);
const percent = (n) => `${Math.round(n * 100)}%`;
const seconds = (ticks) => `${NUMBER(ticks / 4)}s`; // ticks of 250ms (TICK_STEP)
const SPEED_WORDS = { 0.5: "half speed", 1: "normal speed" };
function speedText(factor) {
  const speed = 1 / factor;
  if (has(SPEED_WORDS, speed)) return SPEED_WORDS[speed];
  // a simple fraction where there is one (2/3, 4/3), else a decimal
  for (let d = 2; d <= 4; d += 1) {
    const n = speed * d;
    if (Math.abs(n - Math.round(n)) < 1e-9) return `${Math.round(n)}/${d} speed`;
  }
  return `${NUMBER(speed)}× speed`;
}
const STATUS_TEXT = {
  burn: `Burn: +${percent(BURN_SHARE)} over ${seconds(BURN_TICKS)}`,
  chill: `Chill: +${percent(CHILL_CRIT)} crit for all`,
  chain: `Chain: ${percent(CHAIN_CHANCE)} to strike twice`,
  venom: `Venom: +${percent(VENOM_SHARE)} over ${seconds(VENOM_TICKS)}, ${VENOM_STACKS} stacks`,
};
const AURA_TEXT = {
  haste: `Aura: party gaps -${percent(HASTE_AURA_SHARE)}`,
  might: `Aura: party +${percent(MIGHT_BONUS)} damage`,
  hex: `Aura: foe takes +${percent(HEX_BONUS)}`,
};

// Short lines saying what a weapon does, for the shop: its pace ("2× damage,
// half speed"), its element's status ("Burn: +25% over 3s"), the kinds weak
// to and resisting it ("Weak: slime, dragon", "Resist: ogre"), and a vial's
// aura ("Aura: party +20% damage", "Half damage itself"). Unknown ids are the
// class's default, as in statsOf.
export function statLines(cls, weapon) {
  const w = statsOf(cls, weapon);
  const lines = [w.factor === 1 ? "Normal speed" : `${NUMBER(w.factor)}× damage, ${speedText(w.factor)}`];
  if (w.element) {
    lines.push(STATUS_TEXT[ELEMENT_STATUS[w.element]]);
    const weak = KINDS.filter((k) => matchup(k, w.element) === "weak");
    const resist = KINDS.filter((k) => matchup(k, w.element) === "resist");
    if (weak.length) lines.push(`Weak: ${weak.join(", ")}`);
    if (resist.length) lines.push(`Resist: ${resist.join(", ")}`);
  }
  if (AURAS.includes(w.potion)) lines.push(AURA_TEXT[w.potion], "Half damage itself");
  return lines;
}

// ---- Pictures --------------------------------------------------------------
// The icons for the monster's name plate (statuses on it, and the hex) and for
// the party's side (the haste and might auras), in art/effects/icons/; the
// marks for a damage number that hit a weakness or a resistance, in
// art/effects/marks/; and the pictures laid over the monster while a status
// is on it, in art/effects/<status>/ (see tools/idle-rpg-sprites.py).
export const EFFECT_ICONS = ["burn", "chill", "venom", "hex", "haste", "might"];
export const EFFECT_MARKS = ["weak", "resist"];
export const EFFECT_OVERLAYS = {
  burn: ["flame-1", "flame-2"],
  chill: ["crystal", "glint"],
  chain: ["arc/l", "arc/r"],
  venom: ["drip-1", "drip-2"],
};

// The path in art/ of an effect's icon ("effects/icons/burn.png"), or null.
export function effectIconArt(id) {
  return EFFECT_ICONS.includes(id) ? `effects/icons/${id}.png` : null;
}

// The path in art/ of the mark for a matchup ("weak" or "resist"), or null.
export function markArt(m) {
  return EFFECT_MARKS.includes(m) ? `effects/marks/${m}.png` : null;
}

// The path in art/ of one picture of a status shown on the monster
// ("effects/burn/flame-1.png"), or null for a status or picture it does not have.
export function overlayArt(status, part) {
  return has(EFFECT_OVERLAYS, status) && EFFECT_OVERLAYS[status].includes(part) ? `effects/${status}/${part}.png` : null;
}

// What the monster's name plate shows: [{ id, n }] for each status on it, in
// EFFECT_ICONS order, then the hex if the party has it (n is the venom's
// stacks, else 1).
export function plateIcons(statuses, auras) {
  const st = statusesOf(statuses);
  const out = [];
  if (Object.keys(st.burn).length) out.push({ id: "burn", n: 1 });
  if (st.chill > 0) out.push({ id: "chill", n: 1 });
  if (st.venom.length) out.push({ id: "venom", n: st.venom.length });
  if (aurasOf(auras).hex) out.push({ id: "hex", n: 1 });
  return out;
}

// The party's auras shown on its side: [{ id }] for haste and might.
export function partyIcons(auras) {
  const a = aurasOf(auras);
  return ["haste", "might"].filter((id) => a[id]).map((id) => ({ id }));
}
