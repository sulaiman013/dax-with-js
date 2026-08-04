"""
Build a browser fixture for the renderer, plus an independent oracle.

The payload is assembled from the CSVs the same way the DAX measure assembles
it from the model. The expected KPI values are then computed a second time,
separately, straight off the raw rows. The Playwright suite compares what the
renderer prints against that second calculation, so a shared mistake in the
aggregation would have to occur twice, in two different shapes, to pass.

    python make_fixture.py [--site 2] [--from 202401] [--to 202412]

Writes uat/fixture.html and uat/expected.json.
"""
import argparse
import csv
import io
import json
import os
import re
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
CSVDIR = os.path.join(ROOT, 'data', 'csv')
ASSETS = os.path.join(ROOT, 'design-assets')

sys.path.insert(0, ROOT)
import build_dax  # noqa: E402  (for the exact CSS the measure ships)


def read(name):
    with io.open(os.path.join(CSVDIR, name), encoding='utf-8-sig', newline='') as fh:
        return list(csv.DictReader(fh))


ap = argparse.ArgumentParser()
ap.add_argument('--site', type=int, default=None, help='filter to one SiteKey')
ap.add_argument('--from', dest='ym_from', type=int, default=None)
ap.add_argument('--to', dest='ym_to', type=int, default=None)
args = ap.parse_args()

incidents = read('fact_incident.csv')
hours = read('fact_exposure_hours.csv')
sev = {int(r['SeverityKey']): r for r in read('dim_severity_class.csv')}
sites = {int(r['SiteKey']): r for r in read('dim_site.csv')}
dates = {r['Date']: r for r in read('dim_date.csv')}


def ym_of(row):
    return int(dates[row['Date']]['YearMonthKey'])


def keep_ym(y):
    if args.ym_from and y < args.ym_from:
        return False
    if args.ym_to and y > args.ym_to:
        return False
    return True


rows = [r for r in incidents
        if keep_ym(ym_of(r)) and (args.site is None or int(r['SiteKey']) == args.site)]
hrows = [r for r in hours
         if keep_ym(int(r['YearMonthKey'])) and (args.site is None or int(r['SiteKey']) == args.site)]

# --- payload, mirroring the DAX ------------------------------------------

# Row grain, exactly what the measure now emits.
# f stride 10: region, sev, ym, site, shift, wclass, mech, role, daysAway, daysRestricted
# h stride  5: ym, site, shift, wclass, hours
f = []
for r in rows:
    f += [int(r['BodyRegionKey']), int(r['SeverityKey']), ym_of(r), int(r['SiteKey']),
          int(r['ShiftKey']), int(r['WorkerClassKey']), int(r['MechanismKey']),
          int(r['JobRoleKey']), int(r['DaysAway']), int(r['DaysRestricted'])]

h_acc = {}
for r in hrows:
    k = (int(r['YearMonthKey']), int(r['SiteKey']), int(r['ShiftKey']), int(r['WorkerClassKey']))
    h_acc[k] = h_acc.get(k, 0) + float(r['HoursWorked'])
h = []
for (y, si, sh, wc), v in sorted(h_acc.items()):
    h += [y, si, sh, wc, int(round(v))]

site_names = sorted({sites[int(r['SiteKey'])]['SiteName'] for r in rows}) if args.site else None
caption = ('All sites' if not site_names else ', '.join(site_names))
ds = sorted(r['Date'] for r in rows)
caption += '  |  %s to %s' % (ds[0][:7], ds[-1][:7])

payload = {
    'meta': {'title': 'Injury site surveillance', 'caption': caption,
             'through': ds[-1], 'minCases': 5},
    'f': f, 'h': h,
}

# --- oracle, computed a second way ---------------------------------------


def oracle(region=None, sevkey=None):
    sel = [x for x in rows
           if (region is None or int(x['BodyRegionKey']) == region)
           and (sevkey is None or int(x['SeverityKey']) == sevkey)]
    H = sum(float(x['HoursWorked']) for x in hrows)
    rec = sum(1 for x in sel if sev[int(x['SeverityKey'])]['IsRecordable'] == '1')
    dart = sum(1 for x in sel if sev[int(x['SeverityKey'])]['IsDart'] == '1')
    lost = sum(1 for x in sel if sev[int(x['SeverityKey'])]['IsLostTime'] == '1')
    da = sum(int(x['DaysAway']) for x in sel)
    return {
        'cases': len(sel), 'recordable': rec, 'dart': dart, 'lost': lost,
        'daysAway': da, 'hours': H,
        'trir': (rec * 200000.0 / H) if H else None,
        'dartRate': (dart * 200000.0 / H) if H else None,
        'severityRate': (da * 200000.0 / H) if H else None,
    }


by_region = {}
for x in rows:
    by_region[int(x['BodyRegionKey'])] = by_region.get(int(x['BodyRegionKey']), 0) + 1
top_region = max(by_region, key=by_region.get)

expected = {
    'all': oracle(),
    'topRegion': top_region,
    'topRegionCases': by_region[top_region],
    'region': oracle(region=top_region),
    'regionCount': len(by_region),
    'months': sorted({k[0] for k in h_acc}),
    'fRows': len(f) // 10,
    'sites': sorted({int(x['SiteKey']) for x in rows}),
}

# --- fixture --------------------------------------------------------------

runtime = io.open(os.path.join(ASSETS, 'runtime.js'), encoding='utf-8').read()
css = re.sub(r'\s*\n\s*', ' ', build_dax.CSS)

html = (
    '<!doctype html><meta charset="utf-8">'
    '<title>Kelvara body map fixture</title>'
    '<style>%s</style>'
    '<div id="kv-fit"><div id="kv-root" tabindex="0"></div></div>'
    '<script>window.__kvErrors=[];'
    'window.addEventListener("error",function(e){window.__kvErrors.push(String(e.message));});'
    '</script>'
    '<script>window.__kvBody=%s;</script>'
    '<script>%s</script>'
) % (css, json.dumps(payload, separators=(',', ':')), build_dax.minify(runtime))

io.open(os.path.join(HERE, 'fixture.html'), 'w', encoding='utf-8', newline='').write(html)
io.open(os.path.join(HERE, 'expected.json'), 'w', encoding='utf-8', newline='').write(
    json.dumps(expected, indent=2) + '\n')

print('fixture')
print('=' * 58)
print('  filter               %s' % (('site %d' % args.site) if args.site else 'none'))
print('  incident rows        %d' % len(rows))
print('  payload f rows       %d  (%d ints, row grain)' % (len(f) // 10, len(f)))
print('  payload h rows       %d' % (len(h) // 5))
print('  fixture.html         %d chars' % len(html))
print()
print('  cases                %d' % expected['all']['cases'])
print('  recordable           %d' % expected['all']['recordable'])
print('  hours                %d' % expected['all']['hours'])
print('  TRIR                 %.4f' % expected['all']['trir'])
print('  top region           key %d, %d cases' % (top_region, by_region[top_region]))
