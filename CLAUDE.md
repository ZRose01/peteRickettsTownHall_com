# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

`index.html`, alone: a single self-contained static page counting the days since Sen. Pete Ricketts
last held an **in-person** town hall in Nebraska, on a rolling odometer. No build step, no package
manager, no test suite, and now no dependencies at all — no stylesheet links, no external scripts, no
`fetch()`. It opens from `file://`.

It used to carry a deliberately empty county map below the count, mounted from a vendored copy of the
O4S map component. **That has been cut.** `nebraska-map.js`, `nebraska-map.css`,
`assets/counties.geojson` and `assets/events.json` are still on disk and completely unreferenced —
don't reason about them as part of this page, and don't re-copy them from `../websiteMap/`. If the map
is wanted again, `git log` has the markup, the CSS overrides and the reasoning; the short version is
that `events.json` was `[]` on purpose.

To serve it anyway (useful for cache and header behaviour):

```bash
python3 -m http.server 8125
```

`README.md` is not a stub: it carries the reasoning behind nearly every decision below, and every
commit so far has updated it alongside the code. Read it before changing anything, and keep it in
step.

## The one constant

`LAST_TOWN_HALL = { year: 2025, month: 4, day: 25 }` at the top of the script block in `index.html`
(Scottsbluff, April 25 2025). The count, the `document.title` and the static `<span id="days">`
fallback all derive from it at load, computed client-side against the visitor's clock so the page
stays current with no redeploy. Both dates are floored to UTC midnight before subtracting; the anchor
is Y/M/D parts rather than a parsed string on purpose (`"2025-04-25"` parses as UTC while
`new Date()` is local — mixing them is how the counter ends up a day out). Change the three fields
and nothing else.

The copy says **in-person**. Ricketts has held tele-town halls more recently, so that word is
load-bearing and must not be dropped.

## The odometer

The count renders as an odometer that spins up on load — a clipped window per digit over a strip of
faces. **Wheels park on whole faces**, never between two: `offsetFor()` is `REST + digit`, the strip
is two full turns of 0-9, and the highest offset reached is `REST + 9`. The wheels move only during
the spin and at a midnight carry (which snaps, deliberately).

**The spin is a slot machine, not a gear train.** Columns spin independently at one flat rate and
land left to right, each waiting for its left neighbour; starting positions are random. Knobs above
`spin()`: `REEL_RATE`, `FIRST_STOP`, `LAND_SECONDS`, `HOLD` — total ≈ `FIRST_STOP + columns ×
(LAND_SECONDS + HOLD)`, and `HOLD` is the one to change for overall length. A column reaches its
digit exactly by *spinning on* until it is one braking-distance short of it (under one extra
revolution), rather than by adjusting the brake — keep that property, it is what makes the
deceleration start without a lurch. Do not reintroduce gearing between columns; that was tried
(`_geared_odometer.html`) and replaced.

The drum's pitch and window are **measured at runtime** from a hidden probe, because the live face
comes from a domain-locked Typekit and every fallback puts its digits at a different height. Keep the
measured ink as ascent/descent **relative to the baseline** — as offsets from the cell's top edge it
carries the probe's line height, which differs from the cells' own pitch on the first pass and lands
the digits clipped. `.count` needs `display: flow-root`, and `.eyebrow` / `.count-unit` need their
opaque black backgrounds: they are the drum's housing, not styling. See README for the derivation.

## Layout

Nothing on the page needs a resize listener — the odometer's drum is measured entirely in `em`, so
it rides the `clamp()` on its own.

**The fold is the whole design.** `main` is `min-height: 100dvh` and centres the hero, so the count
fills the window and the attribution begins below it; the page scrolls to reach the footer, and only
`overflow-x` is clipped. Type is sized off **height** (`.count` is `clamp(3rem, min(44vh, …), 30rem)`).
The `vw` term in `.count` is an overflow guard, not a design constraint — it is
`88vw / (var(--digits) × 0.5)` and the script sets `--digits` from the column count, so a four-figure
count can't run off the side. Don't replace it with a plain `vw` size.

The content column is `min(1200px, 92vw)`, tightening to `88vw` below 749px, matching
osbornforsenate.com's own measure. Fonts are the O4S brand faces resolved through a Typekit that is
**domain-locked to osbornforsenate.com** — everywhere else, including this site as served from
GitHub, the fallback stacks render, which is why each stack ends in a condensed or humanist system
face.

## SEO

**Never put the day count in anything static** — `<title>`, the descriptions, or `assets/share.png`.
The script rewrites `document.title` at load; everything static is written to stay true without a
number (the description sat at "459 days" for weeks). The `h1` is the sentence, not the number —
the count is a `div`, since a heading of `479` has no keywords and changes daily. The canonical host
`peterickettstownhall.com` is **inferred from the repo name** and appears in the head plus
`robots.txt` and `sitemap.xml`; confirm it before trusting it.

## Footer

The mark plus `PAID FOR BY OSBORN FOR SENATE` and nothing else. The disclaimer is legally required
and stays regardless of what else changes. Three blocks from the parent site's footer were removed
deliberately and each has a condition for return: the Navy rank disclaimer (if Osborn's service
record ever appears here), the "checks can be mailed to" address (with any fundraising ask), and the
copyright line (only if counsel confirms the claim).
