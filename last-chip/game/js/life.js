// Masa dışındaki her şey: gün, para, kira, borç, iş, eşyalar, ev.
(function (LC) {
  const D = LC.data;
  const SAVE_KEY = 'last-chip-save-v2';

  function newGame() {
    const G = {
      v: 2,
      day: 1,
      phase: 'day', // 'day' (gündüz) | 'evening' (akşam)
      cash: 63,
      energy: 110,
      rep: 0,
      debt: { amount: 400, due: 6 },
      housing: 'motel',
      rentDue: 4,
      shifts: 0,
      items: [{ uid: 1, id: 'dads_watch' }],
      nextUid: 2,
      stock: [],
      bans: {},
      npcs: {},
      flags: {},
      screen: 'intro',
      session: null,
      modal: null,
      dayStartCash: 63,
      stats: { hands: 0, won: 0, biggestPot: 0, peakCash: 63, busts: 0 },
    };
    restockShop(G);
    return G;
  }

  // ---------- yardımcılar ----------
  const money = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
  const itemDef = (id) => D.ITEMS[id];
  const itemByUid = (G, uid) => G.items.find((i) => i.uid === uid);
  const itemIds = (G) => G.items.map((i) => i.id);
  const has = (G, id) => itemIds(G).includes(id);
  const pawnValue = (id) => itemDef(id).pawn || Math.round(itemDef(id).price * 0.5);
  const isFull = (G) => G.items.length >= D.MAX_ITEMS;

  function addItem(G, id) {
    if (isFull(G)) return false;
    G.items.push({ uid: G.nextUid++, id });
    return true;
  }
  function removeItem(G, uid) {
    G.items = G.items.filter((i) => i.uid !== uid);
    clampEnergy(G);
  }

  function maxEnergy(G) {
    return 100 + D.HOUSING[G.housing].energy + (has(G, 'dads_watch') ? 10 : 0);
  }
  function clampEnergy(G) { G.energy = Math.max(0, Math.min(G.energy, maxEnergy(G))); }

  const repNeeded = (G, v) => Math.max(0, v.rep - (D.HOUSING[G.housing].repDiscount || 0));

  // ---------- gündüz ----------
  function wage(G) {
    return D.JOB.pay + Math.min(D.JOB.maxBonus, Math.floor(G.shifts / D.JOB.raiseEvery) * D.JOB.raise);
  }

  function work(G) {
    if (G.phase !== 'day') return { ok: false, msg: 'Vardiya bitti. Yarın sabah tekrar gel.' };
    if (G.energy < D.JOB.energy) return { ok: false, msg: `İş ${D.JOB.energy} enerji ister. Sende ${G.energy} var.` };
    const pay = wage(G);
    G.energy -= D.JOB.energy;
    G.cash += pay;
    G.shifts++;
    G.phase = 'evening';
    const lines = [`Benzinlikte 8 saat. +${money(pay)}.`];
    const ev = workEvent(G);
    if (ev) lines.push(ev);
    if (G.shifts % D.JOB.raiseEvery === 0 && (G.shifts / D.JOB.raiseEvery) * D.JOB.raise <= D.JOB.maxBonus) {
      lines.push(`Müdür memnun. Zam: vardiya başına +${money(D.JOB.raise)}.`);
    }
    return { ok: true, lines };
  }

  function workEvent(G) {
    const r = Math.random();
    if (!G.flags.metVinny && G.shifts >= 2 && r < 0.5) {
      G.flags.metVinny = true;
      return '"Kart oynar mısın evlat? Back Alley\'ye gel. Vinny\'yi sor."';
    }
    if (r < 0.12) { const tip = 10 + Math.floor(Math.random() * 25); G.cash += tip; return `Bir kamyoncu ${money(tip)} bahşiş bıraktı.`; }
    if (r < 0.18 && G.cash >= 10) { G.cash -= 10; return 'Soygun oldu. Kasadaki açığı maaşından kestiler: -$10.'; }
    if (r < 0.22) {
      const id = Math.random() < 0.6 ? 'bent_coin' : 'rabbit_foot';
      if (addItem(G, id)) return `Buz makinesinin altında bir şey parlıyor: ${itemDef(id).name}.`;
    }
    return null;
  }

  function rest(G) {
    if (G.phase !== 'day') return { ok: false };
    G.energy = Math.min(maxEnergy(G), G.energy + 20);
    G.phase = 'evening';
    return { ok: true, lines: ['Gün boyu yağmuru izledin. +20 enerji.'] };
  }

  // ---------- kira ve ev ----------
  const rentAmount = (G) => D.HOUSING[G.housing].rent * 4;

  function payRent(G) {
    const amt = rentAmount(G);
    if (G.housing === 'street') return { ok: false, msg: 'Ödeyecek bir odan yok.' };
    if (G.cash < amt) return { ok: false, msg: `Kira ${money(amt)}. Sende ${money(G.cash)} var.` };
    G.cash -= amt;
    G.rentDue += 4;
    return { ok: true, msg: `${money(amt)} kira ödendi. ${G.rentDue}. güne kadar rahatsın.` };
  }

  function moveTo(G, id) {
    const h = D.HOUSING[id];
    const cost = h.deposit + h.rent * 4;
    if (G.cash < cost) return { ok: false, msg: `Taşınmak ${money(cost)} tutuyor. Sende ${money(G.cash)} var.` };
    G.cash -= cost;
    if (h.rep && !G.flags['lived_' + id]) G.rep += h.rep;
    G.flags['lived_' + id] = true;
    G.housing = id;
    G.rentDue = G.day + 4;
    return { ok: true, msg: `${h.name} artık senin evin. -${money(cost)}.` };
  }

  // ---------- Mr. Black ----------
  const loanLimit = (G) => 500 + Math.floor(G.rep) * 150;

  function borrow(G, amt) {
    if (amt > loanLimit(G) - G.debt.amount) return { ok: false, msg: `Mr. Black toplamda ${money(loanLimit(G))}'dan fazla vermez.` };
    const owed = Math.round(amt * 1.2);
    if (G.debt.amount <= 0) G.debt.due = G.day + 5;
    G.debt.amount += owed;
    G.cash += amt;
    return { ok: true, msg: `Mr. Black ${money(amt)} sayıyor. ${money(owed)} geri ödeyeceksin. Son gün: ${G.debt.due}.` };
  }

  function repay(G, amt) {
    amt = Math.min(amt, G.debt.amount, G.cash);
    if (amt <= 0) return { ok: false, msg: 'Ödeyecek paran yok.' };
    G.cash -= amt;
    G.debt.amount -= amt;
    return { ok: true, msg: G.debt.amount <= 0 ? 'Mr. Black\'e borcun kalmadı. Şimdilik.' : `${money(amt)} ödendi. Kalan borç ${money(G.debt.amount)}.` };
  }

  function collectors(G, lines) {
    G.debt.amount = Math.round(G.debt.amount * 1.1);
    const valuables = G.items.slice().sort((a, b) => pawnValue(b.id) - pawnValue(a.id));
    let what;
    if (valuables.length && Math.random() < 0.6) {
      removeItem(G, valuables[0].uid);
      what = `${itemDef(valuables[0].id).name} gitti.`;
    } else if (G.cash > 0) {
      const took = Math.ceil(G.cash / 2);
      G.cash -= took;
      what = `Cebinden ${money(took)} aldılar.`;
    } else {
      what = 'Alacak bir şey bulamadılar. Yumruklarıyla hatırlattılar.';
    }
    G.energy = Math.max(10, G.energy - 30);
    G.debt.due = G.day + 2;
    lines.push(`Mr. Black'in adamları kapında bekliyordu. ${what} Borç %10 büyüdü: ${money(G.debt.amount)}. Yeni son gün: ${G.debt.due}.`);
  }

  // ---------- dükkan ----------
  function restockShop(G) {
    const weights = { 'sıradan': 50, 'nadir': 28, 'efsane': 6, 'kaçak': 16 };
    const pool = D.SHOP_POOL.slice();
    const stock = [];
    while (stock.length < 3 && pool.length) {
      const total = pool.reduce((s, id) => s + weights[itemDef(id).rarity], 0);
      let r = Math.random() * total;
      let pick = pool[0];
      for (const id of pool) { r -= weights[itemDef(id).rarity]; if (r <= 0) { pick = id; break; } }
      pool.splice(pool.indexOf(pick), 1);
      stock.push({ id: pick, price: Math.round(itemDef(pick).price * (0.85 + Math.random() * 0.3)) });
    }
    G.stock = stock;
  }

  function buy(G, idx) {
    const s = G.stock[idx];
    if (!s) return { ok: false };
    if (G.cash < s.price) return { ok: false, msg: `Sal ${money(s.price)} istiyor. Sende ${money(G.cash)} var.` };
    if (isFull(G)) return { ok: false, msg: `En fazla ${D.MAX_ITEMS} eşya taşıyabilirsin. Önce birini sat.` };
    G.cash -= s.price;
    addItem(G, s.id);
    G.stock.splice(idx, 1);
    return { ok: true };
  }

  function sell(G, uid) {
    const it = itemByUid(G, uid);
    if (!it) return { ok: false };
    G.cash += pawnValue(it.id);
    removeItem(G, uid);
    return { ok: true };
  }

  // ---------- uyku ve sabah ----------
  function sleep(G) {
    const lines = [];
    const summary = { cashStart: G.dayStartCash, cashEnd: G.cash };
    G.day++;
    G.phase = 'day';
    G.energy = maxEnergy(G);
    if (G.housing === 'street') lines.push('Bir kapı eşiğinde uyudun. Enerjin az.');

    if (G.housing !== 'street' && G.day >= G.rentDue) {
      const amt = rentAmount(G);
      const h = D.HOUSING[G.housing];
      if (G.cash >= amt) {
        G.cash -= amt;
        G.rentDue += 4;
        lines.push(`Kira ödendi: -${money(amt)}.`);
      } else if (G.day - G.rentDue >= 2) {
        lines.push(`Evden atıldın. ${h.name} kilidi değiştirdi. Artık sokaktasın.`);
        G.housing = 'street';
        G.rentDue = G.day;
        G.energy = maxEnergy(G);
      } else {
        lines.push(`Kirayı ödeyemedin (${money(amt)}). ${G.rentDue + 2}. güne kadar ödemezsen atılırsın.`);
      }
    }

    if (G.debt.amount > 0 && G.day > G.debt.due) collectors(G, lines);

    for (const [v, until] of Object.entries(G.bans)) if (G.day >= until) delete G.bans[v];
    restockShop(G);
    G.dayStartCash = G.cash;
    G.stats.peakCash = Math.max(G.stats.peakCash, G.cash);
    summary.lines = lines;
    return summary;
  }

  // Üst bardaki tek satır: en yakın ödeme.
  function nextBill(G) {
    const bills = [];
    if (G.housing !== 'street') bills.push({ what: 'Kira', amt: rentAmount(G), day: G.rentDue });
    if (G.debt.amount > 0) bills.push({ what: 'Mr. Black', amt: G.debt.amount, day: G.debt.due });
    return bills.sort((a, b) => a.day - b.day);
  }

  // ---------- casino ----------
  function venueStatus(G, v) {
    if (G.bans[v.id]) return { ok: false, reason: `${G.bans[v.id]}. güne kadar yasaklısın` };
    if (Math.floor(G.rep) < repNeeded(G, v)) return { ok: false, reason: `${repNeeded(G, v)} itibar gerekiyor` };
    if (G.cash < v.buyIn) return { ok: false, reason: `Paran yetmiyor` };
    return { ok: true };
  }

  // ---------- kayıt ----------
  function save(G) { try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) { /* depolama yok */ } }
  function load() {
    try {
      const G = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null');
      return G && G.v === 2 ? G : null;
    } catch (e) { return null; }
  }
  function wipe() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* yok say */ } }

  LC.life = {
    newGame, money, itemDef, itemByUid, itemIds, has, pawnValue, isFull, addItem, removeItem, maxEnergy, clampEnergy,
    repNeeded, wage, work, rest, rentAmount, payRent, moveTo, loanLimit, borrow, repay, restockShop, buy, sell, sleep,
    nextBill, venueStatus, save, load, wipe,
  };
})(typeof window !== 'undefined' ? (window.LC = window.LC || {}) : (globalThis.LC = globalThis.LC || {}));
