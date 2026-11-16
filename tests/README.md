# Tests

Node's built-in test runner, no dependencies, Node 22 or later (`.tool-versions`). From the repo root:

```sh
node --test 'tests/**/*.test.mjs'                          # everything, a few seconds (CI runs this)
node --test tests/view/fight.test.mjs                      # one suite
node --test --test-name-pattern='a kill' 'tests/**/*.test.mjs'
HERDR_TESTS_THOROUGH=1 node --test 'tests/**/*.test.mjs'   # every width, size and combination (about 2.5 minutes)
```

Quote the glob: Node expands it (`node --test tests/` does not work on Node 22, which takes a directory for a file).

## Layout

| | |
|---|---|
| `rules*.test.mjs`, `party.test.mjs`, `effects.test.mjs` | the plain modules (`rules.js`; its shop, art paths and `loadState`; `party.js`; `effects.js`) |
| `view/*.test.mjs` | the real `main.js` through the harness: loading, fights, failures, the boss's attacks, weapon effects, panels, the HUD and `hudLayout`, screen sizes, saves, render discipline, every picture, the simulation's parity |
| `crowd.test.mjs` | 50–400 agents: today's quadratic `place()`, as a baseline |
| `sim.test.mjs` | `tools/sim.mjs --smoke` and its player |
| `harness.test.mjs` | the harness itself |
| `harness/` | the harness (below); `view/expect.mjs` holds the rules about to change (the drop-back on a failure, the stage section's text) in one place each |

Known bugs are tests of the correct behaviour marked `{ todo: "why" }`: they run and report but do not fail the run. Fix the bug and remove the `todo`.

## The view harness

`main.js` imports `herdr`, `gpui-kit` and `gpui-base`, which exist only inside Herdr. `harness/register.mjs` registers a Node module hook (`module.registerHooks`, or `module.register` on an older Node) that resolves those three names to the stand-ins in `harness/stubs/`; `harness/view.mjs` imports it, then imports `main.js` itself, unmodified.

- **Elements** (`harness/elements.mjs`): `div()`, `image()`, `h_flex()`, `v_flex()` record every call into a tree: id, style values, children (text as `Text`), the image path, tooltips, handlers, hover and active styles, loops and transitions. Only methods `gpui-kit.d.ts` has are accepted (`METHODS`; add one main.js starts using after checking the `.d.ts`), and a child given to two parents throws, as in gpui-kit. A render that asks for a picture not in `art/` throws, and so does one that gives a picture a box of another shape (more than a pixel off): Herdr draws a picture at its own proportions, as large as fits and centred, never stretched, so such a box is partly empty. A picture meant to sit letterboxed is listed in `LETTERBOXED` (`harness/view.mjs`) with why; `mountView({ checkShapes: false })` measures what is drawn anyway (`drawnIn` in `harness/png.mjs`).
- **Herdr** (`harness/stubs/herdr.mjs`, `harness/world.mjs`): `agents()`, `spaces()`, `props()`, `shared()`/`setShared()` (every call recorded, values deep-copied), `run()` (recorded). Anything else throws "not stubbed".
- **Time** (`harness/clock.mjs`): while a view is mounted, `Date.now()` is a fake clock and `Math.random()` a seeded source. `cx.timer.every/after` run only when the test advances the clock, in order; whatever they `notify()` renders once per instant, like a frame.

Writing a view test:

```js
import { mountRaid, mountView, agent, raid } from "../harness/view.mjs";

const v = await mountRaid({ classes: ["warrior", "archer"], you: "healer", stage: 4, gold: 50 });
v.advance(10000);                        // 10s: timers, ticks, renders
v.until((h) => h.view.monster.hp <= 0);  // step until true (throws after 10 minutes)
v.text("idle-rpg-stage");                // ["STAGE 5", "10:00"]: pixel text read back
v.runs("idle-rpg-sign");                 // the same with colours: [{ text, colours, face }]
v.images("critter-t1");                  // the pictures under an id
v.box("idle-rpg-sign");                  // { x, y, w, h } in the view
v.click("idle-rpg-gold");                // mouse down, up and click by id
v.clickFloor(500, 80); v.press(id); v.move({ x, y }); v.release(); v.hover(id)
v.setAgents([...]); v.resize(800, 230); v.close();
v.saves; v.stored; v.commands; v.renders; v.renderLog; v.pendingTimers()
v.view                                   // the RaidParty instance itself
```

`raid()` (in `harness/fixtures.mjs`) builds a version 7 save and its agents from a few options (classes, level, training, weapons, looks, stage, settings); `savedState(version)` is a save as each version of the mod wrote it; `mountView({ saved, agents, width, height, inset, seed, phase })` mounts anything.

A change to what the view shows or does needs a test here: a few lines with these helpers.

## The simulation

`tools/sim.mjs` plays `rules.js`, `party.js` and `effects.js` headlessly the way `main.js` runs a fight, and prints how long a party takes to clear each stage (`node tools/sim.mjs --help`). It is not in the test run (a full run to stage 50 takes about 15 seconds a setup); `sim.test.mjs` runs its `--smoke` mode, and `view/parity.test.mjs` plays the same seeded fight through the harness and through the simulation's `Fight`, second by second, so the two cannot drift apart: a change to the fight in `main.js` fails it until `Fight` matches.
