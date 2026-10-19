# Project brief and delivery checklist

Date: 19 October 2026. This document summarizes, in our own words, what the BD2 final project brief asks for. For each requirement it shows where it is covered in the repository and its status. The original text belongs to the professor and is not copied here because the repository is public.

**Statuses:** **Done** (covered and documented), **Partial** (exists, but needs completing or updating), **Missing** and **Optional**.

## What the brief asks for

Each group researches a NoSQL database in depth, explains its fundamentals and shows a practical use case that highlights its advantages.

- **Presentation date:** 15 November 2026.
- **Format:** 30 minutes per group: 20 minutes of technical presentation, with the live demo included, and about 10 minutes of questions.
- **Deliverables:**
  1. The presentation with the demo.
  2. `.md` documents with the documentation, step-by-step installation and a guide to run the demo. They must be enough for another student to reproduce the demo and understand the fundamentals.
  3. Any additional files needed: code, images, `yml`, etc.
- **Minimum content:** context and motivation, main characteristics, architecture and operation, live demo and critical reflection. The brief's sub-points are suggestions; going further is valued.
- **Demo ideas it suggests:** a mini-app using the database as backend, a typical data flow, a real-time scenario or a visualization with filters and dashboards. Delivery Atlas combines all four.

## Decisions confirmed with the professor

| Topic | Decision |
|---|---|
| Technology | **ClickHouse**, assigned by the professor. This resolves the question about the "Personas" section raised in [ESTADO-EQUIPO.md](ESTADO-EQUIPO.md) and [REVISION-TEORIA.md](REVISION-TEORIA.md). The presentation should still explain the nuance: it is a columnar OLAP store that uses SQL ([FUNDAMENTOS.md](FUNDAMENTOS.md)). |
| Duration | 20 minutes of presentation **including the demo** and about 10 minutes of questions. |
| Multiple nodes | **Optional.** No cluster is set up; we explain how ClickHouse replicates and distributes data. |
| Use case | Fictional food-delivery platform with its analytics infrastructure ([ESTADO-EQUIPO.md](ESTADO-EQUIPO.md)). |

## Checklist by section

### 1. Context and motivation

| Requirement | Where | Status |
|---|---|---|
| Type of database | [FUNDAMENTOS.md](FUNDAMENTOS.md), "Fit with the BD2 course"; [PRESENTACION.md](PRESENTACION.md), "Is it NoSQL?" | Done |
| Problems it solves better than other databases | [FUNDAMENTOS.md](FUNDAMENTOS.md), "Experiment that justifies ClickHouse" and "Comparison with a transactional database" | Done |
| Scenarios where it is commonly used | [FUNDAMENTOS.md](FUNDAMENTOS.md), "Where ClickHouse is used": use-case families from the official documentation and companies from the official list of adopters, including some delivery companies | Done |

### 2. Main characteristics

| Requirement | Where | Status |
|---|---|---|
| Data model and representation | [FUNDAMENTOS.md](FUNDAMENTOS.md), "Data model"; [ESTRUCTURA-BD.md](ESTRUCTURA-BD.md); [INFRAESTRUCTURA-ATLAS.md](INFRAESTRUCTURA-ATLAS.md), section 3 | Done |
| Consistency, scalability and availability | [FUNDAMENTOS.md](FUNDAMENTOS.md), "Consistency and availability"; [TEORIA-APLICADA.md](TEORIA-APLICADA.md), CAP, PACELC, idempotency and fault tolerance in Atlas | Done |
| Replication, partitioning and fault tolerance | [FUNDAMENTOS.md](FUNDAMENTOS.md); [REVISION-TEORIA.md](REVISION-TEORIA.md), "P4"; [RESULTADOS-ATLAS.md](RESULTADOS-ATLAS.md), "Integrity and recovery" | Done (explained; running several nodes is optional) |

### 3. Architecture and operation

| Requirement | Where | Status |
|---|---|---|
| Install, deploy or access | [INFRAESTRUCTURA-ATLAS.md](INFRAESTRUCTURA-ATLAS.md), section 2, for Atlas without large downloads; [INSTALACION.md](INSTALACION.md) for the lab with the large datasets | Done. Clean start verified on Windows 11 ([PRUEBAS-EQUIPO.md](PRUEBAS-EQUIPO.md)) |
| Main commands and queries | `sql/atlas_consultas.sql`, `sql/atlas_tracking_consultas.sql`, [DEMO.md](DEMO.md), [DEMO-TRACKING.md](DEMO-TRACKING.md) | Done |
| Tools and client libraries | [FUNDAMENTOS.md](FUNDAMENTOS.md), "Interfaces, clients and tools": interfaces and ports, console, `/play` and `/dashboard`, official libraries, Grafana and why Atlas uses HTTP | Done |

### 4. Live demo

| Requirement | Where | Status |
|---|---|---|
| Real or semi-real datasets | OTTO, REES46, Ele.me and Glovo: [README](../README.md) and [RESULTADOS.md](RESULTADOS.md). In Atlas, simulated traffic (`synthetic`) and manual actions (`demo_live`); without the Glovo catalog a demo catalog is used | Done. The large datasets are only loaded on Jere's computer; the part that uses them must be run from there |
| Insert, query, update and delete | `scripts/crud_demo.py` on the scratch table `delivery.demo_events`. [DEMO-TRACKING.md](DEMO-TRACKING.md) explains why the history is not modified | Partial: the script works (verified on Windows on 19 October), but it still needs to be fitted into the Atlas demo script ([INFRAESTRUCTURA-ATLAS.md](INFRAESTRUCTURA-ATLAS.md), section 7) |
| Connection from a programming language | Python API and publisher (`atlas/`); loading and query scripts (`scripts/`) | Done |
| Simple but representative use case | Delivery Atlas: dashboard at `http://127.0.0.1:8001/`, GPS tracking, simulated and AI customers ([AGENTES-CLIENTES.md](AGENTES-CLIENTES.md)) and the commercial mini-app ([MINIAPP.md](MINIAPP.md)) | Done |
| Multiple nodes | [FUNDAMENTOS.md](FUNDAMENTOS.md) explains `ReplicatedMergeTree`, ClickHouse Keeper and `Distributed` tables | Optional (explained, not set up) |

### 5. Critical reflection

| Requirement | Where | Status |
|---|---|---|
| Strengths and limitations observed | [FUNDAMENTOS.md](FUNDAMENTOS.md), "Data quality and limits"; [TEORIA-APLICADA.md](TEORIA-APLICADA.md), "Advantages and disadvantages of ClickHouse here"; [RESULTADOS-ATLAS.md](RESULTADOS-ATLAS.md), where the aggregate was not faster | Done |
| Comparison with other approaches or traditional databases | [FUNDAMENTOS.md](FUNDAMENTOS.md), "Comparison with a transactional database"; [PRESENTACION.md](PRESENTACION.md), "Talking points for questions" | Done, qualitatively. There is no benchmark against PostgreSQL; the brief does not require one |
| Projects it fits best | [FUNDAMENTOS.md](FUNDAMENTOS.md), comparison table | Done |

## Deliverables

| Deliverable | Where | Status |
|---|---|---|
| 20-minute presentation with the demo | [PRESENTACION.md](PRESENTACION.md) is the old Clickstream Lab script and allocates 20 minutes of presentation plus 10 of demo. [AVANCE-PRESENTACION.md](AVANCE-PRESENTACION.md) is the 5-minute progress update. Slides in `presentaciones/` | Missing: the final 20-minute Delivery Atlas script, with the demo included |
| Documentation | [FUNDAMENTOS.md](FUNDAMENTOS.md), [ESTRUCTURA-BD.md](ESTRUCTURA-BD.md), [INFRAESTRUCTURA-ATLAS.md](INFRAESTRUCTURA-ATLAS.md), [DOCUMENTO-TECNICO-EQUIPO.md](DOCUMENTO-TECNICO-EQUIPO.md) | Done |
| Step-by-step installation | [INFRAESTRUCTURA-ATLAS.md](INFRAESTRUCTURA-ATLAS.md), section 2, and [INSTALACION.md](INSTALACION.md) | Done. Windows test with system, commands, results and common problems in [PRUEBAS-EQUIPO.md](PRUEBAS-EQUIPO.md). Echenique's test on his computer is still missing |
| Guide to run the demo | [DEMO.md](DEMO.md) is the old OTTO lab demo; [DEMO-TRACKING.md](DEMO-TRACKING.md) covers Atlas tracking; [MINIAPP.md](MINIAPP.md), the mini-app | Partial: a single guide following the order of the final demo is missing |
| Additional files | `compose.yaml`, `Dockerfile.atlas`, `sql/`, `atlas/`, `scripts/`, `web/`, `tests/` and screenshots in `docs/capturas/` | Done |

## Evaluation criteria

| Criterion | How we cover it |
|---|---|
| Clarity and structure of the presentation | Depends on the final script and a timed rehearsal |
| Technical understanding | [FUNDAMENTOS.md](FUNDAMENTOS.md) and [ESTRUCTURA-BD.md](ESTRUCTURA-BD.md): `MergeTree` engines, physical order, partitions, materialized views and queue idempotency |
| Real-world use cases, rigorous data use and strong arguments | Separate provenance: real, derived, `synthetic` and `demo_live`. Figures with their conditions in [RESULTADOS.md](RESULTADOS.md) and [RESULTADOS-ATLAS.md](RESULTADOS-ATLAS.md) |
| Quality and relevance of the demo | Full path: mini-app → API → ClickHouse → dashboard, with an order delivered and tracked by GPS |
| Clear and reproducible documentation | Atlas starts with one command and without large datasets; Windows test recorded ([PRUEBAS-EQUIPO.md](PRUEBAS-EQUIPO.md)) |
| Real datasets, programming language and scalability | OTTO, REES46, Ele.me and Glovo; Python; a billion derived rows and an explanation of replicas and shards |
| Creativity of the use case | Fictional delivery platform with AI customers, concurrent traffic and GPS tracking |
| Answering questions and discussion | [PRESENTACION.md](PRESENTACION.md), "Talking points for questions", as the basis for preparing the 10 minutes of questions |

## Pending before the presentation

By priority:

1. **Final 20-minute script** with the demo included, and a timed rehearsal. Update [PRESENTACION.md](PRESENTACION.md), which still describes Clickstream Lab and 20 + 10 minutes.
2. **A single guide for the final demo**, step by step, with CRUD included and a plan B in case something fails.
3. **Echenique's installation test** on his computer, added to [PRUEBAS-EQUIPO.md](PRUEBAS-EQUIPO.md).

Done on 19 October: common uses and clients of ClickHouse in [FUNDAMENTOS.md](FUNDAMENTOS.md); [TEORIA-APLICADA.md](TEORIA-APLICADA.md) updated for Atlas; Windows installation test; LF line endings for `*.sh` in `.gitattributes`; technology confirmed in [ESTADO-EQUIPO.md](ESTADO-EQUIPO.md) and [REVISION-TEORIA.md](REVISION-TEORIA.md); Claude added to the AI-use statement; documentation and the app's interface translated into English.

Written with Claude's help from the project brief and the repository documents; reviewed by Anuar.
