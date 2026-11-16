// Fake time for the view: Date.now() and Math.random() are replaced while a
// view is mounted (see view.mjs), and cx.timer's timers run only when a test
// advances the clock. Nothing depends on the wall clock, so every run is the same.

// A seeded random source (mulberry32): numbers from 0 up to 1, the same for the same seed.
export function seeded(seed) {
  let a = seed >>> 0 || 1;
  return function random() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// The day-and-night cycle main.js uses (CYCLE_MS): the clock starts at a
// whole cycle, plus `phase` of one (0.25 noon, 0.75 midnight).
export const CYCLE_MS = 20 * 60 * 1000;
export const timeAt = (phase = 0.25) => 1_800_000_000_000 - (1_800_000_000_000 % CYCLE_MS) + Math.round(phase * CYCLE_MS);

// The timers: { at, seq, every, fn, live }. Ordered by when they are due,
// then by when they were set, so two due together run in the order set (a
// repeating one is set again once its call returns, as gpui's
// `every` measures from the end of a call).
export class Timers {
  constructor(now) {
    this.now = now;
    this.queue = [];
    this.seq = 0;
  }

  add(ms, fn, every) {
    if (typeof fn !== "function") throw new TypeError("cx.timer handler is not a function");
    if (!(typeof ms === "number" && Number.isFinite(ms) && ms >= 0)) throw new TypeError(`cx.timer delay ${ms} is not a duration`);
    const t = { at: this.now + ms, seq: (this.seq += 1), every: every ? ms : null, ms, fn, live: true, cancelled: false };
    this.queue.push(t);
    return {
      // also from inside its own callback: a repeating timer is then not set again
      cancel: () => {
        t.live = false;
        t.cancelled = true;
      },
      is_done: () => !t.live,
    };
  }

  // The next live timer due by `until`, taken off the queue, or null.
  next(until) {
    let best = -1;
    for (let i = 0; i < this.queue.length; i++) {
      const t = this.queue[i];
      if (!t.live) continue;
      if (t.at > until) continue;
      if (best < 0 || t.at < this.queue[best].at || (t.at === this.queue[best].at && t.seq < this.queue[best].seq)) best = i;
    }
    if (best < 0) {
      this.queue = this.queue.filter((t) => t.live);
      return null;
    }
    const [t] = this.queue.splice(best, 1);
    return t;
  }

  // Runs timer `t` (taken off the queue by next()) at its time, and sets a
  // repeating one again once its call returns, unless it was cancelled.
  run(t, cx) {
    this.now = t.at;
    t.live = false;
    t.fn(cx);
    if (t.every !== null && !t.cancelled) {
      t.live = true;
      t.at = this.now + t.every;
      t.seq = this.seq += 1;
      this.queue.push(t);
    }
  }

  // What is set now, for tests: [{ in: ms from now, every }].
  pending() {
    return this.queue.filter((t) => t.live).map((t) => ({ in: t.at - this.now, every: t.every }));
  }
}
