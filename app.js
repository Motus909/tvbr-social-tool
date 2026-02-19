const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const imageUpload = document.getElementById("imageUpload");
const titleInput = document.getElementById("titleInput");
const categorySelect = document.getElementById("categorySelect");
const downloadBtn = document.getElementById("downloadBtn");
const fitBtn = document.getElementById("fitBtn");
const resetBtn = document.getElementById("resetBtn");

const NAVY = "#1a355b";
const ORANGE = "#e67e22";

// Unterbalken-Farben (Riegen/Segment)
const UNDER = {
  aktiv: "#ffffff",
  jugi: "#76869D",
  leistung: "#ffffff",
  gesellschaft: "#CDCCCC"
};

// Overlay Einstellungen
const OVERLAY = {
  baseY: 1040,        // Start Y des Navy-Balkens
  navyHeight: 64,
  navyPadX: 26,
  navyRadius: 14,

  titleFontPx: 20,
  titleWeight: 700,

  subBarYGap: 12,
  subBarHeight: 130,

  accentHeight: 16,
  accentCut: 18
};

let img = new Image();
let hasImage = false;

// Transform fürs Framing
let scale = 1;
let tx = 0;
let ty = 0;

// Interaktionsstatus
let isInteracting = false;
let hideGridTimer = null;

// Touch tracking
let lastTouch = null;
let lastDist = null;

// Wrapper für Wheel-Zoom
const canvasWrap = document.querySelector(".canvas-wrap");

// Verhindert Browser-Scroll/Pinch-Zoom auf dem Canvas (WICHTIG)
canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
canvas.addEventListener("touchmove",  (e) => e.preventDefault(), { passive: false });
canvas.addEventListener("touchend",   (e) => e.preventDefault(), { passive: false });

// Upload
imageUpload.addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (!f) return;

  const reader = new FileReader();
  reader.onload = (ev) => { img.src = ev.target.result; };
  reader.readAsDataURL(f);
});

img.onload = () => {
  hasImage = true;
  autoFit();
  draw();
};

// UI
titleInput.addEventListener("input", draw);
categorySelect.addEventListener("change", draw);
fitBtn.addEventListener("click", () => { autoFit(); draw(); });
resetBtn.addEventListener("click", () => { autoFit(); draw(); });

// ---------- Wheel / Trackpad Zoom (Canvas + Wrapper, capture) ----------
function onWheelZoom(e){
  if (!hasImage) return;

  if (e.cancelable) e.preventDefault();
  e.stopPropagation();

  startInteracting();

  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;

  const mx = (e.clientX - rect.left) * sx;
  const my = (e.clientY - rect.top) * sy;

  const zoomIntensity = 0.0015;
  const factor = Math.exp(-e.deltaY * zoomIntensity);
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

// ---------- Touch: Drag + Pinch ----------
canvas.addEventListener("touchstart", (e) => {
  e.preventDefault();
  if (!hasImage) return;

  startInteracting();

  if (e.touches.length === 1) {
    lastTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY };
    lastDist = null;
  } else if (e.touches.length === 2) {
    lastDist = touchDist(e.touches[0], e.touches[1]);
    lastTouch = null;
  }
  draw();
}, { passive: false });

canvas.addEventListener("touchmove", (e) => {
  e.preventDefault();
  if (!hasImage) return;

  startInteracting();

  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;

  // Drag
  if (e.touches.length === 1 && lastTouch) {
    const nx = e.touches[0].clientX;
    const ny = e.touches[0].clientY;
    tx += (nx - lastTouch.x) * sx;
    ty += (ny - lastTouch.y) * sy;
    lastTouch = { x: nx, y: ny };
  }

  // Pinch zoom
  if (e.touches.length === 2) {
    const d = touchDist(e.touches[0], e.touches[1]);
    if (lastDist) {
      const factor = d / lastDist;
      const newScale = clamp(scale * factor, 0.15, 8);

      const mx = ((e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left) * sx;
      const my = ((e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top) * sy;

      const wx = (mx - tx) / scale;
      const wy = (my - ty) / scale;

      scale = newScale;
      tx = mx - wx * scale;
      ty = my - wy * scale;
    }
    lastDist = d;
  }

  draw();
}, { passive: false });

canvas.addEventListener("touchend", (e) => {
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

  draw();
}, { passive: false });

// ---------- Desktop: Mouse Drag ----------
let mouseDown = false;
let lastMouse = null;

canvas.addEventListener("mousedown", (e) => {
  if (!hasImage) return;
  mouseDown = true;
  lastMouse = { x: e.clientX, y: e.clientY };
  startInteracting();
  draw();
});

window.addEventListener("mousemove", (e) => {
  if (!mouseDown || !hasImage) return;

  const rect = canvas.getBoundingClientRect();
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;

  tx += (e.clientX - lastMouse.x) * sx;
  ty += (e.clientY - lastMouse.y) * sy;
  lastMouse = { x: e.clientX, y: e.clientY };

  draw();
});

window.addEventListener("mouseup", () => {
  if (!mouseDown) return;
  mouseDown = false;
  stopInteractingSoon();
  draw();
});

// ---------- Download ----------
downloadBtn.addEventListener("click", () => {
  const link = document.createElement("a");
  link.download = "tvbr_post.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});

// ---------- Rendering ----------
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!hasImage) {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255,255,255,0.55)";
    ctx.font = "800 72px system-ui";
    ctx.fillText("Bild laden …", 70, 160);
    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.font = "500 34px system-ui";
    ctx.fillText("Dann ziehen & pinch-zoomen", 70, 220);
    return;
  }

  // 1) Hintergrundbild
  ctx.save();
  ctx.translate(tx, ty);
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  ctx.restore();

  // 2) Drittel-Linien
  if (isInteracting) drawThirds();

  // 3) Gradient unten (Lesbarkeit)
  const gradient = ctx.createLinearGradient(0, OVERLAY.baseY - 140, 0, canvas.height);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.60)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // -------- Overlay (dynamische Balkenbreite, 1 Zeile) --------
  const titleText = (titleInput.value || "").trim();
  const titleFont = `${OVERLAY.titleWeight} ${OVERLAY.titleFontPx}px Calibri, Arial, sans-serif`;

  ctx.save();
  ctx.font = titleFont;

  // Textbreite messen -> Navy-Balkenbreite
  const textW = ctx.measureText(titleText || " ").width;
  const navyW = Math.min(canvas.width - 120, textW + 2 * OVERLAY.navyPadX);
  const navyH = OVERLAY.navyHeight;

  // Navy-Balken zentriert
  const navyX = (canvas.width - navyW) / 2;
  const navyY = OVERLAY.baseY;

  // Navy Balken
  ctx.fillStyle = NAVY;
  roundRect(ctx, navyX, navyY, navyW, navyH, OVERLAY.navyRadius);
  ctx.fill();

  // Text zentriert im Navy-Balken
  ctx.fillStyle = "#fff";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(titleText || " ", navyX + navyW / 2, navyY + navyH / 2);

  ctx.restore();

  // Unterbalken (Riege)
  const subBarY = navyY + navyH + OVERLAY.subBarYGap;
  ctx.fillStyle = UNDER[categorySelect.value] || "#fff";
  ctx.fillRect(0, subBarY, canvas.width, OVERLAY.subBarHeight);

  // Orange Balken (Leistung) – schneidet in Subbar
  if (categorySelect.value === "leistung") {
    ctx.fillStyle = ORANGE;
    ctx.fillRect(
      0,
      subBarY - OVERLAY.accentCut,
      canvas.width,
      OVERLAY.accentHeight + OVERLAY.accentCut
    );
  }

  // Subline im Unterbalken
  ctx.fillStyle = "#111";
  ctx.font = "900 40px Calibri, Arial, sans-serif";
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
  ctx.fillText(subLabel(categorySelect.value), 60, subBarY + 85);
}

// ---------- Labels ----------
function subLabel(cat){
  if (cat === "jugi") return "JUGI BAD RAGAZ";
  if (cat === "leistung") return "TV BAD RAGAZ LA LEISTUNGSTEAM";
  if (cat === "gesellschaft") return "TV BAD RAGAZ";
  return "TV BAD RAGAZ";
}

// ---------- Drawing Helpers ----------
function roundRect(ctx, x, y, w, h, r){
  const radius = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function drawThirds(){
  const w = canvas.width, h = canvas.height;
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

function autoFit() {
  if (!hasImage) return;
  const cw = canvas.width, ch = canvas.height;
  const iw = img.width, ih = img.height;

  scale = Math.min(cw / iw, ch / ih);
  tx = (cw - iw * scale) / 2;
  ty = (ch - ih * scale) / 2;
}

function startInteracting(){
  isInteracting = true;
  if (hideGridTimer) clearTimeout(hideGridTimer);
}

function stopInteractingSoon(){
  if (hideGridTimer) clearTimeout(hideGridTimer);
  hideGridTimer = setTimeout(() => {
    isInteracting = false;
    draw();
  }, 650);
}

function touchDist(t1, t2){
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.hypot(dx, dy);
}

function clamp(v, lo, hi){
  return Math.max(lo, Math.min(hi, v));
}
