// E.M: visual enhancements (WebGL backgrounds, reveals, tilt, lazy videos).
// Everything here is optional. Content, links and forms work without it, and
// script.js (menu, plan preselect, form fallback) does not depend on this file.

const root = document.documentElement;
const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
let reduce = reduceMQ.matches;
const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const conn = navigator.connection || {};
const lite = !!conn.saveData || /(^|-)2g$/.test(conn.effectiveType || '');
const hasIO = 'IntersectionObserver' in window;
const small = () => window.innerWidth < 768;
const loops = []; // WebGL controllers, stopped if reduced motion is switched on
const resumers = []; // re-start whatever is on screen after "Play animations"
let paused = false;
try { paused = localStorage.getItem('em-motion') === 'paused'; } catch (e) { /* storage blocked */ }

/* ---------- Scroll reveals ---------- */
function setupReveals() {
  if (reduce || !hasIO) return;
  const sel = '#main > section:not(.hero) .section-head, .compare-card, .card-grid > .card, .founding-offer, .plan, .care-plan, .step, .about, .work-card, .faq details, .contact-copy, .contact-form';
  const els = [...document.querySelectorAll(sel)];
  // Only hide things that start below the fold, so nothing visible ever blinks.
  const fold = window.innerHeight;
  const io = new IntersectionObserver((entries) => {
    entries.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } });
  }, { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  els.forEach((el) => {
    if (el.getBoundingClientRect().top < fold) return;
    // stagger siblings in a grid
    const sibs = [...el.parentElement.children].filter((c) => c.matches(sel));
    el.style.setProperty('--d', Math.min(sibs.indexOf(el), 5) * 70 + 'ms');
    el.classList.add('reveal');
    io.observe(el);
  });
  // Printing or "find in page" should never meet hidden content
  window.addEventListener('beforeprint', () => els.forEach((el) => el.classList.add('is-in')));
}

/* ---------- In-view helper (pause when off screen or tab hidden) ---------- */
function whenVisible(el, onIn, onOut, margin = '120px') {
  if (!hasIO) { onIn(); return; }
  let inView = false;
  new IntersectionObserver((entries) => {
    entries.forEach((e) => {
      inView = e.isIntersecting;
      if (inView && !document.hidden) onIn(); else onOut();
    });
  }, { rootMargin: margin }).observe(el);
  resumers.push(() => { if (inView && !document.hidden) onIn(); });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) onOut(); else if (inView) onIn();
  });
}

/* ---------- WebGL backgrounds ---------- */
function relRect(el, canvasRect, scale, pad) {
  const r = el.getBoundingClientRect();
  const H = canvasRect.height;
  return [(r.left - canvasRect.left - pad) * scale, (H - (r.bottom - canvasRect.top) - pad) * scale,
    (r.right - canvasRect.left + pad) * scale, (H - (r.top - canvasRect.top) + pad) * scale];
}

async function setupGL() {
  const hero = document.querySelector('.hero');
  const contact = document.getElementById('contact');
  if (!hero) return;
  let mod;
  try { mod = await import('./gl.js'); } catch (e) { return; }

  // Hero field
  const heroCanvas = document.createElement('canvas');
  heroCanvas.className = 'fx-canvas hero-canvas';
  heroCanvas.setAttribute('aria-hidden', 'true');
  hero.prepend(heroCanvas);
  const copy = hero.querySelector('.hero-copy');
  const ptr = { x: 0.72, y: 0.55, tx: 0.72, ty: 0.55 };
  const heroFx = mod.mount(heroCanvas, mod.HERO, {
    scaleCap: small() ? 1 : 1.5,
    octaves: small() ? 3 : 4,
    t0: 12,
    preserve: !!window.__emfxTest, allowSoftware: !!window.__emfxTest,
    uniforms: (r, s) => {
      ptr.x += (ptr.tx - ptr.x) * 0.04; ptr.y += (ptr.ty - ptr.y) * 0.04;
      return { pointer: [ptr.x, ptr.y], mask: copy ? relRect(copy, r, s, 8) : null };
    }
  });
  if (!heroFx) { heroCanvas.remove(); return; }
  heroCanvas.classList.add('is-live');
  loops.push(heroFx);
  window.__emfx = { hero: heroFx.stats };
  if (fine && !reduce) {
    hero.addEventListener('pointermove', (e) => {
      const r = hero.getBoundingClientRect();
      ptr.tx = (e.clientX - r.left) / r.width; ptr.ty = 1 - (e.clientY - r.top) / r.height;
    }, { passive: true });
  }
  const animate = (fx) => !reduce && (!fx.software || window.__emfxForceAnimate);
  if (!animate(heroFx)) { heroFx.still(); } else { whenVisible(hero, () => { if (reduce) return; if (paused) heroFx.still(); else heroFx.start(); }, heroFx.stop, '0px'); }
  window.addEventListener('resize', () => { if (!heroFx.running) heroFx.still(); }, { passive: true });

  // Contact dot matrix (lazy: only created when the section gets near)
  if (!contact) return;
  const make = () => {
    const c = document.createElement('canvas');
    c.className = 'fx-canvas contact-canvas';
    c.setAttribute('aria-hidden', 'true');
    contact.prepend(c);
    const ccopy = contact.querySelector('.contact-copy');
    const fx = mod.mount(c, mod.DOTS, {
      alpha: true, scaleCap: small() ? 1 : 1.5, octaves: 1, preserve: !!window.__emfxTest, allowSoftware: !!window.__emfxTest,
      uniforms: (r, s) => ({ mask: ccopy ? relRect(ccopy, r, s, 12) : null })
    });
    if (!fx) { c.remove(); return null; }
    c.classList.add('is-live');
    loops.push(fx);
    window.__emfx.contact = fx.stats;
    return fx;
  };
  let dots = null, tried = false;
  whenVisible(contact, () => {
    if (!dots && !tried) { tried = true; dots = make(); }
    if (!dots) return;
    if (!animate(dots) || paused) dots.still(); else dots.start();
  }, () => dots && dots.stop(), '200px');
}

/* ---------- 3D device rig: eases toward the pointer, sleeps when settled ---------- */
function setupRig() {
  const stage = document.querySelector('.hero-stage');
  const rig = stage && stage.querySelector('.device-rig');
  if (!rig || reduce || !fine) return; // touch screens keep the static 3D pose + CSS float
  let tx = 0, ty = 0, x = 0, y = 0, raf = 0, visible = false;
  const loop = () => {
    raf = 0;
    if (!visible || reduce) return;
    x += (tx - x) * 0.08; y += (ty - y) * 0.08;
    rig.style.setProperty('--rx', (-y * 7).toFixed(2) + 'deg');
    rig.style.setProperty('--ry', (x * 10).toFixed(2) + 'deg');
    rig.style.setProperty('--gx', (50 + x * 40).toFixed(1) + '%');
    rig.style.setProperty('--gy', (40 + y * 40).toFixed(1) + '%');
    if (Math.abs(tx - x) + Math.abs(ty - y) > 0.002) raf = requestAnimationFrame(loop);
  };
  const kick = () => { if (!raf && visible && !paused) raf = requestAnimationFrame(loop); };
  document.querySelector('.hero').addEventListener('pointermove', (e) => {
    tx = (e.clientX / window.innerWidth) * 2 - 1;
    ty = (e.clientY / window.innerHeight) * 2 - 1;
    kick();
  }, { passive: true });
  whenVisible(stage, () => { visible = true; kick(); }, () => { visible = false; }, '0px');
}

/* ---------- Work cards: tilt toward the pointer ---------- */
function setupCards() {
  if (reduce || !fine) return;
  document.querySelectorAll('.work-card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5, py = (e.clientY - r.top) / r.height - 0.5;
      card.style.setProperty('--tx', (px * 6).toFixed(2) + 'deg');
      card.style.setProperty('--ty', (-py * 6).toFixed(2) + 'deg');
    }, { passive: true });
    card.addEventListener('pointerleave', () => { card.style.setProperty('--tx', '0deg'); card.style.setProperty('--ty', '0deg'); });
  });
  // Service cards: a soft spotlight that follows the pointer
  document.querySelectorAll('.card-grid > .card').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
    }, { passive: true });
  });
}

/* ---------- Muted looping videos, loaded only when on screen ---------- */
function setupVideos() {
  const vids = [...document.querySelectorAll('video[data-src]')];
  if (!vids.length || reduce || lite) return;
  const probe = document.createElement('video');
  if (!probe.canPlayType || !probe.canPlayType('video/webm; codecs="vp8"')) return; // keep the poster images
  const go = () => vids.forEach((v) => {
    v.muted = true;
    v.addEventListener('playing', () => v.classList.add('is-playing'), { once: true });
    whenVisible(v, () => {
      if (paused) return;
      if (!v.src) { v.src = v.dataset.src; v.load(); }
      const p = v.play(); if (p && p.catch) p.catch(() => {});
    }, () => { if (!v.paused) v.pause(); }, '200px');
  });
  // Let the page finish loading first, so video never competes with the headline
  if (document.readyState === 'complete') setTimeout(go, 600);
  else window.addEventListener('load', () => setTimeout(go, 600), { once: true });
}

/* ---------- Process steps: draw the track once it is in view ---------- */
function setupSteps() {
  const steps = document.querySelector('.steps-wrap') || document.querySelector('.steps');
  if (!steps) return;
  if (reduce || !hasIO) { steps.classList.add('is-drawn'); return; }
  steps.classList.add('will-draw');
  const io = new IntersectionObserver((es) => {
    if (es.some((e) => e.isIntersecting)) { steps.classList.add('is-drawn'); io.disconnect(); }
  }, { threshold: 0.35 });
  io.observe(steps);
}

/* ---------- "Pause animations" control (WCAG 2.2.2) ---------- */
function setPaused(p) {
  paused = p;
  root.classList.toggle('motion-paused', p);
  try { localStorage.setItem('em-motion', p ? 'paused' : 'on'); } catch (e) { /* ignore */ }
  document.querySelectorAll('.motion-toggle').forEach((b) => {
    b.setAttribute('aria-pressed', String(p));
  });
  if (p) {
    loops.forEach((l) => l.stop());
    document.querySelectorAll('video').forEach((v) => v.pause());
  } else {
    resumers.forEach((f) => f());
  }
}
function setupPauseControl() {
  if (reduce) return; // nothing moves, so nothing to pause
  const spots = [document.querySelector('.hero-stage'), document.querySelector('#work .section-head')];
  spots.forEach((spot) => {
    if (!spot) return;
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'motion-toggle';
    b.setAttribute('aria-pressed', 'false');
    b.innerHTML = '<svg class="icon" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="i-pause" d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" fill="none"/><path class="i-play" d="M8 5.5v13l11-6.5z" fill="currentColor"/></svg><span>Pause animations</span>';
    b.addEventListener('click', () => setPaused(!paused));
    spot.appendChild(b);
  });
  if (paused) setPaused(true);
}

function init() {
  root.classList.toggle('motion', !reduce);
  setupReveals();
  setupSteps();
  setupRig();
  setupCards();
  setupVideos();
  setupPauseControl();
  // Start WebGL after first paint so it never delays the headline
  const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));
  idle(() => setupGL(), { timeout: 900 });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();

// If someone turns on "reduce motion" while the page is open, stop motion.
reduceMQ.addEventListener && reduceMQ.addEventListener('change', (e) => {
  if (e.matches) {
    reduce = true;
    root.classList.remove('motion');
    document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-in'));
    document.querySelectorAll('video').forEach((v) => v.pause());
    loops.forEach((l) => { l.stop(); l.still(); });
  }
});
