'use strict';
// Delivery Atlas commercial mini-app.
// Records every action with the v1 contract (atlas/contract.py) on POST /api/events
// and confirms the order on POST /api/checkout, which delivers it in the simulation.

const SOURCE = 'delivery-miniapp';
const KIND = 'demo_live';
const SOL = [40.4169, -3.7035];                       // Puerta del Sol
const STATUS_ORDER = ['created', 'preparing', 'picked_up', 'en_route', 'delivered'];
const $ = id => document.getElementById(id);
const money = minor => new Intl.NumberFormat('en-IE', {style: 'currency', currency: 'EUR'}).format(minor / 100);
const clock = () => new Date().toLocaleTimeString('en-GB');

const state = {
  restaurants: [], products: [], city: 'madrid',
  query: '', filters: new Set(),
  shop: null, product: null,
  cart: new Map(),                                     // product_id -> quantity (a single restaurant)
  session: null, customer: null,
  order: null, poll: null, view: 'home', confirming: false,
};

// ── Identity ──────────────────────────────────────────────
// customer_id is kept in this browser; session_id is new on every visit/order.
function customerId() {
  let id = null;
  try { id = localStorage.getItem('atlas_customer_id'); } catch (e) { /* storage blocked */ }
  if (!id) { id = crypto.randomUUID(); try { localStorage.setItem('atlas_customer_id', id); } catch (e) {} }
  return id;
}
function newSession() {
  state.session = crypto.randomUUID();
  $('session-id').textContent = state.session.slice(0, 8);
}

// ── Sending events ────────────────────────────────────────
// An event is built ONCE: a retry reuses the same object (same event_id and
// same time), so the API recognizes it as a duplicate and does not count it twice.
const outbox = [];
let sending = false;

function track(type, section, extra = {}) {
  const event = {
    schema_version: 1, event_id: crypto.randomUUID(), session_id: state.session,
    event_time: new Date().toISOString(), event_type: type, section,
    city_id: state.city, user_id: state.customer, source: SOURCE, source_kind: KIND, ...extra,
  };
  const ticket = addTicket(type, extra);
  outbox.push({event, ticket, attempts: 0});
  flush();
  return event;
}

async function flush() {
  if (sending) return;
  sending = true;
  while (outbox.length) {
    const item = outbox[0];
    item.attempts += 1;
    setTicket(item.ticket, 'sending', item.attempts > 1 ? `Retry ${item.attempts - 1}` : 'Sending');
    let response = null, data = {};
    try {
      response = await fetch('/api/events', {method: 'POST', headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({events: [item.event]}), cache: 'no-store'});
      data = await response.json().catch(() => ({}));
    } catch (e) { response = null; }
    if (response && (response.status === 202 || response.status === 200)) {
      setTicket(item.ticket, 'ok', response.status === 202 ? 'Queued · 202' : 'Already recorded · 200');
      outbox.shift();
    } else if (response && response.status !== 503 && response.status < 500) {
      // 400/409: the event is not valid. Retrying will not fix it; show the reason.
      setTicket(item.ticket, 'fail', `Not saved · ${response.status} ${data.error || ''}`.trim());
      outbox.shift();
    } else if (item.attempts >= 6) {
      setTicket(item.ticket, 'fail', 'Not saved · the API is not responding');
      outbox.shift();
    } else {
      // Network down or queue full (503): wait with backoff and resend the SAME event.
      setTicket(item.ticket, 'retry', `No response · retrying in ${2 ** item.attempts} s`);
      await new Promise(r => setTimeout(r, 1000 * 2 ** item.attempts));
    }
  }
  sending = false;
}

const LABELS = {
  search: 'Search', filter_applied: 'Filter applied', restaurant_opened: 'Restaurant opened',
  product_opened: 'Product opened', cart_added: 'Added to cart', cart_removed: 'Removed from cart',
  session_abandoned: 'Session abandoned', order_submitted: 'Order placed',
};
function addTicket(type, extra) {
  const list = $('tape');
  list.querySelector('.empty')?.remove();
  const li = document.createElement('li');
  const detail = extra.product_id ? productName(extra.product_id) : extra.restaurant_id ? shopName(extra.restaurant_id) : '';
  li.innerHTML = `<time></time><strong></strong><span class="detail"></span><span class="state"></span>`;
  li.querySelector('time').textContent = clock();
  li.querySelector('strong').textContent = LABELS[type] || type;
  li.querySelector('.detail').textContent = [type, detail].filter(Boolean).join(' · ');
  list.prepend(li);
  return li;
}
function setTicket(li, kind, text) {
  li.dataset.state = kind;
  li.querySelector('.state').textContent = text;
}

// ── Catalog ───────────────────────────────────────────────
const shopName = id => state.restaurants.find(r => r.restaurant_id === id)?.name || id;
const productName = id => state.products.find(p => p.product_id === id)?.product_name || id;
const menuOf = id => state.products.filter(p => p.restaurant_id === id);
const distance = (r) => Math.hypot((r.latitude - SOL[0]) * 111.3, (r.longitude - SOL[1]) * 84.3);   // approx. km

async function loadCatalog() {
  try {
    const response = await fetch('/api/demo-catalog', {cache: 'no-store'});
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || `HTTP ${response.status}`);
    state.restaurants = data.restaurants; state.products = data.products;
    const cities = [...new Set(state.restaurants.map(r => r.city_id))];
    $('city').replaceChildren(...cities.map(c => new Option(c[0].toUpperCase() + c.slice(1), c)));
    state.city = cities[0] || 'madrid';
    renderHome();
  } catch (error) {
    $('restaurants').innerHTML = '';
    notice(`The catalog could not be loaded (${error.message}). Check that the Atlas API is running.`);
  }
}

function visibleRestaurants() {
  const q = state.query.toLowerCase();
  let list = state.restaurants.filter(r => r.city_id === state.city);
  if (q) list = list.filter(r => r.name.toLowerCase().includes(q) || menuOf(r.restaurant_id).some(p => p.product_name.toLowerCase().includes(q)));
  if (state.filters.has('cheap')) list = list.filter(r => menuOf(r.restaurant_id).some(p => p.price_minor <= 1000));
  if (state.filters.has('near')) list = [...list].sort((a, b) => distance(a) - distance(b));
  return list;
}

function monogram(name) {
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return {text: name.split(' ').filter(w => w.length > 2).map(w => w[0]).join('').slice(0, 2).toUpperCase(),
          style: `--mono:${hue}`};
}

function renderHome() {
  const list = visibleRestaurants();
  const parts = [];
  if (state.query) parts.push(`"${state.query}"`);
  if (state.filters.has('cheap')) parts.push('dishes up to €10');
  if (state.filters.has('near')) parts.push('sorted by distance to Puerta del Sol');
  $('result-note').textContent = `${list.length} ${list.length === 1 ? 'restaurant' : 'restaurants'}${parts.length ? ' · ' + parts.join(', ') : ''}`;
  $('restaurants').replaceChildren(...list.map(r => {
    const menu = menuOf(r.restaurant_id);
    const from = Math.min(...menu.map(p => p.price_minor));
    const li = document.createElement('li');
    const button = document.createElement('button');
    button.type = 'button';
    const mono = monogram(r.name);
    button.innerHTML = `<span class="monogram" style="${mono.style}"></span><span class="info"><strong></strong><small></small></span><span class="from"></span>`;
    button.querySelector('.monogram').textContent = mono.text;
    button.querySelector('strong').textContent = r.name;
    button.querySelector('small').textContent = `${menu.length} dishes · ${distance(r).toFixed(1)} km from Sol`;
    button.querySelector('.from').textContent = `from ${money(from)}`;
    button.addEventListener('click', () => openShop(r.restaurant_id));
    li.append(button);
    return li;
  }));
  if (!list.length) $('restaurants').innerHTML = '<li class="empty">No restaurant matches. Try another search or remove a filter.</li>';
}

// ── Navigation ────────────────────────────────────────────
function show(view) {
  state.view = view;
  for (const v of ['home', 'restaurant', 'cart', 'order']) $('view-' + v).hidden = v !== view;
  $('back').hidden = view === 'home' || view === 'order';
  $('city').disabled = state.cart.size > 0 || view === 'order';
  renderCartBar();
  window.scrollTo({top: 0});
}

function openShop(id) {
  state.shop = state.restaurants.find(r => r.restaurant_id === id);
  track('restaurant_opened', 'restaurants', {restaurant_id: id});
  const mono = monogram(state.shop.name);
  $('shop-mono').textContent = mono.text; $('shop-mono').style = mono.style;
  $('shop-name').textContent = state.shop.name;
  $('shop-meta').textContent = `${distance(state.shop).toFixed(1)} km from Sol · fictional restaurant`;
  renderMenu();
  show('restaurant');
}

function renderMenu() {
  $('menu').replaceChildren(...menuOf(state.shop.restaurant_id).map(p => {
    const li = document.createElement('li');
    const qty = state.cart.get(p.product_id) || 0;
    li.innerHTML = `<button type="button" class="dish"><strong></strong><span></span></button><span class="in-cart"></span>`;
    li.querySelector('strong').textContent = p.product_name;
    li.querySelector('.dish span').textContent = money(p.price_minor);
    li.querySelector('.in-cart').textContent = qty ? `${qty} in cart` : '';
    li.querySelector('.dish').addEventListener('click', () => openProduct(p.product_id));
    return li;
  }));
}

function openProduct(id) {
  state.product = state.products.find(p => p.product_id === id);
  track('product_opened', 'menu', {restaurant_id: state.product.restaurant_id, product_id: id});
  $('product-name').textContent = state.product.product_name;
  $('product-price').textContent = money(state.product.price_minor);
  $('product-origin').textContent = state.product.name_kind === 'public_historical'
    ? "Name taken from Glovo's public catalog; fictional price." : 'Fictional dish and price.';
  $('product').showModal();
}

// ── Cart ──────────────────────────────────────────────────
function cartShop() { return state.cart.size ? state.products.find(p => p.product_id === state.cart.keys().next().value).restaurant_id : null; }
function cartTotal() { let t = 0; for (const [id, q] of state.cart) t += state.products.find(p => p.product_id === id).price_minor * q; return t; }
function cartUnits() { let n = 0; for (const q of state.cart.values()) n += q; return n; }

function addToCart(product) {
  if (state.confirming) return false;
  const owner = cartShop();
  if (owner && owner !== product.restaurant_id) {
    notice(`Your cart is from ${shopName(owner)}. Finish that order or empty the cart to order here.`);
    return false;
  }
  if ((state.cart.get(product.product_id) || 0) >= 10 || cartUnits() >= 20) {
    notice('Maximum 10 units of a dish and 20 per order.');
    return false;
  }
  state.cart.set(product.product_id, (state.cart.get(product.product_id) || 0) + 1);
  pendingCheckout = null;                               // a different basket = a different order
  track('cart_added', 'cart', {restaurant_id: product.restaurant_id, product_id: product.product_id});
  notice('');
  return true;
}
function removeFromCart(id) {
  if (state.confirming) return;
  const product = state.products.find(p => p.product_id === id);
  const left = (state.cart.get(id) || 0) - 1;
  if (left > 0) state.cart.set(id, left); else state.cart.delete(id);
  pendingCheckout = null;
  track('cart_removed', 'cart', {restaurant_id: product.restaurant_id, product_id: id});
}

function renderCartBar() {
  const show = state.cart.size > 0 && (state.view === 'home' || state.view === 'restaurant');
  $('cart-bar').hidden = !show;
  $('cart-count').textContent = `${cartUnits()} ${cartUnits() === 1 ? 'item' : 'items'}`;
  $('cart-bar-total').textContent = money(cartTotal());
}

function renderCart() {
  const owner = cartShop();
  $('cart-shop').textContent = owner ? shopName(owner) : 'The cart is empty.';
  $('cart-lines').replaceChildren(...[...state.cart].map(([id, q]) => {
    const p = state.products.find(x => x.product_id === id);
    const li = document.createElement('li');
    li.innerHTML = `<span class="name"></span><span class="qty"><button type="button" aria-label="Remove one">−</button><output></output><button type="button" aria-label="Add one">+</button></span><span class="sub"></span>`;
    li.querySelector('.name').textContent = p.product_name;
    li.querySelector('output').textContent = q;
    li.querySelector('.sub').textContent = money(p.price_minor * q);
    const [minus, plus] = li.querySelectorAll('button');
    minus.addEventListener('click', () => { removeFromCart(id); renderCart(); });
    plus.addEventListener('click', () => { if (addToCart(p)) renderCart(); });
    return li;
  }));
  $('cart-total').textContent = money(cartTotal());
  updateCheckoutControls();
  if (!state.cart.size && state.view === 'cart') { show(state.shop ? 'restaurant' : 'home'); if (state.shop) renderMenu(); }
}

function abandon() {
  if (state.confirming) return;
  if (state.cart.size) track('session_abandoned', 'session');
  state.cart.clear(); state.shop = null; state.query = ''; state.filters.clear();
  $('search').value = '';
  document.querySelectorAll('.chip').forEach(c => c.setAttribute('aria-pressed', 'false'));
  newSession();
  renderHome(); show('home');
}

// ── Checkout ──────────────────────────────────────────────
// The order (order_id, checkout_event_id, time) is fixed once. If the network fails and
// the button is pressed again, the same order is resent: the API returns 200 and creates no other.
let pendingCheckout = null;

function updateCheckoutControls() {
  $('checkout').disabled = state.confirming || !state.cart.size;
  $('checkout').textContent = state.confirming ? 'Placing order…' : 'Place order';
  $('abandon').disabled = state.confirming || !state.cart.size;
  $('back').disabled = state.confirming;
  document.querySelectorAll('#cart-lines button').forEach(button => { button.disabled = state.confirming; });
}

async function checkout() {
  if (state.confirming) return;
  const owner = cartShop();
  if (!owner) return;
  pendingCheckout ??= {
    order_id: crypto.randomUUID(), customer_id: state.customer, session_id: state.session,
    checkout_event_id: crypto.randomUUID(), event_time: new Date().toISOString(), restaurant_id: owner,
    items: [...state.cart].map(([product_id, quantity]) => ({product_id, quantity})),
  };
  const body = pendingCheckout;
  state.confirming = true;
  updateCheckoutControls();
  const ticket = addTicket('order_submitted', {restaurant_id: owner});
  setTicket(ticket, 'sending', 'Sending to /api/checkout');
  try {
    const response = await fetch('/api/checkout', {method: 'POST', headers: {'Content-Type': 'application/json'},
      body: JSON.stringify(body), cache: 'no-store'});
    const data = await response.json().catch(() => ({}));
    if (response.status === 202 || response.status === 200) {
      setTicket(ticket, 'ok', response.status === 202 ? 'Order queued · 202' : 'Order already recorded · 200');
      pendingCheckout = null;
      state.order = {...data, items: body.items, restaurant_id: owner, created: new Date()};
      state.cart.clear();
      startTracking();
      return;
    }
    if (response.status === 409 && data.code === 'no_customer_run') {
      // Nothing was created: the order can be placed again with the same data.
      setTicket(ticket, 'fail', 'Not saved · no delivery running');
      notice('Your order needs the delivery simulation to be running. Open the dashboard (link below), choose "Local test policy" or "Local AI · Ollama" and click "Start customers and delivery". Then place the order again.', true);
    } else {
      // 400 = basket not valid for the current catalog: this attempt is discarded.
      if (response.status < 500) pendingCheckout = null;
      setTicket(ticket, 'fail', `Not saved · ${response.status}`);
      notice(`The order was not placed: ${data.error || 'error ' + response.status}.`);
    }
  } catch (e) {
    setTicket(ticket, 'retry', 'No response · place the order again');
    notice('No connection to the API. Your order is not confirmed; click "Place order" again and the same order will be resent.');
  } finally {
    state.confirming = false;
    updateCheckoutControls();
  }
}

// ── Tracking ──────────────────────────────────────────────
function startTracking() {
  const o = state.order;
  $('order-title').textContent = `Order from ${shopName(o.restaurant_id)}`;
  $('order-meta').textContent = `${money(o.amount_minor)} · order ${o.order_id.slice(0, 8)} · price computed by the API from the catalog`;
  $('order-live').textContent = 'Order accepted into the queue. Waiting for ClickHouse to publish it…';
  paintSteps(null);
  show('order');
  clearInterval(state.poll);
  state.poll = setInterval(pollOrder, 2000);
  pollOrder();
}

function paintSteps(status) {
  const reached = STATUS_ORDER.indexOf(status);
  const finished = status === 'delivered';             // delivered = every step completed
  document.querySelectorAll('#steps li').forEach((li, i) => {
    li.dataset.done = i < reached || (finished && i === reached) ? 'yes' : 'no';
    if (i === reached && !finished) li.setAttribute('aria-current', 'step'); else li.removeAttribute('aria-current');
  });
}

async function pollOrder() {
  const o = state.order;
  if (!o || o.polling) return;
  o.polling = true;
  try {
    const response = await fetch(`/api/order?run_id=${encodeURIComponent(o.run_id)}&order_id=${encodeURIComponent(o.order_id)}`, {cache: 'no-store'});
    const data = await response.json();
    if (state.order !== o) return;
    if (!response.ok) throw new Error(data.error || response.status);
    const row = data.order;
    if (!row) return;
    paintSteps(row.status);
    const courier = row.courier_id && !/^0{8}-/.test(row.courier_id) ? `courier ${row.courier_id.slice(0, 8)}` : 'looking for a courier';
    $('order-live').textContent = row.status === 'cancelled' ? 'Order cancelled in the simulation.'
      : `Read from ClickHouse at ${clock()} · ${courier}`;
    if (row.status === 'delivered' || row.status === 'cancelled') clearInterval(state.poll);
  } catch (error) {
    if (state.order === o) $('order-live').textContent = `The status could not be queried (${error.message}). Retrying every 2 s.`;
  } finally {
    o.polling = false;
  }
}

// ── Utilities and start-up ────────────────────────────────
function notice(text, withLink = false) {
  $('notice').hidden = !text;
  $('notice').textContent = text;
  if (withLink && text) {
    const a = document.createElement('a');
    a.href = '/'; a.target = '_blank'; a.rel = 'noopener'; a.textContent = 'Open the operations dashboard';
    $('notice').append(' ', a);
  }
}

function bind() {
  $('search-form').addEventListener('submit', event => {
    event.preventDefault();
    state.query = $('search').value.trim().slice(0, 80);
    track('search', 'search');
    renderHome();
  });
  document.querySelectorAll('.chip').forEach(chip => chip.addEventListener('click', () => {
    const name = chip.dataset.filter;
    const on = !state.filters.has(name);
    on ? state.filters.add(name) : state.filters.delete(name);
    chip.setAttribute('aria-pressed', String(on));
    if (on) track('filter_applied', 'search');          // removing a filter is not "applying" one
    renderHome();
  }));
  $('city').addEventListener('change', () => { state.city = $('city').value; renderHome(); });
  $('back').addEventListener('click', () => {
    if (state.view === 'cart' && state.shop) { renderMenu(); show('restaurant'); }
    else { renderHome(); show('home'); }
  });
  $('add').addEventListener('click', () => {
    if (addToCart(state.product)) { $('product').close(); renderMenu(); renderCartBar(); }
    else $('product').close();
  });
  $('cart-bar').addEventListener('click', () => { renderCart(); show('cart'); });
  $('checkout').addEventListener('click', checkout);
  $('abandon').addEventListener('click', abandon);
  $('again').addEventListener('click', () => {
    clearInterval(state.poll); state.order = null; state.shop = null;
    newSession(); renderHome(); show('home');
  });
  // Closing the tab with items in the cart = abandonment. sendBeacon survives the close.
  window.addEventListener('pagehide', () => {
    if (!state.cart.size || state.view === 'order') return;
    const event = {schema_version: 1, event_id: crypto.randomUUID(), session_id: state.session,
      event_time: new Date().toISOString(), event_type: 'session_abandoned', section: 'session',
      city_id: state.city, user_id: state.customer, source: SOURCE, source_kind: KIND};
    navigator.sendBeacon?.('/api/events', new Blob([JSON.stringify({events: [event]})], {type: 'application/json'}));
  });
}

state.customer = customerId();
newSession();
bind();
loadCatalog();
