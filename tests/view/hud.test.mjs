// The HUD's three pixel frames: what they say (read back from the lettering),
// the stage section apart from the boss's plate, what it says in the time's
// place (a boss slain, the countdown to the next stage, time's up) at every
// width, and hudLayout swept across widths, insets, status counts and big
// numbers: no two frames overlap and none leaves the scene; the sign and the
// strip the same in every view, so a switch is undone by a click on the same spot.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { LABELS, VIEWS, letterFit, lettersWidth } from "../../mods/idle-rpg/rules.js";
import { agent, mountRaid, mountView, raid } from "../harness/view.mjs";
import { stageTexts } from "./expect.mjs";

const THOROUGH = Boolean(process.env.HERDR_TESTS_THOROUGH);

describe("what the frames say", () => {
  test("the sign: its title, the counts and the button to town", async () => {
    const v = await mountRaid({ gold: 1234, slain: 56, level: 3 });
    assert.deepEqual(v.text("idle-rpg-sign"), ["RAID PARTY", "56", "1.2K", "8", "TO TOWN"]);
    assert.deepEqual(v.runs("idle-rpg-sign").map((r) => r.colours[0]), ["gold", "white", "white", "gold", "white"]);
    assert.ok(v.images("idle-rpg-points").some((p) => p.endsWith("icons/star.png")));
  });
  test("with no agents it says nobody is in; in town the button goes to the raid and the kill and gold chips stay (as in every view)", async () => {
    const { saved } = raid({ gold: 5, view: "town" });
    const v = await mountView({ saved, agents: [] });
    assert.deepEqual(v.text("idle-rpg-sign"), ["RAID PARTY", "NOBODY IN YET", "0", "5", "0", "TO THE RAID"]);
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
    assert.deepEqual(v.text("idle-rpg-plate"), ["ORC", "5.3K/5.3K"]);
    assert.ok(!v.text("idle-rpg-plate").some((t) => /stage|\d:\d\d/i.test(t)));
  });
  test("the stage section keeps its width while farming and while paused, with an arrow at each end", async () => {
    const v = await mountRaid({ stage: 12 });
    const running = v.box("idle-rpg-stage");
    v.setAgents(v.world.agents.map((a) => ({ ...a, status: "idle" })));
    const paused = v.box("idle-rpg-stage");
    assert.deepEqual(v.runs("idle-rpg-stage-paused").map((r) => [r.text, r.colours]), [["(PAUSED)", ["grey"]]]);
    assert.deepEqual([paused.x, paused.w], [running.x, running.w], "the pause does not move or resize it");
    const farming = await mountRaid({ stage: 12, farming: true });
    assert.equal(farming.box("idle-rpg-stage").w, running.w, "nor does farming");
    // the arrows sit at the section's two ends, the words and the time between them
    for (const view of [v, farming]) {
      const sec = view.box("idle-rpg-stage");
      const prev = view.box("idle-rpg-stage-prev");
      const next = view.box("idle-rpg-stage-next");
      assert.equal(prev.x - sec.x, sec.x + sec.w - (next.x + next.w), "the same inset at both ends");
      assert.ok(prev.x - sec.x <= 10 && prev.x >= sec.x, `prev at the left end: ${prev.x - sec.x}`);
      const clock = view.box("idle-rpg-stage-clock");
      assert.ok(clock.x > prev.x + prev.w && clock.x + clock.w <= next.x, "the time is between the arrows");
    }
  });
  test("the stage section is a share of the scene's width, between what it needs and a cap", async () => {
    const widths = {};
    for (const W of [1000, 1200, 1459, 1652, 2292, 3000]) {
      const v = await mountRaid({ stage: 12 }, { width: W });
      widths[W] = v.box("idle-rpg-stage").w;
    }
    assert.deepEqual(widths, { 1000: 300, 1200: 360, 1459: 438, 1652: 496, 2292: 520, 3000: 520 }, "30% of the scene, capped at 520");
    const narrow = (await mountRaid({ stage: 12 }, { width: 700 })).box("idle-rpg-stage").w;
    assert.ok(narrow > 700 * 0.3, `at least what its fullest line needs: ${narrow}`);
    const full = await mountRaid({ stage: 12, farming: true, status: "idle" }, { width: 700 });
    const sec = full.box("idle-rpg-stage");
    for (const id of ["idle-rpg-stage-farm", "idle-rpg-stage-paused", "idle-rpg-stage-clock"]) {
      const k = full.box(id);
      assert.ok(k.x >= sec.x && k.x + k.w <= sec.x + sec.w, `${id} inside the section at its narrowest`);
    }
    const farm = full.box("idle-rpg-stage-farm");
    const pause = full.box("idle-rpg-stage-paused");
    assert.ok(farm.x + farm.w <= pause.x, "farm and (PAUSED) do not overlap at its narrowest");
  });
  test("the stage section and the plate are apart, time's up or not; no note under the section", async () => {
    for (const stage of [1, 2, 3])
      for (const height of [230, 360, 560]) {
        const v = await mountRaid({ stage, status: "idle" }, { height });
        const before = { stage: v.box("idle-rpg-stage"), plate: v.box("idle-rpg-plate") };
        v.view.timesUp = { at: v.now, id: 9, text: `Time's up! Back to stage ${stage}` };
        v.setAgents([...v.world.agents]);
        const s = v.box("idle-rpg-stage");
        const p = v.box("idle-rpg-plate");
        assert.ok(p.y >= s.y + s.h, `the plate (${p.y}) under the section (${s.y + s.h}) at stage ${stage}, height ${height}`);
        assert.deepEqual({ stage: s, plate: p }, before, "neither moves nor grows");
        assert.deepEqual(v.text("idle-rpg-stage-timesup-9"), [`TIME'S UP! BACK TO STAGE ${stage}`]);
        assert.deepEqual(v.ids("idle-rpg-timesup-"), []);
        assert.deepEqual(v.ids("idle-rpg-advance-"), []);
      }
  });
});

// Boxes overlap if they share any pixel.
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("hudLayout", () => {
  const widths = THOROUGH ? Array.from({ length: 2081 }, (_, i) => 320 + i) : Array.from({ length: 131 }, (_, i) => 320 + i * 16);
  const insets = THOROUGH ? [0, 8, 16, 40, 84, 100, 120] : [0, 16, 84, 120];
  const statuses = { none: [], one: ["working"], all: ["blocked", "working", "done", "idle"] };

  test(`no frame overlaps another or leaves the scene (3 views x ${widths.length} widths x ${insets.length} insets x agents, counts, numbers)`, async () => {
    const v = await mountRaid({});
    const view = v.view;
    const problems = [];
    for (const shown of VIEWS)
    for (const [name, sts] of Object.entries(statuses))
      for (const big of [false, true])
        for (const farming of [false, true]) {
          // many in each status (two-digit and "99+" badges), or nobody in
          const list = sts.flatMap((st) => Array.from({ length: big ? 150 : 3 }, (_, i) => agent(`${st}${i}`, st)));
          Object.assign(view.progress, big ? { gold: 9.9e15, slain: 9.9e15, stage: 999, best: 1000 } : { gold: 0, slain: 0, stage: 1, best: 1 }, { farming });
          view.progress.xp.wizard = big ? 9e15 : 0;
          {
            for (const inset of insets) {
              v.world.props = { inset };
              for (const W of widths) {
                view.size = { width: W, height: 230 };
                view.view = shown;
                const fight = W >= 640; // the fight runs in every view: the stage section shows in each
                const h = view.hudLayout(W, list, fight);
                const boxes = { sign: h.sign, strip: h.strip, stage: h.stage };
                const tag = `${shown} ${W}px inset ${inset}, ${name}${big ? " big" : ""}${farming ? " farming" : ""}`;
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

  test("short of room the stage section drops to a second row (y 54), or the title goes to keep it in the first", async () => {
    const list = ["blocked", "working", "done", "idle"].map((st, i) => agent(`a${i}`, st));
    const { saved } = raid({ gold: 1234, slain: 1234, level: 5 });
    const rows = [];
    for (const W of [640, 700, 800, 1000]) {
      const h = (await mountView({ saved, agents: list, width: W })).view.hudBox;
      rows.push([W, h.titled, h.stage.y, h.strip.y]);
    }
    // the section never shrinks below its fullest line, so it stays in the second row up to about 900px;
    // at 640 the view button, as wide as "TO THE RAID" in every view, takes the strip to the second row too
    assert.deepEqual(rows, [[640, false, 54, 54], [700, false, 54, 8], [800, true, 54, 8], [1000, false, 8, 8]]);
  });
});

// What the stage section says in the time's place while the boss lies dead
// (slain, the countdown to the next stage) or after a failed attempt (time's
// up): at every width, in the section's own height and width, between the
// stage (and its farm mark) and the next arrow, never meeting the sign, the
// strip (the map and the gear chips in it) or the plate; the longest wording
// that fits, shorter where the section is narrow.
describe("what the stage section says when something happens", () => {
  const W = (t) => lettersWidth(letterFit(String(t))) * 2;
  const up = (t) => t.toUpperCase();
  const range = (a, b, step) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, i) => a + i * step);
  // thorough: every width at the lowest and tallest scene, every 7th at every 10px of height
  const sizes = THOROUGH
    ? [...range(320, 2918, 1).flatMap((w) => [230, 560].map((h) => [w, h])), ...range(320, 2918, 7).flatMap((w) => range(240, 550, 10).map((h) => [w, h]))]
    : range(320, 2918, 37).flatMap((w) => [230, 360, 560].map((h) => [w, h])).concat([[2918, 230], [640, 560]]);
  const name = (kind) => (kind === "goblin-mage" ? "Goblin Mage" : "Orc");
  // each state: how to set it on the view, and its wordings from the longest (as rules.js's LABELS give them)
  const STATES = {
    slain: (v, kind, s) => {
      Object.assign(v.view.monster, { kind, hp: 0, slainAt: v.now, advancing: undefined });
      return { id: `idle-rpg-stage-slain-${v.view.monster.id}`, colour: "gold", texts: [LABELS.slain(name(kind)), LABELS.slainBare] };
    },
    "slain, farming": (v, kind, s) => {
      v.view.progress.farming = true;
      return STATES.slain(v, kind, s);
    },
    advancing: (v, kind, s) => {
      Object.assign(v.view.progress, { stage: s + 1, best: s + 1 });
      Object.assign(v.view.monster, { kind, hp: 0, slainAt: v.now - 1500, advancing: s + 1 });
      const [n, next, soon] = [name(kind), LABELS.next(s + 1, 4), LABELS.nextIn(4)];
      return { id: `idle-rpg-stage-slain-${v.view.monster.id}`, colour: "gold", texts: [`${LABELS.slain(n)} ${next}`, `${LABELS.slain(n)} ${soon}`, `${LABELS.slainBare} ${soon}`, soon] };
    },
    "time's up": (v, kind, s) => {
      v.view.progress.farming = true;
      v.view.timesUp = { at: v.now, id: 7, text: LABELS.back(LABELS.timesUp, s) };
      return { id: "idle-rpg-stage-timesup-7", colour: "red", texts: [LABELS.back(LABELS.timesUp, s), LABELS.timesUp], hides: true };
    },
  };
  const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

  for (const [state, set] of Object.entries(STATES))
    test(`${state}: inside the section, clear of everything, the longest wording that fits (${sizes.length} sizes, big and small numbers)`, async () => {
      const problems = [];
      const shown = new Set();
      for (const [kind, stage, best] of [["goblin-mage", 999, 1000], ["orc", 12, 14]]) {
        const v = await mountRaid({ stage, best, classes: ["warrior", "archer", "wizard"], statuses: ["working", "blocked", "done"], gold: 1e15, slain: 1e15 });
        const want = set(v, kind, stage);
        for (const [w, h] of sizes) {
          v.resize(w, h);
          const tag = `${state} ${kind} at ${w}x${h}`;
          if (!v.view.hudBox.stage) {
            if (v.has(want.id)) problems.push(`${tag}: shown with no section`);
            continue;
          }
          const s = v.box("idle-rpg-stage");
          if (s.h !== 42 || s.w !== v.view.stageWidth(w)) problems.push(`${tag}: the section is ${s.w}x${s.h}`);
          const runs = v.runs(want.id);
          if (runs.length !== 1) {
            problems.push(`${tag}: ${runs.length} runs`);
            continue;
          }
          const [{ text, colours }] = runs;
          shown.add(text);
          const i = want.texts.map(up).indexOf(text);
          if (i < 0) problems.push(`${tag}: "${text}"`);
          if (colours.some((c) => c !== want.colour)) problems.push(`${tag}: in ${colours}`);
          const m = v.box(want.id);
          const next = v.box("idle-rpg-stage-next");
          const words = v.box(v.runs("idle-rpg-stage")[0].el);
          const before = v.has("idle-rpg-stage-farm") ? v.box("idle-rpg-stage-farm") : words;
          // its room: from 8px after the stage (and its farm mark) to the time's end, 6px before the next arrow
          const room = next.x - 6 - (before.x + before.w + 8);
          if (m.x < before.x + before.w + 8 || m.x + m.w > next.x - 6) problems.push(`${tag}: "${text}" from ${m.x} to ${m.x + m.w}, room ${before.x + before.w + 8} to ${next.x - 6}`);
          if (m.y < s.y + 4 || m.y + m.h > s.y + s.h - 4) problems.push(`${tag}: out of the frame's height`);
          if (i > 0 && W(want.texts[i - 1]) <= room) problems.push(`${tag}: "${text}" where "${want.texts[i - 1]}" fits`);
          for (const id of ["idle-rpg-sign", "idle-rpg-hud", "idle-rpg-map", "idle-rpg-gear", "idle-rpg-plate"])
            if (v.has(id) && overlap(s, v.box(id))) problems.push(`${tag}: the section meets ${id}`);
          if (want.hides) for (const id of ["idle-rpg-stage-clock", "idle-rpg-stage-paused"]) if (v.has(id) && v.get(id).style.opacity !== 0) problems.push(`${tag}: ${id} shows under it`);
          for (const old of ["idle-rpg-timesup-", "idle-rpg-advance-"]) if (v.ids(old).length) problems.push(`${tag}: a note`);
        }
      }
      assert.ok(problems.length === 0, `${problems.length} problems, e.g.\n${problems.slice(0, 8).join("\n")}`);
      // the full wording somewhere, and a shorter one where the section is narrow
      const texts = [...shown];
      assert.ok(texts.length >= 2, `only ${texts.join(" | ")}`);
    });

  test("the section's size and place are as without a message, and its height never changes", async () => {
    for (const w of [640, 700, 800, 1000, 1280, 1920, 2918]) {
      const v = await mountRaid({ stage: 12, best: 14 }, { width: w });
      const plain = v.box("idle-rpg-stage");
      STATES.advancing(v, "orc", 12);
      v.render();
      assert.deepEqual(v.box("idle-rpg-stage"), plain, `${w}px`);
    }
  });

  test("at 1920 wide every wording is whole; at 640, where the section is at its narrowest, the kind's name goes first", async () => {
    const wide = await mountRaid({ stage: 12, best: 13 }, { width: 1920 });
    STATES.advancing(wide, "goblin-mage", 12);
    wide.render();
    assert.deepEqual(wide.text(wide.ids("idle-rpg-stage-slain-")[0]), ["GOBLIN MAGE SLAIN! NEXT: STAGE 13 IN 4"]);
    const narrow = await mountRaid({ stage: 12, best: 13 }, { width: 640 });
    STATES.advancing(narrow, "goblin-mage", 12);
    narrow.render();
    assert.deepEqual(narrow.text(narrow.ids("idle-rpg-stage-slain-")[0]), ["SLAIN! NEXT IN 4"]);
    const farm = await mountRaid({ stage: 12, best: 14 }, { width: 640 });
    STATES["time's up"](farm, "orc", 12);
    farm.render();
    assert.deepEqual(farm.text("idle-rpg-stage-timesup-7"), ["TIME'S UP!"]);
  });
});

// The owner: "we should not be changing what icons are in the top bars, or
// their widths, it makes clicking back and forth harder/more confusing. for
// example clicking "To Town" shrinks the bar as it drops the gold/killcount
// info, and so when i expect to click back instantly i miss the "To the raid"
// button. similar thing i noticed with the new board button". So the sign
// (its button and its counts) and the strip (its status icons and chips) are
// drawn the same, in the same places, in town, in the raid and on the board,
// at every size and in every state; and a click on the sign's button or the
// board chip is undone by a click on the same spot.
describe("the top bars the same in every view", () => {
  const range = (a, b, step) => Array.from({ length: Math.floor((b - a) / step) + 1 }, (_, i) => a + i * step);
  const widths = THOROUGH ? range(320, 2400, 2) : [...range(320, 1400, 24), 1920, 2400];
  const heights = THOROUGH ? [230, 260, 296, 360, 480, 560] : [230, 296, 560];
  const shown = [
    ["town", { view: "town" }],
    ["raid", { view: "raid" }],
    ["board from town", { view: "board", back: "town" }],
    ["board from raid", { view: "board", back: "raid" }],
  ];
  const states = {
    "nobody in, nothing earned": { agents: 0 },
    "nobody in, gold": { agents: 0, gold: 5 },
    "one working, kills and gold": { gold: 1234, slain: 56 },
    "every status, points to spend": { statuses: ["blocked", "working", "done", "idle"], gold: 50, slain: 3, level: 4 },
    "a crowd, big numbers": { crowd: true, gold: 9.9e15, slain: 9.9e15, level: 9, stage: 999, best: 1000 },
  };
  // the sign, its button, its counts, the strip and everything in it: id -> box
  const bars = (v) => {
    const ids = ["idle-rpg-sign", "idle-rpg-view-toggle", "idle-rpg-slain", "idle-rpg-gold", "idle-rpg-points", "idle-rpg-hud", "idle-rpg-board-chip", "idle-rpg-map", "idle-rpg-gear", ...v.ids("idle-rpg-status-")];
    return Object.fromEntries(ids.map((id) => [id, v.has(id) ? v.box(id) : null]));
  };
  const show = (v, { view, back }) => {
    Object.assign(v.view, { view, back: back ?? v.view.back });
    v.render();
  };

  for (const [name, o] of Object.entries(states))
    test(`${name}: the sign, its button, its counts and the strip's chips identical in town, the raid and on the board (${widths.length} widths x ${heights.length} heights)`, async () => {
      const crowd = o.crowd ? ["blocked", "working", "done", "idle"].flatMap((st) => Array.from({ length: 120 }, (_, i) => agent(`${st}${i}`, st))) : null;
      const { saved, agents } = raid({ classes: ["warrior", "archer", "wizard", "healer"], status: "working", ...o });
      const v = await mountView({ saved, agents: o.agents === 0 ? [] : (crowd ?? agents) });
      const problems = [];
      for (const h of heights)
        for (const w of widths) {
          v.resize(w, h);
          const seen = shown.map(([label, s]) => {
            show(v, s);
            return [label, bars(v), v.has("idle-rpg-stage") ? v.box("idle-rpg-stage") : null];
          });
          const [, first] = seen[0];
          for (const [label, b] of seen.slice(1)) {
            for (const id of new Set([...Object.keys(first), ...Object.keys(b)]))
              if (JSON.stringify(first[id] ?? null) !== JSON.stringify(b[id] ?? null)) problems.push(`${w}x${h}: ${id} in town ${JSON.stringify(first[id])}, ${label} ${JSON.stringify(b[id])}`);
          }
          // the stage section may keep clear of the stations in town only; elsewhere the same
          for (const [label, , st] of seen.slice(2)) if (JSON.stringify(st) !== JSON.stringify(seen[1][2])) problems.push(`${w}x${h}: the stage section in the raid ${JSON.stringify(seen[1][2])}, ${label} ${JSON.stringify(st)}`);
          // and the chips there are, wherever the view: the board chip and the gear always, the map from 640
          const b = seen[0][1];
          for (const id of ["idle-rpg-sign", "idle-rpg-view-toggle", "idle-rpg-hud", "idle-rpg-board-chip", "idle-rpg-gear"]) if (!b[id]) problems.push(`${w}x${h}: no ${id}`);
          if (Boolean(b["idle-rpg-map"]) !== w >= 640) problems.push(`${w}x${h}: the map ${b["idle-rpg-map"] ? "shown" : "missing"}`);
          if ((o.gold || o.slain) && !(b["idle-rpg-gold"] && b["idle-rpg-slain"])) problems.push(`${w}x${h}: no kill or gold chip`);
        }
      assert.deepEqual(problems.slice(0, 8), [], `${problems.length} problems`);
    });

  test("the view button is as wide as its wider wording, whichever it says", async () => {
    const want = Math.max(lettersWidth(LABELS.toTown.toUpperCase()), lettersWidth(LABELS.toRaid.toUpperCase())) * 2 + 12;
    const v = await mountRaid({ gold: 5, slain: 1 });
    for (const [, s] of shown) {
      show(v, s);
      assert.equal(v.box("idle-rpg-view-toggle").w, want, s.view);
    }
  });

  // The element a click at a point lands on: of those with a click handler
  // under it, the one drawn last.
  const under = (v, p) => {
    const hits = v.all((n) => n.key && n.handlers?.click).filter((n) => {
      const b = v.box(n);
      return p.x >= b.x && p.x < b.x + b.w && p.y >= b.y && p.y < b.y + b.h;
    });
    return hits.at(-1)?.key ?? null;
  };
  const centre = (b) => ({ x: Math.floor(b.x + b.w / 2), y: Math.floor(b.y + b.h / 2) });

  test("a click on the view button's centre, then another on the same spot, goes there and back, at every size and state", async () => {
    const problems = [];
    for (const [name, o] of Object.entries(states))
      for (const from of ["town", "raid"]) {
        const { saved, agents } = raid({ classes: ["warrior", "archer"], ...o, view: from });
        const v = await mountView({ saved, agents: o.agents === 0 ? [] : agents });
        for (const h of [230, 360])
          for (const w of range(320, 1400, 40)) {
            v.resize(w, h);
            const p = centre(v.box("idle-rpg-view-toggle"));
            const tag = `${name}, from ${from} at ${w}x${h}`;
            for (const want of [from === "town" ? "raid" : "town", from]) {
              const id = under(v, p);
              if (id !== "idle-rpg-view-toggle") problems.push(`${tag}: the click lands on ${id}`);
              else v.click(id);
              if (v.view.view !== want) problems.push(`${tag}: in ${v.view.view}, not ${want}`);
            }
          }
      }
    assert.deepEqual(problems.slice(0, 8), [], `${problems.length} problems`);
  });

  test("a click on the board chip's centre opens the board, another on the same spot goes back, at every size and state", async () => {
    const problems = [];
    for (const [name, o] of Object.entries(states))
      for (const from of ["town", "raid"]) {
        const { saved, agents } = raid({ classes: ["warrior", "archer"], ...o, view: from });
        const v = await mountView({ saved, agents: o.agents === 0 ? [] : agents });
        for (const h of [230, 360])
          for (const w of range(320, 1400, 40)) {
            v.resize(w, h);
            const p = centre(v.box("idle-rpg-board-chip"));
            const tag = `${name}, from ${from} at ${w}x${h}`;
            for (const want of ["board", from]) {
              const id = under(v, p);
              if (id !== "idle-rpg-board-chip") problems.push(`${tag}: the click lands on ${id}`);
              else v.click(id);
              if (v.view.view !== want) problems.push(`${tag}: in ${v.view.view}, not ${want}`);
            }
          }
      }
    assert.deepEqual(problems.slice(0, 8), [], `${problems.length} problems`);
  });

  test("the map on the board opens the stage picker over it, as in town and the raid", async () => {
    const v = await mountRaid({ view: "board", back: "town", stage: 4, best: 6 }, { width: 900 });
    v.click("idle-rpg-map");
    assert.ok(v.has("idle-rpg-map-card") && v.has("idle-rpg-board"));
    v.click("idle-rpg-map-stage-2");
    assert.deepEqual([v.view.view, v.view.progress.stage, v.has("idle-rpg-map-card")], ["board", 2, false]);
  });
});
