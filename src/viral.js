// Viral Engagement Engine for Gen-Z & Fast Food Lovers
// Designed to grab attention in <5 seconds, trigger FOMO, and encourage sharing.

const COMBOS = [
  {
    name: '🔥 The Midnight Stalker',
    desc: '1 Cheese Burger + 1 Peri Peri Fry + 1 Classic Cold Coffee',
    items: '1 cheese burger, 1 peri peri fry, 1 cold coffee',
    price: 240,
    vibe: 'Best for late-night gossip, exam all-nighters, or gaming marathons.',
  },
  {
    name: '🧀 The Cheese Overload',
    desc: '1 Farm House Pizza (Medium) + 1 Cheesy Fries',
    items: '1 farm house pizza medium, 1 cheesy fries',
    price: 380,
    vibe: 'Cheese pull itna lamba ki reels pe viral ho jaye! No cap 🧢',
  },
  {
    name: '👑 The Royal Maharaja',
    desc: '1 Paneer Maharaja Burger + 1 Makhni Paneer Sandwich + 1 Cold Coffee',
    items: '1 paneer maharaja burger, 1 makhni paneer sandwich, 1 cold coffee',
    price: 310,
    vibe: 'Khao to raja ki tarah! Pocket pe halka, pet pe bhari.',
  },
  {
    name: '🎒 Broke Student Savior',
    desc: '2 Student Burgers + 1 French Fry',
    items: '2 student burger, 1 french fry',
    price: 200,
    vibe: 'Pocket money khatam? Scene sorted in just ₹200!',
  },
  {
    name: '🌶️ The Spicy Rizz Feast',
    desc: '1 Spicy Mexican Burger + 1 Aloo Tikki Wrap + 1 Cold Coffee',
    items: '1 spicy mexican burger, 1 aloo tikki wrap, 1 cold coffee',
    price: 190,
    vibe: 'Spicy vibes with chill coffee. 10/10 comfort food.',
  },
];

const FORTUNES = [
  '⭐ *Food Horoscope:* Aaj sitare bol rahe hain: Pizza ka cheese pull tumhare future se zyada bright hoga! 🍕',
  '💡 *Wisdom of the Day:* Duniya me dukh bohot hai guru, par extra cheese me sab theek ho jata hai. No cap! 🧀',
  '😂 *Real Talk:* Ghar wale: "Beta career ka kya socha hai?"\nYou: "Pehle double cheese burger kha lu, dimag tabhi chalega!" 🍔',
  '🔥 *Vibe Check:* Dieting kal se, aaj to crunchy fries aur chilled cold coffee ka scene set hai! ☕🍟',
  '✨ *Banarasi Fortune:* Jo maza aadhi raat ko hot pizza me hai, wo duniya ke kisi gyaan me nahi! 🛵💨',
  '💯 *Golden Rule:* Paise se khushiyan nahi khareedi ja sakti... par cheesy pizza to khareed sakte ho, ek hi baat hai! 😉',
];

function getSurpriseCombo() {
  const pick = COMBOS[Math.floor(Math.random() * COMBOS.length)];
  return {
    title: pick.name,
    text: `🎲 *CRAVING BUSTER OF THE DAY!* 🎲\n\n*${pick.name}*\n📦 ${pick.desc}\n💰 Total: ₹${pick.price}\n\n_${pick.vibe}_\n\n👉 *Order lagane ke liye bas "haan" bolo ya likho:*\n*${pick.items}*`,
    orderCommand: pick.items,
  };
}

function getRandomFortune() {
  return FORTUNES[Math.floor(Math.random() * FORTUNES.length)];
}

function getViralShareNote(orderId) {
  return `\n\n🎉 *Squad Secret:* Screenshot karke dosto ko batao — agle order pe order ID *${orderId}* mention karne par chef ki taraf se extra love! ❤️`;
}

module.exports = { COMBOS, FORTUNES, getSurpriseCombo, getRandomFortune, getViralShareNote };
