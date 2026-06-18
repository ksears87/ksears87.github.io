/* ============================================================================
 * crumple-transition.js  —  newspaper crumple-and-toss page transition
 * Plain vanilla JS. No framework, no build step, no dependencies.
 *
 * It intercepts clicks on internal links, crumples the current page into the
 * exact size + outline of your paper-ball photo, cross-fades to that photo,
 * and chucks it off-screen in a random side direction — revealing the next
 * page underneath. External links, new-tab clicks, downloads, and #anchors
 * are left completely alone.
 *
 * ----------------------------------------------------------------------------
 * INSTALL (2 steps):
 *   1. Drop this file and the /assets folder (ball.png, paper.avif, crumple.mp3)
 *      somewhere in your site.
 *   2. Add ONE line before </body> on every page:
 *
 *        <script src="/crumple-transition.js" data-base="/assets/"></script>
 *
 *      `data-base` is the URL path to the assets folder (default "assets/").
 *
 * That's the simple "reload" mode: it animates, then does a normal navigation.
 *
 * SEAMLESS mode (the next page is already visible behind the ball, no reload):
 *   give it the selector of the element whose contents change between pages —
 *   e.g. if every page wraps its body in <main id="page">…</main>:
 *
 *        <script src="/crumple-transition.js"
 *                data-base="/assets/" data-swap="#page"></script>
 *
 *   In swap mode the next page is fetched and dropped in behind the crumple,
 *   so there's no white flash. (Note: <script> tags inside the swapped region
 *   won't re-run — fine for content pages. Use reload mode if a page boots its
 *   own JS.)
 *
 * Other data-* options:  data-duration="900"  data-sound="off"  data-scale="0.32"
 *
 * Respects prefers-reduced-motion (skips the animation, navigates normally).
 * ==========================================================================*/
(function () {
  'use strict';

  var SCRIPT = document.currentScript;

  var CFG = {
    base: 'assets/',     // path prefix for the asset files
    ball: 'ball.png',
    texture: 'paper.avif',
    sound: 'crumple.mp3',
    duration: 1400,       // ms, full crumple + toss
    contentScale: 0.32,  // how small the page content crushes down inside the ball
    ballW: 84,           // on-screen ball size (px) — keep the 84:74 ratio of the photo
    ballH: 74,
    swap: 'reload',      // 'reload' (normal nav) OR a CSS selector for seamless content swap
    enableSound: true
  };

  /* ---- ball.png outline: 26 angle-samples as px offsets from its centroid
     (natural image 272x239). The crumple ends ON this outline so the swap to
     the photo is seamless — identical size and profile. ---- */
  var BALL = [[127,0],[123.3,30.4],[102.7,53.9],[92.1,81.6],[69.9,101.2],[40.8,107.5],[13.6,112.2],[-13.3,109.2],[-40.4,106.6],[-70.4,102],[-94.3,83.6],[-107.1,56.2],[-119.4,29.4],[-118,0],[-101.9,-25.1],[-116.9,-61.3],[-119.8,-106.1],[-73.3,-106.2],[-46.5,-122.5],[-12.9,-106.2],[6,-49.6],[28,-73.9],[73.3,-106.2],[88.3,-78.2],[125.7,-66],[139.8,-34.5]];
  var IMG_W = 272, IMG_H = 239, CX = -13.1, CY = 5.2; // centroid -> image-center correction

  var lerp = function (a, b, t) { return a + (b - a) * t; };
  var easeInOut = function (t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; };

  var dom = null, crumpleAudio = null, animating = false, fold = null, turbSeed = 0;

  function asset(p) {
    if (/^(https?:)?\/\//.test(p) || p.charAt(0) === '/') return p;
    return CFG.base + p;
  }

  /* ----------------------------------------------------------------- build */
  function build() {
    var NS = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('width', '0'); svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('data-crumple-ui', '');
    svg.style.cssText = 'position:absolute;width:0;height:0';
    svg.innerHTML =
      '<filter id="crumple-warp" x="-25%" y="-25%" width="150%" height="150%" color-interpolation-filters="sRGB">' +
        '<feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="2" seed="0" result="n"></feTurbulence>' +
        '<feDisplacementMap in="SourceGraphic" in2="n" scale="0" xChannelSelector="R" yChannelSelector="G"></feDisplacementMap>' +
      '</filter>';

    var outer = document.createElement('div');
    outer.setAttribute('data-crumple-ui', '');
    outer.style.cssText = 'position:fixed;inset:0;z-index:2147483600;display:none;opacity:0;' +
      'pointer-events:none;overflow:hidden;transform-origin:50% 50%;' +
      'will-change:transform,opacity,clip-path;backface-visibility:hidden';

    var inner = document.createElement('div');
    inner.style.cssText = 'position:absolute;inset:0;overflow:hidden;background:#fff';

    var snap = document.createElement('div');
    snap.style.cssText = 'position:absolute;inset:0;overflow:hidden';

    var tex = document.createElement('div');
    tex.style.cssText = 'position:absolute;inset:0;opacity:0;pointer-events:none;' +
      'mix-blend-mode:multiply;background:url("' + asset(CFG.texture) + '") center/cover';

    inner.appendChild(snap); inner.appendChild(tex); outer.appendChild(inner);

    var ball = document.createElement('img');
    ball.src = asset(CFG.ball); ball.alt = '';
    ball.setAttribute('data-crumple-ui', '');
    ball.style.cssText = 'position:fixed;left:50%;top:50%;width:' + CFG.ballW + 'px;height:' + CFG.ballH + 'px;' +
      'margin-left:' + (-CFG.ballW / 2) + 'px;margin-top:' + (-CFG.ballH / 2) + 'px;' +
      'opacity:0;display:none;pointer-events:none;z-index:2147483601;will-change:transform,opacity';

    document.body.appendChild(svg);
    document.body.appendChild(outer);
    document.body.appendChild(ball);

    dom = {
      svg: svg, outer: outer, inner: inner, snap: snap, tex: tex, ball: ball,
      feTurb: svg.querySelector('feTurbulence'),
      feDisp: svg.querySelector('feDisplacementMap')
    };
  }

  /* ------------------------------------------------------------- geometry */
  function genFold() {
    var LW = window.innerWidth, LH = window.innerHeight, sf = CFG.contentScale;
    var kx = CFG.ballW / IMG_W, ky = CFG.ballH / IMG_H, N = BALL.length;
    turbSeed = Math.floor(Math.random() * 40);
    fold = [];
    for (var i = 0; i < N; i++) {
      var th = i / N * 2 * Math.PI, dx = Math.cos(th), dy = Math.sin(th);
      var tx = dx > 0 ? 50 / dx : dx < 0 ? -50 / dx : 1e9;
      var ty = dy > 0 ? 50 / dy : dy < 0 ? -50 / dy : 1e9;
      var t = Math.min(tx, ty);
      var sx = 50 + dx * t, sy = 50 + dy * t;          // start: full-viewport rectangle perimeter
      var jit = 1 + (Math.random() - 0.5) * 0.05;
      var ox = (BALL[i][0] + CX) * kx * jit;            // end: ball outline -> on-screen px offset
      var oy = (BALL[i][1] + CY) * ky * jit;
      var ex = 50 + ox / (LW * sf) * 100;               // solved so scale(sf) lands on the photo
      var ey = 50 + oy / (LH * sf) * 100;
      fold.push({ sx: sx, sy: sy, ex: ex, ey: ey, ph: Math.random() * 0.25 });
    }
  }
  function clipAt(gp) {
    if (!fold) genFold();
    var parts = fold.map(function (pt) {
      var t = (gp - pt.ph) / (1 - pt.ph); t = t < 0 ? 0 : t > 1 ? 1 : t; t = easeInOut(t);
      return (pt.sx + (pt.ex - pt.sx) * t).toFixed(1) + '% ' + (pt.sy + (pt.ey - pt.sy) * t).toFixed(1) + '%';
    });
    return 'polygon(' + parts.join(',') + ')';
  }

  /* ------------------------------------------------------------- snapshot */
  function snapshot() {
    dom.snap.innerHTML = '';
    var bg = getComputedStyle(document.body).backgroundColor;
    if (!bg || bg === 'rgba(0, 0, 0, 0)' || bg === 'transparent') {
      bg = getComputedStyle(document.documentElement).backgroundColor;
    }
    dom.inner.style.background = bg && bg !== 'rgba(0, 0, 0, 0)' ? bg : '#fff';

    var clone = document.createElement('div');
    clone.className = document.body.className;
    clone.innerHTML = document.body.innerHTML;
    // drop our own overlay nodes out of the clone
    var ui = clone.querySelectorAll('[data-crumple-ui]');
    for (var i = 0; i < ui.length; i++) ui[i].parentNode.removeChild(ui[i]);

    var wrap = document.createElement('div');
    wrap.style.cssText = 'position:absolute;top:0;left:0;width:' + document.documentElement.clientWidth + 'px;' +
      'transform:translate(' + (-window.scrollX) + 'px,' + (-window.scrollY) + 'px)';
    wrap.appendChild(clone);
    dom.snap.appendChild(wrap);
  }

  /* ----------------------------------------------------------------- frame */
  function frame(p, dir, W, H) {
    var cp = Math.min(p / 0.6, 1);
    var gp = Math.min(cp / 0.85, 1), ge = easeInOut(gp);
    var tp = Math.max(0, Math.min((p - 0.6) / 0.4, 1)), te = tp * tp;
    var f = Math.max(0, Math.min((cp - 0.85) / 0.15, 1));
    var sf = CFG.contentScale;

    var pscale = lerp(1, sf, ge), twist = lerp(0, dir * 8, ge);
    dom.outer.style.transform = 'rotate(' + twist.toFixed(2) + 'deg) scale(' + pscale.toFixed(4) + ')';
    dom.outer.style.opacity = (1 - f).toFixed(3);
    dom.outer.style.clipPath = p > 0.002 ? clipAt(gp) : 'none';
    dom.outer.style.webkitClipPath = dom.outer.style.clipPath;
    dom.inner.style.filter = p > 0.002 ? 'url(#crumple-warp)' : 'none';
    dom.tex.style.opacity = (ge * 0.92).toFixed(3);
    dom.feTurb.setAttribute('baseFrequency', lerp(0.012, 0.055, gp).toFixed(4));
    dom.feTurb.setAttribute('seed', turbSeed + Math.floor(gp * 7));
    dom.feDisp.setAttribute('scale', lerp(0, 30, ge).toFixed(1));

    var dx = dir * te * W * 1.9;
    var arc = -0.18 * H * (4 * tp * (1 - tp));
    var drop = te * H * 1.35;
    var dy = arc + drop;
    var spin = dir * te * 560 + lerp(0, dir * 8, ge);
    var bscale = lerp(1, 0.72, tp);
    dom.ball.style.opacity = f.toFixed(3);
    dom.ball.style.transform = 'translate(' + dx.toFixed(1) + 'px,' + dy.toFixed(1) + 'px) rotate(' + spin.toFixed(2) + 'deg) scale(' + bscale.toFixed(4) + ')';
    dom.ball.style.filter = f > 0.02
      ? 'drop-shadow(0 ' + ((6 + te * 14) | 0) + 'px ' + ((12 + te * 24) | 0) + 'px rgba(0,0,0,' + (0.18 + te * 0.14).toFixed(2) + '))'
      : 'none';
  }

  function reset() {
    dom.outer.style.display = 'none';
    dom.outer.style.opacity = '0';
    dom.outer.style.transform = 'none';
    dom.outer.style.clipPath = 'none';
    dom.outer.style.webkitClipPath = 'none';
    dom.inner.style.filter = 'none';
    dom.tex.style.opacity = '0';
    dom.snap.innerHTML = '';
    dom.ball.style.display = 'none';
    dom.ball.style.opacity = '0';
    dom.ball.style.transform = 'none';
    dom.ball.style.filter = 'none';
  }

  /* ------------------------------------------------------------- audio */
  function playCrumple() {
    if (!CFG.enableSound) return;
    if (!crumpleAudio) { crumpleAudio = new Audio(asset(CFG.sound)); crumpleAudio.preload = 'auto'; }
    try { crumpleAudio.currentTime = 0; } catch (e) {}
    crumpleAudio.volume = 0.9;
    var pr = crumpleAudio.play();
    if (pr && pr.catch) pr.catch(function () {});
  }
  function stopCrumple() { if (crumpleAudio) crumpleAudio.pause(); }

  /* ------------------------------------------------------------- swap */
  function loadAndSwap(href) {
    return fetch(href, { credentials: 'same-origin' })
      .then(function (r) { return r.text(); })
      .then(function (html) {
        var doc = new DOMParser().parseFromString(html, 'text/html');
        var src = doc.querySelector(CFG.swap), dst = document.querySelector(CFG.swap);
        if (src && dst) {
          dst.innerHTML = src.innerHTML;
          if (doc.title) document.title = doc.title;
          history.pushState({ crumple: true }, '', href);
          // reveal the swapped-in page at the right spot: honor a #hash target
          // (e.g. an article's "Work History" link -> index.html#work), else top
          var hash = '';
          try { hash = new URL(href, location.href).hash; } catch (e) {}
          var target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
          if (target) target.scrollIntoView();
          else window.scrollTo(0, 0);
          // let shared scripts (nav.js) re-bind behavior tied to the new content
          try { window.dispatchEvent(new CustomEvent('crumple:swapped')); } catch (e) {}
          return true;
        }
        return false;
      })
      .catch(function () { return false; });
  }

  /* ------------------------------------------------------------- run */
  function go(href) {
    if (animating) return;
    animating = true;
    var dir = Math.random() < 0.5 ? -1 : 1;
    genFold();
    snapshot();
    dom.tex.style.backgroundPosition = (Math.random() * 100 | 0) + '% ' + (Math.random() * 100 | 0) + '%';
    dom.outer.style.display = 'block';
    dom.ball.style.display = 'block';
    playCrumple();

    var swapReady = (CFG.swap !== 'reload') ? loadAndSwap(href) : null;

    var W = window.innerWidth, H = window.innerHeight;
    var t0 = performance.now(), stopped = false;
    function step(now) {
      var p = (now - t0) / CFG.duration; if (p > 1) p = 1;
      frame(p, dir, W, H);
      if (!stopped && p >= 0.58) { stopped = true; stopCrumple(); }
      if (p < 1) { requestAnimationFrame(step); }
      else { finish(href, swapReady); }
    }
    requestAnimationFrame(step);
  }

  function finish(href, swapReady) {
    if (CFG.swap === 'reload') { window.location.href = href; return; }
    Promise.resolve(swapReady).then(function (ok) {
      if (!ok) { window.location.href = href; return; }
      reset();
      animating = false;
    });
  }

  /* ------------------------------------------------------------- links */
  function isInternal(a) {
    if (!a || !a.getAttribute('href')) return false;
    if (a.target && a.target !== '' && a.target !== '_self') return false;
    if (a.hasAttribute('download')) return false;
    if (a.hasAttribute('data-no-crumple')) return false;
    var raw = a.getAttribute('href');
    if (raw.charAt(0) === '#' || /^(mailto:|tel:|javascript:)/i.test(raw)) return false;
    var u; try { u = new URL(a.href, location.href); } catch (e) { return false; }
    if (u.origin !== location.origin) return false;          // external -> leave the site, no crumple
    if (u.href === location.href) return false;              // same page
    if (u.pathname === location.pathname && u.hash) return false; // in-page anchor
    return true;
  }

  function onClick(e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target.closest ? e.target.closest('a[href]') : null;
    if (!a || !isInternal(a)) return;
    e.preventDefault();
    go(a.href);
  }

  /* ------------------------------------------------------------- init */
  function readConfig(el) {
    if (!el) return;
    var d = el.dataset || {};
    if (d.base != null) CFG.base = d.base;
    if (d.ball != null) CFG.ball = d.ball;
    if (d.texture != null) CFG.texture = d.texture;
    if (d.soundFile != null) CFG.sound = d.soundFile;
    if (d.duration != null) CFG.duration = +d.duration;
    if (d.scale != null) CFG.contentScale = +d.scale;
    if (d.swap != null) CFG.swap = d.swap;
    if (d.sound != null) CFG.enableSound = !/^(off|false|0|no)$/i.test(d.sound);
  }

  var inited = false;
  function init(opts) {
    if (inited) { if (opts) Object.assign(CFG, opts); return; }
    inited = true;
    readConfig(SCRIPT);
    if (opts) Object.assign(CFG, opts);

    // accessibility / capability guards: just navigate normally
    var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var ok = 'requestAnimationFrame' in window && CSS && CSS.supports &&
             (CSS.supports('clip-path', 'polygon(0 0)') || CSS.supports('-webkit-clip-path', 'polygon(0 0)'));
    if (reduce || !ok) return;

    build();
    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', function () {
      if (CFG.swap !== 'reload') location.reload(); // keep history correct for swap mode
    });
  }

  // public API
  window.CrumpleTransition = {
    init: init,
    go: function (href) { go(href); },
    configure: function (o) { Object.assign(CFG, o); }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () { init(); });
  } else {
    init();
  }
})();
