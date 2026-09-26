# LAST CHIP — oynanabilir prototip (v0.2)

A 1990s casino-noir life sim: work shifts, pay rent, dodge Mr. Black, and try to climb from a $20 back-room game to The Ivory Room with heads-up Five-Card Draw.

## Run
Open `index.html` in a browser. No build step, no server needed. Progress autosaves to the browser.

Tests: `node tests/run.js` (hand evaluator, 12k simulated hands for chip conservation, life loop).

## Nasıl oynanır (v0.2, sade sürüm)
- Her gün iki aşama var: **Gündüz** işe git (+$48) ya da dinlen. **Akşam** casinoya git ya da uyu.
- **Enerji** günlük bütçen: iş 40, her el 4 enerji. Uyuyunca dolar.
- Casinoda giriş parası cebinden çıkar. Fişlerin biterse tekrar gir ya da kalk. Game over yok.
- **Kira** 4 günde bir. 2 gün gecikirsen sokağa düşersin.
- **Mr. Black** borç verir (%20, 5 gün). Geç kalırsan adamları eşyanı ya da paranın yarısını alır.
- **Dükkan**: en fazla 3 şans eşyası taşıyabilirsin.
- **5 masa**: Rusty Nail $20 → Back Alley $50 → Lucky Rabbit $250 → Royal Crown $2,500 → Ivory Room $25,000. Üst masalar itibar ister; itibar kazandıkça gelir.

## Files
- `js/cards.js`: deck, hand evaluation, AI hand strength and draw choice
- `js/data.js`: venues, opponents, items, housing, job (tuning lives here)
- `js/life.js`: time, work, rent, debt, items, sleep, save
- `js/poker.js`: table session, betting state machine, opponent AI, item effects
- `js/scene.js`: 192×108 pixel scenes on canvas (rain, neon, smoke)
- `js/ui.js`: screens and input
