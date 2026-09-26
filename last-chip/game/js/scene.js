// Low-res pixel scenes drawn on a 192x108 canvas: rain, neon, smoke.
(function (LC) {
  const W = 192;
  const H = 108;
  let ctx = null;
  let current = { name: 'motel', clock: 7 * 60, tier: 0 };
  let drops = [];
  let smoke = [];
  let t = 0;
  let reduced = false;

  const P = {
    night: '#0c0e1a', dusk: '#3b2233', day: '#56708a', dawn: '#6b4c55',
    wall: '#2a2220', wall2: '#3a2e29', floor: '#1b1513', wood: '#5a3a24', wood2: '#40291a',
    felt: '#1f5a43', felt2: '#164433', gold: '#e9b949', gold2: '#8a6a22', neon: '#53d6e6', pink: '#ff5c8a',
    red: '#d2453c', paper: '#efe4cc', skin: '#c49a7a', shadow: '#0a0807', glass: '#1a2433', lamp: '#ffd98a',
    tv: '#6fb4ff', grey: '#6b625a', dark: '#120e0c',
  };

  function rect(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); }
  function glow(x, y, r, c, a) {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, c);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = a;
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.globalAlpha = 1;
  }
  function text(s, x, y, c, size = 7) {
    ctx.font = `${size}px "Pixelify Sans", monospace`;
    ctx.fillStyle = c;
    ctx.fillText(s, x, y);
  }
  const flick = (seed) => reduced || Math.sin(t * 0.37 + seed) > -0.92 || Math.random() > 0.5;

  function sky(clock) {
    const m = clock % 1440;
    if (m >= 20 * 60 || m < 5 * 60) return P.night;
    if (m >= 18 * 60) return P.dusk;
    if (m < 7 * 60) return P.dawn;
    return P.day;
  }
  const dark = (clock) => { const m = clock % 1440; return m >= 19 * 60 || m < 6 * 60; };

  function skyline(y0, clock) {
    rect(0, 0, W, y0, sky(clock));
    const bld = [[0, 30, 22], [20, 18, 16], [34, 40, 18], [50, 26, 24], [72, 12, 14], [84, 34, 20], [102, 22, 18], [118, 44, 16], [132, 28, 22], [152, 16, 14], [164, 36, 28]];
    for (const [x, h, w] of bld) {
      rect(x, y0 - h, w, h, '#161320');
      for (let wy = y0 - h + 3; wy < y0 - 2; wy += 5) for (let wx = x + 2; wx < x + w - 2; wx += 4) {
        if (((wx * 7 + wy * 13) % 5) < (dark(clock) ? 2 : 1)) rect(wx, wy, 2, 2, dark(clock) ? '#e9c46a' : '#2b2838');
      }
    }
  }

  function rainOver(x, y, w, h, alpha = 0.55) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, h);
    ctx.clip();
    ctx.globalAlpha = alpha;
    for (const d of drops) rect(x + (d.x % w), y + (d.y % h), 1, 3, '#8fb3d9');
    ctx.restore();
  }

  function person(x, y, c, hat) {
    rect(x - 4, y, 9, 14, c); // torso
    rect(x - 2, y - 7, 5, 6, P.skin);
    if (hat) { rect(x - 4, y - 9, 9, 2, hat); rect(x - 2, y - 11, 5, 2, hat); }
    rect(x - 5, y + 14, 11, 2, P.shadow);
  }

  // ---------- scenes ----------
  const scenes = {
    motel(c) {
      rect(0, 0, W, H, P.wall);
      rect(0, 80, W, 28, P.floor);
      for (let x = 0; x < W; x += 8) rect(x, 0, 1, 80, P.wall2);
      // window
      rect(18, 16, 52, 40, P.glass);
      skylineIn(18, 16, 52, 40, c.clock);
      rainOver(18, 16, 52, 40);
      if (dark(c.clock) && flick(1)) { glow(56, 28, 22, P.pink, 0.35); text('MOTEL', 44, 31, P.pink, 7); }
      rect(16, 14, 56, 2, P.wood); rect(16, 56, 56, 2, P.wood); rect(43, 16, 2, 40, P.wood);
      // bed
      rect(96, 62, 70, 20, '#6b3b3b'); rect(96, 58, 18, 8, P.paper); rect(96, 78, 70, 4, P.wood2);
      // lamp and nightstand
      rect(170, 64, 14, 18, P.wood2); rect(174, 52, 6, 12, P.gold2); rect(171, 46, 12, 7, P.lamp);
      glow(177, 52, 28, P.lamp, dark(c.clock) ? 0.35 : 0.15);
      // tv
      rect(118, 30, 26, 18, '#1d1d1d'); rect(120, 32, 22, 13, P.tv);
      if (!reduced) rect(120, 32 + ((t >> 1) % 13), 22, 1, '#bfe0ff');
      glow(131, 40, 30, P.tv, 0.18);
      rect(126, 48, 10, 4, '#1d1d1d');
    },
    street(c) {
      skyline(70, c.clock);
      rect(0, 70, W, 38, '#1c1a1f');
      rect(0, 84, W, 2, '#2d2a31');
      rect(10, 40, 40, 44, '#2a1f1d'); rect(18, 58, 18, 26, '#120e0c');
      if (flick(2)) { glow(30, 50, 20, P.neon, 0.4); text('BAR', 22, 53, P.neon, 7); }
      rect(120, 72, 22, 12, '#3a3530'); rect(140, 74, 30, 10, '#57402d'); // cardboard bed
      person(152, 64, '#3d4a5a');
      rainOver(0, 0, W, H, 0.5);
    },
    apartment(c) {
      rect(0, 0, W, H, '#2c2f33');
      rect(0, 82, W, 26, '#3b2c22');
      rect(24, 14, 60, 44, P.glass); skylineIn(24, 14, 60, 44, c.clock); rainOver(24, 14, 60, 44, 0.35);
      rect(22, 12, 64, 2, '#ddd'); rect(22, 58, 64, 2, '#ddd');
      rect(104, 60, 64, 22, '#4b5c6b'); rect(104, 56, 16, 8, P.paper);
      rect(172, 48, 10, 34, P.wood2);
      glow(177, 44, 26, P.lamp, 0.3);
      rect(108, 26, 30, 20, '#56402b'); rect(110, 28, 26, 16, '#8a7050');
    },
    loft(c) {
      rect(0, 0, W, H, '#1f2226');
      rect(0, 86, W, 22, '#3a2a20');
      rect(8, 6, 176, 66, P.glass); skylineIn(8, 6, 176, 66, c.clock); rainOver(8, 6, 176, 66, 0.3);
      for (let x = 8; x <= 184; x += 44) rect(x, 6, 2, 66, '#0f1114');
      rect(40, 70, 70, 16, '#7a2f35'); rect(40, 66, 70, 5, '#5d2228');
      rect(130, 60, 34, 4, P.gold2); rect(145, 64, 4, 22, P.gold2);
      glow(146, 60, 30, P.gold, 0.2);
    },
    gas(c) {
      skyline(64, c.clock);
      rect(0, 64, W, 44, '#26252a');
      rect(20, 20, 150, 8, '#d2d2d2'); rect(20, 28, 150, 3, P.red);
      text('GAS-N-GO', 70, 27, P.red, 7);
      for (const x of [40, 90, 140]) { rect(x, 31, 4, 45, '#a8a8a8'); }
      for (const x of [56, 112]) { rect(x, 58, 14, 20, P.red); rect(x + 3, 62, 8, 5, '#111'); }
      if (dark(c.clock)) { glow(95, 30, 70, '#fff6d8', 0.25); }
      rect(150, 50, 36, 28, '#3a3a40'); rect(156, 56, 24, 12, P.lamp);
      person(168, 62, '#b33', '#b33');
      rainOver(0, 0, W, 64, 0.5);
    },
    diner(c) {
      rect(0, 0, W, H, '#34221f');
      for (let x = 0; x < W; x += 12) for (let y = 84; y < H; y += 6) rect(x + ((y / 6) % 2) * 6, y, 6, 6, '#e7dccb');
      rect(0, 84, W, 1, '#1a1110');
      rect(10, 12, 90, 34, P.glass); skylineIn(10, 12, 90, 34, c.clock); rainOver(10, 12, 90, 34, 0.4);
      if (flick(3)) { glow(150, 20, 26, P.pink, 0.4); text("ROSIE'S", 130, 24, P.pink, 8); }
      rect(0, 60, W, 12, '#b83b3b'); rect(0, 58, W, 3, '#dcdcdc');
      for (const x of [20, 50, 80, 110, 140, 170]) { rect(x, 72, 8, 3, '#b83b3b'); rect(x + 3, 75, 2, 9, '#999'); }
      person(120, 44, '#d98fa3');
      rect(150, 50, 6, 8, '#ddd');
      if (!reduced) steam(153, 48);
    },
    pawn(c) {
      rect(0, 0, W, H, '#2a2419');
      rect(0, 84, W, 24, '#1a150f');
      for (let y = 18; y < 70; y += 17) {
        rect(10, y, 120, 2, P.wood);
        for (let x = 14; x < 126; x += 14) rect(x, y - 8, 8, 8, ['#8a8a8a', P.gold2, '#5a6b8a', '#8a4a3a', '#6b8a5a'][(x + y) % 5]);
      }
      rect(140, 58, 52, 26, P.wood2); rect(140, 56, 52, 3, P.wood);
      person(166, 44, '#5c5a4a');
      if (flick(4)) { glow(166, 16, 26, P.gold, 0.45); text('PAWN', 152, 20, P.gold, 8); }
    },
    office(c) {
      rect(0, 0, W, H, '#1a1414');
      rect(0, 84, W, 24, '#120d0c');
      rect(20, 10, 40, 50, '#231b1a'); for (let y = 12; y < 58; y += 4) rect(22, y, 36, 1, '#3a2c28'); // blinds
      rect(60, 62, 110, 8, P.wood); rect(64, 70, 6, 14, P.wood2); rect(160, 70, 6, 14, P.wood2);
      person(114, 44, '#111', '#111');
      rect(110, 42, 9, 2, P.shadow);
      rect(140, 54, 10, 8, P.gold2); rect(143, 44, 4, 10, P.gold2); rect(138, 40, 14, 5, '#2f6b3f');
      glow(145, 50, 40, P.lamp, 0.35);
      rect(84, 60, 8, 2, P.paper);
      if (!reduced) smokeFrom(92, 58);
    },
    city(c) {
      skyline(76, c.clock);
      rect(0, 76, W, 32, '#17151b');
      const signs = [[12, 'RUSTY NAIL', '#d98a4a'], [74, 'LUCKY RABBIT', P.pink], [140, 'CROWN', P.gold]];
      signs.forEach(([x, s, col], i) => { if (flick(5 + i)) { glow(x + 18, 60, 24, col, 0.35); text(s, x, 63, col, 7); } });
      for (let x = 0; x < W; x += 24) rect(x, 92, 12, 2, '#8a8a4a');
      rainOver(0, 0, W, H, 0.5);
    },
    casino(c) {
      const tones = [
        { wall: '#2a1f18', felt: P.felt, lamp: P.lamp },
        { wall: '#1b1a1e', felt: '#2d4d3a', lamp: '#d8e0a0' },
        { wall: '#3a1522', felt: P.felt, lamp: P.pink },
        { wall: '#2b1d0e', felt: '#1d4f3b', lamp: P.gold },
        { wall: '#e8e0d0', felt: '#233b2f', lamp: '#fff4dc' },
      ][c.tier] || {};
      rect(0, 0, W, H, tones.wall);
      rect(0, 88, W, 20, P.shadow);
      if (c.tier >= 3) for (let x = 20; x < W; x += 50) { rect(x, 0, 2, 10, P.gold2); rect(x - 6, 10, 14, 5, P.gold); glow(x + 1, 14, 22, P.gold, 0.35); }
      else { rect(92, 0, 2, 16, '#222'); rect(84, 16, 18, 5, '#333'); glow(93, 22, 50, tones.lamp, 0.35); }
      if (c.npc) person(96, 40, c.npcColor || '#333', c.npcHat);
      // table
      ctx.fillStyle = P.wood2;
      ctx.beginPath(); ctx.ellipse(96, 72, 86, 22, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = tones.felt;
      ctx.beginPath(); ctx.ellipse(96, 71, 80, 18, 0, 0, Math.PI * 2); ctx.fill();
      rect(80, 68, 32, 2, 'rgba(255,255,255,0.12)');
      if (c.pot > 0) { const n = Math.min(8, 1 + Math.floor(Math.log2(c.pot + 1) / 2)); for (let i = 0; i < n; i++) rect(90 + (i % 4) * 3, 70 - Math.floor(i / 4) * 2, 3, 2, i % 2 ? P.red : P.paper); }
      if (!reduced) smokeFrom(150, 60);
    },
  };

  function skylineIn(x, y, w, h, clock) {
    ctx.save();
    ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip();
    ctx.translate(x, y + h - 76);
    skyline(76, clock);
    ctx.restore();
  }

  function smokeFrom(x, y) {
    if (Math.random() < 0.15) smoke.push({ x, y, life: 0 });
    for (const s of smoke) {
      ctx.globalAlpha = Math.max(0, 0.35 - s.life / 120);
      rect(s.x + Math.sin((s.life + s.y) / 9) * 3, s.y - s.life / 3, 2, 2, '#cfc6b8');
    }
    ctx.globalAlpha = 1;
  }
  function steam(x, y) { smokeFrom(x, y); }

  function frame() {
    if (!ctx) return;
    t++;
    for (const d of drops) { d.y += d.v; d.x += 0.3; if (d.y > 400) { d.y = 0; d.x = Math.random() * 400; } }
    smoke.forEach((s) => s.life++);
    smoke = smoke.filter((s) => s.life < 90);
    ctx.imageSmoothingEnabled = false;
    (scenes[current.name] || scenes.motel)(current);
    // lamp-light vignette
    const g = ctx.createRadialGradient(W / 2, H / 2, 30, W / 2, H / 2, 120);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    if (!reduced) requestAnimationFrame(frame);
  }

  function init(canvas) {
    ctx = canvas.getContext('2d');
    reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    drops = Array.from({ length: 90 }, () => ({ x: Math.random() * 400, y: Math.random() * 400, v: 2 + Math.random() * 2 }));
    requestAnimationFrame(frame);
  }

  function set(next) {
    current = Object.assign({}, current, next);
    if (reduced) requestAnimationFrame(frame);
  }

  LC.scene = { init, set };
})(window.LC = window.LC || {});
