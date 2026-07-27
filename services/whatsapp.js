// services/whatsapp.js
const axios = require('axios');
require('dotenv').config();

const BASE = `https://graph.facebook.com/v20.0/${process.env.WHATSAPP_PHONE_NUMBER_ID}/messages`;

async function callApi(payload) {
  const headers = {
    Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
    'Content-Type': 'application/json',
  };
  try {
    return await axios.post(BASE, payload, { headers });
  } catch (err) {
    console.error('WhatsApp API error, retrying once:', err.response?.data || err.message);
    return await axios.post(BASE, payload, { headers });
  }
}

async function sendText(to, body) {
  return callApi({ messaging_product: 'whatsapp', to, type: 'text', text: { body } });
}

async function sendImage(to, imageUrl, caption) {
  return callApi({
    messaging_product: 'whatsapp',
    to,
    type: 'image',
    image: { link: imageUrl, caption: caption || '' },
  });
}

async function sendButtons(to, bodyText, buttons) {
  return callApi({
    messaging_product: 'whatsapp',
    to,
    type: 'interactive',
    interactive: {
      type: 'button',
      body: { text: bodyText },
      action: { buttons: buttons.map(b => ({ type: 'reply', reply: { id: b.id, title: b.title } })) },
    },
  });
}

module.exports = { sendText, sendImage, sendButtons };
