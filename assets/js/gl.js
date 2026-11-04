// E.M: tiny WebGL shader engine + the two original shaders used on the home page.
// No libraries. If WebGL or a shader is unavailable, mount() returns null and the
// CSS background underneath stays as the static fallback.

const VERT = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';

const COMMON = `
#extension GL_OES_standard_derivatives : enable
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;      // canvas size in device px
uniform float uTime;    // seconds
uniform float uDpr;     // device px per CSS px
uniform vec2 uPointer;  // 0..1, y up
uniform vec4 uMask;     // text block to keep dark: x0,y0,x1,y1 in device px, y up
uniform float uIntro;   // 0 -> 1 fade in
float hash(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}
float noise(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);
  return mix(mix(hash(i),hash(i+vec2(1.,0.)),u.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),u.x),u.y);}
float fbm(vec2 p){float v=0.,a=.5;mat2 m=mat2(1.6,1.2,-1.2,1.6);
  for(int i=0;i<OCT;i++){v+=a*noise(p);p=m*p;a*=.5;}return v;}
// 0 inside the mask rect, rising to 1 at "soft" device px outside it
float maskK(vec2 frag,float soft){
  vec2 c=(uMask.xy+uMask.zw)*.5, h=(uMask.zw-uMask.xy)*.5;
  vec2 d=abs(frag-c)-h; float s=length(max(d,0.))+min(max(d.x,d.y),0.);
  return smoothstep(-soft*.25,soft,s);
}
`;

// Hero: a slow domain-warped "silk" field drawn as contour lines over a faint
// layout grid. One contour is brand orange and drifts with the flow.
export const HERO = COMMON + `
void main(){
  vec2 frag=gl_FragCoord.xy, uv=frag/uRes;
  float asp=uRes.x/uRes.y;
  vec2 p=vec2(uv.x*asp,uv.y);
  float t=uTime*.035;
  vec2 m=vec2(uPointer.x*asp,uPointer.y);
  float md=length(p-m);
  vec2 q=vec2(fbm(p*1.3+vec2(0.,t*2.)),fbm(p*1.3+vec2(5.2,1.3)-t));
  vec2 r=vec2(fbm(p*1.5+3.*q+vec2(1.7,9.2)+t*1.4),fbm(p*1.5+3.*q+vec2(8.3,2.8)-t));
  r+=(m-p)*.22*exp(-md*2.5);
  float f=fbm(p*1.05+2.3*r);

  vec3 base=vec3(.047,.043,.157), indigo=vec3(.192,.180,.506), brand=vec3(.263,.220,.792);
  vec3 lilac=vec3(.647,.706,.988), orange=vec3(.984,.573,.235);

  // composition: energy pools to the right / lower area, away from the copy
  float energy=smoothstep(.0,.9,uv.x*.9+(1.-uv.y)*.25);
  vec3 col=base;
  col=mix(col,indigo,smoothstep(.25,.75,f)*(.35+.65*energy));
  col=mix(col,brand,smoothstep(.5,.9,f)*.6*energy);
  // a soft light behind the device stage
  vec2 sp=vec2(.74*asp,.5); float sd=length((p-sp)*vec2(.8,1.1));
  col+=brand*.42*exp(-sd*sd*3.2)+orange*.05*exp(-sd*sd*9.);

  // contour lines of the field
  float c=f*15.; float fw=max(fwidth(c),1e-4);
  float d=abs(fract(c)-.5);
  float line=1.-smoothstep(0.,fw*1.3,d);
  float lm=smoothstep(.22,.7,f)*(.25+.75*energy);
  col+=lilac*line*lm*.42;
  float hot=1.-step(.5,abs(floor(c)-8.));
  float glow=exp(-d*d/(fw*fw*22.));
  // the orange contour only shows in one slowly drifting region, so it reads as a single accent
  float accent=smoothstep(.42,.66,fbm(p*.7+vec2(t*1.3,-t*.8)+3.1))*energy;
  col=mix(col,orange,clamp(line*hot*lm*accent*1.3,0.,1.));
  col+=orange*glow*hot*lm*accent*.28;

  // faint 56px layout grid that lights up where the flow passes
  vec2 g=frag/(uDpr*56.);
  vec2 gd=abs(fract(g-.5)-.5)/max(fwidth(g),vec2(1e-4));
  float grid=1.-min(min(gd.x,gd.y),1.);
  float gfade=smoothstep(1.05,.15,uv.y);
  col+=vec3(.55,.6,1.)*grid*gfade*(.02+.10*smoothstep(.45,.9,f)*energy);

  // pointer light
  col+=lilac*.07*exp(-md*md*7.);

  // keep the text block dark for contrast (soft, no hard box)
  float k=maskK(frag,170.*uDpr);
  col=mix(base*1.08+col*.12,col,k);

  float vig=smoothstep(1.25,.25,length((uv-vec2(.6,.5))*vec2(1.,1.2)));
  col*=.78+.22*vig;
  col=mix(base,col,uIntro);
  col+=(hash(frag+fract(uTime*.37))-.5)/255.;
  gl_FragColor=vec4(col,1.);
}`;

// Contact: a quiet dot matrix, like the pixels of a screen, with a slow wave.
// Output is premultiplied alpha so the section background shows through.
export const DOTS = COMMON + `
void main(){
  vec2 frag=gl_FragCoord.xy, uv=frag/uRes;
  float cs=22.*uDpr;
  vec2 cell=frag/cs, id=floor(cell), fc=fract(cell)-.5;
  float n=noise(id*.09+vec2(uTime*.05,-uTime*.03));
  float w=sin(id.x*.16+id.y*.07-uTime*.5)*.5+.5;
  float b=smoothstep(.4,.85,n)*(.35+.65*w);
  float rad=mix(.07,.17,b);
  float dd=length(fc); float aa=1.5/cs;
  float dotv=1.-smoothstep(rad-aa,rad+aa,dd);
  vec3 lilac=vec3(.647,.706,.988), orange=vec3(.984,.573,.235);
  vec3 c=mix(lilac,orange,step(.94,hash(id))*step(.5,b));
  float edge=smoothstep(0.,.35,uv.y)*smoothstep(1.,.75,uv.y);
  float k=maskK(frag,90.*uDpr);
  float a=dotv*(.05+.30*b)*(.25+.75*k)*edge*uIntro;
  gl_FragColor=vec4(c*a,a);
}`;

/**
 * mount(canvas, frag, opts) -> controller | null
 * opts: { scaleCap, octaves, alpha, uniforms(state) -> {pointer:[x,y], mask:[...]} }
 */
export function mount(canvas, frag, opts = {}) {
  const attrs = { antialias: false, alpha: !!opts.alpha, premultipliedAlpha: true, depth: false, stencil: false, powerPreference: 'low-power', preserveDrawingBuffer: !!opts.preserve, failIfMajorPerformanceCaveat: !opts.allowSoftware };
  let gl;
  try { gl = canvas.getContext('webgl', attrs); } catch (e) { gl = null; }
  if (!gl || !gl.getExtension('OES_standard_derivatives')) return null;
  // Software rasterisers (no GPU) can't afford a full-screen shader every frame.
  let software = false;
  try {
    const dbg = gl.getExtension('WEBGL_debug_renderer_info');
    const name = dbg ? gl.getParameter(dbg.UNMASKED_RENDERER_WEBGL) : '';
    software = /swiftshader|llvmpipe|softpipe|software|basic render/i.test(name || '');
  } catch (e) { /* ignore */ }

  const src = frag.replace('#ifdef GL_FRAGMENT_PRECISION_HIGH', '#define OCT ' + (opts.octaves || 4) + '\n#ifdef GL_FRAGMENT_PRECISION_HIGH');
  const sh = (type, s) => { const o = gl.createShader(type); gl.shaderSource(o, s); gl.compileShader(o); return gl.getShaderParameter(o, gl.COMPILE_STATUS) ? o : null; };
  const vs = sh(gl.VERTEX_SHADER, VERT), fs = sh(gl.FRAGMENT_SHADER, src);
  if (!vs || !fs) return null;
  const prog = gl.createProgram();
  gl.attachShader(prog, vs); gl.attachShader(prog, fs); gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) return null;
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'a');
  gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {}; ['uRes', 'uTime', 'uDpr', 'uPointer', 'uMask', 'uIntro'].forEach(n => U[n] = gl.getUniformLocation(prog, n));

  let scale = Math.min(window.devicePixelRatio || 1, opts.scaleCap || 1.5);
  let running = false, raf = 0, last = 0, time = opts.t0 || 0, intro = 0, lost = false;
  const samples = [];
  const stats = { frames: 0, avgMs: 0, scale };

  function resize() {
    const r = canvas.getBoundingClientRect();
    const w = Math.max(1, Math.round(r.width * scale)), h = Math.max(1, Math.round(r.height * scale));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    gl.viewport(0, 0, w, h);
    return r;
  }
  function draw() {
    if (lost) return;
    const r = resize();
    const s = opts.uniforms ? opts.uniforms(r, scale) : {};
    gl.uniform2f(U.uRes, canvas.width, canvas.height);
    gl.uniform1f(U.uTime, time % 1000);
    gl.uniform1f(U.uDpr, scale);
    const p = s.pointer || [0.7, 0.5];
    gl.uniform2f(U.uPointer, p[0], p[1]);
    const m = s.mask || [-9, -9, -9, -9];
    gl.uniform4f(U.uMask, m[0], m[1], m[2], m[3]);
    gl.uniform1f(U.uIntro, intro);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  function frame(now) {
    if (!running) return;
    const dt = last ? Math.min(now - last, 100) : 16.7;
    last = now;
    time += dt / 1000;
    intro = Math.min(1, intro + dt / 1400);
    draw();
    stats.frames++;
    // adaptive resolution: if frames are slow, render fewer pixels
    samples.push(dt);
    if (samples.length === 20) {
      samples.sort((a, b) => a - b);
      const med = samples[10];
      stats.avgMs = +med.toFixed(2);
      if (med > 24 && scale > 0.5) { scale = Math.max(0.5, scale * 0.75); stats.scale = +scale.toFixed(2); }
      samples.length = 0;
    }
    raf = requestAnimationFrame(frame);
  }
  canvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); lost = true; stop(); canvas.classList.remove('is-live'); }, false);

  function start() { if (running || lost) return; running = true; last = 0; raf = requestAnimationFrame(frame); }
  function stop() { running = false; cancelAnimationFrame(raf); }
  function still() { intro = 1; draw(); }
  stats.software = software;
  return { start, stop, still, draw, stats, software, get running() { return running; } };
}
