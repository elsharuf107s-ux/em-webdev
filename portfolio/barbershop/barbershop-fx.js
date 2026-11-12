// Hex & Hone concept site: optional effects (WebGL hex-LED barbershop hero, reveals, count-ups,
// theme toggle, hours, booking demo). The page is complete without this file.
const root = document.documentElement;
const STORE_KEY = 'hh-motion';
const reduceMQ = window.matchMedia('(prefers-reduced-motion: reduce)');
let reduce = reduceMQ.matches;
const hasIO = 'IntersectionObserver' in window;
const fine = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const TEST = !!window.__emfxTest;        // QA hooks (screenshots, video capture)
const CAPTURE = !!window.__emfxCapture;  // capture mode: no UI chrome, everything revealed, lights on
let paused = false;
try { paused = localStorage.getItem(STORE_KEY) === 'paused'; } catch (e) { /* storage blocked */ }
if (CAPTURE) paused = false;
const loops = [];
const resumers = [];

/* ================= WebGL hero: a barbershop interior lit by a hexagon LED ceiling =================
   One fullscreen triangle, analytic ray casting: ceiling (hex tubes), side walls (ring-light mirrors),
   chairs (boxes), a glossy floor that reflects the ceiling, and a hex sign on the back wall.
   Everything is periodic over LOOP seconds (the camera dollies exactly one station), so any
   8-second window loops seamlessly. */
const LOOP = 8;
const FRAG = `
uniform vec2 uRes; uniform float uT, uOn, uScroll, uCx, uFocal; uniform vec2 uPar;
#define TAU 6.2831853
const float W = 2.5;   // half width of the room
const float HC = 1.55; // ceiling height above the eye
const float HF = -1.5; // floor
const float ZB = 40.;  // back wall
const float S = 3.6;   // station spacing along each wall
const float Z0 = 2.2;
const float HS = 1.4433757; // hex scale: exactly 3 hex rows per station, so the dolly loops cleanly
float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
vec4 hexC(vec2 p){const vec2 s=vec2(1.,1.7320508);vec4 hc=floor(vec4(p,p-vec2(.5,1.))/s.xyxy)+.5;
  vec4 h=vec4(p-hc.xy*s,p-(hc.zw+.5)*s);return dot(h.xy,h.xy)<dot(h.zw,h.zw)?vec4(h.xy,hc.xy):vec4(h.zw,hc.zw+.5);}
float hexD(vec2 p){p=abs(p);return max(dot(p,vec2(.5,.8660254)),p.x);}
float camZ(){ return uT*(S/${LOOP.toFixed(1)}); }
// A tube switches on centre-first with a starter flicker, then holds (rare flicker after).
float cellOn(vec2 id){
  vec2 cam=vec2(0., floor(camZ()*HS/1.7320508));
  float ton=.15+min(length(id-cam)*.07,2.2)+h21(id)*.8; float x=uOn-ton;
  if(x<0.) return 0.;
  if(x<.45) return step(.4,h21(id+floor(uOn*24.)))*(.5+x);
  return 1.-.6*step(.9985,h21(id+floor(uT*6.)));
}
float ringPulse(float id,float side){ return .74+.26*pow(.5+.5*sin(TAU*(id*.25-uT*.15625)+side*1.7),3.); }
float ringOn(float id,float side){
  float ton=1.1+abs(id-floor(camZ()/S))*.16+side*.08; float x=uOn-ton;
  if(x<0.) return 0.;
  if(x<.4) return step(.45,h21(vec2(id,side)+floor(uOn*20.)));
  return 1.;
}
vec3 ceiling(vec2 xz, float blur){
  vec4 h=hexC(xz*HS);
  float e=.5-hexD(h.xy);
  float w=fwidth(e)*blur+1e-4;
  float tube=.035;
  float core=1.-smoothstep(tube-w,tube+w,e);
  core=mix(core,tube*3.,smoothstep(.05,.22,w));
  float glow=exp(-e*24.)*.38+exp(-e*7.)*.09;
  float on=cellOn(h.zw);
  float inner=step(abs(xz.x),W-.32);
  // perimeter tube that frames the honeycomb
  float fe=abs(abs(xz.x)-(W-.22)); float fw=fwidth(fe)*blur+1e-4;
  float frame=(1.-smoothstep(.02-fw,.02+fw,fe))+exp(-fe*30.)*.3;
  float fon=step(1.,uOn);
  return vec3(.97,.985,1.)*((core*1.1+glow)*on*inner+frame*fon*.9);
}
vec3 wall(vec3 p, float side){
  float zz=p.z-Z0-S*.5*step(0.,side);
  float id=floor(zz/S+.5);
  float zl=zz-id*S;
  vec2 q=vec2(zl,p.y-.2);
  float r=length(q), R=.62;
  float d=abs(r-R);
  float w=fwidth(d)+1e-4;
  float on=ringOn(id,side), pulse=ringPulse(id,side);
  vec3 col=vec3(.012);
  float inM=1.-smoothstep(R-.07-w,R-.07+w,r);
  vec3 mirror=vec3(.03)+vec3(.07)*smoothstep(.5,-.5,q.y+q.x*.4)+vec3(.05)*exp(-abs(q.x+q.y*.35+.1)*18.);
  col=mix(col,mirror,inM);
  float core=1.-smoothstep(.038-w,.038+w,d);
  col+=(core*1.25+exp(-d*15.)*.34+exp(-d*4.)*.11)*pulse*on;
  // counter under the mirror, its edge catching the light
  float sh=abs(p.y+.62);
  col+=(1.-smoothstep(.012,.012+w*2.,sh))*.16*on+exp(-sh*24.)*.03;
  // light spill from the ceiling down the wall
  col+=vec3(.08)*exp(-(HC-p.y)*2.)*step(1.,uOn);
  return col;
}
vec3 backWall(vec3 p){
  vec2 q=p.xy-vec2(0.,.1);
  float e=abs(hexD(q.yx)-.9); float w=fwidth(e)+1e-4;
  return vec3(.01)+((1.-smoothstep(.03-w,.03+w,e))*1.2+exp(-e*10.)*.4)*step(2.2,uOn);
}
// Ray/box (centre c, half size b). Writes nearest t + normal.
void box(vec3 ro, vec3 rd, vec3 c, vec3 b, inout float tb, inout vec3 nb){
  vec3 m=1./rd, n=m*(ro-c), k=abs(m)*b;
  vec3 t1=-n-k, t2=-n+k;
  float tN=max(max(t1.x,t1.y),t1.z), tF=min(min(t2.x,t2.y),t2.z);
  if(tN>tF||tF<0.||tN>tb||tN<0.) return;
  tb=tN; nb=-sign(rd)*step(t1.yzx,t1.xyz)*step(t1.zxy,t1.xyz);
}
// Everything except the floor (used for direct rays and the floor reflection).
vec3 scene(vec3 ro, vec3 rd, float blur, out float th){
  float t=1e5; int kind=0; float side=1.;
  if(rd.y>0.){ float tc=(HC-ro.y)/rd.y; if(tc<t){t=tc;kind=1;} }
  float sx=sign(rd.x); float tw=(sx*W-ro.x)/rd.x; if(tw>0.&&tw<t){t=tw;kind=2;side=sx;}
  float tbk=(ZB-ro.z)/rd.z; if(tbk>0.&&tbk<t){t=tbk;kind=3;}
  th=t;
  vec3 p=ro+rd*t; vec3 col;
  if(kind==1) col=ceiling(p.xz,blur);
  else if(kind==2) col=wall(p,side);
  else if(kind==3) col=backWall(p);
  else col=vec3(0.);
  return col;
}
vec3 chairs(vec3 ro, vec3 rd, inout float t, inout bool hit){
  vec3 nb=vec3(0.); float tb=t; float hz=0., hs=1.;
  // Only the chairs this ray can reach: clip the ray to each row's x-slab, then test the 1-3 stations in that z range.
  for(int s=0;s<2;s++){
    float side=s==0?-1.:1.;
    if(rd.x*side<=1e-4) continue;
    float ta=max((side*(W-1.43)-ro.x)/rd.x,0.), tc=(side*(W-.57)-ro.x)/rd.x;
    if(tc<=0.||ta>tb) continue;
    float ya=ro.y+rd.y*ta, yc=ro.y+rd.y*tc;
    if(min(ya,yc)>HF+1.85) continue;
    float za=ro.z+rd.z*ta, zc=ro.z+rd.z*tc, zoff=Z0+S*.5*step(0.,side);
    float k0=ceil((min(za,zc)-.37-zoff)/S), k1=floor((max(za,zc)+.37-zoff)/S);
    float x=side*(W-1.);
    for(int k=0;k<3;k++){
      float id=k0+float(k);
      if(id>k1) break;
      float z=zoff+id*S;
      float tOld=tb;
      box(ro,rd,vec3(x,HF+.80,z),vec3(.31,.085,.30),tb,nb);            // seat
      box(ro,rd,vec3(x-side*.31,HF+1.24,z),vec3(.055,.38,.27),tb,nb);  // back
      box(ro,rd,vec3(x-side*.31,HF+1.74,z),vec3(.05,.09,.14),tb,nb);   // headrest
      box(ro,rd,vec3(x,HF+1.02,z-.31),vec3(.25,.03,.035),tb,nb);       // arms
      box(ro,rd,vec3(x,HF+1.02,z+.31),vec3(.25,.03,.035),tb,nb);
      box(ro,rd,vec3(x,HF+.40,z),vec3(.065,.33,.065),tb,nb);           // column
      box(ro,rd,vec3(x,HF+.03,z),vec3(.34,.03,.34),tb,nb);             // base
      box(ro,rd,vec3(x+side*.36,HF+.38,z),vec3(.06,.02,.2),tb,nb);     // footrest
      if(tb<tOld){hz=z;hs=side;}
    }
  }
  if(tb>=t) return vec3(0.);
  hit=true; t=tb;
  vec3 p=ro+rd*tb;
  float zz=hz-Z0-hs*S*.5*step(0.,hs); float id=floor(zz/S+.5);
  vec3 lp=vec3(hs*W,.2,hz); vec3 L=lp-p; float dl=dot(L,L); L=normalize(L);
  float on=ringOn(id,hs)*ringPulse(id,hs);
  float dif=max(dot(nb,L),0.)*.9*on/(1.+dl*.6);
  vec3 hv=normalize(L-rd); float spec=pow(max(dot(nb,hv),0.),30.)*1.1*on;
  float top=max(nb.y,0.)*.1*step(1.,uOn)+pow(1.-abs(dot(nb,-rd)),3.)*.05;
  return vec3(.016)+vec3(dif+spec+top);
}
void main(){
  vec2 uv=(gl_FragCoord.xy-vec2(uCx*uRes.x,.5*uRes.y))/uRes.y;
  float ph=TAU*uT/${LOOP.toFixed(1)};
  vec3 ro=vec3(.16*sin(ph)+uPar.x*.3,.04*sin(ph*2.)-uPar.y*.05,camZ());
  vec3 rd=normalize(vec3(uv,uFocal));
  float pitch=.17+uScroll*.16+uPar.y*.04, yaw=.05*sin(ph+.6)+uPar.x*.05;
  float cp=cos(pitch),sp=sin(pitch); rd=vec3(rd.x,rd.y*cp+rd.z*sp,-rd.y*sp+rd.z*cp);
  float cy=cos(yaw),sy=sin(yaw); rd=vec3(rd.x*cy+rd.z*sy,rd.y,-rd.x*sy+rd.z*cy);
  float t; vec3 col=scene(ro,rd,1.,t);
  bool hit=false;
  // floor
  if(rd.y<0.){
    float tf=(HF-ro.y)/rd.y;
    if(tf<t){
      t=tf; vec3 p=ro+rd*tf;
      vec3 rr=vec3(rd.x,-rd.y,rd.z); float t2;
      vec3 refl=scene(p,rr,2.6,t2);
      float fres=.2+.45*pow(1.-abs(rd.y),5.);
      // tiles: faint seams
      vec2 g=abs(fract(p.xz*.8)-.5); float seam=smoothstep(.49,.5,max(g.x,g.y));
      col=refl*fres*exp(-t2*.05)+vec3(.006)+seam*.01;
    }
  }
  vec3 ch=chairs(ro,rd,t,hit);
  if(hit) col=ch;
  col*=exp(-t*.052);
  col=1.-exp(-col*1.55);
  col*=1.-.32*dot(uv-vec2(.05,0.),uv-vec2(.05,0.));
  col+=(h21(gl_FragCoord.xy+fract(uT*7.))-.5)/255.;
  gl_FragColor=vec4(col,1.);
}`;

function mountHero(hero) {
  const canvas = document.createElement('canvas');
  canvas.className = 'fx-canvas';
  canvas.setAttribute('aria-hidden', 'true');
  hero.prepend(canvas);
  const attrs = { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: TEST, failIfMajorPerformanceCaveat: !TEST };
  let gl = null;
  try { gl = canvas.getContext('webgl', attrs); } catch (e) { gl = null; }
  if (!gl || !gl.getExtension('OES_standard_derivatives')) { canvas.remove(); return null; }
  let software = false;
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test((dbg && gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL)) || '');
  } catch (e) { /* ignore */ }
  const head = '#extension GL_OES_standard_derivatives : enable\n#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n';
  const sh = (type, src) => { const o = gl.createShader(type); gl.shaderSource(o, src); gl.compileShader(o); return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null; };
  const vs = sh(gl.VERTEX_SHADER, 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}');
  const fs = sh(gl.FRAGMENT_SHADER, head + FRAG);
  if (!vs || !fs) { canvas.remove(); return null; }
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) { canvas.remove(); return null; }
  gl.useProgram(prog);
  gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  const u = (n) => (n in U ? U[n] : (U[n] = gl.getUniformLocation(prog, n)));

  // DPR cap: 1.5 on desktop, 1.25 on phones; adaptive below that if frames run slow.
  let scale = Math.min(window.devicePixelRatio || 1, window.innerWidth < 760 ? 1.25 : 1.5);
  let running = false, raf = 0, last = 0, time = 0, on = 0, lost = false;
  const ptr = { x: 0, y: 0, tx: 0, ty: 0 };
  let scrollV = 0, scrollT = 0;
  const samples = [];
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; stop(); canvas.classList.remove('is-live'); root.classList.remove('gl-on'); });

  function draw() {
    if (lost) return;
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * scale)), h = Math.max(1, Math.round(r.height * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    const wide = r.width >= 1000, portrait = r.height > r.width;
    gl.uniform2f(u('uRes'), w, h);
    gl.uniform1f(u('uT'), time % 1000);
    gl.uniform1f(u('uOn'), on);
    gl.uniform1f(u('uScroll'), scrollV);
    gl.uniform1f(u('uCx'), wide ? 0.66 : 0.5);
    gl.uniform1f(u('uFocal'), portrait ? 0.78 : 1.15);
    gl.uniform2f(u('uPar'), ptr.x, ptr.y);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function frame(now) {
    if (!running) return;
    const dt = last ? Math.min(now - last, 100) : 16.7;
    last = now; time += dt / 1000; on += dt / 1000;
    ptr.x += (ptr.tx - ptr.x) * 0.05; ptr.y += (ptr.ty - ptr.y) * 0.05;
    scrollV += (scrollT - scrollV) * 0.12;
    draw();
    samples.push(dt);
    if (samples.length === 24) {
      samples.sort((a, b) => a - b);
      if (samples[12] > 24 && scale > 0.5) scale = Math.max(0.5, scale * 0.8);
      samples.length = 0;
    }
    raf = requestAnimationFrame(frame);
  }
  function start() { if (running || lost) return; running = true; last = 0; raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  // The still frame: every light on, camera at rest.
  function still() { on = 99; ptr.x = ptr.y = 0; draw(); }
  function renderAt(t) { time = t; on = 99; draw(); }
  if (fine && !reduce) window.addEventListener('pointermove', (e) => {
    ptr.tx = e.clientX / window.innerWidth * 2 - 1; ptr.ty = e.clientY / window.innerHeight * 2 - 1;
  }, { passive: true });
  window.addEventListener('scroll', () => { scrollT = Math.min(1, window.scrollY / Math.max(1, hero.offsetHeight)); }, { passive: true });
  window.addEventListener('resize', () => { if (!running) draw(); }, { passive: true });

  draw();
  requestAnimationFrame(() => { canvas.classList.add('is-live'); root.classList.add('gl-on'); });
  const ctl = { start, stop, still, renderAt, software, canvas, get running() { return running; } };
  loops.push(ctl);
  return ctl;
}

function setupHero() {
  const hero = document.querySelector('.hero');
  if (!hero) return;
  const fx = mountHero(hero);
  if (!fx) return;
  if (CAPTURE) { fx.renderAt(0); return; }
  // Software renderers (no GPU) get the still frame: a full-screen shader would just burn CPU.
  const canAnimate = () => !reduce && !paused && (!fx.software || window.__emfxForceAnimate);
  let inView = true;
  const go = () => { if (inView && !document.hidden && canAnimate()) fx.start(); else { fx.stop(); fx.still(); } };
  if (hasIO) new IntersectionObserver((es) => { inView = es[0].isIntersecting; if (inView) go(); else fx.stop(); }, { rootMargin: '80px' }).observe(hero);
  document.addEventListener('visibilitychange', () => { if (document.hidden) fx.stop(); else go(); });
  resumers.push(go);
  go();
}

/* ================= Scroll reveals + heading "ink" + count-ups ================= */
function countUp(el) {
  if (el.dataset.done) return;
  el.dataset.done = '1';
  const txt = el.textContent, m = txt.match(/^(\D*)(\d+)(.*)$/);
  if (!m) return;
  const end = +m[2], t0 = performance.now(), dur = 1200;
  el.style.fontVariantNumeric = 'tabular-nums';
  const step = (now) => {
    let k = Math.min(1, (now - t0) / dur); k = 1 - Math.pow(1 - k, 3);
    el.textContent = m[1] + Math.round(end * k) + m[3];
    if (k < 1 && !paused) requestAnimationFrame(step); else el.textContent = txt;
  };
  requestAnimationFrame(step);
}
function setupReveals() {
  const els = [...document.querySelectorAll('.reveal, .ink')];
  const counters = [...document.querySelectorAll('[data-count]')];
  const showAll = () => els.forEach((el) => el.classList.add('is-in'));
  if (reduce || !hasIO || CAPTURE) { showAll(); return; }
  const fold = window.innerHeight;
  const io = new IntersectionObserver((es) => es.forEach((e) => {
    if (!e.isIntersecting) return;
    const el = e.target; io.unobserve(el);
    const target = el._ink || el;
    target.classList.add('is-in');
    el.querySelectorAll && el.querySelectorAll('[data-count]').forEach((c) => setTimeout(() => countUp(c), 200));
  }), { rootMargin: '0px 0px -10% 0px', threshold: 0.1 });
  els.forEach((el) => {
    if (el.getBoundingClientRect().top < fold * 0.9) { el.classList.add('is-in'); return; }
    // Ink headings are clipped to zero width while hidden, so watch their parent box instead.
    if (el.classList.contains('ink')) { el.parentElement._ink = el; io.observe(el.parentElement); } else io.observe(el);
  });
  counters.forEach((c) => { if (c.getBoundingClientRect().top < fold * 0.9) countUp(c); });
  window.addEventListener('beforeprint', showAll);
}

/* ================= Pause motion (WCAG 2.2.2) ================= */
function setPaused(p) {
  paused = p;
  root.classList.toggle('motion-paused', p);
  try { localStorage.setItem(STORE_KEY, p ? 'paused' : 'on'); } catch (e) { /* ignore */ }
  document.querySelectorAll('.motion-toggle').forEach((b) => {
    b.setAttribute('aria-pressed', String(p));
    b.querySelector('span').textContent = p ? 'Play motion' : 'Pause motion';
  });
  if (p) { document.querySelectorAll('.reveal, .ink').forEach((el) => el.classList.add('is-in')); loops.forEach((l) => { l.stop(); l.still(); }); }
  resumers.forEach((f) => f());
}
function addPauseControl(spot) {
  if (reduce || CAPTURE || !spot) return;
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'motion-toggle'; b.setAttribute('aria-pressed', 'false');
  b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path class="i-pause" d="M8 5v14M16 5v14" stroke="currentColor" stroke-width="3" stroke-linecap="round" fill="none"/><path class="i-play" d="M7 5v14l12-7z" fill="currentColor"/></svg><span>Pause motion</span>';
  b.addEventListener('click', () => setPaused(!paused));
  spot.appendChild(b);
  if (paused) setPaused(true);
}
if (reduceMQ.addEventListener) reduceMQ.addEventListener('change', (e) => {
  if (!e.matches) return;
  reduce = true; root.classList.remove('motion');
  document.querySelectorAll('.reveal, .ink').forEach((el) => el.classList.add('is-in'));
  loops.forEach((l) => { l.stop(); l.still(); });
});

/* ================= Theme toggle: system -> light -> dark ================= */
function setupTheme() {
  const slot = document.querySelector('.theme-slot');
  if (!slot) return;
  const icons = {
    system: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="3" y="4" width="18" height="12" rx="1.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 20h8M12 16v4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    light: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><circle cx="12" cy="12" r="4.5" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M4.9 19.1 7 17M17 7l2.1-2.1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
    dark: '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>'
  };
  let mode = 'system';
  try { mode = localStorage.getItem('hh-theme') || 'system'; } catch (e) { /* ignore */ }
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'theme-btn';
  const apply = () => {
    if (mode === 'system') root.removeAttribute('data-theme'); else root.setAttribute('data-theme', mode);
    try { if (mode === 'system') localStorage.removeItem('hh-theme'); else localStorage.setItem('hh-theme', mode); } catch (e) { /* ignore */ }
    b.innerHTML = icons[mode] + '<span class="vh">Theme: ' + mode + '. Change theme</span>';
    b.title = 'Theme: ' + mode;
  };
  b.addEventListener('click', () => { mode = mode === 'system' ? 'light' : mode === 'light' ? 'dark' : 'system'; apply(); });
  apply();
  slot.replaceWith(b);
}

/* ================= Hours: today's row + open/closed (shop time, America/New_York) ================= */
function setupHours() {
  const hours = { 0: [10, 16], 1: [9, 20], 2: [9, 20], 3: [9, 20], 4: [9, 20], 5: [9, 20], 6: [8, 18] };
  let day, now;
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', weekday: 'short', hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date());
    const get = (t) => (parts.find((p) => p.type === t) || {}).value;
    day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
    now = (parseInt(get('hour'), 10) % 24) + parseInt(get('minute'), 10) / 60;
  } catch (e) { return; }
  if (day < 0 || isNaN(now)) return;
  const row = document.querySelector('.hours tr[data-days="' + day + '"]');
  if (row) row.classList.add('is-today');
  const st = document.getElementById('open-status');
  if (!st) return;
  const h = hours[day];
  const fmt = (x) => (x > 12 ? x - 12 : x) + (x >= 12 ? 'pm' : 'am');
  const open = now >= h[0] && now < h[1];
  st.classList.toggle('is-closed', !open);
  st.querySelector('span:last-child').textContent = open ? 'Open now · until ' + fmt(h[1]) : (now < h[0] ? 'Opens ' + fmt(h[0]) + ' today' : 'Closed now · open 7 days');
}

/* ================= Booking demo ================= */
function setupBooking() {
  const form = document.querySelector('form.book');
  if (!form) return;
  const sel = form.querySelector('#f-barber');
  document.querySelectorAll('[data-barber]').forEach((a) => a.addEventListener('click', () => { sel.value = a.dataset.barber; }));
  const status = form.querySelector('#book-status');
  const fields = [
    { el: form.querySelector('#f-name'), err: form.querySelector('#f-name-err'), ok: (v) => v.trim().length >= 2, msg: 'Add your name so we know who to expect.' },
    { el: form.querySelector('#f-phone'), err: form.querySelector('#f-phone-err'), ok: (v) => v.replace(/\D/g, '').length >= 10, msg: 'Enter a 10-digit mobile number so we can text your reminder.' }
  ];
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    let first = null;
    fields.forEach((f) => {
      const good = f.ok(f.el.value);
      f.el.setAttribute('aria-invalid', String(!good));
      f.err.textContent = good ? '' : f.msg;
      if (!good && !first) first = f.el;
    });
    if (first) { status.textContent = ''; first.focus(); return; }
    const svc = form.querySelector('input[name="service"]:checked').value;
    const time = form.querySelector('input[name="time"]:checked').value;
    status.textContent = 'Concept demo: nothing was sent. On a real site, ' + svc.toLowerCase() + ' with ' + sel.value.replace('First available', 'the first available barber') + ' (' + form.querySelector('#f-day').value.toLowerCase() + ', ' + time.toLowerCase() + ') would be confirmed by text.';
  });
}

/* ================= Sticky mobile bar: hidden over the hero and the booking form ================= */
function setupBar() {
  const bar = document.querySelector('.mbar');
  if (!bar || !hasIO) return;
  const vis = new Map();
  const io = new IntersectionObserver((es) => {
    es.forEach((e) => vis.set(e.target, e.isIntersecting));
    const hide = [...vis.values()].some(Boolean);
    bar.classList.toggle('is-hidden', hide);
    bar.inert = hide;
  }, { threshold: 0.15 });
  ['.hero', 'form.book'].forEach((s) => { const el = document.querySelector(s); if (el) io.observe(el); });
}

/* ================= Init ================= */
function init() {
  root.classList.toggle('motion', !reduce && !CAPTURE);
  if (CAPTURE) root.classList.add('fx-capture');
  setupTheme();
  setupHours();
  setupBooking();
  setupBar();
  setupReveals();
  addPauseControl(document.querySelector('.hero'));
  setupHero();
  if (TEST) window.__emfx = { loops, renderAt: (t) => loops.forEach((l) => l.renderAt(t)), LOOP };
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
