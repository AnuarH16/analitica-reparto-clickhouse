# Teoría del curso aplicada al proyecto

Cada decisión técnica de Delivery Atlas y el concepto del temario que la justifica. Actualizado el 19/10/2026 para la infraestructura actual: `compose.yaml` con el perfil `atlas`, `atlas/` y `sql/atlas*.sql`.

| Concepto | Decisión | Dónde está |
|---|---|---|
| **Monolito o microservicios** | Un solo proceso Python hace de API HTTP, cola y publicador. Es fácil de arrancar y depurar, pero no escala horizontalmente: no se pueden ejecutar dos APIs sobre la misma cola | `atlas/server.py` |
| **ACID frente a BASE** | La cola usa SQLite con transacciones y `synchronous=FULL`: un evento aceptado no se pierde aunque ClickHouse esté caído. ClickHouse guarda la analítica y no tiene transacciones entre tablas. Un pedido de la miniapp escribe en tres tablas en INSERT separados; si uno falla, se reenvía el lote completo | `atlas/store.py`, `atlas/clickhouse.py` |
| **CAP / PACELC** | Con un nodo no hay réplicas que puedan quedar separadas, pero tampoco alta disponibilidad. Si ClickHouse cae, la API sigue aceptando eventos en la cola (202) y los publica al volver: la ingesta sigue disponible y las lecturas se atrasan. Con réplicas (`ReplicatedMergeTree`), la replicación es asíncrona y el sistema se comportaría como PA/EL; `insert_quorum` lo acercaría a PC/EC a cambio de latencia | Defensa oral, [FUNDAMENTOS.md](FUNDAMENTOS.md) |
| **Idempotencia** | El `event_id` lo fija quien envía el evento. La cola guarda una huella SHA-256 del contenido: el mismo ID con el mismo contenido responde 200 sin duplicar, y con otro contenido responde 409. En ClickHouse, `ReplacingMergeTree(ingested_at)` elimina copias al fusionar partes y los agregados cuentan IDs únicos (`uniqExactState`), así que un reintento no suma dos veces | `atlas/store.py`, `sql/atlas.sql` |
| **Colas o flujos** | Cola duradera local (patrón *outbox*) con un único publicador que envía lotes de hasta 5000 eventos. No es Kafka: hay un solo consumidor, sin offsets ni varios suscriptores. Kafka sería la evolución si otros sistemas necesitaran leer los mismos eventos | `atlas/store.py`, `atlas/server.py` |
| **Tolerancia a fallos** | 202 significa «recibido de forma duradera». Si falla la publicación, los eventos siguen pendientes y se reintenta cada 2 segundos. Con la cola llena (200000 pendientes por defecto), la API responde 503 para que el cliente reintente más tarde. Las lecturas reintentan si el nodo se queda sin memoria; las escrituras no se repiten ahí | `atlas/server.py`, `atlas/clickhouse.py`, [RESULTADOS-ATLAS.md](RESULTADOS-ATLAS.md) |
| **Modelar según los accesos** | El `ORDER BY` de cada tabla empieza por las columnas que filtra el panel: `(source_kind, event_date, city_id, event_type, …)` en la navegación y `(simulation_run_id, city_id, courier_id, event_time, …)` en las posiciones GPS | `sql/atlas.sql`, `sql/atlas_operations.sql` |
| **Particionado ≠ sharding** | `PARTITION BY toYYYYMM(...)` organiza los datos por mes dentro de un servidor. El sharding los repartiría entre nodos con tablas `Distributed`; es opcional y no está montado | `sql/atlas.sql`, `sql/atlas_operations.sql` |
| **Replicación** | Se explica con `ReplicatedMergeTree` y ClickHouse Keeper. Montar varios nodos es opcional | Defensa oral, [FUNDAMENTOS.md](FUNDAMENTOS.md) |
| **Vistas materializadas** | Calculan al insertar lo que el panel consulta a menudo: el último estado de cada repartidor, pedido y cliente (`argMaxState`) y los recuentos diarios por IDs únicos. El panel no recorre todo el histórico en cada refresco | `sql/atlas.sql`, `sql/atlas_operations.sql`, `sql/atlas_agents.sql` |
| **Observabilidad** | `GET /api/status` informa de eventos pendientes y publicados, errores, conflictos, rechazos, fase del publicador, tamaño del último lote y su duración. El panel enseña la antigüedad de los datos y los errores | `atlas/server.py`, `web/atlas-dashboard.js` |
| **Seguridad** | Puertos publicados solo en `127.0.0.1`. Las credenciales son de demostración y están en `compose.yaml`; no hay usuarios separados para escribir y leer, y la API corre como root en una imagen `python:3.12-slim`. Para compartir el panel se usa una pasarela de solo lectura que no expone el SQL | `compose.yaml`, `Dockerfile.atlas`, [COMPARTIR-VERCEL.md](COMPARTIR-VERCEL.md) |
| **Almacenamiento** | ClickHouse actúa como almacén analítico con esquema al escribir: tipos estrictos, `Enum`, `LowCardinality` y restricciones `CHECK` sobre la versión y el tipo de evento. Los ficheros de los datasets son entradas locales, no un data lake | `sql/atlas.sql` |
| **Docker Compose** | Healthchecks con `depends_on: service_healthy`, volúmenes con nombre para ClickHouse y la cola, perfiles `atlas` y `ai`, versión de ClickHouse fijada (25.8) y límites de memoria y CPU para Ollama | `compose.yaml` |

## Ventajas y desventajas de ClickHouse aquí

**Ventajas:**
- Lee solo las columnas que necesita cada consulta.
- Las vistas materializadas mantienen el último estado y los recuentos mientras entran datos.
- Los tipos `LowCardinality` y `Enum` comprimen bien columnas muy repetidas, como ciudad, tipo de evento o procedencia.
- Inserta lotes de miles de filas de una vez.
- Usa SQL, que el equipo ya conoce.

**Desventajas:**
- No hay transacciones entre tablas.
- La eliminación de duplicados es eventual: para contar exacto hay que usar `FINAL` o agregados por IDs.
- `UPDATE` y `DELETE` son mutaciones caras, y las vistas materializadas no recalculan lo borrado.
- Los INSERT pequeños penalizan; por eso el publicador agrupa en lotes.
- En la prueba de un millón de eventos, el agregado no fue más rápido que el detalle (0,703 s frente a 0,498 s; [RESULTADOS-ATLAS.md](RESULTADOS-ATLAS.md)).
- Con un solo nodo no hay alta disponibilidad.

La versión anterior del repositorio, con Flask y Grafana (`app/`, `docker-compose.yml`), tomaba otras decisiones, como usuarios con permisos mínimos para escribir y leer. Está en el historial de git de este documento.
