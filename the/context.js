/* ==================================================================
   context.js: everything the context page does (the/context.html loads this).
   page.js is shared by every page and has nothing of this in it.

   HOW IT WORKS
   There is one number, `pos`. It is the scroll distance divided by CONFIG.pxPerUnit, a fixed amount of pixels:
   scrolled 0 px = 0, scrolled 400 px = 1, 800 px = 2... The screen's height / width / aspect ratio are never
   part of it, so the story always takes the same amount of scrolling, on any screen.
   Everything on the page is then a function of that number: where the picture is, how visible each line is, how
   far the background has faded. Nothing is animated by time.

   Everything below is in those units (1 unit = pxPerUnit px of scrolling).

   1. CONFIG  : the settings
   2. ENGINE  : you shouldn't need to touch it
================================================================== */

/* ------------------------------------------------------------------
   1. CONFIG
------------------------------------------------------------------ */
const CONFIG = {
    // The picture (vertical). It lives in the the/ folder: vaca-bg.jpg (.jpeg, .png, .webp also work, tried in that order)
    image: { name: 'vaca-bg', exts: ['jpg', 'jpeg', 'png', 'webp'] },

    // Film grain on top of the picture (under the text). It fades out with the background.
    // The pattern is the same random-per-pixel noise as fog.js, but re-rolled fps times a second.
    grain: {
        on: true,
        style: 'both',   // 'both' = grain lightens and darkens (film look). 'dark' = only darkens (what fog.js does)
        amount: 0.05,    // strength, 0 to 1
        size: 1,         // size of one grain in screen px. Bigger = coarser (and cheaper)
        fps: 24,         // how many times a second the grain changes. 0 = still
    },

    // THE speed setting: how many px of scrolling make `pos` go up by 1. Lower = the story goes faster.
    pxPerUnit: 400,

    // Where the scrolling ends: pos goes from 0 to this.
    length: 18.8,

    // The square window sliding from the top of the picture to the bottom, between these two pos values.
    // before "from" it sits at the top, after "to" it stays at the bottom. It keeps moving during the fade out.
    pan: { from: 0, to: 18.8, ease: 'linear' },

    // After the story: the background fades to black between these two pos values.
    // text: true makes the lines fade away with it. false = they stay.
    // (a line with data-sync="fadeOut" comes in exactly during this fade)
    fadeOut: { from: 17.6, to: 18.8, ease: 'linear', text: false },

    // Defaults for every line. Each can be overridden on the line itself with data-anim, data-ease, data-len,
    // data-hold, data-out (see the story in context.html).
    line: {
        anim: 'fade',    // fade, rise, drop, left, right, blur, zoom, wipe, words, type, riseup, slide, fall, drift  (defined in context.html)
        ease: 'out',     // linear, in, out, inOut
        len: 0.3,        // how much scrolling a line takes to come in

        // When a line leaves, and how long that takes.
        // hold 'next' (default): it starts leaving exactly when the next line starts coming in, and takes as long as
        //                        that line takes to come in. So one fades out while the next fades in: never an empty
        //                        moment between two lines. The last line has no next, so it stays.
        // hold a number: it stays fully visible that long after it has come in, then leaves. 'stay' = never leaves.
        // out  'next' (default): as above. A number: leaves over that much scrolling.
        hold: 'next',
        out: 'next',

        gap: 1.1,        // a line with no data-at comes in this long after the one before it
    },

    // Lines with data-mode="trigger" don't follow the scroll: they switch on at their data-at and off when the next
    // line starts (or at data-until), and fade by TIME, this many seconds, whatever you do with the scroll.
    // data-fade="0.5" changes it for one line, data-fade-out="0" is only for when it leaves because the next line started.
    trigger: { fade: 0.8 },

    // Scroll feel for this page only, on top of the site's settings (see LENIS in script.js).
    // wheelMultiplier 1 = the mouse wheel moves twice as far as on the homepage. {} = same as the homepage.
    lenis: { wheelMultiplier: 1 },

    // Shows a readout of `pos` in the corner. Pressing D on the page toggles it too.
    debug: false,
};

window.PAGE = { lenis: CONFIG.lenis };      // read by page.js when it starts the smooth scroll (needs to be set early)

/* ------------------------------------------------------------------
   2. ENGINE
------------------------------------------------------------------ */
(() => {
    'use strict';

    // page.js marks the page as "embedded" when the site opened it. Opened any other way it is about to be replaced
    // by the 404 page, so there is nothing to start.
    if (!document.documentElement.classList.contains('embedded')) return;

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
    else start();

    function start() {
        const EASES = {
            linear: (t) => t,
            in: (t) => t * t * t,
            out: (t) => 1 - Math.pow(1 - t, 3),
            inOut: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
        };
        const ease = (name, t) => (EASES[name] || EASES.linear)(t);
        const clamp01 = (v) => Math.min(Math.max(v, 0), 1);
        const range = (pos, from, to) => (to > from ? clamp01((pos - from) / (to - from)) : (pos >= to ? 1 : 0));

        const bg = document.getElementById('bg');
        const photo = document.getElementById('photo');
        const stage = document.getElementById('stage');
        const track = document.getElementById('track');
        const hud = document.getElementById('hud');
        const veilEl = document.getElementById('veil');

        /* ---- the picture: first of name.jpg / .jpeg / ... that loads ---- */
        const urls = CONFIG.image.exts.map((ext) => `${CONFIG.image.name}.${ext}`);
        let tries = 0;
        photo.onload = () => {
            // how far the picture can slide: its height minus the square's, as a share of its own height
            const maxShift = Math.max(0, 1 - photo.naturalWidth / photo.naturalHeight);
            photo.style.setProperty('--max-shift', (maxShift * 100) + '%');
            photo.classList.add('ready');
        };
        photo.onerror = () => {
            if (++tries < urls.length) photo.src = urls[tries];
            else console.warn('context: no picture found. Add the/' + urls[0] + ' (or .jpeg / .png / .webp).');
        };
        photo.src = urls[0];

        /* ---- the lines ---- */
        const L = CONFIG.line;
        const num = (el, key, fallback) => {
            const v = parseFloat(el.dataset[key]);
            return Number.isFinite(v) ? v : fallback;
        };

        let prevAt = -L.gap;
        const lines = Array.from(stage.querySelectorAll('.line')).map((el) => {
            const sync = el.dataset.sync === 'fadeOut';
            const at = sync ? CONFIG.fadeOut.from : num(el, 'at', prevAt + L.gap);
            const len = sync ? CONFIG.fadeOut.to - CONFIG.fadeOut.from : num(el, 'len', L.len);
            prevAt = at;
            const anim = el.dataset.anim || L.anim;
            el.dataset.anim = anim;
            if (anim === 'words' || anim === 'type') split(el, anim);
            const mode = el.dataset.mode || 'scroll';
            if (mode === 'trigger') {
                el.style.setProperty('--fade', num(el, 'fade', CONFIG.trigger.fade) + 's');
                if (el.dataset.fadeOut !== undefined) el.style.setProperty('--fade-out', num(el, 'fadeOut', CONFIG.trigger.fade) + 's');
            }
            return {
                el, at, len, mode,
                veil: num(el, 'veil', 0),                    // data-veil="0.2": a black cover at 20% comes with this line
                until: el.dataset.until !== undefined ? num(el, 'until', Infinity) : null,
                on: false,
                hold: el.dataset.hold !== undefined ? el.dataset.hold : L.hold,
                out: el.dataset.out !== undefined ? el.dataset.out : L.out,
                ease: el.dataset.ease || L.ease,
                outAt: Infinity, outLen: 0, outEase: null,  // worked out below, once every line's start is known
                p: -1, pin: -1, pout: -1,
            };
        });

        // when does each line leave? (needs to know the next line, so this is a second pass)
        lines.forEach((l, i) => {
            const next = lines[i + 1];
            if (l.mode === 'trigger' && l.until === null) l.until = next ? next.at : Infinity;
            if (l.hold === 'stay') l.outAt = Infinity;
            else if (l.hold === 'next') l.outAt = next ? next.at : Infinity;
            else l.outAt = l.at + l.len + (parseFloat(l.hold) || 0);

            if (l.out === 'next') l.outLen = next ? next.len : L.len;
            else l.outLen = parseFloat(l.out) || 0;

            // leaving with the next line's own timing (same window, same curve) means the two always add up to
            // exactly 1: one is as much out as the other is in, so the text never dips (or doubles up) in between
            l.outEase = (l.hold === 'next' && l.out === 'next' && next) ? next.ease : l.ease;
        });

        // words: every word is one .u. type: every letter is one .u, kept together in a .word so lines still wrap
        function split(el, mode) {
            const words = el.textContent.trim().split(/\s+/);
            el.textContent = '';
            const total = mode === 'words' ? words.length : words.join('').length;
            let i = 0;
            const unit = (text) => {
                const u = document.createElement('span');
                u.className = 'u';
                u.style.setProperty('--i', i++);
                u.style.setProperty('--n', total);
                u.textContent = text;
                return u;
            };
            words.forEach((w, wi) => {
                if (wi) el.appendChild(document.createTextNode(' '));
                if (mode === 'words') { el.appendChild(unit(w)); return; }
                const holder = document.createElement('span');
                holder.className = 'word';
                for (const ch of w) holder.appendChild(unit(ch));
                el.appendChild(holder);
            });
        }

        /* ---- pos -> everything ---- */
        let lastPan = -1, lastFade = -1, lastVeil = -1;

        function render() {
            const pos = window.scrollY / CONFIG.pxPerUnit;

            const pan = ease(CONFIG.pan.ease, range(pos, CONFIG.pan.from, CONFIG.pan.to));
            if (pan !== lastPan) { lastPan = pan; bg.style.setProperty('--pan', pan); }

            const fade = 1 - ease(CONFIG.fadeOut.ease, range(pos, CONFIG.fadeOut.from, CONFIG.fadeOut.to));
            if (fade !== lastFade) {
                lastFade = fade;
                bg.style.setProperty('--bg-o', fade);
                if (CONFIG.fadeOut.text) stage.style.opacity = fade;
            }

            let veil = 0;
            for (const l of lines) {
                if (l.mode === 'trigger') {
                    const on = pos >= l.at && pos < l.until;
                    if (on !== l.on) {
                        l.on = on;
                        // leaving because the next line started (not because you scrolled back) can have its own speed
                        l.el.dataset.leave = (!on && pos >= l.until) ? 'next' : 'back';
                        l.el.classList.toggle('shown', on);
                    }
                    continue;
                }
                const pin = ease(l.ease, range(pos, l.at, l.at + l.len));
                const pout = l.outAt === Infinity ? 0 : ease(l.outEase, range(pos, l.outAt, l.outAt + l.outLen));
                const p = Math.min(pin, 1 - pout);
                if (pin !== l.pin) { l.pin = pin; l.el.style.setProperty('--pin', pin); }
                if (pout !== l.pout) { l.pout = pout; l.el.style.setProperty('--pout', pout); }
                if (p !== l.p) {
                    l.p = p;
                    l.el.style.setProperty('--p', p);
                    l.el.classList.toggle('off', p <= 0.001);      // not showing: hidden, so no invisible links
                    l.el.classList.toggle('live', p > 0.3);        // showing enough to click its links
                }
                if (l.veil) veil = Math.max(veil, p * l.veil);
            }
            if (veil !== lastVeil) { lastVeil = veil; veilEl.style.opacity = veil; }

            if (hud.classList.contains('on')) {
                hud.textContent = `pos ${pos.toFixed(2)} / ${CONFIG.length.toFixed(2)}`;
            }
        }

        // the page is exactly as tall as it takes to scroll pos from 0 to CONFIG.length (plus the one screen
        // the browser always shows), whatever the screen
        function size() {
            track.style.height = (CONFIG.length * CONFIG.pxPerUnit + window.innerHeight) + 'px';
            render();
        }

        /* ---- grain: one random value per cell, re-rolled CONFIG.grain.fps times a second ---- */
        const G = CONFIG.grain;
        const grainEl = document.getElementById('grain');

        function startGrain() {
            if (!G.on) { grainEl.remove(); return; }
            const gl = grainEl.getContext('webgl', { antialias: false, premultipliedAlpha: true });
            if (!gl) { grainEl.remove(); console.warn('context: WebGL unavailable, no grain.'); return; }

            const vertexSrc = 'attribute vec2 a_position; void main() { gl_Position = vec4(a_position, 0.0, 1.0); }';
            const fragmentSrc = `
                precision highp float;
                uniform float u_seed;
                uniform float u_amount;
                uniform float u_both;
                float random(vec2 p) {                                  // same hash as fog.js
                    vec3 p3 = fract(vec3(p.xyx) * 0.1031);
                    p3 += dot(p3, p3.yzx + 33.33);
                    return fract((p3.x + p3.y) * p3.z);
                }
                void main() {
                    float n = random(floor(gl_FragCoord.xy) + vec2(u_seed * 37.0, u_seed * 91.0));
                    float a = u_amount;
                    // premultiplied: 'both' = grey of brightness n at strength a, 'dark' = black at strength n * a
                    gl_FragColor = u_both > 0.5 ? vec4(vec3(n * a), a) : vec4(0.0, 0.0, 0.0, n * a);
                }`;
            const compile = (type, src) => {
                const sh = gl.createShader(type);
                gl.shaderSource(sh, src);
                gl.compileShader(sh);
                if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) console.error(gl.getShaderInfoLog(sh));
                return sh;
            };
            const program = gl.createProgram();
            gl.attachShader(program, compile(gl.VERTEX_SHADER, vertexSrc));
            gl.attachShader(program, compile(gl.FRAGMENT_SHADER, fragmentSrc));
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                console.error(gl.getProgramInfoLog(program));
                grainEl.remove();
                return;
            }
            gl.useProgram(program);

            gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);   // one big triangle
            const pos = gl.getAttribLocation(program, 'a_position');
            gl.enableVertexAttribArray(pos);
            gl.vertexAttribPointer(pos, 2, gl.FLOAT, false, 0, 0);

            const seed = gl.getUniformLocation(program, 'u_seed');
            gl.uniform1f(gl.getUniformLocation(program, 'u_amount'), G.amount);
            gl.uniform1f(gl.getUniformLocation(program, 'u_both'), G.style === 'dark' ? 0 : 1);

            function draw() {
                gl.uniform1f(seed, Math.random() * 100);
                gl.drawArrays(gl.TRIANGLES, 0, 3);
            }

            function fit() {
                grainEl.width = Math.max(1, Math.ceil(window.innerWidth / G.size));
                grainEl.height = Math.max(1, Math.ceil(window.innerHeight / G.size));
                gl.viewport(0, 0, grainEl.width, grainEl.height);
                draw();
            }
            fit();
            window.addEventListener('resize', fit);

            const still = G.fps <= 0 || window.matchMedia('(prefers-reduced-motion: reduce)').matches;
            if (still) return;
            let last = 0;
            const frame = (now) => {
                // no point drawing once the background has faded out
                if (now - last >= 1000 / G.fps && lastFade > 0.001) { last = now; draw(); }
                requestAnimationFrame(frame);
            };
            requestAnimationFrame(frame);
        }

        window.addEventListener('scroll', render, { passive: true });
        window.addEventListener('resize', size);
        window.addEventListener('keydown', (e) => {
            if (e.key === 'd' && !e.ctrlKey && !e.metaKey && !e.altKey) { hud.classList.toggle('on'); render(); }
        });
        if (CONFIG.debug) hud.classList.add('on');
        size();
        startGrain();
    }
})();