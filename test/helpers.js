// Test harness: a fake Meta Graph API + fake Groq, and the real app wired to them.
const http = require('http');
const os = require('os');
const fs = require('fs');
const path = require('path');

async function boot(extraEnv = {}) {
  const sent = [];
  const state = { groqReply: null, groqCalls: [], waFail: null };
  const mock = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => (body += c));
    req.on('end', () => {
      const json = body ? JSON.parse(body) : {};
      res.setHeader('Content-Type', 'application/json');
      if (req.url.endsWith('/messages')) {
        if (state.waFail) { res.statusCode = state.waFail.status; return res.end(JSON.stringify({ error: state.waFail })); }
        if (!json.status) sent.push(json);
        return res.end(JSON.stringify({ messages: [{ id: 'wamid.out' }] }));
      }
      if (req.url.endsWith('/chat/completions')) {
        state.groqCalls.push(json);
        if (state.groqReply === null) { res.statusCode = 401; return res.end(JSON.stringify({ error: { message: 'Invalid API Key' } })); }
        const content = typeof state.groqReply === 'function' ? state.groqReply(json) : state.groqReply;
        return res.end(JSON.stringify({ choices: [{ message: { content } }] }));
      }
      res.statusCode = 404; res.end('{}');
    });
  });
  await new Promise(r => mock.listen(0, r));
  const mockUrl = `http://127.0.0.1:${mock.address().port}`;

  Object.assign(process.env, {
    WHATSAPP_TOKEN: 'test-token', WHATSAPP_PHONE_NUMBER_ID: '111', WHATSAPP_VERIFY_TOKEN: 'verify-me',
    OWNER_WHATSAPP_NUMBER: '919000000001', BASE_URL: 'https://bot.example', UPI_VPA: 'beeburg@okbank',
    GROQ_API_KEY: 'gsk_test', ADMIN_SECRET: 'admin-key', META_APP_SECRET: '',
    GRAPH_BASE_URL: mockUrl, GROQ_BASE_URL: mockUrl,
    DATA_DIR: fs.mkdtempSync(path.join(os.tmpdir(), 'beeburg-')),
  }, extraEnv);
  require('../src/store')._resetAll();

  const app = require('../src/app').createApp();
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const url = `http://127.0.0.1:${server.address().port}`;

  let n = 0;
  const deliver = async (from, message, headers = {}) => {
    const payload = { entry: [{ changes: [{ value: {
      contacts: [{ wa_id: from, profile: { name: message.name || 'Rahul Singh' } }],
      messages: [{ id: message.id || `wamid.${++n}`, from, timestamp: String(Math.floor(Date.now() / 1000)), ...message.body }],
    } }] }] };
    const mark = sent.length;
    const res = await fetch(`${url}/webhook`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(payload) });
    await new Promise(r => setTimeout(r, 15));
    await app.locals.idle();
    return { status: res.status, out: sent.slice(mark) };
  };
  const text = (from, t, opt = {}) => deliver(from, { ...opt, body: { type: 'text', text: { body: t } } });
  const tap = (from, id, opt = {}) => deliver(from, { ...opt, body: { type: 'interactive', interactive: { type: 'button_reply', button_reply: { id, title: 'x' } } } });
  const image = from => deliver(from, { body: { type: 'image', image: { id: 'media1' } } });

  // readable view of an outgoing message
  const view = m => ({
    to: m.to,
    text: m.text?.body || m.interactive?.body?.text || m.image?.caption || '',
    image: m.image?.link || null,
    buttons: (m.interactive?.action?.buttons || []).map(b => b.reply.id),
    titles: (m.interactive?.action?.buttons || []).map(b => b.reply.title),
  });
  const close = () => new Promise(r => server.close(() => mock.close(r)));
  return { url, state, sent, text, tap, image, view, close, OWNER: '919000000001', orders: () => require('../src/store').allOrders() };
}

module.exports = { boot };
