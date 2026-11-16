// Many agents at once (PLAN.md, Many agents at once). Small parties stand
// where they always have (place()'s default spots in town, formation()'s in a
// raid), pinned here against the old code. Past that a crowd stands on a brick
// lattice in one pass (main.js, townCrowd and raidCrowd): each on a spot of
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
import { agent, mountView, raid } from "./harness/view.mjs";

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
async function arrive(n, { battle = false, status = null, width = 1280, classes = CLASSES, spots = null, stage = 1 } = {}) {
  const list = Array.from({ length: n }, (_, i) => agent(`a${i}`, status ?? STATUSES[i % 4], { space_name: `s${i}`, tab_name: "t" }));
  const { saved } = raid({ battle, classes: [], stage });
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
      const { v, ms } = await arrive(n, { battle, status: battle ? "working" : null, width: 1459 });
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
  test("in a raid: the old formation, for every boss, while none of its spots overlap", async () => {
    const mixes = [CLASSES, ["warrior", "archer"], ["archer", "wizard", "healer"], ["warrior"]];
    let pinned = 0;
    for (const W of widths)
      for (const kind of Object.keys(MONSTERS))
        for (const mix of mixes)
          for (const n of THOROUGH ? [1, 2, 4, 6, 8, 10, 12] : [3, 6, 12]) {
            const classes = Array.from({ length: n }, (_, i) => mix[i % mix.length]);
            const old = oldFormation(classes, W, MONSTERS[kind]);
            if (overlapping(old)) continue; // piled in the corners: the crowd's to place
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
    const { v } = await arrive(6, { battle: true, status: "working", width: 1280 });
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
        const { v } = await arrive(n, { width: W });
        if (v.view.pitch === null) continue; // a small party at this width: the default spots (above)
        const fire = fireX(W);
        const spots = spotsOf(v);
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

  test("an older save with a crowd stacked on the default spots spreads out", async () => {
    const spots = Object.fromEntries(Array.from({ length: 100 }, (_, i) => [`a${i}`, { x: 250 + (i % 11) * 88, y: i % 22 < 11 ? 64 : 104 }]));
    const { v } = await arrive(100, { spots });
    assert.equal(new Set(spotsOf(v).map(key)).size, 100);
    // and once it shrinks to a small party, those left get default spots of their own
    v.setAgents(v.world.agents.slice(0, 8));
    assert.equal(v.view.pitch, null);
    assert.equal(new Set(v.world.agents.map((a) => key(v.view.at[a.address]))).size, 8);
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
      const { v } = await arrive(n, { battle: true, status: "working" });
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

  test("the ranged keep their range while there is room (from the old first spot outward)", async () => {
    // 20 archers against the dragon at 2918: the old formation piles none, but a crowd of 40 does
    const W = 2918;
    const { v } = await arrive(0, { width: W });
    const list = Array.from({ length: 40 }, (_, i) => ({ address: `r${i}`, status: "working" }));
    for (const a of list) v.view.sprites[a.address] = "archer";
    const f = v.view.formation(list, W, MONSTERS.dragon);
    const reach = Math.min(360, Math.round(W / 2) - 164 - 60);
    for (const a of list) assert.ok(Math.abs(f[a.address].x - Math.round(W / 2)) >= 164 + reach, `${a.address} at ${key(f[a.address])}`);
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

  test("tighter than a tag is wide: bubbles and HP bars are laid the same way, none over another", async () => {
    const { v } = await arrive(400, { width: 1459 });
    assert.ok(v.view.bubbled.size > 0 && v.view.bubbled.size < 400);
    const { v: r } = await arrive(400, { battle: true, status: "working", width: 1459 });
    r.advance(3000);
    r.render();
    const bars = r.ids("idle-rpg-hp-").filter((id) => id !== "idle-rpg-hp-you").map((id) => r.box(id));
    assert.ok(bars.length > 20 && bars.length < 400, `${bars.length} bars`);
    for (let i = 0; i < bars.length; i++) for (let j = i + 1; j < bars.length; j++) assert.ok(!overlap(bars[i], bars[j]), `bars ${i} and ${j}`);
  });
});
