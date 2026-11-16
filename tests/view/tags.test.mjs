// The name tags in the scene, in the pixel lettering on small pixel plates:
// an agent's (its space and tab names, any text a user typed), yours and the
// stations'. What they read back as for a table of names, cut to fit with an
// ellipsis, unknown characters as a box; never overlapping a neighbour at the
// default spacing; inside the scene at its edges; and what 100 of them cost.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { ELLIPSIS, UNKNOWN } from "../../mods/idle-rpg/rules.js";
import { agent, mountRaid, mountView, raid } from "../harness/view.mjs";

const THOROUGH = Boolean(process.env.HERDR_TESTS_THOROUGH);
const CLASSES = ["wizard", "healer", "warrior", "archer"];
const TAG_MAX_W = 84; // CELL_W 88 less 4px between neighbours
const TAG_H = 18;
const DOT = "·";
const E = ELLIPSIS;
const U = UNKNOWN;

// A town (or raid) with agents named `names` ([space, tab] each), their classes known.
async function named(names, { battle = false, width = 1280, height = 360, spots = null, status = "idle" } = {}) {
  const list = names.map(([space_name, tab_name], i) => agent(`n${i}`, status, { space_name, tab_name }));
  const { saved } = raid({ battle, classes: [] });
  saved.sprites = { you: "archer", ...Object.fromEntries(list.map((a, i) => [a.address, CLASSES[i % 4]])) };
  saved.seen = Object.fromEntries(list.map((a) => [a.address, 1_800_000_000_000]));
  if (spots) saved.spots = spots;
  const v = await mountView({ saved, agents: list, width, height });
  return v;
}
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
// The elements under (and including) `el`.
const count = (el) => (el.kids ? 1 + el.kids.reduce((n, k) => n + count(k), 0) : 0);

describe("an agent's tag", () => {
  const table = [
    [["Keep", "Hall"], `KEEP${DOT}HALL`],
    [["repo", "t1"], `REPO${DOT}T1`],
    [["lower case", "zsh"], `LOWER C${E}`], // cut where today's pill would be, with an ellipsis
    [["Café", "naïve"], `CAFE${DOT}NAI${E}`], // accents fold to their letters
    [["日本", "x"], `${U}${U}${DOT}X`], // a box for each character the face lacks
    [["\u{1F680}", "deploy"], `${U}${DOT}DEPLOY`],
    [["api", "50% done?"], `API${DOT}50%${E}`], // the space before the cut goes
    [["~/x", "[1] a_b"], `~/X${DOT}[1] A${E}`],
    [["repo", ""], "REPO"], // a blank name is left out, with its dot
    [["  ", "tab"], "TAB"],
    [["", ""], DOT], // both blank: the dot alone
    [["x".repeat(10000), "y"], `XXXXXXX${E}`], // a 10,000-character name
  ];
  test("reads back as the expected capitals for a table of names", async () => {
    const v = await named(table.map(([n]) => n));
    table.forEach(([n, want], i) => assert.deepEqual(v.text(`idle-rpg-label-n${i}`), [want], JSON.stringify(n)));
    // white, and drawn in the lettering
    assert.deepEqual(v.runs("idle-rpg-label-n0").map((r) => [r.face, r.colours]), [["lettering", ["white"]]]);
  });
  test("a plate as wide as its text plus 4px a side, at most 84 wide and 18 high, centred under the agent", async () => {
    const v = await named(table.map(([n]) => n));
    table.forEach((_, i) => {
      const b = v.box(`idle-rpg-label-n${i}`);
      const run = v.runs(`idle-rpg-label-n${i}`)[0];
      assert.equal(b.h, TAG_H);
      assert.ok(b.w <= TAG_MAX_W, `${run.text}: ${b.w}`);
      assert.equal(b.w, run.el.style.w + 8, run.text);
      assert.equal(b.x + b.w / 2, v.view.at[`n${i}`].x, "centred on the agent");
    });
    // its plate: a fill with an outline top and bottom, and an outline at each end, its corners cut
    const tag = v.get("idle-rpg-label-n0");
    const [band, left, right] = tag.kids;
    assert.deepEqual([band.style.left, band.style.top, band.style.w, band.style.border_t, band.style.border_b], [2, 0, tag.style.w - 4, 2, 2]);
    assert.deepEqual([left.style.left, left.style.top, left.style.h, right.style.left], [0, 2, TAG_H - 4, tag.style.w - 2]);
    assert.equal(tag.style.rounded, undefined, "hard edged, not a pill");
  });
  test("the whole name is in a tooltip when the tag cannot show it as typed", async () => {
    const v = await named([["Keep", "Hall"], ["lower case", "zsh"], ["Café", "x"], ["repo", "t1"]]);
    assert.equal(v.get("idle-rpg-label-n0").tip, null);
    assert.equal(v.get("idle-rpg-label-n1").tip, "lower case · zsh");
    assert.equal(v.get("idle-rpg-label-n2").tip, "Café · x");
    assert.equal(v.get("idle-rpg-label-n3").tip, null);
    // and the card keeps the full name in the app's font
    v.click("critter-n1");
    v.release("critter-n1");
    assert.ok(v.text("idle-rpg-card").includes("lower case · zsh"), v.text("idle-rpg-card").join("|"));
  });
  test("never overlaps a neighbour at the default spacing, for names up to the most a tag shows", async () => {
    // the widest a tag can be: wide letters, and names cut to the maximum
    const widest = [["MMMMMMMMMMMM", "WWW"], ["W".repeat(40), ""], ["#@#@#@#@", "x"], ["MW MW MW MW", "MW"]];
    // 20 fit on the default spots from 1280px; on a narrower scene they are a crowd (crowd.test.mjs), whose tags never overlap either
    for (const W of THOROUGH ? [640, 800, 1024, 1280, 1920] : [1280, 1920]) {
      const names = Array.from({ length: 20 }, (_, i) => widest[i % widest.length]);
      const v = await named(names, { width: W });
      const tags = names.map((_, i) => ({ key: `n${i}`, at: v.view.at[`n${i}`], box: v.has(`idle-rpg-label-n${i}`) ? v.box(`idle-rpg-label-n${i}`) : null })).filter((t) => t.box);
      let pairs = 0;
      for (let i = 0; i < tags.length; i++)
        for (let j = i + 1; j < tags.length; j++) {
          const [a, b] = [tags[i], tags[j]];
          assert.ok(!overlap(a.box, b.box), `${a.key} and ${b.key} overlap at ${W}: ${JSON.stringify(a.box)} ${JSON.stringify(b.box)}`);
          // neighbours in a row on default spots (place(): 250 + 88k), 88px or more apart; not an
          // agent the campfire pushed aside
          const spot = (t) => (t.at.x - 250) % 88 === 0;
          if (a.at.y !== b.at.y || Math.abs(a.at.x - b.at.x) < 88 || !spot(a) || !spot(b)) continue;
          pairs += 1;
          const gap = Math.max(b.box.x - (a.box.x + a.box.w), a.box.x - (b.box.x + b.box.w));
          assert.ok(gap >= 4, `${a.key} and ${b.key} only ${gap}px apart at ${W}`);
        }
      if (W >= 1280) {
        assert.equal(v.view.pitch, null, `the default spots at ${W}`);
        assert.ok(pairs >= 5, `only ${pairs} pairs of neighbours at ${W}`);
      }
      for (const t of tags) assert.ok(t.box.w >= TAG_MAX_W - 10, `${t.key} is about as wide as a tag gets: ${t.box.w}`);
    }
  });
  // (spots at the ends of the floor: x from 36 to the width less 36, y from 16 to 110, as a drop clamps them)
  test("stays inside the scene at its edges", async () => {
    for (const W of [320, 480, 640, 1280]) {
      const v = await named([["MMMMMMMMMMMM", "W"], ["WWWWWWWWWW", "M"], ["a", "b"]], { width: W, height: 230, spots: { n0: { x: 0, y: 110 }, n1: { x: 99999, y: 16 }, n2: { x: 36, y: 64 } } });
      for (const id of ["n0", "n1", "n2"]) {
        const b = v.box(`idle-rpg-label-${id}`);
        assert.ok(b.x >= 0 && b.x + b.w <= W, `${id} at ${b.x}..${b.x + b.w} in ${W}`);
        assert.ok(b.y >= 0 && b.y + b.h <= 230, `${id} at y ${b.y}..${b.y + b.h}`);
      }
    }
  });
  test("glides with its agent into formation and back (stable id, left and top transitions)", async () => {
    const v = await mountRaid({ classes: ["warrior", "archer"] });
    const el = v.get("idle-rpg-label-t1");
    assert.deepEqual([el.transitions.left, el.transitions.top], [{ duration: 700, easing: "ease-in-out" }, { duration: 700, easing: "ease-in-out" }]);
  });
  test("a knocked-out fighter's rest bar and countdown, and a status bubble, stay clear of the tag", async () => {
    const v = await mountRaid({ classes: ["archer", "wizard"], you: "healer" });
    v.advance(2000);
    Object.assign(v.view.party.members.t1, { hp: 0, down: v.view.clock + 120 });
    v.setAgents([...v.world.agents, agent("t9", "blocked")]);
    v.advance(1000);
    const tag = v.box("idle-rpg-label-t1");
    for (const id of ["idle-rpg-rest-count-t1"]) assert.ok(!overlap(v.box(id), tag), id);
    const rest = v.all((e) => e.key?.startsWith("idle-rpg-rest-t1-"))[0];
    assert.ok(v.box(rest).y + 7 <= tag.y);
    const bubble = v.box(v.get("critter-t9"));
    assert.ok(bubble.y + 72 <= v.box("idle-rpg-label-t9").y + 4, "the tag is under the feet, the bubble over the head");
  });
});

describe("your tag and the stations'", () => {
  test("YOU, outlined in white while your card is open", async () => {
    const v = await mountRaid({ battle: false });
    assert.deepEqual(v.text("idle-rpg-you-tag"), ["YOU"]);
    const edge = () => v.get("idle-rpg-you-tag").kids[1].style.bg;
    assert.equal(edge(), "#141a26");
    v.click("idle-rpg-you");
    v.release("idle-rpg-you");
    assert.equal(v.view.card, "you");
    assert.equal(edge(), "#ffffff");
  });
  test("CODEX, TRAINING and SHOP under the stations, outlined in white on a solid fill under the pointer", async () => {
    const v = await mountRaid({ battle: false });
    assert.deepEqual(["codex", "skills", "shop"].map((s) => v.text(`idle-rpg-station-${s}-tag`)[0]), ["CODEX", "TRAINING", "SHOP"]);
    for (const s of ["codex", "skills", "shop"]) {
      const tag = () => v.get(`idle-rpg-station-${s}-tag`);
      assert.deepEqual([tag().kids[0].style.bg, tag().kids[1].style.bg], ["#2b3649b8", "#141a26"]);
      v.hover(`idle-rpg-station-${s}`);
      assert.deepEqual([tag().kids[0].style.bg, tag().kids[1].style.bg], ["#2b3649", "#ffffff"], s);
      v.hover(`idle-rpg-station-${s}`, false);
      // centred under the station
      const st = v.box(`idle-rpg-station-${s}`);
      const b = v.box(tag());
      assert.ok(Math.abs(b.x + b.w / 2 - (st.x + st.w / 2)) <= 1, s);
    }
  });
});

describe("what tags cost", () => {
  test("each tag is 5 elements and 2 a character; 100 agents in town render in a bounded count", async () => {
    const name = (i) => [`workspace-${String(i).padStart(2, "0")}`, "cd"]; // 15 characters, cut to 8 glyphs
    // a small party: every tag
    const v = await named(Array.from({ length: 20 }, (_, i) => name(i)));
    let inTags = 0;
    for (let i = 0; i < 20; i++) {
      const el = v.get(`idle-rpg-label-n${i}`);
      const glyphs = v.images(`idle-rpg-label-n${i}`).length;
      assert.equal(count(el), 5 + 2 * glyphs);
      inTags += count(el);
    }
    assert.equal(inTags, 420);
    // 100 (a crowd, its tags thinned: see crowd.test.mjs): each drawn tag the same, and the whole in a bounded count
    const crowd = await named(Array.from({ length: 100 }, (_, i) => name(i)));
    const drawn = crowd.ids("idle-rpg-label-");
    for (const id of drawn) assert.equal(count(crowd.get(id)), 21);
    const total = crowd.all(() => true).length;
    assert.ok(total <= 4000, `${total} elements for 100 agents`);
    // the most a tag can hold is 18 glyphs (1 art px wide, 2 apart, in 38): 41 elements
    const thin = await named([["!".repeat(18), ""]]);
    assert.equal(thin.images("idle-rpg-label-n0").length, 18);
    assert.equal(count(thin.get("idle-rpg-label-n0")), 41);
  });
});
