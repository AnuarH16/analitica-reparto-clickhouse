# Presentation: 20 minutes + 10-minute demo

**Current 5-minute progress update:** [PROGRESS-UPDATE.md](PROGRESS-UPDATE.md). This document keeps the earlier script for the final talk and needs to be adapted to the new Delivery Atlas scope.

**Title:** Clickstream Lab: analytics over hundreds of millions of real events and a billion-row test with ClickHouse.

**Thesis:** ClickHouse makes it possible to query and visualize large event tables; physical design, incremental aggregation and data provenance can be measured and explained.

**New framing for the next version:** present a fictional food-delivery platform and design its analytics infrastructure for massive event volumes, with simulated browsing and traffic, and adapters for future real data. The design is in [FICTIONAL-PLATFORM.md](FICTIONAL-PLATFORM.md). The current slides show the implementation from before that integration: update the walkthrough once it is implemented and measured. The existing benchmarks are still from OTTO/REES46/Ele.me, not from the fictional platform.

Results verified on this machine: **628,425,832 real events** from two sources, **1,083,580,480 derived rows** and a comparison of **5.89 s vs 0.21 s** for the same daily question. See [RESULTS.md](RESULTS.md) for conditions and limits.

[Navigable slides](http://127.0.0.1:8000/otto-presentacion.html) (arrow keys and `F` for full screen). [Reproducible demo](DEMO.md).

| Time | Slides | What to explain |
|---:|---:|---|
| 0–2 min | 1–2 | An application produces events as people browse. A dashboard needs to group by time, type and product, not retrieve a single order. |
| 2–4 min | 3–4 | OTTO: 216,716,096 verified events, including 194,720,954 clicks; JSONL session structure transformed into one row per event. |
| 4–7 min | 5–6 | ClickHouse as a columnar OLAP engine that uses SQL. `MergeTree`, parts, compression, sparse index, partitions and selective column reads. Architecture ZIP/CSV → Python ETL → ClickHouse → API → dashboard. |
| 7–9 min | 7–8 | Two clocks: historical event time and insertion time during the replay. 30-second window over `ingested_at`. |
| 9–11 min | 9–10 | Dashboard and single-node operating model. `Distributed`, `ReplicatedMergeTree` and Keeper as an explanation of scaling, without faking a local cluster. |
| 11–13 min | 11 | REES46: seven real months of a marketplace with views, carts and purchases, categories, brands and price. Geography not published; these are not Uber Eats/Glovo events. |
| 13–15 min | 12 | Table of 1,083,580,480 derived rows, five labelled scenarios. Distinguish workload size from newly observed data. |
| 15–17 min | 13–14 | Materialized view and `SummingMergeTree`: 87 day/type keys. Comparison of queries with the same answer and read/time statistics from the benchmark. |
| 17–20 min | 15–16 | Strengths, update/delete, dataset limits, honest metrics, and transition to the demo. |
| 20–30 min | — | Follow [DEMO.md](DEMO.md). |

## Talking points for questions

- **"Why ClickHouse and not a traditional database?"** The dominant case is repeated `GROUP BY` over very large event tables. ClickHouse stores and reads by column and offers incremental aggregates. PostgreSQL can also store events and build aggregates; the choice depends on the workload. Individual orders and accounts fit better in a transactional engine.
- **"Is it NoSQL?"** It is a columnar OLAP store and it uses SQL. Explain the category without hiding that nuance.
- **"Are these events from Glovo or from Spain?"** No. OTTO events are anonymized commercial events, and REES46 is an anonymous marketplace from an unspecified country. The analogy with delivery is the browsing and analysis pattern.
- **"Is the billion-row table real data?"** They are test rows **derived from OTTO's 216.7 million**. They are never presented as new users or clicks. The other two datasets are published observations.
- **"Is it a live feed?"** The replay inserts historical events today at a controlled pace; the button clicks are new. There is no current public stream from OTTO, Glovo or Uber Eats here.
- **"What does conversion mean?"** Cohorts, session, time window and attribution must be defined; a simple ratio between event counts is not a conversion of people.
- **"Where is the scalability?"** A local billion-row table, a measured query and the partition/order design. The demo does not prove fault tolerance or a multi-node cluster.

## Sources

- [OTTO: description, counts and license](https://github.com/otto-de/recsys-dataset)
- [REES46: historical marketplace datasets](https://data.rees46.com/)
- [ClickHouse: MergeTree](https://clickhouse.com/docs/engines/table-engines/mergetree-family/mergetree)
- [ClickHouse: materialized views](https://clickhouse.com/docs/materialized-views)
- [ClickHouse: horizontal scaling](https://clickhouse.com/docs/architecture/horizontal-scaling)
