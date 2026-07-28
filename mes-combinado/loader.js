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
