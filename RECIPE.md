# Idle RPG

Turn your agents into a raid party. Collect loot and upgrades as you progress.

A castle rampart across the top of the window, in pixel art, staffed by a small adventuring party. You and every agent are stubby, dark-outlined characters in one of four classes (wizard, healer, warrior, archer), and what each agent's character is doing shows that agent's status. Behind the battlements the sky runs a full day and night every 20 minutes, with drifting clouds. Below it are the tabs and terminals; the standard Spaces and Agents sidebar is on the left.

![Idle RPG](preview.png)

![Battle mode in motion](battle.gif)

*The day and night are sped up in this recording: a full cycle takes 20 minutes, not 18 seconds.*

This is a brief: it says what to build and how it should feel. Exact sizes, offsets and timings not given here are the code's and the tests'.

## What you see

- **Sidebar (left, 268px):** Herdr's own sidebar, unchanged: brand bar, Spaces, Agents, footer.
- **Scene (top third of the height, 230 to 560px):** pixel art at 4 screen px an art px. Back to front: a night sky with stars, a day-blue layer and orange horizon bands, each faded by the time of day; a sun and a moon half a turn apart on one circle, setting behind the wall; four clouds drifting left to right, dimmer at night; snowy mountains; grey stone battlements (64px) with red banners and torches whose glow flickers; a 152px wooden floor with a table (scroll, potion, candle) and a barrel.
- **Night:** a dark tint over the sky and darkness over the wall, the floor and everyone on it, with pools of light round the candle, each torch and, in town, the campfire (`art/light/`, every pixel darkened once). Cards and the HUD stay bright.
- **HUD** (`hudLayout`): three pixel frames 42px high along the top: the **sign** at the `inset`, the **stage section** centred while the fight runs, the **strip** at the right. A frame is a slate fill with a dark outline, a bevel and pixel corners (`art/frame/`); its text is the **lettering**, in capitals. Short of room the title goes first, then the stage section, then the strip, drop to a second row; below 640px the strip sits under the sign. A press on a frame's empty part closes panels and cards. The sign and the strip hold the same things in the same places in every view.
- **Sign:** "RAID PARTY" in gold ("NOBODY IN YET" with no agents), then chips of an icon and a shortened count ("1.2K"), each once it means something: a skull with the kills (the codex), a coin with the gold (the shop), a star with the skill points left (the skills panel; gold while any). Last the view button, "TO THE RAID" or "TO TOWN".
- **Strip:** an icon per status with agents (red alert: need you; crossed swords: working; green tick: done; "Zz": resting), its count on a badge ("99+" past 99) with a tooltip; then chips for the board, the map (the stage picker, from 640px wide) and the gear (settings).
- **You and the agents (72×72):** one character per agent, its class picked at random when it first appears and remembered for that terminal; yours likewise, tagged "YOU". An agent stands on a soft shadow with a status bubble by its head and a name tag "SPACE·TAB" under its feet.
- **Looks:** every character wears the colourway, weapon and hat its class has equipped in the shop, wherever a class sprite is drawn (the floor, a fight, cards, panels). Body, weapon and hat are three pictures at the same size and place, stacked only by `sprite()` in `main.js`. The healer's weapon is the potion it throws, drawn only in its wind-up.
- **Name tags** (`tag`): white lettering on a small dark plate, at most 84px wide (`TAG_MAX_W`). Text goes through `letterFit` (`rules.js`): capitals, accents folded, emoji one character, anything the face lacks a box, cut with "…"; a name cut or changed is shown in full in the tooltip.
- **Tab bar (42px) and terminals:** Herdr's `tabs` mod, then the active tab with each pane as a card (`pane` header).
- **Theme `idle-rpg`:** dark navy terminals (`#101c2c` on `#dbe7f3`), accent `#5cc8ff`.

## How it behaves

### The party

- **working:** the character bounces while two pixel swords over its head clash with a spark. **blocked:** a red bubble with a "!" that hops. **done:** a green bubble with a tick. **idle:** still, with three z's drifting up. All native loops.
- The focused agent's shadow, and the one whose card is open, has a pale yellow ring. Whoever stands lower is drawn in front.
- **Click empty floor:** you walk there (4ms per px), alternating two walk frames.
- **Click an agent:** a card opens by it: a portrait, the full "space · tab" name, the kind of agent (program name), status and for how long, terminal title, **Health** (hp/max and a bar, or the knockout countdown), its class line (level, an experience bar, points to spend; a click opens the skills panel on it), a wrench to pick another class, and "Go to terminal" (`agent.focus`). **Click yourself:** the same card with your own level as well. Clicking again closes it.
- **Drag an agent:** after 4px it dangles, leaning against the motion (gpui-kit has no rotation: three sheared pictures); released over the wall it falls to the floor. Agents in formation cannot be dragged.
- **Spots:** a small party's spots are remembered across restarts; a newcomer takes the first free default spot (x 250 + 88k, two rows). A crowd stands on a brick lattice at the widest step that fits everyone, packing to 16px before any share a spot; nothing new is saved. Tags, bubbles and HP bars show only where they have room, those needing you first.

### Town

- **Stations:** three props at the back of the floor, each opening the panel its sign chip opens: the **codex** (a book on the table), **training** (a straw dummy with a target) and the **shop** (a stall with a striped awning), tagged "CODEX", "TRAINING", "SHOP". Hovered, a station gets a white outline, hops and has an arrow bobbing over it.
- **Campfire** (from 640px wide): mid-floor, stones and logs with flames, sparks and a glow on native loops, drawn among the characters by depth and lighting the night. Scenery: a press walks you there, and no one is left hidden behind it.
- **Seasons** (`SEASONS`, `seasonOf`): with **Decorate in season** on, October hangs jack-o'-lanterns on the battlements, the barrel and the wall's foot, and December puts bulbs along the wall and a tree on wide scenes. A season bought as town decor shows all year; **Season over my decor** picks which wins. Its art (`art/seasons/<season>/`) includes its own night lights. Nothing is drawn where it would meet the HUD.

### Views and the quest board

- **Views** (`VIEWS`, `setView`; saved, the raid by default): town, raid and board are three views of one fight, which runs alike in each. The sign's button swaps town and raid; the board chip opens the board and, pressed again, goes back. A switch closes any panel and changes nothing in the fight. In town no boss is drawn, only knockouts and the stage section. You fight only in the raid view: leaving it on your feet takes you out of the fight (your HP kept); knocked out you stay down until you get up. Under 640px wide nothing is fought (no damage, experience or gold).
- **Board:** a frame filling the scene under the HUD with three scrolling columns, IN PROGRESS, IN REVIEW and COMPLETED, of cards, most recently active first. A card shows every agent that worked on it as class pictures (those on the branch now bright with a status dot, those gone dimmed with "last here 3h ago"), the project (the space), repo, branch, ticket keys and pull request. A pull request, or a ticket with a link, opens in the browser with `cx.open_url` (http/https only); nothing else is clickable, since the agents' work is the source of truth. With none: "NO WORK FOUND YET".
- **Board's data** (`board.js`, one `Board` given `agents`, `panes`, `spaces`, `hc`, `exec`, `readTextFile` and `wait` on `cx.timer`): a card per repo and branch an agent's pane is on. It reads agents' terminals (`hc read <address> --json --lines 3000`) for pull request links and ticket keys, reads git files for the repo and branch heads, and runs only local, read-only git (`merge-base --is-ancestor`, `rev-parse --verify`) with `--no-lazy-fetch --no-optional-locks -c core.fsmonitor=false -c core.hooksPath=/dev/null`: never `gh`, `fetch` or the network. No link: in progress; a link: in review; merged into the local `origin/<default>`: completed. A card remembers up to 12 agents. It refreshes in a `cx.spawn` task when the board opens and every 30s while it shows, never two at once, each call timing out. `PLAN.md` (The quest board) has the rest.

### The fight (raid view)

- **Monsters** (`BIOMES` in `rules.js`, `kindOf`; `MONSTERS` in `main.js`): each biome's last kind is its boss at its tenth stage, the others sharing stages 1 to 9; round again from 41. They stand mid-floor: still pictures with pieces moving on native loops (breathing, the slimes squashing, the dragon's tail swaying), blinking, hopping when hit. Ogres roar every 14s; the dragon rears and roars, upper body shaking, sound rings leaving its mouth.

  | kind (stages) | weak / resists | single attack: pose, shot, hit | area attack: pose, shot, cover |
  |---|---|---|---|
  | goblin (1–5) | fire / poison | `throw`, `dagger`, `nick` | `toss`, `bomb`, `boom` |
  | lizard (6–9) | frost / storm | `lunge`, none, `bite` | `lash`, none, `sweep` |
  | slime (10) | frost / poison | `spit`, `glob`, `splat` | `squash`, `glob`, `puddle` |
  | orc (11–15) | poison / frost | `chop`, none, `cleave` | `stomp`, none, `quake` |
  | ogre (16–19) | fire / storm | `swing`, `arc` (gust), `thud` | `slam`, none, `quake` |
  | chief ogre (20) | storm / frost | as the ogre's | as the ogre's |
  | wyvern (21–25) | storm / poison | `sting`, `barb`, `jab` | `beat`, none, `gale` |
  | draconian (26–29) | poison / fire | `thrust`, none, `pierce` | `flame`, `ember`, `scorch` |
  | dragon (30) | frost / fire | `bite`, none, `claw` | `breath`, `fireball`, `blaze` |
  | imp (31–33) | frost / fire | `hurl`, `firebolt`, `singe` | `summon`, none, `pyre` |
  | magma slime (34–36) | frost / fire | as the slime's | as the slime's |
  | goblin mage (37–39) | poison / storm | `cast`, `bolt`, `zap` | `chant`, none, `rune` |
  | demon (40) | storm / fire | `smite`, none, `rend` | `inferno`, `hellball`, `hellfire` |

- **Biomes** (`biomeOf`): forest, hills, caves, hell, ten stages each, then round again; each its own tiled mountains, wall and ground (`biomeArt`), no banners, torches, table or barrel. Caves and hell have a ceiling instead of sky, with glowing crystals or vents for torches. The town is always the rampart.
- **Name plate:** a frame over the boss with its name in gold, `hp/maxHp` (`shortNumber`), an HP bar (green, yellow below half, red below a fifth) and a row of status icons while any apply.
- **Stage section:** prev and next arrows (dimmed past 1 or `best`), "STAGE N" in gold, the time left ("9:42"; grey while it stands still) or what just happened (`stageNews`, the first wording that fits), and a bar of the time left.
- **Stages** (`rules.js`): stage N's boss has `STAGE_HP × HP_GROWTH^(N-1) × N^HP_POWER` HP (900 × 1.175^(N-1): 3.8K at 10, 43K at 25, 2.4M at 50). An attempt has 10 minutes (`STAGE_MS`), running only while someone fights ("(PAUSED)" while nobody works). A kill in time unlocks the next stage (`best`) and, with **Advance after a kill** on, fights it. Running out of time, the only loss, sends the party back to the stage before `best` to **farm** it ("TIME'S UP! BACK TO STAGE 7"; a green "FARM", the next arrow pulsing) until a stage is picked; only the attempt is lost. The arrows and the stage picker pick any stage from 1 to `best`.
- **Formation:** in the raid view every agent glides to a place by class: warriors just in front of the monster, everyone else 360px out (less on a narrow scene), alternating left and right in staggered rows; past 12 that overlap, the lattice.
- **Attacks:** each working agent attacks on its own rhythm in 250ms ticks (`TICK_STEP`): wind-up, strike, impact (damage comes off), rest. Start to start is 3s at Haste 0 down to 1.75s at 5 (`ATTACK_TICKS`), times the weapon's factor and the haste aura, never under 6 ticks; each gap varies by up to 2 ticks. Blows land scattered round the monster's core. Warrior: swings, a slash at the tip. Archer: looses an arrow, then a spark. Wizard: thrusts, a spell flies, then a burst. Healer: lobs its potion, then a splash. **You** attack too while any agent works, from where you stand (a warrior only within 90px), not while walking.
- **Weapons** (`effects.js`): each class has a free default and three at 15, 30 and 50 gold (`WEAPON_PRICES`), owned per class. A weapon multiplies damage and gap by one factor (`WEAPON_FACTORS`), so damage per second is unchanged.

  | class | default | 15 gold | 30 gold | 50 gold |
  |---|---|---|---|---|
  | warrior | Sword | War Axe ×1.5 | Hammer ×2 | Fire Blade, fire |
  | wizard | Fire Staff, fire | Ice Wand ×0.75, frost | Bolt Staff, storm | Toxic Rod ×0.75, poison |
  | archer | Longbow | Crossbow ×2 | Fire Bow, fire | Ice Bow, frost |
  | healer | Heal Vial | Haste Vial | Might Vial | Hex Vial |

- **Elements:** a blow on the boss's weakness deals ×1.5, on what it resists ×0.75 (`WEAKNESS`). Each element leaves a status (`strike`, `tickStatuses`): fire **Burn**, 20% of the blow over 3s; frost **Chill**, everyone's crit chance +10% for 4s; storm **Chain**, a 20% chance to strike twice; poison **Venom**, 20% over 6s, up to 5 stacks. Statuses show on the boss (flames, a crystal, drips, an arc) and on its plate, and clear with a new boss, a failure or a kill. Burn and venom land once a second, credited to their class.
- **Auras:** a healer carrying the Haste, Might or Hex Vial gives the party one while it stands (`partyAuras`): gaps 15% shorter, +30% damage, or the boss taking +15% from everything; that healer deals half damage. What an aura adds is credited to the healer class (`shares`).
- **The boss fights back** (`party.js`): fighters (`fighters()`) are the working agents and you. Max HP is `maxHpOf`: wizard and healer 100, warrior 200, archer 130, × the level bonus × 1.12^Health. Every 4s or so the boss throws one to three single attacks at random attackers, then an area attack on a marked ellipse that hits everyone standing inside it. A blow deals `stageDamage(N)` (4 × 1.175^(N-1) × √N), scaled by how many stand. Each fighter has a small HP bar. Anyone who leaves the fight comes back within the attempt as they left.
- **Knocked out** at 0 HP for 30s (`KO_TICKS`): lying down with stars circling over it and a gold ring emptying round the seconds left (`restArt`, placed by `ringTop` clear of everything). No wipe: with everyone down the boss waits and the time runs on. Everyone is up at full HP for each new attempt.
- **Healing:** every healer heals the standing fighter lowest for their max every 6s (3s on the Heal Vial), for its own max HP (`healOf`). A working healer heals and attacks in turn; an idle, done or blocked healer heals from the back while anyone fights, never hit and not counted. A heal earns what a blow would.
- **Defeat:** the boss fades out, "SLIME SLAIN!" shows in gold, the kill is counted, gold is paid, and the next boss appears 3s later (`RESPAWN_MS`); 5s with a countdown after the kill that first clears a stage (`ADVANCE_MS`).
- **Progress** belongs to you and the four classes, never to an agent; it is all booked in `fight()`, per blow that lands, never past the boss's HP.

  | what | rule |
  |---|---|
  | Damage (`damageOf`) | 10 × (1 + 0.12 × (level − 1)) × 1.12^Attack × (1 + 0.2 × Power), the class's, so you hit like your class; shown shortened ("1.2K", M, B, T, then "1.2E18") |
  | Experience (`blowXp`) | a blow's share of 200 × attackers × 1.03^(N-1), to its class and the same to you |
  | Levels (`levelOf`) | from 1, no cap; level n to n + 1 costs 100n for a class, 250n for you; only total experience is stored |
  | Gold (on a kill) | floor(0.5 × attackers × 1.23^(N-1)), at least 1, attackers capped at 20: three agents and you get 2 at stage 1, 287 at 25 |
  | Training (`train`) | gold buys a class Attack or Health levels, ×1.12 each, at floor(5 × 1.45^level) |
  | Skill points | 1 per class level past 1, spent on Power (+20% damage), Haste (a tick off the gap) or Crit (+5% chance of ×2), ranks 0 to 5; free Reset |

- **Panels:** one of the codex, skills panel, shop, settings, stage picker or a card is open at a time; each closes by its ×, its opener again or a click on the floor.
  - **Codex:** per biome, each kind's picture, name and kill count ("???" until slain).
  - **Monster's card** (a press on the boss or its plate): its picture, name, biome and stage, HP, weakness and resistance with their icons, and how many slain.
  - **Skills panel:** the four classes as tabs; points to spend and Reset; a "+" per skill with what it gives ("23 damage (+40%)", "attacks every 2.5s"); Buy per training. Dead controls are dimmed.
  - **Shop** (`SHOP` in `rules.js`): kinds down the left (Armours, Weapons, Hats, Town decor), the four classes across the top, then tiles previewing each item on the class with "Equipped", "Equip" or "Buy n"; two lines describe the picked item ("Hammer: 2× damage, half speed"). Buying equips; there are no refunds and gold never goes below 0. **Armours** recolour a class's outfit (a free default, then 5, 10, 20 gold: wizard Violet, Crimson, Moss, Frost; healer Teal, Rose, Sky, Plum; warrior Steel, Cobalt, Jade, Ruby; archer Forest, Scarlet, Azure, Dusk). **Hats** are bought once for every class (Party Hat, Santa Hat, Pumpkin at 10, 20, 30). **Town decor** is a season's decorations all year (2,500).
  - **Settings** (the gear): a switch per `SETTINGS` entry, saved at once: "Show damage numbers", "Advance after a kill", "Decorate in season", "Season over my decor".
  - **Stage picker** (the map): pages of the biomes reached, then a stage's ten fights, those reachable white; a pick acts like the arrows.
- **Damage numbers** (setting on): each blow shows what it dealt in the pixel font where it struck, crits gold and bigger with "!", burn and venom in their colours beside the boss, a ▲ or ▼ for weakness or resistance; each rises and fades. At most 12. With the setting off a crit still shows a small "6!".
- **Level-up:** a gold note ("Wizard 3!", "Level 4!") rises over whoever landed the blow.

## Built from

- `layouts/idle-rpg.json`: root `row` (`titlebar: none`, theme `idle-rpg`) of `sidebar` (copied from Herdr's `main` layout: `workspace-chrome`, `spaces`, `agents`) and a `column` of `scene` (the `idle-rpg` mod, props `{ inset: 16 }`, weight 1) and `work` (weight 2: the `tabs` block, then the `tab: active` block with the `pane` header mod).
- `mods/idle-rpg/rules.js`: the game's numbers and rules, the shop, the art path builders, the lettering, `letterFit` and `loadState`, as plain functions with no host calls.
- `mods/idle-rpg/effects.js`: what weapons, elements and auras do, and their art paths.
- `mods/idle-rpg/party.js`: the party in a fight as plain data (joining, leaving, the boss's attacks, hits, knockouts, healing).
- `mods/idle-rpg/board.js`: the quest board's cards, from host functions passed in.
- `mods/idle-rpg/main.js`: one `View`. Prop `inset`, the sign's left edge (default 84 leaves room for macOS window buttons).
- `herdr`: `agents`, `spaces`, `props`, `panes`, `hc`, `exec`, `readTextFile` (the board's), `shared` / `setShared` (key `idle-rpg.state`, falling back to `raid-party.state`, `rpg.state`, `snow-loft.state`), `run("agent.focus")`.
- **Saved state** (version 9): `{ version, you: {x, y}, spots: { <address>: {x, y} }, sprites: { you | <address>: <class> }, seen, view, back, stage, best, farming, slain, gold, kills: { <kind> }, xp: { you, <class> }, skills: { <class>: { power, haste, crit } }, training: { <class>: { attack, health } }, looks: { <class>: { armour | weapon: { owned, equipped }, hat: { equipped } } }, hats, decor: { owned, equipped }, settings, board }` (`board`: `Board.toJSON()`, no paths or remote URLs). `loadState` never throws, reads every older version (before 1 to 8) with new fields at their defaults, and validates everything (unknown keys and ids dropped, numbers clamped, only own keys read). The boss is never saved. A newer `version` is read but never written over.
- **Saving:** deliberate actions (skills, training, a stage, a setting, the shop, a class, a view, walking, dropping an agent, a newcomer's class) save at once; a fight saves on a kill and a failed attempt, never on a hit (a shared value re-renders every mod in the window), and once more in `close()`.
- gpui-kit: absolute positioning, mouse and hover handlers, `on_size_change`, `transition` (`left`, `top`, `opacity`, `width`), `loop`, `tooltip`, `cx.timer.every` / `after`.
- **Sky clock:** every 10s `init` stores `Date.now()` and re-renders; the time of day is `now % 20min`, so every window agrees. Sky, sun, moon and clouds glide between ticks.
- **Battle clock:** a 1s watch syncs who fights (`muster`), brings in a due monster and starts the attack clock when the time runs (`clockRuns()`: anyone fighting, the boss alive, 640px or wider) or anyone rests. The attack clock is one chain of `cx.timer.after(250)`. Each tick: the boss acts (`monsterTick`), rhythms start, statuses tick, heals and blows land (`fight(blows)`), and 250ms comes off the attempt. A tick renders only when something shown changed. Motion inside a phase is native transitions.
- `themes/idle-rpg.json`.
- `mods/idle-rpg/art/`: every picture as PNG, written whole by `tools/idle-rpg-sprites.py` (1,335 files), in folders by what they show, then what it does. Paths that depend on the state or an agent come only from the builders in `rules.js` and `effects.js`; the rest are quoted in `main.js`.
  - `scene/` (and `scene/<biome>/`), `stations/`, `campfire/`, `light/`, `seasons/<season>/`, `status/`, `effects/`, `foe/`, `frame/`, `icons/`, `attacks/`, `monsters/<kind>/`.
  - `font/<colour>/`: 3×5 digits and number signs for damage and counts. `lettering/<colour>/`: the HUD's capitals and punctuation (`LETTERS`, `letterArt`), with a box for anything else.
  - `classes/<class>/<look>/`: fourteen poses (`FRAMES`: stand, walk, dangling, stance, wind-up, strike, down), 16×16 pixel art with a one-pixel outline, drawn at 72px (fighting poses 96×72). A colourway swaps palette entries, never skin, eyes or outline.
  - `weapons/<class>/<weapon>/` and `hats/<hat>/<class>/`: see-through overlays matching each pose, held in the pose's hand or worn on its head. The ids in the generator's `LOOKS`, `WEAPONS`, `HATS` and `rules.js`'s `SHOP` must match.
- **CI** runs the Node tests, checks `RECIPE.md` is under 60,000 bytes, parses the YAML and JSON, syntax-checks the scripts, installs into an empty and a stale Herdr home, and checks every picture the code can ask for exists, `art/` holds exactly the generator's files, and every label and number can be lettered.

## Watch out

- The floor is a fixed 152px band at `bottom(0)`; everything on it is placed in floor coordinates (feet, y down from the floor's top), so the room holds at any height. The wall height is the root's height less the floor, set in `on_size_change` and again from each pointer event's `event.bounds`.
- Child `on_mouse_down` handlers record the press; the root handles move and up. The root stops propagation so the scene never drags the window; set no `window_drag` on its block.
- Use PNG, not SVG (renders soft), at whole-pixel positions. Herdr draws a picture at its own proportions, never stretched, so give each box its picture's shape.
- A transition animates later changes, not an element's first appearance: damage numbers, notes and projectiles must exist a render before they move.
- `herdr-app check` renders with no agents: test the agent, card and ragdoll code with a hard-coded fake agent.
- `rules.js` imports nothing and `effects.js` only it, so both run under Node.
- The installed copy's shared state is real progress: test against a hard-coded state with `save()` disabled, and make sure `loadState` reads the old format before installing (the first save rewrites it).
- Saves are not always hot-reloaded; switching layouts away and back reloads.
- Experience since the last save is lost if the app quits without `close()`.

## Done when

- `herdr-app check mods/idle-rpg` passes and `herdr-app status` shows no errors with the layout shown.
- Each running agent appears as an adventurer named for its space and tab, its card says what kind of agent it is, and its bubble matches its status; the strip counts each status with agents.
- Clicking the floor walks you there and a restart keeps you there; clicking an agent opens its card and "Go to terminal" focuses its terminal; picking a class changes the sprite and survives a restart; dragging and dropping an agent leaves it there, in a crowd too.
- 400 agents (100 a class) render in town and in a raid, each on a spot of its own.
- From a fresh save with one warrior, archer or healer agent working, each blow takes 10, about every 3s on its own rhythm. With you out of the fight (a warrior over 90px from the boss), stage 1 falls in about 4.3 of its 10 minutes (`tools/sim.mjs --agents 1 --you none`); a wizard's burn makes it about 3.6, and you joining as a healer about 2.2. The next stage's boss comes 3s after a kill (or the same stage with "Advance after a kill" off); the arrows and the map pick any stage reached; the raid view's backdrop is its stage's biome; the fight runs on in town and on the board. When the time runs out the party farms the stage before until the next arrow is pressed.
- Each blow adds its share of the stage's kill XP to its class and to you; a kill adds the stage's gold and 1 to its kind's count, shown on the sign and in the codex; a level-up shows a note; damage numbers rise off the monster (crits gold) and the gear turns them off and on.
- Skill points show on the sign's star and the card; spending them raises damage, attack speed or crits, and Reset gives them back. Training's Buy raises Attack or Health and is dimmed while the gold is short.
- Attackers have HP bars the boss's blows bring down; an area attack hits only those inside its marker; a character at 0 HP lies down with stars and a countdown from 30 and gets up 30s later; everyone down loses nothing; every healer heals the lowest every 6s (3s on the Heal Vial); idle, blocked and done agents are never hit.
- A bought colourway, weapon or hat is worn at once by every character of the class wherever drawn; a hat bought once equips free on every class; a Hammer hits twice as hard half as often, and a Fire Bow on an ogre deals half again with an orange ▲ and burns.
- Gold, kills, skills, training, looks, settings and the stage survive a restart (experience as of the last save), and state from every older version (before 1 to 8) loads with nothing lost and new fields at their defaults.
