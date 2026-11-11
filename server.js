require('dotenv').config();
const { createApp } = require('./src/app');
const config = require('./src/config');

const app = createApp();
app.listen(config.port, () => {
  console.log(`Beeburg bot listening on port ${config.port}`);
  const missing = config.missing();
  if (missing.length) console.warn('MISSING CONFIG:', missing.join(', '));
});
