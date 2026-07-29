// Scriptable Loader — Año Fuerza (Entrenamiento)
// Copia este código en Scriptable. Descarga y ejecuta
// siempre la última versión del widget desde GitHub.

const REPO = "calepes/entrenamiento-widgets";
const BRANCH = "main";
const FILE = "anual-fuerza/anualFuerza.js";
// cache-busting: raw.githubusercontent.com manda cache-control: max-age=300,
// y sin esto el propio dispositivo (no el CDN de GitHub) puede reusar una
// respuesta vieja hasta 5 min sin volver a pedirle nada al servidor
const RAW_URL = `https://raw.githubusercontent.com/${REPO}/${BRANCH}/${FILE}?_=${Date.now()}`;

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

// code puede tener `await` a nivel top-level (patrón usado en los 3 widgets).
// eval() nunca permite top-level await en el string evaluado (falla en
// cualquier motor JS, no es específico de Scriptable) — se envuelve en una
// IIFE async para que el await ya no sea "top-level" para el parser.
await eval(`(async () => {\n${code}\n})()`);
