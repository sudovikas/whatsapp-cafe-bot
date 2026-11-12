// "Bee" - optional Groq LLM used ONLY for small talk and questions.
// It never touches the cart, prices, totals, order IDs or payment status. If Groq is down
// or the key is missing, every function returns null and the bot uses plain replies.
const config = require('./config');
const { menuText, ITEMS, BY_ID } = require('./menu');

async function groq(body) {
  if (!config.groqKey) return null;
  try {
    const res = await fetch(`${config.groqBase}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: config.groqModel, ...body }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) { console.error('Groq error', res.status, data.error?.message || ''); return null; }
    return (data.choices?.[0]?.message?.content || '').trim() || null;
  } catch (err) { console.error('Groq unavailable:', err.message); return null; }
}

function systemPrompt() {
  const c = config.cafe;
  return `You are Bee, a real, friendly and warm host at ${c.name} ("${c.tagline}") in Shivpur, Varanasi.
Talk like a real, welcoming person at the cafe counter, never sound like a robotic AI.
Reply naturally in whatever language the customer speaks (English, Hindi or Hinglish). Keep it friendly, courteous, and brief: 1-3 short sentences. At most one natural emoji.

Cafe facts: Address: ${c.address}. Open ${c.hours}. Phone: ${c.phone}. Free home delivery. Payment by UPI or cash.

MENU (prices in rupees; S/M/L = small/medium/large):
${menuText()}

Rules:
- Only mention items and prices that are in the MENU. If something is not on it, say it is not available and suggest a similar item that is.
- Never add up totals, never invent order IDs, never say an order is placed, confirmed, paid or on its way. The ordering system sends those messages.
- You cannot change the cart. To order, the customer sends item names with quantity, e.g. "2 cheese burger, 1 margherita medium".
- If you do not know something, say so and share the cafe phone number.`;
}

async function chat(text, history = [], context = '') {
  return groq({
    messages: [
      { role: 'system', content: systemPrompt() },
      ...(context ? [{ role: 'system', content: `Current situation: ${context}` }] : []),
      ...history.slice(-6),
      { role: 'user', content: text },
    ],
    temperature: 0.5, max_tokens: 160,
  });
}

// Last-resort helper for words the rule parser could not place (e.g. Hindi script).
// The answer is validated against the real menu, so a wrong guess can only ever be a real item,
// and the customer still sees and confirms the cart.
async function matchItem(text) {
  const out = await groq({
    messages: [
      { role: 'system', content: `Map the customer's words to exactly one menu item id from the list, or null if nothing fits well. Reply only with JSON like {"id":"cheese-burger"} or {"id":null}.\n${ITEMS.map(i => `${i.id} = ${i.name}`).join('\n')}` },
      { role: 'user', content: text },
    ],
    temperature: 0, max_tokens: 40, response_format: { type: 'json_object' },
  });
  try { return BY_ID.get(JSON.parse(out).id) || null; } catch { return null; }
}

module.exports = { chat, matchItem };
