-- Read while the simulator is running. Run in clickhouse-client.
SHOW CREATE TABLE delivery_atlas.courier_positions;
SHOW CREATE TABLE delivery_atlas.courier_latest_mv;

-- Pick one run. Do not combine fleets from earlier runs.
SELECT simulation_run_id, max(event_time) AS last_event, uniqExact(courier_id) AS couriers
FROM delivery_atlas.courier_positions
GROUP BY simulation_run_id ORDER BY last_event DESC;

-- Latest position computed from incremental states.
SELECT simulation_run_id, courier_id, order_id, latitude, longitude, event_time,
       dateDiff('second',event_time,now()) AS age_seconds
FROM delivery_atlas.courier_latest
ORDER BY event_time DESC LIMIT 12;

-- Grouped by run by default, so amounts from different fleets are not mixed.
SELECT simulation_run_id,status,count() AS orders,
       sum(amount_minor)/100 AS fictional_amount_eur
FROM delivery_atlas.order_latest
GROUP BY simulation_run_id,status ORDER BY simulation_run_id,status;

-- Compare physical rows and logical IDs: there may be retries.
SELECT simulation_run_id,count() AS physical_rows,uniqExact(event_id) AS logical_positions
FROM delivery_atlas.courier_positions
GROUP BY simulation_run_id;

-- Fictional catalog enrichment with provenance per field.
SELECT product_id,product_name,price_minor,price_kind,name_kind,source_table,source_row
FROM delivery_atlas.demo_products FINAL LIMIT 8;
