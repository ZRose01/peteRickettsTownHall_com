# peteRickettsTownHall.com

A one-page site counting the days since Sen. Pete Ricketts last held an
in-person town hall in Nebraska, on a rolling odometer.

The page is the count and nothing else. It used to carry a deliberately empty
county map of Nebraska underneath — every county in the "no event here" gray,
which was the argument — and that has been cut. The vendored map component
(`nebraska-map.js` / `nebraska-map.css`) and its two JSON assets are still in
the repo but nothing references them; if the map isn't coming back they can go,
and `git log` has the markup, the styles and the reasoning behind both.

`_geared_odometer.html` is an archived earlier design: the spin as a gear train,
with each column geared to the one on its right at 10:1:0.1 and the whole
display winding up from 000. It was replaced by the slot machine below, and is
kept because it was never otherwise committed.

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

## The odometer

The count is drawn as a rolling odometer: one clipped window per digit, each
holding a strip of faces that is translated to bring the right one into view.

**Every wheel rests squarely on a whole face.** The count is a whole number of
days and it is shown as one — no wheel sits half-turned between two digits.
`offsetFor()` is therefore just `REST + digit`, and the strip is two full turns
of 0-9: the rest position lives in the second turn, leaving a turn of runway
above it for the spin to come in through, and nothing ever reaches past it (the
highest offset is `REST + 9`).

Because of that, the wheels only move at two moments: the spin on load, and the
carry if a page is left open past midnight. The ticker runs every 30 seconds,
which is what bounds how long an open page can sit on yesterday's number; at the
carry the digit *snaps* rather than rolling, on the reasoning that nobody is
watching the page at midnight. If that ever matters, `spin()` shows how to ease
a column instead of cutting it.

### The spin-in is a slot machine

Every column spins on its own at the same flat speed and they drop out **one at
a time from the left**: a column keeps spinning until the one to its left has
landed. Nothing is geared to anything, no column knows what the others read, and
there is no count being animated — the only thing passing between columns is
when they are allowed to stop. Each starts from a random position, so no two
loads are alike and the columns don't flick over in step with each other.

Four constants, all just above `spin()`:

| | |
|---|---|
| `REEL_RATE` | faces a second while spinning (80 — eight revolutions a second) |
| `FIRST_STOP` | 0.8s before the leftmost column starts to land |
| `LAND_SECONDS` | 0.7s for a column to come to rest once it starts |
| `HOLD` | 0.15s beat between one column landing and the next braking |

Total is about `FIRST_STOP + columns x (LAND_SECONDS + HOLD)`, so ~3.3s at three
digits. **`HOLD` is the knob for overall length** — it is pure dead time and
changes nothing about how a column behaves. `LAND_SECONDS` changes the character
of the stop, not just its duration.

How a column lands dead on its digit is the one piece worth knowing. The braking
distance is fixed the moment you choose a speed and a braking time
(`REEL_RATE x LAND_SECONDS / 3`, the third because it eases out), so rather than
fudge the landing to make it come out right, the column simply **keeps spinning**
until it reaches a point exactly that distance short of its digit. That is under
one extra revolution — 0.125s at the current rate, invisible on a blurred column
— and it buys two things: the brake starts at exactly the speed the column was
already going, so there is no lurch, and the column still stops precisely on its
face. It is also why total duration varies a little between reloads now that the
starting positions are random.

**The drum is measured, not assumed.** Every face in the stack puts its digits
at a different height in the em box — Oswald's baseline sits a tenth of an em
below Arial Narrow's — far enough apart that a drum cut close to one of them
clips another. The face the live site uses comes from a Typekit on a domain this
page can't be tested from, so a hidden probe reports the ink of a "0" and the
baseline the browser really gave it, and the pitch and window follow from those.
The ink is kept as its reach above and below **the baseline**, never as offsets
from the cell's top edge: those carry the probe's line height with them, and the
probe is laid out before `--odo-pitch` exists, so it measures a 1em line box
while the cells it stands in for get a pitch-tall one. Deriving anything from
that lands the digits high by half the difference — past the clearance the
gutter gives, so they clip. Measured this way the answer is line-height
independent, the first paint is already right, and the re-measure after
`document.fonts.ready` changes nothing unless the face genuinely changed.

Everything is in `em`, so it holds at every size the `clamp()` lands on and a
resize needs nothing. Two things are load-bearing around it:

- **The eyebrow and the word DAYS are painted, not merely coloured.** A window
  has to be a full face-pitch tall to hold any face in the stack, but the
  heading only gives the number `0.82em`, so a face on its way past reaches
  beyond the window at each end and the incoming digit crossed the top of DAYS.
  Painting the two neighbours opaquely over it makes the aperture the gap
  between them, and a digit leaving it slides out of sight behind the housing.
- **`.count` is `display: flow-root`.** That's what keeps the odometer's
  negative top margin *inside* the heading. Without it the margin collapses
  through the `h1` — the number lands in the right place either way, but by
  dragging the whole heading up rather than by sitting where it says it sits.

The markup ships the plain number as a single flex item, which the centering and
height place exactly where the odometer will land, so a failed script leaves the
count readable. `role="img"` plus a label keeps a screen reader out of the wheels
— the strips hold `0123456789` twice over per column, which is what a reader
would otherwise hear instead of the count. The spin is decoration, so
`prefers-reduced-motion` — and any browser without `requestAnimationFrame` —
simply gets the wheels where they belong.

## Running it

`index.html` is now the whole site — one file, no stylesheet links, no external
scripts, no `fetch()`. Opening it from `file://` works. It used to need serving
because the map fetched its JSON, so if you have that habit, this still does the
job and is worth using for anything cache- or header-related:

```bash
python3 -m http.server 8125
```

## Layout

**The count fills the window and the attribution starts below it.** `main` is
`min-height: 100dvh` and centres the hero, so the first screen is the number and
nothing else; you scroll to reach the footer. `dvh` ahead of `vh` matters on
mobile — `100vh` is the viewport with the URL bar *retracted*, so a block sized
to it stands taller than the window it is in.

`overflow-x` is hidden and the vertical is not: there is nothing to either side
to reach, but clipping the vertical would put the attribution out of reach.

**The type is sized off height, not width.** `.count` is
`clamp(3rem, min(44vh, ...), 30rem)` — the number and the word beneath it come to
about 1.45x the font size, so 44vh spends roughly two thirds of the window on
them and the fold lands 92-98% full at most desktop shapes.

The `vw` term in there is *not* a design constraint, it is the guard against the
number running off the side, and it only engages on shapes far wider or narrower
than they are tall. A digit of a condensed face is about half its own size
across, so the cap is `88vw / (--digits x 0.5)` and **the script sets `--digits`
from the column count** — the day the count reaches four figures the guard
tightens by itself instead of someone having to catch it.

Two known edges: at around 1024x420 (a landscape phone) the `clamp()` floors bind
and the fold computes ~4% taller than the window, so it scrolls a few pixels
early — deliberately not chased, since the only lever left is those floors and
they are what keeps the supporting type readable on a 320px phone. And the
layout numbers were derived arithmetically across sixteen viewport sizes rather
than checked in a browser.

Other notes:

- The content column is `min(1200px, 92vw)`, tightening to `88vw` below 749px —
  osbornforsenate.com's own column, so the page sits at the same measure as the
  campaign site.
- Fonts are the O4S brand faces, resolved through Typekit **only on
  osbornforsenate.com** — the kit is domain-locked. Everywhere else, including
  this site as served from GitHub, the fallback stacks render instead.

## SEO and sharing

**Nothing static carries the day count.** The script owns the clock and rewrites
`document.title` on load, but the `<title>`, both descriptions, the favicon and
the share image are what a crawler stores and what every link preview shows, and
a number baked into any of them is wrong by the next morning — the description
read "459 days" for weeks while the count was past 470. All of it is written to
stay true instead: the anchor date doesn't move, and neither does the question.

**The question is the phrasing people type.** "How many days has it been since
Pete Ricketts held a town hall?" is the `<title>`, and it opens the meta,
`og:` and `twitter:` descriptions and both JSON-LD descriptions. It ranks for
the query and stays true indefinitely, because it is a question rather than an
answer — the answer is the first thing on the page, computed at load. It is the
one place the wording relaxes to plain "town hall"; every sentence that makes
the claim still says **in-person**, because Ricketts has held tele-town halls
since. The two `image:alt` strings keep the older "how long since" phrasing, so
the other way of asking is covered too.

There is deliberately **no hidden copy and no `FAQPage` block**. Both are the
obvious way to work more of the query onto a 25-word page and both are against
Google's guidelines when the text isn't visible — FAQ structured data has to
match Q&A a visitor can actually see, and text a crawler reads but a reader
can't is cloaking. The metadata above is the honest version of the same move.

- **`assets/share.png`** (1200x630) is the `og:image`, with
  `twitter:card=summary_large_image` so a shared link renders as a full-width
  card. Deliberately evergreen — no number on it, because a social scraper
  caches an image far longer than a day. It was generated with Pillow from
  Liberation Sans Narrow as a stand-in; worth redoing with the real faces.
- **The `h1` is the sentence, not the number.** The count is a `div`. A heading
  reading `479` carries no keywords and changes daily. Both are styled by class,
  so nothing about the design moved.
- **The favicon is a clock**, inline as an SVG data URI rather than a file, so
  the page still opens from `file://` with nothing beside it and the browser
  never reaches for a `/favicon.ico` that isn't there. Red field, white ring and
  two hands at 12 and 4, drawn to survive being taken down to 16 pixels: on the
  64-unit box the ring is a 6 stroke and the hands a 5, and there is nothing
  else in the square. The hands are the lighter stroke on purpose — at the ring's
  weight the wedge between them closes and the dial reads as a blob. An earlier
  pass drew the day count into a canvas here at load instead; it was cut for the
  clock, and the reason it had to be painted rather than shipped is the rule
  above — a favicon is cached harder than anything else on the page.
- `rel=canonical`, `og:url`, `og:site_name`/`locale`, image dimensions and alt,
  `robots` with `max-image-preview:large`, and `theme-color`.
- **JSON-LD as an `@graph` of four nodes** — `WebSite`, `WebPage`, the `Person`
  and the publisher `Organization` — each with an `@id` and referred to by it
  afterwards, rather than one deeply nested `WebSite`. The site and the page are
  different things and a search result points at the page, so both are named.
  The part that earns its keep is `sameAs` on Ricketts: "Pete Ricketts" alone is
  a string, while the Wikidata item (`Q6106781`, checked against the Wikipedia
  article's own wikibase link), the Wikipedia article and the Senate office page
  are what say *which* entity the page is about — the difference between ranking
  for the senator and ranking for a surname.
- `robots.txt` and `sitemap.xml` sit beside `index.html`.

**The canonical host is `peterickettstownhall.com`**, inferred from the repo
name. It appears throughout the head plus both of those files — if the
production host differs, all of them are wrong, and a bad canonical is worse
than none.

The real ceiling on how this ranks is that the page is about 25 words. No amount
of metadata fixes that; below-fold copy would (what a town hall is, the
tele-town hall distinction, the Scottsbluff date with a source), and it needs
sourcing and sign-off rather than invention.

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
