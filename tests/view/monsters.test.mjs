// The biomes' monsters: thirteen kinds, each fought in its biome (kindOf in
// rules.js), each drawn whole, breathing, blinking and attacking in its own
// pictures, its name on its plate; the monster's card (a press on the monster
// or its plate: its name, where it is fought, its HP, what it is weak to and
// resists, how many of its kind have fallen), and the codex listing all
// thirteen biome by biome.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BIOMES, KINDS, LABELS, LETTERS, MONSTER_ART, attackPart, biomeArt, bossHp, kindInfo, kindOf, letterFit, monsterArt, shortNumber } from "../../mods/idle-rpg/rules.js";
import { ELEMENT_STATUS, effectIconArt, markArt } from "../../mods/idle-rpg/effects.js";
import { pixels, pngSize } from "../harness/png.mjs";
import { agent, mountRaid, walk } from "../harness/view.mjs";
import { MONSTERS as LOOKS } from "../../tools/sim.mjs";

const THOROUGH = Boolean(process.env.HERDR_TESTS_THOROUGH);
const CARD = "idle-rpg-foe-card";
const HIT = "idle-rpg-monster-hit";
const OUTLINE = [0x14, 0x1a, 0x26]; // the generator's OUTLINE, round every monster
// the first stage each kind is fought at
const FIRST = Object.fromEntries(KINDS.map((k) => [k, Array.from({ length: 40 }, (_, i) => i + 1).find((s) => kindOf(s) === k)]));
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const inside = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
// the card's box: its own size, set on it (the harness reads absolute boxes)
const cardBox = (v) => v.box(CARD);
const nobody = () => ["t1", "t2"].map((t) => agent(t, "idle"));

describe("each kind in its biome", () => {
  test("each kind is fought at its own stages, its picture drawn and its name on the plate", async () => {
    for (const k of KINDS) {
      const v = await mountRaid({ stage: FIRST[k], status: "idle" });
      assert.equal(v.view.monster.kind, k);
      assert.ok(v.images(`idle-rpg-monster-${v.view.monster.id}`).some((p) => p.includes(`/monsters/${k}/`)), k);
      assert.deepEqual(v.text("idle-rpg-plate")[0], kindInfo(k).name.toUpperCase());
    }
  });
  test("every name letters whole (only LETTERS) and fits its plate beside the widest HP", async () => {
    for (const k of KINDS) {
      const name = kindInfo(k).name;
      assert.equal(letterFit(name), name.toUpperCase(), k);
      for (const ch of letterFit(LABELS.slain(name))) assert.ok(LETTERS.includes(ch), `${k}: ${ch}`);
      const v = await mountRaid({ stage: FIRST[k], status: "idle" });
      v.view.monster.maxHp = v.view.monster.hp = 9.94e99;
      v.setAgents([...v.world.agents]);
      const plate = v.box("idle-rpg-plate");
      const [nm, hp] = v.runs("idle-rpg-plate").map((r) => v.box(r.el));
      assert.ok(nm.x + nm.w + 8 <= hp.x && hp.x + hp.w <= plate.x + plate.w - 8, `${k}: ${JSON.stringify([nm, hp, plate])}`);
    }
  });
  test("each kind breathes, blinks, attacks one and attacks an area in its own pictures, each at its shape", async () => {
    for (const k of KINDS) {
      const v = await mountRaid({ classes: ["warrior", "archer", "wizard"], stage: FIRST[k], level: 40, health: 40 });
      const seen = new Set();
      v.until((h) => {
        for (const p of h.images()) if (p.includes(`/monsters/${k}/`)) seen.add(p.slice(p.indexOf(`/monsters/${k}/`) + `/monsters/${k}/`.length).replace(/\.png$/, ""));
        return ["single", "area"].every((t) => ["pose", "hit"].every((piece) => seen.has(attackPart(k, t, piece, "l")) || seen.has(attackPart(k, t, piece, "r"))));
      }, 120000);
      assert.ok(seen.has("top"), `${k}: its breathing piece`); // (its blink is in art.test.mjs's sweep)
      for (const t of ["single", "area"]) {
        const shot = attackPart(k, t, "shot", "l");
        if (shot) assert.ok(seen.has(shot) || seen.has(attackPart(k, t, "shot", "r")), `${k}: its ${t} shot`);
      }
    }
  });
  test("the regular kinds are smaller than their biome's boss", () => {
    for (const b of BIOMES) {
      const boss = pngSize(monsterArt(b.kinds[b.kinds.length - 1].id));
      for (const { id } of b.kinds.slice(0, -1)) {
        const s = pngSize(monsterArt(id));
        assert.ok(s.w <= boss.w && s.h <= boss.h && s.w * s.h < boss.w * boss.h, `${id} ${s.w}x${s.h} against ${boss.w}x${boss.h}`);
      }
    }
  });
  test("every kind reads on its biome's ground: outlined like the characters, its body's colours standing off the ground's", () => {
    // CIELAB (D65), and the distance between two colours in it (CIE76)
    const lab = ([r, g, b]) => {
      const f = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
      const [R, G, B] = [f(r), f(g), f(b)];
      const t = (v) => (v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116);
      const [x, y, z] = [(R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047, R * 0.2126 + G * 0.7152 + B * 0.0722, (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883];
      return [116 * t(y) - 16, 500 * (t(x) - t(y)), 200 * (t(y) - t(z))];
    };
    const apart = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    const groundOf = (file) => {
      const { w, h, rgba } = pixels(file);
      const sum = [0, 0, 0];
      for (let i = 0; i < w * h; i++) for (let c = 0; c < 3; c++) sum[c] += rgba[i * 4 + c];
      return lab(sum.map((x) => x / (w * h)));
    };
    for (const k of KINDS) {
      const file = monsterArt(k);
      const { w, h, rgba } = pixels(file);
      const px = (x, y) => [0, 1, 2].map((c) => rgba[(y * w + x) * 4 + c]);
      const at = (x, y) => (x < 0 || y < 0 || x >= w || y >= h ? 0 : rgba[(y * w + x) * 4 + 3]);
      const ground = groundOf(biomeArt(kindInfo(k).biome, "ground"));
      let body = 0;
      let off = 0;
      for (let y = 0; y < h; y++)
        for (let x = 0; x < w; x++) {
          if (!at(x, y)) continue;
          // every visible pixel next to a see-through one (a whole art px, 8 image px, away) is the outline
          if (!(at(x - 8, y) && at(x + 8, y) && at(x, y - 8) && at(x, y + 8))) assert.deepEqual(px(x, y), OUTLINE, `${k}: its edge at ${x},${y}`);
          if (px(x, y).join() === OUTLINE.join()) continue;
          body += 1;
          if (apart(lab(px(x, y)), ground) >= FAR) off += 1;
        }
      assert.ok(off / body >= 0.9, `${k}: ${Math.round((100 * off) / body)}% of its body stands off the ${kindInfo(k).biome}'s ground`);
    }
  });
});
// The outline (4.5:1 or more against every ground, biomes.test.mjs) draws a
// kind's shape; inside it, at least 90% of its body's pixels are this far from
// the ground's average colour in CIELAB (a plainly different colour), so the
// body does not melt into the ground. (Brightness alone would fail the slime,
// blue on the forest's green at the same brightness, which reads at a glance.)
const FAR = 20;

describe("the monster's card", () => {
  test("a press on the monster or its plate opens it; another closes it", async () => {
    const v = await mountRaid({ stage: 3, status: "idle" });
    for (const id of [HIT, "idle-rpg-plate"]) {
      assert.ok(!v.has(CARD));
      v.click(id);
      assert.ok(v.has(CARD), `opened from ${id}`);
      v.click(id);
      assert.ok(!v.has(CARD), `closed from ${id}`);
    }
    v.click(HIT);
    v.click("idle-rpg-plate");
    assert.ok(!v.has(CARD), "the plate closes what the monster opened");
  });
  test("a press on the monster neither walks you there nor reaches the floor; beside it you walk", async () => {
    const v = await mountRaid({ stage: 3, status: "idle", you: "warrior" });
    const you = { ...v.view.you };
    v.click(HIT);
    assert.deepEqual(v.view.you, you);
    assert.equal(v.saves.length, 0, "nothing saved");
    v.clickFloor(200, 100);
    assert.ok(!v.has(CARD), "the floor closes it");
    assert.notDeepEqual(v.view.you, you);
  });
  test("what it says, for every kind: name, biome and stage, HP, its weakness and resistance with their marks, its kills", async () => {
    for (const k of KINDS) {
      const info = kindInfo(k);
      const stage = FIRST[k];
      const v = await mountRaid({ stage, status: "idle" });
      v.view.progress.kills[k] = 1234;
      v.click(HIT);
      const max = shortNumber(Math.ceil(bossHp(stage)));
      assert.deepEqual(v.text(CARD), [
        info.name.toUpperCase(),
        `${LABELS[info.biome].toUpperCase()} · STAGE ${stage}`,
        `HP ${max}/${max}`,
        "WEAK",
        LABELS[info.weak].toUpperCase(),
        "RESISTS",
        LABELS[info.resist].toUpperCase(),
        "SLAIN 1.2K",
      ]);
      const pics = (id) => v.images(id).map((p) => p.replace("mods/idle-rpg/art/", "")).filter((p) => !p.startsWith("lettering/"));
      assert.deepEqual(pics("idle-rpg-foe-card-weak"), [effectIconArt(ELEMENT_STATUS[info.weak]), markArt("weak")], k);
      assert.deepEqual(pics("idle-rpg-foe-card-resist"), [effectIconArt(ELEMENT_STATUS[info.resist]), markArt("resist")], k);
      assert.ok(pics(CARD).includes(monsterArt(k)), `${k}: its picture`);
      assert.deepEqual(v.runs(CARD).map((r) => r.colours[0]), ["gold", "grey", "white", "grey", "white", "grey", "white", "white"]);
      for (const r of v.runs(CARD)) assert.ok(inside(v.box(r.el), cardBox(v)) || r.el.parent?.style.absolute, `${k}: ${r.text} inside`);
    }
  });
  test("its HP follows the fight; a slain monster's card shows 0 until the next of its kind", async () => {
    const v = await mountRaid({ stage: 3, settings: { advance: false } });
    v.click(HIT);
    v.until((h) => h.view.monster.hp < h.view.monster.maxHp, 60000);
    v.advance(250);
    const max = shortNumber(Math.ceil(bossHp(3)));
    assert.equal(v.text(CARD)[2], `HP ${shortNumber(Math.ceil(v.view.monster.hp))}/${max}`);
    v.view.monster.hp = 1;
    v.until((h) => h.view.monster.hp <= 0, 60000);
    assert.equal(v.text(CARD)[2], `HP 0/${max}`);
    assert.equal(v.text(CARD)[7], `SLAIN ${v.view.progress.kills.goblin}`);
    v.until((h) => h.view.monster.hp > 0, 10000);
    assert.ok(v.has(CARD), "the next goblin keeps it open");
    assert.equal(v.text(CARD)[2], `HP ${max}/${max}`);
  });
  test("closes when a monster of another kind comes in, on the raid's end, on a narrow scene and on a frame", async () => {
    const v = await mountRaid({ stage: 5, best: 12, status: "idle" });
    v.click(HIT);
    v.click("idle-rpg-stage-prev"); // stage 4: a goblin still
    assert.equal(v.view.monster.kind, "goblin");
    assert.ok(v.has(CARD));
    v.click("idle-rpg-stage-next");
    v.click("idle-rpg-stage-next"); // stage 6: a lizard
    assert.equal(v.view.monster.kind, "lizard");
    assert.ok(!v.has(CARD), "another kind");
    v.click(HIT);
    assert.ok(v.has(CARD));
    v.click("idle-rpg-battle-toggle");
    assert.ok(!v.has(CARD), "the raid ended");
    v.click("idle-rpg-battle-toggle");
    assert.ok(!v.has(CARD), "and stays closed");
    v.click(HIT);
    v.resize(639, 360);
    assert.ok(!v.has(CARD), "too narrow for the fight");
    v.resize(1280, 360);
    assert.ok(!v.has(CARD), "and stays closed");
    v.click(HIT);
    v.click("idle-rpg-sign");
    assert.ok(!v.has(CARD), "a press on a frame");
  });
  test("one card or panel at a time: it closes them, and each closes it", async () => {
    const v = await mountRaid({ stage: 3, gold: 50, slain: 1, level: 3, classes: ["warrior", "archer"] });
    const openers = [
      ["idle-rpg-slain", "idle-rpg-codex"],
      ["idle-rpg-gold", "idle-rpg-shop"],
      ["idle-rpg-points", "idle-rpg-skills"],
      ["idle-rpg-gear", "idle-rpg-settings"],
      ["idle-rpg-map", "idle-rpg-map-card"],
      ["critter-t2", "idle-rpg-card"],
      ["idle-rpg-you", "idle-rpg-card"],
    ];
    for (const [chip, panel] of openers) {
      v.click(chip);
      assert.ok(v.has(panel), panel);
      v.click(HIT);
      assert.ok(v.has(CARD) && !v.has(panel), `the card closes ${panel}`);
      v.click(chip);
      assert.ok(v.has(panel) && !v.has(CARD), `${panel} closes the card`);
      v.click(chip);
      if (v.has(panel)) v.clickFloor(600, 120);
    }
  });
  test("fits the lowest raid scene (640x230) and every supported size, never within 4px of the strip, the sign, the stage section or the plate", async () => {
    const widths = THOROUGH ? Array.from({ length: 280 }, (_, i) => 640 + 16 * i) : [640, 660, 700, 800, 1024, 1280, 1920, 2560, 5120];
    const heights = THOROUGH ? Array.from({ length: 34 }, (_, i) => 230 + 10 * i) : [230, 296, 360, 560];
    // the widest card: the longest name, far in, with every status in the strip (its widest)
    const found = [];
    for (const [stage, best] of [[1000, 1000], [34, 40], [3, 3]])
      for (const inset of [0, 84, 120]) {
        const v = await mountRaid(
          { stage, best, classes: ["warrior", "archer", "wizard", "healer"], statuses: ["working", "blocked", "done", "idle"], gold: 1e15, slain: 1e15 },
          { inset },
        );
        v.view.progress.kills[v.view.monster.kind] = 1e15;
        v.click(HIT);
        for (const h of heights)
          for (const w of widths) {
            v.resize(w, h);
            assert.ok(v.has(CARD), `${w}x${h}`);
            const b = cardBox(v);
            assert.equal(b.h, 124);
            assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= w && b.y + b.h <= h, `stage ${stage}, inset ${inset}, ${w}x${h}: ${JSON.stringify(b)}`);
            for (const frame of ["idle-rpg-hud", "idle-rpg-sign", "idle-rpg-stage", "idle-rpg-plate"]) {
              const f = v.box(frame);
              if (overlap(b, { x: f.x - 4, y: f.y - 4, w: f.w + 8, h: f.h + 8 })) found.push(`${frame} at ${w}x${h}, inset ${inset}, stage ${stage}`);
            }
          }
      }
    assert.deepEqual(found, [], "the card within 4px of a frame or the plate");
  });
  test("under the pointer, the monster and its plate show they can be pressed: a pointer, a white outline, an arrow", async () => {
    const v = await mountRaid({ stage: 3, status: "idle" }, { height: 560 });
    for (const id of [HIT, "idle-rpg-plate"]) assert.equal(v.get(id).style.cursor_pointer, true, id);
    const outlined = () => v.get("idle-rpg-plate").kids.filter((k) => k.style.bg === "#ffffff").length;
    assert.equal(outlined(), 0);
    assert.ok(!v.has("idle-rpg-plate-arrow"));
    for (const id of [HIT, "idle-rpg-plate"]) {
      v.hover(id);
      assert.equal(outlined(), 4, id);
      assert.ok(v.has("idle-rpg-plate-arrow"), id);
      assert.ok(v.box("idle-rpg-plate-arrow").y + 20 <= v.box("idle-rpg-plate").y, "over the plate");
      v.hover(id, false);
      assert.equal(outlined(), 0, id);
      assert.ok(!v.has("idle-rpg-plate-arrow"));
    }
    // in a low scene, where the plate is pushed down under the frames, no arrow over it
    v.resize(640, 230);
    v.hover(HIT);
    assert.equal(outlined(), 4);
    if (v.has("idle-rpg-plate-arrow")) assert.ok(v.box("idle-rpg-plate-arrow").y >= 0);
  });
});

describe("the monster as a press target", () => {
  test("its body's target is the drawn part of its picture within its bulk, not the picture's empty margins", async () => {
    for (const k of KINDS) {
      const v = await mountRaid({ stage: FIRST[k], status: "idle" });
      const pic = v.box(`idle-rpg-monster-${v.view.monster.id}`);
      const hit = v.box(HIT);
      // measured again from its picture: the opaque pixels in the bulk's columns
      const { w, h, rgba } = pixels(monsterArt(k));
      const look = LOOKS[k];
      const s = w / pic.w;
      const c0 = Math.round(pic.w / 2 + look.core.x - look.core.half);
      let [l, r, t, b] = [Infinity, -1, Infinity, -1];
      for (let y = 0; y < h; y++)
        for (let x = Math.max(0, Math.floor(c0 * s)); x < Math.min(w, Math.ceil((c0 + 2 * look.core.half) * s)); x++)
          if (rgba[(y * w + x) * 4 + 3]) [l, r, t, b] = [Math.min(l, x), Math.max(r, x), Math.min(t, y), Math.max(b, y)];
      const want = { x: pic.x + Math.floor(l / s), y: pic.y + Math.floor(t / s), w: Math.ceil((r + 1) / s) - Math.floor(l / s), h: Math.ceil((b + 1) / s) - Math.floor(t / s) };
      assert.deepEqual(hit, want, k);
      assert.ok(hit.w <= 2 * look.core.half && inside(hit, pic), k);
    }
  });
  test("drawn under everyone: a press on you or an agent standing over the monster is theirs", async () => {
    const v = await mountRaid({ stage: 3, classes: ["warrior", "archer"], you: "healer", youAt: { x: 640, y: 60 } });
    v.advance(1000);
    const order = [...walk(v.tree)].filter((n) => n.key).map((n) => n.key);
    for (const id of ["idle-rpg-you", "critter-t1", "critter-t2", `idle-rpg-monster-${v.view.monster.id}`]) assert.ok(order.indexOf(HIT) < order.indexOf(id), `under ${id}`);
    const hit = v.box(HIT);
    const body = { x: 640, y: v.size.height - 152 + 60 - 30 }; // your middle: 30px over your feet, at floor y 60
    assert.ok(body.x >= hit.x && body.x <= hit.x + hit.w && body.y >= hit.y && body.y <= hit.y + hit.h, `you stand over its body: ${JSON.stringify([hit, body])}`);
    // as the app delivers it: you (drawn over it) first, then its body, then the floor
    v.pressStack(["idle-rpg-you", HIT]);
    v.release();
    assert.equal(v.view.card, "you", "your card");
    assert.ok(!v.has(CARD));
    v.pressStack(["critter-t1", HIT]);
    v.release();
    assert.equal(v.view.card, "t1", "the agent's card");
    assert.ok(!v.has(CARD));
    v.click(HIT);
    assert.ok(v.has(CARD) && v.view.card === null, "its own body still opens it");
  });
  test("the plate's light goes when the monster under the pointer falls, and with the next boss", async () => {
    const v = await mountRaid({ stage: 3, settings: { advance: false } }, { height: 560 });
    const outlined = () => v.get("idle-rpg-plate").kids.filter((k) => k.style.bg === "#ffffff").length;
    v.hover(HIT);
    assert.equal(outlined(), 4);
    v.view.monster.hp = 1;
    v.until((h) => h.view.monster.hp <= 0, 60000); // its body's target goes, with no leave
    assert.ok(!v.has(HIT));
    assert.equal(outlined(), 0, "not on the slain plate");
    assert.ok(!v.has("idle-rpg-plate-arrow"));
    v.until((h) => h.view.monster.hp > 0, 10000);
    assert.equal(outlined(), 0, "nor on the next boss's");
    // the plate under the pointer as the next boss comes: forgotten too
    v.hover("idle-rpg-plate");
    assert.equal(outlined(), 4);
    v.view.monster.hp = 1;
    v.until((h) => h.view.monster.hp <= 0, 60000);
    assert.equal(outlined(), 4, "still under the pointer while it lies there");
    v.until((h) => h.view.monster.hp > 0, 10000);
    assert.equal(outlined(), 0, "a new boss: no light until the pointer comes again");
  });
});

describe("the codex, with thirteen kinds", () => {
  test("biome by biome; a kind never slain is ???; the kills from before the codex keep their line", async () => {
    const v = await mountRaid({ stage: 3, slain: 20, classes: ["warrior"] });
    Object.assign(v.view.progress.kills, { goblin: 4, slime: 1, "chief-ogre": 2, demon: 3 });
    v.click("idle-rpg-slain");
    assert.deepEqual(v.text("idle-rpg-codex"), [
      "Codex", "×",
      "Forest", "Goblin", "4", "???", "0", "Slime", "1",
      "Hills", "???", "0", "???", "0", "Chief Ogre", "2",
      "Caves", "???", "0", "???", "0", "???", "0",
      "Hell", "???", "0", "???", "0", "???", "0", "Demon", "3",
      "Before the codex", "10",
    ]); // prettier-ignore
    for (const k of KINDS) {
      const row = v.get(`idle-rpg-codex-kind-${k}`);
      assert.ok(v.images(`idle-rpg-codex-kind-${k}`)[0].endsWith(monsterArt(k)), k);
      assert.equal(row.kids[0].kids[0].style.opacity, v.view.progress.kills[k] > 0 ? 1 : 0.25, k);
    }
  });
  test("its rows are of fixed height, its list scrolling under the title, so it is never taller than the shop", async () => {
    const v = await mountRaid({ stage: 3, slain: 5 });
    v.click("idle-rpg-slain");
    const card = v.get("idle-rpg-codex");
    const list = v.get("idle-rpg-codex-list");
    assert.equal(list.style.overflow_y_scroll, true);
    const rows = list.kids;
    assert.equal(rows.length, BIOMES.length + KINDS.length + 1, "and the line for the kills from before the codex");
    let full = 0;
    for (const r of rows) {
      assert.equal(r.style.flex_none, true);
      full += r.style.h + list.style.gap;
    }
    assert.ok(full > list.style.max_h, "more than fits: it scrolls");
    const height = 2 * (1 + card.style.p) + v.get("idle-rpg-codex").kids[0].style.h + card.style.gap + list.style.max_h;
    assert.equal(height, 167, "the shop's height, the tallest panel's (ending at 221 in the lowest scene)");
    v.resize(640, 230);
    assert.ok(v.box("idle-rpg-codex").y + height <= 230);
  });
});

describe("pictures", () => {
  test("every kind's pictures are there (MONSTER_ART), the codex's fitted to its shape", () => {
    for (const k of KINDS) for (const part of MONSTER_ART[k]) assert.ok(pngSize(monsterArt(k, part)).w > 0, `${k} ${part}`);
  });
});
