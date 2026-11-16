// The stand-in for gpui-kit's element builders: div(), image(), h_flex(),
// v_flex() return an El that records every call into a tree the tests can
// query: id, style values (left, top, w, h, opacity, bg, ...), children (text
// as Text nodes), the image's path, tooltips, handlers, hover and active
// styles, native loops and transitions.
//
// Only methods gpui-kit has are accepted (METHODS, from gpui-kit.d.ts): a
// typo in main.js fails here as it would in the app. A method main.js starts
// using is added to METHODS after checking it is in ~/.config/herdr-app/gpui-kit.d.ts.
// As in gpui-kit, an element is consumed by the parent it is given to: giving
// it to a second one throws.

import { GLYPHS, LETTERS, glyphArt, glyphWidth, letterArt, letterWidth } from "../../mods/idle-rpg/rules.js";
import { recordImage } from "./world.mjs";

// The element methods main.js uses, each checked against gpui-kit.d.ts (the
// app's own type file). Style setters are recorded as style[name] = value.
export const METHODS = new Set(
  (
    "absolute active bg border border_b border_color border_l border_r border_t bottom child children cursor_pointer flex flex_1 flex_none " +
    "font_semibold gap h hover id items_center items_start justify_between justify_center left line_height loop max_w max_w_full min_w " +
    "on_click on_hover on_mouse_down on_mouse_move on_mouse_up on_size_change opacity overflow_hidden p pt px py relative right rounded " +
    "size_full text_center text_color text_size tooltip top transition truncate w when " +
    // not used by main.js today, but gpui-kit has them (common next steps)
    "pb pl pr m mt mb ml mr mx my min_h max_h size text_left text_right font_bold italic underline shadow_sm shadow_md shadow_lg cursor_default justify_start justify_end items_end flex_col flex_row flex_wrap"
  ).split(/\s+/),
);

let serial = 0;

export class Text {
  constructor(text) {
    this.type = "text";
    this.text = String(text);
    this.parent = null;
  }
}

export class El {
  constructor(type, src = null) {
    this.type = type; // "div" | "h_flex" | "v_flex" | "image"
    this.src = src;
    this.key = null; // its id()
    this.style = Object.create(null);
    this.kids = [];
    this.handlers = Object.create(null); // click, hover, mouse_move, size_change, mouse_down:left, mouse_up:left
    this.hoverStyle = null;
    this.activeStyle = null;
    this.loops = Object.create(null);
    this.transitions = Object.create(null);
    this.tip = null;
    this.parent = null;
    this.n = (serial += 1);
    if (type === "image") recordImage(src);
  }

  id(v) {
    this.key = String(v);
    return this;
  }

  child(c) {
    if (c === undefined || c === null) throw new TypeError(`child(${c}) on ${this.describe()}: gpui-kit takes an element, a string, a number or a boolean`);
    if (typeof c === "boolean") return this;
    const node = typeof c === "string" || typeof c === "number" ? new Text(c) : c;
    if (!(node instanceof El) && !(node instanceof Text)) throw new TypeError(`child() on ${this.describe()} was given ${Object.prototype.toString.call(c)}`);
    if (node.parent) throw new Error(`${node.describe?.() ?? "a text"} was given to two parents (gpui-kit consumes a child)`);
    node.parent = this;
    this.kids.push(node);
    return this;
  }

  children(list) {
    if (list == null || typeof list[Symbol.iterator] !== "function") throw new TypeError(`children() on ${this.describe()} needs an iterable`);
    for (const c of list) this.child(c);
    return this;
  }

  when(cond, branch) {
    if (!cond) return this;
    const out = branch(this);
    if (out !== this) throw new Error(`when() on ${this.describe()}: the branch must return the element it was given`);
    return this;
  }

  hover(declare) {
    const s = new El("style");
    declare(s);
    this.hoverStyle = s.style;
    return this;
  }

  active(declare) {
    const s = new El("style");
    declare(s);
    this.activeStyle = s.style;
    return this;
  }

  tooltip(text) {
    if (typeof text !== "string") throw new TypeError(`tooltip() on ${this.describe()} needs a string`);
    this.tip = text;
    return this;
  }

  on_click(fn) {
    return this.on("click", fn);
  }
  on_hover(fn) {
    return this.on("hover", fn);
  }
  on_mouse_move(fn) {
    return this.on("mouse_move", fn);
  }
  on_size_change(fn) {
    return this.on("size_change", fn);
  }
  on_mouse_down(button, fn) {
    return this.on(`mouse_down:${button}`, fn);
  }
  on_mouse_up(button, fn) {
    return this.on(`mouse_up:${button}`, fn);
  }
  on(name, fn) {
    if (typeof fn !== "function") throw new TypeError(`${name} handler on ${this.describe()} is not a function`);
    this.handlers[name] = fn;
    return this;
  }

  loop(property, policy) {
    this.loops[property] = policy;
    return this;
  }

  transition(property, policy) {
    this.transitions[property] = policy;
    return this;
  }

  describe() {
    return `${this.type}${this.key ? `#${this.key}` : ""}${this.src ? `(${this.src})` : ""}`;
  }
}

// Every other method gpui-kit has: a style, recorded under its name (no
// argument: true; one: it; more: the list). Anything else throws.
for (const name of METHODS) {
  if (Object.prototype.hasOwnProperty.call(El.prototype, name)) continue;
  El.prototype[name] = function (...args) {
    this.style[name] = args.length === 0 ? true : args.length === 1 ? args[0] : args;
    return this;
  };
}
const unknown = new Proxy(Object.create(null), {
  get(_t, prop) {
    if (typeof prop === "symbol" || prop === "then" || prop === "toJSON" || prop === "inspect") return undefined;
    return function () {
      throw new TypeError(`${this.describe()}.${prop}() is not a gpui-kit element method the harness knows (see METHODS in tests/harness/elements.mjs)`);
    };
  },
});
Object.setPrototypeOf(El.prototype, unknown);

export const div = () => new El("div");
export const h_flex = () => new El("h_flex");
export const v_flex = () => new El("v_flex");
export function image(src) {
  if (typeof src !== "string") throw new TypeError(`image() needs a path, got ${src}`);
  return new El("image", src);
}

// ---- Querying a rendered tree ---------------------------------------------

// Every node under (and including) `root`, depth first, in drawing order.
export function* walk(root) {
  const stack = [root];
  while (stack.length) {
    const n = stack.pop();
    yield n;
    if (n.kids) for (let i = n.kids.length - 1; i >= 0; i--) stack.push(n.kids[i]);
  }
}

export const all = (root, pred) => [...walk(root)].filter((n) => n instanceof El && pred(n));
export const byId = (root, id) => {
  for (const n of walk(root)) if (n instanceof El && n.key === id) return n;
  return null;
};
// Ids starting with `prefix`.
export const idsLike = (root, prefix) => all(root, (n) => n.key?.startsWith(prefix)).map((n) => n.key);
// The image paths under `root`, in drawing order.
export const images = (root) => all(root, (n) => n.type === "image").map((n) => n.src);
// From `root` down to `el`.
export function pathTo(el) {
  const out = [];
  for (let n = el; n; n = n.parent) out.unshift(n);
  return out;
}

// ---- Boxes -----------------------------------------------------------------
// Where an element is drawn, in px from the view's top left: { x, y, w, h }.
// Worked out from absolute positions (left/top/right/bottom with w/h, or
// size_full), which is how the scene places everything; an element in a flex
// row is taken to be at its parent's top left (w or h null if not given).

// An element's own size where it sets one, else that of its only child
// (a box wrapped round one picture takes the picture's size).
function intrinsic(el, key) {
  const v = el.style[key];
  if (typeof v === "number") return v;
  const kids = el.kids.filter((k) => k instanceof El && !k.style.absolute);
  return kids.length === 1 ? intrinsic(kids[0], key) : null;
}

export function boxOf(el, rootSize) {
  const chain = pathTo(el);
  let box = { x: 0, y: 0, w: rootSize.width, h: rootSize.height };
  for (let i = 1; i < chain.length; i++) {
    const s = chain[i].style;
    const w = s.size_full ? box.w : intrinsic(chain[i], "w");
    const h = s.size_full ? box.h : intrinsic(chain[i], "h");
    let x = box.x;
    let y = box.y;
    if (s.absolute) {
      if (typeof s.left === "number") x = box.x + s.left;
      else if (typeof s.right === "number" && w !== null && box.w !== null) x = box.x + box.w - s.right - w;
      if (typeof s.top === "number") y = box.y + s.top;
      else if (typeof s.bottom === "number" && h !== null && box.h !== null) y = box.y + box.h - s.bottom - h;
    } else if (s.relative && (typeof s.left === "number" || typeof s.top === "number")) {
      x += s.left ?? 0;
      y += s.top ?? 0;
    }
    box = { x, y, w, h };
  }
  return box;
}

// ---- Pixel text -------------------------------------------------------------
// main.js writes numbers in the pixel font (pixelText: font/<colour>/<glyph>.png)
// and the HUD's words in the lettering (letterText: lettering/<colour>/<char>.png),
// a picture per character in a row of absolutely placed boxes. These turn
// them back into strings.

// The picture names of both faces, read back from rules.js's own builders
// (so a character added there reads back here with no change).
const NAMES = new Map();
for (const ch of LETTERS) if (letterArt("white", ch)) NAMES.set(`lettering:${letterArt("white", ch).split("/").pop().replace(".png", "")}`, ch);
for (const ch of GLYPHS) NAMES.set(`font:${glyphArt("white", ch).split("/").pop().replace(".png", "")}`, ch);
const GLYPH_SRC = /\/(font|lettering)\/([a-z]+)\/([a-z0-9]+)\.png$/;

// { face, colour, ch } for a glyph's picture, or null.
export function glyphOf(src) {
  const m = GLYPH_SRC.exec(src ?? "");
  if (!m) return null;
  const ch = NAMES.get(`${m[1]}:${m[3]}`);
  return ch === undefined ? null : { face: m[1], colour: m[2], ch };
}

// Whether `el` is one character of a run: a box placed by `left` holding
// one glyph picture.
const isGlyphBox = (el) => el instanceof El && el.style.absolute && el.kids.length === 1 && el.kids[0] instanceof El && el.kids[0].type === "image" && glyphOf(el.kids[0].src);

// Whether `el` is a run of pixel text (pixelText's or letterText's box).
export const isRun = (el) => el instanceof El && el.kids.length > 0 && el.kids.every(isGlyphBox);

// A run's text, and the colours it is in: { text, colours: [...], face, scale }.
// The lettering's spaces have no picture, so they are put back from the gaps.
export function readRun(el) {
  const glyphs = el.kids.map((k) => ({ left: k.style.left, w: k.kids[0].style.w, ...glyphOf(k.kids[0].src) })).sort((a, b) => a.left - b.left);
  const face = glyphs[0].face;
  // art px per screen px: the lettering is 2; the font's scale comes from the first glyph's width
  const widthOf = (ch) => (face === "lettering" ? letterWidth(ch) : glyphWidth(ch));
  const scale = face === "lettering" ? 2 : glyphs[0].w / (widthOf(glyphs[0].ch) + 2);
  let text = "";
  let next = 0; // where the next character would start, in art px
  for (const g of glyphs) {
    const at = Math.round(g.left / scale);
    if (face === "lettering") for (let gap = at - next; gap >= 2; gap -= 2) text += " ";
    text += g.ch;
    next = at + widthOf(g.ch) + 1;
  }
  return { text, colours: [...new Set(glyphs.map((g) => g.colour))], face, scale };
}

// The text under `root`, in drawing order, as a list of strings: each run of
// pixel text decoded, each plain text child as it is. Empty strings are left out.
export function texts(root) {
  const out = [];
  const visit = (n) => {
    if (n instanceof Text) {
      if (n.text) out.push(n.text);
      return;
    }
    if (isRun(n)) {
      out.push(readRun(n).text);
      return;
    }
    for (const k of n.kids) visit(k);
  };
  if (root) visit(root);
  return out;
}

// The runs of pixel text under `root`, decoded: [{ text, colours, face, scale, el }].
export function runs(root) {
  return all(root, isRun).map((el) => ({ ...readRun(el), el }));
}
