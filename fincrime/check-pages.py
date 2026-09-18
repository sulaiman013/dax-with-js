"""Execute every page measure against the live model and sanity-check its payload.

  python check-pages.py

This runs the DAX, parses the JavaScript payload it returns, and asserts the
arrays are the shape the renderer expects. It does NOT prove the page renders:
only the visual can do that, because a measure can be valid DAX and still be
rejected inside a visual. This catches the errors that are cheap to catch.
"""

import io
import json
import os
import re
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
DAXDIR = os.path.join(HERE, "..", "dax")
MODEL = "fabric duckdb.Workspace/fincrime_model.SemanticModel"
SKILL = os.path.join(
    os.path.expanduser("~"), ".claude", "plugins", "cache",
    "power-bi-agentic-development", "fabric-cli", "0.26.1", "skills",
    "fabric-cli", "scripts", "execute_dax.py")

PAGES = [
    ("guide", "fincrime-guide.dax", {"meta": dict}),
    ("rules", "fincrime-rules.dax",
     {"fired": 3, "hist": 2, "meta": dict}),
    ("risk", "fincrime-risk.dax",
     {"mcc": 4, "ccy": 4, "brand": 4, "entry": 4, "meta": dict}),
]


def run(path):
    src = io.open(os.path.join(DAXDIR, path), encoding="utf-8").read()
    m = re.search(r"^[A-Za-z][A-Za-z ]* =\s*$(.*?)^RETURN", src, re.S | re.M)
    if not m:
        raise SystemExit("no measure body in %s" % path)
    q = "EVALUATE\nROW (\n    \"payload\",\n" + m.group(1) + "\nRETURN\n    Payload\n)\n"
    out = subprocess.run(
        [sys.executable, SKILL, MODEL, "-q", q, "--format", "json"],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    if out.returncode != 0:
        err = [l for l in (out.stdout + out.stderr).splitlines()
               if "error" in l.lower()]
        return None, (err[0] if err else "DAX failed")[:200]
    i = out.stdout.find("{")
    doc = json.loads(out.stdout[i:])
    doc = doc.get("text", doc)
    rows = doc["results"][0]["tables"][0]["rows"]
    return list(rows[0].values())[0], None


def parse(payload):
    js = payload[payload.index("=") + 1:].rstrip().rstrip(";")
    js = re.sub(r"([{,])([A-Za-z_][A-Za-z0-9_]*):", r'\1"\2":', js)
    js = js.replace("\\'", "\x00").replace("'", '"').replace("\x00", "'")
    return json.loads(js)


def main():
    bad = 0
    for name, f, shape in PAGES:
        print("\n%s (%s)" % (name.upper(), f))
        payload, err = run(f)
        if err:
            print("  FAIL  %s" % err)
            bad += 1
            continue
        print("  payload %s chars" % "{:,}".format(len(payload)))
        try:
            d = parse(payload)
        except ValueError as e:
            print("  FAIL  unparseable payload: %s" % e)
            bad += 1
            continue
        if d.get("page") != name:
            print("  FAIL  page is %r, expected %r" % (d.get("page"), name))
            bad += 1
        for key, spec in shape.items():
            v = d.get(key)
            if v is None:
                print("  FAIL  missing %r" % key)
                bad += 1
            elif spec is dict:
                print("  ok    %-6s %d keys" % (key, len(v)))
            elif len(v) % spec:
                print("  FAIL  %s has %d values, not a multiple of stride %d"
                      % (key, len(v), spec))
                bad += 1
            else:
                print("  ok    %-6s %d rows (stride %d)"
                      % (key, len(v) // spec, spec))
        if "meta" in d:
            mt = d["meta"]
            keys = sorted(mt)[:6]
            print("  meta  " + ", ".join(
                "%s=%s" % (k, mt[k]) for k in keys))
    print()
    if bad:
        print("FAILED: %d problem(s)" % bad)
        return 1
    print("All page measures execute and return well-formed payloads.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
