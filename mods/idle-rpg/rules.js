// Idle RPG's game rules: stages, experience, levels, skill points, training,
// the blows they buy, gold, kill counts, and loading the saved state. Plain
// functions with no host calls, so main.js does the drawing and these can be
// run on their own.
//
// The party fights the boss of a stage, numbered from 1, against the clock:
// killing it in time clears the stage and pays gold; running out of time (the
// only way to lose: a party knocked out waits out its rests) sends the party
// back a stage to farm (failStage). Boss HP grows
// exponentially with the stage, and training's price faster than gold, so the
// party has to keep growing to push on.
//
// Progress never belongs to an agent (agents come and go): it belongs to you
// and to the four classes. Every blow that lands earns experience for the
// class of whoever dealt it, and for you, who leads the raid, in proportion to
// the share of the boss's HP it took. Each level a class gains makes it hit
// harder and earns it a skill point, spent on that class's skills (harder,
// faster, or a chance of a critical blow); gold trains a class to hit harder
// still. All of it applies to every character on that class. Killing a boss
// also counts towards its kind. Gold buys looks in the shop, which also belong
// to a class: every character with that class on wears its colourway, its
// weapon and its hat (a hat, once bought, can be worn by any class). Levels are
// worked out from total experience, never stored; skill ranks and training
// levels are stored, and points left are worked out from levels and ranks.
// The town's decorations (SEASONS) are sold too: bought once, the town puts
// up the one equipped all year. Settings (SETTINGS) are kept with the rest of
// the state.

export const CLASSES = ["wizard", "healer", "warrior", "archer"];
export const YOU = "you"; // the person's key in `sprites`, `xp` and as an open card
export const STATE_VERSION = 9;

// Biomes: where a raid takes place. Every BIOME_STAGES stages the fight moves
// to the next biome, in this order, and after the last the four repeat
// (stages 1-10 forest, 11-20 hills, 21-30 caves, 31-40 hell, 41-50 forest
// again, ...). The town (out of a raid) is always the castle rampart. Each
// biome has its own backdrop (BIOME_ART, drawn by tools/idle-rpg-sprites.py
// into scene/<id>/); `outdoors` biomes have the sky, its day and night and
// the night's darkness, the others a fixed light of their own. Each name is
// a label (LABELS) the stage picker letters.
//
// Each biome has its own kinds of monster, { id, name, weak, resist }, in
// order: the last is its boss, fought at its tenth stage; the others share
// its first nine stages in turn (kindOf). `weak` is the element (ELEMENTS)
// that hurts it most, `resist` the one it shrugs off (effects.js applies
// them); every element is some kinds' weakness and others' resistance, so
// the party has reason to re-equip as it moves on. A kind's id names its
// pictures' folder (monsters/<id>/, MONSTER_ART) and its look in main.js
// (MONSTERS there); its name is lettered on its plate (LABELS).
export const BIOME_STAGES = 10;
export const BIOMES = [
  {
    id: "forest",
    name: "Forest",
    outdoors: true,
    kinds: [
      { id: "goblin", name: "Goblin", weak: "fire", resist: "poison" }, // scavengers that eat anything; afraid of fire
      { id: "lizard", name: "Lizard", weak: "frost", resist: "storm" }, // cold-blooded; its scales shed sparks
      { id: "slime", name: "Slime", weak: "frost", resist: "poison" },
    ],
  },
  {
    id: "hills",
    name: "Hills",
    outdoors: true,
    kinds: [
      { id: "orc", name: "Orc", weak: "poison", resist: "frost" }, // hardy hill folk, used to the cold
      { id: "ogre", name: "Ogre", weak: "fire", resist: "storm" },
      { id: "chief-ogre", name: "Chief Ogre", weak: "storm", resist: "frost" }, // furs against the cold; its crown draws lightning
    ],
  },
  {
    id: "caves",
    name: "Caves",
    outdoors: false,
    kinds: [
      { id: "wyvern", name: "Wyvern", weak: "storm", resist: "poison" }, // struck from the air; venom in its own tail
      { id: "draconian", name: "Draconian", weak: "poison", resist: "fire" }, // dragon-blooded; poison finds the gaps in its scales
      { id: "dragon", name: "Dragon", weak: "frost", resist: "fire" },
    ],
  },
  {
    id: "hell",
    name: "Hell",
    outdoors: false,
    kinds: [
      { id: "imp", name: "Imp", weak: "frost", resist: "fire" },
      { id: "magma-slime", name: "Magma Slime", weak: "frost", resist: "fire" },
      { id: "goblin-mage", name: "Goblin Mage", weak: "poison", resist: "storm" }, // a frail body behind its lightning
      { id: "demon", name: "Demon", weak: "storm", resist: "fire" },
    ],
  },
];
// Every kind of monster, biome by biome: { id, name, weak, resist, biome }.
export const MONSTER_KINDS = BIOMES.flatMap((b) => b.kinds.map((k) => ({ ...k, biome: b.id })));
// Their ids, in that order. main.js draws them (MONSTERS there), each needs
// its pictures in MONSTER_ART below.
export const KINDS = MONSTER_KINDS.map((k) => k.id);
// A kind's row of MONSTER_KINDS, or null for anything that is not one.
export const kindInfo = (id) => MONSTER_KINDS.find((k) => k.id === id) ?? null;

// Stages. Defaults chosen with a simulation (see PLAN.md) to be retuned; nothing
// else depends on their values. Boss HP grows exponentially, by HP_GROWTH a
// stage, times the stage number to HP_POWER (0 since attempts last 10
// minutes: early stages are the clock's, so they are kept long rather than
// steep). Gold grows by GOLD_GROWTH, a little faster than HP, so farming far
// below the party's limit (15 stages or more) pays less than nearer it, and a
// party that only hits hard cannot outrun one that can also last by farming
// low (gold a second is still best 3 to 5 stages below the limit); training's
// price grows faster still, so the further the party gets, the longer the next
// stage takes.
export const STAGE_HP = 900; // the stage 1 boss's HP (a lone agent's untrained blows take about 4 minutes)
export const HP_GROWTH = 1.175; // each stage's boss has this many times the HP of the one before (times the power below)
export const HP_POWER = 0; // HP also grows as the stage number to this power (0: not at all)
export const STAGE_MS = 600000; // the time limit of an attempt at any stage, 10 minutes (see stageTime), counted only while anyone is in the fight (main.js clockRuns)
// Gold for a kill grows with the party: more agents fighting means more gold,
// so more of them means faster progress. A kill pays ATTACKER_GOLD per
// attacker who took part, at stage 1, so the usual party of three agents and
// you (4) gets 2.
export const ATTACKER_GOLD = 0.5; // gold for killing the stage 1 boss, per attacker
export const MAX_GOLD_ATTACKERS = 20; // a crowd past this many pays as this many
export const GOLD_ATTACKERS = 4; // the attackers a kill is reckoned with when not told (3 agents and you)
export const GOLD_GROWTH = 1.23; // each stage's boss pays this many times the gold of the one before (rounded down)
// Experience grows with the party the same way: a kill at stage 1 earns
// ATTACKER_XP per fighter (the attackers gold counts), shared out by the damage
// each blow dealt, so more agents mean faster levels, not the same experience
// spread thinner (one agent and you, 2, earn what a kill earned before).
export const ATTACKER_XP = 200; // experience a whole kill at stage 1 earns, per attacker taking part
export const XP_GROWTH = 1.03; // each stage's kill earns this many times the experience of the one before
export const MAX_STAGE = 1000; // the furthest stage believed (a saved one past it is cut down)

// Damage. A blow deals BASE_DAMAGE times the class's level bonus, training
// bonus and Power bonus; a critical one CRIT_MULTIPLIER times that.
export const BASE_DAMAGE = 10; // a blow by a class at level 1, untrained, Power 0
export const LEVEL_BONUS = 0.12; // added to the damage multiplier per class level past 1 (level 11: x2.2)
export const CLASS_LEVEL_XP = 100; // a class goes from level n to n + 1 for CLASS_LEVEL_XP * n
export const PLAYER_LEVEL_XP = 250; // you go from level n to n + 1 for PLAYER_LEVEL_XP * n
export const PLAYER_XP_SHARE = 1; // you earn this many times what the classes earn, from every blow

// Training: gold makes a class hit harder (Attack) or last longer (Health), one
// level at a time, each level dearer than the last, on the same curve for both
// (each kind's price follows its own level). A kind of training is { key, name }.
export const TRAINING = [
  { key: "attack", name: "Attack" },
  { key: "health", name: "Health" },
];
export const TRAINING_BONUS = 1.12; // damage multiplier per level of Attack training (compounding)
export const HEALTH_BONUS = 1.12; // max HP multiplier per level of Health training (compounding)
export const TRAINING_PRICE = 5; // gold for the first level
export const TRAINING_PRICE_GROWTH = 1.45; // each level costs this many times the one before (rounded down)
export const MAX_TRAINING = 1000; // the most levels believed (a saved number past it is cut down)

// Monsters fight back (see party.js, which runs it). Every character fighting
// has HP: its class's base (the warrior, at the monster's feet, the most) times
// the class level's bonus (LEVEL_BONUS, as for damage) and its Health
// training's. The boss's blows grow with the stage as its HP does (and as
// Health training's levels do Attack's), so a party that trains both evenly
// meets much the same fight at every stage and one that skips Health falls
// behind: STAGE_DAMAGE x DAMAGE_GROWTH^(s-1) x s^DAMAGE_POWER is one blow on a
// party of PARTY_SIZE (party.js softens it for fewer); the power keeps the
// first stages' blows harmless. A healer's heal (every healer heals, see
// party.js) restores HEAL_SHARE of its own max HP: about one of the boss's
// blows on a light class at the stage being pushed, so in a fight of several
// minutes it keeps the party standing. Defaults chosen with a simulation (see PLAN.md),
// to be retuned. STAGE_DAMAGE was 5 while a party knocked out lost the
// attempt at once: with no wipes a lost push costs the whole ten minutes, so
// the boss hits a fifth softer and a party at its limit stands longer.
export const CLASS_HP = { wizard: 100, healer: 100, warrior: 200, archer: 130 };
export const STAGE_DAMAGE = 4;
export const DAMAGE_GROWTH = 1.175;
export const DAMAGE_POWER = 0.5;
export const HEAL_SHARE = 1;

// Skills. Every class has the same three for now; CLASS_SKILLS keeps a list per
// class so one can get its own later. Ranks are per class, so a skill applies
// to everyone with that class on, agents and you alike.
export const SKILLS = ["power", "haste", "crit"];
export const CLASS_SKILLS = Object.fromEntries(CLASSES.map((c) => [c, SKILLS]));
export const POINTS_PER_LEVEL = 1; // skill points a class earns per level past 1
export const RANK_COST = 1; // skill points per rank
export const MAX_RANK = 5;
export const POWER_BONUS = 0.2; // added to the damage multiplier per rank of Power
export const CRIT_CHANCE = 0.05; // chance of a critical blow per rank of Crit
export const CRIT_MULTIPLIER = 2; // a critical blow deals this many times the damage

// Attacks run on a clock of TICK_STEP ticks. One attack is ATTACK_PHASES ticks
// (wind-up, two of strike or flight, impact); the impact then fades for 350ms
// (main.js), which ends inside the second tick after it. So a character starts
// an attack at most every MIN_ATTACK_TICKS, and never before its last one is
// gone.
export const TICK_STEP = 250; // ms
export const ATTACK_PHASES = 4;
export const MIN_ATTACK_TICKS = ATTACK_PHASES + 2;
// Ticks between the starts of one character's attacks, by rank of Haste: one
// tick (250ms) less per rank, from 3s at rank 0 to 1.75s at rank 5.
export const ATTACK_TICKS = [12, 11, 10, 9, 8, 7];
// Each gap is that many ticks either way off its rank's, at random, so
// characters on the same rank do not fall into step (narrower where it would
// go under MIN_ATTACK_TICKS, so the average stays the rank's).
export const ATTACK_JITTER = 2;
// A knocked-out character rests this many seconds (party.js counts KO_TICKS
// from it), its whole seconds left counting down inside a ring that empties a
// step a second: status/rest/<n>, a picture for each of 1 to KO_SECONDS
// (tools/idle-rpg-sprites.py draws them), from restArt, which gives the one
// for `seconds` left (rounded up, kept to that range), or null for no number.
export const KO_SECONDS = 30;
export function restArt(seconds) {
  if (typeof seconds !== "number" || !Number.isFinite(seconds)) return null;
  return `status/rest/${Math.min(KO_SECONDS, Math.max(1, Math.ceil(seconds)))}.png`;
}

// Seasons: decorations the town (never a raid) puts up for part of the year,
// following the calendar in the machine's local time, while the "Decorate in
// season" setting is on: jack-o'-lanterns in October, string lights and a
// decorated tree in December. Each is also a set of town decor the shop sells
// (SHOP.decor) for `price` gold, shown all year while equipped (see decorOf).
// Each { id, name, months: [1-12], price }; adding a season is a row here, its
// pictures in SEASON_ART (drawn by tools/idle-rpg-sprites.py into
// seasons/<id>/) and drawing them in main.js.
export const DECOR_PRICE = 2500; // gold for each set of town decor: a mid-game buy (see PLAN.md)
export const SEASONS = [
  { id: "halloween", name: "Halloween", months: [10], price: DECOR_PRICE },
  { id: "winter", name: "Winter", months: [12], price: DECOR_PRICE },
];

// The season (SEASONS' id) at `when`, a Date or a timestamp in ms, in local
// time; null out of every season, or for anything that is not a time.
export function seasonOf(when) {
  const d = when instanceof Date ? when : typeof when === "number" ? new Date(when) : null;
  const t = d ? d.getTime() : NaN;
  if (!Number.isFinite(t)) return null;
  const month = d.getMonth() + 1;
  return SEASONS.find((s) => s.months.includes(month))?.id ?? null;
}

// Each season's pictures in seasons/<id>/, without ".png": "icon", its
// preview in the shop, and its decorations. Halloween:
// "lantern", a jack-o'-lantern, and "flicker", its carving burning brighter,
// laid over it and fading in and out. Winter: "lights-a" and "lights-b", a
// stretch of the string of bulbs along the rampart with alternate bulbs lit,
// and "tree", the decorated fir, with "twinkle", its star and baubles lit,
// laid over it. And "light/<name>": the night's darkness (as light/ in art/)
// with the decorations' own pools of light, standing in for the plain ones:
// the jack-o'-lanterns' on the barrel (candle) and in a torch's stretch
// (torch-<which>: "p" the one on the battlements over the torch, "a" and
// "b" those at the foot of the wall before and after it, each set that can
// be up: never "a" and "b" together), the bulbs' all along the rampart (every picture, the campfire's
// fire-0 to fire-23, its 24 places, included).
export const FIRE_LIGHTS = Array.from({ length: 24 }, (_, i) => `light/fire-${i}`);
export const LANTERN_LIGHTS = ["a", "b", "p", "pa", "pb"].map((set) => `light/torch-${set}`);
export const SEASON_ART = {
  halloween: ["icon", "lantern", "flicker", "light/candle", ...LANTERN_LIGHTS],
  winter: ["icon", "lights-a", "lights-b", "tree", "twinkle", "light/candle", "light/torch", "light/fill", ...FIRE_LIGHTS],
};

// The path in art/ of picture `part` of season `id` ("seasons/winter/tree.png"),
// or null for a season or a part it does not have.
export function seasonArt(id, part) {
  const s = SEASONS.find((x) => x.id === id);
  return s && typeof part === "string" && SEASON_ART[s.id].includes(part) ? `seasons/${s.id}/${part}.png` : null;
}

// The shop. Gold buys looks for a class (never an agent, which is short-lived):
// everyone with that class on, agents and you alike, wears what the class has
// equipped. Each kind of item has a catalogue per class, and each class keeps,
// per kind, which one it has on and, for most kinds, what it owns. Armours
// (colourways of the whole outfit) are each class's own. Hats are not tied to
// a class: every class has the same catalogue, and a hat bought once is owned
// by all four, kept once in the state under the kind's `shared` key, though
// each class still puts on its own. Weapons are each class's own, like
// armours: what it fights with, and what its attacks look like (see
// attackArt), and how it fights: its pace and weight, its element or its
// vial's aura (see effects.js, which reads these). Town decor (a season's
// decorations, SEASONS) belongs to the town, not to a class: every class
// sells the same, and what is owned and the set equipped are kept once in the
// state under the kind's `town` key. The first item of every catalogue is the
// class's default look (for town decor, none): free, always owned. Buying is
// for good (no refunds), and changing between owned items is free.
export const DEFAULT_LOOK = "default";
export const COLOUR_PRICES = [5, 10, 20]; // gold for each class's three colourways after the default, in order
export const HAT_PRICES = [10, 20, 30]; // gold for each hat after the default, in order, bought once for every class
export const WEAPON_PRICES = [15, 30, 50]; // gold for each class's three weapons after the default, in order
// Each class's colourways as [id, name]. The ids after the default, in this
// order, must match LOOKS in tools/idle-rpg-sprites.py, which draws them.
const COLOUR_NAMES = {
  wizard: [[DEFAULT_LOOK, "Violet"], ["crimson", "Crimson"], ["moss", "Moss"], ["frost", "Frost"]],
  healer: [[DEFAULT_LOOK, "Teal"], ["rose", "Rose"], ["sky", "Sky"], ["plum", "Plum"]],
  warrior: [[DEFAULT_LOOK, "Steel"], ["cobalt", "Cobalt"], ["jade", "Jade"], ["ruby", "Ruby"]],
  archer: [[DEFAULT_LOOK, "Forest"], ["scarlet", "Scarlet"], ["azure", "Azure"], ["dusk", "Dusk"]],
};
// Every hat as [id, name]; the default is the class's own headgear. The ids
// after the default, in this order, must match HATS in
// tools/idle-rpg-sprites.py, which draws each over every class.
const HAT_NAMES = [[DEFAULT_LOOK, "No hat"], ["party", "Party Hat"], ["santa", "Santa Hat"], ["pumpkin", "Pumpkin"]];
const HATS = HAT_NAMES.map(([id, name], i) => ({ id, name, price: i ? HAT_PRICES[i - 1] : 0 }));
// Every set of town decor: none, then each season's, at its price.
const DECOR = [{ id: DEFAULT_LOOK, name: "None", price: 0 }, ...SEASONS.map(({ id, name, price }) => ({ id, name, price }))];
// What a weapon's attacks carry (effects.js says what each does): an element,
// or null for none, and for the healer's potions, which potion it is.
const ELEMENT_NAMES = [["fire", "Fire"], ["frost", "Frost"], ["storm", "Storm"], ["poison", "Poison"]];
export const ELEMENTS = ELEMENT_NAMES.map(([id]) => id);
export const POTIONS = ["heal", "haste", "might", "hex"];
// Each class's weapons as [id, name, element] and, for the healer, whose
// "weapon" is the potion it throws, [id, name, element, potion]. The default is
// what the class always had. The ids after the default, in this order, must
// match WEAPONS in tools/idle-rpg-sprites.py, which draws each; ids repeat
// across classes (a warrior's "flame" is not an archer's).
const WEAPON_NAMES = {
  wizard: [[DEFAULT_LOOK, "Fire Staff", "fire"], ["frost", "Ice Wand", "frost"], ["storm", "Bolt Staff", "storm"], ["venom", "Toxic Rod", "poison"]],
  healer: [[DEFAULT_LOOK, "Heal Vial", null, "heal"], ["haste", "Haste Vial", null, "haste"], ["might", "Might Vial", null, "might"], ["hex", "Hex Vial", null, "hex"]],
  warrior: [[DEFAULT_LOOK, "Sword", null], ["axe", "War Axe", null], ["hammer", "Hammer", null], ["flame", "Fire Blade", "fire"]],
  archer: [[DEFAULT_LOOK, "Longbow", null], ["crossbow", "Crossbow", null], ["flame", "Fire Bow", "fire"], ["frost", "Ice Bow", "frost"]],
};
// Kinds of item: { name (for the shop), items: { <class>: [{ id, name, price }] },
// shared?, town? }; a weapon also has { element } and the healer's { potion }. `shared` names the state's key for a kind whose items are bought
// once for every class: it sells the same to each, and what is owned is kept
// there, once, instead of per class. `town` names the state's key for a kind
// that belongs to the town: { owned, equipped } kept there, once, as a class's
// slot is (no class wears it).
export const SHOP = {
  armour: {
    name: "Armours",
    items: Object.fromEntries(
      CLASSES.map((c) => [c, COLOUR_NAMES[c].map(([id, name], i) => ({ id, name, price: i ? COLOUR_PRICES[i - 1] : 0 }))]),
    ),
  },
  weapon: {
    name: "Weapons",
    items: Object.fromEntries(
      CLASSES.map((c) => [
        c,
        WEAPON_NAMES[c].map(([id, name, element, potion], i) => ({ id, name, price: i ? WEAPON_PRICES[i - 1] : 0, element, ...(potion ? { potion } : {}) })),
      ]),
    ),
  },
  hat: { name: "Hats", items: Object.fromEntries(CLASSES.map((c) => [c, HATS])), shared: "hats" },
  decor: { name: "Town decor", items: Object.fromEntries(CLASSES.map((c) => [c, DECOR])), town: "decor" },
};
export const SHOP_KINDS = Object.keys(SHOP);

// Every picture a class has, as its path inside the look's folder (see
// lookArt), the weapon's (see weaponArt) and the hat's (see hatArt), without
// ".png": standing, walking, dangling, and the fighting poses (stance,
// wind-up, strike) facing each way. main.js draws them;
// tools/idle-rpg-sprites.py draws each of them in every colourway, and every
// weapon and hat to lay over each.
export const POSES = ["stance", "windup", "strike"];
// "down/l" and "down/r" are knocked out, lying with the head to the left or right.
export const FRAMES = ["stand", "walk/l", "walk/r", "rag/c", "rag/l", "rag/r", ...POSES.flatMap((p) => [`${p}/l`, `${p}/r`]), "down/l", "down/r"];
const frameOf = (frame) => (FRAMES.includes(frame) ? frame : FRAMES[0]);
// The pictures each class's weapons have: all of them, but the healer's, whose
// weapon is the potion it holds up only as it winds up to throw (its staff is
// part of its body).
export const WEAPON_FRAMES = Object.fromEntries(CLASSES.map((c) => [c, c === "healer" ? ["windup/l", "windup/r"] : FRAMES]));

// What each weapon's attack looks like, per class and weapon id: { shot, hit },
// paths in art/ without ".png", "*" standing for the way it faces ("l" or "r").
// "shot" is the warrior's slash, the arrow, the spell or the thrown potion;
// "hit" is where it lands (the warrior's slash is its own hit). Every variant of
// one is the same size (see Attacks in tools/idle-rpg-sprites.py).
export const ATTACK_PARTS = ["shot", "hit"];
const ATTACK_ART = {
  wizard: {
    [DEFAULT_LOOK]: { shot: "attacks/spell/fire/*", hit: "attacks/burst/fire" },
    frost: { shot: "attacks/spell/frost/*", hit: "attacks/burst/frost" },
    storm: { shot: "attacks/spell/storm/*", hit: "attacks/burst/storm" },
    venom: { shot: "attacks/spell/poison/*", hit: "attacks/burst/poison" },
  },
  healer: Object.fromEntries(WEAPON_NAMES.healer.map(([id, , , potion]) => [id, { shot: `attacks/potion/${potion}`, hit: `attacks/splash/${potion}` }])),
  warrior: {
    [DEFAULT_LOOK]: { shot: "attacks/slash/default/*" },
    axe: { shot: "attacks/slash/heavy/*" },
    hammer: { shot: "attacks/slash/smash/*" },
    flame: { shot: "attacks/slash/flame/*" },
  },
  archer: {
    [DEFAULT_LOOK]: { shot: "attacks/arrow/default/*", hit: "status/spark" },
    crossbow: { shot: "attacks/arrow/bolt/*", hit: "status/spark" },
    flame: { shot: "attacks/arrow/fire/*", hit: "attacks/spark/fire" },
    frost: { shot: "attacks/arrow/frost/*", hit: "attacks/spark/frost" },
  },
};

// The pictures in art/ are in folders by what they show, then by what it is
// doing (see tools/idle-rpg-sprites.py). The functions here build the path,
// inside art/ and with ".png", of every picture whose name depends on the
// state or an agent (a class, a look, a hat, a monster, a character), so no
// saved string can reach a path unchecked. main.js names the rest itself.
//
// Each monster's pictures in monsters/<kind>/, without ".png": its whole
// picture ("idle", also the codex's), the eyelids laid over it ("blink"), the
// pieces that move on their own (see foe in main.js), its roar, and its two
// attacks on the party (MONSTER_ATTACKS). Every kind in KINDS has one.
//
// Each kind's attacks, as parts of MONSTER_ART ("*" standing for the side the
// target is on, "l" or "r"): `single`, a blow at one attacker: the pose the
// monster strikes while it lands (a whole picture in place of its own), what
// flies at the target and what lands on it; `area`, at a spot on the floor:
// the pose while its marker shows, what flies there (null: nothing) and what
// covers the spot as it lands ("-1"/"-2" frames flicker, see foe in main.js).
// (The slime-like magma slime and the ogre-like chief ogre share their
// cousins' attacks, recoloured; a part's name is drawn the same size for
// every kind that has it, see ATTACK_SIZE in main.js.)
const SLIME_ATTACKS = {
  single: { pose: "attack/spit/*", shot: "attack/glob", hit: "attack/splat" },
  area: { pose: "attack/squash", shot: "attack/glob", hit: "attack/puddle" },
};
const OGRE_ATTACKS = {
  single: { pose: "attack/swing/*", shot: "attack/arc/*", hit: "attack/thud" },
  area: { pose: "attack/slam", shot: null, hit: "attack/quake" },
};
export const MONSTER_ATTACKS = {
  goblin: {
    single: { pose: "attack/throw/*", shot: "attack/dagger/*", hit: "attack/nick" },
    area: { pose: "attack/toss", shot: "attack/bomb", hit: "attack/boom" },
  },
  lizard: {
    single: { pose: "attack/lunge/*", shot: null, hit: "attack/bite" },
    area: { pose: "attack/lash", shot: null, hit: "attack/sweep" },
  },
  slime: SLIME_ATTACKS,
  orc: {
    single: { pose: "attack/chop/*", shot: null, hit: "attack/cleave" },
    area: { pose: "attack/stomp", shot: null, hit: "attack/quake" },
  },
  ogre: OGRE_ATTACKS,
  "chief-ogre": OGRE_ATTACKS,
  wyvern: {
    single: { pose: "attack/sting/*", shot: "attack/barb/*", hit: "attack/jab" },
    area: { pose: "attack/beat", shot: null, hit: "attack/gale" },
  },
  draconian: {
    single: { pose: "attack/thrust/*", shot: null, hit: "attack/pierce" },
    area: { pose: "attack/flame", shot: "attack/ember/*", hit: "attack/scorch" },
  },
  dragon: {
    single: { pose: "attack/bite", shot: null, hit: "attack/claw" },
    area: { pose: "attack/breath", shot: "attack/fireball/*", hit: "attack/blaze-1", flicker: "attack/blaze-2" },
  },
  imp: {
    single: { pose: "attack/hurl/*", shot: "attack/firebolt/*", hit: "attack/singe" },
    area: { pose: "attack/summon", shot: null, hit: "attack/pyre" },
  },
  "magma-slime": SLIME_ATTACKS,
  "goblin-mage": {
    single: { pose: "attack/cast/*", shot: "attack/bolt/*", hit: "attack/zap" },
    area: { pose: "attack/chant", shot: null, hit: "attack/rune" },
  },
  demon: {
    single: { pose: "attack/smite/*", shot: null, hit: "attack/rend" },
    area: { pose: "attack/inferno", shot: "attack/hellball/*", hit: "attack/hellfire-1", flicker: "attack/hellfire-2" },
  },
};
const sides = (part) => (part.includes("*") ? ["l", "r"].map((x) => part.replace("*", x)) : [part]);
// The pieces that move: the slime's dome (`top`) sinks into its foot
// (`base`); the rest breathe with an upper body (`top`) over the whole
// picture; the ogres roar, and the dragon's tail sways behind its body.
export const MONSTER_ART = {
  goblin: ["idle", "blink", "top"],
  lizard: ["idle", "blink", "top"],
  slime: ["idle", "blink", "top", "base"],
  orc: ["idle", "blink", "top"],
  ogre: ["idle", "blink", "top", "roar/roar"],
  "chief-ogre": ["idle", "blink", "top", "roar/roar"],
  wyvern: ["idle", "blink", "top"],
  draconian: ["idle", "blink", "top"],
  dragon: ["idle", "blink", "top", "body", "tail", "roar/rear", "roar/roar", "roar/top", "roar/wave"],
  imp: ["idle", "blink", "top"],
  "magma-slime": ["idle", "blink", "top", "base"],
  "goblin-mage": ["idle", "blink", "top"],
  demon: ["idle", "blink", "top"],
};
for (const [kind, both] of Object.entries(MONSTER_ATTACKS))
  for (const a of Object.values(both)) for (const part of Object.values(a)) if (part) for (const p of sides(part)) if (!MONSTER_ART[kind].includes(p)) MONSTER_ART[kind].push(p);

// The part of MONSTER_ART for one piece (`pose`, `shot`, `hit`, `flicker`) of
// `kind`'s attack of `type` ("single" | "area") at a target on `side`, or null.
export function attackPart(kind, type, piece, side = "r") {
  const part = MONSTER_ATTACKS[kind]?.[type === "area" ? "area" : "single"]?.[piece];
  return typeof part === "string" ? part.replace("*", side === "l" ? "l" : "r") : null;
}

// The path in art/ of picture `part` of monster `kind` ("monsters/dragon/roar/top.png"),
// or null for a kind or a part it does not have.
export function monsterArt(kind, part = "idle") {
  return KINDS.includes(kind) && MONSTER_ART[kind].includes(part) ? `monsters/${kind}/${part}.png` : null;
}

// Each biome's backdrop in scene/<id>/, without ".png": "far", the distance
// (in place of the rampart's mountains), "mid", in front of it (in place of
// the wall), "ground", the floor, and "swatch", its small icon in the stage
// picker; a biome under a roof (not `outdoors`) also hangs a "ceiling" from
// the top of the scene; and the caves and hell set a light along the mid
// layer where the rampart has its torches ("crystal", "vent").
export const BIOME_ART = {
  forest: ["far", "mid", "ground", "swatch"],
  hills: ["far", "mid", "ground", "swatch"],
  caves: ["far", "mid", "ground", "swatch", "ceiling", "crystal"],
  hell: ["far", "mid", "ground", "swatch", "ceiling", "vent"],
};

// The biome of stage `s` (BIOMES' id): BIOME_STAGES stages each, in turn,
// repeating; anything that is not a stage counts as stage 1.
export function biomeOf(s) {
  const n = typeof s === "number" && Number.isFinite(s) && s >= 1 ? Math.floor(s) : 1;
  return BIOMES[Math.floor((n - 1) / BIOME_STAGES) % BIOMES.length].id;
}

// The path in art/ of picture `part` of biome `id`'s backdrop
// ("scene/caves/ceiling.png"), or null for a biome or a part it does not have.
export function biomeArt(id, part) {
  const b = BIOMES.find((x) => x.id === id);
  return b && typeof part === "string" && BIOME_ART[b.id].includes(part) ? `scene/${b.id}/${part}.png` : null;
}

// The settings menu (the gear in the top-right corner): one switch per entry,
// in this order, each { key, name, default }. A setting is a boolean saved under
// `settings.<key>`; adding one is adding an entry here and reading it in main.js.
export const SETTINGS = [
  { key: "damageNumbers", name: "Show damage numbers", default: true },
  { key: "advance", name: "Advance after a kill", default: true }, // else a kill repeats the stage (farming)
  { key: "seasonal", name: "Decorate in season", default: true }, // the town's, in season (SEASONS)
  { key: "seasonFirst", name: "Season over my decor", default: true }, // in season, its decor over the set equipped (decorOf)
];

// The pixel font (main.js lays numbers out with it): the characters it has,
// each drawn in every one of GLYPH_COLOURS by tools/idle-rpg-sprites.py.
// Digits, a sign or two, and what shortNumber writes: a point, K, M, B, T,
// and E for a power of ten.
export const GLYPHS = "0123456789+!.KMBTE";
// white for a plain blow and the badges, gold for a critical blow, and the
// colours of damage over time (effects.js): ember for burn, venom for venom.
export const GLYPH_COLOURS = ["white", "gold", "ember", "venom"];
const GLYPH_NAMES = { "+": "plus", "!": "bang", ".": "point", K: "k", M: "m", B: "b", T: "t", E: "e" };
// How many art px wide each character is without its outline (3 unless named
// here); main.js sets them one art px apart, sharing an outline column.
const GLYPH_WIDTHS = { ".": 1 };
export const glyphWidth = (ch) => GLYPH_WIDTHS[ch] ?? 3;

// A number as the game shows it (damage, HP): rounded to a whole number, and
// from 1,000 up shortened with K, M, B or T, one decimal while under 10 of
// them ("1.2K", "12K", "345M"). From 1,000T up it is a power of ten
// ("1.2E18"), so the text never grows long. Anything that is not a number
// from 0 up is "0".
const UNITS = ["", "K", "M", "B", "T"];
export function shortNumber(n) {
  if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return "0";
  if (Math.round(n) < 1000) return String(Math.round(n));
  for (let i = 1; ; i++) {
    const x = n / 1000 ** i;
    const r = x < 9.95 ? Math.round(x * 10) / 10 : Math.round(x);
    if (r < 1000) return `${r}${UNITS[i]}`;
    if (i === UNITS.length - 1) break;
  }
  let e = Math.floor(Math.log10(n));
  let m = Math.round((n / 10 ** e) * 10) / 10;
  if (m >= 10) {
    m = 1;
    e += 1;
  }
  return `${m}E${e}`;
}

// An attempt's time left, `ms`, as the plate shows it: minutes and seconds,
// the seconds rounded up so it reads "0:01" until the last moment ("9:42",
// "10:00", "0:00"). Anything that is not a number from 0 up is "0:00".
export function clockText(ms) {
  const s = typeof ms === "number" && Number.isFinite(ms) && ms > 0 ? Math.ceil(ms / 1000) : 0;
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

// The path in art/ of one character of the pixel font in `colour`
// ("font/gold/7.png", "font/white/plus.png"), or null for a character or
// colour it does not have, so no other string can end up in a path.
export function glyphArt(colour, ch) {
  if (!GLYPH_COLOURS.includes(colour) || typeof ch !== "string" || ch.length !== 1 || !GLYPHS.includes(ch)) return null;
  return `font/${colour}/${GLYPH_NAMES[ch] ?? ch}.png`;
}

// The lettering: a second pixel face, for the words and numbers of the HUD
// (the sign, the stage section, the boss's plate) and the name
// tags in the scene, drawn by tools/idle-rpg-sprites.py into
// lettering/<colour>/. The same height as the font, with the same digits and
// signs, but letters as wide as they need (M and W 5 art px, N 4; the font's
// M stays 3 wide for shortNumber). Capitals only: lower case is drawn as
// capitals. A space has no picture, only its width. LETTERS is every
// character it can draw, the space included; the signs after the brackets are
// for names (a tag shows the user's space and tab names), with the middle dot
// a tag sets between them, the ellipsis a long name is cut with, and
// UNKNOWN, a hollow box drawn for any character the face lacks (letterFit).
export const UNKNOWN = "\u25a1";
export const ELLIPSIS = "\u2026";
export const LETTERS = `ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789+!.:'/-() _,;?&#@*=<>[]%~|\\"\u00b7${ELLIPSIS}${UNKNOWN}`;
// white and gold for words and numbers, grey for the time standing still,
// red for a failed attempt, green for the stage being farmed
export const LETTER_COLOURS = ["white", "gold", "grey", "red", "green"];
const LETTER_NAMES = {
  "+": "plus", "!": "bang", ".": "point", ":": "colon", "'": "quote", "/": "slash", "-": "dash", "(": "open", ")": "close",
  _: "under", ",": "comma", ";": "semi", "?": "query", "&": "and", "#": "hash", "@": "at", "*": "star", "=": "equals",
  "<": "less", ">": "more", "[": "lsquare", "]": "rsquare", "%": "percent", "~": "tilde", "|": "bar", "\\": "backslash",
  '"': "dquote", "\u00b7": "dot", [ELLIPSIS]: "ellipsis", [UNKNOWN]: "unknown",
}; // prettier-ignore
const LETTER_WIDTHS = {
  M: 5, W: 5, N: 4, "!": 1, ".": 1, ":": 1, "'": 1, "(": 2, ")": 2, " ": 1,
  ",": 2, ";": 2, "&": 4, "#": 5, "@": 5, "[": 2, "]": 2, "~": 4, "|": 1, "\u00b7": 1, [ELLIPSIS]: 5, [UNKNOWN]: 4,
}; // prettier-ignore
// Upper case, for ASCII letters only (so no character turns into two).
const capitalOf = (ch) => (typeof ch === "string" && ch.length === 1 && ch >= "a" && ch <= "z" ? ch.toUpperCase() : ch);
// How many art px wide a character of the lettering is without its outline
// (a space 1, so with the art px every character is set after the last it
// leaves a 3 px gap between words), or 0 for one it cannot draw.
export function letterWidth(ch) {
  const c = capitalOf(ch);
  return typeof c === "string" && c.length === 1 && LETTERS.includes(c) ? (LETTER_WIDTHS[c] ?? 3) : 0;
}
// The path in art/ of one character of the lettering in `colour`
// ("lettering/gold/s.png", "lettering/red/quote.png"), or null for a space, a
// character it does not have or a colour it is not drawn in, so no other
// string can end up in a path.
export function letterArt(colour, ch) {
  const c = capitalOf(ch);
  if (!LETTER_COLOURS.includes(colour) || !letterWidth(c) || c === " ") return null;
  return `lettering/${colour}/${Object.prototype.hasOwnProperty.call(LETTER_NAMES, c) ? LETTER_NAMES[c] : c.toLowerCase()}.png`;
}
// Whether every character of `text` is one the lettering draws (a space
// included), so a label loses nothing.
export const letterable = (text) => typeof text === "string" && [...text].every((ch) => letterWidth(ch) > 0);

// Characters that take no room of their own: combining marks (an accent typed
// as a second character), joiners and other format characters, variation
// selectors, controls, and the emoji's skin tones. Unicode's own classes where
// the engine has them, else the common ranges.
const ZERO_WIDTH = (() => {
  try {
    return new RegExp("^[\\p{M}\\p{Cf}\\p{Cc}\\u{1F3FB}-\\u{1F3FF}]$", "u");
  } catch {
    return /^(?:[\u0000-\u001f\u007f-\u009f\u00ad\u0300-\u036f\u0483-\u0489\u1ab0-\u1aff\u1dc0-\u1dff\u200b-\u200f\u202a-\u202e\u2060-\u2064\u20d0-\u20ff\ufe00-\ufe0f\ufe20-\ufe2f\ufeff]|\ud83c[\udffb-\udfff]|\udb40[\udc00-\udfff])$/;
  }
})();
// A regional indicator, two of which make a flag.
const isFlagHalf = (ch) => ch >= "\u{1F1E6}" && ch <= "\u{1F1FF}" && ch.length === 2;
// What the lettering draws for one character (a code point) of any text: the
// character itself (lower case as a capital); a space for any white space;
// nothing for a character of no width (above); else its base letters, an
// accented Latin letter folding to its plain capital ("é" to "E", "ﬁ" to
// "FI"); else UNKNOWN. Never a character outside LETTERS.
function letterOf(ch) {
  const c = capitalOf(ch);
  if (letterWidth(c)) return c;
  if (/^\s$/.test(ch)) return " ";
  if (ZERO_WIDTH.test(ch)) return "";
  let base = [];
  try {
    base = [...ch.normalize("NFKD")].filter((b) => !ZERO_WIDTH.test(b)).map(capitalOf);
  } catch {
    // no normalize(): a placeholder
  }
  return base.length > 0 && base.length <= 3 && base.every((b) => b !== " " && letterWidth(b) > 0) ? base.join("") : UNKNOWN;
}
// How many art px the lettering takes to set `text` (all of it in LETTERS):
// each character its width plus 1, and 1 for the last one's shadow.
export const lettersWidth = (text) => [...text].reduce((x, ch) => x + letterWidth(ch) + 1, 1);
// Any text (a name a user typed: lower case, accents, emoji, any script, any
// length) as the lettering draws it, every character in LETTERS (letterOf; an
// emoji joined into one with zero-width joiners, or a flag, is one UNKNOWN; a
// run of spaces is one), and at most `max` art px wide (lettersWidth): a
// longer one is cut after the last character that leaves room for an
// ELLIPSIS, spaces before it dropped.
// It stops reading once past `max`, and after FIT_READ characters whatever
// they are (ones that take no room never fill it), so a very long name costs
// no more than a short one; what it gives never starts or ends with a space.
// Anything that is not a string is "".
const FIT_READ = 256;
export function letterFit(text, max = Infinity) {
  if (typeof text !== "string") return "";
  const kept = [];
  let w = 1;
  let read = 0;
  const cut = () => {
    const room = max - (letterWidth(ELLIPSIS) + 1);
    while (kept.length && (w > room || kept[kept.length - 1] === " ")) w -= letterWidth(kept.pop()) + 1;
    return w + letterWidth(ELLIPSIS) + 1 <= max ? `${kept.join("")}${ELLIPSIS}` : "";
  };
  let joined = false; // the character after a joiner is part of the one before it
  let flag = false; // and so is a flag's second half
  for (const ch of text) {
    if (++read > FIT_READ) return cut();
    if (joined) {
      joined = false;
      continue;
    }
    if (ch === "\u200d") {
      joined = kept[kept.length - 1] === UNKNOWN; // only an emoji takes the next one into itself
      continue;
    }
    if (isFlagHalf(ch)) {
      flag = !flag;
      if (!flag) continue;
    } else flag = false;
    for (const c of letterOf(ch)) {
      if (c === " " && (!kept.length || kept[kept.length - 1] === " ")) continue; // a run of spaces is one, and none lead
      const cw = letterWidth(c) + 1;
      if (w + cw > max) return cut();
      kept.push(c);
      w += cw;
    }
  }
  if (kept[kept.length - 1] === " ") kept.pop();
  return kept.join("");
}

// Every label the HUD sets in the lettering, as text (main.js draws them in
// capitals; CI and the tests check each can be drawn): the sign's title, its
// button, its line while nobody is in; the stage section's stage and farm
// mark, and what it says in place of the time: a failed attempt (fail() in
// main.js: why, then where it went back to), the boss slain and the countdown
// to the next stage; the tags of you and the stations in town. The numbers beside them are
// shortNumber's and clockText's. (An agent's tag is its space and tab names,
// any text: see letterFit.)
export const LABELS = {
  title: "Raid Party",
  start: "Start Raid",
  stop: "Return to town",
  empty: "nobody in yet",
  farm: "farm",
  paused: "(paused)", // by the time, while nobody is in the fight
  stage: (n) => `Stage ${n}`,
  timesUp: "Time's up!",
  back: (why, n) => `${why} Back to stage ${n}`,
  // in the stage section while the boss lies dead: its kind slain (or only
  // "Slain!" where the name does not fit), and on a first clear the countdown
  // to the next stage (or only its seconds)
  slain: (name) => `${name} slain!`,
  slainBare: "Slain!",
  next: (n, s) => `Next: stage ${n} in ${s}`,
  nextIn: (s) => `Next in ${s}`,
  you: "You",
  codex: "Codex",
  training: "Training",
  shop: "Shop",
  // the stage picker (the map in the top-right strip): its title, the stages
  // of the page it shows, a biome's stages beside its name, and the names
  // the line in the empty scene while no agent is in: in town, and in a raid's biome
  quietTown: "The rampart is quiet",
  quietRaid: "The raid is quiet",
  map: "Map",
  stages: (a, b) => `Stages ${a}-${b}`,
  range: (a, b) => `${a}-${b}`,
  ...Object.fromEntries(BIOMES.map((b) => [b.id, b.name])),
  // the monster's card (a press on it or its plate): where it is fought, its
  // HP, what it is weak to and resists (by the element's name), how many of
  // its kind have fallen; and every kind's name, on its plate and its card
  where: (biome, n) => `${biome} · Stage ${n}`,
  hp: (text) => `HP ${text}`,
  weak: "Weak",
  resist: "Resists",
  killed: (n) => `Slain ${n}`,
  ...Object.fromEntries(ELEMENT_NAMES.map(([id, name]) => [id, name])),
  ...Object.fromEntries(MONSTER_KINDS.map((k) => [k.id, k.name])),
};

const MAX = Number.MAX_SAFE_INTEGER;

// A count read back from disk: a whole number from 0 up, else 0.
function count(v) {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(Math.floor(v), MAX) : 0;
}

// An amount read back from disk: a number from 0 up, fractions kept, else 0.
function amount(v) {
  return typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.min(v, MAX) : 0;
}

function finite(v) {
  return typeof v === "number" && Number.isFinite(v);
}

function record(v) {
  return v !== null && typeof v === "object" && !Array.isArray(v);
}

// Whether `key` is `map`'s own, not something its prototype lends it.
const has = (map, key) => Object.prototype.hasOwnProperty.call(map, key);

// The own entries of a saved map whose values pass `keep`, minus any key that
// would reach the object's prototype.
function entries(map, keep) {
  if (!record(map)) return {};
  const out = {};
  for (const [k, v] of Object.entries(map)) {
    if (k === "__proto__") continue;
    const kept = keep(v);
    if (kept !== undefined) out[k] = kept;
  }
  return out;
}

const point = (p) => (record(p) && finite(p.x) && finite(p.y) ? { x: p.x, y: p.y } : undefined);

// Experience it takes to reach `level` from level 1, when going from n to n + 1
// costs `step * n`.
export function xpFor(level, step) {
  return (step * (level - 1) * level) / 2;
}

// Where `xp` total experience puts someone: { level, into, need }, where `into`
// is how far they are into this level and `need` what the whole level takes.
// No cap.
export function levelOf(xp, step) {
  const total = count(xp);
  let level = Math.max(1, Math.floor((1 + Math.sqrt(1 + (8 * total) / step)) / 2));
  // the square root can be a hair off; step to the exact level
  while (level > 1 && xpFor(level, step) > total) level -= 1;
  while (xpFor(level + 1, step) <= total) level += 1;
  return { level, into: total - xpFor(level, step), need: step * level };
}

export const classLevel = (xp) => levelOf(xp, CLASS_LEVEL_XP);
export const playerLevel = (xp) => levelOf(xp, PLAYER_LEVEL_XP);

// A stage number as the rules take it: a whole number from 1 to MAX_STAGE
// (anything else is 1).
export function stageOf(s) {
  return typeof s === "number" && Number.isFinite(s) && s >= 1 ? Math.min(Math.floor(s), MAX_STAGE) : 1;
}

// The kind of monster fought at stage `s` (anything that is not a stage counts
// as stage 1): its biome's (biomeOf) last kind, its boss, at the biome's tenth
// stage (10, 20, ... 40, 50, ...); before that its other kinds in turn over its
// first nine stages, as evenly as they go, the earlier taking the extra (two
// kinds: 5 and 4 stages; three: 3 each).
export function kindOf(s) {
  const n = stageOf(s);
  const kinds = BIOMES.find((b) => b.id === biomeOf(n)).kinds;
  const at = (n - 1) % BIOME_STAGES;
  const regular = kinds.length - 1;
  if (at === BIOME_STAGES - 1 || regular < 1) return kinds[kinds.length - 1].id;
  const each = Math.floor((BIOME_STAGES - 1) / regular);
  const extra = (BIOME_STAGES - 1) % regular; // the first `extra` kinds get one stage more
  const i = at < extra * (each + 1) ? Math.floor(at / (each + 1)) : extra + Math.floor((at - extra * (each + 1)) / each);
  return kinds[i].id;
}

// The HP of stage `s`'s boss: STAGE_HP x HP_GROWTH^(s-1) x s^HP_POWER, a real number.
export const bossHp = (s) => STAGE_HP * HP_GROWTH ** (stageOf(s) - 1) * stageOf(s) ** HP_POWER;

// How many attackers a kill's gold and experience are reckoned with: a whole
// number from 1 to MAX_GOLD_ATTACKERS (anything else counts as 1, more as the most).
const attackersOf = (n) => (typeof n === "number" && Number.isFinite(n) && n >= 1 ? Math.min(Math.floor(n), MAX_GOLD_ATTACKERS) : 1);

// Gold for killing stage `s`'s boss with `attackers` taking part (a whole
// number from 1 to MAX_GOLD_ATTACKERS; anything else counts as 1, more as
// the most): ATTACKER_GOLD each, exponential in the stage but slower than HP,
// rounded down and never under 1.
export function stageGold(s, attackers = GOLD_ATTACKERS) {
  const n = attackersOf(attackers);
  return Math.min(Math.max(1, Math.floor(ATTACKER_GOLD * n * GOLD_GROWTH ** (stageOf(s) - 1))), MAX);
}

// Experience a whole kill at stage `s` earns (each blow earns its share, see credit).
// ATTACKER_XP for each of `attackers` taking part (counted as for gold, see
// stageGold), growing by XP_GROWTH a stage.
export const stageXp = (s, attackers = GOLD_ATTACKERS) => ATTACKER_XP * attackersOf(attackers) * XP_GROWTH ** (stageOf(s) - 1);

// How long an attempt at stage `s` has, in ms.
export const stageTime = (_s) => STAGE_MS;

// Stage `s`'s boss at full HP: { kind, hp, maxHp, stage, id }.
export function bossOf(s, id = 1) {
  const stage = stageOf(s);
  return { kind: kindOf(stage), hp: bossHp(stage), maxHp: bossHp(stage), stage, id };
}

// A class's training with every kind at 0: { attack: 0, health: 0 }.
function noTraining() {
  return Object.fromEntries(TRAINING.map((t) => [t.key, 0]));
}

// A class's skill ranks with every rank at 0: { power: 0, haste: 0, crit: 0 }.
function noRanks(cls) {
  return Object.fromEntries((CLASS_SKILLS[cls] ?? []).map((k) => [k, 0]));
}

// The kinds bought once for every class, and the state's key for what of each is owned.
const SHARED = SHOP_KINDS.filter((k) => SHOP[k].shared).map((k) => [k, SHOP[k].shared]);
// The kinds that belong to the town, and the state's key for each one's slot;
// and the kinds a class wears (in its `looks`).
const TOWN = SHOP_KINDS.filter((k) => SHOP[k].town).map((k) => [k, SHOP[k].town]);
const WORN = SHOP_KINDS.filter((k) => !SHOP[k].town);

// A class's (or the town's) slot for one kind with nothing bought: { owned: [DEFAULT_LOOK],
// equipped: DEFAULT_LOOK }, or only { equipped } for a kind bought for every class.
const noSlot = (kind) => (SHOP[kind].shared ? { equipped: DEFAULT_LOOK } : { owned: [DEFAULT_LOOK], equipped: DEFAULT_LOOK });

// Every class in its default look, owning nothing else:
// { <class>: { <kind>: { owned: [DEFAULT_LOOK], equipped: DEFAULT_LOOK } | { equipped: DEFAULT_LOOK } } }.
function noLooks() {
  return Object.fromEntries(CLASSES.map((c) => [c, Object.fromEntries(WORN.map((k) => [k, noSlot(k)]))]));
}

// Fresh progress: what a new party starts with.
export function newProgress() {
  return {
    stage: 1, // the stage being fought
    best: 1, // the highest stage reached: every one up to it can be picked
    farming: false, // sent back by a failed attempt: kills repeat the stage until one is picked
    slain: 0,
    gold: 0,
    kills: Object.fromEntries(KINDS.map((k) => [k, 0])),
    xp: Object.fromEntries([YOU, ...CLASSES].map((k) => [k, 0])),
    skills: Object.fromEntries(CLASSES.map((c) => [c, noRanks(c)])),
    training: Object.fromEntries(CLASSES.map((c) => [c, noTraining()])),
    looks: noLooks(),
    ...Object.fromEntries(SHARED.map(([, key]) => [key, []])), // hats: [<id>], bought for every class
    ...Object.fromEntries(TOWN.map(([kind, key]) => [key, noSlot(kind)])), // decor: { owned: [<id>], equipped: <id> }, the town's
  };
}

// One rank, as a whole number from 0 to MAX_RANK (anything else is 0).
function rank(ranks, skill) {
  const r = record(ranks) ? ranks[skill] : 0;
  return typeof r === "number" && Number.isInteger(r) && r > 0 ? Math.min(r, MAX_RANK) : 0;
}

// Skill points a class has earned with `xp` experience: POINTS_PER_LEVEL for
// each level past 1.
export function pointsEarned(xp) {
  return (classLevel(xp).level - 1) * POINTS_PER_LEVEL;
}

// Skill points tied up in a class's `ranks`.
export function pointsSpent(ranks) {
  return Object.keys(record(ranks) ? ranks : {}).reduce((sum, k) => sum + rank(ranks, k) * RANK_COST, 0);
}

// A class's skill points still to spend.
export function pointsLeft(progress, cls) {
  return Math.max(0, pointsEarned(progress.xp[cls]) - pointsSpent(progress.skills[cls]));
}

// Every class's points still to spend, added up (the count on the sign).
export function pointsLeftAll(progress) {
  return CLASSES.reduce((sum, c) => sum + pointsLeft(progress, c), 0);
}

// Whether `cls` can put a point into `skill`: it is one of the class's
// skills, below MAX_RANK, and the class has the points.
export function canRaise(progress, cls, skill) {
  const ranks = progress.skills[cls];
  return CLASSES.includes(cls) && Boolean(ranks) && CLASS_SKILLS[cls].includes(skill) && rank(ranks, skill) < MAX_RANK && pointsLeft(progress, cls) >= RANK_COST;
}

// Raises `skill` one rank for `cls` if it can. Returns whether it did.
export function raise(progress, cls, skill) {
  if (!canRaise(progress, cls, skill)) return false;
  progress.skills[cls][skill] = rank(progress.skills[cls], skill) + 1;
  return true;
}

// Takes every rank off `cls`, which gets all its points back (free). Returns
// whether anything changed.
export function resetSkills(progress, cls) {
  if (!CLASSES.includes(cls) || pointsSpent(progress.skills[cls]) === 0) return false;
  progress.skills[cls] = noRanks(cls);
  return true;
}

// What each rank gives. `ranks` is a class's ranks; a missing one counts as 0.
export const powerOf = (ranks) => 1 + POWER_BONUS * rank(ranks, "power");
export const critChanceOf = (ranks) => CRIT_CHANCE * rank(ranks, "crit");
export const attackTicksOf = (ranks) => ATTACK_TICKS[rank(ranks, "haste")];

// The damage multiplier a class's level gives.
export const levelBonus = (xp) => 1 + LEVEL_BONUS * (classLevel(xp).level - 1);

// A class's level of training `key` (one of TRAINING), 0 if none.
export function trainingOf(progress, cls, key = "attack") {
  return count(progress.training?.[cls]?.[key]);
}

// The damage multiplier `level` levels of Attack training give.
export const trainingBonus = (level) => TRAINING_BONUS ** Math.min(count(level), MAX_TRAINING);

// The max HP multiplier `level` levels of Health training give.
export const healthBonus = (level) => HEALTH_BONUS ** Math.min(count(level), MAX_TRAINING);

// The max HP of a character of class `cls` (see CLASS_HP): a real number,
// shown rounded. An unknown class has the lowest base.
export function maxHpOf(progress, cls) {
  const base = CLASSES.includes(cls) ? CLASS_HP[cls] : Math.min(...CLASSES.map((c) => CLASS_HP[c]));
  if (!CLASSES.includes(cls)) return base;
  return base * levelBonus(progress.xp?.[cls]) * healthBonus(trainingOf(progress, cls, "health"));
}

// What one heal by a character of class `cls` (a healer, whatever vial it holds) restores.
export const healOf = (progress, cls) => HEAL_SHARE * maxHpOf(progress, cls);

// One of the boss's blows at stage `s` on a party of PARTY_SIZE (see party.js).
export const stageDamage = (s) => STAGE_DAMAGE * DAMAGE_GROWTH ** (stageOf(s) - 1) * stageOf(s) ** DAMAGE_POWER;

// What the next level of training costs from `level`, in gold.
export const trainingPrice = (level) => Math.min(Math.floor(TRAINING_PRICE * TRAINING_PRICE_GROWTH ** Math.min(count(level), MAX_TRAINING)), MAX);

// The damage of one plain blow by a character of class `cls`: BASE_DAMAGE
// times the class's level bonus, training bonus and Power. A real number;
// shown rounded (shortNumber). An unknown class deals BASE_DAMAGE.
export function damageOf(progress, cls) {
  if (!CLASSES.includes(cls)) return BASE_DAMAGE;
  return BASE_DAMAGE * levelBonus(progress.xp?.[cls]) * trainingBonus(trainingOf(progress, cls)) * powerOf(progress.skills?.[cls]);
}

// One blow by a character of class `cls`, given a random number `r` from 0 up
// to 1: { damage, crit }. It is critical when `r` falls under the class's crit
// chance.
export function blow(progress, cls, r) {
  const crit = r < critChanceOf(progress.skills?.[cls]);
  return { damage: damageOf(progress, cls) * (crit ? CRIT_MULTIPLIER : 1), crit };
}

// Whether `cls` can buy its next level of training `key`: a class, a kind of
// training, below MAX_TRAINING, and the gold is there.
export function canTrain(progress, cls, key = "attack") {
  if (!CLASSES.includes(cls) || !TRAINING.some((t) => t.key === key)) return false;
  const level = trainingOf(progress, cls, key);
  return level < MAX_TRAINING && count(progress.gold) >= trainingPrice(level);
}

// Buys `cls` its next level of training `key` if it can: the price comes off
// the gold. Returns whether it did.
export function train(progress, cls, key = "attack") {
  if (!canTrain(progress, cls, key)) return false;
  const level = trainingOf(progress, cls, key);
  progress.gold = count(progress.gold) - trainingPrice(level);
  ((progress.training ??= {})[cls] ??= noTraining())[key] = level + 1;
  return true;
}

// Whether stage `s` can be picked (the stage section's arrows, the stage
// picker): a whole number from 1 to `best`, the highest reached, and not the
// one the fight is on. selectStage moves only to such a stage.
export function canSelectStage(progress, s) {
  return typeof s === "number" && Number.isInteger(s) && s >= 1 && s <= progress.best && s !== progress.stage;
}

// Moves the fight to stage `s` if it is one the party has reached (1 to
// `best`) and not the one it is on. Choosing a stage ends farming (see
// failStage): kills advance again as the setting says. Returns whether it
// changed.
export function selectStage(progress, s) {
  if (!canSelectStage(progress, s)) return false;
  progress.stage = s;
  progress.farming = false;
  return true;
}

// An attempt failed (its time ran out with the boss alive). At a
// stage past 1 the fight goes back to the stage before, one the party has
// cleared, and the party farms it: kills there repeat it, whatever the
// "Advance after a kill" setting says, until the player picks a stage (the
// plate's next arrow), assuming they will come back stronger. `best` is
// unchanged, so the failed stage stays within reach. At stage 1 it is simply
// tried again. Returns the stage the fight is now at.
export function failStage(progress) {
  const stage = stageOf(progress.stage);
  // never further back than the stage before the highest reached, which the
  // party has cleared: a failure there, or lower down where the player chose
  // to go, repeats that stage
  const back = Math.max(1, stageOf(progress.best) - 1);
  if (stage > back) progress.stage = back;
  if (stageOf(progress.best) > 1) progress.farming = true;
  return progress.stage;
}

// How many ticks after one attack starts the next one does, given a random
// number `r` from 0 up to 1: the rank's gap give or take up to ATTACK_JITTER,
// evenly, and never under MIN_ATTACK_TICKS.
export function attackGap(ranks, r) {
  const base = attackTicksOf(ranks);
  const spread = Math.max(0, Math.min(ATTACK_JITTER, base - MIN_ATTACK_TICKS));
  return base - spread + Math.min(2 * spread, Math.floor(r * (2 * spread + 1)));
}

// How many ticks from now a character who has just joined the fight starts
// its first attack, given a random number `r`: anywhere in its first gap, so
// a party that starts together does not attack as one.
export function firstAttack(ranks, r) {
  const base = attackTicksOf(ranks);
  return 1 + Math.min(base - 1, Math.floor(r * base));
}

// Experience earned by `hp` damage landing on `monster` ({ maxHp, stage })
// with `attackers` in the fight: that share of its HP, of what a whole kill at
// its stage earns for that many (stageXp). So a class earns by the share of
// the fight it carries, and levels do not run away as damage grows.
export function blowXp(hp, monster, attackers = GOLD_ATTACKERS) {
  const maxHp = monster?.maxHp;
  if (!finite(hp) || hp <= 0 || !finite(maxHp) || maxHp <= 0) return 0;
  return (Math.min(hp, maxHp) / maxHp) * stageXp(monster.stage, attackers);
}

// Credits `hp` points of damage that landed on `monster`, dealt by a
// character of class `cls`, with `attackers` in the fight (as for a kill's
// gold): experience to that class and to you (see blowXp). Returns the keys
// (the class, YOU) that went up a level on it, in that order. Experience is a
// real number; levels count only whole points.
export function credit(progress, cls, hp, monster, attackers = GOLD_ATTACKERS) {
  const up = [];
  const by = blowXp(hp, monster, attackers);
  const gain = (key, add, levels) => {
    const before = levels(progress.xp[key]).level;
    const now = finite(progress.xp[key]) && progress.xp[key] > 0 ? progress.xp[key] : 0;
    progress.xp[key] = Math.min(now + add, MAX);
    if (levels(progress.xp[key]).level > before) up.push(key);
  };
  if (by <= 0) return up;
  if (CLASSES.includes(cls)) gain(cls, by, classLevel);
  gain(YOU, by * PLAYER_XP_SHARE, playerLevel);
  return up;
}

// Books a kill of `monster` ({ kind, stage }) by `attackers` taking part: the
// total, the count for its kind, its stage's gold for that many (stageGold),
// and the stage cleared: the next one is reached (`best`), and with `advance`
// (the setting) the fight moves on to it, unless the party is farming after a
// failed attempt (see failStage); else it stays on this one.
export function slay(progress, monster, advance = true, attackers = GOLD_ATTACKERS) {
  const stage = stageOf(monster.stage);
  progress.slain = Math.min(count(progress.slain) + 1, MAX);
  if (KINDS.includes(monster.kind)) progress.kills[monster.kind] = Math.min(count(progress.kills[monster.kind]) + 1, MAX);
  progress.gold = Math.min(count(progress.gold) + stageGold(stage, attackers), MAX);
  const next = Math.min(stage + 1, MAX_STAGE);
  if (next > progress.best) progress.best = next;
  if (advance && !progress.farming && progress.stage === stage) progress.stage = next;
}

// What the shop sells of `kind` for class `cls`: [{ id, name, price }], the
// default first (empty for an unknown class or kind).
export function catalogue(cls, kind) {
  return (has(SHOP, kind) && CLASSES.includes(cls) && SHOP[kind].items[cls]) || [];
}

// One item of a catalogue, or undefined.
function itemOf(cls, kind, id) {
  return catalogue(cls, kind).find((it) => it.id === id);
}

// The slot of a known kind that `cls` keeps ({ owned, equipped } or { equipped }):
// the class's own, or for a kind that belongs to the town, the town's.
function slotOf(progress, cls, kind) {
  const slot = SHOP[kind].town ? progress[SHOP[kind].town] : progress.looks?.[cls]?.[kind];
  return record(slot) ? slot : undefined;
}

// What `cls` has bought of `kind` (a known kind): the class's own list, or for
// a kind bought for every class, everyone's, or for the town's, the town's.
function bought(progress, cls, kind) {
  const list = SHOP[kind].shared ? progress[SHOP[kind].shared] : slotOf(progress, cls, kind)?.owned;
  return Array.isArray(list) ? list : [];
}

// Whether `cls` owns item `id` of `kind`. The default always counts as owned,
// and a hat bought for any class counts for every one.
export function owns(progress, cls, kind, id) {
  if (!itemOf(cls, kind, id)) return false;
  return id === DEFAULT_LOOK || bought(progress, cls, kind).includes(id);
}

// The id of the item of `kind` that `cls` has on (for town decor, the town's,
// whichever class asks): the default unless it has put on something it owns.
export function equipped(progress, cls, kind) {
  const id = has(SHOP, kind) ? slotOf(progress, cls, kind)?.equipped : undefined;
  return owns(progress, cls, kind, id) ? id : DEFAULT_LOOK;
}

// Whether `cls` can buy item `id` of `kind`: it is for sale, not owned yet,
// and the gold is there.
export function canBuy(progress, cls, kind, id) {
  const item = itemOf(cls, kind, id);
  return Boolean(item) && !owns(progress, cls, kind, id) && count(progress.gold) >= item.price;
}

// Buys item `id` of `kind` for `cls` if it can: the price comes off the gold
// and the class owns it for good (a hat, every class does; town decor, the
// town). It is not put on. Returns whether it bought it.
export function buy(progress, cls, kind, id) {
  if (!canBuy(progress, cls, kind, id)) return false;
  progress.gold = count(progress.gold) - itemOf(cls, kind, id).price;
  const key = SHOP[kind].shared;
  const town = SHOP[kind].town;
  if (key) {
    if (!Array.isArray(progress[key])) progress[key] = [];
    progress[key].push(id);
  } else if (town) {
    if (!slotOf(progress, cls, kind) || !Array.isArray(progress[town].owned)) progress[town] = noSlot(kind);
    progress[town].owned.push(id);
  } else {
    const slot = (((progress.looks ??= {})[cls] ??= {})[kind] ??= noSlot(kind));
    slot.owned.push(id);
  }
  return true;
}

// Puts item `id` of `kind` on `cls`, free, if the class owns it and does not
// have it on already. Returns whether anything changed.
export function equip(progress, cls, kind, id) {
  if (!owns(progress, cls, kind, id) || equipped(progress, cls, kind) === id) return false;
  const town = SHOP[kind].town;
  if (town) (slotOf(progress, cls, kind) ?? (progress[town] = noSlot(kind))).equipped = id;
  else (((progress.looks ??= {})[cls] ??= {})[kind] ??= noSlot(kind)).equipped = id; // a hat bought for another class may find no slot
  return true;
}

// The season (SEASONS' id) whose decorations the town puts up at `when`, or
// null for none: the season's own while `settings.seasonal` is on (seasonOf),
// and the set of town decor equipped (if owned) all year. With both, and
// different, `settings.seasonFirst` picks the season's, else the one
// equipped wins. Settings missing or malformed count as their defaults.
export function decorOf(progress, settings, when) {
  const on = settingsOf(settings);
  const season = on.seasonal ? seasonOf(when) : null;
  const id = equipped(progress ?? {}, CLASSES[0], "decor");
  const mine = id === DEFAULT_LOOK ? null : id;
  if (!season || !mine) return season ?? mine;
  return on.seasonFirst ? season : mine;
}

// The path in art/ of class `cls`'s picture `frame` (one of FRAMES) in
// colourway `colour`: classes/<class>/<look>/<frame>.png, where <look> is
// "default" or the colourway's id ("classes/wizard/crimson/walk/l.png").
// Anything that is not one of the class's colourways gets the default, an
// unknown class the first one and an unknown frame the first, standing, so no
// other string can end up in a path.
export function lookArt(cls, colour, frame = FRAMES[0]) {
  const c = CLASSES.includes(cls) ? cls : CLASSES[0];
  const look = colour !== DEFAULT_LOOK && itemOf(c, "armour", colour) ? colour : DEFAULT_LOOK;
  return `classes/${c}/${look}/${frameOf(frame)}.png`;
}

// The id of `cls`'s weapon `weapon` if it is one of the class's (an unknown
// class counts as the first), else the default.
function weaponOf(cls, weapon) {
  const c = CLASSES.includes(cls) ? cls : CLASSES[0];
  return [c, itemOf(c, "weapon", weapon) ? weapon : DEFAULT_LOOK];
}

// The path in art/ of weapon `weapon`'s picture `frame` for class `cls`:
// weapons/<class>/<weapon>/<frame>.png ("weapons/warrior/axe/walk/l.png"),
// laid over the class's picture of the same frame at the same size and under
// its hat. Anything that is not one of the class's weapons gets its default
// (a class always holds one), an unknown class or frame the first, as in
// lookArt, so no other string can end up in a path. Null for a picture the
// weapon has none for (WEAPON_FRAMES): the healer's potion shows only as it
// winds up.
export function weaponArt(cls, weapon, frame = FRAMES[0]) {
  const [c, w] = weaponOf(cls, weapon);
  const f = frameOf(frame);
  return WEAPON_FRAMES[c].includes(f) ? `weapons/${c}/${w}/${f}.png` : null;
}

// The path in art/ of the picture for `part` (one of ATTACK_PARTS) of an
// attack by class `cls` with weapon `weapon`, facing `side` ("l" or "r"; for
// those that face a way): "attacks/arrow/fire/r.png". The weapon and class are
// checked as in weaponArt, any side but "l" is "r", and a part the attack does
// not have (the warrior's "hit") is null.
export function attackArt(cls, weapon, part, side = "r") {
  const [c, w] = weaponOf(cls, weapon);
  const art = ATTACK_PARTS.includes(part) ? ATTACK_ART[c][w]?.[part] : undefined;
  return art ? `${art.replace("*", side === "l" ? "l" : "r")}.png` : null;
}

// The path in art/ of hat `hat`'s picture `frame` for class `cls`:
// hats/<hat>/<class>/<frame>.png ("hats/party/wizard/walk/l.png"), laid over
// the class's picture of the same frame at the same size. Null for no hat:
// the default, or anything that is not a hat for sale, so no other string can
// end up in a path (an unknown class or frame gets the first, as in lookArt).
export function hatArt(cls, hat, frame = FRAMES[0]) {
  const c = CLASSES.includes(cls) ? cls : CLASSES[0];
  return hat !== DEFAULT_LOOK && itemOf(c, "hat", hat) ? `hats/${hat}/${c}/${frameOf(frame)}.png` : null;
}

// The ids of `items` after the default that a saved list holds, in
// catalogue order, each once; nothing else.
function kept(list, items) {
  const saved = Array.isArray(list) ? list : [];
  return items.map((it) => it.id).filter((id) => id !== DEFAULT_LOOK && saved.includes(id));
}

// The version that first sold weapons: state saved before it owns and holds
// only each class's default weapon, whatever it says, since nothing else could
// have been bought.
const WEAPONS_SINCE = 5;

// The version that first sold town decor: state saved before it owns none,
// whatever it says.
const DECOR_SINCE = 8;

// The town's saved slot for `kind` (one that belongs to the town), from state
// saved by version `version`, as a class's is (see looksOf): what it owns, in
// catalogue order with the default always among them, and the set on, which
// falls back to the default if not owned.
function townOf(saved, kind, version) {
  const slot = version >= DECOR_SINCE && record(saved) ? saved : {};
  const owned = [DEFAULT_LOOK, ...kept(slot.owned, catalogue(CLASSES[0], kind))];
  return { owned, equipped: owned.includes(slot.equipped) ? slot.equipped : DEFAULT_LOOK };
}

// A class's saved looks, from state saved by version `version`: per kind, the
// items it owns, in catalogue order with the default always among them and
// anything unknown or repeated dropped, and the one it has on, which falls
// back to the default if it is not owned. A kind bought for every class keeps
// only the one on, checked against `shared`, what everyone owns ({ hats:
// [<id>] }, already checked).
function looksOf(saved, cls, shared, version) {
  return Object.fromEntries(
    WORN.map((kind) => {
      // armours were first saved as "colour"
      const key = record(saved) && !has(saved, kind) && kind === "armour" ? "colour" : kind;
      const sold = kind !== "weapon" || version >= WEAPONS_SINCE;
      const slot = sold && record(saved) && has(saved, key) && record(saved[key]) ? saved[key] : {};
      // the default always, also for a kind with nothing for sale yet
      const owned = [DEFAULT_LOOK, ...(SHOP[kind].shared ? shared[SHOP[kind].shared] : kept(slot.owned, catalogue(cls, kind)))];
      const on = owned.includes(slot.equipped) ? slot.equipped : DEFAULT_LOOK;
      return [kind, SHOP[kind].shared ? { equipped: on } : { owned, equipped: on }];
    }),
  );
}

// The saved settings: every one of SETTINGS, its saved value if that is a
// boolean, else its default. Anything else saved there is dropped.
export function settingsOf(saved) {
  return Object.fromEntries(SETTINGS.map(({ key, default: on }) => [key, record(saved) && has(saved, key) && typeof saved[key] === "boolean" ? saved[key] : on]));
}

// The version that first had stages and training: state saved before it
// starts at stage 1 with no training, whatever it says.
const STAGES_SINCE = 6;
// The version that first had Health training: state saved before it has none.
const HEALTH_SINCE = 7;

// The version that first had a biome's own monsters: state saved before it
// counts kills of the three kinds it fought (slime, ogre, dragon) and of no
// other, whatever it says, since no other could have been slain.
const BIOME_KINDS_SINCE = 9;
const FIRST_KINDS = ["slime", "ogre", "dragon"];

// The saved kill counts by kind: every one of KINDS, a whole number from 0 up
// (anything else 0); a kind state saved by `version` could not have known
// counts 0, and anything else saved there is dropped.
function killsOf(saved, version) {
  const known = (k) => version >= BIOME_KINDS_SINCE || FIRST_KINDS.includes(k);
  return Object.fromEntries(KINDS.map((k) => [k, record(saved) && has(saved, k) && known(k) ? count(saved[k]) : 0]));
}

// A class's saved training: each kind a whole number from 0 up (anything else
// is 0), cut down to MAX_TRAINING.
function trainingOfSaved(saved, version) {
  const known = (key) => key !== "health" || version >= HEALTH_SINCE;
  return Object.fromEntries(TRAINING.map(({ key }) => [key, Math.min(record(saved) && has(saved, key) && known(key) ? count(saved[key]) : 0, MAX_TRAINING)]));
}

// A class's saved skill ranks, given its experience `xp`. Each rank must be a
// whole number from 0 to MAX_RANK, else it is 0. Ranks that would cost more
// points than the class has earned cannot have been bought: the class gets
// all its points back instead.
function ranksOf(saved, cls, xp) {
  const ranks = Object.fromEntries((CLASS_SKILLS[cls] ?? []).map((k) => {
    const r = record(saved) ? saved[k] : 0;
    return [k, typeof r === "number" && Number.isInteger(r) && r >= 0 && r <= MAX_RANK ? r : 0];
  }));
  return pointsSpent(ranks) > pointsEarned(xp) ? noRanks(cls) : ranks;
}

// The saved state as this version keeps it, from whatever was read back:
// older versions without the progress fields, skill ranks, looks, weapons,
// hats, settings, stages, training, town decor or the biomes' monsters, or
// anything malformed. Never throws; a
// bad field falls back to its default, a bad entry is dropped. The boss is
// not saved: an attempt starts afresh at the saved stage when the layout
// loads (main.js makes it, see bossOf).
//
// State written by a later version keeps its version number: this version can
// read what it knows of it, but must not save over it (see save in main.js),
// since it would drop whatever it does not know.
export function loadState(saved) {
  const s = record(saved) ? saved : {};
  const fresh = newProgress();
  // experience is a real number from 0 up (blows earn fractions of a point)
  const xp = Object.fromEntries(Object.keys(fresh.xp).map((k) => [k, amount(record(s.xp) ? s.xp[k] : 0)]));
  // version 3 and before sold no hats: none owned. Every class sells the same
  // hats, so the first class's catalogue checks them.
  const shared = Object.fromEntries(SHARED.map(([kind, key]) => [key, kept(has(s, key) ? s[key] : undefined, catalogue(CLASSES[0], kind))]));
  // version 5 and before had no stages or training: stage 1, nothing trained
  const staged = count(s.version) >= STAGES_SINCE;
  const best = staged ? stageOf(s.best) : 1;
  const training = record(s.training) && staged ? s.training : {};
  return {
    version: Math.max(STATE_VERSION, count(s.version)),
    you: point(s.you) ?? { x: 154, y: 16 },
    spots: entries(s.spots, point),
    sprites: entries(s.sprites, (c) => (CLASSES.includes(c) ? c : undefined)),
    seen: entries(s.seen, (t) => (finite(t) ? t : undefined)),
    battle: typeof s.battle === "boolean" ? s.battle : true,
    // the stage being fought is one reached, else the highest reached
    stage: staged && stageOf(s.stage) === s.stage && s.stage <= best ? s.stage : best,
    best,
    // farming after a failed attempt (version 6 on); a boolean, else false
    farming: staged && s.farming === true,
    // `slain` predates the counts by kind, which start from zero
    slain: count(s.slain),
    gold: count(s.gold),
    // versions 1 to 8 fought only slimes, ogres and dragons: every other kind 0
    kills: killsOf(s.kills, count(s.version)),
    xp,
    // version 1 had no skills: every rank starts at 0
    skills: Object.fromEntries(CLASSES.map((c) => [c, ranksOf(record(s.skills) ? s.skills[c] : undefined, c, xp[c])])),
    // version 6 had Attack training only: Health starts at 0
    training: Object.fromEntries(CLASSES.map((c) => [c, trainingOfSaved(has(training, c) ? training[c] : undefined, count(s.version))])),
    // versions 1 and 2 had no shop: every class owns and wears its default;
    // versions 1 to 4 sold no weapons: every class owns and holds its default
    looks: Object.fromEntries(CLASSES.map((c) => [c, looksOf(record(s.looks) && has(s.looks, c) ? s.looks[c] : undefined, c, shared, count(s.version))])),
    ...shared, // hats: [<id>], owned by every class
    // versions 1 to 7 sold no town decor: none owned, none up
    ...Object.fromEntries(TOWN.map(([kind, key]) => [key, townOf(has(s, key) ? s[key] : undefined, kind, count(s.version))])),
    // versions 1 to 3 had no settings, 1 to 5 not "advance", and a save from before
    // seasonal decorations not "seasonal" nor "seasonFirst" (no new version for a
    // setting: a missing key is its default)
    settings: settingsOf(s.settings),
  };
}
