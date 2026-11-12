// All environment access lives here. Values are read lazily so tests can set env first.
const env = (k, d = '') => (process.env[k] || d).trim();

const config = {
  get port() { return Number(env('PORT', '3000')); },
  get waToken() { return env('WHATSAPP_TOKEN'); },
  get waPhoneId() { return env('WHATSAPP_PHONE_NUMBER_ID'); },
  get verifyToken() { return env('WHATSAPP_VERIFY_TOKEN'); },
  get appSecret() { return env('META_APP_SECRET'); },
  get owner() { return env('OWNER_WHATSAPP_NUMBER').replace(/\D/g, ''); },
  get baseUrl() { return env('BASE_URL').replace(/\/+$/, ''); },
  get upiVpa() { return env('UPI_VPA'); },
  get upiName() { return env('UPI_NAME', 'Beeburg Cafe'); },
  get groqKey() { return env('GROQ_API_KEY'); },
  get groqModel() { return env('GROQ_MODEL', 'llama-3.3-70b-versatile'); },
  get adminSecret() { return env('ADMIN_SECRET'); },
  get dataDir() { return env('DATA_DIR', './data'); },
  get graphBase() { return env('GRAPH_BASE_URL', 'https://graph.facebook.com').replace(/\/+$/, ''); },
  get graphVersion() { return env('GRAPH_VERSION', 'v23.0'); },
  get groqBase() { return env('GROQ_BASE_URL', 'https://api.groq.com/openai/v1').replace(/\/+$/, ''); },

  cafe: {
    name: 'Beeburg Cafe',
    tagline: 'Slice of Happiness',
    phone: '8052937561',
    address: 'Suddhipur Bypass Main Gate, Gangotri Nagar Colony, beside Canara Bank near Indian Oil Petrol Pump, Shivpur, Varanasi 221003',
    hours: '11 AM to 2 AM, every day',
  },

  missing() {
    const need = {
      WHATSAPP_TOKEN: this.waToken,
      WHATSAPP_PHONE_NUMBER_ID: this.waPhoneId,
      WHATSAPP_VERIFY_TOKEN: this.verifyToken,
      OWNER_WHATSAPP_NUMBER: this.owner,
      BASE_URL: this.baseUrl,
    };
    return Object.keys(need).filter(k => !need[k]);
  },
};

module.exports = config;
