// Loading saved state into the view: each version's save (fixtures.mjs),
// the older keys main.js still reads, garbage, and a later version's save
// (read, played, never written). The boss and the attempt are never saved:
// loading starts a fresh one at the saved stage.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { STATE_VERSION, bossHp, loadState } from "../../mods/idle-rpg/rules.js";
import { agent, mountView, savedState, timeAt } from "../harness/view.mjs";

const NOW = timeAt();
const mount = (saved, o = {}) => mountView({ saved, agents: [agent("t1", "working")], ...o });

describe("each version's save", () => {
  for (const version of [1, 2, 3, 4, 5, 6, 7, 8]) {
    test(`v${version} loads as loadState reads it, starts a fresh attempt and renders`, async () => {
      const saved = savedState(version, { now: NOW });
      const v = await mount(saved);
      const want = loadState(saved);
      const p = v.view.progress;
      for (const k of ["stage", "best", "farming", "slain", "gold", "kills", "xp", "skills", "training", "looks", "hats", "decor"]) assert.deepEqual(p[k], want[k], k);
      assert.deepEqual(v.view.settings, want.settings);
      assert.deepEqual([v.view.monster.stage, v.view.monster.hp, v.view.left], [want.stage, bossHp(want.stage), 600000], "the saved monster is not restored");
      assert.equal(v.view.readOnly, false);
      assert.ok(v.has("idle-rpg-sign"));
      // what it saves next is this version's state
      v.clickFloor(500, 80);
      assert.equal(v.stored.version, STATE_VERSION);
      assert.equal(v.stored.monster, undefined);
      assert.deepEqual(loadState(v.stored).looks, want.looks, "and loads back the same");
    });
  }
  test("the wizard (you) wears its saved colourway and hat (v4 on)", async () => {
    const v = await mount(savedState(7, { now: NOW }));
    const you = v.images("idle-rpg-you");
    assert.ok(you.some((p) => p.includes("/classes/wizard/crimson/")) && you.some((p) => p.includes("/hats/party/wizard/")));
  });
});

describe("older keys and garbage", () => {
  for (const key of ["raid-party.state", "rpg.state", "snow-loft.state"])
    test(`state under the layout's old key ${key} is read`, async () => {
      const v = await mount(savedState(0, { now: NOW, extra: { battle: false } }), { key });
      assert.equal(v.view.battle, false);
      assert.equal(v.view.sprites.you, "wizard");
      assert.deepEqual(v.view.spots.t1, { x: 250, y: 64 });
    });
  test("garbage is a fresh start, and saves a fresh state", async () => {
    for (const g of ["junk", 42, [1, 2], null]) {
      const v = await mount(g);
      assert.equal(v.view.progress.stage, 1);
      assert.equal(v.stored.version, STATE_VERSION);
    }
  });
  test("a save whose classes are all unknown gets a random class for you and each agent", async () => {
    const v = await mount({ version: 7, sprites: { you: "bard", t1: "__proto__" } });
    assert.ok(["wizard", "healer", "warrior", "archer"].includes(v.view.sprites.you));
    assert.ok(["wizard", "healer", "warrior", "archer"].includes(v.view.sprites.t1));
  });
  test("agents not seen for a week are forgotten on the next save; one away six days is kept", async () => {
    const day = 86400000;
    const saved = savedState(7, { now: NOW, extra: { spots: { old: { x: 1, y: 2 }, away: { x: 3, y: 4 }, t1: { x: 250, y: 64 } }, sprites: { you: "archer", old: "wizard", away: "healer", t1: "warrior" }, seen: { old: NOW - 8 * day, away: NOW - 6 * day, t1: NOW } } });
    const v = await mount(saved);
    v.clickFloor(500, 80);
    assert.deepEqual(Object.keys(v.stored.spots).sort(), ["away", "t1"]);
    assert.equal(v.stored.sprites.old, undefined);
    assert.equal(v.stored.sprites.away, "healer");
  });
});

describe("a later version's save", () => {
  test("is read and played but never written, not even its new fields lost", async () => {
    const saved = savedState(9, { now: NOW });
    const v = await mount(saved);
    assert.equal(v.view.readOnly, true);
    assert.equal(v.view.progress.stage, 4);
    v.advance(30000);
    v.clickFloor(600, 90);
    v.close();
    assert.deepEqual(v.saves, []);
    assert.deepEqual(v.stored.relics, { amulet: 1 });
  });
});
