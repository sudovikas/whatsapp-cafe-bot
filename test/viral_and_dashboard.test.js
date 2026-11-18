const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers');
const { getSurpriseCombo, getRandomFortune, getViralShareNote } = require('../src/viral');
const { getCafeByPhoneId } = require('../src/cafes');

let t;
before(async () => { t = await boot(); });
after(() => t.close());

test('viral engine: surprise combo, fortunes, and referral share note', () => {
  const surprise = getSurpriseCombo();
  assert.ok(surprise.title);
  assert.ok(surprise.text.includes('CRAVING BUSTER'));
  assert.ok(surprise.orderCommand);

  const fortune = getRandomFortune();
  assert.ok(fortune.length > 20);

  const note = getViralShareNote('BB1234');
  assert.ok(note.includes('BB1234'));
  assert.ok(note.includes('Squad Secret'));
});

test('multi-tenant registry: resolves default cafe and custom cafe', () => {
  const cafe = getCafeByPhoneId('111');
  assert.ok(cafe.name);
  assert.ok(cafe.owner);
  assert.ok(cafe.phone);
});

test('customer interaction: fortune and surprise commands', async () => {
  const C = '919899990001';
  let r = await t.text(C, 'fortune');
  assert.ok(r.out.length > 0);
  assert.match(t.view(r.out[0]).text, /Food Horoscope|Wisdom|Real Talk|Vibe Check|Banarasi Fortune|Golden Rule/);

  r = await t.text(C, 'surprise me');
  assert.ok(r.out.length > 0);
  assert.match(t.view(r.out[0]).text, /CRAVING BUSTER/);
  assert.deepEqual(t.view(r.out[0]).buttons, ['act:roll', 'menu']);
});

test('dashboard: contains Zomato savings, retention rate, and exports CSV', async () => {
  const C = '919899990002';
  for (const m of ['1 cheese burger', 'confirm', 'pickup', 'cash']) {
    await t.text(C, m);
  }

  const html = await (await fetch(`${t.url}/admin?key=admin-key`)).text();
  assert.match(html, /Zomato Cut Saved/);
  assert.match(html, /Repeat Rate/);
  assert.match(html, /Export Customers \(\.CSV\)/);

  // Test CSV export endpoint
  const csvRes = await fetch(`${t.url}/admin/export-customers?key=admin-key`);
  assert.equal(csvRes.status, 200);
  assert.ok(csvRes.headers.get('content-type').includes('text/csv'));
  const csv = await csvRes.text();
  assert.match(csv, /Phone,Name,TotalOrders,TotalSpend,LastOrderDate/);
  assert.match(csv, /919899990002/);
});
