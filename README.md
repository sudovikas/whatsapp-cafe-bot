# Beeburg Cafe WhatsApp ordering bot (v2)

Customers order on WhatsApp from the real menu, get an itemised total, choose pickup or free
delivery, and pay by UPI (QR with the exact amount) or cash. The owner runs every order by tapping
buttons in WhatsApp.

## What a customer sees

1. Sends **hi** → gets both menu pages.
2. Sends **2 cheese burger, 1 margherita** → bot asks the pizza size with buttons, then shows the
   cart with prices and total.
3. Taps **Confirm** → picks delivery (sends address or location) or pickup → picks UPI or cash.
4. UPI: gets a QR that already contains the amount and order number, pays, replies **paid**.
5. Gets a message when payment is confirmed, when the order is ready, and when it is handed over.

Other things customers can type: `menu`, `status`, `cancel`, `remove fries`, `note: no onion`.

## What the owner does

Every new order arrives on the owner's WhatsApp with buttons:
**Payment received → Ready / Out for delivery → Handed over**, or **Cancel order**.

Typed commands also work: `paid BB1432`, `ready BB1432`, `done BB1432`, `cancel BB1432`,
`orders`, `pending`, `help`. To test as a customer from the owner's phone, start the message
with `#` (for example `#hi`).

**Important:** WhatsApp only lets the bot message someone who has written to it in the last
24 hours. The owner should send the bot any message (for example `orders`) at the start of each
day, otherwise new-order alerts will not arrive.

## Setup

### 1. Environment variables (Render → your service → Environment)

| Variable | What to put |
|---|---|
| `WHATSAPP_TOKEN` | Permanent System User token (step 2) |
| `WHATSAPP_PHONE_NUMBER_ID` | Meta → WhatsApp → API Setup |
| `WHATSAPP_VERIFY_TOKEN` | Any long random string. Use a new one, not `beeburg_verify_123` |
| `META_APP_SECRET` | Meta → App settings → Basic → App secret (rejects fake webhook calls) |
| `OWNER_WHATSAPP_NUMBER` | Owner's number with country code, no `+` |
| `BASE_URL` | `https://whatsapp-cafe-bot.onrender.com` |
| `UPI_VPA` | The cafe's real UPI ID. Leave empty to offer cash only |
| `UPI_NAME` | `Beeburg Cafe` |
| `GROQ_API_KEY` | Optional. Without it the bot still takes orders, with plain replies |
| `ADMIN_SECRET` | Long random string for the dashboard. Use a new one |
| `DATA_DIR` | Optional. Path of a Render persistent disk, to keep order history |

### 2. Permanent WhatsApp token

business.facebook.com/settings → Users → System users → Add (Admin) → Assign assets (your app and
your WhatsApp account, full control) → Generate token → expiry **Never**, permissions
`whatsapp_business_messaging` and `whatsapp_business_management`.

### 3. Webhook

Meta Developer Portal → your app → WhatsApp → Configuration: callback URL
`<BASE_URL>/webhook`, verify token = `WHATSAPP_VERIFY_TOKEN`, subscribe to **messages**.

### 4. Check it

Open `<BASE_URL>/health?key=<ADMIN_SECRET>`. It calls Meta and Groq with your keys and tells you
which one is failing. `"ready": true` means the bot can send messages.

Orders dashboard: `<BASE_URL>/admin?key=<ADMIN_SECRET>`.

## Changing the menu or prices

Edit `src/menu.js` and redeploy. Prices exist only in that file. If you replace the menu pictures,
keep the file names `public/menu-burgers.jpg` and `public/menu-pizzas.jpg`.

## Run and test on your computer

```bash
npm install
npm test          # 17 tests: full order flows against a fake WhatsApp and a fake Groq
cp .env.example .env && npm run dev
```

## Good to know

- On Render's free plan the disk is wiped on every restart, so the dashboard and `orders` list
  start empty again. Each order is still in the owner's WhatsApp chat. Add a persistent disk and
  set `DATA_DIR` to keep history.
- Render's free plan sleeps after 15 idle minutes; the first message after that takes up to a
  minute to get a reply.
- Some UPI apps limit payments made from a QR opened from the gallery. The message also shows the
  UPI ID so customers can pay to it directly.
- The Meta test number (+1 555…) only reaches numbers you add under API Setup. For real customers,
  register the cafe's own number and switch the Meta app to Live.

## Files

```
server.js          starts the server
src/app.js         webhook, QR image, dashboard, health check
src/customer.js    customer conversation and checkout
src/owner.js       owner buttons and commands
src/parser.js      turns typed text into menu items (rules, typo tolerant, no AI)
src/menu.js        the menu and prices
src/ai.js          "Bee" small talk via Groq (optional)
src/store.js       orders file and chat sessions
src/whatsapp.js    WhatsApp Cloud API calls
test/              automated tests
```
