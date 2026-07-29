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
const DOT_COLOR = Color.dynamic(new Color("#15803D"), new Color("#22C55E")); // puntito "ambos" — más oscuro que ACCENT_RACQUET para que no se pierda de chico
const NUM_COLOR = Color.dynamic(new Color("#3C3C43", 0.45), new Color("#EBEBF5", 0.45));
const WEEKDAY_COLOR = Color.dynamic(new Color("#3C3C43", 0.6), new Color("#EBEBF5", 0.6));

const WEEKDAY_LABELS = ["L", "M", "X", "J", "V", "S", "D"];
const COL_WIDTH = 20;

// tamaño real confirmado del widget Small en el iPhone de Cal (15/16 no-Pro,
// pantalla de 390pt de ancho) — 158×158pt, tabla oficial de Apple. No hay
// forma de leer esto desde Scriptable en runtime, por eso queda hardcodeado
// (proyecto de un solo dispositivo, no una app distribuida)
const CANVAS = 158;

// medidas usadas para calcular el padding (ver más abajo) — deben
// coincidir con lo que realmente se renderiza en la sección WIDGET UI.
// Ajustadas 2026-07-29 (v2) contra una referencia visual de Cal — números
// más grandes y filas más separadas para que la grilla realmente llene el
// widget, en vez de dejar tanto margen muerto arriba/abajo.
const HEADER_HEIGHT = 13;
const HEADER_GAP = 5;
const ROW_HEIGHT = 17; // número bold 14pt + spacing 0.5 + puntito 3
const ROW_GAP = 5;
const MIN_PAD = 6;

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

// filas de la grilla del mes actual — no depende de los datos de Health,
// así que se calcula acá arriba y sirve para el padding de abajo
const totalCells = firstWeekday + daysInMonth;
const rows = Math.ceil(totalCells / 7);

// padding calculado para centrar la grilla dentro del widget: nada de
// spacers flexibles (ver HANDOFF.md — no son confiables en Scriptable
// para esto, ni en la raíz del ListWidget ni anidados), directamente se
// calcula cuánto aire sobra a cada lado y se reparte como padding fijo —
// mismo mecanismo que ya usan todos los widgets probados de Cal
// (setPadding/addSpacer con números fijos, nunca flexibles)
const gridWidth = 7 * COL_WIDTH;
const hPad = Math.max(MIN_PAD, (CANVAS - gridWidth) / 2);
const gridHeight = HEADER_HEIGHT + HEADER_GAP + rows * ROW_HEIGHT + (rows - 1) * ROW_GAP;
const vPad = Math.max(MIN_PAD, (CANVAS - gridHeight) / 2);

// ================= WIDGET UI =================
// sin título: todo el widget es la grilla (pedido de Cal — el mes ya se
// infiere por ser "el mes actual", no hace falta repetirlo como texto)
const widget = new ListWidget();
widget.setPadding(vPad, hPad, vPad, hPad);

try {
  const { strengthDays, racquetDays } = await loadMonthData();
  const strengthSet = new Set(strengthDays.filter(d => isCurrentMonth(d.date)).map(d => d.date));
  const racquetSet = new Set(racquetDays.filter(d => isCurrentMonth(d.date)).map(d => d.date));

  // encabezado de días de la semana (L M X J V S D — mismo ancho fijo que las columnas de días,
  // mismo tamaño de fuente que los números del mes para que no se vea desproporcionado)
  const headerRow = widget.addStack();
  headerRow.layoutHorizontally();
  for (const label of WEEKDAY_LABELS) {
    const cell = headerRow.addStack();
    cell.size = new Size(COL_WIDTH, 15);
    // vertical, no horizontal: centerAlignContent() solo centra en el eje
    // transversal — con layoutHorizontally() el ancho (que es lo que hay que
    // centrar acá) es el eje principal y queda sin efecto (bug encontrado en review)
    cell.layoutVertically();
    cell.centerAlignContent();
    const t = cell.addText(label);
    t.font = Font.semiboldSystemFont(13);
    t.textColor = WEEKDAY_COLOR;
  }

  widget.addSpacer(HEADER_GAP);

  for (let r = 0; r < rows; r++) {
    const rowStack = widget.addStack();
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
      // fuente tabular (monospaced) — con fuente proporcional normal, "1" es
      // más angosto que "31", así que el aire visible entre columnas variaba
      // según cuántos dígitos tenía cada número aunque el ancho de columna
      // (COL_WIDTH) sea fijo; con dígitos de ancho parejo la separación se ve
      // igual en toda la grilla
      const numLabel = cellStack.addText(String(dayNum));
      if (hasStrength || hasRacquet) {
        numLabel.font = Font.boldMonospacedSystemFont(14);
        numLabel.textColor = hasStrength ? ACCENT_STRENGTH : ACCENT_RACQUET;
      } else {
        numLabel.font = Font.regularMonospacedSystemFont(13);
        numLabel.textColor = NUM_COLOR;
      }

      // puntito solo para el caso "hiciste los dos" — reservado en todas las
      // celdas con día real para que la altura de fila no varíe entre celdas
      const dot = cellStack.addStack();
      dot.size = new Size(3, 3);
      if (hasBoth) {
        dot.cornerRadius = 1.5;
        dot.backgroundColor = DOT_COLOR;
      }
    }
    if (r < rows - 1) widget.addSpacer(ROW_GAP);
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
