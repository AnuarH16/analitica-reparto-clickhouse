-- Commercial mini-app (web/delivery.*). Additive migration: it neither deletes nor rewrites rows.
-- A manual purchase is stored in customer_orders with source_kind = 'demo_live'.
-- Its preparation, courier and GPS remain synthetic (order_events and
-- courier_positions keep 'synthetic'). Adding a value at the end of an Enum8
-- is a metadata-only change in ClickHouse.
ALTER TABLE delivery_atlas.customer_orders
    MODIFY COLUMN source_kind Enum8('synthetic'=1, 'demo_live'=2);
