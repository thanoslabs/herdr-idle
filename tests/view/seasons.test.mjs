// The town's seasonal decorations (SEASONS in rules.js, decor in main.js):
// jack-o'-lanterns in October, string lights and a tree in December, by the
// view's clock in local time, while the "Seasonal decorations" setting is on.
// Every test here sets the date (mountView's `at`); the harness's own clock
// starts out of season, so no other test sees a decoration whatever today is.
// Checked: what each season puts up, by day and night and at each width;
// nothing out of season, with the switch off or in a raid (and then the
// render is the same as before seasons existed); the month turning on the
// view's tick; old saves loading with the switch on; and that decorations are
// only scenery: behind everyone, clear of the stations, the campfire and the
// scene's edges, under the HUD, with no handlers, moving nobody.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { SEASONS, seasonOf } from "../../mods/idle-rpg/rules.js";
import { El, walk } from "../harness/elements.mjs";
import { agent, agents, mountRaid, mountView, raid, savedState } from "../harness/view.mjs";

const THOROUGH = Boolean(process.env.HERDR_TESTS_THOROUGH);
const FLOOR_H = 152;
const TICK_MS = 10000;
// local time, as main.js reads its clock (seasonOf)
const on = (y, m, d, h = 12, min = 0) => new Date(y, m - 1, d, h, min).getTime();
const OCT = on(2026, 10, 15);
const DEC = on(2026, 12, 15);
const OUT = { september: on(2026, 9, 15), november: on(2026, 11, 17), january: on(2027, 1, 15) };

const town = (o = {}, view = {}) => mountRaid({ battle: false, status: "idle", ...o }, view);
const decor = (v) => v.ids("idle-rpg-season");
const seasonal = (v) => v.images().filter((p) => p.includes("/art/seasons/"));
const named = (v, part) => v.images().filter((p) => p.endsWith(`/art/seasons/${part}.png`)).length;
// the night's darkness: its pictures, by their path in art/
const gloomArt = (v) => v.images("idle-rpg-gloom").map((p) => p.split("/art/")[1]);
// the HUD's frames (the sign; the strip with the map and the gear), 4px round each
const hudFrames = (v) => ["idle-rpg-sign", "idle-rpg-hud"].filter((id) => v.has(id)).map((id) => v.box(id)).map((b) => ({ x: b.x - 4, y: b.y - 4, w: b.w + 8, h: b.h + 8 }));
// the torches' middles, but for any behind the campfire's flames (its picture, 216px wide) or
// whose lantern on the battlements, glow and all, would meet the HUD or the scene's top
const torches = (v) => {
  const fire = v.find("idle-rpg-fire-glow") ? v.box("idle-rpg-fire-glow").x + 108 : null;
  const top = v.size.height - FLOOR_H - 64 + 4 - 56;
  return v
    .all((n) => n.type === "image" && n.src.endsWith("/scene/torch.png"))
    .map((n) => v.box(n).x + 12)
    .filter((x) => fire === null || Math.abs(x - fire) >= 108 + 28)
    .filter((x) => top >= 0 && !hudFrames(v).some((f) => meetsBox({ x: x - 28, y: top, w: 56, h: 56 }, f)));
};
const meetsBox = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const widths = THOROUGH ? Array.from({ length: 131 }, (_, i) => 320 + i * 16) : [320, 400, 560, 640, 700, 900, 1144, 1280, 1459, 1920, 2400];

// The rendered tree as plain data, minus the clouds (their place and their
// laps' ids follow the clock's absolute time, not its time of day).
function snapshot(n) {
  if (!(n instanceof El)) return n.text;
  if (n.key?.startsWith("idle-rpg-cloud-")) return null;
  return {
    type: n.type,
    id: n.key,
    src: n.src,
    style: { ...n.style },
    loops: JSON.stringify(n.loops),
    transitions: JSON.stringify(n.transitions),
    handlers: Object.keys(n.handlers),
    tip: n.tip,
    kids: n.kids.map(snapshot).filter((k) => k !== null),
  };
}

describe("the harness's clock", () => {
  test("starts out of every season, so no other test meets a decoration", async () => {
    const v = await town({ classes: ["warrior", "archer"] });
    assert.equal(seasonOf(v.now), null, new Date(v.now).toString());
    assert.deepEqual(decor(v), []);
    // and stays out of season over the longest any test runs (a few hours of clock)
    assert.equal(seasonOf(v.now + 7 * 24 * 3600 * 1000), null);
  });
});

// Where a fitting of the rampart is drawn: [what, box] for each torch, its glow and each banner.
const fittings = (v) => [
  ...v.all((n) => n.type === "image" && /\/scene\/(torch|banner)\.png$/.test(n.src)).map((n) => [n.src.split("/scene/")[1], v.box(n)]),
  ...v.ids("idle-rpg-glow-").map((id) => [id, v.box(id)]),
];
const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// the lanterns at the foot of the wall (the barrel's is idle-rpg-season-barrel)
const feet = (v) => v.ids("idle-rpg-season-lantern-").map((id) => v.box(id).x + 28);
// The night's darkness each torch's stretch should have: the set of its lanterns with
// pools ("p" over the torch, "a" and "b" at the foot of the wall), by the stretch's left edge.
function expectedPools(v, W) {
  const fire = v.view.fireX(W);
  const reach = (x) => fire === null || Math.abs(x - fire) >= 160 + 64;
  const out = new Map();
  const add = (x, g, dx) => {
    const left = x - dx;
    out.set(left, (out.get(left) ?? "") + g);
  };
  for (const id of v.ids("idle-rpg-season-rampart-")) {
    const x = v.box(id).x + 28;
    if (reach(x)) add(x, "p", 196);
  }
  for (const x of feet(v)) add(x, (x - 272) % 384 === 104 ? "a" : "b", (x - 272) % 384);
  return out;
}

describe("October: jack-o'-lanterns", () => {
  test("on the battlements over each torch (none behind the campfire), on the barrel and at the foot of the wall near the campfire, carved and flickering", async () => {
    const v = await town({ classes: ["warrior", "archer", "wizard"] }, { at: OCT });
    assert.equal(seasonOf(v.now), "halloween");
    const rampart = v.ids("idle-rpg-season-rampart-");
    assert.equal(rampart.length, torches(v).length, "one over each torch");
    assert.equal(rampart.length, 2, "two at 1280px");
    // each over its torch, sitting on the wall's top
    const wallTop = v.size.height - FLOOR_H - 64;
    rampart.forEach((id, i) => {
      const b = v.box(id);
      assert.equal(b.x + b.w / 2, torches(v)[i], id);
      assert.equal(b.y + b.h, wallTop + 4, `${id} sits on the merlon`);
    });
    // the barrel's (its middle on the barrel's), and at 1280px one at the foot of the wall right of the
    // campfire, between the torch and the next banner (left of it the nearest gaps are the stall's or the fire's)
    const barrel = v.box(v.all((n) => n.type === "image" && n.src.endsWith("/scene/barrel.png"))[0]);
    const onBarrel = v.box("idle-rpg-season-barrel");
    assert.equal(onBarrel.x + onBarrel.w / 2, barrel.x + barrel.w / 2);
    assert.deepEqual(feet(v), [950]);
    assert.equal(v.box("idle-rpg-season-lantern-950").y + 48, v.size.height - FLOOR_H + 8, "its feet at the floor's back edge");
    // every lantern: the lantern, its carving's flicker (a native loop) and a glow behind it
    assert.equal(named(v, "halloween/lantern"), 4);
    assert.equal(named(v, "halloween/flicker"), 4);
    for (const n of v.all((n) => n.type === "image" && n.src.endsWith("/halloween/flicker.png"))) assert.ok(n.parent.loops.opacity, "the flicker fades in and out");
    assert.equal(v.ids("idle-rpg-season-glow-").length, 4);
  });

  test("they glow at night: brighter glows, and pools of light in the night's darkness", async () => {
    const day = await town({}, { at: OCT, phase: 0.25 });
    const night = await town({}, { at: OCT, phase: 0.75 });
    for (const id of night.ids("idle-rpg-season-glow-")) {
      assert.ok(night.get(id).style.opacity > 0.9, `${id} at night`);
      assert.ok(day.get(id).style.opacity < 0.3, `${id} by day`);
      assert.ok(night.get(id).kids[0].loops.opacity, `${id} flickers`);
    }
    // the darkness: the barrel's lantern's pool in the candle's picture; at 1280px the second torch's
    // stretch with the pool of the lantern at the foot of the wall (950)
    // (neither battlement lantern has a pool of its own at 1280px: both are too near the campfire's stretch, which would cut it)
    assert.deepEqual(gloomArt(night).filter((p) => !p.startsWith("light/fill")), ["seasons/halloween/light/candle.png", "light/torch.png", "seasons/halloween/light/torch-b.png", `light/fire-${((night.view.fireX(1280) - 272) / 16) % 24}.png`]);
  });

  test("at every width: fewer in a narrow scene, none over a torch or a banner, and each pool of light where its lantern is", async () => {
    const v = await town({}, { at: OCT });
    for (const w of THOROUGH ? widths : [...widths, 2918]) {
      v.resize(w);
      const W = Math.max(320, w);
      const fire = v.view.fireX(W);
      assert.ok(v.has("idle-rpg-season-barrel"), `${w}px: the barrel's, at every width`);
      assert.deepEqual(v.ids("idle-rpg-season-rampart-").map((id) => v.box(id).x + 28), torches(v), `${w}px: one over each torch clear of the campfire`);
      // at the foot of the wall: only with a campfire, in a gap between a torch and a banner, clear of
      // the campfire's stretch of darkness by their pools' reach, at most one each side
      const at = feet(v);
      if (fire === null) assert.deepEqual(at, [], `${w}px`);
      for (const x of at) {
        assert.ok([104, 294].includes((x - 272) % 384), `${w}px: ${x} in a gap`);
        assert.ok(Math.abs(x - fire) >= 224, `${w}px: ${x} far enough from the campfire at ${fire}`);
      }
      assert.ok(at.filter((x) => x < (fire ?? 0)).length <= 1 && at.filter((x) => x > (fire ?? 0)).length <= 1, `${w}px: ${at}`);
      // nothing on the floor meets a torch, its glow or a banner
      for (const id of [...v.ids("idle-rpg-season-lantern-"), ...v.ids("idle-rpg-season-barrel"), ...v.ids("idle-rpg-season-tree")])
        for (const [what, b] of fittings(v)) assert.ok(!meets(v.box(id), b), `${w}px: ${id} ${JSON.stringify(v.box(id))} meets ${what} ${JSON.stringify(b)}`);
      // the darkness: the candle's picture is the season's while the barrel's lantern is up, and each
      // torch's stretch has exactly the pools of its lanterns drawn (none cut by the campfire's stretch)
      const pieces = v.get("idle-rpg-gloom").kids.map((k) => {
        const img = [...walk(k)].find((n) => n instanceof El && n.type === "image");
        return { left: v.box(img).x, art: img.src.split("/art/")[1] };
      });
      assert.equal(pieces.find((p) => p.left === 0).art, "seasons/halloween/light/candle.png");
      const want = expectedPools(v, W);
      for (const p of pieces.filter((p) => p.art.includes("torch"))) {
        const set = want.get(p.left) ?? "";
        assert.equal(p.art, set ? `seasons/halloween/light/torch-${set}.png` : "light/torch.png", `${w}px: the stretch at ${p.left}`);
        want.delete(p.left);
      }
      assert.deepEqual([...want.keys()], [], `${w}px: every pool has its torch's stretch`);
    }
  });
});

describe("December: string lights and a tree", () => {
  test("bulbs along the whole rampart, alternate ones lit, the second set fading in and out over the first", async () => {
    const v = await town({ classes: ["warrior", "healer"] }, { at: DEC });
    assert.equal(seasonOf(v.now), "winter");
    for (const w of widths) {
      v.resize(w);
      const W = Math.max(320, w);
      const wallTop = v.size.height - FLOOR_H - 64;
      for (const frame of ["a", "b"]) {
        const b = v.box(`idle-rpg-season-string-${frame}`);
        assert.deepEqual([b.x, b.y, b.w], [0, wallTop, W], `${w}px ${frame}: along the top of the wall`);
        const tiles = v.images(`idle-rpg-season-string-${frame}`);
        assert.equal(tiles.length, Math.ceil(W / 128));
        assert.ok(tiles.every((p) => p.endsWith(`/seasons/winter/lights-${frame}.png`)));
      }
      assert.ok(!v.get("idle-rpg-season-string-a").loops.opacity, "the first set stays");
      assert.deepEqual(v.get("idle-rpg-season-string-b").loops.opacity, { from: 0, to: 1, period: 1100 }, "the second twinkles over it");
      // every picture of the night's darkness is the winter one, with the bulbs' pools of light
      assert.ok(gloomArt(v).length > 0 && gloomArt(v).every((p) => p.startsWith("seasons/winter/light/")), `${w}px: ${gloomArt(v).join(" ")}`);
    }
  });

  test("one decorated tree, between a banner and a torch, the rightmost gap clear of the stall and the campfire", async () => {
    const v = await town({}, { at: DEC });
    const seen = [];
    for (const w of widths) {
      v.resize(w);
      const W = Math.max(320, w);
      if (!v.has("idle-rpg-season-tree")) {
        seen.push([w, null]);
        continue;
      }
      const b = v.box("idle-rpg-season-tree");
      const x = b.x + b.w / 2;
      seen.push([w, x]);
      assert.ok([376, 182].includes(x % 384), `${w}px: a gap between the fittings (376 or 566, + 384k), at ${x}`);
      assert.ok(b.x >= 420 && b.x + b.w <= W - 8, `${w}px: inside, clear of the stall`);
      const fire = v.view.fireX(W);
      if (fire !== null) assert.ok(Math.abs(x - fire) >= 108 + 8 + 46, `${w}px: clear of the campfire`);
      assert.equal(v.images("idle-rpg-season-tree").length, 2, "the tree and its twinkle");
      assert.ok(v.get("idle-rpg-season-tree").kids[1].loops.opacity);
    }
    // narrow scenes have none; from 814px there is always one
    assert.equal(seen.find(([w]) => w === 320)[1], null);
    for (const [w, x] of seen) if (w >= 814) assert.notEqual(x, null, `${w}px`);
  });
});

describe("nothing out of season, with the switch off, or in a raid", () => {
  test("September, today (17 November) and January: nothing", async () => {
    for (const [name, at] of Object.entries(OUT)) {
      const v = await town({ classes: ["archer", "wizard"] }, { at });
      assert.equal(seasonOf(v.now), null, name);
      for (const w of [320, 640, 1280, 2400]) {
        v.resize(w);
        assert.deepEqual(decor(v), [], `${name} ${w}px`);
        assert.deepEqual(seasonal(v), [], `${name} ${w}px`);
      }
    }
  });

  test("with the switch off, the town is drawn exactly as out of season (and as before seasons existed)", async () => {
    for (const phase of [0.25, 0.75])
      for (const [at, name] of [[OCT, "October"], [DEC, "December"]]) {
        const list = [...agents(5, "idle"), agent("w1", "working")];
        const mount = (when, seasonalOn) => mountView({ saved: raid({ battle: false, settings: { seasonal: seasonalOn } }).saved, agents: list, phase, at: when });
        const off = await mount(at, false);
        const out = await mount(undefined, true); // the harness's own clock: January, out of season
        assert.equal(off.view.settings.seasonal, false);
        for (const w of [320, 640, 1280, 2000]) {
          off.resize(w);
          out.resize(w);
          off.render();
          out.render();
          assert.deepEqual(decor(off), [], `${name} ${w}px`);
          assert.deepEqual(snapshot(off.tree), snapshot(out.tree), `${name} at ${phase} ${w}px: the same elements, ids, pictures and styles`);
        }
      }
  });

  test("the switch in the settings: on by default, off takes them down at once and saves", async () => {
    const v = await town({}, { at: OCT });
    assert.equal(v.view.settings.seasonal, true);
    assert.ok(decor(v).length > 0);
    v.click("idle-rpg-gear");
    assert.ok(v.text("idle-rpg-setting-seasonal").includes("Seasonal decorations"));
    assert.equal(v.get("idle-rpg-setting-seasonal-knob").style.left, 14, "on");
    const n = v.saves.length;
    v.click("idle-rpg-setting-seasonal");
    assert.equal(v.saves.length, n + 1);
    assert.equal(v.stored.settings.seasonal, false);
    assert.deepEqual(decor(v), []);
    assert.deepEqual(seasonal(v), []);
    v.click("idle-rpg-setting-seasonal");
    assert.equal(v.stored.settings.seasonal, true);
    assert.ok(decor(v).length > 0, "and back up");
  });

  test("a raid is never decorated, in either season, at any width", async () => {
    for (const at of [OCT, DEC])
      for (const stage of [1, 11, 21, 31]) {
        const v = await mountRaid({ stage, best: stage }, { at });
        for (const w of [320, 640, 1280]) {
          v.resize(w);
          assert.deepEqual(decor(v), [], `stage ${stage} ${w}px`);
          assert.deepEqual(seasonal(v), [], `stage ${stage} ${w}px`);
        }
        // back in town they are up
        v.click("idle-rpg-battle-toggle");
        assert.ok(decor(v).length > 0);
      }
  });
});

describe("the calendar turns on the view's tick, without a reload", () => {
  for (const [from, to, before, after] of [
    [on(2026, 9, 30, 23, 50), on(2026, 10, 1, 0, 0), null, "halloween"],
    [on(2026, 10, 31, 23, 50), on(2026, 11, 1, 0, 0), "halloween", null],
    [on(2026, 11, 30, 23, 50), on(2026, 12, 1, 0, 0), null, "winter"],
    [on(2026, 12, 31, 23, 50), on(2027, 1, 1, 0, 0), "winter", null],
  ])
    test(`${new Date(to).toDateString()}: ${before ?? "nothing"} until midnight, then ${after ?? "nothing"}`, async () => {
      const v = await town({ classes: ["warrior"] }, { at: from });
      const what = () => (v.has("idle-rpg-season-barrel") ? "halloween" : v.has("idle-rpg-season-string-a") ? "winter" : decor(v).length ? "?" : null);
      assert.ok(v.now < to, "starts before midnight");
      assert.equal(what(), before);
      v.advance(to - v.now - 1); // to the last millisecond of the month
      assert.equal(what(), before, "still the old month");
      v.advance(TICK_MS + 1); // the next tick past midnight
      assert.equal(what(), after, "the new month's");
    });
});

describe("old saves", () => {
  test("every version's save loads with the switch on, and decorates the town in season", async () => {
    for (const version of [0, 1, 2, 3, 4, 5, 6, 7]) {
      const saved = savedState(version, { now: OCT, extra: { battle: false } });
      const v = await mountView({ saved, agents: [agent("t1", "idle")], at: OCT, key: version === 0 ? "raid-party.state" : undefined });
      assert.equal(v.view.settings.seasonal, true, `v${version}`);
      assert.ok(v.has("idle-rpg-season-barrel"), `v${version}`);
    }
  });
});

describe("only scenery", () => {
  // what a decoration must stay clear of, as boxes: each station outlined and
  // hopping (4px each way) with its arrow over it and its tag, and the campfire
  const keepClear = (v) => {
    const out = [];
    for (const s of ["codex", "skills", "shop"]) {
      const b = v.box(`idle-rpg-station-${s}`);
      out.push([s, { x: b.x - 4, y: b.y - 42, w: b.w + 8, h: b.h + 46 }], [`${s} tag`, v.box(`idle-rpg-station-${s}-tag`)]);
    }
    for (const n of v.all((n) => n.type === "image" && n.src.endsWith("/campfire/base.png"))) out.push(["campfire", v.box(n)]);
    if (v.has("idle-rpg-fire-glow")) out.push(["campfire's glow", v.box("idle-rpg-fire-glow")]);
    return out;
  };
  const meets = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
  const boxes = (v, prefix) => v.ids(prefix).map((id) => [id, v.box(id)]);

  test("behind everyone, clear of the stations and the campfire, inside the scene, under the HUD, with no handlers", async () => {
    const parties = THOROUGH ? [0, 4, 12, 40, 400] : [4, 400];
    for (const n of parties)
      for (const at of [OCT, DEC])
        for (const height of [230, 360, 560]) {
          const v = await mountView({ saved: raid({ battle: false }).saved, agents: agents(n, "idle"), at, height });
          for (const w of widths) {
            v.resize(w, height);
            const W = Math.max(320, w);
            const floorTop = height - FLOOR_H;
            const label = `${n} agents, ${height}px tall, ${w}px`;
            const floorDecor = [...boxes(v, "idle-rpg-season-lantern-"), ...boxes(v, "idle-rpg-season-barrel"), ...boxes(v, "idle-rpg-season-tree")];
            const all = [...floorDecor, ...boxes(v, "idle-rpg-season-rampart-")];
            for (const [id, b] of all) {
              assert.ok(b.x >= 0 && b.x + b.w <= W && b.y >= 0, `${label}: ${id} inside the scene ${JSON.stringify(b)}`);
              for (const [what, c] of keepClear(v)) assert.ok(!meets(b, c), `${label}: ${id} ${JSON.stringify(b)} meets the ${what} ${JSON.stringify(c)}`);
            }
            // on the floor, feet at its back edge (or up on the barrel), behind where anyone can stand (you from 12, agents from 16)
            const nearest = Math.min(v.view.you.y, ...Object.values(v.view.at).map((s) => s.y));
            for (const [id, b] of floorDecor) {
              assert.ok(b.y + b.h - floorTop <= 8, `${label}: ${id} at the back`);
              assert.ok(b.y + b.h - floorTop < nearest, `${label}: ${id}'s feet behind everyone's`);
            }
            // drawn before (under) everyone and everything that matters: the stations, the campfire, every character, the HUD
            const order = new Map([...walk(v.tree)].map((node, i) => [node, i]));
            const first = Math.min(
              ...["idle-rpg-station-codex", "idle-rpg-fire-glow", "idle-rpg-you", "idle-rpg-sign", "idle-rpg-hud"].filter((id) => v.has(id)).map((id) => order.get(v.get(id))),
              ...v.ids("critter-").map((id) => order.get(v.get(id))),
            );
            for (const id of decor(v)) {
              const el = v.get(id);
              assert.ok(order.get(el) < first, `${label}: ${id} drawn under the rest`);
              // and nothing in it takes a press, a hover or shows a tooltip
              for (const node of walk(el)) if (node instanceof El) assert.deepEqual([Object.keys(node.handlers), node.tip, node.hoverStyle, node.activeStyle], [[], null, null, null], `${label}: ${id}`);
            }
          }
        }
  });

  test("none under the HUD or cut off by the scene's top, glow and all, from 320 to 2918px wide and 200 to 400px tall", async () => {
    const ws = THOROUGH ? Array.from({ length: 163 }, (_, i) => 320 + i * 16) : [320, 400, 548, 560, 640, 700, 814, 900, 1168, 1280, 1459, 1920, 2400, 2918];
    const hs = THOROUGH ? Array.from({ length: 26 }, (_, i) => 200 + i * 8) : [200, 230, 250, 272, 296, 321, 360, 400];
    for (const at of [OCT, DEC])
      for (const n of [4, 40]) {
        const v = await mountView({ saved: raid({ battle: false }).saved, agents: agents(n, "idle"), at });
        for (const h of hs)
          for (const w of ws) {
            v.resize(w, h);
            const frames = ["idle-rpg-sign", "idle-rpg-hud", "idle-rpg-gear", "idle-rpg-map"].filter((id) => v.has(id)).map((id) => [id, v.box(id)]);
            for (const id of [...v.ids("idle-rpg-season-rampart-"), ...v.ids("idle-rpg-season-lantern-"), ...v.ids("idle-rpg-season-barrel"), ...v.ids("idle-rpg-season-glow-"), ...v.ids("idle-rpg-season-tree")]) {
              const b = v.box(id);
              assert.ok(b.y >= 0, `${w}x${h}: ${id} cut off at the top ${JSON.stringify(b)}`);
              for (const [f, c] of frames) assert.ok(!meets(b, c), `${w}x${h}, ${n} agents: ${id} ${JSON.stringify(b)} meets ${f} ${JSON.stringify(c)}`);
            }
            // and no pool of light for a lantern that is not drawn
            const art = gloomArt(v);
            assert.equal(art.includes("seasons/halloween/light/candle.png"), v.has("idle-rpg-season-barrel") && at === OCT, `${w}x${h}`);
          }
      }
  });

  test("they move nobody: every spot, seat, character and tag is where it is out of season, small party and a crowd of 400", async () => {
    const parties = THOROUGH ? [1, 4, 12, 13, 40, 100, 400] : [4, 400];
    for (const n of parties) {
      const layouts = [];
      for (const at of [undefined, OCT, DEC]) {
        const v = await mountView({ saved: raid({ battle: false, classes: [] }).saved, agents: agents(n, "idle"), at, seed: 7 });
        const out = [];
        for (const w of widths) {
          v.resize(w);
          out.push({
            w,
            at: JSON.stringify(v.view.at),
            home: JSON.stringify(v.view.home),
            pitch: v.view.pitch,
            you: JSON.stringify(v.view.you),
            tagged: v.view.tagged ? [...v.view.tagged].join() : null,
            critters: v.ids("critter-").map((id) => JSON.stringify(v.box(id))).join(),
            tags: v.ids("idle-rpg-label-").map((id) => JSON.stringify(v.box(id))).join(),
          });
        }
        layouts.push(out);
      }
      assert.deepEqual(layouts[1], layouts[0], `${n} agents: October as out of season`);
      assert.deepEqual(layouts[2], layouts[0], `${n} agents: December as out of season`);
    }
  });

  test("their motion is the app's own loops: no render of their own", async () => {
    const counts = [];
    for (const at of [undefined, OCT, DEC]) {
      const v = await town({ classes: ["warrior", "archer", "wizard", "healer"] }, { at });
      const before = v.renders;
      v.advance(120000);
      counts.push(v.renders - before);
    }
    assert.deepEqual([counts[1], counts[2]], [counts[0], counts[0]]);
  });
});

test("every season has decorations to draw (SEASONS)", async () => {
  const months = { halloween: OCT, winter: DEC };
  assert.deepEqual(SEASONS.map((s) => s.id).sort(), Object.keys(months).sort(), "a new season needs its own tests here");
});
