// Many agents at once. Today 400 agents (100 a class) fail to render in the
// real app ("interrupted" inside place(), whose search for a free spot reads
// every spot for each of up to 200 candidate places for each newcomer:
// quadratic in the agent count; see PLAN.md, Next wave), and past the default
// spots newcomers are stacked on each other. Following the suite's convention,
// the wanted behaviour is asserted as todos (they start passing when place()
// is fixed: remove the todo then); today's numbers are printed, not asserted.
// Recorded on the day this was written (spot reads by place(), harness time):
//   50: 193,100   100: 878,500   200: 3,629,300   400: 14,650,900 (about 1.2s)
//   100 agents in town at 1280px share 20 distinct spots.
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
  test("finding spots costs about linearly more as the crowd grows", { todo: "place() is quadratic today: 14.65M spot reads for 400 against 3.63M for 200 (x4.0)" }, async (t) => {
    const counts = {};
    for (const n of [50, 100, 200, 400]) {
      const { reads, ms } = await arrive(n);
      counts[n] = reads;
      t.diagnostic(`${n} agents: ${reads} spot reads, ${ms.toFixed(0)}ms in the harness`);
    }
    // doubling the crowd at most about doubles the work (2.5x allows for the default spots filling)
    for (const [a, b] of [[50, 100], [100, 200], [200, 400]]) assert.ok(counts[b] <= 2.5 * counts[a], `${a} -> ${b}: ${counts[a]} -> ${counts[b]}`);
  });

  test("400 agents in town still render in the harness, each with a spot inside the scene", async () => {
    const { v } = await arrive(400);
    assert.equal(v.ids("critter-").length, 400);
    for (const a of v.world.agents) {
      const s = v.view.spots[a.address];
      assert.ok(s.x >= 36 && s.x <= 1280 - 36, `${a.address} at ${s.x}`);
    }
  });

  test("a crowd is spread out: 100 agents in town get 100 distinct spots", { todo: "past the default spots newcomers are stacked: 100 agents share 20 spots at 1280px" }, async (t) => {
    const { v } = await arrive(100);
    const spots = new Set(v.world.agents.map((a) => `${v.view.spots[a.address].x},${v.view.spots[a.address].y}`));
    t.diagnostic(`${spots.size} distinct spots for 100 agents`);
    assert.equal(spots.size, 100);
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
