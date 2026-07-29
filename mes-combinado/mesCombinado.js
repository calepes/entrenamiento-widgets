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
// ancho de columna: con dígitos monoespaciados (ver NUM_SIZE), un número
// de dos dígitos quedaba casi tocando el borde de su celda con COL_WIDTH
// 20, mientras que uno de un dígito quedaba holgado — así la separación
// ENTRE dígitos vecinos se veía distinta según el caso aunque los centros
// de columna sí fueran equidistantes. Con 21 hay margen parejo a los dos
// lados en ambos casos (7 × 21 = 147pt, entra en los 150pt disponibles
// del canvas de 158 menos el padding mínimo).
const COL_WIDTH = 21;

// tamaño real confirmado del widget Small en el iPhone de Cal (15/16 no-Pro,
// pantalla de 390pt de ancho) — 158×158pt, tabla oficial de Apple. No hay
// forma de leer esto desde Scriptable en runtime, por eso queda hardcodeado
// (proyecto de un solo dispositivo, no una app distribuida)
const CANVAS = 158;

// grilla real (v3, 2026-07-29): TODAS las celdas (encabezado y números)
// usan el mismo tamaño explícito CELL_SIZE — antes la altura de cada celda
// de número era "0" (auto), así que variaba según si esa celda tenía
// puntito o no, y la separación entre filas no quedaba pareja. Con tamaño
// fijo, el cálculo de altura total deja de ser una estimación de fuente
// (que dependía de metrics que Scriptable no expone) y pasa a ser exacto.
const CELL_HEIGHT = 18;
const ROW_GAP = 4;
const MIN_PAD = 4;
const CELL_SIZE = new Size(COL_WIDTH, CELL_HEIGHT);
// un solo tamaño para TODOS los números (marcados y no marcados) — ver el
// comentario largo donde se usa: en monoespaciada el ancho de avance
// depende del tamaño y no del peso, así que un único tamaño es lo que
// garantiza que todas las columnas midan exactamente lo mismo
const NUM_SIZE = 13;
// empujoncito a la derecha: espacio fijo al inicio de CADA fila (antes de la
// columna del lunes), para compensar a ojo si la grilla se ve corrida hacia
// la izquierda. Subir/bajar este número es la perilla para ajustar el
// centrado fino; 0 lo desactiva.
const LEFT_NUDGE = 1;

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

// padding vertical calculado: matemática exacta, no estimación de fuente
// (ver comentario de CELL_HEIGHT arriba). El ancho NO se calcula acá — el
// centrado horizontal lo resuelve cada fila por su cuenta (ver más abajo).
// filas totales de la grilla = encabezado + una por semana; gaps = una
// menos que filas totales (entre cada par de filas consecutivas)
const totalCellRows = rows + 1;
const gridHeight = totalCellRows * CELL_HEIGHT + (totalCellRows - 1) * ROW_GAP;
const vPad = Math.max(MIN_PAD, (CANVAS - gridHeight) / 2);

// ================= WIDGET UI =================
// sin título: todo el widget es la grilla (pedido de Cal — el mes ya se
// infiere por ser "el mes actual", no hace falta repetirlo como texto)
const widget = new ListWidget();
// padding horizontal mínimo — el centrado horizontal real lo hacen los
// spacers de cada fila (ver addCenteredRow más abajo), no este padding
widget.setPadding(vPad, MIN_PAD, vPad, MIN_PAD);

try {
  const { strengthDays, racquetDays } = await loadMonthData();
  const strengthSet = new Set(strengthDays.filter(d => isCurrentMonth(d.date)).map(d => d.date));
  const racquetSet = new Set(racquetDays.filter(d => isCurrentMonth(d.date)).map(d => d.date));

  // CENTRADO HORIZONTAL — cada fila se centra a sí misma
  //
  // Los intentos anteriores centraban el BLOQUE entero (un `outerRow` con
  // spacers, conteniendo un `grid` vertical con todas las filas adentro).
  // Eso falla porque el ancho del bloque lo determina Scriptable a partir
  // de sus filas hijas, y si ese cálculo no coincide con el ancho real
  // renderizado, TODO el bloque queda corrido (Cal lo vio en pantalla:
  // ~30pt de margen izquierdo contra ~60pt del derecho).
  //
  // Acá cada fila (encabezado y cada semana) es hija DIRECTA de `widget`
  // —un solo nivel de anidamiento, el único donde `addSpacer()` flexible
  // está confirmado funcionando— y lleva sus PROPIOS spacers a los lados.
  // Así cada fila ocupa el ancho completo disponible y centra sus 7 celdas
  // por su cuenta: ninguna fila puede quedar corrida respecto a otra,
  // porque ninguna depende del ancho computado de un contenedor común.
  const addCenteredRow = () => {
    const row = widget.addStack();
    row.layoutHorizontally();
    row.addSpacer(); // empuja desde la izquierda
    const cells = row.addStack();
    cells.layoutHorizontally();
    // espacio fijo antes de la columna del lunes, igual en TODAS las filas
    // (encabezado incluido) para no romper la alineación entre columnas
    if (LEFT_NUDGE > 0) cells.addSpacer(LEFT_NUDGE);
    row.addSpacer(); // empuja desde la derecha → las 7 celdas quedan centradas
    return cells;
  };

  // encabezado de días de la semana (L M X J V S D — mismo ancho fijo que las columnas de días,
  // mismo tamaño de fuente que los números del mes para que no se vea desproporcionado)
  const headerRow = addCenteredRow();
  for (const label of WEEKDAY_LABELS) {
    const cell = headerRow.addStack();
    cell.size = CELL_SIZE; // mismo tamaño que las celdas de número — misma fila de grilla
    // vertical, no horizontal: centerAlignContent() solo centra en el eje
    // transversal — con layoutHorizontally() el ancho (que es lo que hay que
    // centrar acá) es el eje principal y queda sin efecto (bug encontrado en review)
    cell.layoutVertically();
    cell.centerAlignContent();
    const t = cell.addText(label);
    // monoespaciada y del mismo tamaño que los números: así la letra de cada
    // día cae exactamente sobre el centro de su columna, no aproximadamente
    t.font = Font.semiboldMonospacedSystemFont(NUM_SIZE);
    t.textColor = WEEKDAY_COLOR;
  }

  widget.addSpacer(ROW_GAP);

  for (let r = 0; r < rows; r++) {
    const rowStack = addCenteredRow(); // mismo mecanismo de centrado que el encabezado

    for (let c = 0; c < 7; c++) {
      const cellIndex = r * 7 + c;
      const dayNum = cellIndex - firstWeekday + 1;

      // tamaño fijo (mismo CELL_SIZE que el encabezado) — antes la altura
      // era "0" (auto), variaba según si la celda tenía puntito o no, y la
      // separación entre filas no quedaba pareja (encontrado en captura real)
      const cellStack = rowStack.addStack();
      cellStack.size = CELL_SIZE;
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
      //
      // Dos condiciones para que la separación se vea IGUAL en toda la grilla,
      // sin importar si el día es de uno o dos dígitos ni si está marcado:
      //   1. fuente monoespaciada → cada dígito ocupa el mismo ancho (con una
      //      proporcional, "1" es más angosto que "3" y las columnas bailan);
      //   2. MISMO tamaño de fuente para marcados y no marcados (NUM_SIZE) —
      //      en monoespaciada el ancho de avance depende del tamaño, no del
      //      peso, así que bold y regular al mismo tamaño ocupan exactamente
      //      lo mismo; cuando eran tamaños distintos (14 vs 13) las columnas
      //      quedaban geométricamente distintas entre sí.
      const numLabel = cellStack.addText(String(dayNum));
      if (hasStrength || hasRacquet) {
        numLabel.font = Font.boldMonospacedSystemFont(NUM_SIZE);
        numLabel.textColor = hasStrength ? ACCENT_STRENGTH : ACCENT_RACQUET;
      } else {
        numLabel.font = Font.regularMonospacedSystemFont(NUM_SIZE);
        numLabel.textColor = NUM_COLOR;
      }

      // puntito solo para el caso "hiciste los dos" — reservado en todas las
      // celdas con día real para que la altura de fila no varíe entre celdas
      const dot = cellStack.addStack();
      dot.size = new Size(4, 4);
      if (hasBoth) {
        dot.cornerRadius = 2;
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
