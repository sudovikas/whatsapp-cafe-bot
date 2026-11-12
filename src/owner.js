// Everything the cafe owner sees and does on WhatsApp.
// Owner taps buttons (or types: paid / ready / done / cancel + order id, orders, pending, help).
const wa = require('./whatsapp');
const config = require('./config');
const store = require('./store');
const { rs, orderText } = require('./format');
const { STATUS } = store;

async function tell(text, buttons) {
  if (!config.owner) return console.warn('OWNER_WHATSAPP_NUMBER not set, owner not notified');
  try { return buttons ? await wa.sendButtons(config.owner, text, buttons) : await wa.sendText(config.owner, text); }
  catch (err) { console.error('COULD NOT NOTIFY OWNER:', err.message); }
}
async function tellCustomer(order, text) {
  try { await wa.sendText(order.phone, text); return true; }
  catch (err) { console.error(`Could not message customer ${order.phone}:`, err.message); return false; }
}

const head = o => `*${o.id}* · ${o.name || 'Customer'} (+${o.phone})`;
const cancelBtn = o => ({ id: `o:cancel:${o.id}`, title: 'Cancel order' });
const readyTitle = o => (o.fulfilment === 'delivery' ? 'Out for delivery' : 'Ready for pickup');

function notifyNewOrder(o) {
  if (o.payment === 'upi') {
    return tell(`🔔 New order ${head(o)}\n\n${orderText(o)}\n\nWaiting for the customer to pay ${rs(o.total)}. When the money shows in your UPI app, tap below.`,
      [{ id: `o:paid:${o.id}`, title: 'Payment received' }, cancelBtn(o)]);
  }
  return tell(`🔔 New CASH order ${head(o)}\n\n${orderText(o)}\n\nCollect ${rs(o.total)} in cash. Start preparing, then tap below.`,
    [{ id: `o:ready:${o.id}`, title: readyTitle(o) }, cancelBtn(o)]);
}
const notifyPaymentClaim = (o, viaImage) => tell(
  `💰 ${head(o)} says they paid ${rs(o.total)}${viaImage ? ' (sent a screenshot)' : ''}.\nCheck your UPI app, then tap below.`,
  [{ id: `o:paid:${o.id}`, title: 'Payment received' }, cancelBtn(o)]);
const notifyCustomerCancel = o => tell(`❌ ${head(o)} cancelled their order before paying.`);

function formatOrderCard(o) {
  const time = store.istTime(o.createdAt);
  const items = o.lines.map(l => `   • ${l.qty} × ${l.name} (₹${l.amount})`).join('\n');
  const how = o.fulfilment === 'delivery' ? `🛵 *Delivery:* ${o.address || 'Address provided'}` : '🍽️ *Pickup at cafe*';
  const pay = `${o.payment.toUpperCase()}${o.paid ? ' (Paid ✅)' : ' (Unpaid ⏳)'}`;
  const note = o.note ? `\n   📝 *Note:* ${o.note}` : '';
  const statusEmoji = {
    [STATUS.AWAITING_PAYMENT]: '⏳',
    [STATUS.PAYMENT_CLAIMED]: '💰',
    [STATUS.PREPARING]: '🍳',
    [STATUS.READY]: '🟢',
    [STATUS.COMPLETED]: '✅',
    [STATUS.CANCELLED]: '❌',
  }[o.status] || '📦';

  return `━━━━━━━━━━━━━━━━━━━━━
${statusEmoji} *Order ${o.id}* [${time}] · *${o.status}*
👤 *${o.name || 'Customer'}* (+${o.phone})
${items}${note}
💵 *Total: ${rs(o.total)}* via ${pay}
${how}`;
}

const HELP = `👑 *Beeburg Cafe — Owner Desk* 🐝

Owner commands (or just tap the buttons on each order):
• *pending* — see orders needing action
• *orders* — see full list of today's orders
• *paid BB1432* — payment received, start preparing
• *ready BB1432* — ready / out for delivery
• *done BB1432* — handed over
• *cancel BB1432* — cancel and tell the customer

💡 *Customer test mode:* Start a message with # to test as a customer, e.g. *#hi*`;

function list(orders, title) {
  if (!orders.length) return `${title}: none.`;
  const paid = orders.filter(o => o.status !== STATUS.CANCELLED && o.status !== STATUS.AWAITING_PAYMENT);
  const sales = paid.reduce((t, o) => t + o.total, 0);
  const upiSales = paid.filter(o => o.payment === 'upi').reduce((t, o) => t + o.total, 0);
  const cashSales = paid.filter(o => o.payment === 'cash').reduce((t, o) => t + o.total, 0);
  const completed = orders.filter(o => o.status === STATUS.COMPLETED).length;
  const open = orders.filter(o => !store.FINAL.includes(o.status)).length;
  const cancelled = orders.filter(o => o.status === STATUS.CANCELLED).length;

  const isPendingView = title.toLowerCase().includes('open');
  const cards = (isPendingView ? orders : orders.slice(-10)).map(formatOrderCard).join('\n');

  if (isPendingView) {
    return `📋 *Open / Pending Orders (${orders.length}):*
${cards}
━━━━━━━━━━━━━━━━━━━━━

👉 *Action:* Type *paid <id>*, *ready <id>*, or *done <id>*`;
  }

  return `📊 *${title} (${orders.length}):*

💰 *Sales (excluding unpaid/cancelled): ${rs(sales)}*
   (UPI: ${rs(upiSales)} | Cash: ${rs(cashSales)})
📈 *Stats:* ✅ ${completed} Done | 🕒 ${open} Open | ❌ ${cancelled} Cancelled
${cards}
━━━━━━━━━━━━━━━━━━━━━`;
}

async function handle(msg) {
  const text = (msg.text || '').trim();
  let action, id;
  const b = /^o:(\w+):(\w+)$/.exec(msg.buttonId || '');
  if (b) [, action, id] = b;
  else {
    const m = /^(paid|confirm|ready|done|delivered|completed|cancel|reject)\s+#?(\w+)/i.exec(text);
    if (m) { action = m[1].toLowerCase(); id = m[2]; }
  }
  if (!action) {
    if (msg.buttonId === 'o:cmd:pending' || /^pending$/i.test(text)) {
      return tell(list(store.allOrders().filter(o => !store.FINAL.includes(o.status)), 'Open orders'));
    }
    if (msg.buttonId === 'o:cmd:today' || /^orders?(\s+today)?$/i.test(text)) {
      return tell(list(store.todaysOrders(), "Today's orders"));
    }
    if (/^(hi+|hello+|hey+|namaste|help)$/i.test(text)) {
      return tell(HELP, [
        { id: 'o:cmd:pending', title: '📋 Pending Orders' },
        { id: 'o:cmd:today', title: "📊 Today's Orders" },
      ]);
    }
    return tell(HELP);
  }
  action = { confirm: 'paid', delivered: 'done', completed: 'done', reject: 'cancel' }[action] || action;

  const o = store.findOrder(id);
  if (!o) return tell(`No order found with id ${String(id).toUpperCase()}. Type *orders* to see today's list.`);
  if (store.FINAL.includes(o.status)) return tell(`Order ${o.id} is already ${o.status.toLowerCase()}.`);

  if (action === 'paid') {
    if (o.status === STATUS.PREPARING || o.status === STATUS.READY) return tell(`Order ${o.id} is already marked ${o.status.toLowerCase()}.`);
    store.updateOrder(o, { status: STATUS.PREPARING, paid: true });
    const ok = await tellCustomer(o, `✅ Payment received for order *${o.id}*. The kitchen is on it! We'll message you when it's ${o.fulfilment === 'delivery' ? 'out for delivery' : 'ready for pickup'} (usually 15-20 minutes).`);
    return tell(`${o.id} marked paid.${ok ? ' Customer told.' : ' ⚠️ Could not message the customer.'} Tap when it's ready.`,
      [{ id: `o:ready:${o.id}`, title: readyTitle(o) }, cancelBtn(o)]);
  }
  if (action === 'ready') {
    if (o.status === STATUS.AWAITING_PAYMENT || o.status === STATUS.PAYMENT_CLAIMED) {
      return tell(`Order ${o.id} is UPI and not marked paid yet. Confirm the payment first.`, [{ id: `o:paid:${o.id}`, title: 'Payment received' }, cancelBtn(o)]);
    }
    store.updateOrder(o, { status: STATUS.READY });
    const due = o.payment === 'cash' ? ` Please keep ${rs(o.total)} ready in cash.` : '';
    const ok = await tellCustomer(o, o.fulfilment === 'delivery'
      ? `🛵 Order *${o.id}* is out for delivery!${due}`
      : `🍽️ Order *${o.id}* is ready for pickup at the cafe!${due}`);
    return tell(`${o.id}: ${readyTitle(o).toLowerCase()}.${ok ? ' Customer told.' : ' ⚠️ Could not message the customer.'} Tap once it's handed over.`,
      [{ id: `o:done:${o.id}`, title: 'Handed over' }]);
  }
  if (action === 'done') {
    store.updateOrder(o, { status: STATUS.COMPLETED, paid: true });
    await tellCustomer(o, `Enjoy your meal! 🐝 Thanks for ordering from ${config.cafe.name}. Send *hi* anytime to order again.`);
    return tell(`${o.id} completed. 👍`);
  }
  if (action === 'cancel') {
    store.updateOrder(o, { status: STATUS.CANCELLED });
    const ok = await tellCustomer(o, `Sorry, the cafe had to cancel order *${o.id}*. ${o.paid ? 'Your payment will be refunded. ' : ''}Please call ${config.cafe.phone} if you have any questions.`);
    return tell(`${o.id} cancelled.${ok ? ' Customer told.' : ' ⚠️ Could not message the customer.'}${o.paid ? ' Remember to refund the payment.' : ''}`);
  }
}

module.exports = { handle, notifyNewOrder, notifyPaymentClaim, notifyCustomerCancel };
