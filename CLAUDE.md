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

There is no build, no lint and no test suite, so **the only verification is loading the page** —
open `index.html` and watch the spin land, then confirm the number, `document.title` and the
`aria-label` all agree. Note that the layout numbers in README were derived arithmetically across
sixteen viewport sizes rather than checked in a browser; if you have a browser, that is the gap
worth closing.

Files prefixed `_` are archived snapshots, not part of the site and not linked from it:
`_geared_odometer.html` (the earlier geared spin) and `_orig_baseline.html` (the pre-odometer map
page, untracked). Leave them alone unless asked.

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

## Degrading

The count has to survive script failure, a hostile face, a screen reader and a reduced-motion
setting, and each path is arranged rather than incidental:

- The markup ships the plain number (`479`) as a single flex item, positioned exactly where the
  odometer lands, so a script that never runs leaves the count readable. `tick()` returns early on a
  non-positive or `NaN` value, which leaves that text standing rather than replacing it with a
  wrong number.
- `#days` is `role="img"` with an `aria-label` the script keeps in step. Without it a reader
  announces the strips — `0123456789` twice per column. Don't remove the role to "fix" semantics.
- `prefers-reduced-motion: reduce` and any browser without `requestAnimationFrame` skip `spin()`
  entirely and get the wheels parked where they belong.
- `document.fonts.ready` re-measures the drum and re-parks; on this domain the Typekit isn't served
  and nothing comes of it, but on osbornforsenate.com it is the only pass that sees the real face.
- The clock is re-read by a 30s `setInterval` (which bounds how long an open page sits on
  yesterday's number) plus a `visibilitychange` handler, because a backgrounded tab has its timers
  throttled to a crawl.

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

**Never put the day count in anything static** — `<title>`, the descriptions, `assets/share.png` or
the favicon. The script rewrites `document.title` at load; everything static is written to stay true
without a number (the description sat at "459 days" for weeks). The `h1` is the sentence, not the
number — the count is a `div`, since a heading of `479` has no keywords and changes daily. The
canonical host `peterickettstownhall.com` is **inferred from the repo name** and appears in the head
plus `robots.txt` and `sitemap.xml`; confirm it before trusting it.

The `<title>` and every description lead with the question people actually type — "How many days has
it been since Pete Ricketts held a town hall?" A question ranks for the query and is still true
tomorrow, which an answer wouldn't be. That title is the only place the wording relaxes to plain
"town hall"; every sentence that makes the claim still says **in-person**. Keep it that way, and
don't reach for hidden copy or an `FAQPage` block to get more of the query onto the page — both need
the text to be visible to a reader, and this page has no such section.

The JSON-LD is an `@graph` of four nodes (`WebSite`, `WebPage`, `Person`, `Organization`) wired by
`@id`. `sameAs` on Ricketts — Wikidata `Q6106781`, Wikipedia, his Senate page — is the load-bearing
part; it's what identifies the entity rather than the string.

The favicon is a **static inline SVG clock** (red field, white ring, hands at 12 and 4), tuned to
read at 16px: ring stroke 6, hand stroke 5 on a 64 box, nothing else in the square. It is a data URI
rather than a file so the page still opens from `file://`. A previous pass painted the day count
into it from a canvas at load; that is gone, along with `paint()` and its `FAVICON` config — don't
put a number back on it.

## Footer

The mark plus `PAID FOR BY OSBORN FOR SENATE` and nothing else. The disclaimer is legally required
and stays regardless of what else changes. Three blocks from the parent site's footer were removed
deliberately and each has a condition for return: the Navy rank disclaimer (if Osborn's service
record ever appears here), the "checks can be mailed to" address (with any fundraising ask), and the
copyright line (only if counsel confirms the claim).
