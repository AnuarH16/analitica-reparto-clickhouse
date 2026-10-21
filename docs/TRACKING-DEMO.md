# Tracking demo: main path

The implementation is being continued by Rayo with Jere. It does not require downloading public historical data on a teammate's computer.

## Prepare

```bash
docker compose -f compose.yaml --profile atlas up -d --build --wait
python3 -m unittest discover -s tests -v
python3 scripts/check_operations.py
```

Open http://127.0.0.1:8001/. Check that both services are healthy and that the dashboard shows no errors. On a new computer the public Glovo catalog may be empty; there will be twelve demo restaurants and thirty-six demo products. The massive history can be shown from Jere's computer and the saved reports.

## Classroom walkthrough

1. **Explain the label:** Madrid and a fictional fleet. GPS and statuses are new events from the simulator, not a service connected to Uber Eats.
2. **Start with 12 couriers.** Select one in the list. Show the order ID, latitude/longitude and event time; wait for them to change on a refresh.
3. **Query SQL** with `sql/atlas_tracking_consultas.sql`. Show `courier_positions` and `courier_latest_mv`: one keeps the history, the other computes the latest state.
4. **Show a status change.** Created, preparing, picked_up, en_route, delivered or cancelled. The cycles are staggered; there will be orders in different phases. Do not promise a specific status at an exact clock time.
5. **Record a manual search.** Click the button and switch "Source" to "Manual actions". 202 confirms the queue; the count appears after publishing and querying. The browsing aggregate refreshes every ten seconds.
6. **Stop.** The points stay visible and age. The history is not deleted. Starting again creates another run and another fleet.
7. **Show integrity.** Read `docs/evidencia-tracking.json`: retry recognized; old data does not replace newer data; a failure between INSERTs is recovered. The test is a check that was carried out, not something failing right now.
8. **Reflection:** look at data age and the queue. Querying more often does not remove a publishing delay. There is no transaction across tables and no replica of the node.

## SQL operations required by the brief

The `python3 scripts/crud_demo.py` script already demonstrates insert, query, update and delete on `delivery.demo_events`. Coordinate running it with the generation, and explain why an Atlas history is not modified: its incremental aggregates do not automatically recompute deletions. For a calm demo, stop the simulation before the CRUD and resume it afterwards.

## Load and evidence

- One million browsing events from the first generator: `docs/ATLAS-RESULTS.md`.
- 100000 synthetic historical positions and 5965 statuses, verified: `docs/evidencia-carga-gps.json`.
- Nine unit tests and an HTTP/SQL telemetry test. The HTTP test uses its own run; it does not change the run the dashboard shows.
- The configured pace is two seconds, subject to the cost of receiving/publishing. The dashboard shows data age and errors; data can fall behind under load. No SLA has been set.

## If something fails

- API does not respond: `docker compose -f compose.yaml --profile atlas ps`, then `docker compose -f compose.yaml --profile atlas logs --tail 40 atlas`.
- Queue grows: read `/api/status`, including `publisher_phase`, `publisher_phase_seconds`, `last_batch` and `last_publish_seconds`. Distinguish queue reading, INSERT and queue confirmation.
- Simulation stopped by an error: the message is shown on the dashboard. Fix it before starting another run; do not hide the error or wipe it with `down -v`.
- Catalog not loaded: the fleet works with its fictional catalog. Do not claim that Glovo was loaded.
- Restarting the API keeps the queue and the last run, but generation is not reactivated automatically.

The service queue uses a persistent SQLite connection protected by a lock between threads, keeps `synchronous=FULL` and limits the cache to 32 MiB. This avoids opening/closing the log on every tick and keeps the transactions. Writes are not shared between several APIs. See the explanation of [WAL and checkpoints](https://sqlite.org/wal.html).
