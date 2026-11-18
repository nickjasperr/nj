(() => {
    'use strict';

    /* ================================================================
       ALBUM DATA
       One entry per album, keyed by the album's id in index.html without the "album-" part
       (id="album-the" -> the). Every album gets a menu made of its tabs + the required LISTEN tab.
         tabs     menu options, in order (LISTEN is always added at the end)
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
            tabs: ['context', 'samples'],
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
                        link: 'https://youtube.com/watch?v=95Vt00onysI&list=PLJrzrdM2WSXKXzhorP7A3yFC8lXLPzHgE',
                    },
                ],
            },
        },
        interlude: {
            tabs: ['context', 'samples'],
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
            tabs: ['context', 'samples'],
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
        lerp: {
            multiplierPlus: 18,   // speed when growing  (per second)
            multiplierMinus: 18,  // speed when shrinking (per second)
            minDistance: 0.05,    // stop updating when this close to the target
            maxSpeed: 600,        // max change per second (px/s)
        },
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
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (window.Lenis && !reduceMotion) {
        lenis = new Lenis(LENIS);
    }

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
        const el = document.elementFromPoint(mouseX, mouseY);
        hovered = el ? el.closest('a, button, [data-clickable]') : null;
    }

    if (finePointer) {
        renderCursor();

        // Position is written straight inside the event handler: no smoothing, no rAF wait.
        window.addEventListener('pointermove', (e) => {
            if (e.pointerType === 'touch') return;
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
        const fitted = catItems.map((c) => {
            const h = Math.max(0, ...c.albums.map(albumHeight));
            return { c, size: c.chars && h ? h / (c.chars * CHAR_W) : 0 };   // monospace: length = chars * 0.612em
        });
        const titleW = Math.max(0, ...fitted.map((f) => f.size));            // line-height is 1, so width = font size
        const side = categories.clientWidth >= probe.offsetWidth + titleW;
        discography.dataset.layout = side ? 'side' : 'stack';
        for (const f of fitted) {
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
        for (const c of carousels) if (c.inner) c.inner.raf(now);

        if (hoverDirty && visible) {
            hoverDirty = false;
            updateHover();
        }

        // cursor radius
        if (finePointer) {
            const desired = pressed ? CURSOR.pressRadius
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
    // menu options of the opened album: its tabs, then LISTEN
    function buildMenu(key) {
        const tabs = ((ALBUMS[key] && ALBUMS[key].tabs) || []).map((t) => String(t).toLowerCase()).filter((t) => t !== 'listen');
        tabs.push('listen');
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
            icon.onload = () => { title.prepend(icon); fitListenTitles(); };
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

        // titles are as wide as one card (same as the homepage's stacked layout); cards stretch with the
        // window, so re-fit whenever the list changes size
        listenRO = new ResizeObserver(fitListenTitles);
        listenRO.observe(root);
        fitListenTitles();
        return root;
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

    // font size so that [icon + gap + title text] is exactly one album card wide. Everything is measured
    // (all of it scales with the font size), so it works for any icon shape, png or svg.
    let listenRO = null;
    function fitListenTitles() {
        for (const cat of pageContent.querySelectorAll('.listen-cat')) {
            const title = cat.querySelector('.listen-title');
            const card = cat.querySelector('.album');
            const label = title.querySelector('span');
            if (!card || !label) continue;
            const cs = getComputedStyle(title);
            const fs = parseFloat(cs.fontSize);
            const icon = title.querySelector('img');
            const total = label.offsetWidth + (icon ? icon.offsetWidth + (parseFloat(cs.columnGap) || 0) : 0);
            if (total && fs) title.style.fontSize = Math.floor(card.offsetWidth * fs / total) + 'px';
        }
    }

    // replace the page content with the page for a tab (context / samples: the cover for now)
    function loadTab(tab) {
        if (listenRO) { listenRO.disconnect(); listenRO = null; }
        stopListenScroll();
        pageContent.textContent = '';
        pruneFade();
        overlay.scrollTop = 0;
        if (tab === 'listen') startListenScroll(showListen(currentKey));
        else if (currentAlbum) showTestContent(currentAlbum);
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