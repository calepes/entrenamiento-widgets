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
- `anual-padel/` — igual, verde, mismo indicador de caché desde el arranque.

## Pendiente — Task 15 (parte manual, solo Cal puede hacerla en su iPhone)

Los 3 loaders ya están desplegados directo en la carpeta de iCloud de Scriptable (2026-07-29, actualizados de nuevo el mismo día con el fix de caché de abajo) — no hace falta crearlos a mano en la app, solo esperar a que sincronicen (o forzar sync abriendo Scriptable) y usarlos:
- `Mes Combinado.js`
- `Año Fuerza.js`
- `Año Padel.js`

1. **Guardar `HEALTH_API_KEY` en el Keychain del dispositivo** (una sola vez, script ad-hoc en Scriptable, correr y borrar):
   ```javascript
   Keychain.set("HEALTH_API_KEY", "EL_VALOR_REAL");
   ```
   (valor real en `~/.claude/secrets/apps.env` en la Mac)
2. ~~Instalar los 3 loaders~~ — ya hecho, ver arriba.
3. **Agregar los 3 widgets Small al home screen** (long-press → Editar → widget de Scriptable → elegir "Mes Combinado" / "Año Fuerza" / "Año Padel", tamaño Small).

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

## Gotcha 2026-07-29: `addSpacer()` flexible — nada confiable, ni en la raíz ni anidado (conclusión final tras 3 intentos)

Historia completa de esta cacería, porque cada paso intermedio parecía razonable y no lo era:

1. **Intento 1 (commit `c8f913d`):** `widget.addSpacer()` (flexible, sin longitud) puesto directo en la raíz del `ListWidget`, antes y después del `outerRow` (que a su vez ya centraba bien en horizontal desde `b0792eb`). Cal mandó screenshot: seguía pegado arriba, aire de sobra abajo — el spacer de raíz no se expandió.
2. **Intento 2 (commit `484121b`):** hipótesis "el spacer flexible solo funciona anidado en un `WidgetStack`, nunca directo en la raíz" (basada en que ningún script probado de Cal usa `addSpacer()` sin longitud directo sobre `widget`). Se envolvió TODO en un `outerColumn = widget.addStack()` y se anidó `outerRow` un nivel más adentro (`widget → outerColumn → outerRow`). Cal mandó screenshot: **ahora se rompió también el centrado horizontal** — quedó pegado a la izquierda. Es decir, anidar un nivel de más rompió el stretch de ancho completo que sí venía funcionando.
3. **Conclusión (commit `82a9ca3`):** la hipótesis del paso 2 era incompleta — no es que "hay que anidar", es que el comportamiento de expansión de `addSpacer()` sin longitud es ambiguo/no confiable en Scriptable apenas se agrega profundidad o se usa en el eje vertical de la raíz, y ningún script real de Cal (`Dólar Binance.js`, `Claude Max.js`) depende de esto — todos usan `setPadding()`/`addSpacer(n)` con valores numéricos fijos. Se abandonó el enfoque de spacers flexibles por completo para el centrado vertical: en su lugar, `rows` (4/5/6 filas según el mes) se calcula ANTES de construir la UI —no depende del fetch de datos— y se usa para calcular un `setPadding()` vertical simétrico contra un tamaño de canvas asumido (`ASSUMED_CANVAS = 158`, típico de iPhones modernos de 390pt de ancho; sin forma de leer el tamaño real desde Scriptable). El cálculo hace `Math.max(0, ...)` así que en el peor caso (dispositivo real más chico que el asumido) el padding cae a la base (6pt) — nunca se corta contenido, como mucho queda un poco menos centrado. El centrado horizontal SÍ sigue usando `addSpacer()` flexible, pero solo porque `outerRow` volvió a ser hijo DIRECTO de `widget` (un solo nivel, sin `outerColumn` de por medio).

**Regla general para cualquier widget nuevo:** no usar `addSpacer()` flexible (sin longitud) para centrar contenido dentro del widget completo — ni en la raíz del `ListWidget` ni anidado más de un nivel. El único uso de `addSpacer()` flexible confirmado funcionando es exactamente UN nivel de anidamiento (un `WidgetStack` que es hijo directo de `widget`), igual que `row.addSpacer()` en `Dólar Binance.js`. Para cualquier otra cosa (sobre todo centrado vertical, donde ni siquiera un nivel funcionó de forma confiable en pruebas reales), calcular el padding con matemática simple sobre el contenido conocido, como hace `mes-combinado` ahora.

## Gotcha 2026-07-29 (v4): WidgetStacks horizontales con ancho "auto" se desalinean entre sí — bug real de Scriptable

Después de fijar el canvas exacto (158×158pt, confirmado por Cal — no era el problema) y unificar el tamaño de TODAS las celdas (`CELL_SIZE`, v3), Cal seguía viendo la grilla descentrada. En vez de seguir ajustando a ciegas, se investigó con WebSearch/WebFetch (Apple HIG, docs de Scriptable, foro `talk.automators.fm`). Hallazgo clave: un hilo real (`talk.automators.fm/t/widget-stacks-not-taking-full-width/17315`) describe el mismo síntoma exacto — varios `WidgetStack` horizontales (en nuestro caso: `headerRow` + cada `rowStack`, uno por semana), cada uno con ancho "auto" (sin `.size` explícito en el propio stack, solo en sus celdas hijas), pueden terminar con un ancho computado internamente distinto entre sí aunque en teoría deberían medir lo mismo — Scriptable usa el stack más ancho como referencia y las demás filas quedan corridas/desalineadas. Workaround de la comunidad: darle a cada stack un ancho EXPLÍCITO (no depender de que el auto-cálculo dé igual para N celdas idénticas).

**Fix (commit `8a846dd`):** dos partes.
1. Se restaura `outerRow` (hijo directo de `widget`, con `addSpacer()` flexible a los lados) para el centrado horizontal — el mismo mecanismo que ya había funcionado bien en `b0792eb`, pero que se había sacado en `f36e3a1` al asumir (mal) que el padding calculado por sí solo alcanzaba una vez confirmado el canvas exacto.
2. Se le da a `headerRow` y a cada `rowStack` un `.size = new Size(gridWidth, CELL_HEIGHT)` explícito — antes ninguno de los dos tenía `.size` seteado en sí mismo (solo sus celdas hijas lo tenían), así que cada fila quedaba en modo "auto", exactamente el patrón que dispara el bug del foro.

**Regla general, sumada a la de arriba:** en cualquier layout con múltiples `WidgetStack` horizontales "hermanos" que deberían medir lo mismo (filas de una grilla, columnas de una tabla), no confiar en que el ancho "auto" calculado a partir de celdas hijas idénticas dé el mismo resultado en todas — setear `.size` explícito en el STACK CONTENEDOR de cada fila, no solo en sus celdas.

## RESUELTO 2026-07-29: `centerAlignContent()` no centra en horizontal — causa raíz de todo el descuadre

**Este era el bug de fondo.** Después de todo lo anterior, Cal seguía viendo la grilla corrida a la izquierda. El dato que lo destapó: describió que los números de UN dígito y las letras del encabezado se veían corridos, mientras que los de dos dígitos ocupaban bien su celda. Si `centerAlignContent()` estuviera centrando en horizontal, eso no podría pasar — todas las celdas tienen el mismo ancho fijo y todas llamaban a esa función.

**Conclusión:** en un `WidgetStack` con `layoutVertically()`, `centerAlignContent()` NO centra el eje horizontal (aparentemente centra el principal, o sea el vertical). El comentario que había en el código diciendo lo contrario ("centra el eje transversal") era una suposición equivocada arrastrada desde la primera versión, y explica por qué ningún ajuste de padding/spacers lo arreglaba: el contenido nunca estuvo centrado dentro de su celda.

**Fix (commits `fbcf8d3` … final):** dejar de depender de la alineación. Ahora TODAS las celdas renderizan un texto de exactamente 2 caracteres — los días 1-9 y las letras del encabezado llevan adelante un **FIGURE SPACE (U+2007)**, que en fuente monoespaciada mide exactamente lo mismo que un dígito y no se colapsa como el espacio normal:

```javascript
const FIGURE_SPACE = " ";
const pad2 = (s) => (String(s).length >= 2 ? String(s) : FIGURE_SPACE + s);
```

Si todos los textos miden lo mismo, da igual cómo los alinee Scriptable: las columnas coinciden. Confirmado por Cal en pantalla real ("¡Por fin!").

**Condición que acompaña:** un solo tamaño de fuente (`NUM_SIZE`) para marcados y no marcados — en monoespaciada el ancho de avance depende del tamaño, no del peso, así que bold y regular al mismo tamaño ocupan igual, pero 14 vs 13 no.

## Gotcha 2026-07-29: caché de `raw.githubusercontent.com` — el dispositivo, no el CDN

Cal reportó "aun lo veo viejo" después de varios pushes seguidos con cambios visuales. `curl -I` a la URL raw mostró `cache-control: max-age=300` y `source-age: 0` (el CDN de GitHub ya servía la versión más nueva en el momento de probar) — la causa no era el CDN, era que el propio dispositivo (URLSession de iOS, usado por `Request` de Scriptable) puede reusar una respuesta guardada localmente hasta 5 minutos sin volver a pedirle nada al servidor, porque los 3 loaders pedían siempre la MISMA URL exacta.

**Fix (commit `6af1f22`, repo + las 3 copias en iCloud):** agregar un query param que cambia en cada corrida a la URL que arma cada loader — `RAW_URL = ...?_=${Date.now()}` — así el request nunca matchea una entrada de caché anterior, sin importar los headers `Cache-Control` que mande GitHub.

**Importante — a diferencia de los cambios al CÓDIGO del widget (`mesCombinado.js`, `anualFuerza.js`, etc.), que solo necesitan push a GitHub porque el loader los baja solo:** un cambio al LOADER en sí (`loader.js`) SÍ hay que copiarlo a mano a la carpeta de iCloud además de pushear el repo — el loader es lo que se ejecuta directo en el dispositivo, nada lo actualiza automáticamente.

## Decisiones de diseño tomadas en el camino (por si hace falta el porqué)

- El diseño pasó por varias iteraciones documentadas en el spec: heatmap anual diario→semanal (ilegible a escala Small), puntos por tipo→fondo alternado por mes (Opción B ganó sobre etiqueta lateral), 3 widgets finales (no 4 ni 2).
- Widgets trabajados directo en `main` de los 3 repos (sin worktrees/branches) — decisión explícita de Cal, dado que es workflow personal en solitario.
