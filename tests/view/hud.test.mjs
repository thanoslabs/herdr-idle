// The HUD's three pixel frames: what they say (read back from the lettering),
// the stage section apart from the boss's plate, the notes under it, and
// hudLayout swept across widths, insets, status counts and big numbers: no
// two frames overlap and none leaves the scene.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { agent, mountRaid, mountView, raid } from "../harness/view.mjs";
import { stageTexts } from "./expect.mjs";

const THOROUGH = Boolean(process.env.HERDR_TESTS_THOROUGH);

describe("what the frames say", () => {
  test("the sign: its title, the counts and the raid button", async () => {
    const v = await mountRaid({ gold: 1234, slain: 56, level: 3 });
    assert.deepEqual(v.text("idle-rpg-sign"), ["RAID PARTY", "56", "1.2K", "8", "RETURN TO TOWN"]);
    assert.deepEqual(v.runs("idle-rpg-sign").map((r) => r.colours[0]), ["gold", "white", "white", "gold", "white"]);
    assert.ok(v.images("idle-rpg-points").some((p) => p.endsWith("icons/star.png")));
  });
  test("with no agents it says nobody is in; out of a raid the button starts one and the kill and gold chips go", async () => {
    const { saved } = raid({ gold: 5, battle: false });
    const v = await mountView({ saved, agents: [] });
    assert.deepEqual(v.text("idle-rpg-sign"), ["RAID PARTY", "NOBODY IN YET", "0", "START RAID"]);
    assert.deepEqual(v.runs("idle-rpg-sign")[1].colours, ["grey"]);
  });
  test("the star is dimmed with no points to spend", async () => {
    const v = await mountRaid({ gold: 5 });
    assert.equal(v.get("idle-rpg-points").style.opacity, 0.55);
  });
  test("the strip: an icon per status with agents, its count on a badge (99+ past 99), then the gear", async () => {
    const { saved } = raid({});
    const list = [...Array.from({ length: 120 }, (_, i) => agent(`w${i}`, "working")), agent("b1", "blocked"), agent("i1", "idle"), agent("i2", "idle")];
    const v = await mountView({ saved, agents: list, width: 1600 });
    assert.deepEqual(v.text("idle-rpg-hud"), ["1", "99+", "2"]);
    assert.deepEqual(v.ids("idle-rpg-status-"), ["idle-rpg-status-blocked", "idle-rpg-status-working", "idle-rpg-status-idle"]);
    assert.equal(v.get("idle-rpg-status-working").tip, "Working: 120");
    assert.ok(v.has("idle-rpg-gear"));
  });
  test("the stage section: the stage and the time; FARM while farming; the plate keeps only the boss's name and HP", async () => {
    const v = await mountRaid({ stage: 12, best: 14, farming: true, status: "idle" });
    assert.deepEqual(v.text("idle-rpg-stage"), stageTexts({ stage: 12, farming: true, clock: "10:00", running: false }));
    assert.deepEqual(v.text("idle-rpg-plate"), ["Dragon", "5.3K/5.3K"]);
    assert.ok(!v.text("idle-rpg-plate").some((t) => /stage|\d:\d\d/i.test(t)));
  });
  test("the stage section is wider while paused, by the label and its gap", async () => {
    const v = await mountRaid({ stage: 12 });
    const running = v.box("idle-rpg-stage").w;
    v.setAgents(v.world.agents.map((a) => ({ ...a, status: "idle" })));
    const paused = v.box("idle-rpg-stage");
    assert.deepEqual(v.runs("idle-rpg-stage-paused").map((r) => [r.text, r.colours]), [["(PAUSED)", ["grey"]]]);
    assert.ok(paused.w > running, `${paused.w} against ${running}`);
  });
  test("the stage section and the plate are apart; a note lies under the section, over the plate", async () => {
    for (const stage of [1, 2, 3])
      for (const height of [230, 360, 560]) {
        const v = await mountRaid({ stage, status: "idle" }, { height });
        v.view.timesUp = { at: v.now, id: 9, text: `Wiped! Back to stage ${stage}` };
        v.setAgents([...v.world.agents]);
        const s = v.box("idle-rpg-stage");
        const p = { ...v.box("idle-rpg-plate"), h: 28 };
        const n = v.box("idle-rpg-timesup-9");
        assert.ok(p.y >= s.y + s.h, `the plate (${p.y}) under the section (${s.y + s.h}) at stage ${stage}, height ${height}`);
        assert.ok(n.y >= s.y + s.h, "the note under the section");
        const order = v.all((el) => el.key === "idle-rpg-plate" || el.key === "idle-rpg-timesup-9").map((el) => el.key);
        assert.deepEqual(order, ["idle-rpg-plate", "idle-rpg-timesup-9"], "the note is drawn after (over) the plate");
      }
  });
});

// Boxes overlap if they share any pixel.
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("hudLayout", () => {
  const widths = THOROUGH ? Array.from({ length: 2081 }, (_, i) => 320 + i) : Array.from({ length: 131 }, (_, i) => 320 + i * 16);
  const insets = THOROUGH ? [0, 8, 16, 40, 84, 100, 120] : [0, 16, 84, 120];
  const statuses = { none: [], one: ["working"], all: ["blocked", "working", "done", "idle"] };

  test(`no frame overlaps another or leaves the scene (${widths.length} widths x ${insets.length} insets x agents, counts, numbers, notes)`, async () => {
    const v = await mountRaid({});
    const view = v.view;
    const problems = [];
    for (const [name, sts] of Object.entries(statuses))
      for (const big of [false, true])
        for (const farming of [false, true]) {
          // many in each status (two-digit and "99+" badges), or nobody in
          const list = sts.flatMap((st) => Array.from({ length: big ? 150 : 3 }, (_, i) => agent(`${st}${i}`, st)));
          Object.assign(view.progress, big ? { gold: 9.9e15, slain: 9.9e15, stage: 999, best: 1000 } : { gold: 0, slain: 0, stage: 1, best: 1 }, { farming });
          view.progress.xp.wizard = big ? 9e15 : 0;
          for (const note of [null, "Wiped! Back to stage 999"]) {
            view.timesUp = note ? { at: Date.now(), id: 1, text: note } : null;
            for (const inset of insets) {
              v.world.props = { inset };
              for (const W of widths) {
                view.size = { width: W, height: 230 };
                const fight = view.battle && W >= 640;
                const h = view.hudLayout(W, list, fight);
                const boxes = { sign: h.sign, strip: h.strip, stage: h.stage, note: h.note?.box };
                const tag = `${W}px inset ${inset}, ${name}${big ? " big" : ""}${farming ? " farming" : ""}${note ? " +note" : ""}`;
                for (const [k, b] of Object.entries(boxes)) {
                  if (!b) continue;
                  if (b.x < 0 || b.x + b.w > W || b.y < 0) problems.push(`${k} outside at ${tag}: ${JSON.stringify(b)}`);
                }
                const keys = Object.keys(boxes).filter((k) => boxes[k]);
                for (let i = 0; i < keys.length; i++) for (let j = i + 1; j < keys.length; j++) if (overlap(boxes[keys[i]], boxes[keys[j]])) problems.push(`${keys[i]} and ${keys[j]} overlap at ${tag}`);
                if (fight && !h.stage) problems.push(`no stage section at ${tag}`);
                if (h.panelTop + 167 > 230 + 2) problems.push(`the shop would end at ${h.panelTop + 167} at ${tag}`);
              }
            }
          }
        }
    assert.ok(problems.length === 0, `${problems.length} problems, e.g.\n${problems.slice(0, 8).join("\n")}`);
  });

  test("the rendered frames are where hudLayout puts them", async () => {
    for (const W of [320, 500, 640, 700, 800, 1280, 2400]) {
      const v = await mountRaid({ gold: 99, slain: 9, level: 4, classes: ["warrior", "archer"] }, { width: W, inset: 16 });
      const h = v.view.hudBox;
      assert.deepEqual(v.box("idle-rpg-sign"), h.sign, `sign at ${W}`);
      assert.deepEqual(v.box("idle-rpg-hud"), h.strip, `strip at ${W}`);
      if (h.stage) assert.deepEqual(v.box("idle-rpg-stage"), h.stage, `stage at ${W}`);
    }
  });

  test("short of room the title goes first, then the stage section drops to a second row (y 54)", async () => {
    const list = ["blocked", "working", "done", "idle"].map((st, i) => agent(`a${i}`, st));
    const { saved } = raid({ gold: 1234, slain: 1234, level: 5 });
    const rows = [];
    for (const W of [640, 700, 800, 1000]) {
      const h = (await mountView({ saved, agents: list, width: W })).view.hudBox;
      rows.push([W, h.titled, h.stage.y, h.strip.y]);
    }
    assert.deepEqual(rows, [[640, false, 54, 8], [700, false, 54, 8], [800, false, 8, 8], [1000, true, 8, 8]]);
  });
});
