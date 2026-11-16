# Idle RPG: plan

Planning notes for growing this layout from a visualizer with a battle mode into an idle RPG. Steps 1 to 3 of the proposed order (bookkeeping, experience, and class skills with per-attacker cadence) are built, the colours, hats and weapons of step 4 (a shop selling colourways, hats and weapons), stages with a timer, exponential scaling and training (step 5, the first half of monsters getting tougher), monsters fighting back with HP, knockouts, wipes, healing and Health training (step 6), and weapon effects: each weapon's pace, elements with weaknesses and statuses, and the healer's auras (step 7), and 10-minute attempts with a 30-second knockout and a retuned curve (see Long attempts; its numbers are provisional); the rest is not. "Decided" items come from the repo owner; "Default" items were chosen while building and are constants in `mods/idle-rpg/rules.js`, easy to retune; "Proposed" items are suggestions that still need a yes.

## Principles

- **It stays a visualizer first.** Nothing needs clicking to keep progressing, and nothing rewards leaving agents running for no reason.
- **Progress never belongs to an agent.** Agents are short-lived, and the mod forgets one after a week. Progress belongs to the player and to the classes.

## Decided

### Player experience

- The player has their own experience and level. **Built.**
- What player levels unlock is **not decided yet** (parked).
- Default: the player earns the same experience as the class of whoever lands a blow, their own blows included (`PLAYER_XP_SHARE`, 1; see Stages for the rate). The player leads the raid.
- Default: going from level n to n + 1 costs `250 * n` XP (`PLAYER_LEVEL_XP`), no cap. Total XP is stored and the level derived from it.

### Class experience

- Each class (wizard, healer, warrior, archer) has its own level. **Built.**
- A class earns experience whenever it is equipped on an agent or on the player and that character attacks. **Built**, counting only blows that land.
- Class levels unlock stronger attacks, faster attacks, buffs and similar. **Built** as skill points (below); buffs not built.
- Default (changed with stages): per blow, by the share of the boss's HP it took, of what a whole kill at that stage is worth (`blowXp`; `STAGE_XP` 60 × `XP_GROWTH` 1.04^(stage-1)). Before stages it was 1 XP per point of damage; with damage growing exponentially that would make levels run away, so experience now follows the stage instead. Existing totals keep their meaning: levels and skill points derive from total XP exactly as before. Overkill counts only what lands.
- Default: going from level n to n + 1 costs `100 * n` XP (`CLASS_LEVEL_XP`), no cap. Everyone starts at level 1 with 0 XP.
- Default: several agents on one class each earn that class XP, so it levels faster. Intended.

### Skill points

- **Decided:** skill points are earned and spent per class: each class earns 1 point per class level gained (points earned = class level - 1), spent on that class's skills, which apply to every character with that class on, agents and the player alike. **Built**, with a skills panel opened from a star on the sign (points left to spend) and from the class line on a card.
- **Decided:** skills are generic for now, the same for every class. Class-specific perks are **not decided** (parked); `CLASS_SKILLS` in `rules.js` keeps a list per class so one can get its own without a rewrite.
- **Decided:** the player's own level still unlocks nothing.
- Default: three skills, Power, Haste and Crit (`SKILLS`).
- Default (changed with stages): Power adds 20% to the class's damage per rank (`POWER_BONUS`); it used to add 1 flat damage, which means nothing against exponential HP.
- Default: Haste shortens the time between one character's attacks by one 250ms tick per rank: 3s at rank 0, then 2.75, 2.5, 2.25, 2 and 1.75s at rank 5 (`ATTACK_TICKS`). Each gap is the rank's give or take up to 2 ticks at random (`ATTACK_JITTER`), never under 6 ticks (`MIN_ATTACK_TICKS`, so an attack and its impact have finished before the next starts).
- Default: Crit adds 5% chance per rank of a blow dealing double damage (`CRIT_CHANCE`, `CRIT_MULTIPLIER`), shown as a gold damage number (or, with damage numbers off, a small gold number on a pill) where it lands.
- Default: max rank 5 per skill (`MAX_RANK`), 1 point per rank (`RANK_COST`), 1 point per level (`POINTS_PER_LEVEL`).
- Default: Reset is free and refunds all of a class's points.

### Gold

- Gold on a kill. **Built**, shown on the sign. Awarded only when the boss is slain, not as damage is dealt.
- **Decided** (stages): gold per kill grows with the stage, slower than boss HP, so training stays affordable. Before stages it was 1 gold per 100 HP.
- **Owner's decision** on whether more agents should mean faster progress: "I would say more agents does lead to faster progress naturally due to more damage sources." Before this, one agent kept pace with three (a kill's gold was fixed while training is per class). **Built** as gold × attackers: a kill pays `floor(ATTACKER_GOLD × attackers × GOLD_GROWTH^(stage-1))` = `floor(0.5 × attackers × 1.12^(stage-1))`, at least 1 (`stageGold(stage, attackers)`). Default: the attackers are everyone attacking on the tick the boss fell (the working agents, and you when you join in), counted before the blows land, at least 1, capped at `MAX_GOLD_ATTACKERS` (20) so a crowd cannot inflate gold; `ATTACKER_GOLD` 0.5 replaces the old flat 2, so the usual party of three agents and you (4) earns exactly what it did (2 at stage 1, 5 at 10, 30 at 25, 516 at 50) and keeps its times. Time to first clear, stages 10 / 25 / 50 (median of 5 seeds; policies as below; **30-second era**, superseded by Long attempts):

  | Agents | (a) presses next after each training buy | (b) presses next every 10 min of fighting |
  |---|---|---|
  | 1 | 26.4m / 3.0h / 2.2d | 23.8m / 2.7h / 2.1d |
  | 3 | 16.3m / 2.3h / 1.4d | 13.4m / 1.9h / 1.4d |
  | 6 | 2.8m / 1.1h / 14.2h | 2.8m / 58.2m / 13.7h |

### Monster HP

- Before stages: HP by kind, slime 100, ogre 300, dragon 500. **Replaced** by HP by stage (see Stages).
- Gold buys customisation (colours, hats, weapons) and, since stages, Attack training.

### Stages, the timer and training (built)

The owner's decisions, verbatim where quoted:

- **Decided:** "I think we add a timer, and the goal is to push stages. Each stage bosses, get stronger and more health, thus we have to keep upgrading classes to keep up (like a traditional idle game). If the team wipes or the time runs out, it just resets the current stage. (the user has the option to switch between all progressed stages to 'farm' up and get stronger as well."
- **Decided:** "we will have to match the party growth somewhat to the monster growth, but as with traditional idle games it shouldn't be a matching growth factor (the further you progress, the longer it should take naturally)." AFK-style idle games are the model: "stats and hp grow exponentially".
- **Decided:** stats belong to the class, never to an agent (agents are short-lived).
- **Decided:** the fight is always against the boss of a stage, numbered from 1; killing it within the time limit clears it; the highest stage reached is remembered. Kinds cycle with the stage (slime, ogre, dragon), so the dragon is every third stage.
- **Decided:** each attempt has a time limit, on the boss's name plate, running only while the fight is on (raid on, someone attacking, boss alive), so it pauses while nobody works. Nothing is lost but the attempt (the experience its blows earned is kept and saved, once).
- **Owner's decision** (replacing "the same boss back at full HP"): "a failed stage maybe sends you back to the previous stage (one that was clear-able), assuming the player will farm up and attempt the latest stage when they are stronger". **Built:** a failed attempt (time out; a party wipe will take the same path, `failStage` in `rules.js`) at stage n > 1 moves the fight to stage n − 1 with a fresh attempt; at stage 1 it restarts stage 1. `best` is unchanged. The party is then farming (`farming`, its own flag, not the setting): kills repeat the stage whatever "Advance after a kill" says, until the player picks a stage (the next arrow, which pulses while farming), which ends it. The note says where the party went ("Time's up! Back to stage 8") and the plate shows a small "farm" tag by the stage number. Default: `farming` is saved with the stage, so reopening the layout does not silently resume pushing into the wall.
- (**30-second era**: the tables in this section were made with 30-second attempts and the constants then; see Long attempts for the current ones.) Simulation with this (made before gold × attackers, below under Gold, which changes the 1- and 6-agent rows), median of 5 seeds, time to first clear: (a) a player who presses next after every training level bought; (b) one who trains but presses next only every 10 minutes of fighting; (c) fully hands-off (never trains, never presses next):

  | Policy | Agents | Stage 10 | Stage 25 | Stage 50 | Best after 8 days |
  |---|---|---|---|---|---|
  | a | 1 | 19.7m | 2.2h | 1.4d | 51 |
  | a | 3 | 16.3m | 2.3h | 1.4d | 51 |
  | a | 6 | 4.9m | 1.4h | 19.1h | 51 |
  | b | 1 | 14.5m | 1.7h | 1.5d | 51 |
  | b | 3 | 13.4m | 1.9h | 1.4d | 51 |
  | b | 6 | 12.3m | 1.2h | 19.1h | 51 |
  | c | 1, 3, 6 | never | never | never | 4, 6, 9 |

  (a) is the earlier tuning's figures, so the constants are unchanged. (b) is no slower: pressing on less eagerly wastes fewer 30s attempts. (c) farms its last clearable stage for good and banks gold (265K to 539K after 8 days) for the player to spend.
- **Decided:** the player can pick any stage up to the highest reached, with pixel arrows beside "Stage N" on the plate (dead at 1 and at the highest reached); a setting "Advance after a kill" (default on) decides whether a kill moves on or repeats the stage. Changing stage starts a fresh attempt.
- **Decided:** damage is a class stat, `base × level bonus × training bonus × Power`, for every character on the class, the player included. Class levels derive from total XP exactly as before. Training is a repeatable gold upgrade per class, "Attack", at an exponentially rising price, in a Training section of the skills panel (which the training dummy opens). Power is a percentage per rank. Damage and HP are real numbers, shown rounded and shortened (1,234 as "1.2K", then M, B, T) in the pixel font, which gained K, M, B, T and a point.
- **Owner's decision:** "on the initial defeat of a stage, there should be a countdown indicating when the next stage will be starting 'moving to next stage in ...'. If a user is farming a stage (i.e playing a previous stage), this does not apply." **Built:** after the kill that first clears a stage and moves on to it (the one that raises `best`), the wait is 5s (`ADVANCE_MS` in `main.js`, default) and "Moving to stage 13 in 3" over the plate counts it down, re-drawn by the existing 1s watch (no timer of its own). Not while farming, with "Advance after a kill" off, or replaying a stage below the best: those keep the 3s wait and no note. Picking a stage cancels it; the clear is already booked and saved on the kill.
- **Decided:** the 9-second wait between monsters became 3 seconds (`RESPAWN_MS`): the fade takes 1.6s and nothing else depended on it.
- **Built.** Defaults (constants in `rules.js`, tuned with a simulation):
  - Boss HP `STAGE_HP × HP_GROWTH^(s-1) × s^HP_POWER` = 50 × 1.175^(s-1) × s^0.75 (50, 99, 157, … 1.2K at 10, 27K at 25, 2.5M at 50). The `s^0.75` factor makes the first stages steeper, so a fresh party has to start growing within a few stages rather than clearing the first seven for free and then hitting a wall; in the long run HP grows 1.175× a stage.
  - Time limit `STAGE_MS` 30s for every stage (now 10 minutes, and every constant in this list retuned: see Long attempts) (`stageTime` is where a longer one for dragons would go).
  - `BASE_DAMAGE` 10; level bonus `1 + 0.12 × (level - 1)` (`LEVEL_BONUS`, additive so levels cannot run away); Power `1 + 0.2 × rank`; Attack training `1.12^level` (`TRAINING_BONUS`) at `floor(3 × 1.25^level)` gold (`TRAINING_PRICE`, `TRAINING_PRICE_GROWTH`: 3, 3, 4, 5, 7, … 27 for the 11th, 260 for the 21st).
  - Gold `floor(0.5 × attackers × 1.12^(s-1))` (see the decision below; it was `floor(2 × 1.12^(s-1))` for any party when this table was made, the same for 4 attackers); kill XP `60 × 1.04^(s-1)`, shared out by damage.
  - Haste and Crit unchanged. `MAX_STAGE` 1000 and `MAX_TRAINING` 1000 cap what a save is believed to hold.
- **Simulation** (a headless Node script playing `rules.js` as `main.js` runs a fight: the 250ms clock, per-attacker rhythms, the timer, the 3s respawn; median of 5 seeds; you, a healer, join every party; agents' classes cycle warrior, archer, wizard, healer). Policy: always push; spend gold on Attack training for the classes in use, cheapest first; spend skill points on the rank that raises damage per second most; after a failed attempt, drop back a stage and farm until a training level is bought, then push again. Time of fighting to first clear each stage from a fresh save:

  | Stage | 1 agent | 3 agents | 6 agents | 1 agent alone (you not joining) | 3 agents, never training |
  |---|---|---|---|---|---|
  | 1 | 8s | 5s | 3s | 15s | 5s |
  | 2 | 27s | 18s | 12s | 49s | 18s |
  | 3 | 53s | 34s | 23s | 2.2m | 34s |
  | 5 | 2.9m | 1.4m | 54s | 5.7m | 1.4m |
  | 10 | 19.7m | 16.3m | 4.9m | 19.9m | 38.7m |
  | 15 | 42.8m | 45.4m | 20.5m | 35.3m | 3.2h |
  | 20 | 1.3h | 1.4h | 50.1m | 1.2h | 1.0d |
  | 25 | 2.2h | 2.3h | 1.4h | 2.3h | 7.0d |
  | 30 | 3.8h | 3.8h | 2.3h | 4.0h | not in 8 days |
  | 40 | 11.8h | 11.8h | 6.5h | 12.2h | |
  | 50 | 1.4d | 1.4d | 19.1h | 1.5d | |

  With 3 agents each later stage takes longer than the one before on average (about 15s at stage 2, 5–7 minutes around 10, 15–20 minutes around 25, 3–4 hours around 50), and progress goes on: stage 60 after about 3.9 days, 70 after 10.5, 80 after 28. A party that never trains slows to about a day a stage around 20 and stalls at 25–26 within a week; only levels carry it. Because gold and experience are per class, one agent on one class keeps pace with three agents spread over four classes (it gets all the gold and XP); six agents are about twice as fast late on.

### Customisation shop

- **Decided:** colours first, then hats and alternate sprites. **Colours built**, sold as "Armours": a shop opened from the gold on the sign, with the kinds of item down its left side (Armours, Weapons, Hats, and room for more). **Owner's decision:** the shop is laid out by category this way because much more is planned for it. **Hats built** (below). **Weapons built** (below): bought, worn and seen, and since step 7 each fights its own way (see Weapon effects). Alternate sprites are **not built**.
- Default: a look belongs to a class, not to an agent (agents are short-lived and forgotten after a week). Every character with that class on, agents and the player alike, wears the colourway the class has equipped.
- Default: each class has its default colourway (free, always owned) and three more to buy, priced 5, 10 and 20 gold (`COLOUR_PRICES`). Buying is permanent; an owned colourway can be equipped and swapped freely at no cost. No refunds, no selling.
- Default: buying a colourway also puts it on (one click; the default or any other owned one is a free click away).
- Gold can never go negative; a purchase that cannot be afforded does nothing (the Buy button is dimmed).
- **Owner's decision:** the codex, the shop and the skills are also reachable between raids, from stations on the rampart: a book on the table (codex), a merchant's stall (shop) and a training dummy (skills; the dummy was my pick, a **default**). **Built.** Starting or ending a raid closes whichever panel is open.
- **Owner's request:** a campfire in the middle of the non-raid screen. **Built:** scenery, not clickable, drawn among the characters by depth, kept clear of the stations, with its own pool of light at night. **Owner's follow-up:** three times bigger, its base a third of the way up the plank floor. **Built:** redrawn at 52×43 art px (216×180 on screen) with its feet at floor y 100, a fourth flame, a wider light pool (320px pictures), and the walk and default spots kept out of its stones.
- Colourways are palette swaps in `tools/idle-rpg-sprites.py` (`LOOKS`) of every picture a class has, drawn into `art/classes/<class>/<id>/`; the default's are in `art/classes/<class>/default/`. The catalogue (`SHOP` in `rules.js`) has one entry per kind of item with a list per class, and the state keeps owned and equipped per class per kind; hats were added as another kind this way, marked `shared` so that what is owned is kept once for every class.

#### Hats

- **Owner's decision:** hats are customisations that are not locked to a class (a jack-o'-lantern helmet, a party hat, a Santa hat), and buying a hat unlocks it to be worn by any character: bought once, owned by all four classes. **Built.** Ownership is kept once, in the state's `hats`, not per class.
- Default: which hat is on stays per class, like armours: every character with a class on wears the hat the class has picked (`looks.<class>.hat.equipped`), so each class can wear a different owned hat, or the same one. Buying also puts it on the class shown in the shop; the others pick it for free.
- Default: three hats, the same for every class: Party Hat (10 gold), Santa Hat (20) and Pumpkin (30) (`HAT_PRICES`), plus "No hat" (free, always owned): the class's own headgear.
- Default: hats and armours combine freely; a hat covers only the head, so it looks the same over every colourway.
- Default: hats are drawn as overlay layers: for each hat, class and picture, a see-through PNG the size of the picture it lies on (`art/hats/<id>/<class>/<frame>.png`), so the mod lays one image over the other with no anchor sums. The generator pushes each hat through the same canvas, lean, shear and mirror as the body, so it follows the head when walking and dangling, and in the healer's mirrored fighting poses.
- Default: each hat is drawn per class, because every head sits in its own place and three classes wear their own headgear: it covers the wizard's hat entirely, sits over the warrior's plume and the archer's cap and feather, and replaces the top of the healer's hood. The party and Santa hats leave the face showing; the jack-o'-lantern is a helmet over the whole head, with a carved face.
- Default: the shop's Hats tab shows the chosen class wearing each hat over the armour it has on, says "Bought once, for every class" under the kinds, and the armour previews show the class's hat too.

#### Weapons

- **Owner's request:** variety in the weapons the shop sells: for warriors different swords, hammers and axes; for mages wands and staffs of different elements; for archers bows and crossbows, maybe arrows carrying different elements; for clerics (the healer) different potions, as buffs to the raid party or debuffs to the boss.
- **Decided:** weapons first, in two iterations: the first made weapons you can buy, wear and see, with no gameplay effect; the second (step 7, Weapon effects below) their stats, elements, weaknesses, statuses and the vials' auras. **Both built.**
- Default: weapons are each class's own, like armours: owned and held per class (`looks.<class>.weapon`), and ids repeat across classes (the warrior's `flame` is not the archer's). Every character with a class on holds the weapon the class has equipped. Buying also puts it on; the others are a free click away.
- Default: each class's first weapon is the one it always had (free, always owned, drawn exactly as before), and three more cost 15, 30 and 50 gold (`WEAPON_PRICES`).
- Default catalogue (`WEAPON_NAMES` in `rules.js`), chosen while building; names are cut to fit the shop's 51px tiles:
  - Warrior: Sword (`default`), War Axe (`axe`), Hammer (`hammer`), Fire Blade (`flame`, fire).
  - Wizard: Fire Staff (`default`, fire: its staff and fireball), Ice Wand (`frost`, frost), Bolt Staff (`storm`, storm), Toxic Rod (`venom`, poison).
  - Archer: Longbow (`default`), Crossbow (`crossbow`), Fire Bow (`flame`, fire arrows), Ice Bow (`frost`, frost arrows).
  - Healer: its "weapon" is the potion it throws (it keeps its staff): Heal Vial (`default`, potion `heal`, green), Haste Vial (`haste`, yellow), Might Vial (`might`, red), Hex Vial (`hex`, purple).
- Default: every weapon carries `{ id, name, price, element }`, `element` one of `null`, `fire`, `frost`, `storm`, `poison` (`ELEMENTS`), and the healer's a `potion` tag (`POTIONS`: heal, haste, might, hex), which `effects.js` reads (see Weapon effects).
- Default: a weapon is a layer of its own, like a hat: for each class, weapon and picture a see-through PNG the size of the picture it lies on (`weapons/<class>/<weapon>/<frame>.png`), drawn over the body and under the hat; the body pictures are drawn without the weapon. The healer's layer is the potion it holds up as it winds up, so it has only those two pictures. The outline is split so the default weapon over the body is the old picture pixel for pixel. A weapon keeps its own colours whatever the armour (before, the warrior's blade and the wizard's orb took the armour's colours).
- Default: each weapon's attack looks like it (`attackArt`): the wizard's spell and its burst by element (fireball, ice shard, lightning bolt, venom glob), fire and frost arrows and a crossbow bolt, each potion and its splash in its colour, and the warrior's slash broad for the axe, a crunch for the hammer and orange for the Fire Blade.
- Default: the shop's Weapons tab shows the class winding up with each weapon (where every weapon, and the healer's potion, shows best), in the armour and hat it has on; the armour and hat previews hold the class's weapon.

### Weapon effects (built)

The owner's decisions: weapons "can have their own stats tied to them, and some can have elemental bonuses or have status effects"; "small tradeoffs, i would say keep the DPS the same, but trade off each others damage/attack speed so there is variation between the weapons"; the Heal Vial stays as it is; and "Each class can have its stats computed based on what is equipped (since agents are ephemeral, it doesn't make sense to make it granular to the agents themselves)": effects belong to the class's equipped weapon and stack with its skills. The proposal below was shown and not objected to; the aura numbers were then set by the owner (Might +30%, Haste 15% off the gap) after the first party simulation. Every number is a constant in `mods/idle-rpg/effects.js` (plain functions, no host calls, imports only `rules.js`).

- **Weapon stats (built):** a weapon multiplies both the damage of a blow and the gap between attacks by its factor (`WEAPON_FACTORS`), so damage per second is the class default's. Gaps are real numbers of ticks and the fractions carry (the next attack is due a gap after the last was *due*), so long-run damage is exactly equal; a fast weapon whose gap would go under `MIN_ATTACK_TICKS` is held there and its damage raised to match. Each gap is its mean ± up to 2 ticks (`GAP_JITTER`), evenly.

  | Class | ×1 | other |
  |---|---|---|
  | Warrior | Sword, Fire Blade (a sword) | War Axe ×1.5, Hammer ×2 |
  | Wizard | Fire Staff, Bolt Staff (a staff) | Ice Wand ×0.75, Toxic Rod ×0.75 (wands) |
  | Archer | Longbow, Fire Bow, Ice Bow (longbows) | Crossbow ×2 |
  | Healer | every vial (a throw is a throw) | |

- **Elements (built):** each boss kind is weak to one element (×1.5, `WEAK_FACTOR`) and resists one (×0.75, `RESIST_FACTOR`): slime weak to frost, resists poison; ogre weak to fire, resists storm; dragon weak to frost, resists fire (`WEAKNESS`; **decided** to stay until the new monster kinds reshape it). Each element puts a status on the boss: fire **Burn** (`BURN_SHARE` 20% of the blow over 3s, `BURN_TICKS`; each class's own; another fire hit adds its share to what is left and restarts the 3s), frost **Chill** (everyone's crit chance +10%, `CHILL_CRIT`, on the 16 ticks after the hit's, 4s, `CHILL_TICKS`; refreshed by each frost hit), storm **Chain** (20%, `CHAIN_CHANCE`, that the blow strikes twice, the second the same as the first), poison **Venom** (20% of the blow over 6s, `VENOM_SHARE`, `VENOM_TICKS`; at most 5 stacks from anyone, `VENOM_STACKS`, a sixth replacing the one with least left). Burn and venom are shares of the blow that applied them (crit and Might in; the weakness and Hex apply as they tick), so they grow with damage, and they are credited to the class that put them on, even after its characters have left. Every damaging element is +20% on a boss neutral to it (Burn and Venom were 25% in a first draft, which made the Bolt Staff strictly worse than the free Fire Staff).
- **Statuses** live in memory with the boss (nothing is saved, no version bump): every new boss, failed attempt, kill and the raid's end clears them. **Decided:** they tick only while the attack clock runs with someone attacking a live boss, like the attempt's time, and freeze otherwise.
- **Potions (built):** a healer on the Haste, Might or Hex Vial gives the party an aura while it is standing in the fight (a knocked-out healer gives none): **Haste**, every gap 15% shorter (`HASTE_AURA_SHARE`, the floor still applying); **Might**, +30% to every blow (`MIGHT_BONUS`); **Hex**, the boss takes +15% from everything, damage over time included (`HEX_BONUS`). The healer giving it deals half damage itself (`AURA_HEALER_DAMAGE`) and never heals. **Experience (decided after review):** what an aura adds is the healer's doing, so that share of each blow's and each burn and venom tick's experience goes to the healer class (`shares` in `effects.js`): Hex's added share first (0.15/1.15), then Might's of what is left (0.3/1.3), then of a hasted attacker's the share of its blows Haste adds (15%, less where the floor holds); the attacker keeps the rest and the healer's own half-damage blows are its own. A kill's total experience is unchanged. Without it the healer class fell far behind the others once weapons were in (see Pacing). Several healers on one vial give its aura once; different vials all count. The Heal Vial gives none.
- **Shown:** a damage number on the boss's weakness has an orange arrow up after it, one it resists a grey arrow down (`effects/marks/`); burn and venom land once a second (as the attempt's seconds turn, drawn then anyway, with one more render on the next tick to start the number's fade), one summed number per class and status, in ember and green (two more font colours); a chained blow's second number sits at the end of a second arc of lightning (`effects/chain/arc/`). Under the boss's plate a row of icons (burn, chill, venom with its stacks, hex) appears while any applies; on the boss itself, a few small pictures around its bulk, more on a bigger boss: flames flickering, frost crystals and a twinkle, green drips, one per venom stack (native loops only). An aura healer shows its vial's icon by its HP bar. The shop's Weapons tab shows two lines on the weapon clicked (the one on until then), `shopLines`: its name and pace, or at normal speed its status or aura ("Fire Bow: Burn: +20% in 3s"), then the rest ("Normal speed · Weak: ogre · Resist: dragon"), every one of the 16 tested to fit the 210px column at size 10 in Geist. The shop panel is built from fixed rows like the skills panel (167px); its class tabs show the sprite, the class picked 80px wide with its name, the others' names in tooltips (four names beside four sprites were cut short).
- **Balance** (`effects.js` headless, 400k ticks a cell; damage per second against the class's default, plain ×1 weapon in brackets for the wizard, whose default is the Fire Staff): plain weapons 1.00 everywhere; Fire Blade and Fire Bow 1.20 / 1.80 / 0.90 on slime / ogre / dragon; Ice Bow 1.65 / 1.10 / 1.65; Ice Wand 1.37 (1.65) / 0.61 (1.10) / 1.83 (1.65); Bolt Staff 1.00 (1.20) / 0.50 (0.90) / 1.33 (1.20); Toxic Rod 0.75 (0.90) / 0.67 (1.20) / 1.33 (1.20). Nothing passes 2×. In a party of three attackers (Fire Staff, Sword, Longbow) and the healer, the whole party's damage with the healer's vial against the Heal Vial (healing not counted): Might 1.13–1.16, Haste 1.02–1.05, Hex 1.00–1.03 (slime, ogre, dragon); two healers on Might and Hex 1.19–1.24.
- **Pacing** (**30-second era**; the monster-attacks simulation with effects, `effects-work/sim3.mjs`: 3 agents, warrior, archer and wizard, and you as the healer, 3 seeds, the stages constants not retuned; time to first clear, then class levels at stage 51, warrior / archer / wizard / healer, and knockouts over the run):

  | Setup | 10 | 25 | 50 | levels at 51 | healer vs the others | knockouts |
  |---|---|---|---|---|---|---|
  | no weapon effects | 24.0m | 3.6h | 2.14d | 108 / 103 / 99 / 89 | −14% | 1,267 |
  | default weapons (the Fire Staff burns) | 21.6m | 3.4h | 1.79d | 91 / 86 / 119 / 71 | −28% | 2,117 |
  | one loadout (Fire Blade, Ice Bow, Fire Staff) | 14.4m | 2.8h | 1.45d | 109 / 75 / 97 / 46 | −51% | 5,245 |
  | the best weapon for each kind, Heal Vial | 13.1m | 2.6h | 1.39d | 90 / 93 / 88 / 35 | −61% | 6,887 |
  | best weapons, you on the Might Vial | 10.1m | 2.6h | 1.28d | 79 / 77 / 72 / 80 | +5% | 6,091 |
  | best weapons, Haste Vial | 11.6m | 2.5h | 1.32d | 84 / 84 / 78 / 64 | −22% | 6,217 |
  | best weapons, Hex Vial | 13.4m | 2.6h | 1.33d | 85 / 85 / 78 / 62 | −25% | 6,269 |
  | best weapons, Might, auras' experience all to the attacker (before the fix) | 9.7m | 2.3h | 1.24d | 89 / 90 / 82 / 19 | −78% | 7,707 |

  Weapons make the push up to about 1.7× faster to stage 50. Crediting the auras' share to the healer brings an aura healer back near the others (Might +5%, Haste and Hex about −22% and −25%, which raising those two auras would close). Knockouts rise 4–6× with weapons, and not only from the healer's level (they stay high with the healer on Might at the others' level, and Health training is the same, 40–43 everywhere): the whole party reaches each stage sooner, with fewer kills behind it, so at lower class levels (about 80 against about 100 at stage 51), and max HP grows with the class level. Wipes stay at 0.
- **The Heal Vial healer still lags** with weapons on (−51% to −61%, −28% even with default weapons), since it earns by its heals and its own blows, both sized by its own damage, while the others' blows grow with their weapons, elements, burn and chill. Heals are unchanged as asked. What I would change: size a heal's experience by the party's average blow rather than the healer's own, or credit a Heal Vial healer a share of the experience of the blows dealt by those it kept standing.
- **Open (for the owner):** (1) Hex (+15%) and Haste (15%) are barely worth the healer's lost damage in a party of three attackers and the healer (+0–5%); about +25% would make Hex worth carrying there. (2) No boss resists frost, and nothing is weak to storm or poison. (3) The wizard has no plain weapon, so its bought weapons can be worse than its free Fire Staff on some bosses (the Bolt Staff on the ogre is 0.50×). (4) Weapons are switched by hand; a player who re-equips for each boss kind gains about 10% more than one fixed loadout.

### Kill counts

- Keep a count of each type of monster slain, not just the total. **Built**: saved, and shown in the codex that opens from the kill count on the sign. Not used for anything else yet.

### Monsters fighting back (built)

The owner's decisions, verbatim where quoted: "each agent has a hp bar, monster attacks can be single-target (random out of the attacking agents) or multi-target (target a random attacking agent, and it will hit surrounding area). If the HP bar reaches zero, the agent stops attacking and needs to rest to heal up (something like a 30s cooldown). Clerics can also heal agents, and maybe a future iteration can include revives to bring agents back." And: "If the team wipes or the time runs out, it just resets the current stage" (since refined: a failed attempt drops back a stage to farm, see Stages; a wipe takes that same path).

- **Built** in `mods/idle-rpg/party.js` (plain functions, no host calls, run from the attack clock's tick: no timer of its own), with the stats in `rules.js`.
- **Who can be hit:** only characters attacking: working agents in the fight, and you while you fight beside them. Idle, blocked and done agents never are; their status bubbles show as before.
- **HP** is per character and in memory only (nothing per agent is saved). Default: max HP is a class stat, `CLASS_HP` (wizard 100, healer 100, warrior 200, archer 130: the warrior at the monster's feet the most) × the class level's bonus (`LEVEL_BONUS`, as for damage) × `HEALTH_BONUS`^Health (1.2 a level). An agent that stops working leaves the fight; coming back it starts at full HP.
- **Health training (decided):** a gold training beside Attack, on the same price curve (each kind's price follows its own level), stored as `training: { <class>: { attack, health } }`. Version 7 of the state; versions 1 to 6 load with Health 0.
- **The boss's attacks** (defaults in `party.js`): about every 4s (`MONSTER_ATTACK_TICKS` 16 ticks ± 2), the first of an attempt within its first gap (from 1s). One to three single blows (`SINGLES_BETWEEN`, evenly, drawn as the party forms and for each new attempt) at a random attacker, then an area attack: a red ring marks the floor round a random attacker for 1s (`AREA_WARNING_TICKS`), then everyone standing inside it is hit: 70px either side and half that up and down the floor (`AREA_RADIUS`, `AREA_DEPTH`, drawn the same). Warriors bunched at its feet get hit together. Each kind looks its own: the slime spits a glob (single) or squashes and lobs one that splashes over the ring; the ogre swings its club, a gust flying at the target, or heaves it overhead and slams the ground cracking under the ring; the dragon bites, claw marks opening on the target, or breathes a fireball that bursts into a blaze across the ring.
- **Damage (default):** one blow is `stageDamage(s)` = `STAGE_DAMAGE × DAMAGE_GROWTH^(s-1) × s^DAMAGE_POWER` (4 × 1.22^(s-1) × s^0.75) on a party of 4 (`PARTY_SIZE`), × (n/4)^1.5 (`SCALE_POWER`) for n standing attackers, so one or two agents are not wiped in one go.
- **Knockout:** at 0 HP a character stops attacking for 10s (`KO_TICKS`), lying on its back, head away from the monster, with stars circling and a gold bar running down its rest, then gets up at full HP. It never shows the idle "Zz": a knocked-out agent is still working (the corner still counts it as working). Everyone, the knocked out too, is back at full HP for each new attempt: a new boss after a kill, a picked stage, a failed attempt.
- **Wipe:** a blow that knocks out the last one standing fails the attempt through the same path as the timer (`fail()` → `failStage`): "Wiped! Back to stage 8", saved once.
- **Healing:** a healer holding the Heal Vial heals instead of attacking whenever an attacker (itself included) is below 60% HP (`HEAL_BELOW`): its potion flies to the one lowest for its max and restores `HEAL_SHARE` (25%) of the healer's own max HP (`healOf`), a green plus rising off it. At the impact it heals whoever is lowest then (the one it aimed at may have left, fallen or been topped up), if anyone still qualifies and it still holds the Heal Vial; otherwise the throw is an ordinary blow. Two healers on one tick pick different allies while another qualifies. The other vials never heal.
- **Default: a heal earns experience.** The healer's class gets what one of its blows would earn on the boss then (`blowXp` of its damage, so the stage's rate), times the share of the heal that was needed; you get the same, as for a blow. Without it the healer's class fell far behind (level 47 against about 115 in the simulation) and its heals and HP with it; with it, 89 against about 105.
- **Default: gold counts everyone in the fight** (`fighters()`), knocked out or not, so a knockout does not also cut a kill's gold (`stageGold(stage, attackers)` from stages). The knocked out cannot be healed; **revives** are a later iteration.
- **Superseded** (see Long attempts: the owner set it to 30s with a counter). **Default that differed from the owner's first number:** the rest was 10s (`KO_TICKS` 40 ticks), not "something like a 30s cooldown". With a 30s rest inside 30s attempts, and everyone up for each new attempt, a knocked-out character practically never got up (26 of 4,636 rests ran out in the simulation): the rest bar was theatre. A third of an attempt brings characters back mid-fight. The owner is to be told.
- **Deviation from the brief, with reason:** heals are a share of the healer's max HP, not of its damage: in the simulation a heal by damage let a party that trained only Attack heal its way through, so Health would not matter.
- **Simulation** (**30-second era**, superseded by Long attempts; `rules.js` and `party.js` played headlessly as `main.js` runs them, median of 3 seeds, you joining as a healer, gold by everyone in the fight, the 10s rest, heals earning experience, the stages rule for a failed attempt and a player who presses next after every training bought). Time to first clear:

  | Party | 10 | 25 | 50 | wipes / failed attempts | KOs per attempt at 20 / 30 / 40 |
  |---|---|---|---|---|---|
  | 3 agents, the boss harmless (the stages pace) | 15.6m | 2.3h | 1.48d | 0 / 221 | – |
  | 3 agents, training Attack and Health evenly | 23.5m | 3.5h | 2.12d | 0 / 454 | 1.2 / 0.7 / 0.0 |
  | 3 agents, Health only after a knockout | 23.8m | 3.4h | 2.02d | 0 / 437 | 0.8 / 0.2 / 0.0 |
  | 3 agents, Attack only | 22.1m | 4.1h | 2.43d | 215 / 390 | 4.0 / 4.9 / 3.0 |
  | 3 agents with no healer, Attack only | 22.4m | 5.9h | 3.32d | 381 / 439 | 2.7 / 1.0 / 0.9 |
  | 3 agents with no healer, both | 26.0m | 3.7h | 2.35d | 0 / 373 | 0.6 / 0.3 / 0.1 |
  | 6 agents, both | 9.2m | 1.9h | 1.04d | 0 / 375 | 4.8 / 5.0 / 3.2 |
  | 1 agent, both | 32.5m | 4.4h | 2.86d | 0 / 271 | 0 |
  | a lone healer, Attack only | 28.6m | 10.6h | not in a week (40) | 91 / 126 | 0 / 0 / 1.0 |

  Training both is about 1.4× slower than without a fighting boss (mostly the gold Health takes). Knockouts come about once an attempt at the stage being pushed early on, rarer later as the healer (now levelling with its heals) keeps up; with the 10s rest about 60% of the knocked out get up again within their attempt. A party that skips Health wipes on most failed attempts and falls behind, by about 15% at stage 50 with a healer and 40% without; once every blow knocks someone out the party still lives a few of the boss's blows into each attempt, so the gap stays bounded.
- **Open (for the owner):** (1) letting knockouts last over a kill into the next boss's attempt makes Health matter far more (in the earlier run, Attack only reached stage 30 at 14.9h against 7.5h and not stage 50 within a week), but the current rule is that everyone is up for each new attempt; (2) a boss that hits harder as the attempt goes on (damage × (1 + 2 × elapsed / attempt length)) was simulated and does not make Health matter more: both 27.3m / 3.9h / 2.17d, Health as needed 28.3m / 3.9h / 2.35d, Attack only 26.0m / 3.9h / 2.25d (208 wipes in 371 fails), with knockouts 2–3 an attempt; (3) a lone character is hardly ever knocked out (the boss hits a lone attacker at an eighth of its party damage), so a lone Heal Vial healer that trains Health is never knocked out either.

### Long attempts (built; numbers provisional)

The owner, asked how long the boss timer is (30s): "I would say set it to 10min, and we can set the death delay to 30s with a counter on the agent, we should add a sprite for this if not already for each class." Then, after a long tuning search: "stop tuning now. Lock in the best set of constants you have so far", to be played and adjusted in a follow-up. **Every number below is provisional.**

- **Built:** `STAGE_MS` 10 minutes; the plate shows minutes and seconds ("9:42", `clockText` in `rules.js`, seconds rounded up) and the time bar runs over the 10 minutes (the plate is 144px wide now, 136px bars, so "Stage 99 farm … 10:00" fits). The time still runs only while someone attacks. `KO_TICKS` 120 (30s). A knocked-out character keeps its rest bar and gets a gold pixel-font number right of it counting down whole seconds (`restSeconds` in `party.js`). All countdowns turn together on one beat (`koBeat` in `main.js`): the tick the plate's seconds turn, or every 4 ticks while the time stands still, never two beats within a second, so any number of knocked-out characters cost at most one render a second, shared with the plate's. 30 as it falls, gone as it rises or the attempt ends.
- **The knocked-out sprite** already existed for every class, colourway, weapon and hat (`down/l`, `down/r`, checked by CI); it reads well with the number beside it (checked on a mock-up of all four classes, with and without a hat). Unchanged.
- **Retune** (rules.js / party.js; before → after): `STAGE_HP` 50 → 900, `HP_POWER` 0.75 → 0 (`HP_GROWTH` 1.175 kept); `STAGE_DAMAGE` 4 → 5, `DAMAGE_GROWTH` 1.22 → 1.175, `DAMAGE_POWER` 0.75 → 0.5; `HEALTH_BONUS` 1.2 → 1.12; `HEAL_SHARE` 0.25 → 1; `SCALE_POWER` 1.5 → 1; `GOLD_GROWTH` 1.12 → 1.23 (`ATTACKER_GOLD` 0.5 kept); `TRAINING_PRICE` 3 → 5, `TRAINING_PRICE_GROWTH` 1.25 → 1.45; `STAGE_XP` 60 → 400, `XP_GROWTH` 1.04 → 1.03; then (after review) `STAGE_XP` replaced by `ATTACKER_XP` 200 per attacker (below). No formula changed shape. Why:
  - With 10 minutes the clock almost never decides a push: the limit is surviving. Damage now grows like HP and Health like Attack (1.12 a level), so a party that trains both evenly meets much the same fight at every stage and one that skips Health falls behind steadily.
  - A party with no Health still gets about 13s before it is wiped (four blows), and when it farms low it kills far more often; with gold growing slower than HP (as before) it out-earned a balanced party and reached stage 50 sooner. Gold now grows a little faster than HP, so farming far below the limit pays less; the reviewer measured gold a second peaking 3–5 stages below the party's limit (2.7 against 0.97 at the limit, at stage 25) and only falling behind from about 15 stages down. Training's price grows faster still (1.45), so stages keep getting slower.
  - Kills are rarer (minutes, not seconds), so experience per kill is much higher; the HP power is gone because the early stages are the clock's (no threat), and long-but-not-steep early bosses keep stage 10 near 15 minutes. The damage power keeps early blows harmless (a lone agent is safe at stage 1).
  - The Heal Vial heals the healer's whole max HP (about one of the boss's blows on a light class at the stage pushed); at 25% it never mattered. `SCALE_POWER` 1.5 made a small party far stronger per character than a big one in long fights.
- **Simulation** (`long-work/sim3.mjs`: the real `rules.js`, `party.js`, `effects.js`, 250ms clock, the boss's attacks, knockouts, heals, the 3s/5s waits; you join as the healer; a player who trains Attack and Health, cheapest first, and presses next after each purchase; a failed attempt drops back a stage; median of 5 seeds; time of fighting to first clear):

  | Party | 10 | 25 | 50 | notes |
  |---|---|---|---|---|
  | 3 agents, trains both | 14.2m | 2.9h | 2.13d | 377 wipes, 0 time-outs |
  | 3 agents, Attack only | 13.7m | 5.3h | 3.37d | 58% slower to 50; wipes in ~13s at its limit |
  | 3 agents, the healer never heals | 15.9m | 3.5h | 2.09d | same pace at 50 (it deals more damage instead) |
  | 3 agents, you not fighting (no healer) | 23.5m | 3.6h | 2.05d | |
  | 3 agents, hands-off (never trains, spends no points, never presses next) | 21.1m | never | never | stuck at 14 |
  | 3 agents, best weapons, Might Vial | 10.0m | 2.5h | 1.35d | 1.58× faster to 50 |
  | 1 agent, trains both | 22.0m | 1.8h | 1.80d | |
  | 1 agent, Attack only | 21.7m | 5.1h | never | stuck at 49 within 8 days |
  | 1 agent, no heals | 32.0m | 4.4h | 2.71d | 50% slower without heals |
  | 1 agent, hands-off | 38.3m | never | never | stuck at 13 |
  | 1 agent, best weapons, Might | 26.3m | 3.2h | 1.72d | |
  | 6 agents, trains both | 8.1m | 1.0h | 1.24d | |
  | 6 agents, Attack only | 7.8m | 2.4h | 23.8h | slower to 25, faster to 50 |
  | 6 agents, no heals | 8.3m | 1.4h | 1.20d | |
  | 6 agents, hands-off | 12.5m | never | never | stuck at 16 |
  | 6 agents, best weapons, Might | 5.4m | 52m | 19.1h | |
  | 1 agent alone (you not fighting) | 41.8m | 5.1h | 3.25d | stage 1 in 4.1m |

  Kill times (3 agents, both; attempts played from the progress at a stage's first clear): at the limit 2–3 minutes (about 8 knockouts and 5 rises per attempt, many lost to a wipe after about a minute), one stage below 2–2.8m, three below about 1m, five below 25–40s, eight below 15–25s. In the run itself: pushes 2.1–3.1m, farming one below 1.6–2.6m. At its limit the party with a Heal Vial healer kills the boss in 11 of 25 attempts against 0 of 25 when the healer only attacks, and lasts 2.5 minutes against 54s.
- **Experience by attackers (after review):** the 1-agent party was faster than 3 (experience diluted over more classes, and the class mix). A kill's experience now scales with the attackers as its gold does: `stageXp(s, attackers)` = `ATTACKER_XP` 200 × attackers × `XP_GROWTH`^(s−1), attackers counted as for gold (everyone in the fight, knocked out or not, at least 1, at most `MAX_GOLD_ATTACKERS`), for blows, damage over time, heals and the auras' shares alike. One agent and you (2) earn what a kill earned before. Rerun (5 seeds, time to first clear 10 / 25 / 50): 1 agent, both 22.0m / 1.8h / 1.80d; 3 agents, both 11.0m / 1.6h / 1.50d; 6 agents, both 5.2m / 21.6m / 14.4h; 3 agents, Attack only 10.7m / 3.3h / 2.12d (41% slower); 3 agents, hands-off 18.6m / never / never (stuck at 15). The table above is from before this change. More agents now mean faster progress; stage 10 for 3 agents moved to 11.0m, further under the 15-minute target; nothing else retuned.
- **Targets met:** pace (10 at 14.2m, 25 at 2.9h, 50 at 2.13d; each stage slower than the last, no wall); Attack only 58% slower (a wall for 1 agent); weapons and Might 1.58×; knockouts with rises at the push; one or two agents never wiped in one go; a lone agent clears stage 1 in about 4 minutes; stages well behind fall in under a minute.
- **Targets missed, and what to try next:** (1) the push is 2–3 minutes rather than "several", and is almost never lost to the clock: try a higher `STAGE_HP` against `STAGE_DAMAGE` (longer kills at the limit) with more gold to keep the pace; (2) with 3 or 6 agents a healer that heals is no faster overall than one that attacks (it does outlast in the fight, above): try heal experience sized by the party's blows, or `HEAL_BELOW` higher; (3) one agent was faster than three (1.80d against 2.13d): fixed by experience by attackers (above); (4) 6 agents training only Attack catch up by stage 50 (the boss needs seven blows to wipe seven, so they get about 25s): try more area attacks for big parties; (5) stage 10 at 14.2m is a little under 15.
- **Open (for the owner):** the reviewer found that dropping back more than one stage on a failure is much faster overall (to stage 50: 1 stage back 2.19d, 3 back 1.68d, 5 back 1.36d, 10 back 1.22d), since farming a few stages below the limit kills faster and pays more a second. The owner's rule is one stage; `failStage` is unchanged.
- **The simulation scripts live outside the repo** (in the agent's scratch folder: `sim3.mjs`, `grid.mjs`, `probe.sh`, and the Node tests); ask for them to be added if they should be kept.
- **Existing saves:** no state change, no version bump. A 30-second-era save keeps its levels and training: played under the new rules, a save that had reached 26 kills stage 25–26 in under a minute and can push to about 28–30, one at 41 to about 43–45: a little too easy for a few stages, then the much dearer training slows it. Nothing needs doing; the drop-back rule catches the wall.
- **Saving:** unchanged (a kill, a failed attempt, a stage change, buying, a setting, `close()`). `close()` saves the experience a fight has earned; the attempt itself (boss HP, time) is not in the state and restarts on load, so switching layouts mid-fight now loses up to a few minutes of damage on the boss (not experience). A periodic save would only protect experience against a crash, and kills come every few minutes at most, so it is not added; saving the attempt would need a state change, for the owner to decide.

## Open questions

### Experience

- Class-specific perks, and whether any arrive at particular levels (skills are generic for now).
- Whether the skill numbers above feel right in play; they are defaults.
- (Answered: more agents mean faster progress, by gold × attackers; see Gold. The other options costed were each class taking part earning a whole kill's XP, 1 agent 27.2m / 2.9h / 2.0d and 6 unchanged, and gold × classes taking part, 1 agent 26.4m / 3.0h / 2.2d and 6 unchanged.)
- (How experience is earned, per attack or per point, several agents on one class, and the level curve and cap now have defaults; see Decided.)

### Monsters fighting back

- (Answered: HP per character, knockouts with a rest, a wipe fails the attempt, the Heal Vial heals; see Decided.) You take damage too; walking away takes you out of the fight (you come back at full HP), but you cannot walk while knocked out.
- Revives (the other vials give auras now: see Weapon effects). See the open points under Monsters fighting back (built).

### Weapon effects

- (Answered and built: see Weapon effects under Decided, and its open points.)

### Gold and customisation

- (Rounding when monster HP is not a multiple of 100 now has a default: round down. See Decided.)
- (Who owns a purchase, whether looks are per class, where the shop lives and the prices of colourways now have defaults: per class, a panel under the sign, 5, 10 and 20 gold. See Customisation shop.)
- (How hats are drawn, their prices, whether they combine with colourways and who owns them now have answers: overlay layers, 10, 20 and 30 gold, freely, and every class. See Hats.)
- Alternate sprites: whether they replace a class's look entirely, and how they combine with colourways.

### Scaling

- (Answered: HP grows with the stage, not with levels or kills. See Stages.)

### Display and settings

- **Owner's request:** damage numbers: each blow that lands shows its damage in a pixel font, drifting up and fading, and can be turned off in the settings. **Built** (crits gold and a size bigger; on by default; at most 12 on screen).
- **Owner's request:** a settings menu behind a pixel gear, the right-most thing in the top-right corner. **Built** as a panel in the codex's style with a pixel on/off switch per setting; `SETTINGS` in `rules.js` is the list, so a setting is one more entry.
- **Owner's request:** the agents' status counts moved off the sign to the top-right corner, each an icon with its count on a badge in the pixel font, hidden at 0. **Built**; below 640px wide the corner's strip sits under the sign.
- The pixel font is art: digits, "+", "!", a point and K, M, B, T, E (for shortened numbers; E for a power of ten past 1,000T) in white, gold, ember (burn) and venom (green), drawn by `tools/idle-rpg-sprites.py`. More characters or colours are more glyphs there and in `GLYPHS` / `GLYPH_COLOURS`.

## Technical notes

- **State today** (`idle-rpg.state` in Herdr's shared state, version 7): `version`, `you`, `spots`, `sprites`, `seen`, `battle`, `stage`, `best` and `farming` (the stage fought, the highest reached, and whether a failed attempt sent the party back to farm), `slain`, `gold`, `kills` per monster kind, `xp` for `you` and each class (total XP only; levels are derived), `skills`: ranks per class (points left are derived), `looks`: per class and kind of item, the ids owned and the one equipped (`{ armour: { owned, equipped }, weapon: { owned, equipped }, hat: { equipped } }`), `hats`: the hats bought, owned by every class, `training`: levels per class (`{ attack, health }`; versions 1 to 6 load with Health 0), and `settings` (`{ damageNumbers, advance }`, booleans). The boss and the attempt's time are not saved: an attempt restarts when the layout loads. Versions 1 to 5 load at stage 1 with no training and everything else kept (their saved monster is replaced by stage 1's boss). Version 1 state loads with every rank at 0; ranks that claim more points than a class has earned reset that class. Version 1 and 2 state loads with every class owning and wearing only its default colourway; versions 1 to 3 load with no hats owned and none on; versions 1 to 4 load with every class owning and holding only its default weapon, whatever they say (version 5 was the bump for weapons, so an older copy of the mod treats a save with weapons as read-only rather than dropping them); unknown or repeated ids are dropped and an equipped id that is not owned falls back to the default. Version 1 to 3 state loads with every setting at its default; unknown settings are dropped and one that is not a boolean gets its default. Each attacker's rhythm is in memory only. `loadState` in `rules.js` reads older state and malformed values without throwing. See `RECIPE.md`.
- **Saving (decided):** combat progress (XP) is saved only when a boss is slain and when an attempt fails, not as damage lands (nor on a spawn, now that the boss is not saved): setting a shared value re-renders every mod in the window, and Power and Haste would make damage-based saves frequent. XP earned since the last kill or fail is lost if the app closes mid-fight. Deliberate actions save at once: spending or resetting points, buying training, picking a stage, buying or equipping in the shop, changing a setting, changing a class, the raid toggle, moving yourself or an agent, a newcomer getting a class.
- **State still to add:** alternate sprites, as another kind under `looks`.
- **Existing kill total** cannot be split by monster kind after the fact. It is kept as the total and the per-kind counts start from zero.
- **Per-attacker cadence** replaced the single 3-second beat: each attacker keeps its own rhythm on one 250ms clock that runs only while someone is attacking and re-renders only while someone is mid-attack. **Built.**
- **Stronger attacks:** `fight()` takes a list of blows, each with its own damage.
- **Customisation art** is the costly part. Every character is drawn in a standing sprite, walk frames, dangling frames and three fighting poses in two directions: twelve pictures. Colours are generated by swapping palette entries in `tools/idle-rpg-sprites.py` (**built**: 3 colourways × 4 classes × 12 pictures, 144 more files, about 98 KB). Hats are drawn as a separate layer over each picture (**built**: 3 hats × 4 classes × 12 pictures, 144 more files, about 54 KB), so they do not multiply with colourways. So are weapons (**built**: 4 weapons × 3 classes × 12 pictures and the healer's 4 potions × 2, 152 files), with 29 more attack pictures.
- **Weapon effects** keep the boss's statuses and the party's auras in memory only (`effects.js`; the auras are worked out from who is attacking on every tick); nothing new is saved.
- **Monsters fighting back** keep their state in memory only (`party.js`: HP, knockouts, the boss's attack under way); nothing per agent is saved, and a wipe saves once as a failed attempt.
- **`main.js` is one class of about 2,900 lines.** A Herdr mod may import other files in its folder (`./rules.js`; Herdr's own `win98` mod does), so the game rules (stages, boss HP, gold, experience, damage, training, levels, skill points and what ranks give, attack gaps, the crit roll, kill counts, loading state) live in `rules.js` as plain functions, the boss fighting back in `party.js` and what weapons do in `effects.js`, and `main.js` draws and runs the timers.
- **Progress only accrues while the layout is shown**, since the timers live in the mod. Whether that is acceptable for an idle game is worth a decision.

## Proposed order

1. State and bookkeeping: versioned state, kills per monster kind, gold on a kill, shown on the sign. **Built.**
2. Experience: player and class experience and levels, shown on the info cards. No unlocks yet. **Built** (levels also on the class picker, and a note over the head on a level-up).
3. Class unlocks: stronger and faster attacks, then buffs. Needs per-attacker cadence. **Built** as per-class skill points (Power, Haste, Crit), with per-attacker cadence and monster HP by kind; buffs not built.
4. Customisation shop: colours first (cheap to generate), then hats and alternate sprites. **Colours built** (a shop under the sign, colourways per class), **hats built** (bought once for every class, worn per class) and **weapons built** (per class; their effects in step 7); alternate sprites not built.
5. Stages, a timer, exponential scaling and Attack training. **Built.**
6. Monsters fighting back: agent HP, knockouts, wipes, healer healing, "Health" training. **Built** (revives later).
7. Weapon stats, elements and potion effects. **Built** (see Weapon effects).

Parked beyond this: what player levels unlock, maps, resources other than gold.

**Idea from the owner, not started:** seasonal decorations in town: jack-o'-lanterns in October for Halloween, and string lights and a Christmas tree in December. To decide first: whether they follow the calendar, a setting in the gear menu, or both.

**Next wave (the owner's decisions, after the stages work merges):**
- **Many agents at once.** A load test with staged agents (on the stages build): 100 agents in a raid run, but the ranged classes pile up in both corners and the name labels overlap into a strip; 100 in town show about eight characters, since once the default spots run out newcomers are placed exactly on others; 400 (100 a class) fail to render at all ("interrupted" inside `place`, whose search for a free spot costs the square of the agent count).
  - **Decided:** fix positioning first, without grouping: spots assigned from a grid in one pass, more rows of the floor used, spread evenly when full, and the 400-agent render failure fixed; then look at how it reads.
  - **Not decided:** grouping agents into squads by class (with a count) past about 20. The owner: "viable, but lets think on it some more, i would like to see how it looks without the grouping".
- **Biomes (agreed):** a different backdrop per biome, changing every ten stages, and a map icon in the top-right strip (left of the gear) that opens a stage picker. The owner's monsters per biome: "(forest: goblins, lizards, slime), (hills/valleys: orcs, ogre, chief ogre), (caves: wyverns, draconians, dragon), (hell: imps, magma slimes, goblin mages, demon)". So four biomes after or including today's castle rampart; **to settle:** whether the rampart stays as the first biome or becomes the town only. Each kind has its own weakness, shown on a monster info card.
