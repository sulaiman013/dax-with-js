"""
Subset and embed the two design fonts.

The prototype pulled Space Grotesk and JetBrains Mono from Google Fonts at
runtime. Inside the HTML Content visual that is a stylesheet request plus one
woff2 per weight, from a null-origin iframe, on a tenant that may well block
fonts.gstatic.com outright. And a font that arrives late is worse than one that
never arrives: the whole dashboard reflows after first paint.

So: take only the LATIN subset, keep only the glyphs this dashboard can actually
render, and inline the result as base64. Everything here is a fixed input, so it
belongs at build time.
"""
import re, io, base64, urllib.request, sys
from fontTools.ttLib import TTFont
from fontTools.subset import Subsetter, Options

UA = ("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
      "(KHTML, like Gecko) Chrome/120.0 Safari/537.36")

# Everything the dashboard can draw: store and product names, city names,
# category names, month labels, currency, the delta triangles, the middot.
GLYPHS = (
    "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
    "abcdefghijklmnopqrstuvwxyz"
    "0123456789"
    " .,:;!?'\"()[]{}/\\|-_+=<>@#$%^&*~`"
    "·"   # middle dot
    "▲▼"  # up / down triangles
    "−"   # minus sign
    "…"   # ellipsis
    " "   # nbsp
)

# Four faces, not five. JetBrains Mono 700 costs 31KB of base64 and the design
# uses it in no more than a couple of places, where 500 is indistinguishable at
# 10px. Weight coverage is a budget like any other.
WANT = [
    ("JetBrains Mono", 400), ("JetBrains Mono", 500),
    ("Space Grotesk", 500),  ("Space Grotesk", 700),
]

css = urllib.request.urlopen(urllib.request.Request(
    "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500;700"
    "&family=Space+Grotesk:wght@500;700&display=swap",
    headers={"User-Agent": UA})).read().decode("utf-8")

# Split into @font-face blocks, keep only the latin (not latin-ext) ones.
blocks = re.findall(r"/\*\s*([\w-]+)\s*\*/\s*@font-face\s*\{(.*?)\}", css, re.S)
picked = {}
for subset, body in blocks:
    if subset != "latin":
        continue
    fam = re.search(r"font-family:\s*'([^']+)'", body).group(1)
    wgt = int(re.search(r"font-weight:\s*(\d+)", body).group(1))
    url = re.search(r"url\((https://[^)]+\.woff2)\)", body).group(1)
    if (fam, wgt) in WANT:
        picked[(fam, wgt)] = url

missing = [w for w in WANT if w not in picked]
if missing:
    print("MISSING latin subsets:", missing); sys.exit(1)

out, total_raw, total_sub = [], 0, 0
for (fam, wgt) in WANT:
    raw = urllib.request.urlopen(urllib.request.Request(
        picked[(fam, wgt)], headers={"User-Agent": UA})).read()
    total_raw += len(raw)

    f = TTFont(io.BytesIO(raw))
    opts = Options()
    opts.flavor = "woff2"
    opts.desubroutinize = True
    opts.layout_features = ["kern", "liga", "calt", "tnum"]
    opts.notdef_outline = False
    opts.recalc_bounds = False
    opts.drop_tables += ["DSIG"]
    s = Subsetter(options=opts)
    s.populate(text=GLYPHS)
    s.subset(f)

    buf = io.BytesIO()
    f.flavor = "woff2"
    f.save(buf)
    sub = buf.getvalue()
    total_sub += len(sub)

    b64 = base64.b64encode(sub).decode("ascii")
    out.append((fam, wgt, b64))
    print("  %-16s %3d  %6d -> %5d bytes  (b64 %d)" % (fam, wgt, len(raw), len(sub), len(b64)))

faces = []
for fam, wgt, b64 in out:
    faces.append(
        "@font-face{font-family:'%s';font-style:normal;font-weight:%d;font-display:block;"
        "src:url(data:font/woff2;base64,%s) format('woff2')}" % (fam, wgt, b64))

js = "/* Subset from Google Fonts (OFL). Latin, dashboard glyph set only. */\nvar TP_FONTS = %s;\n" % (
    repr("".join(faces)).replace("'", "'", 1))
# write as a single-quoted JS string, escaping backslashes and quotes
payload = "".join(faces).replace("\\", "\\\\").replace("'", "\\'")
js = "/* Subset from Google Fonts (OFL). Latin, dashboard glyph set only. */\nvar TP_FONTS = '%s';\n" % payload

open("fonts-baked.js", "w", encoding="utf-8").write(js)
print()
print("raw woff2 total   : %6d bytes" % total_raw)
print("subset total      : %6d bytes  (%.1f%% of raw)" % (total_sub, total_sub / total_raw * 100))
print("fonts-baked.js    : %6d chars" % len(js))
