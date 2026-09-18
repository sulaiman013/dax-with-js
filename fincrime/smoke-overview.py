"""Headless check that the overview page renders, reconciles and stays idempotent.

  python smoke-overview.py            # run the checks
  python smoke-overview.py --shot     # also write overview-render.png

What it actually proves
-----------------------
1. The page renders at all, with no console errors.
2. The KPI figures equal the model's own totals. A page that renders beautifully
   and reports the wrong number is worse than one that fails loudly.
3. Re-injecting the payload and the script, which is what the HTML Content
   visual does on every cross-filter, leaves exactly one root and one style tag.
   Anything else is the "needs a page refresh to redraw" bug.
4. Clicking a filter chip actually changes the numbers, and clearing restores
   them. A filter that renders but does not filter is easy to ship by accident.
"""

import argparse
import os
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
PAGE = "file:///" + os.path.join(HERE, "preview-overview.html").replace("\\", "/")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--shot", action="store_true", help="save a screenshot")
    ap.add_argument("--headed", action="store_true")
    args = ap.parse_args()

    from playwright.sync_api import sync_playwright

    failures = []
    errors = []

    with sync_playwright() as p:
        b = p.chromium.launch(headless=not args.headed)
        pg = b.new_page(viewport={"width": 1600, "height": 980})
        pg.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        pg.on("pageerror", lambda e: errors.append(str(e)))
        pg.goto(PAGE)
        pg.wait_for_timeout(900)

        def check(name, cond, detail=""):
            print("  %-46s %s%s" % (name, "PASS" if cond else "FAIL",
                                    ("  " + detail) if detail else ""))
            if not cond:
                failures.append(name)

        print("RENDER")
        roots = pg.locator(".fco").count()
        check("one root element", roots == 1, "got %d" % roots)
        check("KPI strip present", pg.locator(".fco-kpi .fco-k").count() >= 5)
        check("trend has bars", pg.locator(".fco-tr .fco-col").count() > 0,
              "%d columns" % pg.locator(".fco-tr .fco-col").count())
        check("channel rows present", pg.locator(".fco-rows .fco-row").count() > 0)
        check("rules table present", pg.locator(".fco-tb tbody tr").count() > 0,
              "%d rules" % pg.locator(".fco-tb tbody tr").count())

        print()
        print("RECONCILIATION")
        got = pg.evaluate("""() => {
            const F = window.FC_FIXTURE, c = F.cube;
            let t = 0, a = 0;
            for (let i = 0; i < c.length; i += 8) { t += c[i+4]; a += c[i+5]; }
            const kv = [...document.querySelectorAll('.fco-k .fco-kv')].map(e => e.textContent);
            return {cubeTxns: t, cubeAmt: a, modelTxns: F.totals.txns,
                    modelAmt: F.totals.amt, kv: kv,
                    approvalPct: (F.totals.approved / F.totals.decided * 100).toFixed(1) + '%',
                    scope: document.querySelector('.fco-scope').textContent};
        }""")
        check("cube transactions equal model", got["cubeTxns"] == got["modelTxns"],
              "%s vs %s" % ("{:,}".format(got["cubeTxns"]),
                            "{:,}".format(got["modelTxns"])))
        check("cube amount equals model", got["cubeAmt"] == got["modelAmt"],
              "%s vs %s" % ("{:,}".format(got["cubeAmt"]),
                            "{:,}".format(got["modelAmt"])))
        shown = got["kv"][0].replace(",", "") if got["kv"] else ""
        check("KPI transactions match the cube",
              shown == str(got["modelTxns"]),
              "KPI shows %s" % (got["kv"][0] if got["kv"] else "nothing"))
        # The approval rate has a different denominator from every other KPI:
        # transactions that got a decision, not all of them. Pinning it here
        # stops a future edit from quietly reverting it to 32.3%.
        check("approval rate uses the decided denominator",
              got["approvalPct"] in got["kv"],
              "expected %s among %s" % (got["approvalPct"], got["kv"]))
        print("    scope line: %s" % got["scope"].strip())
        print("    KPIs: %s" % " | ".join(got["kv"]))

        print()
        print("INTERACTION")
        before = pg.locator(".fco-k .fco-kv").first.text_content()
        pg.locator('.fco-chip[data-k="bd"]').first.click()
        pg.wait_for_timeout(260)
        after = pg.locator(".fco-k .fco-kv").first.text_content()
        check("clicking a risk chip changes the total", before != after,
              "%s -> %s" % (before, after))
        reset = pg.locator('[data-k="reset"]')
        check("reset control appears when filtered", reset.count() == 1)
        if reset.count():
            reset.click()
            pg.wait_for_timeout(260)
            restored = pg.locator(".fco-k .fco-kv").first.text_content()
            check("clearing restores the total", restored == before,
                  "%s" % restored)

        bars = pg.locator(".fco-tr .fco-col")
        if bars.count() > 2:
            b0 = pg.locator(".fco-k .fco-kv").first.text_content()
            bars.nth(2).click()
            pg.wait_for_timeout(260)
            b1 = pg.locator(".fco-k .fco-kv").first.text_content()
            check("clicking a month bar filters", b0 != b1, "%s -> %s" % (b0, b1))
            pg.locator('[data-k="reset"]').click()
            pg.wait_for_timeout(200)

        print()
        print("IDEMPOTENCY")
        pg.click("#xf")
        pg.wait_for_timeout(700)
        state = pg.evaluate("""() => ({
            roots: document.querySelectorAll('.fco').length,
            styles: document.querySelectorAll('#fco-css').length,
            cols: document.querySelectorAll('.fco-tr .fco-col').length
        })""")
        check("still exactly one root after re-inject", state["roots"] == 1,
              "got %d" % state["roots"])
        check("still exactly one style tag", state["styles"] == 1,
              "got %d" % state["styles"])
        check("trend still drawn", state["cols"] > 0, "%d columns" % state["cols"])

        pg.click("#xf")
        pg.click("#xf")
        pg.wait_for_timeout(700)
        s2 = pg.evaluate("""() => ({
            roots: document.querySelectorAll('.fco').length,
            styles: document.querySelectorAll('#fco-css').length
        })""")
        check("stable after three re-injects",
              s2["roots"] == 1 and s2["styles"] == 1,
              "roots=%d styles=%d" % (s2["roots"], s2["styles"]))

        print()
        print("CONSOLE")
        real = [e for e in errors if "favicon" not in e.lower()]
        check("no console or page errors", not real,
              (real[0][:90] if real else ""))

        if args.shot:
            host = pg.locator("#host")
            host.screenshot(path=os.path.join(HERE, "overview-render.png"))
            print()
            print("  wrote overview-render.png")

        b.close()

    print()
    if failures:
        print("FAILED: %d check(s): %s" % (len(failures), ", ".join(failures)))
        return 1
    print("All checks passed.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
