#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
glitch_bmp.py  ·  fabrique de splash.bmp corrompu (HackBGRT)
-------------------------------------------------------------
Même pipeline que le playground canvas, en ligne de commande :
  noirs sales -> pixel sort -> bandes -> aberration -> echo -> scanlines -> vignette

Sortie GARANTIE : BMP 24-bit non compressé (BI_RGB), en-tete 54 octets, nomme splash.bmp.
HackBGRT ne scale pas -> on rend en 1920x1080 avec les bords fondus au noir (vignette).

USAGE TYPIQUE
  # 1) sur ton image gen AI, avec les reglages exportes du playground :
  python glitch_bmp.py mon_image.png --settings reglages.json -o splash.bmp

  # 2) base procedurale pure (sans image source) :
  python glitch_bmp.py --gen field --seed 1337 -o splash.bmp
  python glitch_bmp.py --gen shards
  python glitch_bmp.py --gen mesh

  # 3) overrides ponctuels :
  python glitch_bmp.py img.png --ab-mag 11 --no-scan --seed 42

Le pont propre : dans le playground -> "copier reglages" -> coller dans reglages.json
-> --settings reglages.json. Les ids de parametres sont identiques des deux cotes.

Deps : pip install pillow numpy
"""

import argparse, json, sys, math
import numpy as np
from PIL import Image, ImageDraw

# ---------------------------------------------------------------- defaults
# (memes valeurs que le playground)
DEFAULTS = {
    "posterize": 8, "noise": 0.35, "lift": 0.12,
    "sortThreshold": 0.6, "sortLength": 90, "sortVertical": False,
    "bandFreq": 0.06, "bandAmount": 150, "bandHeight": 30,
    "abMag": 7.0, "abAngle": 0.0,
    "echoCount": 3, "echoDist": 14, "echoAngle": 20.0, "echoFalloff": 0.55,
    "scanIntensity": 0.22, "scanTear": 9,
    "vigSize": 0.5, "vigSoft": 0.5,
}
TOGGLES_DEFAULT = {k: True for k in
    ["blacks", "sort", "band", "ab", "echo", "scan", "vignette"]}


# ---------------------------------------------------------------- sources
def cover_fit(img: Image.Image, W: int, H: int) -> Image.Image:
    """Redimensionne en 'cover' puis recadre au centre vers W x H."""
    img = img.convert("RGB")
    ar, tr = img.width / img.height, W / H
    if ar > tr:
        nh = H; nw = int(round(H * ar))
    else:
        nw = W; nh = int(round(W / ar))
    img = img.resize((nw, nh), Image.LANCZOS)
    x0 = (nw - W) // 2; y0 = (nh - H) // 2
    return img.crop((x0, y0, x0 + W, y0 + H))


def gen_field(W, H, seed):
    """Bruit fractal sombre, filaments lumineux, leger tint cyan."""
    rng = np.random.default_rng(seed)
    acc = np.zeros((H, W), np.float32)
    amp = 1.0
    for oct_ in range(5):
        sw = max(2, W // (2 ** (5 - oct_)))
        sh = max(2, H // (2 ** (5 - oct_)))
        small = rng.random((sh, sw)).astype(np.float32)
        up = np.asarray(Image.fromarray((small * 255).astype(np.uint8))
                        .resize((W, H), Image.BILINEAR), np.float32) / 255.0
        acc += up * amp
        amp *= 0.55
    acc /= acc.max() + 1e-6
    acc = np.power(acc, 3.2)                 # ecrase les ombres -> mostly black
    arr = np.zeros((H, W, 3), np.float32)
    arr[..., 0] = acc * 200
    arr[..., 1] = acc * 225
    arr[..., 2] = acc * 255                  # leger bias bleu
    return arr


def gen_shards(W, H, seed):
    rng = np.random.default_rng(seed)
    im = Image.new("RGB", (W, H), (0, 0, 0)); d = ImageDraw.Draw(im)
    s = W / 1280.0
    for _ in range(2 + int(rng.integers(0, 3))):
        fx, fy = rng.random() * W, rng.random() * H
        for _ in range(20 + int(rng.integers(0, 30))):
            a = rng.random() * 6.283
            ln = (150 + rng.random() * 500) * s
            col = (255, 90, 120) if rng.random() < 0.12 else (200, 230, 255)
            v = 0.45 + rng.random() * 0.5
            c = tuple(int(ch * v) for ch in col)
            d.line([(fx, fy), (fx + math.cos(a) * ln, fy + math.sin(a) * ln)],
                   fill=c, width=1)
    return np.asarray(im, np.float32)


def gen_mesh(W, H, seed):
    rng = np.random.default_rng(seed)
    im = Image.new("RGB", (W, H), (0, 0, 0)); d = ImageDraw.Draw(im)
    s = W / 1280.0
    N = 60 + int(rng.integers(0, 60))
    pts = [(rng.random() * W, rng.random() * H) for _ in range(N)]
    maxd = 140 * s
    for i in range(N):
        for j in range(i + 1, N):
            dx = pts[i][0] - pts[j][0]; dy = pts[i][1] - pts[j][1]
            dd = math.hypot(dx, dy)
            if dd < maxd:
                v = int((1 - dd / maxd) * 90)
                d.line([pts[i], pts[j]], fill=(int(v * 0.6), int(v * 0.8), v), width=1)
    for p in pts:
        r = int((1 + rng.random() * 2.5) * s) + 1
        d.ellipse([p[0] - r, p[1] - r, p[0] + r, p[1] + r], fill=(220, 240, 255))
    return np.asarray(im, np.float32)


# ---------------------------------------------------------------- effets
def luminance(arr):
    return 0.299 * arr[..., 0] + 0.587 * arr[..., 1] + 0.114 * arr[..., 2]


def fx_dirty_blacks(arr, p, seed):
    rng = np.random.default_rng(seed ^ 0x1111)
    H, W, _ = arr.shape
    levels = max(2, int(round(p["posterize"]))); q = 255.0 / (levels - 1)
    L = luminance(arr) / 255.0
    sw = np.clip(1 - 2 * L, 0, 1)[..., None]
    pv = np.round(arr / q) * q
    arr[:] = arr * (1 - sw) + pv * sw
    n = (rng.random((H, W)) * 2 - 1)[..., None] * p["noise"] * 120 * sw
    arr += n + p["lift"] * 40 * sw
    return arr


def _pixel_sort_h(arr, thr, maxlen):
    H, W, _ = arr.shape
    for y in range(H):
        row = arr[y]
        l = 0.299 * row[:, 0] + 0.587 * row[:, 1] + 0.114 * row[:, 2]
        x = 0
        while x < W:
            while x < W and l[x] < thr:
                x += 1
            start = x
            while x < W and l[x] >= thr and (x - start) < maxlen:
                x += 1
            if x - start > 1:
                seg = row[start:x]
                k = 0.299 * seg[:, 0] + 0.587 * seg[:, 1] + 0.114 * seg[:, 2]
                row[start:x] = seg[np.argsort(k)]
    return arr


def fx_pixel_sort(arr, p, seed):
    thr = p["sortThreshold"] * 255.0
    maxlen = max(2, int(round(p["sortLength"])))
    if p.get("sortVertical"):
        _pixel_sort_h(np.swapaxes(arr, 0, 1), thr, maxlen)   # vue -> ecrit dans arr
    else:
        _pixel_sort_h(arr, thr, maxlen)
    return arr


def fx_band_displace(arr, p, seed):
    rng = np.random.default_rng(seed ^ 0x2222)
    H, W, _ = arr.shape
    src = arr.copy()
    maxoff = p["bandAmount"]
    y = 0
    while y < H:
        if rng.random() < p["bandFreq"]:
            h = 2 + int(rng.integers(0, max(1, int(p["bandHeight"]))))
            off = int(round((rng.random() * 2 - 1) * maxoff))
            yend = min(H, y + h)
            arr[y:yend] = np.roll(src[y:yend], off, axis=1)   # roll = wrap (comme le canvas)
            y = yend
        else:
            y += 1 + int(rng.integers(0, 8))
    return arr


def fx_aberration(arr, p, seed):
    H, W, _ = arr.shape
    src = arr.copy()
    r = math.radians(p["abAngle"])
    dx = int(round(math.cos(r) * p["abMag"]))
    dy = int(round(math.sin(r) * p["abMag"]))
    yiR = np.clip(np.arange(H) + dy, 0, H - 1); xiR = np.clip(np.arange(W) + dx, 0, W - 1)
    yiB = np.clip(np.arange(H) - dy, 0, H - 1); xiB = np.clip(np.arange(W) - dx, 0, W - 1)
    arr[..., 0] = src[np.ix_(yiR, xiR)][..., 0]
    arr[..., 2] = src[np.ix_(yiB, xiB)][..., 2]
    return arr


def _shift_zero(a, ox, oy):
    """new(x,y)=a(x-ox,y-oy), 0 hors champ."""
    H, W = a.shape[:2]
    res = np.zeros_like(a)
    dx0, dx1 = max(0, ox), min(W, W + ox)
    dy0, dy1 = max(0, oy), min(H, H + oy)
    if dx1 > dx0 and dy1 > dy0:
        res[dy0:dy1, dx0:dx1] = a[dy0 - oy:dy1 - oy, dx0 - ox:dx1 - ox]
    return res


def fx_echo(arr, p, seed):
    count = int(round(p["echoCount"]))
    if count <= 0:
        return arr
    base = arr.copy()
    r = math.radians(p["echoAngle"])
    for k in range(1, count + 1):
        ox = int(round(math.cos(r) * p["echoDist"] * k))
        oy = int(round(math.sin(r) * p["echoDist"] * k))
        op = p["echoFalloff"] ** k
        arr += _shift_zero(base, ox, oy) * op
    np.clip(arr, 0, 255, out=arr)
    return arr


def fx_scanlines(arr, p, seed):
    rng = np.random.default_rng(seed ^ 0x3333)
    H, W, _ = arr.shape
    if p["scanTear"] > 0:
        src = arr.copy()
        for y in range(H):
            if rng.random() < 0.15:
                off = int(round((rng.random() * 2 - 1) * p["scanTear"]))
                arr[y] = np.roll(src[y], off, axis=0)
    inten = p["scanIntensity"]
    if inten > 0:
        arr[0::2] *= (1 - inten)
    return arr


def fx_vignette(arr, p, seed):
    H, W, _ = arr.shape
    inner = p["vigSize"]; soft = max(0.001, p["vigSoft"])
    ny = np.abs(np.linspace(-1, 1, H))[:, None]
    nx = np.abs(np.linspace(-1, 1, W))[None, :]
    dd = np.maximum(nx, ny)
    t = np.clip((dd - inner) / soft, 0, 1)
    m = np.where(dd > inner, 1 - t * t * (3 - 2 * t), 1.0)
    arr *= m[..., None]
    return arr


PIPELINE = [
    ("blacks",   fx_dirty_blacks),
    ("sort",     fx_pixel_sort),
    ("band",     fx_band_displace),
    ("ab",       fx_aberration),
    ("echo",     fx_echo),
    ("scan",     fx_scanlines),
    ("vignette", fx_vignette),
]


# ---------------------------------------------------------------- io
def save_bmp(arr, path):
    """Ecrit un BMP 24-bit non compresse (Pillow -> BI_RGB, en-tete 54 o)."""
    out = np.clip(arr, 0, 255).astype(np.uint8)
    Image.fromarray(out, "RGB").save(path, format="BMP")


def load_settings(path):
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)
    params = dict(DEFAULTS); params.update(data.get("params", {}))
    toggles = dict(TOGGLES_DEFAULT); toggles.update(data.get("toggles", {}))
    seed = int(data.get("seed", 1337))
    source = data.get("source", "field")
    return params, toggles, seed, source


# ---------------------------------------------------------------- main
def main():
    ap = argparse.ArgumentParser(
        description="Glitch -> splash.bmp 24-bit pour HackBGRT.",
        formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("input", nargs="?", help="image source (sinon --gen)")
    ap.add_argument("-o", "--out", default="splash.bmp", help="defaut: splash.bmp")
    ap.add_argument("--gen", choices=["field", "shards", "mesh"], default="field",
                    help="generateur si pas d'image (defaut: field)")
    ap.add_argument("--seed", type=int, default=1337)
    ap.add_argument("--width", type=int, default=1920)
    ap.add_argument("--height", type=int, default=1080)
    ap.add_argument("--settings", help="reglages.json exporte du playground (override)")
    # toggles
    for k in TOGGLES_DEFAULT:
        ap.add_argument(f"--no-{k}", action="store_true", help=f"desactive l'effet {k}")
    # quelques overrides pratiques
    ap.add_argument("--posterize", type=float)
    ap.add_argument("--ab-mag", type=float, dest="abMag")
    ap.add_argument("--echo-count", type=int, dest="echoCount")
    ap.add_argument("--vig-size", type=float, dest="vigSize")
    args = ap.parse_args()

    params = dict(DEFAULTS)
    toggles = dict(TOGGLES_DEFAULT)
    seed = args.seed
    source = args.gen

    if args.settings:
        params, toggles, seed, source = load_settings(args.settings)

    # overrides CLI prioritaires
    for key in ("posterize", "abMag", "echoCount", "vigSize"):
        v = getattr(args, key, None)
        if v is not None:
            params[key] = v
    for k in TOGGLES_DEFAULT:
        if getattr(args, f"no_{k}"):
            toggles[k] = False
    if args.seed != 1337:
        seed = args.seed

    W, H = args.width, args.height

    # source
    if args.input:
        arr = np.asarray(cover_fit(Image.open(args.input), W, H), np.float32)
        src_desc = f"image '{args.input}'"
    else:
        gen = {"field": gen_field, "shards": gen_shards, "mesh": gen_mesh}[source]
        arr = gen(W, H, seed)
        src_desc = f"generateur '{source}'"

    # pipeline
    applied = []
    for key, fn in PIPELINE:
        if toggles.get(key, True):
            fn(arr, params, seed)
            applied.append(key)

    save_bmp(arr, args.out)

    # verif rapide de l'en-tete
    with open(args.out, "rb") as f:
        head = f.read(30)
    import struct
    bitcount = struct.unpack_from("<H", head, 28)[0]
    offset = struct.unpack_from("<I", head, 10)[0]
    print(f"OK  {args.out}")
    print(f"    source    : {src_desc}  (graine {seed})")
    print(f"    dimensions: {W}x{H}")
    print(f"    effets    : {', '.join(applied) if applied else '(aucun)'}")
    print(f"    BMP       : {bitcount}-bit, offset pixels {offset} o "
          f"{'[OK 24-bit/54o]' if (bitcount == 24 and offset == 54) else '[!! verifier]'}")


if __name__ == "__main__":
    sys.exit(main())
