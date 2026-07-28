// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: orange; icon-glyph: dumbbell;

/*************************************************
 * AÑO — FUERZA · heatmap semanal (52 semanas, grid 8×7)
 * Fondo alternado por mes + inicial en la 1ª semana de cada mes
 * Scriptable · Widget Small · Light/Dark
 *************************************************/

const BASE_URL = "https://health.carlos-cb4.workers.dev";
const CATEGORY = "strength";
const TITLE = "Fuerza";
const CACHE_FILE = "anual-fuerza-cache.json";

const BG_COLOR = Color.dynamic(new Color("#FFFFFF"), new Color("#1C1C1E"));
const TITLE_COLOR = Color.dynamic(new Color("#0F1115"), new Color("#F5F5F7"));
const MONTH_MARK_COLOR = Color.dynamic(new Color("#000000", 0.55), new Color("#FFFFFF", 0.55));
const CACHE_DOT_COLOR = Color.dynamic(new Color("#8E8E93"), new Color("#8E8E93"));
const EMPTY_A = Color.dynamic(new Color("#3C3C43", 0.09), new Color("#FFFFFF", 0.08));
const EMPTY_B = Color.dynamic(new Color("#3C3C43", 0.05), new Color("#FFFFFF", 0.045));
const LEVEL_1 = Color.dynamic(new Color("#F97316", 0.35), new Color("#FB8A3C", 0.35));
const LEVEL_2 = Color.dynamic(new Color("#F97316", 0.65), new Color("#FB8A3C", 0.65));
const LEVEL_3 = Color.dynamic(new Color("#F97316", 1.0), new Color("#FB8A3C", 1.0));

const MONTH_BLOCKS = [4, 4, 5, 4, 4, 5, 4, 4, 5, 4, 4, 5]; // suman 52
const MONTH_INITIALS = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

// ================= AUTH =================
function apiKey() {
  if (!Keychain.contains("HEALTH_API_KEY")) {
    throw new Error("Falta HEALTH_API_KEY en Keychain — correr setup una vez");
  }
  return Keychain.get("HEALTH_API_KEY");
}

// ================= FETCH =================
async function fetchHeatmap() {
  const req = new Request(`${BASE_URL}/workouts/heatmap?category=${CATEGORY}&days=365&key=${encodeURIComponent(apiKey())}`);
  req.timeoutInterval = 10;
  const json = await req.loadJSON();
  return json.data || [];
}

// ================= CACHE =================
const fm = FileManager.local();
const cachePath = fm.joinPath(fm.documentsDirectory(), CACHE_FILE);

function readCache() {
  if (!fm.fileExists(cachePath)) return null;
  try {
    return JSON.parse(fm.readString(cachePath));
  } catch {
    return null;
  }
}

function writeCache(days) {
  fm.writeString(cachePath, JSON.stringify(days));
}

async function loadDays() {
  try {
    const days = await fetchHeatmap();
    writeCache(days);
    return { days, isCache: false };
  } catch (e) {
    const cached = readCache();
    if (cached) return { days: cached, isCache: true };
    throw e;
  }
}

// ================= AGGREGATE =================
// agrupa los días sueltos devueltos por el worker en 52 semanas;
// semana 51 = la más reciente (contiene hoy), semana 0 = hace 52 semanas
function aggregateByWeek(days) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const weekCounts = new Array(52).fill(0);

  for (const d of days) {
    const date = new Date(d.date + "T00:00:00");
    const diffDays = Math.floor((today - date) / 86400000);
    if (diffDays < 0 || diffDays >= 364) continue;
    const weekIndex = 51 - Math.floor(diffDays / 7);
    if (weekIndex >= 0 && weekIndex < 52) weekCounts[weekIndex] += d.count;
  }
  return weekCounts;
}

function levelColorFor(count) {
  if (count <= 0) return null; // se resuelve con el tinte de mes
  if (count === 1) return LEVEL_1;
  if (count === 2) return LEVEL_2;
  return LEVEL_3;
}

// ================= DRAW =================
function draw(weekCounts, isCache) {
  const scale = 3; // nitidez en pantallas retina
  const W = 155 * scale;
  const H = 155 * scale;
  const PAD = 13 * scale;

  const ctx = new DrawContext();
  ctx.size = new Size(W, H);
  ctx.opaque = true;

  ctx.setFillColor(BG_COLOR);
  ctx.fillRect(new Rect(0, 0, W, H));

  ctx.setFont(Font.boldSystemFont(12 * scale));
  ctx.setTextColor(TITLE_COLOR);
  ctx.drawText(TITLE, new Point(PAD, PAD));

  if (isCache) {
    const dotSize = 5 * scale;
    ctx.setFillColor(CACHE_DOT_COLOR);
    ctx.fillEllipse(new Rect(W - PAD - dotSize, PAD + 2 * scale, dotSize, dotSize));
  }

  const cols = 8;
  const rows = 7;
  const gridTop = PAD + 20 * scale;
  const gridWidth = W - PAD * 2;
  const gridHeight = H - gridTop - PAD;
  const gap = 2 * scale;
  const cellW = (gridWidth - gap * (cols - 1)) / cols;
  const cellH = (gridHeight - gap * (rows - 1)) / rows;

  const monthOfWeek = [];
  MONTH_BLOCKS.forEach((len, mIdx) => { for (let i = 0; i < len; i++) monthOfWeek.push(mIdx); });

  for (let w = 0; w < 52; w++) {
    const col = Math.floor(w / rows);
    const row = w % rows;
    const x = PAD + col * (cellW + gap);
    const y = gridTop + row * (cellH + gap);

    const mIdx = monthOfWeek[w];
    const isFirstOfMonth = w === 0 || monthOfWeek[w - 1] !== mIdx;
    const activityColor = levelColorFor(weekCounts[w]);
    const fill = activityColor ?? (mIdx % 2 === 0 ? EMPTY_A : EMPTY_B);

    ctx.setFillColor(fill);
    ctx.fillRect(new Rect(x, y, cellW, cellH));

    if (isFirstOfMonth) {
      ctx.setFont(Font.mediumSystemFont(5 * scale));
      ctx.setTextColor(MONTH_MARK_COLOR);
      ctx.drawText(MONTH_INITIALS[mIdx], new Point(x + 1 * scale, y + 0.5 * scale));
    }
  }

  return ctx.getImage();
}

// ================= MAIN =================
const widget = new ListWidget();

try {
  const { days, isCache } = await loadDays();
  const weekCounts = aggregateByWeek(days);
  widget.backgroundImage = draw(weekCounts, isCache);
} catch (e) {
  widget.backgroundColor = BG_COLOR;
  const title = widget.addText("⚠️ Error de datos");
  title.font = Font.semiboldSystemFont(13);
  title.textColor = Color.red();
  widget.addSpacer(6);
  const msg = widget.addText(String(e.message || e));
  msg.font = Font.systemFont(11);
  msg.textColor = Color.gray();
}

if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentSmall();
}
Script.complete();
