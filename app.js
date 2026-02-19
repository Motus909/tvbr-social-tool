const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

const imageUpload = document.getElementById("imageUpload");
const titleInput = document.getElementById("titleInput");
const categorySelect = document.getElementById("categorySelect");
const zoomSlider = document.getElementById("zoomSlider");
const xSlider = document.getElementById("xSlider");
const ySlider = document.getElementById("ySlider");
const downloadBtn = document.getElementById("downloadBtn");

let img = new Image();

const COLORS = {
  aktiv: "#ffffff",
  jugi: "#76869D",
  leistung: "#ffffff",
  gesellschaft: "#CDCCCC"
};

const NAVY = "#1a355b";
const ORANGE = "#e67e22";

imageUpload.addEventListener("change", function (e) {
  const reader = new FileReader();
  reader.onload = function (event) {
    img.src = event.target.result;
  };
  reader.readAsDataURL(e.target.files[0]);
});

img.onload = draw;

zoomSlider.oninput = draw;
xSlider.oninput = draw;
ySlider.oninput = draw;
titleInput.oninput = draw;
categorySelect.onchange = draw;

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (!img.src) return;

  const zoom = parseFloat(zoomSlider.value);
  const offsetX = parseInt(xSlider.value);
  const offsetY = parseInt(ySlider.value);

  const imgWidth = img.width * zoom;
  const imgHeight = img.height * zoom;

  ctx.drawImage(
    img,
    canvas.width / 2 - imgWidth / 2 + offsetX,
    canvas.height / 2 - imgHeight / 2 + offsetY,
    imgWidth,
    imgHeight
  );

  // Gradient unten
  const gradient = ctx.createLinearGradient(0, 1000, 0, 1350);
  gradient.addColorStop(0, "rgba(0,0,0,0)");
  gradient.addColorStop(1, "rgba(0,0,0,0.6)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // Hauptbalken (Navy)
  ctx.fillStyle = NAVY;
  ctx.fillRect(0, 1000, canvas.width, 200);

  // Unterbalken Kategorie
  ctx.fillStyle = COLORS[categorySelect.value];
  ctx.fillRect(0, 1200, canvas.width, 150);

  // Leistung Akzentlinie
  if (categorySelect.value === "leistung") {
    ctx.fillStyle = ORANGE;
    ctx.fillRect(0, 995, canvas.width, 10);
  }

  // Titel
  ctx.fillStyle = "white";
  ctx.font = "bold 60px Arial";
  ctx.fillText(titleInput.value, 50, 1100);
}

downloadBtn.addEventListener("click", function () {
  const link = document.createElement("a");
  link.download = "tvbr_post.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
});
