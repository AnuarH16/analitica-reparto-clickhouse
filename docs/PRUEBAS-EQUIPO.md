# Team installation tests

Log of Delivery Atlas installations on computers other than the development one, as requested in [PLAN-EQUIPO.md](PLAN-EQUIPO.md). Each test records system, versions, commands and results. Anyone who repeats the test on another computer can add it at the end using the same format.

The path tested is Atlas without the large datasets: [INFRAESTRUCTURA-ATLAS.md](INFRAESTRUCTURA-ATLAS.md), section 2.

## Anuar: Windows 11, 19 October 2026

| Item | Version |
|---|---|
| System | Windows 11 Home 10.0.26300 |
| Docker | Docker Desktop with Engine 29.8.1 and Compose v5.5.1 |
| Python | 3.12.3 |
| Git | 2.42.0.windows.2 |
| Code | Commit `657c044` of the team branch |

Clean start, with new empty volumes. The base images were already downloaded from an earlier test. To avoid touching another Atlas installation on the same computer, the test used a separate Compose project (`-p atlas-prueba`) with a different container name; the commands are the same.

| Step | Command | Result |
|---|---|---|
| Start | `docker compose -f compose.yaml --profile atlas up -d --build --wait` | ClickHouse and the API `healthy` in 15 s |
| Tests | `python -m unittest discover -s tests -v` | 20 tests OK in 1.4 s |
| Integration | `python scripts/check_atlas.py` | 409 when reusing an ID with different content and 400 for an invalid action. The lost and resent response leaves 3 physical rows and 2 logical events. Detail and aggregate match |
| Generator | `python scripts/atlas.py generate --events 10000 --batch 1000 --seed 42` | 10000 events accepted in 1 s |
| Status | `python scripts/atlas.py status` and `GET /api/status` | 10002 events accepted and published (10000 from the generator and 2 from the integration check), 0 pending and 0 publishing errors |
| Operations | `python scripts/check_operations.py` | An old position does not replace the latest one and invalid coordinates return 400. After a failure injected between INSERTs: 4 physical rows, 2 logical positions and 2 logical orders |
| CRUD | `python scripts/crud_demo.py` | INSERT, SELECT, UPDATE and DELETE on `delivery.demo_events` |
| Web interfaces | http://127.0.0.1:8124/play and http://127.0.0.1:8124/dashboard | Both return 200 |

**Earlier test, 14 October 2026,** on the mini-app branch (`codex/atlas-miniapp`, commit `706ca29`): clean start, `/health` OK, dashboard and mini-app returning 200, `customer_orders.source_kind` accepts `demo_live`, checkout without a simulation returns 409, and all 28 tests pass, including the 8 mini-app tests.

## Windows problems and how to solve them

| Problem | Solution |
|---|---|
| `python3` does not exist | Use `python` (or `py`) in every command of the documentation |
| Accented characters look wrong in the console | Before running the scripts: `$env:PYTHONUTF8=1` in PowerShell or `export PYTHONUTF8=1` in Git Bash |
| `docker compose` fails with `dockerDesktopLinuxEngine` | Open Docker Desktop and wait until the engine is running |
| A `.sh` script fails inside a container with `/bin/bash^M: bad interpreter` | Git for Windows with `core.autocrlf=true` converts line endings to CRLF. `.gitattributes` forces LF for `.sh` files. In a clone made before that change, with no pending local changes: `git rm -r --cached . -q` and then `git reset --hard` |
| An earlier stack from the repository is running (`docker-compose.yml`, with Flask and Grafana) | It shares the Compose project name with Atlas. Stop it first with `docker compose -f docker-compose.yml down`, which keeps its volumes |

**Watch out:** `scripts/check_operations.py` overwrites `docs/evidencia-tracking.json` with the result of each run. If you do not want to commit that new evidence, restore it with `git checkout -- docs/evidencia-tracking.json`.

## Pending

- Echenique's test on his computer.
- A test on a computer without the images downloaded, to measure the full first start.
