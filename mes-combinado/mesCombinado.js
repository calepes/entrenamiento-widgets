// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: deep-orange; icon-glyph: calendar-alt;

/*************************************************
 * MES — COMBINADO · calendario del mes, número coloreado por tipo
 * naranja = fuerza · verde = pádel/tenis (ambos = número + puntito extra)
 * Scriptable · Widget Small · Light/Dark
 *************************************************/

const BASE_URL = "https://health.carlos-cb4.workers.dev";
const CACHE_FILE = "mes-combinado-cache.json";

const ACCENT_STRENGTH = Color.dynamic(new Color("#F97316"), new Color("#FB8A3C"));
const ACCENT_RACQUET  = Color.dynamic(new Color("#22C55E"), new Color("#34D399"));
const NUM_COLOR = Color.dynamic(new Color("#3C3C43", 0.45), new Color("#EBEBF5", 0.45));
const WEEKDAY_COLOR = Color.dynamic(new Color("#3C3C43", 0.6), new Color("#EBEBF5", 0.6));

const WEEKDAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];
const COL_WIDTH = 20;

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
// sin título: todo el widget es la grilla (pedido de Cal — el mes ya se
// infiere por ser "el mes actual", no hace falta repetirlo como texto)
const widget = new ListWidget();
widget.setPadding(6, 6, 6, 6);

try {
  const { strengthDays, racquetDays } = await loadMonthData();
  const strengthSet = new Set(strengthDays.filter(d => isCurrentMonth(d.date)).map(d => d.date));
  const racquetSet = new Set(racquetDays.filter(d => isCurrentMonth(d.date)).map(d => d.date));

  // spacer flexible arriba — mismo mecanismo que el de abajo, pero en el eje
  // vertical del widget: centra la grilla completa cuando un mes de 4-5
  // filas no llena las 6 filas de altura máxima reservada
  widget.addSpacer();

  // fila exterior con spacers flexibles a los lados — ListWidget no centra
  // sus stacks hijos por default (quedaban pegados a la izquierda), este es
  // el patrón oficial de Scriptable para centrar un stack de ancho fijo
  // (grilla de 7×COL_WIDTH) dentro del ancho variable del widget real
  const outerRow = widget.addStack();
  outerRow.layoutHorizontally();
  outerRow.addSpacer();
  const grid = outerRow.addStack();
  grid.layoutVertically();
  outerRow.addSpacer();

  // encabezado de días de la semana (L M X J V S D — mismo ancho fijo que las columnas de días)
  const headerRow = grid.addStack();
  headerRow.layoutHorizontally();
  for (const label of WEEKDAY_LABELS) {
    const cell = headerRow.addStack();
    cell.size = new Size(COL_WIDTH, 12);
    // vertical, no horizontal: centerAlignContent() solo centra en el eje
    // transversal — con layoutHorizontally() el ancho (que es lo que hay que
    // centrar acá) es el eje principal y queda sin efecto (bug encontrado en review)
    cell.layoutVertically();
    cell.centerAlignContent();
    const t = cell.addText(label);
    t.font = Font.semiboldSystemFont(9);
    t.textColor = WEEKDAY_COLOR;
  }

  grid.addSpacer(2);

  const totalCells = firstWeekday + daysInMonth;
  const rows = Math.ceil(totalCells / 7);

  for (let r = 0; r < rows; r++) {
    const rowStack = grid.addStack();
    rowStack.layoutHorizontally();

    for (let c = 0; c < 7; c++) {
      const cellIndex = r * 7 + c;
      const dayNum = cellIndex - firstWeekday + 1;

      // ancho fijo por columna — así los números quedan alineados en grilla real
      // (antes cada celda se angostaba/ensanchaba según el contenido: "3" vs "31")
      const cellStack = rowStack.addStack();
      cellStack.size = new Size(COL_WIDTH, 0);
      cellStack.layoutVertically();
      cellStack.centerAlignContent();
      cellStack.spacing = 0.5;

      if (dayNum < 1 || dayNum > daysInMonth) {
        continue; // celda vacía: igual reserva su ancho de columna (size ya seteado arriba)
      }

      const dateStr = dateStrFor(dayNum);
      const hasStrength = strengthSet.has(dateStr);
      const hasRacquet = racquetSet.has(dateStr);
      const hasBoth = hasStrength && hasRacquet;

      // el centrado real lo hace cellStack.centerAlignContent() (arriba) —
      // WidgetText.centerAlignText() no tiene efecto dentro de un stack
      const numLabel = cellStack.addText(String(dayNum));
      if (hasStrength || hasRacquet) {
        numLabel.font = Font.boldSystemFont(13);
        numLabel.textColor = hasStrength ? ACCENT_STRENGTH : ACCENT_RACQUET;
      } else {
        numLabel.font = Font.systemFont(12);
        numLabel.textColor = NUM_COLOR;
      }

      // puntito solo para el caso "hiciste los dos" — reservado en todas las
      // celdas con día real para que la altura de fila no varíe entre celdas
      const dot = cellStack.addStack();
      dot.size = new Size(3, 3);
      if (hasBoth) {
        dot.cornerRadius = 1.5;
        dot.backgroundColor = ACCENT_RACQUET;
      }
    }
    if (r < rows - 1) grid.addSpacer(2);
  }

  widget.addSpacer();
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
