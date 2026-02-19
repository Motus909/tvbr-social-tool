const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const imageUpload = document.getElementById("imageUpload");
const titleInput = document.getElementById("titleInput");
const categorySelect = document.getElementById("categorySelect");
const downloadBtn = document.getElementById("downloadBtn");
const fitBtn = document.getElementById("fitBtn");
const resetBtn = document.getElementById("resetBtn");

const OVERLAY = {
  baseY: 1040,          // wo das Overlay startet (anpassen nach Geschmack)
  navyHeight: 64,       // Höhe des Navy Balkens
  navyPadX: 26,         // links/rechts Padding im Balken
  navyRadius: 14,       // abgerundete Ecken

  titleFontPx: 20,      // <— wie du willst
  titleWeight: 700,

  subBarYGap: 12,       // Abstand zwischen Navy und weissem Balken (optisch)
  subBarHeight: 130,    // Höhe weisser/heller Balken

  accentHeight: 16,     // Höhe des orangen Balkens
  accentCut: 18         // wie stark er in den weissen Balken reinragt
};


const NAVY = "#1a355b";
const ORANGE = "#e67e22";

// Unterbalken-Farben (Riegen/Segment)
const UNDER = {
  aktiv: "#ffffff",
  jugi: "#76869D",
  leistung: "#ffffff",
  gesellschaft: "#CDCCCC"
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

// Touch tracking (stabil auf Mobile)
let lastTouch = null;
let lastDist = null;

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

// Wenn Bild geladen: Auto-Fit (GANZES BILD SICHTBAR)
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

const canvasWrap = document.querySelector(".canvas-wrap");

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


function onWheelZoom(e){
  if (!hasImage) return;

  // Nur wenn Event abgebrochen werden darf
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

// Capture = true ist entscheidend
canvas.addEventListener("wheel", onWheelZoom, { passive: false, capture: true });
canvasWrap.addEventListener("wheel", onWheelZoom, { passive: false, capture: true });


// Touch: Start
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

// Touch: Move (Drag + Pinch)
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

      // Mittelpunkt der Finger
      const mx = ((e.touches[0].clientX + e.touches[1].clientX) / 2 - rect.left) * sx;
      const my = ((e.touches[0].clientY + e.touches[1].clientY) / 2 - rect.top) * sy;

      // Weltpunkt vor Zoom
      const wx = (mx - tx) / scale;
      const wy = (my - ty) / scale;

      scale = newScale;

      // Weltpunkt nach Zoom wieder unter Cursor
      tx = mx - wx * scale;
      ty = my - wy * scale;
    }
    lastDist = d;
  }

  draw();
}, { passive: false });

// Touch: End
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

// Desktop: Maus-Drag als Bonus
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

// Zoom mit Mausrad / Trackpad – nur wenn Cursor über dem Canvas ist
canvas.addEventListener("wheel", (e) => {
  if (!hasImage) return;

  // WICHTIG: verhindert Seiten-Scroll oder Browser-Zoom
  e.preventDefault();

  startInteracting();

  const rect = canvas.getBoundingClientRect();

  // Mausposition relativ zum Canvas
  const mouseX = (e.clientX - rect.left);
  const mouseY = (e.clientY - rect.top);

  // In Canvas-Koordinaten umrechnen
  const sx = canvas.width / rect.width;
  const sy = canvas.height / rect.height;

  const mx = mouseX * sx;
  const my = mouseY * sy;

  // Zoom-Geschwindigkeit
  const zoomIntensity = 0.0015;
  const factor = Math.exp(-e.deltaY * zoomIntensity);

  const newScale = clamp(scale * factor, 0.15, 8);

  // Zoom um Mauspunkt
  const wx = (mx - tx) / scale;
  const wy = (my - ty) / scale;

  scale = newScale;
  tx = mx - wx * scale;
  ty = my - wy * scale;

  draw();
  stopInteractingSoon();

}, { passive: false });



// Download
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
    // Placeholder
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

  // 1) Hintergrundbild (transformiert)
  ctx.save();
  ctx.translate(tx, ty);
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  ctx.restore();

  // 2) Drittel-Linien nur beim Interagieren
  if (isInteracting) drawThirds();

  // 3) Gradient unten (Lesbarkeit)
  const g = ctx.createLinearGradient(0, 950, 0, 1350);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.60)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // -------- Overlay (dynamische Balkenbreite, 1 Zeile) --------

// Gradient unten (Lesbarkeit)
const gradient = ctx.createLinearGradient(0, OVERLAY.baseY - 120, 0, canvas.height);
gradient.addColorStop(0, "rgba(0,0,0,0)");
gradient.addColorStop(1, "rgba(0,0,0,0.60)");
ctx.fillStyle = g;
ctx.fillRect(0, 0, canvas.width, canvas.height);

// Text-Setup
const titleText = (titleInput.value || "").trim();
const titleFont = `${OVERLAY.titleWeight} ${OVERLAY.titleFontPx}px Calibri, Arial, sans-serif`;

ctx.save();
ctx.font = titleFont;

// Textbreite messen -> Navy-Balkenbreite
const textW = ctx.measureText(titleText || " ").width;
const navyW = Math.min(canvas.width - 120, textW + 2 * OVERLAY.navyPadX); // max Breite begrenzen
const navyH = OVERLAY.navyHeight;

// Navy-Balken zentriert
const navyX = (canvas.width - navyW) / 2;
const navyY = OVERLAY.baseY;

// Navy-Balken zeichnen (mit optionaler Transparenz)
ctx.fillStyle = NAVY; // oder z.B. "rgba(26,53,91,0.92)"
roundRect(ctx, navyX, navyY, navyW, navyH, OVERLAY.navyRadius);
ctx.fill();

// Text zentriert im Navy-Balken
ctx.fillStyle = "#fff";
ctx.textAlign = "center";
ctx.textBaseline = "middle";
ctx.fillText(titleText || " ", navyX + 20, navyY + navyH / 2);

ctx.restore();

// Unterbalken (Riege) – volle Breite
const subBarY = navyY + navyH + OVERLAY.subBarYGap;
ctx.fillStyle = UNDER[categorySelect.value] || "#fff";
ctx.fillRect(0, subBarY, canvas.width, OVERLAY.subBarHeight);

// Orange Balken (Leistung) – unterhalb Navy, schneidet in den weissen Balken
if (categorySelect.value === "leistung") {
  ctx.fillStyle = ORANGE;
  // liegt zwischen Navy & Subbar und ragt in Subbar hinein
  ctx.fillRect(
    0,
    subBarY - OVERLAY.accentCut,                 // rein in den weissen Balken
    canvas.width,
    OVERLAY.accentHeight + OVERLAY.accentCut     // überlappt und ist sichtbar
  );
}

// // Subline im Unterbalken (Position dynamisch)
// ctx.fillStyle = "#111";
// ctx.font = "900 40px Calibri, Arial, sans-serif";
// ctx.textAlign = "left";
// ctx.textBaseline = "alphabetic";
// ctx.fillText(subLabel(categorySelect.value), 60, subBarY + 85);


//   // 5) Titeltext (wrap)
//   const title = (titleInput.value || "").trim();
//   ctx.fillStyle = "#fff";
//   ctx.font = "900 68px system-ui";
//   wrapText(title || " ", 60, 1090, 960, 78);

//   // 6) Subline (verein/riege)
//   ctx.fillStyle = "#111";
//   ctx.font = "900 46px system-ui";
//   ctx.fillText(subLabel(categorySelect.value), 60, 1290);
// }

function subLabel(cat){
  if (cat === "jugi") return "JUGI BAD RAGAZ";
  if (cat === "leistung") return "TV BAD RAGAZ LA LEISTUNGSTEAM";
  if (cat === "gesellschaft") return "TV BAD RAGAZ";
  return "TV BAD RAGAZ";
}

function wrapText(text, x, y, maxWidth, lineHeight) {
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return;

  let line = "";
  for (let i = 0; i < words.length; i++) {
    const test = line ? (line + " " + words[i]) : words[i];
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = words[i];
      y += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, x, y);
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

  // kleine Punkte
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  const pts = [[w/3,h/3],[2*w/3,h/3],[w/3,2*h/3],[2*w/3,2*h/3]];
  for (const [x,y] of pts){
    ctx.fillRect(x-3, y-3, 6, 6);
  }
  ctx.restore();
}

// ---------- Helpers ----------

function autoFit() {
  if (!hasImage) return;
  const cw = canvas.width, ch = canvas.height;
  const iw = img.width, ih = img.height;

  // FIT: min => ganzes Bild sichtbar
  scale = Math.min(cw / iw, ch / ih);

  // zentrieren
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
  }, 650); // nach kurzer Zeit ausblenden
}

function touchDist(t1, t2){
  const dx = t1.clientX - t2.clientX;
  const dy = t1.clientY - t2.clientY;
  return Math.hypot(dx, dy);
}

function clamp(v, lo, hi){
  return Math.max(lo, Math.min(hi, v));
}
