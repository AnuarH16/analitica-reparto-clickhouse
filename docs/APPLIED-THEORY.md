# Course theory applied to the project

Each technical decision in Delivery Atlas and the course concept that justifies it. Updated on 19 October 2026 for the current infrastructure: `compose.yaml` with the `atlas` profile, `atlas/` and `sql/atlas*.sql`.

| Concept | Decision | Where |
|---|---|---|
| **Monolith or microservices** | A single Python process acts as HTTP API, queue and publisher. It is easy to start and debug, but it does not scale horizontally: two APIs cannot run over the same queue | `atlas/server.py` |
| **ACID vs BASE** | The queue uses SQLite with transactions and `synchronous=FULL`: an accepted event is not lost even if ClickHouse is down. ClickHouse stores the analytics and has no transactions across tables. A mini-app order writes to three tables in separate INSERTs; if one fails, the whole batch is resent | `atlas/store.py`, `atlas/clickhouse.py` |
| **CAP / PACELC** | With one node there are no replicas that can be split apart, but there is no high availability either. If ClickHouse goes down, the API keeps accepting events into the queue (202) and publishes them when it comes back: ingestion stays available and reads fall behind. With replicas (`ReplicatedMergeTree`), replication is asynchronous and the system would behave as PA/EL; `insert_quorum` would move it towards PC/EC at the cost of latency | Oral defence, [FUNDAMENTOS.md](FUNDAMENTOS.md) |
| **Idempotency** | The `event_id` is set by whoever sends the event. The queue stores a SHA-256 fingerprint of the content: the same ID with the same content returns 200 without duplicating, and with different content returns 409. In ClickHouse, `ReplacingMergeTree(ingested_at)` removes copies when parts merge and the aggregates count unique IDs (`uniqExactState`), so a retry is never counted twice | `atlas/store.py`, `sql/atlas.sql` |
| **Queues or streams** | Durable local queue (*outbox* pattern) with a single publisher that sends batches of up to 5000 events. It is not Kafka: there is one consumer, no offsets and no multiple subscribers. Kafka would be the next step if other systems needed to read the same events | `atlas/store.py`, `atlas/server.py` |
| **Fault tolerance** | 202 means "durably received". If publishing fails, the events stay pending and are retried every 2 seconds. When the queue is full (200000 pending by default), the API returns 503 so the client retries later. Reads are retried if the node runs out of memory; writes are not repeated there | `atlas/server.py`, `atlas/clickhouse.py`, [RESULTADOS-ATLAS.md](RESULTADOS-ATLAS.md) |
| **Modelling for access patterns** | Each table's `ORDER BY` starts with the columns the dashboard filters on: `(source_kind, event_date, city_id, event_type, …)` for browsing and `(simulation_run_id, city_id, courier_id, event_time, …)` for GPS positions | `sql/atlas.sql`, `sql/atlas_operations.sql` |
| **Partitioning ≠ sharding** | `PARTITION BY toYYYYMM(...)` organises data by month within one server. Sharding would spread it across nodes with `Distributed` tables; it is optional and not set up | `sql/atlas.sql`, `sql/atlas_operations.sql` |
| **Replication** | Explained with `ReplicatedMergeTree` and ClickHouse Keeper. Running several nodes is optional | Oral defence, [FUNDAMENTOS.md](FUNDAMENTOS.md) |
| **Materialized views** | They compute at insert time what the dashboard queries often: the latest state of each courier, order and customer (`argMaxState`) and daily counts by unique IDs. The dashboard does not scan the whole history on every refresh | `sql/atlas.sql`, `sql/atlas_operations.sql`, `sql/atlas_agents.sql` |
| **Observability** | `GET /api/status` reports pending and published events, errors, conflicts, rejections, publisher phase, last batch size and its duration. The dashboard shows data age and errors | `atlas/server.py`, `web/atlas-dashboard.js` |
| **Security** | Ports are published only on `127.0.0.1`. Credentials are demo values in `compose.yaml`; there are no separate users for writing and reading, and the API runs as root in a `python:3.12-slim` image. Sharing the dashboard goes through a read-only gateway that does not expose SQL | `compose.yaml`, `Dockerfile.atlas`, [COMPARTIR-VERCEL.md](COMPARTIR-VERCEL.md) |
| **Storage** | ClickHouse acts as an analytical store with schema on write: strict types, `Enum`, `LowCardinality` and `CHECK` constraints on the version and event type. The dataset files are local inputs, not a data lake | `sql/atlas.sql` |
| **Docker Compose** | Healthchecks with `depends_on: service_healthy`, named volumes for ClickHouse and the queue, `atlas` and `ai` profiles, pinned ClickHouse version (25.8) and memory and CPU limits for Ollama | `compose.yaml` |

## Advantages and disadvantages of ClickHouse here

**Advantages:**
- It reads only the columns each query needs.
- Materialized views keep the latest state and the counts up to date while data arrives.
- `LowCardinality` and `Enum` types compress highly repeated columns well, such as city, event type or source.
- It inserts batches of thousands of rows at once.
- It uses SQL, which the team already knows.

**Disadvantages:**
- There are no transactions across tables.
- Deduplication is eventual: exact counts need `FINAL` or aggregates by ID.
- `UPDATE` and `DELETE` are expensive mutations, and materialized views do not recompute deleted data.
- Small INSERTs are penalised; that is why the publisher groups events into batches.
- In the one-million-event test, the aggregate was not faster than the detail table (0.703 s vs 0.498 s; [RESULTADOS-ATLAS.md](RESULTADOS-ATLAS.md)).
- With a single node there is no high availability.

The previous version of the repository, with Flask and Grafana (`app/`, `docker-compose.yml`), made other decisions, such as users with minimal permissions for writing and reading. It is in this document's git history.
