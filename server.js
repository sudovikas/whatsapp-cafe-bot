// server.js
// Beeburg Cafe WhatsApp bot with a fun "receptionist" personality (Bee), powered by a free
// Groq LLM for natural chit-chat, while the actual order/payment logic stays rule-based and
// 100% reliable (the AI never touches order IDs, prices, or payment confirmation).
require('dotenv').config();
const express = require('express');

const { sendText, sendImage, sendButtons } = require('./services/whatsapp');
const { getSession, resetSession } = require('./services/state');
const { chat } = require('./services/ai');

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

// Wrapper: try AI reply first, fall back to a plain static message if AI is unavailable.
async function sendChatOrFallback(phone, userMessage, contextHint, fallbackText) {
  const aiReply = await chat(userMessage, contextHint);
  return sendText(phone, aiReply || fallbackText);
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

    if (OWNER_PHONE && phone === OWNER_PHONE) {
      return handleOwnerMessage(phone, userInput);
    }

    await handleMessage(phone, name, userInput);
  } catch (err) {
    console.error('Error handling webhook message:', err.message);
  }
});

// ---------- Customer conversation logic ----------
async function handleMessage(phone, name, input) {
  const session = getSession(phone);
  session.name = name;
  const lower = (input || '').toLowerCase();

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
    default:
      return sendFallback(phone, input);
  }
}

async function sendMenu(phone, session, occasion) {
  resetSession(phone);
  getSession(phone).step = 'AWAITING_ORDER';

  await sendChatOrFallback(
    phone,
    occasion,
    `Customer just said hi / asked for the menu (${occasion}). Greet them warmly as Bee from Beeburg Cafe, tell them you're sending the menu now.`,
    "Hey there! Welcome to Beeburg Cafe. Sending you our menu now."
  );

  await sendImage(phone, `${BASE_URL}/public/menu-pizza.jpg`, 'Beeburg Cafe Menu (1/2)');
  await sendImage(phone, `${BASE_URL}/public/menu-burger.jpg`, 'Beeburg Cafe Menu (2/2)');
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

  pendingOrders[orderId] = { phone, name, orderText };

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

  if (OWNER_PHONE) {
    await sendText(
      OWNER_PHONE,
      `New order ${orderId}\nCustomer: ${name} (${phone})\nOrder:\n${orderText}\n\nOnce you see the payment in your UPI app, reply here with:\nconfirm ${orderId}`
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
  return sendChatOrFallback(
    phone, input,
    `Customer sent a message while we're still waiting on their payment confirmation for order ${session.orderId}. Gently remind them to pay and reply "paid".`,
    `Still waiting on payment confirmation for order ${session.orderId}. Reply "paid" once you've completed the UPI payment.`
  );
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
    if (!order) return sendText(ownerPhone, `No pending order found with ID ${orderId}.`);

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
    await sendText(customerPhone, `Your order ${orderId.toUpperCase()} is ready for pickup! See you soon.`);
    return sendText(ownerPhone, `Ready notification sent to ${customerPhone}.`);
  }

  return sendText(
    ownerPhone,
    'Admin commands:\n- confirm <orderId>  -> mark payment received, notify customer\n- ready <orderId> <customer_phone>  -> notify customer order is ready'
  );
}

app.get('/', (req, res) => res.send('Beeburg Cafe WhatsApp Bot is running.'));

app.listen(PORT, () => console.log(`Server listening on port ${PORT}`));
