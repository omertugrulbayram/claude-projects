// Heads-up fixed-limit Five-Card Draw against one opponent, with lucky-item hooks.
(function (LC) {
  const C = LC.cards;
  const D = LC.data;
  const L = LC.life;
  const HAND_MINUTES = 12;
  const MAX_DISCARD = 3;
  const RAISE_CAP = 3; // bet + two raises per round

  const venueOf = (id) => D.VENUES.find((v) => v.id === id);
  const luck = (G) => (L.has(G, 'loaded_dice') ? 0.15 : 0);
  const chance = (G, p) => Math.random() < p + luck(G);
  const npcDef = (S) => D.NPCS[S.npc.id];
  const other = (w) => (w === 'p' ? 'n' : 'p');

  function tlog(S, text, tone = 'plain') {
    S.log.push({ text, tone });
    if (S.log.length > 40) S.log.shift();
  }

  // ---------- session ----------
  function startSession(G, venueId) {
    const v = venueOf(venueId);
    G.cash -= v.buyIn;
    G.session = {
      venueId, stack: v.buyIn, invested: v.buyIn, npc: null, hand: null, button: false,
      lossStreak: 0, bentUsed: false, sleeveUsed: false, log: [], hands: 0, lastNpc: null,
    };
    G.stats.sessions++;
    G.clock += L.TRAVEL;
    L.log(G, `Bought in at ${v.name} for ${L.money(v.buyIn)}.`, 'plain');
    tlog(G.session, `You buy ${L.money(v.buyIn)} in chips. Ante ${L.money(v.ante)}, bets ${L.money(v.bets[0])}/${L.money(v.bets[1])}.`);
    seatNpc(G);
  }

  function rebuy(G) {
    const S = G.session;
    const v = venueOf(S.venueId);
    if (G.cash < v.buyIn) return { ok: false, msg: `A rebuy is ${L.money(v.buyIn)}. You have ${L.money(G.cash)}.` };
    G.cash -= v.buyIn;
    S.stack += v.buyIn;
    S.invested += v.buyIn;
    tlog(S, `Rebuy. Another ${L.money(v.buyIn)} goes across the felt.`, 'bad');
    L.log(G, `Rebought at ${v.name} for ${L.money(v.buyIn)}.`, 'bad');
    return { ok: true };
  }

  function seatNpc(G) {
    const S = G.session;
    const v = venueOf(S.venueId);
    let id;
    if (L.isNight(G.clock) && v.tier >= 1 && Math.random() < 0.3 && S.lastNpc !== 'zero') id = 'zero';
    else {
      let pool = v.pool.filter((p) => p !== S.lastNpc);
      if (!pool.length) pool = v.pool;
      id = pool[Math.floor(Math.random() * pool.length)];
    }
    const stack = Math.round((v.buyIn * (1 + Math.random() * 1.5)) / v.ante) * v.ante;
    S.npc = { id, stack, tilt: 0 };
    const rec = (G.npcs[id] = G.npcs[id] || { won: 0, lost: 0, met: 0 });
    rec.met++;
    const def = D.NPCS[id];
    tlog(S, rec.met === 1 ? `${def.name} sits down with ${L.money(stack)}. ${def.tag}` : `${def.name} is back, with ${L.money(stack)}.`);
  }

  function waitForPlayer(G) {
    G.clock += 20;
    seatNpc(G);
  }

  function cashOut(G, reason) {
    const S = G.session;
    const v = venueOf(S.venueId);
    const pnl = S.stack - S.invested;
    G.cash += S.stack;
    if (S.stack === 0) G.stats.busts++;
    G.stats.peakCash = Math.max(G.stats.peakCash, G.cash);
    const why = reason === 'closing' ? `${v.name} is closing. ` : '';
    const text = `${why}You leave ${v.name} ${pnl >= 0 ? 'up' : 'down'} ${L.money(Math.abs(pnl))}.`;
    L.log(G, text, pnl >= 0 ? 'good' : 'bad');
    G.clock += L.TRAVEL;
    G.session = null;
    return { pnl, text };
  }

  function caught(G, how) {
    const S = G.session;
    const v = venueOf(S.venueId);
    const lost = S.stack + (S.hand && S.hand.phase !== 'done' ? S.hand.contrib.p : 0);
    const illegal = L.equippedIds(G).filter((id) => D.ITEMS[id].rarity === 'illegal');
    for (const [slot, uid] of Object.entries(G.equipped)) {
      const it = L.itemByUid(G, uid);
      if (it && D.ITEMS[it.id].rarity === 'illegal') L.removeItem(G, uid);
      void slot;
    }
    G.bans[v.id] = G.day + 3;
    G.rep = Math.max(0, G.rep - 5);
    const names = illegal.map((id) => D.ITEMS[id].name).join(', ') || 'your sleeve';
    const text = `Two men in blazers take your arms before the ${how === 'sleeve' ? 'Ace hits the felt' : 'next card is dealt'}. They find ${names}. Your ${L.money(lost)} in chips stays with the house. BANNED FROM ${v.name.toUpperCase()} until day ${G.day + 3}. Reputation -5.`;
    L.log(G, text, 'bad');
    G.clock += 30;
    G.session = null;
    return { caught: true, text };
  }

  // ---------- betting helpers ----------
  const stackOf = (G, w) => (w === 'p' ? G.session.stack : G.session.npc.stack);
  function takeChips(G, w, amt) {
    const S = G.session;
    amt = Math.max(0, Math.min(amt, stackOf(G, w)));
    if (w === 'p') S.stack -= amt; else S.npc.stack -= amt;
    return amt;
  }
  function put(G, w, amt) {
    const H = G.session.hand;
    const a = takeChips(G, w, amt);
    H.pot += a;
    H.contrib[w] += a;
    H.round.rc[w] += a;
    return a;
  }
  const allIn = (G, w) => stackOf(G, w) === 0;

  function newRound(size, first) {
    return { size, cur: 0, rc: { p: 0, n: 0 }, bets: 0, acted: { p: false, n: false }, toAct: first, first };
  }

  function needsAction(G, w) {
    const R = G.session.hand.round;
    if (allIn(G, w)) return false;
    return !R.acted[w] || R.rc[w] < R.cur;
  }

  function nextActor(G, preferred) {
    if (needsAction(G, preferred)) return preferred;
    if (needsAction(G, other(preferred))) return other(preferred);
    return null;
  }

  function canRaise(G, w) {
    const R = G.session.hand.round;
    const toCall = R.cur - R.rc[w];
    return R.bets < RAISE_CAP && !allIn(G, other(w)) && stackOf(G, w) > toCall;
  }

  // What the player may do right now.
  function options(G) {
    const S = G.session;
    const H = S && S.hand;
    if (!H || !['bet1', 'bet2'].includes(H.phase) || H.round.toAct !== 'p') return null;
    const R = H.round;
    const toCall = R.cur - R.rc.p;
    const stack = S.stack;
    const raiseTo = Math.min(toCall + R.size, stack);
    return {
      toCall,
      callAmt: Math.min(toCall, stack),
      raiseAmt: raiseTo,
      canRaise: canRaise(G, 'p'),
      facing: toCall > 0,
    };
  }

  // ---------- a hand ----------
  function startHand(G) {
    const S = G.session;
    const v = venueOf(S.venueId);
    if (!S.npc) return { ok: false, msg: 'The seat across from you is empty.' };
    if (S.stack < v.ante) return { ok: false, msg: 'Not enough chips for the ante.' };
    if (G.energy < 3) return { ok: false, msg: 'Your eyes won’t focus on the cards. Go home.' };
    if (G.clock + HAND_MINUTES >= v.close) return { closing: true };

    let heat = 0;
    for (const id of L.equippedIds(G)) heat += D.ITEMS[id].heat || 0;
    if (heat > 0 && Math.random() < heat * v.security) return caught(G, 'items');

    G.clock += HAND_MINUTES;
    G.energy = Math.max(0, G.energy - 2);
    S.button = !S.button;
    S.hands++;
    G.stats.hands++;

    const deck = C.shuffle(C.newDeck());
    const H = {
      deck, p: deck.splice(0, 5), n: deck.splice(0, 5), pot: 0, contrib: { p: 0, n: 0 },
      phase: 'bet1', selected: [], ringActive: false, marked: -1, tell: null, drew: { p: null, n: null },
      lowStack: S.stack < v.buyIn * 0.2, result: null, round: null, notes: [], sleeveIdx: -1,
    };
    S.hand = H;
    H.round = newRound(v.bets[0], S.button ? 'n' : 'p');

    // antes (not part of the betting round)
    if (L.has(G, 'lucky_scarf') && chance(G, 0.25)) {
      H.pot += v.ante;
      H.notes.push('Lucky Scarf: the house covers your ante.');
    } else {
      const a = takeChips(G, 'p', v.ante);
      H.pot += a; H.contrib.p += a;
    }
    const na = takeChips(G, 'n', v.ante);
    H.pot += na; H.contrib.n += na;

    if (L.has(G, 'dead_mans_ring') && S.lossStreak >= 3) {
      H.ringActive = true;
      S.lossStreak = 0;
      H.notes.push("Dead Man's Ring goes cold on your finger. Spades are coming.");
    }
    if (L.has(G, 'marked_cards')) H.marked = Math.floor(Math.random() * 5);
    H.round.toAct = nextActor(G, H.round.first);
    H.notes.forEach((n) => tlog(S, n, 'item'));
    if (!H.round.toAct) advance(G);
    return { ok: true };
  }

  function act(G, w, action) {
    const S = G.session;
    const H = S.hand;
    const R = H.round;
    const name = w === 'p' ? 'You' : npcDef(S).name;
    const toCall = R.cur - R.rc[w];
    if (action === 'fold') {
      tlog(S, `${name} ${w === 'p' ? 'fold' : 'folds'}.`);
      return settle(G, other(w), 'fold');
    }
    if (action === 'check') {
      R.acted[w] = true;
      tlog(S, `${name} ${w === 'p' ? 'check' : 'checks'}.`);
    } else if (action === 'call') {
      const a = put(G, w, toCall);
      R.acted[w] = true;
      tlog(S, `${name} ${w === 'p' ? 'call' : 'calls'} ${L.money(a)}${allIn(G, w) ? ', all in' : ''}.`);
    } else if (action === 'bet' || action === 'raise') {
      const a = put(G, w, toCall + R.size);
      R.cur = Math.max(R.cur, R.rc[w]);
      R.bets++;
      R.acted[w] = true;
      R.acted[other(w)] = false;
      const verb = R.bets === 1 ? (w === 'p' ? 'bet' : 'bets') : (w === 'p' ? 'raise' : 'raises');
      tlog(S, `${name} ${verb} ${L.money(a)}${allIn(G, w) ? ', all in' : ''}.`, w === 'n' ? 'npc' : 'plain');
    }
    if (w === 'n') readTell(G, action);
    R.toAct = nextActor(G, other(w));
    if (!R.toAct) advance(G);
    return { ok: true };
  }

  function advance(G) {
    const S = G.session;
    const H = S.hand;
    const v = venueOf(S.venueId);
    if (H.phase === 'bet1') {
      H.phase = 'draw';
      H.round.toAct = null;
    } else if (H.phase === 'bet2') {
      settle(G, null, 'showdown');
    } else if (H.phase === 'draw') {
      if (allIn(G, 'p') || allIn(G, 'n')) return settle(G, null, 'showdown');
      H.phase = 'bet2';
      H.round = newRound(v.bets[1], S.button ? 'n' : 'p');
      H.round.toAct = nextActor(G, H.round.first);
      if (!H.round.toAct) settle(G, null, 'showdown');
    }
  }

  function drawCard(H) {
    if (H.ringActive && Math.random() < 0.5) {
      const i = H.deck.findIndex((c) => c.s === '♠');
      if (i >= 0) return H.deck.splice(i, 1)[0];
    }
    return H.deck.pop();
  }

  function drawPlayer(G, idxs) {
    const S = G.session;
    const H = S.hand;
    idxs = [...new Set(idxs)].filter((i) => i >= 0 && i < 5).slice(0, MAX_DISCARD);
    idxs.forEach((i) => { H.p[i] = drawCard(H); });
    H.drew.p = idxs.length;
    H.fresh = idxs;
    tlog(S, idxs.length ? `You draw ${idxs.length}.` : 'You stand pat.');

    if (idxs.length && L.has(G, 'rabbit_foot') && chance(G, 0.12)) rabbitFoot(G);

    // opponent draws
    const def = npcDef(S);
    let out = C.chooseDiscards(H.n, MAX_DISCARD);
    if (def.patBluff && out.length >= 2 && Math.random() < 0.3) { out = []; H.npcPatBluff = true; }
    out.forEach((i) => { H.n[i] = H.deck.pop(); });
    H.drew.n = out.length;
    tlog(S, out.length ? `${def.name} draws ${out.length}.` : `${def.name} stands pat.`, 'npc');
    H.selected = [];
    advance(G);
  }

  function rabbitFoot(G) {
    const H = G.session.hand;
    const before = C.evaluate(H.p);
    const counts = {};
    H.p.forEach((c) => (counts[c.r] = (counts[c.r] || 0) + 1));
    let worst = -1;
    H.p.forEach((c, i) => { if (counts[c.r] === 1 && (worst < 0 || c.r < H.p[worst].r)) worst = i; });
    if (worst < 0) return;
    for (let k = 0; k < H.deck.length; k++) {
      const trial = H.p.slice();
      trial[worst] = H.deck[k];
      if (C.evaluate(trial).cat > before.cat) {
        H.p[worst] = H.deck.splice(k, 1)[0];
        tlog(G.session, "Rabbit's Foot twitches in your pocket. One card changes.", 'item');
        return;
      }
    }
  }

  function useSleeve(G, idx) {
    const S = G.session;
    const H = S.hand;
    const v = venueOf(S.venueId);
    if (!L.has(G, 'ace_sleeve') || S.sleeveUsed || H.phase !== 'draw') return { ok: false };
    const suits = C.SUITS.filter((s) => H.deck.some((c) => c.r === 14 && c.s === s));
    if (!suits.length) return { ok: false, msg: 'Every Ace is already on the table.' };
    S.sleeveUsed = true;
    if (Math.random() < D.ITEMS.ace_sleeve.useHeat * v.security) return caught(G, 'sleeve');
    const s = suits[Math.floor(Math.random() * suits.length)];
    H.deck.splice(H.deck.findIndex((c) => c.r === 14 && c.s === s), 1);
    H.p[idx] = { r: 14, s };
    H.selected = H.selected.filter((i) => i !== idx);
    tlog(S, 'You palm an Ace. Nobody blinks.', 'item');
    return { ok: true };
  }

  // ---------- opponent brain ----------
  function npcDecide(G) {
    const S = G.session;
    const H = S.hand;
    const R = H.round;
    const def = npcDef(S);
    const t = S.npc.tilt;
    const aggr = def.aggr + 0.3 * t;
    const bluff = def.bluff + 0.15 * t;
    const tight = def.tight - 0.25 * t;
    const pre = H.phase === 'bet1';
    let s = C.strength(H.n, pre);
    if (H.npcPatBluff) s = Math.max(s, 0.3);
    if (!pre && H.drew.p !== null) {
      if (H.drew.p === 0) s -= 0.06;
      else if (H.drew.p === 3) s += 0.05;
    }
    if (def.reads && G.energy < 25) s += 0.05;
    const toCall = R.cur - R.rc.n;
    const raiseOk = canRaise(G, 'n');
    const betT = 0.78 - aggr * 0.3;
    const r = Math.random();
    H.npcStrength = s;
    if (toCall === 0) {
      if (raiseOk && s > betT) return 'bet';
      if (raiseOk && r < bluff) return 'bet';
      return 'check';
    }
    const odds = toCall / (H.pot + toCall);
    let callT = 0.3 + tight * 0.3 + odds * 0.3 - (pre ? 0.05 : 0);
    if (L.has(G, 'gold_chain')) callT += 0.06;
    if (G.energy < 20) callT -= 0.06;
    if (raiseOk && s > betT + 0.1) return 'raise';
    if (raiseOk && def.bigBluff && r < bluff * 2) return 'raise';
    if (s > callT) return 'call';
    if (raiseOk && r < bluff * 0.5) return 'raise';
    if (r < (1 - tight) * 0.15) return 'call';
    return 'fold';
  }

  function npcTurn(G) {
    const H = G.session.hand;
    if (!H || H.round.toAct !== 'n' || !['bet1', 'bet2'].includes(H.phase)) return;
    act(G, 'n', npcDecide(G));
  }

  function readTell(G, action) {
    const H = G.session.hand;
    if (!H || !L.has(G, 'cheap_shades') || action === 'fold') return;
    const def = npcDef(G.session);
    const strong = (H.npcStrength ?? C.strength(H.n, H.phase === 'bet1')) >= 0.6;
    const shown = Math.random() < 0.66 ? strong : !strong;
    H.tell = def.tells[shown ? 'strong' : 'weak'];
  }

  // ---------- showdown ----------
  function settle(G, winner, reason) {
    const S = G.session;
    const H = S.hand;
    const v = venueOf(S.venueId);
    const def = npcDef(S);
    const rec = G.npcs[S.npc.id];
    H.phase = 'done';
    H.round.toAct = null;

    if (reason === 'showdown') {
      const diff = H.contrib.p - H.contrib.n;
      if (diff > 0) { S.stack += diff; H.pot -= diff; H.contrib.p -= diff; }
      if (diff < 0) { S.npc.stack -= diff; H.pot += diff; H.contrib.n += diff; }
    }

    const pEv = L.has(G, 'black_joker') ? C.evaluateWild(H.p) : C.evaluate(H.p);
    const nEv = C.evaluate(H.n);
    if (reason === 'showdown') {
      const c = C.compare(pEv, nEv);
      winner = c > 0 ? 'p' : c < 0 ? 'n' : 'split';
    }
    const res = { winner, reason, pot: H.pot, pEv, nEv, bonus: 0, notes: [] };
    H.result = res;
    G.stats.biggestPot = Math.max(G.stats.biggestPot, H.pot);

    const repMult = L.has(G, 'fedora') ? 1.5 : 1;
    if (winner === 'p') {
      S.stack += H.pot;
      const net = H.pot - H.contrib.p;
      let bonus = 0;
      if (L.has(G, 'night_owl') && L.isNight(G.clock)) {
        const b = Math.round(net * 0.25);
        if (b > 0) { bonus += b; res.notes.push(`Night Owl: +${L.money(b)}`); }
      }
      if (L.has(G, 'last_cigarette') && H.lowStack && pEv.cat >= 4 && reason === 'showdown') {
        const b = Math.round(net * 1.5);
        bonus += b;
        res.notes.push(`Last Cigarette: x2.5, +${L.money(b)}`);
        if (Math.random() < 0.25) {
          const uid = G.equipped.POCKET;
          L.removeItem(G, uid);
          res.notes.push('The Last Cigarette burns down to your fingers. Gone.');
        }
      }
      S.stack += bonus;
      res.bonus = bonus;
      G.rep += 0.25 * (v.tier + 1) * repMult;
      S.lossStreak = 0;
      rec.lost++;
      G.stats.won++;
      if (reason === 'showdown' && S.npc.id === 'zero') {
        G.flags.zeroWins = (G.flags.zeroWins || 0) + 1;
        res.notes.push(`Zero nods at you. (${Math.min(5, G.flags.zeroWins)}/5)`);
        if (G.flags.zeroWins === 5) {
          const got = L.addItem(G, 'black_joker');
          res.notes.push(got ? 'Zero leaves a single card face down in front of you: the BLACK JOKER.' : 'Zero leaves you a card, but you have nowhere to keep it. It vanishes.');
        }
      }
      if (H.pot >= v.bets[1] * 3 && def.tilt > 0) {
        S.npc.tilt = Math.min(1, S.npc.tilt + def.tilt);
        if (def.tilt >= 0.5) res.notes.push(`${def.name} is steaming. Tilt.`);
      }
    } else if (winner === 'n') {
      S.npc.stack += H.pot;
      S.lossStreak++;
      rec.won++;
      if (L.has(G, 'bent_coin') && !S.bentUsed) {
        S.bentUsed = true;
        if (chance(G, 0.2)) {
          const back = Math.round(H.contrib.p * 0.5);
          S.stack += back;
          res.notes.push(`Bent Coin: ${L.money(back)} comes back to you.`);
        }
      }
      S.npc.tilt *= 0.5;
    } else {
      const half = Math.floor(H.pot / 2);
      S.stack += H.pot - half;
      S.npc.stack += half;
    }
    if (winner !== 'p') S.npc.tilt *= 0.8;

    const line = reason === 'fold'
      ? (winner === 'p' ? `You take the pot: ${L.money(res.pot)}.` : `${def.name} takes the pot: ${L.money(res.pot)}.`)
      : winner === 'split'
        ? `Split pot. Both of you hold ${C.describe(pEv)}.`
        : winner === 'p'
          ? `Your ${C.describe(pEv)} beats ${C.describe(nEv)}. +${L.money(res.pot)}.`
          : `${def.name}'s ${C.describe(nEv)} beats your ${C.describe(pEv)}.`;
    tlog(S, line, winner === 'p' ? 'good' : winner === 'n' ? 'bad' : 'plain');
    res.notes.forEach((n) => tlog(S, n, 'item'));

    if (S.npc.stack < v.ante) {
      res.npcBust = true;
      G.rep += 2 * (v.tier + 1) * repMult;
      tlog(S, `${def.name} is out of chips and leaves the table.`, 'good');
      L.log(G, `You busted ${def.name} at ${v.name}.`, 'good');
      S.lastNpc = S.npc.id;
      S.npc = null;
    }
    if (S.stack < v.ante) res.playerBust = true;
    return { ok: true };
  }

  LC.poker = {
    HAND_MINUTES, MAX_DISCARD, venueOf, startSession, rebuy, seatNpc, waitForPlayer, cashOut,
    startHand, act, options, drawPlayer, useSleeve, npcTurn, npcDecide,
  };
})(typeof window !== 'undefined' ? (window.LC = window.LC || {}) : (globalThis.LC = globalThis.LC || {}));
