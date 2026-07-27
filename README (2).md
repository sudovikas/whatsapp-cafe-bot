# Beeburg Cafe WhatsApp Bot — Meet Bee, Your AI Receptionist

This bot now has a real personality. "Bee" greets customers warmly, chats naturally, cracks the occasional
light joke, and still reliably takes orders and UPI payments behind the scenes — no payment gateway, no fees.

## What's new: the "fun to talk to" layer

- Every reply that isn't a strict system message (order summary, QR code, payment status) is generated live
  by a free LLM (Groq) with a custom personality prompt, so Bee sounds like a real person, not a script.
- If the AI API is slow/down, the bot automatically falls back to a plain friendly message — customers never
  see an error, ordering never breaks.
- The AI is only used for **tone/wording**. It never invents menu items, prices, order IDs, or confirms
  payments — that logic is 100% rule-based in `server.js`, so it's just as reliable as before.

## How the conversation feels now

- Customer: "hi" → Bee: "Hey there! Welcome to Beeburg Cafe, hope you're hungry today 😊 Sending you our menu now."
- Customer orders → Bee: "Ooh nice choice! Let me just double check with you before I send this to the kitchen..."
- Customer says something random → Bee: "Haha, not sure I follow that one! Type 'menu' and let's get you fed 😄"

Exact wording varies each time since it's AI-generated — that's what makes it feel alive.

## Setup: getting your free Groq API key (for the personality)

1. Go to https://console.groq.com and sign up (free, no card required).
2. Go to API Keys → Create API Key.
3. Copy it into `GROQ_API_KEY` in your `.env`.
4. Groq's free tier is very generous for a single-cafe bot's traffic — no cost expected.

## IMPORTANT: re-add your images

The sandbox this was built in reset and lost your uploaded files. Before deploying, add these 3 images to the `public/` folder (same filenames, no code changes needed):

- `public/menu-pizza.jpg` — your pizza/combo menu page
- `public/menu-burger.jpg` — your burger/sandwich/pasta menu page
- `public/upi-qr.jpg` — your cafe's UPI QR code (screenshot from GPay/PhonePe/Paytm)

## Full setup (same as before, plus Groq)

### 1. Meta WhatsApp Cloud API
1. https://developers.facebook.com/ → create a Business app → add WhatsApp product.
2. Note the temporary access token + Phone Number ID (use a permanent System User token for production).
3. Add your own number as a test recipient, verify via OTP.
4. Set `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_VERIFY_TOKEN` (any string you invent).
5. In WhatsApp > Configuration, set Webhook URL to `https://<your-app>/webhook`, same Verify Token, subscribe to `messages`.

### 2. Owner number
Set `OWNER_WHATSAPP_NUMBER` to your own WhatsApp number, international format, no "+" (e.g. `918052937561`). Also add it as a Meta test recipient during development.

### 3. Google Sheets
1. Create a Sheet, tab **Orders**, columns: `Order ID | Timestamp | Customer Name | Phone Number | Order Text | Payment Status | Order Status`.
2. Google Cloud Console: enable Sheets API → Service Account → JSON key.
3. `client_email` → `GOOGLE_SHEETS_CLIENT_EMAIL`, `private_key` → `GOOGLE_SHEETS_PRIVATE_KEY`.
4. Share the Sheet with that service account email as Editor.
5. Sheet ID from URL → `GOOGLE_SHEET_ID`.

## Testing

### Local with ngrok
```bash
npm install
cp .env.example .env    # fill in real values including GROQ_API_KEY
npm run dev
```
In a second terminal: `ngrok http 3000`. Set the ngrok URL as `BASE_URL`, use `<ngrok-url>/webhook` as Meta's webhook temporarily.

### End-to-end checklist
1. Message "hi" from your test WhatsApp number → check Bee's greeting sounds natural + both menu images arrive.
2. Reply with a sample order (e.g. "2 Cheese Burger, 1 French Fry") → check Bee's confirmation reply + Confirm/Edit/Cancel buttons.
3. Tap Confirm → check you get the UPI QR image + a friendly payment reminder with your Order ID.
4. As owner (`OWNER_WHATSAPP_NUMBER`), check you got the order notification.
5. As customer, reply "paid" → check Bee's "verifying" reply sounds warm, not robotic.
6. As owner, reply `confirm BB1001` (real order ID) → check customer gets the "payment confirmed, preparing" message and the Sheet updates.
7. As owner, reply `ready BB1001 <customer_phone>` → check customer gets notified.
8. Send garbage text (e.g. "asdkjhaskjd") at a random step → check Bee's fallback reply is playful, not a dead error.
9. Temporarily set `GROQ_API_KEY` to a wrong value and repeat step 1 → confirm the bot still works using the plain fallback text (proves reliability doesn't depend on the AI).

## Deploy free on Render

1. Push this project to GitHub.
2. Render → New Web Service → connect repo → Build: `npm install`, Start: `npm start`.
3. Add all vars from `.env.example` (real values) under Environment tab.
4. Deploy, copy the live URL, set as `BASE_URL`, update Meta's webhook to `https://<your-app>/webhook`.

Railway: New Project → Deploy from GitHub → add env vars → deploy. Same idea.

## Project structure

```
server.js               # Webhook, order flow, owner admin commands, weaves in AI replies
services/ai.js          # Groq LLM call for the "Bee" personality (with safe fallback)
services/whatsapp.js    # Send text/image/button messages via Cloud API
services/sheets.js      # Google Sheets write/update (Orders), with retry queue
services/state.js       # In-memory per-phone conversation state
public/menu-pizza.jpg   # <- RE-ADD: menu page 1
public/menu-burger.jpg  # <- RE-ADD: menu page 2
public/upi-qr.jpg        # <- RE-ADD: your UPI QR code
.env.example              # Required environment variables
```

## Tuning Bee's personality further

Open `services/ai.js` and edit `SYSTEM_PROMPT` — you can make Bee more formal, more Hinglish, add cafe-specific
jokes, mention your tagline "Slice of Happiness," or reference your location. Changes take effect immediately,
no other code needs to change.
