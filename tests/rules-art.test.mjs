// The art-path builders (rules.js and effects.js): every path they build for
// a valid input is a file in art/, and nothing a save or an agent could hold
// gets anything else into a path (no "..", no unknown names, no prototype keys).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as E from "../mods/idle-rpg/effects.js";
import * as R from "../mods/idle-rpg/rules.js";
import { artFiles } from "./harness/world.mjs";

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
  test("an unknown kind or part is null", () => {
    for (const h of HOSTILE) {
      assert.equal(R.monsterArt(h, "idle"), null);
      if (h !== undefined) assert.equal(R.monsterArt("dragon", h), null, String(h));
      assert.ok(safe(R.attackPart(h, "single", "pose")) || R.attackPart(h, "single", "pose") === null);
      assert.equal(R.attackPart("ogre", "single", h), null);
      // any side but "l" is "r", never what was passed
      assert.equal(R.attackPart("slime", "single", "pose", h), "attack/spit/r");
    }
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
    for (const bad of ["é", "ß", "ı", "#", "..", "", "AB"]) assert.equal(R.letterArt("white", bad), null, bad);
    for (const h of HOSTILE) {
      assert.equal(R.letterArt(h, "A"), null);
      assert.equal(R.letterArt("white", h), null);
    }
    assert.equal(R.letterable("Time's up!"), true);
    assert.equal(R.letterable("50%"), false);
    assert.equal(R.letterable(null), false);
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
