#!/usr/bin/env python3
"""
Kelvara Industrial Group - synthetic HSE dataset generator.

    python generate_data.py

Deterministic (seed 42), standard library only, self-validating. Re-running
reproduces every CSV byte for byte.

EVERYTHING HERE IS FICTIONAL. Kelvara Industrial Group does not exist. No real
worker, employer, incident or claim is represented. The unit of analysis is an
incident case on a statutory injury log, never a patient: there is no name, no
date of birth, no diagnosis and no free text anywhere in the output.

WHAT THIS MODELS
--------------------------------------------------------------------------
A mid-size heavy-industrial contractor, HQ Rotterdam, ~4,400 workers including
subcontract labour, eight sites across five regulatory regimes. Thirty closed
months, January 2024 to June 2026.

The dataset exists to make one thing answerable: is an injury pattern a RATE
problem or a VOLUME problem. That requires a denominator, so exposure hours are
generated first, at site x month x shift x worker class, and every incident is
drawn against the hours actually worked in its cell. A site that doubles its
headcount should NOT look twice as dangerous, and here it does not.

THE FOUR PLANTED ANOMALIES
--------------------------------------------------------------------------
A1  Jebel Ali switches to a cheaper glove in Sep 2025. EN 388 cut resistance
    drops from level D to level B. Hand and finger case rate goes 3.3 to 8.8
    per 200k hours (x2.7), with "worn, wrong specification" PPE rising to 48%
    of those cases while exposure hours stay flat. A rate step, not a volume
    step.
A2  Rotterdam-Botlek decommissions a palletising conveyor in Jan 2026 and
    reverts to manual handling on NIGHTS ONLY. On that slice the severity rate
    goes 7.8 to 27.3 and the lower-back case rate 0.41 to 4.81. Invisible in
    group TRIR, which is the point. Note it must be read as a RATE: there are
    no lost-time lower-back cases on the night slice before the change, so a
    days-per-case mean divides by zero and reports a false improvement.
A3  Pasir Gudang ramps headcount 40% from Mar 2026. Eye injuries concentrate in
    the sub-90-day tenure band at ~4x the site average while absolute counts
    look proportionate to the extra hours.
A4  Port Arthur 2024 is a DATA QUALITY plant, not a safety plant. Two cases
    carry days-away values of 214 and 260, breaching the 180-day cap at
    29 CFR 1904.7(b)(3)(vii), and 2024 codes ~4% of cases to "multiple body
    parts" or "nonclassifiable" against ~1% in 2026, so every specific region
    is under-reported in the earlier year.

CODING
--------------------------------------------------------------------------
Body region, event and nature follow OIICS 2.01 groups. Two departures are
labelled as employer extensions in the dimension rather than smuggled in:
OIICS 32 is a single undivided code for the back and is split here into upper
and lower, and OIICS carries no laterality anywhere.
"""

import csv
import os
import random
from datetime import date, timedelta

SEED = 42
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'csv')

START = date(2024, 1, 1)
END = date(2026, 6, 30)

# --- calibration targets -----------------------------------------------------
# Chosen so the headline rates land on defensible round numbers for a heavy
# industrial contractor. TRIR 2.1 and LTIFR 3.0 are unremarkable for this
# sector, which is the point: the story is in the distribution, not the total.
T_HOURS      = 20_900_000
T_CASES      = 1492          # every case incl. first aid
T_RECORDABLE = 219           # TRIR numerator
T_DART       = 115           # days away, restricted or transfer
T_LTI        = 63            # days-away cases, LTIFR numerator
T_DAYS_AWAY  = 1317          # calendar days away, as recorded (uncapped)

rnd = random.Random(SEED)


# =============================================================================
# DIMENSIONS
# =============================================================================

# key, code, name, country, regime, business unit, timezone-ish region, headcount base
SITES = [
    (1, 'VLI', 'Vlissingen',       'NL', 'Arbowet',        'Structural Steel Fabrication', 'Europe',      560),
    (2, 'BOT', 'Rotterdam-Botlek', 'NL', 'Arbowet',        'Port Bulk Terminals',          'Europe',      720),
    (3, 'TEE', 'Teesside',         'UK', 'RIDDOR',         'Petrochemical Turnaround',     'Europe',      480),
    (4, 'PGU', 'Pasir Gudang',     'MY', 'OSHA 1994',      'Structural Steel Fabrication', 'Asia',        640),
    (5, 'KER', 'Kerteh',           'MY', 'OSHA 1994',      'Petrochemical Turnaround',     'Asia',        430),
    (6, 'JEB', 'Jebel Ali',        'AE', 'UAE Federal',    'Port Bulk Terminals',          'Middle East', 690),
    (7, 'RAS', 'Ras Laffan',       'QA', 'Qatar Labour',   'Petrochemical Turnaround',     'Middle East', 520),
    (8, 'PAR', 'Port Arthur',      'US', '29 CFR 1904',    'Mining Materials Handling',    'Americas',    360),
]

SHIFTS = [(1, 'Day', 0.52), (2, 'Swing', 0.30), (3, 'Night', 0.18)]
WORKER_CLASSES = [(1, 'Employee', 0.68), (2, 'Contractor', 0.32)]

# key, oiics, name, division, drawable, bilateral, svg_id
BODY_REGIONS = [
    ( 1, '11',   'Skull',              'Head',            1, 0, 'skull'),
    ( 2, '12',   'Ear',                'Head',            1, 1, 'ear'),
    ( 3, '132',  'Eye',                'Head',            1, 1, 'eye'),
    ( 4, '133',  'Nose',               'Head',            1, 0, 'nose'),
    ( 5, '13',   'Face',               'Head',            1, 0, 'face'),
    ( 6, '134',  'Mouth and jaw',      'Head',            1, 0, 'jaw'),
    ( 7, '2',    'Neck',               'Neck',            1, 0, 'neck'),
    ( 8, '31',   'Chest',              'Trunk',           1, 0, 'chest'),
    ( 9, '32U',  'Upper back',         'Trunk',           1, 0, 'upperback'),
    (10, '32L',  'Lower back',         'Trunk',           1, 0, 'lowerback'),
    (11, '33',   'Abdomen',            'Trunk',           1, 0, 'abdomen'),
    (12, '34',   'Pelvis and hip',     'Trunk',           1, 0, 'pelvis'),
    (13, '344',  'Groin',              'Trunk',           1, 0, 'groin'),
    (14, '343',  'Buttock',            'Trunk',           1, 0, 'buttock'),
    (15, '41',   'Shoulder',           'Upper extremity', 1, 1, 'shoulder'),
    (16, '421',  'Upper arm',          'Upper extremity', 1, 1, 'upperarm'),
    (17, '422',  'Elbow',              'Upper extremity', 1, 1, 'elbow'),
    (18, '423',  'Forearm',            'Upper extremity', 1, 1, 'forearm'),
    (19, '43',   'Wrist',              'Upper extremity', 1, 1, 'wrist'),
    (20, '441',  'Hand',               'Upper extremity', 1, 1, 'hand'),
    (21, '442',  'Fingers and thumb',  'Upper extremity', 1, 1, 'fingers'),
    (22, '511',  'Thigh',              'Lower extremity', 1, 1, 'thigh'),
    (23, '512',  'Knee',               'Lower extremity', 1, 1, 'knee'),
    (24, '513',  'Lower leg',          'Lower extremity', 1, 1, 'lowerleg'),
    (25, '52',   'Ankle',              'Lower extremity', 1, 1, 'ankle'),
    (26, '53',   'Foot',               'Lower extremity', 1, 1, 'foot'),
    (27, '532',  'Toes',               'Lower extremity', 1, 1, 'toes'),
    # Not drawable. These sit in a tray beside the figure precisely so that bad
    # coding is visible instead of silently vanishing from the body map.
    (28, '6',    'Body systems',       'Not drawable',    0, 0, ''),
    (29, '8',    'Multiple body parts','Not drawable',    0, 0, ''),
    (30, '9',    'Nonclassifiable',    'Not drawable',    0, 0, ''),
]

# key, oiics group, name  (Event or Exposure)
MECHANISMS = [
    ( 1, '11', 'Struck against stationary object'),
    ( 2, '12', 'Struck by falling object'),
    ( 3, '13', 'Struck by swinging or slipping object'),
    ( 4, '14', 'Caught in running equipment'),
    ( 5, '15', 'Caught in or crushed by shifting objects'),
    ( 6, '16', 'Rubbed or abraded by friction'),
    ( 7, '21', 'Overexertion in lifting or lowering'),
    ( 8, '22', 'Overexertion in pushing or pulling'),
    ( 9, '23', 'Overexertion in holding or carrying'),
    (10, '24', 'Repetitive motion'),
    (11, '25', 'Awkward posture'),
    (12, '31', 'Fall on same level, slip or trip'),
    (13, '32', 'Fall to lower level'),
    (14, '41', 'Contact with electric current'),
    (15, '42', 'Contact with temperature extreme'),
    (16, '43', 'Contact with chemical or allergenic substance'),
    (17, '44', 'Exposure to noise'),
    (18, '45', 'Exposure to air pressure change'),
    (19, '51', 'Struck by powered vehicle, non-collision'),
    (20, '61', 'Contact with sharp object, cut or pierce'),
]

# key, oiics group, name  (Nature of Injury)
NATURES = [
    ( 1, '01', 'Laceration or cut'),
    ( 2, '02', 'Puncture'),
    ( 3, '03', 'Abrasion'),
    ( 4, '04', 'Bruise or contusion'),
    ( 5, '05', 'Fracture'),
    ( 6, '06', 'Dislocation'),
    ( 7, '07', 'Sprain or strain'),
    ( 8, '08', 'Tendonitis'),
    ( 9, '09', 'Amputation'),
    (10, '10', 'Burn, heat'),
    (11, '11', 'Burn, chemical'),
    (12, '12', 'Foreign body in eye'),
    (13, '13', 'Hearing loss or tinnitus'),
    (14, '14', 'Crushing injury'),
]

JOB_ROLES = [
    ( 1, 'Welder',                  'Fabrication', 0.13),
    ( 2, 'Fitter',                  'Fabrication', 0.11),
    ( 3, 'Rigger',                  'Lifting',     0.08),
    ( 4, 'Crane operator',          'Lifting',     0.04),
    ( 5, 'Scaffolder',              'Access',      0.07),
    ( 6, 'Insulation technician',   'Access',      0.05),
    ( 7, 'Process operator',        'Operations',  0.12),
    ( 8, 'Mechanical technician',   'Maintenance', 0.10),
    ( 9, 'Electrical technician',   'Maintenance', 0.06),
    (10, 'Materials handler',       'Logistics',   0.13),
    (11, 'Plant driver',            'Logistics',   0.06),
    (12, 'HSE advisor',             'Support',     0.05),
]

SEVERITY = [
    (1, 'First aid only',              0, 0, 0, 'Not recordable under 1904.7'),
    (2, 'Medical treatment',           1, 0, 0, 'Recordable, no days away or restriction'),
    (3, 'Restricted work or transfer', 1, 1, 0, 'DART, job transfer or restricted duty'),
    (4, 'Days away from work',         1, 1, 1, 'DART and lost time'),
    (5, 'Significant injury',          1, 1, 1, 'Recordable under 1904.7(b)(7), none in period'),
    (6, 'Fatality',                    1, 1, 1, 'None in period'),
]

TENURE_BANDS = [
    (1, 'Under 90 days',  0.14),
    (2, '90 days to 1yr', 0.18),
    (3, '1 to 3 years',   0.26),
    (4, '3 to 10 years',  0.28),
    (5, 'Over 10 years',  0.14),
]

PPE_STATUS = [
    (1, 'Worn, correct specification',  0.58),
    (2, 'Worn, wrong specification',    0.09),
    (3, 'Not worn, available',          0.13),
    (4, 'Not worn, not available',      0.05),
    (5, 'Not applicable to task',       0.15),
]

LATERALITY = [(1, 'Left'), (2, 'Right'), (3, 'Bilateral'), (4, 'Not applicable')]

INDICATORS = [
    (1, 'Near miss report'),
    (2, 'Hazard observation'),
    (3, 'Safety conversation'),
    (4, 'Planned inspection'),
    (5, 'Toolbox talk'),
]


# =============================================================================
# HELPERS
# =============================================================================

def months_between(a, b):
    out, y, m = [], a.year, a.month
    while (y, m) <= (b.year, b.month):
        out.append((y, m))
        m += 1
        if m == 13:
            y, m = y + 1, 1
    return out

MONTHS = months_between(START, END)
MONTH_KEYS = [y * 100 + m for (y, m) in MONTHS]

def pick(rows, weights):
    return rnd.choices(rows, weights=weights, k=1)[0]

def write_csv(name, header, rows):
    path = os.path.join(OUT, name)
    with open(path, 'w', newline='', encoding='utf-8') as f:
        w = csv.writer(f, lineterminator='\n')
        w.writerow(header)
        w.writerows(rows)
    return path


# =============================================================================
# 1. EXPOSURE HOURS  (the denominator; generated before any incident exists)
# =============================================================================

def headcount_multiplier(site_key, ym):
    """A3: Pasir Gudang ramps 40% from Mar 2026 and stays there."""
    if site_key == 4 and ym >= 202603:
        return 1.40
    return 1.0

def seasonal(ym):
    """Turnaround seasonality. Spring and autumn shutdowns lift hours."""
    m = ym % 100
    return {3: 1.10, 4: 1.14, 5: 1.08, 9: 1.09, 10: 1.13, 11: 1.06}.get(m, 1.0)

def build_exposure():
    rows = []
    for (sk, _c, _n, _cty, _reg, _bu, _r, base) in SITES:
        for ym in MONTH_KEYS:
            site_month = base * headcount_multiplier(sk, ym) * seasonal(ym)
            for (shk, _sn, sh_share) in SHIFTS:
                for (wk, _wn, w_share) in WORKER_CLASSES:
                    workers = site_month * sh_share * w_share
                    # 160 nominal hours per worker-month, jittered a little
                    hours = workers * 160.0 * rnd.uniform(0.94, 1.06)
                    rows.append([sk, ym, shk, wk, int(round(hours))])
    return rows

exposure = build_exposure()

# Scale once so the grand total lands exactly on target. Doing this after
# generation keeps every relative shape (ramp, seasonality, shift mix) intact.
raw_total = sum(r[4] for r in exposure)
scale = T_HOURS / raw_total
for r in exposure:
    r[4] = int(round(r[4] * scale))
drift = T_HOURS - sum(r[4] for r in exposure)
exposure[0][4] += drift          # absorb rounding drift in one cell

HOURS_BY = {}
for sk, ym, shk, wk, h in exposure:
    HOURS_BY[(sk, ym)] = HOURS_BY.get((sk, ym), 0) + h
    HOURS_BY[(sk, ym, shk)] = HOURS_BY.get((sk, ym, shk), 0) + h


# =============================================================================
# 2. INCIDENT HAZARD SHAPE
# =============================================================================

# Baseline relative hazard per business unit. Turnaround work is the sharp end.
BU_HAZARD = {
    'Structural Steel Fabrication': 1.05,
    'Petrochemical Turnaround':     1.25,
    'Port Bulk Terminals':          0.95,
    'Mining Materials Handling':    1.10,
}
SITE_BU = {s[0]: s[5] for s in SITES}

def anomaly_multiplier(site_key, ym, shift_key):
    m = 1.0
    if site_key == 6 and ym >= 202509:      # A1 Jebel Ali glove change
        m *= 1.22
    if site_key == 2 and ym >= 202601 and shift_key == 3:   # A2 Botlek nights
        m *= 1.10
    return m

def month_weight(sk, ym, shk):
    h = HOURS_BY.get((sk, ym, shk), 0)
    return h * BU_HAZARD[SITE_BU[sk]] * anomaly_multiplier(sk, ym, shk)

CELLS, WEIGHTS = [], []
for (sk, *_rest) in SITES:
    for ym in MONTH_KEYS:
        for (shk, _n, _s) in SHIFTS:
            CELLS.append((sk, ym, shk))
            WEIGHTS.append(month_weight(sk, ym, shk))

cells = rnd.choices(CELLS, weights=WEIGHTS, k=T_CASES)


# =============================================================================
# 3. BODY REGION / MECHANISM / NATURE
# =============================================================================

# Base body-region mix for heavy industry: hands and fingers dominate frequency,
# backs and knees dominate severity. Weights are relative, not percentages.
REGION_BASE = {
    21: 155,  # fingers and thumb
    20: 105,  # hand
    3:   72,  # eye
    10:  68,  # lower back
    23:  52,  # knee
    15:  48,  # shoulder
    25:  40,  # ankle
    26:  34,  # foot
    19:  32,  # wrist
    18:  26,  # forearm
    24:  25,  # lower leg
    17:  22,  # elbow
    5:   20,  # face
    22:  18,  # thigh
    8:   17,  # chest
    9:   16,  # upper back
    16:  15,  # upper arm
    7:   14,  # neck
    1:   13,  # skull
    27:  12,  # toes
    12:  10,  # pelvis and hip
    11:   9,  # abdomen
    2:    8,  # ear
    4:    7,  # nose
    6:    7,  # mouth and jaw
    14:   5,  # buttock
    13:   4,  # groin
    28:   6,  # body systems
    29:  10,  # multiple body parts
    30:   6,  # nonclassifiable
}

def region_weights(site_key, ym, shift_key, tenure_key):
    w = dict(REGION_BASE)
    # A1 Jebel Ali: hand and finger laceration rate x2.3 from Sep 2025
    if site_key == 6 and ym >= 202509:
        w[21] *= 2.3
        w[20] *= 2.3
    # A2 Botlek nights: manual handling returns, backs and shoulders
    if site_key == 2 and ym >= 202601 and shift_key == 3:
        w[10] *= 2.2
        w[15] *= 1.8
    # A3 Pasir Gudang: eye injuries concentrate in the newest workers
    if site_key == 4 and ym >= 202603 and tenure_key == 1:
        w[3] *= 4.0
    # A4 Port Arthur 2024: bad coding inflates the non-drawable tray
    if site_key == 8 and ym // 100 == 2024:
        w[29] *= 5.0
        w[30] *= 4.0
    return w

# Which mechanisms plausibly injure which region. Kept coarse on purpose: a
# fully specified crosswalk would be invented precision.
REGION_MECH = {
    21: [20, 3, 5, 1, 4], 20: [20, 3, 1, 5, 6], 3: [16, 3, 1, 20],
    10: [7, 8, 9, 11, 12], 9: [7, 9, 11], 15: [7, 9, 8, 10, 3],
    23: [12, 13, 1, 5], 25: [12, 13, 1], 26: [2, 12, 5, 19],
    19: [12, 10, 20, 3], 18: [20, 3, 1], 17: [1, 12, 3], 16: [3, 1, 2],
    24: [1, 2, 12, 3], 22: [1, 2, 12], 27: [2, 5, 19], 12: [12, 13, 2],
    8: [1, 2, 3], 11: [1, 2, 15], 7: [7, 11, 12], 1: [2, 12, 13, 1],
    5: [3, 1, 20, 16], 2: [17, 3], 4: [3, 1], 6: [3, 1], 14: [12, 13],
    13: [7, 9], 28: [16, 17, 15, 18], 29: [13, 5, 19, 2], 30: [13, 5, 2],
}
MECH_NATURE = {
    20: [1, 2], 3: [1, 4, 14], 1: [4, 3], 2: [4, 5, 14], 5: [14, 5, 4],
    4: [14, 9, 5], 6: [3, 1], 7: [7, 8], 8: [7], 9: [7], 10: [8, 7],
    11: [7, 8], 12: [7, 4, 5, 6], 13: [5, 4, 7, 6], 14: [10],
    15: [10], 16: [11, 12], 17: [13], 18: [13], 19: [4, 5, 14],
}


# =============================================================================
# 4. BUILD CASES
# =============================================================================

cases = []
for i, (sk, ym, shk) in enumerate(cells, start=1):
    wk = pick([w[0] for w in WORKER_CLASSES], [w[2] for w in WORKER_CLASSES])
    # A3: the ramp brings in new starters, so tenure skews young at that site
    tb_w = [t[2] for t in TENURE_BANDS]
    if sk == 4 and ym >= 202603:
        tb_w = [0.34, 0.24, 0.18, 0.16, 0.08]
    tk = pick([t[0] for t in TENURE_BANDS], tb_w)

    rw = region_weights(sk, ym, shk, tk)
    rk = pick(list(rw.keys()), list(rw.values()))

    mk = rnd.choice(REGION_MECH.get(rk, [1]))
    nk = rnd.choice(MECH_NATURE.get(mk, [4]))

    role_k = pick([r[0] for r in JOB_ROLES], [r[3] for r in JOB_ROLES])

    ppe_w = [p[2] for p in PPE_STATUS]
    if sk == 6 and ym >= 202509 and rk in (20, 21):
        ppe_w = [0.18, 0.52, 0.11, 0.05, 0.14]      # A1 signature
    ppe_k = pick([p[0] for p in PPE_STATUS], ppe_w)

    bilateral = {b[0]: b[5] for b in BODY_REGIONS}[rk]
    if not bilateral:
        lat_k = 4
    else:
        lat_k = pick([1, 2, 3], [0.38, 0.58, 0.04])   # right-hand dominance

    y, m = ym // 100, ym % 100
    last = (date(y + (m == 12), (m % 12) + 1, 1) - timedelta(days=1)).day
    d = date(y, m, rnd.randint(1, last))

    cases.append({
        'id': i, 'site': sk, 'ym': ym, 'date': d, 'shift': shk, 'worker_class': wk,
        'region': rk, 'mech': mk, 'nature': nk, 'role': role_k,
        'tenure': tk, 'ppe': ppe_k, 'lat': lat_k,
    })

# --- severity by exact quota -------------------------------------------------
# Assigning severity by quota rather than probability is what makes TRIR, DART
# and LTIFR land on their stated targets exactly. Severity is correlated with
# region and mechanism through a score, then the quotas are cut off that
# ordering, so the correlation survives the calibration.
SEVERE_REGION = {10: 3.1, 9: 2.4, 23: 2.6, 15: 2.5, 25: 2.0, 1: 2.4, 7: 2.6,
                 5: 1.4, 8: 1.8, 12: 2.2, 22: 1.7, 24: 1.6, 19: 1.5, 26: 1.5,
                 21: 0.75, 20: 0.85, 3: 0.55, 2: 0.4, 4: 0.4, 6: 0.5, 27: 0.7}
SEVERE_MECH = {13: 3.0, 5: 2.5, 4: 2.6, 7: 2.0, 12: 1.8, 19: 2.2, 9: 1.7,
               14: 2.4, 2: 1.6, 20: 0.7, 16: 0.8, 17: 0.9, 3: 1.0}

for c in cases:
    s = (SEVERE_REGION.get(c['region'], 1.0)
         * SEVERE_MECH.get(c['mech'], 1.0)
         * rnd.lognormvariate(0.0, 0.85))
    if c['site'] == 2 and c['ym'] >= 202601 and c['shift'] == 3 and c['region'] in (10, 15):
        s *= 3.2                                   # A2 severity, not frequency
    c['score'] = s

ordered = sorted(cases, key=lambda c: -c['score'])
n_days_away = T_LTI
n_restrict = T_DART - T_LTI
n_medical = T_RECORDABLE - T_DART
for i, c in enumerate(ordered):
    if i < n_days_away:
        c['sev'] = 4
    elif i < n_days_away + n_restrict:
        c['sev'] = 3
    elif i < T_RECORDABLE:
        c['sev'] = 2
    else:
        c['sev'] = 1

# --- days away, summing exactly to target ------------------------------------
lti = [c for c in ordered if c['sev'] == 4]
raw = [max(1.0, rnd.lognormvariate(2.15, 0.72)) for _ in lti]

# A4: two Port Arthur 2024 cases breach the 180-day cap. If none happens to be
# in the LTI set, promote the two highest-scoring Port Arthur 2024 cases.
par24 = [c for c in lti if c['site'] == 8 and c['ym'] // 100 == 2024]
if len(par24) < 2:
    pool = sorted([c for c in cases if c['site'] == 8 and c['ym'] // 100 == 2024
                   and c['sev'] != 4], key=lambda c: -c['score'])
    for c in pool[:2 - len(par24)]:
        demote = min([x for x in lti if x['site'] != 8], key=lambda x: x['score'])
        demote['sev'] = 2
        lti.remove(demote)
        c['sev'] = 4
        lti.append(c)
        raw = raw[:len(lti)] + [10.0] * max(0, len(lti) - len(raw))
    par24 = [c for c in lti if c['site'] == 8 and c['ym'] // 100 == 2024]

par24 = sorted(par24, key=lambda c: -c['score'])[:2]
breach = {id(par24[0]): 214, id(par24[1]): 260}

rest = [c for c in lti if id(c) not in breach]
rest_raw = [max(1.0, rnd.lognormvariate(2.05, 0.70)) for _ in rest]
target_rest = T_DAYS_AWAY - 214 - 260
k = target_rest / sum(rest_raw)
vals = [max(1, int(round(v * k))) for v in rest_raw]
vals[0] += target_rest - sum(vals)                 # absorb rounding drift
assert vals[0] >= 1

for c in lti:
    c['days_away'] = breach.get(id(c), 0)
for c, v in zip(rest, vals):
    c['days_away'] = v

for c in cases:
    if c['sev'] != 4:
        c['days_away'] = 0
    c['days_restricted'] = (rnd.randint(2, 24) if c['sev'] == 3 else 0)
    # Cost BAND rather than an amount: five incompatible compensation regimes
    # make a single synthetic currency figure indefensible.
    base = {1: 0, 2: 2, 3: 4, 4: 6}[c['sev']]
    c['cost_band'] = min(9, base + (1 if c['days_away'] > 30 else 0)
                            + (1 if c['days_away'] > 120 else 0)
                            + rnd.randint(0, 1))


# =============================================================================
# 5. LEADING INDICATORS
# =============================================================================

leading = []
for (sk, *_r) in SITES:
    for ym in MONTH_KEYS:
        h = HOURS_BY[(sk, ym)]
        for (ik, _nm) in INDICATORS:
            per100k = {1: 42, 2: 68, 3: 95, 4: 22, 5: 130}[ik]
            # Reporting culture improves through the period at every site
            drift_f = 1.0 + 0.22 * (MONTH_KEYS.index(ym) / max(1, len(MONTH_KEYS) - 1))
            n = (h / 100_000.0) * per100k * drift_f * rnd.uniform(0.86, 1.14)
            leading.append([sk, ym, ik, int(round(n))])


# =============================================================================
# 6. WRITE
# =============================================================================

os.makedirs(OUT, exist_ok=True)

d = START
date_rows = []
while d <= END:
    ym = d.year * 100 + d.month
    q = (d.month - 1) // 3 + 1
    date_rows.append([
        d.isoformat(), d.year, q, 'Q%d %d' % (q, d.year), d.month,
        d.strftime('%B'), d.strftime('%b'), ym, d.strftime('%b %Y'),
        d.isoweekday(), d.strftime('%A'), 1 if d.isoweekday() >= 6 else 0,
        d.year * 10 + q,
    ])
    d += timedelta(days=1)

write_csv('dim_date.csv',
          ['Date', 'Year', 'QuarterNo', 'Quarter', 'MonthNo', 'MonthName', 'MonthShort',
           'YearMonthKey', 'YearMonthLabel', 'WeekdayNo', 'WeekdayName', 'IsWeekend',
           'YearQuarterKey'], date_rows)

write_csv('dim_site.csv',
          ['SiteKey', 'SiteCode', 'SiteName', 'Country', 'Regime', 'BusinessUnit',
           'Region', 'HeadcountBase'], SITES)

write_csv('dim_body_region.csv',
          ['BodyRegionKey', 'OiicsCode', 'BodyRegion', 'Division', 'IsDrawable',
           'IsBilateral', 'SvgId'], BODY_REGIONS)

write_csv('dim_mechanism.csv', ['MechanismKey', 'OiicsCode', 'Mechanism'], MECHANISMS)
write_csv('dim_nature.csv', ['NatureKey', 'OiicsCode', 'Nature'], NATURES)
write_csv('dim_job_role.csv', ['JobRoleKey', 'JobRole', 'RoleFamily', 'HourShare'],
          [(k, n, f, round(s, 4)) for (k, n, f, s) in JOB_ROLES])
write_csv('dim_shift.csv', ['ShiftKey', 'Shift', 'HourShare'],
          [(k, n, s) for (k, n, s) in SHIFTS])
write_csv('dim_worker_class.csv', ['WorkerClassKey', 'WorkerClass', 'HourShare'],
          [(k, n, s) for (k, n, s) in WORKER_CLASSES])
write_csv('dim_severity_class.csv',
          ['SeverityKey', 'SeverityClass', 'IsRecordable', 'IsDart', 'IsLostTime', 'Note'],
          SEVERITY)
write_csv('dim_tenure_band.csv', ['TenureKey', 'TenureBand', 'PopShare'],
          [(k, n, s) for (k, n, s) in TENURE_BANDS])
write_csv('dim_ppe_status.csv', ['PpeStatusKey', 'PpeStatus', 'BaseShare'],
          [(k, n, s) for (k, n, s) in PPE_STATUS])
write_csv('dim_laterality.csv', ['LateralityKey', 'Laterality'], LATERALITY)
write_csv('dim_indicator_type.csv', ['IndicatorKey', 'IndicatorType'], INDICATORS)

write_csv('fact_exposure_hours.csv',
          ['SiteKey', 'YearMonthKey', 'ShiftKey', 'WorkerClassKey', 'HoursWorked'],
          exposure)

write_csv('fact_leading_indicator.csv',
          ['SiteKey', 'YearMonthKey', 'IndicatorKey', 'EventCount'], leading)

inc_rows = []
for c in sorted(cases, key=lambda x: (x['date'], x['id'])):
    inc_rows.append([
        c['id'], c['date'].isoformat(), c['site'], c['shift'], c['worker_class'],
        c['role'], c['region'], c['lat'], c['mech'], c['nature'], c['sev'],
        c['tenure'], c['ppe'], c['days_away'], c['days_restricted'], c['cost_band'],
    ])
write_csv('fact_incident.csv',
          ['IncidentKey', 'Date', 'SiteKey', 'ShiftKey', 'WorkerClassKey', 'JobRoleKey',
           'BodyRegionKey', 'LateralityKey', 'MechanismKey', 'NatureKey', 'SeverityKey',
           'TenureKey', 'PpeStatusKey', 'DaysAway', 'DaysRestricted', 'CostBand'],
          inc_rows)


# =============================================================================
# 7. VALIDATE  (a generator that does not check itself is a rumour)
# =============================================================================

fail = []

def check(label, got, want, tol=0):
    ok = abs(got - want) <= tol
    print('  %-46s %12s  %s' % (label, got, 'OK' if ok else 'FAIL, expected %s' % want))
    if not ok:
        fail.append(label)

hours = sum(r[4] for r in exposure)
rec = [c for c in cases if c['sev'] in (2, 3, 4, 5, 6)]
dart = [c for c in cases if c['sev'] in (3, 4, 5, 6)]
lti_f = [c for c in cases if c['sev'] in (4, 5, 6)]
days = sum(c['days_away'] for c in cases)

print('\nKELVARA INDUSTRIAL GROUP - synthetic HSE dataset')
print('=' * 72)
print('\nVolumes')
check('exposure hours', hours, T_HOURS)
check('incident cases', len(cases), T_CASES)
check('recordable cases', len(rec), T_RECORDABLE)
check('DART cases', len(dart), T_DART)
check('lost-time cases', len(lti_f), T_LTI)
check('days away (as recorded)', days, T_DAYS_AWAY)
check('first aid only', len(cases) - len(rec), T_CASES - T_RECORDABLE)

print('\nHeadline rates')
trir = len(rec) * 200_000 / hours
dartr = len(dart) * 200_000 / hours
sevr = days * 200_000 / hours
ltifr = len(lti_f) * 1_000_000 / hours
for label, got, want in [('TRIR (per 200k hours)', trir, 2.10),
                         ('DART rate', dartr, 1.10),
                         ('Severity rate (uncapped)', sevr, 12.60),
                         ('LTIFR (per 1m hours)', ltifr, 3.01)]:
    ok = abs(got - want) < 0.06
    print('  %-46s %12.2f  %s' % (label, got, 'OK' if ok else 'FAIL, expected ~%.2f' % want))
    if not ok:
        fail.append(label)

print('\nReferential integrity')
keysets = {
    'SiteKey': {s[0] for s in SITES}, 'ShiftKey': {s[0] for s in SHIFTS},
    'WorkerClassKey': {w[0] for w in WORKER_CLASSES}, 'JobRoleKey': {r[0] for r in JOB_ROLES},
    'BodyRegionKey': {b[0] for b in BODY_REGIONS}, 'LateralityKey': {l[0] for l in LATERALITY},
    'MechanismKey': {m[0] for m in MECHANISMS}, 'NatureKey': {n[0] for n in NATURES},
    'SeverityKey': {s[0] for s in SEVERITY}, 'TenureKey': {t[0] for t in TENURE_BANDS},
    'PpeStatusKey': {p[0] for p in PPE_STATUS},
}
cols = ['site', 'shift', 'worker_class', 'role', 'region', 'lat', 'mech', 'nature',
        'sev', 'tenure', 'ppe']
for (name, valid), col in zip(keysets.items(), cols):
    orphans = sum(1 for c in cases if c[col] not in valid)
    check('orphans in fact_incident.%s' % name, orphans, 0)
missing_months = sum(1 for r in exposure if r[1] not in set(MONTH_KEYS))
check('exposure rows outside the date range', missing_months, 0)
check('exposure grain rows (8x30x3x2)', len(exposure), 1440)
check('leading indicator rows (8x30x5)', len(leading), 1200)
check('drawable body regions', sum(b[4] for b in BODY_REGIONS), 27)
check('bilateral body regions', sum(b[5] for b in BODY_REGIONS), 15)

print('\nPlanted anomalies')

def rate(subset, hrs, mult=200_000):
    return (len(subset) * mult / hrs) if hrs else 0.0

# A1 Jebel Ali hand and finger cases, before and after Sep 2025
jeb_pre_h = sum(r[4] for r in exposure if r[0] == 6 and r[1] < 202509)
jeb_post_h = sum(r[4] for r in exposure if r[0] == 6 and r[1] >= 202509)
jp = [c for c in cases if c['site'] == 6 and c['region'] in (20, 21) and c['ym'] < 202509]
jq = [c for c in cases if c['site'] == 6 and c['region'] in (20, 21) and c['ym'] >= 202509]
r1, r2 = rate(jp, jeb_pre_h), rate(jq, jeb_post_h)
print('  A1 Jebel Ali hand+finger rate  %.2f -> %.2f  (x%.2f)' % (r1, r2, r2 / r1 if r1 else 0))
if r2 <= r1 * 1.5:
    fail.append('A1 not detectable')
wrong_spec = sum(1 for c in jq if c['ppe'] == 2) / max(1, len(jq))
print('  A1 "wrong specification" PPE share after   %.0f%%' % (wrong_spec * 100))

# A2 Botlek nights. Measured as a SEVERITY RATE on the night slice, not as days
# per case: there are no lost-time lower-back cases on that slice before the
# change, so a per-case mean divides by zero and reports a false 0.0. This is
# the small-numbers trap the report itself has to avoid, so the validator
# models the correct statistic rather than the tempting one.
def slice_rate(site, shift, lo, hi, regions=None, field=None):
    h = sum(r[4] for r in exposure if r[0] == site and r[2] == shift and lo <= r[1] <= hi)
    sub = [c for c in cases if c['site'] == site and c['shift'] == shift and lo <= c['ym'] <= hi
           and (regions is None or c['region'] in regions)]
    if not h:
        return 0.0, 0, 0
    num = sum(c[field] for c in sub) if field else len(sub)
    return num * 200_000 / h, len(sub), h

sev_pre, n_pre, _ = slice_rate(2, 3, 202401, 202512, field='days_away')
sev_post, n_post, _ = slice_rate(2, 3, 202601, 202606, field='days_away')
lb_pre, nlb_pre, _ = slice_rate(2, 3, 202401, 202512, regions={10})
lb_post, nlb_post, _ = slice_rate(2, 3, 202601, 202606, regions={10})
print('  A2 Botlek NIGHT severity rate              %.2f -> %.2f  (x%.1f)'
      % (sev_pre, sev_post, sev_post / sev_pre if sev_pre else 0))
print('  A2 Botlek NIGHT lower-back case rate       %.2f -> %.2f  (n %d -> %d)'
      % (lb_pre, lb_post, nlb_pre, nlb_post))
if sev_post <= sev_pre * 1.8:
    fail.append('A2 not detectable')

# A3 Pasir Gudang eye injuries in the newest tenure band
pg = [c for c in cases if c['site'] == 4 and c['ym'] >= 202603]
pg_eye_new = [c for c in pg if c['region'] == 3 and c['tenure'] == 1]
share_new = len(pg_eye_new) / max(1, len([c for c in pg if c['region'] == 3]))
print('  A3 Pasir Gudang eye cases in <90d tenure   %.0f%% of site eye cases' % (share_new * 100))
if share_new < 0.35:
    fail.append('A3 not detectable')

# A4 Port Arthur cap breaches and coding quality
breaches = [c for c in cases if c['days_away'] > 180]
print('  A4 cases breaching the 180-day cap         %d  (days %s)'
      % (len(breaches), sorted(c['days_away'] for c in breaches)))
check('A4 breaches are all Port Arthur 2024',
      sum(1 for c in breaches if c['site'] == 8 and c['ym'] // 100 == 2024), len(breaches))
for yr in (2024, 2026):
    sub = [c for c in cases if c['site'] == 8 and c['ym'] // 100 == yr]
    bad = sum(1 for c in sub if c['region'] in (29, 30))
    print('  A4 Port Arthur %d non-specific coding      %.1f%%' % (yr, 100 * bad / max(1, len(sub))))
capped = sum(min(c['days_away'], 180) for c in cases)
print('  A4 severity rate uncapped %.2f vs capped %.2f  (+%.1f%%)'
      % (sevr, capped * 200_000 / hours, 100 * (days - capped) / capped))

print('\nBody map coverage  (why the figure defaults to ALL cases)')
draw_keys = [b[0] for b in BODY_REGIONS if b[4]]
name_of = {b[0]: b[2] for b in BODY_REGIONS}
all_by = {k: sum(1 for c in cases if c['region'] == k) for k in draw_keys}
rec_by = {k: sum(1 for c in cases if c['region'] == k and c['sev'] >= 2) for k in draw_keys}
print('  drawable regions populated, all cases       %d of 27  (min %d, max %d)'
      % (sum(1 for k in draw_keys if all_by[k]), min(all_by.values()), max(all_by.values())))
print('  drawable regions populated, recordable only %d of 27  (min %d, max %d)'
      % (sum(1 for k in draw_keys if rec_by[k]), min(rec_by.values()), max(rec_by.values())))
if sum(1 for k in draw_keys if all_by[k]) != 27:
    fail.append('some drawable region has no cases at all')
print('  mean cases per region x site cell: all %.1f, recordable %.1f'
      % (len(cases) / (27 * 8), sum(rec_by.values()) / (27 * 8)))

print('\nFrequency vs severity divergence  (business question 2)')
print('  %-22s %8s %12s %14s' % ('region', 'cases', 'recordable', 'recordable %'))
for k in sorted(draw_keys, key=lambda k: -all_by[k])[:6]:
    print('  %-22s %8d %12d %13.1f%%'
          % (name_of[k], all_by[k], rec_by[k], 100 * rec_by[k] / max(1, all_by[k])))
top_freq = max(draw_keys, key=lambda k: all_by[k])
top_rec = max(draw_keys, key=lambda k: rec_by[k])
print('  most frequent region: %s;  most recordable region: %s' % (name_of[top_freq], name_of[top_rec]))
if top_freq == top_rec:
    fail.append('frequency and severity do not diverge, question 2 has no answer')

print('\nFiles written to %s' % OUT)
for f in sorted(os.listdir(OUT)):
    print('  %-32s %9d bytes' % (f, os.path.getsize(os.path.join(OUT, f))))

print()
if fail:
    print('VALIDATION FAILED: %s' % ', '.join(fail))
    raise SystemExit(1)
print('All checks passed. Deterministic under seed %d.' % SEED)
