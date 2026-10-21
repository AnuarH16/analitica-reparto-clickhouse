# AI customers, purchases and connected delivery

Extension of 14 October 2026. The AI chooses actions over a fictional catalog; Python validates and executes those actions, creates orders and generates their GPS. These are simulated purchases, with no payments. The actions represent logical clicks in our application, not automation of an external commercial website.

## Start

```bash
docker compose -f compose.yaml --profile atlas --profile ai up -d --build --wait
docker compose -f compose.yaml --profile ai exec -T ollama ollama pull qwen3:0.6b
```

Open http://127.0.0.1:8001/. Choose **Local AI · Ollama**, three customers and the number of couriers you want; click **Start customers and delivery**. The first decision may take a while as the model loads. GPS runs on an independent thread.

The `ai` profile adds Ollama and a persistent volume for the models. It does not publish a model port on the host. Ollama is limited to 2 CPUs and 2 GiB; inference uses two threads and a 2048-token context. [Qwen3:0.6b](https://ollama.com/library/qwen3:0.6b) has a published download of about 523 MB; the Ollama image is downloaded separately. It uses the computer's resources, with no paid API.

The Ollama image is pinned by digest (verified version `0.40.4`); the evidence records its digest and the model's. It does not guarantee identical results across versions. The provider only receives fictional goals, the cart and the local catalog options. [Chat API](https://docs.ollama.com/api/chat) and [structured outputs](https://docs.ollama.com/capabilities/structured-outputs).

## Distinct modes

- **Local AI (ollama):** Qwen proposes an `action`, a `choice` index and a short explanation. The application validates the decision; no code or SQL produced by the model is executed. There is no automatic fallback to a policy if the AI fails.
- **Local policy (policy):** reproducible baseline, explicitly labelled as having no AI model. Useful for tests or a computer without Ollama.
- **Previous fleet only (legacy):** keeps the earlier scenario and the historical generators. Its independent sessions and orders are not reinterpreted as linked purchases.

The `POST /api/simulation/start` API accepts `mode=customers`, `agent_mode=ollama|policy|hybrid|traffic`, `customers` (1-24 for AI/policy; 1-500 for the mass modes), `fleet` (1-150), `interval` (1-10 s) and `seed`. Customers have a session, a budget and a goal. They can search, compare, open products, add to/remove from the cart, buy and abandon. An order waits until a courier is available.

## Identity of the path

```text
customer_id + session_id
   -> app_events (logical clicks)
   -> checkout_event_id + order_id + basket
   -> customer_orders (immutable purchase)
   -> order_events (statuses of the same order)
   -> courier_positions (GPS of that same order_id)
```

A valid checkout adds up `quantity * unit_price` of the products in the cart. It only accepts products from the selected business and a basket within budget. Prices are fictional and frozen at purchase. No separate order is invented after the click.

`customer_activity` stores decisions, a short explanation, phase and provenance (`ollama`, `policy`, `system`). `customer_latest_state` and its materialized view store `argMaxState`; `customer_latest` finalizes the latest state. `customer_orders` links the session to the checkout click and keeps the basket lines.

Browsing events keep the v1 contract and add an optional `order_id`. Retries from old clients without that field keep their normalized payload: a new `null` is not automatically added to the earlier digest. The migration adds remove-from-cart and abandonment actions, without deleting historical rows.

An order created without a courier uses the zero UUID until assignment. An available courier also has the zero UUID as its order; the dashboard shows it as available. Created statuses advance to preparing, pickup, delivery and delivered in about 95 s from assignment; their fictional deadline is creation + 120 s. These are not real delivery times. When it finishes, the courier sets off from the final position towards the next pickup.

## Acceptance, concurrency and errors

`CustomerRuntime` prepares a copy of the business state and sends all the records of an action in a single transaction of the SQLite queue. It only changes the in-memory state if the queue accepts them. This way an error or a full queue does not create a phantom purchase in memory.

The publisher performs one INSERT per table. There is no transaction between ClickHouse and SQLite, nor between those INSERTs; the relationships may appear at slightly different moments. The detail tables use replacement/FINAL and the latest-state views use `argMax`. The protections against retries and late events are kept.

The decision is validated against the customer's current revision: an old response does not buy on another session. Stopping prevents accepting model responses still in flight; inference already sent may finish afterwards. Restarting does not rebuild carts or automatically resume the earlier run; accepted and pending facts do remain in the queue/database.

A maximum of 14 steps per session, five units in the cart, `max(100, customers*2)` active orders and 120 model calls per run. After three consecutive failed decisions, new decisions stop and the dashboard says so; orders already created keep progressing. The call limit also pauses decisions. Stopping and starting creates another run. These are operating limits of a local demo.

## What to look at on the dashboard

- Customers: budget, action, explanation, product/business, cart and order.
- **View delivery:** selects the courier currently carrying that order. Once it no longer carries it, its new position is not attributed to a past delivery.
- Map detail: customer, session and purchase click of the selected order.
- Orders: customer/session and delivery status. The list is still limited to 200.
- Activity: last 30 actions, distinguishing model, policy and system decisions.
- Customer counters: only the selected run, computed from the logical activity log. The browsing panel below keeps the whole Atlas history, labelled separately.

All customer, purchase and route rows are synthetic and read from ClickHouse. The frontend does not move a fleet on its own or fill figures with random data. Controls and the queue reflect process state; the analytical counters reflect what has been published to the database.

## Files

| Part | Code |
|---|---|
| Decisions and local provider | `atlas/customer_agent.py` |
| Cart, checkout, assignment and delivery | `atlas/commerce.py` |
| Threads and acceptance before changing state | `atlas/customer_runtime.py` |
| Compatible start-up | `atlas/simulation.py`, `atlas/server.py` |
| Additive SQL and aggregate states | `sql/atlas_agents.sql` |
| Dashboard reads and links | `atlas/clickhouse.py`, `web/atlas-dashboard.*` |
| Purchase/queue/delivery tests | `tests/test_commerce.py` |

The 17-page and four-page guides describe the earlier stage. This extension adds the checkout-order link that was pending; the manual commercial mini-app and its checkout are a separate interface on top of this backend ([MINIAPP.md](MINIAPP.md)).

## Sharing

Reading uses the existing public routes: `/api/operations` includes customers, decisions and purchases; `/api/simulation` exposes mode/model and safe counters. Read-only access and the gateway token are kept. The gateway must be rebuilt and the new website published to see the extension on Vercel; update the temporary URL if the tunnel has changed. The Ollama API and its controls are not exposed.

## Verification

```bash
python3 -m unittest discover -s tests -v
```

The tests check the real link between click, basket and order; rejection of an empty or repeated checkout; invented budget/options; rollback on a full queue; compatibility of old retries; GPS identity and courier continuity between orders. The test with real AI must record the run/model, a purchase, the relationship in ClickHouse and its delivery; the test policy does not replace that evidence.

### Test verified on the team machine

`docs/evidencia-clientes.json` keeps a purchase decided by the local model, its basket checked against the total, the linked click/session and the positions of the same order up to delivery. Run `python3 scripts/check_customer_agent.py --mode ollama` to repeat it (with no other run active), or add `--existing` to check the current one. Loading the model initially and the decisions take several seconds; millions of AI calls are not made. The massive volume still comes from the historical lab/generators, while the AI feeds the connected live path.

Transient read rejections caused by ClickHouse's global memory limit during background merges were observed. The client retries only reads with code 241, up to twice; a persistent failure is shown on the dashboard. Writes still use the queue and its publisher. This demo does not imply a latency SLA or measure real commercial behaviour.

### Publication and visual review

- Deployed code: `36ea395`, Vercel project `delivery-atlas-demo`, team `contrerasgeremi-gmailcoms-projects`, production environment, status Ready.
- Link: https://delivery-atlas-demo.vercel.app/. The laptop, Ollama, Atlas, ClickHouse and the tunnel must stay on. The controls are at http://127.0.0.1:8001/.
- Verified: three customers from the local run visible through the proxy; HTML without start controls; public POST rejected with 405; no JavaScript errors logged during the visit.
- Desktop and 390 px mobile reviewed: no horizontal overflow of the page. Tables keep horizontal scrolling inside their container.
- Screenshot of the published version: `docs/capturas/clientes-ia-publico.png`; clicking "View delivery" showed the same customer, session, checkout and order in the map detail.
- The earlier desktop/mobile screenshots record the review before the amounts sent to the model were converted to euros. The public screenshot is of the final version. The explanations of a small model can be imprecise; the validation and the purchase total depend on the catalog and the cart, not on that text.

## Concurrent traffic — extension of 14 October

**AI + mass traffic (hybrid)** mode combines the first three customers with Ollama and the rest with an explicitly labelled traffic simulator. Scenario enabled: **200 customers and 80 couriers**. **Traffic simulator (traffic)** mode does not use a model. The earlier AI and policy modes keep their behaviour and are limited to 24 customers; the mass modes accept up to 500 customers and 150 couriers.

The simulator chooses products within budget, can extend or change carts and can also abandon. One in five traffic profiles always browses and abandons: it keeps revisiting the application and produces continuous clicks while others wait for delivery. The rest can also abandon a visit with a configured probability of 12 %. These are demo parameters, not observed rates. Pauses of 1.2–3.8 s per action and staggered starts of up to eight seconds spread the activity. One thread processes all eligible customers in batches every half second: a single copy of the state and one queue transaction per batch, without hundreds of threads or AI calls. A second thread decides for the three AI customers; the GPS thread stays independent. The seed reproduces choices and pauses, but the actual run depends on the clock and on inference.

All purchases still use the same checkout and the same basket, assignment and GPS. The active-order limit becomes `max(100, customers*2)` to allow purchases waiting for a courier. Reaching 120 calls or three Ollama errors pauses only the AI; traffic continues. If the queue is full, the traffic batch is discarded in memory and retried later; a failure of the GPS thread still stops the whole run.

The dashboard shows twelve customers in the summary (the three AI customers and recent activity), with a button to show them all. The counters include the full set. Markers for large fleets are smaller and only the selected one has a number; all of them can be chosen from the list. Their coordinates come from ClickHouse. Initial positions are spread around the catalog's areas so that eighty couriers do not start on twelve overlapping points.

```bash
# After starting the atlas and ai profiles and downloading the model:
curl -X POST http://127.0.0.1:8001/api/simulation/start \
  -H 'Content-Type: application/json' \
  -d '{"mode":"customers","agent_mode":"hybrid","customers":200,"fleet":80,"interval":2,"seed":42}'
python3 scripts/check_traffic.py
```

Stop the previous run with the local control before starting another. `docs/evidencia-trafico.json` records customers, the peak of couriers assigned simultaneously, observed movements, published decisions, deliveries and the queue. It does not represent Uber Eats users or a maximum-capacity benchmark.

The list of 200 orders prioritizes active and assigned ones. The server resolves their purchase links by order_id, even if their checkout is already outside the last 200 purchases, to keep the customer and session on the map. The order counters still include the whole run.

### Clock and concurrent purchases

The load revealed a race: the GPS thread captured `now` before entering the state lock. A purchase could be confirmed during that wait and appear as created after the GPS timestamp. Validation rejected the assignment and stopped ingestion. The clock is now captured inside the lock and after copying the state. The new test holds the GPS while confirming a checkout: it fails with the earlier implementation and passes with the fixed one. All 20 tests pass. The order's time constraints are not relaxed.

The figures in `evidencia-trafico.json` are cumulative per run; its window only measures the observation of movement. `evidencia-enlaces-trafico.json` records, in an earlier run, three links resolved outside the last 200 purchases. The requested GPS interval is still two seconds and the dashboard shows the effective delay.
