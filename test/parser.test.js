const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseOrder } = require('../src/parser');
const { ITEMS, priceOf } = require('../src/menu');

const lines = t => parseOrder(t).lines.map(l => `${l.qty} ${l.item.name}${l.size ? ' ' + l.size : ''}`);

test('plain orders', () => {
  assert.deepEqual(lines('2 cheese burger, 1 cold coffee'), ['2 Cheese Burger', '1 Classic Cold Coffee']);
  assert.deepEqual(lines('2 cheese burger 1 cold coffee'), ['2 Cheese Burger', '1 Classic Cold Coffee']);
  assert.deepEqual(lines('1 Margherita Pizza Medium, 2 Classic Cold Coffee'), ['1 Margherita Pizza medium', '2 Classic Cold Coffee']);
  assert.deepEqual(lines('i want 3 student burger please'), ['3 Student Burger']);
  assert.deepEqual(lines('cheese burger x2'), ['2 Cheese Burger']);
  assert.deepEqual(lines('onion pizza large + extra cheese topping large'), ['1 Onion Pizza large', '1 Extra Cheese Topping large']);
});
test('typos, plurals, Hinglish', () => {
  assert.deepEqual(lines('ek panner buger'), ['1 Paneer Burger']);
  assert.deepEqual(lines('2 chiken warp'), ['2 Chicken Wrap']);
  assert.deepEqual(lines('one aloo tikki wrap aur do french fries'), ['1 Aloo Tikki Wrap', '2 French Fry']);
  assert.deepEqual(lines('large farmhouse pizza'), ['1 Farm House Pizza large']);
  assert.deepEqual(lines('1 veggie 4 pizza small'), ['1 Veggie 4 Pizza small']);
  assert.deepEqual(lines('chicken wings 6pc'), ['1 Chicken Wings (6 Pc)']);
  assert.deepEqual(lines('99 combo'), ['1 Combo 99 (French Fries + Aloo Tikki Burger + Cold Drink)']);
});
test('asks instead of guessing', () => {
  assert.equal(parseOrder('margherita').questions[0].kind, 'needSize');
  assert.deepEqual(parseOrder('red sauce pasta').questions[0].options.map(o => o.name), ['Veg Red Sauce Pasta', 'Non-Veg Red Sauce Pasta']);
  assert.equal(parseOrder('chicken burger').questions[0].options.length, 3);
  assert.equal(parseOrder('1 pizza').vague.length, 1);
});
test('never matches things that are not on the menu', () => {
  for (const t of ['hot latte', '2 masala chai', 'coke', 'cold drink', 'thank you', 'hello bee how are you', 'biryani']) {
    const r = parseOrder(t);
    assert.equal(r.lines.length + r.questions.length, 0, t);
  }
});
test('every menu item is found by its own printed name, at the right price', () => {
  for (const item of ITEMS) {
    const r = parseOrder(`2 ${item.match || item.name}${item.sizes ? ' large' : ''}`);
    assert.equal(r.lines.length, 1, item.name);
    assert.equal(r.lines[0].item.id, item.id, item.name);
    assert.equal(r.lines[0].qty, 2, item.name);
    assert.ok(priceOf(item, r.lines[0].size) > 0, item.name);
  }
});
