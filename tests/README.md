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
| `rules*.test.mjs`, `party.test.mjs`, `effects.test.mjs` | the plain modules (`rules.js`, the seasons' calendar and `decorOf` included; its shop (town decor too), art paths (the countdown's rings tied to `KO_TICKS`; the knocked-out stars' strip, picture by picture) and `loadState`; `party.js`; `effects.js`) |
| `view/*.test.mjs` | the real `main.js` through the harness: loading, fights, failures (only by the clock; everyone down at once), the boss's attacks, knockouts (the stars' strip turned by `frames`) and their countdown ring, the thirteen kinds of monster, the monster's card and the codex (`monsters.test.mjs`), healers (working and standing by), weapon effects, panels, the cards' Health row (`agents.test.mjs`), the HUD and `hudLayout` (with what the stage section says in the time's place, at every width), the name tags and the boss's plate, the biomes and the stage picker, the town's seasonal decorations and the town decor equipped (`seasons.test.mjs`), screen sizes, saves, render discipline, every picture, the simulation's parity; the three views (`views.test.mjs`: the fight the same in town, on the board and switching as in the raid, the sign's button and the board chip, the saved view and `battle` read as one, the board's placeholder at every size with fixture cards, the strip's chips, renders per view) |
| `crowd.test.mjs` | crowds: small parties pinned against the old spots and formation, the boss's area attack catching as many as main (and the simulation), 100–2,000 agents laid out in linear time (render ms printed), no two on one spot below the stated counts, stations, campfire and boss kept clear, dragged spots kept, the tag rule |
| `sim.test.mjs` | `tools/sim.mjs --smoke` and its player |
| `harness.test.mjs` | the harness itself |
| `harness/` | the harness (below); `view/expect.mjs` holds the rules about to change (the drop-back on a failure, the stage section's text and when its time runs) in one place each |

Known bugs are tests of the correct behaviour marked `{ todo: "why" }`: they run and report but do not fail the run. Fix the bug and remove the `todo`. A todo that starts passing is not a failure either, so CI prints a warning naming it; locally: `node --test --test-reporter=tap 'tests/**/*.test.mjs' | grep -E '^ *ok .* # TODO'`.

## The view harness

`main.js` imports `herdr`, `gpui-kit` and `gpui-base`, which exist only inside Herdr. `harness/register.mjs` registers a Node module hook (`module.registerHooks`, or `module.register` on an older Node) that resolves those three names to the stand-ins in `harness/stubs/`; `harness/view.mjs` imports it, then imports `main.js` itself, unmodified.

- **Elements** (`harness/elements.mjs`): `div()`, `image()`, `h_flex()`, `v_flex()` record every call into a tree: id, style values, children (text as `Text`), the image path, tooltips, handlers, hover and active styles, loops, transitions and `frames` sequences (`sequence`). Only methods `gpui-kit.d.ts` has are accepted (`METHODS`; add one main.js starts using after checking the `.d.ts`), and a child given to two parents throws, as in gpui-kit. A render that asks for a picture not in `art/` throws, and so does one that gives a picture a box of another shape (more than a pixel off): Herdr draws a picture at its own proportions, as large as fits and centred, never stretched, so such a box is partly empty. A picture that sits letterboxed is listed in `LETTERBOXED` (`harness/view.mjs`) with why: that list is the only place to opt out (`checkShapes: false` is for the harness's own tests). `drawnIn` (`harness/png.mjs`) says what part of a box a picture covers. An image with no numeric `w`/`h` throws.
- **Herdr** (`harness/stubs/herdr.mjs`, `harness/world.mjs`): `agents()`, `spaces()`, `props()`, `shared()`/`setShared()` (every call recorded, values deep-copied), `run()` (recorded). Anything else throws "not stubbed".
- **Time** (`harness/clock.mjs`): each handle has its own fake clock and seeded random source (the clock starting in mid-January 2027, out of every season, so no test meets the town's seasonal decorations unless it starts the clock in one with `mountView`'s `at`), and puts them in as `Date.now()` and `Math.random()` whenever it renders, advances or takes input, so two views in one test each keep their own (between those calls the globals are whichever handle acted last; `restoreGlobals()` puts the real ones back). `cx.timer.every/after` run only when the test advances the clock, in order (a timer cancelled inside its own callback stops); whatever they `notify()` renders once per instant, like a frame. As in gpui-kit, `cx.notify()` during a render throws; a `setShared` during a render makes the view render again, as the app re-renders every mod; shared values round-trip through JSON, as the app stores them.

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
v.pressStack([top, below]); v.hoverStack([top, below]) // where elements overlap: each in turn, top-most first
v.setAgents([...]); v.resize(800, 230); v.close();
v.saves; v.stored; v.commands; v.renders; v.renderLog; v.pendingTimers()
v.view                                   // the RaidParty instance itself
```

`raid()` (in `harness/fixtures.mjs`) builds a version 9 save and its agents from a few options (classes, statuses, level, training, weapons, looks, town decor, stage, settings, `view`: "town", "raid" or "board"); `savedState(version)` is a save as each version of the mod wrote it; `mountView({ saved, agents, width, height, inset, seed, phase, at })` mounts anything (`at`: a time in ms whose day the clock starts on, `phase` the time of day; `mountRaid(options, { at })` likewise).

A change to what the view shows or does needs a test here: a few lines with these helpers.

## The simulation

`tools/sim.mjs` plays `rules.js`, `party.js` and `effects.js` headlessly the way `main.js` runs a fight, and prints how long a party takes to clear each stage (`node tools/sim.mjs --help`). It is not in the test run (a full run to stage 50 takes about 15 seconds a setup); `sim.test.mjs` runs its `--smoke` mode, and `view/parity.test.mjs` plays the same seeded fight through the harness and through the simulation's `Fight`, second by second, so the two cannot drift apart: a change to the fight in `main.js` fails it until `Fight` matches.
