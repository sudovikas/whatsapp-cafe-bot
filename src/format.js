const { BY_ID, priceOf, lineName } = require('./menu');

const rs = n => `₹${n}`;

// cart line = { itemId, size, qty }
function cartRows(cart) {
  return cart.map(l => {
    const item = BY_ID.get(l.itemId);
    const unit = priceOf(item, l.size);
    return { name: lineName(item, l.size), qty: l.qty, unit, amount: unit * l.qty };
  });
}
const sum = rows => rows.reduce((t, r) => t + r.amount, 0);
const rowsText = rows => rows.map(r => `${r.qty} × ${r.name} — ${rs(r.amount)}`).join('\n');

function orderText(o) {
  const where = o.fulfilment === 'delivery' ? `Delivery to: ${o.address}` : 'Pickup at the cafe';
  const pay = o.payment === 'upi' ? 'UPI' : (o.fulfilment === 'delivery' ? 'Cash on delivery' : 'Cash at pickup');
  return `${rowsText(o.lines)}${o.note ? `\n📝 Note: ${o.note}` : ''}\n*Total: ${rs(o.total)}*\n${where}\nPayment: ${pay}`;
}

const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = { rs, cartRows, sum, rowsText, orderText, esc };
