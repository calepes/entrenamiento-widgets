#!/usr/bin/env python3
"""
Deploy de los widgets a la carpeta de Scriptable en iCloud.

Flujo elegido por Cal (2026-07-29): en vez del patrón loader+eval (un script
chico en el dispositivo que baja el código real de GitHub en cada corrida),
los scripts se escriben DIRECTO en iCloud desde Claude Code. El repo sigue
siendo la fuente de verdad; este script sincroniza.

Por qué se abandonó el loader:
  - la caché de raw.githubusercontent.com (max-age=300) hacía que el
    dispositivo siguiera corriendo código viejo hasta 5 min después de un
    push, sin forma cómoda de forzar refresh;
  - `eval()` no permite top-level `await` en NINGÚN motor JS, así que el
    loader necesitaba envolver el código en una IIFE async — una capa más
    donde romperse, y que ya rompió una vez en producción;
  - los widgets funcionan sin red gracias a su caché local, así que no se
    gana nada real con bajarlos por HTTP en cada corrida.

Uso:  python3 scripts/deploy-icloud.py [--check]
      --check  no escribe nada; solo informa si iCloud está al día
"""

import sys
import pathlib

REPO = pathlib.Path(__file__).resolve().parent.parent
ICLOUD = pathlib.Path.home() / "Library/Mobile Documents/iCloud~dk~simonbs~Scriptable/Documents"

# widget del repo  ->  (nombre en Scriptable, header de ícono de Scriptable)
# el header de 3 líneas lo maneja Scriptable: si el archivo destino ya existe
# se conserva el suyo (Cal puede haber cambiado color/glifo desde la app)
WIDGETS = {
    "mes-combinado/mesCombinado.js": (
        "Mes Combinado.js",
        "// icon-color: purple; icon-glyph: magic;",
    ),
    "anual-fuerza/anualFuerza.js": (
        "Año Fuerza.js",
        "// icon-color: deep-purple; icon-glyph: magic;",
    ),
    "anual-padel/anualPadel.js": (
        "Año Padel.js",
        "// icon-color: green; icon-glyph: magic;",
    ),
}

SCRIPTABLE_HEADER = "// Variables used by Scriptable.\n// These must be at the very top of the file. Do not edit."


def build(src_path: pathlib.Path, dst_path: pathlib.Path, default_icon: str) -> str:
    """Arma el contenido final: header de Scriptable + cuerpo del widget."""
    src_lines = src_path.read_text().split("\n")

    # el cuerpo del repo ya trae su propio header de 3 líneas: se descarta
    # para no duplicarlo (las 2 de "Variables used by Scriptable" + el ícono)
    body = "\n".join(src_lines[3:]).lstrip("\n")

    # conservar el ícono que ya tenga el archivo en iCloud, si existe
    icon = default_icon
    if dst_path.exists():
        for line in dst_path.read_text().split("\n")[:5]:
            if line.startswith("// icon-color:"):
                icon = line
                break

    return f"{SCRIPTABLE_HEADER}\n{icon}\n\n{body}"


def main() -> int:
    check_only = "--check" in sys.argv

    if not ICLOUD.is_dir():
        print(f"ERROR: no existe la carpeta de Scriptable en iCloud:\n  {ICLOUD}")
        return 1

    stale = []
    for rel, (dst_name, default_icon) in WIDGETS.items():
        src = REPO / rel
        dst = ICLOUD / dst_name
        if not src.exists():
            print(f"ERROR: falta {rel} en el repo")
            return 1

        content = build(src, dst, default_icon)
        current = dst.read_text() if dst.exists() else None

        if current == content:
            print(f"  = {dst_name} (sin cambios)")
            continue

        stale.append(dst_name)
        if check_only:
            print(f"  ! {dst_name} DESACTUALIZADO")
        else:
            dst.write_text(content)
            print(f"  → {dst_name} actualizado")

    if check_only and stale:
        print(f"\n{len(stale)} script(s) desactualizados. Correr sin --check para sincronizar.")
        return 1

    print("\niCloud al día." if not stale else "\nListo.")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
