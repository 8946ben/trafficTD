'use strict';

/* ============================================================
   路网
   - blocks       : 街区建筑（视觉）
   - intersections: 网格路口
   - crossings    : 单街道过街口
   - buildSites   : 可建造信号灯的位置
   - pedRoutes    : 行人路线（过街节点带 loc）
   - makeRoute    : 生成逐车路线（含转向）
   ============================================================ */

function mulberry32(a) {
  return function () {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function dist2(ax, ay, bx, by) {
  return Math.hypot(bx - ax, by - ay);
}

function legPointAt(leg, d) {
  const pts = leg.pts, cum = leg.cum;
  if (d <= 0) return { x: pts[0][0], y: pts[0][1] };
  for (let i = 1; i < pts.length; i++) {
    if (d <= cum[i]) {
      const seg = cum[i] - cum[i - 1] || 1;
      const t = (d - cum[i - 1]) / seg;
      return {
        x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * t,
        y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * t
      };
    }
  }
  const last = pts[pts.length - 1];
  return { x: last[0], y: last[1] };
}

const BUILDING_COLORS = ['#c9d6de', '#dbe5ea', '#c3d1da', '#e2e9ed', '#cfdae1', '#d6e0e6'];

const RIGHT_OF = { E: 'S', S: 'W', W: 'N', N: 'E' };
const LEFT_OF = { E: 'N', N: 'W', W: 'S', S: 'E' };

function laneX(dir, cx, off) {
  if (dir === 'N') return cx + off;
  if (dir === 'S') return cx - off;
  return cx;
}

function laneY(dir, cy, off) {
  if (dir === 'E') return cy + off;
  if (dir === 'W') return cy - off;
  return cy;
}

const Network = {
  layout: 'grid',
  blocks: [],
  intersections: [],
  crossings: [],
  buildSites: [],
  pedRoutes: [],
  roadY: 0,

  init(level) {
    this.layout = level.layout || 'grid';
    this.blocks = [];
    this.intersections = [];
    this.crossings = [];
    this.buildSites = [];
    this.pedRoutes = [];
    this.roadY = level.roadY || 0;

    if (this.layout === 'single') {
      this.crossings = (level.crossings || []).map((x, i) => ({ x, y: level.roadY, i }));
      this.buildSites = this.crossings.map(c => ({
        kind: 'c', i: c.i, x: c.x, y: c.y, name: `过街口 ${c.i + 1}`
      }));
      this.makeSingleBlocks(level.seed);
      this.makeSinglePedRoutes();
    } else {
      for (let iy = 0; iy < CFG.ROWS; iy++) {
        for (let ix = 0; ix < CFG.COLS; ix++) {
          const x = CFG.IX[ix], y = CFG.IY[iy];
          this.intersections.push({ ix, iy, x, y, name: `${COL_NAMES[ix]}${iy + 1} 路口` });
          this.buildSites.push({ kind: 'i', ix, iy, x, y, name: `${COL_NAMES[ix]}${iy + 1} 路口` });
        }
      }
      this.makeGridBlocks(level.seed);
      this.makeGridPedRoutes();
    }
  },

  /* ---------------- 街区 ---------------- */
  makeBlock(x, y, w, h, rng) {
    const pad = 7;
    const bx = x + pad, by = y + pad;
    const bw = w - pad * 2, bh = h - pad * 2;
    const block = { x, y, w, h, buildings: [], trees: [], park: false };

    if (rng() < 0.15 && bw > 90 && bh > 80) {
      block.park = true;
      const n = 4 + Math.floor(rng() * 4);
      for (let i = 0; i < n; i++) {
        block.trees.push({
          x: bx + 12 + rng() * (bw - 24),
          y: by + 12 + rng() * (bh - 24),
          r: 6 + rng() * 7
        });
      }
      return block;
    }

    const horizontal = bw >= bh;
    const n = (horizontal ? bw : bh) > 240 ? 3 : 2;
    const gap = 7;
    const along = horizontal ? bw : bh;

    if (horizontal) {
      const cell = (along - gap * (n - 1)) / n;
      for (let i = 0; i < n; i++) {
        const bwd = cell * (0.7 + rng() * 0.28);
        const bht = bh * (0.6 + rng() * 0.36);
        block.buildings.push({
          x: bx + i * (cell + gap) + (cell - bwd) / 2,
          y: by + (bh - bht) / 2,
          w: bwd, h: bht,
          color: BUILDING_COLORS[Math.floor(rng() * BUILDING_COLORS.length)],
          win: rng() < 0.75
        });
      }
    } else {
      const cell = (along - gap * (n - 1)) / n;
      for (let i = 0; i < n; i++) {
        const bwd = bw * (0.6 + rng() * 0.36);
        const bht = cell * (0.7 + rng() * 0.28);
        block.buildings.push({
          x: bx + (bw - bwd) / 2,
          y: by + i * (cell + gap) + (cell - bht) / 2,
          w: bwd, h: bht,
          color: BUILDING_COLORS[Math.floor(rng() * BUILDING_COLORS.length)],
          win: rng() < 0.75
        });
      }
    }
    return block;
  },

  makeGridBlocks(seed) {
    const rng = mulberry32(seed);
    const xs = [0];
    for (const x of CFG.IX) xs.push(x - CFG.HALF, x + CFG.HALF);
    xs.push(CFG.W);
    const ys = [0];
    for (const y of CFG.IY) ys.push(y - CFG.HALF, y + CFG.HALF);
    ys.push(CFG.H);

    for (let a = 0; a < xs.length - 1; a += 2) {
      for (let b = 0; b < ys.length - 1; b += 2) {
        const x = xs[a], y = ys[b];
        const w = xs[a + 1] - x, h = ys[b + 1] - y;
        if (w < 56 || h < 56) continue;
        this.blocks.push(this.makeBlock(x, y, w, h, rng));
      }
    }
  },

  makeSingleBlocks(seed) {
    const rng = mulberry32(seed);
    const xs = [0, 125, 250, 375, 500, 625, 750, 875, CFG.W];
    const bands = [[0, this.roadY - CFG.HALF], [this.roadY + CFG.HALF, CFG.H]];
    for (const [y0, y1] of bands) {
      const h = y1 - y0;
      if (h < 56) continue;
      for (let i = 0; i < xs.length - 1; i++) {
        this.blocks.push(this.makeBlock(xs[i], y0, xs[i + 1] - xs[i], h, rng));
      }
    }
  },

  /* ---------------- 行人路线 ---------------- */
  addPedRoute(id, legs) {
    let total = 0;
    for (const leg of legs) {
      const cum = [0];
      let len = 0;
      for (let i = 1; i < leg.pts.length; i++) {
        len += dist2(leg.pts[i - 1][0], leg.pts[i - 1][1], leg.pts[i][0], leg.pts[i][1]);
        cum.push(len);
      }
      leg.len = len;
      leg.cum = cum;
      total += len;
      if (leg.kind === 'cross') {
        const a = leg.pts.length >= 4 ? leg.pts[1] : leg.pts[0];
        const b = leg.pts.length >= 4 ? leg.pts[2] : leg.pts[leg.pts.length - 1];
        leg.crossLen = dist2(a[0], a[1], b[0], b[1]);
      }
    }
    this.pedRoutes.push({ id, legs, total });
  },

  makeGridPedRoutes() {
    for (let j = 0; j < CFG.ROWS; j++) {
      for (const side of [-1, 1]) {
        for (const dir of [1, -1]) {
          const y0 = CFG.IY[j];
          const walkY = y0 + side * CFG.WALK_OFF;
          const crossY = y0 + side * CFG.CROSS_OFF;
          const startX = dir > 0 ? -20 : CFG.W + 20;
          const endX = dir > 0 ? CFG.W + 20 : -20;
          const order = dir > 0 ? [0, 1, 2] : [2, 1, 0];
          const legs = [];
          let cx = startX;

          for (const k of order) {
            const X = CFG.IX[k];
            const approachX = X - dir * CFG.WALK_OFF;
            const outX = X + dir * CFG.WALK_OFF;
            legs.push({ kind: 'walk', pts: [[cx, walkY], [approachX, walkY]] });
            legs.push({
              kind: 'cross',
              pts: [[approachX, walkY], [approachX, crossY], [outX, crossY], [outX, walkY]],
              loc: { type: 'i', ix: k, iy: j, pedAxis: 'ew' }
            });
            cx = outX;
          }
          legs.push({ kind: 'walk', pts: [[cx, walkY], [endX, walkY]] });
          this.addPedRoute(`ped-H${j}-${side}-${dir}`, legs);
        }
      }
    }

    for (let i = 0; i < CFG.COLS; i++) {
      for (const side of [-1, 1]) {
        for (const dir of [1, -1]) {
          const x0 = CFG.IX[i];
          const walkX = x0 + side * CFG.WALK_OFF;
          const crossX = x0 + side * CFG.CROSS_OFF;
          const startY = dir > 0 ? -20 : CFG.H + 20;
          const endY = dir > 0 ? CFG.H + 20 : -20;
          const order = dir > 0 ? [0, 1, 2] : [2, 1, 0];
          const legs = [];
          let cy = startY;

          for (const k of order) {
            const Y = CFG.IY[k];
            const approachY = Y - dir * CFG.WALK_OFF;
            const outY = Y + dir * CFG.WALK_OFF;
            legs.push({ kind: 'walk', pts: [[walkX, cy], [walkX, approachY]] });
            legs.push({
              kind: 'cross',
              pts: [[walkX, approachY], [crossX, approachY], [crossX, outY], [walkX, outY]],
              loc: { type: 'i', ix: i, iy: k, pedAxis: 'ns' }
            });
            cy = outY;
          }
          legs.push({ kind: 'walk', pts: [[walkX, cy], [walkX, endY]] });
          this.addPedRoute(`ped-V${i}-${side}-${dir}`, legs);
        }
      }
    }
  },

  makeSinglePedRoutes() {
    for (const side of [-1, 1]) {
      for (const dir of [1, -1]) {
        for (const c of this.crossings) {
          const cx = c.x;
          const walkY = this.roadY + side * CFG.WALK_OFF;
          const otherY = this.roadY - side * CFG.WALK_OFF;
          const startX = dir > 0 ? -20 : CFG.W + 20;
          const endX = cx + dir * 150;

          const legs = [
            { kind: 'walk', pts: [[startX, walkY], [cx, walkY]] },
            { kind: 'cross', pts: [[cx, walkY], [cx, otherY]], loc: { type: 'c', i: c.i } },
            { kind: 'walk', pts: [[cx, otherY], [endX, otherY]] }
          ];
          this.addPedRoute(`ped-S-${side}-${dir}-${c.i}`, legs);
        }
      }
    }
  },

  /* ---------------- 车辆路线 ---------------- */
  finishRoute(pts, stops, dir) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
      cum.push(cum[i - 1] + dist2(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]));
    }
    return { pts, cum, length: cum[cum.length - 1], stops, dir };
  },

  makeSingleRoute(kind) {
    const off = kind === 'car' ? CFG.CAR_OFF : CFG.BIKE_OFF;
    const east = Math.random() < 0.5;
    const dir = east ? 'E' : 'W';
    const y = this.roadY + (east ? off : -off);
    const sx = east ? -24 : CFG.W + 24;
    const ex = east ? CFG.W + 24 : -24;

    const stops = this.crossings.map(c => {
      const stopX = east ? c.x - CFG.XING_STOP : c.x + CFG.XING_STOP;
      return {
        s: Math.abs(stopX - sx),
        headType: 'crossing',
        ci: c.i,
        move: 'crossing',
        axisHead: 'crossing'
      };
    }).sort((a, b) => a.s - b.s);

    return this.finishRoute([[sx, y], [ex, y]], stops, dir);
  },

  makeRoute(kind, level) {
    if (this.layout === 'single') return this.makeSingleRoute(kind);

    const off = kind === 'car' ? CFG.CAR_OFF : CFG.BIKE_OFF;
    const w = (level && level.weights) || {};
    const options = [];
    for (let j = 0; j < CFG.ROWS; j++) {
      options.push({ axis: 'H', roadIdx: j, dir: 'E', w: w.E || 1 });
      options.push({ axis: 'H', roadIdx: j, dir: 'W', w: w.W || 1 });
    }
    for (let i = 0; i < CFG.COLS; i++) {
      options.push({ axis: 'V', roadIdx: i, dir: 'S', w: w.S || 1 });
      options.push({ axis: 'V', roadIdx: i, dir: 'N', w: w.N || 1 });
    }
    let totalW = 0;
    for (const o of options) totalW += o.w;
    let r = Math.random() * totalW;
    let st = options[options.length - 1];
    for (const o of options) { r -= o.w; if (r <= 0) { st = o; break; } }

    let axis = st.axis, roadIdx = st.roadIdx, dir = st.dir;
    let x, y;
    if (axis === 'H') {
      x = dir === 'E' ? -24 : CFG.W + 24;
      y = CFG.IY[roadIdx] + (dir === 'E' ? off : -off);
    } else {
      x = CFG.IX[roadIdx] + (dir === 'N' ? off : -off);
      y = dir === 'N' ? CFG.H + 24 : -24;
    }

    const pts = [[x, y]];
    const stops = [];
    let total = 0;
    const add = (px, py) => {
      const last = pts[pts.length - 1];
      total += dist2(last[0], last[1], px, py);
      pts.push([px, py]);
      return total;
    };

    for (let guard = 0; guard < 14; guard++) {
      let next = null;
      if (axis === 'H') {
        const cy = CFG.IY[roadIdx];
        for (let k = 0; k < CFG.COLS; k++) {
          const cx = CFG.IX[k];
          if (dir === 'E' && cx > x + 1 && (!next || cx < next.cx)) next = { ix: k, iy: roadIdx, cx, cy };
          if (dir === 'W' && cx < x - 1 && (!next || cx > next.cx)) next = { ix: k, iy: roadIdx, cx, cy };
        }
      } else {
        const cx = CFG.IX[roadIdx];
        for (let k = 0; k < CFG.ROWS; k++) {
          const cy = CFG.IY[k];
          if (dir === 'S' && cy > y + 1 && (!next || cy < next.cy)) next = { ix: roadIdx, iy: k, cx, cy };
          if (dir === 'N' && cy < y - 1 && (!next || cy > next.cy)) next = { ix: roadIdx, iy: k, cx, cy };
        }
      }

      if (!next) {
        if (axis === 'H') add(dir === 'E' ? CFG.W + 24 : -24, y);
        else add(x, dir === 'S' ? CFG.H + 24 : -24);
        break;
      }

      const { cx, cy, ix, iy } = next;
      let sx, sy;
      if (dir === 'E') { sx = cx - CFG.STOP_OFF; sy = cy + off; }
      else if (dir === 'W') { sx = cx + CFG.STOP_OFF; sy = cy - off; }
      else if (dir === 'N') { sx = cx + off; sy = cy + CFG.STOP_OFF; }
      else { sx = cx - off; sy = cy - CFG.STOP_OFF; }
      add(sx, sy);
      const sStop = total;

      const roll = Math.random();
      const move = roll < 0.54 ? 'through' : roll < 0.78 ? 'right' : 'left';
      const axisHead = (dir === 'N' || dir === 'S') ? 'ns' : 'ew';
      const headType = move === 'through' ? axisHead : 'turn';
      stops.push({ s: sStop, ix, iy, headType, axisHead, move });

      let ex, ey;
      if (dir === 'E') { ex = cx - CFG.HALF; ey = cy + off; }
      else if (dir === 'W') { ex = cx + CFG.HALF; ey = cy - off; }
      else if (dir === 'N') { ex = cx + off; ey = cy + CFG.HALF; }
      else { ex = cx - off; ey = cy - CFG.HALF; }
      add(ex, ey);

      if (move === 'through') {
        let tx, ty;
        if (dir === 'E') { tx = cx + CFG.HALF; ty = cy + off; }
        else if (dir === 'W') { tx = cx - CFG.HALF; ty = cy - off; }
        else if (dir === 'N') { tx = cx + off; ty = cy - CFG.HALF; }
        else { tx = cx - off; ty = cy + CFG.HALF; }
        add(tx, ty);
        x = tx; y = ty;
      } else {
        const nd = move === 'left' ? LEFT_OF[dir] : RIGHT_OF[dir];
        let tx, ty;
        if (nd === 'E') { tx = cx + CFG.HALF; ty = cy + off; }
        else if (nd === 'W') { tx = cx - CFG.HALF; ty = cy - off; }
        else if (nd === 'N') { tx = cx + off; ty = cy - CFG.HALF; }
        else { tx = cx - off; ty = cy + CFG.HALF; }

        const newAxis = (nd === 'E' || nd === 'W') ? 'H' : 'V';
        let cpx, cpy;
        if (newAxis === 'V') { cpx = laneX(nd, cx, off); cpy = ey; }
        else { cpx = ex; cpy = laneY(nd, cy, off); }

        const N = 8;
        for (let i = 1; i <= N; i++) {
          const t = i / N, u = 1 - t;
          add(u * u * ex + 2 * u * t * cpx + t * t * tx,
              u * u * ey + 2 * u * t * cpy + t * t * ty);
        }

        x = tx; y = ty;
        axis = newAxis;
        roadIdx = newAxis === 'H' ? iy : ix;
        dir = nd;
      }
    }

    return this.finishRoute(pts, stops, dir);
  }
};
