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

let files = [];
let idx = 0;

let srcImg = new Image();
let baseImageData = null; // original drawn pixels on canvas (after fit)
let autoParams = { b:0, c:0, s:0, k:0 }; // auto-found baseline

// ----- Helpers -----
function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

function fitContainToCanvas(img){
  const cw = gradeCanvas.width, ch = gradeCanvas.height;
  const iw = img.width, ih = img.height;

  // Instagram-style: blurred cover background
  const bgScale = Math.max(cw/iw, ch/ih);
  const bgW = iw * bgScale, bgH = ih * bgScale;
  const bgX = (cw - bgW)/2, bgY = (ch - bgH)/2;

  gctx.save();
  gctx.filter = "blur(24px)";
  gctx.drawImage(img, bgX, bgY, bgW, bgH);
  gctx.filter = "none";
  gctx.fillStyle = "rgba(0,0,0,0.18)";
  gctx.fillRect(0,0,cw,ch);
  gctx.restore();

  // Foreground contain
  const fgScale = Math.min(cw/iw, ch/ih);
  const fgW = iw * fgScale, fgH = ih * fgScale;
  const fgX = (cw - fgW)/2, fgY = (ch - fgH)/2;
  gctx.drawImage(img, fgX, fgY, fgW, fgH);
}

function computeLumaStats(imageData){
  const d = imageData.data;
  // sample step for speed
  const step = 16;
  let sum=0, sum2=0, n=0;

  for (let i=0; i<d.length; i += 4*step){
    const r=d[i], g=d[i+1], b=d[i+2];
    // Rec.709 luma (0..255)
    const y = 0.2126*r + 0.7152*g + 0.0722*b;
    sum += y; sum2 += y*y; n++;
  }
  const mean = sum/n;                 // 0..255
  const varr = sum2/n - mean*mean;
  const std = Math.sqrt(Math.max(0,varr));
  return { mean, std };
}

function applyAdjustments(b, c, s, k){
  if (!baseImageData) return;

  const out = new ImageData(
    new Uint8ClampedArray(baseImageData.data),
    baseImageData.width,
    baseImageData.height
  );

  const d = out.data;

  // Brightness: [-40..40] => offset in 0..255
  const bOff = b * 2.0;

  // Contrast: [-40..40] => factor around 1.0
  const cFac = (259 * (c + 255)) / (255 * (259 - c)); // classic contrast curve with c in [-255..255]
  // here c slider is [-40..40], OK.

  // Saturation: [-40..40] => factor
  const sFac = 1 + (s / 60); // -0.66..+0.66

  // Clarity (micro-contrast) – quick approximation:
  // We do a very light unsharp mask via canvas filter is not available per-pixel, so we approximate
  // by boosting contrast a touch in midtones:
  const kFac = 1 + (k / 120); // 1..1.25

  for (let i=0; i<d.length; i+=4){
    let r=d[i], g=d[i+1], bch=d[i+2];

    // brightness
    r = r + bOff; g = g + bOff; bch = bch + bOff;

    // contrast
    r = cFac*(r-128)+128;
    g = cFac*(g-128)+128;
    bch = cFac*(bch-128)+128;

    // saturation (convert to gray then interpolate)
    const gray = 0.2126*r + 0.7152*g + 0.0722*bch;
    r = gray + (r-gray)*sFac;
    g = gray + (g-gray)*sFac;
    bch = gray + (bch-gray)*sFac;

    // clarity-ish (mid-tone contrast)
    r = 128 + (r-128)*kFac;
    g = 128 + (g-128)*kFac;
    bch = 128 + (bch-128)*kFac;

    d[i]   = clamp(r,0,255);
    d[i+1] = clamp(g,0,255);
    d[i+2] = clamp(bch,0,255);
  }

  gctx.putImageData(out, 0, 0);
}

function redrawFromSliders(){
  const b = autoParams.b + parseInt(bSlider.value,10);
  const c = autoParams.c + parseInt(cSlider.value,10);
  const s = autoParams.s + parseInt(sSlider.value,10);
  const k = autoParams.k + parseInt(kSlider.value,10);
  applyAdjustments(b, c, s, k);
}

function loadCurrent(){
  if (!files.length) return;

  const f = files[idx];
  const reader = new FileReader();
  reader.onload = (ev) => { srcImg.src = ev.target.result; };
  reader.readAsDataURL(f);
}

srcImg.onload = () => {
  // draw base (blur bg + contain fg)
  gctx.clearRect(0,0,gradeCanvas.width,gradeCanvas.height);
  fitContainToCanvas(srcImg);

  // capture base pixels
  baseImageData = gctx.getImageData(0,0,gradeCanvas.width,gradeCanvas.height);

  // reset auto + sliders
  autoParams = { b:0, c:0, s:0, k:0 };
  bSlider.value = 0; cSlider.value = 0; sSlider.value = 0; kSlider.value = 0;
};

// ----- Events -----
gradeUpload.addEventListener("change", (e) => {
  files = Array.from(e.target.files || []);
  idx = 0;
  if (files.length) loadCurrent();
});

autoGradeBtn.addEventListener("click", () => {
  if (!baseImageData) return;

  const { mean, std } = computeLumaStats(baseImageData);

  // Targets (tuned for “sports / outdoor”): mid brightness, decent contrast
  const targetMean = 135;  // ~0.53
  const targetStd  = 55;   // reasonable contrast

  // brightness adjustment suggestion
  const b = clamp((targetMean - mean) / 2, -20, 20); // in slider units-ish

  // contrast suggestion (std too low -> increase)
  const c = clamp((targetStd - std) / 2, -20, 20);

  // saturation adaptive: if image is flat -> add a bit, if already punchy -> less
  // quick heuristic based on std
  const s = clamp((50 - std) / 3, -10, 12);

  // clarity mild default
  const k = clamp((targetStd - std) / 6, 0, 12);

  autoParams = { b: Math.round(b), c: Math.round(c), s: Math.round(s), k: Math.round(k) };

  // keep sliders as “delta from auto”
  bSlider.value = 0; cSlider.value = 0; sSlider.value = 0; kSlider.value = 0;

  redrawFromSliders();
});

[bSlider, cSlider, sSlider, kSlider].forEach(sl => {
  sl.addEventListener("input", redrawFromSliders);
});

resetGradeBtn.addEventListener("click", () => {
  if (!srcImg.src) return;
  gctx.clearRect(0,0,gradeCanvas.width,gradeCanvas.height);
  fitContainToCanvas(srcImg);
  baseImageData = gctx.getImageData(0,0,gradeCanvas.width,gradeCanvas.height);
  autoParams = { b:0, c:0, s:0, k:0 };
  bSlider.value = 0; cSlider.value = 0; sSlider.value = 0; kSlider.value = 0;
});

nextImgBtn.addEventListener("click", () => {
  if (!files.length) return;
  idx = (idx + 1) % files.length;
  loadCurrent();
});

downloadGradeBtn.addEventListener("click", () => {
  // PNG Download
  const a = document.createElement("a");
  const name = files[idx]?.name ? files[idx].name.replace(/\.[^.]+$/, "") : "graded";
  a.download = `${name}_graded.png`;
  a.href = gradeCanvas.toDataURL("image/png");
  a.click();
});
