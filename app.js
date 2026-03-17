const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const imageUpload   = document.getElementById("imageUpload");
const titleInput    = document.getElementById("titleInput");
const categorySelect = document.getElementById("categorySelect");
const downloadBtn   = document.getElementById("downloadBtn");
const fitBtn        = document.getElementById("fitBtn");
const resetBtn      = document.getElementById("resetBtn");

const NAVY   = "#1a355b";
const ORANGE = "#e67e22";

const clubLogo = new Image();
clubLogo.src = "./assets/Logo.svg";
clubLogo.onload  = () => draw();
clubLogo.onerror = () => console.log("Logo nicht gefunden:", clubLogo.src);

if (document.fonts?.load) {
  document.fonts.load("34px 'Anton'").then(() => draw());
}

const UNDER = {
  aktiv:        "#ffffff",
  jugi:         "#76869D",
  leistung:     "#ffffff",
  gesellschaft: "#CDCCCC"
};

const OVERLAY = {
  topY:         1000,
  leftX:        0,
  maxWidth:     860,
  navyHeight:   130,
  navyPadX:     52,
  titleFontPx:  54,
  titleWeight:  800,
  accentHeight: 10,
  subBarHeight: 50,
  subBarPadX:   22,
  subFontPx:    32,
  subWeight:    900,
  subPadLeft:   24,
  subPadRight:  24,
  logoSize:     40,
  logoGap:      14,
  gapAfterAccent: 0
};

let img      = new Image();
let hasImage = false;

// Framing
let scale = 1, tx = 0, ty = 0;

// Interaction
let isInteracting = false;
let hideGridTimer = null;
let lastTouch     = null;
let lastDist      = null;
let mouseDown     = false;
let lastMouse     = null;

const canvasWrap = document.querySelector(".canvas-wrap");

// ---- Touch passthrough prevention ----
canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
canvas.addEventListener("touchmove",  (e) => e.preventDefault(), { passive: false });
canvas.addEventListener("touchend",   (e) => e.preventDefault(), { passive: false });

// ---- Upload ----
imageUpload.addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (!f) return;
  // User uploaded their own image: clear grading title sync AND grading markings
  window.titleImageData = null;
  if (typeof window.clearGradingTitleMark === 'function') window.clearGradingTitleMark();
  const reader = new FileReader();
  reader.onload = (ev) => { img.src = ev.target.result; };
  reader.readAsDataURL(f);
});

img.onload = () => {
  // Only auto-fit for user-uploaded images, not grading sync
  if (!window._titleImageSyncing) {
    hasImage = true;
    autoFit();
  }
  draw();
};

// ---- UI listeners ----
titleInput.addEventListener("input", draw);
categorySelect.addEventListener("change", draw);
fitBtn.addEventListener("click",  () => { autoFit(); draw(); });
resetBtn.addEventListener("click", () => {
  titleInput.value      = "";
  categorySelect.value  = "aktiv";
  imageUpload.value     = "";
  hasImage              = false;
  img.src               = "";
  window.titleImageData = null;
  scale = 1; tx = 0; ty = 0;
  isInteracting         = false;
  if (hideGridTimer) clearTimeout(hideGridTimer);
  draw();
});

// ---- Zoom (wheel) ----
function onWheelZoom(e) {
  if (!hasImage && !window.titleImageData) return;
  if (e.cancelable) e.preventDefault();
  e.stopPropagation();
  startInteracting();
  const rect = canvas.getBoundingClientRect();
  const sx   = canvas.width  / rect.width;
  const sy   = canvas.height / rect.height;
  const mx   = (e.clientX - rect.left) * sx;
  const my   = (e.clientY - rect.top)  * sy;
  const factor   = Math.exp(-e.deltaY * 0.0015);
  const newScale = clamp(scale * factor, 0.15, 8);
  const wx = (mx - tx) / scale;
  const wy = (my - ty) / scale;
  scale = newScale;
  tx = mx - wx * scale;
  ty = my - wy * scale;
  draw();
  stopInteractingSoon();
}
canvas.addEventListener("wheel", onWheelZoom, { passive: false, capture: true });
if (canvasWrap) canvasWrap.addEventListener("wheel", onWheelZoom, { passive: false, capture: true });

// ---- Touch drag + pinch ----
canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  if (!hasImage && !window.titleImageData) return;
  startInteracting();
  if (e.touches.length === 1) { lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; lastDist = null; }
  else if (e.touches.length === 2) { lastDist = touchDist(e.touches[0], e.touches[1]); lastTouch = null; }
  draw();
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  if (!hasImage && !window.titleImageData) return;
  startInteracting();
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
  if (e.touches.length === 1 && lastTouch) {
    tx += (e.touches[0].clientX - lastTouch.x) * sx;
    ty += (e.touches[0].clientY - lastTouch.y) * sy;
    lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  }
  if (e.touches.length === 2) {
    const d = touchDist(e.touches[0], e.touches[1]);
    if (lastDist) {
      const factor = d / lastDist;
      const newScale = clamp(scale * factor, 0.15, 8);
      const mx = ((e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left) * sx;
      const my = ((e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top) * sy;
      const wx = (mx - tx) / scale, wy = (my - ty) / scale;
      scale = newScale; tx = mx - wx * scale; ty = my - wy * scale;
    }
    lastDist = d;
  }
  draw();
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
  e.preventDefault();
  if (e.touches.length === 0) { lastTouch = null; lastDist = null; stopInteractingSoon(); }
  else if (e.touches.length === 1) { lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; lastDist = null; }
  else if (e.touches.length === 2) { lastDist = touchDist(e.touches[0], e.touches[1]); lastTouch = null; }
  draw();
}, { passive: false });

// ---- Mouse drag ----
canvas.addEventListener("mousedown", (e) => {
  if (!hasImage && !window.titleImageData) return;
  mouseDown = true; lastMouse = { x: e.clientX, y: e.clientY };
  startInteracting(); draw();
});
window.addEventListener("mousemove", (e) => {
  if (!mouseDown || (!hasImage && !window.titleImageData)) return;
  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width, sy = canvas.height / rect.height;
  tx += (e.clientX - lastMouse.x) * sx;
  ty += (e.clientY - lastMouse.y) * sy;
  lastMouse = { x: e.clientX, y: e.clientY };
  draw();
});
window.addEventListener("mouseup", () => {
  if (!mouseDown) return;
  mouseDown = false; stopInteractingSoon(); draw();
});

// ---- Download ----
downloadBtn.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "tvbr_post.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

// ---- Main draw ----
function draw() {
  const cw = canvas.width, ch = canvas.height;
  ctx.clearRect(0, 0, cw, ch);

  const hasTitleSync = !!(window.titleImageData);

  if (!hasImage && !hasTitleSync) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cw, ch);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "800 72px system-ui";
    ctx.textBaseline = "middle";
    ctx.textAlign    = "center";
    ctx.fillText("Bild laden …", cw / 2, ch / 2);
    return;
  }

  if (hasTitleSync) {
    // Draw gradeCanvas directly — all grading, framing, rotation included
    ctx.drawImage(window.titleImageData, 0, 0, cw, ch);
  } else {
    // Normal Tab-1 flow: blurred bg + framed foreground
    const iw = img.width, ih = img.height;
    const bgScale = Math.max(cw / iw, ch / ih);
    const bgW = iw * bgScale, bgH = ih * bgScale;
    const bgX = (cw - bgW) / 2, bgY = (ch - bgH) / 2;

    ctx.save();
    ctx.filter = "blur(24px)";
    ctx.drawImage(img, bgX, bgY, bgW, bgH);
    ctx.filter = "none";
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    ctx.fillRect(0, 0, cw, ch);
    ctx.restore();

    const fgW = img.width * scale, fgH = img.height * scale;
    ctx.save();
    ctx.drawImage(img, tx, ty, fgW, fgH);
    ctx.restore();

    const topGap    = ty;
    const bottomGap = ch - (ty + fgH);
    const leftGap   = tx;
    const rightGap  = cw - (tx + fgW);

    if (topGap > 1) {
      const gt = ctx.createLinearGradient(0, 0, 0, Math.min(160, topGap));
      gt.addColorStop(0, "rgba(0,0,0,0.35)"); gt.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gt; ctx.fillRect(0, 0, cw, Math.min(160, topGap));
    }
    if (bottomGap > 1) {
      const gb = ctx.createLinearGradient(0, ch - Math.min(220, bottomGap), 0, ch);
      gb.addColorStop(0, "rgba(0,0,0,0)"); gb.addColorStop(1, "rgba(0,0,0,0.45)");
      ctx.fillStyle = gb; ctx.fillRect(0, ch - Math.min(220, bottomGap), cw, Math.min(220, bottomGap));
    }
    if (leftGap > 1) {
      const gl = ctx.createLinearGradient(0, 0, Math.min(140, leftGap), 0);
      gl.addColorStop(0, "rgba(0,0,0,0.25)"); gl.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = gl; ctx.fillRect(0, 0, Math.min(140, leftGap), ch);
    }
    if (rightGap > 1) {
      const gr = ctx.createLinearGradient(cw - Math.min(140, rightGap), 0, cw, 0);
      gr.addColorStop(0, "rgba(0,0,0,0)"); gr.addColorStop(1, "rgba(0,0,0,0.25)");
      ctx.fillStyle = gr; ctx.fillRect(cw - Math.min(140, rightGap), 0, Math.min(140, rightGap), ch);
    }
  }

  if (isInteracting) drawThirds();

  // Bottom navy gradient (always, for overlay readability)
  const gradientHeight = 420;
  const gradientTop    = ch - gradientHeight;
  const bottomGrad = ctx.createLinearGradient(0, gradientTop, 0, ch);
  bottomGrad.addColorStop(0, "rgba(26,53,91,0)");
  bottomGrad.addColorStop(1, "rgba(26,53,91,0.25)");
  ctx.fillStyle = bottomGrad;
  ctx.fillRect(0, gradientTop, cw, gradientHeight);

  // ---- Overlay: Navy title bar + accent + sub bar ----
  const titleText = (titleInput.value || "").trim();
  const titleFont = `${OVERLAY.titleWeight} ${OVERLAY.titleFontPx}px Calibri, Arial, sans-serif`;
  const navyX = OVERLAY.leftX, navyY = OVERLAY.topY, navyH = OVERLAY.navyHeight;

  ctx.save();
  ctx.font = titleFont;
  const titleW = ctx.measureText(titleText || " ").width;
  const navyW  = Math.min(OVERLAY.maxWidth, titleW + 2 * OVERLAY.navyPadX);
  ctx.fillStyle = NAVY;
  ctx.fillRect(navyX, navyY, navyW, navyH);
  ctx.fillStyle    = "#fff";
  ctx.textAlign    = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(titleText || " ", navyX + OVERLAY.navyPadX, navyY + navyH / 2);
  ctx.restore();

  const accentY = navyY + navyH;
  const subY = accentY + (categorySelect.value === "leistung" ? OVERLAY.accentHeight : 0) + (OVERLAY.gapAfterAccent || 0);
  const subH = OVERLAY.subBarHeight;

  const hasLogo = (typeof clubLogo !== "undefined") && clubLogo.complete && clubLogo.naturalWidth > 0;
  const labelText = subLabel(categorySelect.value);
  const clubFont  = `34px 'Anton', sans-serif`;

  let subW = OVERLAY.subPadLeft;
  if (hasLogo) subW += OVERLAY.logoSize + OVERLAY.logoGap;
  ctx.save();
  ctx.font = clubFont;
  subW += ctx.measureText(labelText).width;
  ctx.restore();
  subW += OVERLAY.subPadRight;
  if (OVERLAY.subMaxWidth) subW = Math.min(subW, OVERLAY.subMaxWidth);

  const subX = OVERLAY.leftX;

  if (categorySelect.value === "leistung") {
    ctx.fillStyle = ORANGE;
    ctx.fillRect(subX, accentY, subW, OVERLAY.accentHeight);
  }

  ctx.fillStyle = UNDER[categorySelect.value] || "#fff";
  ctx.fillRect(subX, subY, subW, subH);

  let cursorX = subX + OVERLAY.subPadLeft;
  if (hasLogo) {
    ctx.drawImage(clubLogo, cursorX, subY + (subH - OVERLAY.logoSize) / 2, OVERLAY.logoSize, OVERLAY.logoSize);
    cursorX += OVERLAY.logoSize + OVERLAY.logoGap;
  }
  ctx.fillStyle    = "#111";
  ctx.font         = clubFont;
  ctx.textAlign    = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(labelText, cursorX, subY + subH / 2 + 6);
}

// ---- Labels ----
function subLabel(cat) {
  if (cat === "jugi")        return "JUGI BAD RAGAZ";
  if (cat === "leistung")    return "TV BAD RAGAZ LA LEISTUNGSTEAM";
  if (cat === "gesellschaft") return "TV BAD RAGAZ";
  return "TV BAD RAGAZ";
}

// ---- Helpers ----
function roundRect(ctx, x, y, w, h, r) {
  const radius = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawThirds() {
  const w = canvas.width, h = canvas.height;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth   = 2;
  ctx.beginPath();
  ctx.moveTo(w/3, 0);   ctx.lineTo(w/3, h);
  ctx.moveTo(2*w/3, 0); ctx.lineTo(2*w/3, h);
  ctx.moveTo(0, h/3);   ctx.lineTo(w, h/3);
  ctx.moveTo(0, 2*h/3); ctx.lineTo(w, 2*h/3);
  ctx.stroke();
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  for (const [x, y] of [[w/3,h/3],[2*w/3,h/3],[w/3,2*h/3],[2*w/3,2*h/3]]) {
    ctx.fillRect(x-3, y-3, 6, 6);
  }
  ctx.restore();
}

function autoFit() {
  if (!hasImage) return;
  const cw = canvas.width, ch = canvas.height;
  scale = Math.max(cw / img.width, ch / img.height);
  tx = (cw - img.width  * scale) / 2;
  ty = (ch - img.height * scale) / 2;
}

function startInteracting() {
  isInteracting = true;
  if (hideGridTimer) clearTimeout(hideGridTimer);
}
function stopInteractingSoon() {
  if (hideGridTimer) clearTimeout(hideGridTimer);
  hideGridTimer = setTimeout(() => { isInteracting = false; draw(); }, 650);
}
function touchDist(t1, t2) {
  return Math.hypot(t1.clientX - t2.clientX, t1.clientY - t2.clientY);
}
function clamp(v, lo, hi) {
  return Math.max(lo, Math.min(hi, v));
}

// ---- Grade-to-Title bridge ----
window.syncTitleFromGrade = function(gradeCanvasEl) {
  window.titleImageData = gradeCanvasEl; // canvas element or null
  if (gradeCanvasEl) hasImage = false;
  draw();
};

// Called by grade.js when grading takes ownership of title
// Clears direct upload so grading image is the only source
window.clearTitleUpload = function() {
  hasImage = false;
  img.src = "";
  imageUpload.value = "";
  scale = 1; tx = 0; ty = 0;
};

// Called by app.js upload — tells grade.js to clear its title marking
// grade.js sets this function on window during init
// (it's set in grade.js, just declared here for clarity)
// window.clearGradingTitleMark = function() { ... } — defined in grade.js