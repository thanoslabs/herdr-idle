// The boss's name plate in pixel style: a HUD frame with the boss's name (gold)
// and HP (white) in the lettering, a hard-edged HP bar green, yellow or red by
// the share left, the status icons' row inside the frame, and "<NAME> SLAIN!"
// once it is down. (Where it sits, inside the scene and clear of the frames,
// is in sizes.test.mjs and hud.test.mjs.)
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bossHp, shortNumber } from "../../mods/idle-rpg/rules.js";
import { mountRaid } from "../harness/view.mjs";

const KINDS = { 1: "SLIME", 2: "OGRE", 3: "DRAGON" };
const inside = (a, b) => a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
// Sets the boss's HP and draws it (nobody attacking, so nothing else changes it).
function setHp(v, hp) {
  v.view.monster.hp = hp;
  v.setAgents([...v.world.agents]);
}

describe("the boss's plate", () => {
  test("each kind's name and HP in the lettering, in a pixel frame", async () => {
    for (const stage of [1, 2, 3]) {
      const v = await mountRaid({ stage, status: "idle" });
      const max = shortNumber(Math.ceil(bossHp(stage)));
      assert.deepEqual(v.text("idle-rpg-plate"), [KINDS[stage], `${max}/${max}`]);
      assert.deepEqual(v.runs("idle-rpg-plate").map((r) => [r.face, r.colours]), [["lettering", ["gold"]], ["lettering", ["white"]]]);
      const corners = v.images("idle-rpg-plate").filter((p) => p.includes("/frame/"));
      assert.deepEqual(corners.map((p) => p.split("/").pop()), ["tl.png", "tr.png", "bl.png", "br.png"]);
      const plate = v.box("idle-rpg-plate");
      assert.equal(plate.h, 38);
      // the name at the left, the HP at the right, both inside the frame's 4px edge and 4px of padding
      const [name, hp] = v.runs("idle-rpg-plate").map((r) => v.box(r.el));
      assert.equal(name.x - plate.x, 8);
      assert.equal(plate.x + plate.w - (hp.x + hp.w), 8);
      assert.ok(name.x + name.w + 8 <= hp.x);
      // centred over the boss
      const boss = v.box(`idle-rpg-monster-${v.view.monster.id}`);
      assert.equal(plate.x + plate.w / 2, Math.round(boss.x + boss.w / 2));
    }
  });
  test("wide enough for the widest HP beside the name, so they never meet", async () => {
    for (const stage of [1, 2, 3]) {
      const v = await mountRaid({ stage, status: "idle" });
      v.view.monster.maxHp = 9.94e99;
      setHp(v, 9.94e99);
      assert.deepEqual(v.text("idle-rpg-plate"), [KINDS[stage], "9.9E99/9.9E99"]);
      const plate = v.box("idle-rpg-plate");
      const [name, hp] = v.runs("idle-rpg-plate").map((r) => v.box(r.el));
      assert.ok(name.x + name.w + 8 <= hp.x, `${KINDS[stage]}: the name ends at ${name.x + name.w}, the HP starts at ${hp.x}`);
      assert.ok(inside(hp, plate));
      assert.ok(plate.w >= 152 && plate.w <= 200, `${plate.w}`);
    }
  });
  test("the HP bar: a 2px outline round its fill, green above half, yellow above a fifth, red below, its width eased", async () => {
    const v = await mountRaid({ stage: 4, status: "idle" });
    const max = v.view.monster.maxHp;
    const bar = () => v.get("idle-rpg-monster-hp");
    const track = bar().parent;
    assert.deepEqual([track.style.border, track.style.border_color, track.style.h], [2, "#141a26", 10]);
    const full = track.style.w - 4;
    assert.deepEqual(bar().transitions.width, { duration: 150, easing: "ease-out" });
    const cases = [
      [max, "#4cd47b", "#9ff0bd"],
      [max / 2 + 1, "#4cd47b", "#9ff0bd"],
      [max / 2, "#ffd166", "#ffe7a3"],
      [max / 5 + 1, "#ffd166", "#ffe7a3"],
      [max / 5, "#ff5d5d", "#ff9b9b"],
      [1, "#ff5d5d", "#ff9b9b"],
    ];
    for (const [hp, fill, edge] of cases) {
      setHp(v, hp);
      assert.deepEqual([bar().style.bg, bar().style.border_color, bar().style.border_t], [fill, edge, 2], `at ${hp} of ${max}`);
      assert.equal(bar().style.w, Math.round((full * hp) / max));
    }
  });
  test("a row taller with the status icons, inside the frame", async () => {
    const v = await mountRaid({ classes: ["wizard", "wizard", "warrior"], you: "healer", weapons: { wizard: "venom", warrior: "flame", healer: "hex" }, stage: 2, level: 3 });
    v.until((h) => h.has("idle-rpg-plate-venom") && h.has("idle-rpg-plate-burn"), 120000);
    const plate = v.box("idle-rpg-plate");
    assert.equal(plate.h, 38 + 20);
    const row = v.box("idle-rpg-plate-icons");
    assert.ok(inside({ ...row, w: 18 * v.get("idle-rpg-plate-icons").kids.length }, plate));
    assert.ok(row.y >= plate.y + 32, "under the bar");
    assert.ok(row.y + 18 <= plate.y + plate.h - 4, "inside the frame's edge");
  });
  test("once the boss is down: <NAME> SLAIN! in gold over the empty bar, no HP", async () => {
    for (const stage of [1, 2, 3]) {
      const v = await mountRaid({ stage, settings: { advance: false } });
      v.view.monster.hp = 1;
      v.until((h) => h.view.monster.hp <= 0, 60000);
      assert.deepEqual(v.text("idle-rpg-plate"), [`${KINDS[stage]} SLAIN!`]);
      assert.deepEqual(v.runs("idle-rpg-plate")[0].colours, ["gold"]);
      assert.equal(v.get("idle-rpg-monster-hp").style.w, 0);
      assert.equal(v.box("idle-rpg-plate").h, 38, "no icons once it is down");
      const plate = v.box("idle-rpg-plate");
      assert.ok(inside(v.box(v.runs("idle-rpg-plate")[0].el), plate));
    }
  });
});
