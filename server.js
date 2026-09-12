// server.js
// Beeburg Cafe WhatsApp bot with a fun "receptionist" personality (Bee), powered by a free
// Groq LLM for natural chit-chat, while the actual order/payment logic stays rule-based and
// 100% reliable (the AI never touches order IDs, prices, or payment confirmation).
require('dotenv').config();
const express = require('express');

const { sendText, sendImage, sendButtons } = require('./services/whatsapp');
const { getSession, resetSession } = require('./services/state');
const { chat } = require('./services/ai');
const { readOrders, saveOrder, updateOrderStatus } = require('./services/db');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const BASE_URL = process.env.BASE_URL;
const OWNER_PHONE = process.env.OWNER_WHATSAPP_NUMBER;

app.use('/public', express.static('public'));

const pendingOrders = {};
let orderCounter = 1000;
function nextOrderId() {
  orderCounter += 1;
  return `BB${orderCounter}`;
}

const MENU_LIST = [
  { category: "Pizza", item: "Margherita Pizza", price: 199 },
  { category: "Pizza", item: "Double Cheese Margherita", price: 249 },
  { category: "Pizza", item: "Veggie Supreme Pizza", price: 299 },
  { category: "Burger", item: "Veggie Burger", price: 99 },
  { category: "Burger", item: "Cheese Burger", price: 129 },
  { category: "Burger", item: "Chicken Burger", price: 149 },
  { category: "Coffee", item: "Classic Cold Coffee", price: 89 },
  { category: "Coffee", item: "Hot Latte", price: 109 },
  { category: "Beverages", item: "Masala Chai", price: 29 },
  { category: "Beverages", item: "Mineral Water", price: 20 }
];

// Wrapper: try AI reply first, fall back to a plain static message if AI is unavailable.
// Also manages session conversation history (rolling summary of last 4 exchanges).
async function sendChatOrFallback(phone, userMessage, contextHint, fallbackText) {
  const session = getSession(phone);
  const history = session.history || [];

  const aiReply = await chat(userMessage, contextHint, history, MENU_LIST);
  const replyText = aiReply || fallbackText;

  // Save to rolling summary history
  history.push({ role: 'user', content: userMessage });
  history.push({ role: 'assistant', content: replyText });
  if (history.length > 8) { // Keep last 4 exchanges (8 messages total)
    history.splice(0, 2);
  }
  session.history = history;

  return sendText(phone, replyText);
}

// ---------- Meta webhook verification ----------
app.get('/webhook', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

// ---------- Incoming WhatsApp messages ----------
app.post('/webhook', async (req, res) => {
  res.sendStatus(200);
  try {
    const entry = req.body.entry?.[0];
    const change = entry?.changes?.[0];
    const value = change?.value;
    const message = value?.messages?.[0];
    if (!message) return;

    const phone = message.from;
    const name = value?.contacts?.[0]?.profile?.name || phone;
    let userInput = '';

    if (message.type === 'text') {
      userInput = message.text.body.trim();
    } else if (message.type === 'interactive') {
      const interactive = message.interactive;
      if (interactive.type === 'button_reply') userInput = interactive.button_reply.id;
    }

    // Verbose logging for webhook debugging
    console.log(`[Webhook Received] From: ${phone} (${name}), Type: ${message.type}, Input: "${userInput}"`);

    if (OWNER_PHONE && phone === OWNER_PHONE) {
      return handleOwnerMessage(phone, userInput);
    }

    await handleMessage(phone, name, userInput);
  } catch (err) {
    console.error('Error handling webhook message:', err.response?.data || err.message || err);
  }
});

// ---------- Customer conversation logic ----------
async function handleMessage(phone, name, input) {
  const session = getSession(phone);
  session.name = name;
  const lower = (input || '').toLowerCase();

  // 1. Order details bypass check (grounding / no hallucination)
  const isOrderQuery = lower.includes('my order') || 
                       lower.includes('what did i order') || 
                       lower.includes('order detail') || 
                       lower.includes('what is my order') || 
                       lower.includes('order summary') || 
                       lower.includes("what's in my order");
  
  if (isOrderQuery) {
    if (session.orderText) {
      let detailsMsg = `Here is your current order:\n\n${session.orderText}`;
      if (session.orderId) {
        detailsMsg += `\n\nOrder ID: ${session.orderId}`;
      }
      if (session.paymentMethod) {
        detailsMsg += `\nPayment Method: ${session.paymentMethod}`;
      }
      return sendText(phone, detailsMsg);
    } else {
      return sendText(phone, "You don't have an active order right now. Type 'menu' to start one!");
    }
  }

  // 2. Cash on Delivery (COD) detection
  const isCodQuery = lower.includes('cod') || 
                     lower.includes('cash on delivery') || 
                     lower.includes('pay cash') || 
                     lower.includes('delivery cash') || 
                     lower.includes('pay on delivery');
                     
  if (isCodQuery && (session.step === 'CONFIRM' || session.step === 'AWAITING_PAYMENT')) {
    return handleCodSelection(phone, session);
  }

  if (lower === 'menu' || lower === 'hi' || lower === 'hello' || lower === 'start') {
    return sendMenu(phone, session, lower === 'menu' ? 'menu request' : 'greeting');
  }
  if (lower === 'cancel') {
    resetSession(phone);
    return sendChatOrFallback(
      phone, input, 'Customer just cancelled their order.',
      "Order cancelled. Type 'menu' anytime to see the menu again."
    );
  }

  switch (session.step) {
    case 'NEW':
      return sendMenu(phone, session, 'first message');
    case 'AWAITING_ORDER':
      return handleOrderText(phone, name, input, session);
    case 'CONFIRM':
      return handleConfirmAction(phone, name, input, session);
    case 'AWAITING_PAYMENT':
      return handlePaymentWait(phone, input, session);
    case 'AWAITING_DELIVERY':
      // General chat while waiting for delivery
      return sendChatOrFallback(
        phone, input,
        `Customer is chatting while waiting for their COD order ${session.orderId} to be delivered. Remind them warmly their order is in preparation.`,
        "We are preparing your order! We will collect cash on delivery."
      );
    default:
      return sendFallback(phone, input);
  }
}

async function sendMenu(phone, session, occasion) {
  const isExplicitMenuRequest = occasion === 'menu request';
  const wasMenuSent = session.menuSent;

  resetSession(phone);
  const newSession = getSession(phone);
  newSession.step = 'AWAITING_ORDER';

  await sendChatOrFallback(
    phone,
    occasion,
    `Customer just said hi / asked for the menu (${occasion}). Greet them warmly as Bee from Beeburg Cafe, tell them you're sending the menu now.`,
    "Hey there! Welcome to Beeburg Cafe. Sending you our menu now."
  );

  // Avoid resending the full menu images if already received in this session, unless explicitly requested
  if (!wasMenuSent || isExplicitMenuRequest) {
    await sendImage(phone, `${BASE_URL}/public/menu-pizza.jpg`, 'Beeburg Cafe Menu (1/2)');
    await sendImage(phone, `${BASE_URL}/public/menu-burger.jpg`, 'Beeburg Cafe Menu (2/2)');
    newSession.menuSent = true;
  }

  await sendText(
    phone,
    'Just reply with what you\'d like to order (item + quantity), e.g.:\n"1 Margherita Pizza Medium, 2 Classic Cold Coffee"'
  );
}

async function handleOrderText(phone, name, input, session) {
  if (!input || input.length < 2) return sendFallback(phone, input);

  session.orderText = input;
  session.step = 'CONFIRM';

  await sendChatOrFallback(
    phone,
    input,
    `Customer just placed this order: "${input}". Playfully confirm you got it and that you're double-checking it with them before sending to the kitchen.`,
    `Got it! Here's what I noted:\n\n${input}`
  );
  await sendButtons(phone, 'Is this order correct?', [
    { id: 'confirm', title: 'Confirm' },
    { id: 'edit', title: 'Edit order' },
    { id: 'cancel', title: 'Cancel' },
  ]);
}

async function handleConfirmAction(phone, name, input, session) {
  if (input === 'confirm') return finalizeOrder(phone, name, session);
  if (input === 'edit') {
    session.step = 'AWAITING_ORDER';
    return sendChatOrFallback(
      phone, input, 'Customer wants to edit their order.',
      'No problem, please retype your full order.'
    );
  }
  if (input === 'cancel') {
    resetSession(phone);
    return sendChatOrFallback(
      phone, input, 'Customer cancelled their order.',
      "Order cancelled. Type 'menu' to start again."
    );
  }
  return sendFallback(phone, input);
}

async function finalizeOrder(phone, name, session) {
  const orderText = session.orderText;
  const orderId = nextOrderId();

  pendingOrders[orderId] = { phone, name, orderText, paymentMethod: 'UPI' };

  // Log order to persistent database
  saveOrder({
    orderId,
    phone,
    name,
    orderText,
    paymentMethod: 'UPI',
    status: 'Pending Payment'
  });

  await sendImage(
    phone, `${BASE_URL}/public/upi-qr.jpg`,
    `Order ${orderId} - Scan to pay via any UPI app (GPay/PhonePe/Paytm)`
  );
  await sendChatOrFallback(
    phone,
    `Order ${orderId} confirmed`,
    `Order ${orderId} just got confirmed. Cheerfully tell the customer to pay via the QR code above and reply "paid" once done, mention their order ID ${orderId}.`,
    `Please pay using the QR code above. Once you've paid, reply "paid" and we'll confirm shortly. Your order ID is ${orderId}.`
  );

  session.step = 'AWAITING_PAYMENT';
  session.orderId = orderId;
  session.paymentMethod = 'UPI';
  session.lastReminderAt = Date.now();
  session.msgsSinceReminder = 0;

  if (OWNER_PHONE) {
    await sendText(
      OWNER_PHONE,
      `New order ${orderId}\nCustomer: ${name} (${phone})\nOrder:\n${orderText}\n\nOnce you see the payment in your UPI app, reply here with:\nconfirm ${orderId}`
    );
  }
}

async function handleCodSelection(phone, session) {
  session.paymentMethod = 'COD';
  session.step = 'AWAITING_DELIVERY';

  const orderId = session.orderId || nextOrderId();
  session.orderId = orderId;

  pendingOrders[orderId] = { phone, name: session.name, orderText: session.orderText, paymentMethod: 'COD' };

  // Log COD order to persistent database
  saveOrder({
    orderId,
    phone,
    name: session.name,
    orderText: session.orderText,
    paymentMethod: 'COD',
    status: 'Awaiting Delivery'
  });

  await sendChatOrFallback(
    phone,
    "cash on delivery",
    `Customer chose Cash on Delivery for order ${orderId}. Playfully confirm and tell them we'll collect cash on delivery, and our kitchen is preparing it.`,
    `Awesome choice! We've noted Cash on Delivery (COD) for your order ${orderId}. Our kitchen is starting to prepare it now, and we'll collect payment on delivery!`
  );

  if (OWNER_PHONE) {
    await sendText(
      OWNER_PHONE,
      `New COD Order ${orderId}\nCustomer: ${session.name} (${phone})\nOrder:\n${session.orderText}\n\nThis is a Cash on Delivery order. Collect cash on delivery. Reply here when ready:\nready ${orderId} ${phone}`
    );
  }
}

async function handlePaymentWait(phone, input, session) {
  const lower = (input || '').toLowerCase();
  if (lower === 'paid' || lower === 'done' || lower === 'i have paid') {
    return sendChatOrFallback(
      phone, input,
      `Customer says they paid for order ${session.orderId}. Reassure them you're checking and they'll hear back soon.`,
      `Thanks! We're verifying your payment for order ${session.orderId}. You'll get a confirmation message here shortly.`
    );
  }

  // Handle general questions/chat instead of nagging immediately
  const aiReply = await chat(
    input,
    `Customer sent a message while we're still waiting on their payment confirmation for order ${session.orderId}. Answer their question/chat.`,
    session.history || [],
    MENU_LIST
  );
  const replyText = aiReply || `I got your message!`;

  // Update session history
  const history = session.history || [];
  history.push({ role: 'user', content: input });
  history.push({ role: 'assistant', content: replyText });
  if (history.length > 8) history.splice(0, 2);
  session.history = history;

  // Decide if we should append the payment reminder (only if >5 min or >= 2 messages since last reminder)
  const now = Date.now();
  const timeSinceLast = now - (session.lastReminderAt || 0);
  const msgsSinceLast = session.msgsSinceReminder || 0;

  let finalReply = replyText;
  if (timeSinceLast > 5 * 60 * 1000 || msgsSinceLast >= 2) {
    const reminders = [
      `Once you've completed the UPI payment, please reply "paid" so we can start preparing order ${session.orderId}.`,
      `Just a quick reminder: please reply "paid" after scanning the QR code above to confirm order ${session.orderId}.`,
      `We're ready to start on your order ${session.orderId}! Just scan the QR code above and reply "paid" when done.`
    ];
    // Vary the phrasing
    const reminderText = reminders[Math.floor(Math.random() * reminders.length)];
    finalReply = `${replyText}\n\n${reminderText}`;
    
    session.lastReminderAt = now;
    session.msgsSinceReminder = 0;
  } else {
    session.msgsSinceReminder = msgsSinceLast + 1;
  }

  return sendText(phone, finalReply);
}

async function sendFallback(phone, input) {
  return sendChatOrFallback(
    phone, input || '',
    'Customer said something the bot did not understand in the current step. Playfully ask them to type "menu" to see options.',
    "Sorry, I didn't quite get that. Type 'menu' to see the menu and order."
  );
}

// ---------- Owner admin commands ----------
async function handleOwnerMessage(ownerPhone, input) {
  const text = (input || '').trim();
  const confirmMatch = text.match(/^confirm\s+(\w+)/i);

  if (confirmMatch) {
    const orderId = confirmMatch[1].toUpperCase();
    const order = pendingOrders[orderId];
    
    // Update state in database even if deleted from local pending memory
    updateOrderStatus(orderId, { status: 'Paid' });

    if (!order) return sendText(ownerPhone, `Confirmed payment for order ${orderId} in database, but customer session was inactive.`);

    await sendText(
      order.phone,
      `Payment confirmed for order ${orderId}! Your order is now being prepared. Estimated time: 15-20 minutes.`
    );
    await sendText(ownerPhone, `Order ${orderId} marked as Paid. Customer notified.`);
    delete pendingOrders[orderId];
    return;
  }

  const readyMatch = text.match(/^ready\s+(\w+)\s+(\d+)/i);
  if (readyMatch) {
    const [, orderId, customerPhone] = readyMatch;
    
    updateOrderStatus(orderId.toUpperCase(), { status: 'Ready' });

    await sendText(customerPhone, `Your order ${orderId.toUpperCase()} is ready for pickup! See you soon.`);
    return sendText(ownerPhone, `Ready notification sent to ${customerPhone} and updated in DB.`);
  }

  const deliveredMatch = text.match(/^delivered\s+(\w+)\s+(\d+)/i);
  if (deliveredMatch) {
    const [, orderId, customerPhone] = deliveredMatch;

    updateOrderStatus(orderId.toUpperCase(), { status: 'Delivered' });

    await sendText(customerPhone, `Your order ${orderId.toUpperCase()} has been successfully delivered! Hope you enjoy it. 😊`);
    return sendText(ownerPhone, `Order ${orderId.toUpperCase()} marked as Delivered.`);
  }

  // Owner commands to fetch orders (orders or orders today)
  const ordersMatch = text.match(/^orders\s*(today)?/i);
  if (ordersMatch) {
    const todayOnly = !!ordersMatch[1];
    const allOrders = readOrders();
    
    let filtered = allOrders;
    if (todayOnly) {
      const todayStr = new Date().toISOString().split('T')[0];
      filtered = allOrders.filter(o => o.timestamp.startsWith(todayStr));
    }
    
    if (filtered.length === 0) {
      return sendText(ownerPhone, `No orders found ${todayOnly ? 'today' : 'yet'}.`);
    }
    
    const formatted = filtered.slice(-10).map(o => { // Send last 10 orders to prevent text overflow
      const time = new Date(o.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      return `📦 *${o.orderId}* (${time})\n👤 ${o.name} (${o.phone})\n🍕 ${o.orderText}\n💵 Method: ${o.paymentMethod} | Status: ${o.status}`;
    }).join('\n\n');
    
    return sendText(ownerPhone, `Recent Orders List (Max 10):\n\n${formatted}`);
  }

  return sendText(
    ownerPhone,
    'Admin commands:\n- confirm <orderId>  -> mark payment received\n- ready <orderId> <customer_phone>  -> notify customer order is ready\n- delivered <orderId> <customer_phone>  -> notify customer order is delivered\n- orders  -> show recent orders\n- orders today  -> show today\'s orders'
  );
}

// ---------- Secured web dashboard to view orders ----------
app.get('/orders', (req, res) => {
  const secret = req.query.secret;
  const adminSecret = process.env.ADMIN_SECRET || 'beeburg_secret_123';
  if (secret !== adminSecret) {
    return res.status(403).send('Forbidden: Invalid secret key.');
  }
  
  const allOrders = readOrders();
  const rows = allOrders.map(o => {
    const date = new Date(o.timestamp).toLocaleString();
    return `
      <tr>
        <td><strong>${o.orderId}</strong></td>
        <td>${date}</td>
        <td>${o.name}<br><small>${o.phone}</small></td>
        <td>${o.orderText}</td>
        <td><span class="badge ${o.paymentMethod}">${o.paymentMethod}</span></td>
        <td><span class="status-${o.status.toLowerCase().replace(/ /g, '-')}">${o.status}</span></td>
      </tr>
    `;
  }).join('');

  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Beeburg Cafe - Order Dashboard</title>
      <link href="https://fonts.googleapis.com/css2?family=Outfit:wght@300;400;600;700&display=swap" rel="stylesheet">
      <style>
        body {
          font-family: 'Outfit', sans-serif;
          background: linear-gradient(135deg, #0f172a, #1e293b);
          color: #f8fafc;
          margin: 0;
          padding: 20px;
          min-height: 100vh;
        }
        .container {
          max-width: 1200px;
          margin: 0 auto;
          background: rgba(30, 41, 59, 0.7);
          backdrop-filter: blur(10px);
          border-radius: 16px;
          border: 1px solid rgba(255, 255, 255, 0.1);
          padding: 30px;
          box-shadow: 0 10px 30px rgba(0,0,0,0.5);
        }
        header {
          display: flex;
          justify-content: space-between;
          align-items: center;
          border-bottom: 1px solid rgba(255, 255, 255, 0.1);
          padding-bottom: 20px;
          margin-bottom: 30px;
        }
        h1 {
          margin: 0;
          font-size: 28px;
          background: linear-gradient(to right, #f59e0b, #ef4444);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          text-align: left;
        }
        th {
          padding: 12px 15px;
          border-bottom: 2px solid rgba(255, 255, 255, 0.1);
          color: #94a3b8;
          font-weight: 600;
        }
        td {
          padding: 15px;
          border-bottom: 1px solid rgba(255, 255, 255, 0.05);
          vertical-align: top;
        }
        tr:hover {
          background: rgba(255,255,255,0.02);
        }
        .badge {
          padding: 4px 8px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
        }
        .badge.UPI {
          background: #0369a1;
          color: #e0f2fe;
        }
        .badge.COD {
          background: #b45309;
          color: #fef3c7;
        }
        [class^="status-"] {
          padding: 4px 10px;
          border-radius: 20px;
          font-size: 13px;
          font-weight: 600;
          display: inline-block;
        }
        .status-pending-payment { background: #334155; color: #cbd5e1; }
        .status-awaiting-delivery { background: #b45309; color: #fef3c7; }
        .status-paid { background: #0369a1; color: #e0f2fe; }
        .status-ready { background: #047857; color: #d1fae5; }
        .status-delivered { background: #15803d; color: #d1fae5; }
      </style>
    </head>
    <body>
      <div class="container">
        <header>
          <h1>🐝 Beeburg Cafe - Live Orders</h1>
          <div>Total Orders: ${allOrders.length}</div>
        </header>
        <table>
          <thead>
            <tr>
              <th>Order ID</th>
              <th>Time</th>
              <th>Customer</th>
              <th>Order Items</th>
              <th>Payment Method</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rows || '<tr><td colspan="6" style="text-align:center;">No orders placed yet.</td></tr>'}
          </tbody>
        </table>
      </div>
    </body>
    </html>
  `;
  res.send(html);
});

app.get('/', (req, res) => res.send('Beeburg Cafe WhatsApp Bot is running.'));

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
