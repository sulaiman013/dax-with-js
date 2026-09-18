"""Build the local preview fixture from the real semantic model.

  python build-fixture.py

Writes `overview-fixture.js`, which `preview-overview.html` loads. The numbers
are not invented: they come out of the live `fincrime_model` Direct Lake model
over 49,406,790 transactions, through the same DAX the production measure uses.

Why a fixture at all
--------------------
The preview harness has to reproduce what the HTML Content visual does, which is
inject a payload and a script tag and then do it again on every cross-filter.
Pulling from the model on every page load would be slow and would need auth in
the browser, so the payload is baked once here.

Grain
-----
One cube, four dimensions: month x channel x risk band x transaction type.
31 x 9 x 3 x 3 is 2,511 cells at most, which is a small payload against
a ~2,100,000 character measure ceiling. Facts at grain are impossible here: at
49.4M rows the payload would exceed the ceiling by three orders of magnitude,
so the measure aggregates and the browser re-aggregates the cube.

Scaling convention, matching the rest of this repo
--------------------------------------------------
Money crosses as INTEGER MINOR UNITS (sen). `FORMAT(x, "0")` emits no digit
separator in any locale, so a de-DE or fr-FR workspace cannot corrupt the
payload. The browser divides by 100 on the way out.
"""

import json
import os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
MODEL = "fabric duckdb.Workspace/fincrime_model.SemanticModel"
SKILL = os.path.join(
    os.path.expanduser("~"), ".claude", "plugins", "cache",
    "power-bi-agentic-development", "fabric-cli", "0.26.1", "skills",
    "fabric-cli", "scripts", "execute_dax.py")

# month x channel x band x type, with the three additive measures the page needs.
# Amounts are multiplied to sen here so the payload carries integers only.
CUBE_DAX = """
EVALUATE
SUMMARIZECOLUMNS (
    dim_date[yr], dim_date[mth],
    dim_channel[channel],
    fact_transaction[risk_band],
    fact_transaction[txn_type],
    "txns", [Transactions],
    "amt", ROUND ( SUM ( fact_transaction[txn_amount] ) * 100, 0 ),
    "appr", CALCULATE ( [Transactions], fact_transaction[auth_approved] = TRUE () ),
    "dec", CALCULATE ( [Transactions], NOT ISBLANK ( fact_transaction[auth_approved] ) )
)
"""

RULES_DAX = """
EVALUATE
SUMMARIZECOLUMNS (
    dim_risk_rule[rule_id], dim_risk_rule[rule_name], dim_risk_rule[weight],
    "firings", [Rule Firings],
    "txns", [Transactions With Any Rule]
)
ORDER BY [firings] DESC
"""

TOTALS_DAX = """
EVALUATE
ROW (
    "txns", [Transactions],
    "alerts", [Alerts Raised],
    "amt", ROUND ( [Total Amount] * 100, 0 ),
    "exposure", ROUND ( [Exposure at Risk] * 100, 0 ),
    "approved", CALCULATE ( [Transactions], fact_transaction[auth_approved] = TRUE () ),
    "decided", CALCULATE ( [Transactions], NOT ISBLANK ( fact_transaction[auth_approved] ) ),
    "customers", [Distinct Customers],
    "firings", [Rule Firings]
)
"""


def dax(query):
    """Run one DAX query and return a list of dicts."""
    out = subprocess.run(
        [sys.executable, SKILL, MODEL, "-q", query, "--format", "json"],
        capture_output=True, text=True, encoding="utf-8", errors="replace")
    if out.returncode != 0:
        sys.stderr.write(out.stdout + out.stderr)
        raise SystemExit("DAX failed")
    body = out.stdout
    # The script prints progress lines before the JSON object, and the payload
    # is nested: {status_code, text:{results:[{tables:[{rows:[...]}]}]}}.
    # Searching for the first '[' finds `results` and silently yields one row,
    # so navigate the structure instead.
    i = body.find("{")
    if i < 0:
        sys.stderr.write(body)
        raise SystemExit("no JSON object in output")
    doc = json.loads(body[i:])
    doc = doc.get("text", doc)
    return doc["results"][0]["tables"][0]["rows"]


def col(row, *names):
    """Pull a value whatever bracket form the endpoint used for the name."""
    for n in names:
        for k in row:
            if k == n or k.endswith("[%s]" % n) or k.strip("[]") == n:
                return row[k]
    return None


def main():
    print("querying the cube ...")
    raw = dax(CUBE_DAX)
    print("  %d cells" % len(raw))

    months, channels, bands, types = [], [], [], []

    def idx(lst, v):
        if v not in lst:
            lst.append(v)
        return lst.index(v)

    # A row whose date never parsed sits on the Unknown date member, and the
    # endpoint omits null keys from the row object entirely rather than sending
    # them as null. Those rows are real (posting_date reached 93% parseable, so
    # the rest are genuinely unknown) and dropping them would quietly change
    # every total, so they get their own bucket at key 0.
    def mkey(r):
        y, m = col(r, "yr"), col(r, "mth")
        if y is None or m is None:
            return 0
        return int(y) * 100 + int(m)

    # Month keys first so the axis is chronological regardless of query order.
    months = sorted({mkey(r) for r in raw})

    cube = []
    for r in raw:
        mk = mkey(r)
        ch = col(r, "channel") or "(blank)"
        bd = col(r, "risk_band") or "(blank)"
        tp = col(r, "txn_type") or "(blank)"
        cube.append([
            months.index(mk), idx(channels, ch), idx(bands, bd), idx(types, tp),
            int(col(r, "txns") or 0),
            int(col(r, "amt") or 0),
            int(col(r, "appr") or 0),
            int(col(r, "dec") or 0),
        ])

    # Channel and type indexes must match what the measure assigns. The measure
    # uses RANKX over the member list, which is alphabetical; first-seen order
    # here would give the same totals against different indexes, so every bar
    # would carry the wrong label while every total still reconciled.
    for lst in (channels, types):
        perm_ = sorted(range(len(lst)), key=lambda i: lst[i])
        remap_ = {old_: new_ for new_, old_ in enumerate(perm_)}
        col_ = 1 if lst is channels else 3
        ordered = [lst[i] for i in perm_]
        lst[:] = ordered
        for row_ in cube:
            row_[col_] = remap_[row_[col_]]

    # Bands must render in severity order, not first-seen order.
    order = ["LOW", "MEDIUM", "HIGH"]
    rank = {b: (order.index(b) if b in order else 99) for b in bands}
    perm = sorted(range(len(bands)), key=lambda i: (rank[bands[i]], bands[i]))
    remap = {old: new for new, old in enumerate(perm)}
    bands = [bands[i] for i in perm]
    for row in cube:
        row[2] = remap[row[2]]

    print("querying rules ...")
    rules_raw = dax(RULES_DAX)
    rules = [[col(r, "rule_id"), col(r, "rule_name"), int(col(r, "weight") or 0),
              int(col(r, "firings") or 0), int(col(r, "txns") or 0)]
             for r in rules_raw]

    print("querying totals ...")
    t = dax(TOTALS_DAX)[0]
    totals = {
        "txns": int(col(t, "txns") or 0),
        "alerts": int(col(t, "alerts") or 0),
        "amt": int(col(t, "amt") or 0),
        "exposure": int(col(t, "exposure") or 0),
        "customers": int(col(t, "customers") or 0),
        "approved": int(col(t, "approved") or 0),
        "decided": int(col(t, "decided") or 0),
        "firings": int(col(t, "firings") or 0),
    }

    def mlabel(k):
        if k == 0:
            return "Unknown"
        y, m = k // 100, k % 100
        return "%s %d" % (["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul",
                           "Aug", "Sep", "Oct", "Nov", "Dec"][m - 1], y)

    payload = {
        "page": "overview",
        "currency": "RM",
        "dim": {
            "months": [[k, mlabel(k)] for k in months],
            "channels": channels,
            "bands": bands,
            "types": types,
            "rules": rules,
        },
        "cube": [n for row in cube for n in row],
        "totals": totals,
    }

    # Reconcile the cube against the model's own measures. If these disagree the
    # cube is wrong and every number on the page is wrong with it.
    cube_txns = sum(cube[i][4] for i in range(len(cube)))
    cube_amt = sum(cube[i][5] for i in range(len(cube)))
    cube_dec = sum(cube[i][7] for i in range(len(cube)))
    print()
    print("  cube transactions %s  vs model %s  %s"
          % ("{:,}".format(cube_txns), "{:,}".format(totals["txns"]),
             "OK" if cube_txns == totals["txns"] else "MISMATCH"))
    print("  cube amount (sen) %s  vs model %s  %s"
          % ("{:,}".format(cube_amt), "{:,}".format(totals["amt"]),
             "OK" if cube_amt == totals["amt"] else "MISMATCH"))

    print("  cube decided      %s  vs model %s  %s"
          % ("{:,}".format(cube_dec), "{:,}".format(totals["decided"]),
             "OK" if cube_dec == totals["decided"] else "MISMATCH"))

    js = json.dumps(payload, separators=(",", ":"))
    path = os.path.join(HERE, "overview-fixture.js")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write("window.FC_FIXTURE=" + js + ";\n")

    print()
    print("wrote %s" % path)
    print("  payload %s chars (%.1f%% of the ~2,100,000 measure ceiling)"
          % ("{:,}".format(len(js)), len(js) / 2100000.0 * 100))
    print("  dims: %d months, %d channels, %d bands, %d types, %d rules"
          % (len(months), len(channels), len(bands), len(types), len(rules)))
    return 0


if __name__ == "__main__":
    sys.exit(main())
