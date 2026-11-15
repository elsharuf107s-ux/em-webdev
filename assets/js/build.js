// E.M: the "Watch a website come together" story (#build).
// Optional. Without this file, or with reduced motion, the section shows the
// finished preview site and all five steps as a plain list.

const section = document.getElementById('build');
const root = document.documentElement;
const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');

function start() {
  if (!section || reduceMQ.matches || !('IntersectionObserver' in window)) return;

  const pin = section.querySelector('.build-pin');
  const steps = [...section.querySelectorAll('.build-step')];
  const STAGES = 5;
  let stage = -2;
  let ticking = false;
  let active = false;
  let live = false;
  let printing = false;
  let pinTop = NaN;

  // The story only scrubs when motion is allowed and not paused with the
  // "Pause animations" button; otherwise the finished, launched site shows.
  const paused = () => root.classList.contains('motion-paused');
  const wanted = () => !reduceMQ.matches && !paused() && !printing;

  function setStage(next) {
    if (next === stage) return;
    const grew = next > stage && next > 0;
    stage = next;
    for (let i = 0; i < STAGES; i++) section.classList.toggle('s' + i, i <= stage);
    steps.forEach((s, i) => s.classList.toggle('is-on', i === Math.max(stage, 0)));
    if (grew) {
      section.classList.remove('is-sweeping');
      void section.offsetWidth; // restart the sweep
      section.classList.add('is-sweeping');
    }
  }

  function update() {
    ticking = false;
    if (!live) return;
    // If the frame is taller than the screen (big text, zoom, short window),
    // pin it by its bottom edge so the step text and Start button stay visible.
    const top = Math.min(64, window.innerHeight - pin.offsetHeight);
    if (top !== pinTop) { pinTop = top; pin.style.top = top + 'px'; }
    const r = section.getBoundingClientRect();
    const run = section.offsetHeight - pin.offsetHeight;
    const p = Math.min(1, Math.max(0, -r.top / Math.max(run, 1)));
    section.style.setProperty('--p', p.toFixed(3));
    // The wireframe starts sketching as the section scrolls into view,
    // then each stage takes an equal share of the pinned scroll.
    if (r.top > window.innerHeight * 0.45) setStage(-1);
    else setStage(Math.min(STAGES - 1, Math.floor(p * (STAGES - 0.4))));
  }
  const onScroll = () => { if (live && active && !ticking) { ticking = true; requestAnimationFrame(update); } };

  new IntersectionObserver((es) => {
    active = es.some((e) => e.isIntersecting);
    if (active && live) update();
  }, { rootMargin: '200px 0px' }).observe(section);
  window.addEventListener('scroll', onScroll, { passive: true });
  window.addEventListener('resize', onScroll, { passive: true });

  // Keyboard focus (the Start button) or find-in-page landing on a step scrolls the story to it
  steps.forEach((s, i) => s.addEventListener('focusin', () => {
    if (!live || stage === i) return;
    // Next frame, so the browser's own scroll-into-view on focus doesn't undo it
    requestAnimationFrame(() => {
      const run = section.offsetHeight - pin.offsetHeight;
      const y = section.getBoundingClientRect().top + window.scrollY + run * ((i + 0.5) / (STAGES - 0.4));
      window.scrollTo({ top: y, behavior: 'instant' });
    });
  }));

  // The scrolling story makes the section 520vh tall. Switching it on or off
  // while the reader is below it would jump the page, so keep their place.
  function keepPlace(fn) {
    const r = section.getBoundingClientRect();
    const ref = section.nextElementSibling;
    const t0 = ref ? ref.getBoundingClientRect().top : 0;
    fn();
    // Measure the real shift: browsers with scroll anchoring have already corrected it
    if (r.bottom <= 0 && ref) window.scrollBy({ top: ref.getBoundingClientRect().top - t0, behavior: 'instant' });
    else if (r.top < 0) window.scrollTo({ top: section.getBoundingClientRect().top + window.scrollY, behavior: 'instant' });
  }

  function goLive() {
    if (live) return;
    live = true;
    section.classList.add('is-live');
    stage = -2;
    setStage(-1);
    update();
  }

  // Reduced motion, Pause, or print: show the finished, launched site
  function finish() {
    if (!live) return;
    live = false;
    section.classList.remove('is-live', 'is-sweeping');
    for (let i = 0; i < STAGES; i++) section.classList.add('s' + i);
    steps.forEach((s) => s.classList.remove('is-on'));
    stage = STAGES - 1;
    section.style.removeProperty('--p');
    pin.style.removeProperty('top');
    pinTop = NaN;
  }

  const apply = () => { if (wanted() === live) return; keepPlace(wanted() ? goLive : finish); };
  window.addEventListener('beforeprint', () => { printing = true; apply(); });
  window.addEventListener('afterprint', () => { printing = false; apply(); });
  reduceMQ.addEventListener && reduceMQ.addEventListener('change', apply);
  new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ['class'] });

  if (wanted()) goLive();
  mountField();

  // WebGL backdrop: blueprint grid -> brand field -> launch ring, scrubbed by scroll
  function mountField() {
    const conn = navigator.connection || {};
    if (conn.saveData) return;
    let fx = null, tried = false, visible = false, sp = 0;
    const copy = section.querySelector('.build-copy');
    const stageEl = section.querySelector('.bw-rig');
    const rel = (el, cr, sc, pad) => {
      const r = el.getBoundingClientRect(), H = cr.height;
      return [(r.left - cr.left - pad) * sc, (H - (r.bottom - cr.top) - pad) * sc, (r.right - cr.left + pad) * sc, (H - (r.top - cr.top) + pad) * sc];
    };
    // Finished (not live) means fully launched, never the blueprint stage
    const prog = () => (live ? parseFloat(section.style.getPropertyValue('--p')) || 0 : 1);
    async function make() {
      let mod; try { mod = await import('./gl.js'); } catch (e) { return; }
      const c = document.createElement('canvas');
      c.className = 'fx-canvas build-canvas';
      c.setAttribute('aria-hidden', 'true');
      pin.prepend(c);
      fx = mod.mount(c, mod.BUILD, {
        scaleCap: window.innerWidth < 768 ? 1 : 1.25, octaves: 3,
        preserve: !!window.__emfxTest, allowSoftware: !!window.__emfxTest,
        uniforms: (r, sc) => {
          sp += (prog() - sp) * (fx && fx.running ? 0.12 : 1);
          const s = stageEl.getBoundingClientRect();
          // on phones the copy sits under the stage, so mask the smaller of the two areas
          const wide = window.innerWidth >= 900;
          return {
            prog: sp,
            pointer: [(s.left + s.width / 2 - r.left) / r.width, 1 - (s.top + s.height / 2 - r.top) / r.height],
            mask: wide && copy ? rel(copy, r, sc, 10) : null
          };
        }
      });
      if (!fx) { c.remove(); return; }
      c.classList.add('is-live');
      window.__emfx = Object.assign(window.__emfx || {}, { build: fx.stats });
      sync();
    }
    // GPU: animate while on screen. Software renderers: redraw only when scrolled.
    const sync = () => {
      if (!fx) return;
      if (visible && !paused() && !reduceMQ.matches && !fx.software) fx.start(); else fx.stop();
      if (!fx.running) fx.still();
    };
    new IntersectionObserver((es) => {
      visible = es.some((e) => e.isIntersecting);
      if (visible && !tried) { tried = true; make(); }
      sync();
    }, { rootMargin: '300px 0px' }).observe(section);
    window.addEventListener('scroll', () => { if (fx && visible && !fx.running) requestAnimationFrame(() => fx.still()); }, { passive: true });
    document.addEventListener('visibilitychange', () => { if (document.hidden && fx) fx.stop(); else sync(); });
    new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['class'] });
    reduceMQ.addEventListener && reduceMQ.addEventListener('change', sync);
  }
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
