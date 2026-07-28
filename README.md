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
gray, and nothing is a click target. **The blankness is the argument**: the same
component that shows Osborn's 93-county tour shows nothing at all on this page.

## The legend

The library's own legend is hidden and replaced by one in `index.html`. Its
entries are "Event held / Upcoming" — two colors that never appear here.

The replacement exists to make the *absence* legible. The map is a single flat
gray, so what a reader needs told is not what the gray means; it's that the
other category exists and is empty. A legend naming only the color actually on
the map would read as "this map has one category." Naming the held color and
putting a **0** beside it is what says he has held none:

```
[maroon]  TOWN HALL HELD: 0 COUNTIES
[gray]    NO TOWN HALL:  93 COUNTIES
```

Both counts are computed at load from `counties.geojson` and `events.json`
rather than hardcoded, so the legend can't outlive the file it describes. Held
counties are counted by **distinct `countyFips`**, not by number of events — two
events in Douglas County is one county shaded, and the legend counts what the
map draws. The markup ships the empty-file answer (0 / 93) so the legend is
correct before the script runs and survives a failed fetch.

The red on the zero is applied by script and only while the number really is
zero, so a legend that ever reports a real count won't still be styling it as
the punchline. The swatches mirror `VISITED_STYLE` / `UNVISITED_STYLE` in
`nebraska-map.js` — keep them in step.

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

The footer is the Osborn for Senate mark, linked to osbornforsenate.com, and the
**paid-for disclaimer** — nothing else. `PAID FOR BY OSBORN FOR SENATE` stays
regardless of what else changes: it is the legally required disclaimer, not
decoration.

Three blocks from the parent site's footer are deliberately **not** here:

- **Navy rank disclaimer** — covers use of military rank, unit, title or
  photographs in uniform. This page uses none. Bring it back if Osborn's service
  record ever appears here.
- **"Checks can be mailed to" address** — belongs with a donation ask, and this
  page makes none. Bring it back with any fundraising block.
- **Copyright line** — removed because the campaign's claim to one on this page
  was not verified, and an unverified claim is worse than none. The page's
  substance is a public fact and a Census county file. Restore it only if
  counsel confirms it.
