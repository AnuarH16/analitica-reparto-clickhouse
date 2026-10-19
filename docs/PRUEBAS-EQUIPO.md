# Pruebas de instalación del equipo

Registro de instalaciones de Delivery Atlas en ordenadores distintos al de desarrollo, como pide [PLAN-EQUIPO.md](PLAN-EQUIPO.md). Cada prueba indica sistema, versiones, comandos y resultados. Quien repita la prueba en otro ordenador puede añadirla al final con el mismo formato.

La ruta probada es la de Atlas sin datasets grandes: [INFRAESTRUCTURA-ATLAS.md](INFRAESTRUCTURA-ATLAS.md), apartado 2.

## Anuar: Windows 11, 19/10/2026

| Elemento | Versión |
|---|---|
| Sistema | Windows 11 Home 10.0.26300 |
| Docker | Docker Desktop con Engine 29.8.1 y Compose v5.5.1 |
| Python | 3.12.3 |
| Git | 2.42.0.windows.2 |
| Código | Commit `657c044` de la rama del equipo |

Arranque desde cero, con volúmenes nuevos y vacíos. Las imágenes base ya estaban descargadas de una prueba anterior. Para no tocar otra instalación de Atlas del mismo ordenador, la prueba usó un proyecto de Compose aparte (`-p atlas-prueba`) con otro nombre de contenedor; los comandos son los mismos.

| Paso | Orden | Resultado |
|---|---|---|
| Arranque | `docker compose -f compose.yaml --profile atlas up -d --build --wait` | ClickHouse y la API, `healthy` en 15 s |
| Tests | `python -m unittest discover -s tests -v` | 20 tests OK en 1,4 s |
| Integración | `python scripts/check_atlas.py` | 409 al reutilizar un ID con otro contenido y 400 con una acción no válida. La respuesta perdida y reenviada deja 3 filas físicas y 2 eventos lógicos. El detalle y el agregado coinciden |
| Generador | `python scripts/atlas.py generate --events 10000 --batch 1000 --seed 42` | 10000 eventos aceptados en 1 s |
| Estado | `python scripts/atlas.py status` y `GET /api/status` | 10002 eventos aceptados y publicados (los 10000 del generador y 2 de la integración), 0 pendientes y 0 errores de publicación |
| Operaciones | `python scripts/check_operations.py` | Una posición antigua no sustituye a la última y unas coordenadas no válidas dan 400. Tras un fallo inyectado entre INSERT: 4 filas físicas, 2 posiciones lógicas y 2 pedidos lógicos |
| CRUD | `python scripts/crud_demo.py` | INSERT, SELECT, UPDATE y DELETE sobre `delivery.demo_events` |
| Interfaces web | http://127.0.0.1:8124/play y http://127.0.0.1:8124/dashboard | Responden 200 |

**Prueba anterior, 14/10/2026,** en la rama de la miniapp (`codex/atlas-miniapp`, commit `706ca29`): arranque desde cero, `/health` correcto, panel y miniapp respondiendo 200, el `source_kind` de `customer_orders` admite `demo_live`, el checkout sin simulación responde 409 y pasan los 28 tests, incluidos los 8 de la miniapp.

## Problemas en Windows y cómo resolverlos

| Problema | Solución |
|---|---|
| `python3` no existe | Usar `python` (o `py`) en todos los comandos de la documentación |
| Los acentos salen mal en la consola | Antes de los scripts: `$env:PYTHONUTF8=1` en PowerShell o `export PYTHONUTF8=1` en Git Bash |
| `docker compose` falla con `dockerDesktopLinuxEngine` | Abrir Docker Desktop y esperar a que el motor esté en marcha |
| Un script `.sh` falla dentro de un contenedor con `/bin/bash^M: bad interpreter` | Git para Windows con `core.autocrlf=true` convierte los saltos de línea a CRLF. `.gitattributes` fuerza LF en los `.sh`. En un clon anterior a ese cambio, sin cambios locales pendientes: `git rm -r --cached . -q` y después `git reset --hard` |
| Ya hay un stack anterior del repositorio (`docker-compose.yml`, con Flask y Grafana) | Comparte nombre de proyecto con Atlas. Pararlo antes con `docker compose -f docker-compose.yml down`, que conserva sus volúmenes |

**Ojo:** `scripts/check_operations.py` sobrescribe `docs/evidencia-tracking.json` con el resultado de cada ejecución. Si no se quiere subir esa evidencia nueva, restaurarla con `git checkout -- docs/evidencia-tracking.json`.

## Pendiente

- Prueba de Echenique en su ordenador.
- Prueba en un ordenador sin las imágenes descargadas, para medir el primer arranque completo.
