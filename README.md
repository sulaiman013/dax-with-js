# dax-with-js

Externally hosted JavaScript for Power BI **HTML Content** visuals, served over
jsDelivr and driven by a DAX measure.

The pattern: a DAX measure emits a small HTML shell plus a `<script src>` tag
pointing at a pinned tag in this repo. The measure injects live model values as
inline JavaScript; the CDN file does all the rendering. This is unsupported by
Microsoft but works, and the constraints it has to respect are documented below.

---

## What is in here

| Path | What it is |
|---|---|
| [`daily-pnl-guide/daily-pnl-guide.js`](daily-pnl-guide/daily-pnl-guide.js) | The renderer. Self-contained, no dependencies, pure ASCII. |
| [`daily-pnl-guide/preview.html`](daily-pnl-guide/preview.html) | Local test harness. Open it in a browser, no server needed. |
| [`dax/daily-pnl-guide.dax`](dax/daily-pnl-guide.dax) | The measure, with live values wired to your model. |
| [`dax/daily-pnl-guide-static.dax`](dax/daily-pnl-guide-static.dax) | The measure with zero model dependencies. Start here. |

---

## Getting it live

### 1. Push and tag

Branch paths on jsDelivr cache for around 12 hours, which shows up as the visual
mysteriously not picking up your changes. Always pin to a tag or a commit SHA.

```bash
git add -A
git commit -m "Daily P&L report guide v1.0.0"
git push -u origin master
git tag v1.0.0
git push origin v1.0.0
```

The file is then served from:

```
https://cdn.jsdelivr.net/gh/sulaiman013/dax-with-js@v1.0.0/daily-pnl-guide/daily-pnl-guide.js
```

Confirm it is reachable and correctly typed before touching Power BI. Both
headers below must be right or the sandboxed iframe will refuse to run it:

```bash
curl -sI "https://cdn.jsdelivr.net/gh/sulaiman013/dax-with-js@v1.0.0/daily-pnl-guide/daily-pnl-guide.js" \
  | grep -iE "content-type|access-control-allow-origin"
# content-type: application/javascript; charset=utf-8
# access-control-allow-origin: *
```

First request after a new tag can 404 for a few seconds while jsDelivr warms.
Just retry.

### 2. Add the visual

Use **HTML Content** by Daniel Marsh-Patrick, the regular (uncertified)
edition. The **lite** edition is certified but blocks all external URLs, so it
cannot load the script at all.

### 3. Add the measure

Paste [`dax/daily-pnl-guide-static.dax`](dax/daily-pnl-guide-static.dax) first.
It has no model dependencies, so if it renders, your plumbing is correct. Then
switch to the full variant and wire up your own measure names.

Drop the measure onto the visual's **Values** well.

---

## Hosting rules

- **Use** `https://cdn.jsdelivr.net/gh/{user}/{repo}@{tag-or-sha}/path.js`
- **Never** `raw.githubusercontent.com`. It serves `text/plain` with
  `X-Content-Type-Options: nosniff`, so the browser refuses to execute it.
- **Never** Google Drive. HTML wrapper, redirects, wrong content type.
- For development only: a branch path plus `?v=2` to bust the cache.

---

## The environment you are coding against

Custom visuals run in an iframe sandboxed with `allow-scripts` and, critically,
**without** `allow-same-origin`. The document therefore has a null origin.

| Constraint | Consequence |
|---|---|
| Null origin | No cookies, no `localStorage`, no `sessionStorage`. State goes on a `window` global. |
| External fetch | Only succeeds if the host sends `Access-Control-Allow-Origin: *` and a real JS MIME type. jsDelivr and gstatic qualify. |
| DOM is replaced | The visual rewrites its DOM and re-inserts the script tags on every cross-filter, resize and refresh. Your code runs many times per session. |
| Load order | Not guaranteed under async injection. The inline data script may run before or after the CDN file. |
| One-way | Nothing can be written back to the model. This visual cannot cross-filter others. |
| Desktop vs Service | Behave differently, especially around iframes. Always test published, not just in Desktop. |
| Uncertified | No PDF or PowerPoint export from the regular edition. |

### Idempotency is the whole game

Almost every "the visual needs a page refresh to redraw" report traces back to a
script that assumed it would run once. `daily-pnl-guide.js` handles it like this:

- An install guard at the top of the IIFE. On re-execution it calls the
  already-installed `boot()` and returns, rather than rebuilding the closure.
- Styles are injected only if `#dpg-css` is absent from the current document.
- Every listener is delegated onto the shell element, so it is discarded along
  with the DOM instead of leaking. The single document-level `keydown` handler
  sits behind a flag and no-ops if its view is detached.
- Renders are coalesced through `requestAnimationFrame`, so the inline script's
  `DPG.render()` call and the file's own re-boot produce one paint, not two.
- UI state (theme, open answers, search query, scroll position) lives on
  `window.__dpgState` and is restored after each render.

`preview.html` reproduces exactly this re-injection. **"Simulate cross-filter"
is the test that matters**; it asserts one shell, one style tag and one root
survive each pass.

### Why the DAX sends integers

`FORMAT()` emits locale-dependent separators. On a fr-FR or de-DE workspace
`1234.56` becomes `"1234,56"` and the payload silently stops being valid
JavaScript. So money crosses as **minor units** (pence) and ratios as **integer
basis points**, both via `FORMAT(x, "0")`, which emits no separator in any
locale. The renderer divides them back.

### Why single quotes, and what still needs escaping

The emitted string is JavaScript, not JSON, so single-quoted strings and bare
keys are legal. That keeps the DAX free of `""` escape soup. Text values still
go through a five-step chain, in this order:

1. backslash to two backslashes
2. `'` to backslash + `'`
3. CR to space
4. LF to space
5. `<` to backslash + `u003C`

Step 1 must come first or the backslash added in step 2 gets doubled. Step 5
matters because a value containing a closing script tag would otherwise end the
block early and dump the rest of the payload on screen as visible text. A site
name like `O'Brien's` makes step 2 non-theoretical. The `nasty` preset in the
harness tests all of it.

---

## The Daily P&L guide

An interactive version of the Optimized Daily P&L report guide. All the original
prose, restructured and made navigable.

- Sticky contents sidebar with scroll-spy, collapsing to a chip bar when narrow
- Full-text search with match highlighting and per-section hit counts
- Interactive sales-to-net-profit waterfall, driven by live measures
- Measure catalog filterable by where each measure actually appears
- Glossary tooltips on SDLY, EPOS, cashup, COGS, Ex Waste and more
- Live status tiles for FL Date Range, freshness, and labour/budget availability
- Light, dark and auto themes; keyboard shortcuts; print stylesheet

It renders in full with no data at all: the status tiles say "not supplied" and
the waterfall shows a clearly badged illustrative example.

### The blank-labour behaviour

The report deliberately blanks Net Profit when labour data is missing, rather
than letting it equal Gross Profit and overstate the bottom line. The guide
mirrors that: pass `staffCostMinor: null` and the waterfall draws hatched
"blank" bars with a footnote explaining that this is the report being honest,
not a calculation error. Try the `nolabour` preset in the harness.

### Data contract

Every field is optional. A missing value renders as "not supplied" or as the
report's own deliberate blank, never as a zero.

```js
window.__dpgData = {
  locale: 'en-GB',
  currency: 'GBP',
  meta: {
    company: 'Pizzaluxe',
    scope: 'All sites',
    dateRange: '01 Apr - 30 Jun 2026',   // [FL Date Range]
    lastUpdate: '3 hours ago',           // [Time Since Last Update]
    labourStatus: 'Available',           // [Labour Data Status]
    budgetStatus: 'No budget set'        // [Budget Data Status]
  },
  pnl: {
    netSalesMinor: 12840000,             // integer pence, preferred
    menuCostMinor: 2824800,
    grossProfitMinor: 10015200,
    staffCostMinor: 3595200,             // null renders as the report's blank
    netProfitMinor: 6420000,
    budgetMinor: 13000000,
    sdlyMinor: 11800000,
    netSalesEposMinor: 12840000,         // EPOS basis, if it differs
    gpPctBp: 7800,                       // basis points, so 78.00%
    staffPctBp: 2800
  }
};
```

Major units are also accepted (`netSales: 12345.67`, `gpPct: 0.78`) for
hand-authoring. Minor units win when both are present.

---

## Local development

```bash
# no build, no server
start daily-pnl-guide/preview.html      # Windows
open  daily-pnl-guide/preview.html      # macOS
```

The harness has two modes:

- **Local file** loads `daily-pnl-guide.js` from disk. Use this for iterating on
  rendering, interaction and the cross-filter idempotency test.
- **Sandboxed + CDN** builds a real `sandbox="allow-scripts"` iframe with a null
  origin and pulls the script from jsDelivr. This is the only mode that
  actually proves the CORS and MIME path works. Needs the tag pushed first.

Seven data presets cover the cases that break things: no data, full live values,
missing labour, missing budget, a diverging EPOS basis, trading at a loss, and
hostile strings.

### Releasing a change

```bash
git commit -am "..."
git tag v1.0.1 && git push origin master v1.0.1
```

Then bump the version in the `CdnUrl` var in both DAX files. Tags are immutable
on jsDelivr, so an old report keeps working against the old tag. That is the
point of pinning.

---

## Fallback

If this ever becomes too fragile for production, [Deneb](https://deneb-viz.github.io/)
bundles Vega and Vega-Lite inside the visual, needs no external fetch, and is a
certified path. It cannot do arbitrary DOM or interaction like this, but it will
not break when a CDN or a sandbox policy changes.

---

## License

MIT.
