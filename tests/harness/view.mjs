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
import { CYCLE_MS, Timers, seeded, timeAt } from "./clock.mjs";
import { El, all, boxOf, byId, idsLike, images, pathTo, readRun, runs, texts, walk } from "./elements.mjs";
import { pathToFileURL } from "node:url";
import { MOD, resetWorld, world } from "./world.mjs";

export { CYCLE_MS, timeAt };
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
    this.h.notified += 1;
    this.h.dirty = true;
  }
  stop_propagation() {
    this.stopped = true;
  }
  propagate() {
    this.stopped = false;
  }
  spawn() {
    throw new Error("cx.spawn is not stubbed in the harness");
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
 */
export async function mountView(o = {}) {
  RaidParty ??= (await import(MAIN)).default;
  const h = new Handle(o);
  h.mount();
  return h;
}

// mountView({ ...raid(options), ...view options }): a raid party, mounted (see raid() in fixtures.mjs).
export async function mountRaid(options = {}, view = {}) {
  const { saved, agents } = raid({ now: timeAt(view.phase ?? 0.25), ...options });
  return mountView({ saved, agents, ...view });
}

export class Handle {
  constructor({ saved, key = STATE, agents = [], spaces = [], width = 1280, height = 360, inset, seed = 1, phase = 0.25 } = {}) {
    this.size = { width, height };
    this.timers = new Timers(timeAt(phase));
    this.random = seeded(seed);
    this.renders = 0; // render() calls
    // each render: { at, clock, causes: the timers run since the last one, as { every, ms, name } }
    // (the attack clock's timer is main.js's `next`, set by wake: name "next")
    this.renderLog = [];
    this.causes = [];
    this.notified = 0; // cx.notify() calls
    this.dirty = false;
    this.tree = null;
    resetWorld({ agents, spaces, props: inset === undefined ? {} : { inset }, shared: saved === undefined ? {} : { [key]: saved } });
    this.install();
  }

  // Date.now and Math.random for this view (the last one mounted owns them).
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
  // The state last saved (setShared), or undefined.
  get stored() {
    return world.shared.get(STATE);
  }

  render() {
    world.missing.length = 0;
    this.tree = this.view.render(new Cx(this));
    if (!(this.tree instanceof El)) throw new Error("render() did not return an element");
    this.renders += 1;
    this.renderLog.push({ at: this.timers.now, clock: this.view.clock, causes: this.causes });
    this.causes = [];
    this.dirty = false;
    world.dirty = false;
    if (world.missing.length) throw new Error(`render asked for pictures that are not in art/:\n${[...new Set(world.missing)].join("\n")}`);
    return this.tree;
  }

  // Renders if anything asked for it (a notify, a save, live data changing).
  flush() {
    if (this.dirty || world.dirty) this.render();
  }

  /**
   * Moves the clock on by `ms`, running every timer due on the way at its own
   * time; whatever they notify is rendered once per instant (as a frame would).
   */
  advance(ms) {
    const until = this.timers.now + ms;
    for (;;) {
      const t = this.timers.next(until);
      if (!t) break;
      this.timers.now = t.at;
      t.live = false;
      this.causes.push({ every: t.every, ms: t.ms, name: t.fn.name });
      t.fn(new Cx(this));
      if (t.every !== null) {
        t.live = true;
        t.at = this.timers.now + t.every;
        t.seq = this.timers.seq += 1;
        this.timers.queue.push(t);
      }
      // a frame once nothing more is due at this instant
      if (!this.timers.queue.some((q) => q.live && q.at === this.timers.now)) this.flush();
    }
    this.timers.now = until;
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
    world.agents = list;
    world.dirty = true;
    this.flush();
  }
  setProps(p) {
    world.props = p;
    world.dirty = true;
    this.flush();
  }
  resize(width, height = this.size.height) {
    this.size = { width, height };
    this.dispatch(this.tree, "size_change", { width, height });
    this.flush();
  }
  close() {
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
  dispatch(el, name, ev, { bubble = true } = {}) {
    const chain = pathTo(el).reverse();
    let ran = 0;
    for (const n of bubble ? chain : chain.slice(0, 1)) {
      const fn = n.handlers[name];
      if (!fn) continue;
      const cx = new Cx(this);
      const b = boxOf(n, this.size);
      const bounds = { x: b.x, y: b.y, width: b.w ?? this.size.width, height: b.h ?? this.size.height };
      if (name === "size_change" || name === "hover") fn(ev, cx);
      else fn({ ...ev, bounds, local_position: ev.position ? { x: ev.position.x - b.x, y: ev.position.y - b.y } : undefined }, cx);
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
