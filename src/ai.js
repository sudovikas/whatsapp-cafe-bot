// "Bee" - optional Groq LLM used ONLY for small talk and questions.
// It never touches the cart, prices, totals, order IDs or payment status. If Groq is down
// or the key is missing, every function returns null and the bot uses plain replies.
const config = require('./config');
const { menuText, ITEMS, BY_ID } = require('./menu');

let cachedModel = null;
let lastModelFetch = 0;

async function getLiveGroqModel() {
  if (cachedModel && Date.now() - lastModelFetch < 3600000) return cachedModel;
  try {
    const res = await fetch(`${config.groqBase}/models`, {
      headers: { Authorization: `Bearer ${config.groqKey}` },
      signal: AbortSignal.timeout(5000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok && Array.isArray(data.data)) {
      const active = data.data
        .filter(m => m.active !== false)
        .map(m => m.id)
        .filter(id => !/whisper|tts|embed|vision|guard/i.test(id));

      console.log('[Groq] Live available models on account:', active);

      // Prioritize modern chat models
      const chosen = active.find(m => m === config.groqModel)
        || active.find(m => m.includes('70b') && !m.includes('specdec'))
        || active.find(m => m.includes('llama') && !m.includes('guard'))
        || active.find(m => m.includes('mixtral'))
        || active.find(m => m.includes('gemma'))
        || active[0];

      if (chosen) {
        cachedModel = chosen;
        lastModelFetch = Date.now();
        console.log('[Groq] Automatically selected model:', cachedModel);
        return cachedModel;
      }
    }
  } catch (err) {
    console.warn('[Groq] Model discovery error:', err.message);
  }
  return config.groqModel || 'llama-3.3-70b-versatile';
}

async function groq(body) {
  if (!config.groqKey) return null;
  const model = await getLiveGroqModel();
  try {
    const res = await fetch(`${config.groqBase}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.groqKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, ...body }),
      signal: AbortSignal.timeout(8000),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      return (data.choices?.[0]?.message?.content || '').trim() || null;
    }
    console.warn(`Groq error with model ${model}:`, res.status, data.error?.message || '');
    cachedModel = null; // Invalidate cached model so next call re-discovers
    return null;
  } catch (err) {
    console.error('Groq unavailable:', err.message);
    return null;
  }
}

function systemPrompt() {
  const c = config.cafe;
  return `You are "Bee", the witty, street-smart, and charming AI assistant of ${c.name} ("${c.tagline}") in Shivpur, Varanasi.

Your Personality & Tone:
- Talk like a real, fun Banarasi host with a witty, playful, and slightly sarcastic sense of humor ("Guru", "Bhaiya", playful Banarasi banter). Never sound like a robotic corporate bot.
- You effortlessly speak and understand Hindi, English, and Hinglish. Match the customer's language and vibe naturally.
- Be cheeky and playfully sarcastic when asked funny questions (like discounts, free food, who is better), but always warm, courteous, and helpful.
- When asked for recommendations ("best pizza", "best burger", "kya khayein"): Proudly recommend Beeburg favorites! (e.g., Paneer Maharaja Burger ₹150, Chicken Maharaja ₹160, Farm House Pizza ₹170, Makhni Paneer Pizza ₹180, Classic Cold Coffee ₹60, Cheesy Fries ₹130).

Cafe facts:
- Address: ${c.address}.
- Hours: ${c.hours} (Open till 2 AM late night!).
- Phone: ${c.phone}.
- Delivery: Free home delivery anywhere in the area.
- Payment: UPI QR (exact amount) or Cash on delivery/pickup.

MENU (prices in rupees; S/M/L = small/medium/large):
${menuText()}

Important Constraints:
- Keep replies punchy: 1 to 3 short sentences, with at most 1-2 natural emojis.
- Only recommend items from our real MENU.
- Never calculate order totals or invent order IDs (the system handles checkout).
- To order, customers just type item names with quantity, e.g., "2 cheese burger, 1 cold coffee".`;
}

function localSmartReply(text) {
  const lower = String(text || '').toLowerCase().trim();

  // 1. Pizza recommendations
  if (/(pizza).*(best|accha|achha|khas|special|suggest|recommend|favourite|favorite|top)|(best|accha|achha|khas|special|suggest|recommend|favourite|favorite|top).*(pizza)/.test(lower)) {
    return `🍕 Pizza me compromise kaisa guru! Veg me humara *Farm House Pizza* (₹170) aur *Makhni Paneer Pizza* (₹180) lajawab hai. Non-veg ho to *Peri Peri Chicken Pizza* (₹150) try karo, dil khush ho jayega! Size batana (Small, Medium, Large) aur batao kitna bhej de?`;
  }

  // 2. Burger recommendations
  if (/(burger).*(best|accha|achha|khas|special|suggest|recommend|favourite|favorite|top)|(best|accha|achha|khas|special|suggest|recommend|favourite|favorite|top).*(burger)/.test(lower)) {
    return `🍔 Burger ke maamle me Beeburg se behtar kya milega! Veg me *Paneer Maharaja Burger* (₹150) khao — naam hi Maharaja hai! Non-veg me *Chicken Maharaja Burger* (₹160) ekdum blockbuster hai. Pocket tight ho to *Cheese Burger* (₹70) bhi mast hai. Batao kitne burger laga de?`;
  }

  // 3. General recommendations / Best items
  if (/(kya.*(khaye|accha|achha|order|badhiya))|(best|special|favourite|favorite|recommend|bestseller|famous|kuch accha|kuch achha|kya hai khas)/.test(lower)) {
    return `🐝 Beeburg ka hit combo try karo guru: Ek *Paneer Maharaja Burger* ya *Farm House Pizza*, sath me crispy *Cheesy Fries* aur chilled *Classic Cold Coffee*! Ek baar khao, maza aa jayega. Order karne ke liye bas item ka naam aur quantity likh do!`;
  }

  // 4. Discounts / Free food / Sarcasm
  if (/(discount|free|offer|coupon|sasta|kam karo|bargain|kam paisa)/.test(lower)) {
    return `Arre guru! 😂 Home delivery already free kar rakhi hai, ₹50 me burger de rahe hai, ab kya cafe bhi naam karwa loge? Ek baar khao to sahi, har rupaya wasool lagega! Batao kya order kare? 🍔`;
  }

  // 5. Taste / Freshness
  if (/(taste|swad|quality|fresh|kaisa hai)/.test(lower)) {
    return `Taste ka to aisa hai guru, ki Banaras me ek baar jo Beeburg ka pizza-burger khata hai wo bar-bar mangwata hai! 😋 Ekdum fresh aur garma-garam banega, doubt mat karo!`;
  }

  // 6. Timings / Late night
  if (/(timing|time|timings|kab tak|close|open|khula|raat|late night)/.test(lower)) {
    return `⏰ Hum subah 11 AM se lekar raat ke 2 AM tak khule rehte hai! Jab aadhi raat ko bhookh sataye, Beeburg ko yaad kar lena, kitchen on rehti hai 🛵🔥`;
  }

  // 7. Location / Address
  if (/(kahan|kaha|address|location|pata|where)/.test(lower)) {
    return `📍 Humara address hai: Suddhipur Bypass Main Gate, Gangotri Nagar Colony, Canara Bank ke bagal me (near Indian Oil Petrol Pump), Shivpur, Varanasi! Direct cafe aao ya WhatsApp pe order karke free delivery pao.`;
  }

  // 8. Delivery charges
  if (/(delivery|ghar|pahucha|charge)/.test(lower)) {
    return `🛵 Home delivery bilkul FREE hai guru! Minimum order ka bhi koi lafda nahi, bas batao kya khane ka mood hai!`;
  }

  // 9. Parking
  if (/(parking|gadi|car|bike)/.test(lower)) {
    return `Haan ji! I can take your order right here 🙂 Cafe par bike aur car dono ki parking suvidha hai. Call us on 8052937561 if you need directions!`;
  }

  // 10. Casual banter / greetings
  if (/(kya be|kya hal|kaise ho|kaisa hai|sab badhiya|kya chal raha|bhaiya|guru)/.test(lower)) {
    return `Sab ekdum Banarasi first-class guru! 😎 Aap batao aaj kya khane ka mood hai — crispy burger, cheesy pizza ya chilled cold coffee?`;
  }

  return null;
}

async function chat(text, history = [], context = '') {
  const g = await groq({
    messages: [
      { role: 'system', content: systemPrompt() },
      ...(context ? [{ role: 'system', content: `Current situation: ${context}` }] : []),
      ...history.slice(-6),
      { role: 'user', content: text },
    ],
    temperature: 0.7, max_tokens: 180,
  });
  if (g) return g;
  return localSmartReply(text);
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
