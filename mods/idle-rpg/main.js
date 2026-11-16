// Idle RPG: a castle rampart under a moving sky (drifting clouds, and a day
// and a night every 20 minutes), staffed by a small adventuring party. You and
// every agent are one of four classes: wizard, healer, warrior or archer. The
// class is picked at random the first time someone appears and is remembered.
// What an agent is doing shows its status:
//   working  bounces, with two swords clashing overhead
//   blocked  a red "!" bubble that hops (it needs you)
//   done     a green tick bubble (finished while you weren't looking)
//   idle     resting, with z's drifting up
// Click the floor: you walk there. Click anyone: a card with their portrait and
// status; the wrench on the portrait shows the classes to choose from. Press
// and drag an agent: it dangles from the
// pointer; let go to drop it where it is (it falls to the floor). Spots and
// classes are remembered.
// Battle mode (the Start Raid / Return to town button by the sign): the boss
// of a stage stands in the middle (stages cycle slime, ogre, dragon, their HP
// growing with the stage) and the party forms up around it, warriors up close
// and everyone else at range. Every working agent attacks in its own way (a
// swing, an arrow or bolt, a spell, a thrown potion, each looking like the
// weapon its class holds) on its own rhythm, every 3 seconds or less. Each
// attempt has a time limit, shown in the stage section, that runs only while
// someone attacks (10 minutes, shown as "9:42"): a kill in time clears the
// stage (and, with the "Advance after a kill" setting, moves on to the next);
// time running out, or the party being wiped, sends it back a stage to farm.
// Arrows in the stage section (top centre) pick any stage reached. Turning battle mode off sends
// everyone back to their spots.
// The boss fights back (party.js): every character attacking it has an HP bar,
// and it strikes one of them, or a marked spot on the floor that hurts everyone
// in it. At 0 HP a character is knocked out (lying down, stars circling, a
// gold bar and a number counting down the 30 seconds of its rest; it is still
// working) and gets up at full HP after the rest; a knocked-out party is
// wiped, which fails the attempt like the timer. A healer with the Heal Vial heals whoever is low instead of attacking.
// Progress (rules.js): every blow that lands earns experience for the
// attacker's class and for you; a kill earns gold. Each class level makes the
// class hit harder and earns it a skill point, spent in the skills panel on
// Power (damage), Haste (attack speed) or Crit (double damage now and then);
// gold buys the class Attack and Health training there. Levels show on the cards and the
// class choices, gold, kills and points to spend on the sign.
// Gold buys colourways, weapons and hats for a class in the shop (the coin on
// the sign); everyone with that class on wears what it has equipped. A hat is
// bought once for every class, and each class picks its own. A weapon changes
// how the class and its attacks look and how it fights (effects.js): its pace
// and weight, an element the boss may be weak to or resist with a status it
// leaves (burn, chill, chain, venom), or for the healer's vials an aura over
// the party (haste, might, hex).
// In the top-right corner, how many agents are in each status (an icon with a
// count on its corner, hidden at none), and a gear that opens the settings
// (SETTINGS in rules.js), such as the damage numbers that rise off the monster.
// The sign (top left), the stage section (top centre, in a raid), that corner
// and the boss's plate are pixel frames with their words in a pixel lettering
// (see hudLayout); the name tags under everyone are in it too (see tag).
// Layout props: { inset } = left edge of the sign (84 leaves room for macOS buttons).

import { View, div, image } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { agents, props, run, setShared, shared, spaces } from "herdr";
import {
  ATTACK_PHASES,
  CLASSES,
  LABELS,
  CLASS_SKILLS,
  MAX_RANK,
  POWER_BONUS,
  SHOP,
  SHOP_KINDS,
  STATE_VERSION,
  TICK_STEP,
  TRAINING,
  YOU,
  attackArt,
  attackPart,
  attackTicksOf,
  bossOf,
  buy,
  canBuy,
  canRaise,
  canTrain,
  catalogue,
  classLevel,
  clockText,
  credit,
  critChanceOf,
  damageOf,
  equip,
  equipped,
  failStage,
  glyphArt,
  glyphWidth,
  hatArt,
  healOf,
  healthBonus,
  loadState,
  letterArt,
  letterFit,
  letterWidth,
  lettersWidth,
  lookArt,
  maxHpOf,
  monsterArt,
  owns,
  playerLevel,
  pointsEarned,
  pointsLeft,
  pointsLeftAll,
  pointsSpent,
  raise,
  resetSkills,
  SETTINGS,
  selectStage,
  shortNumber,
  slay,
  stageDamage,
  stageTime,
  train,
  trainingBonus,
  trainingOf,
  trainingPrice,
  weaponArt,
} from "./rules.js";
import { KO_TICKS, down, healParty, healTarget, heals, monsterTick, newParty, resetParty, restLeft, restSeconds, rise, standing, syncParty } from "./party.js";
import { AURAS, cadence, effectIconArt, markArt, newStatuses, nextGap, overlayArt, partyAuras, plateIcons, shopLines, statsOf, strike, tickStatuses } from "./effects.js";

const ART = "mods/idle-rpg/art";
// The path image() takes for a picture in art/, given its path in there with
// ".png" ("scene/wall.png"). The pictures are in folders by what they show,
// then by what it is doing (see tools/idle-rpg-sprites.py); rules.js builds the
// paths that depend on the state or an agent (lookArt, weaponArt, hatArt,
// attackArt, monsterArt, glyphArt, letterArt), and the rest are named where they are drawn.
const src = (file) => `${ART}/${file}`;
// shared: { version, you: {x, y}, spots: { <address>: {x, y} }, sprites: { you | <address>: <class> },
//   seen, battle, stage, best, farming, slain, gold, kills: { <kind>: n }, xp: { you | <class>: n },
//   skills: { <class>: { power, haste, crit } }, training: { <class>: { attack, health } },
//   looks: { <class>: { armour | weapon: { owned: [<id>], equipped: <id> }, hat: { equipped: <id> } } },
//   hats: [<id>], settings: { damageNumbers, advance } }
//   (hats are owned by every class; the boss is not saved, see loadState)
const STATE = "idle-rpg.state";
const randomClass = () => CLASSES[Math.floor(Math.random() * CLASSES.length)];
const STATUS = {
  working: ["Working", "#ffd166"],
  blocked: ["Needs you", "#ff7b7b"],
  done: ["Finished", "#6fdc9a"],
  idle: ["Resting", "#9fb4cc"],
};

// The scene's own paint (it is a picture, so it keeps its colours in any theme).
const NIGHT = "#0b1230";
const DAY = "#6db6ee";
const DUSK = "#f2924e";
const TINT = "#0a1030"; // laid over the scenery at night
const FLOOR = "#b9834f";
const INK = "#1b2233";
const CREAM = "#f4ecd8";

// The floor is a fixed band along the bottom. Everyone's position is where their
// feet are, in floor coordinates: x from the left, y down from the top of the floor.
const FLOOR_H = 152;
const WALL_H = 64; // the battlements, standing on the floor's back edge
const CYCLE_MS = 20 * 60 * 1000; // one day and one night
const TICK_MS = 10000; // how often the sky moves on; everything glides between ticks
// Clouds: art, size, how far up the sky (0 the wall top, 1 the ceiling), speed
// in px/s, head start in px.
const CLOUDS = [
  { art: "scene/cloud-a.png", w: 96, h: 28, up: 0.7, speed: 9, off: 0 },
  { art: "scene/cloud-b.png", w: 64, h: 20, up: 0.45, speed: 6, off: 520 },
  { art: "scene/cloud-a.png", w: 96, h: 28, up: 0.25, speed: 12, off: 930 },
  { art: "scene/cloud-b.png", w: 64, h: 20, up: 0.9, speed: 7.5, off: 1410 },
];
const CELL_W = 88;
const YOU_Y = [12, FLOOR_H - 24];
const CRITTER_Y = [16, FLOOR_H - 42];
// The campfire between raids (see fireX): where its feet are on the floor (a
// third of the way up from its front edge), and its picture's size (52x43 art
// px plus the outline's margin), and the width of its stretch of the night's
// gloom (see gloom).
const FIRE_Y = 100;
const FIRE_W = 216;
const FIRE_H = 180;
const FIRE_LIGHT_W = 320;
const CARD_W = 232;
const SHOP_NAV_W = 78; // the kinds of item down the shop's left side
const SHOP_ITEM_H = 78; // one thing for sale: picture, name, button
// The shop is built from rows of fixed height like the skills panel (PANEL):
// a 1px border and 6px of padding round 16 (title), then beside the kinds of
// item down the left, 24 (class tabs) + 78 (the items) + 26 (two lines on the
// item picked: what a weapon does), 3px apart: 167px, so under the sign (top
// 54) it ends at 221 in the lowest scene (230px). The kinds down the left are
// 22 each, with a 13px line under them, shorter than that.
const PANEL_MAX_H = 167; // the tallest panel under the sign: the shop (the skills panel is 165, the codex less)
const SHOP_ROW = { nav: 22, about: 26, tab: 80 }; // tab: the class picked, its sprite and name ("Warrior" is 33px at 9px)
// The skills and training panel is built from rows of fixed height, its text
// on a 13px line, so its height is known: a 1px border and 6px of padding
// round 16 (title) + 24 (class tabs) + 15 (points) + 15 per skill and per kind
// of training, 3px apart. With 3 skills and n kinds of training that is
// 129 + 18n: 147 with Attack alone, 165 with a second kind, so under the sign
// (top 54) it ends at 219 in the lowest scene (230px) with two.
const PANEL = { line: "13px", pad: 6, gap: 3, title: 16, tab: 24, row: 15 };
const SHOP_ICONS = { armour: "icons/armour.png", weapon: "status/sword-l.png", hat: "icons/hat.png" };
// Battle mode. Sizes are on-screen px (art px x 4, plus the outline). A new
// kind also needs to be in KINDS in rules.js, the order the stages cycle
// through, and its pictures in MONSTER_ART there.
const MONSTERS = {
  slime: { name: "Slime", w: 136, h: 104, core: { x: 0, y: 44, r: 18, half: 60 } },
  ogre: { name: "Ogre", w: 200, h: 200, core: { x: 0, y: 86, r: 24, half: 62 } },
  dragon: { name: "Dragon", w: 328, h: 264, core: { x: 12, y: 74, r: 26, half: 84 } },
};
// `core` is the middle of the monster's bulk, where blows land: px right of
// its centre line and above its feet, how far a blow may stray from it, and
// half the bulk's width, which is how close a warrior stands. The picture is
// often much wider than that (the dragon's head, wings and tail).
const WATCH_MS = 1000; // how often to look for a monster due, or someone ready to attack
const RESPAWN_MS = 3000; // how long a fallen boss lies there before the next (its fade takes 1.6s)
// after the kill that first clears a stage and moves on to a new one, the wait
// is longer, with "Moving to stage N in 3" counting it down under the stage section
const ADVANCE_MS = 5000;
const TIMES_UP_FRESH = 1000; // the "Time's up!" note under the stage section shows this long,
const TIMES_UP_MS = 2600; // then fades out until this long after the attempt ran out
// Monsters fighting back (party.js runs it). Where what each kind's attack
// sends flying sets off (its mouth or club, px from its picture's top-left, in
// its pose for a target on its left: mirrored for one on its right when the
// pose has sides, as the slime's spit and the ogre's swing do; the dragon's
// pictures face left only, so its fireball always leaves its mouth there), and
// how far it leans toward its target.
const SHOT_FROM = {
  slime: { single: { x: 36, y: 72 }, area: { x: 64, y: 80 } },
  ogre: { single: { x: 20, y: 160 } },
  dragon: { area: { x: 36, y: 104 } },
};
const LUNGE = 10;
const HP_W = 40; // a character's HP bar, over its head
const HIT_FADE = 400; // a hit flash or an attack's impact fades out this long
// The pictures a monster's attack shows on screen (px): what flies and what
// lands, by its name in MONSTER_ATTACKS (rules.js).
const ATTACK_SIZE = {
  "attack/glob": [28, 28], "attack/splat": [52, 32], "attack/puddle": [140, 48],
  "attack/arc": [36, 44], "attack/thud": [44, 36], "attack/quake": [160, 56],
  "attack/fireball": [44, 32], "attack/claw": [52, 40], "attack/blaze-1": [144, 44], "attack/blaze-2": [144, 44],
};
const sizeOf = (part) => ATTACK_SIZE[part.replace(/\/[lr]$/, "")] ?? [40, 40];
const MONSTER_Y = 108; // where its feet are on the floor
// The boss's name plate (see plate): a HUD frame holding the name and HP in
// the lettering on one line (PLATE_TEXT_Y), the HP bar under them
// (PLATE_BAR_Y, PLATE_BAR_H: a 2px outline round its fill) and, while the boss
// has a status or the party's hex on it, a row of icons (PLATE_ICON_Y, 2
// screen px an art px), the plate PLATE_ICON_H + 2 taller. The stage and the
// time are in the stage section. Its width is fixed for each kind of boss:
// its name, PLATE_GAP, and room for the widest HP it can show (HP_ROOM_TEXT:
// shortNumber's widest, twice), at least BAR_W inside the frame and PLATE_PAD.
const BAR_W = 136;
const PLATE_PAD = 4;
const PLATE_GAP = 8;
const HP_ROOM_TEXT = "9.9E99/9.9E99";
const PLATE_TEXT_Y = 6;
const PLATE_BAR_Y = 22;
const PLATE_BAR_H = 10;
const PLATE_ICON_Y = 34;
const PLATE_H = 38;
const PLATE_ICON_H = 18;
// the HP bar's colours by the share left (above a half, above a fifth, else),
// each with a lighter top edge
const PLATE_TONES = [
  { above: 1 / 2, fill: "#4cd47b", edge: "#9ff0bd" },
  { above: 1 / 5, fill: "#ffd166", edge: "#ffe7a3" },
  { above: -Infinity, fill: "#ff5d5d", edge: "#ff9b9b" },
];
// Weapon effects (effects.js). Damage over time is gathered tick by tick and
// lands once a second (as the attempt's time shown turns, when the stage section is
// drawn anyway; every DOT_TICKS ticks while it stands still), one sum per
// class and status (plus the render on the next tick that starts its number's
// fade, as for any blow); burn in ember, venom in green.
const DOT_TICKS = 4;
const DOT_COLOURS = { burn: "ember", venom: "venom" };
const DOT_SPOT = { burn: -1, venom: 1 }; // its number shows left or right of the boss's middle
// Where a status's pictures sit on the boss, px from the middle of its bulk
// (its core), the first `n` of them by kind: one picture small enough for the
// slime, more of them over a bigger boss.
const EFFECT_SPOTS = [[-1, -0.5], [0.85, -1], [0, 0.5], [-0.5, -1.4]];
const EFFECT_COUNT = { slime: 2, ogre: 3, dragon: 4 };
const CHAIN_W = 56; // the chain's second arc, out past the first blow (14x7 art px)
const CHAIN_H = 28;
const MELEE = 90; // how close to the monster's bulk a warrior must be to reach it
const SWORD = 44; // how far outside the bulk a warrior stands, so the swing lands on it
const RANGE = 360; // how far the ranged classes stand from the monster: five characters
// An attack plays in phases, one TICK_STEP each: 1 is the wind-up, 2 and 3 the
// two halves of the strike or flight, 4 (ATTACK_PHASES) the impact, 0 rest.
// Each attacker keeps its own rhythm (see tick), so the party does not move as one.
const FLIGHT = TICK_STEP * 2;
const POP_FADE = 350; // an impact fades out this long; rules.js counts on it being under two ticks
const BLINK_MS = 5200; // monsters blink this often
const ROAR_MS = 14000; // and the ogre roars this often
const DRAGON_ROAR_MS = 19000; // the dragon's roar is a bigger show, so a little rarer
// The dragon's roar, step by step, and how long each step shows: it rears
// back, roars with its jaws wide while its upper body shakes and rings of
// sound leave its mouth, then settles back to breathing.
const DRAGON_ROAR = [
  ["rear", 300],
  ["roar", 950],
  ["settle", 250],
];
const MOVE = { duration: 700, easing: "ease-in-out" }; // walking between spots and the formation
const CHEER_MS = 2400; // a level-up note over someone's head rises and fades this long
const CRIT_MS = 1200; // a critical blow's number rises and fades this long
// Damage numbers (the "Show damage numbers" setting): each pops up where a blow
// landed, then on the next tick of the attack clock rises DAMAGE_RISE px and
// fades over DAMAGE_MS. At most MAX_DAMAGE show at once; the oldest goes first.
const DAMAGE_MS = 800;
const DAMAGE_RISE = 36;
const MAX_DAMAGE = 12;
// The HUD, three pixel frames along the top of the scene (see hudLayout): the
// sign top left (the title, the counts as chips, the raid button), the stage
// section top centre while the fight shows (the stage with its arrows, the
// time left and its bar; the stage notes under it), and the strip top right
// (the status icons, then the gear). Each is a dark slate panel with a bevel
// (framePieces: frame/ corners over bands of FRAME_COLOURS), its words and
// numbers in the lettering (letterText), everything at 2 screen px an art px.
// They sit in one row HUD_H high from HUD_TOP, HUD_GAP apart; when they do not
// fit the title goes, then the stage section or the strip drops to a second
// row. Below 640px wide (where the fight is not shown either) the strip drops
// under the sign.
const HUD_TOP = 8;
const HUD_EDGE = 10; // the strip from the scene's right edge
const HUD_H = 42; // a frame's height: the gear's chip (34) or a row of chips and a button (22), inside the frame's edge and padding
const HUD_GAP = 8;
const HUD_NARROW = 640;
const FRAME = 4; // a frame's edge: a px of outline and a px of bevel, at 2 screen px each
const STAGE_SHARE = 0.3; // the stage section's width as a share of the scene's
const STAGE_MAX_W = 520; // and the most it grows to on a wide scene
const STAGE_GAP = 6; // between an arrow at one end and what is written beside it
const FRAME_COLOURS = { outline: "#141a26", light: "#56657e", dark: "#1d2534", fill: "#2b3649" }; // as FRAME in the generator
const CHIP_H = 22; // a chip (a count on the sign, the gear, a stage arrow) and the raid button: a 2px edge round 18px
const SIGN_PAD = 6; // inside the sign's frame, left and right of what it holds
// The raid button's faces: red to go back to town, slate to start; lighter
// under the pointer, darker while pressed.
const RAID_BUTTON = {
  on: { face: "#c94040", hover: "#e05555", down: "#9e2f2f", text: "white" },
  off: { face: "#4a5870", hover: "#5d6d88", down: "#38445a", text: "white" },
};
// A chip's states: see-through until the pointer is over it (a lighter square),
// sunk while pressed or while its panel is open (a darker square, outlined).
const CHIP = { hover: "#ffffff26", edge: "#ffffff40", down: "#00000050" };
const NOTE_H = 28; // a stage note: a line of lettering in a frame
// What a class's skill ranks give, in words, for the skills panel.
// `p` is the progress, `c` the class, `ranks` its ranks.
const SKILL_TEXT = {
  power: (p, c, ranks) => `${shortNumber(damageOf(p, c))} damage (+${Math.round(POWER_BONUS * (ranks.power ?? 0) * 100)}%)`,
  haste: (_p, _c, ranks) => `attacks every ${(attackTicksOf(ranks) * TICK_STEP) / 1000}s`,
  crit: (_p, _c, ranks) => `${Math.round(critChanceOf(ranks) * 100)}% crit`,
};
// The left and right arrows beside "Stage N" in the stage section.
const STAGE_ARROWS = { prev: "icons/prev.png", next: "icons/next.png" };
// A multiplier as the training line shows it: "x1.12", "x24.5", "x1.2K".
const times = (x) => `x${x < 10 ? x.toFixed(2) : x < 100 ? x.toFixed(1) : shortNumber(x)}`;
const GOLD = "#ffd166";

function clamp(n, lo, hi) {
  return Math.max(lo, Math.min(hi, n));
}

const capital = (word) => (typeof word === "string" && word ? word[0].toUpperCase() + word.slice(1) : "");

// How many agents are in each status, for the icons in the top-right corner,
// as { status, art, w, h, n } (icons at 3 screen px per art px), skipping zeros.
function tally(list) {
  const n = (st) => list.filter((a) => a.status === st).length;
  return [
    { status: "blocked", art: "status/alert.png", w: 27, h: 30 },
    { status: "working", art: "icons/swords.png", w: 27, h: 27 },
    { status: "done", art: "status/done.png", w: 27, h: 30 },
    { status: "idle", art: "icons/sleep.png", w: 27, h: 27 },
  ]
    .map((t) => ({ ...t, n: n(t.status) }))
    .filter((t) => t.n > 0);
}

// Text in the pixel font (GLYPHS in rules.js: digits, "+", "!", and the point
// and K, M, B, T, E of shortNumber), as a row of glyph pictures `scale` screen px
// per art px, in one of GLYPH_COLOURS. Each glyph is its width (glyphWidth: 3
// art px, the point 1) plus a px of outline each side, 7 high, and each is set
// its width plus 1 after the last, so neighbours share an outline column.
// Characters the font does not have are left out. textW gives the width it
// takes up.
const GLYPH_H = 7;
const textW = (text, scale) => ([...text].filter((ch) => glyphArt("white", ch)).reduce((x, ch) => x + glyphWidth(ch) + 1, 0) + 1) * scale;
function pixelText(text, colour, scale) {
  const parts = [];
  let x = 0;
  for (const ch of text) {
    const art = glyphArt(colour, ch);
    if (!art) continue;
    parts.push(div().absolute().left(x * scale).top(0).child(image(src(art)).w((glyphWidth(ch) + 2) * scale).h(GLYPH_H * scale)));
    x += glyphWidth(ch) + 1;
  }
  return div()
    .relative()
    .w((x + 1) * scale)
    .h(GLYPH_H * scale)
    .children(parts);
}

// Words and numbers on the HUD and the name tags in the lettering (LETTERS in
// rules.js: capitals, digits and signs; lower case is drawn as capitals), as a
// row of pictures at 2 screen px an art px in one of LETTER_COLOURS, set like
// pixelText: each its width (letterWidth) plus 1 after the last, so neighbours
// share an outline column; a space is only its width. Any text can be given:
// letterFit turns what the face lacks into its base letters or a placeholder,
// never nothing. letterW gives the width it takes up. The row is a relative box,
// or at `at` ({ left, top }) an absolute one, which saves a box round it.
const LETTER_H = GLYPH_H * 2;
const letterW = (text) => lettersWidth(letterFit(String(text))) * 2;
function letterText(text, colour, at = null) {
  const parts = [];
  let x = 0;
  for (const ch of letterFit(String(text))) {
    const art = letterArt(colour, ch);
    if (art) parts.push(div().absolute().left(x * 2).top(0).child(image(src(art)).w((letterWidth(ch) + 2) * 2).h(LETTER_H)));
    x += letterWidth(ch) + 1;
  }
  return (at ? div().absolute().left(at.left).top(at.top) : div().relative())
    .flex_none()
    .w((x + 1) * 2)
    .h(LETTER_H)
    .children(parts);
}

// A name tag (an agent's space and tab, yours, a station's): its text in the
// lettering on a small pixel plate, lighter than the HUD's frames since many
// may show: a flat fill with a 2px outline, its corners cut like a frame's, no
// bevel. TAG_H high and as wide as its text plus TAG_PAD a side; `fit` is the
// text as letterFit gives it, at most TAG_TEXT art px (tagFit), so a tag is at
// most TAG_MAX_W wide: agents' default spots are CELL_W (88) apart, so
// neighbours' tags keep 4px between them. `tone` is TAG.plain or TAG.hot (a
// station under the pointer, or you with your card open). The caller places it.
const TAG_H = 18;
const TAG_PAD = 4; // 2px of outline and 2 of fill each side of the text
const TAG_MAX_W = CELL_W - 4;
const TAG_TEXT = (TAG_MAX_W - 2 * TAG_PAD) / 2; // 38 art px of text
const TAG = {
  plain: { fill: "#2b3649b8", edge: "#141a26", text: "white" },
  hot: { fill: "#2b3649", edge: "#ffffff", text: "white" },
};
const tagFit = (text) => letterFit(text, TAG_TEXT);
const tagW = (fit) => lettersWidth(fit) * 2 + 2 * TAG_PAD;
// The boss's plate's width for a kind of boss (MONSTERS): see PLATE_PAD.
const plateW = (kind) => 2 * (FRAME + PLATE_PAD) + Math.max(BAR_W, letterW(kind.name) + PLATE_GAP + letterW(HP_ROOM_TEXT));

// An agent's tag reads "SPACE·TAB" (TAG_SEP between its space and tab
// names, either left out when blank; "·" when both are).
const TAG_SEP = "\u00b7";
// (a part with nothing to draw, like one of zero-width characters, is left out;
// a part is read no further than letterFit would.)
const tagName = (a) =>
  [a.space_name, a.tab_name]
    .map((n) => (typeof n === "string" ? n.slice(0, 512).trim() : ""))
    .filter((n) => letterFit(n) !== "")
    .join(TAG_SEP) || TAG_SEP;
function tag(fit, tone = TAG.plain) {
  const w = tagW(fit);
  return div()
    .w(w)
    .h(TAG_H)
    .child(div().absolute().left(2).top(0).w(w - 4).h(TAG_H).bg(tone.fill).border_t(2).border_b(2).border_color(tone.edge))
    .child(div().absolute().left(0).top(2).w(2).h(TAG_H - 4).bg(tone.edge))
    .child(div().absolute().left(w - 2).top(2).w(2).h(TAG_H - 4).bg(tone.edge))
    .child(letterText(fit, tone.text, { left: TAG_PAD, top: 2 }));
}

// A pixel frame `w` x `h` px, as the pieces to lay first in a box that size
// (behind what it holds): a fill, an edge band along each side (a px of
// outline, then a px of bevel, light on the top and left, dark on the bottom
// and right, at 2 screen px each) and over their ends the corners in frame/,
// whose outer pixel is cut away. Bands of colour stretch to any size without
// blurring; only the corners are pictures.
function framePieces(w, h) {
  const c = FRAME_COLOURS;
  const band = (l, t, bw, bh) => div().absolute().left(l).top(t).w(bw).h(bh);
  const corner = (art, l, t) => div().absolute().left(l).top(t).child(image(src(art)).w(6).h(6));
  return [
    band(FRAME, FRAME, w - 2 * FRAME, h - 2 * FRAME).bg(c.fill),
    band(6, 0, w - 12, FRAME).bg(c.light).border_t(2).border_color(c.outline),
    band(0, 6, FRAME, h - 12).bg(c.light).border_l(2).border_color(c.outline),
    band(6, h - FRAME, w - 12, FRAME).bg(c.dark).border_b(2).border_color(c.outline),
    band(w - FRAME, 6, FRAME, h - 12).bg(c.dark).border_r(2).border_color(c.outline),
    corner("frame/tl.png", 0, 0),
    corner("frame/tr.png", w - 6, 0),
    corner("frame/bl.png", 0, h - 6),
    corner("frame/br.png", w - 6, h - 6),
  ];
}

// A chip on the HUD (a count on the sign, the gear, a stage arrow): `id`, `w`
// px wide and CHIP_H high (or `h`), a 2px edge round what it holds, laid in a
// row 2px apart inside `px` of padding. See-through until the pointer is over
// it (a lighter square); sunk (a darker one, outlined) while pressed and while
// `open`, its panel showing. A dead one (`live` false) does neither. A press
// on it never reaches the floor; the caller adds what a click does.
function chip(id, w, open, kids, { h = CHIP_H, px = 2, live = true } = {}) {
  return h_flex()
    .id(id)
    .flex_none()
    .w(w)
    .h(h)
    .px(px)
    .gap(2)
    .items_center()
    .border(2)
    .border_color(open ? FRAME_COLOURS.outline : "#00000000")
    .bg(open ? CHIP.down : "#00000000")
    .on_mouse_down("left", (_e, cx) => cx.stop_propagation()) // not a click on the floor
    .when(live, (el) =>
      el
        .cursor_pointer()
        .hover((st) => st.bg(open ? CHIP.down : CHIP.hover).border_color(open ? FRAME_COLOURS.outline : CHIP.edge))
        .active((st) => st.bg(CHIP.down).border_color(FRAME_COLOURS.outline)),
    )
    .children(kids);
}
// A count's chip on the sign: its icon (18px) and its number in the lettering.
const countW = (n) => 2 * 2 + 2 + 18 + 2 + letterW(shortNumber(n)) + 2;

function ago(ms) {
  if (!ms) return "";
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
}

export default class RaidParty extends View {
  init(_props, cx) {
    // the later keys are this layout's earlier names, so a rename keeps what was saved
    const read = [STATE, "raid-party.state", "rpg.state", "snow-loft.state"].map((key) => shared(key)).find((v) => v && typeof v === "object");
    let saved;
    try {
      saved = loadState(read);
    } catch {
      saved = loadState(undefined); // only a live object another mod shared could get here
    }
    // State from a later version of this mod is read, never written: saving
    // would drop what this version does not know. Progress then lasts only
    // until the layout is closed.
    this.readOnly = saved.version > STATE_VERSION;
    this.now = Date.now();
    cx.timer.every(TICK_MS, (cx) => {
      this.now = Date.now();
      cx.notify();
    });
    this.size = { width: 900, height: 360 };
    this.wallH = 210; // the wall's height, learned from pointer events
    this.you = saved.you;
    this.spots = saved.spots;
    this.sprites = saved.sprites;
    this.seen = saved.seen; // <address>: when it was last here
    this.battle = saved.battle;
    this.progress = {
      stage: saved.stage,
      best: saved.best,
      farming: saved.farming, // sent back a stage by a failed attempt (see failStage)
      slain: saved.slain,
      gold: saved.gold,
      kills: saved.kills,
      xp: saved.xp,
      skills: saved.skills,
      training: saved.training,
      looks: saved.looks,
      hats: saved.hats,
    };
    // The boss of the stage being fought, { kind, hp, maxHp, stage, id, slainAt? },
    // and the attempt's time left in ms. Neither is saved: an attempt starts
    // afresh when the layout loads. The time runs down one TICK_STEP per tick
    // of the attack clock, so only while someone is attacking a live boss.
    this.monster = bossOf(this.progress.stage, 1);
    this.left = stageTime(this.monster.stage);
    this.timesUp = null; // { at, id, text, fading? } after an attempt failed (time, or a wipe), while its note shows
    // The attack-clock tick the knocked-out characters' countdowns were last
    // turned on (see tick): they all show their seconds as of then, so any
    // number of them turn together, once a second.
    this.koBeat = 0;
    // Who is fighting the boss and how they are (HP, knocked out, its attacks
    // under way), in memory only: see party.js. Kept in step on every tick of
    // the attack clock and by the watch.
    this.party = newParty();
    // The boss's statuses (burn, chill, venom: effects.js) and the damage over
    // time they have dealt since it last landed (see tick), in memory only,
    // like the boss: a new boss or a new attempt starts clean.
    this.statuses = newStatuses();
    this.dots = Object.create(null); // "<class>/<status>": { cls, status, matchup, n, owed: what of n each share is owed (see shares) }
    this.settings = saved.settings; // { <key>: on } for every one of SETTINGS
    this.cheerSeq = 0;
    // The damage numbers on screen, oldest first, while the setting is on (it
    // then also shows critical blows, in gold, so `crits` stays empty): each
    // { key, seed, n, crit, id, at, monster }, placed like the blow (see hitOf)
    // and dropped once faded, or when its monster (by id) is gone.
    this.damage = [];
    // These three are keyed by address, so they have no prototype to collide with.
    this.cheers = Object.create(null); // YOU | <address>: { lines, id, at } while a level-up note shows
    this.crits = Object.create(null); // YOU | <address>: { n, seed, id, at } while a critical blow's number shows
    // The attack clock (see tick), in memory only: TICK_STEPs counted since the
    // view started, and each attacker's rhythm, { start, next, seed }: the tick
    // its attack in progress started (null between attacks), the tick the next
    // one is due, and the start of the latest, which places its blow.
    this.clock = 0;
    this.rhythm = Object.create(null);
    this.ticking = false; // whether the clock is running
    this.blink = false;
    this.roar = false;
    // A blink and a roar are each two renders: on, then off a moment later.
    const flick = (key, ms, ok) => (cx) => {
      if (!this.fighting || !(this.monster?.hp > 0) || !ok()) return;
      this[key] = true;
      cx.notify();
      cx.timer.after(ms, (cx) => {
        this[key] = false;
        cx.notify();
      });
    };
    this.howl = null; // the step of the dragon's roar in progress (see DRAGON_ROAR), else null
    this.howls = 0; // how many it has started, so each one's rings of sound are new elements
    cx.timer.every(BLINK_MS, flick("blink", 170, () => !this.roar && !this.howl));
    cx.timer.every(ROAR_MS, flick("roar", 1100, () => this.monster.kind === "ogre"));
    // The dragon's roar is one render per step, each timed by the one before;
    // nothing renders between roars or while the monster is something else.
    const howl = (i) => (cx) => {
      this.howl = DRAGON_ROAR[i]?.[0] ?? null;
      cx.notify();
      if (this.howl) cx.timer.after(DRAGON_ROAR[i][1], howl(i + 1));
    };
    cx.timer.every(DRAGON_ROAR_MS, (cx) => {
      if (!this.fighting || !(this.monster?.hp > 0) || this.monster.kind !== "dragon" || this.howl) return;
      this.howls += 1;
      howl(0)(cx);
    });
    cx.timer.every(WATCH_MS, (cx) => {
      // whoever stopped fighting while the clock was stopped leaves the party (no render)
      this.muster();
      // nothing happens while the scene is too narrow to show the fight
      if (!this.battle || Math.max(320, this.size.width) < 640) return;
      if (this.fight()) cx.notify(); // a new monster walked in
      else if (this.monster?.advancing && this.monster.hp <= 0) cx.notify(); // the countdown to the next stage, a second at a time
      this.wake(cx);
    });
    if (!CLASSES.includes(this.sprites[YOU])) {
      this.sprites[YOU] = randomClass();
      this.save();
    }
    this.press = null; // { kind: "floor" | "critter" | YOU, address?, px, py }
    this.drag = null; // { address, x, y, vx, last } while a critter dangles
    this.card = null; // whose card is open: an agent's address, or YOU
    this.codex = false; // the list of kills by kind is open under the sign
    this.hot = null; // the station under the pointer: "codex" | "skills" | "shop"
    this.skillsOpen = null; // the class the skills panel under the sign shows, while it is open
    this.shopOpen = null; // the class the shop under the sign shows, while it is open
    this.shopKind = SHOP_KINDS[0]; // the kind of item it shows: the one picked down its left side
    this.shopPick = null; // the item whose lines show under the items (see shopCard)
    this.settingsOpen = false; // the settings menu under the gear is open
    this.picking = false; // the open card is showing the class choices
    this.walking = false;
    this.walkTask = null;
  }

  // Combat is only saved on a kill, so a fight in progress is saved once more
  // as the layout goes (switching layouts, or quitting, when the host allows
  // it the time): the experience its blows have earned. The attempt itself,
  // the boss's HP and its time, is not saved (see loadState): the layout
  // starts a fresh attempt at the stage when it loads.
  close() {
    this.damage = [];
    this.save();
  }

  // Agents can be missing for a while (the app just started, a machine is
  // offline), so one is only forgotten after a week away.
  save() {
    if (this.readOnly) return;
    const old = Date.now() - 7 * 24 * 3600 * 1000;
    for (const k of Object.keys(this.seen)) {
      if (this.seen[k] >= old) continue;
      delete this.seen[k];
      delete this.spots[k];
      delete this.sprites[k];
    }
    setShared(STATE, {
      version: STATE_VERSION,
      you: this.you,
      spots: this.spots,
      sprites: this.sprites,
      seen: this.seen,
      battle: this.battle,
      ...this.progress,
      settings: this.settings,
    });
  }

  // Brings in the next boss if one is due, otherwise lands `blows` on the one
  // there, in order: each { key, damage, crit, seed } and, from tick, the
  // class that dealt it (`cls`, else `key`'s), how it met the boss's
  // weakness (`matchup`), whether it is a chained second strike (`chain`) or
  // damage over time (`dot`: "burn" or "venom").
  // Only damage that lands earns experience: a boss with 3 HP left takes 3
  // of a 4-point blow, and nothing of the blows after it. Returns whether
  // anything changed. Progress is saved on a kill, not on hits: saving
  // re-renders every mod in the window. What a fight earns since the last kill
  // or failed attempt is lost if the app closes mid-fight.
  fight(blows = []) {
    if (!this.battle) return false;
    const m = this.monster;
    if (!MONSTERS[m?.kind] || (m.hp <= 0 && Date.now() - (m.slainAt ?? 0) >= (m.advancing ? ADVANCE_MS : RESPAWN_MS))) {
      // the stage's boss: the next one after a kill, unless "Advance after a kill" is off
      this.newBoss();
      return true;
    }
    // no blow lands while the scene is too narrow to show the fight
    if (Math.max(320, this.size.width) < 640) return false;
    // who took part in a kill, for its gold: everyone in the fight now (the
    // working agents, knocked out or not, so a knockout does not also cut the
    // gold, and you when you join in); at least the one landing the blow
    const attackers = Math.max(1, this.fighters().length);
    let landed = false;
    for (const { key, damage, crit, seed, cls, matchup = null, chain = false, dot = null, dir = 1, shares: owed = null } of blows) {
      if (m.hp <= 0) break;
      const dealt = Math.min(damage, m.hp);
      m.hp -= dealt;
      landed = true;
      if (this.settings.damageNumbers) {
        this.damage.push({ key, seed, n: dealt, crit, matchup, chain, dot, dir, id: (this.cheerSeq += 1), at: Date.now(), tick: this.clock, monster: m.id });
        if (this.damage.length > MAX_DAMAGE) this.damage.shift();
      } else if (crit) this.crits[key] = { n: damage, seed, id: (this.cheerSeq += 1), at: Date.now(), tick: this.clock };
      // damage over time is credited to the class that put it on; what the
      // party's auras added to a blow, to the healer class that gives them
      // (shares in effects.js): the kill's experience is the same, shared out
      const by = cls ?? this.sprites[key];
      const aura = owed ? owed.haste + owed.might + owed.hex : 0;
      for (const [c, part, over] of [[by, 1 - aura, key], ["healer", aura, this.holder("healer", this.attackers())]]) {
        if (!(part > 0)) continue;
        for (const up of credit(this.progress, c, dealt * part, m, attackers)) {
          // a class's level-up shows over whoever earned it, yours over you
          if (up === YOU) this.cheer(YOU, `Level ${playerLevel(this.progress.xp[YOU]).level}`);
          else this.cheer(over, `${capital(up)} ${classLevel(this.progress.xp[up]).level}`);
        }
      }
    }
    if (!landed) return false;
    if (m.hp <= 0) {
      m.hp = 0;
      m.slainAt = Date.now();
      this.clearEffects(); // its statuses fall with it
      // the stage is cleared: gold, and the next stage reached (and fought, if advancing)
      const best = this.progress.best;
      slay(this.progress, m, this.settings.advance, attackers);
      // a first clear that moves the fight on to a stage never fought before:
      // the wait is ADVANCE_MS, counted down under the stage section. Not while farming,
      // with "Advance after a kill" off, or replaying a stage below the best.
      if (this.progress.best > best && this.progress.stage === this.progress.best && this.progress.stage !== m.stage) m.advancing = this.progress.stage;
      this.save();
    }
    return true;
  }

  // Experience for a heal by `key` that restored `got` HP: what one of its
  // blows (damageOf) would earn on the boss now (blowXp, so the stage's rate),
  // times the share of the heal that was needed (`got` of healOf), to its
  // class and to you, as credit does for a blow. Without it the healer's
  // class, healing instead of attacking, falls far behind the others. Saved
  // with the rest of a fight's experience (on a kill or a failed attempt).
  healXp(key, got) {
    const cls = this.sprites[key];
    const m = this.monster;
    const full = healOf(this.progress, cls);
    if (!(m?.hp > 0) || !(full > 0)) return;
    const size = damageOf(this.progress, cls) * Math.min(1, got / full);
    for (const up of credit(this.progress, cls, Math.min(size, m.hp), m, Math.max(1, this.fighters().length))) {
      if (up === YOU) this.cheer(YOU, `Level ${playerLevel(this.progress.xp[YOU]).level}`);
      else this.cheer(key, `${capital(up)} ${classLevel(this.progress.xp[up]).level}`);
    }
  }

  // A fresh attempt: the boss of the stage being fought, at full HP, and the
  // full time limit. Its numbers go with the last one.
  newBoss() {
    this.monster = bossOf(this.progress.stage, (this.monster?.id ?? 0) + 1);
    this.left = stageTime(this.monster.stage);
    this.damage = [];
    this.timesUp = null;
    this.clearEffects();
    // a fresh attempt: everyone up at full HP (the knocked out too), its attacks afresh
    resetParty(this.party, this.clock, Math.random);
  }

  // Takes every status off the boss and drops the damage over time not yet
  // landed: a new boss, a new attempt, a kill, or the raid ended.
  clearEffects() {
    this.statuses = newStatuses();
    this.dots = Object.create(null);
  }

  // The party's auras (effects.js) from who attacks now: a healer on the
  // Haste, Might or Hex Vial gives its aura only while it stands.
  auras() {
    return partyAuras(this.attackers().map((key) => ({ cls: this.sprites[key], weapon: equipped(this.progress, this.sprites[key], "weapon") })));
  }

  // Who of `keys` a class's damage over time is shown for (a level-up note
  // goes over them): the first with that class on, else you.
  holder(cls, keys) {
    return keys.find((key) => this.sprites[key] === cls) ?? YOU;
  }

  // What the boss's name plate's icons say, so a status coming or going is drawn.
  iconKey() {
    return plateIcons(this.statuses, null).map((ic) => `${ic.id}${ic.n}`).join();
  }

  // The attempt failed: its time ran out, or the party was wiped (`why`
  // "Wiped!", see tick): past stage 1 the fight goes back a stage, to farm it
  // (failStage in rules.js), with a fresh attempt there; at stage 1 the same boss is back
  // at full HP with the full time. A note under the stage section says which ("Time's
  // up! Back to stage 8"). Nothing is lost but the attempt; the experience
  // its blows earned is saved, once.
  fail(why = LABELS.timesUp) {
    const from = this.monster.stage;
    const to = failStage(this.progress);
    if (to !== from) this.newBoss();
    else {
      this.monster.hp = this.monster.maxHp;
      this.left = stageTime(this.monster.stage);
      this.damage = [];
      this.clearEffects();
      resetParty(this.party, this.clock, Math.random); // a fresh attempt: everyone up at full HP (newBoss does it too)
    }
    this.timesUp = { at: Date.now(), id: (this.cheerSeq += 1), text: to !== from ? LABELS.back(why, to) : why };
    this.save();
  }

  // Moves the fight to stage `s` (an arrow in the stage section), if it is one
  // reached: a fresh attempt at its boss, saved at once.
  toStage(s, cx) {
    if (!selectStage(this.progress, s)) return;
    this.newBoss();
    this.save();
    this.wake(cx);
  }

  // Shows a short note over someone's head (see cheerNote). Level-ups from the
  // same blow share one note.
  cheer(key, line) {
    const c = this.cheers[key];
    if (c && c.tick === this.clock) c.lines.push(line);
    else this.cheers[key] = { lines: [line], id: (this.cheerSeq += 1), at: Date.now(), tick: this.clock };
  }

  // Whether you join in when the party attacks: the ranged classes from
  // wherever you stand, a warrior only from beside the monster. `alive`: only
  // while the monster stands (between a kill and the next boss you are still
  // in the fight, see fighters).
  joins(W, alive = true) {
    const kind = MONSTERS[this.monster?.kind];
    if (!this.fighting || !kind || (alive && !(this.monster.hp > 0))) return false;
    return this.sprites[YOU] !== "warrior" || Math.abs(this.you.x - (W / 2 + kind.core.x)) - kind.core.half <= MELEE;
  }

  // Who is in the fight: every working agent, and you alongside them if you
  // can reach (see joins), knocked out or not, between a kill and the next
  // boss too. Nobody while battle mode is off or the scene is too narrow.
  fighters() {
    const W = Math.max(320, this.size.width);
    if (!this.battle || W < 640 || !MONSTERS[this.monster?.kind]) return [];
    const keys = agents()
      .filter((a) => a.status === "working")
      .map((a) => a.address);
    // you fight alongside them, once you have arrived: `you` is already the
    // spot you are walking to
    if (keys.length && !this.walking && this.joins(W, false)) keys.push(YOU);
    return keys;
  }

  // Whether `key` is in the fight but knocked out (see party.js).
  knocked(key) {
    return key in this.party.members && !standing(this.party, key);
  }

  // Who attacks now: everyone in the fight who is not knocked out, while the
  // monster is alive.
  attackers() {
    if (!(this.monster?.hp > 0)) return [];
    return this.fighters().filter((key) => !this.knocked(key));
  }

  // Brings the party (party.js) in line with who is fighting: newcomers join
  // at full HP, leavers go, everyone's max HP (rules.js maxHpOf) and spot are
  // updated. Returns the keys in the fight.
  muster() {
    const keys = this.fighters();
    const W = Math.max(320, this.size.width);
    const kind = MONSTERS[this.monster?.kind];
    const at = keys.length && kind ? this.formation(agents(), W, kind) : {};
    const fighters = keys.map((key) => ({ key, maxHp: maxHpOf(this.progress, this.sprites[key]), ...(key === YOU ? this.you : at[key]) }));
    syncParty(this.party, fighters, this.clock, Math.random);
    return keys;
  }

  // The potion class `cls` throws (its weapon's), or undefined.
  potionOf(cls) {
    const id = equipped(this.progress, cls, "weapon");
    return catalogue(cls, "weapon").find((it) => it.id === id)?.potion;
  }

  // The skill ranks of the class someone has on (undefined counts as all 0).
  ranksOf(key) {
    return this.progress.skills[this.sprites[key]];
  }

  // The path of one of class `cls`'s pictures in the colourway it has
  // equipped, or in `colour` (the shop's previews). `frame` is one of FRAMES
  // in rules.js: "stand", "walk/l", "stance/r" and so on.
  look(cls, frame = "stand", colour = equipped(this.progress, cls, "armour")) {
    return src(lookArt(cls, colour, frame));
  }

  // One of class `cls`'s pictures as an element `w` by `h`, wherever a class
  // is drawn: the picture (see look), then the weapon the class holds, or
  // `weapon`, then the hat it has on, or `hat` (the shop's previews), each laid
  // over the last at the same size and place. Each layer's picture is the same
  // canvas as the frame under it, so there is nothing to line up. No hat, no
  // hat layer; no weapon layer where the weapon has no picture (the healer's
  // potion shows only as it winds up).
  sprite(cls, frame, w, h, colour = equipped(this.progress, cls, "armour"), hat = equipped(this.progress, cls, "hat"), weapon = equipped(this.progress, cls, "weapon")) {
    const layers = [weaponArt(cls, weapon, frame), hatArt(cls, hat, frame)].filter(Boolean);
    return div()
      .relative()
      .flex_none()
      .w(w)
      .h(h)
      .child(image(this.look(cls, frame, colour)).w(w).h(h))
      .children(layers.map((top) => div().absolute().left(0).top(0).child(image(src(top)).w(w).h(h))));
  }

  // Starts the attack clock if it is stopped and anyone is ready to attack.
  // It runs one tick every TICK_STEP for as long as tick() says, so only one
  // chain of timers is ever running; one that fails stops, and the watch
  // starts it again.
  wake(cx) {
    // it also runs while anyone in the fight is knocked out, so their rest runs on
    if (this.ticking || (!this.attackers().length && !down(this.party).length)) return;
    this.ticking = true;
    const next = (cx) => {
      let more = false;
      try {
        more = this.tick(cx);
      } finally {
        if (more) cx.timer.after(TICK_STEP, next);
        else this.ticking = false;
      }
    };
    cx.timer.after(TICK_STEP, next);
  }

  // One tick of the attack clock, which also runs the attempt's time down.
  // Each attacker keeps its own rhythm: someone who joins starts somewhere in
  // their first gap, and each attack starts the next one's countdown
  // (nextGap of their pace: Haste, weapon and aura, give or take, so nobody
  // falls into step). An attack runs ATTACK_PHASES ticks, then one of rest;
  // its blow lands on the last phase. Whoever stops attacking (stops working,
  // walks out of reach, the monster falls) loses their rhythm. Re-renders only
  // while someone is mid-attack, the seconds shown change (the stage section's, and
  // the knocked out's countdowns, which turn on the same beat), or something
  // else changed. Returns whether to keep ticking: not once nobody is
  // attacking.
  //
  // The boss fights back on the same clock (party.js): the party is brought in
  // line with who is fighting, then its attacks start and land; whoever is
  // knocked out stops attacking until their rest is over (the clock runs on
  // while anyone rests, but the attempt's time does not without an attacker);
  // a wipe fails the attempt like the timer. A healer with the Heal Vial heals
  // the one lowest on HP instead of attacking when anyone is under HEAL_BELOW.
  // It renders as an attack starts, a tick later (so what flies can glide),
  // as it lands and for two ticks after (impacts fade), and on any hit, heal or
  // knockout.
  //
  // Weapons (effects.js): each attacker's pace is its class's Haste gap times
  // its weapon's factor (and the haste aura's), carried in fractions of a tick
  // (the next attack is due a gap after the last was due, not after it
  // started); its blow is struck with the weapon, the boss's weakness, its
  // statuses and the party's auras, and may chain. The statuses tick only
  // while someone attacks a live boss (they freeze with the attempt's time),
  // their damage gathered and landing once every DOT_TICKS ticks.
  tick(cx) {
    const t = (this.clock += 1);
    let changed = false;
    const inFight = this.muster();
    const alive = this.monster.hp > 0;
    const e = alive ? monsterTick(this.party, t, stageDamage(this.monster.stage), Math.random) : { back: rise(this.party, t), hits: [], landed: null, started: null, wiped: false };
    if (e.back.length || e.hits.length || e.started || e.landed) changed = true;
    const foe = this.party.foe;
    if (foe.pending && t === foe.pending.start + 1) changed = true; // what flies sets off
    if (foe.last && t - foe.last.lands >= 1 && t - foe.last.lands <= 2) changed = true; // the pose ends, impacts fade
    if (e.wiped) {
      this.fail(LABELS.wiped);
      cx.notify();
      return true;
    }
    const keys = this.attackers();
    const auras = this.auras();
    for (const key of Object.keys(this.rhythm)) {
      if (keys.includes(key)) continue;
      if (this.rhythm[key].start !== null) changed = true; // cut off mid-attack: draw them at rest
      delete this.rhythm[key];
    }
    // a healer with the Heal Vial heals instead when someone is low (see
    // party.js), two healers on one tick picking different allies while they can
    const aimed = [];
    for (const key of keys) {
      const cls = this.sprites[key];
      const pace = cadence(attackTicksOf(this.ranksOf(key)), cls, equipped(this.progress, cls, "weapon"), auras);
      // someone who joins starts anywhere in their first gap
      const r = (this.rhythm[key] ??= { start: null, next: t + 1 + Math.random() * Math.max(0, pace.ticks - 1), seed: 0, factor: 1 });
      if (r.start !== null && t - r.start > ATTACK_PHASES) r.start = null; // its rest has been drawn
      if (r.start === null && t >= r.next) {
        r.start = r.seed = t;
        r.factor = pace.factor; // what its blow's damage is multiplied by, for the gap it keeps
        r.haste = pace.haste; // the share of its blows the haste aura adds (owed to the healer)
        r.next = Math.max(r.next, t - 1) + nextGap(pace.ticks, Math.random());
        r.heal = heals(cls, this.potionOf(cls)) ? healTarget(this.party, key, aimed) : null;
        if (r.heal) aimed.push(r.heal);
      }
    }
    // the boss's statuses tick, while anyone attacks it alive (never while it is
    // down, nor in the countdown to the next stage); their damage is gathered (see DOT_TICKS)
    const kind = this.monster.kind;
    if (keys.length && this.monster.hp > 0) {
      const before = this.iconKey();
      for (const d of tickStatuses(this.statuses, kind, auras)) {
        const p = (this.dots[`${d.cls}/${d.status}`] ??= { cls: d.cls, status: d.status, matchup: d.matchup, n: 0, owed: { attacker: 0, haste: 0, might: 0, hex: 0 } });
        p.n += d.damage;
        for (const k of Object.keys(p.owed)) p.owed[k] += d.damage * d.shares[k];
      }
      if (this.iconKey() !== before) changed = true; // one wore off
    }
    // At the impact a healing throw heals whoever is lowest now (the one it
    // was aimed at may have left, fallen or been topped up), if anyone still
    // qualifies and the healer still holds the Heal Vial; else it is an
    // ordinary blow (with an aura vial, an aura healer's half). A heal earns its
    // class experience (see healXp).
    const landing = keys.filter((key) => this.phaseOf(key) === ATTACK_PHASES);
    const healed = [];
    for (const key of landing.filter((k) => this.rhythm[k].heal)) {
      const cls = this.sprites[key];
      const to = heals(cls, this.potionOf(cls)) ? healTarget(this.party, key, healed) : null;
      this.rhythm[key].heal = to;
      if (!to) continue;
      healed.push(to);
      const got = healParty(this.party, to, healOf(this.progress, cls), t);
      if (got > 0) {
        changed = true;
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
        Math.random,
      );
      r.chainAt = out.hits.length > 1 ? t : null; // the second strike's arc shows
      // which way the attacker faces the boss: its chain's arc leaps on that way, and its second number at the arc's end
      const dir = key === YOU ? (this.youDir ?? 1) : (this.at?.[key]?.dir ?? 1);
      for (const h of out.hits) blows.push({ key, cls, seed: r.seed, damage: h.damage, crit: h.crit, matchup: out.matchup, chain: h.chain, dir, shares: out.shares });
    }
    // what the statuses dealt lands once a second, one sum per class and status:
    // as the attempt's time shown turns to the next second (drawn then anyway),
    // or every DOT_TICKS while it stands still
    const turning = keys.length && this.monster.hp > 0 ? Math.ceil((this.left - TICK_STEP) / 1000) !== Math.ceil(this.left / 1000) : t % DOT_TICKS === 0;
    if (turning && this.monster.hp > 0) {
      for (const p of Object.values(this.dots)) {
        if (p.n > 0) {
          const owed = Object.fromEntries(Object.entries(p.owed).map(([k, n]) => [k, n / p.n]));
          blows.push({ key: this.holder(p.cls, keys), cls: p.cls, seed: t, damage: p.n, crit: false, matchup: p.matchup, dot: p.status, shares: owed });
        }
      }
      this.dots = Object.create(null);
    }
    if (blows.length && this.fight(blows)) changed = true;
    // the knocked out's countdowns turn on that same beat, all at once (at most
    // once a second however many are resting), so they cost no render of their own
    // while the stage section's seconds turn; between beats each shows its seconds as of the last
    // (a turn of the stage section's seconds is always a beat, so a countdown never skips a
    // number when the time resumes; the every-4-ticks beat while it stands still
    // keeps a second from the last)
    const plateTurn = keys.length > 0 && this.monster.hp > 0 && turning;
    if (turning && (plateTurn || t - this.koBeat >= DOT_TICKS) && down(this.party).length) {
      this.koBeat = t;
      changed = true;
    }
    // a number that popped in on the last tick starts its rise and fade on this one
    // (an attacker's rest draws it; damage over time can land with nobody mid-attack)
    if (this.damage.some((d) => d.tick === t - 1)) changed = true;
    // the attempt's time runs while the boss is alive and someone attacks it;
    // the stage section shows whole seconds, so it is drawn again as each one passes
    if (keys.length && this.monster.hp > 0) {
      const shown = Math.ceil(this.left / 1000);
      this.left -= TICK_STEP;
      if (this.left <= 0) {
        this.fail();
        changed = true;
      } else if (Math.ceil(this.left / 1000) !== shown) changed = true;
    }
    // the "Time's up!" note shows for a moment, then is drawn once more to fade out
    const note = this.timesUp;
    if (note && !note.fading && Date.now() - note.at >= TIMES_UP_FRESH) {
      note.fading = true;
      changed = true;
    }
    if (changed || keys.some((key) => this.rhythm[key].start !== null)) cx.notify();
    return keys.length > 0 || (inFight.length > 0 && down(this.party).length > 0);
  }

  // A number from 0 to n - 1 for one attacker's attack that started on tick
  // `seed`: the same all through the attack, different on the next.
  roll(key, seed, salt, n) {
    let h = 2166136261 ^ Math.imul(seed + 1, 40503) ^ Math.imul(salt, 2246822519);
    for (const ch of String(key)) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
    // stir it, so that keys one character apart land far apart
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
    h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return ((h ^ (h >>> 16)) >>> 0) % n;
  }

  // Which phase of its attack someone is in right now.
  phaseOf(key) {
    const r = this.rhythm[key];
    const k = r && r.start !== null ? this.clock - r.start : -1;
    return k >= 0 && k < ATTACK_PHASES ? k + 1 : 0;
  }

  // Where the blow of someone's attack that started on tick `seed` lands:
  // around the middle of the monster's bulk, a little different each attack.
  hitOf(key, seed, W, kind) {
    const { x, y, r } = kind.core;
    return {
      x: Math.round(W / 2 + x + this.roll(key, seed, 2, 2 * r + 1) - r),
      y: Math.round(MONSTER_Y - y + this.roll(key, seed, 3, r + 1) - r / 2),
    };
  }

  // Where everyone stands for the fight: warriors beside the monster, the
  // others RANGE away (less if the scene is narrow), alternating sides.
  formation(list, W, kind) {
    const mid = Math.round(W / 2);
    const half = kind.w / 2;
    const reach = Math.max(110, Math.min(RANGE, mid - half - 60));
    const rows = [96, 60]; // each next one on a side stands a step further out, staggered
    const spots = {};
    const count = { melee: 0, ranged: 0 };
    for (const a of list) {
      const melee = this.sprites[a.address] === "warrior";
      const i = melee ? count.melee++ : count.ranged++;
      const side = i % 2 ? 1 : -1; // left first
      const n = Math.floor(i / 2);
      // Warriors close on the bulk itself and stand a little in front of the
      // monster, so its picture does not hide them; the rest keep their range.
      const x = melee ? mid + kind.core.x + side * (kind.core.half + SWORD + n * 62) : mid + side * (half + reach + n * 62);
      spots[a.address] = {
        x: Math.round(clamp(x, 36, W - 36)),
        y: melee ? MONSTER_Y + 6 : clamp(rows[n % rows.length], CRITTER_Y[0], CRITTER_Y[1] + 12),
        dir: -side, // which way the monster is
      };
    }
    return spots;
  }

  // What flies and lands for one agent's attack (the sprite itself strikes the
  // pose, see critter), in the pictures of the weapon its class holds (see
  // attackArt). Things that fly sit hidden at the hand, glide to the monster
  // during phases 2 and 3, then vanish and slip back unseen; the impact pops in
  // at phase 4 and fades.
  // `who` is { key, cls, x, y, dir }: an agent in formation, or you.
  attack(who, W, kind) {
    const s = who;
    const c = who.cls;
    const d = who.dir;
    const side = d > 0 ? "r" : "l";
    const phase = this.phaseOf(who.key);
    const flying = phase === 2 || phase === 3;
    // a healing throw lands on the ally it heals (over its middle), not the monster
    const ally = this.rhythm[who.key]?.heal;
    const allyAt = ally ? (ally === YOU ? this.you : this.at?.[ally]) : null;
    const hit = allyAt ? { x: allyAt.x, y: allyAt.y - 36 } : this.hitOf(who.key, this.rhythm[who.key]?.seed ?? 0, W, kind);
    const art = (name, w, h) => image(src(name)).w(w).h(h);
    const pop = (id, name, w, h, at, on) =>
      div()
        .id(`idle-rpg-${id}-${who.key}`)
        .absolute()
        .left(at.x - w / 2)
        .top(at.y - h / 2)
        .opacity(on ? 1 : 0)
        .transition("opacity", { duration: on ? 20 : POP_FADE, easing: "ease-out" })
        .child(art(name, w, h));
    const shot = (name, w, h, hand, inner = (el) => el) =>
      div()
        .id(`idle-rpg-shot-${who.key}`)
        .absolute()
        .left((flying ? hit.x : hand.x) - w / 2)
        .top((flying ? hit.y : hand.y) - h / 2)
        .opacity(flying ? 1 : 0)
        .transition("left", { duration: FLIGHT, easing: "linear" })
        .transition("top", { duration: FLIGHT, easing: "linear" })
        .child(inner(div().relative()).child(art(name, w, h)));
    const from = (dx, dy) => ({ x: s.x + d * dx, y: s.y - dy });
    const weapon = equipped(this.progress, c, "weapon");
    const part = (name) => attackArt(c, weapon, name, side);

    // the warrior swings its own weapon; only the slash is extra
    if (c === "warrior") return [pop("slash", part("shot"), 32, 44, from(62, 24), phase === 2)];
    if (c === "archer") return [shot(part("shot"), 44, 20, from(40, 22)), pop("hit", part("hit"), 20, 20, hit, phase === 4)];
    if (c === "wizard") {
      // a chained blow (the Bolt Staff): a second arc leaps on past the first, the way the spell flew
      const chained = this.rhythm[who.key]?.chainAt;
      const arcOn = chained != null && chained === this.clock;
      const arcAt = { x: hit.x + (d > 0 ? CHAIN_W / 2 : -CHAIN_W / 2), y: hit.y - 12 };
      const arc = chained != null && this.clock - chained <= 2 ? [pop("chain", overlayArt("chain", d > 0 ? "arc/r" : "arc/l"), CHAIN_W, CHAIN_H, arcAt, arcOn)] : [];
      return [shot(part("shot"), 40, 32, from(46, 26)), pop("hit", part("hit"), 44, 44, hit, phase === 4), ...arc];
    }
    // healer: the potion is lobbed, rising for the first half and falling for the second
    const lob = (el) =>
      el
        .id(`idle-rpg-lob-${who.key}`)
        .top(phase === 2 ? -44 : 0)
        .transition("top", { duration: FLIGHT / 2, easing: phase === 2 ? "ease-out" : "ease-in" });
    return [shot(part("shot"), 28, 36, from(24, 40), lob), pop("hit", part("hit"), 52, 32, hit, phase === 4)];
  }

  // The monster and its health bar. `hits` is how many agents are attacking it.
  foe(W, hits) {
    const m = this.monster;
    const kind = m && MONSTERS[m.kind];
    if (!this.battle || !kind || W < 640) return [];
    const left = Math.round(W / 2 - kind.w / 2);
    const top = MONSTER_Y - kind.h + 4;
    const dead = m.hp <= 0;
    const hurt = hits > 0 && !dead;
    const roaring = m.kind === "ogre" && this.roar;
    const howl = m.kind === "dragon" && !dead ? this.howl : null; // the dragon's roar: "rear" | "roar" | "settle"
    // its own attack (party.js): a pose of its own in place of its pictures,
    // leaning toward the target, from the attack's start to a tick after it lands
    const empty = !Object.keys(this.party.members).length; // nobody fighting: no attack shows
    const fa = empty ? null : (this.party.foe.pending ?? (this.party.foe.last && this.clock - this.party.foe.last.lands <= 1 ? this.party.foe.last : null));
    const faSide = fa && fa.x < W / 2 + kind.core.x ? "l" : "r";
    const posed = fa && !dead ? attackPart(m.kind, fa.kind, "pose", faSide) : null;
    const lean = posed && fa.kind === "single" ? (faSide === "l" ? -LUNGE : LUNGE) : 0;
    const lids = this.blink && !dead && !roaring && !howl;
    // Rings of sound leave the dragon's mouth one after another as the roar
    // starts. Each is drawn from the wind-up on, unseen at the mouth, so the
    // roar's render has something to glide: out to the left as it fades in,
    // then out again by an inner fade (the two opacities multiply).
    const ring = (i) => {
      const on = howl !== "rear";
      const delay = i * 180;
      return div()
        .id(`idle-rpg-roar-wave-${this.howls}-${i}`)
        .absolute()
        .left(on ? -150 : -20)
        .top(74)
        .opacity(on ? 1 : 0)
        .transition("opacity", { duration: 120, delay, easing: "ease-out" })
        .transition("left", { duration: 800, delay, easing: "linear" })
        .child(
          div()
            .id(`idle-rpg-roar-fade-${this.howls}-${i}`)
            .opacity(on ? 0 : 1)
            .transition("opacity", { duration: 450, delay: delay + 300, easing: "ease-in" })
            .child(image(src(monsterArt("dragon", "roar/wave"))).w(28).h(56)),
        );
    };
    // one piece of the monster's art (one of MONSTER_ART in rules.js), laid over the whole picture's box
    const layer = (part) =>
      div()
        .absolute()
        .left(0)
        .top(0)
        .child(image(src(monsterArt(m.kind, part))).w(kind.w).h(kind.h));
    // the plate over its head, a row taller while it shows status icons, kept
    // inside the scene when the wall is low and clear of the HUD's frames above
    // it (the stage section, and on a narrow scene the sign or the strip; not a
    // stage note, which is short-lived and drawn over it, so the plate never jumps)
    const icons = dead ? [] : plateIcons(this.statuses, this.auras());
    const plateH = PLATE_H + (icons.length ? PLATE_ICON_H + 2 : 0);
    const mid = left + Math.round(kind.w / 2);
    const half = plateW(kind) / 2;
    const hud = this.hudBox ?? {};
    const clear = [hud.sign, hud.strip, hud.stage]
      .filter((b) => b && b.x < mid + half && mid - half < b.x + b.w)
      .reduce((y, b) => Math.max(y, b.y + b.h + 4), 4);
    const plateTop = Math.max(top - plateH - 4, clear - this.wallH);
    const plate = this.plate(m, kind, mid, plateTop, icons);
    return [
      div()
        .id(`idle-rpg-monster-${m.id}`)
        .absolute()
        .left(left)
        .top(top)
        .opacity(dead ? 0 : 1)
        .transition("opacity", { duration: 1600, easing: "ease-in" })
        .child(
          div()
            .id(`idle-rpg-monster-body-${m.id}`)
            .relative()
            .w(kind.w)
            .h(kind.h)
            // It recoils a little when a blow lands. Otherwise each monster
            // is a still picture with pieces that move over or behind it, so
            // nothing ever shows through: the slime's dome sinks into its foot
            // and rises, the dragon's tail sways behind its body, and the ogre
            // and dragon breathe with their upper body while the feet stay
            // planted. The ogre and dragon now and then roar (the dragon's
            // whole picture swaps for its wind-up and roar, with only the
            // roaring upper body shaking over it), and all blink.
            .top(this.struck && hurt ? -4 : 0)
            .transition("top", { duration: 90, easing: "ease-out" })
            .left(lean)
            .transition("left", { duration: 150, easing: "ease-out" })
            .when(m.kind === "dragon", (el) => el.child(layer("tail").loop("top", { from: 0, to: 5, period: 2600 })))
            .when(Boolean(posed), (el) => el.child(layer(posed)))
            .when(!posed, (el) => el.child(layer(roaring ? "roar/roar" : m.kind === "slime" ? "base" : m.kind === "dragon" ? (howl === "roar" ? "roar/roar" : howl ? "roar/rear" : "body") : "idle")))
            .when(!posed && howl === "roar", (el) => el.child(layer("roar/top").loop("left", { from: -2, to: 2, period: 140, easing: "linear" })))
            .when(!posed && Boolean(howl), (el) => el.children([0, 1, 2].map(ring)))
            .when(!posed && !roaring && !howl, (el) =>
              el.child(
                layer("top")
                  .loop("top", m.kind === "slime" ? { from: 0, to: 8, period: 1700 } : { from: 0, to: -3, period: m.kind === "dragon" ? 3200 : 2600 })
                  .when(lids, (top) => top.child(layer("blink"))),
              ),
            )
            .when(!dead, (el) => el.children(this.marks(m.kind, kind))),
        ),
      plate,
    ];
  }

  // The pictures of the statuses on the boss (effects/<status>/), laid over
  // its body around the middle of its bulk, a few more on a bigger boss
  // (EFFECT_COUNT): flames licking up while it burns, two shapes crossfading;
  // frost crystals and a twinkle while it is chilled; venom welling up and
  // dripping, a drip per stack. All native loops, nothing re-rendered.
  marks(name, kind) {
    const st = this.statuses;
    const n = EFFECT_COUNT[name] ?? 2;
    const cx = kind.w / 2 + kind.core.x;
    const cy = kind.h - 4 - kind.core.y;
    const spot = (i) => ({ x: Math.round(cx + EFFECT_SPOTS[i][0] * kind.core.r), y: Math.round(cy + EFFECT_SPOTS[i][1] * kind.core.r) });
    const pic = (part, w, h, at, fade) =>
      div()
        .absolute()
        .left(at.x - w / 2)
        .top(at.y - h)
        .when(Boolean(fade), (el) => el.loop("opacity", fade))
        .child(image(src(overlayArt(...part))).w(w).h(h));
    const out = [];
    if (Object.keys(st.burn).length)
      for (let i = 0; i < n; i++) {
        const period = 480 + i * 110;
        out.push(pic(["burn", "flame-1"], 32, 36, spot(i), { from: 1, to: 0, period, easing: "linear" }), pic(["burn", "flame-2"], 32, 36, spot(i), { from: 0, to: 1, period, easing: "linear" }));
      }
    if (st.chill > 0) {
      for (let i = 0; i < n - 1; i++) out.push(pic(["chill", "crystal"], 44, 36, spot(i), null));
      out.push(pic(["chill", "glint"], 20, 20, spot(n - 1), { from: 0, to: 1, period: 900 }));
    }
    for (let i = 0; i < Math.min(n, st.venom.length); i++) {
      const at = spot((i + 1) % n);
      const period = 1300 + i * 170;
      out.push(pic(["venom", "drip-1"], 28, 28, at, { from: 1, to: 0, period }), pic(["venom", "drip-2"], 28, 40, { x: at.x, y: at.y + 12 }, { from: 0, to: 1, period }));
    }
    return out;
  }

  // The boss's name plate, over its head (kept inside the scene, and clear of
  // the HUD, when the wall is low): a HUD frame (framePieces) plateW(kind)
  // wide holding the boss's name in gold, its HP right of it in white (both
  // rounded up, so a boss at full HP never reads more than its maximum), and
  // under them its HP bar, green, yellow or red by the share left
  // (PLATE_TONES), gliding between renders; once it is down, "<NAME> SLAIN!"
  // over the empty bar. `icons` (plateIcons in effects.js): a last row of
  // icons for the statuses on it (burn, chill, venom with its stacks) and the
  // party's hex. The stage and the time left are in the stage section.
  plate(m, kind, x, top, icons = []) {
    const dead = m.hp <= 0;
    const w = plateW(kind);
    const h = PLATE_H + (icons.length ? PLATE_ICON_H + 2 : 0);
    const share = m.hp / m.maxHp;
    const tone = PLATE_TONES.find((t) => share > t.above) ?? PLATE_TONES[PLATE_TONES.length - 1];
    const inner = w - 2 * (FRAME + PLATE_PAD);
    const hp = `${shortNumber(Math.ceil(m.hp))}/${shortNumber(Math.ceil(m.maxHp))}`;
    return div()
      .id("idle-rpg-plate")
      .absolute()
      .left(x - w / 2)
      .top(top)
      .w(w)
      .h(h)
      .children(framePieces(w, h))
      .child(letterText(dead ? LABELS.slain(kind.name) : kind.name, "gold", { left: FRAME + PLATE_PAD, top: PLATE_TEXT_Y }))
      .when(!dead, (el) => el.child(letterText(hp, "white", { left: w - FRAME - PLATE_PAD - letterW(hp), top: PLATE_TEXT_Y })))
      .child(
        div()
          .absolute()
          .left(FRAME + PLATE_PAD)
          .top(PLATE_BAR_Y)
          .w(inner)
          .h(PLATE_BAR_H)
          .bg(FRAME_COLOURS.dark)
          .border(2)
          .border_color(FRAME_COLOURS.outline)
          .child(
            div()
              .id("idle-rpg-monster-hp")
              .h(PLATE_BAR_H - 4)
              .w(Math.round(((inner - 4) * Math.max(0, m.hp)) / m.maxHp))
              .bg(tone.fill)
              .border_t(2)
              .border_color(tone.edge)
              .transition("width", { duration: 150, easing: "ease-out" }),
          ),
      )
      .when(icons.length > 0, (el) =>
        el.child(
          h_flex()
            .id("idle-rpg-plate-icons")
            .absolute()
            .left(FRAME + PLATE_PAD)
            .top(PLATE_ICON_Y)
            .h(PLATE_ICON_H)
            .gap(3)
            .items_center()
            .children(
              icons.map((ic) =>
                h_flex()
                  .id(`idle-rpg-plate-${ic.id}`)
                  .flex_none()
                  .gap(1)
                  .items_center()
                  .child(image(src(effectIconArt(ic.id))).w(18).h(18))
                  .when(ic.id === "venom", (row) => row.child(pixelText(String(ic.n), "white", 2))),
              ),
            ),
        ),
      );
  }

  // What the boss's attack (party.js) puts on the floor: `under` everyone, the
  // marker where an area attack will land (pulsing while it waits) and what
  // covers the spot as it lands; `over` everyone, what flies at the target
  // (sitting unseen at the mouth as the attack starts, gliding there from the
  // next tick on, natively, to arrive as it lands) and what lands on a single
  // target. Impacts pop in on the tick it lands and fade on the next.
  foeAttack(W, kind) {
    const m = this.monster;
    const under = [];
    const over = [];
    if (!kind || !(m.hp > 0) || !Object.keys(this.party.members).length) return { under, over };
    const t = this.clock;
    const left = Math.round(W / 2 - kind.w / 2);
    const top = MONSTER_Y - kind.h + 4;
    const art = (part, w, h) => image(src(monsterArt(m.kind, part))).w(w).h(h);
    const sideOf = (a) => (a.x < W / 2 + kind.core.x ? "l" : "r");
    const targetOf = (a) => (a.kind === "area" ? { x: a.x, y: a.y } : { x: a.x, y: a.y - 36 });
    const p = this.party.foe.pending;
    if (p) {
      const side = sideOf(p);
      if (p.kind === "area")
        under.push(
          div()
            .id(`idle-rpg-marker-${p.id}`)
            .absolute()
            .left(p.x - 74)
            .top(p.y - 38)
            .loop("opacity", { from: 0.55, to: 1, period: 400 })
            .child(image(src("foe/marker.png")).w(148).h(76)),
        );
      const shot = attackPart(m.kind, p.kind, "shot", side);
      if (shot) {
        const [w, h] = sizeOf(shot);
        const mouth = SHOT_FROM[m.kind]?.[p.kind] ?? { x: kind.w / 2, y: kind.h / 2 };
        const sided = attackPart(m.kind, p.kind, "pose", "l") !== attackPart(m.kind, p.kind, "pose", "r");
        const from = { x: left + (side === "r" && sided ? kind.w - mouth.x : mouth.x), y: top + mouth.y };
        const to = targetOf(p);
        const go = t > p.start;
        const glide = { duration: Math.max(TICK_STEP, (p.lands - p.start - 1) * TICK_STEP), easing: "linear" };
        over.push(
          div()
            .id(`idle-rpg-foe-shot-${p.id}`)
            .absolute()
            .left(Math.round((go ? to.x : from.x) - w / 2))
            .top(Math.round((go ? to.y : from.y) - h / 2))
            .opacity(go ? 1 : 0)
            .transition("left", glide)
            .transition("top", glide)
            .child(art(shot, w, h)),
        );
      }
    }
    const l = this.party.foe.last;
    if (l && t - l.lands <= 2) {
      const fresh = t === l.lands;
      const hit = attackPart(m.kind, l.kind, "hit", sideOf(l));
      const flicker = attackPart(m.kind, l.kind, "flicker", sideOf(l));
      if (hit) {
        const [w, h] = sizeOf(hit);
        const at = targetOf(l);
        const pop = div()
          .id(`idle-rpg-foe-hit-${l.id}`)
          .absolute()
          .left(Math.round(at.x - w / 2))
          .top(Math.round(at.y - (l.kind === "area" ? h - 8 : h / 2)))
          .opacity(fresh ? 1 : 0)
          .transition("opacity", { duration: fresh ? 20 : l.kind === "area" ? 2 * HIT_FADE : HIT_FADE, easing: "ease-out" })
          .child(div().relative().w(w).h(h).child(art(hit, w, h)).when(Boolean(flicker), (el) => el.child(div().absolute().left(0).top(0).loop("opacity", { from: 0, to: 1, period: 220, easing: "linear" }).child(art(flicker, w, h)))));
        (l.kind === "area" ? under : over).push(pop);
      }
    }
    return { under, over };
  }

  // A pointer event on the root, as a point in floor coordinates.
  point(e) {
    const b = e.bounds ?? { x: 0, y: 0, height: this.wallH + FLOOR_H }; // absent before the first paint
    this.wallH = Math.max(0, b.height - FLOOR_H);
    return { x: e.position.x - b.x, y: e.position.y - b.y - this.wallH };
  }

  // Where a critter sits: its remembered spot, else the next free one along the floor.
  place(list, W) {
    const live = new Set(list.map((a) => a.address));
    for (const a of list) this.seen[a.address] = Date.now();
    // A newcomer gets a random class, kept from then on.
    let joined = false;
    for (const a of list) {
      if (CLASSES.includes(this.sprites[a.address])) continue;
      this.sprites[a.address] = randomClass();
      joined = true;
    }
    if (joined) this.save();
    const perRow = Math.max(1, Math.floor((W - 250 - 60) / CELL_W));
    const fire = this.fireX(W);
    for (const a of list) {
      if (this.spots[a.address]) continue;
      for (let i = 0; ; i++) {
        const s = { x: 250 + (i % perRow) * CELL_W, y: Math.floor(i / perRow) % 2 ? 104 : 64 };
        if (fire !== null && this.clearOfFire(s, fire) !== s) continue; // never behind the campfire (the first column never is)
        const taken = Object.entries(this.spots).some(([k, o]) => live.has(k) && Math.abs(o.x - s.x) < 50 && Math.abs(o.y - s.y) < 30);
        if (!taken || i > 200) {
          this.spots[a.address] = s;
          break;
        }
      }
    }
  }

  // Whether someone standing at p would be in the campfire at x: anywhere
  // across its stones and short of a step in front of them.
  // Where someone whose spot is p stands while the campfire is at x: at p,
  // unless that is behind the fire or in it (above its base, where the flames
  // would hide them), then on the same row just past its nearer side. A spot
  // below the base, in front of the stones, is left alone. For agents, who
  // cannot stand as low as you can; the saved spot is not changed, so it is
  // theirs again when the fire is elsewhere (a raid, another window width).
  clearOfFire(p, x) {
    const reach = FIRE_W / 2 + 8;
    if (Math.abs(p.x - x) >= reach || p.y >= FIRE_Y) return p;
    return { x: x + (p.x < x ? -reach : reach), y: p.y };
  }

  inFire(p, x) {
    return Math.abs(p.x - x) < FIRE_W / 2 + 8 && p.y < FIRE_Y + 12;
  }

  walkTo(p, W, cx) {
    if (this.fighting && this.knocked(YOU)) return; // knocked out: you lie there until your rest is over
    const to = { x: Math.round(clamp(p.x, 30, W - 30)), y: Math.round(clamp(p.y, YOU_Y[0], YOU_Y[1])) }; // whole pixels keep the sprite sharp
    const fire = this.fireX(W);
    if (fire !== null && this.inFire(to, fire)) to.y = Math.min(YOU_Y[1], FIRE_Y + 12); // up to the campfire's stones, not into them
    const dist = Math.hypot(to.x - this.you.x, to.y - this.you.y);
    this.walkMs = clamp(Math.round(dist * 4), 150, 3000);
    this.you = to;
    this.walking = true;
    this.walkTask?.cancel?.();
    const walk = (this.walkId = (this.walkId ?? 0) + 1);
    this.walkTask = cx.timer.after(this.walkMs, (cx) => {
      if (walk !== this.walkId) return;
      this.walking = false;
      cx.notify();
    });
    const step = (cx) => {
      if (walk !== this.walkId || !this.walking) return;
      this.step = this.step ? 0 : 1;
      cx.notify();
      cx.timer.after(160, step);
    };
    cx.timer.after(160, step);
    this.save();
  }

  // Everything behind the floor, back to front: stars, daylight, sunset glow,
  // sun and moon, clouds, mountains, then the wall with its banners and torches.
  // The time of day comes from the clock, so every window agrees on it.
  scenery(W) {
    const turn = ((this.now % CYCLE_MS) / CYCLE_MS) * Math.PI * 2;
    const up = Math.sin(turn); // the sun's height: 1 at noon, -1 at midnight
    const day = clamp(up * 3 + 0.5, 0, 1);
    const dusk = clamp(1 - Math.abs(up) * 2.5, 0, 1);
    const night = (this.night = 1 - day);
    const glide = { duration: TICK_MS, easing: "linear" };
    const fade = (el, id, o) => el.id(id).opacity(o).transition("opacity", glide);
    const tiles = (art, w, h, place) =>
      Array.from({ length: Math.ceil(W / w) }, (_, i) => place(div().absolute().left(i * w)).child(image(src(art)).w(w).h(h)));
    const horizon = FLOOR_H + WALL_H;
    const sky = Math.max(40, this.wallH - WALL_H); // the room above the wall

    // The sun and moon ride one circle, half a turn apart, and set behind the wall.
    const orb = (id, art, a) =>
      div()
        .id(id)
        .absolute()
        .left(Math.round(W / 2 - Math.cos(a) * (W / 2 - 60)) - 20)
        .top(Math.round(-Math.sin(a) * clamp(sky - 34, 30, 130)) - 20)
        .transition("left", glide)
        .transition("top", glide)
        .child(image(src(art)).w(40).h(40));

    // A cloud that leaves on the right comes back on the left as a new element,
    // so it does not glide back across the sky.
    const seconds = this.now / 1000;
    const clouds = CLOUDS.map((c, i) => {
      const lane = W + 320;
      const gone = seconds * c.speed + c.off;
      const lap = Math.floor(gone / lane);
      return div()
        .id(`idle-rpg-cloud-${i}-${lap}`)
        .absolute()
        .left(Math.round(gone - lap * lane) - 160)
        .top(-Math.round(c.up * Math.max(0, sky - c.h - 6)) - c.h - 4)
        .opacity(0.3 + 0.7 * day)
        .transition("left", glide)
        .child(image(src(c.art)).w(c.w).h(c.h));
    });

    const fittings = [];
    for (let x = 256; x < W - 120; x += 384) {
      fittings.push(div().absolute().left(x).bottom(FLOOR_H + 2).child(image(src("scene/banner.png")).w(40).h(56)));
      if (x + 232 > W - 60) continue;
      fittings.push(
        fade(div().absolute().left(x + 188).bottom(FLOOR_H + 30).w(48).h(48), `idle-rpg-glow-${x}`, 0.25 + 0.75 * night).child(
          div().size_full().rounded(24).bg("#ffb34750").loop("opacity", { from: 0.55, to: 1, period: 640 }),
        ),
      );
      fittings.push(div().absolute().left(x + 200).bottom(FLOOR_H + 8).child(image(src("scene/torch.png")).w(24).h(48)));
    }

    return [
      fade(div().absolute().left(0).top(0).w(W).h(128), "idle-rpg-stars", night).children(tiles("scene/stars.png", 256, 128, (el) => el.top(0))),
      fade(div().absolute().left(0).top(0).bottom(0).w(W).bg(DAY), "idle-rpg-day", day),
      ...[0.75, 0.6, 0.45, 0.3, 0.15].map((o, i) =>
        fade(div().absolute().left(0).bottom(horizon - 8 + i * 20).w(W).h(20).bg(DUSK), `idle-rpg-dusk-${i}`, dusk * o),
      ),
      div()
        .absolute()
        .left(0)
        .bottom(horizon)
        .w(W)
        .h(1)
        .child(orb("idle-rpg-sun", "scene/sun.png", turn))
        .child(orb("idle-rpg-moon", "scene/moon.png", turn + Math.PI))
        .children(clouds),
      ...tiles("scene/mountains.png", 256, 80, (el) => el.bottom(horizon - 24)),
      fade(div().absolute().left(0).top(0).bottom(FLOOR_H).w(W).bg(TINT), "idle-rpg-night-sky", night * 0.5),
      ...tiles("scene/wall.png", 128, WALL_H, (el) => el.bottom(FLOOR_H)),
      ...fittings,
    ];
  }

  // The status icon over an agent's head, in pixel art. Every motion here is a
  // native loop, so none of it re-renders the view.
  bubble(a, x, y) {
    const art = (name, w, h) => image(src(name)).w(w).h(h);
    if (a.status === "working") {
      // Two swords swing together and apart; a spark flashes as they meet.
      const swing = (from, to) => ({ from, to, period: 520, easing: "ease-in" });
      return div()
        .absolute()
        .left(x - 30)
        .top(y - 104)
        .w(60)
        .h(40)
        .child(div().absolute().left(0).top(4).loop("left", swing(0, 7)).child(art("status/sword-l.png", 36, 36)))
        .child(div().absolute().left(24).top(4).loop("left", swing(24, 17)).child(art("status/sword-r.png", 36, 36)))
        .child(div().absolute().left(20).top(0).loop("opacity", swing(0, 1)).child(art("status/spark.png", 20, 20)));
    }
    if (a.status === "blocked")
      return div().absolute().left(x - 18).top(y - 108).loop("top", { from: y - 108, to: y - 114, period: 560 }).child(art("status/alert.png", 36, 40));
    if (a.status === "done") return div().absolute().left(x - 18).top(y - 108).child(art("status/done.png", 36, 40));
    // idle: three z's drift up and take turns fading
    const doze = (from, to) => ({ from, to, period: 2400 });
    return div()
      .absolute()
      .left(x + 4)
      .top(y - 116)
      .w(64)
      .h(60)
      .loop("top", { from: y - 116, to: y - 120, period: 2400 })
      .child(div().absolute().left(0).top(40).loop("opacity", doze(1, 0.25)).child(art("status/z-1.png", 20, 20)))
      .child(div().absolute().left(16).top(20).loop("opacity", doze(0.5, 1)).child(art("status/z-2.png", 24, 24)))
      .child(div().absolute().left(36).top(0).loop("opacity", doze(0.25, 1)).child(art("status/z-3.png", 28, 28)));
  }

  // An agent at rest: shadow, sprite, bubble, name. Returns elements for the floor.
  critter(a, W) {
    const c = this.sprites[a.address];
    const { x, y } = this.at[a.address];
    const fighting = this.fighting && a.status === "working";
    // In formation everyone faces the monster in a fighting stance, on a wider
    // picture (96px) so a weapon can reach out; a working agent winds up on
    // phase 1 and strikes on 2 and 3.
    const dir = this.at[a.address].dir;
    const phase = this.phaseOf(a.address);
    const frame = !fighting || !(this.monster?.hp > 0) ? "stance" : phase === 1 ? "windup" : phase === 2 || phase === 3 ? "strike" : "stance";
    // knocked out (still working): lying on its back, its head away from the monster
    const out = fighting && this.knocked(a.address);
    const pose = out
      ? this.sprite(c, `down/${dir > 0 ? "l" : "r"}`, 72, 72)
      : this.fighting
        ? div().relative().w(72).h(72).child(div().absolute().left(dir > 0 ? 0 : -24).top(0).child(this.sprite(c, `${frame}/${dir > 0 ? "r" : "l"}`, 96, 72)))
        : this.sprite(c, "stand", 72, 72);
    const where = `${a.space_name} · ${a.tab_name}`;
    const name = tagName(a);
    const fit = tagFit(name); // as drawn: cut, folded, unknown characters boxed
    const open = this.card === a.address;
    return [
      div()
        .id(`idle-rpg-shadow-${a.address}`)
        .absolute()
        .left(x - 26)
        .top(y - 7)
        .transition("left", MOVE)
        .transition("top", MOVE)
        .w(52)
        .h(14)
        .rounded(7)
        .bg("#00000038")
        .border(2)
        .border_color(a.focused || open ? "#fdf3c4" : "#00000000"),
      div()
        .id(`critter-${a.address}`)
        .absolute()
        .left(x - 36)
        .top(y - 66)
        .transition("left", MOVE)
        .transition("top", this.fighting ? MOVE : { duration: 260, easing: "ease-in" })
        .cursor_pointer()
        .on_mouse_down("left", (e) => {
          this.press = { kind: "critter", address: a.address, px: e.position.x, py: e.position.y };
        })
        .child(
          div()
            .relative()
            .when(a.status === "working" && !fighting, (el) => el.loop("top", { from: 0, to: -7, period: 520 }))
            .child(pose),
        ),
      // in a fight a working agent attacks instead of showing the swords
      // overhead, and has its HP bar there (or, knocked out, its stars and rest)
      ...(fighting ? this.vitals(a.address, x, y) : [this.bubble(a, x, y)]),
      // named for where it works (when the tag cannot show the name as typed,
      // the whole of it is in its tooltip, and on its card, in the app's font);
      // what kind of agent it is, is on its card
      tag(fit)
        .id(`idle-rpg-label-${a.address}`)
        .absolute()
        .left(clamp(Math.round(x - tagW(fit) / 2), 2, W - tagW(fit) - 2))
        .top(y + 11)
        .transition("left", MOVE)
        .transition("top", MOVE)
        .when(fit !== name.toUpperCase(), (el) => el.tooltip(where)),
    ];
  }

  // What shows over someone in the fight whose feet are at x, y (see
  // party.js): their HP bar, or, knocked out, stars circling over them, a
  // gold bar running down their rest (natively, from the render after they
  // fell) and beside it the whole seconds left of it in the pixel font, in
  // gold (as of the countdowns' last beat, see koBeat; 30 as they fall); a flash where a blow hit them and a green plus rising off them when
  // healed, each popping in on the tick it happened and fading on the next.
  // Freshness is by the attack clock's ticks. Nothing for anyone not in it.
  // One box at the feet holds it all, gliding with `move` as the sprite does.
  vitals(key, x, y, move = MOVE) {
    const m = this.party.members[key];
    if (!m) return [];
    const t = this.clock;
    const out = [];
    // all of it in one box at the feet, gliding with the sprite (`move`) to a new spot
    const bar = (inner) => div().absolute().left(-HP_W / 2 - 1).top(-78).w(HP_W + 2).h(7).p(1).bg("#141a26").child(inner);
    if (m.down !== null) {
      const fresh = t <= m.down - KO_TICKS;
      out.push(
        bar(
          div()
            .id(`idle-rpg-rest-${key}-${m.down}`)
            .h(5)
            .w(fresh ? HP_W : 0)
            .bg(GOLD)
            .transition("width", { duration: Math.max(TICK_STEP, Math.round(restLeft(this.party, key, t) * KO_TICKS * TICK_STEP)), easing: "linear" }),
        ),
        // stars circling: two pictures a sixth of a turn apart, crossfaded, bobbing
        div()
          .absolute()
          .left(-38)
          .top(-66)
          .w(75)
          .h(33)
          .loop("top", { from: -66, to: -62, period: 900 })
          .child(div().absolute().left(0).top(0).loop("opacity", { from: 1, to: 0, period: 700, easing: "linear" }).child(image(src("status/dizzy-1.png")).w(75).h(33)))
          .child(div().absolute().left(0).top(0).loop("opacity", { from: 0, to: 1, period: 700, easing: "linear" }).child(image(src("status/dizzy-2.png")).w(75).h(33))),
        // the seconds left of the rest, by the bar where an aura's icon would be
        div()
          .id(`idle-rpg-rest-count-${key}`)
          .absolute()
          .left(HP_W / 2 + 3)
          .top(-82)
          .child(pixelText(String(restSeconds(this.party, key, Math.max(this.koBeat, m.down - KO_TICKS))), "gold", 2)),
      );
    } else {
      const share = m.hp / m.maxHp;
      const tone = share > 0.5 ? "#4cd47b" : share > 0.25 ? "#ffd166" : "#ff5d5d";
      out.push(bar(div().id(`idle-rpg-hp-${key}`).h(5).w(Math.round(HP_W * share)).bg(tone).transition("width", { duration: 150, easing: "ease-out" })));
      // a healer giving the party an aura (its vial's) shows its icon by its bar
      // while the boss stands, in the box that glides with it
      const potion = statsOf(this.sprites[key], equipped(this.progress, this.sprites[key], "weapon")).potion;
      if (AURAS.includes(potion) && this.monster?.hp > 0)
        out.push(div().id(`idle-rpg-aura-${key}`).absolute().left(HP_W / 2 + 3).top(-84).child(image(src(effectIconArt(potion))).w(18).h(18)));
    }
    if (m.hitAt !== null && t - m.hitAt <= 2) {
      const fresh = t === m.hitAt;
      out.push(
        div()
          .id(`idle-rpg-hurt-${key}-${m.hitAt}`)
          .absolute()
          .left(-22)
          .top(-60)
          .opacity(fresh ? 1 : 0)
          .transition("opacity", { duration: fresh ? 20 : HIT_FADE, easing: "ease-out" })
          .child(image(src("foe/hit.png")).w(44).h(44)),
      );
    }
    if (m.healedAt !== null && t - m.healedAt <= 2) {
      const fresh = t === m.healedAt;
      out.push(
        div()
          .id(`idle-rpg-healed-${key}-${m.healedAt}`)
          .absolute()
          .left(-18)
          .top(fresh ? -64 : -92)
          .opacity(fresh ? 1 : 0)
          .transition("top", { duration: 900, easing: "ease-out" })
          .transition("opacity", { duration: 900, easing: "ease-in" })
          .child(image(src("status/heal.png")).w(36).h(36))
          .child(div().absolute().left(30).top(-6).child(image(src("status/sparkle.png")).w(20).h(20))),
      );
    }
    return [div().id(`idle-rpg-vitals-${key}`).absolute().left(x).top(y).transition("left", move).transition("top", move).children(out)];
  }

  // Whether a note made on attack-clock tick `tick` still shows as it popped
  // in: while the clock is on that tick. The first render after the clock
  // moves on starts its rise and fade, however late either comes, so a note
  // is never first drawn already faded.
  fresh(tick) {
    return tick === this.clock;
  }

  // A level-up note over someone whose feet are at x, y: it pops in, then on
  // the next render after a tick of the attack clock rises and fades natively.
  cheerNote(key, x, y) {
    const c = this.cheers[key];
    const fresh = this.fresh(c.tick);
    return v_flex()
      .id(`idle-rpg-cheer-${key}-${c.id}`)
      .absolute()
      .left(x - 50)
      .top(Math.max(fresh ? y - 98 : y - 116, 4 - this.wallH)) // kept inside the scene when the wall is low
      .w(100)
      .gap(2)
      .items_center()
      .opacity(fresh ? 1 : 0)
      .transition("left", MOVE)
      .transition("top", { duration: CHEER_MS, easing: "ease-out" })
      .transition("opacity", { duration: CHEER_MS, easing: "ease-in" })
      .children(c.lines.map((line) => div().px(5).rounded(6).bg("#000000a0").text_size(10).font_semibold().text_color(GOLD).child(`${line}!`)));
  }

  // A critical blow's damage, a small gold number where it landed: it pops in
  // like a level-up note, then on the next render (the attacker's rest) rises
  // and fades natively.
  critNote(key, W, kind) {
    const c = this.crits[key];
    const at = this.hitOf(key, c.seed, W, kind);
    const fresh = this.fresh(c.tick);
    return h_flex()
      .id(`idle-rpg-crit-${key}-${c.id}`)
      .absolute()
      .left(at.x - 20)
      .top(fresh ? at.y - 30 : at.y - 48)
      .w(40)
      .justify_center()
      .opacity(fresh ? 1 : 0)
      .transition("top", { duration: CRIT_MS, easing: "ease-out" })
      .transition("opacity", { duration: CRIT_MS, easing: "ease-in" })
      .child(div().px(4).rounded(5).bg("#000000a0").text_size(10).font_semibold().text_color(GOLD).child(`${shortNumber(Math.max(1, c.n))}!`));
  }

  // One damage number in the pixel font, over the point where its blow landed:
  // white, or for a critical blow gold, a size up and with a "!"; a chained
  // second strike's at the end of its arc; damage over time (summed over a
  // second) beside the boss's middle, in ember for burn and green for venom.
  // A blow that hit the boss's weakness has an orange arrow up after it, one
  // it resists a grey arrow down (effects/marks). It pops in,
  // then on the next render (the next tick of the attack clock, which runs on
  // through the attacker's rest) rises and fades natively, like a level-up
  // note. Each is nudged a little left, right or not at all by its number, so
  // blows that land together do not cover each other exactly.
  damageNote(d, W, kind) {
    const core = { x: Math.round(W / 2 + kind.core.x), y: MONSTER_Y - kind.core.y };
    const hit = d.dot ? { x: core.x + DOT_SPOT[d.dot] * (kind.core.r + 20), y: core.y + 12 } : this.hitOf(d.key, d.seed, W, kind);
    const at = d.chain ? { x: hit.x + (d.dir < 0 ? -CHAIN_W : CHAIN_W), y: hit.y - 16 } : hit; // the end of its arc (see attack)
    const n = shortNumber(Math.max(1, d.n)); // a blow that took the last fraction of a point still shows 1
    const text = d.crit ? `${n}!` : n;
    const scale = d.crit ? 4 : 3;
    const mark = markArt(d.matchup);
    const textWidth = textW(text, scale);
    const w = textWidth + (mark ? 6 * scale : 0); // the mark shares the last glyph's outline column
    const h = GLYPH_H * scale;
    const fresh = this.fresh(d.tick);
    const top = at.y - h / 2 - 8 - (fresh ? 0 : DAMAGE_RISE);
    return div()
      .id(`idle-rpg-damage-${d.id}`)
      .absolute()
      .left(Math.round(at.x - w / 2 + ((d.id % 3) - 1) * 12))
      .top(Math.round(Math.max(top, 4 - this.wallH))) // kept inside the scene when the wall is low
      .opacity(fresh ? 1 : 0)
      .transition("top", { duration: DAMAGE_MS, easing: "ease-out" })
      .transition("opacity", { duration: DAMAGE_MS, easing: "ease-in" })
      .child(
        div()
          .relative()
          .w(w)
          .h(h)
          .child(pixelText(text, d.dot ? DOT_COLOURS[d.dot] : d.crit ? "gold" : "white", scale))
          .when(Boolean(mark), (el) => el.child(div().absolute().left(textWidth - scale).top(0).child(image(src(mark)).w(7 * scale).h(GLYPH_H * scale)))),
      );
  }

  // Where the campfire stands between raids: the middle of its picture, or
  // null while it is not drawn (in a raid, or when the scene is narrower than
  // the fight needs, 640px). It is the middle of the scene to the nearest 16px
  // (the steps its light in the gloom is drawn for, see gloom), but never
  // nearer the stations than 528, which keeps its picture 8px clear of the
  // shop's stall (its right edge, outlined under the pointer, is at 412) and,
  // at 640px, 4px inside the scene's right edge.
  fireX(W) {
    if (this.battle || W < 640) return null;
    return 272 + 16 * Math.max(16, Math.round((W / 2 - 272) / 16));
  }

  // The campfire, standing at x: the stones, the logs and the low heart of the
  // flames, taller flames fading in and out over them on their own rhythms
  // (four pictures, so it flickers), sparks hanging over it, and behind it
  // a warm glow that flickers like a torch's and brightens at night. Every
  // motion is a native loop, so it never re-renders the view. It is scenery:
  // a press on it walks you there like one on the bare floor.
  campfire(x) {
    const art = (name) => image(src(name)).w(FIRE_W).h(FIRE_H);
    const flame = (n, from, to, period) => div().absolute().left(0).top(0).loop("opacity", { from, to, period }).child(art(`campfire/flame-${n}.png`));
    // a spark: one art pixel, drifting up and down over the flames as it fades in and out
    const spark = (left, from, to, period, blink) =>
      div()
        .absolute()
        .left(left)
        .top(from)
        .loop("top", { from, to, period })
        .loop("opacity", { from: 0, to: 1, period: blink })
        .w(4)
        .h(4)
        .bg("#ffe27a");
    return [
      div()
        .id("idle-rpg-fire-glow")
        .absolute()
        .left(x - FIRE_W / 2)
        .top(FIRE_Y - 160)
        .w(FIRE_W)
        .h(144)
        .opacity(0.25 + 0.75 * this.night)
        .transition("opacity", { duration: TICK_MS, easing: "linear" })
        .child(div().size_full().rounded(72).bg("#ffb34750").loop("opacity", { from: 0.55, to: 1, period: 560 })),
      div()
        .absolute()
        .left(x - FIRE_W / 2)
        .top(FIRE_Y - FIRE_H)
        .w(FIRE_W)
        .h(FIRE_H)
        .child(art("campfire/base.png"))
        .child(flame(1, 0, 1, 520))
        .child(flame(2, 1, 0, 740))
        .child(flame(3, 0.4, 1, 380))
        .child(flame(4, 1, 0.2, 610))
        .child(spark(120, 8, -40, 1300, 900))
        .child(spark(76, 24, -16, 1700, 1100))
        .child(spark(144, 36, 0, 1500, 700))
        .child(spark(96, 0, -56, 2100, 1300)),
    ];
  }

  // Night on the rampart: darkness over the wall, the floor and everyone on it
  // (but under the cards), fading in with the night. Each torch keeps a pool of
  // light clear around its flame and the candle a small one on the table; past
  // those the dark is even, at half strength, so nothing is ever black, and
  // above the wall it thins out over 80px. The pictures hold all of that, so
  // this is a row of them: the candle's, one per torch, and a plain one
  // laid over what is left (never stretched). While the campfire is out (`fire`, its x, see
  // fireX) its own 320px picture, which also carries the torches' light that
  // reaches it, is cut into the row over it: the pictures it overlaps are
  // clipped short on either side, so every pixel is darkened exactly once.
  // (Its pool is dark again by the picture's edges, and those stay short of
  // the light of any torch past the last one there is, at every width.)
  gloom(W, fire = null) {
    const RISE = 80;
    const H = RISE + WALL_H + FLOOR_H;
    const cut = fire === null ? null : [fire - FIRE_LIGHT_W / 2, fire + FIRE_LIGHT_W / 2];
    // the picture light/<art>.png laid at `left`, `w` wide, showing only from `from` to `to`
    const piece = (left, w, art, from = left, to = left + w) =>
      from === left && to === left + w
        ? div()
            .absolute()
            .left(left)
            .top(0)
            .child(image(src(`light/${art}.png`)).w(w).h(H))
        : div()
            .absolute()
            .left(from)
            .top(0)
            .w(to - from)
            .h(H)
            .overflow_hidden()
            .child(
              div()
                .absolute()
                .left(left - from)
                .top(0)
                .child(image(src(`light/${art}.png`)).w(w).h(H)),
            );
    const pieces = [];
    const lay = (left, w, art) => {
      if (!cut || left + w <= cut[0] || left >= cut[1]) return pieces.push(piece(left, w, art));
      if (left < cut[0]) pieces.push(piece(left, w, art, left, cut[0]));
      if (left + w > cut[1]) pieces.push(piece(left, w, art, cut[1], left + w));
    };
    lay(0, 272, "candle");
    let x = 272; // each torch's picture is 384px wide with the flame in the middle; see the torches in scenery
    for (; x + 276 <= W; x += 384) lay(x, 384, "torch");
    // a plain picture as wide as a torch's, running on past the right edge like the
    // last torch's can (the scene clips it): the app keeps a picture's proportions,
    // so one stretched to fit would draw at its own narrow width and leave a gap
    if (x < W) lay(x, 384, "fill");
    // the fire stands 16px steps along the torches' pictures; the generator draws one for each step
    if (cut) pieces.push(piece(cut[0], FIRE_LIGHT_W, `fire-${((fire - 272) / 16) % 24}`));
    return div()
      .id("idle-rpg-gloom")
      .absolute()
      .left(0)
      .top(-WALL_H - RISE)
      .w(W)
      .h(H)
      .opacity(this.night)
      .transition("opacity", { duration: TICK_MS, easing: "linear" })
      .children(pieces);
  }

  // An agent being carried: it dangles from the pointer and swings against the motion.
  ragdoll(a) {
    const c = this.sprites[a.address];
    const d = this.drag;
    const tilt = d.vx > 1.2 ? "l" : d.vx < -1.2 ? "r" : "c";
    return div()
      .absolute()
      .left(d.x - 44)
      .top(d.y - 78)
      .child(this.sprite(c, `rag/${tilt}`, 88, 88));
  }

  you_() {
    const { x, y } = this.you;
    const ms = this.walkMs ?? 300;
    const c = this.sprites[YOU];
    return v_flex()
      .id("idle-rpg-you")
      .absolute()
      .left(x - 36)
      .top(y - 66)
      .w(72)
      .items_center()
      .transition("left", { duration: ms, easing: "linear" })
      .transition("top", { duration: ms, easing: "linear" })
      .cursor_pointer()
      .on_mouse_down("left", (e) => {
        this.press = { kind: YOU, px: e.position.x, py: e.position.y };
      })
      .child(
        // Walking: lean left and right in turn, one foot lifted. Sprites are
        // 16x16 pixel art on an 18x18 canvas (room for the outline), drawn at
        // 72 so every pixel is a crisp 4x4. They are PNGs at twice that size:
        // SVGs came out soft on retina screens.
        // In a fight, standing still, you face the monster in the same stance
        // and attack frames as the agents (see critter).
        this.fighting && this.knocked(YOU)
          ? this.sprite(c, `down/${this.youDir > 0 ? "l" : "r"}`, 72, 72)
          : this.fighting && !this.walking
          ? div()
              .relative()
              .w(72)
              .h(72)
              .child(
                div()
                  .absolute()
                  .left(this.youDir > 0 ? 0 : -24)
                  .top(0)
                  .child(this.sprite(c, `${!this.youFights ? "stance" : [0, "windup", "strike", "strike", 0][this.phaseOf(YOU)] || "stance"}/${this.youDir > 0 ? "r" : "l"}`, 96, 72)),
              )
          : this.sprite(c, this.walking ? (this.step ? "walk/r" : "walk/l") : "stand", 72, 72),
      )
      // your tag, outlined in white while your card is open
      .child(tag(tagFit(LABELS.you), this.card === YOU ? TAG.hot : TAG.plain).id("idle-rpg-you-tag").relative());
  }

  // One line of a card: a level, and a bar and numbers for the way to the next.
  // `lv` is { level, into, need } (see levelOf). `spare`, a class's skill
  // points to spend, shows as a star and the number when there are any.
  meter(label, lv, spare = 0) {
    return h_flex()
      .gap(6)
      .items_center()
      .text_size(10)
      .child(div().w(46).flex_none().truncate().text_color("#8ea3bb").child(label))
      .child(div().w(30).flex_none().font_semibold().text_color(GOLD).child(`Lv ${lv.level}`))
      .child(
        div()
          .flex_1()
          .h(5)
          .rounded(2)
          .bg("#0b1626")
          .child(div().h(5).rounded(2).w(`${Math.floor((lv.into / lv.need) * 100)}%`).bg(GOLD)),
      )
      .child(div().flex_none().text_color("#8ea3bb").child(`${shortNumber(lv.into)}/${shortNumber(lv.need)}`))
      .when(spare > 0, (el) =>
        el.child(
          h_flex()
            .flex_none()
            .gap(2)
            .items_center()
            .font_semibold()
            .text_color(GOLD)
            .child(image(src("icons/star.png")).w(18).h(18))
            .child(div().child(String(spare))),
        ),
      );
  }

  // The four classes as buttons, each with its level; the current one is ringed.
  picker(key) {
    return h_flex()
      .gap(4)
      .children(
        CLASSES.map((c) =>
          v_flex()
            .id(`idle-rpg-pick-${c}`)
            .items_center()
            .p(3)
            .rounded(7)
            .border(1)
            .border_color(this.sprites[key] === c ? "#5cc8ff" : "#00000000")
            .bg(this.sprites[key] === c ? "#5cc8ff22" : "#ffffff0a")
            .cursor_pointer()
            .hover((st) => st.bg("#ffffff1c"))
            .on_click((_e, cx) => {
              this.sprites[key] = c;
              this.picking = false;
              this.save();
              cx.notify();
            })
            .child(this.sprite(c, "stand", 36, 36))
            .child(div().text_size(9).font_semibold().text_color(GOLD).child(`Lv ${classLevel(this.progress.xp[c]).level}`)),
        ),
      );
  }

  // A framed close-up of someone's face, with a wrench in the corner that
  // opens the class choices.
  portrait(key) {
    return div()
      .relative()
      .w(56)
      .h(56)
      .flex_none()
      .rounded(8)
      .overflow_hidden()
      .bg("#22395a")
      .border(1)
      .border_color("#31506f")
      // the sprite at 6px a pixel, shifted so the head fills the frame (a
      // pixel lower in a hat, whose top can reach the picture's first row)
      .child(
        div()
          .absolute()
          .left(-26)
          .top(hatArt(this.sprites[key], equipped(this.progress, this.sprites[key], "hat")) ? -4 : -10)
          .child(this.sprite(this.sprites[key], "stand", 108, 108)),
      )
      .child(
        div()
          .id("idle-rpg-card-wrench")
          .absolute()
          .left(36)
          .top(2)
          .w(18)
          .h(18)
          .rounded(5)
          .bg(this.picking ? "#5cc8ff" : "#14243ae0")
          .cursor_pointer()
          .hover((st) => st.bg("#3a6fa0"))
          .on_click((_e, cx) => {
            this.picking = !this.picking;
            cx.notify();
          })
          .child(div().absolute().left(1).top(1).child(image(src("icons/wrench.png")).w(16).h(16))),
      );
  }

  // The card over whoever was clicked: `a` is an agent, or null for you.
  infoCard(a, W) {
    const key = a ? a.address : YOU;
    const s = a ? this.at[a.address] : this.you;
    const row = (k, v) =>
      h_flex()
        .gap(6)
        .text_size(11)
        .child(div().w(38).flex_none().text_color("#8ea3bb").child(k))
        .child(div().flex_1().truncate().text_color("#dbe7f3").child(v));
    const [word, color] = a ? (STATUS[a.status] ?? [a.status, "#9fb4cc"]) : ["", "#5cc8ff"];
    // Above their head when there is room, else beside them.
    const cardH = (a ? 146 : 123) + (this.picking ? 70 : 0);
    const above = s.y - 72 - cardH;
    const minTop = 4 - this.wallH;
    const fits = above >= minTop;
    const side = s.x + 44 + CARD_W + 8 <= W ? s.x + 44 : s.x - 44 - CARD_W;
    const left = clamp(fits ? s.x - CARD_W / 2 : side, 8, Math.max(8, W - CARD_W - 8));
    const top = fits ? above : Math.max(minTop, Math.min(s.y - cardH + 24, FLOOR_H - cardH - 6));
    const klass = this.sprites[key];
    const title = h_flex()
      .gap(6)
      .items_center()
      .child(div().w(8).h(8).rounded(4).flex_none().bg(color))
      .child(div().flex_1().truncate().text_size(12).font_semibold().text_color("#ffffff").child(a ? `${a.space_name} · ${a.tab_name}` : "You"))
      .child(
        div()
          .id("idle-rpg-card-x")
          .px(5)
          .rounded(5)
          .text_size(12)
          .text_color("#8ea3bb")
          .cursor_pointer()
          .hover((st) => st.bg("#ffffff14"))
          .on_click((_e, cx) => {
            this.card = null;
            this.picking = false;
            cx.notify();
          })
          .child("×"),
      );
    let facts = v_flex().flex_1().min_w(0).gap(3).child(title);
    if (a) {
      const tab = spaces().find((sp) => sp.id === a.space)?.tabs.find((tb) => tb.id === a.tab);
      const since =
        a.status === "working" && tab?.working_since
          ? `for ${ago(tab.working_since)}`
          : tab?.changed_at
            ? `${ago(tab.changed_at)} ago`
            : "";
      facts = facts
        .child(row("Agent", a.program?.name ?? a.app ?? "Agent"))
        .child(row("Status", since ? `${word} ${since}` : word))
        .child(row("Doing", a.title || "—"));
    } else {
      facts = facts.child(row("Class", capital(klass)));
    }
    return v_flex()
      .id("idle-rpg-card")
      .absolute()
      .left(left)
      .top(top)
      .w(CARD_W)
      .p(10)
      .gap(6)
      .rounded(10)
      .bg("#14243a")
      .border(1)
      .border_color("#31506f")
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(h_flex().gap(8).items_start().child(this.portrait(key)).child(facts))
      // your own level, then the level of the class this character has on,
      // which opens the skills panel on that class
      .child(
        v_flex()
          .gap(3)
          .when(!a, (el) => el.child(this.meter("You", playerLevel(this.progress.xp[YOU]))))
          .child(
            this.meter(capital(klass), classLevel(this.progress.xp[klass]), pointsLeft(this.progress, klass))
              .id("idle-rpg-card-skills")
              .rounded(4)
              .cursor_pointer()
              .hover((st) => st.bg("#ffffff14"))
              .on_click((_e, cx) => {
                this.openSkills(klass);
                cx.notify();
              }),
          ),
      )
      .when(this.picking, (el) => el.child(this.picker(key)))
      .when(Boolean(a), (el) =>
        el.child(
          div()
            .id("idle-rpg-card-go")
            .py(4)
            .rounded(6)
            .bg("#5cc8ff")
            .text_center()
            .text_size(11)
            .font_semibold()
            .text_color("#06243a")
            .cursor_pointer()
            .hover((st) => st.bg("#8ad8ff"))
            .on_click((_e, cx) => {
              run("agent.focus", { terminal: a.address });
              this.card = null;
              this.picking = false;
              cx.notify();
            })
            .child("Go to terminal"),
        ),
      );
  }

  render() {
    const W = Math.max(320, this.size.width);
    const list = agents();
    this.place(list, W);
    if (this.card && this.card !== YOU && !list.some((a) => a.address === this.card)) this.card = null;
    const you = { x: Math.round(clamp(this.you.x, 30, W - 30)), y: Math.round(clamp(this.you.y, YOU_Y[0], YOU_Y[1])) };
    const fire = this.fireX(W);
    if (fire !== null && this.inFire(you, fire)) you.y = Math.min(YOU_Y[1], FIRE_Y + 12); // left in the fire by an older save or a resize: out in front of it
    this.you = you;

    // Whoever stands lower on the floor is drawn in front.
    const hits = list.filter((a) => a.status === "working").length;
    // In a fight everyone stands in formation; otherwise at their own spots.
    const foeKind = this.battle && W >= 640 ? MONSTERS[this.monster?.kind] : null;
    this.fighting = Boolean(foeKind);
    // (by the campfire a copy, since those behind it are drawn beside it: see the loop below)
    this.at = foeKind ? this.formation(list, W, foeKind) : fire !== null ? { ...this.spots } : this.spots;
    const youDir = you.x <= W / 2 + (foeKind?.core.x ?? 0) ? 1 : -1; // which way the monster is from you
    this.youFights = hits > 0 && !this.walking && this.joins(W) && !this.knocked(YOU);
    // the monster hops when a blow lands on it (a healing throw is no blow)
    const blowing = (key) => this.phaseOf(key) === 4 && !this.rhythm[key]?.heal;
    this.struck = (this.youFights && blowing(YOU)) || list.some((a) => a.status === "working" && blowing(a.address));
    this.youDir = youDir;
    const actors = [{ y: you.y, draw: () => [this.you_()] }, { y: MONSTER_Y, draw: () => this.foe(W, hits) }];
    // the boss's own attack: what lies on the floor under everyone, and what flies or lands over them
    const foeAttack = this.foeAttack(W, foeKind);
    if (foeAttack.over.length) actors.push({ y: FLOOR_H, draw: () => foeAttack.over });
    // your HP bar, or stars and rest, while you are in the fight
    // (not while you walk: `you` is already where you are going, and walking takes you out of the fight)
    if (foeKind && YOU in this.party.members && !this.walking) actors.push({ y: FLOOR_H, draw: () => this.vitals(YOU, you.x, you.y, { duration: this.walkMs ?? 300, easing: "linear" }) });
    // the campfire stands among them, so whoever is in front of it is drawn over it (first, so a tie goes to them)
    if (fire !== null) actors.unshift({ y: FIRE_Y, draw: () => this.campfire(fire) });
    if (this.youFights) actors.push({ y: FLOOR_H, draw: () => this.attack({ key: YOU, cls: this.sprites[YOU], x: you.x, y: you.y, dir: youDir }, W, foeKind) });
    for (const a of list) {
      if (this.drag?.address === a.address) continue;
      const s = this.spots[a.address];
      s.x = Math.round(clamp(s.x, 36, W - 36));
      s.y = Math.round(s.y);
      if (fire !== null && !foeKind) this.at[a.address] = this.clearOfFire(s, fire);
      actors.push({ y: this.at[a.address].y, draw: () => this.critter(a, W) });
      if (this.fighting && a.status === "working" && this.monster.hp > 0) actors.push({ y: FLOOR_H, draw: () => this.attack({ key: a.address, cls: this.sprites[a.address], ...this.at[a.address] }, W, foeKind) });
    }
    // level-up notes and critical blows' numbers, drawn after the HUD with the
    // damage numbers (they rise high enough in a short scene to meet it)
    const pops = [];
    for (const [key, c] of Object.entries(this.cheers)) {
      if (Date.now() - c.at > CHEER_MS + 1000) delete this.cheers[key];
    }
    for (const key of Object.keys(this.cheers)) {
      const s = key === YOU ? !this.walking && you : list.some((a) => a.address === key && this.drag?.address !== key) && this.at[key];
      if (s) pops.push(() => this.cheerNote(key, s.x, s.y));
    }
    for (const [key, c] of Object.entries(this.crits)) {
      if (Date.now() - c.at > CRIT_MS + 1000) delete this.crits[key];
      else if (foeKind) pops.push(() => this.critNote(key, W, foeKind));
    }
    // Damage numbers go once they have faded, when the fight is not shown
    // (battle mode off, or too narrow), when their monster has gone, and all
    // at once when the setting is turned off.
    this.damage =
      foeKind && this.settings.damageNumbers ? this.damage.filter((d) => d.monster === this.monster.id && Date.now() - d.at <= TICK_STEP + DAMAGE_MS + 250) : [];
    actors.sort((p, q) => p.y - q.y);

    // where the sign, the stage section (and its note) and the strip go: worked
    // out before anything is drawn, since the boss's plate keeps clear of them
    const hud = (this.hudBox = this.hudLayout(W, list, Boolean(foeKind)));
    const scenery = this.scenery(W); // also works out how dark it is
    const boards = Array.from({ length: Math.ceil(W / 128) }, (_, i) =>
      div().absolute().left(i * 128).top(0).child(image(src("scene/floor.png")).w(128).h(FLOOR_H)),
    );
    const carried = this.drag && list.find((a) => a.address === this.drag.address);
    const carded = this.card && !carried && list.find((a) => a.address === this.card);

    const floor = div()
      .absolute()
      .left(0)
      .bottom(0)
      .w(W)
      .h(FLOOR_H)
      .bg(FLOOR)
      .child(
        div()
          .relative()
          .w(W)
          .h(FLOOR_H)
          .children(boards)
          // the table and the barrel stand at the back, clear of the monster's corner
          .child(div().absolute().left(12).top(-34).child(image(src("stations/table/idle.png")).w(112).h(56)))
          .child(div().absolute().left(136).top(-30).child(image(src("scene/barrel.png")).w(48).h(52)))
          .when(!this.battle, (el) => el.children(this.stations()))
          .children(foeAttack.under)
          .children(actors.flatMap((p) => p.draw()))
          .child(this.gloom(W, fire))
          // the HUD: drawn over the night's dark, so it reads at any hour, and under the cards
          .child(this.hud(hud.counts, hud.strip))
          .child(this.sign(list, hud))
          .when(Boolean(hud.stage), (el) => el.child(this.stageSection(hud.stage)))
          .when(Boolean(hud.note), (el) => el.child(this.stageNote(hud.note)))
          // over the night's dark and the HUD (in a short scene a number rising off a
          // big boss reaches the stage section), and under the cards; none has a handler
          .when(Boolean(foeKind), (el) => el.children(this.damage.map((d) => this.damageNote(d, W, foeKind))))
          .children(pops.map((draw) => draw()))
          .when(list.length === 0, (el) =>
            el.child(
              v_flex()
                .absolute()
                .left(250)
                .top(50)
                .gap(4)
                .text_color("#5a3d22")
                .child(div().text_size(13).font_semibold().child("The rampart is quiet"))
                .child(div().text_size(11).child("Start an agent from the + in the tab bar")),
            ),
          )
          .when(Boolean(carded), (el) => el.child(this.infoCard(carded, W)))
          .when(this.card === YOU && !carried, (el) => el.child(this.infoCard(null, W)))
          .when(Boolean(carried), (el) => el.child(this.ragdoll(carried))),
      );

    const drop = (cx) => {
      if (this.drag) {
        this.spots[this.drag.address] = {
          x: Math.round(clamp(this.drag.x, 36, W - 36)),
          y: Math.round(clamp(this.drag.y, CRITTER_Y[0], CRITTER_Y[1])),
        };
        this.save();
      }
      this.press = this.drag = null;
      cx.notify();
    };

    return div()
      .id("idle-rpg")
      .relative()
      .size_full()
      .overflow_hidden()
      .bg(NIGHT)
      .on_size_change((size, cx) => {
        this.size = size;
        this.wallH = Math.max(0, size.height - FLOOR_H);
        cx.notify();
      })
      .on_mouse_down("left", (e, cx) => {
        cx.stop_propagation();
        this.point(e);
        if (!this.press) this.press = { kind: "floor", px: e.position.x, py: e.position.y };
      })
      .on_mouse_move((e, cx) => {
        const pr = this.press;
        if (!pr || pr.kind !== "critter" || this.fighting) return;
        const moved = Math.abs(e.position.x - pr.px) + Math.abs(e.position.y - pr.py);
        if (!this.drag && moved <= 4) return;
        const p = this.point(e);
        const x = Math.round(clamp(p.x, 20, W - 20));
        const y = Math.round(clamp(p.y, 70 - this.wallH, FLOOR_H - 8));
        const last = this.drag?.x ?? x;
        this.drag = { address: pr.address, x, y, vx: (this.drag?.vx ?? 0) * 0.6 + (x - last) * 0.4 };
        this.card = null;
        cx.notify();
      })
      .on_mouse_up("left", (e, cx) => {
        const pr = this.press;
        if (!pr) return;
        if (this.drag) return drop(cx);
        const still = Math.abs(e.position.x - pr.px) + Math.abs(e.position.y - pr.py) <= 4;
        if (pr.kind === YOU) {
          if (still) {
            this.codex = this.settingsOpen = false;
            this.skillsOpen = this.shopOpen = null;
            this.card = this.card === YOU ? null : YOU;
            this.picking = false;
          }
        } else if (pr.kind === "critter") {
          this.codex = this.settingsOpen = false;
          this.skillsOpen = this.shopOpen = null;
          this.card = this.card === pr.address ? null : pr.address;
          this.picking = false;
        } else if (pr.kind === "frame" || still) {
          this.card = null;
          this.codex = this.settingsOpen = false;
          this.skillsOpen = this.shopOpen = null;
          if (pr.kind !== "frame") this.walkTo(this.point(e), W, cx);
        }
        this.press = null;
        cx.notify();
      })
      .on_hover((hovered, cx) => {
        if (!hovered && this.press) drop(cx);
      })
      .children(scenery)
      .child(floor)
      // last, so they lie over the floor and everyone on it
      .when(this.codex, (el) => el.child(this.codexCard(hud.inset, hud.panelTop)))
      .when(CLASSES.includes(this.skillsOpen), (el) => el.child(this.skillsCard(hud.inset, hud.panelTop)))
      .when(CLASSES.includes(this.shopOpen), (el) => el.child(this.shopCard(hud.inset, hud.panelTop)))
      .when(this.settingsOpen, (el) => el.child(this.settingsCard(hud.strip.y)));
  }

  // A press on a HUD frame's empty part (its chips and buttons stop their own):
  // not one on the floor, so you do not walk there, but like one it closes an
  // open panel or card when it comes up (see the root's on_mouse_up).
  framePress(cx) {
    cx.stop_propagation();
    if (!this.press) this.press = { kind: "frame" };
  }

  // What the sign holds (see sign): "nobody in yet" while there are no agents;
  // in a raid, once anything has been slain or earned, the kill count (it
  // opens the codex) and the gold (the shop); once there is a point or gold to
  // spend or anything trained, the star with the skill points left to spend
  // across all classes (the skills and training); and the raid button. With
  // how wide each is, for hudLayout.
  signSpec(list) {
    const { slain, gold } = this.progress;
    const spare = pointsLeftAll(this.progress);
    const earned = gold > 0 || CLASSES.some((c) => pointsEarned(this.progress.xp[c]) > 0 || TRAINING.some(({ key }) => trainingOf(this.progress, c, key) > 0));
    const counts = [];
    if (this.battle && (slain > 0 || gold > 0)) counts.push({ id: "slain", art: "icons/skull.png", n: slain }, { id: "gold", art: "icons/coin.png", n: gold });
    if (earned) counts.push({ id: "points", art: "icons/star.png", n: spare });
    const empty = list.length === 0;
    const label = this.battle ? LABELS.stop : LABELS.start;
    const parts = [...(empty ? [letterW(LABELS.empty)] : []), ...counts.map((c) => countW(c.n))];
    const countsW = parts.reduce((x, w) => x + w, 0) + 4 * Math.max(0, parts.length - 1);
    return { counts, empty, spare, label, countsW, buttonW: letterW(label) + 12, titleW: letterW(LABELS.title) };
  }

  // Where each thing on the sign goes, and the sign's size: { w, h, rows,
  // places: [{ what: "title" | "empty" | <count's id> | "button", x, y }] }
  // in px from the sign's top left (a chip's or the button's top; a line of
  // lettering's is 4px lower). In one row (`wrap` null): the title, "nobody in
  // yet" and the counts from the left, the button at the right. Otherwise
  // wrapped into as many rows as it takes, each CHIP_H high, so no row is
  // wider than `wrap` px (inside the frame and its padding), the button last.
  signPlan(spec, titled, wrap = null) {
    const items = [
      ...(titled ? [{ what: "title", w: spec.titleW, gap: 10 }] : []),
      ...(spec.empty ? [{ what: "empty", w: letterW(LABELS.empty), gap: 4 }] : []),
      ...spec.counts.map((c) => ({ what: c.id, w: countW(c.n), gap: 4 })),
    ];
    const left = FRAME + SIGN_PAD;
    if (wrap === null) {
      const rowY = Math.round((HUD_H - CHIP_H) / 2);
      const places = [];
      let x = left;
      for (const it of items) {
        places.push({ what: it.what, x, y: rowY });
        x += it.w + it.gap;
      }
      const w = 2 * left + (titled ? spec.titleW + 10 : 0) + (spec.countsW ? spec.countsW + 8 : 0) + spec.buttonW;
      places.push({ what: "button", x: w - left - spec.buttonW, y: rowY });
      return { w, h: HUD_H, rows: 1, places };
    }
    const rows = [[]];
    let used = 0;
    for (const it of [...items, { what: "button", w: spec.buttonW }]) {
      if (rows.at(-1).length && used + 6 + it.w > wrap) {
        rows.push([]);
        used = 0;
      }
      used += (rows.at(-1).length ? 6 : 0) + it.w;
      rows.at(-1).push(it);
    }
    const places = [];
    let widest = 0;
    rows.forEach((row, r) => {
      let x = left;
      for (const it of row) {
        places.push({ what: it.what, x, y: FRAME + 2 + r * (CHIP_H + 2) });
        x += it.w + 6;
      }
      widest = Math.max(widest, x - 6 - left);
    });
    return { w: 2 * left + widest, h: 2 * FRAME + (rows.length + 1) * 2 + rows.length * CHIP_H, rows: rows.length, places };
  }

  // The stage section's width in a scene `W` wide: a share of the scene
  // (STAGE_SHARE), never less than its fullest line needs (an arrow at each
  // end, "STAGE N" with room for three digits or the best stage's, the farm
  // mark, "(PAUSED)" and the longest time, "10:00") and never more than
  // STAGE_MAX_W. It does not depend on what is showing, so the section keeps
  // its size as farming and the pause come and go and as the seconds turn.
  stageWidth(W) {
    const digits = "8".repeat(Math.max(3, String(this.progress.best).length));
    const need =
      2 * FRAME + 2 * 4 + 2 * (18 + STAGE_GAP) + letterW(LABELS.stage(digits)) + 6 + letterW(LABELS.farm) + 10 + letterW(LABELS.paused) + 6 + letterW("00:00");
    return Math.max(need, Math.min(Math.round(W * STAGE_SHARE), STAGE_MAX_W));
  }

  // Where the HUD's frames go, in scene px from the top left: { sign, strip,
  // stage, note } boxes { x, y, w, h } (stage and note null while the fight
  // does not show), whether the sign has its title and where its things go
  // (signPlan), the
  // panels' top, and what the sign and the strip hold. They never overlap: the
  // sign keeps the layout's inset and the strip HUD_EDGE from the right; the
  // stage section is centred, moved aside as far as it must be. Tried in turn
  // until one fits: all in a row with the title; without it; the stage section
  // in a second row (with the title, then without); the strip in a second row
  // (the stage section in the first, then beside it in the second). Below
  // HUD_NARROW the strip is always under the sign, which drops its title and
  // then wraps into rows as the scene narrows (and as a last resort above it
  // too). The stage note goes under the stage section, or lower should the
  // sign or the strip be in its row. The panels open under the sign (raised
  // just enough for the tallest to fit, should a wrapped sign leave too
  // little room).
  hudLayout(W, list, fight) {
    const inset = props()?.inset ?? 84;
    const right = W - HUD_EDGE;
    const counts = tally(list);
    const spec = this.signSpec(list);
    const stripW = 2 * FRAME + 6 + counts.reduce((x, t) => x + t.w + 8, 0) + 34 + 2;
    const stageW = fight ? this.stageWidth(W) : 0;
    const box = (x, y, w, h = HUD_H) => ({ x, y, w, h });
    const across = (b, y, h) => b.y < y + h && y < b.y + b.h; // shares rows with y..y+h
    const apart = (a, b) => !across(a, b.y, b.h) || a.x + a.w + HUD_GAP <= b.x || b.x + b.w + HUD_GAP <= a.x;
    const wrap = Math.max(0, right - inset - 2 * (FRAME + SIGN_PAD)); // the room a wrapped sign has
    const tries =
      W < HUD_NARROW
        ? [{ titled: true, strip: 2 }, { titled: false, strip: 2 }, { titled: true, strip: 2, wrap: true }, { titled: false, strip: 2, wrap: true }]
        : [
            { titled: true, strip: 1, stage: 1 },
            { titled: false, strip: 1, stage: 1 },
            ...(fight ? [{ titled: true, strip: 1, stage: 2 }, { titled: false, strip: 1, stage: 2 }] : []),
            { titled: true, strip: 2, stage: 1 },
            { titled: false, strip: 2, stage: 1 },
            { titled: false, strip: 2, stage: 2 },
            { titled: false, strip: 2, stage: 2, wrap: true },
          ];
    const place = (t, force) => {
      const plan = this.signPlan(spec, t.titled, t.wrap ? wrap : null);
      const sign = box(inset, HUD_TOP, plan.w, plan.h);
      const strip = box(right - stripW, t.strip === 1 ? HUD_TOP : sign.y + sign.h + 4, stripW);
      if (!force && (sign.x + sign.w > right || !apart(sign, strip))) return null;
      let stage = null;
      if (fight) {
        const y = t.stage === 1 ? HUD_TOP : Math.max(sign.y + sign.h, t.strip === 1 ? strip.y + strip.h : 0) + 4;
        const lo = across(sign, y, HUD_H) ? sign.x + sign.w + HUD_GAP : HUD_EDGE;
        const hi = across(strip, y, HUD_H) ? strip.x - HUD_GAP : right;
        if (!force && hi - lo < stageW) return null;
        stage = box(Math.round(clamp(W / 2 - stageW / 2, lo, Math.max(lo, hi - stageW))), y, stageW);
      }
      return { sign, strip, stage, titled: t.titled, plan };
    };
    const got = tries.reduce((found, t) => found ?? place(t, false), null) ?? place(tries[tries.length - 1], true);
    // the stage notes (a failed attempt, the countdown to the next stage) under the stage section
    let note = null;
    const m = this.monster;
    const t = this.timesUp;
    if (got.stage && t && Date.now() - t.at <= TIMES_UP_MS) note = { id: `idle-rpg-timesup-${t.id}`, text: t.text ?? LABELS.timesUp, colour: "red", fading: Boolean(t.fading) };
    else if (got.stage && m?.advancing && m.hp <= 0) {
      const secs = Math.max(1, Math.ceil((m.slainAt + ADVANCE_MS - Date.now()) / 1000));
      note = { id: `idle-rpg-advance-${m.id}`, text: LABELS.moving(m.advancing, secs), colour: "gold" };
    }
    if (note) {
      const w = letterW(note.text) + 2 * FRAME + 16;
      note.box = box(Math.round(clamp(got.stage.x + got.stage.w / 2 - w / 2, HUD_EDGE, right - w)), got.stage.y + HUD_H + 4, w, NOTE_H);
      // and lower, should the sign or the strip be in its row
      for (let moved = true; moved; ) {
        moved = false;
        for (const b of [got.sign, got.strip])
          if (!apart(note.box, b)) {
            note.box.y = b.y + b.h + 4;
            moved = true;
          }
      }
    }
    const under = got.sign.y + got.sign.h + 4;
    const panelTop = Math.max(HUD_TOP, Math.min(under, Math.max(FLOOR_H, this.size.height) - PANEL_MAX_H - 2));
    return { ...got, note, inset, counts, spec, panelTop };
  }

  // The sign, top left (see signSpec, hudLayout): a pixel frame holding the
  // title in gold, the counts as chips (an icon and a number in the lettering,
  // each opening its panel and sunk while it is open; the star gold on a faint
  // gold square while there are points to spend, dimmed when there are none)
  // and the raid button, red "Return to town" in a raid and slate "Start Raid"
  // out of one. In a row, or wrapped into rows on a narrow scene (signPlan).
  // Drawn on the floor, over the night's dark, like the strip.
  sign(list, hud) {
    const { spec, sign: b, plan } = hud;
    const at = (el, x, y) => el.absolute().left(x).top(y);
    const place = Object.fromEntries(plan.places.map((p) => [p.what, p]));
    const kids = [];
    if (place.title) kids.push(at(div(), place.title.x, place.title.y + 4).child(letterText(LABELS.title, "gold")));
    if (place.empty) kids.push(at(div(), place.empty.x, place.empty.y + 4).child(letterText(LABELS.empty, "grey")));
    const acts = {
      slain: [this.codex, (cx) => this.openCodex(!this.codex)],
      gold: [Boolean(this.shopOpen), () => this.openShop(this.shopOpen ? null : this.sprites[YOU])],
      // on the first class with points to spend, else your own
      points: [Boolean(this.skillsOpen), () => this.openSkills(this.skillsOpen ? null : (CLASSES.find((c) => pointsLeft(this.progress, c) > 0) ?? this.sprites[YOU]))],
    };
    for (const c of spec.counts) {
      const [open, act] = acts[c.id];
      const star = c.id === "points";
      const gilt = star && spec.spare > 0;
      kids.push(
        at(chip(`idle-rpg-${c.id}`, countW(c.n), open, [image(src(c.art)).w(18).h(18), letterText(shortNumber(c.n), gilt ? "gold" : "white")]), place[c.id].x, place[c.id].y)
          .when(gilt && !open, (el) => el.bg("#ffd16630").border_color("#ffd16650"))
          .when(star && !gilt && !open, (el) => el.opacity(0.55))
          .on_click((_e, cx) => {
            act(cx);
            cx.notify();
          }),
      );
    }
    const tone = this.battle ? RAID_BUTTON.on : RAID_BUTTON.off;
    const button = div()
      .id("idle-rpg-battle-toggle")
      .w(spec.buttonW)
      .h(CHIP_H)
      .border(2)
      .border_color(FRAME_COLOURS.outline)
      .bg(tone.face)
      .cursor_pointer()
      .hover((st) => st.bg(tone.hover))
      .active((st) => st.bg(tone.down))
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_click((_e, cx) => {
        this.battle = !this.battle;
        this.clearEffects(); // statuses stay with the fight they were put on
        // the panels open from different places in a raid and out of one
        this.codex = this.settingsOpen = false;
        this.skillsOpen = this.shopOpen = null;
        if (this.battle) this.fight(); // someone to fight straight away
        this.save();
        this.wake(cx);
        cx.notify();
      })
      // a lighter top edge and a darker bottom one over the face, so they follow it under the pointer
      .child(
        div()
          .size_full()
          .border_t(2)
          .border_color("#ffffff40")
          .child(h_flex().size_full().border_b(2).border_color("#00000040").items_center().justify_center().child(letterText(spec.label, tone.text))),
      );
    kids.push(at(button, place.button.x, place.button.y));
    return div()
      .id("idle-rpg-sign")
      .absolute()
      .left(b.x)
      .top(b.y - this.wallH)
      .w(b.w)
      .h(b.h)
      .on_mouse_down("left", (_e, cx) => this.framePress(cx))
      .children([...framePieces(b.w, b.h), ...kids]);
  }

  // The stage section, top centre while the fight shows (see hudLayout): in a
  // pixel frame, the stage in gold with an arrow either side to pick another
  // one reached (dimmed and dead at stage 1 and at the highest reached; while
  // farming after a failed attempt a green "FARM" after the number, and the
  // next arrow pulsing), and the minutes and seconds left of the attempt
  // ("9:42"), white while the time runs and grey while it stands still (nobody
  // attacking; none while the boss is down); under them a bar of the time
  // left, gliding between renders, which come at least once a second while
  // the time runs (see tick), so nothing renders just to move it.
  stageSection(b) {
    const m = this.monster;
    const dead = m.hp <= 0;
    const { stage, best } = this.progress;
    const farming = Boolean(this.progress.farming);
    const limit = stageTime(m.stage);
    const running = !dead && this.attackers().length > 0;
    const x0 = FRAME + 4;
    const y0 = FRAME + 1;
    const arrow = (dir, to, x) => {
      const live = to >= 1 && to <= best && to !== stage;
      return chip(`idle-rpg-stage-${dir}`, 18, false, [image(src(STAGE_ARROWS[dir])).w(10).h(14)], { live })
        .absolute()
        .left(x)
        .top(y0)
        .opacity(live ? 1 : 0.3)
        // while farming, the way forward pulses (a native loop: no renders)
        .when(live && farming && dir === "next", (el) => el.loop("opacity", { from: 0.45, to: 1, period: 900 }))
        .when(live, (el) =>
          el.on_click((_e, cx) => {
            this.toStage(to, cx);
            cx.notify();
          }),
        );
    };
    // an arrow at each end of the section, the stage and the time between them
    const words = LABELS.stage(stage);
    let x = x0 + 18 + STAGE_GAP;
    const right = b.w - x0 - 18 - STAGE_GAP; // where the time ends, left of the next arrow
    const kids = [arrow("prev", stage - 1, x0), div().absolute().left(x).top(y0 + 4).child(letterText(words, "gold"))];
    x += letterW(words) + 2;
    // farming after a failed attempt: kills repeat this stage until the next arrow is pressed
    if (farming) {
      kids.push(
        div()
          .id("idle-rpg-stage-farm")
          .absolute()
          .left(x + 4)
          .top(y0 + 4)
          .tooltip("Farming: kills repeat this stage. The arrow tries the next again.")
          .child(letterText(LABELS.farm, "green")),
      );
    }
    kids.push(arrow("next", stage + 1, b.w - x0 - 18));
    const clock = dead ? "" : clockText(this.left);
    const barW = b.w - 2 * x0;
    // the time only runs while someone attacks: standing still, it says so
    if (!dead && !running) {
      kids.push(
        div()
          .id("idle-rpg-stage-paused")
          .absolute()
          .left(right - letterW("00:00") - 6 - letterW(LABELS.paused))
          .top(y0 + 4)
          .tooltip("The time runs only while an agent is working and attacking.")
          .child(letterText(LABELS.paused, "grey")),
      );
    }
    kids.push(
      div().id("idle-rpg-stage-clock").absolute().left(right - letterW(clock)).top(y0 + 4).child(letterText(clock, running ? "white" : "grey")),
      div()
        .id("idle-rpg-stage-time")
        .absolute()
        .left(x0)
        .top(y0 + CHIP_H + 4)
        .w(barW)
        .h(4)
        .bg(FRAME_COLOURS.outline)
        .child(
          div()
            .id("idle-rpg-monster-time")
            .h(4)
            .w(Math.round((barW * clamp(this.left, 0, limit)) / limit))
            .bg(running ? "#5cc8ff" : "#5d7088")
            .transition("width", { duration: TICK_STEP, easing: "linear" }),
        ),
    );
    return div()
      .id("idle-rpg-stage")
      .absolute()
      .left(b.x)
      .top(b.y - this.wallH)
      .w(b.w)
      .h(b.h)
      .on_mouse_down("left", (_e, cx) => this.framePress(cx))
      .children([...framePieces(b.w, b.h), ...kids]);
  }

  // A stage note under the stage section, in a frame of its own (see
  // hudLayout): after a failed attempt, "Time's up! Back to stage 8" or
  // "Wiped! Back to stage 8" in red, which pops in, then on the render tick()
  // asks for once it has shown TIMES_UP_FRESH (marking it `fading`) fades
  // natively, gone after TIMES_UP_MS; or, while a boss that first cleared its
  // stage lies there (see ADVANCE_MS), "Moving to stage 13 in 3" in gold,
  // drawn again by the watch once a second (no timer of its own). Picking a
  // stage brings a fresh boss at once, so it goes with it.
  stageNote(n) {
    const b = n.box;
    return div()
      .id(n.id)
      .absolute()
      .left(b.x)
      .top(b.y - this.wallH)
      .w(b.w)
      .h(b.h)
      .on_mouse_down("left", (_e, cx) => this.framePress(cx))
      .when(n.colour === "red", (el) => el.opacity(n.fading ? 0 : 1).transition("opacity", { duration: TIMES_UP_MS - TIMES_UP_FRESH, easing: "ease-in" }))
      .children([...framePieces(b.w, b.h), div().absolute().left(FRAME + 8).top(FRAME + 3).child(letterText(n.text, n.colour))]);
  }

  // The strip, top right (see hudLayout), in a frame like the sign's: an icon
  // for each status with agents in it, in the order of tally, with how many on
  // a badge at its bottom-right corner in the pixel font, then the gear, a chip
  // that opens the settings menu. Drawn on the floor over the night's dark and
  // under the cards. `b` is its box: beside the sign, or under it below
  // HUD_NARROW wide.
  hud(counts, b) {
    let x = FRAME + 6;
    const icons = counts.map(({ status, art, w, h, n }) => {
      const count = n > 99 ? "99+" : String(n);
      const el = div()
        .id(`idle-rpg-status-${status}`)
        .absolute()
        .left(x)
        .top(FRAME + Math.floor((HUD_H - 2 * FRAME - h - 2) / 2))
        .w(w)
        .h(h)
        .tooltip(`${STATUS[status][0]}: ${n}`)
        .child(image(src(art)).w(w).h(h))
        .child(div().absolute().left(w - textW(count, 2) + 2).top(h - GLYPH_H * 2 + 2).child(pixelText(count, "white", 2)));
      x += w + 8;
      return el;
    });
    const gear = chip("idle-rpg-gear", 34, this.settingsOpen, [image(src("icons/gear.png")).w(30).h(30)], { h: 34, px: 0 })
      .absolute()
      .left(b.w - FRAME - 2 - 34)
      .top(FRAME)
      .tooltip("Settings")
      .on_click((_e, cx) => {
        this.openSettings(!this.settingsOpen);
        cx.notify();
      });
    return div()
      .id("idle-rpg-hud")
      .on_mouse_down("left", (_e, cx) => this.framePress(cx))
      .absolute()
      .right(HUD_EDGE)
      .top(b.y - this.wallH)
      .w(b.w)
      .h(b.h)
      .children([...framePieces(b.w, b.h), ...icons, gear]);
  }

  // Opens or closes the settings menu, closing the other panels and any card.
  openSettings(open) {
    this.settingsOpen = open;
    if (!open) return;
    this.codex = false;
    this.skillsOpen = this.shopOpen = this.card = null;
    this.picking = false;
  }

  // The settings menu, under the gear at the scene's right edge, in the codex's
  // style: a line per entry of SETTINGS with a pixel on/off switch (square, dark
  // outlined, its knob sliding across). Clicking a line flips it and saves at
  // once. `top` is the top of the strip the gear is on.
  settingsCard(top) {
    const line = ({ key, name }) => {
      const on = this.settings[key];
      return h_flex()
        .id(`idle-rpg-setting-${key}`)
        .gap(8)
        .items_center()
        .px(4)
        .py(3)
        .rounded(6)
        .cursor_pointer()
        .hover((st) => st.bg("#ffffff14"))
        .on_click((_e, cx) => {
          this.settings[key] = !this.settings[key];
          this.save();
          cx.notify();
        })
        .child(div().flex_1().min_w(0).truncate().text_color("#dbe7f3").child(name))
        .child(
          div()
            .relative()
            .flex_none()
            .w(30)
            .h(16)
            .border(2)
            .border_color("#141a26")
            .bg(on ? "#4cd47b" : "#3a4658")
            .child(
              div()
                .id(`idle-rpg-setting-${key}-knob`)
                .absolute()
                .top(0)
                .left(on ? 14 : 0)
                .w(12)
                .h(12)
                .bg(on ? CREAM : "#9fb4cc")
                .transition("left", { duration: 120, easing: "ease-out" }),
            ),
        );
    };
    return v_flex()
      .id("idle-rpg-settings")
      .absolute()
      .right(HUD_EDGE)
      .top(top + HUD_H + 4)
      .w(200)
      .p(8)
      .gap(3)
      .rounded(8)
      .bg("#101a2cf0")
      .border(1)
      .border_color("#ffffff24")
      .text_size(11)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(
        h_flex()
          .gap(6)
          .items_center()
          .child(image(src("icons/gear.png")).w(20).h(20))
          .child(div().flex_1().text_size(12).font_semibold().text_color("#ffffff").child("Settings"))
          .child(
            div()
              .id("idle-rpg-settings-x")
              .px(5)
              .rounded(5)
              .text_color("#8ea3bb")
              .cursor_pointer()
              .hover((st) => st.bg("#ffffff1c"))
              .on_click((_e, cx) => {
                this.settingsOpen = false;
                cx.notify();
              })
              .child("×"),
          ),
      )
      .children(SETTINGS.map(line));
  }

  // Opens the skills panel on class `cls` (null closes it), closing the codex,
  // the shop and any card: only one of them is open at a time.
  openSkills(cls) {
    this.skillsOpen = cls;
    if (!cls) return;
    this.codex = this.settingsOpen = false;
    this.shopOpen = this.card = null;
    this.picking = false;
  }

  // Opens or closes the codex, closing the other panels and any card.
  openCodex(open) {
    this.codex = open;
    if (!open) return;
    this.settingsOpen = false;
    this.skillsOpen = this.shopOpen = this.card = null;
    this.picking = false;
  }

  // Between raids the rampart has three stations, each opening one of the
  // panels the sign's chips open during one: the book on the table is the
  // codex, the merchant's stall the shop, and the training dummy the skills
  // and training (the skill points waiting to be spent are on the sign's star). Returns elements for the
  // floor; they stand at the back, between the banners and torches.
  stations() {
    // Under the pointer a station shows it can be used, plainly enough for
    // broad daylight and in the scene's own style: its picture gains a white
    // pixel outline (each station's "hot" picture) and hops up a pixel of art, a white
    // arrow bobs over it, and its name's tag is outlined in white on a solid fill.
    // `inside(hot)` is what hops; `still(hot)` stays put behind it
    const station = (id, left, top, w, h, name, act, inside, still = () => []) => {
      const hot = this.hot === id;
      const fit = tagFit(name);
      return div()
        .id(`idle-rpg-station-${id}`)
        .absolute()
        .left(left)
        .top(top)
        .w(w)
        .h(h)
        .cursor_pointer()
        .on_hover((hovered, cx) => {
          if (hovered) this.hot = id;
          else if (this.hot === id) this.hot = null;
          cx.notify();
        })
        .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
        .on_click((_e, cx) => {
          act();
          cx.notify();
        })
        .children(still(hot))
        .child(
          div()
            .id(`idle-rpg-station-${id}-art`)
            .absolute()
            .left(0)
            .top(hot ? -4 : 0)
            .transition("top", { duration: 120, easing: "ease-out" })
            .children(inside(hot)),
        )
        .child(
          tag(fit, hot ? TAG.hot : TAG.plain)
            .id(`idle-rpg-station-${id}-tag`)
            .absolute()
            .left(Math.round(w / 2 - tagW(fit) / 2))
            .top(h + 3),
        )
        .when(hot, (el) =>
          el.child(
            div()
              .absolute()
              .left(w / 2 - 14)
              .top(-38)
              .loop("top", { from: -38, to: -30, period: 420 })
              .child(image(src("stations/arrow.png")).w(28).h(20)),
          ),
        );
    };
    // a picture, or under the pointer its outlined twin, a pixel of art (4px) bigger on every side
    const art = (name, hot, w, h, left = 0, top = 0) =>
      div()
        .absolute()
        .left(hot ? left - 4 : left)
        .top(hot ? top - 4 : top)
        .child(image(src(`stations/${name}/${hot ? "hot" : "idle"}.png`)).w(hot ? w + 8 : w).h(hot ? h + 8 : h));
    return [
      // over the table that is always there, with the book lying on it
      station(
        "codex",
        12,
        -34,
        112,
        56,
        LABELS.codex,
        () => this.openCodex(!this.codex),
        (hot) => [art("book", hot, 32, 24, 36, -8)],
        (hot) => (hot ? [art("table", true, 112, 56)] : []), // outlined over the table that is always there
      ),
      station(
        "skills",
        204,
        -52,
        48,
        72,
        LABELS.training, // the skill points waiting are on the sign's star
        () => this.openSkills(this.skillsOpen ? null : (CLASSES.find((c) => pointsLeft(this.progress, c) > 0) ?? this.sprites[YOU])),
        (hot) => [art("dummy", hot, 48, 72)],
      ),
      station("shop", 304, -64, 104, 84, LABELS.shop, () => this.openShop(this.shopOpen ? null : this.sprites[YOU]), (hot) => [art("stall", hot, 104, 84)]),
    ];
  }

  // Opens the shop on class `cls` (null closes it), closing the codex, the
  // skills panel and any card.
  openShop(cls) {
    this.shopOpen = cls;
    this.shopPick = null; // the item whose lines show: the one on, until another is clicked
    if (!cls) return;
    this.codex = this.settingsOpen = false;
    this.skillsOpen = this.card = null;
    this.picking = false;
  }

  // The codex, under the sign: every kind of monster and how many have fallen.
  // A kind not yet slain is a dim shape with no name. Kills from before the
  // counts by kind began are in the total only, so they get a line of their own.
  codexCard(left, top) {
    const { slain, kills } = this.progress;
    const known = Object.keys(MONSTERS).reduce((sum, k) => sum + (kills[k] ?? 0), 0);
    const line = (picture, name, n) =>
      h_flex()
        .gap(8)
        .items_center()
        .child(div().w(32).h(24).flex_none().flex().items_center().justify_center().child(picture))
        .child(div().flex_1().truncate().text_color("#dbe7f3").child(name))
        .child(div().font_semibold().text_color(CREAM).child(shortNumber(n)));
    return v_flex()
      .id("idle-rpg-codex")
      .absolute()
      .left(left)
      .top(top)
      .w(176)
      .p(8)
      .gap(3)
      .rounded(8)
      .bg("#101a2cf0")
      .border(1)
      .border_color("#ffffff24")
      .text_size(11)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(
        h_flex()
          .gap(6)
          .items_center()
          .child(image(src("icons/skull.png")).w(18).h(18))
          .child(div().flex_1().text_size(12).font_semibold().text_color("#ffffff").child("Codex"))
          .child(
            div()
              .id("idle-rpg-codex-x")
              .px(5)
              .rounded(5)
              .text_color("#8ea3bb")
              .cursor_pointer()
              .hover((st) => st.bg("#ffffff1c"))
              .on_click((_e, cx) => {
                this.codex = false;
                cx.notify();
              })
              .child("×"),
          ),
      )
      .children(
        Object.entries(MONSTERS).map(([k, kind]) => {
          const n = kills[k] ?? 0;
          const scale = 24 / Math.max(kind.w, kind.h);
          const picture = image(src(monsterArt(k)))
            .w(Math.round(kind.w * scale))
            .h(Math.round(kind.h * scale));
          return line(div().opacity(n > 0 ? 1 : 0.25).child(picture), n > 0 ? kind.name : "???", n);
        }),
      )
      .when(slain > known, (el) => el.child(line(div(), "Before the codex", slain - known)));
  }

  // A small button in a panel: live, or dimmed and dead. `act` does what it
  // says and returns whether anything changed, which is then saved straight away.
  button(id, label, live, act) {
    return div()
      .id(id)
      .flex_none()
      .px(5)
      .rounded(5)
      .text_size(10)
      .font_semibold()
      .bg(live ? "#5cc8ff" : "#ffffff0a")
      .text_color(live ? "#06243a" : "#5d7088")
      .when(live, (el) =>
        el
          .cursor_pointer()
          .hover((st) => st.bg("#8ad8ff"))
          .on_click((_e, cx) => {
            if (act()) this.save();
            cx.notify();
          }),
      )
      .child(label);
  }

  // The skills panel, under the sign like the codex: the four classes to pick
  // from, each with its level and any points it has to spend; then for the
  // one picked, its points, a Reset that gives them all back, and a line per
  // skill with its rank, what it gives now, and a + that spends a point on it;
  // then its training, bought with the gold shown in the title: a line per
  // kind (TRAINING in rules.js: Attack, Health) with its level, the damage or HP it multiplies by,
  // and Buy at the next level's price, dimmed and dead while the gold is
  // short. Buying saves at once. Its height is fixed by PANEL (147px, 165 with
  // a second kind of training), short enough for the scene at its lowest
  // (230px, the sign taking 54).
  skillsCard(left, top) {
    const cls = this.skillsOpen;
    const ranks = this.progress.skills[cls];
    const spare = pointsLeft(this.progress, cls);
    const spent = pointsSpent(ranks) > 0;
    // one line of the panel: PANEL.row high, its parts in a row
    const line = (id) => h_flex().id(id).h(PANEL.row).flex_none().gap(6).items_center();
    const tab = (c) => {
      const n = pointsLeft(this.progress, c);
      return h_flex()
        .id(`idle-rpg-skills-${c}`)
        .flex_1()
        .min_w(0)
        .h(PANEL.tab)
        .gap(2)
        .px(2)
        .items_center()
        .justify_center()
        .overflow_hidden()
        .rounded(6)
        .border(1)
        .border_color(c === cls ? "#5cc8ff" : n > 0 ? "#ffd16660" : "#00000000")
        .bg(c === cls ? "#5cc8ff22" : "#ffffff0a")
        .cursor_pointer()
        .hover((st) => st.bg("#ffffff1c"))
        .on_click((_e, cx) => {
          this.skillsOpen = c;
          cx.notify();
        })
        .child(this.sprite(c, "stand", 18, 18))
        .child(div().flex_none().text_size(9).font_semibold().text_color(CREAM).child(`Lv ${classLevel(this.progress.xp[c]).level}`))
        .when(n > 0, (el) => el.child(div().flex_none().text_size(9).font_semibold().text_color(GOLD).child(`+${n}`)));
    };
    const skill = (k) =>
      line(`idle-rpg-skill-row-${k}`)
        .child(div().w(38).flex_none().text_color("#dbe7f3").child(capital(k)))
        .child(div().w(30).flex_none().font_semibold().text_color(GOLD).child(`${ranks[k]}/${MAX_RANK}`))
        .child(div().flex_1().min_w(0).truncate().text_size(10).text_color("#8ea3bb").child(SKILL_TEXT[k]?.(this.progress, cls, ranks) ?? ""))
        .child(this.button(`idle-rpg-skill-${k}`, "+", canRaise(this.progress, cls, k), () => raise(this.progress, cls, k)));
    // one kind of training (TRAINING in rules.js: Attack, Health), bought with
    // the gold in the title: its level, what it multiplies damage or HP by
    // now, and Buy at its price
    const drill = ({ key, name }) => {
      const level = trainingOf(this.progress, cls, key);
      return line(`idle-rpg-train-row-${key}`)
        .tooltip(`${name} training: bought with gold, for every ${capital(cls)}`)
        .child(div().w(38).flex_none().text_color("#dbe7f3").child(name))
        .child(div().w(30).flex_none().font_semibold().text_color(GOLD).child(`Lv ${level}`))
        .child(div().flex_1().min_w(0).truncate().text_size(10).text_color("#8ea3bb").child(key === "health" ? `${times(healthBonus(level))} HP` : `${times(trainingBonus(level))} damage`))
        .child(this.button(`idle-rpg-train-${key}`, `Buy ${shortNumber(trainingPrice(level))}`, canTrain(this.progress, cls, key), () => train(this.progress, cls, key)));
    };
    return v_flex()
      .id("idle-rpg-skills")
      .absolute()
      .left(left)
      .top(top)
      .w(CARD_W)
      .p(PANEL.pad)
      .gap(PANEL.gap)
      .rounded(8)
      .bg("#101a2cf0")
      .border(1)
      .border_color("#ffffff24")
      .text_size(11)
      .line_height(PANEL.line)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(
        h_flex()
          .id("idle-rpg-skills-title")
          .h(PANEL.title)
          .flex_none()
          .gap(6)
          .items_center()
          .child(image(src("icons/star.png")).w(16).h(16))
          .child(div().flex_1().text_size(12).font_semibold().text_color("#ffffff").child("Skills & Training"))
          .child(div().font_semibold().text_color(GOLD).child(`${shortNumber(this.progress.gold)} gold`))
          .child(
            div()
              .id("idle-rpg-skills-x")
              .px(5)
              .rounded(5)
              .text_color("#8ea3bb")
              .cursor_pointer()
              .hover((st) => st.bg("#ffffff1c"))
              .on_click((_e, cx) => {
                this.skillsOpen = null;
                cx.notify();
              })
              .child("×"),
          ),
      )
      .child(h_flex().id("idle-rpg-skills-tabs").h(PANEL.tab).flex_none().gap(4).children(CLASSES.map(tab)))
      .child(
        line("idle-rpg-skills-points")
          .child(
            div()
              .flex_1()
              .truncate()
              .text_color(spare > 0 ? GOLD : "#8ea3bb")
              .child(`${capital(cls)}: ${spare > 0 ? `${spare} point${spare === 1 ? "" : "s"} to spend` : "no points to spend"}`),
          )
          .child(this.button("idle-rpg-skills-reset", "Reset", spent, () => resetSkills(this.progress, cls))),
      )
      .children((CLASS_SKILLS[cls] ?? []).map(skill))
      .children(TRAINING.map(drill));
  }

  // The shop, under the sign like the skills panel: your gold, the four
  // classes to pick from (each in the colourway, weapon and hat it has on),
  // then for the one picked, everything of one kind the shop sells: a preview
  // of the sprite in it, its name, and "Equipped", an Equip button (owned) or a
  // Buy button with its price, dimmed and dead while the gold is short. Buying
  // puts it on as well; buying and equipping save straight away. Down its left
  // side are the kinds of item (SHOP in rules.js): armours, weapons, hats, with
  // room under them for more. A weapon is shown in the class's hand as it
  // winds up to attack, where every weapon shows best (the healer's potion
  // only shows then). A hat is bought once for every class, which the
  // panel says under them while hats are shown; each class still has its own
  // on. A kind with nothing for sale yet says so. Under the items, two lines on
  // the one picked (clicking an item picks it; the one on until then): for a
  // weapon what it does (shopLines in effects.js: its pace, its element's
  // status and the bosses weak to it or resisting it, a vial's aura), the
  // tiles being too narrow for it. Its height is fixed by PANEL and SHOP_ROW
  // (167px), short enough for the scene at its lowest (230px, the sign taking 54).
  shopCard(left, top) {
    const cls = this.shopOpen;
    const kind = SHOP_KINDS.includes(this.shopKind) ? this.shopKind : SHOP_KINDS[0];
    const items = catalogue(cls, kind);
    // each armour with the class's weapon and hat on, each weapon held up in
    // the class's armour and hat (a pose is 24x18 art px, so 48 wide at 36
    // high), each hat over the class's armour and weapon
    const preview = {
      armour: (it) => this.sprite(cls, "stand", 36, 36, it.id),
      weapon: (it) => this.sprite(cls, "windup/r", 48, 36, undefined, undefined, it.id),
      hat: (it) => this.sprite(cls, "stand", 36, 36, undefined, it.id),
    };
    // the item whose lines show under the items: the one picked, else the one on
    const pick = items.find((it) => it.id === this.shopPick) ?? items.find((it) => it.id === equipped(this.progress, cls, kind)) ?? items[0];
    const about = !pick
      ? ["", ""]
      : kind === "weapon"
        ? shopLines(cls, pick.id)
        : [pick.name, SHOP[kind].shared ? "Looks only, worn by any class" : `Looks only, for every ${capital(cls)}`];
    const nav = (k) =>
      h_flex()
        .id(`idle-rpg-shop-kind-${k}`)
        .h(SHOP_ROW.nav)
        .flex_none()
        .gap(5)
        .items_center()
        .px(4)
        .rounded(6)
        .border(1)
        .border_color(k === kind ? "#5cc8ff" : "#00000000")
        .bg(k === kind ? "#5cc8ff22" : "#ffffff0a")
        .cursor_pointer()
        .hover((st) => st.bg("#ffffff1c"))
        .on_click((_e, cx) => {
          this.shopKind = k;
          this.shopPick = null;
          cx.notify();
        })
        .child(image(src(SHOP_ICONS[k] ?? "icons/coin.png")).w(18).h(18))
        .child(div().text_size(10).font_semibold().text_color(CREAM).child(SHOP[k].name));
    // the class picked is a wider tab with its name beside its sprite; the
    // others show the sprite alone, their name in a tooltip (four names do not
    // fit beside four sprites in the 218px column)
    const tab = (id, on, act, ...content) =>
      h_flex()
        .id(id)
        .when(on, (el) => el.w(SHOP_ROW.tab).flex_none())
        .when(!on, (el) => el.flex_1())
        .min_w(0)
        .h(PANEL.tab)
        .gap(2)
        .px(2)
        .items_center()
        .justify_center()
        .overflow_hidden()
        .rounded(6)
        .border(1)
        .border_color(on ? "#5cc8ff" : "#00000000")
        .bg(on ? "#5cc8ff22" : "#ffffff0a")
        .cursor_pointer()
        .hover((st) => st.bg("#ffffff1c"))
        .on_click((_e, cx) => {
          act();
          cx.notify();
        })
        .children(content);
    const item = (it) => {
      const on = equipped(this.progress, cls, kind) === it.id;
      const picked = it === pick;
      return v_flex()
        .id(`idle-rpg-shop-item-${it.id}`)
        .flex_1()
        .min_w(0)
        .h(SHOP_ITEM_H)
        .items_center()
        .gap(2)
        .py(3)
        .rounded(6)
        .border(1)
        .border_color(on ? "#5cc8ff" : picked ? "#5cc8ff70" : "#00000000")
        .bg(on ? "#5cc8ff22" : "#ffffff0a")
        .cursor_pointer()
        .on_click((_e, cx) => {
          this.shopPick = it.id;
          cx.notify();
        })
        .child(preview[kind]?.(it) ?? div().h(36))
        .child(div().max_w_full().truncate().text_size(10).text_color("#dbe7f3").child(it.name))
        .child(
          on
            ? div().text_size(9).font_semibold().text_color("#5cc8ff").child("Equipped")
            : owns(this.progress, cls, kind, it.id)
              ? this.button(`idle-rpg-shop-equip-${it.id}`, "Equip", true, () => equip(this.progress, cls, kind, it.id))
              : this.button(`idle-rpg-shop-buy-${it.id}`, `Buy ${shortNumber(it.price)}`, canBuy(this.progress, cls, kind, it.id), () => {
                  if (!buy(this.progress, cls, kind, it.id)) return false;
                  equip(this.progress, cls, kind, it.id);
                  return true;
                }),
        );
    };
    return v_flex()
      .id("idle-rpg-shop")
      .absolute()
      .left(left)
      .top(top)
      .w(SHOP_NAV_W + 8 + CARD_W)
      .p(PANEL.pad)
      .gap(PANEL.gap)
      .rounded(8)
      .bg("#101a2cf0")
      .border(1)
      .border_color("#ffffff24")
      .text_size(11)
      .line_height(PANEL.line)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .child(
        h_flex()
          .id("idle-rpg-shop-title")
          .h(PANEL.title)
          .flex_none()
          .gap(6)
          .items_center()
          .child(image(src("icons/coin.png")).w(16).h(16))
          .child(div().flex_1().text_size(12).font_semibold().text_color("#ffffff").child("Shop"))
          .child(div().font_semibold().text_color(GOLD).child(`${shortNumber(this.progress.gold)} gold`))
          .child(
            div()
              .id("idle-rpg-shop-x")
              .px(5)
              .rounded(5)
              .text_color("#8ea3bb")
              .cursor_pointer()
              .hover((st) => st.bg("#ffffff1c"))
              .on_click((_e, cx) => {
                this.shopOpen = null;
                cx.notify();
              })
              .child("×"),
          ),
      )
      .child(
        h_flex()
          .gap(8)
          .items_start()
          .child(
            // down the left: the kinds of item, and room for more
            v_flex()
              .w(SHOP_NAV_W)
              .flex_none()
              .gap(PANEL.gap)
              .children(SHOP_KINDS.map(nav))
              // under the hats, in place of "More soon": what one costs buys it for everyone
              .child(div().px(4).pt(2).text_size(9).text_color(SHOP[kind].shared ? GOLD : "#8ea3bb").child(SHOP[kind].shared ? "Bought once, for every class" : "More soon")),
          )
          .child(
            v_flex()
              .flex_1()
              .min_w(0)
              .gap(PANEL.gap)
              .child(
                h_flex()
                  .id("idle-rpg-shop-tabs")
                  .h(PANEL.tab)
                  .flex_none()
                  .gap(4)
                  .children(
                    CLASSES.map((c) =>
                      tab(
                        `idle-rpg-shop-${c}`,
                        c === cls,
                        () => {
                          this.shopOpen = c;
                          this.shopPick = null;
                        },
                        this.sprite(c, "stand", 18, 18),
                        ...(c === cls ? [div().flex_none().text_size(9).font_semibold().text_color(CREAM).child(capital(c))] : []),
                      ).when(c !== cls, (el) => el.tooltip(capital(c))),
                    ),
                  ),
              )
              .child(
                items.length
                  ? h_flex().h(SHOP_ITEM_H).flex_none().gap(4).children(items.map(item))
                  : // the same height as a row of items, so the panel does not jump between kinds
                    v_flex()
                      .h(SHOP_ITEM_H)
                      .items_center()
                      .justify_center()
                      .rounded(6)
                      .bg("#ffffff0a")
                      .text_color("#8ea3bb")
                      .child(`No ${SHOP[kind].name.toLowerCase()} for sale yet`),
              )
              // two lines on the item picked: for a weapon, what it does
              .child(
                v_flex()
                  .id("idle-rpg-shop-about")
                  .h(SHOP_ROW.about)
                  .flex_none()
                  .px(4)
                  .text_size(10)
                  .tooltip(about.filter(Boolean).join(" · ") || " ")
                  .child(div().id("idle-rpg-shop-about-1").truncate().font_semibold().text_color("#dbe7f3").child(about[0]))
                  .child(div().id("idle-rpg-shop-about-2").truncate().text_color("#8ea3bb").child(about[1])),
              ),
          ),
      );
  }
}
