'use strict';

/* ============================================================
   渲染层
   ============================================================ */

const DPR = Math.min(2, window.devicePixelRatio || 1);

const PAL = {
  ground: '#dfe7ec',
  block: '#e9eff3',
  park: '#d4e6cf',
  tree: '#a8c9a1',
  treeDark: '#8fb98c',
  sidewalk: '#c5cfd6',
  curb: '#a9b4bb',
  asphalt: '#4b545c',
  box: '#545e66',
  bike: '#3e6f65',
  center: '#f6cf64',
  edge: 'rgba(255,255,255,.55)',
  cross: '#f1f6f9',
  bldShadow: 'rgba(52,74,88,.16)',
  bldWin: 'rgba(86,110,126,.22)'
};

const LIGHT = {
  green: '#3ddc97',
  yellow: '#ffd166',
  red: '#ef5b5b',
  off: '#2a343d'
};

const MOVE_LABEL = { ns: '纵', ew: '横', turn: '转', pedns: '人纵', pedew: '人横', crossing: '人' };

function rr(ctx, x, y, w, h, r) {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2));
  ctx.beginPath();
  ctx.moveTo(x + rad, y);
  ctx.arcTo(x + w, y, x + w, y + h, rad);
  ctx.arcTo(x + w, y + h, x, y + h, rad);
  ctx.arcTo(x, y + h, x, y, rad);
  ctx.arcTo(x, y, x + w, y, rad);
  ctx.closePath();
}

/* ---------------- 静态底图 ---------------- */
function drawBlock(g, b) {
  g.fillStyle = PAL.block;
  rr(g, b.x + 3, b.y + 3, b.w - 6, b.h - 6, 5);
  g.fill();

  if (b.park) {
    g.fillStyle = PAL.park;
    rr(g, b.x + 3, b.y + 3, b.w - 6, b.h - 6, 5);
    g.fill();
    for (const t of b.trees) {
      g.fillStyle = PAL.treeDark;
      g.beginPath(); g.arc(t.x + 1.5, t.y + 2, t.r, 0, Math.PI * 2); g.fill();
      g.fillStyle = PAL.tree;
      g.beginPath(); g.arc(t.x, t.y, t.r, 0, Math.PI * 2); g.fill();
    }
    return;
  }

  for (const bl of b.buildings) {
    g.fillStyle = PAL.bldShadow;
    rr(g, bl.x + 3, bl.y + 4, bl.w, bl.h, 4);
    g.fill();
    g.fillStyle = bl.color;
    rr(g, bl.x, bl.y, bl.w, bl.h, 4);
    g.fill();
    g.strokeStyle = 'rgba(255,255,255,.5)';
    g.lineWidth = 1;
    rr(g, bl.x + 0.5, bl.y + 0.5, bl.w - 1, bl.h - 1, 4);
    g.stroke();

    if (bl.win && bl.w > 26 && bl.h > 22) {
      g.fillStyle = PAL.bldWin;
      const cols = Math.min(3, Math.max(1, Math.floor(bl.w / 20)));
      const rows = Math.min(2, Math.max(1, Math.floor(bl.h / 20)));
      const cw = (bl.w - 12) / cols;
      const ch = (bl.h - 12) / rows;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          g.fillRect(bl.x + 6 + c * cw + cw * 0.18, bl.y + 6 + r * ch + ch * 0.2,
            Math.min(7, cw * 0.5), Math.min(6, ch * 0.4));
        }
      }
    }
  }
}

function drawRoad(g, axis, coord) {
  g.fillStyle = PAL.sidewalk;
  if (axis === 'H') g.fillRect(0, coord - CFG.HALF, CFG.W, CFG.HALF * 2);
  else g.fillRect(coord - CFG.HALF, 0, CFG.HALF * 2, CFG.H);

  g.fillStyle = PAL.curb;
  if (axis === 'H') {
    g.fillRect(0, coord - CFG.HALF, CFG.W, 1.2);
    g.fillRect(0, coord + CFG.HALF - 1.2, CFG.W, 1.2);
  } else {
    g.fillRect(coord - CFG.HALF, 0, 1.2, CFG.H);
    g.fillRect(coord + CFG.HALF - 1.2, 0, 1.2, CFG.H);
  }

  g.fillStyle = PAL.asphalt;
  if (axis === 'H') g.fillRect(0, coord - CFG.ASPHALT, CFG.W, CFG.ASPHALT * 2);
  else g.fillRect(coord - CFG.ASPHALT, 0, CFG.ASPHALT * 2, CFG.H);

  g.fillStyle = PAL.bike;
  if (axis === 'H') {
    g.fillRect(0, coord - CFG.ASPHALT, CFG.W, CFG.BIKE_W);
    g.fillRect(0, coord + CFG.ASPHALT - CFG.BIKE_W, CFG.W, CFG.BIKE_W);
  } else {
    g.fillRect(coord - CFG.ASPHALT, 0, CFG.BIKE_W, CFG.H);
    g.fillRect(coord + CFG.ASPHALT - CFG.BIKE_W, 0, CFG.BIKE_W, CFG.H);
  }
}

function drawZebra(g, x0, y0, x1, y1, verticalBars) {
  g.fillStyle = PAL.cross;
  g.globalAlpha = 0.88;
  if (verticalBars) {
    for (let x = x0; x < x1; x += 8) g.fillRect(x, y0, 4.4, y1 - y0);
  } else {
    for (let y = y0; y < y1; y += 8) g.fillRect(x0, y, x1 - x0, 4.4);
  }
  g.globalAlpha = 1;
}

function buildStaticMap() {
  const cv = document.createElement('canvas');
  cv.width = CFG.W * DPR;
  cv.height = CFG.H * DPR;
  const g = cv.getContext('2d');
  g.setTransform(DPR, 0, 0, DPR, 0, 0);

  g.fillStyle = PAL.ground;
  g.fillRect(0, 0, CFG.W, CFG.H);
  for (const b of Network.blocks) drawBlock(g, b);

  if (Network.layout === 'single') {
    const y = Network.roadY;
    drawRoad(g, 'H', y);

    g.strokeStyle = PAL.center;
    g.lineWidth = 1.5;
    g.setLineDash([10, 10]);
    g.beginPath(); g.moveTo(0, y); g.lineTo(CFG.W, y); g.stroke();
    g.setLineDash([]);

    g.strokeStyle = PAL.edge;
    g.lineWidth = 1;
    g.beginPath(); g.moveTo(0, y - CFG.CAR_W); g.lineTo(CFG.W, y - CFG.CAR_W); g.stroke();
    g.beginPath(); g.moveTo(0, y + CFG.CAR_W); g.lineTo(CFG.W, y + CFG.CAR_W); g.stroke();

    for (const c of Network.crossings) {
      drawZebra(g, c.x - CFG.CROSS_W / 2, y - CFG.ASPHALT,
        c.x + CFG.CROSS_W / 2, y + CFG.ASPHALT, false);
    }
  } else {
    for (const y of CFG.IY) drawRoad(g, 'H', y);
    for (const x of CFG.IX) drawRoad(g, 'V', x);

    g.strokeStyle = PAL.center;
    g.lineWidth = 1.5;
    g.setLineDash([10, 10]);
    for (const y of CFG.IY) {
      g.beginPath(); g.moveTo(0, y); g.lineTo(CFG.W, y); g.stroke();
    }
    for (const x of CFG.IX) {
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, CFG.H); g.stroke();
    }
    g.setLineDash([]);

    g.strokeStyle = PAL.edge;
    g.lineWidth = 1;
    for (const y of CFG.IY) {
      g.beginPath(); g.moveTo(0, y - CFG.CAR_W); g.lineTo(CFG.W, y - CFG.CAR_W); g.stroke();
      g.beginPath(); g.moveTo(0, y + CFG.CAR_W); g.lineTo(CFG.W, y + CFG.CAR_W); g.stroke();
    }
    for (const x of CFG.IX) {
      g.beginPath(); g.moveTo(x - CFG.CAR_W, 0); g.lineTo(x - CFG.CAR_W, CFG.H); g.stroke();
      g.beginPath(); g.moveTo(x + CFG.CAR_W, 0); g.lineTo(x + CFG.CAR_W, CFG.H); g.stroke();
    }

    for (const y of CFG.IY) {
      for (const x of CFG.IX) {
        g.fillStyle = PAL.box;
        g.fillRect(x - CFG.HALF, y - CFG.HALF, CFG.HALF * 2, CFG.HALF * 2);
      }
    }

    for (const y of CFG.IY) {
      for (const x of CFG.IX) {
        const a = CFG.ASPHALT;
        drawZebra(g, x - a, y - CFG.CROSS_OFF - CFG.CROSS_W / 2, x + a, y - CFG.CROSS_OFF + CFG.CROSS_W / 2, true);
        drawZebra(g, x - a, y + CFG.CROSS_OFF - CFG.CROSS_W / 2, x + a, y + CFG.CROSS_OFF + CFG.CROSS_W / 2, true);
        drawZebra(g, x + CFG.CROSS_OFF - CFG.CROSS_W / 2, y - a, x + CFG.CROSS_OFF + CFG.CROSS_W / 2, y + a, false);
        drawZebra(g, x - CFG.CROSS_OFF - CFG.CROSS_W / 2, y - a, x - CFG.CROSS_OFF + CFG.CROSS_W / 2, y + a, false);
      }
    }
  }

  const edgeGrad = g.createLinearGradient(0, 0, 0, CFG.H);
  edgeGrad.addColorStop(0, 'rgba(12,17,22,.10)');
  edgeGrad.addColorStop(0.12, 'rgba(12,17,22,0)');
  edgeGrad.addColorStop(0.88, 'rgba(12,17,22,0)');
  edgeGrad.addColorStop(1, 'rgba(12,17,22,.10)');
  g.fillStyle = edgeGrad;
  g.fillRect(0, 0, CFG.W, CFG.H);

  return cv;
}

/* ---------------- 信号 ---------------- */
function drawStopLine(ctx, x1, y1, x2, y2, color, width) {
  ctx.strokeStyle = color;
  ctx.lineWidth = width || 3;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.lineCap = 'butt';
}

const phaseColor = (c) => c === 'green' ? LIGHT.green : c === 'yellow' ? LIGHT.yellow : LIGHT.red;

function drawHeadBadge(ctx, head, selected, hovered) {
  const bx = head.badgeX, by = head.badgeY;
  const ph = head.phase(gameTime);
  const color = phaseColor(ph);

  ctx.fillStyle = selected ? 'rgba(26,36,44,.98)' : 'rgba(20,28,35,.92)';
  rr(ctx, bx, by, 24, 34, 7);
  ctx.fill();
  ctx.strokeStyle = selected ? 'rgba(242,193,78,.95)' : hovered ? 'rgba(255,255,255,.5)' : 'rgba(255,255,255,.14)';
  ctx.lineWidth = selected ? 1.8 : 1;
  ctx.stroke();

  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 7;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(bx + 12, by + 11, 6.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.fillStyle = 'rgba(214,230,240,.92)';
  ctx.font = '600 9px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(head.label || MOVE_LABEL[head.move] || '', bx + 12, by + 29);
  ctx.textAlign = 'start';
}

function drawIntersectionSignals(ctx, game, site) {
  const heads = game.headsAt(site.ix, site.iy);
  const ns = heads.find(h => h.move === 'ns');
  const ew = heads.find(h => h.move === 'ew');
  const x = site.x, y = site.y;

  const neutral = 'rgba(240,246,250,.55)';
  const cEW = ew ? phaseColor(ew.phase(game.time)) : neutral;
  const cNS = ns ? phaseColor(ns.phase(game.time)) : neutral;

  drawStopLine(ctx, x - CFG.STOP_OFF, y + 1, x - CFG.STOP_OFF, y + CFG.ASPHALT, cEW);
  drawStopLine(ctx, x + CFG.STOP_OFF, y - 1, x + CFG.STOP_OFF, y - CFG.ASPHALT, cEW);
  drawStopLine(ctx, x + 1, y + CFG.STOP_OFF, x + CFG.ASPHALT, y + CFG.STOP_OFF, cNS);
  drawStopLine(ctx, x - 1, y - CFG.STOP_OFF, x - CFG.ASPHALT, y - CFG.STOP_OFF, cNS);

  for (const h of heads) {
    drawHeadBadge(ctx, h, game.selectedHead === h.id, game.hoverHead === h.id);
  }
}

function drawCrossingSignals(ctx, game, site) {
  const head = game.headsAtCrossing(site.i)[0];
  if (head) {
    const ph = head.phase(game.time);
    const carGo = ph === 'red';
    const c = carGo ? LIGHT.green : ph === 'yellow' ? LIGHT.yellow : LIGHT.red;
    drawStopLine(ctx, site.x - CFG.XING_STOP, site.y + 1, site.x - CFG.XING_STOP, site.y + CFG.ASPHALT, c);
    drawStopLine(ctx, site.x + CFG.XING_STOP, site.y - 1, site.x + CFG.XING_STOP, site.y - CFG.ASPHALT, c);

    ctx.strokeStyle = 'rgba(48,60,68,.55)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(head.badgeX + 12, head.badgeY + 34);
    ctx.lineTo(head.badgeX + 12, site.y - CFG.HALF + 2);
    ctx.stroke();
    ctx.lineCap = 'butt';

    drawHeadBadge(ctx, head, game.selectedHead === head.id, game.hoverHead === head.id);
  }
}

function drawBuildSites(ctx, game) {
  if (!game.buildMode) return;
  ctx.save();
  ctx.strokeStyle = 'rgba(90,214,255,.55)';
  ctx.lineWidth = 2;
  ctx.setLineDash([6, 6]);
  ctx.lineDashOffset = -(game.time * 14) % 12;
  for (const site of Network.buildSites) {
    if (site.kind === 'i') {
      rr(ctx, site.x - CFG.HALF - 8, site.y - CFG.HALF - 8, (CFG.HALF + 8) * 2, (CFG.HALF + 8) * 2, 10);
    } else {
      rr(ctx, site.x - 30, site.y - 46, 60, 92, 10);
    }
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

/* ---------------- 交通参与者 ---------------- */
function drawVehicle(ctx, v) {
  const p = v.pos();
  const len = v.kind === 'car' ? CFG.CAR_LEN : CFG.BIKE_LEN;
  const wid = v.kind === 'car' ? CFG.CAR_BODY_W : 5;

  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(p.angle);
  ctx.translate(-len / 2, 0);

  if (v.kind === 'car') {
    ctx.fillStyle = 'rgba(20,32,40,.22)';
    rr(ctx, -len / 2 + 1, -wid / 2 + 2, len, wid, 3);
    ctx.fill();
    ctx.fillStyle = v.color;
    rr(ctx, -len / 2, -wid / 2, len, wid, 3);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.30)';
    rr(ctx, -len * 0.16, -wid / 2 + 1.2, len * 0.38, wid - 2.4, 1.6);
    ctx.fill();
    ctx.fillStyle = 'rgba(18,30,40,.42)';
    rr(ctx, len * 0.18, -wid / 2 + 1.4, len * 0.16, wid - 2.8, 1.2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,245,200,.85)';
    ctx.fillRect(len / 2 - 1.2, -wid / 2 + 0.8, 1.2, 2);
    ctx.fillRect(len / 2 - 1.2, wid / 2 - 2.8, 1.2, 2);
  } else {
    ctx.fillStyle = 'rgba(20,32,40,.18)';
    rr(ctx, -len / 2 + 1, -wid / 2 + 1.5, len, wid, 2);
    ctx.fill();
    ctx.fillStyle = '#35b9a6';
    rr(ctx, -len / 2, -wid / 2, len, wid, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)';
    ctx.beginPath();
    ctx.arc(len * 0.12, 0, 2.1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

function drawPed(ctx, ped, t) {
  const p = ped.pos();
  const legs = ped.route.legs;
  const last = legs[ped.legIdx];
  let alpha = 1;
  if (ped.legIdx === legs.length - 1 && last && last.len - ped.d < 30) {
    alpha = Math.max(0, (last.len - ped.d) / 30);
  }
  ctx.globalAlpha = alpha;

  if (ped.waiting) {
    const pulse = 0.5 + 0.5 * Math.sin(t * 5 + p.x * 0.1);
    ctx.strokeStyle = `rgba(240,160,70,${0.18 + pulse * 0.3})`;
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 6 + pulse * 1.6, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.fillStyle = 'rgba(30,42,50,.3)';
  ctx.beginPath();
  ctx.arc(p.x + 0.8, p.y + 1.2, 3.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = ped.hue % 2 ? '#f08a3c' : '#e8792f';
  ctx.beginPath();
  ctx.arc(p.x, p.y, 3.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.92)';
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/* ---------------- 主渲染 ---------------- */
let gameTime = 0;

function drawScene(ctx, game) {
  gameTime = game.time;
  game.layoutHeads();

  ctx.clearRect(0, 0, CFG.W, CFG.H);
  if (game.staticMap) {
    ctx.drawImage(game.staticMap, 0, 0, CFG.W, CFG.H);
  } else {
    ctx.fillStyle = PAL.ground;
    ctx.fillRect(0, 0, CFG.W, CFG.H);
  }

  drawBuildSites(ctx, game);

  for (const site of Network.buildSites) {
    if (site.kind === 'i') drawIntersectionSignals(ctx, game, site);
    else drawCrossingSignals(ctx, game, site);
  }

  for (const ped of game.peds) drawPed(ctx, ped, game.time);
  for (const v of game.vehicles) drawVehicle(ctx, v);

  // 选中灯头的金色指示环
  const sel = game.signals.find(h => h.id === game.selectedHead);
  if (sel) {
    ctx.strokeStyle = 'rgba(242,193,78,.95)';
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    rr(ctx, sel.badgeX - 5, sel.badgeY - 5, 34, 44, 9);
    ctx.stroke();
    ctx.setLineDash([]);
  }
}
