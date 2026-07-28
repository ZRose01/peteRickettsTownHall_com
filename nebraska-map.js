/* Nebraska events map — three components.
 *
 * Requires Leaflet 1.x (CSS + JS) and nebraska-map.css to be loaded first.
 *
 * Component 1: the map. Standalone it shows details in Leaflet popups.
 *   var map = NebraskaMap.mount(document.getElementById('my-map'), {
 *     eventsUrl: 'events.json'   // optional, this is the default
 *   });
 *
 * Component 2: a details panel that renders into any DOM element.
 * Wire it to the map with onSelect — clicking a county then renders into
 * the panel instead of opening a popup:
 *   var details = NebraskaMap.mountDetails(document.getElementById('my-panel'));
 *   NebraskaMap.mount(document.getElementById('my-map'), {
 *     onSelect: details.render
 *   });
 *
 * Component 3: a tour-date list of every upcoming event, rendered
 * below the map (or anywhere else). Wire it in with onTour:
 *   var tour = NebraskaMap.mountTour(document.getElementById('my-tour'));
 *   NebraskaMap.mount(..., { onTour: tour.render });
 * It lists all future events, including the ones no county shows.
 * It can also stand alone with no map on the page, loading for itself —
 * and then it needs no Leaflet either:
 *   NebraskaMap.mountTour(el, { eventsUrl: '.../events.json' });
 *
 * The initial view is a fitBounds on the loaded county geometry, so the
 * data frames itself; call map.nmFit() to re-frame after resizing the
 * container.
 *
 * Counties that have hosted an event are shaded red and are the click
 * targets (pins are decorative). onSelect receives a county object
 * { name, fips, events: [...] }, so the host page can render however it
 * likes; mountDetails is the themed default renderer. events holds just
 * the county's featured event — its most recent past event, or the
 * soonest scheduled one where none has been held yet. The host page
 * controls sizes: give the containers explicit heights. Multiple
 * instances on one page are fine.
 */
var NebraskaMap = (function () {
  'use strict';

  // True Nebraska bounding box — the pan/zoom constraint.
  //
  // Built on first use rather than at load. mountTour renders a plain
  // list and needs no map, so a schedule-only embed should not have to
  // ship Leaflet at all; calling L here would make merely *loading* this
  // file throw without it. Every consumer is inside mount().
  var _nebraskaBounds = null;
  function nebraskaBounds() {
    return _nebraskaBounds || (_nebraskaBounds = L.latLngBounds(
      [39.999998, -104.053514],  // SW corner
      [43.001708, -95.308290]    // NE corner
    ));
  }

  var DEFAULTS = {
    eventsUrl: 'events.json',
    countiesUrl: 'counties.geojson',
    imageBase: '',   // prefix for events' optional "image" filename; events without one get a placeholder
    onSelect: null,  // function(county) — if set, county clicks call this instead of opening a popup
    // function(events) — called once after load with every future event
    // (not just the ones the map shows), sorted by date. mountTour's
    // render is the themed default.
    onTour: null,
    // Order for that list: "asc" = soonest first, "desc" = furthest out first.
    tourOrder: 'asc',
    // Initial view: fitBounds on the loaded county geometry, inset by
    // this many pixels. No hand-tuned framing offsets — the shape of
    // the data decides the view. 0 = state flush to the frame.
    fitPadding: 0,
    // Scale applied on top of the flush fit: 1 = state touching the
    // frame, 0.9 = 10% zoomed out for a little breathing room around
    // it. Also becomes the zoomed-out floor, so the initial view is as
    // far out as the map goes.
    fitScale: 0.9,
    // null = derive the floor from the framing zoom, so the whole state
    // is always the most zoomed-out view no matter the container size.
    minZoom: null,
    maxZoom: 18,
    // How hard the pan constraint resists dragging past the bounds:
    // 0 = no resistance, 1 = immovable.
    boundsViscosity: 0.8,
    // "light" (default) or "dark" — see the token block in the CSS.
    // Dark is for a host section with a dark background of its own.
    theme: 'light'
  };

  var PLACEHOLDER_IMG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="220" height="120">' +
    '<rect width="220" height="120" fill="#e2e2e2"/>' +
    '<text x="110" y="68" text-anchor="middle" font-family="sans-serif" font-size="13" ' +
    'letter-spacing="1.5" fill="#8a8a8a">PHOTO COMING</text>' +
    '</svg>'
  );

  function esc(s) {
    return String(s || '').replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  // Only ordinary web/mail/phone links survive; everything else — most
  // pointedly javascript: and data: — is dropped and the link text is
  // left as plain text. Whitelisting a prefix rather than blacklisting
  // one means obfuscated schemes fail closed.
  function safeHref(url) {
    var u = String(url == null ? '' : url).replace(/\s+/g, ' ').trim();
    if (/^(https?:\/\/|mailto:|tel:|\/|#)/i.test(u)) return u;
    // Bare domain ("o4s.org/events") — the common way staff will type it.
    if (/^[\w-]+(\.[\w-]+)+(\/|\?|$)/.test(u)) return 'https://' + u;
    return '';
  }

  // Descriptions are the one place staff-authored markup is honored, and
  // only <a href>: the text between tags is escaped exactly as before,
  // and each anchor is rebuilt from its href alone, so no other tag and
  // no other attribute (onclick, style, ...) can ride along. Links open
  // in a new tab because the embed is a block inside a host page.
  var ANCHOR_RE = /<a\b[^>]*?\bhref\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))[^>]*>|<\/a\s*>/gi;

  function richText(raw) {
    var text = String(raw == null ? '' : raw);
    var out = '', last = 0, open = 0, m;
    ANCHOR_RE.lastIndex = 0;
    while ((m = ANCHOR_RE.exec(text))) {
      out += esc(text.slice(last, m.index));
      last = ANCHOR_RE.lastIndex;
      if (m[0].charAt(1) === '/') {
        // A close tag with nothing open would leak out of the blurb.
        if (open) { out += '</a>'; open--; }
      } else {
        var href = safeHref(m[1] || m[2] || m[3]);
        if (href) {
          out += '<a href="' + esc(href) + '" target="_blank" rel="noopener noreferrer">';
          open++;
        }
      }
    }
    out += esc(text.slice(last));
    while (open--) out += '</a>';  // close whatever the author left open
    return out;
  }

  // What to call the event in a synthesized caption. A staff-set title
  // wins, so an "Omaha Rally" is named rather than called a generic
  // event; almost every record has no title and gets the generic word.
  // Returns escaped HTML, since that's what both callers are building.
  function eventKind(ev) {
    return ev.name ? esc(ev.name) : 'Event';
  }

  // Hand-written copy from the uploader wins; otherwise synthesize from
  // the structured fields so records predating descriptorText still read.
  function eventBlurb(ev) {
    if (ev.descriptorText) return richText(ev.descriptorText);
    var blurb = eventKind(ev);
    if (ev.venue) blurb += ' at ' + esc(ev.venue);
    if (ev.date) blurb += ' on ' + esc(ev.date);
    blurb += '.';
    // `attendance` is deliberately not synthesized into the caption. It
    // stays in events.json and stays editable in the uploader — a staff
    // blurb can still cite it via descriptorText, which wins outright
    // above; it just isn't asserted automatically.
    return blurb;
  }

  // Dates are M/D/YYYY from the CSV; null when missing or unparseable.
  // Normalized to local midnight so same-day comparisons against today
  // don't hinge on a time component the data doesn't carry.
  function eventDate(ev) {
    var d = ev.date ? new Date(ev.date) : null;
    if (!d || isNaN(d)) return null;
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function startOfToday() {
    var t = new Date();
    t.setHours(0, 0, 0, 0);
    return t;
  }

  // "Upcoming" = dated today or later.
  function isUpcoming(ev) {
    var d = eventDate(ev);
    return !!d && d >= startOfToday();
  }

  // The tour list's contents: every future event in the file, ordered.
  // Shared by the map's onTour hand-off and by a standalone mountTour
  // that loads its own data, so the two can't drift into different
  // filters or a different sort.
  function tourEvents(events, order) {
    var dir = order === 'asc' ? 1 : -1;
    return (events || []).filter(isUpcoming).sort(function (a, b) {
      return dir * (eventDate(a) - eventDate(b));
    });
  }

  // One event represents a county: the most recent event already
  // held there, or — for a county we haven't visited yet — the soonest
  // one scheduled. So a county that has both is represented by its past
  // event (and shades red), since the shading follows what's shown.
  // Undated records can't compete on either count and only surface when
  // a county has nothing else.
  function featuredEvent(events) {
    var past = null, pastTime = -Infinity;
    var next = null, nextTime = Infinity;
    var todayTime = startOfToday().getTime();

    events.forEach(function (ev) {
      var d = eventDate(ev);
      if (!d) return;
      var t = d.getTime();
      if (t >= todayTime) {
        if (t < nextTime) { next = ev; nextTime = t; }
      } else if (t > pastTime) {
        past = ev; pastTime = t;
      }
    });

    return past || next || events[0] || null;
  }

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
                'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  // "Aug 15, 2026". Spelled out from a table rather than
  // toLocaleDateString so every visitor sees the same string regardless
  // of browser locale.
  function tourDateText(d) {
    return MONTHS[d.getMonth()] + ' ' + d.getDate() + ', ' + d.getFullYear();
  }

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function isoDate(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  // The card blurb's synthesized form repeats the date, which doesn't
  // belong on a row that already leads with it.
  function tourBlurb(ev) {
    if (ev.descriptorText) return richText(ev.descriptorText);
    return ev.venue ? eventKind(ev) + ' at ' + esc(ev.venue) : eventKind(ev);
  }

  // One tour-date row: date, then City, County, Description. The place
  // name is the click target, linking to the event's Mobilize page so a
  // visitor can RSVP.
  //
  // Only the place name, not the whole row: the description may itself
  // contain staff-authored <a> from richText(), and an anchor wrapping
  // the row would nest them. Nested anchors are invalid, and browsers
  // recover by closing the outer one early, which would tear the row's
  // grid apart — a breakage that only appears once someone happens to
  // put a link in a description.
  //
  // Only imported records carry mobilizeUrl (the uploader's TEXT_FIELDS
  // can't set it), so a hand-added event keeps the identical row with
  // plain text rather than a dead link.
  function tourRow(ev) {
    var d = eventDate(ev);
    var where = [ev.city, ev.county ? ev.county + ' County' : null]
      .filter(Boolean).map(esc).join(', ');
    var href = safeHref(ev.mobilizeUrl);
    if (href && where) {
      where = '<a class="nm-tour-link" href="' + esc(href) + '"' +
        ' target="_blank" rel="noopener noreferrer">' + where + '</a>';
    }
    return '<li class="nm-tour-row' + (href ? ' nm-tour-row-linked' : '') + '">' +
      (d ? '<time class="nm-tour-date" datetime="' + isoDate(d) + '">' +
           esc(tourDateText(d)) + '</time>' : '<span class="nm-tour-date">TBA</span>') +
      '<span class="nm-tour-where">' + where + '</span>' +
      '<span class="nm-tour-desc">' + tourBlurb(ev) + '</span>' +
      '</li>';
  }

  function eventCard(ev) {
    var badge = isUpcoming(ev) ? ' <span class="poi-upcoming">Upcoming</span>' : '';
    var title = ev.name || ev.city;
    return '<div class="poi-event">' +
      '<h4 class="poi-subtitle">' + esc(title) + badge + '</h4>' +
      '<img class="poi-image" loading="lazy" decoding="async" src="' + esc(ev.imgSrc || PLACEHOLDER_IMG) + '" alt="' + esc(title) + '">' +
      '<p class="poi-blurb">' + eventBlurb(ev) + '</p>' +
      '</div>';
  }

  // County title + a card per event — shared by the popup and the panel.
  function countyHtml(county) {
    return '<h3 class="poi-title">' + esc(county.name) + ' County</h3>' +
      county.events.map(eventCard).join('');
  }

  function popupHtml(county) {
    return '<div class="poi-popup">' + countyHtml(county) + '</div>';
  }

  // County shading follows the one event the county shows (Leaflet paths
  // are styled via options, not CSS). The campaign palette is red,
  // maroon, gray and white with no second hue to spend, so the two
  // states are told apart by fill rather than by color: filled = a town
  // hall has been held there, outlined = booked but not yet held, flat
  // gray = nothing. That also survives being printed or photocopied,
  // which red-vs-yellow did not.
  // A white hairline, not a darker maroon: the fill is near-solid, so a
  // stroke in the same family disappears and a run of neighbouring
  // counties reads as one shape instead of several.
  var VISITED_STYLE = {
    color: '#ffffff',
    weight: 0.8,
    opacity: 0.65,
    fillColor: '#6a030f',
    fillOpacity: 0.85
  };
  var VISITED_HOVER_OPACITY = 1;

  // White fill, not transparent: an unfilled county has to read as
  // deliberately empty against the gray ones, not as a hole.
  var UPCOMING_STYLE = {
    color: '#b81f2e',
    weight: 2.5,
    fillColor: '#ffffff',
    fillOpacity: 1
  };
  // Hovering tints the fill toward the accent instead of deepening it,
  // since this one is already at full opacity.
  var UPCOMING_HOVER_FILL = '#f7dade';

  var UNVISITED_STYLE = {
    color: '#c9c9c9',
    weight: 0.75,
    fillColor: '#e2e2e2',
    fillOpacity: 1
  };

  // The click target's outline, merged over whichever state style the
  // county already has, so selection reads on held, upcoming and
  // hovered counties alike. Black is deliberately outside the palette:
  // the brand is a single hue, so a maroon or accent outline would look
  // like a third *data* state ("held", "upcoming", "...selected?")
  // rather than like a cursor. It also stays legible on all three
  // fills, and the map keeps a white plate in both themes, so it needs
  // no dark-theme counterpart.
  var SELECTED_STYLE = {
    color: '#000000',
    weight: 3,
    opacity: 1
  };

  // "dark" swaps the component onto the dark token set, for a host
  // section whose own background is dark — anything else leaves the
  // default light tokens in place.
  function applyTheme(container, options) {
    container.classList.toggle(
      'nm-theme-dark', !!options && options.theme === 'dark'
    );
  }

  function mount(container, options) {
    var opts = Object.assign({}, DEFAULTS, options || {});
    container.classList.add('nebraska-map');
    applyTheme(container, opts);

    var map = L.map(container, {
      maxBoundsViscosity: opts.boundsViscosity,
      minZoom: opts.minZoom || undefined,
      maxZoom: opts.maxZoom,
      // 0 = no zoom quantization, so fitBounds frames the state exactly
      // instead of rounding down to the next step and leaving up to 19%
      // slack inside the frame. zoomDelta still governs wheel/buttons.
      zoomSnap: 0,
      zoomDelta: 0.5
    });

    // Leaflet 1.9's default attribution prefix carries an inline Ukraine
    // flag SVG. It's replaced with a plain text credit here: a campaign
    // site can't carry an unrelated political flag it didn't choose to
    // put there. The Census credit on the county layer is untouched, and
    // Leaflet is BSD-2-Clause, which asks for the notice in source and
    // not in the UI, so the text link is courtesy rather than obligation.
    //
    // Side effect worth knowing: the flag was three <path>s living in the
    // attribution bar, so `#nm-map path` used to yield 96 for Nebraska's
    // 93 counties. It now yields 93.
    map.attributionControl.setPrefix(
      '<a href="https://leafletjs.com" title="A JavaScript library for interactive maps">Leaflet</a>'
    );

    // Provisional view so controls and layers have something to attach
    // to; replaced by fitBounds on the real geometry once it loads.
    map.fitBounds(nebraskaBounds());

    // Pan constraint: nebraskaBounds() padded by half the viewport at the
    // current zoom, so every point in the box can be brought to the exact
    // center of the screen. Recomputed whenever zoom or viewport changes.
    function updateMaxBounds() {
      var zoom = map.getZoom();
      var half = map.getSize().divideBy(2);
      var swPx = map.project(nebraskaBounds().getSouthWest(), zoom);
      var nePx = map.project(nebraskaBounds().getNorthEast(), zoom);
      // pixel y grows southward, so pad y downward at SW and upward at NE
      var sw = map.unproject(swPx.add([-half.x, half.y]), zoom);
      var ne = map.unproject(nePx.add([half.x, -half.y]), zoom);
      map.setMaxBounds(L.latLngBounds(sw, ne));
    }
    map.on('zoomend resize', updateMaxBounds);
    updateMaxBounds();

    // No basemap: the county polygons alone are the map.
    // Counties + events (events.json is edited and published by
    // uploader/, not generated — see CLAUDE.md "Data pipeline").
    // Counties with events are shaded and clickable.
    Promise.all([
      fetch(opts.countiesUrl).then(function (r) { return r.json(); }),
      fetch(opts.eventsUrl).then(function (r) { return r.json(); })
    ]).then(function (results) {
      var counties = results[0];
      var allByFips = {};
      var eventsByFips = {};

      results[1].forEach(function (ev) {
        (allByFips[ev.countyFips] = allByFips[ev.countyFips] || []).push(ev);
      });

      // Only the county's featured event is carried into the map — one
      // card per county, never a stack of every visit. Kept as a
      // one-element array so the popup/panel renderers stay unchanged.
      Object.keys(allByFips).forEach(function (fips) {
        var ev = featuredEvent(allByFips[fips]);
        if (!ev) return;
        if (ev.image) ev.imgSrc = opts.imageBase + ev.image;
        eventsByFips[fips] = [ev];
      });

      // Tour dates: every future event in the file, including the ones
      // no county shows — a county already visited is represented by its
      // past event, so without this its next one appears nowhere.
      if (opts.onTour) {
        opts.onTour(tourEvents(results[1], opts.tourOrder));
      }

      var unvisitedLayer = L.geoJSON(counties, {
        filter: function (f) { return !eventsByFips[f.properties.GEOID]; },
        style: UNVISITED_STYLE,
        interactive: false,
        attribution: 'County boundaries: U.S. Census Bureau'
      }).addTo(map);

      // Yellow tracks the featured event, so a county turns red the day
      // after its first event — even with another already booked.
      function showsUpcoming(fips) {
        return (eventsByFips[fips] || []).some(isUpcoming);
      }

      // Selection lives in the style function rather than in a setStyle
      // call, so resetStyle — which mouseout leans on to undo the hover
      // tint — rebuilds the outline instead of wiping it.
      var selectedFips = null;
      var layersByFips = {};

      function styleFor(fips) {
        var base = showsUpcoming(fips) ? UPCOMING_STYLE : VISITED_STYLE;
        return fips === selectedFips
          ? Object.assign({}, base, SELECTED_STYLE)
          : base;
      }

      function selectCounty(fips) {
        var prev = selectedFips;
        if (prev === fips) return;
        selectedFips = fips;
        // Restyle the outgoing county before the incoming one, so a
        // repaint can never show two outlines at once.
        if (prev && layersByFips[prev]) visitedLayer.resetStyle(layersByFips[prev]);
        if (fips && layersByFips[fips]) {
          visitedLayer.resetStyle(layersByFips[fips]);
          // Shared borders are drawn twice, once by each neighbour, and
          // paint order decides which wins. Without this the outline is
          // half-erased by whichever county was drawn later.
          layersByFips[fips].bringToFront();
        }
      }

      var visitedLayer = L.geoJSON(counties, {
        filter: function (f) { return !!eventsByFips[f.properties.GEOID]; },
        style: function (f) { return styleFor(f.properties.GEOID); },
        onEachFeature: function (feature, layer) {
          var fips = feature.properties.GEOID;
          layersByFips[fips] = layer;
          var county = {
            name: feature.properties.BASENAME,
            fips: fips,
            events: eventsByFips[fips]
          };
          // Held counties deepen; upcoming ones are already fully opaque
          // white, so they tint toward the accent instead.
          var hoverStyle = showsUpcoming(fips)
            ? { fillColor: UPCOMING_HOVER_FILL }
            : { fillOpacity: VISITED_HOVER_OPACITY };
          layer.on('mouseover', function () { layer.setStyle(hoverStyle); });
          layer.on('mouseout', function () { visitedLayer.resetStyle(layer); });
          layer.on('click', function () { selectCounty(fips); });
          if (opts.onSelect) {
            layer.on('click', function () { opts.onSelect(county); });
          } else {
            layer.bindPopup(popupHtml(county));
            // In popup mode dismissing the popup is the deselect, or the
            // outline outlives the thing it was pointing at.
            layer.on('popupclose', function () { selectCounty(null); });
          }
        }
      }).addTo(map);

      // Frame the actual geometry rather than a hand-tuned box: one
      // feature group over both county layers, fitted to its bounds.
      // Exposed as map.nmFit so a host page can re-frame after it
      // changes the container's shape.
      var geometry = L.featureGroup([unvisitedLayer, visitedLayer]);
      var geometryBounds = geometry.getBounds();
      map.nmBounds = geometryBounds;

      // Zoom that frames the state in the current container, backed off
      // by fitScale. Math.log/LN2 rather than Math.log2 to stay with
      // the ES5 baseline the rest of this file uses.
      function framingZoom() {
        var flush = map.getBoundsZoom(
          geometryBounds, false, L.point(opts.fitPadding, opts.fitPadding)
        );
        return flush + Math.log(opts.fitScale) / Math.LN2;
      }

      // The zoomed-out floor is the framing view itself, which depends
      // on the container size — a fixed floor would crop the state in a
      // small container and allow zooming past it in a large one. This
      // only moves the view when the old floor is no longer reachable.
      function updateMinZoom() {
        if (opts.minZoom) return;
        map.setMinZoom(framingZoom());
      }

      map.nmFit = function () {
        // setView rather than fitBounds, since fitBounds would undo the
        // fitScale back-off by refitting flush to the frame. Never
        // animated: this runs on load and on container reshapes, where
        // a zoom animation is just a lurch on arrival.
        updateMinZoom();
        map.setView(geometryBounds.getCenter(), framingZoom(), { animate: false });
      };

      map.on('resize', updateMinZoom);
      map.nmFit();

      // Tiny legend so the colors explain themselves.
      var legend = L.control({ position: 'bottomleft' });
      legend.onAdd = function () {
        var div = L.DomUtil.create('div', 'nm-legend');
        div.innerHTML =
          '<span class="nm-swatch nm-swatch-held"></span>Event held' +
          '<span class="nm-swatch nm-swatch-upcoming"></span>Upcoming';
        return div;
      };
      legend.addTo(map);
    });

    return map;
  }

  // Details panel: renders the selected event into any host-page element.
  // Returns { render(event), clear() }; pass render as the map's onSelect.
  function mountDetails(container, options) {
    container.classList.add('nebraska-map-details');
    applyTheme(container, options);

    function clear() {
      container.innerHTML =
        '<p class="details-empty">Click a shaded county to see its events.</p>';
    }

    function render(county) {
      container.innerHTML = '<div class="details-card">' + countyHtml(county) + '</div>';
    }

    clear();
    return { render: render, clear: clear };
  }

  // Tour-date list: every upcoming event, one row each. Returns
  // { render(events), clear() }; pass render as the map's onTour.
  function mountTour(container, options) {
    var opts = Object.assign({
      title: 'Upcoming events',
      // Unset by default: the map feeds the list through onTour. Set it
      // to load standalone, with no map on the page at all.
      eventsUrl: null,
      tourOrder: 'asc'
    }, options || {});
    container.classList.add('nebraska-map-tour');
    applyTheme(container, opts);

    function heading() {
      return opts.title ? '<h3 class="poi-title">' + esc(opts.title) + '</h3>' : '';
    }

    function clear() {
      container.innerHTML = heading() +
        '<p class="nm-tour-empty">No upcoming events scheduled.</p>';
    }

    function render(events) {
      if (!events || !events.length) return clear();
      container.innerHTML = heading() +
        '<ol class="nm-tour-list">' + events.map(tourRow).join('') + '</ol>';
    }

    clear();

    // Standalone mode. Normally the map loads events.json and hands the
    // list over via onTour, but a schedule dropped on its own has no map
    // to feed it — so given an eventsUrl it fetches for itself. The
    // filtering and ordering go through the same tourEvents() the map
    // uses, so a lone list and a list beside a map always agree.
    if (opts.eventsUrl) {
      fetch(opts.eventsUrl)
        .then(function (r) { return r.json(); })
        .then(function (events) { render(tourEvents(events, opts.tourOrder)); })
        // Leave the empty-state copy in place rather than a broken list.
        .catch(function (err) {
          clear();
          if (window.console) console.error('NebraskaMap tour load failed:', err);
        });
    }

    return { render: render, clear: clear };
  }

  return { mount: mount, mountDetails: mountDetails, mountTour: mountTour };
})();
