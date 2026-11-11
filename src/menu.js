// The real Beeburg Cafe menu, typed in from the two printed menu pages in /public.
// Prices live ONLY here. To change a price or add an item, edit this file and redeploy.
// `price` = single price. `sizes` = [small, medium, large].
const P = (name, s, m, l, extra = {}) => ({ name, sizes: { small: s, medium: m, large: l }, ...extra });
const I = (name, price, extra = {}) => ({ name, price, ...extra });

const SECTIONS = [
  ['Veg Burger', [
    I('Student Burger', 50), I('Primary Veg Burger', 60), I('Spicy Mexican Burger', 60),
    I('Cheese Burger', 70), I('Paneer Burger', 100), I('Veg Maha Burger', 130),
    I('Paneer Maharaja Burger', 150),
  ]],
  ['Non-Veg Burger', [
    I('Egg Burger', 70), I('Classic Chicken Burger', 80), I('Chicken Ginger Burger', 120),
    I('Chicken Maharaja Burger', 160),
  ]],
  ['Veg Sandwich', [
    I('Grill Sandwich', 60, { aliases: ['grilled sandwich', 'veg grill sandwich'] }),
    I('Cheese Corn Sandwich', 70), I('Paneer Tikki Sandwich', 90), I('Makhni Paneer Sandwich', 100),
  ]],
  ['Non-Veg Sandwich', [
    I('Egg Sandwich', 80), I('Roasted Chicken Sandwich', 100), I('Tandoori Chicken Sandwich', 110),
    I('Chicken Cheese Spicy Sandwich', 120),
  ]],
  ['Veg Wraps', [
    I('Aloo Tikki Wrap', 70), I('Paneer Wrap', 80), I('Paneer Spicy Cheese Wrap', 130),
    I('Spl. Paneer Wrap', 140),
  ]],
  ['Non-Veg Wraps', [
    I('Egg Wrap', 90), I('Chicken Wrap', 100), I('Spicy Chicken Cheese Wrap', 140),
    I('Spl. Chicken Wrap', 150),
  ]],
  ['Veg Pasta', [
    I('Veg Red Sauce Pasta', 160), I('Veg White Creamy Pasta', 180, { aliases: ['veg white sauce pasta'] }),
    I('Veg Mix Sauce Pasta', 200),
  ]],
  ['Non-Veg Pasta', [
    I('Non-Veg Red Sauce Pasta', 180), I('Non-Veg White Creamy Pasta', 200, { aliases: ['nonveg white sauce pasta'] }),
    I('Non-Veg Mix Sauce Pasta', 230),
  ]],
  ['Fries', [
    I('French Fry', 100, { aliases: ['fries', 'french fries', 'plain fries', 'finger chips'] }),
    I('Peri Peri Fry', 110), I('Tandoori Fries', 110), I('Cheesy Fries', 130),
  ]],
  ['Chicken', [
    I('Chicken Popcorn (250gm)', 180), I('Chicken Wings (6 Pc)', 170), I('Chicken Strips (5 Pc)', 220),
  ]],
  ['Coffee', [
    I('Classic Cold Coffee', 60, { aliases: ['cold coffee', 'coffee'] }),
  ]],
  ['Combo', [
    // `match` = the words customers use for it (the long name is only for display)
    I('Combo 99 (French Fries + Aloo Tikki Burger + Cold Drink)', 99, { match: 'combo', aliases: ['burger combo', 'combo offer', 'combo meal'] }),
  ]],
  ['Veg Pizza', [
    P('Margherita Pizza', 90, 160, 220), P('Capsicum Pizza', 100, 170, 230), P('Tomato Pizza', 100, 170, 230),
    P('Onion Pizza', 110, 190, 230), P('Corn Pizza', 120, 200, 270), P('Onion Capsicum Pizza', 120, 200, 270),
    P('Corn Onion Pizza', 120, 200, 270), P('Mushroom Tomato Pizza', 120, 200, 270),
    P('Paneer Mushroom Pizza', 130, 210, 290), P('Corn Paneer Mushroom Pizza', 130, 210, 290),
    P('Veggie 4 Pizza', 130, 210, 290), P('Corn Fresh Pizza', 140, 220, 300),
    P('Golden Veg Pizza', 140, 220, 300), P('Vegetarian Pizza', 140, 220, 300),
    P('Hot Chilli Pizza', 140, 220, 300),
    P('Paneer Lover Pizza', 150, 230, 220), // Large is printed as 220 on the menu card (looks like a misprint)
    P('Tandoori Paneer Pizza', 150, 230, 320),
  ]],
  ['Premium Pizza', [
    P('Vegetable King Pizza', 170, 250, 340), P('Mexican Pizza', 170, 250, 340),
    P('Farm House Pizza', 170, 250, 340, { aliases: ['farmhouse pizza', 'farmhouse'] }),
    P('Makhni Paneer Pizza', 180, 270, 350), P('Tandoori Veggies Pizza', 190, 280, 360),
    P('Veg Queen Pizza', 200, 290, 370),
  ]],
  ['Non-Veg Pizza', [
    P('Masala Chicken Pizza', 140, 240, 340), P('Peri Peri Pizza', 150, 250, 350, { aliases: ['peri peri chicken pizza'] }),
    P('BBQ Chicken Pizza', 150, 250, 350), P('Chicken Sausage Pizza', 150, 250, 350),
  ]],
  ['Extra Pizza Toppings', [
    P('Extra Cheese Topping', 50, 90, 130), P('Extra Vegetables Topping', 50, 70, 90),
    P('Extra Chicken Topping', 60, 110, 160),
  ]],
];

const ITEMS = [];
for (const [category, list] of SECTIONS) {
  for (const it of list) {
    const id = it.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    ITEMS.push({ id, category, aliases: [], ...it });
  }
}
const BY_ID = new Map(ITEMS.map(i => [i.id, i]));

const SIZES = ['small', 'medium', 'large'];
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);

function priceOf(item, size) {
  return item.sizes ? item.sizes[size] : item.price;
}
function lineName(item, size) {
  return item.sizes ? `${item.name} (${cap(size)})` : item.name;
}

// Compact text menu for the AI prompt.
function menuText() {
  return SECTIONS.map(([category]) => {
    const rows = ITEMS.filter(i => i.category === category).map(i =>
      i.sizes ? `${i.name} S${i.sizes.small}/M${i.sizes.medium}/L${i.sizes.large}` : `${i.name} ${i.price}`);
    return `${category}: ${rows.join('; ')}`;
  }).join('\n');
}

module.exports = { ITEMS, BY_ID, SIZES, priceOf, lineName, menuText, cap };
