// The scene at every size Herdr gives it: widths 320 to 5,120, heights 230 to
// 560 (a third of the window, clamped; the floor is FLOOR_H 152 and the wall
// takes the rest). The view learns both from on_size_change (which sets
// this.size and this.wallH together, so a resize with no pointer event leaves
// nothing stale; pointer events recompute wallH from their bounds, the same
// number). For each size: the night's darkness (gloom) and the scenery cover
// the whole width, and what is drawn (the visible pixels of the stations,
// campfire and boss; the plate, frames, panels and cards) stays inside.
//
// Where today's layout breaks, the correct behaviour is asserted as a todo
// with the sizes and pixels it breaks by (see tests/README.md).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { CLASSES } from "../../mods/idle-rpg/rules.js";
import { drawnIn, opaqueBounds } from "../harness/png.mjs";
import { agent, mountRaid, mountView, raid, walk } from "../harness/view.mjs";

const THOROUGH = Boolean(process.env.HERDR_TESTS_THOROUGH);
const range = (a, b, step) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, i) => a + i * step);
const WIDTHS = THOROUGH ? range(320, 5120, 16) : [320, 360, 408, 480, 560, 639, 640, 700, 800, 1024, 1280, 1440, 1920, 2560, 3440, 3840, 5120];
const HEIGHTS = THOROUGH ? range(230, 560, 10) : [230, 296, 360, 480, 560];
const FLOOR_H = 152;
const GLOOM_H = 80 + 64 + FLOOR_H; // gloom(): RISE + WALL_H + FLOOR_H

// One view, resized through every size (resizing is what the app does).
async function sweep(mount, check) {
  const v = await mount();
  const found = [];
  for (const h of HEIGHTS)
    for (const w of WIDTHS) {
      v.resize(w, h);
      for (const problem of check(v, w, h)) found.push({ w, h, ...problem });
    }
  return found;
}
// The worst of each kind of problem, for messages: "shop: 88px past the right at 320x230".
function summary(found) {
  const worst = new Map();
  for (const f of found) if (!worst.has(f.what) || f.by > worst.get(f.what).by) worst.set(f.what, f);
  const first = new Map();
  for (const f of found) if (!first.has(f.what)) first.set(f.what, f);
  return [...worst.values()].map((f) => `${f.what}: up to ${f.by}px ${f.side} (at ${f.w}x${f.h}; first at ${first.get(f.what).w}x${first.get(f.what).h}; ${found.filter((g) => g.what === f.what).length} sizes)`).join("\n");
}
// How far `box` ({ x, y, w, h }) is outside the scene, side by side.
function outside(what, b, w, h) {
  const out = [];
  if (b.x < 0) out.push({ what, side: "past the left", by: Math.round(-b.x) });
  if (b.w !== null && b.x + b.w > w) out.push({ what, side: "past the right", by: Math.round(b.x + b.w - w) });
  if (b.y < 0) out.push({ what, side: "above the top", by: Math.round(-b.y) });
  if (b.h !== null && b.y + b.h > h) out.push({ what, side: "below the bottom", by: Math.round(b.y + b.h - h) });
  return out;
}
// The visible part of an image element: its box narrowed to the picture's non-transparent pixels.
function visible(v, el) {
  const b = v.box(el);
  const o = opaqueBounds(el.src.replace("mods/idle-rpg/art/", ""));
  const sx = b.w / o.w;
  const sy = b.h / o.h;
  return { x: b.x + o.left * sx, y: b.y + o.top * sy, w: (o.right - o.left + 1) * sx, h: (o.bottom - o.top + 1) * sy };
}
const imagesUnder = (v, id) => v.all((n) => n.type === "image" && pathHas(n, id));
const pathHas = (n, id) => {
  for (let p = n; p; p = p.parent) if (p.key === id) return true;
  return false;
};

// The darkness's pieces as the stretches of the width they actually darken:
// [from, to). Each picture is drawn at its own proportions inside its box
// (drawnIn: Herdr never stretches one to another shape), and a clipped piece
// shows only its clip.
function gloomSpans(v) {
  const g = v.get("idle-rpg-gloom");
  return g.kids.map((piece) => {
    const clipped = piece.style.overflow_hidden;
    const holder = clipped ? piece.kids[0] : piece; // the box the image sits at
    const img = holder.kids[0];
    const x0 = piece.style.left + (clipped ? holder.style.left : 0);
    const d = drawnIn(img.src.replace("mods/idle-rpg/art/", ""), img.style.w, img.style.h);
    let from = x0 + d.x;
    let to = x0 + d.x + d.w;
    if (clipped) [from, to] = [Math.max(from, piece.style.left), Math.min(to, piece.style.left + piece.style.w)];
    return [Math.round(from), Math.round(to)];
  });
}

describe("the night's darkness", () => {
  for (const battle of [true, false])
    test(`covers the whole width, every pixel once, ${battle ? "in a raid" : "in town (the campfire's pool cut in)"}`, async () => {
      const found = await sweep(
        () => mountRaid({ battle }),
        (v, w) => {
          const spans = gloomSpans(v).sort((a, b) => a[0] - b[0]);
          const out = [];
          let at = 0;
          for (const [a, b] of spans) {
            if (a > at) out.push({ what: "a gap in the darkness", side: `from ${at}`, by: a - at });
            if (a < at && b > a) out.push({ what: "darkness laid twice", side: `from ${a}`, by: Math.min(at, b) - a });
            at = Math.max(at, b);
          }
          if (at < w) out.push({ what: "the darkness stops short", side: `of the right edge (ends at ${at})`, by: w - at });
          if (v.get("idle-rpg-gloom").style.w < w) out.push({ what: "the darkness's box", side: "is not the scene's width", by: Math.abs(v.get("idle-rpg-gloom").style.w - w) });
          return out;
        },
      );
      assert.ok(!found.length, summary(found));
    });

  test("reaches from the floor's front edge to 80px above the wall, fading out over those 80px (no hard edge)", async () => {
    const found = await sweep(
      () => mountRaid(),
      (v, w, h) => {
        const b = v.box("idle-rpg-gloom");
        return b.y + b.h === h && b.h === GLOOM_H ? [] : [{ what: "the darkness's extent", side: `y ${b.y}..${b.y + b.h}`, by: 1 }];
      },
    );
    assert.ok(!found.length, summary(found));
    // its pictures are transparent along their top rows, so its upper edge is a fade
    for (const art of ["candle", "torch", "fill", "fire-0", "fire-12"]) assert.equal(opaqueBounds(`light/${art}.png`).top > 0, true, art);
  });

  test("what is drawn above its reach on a tall scene is only sky (stars, sun, moon, clouds), under the sky's own night tint", async () => {
    const v = await mountRaid({}, { phase: 0.75 });
    const drawnAbove = new Set();
    for (const h of HEIGHTS) {
      v.resize(1920, h);
      const top = h - GLOOM_H; // above this, the darkness does not reach
      // what lies under the darkness: everything drawn before it (the HUD, numbers and cards are drawn over it on purpose)
      const order = [...walk(v.tree)];
      const under = order.slice(0, order.indexOf(v.get("idle-rpg-gloom"))).filter((n) => n.type === "image");
      for (const el of under) {
        const b = v.box(el);
        if (b.h !== null && b.y < top) drawnAbove.add(el.src.replace("mods/idle-rpg/art/", ""));
      }
      const tint = v.box("idle-rpg-night-sky");
      assert.deepEqual([tint.y, tint.w], [0, 1920], "the sky's tint starts at the top and spans the width");
    }
    for (const p of drawnAbove) assert.match(p, /^scene\/(stars|sun|moon|cloud-a|cloud-b)\.png$/, `${p} is drawn above the darkness`);
  });

  test("reaching the top of a scene taller than 296px (a possible change, not a reported defect)", { todo: "by design the darkness is 296px tall (the floor, the wall and 80px over it, fading out): on a scene taller than 296px the top (H - 296)px, up to 264px at 560, has only the sky's half-strength tint; this asserts full cover in case that is wanted" }, async () => {
    const found = await sweep(
      () => mountRaid(),
      (v, w, h) => {
        const b = v.box("idle-rpg-gloom");
        return b.y > 0 ? [{ what: "the darkness's top", side: "below the scene's top", by: b.y }] : [];
      },
    );
    assert.ok(!found.length, summary(found));
  });
});

describe("the scenery", () => {
  test("stars, mountains, the wall and the floor's boards are tiled across the whole width; the sky's layers span it", async () => {
    const found = await sweep(
      () => mountRaid(),
      (v, w) => {
        const out = [];
        for (const art of ["scene/stars.png", "scene/mountains.png", "scene/wall.png", "scene/floor.png"]) {
          const tiles = v.all((n) => n.type === "image" && n.src.endsWith(art)).map((el) => v.box(el));
          const right = Math.max(...tiles.map((b) => b.x + b.w));
          const left = Math.min(...tiles.map((b) => b.x));
          if (left > 0 || right < w) out.push({ what: art, side: `covers ${left}..${right}`, by: Math.max(left, w - right) });
        }
        for (const id of ["idle-rpg-day", "idle-rpg-night-sky", "idle-rpg-stars"]) if (v.box(id).w !== w) out.push({ what: id, side: "not the width", by: Math.abs(v.box(id).w - w) });
        return out;
      },
    );
    assert.ok(!found.length, summary(found));
  });
});

describe("staying inside the scene", () => {
  test("the boss's visible pixels and its plate", { todo: "on a short scene the boss's top is cut: the dragon's by up to 66px (scenes under 296px tall), the ogre's by up to 2px (under 232px)" }, async () => {
    const found = [];
    for (const stage of [1, 2, 3])
      found.push(
        ...(await sweep(
          () => mountRaid({ stage }),
          (v, w, h) => {
            if (w < 640) return [];
            const kind = v.view.monster.kind;
            return [...imagesUnder(v, `idle-rpg-monster-${v.view.monster.id}`).flatMap((el) => outside(`the ${kind}`, visible(v, el), w, h)), ...outside("the plate", v.box("idle-rpg-plate"), w, h)];
          },
        )),
      );
    assert.ok(!found.length, summary(found));
  });

  test("the plate stays inside, clear of the frames above it, with and without its icons", async () => {
    const found = [];
    for (const stage of [1, 2, 3])
      found.push(
        ...(await sweep(
          async () => {
            // the ogre with statuses on it (the plate a row taller); the others without
            const v = await mountRaid({ stage, ...(stage === 2 ? { classes: ["wizard", "warrior"], weapons: { wizard: "venom", warrior: "flame" }, you: "healer", level: 3 } : {}) });
            if (stage === 2) v.until((h) => h.has("idle-rpg-plate-icons"), 120000);
            return v;
          },
          (v, w, h) => {
            if (w < 640) return [];
            const p = v.box("idle-rpg-plate");
            // and clear of the sign, the strip and the stage section (a stage note may lie over it)
            const hits = ["idle-rpg-sign", "idle-rpg-hud", "idle-rpg-stage"]
              .filter((id) => v.has(id))
              .map((id) => [id, v.box(id)])
              .filter(([, b]) => p.x < b.x + b.w && b.x < p.x + p.w && p.y < b.y + b.h && b.y < p.y + p.h)
              .map(([id, b]) => ({ what: `the plate under ${id}`, side: "overlapping", by: Math.round(b.y + b.h - p.y) }));
            return [...outside("the plate", p, w, h), ...hits];
          },
        )),
      );
    assert.ok(!found.length, summary(found));
  });

  test("the campfire's visible pixels", { todo: "the campfire's flames are cut by 2px at the lowest scene (230px; fine from 232)" }, async () => {
    const found = await sweep(
      () => mountRaid({ battle: false }),
      (v, w, h) => v.all((n) => n.type === "image" && n.src.includes("/campfire/")).flatMap((el) => outside("the campfire", visible(v, el), w, h)),
    );
    assert.ok(!found.length, summary(found));
  });

  test("the stations (book, dummy, stall)", { todo: "the stations stand at fixed x (the stall at 304..408): on a scene narrower than 408px the stall is cut off (by 88px at 320)" }, async () => {
    const found = await sweep(
      () => mountRaid({ battle: false }),
      (v, w, h) => ["codex", "skills", "shop"].flatMap((s) => imagesUnder(v, `idle-rpg-station-${s}-art`).flatMap((el) => outside(`the ${s} station`, visible(v, el), w, h))),
    );
    assert.ok(!found.length, summary(found));
  });

  test("the three frames and the stage note", async () => {
    const found = await sweep(
      async () => {
        const v = await mountRaid({ gold: 1e15, slain: 1e15, level: 50, stage: 999, best: 1000, farming: true });
        v.view.timesUp = { at: v.now, id: 1, text: "Time's up! Back to stage 999" };
        return v;
      },
      (v, w, h) => {
        v.view.timesUp.at = v.now; // keep the note up
        return ["idle-rpg-sign", "idle-rpg-hud", "idle-rpg-stage", "idle-rpg-timesup-1"].filter((id) => v.has(id)).flatMap((id) => outside(id, v.box(id), w, h));
      },
    );
    assert.ok(!found.length, summary(found));
  });

  // The panels at every size, at the layout's default inset (84).
  const PANELS = [["idle-rpg-slain", "idle-rpg-codex", 176], ["idle-rpg-points", "idle-rpg-skills", 232], ["idle-rpg-gold", "idle-rpg-shop", 318], ["idle-rpg-gear", "idle-rpg-settings", 200]];
  const HEIGHT = { "idle-rpg-skills": 165, "idle-rpg-shop": 167 }; // fixed by PANEL in main.js
  test("the panels", { todo: "the panels open at the sign's inset whatever the width: the shop (318px wide) runs off the right of a scene narrower than inset + 318 (402px at the default inset 84; by 82px at 320)" }, async () => {
    const found = await sweep(
      () => mountRaid({ gold: 50, slain: 1, level: 3 }),
      (v, w, h) =>
        PANELS.flatMap(([chip, id, width]) => {
          v.click(chip);
          const b = { ...v.box(id), w: width, h: HEIGHT[id] ?? null };
          v.click(chip);
          return outside(id, b, w, h);
        }),
    );
    assert.ok(!found.length, summary(found));
  });

  test("the cards (yours and an agent's)", async () => {
    const found = await sweep(
      () => mountRaid({ classes: ["archer", "wizard"] }),
      (v, w, h) => {
        const out = [];
        for (const who of ["critter-t2", "idle-rpg-you"]) {
          v.click(who);
          if (v.has("idle-rpg-card")) out.push(...outside(`${who}'s card`, { ...v.box("idle-rpg-card"), w: 232, h: who === "idle-rpg-you" ? 123 : 146 }, w, h));
          v.click("idle-rpg-card-x");
        }
        return out;
      },
    );
    assert.ok(!found.length, summary(found));
  });
});

describe("nothing hard-coded to a width", () => {
  test("the party and the boss are centred on the scene at every width", async () => {
    for (const w of WIDTHS.filter((x) => x >= 640)) {
      const v = await mountRaid({ classes: ["warrior", "archer"] }, { width: w });
      const b = v.box(`idle-rpg-monster-${v.view.monster.id}`);
      assert.equal(Math.round(b.x + 136 / 2), Math.round(w / 2), `the slime at ${w}`);
      const f = v.view.formation(v.world.agents, w, { w: 136, core: { x: 0, half: 60 } });
      assert.ok(Math.abs(f.t1.x + f.t2.x - w) <= 2 || f.t1.x < w / 2, `the warrior's side at ${w}`);
    }
  });
  test("everyone is drawn inside the scene at every width", async () => {
    for (const w of [320, 640, 660, 1280, 5120]) {
      // (a spot behind the campfire, as a drag at a wider width leaves one: at 640-679px the
      // campfire's nearer side is past the right edge, so they stand at its far side)
      const v = await mountView({ agents: Array.from({ length: 12 }, (_, i) => agent(`a${i}`, "idle")), width: w, saved: { ...raid({ battle: false }).saved, sprites: { you: "archer" }, spots: { a3: { x: 601, y: 40 } } } });
      for (const a of v.world.agents) {
        const s = v.view.at[a.address];
        assert.ok(s.x >= 36 && s.x <= w - 36, `${a.address} at ${s.x} of ${w}`);
      }
      assert.ok(CLASSES.includes(v.view.sprites.a0));
    }
  });
});
