// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: table-tennis;

/*************************************************
 * AÑO — PÁDEL · TENIS · heatmap semanal del AÑO CALENDARIO en curso
 * (enero → diciembre, grid 8×7). Fondo alternado por mes + inicial en
 * la 1ª semana de cada mes. Las semanas que todavía no ocurrieron se
 * dibujan más tenues.
 * Scriptable · Widget Small · Light/Dark
 *************************************************/

const BASE_URL = "https://health.carlos-cb4.workers.dev";
const CATEGORY = "racquet";
const TITLE = "Pádel · Tenis";
const CACHE_FILE = "anual-padel-tenis-cache.json";

const BG_COLOR = Color.dynamic(new Color("#FFFFFF"), new Color("#1C1C1E"));
const TITLE_COLOR = Color.dynamic(new Color("#0F1115"), new Color("#F5F5F7"));
const MONTH_MARK_COLOR = Color.dynamic(new Color("#000000", 0.55), new Color("#FFFFFF", 0.55));
const CACHE_DOT_COLOR = Color.dynamic(new Color("#8E8E93"), new Color("#8E8E93"));
const EMPTY_A = Color.dynamic(new Color("#3C3C43", 0.09), new Color("#FFFFFF", 0.08));
const EMPTY_B = Color.dynamic(new Color("#3C3C43", 0.05), new Color("#FFFFFF", 0.045));
// semanas que todavía no ocurrieron: mucho más tenues, para que se lea
// "esto está por venir" y no "acá no entrenaste"
const FUTURE_A = Color.dynamic(new Color("#3C3C43", 0.03), new Color("#FFFFFF", 0.028));
const FUTURE_B = Color.dynamic(new Color("#3C3C43", 0.018), new Color("#FFFFFF", 0.016));
const LEVEL_1 = Color.dynamic(new Color("#22C55E", 0.35), new Color("#34D399", 0.35));
const LEVEL_2 = Color.dynamic(new Color("#22C55E", 0.65), new Color("#34D399", 0.65));
const LEVEL_3 = Color.dynamic(new Color("#22C55E", 1.0), new Color("#34D399", 1.0));

const MONTH_INITIALS = ["E", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

// ================= CALENDARIO DEL AÑO =================
// El widget cubre el AÑO CALENDARIO en curso (1 ene → 31 dic), no una
// ventana móvil de 52 semanas. Antes era móvil pero con las iniciales de
// mes fijas [E,F,M,...], así que las etiquetas no se correspondían con las
// fechas reales: los entrenamientos recientes caían en celdas rotuladas
// "S O N D" y parecía haber actividad hasta fin de año (bug que encontró
// Cal el 2026-07-29).
const DAY_MS = 86400000;
const YEAR = new Date().getFullYear();
const JAN_1 = new Date(YEAR, 0, 1);
// desplazamiento del 1 de enero dentro de su semana (0 = lunes), para que
// cada columna de la grilla sea una semana lunes→domingo real
const START_OFFSET = (JAN_1.getDay() + 6) % 7;
const DAYS_IN_YEAR = Math.round((new Date(YEAR, 11, 31) - JAN_1) / DAY_MS) + 1;
const TOTAL_WEEKS = Math.ceil((DAYS_IN_YEAR + START_OFFSET) / 7); // 52 o 53

// índice de semana (0-based) de un día del año dado por su offset en días
const weekOfDayIndex = (dayIdx) => Math.floor((dayIdx + START_OFFSET) / 7);

// mes (0-11) representativo de una semana: el de su primer día dentro del año
function monthOfWeek(w) {
  const dayIdx = Math.max(0, w * 7 - START_OFFSET);
  return new Date(YEAR, 0, 1 + Math.min(dayIdx, DAYS_IN_YEAR - 1)).getMonth();
}

// última semana con datos posibles: la que contiene hoy (las siguientes
// todavía no ocurrieron)
const TODAY = new Date();
TODAY.setHours(0, 0, 0, 0);
const CURRENT_WEEK = TODAY.getFullYear() === YEAR
  ? weekOfDayIndex(Math.round((TODAY - JAN_1) / DAY_MS))
  : TOTAL_WEEKS - 1;

// ================= AUTH =================
function apiKey() {
  if (!Keychain.contains("HEALTH_API_KEY")) {
    throw new Error("Falta HEALTH_API_KEY en Keychain — correr setup una vez");
  }
  return Keychain.get("HEALTH_API_KEY");
}

// ================= FETCH =================
async function fetchHeatmap() {
  // 400 y no 365: hay que cubrir desde el 1 de enero incluso estando a fin
  // de diciembre de un año bisiesto (366 días atrás), con margen
  const req = new Request(`${BASE_URL}/workouts/heatmap?category=${CATEGORY}&days=400&key=${encodeURIComponent(apiKey())}`);
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
// agrupa los días sueltos devueltos por el worker en las semanas del año
// calendario en curso; semana 0 = la que contiene el 1 de enero
function aggregateByWeek(days) {
  const weekCounts = new Array(TOTAL_WEEKS).fill(0);

  for (const d of days) {
    const date = new Date(d.date + "T00:00:00");
    if (date.getFullYear() !== YEAR) continue; // datos de otros años: fuera
    const dayIdx = Math.round((date - JAN_1) / DAY_MS);
    const weekIndex = weekOfDayIndex(dayIdx);
    if (weekIndex >= 0 && weekIndex < TOTAL_WEEKS) weekCounts[weekIndex] += d.count;
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

  // orden de lectura tipo texto: semana 1 arriba a la izquierda, se avanza
  // de izquierda a derecha y se baja de fila en fila hasta la última semana
  // del año abajo a la derecha (antes se llenaba columna por columna hacia
  // abajo y luego se saltaba a la derecha, que se leía al revés)
  for (let w = 0; w < TOTAL_WEEKS; w++) {
    const row = Math.floor(w / cols);
    const col = w % cols;
    const x = PAD + col * (cellW + gap);
    const y = gridTop + row * (cellH + gap);

    // mes calculado de la fecha real de la semana, no de bloques fijos
    const mIdx = monthOfWeek(w);
    const isFirstOfMonth = w === 0 || monthOfWeek(w - 1) !== mIdx;
    const isFuture = w > CURRENT_WEEK;
    const activityColor = levelColorFor(weekCounts[w]);
    const emptyColor = isFuture
      ? (mIdx % 2 === 0 ? FUTURE_A : FUTURE_B)
      : (mIdx % 2 === 0 ? EMPTY_A : EMPTY_B);
    const fill = activityColor ?? emptyColor;

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
