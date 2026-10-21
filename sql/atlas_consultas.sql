-- Logical count, independent of merges.
SELECT count() AS events FROM delivery_atlas.app_events FINAL;

-- Aggregate for the dashboard. Each key can have several physical rows.
SELECT event_date, city_id, event_type, source_kind, sum(events) AS events
FROM delivery_atlas.app_daily_counts
GROUP BY event_date, city_id, event_type, source_kind
ORDER BY event_date, city_id, event_type, source_kind;

-- Physical structure inspection, not to be confused with logical events.
SELECT table, sum(rows) AS physical_rows,
       formatReadableSize(sum(bytes_on_disk)) AS disk
FROM system.parts WHERE database = 'delivery_atlas' AND active
GROUP BY table ORDER BY table;

-- A single node provides no replicas and no horizontal sharding.
SELECT version(), hostName();
