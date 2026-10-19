# Data

The files go in `datos/` and **are not committed to git** (they weigh hundreds of MB). Each member downloads them from the original sources.

| Source | What it contains | What we can claim | Use |
|---|---|---|---|
| [MT-LIFT (Meituan)](https://mtdjdsp.github.io/MT-LIFT/) | 5,541,842 real records of campaigns from a food-delivery app, with click and conversion | Which promotions generate clicks and purchases | Main dataset |
| [Madrid business premises census](https://datos.madrid.es/dataset/209548-0-censo-locales-historico) | Premises with activity, district and location | That the app's restaurants exist | `restaurantes` table |
| [Criteo Uplift v2.1](https://huggingface.co/datasets/criteo/criteo-uplift) | 13,979,592 real rows from a randomized **advertising** experiment: treatment, exposure, visit and conversion | How much a campaign increases visits and purchases (uplift) | **Loaded.** Provisional until MT-LIFT arrives (access requested on Drive) |
| [OTTO](https://github.com/otto-de/recsys-dataset) | 216.7 M real click, cart and order events per session (e-commerce) | Real paths and abandonment | Plan B if the professor requires real paths |
| Our app | Clicks we make during the demo (`origen = 'app_real'`) | That the system works end to end | `eventos_app` |
| `scripts/simular_sesiones.py` | Generated sessions (`origen = 'simulado'`) | **Nothing about real users**: only a scale test | `eventos_app` |

## Limit that must be explained

MT-LIFT records clicks and conversions of **promotions**, but does not say whether the user went through search, menu or cart. The funnel by section comes from our app and the simulated sessions. MT-LIFT users and our app's users are different: **they are not joined**.

## Loading Criteo

1. Download `criteo-uplift-v2.1.csv` (the `.csv.gz` from Hugging Face, 311 MB, decompresses to 3.2 GB).
2. Put it in `datos/criteo-uplift-v2.1.csv`.
3. `bash scripts/cargar_criteo.sh` → about 20 s; it should finish by printing `13979592`.

In ClickHouse it takes **262 MB** (1.27 GB uncompressed): the label columns, which are in the sort key, shrink to a few KB.

## Pending

- [ ] MT-LIFT: Drive requires permission (requested on 30 Sep); the other official source is Baidu
      (https://pan.baidu.com/s/1YmE5g-Y71ULNptiWqpToPA?pwd=06nb, requires an account). Once we have it: check its real columns and write `scripts/cargar_mtlift.sql`
      (table `mtlift_promos`, `ENGINE = MergeTree ORDER BY (tratamiento, fila)`).
- [ ] Download the census, filter the hospitality businesses and write `scripts/cargar_censo.sql`
      (table `restaurantes`).
