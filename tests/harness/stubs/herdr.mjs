// Stand-in for the `herdr` module (~/.config/herdr-app/herdr.d.ts): the live
// data and shared state come from the harness's world (../world.mjs), and
// what the mod asks of Herdr is recorded there. Anything main.js does not use
// throws, so a new call shows up as a test failure to stub it here.
import { world } from "../world.mjs";

const copy = (v) => (v === undefined ? undefined : structuredClone(v));

export const agents = () => world.agents;
export const spaces = () => world.spaces;
export const props = () => world.props;
// Shared values are kept as copies, as the app stores them (JSON on disk):
// what the mod saved is never the object it goes on changing.
export const shared = (key) => copy(world.shared.get(key));
export function setShared(key, value) {
  const v = copy(value);
  world.shared.set(key, v);
  world.saves.push({ key, value: v, at: world.now() });
  world.dirty = true; // every mod re-renders
  return null;
}
export function run(name, args) {
  world.runs.push({ name, args });
  return null;
}
export const theme = () => ({});
export const settings = () => ({});

const unstubbed = (name) =>
  function () {
    throw new Error(`herdr.${name}() is not stubbed in tests/harness/stubs/herdr.mjs`);
  };
export const exec = unstubbed("exec");
export const hc = unstubbed("hc");
export const home = unstubbed("home");
export const appHome = unstubbed("appHome");
export const readTextFile = unstubbed("readTextFile");
export const writeTextFile = unstubbed("writeTextFile");
export const knownAgents = unstubbed("knownAgents");
export const pickFolder = unstubbed("pickFolder");
export const playSound = unstubbed("playSound");
export const machines = unstubbed("machines");
export const panes = unstubbed("panes");
export const setAgentOrder = unstubbed("setAgentOrder");
export const terminals = unstubbed("terminals");
export const focused = unstubbed("focused");
export const layout = unstubbed("layout");
export const layouts = unstubbed("layouts");
export const commands = unstubbed("commands");
export const window = unstubbed("window");
export const placement = unstubbed("placement");
export const themes = unstubbed("themes");
export const fonts = unstubbed("fonts");
export const updates = unstubbed("updates");
export const keys = unstubbed("keys");
export const openOverlay = unstubbed("openOverlay");
export const closeOverlay = unstubbed("closeOverlay");
export const notify = unstubbed("notify");
export const nextCommand = unstubbed("nextCommand");
export const watchFolder = unstubbed("watchFolder");
