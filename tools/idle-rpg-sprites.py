#!/usr/bin/env python3
# Draws Idle RPG's pixel art as PNGs (no dependencies): the class sprites
# (stubby 16x16 adventurers with a one-pixel dark outline, in every colourway
# the shop sells, and every weapon and hat it sells drawn to lay over them),
# each weapon's attack and effects on the boss, the castle
# scenery (wall, floor, mountains, clouds, sun, moon, stars, props), each
# biome's backdrop (the raids' scenes: forest, hills, caves, hell), the icons,
# a small pixel font for numbers, and the lettering (the HUD's words, the
# boss's plate and the name tags) and the frame corners.
#
#   python3 tools/idle-rpg-sprites.py mods/idle-rpg/art
#
# Edit the grids below (one character per pixel, "." is empty) and re-run.
# Everything is drawn at 8 image pixels per art pixel and shown at 4.
#
# The pictures go in folders by what they show, then by what it is doing, with
# short names inside (the paths in mods/idle-rpg/rules.js, effects.js and main.js follow it):
#   scene/      the backdrop and props: wall, floor, mountains, stars, sun, moon,
#               cloud-a, cloud-b, banner, torch, barrel; and <biome>/ (forest,
#               hills, caves, hell): far, mid, ground, swatch, and under a roof
#               ceiling and the light (caves crystal, hell vent)
#   classes/    <class>/<look>/stand, walk/{l,r}, rag/{c,l,r}, and the fighting
#               poses stance/, windup/, strike/ {l,r}, and down/ {l,r} (knocked
#               out); <look> is "default" or a colourway's id; drawn without the weapon
#   weapons/    <class>/<weapon>/ the same pictures as a class (the healer's: only
#               windup/), to lay over them; <weapon> is "default" or the weapon's id
#   hats/       <hat>/<class>/ the same pictures as a class, to lay over them
#   attacks/    by what flies or lands, then the weapon's variant of it:
#               slash/<variant>/, arrow/<variant>/, spell/<element>/ {l,r};
#               burst/<element>, potion/<potion>, splash/<potion>, spark/<element>
#   monsters/   <kind>/ idle (the whole picture), blink, the pieces that move
#               (top, base, body, tail), roar/ for the ogre and dragon, and
#               attack/, its two attacks on the party (see the last section)
#   foe/        marker (where an area attack lands) and hit (on whoever it reaches)
#   stations/   <station>/{idle,hot}, and the arrow over the one under the pointer
#   campfire/   base, flame-1 to flame-4
#   light/      the night's darkness: candle, torch, fill, fire-0 to fire-23
#   status/     over an agent's head: alert, done, z-1 to z-3, sword-l, sword-r, spark,
#               dizzy-1, dizzy-2 (knocked out), heal, sparkle
#   icons/      the sign's, the shop's and the settings': swords, sleep, skull,
#               coin, star, armour, hat, gear, map (the stage picker), the
#               card's wrench, and the stage section's arrows: prev, next
#   effects/    weapon effects (effects.js): icons/ (burn, chill, venom, hex, haste,
#               might), marks/ (weak, resist), and on the boss burn/flame-1, -2,
#               chill/crystal, glint, chain/arc/{l,r}, venom/drip-1, -2
#   font/       <colour>/<character>, the pixel font: white, gold, ember, venom
#   lettering/  <colour>/<character>, the second face, for words (the HUD, the
#               boss's plate, the name tags): white, gold, grey, red, green;
#               capitals, digits, signs, the middle dot, the ellipsis and
#               "unknown", the box drawn for any character it lacks
#   frame/      tl, tr, bl, br: the corners of the HUD's pixel frames (and the boss's plate)
import math, os, struct, sys, zlib
if len(sys.argv) != 2 or sys.argv[1].startswith("-"):  # no options: "--help" is not a folder to fill
    sys.exit("usage: idle-rpg-sprites.py <output folder>")
out = sys.argv[1]
os.makedirs(out, exist_ok=True)

def write(name, data):
    # `name` is a path under the output folder ("scene/wall.png"); its folders are made as needed
    path = os.path.join(out, *name.split("/"))
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
OUTLINE = "#141a26"
COMMON = {"s": "#f2c9a0", "k": "#1b2233"}
# Each class without its weapon (a layer of its own: see Weapons, below), hands
# and all. The healer's staff stays here: the healer's "weapon" is the potion it
# throws.
SPR = {
"wizard": ({"h":"#5a3dab","y":"#f2c14e","g":"#f2c14e","b":"#f4f7fb","r":"#6b4bc4","R":"#5a3dab","d":"#3d2a80"}, [
"................",
".......hh.......",
"......hhhh......",
"......hyhh......",
".....gggggg.....",
"....hhhhhhhh....",
".....ssssss.....",
".....skssks.....",
".....bssssb.....",
".....bbbbbb.....",
"....rrbbbbrr....",
"...srrrbbrrrs...",
"....rrrRRrrr....",
"....gggggggg....",
".....dd..dd.....",
"................",
]),
"healer": ({"t":"#2fae8e","h":"#e6dfcc","y":"#f3cf6b","g":"#f2c14e","m":"#7df0c0","w":"#c9a66b","r":"#f6f1e2","d":"#8a6f47"}, [
"................",
"................",
".....tttttt..g..",
"....tyyyyyytgmg.",
"....tsssssst.g..",
"....tsksskst.w..",
"....tsssssst.w..",
".....hssssh..w..",
".....rrrrrr..w..",
"....rrrttrrr.w..",
"...srrttttrrsw..",
"....rrrttrrr.w..",
"....rrrrrrrr.w..",
"....tttttttt.w..",
".....dd..dd..w..",
"................",
]),
"warrior": ({"p":"#c94040","a":"#9aa7b8","A":"#dfe6ee","u":"#3a6fc4","g":"#f2c14e","d":"#7a5230","b":"#5b6675"}, [
"................",
".......pp.......",
"......ppp.......",
".....aaaaaa.....",
"....aaAAAAaa....",
"....aaaaaaaa....",
"....askaaksa....",
"....assssssa....",
".....ssssss.....",
"....AaaaaaaA....",
".uuuuaaaaaap....",
".ugguaaaaaap....",
".ugguddgdddps...",
".uuuuaa..aap....",
".....bb..bb.....",
"................",
]),
"archer": ({"p":"#e85d5d","n":"#3f8f55","N":"#2c6b3e","d":"#7a5230","c":"#f4ecd8","q":"#a06a3a","g":"#f2c14e"}, [
"................",
"......p.........",
".....ppnnnn.....",
".....nnnnnnn....",
"...NNNNNNNNN....",
"....ddssssdd....",
"....dskssksd....",
"....dssssssd....",
".....ssssss.....",
".cc..nnnnnn.....",
".qq.nndnnnnns...",
".qqsnnndnnnn....",
".qq.ddddgddd....",
"....NNNNNNNN....",
".....dd..dd.....",
"................",
]),
}

# Colourways sold in the shop: each class's default (the palette above, drawn
# into classes/<class>/default/) and three more, drawn into classes/<class>/<id>/ by swapping
# palette entries over the default's (clothing, armour, hair, trim; never skin,
# eyes or the outline). A weapon keeps its own colours whatever the armour. The ids, in this order, must match COLOUR_NAMES in
# mods/idle-rpg/rules.js, which names them (and COLOUR_PRICES prices them).
LOOKS = {
"wizard": {   # hat, robe and boots; the beard and gold trim stay
    "crimson": {"h":"#a8323a","r":"#cf4747","R":"#a8323a","d":"#64202a"},
    "moss":    {"h":"#2f7a46","r":"#45a05f","R":"#2f7a46","d":"#1f4d33","y":"#dfe6ee","g":"#dfe6ee"},
    "frost":   {"h":"#4f86c6","r":"#9fd0f5","R":"#6fa8dc","d":"#35608f","y":"#ffffff","g":"#ffffff"},
},
"healer": {   # the cross, hood, hair and trim; the robe stays pale so the cross shows
    "rose":  {"t":"#d4457c","h":"#a8552e","m":"#ffa8c8","r":"#fbf0f2","d":"#7a3b4f"},
    "sky":   {"t":"#3b78d0","h":"#3b2b22","m":"#a8d8ff","r":"#eef4fb","d":"#3a4e6e"},
    "plum":  {"t":"#8048bf","h":"#f4f0e6","m":"#d8b4ff","r":"#f6f0fb","d":"#4a3366"},
},
"warrior": {  # armour, plume and shield
    "cobalt": {"a":"#4f74b8","A":"#b4cdf0","p":"#f4ecd8","u":"#c94040","b":"#34466e"},
    "jade":   {"a":"#5c9c84","A":"#c4ecdc","p":"#f2c14e","u":"#7a3fa8","b":"#3d5f55"},
    "ruby":   {"a":"#b04a4a","A":"#f4d2cc","p":"#f4ecd8","u":"#2f7a7a","b":"#5b3b3b"},
},
"archer": {   # tunic, hat, feather and quiver; the hair stays
    "scarlet": {"n":"#c43a3a","N":"#8a2226","p":"#f2c14e","q":"#5b3b22"},
    "azure":   {"n":"#3f7fcc","N":"#285a96","p":"#f4ecd8"},
    "dusk":    {"n":"#8a56c2","N":"#5e3890","p":"#6fdc9a","q":"#c08a4a"},
},
}
# a look's id names its folder, so it is one lower-case word, and not "default",
# which is the default's folder, so no two looks can share one
assert all(i.isalpha() and i.islower() and i != "default" for c in LOOKS for i in LOOKS[c])

def looks(cls):
    # (the look's folder, palette entries to swap): the default first, unchanged
    return [(f"classes/{cls}/default", {})] + [(f"classes/{cls}/{look}", swaps) for look, swaps in LOOKS[cls].items()]

def canvas(rows, size, pad, dx=lambda y: 0):
    g = [[None] * size for _ in range(size)]
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".": g[y + pad][x + pad + dx(y)] = ch
    return g

def outlined(g):
    h, w = len(g), len(g[0])
    o = [r[:] for r in g]
    for y in range(h):
        for x in range(w):
            if g[y][x] is None and any(0 <= y+j < h and 0 <= x+i < w and g[y+j][x+i] for i, j in ((1,0),(-1,0),(0,1),(0,-1))):
                o[y][x] = "#"
    return o

SCALE = 8  # 8 image pixels per sprite pixel: 2x a 4px on-screen pixel, so retina draws it 1:1

def png(g, pal):
    n = len(g)
    w = len(g[0])
    rgba = lambda ch: (bytes.fromhex(pal.get(ch, ch)[1:]) + b"\xff")[:4]  # "#rrggbb", or "#rrggbbaa" for see-through
    raw = b""
    for row in g:
        line = b"\x00" + b"".join((rgba(ch) if ch else b"\x00\x00\x00\x00") * SCALE for ch in row)
        raw += line * SCALE
    def chunk(tag, data):
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data))
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", struct.pack(">IIBBBBB", w * SCALE, n * SCALE, 8, 6, 0, 0, 0))
            + chunk(b"IDAT", zlib.compress(raw, 9)) + chunk(b"IEND", b""))

def lift(rows, side):
    # tuck one foot up out of sight: blank its two boot pixels
    r = list(rows[14]); a = 5 if side > 0 else 9
    r[a] = r[a + 1] = "."
    return rows[:14] + ["".join(r)] + rows[15:]

def box(rows):
    # a fighting pose's 22x16 rows on its 24x18 picture, as icon() lays them out
    g = [[None] * 24 for _ in range(18)]
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != ".": g[y + 1][x + 1] = ch
    return g

POSES = ("stance", "windup", "strike")

def pictures(rows, posed, tags=POSES):
    # every picture of a class as (frame, grid): `rows` in the everyday 16x16
    # grid (None for none of the everyday pictures), `posed(tag)` a pose's
    # 22-wide rows for each of `tags`. 16x16 art with a 1px margin for the
    # outline standing; leaning a pixel, the other foot lifted, walking;
    # straight, or sheared each way, dangling; and each fighting pose drawn
    # attacking to the right ("r") and its mirror image ("l"). The frames are
    # FRAMES in mods/idle-rpg/rules.js.
    out = []
    if rows is not None:
        out.append(("stand", canvas(rows, 18, 1)))
        for tag, side in (("l", -1), ("r", 1)):
            out.append((f"walk/{tag}", canvas(lift(rows, side), 18, 1, lambda y: side if y < 14 else 0)))
        out.append(("rag/c", canvas(rows, 22, 3)))
        for tag, side in (("l", -1), ("r", 1)):
            out.append((f"rag/{tag}", canvas(rows, 22, 3, lambda y: side * round(y * 0.2))))
    for tag in tags:
        out.append((f"{tag}/r", box(posed(tag))))
        out.append((f"{tag}/l", box([r[::-1] for r in posed(tag)])))
    return out


# ---- Scenery ---------------------------------------------------------------
import random

def save(name, g, pal={}):
    write(name, png(g, pal))

def chars(rows, pal):
    width = max(len(r) for r in rows)
    return [[pal[c] if c != "." else None for c in r.ljust(width, ".")] for r in rows]

def blank(w, h, fill=None):
    return [[fill] * w for _ in range(h)]

# Battlement wall, 32x16, tiles sideways: two merlons, then courses of stone.
def wall():
    rnd = random.Random(7)
    base, light, dark, mortar = "#7d8590", "#9aa3ad", "#646c78", "#4a515c"
    g = blank(32, 16)
    for x0 in (0, 16):
        for x in range(x0, x0 + 10):
            for y in range(5):
                g[y][x] = light if y == 0 else dark if x == x0 + 9 else base
    for x in range(32):
        g[5][x] = light
    y = 6
    for course, h in enumerate((3, 3, 2)):
        off = 0 if course % 2 == 0 else 4
        shade = {}
        for yy in range(y, y + h):
            for x in range(32):
                brick = ((x - off) % 32) // 8
                shade.setdefault(brick, rnd.choice([base, base, base, light, dark]))
                g[yy][x] = mortar if (x - off) % 8 == 7 else shade[brick]
        y += h
        if y < 16:
            for x in range(32): g[y][x] = mortar
            y += 1
    return g

# Wooden floor, 32x38, tiles sideways: planks with staggered joints and grain.
def floor():
    rnd = random.Random(3)
    gap, tones, grain = "#8a5a33", ["#b9834f", "#c08d58", "#ad7745", "#b9834f"], "#a06c3d"
    g = blank(32, 38)
    for y in range(38):
        course = y // 6
        r = random.Random(100 + course)
        joint = r.randrange(4, 28)
        left, right = r.choice(tones), r.choice(tones)
        for x in range(32):
            if y % 6 == 0 or y == 37: g[y][x] = gap
            elif x == joint: g[y][x] = gap
            else: g[y][x] = left if x < joint else right
    for _ in range(26):
        x, y = rnd.randrange(31), rnd.randrange(38)
        if y % 6 not in (0, 1) and g[y][x] != gap and g[y][x + 1] != gap: g[y][x] = g[y][x + 1] = grain
    return g

# Distant snowy mountains, 64x20, tiles sideways.
def mountains():
    peaks = [(8, 15, 1.0), (24, 19, 0.9), (40, 13, 1.1), (54, 17, 0.8)]
    g = blank(64, 20)
    for x in range(64):
        best = max(((ph - min(abs(x - px), 64 - abs(x - px)) * sl, px) for px, ph, sl in peaks))
        h = max(4, int(best[0]))
        lit = ((x - best[1] + 32) % 64) - 32 < 0
        for d in range(h):
            y = 19 - d
            snow = h >= 11 and d >= h - (3 if lit else 2)
            g[y][x] = "#eef3f8" if snow else ("#6f88a6" if lit else "#566e8b")
    return g

def disc(n, colour, spots=()):
    g = blank(n, n)
    c = (n - 1) / 2
    for y in range(n):
        for x in range(n):
            if (x - c) ** 2 + (y - c) ** 2 <= (n / 2) ** 2 - 0.5: g[y][x] = colour
    for x, y, col in spots:
        g[y][x] = col
    return g

def stars():
    rnd = random.Random(11)
    g = blank(64, 32)
    for _ in range(22):
        g[rnd.randrange(32)][rnd.randrange(64)] = rnd.choice(["#ffffff", "#ffffff", "#ffe9a8", "#bcd3ff"])
    return g

save("scene/wall.png", wall())
save("scene/floor.png", floor())
save("scene/mountains.png", mountains())
save("scene/stars.png", stars())
save("scene/sun.png", disc(10, "#ffd75e", [(x, y, "#fff3b0") for x in range(3, 7) for y in range(3, 7)]))
save("scene/moon.png", disc(10, "#e8eef7", [(3, 3, "#b9c6d8"), (4, 3, "#b9c6d8"), (6, 6, "#b9c6d8"), (3, 7, "#b9c6d8"), (7, 2, "#b9c6d8")]))
CLOUD = {"w": "#ffffff", "s": "#cfe0f2"}
save("scene/cloud-a.png", chars([
    "......wwwwww............",
    "....wwwwwwwwww...www....",
    "..wwwwwwwwwwwwwwwwwwww..",
    ".wwwwwwwwwwwwwwwwwwwwww.",
    "wwwwwwwwwwwwwwwwwwwwwwww",
    "wsswwwwsssswwwwwsssswwws",
    ".ssssssssssssssssssssss.",
], CLOUD))
save("scene/cloud-b.png", chars([
    "....wwwww.......",
    "..wwwwwwwww.ww..",
    ".wwwwwwwwwwwwww.",
    "wwwswwwwsswwwwww",
    ".ssssssssssssss.",
], CLOUD))
save("scene/torch.png", chars([
    "..y...",
    ".yoy..",
    ".yoo..",
    "yoooy.",
    ".orro.",
    "mmmmm.",
    ".bbb..",
    ".bbb..",
    "..b...",
    "..b...",
    "..b...",
    "..b...",
], {"y": "#ffe27a", "o": "#ff9d3c", "r": "#e2552f", "m": "#4a515c", "b": "#7a5230"}))
save("scene/banner.png", chars([
    "bbbbbbbbbb",
    ".rrrrrrrr.",
    ".rrrrrrrr.",
    ".rrrggrrr.",
    ".rrggggrr.",
    ".rggwwggr.",
    ".rrggggrr.",
    ".rrrggrrr.",
    ".rrrrrrrr.",
    ".rrrrrrrr.",
    ".RRRRRRRR.",
    ".rrr..rrr.",
    ".rr....rr.",
    ".r......r.",
], {"b": "#7a5230", "r": "#c94040", "R": "#a53030", "g": "#f2c14e", "w": "#fff3b0"}))
TABLE = chars([
    "....................gg......",
    "..ccccc.............gg...y..",
    ".cc...cc...........pppp..o..",
    ".ccccccc...........pPPp..w..",
    "TTTTTTTTTTTTTTTTTTTTTTTTTTTT",
    "tttttttttttttttttttttttttttt",
    "dddddddddddddddddddddddddddd",
    ".dtt....................ttd.",
    ".dtt....................ttd.",
    ".dtt....................ttd.",
    ".dtt....................ttd.",
    ".dtt....................ttd.",
    ".dtt....................ttd.",
    ".ddd....................ddd.",
], {"c": "#f4ecd8", "g": "#9fd8e8", "p": "#c94040", "P": "#e86a6a", "y": "#ffe27a", "o": "#ff9d3c", "w": "#f4f7fb",
    "T": "#b98047", "t": "#9a6639", "d": "#6e4525"})
save("stations/table/idle.png", TABLE)
# ---- Stations, on the rampart between raids: each opens one of the panels ----
# Each has a folder, stations/<name>/: "idle", the picture, and "hot", the same
# picture inside a one-pixel white outline (so one art pixel bigger on every
# side), shown under the pointer.
def lit(g):
    h, w = len(g), len(g[0])
    big = [[None] * (w + 2) for _ in range(h + 2)]
    for y in range(h):
        for x in range(w): big[y + 1][x + 1] = g[y][x]
    o = [r[:] for r in big]
    for y in range(h + 2):
        for x in range(w + 2):
            if big[y][x] is None and any(0 <= y+j < h+2 and 0 <= x+i < w+2 and big[y+j][x+i] for i, j in ((1,0),(-1,0),(0,1),(0,-1))):
                o[y][x] = "#ffffff"
    return o

def station(name, rows, pal):
    g = chars(rows, pal)
    save(f"stations/{name}/idle.png", g)
    save(f"stations/{name}/hot.png", lit(g))

save("stations/table/hot.png", lit(TABLE))                 # the codex is the whole table, and the book on it
station("book", [                                # the codex, lying on the table
    ".bbbbbb.",
    "bBBBBBBb",
    "bBBggBBb",
    "bBBggBBb",
    "bBBBBBBb",
    "wwwwwwwb",
], {"b": "#3b2a6b", "B": "#6b4fbf", "g": "#f2c14e", "w": "#f4ecd8"})
station("stall", [                               # the shop: a merchant's stall
    "..rrwwrrwwrrwwrrwwrrwwrr..",
    ".rrwwrrwwrrwwrrwwrrwwrrww.",
    "rrwwrrwwrrwwrrwwrrwwrrwwrr",
    "RRWWRRWWRRWWRRWWRRWWRRWWRR",
    "R..WW..RR..WW..RR..WW..RR.",
    ".d......................d.",
    ".d......................d.",
    ".d......................d.",
    ".d...........pp.........d.",
    ".d..gg......pppp...yy...d.",
    ".d.gGGg.....pPPp..yYYy..d.",
    "TTTTTTTTTTTTTTTTTTTTTTTTTT",
    "tttttttttttttttttttttttttt",
    "dddddddddddddddddddddddddd",
    ".dtTttTttTttTttTttTttTttd.",
    ".dtTttTttTttTttTttTttTttd.",
    ".dtTttTttTttTttTttTttTttd.",
    ".dtTttTttTttTttTttTttTttd.",
    ".dtTttTttTttTttTttTttTttd.",
    ".dtTttTttTttTttTttTttTttd.",
    ".dddddddddddddddddddddddd.",
], {"r": "#c94040", "R": "#a53030", "w": "#f4ecd8", "W": "#d8cfb8", "g": "#c8891e", "G": "#f2c14e", "p": "#3f8fd0", "P": "#9fd8e8",
    "y": "#3fbf6f", "Y": "#9be6b4", "T": "#b98047", "t": "#9a6639", "d": "#6e4525"})
station("dummy", [                               # the skills: a straw training dummy
    "....ssss....",
    "...sSSSSs...",
    "...sSSSSs...",
    "....ssss....",
    "bbbbbbbbbbbb",
    "..yyYYYYyy..",
    "..yYYrrYYy..",
    "..yYrwwrYy..",
    "..yYrwwrYy..",
    "..yYYrrYYy..",
    "..yyYYYYyy..",
    "...yyyyyy...",
    ".....bb.....",
    ".....bb.....",
    ".....bb.....",
    ".....bb.....",
    "...bbbbbb...",
    "..bbbbbbbb..",
], {"s": "#b89a62", "S": "#d9c08a", "b": "#7a5230", "y": "#c9a03c", "Y": "#e6c766", "r": "#c94040", "w": "#f4ecd8"})
save("scene/barrel.png", chars([
    "..tttttttt..",
    ".tTTTTTTTTt.",
    "mmmmmmmmmmmm",
    "tTtTTtTTtTTd",
    "tTtTTtTTtTTd",
    "tTtTTtTTtTTd",
    "tTtTTtTTtTTd",
    "tTtTTtTTtTTd",
    "tTtTTtTTtTTd",
    "tTtTTtTTtTTd",
    "mmmmmmmmmmmm",
    ".tTtTTtTTtd.",
    "..dddddddd..",
], {"T": "#b98047", "t": "#9a6639", "d": "#6e4525", "m": "#4a515c"}))

# ---- The campfire, in the middle of the floor between raids (scenery, not a
# station), in campfire/. "base" is the ring of stones, the crossed logs, the
# embers between them and the low heart of the flames; it never changes. The
# stones and logs are outlined like the sprites, and each stone and log is
# drawn inside its own outline, back to front, so they read as separate pieces.
# "flame-1" to "-4" are the tall flames laid over it, each fading in and out on
# its own rhythm so the fire flickers. Below row FIRE_HEART they are the
# heart's own pixels, so only the tongues change as they fade. The flames are
# the torch's colours, deep orange out to a near-white core, and like the
# torch's have no outline. 52x43, plus a pixel of margin all round.
FIRE_W, FIRE_H, FIRE_HEART = 54, 45, 27
FLAME = ((0.68, "#fff3b0"), (0.46, "#ffe27a"), (0.22, "#ff9d3c"), (0.0, "#e2552f"))  # by heat, hottest first
STONE = ("#c3cad2", "#9aa3ad", "#7d8590", "#646c78", "#4a515c")                    # the wall's stone, lit from the top left
WOOD = {"hi": "#8f5e34", "mid": "#6e4525", "lo": "#4f321c", "crack": "#3b2614", "cut": "#e6c48f", "ring": "#b98047", "char": "#2a2220", "coal": "#c2401f"}

def fire_piece(g, inside, colour):
    # one stone or log: its outline round it (over whatever is behind), then its own pixels
    pts = [(x, y) for y in range(FIRE_H) for x in range(FIRE_W) if inside(x + 0.5, y + 0.5)]
    for x, y in pts:
        for i, j in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            if not inside(x + i + 0.5, y + j + 0.5) and 0 <= x + i < FIRE_W and 0 <= y + j < FIRE_H: g[y + j][x + i] = OUTLINE
    for x, y in pts: g[y][x] = colour(x + 0.5, y + 0.5)

def fire_stone(g, cx, cy, rx, ry, rnd):
    def colour(x, y):
        u, v = (x - cx) / rx, (y - cy) / ry
        shade = 0.85 * v + 0.45 * u + rnd.uniform(-0.12, 0.12)
        return STONE[0 if shade < -0.62 else 1 if shade < -0.12 else 2 if shade < 0.38 else 3 if shade < 0.72 else 4]
    fire_piece(g, lambda x, y: ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1, colour)

def fire_log(g, x0, y0, x1, y1, thick, rnd):
    # a log from its sawn end (x0, y0), pale, to (x1, y1) in the flames, charred like where the fire is
    dx, dy = x1 - x0, y1 - y0
    n = math.hypot(dx, dy)
    def at(x, y):  # how far along (px) and across (-1 to 1)
        return ((x - x0) * dx + (y - y0) * dy) / n, ((x - x0) * dy - (y - y0) * dx) / n / (thick / 2)
    def inside(x, y):
        t, s = at(x, y)
        return -0.5 <= t <= n + 0.5 and abs(s) <= 1
    grain = [rnd.random() for _ in range(int(n) + 2)]
    def colour(x, y):
        t, s = at(x, y)
        burnt = t > n - 6 or math.hypot((x - 27) / 1.6, y - 27) < 7
        if t < 1.2: return WOOD["ring"] if abs(s) < 0.45 else WOOD["cut"]
        if burnt: return WOOD["coal"] if grain[int(t)] < 0.45 and abs(s) < 0.6 else WOOD["char"]
        side = s if dx > 0 else -s  # the upper edge catches the light
        if grain[int(t)] < 0.2 and abs(s) < 0.6: return WOOD["crack"]   # a knot or a crack in the bark
        return WOOD["hi"] if side > 0.35 else WOOD["lo"] if side < -0.45 else WOOD["mid"]
    fire_piece(g, inside, colour)

def flames(tongues):
    # heat at each pixel: each tongue is (x, top, bottom, half width at the bottom, lean at the top, heat)
    heat = [[0.0] * FIRE_W for _ in range(FIRE_H)]
    for x0, top, bottom, width, lean, hot in tongues:
        for y in range(int(top), int(bottom) + 1):
            p = (y + 0.5 - top) / (bottom - top)
            if p <= 0: continue
            hw = width * min(1.0, p) ** 0.62
            xc = x0 + lean * (1 - min(1.0, p)) ** 2
            for x in range(FIRE_W):
                h = (1 - abs(x + 0.5 - xc) / hw) * (0.2 + 0.8 * min(1.0, p)) * hot if hw > 0 else 0
                if 0 <= y < FIRE_H and h > heat[y][x]: heat[y][x] = h
    return [[next((c for t, c in FLAME if h > t), None) if h > 0.03 else None for h in row] for row in heat]

rnd = random.Random(11)
base = [[None] * FIRE_W for _ in range(FIRE_H)]
ring = [(27 + 21 * math.cos(a), 35 + 5 * math.sin(a), a) for a in (math.radians(d) for d in range(15, 360, 30))]
for x, y, a in sorted(ring, key=lambda s: s[1]):                       # the back of the ring
    if math.sin(a) < 0: fire_stone(base, x, y, 3.8, 2.6, rnd)
fire_piece(base, lambda x, y: ((x - 27) / 16) ** 2 + ((y - 35) / 3.5) ** 2 <= 1,  # the bed of embers
           lambda x, y: rnd.choice(["#7a2416", WOOD["coal"], WOOD["coal"], "#e2552f", "#ff9d3c", "#ffe27a"]))
fire_log(base, 16, 33, 29, 14, 3.4, rnd)                               # leaning together at the back
fire_log(base, 38, 33, 25, 14, 3.4, rnd)
heart = flames([(27, 17, 34, 11, 0, 1.0), (20, 22, 33, 6, -1, 0.8), (34, 21, 33, 6, 1, 0.8)])
heart = [[c if y >= FIRE_HEART else None for c in row] for y, row in enumerate(heart)]
for y in range(FIRE_H):                                                # the heart, in front of those
    for x in range(FIRE_W): base[y][x] = heart[y][x] or base[y][x]
for x, y, a in sorted(ring, key=lambda s: s[1]):                       # the front of the ring
    if math.sin(a) >= 0: fire_stone(base, x, y, 4.3, 3.0, rnd)
behind = [row[:] for row in base]
fire_log(base, 8, 38, 31, 12, 4.2, rnd)                                # crossed in front, resting on the stones
fire_log(base, 46, 38, 23, 12, 4.2, rnd)
front = [[c != b for c, b in zip(row, was)] for row, was in zip(base, behind)]  # the front logs: the flames burn behind them
save("campfire/base.png", base)
for i, tongues in enumerate([
    [(28, 1, 30, 9, 4, 1.0), (19, 12, 30, 5, -2, 0.75)],               # tall, leaning right, a tongue on the left
    [(26, 0, 30, 9, -4, 1.0), (35, 10, 30, 5, 2, 0.75)],               # tall, leaning left, a tongue on the right
    [(21, 9, 30, 7, -1, 0.85), (28, 6, 30, 8, 1, 0.95), (35, 11, 30, 6, 2, 0.8)],  # low and broad
    [(24, 4, 30, 7, -2, 0.9), (31, 3, 30, 7, 3, 0.9)],                 # forked
], 1):
    g = flames(tongues)
    g = [[(heart[y][x] if base[y][x] == heart[y][x] else None) if y >= FIRE_HEART else (None if front[y][x] else c) for x, c in enumerate(row)] for y, row in enumerate(g)]
    save(f"campfire/flame-{i}.png", g)

save("icons/wrench.png", chars([  # the card's, to change class; double-ended: an open jaw at each end
    ".....w.w",
    ".....www",
    "....ww..",
    "...ww...",
    "..ww....",
    "www.....",
    "w.w.....",
    "........",
], {"w": "#dbe7f3"}))

# ---- Status icons (status/), shown over an agent's head, outlined like the sprites ----
def icon(name, rows, pal):
    g = chars(rows, pal)
    h, w = len(g), len(g[0])
    big = [[None] * (w + 2) for _ in range(h + 2)]
    for y in range(h):
        for x in range(w): big[y + 1][x + 1] = g[y][x]
    o = [r[:] for r in big]
    for y in range(h + 2):
        for x in range(w + 2):
            if big[y][x] is None and any(0 <= y+j < h+2 and 0 <= x+i < w+2 and big[y+j][x+i] for i, j in ((1,0),(-1,0),(0,1),(0,-1))):
                o[y][x] = OUTLINE
    save(name, o)

SWORD = {"A": "#dfe6ee", "a": "#9aa7b8", "g": "#f2c14e", "d": "#7a5230"}
BLADE = [
    "......A",
    ".....Aa",
    "....Aa.",
    ".g.Aa..",
    "..ga...",
    ".d.g...",
    "d......",
]
icon("status/sword-l.png", BLADE, SWORD)                       # working: two of these clash
icon("status/sword-r.png", [r[::-1] for r in BLADE], SWORD)
save("status/spark.png", chars(["..y..", ".yWy.", "yWWWy", ".yWy.", "..y.."], {"y": "#ffe27a", "W": "#ffffff"}))
Z = {"z": "#e6f0fa"}
icon("status/z-1.png", ["zzz", ".z.", "zzz"], Z)                # idle: three of these rise
icon("status/z-2.png", ["zzzz", "..z.", ".z..", "zzzz"], Z)
icon("status/z-3.png", ["zzzzz", "...z.", "..z..", ".z...", "zzzzz"], Z)
icon("status/alert.png", [                                     # blocked: it needs you
    ".rrrrr.",
    "rrrwrrr",
    "rrrwrrr",
    "rrrwrrr",
    "rrrrrrr",
    "rrrwrrr",
    ".rrrrr.",
    "..rr...",
], {"r": "#e2483f", "w": "#ffffff"})
icon("status/done.png", [                                      # done: finished while you were away
    ".ggggg.",
    "ggggggg",
    "gggggwg",
    "ggggwgg",
    "gwgwggg",
    "ggwgggg",
    ".ggggg.",
    "..gg...",
], {"g": "#3fbf6f", "w": "#ffffff"})

# ---- Night (light/): darkness laid over the wall, the floor and everyone on it, with a
# pool of light left clear around a flame. The dark deepens away from the
# flame in six even steps (rings, not a smooth blur) up to half strength, so
# the far corners are dim, not black. 74 rows: 20 above the wall, where the dark
# thins out upward to nothing (so a tall monster is not cut in two at the wall's
# top), then the wall (16) and the floor (38). `cy` counts from the wall's top.
# Each light is (cx, cy, near, far, stretch): where the flame is, how far the
# pool stays clear, where the dark is whole, and how much wider than tall it is.
# Where pools overlap, the lighter wins.
RISE = 20
def dark(name, w, *lights):
    g = blank(w, RISE + 54)
    for y in range(RISE + 54):
        for x in range(w):
            step = 6
            for cx, cy, near, far, stretch in lights:
                d = math.hypot((x + 0.5 - cx) / stretch, y + 0.5 - RISE - cy)
                t = min(1.0, max(0.0, (d - near) / (far - near)))
                step = min(step, round(t * t * (3 - 2 * t) * 6))
            step = min(step, 6 * y // RISE)
            if step: g[y][x] = "#0a1030%02x" % round(128 * step / 6)
    save(name, g)

TORCH_LIGHT = (48.5, 4.5, 9, 40, 1.15)
dark("light/torch.png", 96, TORCH_LIGHT)                 # one torch's stretch of wall, the flame near the top
dark("light/candle.png", 68, (28.5, 9, 3, 24, 1.0))      # the left end, lit only by the candle on the table
dark("light/fill.png", 96)                               # no flame: as wide as a torch's, laid over what is left and clipped (a picture is never stretched: the app keeps its proportions)
# The campfire's stretch (between raids), 80 wide with the fire in the middle,
# cut into the row of pictures wherever the fire stands. The torches' pools
# reach into it, so it carries their light as well as its own. The torches'
# pictures start 68 art px from the left and repeat every 96, and the fire
# stands at 68 + 4n (16 screen px steps), so "fire-<i>" is the stretch for
# a fire 4i art px into a torch's picture (i = n mod 24). The fire's own pool is
# centred on the heart of its flames, a few art px above its feet (which are
# 25 art px into the floor), and lights the floor all round it. It is wholly
# dark by the stretch's edges, so it meets the pictures beside it seamlessly.
FIRE_LIGHT = (40, 27, 11, 36, 1.2)
for edge in (0.5, 79.5):                                 # its first and last columns are wholly dark
    t = min(1.0, (abs(edge - FIRE_LIGHT[0]) / FIRE_LIGHT[4] - FIRE_LIGHT[2]) / (FIRE_LIGHT[3] - FIRE_LIGHT[2]))
    assert round(t * t * (3 - 2 * t) * 6) == 6, FIRE_LIGHT
for i in range(24):
    torches = [(TORCH_LIGHT[0] + 40 - 4 * i + 96 * k,) + TORCH_LIGHT[1:] for k in (-1, 0, 1)]
    dark(f"light/fire-{i}.png", 80, FIRE_LIGHT, *torches)

# ---- Sign icons (icons/): the counts on the sign, drawn small (shown at 2 screen px a pixel) ----
icon("icons/swords.png", [                                  # working
    "A.....A",
    ".A...A.",
    "..A.A..",
    "g..A..g",
    ".gA.Ag.",
    "..g.g..",
    ".d...d.",
], SWORD)
icon("icons/sleep.png", [                                   # resting
    "zzzz...",
    "..z....",
    ".z.....",
    "zzzz...",
    "....zzz",
    ".....z.",
    "....zzz",
], Z)
icon("icons/skull.png", [                                   # slain
    ".wwwww.",
    "wwwwwww",
    "wkkwkkw",
    "wkkwkkw",
    "wwwkwww",
    ".wwwww.",
    ".wkwkw.",
], {"w": "#ece6d6", "k": "#2a2433"})
icon("stations/arrow.png", ["wwwww", ".www.", "..w.."], {"w": "#ffffff"})  # bobs over the station under the pointer
icon("icons/prev.png", ["..w", ".ww", "www", ".ww", "..w"], {"w": "#ffd166"})  # the boss's plate: the stage before
icon("icons/next.png", ["w..", "ww.", "www", "ww.", "w.."], {"w": "#ffd166"})  # and the stage after
icon("icons/armour.png", [                                  # the shop's armours
    "aa...aa",
    "aAaaaAa",
    ".aAAAa.",
    ".aAaAa.",
    ".aAAAa.",
    ".aaAaa.",
    "..aaa..",
], SWORD)
icon("icons/hat.png", [                                     # the shop's hats
    "...b...",
    "..bb...",
    "..bBb..",
    ".bbBb..",
    ".ggggg.",
    "bbbbbbb",
], {"b": "#4a6fd0", "B": "#7fa0ee", "g": "#f2c14e"})
icon("icons/coin.png", [                                    # gold
    "..ggg..",
    ".gyyyg.",
    "gyyhyyg",
    "gyhyyyg",
    "gyyyyyg",
    ".gyyyg.",
    "..ggg..",
], {"g": "#c8891e", "y": "#f2c14e", "h": "#fff0b0"})
icon("icons/star.png", [                                    # skill points to spend
    "...y...",
    "..yhy..",
    "yyyhyyy",
    ".yhhhy.",
    "..yyy..",
    ".yy.yy.",
    ".y...y.",
], {"y": "#ffd166", "h": "#fff6cf"})

# ---- Monsters (battle mode): drawn from shapes, outlined like the sprites ----
class Pix:
    def __init__(self, w, h):
        self.w, self.h = w + 2, h + 2                 # 1px margin for the outline
        self.g = [[None] * self.w for _ in range(self.h)]
    def px(self, x, y, c):
        if 0 <= x < self.w - 2 and 0 <= y < self.h - 2: self.g[y + 1][x + 1] = c
    def rect(self, x, y, w, h, c):
        for j in range(h):
            for i in range(w): self.px(x + i, y + j, c)
    def ell(self, cx, cy, rx, ry, c):
        for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
            for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
                if ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2 <= 1.0: self.px(x, y, c)
    def poly(self, pts, c):
        ys = [p[1] for p in pts]
        for y in range(int(min(ys)), int(max(ys)) + 1):
            xs = []
            for (x1, y1), (x2, y2) in zip(pts, pts[1:] + pts[:1]):
                if y1 == y2: continue
                if min(y1, y2) <= y + 0.5 < max(y1, y2): xs.append(x1 + (y + 0.5 - y1) * (x2 - x1) / (y2 - y1))
            xs.sort()
            for a, b in zip(xs[::2], xs[1::2]):
                for x in range(int(round(a)), int(round(b)) + 1): self.px(x, y, c)
    # `keep(x, y)` saves only part of the picture (art coordinates): the part
    # that rises and falls when the monster breathes.
    def save(self, name, outline=True, keep=None):
        g, o = self.g, [r[:] for r in self.g]
        for y in range(self.h if outline else 0):
            for x in range(self.w):
                if g[y][x] is None and any(0 <= y+j < self.h and 0 <= x+i < self.w and g[y+j][x+i] for i, j in ((1,0),(-1,0),(0,1),(0,-1))):
                    o[y][x] = OUTLINE
        if keep:
            o = [[c if keep(x - 1, y - 1) else None for x, c in enumerate(row)] for y, row in enumerate(o)]
        save(name, o)

K, WHITE, BONE = "#1b2233", "#ffffff", "#f4ecd8"

def slime(name, lids=False, keep=None):                   # 32x24
    p = Pix(32, 24)
    B, Bd, Bl = "#4fb3e0", "#3586b8", "#9bdcf5"
    if lids:
        p.rect(9, 12, 3, 4, B); p.rect(19, 12, 3, 4, B)
        return p.save(name, outline=False)
    p.ell(16, 13, 14, 10, Bd); p.rect(2, 13, 29, 10, Bd)
    p.ell(15.5, 12, 13, 9, B); p.rect(3, 12, 26, 9, B)
    p.rect(2, 21, 29, 2, Bd)
    p.ell(9, 7, 3, 2, Bl); p.px(13, 5, Bl)
    p.rect(9, 12, 3, 5, K); p.rect(19, 12, 3, 5, K); p.px(9, 12, WHITE); p.px(19, 12, WHITE)
    p.rect(13, 18, 5, 1, K)
    p.save(name, keep=keep)

def ogre(name, roar=False, lids=False, keep=None):        # 48x48
    p = Pix(48, 48)
    G, Gd, Gl = "#6f9e3f", "#4f7a2c", "#93bf5a"
    Wd, Wl, Br = "#7a5230", "#9a6639", "#5a3d22"
    if lids:
        p.rect(16, 11, 4, 2, G); p.rect(27, 11, 4, 2, G); p.rect(16, 13, 4, 1, Gd); p.rect(27, 13, 4, 1, Gd)
        return p.save(name, outline=False)
    p.poly([(38, 24), (43, 24), (47, 5), (39, 2)], Wd)    # club, raised
    p.poly([(40, 22), (42, 22), (45, 6), (41, 4)], Wl)
    for x, y in ((39, 8), (46, 12), (40, 14), (45, 4)): p.rect(x, y, 2, 2, BONE)
    p.rect(14, 38, 8, 8, Gd); p.rect(26, 38, 8, 8, Gd)    # legs
    p.rect(12, 44, 11, 3, Br); p.rect(25, 44, 11, 3, Br)
    p.ell(24, 30, 15, 12, Gd); p.ell(23, 29, 14, 11, G); p.ell(24, 32, 9, 7, Gl)
    p.poly([(11, 36), (37, 36), (34, 43), (24, 40), (14, 43)], Wl); p.rect(10, 35, 28, 2, Br); p.rect(22, 34, 4, 4, "#f2c14e")
    p.ell(7, 29, 5, 8, Gd); p.ell(7, 28, 4, 7, G); p.ell(7, 38, 4, 4, G)          # left arm, fist
    p.ell(41, 29, 5, 7, Gd); p.ell(40, 28, 4, 6, G); p.ell(41, 23, 4, 4, G)       # right arm, fist on the club
    p.poly([(10, 8), (14, 12), (13, 18)], Gd); p.poly([(38, 8), (34, 12), (35, 18)], Gd)  # ears
    p.ell(24, 14, 11, 10, Gd); p.ell(23, 13, 10, 9, G)
    p.rect(15, 9, 17, 2, Gd)                              # brow
    p.rect(16, 11, 4, 3, "#ffe27a"); p.rect(27, 11, 4, 3, "#ffe27a"); p.px(18, 12, K); p.px(28, 12, K)
    p.rect(22, 13, 4, 4, Gd); p.px(22, 16, K); p.px(25, 16, K)
    if roar:                                              # jaw dropped wide
        p.rect(15, 10, 17, 1, Gd)
        p.rect(15, 18, 17, 8, "#3a1f1f"); p.rect(18, 23, 11, 3, "#c94040")
        p.rect(16, 18, 2, 4, BONE); p.rect(29, 18, 2, 4, BONE); p.rect(20, 18, 2, 2, BONE); p.rect(25, 18, 2, 2, BONE)
        p.rect(17, 24, 2, 2, BONE); p.rect(28, 24, 2, 2, BONE)
    else:
        p.rect(16, 19, 15, 3, "#3a1f1f"); p.rect(17, 17, 2, 4, BONE); p.rect(28, 17, 2, 4, BONE)
    p.save(name, keep=keep)

def dragon(name, part=None, lids=False, keep=None, pose=None):  # 80x64, facing left; part: "tail" or "body" alone
    p = Pix(80, 64)
    R, Rd, Rl = "#c23b3b", "#8f2626", "#e06a5a"
    Wg, Wm, Cr = "#7a1f2b", "#b5483f", "#f2c98a"
    if lids:
        p.rect(17, 12, 4, 3, R); p.rect(17, 15, 4, 1, Rd)
        return p.save(name, outline=False)
    if part != "body":
        p.poly([(54, 46), (72, 36), (79, 22), (80, 26), (76, 40), (60, 56)], Rd)   # tail
        p.poly([(77, 22), (80, 14), (80, 24)], BONE)
    if part == "tail": return p.save(name)
    # A roar (pose): "rear" draws the head back and up and lifts the wings a
    # little, "roar" thrusts the head forward with the jaw wide and the wings
    # high. Only the head, the top of the neck and the wing tips move; the
    # neck's foot and everything below the breathing cut (y 38) stay put.
    hx, hy, lift = {None: (0, 0, 0), "rear": (2, -2, 1), "roar": (-1, 1, 2)}[pose]
    h = lambda pts: [(x + hx, y + hy) for x, y in pts]
    up = lambda pts, tips: [(x, y - lift) if i in tips else (x, y) for i, (x, y) in enumerate(pts)]
    p.poly(up([(44, 34), (52, 6), (62, 14), (70, 4), (76, 26), (62, 38)], (1, 2, 3)), Wg)  # far wing
    p.ell(44, 45, 20, 13, Rd); p.ell(43, 44, 19, 12, R); p.ell(40, 51, 14, 5, Cr)   # body, belly
    p.rect(30, 52, 8, 9, Rd); p.rect(50, 52, 8, 9, Rd)                              # legs
    p.rect(27, 60, 12, 3, Rd); p.rect(47, 60, 12, 3, Rd)
    for x in (27, 31, 35, 47, 51, 55): p.px(x, 62, BONE)
    p.poly(h([(22, 20), (34, 18)]) + [(42, 38), (28, 44)], R)                       # neck
    p.poly(h([(22, 22), (26, 21)]) + [(32, 42), (28, 44)], Cr)
    for i in range(5): p.rect(22 + i + round(hx * (4 - i) / 4), 24 + i * 4 + round(hy * (4 - i) / 4), 4, 1, "#d9a868")
    for x, y in ((34 + hx, 14 + hy), (38, 22), (42, 28), (48, 28), (54, 30), (60, 34)):  # back spikes
        p.poly([(x, y + 5), (x + 2, y), (x + 5, y + 5)], BONE)
    p.poly(up([(40, 36), (46, 8), (58, 16), (66, 2), (72, 22), (58, 36)], (1, 2, 3)), Wm)  # near wing
    p.poly(up([(46, 8), (48, 10), (44, 34), (40, 36)], (0, 1)), Rd); p.poly(up([(66, 2), (68, 4), (60, 34), (58, 36)], (0, 1)), Rd)
    p.ell(19 + hx, 17 + hy, 11, 7, Rd); p.ell(18 + hx, 16 + hy, 10, 6, R)           # head
    if pose == "roar":                                                              # jaws wide
        p.poly(h([(4, 17), (21, 17), (22, 24), (5, 30)]), "#3a1f1f")                # mouth
        p.poly(h([(7, 28), (19, 22), (21, 24), (9, 29)]), "#c94040")               # tongue
        p.poly(h([(2, 30), (19, 23), (22, 23), (22, 27), (6, 33)]), Rd)             # lower jaw, dropped
        for x, y in ((5, 29), (9, 28), (13, 26), (17, 25)): p.px(x + hx, y + hy, WHITE)
        p.rect(3 + hx, 10 + hy, 14, 7, R); p.rect(3 + hx, 10 + hy, 14, 1, Rl); p.rect(2 + hx, 12 + hy, 2, 4, R)  # snout, raised
        for x in (6, 9, 12, 15): p.px(x + hx, 17 + hy, WHITE)
        p.rect(4 + hx, 17 + hy, 1, 2, WHITE); p.rect(13 + hx, 17 + hy, 1, 2, WHITE)  # fangs
        p.px(4 + hx, 12 + hy, K); p.rect(17 + hx, 13 + hy, 4, 3, "#ffe27a"); p.rect(18 + hx, 13 + hy, 1, 3, K)
        p.rect(16 + hx, 12 + hy, 6, 1, Rd)                                          # brow, lowered
    else:
        p.rect(3 + hx, 14 + hy, 14, 8, R); p.rect(3 + hx, 14 + hy, 14, 1, Rl); p.rect(2 + hx, 16 + hy, 2, 5, R)  # snout
        p.rect(5 + hx, 22 + hy, 16, 3, Rd)                                          # jaw
        for x in (6, 9, 12, 15): p.px(x + hx, 22 + hy, WHITE)
        p.px(4 + hx, 16 + hy, K); p.rect(17 + hx, 12 + hy, 4, 4, "#ffe27a"); p.rect(18 + hx, 12 + hy, 1, 4, K)
    p.poly(h([(23, 12), (31, 3), (27, 14)]), BONE); p.poly(h([(19, 10), (24, 2), (22, 11)]), BONE)  # horns
    p.save(name, keep=keep)

# Each monster's whole picture ("idle"), the pieces that move on their own,
# eyelids to lay on top, and for the ogre and dragon a roar/ folder, all in
# monsters/<kind>/. Moving a piece over a still one never shows a ghost behind it,
# which easing between two whole frames did.
slime("monsters/slime/idle.png"); slime("monsters/slime/blink.png", lids=True)
slime("monsters/slime/base.png", keep=lambda x, y: y >= 19)          # the foot stays put (below the mouth)
slime("monsters/slime/top.png", keep=lambda x, y: y < 19)            # the dome sinks into it and rises
ogre("monsters/ogre/idle.png"); ogre("monsters/ogre/roar/roar.png", roar=True); ogre("monsters/ogre/blink.png", lids=True)
ogre("monsters/ogre/top.png", keep=lambda x, y: y < 31)              # head, shoulders, arms: breathing
dragon("monsters/dragon/idle.png"); dragon("monsters/dragon/blink.png", lids=True)
dragon("monsters/dragon/tail.png", part="tail")                      # sways behind the body
dragon("monsters/dragon/body.png", part="body")
dragon("monsters/dragon/top.png", part="body", keep=lambda x, y: y < 38)  # head, neck, wings: breathing
dragon("monsters/dragon/roar/rear.png", part="body", pose="rear")         # a roar: the wind-up, then
dragon("monsters/dragon/roar/roar.png", part="body", pose="roar")         # the roar itself,
dragon("monsters/dragon/roar/top.png", part="body", pose="roar", keep=lambda x, y: y < 38)  # its upper body shaking
icon("monsters/dragon/roar/wave.png", [                                 # rings out of the roaring dragon's mouth, to the left
    "...ww",
    "..w..",
    ".w...",
    ".w...",
    "w....",
    "w....",
    "w....",
    "w....",
    ".w...",
    ".w...",
    "..w..",
    "...ww",
], {"w": "#f2c98a"})

# ---- Attacks (battle mode), in attacks/, by what flies or lands, then by
# the weapon's variant of it (see ATTACK_ART in mods/idle-rpg/rules.js, which
# picks them for each weapon): the warrior's slash/, the archer's arrow/, the
# wizard's spell/ and the burst/ where it lands, the healer's potion/ and its
# splash/, and the spark/ where a fire or frost arrow lands (a plain one's is
# status/spark). Those that fly or face a way have a folder: "r" flies or faces
# right, "l" is its mirror. Every variant of one has the same size, so the mod
# draws them all alike; the first of each is what the class always had. ----
def both(name, rows, pal):
    icon(f"attacks/{name}/r.png", rows, pal)
    icon(f"attacks/{name}/l.png", [r[::-1] for r in rows], pal)

ARROW = {"f": "#f4ecd8", "d": "#7a5230", "A": "#dfe6ee"}
for name, rows, pal in [
    ("default", ["f......A.", "fddddddAA", "f......A."], ARROW),
    ("fire", ["f....r.o.", "fdddddyoW", "f....r.o."], {**ARROW, "r": "#e2552f", "o": "#ff9d3c", "y": "#ffe27a", "W": "#fff3b0"}),
    ("frost", ["f.....bi.", "fddddddiI", "f.....bi."], {**ARROW, "b": "#4f86c6", "i": "#9fd0f5", "I": "#ffffff"}),
    ("bolt", ["...kk..a.", "...kDDDaA", "...kk..a."], {"k": "#5b6675", "D": "#5a3d22", "a": "#9aa7b8", "A": "#dfe6ee"}),  # the crossbow's: short and heavy
]:
    assert len(rows) == 3 and all(len(r) == 9 for r in rows)
    both(f"arrow/{name}", rows, pal)
for name, rows, pal in [
    ("fire", [                                   # a fireball
        "...ooo..",
        ".yooyyo.",
        "royyWWyo",
        "royyWWyo",
        ".yooyyo.",
        "...ooo..",
    ], {"r": "#e2552f", "o": "#ff9d3c", "y": "#ffe27a", "W": "#ffffff"}),
    ("frost", [                                  # an ice shard
        "...bi...",
        ".bbiiI..",
        "biiiIIWW",
        "biiiIIWW",
        ".bbiiI..",
        "...bi...",
    ], {"b": "#4f86c6", "i": "#9fd0f5", "I": "#dff3ff", "W": "#ffffff"}),
    ("storm", [                                  # a bolt of lightning
        "........",
        "..yW...y",
        ".yWyW.yW",
        "yW..yWy.",
        "W....y..",
        "........",
    ], {"y": "#ffe27a", "W": "#ffffff"}),
    ("poison", [                                 # a glob of venom, dripping
        "...vvv..",
        ".vvVVvv.",
        "xvVLLVvv",
        "xvvVVvvv",
        ".xvvvvv.",
        "x..xxx..",
    ], {"x": "#2f7a22", "v": "#6fcf3f", "V": "#a8eb6a", "L": "#e4ffc4"}),
]:
    assert len(rows) == 6 and all(len(r) == 8 for r in rows)
    both(f"spell/{name}", rows, pal)
for name, rows, pal in [
    ("default", [".WW...", "...WW.", "....WW", "....WW", ".....W", "....WW", "....WW", "...WW.", ".WW..."], {"W": "#ffffff"}),
    ("heavy", ["WWW...", ".wWWW.", "...WWW", "...wWW", "....WW", "...wWW", "...WWW", ".wWWW.", "WWW..."],   # the axe's: a broad cleave
     {"W": "#ffffff", "w": "#c9d6e6"}),
    ("smash", ["..W..W", "W..W..", ".W.WW.", "..WyWW", "WWyyyW", "..WyWW", ".W.WW.", "W..W..", "..W..W"],  # the hammer's: a crunch
     {"W": "#ffffff", "y": "#ffe27a"}),
    ("flame", [".ry...", "...oy.", "....oy", "....oy", ".....y", "....oy", "....oy", "...oy.", ".ry..."],    # the flame blade's
     {"r": "#e2552f", "o": "#ff9d3c", "y": "#ffe27a"}),
]:
    assert len(rows) == 9 and all(len(r) == 6 for r in rows)
    both(f"slash/{name}", rows, pal)
for name, rows, pal in [
    ("fire", [
        "....y....",
        ".y.yoy.y.",
        "..yoWoy..",
        ".yoWWWoy.",
        "yoWWWWWoy",
        ".yoWWWoy.",
        "..yoWoy..",
        ".y.yoy.y.",
        "....y....",
    ], {"o": "#ff9d3c", "y": "#ffe27a", "W": "#ffffff"}),
    ("frost", [                                  # a burst of frost
        "....I....",
        ".I..i..I.",
        "..i.i.i..",
        "...iIi...",
        "IiiIWIiiI",
        "...iIi...",
        "..i.i.i..",
        ".I..i..I.",
        "....I....",
    ], {"i": "#9fd0f5", "I": "#ffffff", "W": "#ffffff"}),
    ("storm", [                                  # a crackle
        "y...W...y",
        ".y..y..y.",
        "..yyWyy..",
        "..yWWWy..",
        "WyWWWWWyW",
        "..yWWWy..",
        "..yyWyy..",
        ".y..y..y.",
        "y...W...y",
    ], {"y": "#ffe27a", "W": "#ffffff"}),
    ("poison", [                                 # a splat of venom
        ".v.....v.",
        "....v....",
        "..vvVvv..",
        ".vVVLVVv.",
        "vvVLLLVvv",
        ".vVVLVVv.",
        "..vvVvv..",
        "....v.x..",
        ".x.....v.",
    ], {"x": "#2f7a22", "v": "#6fcf3f", "V": "#a8eb6a", "L": "#e4ffc4"}),
]:
    assert len(rows) == 9 and all(len(r) == 9 for r in rows)
    icon(f"attacks/burst/{name}.png", rows, pal)
# The healer's potions, thrown, and their splashes, in each potion's colours
# (the liquid "g" and its shine "G"): heal (what it always threw), haste,
# might and hex.
POTION_COLOURS = {
    "heal": {"g": "#3fbf8f", "G": "#9af0cf"},
    "haste": {"g": "#e8b030", "G": "#fff0b0"},
    "might": {"g": "#d63a3a", "G": "#ff9a8a"},
    "hex": {"g": "#7a3fb8", "G": "#d8b4ff"},
}
for name, colours in POTION_COLOURS.items():
    icon(f"attacks/potion/{name}.png", [
        ".bbb.",
        "..w..",
        ".www.",
        "wgggw",
        "wgGgw",
        "wgggw",
        ".www.",
    ], {"b": "#7a5230", "w": "#dff3ee", **colours})
    icon(f"attacks/splash/{name}.png", [
        "g.........g",
        "..g..g..g..",
        ".g.ggGgg.g.",
        "..gGGGGGg..",
        ".ggGGGGGgg.",
        "..ggggggg..",
    ], colours)
# where a fire or frost arrow lands: status/spark (a plain arrow's) in its colours
for name, pal in (("fire", {"y": "#ff9d3c", "W": "#ffe27a"}), ("frost", {"y": "#9fd0f5", "W": "#ffffff"})):
    save(f"attacks/spark/{name}.png", chars(["..y..", ".yWy.", "yWWWy", ".yWy.", "..y.."], pal))

# ---- Fighting poses (battle mode), on a 22x16 grid so a weapon can reach out.
# Drawn attacking to the right: "stance", "windup" and "strike", each a folder
# in the look's; "r" faces right and "l" is the mirror image, for attacking to
# the left. Each pose is drawn in every colourway, with the same swaps as the
# everyday sprite, and like it without the weapon, which each weapon draws in
# its own rows for the pose (see Weapons, below).
POSED = {}  # (class, tag): the pose's rows, for the bodies, the weapons and the hats

def pose(cls, tag, rows):
    rows = [r.ljust(22, ".") for r in rows]
    assert len(rows) == 16 and all(len(r) == 22 for r in rows), (cls, tag, [len(r) for r in rows])
    POSED[(cls, tag)] = rows

def swap(rows, changes):
    rows = list(rows)
    for y, text in changes.items(): rows[y] = text
    return rows

def dots(rows, pixels):
    g = [list(r.ljust(22, ".")) for r in rows]
    for x, y, ch in pixels: g[y][x] = ch
    return ["".join(r) for r in g]

W = SPR["warrior"][1]
pose("warrior", "stance", W)
pose("warrior", "windup", swap(W, {            # weapon held high: the hand at the shoulder
    7: "....assssssa.s", 8: ".....ssssss.a", 9: "....AaaaaaaAa", 12: ".ugguddgdddp",
}))
pose("warrior", "strike", swap(W, {            # swung level, at full reach
    10: ".uuuuaaaaaapas", 12: ".ugguddgdddp",
}))

A = SPR["archer"][1]
for tag in POSES: pose("archer", tag, A)        # the bow does the drawing and loosing

Z = SPR["wizard"][1]
pose("wizard", "stance", Z)
for tag in ("windup", "strike"):                # raised, then thrust out: the hand at the chest
    pose("wizard", tag, swap(Z, {9: ".....bbbbbb.s", 10: "....rrbbbbrrr", 11: "...srrrbbrrr"}))

# The healer throws with the free hand, so its stance is the mirror of the
# everyday sprite: staff on the far side, free hand toward the monster.
H = [r[::-1] for r in SPR["healer"][1]]
pose("healer", "stance", H)
pose("healer", "windup", dots(H, [(12, 10, "."), (12, 9, "r"), (13, 8, "s")]))  # hand up, holding the potion
pose("healer", "strike", dots(H, [(13, 10, "r"), (14, 10, "s")]))              # arm flung out

# ---- Weapons: a layer of its own over the class's picture and under its hat.
# For each class, weapon and picture, a see-through PNG the size of the
# picture it lies on (weapons/<class>/<weapon>/<frame>.png), so the mod lays
# one over the other with no sums, and one serves every colourway: a weapon
# keeps its own colours whatever the armour. Each weapon is (palette, rows),
# its rows per pose sparse ({row: text}, "." empty): "stand" in the everyday
# 16x16 grid (also its stance: the warrior, wizard and archer stand ready),
# "windup" and "strike" in the 22-wide grid, held in the hand of the class's
# pose. Each is pushed through the same canvas, lean, shear and mirror as the
# body. The healer keeps its staff; its "weapon" is the potion it holds up in
# its wind-up and throws, so its weapons have only those two pictures. Each
# class's ids, in this order, must match WEAPON_NAMES in mods/idle-rpg/rules.js
# (the first, "default", is what the class always had), and the pictures each
# has WEAPON_FRAMES there. In the everyday grid a weapon stays inside columns
# 1 to 14, so walking and dangling keep its outline on the canvas.
STEEL = {"A": "#dfe6ee", "a": "#9aa7b8", "k": "#5b6675", "g": "#f2c14e", "d": "#7a5230", "D": "#5a3d22"}
FLAME = {"r": "#e2552f", "o": "#ff9d3c", "y": "#ffe27a", "W": "#fff3b0", "R": "#8f2626", "g": "#f2c14e", "d": "#7a5230"}
FROST = {"I": "#ffffff", "i": "#9fd0f5", "b": "#4f86c6"}
COLUMN = lambda x, ys, ch: {y: "." * x + ch for y in ys}   # one pixel per row, down column x
WEAPONS = {
"warrior": {
    "default": (STEEL, {                         # Longsword
        "stand": {**COLUMN(13, range(2, 11), "A"), 11: "............ggg", 12: ".............d"},
        "windup": {**COLUMN(13, range(0, 6), "A"), 6: "............ggg"},
        "strike": {9: "..............g", 10: "..............gAAAAAAA", 11: "..............g"},
    }),
    "axe": (STEEL, {                             # Battle Axe: a broad blade on a long haft
        "stand": {0: ".............d", 1: "............AdA", 2: "............AaA", 3: "............AdA",   # a blade each side, standing
                  **COLUMN(13, range(4, 13), "d"), 13: ".............D"},
        "windup": {0: ".............daA", 1: ".............daaA", 2: ".............daaA", 3: ".............daA",
                   **COLUMN(13, range(4, 7), "d"), 8: ".............D"},
        "strike": {9: "..................aa", 10: "..............ddddaad", 11: "..................aaA",
                   12: "..................aaaA", 13: "..................AAAA"},
    }),
    "hammer": (STEEL, {                          # War Hammer: a heavy iron head
        "stand": {0: "............aAa", 1: "............aaa", 2: "............kkk", **COLUMN(13, range(3, 13), "d"), 13: ".............D"},
        "windup": {0: "...........aaAaa", 1: "...........aaaaa", 2: "...........kkkkk", **COLUMN(13, range(3, 7), "d"), 8: ".............D"},
        "strike": {8: "...................aAk", 9: "...................aAk", 10: "..............dddddaAk",
                   11: "...................aAk", 12: "...................aAk"},
    }),
    "flame": (FLAME, {                           # Flame Blade: burning from guard to tip
        "stand": {1: ".............r", 2: ".............or", 3: ".............y", 4: ".............W", 5: ".............yo",
                  6: ".............W", 7: ".............y", 8: ".............Wr", 9: ".............y", 10: ".............o",
                  11: "............RgR", 12: ".............d"},
        "windup": {0: ".............o", 1: "............ryr", 2: ".............W", 3: ".............yo", 4: ".............W",
                   5: ".............y", 6: "............RgR"},
        "strike": {9: "..............R..r..o", 10: "..............goyWyWyo", 11: "..............R...r"},
    }),
},
"wizard": {
    "default": ({"c": "#8fe3ff", "C": "#ffffff", "w": "#8a5a2b"}, {   # Ember Staff
        "stand": {2: ".............c", 3: "............cCc", 4: ".............c", **COLUMN(13, range(5, 15), "w")},
        "windup": {0: ".............c", 1: "............cCc", 2: ".............c", **COLUMN(13, range(3, 11), "w")},
        "strike": {8: "...................c", 9: ".............wwwwwcCc", 10: "...................c"},
    }),
    "frost": ({**FROST, "v": "#c9d6e6"}, {     # Frost Wand: short and silver, tipped with an icicle
        "stand": {2: ".............I", 3: ".............I", 4: ".............i", 5: ".............b", **COLUMN(13, range(6, 13), "v")},
        "windup": {0: ".............I", 1: ".............I", 2: ".............i", 3: ".............b", **COLUMN(13, range(4, 11), "v")},
        "strike": {9: ".............vvvvbiII"},
    }),
    "storm": ({"k": "#3b3f5c", "n": "#6b7090", "Y": "#ffe27a", "W": "#ffffff"}, {   # Storm Staff: a forked iron head, a spark caught in it
        "stand": {0: ".............Y", 1: "............nWn", 2: "............kYk", 3: ".............k", **COLUMN(13, range(4, 15), "k")},
        "windup": {0: "............nWn", 1: "............kYk", 2: ".............k", **COLUMN(13, range(3, 11), "k")},
        "strike": {8: "..................kn", 9: ".............kkkkkkYWY", 10: "..................kn"},
    }),
    "venom": ({"V": "#c4ff8f", "v": "#6fcf3f", "x": "#2f7a22", "n": "#5a4326"}, {   # Venom Wand: short and crooked, a dripping glob
        "stand": {5: ".............Vv", 6: ".............vx", 7: "............n", 8: "..............v", **COLUMN(13, range(8, 13), "n")},
        "windup": {3: ".............Vv", 4: ".............vx", 5: "............n", 6: "..............v", **COLUMN(13, range(6, 11), "n")},
        "strike": {8: "................Vv", 9: ".............nnnvx", 10: ".................v"},
    }),
},
"archer": {
    "default": ({"d": "#7a5230", "c": "#f4ecd8", "A": "#dfe6ee"}, {   # Longbow
        "stand": {5: "............d", 6: "............cd", 7: "............cd", 8: "............c.d", 9: "............c.d",
                  10: "..............d", 11: "............c.d", 12: "............cd", 13: "............cd", 14: "............d"},
        "windup": {5: "..............d", 6: "..............cd", 7: "..............cd", 8: ".............c..d", 9: ".............c..d",
                   10: ".............ddddA", 11: ".............c..d", 12: ".............c.d", 13: "..............cd", 14: "..............d"},
        "strike": {5: "..............d", 6: "..............cd", 7: "..............cd", 8: "..............c.d", 9: "..............c.d",
                   10: "..............c.d", 11: "..............c.d", 12: "..............cd", 13: "..............cd", 14: "..............d"},
    }),
    "crossbow": ({"w": "#9a6639", "D": "#5a3d22", "a": "#9aa7b8", "A": "#dfe6ee", "k": "#5b6675"}, {   # Crossbow: held level, no string to draw
        "stand": {6: ".............A", 7: "............aka", 8: "............a.a", **COLUMN(13, range(9, 12), "w"), 12: ".............D", 13: ".............D"},
        "windup": {8: "................a", 9: ".................a", 10: ".............wwwwkA", 11: "..............D..a", 12: "................a"},
        "strike": {8: "................a", 9: ".................a", 10: ".............wwwwk", 11: "..............D..a", 12: "................a"},
    }),
    "flame": ({"R": "#a53030", "o": "#ff9d3c", "y": "#ffe9a8", "d": "#7a5230", "r": "#e2552f", "Y": "#ffe27a"}, {   # Flame Bow: fire arrows
        "stand": {5: "............o", 6: "............yR", 7: "............yR", 8: "............y.R", 9: "............y.R",
                  10: "..............R", 11: "............y.R", 12: "............yR", 13: "............yR", 14: "............o"},
        "windup": {5: "..............o", 6: "..............yR", 7: "..............yR", 8: ".............y..R", 9: ".............y..RY",
                   10: ".............dddRr", 11: ".............y..R", 12: ".............y.R", 13: "..............yR", 14: "..............o"},
        "strike": {5: "..............o", 6: "..............yR", 7: "..............yR", 8: "..............y.R", 9: "..............y.R",
                   10: "..............y.R", 11: "..............y.R", 12: "..............yR", 13: "..............yR", 14: "..............o"},
    }),
    "frost": ({**FROST, "d": "#7a5230"}, {      # Frost Bow: frost arrows
        "stand": {5: "............I", 6: "............Ib", 7: "............Ib", 8: "............I.i", 9: "............I.i",
                  10: "..............i", 11: "............I.i", 12: "............Ib", 13: "............Ib", 14: "............I"},
        "windup": {5: "..............I", 6: "..............Ib", 7: "..............Ib", 8: ".............I..i", 9: ".............I..iI",
                   10: ".............dddib", 11: ".............I..i", 12: ".............I.b", 13: "..............Ib", 14: "..............I"},
        "strike": {5: "..............I", 6: "..............Ib", 7: "..............Ib", 8: "..............I.i", 9: "..............I.i",
                   10: "..............I.i", 11: "..............I.i", 12: "..............Ib", 13: "..............Ib", 14: "..............I"},
    }),
},
"healer": {                                      # the potion held up: a cork over a little flask
    "default": ({"h": "#e6dfcc", "P": "#3fbf8f"}, {"windup": {5: ".............h", 6: ".............PP", 7: ".............PP"}}),   # Healing Potion
    "haste": ({"h": "#e6dfcc", "L": "#fff0b0", "P": "#f2c14e"}, {"windup": {5: ".............h", 6: ".............LP", 7: ".............PP"}}),
    "might": ({"h": "#e6dfcc", "L": "#ff9a8a", "P": "#d63a3a"}, {"windup": {5: ".............h", 6: ".............LP", 7: ".............PP"}}),
    "hex": ({"h": "#e6dfcc", "L": "#d8b4ff", "P": "#7a3fb8"}, {"windup": {5: ".............h", 6: ".............LP", 7: ".............PP"}}),
},
}
assert set(WEAPONS) == set(SPR) and all(list(w)[0] == "default" for w in WEAPONS.values())
assert all(i.isalpha() and i.islower() for w in WEAPONS.values() for i in w)

def sparse(rows, width):
    assert all(0 <= y < 16 and len(t) <= width for y, t in rows.items()), rows
    return [rows.get(y, "").ljust(width, ".") for y in range(16)]

def armed(poses):
    # a weapon's pictures as (frame, grid), like pictures(): the everyday ones
    # if it has a "stand", whose rows are its stance too, and each pose it has
    stand = sparse(poses["stand"], 16) if "stand" in poses else None
    tags = [t for t in POSES if t in poses or (t == "stance" and stand)]
    return pictures(stand, lambda t: sparse(poses.get(t, poses.get("stand")), 22), tags)

def near(g, y, x):
    return any(0 <= y+j < len(g) and 0 <= x+i < len(g[0]) and g[y+j][x+i] for i, j in ((1,0),(-1,0),(0,1),(0,-1)))

def layer(weapon, body, pal):
    # The weapon's pixels, and the part of the one outline around body and
    # weapon that is the weapon's: around it, wherever the body's own outline
    # (drawn with the body) does not already go. Laid over the body, the two
    # make the picture with one outline around both.
    h, w = len(body), len(body[0])
    o = [[None] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if weapon[y][x]: o[y][x] = pal[weapon[y][x]]
            elif not body[y][x] and near(weapon, y, x) and not near(body, y, x): o[y][x] = OUTLINE
    return o

for cls, (base, rows) in SPR.items():
    assert len(rows) == 16 and all(len(r) == 16 for r in rows), (cls, [len(r) for r in rows])
    body = pictures(rows, lambda tag: POSED[(cls, tag)])
    for name, swaps in looks(cls):                              # every colourway, the default first
        pal = {**COMMON, **base, **swaps, "#": OUTLINE}
        for frame, g in body:
            write(f"{name}/{frame}.png", png(outlined(g), pal))
    shape = dict(body)
    frames = None
    for weapon, (pal, poses) in WEAPONS[cls].items():
        pics = armed(poses)
        assert frames in (None, [f for f, _ in pics]), (cls, weapon)  # every weapon of a class has the same pictures
        frames = [f for f, _ in pics]
        for frame, g in pics:
            assert all(c != "." for row in g for c in row if c) and all(not c or c in pal for row in g for c in row), (cls, weapon, frame)
            write(f"weapons/{cls}/{weapon}/{frame}.png", png(layer(g, shape[frame], pal), {}))

# ---- The pixel font: digits and a few signs, 3x5, for damage numbers and the
# badges on the status icons, and the point and K, M, B, T that shorten big
# numbers ("1.2K"; the point is 1 wide). Each glyph is outlined all round
# (corners too, so it reads over a monster or the sky) and comes in every
# colour main.js uses. Its characters, in order, and colours must match GLYPHS
# and GLYPH_COLOURS in mods/idle-rpg/rules.js, which names the files
# (glyphArt) and knows their widths (glyphWidth): font/<colour>/<name>.
FONT = {
    "0": ["###", "#.#", "#.#", "#.#", "###"],
    "1": [".#.", "##.", ".#.", ".#.", "###"],
    "2": ["###", "..#", "###", "#..", "###"],
    "3": ["###", "..#", ".##", "..#", "###"],
    "4": ["#.#", "#.#", "###", "..#", "..#"],
    "5": ["###", "#..", "###", "..#", "###"],
    "6": ["###", "#..", "###", "#.#", "###"],
    "7": ["###", "..#", "..#", ".#.", ".#."],
    "8": ["###", "#.#", "###", "#.#", "###"],
    "9": ["###", "#.#", "###", "..#", "###"],
    "plus": ["...", ".#.", "###", ".#.", "..."],
    "bang": [".#.", ".#.", ".#.", "...", ".#."],
    "point": [".", ".", ".", ".", "#"],
    "k": ["#.#", "#.#", "##.", "#.#", "#.#"],
    "m": ["#.#", "###", "###", "#.#", "#.#"],
    "b": ["##.", "#.#", "##.", "#.#", "##."],
    "t": ["###", ".#.", ".#.", ".#.", ".#."],
    "e": ["###", "#..", "##.", "#..", "###"],      # a power of ten, past 1,000T
}
GLYPH_COLOURS = {"white": "#ffffff", "gold": "#ffd166",  # a plain hit and a badge; a critical blow;
                 "ember": "#ff9d3c", "venom": "#a8eb6a"}  # damage over time: burn, venom (effects.js)

def glyph(name, rows, colour):
    h, w = len(rows) + 2, len(rows[0]) + 2
    g = [[None] * w for _ in range(h)]
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == "#": g[y + 1][x + 1] = colour
    o = [r[:] for r in g]
    for y in range(h):
        for x in range(w):
            if g[y][x] is None and any(0 <= y+j < h and 0 <= x+i < w and g[y+j][x+i] for i in (-1, 0, 1) for j in (-1, 0, 1)):
                o[y][x] = OUTLINE
    save(name, o)

for colour, hexa in GLYPH_COLOURS.items():
    for ch, rows in FONT.items():
        glyph(f"font/{colour}/{ch}.png", rows, hexa)

# ---- The lettering: a second face, for words on the HUD (the sign, the stage
# section, the notes under it, the boss's plate) and the name tags in the
# scene (an agent's space and tab names, any text: letterFit in rules.js
# folds it to these characters, a box, "unknown", for any it lacks, and cuts
# a long one with the ellipsis). The same 5 rows as the pixel font, so words and
# numbers share a line, and its digits and signs are drawn the same, but its
# letters take the width they need: the font's 3-wide M (which shortNumber's
# "1.2M" keeps) reads as an H in a word, so here M and W are 5 wide and N 4,
# the rest 3 (the point and the thin signs 1, a few signs 2, 4 or 5). Capitals only: main.js draws
# lower case as capitals. A space is no picture, just 2 art px of advance
# (letterWidth in rules.js). A drop shadow, not an outline (see letter). Its characters
# and colours must match LETTERS and LETTER_COLOURS in mods/idle-rpg/rules.js,
# which names the files (letterArt) and knows their widths (letterWidth):
# lettering/<colour>/<name>, the name a lower-case letter, a digit or a sign's name.
LETTERING = {
    "a": [".#.", "#.#", "###", "#.#", "#.#"],
    "b": ["##.", "#.#", "##.", "#.#", "##."],
    "c": [".##", "#..", "#..", "#..", ".##"],
    "d": ["##.", "#.#", "#.#", "#.#", "##."],
    "e": ["###", "#..", "##.", "#..", "###"],
    "f": ["###", "#..", "##.", "#..", "#.."],
    "g": [".##", "#..", "#.#", "#.#", ".##"],
    "h": ["#.#", "#.#", "###", "#.#", "#.#"],
    "i": ["###", ".#.", ".#.", ".#.", "###"],
    "j": ["..#", "..#", "..#", "#.#", ".#."],
    "k": ["#.#", "#.#", "##.", "#.#", "#.#"],
    "l": ["#..", "#..", "#..", "#..", "###"],
    "m": ["#...#", "##.##", "#.#.#", "#...#", "#...#"],
    "n": ["#..#", "##.#", "#.##", "#..#", "#..#"],
    "o": [".#.", "#.#", "#.#", "#.#", ".#."],
    "p": ["##.", "#.#", "##.", "#..", "#.."],
    "q": [".#.", "#.#", "#.#", "##.", ".##"],
    "r": ["##.", "#.#", "##.", "#.#", "#.#"],
    "s": [".##", "#..", ".#.", "..#", "##."],
    "t": ["###", ".#.", ".#.", ".#.", ".#."],
    "u": ["#.#", "#.#", "#.#", "#.#", "###"],
    "v": ["#.#", "#.#", "#.#", "#.#", ".#."],
    "w": ["#...#", "#...#", "#.#.#", "#.#.#", ".#.#."],
    "x": ["#.#", "#.#", ".#.", "#.#", "#.#"],
    "y": ["#.#", "#.#", ".#.", ".#.", ".#."],
    "z": ["###", "..#", ".#.", "#..", "###"],
    **{d: FONT[d] for d in "0123456789"},                    # the font's digits, unchanged
    "plus": FONT["plus"],
    "bang": ["#", "#", "#", ".", "#"],
    "point": FONT["point"],
    "colon": [".", "#", ".", "#", "."],
    "quote": ["#", "#", ".", ".", "."],                       # an apostrophe: "Time's up!"
    "slash": ["..#", "..#", ".#.", "#..", "#.."],
    "dash": ["...", "...", "###", "...", "..."],
    "open": [".#", "#.", "#.", "#.", ".#"],                 # brackets: "(paused)" by the time
    "close": ["#.", ".#", ".#", ".#", "#."],
    # signs common in the names of spaces and tabs, for the name tags
    "under": ["...", "...", "...", "...", "###"],
    "comma": ["..", "..", "..", ".#", "#."],
    "semi": ["..", ".#", "..", ".#", "#."],
    "query": ["##.", "..#", ".#.", "...", ".#."],
    "and": [".#..", "#.#.", ".#..", "#.##", ".##."],
    "hash": [".#.#.", "#####", ".#.#.", "#####", ".#.#."],
    "at": [".###.", "#.#.#", "#.###", "#....", ".###."],
    "star": ["...", "#.#", ".#.", "#.#", "..."],
    "equals": ["...", "###", "...", "###", "..."],
    "less": ["..#", ".#.", "#..", ".#.", "..#"],
    "more": ["#..", ".#.", "..#", ".#.", "#.."],
    "lsquare": ["##", "#.", "#.", "#.", "##"],
    "rsquare": ["##", ".#", ".#", ".#", "##"],
    "percent": ["#.#", "..#", ".#.", "#..", "#.#"],
    "tilde": ["....", ".#.#", "#.#.", "....", "...."],
    "bar": ["#", "#", "#", "#", "#"],
    "backslash": ["#..", "#..", ".#.", "..#", "..#"],
    "dquote": ["#.#", "#.#", "...", "...", "..."],
    "dot": [".", ".", "#", ".", "."],                         # the middle dot between a tag's space and tab
    "ellipsis": [".....", ".....", ".....", ".....", "#.#.#"],  # where a long name is cut
    "unknown": ["....", "####", "#..#", "#..#", "####"],      # a small hollow box for any character the face lacks
}
LETTER_COLOURS = {"white": "#ffffff", "gold": "#ffd166",      # words and numbers; the stage, the title
                  "grey": "#8ea3bb", "red": "#ff7b7b",        # the time standing still, nobody in; a failed attempt
                  "green": "#9ff0bd"}                          # the stage being farmed
def letter(name, rows, colour):
    # set on the HUD's opaque frames, so a drop shadow (a pixel down and to the
    # right, in the outline's colour) rather than the font's outline all round,
    # which made a dark plate of every word; the same cell as a glyph, its
    # width + 2 by 7, so it is set the same way
    h, w = len(rows) + 2, len(rows[0]) + 2
    g = [[None] * w for _ in range(h)]
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == "#": g[y + 1][x + 1] = colour
    o = [r[:] for r in g]
    for y in range(1, h):
        for x in range(1, w):
            if g[y][x] is None and g[y - 1][x - 1]: o[y][x] = OUTLINE
    save(name, o)

for colour, hexa in LETTER_COLOURS.items():
    for ch, rows in LETTERING.items():
        assert len(rows) == 5 and len({len(r) for r in rows}) == 1, ch
        letter(f"lettering/{colour}/{ch}.png", rows, hexa)

# ---- The HUD's frames (frame/): the sign top left, the stage section top
# centre, the strip top right, the stage notes and the boss's plate are each a dark slate panel
# with a lighter bevel, shown at 2 screen px an art px. main.js builds a frame
# of any size from four bands of colour (FRAME in main.js: a px of outline and
# a px of bevel, the top and left light, the bottom and right dark) round a
# fill, with these four 3x3 corners over them, each with its outer pixel cut
# away so the frame's corners step in like the rest of the art. The colours
# must match FRAME_COLOURS in main.js.
FRAME = {"o": OUTLINE, "l": "#56657e", "d": "#1d2534", "f": "#2b3649"}
for name, rows in (("tl", [".oo", "oll", "olf"]), ("tr", ["oo.", "ldo", "fdo"]),
                   ("bl", ["olf", "old", ".oo"]), ("br", ["fdo", "ddo", "oo."])):
    save(f"frame/{name}.png", chars(rows, FRAME))

# ---- The settings menu: a gear (icons/), the right-most icon of the top-right corner ----
icon("icons/gear.png", [
    "..s..s..",
    ".ssssss.",
    "ssggggss",
    ".sg..gs.",
    ".sg..gs.",
    "ssggggss",
    ".ssssss.",
    "..s..s..",
], {"s": "#c3ccd8", "g": "#8f9bab"})
# ---- Hats: one overlay per hat, class and picture, the same size as that
# picture and see-through but for the hat, so the mod lays it over the picture
# with no sums. Hats are not tied to a class (any class can wear any hat), but
# every head sits in its own place and three wear their own headgear, so each
# hat is drawn per class in the everyday sprite's 16x16 grid, where it covers
# the class's headgear (the wizard's hat entirely) or sits on it. Each grid is
# then pushed through the same canvas, lean, shear and mirror as the class's
# pictures, so the hat follows the head; the healer's poses are its mirror
# image, so its hats are mirrored in them too. A hat's outline goes only where
# the picture under it is see-through, never across a face; "#" in a grid is
# outline drawn on purpose, over the picture. An overlay only covers, so one
# serves every colourway: hats/<id>/<class>/<frame>.png. The ids, in this order,
# must match HAT_NAMES in mods/idle-rpg/rules.js.
HAT_PAL = {
    "P": "#e8508f", "p": "#b8336c", "y": "#ffd75e", "o": "#f4f7fb",                   # party: cone, shade, stripes, pompom
    "R": "#d63a3a", "r": "#a52a2a", "W": "#f4f7fb", "w": "#c9d6e6",                   # santa: red, shade, fur, fur shade
    "O": "#ec8a2c", "Q": "#c4661c", "K": "#3a1f12", "Y": "#ffd75e", "G": "#3f8f55",   # pumpkin: skin, ribs, carving, glow, stem
}
HATS = {
"party": {
    "wizard": [
        ".......oo.......",
        ".......PP.......",
        "......yPPp......",
        "......PyPp......",
        ".....PPyPPp.....",
        "....yPPPyPPp....",
    ],
    "healer": [
        ".......oo.......",
        "......yPPp......",
        ".....PPyPPp.....",
        "....yPPPyPPp....",
    ],
    "warrior": [
        ".......oo.......",
        ".......PP.......",
        "......yPPp......",
        ".....PPyPPp.....",
        "....yPPPyPPp....",
    ],
    "archer": [
        ".......oo.......",
        "......yPPp......",
        ".....PPyPPp.....",
        ".....yPPPyPp....",
    ],
},
"santa": {
    "wizard": [
        ".....RRRR.......",
        "...RRRRRRr......",
        "..RR.RRRRr......",
        ".WW..RRRRr......",
        ".Ww.RRRRRRr.....",
        "....WWWWWWWW....",
    ],
    "healer": [
        "......RRRR......",
        "...RRRRRRRr.....",
        ".WW.RRRRRRr.....",
        ".Ww.WWWWWWWW....",
    ],
    "warrior": [
        "......RRR.......",
        "...RRRRRRr......",
        ".WW.RRRRRRr.....",
        ".Ww.WWWWWWWW....",
    ],
    "archer": [
        "......RRR.......",
        "...RRRRRRRr.....",
        ".WW.RRRRRRRr....",
        ".Ww.WWWWWWWW....",
    ],
},
"pumpkin": {
    "wizard": [
        "................",
        ".......GG.......",
        ".....OOOOOO.....",
        "....OOQOOQOO....",
        "....OKKOOKKO....",
        "....OOKOOKOO....",
        "....OQOOOOQO....",
        "....OKYKKYKO....",
        "....OQKKKKQO....",
        ".....OOOOOO.....",
    ],
    "healer": [
        "................",
        ".......GG.......",
        ".....OOOOOO.....",
        "....OOQOOQOO....",
        "....OKKOOKKO....",
        "....OOKOOKOO....",
        "....OKYKKYKO....",
        "....OQKKKKQO....",
        ".....OOOOOO.....",
    ],
    "warrior": [
        "................",
        ".......GG.......",
        ".....OOOOOO.....",
        "....OOQOOQOO....",
        "....OOQOOQOO....",
        "....OKKOOKKO....",
        "....OOKOOKOO....",
        "....OKYKKYKO....",
        "....OQKKKKQO....",
        ".....OOOOOO.....",
    ],
    "archer": [
        "................",
        "......GG........",
        ".....OOOOOO.....",
        "....OOQOOQOO....",
        "...OOOQOOQOOO...",
        "...OOKKOOKKOO...",
        "...OOOKOOKOOO...",
        "...OQKYKKYKQO...",
        "....OQKKKKQO....",
    ],
},
}
assert all(i.isalpha() and i.islower() and i != "default" for i in HATS)
assert all(set(HATS[i]) == set(SPR) for i in HATS)

def overlay(hat, body):
    # the hat's pixels, and its outline where the body's picture (outline and
    # all) leaves the canvas see-through
    h, w = len(body), len(body[0])
    near = lambda g, y, x: any(0 <= y+j < h and 0 <= x+i < w and g[y+j][x+i] for i, j in ((1,0),(-1,0),(0,1),(0,-1)))
    o = [[None] * w for _ in range(h)]
    for y in range(h):
        for x in range(w):
            if hat[y][x]: o[y][x] = OUTLINE if hat[y][x] == "#" else HAT_PAL[hat[y][x]]
            elif near(hat, y, x) and not body[y][x] and not near(body, y, x): o[y][x] = OUTLINE
    return o

for hat, by_class in HATS.items():
    for cls, top in by_class.items():
        rows = [r.ljust(16, ".") for r in top] + ["." * 16] * (16 - len(top))
        assert len(rows) == 16 and all(len(r) == 16 for r in rows), (hat, cls)
        # the wizard's hat must not show under any of them
        assert all(rows[y][x] != "." for y in range(6) for x in range(16) if SPR["wizard"][1][y][x] in "hyg") or cls != "wizard", hat
        mine = [r[::-1] for r in rows] if cls == "healer" else rows   # the healer's poses are mirrored
        body = pictures(SPR[cls][1], lambda tag: POSED[(cls, tag)])
        over = pictures(rows, lambda tag: [r.ljust(22, ".") for r in mine])
        for (frame, b), (_, g) in zip(body, over):
            save(f"hats/{hat}/{cls}/{frame}.png", overlay(g, b))

# ==== Monsters fight back (battle mode) =====================================
# Everything below is for the monster's attacks on the party (see
# mods/idle-rpg/party.js), added after all the rest so nothing above changes:
#   monsters/<kind>/attack/  each monster's two attacks. A pose is a whole
#               picture on the monster's own canvas, laid in place of its
#               pictures while it attacks ("l"/"r" where it faces the target);
#               the rest are what flies and what lands:
#               slime:  spit/{l,r} and glob (a single blow: a gob of goo spat at
#                       one attacker, splat where it lands on them); squash and
#                       puddle (the area attack: it gathers itself, lobs a glob,
#                       and goo splashes over the marked spot)
#               ogre:   swing/{l,r} and arc/{l,r} (a club swing whose gust flies
#                       at one attacker, thud where it lands); slam and quake (the
#                       club smashed down, the ground cracking under the spot)
#               dragon: bite (head down, jaws snapping) and claw (marks on the
#                       one it reaches); breath, fireball/{l,r} and blaze-1, -2
#                       (it breathes a ball of fire that bursts into a blaze
#                       across the spot; the two flicker)
#   foe/        marker, the danger ring on the floor where an area attack will
#               land (AREA_RADIUS wide, half as deep), and hit, the flash on
#               anyone an area attack reaches
#   status/     dizzy-1, dizzy-2 (stars circling a knocked-out head, crossfaded),
#               heal (a green plus rising off whoever is healed) and sparkle
#   classes/<class>/<look>/down/{l,r}, weapons/<class>/<weapon>/down/{l,r} (not
#               the healer's: its potion shows only in its wind-up) and
#               hats/<hat>/<class>/down/{l,r}: knocked out, lying on its back
#               with its head to the left or right, on the standing picture's
#               18x18 canvas, its back on the canvas's bottom row
FIGHT = True  # (a marker for this section)

def grab(draw, *args, **kw):
    # the picture a drawing function above would save, as a grid of colours,
    # instead of writing it
    global save
    kept, got = save, []
    save = lambda name, g, pal={}: got.append([[pal.get(c, c) if c else None for c in row] for row in g])
    try:
        draw("-", *args, **kw)
    finally:
        save = kept
    return got[0]

def mirror(g):
    return [row[::-1] for row in g]

def shout(name, g):
    # a grid of colours, with the dark outline round it where it is see-through
    h, w = len(g), len(g[0])
    o = [r[:] for r in g]
    for y in range(h):
        for x in range(w):
            if g[y][x] is None and near(g, y, x): o[y][x] = OUTLINE
    save(name, o)

def pair(name, g):
    # "r" as drawn, "l" its mirror
    save(f"{name}/r.png", g)
    save(f"{name}/l.png", mirror(g))

# ---- The slime: 32x24, like slime() above. Its single blow: it leans and
# stretches toward its target, mouth open, and spits; its area attack: it
# squashes flat, gathering itself to lob a big glob.
SLIME = {"B": "#4fb3e0", "D": "#3586b8", "L": "#9bdcf5", "G": "#c9efff"}
def slime_pose(name, pose):
    p = Pix(32, 24)
    B, Bd, Bl = SLIME["B"], SLIME["D"], SLIME["L"]
    if pose == "spit":                                             # lunging right, its dome thrown forward
        p.poly([(2, 23), (4, 14), (9, 7), (17, 3), (25, 4), (30, 9), (31, 16), (31, 23)], Bd)
        p.poly([(3, 21), (5, 14), (10, 8), (17, 4), (24, 5), (29, 10), (30, 16), (30, 21)], B)
        p.rect(2, 21, 30, 2, Bd)
        p.ell(14, 8, 3, 2, Bl); p.px(18, 6, Bl)
        p.rect(15, 10, 3, 4, K); p.rect(23, 10, 3, 4, K); p.px(16, 10, WHITE); p.px(24, 10, WHITE)
        p.rect(14, 9, 4, 1, Bd); p.rect(22, 9, 4, 1, Bd)            # brows, frowning
        p.ell(24, 17, 3, 2.5, K); p.rect(23, 18, 3, 1, "#c94040")   # mouth wide, spitting
    else:                                                           # "squash": flat and wide, cheeks full
        p.ell(16, 16, 15, 7, Bd); p.rect(1, 16, 31, 7, Bd)
        p.ell(16, 15, 14, 6, B); p.rect(2, 15, 29, 6, B)
        p.rect(1, 21, 31, 2, Bd)
        p.ell(9, 12, 3, 1, Bl); p.px(13, 11, Bl)
        for x, y in ((9, 14), (10, 15), (11, 16), (10, 17), (9, 18)): p.px(x, y, K)   # eyes squeezed shut: > <
        for x, y in ((22, 14), (21, 15), (20, 16), (21, 17), (22, 18)): p.px(x, y, K)
        p.rect(14, 19, 4, 1, K)                                      # cheeks puffed, mouth pressed
        p.px(6, 18, Bl); p.px(26, 18, Bl)
    p.save(name)

g = grab(slime_pose, "spit")
pair("monsters/slime/attack/spit", g)
save("monsters/slime/attack/squash.png", grab(slime_pose, "squash"))
icon("monsters/slime/attack/glob.png", [                     # what it spits, and lobs
    ".BBB.",
    "BBLGB",
    "BBBLB",
    "DBBBB",
    ".DDD.",
], SLIME)
icon("monsters/slime/attack/splat.png", [                    # a glob landing on someone
    "B.........B",
    "..B.BBB.B..",
    ".BBBBLBBBB.",
    "..BBLGLBB..",
    ".B.BBBBB.B.",
    "...B...B...",
], SLIME)
icon("monsters/slime/attack/puddle.png", [                   # the big glob splashing over the marked spot
    "...B.....B......B......B.....B...",
    ".B....B.....BB.....BB.....B....B.",
    "........BBBBBBBBBBBBBBBBB........",
    "..B..BBBBBLLBBBBBBBBBLLBBBBB..B..",
    "...BBBBBLLGGLBBBBBBBLGGLLBBBBB...",
    ".BBBBBBBBLLBBBBBBBBBBBLLBBBBBBBB.",
    "BBBDBBBBBBBBBBBBBBBBBBBBBBBBBDBBB",
    ".BBDDBBBBBBBBBBBBBBBBBBBBBBBDDBB.",
    "...DDDDBBBBBBBBBBBBBBBBBBBDDDD...",
    ".......DDDDDDDDDDDDDDDDDDD.......",
], SLIME)

# ---- The ogre: 48x48, like ogre() above, its club in its right hand. Its
# single blow: the club swung down and out to one side (the "l" picture is
# the "r" one mirrored: it is near enough symmetric), and a gust of the swing
# flies at the target; its area attack: the club slammed down in front, both
# fists on it, and the ground cracks under the marked spot.
def club(p, outer, inner, studs):
    # the ogre's club, inside a dark edge of its own so it reads over the body
    edge = [(x + (1 if x >= sum(a for a, _ in outer) / len(outer) else -1), y) for x, y in outer]
    p.poly(edge, "#3b2614"); p.poly(outer, "#3b2614")
    p.poly([(x + (0 if x >= sum(a for a, _ in outer) / len(outer) else 1), y + 1) for x, y in outer], OGRE["Wd"])
    p.poly(inner, OGRE["Wl"])
    for x, y in studs: p.rect(x, y, 2, 2, BONE)

OGRE = {"G": "#6f9e3f", "Gd": "#4f7a2c", "Gl": "#93bf5a", "Wd": "#7a5230", "Wl": "#9a6639", "Br": "#5a3d22"}
def ogre_pose(name, pose):
    p = Pix(48, 48)
    G, Gd, Gl, Wd, Wl, Br = (OGRE[k] for k in ("G", "Gd", "Gl", "Wd", "Wl", "Br"))
    p.rect(14, 38, 8, 8, Gd); p.rect(26, 38, 8, 8, Gd)    # legs
    p.rect(12, 44, 11, 3, Br); p.rect(25, 44, 11, 3, Br)
    p.ell(24, 30, 15, 12, Gd); p.ell(23, 29, 14, 11, G); p.ell(24, 32, 9, 7, Gl)
    p.poly([(11, 36), (37, 36), (34, 43), (24, 40), (14, 43)], Wl); p.rect(10, 35, 28, 2, Br); p.rect(22, 34, 4, 4, "#f2c14e")
    if pose == "swing":
        p.ell(7, 29, 5, 8, Gd); p.ell(7, 28, 4, 7, G); p.ell(7, 38, 4, 4, G)        # left arm, as it was
        p.ell(39, 27, 6, 5, Gd); p.ell(39, 26, 5, 4, G)                             # right arm flung out
        p.poly([(35, 25), (38, 23), (45, 33), (42, 35)], "#3b2614"); p.poly([(36, 25), (38, 24), (44, 33), (42, 34)], OGRE["Wd"])  # the haft
        club(p, [(40, 33), (45, 30), (47, 33), (47, 46), (42, 47), (39, 40)], [(42, 34), (45, 32), (46, 35), (45, 44), (43, 45), (41, 39)], ((43, 36), (45, 41), (42, 42)))
        p.ell(38, 27, 3, 3, Gd); p.ell(38, 26, 3, 2, G)                             # its fist on the club
    else:                                                  # "slam": the club heaved up over its head in both fists
        p.ell(9, 17, 4, 10, Gd); p.ell(9, 17, 3, 9, G)      # arms raised
        p.ell(39, 17, 4, 10, Gd); p.ell(39, 17, 3, 9, G)
    p.poly([(10, 8), (14, 12), (13, 18)], Gd); p.poly([(38, 8), (34, 12), (35, 18)], Gd)  # ears
    p.ell(24, 14, 11, 10, Gd); p.ell(23, 13, 10, 9, G)
    p.poly([(15, 8), (23, 11), (24, 11), (32, 8), (32, 10), (15, 10)], Gd)            # brow, knotted
    p.rect(16, 11, 4, 3, "#ffe27a"); p.rect(27, 11, 4, 3, "#ffe27a"); p.px(18, 12, K); p.px(28, 12, K)
    p.rect(22, 13, 4, 4, Gd); p.px(22, 16, K); p.px(25, 16, K)
    p.rect(15, 18, 17, 6, "#3a1f1f"); p.rect(18, 22, 11, 2, "#c94040")                 # bellowing
    p.rect(16, 18, 2, 3, BONE); p.rect(29, 18, 2, 3, BONE); p.rect(20, 18, 2, 2, BONE); p.rect(25, 18, 2, 2, BONE)
    if pose == "slam":                                     # the club across the top, fists on it
        club(p, [(2, 1), (44, 0), (47, 3), (47, 7), (4, 6)], [(4, 2), (44, 2), (46, 4), (45, 5), (5, 4)], ((40, 3), (44, 4), (36, 2)))
        p.ell(9, 6, 3, 3, Gd); p.ell(9, 5, 3, 2, G); p.ell(39, 6, 3, 3, Gd); p.ell(39, 5, 3, 2, G)
    p.save(name)

pair("monsters/ogre/attack/swing", grab(ogre_pose, "swing"))
save("monsters/ogre/attack/slam.png", grab(ogre_pose, "slam"))
icon("monsters/ogre/attack/arc/r.png", [                       # the swing's gust, flying right
    "ww.....",
    ".www...",
    "..wWww.",
    "...wWWw",
    "...wWWw",
    "...wWWw",
    "..wWww.",
    ".www...",
    "ww.....",
], {"w": "#c9a66b", "W": "#f4ecd8"})
icon("monsters/ogre/attack/arc/l.png", [r[::-1] for r in [
    "ww.....",
    ".www...",
    "..wWww.",
    "...wWWw",
    "...wWWw",
    "...wWWw",
    "..wWww.",
    ".www...",
    "ww.....",
]], {"w": "#c9a66b", "W": "#f4ecd8"})
icon("monsters/ogre/attack/thud.png", [                      # where the gust lands on someone
    "w...W...w",
    ".w..w..w.",
    "...wWw...",
    "WwwWWWwwW",
    "...wWw...",
    ".w..w..w.",
    "w...W...w",
], {"w": "#c9a66b", "W": "#f4ecd8"})
icon("monsters/ogre/attack/quake.png", [                     # the ground cracking under the marked spot, rocks and dust thrown up
    "..........s.......S.......s..........",
    "...dd........S..........s......dd....",
    "..dDDd..s...........S.......s.dDDd...",
    ".dDDDDd.....gggggggkggggggg..dDDDDd..",
    "..dDDd...gggggkgggkggkggggggg.dDDd...",
    "......gggggggggkgggkgkgggkgggggg.....",
    "..dd.ggkkggggggkkgkkkggkkgggkkggg.dd.",
    ".dDDdggggkkkgggggkkWkkgggggkkkggggdDDd",
    "..dd.gggggggkkkkkkkkkkkkkkkgggggg.dd.",
    "......ggggkkgggggkgkgkgggkkgggggg....",
    "........ggggggkggkggkggkggggggg......",
    "..........gggggggggkggggggggg........",
], {"d": "#c9a66b", "D": "#f4ecd8", "g": "#9a6639", "k": "#3b2614", "W": "#5a3d22", "s": "#7d8590", "S": "#9aa3ad"})

# ---- The dragon: 80x64, facing left, like dragon() above (the tail is its own
# picture and keeps swaying). Its single blow: it drops its head and bites
# with its jaws wide, and claw marks open on whoever it reaches; its area
# attack: head down, jaws full of fire, it breathes a ball of fire that
# bursts into a blaze across the marked spot.
def dragon_pose(name, pose):
    p = Pix(80, 64)
    R, Rd, Rl = "#c23b3b", "#8f2626", "#e06a5a"
    Wg, Wm, Cr = "#7a1f2b", "#b5483f", "#f2c98a"
    hx, hy, lift = {"bite": (-2, 5, 1), "breath": (-1, 3, 3)}[pose]
    h = lambda pts: [(x + hx, y + hy) for x, y in pts]
    up = lambda pts, tips: [(x, y - lift) if i in tips else (x, y) for i, (x, y) in enumerate(pts)]
    p.poly(up([(44, 34), (52, 6), (62, 14), (70, 4), (76, 26), (62, 38)], (1, 2, 3)), Wg)  # far wing
    p.ell(44, 45, 20, 13, Rd); p.ell(43, 44, 19, 12, R); p.ell(40, 51, 14, 5, Cr)   # body, belly
    p.rect(30, 52, 8, 9, Rd); p.rect(50, 52, 8, 9, Rd)                              # legs
    p.rect(27, 60, 12, 3, Rd); p.rect(47, 60, 12, 3, Rd)
    for x in (27, 31, 35, 47, 51, 55): p.px(x, 62, BONE)
    p.poly(h([(22, 20), (34, 18)]) + [(42, 38), (28, 44)], R)                       # neck
    p.poly(h([(22, 22), (26, 21)]) + [(32, 42), (28, 44)], Cr)
    for i in range(5): p.rect(22 + i + round(hx * (4 - i) / 4), 24 + i * 4 + round(hy * (4 - i) / 4), 4, 1, "#d9a868")
    for x, y in ((34 + hx, 14 + hy), (38, 22), (42, 28), (48, 28), (54, 30), (60, 34)):  # back spikes
        p.poly([(x, y + 5), (x + 2, y), (x + 5, y + 5)], BONE)
    p.poly(up([(40, 36), (46, 8), (58, 16), (66, 2), (72, 22), (58, 36)], (1, 2, 3)), Wm)  # near wing
    p.poly(up([(46, 8), (48, 10), (44, 34), (40, 36)], (0, 1)), Rd); p.poly(up([(66, 2), (68, 4), (60, 34), (58, 36)], (0, 1)), Rd)
    p.ell(19 + hx, 17 + hy, 11, 7, Rd); p.ell(18 + hx, 16 + hy, 10, 6, R)           # head
    fire = pose == "breath"
    p.poly(h([(4, 17), (21, 17), (22, 24), (5, 30)]), "#ff9d3c" if fire else "#3a1f1f")  # mouth: dark, or full of fire
    if fire:
        p.poly(h([(6, 19), (19, 19), (20, 23), (8, 27)]), "#ffe27a"); p.poly(h([(9, 21), (16, 21), (17, 22), (11, 24)]), "#fff3b0")
    else:
        p.poly(h([(7, 28), (19, 22), (21, 24), (9, 29)]), "#c94040")               # tongue
    p.poly(h([(2, 30), (19, 23), (22, 23), (22, 27), (6, 33)]), Rd)                 # lower jaw, dropped
    for x, y in ((5, 29), (9, 28), (13, 26), (17, 25)): p.px(x + hx, y + hy, WHITE)
    p.rect(3 + hx, 10 + hy, 14, 7, R); p.rect(3 + hx, 10 + hy, 14, 1, Rl); p.rect(2 + hx, 12 + hy, 2, 4, R)  # snout
    for x in (6, 9, 12, 15): p.px(x + hx, 17 + hy, WHITE)
    p.rect(4 + hx, 17 + hy, 1, 2, WHITE); p.rect(13 + hx, 17 + hy, 1, 2, WHITE)      # fangs
    p.px(4 + hx, 12 + hy, K); p.rect(17 + hx, 13 + hy, 4, 3, "#ffe27a"); p.rect(18 + hx, 13 + hy, 1, 3, K)
    p.rect(16 + hx, 12 + hy, 6, 1, Rd)                                              # brow, lowered
    if fire:
        p.px(1 + hx, 13 + hy, "#ff9d3c"); p.px(0 + hx, 14 + hy, "#ffe27a")          # smoke and sparks at the nostril
    p.poly(h([(23, 12), (31, 3), (27, 14)]), BONE); p.poly(h([(19, 10), (24, 2), (22, 11)]), BONE)  # horns
    p.save(name)

save("monsters/dragon/attack/bite.png", grab(dragon_pose, "bite"))
save("monsters/dragon/attack/breath.png", grab(dragon_pose, "breath"))
icon("monsters/dragon/attack/claw.png", [                    # three claw marks raking whoever it reaches
    "r...r...r..",
    "Wr..Wr..Wr.",
    ".Wr..Wr..Wr",
    "..Wr..Wr..W",
    "..WW..WW..W",
    "...Wr..Wr..",
    "...Wr..Wr..",
    "....r...r..",
], {"r": "#e2483f", "W": "#ffffff"})
icon("monsters/dragon/attack/fireball/r.png", [               # flying right, trailing flame
    "..r.oo...",
    ".r.ooyyo.",
    "roooyWWyo",
    ".rrooyWyo",
    "..r.oyyo.",
    "......o..",
], {"r": "#e2552f", "o": "#ff9d3c", "y": "#ffe27a", "W": "#fff3b0"})
icon("monsters/dragon/attack/fireball/l.png", [r[::-1] for r in [
    "..r.oo...",
    ".r.ooyyo.",
    "roooyWWyo",
    ".rrooyWyo",
    "..r.oyyo.",
    "......o..",
]], {"r": "#e2552f", "o": "#ff9d3c", "y": "#ffe27a", "W": "#fff3b0"})
BLAZE = {"r": "#e2552f", "o": "#ff9d3c", "y": "#ffe27a", "W": "#fff3b0", "c": "#2a2220", "e": "#c2401f"}
for i, tips in ((1, [
    "......r.........r..........r......",
    ".....ro....r...roo....r...ro......",
    "..r..oy...ro...oyo...ro...yo...r..",
    ".ro.ryyo..oyr.royyo..oyr.oyyr.ro..",
]), (2, [
    "...r.........r.........r.......r..",
    "..ro....r...roo...r....or.....ro..",
    "..yo...ro...oyo..roo...yo..r..yo..",
    ".oyyr.royo.royyo.oyyr.ryyo.ro.yyor",
])):
    icon(f"monsters/dragon/attack/blaze-{i}.png", tips + [
        "royyWyyoroyyyWyyoroyyWWyyorooyWyyo",
        "eoyWWWyyoyyWWWyyyoyWWWWyyoyyWWWyoe",
        "ceooyyyooyyyyyyyoooyyyyoooyyyyooec",
        ".cceeoooeeoooooeeeeoooeeeeoooeecc.",
        "...cccceeeeeeeeeeeeeeeeeeeecccc...",
    ], BLAZE)

# ---- foe/: the marker where an area attack will land, on the floor: a red
# ring AREA_RADIUS (70px) across each way and half as deep, see-through
# inside so whoever stands in it shows; and the flash on whoever it reaches.
def marker():
    w, h = 37, 19                                     # 35x17 inside the dark outline: 140x68 on screen
    cx, cy, rx, ry = 18, 9, 17.5, 8.5
    g = blank(w, h)
    inside = lambda x, y, a, b: ((x - cx) / a) ** 2 + ((y - cy) / b) ** 2 <= 1.0
    for y in range(h):
        for x in range(w):
            if inside(x, y, rx, ry):
                ring = not inside(x, y, rx - 1.6, ry - 1.4)
                inner = not inside(x, y, rx - 4, ry - 2.6) and inside(x, y, rx - 5, ry - 3.4) is False and inside(x, y, rx - 3, ry - 2)
                g[y][x] = "#ff5d5d" if ring else ("#ff5d5daa" if inner else "#ff5d5d4d")
    edge = [r[:] for r in g]                          # the dark outline outside it, so it reads on wood
    for y in range(h):
        for x in range(w):
            if g[y][x] is None and near(g, y, x): edge[y][x] = OUTLINE
    g = edge
    rim = [r[:] for r in g]
    for y in range(h):
        for x in range(w):
            if g[y][x] in ("#ff5d5daa", "#ff5d5d4d") and any(0 <= y+j < h and 0 <= x+i < w and g[y+j][x+i] == "#ff5d5d" for i, j in ((1,0),(-1,0),(0,1),(0,-1))):
                rim[y][x] = "#141a2680"
    save("foe/marker.png", rim)
marker()
icon("foe/hit.png", [                                         # whoever an area attack reaches
    "....W....",
    ".W..r..W.",
    "..rrWrr..",
    "..rWWWr..",
    "WrWWWWWrW",
    "..rWWWr..",
    "..rrWrr..",
    ".W..r..W.",
    "....W....",
], {"r": "#ff5d5d", "W": "#ffffff"})

# ---- status/: over a knocked-out head, stars circling (two pictures of the
# three stars a sixth of a turn apart, crossfaded so they seem to turn), and
# what rises off whoever is healed: a green plus and a sparkle.
def dizzy(i, turn):
    w, h = 23, 9
    g = blank(w, h)
    for k in range(3):
        a = turn + k * 2 * math.pi / 3
        x, y = round(11 + 9.5 * math.cos(a)), round(4 + 3 * math.sin(a))
        far = math.sin(a) < -0.3                                  # behind the head: dimmer
        for dx, dy in ((0, 0), (1, 0), (-1, 0), (0, 1), (0, -1)):
            g[y + dy][x + dx] = "#d9a53a" if far else "#ffd166"
        g[y][x] = "#ffe9a8" if far else "#ffffff"
    big = [[None] * (w + 2) for _ in range(h + 2)]
    for y in range(h):
        for x in range(w): big[y + 1][x + 1] = g[y][x]
    shout(f"status/dizzy-{i}.png", big)
dizzy(1, 0.25)
dizzy(2, 0.25 + math.pi / 3)
icon("status/heal.png", [
    "..ggg..",
    "..gLg..",
    "gggLggg",
    "gLLWLLg",
    "gggLggg",
    "..gLg..",
    "..ggg..",
], {"g": "#3fbf6f", "L": "#9af0b0", "W": "#ffffff"})
icon("status/sparkle.png", ["..L..", "..W..", "LWWWL", "..W..", "..L.."], {"L": "#9af0cf", "W": "#ffffff"})

# ---- Knocked out: each class lying on its back, its head to the left ("l")
# or right ("r"), in every colourway, with its weapon and every hat lying with
# it: the standing picture's grid turned a quarter turn, then let down so its
# back is on the canvas's bottom row (row 16 of 18, the outline under it).
def lie(g, head):
    # a quarter turn of a square grid: the head (its top rows) to the left or right
    n = len(g)
    t = [[g[n - 1 - x][y] for x in range(n)] for y in range(n)] if head == "r" else [[g[x][n - 1 - y] for x in range(n)] for y in range(n)]
    return t

def lay(g, drop):
    # every row moved down `drop` rows
    n = len(g)
    return [[None] * len(g[0]) for _ in range(drop)] + g[:n - drop]

def lying(rows, head):
    # an everyday 16x16 grid lying down, and how far it was let down
    t = lie(canvas(rows, 18, 1), head)
    low = max(y for y, row in enumerate(t) if any(row))
    return t, 16 - low

DOWN = ("l", "r")
for cls, (base, rows) in SPR.items():
    for head in DOWN:
        body, drop = lying(rows, head)
        body = lay(body, drop)
        for name, swaps in looks(cls):
            pal = {**COMMON, **base, **swaps, "#": OUTLINE}
            write(f"{name}/down/{head}.png", png(outlined(body), pal))
        for weapon, (pal, poses) in WEAPONS[cls].items():
            if "stand" not in poses: continue                    # the healer's potion: only in its wind-up
            held = lay(lie(canvas(sparse(poses["stand"], 16), 18, 1), head), drop)
            write(f"weapons/{cls}/{weapon}/down/{head}.png", png(layer(held, body, pal), {}))
        for hat, by_class in HATS.items():
            top = [r.ljust(16, ".") for r in by_class[cls]] + ["." * 16] * (16 - len(by_class[cls]))
            worn = lay(lie(canvas(top, 18, 1), head), drop)
            save(f"hats/{hat}/{cls}/down/{head}.png", overlay(worn, body))
# ---- Weapon effects (effects/): what weapons' elements and the healer's vials
# do in a fight, shown on the monster and its name plate (mods/idle-rpg/effects.js
# names every picture here: EFFECT_ICONS, EFFECT_MARKS, EFFECT_OVERLAYS).
#   effects/icons/   7x7 icons, outlined like the sign's and shown at the same
#                    size: the statuses on the monster's plate (burn, chill,
#                    venom, with its stack count set beside it in the pixel
#                    font, and the hex aura) and the party's auras (haste, might)
#   effects/marks/   weak, resist: an arrow up or down, glyph-high (5x5 inside the
#                    outline, so 7 tall like a glyph), set after a damage number
#                    that hit the monster's weakness or resistance
#   effects/<status>/ small pictures laid over the monster while a status is
#                    on it, a few at a time around its bulk, so they suit every
#                    monster: burn/flame-1, -2 (flames licking up, to flicker
#                    between), chill/crystal and glint (frost crystals and a
#                    sparkle), chain/arc/{l,r} (the second strike's arc), and
#                    venom/drip-1, -2 (green drips, short and long)
# Colours are the attacks' own: fire, frost and venom as their spells, the vials'
# as their potions.
EMBER = {"r": "#e2552f", "o": "#ff9d3c", "y": "#ffe27a", "W": "#fff3b0"}
ICE = {"b": "#4f86c6", "i": "#9fd0f5", "I": "#dff3ff", "W": "#ffffff"}
VENOM = {"x": "#2f7a22", "v": "#6fcf3f", "V": "#a8eb6a", "L": "#e4ffc4"}
EFFECT_ICONS = {
    "burn": ([                                                  # a flame
        "...r...",
        "..ro.r.",
        ".rooro.",
        ".royor.",
        "royyyor",
        "royWyor",
        ".ryWyr.",
    ], EMBER),
    "chill": ([                                                 # a snowflake
        "...i...",
        ".i.I.i.",
        "..iWi..",
        "iIWWWIi",
        "..iWi..",
        ".i.I.i.",
        "...i...",
    ], ICE),
    "venom": ([                                                 # a drop of venom
        "...v...",
        "..vVv..",
        "..vVv..",
        ".vVLVv.",
        ".vVVVv.",
        ".xvVvx.",
        "..xxx..",
    ], VENOM),
    "hex": ([                                                   # an evil eye, in the Hex Vial's purple
        ".......",
        "..ppp..",
        ".pPPPp.",
        "pPPkPPp",
        ".pPPPp.",
        "..ppp..",
        ".......",
    ], {"p": "#7a3fb8", "P": "#d8b4ff", "k": "#2a1640"}),
    "haste": ([                                                 # fast forward, in the Haste Vial's yellow
        "g..g...",
        "Gg.Gg..",
        ".Gg.Gg.",
        "..Gg.Gg",
        ".Gg.Gg.",
        "Gg.Gg..",
        "g..g...",
    ], {"g": "#e8b030", "G": "#fff0b0"}),
    "might": ([                                                 # a fist, in the Might Vial's red
        ".r.r.r.",
        "rRrRrRr",
        "rRrRrRr",
        "rrrrrrr",
        "rDDDDrr",
        "rrrrrr.",
        ".rrrr..",
    ], {"r": "#d63a3a", "R": "#ff9a8a", "D": "#8f2626"}),
}
for name, (rows, pal) in EFFECT_ICONS.items():
    assert len(rows) == 7 and all(len(r) == 7 for r in rows), name
    icon(f"effects/icons/{name}.png", rows, pal)
for name, rows, pal in (
    ("weak", ["..w..", ".wWw.", "wwwww", ".....", "....."], {"w": "#ff8a3c", "W": "#ffd0a0"}),   # it hurts more: up, warm
    ("resist", [".....", ".....", "wwwww", ".wWw.", "..w.."], {"w": "#8a95a6", "W": "#c3cad2"}),  # it hurts less: down, steel
):
    assert len(rows) == 5 and all(len(r) == 5 for r in rows), name
    icon(f"effects/marks/{name}.png", rows, pal)
# On the monster. Each picture is small enough to sit on the slime's dome (its
# bulk is about 9 art px across) and is laid out a few times over a bigger one.
for name, rows in (
    ("flame-1", [                                               # flames licking up, two shapes to flicker between
        "..r...",
        "..or.r",
        ".royor",
        ".ryyo.",
        "royWyr",
        "royWor",
        ".ryyr.",
    ]),
    ("flame-2", [
        "....r.",
        "r..ro.",
        "or.ror",
        "oyroyr",
        "ryWyor",
        "ryWWyr",
        ".ryyr.",
    ]),
):
    assert len(rows) == 7 and all(len(r) == 6 for r in rows), name
    icon(f"effects/burn/{name}.png", rows, EMBER)
icon("effects/chill/crystal.png", [                             # frost crystals growing on it
    "...I.....",
    "..IiI..W.",
    "..bib.Ii.",
    ".b.ibIib.",
    "...bibb..",
    ".Ibbibi..",
    "Iiiiiiib.",
], ICE)
icon("effects/chill/glint.png", [".W.", "WIW", ".W."], ICE)     # a sparkle of frost
ARC = [                                                         # the second strike's arc, out to the right ("r") or left
    "........yW..",
    "...yW..yW.Wy",
    "..yWyWyW....",
    ".yW..yW.....",
    "yW..........",
]
icon("effects/chain/arc/r.png", ARC, {"y": "#ffe27a", "W": "#ffffff"})
icon("effects/chain/arc/l.png", [r[::-1] for r in ARC], {"y": "#ffe27a", "W": "#ffffff"})
for name, rows in (
    ("drip-1", [                                                # venom welling up on it into a bead,
        "vvVvv",
        ".vvv.",
        "..v..",
        ".vVv.",
        ".xvx.",
    ]),
    ("drip-2", [                                                # then the bead falling from it
        "vvVvv",
        ".vvv.",
        "..x..",
        ".....",
        ".....",
        ".vVv.",
        ".vLv.",
        ".xvx.",
    ]),
):
    icon(f"effects/venom/{name}.png", rows, VENOM)

# ---- Biomes (scene/<biome>/): where a raid takes place, ten stages each
# (BIOMES and BIOME_ART in mods/idle-rpg/rules.js; the town is always the
# rampart above). Each biome's backdrop is drawn in the rampart's tile sizes
# and laid the same way, each picture repeated at its own shape across the
# scene: "far" (64x20, in place of the mountains), "mid" (32x16, in place of
# the wall: its bottom rows solid where it meets the ground), "ground" (32x38,
# in place of the planks). Every tile meets its own copy seamlessly (anything
# drawn near an edge wraps round to the other). The two biomes under a roof,
# the caves and hell, have no sky: a "ceiling" (64x16) hangs from the top of
# the scene over a plain dark colour (main.js), and they have their own fixed
# light, drawn into the pictures, instead of the day and the night: where the
# rampart has a torch, the caves have a glowing crystal and hell a fire vent.
# "swatch" is the biome's icon in the stage picker (7x7, outlined like the
# sign's icons). The grounds are mid-tones, so the characters' dark outline,
# the name tags and the HP bars stand out on them as they do on the planks:
# each ground is at least 4.5:1 against the outline on average (tests/view/biomes.test.mjs).
def wrapped(w, h, seed, fill=None):
    # a blank tile and a seeded random source for it
    return blank(w, h, fill), random.Random(seed)

def put(g, x, y, colour):
    # a pixel at (x, y), x wrapping round the tile's width (y outside it is dropped)
    if 0 <= y < len(g): g[y][x % len(g[0])] = colour

def wave(x, w, *terms):
    # a periodic height at column x of a tile w wide: (amplitude, cycles, phase) terms
    return sum(a * math.sin(2 * math.pi * k * x / w + p) for a, k, p in terms)

def blob(g, cx, cy, rx, ry, colour, lit=None, shade=None):
    # a filled ellipse (wrapping sideways), lighter at its top left and darker at its bottom right
    for y in range(int(cy - ry) - 1, int(cy + ry) + 2):
        for x in range(int(cx - rx) - 1, int(cx + rx) + 2):
            u, v = (x + 0.5 - cx) / rx, (y + 0.5 - cy) / ry
            if u * u + v * v <= 1:
                c = colour
                if lit and u + v < -0.7: c = lit
                elif shade and u + v > 0.8: c = shade
                put(g, x, y, c)

def speckle(g, rnd, n, colours, rows=None, keep=None):
    # n single pixels at random, in `rows` (a range of y) and only over a pixel `keep` allows
    h, w = len(g), len(g[0])
    for _ in range(n):
        x, y = rnd.randrange(w), rnd.choice(rows or range(h))
        if keep is None or keep(g[y][x]): g[y][x] = rnd.choice(colours)

# -- The forest: a line of trees, undergrowth, a grass floor
def forest_far():
    g, rnd = wrapped(64, 20, 21)
    for px, top in ((2, 3), (11, 6), (19, 2), (27, 5), (36, 1), (45, 4), (53, 7), (60, 3)):  # far firs, hazy
        for y in range(top, 20):
            half = (y - top) * 0.55 + (0.6 if (y - top) % 4 == 3 else 0)
            for x in range(px - 6, px + 7):
                if abs(x - px) <= half: put(g, x, y, "#5d8c76" if x < px else "#4d7a68")
    for px, top, r in ((6, 9, 5), (16, 10, 4.5), (24, 8, 5.5), (33, 10, 4), (41, 9, 5), (50, 8, 5.5), (58, 10, 4.5)):  # nearer, round crowns
        blob(g, px, top + r, r, r, "#2f5e3c", "#3f7346", "#264d32")
    for y in range(14, 20):
        for x in range(64): g[y][x] = g[y][x] if g[y][x] in ("#3f7346",) else "#2f5e3c" if y < 17 else "#264d32"
    return g

def forest_mid():
    g, rnd = wrapped(32, 16, 22)
    for cx, cy, r in ((3, 9, 4.5), (11, 8, 5), (18, 10, 4), (25, 8, 5.5), (31, 10, 3.5)):
        blob(g, cx, cy, r * 1.1, r, "#3b6e35", "#579245", "#2c5530")
    for y in range(11, 16):
        for x in range(32): g[y][x] = "#2c5530" if y > 12 or g[y][x] is None else g[y][x]
    speckle(g, rnd, 22, ["#579245", "#4a8a3e"], range(5, 14), lambda c: c in ("#3b6e35", "#2c5530"))
    for x, y in ((6, 7), (20, 8), (27, 6)): g[y][x] = "#d84a4a"           # berries
    for x, y in ((14, 12), (29, 13)): g[y][x] = "#f4ecd8"                # a flower or two in the shade
    return g

def forest_ground():
    g, rnd = wrapped(32, 38, 23, "#7aa84c")
    for y in range(38):
        for x in range(32):
            n = rnd.random()
            g[y][x] = "#73a046" if n < 0.22 else "#82b052" if n < 0.38 else "#7aa84c"
    for x in range(32):                                                  # the undergrowth's shade along the back
        g[0][x] = "#5f8f3c"
        if rnd.random() < 0.6: g[1][x] = "#6a9842"
    for _ in range(40):                                                  # blades, a light pixel over a dark one
        x, y = rnd.randrange(32), rnd.randrange(3, 37)
        g[y][x], g[y + 1][x] = "#94c25c", "#64923e"
    speckle(g, rnd, 5, ["#f2c14e", "#f4ecd8", "#e8a0c0"], range(4, 36))  # flowers
    speckle(g, rnd, 4, ["#8a6a3e"], range(4, 36))                        # bare earth
    return g

# -- The hills: rolling hills either side of a valley, a fenced knoll, a dirt path
def hills_far():
    g = blank(64, 20)
    for x in range(64):
        back = 6 + wave(x, 64, (2.2, 1, 0.4), (1.2, 3, 2.0))             # the far side of the valley, hazy
        front = 12 + wave(x, 64, (3.4, 2, -0.6), (0.8, 5, 1.1))          # the near hills, dipping into the valley twice
        for y in range(20):
            if y >= front: g[y][x] = "#76b25c" if y < front + 1 else "#5e9a4e"
            elif y >= back: g[y][x] = "#a3c8a0" if y < back + 1 else "#86b08a"
    for x in (5, 9, 30, 44, 47, 57):                                     # trees dotted on the far side
        y = int(6 + wave(x, 64, (2.2, 1, 0.4), (1.2, 3, 2.0))) + 1
        put(g, x, y, "#5f8f66"); put(g, x, y - 1, "#5f8f66"); put(g, x + 1, y, "#5f8f66")
    return g

def hills_mid():
    g, rnd = wrapped(32, 16, 32)
    for x in range(32):
        top = 7 + wave(x, 32, (2.0, 1, 0.0), (0.7, 3, 1.3))
        for y in range(16):
            if y >= top: g[y][x] = "#78b35a" if y < top + 1 else "#5a9447"
    for x in (4, 12, 20, 28):                                            # a fence along the knolls
        top = int(7 + wave(x, 32, (2.0, 1, 0.0), (0.7, 3, 1.3)))
        for y in range(top - 5, top + 1): g[y][x] = "#7a5230"
        g[top - 5][x] = "#9a6639"
    for x in range(32):
        top = int(7 + wave(x, 32, (2.0, 1, 0.0), (0.7, 3, 1.3)))
        for d in (3, 1):
            if g[top - d][x] != "#7a5230": g[top - d][x] = "#9a6639"
    speckle(g, rnd, 16, ["#4a7f3b", "#6aa652"], range(8, 16), lambda c: c == "#5a9447")
    for x, y in ((8, 12), (24, 13)): g[y][x], g[y][x + 1] = "#9aa3ad", "#7d8590"  # stones
    return g

def hills_ground():
    g, rnd = wrapped(32, 38, 33, "#c29a64")
    for y in range(38):
        for x in range(32):
            n = rnd.random()
            g[y][x] = "#b98f5b" if n < 0.25 else "#c9a26c" if n < 0.4 else "#c29a64"
    for base in (11, 26):                                                # cart ruts, wandering
        for x in range(32):
            y = base + round(wave(x, 32, (1.2, 1, base)))
            g[y][x] = "#a98252"
            if rnd.random() < 0.5: g[y + 1][x] = "#b48a57"
    for x in range(32):                                                  # grass at the path's edge, along the back
        for y in range(0, 2 + (1 if rnd.random() < 0.4 else 0)): g[y][x] = "#6e9c44" if y == 0 else "#7fa84e"
    for _ in range(14):                                                  # pebbles, lit on top
        x, y = rnd.randrange(32), rnd.randrange(5, 36)
        g[y][x], g[y + 1][x] = "#d8c4a4", "#8f7f6e"
    speckle(g, rnd, 6, ["#7fa84e"], range(4, 37))                        # a tuft here and there
    return g

# -- The caves: a dark vault, stalactites, crystals glowing in the rock, a flagstone floor
CAVE = {"rock": "#3c3749", "lit": "#4e4a5e", "dark": "#2c2937", "deep": "#16141f",
        "c": "#5fd0e6", "C": "#b8f4ff", "cd": "#3a8fb0", "v": "#a77fe0", "V": "#e0ccff"}
def crystals(g, x, y, big, pal=CAVE):
    # a little cluster of crystals standing on (x, y): a tall one and a short one beside it
    for i in range(big):
        put(g, x, y - i, pal["C"] if i == big - 1 else pal["c"]); put(g, x + 1, y - i, pal["cd"] if i < big - 1 else pal["c"])
    for i in range(max(1, big - 2)): put(g, x - 1, y - i, pal["c"] if i else pal["cd"])

def caves_ceiling():
    g, rnd = wrapped(64, 16, 41)
    for x in range(64):
        d = 3 + wave(x, 64, (1.2, 2, 0.3), (0.8, 5, 1.0))
        for y in range(16):
            if y < d: g[y][x] = "#221f2c" if y < d - 2 else CAVE["dark"]
    for px, n, w in ((3, 9, 3), (12, 5, 2), (19, 12, 3), (28, 6, 2), (35, 10, 3), (44, 4, 2), (50, 13, 3), (58, 7, 2)):
        for i in range(n):
            half = (w - 1) * (1 - i / n) / 2 + 0.3
            for x in range(px - 2, px + 3):
                if abs(x - px) <= half: put(g, x, 2 + i, CAVE["lit"] if x < px else CAVE["rock"] if x == px else CAVE["dark"])
        put(g, px, 2 + n, "#5d576e")                                     # the wet tip catches the light
    for x, y in ((8, 1), (31, 2), (55, 1)): put(g, x, y, CAVE["c"])      # glints in the vault
    return g

def caves_far():
    g, rnd = wrapped(64, 20, 42)
    for x in range(64):
        top = 6 + wave(x, 64, (2.5, 2, 0.8), (1.5, 5, 0.1)) + rnd.choice((0, 0, 1))
        for y in range(20):
            if y >= top: g[y][x] = "#2a2636" if y > top + 1 else "#332e42"
    for x in (9, 24, 40, 55):                                            # pillars of rock, lit on the left
        for y in range(3, 20):
            put(g, x, y, "#3a3549"); put(g, x + 1, y, "#2f2b3c"); put(g, x - 1, y, "#332e42" if y > 5 else None)
    for x, y, big, pal in ((4, 12, 4, CAVE), (17, 13, 3, {**CAVE, "c": CAVE["v"], "C": CAVE["V"], "cd": "#6a4fa0"}), (32, 11, 5, CAVE), (47, 13, 3, CAVE), (60, 12, 4, {**CAVE, "c": CAVE["v"], "C": CAVE["V"], "cd": "#6a4fa0"})):
        for dx in (-2, 2):                                               # a faint halo round each
            put(g, x + dx, y - 1, "#2f4555" if pal is CAVE else "#3d3155")
        crystals(g, x, y, big, pal)
    return g

def caves_mid():
    g, rnd = wrapped(32, 16, 43)
    for cx, cy, rx, ry in ((4, 11, 5, 5), (13, 12, 4, 4), (21, 10, 5.5, 6), (29, 12, 4, 4)):
        blob(g, cx, cy, rx, ry, "#4a4558", "#5d576e", "#38334a")
    for y in range(12, 16):
        for x in range(32): g[y][x] = g[y][x] if y < 14 and g[y][x] else "#38334a"
    speckle(g, rnd, 14, ["#433e52", "#55506a"], range(6, 14), lambda c: c == "#4a4558")
    crystals(g, 9, 9, 4)
    crystals(g, 26, 9, 3, {**CAVE, "c": CAVE["v"], "C": CAVE["V"], "cd": "#6a4fa0"})
    return g

def caves_ground():
    # flagstones of every shape: each pixel takes the tone of the nearest of a
    # few seeded points (wrapping round the tile), with a joint where two are about as near
    g, rnd = wrapped(32, 38, 44)
    tones = ["#918ea0", "#89869a", "#9895a7", "#8e8b9d"]
    seeds = [(rnd.uniform(0, 32), rnd.uniform(0, 38), tones[i % len(tones)]) for i in range(11)]
    for y in range(38):
        for x in range(32):
            d = sorted((math.hypot(min(abs(x + 0.5 - sx), 32 - abs(x + 0.5 - sx)), (y + 0.5 - sy) * 1.3), t) for sx, sy, t in seeds)
            g[y][x] = "#737184" if d[1][0] - d[0][0] < 1.1 else d[0][1]
    speckle(g, rnd, 12, ["#a19eaf"], range(1, 38), lambda c: c in tones)  # lit grit
    speckle(g, rnd, 6, ["#76738a"], range(1, 38), lambda c: c in tones)   # chips
    speckle(g, rnd, 2, [CAVE["c"]], range(3, 36), lambda c: c in tones)   # a shard of crystal
    for x in range(32): g[0][x] = "#4f4c5e"                              # the rocks' shadow along the back
    return g

# -- Hell: red-black rock, falls of lava glowing below, a scorched floor
HELL = {"rock": "#3a1612", "lit": "#4e1f19", "dark": "#2a0f0d", "deep": "#1c0807", "r": "#e2552f", "o": "#ff9d3c", "y": "#ffe27a", "W": "#fff3b0", "c": "#c2401f"}
def hell_ceiling():
    g, rnd = wrapped(64, 16, 51)
    for x in range(64):
        d = 3 + wave(x, 64, (1.0, 3, 0.2), (0.8, 4, 1.4))
        for y in range(16):
            if y < d: g[y][x] = HELL["dark"] if y < d - 1 else HELL["rock"]
    for px, n in ((5, 8), (14, 4), (22, 11), (31, 6), (39, 9), (48, 5), (55, 12), (62, 4)):
        for i in range(n):
            half = 1.2 * (1 - i / n) + 0.3
            for x in range(px - 2, px + 3):
                if abs(x - px) <= half: put(g, x, 2 + i, "#5a1a12" if x < px else HELL["rock"] if x == px else HELL["dark"])
        put(g, px, 2 + n, HELL["r"] if n > 7 else "#8f2626")             # the longest drip a bead of lava
    return g

def hell_far():
    g, rnd = wrapped(64, 20, 52)
    for x in range(64):
        top = 7 + wave(x, 64, (3.0, 3, 0.5), (1.5, 7, 2.0))
        for y in range(20):
            if y >= top: g[y][x] = "#3a1410" if y > top else "#4e1f19"
    for px, top, h in ((7, 1, 10), (26, 3, 8), (45, 0, 11), (57, 4, 7)):   # spires
        for i in range(h):
            half = 0.4 + 2.2 * i / h
            for x in range(px - 3, px + 4):
                if abs(x - px) <= half: put(g, x, top + i, "#4e1f19" if x < px else "#3a1410")
    for px in (17, 37):                                                  # lava falls down the rock
        for y in range(5, 20):
            top = 7 + wave(px, 64, (3.0, 3, 0.5), (1.5, 7, 2.0))
            if y >= top - 1:
                put(g, px, y, HELL["y"] if y % 3 else HELL["W"]); put(g, px - 1, y, HELL["o"]); put(g, px + 1, y, HELL["r"])
    for y in range(16, 20):                                              # the glow of the lava below
        for x in range(64):
            if (x * 7 + y * 3) % (5 - (y - 16)) == 0: g[y][x] = "#6a2216"
    return g

def hell_mid():
    g, rnd = wrapped(32, 16, 53)
    for cx, cy, rx, ry in ((3, 11, 5, 5), (12, 12, 4.5, 4), (20, 10, 5, 6), (29, 12, 4.5, 4.5)):
        blob(g, cx, cy, rx, ry, "#4a2a24", "#5e362e", "#3a1f1a")
    for y in range(12, 16):
        for x in range(32): g[y][x] = g[y][x] if y < 14 and g[y][x] else "#3a1f1a"
    for x0, y0, path in ((5, 8, (1, 1, 0, 1, 1)), (19, 7, (0, 1, 1, 0, 1, 1)), (27, 10, (1, 0, 1))):  # cracks glowing with lava
        x, y = x0, y0
        for step in path:
            put(g, x, y, HELL["r"] if y < 11 else HELL["o"]); x += step; y += 1
    for x in range(8, 16): g[14][x] = HELL["o"] if x % 3 else HELL["y"]  # a seam of lava along the foot
    for x in range(9, 15): g[13][x] = HELL["r"]
    return g

def hell_ground():
    g, rnd = wrapped(32, 38, 54)
    tones = ["#a08376", "#98796c", "#a68a7c"]
    for y in range(38):
        for x in range(32): g[y][x] = rnd.choice(tones)
    for _ in range(9):                                                   # scorch marks
        cx, cy = rnd.randrange(32), rnd.randrange(3, 35)
        blob(g, cx, cy, rnd.choice((2.5, 3.5)), 1.5, "#836659")
    for x0, y0, steps in ((20, 22, (1, 0, 1)),):                         # a glowing crack
        x, y = x0, y0
        for i, s in enumerate(steps):
            put(g, x, y, HELL["o"] if i % 2 else HELL["r"]); put(g, x, y + 1, "#6e3a2c"); x += 1; y += s
    speckle(g, rnd, 14, ["#b8a49a"], range(1, 38), lambda c: c in tones)  # ash
    for x in range(32): g[0][x] = "#6e5249"                              # the rocks' shadow along the back
    return g

for biome, parts in (
    ("forest", {"far": forest_far, "mid": forest_mid, "ground": forest_ground}),
    ("hills", {"far": hills_far, "mid": hills_mid, "ground": hills_ground}),
    ("caves", {"far": caves_far, "mid": caves_mid, "ground": caves_ground, "ceiling": caves_ceiling}),
    ("hell", {"far": hell_far, "mid": hell_mid, "ground": hell_ground, "ceiling": hell_ceiling}),
):
    for part, draw in parts.items():
        save(f"scene/{biome}/{part}.png", draw())

save("scene/caves/crystal.png", chars([                                 # in place of a torch: a cluster on a rock
    "...W....",
    "..WcC...",
    "..WcC...",
    "..WcC.W.",
    "W.WcC.cC",
    "cCWccCcC",
    "cCWccCcC",
    "cCcccCcC",
    ".rRRRRr.",
    "rRRrRRRr",
    "RRrRRrRR",
    "rRRRRRRr",
], {"W": "#b8f4ff", "c": "#5fd0e6", "C": "#3a8fb0", "r": "#4a4558", "R": "#5d576e"}))
save("scene/hell/vent.png", chars([                                     # in place of a torch: fire from a crack in a rock
    "...y....",
    "..yo....",
    "..yoy.y.",
    ".yooyyo.",
    ".oWooyo.",
    ".orWWoo.",
    "..rrrro.",
    ".RRrrRR.",
    "RRmRRmRR",
    "RmRRRRmR",
    "RRRmRRRR",
    "RRRRRRRR",
], {"y": "#ffe27a", "o": "#ff9d3c", "r": "#e2552f", "W": "#fff3b0", "R": "#4a2a24", "m": "#c2401f"}))
for biome, rows, pal in (                                                # the stage picker's swatches
    ("forest", ["bbbgbbb", "bbgggbb", "bgggggb", "bbgggbb", "bgggggb", "bbbtbbb", "GGGGGGG"],
     {"b": "#6db6ee", "g": "#2f6b3c", "t": "#6e4525", "G": "#7aa84c"}),
    ("hills", ["bbbbbbb", "bbbbbbb", "bbhhbbb", "bhhhhbH", "hhhhHHH", "hhHHHHH", "ddddddd"],
     {"b": "#6db6ee", "h": "#86b08a", "H": "#5e9a4e", "d": "#c29a64"}),
    ("caves", ["rrrrrrr", "rkrkkrk", "kkkkkkk", "kkkkckk", "kckkCck", "kCckCck", "sssssss"],
     {"r": "#3c3749", "k": "#16141f", "c": "#5fd0e6", "C": "#b8f4ff", "s": "#918ea0"}),
    ("hell", ["rrrrrrr", "rkrkkrk", "kkkkkkk", "kkkokkk", "kkoyokk", "koyyyok", "aaaaaaa"],
     {"r": "#3a1612", "k": "#1c0807", "o": "#ff9d3c", "y": "#ffe27a", "a": "#a08376"}),
):
    icon(f"scene/{biome}/swatch.png", rows, pal)

# ---- The stage picker: a folded map (icons/), left of the gear in the top-right corner ----
icon("icons/map.png", [
    "ppp..ppp",
    "pppSSrpr",
    "pppSSprp",
    "pppSdrpr",
    "pppSSppp",
    "ppdSSppp",
    "pdpSSppp",
    "...SS...",
], {"p": "#e8d7a8", "S": "#c4ab78", "d": "#7a5230", "r": "#d0403a"})
