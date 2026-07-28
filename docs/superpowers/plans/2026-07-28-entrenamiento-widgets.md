# Widgets de entrenamiento — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Shippear 3 widgets de Scriptable (Mes combinado, Año Fuerza, Año Pádel·Tenis) que muestran entrenamientos de Apple Health vía el Health Worker existente de Cal, más los cambios de backend que los habilitan (bucket `racquet`, endpoint `/workouts/heatmap`).

**Architecture:** Cloudflare Worker (`health-worker`) agrega un endpoint nuevo de conteo diario por categoría; un MCP server (`mcp-health`) expone el bucket nuevo a Jano; 3 scripts de Scriptable (repo nuevo `entrenamiento-widgets`, patrón loader+eval igual a `tipo-de-cambio-Bolivia`) consumen ese endpoint y dibujan calendario/heatmap on-device.

**Tech Stack:** Cloudflare Workers + D1 (TypeScript), `@modelcontextprotocol/sdk` (Node/TS), Scriptable (JavaScript, iOS).

**Nota sobre testing:** ninguno de los 3 repos tocados tiene test runner (`health-worker` y `mcp-health` no tienen `jest`/`vitest` en su `package.json`; Scriptable no tiene test runner posible, corre on-device). La verificación sigue el patrón ya establecido en este código: `wrangler dev` + `curl` para el worker, build + inspección manual para el MCP server, y prueba visual en el iPhone real para los widgets. No hay TDD clásico posible acá — se sigue el patrón existente del repo en vez de introducir infraestructura de testing nueva.

**Spec de referencia:** `docs/superpowers/specs/2026-07-28-entrenamiento-widgets-design.md` (mismo repo).

---

## Task 1: Bucket `racquet` en `workoutCategory()`

**Files:**
- Modify: `Personal/Agents/Health/health-worker/src/index.ts:17-26`

- [ ] **Step 1: Reemplazar la función `workoutCategory`**

Reemplazar (líneas 17-26):

```ts
function workoutCategory(type: string): string {
  if (STRENGTH_TYPES.has(type)) return 'strength'
  if (/run|jog|treadmill/i.test(type)) return 'cardio'
  if (/cycl|bike|spin/i.test(type)) return 'cardio'
  if (/swim/i.test(type)) return 'cardio'
  if (/tennis|paddle|squash|racquet|basket|soccer|football|volley|sport/i.test(type)) return 'cardio'
  if (/walk|hik/i.test(type)) return 'walk'
  if (/yoga|stretch|pilates/i.test(type)) return 'flexibility'
  return 'other'
}
```

por:

```ts
function workoutCategory(type: string): string {
  if (STRENGTH_TYPES.has(type)) return 'strength'
  if (/tennis|paddle|padel|squash|racquet/i.test(type)) return 'racquet'
  if (/run|jog|treadmill/i.test(type)) return 'cardio'
  if (/cycl|bike|spin/i.test(type)) return 'cardio'
  if (/swim/i.test(type)) return 'cardio'
  if (/basket|soccer|football|volley|sport/i.test(type)) return 'cardio'
  if (/walk|hik/i.test(type)) return 'walk'
  if (/yoga|stretch|pilates/i.test(type)) return 'flexibility'
  return 'other'
}
```

El chequeo de raqueta se mueve ANTES de los chequeos de cardio (si no, nunca se alcanza — es una cadena de `if` con retorno temprano) y se agrega `padel` explícito (el regex original solo tenía `paddle`, que no matchea el string "Padel" que probablemente manda Apple Health).

- [ ] **Step 2: Commit**

```bash
cd "/Users/calepes/Claude Projects/Personal/Agents/Health/health-worker"
git add src/index.ts
git commit -m "feat: separate racquet sports (tennis/padel/squash) from cardio bucket"
```

---

## Task 2: Endpoint `GET /workouts/heatmap`

**Files:**
- Modify: `Personal/Agents/Health/health-worker/src/index.ts` (agregar bloque nuevo después del bloque `/workouts/summary`, antes de `/measurements`, y actualizar el 404 final)

- [ ] **Step 1: Agregar el endpoint**

Insertar este bloque nuevo justo después del cierre del bloque `if (url.pathname === '/workouts/summary') { ... }` (antes del comentario `// GET /measurements`):

```ts
    // GET /workouts/heatmap?category=strength&days=365 — conteo diario por categoría
    // category es requerido: strength|cardio|walk|flexibility|other|racquet
    // Devuelve solo los días CON actividad (payload liviano, sin ceros explícitos)
    if (url.pathname === '/workouts/heatmap') {
      const category = url.searchParams.get('category')
      const days = parseInt(url.searchParams.get('days') ?? '365')
      if (!category) {
        return new Response(JSON.stringify({ error: 'category is required' }), { status: 400 })
      }
      const fromDate = boliviaDateOffsetDays(days)

      const rows = await env.DB.prepare(
        `SELECT type, date, duration_min
         FROM health_workouts
         WHERE date >= ?
         ORDER BY date ASC`
      ).bind(fromDate).all<{ type: string; date: string; duration_min: number }>()

      const byDate = new Map<string, { count: number; duration_min: number }>()
      for (const r of rows.results ?? []) {
        if (workoutCategory(r.type) !== category) continue
        const existing = byDate.get(r.date) ?? { count: 0, duration_min: 0 }
        existing.count += 1
        existing.duration_min += r.duration_min ?? 0
        byDate.set(r.date, existing)
      }

      const data = Array.from(byDate.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, v]) => ({ date, count: v.count, duration_min: Math.round(v.duration_min) }))

      return new Response(JSON.stringify({ category, days, data }), {
        headers: { 'Content-Type': 'application/json' },
      })
    }

```

- [ ] **Step 2: Actualizar el mensaje 404 final**

Reemplazar (línea ~557):

```ts
    return new Response('Health Data Worker. POST /ingest, GET /summary, /trend, /workouts/summary, /measurements, /status', { status: 404 })
```

por:

```ts
    return new Response('Health Data Worker. POST /ingest, GET /summary, /trend, /workouts/summary, /workouts/heatmap, /measurements, /status', { status: 404 })
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/calepes/Claude Projects/Personal/Agents/Health/health-worker"
git add src/index.ts
git commit -m "feat: add /workouts/heatmap endpoint (daily counts per category)"
```

---

## Task 3: Verificar Tasks 1-2 con `wrangler dev`

**Files:** ninguno (solo verificación)

- [ ] **Step 1: Levantar el worker en local**

```bash
cd "/Users/calepes/Claude Projects/Personal/Agents/Health/health-worker"
npx wrangler dev --local
```

Expected: arranca en `http://localhost:8787` sin errores de compilación TS.

- [ ] **Step 2: Probar el endpoint nuevo con una categoría real**

En otra terminal (con el `HEALTH_API_KEY` real, sacado de `~/.claude/secrets/apps.env`):

```bash
curl -s "http://localhost:8787/workouts/heatmap?category=strength&days=365&key=$HEALTH_API_KEY" | head -c 500
```

Expected: JSON `{"category":"strength","days":365,"data":[{"date":"...","count":N,"duration_min":N}, ...]}` — sin error 401/500.

- [ ] **Step 3: Probar el bucket `racquet`**

```bash
curl -s "http://localhost:8787/workouts/heatmap?category=racquet&days=365&key=$HEALTH_API_KEY" | python3 -m json.tool | head -20
```

Expected: si hay workouts de tenis/pádel registrados en D1, aparecen acá (antes vivían dentro de `cardio`). Si el resultado viene vacío pero sabés que jugaste pádel este año, revisar Step 4.

- [ ] **Step 4: Confirmar que `cardio` YA NO incluye tenis/pádel**

```bash
curl -s "http://localhost:8787/workouts/summary?days=365&type=cardio&key=$HEALTH_API_KEY" | python3 -c "import json,sys; d=json.load(sys.stdin); print([w['type'] for w in d['workouts']])"
```

Expected: la lista de `type` no debe contener "Tennis", "Padel" ni "Squash" — deben haber migrado a `racquet`.

- [ ] **Step 5: Parar `wrangler dev`** (Ctrl+C) — no hace falta commit, este task es solo verificación.

---

## Task 4: Actualizar documentación del worker

**Files:**
- Modify: `Personal/Agents/Health/health-worker/README.md:62-66`
- Modify: `Personal/Agents/Health/CLAUDE.md:37-46`

- [ ] **Step 1: Actualizar README.md**

Reemplazar (líneas 62-66):

```markdown
**Categorías:**
- `strength`: Functional/Traditional Strength Training, Core Training, Cross Training, HIIT
- `cardio`: Running, Cycling, Swimming, Tennis, Padel, etc.
- `walk`: Walking, Hiking
- `flexibility`: Yoga, Pilates, Stretching
- `other`: todo lo demás
```

por:

```markdown
**Categorías:**
- `strength`: Functional/Traditional Strength Training, Core Training, Cross Training, HIIT
- `racquet`: Tennis, Padel, Squash
- `cardio`: Running, Cycling, Swimming, Basketball, Soccer, etc.
- `walk`: Walking, Hiking
- `flexibility`: Yoga, Pilates, Stretching
- `other`: todo lo demás

**`GET /workouts/heatmap?category=X&days=N&key=KEY`** — conteo diario por categoría (solo días con actividad), pensado para heatmaps tipo GitHub. Respuesta: `{category, days, data:[{date, count, duration_min}, ...]}`.
```

- [ ] **Step 2: Actualizar CLAUDE.md**

Reemplazar la línea:

```markdown
Categorías: `strength` · `cardio` · `walk` · `flexibility` · `other`. Filtrar por categoría: `?type=strength`.
```

por:

```markdown
Categorías: `strength` · `racquet` · `cardio` · `walk` · `flexibility` · `other`. Filtrar por categoría: `?type=strength`. Tenis/pádel/squash viven en `racquet` desde 2026-07-28 (antes en `cardio`).
```

Y agregar en la tabla de rutas, después de la fila de `/workouts/summary`:

```markdown
| `GET` | `/workouts/heatmap?category=X&days=N&key=KEY` | Conteo diario por categoría (solo días con actividad) — para heatmaps |
```

- [ ] **Step 3: Commit**

```bash
cd "/Users/calepes/Claude Projects/Personal/Agents/Health/health-worker"
git add README.md
git commit -m "docs: document racquet category and /workouts/heatmap endpoint"
cd "/Users/calepes/Claude Projects/Personal/Agents/Health"
git add CLAUDE.md
git commit -m "docs: document racquet category and /workouts/heatmap endpoint"
```

(Ajustar el segundo `git add`/`git commit` si `CLAUDE.md` vive en un repo distinto al de `health-worker` — verificar con `git -C "Personal/Agents/Health" rev-parse --show-toplevel` antes de commitear.)

---

## Task 5: Deploy del worker a producción

**⚠️ Acción con efecto en producción — pausar acá y pedir confirmación explícita a Cal antes de correr `deploy`, incluso si el resto del plan se ejecuta de forma autónoma.**

**Files:** ninguno

- [ ] **Step 1: Deploy**

```bash
cd "/Users/calepes/Claude Projects/Personal/Agents/Health/health-worker"
npx wrangler deploy
```

Expected: deploy exitoso, URL sigue siendo `health.carlos-cb4.workers.dev`.

- [ ] **Step 2: Smoke test en producción**

```bash
curl -s "https://health.carlos-cb4.workers.dev/workouts/heatmap?category=strength&days=7&key=$HEALTH_API_KEY"
```

Expected: mismo shape que en local (Task 3).

---

## Task 6: Agregar `racquet` al MCP server `health`

**Files:**
- Modify: `Personal/MCP Servers/mcp-servers/servers/health/src/index.ts:74,81`

- [ ] **Step 1: Actualizar descripción y enum de `getWorkouts`**

Reemplazar (líneas 71-88):

```ts
    {
      name: "getWorkouts",
      description:
        "Workouts registrados en Apple Health. Devuelve tipo raw (Tennis, Running, Functional Strength Training, etc.), duración en minutos, calorías activas, FC promedio y máxima, y categoría agrupada (cardio|strength|walk|flexibility|other). Args: { days?: int (default 7), category?: 'cardio'|'strength'|'walk'|'flexibility'|'other' }.",
      inputSchema: {
        type: "object",
        properties: {
          days: { type: "number", description: "Días a consultar, default 7" },
          category: {
            type: "string",
            enum: ["cardio", "strength", "walk", "flexibility", "other"],
            description: "Filtrar por categoría (opcional)",
          },
        },
        additionalProperties: false,
      },
      ...READ_ONLY,
    },
```

por:

```ts
    {
      name: "getWorkouts",
      description:
        "Workouts registrados en Apple Health. Devuelve tipo raw (Tennis, Running, Functional Strength Training, etc.), duración en minutos, calorías activas, FC promedio y máxima, y categoría agrupada (cardio|strength|racquet|walk|flexibility|other). Args: { days?: int (default 7), category?: 'cardio'|'strength'|'racquet'|'walk'|'flexibility'|'other' }.",
      inputSchema: {
        type: "object",
        properties: {
          days: { type: "number", description: "Días a consultar, default 7" },
          category: {
            type: "string",
            enum: ["cardio", "strength", "racquet", "walk", "flexibility", "other"],
            description: "Filtrar por categoría (opcional) — racquet = tenis/pádel/squash",
          },
        },
        additionalProperties: false,
      },
      ...READ_ONLY,
    },
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/calepes/Claude Projects/Personal/MCP Servers/mcp-servers"
git add servers/health/src/index.ts
git commit -m "feat(mcp-health): add racquet to getWorkouts category enum"
```

---

## Task 7: Build del MCP server

**Files:** ninguno (solo build + verificación)

- [ ] **Step 1: Build**

```bash
cd "/Users/calepes/Claude Projects/Personal/MCP Servers/mcp-servers/servers/health"
npm run build
```

Expected: compila sin errores TS, genera `dist/index.js`.

- [ ] **Step 2: Verificar que el enum nuevo quedó en el build**

```bash
grep -o '"racquet"' dist/index.js | head -1
```

Expected: imprime `"racquet"` (confirma que el build tomó el cambio).

- [ ] **Step 3: Nota — no reiniciar Jano automáticamente**

Jano usa este MCP server compilado (`dist/index.js`) — el cambio no toma efecto en el daemon corriendo hasta el próximo restart. **No reiniciar el daemon de Jano como parte de este plan** — avisar a Cal y dejar que él decida cuándo reiniciar (`launchctl bootout/bootstrap com.cal.cos-agent-v2.plist`), seat de la regla general de no reiniciar procesos de producción sin confirmación explícita.

---

## Task 8: Scaffold del repo `entrenamiento-widgets`

**Files:**
- Create: `Personal/Apps/entrenamiento-widgets/.gitignore`
- Create: `Personal/Apps/entrenamiento-widgets/mes-combinado/` (carpeta)
- Create: `Personal/Apps/entrenamiento-widgets/anual-fuerza/` (carpeta)
- Create: `Personal/Apps/entrenamiento-widgets/anual-padel-tenis/` (carpeta)

El repo ya existe (`git init` hecho en la sesión de brainstorming, con el spec ya commiteado en `docs/superpowers/specs/`).

- [ ] **Step 1: Crear `.gitignore`** (mismo contenido que `tipo-de-cambio-Bolivia/.gitignore`)

```
# --- security-audit-2026-05-17 ---
.env
.env.*
!.env.example
!.env.template
!.env.sample
*.pem
secrets
.credentials*
```

- [ ] **Step 2: Crear las 3 carpetas de widgets**

```bash
cd "/Users/calepes/Claude Projects/Personal/Apps/entrenamiento-widgets"
mkdir -p mes-combinado anual-fuerza anual-padel-tenis
```

- [ ] **Step 3: Commit**

```bash
git add .gitignore
git commit -m "chore: add .gitignore"
```

---

## Task 9: `mes-combinado/mesCombinado.js`

**Files:**
- Create: `Personal/Apps/entrenamiento-widgets/mes-combinado/mesCombinado.js`

- [ ] **Step 1: Escribir el script**

```javascript
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
```

Nota de diseño: a diferencia de `Gráfica TC.js`, este widget no marca visualmente "(cache)" cuando usa datos guardados — no hay espacio en el layout final aprobado (sin footer). El fallback a caché funciona igual (silencioso), solo no se anuncia en pantalla. Si Cal lo quiere explícito más adelante, es un cambio menor.

- [ ] **Step 2: Commit**

```bash
cd "/Users/calepes/Claude Projects/Personal/Apps/entrenamiento-widgets"
git add mes-combinado/mesCombinado.js
git commit -m "feat: add mes-combinado widget script"
```

---

## Task 10: `mes-combinado/loader.js`

**Files:**
- Create: `Personal/Apps/entrenamiento-widgets/mes-combinado/loader.js`

- [ ] **Step 1: Escribir el loader** (mismo patrón que `tipo-de-cambio-Bolivia`)

```javascript
// Scriptable Loader — Mes Combinado (Entrenamiento)
// Copia este código en Scriptable. Descarga y ejecuta
// siempre la última versión del widget desde GitHub.

const REPO = "calepes/entrenamiento-widgets";
const BRANCH = "main";
const FILE = "mes-combinado/mesCombinado.js";
const RAW_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${FILE}`;

const req = new Request(RAW_URL);
req.timeoutInterval = 10;
const code = await req.loadString();

if (req.response.statusCode !== 200) {
  const w = new ListWidget();
  w.addText("⚠ Error al cargar script");
  if (config.runsInWidget) {
    Script.setWidget(w);
  } else {
    await w.presentSmall();
  }
  Script.complete();
  return;
}

eval(code);
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/calepes/Claude Projects/Personal/Apps/entrenamiento-widgets"
git add mes-combinado/loader.js
git commit -m "feat: add mes-combinado loader"
```

---

## Task 11: `anual-fuerza/anualFuerza.js`

**Files:**
- Create: `Personal/Apps/entrenamiento-widgets/anual-fuerza/anualFuerza.js`

- [ ] **Step 1: Escribir el script** (`DrawContext`, mismo enfoque que `Gráfica TC.js`)

```javascript
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
    return days;
  } catch (e) {
    const cached = readCache();
    if (cached) return cached;
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
function draw(weekCounts) {
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
  const days = await loadDays();
  const weekCounts = aggregateByWeek(days);
  widget.backgroundImage = draw(weekCounts);
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
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/calepes/Claude Projects/Personal/Apps/entrenamiento-widgets"
git add anual-fuerza/anualFuerza.js
git commit -m "feat: add anual-fuerza widget script"
```

---

## Task 12: `anual-fuerza/loader.js`

**Files:**
- Create: `Personal/Apps/entrenamiento-widgets/anual-fuerza/loader.js`

- [ ] **Step 1: Escribir el loader**

```javascript
// Scriptable Loader — Año Fuerza (Entrenamiento)
// Copia este código en Scriptable. Descarga y ejecuta
// siempre la última versión del widget desde GitHub.

const REPO = "calepes/entrenamiento-widgets";
const BRANCH = "main";
const FILE = "anual-fuerza/anualFuerza.js";
const RAW_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${FILE}`;

const req = new Request(RAW_URL);
req.timeoutInterval = 10;
const code = await req.loadString();

if (req.response.statusCode !== 200) {
  const w = new ListWidget();
  w.addText("⚠ Error al cargar script");
  if (config.runsInWidget) {
    Script.setWidget(w);
  } else {
    await w.presentSmall();
  }
  Script.complete();
  return;
}

eval(code);
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/calepes/Claude Projects/Personal/Apps/entrenamiento-widgets"
git add anual-fuerza/loader.js
git commit -m "feat: add anual-fuerza loader"
```

---

## Task 13: `anual-padel-tenis/anualPadelTenis.js`

**Files:**
- Create: `Personal/Apps/entrenamiento-widgets/anual-padel-tenis/anualPadelTenis.js`

- [ ] **Step 1: Escribir el script** (idéntico a Task 11, cambiando categoría/título/colores/cache-file)

```javascript
// Variables used by Scriptable.
// These must be at the very top of the file. Do not edit.
// icon-color: green; icon-glyph: table-tennis;

/*************************************************
 * AÑO — PÁDEL · TENIS · heatmap semanal (52 semanas, grid 8×7)
 * Fondo alternado por mes + inicial en la 1ª semana de cada mes
 * Scriptable · Widget Small · Light/Dark
 *************************************************/

const BASE_URL = "https://health.carlos-cb4.workers.dev";
const CATEGORY = "racquet";
const TITLE = "Pádel · Tenis";
const CACHE_FILE = "anual-padel-tenis-cache.json";

const BG_COLOR = Color.dynamic(new Color("#FFFFFF"), new Color("#1C1C1E"));
const TITLE_COLOR = Color.dynamic(new Color("#0F1115"), new Color("#F5F5F7"));
const MONTH_MARK_COLOR = Color.dynamic(new Color("#000000", 0.55), new Color("#FFFFFF", 0.55));
const EMPTY_A = Color.dynamic(new Color("#3C3C43", 0.09), new Color("#FFFFFF", 0.08));
const EMPTY_B = Color.dynamic(new Color("#3C3C43", 0.05), new Color("#FFFFFF", 0.045));
const LEVEL_1 = Color.dynamic(new Color("#22C55E", 0.35), new Color("#34D399", 0.35));
const LEVEL_2 = Color.dynamic(new Color("#22C55E", 0.65), new Color("#34D399", 0.65));
const LEVEL_3 = Color.dynamic(new Color("#22C55E", 1.0), new Color("#34D399", 1.0));

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
    return days;
  } catch (e) {
    const cached = readCache();
    if (cached) return cached;
    throw e;
  }
}

// ================= AGGREGATE =================
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
  if (count <= 0) return null;
  if (count === 1) return LEVEL_1;
  if (count === 2) return LEVEL_2;
  return LEVEL_3;
}

// ================= DRAW =================
function draw(weekCounts) {
  const scale = 3;
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
  const days = await loadDays();
  const weekCounts = aggregateByWeek(days);
  widget.backgroundImage = draw(weekCounts);
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
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/calepes/Claude Projects/Personal/Apps/entrenamiento-widgets"
git add anual-padel-tenis/anualPadelTenis.js
git commit -m "feat: add anual-padel-tenis widget script"
```

---

## Task 14: `anual-padel-tenis/loader.js`

**Files:**
- Create: `Personal/Apps/entrenamiento-widgets/anual-padel-tenis/loader.js`

- [ ] **Step 1: Escribir el loader**

```javascript
// Scriptable Loader — Año Pádel · Tenis (Entrenamiento)
// Copia este código en Scriptable. Descarga y ejecuta
// siempre la última versión del widget desde GitHub.

const REPO = "calepes/entrenamiento-widgets";
const BRANCH = "main";
const FILE = "anual-padel-tenis/anualPadelTenis.js";
const RAW_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${FILE}`;

const req = new Request(RAW_URL);
req.timeoutInterval = 10;
const code = await req.loadString();

if (req.response.statusCode !== 200) {
  const w = new ListWidget();
  w.addText("⚠ Error al cargar script");
  if (config.runsInWidget) {
    Script.setWidget(w);
  } else {
    await w.presentSmall();
  }
  Script.complete();
  return;
}

eval(code);
```

- [ ] **Step 2: Commit**

```bash
cd "/Users/calepes/Claude Projects/Personal/Apps/entrenamiento-widgets"
git add anual-padel-tenis/loader.js
git commit -m "feat: add anual-padel-tenis loader"
```

---

## Task 15: Push a GitHub y setup manual en el iPhone

**⚠️ Acciones visibles/externas — pausar y confirmar con Cal antes de cada una.**

**Files:** ninguno

- [ ] **Step 1: Crear el repo en GitHub y pushear** (requiere confirmación explícita de Cal)

```bash
cd "/Users/calepes/Claude Projects/Personal/Apps/entrenamiento-widgets"
gh repo create calepes/entrenamiento-widgets --public --source=. --remote=origin
git push -u origin main
```

- [ ] **Step 2: Guardar el API key en Keychain (una sola vez, en el propio Scriptable del iPhone)**

Esto NO se commitea — es un script ad-hoc que Cal corre una vez en la app Scriptable (crear un script temporal, pegar, correr, borrar):

```javascript
Keychain.set("HEALTH_API_KEY", "EL_VALOR_REAL_DE_HEALTH_API_KEY");
```

- [ ] **Step 3: Instalar los 3 loaders en Scriptable**

Para cada uno de los 3 widgets, crear un script nuevo en Scriptable con el contenido de su `loader.js` correspondiente (`mes-combinado/loader.js`, `anual-fuerza/loader.js`, `anual-padel-tenis/loader.js`), y agregarlo como widget Small al home screen (long-press → Editar → Scriptable → elegir el script correspondiente).

---

## Task 16: Verificación final end-to-end

**Files:** ninguno

- [ ] **Step 1: Confirmar los 3 widgets en el dispositivo real**

Revisar contra el mockup aprobado (artifact "Fuerza & Pádel·Tenis — Widget Mockup"): números y puntos no se salen del widget, heatmap anual legible, fondo alternado por mes visible, inicial de mes en la esquina correcta.

- [ ] **Step 2: Probar dark mode real del dispositivo**

Cambiar el iPhone a modo oscuro (Ajustes → Pantalla y brillo) y confirmar que los 3 widgets cambian de paleta. Recordar: el heatmap anual usa `DrawContext` — el color queda fijo al momento en que el script se ejecuta, así que puede tardar hasta el próximo refresh del widget en reflejar el cambio de modo (limitación conocida, ya presente en `Gráfica TC.js`).

- [ ] **Step 3: Probar el caso sin caché ni red**

Activar modo avión, forzar refresh de cada widget (tap → o esperar el ciclo de refresh de iOS) y confirmar que muestran datos cacheados o el mensaje de error, nunca en blanco.

- [ ] **Step 4: Sanity check contra Apple Salud**

Para un día conocido con entrenamiento de fuerza, confirmar que aparece marcado en `Mes — combinado` y contado en `Año — Fuerza`.
