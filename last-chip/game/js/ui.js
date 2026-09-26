// Screens, input and the main loop glue.
(function (LC) {
  const D = LC.data;
  const L = LC.life;
  const P = LC.poker;
  const C = LC.cards;
  const $ = (s) => document.querySelector(s);
  const money = L.money;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  let G = null;
  let npcTimer = null;

  // ---------- HUD ----------
  function hud() {
    const max = L.maxEnergy(G);
    const pct = Math.max(0, Math.min(100, Math.round((G.energy / max) * 100)));
    const debt = G.debt.amount > 0
      ? `<b class="${G.day >= G.debt.due ? 'bad' : ''}">${money(G.debt.amount)}</b><small>due day ${G.debt.due}</small>`
      : '<b>$0</b><small>clean</small>';
    const home = D.HOUSING[G.housing];
    const rentLine = G.housing === 'street' ? 'no rent' : (G.day >= G.rentDue ? '<span class="bad">rent overdue</span>' : `rent day ${G.rentDue}`);
    return `
      <div class="hud-cell"><span>Day</span><b>${G.day}</b><small>${L.fmtClock(G.clock)}${L.isNight(G.clock) ? ' · late' : ''}</small></div>
      <div class="hud-cell cash"><span>Cash</span><b>${money(G.cash)}</b><small>${G.session ? 'chips ' + money(G.session.stack) : '&nbsp;'}</small></div>
      <div class="hud-cell"><span>Owed</span>${debt}</div>
      <div class="hud-cell"><span>Energy</span><b>${G.energy}<i>/${max}</i></b><div class="bar"><div style="width:${pct}%" class="${pct < 25 ? 'low' : ''}"></div></div></div>
      <div class="hud-cell"><span>Rep</span><b>${Math.floor(G.rep)}</b><small>${repTitle(G.rep)}</small></div>
      <div class="hud-cell"><span>Home</span><b class="home">${esc(home.name)}</b><small>${rentLine}</small></div>`;
  }

  function repTitle(r) {
    if (r < 5) return 'nobody';
    if (r < 15) return 'regular';
    if (r < 30) return 'known face';
    if (r < 50) return 'shark';
    if (r < 65) return 'high roller';
    return 'legend';
  }

  // ---------- screens ----------
  function screenIntro() {
    return `
      <div class="intro">
        <h1 class="logo">LAST<span>CHIP</span></h1>
        <p class="intro-lines">DAY 1<br>${money(63)} in your jeans.<br>Rent due in 4 days.<br>${money(400)} owed to a man called Mr. Black.</p>
        <div class="row">
          <button class="btn primary" data-act="intro-work">Go to work</button>
          <button class="btn" data-act="intro-casino">Go to the casino</button>
        </div>
      </div>`;
  }

  function place(title, sub) {
    return `<header class="place"><h2>${esc(title)}</h2>${sub ? `<p>${sub}</p>` : ''}</header>`;
  }

  function screenHub() {
    const shift = L.shiftNow(G);
    const h = D.HOUSING[G.housing];
    const openVenues = D.VENUES.filter((v) => G.clock >= v.open && G.clock < v.close - 20);
    const cheapest = D.VENUES.filter((v) => Math.floor(G.rep) >= L.effectiveRepNeeded(G, v))[0];
    const pawnOpen = G.clock % 1440 >= 9 * 60 && G.clock % 1440 < 21 * 60 && G.clock < 1440;
    const tiles = [
      ['work', 'Work', shift ? `${shift === 'night' ? 'Night' : 'Day'} shift · 8h · +${money(L.wage(G, shift))}` : 'Shifts start 06–12 or 20–22', !shift],
      ['casino', 'Casino', openVenues.length ? `${openVenues.length} table${openVenues.length > 1 ? 's' : ''} open · from ${money(openVenues[0].buyIn)}` : `Opens ${L.fmtClock(Math.min(...D.VENUES.map((v) => v.open)))}`, false],
      ['pawn', "Sal's Pawn", pawnOpen ? 'Buy and sell lucky items' : 'Open 09:00–21:00', !pawnOpen],
      ['eat', "Rosie's Diner", `Plate $6 · +15 energy${G.ateToday ? '' : ' · not eaten today'}`, false],
      ['black', 'Mr. Black', G.debt.amount ? `You owe ${money(G.debt.amount)}` : `Loans up to ${money(L.loanLimit(G))}`, false],
      ['stuff', 'Your stuff', `${L.equippedIds(G).length}/6 slots worn · housing`, false],
      ['sleep', 'Sleep', G.clock >= 26 * 60 ? 'Late. You will feel it tomorrow.' : 'Until 07:00', false],
    ];
    const rentBtn = G.housing !== 'street' && G.day >= G.rentDue - 1
      ? `<button class="btn warn" data-act="rent">Pay rent now: ${money(L.rentAmount(G))}</button>` : '';
    const moveBack = G.housing === 'street'
      ? `<button class="btn warn" data-act="move" data-id="motel">Get a motel room: ${money(D.HOUSING.motel.rent * 4)}</button>` : '';
    return `
      ${place(h.name, hubLine(cheapest))}
      <div class="tiles">
        ${tiles.map(([act, name, sub, dim]) => `
          <button class="tile ${dim ? 'dim' : ''}" data-act="${act}">
            <span class="tile-name">${name}</span><span class="tile-sub">${sub}</span>
          </button>`).join('')}
      </div>
      <div class="row">${rentBtn}${moveBack}</div>`;
  }

  function hubLine(cheapest) {
    if (G.cash < 20 && G.debt.amount > 0) return 'Your wallet is thin and Mr. Black is patient only on paper.';
    if (cheapest && G.cash >= cheapest.buyIn && G.cash < cheapest.buyIn * 1.5) return `${money(G.cash)}. Enough for one buy-in. Barely.`;
    if (L.isNight(G.clock)) return 'The city is awake in the wrong way.';
    if (G.clock % 1440 < 12 * 60) return 'Neon off, headache on. Another day.';
    return 'Rain on the window. The tables open soon.';
  }

  function screenCasino() {
    const rows = D.VENUES.map((v) => {
      const st = L.venueStatus(G, v);
      const need = L.effectiveRepNeeded(G, v);
      return `
        <div class="venue ${st.ok ? '' : 'locked'} t${v.tier}">
          <div class="venue-main">
            <h3>${esc(v.name)}</h3>
            <p>${esc(v.blurb)}</p>
            <p class="meta">Buy-in <b>${money(v.buyIn)}</b> · ante ${money(v.ante)} · bets ${money(v.bets[0])}/${money(v.bets[1])} · ${L.fmtClock(v.open)}–${L.fmtClock(v.close)}${need ? ` · rep ${need}` : ''}</p>
          </div>
          ${st.ok ? `<button class="btn primary" data-act="enter" data-id="${v.id}">Buy in</button>` : `<span class="lock">${esc(st.reason)}</span>`}
        </div>`;
    }).join('');
    return `${place('Tonight', `You have ${money(G.cash)}. The cheapest seat costs ${money(D.VENUES[0].buyIn)}.`)}
      <div class="venues">${rows}</div>
      <div class="row"><button class="btn ghost" data-act="hub">Back</button></div>`;
  }

  function cardHTML(c, opts = {}) {
    if (!c || opts.back) return `<div class="card back ${opts.cls || ''}"><span></span></div>`;
    const r = C.rankLabel(c.r);
    return `<button class="card ${C.isRed(c) ? 'red' : ''} ${opts.cls || ''}" ${opts.act ? `data-act="${opts.act}" data-i="${opts.i}"` : 'tabindex="-1"'} aria-label="${r}${c.s}">
      <span class="c-r">${r}</span><span class="c-s">${c.s}</span><span class="c-big">${c.s}</span></button>`;
  }

  function screenTable() {
    const S = G.session;
    const v = P.venueOf(S.venueId);
    const H = S.hand;
    const npc = S.npc ? D.NPCS[S.npc.id] : null;
    const rec = S.npc ? G.npcs[S.npc.id] : null;
    const done = !H || H.phase === 'done';
    const showdown = H && H.result && H.result.reason === 'showdown';

    const opp = npc ? `
      <div class="opp">
        <div><h3>${esc(npc.name)}${S.npc.tilt > 0.4 ? ' <em class="tilt">TILT</em>' : ''}</h3><p>${esc(npc.tag)}</p></div>
        <div class="opp-num"><b>${money(S.npc.stack)}</b><small>vs you ${rec.lost}–${rec.won}</small></div>
      </div>` : `<div class="opp empty"><h3>Empty seat</h3><p>Wait for someone to sit down, or cash out.</p></div>`;

    const oppCards = H && S.npc ? H.n.map((c, i) => cardHTML(c, {
      back: !(showdown || (i === H.marked && !done)),
      cls: i === H.marked && !showdown ? 'marked' : '',
    })).join('') : '';

    const drawing = H && H.phase === 'draw';
    const myCards = H ? H.p.map((c, i) => cardHTML(c, {
      act: drawing ? 'pick' : null, i,
      cls: [H.selected.includes(i) ? 'sel' : '', H.fresh && H.fresh.includes(i) && !done ? 'fresh' : '', done && H.result && H.result.winner === 'p' ? 'win' : ''].join(' '),
    })).join('') : '<p class="muted">Cards are dealt when you ante up.</p>';

    const ev = H ? (L.has(G, 'black_joker') ? C.evaluateWild(H.p) : C.evaluate(H.p)) : null;
    const phaseLabel = !H ? 'Waiting' : { bet1: 'First betting round', draw: 'Draw: pick up to 3 cards to throw away', bet2: 'Final betting round', done: 'Hand over' }[H.phase];

    let result = '';
    if (done && H && H.result) {
      const r = H.result;
      const cls = r.winner === 'p' ? 'good' : r.winner === 'n' ? 'bad' : '';
      const head = r.winner === 'p' ? `You win ${money(r.pot + r.bonus)}` : r.winner === 'n' ? `${npc ? esc(npc.name) : 'They'} ${r.reason === 'fold' ? 'takes it' : 'wins'}` : 'Split pot';
      const detail = r.reason === 'showdown' ? `${C.describe(r.pEv)} vs ${C.describe(r.nEv)}` : (r.winner === 'p' ? 'They folded.' : 'You folded.');
      result = `<div class="result ${cls}"><b>${head}</b><span>${detail}</span>${r.notes.map((n) => `<span class="note">${esc(n)}</span>`).join('')}</div>`;
    }

    const tell = H && H.tell && !done ? `<p class="tell">${esc(H.tell)}</p>` : '';
    const pnl = S.stack - S.invested + (H && !done ? H.contrib.p : 0);

    return `
      ${place(v.name, `Ante ${money(v.ante)} · bets ${money(v.bets[0])}/${money(v.bets[1])} · closes ${L.fmtClock(v.close)}`)}
      <div class="felt">
        ${opp}
        <div class="hand opp-hand">${oppCards}</div>
        ${tell}
        <div class="pot"><span>${phaseLabel}</span><b>${H ? 'Pot ' + money(H.pot) : ''}</b></div>
        ${result}
        <div class="hand my-hand">${myCards}</div>
        <div class="me">
          <span>${ev ? `You hold <b>${C.describe(ev)}</b>` : '&nbsp;'}</span>
          <span>Stack <b>${money(S.stack)}</b> · session <b class="${pnl >= 0 ? 'good' : 'bad'}">${pnl >= 0 ? '+' : '-'}${money(Math.abs(pnl))}</b></span>
        </div>
        <div class="actions">${tableActions()}</div>
      </div>
      <ol class="tlog">${S.log.slice(-7).map((l) => `<li class="${l.tone}">${esc(l.text)}</li>`).join('')}</ol>`;
  }

  function tableActions() {
    const S = G.session;
    const v = P.venueOf(S.venueId);
    const H = S.hand;
    if (!H || H.phase === 'done') {
      if (!S.npc) return `<button class="btn primary" data-act="wait">Wait for a player (20 min)</button><button class="btn" data-act="cashout">Cash out ${money(S.stack)}</button>`;
      if (S.stack < v.ante) {
        const left = G.cash - v.buyIn;
        return G.cash >= v.buyIn
          ? `<button class="btn danger" data-act="rebuy">Rebuy ${money(v.buyIn)} <small>leaves you ${money(left)}</small></button><button class="btn" data-act="cashout">Walk away</button>`
          : `<button class="btn" data-act="cashout">Walk away with nothing</button>`;
      }
      return `<button class="btn primary" data-act="deal">${H ? 'One more hand' : 'Deal'} <small>ante ${money(v.ante)}</small></button><button class="btn" data-act="cashout">Cash out ${money(S.stack)}</button>`;
    }
    if (H.phase === 'draw') {
      const n = H.selected.length;
      const sleeve = L.has(G, 'ace_sleeve') && !S.sleeveUsed && n === 1
        ? `<button class="btn illegal" data-act="sleeve">Ace up the sleeve</button>` : '';
      return `<button class="btn primary" data-act="draw">${n ? `Draw ${n}` : 'Stand pat'}</button>${sleeve}`;
    }
    const o = P.options(G);
    if (!o) return `<p class="muted thinking">${esc(D.NPCS[S.npc.id].name)} is thinking…</p>`;
    if (!o.facing) {
      return `<button class="btn" data-act="check">Check</button>${o.canRaise ? `<button class="btn primary" data-act="bet">Bet ${money(o.raiseAmt)}</button>` : ''}`;
    }
    return `<button class="btn ghost" data-act="fold">Fold</button><button class="btn primary" data-act="call">Call ${money(o.callAmt)}</button>${o.canRaise ? `<button class="btn danger" data-act="raise">Raise ${money(o.raiseAmt)}</button>` : ''}`;
  }

  function itemLine(it, actions) {
    const d = D.ITEMS[it.id];
    return `<li class="item r-${d.rarity}"><div><b>${esc(d.name)}</b> <em>${d.slot} · ${d.rarity}</em><p>${esc(d.desc)}</p></div><div class="item-act">${actions}</div></li>`;
  }

  function screenPawn() {
    const stock = G.stock.length ? G.stock.map((s, i) => itemLine({ id: s.id }, `<button class="btn" data-act="buy" data-i="${i}">${money(s.price)}</button>`)).join('') : '<li class="muted">Sal shrugs. "Come back tomorrow."</li>';
    const mine = G.items.map((it) => itemLine(it, `<button class="btn ghost" data-act="sell" data-uid="${it.uid}">Sell ${money(L.pawnValue(it.id))}</button>`)).join('') || '<li class="muted">You have nothing Sal wants.</li>';
    return `${place("Sal's Pawn & Curio", '"Everything in here was somebody\'s lucky charm once."')}
      <h4>In the case</h4><ul class="items">${stock}</ul>
      <h4>Your things</h4><ul class="items">${mine}</ul>
      <div class="row"><button class="btn ghost" data-act="hub">Back</button></div>`;
  }

  function screenBlack() {
    const lim = L.loanLimit(G);
    const room = lim - G.debt.amount;
    const offers = [200, 500, 1000, 2000, 5000, 20000].filter((a) => a <= room);
    const pay = [50, 100, 500, 2000].filter((a) => a < G.debt.amount && a <= G.cash);
    return `${place('Mr. Black', '"Twenty percent. Five days. I don\'t chase people. Other people do."')}
      <div class="ledger">
        <p>You owe <b>${money(G.debt.amount)}</b>${G.debt.amount ? `, due by the end of day <b>${G.debt.due}</b>` : ''}.</p>
        <p class="muted">Credit line for someone of your reputation: ${money(lim)}. Miss the date and his men visit. The debt grows 10% each time.</p>
      </div>
      <h4>Borrow</h4>
      <div class="row">${offers.map((a) => `<button class="btn danger" data-act="borrow" data-amt="${a}">${money(a)} <small>owe ${money(Math.round(a * 1.2))}</small></button>`).join('') || '<span class="muted">He won\'t lend you more.</span>'}</div>
      ${G.debt.amount ? `<h4>Pay back</h4><div class="row">${pay.map((a) => `<button class="btn" data-act="repay" data-amt="${a}">${money(a)}</button>`).join('')}<button class="btn primary" data-act="repay" data-amt="${G.debt.amount}" ${G.cash <= 0 ? 'disabled' : ''}>All I can: ${money(Math.min(G.cash, G.debt.amount))}</button></div>` : ''}
      <div class="row"><button class="btn ghost" data-act="hub">Back</button></div>`;
  }

  function screenStuff() {
    const slots = D.SLOTS.map((s) => {
      const it = G.equipped[s] ? L.itemByUid(G, G.equipped[s]) : null;
      const d = it ? D.ITEMS[it.id] : null;
      return `<div class="slot ${d ? 'r-' + d.rarity : 'empty'}"><span>${s}</span>${d ? `<b>${esc(d.name)}</b><small>${esc(d.desc)}</small><button class="btn ghost" data-act="unequip" data-slot="${s}">Take off</button>` : '<b>—</b>'}</div>`;
    }).join('');
    const bag = L.stored(G).map((it) => itemLine(it, `<button class="btn" data-act="equip" data-uid="${it.uid}">Wear</button>`)).join('') || '<li class="muted">Nothing in storage.</li>';
    const homes = D.HOUSING_ORDER.filter((id) => id !== G.housing).map((id) => {
      const h = D.HOUSING[id];
      return `<li class="home-opt"><div><b>${h.name}</b><p>${money(h.rent)}/day${h.deposit ? ` · deposit ${money(h.deposit)}` : ''}${h.perk ? ' · ' + h.perk : ''}</p></div><button class="btn" data-act="move" data-id="${id}">${money(h.deposit + h.rent * 4)}</button></li>`;
    }).join('');
    const people = Object.entries(G.npcs).map(([id, r]) => `<li><b>${esc(D.NPCS[id].name)}</b> <span class="muted">${esc(D.NPCS[id].tag)}</span> <span>you ${r.lost}–${r.won}</span></li>`).join('') || '<li class="muted">You don\'t know anyone at the tables yet.</li>';
    const st = G.stats;
    return `${place('Your stuff', `Storage ${L.stored(G).length}/${L.storageCap(G)} · ${D.HOUSING[G.housing].name}`)}
      <div class="slots">${slots}</div>
      <h4>In storage</h4><ul class="items">${bag}</ul>
      <h4>Somewhere else to live</h4><ul class="items">${homes}</ul>
      <h4>Faces at the tables</h4><ul class="people">${people}</ul>
      <p class="muted stats">Hands ${st.hands} · won ${st.won} · biggest pot ${money(st.biggestPot)} · best bankroll ${money(st.peakCash)} · busted ${st.busts}×${G.flags.zeroWins ? ` · Zero ${G.flags.zeroWins}/5` : ''}</p>
      <div class="row"><button class="btn ghost" data-act="hub">Back</button><button class="btn ghost" data-act="new">Start over</button></div>`;
  }

  // ---------- modal ----------
  function modal(title, lines, tone = '') {
    G.modal = { title, lines: [].concat(lines).filter(Boolean), tone };
  }
  function modalHTML() {
    if (!G.modal) return '';
    const m = G.modal;
    return `<div class="modal-bg"><div class="modal ${m.tone}" role="dialog" aria-modal="true">
      <h3>${esc(m.title)}</h3>${m.lines.map((l) => `<p>${esc(l)}</p>`).join('')}
      ${m.confirm ? `<div class="row"><button class="btn primary" data-act="${m.confirm.act}" data-id="${m.confirm.id || ''}">${esc(m.confirm.label)}</button><button class="btn ghost" data-act="close">${esc(m.confirm.cancel)}</button></div>`
        : '<div class="row"><button class="btn primary" data-act="close">OK</button></div>'}
    </div></div>`;
  }

  // ---------- render ----------
  function sceneFor() {
    const s = G.screen;
    if (s === 'intro') return { name: 'motel' };
    if (s === 'hub' || s === 'stuff') return { name: D.HOUSING[G.housing].scene };
    if (s === 'casino') return { name: 'city' };
    if (s === 'table') {
      const S = G.session;
      const v = P.venueOf(S.venueId);
      const hats = { vinny: '#222', eleanor: '#6b4b6b', duchess: '#3a2340', mr_black: '#050505', zero: '#000', big_k: '#8a3a2a', father_mike: '#111' };
      const cols = { vinny: '#6b2b2b', eleanor: '#9a8a9a', duchess: '#4b2a5a', mr_black: '#0a0a0a', zero: '#050505', big_k: '#3d5a3a', lenny: '#5a5040', dottie: '#8a6a7a', father_mike: '#151515', mr_lee: '#2a3a4a' };
      return { name: 'casino', tier: v.tier, npc: !!S.npc, npcColor: S.npc && cols[S.npc.id], npcHat: S.npc && hats[S.npc.id], pot: S.hand && S.hand.phase !== 'done' ? S.hand.pot : 0 };
    }
    if (s === 'pawn') return { name: 'pawn' };
    if (s === 'black') return { name: 'office' };
    if (s === 'work') return { name: 'gas' };
    if (s === 'diner') return { name: 'diner' };
    return { name: 'motel' };
  }

  const SCREENS = { intro: screenIntro, hub: screenHub, casino: screenCasino, table: screenTable, pawn: screenPawn, black: screenBlack, stuff: screenStuff };

  function render() {
    const intro = G.screen === 'intro';
    document.body.classList.toggle('is-intro', intro);
    $('#hud').innerHTML = intro ? '' : hud();
    $('#panel').innerHTML = (SCREENS[G.screen] || screenHub)();
    $('#log').innerHTML = intro ? '' : G.log.slice(-14).reverse().map((l) => `<li class="${l.tone}"><time>D${l.day} ${l.t}</time>${esc(l.text)}</li>`).join('');
    $('#modal').innerHTML = modalHTML();
    LC.scene.set(Object.assign({ clock: G.clock, tier: 0, npc: false, pot: 0 }, sceneFor()));
    L.save(G);
    scheduleNpc();
    const focus = document.querySelector('#modal .btn.primary');
    if (focus) focus.focus();
  }

  function scheduleNpc() {
    const S = G.session;
    if (npcTimer || !S || !S.hand || S.hand.phase === 'done') return;
    if (!['bet1', 'bet2'].includes(S.hand.phase) || S.hand.round.toAct !== 'n') return;
    npcTimer = setTimeout(() => {
      npcTimer = null;
      if (G.session && G.session.hand) P.npcTurn(G);
      render();
    }, 700);
  }

  // ---------- actions ----------
  function afterHubAction() {
    if (!G.session && G.clock > L.PASS_OUT) {
      const s = L.sleep(G, true);
      morningModal(s);
    }
  }

  function morningModal(s) {
    const diff = s.cashEnd - s.cashStart;
    modal(`Day ${G.day}`, [
      `Yesterday: ${money(s.cashStart)} → ${money(s.cashEnd)} (${diff >= 0 ? '+' : '-'}${money(Math.abs(diff))}).`,
      ...s.lines,
      `You have ${money(G.cash)}. ${G.housing !== 'street' ? `Rent of ${money(L.rentAmount(G))} due day ${G.rentDue}.` : ''}`,
    ], diff >= 0 ? '' : 'sad');
  }

  function fail(r) { if (r && r.msg) modal('Not now', r.msg); }

  const handlers = {
    'intro-work'() {
      G.screen = 'hub';
      const r = L.work(G);
      if (r.ok) modal('First shift', r.lines.concat([`You have ${money(G.cash)}. The evening is yours.`]));
    },
    'intro-casino'() {
      G.clock = 18 * 60;
      G.screen = 'casino';
      L.log(G, 'You kill the day walking in the rain. By evening the neon comes on.', 'plain');
    },
    hub() { G.screen = 'hub'; },
    close() { G.modal = null; },
    work() {
      const r = L.work(G);
      if (!r.ok) return fail(r);
      modal('Gas-N-Go', r.lines.concat([`Clocked out at ${L.fmtClock(G.clock)}. ${money(G.cash)} in your pocket.`]));
      afterHubAction();
    },
    eat() {
      const r = L.eat(G);
      if (!r.ok) return fail(r);
      modal("Rosie's", r.lines);
      afterHubAction();
    },
    casino() { G.screen = 'casino'; },
    pawn() {
      const m = G.clock % 1440;
      if (!(m >= 9 * 60 && m < 21 * 60 && G.clock < 1440)) return fail({ msg: "Sal's is open 09:00–21:00." });
      G.clock += L.TRAVEL;
      G.screen = 'pawn';
    },
    black() { G.clock += L.TRAVEL; G.screen = 'black'; afterHubAction(); },
    stuff() { G.screen = 'stuff'; },
    sleep() {
      const s = L.sleep(G);
      G.screen = 'hub';
      morningModal(s);
    },
    rent() { fail(L.payRent(G)); },
    move(el) {
      const r = L.moveTo(G, el.dataset.id);
      if (!r.ok) return fail(r);
      G.screen = 'hub';
      modal('New address', `You move into the ${D.HOUSING[el.dataset.id].name}.`);
    },
    enter(el) {
      const v = P.venueOf(el.dataset.id);
      G.modal = {
        title: `Buy-in ${money(v.buyIn)}`,
        lines: [`${v.name}. You have ${money(G.cash)}.`, `Sit down and you'll have ${money(G.cash - v.buyIn)} left outside the table.`],
        confirm: { act: 'sit', id: v.id, label: 'Sit down', cancel: 'Walk away' },
      };
    },
    sit(el) {
      G.modal = null;
      P.startSession(G, el.dataset.id);
      G.screen = 'table';
    },
    deal() {
      const r = P.startHand(G);
      if (r.closing) return leaveTable('closing');
      if (r.caught) return caughtModal(r);
      fail(r);
    },
    pick(el) {
      const H = G.session.hand;
      const i = +el.dataset.i;
      if (H.selected.includes(i)) H.selected = H.selected.filter((x) => x !== i);
      else if (H.selected.length < P.MAX_DISCARD) H.selected.push(i);
    },
    draw() { P.drawPlayer(G, G.session.hand.selected); },
    sleeve() {
      const r = P.useSleeve(G, G.session.hand.selected[0]);
      if (r.caught) return caughtModal(r);
      fail(r);
    },
    check() { P.act(G, 'p', 'check'); },
    bet() { P.act(G, 'p', 'bet'); },
    call() { P.act(G, 'p', 'call'); },
    raise() { P.act(G, 'p', 'raise'); },
    fold() { P.act(G, 'p', 'fold'); },
    rebuy() { fail(P.rebuy(G)); },
    wait() {
      const v = P.venueOf(G.session.venueId);
      if (G.clock + 20 >= v.close) return leaveTable('closing');
      P.waitForPlayer(G);
    },
    cashout() { leaveTable('cashout'); },
    buy(el) { fail(L.buy(G, +el.dataset.i)); },
    sell(el) { fail(L.sell(G, +el.dataset.uid)); },
    equip(el) { L.equip(G, +el.dataset.uid); },
    unequip(el) { L.unequip(G, el.dataset.slot); },
    borrow(el) { fail(L.borrow(G, +el.dataset.amt)); },
    repay(el) { fail(L.repay(G, +el.dataset.amt)); },
    new() {
      G.modal = { title: 'Start over?', lines: ['Your money, debts and items are gone. Day 1 again.'], confirm: { act: 'wipe', label: 'Start over', cancel: 'Keep playing' } };
    },
    wipe() { L.wipe(); G = L.newGame(); },
  };

  function leaveTable(reason) {
    const r = P.cashOut(G, reason);
    G.screen = 'hub';
    const lines = [r.text, `You have ${money(G.cash)}.`];
    if (r.pnl < 0 && G.cash < 60) lines.push('The walk home is long and it is raining.');
    modal(r.pnl >= 0 ? 'Cashed out' : 'Walking home', lines, r.pnl >= 0 ? '' : 'sad');
    afterHubAction();
  }

  function caughtModal(r) {
    G.screen = 'hub';
    modal('Security', r.text, 'sad');
    afterHubAction();
  }

  function onClick(e) {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = handlers[el.dataset.act];
    if (!fn) return;
    fn(el);
    render();
  }

  function start() {
    G = L.load() || L.newGame();
    if (G.screen !== 'intro' && !G.modal) G.screen = G.session ? 'table' : G.screen;
    if (G.day === 1 && !G.log.some((l) => l.text.startsWith('Day shift') || l.text.startsWith('Bought in'))) G.screen = 'intro';
    LC.scene.init($('#scene'));
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && G.modal && !G.modal.confirm) { G.modal = null; render(); }
    });
    render();
  }

  LC.ui = { start };
})(window.LC = window.LC || {});
