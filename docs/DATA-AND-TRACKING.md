# Delivery Atlas: kept data and live tracking

Update: 7 October 2026. Jere's decision: continue the implementation with Rayo; split the work when the teammates join. First demo: **Madrid, simulated couriers and positions every two seconds**, confirmed by Jere.

## 1. What we are building now

A dashboard that combines browsing, simulated orders, courier positions, queue metrics and an inventory of sources. Movements appear after being published to ClickHouse. Positions invented only in the browser are not animated.

The plane is a local projection of latitude/longitude in the Madrid area, without a street map. The blue line represents positions received for that order; it does not compute an optimal route or check that streets are passable. Coordinates, speed and GPS accuracy are synthetic. The API and the dashboard query every two seconds, **but that frequency is not a guarantee of a two-second delay**.

## 2. Inventory: what to keep and why

The tables and columns of the running instance were inspected, not just the proposal files. [auditoria-esquemas.json](auditoria-esquemas.json) records the inventory before this extension. No sources were deleted.

| Source / table | Rows observed before extending | Fields we keep | Appropriate use |
|---|---:|---|---|
| OTTO `otto_archive` | 216,716,096 | session_id, article_id, event_time, event_type, event_position | Real e-commerce browsing and benchmarks |
| REES46 `rees46_events` | 411,709,736 | date, action, product_id, category, brand, price, user_id, user_session | Historical analysis of views/carts/purchases |
| Ele.me `eleme_samples` | 2,170,299 | source_id/file/row, clicked, user/shop/item, city/district/category, hour and meal_period, raw_features | Recommendation samples, not complete sessions |
| Glovo `glovo_products` | 2,887,444 | source_row, country/city, store_name, product_name, collection_section, description and original fields | Catalog; Spain has 415,137 products in our load |
| TRD / Meituan `orders` | 1,068,495 | order_id, user_id, restaurant_id, area_id, price_band, ordered_at, period and date | Historical orders; price_band is not an exact amount |
| TRD `clicks` / `click_summary` | 4,021,488 / 517,353 | date, order, position, restaurant_id; derived counts | Recorded sequence of restaurants, not a GPS time per click |
| TRD `restaurants` / `foods` | 29,072 / 179,778 | ID, category, area/score; product price/category | Dimensions of the same dataset, not Spanish businesses |
| TRD `order_items` | 3,445,180 | date, order_id, food_id | Order detail from the same origin |
| `otto_replay` | 1,200,000 | original event + ingested_at | Historical replay; not new users |
| `otto_scale_benchmark` | 1,083,580,480 | scenario and derived OTTO fields | Stress test, no new observations |
| Atlas `app_events` | 1,000,003 physical rows in the inventory | full v1 contract, ID, session, both times, action, city and provenance | Our manual/synthetic browsing; separate by origin |

The small test, staging and aggregate tables are kept too. A row of an aggregate does not represent an event. The physical inventory figures may change during merges; the logical tests use `FINAL` or unique IDs.

The first documents mention Criteo, MT-LIFT and a Madrid census. **There are no tables from those sources in the running instance that was inspected.** The files of those proposals remain in the repository as context; they are not announced as available sources for the new dashboard. The TRD schema used is in `sql/schema.sql`; its ETL links the origin in `scripts/prepare.py`.

## 3. Do not join populations that share no IDs

OTTO does not know Glovo's products; Ele.me does not identify our fictional businesses in Spain. Within TRD, orders, products and clicks can be joined by their keys and dates. Across datasets there is no reliable join that turns everything into orders from a single app.

That is why two logical databases are kept on the same node: **delivery** (historical lab) and **delivery_atlas** (our own model). They are not two servers. The old dashboards still use port 8000; Atlas uses 8001.

## 4. Which columns and structures we reuse

### Browsing: v1 contract kept

`app_events` keeps schema_version, event_id, session_id, event_time, event_date, ingested_at, event_type, section, city_id, user_id, restaurant_id, product_id, source, source_kind, source_record_id and simulation_run_id. Unknown optional references are still null.

Its exact aggregate and deduplication keep working. The original large generator and the manual actions are still accepted. We do not add positions to that table: a GPS position is not a click.

### Demo catalog: explicitly fictional fields

- **demo_restaurants:** restaurant_id, name, city_id, latitude, longitude, location_kind, source_kind, version. Twelve fictional establishments; synthetic locations and identity.
- **demo_products:** product_id, restaurant_id, product_name, price_minor, currency, price_kind, name_kind, source_table, source_row, version. Thirty-six products.
- If Glovo Madrid is available when seeding the demo, the name of a sample and its source row are copied. Otherwise, fictional names are used. **The price is always fictional** and is not attributed to Glovo. Assigning the product to a fictional business does not prove that the real business sells it either.
- It is seeded on first start. A future catalog update must be an explicit, validated operation; restarting must not change what we were presenting before.

### New operational facts

| Table | One row is | Main fields |
|---|---|---|
| **courier_positions** | A synthetic courier position | event_id, run, both times, city, courier_id, order_id, latitude, longitude, speed_kmh, accuracy_m, source/kind |
| **order_events** | A complete snapshot of an order in one status | event_id/run/times, order_id, courier_id, restaurant_id, status, amount_minor, currency, pickup/dropoff lat/lon, order_created_at, promised_delivery_at, source/kind |

Times are in UTC. `amount_minor` is integer cents, never a floating-point price. The dashboard formats it in EUR. Statuses: created, preparing, picked_up, en_route, delivered and cancelled. GPS fields are validated for range and finiteness. The current API only accepts `synthetic` operations; connecting a real GPS requires reviewing the contract, provenance and access, not removing a label.

The model keeps its own IDs to relate orders and couriers **within a run**. ClickHouse does not enforce foreign keys; the simulator maintains those relationships. The telemetry API checks the format; it is not a transactional engine for assigning deliveries.

## 5. How the latest position is obtained

`ReplacingMergeTree(ingested_at)` keeps the history of positions/statuses. The `courier_latest_state` and `order_latest_state` tables use `AggregatingMergeTree`; their materialized views compute `argMaxState` and the read views use `argMaxMerge`.

The comparison value is `(event_time,event_id)`: the most recent event time wins; on a tie, the UUID decides deterministically. It is not simply whatever reached the server last. The complete state is stored in a tuple, so latitude, longitude, order and time come from the same row. This follows the documented pattern of [argMax](https://clickhouse.com/docs/reference/functions/aggregate-functions/argMax) and [AggregatingMergeTree](https://clickhouse.com/docs/reference/engines/table-engines/mergetree-family/aggregatingmergetree).

The groups include run, city and courier/order to keep runs separate. A stopped simulator leaves its history visible. When the API restarts, the last run is remembered, but **generation is not restarted automatically**.

## 6. Where each thing is ingested

```text
Public sources -> existing ETL -> delivery (original tables)
Own browsing -> POST /api/events -> queue -> app_events
Simulated GPS -> POST /api/operations, kind=courier_positions -> queue -> courier_positions
Simulated statuses -> POST /api/operations, kind=order_events -> queue -> order_events
Built-in simulator -> same validation and queue -> those three tables
Small catalog -> explicit seeding on first start -> demo_restaurants/products
```

`POST /api/operations` accepts `{"kind":"courier_positions","events":[...]}` or `order_events`. The full example comes from the generator in `atlas/simulation.py`. Maximum 5000 events or 5 MiB. ID and content are kept when retrying; 202 confirms the queue and 200 recognizes a retry. `_stream` is internal metadata: it is not sent by a client.

If a batch mixes types within the queue, the publisher performs one INSERT per table. **There is no transaction across those INSERTs.** If it fails after the first one, the batch stays pending and is sent again. There may be physical copies; logical reads and aggregates resolve retries for immutable content. GPS and order reads are also separate queries and may show brief differences during a publish.

The queue is neither an analytical database nor a replica. It is still limited to 200000 pending and keeps published payloads: its growth must be measured and cleanup/backup designed before production. Telemetry has no TTL yet; no history was deleted automatically.

## 7. What the dashboard shows and what time it measures

- Map: published positions, selectable, with the path of the current order.
- Orders: active, delivered, cancelled, past the fictional deadline and fictional delivered amount. There is no real commercial revenue.
- GPS: count of unique IDs in five-second intervals, last two minutes of the selected run.
- Freshness: difference between event time and query time. If a query fails, a warning is shown and the previous positions are kept.
- Until received by the API: `ingested_at - event_time`, **not** the time until publishing. Do not call that value total latency.
- Browsing: Madrid counts from the aggregate, with a synthetic/demo_live selector and a manual search button. It is labelled as the whole Atlas history. This section queries every ten seconds so that the aggregate of a million IDs does not compete with tracking; changing the source requests it again.
- Inventory and Glovo sample: table and catalog metadata, separate from the synthetic operations. The inventory does not run a full count of every dataset every two seconds.

## 8. Start and demo

```bash
docker compose -f compose.yaml --profile atlas up -d --build --wait
python3 -m unittest discover -s tests -v
python3 scripts/check_operations.py
```

Open **http://127.0.0.1:8001/**. Click "Start customers and delivery". Choose a courier, watch the coordinates and the history, wait for a status change, record a manual search and switch the source to manual actions. Stopping keeps the data and stops generation. Changing the fleet requires stopping and starting a new run.

Read routes: `/api/simulation`, `/api/operations?run_id=UUID`, `/api/track?run_id=UUID&courier_id=UUID`, `/api/demo-catalog`, `/api/catalog`, `/api/inventory`, `/api/summary`, `/api/status`. Control: `POST /api/simulation/start` with fleet/interval/seed, `POST /api/simulation/stop` with `{}`.

Optional historical GPS load:

```bash
python3 scripts/operations.py --positions 100000 --fleet 12 --seed 42 --start 2026-10-06T10:00:00Z
python3 scripts/atlas.py status
```

It is a load separate from the fleet that is generating positions now. Repeating the parameters keeps the run and the IDs. The send report alone does not prove publishing; check the run in ClickHouse. The fleet's first orders start in staggered phases and their initial history may be partial. A cycle lasts 160 s and can be cancelled; the parameters are not calibrated against real delivery. The generated browsing sessions are an independent scenario with abandonment: they are not related to a real purchase and cannot be used to compute the conversion of those orders.

**Load verified on this machine:** 100000 positions and 5965 status snapshots, both verified in ClickHouse by run ID. Sending 105965 records: 435.887 s, during a concurrent run of the fleet and queries. It is not a ClickHouse capacity benchmark. [Load evidence](evidencia-carga-gps.json). [Retry and time-order tests](evidencia-tracking.json). Queries for class: `sql/atlas_tracking_consultas.sql`.

In a sample taken before the adjustments, under concurrent load, `/api/operations` took 8.36 s and returned positions 52.6 s old. Browsing reads were separated from tracking, repeating the aggregate to compute totals was avoided and parallelism was limited to four threads. There is still no sustained test that guarantees latency under load. If the publisher falls behind, showing it is part of the demo; the queue does not turn the delay into instant real time.

The API now keeps a shared SQLite connection protected by a lock, with WAL and `synchronous=FULL`; it avoids reopening the connection and losing its cache on every batch. After these adjustments, **three local samples without concurrent historical load** returned the 12 couriers with a maximum data age of 1.761–2.279 s at query time and queries of 0.177–0.855 s. These are point observations, not a guarantee of sustained performance or an isolated test of the effect of each adjustment. [Freshness evidence](evidencia-frescura.json).

## 9. Which database to use and what to extend later

**Now:** ClickHouse for events, history and aggregated reads; SQLite as local persistent transport. It fits the course and [real-time analytics](https://clickhouse.com/use-cases/real-time-analytics). We do not need another engine to demonstrate this flow.

**If it became a real delivery app:** a transactional database to accept/cancel/assign orders with rules and transactions, and a distributed transport system if ingestion grows. It is an architectural extension, not something installed today. We do not promise reliable operational assignment, high availability or real GPS accuracy just because there is a map.

Next steps with the most value: connected commercial mini-app, an explicit link between its checkout and a simulated order, sustained measurement of delay under load, cleanup/backup of the queue and history, and reproduction on another machine. A second node is a later experiment; the current evidence corresponds to one.
