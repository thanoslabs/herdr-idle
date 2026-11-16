// Many agents at once. BASELINE for a planned fix: today 400 agents (100 a
// class) fail to render in the real app ("interrupted" inside place(), whose
// search for a free spot for each newcomer scans every spot for each of up to
// 200 candidate places: quadratic in the agent count, see PLAN.md, Next wave).
// These tests document today's behaviour: the work place() does for 50, 100,
// 200 and 400 newcomers (counted, not timed), and that the harness still
// renders them. When place() is fixed, the growth assertion below should be
// changed to expect linear growth (and the crowding expectations updated).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { agent, mountView, raid } from "./harness/view.mjs";

const CLASSES = ["wizard", "healer", "warrior", "archer"];

// Mounts `n` agents arriving at once (classes known, so no save in the
// middle) and counts the spots place() reads looking for free ones: every
// Object.entries(this.spots) it makes reads every spot.
async function arrive(n, { battle = false, status = "idle" } = {}) {
  const list = Array.from({ length: n }, (_, i) => agent(`a${i}`, status));
  const { saved } = raid({ battle, classes: [] });
  saved.sprites = { you: "archer", ...Object.fromEntries(list.map((a, i) => [a.address, CLASSES[i % 4]])) };
  saved.seen = Object.fromEntries(list.map((a) => [a.address, 1_800_000_000_000]));
  const v = await mountView({ saved, agents: [] });
  // counted by watching Object.entries on the spots for this one render (a Proxy would be cloned on save)
  let reads = 0;
  const entries = Object.entries;
  const spots = v.view.spots;
  Object.entries = (o) => {
    const out = entries(o);
    if (o === spots) reads += out.length;
    return out;
  };
  const started = performance.now();
  try {
    v.setAgents(list);
  } finally {
    Object.entries = entries;
  }
  return { v, reads, ms: performance.now() - started };
}

describe("a crowd arriving", () => {
  test("BASELINE: place() reads about n x min(n, 200) spots for n newcomers (quadratic)", async (t) => {
    const counts = {};
    for (const n of [50, 100, 200, 400]) {
      const { reads, ms } = await arrive(n);
      counts[n] = reads;
      t.diagnostic(`${n} agents: ${reads} spot reads, ${ms.toFixed(0)}ms in the harness`);
    }
    // doubling the agents more than triples the work at every step (quadratic, not linear)
    assert.ok(counts[100] > 3 * counts[50], JSON.stringify(counts));
    assert.ok(counts[200] > 3 * counts[100], JSON.stringify(counts));
    assert.ok(counts[400] > 3 * counts[200], JSON.stringify(counts));
    assert.ok(counts[400] > 1e7, `today's 400: ${counts[400]} reads`);
  });

  test("400 agents in town still render in the harness, each with a spot inside the scene", async () => {
    const { v } = await arrive(400);
    assert.equal(v.ids("critter-").length, 400);
    for (const a of v.world.agents) {
      const s = v.view.spots[a.address];
      assert.ok(s.x >= 36 && s.x <= 1280 - 36, `${a.address} at ${s.x}`);
    }
  });

  test("BASELINE: past the default spots, newcomers are placed on top of each other", async () => {
    const { v } = await arrive(100);
    const spots = new Set(v.world.agents.map((a) => `${v.view.spots[a.address].x},${v.view.spots[a.address].y}`));
    // the default grid at 1280px: two rows of 11 from x 250, 88px apart, less the two behind the campfire
    assert.equal(spots.size, 20, `${spots.size} distinct spots for 100 agents`);
    for (const p of spots) assert.match(p, /^(250|338|426|514|602|690|778|866|954|1042|1130),(64|104)$/);
  });

  test("100 and 400 working agents render in a raid, the whole party in the fight", async () => {
    for (const n of [100, 400]) {
      const { v } = await arrive(n, { battle: true, status: "working" });
      v.advance(3000);
      assert.equal(Object.keys(v.view.party.members).length, n + 1);
      assert.equal(v.text("idle-rpg-hud")[0], "99+");
    }
  });
});
