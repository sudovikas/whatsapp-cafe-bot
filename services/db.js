// services/db.js
// A simple, reliable flat-file JSON database to persist orders on disk.
// Avoids external database compilation dependencies (e.g. SQLite3 native builds on Render).
const fs = require('fs');
const path = require('path');

const FILE_PATH = path.join(__dirname, '../orders.json');

function readOrders() {
  try {
    if (!fs.existsSync(FILE_PATH)) {
      return [];
    }
    const data = fs.readFileSync(FILE_PATH, 'utf8');
    return JSON.parse(data || '[]');
  } catch (err) {
    console.error('Error reading orders file:', err.message);
    return [];
  }
}

function writeOrders(orders) {
  try {
    fs.writeFileSync(FILE_PATH, JSON.stringify(orders, null, 2), 'utf8');
  } catch (err) {
    console.error('Error writing orders file:', err.message);
  }
}

function saveOrder(order) {
  const orders = readOrders();
  orders.push({
    orderId: order.orderId,
    phone: order.phone,
    name: order.name,
    orderText: order.orderText,
    timestamp: new Date().toISOString(),
    paymentMethod: order.paymentMethod || 'UPI',
    status: order.status || 'Pending Payment'
  });
  writeOrders(orders);
}

function updateOrderStatus(orderId, updates) {
  const orders = readOrders();
  const order = orders.find(o => o.orderId === orderId);
  if (order) {
    Object.assign(order, updates);
    writeOrders(orders);
    return order;
  }
  return null;
}

module.exports = {
  readOrders,
  saveOrder,
  updateOrderStatus
};
