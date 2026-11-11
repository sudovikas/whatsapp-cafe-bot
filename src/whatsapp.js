// Thin wrapper over the WhatsApp Cloud API. Retries once on network / 5xx / rate-limit errors only.
const config = require('./config');

async function call(payload, attempt = 1) {
  const url = `${config.graphBase}/${config.graphVersion}/${config.waPhoneId}/messages`;
  let res, body;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.waToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ messaging_product: 'whatsapp', ...payload }),
      signal: AbortSignal.timeout(15000),
    });
    body = await res.json().catch(() => ({}));
  } catch (err) {
    if (attempt < 2) return call(payload, attempt + 1);
    throw new Error(`WhatsApp network error: ${err.message}`);
  }
  if (res.ok) return body;
  if ((res.status >= 500 || res.status === 429) && attempt < 2) {
    await new Promise(r => setTimeout(r, 800));
    return call(payload, attempt + 1);
  }
  const e = body.error || {};
  const err = new Error(`WhatsApp API ${res.status} (code ${e.code || '?'}): ${e.message || 'unknown error'}${hint(res.status, e.code)}`);
  err.code = e.code; err.status = res.status;
  throw err;
}

function hint(status, code) {
  if (status === 401 || code === 190) return ' -> WHATSAPP_TOKEN is expired or wrong. Generate a permanent System User token.';
  if (code === 131030) return ' -> This number is not in the test recipient list (Meta > WhatsApp > API Setup > To).';
  if (code === 131047) return ' -> 24-hour window closed: this person must message the bot first (owner: send "hi" to the bot once a day).';
  if (code === 100) return ' -> Check WHATSAPP_PHONE_NUMBER_ID.';
  return '';
}

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);

const sendText = (to, body) => call({ to, type: 'text', text: { body: clip(body, 4096), preview_url: false } });
const sendImage = (to, link, caption = '') => call({ to, type: 'image', image: { link, caption: clip(caption, 1024) } });
const sendButtons = (to, body, buttons) => call({
  to, type: 'interactive',
  interactive: {
    type: 'button',
    body: { text: clip(body, 1024) },
    action: { buttons: buttons.slice(0, 3).map(b => ({ type: 'reply', reply: { id: b.id, title: clip(b.title, 20) } })) },
  },
});
const markRead = id => call({ status: 'read', message_id: id }).catch(() => {});

module.exports = { sendText, sendImage, sendButtons, markRead };
