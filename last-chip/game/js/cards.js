// Deck, five-card hand evaluation and simple hand-strength heuristics.
(function (LC) {
  const SUITS = ['♠', '♥', '♦', '♣'];
  const FACE = { 11: 'J', 12: 'Q', 13: 'K', 14: 'A' };
  const RANK_WORD = { 2: 'Twos', 3: 'Threes', 4: 'Fours', 5: 'Fives', 6: 'Sixes', 7: 'Sevens', 8: 'Eights', 9: 'Nines', 10: 'Tens', 11: 'Jacks', 12: 'Queens', 13: 'Kings', 14: 'Aces' };
  const CATS = ['High Card', 'Pair', 'Two Pair', 'Three of a Kind', 'Straight', 'Flush', 'Full House', 'Four of a Kind', 'Straight Flush'];

  const rankLabel = (r) => FACE[r] || String(r);
  const isRed = (c) => c.s === '♥' || c.s === '♦';
  const same = (a, b) => a.r === b.r && a.s === b.s;

  function newDeck() {
    const d = [];
    for (const s of SUITS) for (let r = 2; r <= 14; r++) d.push({ r, s });
    return d;
  }

  function shuffle(a, rng = Math.random) {
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function evaluate(cards) {
    const rs = cards.map((c) => c.r).sort((a, b) => b - a);
    const counts = {};
    rs.forEach((r) => (counts[r] = (counts[r] || 0) + 1));
    const groups = Object.entries(counts)
      .map(([r, n]) => ({ r: +r, n }))
      .sort((a, b) => b.n - a.n || b.r - a.r);
    const flush = cards.every((c) => c.s === cards[0].s);
    const uniq = [...new Set(rs)];
    let straightHigh = 0;
    if (uniq.length === 5) {
      if (uniq[0] - uniq[4] === 4) straightHigh = uniq[0];
      else if (uniq[0] === 14 && uniq[1] === 5) straightHigh = 5; // wheel
    }
    let cat, tb;
    if (straightHigh && flush) { cat = 8; tb = [straightHigh]; }
    else if (groups[0].n === 4) { cat = 7; tb = [groups[0].r, groups[1].r]; }
    else if (groups[0].n === 3 && groups[1].n === 2) { cat = 6; tb = [groups[0].r, groups[1].r]; }
    else if (flush) { cat = 5; tb = rs; }
    else if (straightHigh) { cat = 4; tb = [straightHigh]; }
    else if (groups[0].n === 3) { cat = 3; tb = groups.map((g) => g.r); }
    else if (groups[0].n === 2 && groups[1].n === 2) { cat = 2; tb = groups.map((g) => g.r); }
    else if (groups[0].n === 2) { cat = 1; tb = groups.map((g) => g.r); }
    else { cat = 0; tb = rs; }
    return { cat, name: CATS[cat], score: [cat, ...tb] };
  }

  function compare(a, b) {
    const n = Math.max(a.score.length, b.score.length);
    for (let i = 0; i < n; i++) {
      const d = (a.score[i] || 0) - (b.score[i] || 0);
      if (d) return d;
    }
    return 0;
  }

  function describe(ev) {
    const t = ev.score[1];
    switch (ev.cat) {
      case 0: return `${rankLabel(t)}-High`;
      case 1: return `Pair of ${RANK_WORD[t]}`;
      case 2: return `${RANK_WORD[t]} & ${RANK_WORD[ev.score[2]]}`;
      case 3: return `Three ${RANK_WORD[t]}`;
      case 4: return `Straight, ${rankLabel(t)}-High`;
      case 5: return `Flush, ${rankLabel(t)}-High`;
      case 6: return `${RANK_WORD[t]} Full of ${RANK_WORD[ev.score[2]]}`;
      case 7: return `Four ${RANK_WORD[t]}`;
      case 8: return t === 14 ? 'Royal Flush' : 'Straight Flush';
    }
    return ev.name;
  }

  // Best hand when the card at one position (the Black Joker's pick) is wild.
  function evaluateWild(cards) {
    let best = evaluate(cards);
    const deck = newDeck();
    for (let i = 0; i < cards.length; i++) {
      for (const c of deck) {
        const trial = cards.slice();
        trial[i] = c;
        const ev = evaluate(trial);
        if (compare(ev, best) > 0) best = ev;
      }
    }
    return best;
  }

  // Four cards of one suit: index of the odd card out, or -1.
  function fourFlushOut(cards) {
    for (const s of SUITS) {
      const idx = cards.map((c, i) => (c.s === s ? -1 : i)).filter((i) => i >= 0);
      if (idx.length === 1) return idx[0];
    }
    return -1;
  }

  // Four consecutive distinct ranks (open-ended or A-low): index of the outlier, or -1.
  function straightDrawOut(cards) {
    for (let out = 0; out < cards.length; out++) {
      const rest = cards.filter((_, i) => i !== out).map((c) => c.r);
      const u = [...new Set(rest)].sort((a, b) => a - b);
      if (u.length !== 4) continue;
      if (u[3] - u[0] === 3 && u[3] !== 14) return out;
      if (u.join(',') === '2,3,4,14' || u.join(',') === '2,3,4,5') return out;
    }
    return -1;
  }

  // Rough 0..1 strength used by the AI. preDraw adds credit for draws.
  function strength(cards, preDraw, wild) {
    const ev = wild ? evaluateWild(cards) : evaluate(cards);
    const base = [0.12, 0.42, 0.66, 0.77, 0.84, 0.88, 0.93, 0.97, 0.995][ev.cat];
    let s = base;
    if (ev.cat <= 1) s += ((ev.score[1] - 2) / 12) * (ev.cat === 0 ? 0.18 : 0.16);
    if (ev.cat === 2) s += ((ev.score[1] - 3) / 11) * 0.06;
    if (preDraw && ev.cat < 4) {
      if (fourFlushOut(cards) >= 0) s = Math.max(s, 0.5);
      else if (straightDrawOut(cards) >= 0) s = Math.max(s, 0.45);
    }
    return Math.min(0.999, s);
  }

  // Standard draw: which indices to throw away (at most maxDiscard).
  function chooseDiscards(cards, maxDiscard = 3) {
    const ev = evaluate(cards);
    const byRank = {};
    cards.forEach((c) => (byRank[c.r] = (byRank[c.r] || 0) + 1));
    let out;
    if (ev.cat >= 4 && ev.cat !== 7) out = [];
    else if (ev.cat >= 1) out = cards.map((c, i) => (byRank[c.r] === 1 ? i : -1)).filter((i) => i >= 0);
    else if (fourFlushOut(cards) >= 0) out = [fourFlushOut(cards)];
    else if (straightDrawOut(cards) >= 0) out = [straightDrawOut(cards)];
    else {
      const order = cards.map((c, i) => i).sort((a, b) => cards[a].r - cards[b].r);
      out = order.slice(0, 3);
    }
    // A pair-with-kicker keeps its best kicker when only 3 may go.
    if (out.length > maxDiscard) {
      out = out.sort((a, b) => cards[a].r - cards[b].r).slice(0, maxDiscard);
    }
    return out;
  }

  LC.cards = { SUITS, CATS, rankLabel, isRed, same, newDeck, shuffle, evaluate, evaluateWild, compare, describe, strength, chooseDiscards, fourFlushOut, straightDrawOut };
})(typeof window !== 'undefined' ? (window.LC = window.LC || {}) : (globalThis.LC = globalThis.LC || {}));
