# Ele.me: food-delivery recommendations

## Source and integration status

[Recommendation Data From Ele.me, Tianchi, ID 131047](https://tianchi.aliyun.com/dataset/131047).
Official page consulted on: **5 October 2026**.

- The description declares **128 million training samples** from D1–D7 and **18 million test samples** from D8: 146 million samples, **not clicks**.
- They come from the recommender of Ele.me, a food-delivery platform in China. They do not represent Uber Eats, Glovo or Spain.
- The first column is a binary label: positive if there was a click, negative otherwise. The sampling procedure is not specified well enough to interpret its proportion as the app's real CTR.
- Anonymous user, restaurant, product and context attributes are published, along with histories of up to 50 items from the previous 30 days.
- The description splits each day into ten parts. The visible list showed **70 ZIPs**, corresponding to D1–D6 and D8. **D7 did not appear**; the full availability of the 146 million must be verified before promising that volume.
- Each listed ZIP takes about 4–5 GB. The visible collection amounts to roughly 330 GB compressed; it has not been downloaded or measured locally. Start with one part, without extracting the full ZIP.
- The download requires logging in to Tianchi and accepting its terms of use. Access was verified with an international account **without linking a bank card**. Alibaba Cloud's payment step was not needed for this download.
- **First official file downloaded:** `D1_0.csv.zip`, 4,993,698,626 compressed bytes. It contains `D1_0.csv`, 16,411,347,014 bytes uncompressed. Its structure has been inspected: comma-separated CSV, no header, 39 fields in the order described by the publisher. Binary label; `hours` integer 0–23; `time_type` contains `breakfast`, `lunch`, `tea`, `dinner`, `night` in the first rows. The full load verifies the remaining rows and the ZIP's CRC.
- The page shows a CC BY-NC-SA 4.0 license label, but the visible license links are not consistent with it. Review the effective terms on Tianchi before redistributing the files. This integration links to the source and does not redistribute its data.

## What is integrated

- `sql/eleme.sql`: the `delivery.eleme_samples` table and a staging table with the same schema.
- `scripts/eleme.py`: inspection, strict validation, batch import of up to 25,000 rows **or 32 MiB** and publishing of complete files with `MOVE PARTITION`.
- `/eleme.html` and `/api/eleme`: samples actually loaded, positive labels, positive ratio, approximate users, relative days, hours, anonymous cities and imported files.
- `/scale.html`: rows and size on disk for Ele.me, separate from the OTTO + REES46 total.

The format of **D1_0.csv** has been checked against its rows and the attribute order in the official description. Another file having 39 columns does not prove its order. `--confirm-layout` records that the operator checked the correspondence before loading; it must not be used to skip this check.

## Download and inspection

1. Log in to the official page, review the terms and download one part, for example `D1_0.csv.zip`.
2. Save it in `data/eleme/` (ignored by Git).
3. Inspect its structure:

```bash
python3 scripts/eleme.py inspect data/eleme/D1_0.csv.zip
```

Tab, comma, vertical bar and control-A are tried. A separator is only accepted automatically if it produces 39 fields in the first rows. The script does not print the users' histories. If the format is different, adapt the parser to the evidence of the real file; do not invent fields or reinterpret data arbitrarily.

The order is: label; eight user attributes; thirteen candidate attributes; twelve history lists; five context attributes. `FIELDS` contains their names. Verify a header or the documentation associated with the file. `hours` must be between 0 and 23; `times` is kept literally. The first rows contain values compatible with Unix seconds from April 2022; no time zone is assigned based on the country's name without verifying it.

## Loading after checking the format

```bash
docker compose up -d
python3 scripts/eleme.py init
python3 scripts/eleme.py load data/eleme/D1_0.csv.zip --day 1 --confirm-layout
python3 scripts/eleme.py status
python3 dashboard.py
```

`--delimiter comma` specifies the separator verified in D1_0.csv. Reading the ZIP is sequential and does not extract files to disk. Each field is kept in `raw_features` and typed columns are projected for the queries. The histories make a JSON row take about 9 KiB in the initial sample; the byte limit per batch keeps the client's memory bounded.

Inserts use ClickHouse's HTTP API from Python (`urllib`), with `JSONEachRow`, one thread, parallel parsing disabled and blocks of up to 4,096 rows. The native client inside Docker is used to create tables and move partitions. An insert error is not blindly retried: resuming checks the rows the server has confirmed, including possible partial inserts by block.

The file's SHA-256 fingerprint and its member name identify a partition. A second load of the same file skips the samples already published. The local manifest records fingerprint, member, day and rows. The same content must not be renamed, recompressed or reorganized and presented as a new dataset: the per-file check does not detect semantic duplicates across different files.

If a row fails, the partition stays in staging and **does not reach the dashboard**. A new attempt rebuilds only that staging partition. `--resume-staging` makes it possible to continue if the count, minimum, maximum and distinct values of `source_row` prove a sequence without gaps or duplicates. The ZIP is read again from the start to check its CRC; inserts already confirmed are skipped. After validating the complete file and cross-checking rows, `MOVE PARTITION` publishes the partition to the analysis table. Only one importer runs at a time, with a local lock. There is no materialized view on this table: moving parts does not trigger insert views.

The loader pauses merges on the large tables and resumes them when it finishes, also on an exception. If the process is killed, resume them with `SYSTEM START MERGES` for the five tables in the loader's `tables` list. For Ele.me's wide samples, the schema reduces `merge_max_block_size` to 512 rows and limits the candidate size of a merge to 256 MiB. This was adjusted after a real total-memory-limit error on the Docker machine with about 4 GiB; resuming keeps the confirmed batches.

## Measuring columnar storage

After completing the load:

```bash
python3 scripts/eleme_report.py
```

The script measures the count of positive clicks using the `clicked` column: three queries, one thread and the SQL cache disabled. It records rows/bytes read, median, column sizes and the numeric validity of the timestamps in `data/eleme-benchmark.json`. It pauses Ele.me merges during the measurements; the operating system cache stays enabled. The times are local measurements.

**Verified result:** 38,914 positive clicks over 2,170,299 rows, median of **0.0581 seconds** (three runs: 0.0753 / 0.0550 / 0.0581 seconds). Each run reported 2,170,299 rows and 426,681 bytes read. These bytes are the server statistic; they do not represent the size of the CSV file or the table's whole storage.

The equivalent query extracting `clicked` from `raw_features` **did not finish**: it hit the server's total memory limit of 3.50 GiB. The last failed run had read 1,561,645 rows and 12,785,529,641 bytes. There is no final time, no verified equality of answers between both methods and no measured speed-up factor. The report keeps that earlier failure from the server log with its query identifier, separate from the current measurements.

To also try that wide read, optionally:

```bash
python3 scripts/eleme_report.py --include-raw
```

The script saves the error if it fails. It uses blocks of up to 256 rows, preferred sizes of 1 MiB and read buffers of 256 KiB; even with these settings the full query failed on this machine. `raw_features` is a **String** with JSON: this test does not evaluate the native `JSON` type, its subcolumns or PostgreSQL. The observed limit offers a reflection on projecting useful columns and sizing memory, without demonstrating that ClickHouse cannot process JSON.

## Queries to explain ClickHouse

```sql
SELECT sample_day, count() AS samples, sum(clicked) AS positive_clicks,
       round(100.0 * positive_clicks / samples, 2) AS positive_pct
FROM delivery.eleme_samples
GROUP BY sample_day ORDER BY sample_day;

SELECT request_hour, city_id, count() AS samples, sum(clicked) AS clicks
FROM delivery.eleme_samples
WHERE sample_day = 1
GROUP BY request_hour, city_id
ORDER BY samples DESC LIMIT 20;

SELECT table, sum(rows), sum(bytes_on_disk)
FROM system.parts
WHERE database = 'delivery' AND table IN ('eleme_samples', 'eleme_staging') AND active
GROUP BY table;
```

`PARTITION BY source_id` is chosen to publish and recover complete files of this finite corpus (a few dozen parts), **not** as a recommendation to partition a continuous application by event or by user. `ORDER BY (sample_day, city_id, request_hour, category_id, shop_id, source_row)` favours filters that start with day and city. Different physical orders have not been compared: to do so, measure `read_rows`, `read_bytes` and time on the same real file.

## Real time and limits

These files are historical. The dashboard queries ClickHouse when a filter is applied; it is not connected to the Ele.me platform. The project's existing real-time flow is still the labelled OTTO replay and the new clicks on the demo page. Do not duplicate the samples' histories to announce billions of unique clicks.

Local infrastructure validation can use an artificial fixture in scratch tables and delete it afterwards. That fixture does not establish the real dataset's format nor increase the counts shown to the professor. Real validation has been performed on the first complete official ZIP, in addition to the earlier infrastructure test.

**Local check performed on 5 October 2026:** an artificial fixture of 25,001 rows went through two batches and was published with `MOVE PARTITION` into separate scratch tables. Repeating the load kept 25,001 rows; a second file with one invalid row left its previous 25,000 rows in staging without publishing them. The scratch tables were deleted afterwards. The real API responded `samples=0`, `clicks=0`, `empty=true`, and the dashboard showed the download as pending. No fixture was loaded into `delivery.eleme_samples`.

## First real load verified

File `D1_0.csv.zip`, member `D1_0.csv`, read in full and with the CRC verified by `zipfile`:

| Measure | Result |
|---|---:|
| Samples published | 2,170,299 |
| Positive click labels | 38,914 |
| Positive ratio in this part | 1.79 % |
| Estimated distinct users (`uniqCombined64`) | 1,344,158 |
| Estimated distinct restaurants (`uniqCombined64`) | 421,934 |
| Rows pending in staging at the end | 0 |

SHA-256 of the ZIP: `b94bbbb9d9bd3e46d1dda796d87610765f4079fc829d788629bbc5b3a3fa16e5`. Fingerprint computed locally for traceability; it is not presented as a fingerprint published by Tianchi.

| Period | Samples | Positive labels |
|---|---:|---:|
| Lunch (`lunch`) | 730,137 | 12,738 |
| Dinner (`dinner`) | 718,594 | 13,011 |
| Night (`night`) | 447,494 | 8,366 |
| Breakfast (`breakfast`) | 175,257 | 2,969 |
| Afternoon snack (`tea`) | 98,817 | 1,830 |

The five groups add up exactly to the published samples and positive labels. D2–D8 remain unloaded; the dashboard shows zero when filtering by those days. These samples are not added to the OTTO and REES46 event total.
