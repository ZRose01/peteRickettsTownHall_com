# peteRickettsTownHall.com

A one-page site counting the days since Sen. Pete Ricketts last held an
in-person town hall in Nebraska, over a deliberately empty map of the state.

## The count

The one number the site exists to show. Its anchor is a single constant at the
top of the script block in `index.html`:

```js
var LAST_TOWN_HALL = { year: 2025, month: 4, day: 25 };
```

**Ricketts' last in-person town hall: Scottsbluff, April 25, 2025.** Change
those three fields and nothing else — the displayed number, the page title and
the `<span id="days">` fallback all derive from it at load. The count is
computed client-side against the visitor's own clock, so it ticks over on its
own and the page needs no rebuild or redeploy to stay current.

Both dates are floored to UTC midnight before subtracting, so the result is a
whole-day difference that a DST boundary or a visitor's timezone offset can't
knock off by one. The anchor is written as Y/M/D parts rather than parsed from
a string: `"2025-04-25"` would be read as UTC while `new Date()` is local, and
mixing the two is exactly how a counter ends up a day out.

Note the site says **in-person** town hall. Ricketts has held *tele*-town halls
more recently — the distinction is load-bearing and shouldn't be dropped from
the copy.

## The map

`nebraska-map.js` / `nebraska-map.css` are **verbatim copies** of the library in
`websiteMap/` (the O4S county map). Don't edit them here — fix them there and
re-copy, or the two drift apart.

What's different is the data: `assets/events.json` is an empty array. Every one
of Nebraska's 93 counties therefore falls into the component's "no event here"
gray, nothing is a click target, and the map has no legend (hidden in the page's
own CSS — the library's legend labels "Event held / Upcoming", and neither
appears here). **The blankness is the argument**: the same component that shows
Osborn's 93-county tour shows nothing at all on this page.

Two host-page overrides on top of the component's `theme: "dark"`, both in
`index.html` rather than in the library:

- **The map plate goes black.** The dark theme normally keeps a *white* plate,
  on the reasoning that a 93-polygon choropleth needs a light ground to tell
  maroon, accent-red and gray apart. This map has no maroon and no accent-red in
  it, so that reasoning doesn't apply, and a white slab in the middle of a black
  page is just a white slab. `#e2e2e2` counties on black read stronger than they
  did on white. The white plate is still right for every other use of the
  component.
- **The on-map controls go dark with it.** The library re-pins zoom and
  attribution to the light tokens precisely *because* the plate under them is
  white in both themes. This plate isn't, so that carve-out is undone.

## Running it

The JS fetches its JSON via `fetch()`, which fails from `file://` — serve it:

```bash
python3 -m http.server 8125
```

## Layout notes

- The map's height comes from `aspect-ratio`, which resolves off its width, so
  a width change *is* a height change. Leaflet caches its container dimensions,
  so every resize needs `invalidateSize()` then `nmFit()` to re-frame. Both are
  wired up, coalesced to one pass per frame.
- The content column is `min(1200px, 92vw)`, tightening to `88vw` below 749px —
  osbornforsenate.com's own column, so the page sits at the same measure as the
  campaign site.
- Fonts are the O4S brand faces, resolved through Typekit **only on
  osbornforsenate.com** — the kit is domain-locked. Everywhere else, including
  this site as served from GitHub, the fallback stacks render instead.

## Attribution

Footer carries the paid-for line, Navy rank disclaimer, mailing address and
copyright from osbornforsenate.com, in the site's own wording and order.
