// FlowRight concept site: optional visual effects (WebGL water, ripples, reveals).
// The page is complete without this file; it only adds motion on top.
const STORE_KEY = 'fr-motion';
/* ---------- Tiny WebGL engine (no libraries) ---------- */
const root = document.documentElement;
const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
let reduce = reduceMQ.matches;
const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const hasIO = 'IntersectionObserver' in window;
const TEST = !!window.__emfxTest;        // QA hooks (screenshots, video capture)
const CAPTURE = !!window.__emfxCapture;  // capture mode: no UI chrome, reveals shown
const small = () => window.innerWidth < 768;
const loops = [];
const resumers = [];
let paused = false;
try { paused = localStorage.getItem(STORE_KEY) === 'paused'; } catch (e) { /* storage blocked */ }
if (CAPTURE) paused = false;

const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
const HEAD = `#extension GL_OES_standard_derivatives : enable
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes; uniform float uTime; uniform float uDpr; uniform vec2 uPointer; uniform vec4 uMask; uniform float uIntro;
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
vec2 hash2(vec2 p){return vec2(hash(p),hash(p+17.17));}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);for(int i=0;i<4;i++){v+=a*noise(p);p=m*p;a*=.5;}return v;}
float maskK(vec2 frag,float soft){vec2 c=(uMask.xy+uMask.zw)*.5,h=(uMask.zw-uMask.xy)*.5;vec2 d=abs(frag-c)-h;
  float s=length(max(d,0.))+min(max(d.x,d.y),0.);return smoothstep(-soft*.25,soft,s);}
`;

function mount(canvas, frag, opts = {}) {
  const attrs = { antialias: false, alpha: true, premultipliedAlpha: true, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: TEST, failIfMajorPerformanceCaveat: !TEST };
  let gl;
  try { gl = canvas.getContext('webgl', attrs); } catch (e) { gl = null; }
  if (!gl || !gl.getExtension('OES_standard_derivatives')) return null;
  let software = false;
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test((dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) || '');
  } catch (e) { /* ignore */ }
  const sh = (type, s) => { const o = gl.createShader(type); gl.shaderSource(o, s); gl.compileShader(o); return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null; };
  const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, HEAD + frag);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  const u = (n) => (n in U ? U[n] : (U[n] = gl.getUniformLocation(prog, n)));

  let scale = Math.min(window.devicePixelRatio || 1, opts.scaleCap || 1.5);
  let running = false, raf = 0, last = 0, time = opts.t0 || 0, intro = 0, lost = false;
  const samples = [];
  const stats = { frames: 0, medMs: 0, scale: +scale.toFixed(2), software };
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; stop(); canvas.classList.remove('is-live'); if (opts.onLost) opts.onLost(); });

  function draw() {
    if (lost) return;
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * scale)), h = Math.max(1, Math.round(r.height * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    const s = opts.uniforms ? opts.uniforms(r, scale, time) : {};
    gl.uniform2f(u('uRes'), w, h);
    gl.uniform1f(u('uTime'), time % 1000);
    gl.uniform1f(u('uDpr'), scale);
    const p = s.pointer || [0.5, 0.5]; gl.uniform2f(u('uPointer'), p[0], p[1]);
    const m = s.mask || [-9, -9, -9, -9]; gl.uniform4f(u('uMask'), m[0], m[1], m[2], m[3]);
    gl.uniform1f(u('uIntro'), intro);
    if (s.extra) for (const k in s.extra) {
      const v = s.extra[k], l = u(k); if (!l) continue;
      if (typeof v === 'number') gl.uniform1f(l, v); else if (v.length === 2) gl.uniform2fv(l, v);
      else if (v.length === 3) gl.uniform3fv(l, v); else gl.uniform4fv(l, v);
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (opts.onDraw) opts.onDraw();
  }
  function frame(now) {
    if (!running) return;
    const dt = last ? Math.min(now - last, 100) : 16.7;
    last = now; time += dt / 1000; intro = Math.min(1, intro + dt / 1200);
    draw(); stats.frames++;
    samples.push(dt);
    if (samples.length === 20) { // adaptive resolution
      samples.sort((a, b) => a - b); const med = samples[10]; stats.medMs = +med.toFixed(1);
      if (med > 24 && scale > 0.5) { scale = Math.max(0.5, scale * 0.75); stats.scale = +scale.toFixed(2); }
      samples.length = 0;
    }
    raf = requestAnimationFrame(frame);
  }
  function start() { if (running || lost) return; running = true; last = 0; raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  function still() { intro = 1; draw(); }
  function renderAt(t) { time = t; intro = 1; draw(); }
  const onScreen = () => { const r = canvas.getBoundingClientRect(); return r.bottom > 0 && r.top < window.innerHeight; };
  const ctl = { start, stop, still, renderAt, onScreen, stats, software, get running() { return running; } };
  loops.push(ctl);
  return ctl;
}
const canAnimate = (fx) => !reduce && (!fx.software || window.__emfxForceAnimate);

function whenVisible(el, onIn, onOut, margin = '100px') {
  if (!hasIO) { onIn(); return; }
  let inView = false;
  new IntersectionObserver((es) => es.forEach((e) => {
    inView = e.isIntersecting;
    if (inView && !document.hidden) onIn(); else onOut();
  }), { rootMargin: margin }).observe(el);
  document.addEventListener('visibilitychange', () => { if (document.hidden) onOut(); else if (inView) onIn(); });
  resumers.push(() => { if (inView && !document.hidden) onIn(); });
}
// Drive a controller: animate while visible, a still frame when motion is off.
function drive(el, fx, margin) {
  if (CAPTURE) { fx.still(); return; }
  whenVisible(el, () => { if (!canAnimate(fx) || paused) fx.still(); else fx.start(); }, fx.stop, margin);
}
function relRect(el, cr, scale, pad) {
  const r = el.getBoundingClientRect(), H = cr.height;
  return [(r.left - cr.left - pad) * scale, (H - (r.bottom - cr.top) - pad) * scale, (r.right - cr.left + pad) * scale, (H - (r.top - cr.top) + pad) * scale];
}

/* ---------- Scroll reveals (only below the fold, never hides content without JS) ---------- */
function setupReveals(sel) {
  if (reduce || !hasIO) return;
  const els = [...document.querySelectorAll(sel)];
  if (CAPTURE) return;
  const fold = window.innerHeight;
  const io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('is-in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px', threshold: 0.08 });
  els.forEach((el) => {
    if (el.getBoundingClientRect().top < fold) return;
    const sibs = [...el.parentElement.children].filter((c) => c.matches(sel));
    el.style.setProperty('--d', Math.min(Math.max(sibs.indexOf(el), 0), 5) * 70 + 'ms');
    el.classList.add('reveal');
    io.observe(el);
  });
  window.addEventListener('beforeprint', () => els.forEach((el) => el.classList.add('is-in')));
}

/* ---------- "Pause animations" control (WCAG 2.2.2) ---------- */
function setPaused(p) {
  paused = p;
  root.classList.toggle('motion-paused', p);
  try { localStorage.setItem(STORE_KEY, p ? 'paused' : 'on'); } catch (e) { /* ignore */ }
  document.querySelectorAll('.motion-toggle').forEach((b) => {
    b.setAttribute('aria-pressed', String(p));
  });
  if (p) loops.forEach((l) => l.stop()); else resumers.forEach((f) => f());
}
function addPauseControl(spot) {
  if (reduce || CAPTURE || !spot) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'motion-toggle'; b.setAttribute('aria-pressed', 'false');
  b.innerHTML = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="i-pause" d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/><path class="i-play" d="M7 5v14l12-7z" fill="currentColor"/></svg><span>Pause animations</span>';
  b.addEventListener('click', () => setPaused(!paused));
  spot.appendChild(b);
  if (paused) setPaused(true);
}
reduceMQ.addEventListener && reduceMQ.addEventListener('change', (e) => {
  if (!e.matches) return;
  reduce = true; root.classList.remove('motion');
  document.querySelectorAll('.reveal').forEach((el) => el.classList.add('is-in'));
  loops.forEach((l) => { l.stop(); l.still(); });
});
if (TEST) window.__emfx = { loops, renderAt: (t) => loops.forEach((l) => { if (l.onScreen()) l.renderAt(t); }) };
const idle = window.requestIdleCallback || ((f) => setTimeout(f, 200));

/* ==========================================================
   FlowRight: light through moving water (caustics) over the navy
   hero, with ripples where the pointer moves or taps.
   ========================================================== */
const WATER = `
uniform vec4 uRip0; uniform vec4 uRip1; uniform vec4 uRip2; uniform vec4 uRip3;
vec2 vor(vec2 p){
  vec2 i=floor(p), f=fract(p); float f1=8., f2=8.;
  for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++){
    vec2 g=vec2(float(x),float(y)); vec2 o=hash2(i+g); o=.5+.42*sin(uTime*.55+6.2831*o);
    float d=length(g+o-f); if(d<f1){f2=f1;f1=d;} else if(d<f2){f2=d;}
  }
  return vec2(f1,f2);
}
vec2 rip(vec2 p,vec4 R,float asp,inout float ring){
  vec2 d=p-vec2(R.x*asp,R.y); float r=length(d);
  float w=exp(-((r-R.z*.5)/.05)*((r-R.z*.5)/.05))*exp(-R.z*1.3)*R.w;
  ring+=w; return d/(r+1e-3)*w*.03;
}
void main(){
  vec2 frag=gl_FragCoord.xy, uv=frag/uRes; float asp=uRes.x/uRes.y;
  vec2 p=vec2(uv.x*asp,uv.y);
  float ring=0.;
  vec2 off=rip(p,uRip0,asp,ring)+rip(p,uRip1,asp,ring)+rip(p,uRip2,asp,ring)+rip(p,uRip3,asp,ring);
  vec2 q=p+off; q.x-=uTime*.025;
  q+=(vec2(fbm(q*1.8+uTime*.04),fbm(q*1.8+3.7-uTime*.04))-.5)*.3;
  vec2 v1=vor(q*5.5); float c1=1.-smoothstep(0.,.16,v1.y-v1.x);
  vec2 v2=vor(q*8.5+4.1); float c2=1.-smoothstep(0.,.13,v2.y-v2.x);
  float caus=c1*c1*.55+c2*c2*.35+c1*c2*.7;
  float energy=smoothstep(.05,1.,uv.x*.85+(1.-uv.y)*.25+.1);
  float k=maskK(frag,150.*uDpr);
  float a=(caus*.17*energy+ring*.22)*(.12+.88*k);
  vec3 col=mix(vec3(.5,.74,1.),vec3(.85,.93,1.),c1*c2);
  a=clamp(a*uIntro,0.,1.);
  gl_FragColor=vec4(col*a,a);
}`;

function setupWater() {
  const hero = document.querySelector('.hero');
  const copy = hero && hero.querySelector('.hero-grid > div');
  if (!hero) return;
  const c = document.createElement('canvas');
  c.className = 'fx-canvas fx-water'; c.setAttribute('aria-hidden', 'true');
  hero.prepend(c);
  // ripple slots: x, y (0..1, y up), start time, strength
  const rips = [[0.72, 0.45, -9, 0], [0, 0, -9, 0], [0, 0, -9, 0], [0, 0, -9, 0]];
  let next = 0, now = 0, lastX = -1, lastY = -1, moved = 0, lastAuto = 0;
  const add = (x, y, s) => { rips[next] = [x, y, now, s]; next = (next + 1) % 4; };
  const fx = mount(c, WATER, {
    scaleCap: small() ? 1 : 1.25, t0: 6,
    uniforms: (r, s, t) => {
      now = t;
      if (!fine && t - lastAuto > 4.5) { lastAuto = t; add(0.55 + Math.random() * 0.4, 0.2 + Math.random() * 0.6, 0.6); } // gentle drops on touch screens
      const ex = {};
      rips.forEach((R, i) => { ex['uRip' + i] = [R[0], R[1], Math.max(0, t - R[2]), t - R[2] > 4 ? 0 : R[3]]; });
      return { mask: copy ? relRect(copy, r, s, 0) : null, extra: ex };
    }
  });
  if (!fx) { c.remove(); return; }
  c.classList.add('is-live');
  if (CAPTURE) { rips[0] = [0.78, 0.55, 6 - 0.9, 1]; rips[1] = [0.62, 0.3, 6 - 1.8, 0.8]; } // a couple of rings for the portfolio video
  if (!reduce) {
    const pos = (e) => { const r = hero.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, 1 - (e.clientY - r.top) / r.height]; };
    hero.addEventListener('pointermove', (e) => {
      if (lastX >= 0) moved += Math.hypot(e.clientX - lastX, e.clientY - lastY);
      lastX = e.clientX; lastY = e.clientY;
      if (moved > 110) { moved = 0; const p = pos(e); add(p[0], p[1], 0.55); }
    }, { passive: true });
    hero.addEventListener('pointerdown', (e) => { const p = pos(e); add(p[0], p[1], 1); }, { passive: true });
  }
  drive(hero, fx, '0px');
}

/* Water ripple on the call and quote buttons (short, user-triggered) */
function setupRipples() {
  if (reduce) return;
  const hosts = document.querySelectorAll('a[href^="tel:"].btn, .emergency a[href^="tel:"], .call-card .big, .btn-orange');
  hosts.forEach((h) => {
    h.classList.add('ripple-host');
    const spawn = (x, y) => {
      const r = h.getBoundingClientRect();
      const s = document.createElement('span');
      s.className = 'ripple'; s.setAttribute('aria-hidden', 'true');
      const size = Math.max(r.width, r.height) * 2.2;
      s.style.width = s.style.height = size + 'px';
      s.style.left = (x - r.left - size / 2) + 'px'; s.style.top = (y - r.top - size / 2) + 'px';
      h.appendChild(s);
      s.addEventListener('animationend', () => s.remove());
      setTimeout(() => s.remove(), 1500);
    };
    h.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse') spawn(e.clientX, e.clientY); });
    h.addEventListener('pointerdown', (e) => spawn(e.clientX, e.clientY));
    h.addEventListener('keydown', (e) => { if (e.key === 'Enter') { const r = h.getBoundingClientRect(); spawn(r.left + r.width / 2, r.top + r.height / 2); } });
  });
}

function setupPlumberMicro() {
  if (reduce || !fine) return;
  // Service cards: a cool spotlight under the pointer
  document.querySelectorAll('.svc').forEach((card) => {
    card.addEventListener('pointermove', (e) => {
      const r = card.getBoundingClientRect();
      card.style.setProperty('--mx', (e.clientX - r.left).toFixed(0) + 'px');
      card.style.setProperty('--my', (e.clientY - r.top).toFixed(0) + 'px');
    }, { passive: true });
  });
}

function init() {
  root.classList.toggle('motion', !reduce);
  if (CAPTURE) root.classList.add('fx-capture');
  setupReveals('.section-head, .svc, .trust-item, .promise, .area-grid > *, .quote-aside, form.quote');
  setupRipples();
  setupPlumberMicro();
  addPauseControl(document.querySelector('.hero'));
  idle(setupWater, { timeout: 800 });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
