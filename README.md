# WhatsApp Cafe Ordering + Payment Bot

A free-tier WhatsApp bot for a small cafe: browse menu, place an order, pay via Razorpay, get notified.

## 1. Meta WhatsApp Cloud API setup

1. Go to https://developers.facebook.com/ and create a **Business** app (App type: "Business").
2. Inside the app, add the **WhatsApp** product.
3. In WhatsApp > API Setup you'll see:
   - A **temporary access token** (valid ~24h, fine for testing) and **Phone Number ID**.
   - For production, create a **System User** in Meta Business Suite and generate a **permanent token** with `whatsapp_business_messaging` permission.
4. Add a test recipient phone number (your own WhatsApp number) under "To" in API Setup, and verify it via the OTP Meta sends.
5. Set env vars:
   - `WHATSAPP_TOKEN` = the access token
   - `WHATSAPP_PHONE_NUMBER_ID` = the Phone Number ID shown in API Setup
   - `WHATSAPP_VERIFY_TOKEN` = any string you invent (e.g. `dawaai_verify_123`) — you'll reuse this in step 6.
6. In WhatsApp > Configuration, set the **Webhook URL** to `https://<your-deployed-app>/webhook` and **Verify Token** to the same string as `WHATSAPP_VERIFY_TOKEN`. Click "Verify and Save" (your server must already be deployed and running).
7. Subscribe to the `messages` webhook field.

## 2. Google Sheets setup

1. Create a new Google Sheet with two tabs:
   - **Menu**: columns `Category | Item Name | Price | Available Y/N`
   - **Orders**: columns `Timestamp | Phone Number | Items | Total | Payment Status | Order Status | Payment Link ID`
2. Go to https://console.cloud.google.com/ → create a project → enable the **Google Sheets API**.
3. Create a **Service Account** (IAM & Admin > Service Accounts), then create a **JSON key** and download it.
4. From the JSON, copy `client_email` into `GOOGLE_SHEETS_CLIENT_EMAIL` and `private_key` into `GOOGLE_SHEETS_PRIVATE_KEY` (keep the `\n` characters literal in the .env file, wrapped in quotes).
5. Open your Google Sheet, click **Share**, and share it with the `client_email` address as **Editor**.
6. Copy the Sheet ID from the URL (`https://docs.google.com/spreadsheets/d/<SHEET_ID>/edit`) into `GOOGLE_SHEET_ID`.

## 3. Razorpay test keys

1. Sign up at https://dashboard.razorpay.com/ (free).
2. Switch to **Test Mode** (toggle top-left).
3. Go to Settings > API Keys > Generate Test Key. Copy `Key Id` and `Key Secret` into `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET`.
4. Go to Settings > Webhooks > Add New Webhook:
   - URL: `https://<your-deployed-app>/razorpay-webhook`
   - Active events: `payment_link.paid`, `payment_link.cancelled`, `payment_link.expired`
   - Set a Webhook Secret and put it in `RAZORPAY_WEBHOOK_SECRET`.
5. Test payments can be completed using Razorpay's test card `4111 1111 1111 1111`, any future expiry, any CVV.

## 4. Deploy free on Render

1. Push this project to a GitHub repo.
2. On https://render.com create a **New Web Service**, connect the repo.
3. Build command: `npm install`. Start command: `npm start`.
4. Add all variables from `.env.example` under Render's Environment tab (paste the private key with actual newlines or `\n` escapes, either works — the code handles both).
5. Deploy. Copy the generated URL (e.g. `https://cafe-bot.onrender.com`) and use it for `BASE_URL`, the Meta webhook URL, and the Razorpay webhook URL.

Railway works the same way: New Project → Deploy from GitHub → add env vars → deploy.

Note: Render/Railway free tiers sleep after inactivity, causing a delay on the first message after idle time. This is acceptable for an MVP/cafe scale.

## 5. Testing end-to-end

1. Fill in the Menu sheet with a few rows (mark `Available Y/N` = `Y`).
2. From your verified test WhatsApp number, send any message (e.g. "hi") to the cafe's WhatsApp test number.
3. You should receive a category list → pick a category → pick an item → pick quantity → see order summary.
4. Tap "Confirm" — you'll get a Razorpay payment link.
5. Pay using the test card above. Within a few seconds, you should get a WhatsApp confirmation with pickup time, and the Orders sheet row should update to "Paid" / "Preparing".
6. To simulate "Ready", either update the sheet manually and add your own polling later, or call:
   ```
   curl -X POST https://<your-app>/order-status -H "Content-Type: application/json" -d '{"phone":"91XXXXXXXXXX","status":"Ready for pickup"}'
   ```

## 6. Local development

```bash
npm install
cp .env.example .env   # fill in real values
npm run dev
```

Use a tunneling tool like `ngrok http 3000` to expose your local server temporarily for Meta/Razorpay webhook testing before deploying.

## Project structure

```
server.js              # Express app, webhook routes, conversation state machine
services/whatsapp.js   # Send text/list/button messages via Cloud API
services/sheets.js     # Google Sheets read (Menu) / write (Orders), with retry queue
services/razorpay.js   # Payment link creation + webhook signature check
services/state.js      # In-memory per-phone conversation state
.env.example           # All required environment variables
```

## Notes on scope decisions

- Order status "Ready" notifications are **manual** for MVP (via `/order-status` endpoint) rather than auto-polling the sheet, per the spec's optional fallback.
- Conversation state resets after 30 minutes of inactivity per phone number.
- Failed Sheets writes are queued in memory and retried every 15 seconds until they succeed.
