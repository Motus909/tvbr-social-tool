const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const imageUpload = document.getElementById("imageUpload");
const titleInput = document.getElementById("titleInput");
const categorySelect = document.getElementById("categorySelect");
const downloadBtn = document.getElementById("downloadBtn");
const fitBtn = document.getElementById("fitBtn");
const resetBtn = document.getElementById("resetBtn");

let img = new Image();
let hasImage = false;

// Transform fürs Framing
let scale = 1;
let tx = 0;
let ty = 0;

// Pointer tracking (für Drag + Pinch)
const pointers = new Map();
let isInteracting = false;
let pinchStartDist = null;
let pinchStartScale = 1;
let pinchStartMid = null;

const NAVY = "#1a355b";
const ORANGE = "#e67e22";
const COLORS = {
  aktiv: "#ffffff",
  jugi: "#76869D",
  leistung: "#ffffff",
  gesellschaft: "#CDCCCC"
};

imageUpload.addEventListener("change", (e) => {
  const f = e.target.files?.[0];
  if (!f) return;

  const reader = new FileReader();
  reader.onload = (ev) => { img.src = ev.target.result; };
  reader.readAsDataURL(f);
});

img.onload = () => {
  hasImage = true;
  autoFit();          // so dass ganzes Bild sichtbar ist
  draw();
};

titleInput.addEventListener("input", draw);
categorySelect.addEventListener("change", draw);
fitBtn.addEventListener("click", () => { autoFit(); draw(); });
resetBtn.addEventListener("click", () => { autoFit(); draw(); });

/** Auto-Fit: ganzes Bild sichtbar (FIT) */
function autoFit() {
  if (!hasImage) return;

  const cw = canvas.width, ch = canvas.height;
  const iw = img.width, ih = img.height;

  // FIT => min, damit alles sichtbar
  scale = Math.min(cw / iw, ch / ih);

  // zentrieren
  tx = (cw - iw * scale) / 2;
  ty = (ch - ih * scale) / 2;
}

/** Hilfsfunktionen für Pinch */
function dist(a, b){
  const dx = a.x - b.x, dy = a.y - b.y;
  return Math.hypot(dx, dy);
}
function mid(a, b){
  return { x:(a.x+b.x)/2, y:(a.y+b.y)/2 };
}

/** Canvas: Pointer Events aktivieren */
canvas.addEventListener("pointerdown", (e) => {
  canvas.setPointerCapture(e.pointerId);
  pointers.set(e.pointerId, { x: e.offsetX, y: e.offsetY });
  isInteracting = true;

  if (pointers.size === 2) {
    const [p1, p2] = [...pointers.values()];
    pinchStartDist = dist(p1, p2);
    pinchStartScale = scale;
    pinchStartMid = mid(p1, p2);
  }
  draw();
});

canvas.addEventListener("pointermove", (e) => {
  if (!pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  const curr = { x: e.offsetX, y: e.offsetY };
  pointers.set(e.pointerId, curr);

  if (!hasImage) return;

  if (pointers.size === 1) {
    // Drag
    tx += (curr.x - prev.x) * (canvas.width / canvas.getBoundingClientRect().width);
    ty += (curr.y - prev.y) * (canvas.height / canvas.getBoundingClientRect().height);
  } else if (pointers.size === 2) {
    // Pinch zoom
    const [p1, p2] = [...pointers.values()];
    const d = dist(p1, p2);
    const m = mid(p1, p2);

    const zoomFactor = d / (pinchStartDist || d);
    const newScale = clamp(pinchStartScale * zoomFactor, 0.2, 5);

    // Zoom um den Mittelpunkt (damit es sich „richtig“ anfühlt)
    const cw = canvas.width / canvas.getBoundingClientRect().width;
    const ch = canvas.height / canvas.getBoundingClientRect().height;

    const mx = m.x * cw;
    const my = m.y * ch;

    // Weltpunkt vor Zoom
    const wx = (mx - tx) / scale;
    const wy = (my - ty) / scale;

    scale = newScale;

    // Weltpunkt nach Zoom wieder unter Cursor
    tx = mx - wx * scale;
    ty = my - wy * scale;

    pinchStartDist = d;
    pinchStartScale = scale;
  }

  draw();
});

canvas.addEventListener("pointerup", endPointer);
canvas.addEventListener("pointercancel", endPointer);

function endPointer(e){
  pointers.delete(e.pointerId);
  if (pointers.size < 2) {
    pinchStartDist = null;
    pinchStartMid = null;
  }
  if (pointers.size === 0) {
    isInteracting = false;
  }
  draw();
}

function clamp(v, lo, hi){ return Math.max(lo, Math.min(hi, v)); }

/** Zeichnen */
function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!hasImage) {
    // Placeholder
    ctx.fillStyle = "#000";
    ctx.fillRect(0,0,canvas.width, canvas.height);
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.font = "bold 48px system-ui";
    ctx.fillText("Bild laden …", 60, 160);
    return;
  }

  // Foto (mit Transform)
  ctx.save();
  ctx.translate(tx, ty);
  ctx.scale(scale, scale);
  ctx.drawImage(img, 0, 0);
  ctx.restore();

  // Rule of thirds nur beim Interagieren (oder du machst einen Toggle)
  if (isInteracting) drawThirds();

  // Gradient unten (Lesbarkeit)
  const g = ctx.createLinearGradient(0, 980, 0, 1350);
  g.addColorStop(0, "rgba(0,0,0,0)");
  g.addColorStop(1, "rgba(0,0,0,0.55)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Balken-Layout wie bisher (kannst du später hübscher machen)
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 1000, canvas.width, 200);

  ctx.fillStyle = COLORS[categorySelect.value] || "#fff";
  ctx.fillRect(0, 1200, canvas.width, 150);

  if (categorySelect.value === "leistung") {
    ctx.fillStyle = ORANGE;
    ctx.fillRect(0, 995, canvas.width, 10);
  }

  // Titel
  ctx.fillStyle = "#fff";
  ctx.font = "800 64px system-ui"; // später Anton einbauen
  const title = titleInput.value || "";
  wrapText(title, 50, 1080, 980, 72);

  // Subline (optional)
  ctx.fillStyle = "#111";
  ctx.font = "800 44px system-ui";
  ctx.fillText(labelForCategory(categorySelect.value), 50, 1290);
}

function labelForCategory(cat){
  if (cat === "jugi") return "JUGI BAD RAGAZ";
  if (cat === "leistung") return "TV BAD RAGAZ LA LEISTUNGSTEAM";
  if (cat === "gesellschaft") return "TV BAD RAGAZ";
  return "TV BAD RAGAZ";
}

/** Rule of thirds zeichnen */
function drawThirds(){
  const w = canvas.width, h = canvas.height;
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.55)";
  ctx.lineWidth = 2;

  ctx.beginPath();
  ctx.moveTo(w/3, 0); ctx.lineTo(w/3, h);
  ctx.moveTo(2*w/3, 0); ctx.lineTo(2*w/3, h);
  ctx.moveTo(0, h/3); ctx.lineTo(w, h/3);
  ctx.moveTo(0, 2*h/3); ctx.lineTo(w, 2*h/3);
  ctx.stroke();

  // optional: kleine Kreuzchen an Intersection
  ctx.fillStyle = "rgba(255,255,255,0.75)";
  const pts = [[w/3,h/3],[2*w/3,h/3],[w/3,2*h/3],[2*w/3,2*h/3]];
  for (const [x,y] of pts){
    ctx.fillRect(x-3, y-3, 6, 6);
  }
  ctx.restore();
}

/** Text umbrechen */
function wrapText(text, x, y, maxWidth, lineHeight){
  const words = text.split(/\s+/);
  let line = "";
  for (let n=0; n<words.length; n++){
    const testLine = line + (line ? " " : "") + words[n];
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && line) {
      ctx.fillText(line, x, y);
      line = words[n];
      y += lineHeight;
    } else {
      line = testLine;
    }
  }
  if (line) ctx.fillText(line, x, y);
}

downloadBtn.addEventListener("click", () => {
  // Export genau vom 1080×1350 Canvas
  const link = document.createElement("a");
  link.download = "tvbr_post.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});
