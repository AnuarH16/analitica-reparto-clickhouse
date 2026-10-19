// Run with node --test tests/test_delivery_ui.cjs (no third-party dependencies).
const assert = require('node:assert/strict');
const {readFileSync} = require('node:fs');
const {join} = require('node:path');
const {webcrypto} = require('node:crypto');
const vm = require('node:vm');
const {test} = require('node:test');

// Small DOM double: production cart rendering still creates and disables its buttons.
class Element {
  constructor() { this.disabled = false; this.dataset = {}; this.children = []; this.parts = new Map(); this.attrs = {}; }
  querySelector(selector) {
    if (selector === '.empty') return null;
    if (!this.parts.has(selector)) this.parts.set(selector, new Element());
    return this.parts.get(selector);
  }
  querySelectorAll() {
    if (!this.buttons) this.buttons = [new Element(), new Element()];
    return this.buttons;
  }
  replaceChildren(...children) { this.children = children; }
  prepend(child) { this.children.unshift(child); }
  append(...children) { this.children.push(...children); }
  addEventListener() {}
  setAttribute(name, value) { this.attrs[name] = value; }
  removeAttribute(name) { delete this.attrs[name]; }
}

function fixture() {
  const nodes = new Map();
  const node = id => { if (!nodes.has(id)) nodes.set(id, new Element()); return nodes.get(id); };
  const steps = Array.from({length: 5}, () => new Element());
  const cleared = [];
  const ctx = vm.createContext({crypto: webcrypto, console,
    document: {getElementById: node, createElement: () => new Element(),
      querySelectorAll: selector => selector === '#cart-lines button'
        ? node('cart-lines').children.flatMap(li => li.querySelectorAll('button'))
        : selector === '#steps li' ? steps : []},
    window: {scrollTo() {}}, clearInterval: id => cleared.push(id),
  });
  const source = readFileSync(join(__dirname, '../web/delivery.js'), 'utf8');
  // Don't run page bootstrap; each test supplies its catalog and controls the network.
  const boot = source.lastIndexOf('state.customer = customerId();');
  assert.ok(boot > 0);
  vm.runInContext(source.slice(0, boot), ctx);
  const app = vm.runInContext(`({state, checkout, renderCart, addToCart, removeFromCart, abandon, pollOrder})`, ctx);
  vm.runInContext('track = () => {}; startTracking = () => {};', ctx);
  Object.assign(app.state, {customer: webcrypto.randomUUID(), session: webcrypto.randomUUID(), view: 'cart',
    restaurants: [{restaurant_id: 'shop', name: 'Shop'}],
    products: [{product_id: 'meal', restaurant_id: 'shop', product_name: 'Meal', price_minor: 900}]});
  app.state.cart.set('meal', 2);
  app.renderCart();
  return {ctx, app, node, steps, cleared};
}

function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return {promise, resolve, reject};
}
const reply = (status, data) => ({status, ok: status < 400, json: async () => data});

test('confirmation locks cart mutations, rerenders and repeated checkout until acceptance', async () => {
  const {ctx, app, node} = fixture();
  const pending = deferred();
  const bodies = [];
  ctx.fetch = (url, options) => { bodies.push(JSON.parse(options.body)); return pending.promise; };
  const first = app.checkout();
  assert.equal(node('checkout').disabled, true);
  assert.equal(node('abandon').disabled, true);
  assert.equal(node('back').disabled, true);
  assert.ok(node('cart-lines').children[0].buttons.every(button => button.disabled));
  app.removeFromCart('meal');
  assert.equal(app.addToCart(app.state.products[0]), false);
  app.abandon();
  app.renderCart();
  assert.equal(app.state.cart.get('meal'), 2);
  assert.equal(node('checkout').disabled, true);
  await app.checkout();
  assert.equal(bodies.length, 1);
  pending.resolve(reply(202, {order_id: bodies[0].order_id, run_id: 'run', amount_minor: 1800}));
  await first;
  assert.equal(app.state.cart.size, 0);
  assert.equal(app.state.order.order_id, bodies[0].order_id);
  assert.equal(app.state.confirming, false);
  assert.equal(node('back').disabled, false);
});

for (const failure of ['network', '503', '409']) {
  test(`after ${failure}, controls unlock and unchanged cart retries the same order`, async () => {
    const {ctx, app, node} = fixture();
    const bodies = [];
    ctx.fetch = async (url, options) => {
      bodies.push(JSON.parse(options.body));
      if (bodies.length === 1) {
        if (failure === 'network') throw new Error('response lost');
        return reply(Number(failure), {error: 'try again', code: 'no_customer_run'});
      }
      return reply(200, {order_id: bodies[1].order_id, run_id: 'run', amount_minor: 1800});
    };
    await app.checkout();
    assert.equal(node('checkout').disabled, false);
    assert.equal(node('abandon').disabled, false);
    assert.equal(app.state.cart.get('meal'), 2);
    await app.checkout();
    assert.deepEqual(bodies[1], bodies[0]);
    assert.equal(app.state.cart.size, 0);
  });
}

for (const status of ['delivered', 'cancelled']) {
  test(`tracking finds a ${status} order excluded from the 200 active dashboard orders`, async () => {
    const {ctx, app, steps, cleared} = fixture();
    app.state.order = {run_id: webcrypto.randomUUID(), order_id: webcrypto.randomUUID()};
    app.state.poll = 7;
    const requests = [];
    ctx.fetch = async url => {
      requests.push(url);
      const target = new URL(url, 'http://localhost');
      if (target.pathname === '/api/operations') return reply(200, {
        orders: Array.from({length: 200}, (_, i) => ({order_id: 'other-' + i, status: 'preparing'})), truncated: true});
      assert.equal(target.pathname, '/api/order');
      assert.equal(target.searchParams.get('run_id'), app.state.order.run_id);
      assert.equal(target.searchParams.get('order_id'), app.state.order.order_id);
      return reply(200, {order: {...app.state.order, status}});
    };
    await app.pollOrder();
    assert.equal(requests.length, 1);
    assert.deepEqual(cleared, [7]);
    if (status === 'delivered') assert.ok(steps.every(step => step.dataset.done === 'yes'));
  });
}

test('tracking waits for publication and avoids overlapping or obsolete requests', async () => {
  const {ctx, app, steps, cleared, node} = fixture();
  app.state.order = {run_id: 'run', order_id: 'order'};
  const pending = deferred();
  let calls = 0;
  ctx.fetch = () => { calls += 1; return pending.promise; };
  const poll = app.pollOrder();
  await app.pollOrder();
  assert.equal(calls, 1);
  pending.resolve(reply(200, {order: null}));
  await poll;
  assert.equal(cleared.length, 0);
  const old = deferred();
  ctx.fetch = () => old.promise;
  const obsolete = app.pollOrder();
  app.state.order = {run_id: 'new-run', order_id: 'new-order'};
  node('order-live').textContent = 'New order';
  old.resolve(reply(200, {order: {status: 'delivered'}}));
  await obsolete;
  assert.equal(node('order-live').textContent, 'New order');
  assert.equal(cleared.length, 0);
  assert.ok(steps.every(step => !step.dataset.done));
});
