# Backlog — Widgets de entrenamiento

> Ver `HANDOFF.md` para contexto de la sesión que armó esto (2026-07-28) y `docs/superpowers/plans/2026-07-28-entrenamiento-widgets.md` para el detalle task-por-task.

## Completado (2026-07-28)

### Backend
- [x] Bucket `racquet` separado de `cardio` en `health-worker` (tenis/pádel/squash)
- [x] Endpoint `GET /workouts/heatmap?category=X&days=N` — deployado a producción, verificado
- [x] MCP server `mcp-health` — enum `getWorkouts` actualizado con `racquet`, buildeado
- [x] Docs de `health-worker` (README.md, CLAUDE.md) actualizadas
- [x] `health-worker/` y `Health/` versionados en git por primera vez

### Widgets
- [x] `mes-combinado/` — calendario del mes, punto naranja/verde por tipo (v1)
- [x] `mes-combinado/` rediseñado (2026-07-29) — grilla realmente alineada (columnas con ancho fijo), encabezado L M X J V S D, números grandes coloreados directo por tipo, puntito chico solo para "hiciste los dos"
- [x] `mes-combinado/` sin título (2026-07-29) — se sacó el texto del mes, padding más chico y la grilla (encabezado, números, filas) creció para ocupar todo el widget
- [x] `mes-combinado/` **diseño APROBADO por Cal (2026-07-29)** — causa raíz del descuadre encontrada: `centerAlignContent()` no centra en horizontal en un stack vertical. Fix: todas las celdas renderizan texto del mismo ancho (FIGURE SPACE U+2007 + monoespaciada + un solo tamaño de fuente). Ver HANDOFF.md.
- [x] `mes-combinado/` centrado real confirmado en pantalla (2026-07-29) — canvas del widget Small confirmado por Cal (iPhone 15/16 no-Pro, 158×158pt), padding horizontal Y vertical calculados con esa medida exacta en vez de spacers flexibles (que resultaron no confiables en Scriptable, ver HANDOFF.md). Encabezado L M X J V S D al mismo tamaño que los números. Captura final: centrado parejo en los cuatro lados.
- [x] `anual-fuerza/` — heatmap semanal (52 semanas, 8×7), naranja, indicador de caché
- [x] `anual-padel-tenis/` — igual, verde
- [x] Repo `entrenamiento-widgets` creado, pusheado a GitHub (público)
- [x] Los 3 loaders deployados directo en la carpeta iCloud de Scriptable (2026-07-29) — `Mes Combinado.js`, `Año Fuerza.js`, `Año Pádel · Tenis.js`
- [x] Fix del bug real detectado on-device: `eval()` no soporta top-level `await` en ningún motor JS — los 3 loaders (repo + iCloud) envuelven ahora el código en una IIFE async antes de `eval`

## Pendiente

### Setup manual (solo Cal, en el iPhone)
- [ ] Guardar `HEALTH_API_KEY` en Keychain del dispositivo (ver HANDOFF.md)
- [ ] Agregar los 3 widgets Small al home screen (ya no hace falta instalarlos a mano, ver arriba)
- [ ] **`Mes Combinado.js` en iCloud está corriendo como copia directa, no como loader** (cambio temporal 2026-07-29 para iterar el diseño más rápido, sin depender de la caché de `raw.githubusercontent.com`). Ahora que el centrado quedó confirmado, falta volver a poner el loader ahí (mismo patrón que `Año Fuerza.js`/`Año Pádel · Tenis.js`, que nunca se tocaron) para que vuelva a auto-actualizarse desde GitHub.

### Verificación (Task 16 del plan)
- [ ] Confirmar los 3 widgets contra el mockup aprobado (números/puntos no se salen, heatmap legible) — `mes-combinado` ya confirmado (ver arriba), faltan `anual-fuerza` y `anual-padel-tenis`
- [x] Confirmar el rediseño de `mes-combinado` en pantalla real — centrado horizontal y vertical confirmado por Cal (2026-07-29). Falta confirmar específicamente un mes de 6 filas (julio 2026, usado para todas las pruebas, tiene 5) — presupuesto: `vPad = max(6, (158 - gridHeight)/2)` nunca corta contenido gracias al `Math.max`, pero vale la pena mirar cómo se ve un mes de 6 filas cuando llegue uno.
- [ ] Probar dark mode real del dispositivo (ojo: `DrawContext` con `Color.dynamic` queda "horneado" al modo del momento de ejecución — limitación conocida, no bug)
- [ ] Probar sin red (modo avión) — confirmar fallback a caché, nunca en blanco
- [ ] Sanity check: comparar un día conocido contra lo que muestra Apple Salud directamente
- [ ] Confirmar visualmente que `ctx.fillEllipse` (indicador de caché) se ve bien — API confirmada por docs oficiales pero sin precedente previo en los scripts de Cal

### Ideas para más adelante (no comprometidas)
- [ ] **Tool `getWorkoutHeatmap` en el MCP de Jano** — hoy Jano solo puede consultar `/workouts/summary` conversacionalmente, no `/workouts/heatmap`. Si en algún momento Cal quiere preguntarle a Jano "cómo viene mi heatmap de fuerza este año", hace falta agregar esa tool (mismo patrón `fetchHealth` + `READ_ONLY` ya establecido en `mcp-servers/servers/health/src/index.ts`).
- [ ] **Endurecer el caché de `mes-combinado` contra cruce de mes** — si el fetch falla justo en el cambio de mes, la caché vieja (mes anterior) se filtra a "sin actividad este mes" en vez de mostrar error/aviso de caché — edge case angosto, detectado en code review, no arreglado (aceptado para v1).
- [ ] Evaluar si vale la pena agregar un indicador "(cache)" también a `mes-combinado` (hoy solo lo tienen los 2 widgets anuales — el mensual no tiene espacio en el layout aprobado).
- [ ] **Aplicar el mismo fix de `eval()`/top-level-await a los loaders de `tipo-de-cambio-Bolivia`** — mismo patrón exacto (`eval(code)` sin envolver), probablemente roto de la misma forma si alguna vez se usan en vez de las copias directas (`Tc Referencial.js`, `Dólar Binance.js`) que hoy viven sin loader en la carpeta de Scriptable.
