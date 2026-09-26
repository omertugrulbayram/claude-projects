// Run: node tests/run.js
const assert = require('assert');
['cards', 'data', 'life', 'poker'].forEach((f) => require(`../js/${f}.js`));
global.localStorage = undefined;
const { cards: C, life: L, poker: P, data: D } = globalThis.LC;

const h = (s) => s.split(' ').map((t) => ({ r: { A: 14, K: 13, Q: 12, J: 11, T: 10 }[t[0]] || +t[0], s: { s: '♠', h: '♥', d: '♦', c: '♣' }[t[1]] }));
const cat = (s) => C.evaluate(h(s)).name;

assert.equal(cat('As Ks Qs Js Ts'), 'Sıralı Renk');
assert.equal(cat('9c 9d 9h 9s 2c'), 'Kare');
assert.equal(cat('3c 3d 3h 8s 8c'), 'Full House');
assert.equal(cat('2h 7h 9h Jh Kh'), 'Renk');
assert.equal(cat('Ac 2d 3h 4s 5c'), 'Kent');
assert.equal(cat('5c 5d 5h Ks 2c'), 'Üçlü');
assert.equal(cat('5c 5d 9h 9s 2c'), 'Döper');
assert.equal(cat('5c 5d 9h Ks 2c'), 'Per');
assert.equal(cat('5c 7d 9h Ks 2c'), 'Yüksek Kart');
const cmp = (a, b) => Math.sign(C.compare(C.evaluate(h(a)), C.evaluate(h(b))));
assert.equal(cmp('Ac 2d 3h 4s 5c', '2c 3d 4h 5s 6c'), -1, 'wheel is the lowest straight');
assert.equal(cmp('Kc Kd 4h 4s 2c', 'Kh Ks 4c 4d Ac'), -1, 'two pair kicker');
assert.equal(cmp('Qc Qd 9h 5s 2c', 'Qh Qs 9c 5d 2d'), 0, 'split');
assert.equal(cmp('Tc Td Th 2s 2c', '9c 9d 9h As Ac'), 1, 'full house by trips');
assert.equal(C.evaluateWild(h('As Ah Ad 4c 9s')).name, 'Kare');
assert.deepEqual(C.chooseDiscards(h('5c 5d 9h Ks 2c')).sort(), [2, 3, 4]);
assert.deepEqual(C.chooseDiscards(h('2h 7h 9h Jh Kc')), [4]);
assert.deepEqual(C.chooseDiscards(h('5c 6d 7h 8s Kc')), [4]);
console.log('hand evaluation ok');

// Simulate sessions with a random player and check chips are conserved.
let hands = 0;
for (let run = 0; run < 300; run++) {
  const G = L.newGame();
  G.cash = 100000; G.rep = 100;
  G.items = [];
  const ids = [['bent_coin', 'lucky_scarf', 'dead_mans_ring'], ['rabbit_foot', 'cheap_shades', 'gold_chain']][run % 2];
  ids.forEach((id) => assert(L.addItem(G, id)));
  assert(!L.addItem(G, 'fedora'), 'max 3 items');
  const v = D.VENUES[run % D.VENUES.length];
  P.startSession(G, v.id);
  const S = G.session;
  for (let k = 0; k < 40 && G.session; k++) {
    if (!S.npc) P.seatNpc(G);
    if (S.stack < v.ante) P.rebuy(G);
    G.energy = 100;
    const before = S.stack + S.npc.stack;
    const r = P.startHand(G);
    if (!r.ok) break;
    let guard = 0;
    while (S.hand.phase !== 'done' && guard++ < 50) {
      const H = S.hand;
      if (H.phase === 'draw') { P.drawPlayer(G, [0, 1, 2].filter(() => Math.random() < 0.5)); continue; }
      if (H.round.toAct === 'n') { P.npcTurn(G); continue; }
      const o = P.options(G);
      const choices = o.facing ? ['fold', 'call', 'call'] : ['check', 'check'];
      if (o.canRaise) choices.push(o.facing ? 'raise' : 'bet');
      P.act(G, 'p', choices[Math.floor(Math.random() * choices.length)]);
    }
    assert.equal(S.hand.phase, 'done', 'hand finished');
    const res = S.hand.result;
    const npcStack = S.npc ? S.npc.stack : 0;
    const after = S.stack + npcStack - res.bonus - (res.notes.find((n) => n.startsWith('Eğri Bozuk')) ? Math.round(S.hand.contrib.p * 0.5) : 0);
    const houseAnte = S.hand.notes.some((n) => n.startsWith('Uğurlu Atkı')) ? v.ante : 0;
    if (S.npc) assert.equal(after, before + houseAnte, `chips conserved (run ${run} hand ${k})`);
    assert(S.stack >= 0 && npcStack >= 0);
    hands++;
  }
}
console.log(`simulated ${hands} hands ok`);

// A week of life: work, eat, sleep; money and the day counter move.
const G = L.newGame();
assert(L.work(G).ok); assert.equal(G.phase, 'evening'); assert(!L.work(G).ok, 'one shift a day');
const s = L.sleep(G);
assert.equal(G.day, 2);
assert.equal(G.phase, 'day');
assert(G.cash > 63);
assert(Array.isArray(s.lines));
for (let d = 0; d < 10; d++) L.sleep(G);
assert.equal(G.housing, 'street', 'unpaid rent leads to eviction');
console.log('life loop ok');
