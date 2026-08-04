"""
Pre-generate the model's explanation for every body region, once, at build time.

WHY THIS EXISTS
The live model layer cannot ship in a published report. It needs an API key, and
an API key placed anywhere in a DAX measure is readable by anyone who opens the
report or views the model. So in Power BI the button never appeared and the
explanation pane only ever showed its calculated half.

Baking solves that. Each region's brief is sent once here, the reply is checked
against that brief, and the surviving text is stored as data inside the measure.
Every viewer then sees a real model-written explanation with no key anywhere at
runtime, no network call, and no latency.

The honest limitation: the text is fixed per body region. It is shown ONLY when
that region is the single active selection, because it was written about exactly
that set of numbers. Under any other filter combination the pane falls back to
the calculated narrative, which is always correct.

    OPENROUTER_KEY=... python bake_ai.py [--model google/gemini-3.5-flash-lite]

Writes design-assets/ai-baked.json. Re-run only when the data changes.
"""
import argparse
import csv
import io
import json
import os
import re
import sys
import time
import urllib.request

HERE = os.path.dirname(os.path.abspath(__file__))
ASSETS = os.path.join(HERE, 'design-assets')
CSVDIR = os.path.join(HERE, 'data', 'csv')
OUT = os.path.join(ASSETS, 'ai-baked.json')

ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions'

SYSTEM = (
    'You are a safety analyst briefing an HSE manager on an occupational injury '
    'report. You will be given the aggregate for one body region. Write three '
    'short sentences of plain English: what stands out, what it probably means '
    'operationally, and what to look at next. '
    'Rules. Every figure you cite must appear verbatim in the data you are '
    'given: do not calculate, do not round, do not convert units, do not infer '
    'a number from another number. Percentages and averages you might want are '
    'already supplied under "derived". Prefer naming things over quoting '
    'figures; two or three numbers is plenty. If rates.note says exposure is '
    'not filtered alike, do not compare that rate to the unfiltered one. No '
    'bullet points, no headings, no preamble, no markdown. Keep it under 55 '
    'words.'
)


def read(name):
    with io.open(os.path.join(CSVDIR, name), encoding='utf-8-sig', newline='') as fh:
        return list(csv.DictReader(fh))


def pct(a, b):
    return round((a / b) * 100, 1) if b else 0.0


def top(counter, names, n):
    return [{'name': names.get(k, str(k)), 'cases': v}
            for k, v in sorted(counter.items(), key=lambda kv: -kv[1])[:n]]


def ungrounded(text, facts):
    """Same contract the renderer enforces at runtime: every figure in the reply
    must appear in the brief that produced it. Measured over 24 live calls, one
    reply printed exposure hours an order of magnitude out."""
    hay = json.dumps(facts)
    seen = set()
    for v in re.findall(r'\d+(?:\.\d+)?', hay):
        seen.add(v)
        seen.add(str(int(float(v))))
        try:
            seen.add('{:,}'.format(int(float(v))))
        except (ValueError, OverflowError):
            pass
    bad = []
    for raw in re.findall(r'\b\d[\d,]*(?:\.\d+)?\b', text):
        plain = raw.replace(',', '')
        if raw in seen or plain in seen:
            continue
        try:
            if float(plain) < 100 and '.' not in plain:
                continue
        except ValueError:
            continue
        if raw not in bad:
            bad.append(raw)
    return bad


def call(key, model, facts, timeout=40):
    body = json.dumps({
        'model': model,
        'max_tokens': 300,
        'temperature': 0.2,
        'messages': [
            {'role': 'system', 'content': SYSTEM},
            {'role': 'user', 'content': json.dumps(facts)},
        ],
    }).encode('utf-8')
    req = urllib.request.Request(ENDPOINT, data=body, headers={
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + key,
    })
    with urllib.request.urlopen(req, timeout=timeout) as r:
        j = json.loads(r.read().decode('utf-8'))
    return j['choices'][0]['message']['content'].strip()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--model', default='google/gemini-3.5-flash-lite')
    ap.add_argument('--retries', type=int, default=2)
    args = ap.parse_args()

    key = os.environ.get('OPENROUTER_KEY')
    if not key:
        print('Set OPENROUTER_KEY. The key is read from the environment and is '
              'never written to disk or into the measure.')
        return 1

    incidents = read('fact_incident.csv')
    hours = read('fact_exposure_hours.csv')
    regions = {int(r['BodyRegionKey']): r for r in read('dim_body_region.csv')}
    sev = {int(r['SeverityKey']): r for r in read('dim_severity_class.csv')}
    mech = {int(r['MechanismKey']): r['Mechanism'] for r in read('dim_mechanism.csv')}
    role = {int(r['JobRoleKey']): r['JobRole'] for r in read('dim_job_role.csv')}
    site = {int(r['SiteKey']): r['SiteName'] for r in read('dim_site.csv')}
    dates = {r['Date']: r for r in read('dim_date.csv')}

    total_hours = sum(float(r['HoursWorked']) for r in hours)
    months = sorted({int(r['YearMonthKey']) for r in hours})

    def agg(rows):
        rec = sum(1 for x in rows if sev[int(x['SeverityKey'])]['IsRecordable'] == '1')
        dart = sum(1 for x in rows if sev[int(x['SeverityKey'])]['IsDart'] == '1')
        lost = sum(1 for x in rows if sev[int(x['SeverityKey'])]['IsLostTime'] == '1')
        da = sum(int(x['DaysAway']) for x in rows)
        dr = sum(int(x['DaysRestricted']) for x in rows)
        return rec, dart, lost, da, dr

    base_rec = agg(incidents)[0]
    base = {'cases': len(incidents), 'recordable': base_rec,
            'trir': round(base_rec * 200000.0 / total_hours, 2)}

    out, spent, discarded = {}, 0, 0
    keys = [k for k in sorted(regions) ]
    print('baking %d regions with %s' % (len(keys), args.model))
    print('=' * 70)

    for rk in keys:
        rows = [x for x in incidents if int(x['BodyRegionKey']) == rk]
        if not rows:
            continue
        rec, dart, lost, da, dr = agg(rows)
        by_month = {}
        for x in rows:
            ym = int(dates[x['Date']]['YearMonthKey'])
            by_month[ym] = by_month.get(ym, 0) + 1
        facts = {
            'selection': [regions[rk]['BodyRegion']],
            'period': {'months': len(months), 'from': months[0], 'to': months[-1]},
            'totals': {'cases': len(rows), 'recordable': rec, 'dart': dart,
                       'lostTime': lost, 'daysAway': da, 'daysRestricted': dr,
                       'hoursWorked': int(round(total_hours))},
            'rates': {
                'trir': round(rec * 200000.0 / total_hours, 2),
                'dartRate': round(dart * 200000.0 / total_hours, 2),
                'severityRate': round(da * 200000.0 / total_hours, 1),
                'note': 'exposure hours are not filtered by region, severity, '
                        'mechanism or role',
            },
            'unfiltered': base,
            'derived': {
                'shareOfAllCasesPct': pct(len(rows), len(incidents)),
                'recordableSharePct': pct(rec, len(rows)),
                'recordableShareUnfilteredPct': pct(base_rec, len(incidents)),
                'daysPerLostTimeCase': round(da / lost, 1) if lost else None,
                'hoursWorkedMillions': round(total_hours / 1e6, 2),
            },
            'topMechanisms': top(_count(rows, 'MechanismKey'), mech, 5),
            'topRoles': top(_count(rows, 'JobRoleKey'), role, 5),
            'bySite': top(_count(rows, 'SiteKey'), site, 6),
            'monthlyCases': [[dates_label(dates, m), by_month.get(m, 0)] for m in months],
        }

        text, why = None, ''
        for attempt in range(args.retries + 1):
            try:
                t0 = time.time()
                reply = call(key, args.model, facts)
                ms = int((time.time() - t0) * 1000)
            except Exception as e:
                why = str(e)[:70]
                continue
            spent += 1
            bad = ungrounded(reply, facts)
            if bad:
                discarded += 1
                why = 'cited ' + ', '.join(bad)
                continue
            text = reply
            break

        name = regions[rk]['BodyRegion']
        if text:
            out[str(rk)] = text
            print('  ok         %-24s %4d cases  %3d words  %5dms'
                  % (name, len(rows), len(text.split()), ms))
        else:
            print('  SKIPPED    %-24s %s' % (name, why))

    io.open(OUT, 'w', encoding='utf-8', newline='').write(
        json.dumps(out, indent=1, ensure_ascii=False) + '\n')
    print()
    print('  regions with text   %d of %d' % (len(out), len(keys)))
    print('  calls made          %d' % spent)
    print('  discarded ungrounded%d' % discarded)
    print('  wrote               %s' % os.path.relpath(OUT, HERE))
    return 0


def _count(rows, col):
    c = {}
    for x in rows:
        k = int(x[col])
        c[k] = c.get(k, 0) + 1
    return c


def dates_label(dates, ym):
    for r in dates.values():
        if int(r['YearMonthKey']) == ym:
            return r['YearMonthLabel']
    return str(ym)


if __name__ == '__main__':
    sys.exit(main())
