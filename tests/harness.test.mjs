// The harness itself (tests/harness/): its element builder is as strict as
// gpui-kit, its pixel text reads back what main.js wrote, its clock runs
// timers in order, and its module stand-ins record what the view asks of Herdr.
import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { div, image, readRun, texts } from "./harness/elements.mjs";
import { Timers, seeded } from "./harness/clock.mjs";
import { drawnIn, pngSize } from "./harness/png.mjs";
import { mountRaid } from "./harness/view.mjs";

describe("elements", () => {
  test("a method gpui-kit does not have throws, naming it", () => {
    assert.throws(() => div().colour("red"), /colour\(\) is not a gpui-kit element method/);
  });
  test("a child given to two parents throws (gpui-kit consumes it)", () => {
    const c = div();
    div().child(c);
    assert.throws(() => div().child(c), /two parents/);
  });
  test("undefined is not a child; strings and numbers are text; booleans nothing", () => {
    assert.throws(() => div().child(undefined), TypeError);
    assert.deepEqual(texts(div().child("a").child(3).child(false)), ["a", "3"]);
  });
  test("frames() is recorded as gpui-kit takes it: a list of strings, at least 16 ms apart", () => {
    assert.deepEqual(div().frames(["a", "b"], 80).sequence, { list: ["a", "b"], ms: 80 });
    assert.throws(() => div().frames(["a"], 15), /at least 16/);
    assert.throws(() => div().frames([1], 80), /list of strings/);
  });
  test("an image path must be a string, and one that is not in art/ fails the render", async () => {
    assert.throws(() => image(undefined), TypeError);
    const v = await mountRaid();
    v.view.render = () => div().child(image("mods/idle-rpg/art/nope.png"));
    assert.throws(() => v.render(), /not in art/);
  });
  test("a picture given a box of another shape fails the render (Herdr draws it smaller, never stretched)", async () => {
    const v = await mountRaid();
    const pic = (w, h) => () => div().child(image("mods/idle-rpg/art/scene/wall.png").w(w).h(h)); // a 2:1 picture
    v.view.render = pic(128, 64);
    v.render();
    v.view.render = pic(129, 64); // a pixel of rounding is allowed
    v.render();
    v.view.render = pic(256, 64);
    assert.throws(() => v.render(), /scene\/wall\.png: 256x64 for a \d+x\d+ picture/);
    v.checkShapes = false;
    v.render();
  });
  test("the shape rule holds for long thin pictures too: the picture is fitted first, then the box's spare measured", async () => {
    const v = await mountRaid();
    // scene/mountains.png is 512x160 (drawn 256x80). A box 259x80 has its height within a pixel of the
    // width's (80.9), which an either-side test lets through, but the picture fills only 256 of the 259px
    const box = (w, h) => () => div().child(image("mods/idle-rpg/art/scene/mountains.png").w(w).h(h));
    v.view.render = box(256, 80);
    v.render();
    v.view.render = box(257, 80);
    v.render();
    v.view.render = box(259, 80);
    assert.throws(() => v.render(), /mountains\.png: 259x80/);
    v.view.render = box(256, 83);
    assert.throws(() => v.render(), /mountains\.png: 256x83/);
  });
  test("an image with no numeric w or h throws", async () => {
    const v = await mountRaid();
    v.view.render = () => div().child(image("mods/idle-rpg/art/scene/wall.png").w(128));
    assert.throws(() => v.render(), /no numeric w and h/);
  });
  test("drawnIn: a picture sits at its own shape, as large as fits, centred", () => {
    const p = pngSize("scene/wall.png");
    const d = drawnIn("scene/wall.png", 4 * p.w, p.h);
    assert.deepEqual(d, { x: 1.5 * p.w, y: 0, w: p.w, h: p.h });
  });
  test("pixel text reads back, spaces and all", () => {
    const run = div();
    // "A B" in the lettering: A at 0, a space (1 wide), B at 6 art px
    for (const [ch, x] of [["a", 0], ["b", 6]]) run.child(div().absolute().left(x * 2).top(0).child(image(`mods/idle-rpg/art/lettering/white/${ch}.png`).w(10).h(14)));
    assert.equal(readRun(run).text, "A B");
  });
});

describe("the clock", () => {
  test("timers run in order of when they are due, then of when they were set", () => {
    const t = new Timers(0);
    const order = [];
    t.add(100, () => order.push("b"), false);
    t.add(50, () => order.push("a"), false);
    t.add(100, () => order.push("c"), false);
    for (let x; (x = t.next(1000)); ) x.fn();
    assert.deepEqual(order, ["a", "b", "c"]);
  });
  test("a repeating timer cancelled inside its own callback stops", async () => {
    const v = await mountRaid({ status: "idle" });
    let calls = 0;
    const task = v.timers.add(100, () => {
      calls += 1;
      task.cancel();
    }, true);
    v.advance(1000);
    assert.equal(calls, 1);
    assert.equal(task.is_done(), true);
  });
  test("cx.notify() during a render throws, as gpui-kit's does", async () => {
    const v = await mountRaid();
    v.view.render = (cx) => {
      cx.notify();
      return div();
    };
    assert.throws(() => v.render(), /during render/);
  });
  test("a setShared during a render renders again (the app re-renders every mod), and a render that always saves is a loop", async () => {
    const v = await mountRaid();
    const herdr = await import("./harness/stubs/herdr.mjs");
    let once = true;
    const render = v.view.render.bind(v.view);
    v.view.render = (cx) => {
      if (once) herdr.setShared("x", 1);
      once = false;
      return render(cx);
    };
    const n = v.renders;
    v.setAgents([...v.world.agents]);
    assert.equal(v.renders, n + 2);
    v.view.render = () => (herdr.setShared("x", 2), div());
    assert.throws(() => v.setAgents([]), /render loop/);
  });
  test("shared values come back as JSON makes them", async () => {
    const herdr = await import("./harness/stubs/herdr.mjs");
    herdr.setShared("k", { a: NaN, b: Infinity, c: undefined, d: [undefined], e: new Date(0) });
    assert.deepEqual(herdr.shared("k"), { a: null, b: null, d: [null], e: "1970-01-01T00:00:00.000Z" });
  });
  test("two views keep their own clock and random source, whichever was mounted last", async () => {
    const a = await mountRaid({}, { seed: 1 });
    const b = await mountRaid({}, { seed: 2 });
    b.advance(5000);
    a.advance(1000);
    assert.equal(Date.now(), a.now);
    assert.equal(b.now - a.now, 4000);
  });
  test("the seeded random source is the same for the same seed", () => {
    assert.deepEqual([1, 2, 3].map(seeded(5)), [1, 2, 3].map(seeded(5)));
  });
  test("a view's Date.now is the fake clock's", async () => {
    const v = await mountRaid();
    const t = Date.now();
    v.advance(1234);
    assert.equal(Date.now(), t + 1234);
  });
});
