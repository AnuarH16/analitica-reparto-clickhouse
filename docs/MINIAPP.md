# Delivery Atlas commercial mini-app

Owner: Anuar. Date: 14 October 2026. Files: `web/delivery.html`, `web/delivery.js`, `web/delivery.css`.

A person places an order in a fictional delivery app in Madrid. Every action is recorded in ClickHouse. The confirmed order enters the same delivery simulation as the AI customers: a courier is assigned and it is tracked by GPS until delivery. Restaurants, prices, couriers and positions are fictional. There is no login and no payment.

## Start

```bash
docker compose -f compose.yaml --profile atlas up -d --build --wait
```

1. Open the dashboard at http://127.0.0.1:8001/. In the "Live customers and delivery" section, choose a mode under "Decisions": **Local test policy** or **Traffic simulator** (neither needs Ollama), or **AI + mass traffic**. Then click "Start customers and delivery".
2. Open the mini-app at http://127.0.0.1:8001/delivery.html.
3. Search, filter, open a restaurant, add dishes and click **Place order**.

If no customer simulation is running, checkout returns 409 and creates nothing. The mini-app explains this and links to the dashboard. Browsing is recorded anyway.

## What is recorded

Everything carries `source = delivery-miniapp` and `source_kind = demo_live`: these are new actions performed by a person in a fictional business.

| Action in the app | `event_type` | `section` | Extra fields |
|---|---|---|---|
| Search | `search` | `search` | — |
| Turn on a filter (turning it off does not count) | `filter_applied` | `search` | — |
| Open a restaurant | `restaurant_opened` | `restaurants` | `restaurant_id` |
| Open a dish | `product_opened` | `menu` | `restaurant_id`, `product_id` |
| Add to / remove from cart | `cart_added` / `cart_removed` | `cart` | `restaurant_id`, `product_id` |
| Empty the cart or close the tab with items in it | `session_abandoned` | `session` | — |
| Place the order | `order_submitted` | `checkout` | `restaurant_id`, `order_id` |

- **Identifiers:** `session_id` is new on every visit and after every order. `user_id` is a UUID stored in the browser (`localStorage`); if the browser blocks it, the app keeps working and a new one is generated each time.
- **Impressions:** not recorded (`product_impression`), following the team plan: it is still undefined when a product counts as visible.
- **Sending events:** each event is sent to `POST /api/events` as soon as it happens. The right-hand column ("Events in this session") shows the API's real response:
  - 202: queued.
  - 200: already recorded.
  - 400/409: not saved, and the reason is shown.
  - Network error or 503: retried with exponential backoff, up to 6 attempts.

## Retries without double counting

An event is built only once. A retry resends the same object, with the same `event_id` and the same time, so the queue recognizes it as a duplicate and returns 200.

Checkout works the same way: `order_id`, `checkout_event_id` and the time are fixed on the first attempt. If the network drops and the button is pressed again, the same order is resent and the API returns 200 without creating another. If the basket changes, it is a different order.

While waiting for the checkout response, quantities, emptying the cart, going back and placing the order again are locked. They are unlocked when the response arrives or the connection fails; a retry without changing the basket keeps the same identifiers.

## Checkout: `POST /api/checkout`

```json
{
  "order_id": "…uuid…", "customer_id": "…uuid…", "session_id": "…uuid…",
  "checkout_event_id": "…uuid…", "event_time": "2026-10-14T15:44:23.120Z",
  "restaurant_id": "fictional-madrid-12",
  "items": [{"product_id": "fictional-madrid-12-product-1", "quantity": 1}]
}
```

The browser sends only identifiers and quantities. **The API computes the price and the total** from the run's catalog: a client cannot set the price or mix restaurants. Limits: 1 to 10 units per dish and 20 per order.

| Response | Meaning |
|---|---|
| 202 | Order accepted into the queue. Returns `run_id`, `order_id` and `amount_minor` |
| 200 | Retry of an order that was already accepted |
| 400 | Basket or identifiers not valid for the catalog |
| 409 `no_customer_run` | No customer simulation is running; nothing was created |

A purchase produces three records, in the same queue commit:

1. `app_events`: the `order_submitted` click (`demo_live`), with `order_id`.
2. `customer_orders`: the basket with catalog prices, `decision_mode = 'manual'` and `source_kind = 'demo_live'`. To store that value, `sql/atlas_miniapp.sql` adds `demo_live` to the Enum. It is an additive change that does not rewrite rows.
3. `order_events`: the `created` status. Afterwards, the simulator assigns a courier and publishes `preparing` → `picked_up` → `en_route` → `delivered` and the GPS positions. All of that remains labelled `synthetic`.

The tracking screen queries `GET /api/order?run_id=…&order_id=…` every 2 s and draws the status it reads from ClickHouse. Both parameters must be UUIDs and appear only once. The response contains `order: null` while the order has not been published yet. The query looks for that order within that run and keeps finding it even when it falls outside the dashboard's 200 orders. On the dashboard, it appears as "Mini-app (manual)".

## Regression tests

```bash
python3 -m unittest discover -s tests -v
node --test tests/test_delivery_ui.cjs
```

The JavaScript tests use Node with no additional dependencies. They cover basket changes and concurrent confirmations, retries, delivery/cancellation outside the dashboard window and stale tracking responses.

The tracking integration test is enabled with `ATLAS_TEST_CLICKHOUSE_URL`, which must point to a **disposable** ClickHouse 25.8 instance with the demo credentials. It creates one delivered order and 200 more active ones, publishes the events through the queue and checks over HTTP that the delivered order can still be queried even though the dashboard leaves it out. Example with a temporary container without volumes:

```bash
docker run -d --rm --name atlas-miniapp-test -p 127.0.0.1:18124:8123 -e CLICKHOUSE_DB=delivery -e CLICKHOUSE_USER=demo -e CLICKHOUSE_PASSWORD=demo clickhouse/clickhouse-server:25.8
# Wait until ClickHouse responds before running the tests.
ATLAS_TEST_CLICKHOUSE_URL=http://127.0.0.1:18124 python3 -m unittest discover -s tests -v
docker stop atlas-miniapp-test
```

## Check in ClickHouse

```sql
-- Mini-app actions (logical count)
SELECT event_type, uniqExact(event_id) FROM delivery_atlas.app_events
WHERE source = 'delivery-miniapp' GROUP BY event_type;

-- Purchase click → basket → statuses of the same order
SELECT o.order_id, o.amount_minor, o.items, e.event_type
FROM delivery_atlas.customer_orders AS o FINAL
JOIN delivery_atlas.app_events AS e FINAL ON e.event_id = o.checkout_event_id
WHERE o.decision_mode = 'manual';

SELECT status, courier_id, event_time FROM delivery_atlas.order_events FINAL
WHERE order_id = '<order_id>' ORDER BY event_time;
```

## Verification on 14 October

Tests: `python3 -m unittest discover -s tests -v`. All 28 pass, including the 8 in `tests/test_miniapp.py`.

End-to-end test in Chromium, with ClickHouse 25.8 and the Atlas API, using the simulation with the local policy and 8 couriers:
- **Path:** a search, 2 filters, a restaurant, 3 dishes opened, 3 added, 1 removed and checkout. That makes 12 `demo_live` events in `app_events`, matching the `app_daily_counts` aggregate.
- **Purchase:** the `order_submitted` click links to the purchase (`checkout_event_id`) and to its `order_id`. The total of €22.67 was computed by the API.
- **Delivery:** the order went through 6 statuses until `delivered` in about 97 s, with 49 GPS positions from its courier.
- **Screen:** the tracking view showed the five steps read from ClickHouse.

It was repeated on Gere2's concurrent-traffic commit, in "Traffic simulator" mode with 200 customers and 80 couriers. The manual order was delivered among 239 simulated orders and kept its provenance (`manual` / `demo_live` versus `traffic` / `synthetic`). About 14,000 events were accepted during the run, with no duplicates or publishing errors.

## Limits

- **Catalog:** it is the demo catalog (12 restaurants and 36 dishes). Without the Glovo catalog loaded, all restaurants share the same three dish names, so searching by dish matches almost all of them.
- **Cities:** Madrid only. The city selector is filled with the cities in the catalog.
- **Tracking:** it is schematic (no road network), like the rest of the simulated tracking.
