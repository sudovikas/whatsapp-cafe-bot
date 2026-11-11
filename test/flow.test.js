const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers');

let t;
before(async () => { t = await boot(); });
after(() => t.close());

const C1 = '919811111111', C2 = '919822222222', C3 = '919833333333', C4 = '919844444444';
const to = (out, who) => out.map(t.view).filter(m => m.to === who);

test('webhook handshake accepts the right token and rejects a wrong one', async () => {
  const ok = await fetch(`${t.url}/webhook?hub.mode=subscribe&hub.verify_token=verify-me&hub.challenge=4242`);
  assert.equal(ok.status, 200); assert.equal(await ok.text(), '4242');
  const bad = await fetch(`${t.url}/webhook?hub.mode=subscribe&hub.verify_token=nope&hub.challenge=1`);
  assert.equal(bad.status, 403);
});

test('full UPI + delivery order, start to finish', async () => {
  let r = await t.text(C1, 'hi');
  let m = to(r.out, C1);
  assert.match(m[0].text, /Hey Rahul/);
  assert.deepEqual(m.filter(x => x.image).map(x => x.image), ['https://bot.example/public/menu-burgers.jpg', 'https://bot.example/public/menu-pizzas.jpg']);

  r = await t.text(C1, '2 cheese burgers and 1 margarita');           // typo + missing size
  m = to(r.out, C1);
  assert.match(m[0].text, /Which size for \*1 × Margherita Pizza\*/);
  assert.deepEqual(m[0].titles, ['Small ₹90', 'Medium ₹160', 'Large ₹220']);

  r = await t.tap(C1, 'size:medium');
  m = to(r.out, C1);
  assert.match(m[0].text, /2 × Cheese Burger — ₹140/);
  assert.match(m[0].text, /1 × Margherita Pizza \(Medium\) — ₹160/);
  assert.match(m[0].text, /Total: ₹300/);

  r = await t.text(C1, '1 cold coffee');                                // add to existing cart
  assert.match(to(r.out, C1)[0].text, /Total: ₹360/);

  r = await t.tap(C1, 'cart:confirm');
  assert.deepEqual(to(r.out, C1)[0].buttons, ['ful:delivery', 'ful:pickup', 'ful:back']);
  r = await t.tap(C1, 'ful:delivery');
  assert.match(to(r.out, C1)[0].text, /delivery address/);
  r = await t.text(C1, 'B-12 Gangotri Nagar, near Canara Bank');
  assert.deepEqual(to(r.out, C1)[0].buttons, ['pay:upi', 'pay:cash']);
  assert.match(to(r.out, C1)[0].text, /₹360/);

  r = await t.tap(C1, 'pay:upi');
  m = to(r.out, C1);
  const order = t.orders().at(-1);
  assert.match(order.id, /^BB\d{4}[A-Z]?$/);
  assert.equal(order.total, 360);
  assert.equal(order.status, 'Awaiting payment');
  assert.equal(m[0].image, `https://bot.example/qr/${order.id}.png`);
  assert.match(m[1].text, new RegExp(`Order \\*${order.id}\\*`));
  assert.match(m[1].text, /beeburg@okbank/);
  let o = to(r.out, t.OWNER);
  assert.match(o[0].text, /New order/); assert.match(o[0].text, /Gangotri Nagar/);
  assert.deepEqual(o[0].buttons, [`o:paid:${order.id}`, `o:cancel:${order.id}`]);

  // the QR is a real PNG for this order
  const qr = await fetch(`${t.url}/qr/${order.id}.png`);
  assert.equal(qr.status, 200);
  assert.equal(Buffer.from(await qr.arrayBuffer()).subarray(1, 4).toString(), 'PNG');

  r = await t.text(C1, 'paid');
  assert.match(to(r.out, C1)[0].text, /checking the payment/);
  assert.match(to(r.out, t.OWNER)[0].text, /says they paid ₹360/);
  assert.equal(t.orders().at(-1).status, 'Customer says paid');

  r = await t.tap(t.OWNER, `o:paid:${order.id}`);
  assert.match(to(r.out, C1)[0].text, /Payment received/);
  assert.deepEqual(to(r.out, t.OWNER)[0].buttons, [`o:ready:${order.id}`, `o:cancel:${order.id}`]);

  r = await t.text(t.OWNER, `ready ${order.id.toLowerCase()}`);        // typed command works too
  assert.match(to(r.out, C1)[0].text, /out for delivery/);
  r = await t.tap(t.OWNER, `o:done:${order.id}`);
  assert.match(to(r.out, C1)[0].text, /Enjoy your meal/);
  assert.equal(t.orders().at(-1).status, 'Completed');

  r = await t.tap(t.OWNER, `o:done:${order.id}`);                       // double tap is harmless
  assert.match(to(r.out, t.OWNER)[0].text, /already completed/);
});

test('cash + pickup order by typing, with the AI switched off', async () => {
  t.state.groqReply = null; // Groq returns 401, like an expired key
  let r = await t.text(C2, '1 chicken burger');                         // first message is already an order
  let m = to(r.out, C2);
  assert.match(m[0].text, /Which one did you mean/);
  assert.match(m[0].text, /1\. Classic Chicken Burger — ₹80/);
  r = await t.text(C2, '1');
  assert.match(to(r.out, C2)[0].text, /1 × Classic Chicken Burger — ₹80/);
  r = await t.text(C2, 'red sauce pasta');
  r = await t.text(C2, 'veg');                                          // answer by name instead of number
  assert.match(to(r.out, C2)[0].text, /Veg Red Sauce Pasta — ₹160/);
  r = await t.text(C2, 'remove pasta');
  assert.doesNotMatch(to(r.out, C2)[0].text, /Pasta/);
  r = await t.text(C2, 'confirm');
  r = await t.text(C2, 'pickup');
  r = await t.text(C2, 'cash');
  m = to(r.out, C2);
  assert.match(m[0].text, /is confirmed/); assert.match(m[0].text, /Cash at pickup/); assert.match(m[0].text, /Total: ₹80/);
  const order = t.orders().at(-1);
  assert.equal(order.status, 'Preparing');
  assert.match(to(r.out, t.OWNER)[0].text, /New CASH order/);
  r = await t.text(C2, 'status');
  assert.match(to(r.out, C2)[0].text, new RegExp(`${order.id}\\* — \\*Preparing`));
  r = await t.text(C2, 'cancel');
  assert.match(to(r.out, C2)[0].text, /already with the kitchen/);
});

test('items that are not on the menu are refused, never invented', async () => {
  t.state.groqReply = null;
  const r = await t.text(C3, '2 masala chai');
  assert.match(to(r.out, C3)[0].text, /couldn't find "2 masala chai" on our menu/);
  assert.equal(t.orders().filter(o => o.phone === C3).length, 0);
});

test('questions go to Bee, grounded in the real menu; plain fallback when AI is down', async () => {
  t.state.groqReply = 'We are open till 2 AM!';
  t.state.groqCalls.length = 0;
  let r = await t.text(C3, 'what time do you close?');
  assert.equal(to(r.out, C3)[0].text, 'We are open till 2 AM!');
  const sys = t.state.groqCalls[0].messages[0].content;
  assert.match(sys, /Paneer Maharaja Burger 150/);
  assert.match(sys, /Margherita Pizza S90\/M160\/L220/);
  t.state.groqReply = null;
  r = await t.text(C3, 'do you have parking?');
  assert.match(to(r.out, C3)[0].text, /I can take your order right here/);
});

test('AI may map odd wording to a real item, but an invented id is rejected', async () => {
  t.state.groqReply = '{"id":"cheese-burger"}';
  let r = await t.text(C4, '2 चीज़ बर्गर');
  assert.match(to(r.out, C4)[0].text, /2 × Cheese Burger — ₹140/);
  t.state.groqReply = '{"id":"hot-latte"}';
  r = await t.text(C4, '1 लाटे');
  assert.match(to(r.out, C4)[0].text, /couldn't find/);
  await t.text(C4, 'cancel');
  t.state.groqReply = null;
});

test('extra words keep the item and offer a note; the note reaches the owner', async () => {
  const C = '919877777777';
  let r = await t.text(C, '2 paneer burger no onion');
  let m = to(r.out, C);
  assert.match(m[0].text, /note: no onion/);
  assert.match(m[1].text, /2 × Paneer Burger — ₹200/);
  r = await t.text(C, 'note: no onion please');
  assert.match(to(r.out, C)[0].text, /📝 Note: no onion please/);
  for (const x of ['confirm', 'pickup']) await t.text(C, x);
  r = await t.text(C, 'cash');
  assert.match(to(r.out, t.OWNER)[0].text, /📝 Note: no onion please/);
});

test('Meta re-delivering the same message does not double-process it', async () => {
  const a = await t.text(C4, '1 student burger', { id: 'wamid.DUP' });
  const b = await t.text(C4, '1 student burger', { id: 'wamid.DUP' });
  assert.match(to(a.out, C4)[0].text, /1 × Student Burger — ₹50/);
  assert.equal(b.out.length, 0);
  await t.text(C4, 'cancel');
});

test('customer can cancel before paying; payment screenshot counts as "paid"', async () => {
  await t.text(C4, '1 french fries'); await t.text(C4, 'confirm'); await t.text(C4, 'pickup');
  let r = await t.text(C4, 'upi');
  const first = t.orders().at(-1);
  r = await t.text(C4, 'cancel');
  assert.match(to(r.out, C4)[0].text, /is cancelled/);
  assert.match(to(r.out, t.OWNER)[0].text, /cancelled their order/);
  assert.equal(first.status, 'Cancelled');

  await t.text(C4, '1 combo'); await t.text(C4, 'confirm'); await t.text(C4, 'pickup'); await t.text(C4, 'upi');
  r = await t.image(C4);
  assert.match(to(r.out, t.OWNER)[0].text, /sent a screenshot/);
  assert.equal(t.orders().at(-1).total, 99);
  assert.notEqual(t.orders().at(-1).id, first.id);
});

test('owner: help, orders list, unknown id, and "#" test mode', async () => {
  let r = await t.text(t.OWNER, 'hello');
  assert.match(to(r.out, t.OWNER)[0].text, /Owner commands/);
  r = await t.text(t.OWNER, 'orders');
  assert.match(to(r.out, t.OWNER)[0].text, /Today's orders \(5\)/);
  r = await t.text(t.OWNER, 'paid BB9999');
  assert.match(to(r.out, t.OWNER)[0].text, /No order found/);
  r = await t.text(t.OWNER, '#1 paneer wrap');
  assert.match(to(r.out, t.OWNER)[0].text, /1 × Paneer Wrap — ₹80/);
  r = await t.tap(t.OWNER, 'cart:clear');
  assert.match(to(r.out, t.OWNER)[0].text, /Cart cleared/);
});

test('dashboard needs the key and escapes customer-supplied text', async () => {
  const evil = { name: '<script>alert(1)</script>' };
  for (const msg of ['1 egg wrap', 'confirm', 'pickup', 'cash']) await t.text('919855555555', msg, evil);
  assert.equal((await fetch(`${t.url}/admin`)).status, 403);
  assert.equal((await fetch(`${t.url}/admin?key=wrong`)).status, 403);
  const html = await (await fetch(`${t.url}/admin?key=admin-key`)).text();
  assert.match(html, /Egg Wrap/);
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;'));
});

test('an expired WhatsApp token is logged, not a crash', async () => {
  t.state.waFail = { status: 401, code: 190, message: 'Session has expired' };
  const r = await t.text('919866666666', 'hi');
  assert.equal(r.status, 200);
  t.state.waFail = null;
  const again = await t.text('919866666666', 'hi');
  assert.ok(again.out.length >= 3);
});
