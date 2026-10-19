# Enunciado del proyecto y checklist de la entrega

Fecha: 19/10/2026. Resume con nuestras palabras lo que pide el enunciado del proyecto final de BD2. Para cada requisito indica dónde está en el repositorio y su estado. El texto original es del profesor y no se copia aquí porque el repositorio es público.

**Estados:** **Hecho** (cubierto y documentado), **Parcial** (existe, pero hay que completarlo o actualizarlo), **Falta** y **Opcional**.

## Qué pide el enunciado

Cada grupo investiga a fondo una base de datos NoSQL, explica sus fundamentos y enseña un caso práctico en el que se vean sus ventajas.

- **Fecha de la presentación:** 15/11/2026.
- **Formato:** 30 minutos por grupo. Son 20 de presentación técnica, con la demo en directo dentro, y unos 10 de preguntas.
- **Entregables:**
  1. La presentación con la demo.
  2. Documentos `.md` con la documentación, la instalación paso a paso y una guía para ejecutar la demo. Deben bastar para que otro estudiante reproduzca la demo y entienda los fundamentos.
  3. Los ficheros adicionales necesarios: código, imágenes, `yml`, etc.
- **Contenido mínimo:** contexto y motivación, características principales, arquitectura y funcionamiento, demo en directo y reflexión crítica. Los subpuntos del enunciado son sugerencias; se valora ampliarlos.
- **Ideas de demo que propone:** una miniapp que use la base como backend, un flujo de datos típico, un escenario en tiempo real o una visualización con filtros y paneles. Delivery Atlas combina las cuatro.

## Decisiones confirmadas con el profesor

| Tema | Decisión |
|---|---|
| Tecnología | **ClickHouse**, indicada por el profesor. Queda resuelta la duda sobre la sección «Personas» que recogen [ESTADO-EQUIPO.md](ESTADO-EQUIPO.md) y [REVISION-TEORIA.md](REVISION-TEORIA.md). En la presentación conviene explicar igualmente el matiz: es un almacén columnar OLAP que usa SQL ([FUNDAMENTOS.md](FUNDAMENTOS.md)). |
| Duración | 20 minutos de presentación **con la demo dentro** y unos 10 de preguntas. |
| Varios nodos | **Opcional.** No se monta un clúster; se explica cómo replica y reparte datos ClickHouse. |
| Caso de uso | Plataforma ficticia de comida a domicilio con su infraestructura analítica ([ESTADO-EQUIPO.md](ESTADO-EQUIPO.md)). |

## Checklist por apartado

### 1. Contexto y motivación

| Requisito | Dónde | Estado |
|---|---|---|
| Tipo de base de datos | [FUNDAMENTOS.md](FUNDAMENTOS.md), «Encaje en BD2»; [PRESENTACION.md](PRESENTACION.md), «¿Es NoSQL?» | Hecho |
| Qué problemas resuelve mejor que otras bases | [FUNDAMENTOS.md](FUNDAMENTOS.md), «Experimento que justifica ClickHouse» y «Comparación con una base transaccional» | Hecho |
| Escenarios en los que se usa habitualmente | Solo se explica nuestro caso. Falta un apartado, con fuentes, sobre usos típicos fuera del proyecto: analítica web y de producto, logs y observabilidad, métricas en series temporales… | Falta |

### 2. Características principales

| Requisito | Dónde | Estado |
|---|---|---|
| Modelo de datos y representación | [FUNDAMENTOS.md](FUNDAMENTOS.md), «Modelo de datos»; [ESTRUCTURA-BD.md](ESTRUCTURA-BD.md); [INFRAESTRUCTURA-ATLAS.md](INFRAESTRUCTURA-ATLAS.md), apartado 3 | Hecho |
| Consistencia, escalabilidad y disponibilidad | [FUNDAMENTOS.md](FUNDAMENTOS.md), «Consistencia y disponibilidad»; [TEORIA-APLICADA.md](TEORIA-APLICADA.md), CAP y PACELC | Parcial: `TEORIA-APLICADA.md` describe la versión anterior con Flask y Grafana (`app/app.py`, `01_tablas.sql`), no Atlas |
| Replicación, particionado y tolerancia a fallos | [FUNDAMENTOS.md](FUNDAMENTOS.md); [REVISION-TEORIA.md](REVISION-TEORIA.md), «P4»; [RESULTADOS-ATLAS.md](RESULTADOS-ATLAS.md), «Integridad y recuperación» | Hecho (explicado; montar varios nodos es opcional) |

### 3. Arquitectura y funcionamiento

| Requisito | Dónde | Estado |
|---|---|---|
| Instalar, desplegar o acceder | [INFRAESTRUCTURA-ATLAS.md](INFRAESTRUCTURA-ATLAS.md), apartado 2, para Atlas sin descargas grandes; [INSTALACION.md](INSTALACION.md) para el laboratorio con los datasets grandes | Hecho. Arranque de Atlas desde cero comprobado en Windows 11 el 14/10, con los tests en verde |
| Comandos y consultas principales | `sql/atlas_consultas.sql`, `sql/atlas_tracking_consultas.sql`, [DEMO.md](DEMO.md), [DEMO-TRACKING.md](DEMO-TRACKING.md) | Hecho |
| Herramientas y librerías cliente | Se usan `clickhouse-client`, la interfaz HTTP y Python con `urllib`. [DOCUMENTO-TECNICO-EQUIPO.md](DOCUMENTO-TECNICO-EQUIPO.md) cita `clickhouse-connect` en la versión anterior | Parcial: falta presentar las opciones (consola, HTTP, protocolo nativo, librerías de Python y de otros lenguajes, Grafana…) y explicar por qué usamos HTTP |

### 4. Demo en directo

| Requisito | Dónde | Estado |
|---|---|---|
| Datasets reales o semirreales | OTTO, REES46, Ele.me y Glovo: [README](../README.md) y [RESULTADOS.md](RESULTADOS.md). En Atlas, tráfico simulado (`synthetic`) y acciones manuales (`demo_live`); sin el catálogo de Glovo se usa uno de demo | Hecho. Los datasets grandes solo están cargados en el ordenador de Jere; la parte que los use debe hacerse desde ahí |
| Insertar, consultar, actualizar y borrar | `scripts/crud_demo.py` sobre la tabla de ensayo `delivery.demo_events`. [DEMO-TRACKING.md](DEMO-TRACKING.md) explica por qué no se modifica el histórico | Parcial: el script existe, pero falta encajarlo en el guion de la demo de Atlas ([INFRAESTRUCTURA-ATLAS.md](INFRAESTRUCTURA-ATLAS.md), apartado 7) |
| Conexión desde un lenguaje de programación | API y publicador en Python (`atlas/`); scripts de carga y consulta (`scripts/`) | Hecho |
| Caso de uso sencillo y representativo | Delivery Atlas: panel en `http://127.0.0.1:8001/`, seguimiento GPS, clientes simulados y con IA ([AGENTES-CLIENTES.md](AGENTES-CLIENTES.md)) y miniapp comercial (`docs/MINIAPP.md`, en el PR de Anuar) | Hecho; la miniapp está pendiente de merge |
| Varios nodos | [FUNDAMENTOS.md](FUNDAMENTOS.md) explica `ReplicatedMergeTree`, ClickHouse Keeper y tablas `Distributed` | Opcional (explicado, no montado) |

### 5. Reflexión crítica

| Requisito | Dónde | Estado |
|---|---|---|
| Fortalezas y limitaciones observadas | [FUNDAMENTOS.md](FUNDAMENTOS.md), «Calidad del dato y límites»; [TEORIA-APLICADA.md](TEORIA-APLICADA.md), «Ventajas y desventajas de ClickHouse aquí»; [RESULTADOS-ATLAS.md](RESULTADOS-ATLAS.md), donde el agregado no fue más rápido | Hecho |
| Comparación con otros enfoques o bases tradicionales | [FUNDAMENTOS.md](FUNDAMENTOS.md), «Comparación con una base transaccional»; [PRESENTACION.md](PRESENTACION.md), «Argumentos para preguntas» | Hecho, de forma cualitativa. No hay benchmark contra PostgreSQL; el enunciado no lo exige |
| Proyectos en los que encaja mejor | [FUNDAMENTOS.md](FUNDAMENTOS.md), tabla de comparación | Hecho |

## Entregables

| Entregable | Dónde | Estado |
|---|---|---|
| Presentación de 20 minutos con la demo | [PRESENTACION.md](PRESENTACION.md) es el guion antiguo de Clickstream Lab y reparte 20 minutos de presentación más 10 de demo. [AVANCE-PRESENTACION.md](AVANCE-PRESENTACION.md) es el avance de 5 minutos en inglés. Diapositivas en `presentaciones/` | Falta el guion final de Delivery Atlas en 20 minutos, con la demo dentro |
| Documentación | [FUNDAMENTOS.md](FUNDAMENTOS.md), [ESTRUCTURA-BD.md](ESTRUCTURA-BD.md), [INFRAESTRUCTURA-ATLAS.md](INFRAESTRUCTURA-ATLAS.md), [DOCUMENTO-TECNICO-EQUIPO.md](DOCUMENTO-TECNICO-EQUIPO.md) | Hecho |
| Instalación paso a paso | [INFRAESTRUCTURA-ATLAS.md](INFRAESTRUCTURA-ATLAS.md), apartado 2, e [INSTALACION.md](INSTALACION.md) | Parcial: falta la prueba en otro ordenador con registro de sistema, comandos y resultados (`docs/PRUEBAS-EQUIPO.md` en [PLAN-EQUIPO.md](PLAN-EQUIPO.md)) y notas para Windows (`python` en vez de `python3`, saltos de línea) |
| Guía para ejecutar la demo | [DEMO.md](DEMO.md) es la demo antigua del laboratorio OTTO; [DEMO-TRACKING.md](DEMO-TRACKING.md) cubre el seguimiento de Atlas; `docs/MINIAPP.md`, la miniapp | Parcial: falta una guía única que siga el orden de la demo final |
| Ficheros adicionales | `compose.yaml`, `Dockerfile.atlas`, `sql/`, `atlas/`, `scripts/`, `web/`, `tests/` y capturas en `docs/capturas/` | Hecho |

## Criterios de evaluación

| Criterio | Cómo lo cubrimos |
|---|---|
| Claridad y estructura de la presentación | Pendiente del guion final y de un ensayo cronometrado |
| Comprensión técnica | [FUNDAMENTOS.md](FUNDAMENTOS.md) y [ESTRUCTURA-BD.md](ESTRUCTURA-BD.md): motores `MergeTree`, orden físico, particiones, vistas materializadas e idempotencia de la cola |
| Casos reales, rigor con los datos y argumentos | Procedencia separada: real, derivado, `synthetic` y `demo_live`. Cifras con sus condiciones en [RESULTADOS.md](RESULTADOS.md) y [RESULTADOS-ATLAS.md](RESULTADOS-ATLAS.md) |
| Calidad y relevancia de la demo | Recorrido completo: miniapp → API → ClickHouse → panel, con un pedido entregado y seguido por GPS |
| Documentación clara y reproducible | Atlas arranca con una orden y sin datasets grandes; falta la prueba en otro ordenador |
| Datasets reales, lenguaje de programación y escalabilidad | OTTO, REES46, Ele.me y Glovo; Python; mil millones de filas derivadas y explicación de réplicas y shards |
| Creatividad del caso | Plataforma de reparto ficticia con clientes con IA, tráfico concurrente y seguimiento GPS |
| Responder preguntas y debatir | [PRESENTACION.md](PRESENTACION.md), «Argumentos para preguntas», como base para preparar los 10 minutos de preguntas |

## Pendiente antes de presentar

Por prioridad:

1. **Guion final de 20 minutos** con la demo dentro, y ensayo cronometrado. Actualizar [PRESENTACION.md](PRESENTACION.md), que aún describe Clickstream Lab y 20 + 10 minutos.
2. **Guía única de la demo final**, paso a paso y con plan B por si algo falla.
3. **Integrar la miniapp** (PR de Anuar) en la rama del equipo.
4. **Meter el CRUD en la demo de Atlas.**
5. **Probar la instalación en otro ordenador** y registrar el resultado. Añadir `*.sh text eol=lf` a `.gitattributes` para que los scripts de shell no fallen al clonar en Windows.
6. **Completar la teoría:** usos habituales de ClickHouse, herramientas y librerías cliente, y actualizar [TEORIA-APLICADA.md](TEORIA-APLICADA.md) a Atlas.
7. **Actualizar [ESTADO-EQUIPO.md](ESTADO-EQUIPO.md) y [REVISION-TEORIA.md](REVISION-TEORIA.md):** la tecnología ya está confirmada.
8. **Declarar el uso de IA**, como pide la guía docente ([REVISION-TEORIA.md](REVISION-TEORIA.md), «Preparación académica»). Añadir Claude, usado para la miniapp y para este documento.

Redactado con ayuda de Claude a partir del enunciado y de los documentos del repositorio; revisado por Anuar.
