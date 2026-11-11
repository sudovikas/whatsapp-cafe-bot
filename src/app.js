const crypto = require('crypto');
const path = require('path');
const express = require('express');
const QRCode = require('qrcode');
const config = require('./config');
const store = require('./store');
const wa = require('./whatsapp');
const customer = require('./customer');
const owner = require('./owner');
const dashboard = require('./dashboard');

function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '1mb', verify: (req, _res, buf) => { req.rawBody = buf; } }));
  app.use('/public', express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));

  app.get('/', (_req, res) => res.send('Beeburg Cafe WhatsApp Bot is running.'));

  // ---- Meta webhook handshake ----
  app.get('/webhook', (req, res) => {
    if (req.query['hub.mode'] === 'subscribe' && config.verifyToken && req.query['hub.verify_token'] === config.verifyToken) {
      return res.status(200).send(String(req.query['hub.challenge'] || ''));
    }
    return res.sendStatus(403);
  });

  // ---- incoming messages ----
  const seen = new Set();          // message ids already handled (Meta re-delivers)
  const queues = new Map();        // one message at a time per phone number
  const enqueue = (phone, job) => {
    const run = (queues.get(phone) || Promise.resolve()).then(job).catch(err => console.error(`[${phone}] handler error:`, err.message));
    queues.set(phone, run);
    run.then(() => { if (queues.get(phone) === run) queues.delete(phone); });
  };
  app.locals.idle = async () => { while (queues.size) await Promise.all([...queues.values()]); };

  app.post('/webhook', (req, res) => {
    if (config.appSecret) {
      const sig = req.get('x-hub-signature-256') || '';
      const want = 'sha256=' + crypto.createHmac('sha256', config.appSecret).update(req.rawBody || '').digest('hex');
      if (sig.length !== want.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(want))) return res.sendStatus(401);
    }
    res.sendStatus(200); // answer Meta first, work after

    for (const entry of req.body?.entry || []) {
      for (const change of entry.changes || []) {
        const value = change.value || {};
        for (const st of value.statuses || []) {
          if (st.status === 'failed') console.error(`Delivery FAILED to ${st.recipient_id}:`, JSON.stringify(st.errors || []));
        }
        for (const m of value.messages || []) {
          if (!m.id || seen.has(m.id)) continue;
          seen.add(m.id);
          if (seen.size > 5000) seen.delete(seen.values().next().value);
          if (m.timestamp && Date.now() / 1000 - Number(m.timestamp) > 600) { console.log(`Skipping old message from ${m.from}`); continue; }

          const name = (value.contacts || []).find(c => c.wa_id === m.from)?.profile?.name || '';
          const msg = { id: m.id, from: m.from, name, type: 'other', text: '', buttonId: '' };
          if (m.type === 'text') { msg.type = 'text'; msg.text = m.text?.body || ''; }
          else if (m.type === 'interactive' && m.interactive?.button_reply) { msg.type = 'button'; msg.buttonId = m.interactive.button_reply.id; msg.text = m.interactive.button_reply.title || ''; }
          else if (m.type === 'button') { msg.type = 'text'; msg.text = m.button?.text || ''; }
          else if (m.type === 'image') msg.type = 'image';
          else if (m.type === 'location') { msg.type = 'location'; msg.location = m.location || {}; }

          console.log(`[in] ${m.from} ${msg.type}: ${msg.buttonId || msg.text.slice(0, 80)}`);
          enqueue(m.from, async () => {
            wa.markRead(m.id);
            // Owner messages are commands, unless they start with "#" (test as a customer)
            // or they tap a customer button while testing.
            if (config.owner && m.from === config.owner) {
              const asCustomer = msg.text.startsWith('#') || (msg.type === 'button' && !msg.buttonId.startsWith('o:')) || ['image', 'location'].includes(msg.type);
              if (!asCustomer) return owner.handle(msg);
              msg.text = msg.text.replace(/^#\s*/, '');
            }
            return customer.handle(msg);
          });
        }
      }
    }
  });

  // ---- UPI QR with the exact amount for one order ----
  app.get('/qr/:file', async (req, res) => {
    const order = store.findOrder(String(req.params.file).replace(/\.png$/i, ''));
    if (!order || !config.upiVpa) return res.sendStatus(404);
    const uri = `upi://pay?pa=${encodeURIComponent(config.upiVpa)}&pn=${encodeURIComponent(config.upiName)}&am=${order.total.toFixed(2)}&cu=INR&tn=${encodeURIComponent('Order ' + order.id)}`;
    const png = await QRCode.toBuffer(uri, { type: 'png', width: 720, margin: 3, errorCorrectionLevel: 'M' });
    res.set('Cache-Control', 'public, max-age=3600').type('png').send(png);
  });

  // ---- admin ----
  const admin = (req, res, next) => {
    if (!config.adminSecret) return res.status(503).send('Set ADMIN_SECRET to enable this page.');
    const key = String(req.query.key || req.query.secret || '');
    const a = crypto.createHash('sha256').update(key).digest(), b = crypto.createHash('sha256').update(config.adminSecret).digest();
    if (!crypto.timingSafeEqual(a, b)) return res.status(403).send('Forbidden');
    next();
  };
  app.get(['/admin', '/orders'], admin, (_req, res) => res.set('Cache-Control', 'no-store').send(dashboard.page()));

  // One URL that tells you exactly what is and isn't working.
  app.get('/health', admin, async (_req, res) => {
    const out = { config: { missing: config.missing(), upi: !!config.upiVpa, ai: !!config.groqKey, webhookSignatureCheck: !!config.appSecret } };
    try {
      const r = await fetch(`${config.graphBase}/${config.graphVersion}/${config.waPhoneId}?fields=display_phone_number,verified_name`, { headers: { Authorization: `Bearer ${config.waToken}` }, signal: AbortSignal.timeout(10000) });
      const j = await r.json();
      out.whatsapp = r.ok ? { ok: true, number: j.display_phone_number, name: j.verified_name } : { ok: false, error: j.error?.message || `HTTP ${r.status}` };
    } catch (e) { out.whatsapp = { ok: false, error: e.message }; }
    if (config.groqKey) {
      try {
        const r = await fetch(`${config.groqBase}/models`, { headers: { Authorization: `Bearer ${config.groqKey}` }, signal: AbortSignal.timeout(10000) });
        const j = await r.json();
        const models = (j.data || []).map(m => m.id);
        out.groq = r.ok ? { ok: true, modelAvailable: models.includes(config.groqModel), model: config.groqModel } : { ok: false, error: j.error?.message || `HTTP ${r.status}` };
      } catch (e) { out.groq = { ok: false, error: e.message }; }
    } else out.groq = { ok: false, error: 'GROQ_API_KEY not set (bot still works, with plain replies)' };
    out.ready = out.config.missing.length === 0 && out.whatsapp.ok;
    res.set('Cache-Control', 'no-store').json(out);
  });

  return app;
}

module.exports = { createApp };
