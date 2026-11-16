// The fake Herdr the stand-in modules read from and write to: one world at a
// time (tests in a file run one after another; each mountView starts a fresh
// one). Tests reach it through the view handle (view.mjs), not directly.

import { existsSync, readdirSync, statSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join, relative } from "node:path";

export const ROOT = fileURLToPath(new URL("../../", import.meta.url)); // the repo root
export const MOD = join(ROOT, "mods/idle-rpg");
export const ART = join(MOD, "art");
// image() paths are relative to Herdr's home: "mods/idle-rpg/art/scene/wall.png"
export const ART_PREFIX = "mods/idle-rpg/art/";

// Every file under art/, as its path inside art/ ("scene/wall.png").
export function artFiles() {
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(ART, p).split("\\").join("/"));
    }
  };
  walk(ART);
  return out.sort();
}

const ART_SET = new Set(artFiles());
// Whether image(path) would find a picture: the path is under the mod's art/ and the file is there.
export const artExists = (src) => typeof src === "string" && src.startsWith(ART_PREFIX) && ART_SET.has(src.slice(ART_PREFIX.length));

export const world = {
  agents: [],
  spaces: [],
  props: {},
  shared: new Map(),
  saves: [], // every setShared call: { key, value (a deep copy), at }
  runs: [], // every run(name, args) call
  images: new Set(), // every image path any render has asked for since the world started
  missing: [], // image paths asked for that are not on disk
  dirty: false, // something changed that re-renders the view (setShared, live data)
  rendering: false, // inside the view's render()
  savedWhileRendering: 0, // setShared calls made from inside render() (the app then renders every mod again)
  now: () => Date.now(),
};

export function resetWorld({ agents = [], spaces = [], props = {}, shared = {} } = {}) {
  world.agents = agents;
  world.spaces = spaces;
  world.props = props;
  world.shared = new Map(Object.entries(shared));
  world.saves = [];
  world.runs = [];
  world.images = new Set();
  world.missing = [];
  world.dirty = false;
  world.rendering = false;
  world.savedWhileRendering = 0;
}

// A path asked of image(): recorded, and checked against the files on disk.
export function recordImage(src) {
  world.images.add(src);
  if (!artExists(src)) world.missing.push(src);
}

export const exists = existsSync;
