// The view harness: mounts the real, unmodified mods/idle-rpg/main.js under
// Node with stand-ins for the app's modules (see register.mjs), a fake clock
// and a seeded Math.random, and drives it like Herdr does:
//
//   const v = await mountView({ agents: [agent("a1", "working")], width: 1280 });
//   v.advance(3000);                       // timers run; a notify() renders
//   v.text("idle-rpg-stage")               // ["STAGE 1", "9:58"]
//   v.click("idle-rpg-gold");              // mouse down, up and click by id
//   assert.equal(v.saves.length, 1);       // setShared calls
//
// See tests/README.md for the whole surface.

import "./register.mjs";
import { BASE_TIME, CYCLE_MS, Timers, seeded, timeAt } from "./clock.mjs";
import { El, all, boxOf, byId, idsLike, images, pathTo, readRun, runs, texts, walk } from "./elements.mjs";
import { pathToFileURL } from "node:url";
import { ART_PREFIX, MOD, resetWorld, world } from "./world.mjs";
import { pngSize } from "./png.mjs";

// Herdr draws a picture at its own proportions inside the box it is given:
// a box of another shape leaves part of itself empty (the picture is never
// stretched). So a render that gives a picture a box of a different shape
// (more than a pixel of rounding off) is an error, like a missing picture.
// A picture that sits letterboxed goes here, with why:
// - icons/hat.png (72x64) is drawn in an 18x18 box on the shop's Hats tab, so
//   at 18x16; a known finding, tested as a todo in view/panels.test.mjs.
export const LETTERBOXED = new Set(["icons/hat.png"]);

// The images in `tree` whose box is not their picture's shape: ["path: w x h for a p x q picture"].
export function misshapen(tree, letterboxed = LETTERBOXED) {
  const out = [];
  for (const el of all(tree, (n) => n.type === "image")) {
    const { w, h } = el.style;
    const file = el.src.slice(ART_PREFIX.length);
    if (typeof w !== "number" || typeof h !== "number") throw new Error(`${file}: an image with no numeric w and h (${w} x ${h}); main.js always sizes its pictures`);
    if (letterboxed.has(file)) continue;
    const p = pngSize(file);
    // the picture as drawn: its own shape, as large as fits; what the box has spare is empty
    const k = Math.min(w / p.w, h / p.h);
    if (Math.max(w - k * p.w, h - k * p.h) > 1) out.push(`${file}: ${w}x${h} for a ${p.w}x${p.h} picture`);
  }
  return out;
}

export { BASE_TIME, CYCLE_MS, timeAt };
export { agent, agents, raid, savedState } from "./fixtures.mjs";
import { raid } from "./fixtures.mjs";

const MAIN = pathToFileURL(`${MOD}/main.js`).href;
let RaidParty = null;
const realNow = Date.now.bind(Date);
const realRandom = Math.random;

// The key main.js keeps its state under.
export const STATE = "idle-rpg.state";

// A context as gpui-kit hands one to init, a handler or a timer.
class Cx {
  constructor(h) {
    this.h = h;
    this.stopped = false;
    this.timer = {
      every: (ms, fn) => h.timers.add(ms, fn, true),
      after: (ms, fn) => h.timers.add(ms, fn, false),
    };
  }
  notify() {
    // gpui-kit.d.ts (Context.notify): "Calling it during `render` throws, because notifying a view while rendering is a loop."
    if (this.rendering) throw new Error("cx.notify() during render (gpui-kit throws: a loop)");
    this.h.notified += 1;
    this.h.dirty = true;
  }
  stop_propagation() {
    this.stopped = true;
  }
  propagate() {
    this.stopped = false;
  }
  // gpui-kit.d.ts (Context.spawn): "Calls `body(cx)` and adopts the promise it returns". Here the
  // body starts on the next microtask with a context of its own (an AsyncContext, valid across
  // await); a test lets it run with `await v.settle()`. What it notifies renders on the next flush.
  // A rejection is kept in `h.taskErrors` (the app reports it).
  spawn(body) {
    const h = this.h;
    const task = { done: false, cancel() {}, is_done: () => task.done };
    const p = Promise.resolve()
      .then(() => body(new Cx(h)))
      .catch((e) => h.taskErrors.push(e))
      .finally(() => {
        task.done = true;
        h.tasks.delete(p);
      });
    h.tasks.add(p);
    return task;
  }
  // gpui-kit.d.ts (Context.open_url): takes an absolute http/https URL with a host and refuses
  // everything else. Recorded in `world.opened`.
  open_url(url) {
    if (!/^https?:\/\/[^/\s]+/i.test(String(url))) throw new Error(`open_url refuses ${url}`);
    world.opened.push(url);
  }
}

/**
 * Mounts a fresh RaidParty view and renders it at its size.
 * @param {object} o
 * @param {object} [o.saved] the shared state to load (under idle-rpg.state, or `key`)
 * @param {string} [o.key] the shared key it is under (main.js reads older names too)
 * @param {object[]} [o.agents] live agents (see agent() in fixtures.mjs)
 * @param {number} [o.width=1280] [o.height=360] the view's size, reported after the first render
 * @param {number} [o.inset] the layout prop: the sign's left edge
 * @param {number} [o.seed=1] Math.random's seed
 * @param {number} [o.phase=0.25] the time of day the clock starts at (0.25 noon, 0.75 midnight)
 * @param {number} [o.at] a time (ms) whose day-and-night cycle the clock starts in (see timeAt): the
 *   date, which the town's seasonal decorations follow; by default mid-January 2027, out of season
 */
export async function mountView(o = {}) {
  RaidParty ??= (await import(MAIN)).default;
  const h = new Handle(o);
  h.mount();
  return h;
}

// mountView({ ...raid(options), ...view options }): a raid party, mounted (see raid() in fixtures.mjs).
export async function mountRaid(options = {}, view = {}) {
  const { saved, agents } = raid({ now: timeAt(view.phase ?? 0.25, view.at), ...options });
  return mountView({ saved, agents, ...view });
}

export class Handle {
  constructor({ saved, key = STATE, agents = [], spaces = [], panes = [], host = {}, width = 1280, height = 360, inset, seed = 1, phase = 0.25, at, checkShapes = true, origin = { x: 0, y: 0 } } = {}) {
    this.size = { width, height };
    // where the view sits in the window: pointer events carry window positions
    // and bounds, so a test's view-relative points are moved by it
    this.origin = origin;
    this.timers = new Timers(timeAt(phase, at));
    this.random = seeded(seed);
    this.renders = 0; // render() calls
    // each render: { at, clock, causes: the timers run since the last one, as { every, ms, name } }
    // (the attack clock's timer is main.js's `next`, set by wake: name "next")
    this.renderLog = [];
    this.causes = [];
    // see misshapen(). Turning it off is for the harness's own tests only; a
    // picture main.js really letterboxes goes in LETTERBOXED, with why
    this.checkShapes = checkShapes;
    this.notified = 0; // cx.notify() calls
    this.tasks = new Set(); // cx.spawn bodies still running (see settle)
    this.taskErrors = []; // what they rejected with
    this.dirty = false;
    this.tree = null;
    resetWorld({ agents, spaces, panes, host, props: inset === undefined ? {} : { inset }, shared: saved === undefined ? {} : { [key]: saved } });
    this.install();
  }

  // Date.now and Math.random for this view: put in place on mount and again
  // whenever this handle renders, advances or takes input, so several views
  // in one test each run on their own clock and random source.
  install() {
    const timers = this.timers;
    Date.now = () => timers.now;
    Math.random = this.random;
    world.now = () => timers.now;
  }

  mount() {
    this.view = new RaidParty();
    this.view.init(world.props, new Cx(this));
    this.render();
    // the app reports the root's size after the first layout
    this.dispatch(this.tree, "size_change", { ...this.size });
    this.flush();
  }

  get now() {
    return this.timers.now;
  }
  get saves() {
    return world.saves;
  }
  // every run(name, args) the view called (commands it asked Herdr for)
  get commands() {
    return world.runs;
  }
  get world() {
    return world;
  }
  // every URL the view handed to the browser (cx.open_url)
  get opened() {
    return world.opened;
  }
  // The state last saved (setShared), or undefined.
  get stored() {
    return world.shared.get(STATE);
  }

  render() {
    this.install();
    world.missing.length = 0;
    this.dirty = false;
    world.dirty = false;
    const cx = new Cx(this);
    cx.rendering = true;
    world.rendering = true;
    try {
      this.tree = this.view.render(cx);
    } finally {
      world.rendering = false;
    }
    if (!(this.tree instanceof El)) throw new Error("render() did not return an element");
    this.renders += 1;
    this.renderLog.push({ at: this.timers.now, clock: this.view.clock, causes: this.causes });
    this.causes = [];
    // a setShared during this render left world.dirty set: the app renders every mod again (see flush)
    if (world.missing.length) throw new Error(`render asked for pictures that are not in art/:\n${[...new Set(world.missing)].join("\n")}`);
    if (this.checkShapes) {
      const bad = misshapen(this.tree);
      if (bad.length) throw new Error(`render gave pictures a box of another shape (Herdr would draw them smaller, not stretched):\n${[...new Set(bad)].join("\n")}`);
    }
    return this.tree;
  }

  // Renders if anything asked for it (a notify, a save, live data changing).
  flush() {
    // renders until nothing asks for another; a render that saves asks for one more (the app re-renders every mod)
    for (let n = 0; this.dirty || world.dirty; n++) {
      if (n >= 5) throw new Error("render loop: each render asked for another");
      this.render();
    }
  }

  /**
   * Moves the clock on by `ms`, running every timer due on the way at its own
   * time; whatever they notify is rendered once per instant (as a frame would).
   */
  advance(ms) {
    this.install();
    const until = this.timers.now + ms;
    for (;;) {
      const t = this.timers.next(until);
      if (!t) break;
      this.causes.push({ every: t.every, ms: t.ms, name: t.fn.name });
      this.timers.run(t, new Cx(this));
      // a frame once nothing more is due at this instant
      if (!this.timers.queue.some((q) => q.live && q.at === this.timers.now)) this.flush();
    }
    this.timers.now = until;
    this.flush();
    return this;
  }

  // Lets what cx.spawn started run (the board's refresh: its fake host calls answer on later
  // turns of Node's event loop), then renders what it notified. Tasks waiting on something that
  // never answers, or on a timer not yet due (the fake clock moves only with advance), are left
  // waiting: it gives up on them after `turns` turns of the event loop.
  async settle(turns = 2000) {
    for (let i = 0; i < turns && this.tasks.size; i++) await new Promise((r) => setImmediate(r));
    this.install();
    this.flush();
    return this;
  }

  // Advances in steps of `step` until `pred(handle)` is true, at most `max` ms. Returns the ms it took.
  until(pred, max = 600000, step = 250) {
    const start = this.now;
    while (!pred(this)) {
      if (this.now - start >= max) throw new Error(`until(): not true within ${max}ms`);
      this.advance(step);
    }
    return this.now - start;
  }

  // What is set on cx.timer now: [{ in, every }].
  pendingTimers() {
    return this.timers.pending();
  }

  // ---- live data -----------------------------------------------------------
  setAgents(list) {
    this.install();
    world.agents = list;
    world.dirty = true;
    this.flush();
  }
  setProps(p) {
    this.install();
    world.props = p;
    world.dirty = true;
    this.flush();
  }
  resize(width, height = this.size.height) {
    this.install();
    this.size = { width, height };
    this.dispatch(this.tree, "size_change", { width, height });
    this.flush();
  }
  close() {
    this.install();
    this.view.close(new Cx(this));
    this.flush();
  }

  // ---- finding things --------------------------------------------------------
  find(id) {
    return byId(this.tree, id);
  }
  get(id) {
    const el = this.find(id);
    if (!el) throw new Error(`no element #${id} (ids like it: ${idsLike(this.tree, id.split("-").slice(0, 3).join("-")).slice(0, 12).join(", ") || "none"})`);
    return el;
  }
  has(id) {
    return Boolean(this.find(id));
  }
  all(pred) {
    return all(this.tree, pred);
  }
  ids(prefix = "") {
    return idsLike(this.tree, prefix);
  }
  // The pictures under `id` (or the whole view), in drawing order.
  images(id) {
    return images(id ? this.get(id) : this.tree);
  }
  // The text under `id` (or the whole view): pixel text decoded, plain text as is.
  text(id) {
    return texts(id ? this.get(id) : this.tree);
  }
  // The runs of pixel text under `id`, with their colours: [{ text, colours, face, scale }].
  runs(id) {
    return runs(id ? this.get(id) : this.tree);
  }
  // Where `id` is drawn: { x, y, w, h } in px from the view's top left.
  box(id) {
    return boxOf(typeof id === "string" ? this.get(id) : id, this.size);
  }

  // ---- input -------------------------------------------------------------------
  // Runs `name` handlers from `el` up through its ancestors (bubbling) until
  // one stops propagation. `ev` is the event; each handler gets its element's bounds.
  // Positions are given in view px and handed to handlers in window px (+ origin).
  dispatch(el, name, ev, { bubble = true } = {}) {
    this.install();
    const o = this.origin;
    const position = ev?.position ? { x: ev.position.x + o.x, y: ev.position.y + o.y } : undefined;
    const chain = pathTo(el).reverse();
    let ran = 0;
    for (const n of bubble ? chain : chain.slice(0, 1)) {
      const fn = n.handlers[name];
      if (!fn) continue;
      const cx = new Cx(this);
      const b = boxOf(n, this.size);
      const bounds = { x: b.x + o.x, y: b.y + o.y, width: b.w ?? this.size.width, height: b.h ?? this.size.height };
      if (name === "size_change" || name === "hover") fn(ev, cx);
      else fn({ ...ev, position, bounds, local_position: position ? { x: position.x - bounds.x, y: position.y - bounds.y } : undefined }, cx);
      ran += 1;
      if (cx.stopped) break;
    }
    return ran;
  }

  pointOf(el) {
    const b = boxOf(el, this.size);
    return { x: b.x + Math.min(2, (b.w ?? 4) / 2), y: b.y + Math.min(2, (b.h ?? 4) / 2) };
  }

  // Presses the left button on `id` (or a point, { x, y } in view px, which lands on the scene's root).
  press(target) {
    const { el, position } = this.target(target);
    this.lastPress = position;
    this.dispatch(el, "mouse_down:left", { button: "left", click_count: 1, position, modifiers: {} });
    this.flush();
  }
  // Releases it over `id` or a point (by default where it was pressed).
  release(target) {
    const { el, position } = target === undefined ? { el: this.tree, position: this.lastPress } : this.target(target);
    this.dispatch(el, "mouse_up:left", { button: "left", click_count: 1, position, modifiers: {} });
    this.flush();
  }
  // Moves the pointer to a point, { x, y } in view px (a drag, if pressed).
  move(position) {
    this.dispatch(this.tree, "mouse_move", { position, modifiers: {} });
    this.flush();
  }
  // A whole click on `id`: down, up, then its on_click (and its ancestors', until stopped).
  click(target) {
    const { position } = this.target(target);
    this.press(target);
    // the press may have re-rendered: find it again
    const now = typeof target === "string" ? this.find(target) : this.tree;
    this.dispatch(now ?? this.tree, "mouse_up:left", { button: "left", click_count: 1, position, modifiers: {} });
    if (now && typeof target === "string") this.dispatch(now, "click", { click_count: 1, modifiers: {} });
    this.flush();
  }
  // A click on the floor at x, y in floor coordinates (the root's handlers: you walk there).
  clickFloor(x, y) {
    this.click({ x, y: y + (this.size.height - 152) });
  }
  // A press where several elements overlap: as GPUI delivers it, to each of
  // `ids` in turn (the top-most, drawn last, first), each its own handler
  // only, until one stops propagation, then to the scene's root; at the first's point.
  pressStack(ids) {
    const position = this.pointOf(this.get(ids[0]));
    const ev = { button: "left", click_count: 1, position, modifiers: {} };
    this.lastPress = position;
    let stopped = false;
    for (const id of ids) {
      const el = this.get(id);
      const cx = new Cx(this);
      const fn = el.handlers["mouse_down:left"];
      if (!fn) continue;
      fn({ ...ev, position: { x: position.x + this.origin.x, y: position.y + this.origin.y } }, cx);
      if ((stopped = cx.stopped)) break;
    }
    if (!stopped) this.dispatch(this.tree, "mouse_down:left", ev, { bubble: false });
    this.flush();
  }
  // The pointer arriving (`on` true) or leaving where several overlap: each of `ids` hears it in turn.
  hoverStack(ids, on = true) {
    for (const id of ids) this.dispatch(this.get(id), "hover", on, { bubble: false });
    this.flush();
  }
  // The pointer enters (`on` true) or leaves `id`.
  hover(id, on = true) {
    this.dispatch(this.get(id), "hover", on, { bubble: false });
    this.flush();
  }
  target(t) {
    if (typeof t === "string") {
      const el = this.get(t);
      return { el, position: this.pointOf(el) };
    }
    return { el: this.tree, position: { x: t.x, y: t.y } };
  }
}

// Puts the real clock and random back (for code that runs after a test file's views).
export function restoreGlobals() {
  Date.now = realNow;
  Math.random = realRandom;
}

export { all, boxOf, byId, images, readRun, runs, texts, walk };
