// Orders (JSON file, survives restarts when DATA_DIR is on a persistent disk) and
// chat sessions (memory only: a restart just means the customer re-sends their cart).
const fs = require('fs');
const path = require('path');
const config = require('./config');

const STATUS = {
  AWAITING_PAYMENT: 'Awaiting payment',
  PAYMENT_CLAIMED: 'Customer says paid',
  PREPARING: 'Preparing',
  READY: 'Ready',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};
const FINAL = [STATUS.COMPLETED, STATUS.CANCELLED];

let orders = null;
const file = () => path.join(config.dataDir, 'orders.json');

function load() {
  if (orders) return orders;
  try { orders = JSON.parse(fs.readFileSync(file(), 'utf8')); if (!Array.isArray(orders)) orders = []; }
  catch { orders = []; }
  return orders;
}
function persist() {
  try {
    fs.mkdirSync(config.dataDir, { recursive: true });
    const tmp = file() + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(orders, null, 2));
    fs.renameSync(tmp, file());
  } catch (err) { console.error('Could not save orders:', err.message); }
}

// India time helpers (the server itself runs in UTC).
function ist(date = new Date()) {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false,
  }).formatToParts(date).map(x => [x.type, x.value]));
  return { day: `${p.year}-${p.month}-${p.day}`, hh: p.hour === '24' ? '00' : p.hour, mm: p.minute };
}
const istTime = iso => { const t = ist(new Date(iso)); return `${t.hh}:${t.mm}`; };

// Order id = BB + time of day in India (BB1432). A letter is added if two orders share a minute.
function newId() {
  const t = ist();
  const today = load().filter(o => ist(new Date(o.createdAt)).day === t.day).map(o => o.id);
  let id = `BB${t.hh}${t.mm}`;
  for (let i = 0; today.includes(id); i++) id = `BB${t.hh}${t.mm}${String.fromCharCode(65 + i)}`;
  return id;
}

function createOrder(data) {
  const order = { id: newId(), createdAt: new Date().toISOString(), ...data };
  load().push(order);
  persist();
  return order;
}
const findOrder = id => [...load()].reverse().find(o => o.id === String(id || '').toUpperCase());
const latestOrderFor = phone => [...load()].reverse().find(o => o.phone === phone);
const openOrderFor = phone => [...load()].reverse().find(o => o.phone === phone && !FINAL.includes(o.status));
function updateOrder(order, patch) { Object.assign(order, patch, { updatedAt: new Date().toISOString() }); persist(); return order; }
const todaysOrders = () => { const d = ist().day; return load().filter(o => ist(new Date(o.createdAt)).day === d); };
const allOrders = () => load();

// ---- sessions ----
const sessions = new Map();
const TTL = 2 * 60 * 60 * 1000;
function blank() { return { step: 'IDLE', cart: [], pending: [], fulfilment: null, address: null, note: null, history: [], menuSent: false, at: Date.now() }; }
function session(phone) {
  let s = sessions.get(phone);
  if (!s || Date.now() - s.at > TTL) { s = blank(); sessions.set(phone, s); }
  s.at = Date.now();
  return s;
}
function resetCart(s) { s.step = 'IDLE'; s.cart = []; s.pending = []; s.fulfilment = null; s.address = null; s.note = null; }
function _resetAll() { orders = null; sessions.clear(); }

module.exports = { STATUS, FINAL, createOrder, findOrder, latestOrderFor, openOrderFor, updateOrder, todaysOrders, allOrders, session, resetCart, ist, istTime, _resetAll };
