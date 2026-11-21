(() => {
    'use strict';

    /* ================================================================
       ALBUM DATA
       One entry per album, keyed by the album's id in index.html without the "album-" part
       (id="album-the" -> the). Every album gets a menu made of its tabs.
         tabs     menu options, in order. Add 'listen' where you want the LISTEN option; if it is not
                  in the array there is no LISTEN option at all
         editions platform -> list of editions. The platform name is the LISTEN category title
                  (YOUTUBE, SOUNDCLOUD...), its icon is icon/<platform>.png (skipped if missing).
                  An edition card shows <album>/<cover>.png (cover = optional id of a custom cover image),
                  falling back to covers/<album>.png when there is no cover or the file is missing
                  (png, then jpg, then jpeg for each),
                  plus the name, and opens the link.
                  Platforms with no editions are not shown.
    ================================================================ */
    const ALBUMS = {
        the: {
            tabs: ['context', 'samples', 'cover', 'listen'],
            editions: {
                youtube: [
                    {
                        cover: '2023',
                        name: 'October 2023 (instrumental)',
                        link: 'https://youtube.com/watch?v=95Vt00onysI&list=PLJrzrdM2WSXKXzhorP7A3yFC8lXLPzHgE',
                    },
                ],
                soundcloud: [
                    {
                        cover: '2022',
                        name: '2022 (instrumental)',
                        link: 'https://soundcloud.com/nickjas/sets/thecowthatjumpedoverthemoonandkilledtherat',
                    },
                ],
            },
        },
        interlude: {
            tabs: ['cover', 'listen'],
            editions: {
                youtube: [
                    {
                        cover: 'pre',
                        name: 'Pre-Release',
                        link: 'https://youtube.com/watch?v=jyHPsgV9p6w&list=PLJrzrdM2WSXJ7EXILNpxLMrXTTR95toSh',
                    },
                ],
                soundcloud: [],
            },
        },
        indev: {
            tabs: ['cover', 'listen'],
            editions: {
                youtube: [
                    {
                        cover: 'original',
                        name: 'Original Release',
                        link: 'https://youtube.com/watch?v=JaP1nz73gEE&list=PLEWeFT0ctV_Y',
                    },
                ],
                soundcloud: [],
            },
        },
    };


    // Icons built into the script (no file needed). These win over icon/<platform>.png / .svg.
    // youtube: YouTube full-color icon (2017), by Jarould, public domain, via Wikimedia Commons
    //          https://commons.wikimedia.org/wiki/File:YouTube_full-color_icon_(2017).svg
    const BUILTIN_ICONS = {
        youtube: 'data:image/svg+xml,' + encodeURIComponent(
            '<svg xmlns="http://www.w3.org/2000/svg" width="71.412" height="50" viewBox="0 0 71.412065 50">' +
            '<path fill="#f00" d="M69.912 7.822A8.968 8.968 0 0 0 63.58 1.49C58.026 0 35.706 0 35.706 0S13.386 0 7.832 1.49a8.968 8.968 0 0 0-6.333 6.333C0 13.38 0 25 0 25s0 11.62 1.5 17.178a8.968 8.968 0 0 0 6.332 6.332C13.386 50 35.706 50 35.706 50s22.32 0 27.874-1.49a8.968 8.968 0 0 0 6.332-6.332c1.5-5.558 1.5-17.178 1.5-17.178s0-11.62-1.5-17.178z"/>' +
            '<path fill="#fff" d="M28.564 35.706 47.09 25 28.564 14.294z"/></svg>'
        ),
    };

    // where the LISTEN page looks for its images (relative to index.html)
    const PATHS = {
        editionCover: (album, cover, ext) => `${album}/${cover}.${ext}`,
        albumCover: (album, ext) => `covers/${album}.${ext}`,         // used when an edition has no (working) custom cover
        platformIcon: (platform, ext) => `icon/${platform}.${ext}`,
        page: (album, tab) => `${album}/${tab}.html`,                 // every tab except cover + listen: fetched and shown in an iframe
        coverExts: ['png', 'jpg', 'jpeg'],                            // tried in this order
        iconExts: ['png', 'svg', 'jpg', 'jpeg'],
    };

    // Point an <img> at the first of these urls that loads. Returns nothing; onFail runs if none does.
    function loadFirst(img, urls, onFail) {
        let i = 0;
        img.onerror = () => {
            if (++i < urls.length) img.src = urls[i];
            else if (onFail) onFail();
        };
        img.src = urls[0];
    }

    /* ================================================================
       CONFIG: everything you'll want to tweak lives here
    ================================================================ */

    // Page smooth scroll (Lenis). Lower lerp = floatier/slower.
    // Lower wheelMultiplier = heavier scrolling (0.5 = half the distance per wheel tick).
    const LENIS = {
        lerp: 0.1,
        wheelMultiplier: 0.5,
        smoothWheel: true,
    };

    // Album lists (horizontal Lenis instances + < > buttons)
    const CAROUSEL = {
        lerp: 0.1,
        syncTouch: false,
    };

    // Cursor circle. Radii are in px.
    const CURSOR = {
        radius: 8,         // normal
        hoverRadius: 16,    // over something clickable
        pressRadius: 12,     // while mouse button is held (smaller than normal)
        thickness: 2,       // ring outline thickness in px
        debugScale: 4,      // holding ALT + SHIFT: the cursor fills in and grows to this many times hoverRadius (to see what the filter does)
        lerp: {
            multiplierPlus: 18,   // speed when growing  (per second)
            multiplierMinus: 18,  // speed when shrinking (per second)
            minDistance: 0.05,    // stop updating when this close to the target
            maxSpeed: 600,        // max change per second (px/s)
        },
    };

    // COVER page (zoom + drag viewer). Zoom 1 = 100% = one image pixel per DEVICE pixel.
    // The slider runs from "fit to screen" (far left) to maxZoom (far right).
    const COVER = {
        maxZoom: 3,
        wheelStep: 1 / 12,    // slider travel per ctrl + wheel notch and per ctrl + / ctrl -
        zoomSpeed: 15,        // how fast zoom eases towards its target (per second, higher = snappier)
        panSpeed: 15,         // same for scrolling around the image
        // glide after letting go of a drag (image and zoom box)
        flickWindow: 0.1,     // seconds of drag history averaged to get the release velocity
        glideFriction: 2.5,   // "air resistance": speed multiplies by e^(-friction * seconds). Higher = stops sooner. 2.0 is about a phone's scroll
        boxFriction: 5.0,     // same, for the zoom box
        glideMin: 8,          // px/s: below this the glide is over (also: slower than this at release = no glide)
        glideMax: 250000,       // px/s: cap on the release velocity (also the top speed the arrow keys can build up)
        arrowSpeed: 2500,     // holding an arrow key adds arrowSpeed * seconds to the image's glide velocity every frame (px/s per second),
                              // so the longer you hold it the faster it goes. Friction slows it, so top speed is about arrowSpeed / glideFriction
        // zoom box: pull towards a nearby wall while it glides
        wallZone: 0.075,        // base distance of the "near a wall" zone, as a fraction of the screen: left / right / centre use the
                              // screen WIDTH, top / bottom use the screen HEIGHT. Measured from the box's edge closest to that wall
        wallZoneLR: 1,        // multiplier on wallZone for the left and right walls
        wallZoneTB: 1,        // multiplier on wallZone for the top and bottom walls
        wallPull: 4,          // pull at the wall itself, px per frame (at 60fps). It falls off linearly: wallPull at 0 distance, 0 at wallZone
        wallMaxSpeed: 1000,    // px/s: the pull only works while the box's glide speed (x and y combined) is below this
        wallTaper: 0.1,       // fraction of wallMaxSpeed where the pull starts fading: at or below it the pull is full (x1),
                              // at wallMaxSpeed it is 0 (x0), linear in between (0.5: 75% of the max speed = x0.5)
        // zoom box: pull towards the horizontal centre line of the screen while it glides
        centerZone: 0.5,      // multiplier on wallZone (of the screen width) for the centre line zone
        centerPull: 2,        // pull at the centre line itself, px per frame (at 60fps), falls off linearly to 0 at the zone's edge
        centerMaxSpeed: 400,  // px/s: the centre pull only works while the glide speed is below this
        centerTaper: 0.1,     // same idea as wallTaper, for the centre pull
    };

    // Album box background fade. 0 = transparent at rest, 0.05 = 5% white on hover.
    const CARD_FADE = {
        base: 0,              // resting alpha
        alpha: 0.05,          // hovered alpha
        lerp: {
            multiplierPlus: 12,
            multiplierMinus: 8,
            minDistance: 0.0005,
            maxSpeed: 0.5,        // alpha units per second
        },
    };

    // Link underline fade. alpha 1 = fully visible underline.
    const LINK_FADE = {
        alpha: 1,
        lerp: {
            multiplierPlus: 14,
            multiplierMinus: 10,
            minDistance: 0.002,
            maxSpeed: 10,         // alpha units per second
        },
    };

    // Menu button (top right). The menu icon morphs into the X when the menu popup opens, and back.
    const ICON = {
        morphMs: 500,                 // menu <-> X. Keep equal to the menu popup fade (0.5s in style.css)
        ease: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),   // ease in-out cubic
        barOffset: 9,                 // menu icon: top / bottom bar distance from the middle bar (was 12.7, lower = closer)
        hoverShift: 3.5,              // menu hover: top bar up / bottom bar down by this much (icon units, the icon is 67.7 wide)
        hoverLerp: {                  // how fast that hover shift eases in/out (0..1)
            multiplierPlus: 12,
            multiplierMinus: 12,
            minDistance: 0.001,
            maxSpeed: 8,
        },
    };

    /* ================================================================
       LERP: JS port of ULebbexFunctionsBPLibrary::UpdateLerpSmoothExcluded
       Returns { value, moved }  (value = "New", moved = "Moved")
    ================================================================ */
    const clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

    function updateLerpSmoothExcluded(desired, current, multiplierPlus, multiplierMinus, deltaTime, minDistance, maxSpeed) {
        if (Math.abs(desired - current) < minDistance) {
            return { value: current, moved: false };
        }
        const multiplier = (current < desired ? multiplierPlus : multiplierMinus) * deltaTime;
        const maxSpeedClean = maxSpeed * deltaTime;
        const lerped = current + (desired - current) * clamp(multiplier, 0, 1);
        return {
            value: clamp(lerped, current - maxSpeedClean, current + maxSpeedClean),
            moved: true,
        };
    }

    const stepWith = (cfg, desired, current, dt) =>
        updateLerpSmoothExcluded(desired, current, cfg.multiplierPlus, cfg.multiplierMinus, dt, cfg.minDistance, cfg.maxSpeed);

    /* ================================================================
       NO NATIVE DRAG GHOSTS
       Only stops the browser from picking up links / images / buttons
       and carrying them with the cursor. Dragging anywhere else
       (selecting text, touch scrolling, etc.) is untouched.
    ================================================================ */
    document.addEventListener('dragstart', (e) => {
        if (e.target instanceof Element && e.target.closest('a, img, button')) {
            e.preventDefault();
        }
    });

    /* ================================================================
       LENIS (page)
    ================================================================ */
    let lenis = null;
    let pageLenis = null;      // smooth scroll of the page popup (only while the LISTEN page is shown)
    let coverView = null;      // the COVER page's zoom/drag viewer ({ tick, destroy }) while it is shown
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (window.Lenis && !reduceMotion) {
        lenis = new Lenis(LENIS);
    }
    window.SITE = { LENIS, reduceMotion };      // read by page.js inside the album pages (context, samples...)

    /* ================================================================
       CURSOR STATE
    ================================================================ */
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const cursorEl = document.getElementById('cursor');

    cursorEl.style.setProperty('--ring', CURSOR.thickness + 'px');

    let mouseX = -9999, mouseY = -9999;
    let radius = CURSOR.radius;
    let pressed = false;
    let visible = false;
    let hovered = null;       // the clickable element under the cursor
    let hoverDirty = false;   // re-check what's under the cursor on the next frame
    let debugFill = false;    // ALT + SHIFT held: filled, big cursor (debug)

    function renderCursor() {
        const r = Math.max(radius, CURSOR.thickness);
        cursorEl.style.width = cursorEl.style.height = (r * 2) + 'px';
        cursorEl.style.transform = `translate3d(${mouseX - r}px, ${mouseY - r}px, 0)`;
    }

    function setVisible(v) {
        visible = v;
        cursorEl.classList.toggle('on', v);
    }

    function updateHover() {
        let el = document.elementFromPoint(mouseX, mouseY);
        // over a page iframe (context, samples...): look at what is under the cursor inside it
        if (el && el.tagName === 'IFRAME') {
            try {
                const r = el.getBoundingClientRect();
                el = el.contentDocument.elementFromPoint(mouseX - r.left, mouseY - r.top);
            } catch (err) { el = null; }
        }
        hovered = el ? el.closest('a, button, [data-clickable]') : null;
    }

    if (finePointer) {
        renderCursor();

        // ALT + SHIFT together = debug cursor. Read from the modifier state every key / move event, and cleared on blur
        const setDebugFill = (on) => {
            if (on === debugFill) return;
            debugFill = on;
            cursorEl.classList.toggle('fill', on);
        };
        window.addEventListener('keydown', (e) => setDebugFill(e.altKey && e.shiftKey), { passive: true });
        window.addEventListener('keyup', (e) => setDebugFill(e.altKey && e.shiftKey), { passive: true });
        window.addEventListener('blur', () => setDebugFill(false));

        // Position is written straight inside the event handler: no smoothing, no rAF wait.
        window.addEventListener('pointermove', (e) => {
            if (e.pointerType === 'touch') return;
            setDebugFill(e.altKey && e.shiftKey);
            mouseX = e.clientX;
            mouseY = e.clientY;
            if (!visible) setVisible(true);
            renderCursor();
            hoverDirty = true;
        }, { passive: true });

        window.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'touch') return;
            pressed = true;
        }, { passive: true });

        const release = () => { pressed = false; };
        window.addEventListener('pointerup', release, { passive: true });
        window.addEventListener('pointercancel', release, { passive: true });
        window.addEventListener('blur', release);

        document.documentElement.addEventListener('mouseleave', () => {
            setVisible(false);
            pressed = false;
            hovered = null;
        });
        document.documentElement.addEventListener('mouseenter', () => {
            if (mouseX > -9000) setVisible(true);
        });
    }

    /* ================================================================
       CATEGORY LAYOUT
       "side"  = title rotated on the left, list is 1 album tall,
                 title font size is fitted so its length == height of the list
       "stack" = title above (normal size), list is 2 albums tall
       One decision for the whole section, so all categories always match.
    ================================================================ */
    const discography = document.querySelector('.discography');
    const categories = document.getElementById('categories');
    const probe = document.getElementById('side-probe');
    const CHAR_W = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--char-w')) || 0.612;

    const catItems = Array.from(document.querySelectorAll('.category')).map((section) => {
        const title = section.querySelector('.cat-title');
        return {
            title,
            chars: title.textContent.trim().length,
            albums: Array.from(section.querySelectorAll('.album')),
        };
    });

    // Stacked layout shows 2 rows only for exactly 2 albums or 6+; 3-5 stay in 1 row.
    for (const c of catItems) {
        const n = c.albums.length;
        c.title.closest('.category').classList.toggle('two-rows', n === 2 || n >= 6);
    }

    // Height one album box has in a single-row list (same in both layouts: width is fixed)
    function albumHeight(album) {
        const cs = getComputedStyle(album);
        const cover = album.querySelector('.cover');
        const label = album.querySelector('.album-title');
        let h = parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom) + cover.getBoundingClientRect().height;
        if (label) h += label.getBoundingClientRect().height + parseFloat(getComputedStyle(label).marginTop);
        return h;
    }

    function applyLayout() {
        // --cat-size in style.css: "auto" = fitted by this script, any real size (e.g. 3rem, 40px) = used as-is
        const rawCat = getComputedStyle(document.documentElement).getPropertyValue('--cat-size').trim();
        const manualCat = rawCat !== '' && rawCat !== 'auto';
        const fitted = catItems.map((c) => {
            if (manualCat) {
                c.title.style.fontSize = '';                                   // let the CSS variable apply
                return { c, size: parseFloat(getComputedStyle(c.title).fontSize) || 0 };
            }
            const h = Math.max(0, ...c.albums.map(albumHeight));
            return { c, size: c.chars && h ? h / (c.chars * CHAR_W) : 0 };   // monospace: length = chars * 0.612em
        });
        const titleW = Math.max(0, ...fitted.map((f) => f.size));            // line-height is 1, so width = font size
        const side = categories.clientWidth >= probe.offsetWidth + titleW;
        discography.dataset.layout = side ? 'side' : 'stack';
        for (const f of fitted) {
            if (manualCat) continue;                                              // manual size: CSS already applied it
            let px = 0;
            if (side) px = f.size;                                                        // length == list height
            else if (f.c.chars) {                                                         // stacked: exactly 1 album box wide
                const cardW = f.c.albums[0] ? f.c.albums[0].offsetWidth : categories.clientWidth;
                px = Math.floor(Math.min(cardW, categories.clientWidth) / (f.c.chars * CHAR_W));
            }
            f.c.title.style.fontSize = px ? px + 'px' : '';
        }

        // Stacked layout: when a list overflows, add spacers (as track padding) on both ends so the
        // first and last album can be scrolled to the centre. Same group size the < > buttons page by.
        const edge = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--edge')) || 0;
        for (const root of document.querySelectorAll('[data-carousel]')) {
            const track = root.querySelector('.track');
            const scroller = root.querySelector('.scroller');
            const first = track.children[0];
            let pad = '';                                   // '' = back to the default (--edge)
            if (!side && first) {
                const gap = parseFloat(getComputedStyle(track).columnGap) || 0;
                const step = first.offsetWidth + gap;
                const rows = root.closest('.category').classList.contains('two-rows') ? 2 : 1;
                const cols = Math.ceil(track.children.length / rows);
                const W = scroller.clientWidth;
                const plain = cols * step - gap + 2 * edge; // content width with the normal edge padding
                if (plain > W) {
                    const perPage = Math.max(1, Math.floor(W / step));
                    const group = perPage * step - gap;     // width of what one page shows
                    pad = Math.max(edge, (W - group) / 2) + 'px';
                }
            }
            track.style.setProperty('--track-pad', pad);
        }
    }
    applyLayout();
    new ResizeObserver(applyLayout).observe(categories);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(applyLayout);

    /* ================================================================
       ALBUM LISTS (touch scroll + smooth < > buttons)
       The mouse wheel / trackpad never scrolls a list: over a list it is
       passed straight on to the page, so the page scrolls exactly the same
       as everywhere else.
    ================================================================ */
    // The < > arrow artwork lives here once. Every .arrow button gets it (the < is the same svg, mirrored in CSS).
    const ARROW_SVG = `<svg viewBox="0 0 67.733334 67.733333" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
        <circle class="svg-elem-1" cx="33.866665" cy="33.866665" r="33.866665" />
        <g fill="none" stroke="#fff" stroke-width="4.23333" stroke-linecap="round">
            <path class="svg-elem-2" stroke-linejoin="round" transform="rotate(138.18968)" d="M 22.73506,-47.820499 A 25.400002,25.400002 0 0 1 -0.22945281,-22.537531" />
            <path class="svg-elem-3" stroke-linejoin="miter" d="M 15.337307,16.493613 57.150003,33.866669 14.934624,50.800001" />
        </g>
    </svg>`;
    for (const b of document.querySelectorAll('.arrow')) b.innerHTML = ARROW_SVG;

    const carousels = Array.from(document.querySelectorAll('[data-carousel]')).map((root) => {
        const scroller = root.querySelector('.scroller');
        const track = root.querySelector('.track');
        const prev = root.querySelector('[data-dir="-1"]');
        const next = root.querySelector('[data-dir="1"]');

        let inner = null;
        if (window.Lenis && !reduceMotion) {
            inner = new Lenis({
                wrapper: scroller,
                content: track,
                orientation: 'horizontal',
                gestureOrientation: 'horizontal', // vertical swipes still scroll the page
                lerp: CAROUSEL.lerp,
                smoothWheel: false,               // wheel does nothing to the list
                syncTouch: CAROUSEL.syncTouch,
            });
        }

        scroller.addEventListener('wheel', (e) => {
            if (e.ctrlKey) return;                // pinch-zoom: leave alone
            if (!lenis) {
                // no smooth page scroll: just stop sideways wheel from moving the list
                if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) e.preventDefault();
                return;
            }
            // Lenis ignores wheel events that start inside another Lenis element, so hand
            // the event to the page from a neutral element. Lenis then treats it exactly
            // like a wheel turn anywhere else on the page.
            e.preventDefault();
            e.stopPropagation();
            document.body.dispatchEvent(new WheelEvent('wheel', {
                deltaX: e.deltaX, deltaY: e.deltaY, deltaZ: e.deltaZ, deltaMode: e.deltaMode,
                clientX: e.clientX, clientY: e.clientY,
                bubbles: true, cancelable: true,
            }));
        }, { passive: false });

        let dest = null;   // where an arrow-started scroll is heading (so quick repeat clicks keep paging)

        const update = () => {
            const max = scroller.scrollWidth - scroller.clientWidth;
            // native-scroll fallback: forget the target once the list has got there
            if (dest !== null && !inner && Math.abs(scroller.scrollLeft - dest) <= 1) dest = null;
            // an arrow is hidden as soon as another click couldn't move the list any further than
            // where it is already heading, not only once it has arrived
            const pos = dest !== null ? dest : scroller.scrollLeft;
            prev.disabled = pos <= 1;
            next.disabled = pos >= max - 1;
            if (!prev.disabled) prev.classList.add('seen');   // the "out" animation only plays after an arrow has been shown once
            if (!next.disabled) next.classList.add('seen');
            root.classList.toggle('no-scroll', prev.disabled && next.disabled);
            hoverDirty = true;
        };

        // Scroll by whole albums, as many as fit on screen
        const page = (dir) => {
            const first = track.children[0];
            if (!first) return;
            const stepW = first.offsetWidth + (parseFloat(getComputedStyle(track).columnGap) || 0);
            const perPage = Math.max(1, Math.floor(scroller.clientWidth / stepW));
            const from = dest !== null ? dest : scroller.scrollLeft;
            const max = scroller.scrollWidth - scroller.clientWidth;
            const target = clamp(Math.round(from / stepW) * stepW + dir * perPage * stepW, 0, max);

            dest = target;
            if (inner) {
                inner.scrollTo(target, { lerp: CAROUSEL.lerp, onComplete: () => { dest = null; update(); } });
            } else {
                scroller.scrollTo({ left: target, behavior: reduceMotion ? 'auto' : 'smooth' });
            }
            update();
        };

        prev.addEventListener('click', () => page(-1));
        next.addEventListener('click', () => page(1));
        scroller.addEventListener('scroll', update, { passive: true });
        // a finger grabbing the list cancels a pending arrow target
        scroller.addEventListener('touchstart', () => { dest = null; update(); }, { passive: true });

        const ro = new ResizeObserver(update);
        ro.observe(scroller);
        ro.observe(track);
        update();

        return { inner };
    });

    /* ================================================================
       FADE ITEMS (album boxes + links)
    ================================================================ */
    const cfg_base = (isCard) => (isCard ? CARD_FADE.base : 0) || 0;
    const fadeItems = Array.from(document.querySelectorAll('[data-fade]')).map((el) => {
        const isCard = el.dataset.fade === 'card';
        return {
            el,
            cfg: isCard ? CARD_FADE : LINK_FADE,
            prop: isCard ? 'backgroundColor' : 'textDecorationColor',
            current: cfg_base(isCard),
        };
    });

    // Elements added later (the menu options, the LISTEN cards) join the same hover fades
    // (call it once the element is in the page. Forgetting removed elements is pruneFade's job)
    function registerFade(el) {
        const isCard = el.dataset.fade === 'card';
        fadeItems.push({
            el,
            cfg: isCard ? CARD_FADE : LINK_FADE,
            prop: isCard ? 'backgroundColor' : 'textDecorationColor',
            current: cfg_base(isCard),
        });
    }

    function pruneFade() {
        for (let i = fadeItems.length - 1; i >= 0; i--) if (!fadeItems[i].el.isConnected) fadeItems.splice(i, 1);
    }

    /* ================================================================
       MAIN LOOP
    ================================================================ */
    if (lenis) lenis.on('scroll', () => { hoverDirty = true; });

    let last = 0;
    function tick(now) {
        const dt = last ? Math.min((now - last) / 1000, 0.1) : 1 / 60;
        last = now;

        if (lenis) lenis.raf(now);
        if (pageLenis) pageLenis.raf(now);
        if (coverView) coverView.tick(dt);
        for (const c of carousels) if (c.inner) c.inner.raf(now);

        if (hoverDirty && visible) {
            hoverDirty = false;
            updateHover();
        }

        // cursor radius
        if (finePointer) {
            const desired = debugFill ? CURSOR.hoverRadius * CURSOR.debugScale
                : pressed ? CURSOR.pressRadius
                : hovered ? CURSOR.hoverRadius
                    : CURSOR.radius;
            const r = stepWith(CURSOR.lerp, desired, radius, dt);
            if (r.moved) {
                radius = r.value;
                renderCursor();
            }
        }

        // menu button: morph + hover shift
        iconTick(now, dt);

        // album box backgrounds + link underlines
        for (const item of fadeItems) {
            const desired = item.el === hovered ? item.cfg.alpha : (item.cfg.base || 0);
            const r = stepWith(item.cfg.lerp, desired, item.current, dt);
            if (r.moved) {
                item.current = r.value;
                item.el.style[item.prop] = `rgba(255, 255, 255, ${item.current})`;
            }
        }

        requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);

    /* ================================================================
   PAGE OVERLAY + MENU
   One shared black background (the overlay): appears instantly, fades out over 0.5s when closed.
   Layers on it, back to front: page content, menu background, menu options.
   Click an album -> overlay instant, page content fades in over 1.5s, the button draws in as the menu icon.
   Click the menu icon -> over 0.5s: menu background 0 -> 80%, page blur 0 -> 5px, options fade in,
     icon -> X.
   Click the background / the selected option -> all of that in reverse (0.5s).
   Click another option -> the page content is swapped for the new one, then the same reverse animation.
   Click X (or Esc; works 0.2s after the menu started opening) -> page content, options and menu
     background vanish instantly, the black fades out over 0.5s, homepage usable straight away.
================================================================ */
    const overlay = document.getElementById('page-overlay');
    const pageContent = document.getElementById('page-content');
    const menuPopup = document.getElementById('menu-popup');
    const menuBackdrop = document.getElementById('menu-backdrop');
    const menuNav = menuPopup.querySelector('.menu-links');
    let menuLinks = [];
    const closeBtn = document.getElementById('page-close');       // the menu / X button
    const closeSvg = closeBtn.querySelector('svg');
    const iconTop = document.getElementById('icon-top');
    const iconBottom = document.getElementById('icon-bottom');
    const iconMid = document.getElementById('icon-mid');
    const htmlEl = document.documentElement;

    // closed = nothing open | page = page popup, button is the menu icon | menu = menu popup up, button is the X
    let pageState = 'closed';
    let busy = false;           // true during menu <-> X: the menu button can't be pressed again yet
    let menuStart = 0;          // when the menu started opening (the X works 0.2s after this)
    let currentAlbum = null;    // the album whose page is open
    let currentKey = '';        // its key in ALBUMS
    const X_READY_MS = 200;

    /* ---- the icon ----------------------------------------------------
       Numbers are the ones in menu.svg / close.svg (viewBox units).
       Top + bottom bars: the LEFT end slides in a straight line to its X spot. The RIGHT end is
       lerped as angle + distance from the circle's centre, so it rides round the white ring
       instead of cutting across. The middle bar just fades. The ring itself is never touched. */
    const IC = { x: 33.866665, y: 33.866669 };                    // centre of the ring
    const MENU_DY = ICON.barOffset;                               // top / bottom bar: distance from the centre line
    const MENU_R = Math.hypot(21.166668, 12.700001);              // the bars' ends sit on this circle (just inside the ring)
    const X_END = {
        top: { l: [16.933334, 16.933334], r: [50.800002, 50.800002] },   // "\"
        bottom: { l: [16.933334, 50.800002], r: [50.800002, 16.933334] },   // "/"
    };
    const mix = (a, b, t) => a + (b - a) * t;
    const toPolar = (p) => ({ a: Math.atan2(p[1] - IC.y, p[0] - IC.x), r: Math.hypot(p[0] - IC.x, p[1] - IC.y) });
    const X_POLAR = { top: toPolar(X_END.top.r), bottom: toPolar(X_END.bottom.r) };
    const f3 = (n) => n.toFixed(3);

    let iconP = 0;              // raw progress: 0 = menu icon, 1 = X
    let iconExpand = 0;         // menu hover shift, 0..1 (eased by iconTick)
    let tween = null;           // running menu <-> X morph: { from, to, start, done }

    // side: -1 = top bar, 1 = bottom bar. t = eased morph (0..1). e = hover shift (0..1)
    function setBar(path, side, t, e, end, endPolar) {
        // menu position (with the hover shift). The ends stay on the same circle, so the bar gets
        // a little shorter as it moves away from the centre.
        const dy = side * (MENU_DY + ICON.hoverShift * e);
        const hx = Math.sqrt(MENU_R * MENU_R - dy * dy);
        const lx = mix(IC.x - hx, end.l[0], t);
        const ly = mix(IC.y + dy, end.l[1], t);
        const s = toPolar([IC.x + hx, IC.y + dy]);
        const a = mix(s.a, endPolar.a, t);
        const r = mix(s.r, endPolar.r, t);
        path.setAttribute('d', `M ${f3(lx)},${f3(ly)} L ${f3(IC.x + Math.cos(a) * r)},${f3(IC.y + Math.sin(a) * r)}`);
    }

    function renderIcon() {
        const t = ICON.ease(iconP);
        const e = iconExpand * (1 - t);                           // no hover shift left once it is the X
        setBar(iconTop, -1, t, e, X_END.top, X_POLAR.top);
        setBar(iconBottom, 1, t, e, X_END.bottom, X_POLAR.bottom);
        // middle bar: fades AND retracts towards the left (the reverse of its draw-in, see svg.css).
        // Inline styles only while morphing, so the CSS draw-in / un-draw still drives it the rest of the time.
        if (t === 0) {
            iconMid.style.opacity = '';
            iconMid.style.strokeDashoffset = '';
            iconMid.style.transition = '';
        } else {
            iconMid.style.transition = 'none';
            iconMid.style.opacity = String(1 - t);
            iconMid.style.strokeDashoffset = String(t * 1.1);
        }
    }

    function startMorph(to, done) {
        tween = { from: iconP, to, start: performance.now(), dur: Math.max(1, ICON.morphMs * Math.abs(to - iconP)), done };
    }

    // called every frame from the main loop
    function iconTick(now, dt) {
        let dirty = false, finished = null;
        if (tween) {
            const k = clamp((now - tween.start) / tween.dur, 0, 1);
            iconP = mix(tween.from, tween.to, k);
            dirty = true;
            if (k >= 1) { finished = tween.done; tween = null; }
        }
        const r = stepWith(ICON.hoverLerp, expandWant ? 1 : 0, iconExpand, dt);
        if (r.moved) { iconExpand = r.value; dirty = true; }
        if (dirty) renderIcon();
        if (finished) finished();
    }

    /* ---- hover ---------------------------------------------------------
       X:         rotates 90deg (the .rot class, CSS in svg.css), as before.
       menu icon: top bar up / bottom bar down (iconExpand, above).
       Neither reacts while the icon is morphing. */
    const HOVER_LOCK = 100;     // after the X rotation triggers, the opposite trigger waits 0.1s
    let pointerInside = false;
    let rotWant = false, rotOn = false, rotLocked = false, rotTimer = null;
    let expandWant = false;

    function applyRot() {
        if (rotLocked || rotWant === rotOn) return;
        rotOn = rotWant;
        closeBtn.classList.toggle('rot', rotOn);
        rotLocked = true;
        rotTimer = setTimeout(() => { rotLocked = false; applyRot(); }, HOVER_LOCK);
    }

    function syncHover() {
        rotWant = pointerInside && pageState === 'menu';      // also while the menu icon is still turning into the X
        expandWant = pointerInside && pageState === 'page' && !busy;
        applyRot();
    }

    closeBtn.addEventListener('pointerenter', (e) => { if (e.pointerType === 'touch') return; pointerInside = true; syncHover(); });
    closeBtn.addEventListener('pointerleave', (e) => { if (e.pointerType === 'touch') return; pointerInside = false; syncHover(); });

    /* ---- TEMP test content: the album's cover, fitted to the window ---- */
    function showTestContent(album) {
        pageContent.textContent = '';
        const src = album.querySelector('.cover img');
        if (!src) return;
        const im = new Image();
        im.alt = '';
        im.draggable = false;
        im.src = src.currentSrc || src.src;                       // whatever is already loaded, so there is no blank
        pageContent.appendChild(im);
        const full = src.dataset.full;
        if (full) preload(full).then((ok) => { if (ok && im.isConnected) im.src = full; });
    }

    /* ---- tabs + pages ---- */
    // menu options of the opened album: exactly its tabs (LISTEN only shows up if it is in the array)
    function buildMenu(key) {
        const tabs = ((ALBUMS[key] && ALBUMS[key].tabs) || []).map((t) => String(t).toLowerCase());
        menuNav.textContent = '';
        pruneFade();
        menuLinks = tabs.map((tab, i) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'link menu-link' + (i === 0 ? ' current' : '');
            b.dataset.fade = 'link';
            b.dataset.tab = tab;
            b.textContent = tab.toUpperCase();
            if (i === 0) b.setAttribute('aria-current', 'page');
            menuNav.appendChild(b);
            registerFade(b);
            return b;
        });
        return tabs[0];
    }

    // LISTEN page: a centred category per platform (icon + title), a grid of edition cards under it
    function showListen(key) {
        const root = document.createElement('div');
        root.className = 'listen';
        const editions = (ALBUMS[key] && ALBUMS[key].editions) || {};
        const cards = [];
        for (const [platform, list] of Object.entries(editions)) {
            if (!Array.isArray(list) || !list.length) continue;

            const cat = document.createElement('section');
            cat.className = 'listen-cat';

            const title = document.createElement('h2');
            title.className = 'cat-title listen-title';
            const label = document.createElement('span');
            label.textContent = platform.toUpperCase();
            title.appendChild(label);
            // icon: the built-in one, else icon/<platform>.png / .svg / .jpg / .jpeg. Only added if one loads.
            const iconUrls = BUILTIN_ICONS[platform]
                ? [BUILTIN_ICONS[platform]]
                : PATHS.iconExts.map((ext) => PATHS.platformIcon(platform, ext));
            const icon = new Image();
            icon.alt = '';
            icon.draggable = false;
            icon.onload = () => { title.prepend(icon); };
            loadFirst(icon, iconUrls);
            cat.appendChild(title);

            const grid = document.createElement('div');
            grid.className = 'listen-grid';
            grid.style.setProperty('--n', list.length);
            for (const ed of list) {
                const a = document.createElement('a');
                a.className = 'album';
                a.dataset.fade = 'card';
                a.href = ed.link;
                a.target = '_blank';
                a.rel = 'noopener';

                const cover = document.createElement('div');
                cover.className = 'cover';
                const im = new Image();
                im.alt = '';
                im.draggable = false;
                // custom cover (<album>/<cover>.png / .jpg / .jpeg), then the album's own covers/<album>.png / .jpg / .jpeg
                const coverUrls = [
                    ...(ed.cover ? PATHS.coverExts.map((ext) => PATHS.editionCover(key, ed.cover, ext)) : []),
                    ...PATHS.coverExts.map((ext) => PATHS.albumCover(key, ext)),
                ];
                loadFirst(im, coverUrls, () => im.remove());      // nothing found: the grey placeholder stays
                cover.appendChild(im);

                const name = document.createElement('p');
                name.className = 'album-title';
                name.textContent = ed.name;

                a.append(cover, name);
                grid.appendChild(a);
                cards.push(a);
            }
            cat.appendChild(grid);
            root.appendChild(cat);
        }
        pageContent.appendChild(root);
        cards.forEach(registerFade);                              // hover fade (after they are in the page)

        return root;
    }

    // any tab that has no page yet (context, samples...): a centred PAGE NOT FOUND
    function showNotFound() {
        const el = document.createElement('div');
        el.className = 'page-missing';
        el.textContent = 'PAGE NOT FOUND';
        pageContent.appendChild(el);
    }

    // Any other tab (context, samples...): <album>/<tab>.html is fetched and shown in an iframe.
    // The page goes in as srcdoc, with a <base> pointing at the album folder so its relative links work.
    // That is also how page.js knows the page was opened by the site: a page opened by its own address
    // is not "about:srcdoc", so page.js sends that visitor to the 404 page (see page.js).
    // Fetch fails (no such file): PAGE NOT FOUND, like before.
    let frameToken = 0;                                   // bumped on every tab change, so a slow fetch can't land on the wrong tab
    async function showFrame(key, tab) {
        const token = ++frameToken;
        try {
            const url = new URL(PATHS.page(key, tab), document.baseURI);
            const res = await fetch(url, { cache: 'no-cache' });
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const doc = new DOMParser().parseFromString(await res.text(), 'text/html');
            if (token !== frameToken) return;
            const base = doc.createElement('base');
            base.href = new URL('./', url).href;
            doc.head.prepend(base);
            const frame = document.createElement('iframe');
            frame.className = 'page-frame';
            frame.title = tab;
            frame.srcdoc = '<!DOCTYPE html>' + doc.documentElement.outerHTML;
            pageContent.appendChild(frame);
        } catch (err) {
            if (token !== frameToken) return;
            pageContent.textContent = '';
            showNotFound();
        }
        hoverDirty = true;
    }

    function stopFrame() {
        frameToken++;
        const frame = pageContent.querySelector('.page-frame');
        if (frame) frame.remove();
    }

    // Remembers the movement of the last COVER.flickWindow seconds of a drag. On release, velocity() gives the average
    // speed over that window (px/s), so a drag that stopped before letting go gives 0 and a fast flick gives a fast glide.
    function makeFlick() {
        const samples = [];                 // { t (ms), dx, dy } one per pointer move
        let since = performance.now();      // when the drag (or this tracking) started
        const prune = (now) => {
            const from = now - COVER.flickWindow * 1000;
            while (samples.length && samples[0].t < from) samples.shift();
        };
        return {
            reset() { samples.length = 0; since = performance.now(); },
            add(dx, dy) {
                const now = performance.now();
                samples.push({ t: now, dx, dy });
                prune(now);
            },
            velocity() {
                const now = performance.now();
                prune(now);
                let sx = 0, sy = 0;
                for (const m of samples) { sx += m.dx; sy += m.dy; }
                const from = Math.max(since, now - COVER.flickWindow * 1000);
                const span = Math.max(now - from, 16) / 1000;     // short drags: divide by how long it really was
                let vx = sx / span, vy = sy / span;
                const sp = Math.hypot(vx, vy);
                if (sp < COVER.glideMin) return { x: 0, y: 0 };
                if (sp > COVER.glideMax) { vx *= COVER.glideMax / sp; vy *= COVER.glideMax / sp; }
                return { x: vx, y: vy };
            },
        };
    }

    // COVER page: the album cover on its own. Drag to move, wheel / pinch / slider to zoom.
    // zoom 1 = 100% = one image pixel per device pixel. Minimum = fit to screen, maximum = COVER.maxZoom.
    function showCover(album) {
        const src = album.querySelector('.cover img');
        if (!src) return;
        const full = src.dataset.full;

        const stage = document.createElement('div');
        stage.className = 'cover-view';
        const im = new Image();
        im.alt = '';
        im.draggable = false;
        im.src = src.currentSrc || src.src;                       // whatever is already loaded, so there is no blank
        stage.appendChild(im);

        const ui = document.createElement('div');
        ui.className = 'cover-ui';
        const pct = document.createElement('button');
        pct.type = 'button';
        pct.className = 'link cover-pct';
        pct.dataset.fade = 'link';
        pct.setAttribute('aria-label', 'Toggle 100% / fit to screen');
        const slider = document.createElement('input');
        slider.type = 'range';
        slider.className = 'cover-slider';
        slider.min = '0';
        slider.max = '1000';
        slider.step = '1';
        slider.value = '0';
        slider.dataset.clickable = '';
        slider.setAttribute('aria-label', 'Zoom');
        ui.append(pct, slider);
        stage.appendChild(ui);
        pageContent.appendChild(stage);
        registerFade(pct);

        let nw = 0, nh = 0;                 // natural size of the image that is showing
        let W = 0, H = 0, dpr = 1;          // stage size (css px), device pixel ratio
        let fitZ = 1, maxZ = COVER.maxZoom;
        let z = 1, tz = 1;                  // zoom now / zoom it is easing towards
        let x = 0, y = 0;                   // image top-left on the stage (css px)
        let ax = 0, ay = 0;                 // point the zoom is anchored to (stays put on screen)
        let ready = false;
        let panX = 0, panY = 0;             // scroll distance still to travel (eased out by tick)
        let bx = 0, by = 0;                 // zoom box: top-left corner on the stage (css px)
        let boxFree = false;                // true once the box has been dragged: it then stays where it was put
        const imgFlick = makeFlick(), boxFlick = makeFlick();
        let vx = 0, vy = 0;                 // image glide velocity after a drag (px/s)
        let bvx = 0, bvy = 0;               // zoom box glide velocity after a drag (px/s)
        let boxGlide = false;               // zoom box glide loop is running (set when a drag is let go)

        const clampZ = (v) => clamp(v, fitZ, maxZ);
        const sOf = (v) => (maxZ > fitZ ? clamp(Math.log(v / fitZ) / Math.log(maxZ / fitZ), 0, 1) : 0);
        const zOf = (s) => fitZ * Math.pow(maxZ / fitZ, s);     // each slider step = the same zoom ratio
        const isFit = () => Math.abs(tz - fitZ) <= fitZ * 0.002;

        function clampPan() {
            const w = nw * z / dpr, h = nh * z / dpr;
            x = w <= W ? (W - w) / 2 : clamp(x, W - w, 0);      // smaller than the screen: centred; bigger: edges can't come inside
            y = h <= H ? (H - h) / 2 : clamp(y, H - h, 0);
        }

        function render() {
            im.style.transform = `translate3d(${x}px, ${y}px, 0) scale(${z / dpr})`;
            const label = Math.round(z * 100) + '%';
            if (pct.textContent !== label) pct.textContent = label;
            const sv = Math.round(sOf(tz) * 1000);
            if (+slider.value !== sv) slider.value = sv;
            slider.style.setProperty('--fill', (sv / 10) + '%');
        }

        // zoom to nz keeping the screen point (px, py) where it is
        function zoomAt(nz, px, py) {
            const k = nz / z;
            x = px - (px - x) * k;
            y = py - (py - y) * k;
            z = nz;
            clampPan();
        }

        // Place the zoom box. Everything here is plain numbers (the stage size and the box's own layout size,
        // which a translate doesn't change), so it can't drift: the box is always fully inside the stage.
        // Not dragged yet = in the bottom left corner.
        function layoutBox() {
            const w = stage.clientWidth, h = stage.clientHeight;
            if (!w || !h) return;
            const bw = ui.offsetWidth, bh = ui.offsetHeight;
            if (!boxFree) { bx = 0; by = h - bh; }
            bx = clamp(bx, 0, Math.max(0, w - bw));
            by = clamp(by, 0, Math.max(0, h - bh));
            ui.style.translate = `${bx}px ${by}px`;
        }

        function measure(forceFit) {
            if (!nw) return;
            const w = stage.clientWidth, h = stage.clientHeight;
            if (!w || !h) return;
            const atFit = forceFit || !ready || isFit();
            ready = true;
            W = w; H = h; dpr = window.devicePixelRatio || 1;
            fitZ = Math.min(W * dpr / nw, H * dpr / nh);
            maxZ = Math.max(COVER.maxZoom, fitZ);
            if (atFit) { z = tz = fitZ; } else { z = clampZ(z); tz = clampZ(tz); }
            ax = W / 2; ay = H / 2;
            clampPan();
            render();
        }

        // the first (small) image is replaced by the full one: same size on screen, just sharper
        function setNatural(w, h) {
            if (!w || !h) return;
            const wasFit = !nw || isFit();
            if (nw) { const k = nw / w; z *= k; tz *= k; }
            nw = w; nh = h;
            im.style.width = w + 'px';
            im.style.height = h + 'px';
            measure(wasFit);
        }

        if (im.naturalWidth) setNatural(im.naturalWidth, im.naturalHeight);
        else im.onload = () => { if (!nw) setNatural(im.naturalWidth, im.naturalHeight); };
        if (full) {
            const big = new Image();
            big.onload = () => {
                (big.decode ? big.decode() : Promise.resolve()).catch(() => { }).then(() => {
                    if (!stage.isConnected) return;
                    im.src = full;
                    setNatural(big.naturalWidth, big.naturalHeight);
                });
            };
            big.src = full;
        }

        const ro = new ResizeObserver(() => { measure(); layoutBox(); });
        ro.observe(stage);
        layoutBox();

        const zoomTo = (v, px, py) => { tz = clampZ(v); ax = px; ay = py; };

        /* ---- drag (mouse) + drag / pinch (touch) ---- */
        const ptrs = new Map();
        let last = null;                                   // pinch: midpoint + finger distance
        let tap = null;                                    // the press that is still a candidate for a tap
        let lastTap = null;                                // the previous tap (for double tap)
        const pinch = () => {
            const [a, b] = [...ptrs.values()];
            return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, d: Math.hypot(a.x - b.x, a.y - b.y) };
        };

        stage.addEventListener('pointerdown', (e) => {
            if (e.target.closest('.cover-ui')) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
            try { stage.setPointerCapture(e.pointerId); } catch (_) { }
            tz = z;                                        // grabbing stops a zoom that is still easing...
            panX = panY = 0;                               // ...and a scroll
            vx = vy = 0;                                   // ...and a glide
            imgFlick.reset();
            tap = ptrs.size === 1 ? { t: performance.now(), x: e.clientX, y: e.clientY, ok: true } : null;
            if (ptrs.size === 2) last = pinch();
        });

        stage.addEventListener('pointermove', (e) => {
            const p = ptrs.get(e.pointerId);
            if (!p) return;
            if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 8) tap.ok = false;   // it moved: a drag, not a tap
            const px = p.x, py = p.y;
            const ox = x, oy = y;
            p.x = e.clientX; p.y = e.clientY;
            if (ptrs.size === 1) {
                x += p.x - px;
                y += p.y - py;
            } else if (ptrs.size === 2) {
                const m = pinch();
                x += m.x - last.x;                         // the two fingers' midpoint drags the image...
                y += m.y - last.y;
                if (last.d > 0 && m.d > 0) zoomAt(clampZ(z * m.d / last.d), m.x, m.y);   // ...their distance zooms it
                tz = z;
                last = m;
            }
            clampPan();
            if (ptrs.size === 1) imgFlick.add(x - ox, y - oy);      // what the image really moved (edges included)
            render();
        });

        const lift = (e) => {
            if (!ptrs.delete(e.pointerId)) return;
            imgFlick.reset();                              // finger count changed: start the history over
            if (ptrs.size === 2) last = pinch();
        };
        stage.addEventListener('pointerup', (e) => {
            const now = performance.now();
            const wasTap = tap && tap.ok && ptrs.size === 1 && ptrs.has(e.pointerId) && now - tap.t < 400;
            if (ptrs.size === 1 && ptrs.has(e.pointerId) && !reduceMotion) {      // last finger / the mouse let go: glide
                const v = imgFlick.velocity();
                vx = v.x; vy = v.y;
            }
            lift(e);
            if (!wasTap) return;
            // two quick taps in (about) the same spot = a click on the percentage
            if (lastTap && now - lastTap.t < 350 && Math.hypot(tap.x - lastTap.x, tap.y - lastTap.y) < 30) {
                lastTap = null;
                togglePct();
            } else {
                lastTap = { t: now, x: tap.x, y: tap.y };
            }
        });
        stage.addEventListener('pointercancel', (e) => { tap = null; lift(e); });

        /* ---- wheel ----
           plain: scrolls the image, smoothly (up / down, and left / right on a trackpad) | shift: left / right
           ctrl (cmd): zoom, never the browser's own zoom. Trackpad pinch (small deltas) zooms smoothly,
           a ctrl + mouse wheel notch moves the slider 1/20. */
        const notch = (d, px, py) => zoomTo(zOf(clamp(sOf(tz) - d / 100 * COVER.wheelStep, 0, 1)), px, py);
        stage.addEventListener('wheel', (e) => {
            e.preventDefault();
            let dx = e.deltaX, dy = e.deltaY;
            if (e.deltaMode === 1) { dx *= 40; dy *= 40; } else if (e.deltaMode === 2) { dx *= 800; dy *= 800; }
            if (e.ctrlKey || e.metaKey) {
                if (Math.abs(dy) < 30) zoomTo(tz * Math.exp(-dy * 0.01), e.clientX, e.clientY);
                else notch(dy, e.clientX, e.clientY);
                return;
            }
            vx = vy = 0;                                         // scrolling stops a drag glide (zooming, above, doesn't)
            // not applied here: it is added to the distance still to travel, and tick() eases it out
            if (e.shiftKey) {
                panX -= Math.abs(dx) > Math.abs(dy) ? dx : dy;   // browsers differ in which axis shift + wheel reports
            } else {
                panX -= dx;
                panY -= dy;
            }
        }, { passive: false });

        /* ---- keyboard: ctrl + / ctrl - zoom one slider step, ctrl 0 = fit to screen (not the browser's zoom) ---- */
        const onKey = (e) => {
            if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
            const dir = (e.key === '=' || e.key === '+') ? 1 : (e.key === '-' || e.key === '_') ? -1 : e.key === '0' ? 0 : null;
            if (dir === null) return;
            e.preventDefault();
            if (pageState !== 'page') return;
            if (dir === 0) zoomTo(fitZ, W / 2, H / 2);
            else zoomTo(zOf(clamp(sOf(tz) + dir * COVER.wheelStep, 0, 1)), W / 2, H / 2);
        };
        document.addEventListener('keydown', onKey);

        /* ---- arrow keys: while held they keep adding velocity to the image's glide (see tick) ----
           left adds to the x velocity (the image slides right, so you look further left), right subtracts, up / down the same for y.
           Not while the slider has focus (the arrow keys belong to it then), and not with ctrl / cmd / alt held. */
        const arrows = { ArrowLeft: false, ArrowRight: false, ArrowUp: false, ArrowDown: false };
        const onArrowDown = (e) => {
            if (!(e.key in arrows) || e.ctrlKey || e.metaKey || e.altKey) return;
            if (e.target === slider || pageState !== 'page') return;
            arrows[e.key] = true;
            e.preventDefault();
        };
        const onArrowUp = (e) => { if (e.key in arrows) arrows[e.key] = false; };
        const clearArrows = () => { for (const k in arrows) arrows[k] = false; };
        document.addEventListener('keydown', onArrowDown);
        document.addEventListener('keyup', onArrowUp);
        window.addEventListener('blur', clearArrows);

        // Safari's own pinch-zoom gesture: not wanted here
        for (const t of ['gesturestart', 'gesturechange', 'gestureend']) {
            stage.addEventListener(t, (e) => e.preventDefault());
        }

        /* ---- slider + percentage ---- */
        slider.addEventListener('input', () => zoomTo(zOf(+slider.value / 1000), W / 2, H / 2));
        // at 100%: fit to screen. Anywhere else: 100%. (The percentage and a double tap on the image both do this.)
        const togglePct = () => zoomTo(Math.abs(tz - 1) < 0.005 ? fitZ : 1, W / 2, H / 2);
        let boxMoved = false;                              // the last press on the box was a drag: its click doesn't count
        pct.addEventListener('click', () => {
            if (boxMoved) { boxMoved = false; return; }
            togglePct();
        });

        /* ---- drag the zoom box ----
           Grab it anywhere ABOVE the slider (the percentage and the space around it) and it follows the cursor.
           The slider and the box beside / under it do nothing. Listening on window, so a fast drag can't lose it. */
        let boxDrag = null;
        ui.addEventListener('pointerdown', (e) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            if (e.clientY >= slider.getBoundingClientRect().top) return;
            bvx = bvy = 0;                                              // grabbing stops a glide
            boxGlide = false;
            boxFlick.reset();
            boxMoved = false;
            boxDrag = { id: e.pointerId, sx: e.clientX, sy: e.clientY, bx, by, moved: false };
        });
        const boxMove = (e) => {
            if (!boxDrag || e.pointerId !== boxDrag.id) return;
            const dx = e.clientX - boxDrag.sx, dy = e.clientY - boxDrag.sy;
            if (!boxDrag.moved && Math.hypot(dx, dy) < 4) return;       // a click on the percentage stays a click
            boxDrag.moved = boxMoved = true;
            boxFree = true;
            const obx = bx, oby = by;
            bx = boxDrag.bx + dx;
            by = boxDrag.by + dy;
            layoutBox();                                                // clamps: it can't leave the stage
            boxFlick.add(bx - obx, by - oby);                           // what the box really moved (walls included)
        };
        const boxUp = (e) => {
            if (!boxDrag || e.pointerId !== boxDrag.id) return;
            if (boxDrag.moved && !reduceMotion) { const v = boxFlick.velocity(); bvx = v.x; bvy = v.y; boxGlide = true; }   // always starts the loop, so the pulls work even with no glide
            boxDrag = null;
        };
        const boxCancel = (e) => { if (boxDrag && e.pointerId === boxDrag.id) boxDrag = null; };
        window.addEventListener('pointermove', boxMove);
        window.addEventListener('pointerup', boxUp);
        window.addEventListener('pointercancel', boxCancel);

        // Wall pull for the zoom box (only called while it glides). For each axis, find the wall whose box edge is closest.
        // If that edge is inside the zone but not touching the wall, it matches: the box is moved towards the wall by
        // COVER.wallPull * (1 - distance / zone) px per frame (60fps), but only while the glide speed is under COVER.wallMaxSpeed.
        // Returns true if the box is in a wall zone (even when the speed is too high for the pull to work yet).
        // 1 up to taper * maxSpeed, then linearly down to 0 at maxSpeed
        const taperFade = (speed, maxSpeed, taper) => {
            const r = speed / maxSpeed;
            return r <= taper ? 1 : (taper < 1 ? Math.max(0, (1 - r) / (1 - taper)) : 0);
        };

        function boxWallPull(dt, speed) {
            const w = stage.clientWidth, h = stage.clientHeight;
            const zoneX = COVER.wallZone * COVER.wallZoneLR * w;        // left / right: of the screen width
            const zoneY = COVER.wallZone * COVER.wallZoneTB * h;        // top / bottom: of the screen height
            const gx = Math.min(bx, w - ui.offsetWidth - bx);           // box edge -> nearest of left / right wall
            const gy = Math.min(by, h - ui.offsetHeight - by);          // box edge -> nearest of top / bottom wall
            const inX = gx > 0.01 && gx < zoneX;
            const inY = gy > 0.01 && gy < zoneY;
            if (!inX && !inY) return false;
            if (speed < COVER.wallMaxSpeed) {
                // fade the pull out as the glide gets faster (glide speed only, the pull's own movement isn't counted)
                const k = dt * 60 * taperFade(speed, COVER.wallMaxSpeed, COVER.wallTaper);
                if (inX) bx += (bx <= w - ui.offsetWidth - bx ? -1 : 1) * COVER.wallPull * (1 - gx / zoneX) * k;
                if (inY) by += (by <= h - ui.offsetHeight - by ? -1 : 1) * COVER.wallPull * (1 - gy / zoneY) * k;
                layoutBox();                                            // clamps: it lands exactly on the wall, never past it
            }
            return true;
        }

        // Centre pull for the zoom box (only called while it glides). Distance = box centre to the screen's centre line,
        // zone = centerZone * the smaller of the left / right and top / bottom wall zones, own pull strength, speed limit + taper. It never passes the line: if a step would
        // cross it, the box is put exactly ON the line before it is drawn. Returns true if the box is in the zone.
        function boxCenterPull(dt, speed) {
            const w = stage.clientWidth, h = stage.clientHeight;
            const zone = COVER.centerZone * Math.min(COVER.wallZone * COVER.wallZoneLR * w,    // the smaller of the left / right zone
                                                     COVER.wallZone * COVER.wallZoneTB * h);   // and the top / bottom zone
            if (!(zone > 0)) return false;
            const bw = ui.offsetWidth;
            const mid = (w - bw) / 2;                                   // bx that puts the box's centre on the line
            const off = bx - mid;                                       // < 0: box is left of the line, > 0: right of it
            const d = Math.abs(off);
            if (d <= 0.01 || d >= zone) return false;
            if (speed < COVER.centerMaxSpeed) {
                const step = COVER.centerPull * (1 - d / zone) * dt * 60 * taperFade(speed, COVER.centerMaxSpeed, COVER.centerTaper);
                const nx = bx - Math.sign(off) * step;                  // towards the line
                bx = (nx - mid) * off <= 0 ? mid : nx;                  // passed (or reached) it: put it on the line
                layoutBox();
            }
            return true;
        }

        coverView = {
            tick(dt) {
                let moved = false;
                if (z !== tz) {
                    let nz = z + (tz - z) * (1 - Math.exp(-dt * COVER.zoomSpeed));
                    if (Math.abs(nz - tz) < tz * 0.0004) nz = tz;
                    zoomAt(nz, ax, ay);
                    moved = true;
                }
                if (panX || panY) {
                    // scrolling: travel a fraction of what is left every frame (fast first, then settles)
                    const k = 1 - Math.exp(-dt * COVER.panSpeed);
                    const sx = Math.abs(panX) < 0.1 ? panX : panX * k;
                    const sy = Math.abs(panY) < 0.1 ? panY : panY * k;
                    const px = x, py = y;
                    x += sx; y += sy;
                    clampPan();
                    panX -= sx; panY -= sy;
                    if (Math.abs(x - px - sx) > 0.01) panX = 0;      // ran into an edge: nothing left to travel
                    if (Math.abs(y - py - sy) > 0.01) panY = 0;
                    if (x !== px || y !== py) moved = true;
                }
                // arrow keys: add velocity every frame for as long as they are held (opposite keys cancel out)
                if (ptrs.size === 0 && pageState === 'page') {
                    const kx = (arrows.ArrowLeft ? 1 : 0) - (arrows.ArrowRight ? 1 : 0);
                    const ky = (arrows.ArrowUp ? 1 : 0) - (arrows.ArrowDown ? 1 : 0);
                    if (kx || ky) {
                        if (reduceMotion) {
                            // no gliding allowed: move at a steady speed instead (the same top speed the glide would reach)
                            x += kx * COVER.arrowSpeed / COVER.glideFriction * dt;
                            y += ky * COVER.arrowSpeed / COVER.glideFriction * dt;
                            clampPan();
                            moved = true;
                        } else {
                            vx += kx * COVER.arrowSpeed * dt;
                            vy += ky * COVER.arrowSpeed * dt;
                            const sp = Math.hypot(vx, vy);
                            if (sp > COVER.glideMax) { vx *= COVER.glideMax / sp; vy *= COVER.glideMax / sp; }
                        }
                    }
                }
                // glide after a drag: speed fades exponentially (air resistance), and stops against an edge
                if ((vx || vy) && ptrs.size === 0) {
                    const px = x, py = y;
                    const tx = x + vx * dt, ty = y + vy * dt;
                    x = tx; y = ty;
                    clampPan();
                    if (x !== tx) vx = 0;                           // hit an edge: that direction is done
                    if (y !== ty) vy = 0;
                    const f = Math.exp(-COVER.glideFriction * dt);
                    vx *= f; vy *= f;
                    if (Math.hypot(vx, vy) < COVER.glideMin) vx = vy = 0;
                    if (x !== px || y !== py) moved = true;
                }
                if (boxGlide && !boxDrag) {
                    if (bvx || bvy) {
                        const tx = bx + bvx * dt, ty = by + bvy * dt;
                        bx = tx; by = ty;
                        layoutBox();
                        if (bx !== tx) bvx = 0;
                        if (by !== ty) bvy = 0;
                        const f = Math.exp(-COVER.boxFriction * dt);
                        bvx *= f; bvy *= f;
                        if (Math.hypot(bvx, bvy) < COVER.glideMin) bvx = bvy = 0;
                    }
                    // the loop keeps going until the glide has worn out AND the box is no longer in a wall zone
                    const speed = Math.hypot(bvx, bvy);                 // glide speed only, the pulls' own movement isn't counted
                    const inWall = boxWallPull(dt, speed);
                    const inCenter = boxCenterPull(dt, speed);
                    if (!bvx && !bvy && !inWall && !inCenter) boxGlide = false;
                }
                if (moved) render();
            },
            destroy() {
                ro.disconnect();
                document.removeEventListener('keydown', onKey);
                document.removeEventListener('keydown', onArrowDown);
                document.removeEventListener('keyup', onArrowUp);
                window.removeEventListener('blur', clearArrows);
                window.removeEventListener('pointermove', boxMove);
                window.removeEventListener('pointerup', boxUp);
                window.removeEventListener('pointercancel', boxCancel);
            },
        };
        return stage;
    }

    function stopCover() {
        if (coverView) { coverView.destroy(); coverView = null; }
    }

    // Smooth scrolling for the LISTEN page only: the popup (overlay) is the scroll container. Other pages
    // are left alone so they can scroll however they like. Its data-lenis-prevent is lifted meanwhile
    // (that attribute makes Lenis ignore wheel events inside it).
    function startListenScroll(root) {
        overlay.classList.add('no-scrollbar');
        if (!window.Lenis || reduceMotion) return;                 // native scrolling, just without the bar
        overlay.removeAttribute('data-lenis-prevent');
        pageLenis = new Lenis({ ...LENIS, wrapper: overlay, content: root });
    }

    function stopListenScroll() {
        if (pageLenis) { pageLenis.destroy(); pageLenis = null; }
        overlay.setAttribute('data-lenis-prevent', '');
        overlay.classList.remove('no-scrollbar');
    }

    // replace the page content with the page for a tab (cover: zoomable cover, listen: platforms, any other tab: <album>/<tab>.html in an iframe)
    function loadTab(tab) {
        stopListenScroll();
        stopCover();
        stopFrame();
        pageContent.textContent = '';
        pruneFade();
        overlay.scrollTop = 0;
        if (tab === 'listen') startListenScroll(showListen(currentKey));
        else if (tab === 'cover' && currentAlbum) showCover(currentAlbum);
        else showFrame(currentKey, tab);
        hoverDirty = true;
    }

    /* ---- open / menu / close ---- */
    // menu layers (options + background) and the page blur snap back to their closed state, no animation.
    // The caller removes .no-fade again after a reflow.
    function hideMenuLayers() {
        menuPopup.classList.add('no-fade');
        menuBackdrop.classList.add('no-fade');
        overlay.classList.remove('menu-open');
        menuPopup.setAttribute('aria-hidden', 'true');
    }

    function openPage(album) {
        if (pageState !== 'closed') return;
        pageState = 'page';
        busy = false;

        // snap to the top, then lock page scrolling
        if (lenis) lenis.scrollTo(0, { immediate: true, force: true });
        window.scrollTo(0, 0);
        if (lenis) lenis.stop();
        htmlEl.classList.add('page-open');

        currentAlbum = album;
        currentKey = album.dataset.album || album.id.replace(/^album-/, '');
        loadTab(buildMenu(currentKey));

        // no menu layers left over from a quick close: blur back to 0, menu background back to 0%
        hideMenuLayers();
        void menuPopup.offsetWidth;
        menuPopup.classList.remove('no-fade');
        menuBackdrop.classList.remove('no-fade');

        overlay.classList.remove('no-fade');
        overlay.classList.add('open');
        overlay.setAttribute('aria-hidden', 'false');

        // back to the menu icon (no animation), and reset the hover states
        tween = null;
        iconP = 0;
        iconExpand = 0;
        renderIcon();
        closeBtn.setAttribute('aria-label', 'Menu');
        closeBtn.setAttribute('aria-expanded', 'false');

        // snap the X back to its original rotation (no transition) and reset the hover state
        closeSvg.style.transition = 'none';
        closeSvg.style.rotate = '';
        clearTimeout(rotTimer);
        pointerInside = false;
        rotWant = rotOn = rotLocked = false;
        expandWant = false;
        closeBtn.classList.remove('rot');
        void closeSvg.getBoundingClientRect();
        closeSvg.style.transition = '';

        closeBtn.classList.add('show');
        void closeBtn.getBoundingClientRect();      // flush styles so the draw-in transition runs
        closeSvg.classList.add('active');
        closeBtn.focus({ preventScroll: true });
        hoverDirty = true;
    }

    // menu icon pressed: the menu animates in over 0.5s (menu background 0 -> 80%, page blur 0 -> 5px,
    // options fade in) while the icon morphs into the X
    function openMenu() {
        if (pageState !== 'page' || busy) return;
        pageState = 'menu';
        busy = true;
        menuStart = performance.now();
        overlay.classList.add('menu-open');
        menuPopup.setAttribute('aria-hidden', 'false');
        closeBtn.setAttribute('aria-label', 'Close');
        closeBtn.setAttribute('aria-expanded', 'true');
        startMorph(1, () => { busy = false; syncHover(); });
        syncHover();
        hoverDirty = true;
    }

    // click on the background / the selected option: the menu animation plays in reverse (0.5s)
    function closeMenu() {
        if (pageState !== 'menu') return;
        pageState = 'page';
        busy = true;
        overlay.classList.remove('menu-open');
        menuPopup.setAttribute('aria-hidden', 'true');
        closeBtn.setAttribute('aria-label', 'Menu');
        closeBtn.setAttribute('aria-expanded', 'false');
        closeBtn.focus({ preventScroll: true });
        startMorph(0, () => { busy = false; syncHover(); });
        syncHover();
        hoverDirty = true;
    }

    // another option picked: the page content is swapped for the new one, then the menu closes with
    // the same 0.5s reverse animation as a click on the background
    function selectMenuOption(link) {
        if (pageState !== 'menu') return;
        menuLinks.forEach((l) => {
            const on = l === link;
            l.classList.toggle('current', on);
            if (on) l.setAttribute('aria-current', 'page'); else l.removeAttribute('aria-current');
        });
        loadTab(link.dataset.tab);
        closeMenu();
    }

    function closePage() {
        if (pageState === 'closed') return;
        // the X can be pressed 0.2s after the menu started opening; the menu icon can't be pressed while it morphs back
        if (pageState === 'menu' ? performance.now() - menuStart < X_READY_MS : busy) return;
        pageState = 'closed';

        // mouse on the X: let it keep rotating to the hovered position. Otherwise freeze it where it is.
        // Either way it can't spin back while fading (inline style beats the .rot class).
        closeSvg.style.rotate = rotWant ? '90deg' : getComputedStyle(closeSvg).rotate;

        closeSvg.classList.remove('active');        // plays the draw animation in reverse
        closeBtn.classList.remove('show');          // 0.9s opacity fade

        // page content, menu options and menu background vanish instantly (none of them has a transition
        // once the overlay isn't .open / .menu-open); only the shared black background fades out (0.5s).
        // The overlay has pointer-events: none straight away, so the homepage stays usable meanwhile.
        hideMenuLayers();
        stopListenScroll();
        stopCover();
        stopFrame();
        overlay.classList.remove('no-fade');
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');

        // homepage scrolls again right away
        htmlEl.classList.remove('page-open');
        if (lenis) lenis.start();
        syncHover();
        hoverDirty = true;
    }

    document.addEventListener('click', (e) => {
        if (!(e.target instanceof Element)) return;
        const album = e.target.closest('.album');
        if (!album || album.closest('#page-overlay')) return;   // LISTEN cards just follow their link
        e.preventDefault();                         // the href stays in the HTML for later, but isn't followed
        openPage(album);
    });
    closeBtn.addEventListener('click', () => {
        if (pageState === 'page' && !busy) openMenu();
        else if (pageState === 'menu') closePage();
    });
    // while the menu is open: another option loads that page, ANYTHING else (background, the selected option) closes the menu
    overlay.addEventListener('click', (e) => {
        if (pageState !== 'menu' || !(e.target instanceof Element)) return;
        const link = e.target.closest('.menu-link:not(.current)');
        if (link) selectMenuOption(link);
        else closeMenu();
    });
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePage(); });

    overlay.addEventListener('scroll', () => { hoverDirty = true; }, { passive: true });

    renderIcon();

    /* ================================================================
   PROGRESSIVE COVERS
   64px (in the HTML) -> 256px -> full size.
   Each upgrade is loaded + decoded off-screen first, and only swapped
   into the <img> once it's ready, so you never see a blank or a reload.
   A stage only starts once every image has finished the previous one.
   If a file is missing/fails, that image just keeps its current version.
================================================================ */
    const coverImgs = Array.from(document.querySelectorAll('.cover img[data-full]'));

    const variantUrl = (img, suffix) => {
        const full = img.dataset.full;
        return suffix ? full.replace(/\.(\w+)$/, suffix + '.$1') : full;
    };

    // Resolves once an <img> already on the page has loaded (or failed)
    const imgSettled = (img) => new Promise((resolve) => {
        if (img.complete) return resolve();
        img.addEventListener('load', resolve, { once: true });
        img.addEventListener('error', resolve, { once: true });
    });

    // Loads a URL in the background and resolves true when it's loaded and decoded
    const preload = (url) => new Promise((resolve) => {
        const im = new Image();
        im.onload = () => {
            (im.decode ? im.decode() : Promise.resolve()).catch(() => { }).then(() => resolve(true));
        };
        im.onerror = () => resolve(false);
        im.src = url;
    });

    // Upgrade every cover to a new version; swap each one in as soon as ITS file is ready,
    // resolve when all of them are done.
    const upgradeAll = (suffix) => Promise.all(coverImgs.map(async (img) => {
        const url = variantUrl(img, suffix);
        if (await preload(url)) img.src = url;
    }));

    (async () => {
        await Promise.all(coverImgs.map(imgSettled));   // 1. all 64px loaded
        await upgradeAll('256');                        // 2. background-load 256px, swap each in
        await upgradeAll('');                           // 3. then the full-size originals
    })();
})();