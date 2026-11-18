// Facing and pointing: which way each fighter faces and where its attack
// sets off, the stage arrows' pictures, and the pointer: walking, dragging
// and clicking with the view placed away from the window's corner (as it is
// in Herdr, beside the sidebar), a press abandoned off the scene, walking out
// of the fight, and the cards and panels closing each other.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { agent, mountRaid, mountView, raid } from "../harness/view.mjs";

const pics = (v, id) => v.images(id).map((p) => p.replace("mods/idle-rpg/art/", ""));
// Runs `v` until every picture in `want` has been drawn under `id`, collecting what was.
function seen(v, id, want, max = 60000) {
  const got = new Set();
  v.until(() => {
    for (const p of v.has(id) ? pics(v, id) : []) got.add(p);
    return want.every((w) => got.has(w));
  }, max);
  return got;
}

describe("facing the boss", () => {
  test("an agent left of the boss faces right (its /r pictures), one right of it faces left (/l), in every pose", async () => {
    const v = await mountRaid({ classes: ["archer", "archer"], you: "wizard", stage: 1, health: 30 });
    const mid = 1280 / 2;
    assert.ok(v.view.at.t1.x < mid && v.view.at.t2.x > mid, "t1 left, t2 right");
    assert.deepEqual([v.view.at.t1.dir, v.view.at.t2.dir], [1, -1]);
    const poses = ["stance", "windup", "strike"];
    const left = seen(v, "critter-t1", poses.map((p) => `classes/archer/default/${p}/r.png`));
    const right = seen(v, "critter-t2", poses.map((p) => `classes/archer/default/${p}/l.png`));
    assert.ok(![...left].some((p) => /\/(stance|windup|strike)\/l\.png$/.test(p)), "the left one never faces away");
    assert.ok(![...right].some((p) => /\/(stance|windup|strike)\/r\.png$/.test(p)), "the right one never faces away");
  });

  test("so do you, from either side", async () => {
    for (const [x, side, away] of [[200, "r", "l"], [1100, "l", "r"]]) {
      const v = await mountRaid({ classes: ["warrior"], you: "archer", youAt: { x, y: 60 }, stage: 1, health: 30 });
      const got = seen(v, "idle-rpg-you", ["stance", "windup", "strike"].map((p) => `classes/archer/default/${p}/${side}.png`));
      assert.ok(![...got].some((p) => new RegExp(`/(stance|windup|strike)/${away}\\.png$`).test(p)), `you at ${x}`);
    }
  });

  test("an attack sets off from the attacker's hand on the boss's side, for both sides", async () => {
    const v = await mountRaid({ classes: ["archer", "archer", "wizard", "wizard"], you: "healer", stage: 1, health: 30 });
    const mid = 1280 / 2;
    const checked = new Set();
    v.until(() => {
      for (const key of ["t1", "t2", "t3", "t4"]) {
        if (v.view.phaseOf(key) !== 1 || !v.has(`idle-rpg-shot-${key}`)) continue;
        const at = v.view.at[key];
        const shot = v.box(`idle-rpg-shot-${key}`);
        const x = shot.x + shot.w / 2;
        // between the attacker and the boss: past its feet towards the boss, not beyond the boss
        if (at.x < mid) assert.ok(x > at.x && x < mid, `${key} (left, at ${at.x}): its shot at ${x}`);
        else assert.ok(x < at.x && x > mid, `${key} (right, at ${at.x}): its shot at ${x}`);
        checked.add(key);
      }
      return checked.size === 4;
    }, 60000);
  });
});

describe("the stage arrows", () => {
  test("prev shows the left arrow, next the right", async () => {
    const v = await mountRaid({ stage: 2, best: 3 });
    assert.deepEqual(pics(v, "idle-rpg-stage-prev"), ["icons/prev.png"]);
    assert.deepEqual(pics(v, "idle-rpg-stage-next"), ["icons/next.png"]);
    assert.ok(v.box("idle-rpg-stage-prev").x < v.box("idle-rpg-stage-next").x);
  });
});

// The view as Herdr places it: right of a 268px sidebar, under a 40px bar.
const ORIGIN = { x: 268, y: 40 };

describe("the pointer", () => {
  for (const origin of [{ x: 0, y: 0 }, ORIGIN])
    describe(`with the view at ${origin.x},${origin.y} in the window`, () => {
      test("a click on the floor walks you to that point", async () => {
        const v = await mountRaid({ view: "town" }, { origin });
        v.clickFloor(500, 80);
        assert.deepEqual(v.view.you, { x: 500, y: 80 });
        assert.equal(v.view.walking, true);
        v.advance(3000);
        assert.equal(v.view.walking, false);
      });
      test("dragging an agent drops it where it is let go", async () => {
        const { saved } = raid({ view: "town", classes: ["archer"] });
        const v = await mountView({ saved, agents: [agent("t1", "idle")], origin });
        v.press("critter-t1");
        v.move({ x: 700, y: 300 });
        v.move({ x: 720, y: 290 });
        assert.equal(v.view.drag.x, 720);
        v.release({ x: 720, y: 290 });
        assert.deepEqual(v.view.spots.t1, { x: 720, y: 290 - (360 - 152) });
      });
      test("a click on a chip opens its panel; one on an agent opens its card", async () => {
        const v = await mountRaid({ gold: 20, slain: 1 }, { origin });
        v.click("idle-rpg-gold");
        assert.ok(v.has("idle-rpg-shop"));
        v.click("critter-t1");
        assert.equal(v.view.card, "t1");
      });
    });

  test("a press on the floor abandoned off the scene walks nobody, and leaves no press behind", async () => {
    const v = await mountRaid({ view: "town" });
    const you = { ...v.view.you };
    v.press({ x: 500, y: 300 });
    assert.ok(v.view.press);
    v.hover("idle-rpg", false); // the pointer leaves the scene (and the button comes up out there)
    assert.equal(v.view.press, null, "the press goes as the pointer leaves");
    // back in, a button released where the press was is no click on the floor
    v.release({ x: 500, y: 300 });
    assert.deepEqual(v.view.you, you);
    assert.equal(v.view.press, null);
  });

  test("you are out of the fight while you walk, back in once you arrive", async () => {
    const v = await mountRaid({ classes: ["warrior"], you: "archer", stage: 1, health: 30 });
    v.advance(3000);
    assert.ok(v.view.fighters().includes("you"));
    v.clickFloor(1200, 100); // a long walk
    assert.equal(v.view.walking, true);
    assert.ok(!v.view.fighters().includes("you"));
    v.advance(500);
    assert.ok(v.view.walking && !v.view.fighters().includes("you"), "still walking");
    v.until((h) => !h.view.walking, 5000);
    assert.ok(v.view.fighters().includes("you"));
  });
});

describe("cards and panels close each other", () => {
  for (const [opener, panel] of [["idle-rpg-gold", "idle-rpg-shop"], ["idle-rpg-points", "idle-rpg-skills"], ["idle-rpg-slain", "idle-rpg-codex"], ["idle-rpg-gear", "idle-rpg-settings"]])
    test(`opening an agent's card closes ${panel}, and opening ${panel} closes the card`, async () => {
      const v = await mountRaid({ gold: 20, slain: 1, level: 3 });
      v.click(opener);
      assert.ok(v.has(panel));
      v.click("critter-t1");
      assert.equal(v.view.card, "t1");
      assert.equal(v.has(panel), false, `${panel} still open with the card`);
      v.click(opener);
      assert.ok(v.has(panel));
      assert.equal(v.view.card, null);
    });
});
