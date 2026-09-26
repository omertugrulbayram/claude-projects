// Everything outside the card table: time, money, rent, debt, job, items, housing.
(function (LC) {
  const D = LC.data;
  const SAVE_KEY = 'last-chip-save-v1';

  const START_CLOCK = 7 * 60;
  const PASS_OUT = 30 * 60; // 06:00 the next morning
  const LATE_NIGHT = 26 * 60; // going to bed after 02:00 counts as sleep deprivation
  const TRAVEL = 15;

  function newGame() {
    const G = {
      v: 1,
      day: 1,
      clock: START_CLOCK,
      cash: 63,
      energy: 100,
      rep: 0,
      debt: { amount: 400, due: 6 },
      housing: 'motel',
      rentDue: 4,
      ateToday: false,
      penalty: 0, // max-energy penalty for today (hunger, no sleep)
      shifts: 0,
      items: [{ uid: 1, id: 'dads_watch' }],
      equipped: { WATCH: 1 },
      nextUid: 2,
      stock: [],
      bans: {},
      npcs: {}, // per-opponent record
      flags: {},
      screen: 'intro',
      session: null,
      log: [],
      dayStartCash: 63,
      stats: { hands: 0, won: 0, biggestPot: 0, peakCash: 63, sessions: 0, busts: 0, days: 1 },
    };
    restockShop(G);
    log(G, 'You wake up in Room 9 of the Starlite Motel. $63 in your jeans. Rent is due on day 4.', 'plain');
    log(G, 'You still owe Mr. Black $400. He wants it by day 6.', 'bad');
    return G;
  }

  // ---------- formatting ----------
  const money = (n) => (n < 0 ? '-$' : '$') + Math.abs(Math.round(n)).toLocaleString('en-US');
  function fmtClock(clock) {
    const m = ((clock % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }
  const isNight = (clock) => clock % 1440 < 4 * 60;
  const isDark = (clock) => { const m = clock % 1440; return m >= 19 * 60 || m < 6 * 60; };

  function log(G, text, tone = 'plain') {
    G.log.push({ day: G.day, t: fmtClock(G.clock), text, tone });
    if (G.log.length > 80) G.log.splice(0, G.log.length - 80);
  }

  // ---------- items ----------
  const itemDef = (id) => D.ITEMS[id];
  const itemByUid = (G, uid) => G.items.find((i) => i.uid === uid);
  const equippedIds = (G) => Object.values(G.equipped).map((uid) => itemByUid(G, uid)).filter(Boolean).map((i) => i.id);
  const has = (G, id) => equippedIds(G).includes(id);
  const isEquipped = (G, uid) => Object.values(G.equipped).includes(uid);
  const stored = (G) => G.items.filter((i) => !isEquipped(G, i.uid));
  const storageCap = (G) => D.HOUSING[G.housing].storage;
  const pawnValue = (id) => itemDef(id).pawn || Math.round(itemDef(id).price * 0.5);

  function addItem(G, id) {
    const def = itemDef(id);
    const uid = G.nextUid++;
    if (!G.equipped[def.slot]) {
      G.items.push({ uid, id });
      G.equipped[def.slot] = uid;
      return true;
    }
    if (stored(G).length >= storageCap(G)) return false;
    G.items.push({ uid, id });
    return true;
  }

  function removeItem(G, uid) {
    for (const s of Object.keys(G.equipped)) if (G.equipped[s] === uid) delete G.equipped[s];
    G.items = G.items.filter((i) => i.uid !== uid);
  }

  function equip(G, uid) {
    const it = itemByUid(G, uid);
    if (!it) return;
    const slot = itemDef(it.id).slot;
    G.equipped[slot] = uid; // the previous item simply goes back to storage
    clampEnergy(G);
  }

  function unequip(G, slot) {
    if (stored(G).length >= storageCap(G)) {
      log(G, 'No room to put that away. Sell something or find a bigger place.', 'bad');
      return;
    }
    delete G.equipped[slot];
    clampEnergy(G);
  }

  // ---------- body ----------
  function maxEnergy(G) {
    return 100 + D.HOUSING[G.housing].energy + (has(G, 'dads_watch') ? 5 : 0) - G.penalty;
  }
  function clampEnergy(G) { G.energy = Math.max(0, Math.min(G.energy, maxEnergy(G))); }

  function effectiveRepNeeded(G, venue) {
    const discount = D.HOUSING[G.housing].repDiscount || 0;
    return Math.max(0, venue.rep - discount);
  }

  function spend(G, minutes) { G.clock += minutes; }

  // ---------- work ----------
  function shiftNow(G) {
    const m = G.clock;
    if (m >= 6 * 60 && m <= 12 * 60) return 'day';
    if (m >= 20 * 60 && m <= 22 * 60) return 'night';
    return null;
  }

  function wage(G, shift) {
    const bonus = Math.min(D.JOB.maxBonus, Math.floor(G.shifts / D.JOB.raiseEvery) * D.JOB.raise);
    return (shift === 'night' ? D.JOB.nightPay : D.JOB.dayPay) + bonus;
  }

  function work(G) {
    const shift = shiftNow(G);
    if (!shift) return { ok: false, msg: 'No shift right now. Day shift starts 06:00–12:00, night shift 20:00–22:00.' };
    const cost = shift === 'night' ? 40 : 30;
    if (G.energy < cost) return { ok: false, msg: "You're too tired to stand behind a register for eight hours." };
    const pay = wage(G, shift);
    spend(G, TRAVEL + 8 * 60);
    G.energy -= cost;
    G.cash += pay;
    G.shifts++;
    const lines = [`${shift === 'night' ? 'Night' : 'Day'} shift at the ${D.JOB.name}. +${money(pay)}.`];
    const ev = workEvent(G, shift);
    if (ev) lines.push(ev);
    if (G.shifts % D.JOB.raiseEvery === 0 && G.shifts / D.JOB.raiseEvery * D.JOB.raise <= D.JOB.maxBonus) {
      lines.push(`Manager says you're reliable. Raise: +${money(D.JOB.raise)} per shift.`);
    }
    lines.forEach((l, i) => log(G, l, i === 0 ? 'good' : 'plain'));
    return { ok: true, lines };
  }

  function workEvent(G, shift) {
    const r = Math.random();
    if (!G.flags.metVinny && G.shifts >= 2 && r < 0.5) {
      G.flags.metVinny = true;
      return "A dented Cadillac pulls in. The driver pays in quarters. 'You play cards, kid? Back Alley, behind the laundromat. Ask for Vinny.'";
    }
    if (r < 0.12) { const tip = 10 + Math.floor(Math.random() * 25); G.cash += tip; return `A trucker leaves a ${money(tip)} tip under the coffee pot.`; }
    if (r < 0.2) {
      G.energy = Math.max(0, G.energy - 10);
      if (G.cash >= 10) { G.cash -= 10; return 'Stick-up. Guy with a stocking on his head. The manager docks you $10 for the short till.'; }
      return 'Stick-up. Guy with a stocking on his head. Your hands shake for an hour.';
    }
    if (r < 0.24) {
      const id = Math.random() < 0.6 ? 'bent_coin' : 'rabbit_foot';
      if (addItem(G, id)) return `Something glints under the ice machine: ${itemDef(id).name}.`;
      return `You find a ${itemDef(id).name} under the ice machine, but you've got nowhere to keep it.`;
    }
    if (shift === 'night' && r < 0.3) { G.cash += 40; return "A man in a white suit buys cigarettes with a $50 bill. 'Keep it.'"; }
    if (r < 0.34) return 'Nothing happens for eight hours. You count the gum packets. 212.';
    return null;
  }

  // ---------- diner ----------
  function eat(G) {
    if (G.cash < 6) return { ok: false, msg: 'A plate at Rosie\'s is $6. You have ' + money(G.cash) + '.' };
    G.cash -= 6;
    spend(G, TRAVEL + 30);
    G.energy = Math.min(maxEnergy(G), G.energy + 15);
    const first = !G.ateToday;
    G.ateToday = true;
    const lines = ['Eggs, hash browns, bottomless coffee at Rosie\'s. -$6, +15 energy.'];
    if (first && Math.random() < 0.25) lines.push(rosieLine(G));
    lines.forEach((l) => log(G, l));
    return { ok: true, lines };
  }

  function rosieLine(G) {
    const opts = [
      "Rosie refills your cup. 'You look like you slept in a card shoe, hon.'",
      "The radio says it'll rain all week. It always says that.",
      "Someone left a newspaper. The Lucky Rabbit is hiring a new pit boss. Security is tightening.",
      G.debt.amount > 0 ? "Two men in grey coats at the counter. One of them says your name to the other." : "The waitress asks if you're still at the motel.",
    ];
    return opts[Math.floor(Math.random() * opts.length)];
  }

  // ---------- rent & housing ----------
  const rentAmount = (G) => D.HOUSING[G.housing].rent * 4;

  function payRent(G) {
    const amt = rentAmount(G);
    if (G.housing === 'street') return { ok: false, msg: 'You have no room to pay for.' };
    if (G.cash < amt) return { ok: false, msg: `Rent is ${money(amt)}. You have ${money(G.cash)}.` };
    G.cash -= amt;
    G.rentDue += 4;
    log(G, `Paid ${money(amt)} rent. Covered until day ${G.rentDue}.`, 'good');
    return { ok: true };
  }

  function moveTo(G, id) {
    const h = D.HOUSING[id];
    const cost = h.deposit + h.rent * 4;
    if (G.cash < cost) return { ok: false, msg: `Moving in costs ${money(cost)} (deposit plus four days). You have ${money(G.cash)}.` };
    G.cash -= cost;
    const firstTime = !G.flags['lived_' + id];
    G.flags['lived_' + id] = true;
    G.housing = id;
    G.rentDue = G.day + 4;
    if (h.rep && firstTime) G.rep += h.rep;
    spend(G, 60);
    log(G, `You move into the ${h.name}. -${money(cost)}.`, 'good');
    return { ok: true };
  }

  // ---------- Mr. Black ----------
  const loanLimit = (G) => 500 + Math.floor(G.rep) * 150;

  function borrow(G, amt) {
    const room = loanLimit(G) - G.debt.amount;
    if (amt > room) return { ok: false, msg: `Mr. Black won't go past ${money(loanLimit(G))} total with someone of your reputation.` };
    const owed = Math.round(amt * 1.2);
    if (G.debt.amount <= 0) G.debt.due = G.day + 5;
    G.debt.amount += owed;
    G.cash += amt;
    log(G, `Mr. Black counts out ${money(amt)}. You owe ${money(owed)} more. Due day ${G.debt.due}.`, 'bad');
    return { ok: true };
  }

  function repay(G, amt) {
    amt = Math.min(amt, G.debt.amount, G.cash);
    if (amt <= 0) return { ok: false, msg: 'Nothing to pay with.' };
    G.cash -= amt;
    G.debt.amount -= amt;
    if (G.debt.amount <= 0) { G.debt.amount = 0; log(G, "You're square with Mr. Black. For now.", 'good'); }
    else log(G, `Paid Mr. Black ${money(amt)}. Still owe ${money(G.debt.amount)}.`, 'plain');
    return { ok: true };
  }

  function collectors(G, lines) {
    G.debt.amount = Math.round(G.debt.amount * 1.1);
    const valuables = G.items.filter((i) => pawnValue(i.id) > 0).sort((a, b) => pawnValue(b.id) - pawnValue(a.id));
    let what;
    if (valuables.length && Math.random() < 0.6) {
      const it = valuables[0];
      removeItem(G, it.uid);
      what = `They take your ${itemDef(it.id).name}.`;
    } else if (G.cash > 0) {
      const took = Math.ceil(G.cash / 2);
      G.cash -= took;
      what = `They take ${money(took)} from your jacket.`;
    } else {
      what = 'You have nothing, so they remind you with their fists.';
    }
    G.energy = Math.max(10, G.energy - 30);
    G.debt.due = G.day + 2;
    lines.push(`Mr. Black's men were waiting outside your door. ${what} The debt grows 10% to ${money(G.debt.amount)}. New deadline: day ${G.debt.due}.`);
  }

  // ---------- pawn shop ----------
  function restockShop(G) {
    const weights = { common: 50, rare: 28, legendary: 6, illegal: 16 };
    const pool = D.SHOP_POOL.slice();
    const stock = [];
    while (stock.length < 4 && pool.length) {
      const total = pool.reduce((s, id) => s + weights[itemDef(id).rarity], 0);
      let r = Math.random() * total;
      let pick = pool[0];
      for (const id of pool) { r -= weights[itemDef(id).rarity]; if (r <= 0) { pick = id; break; } }
      pool.splice(pool.indexOf(pick), 1);
      const price = Math.round(itemDef(pick).price * (0.85 + Math.random() * 0.3));
      stock.push({ id: pick, price });
    }
    G.stock = stock;
  }

  function buy(G, idx) {
    const s = G.stock[idx];
    if (!s) return { ok: false };
    if (G.cash < s.price) return { ok: false, msg: `Sal wants ${money(s.price)}. You have ${money(G.cash)}.` };
    if (!addItem(G, s.id)) return { ok: false, msg: 'No room for it. Sell something or move somewhere bigger.' };
    G.cash -= s.price;
    G.stock.splice(idx, 1);
    log(G, `Bought ${itemDef(s.id).name} for ${money(s.price)}.`, 'plain');
    return { ok: true };
  }

  function sell(G, uid) {
    const it = itemByUid(G, uid);
    if (!it) return { ok: false };
    const v = pawnValue(it.id);
    G.cash += v;
    removeItem(G, uid);
    log(G, `Sal gives you ${money(v)} for the ${itemDef(it.id).name}.`, 'plain');
    clampEnergy(G);
    return { ok: true };
  }

  // ---------- sleep & the morning ----------
  function sleep(G, passedOut = false) {
    const lines = [];
    const late = G.clock >= LATE_NIGHT;
    const summary = { fromDay: G.day, cashStart: G.dayStartCash, cashEnd: G.cash };

    let penalty = 0;
    if (late) { penalty += 20; lines.push('You got to bed after 02:00. Sleep deprived: -20 max energy today.'); }
    if (!G.ateToday) { penalty += 15; lines.push("You didn't eat yesterday. Hungry: -15 max energy today."); }
    if (passedOut) { penalty += 10; lines.push('You passed out on a bus bench and woke up at sunrise with a stiff neck.'); }

    G.day++;
    G.stats.days = G.day;
    G.clock = START_CLOCK;
    G.ateToday = false;
    G.penalty = penalty;
    const h = D.HOUSING[G.housing];
    G.energy = Math.round(maxEnergy(G) * h.sleep * (late ? 0.8 : 1) * (passedOut ? 0.7 : 1));
    if (G.housing === 'street') lines.push('You slept in a doorway on 5th. Only 60% rested.');

    // rent
    if (G.housing !== 'street' && G.day >= G.rentDue) {
      const amt = rentAmount(G);
      if (G.cash >= amt) {
        G.cash -= amt;
        G.rentDue += 4;
        lines.push(`Rent collected: -${money(amt)}. Paid through day ${G.rentDue}.`);
      } else if (G.day - G.rentDue >= 2) {
        lines.push(`Evicted. The ${h.name} changed the locks. Your stuff is in a garbage bag by the dumpster.`);
        G.housing = 'street';
        G.rentDue = G.day;
      } else {
        lines.push(`Rent is overdue: ${money(amt)}. Pay by day ${G.rentDue + 2} or you're out.`);
      }
    }

    // debt
    if (G.debt.amount > 0) {
      if (G.day > G.debt.due) collectors(G, lines);
      else if (G.debt.due - G.day <= 1) lines.push(`Mr. Black expects ${money(G.debt.amount)} by the end of day ${G.debt.due}.`);
    }

    // bans expire
    for (const [v, until] of Object.entries(G.bans)) if (G.day >= until) delete G.bans[v];

    restockShop(G);
    summary.lines = lines;
    G.dayStartCash = G.cash;
    G.stats.peakCash = Math.max(G.stats.peakCash, G.cash);
    log(G, `DAY ${G.day}. ${money(G.cash)} in your pocket.`, 'plain');
    lines.forEach((l) => log(G, l, /Evicted|men|Hungry|deprived|overdue/.test(l) ? 'bad' : 'plain'));
    return summary;
  }

  // ---------- casino access ----------
  function venueStatus(G, v) {
    const need = effectiveRepNeeded(G, v);
    if (G.bans[v.id]) return { ok: false, reason: `Banned until day ${G.bans[v.id]}` };
    if (Math.floor(G.rep) < need) return { ok: false, reason: `Requires reputation ${need}` };
    const open = G.clock >= v.open && G.clock < v.close - 20;
    if (!open) return { ok: false, reason: `Open ${fmtClock(v.open)}–${fmtClock(v.close)}` };
    if (G.cash < v.buyIn) return { ok: false, reason: `Buy-in ${money(v.buyIn)}`, broke: true };
    if (G.energy < 5) return { ok: false, reason: 'Too tired to play' };
    return { ok: true };
  }

  // ---------- save ----------
  function save(G) {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(G)); } catch (e) { /* storage unavailable */ }
  }
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return null;
      const G = JSON.parse(raw);
      return G && G.v === 1 ? G : null;
    } catch (e) { return null; }
  }
  function wipe() { try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ } }

  LC.life = {
    TRAVEL, PASS_OUT, newGame, money, fmtClock, isNight, isDark, log,
    itemDef, itemByUid, equippedIds, has, isEquipped, stored, storageCap, pawnValue, addItem, removeItem, equip, unequip,
    maxEnergy, clampEnergy, spend, shiftNow, wage, work, eat, rentAmount, payRent, moveTo,
    loanLimit, borrow, repay, restockShop, buy, sell, sleep, venueStatus, effectiveRepNeeded, save, load, wipe,
  };
})(typeof window !== 'undefined' ? (window.LC = window.LC || {}) : (globalThis.LC = globalThis.LC || {}));
