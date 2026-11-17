// The shop (rules.js): per-class armours and weapons, hats bought once for
// every class, prices, buying (not twice, not without the gold) and equipping.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as R from "../mods/idle-rpg/rules.js";

const rich = (gold = 1000) => Object.assign(R.newProgress(), { gold });

describe("the catalogue", () => {
  test("armours: each class's own four colourways, the default free, then 5, 10, 20", () => {
    const names = { wizard: ["Violet", "Crimson", "Moss", "Frost"], healer: ["Teal", "Rose", "Sky", "Plum"], warrior: ["Steel", "Cobalt", "Jade", "Ruby"], archer: ["Forest", "Scarlet", "Azure", "Dusk"] };
    for (const c of R.CLASSES) {
      const items = R.catalogue(c, "armour");
      assert.deepEqual(items.map((it) => it.name), names[c]);
      assert.deepEqual(items.map((it) => it.price), [0, 5, 10, 20]);
      assert.equal(items[0].id, R.DEFAULT_LOOK);
    }
  });
  test("weapons: each class's own four, 0, 15, 30, 50, with their elements and the healer's potions", () => {
    assert.deepEqual(R.catalogue("warrior", "weapon").map((it) => [it.id, it.name, it.price, it.element]), [
      ["default", "Sword", 0, null], ["axe", "War Axe", 15, null], ["hammer", "Hammer", 30, null], ["flame", "Fire Blade", 50, "fire"],
    ]);
    assert.deepEqual(R.catalogue("wizard", "weapon").map((it) => it.element), ["fire", "frost", "storm", "poison"]);
    assert.deepEqual(R.catalogue("archer", "weapon").map((it) => it.id), ["default", "crossbow", "flame", "frost"]);
    assert.deepEqual(R.catalogue("healer", "weapon").map((it) => it.potion), ["heal", "haste", "might", "hex"]);
    for (const c of R.CLASSES) for (const it of R.catalogue(c, "weapon")) assert.ok(it.element === null || R.ELEMENTS.includes(it.element));
  });
  test("hats: the same four for every class, sold once for all of them", () => {
    for (const c of R.CLASSES) assert.deepEqual(R.catalogue(c, "hat").map((it) => [it.id, it.price]), [["default", 0], ["party", 10], ["santa", 20], ["pumpkin", 30]]);
    assert.equal(R.SHOP.hat.shared, "hats");
  });
  test("an unknown class or kind sells nothing, prototype keys included", () => {
    for (const [c, k] of [["bard", "armour"], ["wizard", "boots"], ["__proto__", "hat"], ["wizard", "__proto__"], ["wizard", "constructor"], ["constructor", "weapon"]]) assert.deepEqual(R.catalogue(c, k), []);
  });
});

describe("buying", () => {
  test("a colourway: the price comes off, the class owns it, it is not put on", () => {
    const p = rich(12);
    assert.ok(R.canBuy(p, "wizard", "armour", "crimson"));
    assert.ok(R.buy(p, "wizard", "armour", "crimson"));
    assert.equal(p.gold, 7);
    assert.ok(R.owns(p, "wizard", "armour", "crimson"));
    assert.equal(R.equipped(p, "wizard", "armour"), R.DEFAULT_LOOK);
    assert.equal(R.owns(p, "healer", "armour", "crimson"), false, "another class does not own it");
  });
  test("never twice, never without the gold, never what is not for sale", () => {
    const p = rich(30);
    assert.ok(R.buy(p, "archer", "weapon", "crossbow"));
    assert.equal(R.buy(p, "archer", "weapon", "crossbow"), false, "already owned");
    assert.equal(p.gold, 15);
    assert.equal(R.buy(p, "archer", "weapon", "flame"), false, "50 gold, 15 there");
    assert.equal(R.buy(p, "archer", "weapon", "default"), false, "the default is owned from the start");
    assert.equal(R.buy(p, "archer", "weapon", "axe"), false, "the warrior's");
    assert.equal(R.buy(p, "archer", "weapon", "__proto__"), false);
    assert.equal(R.buy(p, "archer", "boots", "x"), false);
    assert.equal(p.gold, 15);
    assert.deepEqual(p.looks.archer.weapon.owned, ["default", "crossbow"]);
  });
  test("gold exactly the price is enough, a coin short is not", () => {
    const p = rich(19);
    assert.equal(R.canBuy(p, "warrior", "armour", "ruby"), false);
    p.gold = 20;
    assert.ok(R.buy(p, "warrior", "armour", "ruby"));
    assert.equal(p.gold, 0);
  });
  test("a hat bought by one class is owned by all, and not sold again", () => {
    const p = rich(100);
    assert.ok(R.buy(p, "healer", "hat", "santa"));
    assert.deepEqual(p.hats, ["santa"]);
    for (const c of R.CLASSES) {
      assert.ok(R.owns(p, c, "hat", "santa"), c);
      assert.equal(R.canBuy(p, c, "hat", "santa"), false, c);
    }
    assert.equal(p.gold, 80);
  });
  test("buying into progress with missing records makes them", () => {
    const p = rich(100);
    delete p.looks;
    delete p.hats;
    assert.ok(R.buy(p, "warrior", "weapon", "axe"));
    assert.ok(R.buy(p, "warrior", "hat", "party"));
    assert.deepEqual(p.looks.warrior.weapon, { owned: ["default", "axe"], equipped: "default" });
    assert.deepEqual(p.hats, ["party"]);
  });
});

describe("equipping", () => {
  test("only what the class owns, and only if it is not on already", () => {
    const p = rich(100);
    assert.equal(R.equip(p, "warrior", "armour", "jade"), false, "not owned");
    R.buy(p, "warrior", "armour", "jade");
    assert.ok(R.equip(p, "warrior", "armour", "jade"));
    assert.equal(R.equip(p, "warrior", "armour", "jade"), false, "already on");
    assert.equal(R.equipped(p, "warrior", "armour"), "jade");
    assert.ok(R.equip(p, "warrior", "armour", R.DEFAULT_LOOK), "the default is a free click away");
  });
  test("each class wears its own hat from those everyone owns", () => {
    const p = rich(100);
    R.buy(p, "wizard", "hat", "party");
    R.buy(p, "wizard", "hat", "pumpkin");
    assert.ok(R.equip(p, "archer", "hat", "party"));
    assert.ok(R.equip(p, "healer", "hat", "pumpkin"));
    assert.deepEqual(R.CLASSES.map((c) => R.equipped(p, c, "hat")), ["default", "pumpkin", "default", "party"]);
  });
  test("an equipped id the class does not own reads as the default", () => {
    const p = rich();
    p.looks.archer.armour.equipped = "scarlet";
    p.looks.warrior.weapon.equipped = "__proto__";
    p.looks.wizard.hat.equipped = "party";
    assert.equal(R.equipped(p, "archer", "armour"), "default");
    assert.equal(R.equipped(p, "warrior", "weapon"), "default");
    assert.equal(R.equipped(p, "wizard", "hat"), "default");
    assert.equal(R.equipped(p, "bard", "armour"), "default");
  });
  test("owning: the default always, hostile ids never", () => {
    const p = rich();
    for (const c of R.CLASSES) for (const k of R.SHOP_KINDS) assert.ok(R.owns(p, c, k, R.DEFAULT_LOOK));
    for (const bad of ["__proto__", "constructor", "", null, undefined, 3]) assert.equal(R.owns(p, "wizard", "armour", bad), false);
    p.looks.wizard.armour.owned = "crimson"; // not a list
    assert.equal(R.owns(p, "wizard", "armour", "crimson"), false);
  });
});

describe("town decor", () => {
  test("the catalogue: None, then each season's set at its price (SEASONS), the same for every class", () => {
    for (const c of R.CLASSES)
      assert.deepEqual(R.catalogue(c, "decor").map((it) => [it.id, it.name, it.price]), [["default", "None", 0], ["halloween", "Halloween", 25], ["winter", "Winter", 25]]);
    assert.deepEqual(R.SEASONS.map((s) => s.price), [R.DECOR_PRICE, R.DECOR_PRICE]);
    assert.equal(R.SHOP.decor.town, "decor");
    assert.equal(R.SHOP.decor.shared, undefined);
    assert.deepEqual(R.newProgress().decor, { owned: ["default"], equipped: "default" });
    for (const c of R.CLASSES) assert.equal(R.newProgress().looks[c].decor, undefined, "no class wears it");
  });
  test("buying: not without the gold, exactly the price is enough, never twice; it belongs to the town, for every class", () => {
    const p = rich(24);
    assert.equal(R.canBuy(p, "wizard", "decor", "winter"), false, "a coin short");
    assert.equal(R.buy(p, "wizard", "decor", "winter"), false);
    assert.equal(p.gold, 24);
    p.gold = 25;
    assert.ok(R.buy(p, "wizard", "decor", "winter"));
    assert.equal(p.gold, 0);
    assert.deepEqual(p.decor, { owned: ["default", "winter"], equipped: "default" }, "bought, not put on (the shop puts it on)");
    for (const c of R.CLASSES) {
      assert.ok(R.owns(p, c, "decor", "winter"), c);
      assert.equal(R.canBuy(p, c, "decor", "winter"), false, `${c}: already owned`);
    }
    p.gold = 100;
    assert.equal(R.buy(p, "archer", "decor", "winter"), false, "never twice");
    assert.equal(R.buy(p, "archer", "decor", "default"), false, "None is owned from the start");
    for (const bad of ["spring", "__proto__", "constructor", "party"]) assert.equal(R.buy(p, "archer", "decor", bad), false, bad);
    assert.equal(p.gold, 100);
  });
  test("equipping is free, for the town whichever class does it; None takes it down", () => {
    const p = rich(60);
    assert.equal(R.equip(p, "healer", "decor", "halloween"), false, "not owned");
    R.buy(p, "healer", "decor", "halloween");
    R.buy(p, "healer", "decor", "winter");
    assert.equal(p.gold, 10);
    assert.ok(R.equip(p, "healer", "decor", "halloween"));
    assert.equal(R.equip(p, "archer", "decor", "halloween"), false, "already on, for the town");
    for (const c of R.CLASSES) assert.equal(R.equipped(p, c, "decor"), "halloween", c);
    assert.ok(R.equip(p, "warrior", "decor", "winter"), "one set at a time");
    assert.equal(R.equipped(p, "wizard", "decor"), "winter");
    assert.ok(R.equip(p, "wizard", "decor", R.DEFAULT_LOOK));
    assert.equal(R.equipped(p, "wizard", "decor"), "default");
    assert.equal(p.gold, 10, "equipping is free");
    for (const c of R.CLASSES) for (const k of ["armour", "weapon", "hat"]) assert.equal(R.equipped(p, c, k), "default", `${c} ${k}: untouched`);
  });
  test("missing or malformed records: made on a buy, read as nothing owned", () => {
    for (const bad of [undefined, null, "winter", [], { owned: "winter" }]) {
      const p = rich(25);
      p.decor = bad;
      assert.equal(R.equipped(p, "wizard", "decor"), "default");
      assert.equal(R.owns(p, "wizard", "decor", "winter"), false);
      assert.ok(R.buy(p, "wizard", "decor", "winter"), JSON.stringify(bad));
      assert.ok(R.equip(p, "wizard", "decor", "winter"));
      assert.deepEqual(p.decor, { owned: ["default", "winter"], equipped: "winter" });
    }
    const p = rich();
    p.decor = { owned: ["default"], equipped: "winter" };
    assert.equal(R.equipped(p, "wizard", "decor"), "default", "on but not owned: none");
  });
});
