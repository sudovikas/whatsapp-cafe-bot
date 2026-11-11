const config = require('./config');
const store = require('./store');
const { esc, rs } = require('./format');
const { STATUS } = store;

const TONE = {
  [STATUS.AWAITING_PAYMENT]: 'wait', [STATUS.PAYMENT_CLAIMED]: 'check', [STATUS.PREPARING]: 'cook',
  [STATUS.READY]: 'ready', [STATUS.COMPLETED]: 'done', [STATUS.CANCELLED]: 'off',
};

function page() {
  const today = store.todaysOrders();
  const all = [...store.allOrders()].reverse().slice(0, 200);
  const live = today.filter(o => !store.FINAL.includes(o.status)).length;
  const sales = today.filter(o => ![STATUS.CANCELLED, STATUS.AWAITING_PAYMENT].includes(o.status)).reduce((t, o) => t + o.total, 0);
  const todayKey = store.ist().day;

  const rows = all.map(o => `
    <tr class="${store.ist(new Date(o.createdAt)).day === todayKey ? '' : 'old'}">
      <td><b>${esc(o.id)}</b><small>${esc(store.ist(new Date(o.createdAt)).day.slice(5))} ${esc(store.istTime(o.createdAt))}</small></td>
      <td>${esc(o.name || 'Customer')}<small>+${esc(o.phone)}</small></td>
      <td>${o.lines.map(l => `${l.qty} × ${esc(l.name)}`).join('<br>')}${o.note ? `<small>Note: ${esc(o.note)}</small>` : ''}</td>
      <td>${o.fulfilment === 'delivery' ? `Delivery<small>${esc(o.address)}</small>` : 'Pickup'}</td>
      <td class="num">${rs(o.total)}<small>${esc(o.payment.toUpperCase())}</small></td>
      <td><span class="tag ${TONE[o.status] || ''}">${esc(o.status)}</span></td>
    </tr>`).join('');

  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="refresh" content="20">
<title>${esc(config.cafe.name)} · Orders</title>
<style>
  :root{--bg:#16130f;--card:#201c16;--line:#342e24;--ink:#f4ecdc;--mute:#a3977f;--bee:#f5b301}
  *{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--ink);font:15px/1.45 ui-rounded,"Trebuchet MS",system-ui,sans-serif}
  header{padding:20px 20px 12px;display:flex;flex-wrap:wrap;gap:12px 28px;align-items:end;border-bottom:3px solid var(--bee)}
  h1{margin:0;font-size:22px;letter-spacing:.02em}h1 span{color:var(--bee)}
  .stat{color:var(--mute);font-size:13px}.stat b{display:block;color:var(--ink);font-size:22px;font-variant-numeric:tabular-nums}
  .wrap{overflow-x:auto;padding:8px 12px 40px}
  table{border-collapse:collapse;width:100%;min-width:760px}
  th{font-size:12px;text-transform:uppercase;letter-spacing:.08em;color:var(--mute);text-align:left;padding:10px 8px}
  td{padding:12px 8px;border-top:1px solid var(--line);vertical-align:top}
  tr.old td{opacity:.55}small{display:block;color:var(--mute);font-size:12px;max-width:260px}
  .num{font-variant-numeric:tabular-nums;white-space:nowrap}
  .tag{display:inline-block;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:700;background:var(--line);white-space:nowrap}
  .wait{background:#4a4234}.check{background:var(--bee);color:#16130f}.cook{background:#c2410c}.ready{background:#15803d}.done{background:#2a3b2c;color:#9fc5a3}.off{background:#3b2626;color:#d39a9a}
  .empty{padding:60px 20px;text-align:center;color:var(--mute)}
</style></head><body>
<header><h1><span>Beeburg</span> orders</h1>
  <div class="stat"><b>${live}</b>open now</div>
  <div class="stat"><b>${today.length}</b>orders today</div>
  <div class="stat"><b>${rs(sales)}</b>sales today</div>
  <div class="stat">refreshes every 20 s</div></header>
<div class="wrap">${all.length ? `<table><thead><tr><th>Order</th><th>Customer</th><th>Items</th><th>How</th><th>Total</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table>`
    : '<div class="empty">No orders yet. They will appear here as customers confirm on WhatsApp.</div>'}</div>
</body></html>`;
}

module.exports = { page };
