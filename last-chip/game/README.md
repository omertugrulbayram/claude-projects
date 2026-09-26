# LAST CHIP — playable prototype (v0.1)

A 1990s casino-noir life sim: work shifts, pay rent, dodge Mr. Black, and try to climb from a $20 back-room game to The Ivory Room with heads-up Five-Card Draw.

## Run
Open `index.html` in a browser. No build step, no server needed. Progress autosaves to the browser.

Tests: `node tests/run.js` (hand evaluator, 12k simulated hands for chip conservation, life loop).

## What is in v0.1
- **Day clock**: every action costs time. Day shift 06–12, night shift 20–22 (pays more, you go to bed late). Bed after 02:00 = sleep deprived. Skipping food = hungry. Still up at 06:00 = you pass out.
- **Money that stays gone**: buy-ins come out of your cash. Rebuy, cash out, or walk home broke. There is no game over.
- **Rent** every 4 days; two days late and you are evicted to the street (worse sleep, 1 storage slot).
- **Mr. Black**: $400 owed at the start. Loans at 20% for 5 days, credit grows with reputation. Miss the date and his men take an item or half your cash, and the debt grows 10%.
- **5 venues**: Rusty Nail $20 → Back Alley $50 → Lucky Rabbit $250 (rep 8) → Royal Crown $2,500 (rep 25) → Ivory Room $25,000 (rep 65).
- **10 opponents** with their own style, tells and tilt: Vinny, Eleanor, Dottie, Zero (nights only; beat him 5 times for the Black Joker)…
- **14 lucky items** in 6 slots (HAT, NECK, RING, POCKET, WATCH, CHARM), including illegal ones that can get you banned for 3 days.
- **Housing**: motel → apartment → loft → penthouse, each with perks.
- **Sal's Pawn** (buy/sell items, stock changes daily) and **Rosie's Diner**.

## Files
- `js/cards.js`: deck, hand evaluation, AI hand strength and draw choice
- `js/data.js`: venues, opponents, items, housing, job (tuning lives here)
- `js/life.js`: time, work, rent, debt, items, sleep, save
- `js/poker.js`: table session, betting state machine, opponent AI, item effects
- `js/scene.js`: 192×108 pixel scenes on canvas (rain, neon, smoke)
- `js/ui.js`: screens and input
