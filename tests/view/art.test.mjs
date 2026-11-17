// Every picture any render asks for is in art/ (the harness fails a render
// that asks for one that is not), across a broad sweep of states: the town by
// day and night at many widths, each boss in each state (blinking, roaring,
// attacking either way, slain), every class in every colourway, weapon and
// hat in every pose, every weapon's attack and effects, numbers of every size
// in every colour, every panel, and the town in each season. Then: nearly
// every file in art/ is drawn by one of those states; the few that are not
// are listed below, with why.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BIOMES, BIOME_ART, CLASSES, ELLIPSIS, KINDS, LETTERS, SEASON_ART, UNKNOWN, biomeArt, catalogue, kindOf, letterArt, seasonArt } from "../../mods/idle-rpg/rules.js";
// the first stage each kind is fought at
const FIRST = KINDS.map((k) => Array.from({ length: 40 }, (_, i) => i + 1).find((s) => kindOf(s) === k));
import { agent, mountRaid, mountView, raid } from "../harness/view.mjs";
import { artFiles } from "../harness/world.mjs";

const THOROUGH = Boolean(process.env.HERDR_TESTS_THOROUGH);
const drawn = new Set();
const keep = (v) => {
  for (const p of v.world.images) drawn.add(p.replace("mods/idle-rpg/art/", ""));
};
const has = (prefix) => [...drawn].some((p) => p.startsWith(prefix));

// Pictures no state draws, by folder, with why. Kept exact: a picture that
// starts being drawn must come off this list, and a new one never drawn must go on it.
const UNDRAWN = {
  // the HUD letters only its labels and numbers (LABELS, shortNumber,
  // clockText), so only some characters in each colour are ever drawn; the
  // lettering has every character in every colour (CI checks they exist)
  // (what is left out, per colour, is UNDRAWN_LETTERING below)
  // the pixel font likewise: "+" is drawn only in white (the "99+" badge), "!" only in gold (a crit)
  "font/gold/plus.png": "no gold number has a plus",
  "font/ember/plus.png": "nor a burn number",
  "font/venom/plus.png": "nor a venom number",
  "font/white/bang.png": "only a critical blow has a bang, in gold",
  "font/ember/bang.png": "damage over time never crits",
  "font/venom/bang.png": "damage over time never crits",
};

describe("every picture asked for is in art/", () => {
  test("the town, by day and night, at every width", async () => {
    const widths = THOROUGH ? Array.from({ length: 131 }, (_, i) => 320 + i * 16) : [320, 480, ...Array.from({ length: 24 }, (_, i) => 1056 + i * 32), 2400];
    for (const phase of [0.25, 0.5, 0.75]) {
      const { saved } = raid({ battle: false, gold: 5 });
      const v = await mountView({ saved, agents: ["working", "blocked", "done", "idle"].map((s, i) => agent(`t${i + 1}`, s)), phase });
      for (const w of widths) v.resize(w);
      v.resize(1280);
      for (const s of ["codex", "skills", "shop"]) v.hover(`idle-rpg-station-${s}`);
      keep(v);
    }
    // the campfire's light at each of its 24 places along a torch
    for (let i = 0; i < 24; i++) assert.ok(drawn.has(`light/fire-${i}.png`), `light/fire-${i}`);
  });

  test("the town's seasonal decorations, by day and night, at every width (the campfire at each of its places)", async () => {
    const widths = Array.from({ length: 163 }, (_, i) => 320 + i * 16);
    for (const [season, month] of [["halloween", 10], ["winter", 12]]) {
      for (const phase of [0.25, 0.75]) {
        const { saved } = raid({ battle: false });
        const v = await mountView({ saved, agents: [agent("t1", "idle")], phase, at: new Date(2026, month - 1, 15, 12).getTime() });
        for (const w of widths) {
          v.resize(w);
          keep(v);
        }
      }
      // all but its icon, the shop's (see "every panel")
      for (const part of SEASON_ART[season].filter((p) => p !== "icon")) assert.ok(drawn.has(seasonArt(season, part)), `${season} ${part}`);
    }
  });

  test("name tags with every character of the lettering, a long name and one it lacks", async () => {
    // a few characters a name, so none is cut off; then one cut (the ellipsis) and one with no letter (the box)
    const chars = [...LETTERS].filter((ch) => ch !== " " && ch !== ELLIPSIS && ch !== UNKNOWN);
    const names = [...Array.from({ length: Math.ceil(chars.length / 6) }, (_, i) => chars.slice(i * 6, i * 6 + 6).join("")), "a very long name indeed", "\u65e5\u672c"];
    const { saved } = raid({ battle: false, classes: [] });
    const v = await mountView({ saved, agents: names.map((n, i) => agent(`n${i}`, "idle", { space_name: n, tab_name: "" })) });
    keep(v);
    for (const ch of LETTERS) if (ch !== " ") assert.ok(drawn.has(letterArt("white", ch)), `white ${ch}`);
  });

  test("every class in every look, weapon and hat, in every pose", async () => {
    for (const cls of CLASSES) {
      const armours = catalogue(cls, "armour").map((it) => it.id);
      const weapons = catalogue(cls, "weapon").map((it) => it.id);
      const hats = catalogue(cls, "hat").map((it) => it.id);
      // each item at least once (in a diagonal), or every combination
      const combos = THOROUGH ? armours.flatMap((a) => weapons.flatMap((w) => hats.map((h) => [a, w, h]))) : armours.map((a, i) => [a, weapons[i], hats[i]]);
      for (const [a, w, h] of combos) {
        const o = { classes: [cls, cls], you: cls, youAt: { x: 600, y: 120 }, armours: { [cls]: a }, weapons: { [cls]: w }, hats: { [cls]: h }, gold: 100, slain: 1, level: 3 };
        // in town: standing, walking (you), dangling each way (an agent)
        const town = await mountRaid({ ...o, battle: false, status: "idle" });
        town.clickFloor(900, 60);
        town.advance(170);
        town.press("critter-t1");
        // swinging right (tilted left), then left (tilted right), then still (hanging straight)
        for (const x of [700, 760, 820, 600, 600, 600, 600, 600, 600, 600, 600, 600, 600]) town.move({ x, y: 250 });
        town.release({ x: 600, y: 250 });
        // the shop's previews and tabs, the card's portrait and the class picker
        town.click("idle-rpg-station-shop");
        for (const k of ["armour", "weapon", "hat"]) town.click(`idle-rpg-shop-kind-${k}`);
        town.click("idle-rpg-station-skills");
        town.click("idle-rpg-you");
        town.release("idle-rpg-you");
        town.click("idle-rpg-card-wrench");
        keep(town);
        // in the fight: each facing the boss from either side, winding up and striking, then knocked out
        const fight = await mountRaid({ ...o, health: 40 });
        const poses = cls === "healer" ? ["windup/l", "windup/r"] : ["windup/l", "windup/r", "strike/l", "strike/r"];
        const members = () => Object.keys(fight.view.party.members).length === 3;
        const fighting = ["windup/l", "windup/r", "strike/l", "strike/r"];
        const posed = () =>
          fighting.every((p) => drawn.has(`classes/${cls}/${a}/${p}.png`) && (h === "default" || drawn.has(`hats/${h}/${cls}/${p}.png`))) && poses.every((p) => drawn.has(`weapons/${cls}/${w}/${p}.png`));
        fight.until(() => (keep(fight), members() && posed()), 60000);
        for (const k of ["t1", "t2", "you"]) Object.assign(fight.view.party.members[k], { hp: 0, down: fight.view.clock + 120 });
        fight.advance(1000);
        keep(fight);
        for (const f of ["stand", "walk/l", "walk/r", "rag/c", "rag/l", "rag/r", "stance/l", "stance/r", "windup/l", "windup/r", "strike/l", "strike/r", "down/l", "down/r"]) {
          assert.ok(drawn.has(`classes/${cls}/${a}/${f}.png`), `${cls} ${a} ${f}`);
          if (h !== "default") assert.ok(drawn.has(`hats/${h}/${cls}/${f}.png`), `${h} on ${cls} ${f}`);
        }
      }
    }
  });

  test("each boss blinking, roaring, attacking either way, and slain", async () => {
    for (const stage of FIRST) {
      const v = await mountRaid({ classes: ["warrior", "warrior", "archer", "archer"], you: "wizard", stage, health: 40 });
      const kind = v.view.monster.kind;
      // all its pictures but the whole one ("idle") of the slimes and the dragon, whose fights show
      // their foot or body instead (the codex and the monster's card show every kind's)
      const want = artFiles().filter((p) => p.startsWith(`monsters/${kind}/`) && !(["slime", "magma-slime", "dragon"].includes(kind) && p.endsWith("/idle.png")));
      try {
        v.until(() => (keep(v), want.every((p) => drawn.has(p))), 300000, 1000);
      } catch {
        assert.fail(`${kind}: never drew ${want.filter((p) => !drawn.has(p)).join(", ")}`);
      }
      v.view.monster.hp = 1;
      v.until((h) => h.view.monster.hp <= 0, 30000);
      keep(v);
    }
  });

  test("every weapon's attack and effects, on each boss", async () => {
    const loadouts = [
      { warrior: "flame", archer: "frost", wizard: "storm", healer: "might" },
      { warrior: "axe", archer: "flame", wizard: "venom", healer: "hex" },
      { warrior: "hammer", archer: "crossbow", wizard: "frost", healer: "haste" },
      { warrior: "default", archer: "default", wizard: "default", healer: "default" },
    ];
    for (const weapons of loadouts)
      for (const stage of [10, 17, 30]) { // the slime, the ogre and the dragon
        // wizards and archers on both sides of the boss (the chain's arc leaps either way)
        const v = await mountRaid({ classes: ["wizard", "wizard", "archer", "archer", "warrior", "healer"], you: "healer", weapons, stage, level: 4, health: 30 });
        v.advance(40000);
        keep(v);
      }
    // and a Heal Vial healer with someone to heal
    const hurt = await mountRaid({ classes: ["warrior", "healer"], you: "archer", stage: 8 });
    hurt.until((h) => h.ids("idle-rpg-healed-").length > 0, 120000);
    keep(hurt);
    for (const m of ["weak", "resist"]) assert.ok(drawn.has(`effects/marks/${m}.png`), m);
    for (const s of ["burn", "chill", "venom", "chain"]) assert.ok(has(`effects/${s}/`), s);
  });

  test("numbers of every size, in every colour", async () => {
    // from 1-digit blows to powers of ten: damage grows with Attack training (1.12 a level)
    for (const attack of [0, 30, 60, 100, 160, 220, 300, 400, 1000]) {
      const v = await mountRaid({ classes: ["warrior", "wizard", "wizard"], you: "archer", weapons: { wizard: "venom", archer: "flame" }, skills: { warrior: { crit: 5 } }, level: 6, attack, stage: 1 + (attack % 3), health: 60 });
      v.view.monster.hp = v.view.monster.maxHp = 1e300; // a boss it cannot kill, to see many numbers
      v.advance(30000);
      keep(v);
    }
    for (const c of ["white", "gold", "ember", "venom"]) for (const d of "0123456789") assert.ok(drawn.has(`font/${c}/${d}.png`), `${c} ${d}`);
    for (const u of ["k", "m", "b", "t", "e", "point"]) assert.ok(drawn.has(`font/white/${u}.png`), u);
  });

  test("every biome's backdrop in a raid, and the stage picker showing every biome", async () => {
    for (const stage of [1, 11, 21, 31]) keep(await mountRaid({ stage, best: 45 }));
    const v = await mountRaid({ stage: 12, best: 45 });
    v.click("idle-rpg-map");
    keep(v);
    for (const b of BIOMES) for (const part of BIOME_ART[b.id]) assert.ok(drawn.has(biomeArt(b.id, part)), `${b.id} ${part}`);
    assert.ok(drawn.has("icons/map.png"));
  });

  test("every panel, card and HUD state", async () => {
    const { saved } = raid({ gold: 1234567, slain: 9, level: 9, stage: 3, best: 5, farming: true });
    saved.kills = Object.fromEntries(KINDS.map((k) => [k, 3]));
    const v = await mountView({ saved, agents: [...["blocked", "working", "done", "idle"].map((s, i) => agent(`t${i + 1}`, s)), ...Array.from({ length: 120 }, (_, i) => agent(`w${i}`, "working"))] });
    // the shop's town decor, each set's icon on its tile
    v.click("idle-rpg-gold");
    v.click("idle-rpg-shop-kind-decor");
    keep(v);
    for (const id of Object.keys(SEASON_ART)) assert.ok(drawn.has(seasonArt(id, "icon")), `${id}'s icon`);
    assert.ok(drawn.has("icons/decor.png"));
    v.click("idle-rpg-gold");
    for (const c of ["idle-rpg-slain", "idle-rpg-points", "idle-rpg-gold", "idle-rpg-gear"]) v.click(c);
    v.click("critter-t1");
    v.release("critter-t1");
    v.click("idle-rpg-stage-next");
    v.view.timesUp = { at: v.now, id: 3, text: "Time's up! Back to stage 2" };
    v.setAgents([...v.world.agents]);
    assert.ok(v.has("idle-rpg-timesup-3"));
    keep(v);
    // nobody working: the time stands still, "(PAUSED)" in grey
    v.setAgents(v.world.agents.map((a) => ({ ...a, status: "idle" })));
    assert.ok(v.has("idle-rpg-stage-paused"));
    keep(v);
    // the monster's card, and on it every element's icon (stages 3, 6, 20 and 26: weak to fire, frost, storm, poison)
    for (const stage of [3, 6, 20, 26]) {
      const m = await mountRaid({ stage, status: "idle" });
      m.click("idle-rpg-monster-hit");
      keep(m);
    }
    const empty = await mountView({ saved: raid({ battle: false }).saved, agents: [] });
    keep(empty);
  });
});

// The lettering's letters and signs the sweep never draws, per colour (by
// file name): those no label has in that colour. Exact, like UNDRAWN: change
// the sweep or a label, and this says what to update. (Digits are left out:
// which show depends on the stage and the time; every digit is drawn in white.)
// The signs for names (NAME_SIGNS) are drawn only in white, on the name tags.
const NAME_SIGNS = "and at backslash bar comma dot dquote ellipsis equals hash less lsquare more percent query rsquare semi star tilde under unknown";
const UNDRAWN_LETTERING = {
  white: "",
  gold: `close colon dash j k open plus point q quote slash u x ${NAME_SIGNS}`,
  // (the monster's card: "FOREST · STAGE 7", "WEAK", "RESISTS" in grey)
  grey: `bang j m plus point q quote slash x z ${NAME_SIGNS.replace("dot ", "")}`,
  red: `close colon d dash f h j l n open plus point q r slash v w x y z ${NAME_SIGNS}`,
  green: `b bang c close colon d dash e g h i j k l n o open p plus point q quote s slash t u v w x y z ${NAME_SIGNS}`,
};
const sorted = (list) => list.split(" ").filter(Boolean).sort().join(" ");

// The lettering's pictures no label or number draws: every character in
// every colour minus what the HUD sets in that colour.
function letteringUndrawn() {
  return artFiles().filter((p) => p.startsWith("lettering/") && !drawn.has(p));
}

describe("nearly every picture is drawn by some state", () => {
  test("all but the listed exceptions", () => {
    const listed = new Set(Object.keys(UNDRAWN).filter((k) => k.endsWith(".png")));
    const lettering = new Set(letteringUndrawn());
    const undrawn = artFiles().filter((p) => !drawn.has(p) && !p.startsWith("lettering/"));
    assert.deepEqual(undrawn.filter((p) => !listed.has(p)), [], "drawn by no state and not listed as an exception");
    assert.deepEqual([...listed].filter((p) => drawn.has(p)), [], "listed as never drawn, but drawn: take it off the list");
    // the lettering: exactly the listed characters are left out in each colour
    const name = (p) => p.split("/")[2].replace(".png", "");
    const left = Object.fromEntries(Object.keys(UNDRAWN_LETTERING).map((c) => [c, [...lettering].filter((p) => p.startsWith(`lettering/${c}/`) && !/^\d$/.test(name(p))).map(name).join(" ")]));
    assert.deepEqual(Object.fromEntries(Object.entries(left).map(([c, l]) => [c, sorted(l)])), Object.fromEntries(Object.entries(UNDRAWN_LETTERING).map(([c, l]) => [c, sorted(l)])));
    for (const d of "0123456789") assert.ok(drawn.has(`lettering/white/${d}.png`), `white ${d}`);
    const share = (artFiles().length - undrawn.length - lettering.size) / artFiles().length;
    assert.ok(share > 0.75, `${Math.round(share * 100)}% of art/ drawn`);
  });
});
