# AGENTS.md

## Purpose

Idle RPG, a layout for the [Herdr](https://herdr.dev) desktop app that shows coding agents as a raid party. The repo root is the layout, laid out like Herdr's config folder (`layouts/`, `mods/`, `themes/`) so Herdr's gallery finds it and `install.sh` can copy it into `~/.config/herdr-app`.

## Tech stack

- **Herdr layouts** (`layouts/*.json`), **themes** (`themes/*.json`) and **mods** (`mods/<name>/main.js`, JavaScript against gpui-kit; no HTML, CSS or Node APIs)
- **Node** (22, built-in test runner, no dependencies) for `tests/` and `tools/sim.mjs`
- **Python 3** (standard library only) for `tools/idle-rpg-sprites.py`, which draws the art, and a POSIX `sh` installer
- **Renovate** and **GitHub Actions** (CI, release)
- **MIT License**

## Structure

```
.
├── layouts/                  # idle-rpg.json, idle-rpg.svg (settings preview)
├── mods/idle-rpg/            # main.js, rules.js, party.js (the boss fighting back), effects.js (what weapons do), board.js (the quest board's cards), mod.json, art/ (PNGs in folders by entity, then animation)
├── themes/                   # idle-rpg.json
├── RECIPE.md                 # Brief another agent could rebuild it from
├── PLAN.md                   # Planning notes for growing it into an idle RPG
├── preview.png               # Still, for Herdr's gallery
├── battle.gif                # Battle mode in motion, for the README
├── tools/                    # idle-rpg-sprites.py: generates every PNG in art/ (the whole folder tree); sim.mjs: the balance simulation
├── tests/                    # Node tests (node --test), with a harness that runs the real main.js; see tests/README.md
├── install.sh                # Copies the layout into ~/.config/herdr-app
├── .github/                  # CODEOWNERS, Renovate config, workflows (CI, release, Renovate)
├── .tool-versions            # Pinned tool versions (asdf/mise)
├── AGENTS.md
├── CONTRIBUTING.md
├── README.md
├── SECURITY.md
└── renovate.json
```

## Working on the layout

- The reference for layouts, mods and the `herdr` module is `~/.config/herdr-app/AGENTS.md` and the `.d.ts` files beside it, rewritten by the app to match the installed version. Read them before changing a mod.
- Edit files in the repo, then run `./install.sh` to copy them into Herdr. After every mod change run `herdr-app check <mod folder>`, then `herdr-app status` with the layout shown. `check` renders with no agents, so test agent-dependent code with a hard-coded fake agent.
- `herdr-app shot <file.png>` captures the window for visual checks.
- Keep `RECIPE.md`, `preview.png` and `battle.gif` in step with the layout's files.
- Keep `RECIPE.md` well under 64 KB: Herdr's gallery drops the layout's whole listing past that, and CI fails over 60,000 bytes (`wc -c RECIPE.md`). State each fact once, in the section Herdr's order gives it, and put runs of numbers in tables.
- Art is original. Do not copy characters or artwork from existing games or products.
- `art/` is organised by entity, then by animation, with short names inside (`classes/<class>/<look>/walk/l.png`, `monsters/dragon/roar/top.png`); the generator's header and `RECIPE.md` list the folders. A picture whose path depends on the state or an agent gets it from a builder in `rules.js` (`lookArt`, `weaponArt`, `hatArt`, `attackArt`, `monsterArt`, `biomeArt`, `seasonArt`, `glyphArt`, `letterArt`, `restArt`) or `effects.js` (`effectIconArt`, `markArt`, `overlayArt`), never from string concatenation in `main.js`; the rest are quoted paths passed to `src()` in `main.js`. A new picture goes in the generator, in the folder of what it shows. Text a user typed (an agent's space and tab names) is drawn in the lettering only through `letterFit` in `rules.js`, which keeps every character to `LETTERS` (a box for what the face lacks, an ellipsis where a name is cut).
- `board.js` (the quest board) is the only part that reaches outside the mod's folder: it reads agents' terminals with `hc read`, reads git files (`.git`, `commondir`, config, refs, `packed-refs`; never a network path) with `readTextFile`, and runs local, read-only git: `merge-base --is-ancestor`, plus `rev-parse --verify` when refs cannot be read from files, always behind `GIT_PREFIX` (`--no-lazy-fetch --no-optional-locks -c core.fsmonitor=false -c core.hooksPath=/dev/null`; a git without `--no-lazy-fetch` turns the check off on that machine), so a repo's own settings (a partial clone's lazy fetch, its ssh command, hooks, fsmonitor) cannot make git fetch or run anything; without those flags it would reach the network. For a space on another machine the files are read and git is run there, through herdr-core. It never runs `gh`, `fetch` or `git fetch`, and nothing read from a terminal becomes a path or a command argument. Herdr's `setTimeout` throws when called: the host passes `wait` built on `cx.timer.after`. `main.js` (`boardPace`, `refreshBoard`) refreshes it only while the board shows, in a `cx.spawn` task, never two at once; the only other thing the board does is open a card's pull request or ticket link with `cx.open_url` on a click. `PLAN.md` (The quest board) lists what it reads and runs, and its limits; keep both in step.
- `gpui-kit.d.ts` and `jsconfig.json` inside mod folders are written by Herdr and git-ignored.

## Tests

- The tests live in `tests/` and run with Node's built-in runner, no dependencies: `node --test 'tests/**/*.test.mjs'` from the repo root (a few seconds; CI runs it on every pull request). `HERDR_TESTS_THOROUGH=1` sweeps every width, size and combination (minutes). `tests/README.md` says how they are laid out.
- `tests/harness/` runs the real, unmodified `main.js` under Node with stand-ins for `herdr`, `gpui-kit` and `gpui-base`, a fake clock and a seeded `Math.random`: a test mounts the view, advances time, clicks by id and reads back the pixel text, pictures and boxes it drew. **A change to the view needs a harness test** (a few lines: see the example in `tests/README.md`), as a change to `rules.js`, `party.js` or `effects.js` needs one in their suites.
- A known bug is a test of the correct behaviour marked `{ todo: "why" }`, so CI stays green; fixing the bug means removing the `todo`.
- `tools/sim.mjs` is the balance simulation: it plays the real rules the way `main.js` runs a fight and prints time to first clear per stage (`node tools/sim.mjs --help`). Use it before changing a number in `rules.js`, `party.js` or `effects.js`, and record what it says in `PLAN.md`. `tests/view/parity.test.mjs` fails when `main.js`'s fight and the simulation's part ways. It cannot say which side is wrong: first decide which is right (a parting is as often a bug in `main.js` as a stale simulation), add a direct test for the cause in the view's or the rules' suites, then fix the wrong side. Never just copy the view into the simulation's `Fight`.
- Rules about to change have their expectations in one place in `tests/view/expect.mjs`.

## Conventions

- `.tool-versions` is the single source of truth for language and tool versions. Before building, testing, or running any tooling, check it and use the pinned versions (install via `asdf install` or `mise install`). When adding a new language or tool to the project, pin its version there first — never assume a globally installed version.
- Versioning: releases and tags follow [SemVer](https://semver.org/) as bare `X.Y.Z` — no `v` prefix (`1.4.2`, not `v1.4.2`). Bump MAJOR for breaking changes, MINOR for backwards-compatible features, PATCH for fixes.
- See `CONTRIBUTING.md` for branch naming, commit style and pull requests.
- Branch protection: never push directly to `main`; all changes via PR with review.

## Releases

- Releases are versioned with [SemVer](https://semver.org/) as bare `X.Y.Z` tags — no `v` prefix.
- **Automatic bumps**: when a PR merges to `main`, the next version is derived from the PR label:
  - `major` — breaking changes
  - `minor` — backwards-compatible features
  - `patch` — fixes
  - No label — defaults to a `patch` bump
- **Manual releases**: a specific version may be cut manually by supplying an explicit `X.Y.Z` version tag when needed (e.g. via a manual workflow dispatch). This bypasses the label-based bump.
- Release automation lives in `.github/workflows/release.yaml`: it computes the next version, tags, and creates the GitHub release. Nothing is built; a release is the repo at that tag.
