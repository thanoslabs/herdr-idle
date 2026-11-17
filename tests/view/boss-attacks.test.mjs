// The boss fighting back, as drawn: HP bars over those in the fight only, its
// attacks (pose, marker, what flies and lands), knockouts with the down pose,
// stars, rest bar and countdown, getting up, and heals (more in healers.test.mjs).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { KO_TICKS } from "../../mods/idle-rpg/party.js";
import { KINDS, attackPart, kindOf } from "../../mods/idle-rpg/rules.js";
import { agent, mountRaid, mountView, raid } from "../harness/view.mjs";

describe("HP bars", () => {
  test("every character in the fight has one, idle, blocked and done agents keep their bubbles", async () => {
    const { saved } = raid({ classes: ["warrior", "archer", "wizard", "healer"] });
    const v = await mountView({ saved, agents: [agent("t1", "working"), agent("t2", "idle"), agent("t3", "blocked"), agent("t4", "done")] });
    v.advance(5000); // the watch musters the party; the first attack draws it
    assert.deepEqual(v.ids("idle-rpg-hp-").sort(), ["idle-rpg-hp-t1", "idle-rpg-hp-you"]);
    const pics = v.images();
    for (const bubble of ["status/z-1.png", "status/alert.png", "status/done.png"]) assert.ok(pics.some((p) => p.endsWith(bubble)), bubble);
  });

  test("a bar is the share of HP left, green, then yellow, then red", async () => {
    const v = await mountRaid({ classes: ["warrior"] });
    v.advance(1000);
    const m = v.view.party.members.t1;
    for (const [share, tone] of [[1, "#4cd47b"], [0.4, "#ffd166"], [0.2, "#ff5d5d"]]) {
      m.hp = m.maxHp * share;
      v.view.card = null;
      v.setAgents([...v.world.agents]); // a re-render
      assert.deepEqual([v.get("idle-rpg-hp-t1").style.w, v.get("idle-rpg-hp-t1").style.bg], [Math.round(40 * share), tone]);
    }
  });
});

describe("the boss's attacks", () => {
  test("each kind strikes a pose, flies its shot and lands its hit; area attacks mark the floor first", async () => {
    for (const kind of KINDS) {
      const stage = Array.from({ length: 40 }, (_, i) => i + 1).find((s) => kindOf(s) === kind);
      const v = await mountRaid({ classes: ["warrior", "warrior", "archer", "archer"], stage, health: 30 });
      const seen = new Set();
      // the area's pose and what lands, the single blow's hit, and its pose to one side or the other
      const want = ["marker", `${attackPart(kind, "area", "pose")}.png`, `${attackPart(kind, "area", "hit")}.png`, `${attackPart(kind, "single", "hit")}.png`];
      v.until((h) => {
        for (const p of h.images()) if (p.includes(`/monsters/${kind}/attack/`)) seen.add(p.split(`/monsters/${kind}/`)[1]);
        if (h.ids("idle-rpg-marker-").length) seen.add("marker");
        return want.every((w) => seen.has(w));
      }, 180000);
    }
  });

  test("a hit flashes on whoever it struck, popping in and fading", async () => {
    const v = await mountRaid({ classes: ["warrior"], stage: 3, health: 30 });
    v.until((h) => h.ids("idle-rpg-hurt-").length > 0, 60000);
    const id = v.ids("idle-rpg-hurt-")[0];
    assert.equal(v.get(id).style.opacity, 1);
    v.advance(250);
    assert.equal(v.get(id).style.opacity, 0);
  });
});

describe("knockouts", () => {
  // a party where t1 (a wizard) goes down quickly while the warrior stands
  async function knockout() {
    const v = await mountRaid({ classes: ["wizard", "warrior"], you: "warrior", youAt: { x: 640, y: 120 }, stage: 12, level: 1 });
    v.view.progress.training.warrior.health = 40; // the warriors outlast it
    v.until((h) => h.view.knocked("t1"), 120000);
    return v;
  }

  test("down: lying on its back, stars, a gold rest bar and 30 counting down", async () => {
    const v = await knockout();
    const pics = v.images("critter-t1");
    assert.ok(pics.some((p) => /classes\/wizard\/default\/down\/[lr]\.png$/.test(p)), pics.join());
    assert.ok(v.images("idle-rpg-vitals-t1").some((p) => p.endsWith("status/dizzy-1.png")));
    assert.deepEqual(v.text("idle-rpg-rest-count-t1"), ["30"]);
    assert.deepEqual(v.runs("idle-rpg-rest-count-t1")[0].colours, ["gold"]);
    assert.equal(v.find("idle-rpg-hp-t1"), null, "no HP bar while down");
    // the countdown turns a second at a time, never skipping
    const counts = [30];
    v.until((h) => {
      const t = h.find("idle-rpg-rest-count-t1");
      if (t) {
        const n = Number(h.text("idle-rpg-rest-count-t1")[0]);
        if (n !== counts.at(-1)) counts.push(n);
      }
      return !h.view.knocked("t1");
    }, 40000);
    assert.deepEqual(counts, [30, 29, 28, 27, 26, 25, 24, 23, 22, 21, 20, 19, 18, 17, 16, 15, 14, 13, 12, 11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1].slice(0, counts.length));
    assert.ok(counts.length >= 28, counts.join());
  });

  test("countdowns turn only on their shared beat, never between (so all turn together)", async () => {
    const v = await knockout();
    let last = v.text("idle-rpg-rest-count-t1")[0];
    let turns = 0;
    v.until((h) => {
      const now = h.find("idle-rpg-rest-count-t1") && h.text("idle-rpg-rest-count-t1")[0];
      if (now && now !== last) {
        turns += 1;
        assert.equal(h.view.koBeat, h.view.clock, `the countdown turned to ${now} off the beat`);
      }
      last = now;
      return !h.view.knocked("t1");
    }, 40000);
    assert.ok(turns >= 25);
  });

  test("a knocked-out agent is still working: no Zz, and counted as working", async () => {
    const v = await knockout();
    assert.ok(!v.images().some((p) => p.endsWith("status/z-1.png")));
    assert.deepEqual(v.get("idle-rpg-status-working").tip, "Working: 2");
  });

  test("it gets up at full HP after its 30s rest", async () => {
    const v = await knockout();
    const down = v.view.party.members.t1.down;
    assert.equal(down - v.view.clock, KO_TICKS);
    v.until((h) => !h.view.knocked("t1"), 31000);
    const m = v.view.party.members.t1;
    assert.equal(m.hp, m.maxHp);
    assert.ok(v.find("idle-rpg-hp-t1"));
    assert.ok(Math.abs(v.view.clock - down) <= 4);
  });
});

describe("healing", () => {
  test("a working healer heals as well as attacking, and a green plus rises off whoever it heals", async () => {
    const v = await mountRaid({ classes: ["warrior", "healer"], you: "archer", stage: 6, health: 4 });
    v.until((h) => h.ids("idle-rpg-healed-").length > 0, 120000);
    const id = v.ids("idle-rpg-healed-")[0];
    assert.ok(v.images(id).some((p) => p.endsWith("status/heal.png")));
    assert.equal(v.get(id).style.opacity, 1);
    v.advance(250);
    assert.deepEqual([v.get(id).style.opacity, v.get(id).style.top], [0, -92]);
  });

  test("an aura vial's healer heals too, with the Heal Vial's potion, and shows its vial's icon by its bar", async () => {
    const v = await mountRaid({ classes: ["warrior", "healer"], you: "archer", stage: 6, health: 4, weapons: { healer: "might" } });
    v.until((h) => h.ids("idle-rpg-healed-").length > 0, 120000);
    assert.ok(v.images("idle-rpg-aura-t2").some((p) => p.endsWith("effects/icons/might.png")));
    // its own blows throw the Might Vial's potion
    v.until((h) => h.view.phaseOf("t2") === 2 && !h.view.rhythm.t2.heal, 60000, 250);
    assert.ok(v.images("idle-rpg-shot-t2").some((p) => p.endsWith("attacks/potion/might.png")));
    v.until((h) => h.view.phaseOf("t2") === 2 && h.view.rhythm.t2.heal, 60000, 250);
    assert.ok(v.images("idle-rpg-shot-t2").some((p) => p.endsWith("attacks/potion/heal.png")));
  });
});
