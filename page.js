/* ==================================================================
   page.js: shared by every album sub-page (the/context.html, the/samples.html, ...)

   Put this in the <head> of each page, before anything else that shows:
       <script src="../page.js"></script>

   Two jobs:

   1. DIRECT VISITS GET A 404.
      The site opens these pages itself: script.js fetches the file and puts it in an iframe as
      srcdoc, so inside the site the page's address is "about:srcdoc". If the page is opened any
      other way (typed address, link, search result, someone else's iframe) it is not, and this
      script swaps the page for the host's own 404 page. The address bar keeps the page's URL, so
      it looks like that URL simply doesn't exist. If the 404 page can't be fetched it redirects
      to the homepage instead.

      This is a front-door check, not security: the file is still public, so anyone can fetch it
      or read its source on purpose. It only stops normal visitors from landing on it.

   2. INSIDE THE SITE, BEHAVE LIKE THE SITE.
      An iframe is its own document, so the homepage's custom cursor, Escape key and smooth
      scroll would stop at its edge. This script passes pointer + key events up to the site
      and starts the same Lenis scroll (same settings, read from script.js via window.SITE).
================================================================== */
(() => {
    'use strict';

    const script = document.currentScript;
    const root = new URL('./', script ? script.src : location.href).href;     // site root (page.js lives there)

    let embedded = false;
    try { embedded = window.top !== window && location.href === 'about:srcdoc'; } catch (e) { /* cross-origin parent: not us */ }

    if (!embedded) {
        blockDirectVisit();
        return;
    }

    /* ---------------------------------------------------------------
       1. direct visit -> 404
    --------------------------------------------------------------- */
    function blockDirectVisit() {
        document.documentElement.style.visibility = 'hidden';                // no flash of the page while this runs

        // any address that doesn't exist makes the host answer with its own 404 page
        const missing = new URL('404-' + Date.now().toString(36), root);
        fetch(missing, { cache: 'no-store' })
            .then((res) => (res.status === 404 ? res.text() : Promise.reject(new Error('not a 404'))))
            .then((html) => {
                document.open();
                document.write(html);
                document.close();
            })
            .catch(() => location.replace(root));
    }

    /* ---------------------------------------------------------------
       2. inside the site
    --------------------------------------------------------------- */
    const site = window.parent;
    document.documentElement.classList.add('embedded');

    try {
        // --- cursor + keys: re-fire them on the site's window, its own listeners do the rest ---
        let lastMove = null;
        const sendPointer = (e) => {
            site.dispatchEvent(new site.PointerEvent(e.type, {
                bubbles: true,
                clientX: e.clientX, clientY: e.clientY,
                pointerType: e.pointerType, pointerId: e.pointerId, isPrimary: e.isPrimary,
                button: e.button, buttons: e.buttons,
                altKey: e.altKey, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey,
            }));
        };
        for (const type of ['pointermove', 'pointerdown', 'pointerup', 'pointercancel']) {
            window.addEventListener(type, (e) => {
                if (type === 'pointermove') lastMove = e;
                sendPointer(e);
            }, { passive: true });
        }
        // the page scrolled under a still mouse: tell the site to re-check what is under the cursor
        window.addEventListener('scroll', () => { if (lastMove) sendPointer(lastMove); }, { passive: true });

        // pointer left the window through the iframe: hide the cursor (leaving onto the menu button is not "leaving")
        document.documentElement.addEventListener('mouseleave', (e) => {
            const edge = e.clientX <= 0 || e.clientY <= 0 || e.clientX >= innerWidth - 1 || e.clientY >= innerHeight - 1;
            if (edge) site.document.documentElement.dispatchEvent(new site.MouseEvent('mouseleave'));
        });

        // Escape closes the page, ALT + SHIFT is the cursor debug view
        for (const type of ['keydown', 'keyup']) {
            window.addEventListener(type, (e) => {
                site.document.dispatchEvent(new site.KeyboardEvent(type, {
                    bubbles: true, key: e.key, code: e.code, repeat: e.repeat,
                    altKey: e.altKey, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey,
                }));
            });
        }

        // --- smooth scroll: same Lenis (same version, same settings) the site uses ---
        const cfg = site.SITE && site.SITE.LENIS;
        const lenisTag = site.document.querySelector('script[src*="lenis"]');
        if (cfg && lenisTag && site.Lenis && !site.SITE.reduceMotion) {
            const tag = document.createElement('script');
            tag.src = lenisTag.src;
            tag.onload = () => {
                // a page can change the scroll feel for itself: window.PAGE = { lenis: { wheelMultiplier: 1 } }
                const lenis = new window.Lenis({ ...cfg, ...((window.PAGE && window.PAGE.lenis) || {}) });
                const raf = (t) => { lenis.raf(t); requestAnimationFrame(raf); };
                requestAnimationFrame(raf);
            };
            document.head.appendChild(tag);
        }
    } catch (err) {
        // the site couldn't be reached: the page still works, just without the cursor / smooth scroll hookup
        console.warn('page.js: could not connect to the site', err);
    }
})();