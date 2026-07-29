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

// medidas usadas para calcular el padding vertical (ver más abajo) — deben
// coincidir con lo que realmente se renderiza en la sección WIDGET UI
const BASE_PAD = 6;
const HEADER_HEIGHT = 14;
const HEADER_GAP = 3;
const ROW_HEIGHT = 19; // número bold 13pt (~15.5 de alto) + spacing 0.5 + puntito 3
const ROW_GAP = 3;
// tamaño típico del widget Small en los iPhone modernos (390pt de ancho) —
// no hay forma de leer el tamaño real del widget desde Scriptable, así que
// se asume este valor; si el dispositivo real es más chico el padding
// calculado se recorta a 0 (nunca negativo) y como mucho queda sin centrar
// perfecto, nunca se corta contenido (ver cálculo de EXTRA_TARGET más abajo)
const ASSUMED_CANVAS = 158;

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
// así que se calcula acá arriba y sirve para el padding vertical de abajo
const totalCells = firstWeekday + daysInMonth;
const rows = Math.ceil(totalCells / 7);

// padding vertical calculado para centrar la grilla dentro del widget:
// nada de spacers flexibles (ver HANDOFF.md — no se expanden de forma
// confiable ni en la raíz del ListWidget ni anidados más de un nivel),
// en cambio se calcula cuánto aire falta a cada lado según cuántas filas
// tiene el mes y se reparte como padding fijo, mismo mecanismo que ya
// usan todos los widgets probados de Cal (setPadding/addSpacer con
// números fijos, nunca flexibles — ver Claude Max.js)
const gridHeight = HEADER_HEIGHT + HEADER_GAP + rows * ROW_HEIGHT + (rows - 1) * ROW_GAP;
const extraVertical = Math.max(0, (ASSUMED_CANVAS - 2 * BASE_PAD - gridHeight) / 2);
const vPad = BASE_PAD + extraVertical;

// ================= WIDGET UI =================
// sin título: todo el widget es la grilla (pedido de Cal — el mes ya se
// infiere por ser "el mes actual", no hace falta repetirlo como texto)
const widget = new ListWidget();
widget.setPadding(vPad, BASE_PAD, vPad, BASE_PAD);

try {
  const { strengthDays, racquetDays } = await loadMonthData();
  const strengthSet = new Set(strengthDays.filter(d => isCurrentMonth(d.date)).map(d => d.date));
  const racquetSet = new Set(racquetDays.filter(d => isCurrentMonth(d.date)).map(d => d.date));

  // fila exterior con spacers flexibles a los lados — ESTE spacer sí funciona
  // porque está anidado en un WidgetStack (outerRow) que es hijo DIRECTO de
  // `widget`; centra la grilla de ancho fijo (7×COL_WIDTH) dentro del ancho
  // variable del widget real. (No confundir con el centrado vertical, que
  // se resuelve arriba con padding calculado, no con spacers.)
  const outerRow = widget.addStack();
  outerRow.layoutHorizontally();
  outerRow.addSpacer();
  const grid = outerRow.addStack();
  grid.layoutVertically();
  outerRow.addSpacer();

  // encabezado de días de la semana (L M X J V S D — mismo ancho fijo que las columnas de días,
  // mismo tamaño de fuente que los números del mes para que no se vea desproporcionado)
  const headerRow = grid.addStack();
  headerRow.layoutHorizontally();
  for (const label of WEEKDAY_LABELS) {
    const cell = headerRow.addStack();
    cell.size = new Size(COL_WIDTH, 14);
    // vertical, no horizontal: centerAlignContent() solo centra en el eje
    // transversal — con layoutHorizontally() el ancho (que es lo que hay que
    // centrar acá) es el eje principal y queda sin efecto (bug encontrado en review)
    cell.layoutVertically();
    cell.centerAlignContent();
    const t = cell.addText(label);
    t.font = Font.semiboldSystemFont(12);
    t.textColor = WEEKDAY_COLOR;
  }

  grid.addSpacer(HEADER_GAP);

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
    if (r < rows - 1) grid.addSpacer(ROW_GAP);
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
