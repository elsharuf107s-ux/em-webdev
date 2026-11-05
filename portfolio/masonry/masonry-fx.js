// Header & Stretcher concept site: optional visual effects (Raking Light hero, diagram, sliders, form).
// The page is complete without this file; it only adds motion and conveniences on top.
const STORE_KEY = 'hs-motion';
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
   Header & Stretcher: "Raking Light" hero. A procedural running-bond
   wall lit by a low sun. One band of eroded joints repoints itself
   from left to right as you scroll. No textures, one triangle.
   ========================================================== */
const RAKE = (steps) => `
uniform float uRepoint; uniform vec2 uSun; uniform float uBandY;
const vec2 S=vec2(96.,33.); const float J=10.;
float wallH(vec2 p, out float m, out float id, out float er, out float wet){
  float row=floor(p.y/S.y); float x=p.x+.5*S.x*mod(row,2.);
  vec2 c=vec2(floor(x/S.x),row); vec2 l=vec2(x-c.x*S.x,p.y-row*S.y);
  float jh=J*.5; float e=min(min(l.x,S.x-l.x),min(l.y,S.y-l.y))-jh;
  id=hash(c);
  float bev=smoothstep(-.8,3.,e+.8*noise(p*.3+c));
  float face=1.+.07*noise(p*.05+c*3.)+.04*noise(p*.22)+.02*noise(p*.5)+.05*(hash(c+2.)-.5);
  float hb=mix(-.6,face,bev);
  float by0=uBandY, by1=uBandY+3.*S.y;
  float band=smoothstep(by0-6.,by0+2.,p.y)*smoothstep(by1+6.,by1-2.,p.y);
  float W=uRes.x/uDpr;
  float front=uRepoint*(W+260.)-130.;
  float wob=28.*noise(vec2(p.y*.05,3.));
  float filled=smoothstep(front+26.,front-26.,p.x+wob);
  er=band*(1.-filled);
  wet=band*filled*smoothstep(front-180.,front,p.x+wob);
  float t=clamp(-e/jh,0.,1.);
  float hm=.6-.1*t*t-er*(.48+.16*noise(p*.45))+wet*.04;
  m=step(hm,hb); return max(hm,hb);
}
float H(vec2 p){float a,b,c,d;return wallH(p,a,b,c,d);}
void main(){
  vec2 frag=gl_FragCoord.xy; vec2 uv=frag/uRes;
  vec2 p=frag/uDpr;
  float m,id,er,wet; float h=wallH(p,m,id,er,wet);
  vec2 g=vec2(H(p+vec2(1.,0.))-h,H(p+vec2(0.,1.))-h);
  vec3 n=normalize(vec3(-g*4.,1.));
  float el=mix(.07,.24,uIntro)+uSun.y; float az=uSun.x;
  vec3 L=normalize(vec3(cos(az)*cos(el),sin(az)*cos(el),sin(el)));
  vec2 ld=normalize(L.xy); float tl=L.z/length(L.xy); float sh=1.;
  for(int i=1;i<=${steps};i++){float d=float(i)*2.2; float hq=H(p+ld*d); sh=min(sh,1.-smoothstep(0.,.6,(hq-h)*4.-d*tl));}
  vec3 red=vec3(.635,.243,.165), fired=vec3(.494,.18,.122), flash=vec3(.59,.36,.235), clink=vec3(.3,.17,.13);
  vec3 b=id<.55?red:(id<.8?fired:(id<.93?flash:clink));
  b*=.88+.22*hash(vec2(id,3.)); b*=.84+.3*fbm(p*.03+id*9.); b*=.93+.12*noise(p*.45);
  vec3 mo=vec3(.77,.74,.69)*(.9+.12*noise(p*.4));
  mo=mix(mo,vec3(.52,.47,.41)*(.85+.3*noise(p*.6)),er);
  mo=mix(mo,mo*.82,wet);
  vec3 alb=mix(mo,b,m);
  float dif=max((dot(n,L)+.12)/1.12,0.);
  vec3 col=alb*(vec3(1.,.85,.69)*dif*sh*1.45+vec3(.62,.70,.78)*.2*(.6+.4*n.z));
  float spec=pow(max(dot(reflect(-L,n),vec3(0.,0.,1.)),0.),24.)*wet*(1.-m);
  col+=vec3(1.,.93,.82)*spec*.5;
  float sx=.68+(az-(3.1416-.42))*.9;
  col*=.42+.85*exp(-((uv.x-sx)/.42)*((uv.x-sx)/.42))*(.8+.2*uv.y);
  col*=.8+.2*smoothstep(1.3,.3,length((uv-vec2(.7,.5))*vec2(1.,1.3)));
  col=mix(vec3(.09,.086,.08),col,.15+.85*uIntro);
  col+=(hash(frag+fract(uTime*.37))-.5)/255.;
  gl_FragColor=vec4(col,1.);
}`;

function setupHero() {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const c = document.createElement('canvas');
  c.className = 'fx-canvas fx-wall'; c.setAttribute('aria-hidden', 'true');
  hero.prepend(c);
  const dpr = window.devicePixelRatio || 1;
  const ptr = { x: 0, tx: 0, y: 0, ty: 0 };
  let repoint = reduce ? 1 : 0;
  const progress = () => {
    const r = hero.getBoundingClientRect();
    return Math.max(0, Math.min(1, -r.top / Math.max(1, r.height * 0.55)));
  };
  const fx = mount(c, RAKE(small() ? 3 : 4), {
    scaleCap: small() ? Math.min(dpr, 1) * 0.85 : 1.5, t0: 0,
    uniforms: (r, s, t) => {
      ptr.x += (ptr.tx - ptr.x) * 0.05; ptr.y += (ptr.ty - ptr.y) * 0.05;
      const target = reduce ? 1 : progress();
      repoint += (target - repoint) * (CAPTURE ? 1 : 0.12);
      const drift = (CAPTURE || reduce) ? 0 : Math.sin(t * 6.2832 / 60) * 0.12;
      const bandY = Math.round((r.height * 0.5) / 33) * 33;  // one band of three courses, mid-height
      return { extra: { uRepoint: repoint, uSun: [Math.PI - 0.42 + ptr.x * 0.44 + drift, ptr.y * 0.06], uBandY: bandY } };
    }
  });
  if (!fx) { c.remove(); return; }
  c.classList.add('is-live');
  if (fine && !reduce) hero.addEventListener('pointermove', (e) => {
    const r = hero.getBoundingClientRect();
    ptr.tx = ((e.clientX - r.left) / r.width) * 2 - 1; ptr.ty = -(((e.clientY - r.top) / r.height) * 2 - 1);
  }, { passive: true });
  drive(hero, fx, '0px');
  // When the loop is not running (paused), still update the repoint band on scroll
  let pending = false;
  window.addEventListener('scroll', () => {
    if (fx.running || pending || reduce || CAPTURE) return;
    pending = true; requestAnimationFrame(() => { pending = false; if (fx.onScreen()) fx.still(); });
  }, { passive: true });
}

/* ---------- Seasonal banner (by month) ---------- */
function setupSeason() {
  const el = document.getElementById('season-text');
  if (!el) return;
  const m = new Date().getMonth();
  if (m >= 2 && m <= 4) el.textContent = 'Winter left its mark? Send us photos. We reply in 1 business day.';
  else if (m >= 5 && m <= 7) el.textContent = 'Patio and retaining wall season. Send photos for a range within 1 business day.';
  else if (m >= 8 && m <= 9) el.textContent = 'Fix it before it freezes. Fall crown and flashing slots are open.';
}

/* ---------- Theme toggle: system -> light -> dark ---------- */
function setupTheme() {
  const slot = document.querySelector('.theme-slot');
  if (!slot) return;
  const icons = {
    system: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 20h8M12 16v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    light: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    dark: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'
  };
  let mode = 'system';
  try { mode = localStorage.getItem('hs-theme') || 'system'; } catch (e) { /* ignore */ }
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'theme-btn';
  const apply = () => {
    if (mode === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', mode);
    try { if (mode === 'system') localStorage.removeItem('hs-theme'); else localStorage.setItem('hs-theme', mode); } catch (e) { /* ignore */ }
    b.innerHTML = icons[mode] + '<span class="vh">Theme: ' + mode + '. Change theme</span>';
    b.title = 'Theme: ' + mode;
  };
  b.addEventListener('click', () => { mode = mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system'; apply(); });
  apply();
  slot.replaceWith(b);
}

/* ---------- "Where's the water getting in?" diagram ---------- */
function setupWater() {
  const fig = document.querySelector('.water-figure');
  const list = document.querySelector('.sym-list');
  if (!fig || !list) return;
  const svg = fig.querySelector('svg');
  const hot = fig.querySelector('.water-hotspots');
  const spots = { joints: [520, 268], spall: [188, 378], efflo: [356, 400], crown: [490, 30] };
  const names = {};
  root.classList.add('js-water');
  const select = (id, focusCard) => {
    list.querySelectorAll('.sym').forEach((li) => {
      const on = li.dataset.water === id;
      li.classList.toggle('is-on', on);
      const btn = li.querySelector('.show-btn'); if (btn) btn.setAttribute('aria-pressed', String(on));
    });
    svg.querySelectorAll('.wp, .mk').forEach((el) => el.classList.toggle('is-on', el.classList.contains('wp-' + id) || el.classList.contains('mk-' + id)));
    hot.querySelectorAll('button').forEach((bt) => bt.setAttribute('aria-pressed', String(bt.dataset.water === id)));
    if (focusCard) { const card = document.getElementById('sym-' + id); if (card && small()) card.scrollIntoView({ block: 'nearest', behavior: reduce ? 'auto' : 'smooth' }); }
  };
  list.querySelectorAll('.sym').forEach((li) => {
    const id = li.dataset.water; names[id] = li.querySelector('h3').textContent;
    const btn = document.createElement('button');
    btn.type = 'button'; btn.className = 'show-btn'; btn.setAttribute('aria-pressed', 'false');
    btn.innerHTML = 'Show on the diagram<span class="vh">: ' + names[id] + '</span>';
    btn.addEventListener('click', () => select(id));
    li.appendChild(btn);
    li.addEventListener('pointerenter', () => { if (fine) select(id); });
  });
  Object.entries(spots).forEach(([id, [x, y]]) => {
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.water = id; b.setAttribute('aria-pressed', 'false');
    b.setAttribute('aria-label', 'Show on the diagram: ' + names[id]);
    b.style.left = (x / 800 * 100) + '%'; b.style.top = (y / 520 * 100) + '%';
    b.addEventListener('click', () => select(id, true));
    hot.appendChild(b);
  });
  hot.hidden = false;
  select('joints');
}

/* ---------- Gallery filters ---------- */
function setupGallery() {
  const bar = document.querySelector('.filters');
  if (!bar) return;
  const items = [...document.querySelectorAll('.gal-item')];
  const empty = document.querySelector('.gal-empty');
  const status = document.querySelector('.filter-status');
  bar.hidden = false;
  bar.addEventListener('click', (e) => {
    const b = e.target.closest('button'); if (!b) return;
    const f = b.dataset.filter;
    bar.querySelectorAll('button').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
    let n = 0;
    items.forEach((it) => { const show = f === 'all' || it.dataset.type === f; it.hidden = !show; if (show) n++; });
    if (empty) empty.hidden = n > 0;
    if (status) status.textContent = 'Showing ' + n + ' ' + (n === 1 ? 'project' : 'projects') + (f === 'all' ? '' : ': ' + b.textContent);
  });
}

/* ---------- Before / after sliders (keyboard + touch via a native range input) ---------- */
function setupBeforeAfter() {
  document.querySelectorAll('[data-ba]').forEach((fig) => {
    const range = fig.querySelector('.ba-range');
    if (!range) return;
    range.hidden = false;
    fig.classList.add('is-live');
    const set = () => {
      fig.style.setProperty('--pos', range.value + '%');
      range.setAttribute('aria-valuetext', range.value + '% after image shown');
    };
    range.addEventListener('input', set);
    set();
  });
}

/* ---------- Estimate form: chips preselect, photos, commercial toggle, concept submit ---------- */
function setupForm() {
  const form = document.querySelector('form.est');
  if (!form) return;
  const company = form.querySelector('.company');
  const commercial = form.querySelector('#f-commercial');
  if (company && commercial) {
    company.hidden = !commercial.checked;
    commercial.addEventListener('change', () => { company.hidden = !commercial.checked; });
  }
  document.querySelectorAll('[data-service]').forEach((a) => a.addEventListener('click', () => {
    const v = a.dataset.service;
    form.querySelectorAll('input[name=service]').forEach((cb) => { if (cb.value === v) cb.checked = true; });
    if (a.dataset.commercial && commercial) { commercial.checked = true; company.hidden = false; }
  }));
  // photo thumbnails (local only: nothing is uploaded)
  const file = form.querySelector('#f-photos');
  const thumbs = form.querySelector('.thumbs');
  let picked = [];
  const draw = () => {
    thumbs.querySelectorAll('img').forEach((i) => URL.revokeObjectURL(i.src));
    thumbs.innerHTML = '';
    picked.forEach((f, i) => {
      const li = document.createElement('li');
      const img = document.createElement('img'); img.alt = 'Selected photo ' + (i + 1); img.src = URL.createObjectURL(f);
      const rm = document.createElement('button'); rm.type = 'button'; rm.textContent = '×'; rm.setAttribute('aria-label', 'Remove photo ' + (i + 1) + ' (' + f.name + ')');
      rm.addEventListener('click', () => { picked.splice(i, 1); draw(); file.focus(); });
      const cap = document.createElement('span'); cap.textContent = Math.max(1, Math.round(f.size / 1024)) + ' KB';
      li.append(img, rm, cap); thumbs.appendChild(li);
    });
  };
  if (file && thumbs && window.URL && URL.createObjectURL) file.addEventListener('change', () => {
    picked = picked.concat([...file.files].filter((f) => /^image\//.test(f.type))).slice(0, 5);
    file.value = ''; draw();
  });
  // validation: inline, after blur and on submit
  const rules = {
    'f-name': (v) => v.trim() ? '' : 'Please add your name.',
    'f-contact': (v) => /\S+@\S+\.\S+/.test(v) || v.replace(/\D/g, '').length >= 10 ? '' : 'Add a phone number (10 digits) or an email address.',
    'f-zip': (v) => /^\d{5}$/.test(v.trim()) ? '' : 'ZIP should be 5 digits.'
  };
  const check = (id) => {
    const el = document.getElementById(id); const msg = rules[id](el.value);
    document.getElementById(id + '-err').textContent = msg;
    if (msg) el.setAttribute('aria-invalid', 'true'); else el.removeAttribute('aria-invalid');
    return !msg;
  };
  Object.keys(rules).forEach((id) => document.getElementById(id).addEventListener('blur', (e) => { if (e.target.value) check(id); }));
  const status = form.querySelector('#est-status');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const bad = Object.keys(rules).filter((id) => !check(id));
    if (bad.length) { status.textContent = 'Please fix the highlighted field' + (bad.length > 1 ? 's' : '') + '.'; document.getElementById(bad[0]).focus(); return; }
    status.textContent = 'Concept demo: nothing was sent. On a real site, you’d hear back within one business day.';
  });
}

/* ---------- ZIP check (any 5 digits is "in the area": it's a fictional area) ---------- */
function setupZip() {
  const f = document.querySelector('.zip-check');
  if (!f) return;
  f.hidden = false;
  f.addEventListener('submit', (e) => {
    e.preventDefault();
    const v = f.querySelector('input').value.trim();
    f.querySelector('.zip-out').textContent = /^\d{5}$/.test(v) ? 'You’re in our (fictional) area!' : 'Please enter 5 digits.';
  });
}

/* ---------- Sticky mobile bar: hidden over the hero and the estimate form ---------- */
function setupBar() {
  const bar = document.querySelector('.mbar');
  if (!bar || !hasIO) return;
  const vis = new Map();
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => vis.set(e.target, e.isIntersecting));
    const barHidden = [...vis.values()].some(Boolean);
    bar.classList.toggle('is-hidden', barHidden);
    bar.inert = barHidden;
  }, { threshold: 0.15 });
  ['.hero', '#estimate'].forEach((s) => { const el = document.querySelector(s); if (el) io.observe(el); });
}

/* ---------- Service cards: the light sweeps where the pointer is ---------- */
function setupMicro() {
  if (reduce || !fine) return;
  document.querySelectorAll('.svc').forEach((c) => c.addEventListener('pointermove', (e) => {
    const r = c.getBoundingClientRect();
    c.style.setProperty('--sx', (((e.clientX - r.left) / r.width) * 100).toFixed(0) + '%');
  }, { passive: true }));
}

function init() {
  root.classList.toggle('motion', !reduce);
  if (CAPTURE) root.classList.add('fx-capture');
  setupSeason();
  setupTheme();
  setupReveals('.section-head, .sym, .svc, .price-wrap, .gal-item, .ba, .swatch, .course, .warranty, .trust li, .area-grid > *, .faq details, .est-aside, form.est');
  setupWater();
  setupGallery();
  setupBeforeAfter();
  setupForm();
  setupZip();
  setupBar();
  setupMicro();
  addPauseControl(document.querySelector('.hero'));
  addPauseControl(document.querySelector('#water .section-head'));
  idle(setupHero, { timeout: 800 });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
