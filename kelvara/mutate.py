"""
Mutation check for the body-map UAT.

A green suite only means something if it can go red. This injects one of a set
of realistic defects into the rendered preview and expects the suite to fail.
Run `python mutate.py <defect>`, then the UAT, then rebake to restore.

Defects mirror bugs that actually happened while building the figure:
  shift-fingers   the group-transform bug, geometry landing in the wrong space
  merge-fingers   deriving a paired region from a both-sides bounding box
  pale-ink        picking label ink from the shade instead of the fill
  bury-region     a region painted over so it can never be clicked
  label-on-eyes   a label parked over a neighbouring region
"""
import io
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
HTML = os.path.join(HERE, '..', 'design-assets', 'body-preview.html')

DEFECT = sys.argv[1] if len(sys.argv) > 1 else 'shift-fingers'
s = io.open(HTML, encoding='utf-8').read()
before = s

if DEFECT == 'shift-fingers':
    def bump(m):
        tf = m.group(1)
        return ' transform="translate(120,0) %s"' % tf if tf else ' transform="translate(120,0)"'
    out = []
    for tag in re.findall(r'<path[^>]*data-key="front\.fingers"[^>]*>', s):
        new = tag
        if 'transform="' in tag:
            new = re.sub(r'transform="([^"]*)"', r'transform="translate(120,0) \1"', tag, count=1)
        else:
            new = tag.replace('<path ', '<path transform="translate(120,0)" ', 1)
        out.append((tag, new))
    for a, b in out:
        s = s.replace(a, b, 1)

elif DEFECT == 'merge-fingers':
    # collapse the four capsules into one bar spanning both hands
    tags = re.findall(r'<path[^>]*data-key="front\.fingers"[^>]*>.*?</path>', s)
    bar = ('<path d="M70 366L272 366Q282 366 282 376L282 386Q282 396 272 396'
           'L70 396Q60 396 60 386L60 376Q60 366 70 366Z" fill="#96641a" '
           'stroke="#b9ab93" stroke-width="1" data-region="fingers" '
           'data-view="front" data-key="front.fingers" data-origin="added" '
           'data-cases="260"><title>Fingers and thumb: 260 cases</title></path>')
    for i, t in enumerate(tags):
        s = s.replace(t, bar if i == 0 else '', 1)

elif DEFECT == 'pale-ink':
    s = re.sub(r'(<text [^>]*data-label="back\.lowerback"[^>]*)fill="#3f2f14"',
               r'\1fill="#ffffff"', s)
    s = re.sub(r'(<text [^>]*data-label="back\.lowerback"[^>]*)stroke="#5a3c0f"',
               r'\1stroke="#faf8f4"', s)
    s = s.replace('fill="#3f2f14" pointer-events="none" paint-order="stroke" '
                  'stroke="#faf8f4" stroke-width="2.4" data-label="back.lowerback"',
                  'fill="#ffffff" pointer-events="none" paint-order="stroke" '
                  'stroke="#faf8f4" stroke-width="2.4" data-label="back.lowerback"')

elif DEFECT == 'bury-region':
    # paint an opaque plate over the whole front forearm
    s = s.replace('</svg>',
                  '<path d="M200 230L280 230L280 320L200 320Z" fill="#eee" '
                  'stroke="none" data-region="chest" data-view="front" '
                  'data-key="front.chest" data-origin="design" data-cases="31">'
                  '<title>Chest: 31 cases</title></path></svg>', 1)

elif DEFECT == 'label-on-eyes':
    s = re.sub(r'(<text x=")[\d.]+(" y=")[\d.]+("[^>]*data-label="front\.skull")',
               r'\g<1>170\g<2>46\g<3>', s)

else:
    raise SystemExit('unknown defect: %s' % DEFECT)

if s == before:
    raise SystemExit('mutation "%s" changed nothing, check the selector' % DEFECT)

io.open(HTML, 'w', encoding='utf-8', newline='').write(s)
print('injected: %s' % DEFECT)
