// Agents coming, going and being odd: cards, classes, statuses changing
// mid-fight, and addresses that are also names on Object.prototype.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { agent, mountRaid, mountView, raid } from "../harness/view.mjs";

describe("coming and going", () => {
  test("an agent's card shows where it works and what it is; Go to terminal focuses it", async () => {
    const v = await mountRaid({ classes: ["archer"], battle: false, status: "blocked" });
    v.click("critter-t1");
    v.release("critter-t1");
    const text = v.text("idle-rpg-card");
    assert.ok(text.includes("repo · t1") && text.includes("Claude Code") && text.includes("Needs you"), text.join("|"));
    v.click("idle-rpg-card-go");
    assert.deepEqual(v.commands.at(-1), { name: "agent.focus", args: { terminal: "t1" } });
    assert.equal(v.has("idle-rpg-card"), false);
  });
  test("an agent leaving closes its card; one stopping work leaves the fight", async () => {
    const v = await mountRaid({ classes: ["archer", "wizard"] });
    v.click("critter-t1");
    v.advance(3000);
    assert.deepEqual(Object.keys(v.view.party.members).sort(), ["t1", "t2", "you"]);
    v.setAgents([v.world.agents[1]]);
    assert.equal(v.view.card, null);
    v.setAgents([{ ...v.world.agents[0], status: "done" }]);
    v.advance(2000);
    assert.deepEqual(Object.keys(v.view.party.members), []);
  });
  test("an agent comes back to the fight at full HP", async () => {
    const v = await mountRaid({ classes: ["warrior", "archer"], stage: 8, health: 10 });
    v.until((h) => h.view.party.members.t1 && h.view.party.members.t1.hp < h.view.party.members.t1.maxHp, 120000);
    const [a, b] = v.world.agents;
    v.setAgents([{ ...a, status: "idle" }, b]);
    v.advance(2000);
    v.setAgents([a, b]);
    v.until((h) => h.view.party.members.t1, 2000, 250);
    const m = v.view.party.members.t1;
    // at full HP, unless a blow struck it on the very tick it came back
    assert.ok(m.hp === m.maxHp || m.hitAt === v.view.clock, `${m.hp} of ${m.maxHp}`);
  });
  test("you pick a class from your card; it is saved", async () => {
    const v = await mountRaid({ you: "archer" });
    v.click("idle-rpg-you");
    v.click("idle-rpg-card-wrench");
    v.click("idle-rpg-pick-warrior");
    assert.equal(v.view.sprites.you, "warrior");
    assert.equal(v.stored.sprites.you, "warrior");
  });
  test("a knocked-out you cannot walk", async () => {
    const v = await mountRaid({ you: "archer" });
    v.advance(3000);
    Object.assign(v.view.party.members.you, { hp: 0, down: v.view.clock + 120 });
    const at = { ...v.view.you };
    v.clickFloor(900, 100);
    assert.deepEqual(v.view.you, at);
  });
});

describe("odd addresses", () => {
  test("an address like 'constructor' or '__proto__' is an agent like any other", { todo: "spots and sprites are plain objects: such an address reads Object.prototype's member as its spot (drawn at y NaN), and '__proto__' sets Object.prototype.x and .y to NaN (main.js render, `s.x = ...` on this.spots[a.address])" }, async () => {
    for (const address of ["constructor", "toString", "__proto__"]) {
      const v = await mountView({ saved: raid({ battle: false }).saved, agents: [agent(address, "idle")] });
      try {
        const b = v.box(`critter-${address}`);
        assert.ok(Number.isFinite(b.x) && Number.isFinite(b.y), `${address} drawn at ${b.x}, ${b.y}`);
        assert.equal(Object.prototype.x, undefined, "Object.prototype polluted");
      } finally {
        delete Object.prototype.x;
        delete Object.prototype.y;
      }
    }
  });
});
