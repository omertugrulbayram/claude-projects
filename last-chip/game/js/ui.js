// Ekranlar ve girdi. Her ekranda tek bir ana karar var.
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

  // ---------- üst bar ----------
  function topbar() {
    const max = L.maxEnergy(G);
    const pct = Math.max(0, Math.min(100, Math.round((G.energy / max) * 100)));
    const bills = L.nextBill(G).map((b) => {
      const late = G.day >= b.day;
      return `<span class="${late ? 'bad' : ''}">${b.what} ${money(b.amt)} · ${late ? 'bugün!' : b.day + '. gün'}</span>`;
    }).join('');
    return `
      <div class="stat"><span>Gün ${G.day}</span><b>${G.phase === 'day' ? 'Gündüz' : 'Akşam'}</b></div>
      <div class="stat"><span>Para</span><b class="cash">${money(G.cash)}</b></div>
      <div class="stat energy"><span>Enerji ${G.energy}</span><div class="bar"><div style="width:${pct}%" class="${pct < 25 ? 'low' : ''}"></div></div></div>
      <div class="bills">${bills || '<span>Borcun yok.</span>'}</div>`;
  }

  // ---------- ekranlar ----------
  function screenIntro() {
    return `
      <div class="intro">
        <h1 class="logo">LAST<span>CHIP</span></h1>
        <p class="intro-lines">Cebinde <b>$63</b> var.<br>Kira 4 gün sonra.<br>Mr. Black'e <b>$400</b> borçlusun.</p>
        <p class="muted">Gündüz çalış, akşam poker oyna. Para kazan, borcunu öde, şehrin en iyi masalarına çık.</p>
        <button class="btn primary big" data-act="start">Başla</button>
      </div>`;
  }

  function screenHub() {
    const day = G.phase === 'day';
    const home = D.HOUSING[G.housing];
    const main = day
      ? `<button class="choice primary" data-act="work"><b>İşe git</b><span>+${money(L.wage(G))} · ${D.JOB.energy} enerji</span></button>
         <button class="choice" data-act="rest"><b>Dinlen</b><span>+20 enerji</span></button>`
      : `<button class="choice primary" data-act="casino"><b>Casino'ya git</b><span>${cheapestLine()}</span></button>
         <button class="choice" data-act="sleep"><b>Uyu</b><span>Gün ${G.day + 1}'e geç</span></button>`;
    return `
      <header class="place"><h2>${day ? 'Günaydın.' : 'Akşam oldu.'}</h2><p>${esc(home.name)}</p></header>
      <div class="choices">${main}</div>
      <nav class="links">
        <button class="link" data-act="shop">Dükkan <small>${G.items.length}/${D.MAX_ITEMS} eşya</small></button>
        <button class="link" data-act="black">Mr. Black <small>${G.debt.amount ? 'borç ' + money(G.debt.amount) : 'borç al'}</small></button>
        <button class="link" data-act="home">Ev <small>${esc(home.name)}</small></button>
      </nav>`;
  }

  function cheapestLine() {
    const v = D.VENUES.find((x) => L.venueStatus(G, x).ok);
    return v ? `Masa ${money(v.buyIn)}'dan başlıyor` : `En ucuz masa ${money(D.VENUES[0].buyIn)}`;
  }

  function screenCasino() {
    const rows = D.VENUES.map((v) => {
      const st = L.venueStatus(G, v);
      return `
        <div class="venue ${st.ok ? '' : 'locked'}">
          <div><h3>${esc(v.name)}</h3><p>${esc(v.blurb)}</p></div>
          ${st.ok
            ? `<button class="btn primary" data-act="enter" data-id="${v.id}">Otur · ${money(v.buyIn)}</button>`
            : `<span class="lock">${money(v.buyIn)} · ${esc(st.reason)}</span>`}
        </div>`;
    }).join('');
    return `<header class="place"><h2>Hangi masa?</h2><p>Cebinde ${money(G.cash)} var.</p></header>
      <div class="venues">${rows}</div>
      <button class="btn ghost" data-act="hub">Geri</button>`;
  }

  function cardHTML(c, opts = {}) {
    if (!c || opts.back) return `<div class="card back"><span></span></div>`;
    const r = C.rankLabel(c.r);
    const tag = opts.act ? `button data-act="${opts.act}" data-i="${opts.i}"` : 'div';
    return `<${tag} class="card ${C.isRed(c) ? 'red' : ''} ${opts.cls || ''}" aria-label="${r}${c.s}">
      <span class="c-r">${r}</span><span class="c-s">${c.s}</span><span class="c-big">${c.s}</span></${tag.split(' ')[0]}>`;
  }

  function screenTable() {
    const S = G.session;
    const v = P.venueOf(S.venueId);
    const H = S.hand;
    const npc = S.npc ? D.NPCS[S.npc.id] : null;
    const done = !H || H.phase === 'done';
    const showdown = H && H.result && H.result.reason === 'showdown';
    const drawing = H && H.phase === 'draw';

    const oppCards = H && S.npc
      ? H.n.map((c, i) => cardHTML(c, { back: !(showdown || (i === H.marked && !done)) })).join('')
      : '';
    const myCards = H
      ? H.p.map((c, i) => cardHTML(c, {
        act: drawing ? 'pick' : null, i,
        cls: [H.selected.includes(i) ? 'sel' : '', done && H.result.winner === 'p' ? 'win' : ''].join(' '),
      })).join('')
      : '';
    const ev = H ? (L.has(G, 'black_joker') ? C.evaluateWild(H.p) : C.evaluate(H.p)) : null;

    // Ortadaki tek mesaj: ne oldu ya da ne yapmalısın.
    let msg;
    if (!H) msg = npc ? `${npc.name} karşında. ${npc.tag}` : 'Masa boş.';
    else if (done) {
      const r = H.result;
      msg = r.winner === 'p' ? `<b class="good">Kazandın! +${money(r.pot + r.bonus)}</b>`
        : r.winner === 'n' ? `<b class="bad">${esc(npc ? npc.name : 'Rakip')} kazandı.</b>` : '<b>Berabere.</b>';
      if (r.reason === 'showdown') msg += `<small>${C.describe(r.pEv)} vs ${C.describe(r.nEv)}</small>`;
      else msg += `<small>${r.winner === 'p' ? 'Rakip çekildi.' : 'Sen çekildin.'}</small>`;
      r.notes.forEach((n) => { msg += `<small class="note">${esc(n)}</small>`; });
    } else if (drawing) msg = 'Değiştireceğin kartlara dokun (en fazla 3).';
    else {
      const last = S.log[S.log.length - 1];
      msg = last ? esc(last.text) : '';
      if (H.tell) msg += `<small class="note">${esc(H.tell)}</small>`;
    }

    return `
      <div class="felt">
        <div class="seat">
          <span>${npc ? esc(npc.name) : 'Boş sandalye'}${S.npc && S.npc.tilt > 0.4 ? ' <em class="tilt">TILT</em>' : ''}</span>
          <span>${npc ? money(S.npc.stack) : ''}</span>
        </div>
        <div class="hand opp">${oppCards}</div>
        <div class="center">
          ${H ? `<div class="pot">Pot ${money(H.pot)}</div>` : ''}
          <p class="msg">${msg}</p>
        </div>
        <div class="hand mine">${myCards}</div>
        <div class="seat me">
          <span>${ev ? `Elin: <b>${C.describe(ev)}</b>` : v.name}</span>
          <span>Fişlerin <b>${money(S.stack)}</b></span>
        </div>
      </div>
      <div class="actions">${tableActions()}</div>
      <button class="link help" data-act="ranks">El sıralaması</button>`;
  }

  function tableActions() {
    const S = G.session;
    const v = P.venueOf(S.venueId);
    const H = S.hand;
    if (!H || H.phase === 'done') {
      if (!S.npc) return `<button class="btn primary" data-act="wait">Yeni rakip bekle</button><button class="btn" data-act="cashout">Kalk · ${money(S.stack)} al</button>`;
      if (S.stack < v.ante) {
        return G.cash >= v.buyIn
          ? `<button class="btn danger" data-act="rebuy">Tekrar gir · ${money(v.buyIn)}<small>cebinde ${money(G.cash - v.buyIn)} kalır</small></button><button class="btn" data-act="cashout">Kalk</button>`
          : `<button class="btn primary" data-act="cashout">Kalk</button>`;
      }
      return `<button class="btn primary" data-act="deal">${H ? 'Bir el daha' : 'Kartları dağıt'}</button><button class="btn" data-act="cashout">Kalk · ${money(S.stack)} al</button>`;
    }
    if (H.phase === 'draw') {
      const n = H.selected.length;
      return `<button class="btn primary" data-act="draw">${n ? `${n} kart değiştir` : 'Değiştirmeden devam'}</button>`;
    }
    const o = P.options(G);
    if (!o) return `<p class="muted">${esc(D.NPCS[S.npc.id].name)} düşünüyor…</p>`;
    if (!o.facing) {
      return `<button class="btn" data-act="check">Pas</button>${o.canRaise ? `<button class="btn primary" data-act="bet">Bahis · ${money(o.raiseAmt)}</button>` : ''}`;
    }
    return `<button class="btn ghost" data-act="fold">Çekil</button><button class="btn primary" data-act="call">Gör · ${money(o.callAmt)}</button>${o.canRaise ? `<button class="btn danger" data-act="raise">Artır · ${money(o.raiseAmt)}</button>` : ''}`;
  }

  function itemRow(id, action) {
    const d = D.ITEMS[id];
    return `<li class="item"><div><b class="r-${d.rarity}">${esc(d.name)}</b><p>${esc(d.desc)}</p></div>${action}</li>`;
  }

  function screenShop() {
    const mine = G.items.map((it) => itemRow(it.id, `<button class="btn ghost" data-act="sell" data-uid="${it.uid}">Sat · ${money(L.pawnValue(it.id))}</button>`)).join('')
      || '<li class="muted">Hiç eşyan yok.</li>';
    const stock = G.stock.map((s, i) => itemRow(s.id, `<button class="btn" data-act="buy" data-i="${i}">${money(s.price)}</button>`)).join('')
      || '<li class="muted">Vitrin boş. Yarın gel.</li>';
    return `<header class="place"><h2>Sal'ın Dükkanı</h2><p>Şans eşyaları masada işe yarar. En fazla ${D.MAX_ITEMS} tane taşıyabilirsin.</p></header>
      <h4>Üstündekiler (${G.items.length}/${D.MAX_ITEMS})</h4><ul class="items">${mine}</ul>
      <h4>Vitrin</h4><ul class="items">${stock}</ul>
      <button class="btn ghost" data-act="hub">Geri</button>`;
  }

  function screenBlack() {
    const room = L.loanLimit(G) - G.debt.amount;
    const offers = [200, 500, 1000, 2000, 5000].filter((a) => a <= room);
    return `<header class="place"><h2>Mr. Black</h2><p>"Yüzde yirmi. Beş gün. Ben kimsenin peşinden koşmam. Başkaları koşar."</p></header>
      <p>${G.debt.amount ? `Borcun: <b>${money(G.debt.amount)}</b> · son gün <b>${G.debt.due}</b>` : 'Borcun yok.'}</p>
      ${G.debt.amount ? `<button class="btn primary" data-act="repay" ${G.cash <= 0 ? 'disabled' : ''}>Öde · ${money(Math.min(G.cash, G.debt.amount))}</button>` : ''}
      <h4>Borç al</h4>
      <div class="row">${offers.map((a) => `<button class="btn danger" data-act="borrow" data-amt="${a}">${money(a)}<small>${money(Math.round(a * 1.2))} ödersin</small></button>`).join('') || '<span class="muted">Sana daha fazla vermez.</span>'}</div>
      <p class="muted">Geç ödersen adamları gelir: bir eşyanı ya da paranın yarısını alırlar.</p>
      <button class="btn ghost" data-act="hub">Geri</button>`;
  }

  function screenHome() {
    const h = D.HOUSING[G.housing];
    const cur = D.HOUSING_ORDER.indexOf(G.housing); // sokak: -1
    const upgrades = D.HOUSING_ORDER.filter((id, i) => i > cur).map((id) => {
      const x = D.HOUSING[id];
      return `<li class="item"><div><b>${x.name}</b><p>Günlük ${money(x.rent)}${x.perk ? ' · ' + x.perk : ''}</p></div><button class="btn" data-act="move" data-id="${id}">${money(x.deposit + x.rent * 4)}</button></li>`;
    }).join('');
    return `<header class="place"><h2>${esc(h.name)}</h2><p>${G.housing === 'street' ? 'Kira yok. Uyku da yok.' : `Kira: 4 günde ${money(L.rentAmount(G))} · sıradaki ${G.rentDue}. gün`}</p></header>
      ${G.housing !== 'street' ? `<button class="btn" data-act="rent">Kirayı şimdi öde · ${money(L.rentAmount(G))}</button>` : ''}
      <h4>Taşın</h4><ul class="items">${upgrades}</ul>
      <p class="muted">İtibar ${Math.floor(G.rep)} · Oynanan el ${G.stats.hands} · En büyük pot ${money(G.stats.biggestPot)}</p>
      <div class="row"><button class="btn ghost" data-act="hub">Geri</button><button class="btn ghost" data-act="new">Baştan başla</button></div>`;
  }

  // ---------- modal ----------
  function modal(title, lines, tone = '') { G.modal = { title, lines: [].concat(lines).filter(Boolean), tone }; }
  function modalHTML() {
    if (!G.modal) return '';
    const m = G.modal;
    const buttons = m.confirm
      ? `<button class="btn primary" data-act="${m.confirm.act}" data-id="${m.confirm.id || ''}">${esc(m.confirm.label)}</button><button class="btn ghost" data-act="close">${esc(m.confirm.cancel)}</button>`
      : '<button class="btn primary" data-act="close">Tamam</button>';
    const body = m.html || m.lines.map((l) => `<p>${esc(l)}</p>`).join('');
    return `<div class="modal-bg"><div class="modal ${m.tone}" role="dialog" aria-modal="true"><h3>${esc(m.title)}</h3>${body}<div class="row">${buttons}</div></div></div>`;
  }

  function ranksHTML() {
    return `<ol class="ranks">${C.CATS.map((c, i) => `<li><b>${c}</b><span>${C.CAT_HINTS[i]}</span></li>`).reverse().join('')}</ol>
      <p class="muted">Üstteki el alttakini yener. Her elde en fazla 3 kart değiştirebilirsin.</p>`;
  }

  // ---------- çizim ----------
  const SCREENS = { intro: screenIntro, hub: screenHub, casino: screenCasino, table: screenTable, shop: screenShop, black: screenBlack, home: screenHome };

  function sceneFor() {
    const clock = G.phase === 'day' ? 12 * 60 : 22 * 60;
    const s = G.screen;
    if (s === 'casino') return { name: 'city', clock: 22 * 60 };
    if (s === 'shop') return { name: 'pawn', clock };
    if (s === 'black') return { name: 'office', clock };
    return { name: D.HOUSING[G.housing].scene, clock };
  }

  function render() {
    const s = G.screen;
    document.body.dataset.screen = s;
    $('#top').innerHTML = s === 'intro' ? '' : topbar();
    $('#panel').innerHTML = (SCREENS[s] || screenHub)();
    $('#modal').innerHTML = modalHTML();
    if (s !== 'table') LC.scene.set(sceneFor());
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

  // ---------- eylemler ----------
  function show(r, title) {
    if (!r) return;
    if (!r.ok && r.msg) modal('Olmaz', r.msg);
    else if (r.ok && r.msg) modal(title || 'Tamam', r.msg);
  }

  function leaveTable() {
    const r = P.cashOut(G);
    G.screen = 'hub';
    const lines = [r.pnl >= 0 ? `Masadan ${money(r.pnl)} kârla kalktın.` : `Masada ${money(-r.pnl)} kaybettin.`, `Cebinde ${money(G.cash)} var.`];
    modal(r.pnl >= 0 ? 'İyi gece' : 'Kötü gece', lines, r.pnl >= 0 ? '' : 'sad');
  }

  const handlers = {
    start() { G.screen = 'hub'; },
    hub() { G.screen = 'hub'; },
    close() { G.modal = null; },
    work() {
      const r = L.work(G);
      if (!r.ok) return show(r);
      modal('İş çıkışı', r.lines.concat([`Cebinde ${money(G.cash)} var. Akşam oldu.`]));
    },
    rest() { const r = L.rest(G); if (r.ok) modal('Dinlendin', r.lines); },
    casino() { G.screen = 'casino'; },
    shop() { G.screen = 'shop'; },
    black() { G.screen = 'black'; },
    home() { G.screen = 'home'; },
    sleep() {
      const s = L.sleep(G);
      G.screen = 'hub';
      const diff = s.cashEnd - s.cashStart;
      modal(`Gün ${G.day}`, [
        `Dün: ${money(s.cashStart)} → ${money(s.cashEnd)} (${diff >= 0 ? '+' : '-'}${money(Math.abs(diff))})`,
        ...s.lines,
      ], diff >= 0 ? '' : 'sad');
    },
    rent() { show(L.payRent(G), 'Kira'); },
    move(el) { const r = L.moveTo(G, el.dataset.id); show(r, 'Yeni ev'); },
    enter(el) {
      const v = P.venueOf(el.dataset.id);
      G.modal = {
        title: `${v.name} · ${money(v.buyIn)}`,
        lines: [`Oturursan cebinde ${money(G.cash - v.buyIn)} kalır.`, `Fişlerin bitince kalkarsın ya da tekrar girersin.`],
        confirm: { act: 'sit', id: v.id, label: 'Otur', cancel: 'Vazgeç' },
      };
    },
    sit(el) { G.modal = null; P.startSession(G, el.dataset.id); G.screen = 'table'; },
    deal() {
      const r = P.startHand(G);
      if (r.caught) { G.screen = 'hub'; return modal('Yakalandın', r.text, 'sad'); }
      if (r.tired) { leaveTable(); return modal('Çok yorgunsun', 'Enerjin bitti. Masadan kalktın, eve dön ve uyu.', 'sad'); }
      show(r);
    },
    pick(el) {
      const H = G.session.hand;
      const i = +el.dataset.i;
      if (H.selected.includes(i)) H.selected = H.selected.filter((x) => x !== i);
      else if (H.selected.length < P.MAX_DISCARD) H.selected.push(i);
    },
    draw() { P.drawPlayer(G, G.session.hand.selected); },
    check() { P.act(G, 'p', 'check'); },
    bet() { P.act(G, 'p', 'bet'); },
    call() { P.act(G, 'p', 'call'); },
    raise() { P.act(G, 'p', 'raise'); },
    fold() { P.act(G, 'p', 'fold'); },
    rebuy() { show(P.rebuy(G)); },
    wait() { P.waitForPlayer(G); },
    cashout() { leaveTable(); },
    ranks() { G.modal = { title: 'El sıralaması', lines: [], html: ranksHTML() }; },
    buy(el) { show(L.buy(G, +el.dataset.i)); },
    sell(el) { show(L.sell(G, +el.dataset.uid)); },
    borrow(el) { show(L.borrow(G, +el.dataset.amt), 'Mr. Black'); },
    repay() { show(L.repay(G, G.debt.amount), 'Mr. Black'); },
    new() { G.modal = { title: 'Baştan başla?', lines: ['Paran, borcun ve eşyaların sıfırlanır.'], confirm: { act: 'wipe', label: 'Baştan başla', cancel: 'Vazgeç' } }; },
    wipe() { L.wipe(); G = L.newGame(); },
  };

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
    LC.scene.init($('#scene'));
    document.addEventListener('click', onClick);
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && G.modal && !G.modal.confirm) { G.modal = null; render(); }
    });
    render();
  }

  LC.ui = { start };
})(window.LC = window.LC || {});
