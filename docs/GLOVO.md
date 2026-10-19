# Glovo FooDI-ML: provenance and analysis

## Source

[FooDI-ML](https://github.com/Glovo/foodi-ml-dataset) was published by Glovo for research. The official CSV is distributed from the public bucket linked in its repository. The [authors' article](https://arxiv.org/html/2110.02035v2) explains how the sample was built: products that had an image in the app, from 37 countries. The published license is CC BY-NC-SA. The project does not redistribute the CSV or download the images.

The file downloaded on 4 October 2026 was **565,423,032 bytes** with SHA-256:

```text
09180fb4d34347dc210138bed9ef8bab588bc541824223a546d19e139a42f683
```

The size and fingerprint are fixed in `scripts/glovo.py` to detect changes or incomplete downloads. A new version of the dataset would require checking its fields and updating those constants explicitly.

## Granularity and fields

Each CSV row represents a product sample. The ETL loads `source_row`, `country_code`, `city_code`, `store_name`, `product_name`, `collection_section`, `product_description`, `has_description`, `aux_store` and `hier`. The `aux_store` and `hier` values come from the original CSV. `has_description` is derived from whether `product_description` is empty.

The `delivery.glovo_products` table uses `MergeTree ORDER BY (country_code, city_code, store_name, source_row)`. That way the dashboard's country and city filters align with the storage order. The queries group millions of rows with `count()`, `uniqExact()` and `GROUP BY`. It is not joined with the Meituan tables: the datasets share no identifiers, place or period.

## Verified counts

| Scope | Products |
|---|---:|
| All countries | 2,887,444 |
| Spain (`ES`) | 415,137 |
| Barcelona (`ES/BCN`) | 132,568 |
| Madrid (`ES/MAD`) | 68,575 |

Within Spain there are **266 city codes**, **12,633 distinct store names** and **116,475 products with a description** (28.1 %). These are results of the current load, checked against the CSV and ClickHouse.

## Useful queries for the demo

```sql
SELECT count() FROM delivery.glovo_products;
SELECT count() FROM delivery.glovo_products WHERE country_code = 'ES';

SELECT city_code, count() AS products
FROM delivery.glovo_products
WHERE country_code = 'ES'
GROUP BY city_code ORDER BY products DESC LIMIT 10;

SELECT collection_section, count() AS products
FROM delivery.glovo_products
WHERE country_code = 'ES' AND city_code = 'MAD'
GROUP BY collection_section ORDER BY products DESC LIMIT 10;
```

## Limits of interpretation

- There are no clicks, users, orders, prices or timestamps per product. The dashboard measures **catalog supply**, not demand or sales.
- The source includes non-food items. The sections are text entered by stores, not uniform categories.
- Only products that had an image appear. Glovo's complete catalog cannot be estimated from this sample.
- `store_name` is a name, not a unique establishment key. Store metrics count distinct names.
- The 9.5 million cited by the authors are text samples associated with the products; the loaded CSV contains 2,887,444 product rows.
