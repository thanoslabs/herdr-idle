// The boss fighting back, as drawn: HP bars over those in the fight only, its
// attacks (pose, marker, what flies and lands), knockouts with the down pose,
// stars, and the countdown in its ring, getting up, and heals (more in healers.test.mjs).
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { KO_TICKS } from "../../mods/idle-rpg/party.js";
import { KINDS, KO_SECONDS, attackPart, kindOf, restArt } from "../../mods/idle-rpg/rules.js";
import { pathTo } from "../harness/elements.mjs";
import { pngSize } from "../harness/png.mjs";
import { agent, mountRaid, mountView, raid } from "../harness/view.mjs";

const THOROUGH = Boolean(process.env.HERDR_TESTS_THOROUGH);

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

  test("a bar has no outline: 40x5 over the head, its dark track (the HP lost) and its fill flush inside it", async () => {
    const v = await mountRaid({ classes: ["warrior"] });
    v.advance(1000);
    const m = v.view.party.members.t1;
    m.hp = m.maxHp * 0.4;
    v.setAgents([...v.world.agents]);
    const fill = v.get("idle-rpg-hp-t1");
    const track = fill.parent;
    assert.equal(track.style.bg, "#141a26");
    for (const k of ["p", "px", "py", "pt", "pb", "pl", "pr", "border", "border_color"]) assert.equal(track.style[k], undefined, `no ${k}`);
    assert.deepEqual(track.kids, [fill], "nothing but the fill");
    const feet = v.box("idle-rpg-vitals-t1");
    const at = (b) => ({ x: b.x - feet.x, y: b.y - feet.y, w: b.w, h: b.h });
    assert.deepEqual(at(v.box(track)), { x: -20, y: -77, w: 40, h: 5 });
    assert.deepEqual(at(v.box(fill)), { x: -20, y: -77, w: 16, h: 5 }, "from the track's left edge, its full height");
    assert.deepEqual(fill.transitions.width, { duration: 150, easing: "ease-out" });
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

  test("down: lying on its back, stars, and 30 counting down in gold inside a full ring, no HP bar", async () => {
    const v = await knockout();
    const pics = v.images("critter-t1");
    assert.ok(pics.some((p) => /classes\/wizard\/default\/down\/[lr]\.png$/.test(p)), pics.join());
    assert.ok(v.images("idle-rpg-vitals-t1").some((p) => p.endsWith("status/dizzy.png")));
    assert.deepEqual(v.text("idle-rpg-rest-count-t1"), ["30"]);
    assert.deepEqual(v.runs("idle-rpg-rest-count-t1")[0].colours, ["gold"]);
    assert.deepEqual(v.images("idle-rpg-rest-ring-t1")[0].split("/art/")[1], restArt(KO_SECONDS));
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

  test("the stars circle: a strip of pictures shown one at a time in a clipped box, by gpui-kit's frames, with no render of its own", async () => {
    const v = await knockout();
    const stars = v.get("idle-rpg-vitals-t1").kids.find((k) => k.loops?.top);
    // the box the countdown's ring is laid over (ringTop, vitalsBox): 75x33 from -38, -66, bobbing 4px down
    assert.deepEqual([stars.style.left, stars.style.top, stars.style.w, stars.style.h], [-38, -66, 75, 33]);
    assert.deepEqual(stars.loops.top, { from: -66, to: -62, period: 900 });
    assert.equal(stars.style.overflow_hidden, true, "only the picture in the box shows");
    // four elements in all (a box, the column, the lines and the strip), no loop but the bob
    const els = [...v.all((n) => pathTo(n).includes(stars))];
    assert.equal(els.length, 4);
    assert.deepEqual(els.flatMap((e) => Object.keys(e.loops)), ["top"]);
    const [column] = stars.kids;
    const [lines, strip] = column.kids;
    assert.equal(column.type, "v_flex");
    assert.equal(strip.src.split("/art/")[1], "status/dizzy.png");
    const frames = strip.style.h / 33;
    assert.deepEqual([strip.style.w, frames], [75, 10]);
    assert.deepEqual(pngSize("status/dizzy.png"), { w: 25 * 8, h: 11 * 8 * frames }, "ten 25x11 pictures, stacked");
    // the lines: invisible, 33px each, in turn ms apart; with n of them the strip's
    // top is at (n - frames) * 33, so picture frames - n is the one in the box
    assert.equal(lines.style.text_color, "#00000000");
    assert.equal(lines.style.line_height, "33px");
    const { list, ms } = lines.sequence;
    assert.equal(ms, 80);
    assert.equal(list.length, frames);
    assert.deepEqual(lines.kids.map((k) => k.text), [list[0]], "the first picture until frames takes over");
    const shown = list.map((text) => -(column.style.top + text.split("\n").length * 33) / 33 + 0); // (+ 0: no -0)
    assert.deepEqual(shown, Array.from({ length: frames }, (_, k) => k), "each picture once, in order, then round again");
    // (what the pictures show, a step round each and the last running on into the first: rules-art.test.mjs)
    // nothing of it is the view's to move: every render draws the same, the turning is the app's
    const same = (h) => {
      const s = h.get("idle-rpg-vitals-t1").kids.find((k) => k.loops?.top);
      return JSON.stringify({ top: s.kids[0].style.top, lines: s.kids[0].kids[0].sequence, kids: s.kids[0].kids[0].kids.map((k) => k.text) });
    };
    const first = same(v);
    for (let i = 0; i < 10; i++) {
      v.advance(370);
      if (v.view.knocked("t1")) assert.equal(same(v), first);
    }
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

describe("the countdown's ring", () => {
  // t1 knocked out on this tick, as a blow does it, in a small party in formation
  async function felled() {
    const v = await mountRaid({ classes: ["wizard", "warrior", "archer", "healer"], you: "warrior", stage: 1, health: 40 });
    v.advance(2000);
    Object.assign(v.view.party.members.t1, { hp: 0, down: v.view.clock + KO_TICKS });
    v.render();
    return v;
  }
  const ring = (v) => v.images("idle-rpg-rest-ring-t1").map((p) => p.split("/art/")[1]).filter((p) => p.startsWith("status/rest/"));
  const count = (v) => v.find("idle-rpg-rest-count-t1") && v.text("idle-rpg-rest-count-t1")[0];
  const centre = (b) => ({ x: b.x + b.w / 2, y: b.y + b.h / 2 });

  test("in place of the bar: 42px, centred over the feet, its bottom over the stars' highest point; the number in its middle", async () => {
    const v = await felled();
    assert.equal(v.find("idle-rpg-hp-t1"), null);
    const feet = v.box("idle-rpg-vitals-t1");
    const box = v.box("idle-rpg-rest-ring-t1");
    assert.deepEqual({ x: box.x - feet.x, y: box.y - feet.y, w: box.w, h: box.h }, { x: -21, y: -110, w: 42, h: 42 });
    const stars = v.get("idle-rpg-vitals-t1").kids.find((k) => k.loops?.top);
    const top = Math.min(stars.loops.top.from, stars.loops.top.to);
    assert.ok(box.y + box.h - feet.y <= top - 2, `the ring ends at ${box.y + box.h - feet.y}, the stars reach ${top}`);
    // two digits and one, each centred to the pixel (the font's outline is even all round)
    assert.deepEqual(centre(v.box("idle-rpg-rest-count-t1")), centre(box));
    v.until((h) => count(h) === "9", 40000);
    assert.deepEqual(centre(v.box("idle-rpg-rest-count-t1")), centre(box));
    // and the art's grid: the number sits on the ring's 2px pixels
    assert.equal((v.box("idle-rpg-rest-count-t1").x - box.x) % 2, 0);
  });

  test("full as they fall, half way at 15, a sliver in the last second, then gone with the bar back; a step a second, on the countdown's beat", async () => {
    const v = await felled();
    assert.deepEqual([count(v), ring(v)], ["30", [restArt(30)]]);
    const seen = [[30, v.renders]];
    let last = 30;
    v.until((h) => {
      if (!h.view.knocked("t1")) return true;
      const n = Number(count(h));
      assert.deepEqual(ring(h), [restArt(n)], `the ring shows ${n}`);
      if (n !== last) {
        assert.equal(h.view.koBeat, h.view.clock, `the ring stepped to ${n} off the beat`);
        seen.push([n, h.renders]);
        last = n;
      }
      return false;
    }, 40000);
    assert.deepEqual(
      seen.map(([n]) => n),
      Array.from({ length: KO_SECONDS }, (_, i) => KO_SECONDS - i),
    );
    assert.ok(seen.some(([n]) => n === 15) && seen.some(([n]) => n === 1));
    assert.equal(v.find("idle-rpg-rest-ring-t1"), null);
    assert.ok(v.find("idle-rpg-hp-t1"), "up, with its bar");
  });

  test("clear of the stars, everyone's name tag and the neighbours' bars in formation", async () => {
    const v = await felled();
    const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
    const box = v.box("idle-rpg-rest-ring-t1");
    const others = [...v.ids("idle-rpg-label-"), "idle-rpg-you-tag", ...v.ids("idle-rpg-hp-")];
    assert.ok(others.length >= 7, others.join());
    for (const id of others) assert.ok(!overlap(box, v.box(id)), id);
  });

  // Checks every ring drawn against what it must keep clear of, in key order
  // (as main.js places them): the HUD's frames (sign, stage section, strip)
  // and the plate with 4px round them, the standing fighters' HP bars with a
  // pixel round them, your tag and the rings placed before it. Each must sit at
  // the highest place from -110 down to -78 that meets none of them, or, with
  // none, the lowest of those meeting the least of the HUD and the plate, then
  // the least of the rest. Returns those left meeting
  // something: { key, what: ["hud" | "plate" | "bar" | "ring" | "tag"], top }.
  function ringsClear(v, at) {
    const grow = (b, n) => ({ x: b.x - n, y: b.y - n, w: b.w + 2 * n, h: b.h + 2 * n });
    const area = (a, b) => Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) * Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
    const fixed = [
      ...["idle-rpg-sign", "idle-rpg-stage", "idle-rpg-hud"].filter((id) => v.find(id)).map((id) => ["hud", grow(v.box(id), 4)]),
      ...(v.find("idle-rpg-plate") ? [["plate", grow(v.box("idle-rpg-plate"), 4)]] : []),
      ...v.ids("idle-rpg-hp-").map((id) => ["bar", grow(v.box(v.get(id).parent), 1)]),
      // (your tag sits under your feet, centred: the harness puts a box laid out in a row at its parent's top left)
      ...(v.find("idle-rpg-you-tag") ? [["tag", { x: v.view.you.x - v.box("idle-rpg-you-tag").w / 2, y: v.view.you.y + 6 + v.view.wallH, w: v.box("idle-rpg-you-tag").w, h: 18 }]] : []),
    ];
    const placed = [];
    const stuck = [];
    for (const key of v.ids("idle-rpg-rest-ring-").map((id) => id.slice("idle-rpg-rest-ring-".length)).sort()) {
      const box = v.box(`idle-rpg-rest-ring-${key}`);
      const feet = v.box(`idle-rpg-vitals-${key}`);
      const top = box.y - feet.y;
      const all = [...fixed, ...placed];
      const meets = (t) => all.filter(([, b]) => area({ ...box, y: feet.y + t }, b) > 0);
      // (what it overlaps of the HUD and the plate first, then of the rest)
      const over = (t) => meets(t).reduce((n, [w, b]) => n + area({ ...box, y: feet.y + t }, b) * (w === "hud" || w === "plate" ? 1e6 : 1), 0);
      let want = null;
      let least = Infinity;
      for (let t = -110; t <= -78 && want === null; t++) if (!over(t)) want = t;
      if (want === null) for (let t = -110; t <= -78; t++) if (over(t) <= least) [want, least] = [t, over(t)];
      assert.equal(top, want, `${key}'s ring at ${top}, not ${want} (${at})`);
      if (over(top)) stuck.push({ key, top, what: [...new Set(meets(top).map(([w]) => w))] });
      placed.push(["ring", box]);
    }
    return stuck;
  }
  // a raid of `n` working agents (an even mix) and you, everyone up, each knocked out at will
  const EIGHT = ["wizard", "warrior", "archer", "healer", "wizard", "warrior", "archer", "healer"];
  const fell = (v, keys) => {
    for (const [k, m] of Object.entries(v.view.party.members)) Object.assign(m, keys.includes(k) ? { hp: 0, down: v.view.clock + KO_TICKS } : { hp: m.maxHp, down: null });
    v.render();
  };

  test("kept clear of the HUD's frames and the boss's plate, lowered over the stars no further than the old bar's place; at its own from 360px tall", async () => {
    const heights = THOROUGH ? Array.from({ length: 18 }, (_, i) => 230 + i * 10) : [230, 250, 270, 280, 320, 360, 400];
    const widths = THOROUGH ? [640, 700, 800, 900, 1000, 1100, 1200, 1280, 1366, 1459] : [640, 700, 900, 1280, 1459];
    const near = (a, b) => a.x < b.x + b.w + 4 && b.x - 4 < a.x + a.w && a.y < b.y + b.h + 4 && b.y - 4 < a.y + a.h;
    let moved = 0;
    let rings = 0;
    const plated = [];
    // the slime (10), the ogre (17) and the dragon (30), then the first stage of every other kind
    const others = KINDS.map((k) => Array.from({ length: 40 }, (_, i) => i + 1).find((s) => kindOf(s) === k)).filter((s) => ![10, 17, 30].includes(s));
    for (const stage of THOROUGH ? [10, 17, 30, ...others] : [10, 30, 1, 21, 40])
      for (const icons of stage === 10 ? [false, true] : [false])
        for (const width of widths)
          for (const height of heights) {
            // two rows each side of the boss, back and front, all knocked out
            const v = await mountRaid({ classes: EIGHT, you: "warrior", stage, health: 40 }, { width, height });
            v.advance(1000);
            v.view.statuses.chill = icons ? 1e6 : 0; // the plate's row of status icons, or none
            fell(v, Object.keys(v.view.party.members));
            const at = `${width}x${height}, stage ${stage}${icons ? ", icons" : ""}`;
            assert.equal(v.images("idle-rpg-plate").some((p) => p.endsWith("effects/icons/chill.png")), icons, `${at}: the plate's icons`);
            const hud = ["idle-rpg-sign", "idle-rpg-stage", "idle-rpg-hud"].filter((id) => v.find(id)).map((id) => v.box(id));
            for (const id of v.ids("idle-rpg-rest-ring-")) {
              const box = v.box(id);
              const top = box.y - v.box(`idle-rpg-vitals-${id.slice("idle-rpg-rest-ring-".length)}`).y;
              rings += 1;
              if (top > -110) moved += 1;
              assert.ok(top >= -110 && top <= -78, `${id} at ${at}: top ${top}`);
              // from 360px tall the HUD's frames are out of its way
              if (height >= 360) assert.ok(!hud.some((f) => near({ ...box, y: box.y - top - 110 }, f)), `${id} at ${at}: under the HUD`);
            }
            // never left on a HUD frame; on the plate only by the two warriors beside the boss, on a short scene (the ogre's and the dragon's never)
            for (const s of ringsClear(v, at)) {
              assert.ok(!s.what.includes("hud"), `${s.key} at ${at} on the HUD`);
              if (s.what.includes("plate")) {
                plated.push(`${s.key} ${at}`);
                assert.ok(["t2", "t6"].includes(s.key) && s.top === -78 && height <= (icons ? 270 : 250) && width <= (icons ? 1480 : 700), `${s.key} at ${at} on the plate`);
              }
            }
          }
    assert.ok(rings > 100 && moved > 0 && plated.length > 0, `${moved} of ${rings} rings lowered, ${plated.length} on the plate`);
  });

  test("clear of the standing fighters' bars, each other and your tag wherever there is room, in a party of 4 or 8: every one and every two down", async () => {
    const heights = THOROUGH ? [230, 250, 270, 300, 330, 360, 400] : [230, 300, 400];
    const widths = THOROUGH ? [640, 740, 840, 1000, 1100, 1200, 1280, 1320, 1459] : [640, 1000, 1320, 1459];
    const tally = { cases: 0, stuck: 0, what: {} };
    for (const n of [4, 8])
      for (const width of widths)
        for (const height of heights) {
          const v = await mountRaid({ classes: EIGHT.slice(0, n), you: "archer", stage: 10, health: 40 }, { width, height });
          v.advance(1000);
          const keys = Object.keys(v.view.party.members).sort();
          const sets = [...keys.map((k) => [k]), ...keys.flatMap((a, i) => keys.slice(i + 1).map((b) => [a, b]))];
          for (const set of sets) {
            fell(v, set);
            tally.cases += 1;
            tally.rings = (tally.rings ?? 0) + set.length;
            for (const s of ringsClear(v, `${n} at ${width}x${height}, ${set.join("+")} down`)) {
              if (process.env.HERDR_RING_REPORT) console.log(`# stuck ${s.key} ${s.top} ${s.what} ${n} at ${width}x${height}, ${set.join("+")} down`);
              // on the HUD only you, from your spot at the back of the floor on a short scene; on the plate only as above
              if (s.what.includes("hud")) assert.ok(s.key === "you" && height <= 300, `${s.key} on the HUD at ${width}x${height}`);
              if (s.what.includes("plate")) assert.ok(["t2", "t6"].includes(s.key) && height <= 250 && width <= 700, `${s.key} on the plate at ${width}x${height}`);
              tally.stuck += 1;
              for (const w of s.what) tally.what[w] = (tally.what[w] ?? 0) + 1;
            }
          }
          // and you out of the fight, just behind a fighter knocked out (your tag over its head)
          fell(v, []);
          const t1 = v.view.at.t1;
          v.view.you = { x: t1.x, y: t1.y - 40 };
          v.view.youFights = false;
          fell(v, ["t1"]);
          tally.cases += 1;
          for (const s of ringsClear(v, `${n} at ${width}x${height}, you behind t1`)) {
            tally.stuck += 1;
            for (const w of s.what) tally.what[w] = (tally.what[w] ?? 0) + 1;
          }
        }
    if (process.env.HERDR_RING_REPORT) console.log(`# rings: ${JSON.stringify(tally)}`);
    assert.ok(tally.cases > 100);
  });

  test("one back from away still down leaves everyone else's countdown on its beat (boss alive or dead, back on any tick of a second)", async () => {
    for (const dead of [false, true])
      for (let off = 0; off < 4; off++) {
        const at = `${dead ? "boss dead" : "boss alive"}, back on a tick ${off} past the second`;
        const v = await mountRaid({ classes: ["warrior", "archer", "wizard"], you: "healer" });
        v.advance(3000);
        const P = v.view.party.members;
        Object.assign(P.t1, { hp: 0, down: v.view.clock + KO_TICKS });
        Object.assign(P.t2, { hp: 0, down: v.view.clock + KO_TICKS - 20 });
        v.render();
        v.advance(4000);
        if (dead) Object.assign(v.view.monster, { hp: 0, slainAt: Date.now(), advancing: v.view.monster.stage + 1 });
        const all = v.world.agents;
        const count = (k) => (v.find(`idle-rpg-rest-count-${k}`) ? Number(v.text(`idle-rpg-rest-count-${k}`)[0]) : null);
        const turns = [[v.view.clock, count("t1")]];
        const watch = () => {
          const n = count("t1");
          if (n !== turns.at(-1)[1]) turns.push([v.view.clock, n]);
        };
        v.setAgents(all.filter((a) => a.address !== "t2"));
        while ("t2" in P) (v.advance(250), watch());
        while (v.view.clock % 4 !== off) (v.advance(250), watch());
        const beat = v.view.koBeat;
        v.setAgents(all);
        while (count("t2") === null) (v.advance(250), watch());
        assert.ok(v.view.knocked("t2"), at);
        // as of when it came back, or a beat since
        assert.equal(count("t2"), Math.ceil((P.t2.down - Math.max(P.t2.back, v.view.koBeat)) / 4), `${at}: its kept rest at once`);
        assert.ok(count("t2") < 30, at);
        assert.ok(v.images("idle-rpg-rest-ring-t2").some((p) => p.endsWith(restArt(count("t2")))), at);
        if (v.view.clock === P.t2.back) assert.equal(v.view.koBeat, beat, `${at}: the shared beat is left alone`);
        watch();
        for (let i = 0; i < 6; i++) (v.advance(250), watch());
        assert.equal(v.view.monster.hp > 0, !dead, `${at}: still the same boss`);
        // t1's number goes down one at a time, a second (4 ticks) apart, never skipping or holding one over
        for (let i = 1; i < turns.length; i++) assert.equal(turns[i][1], turns[i - 1][1] - 1, `${at}: ${JSON.stringify(turns)}`);
        for (let i = 2; i < turns.length; i++) assert.equal(turns[i][0] - turns[i - 1][0], 4, `${at}: ${JSON.stringify(turns)}`);
        assert.ok(turns.length >= 3, `${at}: ${JSON.stringify(turns)}`);
      }
  });

  test("back from away still down: the ring and number show the rest it kept, not a fresh one", async () => {
    const v = await felled();
    v.advance(8000);
    const [a, ...rest] = v.world.agents;
    v.setAgents([{ ...a, status: "idle" }, ...rest]);
    v.advance(20000);
    assert.equal("t1" in v.view.party.members, false);
    v.setAgents([a, ...rest]);
    v.advance(250);
    assert.ok(v.view.knocked("t1"));
    const left = Math.ceil((v.view.party.members.t1.down - v.view.clock) / 4);
    assert.ok(left > 20 && left < 24, `${left}s left`);
    const n = Number(count(v));
    assert.ok(n >= left && n <= left + 1, `shows ${n} with ${left}s to run`);
    assert.deepEqual(ring(v), [restArt(n)]);
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
