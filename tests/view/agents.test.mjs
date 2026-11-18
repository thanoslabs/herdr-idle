// Agents coming, going and being odd: cards (and their Health row), classes,
// statuses changing mid-fight, and addresses that are also names on
// Object.prototype.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { KO_SECONDS, maxHpOf, shortNumber } from "../../mods/idle-rpg/rules.js";
import { agent, mountRaid, mountView, raid } from "../harness/view.mjs";

describe("coming and going", () => {
  test("an agent's card shows where it works and what it is; Go to terminal focuses it", async () => {
    const v = await mountRaid({ classes: ["archer"], view: "town", status: "blocked" });
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
  test("an agent that leaves hurt comes back with the HP it left with (not refilled)", async () => {
    const v = await mountRaid({ classes: ["warrior", "archer"], stage: 8, health: 10 });
    v.until((h) => h.view.party.members.t1 && h.view.party.members.t1.hp < h.view.party.members.t1.maxHp && h.view.party.members.t1.down === null, 120000, 250);
    const [a, b] = v.world.agents;
    v.setAgents([{ ...a, status: "idle" }, b]);
    v.until((h) => !("t1" in h.view.party.members), 2000, 250);
    const hp = v.view.party.away.t1.hp;
    assert.ok(hp < v.view.party.away.t1.maxHp);
    v.setAgents([a, b]);
    v.until((h) => h.view.party.members.t1, 2000, 250);
    const m = v.view.party.members.t1;
    // as it left, unless a blow struck it on the very tick it came back
    assert.ok(m.hp === hp || m.hitAt === v.view.clock, `${m.hp} against ${hp}`);
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
      const v = await mountView({ saved: raid({ view: "town" }).saved, agents: [agent(address, "idle")] });
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

// The card's Health row (agents' and yours, in place of the class's name, which
// the class's meter under it still shows): "<hp>/<max>" and a bar in the HP
// bar's colours in the fight, "Knocked out · Ns" (the ring's number) while
// knocked out, and out of the fight what they would be back with.
describe("the card's Health row", () => {
  const open = (v, key) => {
    const id = key === "you" ? "idle-rpg-you" : `critter-${key}`;
    v.click(id);
    v.release(id);
    assert.ok(v.has("idle-rpg-card"), `${key}'s card open`);
  };
  // the row's words, and its bar's fill width and colour (null with none)
  const row = (v) => {
    const fill = v.find("idle-rpg-card-hp");
    return { text: v.text("idle-rpg-card-health"), bar: fill ? [fill.style.w, fill.style.bg] : null };
  };
  const hpText = (hp, max) => `${shortNumber(Math.ceil(hp))}/${shortNumber(Math.ceil(max))}`;
  const tone = (share) => (share > 0.5 ? "#4cd47b" : share > 0.25 ? "#ffd166" : "#ff5d5d");
  const want = (hp, max) => ({ text: ["Health", hpText(hp, max)], bar: [`${Math.round((100 * hp) / max)}%`, tone(hp / max)] });

  test("it takes the class row's place on your card (the card no taller); an agent's has it after what it is doing", async () => {
    const v = await mountRaid({ classes: ["archer"], you: "wizard", view: "town", status: "idle" });
    open(v, "you");
    const you = v.text("idle-rpg-card");
    assert.deepEqual(you.slice(0, 4), ["You", "×", "Health", hpText(maxHpOf(v.view.progress, "wizard"), maxHpOf(v.view.progress, "wizard"))]);
    assert.ok(you.includes("Wizard"), "the class is still named on its meter");
    assert.ok(!you.includes("Class"));
    v.click("idle-rpg-card-x");
    open(v, "t1");
    const t1 = v.text("idle-rpg-card");
    const at = t1.indexOf("Health");
    assert.ok(at > t1.indexOf("Doing") && t1.includes("Claude Code") && t1.includes("Archer"), t1.join("|"));
    // the bar after the number, up to 40px (at least 12), no outline round it, like the one over a character's head
    const track = v.get("idle-rpg-card-hp").parent;
    assert.deepEqual([track.style.max_w, track.style.min_w, track.style.h, track.style.border ?? null], [40, 12, 5, null]);
  });

  test("in the fight: their HP now, rounded up, with the bar's colours, following hits while the card is open", async () => {
    for (const key of ["t1", "you"]) {
      const v = await mountRaid({ classes: ["warrior", "archer"], you: "archer", stage: 8, health: 10 });
      v.advance(2000);
      open(v, key);
      const m = v.view.party.members[key];
      assert.deepEqual(row(v), want(m.hp, m.maxHp), `${key} at full HP`);
      const seen = new Set();
      v.until((h) => {
        const mm = h.view.party.members[key];
        if (mm.down === null) {
          // as the next muster makes it, should a level-up have raised its max HP since this tick's
          const max = maxHpOf(h.view.progress, h.view.sprites[key]);
          assert.deepEqual(row(h), want(Math.min(max, mm.hp + Math.max(0, max - mm.maxHp)), max), `${key} at ${mm.hp}`);
          seen.add(tone(mm.hp / mm.maxHp));
        }
        return seen.size >= 2;
      }, 300000, 250);
      assert.ok(v.has("idle-rpg-card"), "still open");
    }
  });

  test("knocked out: 'Knocked out · Ns' in gold, the number the ring shows, second by second", async () => {
    for (const key of ["t1", "you"]) {
      const v = await mountRaid({ classes: ["wizard", "archer"], you: "archer", stage: 30 });
      v.until((h) => h.view.party.members[key]?.down != null, 120000, 250);
      open(v, key);
      // in the gold of the countdown's number
      const words = v.get("idle-rpg-card-health").kids[1];
      assert.deepEqual([words.style.text_color, words.style.font_semibold], ["#ffd166", undefined]);
      const counts = new Set();
      v.until((h) => {
        const m = h.view.party.members[key];
        if (m.down === null) return true;
        const ring = h.text(`idle-rpg-rest-count-${key}`)[0];
        assert.deepEqual(row(h), { text: ["Health", `Knocked out · ${ring}s`], bar: null });
        counts.add(ring);
        return false;
      }, 40000, 250);
      assert.ok(counts.size >= 20, `${counts.size} seconds seen`);
      // up again: its HP, full
      const m = v.view.party.members[key];
      assert.deepEqual(row(v), want(m.hp, m.maxHp));
    }
  });

  test("out of the fight: their full max HP (class level and Health training), in town, idle, or after the attempt", async () => {
    const v = await mountRaid({ classes: ["warrior"], you: "healer", view: "town", status: "idle", level: 7, health: 3 });
    for (const key of ["t1", "you"]) {
      open(v, key);
      const max = maxHpOf(v.view.progress, v.view.sprites[key]);
      assert.ok(max > maxHpOf({ xp: {} }, v.view.sprites[key]), "more than a fresh class's");
      assert.deepEqual(row(v), want(max, max), key);
      v.click("idle-rpg-card-x");
    }
    // idle in a raid: never in the fight
    const r = await mountRaid({ classes: ["warrior", "archer"], statuses: ["working", "idle"], stage: 3 });
    r.advance(3000);
    open(r, "t2");
    assert.ok(!("t2" in r.view.party.members));
    const max = maxHpOf(r.view.progress, "archer");
    assert.deepEqual(row(r), want(max, max));
  });

  test("away within the attempt: the HP they left with, or their rest, frozen; full again once the boss falls", async () => {
    const v = await mountRaid({ classes: ["warrior", "archer"], stage: 8, health: 10 });
    v.until((h) => h.view.party.members.t1 && h.view.party.members.t1.hp < h.view.party.members.t1.maxHp && h.view.party.members.t1.down === null, 120000, 250);
    const [a, b] = v.world.agents;
    v.setAgents([{ ...a, status: "idle" }, b]);
    v.until((h) => !("t1" in h.view.party.members), 2000, 250);
    const was = v.view.party.away.t1;
    open(v, "t1");
    assert.deepEqual(row(v), want(was.hp, was.maxHp), "what it would come back with");
    // then the boss falls: the next attempt starts everyone fresh
    v.view.monster.hp = 0;
    v.view.monster.slainAt = v.now;
    v.render();
    const max = maxHpOf(v.view.progress, "warrior");
    assert.deepEqual(row(v), want(max, max));
    // away knocked out: the rest it had left, which does not run while it is away
    const k = await mountRaid({ classes: ["wizard", "archer"], you: "archer", stage: 30 });
    k.until((h) => h.view.party.members.t1?.down != null, 120000, 250);
    const [ka, kb] = k.world.agents;
    k.setAgents([{ ...ka, status: "idle" }, kb]);
    k.until((h) => !("t1" in h.view.party.members), 2000, 250);
    open(k, "t1");
    const secs = Math.ceil((k.view.party.away.t1.rest * 250) / 1000);
    assert.deepEqual(row(k), { text: ["Health", `Knocked out · ${secs}s`], bar: null });
    k.advance(5000);
    assert.deepEqual(row(k), { text: ["Health", `Knocked out · ${secs}s`], bar: null }, "frozen");
  });

  test("an open card costs no render and no timer of its own", async () => {
    // the same fight (knockouts, hits and heals) with the card open on a fighter and without
    const play = async (card) => {
      const v = await mountRaid({ classes: ["wizard", "archer"], you: "archer", stage: 30 });
      v.advance(1000);
      if (card) open(v, "t1");
      const start = v.renders;
      v.advance(30000);
      if (card) assert.ok(v.has("idle-rpg-card"));
      return { renders: v.renders - start, timers: v.pendingTimers().map((t) => t.every ?? "after").sort(), members: JSON.stringify(v.view.party.members) };
    };
    assert.deepEqual(await play(true), await play(false));
  });
  // Geist's advance widths (Regular, per 1000 of the size), as the shop's lines are measured (effects.test.mjs)
  const GEIST = { " ": 250, "!": 213, "%": 802, "+": 558, ",": 201, "-": 419, ".": 201, "/": 480, ":": 297, "·": 201, "×": 502, 0: 663, 1: 384, 2: 619, 3: 613, 4: 615, 5: 626, 6: 593, 7: 524, 8: 604, 9: 593, A: 668, B: 680, C: 703, D: 694, E: 603, F: 590, G: 700, H: 713, I: 270, J: 597, K: 640, L: 580, M: 877, N: 743, O: 739, P: 650, Q: 733, R: 672, S: 640, T: 552, U: 689, V: 667, W: 945, X: 606, Y: 576, Z: 544, a: 551, b: 595, c: 546, d: 595, e: 561, f: 395, g: 594, h: 581, i: 244, j: 260, k: 590, l: 267, m: 877, n: 581, o: 573, p: 595, q: 595, r: 379, s: 520, t: 392, u: 575, v: 536, w: 819, x: 585, y: 537, z: 537 };
  const at11 = (text) => ([...text].reduce((w, ch) => w + (GEIST[ch] ?? 1000), 0) / 1000) * 11;
  test("its words fit the card's value column with room to spare, whatever the numbers", () => {
    // the card 232 wide, 1px border and 10 padding a side, the 56px portrait and 8 gap, the 38px label and 6 gap
    const column = 232 - 2 - 20 - 56 - 8 - 38 - 6;
    assert.equal(column, 102);
    // every way shortNumber writes HP up to the most any class can have (the most experience, Health training at
    // MAX_TRAINING: about 5.3E57), and the widest of each shape (two-digit powers of ten)
    const top = Math.max(...["wizard", "healer", "warrior", "archer"].map((c) => maxHpOf({ xp: { [c]: Number.MAX_SAFE_INTEGER }, training: { [c]: { attack: 0, health: 1000 } } }, c)));
    assert.ok(top > 1e57 && top < 1e99, String(top));
    const all = new Set();
    for (let n = 1; n <= top; n = n * 1.37 + 1) all.add(shortNumber(n));
    for (const d of "123456789") for (const e of ["0", "5", "8"]) for (const ex of ["15", "50", "88", "99"]) all.add(`${d}.${e}E${ex}`);
    for (const d of "123456789") all.add(`${d}.0K`).add(`${d}0${d}M`).add(`${d}${d}${d}`);
    const widest = [...all].sort((a, b) => at11(b) - at11(a))[0];
    const hp = at11(`${widest}/${widest}`);
    assert.ok(hp + 4 + 12 <= column - 4, `"${widest}/${widest}" is ${hp.toFixed(1)}px, with the gap and the bar's least 12px`);
    const ko = Math.max(...Array.from({ length: KO_SECONDS + 1 }, (_, i) => at11(`Knocked out · ${i}s`)));
    assert.ok(ko <= column - 8, `"Knocked out · 30s" is ${ko.toFixed(1)}px`);
  });

  test("a class picked mid-fight shows its max HP at once (the next muster's HP), before the party catches up", async () => {
    const v = await mountRaid({ classes: ["wizard"], you: "archer", stage: 3, level: 5 });
    v.advance(2000);
    open(v, "t1");
    const m = v.view.party.members.t1;
    const before = m.maxHp;
    v.click("idle-rpg-card-wrench");
    v.click("idle-rpg-pick-warrior");
    const max = maxHpOf(v.view.progress, "warrior");
    assert.ok(max > before);
    assert.equal(m.maxHp, before, "the party not yet mustered");
    assert.deepEqual(row(v).text, ["Health", hpText(Math.min(max, m.hp + max - before), max)]);
    v.advance(250);
    assert.deepEqual(row(v).text, ["Health", hpText(v.view.party.members.t1.hp, v.view.party.members.t1.maxHp)], "the same once mustered");
  });
});
