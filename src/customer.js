// The customer conversation. Every message that involves items, prices, totals, order ids or
// payment is written by this code. The AI only answers free-form questions.
const wa = require('./whatsapp');
const ai = require('./ai');
const config = require('./config');
const store = require('./store');
const owner = require('./owner');
const { BY_ID, SIZES, priceOf, lineName, cap } = require('./menu');
const { parseOrder, parseSize, resolved, pickFrom } = require('./parser');
const { rs, cartRows, sum, rowsText, orderText } = require('./format');
const { STATUS } = store;

const EXAMPLE = '*2 cheese burger, 1 margherita medium*';
const GREET = /^(hi+|hello+|hey+|hlo|helo|hola|namaste|namaskar|start|good (morning|afternoon|evening))( bee| there| ji)?$/;
const PAID = /\b(paid|payment done|pay kar diya|kar diya|ho gaya|bhej diya|transferred|payment sent)\b/;
const QUESTION = /\?|^(what|when|where|why|how|which|who|is|are|do you|does|can you|could you|kya|kab|kahan|kaha|kitna|kitne|kaise|kaun|batao|suggest)\b|\b(price|rate|timing|timings|open|close|closed|address|location|available|charge|charges|minimum|offer|discount|best|special|recommend|suggest|suggestion|favorite|favourite|accha|achha|badhiya|famous|parking|taste|review|swad|kaisa|kya chal|kya haal|kya be|kya khaye|sarcasm|joke|kuch)\b/i;
const ORDER_INTENT = /^\d|\b(i want|i need|i would like|i'd like|can i (get|have|order)|give me|send me|get me|chahiye|mujhe|order karna)\b/;

const say = (to, text) => wa.sendText(to, text);
const firstName = n => { const f = String(n || '').trim().split(/\s+/)[0] || ''; return /^[\p{L}]{2,15}$/u.test(f) ? ` ${f}` : ''; };
const paymentOpen = phone => { const o = store.openOrderFor(phone); return o && [STATUS.AWAITING_PAYMENT, STATUS.PAYMENT_CLAIMED].includes(o.status) ? o : null; };

async function handle(msg) {
  const from = msg.from;
  const s = store.session(from);
  if (msg.name) s.name = msg.name;
  const text = (msg.text || '').trim();
  const lower = text.toLowerCase().replace(/[\s!.]+$/, '');
  const btn = msg.buttonId || '';

  if (msg.type === 'image') {
    const o = paymentOpen(from);
    if (o) return claimPaid(from, o, true);
    return say(from, `Thanks for the photo! I can only read text though. To order, send something like ${EXAMPLE}.`);
  }
  if (msg.type === 'location') {
    if (s.step === 'ADDRESS') return setAddress(from, s, [msg.location.name, msg.location.address, `https://maps.google.com/?q=${msg.location.latitude},${msg.location.longitude}`].filter(Boolean).join(', '));
    return say(from, 'Got your location 📍 I\'ll ask for it when you place a delivery order.');
  }
  if (msg.type !== 'text' && msg.type !== 'button') {
    return say(from, `I can only read text messages right now 🙂 To order, send something like ${EXAMPLE}, or type *menu*.`);
  }

  if (!btn) {
    if (GREET.test(lower)) return greet(from, s);
    if (/^(menu|menu please|show menu|send menu|menu bhejo|menu card)$/.test(lower)) return sendMenu(from, s);
    if (/^(cancel|clear|reset|cancel order|clear cart|cancel my order)$/.test(lower)) return cancel(from, s);
    if (/^(status|order status|my order|my cart|cart|track|track order|where is my order|what is my order|what did i order)$/.test(lower)) return status(from, s);
    if (lower === 'help') return say(from, `Here's how it works:\n• Send your order, e.g. ${EXAMPLE}\n• *menu* - see the menu\n• *status* - see your cart or order\n• *cancel* - start over\nOr call us on ${config.cafe.phone}.`);
  }

  if (s.pending.length) return answerPending(from, s, text, lower, btn);
  switch (s.step) {
    case 'FULFIL': return fulfilStep(from, s, lower, btn);
    case 'ADDRESS': return addressStep(from, s, text, lower);
    case 'PAYMENT': return paymentStep(from, s, lower, btn);
    default: return cartStep(from, s, text, lower, btn);
  }
}

// ---------- greeting & menu ----------
async function greet(from, s) {
  if (s.cart.length) { await say(from, `Welcome back${firstName(s.name)}! 🐝 Your cart is still saved below 👇`); return showCart(from, s); }
  await say(from, `Hey${firstName(s.name)}! 🐝 Welcome to *${config.cafe.name}* in Shivpur, Varanasi! Here's our menu 👇`);
  return sendMenu(from, s);
}
async function sendMenu(from, s) {
  for (const [file, caption] of [['menu-burgers.jpg', '🍔 Burgers, Sandwiches, Wraps, Pasta & Fries (1/2)'], ['menu-pizzas.jpg', '🍕 Pizzas & Combos (2/2)']]) {
    try { await wa.sendImage(from, `${config.baseUrl}/public/${file}`, caption); }
    catch (err) { console.error('Menu image failed (check BASE_URL):', err.message); }
  }
  s.menuSent = true;
  return say(from, `Order lagana bilkul aasan hai! 😋\nBas items aur quantity likh kar bhej dijiye, jaise:\n👉 *${EXAMPLE}*\n\n🛵 *Free Home Delivery* · ⏰ *Open 11 AM to 2 AM!*`);
}

function addLine(s, item, qty, size) {
  const same = s.cart.find(l => l.itemId === item.id && l.size === (size || null));
  if (same) same.qty = Math.min(same.qty + qty, 500);
  else s.cart.push({ itemId: item.id, size: size || null, qty: Math.min(qty, 500) });
  s.step = 'CART';
}
async function showCart(from, s) {
  const rows = cartRows(s.cart);
  s.step = 'CART';
  const total = sum(rows);
  const itemsText = rowsText(rows);
  const noteText = s.note ? `\n📝 Note: ${s.note}` : '';
  const body = `🧾 *Your order*\n${itemsText}${noteText}\n\n*Total: ${rs(total)}*\n\nSend more items to add them, or confirm.`;

  if (body.length > 950) {
    await say(from, `🧾 *Your Order Items (${rows.length}):*\n\n${itemsText}${noteText}`);
    return wa.sendButtons(from, `*Total: ${rs(total)}*\n\nReady to proceed with this order?`,
      [{ id: 'cart:confirm', title: 'Confirm order ✅' }, { id: 'cart:add', title: 'Add more' }, { id: 'cart:clear', title: 'Clear cart' }]);
  }

  return wa.sendButtons(from, body,
    [{ id: 'cart:confirm', title: 'Confirm order ✅' }, { id: 'cart:add', title: 'Add more' }, { id: 'cart:clear', title: 'Clear cart' }]);
}
const next = (from, s) => (s.pending.length ? askPending(from, s) : s.cart.length ? showCart(from, s) : null);

async function cartStep(from, s, text, lower, btn) {
  if (btn === 'cart:add') return say(from, `Sure! Send the next item, e.g. *1 french fry*.`);
  if (btn === 'cart:clear') return cancel(from, s);
  const wantsConfirm = btn === 'cart:confirm' || (s.cart.length && /^(confirm|confirm order|yes|ok|okay|done|haan|ha|han|place order|bas|that'?s all|thats it)$/.test(lower));
  if (wantsConfirm) {
    if (!s.cart.length) return say(from, `Your cart is empty. Send your order like ${EXAMPLE}.`);
    return askFulfil(from, s);
  }
  if (btn) return say(from, `That button has expired. Send your order again like ${EXAMPLE}, or type *status*.`);

  if (!s.cart.length && (PAID.test(lower) || lower === 'done')) {
    const o = paymentOpen(from);
    if (o) return claimPaid(from, o, false);
  }
  const note = /^note\s*[:\-]?\s*(.+)$/i.exec(text);
  if (note && s.cart.length) { s.note = note[1].slice(0, 200); return showCart(from, s); }
  const rm = /^(remove|delete|hatao|minus)\s+(.+)$/.exec(lower);
  if (rm && s.cart.length) return removeItems(from, s, rm[2]);
  if (QUESTION.test(lower) && !ORDER_INTENT.test(lower)) return chat(from, s, text);
  return addFromText(from, s, text);
}

async function addFromText(from, s, text) {
  const res = parseOrder(text);
  const notes = [];
  // Hindi (or other non-Latin) script: the rule parser cannot read it, so let the AI try the whole message.
  if (!res.lines.length && !res.questions.length && !res.vague.length && !res.unknown.length && /\p{L}/u.test(text.replace(/[\x00-\x7F]/g, ''))) {
    res.unknown.push({ text, qty: Math.min(Number((/\d+/.exec(text) || [1])[0]) || 1, 500), size: null });
  }
  const looksLikeOrder = res.lines.length || res.questions.length || res.vague.length || ORDER_INTENT.test(text.toLowerCase());
  for (const u of res.unknown.slice(0, 3)) {
    const item = looksLikeOrder ? await ai.matchItem(u.text) : null;
    if (item) { const r = resolved(item, u.qty, u.size); (r.kind === 'line' ? res.lines : res.questions).push(r); }
    else if (looksLikeOrder) notes.push(`I couldn't find "${u.text.trim()}" on our menu.`);
  }
  if (!res.lines.length && !res.questions.length && !res.vague.length) {
    if (notes.length) return say(from, `${notes.join('\n')}\nType *menu* to see what we have.`);
    if (!s.menuSent && !s.cart.length && !s.history.length) return greet(from, s);
    return chat(from, s, text);
  }
  for (const l of res.lines) addLine(s, l.item, l.qty, l.size);
  if ([...res.lines, ...res.questions].some(x => x.extra)) notes.push('For special requests (no onion, extra spicy...), type *note:* and your request, e.g. *note: no onion*.');
  for (const q of res.questions) {
    s.pending.push(q.kind === 'needSize'
      ? { kind: 'size', itemId: q.item.id, qty: q.qty }
      : { kind: 'choice', ids: q.options.map(o => o.id), qty: q.qty, size: q.size || null });
  }
  if (res.questions.length) s.step = 'CART';
  for (const v of res.vague) notes.push(`Which ${v.text} would you like? Send its full name from the menu, e.g. *1 ${v.text.includes('pizza') ? 'onion pizza medium' : v.text.includes('burger') ? 'cheese burger' : 'paneer wrap'}*.`);
  if (notes.length) await say(from, notes.join('\n'));
  return next(from, s);
}

async function removeItems(from, s, what) {
  const res = parseOrder(what);
  const before = s.cart.length;
  let changed = false;

  for (const l of res.lines) {
    const idx = s.cart.findIndex(c => c.itemId === l.item.id && (!l.size || c.size === l.size));
    if (idx !== -1) {
      changed = true;
      if (l.qty && s.cart[idx].qty > l.qty) {
        s.cart[idx].qty -= l.qty;
      } else {
        s.cart.splice(idx, 1);
      }
    }
  }

  if (!changed) {
    const ids = new Set([...res.lines.map(l => l.item.id), ...res.questions.flatMap(q => (q.item ? [q.item.id] : q.options.map(o => o.id)))]);
    s.cart = s.cart.filter(l => !ids.has(l.itemId));
    if (s.cart.length !== before) changed = true;
  }

  if (!changed) await say(from, `I couldn't find that in your cart.`);
  if (!s.cart.length) { store.resetCart(s); return say(from, `Your cart is empty now. Send your order like ${EXAMPLE}.`); }
  return showCart(from, s);
}

// ---------- follow-up questions (size / which item) ----------
function askPending(from, s) {
  const p = s.pending[0];
  if (p.kind === 'size') {
    const item = BY_ID.get(p.itemId);
    return wa.sendButtons(from, `Which size for *${p.qty} × ${item.name}*?\n(Tap one, or type *skip* to leave it out.)`,
      SIZES.map(z => ({ id: `size:${z}`, title: `${cap(z)} ${rs(item.sizes[z])}` })));
  }
  const opts = p.ids.map(id => BY_ID.get(id));
  const lines = opts.map((o, i) => `${i + 1}. ${o.name} — ${o.sizes ? `${rs(o.sizes.small)}/${rs(o.sizes.medium)}/${rs(o.sizes.large)}` : rs(o.price)}`);
  const body = `Which one did you mean?\n${lines.join('\n')}\n\nReply with the number${opts.length > 3 ? '' : ' or tap below'} (or *skip*).`;
  if (opts.length > 3) return say(from, body);
  return wa.sendButtons(from, body, opts.map((o, i) => ({ id: `pick:${i + 1}`, title: String(i + 1) })));
}

async function answerPending(from, s, text, lower, btn) {
  const p = s.pending[0];
  if (/^(skip|no|none|nahi|leave it)$/.test(lower)) { s.pending.shift(); return (await next(from, s)) || say(from, `Okay, skipped. Send your order like ${EXAMPLE}.`); }

  if (p.kind === 'size') {
    const size = (/^size:(\w+)$/.exec(btn) || [])[1] || parseSize(lower);
    if (!SIZES.includes(size)) return askPending(from, s);
    s.pending.shift();
    addLine(s, BY_ID.get(p.itemId), p.qty, size);
    return next(from, s);
  }

  let n = Number((/^pick:(\d+)$/.exec(btn) || [])[1] || (/^\d+$/.test(lower) ? lower : 0));
  if (!n && text) { // typed words instead of the number: "veg", "classic one"
    n = pickFrom(p.ids.map(id => BY_ID.get(id)), text) + 1;
    if (n && !p.size) p.size = parseSize(lower);
  }
  if (!n || n > p.ids.length) return askPending(from, s);
  s.pending.shift();
  const r = resolved(BY_ID.get(p.ids[n - 1]), p.qty, p.size);
  if (r.kind === 'line') addLine(s, r.item, r.qty, r.size);
  else { s.pending.unshift({ kind: 'size', itemId: r.item.id, qty: r.qty }); s.step = 'CART'; }
  return next(from, s);
}

// ---------- checkout ----------
function askFulfil(from, s) {
  s.step = 'FULFIL';
  return wa.sendButtons(from, 'Pickup from the cafe, or home delivery? (Delivery is free.)',
    [{ id: 'ful:delivery', title: 'Home delivery 🛵' }, { id: 'ful:pickup', title: 'Pickup' }, { id: 'ful:back', title: 'Edit order' }]);
}
function fulfilStep(from, s, lower, btn) {
  if (btn === 'ful:back' || /^(back|edit|change)/.test(lower)) return showCart(from, s);
  if (btn === 'ful:pickup' || /pick|take ?away|collect|dine|self/.test(lower)) { s.fulfilment = 'pickup'; s.address = null; return askPayment(from, s); }
  if (btn === 'ful:delivery' || /deliver|home|ghar/.test(lower)) {
    s.fulfilment = 'delivery'; s.step = 'ADDRESS';
    return say(from, 'Please send your full delivery address with a nearby landmark (or share your location 📍).');
  }
  return askFulfil(from, s);
}
function addressStep(from, s, text, lower) {
  if (/^(back|edit|change)$/.test(lower)) return askFulfil(from, s);
  if (text.length < 10) return say(from, 'Please send a bit more detail: house/flat number, street and a landmark.');
  return setAddress(from, s, text);
}
function setAddress(from, s, address) { s.address = address.slice(0, 400); return askPayment(from, s); }

function askPayment(from, s) {
  if (!config.upiVpa) return placeOrder(from, s, 'cash');
  s.step = 'PAYMENT';
  const total = sum(cartRows(s.cart));
  return wa.sendButtons(from, `Total is *${rs(total)}*. How would you like to pay?`,
    [{ id: 'pay:upi', title: 'Pay by UPI' }, { id: 'pay:cash', title: s.fulfilment === 'delivery' ? 'Cash on delivery' : 'Cash at pickup' }]);
}
function paymentStep(from, s, lower, btn) {
  if (/^(back|edit|change)$/.test(lower)) return showCart(from, s);
  if (btn === 'pay:upi' || /upi|gpay|google pay|phonepe|paytm|online|qr|scan/.test(lower)) return placeOrder(from, s, 'upi');
  if (btn === 'pay:cash' || /cash|cod/.test(lower)) return placeOrder(from, s, 'cash');
  return askPayment(from, s);
}

async function placeOrder(from, s, payment) {
  const lines = cartRows(s.cart);
  const order = store.createOrder({
    phone: from, name: s.name || '', lines, total: sum(lines),
    fulfilment: s.fulfilment || 'pickup', address: s.address || null, note: s.note || null, payment,
    status: payment === 'upi' ? STATUS.AWAITING_PAYMENT : STATUS.PREPARING, paid: false,
  });
  store.resetCart(s);
  try {
    if (payment === 'upi') {
      try { await wa.sendImage(from, `${config.baseUrl}/qr/${order.id}.png`, `Scan to pay ${rs(order.total)} · Order ${order.id}`); }
      catch (err) { console.error('QR image failed (check BASE_URL):', err.message); }
      await say(from, `Order *${order.id}* is saved 🎉\n\n${orderText(order)}\n\nPay *${rs(order.total)}* by scanning the QR above in any UPI app, or send it to UPI ID *${config.upiVpa}*.\n\nAfter paying, reply *paid* here and we'll start cooking.`);
    } else {
      await say(from, `Order *${order.id}* is confirmed 🎉\n\n${orderText(order)}\n\nThe kitchen is on it. We'll message you when it's ${order.fulfilment === 'delivery' ? 'out for delivery' : 'ready for pickup'}.`);
    }
  } finally {
    await owner.notifyNewOrder(order);
  }
}

async function claimPaid(from, order, viaImage) {
  if (order.status === STATUS.AWAITING_PAYMENT) store.updateOrder(order, { status: STATUS.PAYMENT_CLAIMED });
  await say(from, `Thanks! The cafe is checking the payment for order *${order.id}*. You'll get a confirmation here in a moment.`);
  return owner.notifyPaymentClaim(order, viaImage);
}

async function cancel(from, s) {
  if (s.cart.length || s.pending.length || s.step !== 'IDLE') {
    store.resetCart(s);
    return say(from, `Cart cleared. Send a new order anytime, like ${EXAMPLE}.`);
  }
  const o = store.openOrderFor(from);
  if (!o) return say(from, `Nothing to cancel. Send your order like ${EXAMPLE}.`);
  if (o.status !== STATUS.AWAITING_PAYMENT) return say(from, `Order *${o.id}* is already with the kitchen. To cancel it, please call ${config.cafe.phone}.`);
  store.updateOrder(o, { status: STATUS.CANCELLED });
  await say(from, `Order *${o.id}* is cancelled. Send *hi* whenever you'd like to order again.`);
  return owner.notifyCustomerCancel(o);
}

function status(from, s) {
  if (s.cart.length) return showCart(from, s);
  const o = store.latestOrderFor(from);
  if (!o) return say(from, `You don't have an order yet. Send one like ${EXAMPLE}.`);
  const extra = o.status === STATUS.AWAITING_PAYMENT ? `\n\nPay ${rs(o.total)} to UPI ID *${config.upiVpa}* and reply *paid*.` : '';
  return say(from, `Order *${o.id}* — *${o.status}*\n\n${orderText(o)}${extra}`);
}

// ---------- free-form chat ----------
async function chat(from, s, text) {
  const o = store.openOrderFor(from);
  const context = [
    s.cart.length ? `Customer's cart: ${rowsText(cartRows(s.cart))}.` : 'Cart is empty.',
    o ? `They have order ${o.id}, status: ${o.status}.` : '',
  ].join(' ');
  const reply = (await ai.chat(text, s.history, context)) ||
    `I can take your order right here 🙂 Send the items with quantity, like ${EXAMPLE}, or type *menu*. For anything else, call us on ${config.cafe.phone}.`;
  s.history.push({ role: 'user', content: text }, { role: 'assistant', content: reply });
  if (s.history.length > 8) s.history.splice(0, s.history.length - 8);
  return say(from, reply);
}

module.exports = { handle };
