// The panels: the codex, skills & training, the shop and the settings open
// and close (one at a time), buying training, buying and equipping in the
// shop, the settings' switches, and a later version's state staying read-only.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { DECOR_PRICE, trainingPrice } from "../../mods/idle-rpg/rules.js";
import { misshapen, mountRaid, mountView, raid, savedState, timeAt } from "../harness/view.mjs";

const PANELS = ["idle-rpg-codex", "idle-rpg-skills", "idle-rpg-shop", "idle-rpg-settings"];
const open = (v) => PANELS.filter((id) => v.has(id));
const rich = { gold: 500, slain: 3, level: 5 };

describe("opening and closing", () => {
  test("each chip on the sign opens its panel, and again closes it", async () => {
    const v = await mountRaid(rich);
    for (const [chip, panel] of [["idle-rpg-slain", "idle-rpg-codex"], ["idle-rpg-gold", "idle-rpg-shop"], ["idle-rpg-points", "idle-rpg-skills"], ["idle-rpg-gear", "idle-rpg-settings"]]) {
      v.click(chip);
      assert.deepEqual(open(v), [panel], chip);
      assert.equal(v.get(chip).style.border_color, "#141a26", "the chip is sunk while its panel is open");
      v.click(chip);
      assert.deepEqual(open(v), [], chip);
    }
  });
  test("only one is open at a time", async () => {
    const v = await mountRaid(rich);
    for (const chip of ["idle-rpg-slain", "idle-rpg-gold", "idle-rpg-points", "idle-rpg-gear", "idle-rpg-slain"]) {
      v.click(chip);
      assert.equal(open(v).length, 1, chip);
    }
  });
  test("each panel's × closes it", async () => {
    const v = await mountRaid(rich);
    for (const [chip, x] of [["idle-rpg-slain", "idle-rpg-codex-x"], ["idle-rpg-gold", "idle-rpg-shop-x"], ["idle-rpg-points", "idle-rpg-skills-x"], ["idle-rpg-gear", "idle-rpg-settings-x"]]) {
      v.click(chip);
      v.click(x);
      assert.deepEqual(open(v), [], x);
    }
  });
  test("a click on the floor, or on a frame's empty part, closes it; only the floor walks you", async () => {
    const v = await mountRaid(rich);
    v.click("idle-rpg-gold");
    const you = { ...v.view.you };
    v.click("idle-rpg-sign");
    assert.deepEqual(open(v), []);
    assert.deepEqual(v.view.you, you, "a frame press does not walk you");
    v.click("idle-rpg-gold");
    v.clickFloor(500, 100);
    assert.deepEqual(open(v), []);
    assert.deepEqual(v.view.you, { x: 500, y: 100 });
  });
  test("a click inside a panel keeps it open", async () => {
    const v = await mountRaid(rich);
    v.click("idle-rpg-gold");
    v.click("idle-rpg-shop-kind-hat");
    assert.deepEqual(open(v), ["idle-rpg-shop"]);
  });
  test("starting or ending a raid closes it", async () => {
    const v = await mountRaid(rich);
    v.click("idle-rpg-gold");
    v.click("idle-rpg-battle-toggle");
    assert.deepEqual(open(v), []);
    assert.equal(v.view.battle, false);
  });
  test("between raids the stations open them: book, dummy, stall; under the pointer they light up", async () => {
    const v = await mountRaid({ ...rich, battle: false });
    for (const [station, panel] of [["codex", "idle-rpg-codex"], ["skills", "idle-rpg-skills"], ["shop", "idle-rpg-shop"]]) {
      v.hover(`idle-rpg-station-${station}`);
      assert.ok(v.images(`idle-rpg-station-${station}`).some((p) => p.endsWith("hot.png")), station);
      assert.ok(v.images(`idle-rpg-station-${station}`).some((p) => p.endsWith("stations/arrow.png")));
      v.click(`idle-rpg-station-${station}`);
      assert.deepEqual(open(v), [panel]);
      v.hover(`idle-rpg-station-${station}`, false);
      assert.ok(!v.images(`idle-rpg-station-${station}`).some((p) => p.endsWith("hot.png")));
    }
  });
});

describe("the codex", () => {
  test("lists kills by kind; a kind not slain yet is ???; kills from before the codex get a line", async () => {
    const saved = savedState(7, { now: timeAt(), extra: { kills: { slime: 4, ogre: 0, dragon: 1 }, slain: 9 } });
    const v = await mountView({ saved });
    v.click("idle-rpg-slain");
    assert.deepEqual(v.text("idle-rpg-codex"), [
      "Codex", "×",
      "Forest", "???", "0", "???", "0", "Slime", "4",
      "Hills", "???", "0", "???", "0", "???", "0",
      "Caves", "???", "0", "???", "0", "Dragon", "1",
      "Hell", "???", "0", "???", "0", "???", "0", "???", "0",
      "Before the codex", "4",
    ]); // prettier-ignore
  });
});

describe("skills and training", () => {
  test("spending a point raises a rank; Reset gives them back", async () => {
    const v = await mountRaid({ level: 3 });
    v.click("idle-rpg-points");
    const cls = v.view.skillsOpen;
    assert.ok(v.text("idle-rpg-skills-points").join(" ").includes("2 points to spend"));
    v.click("idle-rpg-skill-power");
    assert.equal(v.view.progress.skills[cls].power, 1);
    assert.ok(v.text("idle-rpg-skills-points").join(" ").includes("1 point to spend"));
    v.click("idle-rpg-skills-reset");
    assert.equal(v.view.progress.skills[cls].power, 0);
  });
  test("buying training takes its price, raises it, and shows the next", async () => {
    const v = await mountRaid({ gold: 20 });
    v.click("idle-rpg-points");
    v.click("idle-rpg-skills-warrior");
    assert.deepEqual(v.text("idle-rpg-train-row-attack"), ["Attack", "Lv 0", "x1.00 damage", `Buy ${trainingPrice(0)}`]);
    v.click("idle-rpg-train-attack");
    assert.equal(v.view.progress.gold, 20 - trainingPrice(0));
    assert.deepEqual(v.text("idle-rpg-train-row-attack"), ["Attack", "Lv 1", "x1.12 damage", `Buy ${trainingPrice(1)}`]);
    v.click("idle-rpg-train-health");
    assert.deepEqual(v.text("idle-rpg-train-row-health").slice(0, 3), ["Health", "Lv 1", "x1.12 HP"]);
  });
  test("a buy the gold does not cover is dimmed and dead", async () => {
    const v = await mountRaid({ gold: 4, level: 2 });
    v.click("idle-rpg-points");
    const b = v.get("idle-rpg-train-attack");
    assert.equal(b.handlers.click, undefined);
    v.click("idle-rpg-train-attack");
    assert.equal(v.view.progress.gold, 4);
  });
});

describe("the shop", () => {
  test("buying an armour takes the gold and puts it on everyone of that class", async () => {
    const v = await mountRaid({ gold: 30, classes: ["warrior", "warrior"], you: "warrior", youAt: { x: 640, y: 120 } });
    v.click("idle-rpg-gold");
    assert.equal(v.view.shopOpen, "warrior");
    v.click("idle-rpg-shop-buy-ruby");
    assert.equal(v.view.progress.gold, 10);
    assert.deepEqual(v.text("idle-rpg-shop-item-ruby"), ["Ruby", "Equipped"]);
    for (const id of ["critter-t1", "critter-t2", "idle-rpg-you"]) assert.ok(v.images(id).every((p) => !p.includes("/classes/warrior/default/")), id);
    v.click("idle-rpg-shop-equip-default");
    assert.ok(v.images("critter-t1").some((p) => p.includes("/classes/warrior/default/")));
    assert.equal(v.view.progress.gold, 10, "equipping is free");
  });
  test("a hat bought for one class is owned by all; each puts it on itself", async () => {
    const v = await mountRaid({ gold: 30 });
    v.click("idle-rpg-gold");
    v.click("idle-rpg-shop-kind-hat");
    assert.deepEqual(v.text("idle-rpg-shop").filter((t) => t.startsWith("Bought once")), ["Bought once, for every class"]);
    v.click("idle-rpg-shop-buy-party");
    v.click("idle-rpg-shop-archer");
    assert.ok(v.has("idle-rpg-shop-equip-party"), "the archer owns it too");
    v.click("idle-rpg-shop-equip-party");
    assert.ok(v.images("critter-t2").some((p) => p.includes("hats/party/archer/")));
  });
  test("weapons: two lines on the one clicked; a buy without the gold is dead", async () => {
    const v = await mountRaid({ gold: 20 });
    v.click("idle-rpg-gold");
    v.click("idle-rpg-shop-kind-weapon");
    v.click("idle-rpg-shop-wizard");
    // the one on, until another is clicked
    assert.deepEqual([v.text("idle-rpg-shop-about-1"), v.text("idle-rpg-shop-about-2")], [["Fire Staff: Burn: +20% in 3s"], ["Normal speed · Fire"]]);
    v.click("idle-rpg-shop-item-frost");
    assert.deepEqual(v.text("idle-rpg-shop-about-1"), ["Ice Wand: 0.75× damage, 4/3 speed"]);
    v.click("idle-rpg-shop-healer");
    v.click("idle-rpg-shop-item-might");
    assert.deepEqual(v.text("idle-rpg-shop-about-1"), ["Might Vial: Aura: party +30% damage"]);
    assert.equal(v.get("idle-rpg-shop-buy-might").handlers.click, undefined, "30 gold, 20 there");
    v.click("idle-rpg-shop-buy-haste");
    assert.equal(v.view.progress.gold, 5);
    assert.equal(v.view.progress.looks.healer.weapon.equipped, "haste");
  });
});

describe("the shop's town decor", () => {
  const OCT = new Date(2026, 9, 15, 12).getTime();
  const tiles = (v) => ["default", "halloween", "winter"].map((id) => v.text(`idle-rpg-shop-item-${id}`));
  test("down the left after the hats; the same tiles on every class tab, with a picture of each set", async () => {
    const v = await mountRaid({ gold: 30 });
    v.click("idle-rpg-gold");
    assert.deepEqual(v.ids("idle-rpg-shop-kind-"), ["idle-rpg-shop-kind-armour", "idle-rpg-shop-kind-weapon", "idle-rpg-shop-kind-hat", "idle-rpg-shop-kind-decor"]);
    assert.deepEqual(v.text("idle-rpg-shop-kind-decor"), ["Town decor"]);
    assert.ok(v.images("idle-rpg-shop-kind-decor")[0].endsWith("/icons/decor.png"));
    v.click("idle-rpg-shop-kind-decor");
    assert.deepEqual(v.text("idle-rpg-shop").filter((t) => t.startsWith("Bought once")), ["Bought once, for the town"]);
    for (const c of ["wizard", "healer", "warrior", "archer"]) {
      v.click(`idle-rpg-shop-${c}`);
      assert.deepEqual(tiles(v), [["None", "Equipped"], ["Halloween", "Buy 2.5K"], ["Winter", "Buy 2.5K"]], c);
      assert.deepEqual(v.images("idle-rpg-shop-item-default"), [], `${c}: None has no picture`);
      for (const id of ["halloween", "winter"]) {
        assert.deepEqual(v.images(`idle-rpg-shop-item-${id}`).map((p) => p.split("/art/")[1]), [`seasons/${id}/icon.png`], `${c} ${id}`);
        const img = v.all((n) => n.type === "image" && n.src.endsWith(`/seasons/${id}/icon.png`))[0];
        assert.deepEqual([img.style.w, img.style.h], [54, 36]);
      }
      assert.deepEqual([v.text("idle-rpg-shop-about-1"), v.text("idle-rpg-shop-about-2")], [["None"], ["No decor of your own"]]);
      v.click("idle-rpg-shop-item-winter");
      assert.deepEqual([v.text("idle-rpg-shop-about-1"), v.text("idle-rpg-shop-about-2")], [["Winter"], ["Looks only, for the town, all year"]]);
    }
    // the tiles are the hats' size: the panel's rows are unchanged
    assert.equal(v.get("idle-rpg-shop-item-winter").style.h, 78);
  });
  test("buying: dimmed and dead while short, the price exactly is enough; it goes up at once and saves; for every class", async () => {
    assert.equal(DECOR_PRICE, 2500);
    const v = await mountRaid({ gold: DECOR_PRICE - 1, battle: false, status: "idle" });
    v.click("idle-rpg-station-shop");
    v.click("idle-rpg-shop-kind-decor");
    assert.equal(v.get("idle-rpg-shop-buy-winter").handlers.click, undefined, "2,499 gold, 2,500 the price");
    v.click("idle-rpg-shop-buy-winter");
    assert.equal(v.view.progress.gold, DECOR_PRICE - 1);
    assert.deepEqual(v.ids("idle-rpg-season-"), [], "out of season, nothing bought: nothing up");
    v.view.progress.gold = DECOR_PRICE; // a coin more
    v.render();
    const n = v.saves.length;
    v.click("idle-rpg-shop-buy-winter");
    assert.equal(v.saves.length, n + 1, "saved at once");
    assert.equal(v.view.progress.gold, 0);
    assert.deepEqual(v.stored.decor, { owned: ["default", "winter"], equipped: "winter" }, "bought and put up, as a hat is put on");
    assert.deepEqual(tiles(v), [["None", "Equip"], ["Halloween", "Buy 2.5K"], ["Winter", "Equipped"]]);
    assert.ok(v.has("idle-rpg-season-string-a"), "the town is decorated for winter in January");
    for (const c of ["wizard", "healer", "warrior", "archer"]) {
      v.click(`idle-rpg-shop-${c}`);
      assert.deepEqual(tiles(v), [["None", "Equip"], ["Halloween", "Buy 2.5K"], ["Winter", "Equipped"]], c);
    }
  });
  test("None takes it down and Equip puts it back up, free, from any class's tab", async () => {
    const decor = { owned: ["default", "halloween", "winter"], equipped: "halloween" };
    const v = await mountView({ saved: raid({ battle: false, gold: 7, decor, now: timeAt() }).saved, agents: [] });
    v.click("idle-rpg-station-shop");
    v.click("idle-rpg-shop-kind-decor");
    assert.ok(v.has("idle-rpg-season-barrel"));
    const classes = ["wizard", "healer", "warrior", "archer"];
    for (const [i, c] of classes.entries()) {
      v.click(`idle-rpg-shop-${c}`);
      const n = v.saves.length;
      v.click("idle-rpg-shop-equip-default");
      assert.equal(v.saves.length, n + 1, c);
      assert.deepEqual(v.ids("idle-rpg-season-"), [], `${c}: taken down`);
      assert.equal(v.stored.decor.equipped, "default");
      const next = i % 2 ? "halloween" : "winter";
      v.click(`idle-rpg-shop-equip-${next}`);
      assert.equal(v.stored.decor.equipped, next, c);
      assert.ok(v.has(next === "winter" ? "idle-rpg-season-tree" : "idle-rpg-season-barrel"), `${c}: ${next} up`);
      assert.deepEqual(v.text(`idle-rpg-shop-item-${next}`), [next === "winter" ? "Winter" : "Halloween", "Equipped"]);
    }
    assert.equal(v.view.progress.gold, 7, "equipping is free");
    assert.deepEqual(v.stored.decor.owned, ["default", "halloween", "winter"]);
    for (const c of classes) for (const k of ["armour", "weapon", "hat"]) assert.equal(v.stored.looks[c][k].equipped, "default", `${c} ${k}`);
  });
  test("in October with the winter set on, the shop says it is on though the season's shows (Season over my decor)", async () => {
    const decor = { owned: ["default", "winter"], equipped: "winter" };
    const v = await mountView({ saved: raid({ battle: false, decor, now: timeAt(0.25, OCT) }).saved, agents: [], at: OCT });
    assert.ok(v.has("idle-rpg-season-barrel") && !v.has("idle-rpg-season-string-a"));
    v.click("idle-rpg-station-shop");
    v.click("idle-rpg-shop-kind-decor");
    assert.deepEqual(v.text("idle-rpg-shop-item-winter"), ["Winter", "Equipped"]);
  });
});

describe("the shop's pictures", () => {
  test("every picture in the shop has a box of its own shape", { todo: "the Hats tab's icon (icons/hat.png, 72x64) is given an 18x18 box: Herdr draws it at 18x16, centred (main.js shopCard nav, SHOP_ICONS)" }, async () => {
    const v = await mountRaid({ gold: 50 });
    v.click("idle-rpg-gold");
    assert.deepEqual(misshapen(v.get("idle-rpg-shop"), new Set()), []);
  });
});

describe("settings", () => {
  test("damage numbers off: none drawn, and critical blows show as a small gold note instead", async () => {
    const v = await mountRaid({ classes: ["warrior", "archer"], skills: { warrior: { crit: 5 }, archer: { crit: 5 } }, level: 6, stage: 3, health: 20 }); // level 6: the 5 points the ranks need
    v.click("idle-rpg-gear");
    v.click("idle-rpg-setting-damageNumbers");
    assert.equal(v.view.settings.damageNumbers, false);
    assert.equal(v.get("idle-rpg-setting-damageNumbers-knob").style.left, 0);
    v.click("idle-rpg-gear");
    v.until((h) => h.ids("idle-rpg-crit-").length > 0, 60000);
    assert.equal(v.ids("idle-rpg-damage-").length, 0);
  });
  test("advance off: a kill repeats the stage", async () => {
    const v = await mountRaid({ classes: ["warrior", "archer", "wizard"], you: "archer", level: 5 });
    v.click("idle-rpg-gear");
    v.click("idle-rpg-setting-advance");
    v.until((h) => h.view.progress.slain === 1, 120000);
    assert.deepEqual([v.view.progress.stage, v.view.progress.best], [1, 2]);
  });
  test("each switch saves at once", async () => {
    const v = await mountRaid();
    const n = v.saves.length;
    v.click("idle-rpg-gear");
    v.click("idle-rpg-setting-advance");
    assert.equal(v.saves.length, n + 1);
    assert.deepEqual(v.stored.settings, { damageNumbers: true, advance: false, seasonal: true, seasonFirst: true });
  });
});

describe("a later version's state", () => {
  test("is read and played, never written: buying, settings, kills and closing save nothing", async () => {
    const saved = savedState(10, { now: timeAt(), extra: { gold: 300, xp: { you: 0, wizard: 5000, healer: 5000, warrior: 5000, archer: 5000 } } });
    const v = await mountView({ saved, agents: [] });
    assert.equal(v.view.readOnly, true);
    v.click("idle-rpg-gold");
    v.click("idle-rpg-shop-buy-moss");
    assert.equal(v.view.progress.gold, 290, "bought, in memory");
    v.click("idle-rpg-gear");
    v.click("idle-rpg-setting-advance");
    v.clickFloor(400, 90);
    v.close();
    assert.deepEqual(v.saves, []);
    assert.equal(v.stored.version, 10);
  });
});
