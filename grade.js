// ----------------------
// Grade v2 (robust, 4:5)
// ----------------------
const gradeCanvas = document.getElementById("gradeCanvas");
if (!gradeCanvas) {
  console.warn("gradeCanvas nicht gefunden – Grading Tab HTML prüfen (id=gradeCanvas).");
} else {

  const gctx = gradeCanvas.getContext("2d");

  // Safe-get helper (damit nichts crasht)
  const $ = (id) => document.getElementById(id);

  const gradeUpload = $("gradeUpload");
  const autoGradeBtn = $("autoGradeBtn");
  const resetGradeBtn = $("resetGradeBtn");
  const downloadGradeBtn = $("downloadGradeBtn");
  const nextImgBtn = $("nextImgBtn");

  const bSlider = $("bSlider");
  const cSlider = $("cSlider");
  const sSlider = $("sSlider");
  const kSlider = $("kSlider");

  const bReset = $("bReset");
  const cReset = $("cReset");
  const sReset = $("sReset");
  const kReset = $("kReset");

  const gradeWrap = gradeCanvas.closest(".canvas-wrap");

  // Queue
  let files = [];
  let idx = 0;

  // Image
  const srcImg = new Image();

  // Foreground positioning (contain + user)
  let baseScale = 1;   // contain scale
  let scaleMult = 1;   // user zoom multiplier
  let offX = 0;        // user shift (canvas px)
  let offY = 0;

  // Interaction
  let isInteracting = false;
  let hideGridTimer = null;
  let lastTouch = null;
  let lastDist = null;
  let mouseDown = false;
  let lastMouse = null;

  // Pixels
  let baseImageData = null;

  // Auto grade state
  let autoActive = false;
  let autoApplied = { b: 0, c: 0, s: 0, k: 0 };

  // ---------------- Helpers ----------------
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function startInteracting() {
    isInteracting = true;
    if (hideGridTimer) clearTimeout(hideGridTimer);
  }
  function stopInteractingSoon() {
    if (hideGridTimer) clearTimeout(hideGridTimer);
    hideGridTimer = setTimeout(() => {
      isInteracting = false;
      render();
    }, 650);
  }
  function touchDist(t1, t2) {
    const dx = t1.clientX - t2.clientX;
    const dy = t1.clientY - t2.clientY;
    return Math.hypot(dx, dy);
  }

  function setSliders(b, c, s, k) {
    if (bSlider) bSlider.value = String(b);
    if (cSlider) cSlider.value = String(c);
    if (sSlider) sSlider.value = String(s);
    if (kSlider) kSlider.value = String(k);
  }

  function getSliders() {
    return {
      b: bSlider ? parseInt(bSlider.value, 10) : 0,
      c: cSlider ? parseInt(cSlider.value, 10) : 0,
      s: sSlider ? parseInt(sSlider.value, 10) : 0,
      k: kSlider ? parseInt(kSlider.value, 10) : 0,
    };
  }

  function drawThirds(ctx) {
    const w = gradeCanvas.width, h = gradeCanvas.height;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w / 3, 0); ctx.lineTo(w / 3, h);
    ctx.moveTo(2 * w / 3, 0); ctx.lineTo(2 * w / 3, h);
    ctx.moveTo(0, h / 3); ctx.lineTo(w, h / 3);
    ctx.moveTo(0, 2 * h / 3); ctx.lineTo(w, 2 * h / 3);
    ctx.stroke();
    ctx.restore();
  }

  // --------------- Base draw ---------------
  function drawBase() {
    if (!srcImg.src) return;

    const cw = gradeCanvas.width, ch = gradeCanvas.height;
    const iw = srcImg.width, ih = srcImg.height;

    gctx.clearRect(0, 0, cw, ch);

    // Background cover + blur (Instagram style)
    const bgScale = Math.max(cw / iw, ch / ih);
    const bgW = iw * bgScale, bgH = ih * bgScale;
    const bgX = (cw - bgW) / 2, bgY = (ch - bgH) / 2;

    gctx.save();
    gctx.filter = "blur(24px)";
    gctx.drawImage(srcImg, bgX, bgY, bgW, bgH);
    gctx.filter = "none";
    gctx.fillStyle = "rgba(0,0,0,0.18)";
    gctx.fillRect(0, 0, cw, ch);
    gctx.restore();

    // Foreground contain baseline
    baseScale = Math.min(cw / iw, ch / ih);

    const fgScale = baseScale * scaleMult;
    const fgW = iw * fgScale, fgH = ih * fgScale;
    const fgX = (cw - fgW) / 2 + offX;
    const fgY = (ch - fgH) / 2 + offY;

    gctx.drawImage(srcImg, fgX, fgY, fgW, fgH);

    // capture pixels BEFORE thirds overlay (damit Linien nicht “eingebacken” werden)
    baseImageData = gctx.getImageData(0, 0, cw, ch);

    if (isInteracting) drawThirds(gctx);
  }

  // --------------- Grading ---------------
  function applyAdjustments(b, c, s, k) {
    if (!baseImageData) return;

    const out = new ImageData(
      new Uint8ClampedArray(baseImageData.data),
      baseImageData.width,
      baseImageData.height
    );

    const d = out.data;

    const bOff = b * 2.0;
    const cFac = (259 * (c + 255)) / (255 * (259 - c)); // c in [-40..40] ok
    const sFac = 1 + (s / 60);
    const kFac = 1 + (k / 120);

    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i + 1], bb = d[i + 2];

      r += bOff; g += bOff; bb += bOff;

      r = cFac * (r - 128) + 128;
      g = cFac * (g - 128) + 128;
      bb = cFac * (bb - 128) + 128;

      const gray = 0.2126 * r + 0.7152 * g + 0.0722 * bb;
      r = gray + (r - gray) * sFac;
      g = gray + (g - gray) * sFac;
      bb = gray + (bb - gray) * sFac;

      r = 128 + (r - 128) * kFac;
      g = 128 + (g - 128) * kFac;
      bb = 128 + (bb - 128) * kFac;

      d[i] = clamp(r, 0, 255);
      d[i + 1] = clamp(g, 0, 255);
      d[i + 2] = clamp(bb, 0, 255);
    }

    gctx.putImageData(out, 0, 0);
  }

  function computeLumaStats(imageData) {
    const d = imageData.data;
    const step = 16;
    let sum = 0, sum2 = 0, n = 0;

    for (let i = 0; i < d.length; i += 4 * step) {
      const r = d[i], g = d[i + 1], b = d[i + 2];
      const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      sum += y; sum2 += y * y; n++;
    }
    const mean = sum / n;
    const varr = sum2 / n - mean * mean;
    const std = Math.sqrt(Math.max(0, varr));
    return { mean, std };
  }

  function runAutoGrade() {
    if (!baseImageData) return;

    const { mean, std } = computeLumaStats(baseImageData);

    const targetMean = 135;
    const targetStd = 55;

    const b = clamp((targetMean - mean) / 2, -20, 20);
    const c = clamp((targetStd - std) / 2, -20, 20);
    const s = clamp((50 - std) / 3, -10, 12);
    const k = clamp((targetStd - std) / 6, 0, 12);

    const bb = Math.round(b), cc = Math.round(c), ss = Math.round(s), kk = Math.round(k);

    autoActive = true;
    autoApplied = { b: bb, c: cc, s: ss, k: kk };

    // Slider springen auf Auto-Werte (wie du wolltest)
    setSliders(bb, cc, ss, kk);
  }

  function render() {
    const cw = gradeCanvas.width, ch = gradeCanvas.height;

    if (!srcImg.src) {
      gctx.clearRect(0, 0, cw, ch);
      gctx.fillStyle = "#000";
      gctx.fillRect(0, 0, cw, ch);
      gctx.fillStyle = "rgba(255,255,255,0.55)";
      gctx.font = "800 72px system-ui";
      gctx.fillText("Fotos laden …", 70, 160);
      gctx.fillStyle = "rgba(255,255,255,0.35)";
      gctx.font = "500 34px system-ui";
      gctx.fillText("Dann verschieben / zoomen", 70, 220);
      return;
    }

    drawBase();
    const { b, c, s, k } = getSliders();
    applyAdjustments(b, c, s, k);
  }

  // --------------- Loading ---------------
  function loadCurrent() {
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
    autoApplied = { b: 0, c: 0, s: 0, k: 0 };
    setSliders(0, 0, 0, 0);

    render();
  };

  // --------------- UI Events ---------------
  if (gradeUpload) {
    gradeUpload.addEventListener("change", (e) => {
      files = Array.from(e.target.files || []);
      idx = 0;
      if (files.length) loadCurrent();
      else {
        srcImg.src = "";
        render();
      }
    });
  }

  if (nextImgBtn) {
    nextImgBtn.addEventListener("click", () => {
      if (!files.length) return;
      idx = (idx + 1) % files.length;
      loadCurrent();
    });
  }

  if (downloadGradeBtn) {
    downloadGradeBtn.addEventListener("click", () => {
      if (!srcImg.src) return;
      const a = document.createElement("a");
      const name = files[idx]?.name ? files[idx].name.replace(/\.[^.]+$/, "") : "graded";
      a.download = `${name}_graded.png`;
      a.href = gradeCanvas.toDataURL("image/png");
      a.click();
    });
  }

  // Slider input -> manual override
  [bSlider, cSlider, sSlider, kSlider].forEach(sl => {
    if (!sl) return;
    sl.addEventListener("input", () => {
      autoActive = false;
      render();
    });
  });

  // Per-slider reset: zurück auf Auto-Wert, sonst 0
  if (bReset) bReset.addEventListener("click", () => { bSlider.value = String(autoActive ? autoApplied.b : 0); render(); });
  if (cReset) cReset.addEventListener("click", () => { cSlider.value = String(autoActive ? autoApplied.c : 0); render(); });
  if (sReset) sReset.addEventListener("click", () => { sSlider.value = String(autoActive ? autoApplied.s : 0); render(); });
  if (kReset) kReset.addEventListener("click", () => { kSlider.value = String(autoActive ? autoApplied.k : 0); render(); });

  if (autoGradeBtn) {
    autoGradeBtn.addEventListener("click", () => {
      if (!srcImg.src) return;
      // Sicherstellen, dass baseImageData aktuell ist:
      render();
      runAutoGrade();
      render();
    });
  }

  if (resetGradeBtn) {
    resetGradeBtn.addEventListener("click", () => {
      // reset everything
      files = [];
      idx = 0;
      if (gradeUpload) gradeUpload.value = "";

      srcImg.src = "";
      baseImageData = null;

      autoActive = false;
      autoApplied = { b: 0, c: 0, s: 0, k: 0 };
      setSliders(0, 0, 0, 0);

      scaleMult = 1;
      offX = 0;
      offY = 0;

      isInteracting = false;
      if (hideGridTimer) clearTimeout(hideGridTimer);

      render();
    });
  }

  // --------------- Positioning (touch/mouse/wheel) ---------------
  // Prevent browser gestures
  gradeCanvas.addEventListener("touchstart", (e)=>e.preventDefault(), { passive:false });
  gradeCanvas.addEventListener("touchmove",  (e)=>e.preventDefault(), { passive:false });
  gradeCanvas.addEventListener("touchend",   (e)=>e.preventDefault(), { passive:false });

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
        scaleMult = clamp(scaleMult * factor, 0.5, 6);
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

  // Wheel zoom (canvas + wrapper)
  function onWheelZoom(e){
    if (!srcImg.src) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    startInteracting();

    const zoomIntensity = 0.0015;
    const factor = Math.exp(-e.deltaY * zoomIntensity);
    scaleMult = clamp(scaleMult * factor, 0.5, 6);

    render();
    stopInteractingSoon();
  }

  gradeCanvas.addEventListener("wheel", onWheelZoom, { passive:false, capture:true });
  if (gradeWrap) gradeWrap.addEventListener("wheel", onWheelZoom, { passive:false, capture:true });

  // First draw
  render();
}
