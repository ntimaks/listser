// Aisle-order sorting: a built-in grocery-category prior plus per-household
// learned checkoff positions (see supabase/migrations/0002_aisle_order.sql).
//
// Day zero, items are grouped by category in a canonical "store walk" order.
// Every cleared trip records where each item was checked off (0 = entrance,
// 1 = checkout); learned positions gradually override the prior, so after a
// few trips the list mirrors the household's actual store layout.

export type CategoryId =
  | "produce"
  | "bakery"
  | "meat"
  | "dairy"
  | "pantry"
  | "snacks"
  | "beverages"
  | "frozen"
  | "household"
  | "personal"
  | "other";

// Canonical walk order of a typical supermarket.
export const CATEGORY_ORDER: CategoryId[] = [
  "produce",
  "bakery",
  "meat",
  "dairy",
  "pantry",
  "snacks",
  "beverages",
  "frozen",
  "household",
  "personal",
  "other",
];

export const CATEGORY_LABELS: Record<CategoryId, string> = {
  produce: "Produce",
  bakery: "Bakery",
  meat: "Meat & fish",
  dairy: "Dairy & eggs",
  pantry: "Pantry",
  snacks: "Snacks",
  beverages: "Beverages",
  frozen: "Frozen",
  household: "Household",
  personal: "Personal care",
  other: "Other",
};

// Merged English + Latvian stem dictionary. Stems are pre-normalized
// (lowercase, diacritics stripped) and matched as word prefixes, so one
// entry covers singular/plural/case forms in both languages — e.g. "tomat"
// matches "tomatoes" and "tomāti", "pien" matches "piens"/"piena".
// No language detection needed; unmatched names fall into "other" and
// still sort correctly once a learned position exists.
const STEMS: Record<string, CategoryId> = {
  // -- produce -------------------------------------------------------------
  apple: "produce", abol: "produce",
  banan: "produce",
  orange: "produce", apelsin: "produce", mandarin: "produce",
  lemon: "produce", citron: "produce", lime: "produce", laim: "produce",
  grape: "produce", vinog: "produce",
  strawberr: "produce", zemen: "produce",
  blueberr: "produce", mellen: "produce",
  raspberr: "produce", aven: "produce",
  cherr: "produce", kirs: "produce",
  pear: "produce", bumbier: "produce",
  peach: "produce", persik: "produce",
  plum: "produce",
  melon: "produce", watermelon: "produce", arbuz: "produce",
  kiwi: "produce", mango: "produce", ananas: "produce", pineapple: "produce",
  avocado: "produce", avokado: "produce",
  tomat: "produce",
  cucumber: "produce", gurk: "produce",
  carrot: "produce", burkan: "produce",
  potato: "produce", kartup: "produce",
  onion: "produce", sipol: "produce",
  garlic: "produce", kiplok: "produce",
  paprika: "produce",
  lettuce: "produce", salat: "produce", salad: "produce",
  spinach: "produce", spinat: "produce",
  cabbage: "produce", kapost: "produce",
  broccoli: "produce", brokol: "produce",
  cauliflower: "produce", ziedkapost: "produce",
  zucchini: "produce", kabac: "produce",
  mushroom: "produce", sene: "produce",
  dill: "produce", herb: "produce",
  beet: "produce", biet: "produce",
  radish: "produce", redis: "produce",
  pumpkin: "produce", kirbis: "produce",
  corn: "produce", kukuruz: "produce",
  fruit: "produce", augl: "produce",
  vegetab: "produce", darzen: "produce",
  ginger: "produce", ingver: "produce",
  celery: "produce", seleri: "produce",

  // -- bakery --------------------------------------------------------------
  bread: "bakery", maiz: "bakery",
  bagel: "bakery", baguette: "bakery", baget: "bakery",
  croissant: "bakery", kruasan: "bakery",
  cake: "bakery", kuka: "bakery",
  pastry: "bakery", muffin: "bakery", donut: "bakery", virtul: "bakery",
  tortilla: "bakery", pita: "bakery", toast: "bakery",
  bulcin: "bakery", bun: "bakery",

  // -- meat & fish ---------------------------------------------------------
  chicken: "meat", vist: "meat",
  beef: "meat", liellop: "meat",
  pork: "meat", cukgal: "meat",
  meat: "meat", gala: "meat",
  mince: "meat", malt: "meat",
  sausage: "meat", desa: "meat", desin: "meat", cisin: "meat",
  ham: "meat", skink: "meat",
  bacon: "meat", bekon: "meat",
  fish: "meat", ziv: "meat",
  salmon: "meat", lasi: "meat",
  tuna: "meat", tunc: "meat",
  shrimp: "meat", garnel: "meat",
  turkey: "meat", titar: "meat",
  steak: "meat", fillet: "meat", filej: "meat",
  cutlet: "meat", kotlet: "meat",

  // -- dairy & eggs --------------------------------------------------------
  milk: "dairy", pien: "dairy",
  cheese: "dairy", sier: "dairy",
  yogurt: "dairy", yoghurt: "dairy", jogurt: "dairy",
  butter: "dairy", sviest: "dairy",
  cream: "dairy", krejum: "dairy",
  egg: "dairy", ola: "dairy",
  kefir: "dairy",
  curd: "dairy", biezpien: "dairy",
  margarin: "dairy",

  // -- pantry --------------------------------------------------------------
  pasta: "pantry", makaron: "pantry", spaghetti: "pantry", noodle: "pantry",
  nudel: "pantry",
  rice: "pantry", risi: "pantry",
  flour: "pantry", milt: "pantry",
  sugar: "pantry", cukur: "pantry",
  salt: "pantry", sals: "pantry", salsa: "pantry",
  oil: "pantry", ella: "pantry", oliv: "pantry",
  vinegar: "pantry", etik: "pantry",
  ketchup: "pantry", kecup: "pantry",
  mayo: "pantry", majonez: "pantry",
  mustard: "pantry", sinep: "pantry",
  sauce: "pantry", merce: "pantry",
  spice: "pantry", garsviel: "pantry", pipar: "pantry", pepper: "pantry",
  cereal: "pantry", parsl: "pantry", musli: "pantry", muesli: "pantry",
  oat: "pantry", auzu: "pantry",
  honey: "pantry", medus: "pantry",
  jam: "pantry", ievarij: "pantry",
  canned: "pantry", konserv: "pantry",
  soup: "pantry", zupa: "pantry",
  bean: "pantry", pupin: "pantry",
  lentil: "pantry", leca: "pantry",
  buckwheat: "pantry", griki: "pantry",

  // -- snacks --------------------------------------------------------------
  chips: "snacks", cips: "snacks", crisp: "snacks",
  chocolate: "snacks", sokolad: "snacks",
  candy: "snacks", konfek: "snacks", sweets: "snacks", saldum: "snacks",
  cookie: "snacks", cepum: "snacks",
  cracker: "snacks", kreker: "snacks",
  nut: "snacks", riekst: "snacks",
  popcorn: "snacks",
  batonin: "snacks",

  // -- beverages -----------------------------------------------------------
  water: "beverages", uden: "beverages",
  juice: "beverages", sula: "beverages",
  coffee: "beverages", kafij: "beverages",
  tea: "beverages", teja: "beverages",
  beer: "beverages", alus: "beverages",
  wine: "beverages", vins: "beverages",
  soda: "beverages", limonad: "beverages", cola: "beverages", kola: "beverages",
  kvas: "beverages",
  drink: "beverages", dzerien: "beverages",
  smoothie: "beverages",

  // -- frozen --------------------------------------------------------------
  frozen: "frozen", saldet: "frozen",
  "ice cream": "frozen", saldejum: "frozen",
  pelmen: "frozen", dumpling: "frozen",
  pizza: "frozen", pica: "frozen",

  // -- household -----------------------------------------------------------
  papir: "household", "paper towel": "household",
  toilet: "household", tualet: "household",
  detergent: "household", mazgas: "household", veloment: "household",
  soap: "household", ziep: "household",
  trash: "household", garbage: "household", atkritum: "household",
  sponge: "household", sukli: "household",
  foil: "household", folij: "household",
  candle: "household", svec: "household",
  batter: "household", baterij: "household",
  cleaner: "household", tiris: "household",

  // -- personal care -------------------------------------------------------
  shampoo: "personal", sampun: "personal",
  toothpaste: "personal", zobu: "personal",
  deodorant: "personal", dezodor: "personal",
  razor: "personal", skuv: "personal",
  diaper: "personal", autin: "personal",
  tissue: "personal", salvet: "personal",
  vitamin: "personal",
  lotion: "personal", losjon: "personal",
};

const MIN_STEM = 3;
const MAX_STEM = Object.keys(STEMS).reduce((m, s) => Math.max(m, s.length), 0);

// Must agree with the SQL normalization in record_trip:
// lower(unaccent(trim(name))) with whitespace collapsed.
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function categorize(name: string): CategoryId {
  const normalized = normalizeName(name);
  // Two-word stems first ("ice cream", "paper towel").
  for (let len = Math.min(normalized.length, MAX_STEM); len >= MIN_STEM; len--) {
    const stem = normalized.slice(0, len);
    if (stem.includes(" ") && STEMS[stem]) return STEMS[stem];
  }
  for (const word of normalized.split(" ")) {
    for (let len = Math.min(word.length, MAX_STEM); len >= MIN_STEM; len--) {
      const cat = STEMS[word.slice(0, len)];
      if (cat) return cat;
    }
  }
  return "other";
}

export type ItemStat = {
  name_key: string;
  position_score: number;
  trip_count: number;
};

export type Group<T> = {
  category: CategoryId;
  label: string;
  items: T[];
};

// How many trips until the learned position outweighs the category prior
// (weight = trips / (trips + K), so K=3 → 50/50 after three trips).
const CONFIDENCE_K = 3;

/**
 * Group items by category and order everything by blended position score:
 * a per-item learned checkoff position (when we have trips for that name)
 * blended with the category's position (itself learned from the category's
 * members, falling back to the canonical store-walk order).
 */
export function groupForStore<T extends { name: string; created_at: string }>(
  items: T[],
  stats: Map<string, ItemStat>
): Group<T>[] {
  // Learned category positions: trip-weighted mean of member items' scores.
  const catSum = new Map<CategoryId, { sum: number; weight: number }>();
  for (const stat of stats.values()) {
    const cat = categorize(stat.name_key);
    const w = Math.min(stat.trip_count, 5);
    const acc = catSum.get(cat) ?? { sum: 0, weight: 0 };
    acc.sum += stat.position_score * w;
    acc.weight += w;
    catSum.set(cat, acc);
  }

  const categoryPos = (cat: CategoryId) => {
    const learned = catSum.get(cat);
    if (learned && learned.weight > 0) return learned.sum / learned.weight;
    return (CATEGORY_ORDER.indexOf(cat) + 0.5) / CATEGORY_ORDER.length;
  };

  const scored = items.map((item) => {
    const category = categorize(item.name);
    const catPos = categoryPos(category);
    const stat = stats.get(normalizeName(item.name));
    const score = stat
      ? (stat.trip_count / (stat.trip_count + CONFIDENCE_K)) *
          stat.position_score +
        (CONFIDENCE_K / (stat.trip_count + CONFIDENCE_K)) * catPos
      : catPos;
    return { item, category, score };
  });

  const groups = new Map<CategoryId, { sum: number; items: typeof scored }>();
  for (const entry of scored) {
    const g = groups.get(entry.category) ?? { sum: 0, items: [] };
    g.sum += entry.score;
    g.items.push(entry);
    groups.set(entry.category, g);
  }

  return [...groups.entries()]
    .sort(([catA, a], [catB, b]) => {
      const diff = a.sum / a.items.length - b.sum / b.items.length;
      if (Math.abs(diff) > 1e-9) return diff;
      return CATEGORY_ORDER.indexOf(catA) - CATEGORY_ORDER.indexOf(catB);
    })
    .map(([category, g]) => ({
      category,
      label: CATEGORY_LABELS[category],
      items: g.items
        .sort(
          (a, b) =>
            a.score - b.score || a.item.created_at.localeCompare(b.item.created_at)
        )
        .map((e) => e.item),
    }));
}
