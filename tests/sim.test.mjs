// tools/sim.mjs: its quick --smoke run works from the command line, its
// options parse, its player buys and spends as described, and a run is the
// same for the same seed. (That its Fight plays main.js's fight is
// tests/view/parity.test.mjs; its long runs are not part of the test suite:
// see tests/README.md.)
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { describe, test } from "node:test";
import { fileURLToPath } from "node:url";
import { newProgress, trainingOf } from "../mods/idle-rpg/rules.js";
import { bestWeapon, buyTraining, parse, play, spendPoints, time } from "../tools/sim.mjs";

const SIM = fileURLToPath(new URL("../tools/sim.mjs", import.meta.url));

describe("the simulation", () => {
  test("--smoke runs from the command line and reports each stage's first clear", () => {
    const out = execFileSync(process.execPath, [SIM, "--smoke"], { encoding: "utf8" });
    assert.match(out, /time of fighting to first clear:/);
    for (const s of [1, 2, 3, 5]) assert.match(out, new RegExp(`stage +${s} +\\d+(\\.\\d)?(s|m)`));
    assert.match(out, /knockouts/);
  });
  test("--json and the options", () => {
    const r = JSON.parse(execFileSync(process.execPath, [SIM, "--smoke", "--agents", "1", "--you", "none", "--policy", "attack", "--json"], { encoding: "utf8" }));
    assert.equal(r.options.agents, 1);
    assert.equal(r.options.you, null);
    assert.ok(r.stages[1] > 0);
  });
  test("bad options are refused", () => {
    for (const bad of [["--policy", "greedy"], ["--classes", "bard"], ["--next", "soon"], ["--nope"]]) assert.throws(() => parse(bad), Error, bad.join(" "));
    assert.equal(parse(["--weapons", "warrior=axe,archer=flame"]).loadout.archer, "flame");
  });
  test("the same seed plays the same run", () => {
    const o = { ...parse(["--smoke"]), seed: 4 };
    assert.deepEqual(play(o).firstClears, play(o).firstClears);
  });
  test("the player: training cheapest first, both kinds evenly; points on the best rank", () => {
    const p = newProgress();
    p.gold = 100;
    buyTraining(p, ["warrior", "archer"], "both");
    for (const c of ["warrior", "archer"]) assert.ok(Math.abs(trainingOf(p, c, "attack") - trainingOf(p, c, "health")) <= 1);
    const q = newProgress();
    q.gold = 100;
    buyTraining(q, ["warrior"], "attack");
    assert.equal(trainingOf(q, "warrior", "health"), 0);
    assert.equal(buyTraining(q, ["warrior"], "none"), 0);
    q.xp.wizard = 100 * 15; // 5 points
    spendPoints(q);
    assert.equal(Object.values(q.skills.wizard).reduce((a, b) => a + b, 0), 5);
  });
  test("best weapons by boss: frost on the slime and dragon, fire on the ogre", () => {
    assert.equal(bestWeapon("archer", "slime"), "frost");
    assert.equal(bestWeapon("archer", "ogre"), "flame");
    assert.equal(bestWeapon("wizard", "dragon"), "frost");
  });
  test("times read as PLAN.md writes them", () => {
    assert.deepEqual([time(5000), time(630000), time(5.76e6), time(1.3e8), time(undefined)], ["5s", "10.5m", "1.6h", "1.50d", "never"]);
  });
});
