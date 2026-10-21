"""Write the measured class handout from verified manifests and benchmarks."""

import json
from pathlib import Path

from rees46 import MANIFEST, MONTHS
from scale import REPORT as SCALE_REPORT
from benchmark import REPORT as QUERY_REPORT

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "docs" / "RESULTS.md"


def fmt(value: int) -> str:
    return f"{int(value):,}"


def gib(value: int) -> str:
    return f"{int(value) / 2**30:.2f} GiB"


def readable_bytes(value: int) -> str:
    size = int(value)
    if size >= 2**30:
        return gib(size)
    if size >= 2**20:
        return f"{size / 2**20:.2f} MiB"
    return f"{size / 2**10:.2f} KiB"


def main() -> None:
    manifest = json.loads(MANIFEST.read_text())
    scale = json.loads(SCALE_REPORT.read_text())
    benchmark = json.loads(QUERY_REPORT.read_text())
    if set(manifest) != set(MONTHS):
        raise RuntimeError("The REES46 manifest does not contain the seven months")
    months = [manifest[month] for month in MONTHS]
    rees_total = sum(int(item["rows"]) for item in months)
    rees_views = sum(int(item["views"]) for item in months)
    rees_carts = sum(int(item["carts"]) for item in months)
    rees_purchases = sum(int(item["purchases"]) for item in months)
    otto_total = int(benchmark["counts"]["otto_real"])
    if int(benchmark["counts"]["rees46_real"]) != rees_total:
        raise RuntimeError("REES46 in the benchmark and in the manifest do not match")
    if int(benchmark["counts"]["scale_derived"]) != int(scale["stress_rows"]):
        raise RuntimeError("The stress table and the benchmark do not match")

    lines = [
        "# Results measured on this machine", "",
        f"Benchmark date (UTC): {benchmark['measured_at_utc']}.", "",
        "## Provenance and size", "",
        f"- OTTO: **{fmt(otto_total)} real events**, including **194,720,954 clicks**. Source: [OTTO publication](https://github.com/otto-de/recsys-dataset).",
        f"- REES46: **{fmt(rees_total)} real events** over seven months. Source: [REES46 publication](https://data.rees46.com/).",
        f"  - Breakdown: **{fmt(rees_views)} views**, **{fmt(rees_carts)} carts** and **{fmt(rees_purchases)} purchases**. Views are not OTTO clicks.",
        f"- Arithmetic sum of both real archives: **{fmt(otto_total + rees_total)} rows** from **two different populations**; they are not a single clickstream.",
        f"- Stress test: **{fmt(scale['stress_rows'])} derived rows**, five scenarios created from OTTO; they do not represent new users or events.",
        "", "| REES46 file | Events | Views | Carts | Purchases | Compressed |", "|---|---:|---:|---:|---:|---:|",
    ]
    for month, item in zip(MONTHS, months):
        lines.append(f"| {month} | {fmt(item['rows'])} | {fmt(item['views'])} | "
                     f"{fmt(item['carts'])} | {fmt(item['purchases'])} | {gib(item['compressed_bytes'])} |")
    lines += ["", "The compressed sizes come from the publisher's files. The loader read each gzip to the end, validated the CSV and cross-checked its rows with ClickHouse.",
              "", "## Measured queries", "",
              "The benchmark disabled the query cache. The OTTO queries were run three times and the median is shown; the other queries, once. The daily result of the archive and of the aggregate was compared row by row before saving the report.",
              "", "| Query | Seconds | Rows read | Bytes read |", "|---|---:|---:|---:|" ]
    titles = {"otto_raw_daily": "Raw OTTO, day/type", "otto_rollup_daily": "Aggregated OTTO, day/type",
              "rees46_month": "REES46 October, types", "scale_scenarios": "Derived scenarios"}
    for name, title in titles.items():
        result = benchmark["queries"][name]
        first = result["runs"][0]
        lines.append(f"| {title} | {result['median_seconds']:.4f} | {fmt(first['rows_read'])} | "
                     f"{readable_bytes(first['bytes_read'])} |")
    raw = benchmark["queries"]["otto_raw_daily"]
    rollup = benchmark["queries"]["otto_rollup_daily"]
    ratio = raw["median_seconds"] / rollup["median_seconds"] if rollup["median_seconds"] else 0
    lines += ["", f"On this machine and for this question, the aggregate was **{ratio:.1f} times** faster by median time. The figure is local and depends on storage, the operating system cache and concurrent load; the main contrast is also the rows and bytes read.",
              "", "## Table sizes", "", "| Table | Rows | Compressed on disk |", "|---|---:|---:|"]
    for part in benchmark["table_parts"]:
        lines.append(f"| `{part['table']}` | {fmt(part['rows'])} | {readable_bytes(part['bytes_on_disk'])} |")
    if benchmark.get("measurement_notes"):
        lines += ["", f"Additional conditions: {benchmark['measurement_notes']}"]
    lines += ["", "## Read plan for REES46 October", "", "```text",
              benchmark["explain_rees46_october_partition"].rstrip(), "```", "",
              f"Environment: {benchmark['environment']}.", "",
              "**Interpretation:** OTTO contains clicks; REES46 contains product views, carts and purchases. The stress table contains labelled copies. The replay inserts historical events today, without changing their original date.", ""]
    OUTPUT.write_text("\n".join(lines))
    print(f"Report written: {OUTPUT}")


if __name__ == "__main__":
    main()
