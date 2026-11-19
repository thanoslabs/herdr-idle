// Many agents at once (PLAN.md, Many agents at once). Small parties stand
// where they always have (place()'s default spots in town, formation()'s in a
// raid), pinned here against the old code. Past that a crowd stands on a brick
// lattice in one pass (main.js, townLattice and raidCrowd): each on a spot of
// its own until every spot at the densest pitch is taken, clear of the
// stations, the campfire and the boss, warriors nearest the boss, a spot a
// drag chose kept; and once it is tighter than a tag is wide, only some tags
// show (crowdMarks). Before this, 400 agents (100 a class) failed to render in
// the app ("interrupted" inside a quadratic place()); 100 in town stood on 20
// spots at 1280px.
//
// Render times are printed as diagnostics (`ms per render`), not asserted
// beyond a generous bound; that the cost grows about linearly is asserted on
// place() and formation() alone, as the ratio of the fastest of several runs.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { loadState } from "../mods/idle-rpg/rules.js";
import { KO_TICKS } from "../mods/idle-rpg/party.js";
import { Fight, seeded } from "../tools/sim.mjs";
import { agent, mountRaid, mountView, raid, timeAt } from "./harness/view.mjs";

const THOROUGH = Boolean(process.env.HERDR_TESTS_THOROUGH);
const CLASSES = ["wizard", "healer", "warrior", "archer"];
const STATUSES = ["idle", "working", "blocked", "done"];
const NEAR = { x: 50, y: 30 }; // two characters closer than this both ways overlap
const MONSTERS = {
  slime: { w: 136, core: { x: 0, half: 60 } },
  ogre: { w: 200, core: { x: 0, half: 62 } },
  dragon: { w: 328, core: { x: 12, half: 84 } },
};
// the campfire's x between raids (main.js fireX), and how far either side of it nobody stands
const fireX = (W) => (W < 640 ? null : 272 + 16 * Math.max(16, Math.round((W / 2 - 272) / 16)));
const FIRE_CLEAR = 116;
// the stations' tags (main.js STATIONS): nothing over them
const STATION_X = 436;

// Mounts `n` agents arriving at once (classes known, so no save in the
// middle): `classes` and `statuses` in turn, at width W.
async function arrive(n, { view = "town", status = null, width = 1280, classes = CLASSES, spots = null, stage = 1 } = {}) {
  const list = Array.from({ length: n }, (_, i) => agent(`a${i}`, status ?? STATUSES[i % 4], { space_name: `s${i}`, tab_name: "t" }));
  const { saved } = raid({ view, classes: [], stage });
  saved.sprites = { you: "archer", ...Object.fromEntries(list.map((a, i) => [a.address, classes[i % classes.length]])) };
  saved.seen = Object.fromEntries(list.map((a) => [a.address, 1_800_000_000_000]));
  if (spots) saved.spots = spots;
  const v = await mountView({ saved, agents: [], width });
  const started = performance.now();
  v.setAgents(list);
  return { v, ms: performance.now() - started };
}

const key = (s) => `${s.x},${s.y}`;
const spotsOf = (v) => v.world.agents.map((a) => v.view.at[a.address]);
// Whether any two of `spots` stand closer than NEAR both ways.
function overlapping(spots) {
  for (let i = 0; i < spots.length; i++)
    for (let j = i + 1; j < spots.length; j++) if (Math.abs(spots[i].x - spots[j].x) < NEAR.x && Math.abs(spots[i].y - spots[j].y) < NEAR.y) return [spots[i], spots[j]];
  return null;
}
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

// The old code, as it was before crowds, for the spots of newcomers arriving
// in order with nothing saved: the default spots (two rows, 64 and 104 down
// the floor, 88px apart from x 250, none behind the campfire), each newcomer
// on the first clear of everyone placed (NEAR).
function oldPlace(n, W) {
  const perRow = Math.max(1, Math.floor((W - 250 - 60) / 88));
  const fire = fireX(W);
  const out = [];
  for (let k = 0; k < n; k++)
    for (let i = 0; ; i++) {
      const s = { x: 250 + (i % perRow) * 88, y: Math.floor(i / perRow) % 2 ? 104 : 64 };
      if (fire !== null && Math.abs(s.x - fire) < FIRE_CLEAR && s.y < 100) continue;
      if (!out.some((o) => Math.abs(o.x - s.x) < 50 && Math.abs(o.y - s.y) < 30) || i > 200) {
        out.push(s);
        break;
      }
    }
  return out;
}
// The old formation (main.js formation before crowds).
function oldFormation(classes, W, kind) {
  const mid = Math.round(W / 2);
  const half = kind.w / 2;
  const reach = Math.max(110, Math.min(360, mid - half - 60));
  const count = { melee: 0, ranged: 0 };
  return classes.map((cls) => {
    const melee = cls === "warrior";
    const i = melee ? count.melee++ : count.ranged++;
    const side = i % 2 ? 1 : -1;
    const n = Math.floor(i / 2);
    const x = melee ? mid + kind.core.x + side * (kind.core.half + 44 + n * 62) : mid + side * (half + reach + n * 62);
    return { x: Math.round(Math.max(36, Math.min(W - 36, x))), y: melee ? 114 : Math.max(16, Math.min(122, [96, 60][n % 2])), dir: -side };
  });
}

describe("a crowd's cost", () => {
  test("ms per render, and 400 agents render well inside a generous bound", async (t) => {
    for (const [n, battle] of [[10, false], [100, false], [400, false], [10, true], [100, true], [400, true]]) {
      const { v, ms } = await arrive(n, { view: battle ? "raid" : "town", status: battle ? "working" : null, width: 1459 });
      v.advance(1000);
      const view = v.view;
      const cx = { notify() {} };
      const runs = [];
      for (let i = 0; i < 5; i++) {
        const t0 = performance.now();
        view.render(cx);
        runs.push(performance.now() - t0);
      }
      const best = Math.min(...runs);
      t.diagnostic(`${n} agents ${battle ? "in a raid" : "in town"} at 1459px: ${best.toFixed(1)}ms per render (arriving: ${ms.toFixed(0)}ms in the harness, its checks included)`);
      // about 10ms on a laptop; the old place() alone took 1.2s for 400 in town
      if (n === 400) assert.ok(best < 400, `${best}ms`);
    }
  });

  test("place() and formation() cost about linearly more as the crowd grows", async () => {
    const { v } = await arrive(0);
    const view = v.view;
    const list = (n, cls) =>
      Array.from({ length: n }, (_, i) => {
        view.sprites[`z${i}`] = cls ? cls(i) : CLASSES[i % 4];
        return { address: `z${i}`, status: "idle" };
      });
    // the fastest of several runs, after a warm-up: steady even on a busy machine
    const fastest = (fn) => {
      for (let i = 0; i < 5; i++) fn();
      let best = Infinity;
      for (let i = 0; i < 15; i++) {
        const t0 = performance.now();
        fn();
        best = Math.min(best, performance.now() - t0);
      }
      return best;
    };
    for (const [what, run] of [
      ["place", (l) => view.place(l, 2918)],
      ["formation", (l) => view.formation(l, 2918, MONSTERS.dragon)],
    ]) {
      const small = list(500);
      const a = fastest(() => run(small));
      const big = list(2000);
      const b = fastest(() => run(big));
      // four times the crowd: about four times the work (a search over all others would be sixteen)
      assert.ok(b <= 10 * a + 2, `${what}: ${a.toFixed(2)}ms for 500, ${b.toFixed(2)}ms for 2000`);
    }
  });
});

describe("a small party stands as it always has", () => {
  const widths = THOROUGH ? [1024, 1280, 1459, 1600, 1920, 2918] : [1280, 1459, 1920];
  test("in town: up to 12 newcomers get the old default spots, saved, and every tag shows under its agent", async () => {
    for (const W of widths)
      for (const n of THOROUGH ? [1, 2, 3, 5, 8, 11, 12] : [1, 5, 12]) {
        const { v } = await arrive(n, { width: W });
        const want = oldPlace(n, W);
        v.world.agents.forEach((a, i) => {
          assert.deepEqual(v.view.at[a.address], want[i], `${a.address} of ${n} at ${W}`);
          assert.deepEqual(v.view.spots[a.address], want[i], "and kept");
        });
        assert.equal(v.view.pitch, null);
        assert.equal(v.view.tagged, null);
        for (const a of v.world.agents) {
          // in its agent's own place among the actors (not the crowd's layer over everyone)
          const tag = v.get(`idle-rpg-label-${a.address}`);
          assert.equal(tag.style.top, v.view.at[a.address].y + 11);
          assert.ok(v.box(tag).w <= 84);
        }
      }
  });
  test("in a raid: the old formation, for every boss, up to 12 always and beyond while none of its spots overlap", async () => {
    const mixes = [CLASSES, ["warrior", "archer"], ["archer", "wizard", "healer"], ["warrior"]];
    let pinned = 0;
    for (const W of widths)
      for (const kind of Object.keys(MONSTERS))
        for (const mix of mixes)
          for (const n of THOROUGH ? [1, 2, 4, 6, 8, 10, 12] : [3, 6, 12]) {
            const classes = Array.from({ length: n }, (_, i) => mix[i % mix.length]);
            const old = oldFormation(classes, W, MONSTERS[kind]);
            if (n > 12 && overlapping(old)) continue; // piled in the corners: the crowd's to place
            pinned += 1;
            const list = classes.map((cls, i) => ({ address: `p${i}`, status: "working" }));
            const { v } = await arrive(0, { width: W });
            classes.forEach((cls, i) => (v.view.sprites[`p${i}`] = cls));
            const f = v.view.formation(list, W, MONSTERS[kind]);
            list.forEach((a, i) => assert.deepEqual(f[a.address], old[i], `${a.address} of ${n} (${mix}) against the ${kind} at ${W}`));
            assert.equal(v.view.formed, null);
          }
    assert.ok(pinned >= 20, `only ${pinned} parties pinned`);
  });
  test("in a fight a party of 6 shows every tag where it always did", async () => {
    const { v } = await arrive(6, { view: "raid", status: "working", width: 1280 });
    v.advance(1000);
    assert.equal(v.view.tagged, null);
    for (const a of v.world.agents) assert.ok(v.has(`idle-rpg-label-${a.address}`), a.address);
  });
});

describe("a crowd in town", () => {
  test("400 agents (100 a class) render, each inside the scene", async () => {
    const { v } = await arrive(400, { width: 1280 });
    assert.equal(v.ids("critter-").length, 400);
    for (const a of v.world.agents) {
      const s = v.view.at[a.address];
      assert.ok(s.x >= 36 && s.x <= 1280 - 36 && s.y >= 16 && s.y <= 110, `${a.address} at ${key(s)}`);
    }
  });

  test("100 agents in town get 100 distinct spots", async (t) => {
    const { v } = await arrive(100);
    const spots = new Set(spotsOf(v).map(key));
    t.diagnostic(`${spots.size} distinct spots for 100 agents (the old place(): 20 at 1280px)`);
    assert.equal(spots.size, 100);
  });

  test("nobody overlaps while the floor has room at the tightest pitch, 50px (no overlap)", async () => {
    for (const [W, n] of [[1459, 30], [1459, 60], [2918, 100], [2918, 140]]) {
      const { v } = await arrive(n, { width: W });
      assert.ok(v.view.pitch >= 50, `${n} at ${W}: pitch ${v.view.pitch}`);
      assert.equal(overlapping(spotsOf(v)), null, `${n} at ${W}`);
    }
  });

  test("no two on one spot until every spot at the densest pitch is taken: 495 at 1459px, 1405 at 2918px", async () => {
    const { v } = await arrive(0);
    const view = v.view;
    const distinct = (n, W) => {
      const list = Array.from({ length: n }, (_, i) => ({ address: `z${i}`, status: "idle" }));
      for (const a of list) view.sprites[a.address] = "wizard";
      view.place(list, W);
      return new Set(list.map((a) => key(view.home[a.address]))).size === n;
    };
    for (const [W, most] of [[1459, 495], [2918, 1405]]) {
      for (const n of THOROUGH ? [13, 40, 100, 250, most - 1, most] : [40, most]) assert.ok(distinct(n, W), `${n} at ${W}`);
      assert.ok(!distinct(most + 1, W), `${most + 1} at ${W}: one more than there are spots`);
    }
  });

  test("the stations, their tags and the campfire are kept clear; the crowd spreads over the width", async () => {
    for (const W of THOROUGH ? [640, 800, 1280, 1459, 1920, 2918] : [1280, 1459, 2918])
      for (const n of [30, 100, 400]) {
        // (a5 dropped by a drag before the training dummy, its bubble over the dummy's tag)
        const dropped = { x: 228, y: 100 };
        const { v } = await arrive(n, { width: W, spots: { a5: dropped } });
        if (v.view.pitch === null) continue; // a small party at this width: the default spots (above)
        assert.deepEqual(v.view.at.a5, dropped);
        assert.ok(!v.view.bubbled.has("a5"), "the dropped one's bubble is left out");
        const fire = fireX(W);
        const spots = v.world.agents.filter((a) => a.address !== "a5").map((a) => v.view.at[a.address]);
        for (const s of spots) {
          assert.ok(s.y >= 110 || s.x >= STATION_X, `${key(s)} before the stations at ${W}`);
          if (fire !== null) assert.ok(Math.abs(s.x - fire) >= FIRE_CLEAR, `${key(s)} in the campfire (${fire}) at ${W}`);
        }
        // the stations' tags are never under an agent's bubble or tag
        const stationTags = ["codex", "skills", "shop"].map((s) => v.box(`idle-rpg-station-${s}-tag`));
        for (const a of v.world.agents) {
          if (v.has(`idle-rpg-label-${a.address}`)) for (const b of stationTags) assert.ok(!overlap(v.box(`idle-rpg-label-${a.address}`), b));
          if (!v.view.bubbled || v.view.bubbled.has(a.address)) {
            const { x, y } = v.view.at[a.address];
            const bubble = { idle: { x: x + 4, y: y - 120, w: 64, h: 64 }, working: { x: x - 30, y: y - 104, w: 60, h: 40 }, blocked: { x: x - 18, y: y - 114, w: 36, h: 46 }, done: { x: x - 18, y: y - 108, w: 36, h: 40 } }[a.status];
            for (const b of stationTags) assert.ok(!overlap(bubble, b), `${a.address}'s bubble over a station's tag at ${W}`);
          }
        }
        // spread over the width: both ends of the floor are used (not piled at one side); at
        // 640-679px nobody fits right of the campfire, so the floor ends at its left side
        const xs = spots.map((s) => s.x);
        const end = fire !== null && fire + FIRE_CLEAR > W - 36 ? fire - FIRE_CLEAR : W - 36;
        assert.ok(Math.min(...xs) <= 36 + 120 && Math.max(...xs) >= end - 120, `${n} at ${W}: ${Math.min(...xs)}..${Math.max(...xs)}`);
      }
  });

  test("rows interleave (brick): neighbouring rows are offset by half the pitch", async () => {
    const { v } = await arrive(60, { width: 1459 });
    const dx = v.view.pitch;
    const rows = new Map();
    for (const s of spotsOf(v)) rows.set(s.y, [...(rows.get(s.y) ?? []), s.x]);
    const ys = [...rows.keys()].sort((a, b) => b - a);
    assert.ok(ys.length >= 3, `${ys.length} rows`);
    for (let r = 1; r < ys.length; r++) {
      const ox = (x) => (((x - rows.get(ys[0])[0]) % dx) + dx) % dx;
      for (const x of rows.get(ys[r])) assert.equal(ox(x), r % 2 ? Math.floor(dx / 2) : 0, `row ${ys[r]}`);
      assert.ok(ys[r - 1] - ys[r] >= 30, "rows at least 30px apart while nobody overlaps");
    }
  });

  test("an older save with agents stacked on one spot spreads out: a default one, or one a narrow window clamped them to", async () => {
    for (const spot of [{ x: 250, y: 64 }, { x: 864, y: 64 }]) {
      // a small party: all 8 on the one spot
      const { v } = await arrive(8, { spots: Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`a${i}`, spot])) });
      assert.equal(v.view.pitch, null);
      assert.equal(new Set(spotsOf(v).map(key)).size, 8, `8 saved on ${key(spot)}`);
      assert.deepEqual(v.view.at.a0, spot, "the first keeps it");
      // in a crowd: 4 of 100 on the one spot
      const { v: c } = await arrive(100, { width: 1459, spots: Object.fromEntries(Array.from({ length: 4 }, (_, i) => [`a${i}`, spot])) });
      assert.equal(new Set(spotsOf(c).map(key)).size, 100, `4 of 100 saved on ${key(spot)}`);
    }
    // an older save with a crowd stacked on the default spots
    const spots = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`a${i}`, { x: 250 + (i % 11) * 88, y: i % 22 < 11 ? 64 : 104 }]));
    const { v } = await arrive(100, { spots });
    assert.equal(new Set(spotsOf(v).map(key)).size, 100);
    // and once it shrinks to a small party, those left get default spots of their own
    v.setAgents(v.world.agents.slice(0, 8));
    assert.equal(v.view.pitch, null);
    assert.equal(new Set(v.world.agents.map((a) => key(v.view.at[a.address]))).size, 8);
  });

  test("seats are kept: one leaving or joining moves nobody else while the lattice stays", async (t) => {
    for (const n of [30, 100, 400]) {
      const { v } = await arrive(n, { width: 1459 });
      const before = { ...v.view.at };
      const lattice = { ...v.view.seats };
      // one from the middle leaves
      const gone = v.world.agents[Math.floor(n / 2)].address;
      v.setAgents(v.world.agents.filter((a) => a.address !== gone));
      assert.equal(v.view.seats.dx, lattice.dx, `${n}: the lattice stays as one leaves`);
      for (const a of v.world.agents) assert.deepEqual(v.view.at[a.address], before[a.address], `${n}: ${a.address} moved as ${gone} left`);
      // and one joins
      const after = { ...v.view.at };
      const was = { dx: v.view.seats.dx, rows: v.view.seats.rows.join() };
      v.setAgents([...v.world.agents, agent("new1", "idle")]);
      const same = v.view.seats.dx === was.dx && v.view.seats.rows.join() === was.rows;
      if (same) for (const a of v.world.agents) if (a.address !== "new1") assert.deepEqual(v.view.at[a.address], after[a.address], `${n}: ${a.address} moved as one joined`);
      assert.ok(!spotsOf(v).some((s, i) => v.world.agents[i].address !== "new1" && key(s) === key(v.view.at.new1)), "the newcomer on a seat of its own");
      t.diagnostic(`${n}: a join ${same ? "kept the lattice" : "changed the lattice"}`);
    }
  });

  test("the seats' memory holds only those here, over 1,000 comings and goings", async () => {
    const { v } = await arrive(100, { width: 1459 });
    // (place() alone, as each render calls it: a render a step would only be slower)
    let list = v.world.agents;
    for (let i = 0; i < 1000; i++) {
      list = [...list.slice(1), agent(`m${i}`, STATUSES[i % 4])];
      v.view.sprites[`m${i}`] = CLASSES[i % 4];
      v.view.place(list, 1459);
      assert.ok(v.view.seats.seat.size <= 100, `${v.view.seats.seat.size} seats`);
    }
    v.setAgents(list);
    assert.equal(new Set(spotsOf(v).map(key)).size, 100);
  });
});

describe("a spot chosen by a drag", () => {
  test("is kept in a crowd, and nobody else moves for it", async () => {
    const chosen = { x: 1100, y: 33 }; // not a default spot, nor behind the campfire (736 at 1459)
    const { v } = await arrive(100, { width: 1459, spots: { a7: chosen } });
    assert.deepEqual(v.view.at.a7, chosen);
    const before = { ...v.view.at };
    // its lattice spot is left empty: the same crowd with nobody's spot chosen stands the same
    const { v: plain } = await arrive(100, { width: 1459 });
    for (const a of v.world.agents) if (a.address !== "a7") assert.deepEqual(before[a.address], plain.view.at[a.address], a.address);
    assert.ok(spotsOf(plain).every((s) => key(s) !== key(chosen)));
  });

  test("dragging works in a crowd: the drop is saved and kept, everyone else stays", async () => {
    const { v } = await arrive(100, { width: 1459 });
    const before = { ...v.view.at };
    v.press("critter-a42");
    v.move({ x: 1000, y: 300 });
    v.move({ x: 1010, y: 290 });
    assert.equal(v.view.drag.address, "a42");
    v.release({ x: 1010, y: 290 });
    const dropped = { x: 1010, y: 290 - (360 - 152) };
    assert.deepEqual(v.stored.spots.a42, dropped);
    assert.deepEqual(v.view.at.a42, dropped);
    for (const a of v.world.agents) if (a.address !== "a42") assert.deepEqual(v.view.at[a.address], before[a.address], a.address);
  });

  test("a drop never lands on a default spot (which would read as given out, not chosen)", async () => {
    const { v } = await arrive(3, { width: 1280 });
    v.press("critter-a1");
    v.move({ x: 600, y: 300 });
    v.move({ x: 602, y: 64 + (360 - 152) });
    v.release({ x: 602, y: 64 + (360 - 152) });
    assert.deepEqual(v.stored.spots.a1, { x: 602, y: 65 });
  });
});

describe("a crowd in a raid", () => {
  test("100 and 400 working agents render, the whole party in the fight", async () => {
    for (const n of [100, 400]) {
      const { v } = await arrive(n, { view: "raid", status: "working" });
      v.advance(3000);
      assert.equal(Object.keys(v.view.party.members).length, n + 1);
      assert.equal(v.text("idle-rpg-hud")[0], "99+");
    }
  });

  for (const [what, classes] of [["100 a class", CLASSES], ["only warriors", ["warrior"]], ["only archers", ["archer"]], ["only healers", ["healer"]]])
    test(`${what}: off the boss, warriors nearest it, both sides even, no two on one spot`, async () => {
      for (const W of THOROUGH ? [1280, 1459, 1920, 2918] : [1459, 2918])
        for (const kindName of Object.keys(MONSTERS)) {
          const n = classes.length === 1 ? 100 : 400;
          const { v } = await arrive(0, { width: W });
          const list = Array.from({ length: n }, (_, i) => ({ address: `r${i}`, status: "working" }));
          list.forEach((a, i) => (v.view.sprites[a.address] = classes[i % classes.length]));
          const kind = MONSTERS[kindName];
          const f = v.view.formation(list, W, kind);
          const mid = Math.round(W / 2);
          const half = kind.w / 2;
          assert.ok(v.view.formed !== null, "a crowd");
          assert.equal(new Set(list.map((a) => key(f[a.address]))).size, n, `${what} against the ${kindName} at ${W}`);
          const sides = { [-1]: { melee: [], ranged: [] }, 1: { melee: [], ranged: [] } };
          for (const a of list) {
            const s = f[a.address];
            const melee = v.view.sprites[a.address] === "warrior";
            const d = Math.abs(s.x - mid);
            assert.ok(s.x >= 36 && s.x <= W - 36);
            assert.equal(s.dir, s.x < mid ? 1 : -1, "facing the boss");
            // off the boss's body: only the warriors' front line stands before it, the rest outside its picture
            if (!melee || s.y < 114) assert.ok(d >= half + 30, `${a.address} (${v.view.sprites[a.address]}) at ${key(s)} on the ${kindName} at ${W}`);
            else assert.ok(d >= kind.core.half + 44 - Math.abs(kind.core.x), `${a.address} in the boss's bulk`);
            sides[s.x < mid ? -1 : 1][melee ? "melee" : "ranged"].push(d);
          }
          for (const g of ["melee", "ranged"]) assert.ok(Math.abs(sides[-1][g].length - sides[1][g].length) <= 1, `${g} even on both sides`);
          for (const side of [-1, 1]) {
            const { melee, ranged } = sides[side];
            if (melee.length && ranged.length) assert.ok(Math.max(...melee) <= Math.min(...ranged) + v.view.formed, `warriors nearer the boss than the ranged on side ${side}`);
          }
        }
    });

  // The widest a crowd stands at 88px or more (every tag fits) with an even class mix
  // (warrior, wizard, archer, healer in turn), by width and boss; and from how
  // many the lattice takes over from the old formation (13 at the earliest: up
  // to 12 always keep it).
  const ROOMY = {
    1280: { slime: [15, 38], ogre: [13, 38], dragon: [13, 27] },
    1459: { slime: [18, 48], ogre: [15, 40], dragon: [13, 38] },
    1920: { slime: [28, 70], ogre: [26, 70], dragon: [23, 59] },
  };
  const EVEN = ["warrior", "wizard", "archer", "healer"];
  async function raidAt(n, W, kindName, mix = EVEN) {
    const { v } = await arrive(0, { width: W });
    const list = Array.from({ length: n }, (_, i) => ({ address: `r${i}`, status: "working" }));
    list.forEach((a, i) => (v.view.sprites[a.address] = mix[i % mix.length]));
    const f = v.view.formation(list, W, MONSTERS[kindName]);
    return { v, list, f };
  }

  test("16 to 40 agents: every row 88px or more apart while the side has room (counts above), the ranged spread over their whole zone", async (t) => {
    for (const W of [1280, 1459, 1920])
      for (const kindName of Object.keys(MONSTERS))
        for (const n of [16, 24, 30, 40]) {
          const { v, list, f } = await raidAt(n, W, kindName);
          const [from, roomy] = ROOMY[W][kindName];
          const where = `${n} against the ${kindName} at ${W}`;
          if (n < from) {
            assert.equal(v.view.formed, null, `${where}: the old formation`);
            continue;
          }
          assert.ok(v.view.formed !== null, `${where}: a crowd`);
          const kind = MONSTERS[kindName];
          const mid = Math.round(W / 2);
          for (const side of [-1, 1]) {
            const mine = list.filter((a) => (f[a.address].x < mid ? -1 : 1) === side);
            const d = (a) => Math.abs(f[a.address].x - mid);
            const warriors = mine.filter((a) => v.view.sprites[a.address] === "warrior");
            const ranged = mine.filter((a) => v.view.sprites[a.address] !== "warrior");
            // neighbours in a row
            let step = Infinity;
            let rangedStep = Infinity;
            const rows = new Map();
            for (const a of mine) rows.set(f[a.address].y, [...(rows.get(f[a.address].y) ?? []), a]);
            for (const row of rows.values()) {
              row.sort((p, q) => d(p) - d(q));
              for (let i = 1; i < row.length; i++) {
                const gap = d(row[i]) - d(row[i - 1]);
                step = Math.min(step, gap);
                if (v.view.sprites[row[i].address] !== "warrior" && v.view.sprites[row[i - 1].address] !== "warrior") rangedStep = Math.min(rangedStep, gap);
              }
            }
            if (n <= roomy) assert.ok(step >= 88, `${where}, side ${side}: neighbours ${step}px apart`);
            else assert.ok(step >= 50 || n > 2 * roomy, `${where}, side ${side}: neighbours ${step}px apart`);
            if (!ranged.length || !Number.isFinite(rangedStep)) continue;
            // the ranged block reaches the edge, and starts within a step of the warriors'
            // ranks plus the fixed gap (one warriors' step, at most 88, and 24px)
            const edge = side < 0 ? mid - 36 : W - 36 - mid;
            const outer = Math.max(...ranged.map(d));
            const inner = Math.min(...ranged.map(d));
            const ranks = warriors.length ? Math.max(...warriors.map(d)) + 88 + 24 : kind.w / 2 + 30;
            assert.ok(outer >= edge - rangedStep, `${where}, side ${side}: the outermost ranged at ${outer} of ${edge}`);
            assert.ok(inner <= Math.max(ranks, kind.w / 2 + 30) + rangedStep, `${where}, side ${side}: the innermost ranged at ${inner}, the warriors' ranks end at ${ranks - 112}`);
            assert.ok(inner >= kind.w / 2 + 30, "outside the boss's picture");
          }
          t.diagnostic(`${where}: pitch ${v.view.formed}`);
        }
  });

  test("the lattice takes over from the old formation at 13 at the earliest: up to 12 keep it, piled or not", async () => {
    for (const W of [1280, 1459])
      for (const kindName of Object.keys(MONSTERS)) {
        const { v, list, f } = await raidAt(12, W, kindName);
        assert.equal(v.view.formed, null);
        const old = oldFormation(list.map((a) => v.view.sprites[a.address]), W, MONSTERS[kindName]);
        list.forEach((a, i) => assert.deepEqual(f[a.address], old[i]));
        const [from] = ROOMY[W][kindName];
        assert.equal((await raidAt(from - 1, W, kindName)).v.view.formed, null);
        assert.ok((await raidAt(from, W, kindName)).v.view.formed !== null);
      }
  });

  test("at the hand-over nobody crosses the floor: each keeps its side and moves less than half of it", async (t) => {
    let most = 0;
    for (const W of [1280, 1459, 1920])
      for (const kindName of Object.keys(MONSTERS)) {
        const [from] = ROOMY[W][kindName];
        const { v, list, f } = await raidAt(from, W, kindName);
        const old = oldFormation(list.map((a) => v.view.sprites[a.address]), W, MONSTERS[kindName]);
        list.forEach((a, i) => {
          assert.equal(Math.sign(f[a.address].x - W / 2), Math.sign(old[i].x - W / 2), `${a.address} keeps its side`);
          const moved = Math.abs(f[a.address].x - old[i].x);
          most = Math.max(most, moved / (W / 2));
          assert.ok(moved <= W / 4, `${a.address} moves ${moved}px against the ${kindName} at ${W}`);
        });
      }
    t.diagnostic(`the most anyone moves at the hand-over: ${(most * 100).toFixed(0)}% of its side`);
  });
});

describe("name tags in a crowd", () => {
  test("a roomy crowd (pitch 88 or more) shows every tag, drawn over everyone, none over another", async () => {
    const { v } = await arrive(30, { width: 1459 });
    assert.ok(v.view.pitch >= 88, `pitch ${v.view.pitch}`);
    const tags = v.world.agents.map((a) => v.box(`idle-rpg-label-${a.address}`));
    for (let i = 0; i < tags.length; i++) for (let j = i + 1; j < tags.length; j++) assert.ok(!overlap(tags[i], tags[j]), `tags ${i} and ${j}`);
  });

  test("tighter than a tag is wide: only those that need you, the one under the pointer and the one with its card open; never one over another; yours always", async () => {
    for (const [n, W] of [[100, 1459], [400, 1459], [400, 2918]]) {
      const { v } = await arrive(n, { width: W });
      assert.ok(v.view.pitch < 88 && v.view.thin, `pitch ${v.view.pitch}`);
      const shown = v.world.agents.filter((a) => v.has(`idle-rpg-label-${a.address}`));
      assert.ok(shown.length > 0);
      for (const a of shown) assert.ok(["blocked", "done"].includes(a.status), `${a.address} is ${a.status}`);
      const boxes = shown.map((a) => v.box(`idle-rpg-label-${a.address}`));
      for (let i = 0; i < boxes.length; i++) for (let j = i + 1; j < boxes.length; j++) assert.ok(!overlap(boxes[i], boxes[j]), `${shown[i].address} and ${shown[j].address}`);
      // every blocked agent's tag shows, where the floor allows (one left out only for another before it)
      const blocked = v.world.agents.filter((a) => a.status === "blocked");
      assert.ok(blocked.filter((a) => v.has(`idle-rpg-label-${a.address}`)).length >= Math.min(blocked.length, 20));
      assert.deepEqual(v.text("idle-rpg-you-tag"), ["YOU"]);
    }
    // the pointer over an idle one shows its tag; it goes again when the pointer leaves
    const { v } = await arrive(100, { width: 1459 });
    assert.ok(!v.has("idle-rpg-label-a40"));
    v.hover("critter-a40");
    assert.ok(v.has("idle-rpg-label-a40"));
    v.hover("critter-a40", false);
    assert.ok(!v.has("idle-rpg-label-a40"));
    // and its card open shows it
    v.click("critter-a44");
    v.release("critter-a44");
    assert.equal(v.view.card, "a44");
    assert.ok(v.has("idle-rpg-label-a44"));
  });

  test("400 in a raid, the same name each, 60% working, 20% idle, 10% done, 10% blocked: no tag over another, as drawn", async (t) => {
    const statuses = (i) => (i % 10 < 6 ? "working" : i % 10 < 8 ? "idle" : i % 10 === 8 ? "done" : "blocked");
    const list = Array.from({ length: 400 }, (_, i) => agent(`k${i}`, statuses(i), { space_name: "Keep", tab_name: "Hall" }));
    const { saved } = raid({ view: "raid", classes: [], stage: 30 }); // the dragon
    saved.best = 30;
    saved.sprites = { you: "archer", ...Object.fromEntries(list.map((a, i) => [a.address, ["warrior", "wizard", "archer", "healer"][i % 4]])) };
    saved.seen = Object.fromEntries(list.map((a) => [a.address, 1_800_000_000_000]));
    const v = await mountView({ saved, agents: list, width: 1459 });
    v.advance(3000);
    v.render();
    const tags = v.ids("idle-rpg-label-").map((id) => v.box(id));
    assert.ok(tags.length >= 20, `${tags.length} tags`);
    let closest = Infinity;
    for (let i = 0; i < tags.length; i++)
      for (let j = i + 1; j < tags.length; j++) {
        assert.ok(!overlap(tags[i], tags[j]), `${JSON.stringify(tags[i])} and ${JSON.stringify(tags[j])}`);
        if (tags[i].x < tags[j].x + tags[j].w && tags[j].x < tags[i].x + tags[i].w) closest = Math.min(closest, Math.abs(tags[i].y - tags[j].y) - 18);
      }
    t.diagnostic(`${tags.length} tags; the closest one above another leaves ${closest}px between them`);
    assert.ok(closest >= 4, "two tags one above the other keep 4px apart");
  });

  test("YOU is never covered: no agent's tag or bubble over your tag, and you are drawn over every agent", async () => {
    for (const youAt of [{ x: 600, y: 70 }, { x: 1000, y: 110 }]) {
      const list = Array.from({ length: 100 }, (_, i) => agent(`a${i}`, STATUSES[i % 4], { space_name: `s${i}`, tab_name: "t" }));
      const { saved } = raid({ view: "town", classes: [], youAt });
      saved.sprites = { you: "archer", ...Object.fromEntries(list.map((a, i) => [a.address, CLASSES[i % 4]])) };
      saved.seen = Object.fromEntries(list.map((a) => [a.address, 1_800_000_000_000]));
      const v = await mountView({ saved, agents: list, width: 1459 });
      assert.ok(v.view.thin);
      // your tag is under your sprite, centred (a column the harness does not lay out: worked out here)
      const w = v.box("idle-rpg-you-tag").w;
      const yours = { x: v.view.you.x - w / 2, y: v.view.you.y + 6 + (360 - 152), w, h: 18 };
      for (const id of v.ids("idle-rpg-label-")) assert.ok(!overlap(v.box(id), yours), `${id} over YOU at ${key(youAt)}`);
      for (const a of list.filter((a) => v.view.bubbled.has(a.address))) {
        const { x, y } = v.view.at[a.address];
        const bubble = { idle: { x: x + 4, y: y - 120, w: 64, h: 64 }, working: { x: x - 30, y: y - 104, w: 60, h: 40 }, blocked: { x: x - 18, y: y - 114, w: 36, h: 46 }, done: { x: x - 18, y: y - 108, w: 36, h: 40 } }[a.status];
        assert.ok(!overlap({ ...bubble, y: bubble.y + (360 - 152) }, yours), `${a.address}'s bubble over YOU`);
      }
      // drawn over every agent (paint order: later is on top)
      const order = v.all(() => true);
      const mine = order.findIndex((el) => el.key === "idle-rpg-you");
      const last = Math.max(...order.map((el, i) => (el.key?.startsWith("critter-") ? i : -1)));
      assert.ok(mine > last, "you after every agent");
    }
  });

  test("the pointer's agent: forgotten once the crowd loosens or it goes; coming back to it is no render", async () => {
    const { v } = await arrive(100, { width: 1459 });
    v.hover("critter-a41"); // idle: its tag shows only for the pointer
    assert.ok(v.has("idle-rpg-label-a41"));
    const renders = v.renders;
    v.hover("critter-a41"); // the pointer arriving again on the one it is over
    assert.equal(v.renders, renders, "no render");
    // the crowd loosens (no hover tracked then), then grows back: a41's tag is not left showing
    const all = v.world.agents;
    v.setAgents(all.slice(0, 20));
    assert.equal(v.view.hover, null);
    v.setAgents(all);
    assert.ok(v.view.thin);
    assert.ok(!v.has("idle-rpg-label-a41"), "no tag without the pointer");
    // and an agent that goes is forgotten
    v.hover("critter-a45");
    v.setAgents(all.filter((a) => a.address !== "a45"));
    assert.equal(v.view.hover, null);
  });

  test("where characters overlap, the top-most takes a press and the pointer; leaving another changes nothing", async () => {
    const { v } = await arrive(400, { width: 1459 });
    // two neighbours in rows next to each other, their sprites overlapping: the nearer (lower) one is drawn on top
    const list = v.world.agents;
    let pair = null;
    for (const p of list)
      for (const q of list) {
        const [a, b] = [v.view.at[p.address], v.view.at[q.address]];
        if (!pair && a.y > b.y && a.y - b.y < 30 && Math.abs(a.x - b.x) < 20) pair = [p.address, q.address];
      }
    assert.ok(pair, "two overlapping");
    const [front, back] = pair;
    v.pressStack([`critter-${front}`, `critter-${back}`]);
    assert.equal(v.view.press.address, front, "the top-most takes the press");
    v.release();
    assert.equal(v.view.card, front);
    v.click("idle-rpg-card-x");
    v.hoverStack([`critter-${front}`, `critter-${back}`]);
    assert.equal(v.view.hover, front, "and the pointer");
    v.hoverStack([`critter-${back}`], false);
    assert.equal(v.view.hover, front, "leaving one that is not it");
  });

  test("tags thin under 88px apart and come back only from 96 (the band between keeps them as they were)", async () => {
    const { v } = await arrive(30, { width: 1459 });
    assert.ok(v.view.pitch >= 88 && v.view.pitch < 96 && !v.view.thin, `pitch ${v.view.pitch}`);
    const all = v.world.agents;
    v.setAgents([...all, ...Array.from({ length: 70 }, (_, i) => agent(`b${i}`, "idle"))]);
    assert.ok(v.view.thin);
    v.setAgents(all);
    assert.ok(v.view.pitch >= 88 && v.view.pitch < 96, `pitch ${v.view.pitch}`);
    assert.ok(v.view.thin, "still thinned in the band");
    v.setAgents(all.slice(0, 25));
    assert.ok(v.view.pitch >= 96 && !v.view.thin, `pitch ${v.view.pitch}`);
  });

  test("tighter than a tag is wide: bubbles and HP bars are laid the same way, none over another", async () => {
    const { v } = await arrive(400, { width: 1459 });
    assert.ok(v.view.bubbled.size > 0 && v.view.bubbled.size < 400);
    const { v: r } = await arrive(400, { view: "raid", status: "working", width: 1459 });
    r.advance(3000);
    r.render();
    const bars = r.ids("idle-rpg-hp-").filter((id) => id !== "idle-rpg-hp-you").map((id) => r.box(id));
    assert.ok(bars.length > 20 && bars.length < 400, `${bars.length} bars`);
    for (let i = 0; i < bars.length; i++) for (let j = i + 1; j < bars.length; j++) assert.ok(!overlap(bars[i], bars[j]), `bars ${i} and ${j}`);
    // a tenth knocked out: their rings (and the stars under them) are laid first, clear of each other and of every bar
    const members = r.view.party.members;
    const felled = Object.keys(members).filter((k, i) => k !== "you" && i % 10 === 0);
    for (const k of felled) Object.assign(members[k], { hp: 0, down: r.view.clock + 120 });
    const renders = r.renders;
    const elements = (h) => h.all(() => true).length;
    const before = elements(r);
    r.render();
    const rings = r.ids("idle-rpg-rest-ring-").map((id) => r.box(id));
    // what a knocked-out fighter shows over its head: the ring, and the stars from 66px over its feet (75x37 as they bob)
    const feet = r.ids("idle-rpg-rest-ring-").map((id) => r.box(`idle-rpg-vitals-${id.slice("idle-rpg-rest-ring-".length)}`));
    const marks = [...rings, ...feet.map((f) => ({ x: f.x - 38, y: f.y - 66, w: 75, h: 37 }))];
    const now = r.ids("idle-rpg-hp-").filter((id) => id !== "idle-rpg-hp-you").map((id) => r.box(id));
    assert.ok(rings.length > 5 && rings.length <= felled.length, `${rings.length} rings of ${felled.length} down`);
    for (let i = 0; i < rings.length; i++) for (let j = i + 1; j < rings.length; j++) assert.ok(!overlap(rings[i], rings[j]), `rings ${i} and ${j}`);
    for (const m of marks) for (const b of now) assert.ok(!overlap(m, b), "a ring or its stars over a bar");
    assert.equal(r.renders, renders + 1, "the one render asked for");
    assert.ok(elements(r) <= before * 1.05, `${elements(r)} elements against ${before}`);
  });
});

describe("the boss's area attack in a crowd", () => {
  const EVEN = ["warrior", "wizard", "archer", "healer"];
  const inRing = (p, x, y) => ((p.x - x) / 70) ** 2 + ((p.y - y) / 35) ** 2 <= 1;
  // Plays `n` working agents (an even mix) and you against the boss of `stage` (30, the dragon)
  // and checks every area attack that lands: as many caught as the old
  // formation (main's) has standing inside the ring round the target's spot
  // there, the target among them if it stands; and `exact`: they are exactly
  // those (a small party, drawn where main draws it). Returns the counts.
  async function areas(n, { stage = 30, exact = false, want = 3, seed = 1 } = {}) {
    const classes = Array.from({ length: n }, (_, i) => EVEN[i % 4]);
    const v = await mountRaid({ classes, you: "archer", stage, health: 40, level: 30 }, { width: 1459, seed });
    const view = v.view;
    const counts = [];
    let seen = null;
    for (let i = 0; i < 2400 && counts.length < want; i++) {
      v.advance(250);
      const a = view.party.foe.last;
      if (!a || a.kind !== "area" || a.id === seen || a.lands !== view.clock) continue;
      seen = a.id;
      const members = view.party.members;
      const keys = Object.keys(members);
      // on their feet as it landed: up, or knocked out by this very blow
      const stood = keys.filter((k) => members[k].down === null || (members[k].hitAt === a.lands && members[k].down === a.lands + KO_TICKS));
      const hit = keys.filter((k) => members[k].hitAt === a.lands);
      const order = v.world.agents.map((ag) => ag.address);
      // (the boss now: one killed in the meantime has made way for the next)
      const old = oldFormation(order.map((k) => view.sprites[k]), 1459, MONSTERS[view.monster.kind]);
      const oldAt = (k) => (k === "you" ? view.you : old[order.indexOf(k)]);
      // the spot it was aimed at as the attack started: the target's there, in the old formation
      const target = { x: a.ox ?? a.x, y: a.oy ?? a.y };
      const want = stood.filter((k) => inRing(oldAt(k), target.x, target.y));
      assert.equal(hit.length, want.length, `${n} agents: caught ${hit}, main would catch ${want} (target ${a.target} at ${JSON.stringify(target)})`);
      if (stood.includes(a.target) && inRing(view.party.members[a.target], a.x, a.y)) assert.ok(hit.includes(a.target), "the target is among them");
      if (exact) assert.deepEqual(hit.sort(), want.sort());
      counts.push(hit.length);
    }
    assert.equal(counts.length, want, `${n} agents: only ${counts.length} area attacks landed`);
    return counts;
  }

  test("a party of up to 12 is caught exactly as in main", async () => {
    for (const n of [3, 8, 12]) await areas(n, { exact: true });
  });

  test("13, 30, 100 and 400: as many caught as main's formation puts in the ring", async (t) => {
    for (const n of [13, 30, 100, 400]) {
      const counts = await areas(n, { want: n >= 100 ? (THOROUGH ? 2 : 1) : 3 });
      t.diagnostic(`${n} agents: caught ${counts.join(", ")}`);
    }
  });

  test("30 agents: the simulation's first area attack catches as many as the view's", async () => {
    const o = { classes: Array.from({ length: 30 }, (_, i) => EVEN[i % 4]), you: "archer", stage: 30, health: 40, level: 30 }; // the dragon
    const v = await mountRaid(o, { seed: 1 }); // (seed 5 caught one at stage 30, the dragon's since the biomes' monsters)
    const s = loadState(raid({ now: timeAt(), ...o }).saved);
    const progress = { stage: s.stage, best: s.best, farming: s.farming, slain: s.slain, gold: s.gold, kills: s.kills, xp: s.xp, skills: s.skills, training: s.training, looks: s.looks, hats: s.hats };
    const all = v.world.agents;
    const f = new Fight({ progress, agents: all.map((a) => a.address), idle: [], order: all.map((a) => a.address), sprites: s.sprites, you: s.you, settings: s.settings, random: seeded(1) });
    // the first area attack each lands, and how many it caught, seen tick by tick
    const first = { view: null, sim: null };
    const look = (x, which) => {
      const a = x.party.foe.last;
      if (first[which] || a?.kind !== "area" || a.lands !== x.clock) return;
      first[which] = { lands: a.lands, hits: Object.values(x.party.members).filter((m) => m.hitAt === a.lands).length };
    };
    for (let tick = 0; tick < 2400 && !(first.view && first.sim); tick++) {
      v.advance(250);
      f.step();
      look(v.view, "view");
      look(f, "sim");
      if (!first.view) assert.equal(v.view.clock, f.clock, "in step until then");
    }
    assert.ok(first.view && first.sim, "an area attack landed in both");
    assert.deepEqual(first.view, first.sim);
    assert.ok(first.sim.hits >= 2, `a catch of several: ${first.sim.hits}`);
  });
});
