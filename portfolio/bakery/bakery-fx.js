// Golden Crumb concept site: optional visual effects (WebGL hero, 3D loaf, reveals).
// The page is complete without this file; it only adds motion on top.
const STORE_KEY = 'gc-motion';
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
   Golden Crumb: morning light + flour dust over the hero, and a
   slowly turning 3D sourdough loaf (raymarched, original art).
   ========================================================== */

// Soft sunbeams from the top right and drifting flour motes. Light only
// (never darker than the cream behind), so dark text keeps its contrast.
const LIGHT = `
void main(){
  vec2 frag=gl_FragCoord.xy, uv=frag/uRes; float asp=uRes.x/uRes.y;
  vec2 p=vec2(uv.x*asp,uv.y); float t=uTime;
  vec2 d=p-vec2(asp*1.02,1.12); float ang=atan(d.y,d.x), dist=length(d);
  float rays=smoothstep(.42,.86,fbm(vec2(ang*6.5,t*.045)));
  float a=rays*smoothstep(1.7,.15,dist)*.34;
  vec3 col=vec3(1.,.985,.955)*a;
  for(int L=0;L<3;L++){
    float fl=float(L), sz=30.+fl*30.;
    vec2 q=frag/(uDpr*sz);
    q.y-=t*(.06+.035*fl); q.x+=sin(t*.23+fl*2.)*.35+t*.02;
    vec2 id=floor(q), f=fract(q)-.5;
    vec2 o=(hash2(id+fl*7.)-.5)*.55;
    float on=step(.58,hash(id*1.7+fl));
    float r=.045+.045*fl, bl=.015+fl*.05;
    float m=1.-smoothstep(r-bl,r+bl,length(f-o));
    float tw=.55+.45*sin(t*1.2+hash(id)*6.28);
    float la=m*on*tw*(.85-fl*.22);
    col=vec3(1.,.98,.93)*la+col*(1.-la); a=la+a*(1.-la);
  }
  float k=maskK(frag,150.*uDpr);
  float f=(.4+.6*k)*uIntro;
  gl_FragColor=vec4(col*f,a*f);
}`;

const LOAF = `
uniform float uYaw; uniform float uTilt;
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float sdEll(vec3 p,vec3 r){float k0=length(p/r);float k1=length(p/(r*r));return k0*(k0-1.)/k1;}
float smin(float a,float b,float k){float h=clamp(.5+.5*(b-a)/k,0.,1.);return mix(b,a,h)-k*h*(1.-h);}
float smax(float a,float b,float k){return -smin(-a,-b,k);}
float grooves(vec3 p){
  vec2 q=rot(.55)*p.xz; float g=1e3;
  for(int i=0;i<3;i++){float fi=float(i)-1.; float x=q.x-fi*.36; float len=.62-abs(fi)*.16;
    float tt=clamp(q.y/len,-1.,1.); g=min(g,length(vec2(x,q.y-clamp(q.y,-len,len)))+.032*tt*tt);}
  return g;
}
float mapL(vec3 p){
  p.xz=rot(uYaw)*p.xz;
  float body=sdEll(p-vec3(0.,.05,0.),vec3(1.02,.68,.86));
  body=smax(body,-(p.y+.3),.07);
  float g=grooves(p)+(1.-smoothstep(-.02,.22,p.y))*2.;
  float cutv=max(g-.04,-(body+.05));
  return smax(body,-cutv,.035);
}
vec3 nrm(vec3 p){vec2 e=vec2(.0015,-.0015);
  return normalize(e.xyy*mapL(p+e.xyy)+e.yyx*mapL(p+e.yyx)+e.yxy*mapL(p+e.yxy)+e.xxx*mapL(p+e.xxx));}
vec4 over(vec4 s,vec4 d){return s+d*(1.-s.a);}
void main(){
  vec2 frag=gl_FragCoord.xy; vec2 uv=(frag-.5*uRes)/uRes.y; float px=1.5/uRes.y;
  // honey disc behind, as in the illustrated version
  float disc=1.-smoothstep(.472-px,.472+px,length(uv));
  vec4 acc=vec4(vec3(.957,.812,.525)*.55,.55)*disc;
  vec3 ro=vec3(0.,2.45+uTilt*.5,4.1), ta=vec3(0.,-.12,0.);
  vec3 ww=normalize(ta-ro), uu=normalize(cross(ww,vec3(0.,1.,0.))), vv=cross(uu,ww);
  vec3 rd=normalize(uv.x*uu+uv.y*vv+1.45*ww);
  // wooden board with a visible edge
  float tb=(-.3-ro.y)/rd.y;
  if(tb>0.){
    vec3 bp=ro+rd*tb; float r=length(bp.xz/vec2(1.6,1.22));
    if(r<1.){
      float grain=sin(bp.x*15.+fbm(bp.xz*vec2(.7,2.6))*4.)*.5+.5; grain=smoothstep(.15,.95,grain);
      vec3 wood=mix(vec3(.82,.6,.37),vec3(.66,.43,.23),grain*.55+fbm(bp.xz*1.5)*.2);
      wood*=mix(1.,.8,smoothstep(.86,1.,r));
      vec2 fp=rot(uYaw)*bp.xz; float e=length(fp/vec2(1.08,.84))-1.;
      wood*=mix(.48,1.,smoothstep(-.2,.4,e));
      acc=over(vec4(wood,1.)*(1.-smoothstep(1.-px*3.,1.,r)),acc);
    } else {
      float tb2=(-.42-ro.y)/rd.y; vec3 bq=ro+rd*tb2;
      float r2=length(bq.xz/vec2(1.6,1.22));
      acc=over(vec4(vec3(.52,.32,.16),1.)*(1.-smoothstep(1.-px*4.,1.,r2)),acc);
    }
  }
  // loaf
  vec3 oc=ro-vec3(0.,.05,0.); float b=dot(oc,rd), c=dot(oc,oc)-1.8, h=b*b-c;
  if(h>0.){
    float t=max(-b-sqrt(h),0.), tmax=-b+sqrt(h); bool hit=false; float dmin=1e3;
    for(int i=0;i<72;i++){vec3 p=ro+rd*t; float d=mapL(p); dmin=min(dmin,d); if(d<.0008*t){hit=true;break;} t+=d*.9; if(t>tmax)break;}
    if(hit){
      vec3 p=ro+rd*t, n=nrm(p);
      vec3 q=p; q.xz=rot(uYaw)*q.xz; vec3 nq=n; nq.xz=rot(uYaw)*nq.xz;
      float g=grooves(q), top=smoothstep(-.02,.22,q.y);
      float inG=(1.-smoothstep(.03,.075,g))*top;
      float ear=exp(-((g-.08)/.02)*((g-.08)/.02))*top;
      float blot=fbm(q.xz*5.+q.y*3.);
      vec3 crust=mix(vec3(.74,.47,.21),vec3(.40,.19,.07),clamp(smoothstep(-.15,.6,q.y)*.75+(blot-.5)*.5,0.,1.));
      crust=mix(crust,vec3(.30,.13,.04),ear*.6);
      vec3 alb=mix(crust,vec3(.95,.85,.64),inG);
      alb=mix(alb,vec3(.96,.92,.86),smoothstep(.62,.8,fbm(q.xz*7.+3.))*smoothstep(.6,.95,n.y)*(1.-inG)*.6);
      vec3 L=normalize(vec3(-.55,.85,.55));
      float dif=clamp(dot(n,L)*.7+.3,0.,1.);
      float rim=pow(1.-clamp(dot(n,-rd),0.,1.),3.);
      float spe=pow(clamp(dot(n,normalize(L-rd)),0.,1.),22.)*.16*(1.-inG);
      vec3 col=alb*(.3+.8*dif*vec3(1.,.93,.82))+vec3(.95,.68,.38)*rim*.3+spe;
      col*=mix(.6,1.,smoothstep(-.32,-.12,q.y));
      acc=over(vec4(col,1.),acc);
    }
  }
  // steam rising from the fresh loaf
  float sx=(uv.x+.02)/.17;
  float wisp=smoothstep(.42,.8,fbm(vec2(uv.x*6.+sin(uv.y*5.+uTime*.7)*.35,uv.y*3.2-uTime*.32)));
  float sa=wisp*exp(-sx*sx)*smoothstep(.0,.12,uv.y)*smoothstep(.46,.2,uv.y)*.75;
  acc=over(vec4(vec3(1.,.99,.96)*sa,sa),acc);
  gl_FragColor=acc*uIntro;
}`;

function setupBakeryGL() {
  const hero = document.querySelector('.hero');
  const art = hero && hero.querySelector('.hero-art');
  const copy = hero && hero.querySelector('.hero-grid > div');
  if (!hero) return;
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  if (fine && !reduce) hero.addEventListener('pointermove', (e) => {
    ptr.tx = (e.clientX / window.innerWidth) * 2 - 1; ptr.ty = (e.clientY / window.innerHeight) * 2 - 1;
  }, { passive: true });

  // 1. light + flour dust overlay
  const c1 = document.createElement('canvas');
  c1.className = 'fx-canvas fx-light'; c1.setAttribute('aria-hidden', 'true');
  hero.prepend(c1);
  const light = mount(c1, LIGHT, { scaleCap: small() ? 1 : 1.25, t0: 8, uniforms: (r, s) => ({ mask: copy ? relRect(copy, r, s, 0) : null }) });
  if (light) { c1.classList.add('is-live'); drive(hero, light, '0px'); } else c1.remove();

  // 2. the 3D loaf replaces the flat illustration (which stays as the fallback)
  if (!art) return;
  const c2 = document.createElement('canvas');
  c2.className = 'fx-canvas fx-loaf'; c2.setAttribute('aria-hidden', 'true');
  art.prepend(c2);
  let shown = false;
  const loaf = mount(c2, LOAF, {
    scaleCap: small() ? 1 : 2, t0: 0,
    uniforms: (r, s, t) => {
      ptr.x += (ptr.tx - ptr.x) * 0.05; ptr.y += (ptr.ty - ptr.y) * 0.05;
      // capture: one full turn per 9 s video loop, so the loop is seamless
      return { extra: { uYaw: -0.5 + t * (CAPTURE ? 6.2832 / 9 : 0.22) + ptr.x * 0.5, uTilt: ptr.y * 0.6 } };
    },
    onDraw: () => {
      if (shown) return; shown = true;
      c2.classList.add('is-live'); art.classList.add('gl-on');
      const title = document.getElementById('hero-art-title');
      if (title) title.textContent = 'Illustration of a round, scored sourdough loaf on a wooden board, still steaming from the oven';
    },
    onLost: () => art.classList.remove('gl-on')
  });
  if (loaf) drive(art, loaf, '0px'); else c2.remove();
}

function setupBakeryMicro() {
  if (reduce) return;
  if (fine) {
    // Gallery tiles lean toward the pointer
    document.querySelectorAll('.tile').forEach((t) => {
      t.addEventListener('pointermove', (e) => {
        const r = t.getBoundingClientRect();
        t.style.setProperty('--ry', (((e.clientX - r.left) / r.width - 0.5) * 8).toFixed(2) + 'deg');
        t.style.setProperty('--rx', (-((e.clientY - r.top) / r.height - 0.5) * 8).toFixed(2) + 'deg');
      }, { passive: true });
      t.addEventListener('pointerleave', () => { t.style.setProperty('--rx', '0deg'); t.style.setProperty('--ry', '0deg'); });
    });
    // A warm glow follows the pointer across the order panel
    const order = document.querySelector('.order');
    if (order) order.addEventListener('pointermove', (e) => {
      const r = order.getBoundingClientRect();
      order.style.setProperty('--gx', (e.clientX - r.left).toFixed(0) + 'px');
      order.style.setProperty('--gy', (e.clientY - r.top).toFixed(0) + 'px');
    }, { passive: true });
  }
}

function init() {
  root.classList.toggle('motion', !reduce);
  if (CAPTURE) root.classList.add('fx-capture');
  setupReveals('.section-head, .menu-card, .gallery-grid > li, .order, .visit-grid > .card');
  setupBakeryMicro();
  addPauseControl(document.querySelector('.hero'));
  idle(setupBakeryGL, { timeout: 800 });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
