// The art-path builders (rules.js and effects.js): every path they build for
// a valid input is a file in art/, and nothing a save or an agent could hold
// gets anything else into a path (no "..", no unknown names, no prototype keys).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as E from "../mods/idle-rpg/effects.js";
import * as R from "../mods/idle-rpg/rules.js";
import { artFiles } from "./harness/world.mjs";
import { pngSize } from "./harness/png.mjs";

const FILES = new Set(artFiles());
const isArt = (p) => typeof p === "string" && FILES.has(p);
const HOSTILE = [undefined, null, "", " ", "..", "../../etc/passwd", "default/../x", "__proto__", "constructor", "toString", "hasOwnProperty", 0, 1, -1, NaN, {}, [], ["stand"], () => "stand", "WIZARD", "Stand", "stand.png", "walk/l/../../x", Symbol.iterator];
// A built path is one of the folders the builder writes into and has no step out of it.
const safe = (p) => p === null || (typeof p === "string" && !p.includes("..") && !p.startsWith("/") && /^[a-z0-9/-]+\.png$/.test(p));

describe("lookArt", () => {
  test("every class, colourway and frame is a picture", () => {
    for (const c of R.CLASSES) for (const it of R.catalogue(c, "armour")) for (const f of R.FRAMES) assert.ok(isArt(R.lookArt(c, it.id, f)), R.lookArt(c, it.id, f));
  });
  test("an unknown class, colourway or frame falls back, never into the path", () => {
    assert.equal(R.lookArt("bard", "crimson", "walk/l"), "classes/wizard/crimson/walk/l.png");
    assert.equal(R.lookArt("healer", "crimson", "walk/l"), "classes/healer/default/walk/l.png", "another class's colourway");
    for (const h of HOSTILE) {
      for (const p of [R.lookArt(h, "default", "stand"), R.lookArt("archer", h, "stand"), R.lookArt("archer", "dusk", h)]) {
        assert.ok(safe(p) && isArt(p), `${String(h)}: ${p}`);
      }
    }
  });
});

describe("weaponArt and attackArt", () => {
  test("every weapon has its picture in every frame its class has, its own, not the default's", () => {
    for (const c of R.CLASSES)
      for (const it of R.catalogue(c, "weapon"))
        for (const f of R.FRAMES) {
          const p = R.weaponArt(c, it.id, f);
          if (R.WEAPON_FRAMES[c].includes(f)) {
            assert.ok(isArt(p), p);
            assert.ok(p.startsWith(`weapons/${c}/${it.id}/`), p);
          } else assert.equal(p, null, `${c} ${f}`);
        }
  });
  test("the healer's potion shows only as it winds up", () => {
    assert.deepEqual(R.WEAPON_FRAMES.healer, ["windup/l", "windup/r"]);
    assert.equal(R.weaponArt("healer", "might", "stand"), null);
  });
  test("every weapon's attack has its pictures, to either side; the warrior's slash has no hit", () => {
    for (const c of R.CLASSES)
      for (const it of R.catalogue(c, "weapon"))
        for (const part of R.ATTACK_PARTS)
          for (const side of ["l", "r"]) {
            const p = R.attackArt(c, it.id, part, side);
            if (c === "warrior" && part === "hit") assert.equal(p, null);
            else assert.ok(isArt(p), `${c} ${it.id} ${part} ${side}: ${p}`);
          }
  });
  test("each weapon's attack looks like it (not the default's)", () => {
    assert.equal(R.attackArt("archer", "flame", "shot", "l"), "attacks/arrow/fire/l.png");
    assert.equal(R.attackArt("wizard", "storm", "hit"), "attacks/burst/storm.png");
    assert.equal(R.attackArt("healer", "hex", "shot"), "attacks/potion/hex.png");
    assert.equal(R.attackArt("warrior", "hammer", "shot", "r"), "attacks/slash/smash/r.png");
  });
  test("hostile input gets the default weapon, class or frame, any side but l is r", () => {
    assert.equal(R.weaponArt("warrior", "flame", "stand"), "weapons/warrior/flame/stand.png");
    assert.equal(R.weaponArt("warrior", "frost", "stand"), "weapons/warrior/default/stand.png", "another class's weapon id");
    assert.equal(R.attackArt("archer", "default", "shot", "up"), "attacks/arrow/default/r.png");
    for (const h of HOSTILE) {
      for (const p of [R.weaponArt(h, "default", "stand"), R.weaponArt("archer", h, "stand"), R.weaponArt("archer", "crossbow", h), R.attackArt(h, "default", "shot", "l"), R.attackArt("wizard", h, "hit"), R.attackArt("wizard", "frost", "shot", h)]) {
        assert.ok(safe(p) && (p === null || isArt(p)), `${String(h)}: ${p}`);
      }
      assert.equal(R.attackArt("wizard", "frost", h), null, `part ${String(h)}`);
    }
  });
});

describe("hatArt", () => {
  test("every hat over every class in every frame; no hat, no picture", () => {
    for (const c of R.CLASSES)
      for (const it of R.catalogue(c, "hat"))
        for (const f of R.FRAMES) {
          const p = R.hatArt(c, it.id, f);
          if (it.id === R.DEFAULT_LOOK) assert.equal(p, null);
          else assert.ok(isArt(p), p);
        }
  });
  test("hostile hats are no hat", () => {
    for (const h of HOSTILE) assert.equal(R.hatArt("healer", h, "stand"), null, String(h));
    for (const h of HOSTILE) assert.ok(isArt(R.hatArt(h, "party", "stand")) && isArt(R.hatArt("wizard", "santa", h)));
  });
});

describe("monsterArt and attackPart", () => {
  test("every kind's every part is a picture", () => {
    for (const k of R.KINDS) for (const part of R.MONSTER_ART[k]) assert.ok(isArt(R.monsterArt(k, part)), `${k} ${part}`);
    assert.equal(R.monsterArt("slime"), "monsters/slime/idle.png");
  });
  test("each kind's attacks name parts it has, to either side", () => {
    for (const k of R.KINDS)
      for (const type of ["single", "area"])
        for (const piece of ["pose", "shot", "hit", "flicker"])
          for (const side of ["l", "r"]) {
            const part = R.attackPart(k, type, piece, side);
            if (part !== null) assert.ok(isArt(R.monsterArt(k, part)), `${k} ${type} ${piece} ${side}: ${part}`);
          }
    assert.equal(R.attackPart("ogre", "area", "shot"), null, "the ogre's slam throws nothing");
    assert.equal(R.attackPart("slime", "single", "pose", "l"), "attack/spit/l");
  });
  test("every kind has its whole picture, its eyelids and its breathing piece; the slimes a foot, the ogres a roar", () => {
    for (const k of R.KINDS) for (const part of ["idle", "blink", "top"]) assert.ok(R.MONSTER_ART[k].includes(part), `${k} ${part}`);
    for (const k of ["slime", "magma-slime"]) assert.ok(R.MONSTER_ART[k].includes("base"), k);
    for (const k of ["ogre", "chief-ogre", "dragon"]) assert.ok(R.MONSTER_ART[k].includes("roar/roar"), k);
    assert.deepEqual(Object.keys(R.MONSTER_ART), R.KINDS);
    assert.deepEqual(Object.keys(R.MONSTER_ATTACKS), R.KINDS);
    // every picture of a kind in its own folder, and nothing in a folder but its own kind's
    for (const k of R.KINDS) for (const part of R.MONSTER_ART[k]) assert.ok(R.monsterArt(k, part).startsWith(`monsters/${k}/`), `${k} ${part}`);
    const folders = new Set([...FILES].filter((f) => f.startsWith("monsters/")).map((f) => f.split("/")[1]));
    assert.deepEqual([...folders].sort(), [...R.KINDS].sort());
  });
  test("an attack's part is the same size for every kind that has it (main.js sizes them by name)", () => {
    const sizes = new Map();
    for (const k of R.KINDS)
      for (const type of ["single", "area"])
        for (const piece of ["shot", "hit", "flicker"])
          for (const side of ["l", "r"]) {
            const part = R.attackPart(k, type, piece, side);
            if (!part) continue;
            const name = part.replace(/\/[lr]$/, "");
            const { w, h } = pngSize(R.monsterArt(k, part));
            const seen = sizes.get(name);
            if (seen) assert.deepEqual([w, h], seen.wh, `${k}'s ${part} is ${w}x${h}, ${seen.k}'s ${seen.wh.join("x")}`);
            else sizes.set(name, { k, wh: [w, h] });
          }
  });
  test("an unknown kind or part is null", () => {
    for (const h of [...HOSTILE, "Slime", "slime/../dragon", "chief_ogre", "magma slime"]) {
      assert.equal(R.monsterArt(h, "idle"), null);
      if (h !== undefined) assert.equal(R.monsterArt("dragon", h), null, String(h));
      assert.ok(safe(R.attackPart(h, "single", "pose")) || R.attackPart(h, "single", "pose") === null);
      assert.equal(R.attackPart("ogre", "single", h), null);
      // any side but "l" is "r", never what was passed
      assert.equal(R.attackPart("slime", "single", "pose", h), "attack/spit/r");
    }
  });
});

describe("biomeArt", () => {
  test("every biome's every part is a picture, in scene/<biome>/", () => {
    for (const b of R.BIOMES)
      for (const part of R.BIOME_ART[b.id]) {
        const p = R.biomeArt(b.id, part);
        assert.ok(isArt(p), `${b.id} ${part}`);
        assert.ok(p.startsWith(`scene/${b.id}/`), p);
      }
    assert.equal(R.biomeArt("caves", "ceiling"), "scene/caves/ceiling.png");
  });
  test("every biome has a backdrop: far, mid, ground and a swatch; one under a roof a ceiling and a light", () => {
    assert.deepEqual(Object.keys(R.BIOME_ART), R.BIOMES.map((b) => b.id));
    for (const b of R.BIOMES) {
      for (const part of ["far", "mid", "ground", "swatch"]) assert.ok(R.BIOME_ART[b.id].includes(part), `${b.id} ${part}`);
      assert.equal(R.BIOME_ART[b.id].includes("ceiling"), !b.outdoors, `${b.id}: a ceiling only under a roof`);
    }
  });
  test("an unknown biome or part is null, never in the path", () => {
    for (const h of HOSTILE) {
      assert.equal(R.biomeArt(h, "far"), null, String(h));
      assert.equal(R.biomeArt("forest", h), null, String(h));
    }
    assert.equal(R.biomeArt("forest", "ceiling"), null, "the forest has no roof");
    assert.equal(R.biomeArt("rampart", "far"), null, "the town's pictures are named in main.js");
  });
});

describe("seasonArt", () => {
  test("every season's every part is a picture, in seasons/<season>/", () => {
    assert.deepEqual(Object.keys(R.SEASON_ART), R.SEASONS.map((s) => s.id));
    for (const s of R.SEASONS)
      for (const part of R.SEASON_ART[s.id]) {
        const p = R.seasonArt(s.id, part);
        assert.ok(isArt(p), `${s.id} ${part}`);
        assert.ok(p.startsWith(`seasons/${s.id}/`), p);
      }
    assert.equal(R.seasonArt("winter", "tree"), "seasons/winter/tree.png");
    assert.equal(R.seasonArt("halloween", "light/torch-pb"), "seasons/halloween/light/torch-pb.png");
    assert.equal(R.seasonArt("halloween", "light/fire-23"), null, "Halloween's campfire stretch is the plain one");
    assert.equal(R.seasonArt("halloween", "light/torch-ab"), null, "never both gaps of one torch");
  });
  test("each season's darkness stands in for the plain one's pictures only (light/ in art/)", () => {
    for (const s of R.SEASONS)
      for (const part of R.SEASON_ART[s.id].filter((p) => p.startsWith("light/"))) assert.ok(isArt(`${part.replace(/^light\/torch-[pab]+$/, "light/torch")}.png`), `${s.id}: ${part} stands in for a plain picture`);
    // the campfire's 24 places, as many as light/ has
    assert.equal(R.FIRE_LIGHTS.length, [...FILES].filter((f) => /^light\/fire-\d+\.png$/.test(f)).length);
  });
  test("an unknown season or part is null, never in the path", () => {
    for (const h of HOSTILE) {
      assert.equal(R.seasonArt(h, "tree"), null, String(h));
      assert.equal(R.seasonArt("winter", h), null, String(h));
    }
    assert.equal(R.seasonArt("halloween", "tree"), null, "the tree is December's");
    assert.equal(R.seasonArt("winter", "light/fire-24"), null, "the campfire has 24 places");
    assert.equal(R.seasonArt("winter", "light/../lantern"), null);
    // nothing else in seasons/: every file there is one of SEASON_ART's
    const listed = new Set(R.SEASONS.flatMap((s) => R.SEASON_ART[s.id].map((part) => R.seasonArt(s.id, part))));
    assert.deepEqual([...FILES].filter((f) => f.startsWith("seasons/") && !listed.has(f)), []);
  });
});

describe("glyphArt and letterArt", () => {
  test("every glyph in every colour, and nothing else", () => {
    for (const c of R.GLYPH_COLOURS) for (const ch of R.GLYPHS) assert.ok(isArt(R.glyphArt(c, ch)), `${c} ${ch}`);
    for (const bad of ["a", "k", "-", " ", "10", "", "..", "/"]) assert.equal(R.glyphArt("white", bad), null, bad);
    for (const h of HOSTILE) assert.equal(R.glyphArt(h, "1"), null);
    for (const h of HOSTILE) assert.equal(R.glyphArt("gold", h), null);
  });
  test("every letter in every lettering colour; lower case is drawn as capitals; a space has no picture", () => {
    for (const c of R.LETTER_COLOURS) for (const ch of R.LETTERS) if (ch !== " ") assert.ok(isArt(R.letterArt(c, ch)), `${c} ${ch}`);
    assert.equal(R.letterArt("red", "q"), R.letterArt("red", "Q"));
    assert.equal(R.letterArt("gold", " "), null);
    assert.equal(R.letterWidth(" "), 1);
    for (const bad of ["é", "ß", "ı", "$", "..", "", "AB", "\u{1F600}", "__proto__", "constructor", "toString"]) assert.equal(R.letterArt("white", bad), null, bad);
    for (const h of HOSTILE) {
      assert.equal(R.letterArt(h, "A"), null);
      assert.equal(R.letterArt("white", h), null);
    }
    assert.equal(R.letterable("Time's up!"), true);
    assert.equal(R.letterable("50%"), true);
    assert.equal(R.letterable("caf\u00e9"), false, "an accent is folded by letterFit, not drawn");
    assert.equal(R.letterable(null), false);
  });
});

describe("letterFit: any text, as the lettering draws it", () => {
  const ok = (out) => [...out].every((ch) => R.LETTERS.includes(ch));
  // every character it gives has a picture in every colour (or is a space), named only from a fixed list
  const drawable = (out) => [...out].every((ch) => ch === " " || R.LETTER_COLOURS.every((c) => isArt(R.letterArt(c, ch)) && safe(R.letterArt(c, ch))));
  test("every character of the face is a file of its own, named in plain lower-case letters and digits", () => {
    const names = new Set();
    for (const ch of R.LETTERS) {
      if (ch === " ") continue;
      const p = R.letterArt("white", ch);
      assert.match(p, /^lettering\/white\/[a-z0-9]+\.png$/, ch);
      names.add(p);
    }
    assert.equal(names.size, R.LETTERS.length - 1, "no two characters share a picture");
  });
  test("a table of names", () => {
    const U = R.UNKNOWN;
    const E = R.ELLIPSIS;
    const table = [
      ["Keep\u00b7Hall", "KEEP\u00b7HALL"],
      ["lower case", "LOWER CASE"],
      ["Caf\u00e9 na\u00efve", "CAFE NAIVE"], // accents fold to their letters
      ["e\u0301", "E"], // a combining accent takes no room
      ["\u00c5ngstr\u00f6m", "ANGSTROM"],
      ["\ufb01le", "FILE"], // a ligature, its letters
      ["Stra\u00dfe", `STRA${U}E`], // no plain letter for it: the box
      ["\u65e5\u672c\u8a9e", `${U}${U}${U}`], // a box per character
      ["\u{1F680} deploy", `${U} DEPLOY`], // an emoji (astral) is one box
      ["\u{1F468}\u200d\u{1F469}\u200d\u{1F467}", U], // a family joined by zero-width joiners: one
      ["\u{1F44B}\u{1F3FD}", U], // a skin tone takes no room
      ["\u{1F1E8}\u{1F1E6}x", `${U}X`], // a flag (two regional indicators): one
      ["\u2764\ufe0f", U], // a variation selector takes no room
      ["a\tb\n\nc   d", "A B C D"], // any white space is a space, a run of them one
      ["#123 fix_it [1] ~/x 50%? a&b @c *=<> | \\ \"; ,", '#123 FIX_IT [1] ~/X 50%? A&B @C *=<> | \\ "; ,'],
      ["", ""],
      ["\ud800", U], // a lone surrogate
      ["\u0000\u0007", ""], // controls take no room
    ];
    for (const [text, want] of table) {
      const got = R.letterFit(text);
      assert.equal(got, want, JSON.stringify(text));
      assert.ok(ok(got) && drawable(got), JSON.stringify(text));
    }
    for (const h of [undefined, null, 0, 12, {}, [], ["a"], () => "a", Symbol.iterator]) assert.equal(R.letterFit(h), "", String(typeof h));
  });
  test("cut to a width with an ellipsis, spaces before it dropped, never wider", () => {
    assert.equal(R.letterFit("Keep\u00b7Hall", 38), "KEEP\u00b7HALL"); // 36 art px: fits
    assert.equal(R.letterFit("lower case\u00b7zsh", 38), `LOWER C${R.ELLIPSIS}`);
    assert.equal(R.letterFit("abcdef ghij", 32), `ABCDEF${R.ELLIPSIS}`, "the space before the cut goes");
    assert.equal(R.letterFit("abc", 7), R.ELLIPSIS, "only the ellipsis fits");
    assert.equal(R.letterFit("abc", 6), "", "not even that");
    for (const max of [7, 20, 38, 50, 101])
      for (const text of ["x".repeat(200), "M W".repeat(50), "\u65e5".repeat(80), "Caf\u00e9 ".repeat(40)]) {
        const got = R.letterFit(text, max);
        assert.ok(R.lettersWidth(got) <= max, `${got} is ${R.lettersWidth(got)} > ${max}`);
        assert.ok(got.endsWith(R.ELLIPSIS), got);
        // and with no spaces to drop, it holds as much as it can: one more (5 or 6 art px) would not fit
        if (!text.includes(" ")) assert.ok(R.lettersWidth(got) + 6 > max, `${got} could hold another character in ${max}`);
      }
  });
  test("hostile names: paths, prototype keys, astral and combining characters, a 10,000-character name", () => {
    for (const text of ["../../etc/passwd", "..\\..\\x", "__proto__", "constructor", "toString", "hasOwnProperty", "lettering/white/a.png", "\u{10FFFF}\u{E0041}\u{1D400}", "a\u0300\u0301\u0302\u0303\u0304".repeat(50), "\u202eevil", "%2e%2e%2f"]) {
      const got = R.letterFit(text, 38);
      assert.ok(ok(got) && drawable(got), `${JSON.stringify(text)} -> ${JSON.stringify(got)}`);
    }
    const huge = "\u00e9\u{1F600}x".repeat(3334);
    const t0 = performance.now();
    const got = R.letterFit(huge, 38);
    assert.ok(performance.now() - t0 < 50, "stops reading once full");
    assert.ok(ok(got) && R.lettersWidth(got) <= 38);
    // characters that take no room never fill it, so reading stops by count
    for (const pad of ["\u0301", "\u200b", " ", "\u200d"]) {
      const text = `a${pad.repeat(1e7)}b`; // read to its end, this takes most of a second
      const t1 = performance.now();
      const out = R.letterFit(text, 38);
      assert.ok(performance.now() - t1 < 100, `${JSON.stringify(pad)} is not read to the end`);
      assert.equal(out, `A${R.ELLIPSIS}`);
    }
    // every code point in a sweep of the planes, alone and among letters, gives only characters of the face
    for (let cp = 0; cp < 0x30000; cp += 7) {
      if (cp >= 0xd800 && cp < 0xe000) continue;
      const out = R.letterFit(`a${String.fromCodePoint(cp)}b`);
      assert.ok(ok(out), `U+${cp.toString(16)} -> ${JSON.stringify(out)}`);
    }
  });
});

describe("letterFit: joiners and blanks", () => {
  test("a joiner merges emoji only, never eats a letter", () => {
    assert.equal(R.letterFit("Dev\u200dOps"), "DEVOPS");
    assert.equal(R.letterFit("\u{1F468}\u200d\u{1F469}\u200d\u{1F467}x"), `${R.UNKNOWN}X`);
    assert.equal(R.letterFit("\u200dab"), "AB");
  });
  test("what it gives never starts or ends with a space", () => {
    assert.equal(R.letterFit("  a  b  "), "A B");
    assert.equal(R.letterFit("abc \u200b"), "ABC");
    assert.equal(R.letterFit("\u200b"), "");
    assert.equal(R.letterFit(" \u0301 "), "");
  });
});

describe("effects' pictures", () => {
  test("icons, marks and overlays are all there; anything else is null", () => {
    for (const id of E.EFFECT_ICONS) assert.ok(isArt(E.effectIconArt(id)));
    for (const m of E.EFFECT_MARKS) assert.ok(isArt(E.markArt(m)));
    for (const [st, parts] of Object.entries(E.EFFECT_OVERLAYS)) for (const part of parts) assert.ok(isArt(E.overlayArt(st, part)));
    for (const h of HOSTILE) {
      assert.equal(E.effectIconArt(h), null);
      assert.equal(E.markArt(h), null);
      assert.equal(E.overlayArt(h, "flame-1"), null);
      assert.equal(E.overlayArt("burn", h), null);
    }
  });
});
