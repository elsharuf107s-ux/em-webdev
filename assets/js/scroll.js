// E.M: scroll-linked motion for the whole page.
// Each tracked element gets a --r value (0..1, or -1..1 for parallax) from one
// requestAnimationFrame loop; styles.css turns those numbers into motion.
// Optional: without it (or with reduced motion) every section is fully visible.

const root = document.documentElement;
const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
const tracks = []; // { el, fn(rect, vh) -> number, last, text }

// text: the element holds readable text that fades in. Those only ever move
// forward (they never fade back out), and once scrolling stops anything on
// screen is finished, so no text is left part-faded and low-contrast.
function track(el, fn, text = false) { if (el) tracks.push({ el, fn, last: NaN, on: true, text, done: false }); }
const paused = () => root.classList.contains('motion-paused');

// How far an element has travelled through the bottom part of the screen:
// 0 when its top touches the bottom edge, 1 once its top reaches `end` of the viewport height.
const enter = (end = 0.35) => (r, vh) => clamp((vh - r.top) / (vh * (1 - end)));
// -1 below the screen centre, 0 centred, 1 above
const centre = (r, vh) => clamp(((vh / 2) - (r.top + r.height / 2)) / (vh / 2 + r.height / 2), -1, 1);

/* ---------- Headings: words rise into place as they scroll in ---------- */
function splitHeadings() {
  document.querySelectorAll('#main > section:not(.hero):not(.build) h2').forEach((h) => {
    if (h.querySelector('.sw')) return;
    const words = [];
    // Split text nodes only, so inline markup (none today) would survive.
    [...h.childNodes].forEach((n) => {
      if (n.nodeType !== 3) { words.push(n); return; }
      n.textContent.split(/(\s+)/).forEach((part) => {
        if (!part) return;
        if (/^\s+$/.test(part)) { words.push(document.createTextNode(part)); return; }
        const s = document.createElement('span'); s.className = 'sw'; s.textContent = part; words.push(s);
      });
    });
    h.setAttribute('aria-label', h.textContent.replace(/\s+/g, ' ').trim());
    h.textContent = '';
    let i = 0;
    words.forEach((w) => { if (w.classList && w.classList.contains('sw')) { w.setAttribute('aria-hidden', 'true'); w.style.setProperty('--wi', i++); } h.appendChild(w); });
    h.style.setProperty('--wn', i);
    h.classList.add('split');
    track(h, enter(0.62), true); // fully readable well before it reaches the middle of the screen
  });
}

/* ---------- Problem / solution: the problems get struck out, the fixes check in ---------- */
function compare() {
  const c = document.querySelector('.compare');
  if (!c) return;
  c.querySelectorAll('.icon-list').forEach((ul) => [...ul.children].forEach((li, i) => li.style.setProperty('--li', i)));
  c.classList.add('scrub');
  track(c, enter(0.15), true);
}

/* ---------- Pricing: cards rise in depth, prices count up once ---------- */
function pricing() {
  const g = document.querySelector('.pricing-grid');
  if (!g) return;
  g.classList.add('scrub');
  // Tracked one by one so the stagger also works when the cards stack on phones
  const wide = () => window.innerWidth >= 900;
  [...g.children].forEach((p, i) => track(p, (r, vh) => clamp(enter(0.68)(r, vh) * 1.35 - (wide() ? i * 0.16 : 0)), true));
  const prices = [...g.querySelectorAll('.price [data-edit="price"]')];
  const io = new IntersectionObserver((es) => {
    if (!es.some((e) => e.isIntersecting)) return;
    io.disconnect();
    if (paused() || reduceMQ.matches) return; // leave the real prices showing
    prices.forEach((el, k) => {
      const final = el.textContent;
      const to = parseInt(final.replace(/[^0-9]/g, ''), 10);
      if (!to) return;
      const t0 = performance.now() + k * 140, dur = 1300;
      el.style.minWidth = el.getBoundingClientRect().width + 'px'; // no reflow while counting
      el.classList.add('counting');
      const step = (now) => {
        const x = clamp((now - t0) / dur);
        const e = x === 1 ? 1 : 1 - Math.pow(2, -10 * x);
        el.textContent = '$' + Math.round(to * e).toLocaleString('en-US');
        if (x < 1) requestAnimationFrame(step); else { el.textContent = final; el.classList.remove('counting'); }
      };
      requestAnimationFrame(step);
    });
  }, { threshold: 0.5 });
  prices.length && io.observe(g);
}

/* ---------- Process: the track and rocket follow the scroll ---------- */
function process() {
  const w = document.querySelector('.steps-wrap');
  if (!w) return;
  w.classList.remove('will-draw');
  w.classList.add('is-drawn', 'scrub');
  const steps = [...w.querySelectorAll('.step')];
  track(w, (r, vh) => {
    const v = clamp((vh * 0.85 - r.top) / (vh * 0.55));
    steps.forEach((s, i) => s.classList.toggle('is-on', v >= i / (steps.length - 1) - 0.02));
    return v;
  });
}

/* ---------- Work: browser and phone drift at different depths ---------- */
function work() {
  document.querySelectorAll('.work-card').forEach((c) => track(c, centre));
}

/* ---------- Hero: the copy lifts away and the devices tip back as you leave ---------- */
function hero() {
  const h = document.querySelector('.hero');
  track(h, (r) => clamp(-r.top / (r.height * 0.9)));
}

/* ---------- About: the monogram turns as it passes ---------- */
function about() { track(document.querySelector('.about'), centre); }

function set(t, v) { if (v !== t.last) { t.last = v; t.el.style.setProperty('--r', v); } }

function loop() {
  ticking = false;
  if (!live) return;
  const vh = window.innerHeight;
  for (const t of tracks) {
    if (!t.on || t.done) continue;
    const r = t.el.getBoundingClientRect();
    let v = +t.fn(r, vh).toFixed(3);
    if (t.text) { v = Math.max(v, t.last || 0); if (v >= 1) t.done = true; }
    set(t, v);
  }
  clearTimeout(settleTimer);
  settleTimer = setTimeout(settle, 220);
}
// Scrolling has stopped: finish every text block that is on screen (eased by CSS)
let settleTimer = 0;
function settle() {
  const vh = window.innerHeight;
  for (const t of tracks) {
    if (!t.text || t.done) continue;
    const r = t.el.getBoundingClientRect();
    if (r.top < vh && r.bottom > 0) { t.el.classList.add('is-settling'); set(t, 1); t.done = true; }
  }
}
let ticking = false;
let live = false;
const kick = () => { if (live && !ticking) { ticking = true; requestAnimationFrame(loop); } };

// Pause, reduced motion and print turn scroll-linked motion off (everything shows finished)
function setLive(on) {
  live = on;
  root.classList.toggle('scrolly', on);
  if (on) kick(); else clearTimeout(settleTimer);
}

function start() {
  if (reduceMQ.matches) return;
  hero(); splitHeadings(); compare(); pricing(); process(); work(); about();
  // Only measure what is near the screen
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    const t = tracks.find((x) => x.el === e.target); if (t) t.on = e.isIntersecting;
    if (e.isIntersecting) kick(); // a jump (menu link, back button) can land before the next scroll event
  }), { rootMargin: '25% 0px' });
  tracks.forEach((t) => io.observe(t.el));
  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', kick, { passive: true });
  let printing = false;
  const apply = () => { const on = !printing && !paused() && !reduceMQ.matches; if (on !== live) setLive(on); };
  window.addEventListener('beforeprint', () => { printing = true; apply(); });
  window.addEventListener('afterprint', () => { printing = false; apply(); });
  reduceMQ.addEventListener && reduceMQ.addEventListener('change', apply);
  new MutationObserver(apply).observe(root, { attributes: true, attributeFilter: ['class'] });
  apply();
  if (live) loop();
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
else start();
