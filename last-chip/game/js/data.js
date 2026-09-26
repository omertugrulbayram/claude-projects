// Static game content: venues, opponents, lucky items, housing, job.
(function (LC) {
  const SLOTS = ['HAT', 'NECK', 'RING', 'POCKET', 'WATCH', 'CHARM'];

  // Clock values are minutes after midnight of the current day; >1440 means after midnight.
  const VENUES = [
    {
      id: 'rusty', name: 'The Rusty Nail', blurb: 'Back room of a dive bar. Sticky felt, flat beer.',
      tier: 0, buyIn: 20, ante: 1, bets: [2, 4], rep: 0, open: 16 * 60, close: 27 * 60,
      pool: ['lenny', 'dottie', 'father_mike'], security: 0.5,
    },
    {
      id: 'alley', name: 'Back Alley Poker', blurb: 'Folding table behind the laundromat. Cash only.',
      tier: 1, buyIn: 50, ante: 2, bets: [5, 10], rep: 0, open: 18 * 60, close: 29 * 60,
      pool: ['vinny', 'father_mike', 'dottie', 'big_k'], security: 0.8,
    },
    {
      id: 'rabbit', name: 'Lucky Rabbit Casino', blurb: 'Carpet that hides stains. Real dealers.',
      tier: 2, buyIn: 250, ante: 10, bets: [25, 50], rep: 8, open: 18 * 60, close: 30 * 60,
      pool: ['vinny', 'eleanor', 'big_k'], security: 1,
    },
    {
      id: 'crown', name: 'Royal Crown', blurb: 'Chandeliers, cameras in every one of them.',
      tier: 3, buyIn: 2500, ante: 100, bets: [250, 500], rep: 25, open: 19 * 60, close: 28 * 60,
      pool: ['eleanor', 'duchess', 'mr_lee'], security: 1.5,
    },
    {
      id: 'ivory', name: 'The Ivory Room', blurb: 'No sign on the door. You are either invited or you are not.',
      tier: 4, buyIn: 25000, ante: 1000, bets: [2500, 5000], rep: 65, open: 22 * 60, close: 28 * 60,
      pool: ['duchess', 'mr_lee', 'mr_black'], security: 2,
    },
  ];

  // aggr: how often they bet strength. bluff: bluff rate. tight: how much they need to call.
  const NPCS = {
    lenny: {
      name: 'Lenny "The Rat"', tag: 'Calls everything. Remembers nothing.', aggr: 0.2, bluff: 0.05, tight: 0.1, tilt: 0.1,
      tells: { strong: 'Lenny stops chewing his toothpick.', weak: 'Lenny chews his toothpick faster.' },
    },
    dottie: {
      name: 'Dottie', tag: 'Runs the laundromat. Folds a lot. Wins a lot.', aggr: 0.3, bluff: 0.02, tight: 0.7, tilt: 0,
      tells: { strong: 'Dottie pats her handbag.', weak: 'Dottie sighs at her cards.' },
    },
    father_mike: {
      name: 'Father Mike', tag: 'Says it is for the church roof.', aggr: 0.5, bluff: 0.12, tight: 0.5, tilt: 0.3,
      tells: { strong: 'Father Mike crosses himself.', weak: 'Father Mike looks at the ceiling.' },
    },
    vinny: {
      name: 'Vinny', tag: 'Bets big. Tilts bigger.', aggr: 0.85, bluff: 0.3, tight: 0.2, tilt: 1,
      tells: { strong: 'Vinny goes very quiet.', weak: 'Vinny starts talking about his cousin.' },
    },
    big_k: {
      name: 'Big K', tag: 'Long-haul trucker. Plays like he drives.', aggr: 0.6, bluff: 0.15, tight: 0.4, tilt: 0.5,
      tells: { strong: 'Big K leans back.', weak: 'Big K drums on the table.' },
    },
    eleanor: {
      name: 'Eleanor', tag: 'Forty years at the tables. Almost never bluffs. Almost.', aggr: 0.4, bluff: 0.03, tight: 0.8, tilt: 0,
      bigBluff: true,
      tells: { strong: 'Eleanor adjusts her pearls.', weak: 'Eleanor does nothing at all.' },
    },
    duchess: {
      name: 'The Duchess', tag: 'Old money. Plays for sport.', aggr: 0.6, bluff: 0.18, tight: 0.6, tilt: 0.2,
      tells: { strong: 'The Duchess smiles with her eyes.', weak: 'The Duchess checks her watch.' },
    },
    mr_lee: {
      name: 'Mr. Lee', tag: 'Reads you like a menu.', aggr: 0.55, bluff: 0.1, tight: 0.65, tilt: 0, reads: true,
      tells: { strong: 'Mr. Lee stacks his chips neatly.', weak: 'Mr. Lee stacks his chips neatly.' },
    },
    mr_black: {
      name: 'Mr. Black', tag: 'The man you owe. He plays for keeps.', aggr: 0.65, bluff: 0.15, tight: 0.6, tilt: 0, reads: true,
      tells: { strong: 'Mr. Black taps his ring on the table.', weak: 'Mr. Black lights a cigarette.' },
    },
    zero: {
      name: 'ZERO', tag: 'Nobody knows who he is. He only comes at night.', aggr: 0.7, bluff: 0.25, tight: 0.55, tilt: 0,
      patBluff: true, night: true,
      tells: { strong: '...', weak: '...' },
    },
  };

  // heat: chance per hand of being caught (scaled by venue security).
  const ITEMS = {
    bent_coin: { name: 'Bent Coin', slot: 'POCKET', rarity: 'common', price: 40,
      desc: 'First losing hand each session: 20% chance to get half your chips from that pot back.' },
    rabbit_foot: { name: "Rabbit's Foot", slot: 'CHARM', rarity: 'common', price: 60,
      desc: 'After your draw: 12% chance your weakest card is swapped for one that improves your hand.' },
    cheap_shades: { name: 'Cheap Shades', slot: 'HAT', rarity: 'common', price: 35,
      desc: "Shows your opponent's tells. They are right about two times in three." },
    lucky_scarf: { name: 'Lucky Scarf', slot: 'NECK', rarity: 'common', price: 50,
      desc: '25% chance each hand that the house covers your ante.' },
    dads_watch: { name: "Dad's Watch", slot: 'WATCH', rarity: 'common', price: 240, pawn: 120,
      desc: '+5 max energy. It stopped at 4:17 the night he left.' },
    last_cigarette: { name: 'Last Cigarette', slot: 'POCKET', rarity: 'rare', price: 120,
      desc: 'Stack under 20% of your buy-in: win with a Straight or better for x2.5. 25% chance it burns out.' },
    night_owl: { name: 'Night Owl', slot: 'WATCH', rarity: 'rare', price: 220,
      desc: 'Between 00:00 and 04:00, pots you win pay +25%.' },
    fedora: { name: 'Grey Fedora', slot: 'HAT', rarity: 'rare', price: 260,
      desc: '+50% reputation from winning.' },
    gold_chain: { name: 'Gold Chain', slot: 'NECK', rarity: 'rare', price: 400,
      desc: 'Opponents fold to your bets more often.' },
    dead_mans_ring: { name: "Dead Man's Ring", slot: 'RING', rarity: 'legendary', price: 900,
      desc: 'After 3 losing hands in a row, the next hand deals you spades on the draw.' },
    loaded_dice: { name: 'Loaded Dice', slot: 'CHARM', rarity: 'illegal', price: 300, heat: 0.008,
      desc: 'All chance-based item effects +15%. Security may notice.' },
    marked_cards: { name: 'Marked Cards', slot: 'POCKET', rarity: 'illegal', price: 450, heat: 0.015,
      desc: "You can see one of your opponent's cards every hand." },
    ace_sleeve: { name: 'Ace Up the Sleeve', slot: 'RING', rarity: 'illegal', price: 700, useHeat: 0.1,
      desc: 'Once per session, swap a card for an Ace during the draw. 10% chance of being caught.' },
    black_joker: { name: 'Black Joker', slot: 'CHARM', rarity: 'unique', price: 0, pawn: 5000,
      desc: 'One card in your hand is always wild. Zero left it on the table for you.' },
  };

  const SHOP_POOL = Object.keys(ITEMS).filter((k) => !['dads_watch', 'black_joker'].includes(k));

  // rent is charged every 4 days.
  const HOUSING = {
    street: { name: 'Sleeping Rough', rent: 0, deposit: 0, storage: 1, sleep: 0.6, energy: 0, scene: 'street' },
    motel: { name: 'Starlite Motel, Room 9', rent: 35, deposit: 0, storage: 3, sleep: 1, energy: 0, scene: 'motel' },
    apartment: { name: 'Cheap Apartment', rent: 20, deposit: 800, storage: 5, sleep: 1, energy: 10, scene: 'apartment',
      perk: '+10 max energy, room for 5 items.' },
    loft: { name: 'Downtown Loft', rent: 90, deposit: 12000, storage: 8, sleep: 1, energy: 10, rep: 10, scene: 'loft',
      perk: '+10 max energy, room for 8 items, +10 reputation when you move in.' },
    penthouse: { name: 'Penthouse', rent: 350, deposit: 140000, storage: 12, sleep: 1, energy: 20, repDiscount: 15, scene: 'loft',
      perk: '+20 max energy, room for 12 items, casino reputation requirements -15.' },
  };
  const HOUSING_ORDER = ['motel', 'apartment', 'loft', 'penthouse'];

  const JOB = { name: 'Gas-N-Go', dayPay: 48, nightPay: 60, raiseEvery: 10, raise: 6, maxBonus: 36 };

  const RARITY_ORDER = ['common', 'rare', 'legendary', 'illegal', 'unique'];

  LC.data = { SLOTS, VENUES, NPCS, ITEMS, SHOP_POOL, HOUSING, HOUSING_ORDER, JOB, RARITY_ORDER };
})(typeof window !== 'undefined' ? (window.LC = window.LC || {}) : (globalThis.LC = globalThis.LC || {}));
