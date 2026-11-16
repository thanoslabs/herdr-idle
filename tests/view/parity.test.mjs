// The simulation (tools/sim.mjs) and main.js play the same fight: the same
// seeded party, through the view harness and through the simulation's Fight,
// second by second, must agree on everything that decides the outcome (the
// boss's HP and id, the stage, gold, kills, every experience total, the
// party's HP and knockouts, the clock), with healers working and standing
// by, so the balance numbers never drift
// silently. When it fails, first decide which side is right: a parting can be
// a bug in main.js as well as a stale simulation (this test cannot say
// which). Find the cause, add a direct test for it in the view's or the
// rules' suites, and only then change the wrong side; never just copy the
// view into the simulation.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { loadState } from "../../mods/idle-rpg/rules.js";
import { Fight, seeded } from "../../tools/sim.mjs";
import { seeded as harnessSeeded } from "../harness/clock.mjs";
import { mountRaid, raid, timeAt } from "../harness/view.mjs";

const THOROUGH = Boolean(process.env.HERDR_TESTS_THOROUGH);

function snapshot(x) {
  const round = (n) => Math.round(n * 1e6) / 1e6;
  return {
    stage: x.progress.stage,
    best: x.progress.best,
    farming: x.progress.farming,
    slain: x.progress.slain,
    gold: x.progress.gold,
    kills: { ...x.progress.kills },
    xp: Object.fromEntries(Object.entries(x.progress.xp).map(([k, v]) => [k, round(v)])),
    boss: [x.monster.stage, x.monster.id, round(x.monster.hp)],
    left: x.left,
    clock: x.clock,
    party: Object.entries(x.party.members).map(([k, m]) => [k, round(m.hp), m.down]),
  };
}

// Plays `o` (raid() options) for `seconds` in both; returns the outcome (equal in both).
// `poke(x, sec)`, if given, is applied to the view and to the simulation alike after each second (the same nudge to both).
async function both(o, seconds, seed, poke = null) {
  const v = await mountRaid(o, { seed });
  const s = loadState(raid({ now: timeAt(), ...o }).saved);
  const progress = { stage: s.stage, best: s.best, farming: s.farming, slain: s.slain, gold: s.gold, kills: s.kills, xp: s.xp, skills: s.skills, training: s.training, looks: s.looks, hats: s.hats };
  const all = v.world.agents;
  const f = new Fight({
    progress,
    agents: all.filter((a) => a.status === "working").map((a) => a.address),
    idle: all.filter((a) => a.status !== "working").map((a) => a.address),
    order: all.map((a) => a.address),
    sprites: s.sprites,
    you: s.you,
    settings: s.settings,
    random: seeded(seed),
  });
  for (let sec = 1; sec <= seconds; sec++) {
    v.advance(1000);
    for (let i = 0; i < 4; i++) f.step();
    if (poke) {
      poke(v.view, sec);
      poke(f, sec);
    }
    assert.deepEqual(snapshot(f), snapshot(v.view), `the simulation and the view part at ${sec}s`);
  }
  return { view: v.view, fight: f };
}

describe("the simulation plays main.js's fight", () => {
  test("its random source is the harness's (the same numbers for the same seed)", () => {
    for (const seed of [1, 42, 99999]) {
      const sim = seeded(seed);
      const harness = harnessSeeded(seed);
      for (let i = 0; i < 1000; i++) assert.equal(sim(), harness());
    }
  });

  test("a push through first clears, knockouts and heals (3 agents and you, the healer)", async () => {
    const { fight } = await both({ classes: ["warrior", "archer", "wizard"], you: "healer", stage: 16, level: 8 }, THOROUGH ? 1800 : 480, 7);
    assert.ok(fight.stats.kills >= 1 && fight.stats.knockouts >= 3 && fight.stats.heals >= 10, JSON.stringify(fight.stats));
  });

  test("repeat kills below the best, each next boss after the 3s wait", async () => {
    const { fight } = await both({ classes: ["warrior", "archer", "wizard"], you: "archer", stage: 3, best: 10, level: 10 }, 180, 13);
    assert.ok(fight.stats.kills >= 3, JSON.stringify(fight.stats));
  });

  test("everyone down at once and getting up again, the clock running on", async () => {
    const { fight } = await both({ classes: ["wizard", "archer"], you: "archer", stage: 20, best: 20, level: 20 }, THOROUGH ? 900 : 300, 3);
    const first = fight.stats.attempts[0] ?? fight.attempt; // (the thorough run's goes on to a time-out)
    assert.ok(first.allDown >= 2 && fight.stats.knockouts >= 6, JSON.stringify({ first, stats: fight.stats }));
    for (const a of fight.stats.attempts) assert.ok(a.won || a.ms === 600000, "lost only at 0:00");
  });

  test("a time-out after a long hopeless fight: dropping back and farming", async () => {
    const { fight } = await both({ classes: ["wizard", "archer"], you: "archer", stage: 30, best: 30 }, 620, 3);
    assert.equal(fight.stats.timeouts, 1, JSON.stringify(fight.stats));
    assert.ok(fight.stats.attempts[0].allDown >= 5, JSON.stringify(fight.stats.attempts));
    assert.equal(fight.progress.farming, true);
  });

  test("a time-out, with every weapon effect and aura in play", async () => {
    const weapons = { warrior: "flame", archer: "frost", wizard: "venom", healer: "hex" };
    const { fight } = await both({ classes: ["warrior", "archer", "wizard", "wizard", "healer"], you: "healer", weapons, stage: 30, health: 60, level: 3 }, 620, 11);
    assert.equal(fight.stats.timeouts, 1, JSON.stringify(fight.stats));
  });

  test("idle healers keeping a party alive from the side", async () => {
    const { fight } = await both({ classes: ["warrior", "healer", "archer", "healer"], statuses: ["working", "idle", "working", "done"], you: "wizard", stage: 14, level: 8 }, THOROUGH ? 900 : 300, 21);
    assert.ok(fight.stats.sideHeals >= 20, JSON.stringify(fight.stats));
  });

  test("a healer standing by after a kill, with someone down and someone hurt: it waits for the next boss", async () => {
    // at 20s: t1 knocked out, t2 hurt, the boss on its last point
    const poke = (x, sec) => {
      if (sec !== 20) return;
      Object.assign(x.party.members.t1, { hp: 0, down: x.clock + 60 });
      x.party.members.t2.hp = x.party.members.t2.maxHp / 2;
      x.monster.hp = Math.min(x.monster.hp, 1);
    };
    const { fight } = await both({ classes: ["wizard", "archer", "healer"], statuses: ["working", "working", "idle"], you: "archer", stage: 6, level: 6, health: 10 }, 40, 23, poke);
    assert.ok(fight.stats.kills >= 1 && fight.stats.sideHeals >= 1, JSON.stringify(fight.stats));
  });

  test("a working healer on an aura vial that also heals", async () => {
    const { fight } = await both({ classes: ["warrior", "healer", "archer"], weapons: { healer: "might" }, you: "warrior", youAt: { x: 640, y: 120 }, stage: 12, level: 8 }, THOROUGH ? 900 : 300, 17);
    assert.ok(fight.stats.heals >= 10 && fight.stats.sideHeals === 0, JSON.stringify(fight.stats));
  });

  test("a storm wizard's chains and the haste and might auras", async () => {
    await both({ classes: ["wizard", "healer", "healer", "warrior"], weapons: { wizard: "storm", healer: "haste" }, you: "healer", stage: 5, level: 10 }, 240, 5);
    await both({ classes: ["archer", "healer"], weapons: { archer: "crossbow", healer: "might" }, you: "warrior", youAt: { x: 640, y: 120 }, stage: 9, level: 15 }, 240, 9);
  });
});
