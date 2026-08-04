#!/usr/bin/env python3
"""
Bake the Kelvara body map from the approved Claude Design artifact.

    python bake_body.py            writes body-baked.js and body-preview.html

WHERE THE GEOMETRY COMES FROM
--------------------------------------------------------------------------
"design by claude design/Injury Site Surveillance V2.dc.html". That artifact was
generated for this project, so there is no third-party licensing question, which
is why it is used in preference to any published anatomical plate.

Three earlier attempts drew the figure from scratch here and all three read as a
mannequin rather than a body. The design solves that, so this file stops drawing
and starts extracting: it lifts the path data verbatim, keeps every transform,
and re-groups the shapes by OIICS body region.

WHAT HAD TO BE ADDED
--------------------------------------------------------------------------
The design was authored for SPORTS injury sites and covers 20 of the regions
this model needs. OIICS is finer in a few places, so seven small shapes are
drawn here in the same idiom:

  eye, ear, nose, face      the design has a single Head; OIICS splits it, and
                            eye alone carries 131 cases plus planted anomaly A3
  groin                     OIICS 344, distinct from pelvis and hip (34)
  fingers, toes             OIICS 442 and 532, distinct from hand and foot.
                            Fingers and thumb is the single largest region in
                            the dataset at 260 cases, so it cannot be folded
                            into hand.

THE THREE LAYERS
--------------------------------------------------------------------------
  REGION   one entry per OIICS region per view, carrying colour, hit target and
           click. Built from the design's base segments and highlight shapes.
  DETAIL   the design's decorative contour lines, pointer-events off. Never
           intercepts a click.
  LABEL    the design's own label positions, reused so the typography lands
           where it was composed to land.
"""

import csv
import io
import json
import os
import re

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, '..', 'design by claude design', 'Injury Site Surveillance V2.dc.html')

# ---------------------------------------------------------------------------
# lift the svg
# ---------------------------------------------------------------------------
raw = io.open(SRC, encoding='utf-8', errors='replace').read()
a = raw.find('<svg viewBox="0 0 720 692"')
b = raw.find('</svg>', a)
svg = raw[a:b]
VIEWBOX = re.search(r'viewBox="([^"]+)"', svg).group(1)

# Walk the tree keeping a stack of GROUP transforms. This matters: the back
# figure is a <g transform="translate(370,0)"> wrapping paths whose own
# coordinates are still in FRONT space. Lifting a path without composing its
# ancestors' transforms drops the back figure on top of the front one, which is
# exactly what the first pass did.
paths = []
stack = []
for m in re.finditer(r'<(/?)(g|path)\b([^>]*?)(/?)>', svg):
    close, tag, attrs, selfclose = m.group(1), m.group(2), m.group(3), m.group(4)
    if tag == 'g':
        if close:
            if stack:
                stack.pop()
            continue
        tf = re.search(r'\btransform="([^"]+)"', attrs)
        stack.append(tf.group(1) if tf else '')
        continue
    d = re.search(r'\bd="([^"]+)"', attrs)
    if not d:
        continue
    own = re.search(r'\btransform="([^"]+)"', attrs)
    chain = [t for t in stack if t] + ([own.group(1)] if own else [])
    paths.append({'d': d.group(1), 'tf': ' '.join(chain)})

groups = re.findall(r'data-id="([^"]+)"', svg)

texts = []
for m in re.finditer(r'<text\b([^>]*)>([^<]*)</text>', svg):
    at, body = m.group(1), m.group(2).strip()
    gx = re.search(r'\bx="([-\d.]+)"', at)
    gy = re.search(r'\by="([-\d.]+)"', at)
    if gx and gy and body:
        texts.append({'s': body, 'x': float(gx.group(1)), 'y': float(gy.group(1))})

# ---------------------------------------------------------------------------
# map design shapes onto OIICS regions
#
# Path indexes are document order and were verified against getBBox in a browser
# before being written down here. Index, not shape matching, because the design
# is a fixed input: if it is regenerated these must be re-verified, and the
# validation at the bottom will catch it if they are not.
# ---------------------------------------------------------------------------
FRONT_CX, BACK_CX = 170, 540

MAP = {
    # svgId:  {'front': [path indexes], 'back': [path indexes]}
    'skull':     {'front': [37],            'back': [38]},
    'jaw':       {'front': [0],             'back': []},
    'neck':      {'front': [39, 40, 41],    'back': [42]},
    'shoulder':  {'front': [43, 44],        'back': [45, 46]},
    'chest':     {'front': [1, 3, 4, 5, 6], 'back': []},
    'abdomen':   {'front': [2],             'back': []},
    'pelvis':    {'front': [47, 48],        'back': []},
    'upperback': {'front': [],              'back': [21, 22]},
    'lowerback': {'front': [],              'back': [57]},
    'buttock':   {'front': [],              'back': [23, 24]},
    'upperarm':  {'front': [11, 12],        'back': [27, 28]},
    'elbow':     {'front': [13, 14],        'back': [29, 30]},
    'forearm':   {'front': [15, 16],        'back': [31, 32]},
    'wrist':     {'front': [17, 18],        'back': [33, 34]},
    'hand':      {'front': [19, 20],        'back': [35, 36]},
    'thigh':     {'front': [49, 50],        'back': [58, 59]},
    'knee':      {'front': [51, 52],        'back': [53, 54]},
    'lowerleg':  {'front': [7, 8],          'back': [60, 61]},
    'ankle':     {'front': [55, 56],        'back': [62, 63]},
    'foot':      {'front': [9, 10],         'back': [25, 26]},
}

# Decorative contours: everything after the interactive block that is not a
# label. These are the design's own muscle and seam lines.
DETAIL_IDX = list(range(64, len(paths)))


def ell(cx, cy, rx, ry):
    return ('M%g %gA%g %g 0 1 0 %g %gA%g %g 0 1 0 %g %gZ'
            % (cx - rx, cy, rx, ry, cx + rx, cy, rx, ry, cx - rx, cy))


def poly(pts, close=True):
    d = 'M%g %g' % pts[0]
    for p in pts[1:]:
        d += 'L%g %g' % p
    return d + ('Z' if close else '')


def rr(x, y, w, h, r):
    return ('M%g %gL%g %gQ%g %g %g %gL%g %gQ%g %g %g %gL%g %gQ%g %g %g %gL%g %gQ%g %g %g %gZ'
            % (x + r, y, x + w - r, y, x + w, y, x + w, y + r,
               x + w, y + h - r, x + w, y + h, x + w - r, y + h,
               x + r, y + h, x, y + h, x, y + h - r,
               x, y + r, x, y, x + r, y))


def cap(x, y, w, h):
    """A finger or toe: a rounded capsule, radius half its width."""
    return rr(x, y, w, h, min(w, h) / 2.0)


# --- measuring the design so the added regions cannot drift -----------------
# Four passes of hand-placed coordinates gave four different wrong answers, so
# nothing below is typed in by eye any more. Each added region is derived from
# the measured box of the design path it has to attach to.

NUM = re.compile(r'-?\d*\.?\d+(?:[eE][-+]?\d+)?')


def _tf_matrix(tf):
    """Compose a transform string into (a, b, c, d, e, f). Only the operations
    the design actually uses: translate and scale."""
    m = (1.0, 0.0, 0.0, 1.0, 0.0, 0.0)
    for op, args in re.findall(r'(translate|scale)\s*\(([^)]*)\)', tf or ''):
        v = [float(x) for x in NUM.findall(args)]
        if op == 'translate':
            n = (1.0, 0.0, 0.0, 1.0, v[0], v[1] if len(v) > 1 else 0.0)
        else:
            n = (v[0], 0.0, 0.0, v[1] if len(v) > 1 else v[0], 0.0, 0.0)
        m = (m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
             m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
             m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5])
    return m


def path_bbox(d, tf=''):
    """Bounding box of a path. Control points bound a Bezier, so using them
    without sampling is safe and slightly generous, which is what we want when
    the box is used to attach a neighbouring shape."""
    m = _tf_matrix(tf)
    xs, ys = [], []
    for cmd, args in re.findall(r'([MLCQAHVZmlcqahvz])([^MLCQAHVZmlcqahvz]*)', d):
        v = [float(x) for x in NUM.findall(args)]
        if cmd.upper() == 'A':
            # rx ry rot laf sf x y  -> only the endpoint is a real coordinate
            v = v[5:7] if len(v) >= 7 else []
        for i in range(0, len(v) - 1, 2):
            x, y = v[i], v[i + 1]
            xs.append(m[0] * x + m[2] * y + m[4])
            ys.append(m[1] * x + m[3] * y + m[5])
    return (min(xs), min(ys), max(xs), max(ys)) if xs else (0, 0, 0, 0)


def region_bbox(rid, view, one_side=False):
    """Measured box of a design region.

    one_side matters for paired limbs. MAP['hand'] holds both hands, so the
    full box spans the figure's entire width; deriving fingers from it produced
    a single capsule 216 units wide laid across the hips. For anything that has
    a left and a right, measure the first path only and mirror the result.
    """
    idx = MAP[rid][view][:1] if one_side else MAP[rid][view]
    boxes = [path_bbox(paths[i]['d'], paths[i]['tf']) for i in idx]
    return (min(b[0] for b in boxes), min(b[1] for b in boxes),
            max(b[2] for b in boxes), max(b[3] for b in boxes))


def digits(box, n, lengths, inset=0.06, overlap=2.0):
    """n capsules spanning the distal edge of `box`, longest in the middle.
    They start `overlap` above that edge so they visibly join the parent."""
    x0, _y0, x1, y1 = box
    span = (x1 - x0) * (1 - 2 * inset)
    left = x0 + (x1 - x0) * inset
    w = span / (n + (n - 1) * 0.22)
    step = w * 1.22
    return [cap(left + i * step, y1 - overlap, w, lengths[i] + overlap)
            for i in range(n)]


def mirror(items, cx):
    """Reflect a list of shapes about x = cx."""
    return [{'d': it['d'],
             'tf': ('translate(%g,0) scale(-1,1) %s' % (2 * cx, it['tf'])).strip()}
            for it in items]


def plain(ds):
    return [{'d': d, 'tf': ''} for d in ds]


# Seven regions OIICS needs that a sports design had no reason to draw.
EXTRA = {}

for view, cx in (('front', FRONT_CX), ('back', BACK_CX)):
    sx0, sy0, sx1, sy1 = region_bbox('skull', view)
    sw, sh = sx1 - sx0, sy1 - sy0

    # Ears ride the temples, half in and half out of the skull outline.
    ear = plain([ell(sx0 + sw * 0.03, sy0 + sh * 0.46, sw * 0.075, sh * 0.13)])
    EXTRA.setdefault('ear', {})[view] = ear + mirror(ear, (sx0 + sx1) / 2)

    if view == 'front':
        # Face panel covers the middle of the skull; eyes and nose sit on it,
        # so all three are keyed off the same measured box.
        fx, fy = sx0 + sw * 0.16, sy0 + sh * 0.30
        fw, fh = sw * 0.68, sh * 0.52
        EXTRA.setdefault('face', {})['front'] = plain([rr(fx, fy, fw, fh, fh * 0.34)])
        eye = plain([ell(fx + fw * 0.27, fy + fh * 0.32, fw * 0.13, fh * 0.10)])
        EXTRA.setdefault('eye', {})['front'] = eye + mirror(eye, fx + fw / 2)
        EXTRA.setdefault('nose', {})['front'] = plain([poly([
            (fx + fw / 2, fy + fh * 0.38),
            (fx + fw / 2 + fw * 0.10, fy + fh * 0.78),
            (fx + fw / 2 - fw * 0.10, fy + fh * 0.78)])])
    else:
        for rid in ('face', 'eye', 'nose'):
            EXTRA.setdefault(rid, {})['back'] = []

    # Fingers hang off the distal edge of the design's own hand, one hand at a
    # time, then mirrored to the other side.
    fing = plain(digits(region_bbox('hand', view, one_side=True), 4, [20, 23, 21, 16]))
    EXTRA.setdefault('fingers', {})[view] = fing + mirror(fing, cx)

    # Toes hang off the distal edge of the design's own foot.
    toe = plain(digits(region_bbox('foot', view, one_side=True), 5,
                       [11, 9, 8, 7, 6], inset=0.10))
    EXTRA.setdefault('toes', {})[view] = toe + mirror(toe, cx)

# Groin sits centred on the bottom edge of the pelvis, inside it.
px0, py0, px1, py1 = region_bbox('pelvis', 'front')
pw, ph = px1 - px0, py1 - py0
EXTRA.setdefault('groin', {})['front'] = plain([
    rr(FRONT_CX - pw * 0.12, py1 - ph * 0.50, pw * 0.24, ph * 0.46, pw * 0.07)])
EXTRA['groin']['back'] = []

ADDED_IDS = set(EXTRA)          # regions I drew, not the design's; the UAT
                                # holds these to a stricter placement contract

# ---------------------------------------------------------------------------
# assemble
# ---------------------------------------------------------------------------
shapes = {}          # "view.svgId" -> [ {d, tf}, ... ]
for rid, views in MAP.items():
    for view in ('front', 'back'):
        lst = []
        for i in views[view]:
            lst.append({'d': paths[i]['d'], 'tf': paths[i]['tf']})
        if lst:
            shapes['%s.%s' % (view, rid)] = lst
for rid, views in EXTRA.items():
    for view in ('front', 'back'):
        lst = list(views.get(view) or [])
        if lst:
            key = '%s.%s' % (view, rid)
            shapes[key] = shapes.get(key, []) + lst

detail = [{'d': paths[i]['d'], 'tf': paths[i]['tf']} for i in DETAIL_IDX]

# labels: the design's own placements, plus one for each added region
LABELS = {}
DESIGN_LABEL_TO_ID = {
    'Head': 'skull', 'Jaw': 'jaw', 'Neck': 'neck', 'Shoulder': 'shoulder', 'Ribs': 'chest',
    'Abdomen': 'abdomen', 'Hip': 'pelvis', 'Thigh': 'thigh', 'Knee': 'knee', 'Shin': 'lowerleg',
    'Ankle': 'ankle', 'Foot': 'foot', 'Upper arm': 'upperarm', 'Elbow': 'elbow',
    'Forearm': 'forearm', 'Wrist': 'wrist', 'Hand': 'hand', 'Upper back': 'upperback',
    'Lower back': 'lowerback', 'Glute': 'buttock', 'Hamstring': 'thigh', 'Calf': 'lowerleg',
    'Achilles': 'ankle',
}
for t in texts:
    rid = DESIGN_LABEL_TO_ID.get(t['s'])
    if not rid:
        continue
    view = 'front' if t['x'] < 360 else 'back'
    LABELS.setdefault('%s.%s' % (view, rid), []).append([t['x'], t['y']])

# Labels for the added regions are measured too, so they follow their shape
# instead of drifting when the geometry moves.
DISPLAY = {'eye': 'Eye', 'nose': 'Nose', 'face': 'Face', 'ear': 'Ear',
           'groin': 'Groin', 'fingers': 'Fingers and thumb', 'toes': 'Toes'}
CHAR_W = 5.4                    # Georgia at 10.5px, near enough for placement


def bb_union(items):
    bs = [path_bbox(it['d'], it['tf']) for it in items]
    return (min(b[0] for b in bs), min(b[1] for b in bs),
            max(b[2] for b in bs), max(b[3] for b in bs))


PAIRED_EXTRA = {'ear', 'eye', 'fingers', 'toes'}


def anchor_box(rid, view):
    """Box to hang the label off. Paired regions are built as one side plus its
    mirror, so anchor on the first half only; the union of both sides is
    centred on the figure and would put the label on the torso."""
    items = EXTRA[rid][view]
    if rid in PAIRED_EXTRA and len(items) % 2 == 0:
        items = items[:len(items) // 2]
    return bb_union(items)


def beside(rid, view, side, dy=0.5, pad=11, on=None):
    """Label placed clear of a shape. side -1 left, +1 right, 0 below.
    `on` overrides which box to hang off, so the head labels sit outside the
    whole skull rather than inside it against a neighbouring feature."""
    ex0, ey0, ex1, ey1 = anchor_box(rid, view)
    ax0, ay0, ax1, ay1 = on if on else (ex0, ey0, ex1, ey1)
    half = len(DISPLAY[rid]) * CHAR_W / 2.0
    if side == 0:
        x, y = (ax0 + ax1) / 2.0, ay1 + 13
    else:
        x = (ax1 + pad + half) if side > 0 else (ax0 - pad - half)
        y = ey0 + (ey1 - ey0) * dy + 3.5
    vw = float(VIEWBOX.split()[2])
    if x + half > vw - 4:                       # would run off the right edge
        x = ax0 - pad - half
    if x - half < 4:
        x = ax1 + pad + half
    return [round(x, 1), round(y, 1)]


for view in ('front', 'back'):
    skull_box = region_bbox('skull', view)
    for rid, side, dy, on in (('ear', 1, 0.1, skull_box), ('eye', -1, 0.4, skull_box),
                              ('nose', 1, 0.9, skull_box), ('face', -1, 1.0, skull_box),
                              ('groin', -1, 0.5, None),
                              ('fingers', 0, 0, None), ('toes', 1, 1.0, None)):
        if EXTRA.get(rid, {}).get(view):
            LABELS['%s.%s' % (view, rid)] = [beside(rid, view, side, dy, on=on)]

# The design put its head label at the centre of the head. A face panel now
# occupies that spot, so the skull label moves to the crown where there is
# nothing under it.
for view in ('front', 'back'):
    sx0, sy0, sx1, sy1 = region_bbox('skull', view)
    LABELS['%s.skull' % view] = [[round((sx0 + sx1) / 2, 1), round(sy0 + (sy1 - sy0) * 0.19, 1)]]

# Same story at the deltoid: the design labelled it in the middle of the
# shoulder, but our z-order paints the upper arm over that spot, so the label
# read as belonging to the arm. Move it outboard with the other limb labels.
for view in ('front', 'back'):
    dx0, dy0, dx1, dy1 = region_bbox('shoulder', view, one_side=True)
    half = len('Shoulder') * CHAR_W / 2.0
    LABELS['%s.shoulder' % view] = [[round(dx1 + 11 + half, 1),
                                     round((dy0 + dy1) / 2 + 3.5, 1)]]

Z = ['chest', 'abdomen', 'upperback', 'lowerback', 'pelvis', 'buttock', 'groin',
     'thigh', 'knee', 'lowerleg', 'ankle', 'foot', 'toes',
     'shoulder', 'upperarm', 'elbow', 'forearm', 'wrist', 'hand', 'fingers',
     'neck', 'skull', 'face', 'jaw', 'ear', 'nose', 'eye']

js = io.StringIO()
js.write('/* Baked by design-assets/bake_body.py from the approved Claude Design\n')
js.write('   artifact. Geometry is lifted verbatim; seven OIICS-only regions are added.\n')
js.write('   REGION = clickable, DETAIL = decorative. Regenerate, do not hand-edit. */\n')
js.write("var BODY_VIEWBOX = '%s';\n" % VIEWBOX)
js.write('var BODY_FRONT_CX = %d, BODY_BACK_CX = %d;\n' % (FRONT_CX, BACK_CX))
js.write('var BODY_SHAPES = %s;\n' % json.dumps(shapes, separators=(',', ':')))
js.write('var BODY_LABELS = %s;\n' % json.dumps(LABELS, separators=(',', ':')))
js.write('var BODY_DETAIL = %s;\n' % json.dumps(detail, separators=(',', ':')))
js.write('var BODY_Z = %s;\n' % json.dumps(Z, separators=(',', ':')))
out_js = os.path.join(HERE, 'body-baked.js')
io.open(out_js, 'w', encoding='utf-8', newline='').write(js.getvalue())

# ---------------------------------------------------------------------------
want = []
with io.open(os.path.join(HERE, '..', 'data', 'csv', 'dim_body_region.csv'), encoding='utf-8') as f:
    for r in csv.DictReader(f):
        if r['IsDrawable'] == '1':
            want.append((r['BodyRegion'], r['SvgId']))

print('Kelvara body map, from the approved design')
print('=' * 70)
fail = []
have = {k.split('.', 1)[1] for k in shapes}
for nm, sid in want:
    if sid not in have:
        fail.append('no shapes for %s (%s)' % (sid, nm))
if set(Z) != have:
    fail.append('paint order covers %d, shapes cover %d' % (len(Z), len(have)))
lbl_ids = {k.split('.', 1)[1] for k in LABELS}
for _nm, sid in want:
    if sid not in lbl_ids:
        fail.append('no label for %s' % sid)

print('  source paths lifted                     %d of %d' % (
    sum(len(v) for k, v in shapes.items()), len(paths)))
print('  drawable regions covered                %d of %d' % (len(have), len(want)))
print('    from the design                       %d' % len(MAP))
print('    added for OIICS                       %d  (%s)' % (len(EXTRA), ', '.join(sorted(EXTRA))))
print('  decorative contours                     %d' % len(detail))
print('  label placements                        %d' % sum(len(v) for v in LABELS.values()))
print('  viewBox                                 %s' % VIEWBOX)
print('  body-baked.js                           %d bytes' % os.path.getsize(out_js))

# ---------------------------------------------------------------------------
# preview using the real case counts
# ---------------------------------------------------------------------------
counts = {}
with io.open(os.path.join(HERE, '..', 'data', 'csv', 'fact_incident.csv'), encoding='utf-8') as f:
    for r in csv.DictReader(f):
        counts[int(r['BodyRegionKey'])] = counts.get(int(r['BodyRegionKey']), 0) + 1
key_to_sid, name_of = {}, {}
with io.open(os.path.join(HERE, '..', 'data', 'csv', 'dim_body_region.csv'), encoding='utf-8') as f:
    for r in csv.DictReader(f):
        key_to_sid[int(r['BodyRegionKey'])] = r['SvgId']
        name_of[r['SvgId']] = r['BodyRegion']
by_sid = {}
for k, n in counts.items():
    sid = key_to_sid.get(k)
    if sid:
        by_sid[sid] = by_sid.get(sid, 0) + n
mx = max(by_sid.values()) if by_sid else 1

AMBER = [(0.0, (250, 248, 244)), (0.2, (247, 233, 205)), (0.45, (238, 205, 148)),
         (0.7, (214, 160, 74)), (1.0, (150, 100, 26))]


def lum(hexcolour):
    n = int(hexcolour[1:], 16)
    return 0.2126 * (n >> 16) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255)


def ramp(t):
    for i in range(len(AMBER) - 1):
        p, q = AMBER[i], AMBER[i + 1]
        if p[0] <= t <= q[0]:
            k = (t - p[0]) / (q[0] - p[0] or 1)
            return '#%02x%02x%02x' % tuple(int(p[1][j] + (q[1][j] - p[1][j]) * k) for j in range(3))
    return '#96641a'


body, det, lab = [], [], []
for it in detail:
    det.append('<path d="%s"%s fill="none" stroke="#c9bfae" stroke-width="0.8" '
               'stroke-linecap="round"/>' % (it['d'], ' transform="%s"' % it['tf'] if it['tf'] else ''))
for rid in Z:
    n = by_sid.get(rid, 0)
    t = (n / mx) ** 0.55 if mx else 0
    fill = ramp(t)
    # Pick the ink from the fill's actual luminance, not from t. Keying off t
    # put white text on a mid-amber lower back that read as illegible: the ramp
    # is not linear in t, so t alone does not tell you how dark the swatch is.
    ink, halo = ('#ffffff', '#5a3c0f') if lum(fill) < 140 else ('#3f2f14', '#faf8f4')
    for view in ('front', 'back'):
        for it in shapes.get('%s.%s' % (view, rid), []):
            # data-view / data-key / data-origin exist so the Playwright UAT can
            # address one shape unambiguously. They cost nothing at render time.
            body.append('<path d="%s"%s fill="%s" stroke="#b9ab93" stroke-width="1" '
                        'stroke-linejoin="round" data-region="%s" data-view="%s" '
                        'data-key="%s.%s" data-origin="%s" data-cases="%d">'
                        '<title>%s: %d cases</title></path>'
                        % (it['d'], ' transform="%s"' % it['tf'] if it['tf'] else '',
                           fill, rid, view, view, rid,
                           'added' if rid in ADDED_IDS else 'design', n,
                           name_of.get(rid, rid), n))
    for view in ('front', 'back'):
        for (lx, ly) in LABELS.get('%s.%s' % (view, rid), []):
            lab.append('<text x="%g" y="%g" text-anchor="middle" font-size="10.5" '
                       'fill="%s" pointer-events="none" paint-order="stroke" stroke="%s" '
                       'stroke-width="2.4" data-label="%s.%s" data-shade="%.3f">%s</text>'
                       % (lx, ly, ink, halo, view, rid, t, name_of.get(rid, rid)))

html = ("""<!doctype html><meta charset="utf-8"><title>Kelvara body map</title>
<style>
 body{margin:0;background:#faf8f4;color:#3f3a32;font:13px/1.5 Georgia,'Times New Roman',serif}
 header{padding:12px 20px;border-bottom:1px solid #e5ded1}
 header b{font-size:15px}
 svg{width:100%%;max-width:1080px;height:auto;display:block;margin:0 auto}
 path[data-region]{cursor:pointer}
 path[data-region]:hover{opacity:.62}
 #out{padding:6px 20px;font:12px Consolas,monospace;color:#96641a;min-height:18px}
 .cap{text-anchor:middle;font:12px Georgia,serif;fill:#8a8071;letter-spacing:.2em}
</style>
<header><b>Kelvara body map</b> &nbsp; geometry from the approved design, shaded by real case
counts from fact_incident &nbsp; hover a region</header>
<div id="out">&nbsp;</div>
<svg viewBox="%s">
<text x="%d" y="684" class="cap">FRONT</text><text x="%d" y="684" class="cap">BACK</text>
<g>%s</g><g pointer-events="none">%s</g><g>%s</g>
</svg>
<script>
var o=document.getElementById('out');
document.querySelector('svg').addEventListener('mouseover',function(e){
  var t=e.target.querySelector?e.target.querySelector('title'):null;
  if(t)o.textContent=t.textContent;});
</script>
""" % (VIEWBOX, FRONT_CX, BACK_CX, ''.join(body), ''.join(det), ''.join(lab)))
out_html = os.path.join(HERE, 'body-preview.html')
io.open(out_html, 'w', encoding='utf-8', newline='').write(html)
print('  body-preview.html                       %d bytes' % os.path.getsize(out_html))

print()
if fail:
    print('VALIDATION FAILED')
    for f_ in sorted(set(fail)):
        print('  - %s' % f_)
    raise SystemExit(1)
print('All %d drawable regions mapped. Top region: %s (%d cases).'
      % (len(want), name_of.get(max(by_sid, key=by_sid.get)), mx))
