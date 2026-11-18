const config = require('./config');
const store = require('./store');
const { esc, rs } = require('./format');
const { STATUS } = store;

const TONE = {
  [STATUS.AWAITING_PAYMENT]: 'wait', [STATUS.PAYMENT_CLAIMED]: 'check', [STATUS.PREPARING]: 'cook',
  [STATUS.READY]: 'ready', [STATUS.COMPLETED]: 'done', [STATUS.CANCELLED]: 'off',
};

function page(adminKey = '') {
  const today = store.todaysOrders();
  const allOrders = store.allOrders();
  const all = [...allOrders].reverse().slice(0, 200);
  const live = today.filter(o => !store.FINAL.includes(o.status)).length;
  const sales = today.filter(o => ![STATUS.CANCELLED, STATUS.AWAITING_PAYMENT].includes(o.status)).reduce((t, o) => t + o.total, 0);
  const lifetimeSales = allOrders.filter(o => ![STATUS.CANCELLED, STATUS.AWAITING_PAYMENT].includes(o.status)).reduce((t, o) => t + o.total, 0);
  const zomatoSaved = Math.round(lifetimeSales * 0.28);
  const todayKey = store.ist().day;

  // Customer intelligence
  const customerMap = new Map();
  for (const o of allOrders) {
    customerMap.set(o.phone, (customerMap.get(o.phone) || 0) + 1);
  }
  const totalCustomers = customerMap.size;
  const repeatCustomers = [...customerMap.values()].filter(cnt => cnt > 1).length;
  const repeatRate = totalCustomers ? Math.round((repeatCustomers / totalCustomers) * 100) : 0;

  const rows = all.map(o => `
    <tr class="${store.ist(new Date(o.createdAt)).day === todayKey ? '' : 'old'}">
      <td><b>${esc(o.id)}</b><small>${esc(store.ist(new Date(o.createdAt)).day.slice(5))} ${esc(store.istTime(o.createdAt))}</small></td>
      <td>${esc(o.name || 'Customer')}<small>+${esc(o.phone)}</small></td>
      <td>${o.lines.map(l => `${l.qty} × ${esc(l.name)}`).join('<br>')}${o.note ? `<small>Note: ${esc(o.note)}</small>` : ''}</td>
      <td>${o.fulfilment === 'delivery' ? `Delivery<small>${esc(o.address)}</small>` : 'Pickup'}</td>
      <td class="num">${rs(o.total)}<small>${esc(o.payment.toUpperCase())}</small></td>
      <td><span class="tag ${TONE[o.status] || ''}">${esc(o.status)}</span></td>
    </tr>`).join('');

  const exportUrl = `/admin/export-customers?key=${encodeURIComponent(adminKey)}`;

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="20">
<title>${esc(config.cafe.name)} · Enterprise Operations Desk</title>
<style>
  :root{--bg:#12100d;--card:#1c1813;--card2:#262019;--line:#383024;--ink:#f8f2e6;--mute:#a89b83;--bee:#f5b301;--green:#10b981;--red:#ef4444}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:14px/1.45 ui-rounded,-apple-system,"Segoe UI",Roboto,sans-serif}
  header{padding:18px 24px;border-bottom:2px solid var(--line);background:var(--card)}
  .top-row{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:12px;margin-bottom:16px}
  h1{margin:0;font-size:20px;font-weight:700}h1 span{color:var(--bee)}
  .actions{display:flex;gap:10px}
  .btn{background:var(--bee);color:#12100d;padding:8px 14px;border-radius:8px;text-decoration:none;font-weight:700;font-size:13px;display:inline-flex;align-items:center;gap:6px}
  .btn:hover{filter:brightness(1.1)}
  .metrics-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px}
  .metric{background:var(--card2);padding:12px 14px;border-radius:8px;border:1px solid var(--line)}
  .metric small{color:var(--mute);font-size:11px;text-transform:uppercase;letter-spacing:.05em;display:block}
  .metric b{font-size:20px;display:block;margin-top:2px;font-variant-numeric:tabular-nums}
  .metric.saved{border-color:#065f46;background:#064e3b33}
  .metric.saved b{color:var(--green)}
  .wrap{overflow-x:auto;padding:16px 24px 60px}
  table{border-collapse:collapse;width:100%;min-width:760px}
  th{font-size:11px;text-transform:uppercase;letter-spacing:.08em;color:var(--mute);text-align:left;padding:10px 8px;border-bottom:1px solid var(--line)}
  td{padding:12px 8px;border-top:1px solid var(--line);vertical-align:top}
  tr.old td{opacity:.5}small{display:block;color:var(--mute);font-size:12px;max-width:260px}
  .num{font-variant-numeric:tabular-nums;white-space:nowrap}
  .tag{display:inline-block;padding:3px 10px;border-radius:99px;font-size:11px;font-weight:700;background:var(--line);white-space:nowrap}
  .wait{background:#4a4234}.check{background:var(--bee);color:#12100d}.cook{background:#c2410c}.ready{background:#15803d}.done{background:#2a3b2c;color:#9fc5a3}.off{background:#3b2626;color:#d39a9a}
  .empty{padding:60px 20px;text-align:center;color:var(--mute)}
</style></head><body>
<header>
  <div class="top-row">
    <h1><span>${esc(config.cafe.name)}</span> · Live Command Center 🐝</h1>
    <div class="actions">
      <a href="${exportUrl}" class="btn">📥 Export Customers (.CSV)</a>
    </div>
  </div>
  <div class="metrics-grid">
    <div class="metric">
      <small>Live Open Orders</small>
      <b>${live}</b>
    </div>
    <div class="metric">
      <small>Today's Orders</small>
      <b>${today.length}</b>
    </div>
    <div class="metric">
      <small>Today's Sales</small>
      <b>${rs(sales)}</b>
    </div>
    <div class="metric saved">
      <small>Zomato Cut Saved (28%)</small>
      <b>${rs(zomatoSaved)}</b>
    </div>
    <div class="metric">
      <small>Repeat Rate</small>
      <b>${repeatRate}% <span style="font-size:12px;color:var(--mute)">(${repeatCustomers}/${totalCustomers})</span></b>
    </div>
  </div>
</header>
<div class="wrap">${all.length ? `<table><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>How</th><th>Total</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<div class="empty">No orders yet. Orders will appear here live as customers place them on WhatsApp!</div>'}</div>
</body></html>`;
}

module.exports = { page };
