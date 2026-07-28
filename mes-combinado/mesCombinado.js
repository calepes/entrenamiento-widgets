// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-orange; icon-glyph: calendar-alt;

/*************************************************
 * MES — COMBINADO · calendario del mes con punto por tipo
 * naranja = fuerza · verde = pádel/tenis (ambos = los dos puntos)
 * Scriptable · Widget Small · Light/Dark
 *************************************************/

const BASE_URL = "https://health.carlos-cb4.workers.dev";
const CACHE_FILE = "mes-combinado-cache.json";

const ACCENT_STRENGTH = Color.dynamic(new Color("#F97316"), new Color("#FB8A3C"));
const ACCENT_RACQUET  = Color.dynamic(new Color("#22C55E"), new Color("#34D399"));
const NUM_COLOR = Color.dynamic(new Color("#3C3C43", 0.6), new Color("#EBEBF5", 0.6));

// ================= AUTH =================
function apiKey() {
  if (!Keychain.contains("HEALTH_API_KEY")) {
    throw new Error("Falta HEALTH_API_KEY en Keychain — correr setup una vez");
  }
  return Keychain.get("HEALTH_API_KEY");
}

// ================= FETCH =================
async function fetchHeatmap(category) {
  const req = new Request(`${BASE_URL}/workouts/heatmap?category=${category}&days=32&key=${encodeURIComponent(apiKey())}`);
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

function writeCache(strengthDays, racquetDays) {
  fm.writeString(cachePath, JSON.stringify({ strengthDays, racquetDays }));
}

async function loadMonthData() {
  try {
    const [strengthDays, racquetDays] = await Promise.all([
      fetchHeatmap("strength"),
      fetchHeatmap("racquet"),
    ]);
    writeCache(strengthDays, racquetDays);
    return { strengthDays, racquetDays };
  } catch (e) {
    const cached = readCache();
    if (cached) return cached;
    throw e;
  }
}

// ================= DATE HELPERS =================
const now = new Date();
const year = now.getFullYear();
const month = now.getMonth(); // 0-indexed
const daysInMonth = new Date(year, month + 1, 0).getDate();
const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7; // 0 = lunes
const monthPrefix = `${year}-${String(month + 1).padStart(2, "0")}`;

function isCurrentMonth(dateStr) {
  return dateStr.slice(0, 7) === monthPrefix;
}

function dateStrFor(day) {
  return `${monthPrefix}-${String(day).padStart(2, "0")}`;
}

// ================= WIDGET UI =================
const widget = new ListWidget();
widget.setPadding(13, 13, 13, 13);

const monthName = now.toLocaleDateString("es-BO", { month: "long" });
const titleLabel = widget.addText(monthName.charAt(0).toUpperCase() + monthName.slice(1));
titleLabel.font = Font.boldSystemFont(15);

widget.addSpacer(6);

try {
  const { strengthDays, racquetDays } = await loadMonthData();
  const strengthSet = new Set(strengthDays.filter(d => isCurrentMonth(d.date)).map(d => d.date));
  const racquetSet = new Set(racquetDays.filter(d => isCurrentMonth(d.date)).map(d => d.date));

  const totalCells = firstWeekday + daysInMonth;
  const rows = Math.ceil(totalCells / 7);

  for (let r = 0; r < rows; r++) {
    const rowStack = widget.addStack();
    rowStack.layoutHorizontally();
    rowStack.spacing = 2;

    for (let c = 0; c < 7; c++) {
      const cellIndex = r * 7 + c;
      const dayNum = cellIndex - firstWeekday + 1;

      const cellStack = rowStack.addStack();
      cellStack.layoutHorizontally();
      cellStack.centerAlignContent();
      cellStack.spacing = 2;

      if (dayNum < 1 || dayNum > daysInMonth) {
        cellStack.addSpacer();
        continue;
      }

      const dateStr = dateStrFor(dayNum);

      const numLabel = cellStack.addText(String(dayNum));
      numLabel.font = Font.systemFont(8);
      numLabel.textColor = NUM_COLOR;

      const dotColumn = cellStack.addStack();
      dotColumn.layoutVertically();
      dotColumn.spacing = 1;
      dotColumn.size = new Size(3, 0);

      if (strengthSet.has(dateStr)) {
        const dot = dotColumn.addStack();
        dot.size = new Size(3, 3);
        dot.cornerRadius = 1.5;
        dot.backgroundColor = ACCENT_STRENGTH;
      }
      if (racquetSet.has(dateStr)) {
        const dot = dotColumn.addStack();
        dot.size = new Size(3, 3);
        dot.cornerRadius = 1.5;
        dot.backgroundColor = ACCENT_RACQUET;
      }
    }
    if (r < rows - 1) widget.addSpacer(4);
  }
} catch (e) {
  const msg = widget.addText(String(e.message || e));
  msg.font = Font.systemFont(11);
  msg.textColor = Color.red();
}

// ================= PRESENT =================
if (config.runsInWidget) {
  Script.setWidget(widget);
} else {
  await widget.presentSmall();
}
Script.complete();
