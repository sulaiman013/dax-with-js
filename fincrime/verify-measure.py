"""Run the measure's DAX against the live model and diff it against the fixture.

  python verify-measure.py

Why this exists
---------------
`build-fixture.py` builds the payload in Python, and the measure builds the same
payload in DAX. Two implementations of one contract drift, and the failure mode
is a page that renders perfectly with numbers nobody checked.

So the DAX is executed for real, its payload parsed, and every dimension and
every cube cell compared against the fixture that already reconciled to the
model's own measures. Anything other than an exact match is a defect.
"""

import io
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DAXF = os.path.join(HERE, "..", "dax", "fincrime-overview.dax")
FIXT = os.path.join(HERE, "overview-fixture.js")
MODEL = "fabric duckdb.Workspace/fincrime_model.SemanticModel"
SKILL = os.path.join(
    os.path.expanduser("~"), ".claude", "plugins", "cache",
    "power-bi-agentic-development", "fabric-cli", "0.26.1", "skills",
    "fabric-cli", "scripts", "execute_dax.py")


def build_query():
    """Turn the measure file into an EVALUATE that returns just the payload."""
    src = io.open(DAXF, encoding="utf-8").read()
    m = re.search(r"^Financial Crime Overview =\s*$(.*?)^RETURN",
                  src, re.S | re.M)
    if not m:
        raise SystemExit("could not find the measure body in %s" % DAXF)
    body = m.group(1)
    # The RETURN in the file emits markup around the payload. For verification
    # only the payload itself matters, so return that VAR directly.
    return "DEFINE\nEVALUATE\n{ 1 }\n", body


def main():
    _, body = build_query()
    # A VAR block used as an expression needs its own RETURN. Without one, DAX
    # reports "The syntax for 'Payload' is incorrect" and points at the last
    # VAR rather than at the missing keyword.
    query = ("EVALUATE\nROW (\n    \"payload\",\n" + body
             + "\nRETURN\n    Payload\n)\n")

    tmp = os.path.join(HERE, "_verify_query.dax")
    io.open(tmp, "w", encoding="utf-8", newline="").write(query)

    print("executing the measure DAX against the model ...")
    out = subprocess.run(
        [sys.executable, SKILL, MODEL, "-q", query, "--format", "json"],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    if out.returncode != 0:
        sys.stderr.write(out.stdout + out.stderr)
        raise SystemExit("DAX failed. Query saved at %s" % tmp)

    i = out.stdout.find("{")
    doc = json.loads(out.stdout[i:])
    doc = doc.get("text", doc)
    rows = doc["results"][0]["tables"][0]["rows"]
    payload = list(rows[0].values())[0]
    print("  payload %s chars" % "{:,}".format(len(payload)))

    # The payload is JavaScript, not JSON: bare keys and single-quoted strings.
    # Normalise enough to parse it, rather than pulling in a JS engine.
    js = payload
    js = js[js.index("=") + 1:].rstrip().rstrip(";")
    js = re.sub(r"([{,])([A-Za-z_][A-Za-z0-9_]*):", r'\1"\2":', js)
    js = js.replace("\\'", "\x00").replace("'", '"').replace("\x00", "'")
    try:
        got = json.loads(js)
    except ValueError as e:
        io.open(os.path.join(HERE, "_verify_payload.txt"), "w",
                encoding="utf-8").write(payload)
        raise SystemExit("could not parse the payload: %s\nsaved to "
                         "_verify_payload.txt" % e)

    fx = io.open(FIXT, encoding="utf-8").read()
    want = json.loads(fx[fx.index("=") + 1:].rstrip().rstrip(";"))

    fails = []

    def check(name, a, b, show=True):
        ok = (a == b)
        detail = ""
        if not ok and show:
            detail = "  DAX=%r fixture=%r" % (a, b)
        print("  %-42s %s%s" % (name, "PASS" if ok else "FAIL", detail))
        if not ok:
            fails.append(name)

    print()
    print("DIMENSIONS")
    check("channels", got["dim"]["channels"], want["dim"]["channels"])
    check("bands", got["dim"]["bands"], want["dim"]["bands"])
    check("types", got["dim"]["types"], want["dim"]["types"])
    check("month count", len(got["dim"]["months"]), len(want["dim"]["months"]))
    check("month keys",
          [m[0] for m in got["dim"]["months"]],
          [m[0] for m in want["dim"]["months"]], show=False)
    check("month labels",
          [m[1] for m in got["dim"]["months"]],
          [m[1] for m in want["dim"]["months"]], show=False)

    print()
    print("TOTALS")
    for k in ("txns", "alerts", "amt", "exposure", "approved", "decided"):
        check(k, got["totals"].get(k), want["totals"].get(k))

    print()
    print("CUBE")
    gc, wc = got["cube"], want["cube"]
    check("cell count", len(gc) // 8, len(wc) // 8)
    check("cube sums (txns)",
          sum(gc[i + 4] for i in range(0, len(gc), 8)),
          sum(wc[i + 4] for i in range(0, len(wc), 8)))
    check("cube sums (amount)",
          sum(gc[i + 5] for i in range(0, len(gc), 8)),
          sum(wc[i + 5] for i in range(0, len(wc), 8)))
    check("cube sums (decided)",
          sum(gc[i + 7] for i in range(0, len(gc), 8)),
          sum(wc[i + 7] for i in range(0, len(wc), 8)))

    # Cell-by-cell, keyed on the dimension tuple so row order cannot matter.
    def keyed(c):
        d = {}
        for i in range(0, len(c), 8):
            d[(c[i], c[i + 1], c[i + 2], c[i + 3])] = tuple(c[i + 4:i + 8])
        return d

    kg, kw = keyed(gc), keyed(wc)
    missing = set(kw) - set(kg)
    extra = set(kg) - set(kw)
    diff = [k for k in (set(kg) & set(kw)) if kg[k] != kw[k]]
    check("no missing cells", len(missing), 0)
    check("no unexpected cells", len(extra), 0)
    check("every cell matches", len(diff), 0)
    for k in list(diff)[:5]:
        print("      %s: DAX=%s fixture=%s" % (k, kg[k], kw[k]))

    print()
    print("RULES")
    check("rule count", len(got["dim"]["rules"]), len(want["dim"]["rules"]))
    gr = sorted([tuple(r) for r in got["dim"]["rules"]])
    wr = sorted([tuple(r) for r in want["dim"]["rules"]])
    check("rules match", gr, wr, show=False)
    if gr != wr:
        for a, b in zip(gr, wr):
            if a != b:
                print("      DAX=%s" % (a,))
                print("      fix=%s" % (b,))

    try:
        os.remove(tmp)
    except OSError:
        pass

    print()
    if fails:
        print("FAILED: %d check(s): %s" % (len(fails), ", ".join(fails)))
        return 1
    print("The measure reproduces the verified fixture exactly.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
