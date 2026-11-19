// Things to feed a view: agents as Herdr's agents() returns them, and saved
// state as each version of the mod wrote it (see save() in main.js and its
// history: v1 progress, v2 skills, v3 the shop's colours, v4 hats and
// settings, v5 weapons, v6 stages and Attack training, v7 Health training,
// v8 town decor, v9 the biomes' monsters: kills of thirteen kinds).

import { KINDS } from "../../mods/idle-rpg/rules.js";

let seq = 0;

/**
 * An agent as agents() gives it (herdr.d.ts AgentInfo).
 * @param {string} address its terminal, e.g. "t1"
 * @param {"working"|"blocked"|"done"|"idle"} status
 */
export function agent(address, status = "working", more = {}) {
  seq += 1;
  return {
    address,
    pane: `p-${address}`,
    space: "s1",
    space_name: "repo",
    tab: `tab-${address}`,
    tab_index: 1,
    tab_name: address,
    status,
    app: "claude-code",
    program: { key: "claude", name: "Claude Code", icon: null, tint: false, tile: null, color: null, shell: false, agent: true },
    title: `agent ${address}`,
    seq,
    pinned: false,
    focused: false,
    ...more,
  };
}

// `n` agents t1..tn in `status`, with classes from `classes` in turn (for `sprites`).
export function agents(n, status = "working") {
  return Array.from({ length: n }, (_, i) => agent(`t${i + 1}`, status));
}

const XP = { you: 1200, wizard: 900, healer: 300, warrior: 2500, archer: 40 };

/**
 * Saved state as version `version` of the mod wrote it (0: before versions,
 * under an older key; 10: a later version than this one). `now` is the time
 * agents were last seen; `extra` is merged over the top.
 */
export function savedState(version, { now = Date.now(), sprites = {}, extra = {} } = {}) {
  const base = {
    you: { x: 300, y: 40 },
    spots: { t1: { x: 250, y: 64 } },
    sprites: { you: "wizard", t1: "warrior", ...sprites },
    seen: { t1: now - 1000 },
    battle: true, // the raid shown (every version so far: `view` came in with the board, see loadState)
  };
  if (version === 0) return { ...base, ...extra }; // no version, no progress
  const v = { version, ...base, slain: 42, gold: 120, kills: { slime: 10, ogre: 7, dragon: 3 }, xp: { ...XP } };
  // v1 also saved its monster; it is no longer read
  if (version <= 5) v.monster = { kind: "ogre", hp: 12, maxHp: 400, id: 7 };
  if (version >= 2) v.skills = { wizard: { power: 2, haste: 1, crit: 0 }, warrior: { power: 1, haste: 1, crit: 1 } };
  if (version === 3) v.looks = { wizard: { colour: { owned: ["default", "crimson"], equipped: "crimson" } } };
  if (version >= 4) {
    v.looks = { wizard: { armour: { owned: ["default", "crimson"], equipped: "crimson" }, hat: { equipped: "party" } } };
    v.hats = ["party"];
    v.settings = { damageNumbers: false };
  }
  if (version >= 5) v.looks.warrior = { weapon: { owned: ["default", "axe"], equipped: "axe" } };
  if (version >= 6) {
    Object.assign(v, { stage: 4, best: 6, farming: true });
    v.training = { warrior: { attack: 3, health: 2 }, wizard: { attack: 1 } };
    v.settings = { damageNumbers: false, advance: false };
  }
  if (version >= 8) v.decor = { owned: ["default", "halloween"], equipped: "halloween" };
  if (version >= 9) v.kills = { ...v.kills, goblin: 5, "chief-ogre": 2, demon: 1 };
  if (version >= 10) v.relics = { amulet: 1 }; // something only a later version knows
  return { ...v, ...extra };
}

/**
 * A raid ready to mount: { saved, agents } for mountView. Agents t1..tn are
 * `classes` in turn (all `status`); you are `you`. Every class is at `level`
 * with `attack` and `health` training; `weapons`/`armours`/`hats` put items on
 * ({ <class>: id }, owned too), `decor` the town's ({ owned: [id], equipped: id },
 * none by default); `stage`/`best`/`farming`/`gold`/`settings` as saved;
 * `view` the view shown ("town", "raid" or "board"; saves before the board had `battle` instead),
 * `back` the one the board's chip goes back to (left out unless given: loadState's default, the raid).
 * `statuses` gives agents their own status in turn (t1's first; `status` past its end).
 */
export function raid({ classes = ["warrior", "archer", "wizard"], you = "healer", status = "working", statuses = [], stage = 1, best = stage, farming = false, gold = 0, slain = 0, level = 1, attack = 0, health = 0, skills = {}, weapons = {}, armours = {}, hats = {}, decor = null, settings = {}, view = "raid", back, youAt = { x: 154, y: 16 }, now = Date.now() } = {}) {
  const keys = classes.map((_, i) => `t${i + 1}`);
  const xp = 100 * ((level - 1) * level) / 2; // classLevel's curve: level n from 100 x n(n-1)/2
  const CLASSES = ["wizard", "healer", "warrior", "archer"];
  const looks = Object.fromEntries(
    CLASSES.map((c) => [
      c,
      {
        armour: { owned: ["default", ...(armours[c] ? [armours[c]] : [])], equipped: armours[c] ?? "default" },
        weapon: { owned: ["default", ...(weapons[c] ? [weapons[c]] : [])], equipped: weapons[c] ?? "default" },
        hat: { equipped: hats[c] ?? "default" },
      },
    ]),
  );
  const saved = {
    version: 9,
    you: youAt,
    spots: {},
    sprites: { you, ...Object.fromEntries(keys.map((k, i) => [k, classes[i]])) },
    seen: Object.fromEntries(keys.map((k) => [k, now])),
    view,
    ...(back !== undefined ? { back } : {}),
    stage,
    best,
    farming,
    slain,
    gold,
    kills: Object.fromEntries(KINDS.map((k) => [k, 0])),
    xp: { you: 0, ...Object.fromEntries(CLASSES.map((c) => [c, xp])) },
    skills: Object.fromEntries(CLASSES.map((c) => [c, { power: 0, haste: 0, crit: 0, ...(skills[c] ?? {}) }])),
    training: Object.fromEntries(CLASSES.map((c) => [c, { attack, health }])),
    looks,
    hats: [...new Set(Object.values(hats).filter((h) => h !== "default"))],
    ...(decor ? { decor } : {}),
    settings: { damageNumbers: true, advance: true, ...settings },
  };
  return { saved, agents: keys.map((k, i) => agent(k, statuses[i] ?? status)) };
}
