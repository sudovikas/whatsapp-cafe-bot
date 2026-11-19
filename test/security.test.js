const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { boot } = require('./helpers');

let t;
before(async () => { t = await boot(); });
after(() => t.close());

test('security: HTTP security headers are present on all responses', async () => {
  const res = await fetch(`${t.url}/`);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('x-frame-options'), 'SAMEORIGIN');
  assert.ok(res.headers.get('content-security-policy'));
});

test('security: QR parameter validation rejects malformed / path traversal IDs', async () => {
  const bad1 = await fetch(`${t.url}/qr/..%2F..%2Fetc.png`);
  assert.equal(bad1.status, 400);

  const bad2 = await fetch(`${t.url}/qr/a.png`); // too short (< 3 chars)
  assert.equal(bad2.status, 400);

  const bad3 = await fetch(`${t.url}/qr/this_id_is_way_too_long_to_be_a_valid_order_id_123456789.png`);
  assert.equal(bad3.status, 400);
});

test('security: CSV formula injection is neutralized in export', async () => {
  // Simulate customer with malicious Excel formula in their name
  const evilPhone = '919899990099';
  const evilProfile = { name: '=cmd|\'/C calc\'!A0' };
  for (const m of ['1 cheese burger', 'confirm', 'pickup', 'cash']) {
    await t.text(evilPhone, m, evilProfile);
  }

  const csvRes = await fetch(`${t.url}/admin/export-customers?key=admin-key`);
  assert.equal(csvRes.status, 200);
  const csv = await csvRes.text();
  // Formula MUST be neutralized by prepending a single quote
  assert.match(csv, /'=cmd/);
  assert.ok(!csv.includes('","=cmd'));
});
