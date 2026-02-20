// ----------------------
// Grade v2 (4:5 Canvas)
// ----------------------
const gradeCanvas = document.getElementById("gradeCanvas");
const gctx = gradeCanvas.getContext("2d");

const gradeUpload = document.getElementById("gradeUpload");
const autoGradeBtn = document.getElementById("autoGradeBtn");
const resetGradeBtn = document.getElementById("resetGradeBtn");
const downloadGradeBtn = document.getElementById("downloadGradeBtn");
const nextImgBtn = document.getElementById("nextImgBtn");

const bSlider = document.getElementById("bSlider"); // brightness
const cSlider = document.getElementById("cSlider"); // contrast
const sSlider = document.getElementById("sSlider"); // saturation
const kSlider = document.getElementById("kSlider"); // clarity

const bReset = document.getElementById("bReset");
const cReset = document.getElementById("cReset");
const sReset = document.getElementById("sReset");
const kReset = document.getElementById("kReset");

const gradeWrap = gradeCanvas.closest(".canvas-wrap");

// File queue
let files = [];
let idx = 0;

// Image
let srcImg = new Image();

// Transform for foreground positioning (contain baseline + user adjustments)
let baseScale = 1;    // contain scale
let scaleMult = 1;    // user zoom multiplier
let offX = 0;         // user offset in canvas pixels
let offY = 0;

// Interaction state
let isInteracting = false;
let hideGridTimer = null;
let lastTouch = null;
let lastDist = null;
let mouseDown = false;
let lastMouse = null;

// Pixel buffers
let baseImageData = null; // pixels after drawing base (blur bg + fg) before grading

// Auto-grade memory (for per-slider reset)
let autoActive = false;
let autoApplied = { b: 0, c: 0, s: 0, k: 0 };

// ---------- Helpers ----------
function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

function startInteracting(){
  isInteracting = true;
  if (hideGridTimer) clearTimeout(hideGridTimer);
}

function stopInteractingSoon(){
  if (hideGridTimer) clearTimeout(hideGridTimer);
  hideGridTimer = setTimeout(() => {
    isInteracting = false;
    render();
  }, 650);
}

function touchDist(t1, t2){
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.hypot(dx, dy);
}

function drawThirds(ctx){
  const w = gradeCanvas.width, h = gradeCanvas.height;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(w/3, 0);     ctx.lineTo(w/3, h);
  ctx.moveTo(2*w/3, 0);   ctx.lineTo(2*w/3, h);
  ctx.moveTo(0, h/3);     ctx.lineTo(w, h/3);
  ctx.moveTo(0, 2*h/3);   ctx.lineTo(w, 2*h/3);
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.75)";
  const pts = [[w/3,h/3],[2*w/3,h/3],[w/3,2*h/3],[2*w/3,2*h/3]];
  for (const [x,y] of pts){
    ctx.fillRect(x-3, y-3, 6, 6);
  }
  ctx.restore();
}

function setSliders(b,c,s,k){
  bSlider.value = String(b);
  cSlider.value = String(c);
  sSlider.value = String(s);
  kSlider.value = String(k);
}

function currentSliderValues(){
  return {
    b: parseInt(bSlider.value,10),
    c: parseInt(cSlider.value,10),
    s: parseInt(sSlider.value,10),
    k: parseInt(kSlider.value,10),
  };
}

// ---------- Drawing pipeline ----------
// 1) Draw blurred background (cover)
// 2) Draw foreground (contain baseline + user offset/zoom)
// 3) Capture baseImageData
function drawBase(){
  if (!srcImg.src) return;

  const cw = gradeCanvas.width, ch = gradeCanvas.height;
  const iw = srcImg.width, ih = srcImg.height;

  gctx.clearRect(0,0,cw,ch);

  // Background = cover
  const bgScale = Math.max(cw/iw, ch/ih);
  const bgW = iw * bgScale;
  const bgH = ih * bgScale;
  const bgX = (cw - bgW)/2;
  const bgY = (ch - bgH)/2;

  gctx.save();
  gctx.filter = "blur(24px)";
  gctx.drawImage(srcImg, bgX, bgY, bgW, bgH);
  gctx.filter = "none";
  gctx.fillStyle = "rgba(0,0,0,0.18)";
  gctx.fillRect(0,0,cw,ch);
  gctx.restore();

  // Foreground baseline = contain
  baseScale = Math.min(cw/iw, ch/ih);

  const fgScale = baseScale * scaleMult;
  const fgW = iw * fgScale;
  const fgH = ih * fgScale;

  // baseline centered, then user offsets
  const fgX = (cw - fgW)/2 + offX;
  const fgY = (ch - fgH)/2 + offY;

  gctx.drawImage(srcImg, fgX, fgY, fgW, fgH);

  // Rule-of-thirds overlay during interaction
  if (isInteracting) drawThirds(gctx);

  // Capture base pixels (pre-grade)
  baseImageData = gctx.getImageData(0,0,cw,ch);
}

// Apply grading on top of baseImageData
function applyAdjustments(b, c, s, k){
  if (!baseImageData) return;

  const out = new ImageData(
    new Uint8ClampedArray(baseImageData.data),
    baseImageData.width,
    baseImageData.height
  );

  const d = out.data;

  // brightness: [-40..40] => offset
  const bOff = b * 2.0;

  // contrast: classic curve, c in [-40..40] ok
  const cFac = (259 * (c + 255)) / (255 * (259 - c));

  // saturation factor
  const sFac = 1 + (s / 60);

  // clarity-ish midtone contrast
  const kFac = 1 + (k / 120);

  for (let i=0; i<d.length; i+=4){
    let r=d[i], g=d[i+1], bb=d[i+2];

    // brightness
    r += bOff; g += bOff; bb += bOff;

    // contrast
    r = cFac*(r-128)+128;
    g = cFac*(g-128)+128;
    bb = cFac*(bb-128)+128;

    // saturation via gray mix
    const gray = 0.2126*r + 0.7152*g + 0.0722*bb;
    r = gray + (r-gray)*sFac;
    g = gray + (g-gray)*sFac;
    bb = gray + (bb-gray)*sFac;

    // clarity-ish
    r = 128 + (r-128)*kFac;
    g = 128 + (g-128)*kFac;
    bb = 128 + (bb-128)*kFac;

    d[i]   = clamp(r,0,255);
    d[i+1] = clamp(g,0,255);
    d[i+2] = clamp(bb,0,255);
  }

  gctx.putImageData(out, 0, 0);
}

function render(){
  if (!srcImg.src) {
    // placeholder
    gctx.clearRect(0,0,gradeCanvas.width,gradeCanvas.height);
    gctx.fillStyle = "#000";
    gctx.fillRect(0,0,gradeCanvas.width,gradeCanvas.height);
    gctx.fillStyle = "rgba(255,255,255,0.55)";
    gctx.font = "800 72px system-ui";
    gctx.fillText("Fotos laden …", 70, 160);
    gctx.fillStyle = "rgba(255,255,255,0.35)";
    gctx.font = "500 34px system-ui";
    gctx.fillText("Dann verschieben / zoomen", 70, 220);
    return;
  }

  drawBase();
  const {b,c,s,k} = currentSliderValues();
  applyAdjustments(b,c,s,k);
}

// ---------- Auto-grade ----------
function computeLumaStats(imageData){
  const d = imageData.data;
  const step = 16;
  let sum=0, sum2=0, n=0;

  for (let i=0; i<d.length; i += 4*step){
    const r=d[i], g=d[i+1], b=d[i+2];
    const y = 0.2126*r + 0.7152*g + 0.0722*b;
    sum += y; sum2 += y*y; n++;
  }
  const mean = sum/n;
  const varr = sum2/n - mean*mean;
  const std = Math.sqrt(Math.max(0,varr));
  return { mean, std };
}

function runAutoGrade(){
  if (!baseImageData) return;

  // Stats from current base (includes your framing)
  const { mean, std } = computeLumaStats(baseImageData);

  // Targets (sports/outdoor neutral)
  const targetMean = 135;
  const targetStd  = 55;

  const b = clamp((targetMean - mean) / 2, -20, 20);
  const c = clamp((targetStd - std) / 2, -20, 20);

  // saturation adaptive
  const s = clamp((50 - std) / 3, -10, 12);

  // clarity mild
  const k = clamp((targetStd - std) / 6, 0, 12);

  const bb = Math.round(b);
  const cc = Math.round(c);
  const ss = Math.round(s);
  const kk = Math.round(k);

  autoActive = true;
  autoApplied = { b: bb, c: cc, s: ss, k: kk };

  // sliders jump to auto values
  setSliders(bb, cc, ss, kk);
  render();
}

// ---------- File loading ----------
function loadCurrent(){
  if (!files.length) return;
  const f = files[idx];
  const reader = new FileReader();
  reader.onload = (ev) => { srcImg.src = ev.target.result; };
  reader.readAsDataURL(f);
}

srcImg.onload = () => {
  // reset framing
  scaleMult = 1;
  offX = 0;
  offY = 0;

  // reset grading
  autoActive = false;
  autoApplied = { b:0, c:0, s:0, k:0 };
  setSliders(0,0,0,0);

  render();
};

// ---------- Events: upload / next / download ----------
gradeUpload.addEventListener("change", (e) => {
  files = Array.from(e.target.files || []);
  idx = 0;
  if (files.length) loadCurrent();
  else render();
});

nextImgBtn.addEventListener("click", () => {
  if (!files.length) return;
  idx = (idx + 1) % files.length;
  loadCurrent();
});

downloadGradeBtn.addEventListener("click", () => {
  const a = document.createElement("a");
  const name = files[idx]?.name ? files[idx].name.replace(/\.[^.]+$/, "") : "graded";
  a.download = `${name}_graded.png`;
  a.href = gradeCanvas.toDataURL("image/png");
  a.click();
});

// ---------- Events: sliders ----------
[bSlider, cSlider, sSlider, kSlider].forEach(sl => {
  sl.addEventListener("input", () => {
    autoActive = false; // manual override
    render();
  });
});

// Per-slider reset: back to auto value if available, otherwise 0
bReset.addEventListener("click", () => { bSlider.value = String(autoActive ? autoApplied.b : 0); render(); });
cReset.addEventListener("click", () => { cSlider.value = String(autoActive ? autoApplied.c : 0); render(); });
sReset.addEventListener("click", () => { sSlider.value = String(autoActive ? autoApplied.s : 0); render(); });
kReset.addEventListener("click", () => { kSlider.value = String(autoActive ? autoApplied.k : 0); render(); });

autoGradeBtn.addEventListener("click", () => {
  // ensure baseImageData updated with current framing
  render();
  runAutoGrade();
});

resetGradeBtn.addEventListener("click", () => {
  // reset UI and state completely
  files = [];
  idx = 0;
  gradeUpload.value = "";

  srcImg.src = "";
  baseImageData = null;

  autoActive = false;
  autoApplied = { b:0, c:0, s:0, k:0 };
  setSliders(0,0,0,0);

  // reset framing
  scaleMult = 1;
  offX = 0;
  offY = 0;

  // grid off
  isInteracting = false;
  if (hideGridTimer) clearTimeout(hideGridTimer);

  render();
});

// ---------- Positioning controls (touch/mouse/wheel) ----------
function canvasToLocal(e){
  const rect = gradeCanvas.getBoundingClientRect();
  const sx = gradeCanvas.width / rect.width;
  const sy = gradeCanvas.height / rect.height;
  return {
    mx: (e.clientX - rect.left) * sx,
    my: (e.clientY - rect.top) * sy,
    rect, sx, sy
  };
}

// Prevent browser gestures on canvas
gradeCanvas.addEventListener("touchstart", (e)=>e.preventDefault(), {passive:false});
gradeCanvas.addEventListener("touchmove",  (e)=>e.preventDefault(), {passive:false});
gradeCanvas.addEventListener("touchend",   (e)=>e.preventDefault(), {passive:false});

// Touch start
gradeCanvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  if (!srcImg.src) return;

  startInteracting();

  if (e.touches.length === 1) {
    lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    lastDist = null;
  } else if (e.touches.length === 2) {
    lastDist = touchDist(e.touches[0], e.touches[1]);
    lastTouch = null;
  }
  render();
}, { passive:false });

// Touch move
gradeCanvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  if (!srcImg.src) return;

  startInteracting();

  const rect = gradeCanvas.getBoundingClientRect();
  const sx = gradeCanvas.width / rect.width;
  const sy = gradeCanvas.height / rect.height;

  if (e.touches.length === 1 && lastTouch) {
    const nx = e.touches[0].clientX;
    const ny = e.touches[0].clientY;
    offX += (nx - lastTouch.x) * sx;
    offY += (ny - lastTouch.y) * sy;
    lastTouch = { x: nx, y: ny };
  }

  if (e.touches.length === 2) {
    const d = touchDist(e.touches[0], e.touches[1]);
    if (lastDist) {
      const factor = d / lastDist;

      // zoom around midpoint
      const mx = ((e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left) * sx;
      const my = ((e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top) * sy;

      const old = baseScale * scaleMult;
      const nextMult = clamp(scaleMult * factor, 0.5, 6);
      const next = baseScale * nextMult;

      // keep midpoint stable: compute world point relative to fg
      // fgX = centerX - fgW/2 + offX, same for Y
      const iw = srcImg.width, ih = srcImg.height;
      const oldW = iw * old, oldH = ih * old;
      const newW = iw * next, newH = ih * next;

      const cw = gradeCanvas.width, ch = gradeCanvas.height;

      const oldFgX = (cw - oldW)/2 + offX;
      const oldFgY = (ch - oldH)/2 + offY;

      const wx = (mx - oldFgX) / old; // in image space
      const wy = (my - oldFgY) / old;

      scaleMult = nextMult;

      const newFgX = (cw - newW)/2 + offX;
      const newFgY = (ch - newH)/2 + offY;

      // adjust offsets so same world point under midpoint
      const desiredFgX = mx - wx * next;
      const desiredFgY = my - wy * next;

      offX += (desiredFgX - newFgX);
      offY += (desiredFgY - newFgY);
    }
    lastDist = d;
  }

  render();
}, { passive:false });

// Touch end
gradeCanvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  if (e.touches.length === 0) {
    lastTouch = null;
    lastDist = null;
    stopInteractingSoon();
  } else if (e.touches.length === 1) {
    lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    lastDist = null;
  } else if (e.touches.length === 2) {
    lastDist = touchDist(e.touches[0], e.touches[1]);
    lastTouch = null;
  }
  render();
}, { passive:false });

// Mouse drag
gradeCanvas.addEventListener("mousedown", (e) => {
  if (!srcImg.src) return;
  mouseDown = true;
  lastMouse = { x: e.clientX, y: e.clientY };
  startInteracting();
  render();
});

window.addEventListener("mousemove", (e) => {
  if (!mouseDown || !srcImg.src) return;

  const rect = gradeCanvas.getBoundingClientRect();
  const sx = gradeCanvas.width / rect.width;
  const sy = gradeCanvas.height / rect.height;

  offX += (e.clientX - lastMouse.x) * sx;
  offY += (e.clientY - lastMouse.y) * sy;
  lastMouse = { x: e.clientX, y: e.clientY };

  render();
});

window.addEventListener("mouseup", () => {
  if (!mouseDown) return;
  mouseDown = false;
  stopInteractingSoon();
  render();
});

// Wheel/Trackpad zoom (canvas + wrapper, capture)
function onWheelZoom(e){
  if (!srcImg.src) return;

  if (e.cancelable) e.preventDefault();
  e.stopPropagation();

  startInteracting();

  const rect = gradeCanvas.getBoundingClientRect();
  const sx = gradeCanvas.width / rect.width;
  const sy = gradeCanvas.height / rect.height;

  const mx = (e.clientX - rect.left) * sx;
  const my = (e.clientY - rect.top) * sy;

  const zoomIntensity = 0.0015;
  const factor = Math.exp(-e.deltaY * zoomIntensity);

  // zoom around mouse point
  const old = baseScale * scaleMult;
  const nextMult = clamp(scaleMult * factor, 0.5, 6);
  const next = baseScale * nextMult;

  const iw = srcImg.width, ih = srcImg.height;
  const oldW = iw * old, oldH = ih * old;
  const newW = iw * next, newH = ih * next;

  const cw = gradeCanvas.width, ch = gradeCanvas.height;

  const oldFgX = (cw - oldW)/2 + offX;
  const oldFgY = (ch - oldH)/2 + offY;

  const wx = (mx - oldFgX) / old;
  const wy = (my - oldFgY) / old;

  scaleMult = nextMult;

  const newFgX = (cw - newW)/2 + offX;
  const newFgY = (ch - newH)/2 + offY;

  const desiredFgX = mx - wx * next;
  const desiredFgY = my - wy * next;

  offX += (desiredFgX - newFgX);
  offY += (desiredFgY - newFgY);

  render();
  stopInteractingSoon();
}

gradeCanvas.addEventListener("wheel", onWheelZoom, { passive:false, capture:true });
if (gradeWrap) gradeWrap.addEventListener("wheel", onWheelZoom, { passive:false, capture:true });

// Initial render
render();
