// ----------------------
// Grade v3 (clean rewrite)
// ----------------------
const gradeCanvas = document.getElementById("gradeCanvas");
if (!gradeCanvas) {
  console.warn("gradeCanvas nicht gefunden");
} else {
  const gctx = gradeCanvas.getContext("2d");
  const $ = (id) => document.getElementById(id);

  // ---- UI Elements ----
  const gradeUpload       = $("gradeUpload");
  const autoGradeBtn      = $("autoGradeBtn");
  const resetGradeBtn     = $("resetGradeBtn");
  const downloadGradeBtn  = $("downloadGradeBtn");
  const downloadAllBtn    = $("downloadAllBtn");
  const nextImgBtn        = $("nextImgBtn");
  const prevImgBtn        = $("prevImgBtn");
  const titleImageCheckbox = $("titleImageCheckbox");
  const categorySelect    = $("category-select");
  const applyPresetBtn    = $("auto-grade-button");
  const bSlider = $("bSlider");
  const cSlider = $("cSlider");
  const sSlider = $("sSlider");
  const kSlider = $("kSlider");
  const bReset  = $("bReset");
  const cReset  = $("cReset");
  const sReset  = $("sReset");
  const kReset  = $("kReset");
  // New sliders
  const hlSlider   = $("hlSlider");
  const shSlider   = $("shSlider");
  const tmpSlider  = $("tmpSlider");
  const tintSlider = $("tintSlider");
  const vigSlider  = $("vigSlider");
  const shrpSlider = $("shrpSlider");
  const rotSlider  = $("rotSlider");
  const hlReset    = $("hlReset");
  const shReset    = $("shReset");
  const tmpReset   = $("tmpReset");
  const tintReset  = $("tintReset");
  const vigReset   = $("vigReset");
  const shrpReset  = $("shrpReset");
  const rotReset   = $("rotReset");
  const gradeWrap = gradeCanvas.closest(".canvas-wrap");

  // ---- State ----
  let files          = [];
  let currentIndex   = 0;
  let gradedData     = [];   // { b, c, s, k, isTitleImage }
  let titleImageIndex = -1;
  let baseImageData  = null;

  // Framing
  let baseScale  = 1;
  let scaleMult  = 1;
  let offX       = 0;
  let offY       = 0;
  let rotDeg     = 0;

  // Interaction
  let isInteracting  = false;
  let hideGridTimer  = null;
  let lastTouch      = null;
  let lastDist       = null;
  let mouseDown      = false;
  let lastMouse      = null;

  // Auto-grade
  let autoActive  = false;
  let autoApplied = { b: 0, c: 0, s: 0, k: 0 };

  // Presets
  const PRESETS = {
    drinnen:   { b:  5, c:  8, hl: -5, sh: 10, s: -5, k:  4, tmp:  8, tint:  2, vig:  8, shrp:  5 },
    draussen:  { b:  0, c:  5, hl: -8, sh:  5, s:  8, k:  6, tmp: -5, tint:  0, vig:  5, shrp:  8 },
    sport:     { b:  3, c: 12, hl:-10, sh:  8, s: 10, k:  8, tmp:  0, tint:  0, vig: 12, shrp: 12 },
    portraits: { b:  4, c:  6, hl: -6, sh: 12, s:  2, k:  2, tmp:  6, tint:  3, vig: 10, shrp:  4 },
  };

  // ---- Helpers ----
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

  function setSliders(b, c, s, k, hl, sh, tmp, tint, vig, shrp, rot) {
    if (bSlider) bSlider.value = b ?? 0;
    if (cSlider) cSlider.value = c ?? 0;
    if (sSlider) sSlider.value = s ?? 0;
    if (kSlider) kSlider.value = k ?? 0;
    if (hlSlider)   hlSlider.value   = hl   ?? 0;
    if (shSlider)   shSlider.value   = sh   ?? 0;
    if (tmpSlider)  tmpSlider.value  = tmp  ?? 0;
    if (tintSlider) tintSlider.value = tint ?? 0;
    if (vigSlider)  vigSlider.value  = vig  ?? 0;
    if (shrpSlider) shrpSlider.value = shrp ?? 0;
    if (rotSlider)  rotSlider.value  = rot  ?? 0;
    rotDeg = rot ?? 0;
  }

  function getSliders() {
    return {
      b:    bSlider    ? parseInt(bSlider.value,    10) : 0,
      c:    cSlider    ? parseInt(cSlider.value,    10) : 0,
      s:    sSlider    ? parseInt(sSlider.value,    10) : 0,
      k:    kSlider    ? parseInt(kSlider.value,    10) : 0,
      hl:   hlSlider   ? parseInt(hlSlider.value,   10) : 0,
      sh:   shSlider   ? parseInt(shSlider.value,   10) : 0,
      tmp:  tmpSlider  ? parseInt(tmpSlider.value,  10) : 0,
      tint: tintSlider ? parseInt(tintSlider.value, 10) : 0,
      vig:  vigSlider  ? parseInt(vigSlider.value,  10) : 0,
      shrp: shrpSlider ? parseInt(shrpSlider.value, 10) : 0,
      rot:  rotSlider  ? parseFloat(rotSlider.value)    : 0,
    };
  }

  function saveCurrentGrading() {
    if (files.length === 0) return;
    const vals = getSliders();
    if (!gradedData[currentIndex]) gradedData[currentIndex] = {};
    Object.assign(gradedData[currentIndex], { ...vals, scaleMult, offX, offY });
  }

  function startInteracting() {
    isInteracting = true;
    if (hideGridTimer) clearTimeout(hideGridTimer);
  }

  function stopInteractingSoon() {
    if (hideGridTimer) clearTimeout(hideGridTimer);
    hideGridTimer = setTimeout(() => { isInteracting = false; render(); }, 650);
  }

  function touchDist(t1, t2) {
    return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
  }

  // ---- Thumbnails ----
  // Renders all thumbnails; uses dataset.index so async order doesn't matter
  function renderThumbnails() {
    const container = $('thumbnailContainer');
    if (!container) return;
    container.innerHTML = '';

    // Pre-create placeholder slots — guarantees index 0 is always at top
    const slots = files.map((_, index) => {
      const div = document.createElement('div');
      div.dataset.slot = index;
      container.appendChild(div);
      return div;
    });

    files.forEach((file, index) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = document.createElement('img');
        img.src = e.target.result;
        img.dataset.index = index;
        img.onclick = () => {
          saveCurrentGrading();
          currentIndex = index;
          loadCurrentImage();
        };
        slots[index].replaceWith(img);
        updateThumbnailSelection();
      };
      reader.readAsDataURL(file);
    });
  }

  // Highlights the thumbnail whose dataset.index === currentIndex
  function updateThumbnailSelection() {
    document.querySelectorAll('#thumbnailContainer img').forEach((thumb) => {
      const isActive = parseInt(thumb.dataset.index) === currentIndex;
      thumb.style.border = isActive ? '2px solid #007bff' : '2px solid transparent';
    });
  }

  // ---- Image loading ----
  const srcImg = new Image();

  srcImg.onload = () => {
    // Restore saved framing, or reset to defaults for new images
    const saved = gradedData[currentIndex];
    if (saved && saved.scaleMult !== undefined) {
      scaleMult = saved.scaleMult;
      offX      = saved.offX;
      offY      = saved.offY;
      rotDeg    = saved.rot ?? 0;
      if (rotSlider) rotSlider.value = rotDeg;
    } else {
      scaleMult = 1;
      offX = 0;
      offY = 0;
      rotDeg = 0;
      if (rotSlider) rotSlider.value = 0;
    }
    render();
    // If this is the title image, sync Tab 1 canvas live
    if (gradedData[currentIndex]?.isTitleImage) syncTitleCanvas();
  };

  function loadCurrentImage() {
    if (!files[currentIndex]) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      // Restore saved sliders or reset to 0
      const saved = gradedData[currentIndex];
      if (saved) {
        setSliders(saved.b ?? 0, saved.c ?? 0, saved.s ?? 0, saved.k ?? 0, saved.hl ?? 0, saved.sh ?? 0, saved.tmp ?? 0, saved.tint ?? 0, saved.vig ?? 0, saved.shrp ?? 0, saved.rot ?? 0);
      } else {
        setSliders(0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0);
        gradedData[currentIndex] = { b: 0, c: 0, s: 0, k: 0 };
      }
      // Update checkbox
      if (titleImageCheckbox) {
        titleImageCheckbox.checked = !!(gradedData[currentIndex]?.isTitleImage);
      }
      srcImg.src = e.target.result;
      updateThumbnailSelection();
    };
    reader.readAsDataURL(files[currentIndex]);
  }

  function loadImages(e) {
    files = Array.from(e.target.files);
    currentIndex = 0;
    gradedData = new Array(files.length).fill(null);
    if (files.length > 0) {
      renderThumbnails();
      loadCurrentImage();
    }
  }

  // ---- Navigation ----
  function prevImage() {
    if (files.length === 0) return;
    saveCurrentGrading();
    currentIndex = (currentIndex - 1 + files.length) % files.length;
    loadCurrentImage();
  }

  function nextImage() {
    if (files.length === 0) return;
    saveCurrentGrading();
    currentIndex = (currentIndex + 1) % files.length;
    loadCurrentImage();
  }

  // ---- Title image ----
  function setAsTitleImage() {
    if (!titleImageCheckbox) return;
    const checked = titleImageCheckbox.checked;
    if (!gradedData[currentIndex]) gradedData[currentIndex] = {};

    if (checked) {
      // Clear old title image marking
      if (titleImageIndex >= 0 && titleImageIndex !== currentIndex) {
        if (gradedData[titleImageIndex]) gradedData[titleImageIndex].isTitleImage = false;
      }
      gradedData[currentIndex].isTitleImage = true;
      titleImageIndex = currentIndex;
      // Tell app.js that grading now owns the title (clears any direct upload)
      if (typeof window.clearTitleUpload === 'function') window.clearTitleUpload();
      syncTitleCanvas();
    } else {
      gradedData[currentIndex].isTitleImage = false;
      if (titleImageIndex === currentIndex) {
        titleImageIndex = -1;
        // Clear title from Tab 1
        if (typeof window.syncTitleFromGrade === 'function') window.syncTitleFromGrade(null);
      }
    }
  }

  // Passes raw image + framing data to Tab-1 so app.js can render it natively
  function syncTitleCanvas() {
    if (titleImageIndex < 0 || currentIndex !== titleImageIndex) return;
    if (typeof window.syncTitleFromGrade === 'function') {
      window.syncTitleFromGrade(gradeCanvas);
    }
  }

  // ---- Download ----
  function downloadCurrentImage() {
    saveCurrentGrading();
    const a = document.createElement("a");
    const name = files[currentIndex]?.name?.replace(/\.[^.]+$/, "") ?? "graded";
    a.download = `${name}_graded.png`;
    a.href = gradeCanvas.toDataURL("image/png");
    a.click();
  }

  function downloadAllImages() {
    // Sequential download with delay so canvas renders each image before capture
    let chain = Promise.resolve();
    files.forEach((file, index) => {
      chain = chain.then(() => new Promise(resolve => {
        saveCurrentGrading();
        currentIndex = index;
        loadCurrentImage();
        setTimeout(() => {
          const a = document.createElement("a");
          const name = file.name.replace(/\.[^.]+$/, "");
          if (gradedData[index]?.isTitleImage) {
            // Download the Tab-1 canvas (includes overlay + grading)
            const titleCanvas = document.getElementById('canvas');
            a.download = `${name}_title.png`;
            a.href = titleCanvas ? titleCanvas.toDataURL("image/png") : gradeCanvas.toDataURL("image/png");
          } else {
            a.download = `${name}_graded.png`;
            a.href = gradeCanvas.toDataURL("image/png");
          }
          a.click();
          resolve();
        }, 600);
      }));
    });
  }

  // ---- Drawing ----
  function drawThirds(ctx) {
    const w = gradeCanvas.width, h = gradeCanvas.height;
    ctx.save();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(w/3, 0);   ctx.lineTo(w/3, h);
    ctx.moveTo(2*w/3, 0); ctx.lineTo(2*w/3, h);
    ctx.moveTo(0, h/3);   ctx.lineTo(w, h/3);
    ctx.moveTo(0, 2*h/3); ctx.lineTo(w, 2*h/3);
    ctx.stroke();
    ctx.restore();
  }

  function drawBase() {
    if (!srcImg.src || !srcImg.naturalWidth) return;
    const cw = gradeCanvas.width, ch = gradeCanvas.height;
    const iw = srcImg.naturalWidth, ih = srcImg.naturalHeight;

    gctx.clearRect(0, 0, cw, ch);

    // Blurred background (cover)
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

    // Foreground (contain + user offset/zoom)
    baseScale = Math.min(cw / iw, ch / ih);
    const fgScale = baseScale * scaleMult;
    const fgW = iw * fgScale, fgH = ih * fgScale;
    const fgX = (cw - fgW) / 2 + offX;
    const fgY = (ch - fgH) / 2 + offY;
    gctx.drawImage(srcImg, fgX, fgY, fgW, fgH);

    // Rotation around canvas centre
    if (rotDeg !== 0) {
      // Re-draw with rotation (overwrite the straight draw above)
      gctx.clearRect(0, 0, cw, ch);
      // Redraw blurred bg first
      gctx.save();
      gctx.filter = "blur(24px)";
      gctx.drawImage(srcImg, bgX, bgY, bgW, bgH);
      gctx.filter = "none";
      gctx.fillStyle = "rgba(0,0,0,0.18)";
      gctx.fillRect(0, 0, cw, ch);
      gctx.restore();
      // Rotated foreground
      gctx.save();
      gctx.translate(cw / 2, ch / 2);
      gctx.rotate(rotDeg * Math.PI / 180);
      gctx.drawImage(srcImg, fgX - cw / 2, fgY - ch / 2, fgW, fgH);
      gctx.restore();
    }

    baseImageData = gctx.getImageData(0, 0, cw, ch);
    if (isInteracting) drawThirds(gctx);
  }

  function applyAdjustments(b, c, s, k, hl, sh, tmp, tint, vig, shrp) {
    if (!baseImageData) return;
    const out = new ImageData(
      new Uint8ClampedArray(baseImageData.data),
      baseImageData.width,
      baseImageData.height
    );
    const d   = out.data;
    const bOff  = b * 2.0;
    const cFac  = (259 * (c + 255)) / (255 * (259 - c));
    const sFac  = 1 + (s / 60);
    const kFac  = 1 + (k / 120);
    const hlStr = (hl ?? 0) / 200;
    const shStr = (sh ?? 0) / 200;
    const tmpR  = (tmp  ?? 0) * 0.8;
    const tmpB  = (tmp  ?? 0) * -0.8;
    const tintG = (tint ?? 0) * -0.5;

    for (let i = 0; i < d.length; i += 4) {
      let r = d[i], g = d[i+1], bb = d[i+2];
      // Brightness
      r += bOff; g += bOff; bb += bOff;
      // Contrast
      r = cFac*(r-128)+128; g = cFac*(g-128)+128; bb = cFac*(bb-128)+128;
      // Highlights & Shadows
      const luma  = 0.2126*r + 0.7152*g + 0.0722*bb;
      const hMask = Math.max(0, (luma - 128) / 127);
      const sMask = Math.max(0, (128 - luma) / 128);
      const adj   = hlStr * hMask * 255 + shStr * sMask * 255;
      r += adj; g += adj; bb += adj;
      // Saturation
      const gray = 0.2126*r + 0.7152*g + 0.0722*bb;
      r  = gray + (r  - gray) * sFac;
      g  = gray + (g  - gray) * sFac;
      bb = gray + (bb - gray) * sFac;
      // Clarity
      r  = 128 + (r  - 128) * kFac;
      g  = 128 + (g  - 128) * kFac;
      bb = 128 + (bb - 128) * kFac;
      // Temperature & Tint
      r  += tmpR; bb += tmpB; g += tintG;
      d[i]   = clamp(r,  0, 255);
      d[i+1] = clamp(g,  0, 255);
      d[i+2] = clamp(bb, 0, 255);
    }
    gctx.putImageData(out, 0, 0);

    // Vignette (canvas gradient on top)
    if (vig > 0) {
      const cw = gradeCanvas.width, ch = gradeCanvas.height;
      const radius = Math.sqrt(cw*cw + ch*ch) / 2;
      const vg = gctx.createRadialGradient(cw/2, ch/2, radius*(1-vig/60), cw/2, ch/2, radius);
      vg.addColorStop(0, 'rgba(0,0,0,0)');
      vg.addColorStop(1, `rgba(0,0,0,${vig/80})`);
      gctx.fillStyle = vg;
      gctx.fillRect(0, 0, cw, ch);
    }

    // Sharpness (unsharp mask)
    if (shrp > 0) {
      const cw = gradeCanvas.width, ch = gradeCanvas.height;
      const oc = document.createElement('canvas');
      oc.width = cw; oc.height = ch;
      const ox = oc.getContext('2d');
      ox.filter = `blur(${1 + shrp/15}px)`;
      ox.drawImage(gradeCanvas, 0, 0);
      gctx.save();
      gctx.globalCompositeOperation = 'overlay';
      gctx.globalAlpha = (shrp / 30) * 0.4;
      gctx.drawImage(oc, 0, 0);
      gctx.restore();
    }
  }

  function render() {
    const cw = gradeCanvas.width, ch = gradeCanvas.height;
    if (!srcImg.src || !srcImg.naturalWidth) {
      gctx.clearRect(0, 0, cw, ch);
      gctx.fillStyle = "#000";
      gctx.fillRect(0, 0, cw, ch);
      gctx.fillStyle = "rgba(255,255,255,0.55)";
      gctx.font = "800 72px system-ui";
      gctx.textBaseline = "middle";
      gctx.textAlign = "center";
      gctx.fillText("Bilder laden …", cw / 2, ch / 2);
      return;
    }
    drawBase();
    const { b, c, s, k, hl, sh, tmp, tint, vig, shrp } = getSliders();
    applyAdjustments(b, c, s, k, hl, sh, tmp, tint, vig, shrp);
    // Live sync to Tab 1 if this is the title image
    if (currentIndex === titleImageIndex) syncTitleCanvas();
  }

  // ---- Auto-grade ----
  function computeLumaStats(imageData) {
    const d = imageData.data;
    const step = 16;
    let sum = 0, sum2 = 0, n = 0;
    for (let i = 0; i < d.length; i += 4 * step) {
      const y = 0.2126*d[i] + 0.7152*d[i+1] + 0.0722*d[i+2];
      sum += y; sum2 += y*y; n++;
    }
    const mean = sum / n;
    const std  = Math.sqrt(Math.max(0, sum2/n - mean*mean));
    return { mean, std };
  }

  function runAutoGrade() {
    if (!baseImageData) return;
    const { mean, std } = computeLumaStats(baseImageData);
    const b  = clamp((135 - mean) / 2, -20, 20);
    const c  = clamp((55  - std)  / 2, -20, 20);
    const s  = clamp((50  - std)  / 3, -10, 12);
    const k  = clamp((55  - std)  / 6,   0, 12);
    const bb = Math.round(b), cc = Math.round(c), ss = Math.round(s), kk = Math.round(k);
    autoActive  = true;
    autoApplied = { b: bb, c: cc, s: ss, k: kk };
    setSliders(bb, cc, ss, kk);
  }

  // ---- Bridge: app.js can clear our title marking when user uploads directly ----
  window.clearGradingTitleMark = function() {
    if (titleImageIndex >= 0) {
      if (gradedData[titleImageIndex]) gradedData[titleImageIndex].isTitleImage = false;
      titleImageIndex = -1;
    }
    // Uncheck checkbox if visible
    if (titleImageCheckbox) titleImageCheckbox.checked = false;
    if (gradedData[currentIndex]) gradedData[currentIndex].isTitleImage = false;
  };

  // ---- Event listeners (each button wired exactly ONCE) ----
  if (gradeUpload)       gradeUpload.addEventListener("change", loadImages);
  if (prevImgBtn)        prevImgBtn.addEventListener("click", prevImage);
  if (nextImgBtn)        nextImgBtn.addEventListener("click", nextImage);
  if (downloadGradeBtn)  downloadGradeBtn.addEventListener("click", downloadCurrentImage);
  if (downloadAllBtn)    downloadAllBtn.addEventListener("click", downloadAllImages);
  if (titleImageCheckbox) titleImageCheckbox.addEventListener("change", setAsTitleImage);



  if (applyPresetBtn && categorySelect) {
    applyPresetBtn.addEventListener('click', () => {
      const preset = PRESETS[categorySelect.value];
      if (preset) { setSliders(preset.b, preset.c, preset.s, preset.k, preset.hl??0, preset.sh??0, preset.tmp??0, preset.tint??0, preset.vig??0, preset.shrp??0, 0); saveCurrentGrading(); render(); }
    });
  }

  if (resetGradeBtn) {
    resetGradeBtn.addEventListener("click", () => {
      files = []; currentIndex = 0;
      gradedData = []; titleImageIndex = -1;
      if (gradeUpload) gradeUpload.value = "";
      const thumbContainer = $('thumbnailContainer');
      if (thumbContainer) thumbContainer.innerHTML = '';
      srcImg.src = "";
      baseImageData = null;
      autoActive = false;
      autoApplied = { b: 0, c: 0, s: 0, k: 0 };
      setSliders(0, 0, 0, 0);
      scaleMult = 1; offX = 0; offY = 0; rotDeg = 0;
      isInteracting = false;
      if (hideGridTimer) clearTimeout(hideGridTimer);
      // Clear title sync in Tab 1
      if (typeof window.syncTitleFromGrade === 'function') window.syncTitleFromGrade(null);
      render();
    });
  }

  [bSlider, cSlider, sSlider, kSlider].forEach(slider => {
    if (slider) slider.addEventListener('input', () => { saveCurrentGrading(); render(); });
  });

  if (bReset) bReset.addEventListener("click", () => { bSlider.value = autoActive ? autoApplied.b : 0; render(); });
  if (cReset) cReset.addEventListener("click", () => { cSlider.value = autoActive ? autoApplied.c : 0; render(); });
  if (sReset) sReset.addEventListener("click", () => { sSlider.value = autoActive ? autoApplied.s : 0; render(); });
  if (kReset) kReset.addEventListener("click", () => { kSlider.value = autoActive ? autoApplied.k : 0; render(); });

  // New sliders — event listeners
  [hlSlider, shSlider, tmpSlider, tintSlider, vigSlider, shrpSlider].forEach(sl => {
    if (sl) sl.addEventListener('input', () => { saveCurrentGrading(); render(); });
  });
  if (rotSlider) rotSlider.addEventListener('input', () => {
    rotDeg = parseFloat(rotSlider.value); saveCurrentGrading(); render();
  });
  if (hlReset)   hlReset.addEventListener("click",   () => { hlSlider.value   = 0; render(); });
  if (shReset)   shReset.addEventListener("click",   () => { shSlider.value   = 0; render(); });
  if (tmpReset)  tmpReset.addEventListener("click",  () => { tmpSlider.value  = 0; render(); });
  if (tintReset) tintReset.addEventListener("click", () => { tintSlider.value = 0; render(); });
  if (vigReset)  vigReset.addEventListener("click",  () => { vigSlider.value  = 0; render(); });
  if (shrpReset) shrpReset.addEventListener("click", () => { shrpSlider.value = 0; render(); });
  if (rotReset)  rotReset.addEventListener("click",  () => { rotSlider.value  = 0; rotDeg = 0; render(); });

  // ---- Touch / Mouse / Wheel ----
  gradeCanvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  gradeCanvas.addEventListener("touchmove",  (e) => e.preventDefault(), { passive: false });
  gradeCanvas.addEventListener("touchend",   (e) => e.preventDefault(), { passive: false });

  gradeCanvas.addEventListener("touchstart", (e) => {
    e.preventDefault();
    if (!srcImg.naturalWidth) return;
    startInteracting();
    if (e.touches.length === 1) { lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; lastDist = null; }
    else if (e.touches.length === 2) { lastDist = touchDist(e.touches[0], e.touches[1]); lastTouch = null; }
    render();
  }, { passive: false });

  gradeCanvas.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (!srcImg.naturalWidth) return;
    startInteracting();
    const rect = gradeCanvas.getBoundingClientRect();
    const sx = gradeCanvas.width / rect.width, sy = gradeCanvas.height / rect.height;
    if (e.touches.length === 1 && lastTouch) {
      offX += (e.touches[0].clientX - lastTouch.x) * sx;
      offY += (e.touches[0].clientY - lastTouch.y) * sy;
      lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    }
    if (e.touches.length === 2) {
      const d = touchDist(e.touches[0], e.touches[1]);
      if (lastDist) scaleMult = clamp(scaleMult * d / lastDist, 0.5, 6);
      lastDist = d;
    }
    render();
  }, { passive: false });

  gradeCanvas.addEventListener("touchend", (e) => {
    e.preventDefault();
    if (e.touches.length === 0) { lastTouch = null; lastDist = null; stopInteractingSoon(); }
    render();
  }, { passive: false });

  gradeCanvas.addEventListener("mousedown", (e) => {
    if (!srcImg.naturalWidth) return;
    mouseDown = true; lastMouse = { x: e.clientX, y: e.clientY };
    startInteracting(); render();
  });

  window.addEventListener("mousemove", (e) => {
    if (!mouseDown || !srcImg.naturalWidth) return;
    const rect = gradeCanvas.getBoundingClientRect();
    const sx = gradeCanvas.width / rect.width, sy = gradeCanvas.height / rect.height;
    offX += (e.clientX - lastMouse.x) * sx;
    offY += (e.clientY - lastMouse.y) * sy;
    lastMouse = { x: e.clientX, y: e.clientY };
    render();
  });

  window.addEventListener("mouseup", () => {
    if (!mouseDown) return;
    mouseDown = false; stopInteractingSoon(); render();
  });

  function onWheelZoom(e) {
    if (!srcImg.naturalWidth) return;
    if (e.cancelable) e.preventDefault();
    e.stopPropagation();
    startInteracting();
    scaleMult = clamp(scaleMult * Math.exp(-e.deltaY * 0.0015), 0.5, 6);
    render(); stopInteractingSoon();
  }

  gradeCanvas.addEventListener("wheel", onWheelZoom, { passive: false, capture: true });
  if (gradeWrap) gradeWrap.addEventListener("wheel", onWheelZoom, { passive: false, capture: true });

  // Initial draw
  render();
}