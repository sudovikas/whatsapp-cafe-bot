// Turns free text like "2 cheese burgers and 1 margarita medium" into priced menu lines.
// Pure rules + fuzzy matching: no AI involved, so prices and items can never be invented.
const { ITEMS, SIZES } = require('./menu');

const NUM_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, ek: 1, teen: 3, char: 4, paanch: 5, panch: 5 };
const SIZE_WORDS = {
  small: 'small', sm: 'small', s: 'small', chota: 'small', chhota: 'small',
  medium: 'medium', med: 'medium', m: 'medium',
  large: 'large', lg: 'large', l: 'large', big: 'large', bada: 'large',
};
const STOP = new Set(('i want would like to order please pls plz give me send get need a an the of for with also add more ' +
  'plate pc pcs piece pieces gm bhai bhaiya ji chahiye dena de dedo kar karo hai mujhe ko wala wali my some can you have ' +
  'hi hello hey and aur size x qty quantity nos no just only ok okay then make it that this is in').split(' '));
const SYNONYMS = {
  special: 'spl', barbeque: 'bbq', barbecue: 'bbq', margarita: 'margherita', makhani: 'makhni',
  vegetable: 'vegetable', veggies: 'veggie', chilly: 'chilli', chili: 'chilli', sandwitch: 'sandwich',
  fries: 'fry', wings: 'wing', strips: 'strip', wraps: 'wrap', toppings: 'topping', vegetables: 'vegetable',
};

function stem(t) {
  if (SYNONYMS[t]) return SYNONYMS[t];
  if (t.length > 4 && t.endsWith('s') && !t.endsWith('ss')) return t.slice(0, -1);
  return t;
}

function normalize(text) {
  return String(text || '').toLowerCase()
    .replace(/non[\s-]*veg(etarian)?/g, 'nonveg')
    .replace(/veggie\s*4/g, 'veggie')
    .replace(/farm\s+house/g, 'farmhouse')
    .replace(/\((\s*\d+\s*(gm|g|pc|pcs)\.?\s*)\)/g, ' ')
    .replace(/\b\d+\s*(gm|g|pc|pcs|pieces?)\b\.?/g, ' ')
    .replace(/(\d+)\s*x\b/g, '$1 ').replace(/\bx\s*(\d+)/g, ' $1')
    .replace(/[^a-z0-9,&+\n ]+/g, ' ');
}

const tokens = s => normalize(s).replace(/[,&+\n]/g, ' ').split(/\s+/).filter(Boolean).map(stem);

// Damerau-Levenshtein (optimal string alignment), for typo tolerance.
function dist(a, b) {
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 0; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const c = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + c);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[a.length][b.length];
}
function same(a, b) {
  if (a === b) return true;
  const n = Math.min(a.length, b.length);
  if (n < 4 || Math.abs(a.length - b.length) > 2) return false;
  return dist(a, b) <= (n >= 7 ? 2 : 1);
}

// Index: name tokens, alias token-strings, and how common each token is across the menu.
const INDEX = ITEMS.map(item => ({
  item,
  toks: [...new Set(tokens(item.match || item.name).filter(t => !/^\d+$/.test(t)))],
  aliases: (item.aliases || []).map(a => tokens(a).join(' ')),
}));
const DF = {};
for (const e of INDEX) for (const t of e.toks) DF[t] = (DF[t] || 0) + 1;
const VOCAB = Object.keys(DF);
const weight = t => 1 / Math.sqrt(DF[t] || 1);
const known = t => VOCAB.some(v => same(t, v));

// True when both token lists describe the same words, allowing typos and any order.
function fuzzySet(a, b) {
  const ua = [...new Set(a)], ub = [...new Set(b)];
  return ua.length === ub.length && ua.every(x => ub.some(y => same(x, y))) && ub.every(y => ua.some(x => same(x, y)));
}

function scoreEntry(entry, segToks) {
  const joined = segToks.join(' ');
  if (fuzzySet(segToks, entry.toks) || entry.aliases.includes(joined) ||
      entry.aliases.some(a => fuzzySet(segToks, a.split(' ')))) return 1.01;
  let itemHit = 0, itemTotal = 0, segHit = 0, segTotal = 0;
  for (const t of entry.toks) { const w = weight(t); itemTotal += w; if (segToks.some(s => same(s, t))) itemHit += w; }
  for (const s of segToks) {
    const m = entry.toks.find(t => same(s, t));
    const w = m ? weight(m) : (known(s) ? weight(VOCAB.find(v => same(s, v))) : 1);
    segTotal += w; if (m) segHit += w;
  }
  if (!itemHit) return 0;
  const ci = itemHit / itemTotal, cs = segHit / segTotal;
  return (2 * ci * cs) / (ci + cs);
}

function splitSegments(text) {
  const parts = normalize(text).split(/[,&+\n]|\band\b|\baur\b/).map(s => s.trim()).filter(Boolean);
  const out = [];
  for (const p of parts) {
    const toks = p.split(/\s+/);
    let cur = [];
    toks.forEach((t, i) => {
      const isQty = /^\d+$/.test(t) && Number(t) <= 20;
      // "2 cheese burger 1 cold coffee" -> split before a quantity that sits between words
      if (isQty && cur.some(c => !/^\d+$/.test(c)) && i < toks.length - 1) { out.push(cur.join(' ')); cur = []; }
      cur.push(t);
    });
    if (cur.length) out.push(cur.join(' '));
  }
  return out;
}

function parseSegment(seg) {
  let qty = null, size = null;
  const words = [];
  const raws = seg.split(/\s+/).filter(Boolean);
  for (let i = 0; i < raws.length; i++) {
    const raw = raws[i];
    // Hindi "do" = 2, but not the English "do you have..."
    if (raw === 'do') { if (qty === null && raws[i + 1] && !['you', 'u', 'i', 'we', 'they', 'not'].includes(raws[i + 1])) qty = 2; continue; }
    if (/^\d+$/.test(raw)) { if (qty === null && Number(raw) >= 1 && Number(raw) <= 20) qty = Number(raw); continue; }
    if (NUM_WORDS[raw] && qty === null) { qty = NUM_WORDS[raw]; continue; }
    if (SIZE_WORDS[raw] && !size) { size = SIZE_WORDS[raw]; continue; }
    const t = stem(raw);
    if (!STOP.has(raw) && !STOP.has(t)) words.push(t);
  }
  qty = qty || 1;
  if (!words.length) return { kind: 'empty', qty, size };
  if (!words.some(known)) return { kind: 'unknown', text: seg, qty, size };

  const scored = INDEX.map(e => ({ item: e.item, score: scoreEntry(e, words), toks: e.toks }))
    .filter(x => x.score > 0).sort((a, b) => b.score - a.score);
  const top = scored[0];
  if (!top) return { kind: 'unknown', text: seg, qty, size };
  if (top.score > 1) return resolved(top.item, qty, size); // exact name or alias

  // Items whose name contains every word the customer typed ("chicken burger" -> 3 burgers).
  const all = scored.filter(x => words.every(w => x.toks.some(t => same(w, t))));
  if (all.length === 1) return resolved(all[0].item, qty, size);
  if (all.length > 8) return { kind: 'vague', text: words.join(' '), qty, size };
  if (all.length > 1) return { kind: 'choice', text: seg, qty, size, options: all.map(x => x.item) };

  // The full name of an item plus extra words ("paneer burger fresh", "cheese burger no onion"):
  // take the longest fully-named item and flag that something extra was typed.
  const full = scored.filter(x => x.toks.every(t => words.some(w => same(w, t))));
  if (full.length) {
    const most = Math.max(...full.map(x => x.toks.length));
    const best = full.filter(x => x.toks.length === most);
    if (best.length === 1) return { ...resolved(best[0].item, qty, size), extra: true };
    return { kind: 'choice', text: seg, qty, size, options: best.map(x => x.item) };
  }

  const close = scored.filter(x => x.score >= top.score - 0.1);
  // Auto-accept a near match only if no typed menu word contradicts it ("aloo tikki burger" is not the wrap).
  const clash = words.some(w => known(w) && !top.toks.some(t => same(w, t)));
  if (top.score >= 0.7 && close.length === 1 && !clash) return resolved(top.item, qty, size);
  if (top.score >= 0.62) return { kind: 'choice', text: seg, qty, size, options: close.slice(0, 6).map(x => x.item) };
  return { kind: 'unknown', text: seg, qty, size };
}

function resolved(item, qty, size) {
  if (item.sizes && !SIZES.includes(size)) return { kind: 'needSize', item, qty };
  return { kind: 'line', item, qty, size: item.sizes ? size : null };
}

// Returns { lines, questions, vague, unknown }
function parseOrder(text) {
  const res = { lines: [], questions: [], vague: [], unknown: [] };
  for (const seg of splitSegments(text)) {
    const r = parseSegment(seg);
    if (r.kind === 'line') res.lines.push(r);
    else if (r.kind === 'needSize' || r.kind === 'choice') res.questions.push(r);
    else if (r.kind === 'vague') res.vague.push(r);
    else if (r.kind === 'unknown') res.unknown.push(r);
  }
  return res;
}

function parseSize(text) {
  const t = normalize(text).split(/\s+/).filter(Boolean);
  for (const w of t) if (SIZE_WORDS[w]) return SIZE_WORDS[w];
  return null;
}

// Customer answered a "which one?" question with words ("veg", "the maharaja one").
// Returns the index of the single option whose name contains every typed word, else -1.
function pickFrom(options, text) {
  const words = tokens(text).filter(w => !STOP.has(w) && !/^\d+$/.test(w) && !SIZE_WORDS[w] && w !== 'one');
  if (!words.length) return -1;
  const hits = options.map((o, i) => ({ i, toks: tokens(o.match || o.name) })).filter(o => words.every(w => o.toks.some(t => same(w, t))));
  return hits.length === 1 ? hits[0].i : -1;
}

module.exports = { parseOrder, parseSize, resolved, normalize, pickFrom };
