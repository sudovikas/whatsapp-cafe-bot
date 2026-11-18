// Multi-tenant Cafe Registry
const fs = require('fs');
const path = require('path');
const config = require('./config');

let customCafes = null;

function loadCafes() {
  if (customCafes) return customCafes;
  const file = path.join(config.dataDir, 'cafes.json');
  try {
    if (fs.existsSync(file)) {
      customCafes = JSON.parse(fs.readFileSync(file, 'utf8'));
    }
  } catch (err) {
    console.warn('Could not read cafes.json:', err.message);
  }
  if (!Array.isArray(customCafes)) customCafes = [];
  return customCafes;
}

function getCafeByPhoneId(phoneId) {
  const cafes = loadCafes();
  const found = cafes.find(c => c.phoneId === String(phoneId || '') || c.phoneKey === String(phoneId || ''));
  if (found) return found;
  return {
    id: 'default',
    name: config.cafe.name,
    tagline: config.cafe.tagline,
    phone: config.cafe.phone,
    address: config.cafe.address,
    hours: config.cafe.hours,
    owner: config.owner,
    phoneId: config.waPhoneId,
    upiVpa: config.upiVpa,
    upiName: config.upiName,
  };
}

module.exports = { getCafeByPhoneId, loadCafes };
