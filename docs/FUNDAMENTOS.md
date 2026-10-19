# ClickHouse: fundamentos, arquitectura y reflexión crítica

## Encaje en BD2

ClickHouse es una **base de datos columnar OLAP con SQL**. En una clasificación de NoSQL suele tratarse como almacén analítico de columnas, pero no debe presentarse como motor «sin SQL»: utiliza un dialecto SQL. Conviene explicar al profesor este matiz al principio. Su problema central aquí es responder agregaciones sobre cientos de millones de eventos mientras entran lotes nuevos.

La idea de producto se inspira en la analítica de navegación que necesitaría una plataforma de reparto: volumen por tiempo, exploración de productos o categorías, acciones de cesta y compra. **Las fuentes reales disponibles no son Uber Eats ni Glovo**. OTTO sí contiene clics explícitos; REES46 contiene vistas, carritos y compras. No se suman como si fueran el mismo suceso o la misma población.

## Dónde se usa ClickHouse

El proyecto empezó en 2009 para una plataforma de analítica web y se publicó como código abierto en 2016, con licencia Apache 2 ([historia oficial](https://clickhouse.com/docs/about-us/history)). En la lista oficial de usuarios, Yandex Metrica aparece como el producto principal construido sobre ClickHouse.

La documentación agrupa sus usos habituales en cuatro familias ([casos de uso](https://clickhouse.com/docs/use-cases)):

| Uso | Por qué encaja |
|---|---|
| Analítica en tiempo real y series temporales | Datos con marca de tiempo que llegan sin parar y se agregan por intervalos |
| Observabilidad: logs, métricas y trazas | Mucho volumen que se añade y casi nunca se modifica; se filtra por tiempo y servicio |
| Almacén analítico y consultas sobre data lakes | Agregaciones sobre tablas muy grandes con SQL |
| Machine learning e IA generativa | Explorar y preparar grandes conjuntos de datos para modelos |

Algunos ejemplos de la [lista oficial de usuarios](https://clickhouse.com/docs/about-us/adopters):

| Empresa | Sector | Uso declarado |
|---|---|---|
| Cloudflare | CDN | Análisis de tráfico |
| Uber | Transporte | Logs |
| eBay | Comercio electrónico | Logs, métricas y eventos |
| GitLab | Desarrollo y DevOps | Monitorización del rendimiento de aplicaciones (APM) |
| Spotify | Música | Experimentación |
| Deutsche Bank | Finanzas | Analítica de negocio (BI) |
| Instacart | Reparto | Ingeniería e infraestructura de datos |
| DoorDash | Comercio electrónico | Monitorización |
| Zomato | Pedidos de comida a domicilio | Logs y reparto de comida |

Las entradas las aportan las propias empresas, a menudo con charlas o artículos de años anteriores. No demuestran que lo sigan usando hoy ni a qué escala.

Todos estos usos comparten un patrón: muchos eventos que se añaden y casi no se modifican, y consultas que agregan millones de filas leyendo pocas columnas. Es el mismo trabajo que necesita la plataforma de reparto ficticia de este proyecto. Varias empresas de reparto de la lista lo usan para logs, monitorización e infraestructura de datos.

## Modelo de datos

| Tabla | Procedencia | Grano | Motor y orden |
|---|---|---|---|
| `otto_archive` | OTTO real | Un clic, carrito o pedido de una sesión | `MergeTree`, mes; `(event_time,session_id,event_position)` |
| `otto_replay` | OTTO real reinsertado | Un evento reproducido con `ingested_at` nuevo | `MergeTree`, día de inserción |
| `live_clicks` | Esta página | Un clic de un visitante de la demo | `MergeTree` |
| `rees46_events` | REES46 real | Una vista, carrito o compra | `MergeTree`, mes; `(event_date,event_type,category_id,product_id)` |
| `otto_scale_benchmark` | Derivado | Una copia etiquetada de un evento OTTO | `MergeTree`, mes; `scenario` explicita origen |
| `otto_daily_rollup` | Agregado de OTTO | Recuento parcial por fecha y tipo | `SummingMergeTree` + vista materializada |

El ETL OTTO convierte cada sesión JSONL en varias filas, una por evento. REES46 se lee desde siete CSV.gz sin extraerlos a disco: `gzip` alimenta a `clickhouse-client`. Los archivos temporales comprimidos y las tablas persistentes tienen usos distintos.

En `MergeTree`, el `ORDER BY` determina el orden físico y el índice primario disperso de los datos. Las particiones ayudan a eliminar meses enteros cuando un filtro coincide con ellas; el orden ayuda a localizar rangos dentro de las partes. `LowCardinality(String)` resulta apropiado para tipos de evento y marcas repetidas. Leer solo las columnas necesarias reduce bytes frente a una lectura de filas completas. No todo `WHERE` será igual de eficiente: hay que comprobar la consulta y los índices con `EXPLAIN indexes = 1`.

La vista materializada recibe los lotes **insertados después de su creación** y añade sus recuentos a `otto_daily_rollup`. Para un archivo ya cargado, `scripts/rollup.py` hace el backfill explícito. En `SummingMergeTree` puede haber varias filas físicas con la misma clave hasta que se fusionen partes; por eso la consulta utiliza `sum(events) GROUP BY event_date,event_type`, en lugar de asumir que cada clave ocupa exactamente una fila física. Las 87 combinaciones día/tipo de OTTO son la unidad lógica del agregado.

## Consistencia y disponibilidad

La demo usa **un solo nodo** con volumen Docker persistente. Tras una inserción confirmada, una consulta puede leer las nuevas filas; las fusiones de partes ocurren luego en segundo plano. No hay réplicas ni alta disponibilidad: si el contenedor está caído, el dashboard no responde. El reproductor reenvía eventos históricos a otra tabla, y sus consultas por `ingested_at` no cambian la fecha original del suceso.

Con este volumen, las fusiones también forman parte de la operación: compiten por CPU, disco y memoria con las consultas. En esta máquina de unos 4 GB, el valor inicial permitía hasta 32 fusiones simultáneas; `clickhouse-config.xml` fija cuatro y ajusta los umbrales internos de MergeTree para que las mutaciones sigan siendo válidas. Se sacrifica velocidad de compactación para mantener recursos disponibles al panel. [La documentación oficial](https://clickhouse.com/docs/reference/settings/server-settings/settings/background) indica que reducir el pool exige reiniciar el servidor, y [explica](https://clickhouse.com/docs/reference/settings/server-settings/settings/background-merges) cómo el ratio multiplica la concurrencia.

Para un despliegue distribuido se pueden distribuir fragmentos mediante tablas `Distributed` y conservar copias con `ReplicatedMergeTree` y ClickHouse Keeper. Eso requiere configuración adicional y tiene consecuencias de consistencia y latencia; **no se demuestra ni se simula con el contenedor local**. Se explica con el diagrama y con la limitación observada de un nodo.

## Experimento que justifica ClickHouse

`scripts/benchmark.py` formula exactamente la misma pregunta al archivo de 216.716.096 eventos OTTO y al agregado diario. Compara resultados antes de aceptar la medición. Registra tiempo, `rows_read` y `bytes_read` de la respuesta JSON de ClickHouse, con caché de consultas desactivada. Ejecuta tres veces cada consulta OTTO y toma la mediana. También cuenta tipos en un mes REES46 y agrupa la tabla derivada de 1.083.580.480 filas por escenario. El informe queda en `data/query-benchmark.json`.

El resultado medido pertenece a **este equipo, estas tablas y esta pregunta**. No implica que ClickHouse siempre gane a PostgreSQL ni que un agregado equivalente en PostgreSQL sea lento. La ventaja que se ilustra es concreta: calcular una respuesta repetida una vez durante la ingestión evita volver a leer millones de eventos para cada petición del panel.

## Inserción, lectura, actualización y borrado

- Inserción: el ETL usa lotes; el dashboard envía un evento nuevo por clic; el reproductor ingresa lotes pequeños.
- Lectura: `SELECT` con filtros temporales, `GROUP BY`, `countIf`, `uniqCombined64` y agregados.
- Actualización y borrado: `scripts/crud_demo.py` ejecuta `ALTER TABLE ... UPDATE/DELETE` en una tabla de ensayo. Son mutaciones más costosas que el patrón de añadir eventos y consultar agregados; no se modifica masivamente el archivo histórico para mostrar CRUD.

## Interfaces, clientes y herramientas

El servidor acepta conexiones por varias interfaces ([interfaces](https://clickhouse.com/docs/interfaces/overview), [puertos](https://clickhouse.com/docs/guides/sre/network-ports)):

| Interfaz | Puerto por defecto | En este proyecto |
|---|---:|---|
| HTTP | 8123 (8443 con TLS) | La usan la API de Atlas y los scripts de Python. Compose la publica en `127.0.0.1:8124` |
| Protocolo nativo TCP | 9000 | Lo usa `clickhouse-client` dentro del contenedor. No se publica fuera |
| Emulación de MySQL y PostgreSQL | 9004 y 9005 | No se usan |
| gRPC | 9100 | No se usa |

Herramientas disponibles:

- **Consola:** `clickhouse-client`, por ejemplo `docker exec -it bd2-clickhouse clickhouse-client --user demo --password demo`.
- **Interfaces web del propio servidor:** `/play` para lanzar SQL y `/dashboard` con gráficas del servidor. Con nuestro Compose están en http://127.0.0.1:8124/play y http://127.0.0.1:8124/dashboard.
- **Librerías oficiales** ([clientes por lenguaje](https://clickhouse.com/docs/integrations/language-clients)): Python (`clickhouse-connect`), JavaScript, Go, Java (también JDBC y R2DBC), C#, Rust, C++ y C. También hay drivers JDBC, ODBC y ADBC para herramientas de BI.
- **Visualización:** Grafana con el plugin `grafana-clickhouse-datasource`, que usaba la versión anterior de este repositorio.

**Por qué Atlas usa HTTP con la biblioteca estándar de Python.** `atlas/clickhouse.py` envía el SQL por HTTP con `urllib`:

- No añade dependencias: la imagen de la API y los scripts solo necesitan Python.
- Es la interfaz que también usa el cliente oficial, `clickhouse-connect` ([cliente de Python](https://clickhouse.com/docs/integrations/python)).
- Las consultas del panel pasan los valores como parámetros tipados del servidor (`{run:UUID}` con `param_run`), sin concatenarlos en el SQL.
- Las inserciones van por lotes con `INSERT … FORMAT JSONEachRow`.

El coste es escribir a mano la autenticación, el formato de las respuestas y el manejo de errores, que `clickhouse-connect` ya resuelve.

## Calidad del dato y límites

- OTTO publica IDs de artículos anónimos, sin nombre, precio ni categoría. Su archivo de entrenamiento tiene **216.716.096** eventos: **194.720.954** clics, **16.896.191** carritos y **5.098.951** pedidos. El archivo de clase se valida por SHA-256 y por estos recuentos.
- REES46 publica siete meses de eventos de un marketplace sin identificar su país. Sus vistas de producto **no son clics OTTO**. El manifiesto local conserva el tamaño del archivo y los recuentos por mes.
- La tabla de mil millones **es una prueba de estrés derivada**, no un conjunto de observaciones nuevas; se muestran siempre las filas originales y derivadas por separado.
- `uniqCombined64` estima usuarios/sesiones distintos; los recuentos de filas son exactos. La razón entre número de vistas y compras no es una tasa de conversión de personas sin definir ventana, sesión y atribución.
- La reproducción de OTTO muestra ingesta en tiempo real, pero los sucesos ocurrieron en el pasado. Los clics de los botones del dashboard son las únicas acciones nuevas originadas en la demo.

## Comparación con una base transaccional

| Necesidad | Elección razonable |
|---|---|
| Guardar pedidos, cobros y cuentas que cambian individualmente | Sistema transaccional como PostgreSQL |
| Explorar años de eventos y agrupar cientos de millones de filas | ClickHouse |
| Mostrar métricas frecuentes en un dashboard | ClickHouse con vista materializada/rollup |
| Buscar o modificar una fila individual como operación principal | PostgreSQL u otro motor orientado a transacciones |

Fuentes técnicas: [MergeTree](https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree), [materialized views](https://clickhouse.com/docs/materialized-views), [horizontal scaling](https://clickhouse.com/docs/architecture/horizontal-scaling), [HTTP](https://clickhouse.com/docs/interfaces/http). Datos: [OTTO](https://github.com/otto-de/recsys-dataset) y [REES46](https://data.rees46.com/).
