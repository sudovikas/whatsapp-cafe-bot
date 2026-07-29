// services/ai.js
// Gives the bot a fun, warm "cafe receptionist" personality using Groq's free-tier LLM API
// (https://console.groq.com - free API key, generous rate limits, very fast responses).
// Used ONLY for natural-sounding chat text. All order logic, order IDs, and payment
// confirmation stay in server.js's state machine - the AI never decides business logic.
const axios = require('axios');
require('dotenv').config();

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const MODEL = 'llama-3.1-8b-instant'; // fast + free tier friendly

const SYSTEM_PROMPT = `You are Bee, the friendly, witty receptionist at Beeburg Cafe ("Slice of Happiness") in Varanasi.
You're chatting with a customer on WhatsApp. Be warm, a little playful, use 1 emoji max per message, keep replies SHORT
(1-3 sentences), and sound like a real person, not a corporate bot.
Only mention menu items from the provided list. If asked about something not on the list, say it's not available and suggest checking the menu.
Never invent menu items or prices. Never invent order IDs, payment status, or confirm payments yourself - that's handled by
the cafe owner. If asked something you don't know, be honest and warmly redirect them to type "menu" or ask the owner.`;

async function chat(userMessage, contextHint, history = [], menuList = []) {
  try {
    const menuText = menuList.map(item => `- ${item.item} (${item.category}): Rs. ${item.price}`).join('\n');
    const systemPromptWithMenu = `${SYSTEM_PROMPT}\n\nAvailable Menu:\n${menuText}`;

    const messages = [
      { role: 'system', content: systemPromptWithMenu },
      { role: 'system', content: `Context: ${contextHint}` },
      ...history,
      { role: 'user', content: userMessage },
    ];
    const res = await axios.post(
      GROQ_URL,
      { model: MODEL, messages, temperature: 0.8, max_tokens: 120 },
      { headers: { Authorization: `Bearer ${process.env.GROQ_API_KEY}`, 'Content-Type': 'application/json' } }
    );
    return res.data.choices[0].message.content.trim();
  } catch (err) {
    console.error('AI chat failed, falling back to plain text:', err.response?.data || err.message);
    return null;
  }
}

module.exports = { chat };

