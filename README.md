# herdr-idle

[![Release](https://img.shields.io/github/v/release/thanoslabs/herdr-idle?sort=semver&display_name=tag)](https://github.com/thanoslabs/herdr-idle/releases/latest)
[![Renovate](https://img.shields.io/badge/renovate-enabled-brightgreen?logo=renovatebot)](https://github.com/thanoslabs/herdr-idle/pulls?q=is%3Apr+author%3Aapp%2Frenovate)
[![License: MIT](https://img.shields.io/github/license/thanoslabs/herdr-idle)](LICENSE)

A layout for the [Herdr](https://herdr.dev) desktop app that shows your coding agents as something more fun than a list.

## Idle RPG

Turn your agents into a raid party. Collect loot and upgrades as you progress.

![Idle RPG battle mode: the party attacking a dragon through a day and a night](battle.gif)

*The day and night are sped up here: a full cycle takes 20 minutes, not 18 seconds.*

A pixel-art castle rampart across the top of the window, under a sky with drifting clouds and a 20-minute day and night. At night the rampart goes dim, lit by pools of torchlight. You and every agent are pixel-art adventurers: a wizard, healer, warrior or archer, picked at random on arrival.

| Agent status | What the adventurer does |
|---|---|
| Working | Bounces under two clashing swords |
| Blocked (needs you) | A hopping red "!" bubble |
| Done | A green tick bubble |
| Idle | Rests while z's drift up |

- **Click the floor** to walk there.
- **Click an agent** for a card with its portrait, what kind of agent it is, its status and a "Go to terminal" button. Each agent is named for the space and tab it works in. The wrench on the portrait lets you pick a different class; click yourself to change your own.
- **Drag an agent** to carry it around; release to drop it. Positions and classes are remembered.
- **Battle mode** (the Start Raid / Return to town button by the sign, on by default): the boss of a stage stands in the middle and the party forms up around it, warriors up close and the rest at range. Each working agent attacks on its own rhythm, every 3 seconds to begin with (faster with Haste, below), the damage coming off as the blow lands, with its own animation: the warrior swings its weapon, the archer draws and shoots, the wizard thrusts its staff or wand and casts a spell, and the healer lobs a potion that splashes, each in the look of the weapon its class holds. You join in whenever the party is attacking; as a warrior you have to stand next to the monster to reach it. The monsters are alive too: they blink, the slime squashes and rises, the dragon breathes and sways its tail, and now and then the ogre roars, and the dragon rears back and roars, jaws wide and wings raised, with rings of sound rolling out of its mouth. Turning battle mode off sends everyone back to their own spots.
- **The boss fights back:** every character attacking it has an HP bar over its head (only those attacking: idle, blocked and done agents are never hit and keep their bubbles). Every few seconds it strikes one of them (the slime spits, the ogre swings its club, the dragon bites), and now and then it marks a ring on the floor around one of them and a moment later hits everyone inside it (a splash of goo, a ground slam, a blaze of fire), so warriors bunched at its feet get hit together. A character at 0 HP is knocked out: it lies on its back with stars circling its head, a gold bar and a gold number beside it counting down a 30-second rest, then gets up at full HP (an attempt lasts long enough that it usually gets back into the fight). It is still working (it never shows the "Zz" of an idle agent). If the last one standing falls, the party is wiped and the attempt fails like the timer: "Wiped! Back to stage 8". A healer holding the Heal Vial throws it at whoever is lowest instead of attacking while anyone is under 60%, restoring as much as its own max HP, and a green plus rises off them; healing earns its class experience like a blow. In a long fight at the stage you are pushing, a party with a Heal Vial healer lasts much longer than one without. Everyone is back at full HP for each new attempt. The warrior has the most HP, the healer and wizard the least; class levels and Health training raise it.
- **Stages:** the goal is to push stages. Stage 1 is a slime, 2 an ogre, 3 a dragon, and round again, each boss with more HP than the last (exponentially more), so the party has to keep growing to keep up. Each attempt has 10 minutes, shown on the boss's name plate in minutes and seconds ("9:42") and a thin bar; the clock only runs while someone is attacking, so it pauses whenever no agent is working. A stage well behind your best falls in well under a minute; the one you are pushing is a fight of a few minutes, usually lost (if it is lost) to the party being worn down rather than to the clock. Kill the boss in time and the stage is cleared: it pays gold (more at higher stages) and the next stage's boss turns up 3 seconds later; the first time you clear a stage, "Moving to stage N in 5…" counts down 5 seconds first. If the time runs out ("Time's up!") or the party is wiped, it falls back to the stage before, one it can clear, and farms it (marked "farm" on the plate; kills there repeat it) to get stronger, until you press the pulsing next arrow to try again; nothing is lost but the attempt (at stage 1 the same boss simply comes back). The arrows beside "Stage N" on the plate let you go to any stage you have reached, to farm gold and experience, and forward again up to the highest; the "Advance after a kill" setting (on by default) decides whether a kill moves on or repeats the stage. Big numbers are shortened: 1.2K, 3.4M, then B and T.
- **Experience and levels:** progress belongs to you and to the four classes, never to an agent. Every blow that lands earns experience for the attacker's class and for you, who lead the raid, by the share of the boss's HP it took (worth more at higher stages). Each class levels on its own, and every class level makes it hit 12% (of its base) harder; you level too; a gold note pops up over the head of whoever levels up. Your card shows your level, and every card the level of that character's class, with progress to the next, and the class picker shows every class's level. Your own level unlocks nothing yet. Combat progress is saved each time a boss falls or an attempt runs out of time.
- **Skill points:** each level a class gains earns it a skill point, spent on that class's skills, which then apply to everyone with that class on, agents and you alike. Three skills for every class, up to rank 5 each: **Power** (+20% damage per rank), **Haste** (a quarter of a second less between attacks per rank, from 3s down to 1.75s) and **Crit** (+5% chance per rank of a blow dealing double damage, shown as a gold damage number). A gold star on the sign shows the points you have to spend; click it, or the class line on any card, to open the skills panel, pick a class and spend them. Reset gives a class all its points back for free.
- **Training:** the same panel (titled "Skills & Training") has a Training section where gold buys a class levels of **Attack**, each making it hit 12% harder, and of **Health**, each giving it 12% more HP, each at a price that rises steeply with every level of its own (5 gold for the first, about half as much again for each next). Like skills, training belongs to the class, so every character on it benefits.
- **The shop:** click the gold on the sign to open it. Down its left side are the kinds of item: Armours, Weapons and Hats, with more to come. Like progress, a look belongs to a class, not an agent: every character with that class on, agents and you alike, wears the colourway, the weapon and the hat the class has equipped. **Armours** are colourways for a class's outfit: each class has its own colours plus three more to buy for 5, 10 and 20 gold (the wizard in Crimson, Moss or Frost, the healer in Rose, Sky or Plum, the warrior in Cobalt, Jade or Ruby, the archer in Scarlet, Azure or Dusk). **Hats** are not tied to a class: a Party Hat (10 gold), a Santa Hat (20) or a Pumpkin helmet (30), bought once for every class, and each class picks which one it wears, over any colourway. **Weapons** are each class's own, three to buy for 15, 30 and 50 gold besides the one it starts with: the warrior a War Axe, a Hammer or a Fire Blade, the wizard an Ice Wand, a Bolt Staff or a Toxic Rod, the archer a Crossbow, a Fire Bow or an Ice Bow, and the healer, whose weapon is the potion it throws, a Haste, Might or Hex Vial. A weapon changes how the class and its attacks look (a wizard's spell takes its element, a crossbow shoots bolts, a potion splashes in its colour) and how it fights (below). Each item is shown on the class's sprite; once bought it is yours for good, and you can switch between the ones you own for free. Other sprites are planned.
- **Weapons in a fight:** every weapon deals the same damage per second as its class's first one, but feels different: the War Axe hits 1.5 times as hard and half again as slowly, the Hammer and Crossbow twice as hard at half speed, the Ice Wand and Toxic Rod three quarters as hard and a third faster. An elemental weapon does more: each boss is weak to one element (half again the damage) and resists another (a quarter less): the slime is weak to frost and resists poison, the ogre is weak to fire and resists storm, the dragon is weak to frost and resists fire. And each element leaves a status on the boss: fire **burns** it (another fifth of the blow over 3 seconds, refreshed by each fire hit), frost **chills** it (while it lasts, everyone's blows have 10% more chance to be critical), storm may **chain** (a fifth of its blows strike twice, with a second arc of lightning) and poison lays on **venom** (another fifth of the blow over 6 seconds, up to 5 stacks). Burn and venom land once a second as one number, orange for burn and green for venom, and earn the class that put them on its experience; a blow on the boss's weakness has an orange arrow up after its number, one it resists a grey arrow down. The statuses show as icons under the boss's plate and on the boss itself (flames, frost crystals, green drips); they only tick while someone is attacking, and every new boss or attempt starts clean. The healer's vials give the party an aura while that healer is standing: the **Haste Vial** makes everyone's attacks come 15% sooner, the **Might Vial** adds 30% to everyone's damage, and the **Hex Vial** makes the boss take 15% more from everything (its icon is on the plate); a healer on one of them deals half damage itself and never heals, and two healers on the same vial give it once. What an aura adds to the party's damage earns experience for the healer class, not for the one whose blow it was. The Heal Vial gives no aura; it heals. The shop's Weapons tab says what the weapon you click does.
- **Stations:** on the non-raid screen, three things on the rampart open the same panels as the sign, and light up under the pointer: the book on the table is the codex, the merchant's stall is the shop, and the training dummy is the skills and training. A big campfire burns in the middle of the rampart, its stones a third of the way up the floor, with its own wide pool of light at night.
- **The sign and the codex:** the sign shows a skull with the monsters slain, a coin with your gold (paid when a boss falls, more at higher stages and the more agents took part) and a star with skill points to spend (it opens the skills and training). Click the skull to open the codex, which lists how many of each kind you have slain; a kind you have not beaten yet shows as "???". Click the coin to open the shop.
- **Top-right corner:** your agents by status, each a pixel icon with its count on a badge (a red "!" for needing you, crossed swords for working, a green tick for done, a "Zz" for resting; a status nobody is in is left out), then a gear that opens the settings.
- **Settings and damage numbers:** the gear's menu has switches, saved with the rest of your progress. **Show damage numbers** (on by default) puts up each blow's damage in a pixel font as it lands, rising and fading off the monster; critical blows are gold and a size bigger, burn and venom orange and green. **Advance after a kill** (on by default) moves on to the next stage after each kill; turn it off to farm the stage you are on. (After a failed attempt the party farms anyway, until you press the next arrow.)

Full description of the design and how it is built: [`RECIPE.md`](RECIPE.md).

## Install

The repo is laid out like Herdr's config folder (`~/.config/herdr-app`): `layouts/`, `mods/`, `themes/`.

Clone the repo and copy the layout into Herdr:

```sh
git clone https://github.com/thanoslabs/herdr-idle.git
cd herdr-idle
./install.sh
herdr-app do layout.switch --name idle-rpg
```

`install.sh` copies the layout, theme and mod into `~/.config/herdr-app` (or `$HERDR_APP_HOME`), which is how Herdr expects layouts to be added. Run it again after a `git pull` to update. To remove the layout, delete `layouts/idle-rpg.json`, `layouts/idle-rpg.svg`, `themes/idle-rpg.json` and `mods/idle-rpg/` from that folder; your other layouts are untouched.

Alternatively, ask your agent inside Herdr to read `~/.config/herdr-app/AGENTS.md` and add the layout from this repo.

## Developing

- Edit the files in this repo, then run `./install.sh` to copy them into Herdr. Herdr reloads layouts and mods as they change; if a mod edit does not show, switch layouts away and back.
- Run `herdr-app check mods/idle-rpg` after every mod change, and `herdr-app status` to see errors.
- All the pixel art is generated: edit the grids in `tools/idle-rpg-sprites.py` and run `python3 tools/idle-rpg-sprites.py mods/idle-rpg/art`. It writes `art/` in folders by what a picture shows, then by what it is doing (`scene/`, `classes/<class>/<look>/walk/l.png`, `weapons/<class>/<weapon>/`, `hats/`, `monsters/<kind>/roar/`, `attacks/<what>/<variant>/`, `stations/`, `campfire/`, `light/`, `status/`, `icons/`, `effects/`, `font/`); `RECIPE.md` lists them. Re-running `./install.sh` replaces the installed `art/` whole, so no picture from an older install lingers.
- Herdr writes `gpui-kit.d.ts` and `jsconfig.json` into each mod folder; they are git-ignored.
- See [CONTRIBUTING.md](CONTRIBUTING.md) for branch, commit and release conventions.

## Layout

```
.
├── install.sh       # copies the layout into ~/.config/herdr-app
├── tools/           # idle-rpg-sprites.py: draws every PNG in art/
├── layouts/         # idle-rpg.json (the window), idle-rpg.svg (settings preview)
├── mods/            # idle-rpg/ (main.js, rules.js, mod.json, art/<entity>/…)
├── themes/          # idle-rpg.json
├── RECIPE.md        # the brief the layout is built from
├── preview.png
└── .github/         # CI, release and Renovate workflows
```

## License

[MIT](LICENSE)
