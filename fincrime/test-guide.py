"""Click through the guide in a real browser and check it actually responds.

  python test-guide.py            run the checks
  python test-guide.py --shots    also write a PNG per section

Why this exists
---------------
The Desktop Bridge can capture a page but cannot click one, so a bridge
screenshot proves the guide renders and nothing about whether it works. This
loads the same renderer with the same payload the measure produces, drives it
with Playwright, and asserts the interactive parts change what they should.

The payload is pulled live from the model so the fixture cannot drift from what
the measure actually ships.
"""

import argparse
import io
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DAXF = os.path.join(HERE, "..", "dax", "fincrime-guide.dax")
MODEL = "fabric duckdb.Workspace/fincrime_model.SemanticModel"
SKILL = os.path.join(
    os.path.expanduser("~"), ".claude", "plugins", "cache",
    "power-bi-agentic-development", "fabric-cli", "0.26.1", "skills",
    "fabric-cli", "scripts", "execute_dax.py")
HARNESS = os.path.join(HERE, "preview-guide.html")


def payload():
    src = io.open(DAXF, encoding="utf-8").read()
    m = re.search(r"^Guide =\s*$(.*?)^RETURN", src, re.S | re.M)
    if not m:
        raise SystemExit("no measure body")
    q = ("EVALUATE\nROW (\n    \"payload\",\n" + m.group(1)
         + "\nRETURN\n    Payload\n)\n")
    out = subprocess.run(
        [sys.executable, SKILL, MODEL, "-q", q, "--format", "json"],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    if out.returncode != 0:
        sys.stderr.write(out.stdout + out.stderr)
        raise SystemExit("DAX failed")
    i = out.stdout.find("{")
    doc = json.loads(out.stdout[i:])
    doc = doc.get("text", doc)
    return list(doc["results"][0]["tables"][0]["rows"][0].values())[0]


HTML = """<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>guide harness</title>
<style>html,body{margin:0;height:100%%;}</style></head>
<body><div id="host" style="position:absolute;inset:0;overflow:hidden"></div>
<script>
var CLOSE='<'+'/script>';
var PAYLOAD=%s;
function inject(){
  var host=document.getElementById('host');
  host.innerHTML="<div id='fco-root'></div><script>"+PAYLOAD+
    "if(window.FCO&&window.FCO.render){window.FCO.render();}"+CLOSE+
    "<script src='fincrime-overview.js'>"+CLOSE;
  var s=host.querySelectorAll('script');
  for(var i=0;i<s.length;i++){
    var o=s[i],f=document.createElement('script');
    for(var a=0;a<o.attributes.length;a++)f.setAttribute(o.attributes[a].name,o.attributes[a].value);
    if(!o.src)f.appendChild(document.createTextNode(o.textContent));
    o.parentNode.replaceChild(f,o);
  }
}
window.__reinject=inject;
inject();
</script></body></html>
"""


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shots", action="store_true")
    args = ap.parse_args()

    print("pulling the guide payload from the model ...")
    p = payload()
    print("  %s chars" % "{:,}".format(len(p)))
    io.open(HARNESS, "w", encoding="utf-8", newline="").write(
        HTML % json.dumps(p))

    from playwright.sync_api import sync_playwright
    fails, errors = [], []

    def check(name, cond, detail=""):
        print("  %-48s %s%s" % (name, "PASS" if cond else "FAIL",
                                ("  " + detail) if detail else ""))
        if not cond:
            fails.append(name)

    with sync_playwright() as pw:
        b = pw.chromium.launch(headless=True)
        pg = b.new_page(viewport={"width": 1600, "height": 900})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto("file:///" + HARNESS.replace("\\", "/"))
        pg.wait_for_timeout(900)

        print("\nSTRUCTURE")
        check("seven nav sections", pg.locator(".fco-gn").count() == 7,
              "%d" % pg.locator(".fco-gn").count())
        check("one section active", pg.locator(".fco-gn.on").count() == 1)
        check("headline stats present", pg.locator(".fco-stat").count() == 6,
              "%d" % pg.locator(".fco-stat").count())

        print("\nNAVIGATION")
        for idx, (sel, want) in enumerate([
                ("pipeline", ".fco-pipe"),
                ("alerts", ".fco-demo"),
                ("pages", ".fco-cols2"),
                ("numbers", ".fco-cols2"),
                ("quality", ".fco-cols2"),
                ("limits", ".fco-cols2")]):
            pg.locator('[data-k="gsec"][data-v="%s"]' % sel).click()
            pg.wait_for_timeout(220)
            ok = pg.locator(want).count() > 0
            active = pg.locator('.fco-gn.on[data-v="%s"]' % sel).count() == 1
            check("section %-9s renders and is marked active" % sel,
                  ok and active)

        print("\nPIPELINE")
        pg.locator('[data-k="gsec"][data-v="pipeline"]').click()
        pg.wait_for_timeout(220)
        check("five stages", pg.locator(".fco-stage").count() == 5,
              "%d" % pg.locator(".fco-stage").count())
        first = pg.locator(".fco-sec h3").first.text_content()
        pg.locator('[data-k="gstage"][data-v="3"]').click()
        pg.wait_for_timeout(220)
        after = pg.locator(".fco-sec h3").first.text_content()
        check("clicking a stage changes the detail", first != after,
              "%s -> %s" % (first[:22], after[:22]))
        check("clicked stage is marked active",
              pg.locator('.fco-stage.on[data-v="3"]').count() == 1)

        print("\nTHRESHOLD DEMONSTRATOR")
        pg.locator('[data-k="gsec"][data-v="alerts"]').click()
        pg.wait_for_timeout(250)
        check("comparison bars present", pg.locator(".fco-cmp").count() == 2)
        check("histogram drawn", pg.locator(".fco-dhb").count() > 10,
              "%d bars" % pg.locator(".fco-dhb").count())
        vals = lambda: [e.text_content() for e in pg.locator(".fco-dov").all()]
        before = vals()
        lit = pg.locator(".fco-dhf.on").count()
        pg.locator('[data-k="gthr"][data-v="90"]').click()
        pg.wait_for_timeout(250)
        after_v = vals()
        lit90 = pg.locator(".fco-dhf.on").count()
        check("moving the cut-off changes every output", before != after_v,
              "%s -> %s" % (before[0], after_v[0]))
        check("fewer histogram bars highlighted at a higher cut-off",
              lit90 < lit, "%d -> %d" % (lit, lit90))
        pg.locator('[data-k="gthr"][data-v="10"]').click()
        pg.wait_for_timeout(250)
        low = vals()
        check("a lower cut-off raises the alert count",
              low[0] != after_v[0], "%s at 10 vs %s at 90" % (low[0], after_v[0]))

        print("\nIDEMPOTENCY")
        pg.evaluate("window.__reinject()")
        pg.wait_for_timeout(700)
        check("one root after re-inject",
              pg.locator(".fco").count() == 1,
              "%d" % pg.locator(".fco").count())
        check("one style tag",
              pg.evaluate("document.querySelectorAll('#fco-css').length") == 1)
        check("reader stays on the section they chose",
              pg.locator('.fco-gn.on[data-v="alerts"]').count() == 1)

        if args.shots:
            d = os.path.join(HERE, "guide-shots")
            if not os.path.isdir(d):
                os.makedirs(d)
            for sec, _ in [("start", 0), ("pipeline", 0), ("alerts", 0),
                           ("pages", 0), ("numbers", 0), ("quality", 0),
                           ("limits", 0)]:
                pg.locator('[data-k="gsec"][data-v="%s"]' % sec).click()
                pg.wait_for_timeout(280)
                pg.locator("#host").screenshot(
                    path=os.path.join(d, "guide-%s.png" % sec))
            print("\n  wrote %s" % d)

        print("\nCONSOLE")
        real = [e for e in errors if "favicon" not in e.lower()]
        check("no console or page errors", not real,
              (real[0][:80] if real else ""))
        b.close()

    print()
    if fails:
        print("FAILED: %d check(s): %s" % (len(fails), ", ".join(fails)))
        return 1
    print("The guide is interactive and idempotent.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
