# Handoff — Widgets de entrenamiento (2026-07-28)

Contexto para retomar exactamente donde quedó la sesión. Plan completo: `docs/superpowers/plans/2026-07-28-entrenamiento-widgets.md` (16 tasks). Spec de diseño: `docs/superpowers/specs/2026-07-28-entrenamiento-widgets-design.md`.

## Estado: Tasks 1-15 (parte automatizable) completos. Falta Task 15 (parte manual en iPhone) + Task 16.

### Backend — deployado y verificado en producción
- `health.carlos-cb4.workers.dev` (repo `Personal/Agents/Health/health-worker/`, ahora versionado en git — no lo estaba antes de esta sesión):
  - Bucket `racquet` separado de `cardio` para tenis/pádel/squash (antes vivían mezclados).
  - Endpoint nuevo `GET /workouts/heatmap?category=X&days=N&key=KEY` — conteo diario por categoría, solo días con actividad.
  - Deployado a producción, verificado con curl con datos reales de Cal (padel/tenis 11, 18, 25 jul; fuerza 22, 24, 25 jul).
- MCP server `mcp-health` (repo `Personal/MCP Servers/mcp-servers/`) — enum de `getWorkouts` actualizado con `racquet`, buildeado. **No se reinició el daemon de Jano** (a propósito — requiere confirmación de Cal, no se hizo).

### Widgets — escritos, revisados, commiteados, pusheados a GitHub
Repo nuevo: `https://github.com/calepes/entrenamiento-widgets` (público, patrón loader+eval igual a `tipo-de-cambio-Bolivia`).
- `mes-combinado/` — calendario del mes, punto por tipo (naranja fuerza / verde pádel-tenis).
- `anual-fuerza/` — heatmap semanal 52 semanas (grid 8×7), naranja, con indicador de caché (punto gris via `ctx.fillEllipse`, agregado en code review).
- `anual-padel-tenis/` — igual, verde, mismo indicador de caché desde el arranque.

## Pendiente — Task 15 (parte manual, solo Cal puede hacerla en su iPhone)

Los 3 loaders ya están desplegados directo en la carpeta de iCloud de Scriptable (2026-07-29), byte-idénticos a los del repo — no hace falta crearlos a mano en la app, solo esperar a que sincronicen (o forzar sync abriendo Scriptable) y usarlos:
- `Mes Combinado.js`
- `Año Fuerza.js`
- `Año Pádel · Tenis.js`

1. **Guardar `HEALTH_API_KEY` en el Keychain del dispositivo** (una sola vez, script ad-hoc en Scriptable, correr y borrar):
   ```javascript
   Keychain.set("HEALTH_API_KEY", "EL_VALOR_REAL");
   ```
   (valor real en `~/.claude/secrets/apps.env` en la Mac)
2. ~~Instalar los 3 loaders~~ — ya hecho, ver arriba.
3. **Agregar los 3 widgets Small al home screen** (long-press → Editar → widget de Scriptable → elegir "Mes Combinado" / "Año Fuerza" / "Año Pádel · Tenis", tamaño Small).

## Pendiente — Task 16: verificación final end-to-end

Checklist completo en el plan (sección Task 16): confirmar contra el mockup aprobado, probar dark mode real del dispositivo, probar sin red (fallback a caché), sanity check contra Apple Salud para un día conocido.

## Gotchas descubiertos en esta sesión (no repetir el trabajo de encontrarlos)

- **`eval()` nunca permite top-level `await` en el string evaluado — falla en CUALQUIER motor JS, no es específico de Scriptable/JavaScriptCore** (reproducido con Node/V8 también). Los 3 widgets usan `await` fuera de cualquier función (patrón normal de un script de Scriptable), así que los 3 loaders rompían apenas Cal corrió uno de verdad en el dispositivo — primer error real detectado on-device: "Mes Combinado" tiró `SyntaxError: Unexpected identifier 'loadMonthData'. Expected ';' after variable declaration"` al abrirlo en la app. **Nada de esto lo agarró `node --check`** (que sí valida top-level await como archivo standalone, pero nunca simuló el paso por `eval()`) ni los code reviews previos — es un gap real del proceso de verificación de esta sesión, corregido recién cuando Cal mandó el screenshot del error real. Fix aplicado en los 3 `loader.js` (repo + copias desplegadas en iCloud, 2026-07-29): envolver el código descargado en una IIFE async antes de `eval`: `await eval(\`(async () => {\n${"$"}{code}\n})()\`)`. **Esto probablemente también afecta a los loaders de `tipo-de-cambio-Bolivia`** (mismo patrón exacto) si alguna vez se llegan a usar de verdad en vez de las copias directas (`Tc Referencial.js` etc.) que sí viven sin loader — no se tocó ese repo en esta sesión, queda como TODO si Cal quiere usarlos.
- **`Personal/Agents/Health/health-worker/` y `Personal/Agents/Health/` (el padre) nunca tuvieron git.** Se inicializaron ambos como repos separados (mismo patrón que Jano/Vesta: cada carpeta de proyecto top-level es su propio repo). `health-worker/` excluido del `.gitignore` del repo padre.
- **`node --check` da falsos positivos en el código de Scriptable**: top-level `await` (inválido en CommonJS) y top-level `return` en los loaders (inválido en ESM) — ninguno es un bug real, es la semántica híbrida del runtime de Scriptable. Verificación real usada: copiar a `.mjs` temporal para `await`, o diff estructural contra un loader ya funcionando en producción (`tipo-de-cambio-Bolivia`).
- **`ctx.fillEllipse(rect)` es API real de Scriptable** — confirmado contra `https://docs.scriptable.app/drawcontext/`, sin precedente previo en los scripts de Cal (que usaban `Path.addEllipse()` en su lugar). Queda pendiente de confirmación visual on-device (Task 16).
- **Ya existía un `CF_API_TOKEN` en `apps.env`** pero con nombre distinto al que busca `wrangler` (`CLOUDFLARE_API_TOKEN`) — no se pudo reusar sin saber su scope real. Se generó uno nuevo con scope "Edit Cloudflare Workers", guardado en `apps.env` como `CLOUDFLARE_API_TOKEN` (nueva variable, no se tocó la vieja).
- **Incidente de manejo del token:** el primer token generado quedó expuesto una vez en el chat por error (se pegó su valor en un mensaje de confirmación). Cal lo revocó y generó uno nuevo; el segundo se manejó correctamente (leído de una nota en iCloud, nunca mostrado en texto). Las notas temporales de iCloud usadas para pasar el token ya fueron borradas.
- Quedó un archivo `.dev.vars` con el `HEALTH_API_KEY` real en `health-worker/` (gitignoreado) para poder correr `wrangler dev` local — sigue ahí, útil para testing futuro.

## Rediseño 2026-07-29: sin título, grilla a pantalla completa

Cal pidió sacar el título del mes y que la grilla ocupe todo el widget (tras confirmar por screenshot que el rediseño anterior — grilla alineada + encabezado L M X J V S D — ya se veía bien, solo sobraba el texto). Cambios en `mes-combinado/mesCombinado.js` (commit `203c3e1`):
- Se eliminó el bloque `monthName`/`titleLabel` y su spacer.
- `setPadding(8, 8, 6, 8)` → `setPadding(6, 6, 6, 6)`.
- `COL_WIDTH` 19 → 20 (7 columnas × 20 = 140pt + 12pt de padding horizontal = 152pt, dentro de los ~155pt del widget Small).
- Encabezado: celda `Size(COL_WIDTH, 9)` → `(COL_WIDTH, 10)`, fuente `systemFont(7)` → `(8)`.
- Spacer post-encabezado: 1 → 2. Spacer entre filas: 1.5 → 2.
- Números: `boldSystemFont(12)`/`systemFont(11)` → `(13)`/`(12)`.
- Puntito "hiciste los dos": `Size(2.5, 2.5)` + `cornerRadius 1.25` → `Size(3, 3)` + `cornerRadius 1.5`.

Presupuesto vertical para el caso peor (mes de 6 filas): padding 12pt + encabezado 10pt + spacer 2pt + 6 filas (~18.5pt c/u: número bold 13 ≈15.5pt de alto + spacing 0.5 + dot 3pt) ≈ 111pt + 5 spacers entre filas × 2pt = 10pt → total ≈ 145pt, con ~10pt de margen contra el límite de ~155pt del widget Small. No se tocó `firstWeekday`/`daysInMonth` ni la lógica de datos — cambio puramente visual.

No requiere reinstalar nada: es el mismo loader ya deployado en la carpeta de Scriptable de Cal, así que la próxima vez que abra "Mes Combinado" (o Scriptable sincronice de fondo) va a bajar esta versión del código sola.

**Pendiente:** confirmación visual de Cal con un nuevo screenshot (mismo ítem de Task 16 en BACKLOG.md).

## Gotcha 2026-07-29: `addSpacer()` flexible en la raíz del `ListWidget` no centra

Al centrar horizontalmente la grilla funcionó de una (spacers flexibles dentro de un `WidgetStack` anidado, commit `b0792eb`). Pero el mismo truco puesto directo en la raíz (`widget.addSpacer()`, sin volver a envolver en un stack) para centrar verticalmente **no se expandió** — Cal mandó screenshot confirmando que seguía pegado arriba con aire de sobra abajo (commit `c8f913d`, revertido en la práctica por `484121b`).

Revisando los scripts ya probados de Cal (`Dólar Binance.js`, `Claude Max.js`, `Cumpleaños v1.js`) ninguno usa `addSpacer()` sin argumento directo sobre `widget` — siempre está anidado dentro de un `WidgetStack` explícito (`row = widget.addStack(); row.addSpacer()`). Fix aplicado: envolver TODO el contenido en un único `outerColumn = widget.addStack()` (el único hijo directo de `widget`, así hereda el alto completo) y mover los dos spacers de centrado vertical adentro de ese stack, en vez de directo en `widget`. Con eso el centrado vertical sí funcionó — pendiente de confirmación visual final igual que el resto de Task 16.

**Regla general para cualquier widget nuevo:** los spacers flexibles (`addSpacer()` sin longitud) solo son confiables dentro de un `WidgetStack` anidado — nunca puestos directo en la raíz del `ListWidget`.

## Decisiones de diseño tomadas en el camino (por si hace falta el porqué)

- El diseño pasó por varias iteraciones documentadas en el spec: heatmap anual diario→semanal (ilegible a escala Small), puntos por tipo→fondo alternado por mes (Opción B ganó sobre etiqueta lateral), 3 widgets finales (no 4 ni 2).
- Widgets trabajados directo en `main` de los 3 repos (sin worktrees/branches) — decisión explícita de Cal, dado que es workflow personal en solitario.
