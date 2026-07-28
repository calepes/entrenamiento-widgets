# Widgets de entrenamiento (Fuerza / Pádel·Tenis) — Design Spec

**Fecha:** 2026-07-28
**Repo:** `Personal/Apps/entrenamiento-widgets/` (nuevo, mismo patrón que `tipo-de-cambio-Bolivia`)
**Mockup visual aprobado:** ver artifact "Fuerza & Pádel·Tenis — Widget Mockup" (sesión 2026-07-28)

## 1. Objetivo

Tres widgets de Scriptable (iOS home screen) para monitorear entrenamientos de fuerza y pádel/tenis, con datos de Apple Health vía el Health Worker existente de Cal (`health.carlos-cb4.workers.dev`).

## 2. Widgets finales (los 3, todos tamaño Small ~155×155pt)

### 2.1 Mes — combinado
- Calendario del mes actual: número de cada día + una fila de puntos a la derecha (naranja = fuerza ese día, verde = pádel/tenis ese día, ambos si aplica).
- Sin fondo de celda (sin grilla visual) — solo número + puntos, para que se vea limpio.
- Sin contador grande de sesiones (se sacó durante el diseño — la grilla en sí ya comunica la actividad del mes).

### 2.2 Año — Fuerza
- Heatmap semanal: 52 semanas en grid 8 columnas × 7 filas (+4 celdas vacías al final para completar el rectángulo).
- Intensidad de color = actividad de esa semana (4 niveles, mismo sistema `color-mix` que el resto).
- Acento propio: `#F97316` (light) / `#FB8A3C` (dark).
- **Identificación de mes:** el fondo de las celdas alterna sutilmente cada bloque de ~4-5 semanas (aproximación de mes calendario, patrón `[4,4,5]` repetido ×4 = 52), y la primera semana de cada bloque lleva la inicial del mes (E, F, M, A...) superpuesta en una esquina, muy sutil (opacidad ~0.6, 4.5px).

### 2.3 Año — Pádel · Tenis
- Idéntico a 2.2 pero acento `#22C55E` (light) / `#34D399` (dark), y el `type` filtrado por raqueta en vez de fuerza.

## 3. Descartado durante el proceso (para que quede registrado el porqué)

- **Widgets por tipo con heatmap+contador combinados** (versión inicial "Fuerza"/"Pádel·Tenis" Medium): reemplazados por el esquema final de 3 widgets (mensual combinado + anual por tipo).
- **Heatmap anual diario estilo GitHub puro (371 celdas, 53×7):** probado, descartado — a tamaño Small las celdas son ilegibles (~1.8px de ancho). Se optó por agregar por semana (52 celdas) en su lugar.
- **Distinción de tipo en el heatmap anual vía puntos por celda:** probado (dos variantes: split diagonal, puntos en esquina), descartado al pasar a heatmap semanal por tipo — cada widget anual es de un solo tipo, no hace falta codificar tipo dentro de la celda.
- **Etiqueta de mes al costado de cada fila (Opción A):** probada en paralelo a la opción de fondo alternado, descartada — Cal prefirió la Opción B (fondo alternado + inicial).
- **Widget "Año — combinado" (ambos tipos en un heatmap Large):** reemplazado por dos widgets Small separados por tipo.

## 4. Arquitectura de datos

### 4.1 Cambios en `Agents/Health/health-worker/src/index.ts`

- **Bucket `racquet` en `workoutCategory()`** (línea ~7-26 actual): sacar tenis/pádel/squash del regex de `cardio`, bucket propio `racquet`.
- **Nuevo endpoint `GET /workouts/heatmap?category=strength|racquet&days=365`**: `GROUP BY date(start)` en SQL, devuelve solo los días/semanas con actividad (payload liviano): `{category, days, data:[{date, count, duration_min}, ...]}`.
- Auth igual al resto de endpoints (`?key=` o header `X-Health-Key`).

### 4.2 Cambio en `Personal/MCP Servers/mcp-servers/servers/health/src/index.ts`

- Agregar `"racquet"` al enum de `category` en el `inputSchema` de `getWorkouts` (línea ~81) y a la descripción (línea ~74), para que Jano también pueda filtrar por el bucket nuevo.
- **Auditoría ya hecha (2026-07-28):** no hay ninguna lógica en Jano que asuma que tenis/pádel viven dentro de `cardio` — cambio de bajo riesgo. Único ajuste necesario es este enum.

### 4.3 Doc a actualizar
- `Agents/Health/health-worker/README.md:65` y `CLAUDE.md:37-43` mencionan "cardio: Running, Cycling, Swimming, Tennis, Padel" — actualizar tras el cambio de categoría.

## 5. Widgets (Scriptable) — estructura y data flow

Mismo patrón que `tipo-de-cambio-Bolivia`: cada widget en su carpeta con `<nombre>.js` (código real, versionado) + `loader.js` (lo que corre en el dispositivo, hace fetch al raw de GitHub y `eval()`).

```
entrenamiento-widgets/
├── mes-combinado/
│   ├── mesCombinado.js
│   └── loader.js
├── anual-fuerza/
│   ├── anualFuerza.js
│   └── loader.js
└── anual-padel-tenis/
    ├── anualPadelTenis.js
    └── loader.js
```

- **Mes combinado:** pega a `/workouts/heatmap?category=strength&days=31` Y `category=racquet&days=31` (dos requests, mes actual), cruza por fecha para saber qué días tuvieron cada tipo.
- **Anual por tipo:** un solo request `/workouts/heatmap?category=<tipo>&days=365`, agrega client-side por semana (sumar counts dentro de cada semana ISO), dibuja el grid 8×7 con el patrón de bloques de mes hardcodeado (`[4,4,5]` ×4).

## 6. Caché y manejo de errores

- Los 3 widgets cachean el último heatmap recibido en `FileManager.local()` (un JSON por widget), mismo patrón que `Gráfica TC.js`: si el fetch falla, usan la última copia guardada y la marcan `(cache)` en el footer.
- Sin caché útil disponible → mensaje de error legible en el widget (nunca en blanco).
- Timeout de request: 10s (consistente con el resto de los widgets Scriptable de Cal).
- Mes/año sin actividad → heatmap se renderiza igual, todo en el color "vacío" (no es error).

## 7. Tipografía y tokens visuales

100% fuentes de sistema (Scriptable no soporta fuentes custom):
- Título: `Font.boldSystemFont(15)`
- Subtítulo / footer: `Font.systemFont(11)`, gris (`Color.dynamic`)
- Números de día del calendario: `Font.systemFont(7)` aprox (escala del widget real)
- Colores vía `Color.dynamic(lightHex, darkHex)` para cada acento — nunca hardcodear sin variante dark.

## 8. Testing / verificación

Sin test runner (es código Scriptable) — verificación manual:

1. `curl` directo a `/workouts/heatmap?category=strength&days=365` y `category=racquet&days=365` con la API key — verificar shape de respuesta y agregación correcta.
2. Confirmar en D1 que un workout "Tennis"/"Padel" cae en `racquet`, no en `cardio`, tras el cambio.
3. Verificar que `getWorkouts` del MCP `health` acepta `category: "racquet"` sin error de enum, y que Jano sigue funcionando igual (sin dependencia rota).
4. Correr los 3 widgets en el iPhone real (no solo el mockup HTML) — Small real, light y dark del dispositivo, y confirmar que el `loader.js` trae el código correcto desde GitHub raw.
5. Forzar mes/año sin actividad — heatmap vacío no rompe.
6. Cortar wifi — confirmar fallback a `(cache)`.
7. (Opcional) comparar el conteo de un mes conocido contra lo que ya muestra Apple Salud, como sanity check.
