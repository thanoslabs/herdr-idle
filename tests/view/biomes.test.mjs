// Biomes and the stage picker. A raid takes place in its stage's biome
// (biomeOf in rules.js: forest, hills, caves, hell, ten stages each, round and
// round), the town always on the rampart; the backdrop follows the stage being
// fought however it changes (the arrows, advancing after a kill, dropping back
// after a time-out, the picker). Under the sky a biome keeps the day, the
// night and the night's darkness; under a roof neither, its own light instead.
// Every ground lets the characters' outline stand out. The picker (the map
// left of the gear) lists the biomes reached a page at a time and picks a
// stage exactly as the arrows step to one. (That each backdrop's tiles cover
// the scene at every size is in sizes.test.mjs, with the rampart's.)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { BIOMES, BIOME_ART, biomeArt, biomeOf, canSelectStage } from "../../mods/idle-rpg/rules.js";
import { pixels } from "../harness/png.mjs";
import { agent, mountRaid, mountView, raid, walk } from "../harness/view.mjs";

const THOROUGH = Boolean(process.env.HERDR_TESTS_THOROUGH);
const OUTLINE = "#141a26"; // the characters' outline (the generator's OUTLINE)

// Which backdrop is drawn: a biome's id, or "rampart", read from its ground's pictures.
function backdrop(v) {
  const found = new Set(
    v
      .all((n) => n.type === "image" && /\/scene\/(?:[a-z]+\/ground|floor)\.png$/.test(n.src))
      .map((n) => n.src.match(/\/scene\/(?:([a-z]+)\/ground|floor)\.png$/)[1] ?? "rampart"),
  );
  assert.equal(found.size, 1, `one ground: ${[...found]}`);
  return [...found][0];
}
const drawsArt = (v, art) => v.all((n) => n.type === "image" && n.src.endsWith(art)).length > 0;

describe("where a raid takes place", () => {
  test("in its stage's biome, ten stages each, round again after hell", async () => {
    const seen = {};
    for (const stage of [1, 10, 11, 20, 21, 30, 31, 40, 41, 50, 51, 999]) {
      const v = await mountRaid({ stage });
      seen[stage] = backdrop(v);
      assert.equal(seen[stage], biomeOf(stage), `stage ${stage}`);
    }
    assert.deepEqual(Object.values(seen), ["forest", "forest", "hills", "hills", "caves", "caves", "hell", "hell", "forest", "forest", "hills", "hell"]);
  });

  test("the town is always the rampart: its mountains, wall, planks, banners, torches, table and barrel", async () => {
    for (const stage of [1, 15, 25, 35, 45]) {
      const town = await mountRaid({ stage, battle: false });
      assert.equal(backdrop(town), "rampart", `town at stage ${stage}`);
      for (const art of ["scene/mountains.png", "scene/wall.png", "scene/banner.png", "scene/torch.png", "stations/table/idle.png", "scene/barrel.png"]) assert.ok(drawsArt(town, art), art);
      assert.ok(!town.all((n) => n.type === "image" && /\/scene\/(forest|hills|caves|hell)\//.test(n.src)).length, "nothing of a biome");
      // and ending a raid in a biome goes back to it
      const v = await mountRaid({ stage });
      v.click("idle-rpg-battle-toggle");
      assert.equal(backdrop(v), "rampart");
      v.click("idle-rpg-battle-toggle");
      assert.equal(backdrop(v), biomeOf(stage));
    }
  });

  test("a biome has none of the rampart: no wall, mountains, banners, torches, table or barrel", async () => {
    for (const stage of [1, 11, 21, 31]) {
      const v = await mountRaid({ stage });
      for (const art of ["scene/mountains.png", "scene/wall.png", "scene/floor.png", "scene/banner.png", "scene/torch.png", "stations/table/idle.png", "scene/barrel.png"]) assert.ok(!drawsArt(v, art), `${biomeOf(stage)}: ${art}`);
    }
  });

  test("under the sky (forest, hills): the day and night, and the night's darkness, plain (no torch or candle to pool light)", async () => {
    for (const stage of [1, 11]) {
      const v = await mountRaid({ stage }, { phase: 0.75 });
      for (const id of ["idle-rpg-day", "idle-rpg-stars", "idle-rpg-sun", "idle-rpg-moon", "idle-rpg-night-sky", "idle-rpg-gloom"]) assert.ok(v.has(id), `${stage}: ${id}`);
      assert.ok(!v.has("idle-rpg-vault"));
      assert.ok(v.get("idle-rpg-gloom").style.opacity > 0.9, "midnight is dark");
      const lights = new Set(v.images("idle-rpg-gloom").map((p) => p.replace(/.*\/light\//, "")));
      assert.deepEqual([...lights], ["fill.png"]);
    }
  });

  test("under a roof (caves, hell): no sky, sun, moon, clouds or stars, no darkness; its dark, its ceiling, and a steady light where the torches stood", async () => {
    for (const [stage, light] of [[21, "crystal"], [31, "vent"]]) {
      for (const phase of [0.25, 0.75]) {
        const v = await mountRaid({ stage }, { phase });
        for (const id of ["idle-rpg-day", "idle-rpg-stars", "idle-rpg-sun", "idle-rpg-moon", "idle-rpg-night-sky", "idle-rpg-gloom"]) assert.ok(!v.has(id), `${stage}: ${id}`);
        assert.equal(v.ids("idle-rpg-cloud-").length, 0, "no clouds");
        assert.ok(v.has("idle-rpg-vault"));
        const biome = biomeOf(stage);
        assert.ok(drawsArt(v, biomeArt(biome, "ceiling")));
        // one standing where each of the rampart's torches does
        const town = await mountRaid({ stage, battle: false });
        const centres = (h, art) => h.all((n) => n.type === "image" && n.src.endsWith(art)).map((el) => h.box(el).x + h.box(el).w / 2);
        assert.deepEqual(centres(v, biomeArt(biome, light)), centres(town, "scene/torch.png"));
        assert.equal(centres(v, biomeArt(biome, light)).length, 2, "two at 1280px");
      }
    }
  });

  test("every ground lets the characters' dark outline stand out as well as the planks do: 4.5:1 on average or more", () => {
    // the WCAG contrast of a ground's average colour against the outline
    const lum = (r, g, b) => [r, g, b].map((c) => (c / 255 <= 0.03928 ? c / 255 / 12.92 : ((c / 255 + 0.055) / 1.055) ** 2.4)).reduce((s, c, i) => s + c * [0.2126, 0.7152, 0.0722][i], 0);
    const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
    const outline = lum(...hex(OUTLINE));
    const average = (file) => {
      const { rgba } = pixels(file);
      let n = 0;
      let sum = 0;
      for (let i = 0; i < rgba.length; i += 4) if (rgba[i + 3] === 255) (sum += lum(rgba[i], rgba[i + 1], rgba[i + 2])), (n += 1);
      return sum / n;
    };
    const ratio = (file) => (average(file) + 0.05) / (outline + 0.05);
    const planks = ratio("scene/floor.png");
    for (const b of BIOMES) {
      const r = ratio(biomeArt(b.id, "ground"));
      assert.ok(r >= 4.5, `${b.id}: ${r.toFixed(2)}:1 (the planks are ${planks.toFixed(2)}:1)`);
    }
    assert.ok(planks >= 4.5);
  });
});

describe("the backdrop follows the stage", () => {
  test("the arrows: stage 10 to 11 is forest to hills, and back", async () => {
    const v = await mountRaid({ stage: 10, best: 25 });
    assert.equal(backdrop(v), "forest");
    v.click("idle-rpg-stage-next");
    assert.equal(backdrop(v), "hills");
    v.click("idle-rpg-stage-prev");
    assert.equal(backdrop(v), "forest");
  });

  test("advancing after a first clear: the forest until the stage 11 boss walks in, then the hills", async () => {
    const v = await mountRaid({ classes: ["warrior", "archer"], you: "wizard", stage: 10, best: 10, level: 20, health: 30 });
    v.view.monster.hp = 1;
    v.until((h) => h.view.monster.hp <= 0, 30000);
    const slain = v.view.monster;
    assert.equal(v.view.progress.stage, 11);
    assert.equal(backdrop(v), "forest", "still the forest while the stage 10 boss lies there");
    v.until((h) => h.view.monster.id !== slain.id, 8000);
    assert.equal(v.view.monster.stage, 11);
    assert.equal(backdrop(v), "hills");
  });

  test("dropping back after a time-out: stage 11 to 10 is the hills to the forest", async () => {
    const v = await mountRaid({ classes: ["warrior"], you: "healer", stage: 11, best: 11, health: 40 });
    assert.equal(backdrop(v), "hills");
    v.view.left = 1000;
    v.view.monster.hp = 1e12;
    v.until((h) => h.view.timesUp, 5000);
    assert.equal(v.view.progress.stage, 10);
    assert.equal(backdrop(v), "forest");
  });

  test("the picker: stage 5 to 21 is the forest to the caves", async () => {
    const v = await mountRaid({ stage: 5, best: 25 });
    v.click("idle-rpg-map");
    v.click("idle-rpg-map-biome-2");
    v.click("idle-rpg-map-stage-21");
    assert.equal(v.view.progress.stage, 21);
    assert.equal(backdrop(v), "caves");
  });
});

describe("the map in the strip", () => {
  test("left of the gear, the gear's size, 4px apart, in a raid only", async () => {
    for (const [W, statuses] of [[640, ["working"]], [800, ["blocked", "working", "done", "idle"]], [1280, ["working", "idle"]], [2400, []]]) {
      const { saved } = raid({});
      const v = await mountView({ saved, agents: statuses.map((s, i) => agent(`a${i}`, s)), width: W });
      const map = v.box("idle-rpg-map");
      const gear = v.box("idle-rpg-gear");
      const strip = v.box("idle-rpg-hud");
      assert.deepEqual([map.y, map.w, map.h], [gear.y, gear.w, gear.h], `at ${W}`);
      assert.equal(map.x + map.w + 4, gear.x, `at ${W}`);
      assert.ok(map.x >= strip.x && gear.x + gear.w <= strip.x + strip.w, "inside the strip");
      // every status icon left of it
      for (const id of v.ids("idle-rpg-status-")) assert.ok(v.box(id).x + v.box(id).w <= map.x, id);
      assert.ok(v.images("idle-rpg-map").some((p) => p.endsWith("icons/map.png")));
      assert.equal(v.get("idle-rpg-map").tip, "Stages");
      v.click("idle-rpg-battle-toggle");
      assert.ok(!v.has("idle-rpg-map"), "not in town");
    }
  });

  test("not while the scene is too narrow for the fight (under 640px)", async () => {
    const v = await mountRaid({}, { width: 600 });
    assert.ok(!v.has("idle-rpg-map"));
  });
});

const CARD = "idle-rpg-map-card";
const PANELS = ["idle-rpg-codex", "idle-rpg-skills", "idle-rpg-shop", "idle-rpg-settings", CARD];
const open = (v) => PANELS.filter((id) => v.has(id));

describe("opening and closing the picker", () => {
  test("the map opens it (sunk while open) and closes it again", async () => {
    const v = await mountRaid({ stage: 3, best: 7 });
    v.click("idle-rpg-map");
    assert.deepEqual(open(v), [CARD]);
    assert.equal(v.get("idle-rpg-map").style.border_color, "#141a26");
    v.click("idle-rpg-map");
    assert.deepEqual(open(v), []);
  });
  test("the gear's menu and the picker close each other, and so do the other panels", async () => {
    const v = await mountRaid({ stage: 3, best: 7, gold: 50, slain: 2, level: 3 });
    v.click("idle-rpg-map");
    v.click("idle-rpg-gear");
    assert.deepEqual(open(v), ["idle-rpg-settings"]);
    v.click("idle-rpg-map");
    assert.deepEqual(open(v), [CARD]);
    for (const chip of ["idle-rpg-slain", "idle-rpg-gold", "idle-rpg-points"]) {
      v.click(chip);
      assert.equal(open(v).length, 1, chip);
      assert.ok(!v.has(CARD), chip);
      v.click("idle-rpg-map");
      assert.deepEqual(open(v), [CARD], `the map after ${chip}`);
    }
    v.click("critter-t1");
    v.release("critter-t1");
    assert.ok(!v.has(CARD), "an agent's card closes it");
  });
  test("a pick closes it; a click inside it does not; the floor, a frame or ending the raid does", async () => {
    const v = await mountRaid({ stage: 3, best: 7 });
    v.click("idle-rpg-map");
    v.click(CARD);
    v.click("idle-rpg-map-stage-3"); // the stage being fought: nothing to do
    assert.deepEqual(open(v), [CARD]);
    v.click("idle-rpg-map-stage-5");
    assert.deepEqual(open(v), []);
    for (const close of [() => v.clickFloor(500, 100), () => v.click("idle-rpg-sign"), () => v.click("idle-rpg-battle-toggle")]) {
      v.click("idle-rpg-map");
      assert.deepEqual(open(v), [CARD]);
      close();
      assert.deepEqual(open(v), []);
    }
    assert.ok(!v.has("idle-rpg-map"), "in town");
  });
});

describe("what the picker shows", () => {
  test("its title, the page, each biome reached with its swatch, name and stages, and the open biome's stages", async () => {
    const v = await mountRaid({ stage: 13, best: 25 });
    v.click("idle-rpg-map");
    assert.deepEqual(v.text("idle-rpg-map-page"), ["STAGES 1-40"]);
    assert.deepEqual(v.ids("idle-rpg-map-biome-"), ["idle-rpg-map-biome-0", "idle-rpg-map-biome-1", "idle-rpg-map-biome-2"], "hell (31-40) not reached");
    assert.deepEqual(v.text("idle-rpg-map-biome-0"), ["FOREST", "1-10"]);
    assert.deepEqual(v.text("idle-rpg-map-biome-1"), ["HILLS", "11-20"]);
    assert.deepEqual(v.text("idle-rpg-map-biome-2"), ["CAVES", "21-30"]);
    for (let i = 0; i < 3; i++) assert.ok(v.images(`idle-rpg-map-biome-${i}`).some((p) => p.endsWith(`scene/${BIOMES[i].id}/swatch.png`)));
    assert.equal(v.runs("idle-rpg-map-biome-1")[0].colours[0], "gold", "the biome being fought in gold");
    assert.equal(v.runs("idle-rpg-map-biome-0")[0].colours[0], "white");
    assert.ok(v.text(CARD).includes("MAP"));
    // it opens on the stage's biome: the hills, stages 11 to 20, the current one gold and sunk
    assert.equal(v.get("idle-rpg-map-biome-1").style.border_color, "#141a26");
    assert.deepEqual(v.ids("idle-rpg-map-stage-"), Array.from({ length: 10 }, (_, i) => `idle-rpg-map-stage-${11 + i}`));
    assert.deepEqual(v.runs("idle-rpg-map-stage-13").map((r) => [r.text, r.colours[0]]), [["13", "gold"]]);
    assert.deepEqual(v.runs("idle-rpg-map-stage-12").map((r) => [r.text, r.colours[0]]), [["12", "white"]]);
    // a biome's row opens its stages
    v.click("idle-rpg-map-biome-2");
    assert.deepEqual(v.ids("idle-rpg-map-stage-"), Array.from({ length: 10 }, (_, i) => `idle-rpg-map-stage-${21 + i}`));
    assert.deepEqual(v.runs("idle-rpg-map-stage-26").map((r) => r.colours[0]), ["grey"], "past the best");
  });

  test("a stage can be picked exactly when the arrows' rule allows it (canSelectStage): reached, and not the one being fought", async () => {
    for (const [stage, best] of [[3, 7], [1, 1], [10, 10], [40, 95], [95, 95]]) {
      const v = await mountRaid({ stage, best });
      v.click("idle-rpg-map");
      while (v.get("idle-rpg-map-prev").handlers.click) v.click("idle-rpg-map-prev");
      // every page, every biome on it
      const pages = new Set();
      for (let turns = 0; turns < 5; turns++) {
        pages.add(v.text("idle-rpg-map-page")[0]);
        for (const biome of v.ids("idle-rpg-map-biome-")) {
          v.click(biome);
          for (const id of v.ids("idle-rpg-map-stage-")) {
            const s = Number(id.split("-").at(-1));
            const el = v.get(id);
            const live = canSelectStage(v.view.progress, s);
            assert.equal(Boolean(el.handlers.click), live, `stage ${s} of best ${best} at ${stage}`);
            if (!live) {
              v.click(id);
              assert.equal(v.view.progress.stage, stage, `a dead stage ${s} picks nothing`);
              assert.ok(v.has(CARD));
            }
          }
        }
        if (!v.get("idle-rpg-map-next").handlers.click) break;
        v.click("idle-rpg-map-next");
      }
      assert.equal(pages.size, Math.ceil(best / 40), `pages for best ${best}`);
      assert.ok(!v.get("idle-rpg-map-next").handlers.click, "no page past the last reached");
    }
  });

  test("picking a stage does what the arrow to it does: a fresh attempt, farming over, saved", async () => {
    // (one view at a time: the harness's Herdr, its saves among them, is one world)
    const play = async (dir, pick) => {
      const v = await mountRaid({ stage: 6, best: 9, farming: true, gold: 30 });
      v.advance(7000);
      const saves = v.saves.length;
      if (pick) {
        v.click("idle-rpg-map");
        v.click(`idle-rpg-map-stage-${dir === "next" ? 7 : 5}`);
      } else v.click(`idle-rpg-stage-${dir}`);
      const state = () => JSON.parse(JSON.stringify({ progress: v.view.progress, monster: v.view.monster, left: v.view.left, party: v.view.party, stored: v.stored, saved: v.saves.length - saves }));
      const now = state();
      v.advance(15000); // and the fight goes on the same afterwards
      return [now, state()];
    };
    for (const dir of ["next", "prev"]) {
      const arrows = await play(dir, false);
      const picker = await play(dir, true);
      assert.deepEqual(picker, arrows, dir);
      assert.deepEqual([picker[0].progress.stage, picker[0].progress.farming, picker[0].saved], [dir === "next" ? 7 : 5, false, 1]);
    }
  });

  test("pages of 40 stages (a round of the biomes): the arrows turn them, dead past the first and the last reached", async () => {
    const v = await mountRaid({ stage: 50, best: 95 });
    v.click("idle-rpg-map");
    assert.deepEqual(v.text("idle-rpg-map-page"), ["STAGES 41-80"]);
    assert.deepEqual(v.ids("idle-rpg-map-stage-")[0], "idle-rpg-map-stage-41", "on stage 50's biome, the forest again");
    v.click("idle-rpg-map-next");
    assert.deepEqual(v.text("idle-rpg-map-page"), ["STAGES 81-120"]);
    assert.deepEqual(v.ids("idle-rpg-map-biome-").map((id) => v.text(id)), [["FOREST", "81-90"], ["HILLS", "91-100"]]);
    assert.equal(v.get("idle-rpg-map-next").style.opacity, 0.3);
    v.click("idle-rpg-map-prev");
    v.click("idle-rpg-map-prev");
    assert.deepEqual(v.text("idle-rpg-map-page"), ["STAGES 1-40"]);
    assert.ok(!v.get("idle-rpg-map-prev").handlers.click);
    v.click("idle-rpg-map-biome-3");
    v.click("idle-rpg-map-stage-35");
    assert.equal(v.view.progress.stage, 35);
    v.click("idle-rpg-map");
    assert.deepEqual(v.text("idle-rpg-map-page"), ["STAGES 1-40"], "it opens on the page of the stage fought");
  });

  test("with a best stage in the thousands it holds no more than with a few: one page, ten stages", async () => {
    const count = async (stage, best) => {
      const v = await mountRaid({ stage: Math.min(stage, 1000), best: Math.min(best, 1000) });
      Object.assign(v.view.progress, { stage, best }); // past what a save keeps (MAX_STAGE), to be sure
      v.click("idle-rpg-map");
      const n = [...walk(v.get(CARD))].length;
      return { v, n };
    };
    // (only the numbers' digits, each a picture, make one page larger than another)
    const few = await count(12, 45);
    const many = await count(4321, 5000);
    assert.ok(few.n < 250 && many.n < 320, `${few.n} and ${many.n} elements`);
    assert.equal(many.v.ids("idle-rpg-map-stage-").length, 10);
    assert.deepEqual(many.v.text("idle-rpg-map-page"), ["STAGES 4321-4360"]);
    for (let i = 0; i < 20; i++) many.v.click("idle-rpg-map-next");
    assert.deepEqual(many.v.text("idle-rpg-map-page"), ["STAGES 4961-5000"]);
    assert.ok(!many.v.get("idle-rpg-map-next").handlers.click);
  });

  test("it stays inside the scene, at every size the fight shows", async () => {
    const widths = THOROUGH ? Array.from({ length: 141 }, (_, i) => 640 + i * 32) : [640, 700, 800, 1024, 1280, 1920, 3456];
    const heights = THOROUGH ? Array.from({ length: 34 }, (_, i) => 230 + i * 10) : [230, 296, 360, 560];
    const problems = [];
    for (const [stage, best, statuses] of [[12, 45, ["working"]], [999, 1000, ["blocked", "working", "done", "idle"]]]) {
      const { saved } = raid({ stage, best });
      const v = await mountView({ saved, agents: statuses.map((s, i) => agent(`a${i}`, s)) });
      for (const h of heights)
        for (const w of widths) {
          v.resize(w, h);
          if (!v.has(CARD)) v.click("idle-rpg-map");
          const b = v.box(CARD);
          if (b.x < 0 || b.y < 0 || b.x + b.w > w || b.y + b.h > h) problems.push(`${w}x${h} best ${best}: ${JSON.stringify(b)}`);
          for (const id of v.ids("idle-rpg-map-")) {
            if (id === CARD || id === "idle-rpg-map") continue;
            const k = v.box(id);
            if (k.x < b.x || k.x + k.w > b.x + b.w || k.y < b.y || k.y + k.h > b.y + b.h) problems.push(`${id} outside the card at ${w}x${h}`);
          }
        }
    }
    assert.deepEqual(problems.slice(0, 5), []);
  });
});

describe("the picker's pictures", () => {
  test("every biome's swatch and the map exist (the harness checks every picture drawn) and art/ has each biome's backdrop", async () => {
    const v = await mountRaid({ stage: 33, best: 40 });
    v.click("idle-rpg-map");
    const drawn = v.images(CARD).map((p) => p.replace(/.*\/art\//, ""));
    for (const b of BIOMES) assert.ok(drawn.includes(biomeArt(b.id, "swatch")), b.id);
    assert.ok(drawn.includes("icons/map.png"));
    for (const b of BIOMES) for (const part of BIOME_ART[b.id]) assert.ok(biomeArt(b.id, part));
  });
});
