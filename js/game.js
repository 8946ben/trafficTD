'use strict';

/* ============================================================
   游戏主程序
   - 信号灯头由玩家在路口建造，每个灯头独立配时（60s 周期）
   - 配时面板是地图内浮窗，不再放在右侧栏
   - 无灯方向自由通行；冲突会扣分
   ============================================================ */

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
canvas.width = CFG.W * DPR;
canvas.height = CFG.H * DPR;
ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

const $ = (id) => document.getElementById(id);

const els = {
  stage: $('stage'),
  levelName: $('levelName'),
  timeFill: $('timeFill'),
  timeLeft: $('timeLeft'),
  btnPause: $('btnPause'),
  speedGroup: $('speedGroup'),
  btnRestart: $('btnRestart'),
  gradeTag: $('gradeTag'),
  scoreValue: $('scoreValue'),
  avgWait: $('avgWait'),
  carWait: $('carWait'), carDone: $('carDone'),
  bikeWait: $('bikeWait'), bikeDone: $('bikeDone'),
  pedWait: $('pedWait'), pedDone: $('pedDone'),
  conflictVal: $('conflictVal'),
  speedTabs: $('speedTabs'), speedChart: $('speedChart'),
  speedMeanTxt: $('speedMeanTxt'), speedUnit: $('speedUnit'), speedSdTxt: $('speedSdTxt'),
  speedActiveTxt: $('speedActiveTxt'), speedMeanVal: $('speedMeanVal'),
  speedMeanUnit: $('speedMeanUnit'), speedSdVal: $('speedSdVal'),
  tipList: $('tipList'),
  hint: $('hint'),
  toast: $('toast'),
  modal: $('modal'),
  modalCard: $('modalCard'),
  buildBtn: $('buildBtn'),
  startCta: $('startCta'),
  buildPop: $('buildPop'),
  bpTitle: $('bpTitle'),
  bpGrid: $('bpGrid'),
  bpClose: $('bpClose'),
  headPanel: $('headPanel'),
  hpTitle: $('hpTitle'),
  hpPhase: $('hpPhase'),
  hpCycle: $('hpCycle'),
  hpBar: $('hpBar'),
  hpGreen: $('hpGreen'),
  hpStart: $('hpStart'),
  hpNote: $('hpNote'),
  hpRemove: $('hpRemove'),
  hpClose: $('hpClose')
};

const MOVE_ORDER = ['ns', 'ew', 'turn', 'pedns', 'pedew', 'crossing'];
const MOVE_NAME = {
  ns: '南北直行', ew: '东西直行', turn: '转向（左/右）',
  pedns: '行人 · 南北向', pedew: '行人 · 东西向', crossing: '行人过街'
};

const game = {
  time: 0,
  state: 'menu',          // menu | build | playing | paused | ended
  levelIndex: 0,
  speed: 1,
  signals: [],
  selectedHead: null,
  hoverHead: null,
  buildMode: false,
  buildSite: null,
  vehicles: [],
  peds: [],
  stats: { car: { done: 0, wait: 0 }, bike: { done: 0, wait: 0 }, ped: { done: 0, wait: 0 } },
  spawn: { car: 1.2, bike: 1.6, ped: 2.0 },
  conflicts: 0,
  conflictSeen: new Map(),
  conflictAcc: 0,
  agentSeq: 0,
  headSeq: 0,
  staticMap: null,
  score: 0,
  weightedWait: 0,
  cache: null,
  scoreAcc: 0,
  uiAcc: 0,
  speedTab: 'car',
  speedProfile: null,

  get level() { return LEVELS[this.levelIndex]; },

  /* ---------------- 信号灯头 ---------------- */
  headsAt(ix, iy) {
    return this.signals
      .filter(h => h.loc.type === 'i' && h.loc.ix === ix && h.loc.iy === iy)
      .sort((a, b) => MOVE_ORDER.indexOf(a.move) - MOVE_ORDER.indexOf(b.move));
  },

  headsAtCrossing(i) {
    return this.signals.filter(h => h.loc.type === 'c' && h.loc.i === i);
  },

  headAt(ix, iy, move) {
    return this.signals.find(h => h.loc.type === 'i' && h.loc.ix === ix && h.loc.iy === iy && h.move === move) || null;
  },

  headForStop(stop) {
    if (stop.headType === 'crossing') return this.headsAtCrossing(stop.ci)[0] || null;
    let h = this.headAt(stop.ix, stop.iy, stop.headType);
    if (!h && stop.headType === 'turn') h = this.headAt(stop.ix, stop.iy, stop.axisHead);
    return h;
  },

  headForPed(loc) {
    if (!loc) return null;
    if (loc.type === 'c') return this.headsAtCrossing(loc.i)[0] || null;
    return this.headAt(loc.ix, loc.iy, loc.pedAxis === 'ew' ? 'pedew' : 'pedns');
  },

  layoutHeads() {
    for (const site of Network.buildSites) {
      if (site.kind === 'i') {
        const heads = this.headsAt(site.ix, site.iy);
        const total = heads.length * 28;
        heads.forEach((h, idx) => {
          h.badgeX = site.x - total / 2 + idx * 28 + 2;
          h.badgeY = site.y - CFG.HALF - 54;
          h.hitX = h.badgeX + 12;
          h.hitY = h.badgeY + 17;
          h.hitR = 15;
        });
      } else {
        const h = this.headsAtCrossing(site.i)[0];
        if (h) {
          h.badgeX = site.x + 12;
          h.badgeY = site.y - CFG.HALF - 56;
          h.hitX = h.badgeX + 12;
          h.hitY = h.badgeY + 17;
          h.hitR = 16;
        }
      }
    }
  },

  buildHead(site, move) {
    const d = this.defaultTiming(site, move);
    const loc = site.kind === 'i'
      ? { type: 'i', ix: site.ix, iy: site.iy }
      : { type: 'c', i: site.i };
    const head = new SignalHead({
      id: 'h' + (++this.headSeq),
      kind: move === 'crossing' ? 'crossing' : move.startsWith('ped') ? 'ped' : 'vehicle',
      move, loc,
      anchorX: site.x, anchorY: site.y,
      green: d.green,
      start: d.start,
      label: ({ ns: '纵', ew: '横', turn: '转', pedns: '人纵', pedew: '人横', crossing: '人' })[move]
    });
    this.signals.push(head);
    this.layoutHeads();
    return head;
  },

  /* 新建灯头的默认配时：同一路口内相位固定，整列按 ix 错开形成东西向绿波 */
  defaultTiming(site, move) {
    const d = CFG.HEAD_DEFAULT[move];
    if (site.kind !== 'i') return { green: d.green, start: d.start };
    const off = (site.ix * 9) % 60;
    if (move === 'ns' || move === 'pedns') return { green: d.green, start: off };
    if (move === 'ew' || move === 'pedew') return { green: d.green, start: (off + 26) % 60 };
    if (move === 'turn') return { green: d.green, start: (off + 49) % 60 };
    return { green: d.green, start: d.start };
  },

  removeHead(id) {
    const idx = this.signals.findIndex(h => h.id === id);
    if (idx < 0) return;
    this.signals.splice(idx, 1);
    if (this.selectedHead === id) this.selectedHead = null;
    this.layoutHeads();
  },

  /* ---------------- 关卡 ---------------- */
  reset(i, state) {
    const lv = LEVELS[i];
    this.levelIndex = i;
    this.time = 0;
    this.state = state || 'build';
    this.vehicles = [];
    this.peds = [];
    this.stats = { car: { done: 0, wait: 0 }, bike: { done: 0, wait: 0 }, ped: { done: 0, wait: 0 } };
    this.spawn = { car: 1.0, bike: 1.4, ped: 1.8 };
    this.conflicts = 0;
    this.conflictSeen = new Map();
    this.conflictAcc = 0;
    this.agentSeq = 0;
    this.headSeq = 0;
    this.signals = [];
    this.selectedHead = null;
    this.hoverHead = null;
    this.buildMode = false;
    this.buildSite = null;
    this.score = 0;
    this.weightedWait = 0;
    this.cache = null;
    this.scoreAcc = 0;
    this.speedProfile = {
      car: { base: CFG.SPEED.car.max, sd: CFG.SPEED_DIST.car.sd },
      bike: { base: CFG.SPEED.bike.max, sd: CFG.SPEED_DIST.bike.sd },
      ped: { base: CFG.SPEED.ped.max, sd: CFG.SPEED_DIST.ped.sd }
    };

    Network.init(lv);
    this.staticMap = buildStaticMap();
    this.layoutHeads();

    els.levelName.textContent = `第 ${i + 1} 关 · ${lv.name}`;
    els.buildBtn.classList.remove('on');
    els.buildPop.classList.add('hidden');
    els.headPanel.classList.add('hidden');
    els.startCta.classList.toggle('hidden', this.state !== 'build');
    els.btnPause.textContent = this.state === 'build' ? '开始' : '暂停';
    updateUI(true);
  },

  startRun() {
    if (this.state !== 'build') return;
    this.state = 'playing';
    els.startCta.classList.add('hidden');
    this.buildMode = false;
    els.buildBtn.classList.remove('on');
    els.headPanel.classList.add('hidden');
    this.selectedHead = null;
    els.hint.textContent = '点击信号灯打开配时浮窗';
    els.hint.classList.remove('hide');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(hideHint, 7000);
    updateUI(true);
  },

  /* ---------------- 生成 ---------------- */
  countActive(kind) {
    if (kind === 'ped') return this.peds.length;
    let n = 0;
    for (const v of this.vehicles) if (v.kind === kind) n++;
    return n;
  },

  trySpawnVehicle(kind) {
    const lv = this.level;
    if (this.countActive(kind) >= lv.pop[kind]) return false;
    for (let attempt = 0; attempt < 6; attempt++) {
      const route = Network.makeRoute(kind, lv);
      const p0 = route.pts[0];
      let clear = true;
      for (const v of this.vehicles) {
        const q = v.pos();
        if (Math.hypot(q.x - p0[0], q.y - p0[1]) < 34) { clear = false; break; }
      }
      if (!clear) continue;
      const v = new Vehicle(kind, route, this.speedProfile[kind]);
      v.aid = ++this.agentSeq;
      this.vehicles.push(v);
      return true;
    }
    return false;
  },

  trySpawnPed() {
    const lv = this.level;
    if (this.peds.length >= lv.pop.ped) return false;
    const routes = Network.pedRoutes;
    const single = Network.layout === 'single';
    for (let attempt = 0; attempt < 8; attempt++) {
      const route = routes[(Math.random() * routes.length) | 0];
      const walkLegs = [];
      for (let i = 0; i < route.legs.length; i++) {
        const leg = route.legs[i];
        if (leg.kind !== 'walk' || leg.len <= 30) continue;
        if (single ? i === 0 : i > 0) walkLegs.push(i);
      }
      const startLeg = walkLegs.length ? walkLegs[(Math.random() * walkLegs.length) | 0] : 0;
      const leg = route.legs[startLeg];
      const startD = Math.random() * Math.min(Math.max(0, leg.len - 26), single ? 210 : 160);
      const start = legPointAt(leg, startD);
      let clear = true;
      for (const p of this.peds) {
        const q = p.pos();
        if (Math.hypot(q.x - start.x, q.y - start.y) < 26) { clear = false; break; }
      }
      if (!clear) continue;
      const p = new Ped(route, startLeg, startD, this.speedProfile.ped);
      p.aid = ++this.agentSeq;
      this.peds.push(p);
      return true;
    }
    return false;
  },

  leaderGap(v) {
    const p = v.pos();
    const fx = Math.cos(p.angle), fy = Math.sin(p.angle);
    let best = Infinity;
    for (const o of this.vehicles) {
      if (o === v) continue;
      const q = o.pos();
      const dx = q.x - p.x, dy = q.y - p.y;
      const along = dx * fx + dy * fy;
      if (along <= 0 || along > 72) continue;
      const lat = Math.abs(-dx * fy + dy * fx);
      if (lat > 8.5) continue;
      const da = Math.atan2(Math.sin(q.angle - p.angle), Math.cos(q.angle - p.angle));
      if (Math.abs(da) > 0.6) continue;
      const g = along - (v.len + o.len) / 2;
      if (g < best) best = g;
    }
    return best;
  },

  applySpeed(kind) {
    const prof = this.speedProfile[kind];
    if (kind === 'ped') {
      for (const p of this.peds) {
        p.base = prof.base;
        p.speedFactor = sampleSpeedFactor(prof.sd);
        p.speed = p.base * p.speedFactor;
      }
      return;
    }
    for (const v of this.vehicles) {
      if (v.kind !== kind) continue;
      v.base = prof.base;
      v.speedFactor = sampleSpeedFactor(prof.sd);
    }
  },

  /* ---------------- 仿真 ---------------- */
  liveStats() {
    const out = {};
    for (const k of ['car', 'bike', 'ped']) {
      const s = this.stats[k];
      let sum = s.wait, count = s.done;
      if (k === 'ped') {
        for (const p of this.peds) { sum += p.wait; count++; }
      } else {
        for (const v of this.vehicles) if (v.kind === k) { sum += v.wait; count++; }
      }
      out[k] = { avg: count ? sum / count : 0, sum, count, done: s.done };
    }
    return out;
  },

  refreshScore() {
    const st = this.liveStats();
    this.cache = st;
    const w = CFG.SCORE.wCar * st.car.avg
            + CFG.SCORE.wBike * st.bike.avg
            + CFG.SCORE.wPed * st.ped.avg;
    this.weightedWait = w;
    this.score = Math.max(0, Math.min(100, 100 - w * CFG.SCORE.k - this.conflicts * 5));
  },

  updateConflicts() {
    const vehicles = this.vehicles;
    const now = this.time;
    for (let i = 0; i < vehicles.length; i++) {
      const a = vehicles[i];
      const pa = a.pos();
      for (let j = i + 1; j < vehicles.length; j++) {
        const b = vehicles[j];
        const pb = b.pos();
        if (Math.hypot(pa.x - pb.x, pa.y - pb.y) > 12) continue;
        if (a.isTurning && b.isTurning) continue;
        const diff = Math.abs(Math.atan2(Math.sin(pb.angle - pa.angle), Math.cos(pb.angle - pa.angle)));
        if (diff < 0.7) continue;
        const key = a.aid + ':' + b.aid;
        if (now - (this.conflictSeen.get(key) || -99) < 2.5) continue;
        this.conflictSeen.set(key, now);
        this.conflicts++;
      }
    }
    for (const p of this.peds) {
      const pp = p.pos();
      for (const v of vehicles) {
        const q = v.pos();
        if (Math.hypot(pp.x - q.x, pp.y - q.y) > 9) continue;
        const key = 'p' + p.aid + ':' + v.aid;
        if (now - (this.conflictSeen.get(key) || -99) < 2.5) continue;
        this.conflictSeen.set(key, now);
        this.conflicts++;
      }
    }
  },

  step(dt) {
    if (this.state !== 'playing') return;
    this.time += dt;

    for (const kind of ['car', 'bike', 'ped']) {
      this.spawn[kind] -= dt;
      if (this.spawn[kind] <= 0) {
        const ok = kind === 'ped' ? this.trySpawnPed() : this.trySpawnVehicle(kind);
        this.spawn[kind] = ok ? this.level.gap[kind] * (0.65 + Math.random() * 0.75) : 0.25;
      }
    }

    for (const v of this.vehicles) v.update(dt, this);
    for (const p of this.peds) p.update(dt, this);

    for (let i = this.vehicles.length - 1; i >= 0; i--) {
      const v = this.vehicles[i];
      if (!v.done) continue;
      this.stats[v.kind].done++;
      this.stats[v.kind].wait += v.wait;
      this.vehicles.splice(i, 1);
    }

    for (let i = this.peds.length - 1; i >= 0; i--) {
      const p = this.peds[i];
      if (!p.done) continue;
      this.stats.ped.done++;
      this.stats.ped.wait += p.wait;
      this.peds.splice(i, 1);
    }

    this.conflictAcc += dt;
    if (this.conflictAcc >= 0.15) {
      this.conflictAcc = 0;
      this.updateConflicts();
    }

    this.scoreAcc += dt;
    if (this.scoreAcc >= 0.2) {
      this.scoreAcc = 0;
      this.refreshScore();
    }

    if (this.time >= this.level.duration) this.endLevel();
  },

  endLevel() {
    this.time = this.level.duration;
    this.state = 'ended';
    this.refreshScore();
    this.selectedHead = null;
    this.buildMode = false;
    els.headPanel.classList.add('hidden');
    els.buildPop.classList.add('hidden');
    els.buildBtn.classList.remove('on');
    showResult();
  }
};

/* ============================================================
   界面
   ============================================================ */

function fmtTime(sec) {
  const s = Math.max(0, Math.ceil(sec));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function gradeOf(score) {
  if (score >= 80) return 'S';
  if (score >= 70) return 'A';
  if (score >= 55) return 'B';
  return 'C';
}

function updateUI(force) {
  const lv = game.level;
  const remain = Math.max(0, lv.duration - game.time);
  els.timeLeft.textContent = fmtTime(remain);
  els.timeFill.style.width = Math.min(100, (game.time / lv.duration) * 100) + '%';

  const st = game.cache || game.liveStats();
  els.carWait.textContent = st.car.avg.toFixed(1);
  els.bikeWait.textContent = st.bike.avg.toFixed(1);
  els.pedWait.textContent = st.ped.avg.toFixed(1);
  els.carDone.textContent = `${st.car.done} 通过`;
  els.bikeDone.textContent = `${st.bike.done} 通过`;
  els.pedDone.textContent = `${st.ped.done} 通过`;
  els.conflictVal.textContent = game.conflicts;

  const totalCount = st.car.count + st.bike.count + st.ped.count;
  const showScore = game.state !== 'menu' && game.state !== 'build' && game.time >= 10 && totalCount > 0;
  const sc = Math.round(game.score);
  els.scoreValue.textContent = showScore ? sc : '--';
  const grade = showScore ? gradeOf(sc) : null;
  els.gradeTag.textContent = grade || '—';
  els.gradeTag.className = 'grade' + (grade ? ' ' + grade.toLowerCase() : '');
  els.avgWait.textContent = showScore ? game.weightedWait.toFixed(1) : '—';

  els.buildBtn.classList.toggle('hidden', game.state === 'menu' || game.state === 'ended');
  els.buildBtn.classList.toggle('on', game.buildMode);
  els.startCta.classList.toggle('hidden', game.state !== 'build');
  els.btnPause.textContent = game.state === 'build' ? '开始' : game.state === 'paused' ? '继续' : '暂停';

  renderSpeedUI();
  updateHeadPanel();

  if (force) {
    els.levelName.textContent = `第 ${game.levelIndex + 1} 关 · ${lv.name}`;
    const tips = lv.layout === 'single'
      ? [
          '在过街口建造「行人过街」灯，车辆会在此期间停车。',
          '没有灯的位置自由通行，但人车交叠会记冲突并扣分。',
          '每个灯头独立计时：60 秒周期内安排绿灯窗口。'
        ]
      : [
          '先在路口建造灯头：南北直行、东西直行、转向、行人。',
          '每个灯头独立配时；冲突方向同时绿灯会产生冲突扣分。',
          '没有灯头的方向自由通行，适合先观察车流再补灯。'
        ];
    els.tipList.innerHTML = tips.map(t => `<li>${t}</li>`).join('');
  }
}

/* ---------------- 速度面板 ---------------- */
const SPEED_COLORS = { car: '#6fa8dc', bike: '#35b9a6', ped: '#f08a3c' };

function drawSpeedChart() {
  const cv = els.speedChart;
  if (!cv || !game.speedProfile) return;
  const g = cv.getContext('2d');
  const W = 316, H = 74;
  g.setTransform(2, 0, 0, 2, 0, 0);
  g.clearRect(0, 0, W, H);

  const kind = game.speedTab;
  const prof = game.speedProfile[kind];
  const ui = CFG.SPEED_UI[kind];
  const color = SPEED_COLORS[kind];
  const mean = prof.base * ui.k;
  const sigma = mean * prof.sd;
  const span = prof.sd > 0.001 ? 2.2 * prof.sd : 0.12;
  const lo = mean * Math.max(0.4, 1 - span);
  const hi = mean * Math.min(1.7, 1 + span);

  const padL = 8, padR = 8, top = 10, baseY = H - 18;
  const plotW = W - padL - padR;
  const n = 18, bw = plotW / n;

  g.strokeStyle = 'rgba(120,145,160,.22)';
  g.lineWidth = 1;
  g.beginPath();
  g.moveTo(padL, baseY + 0.5);
  g.lineTo(W - padR, baseY + 0.5);
  g.stroke();

  const barH = baseY - top;
  let maxP = 0;
  const vals = [];
  for (let i = 0; i < n; i++) {
    const x = lo + (i + 0.5) * (hi - lo) / n;
    const p = sigma > 1e-6 ? Math.exp(-0.5 * ((x - mean) / sigma) ** 2) : 0;
    vals.push(p);
    if (p > maxP) maxP = p;
  }

  if (maxP < 1e-9) {
    g.fillStyle = color;
    g.fillRect(W / 2 - 5, top, 10, barH);
  } else {
    for (let i = 0; i < n; i++) {
      const h = (vals[i] / maxP) * barH;
      g.fillStyle = color;
      g.globalAlpha = 0.5 + 0.5 * (vals[i] / maxP);
      g.fillRect(padL + i * bw + 1.5, baseY - h, Math.max(2, bw - 3), h);
    }
    g.globalAlpha = 1;
  }

  const mx = padL + ((mean - lo) / (hi - lo)) * plotW;
  g.strokeStyle = 'rgba(255,255,255,.5)';
  g.setLineDash([3, 3]);
  g.beginPath();
  g.moveTo(mx, top - 2);
  g.lineTo(mx, baseY);
  g.stroke();
  g.setLineDash([]);

  const dec = ui.unit === 'm/s' ? 1 : 0;
  g.font = '9px "Segoe UI", sans-serif';
  g.fillStyle = '#6f8492';
  g.textAlign = 'left';
  g.fillText(lo.toFixed(dec), padL, H - 5);
  g.textAlign = 'right';
  g.fillText(hi.toFixed(dec), W - padR, H - 5);
  g.textAlign = 'center';
  g.fillStyle = '#a9bcc9';
  g.fillText(mean.toFixed(dec), mx, H - 5);
  g.textAlign = 'start';
}

function renderSpeedUI() {
  if (!game.speedProfile || !els.speedTabs) return;
  const kind = game.speedTab;
  const prof = game.speedProfile[kind];
  const ui = CFG.SPEED_UI[kind];
  const disp = prof.base * ui.k;
  const active = kind === 'ped'
    ? game.peds.length
    : game.vehicles.filter(v => v.kind === kind).length;

  els.speedMeanVal.textContent = disp.toFixed(1);
  els.speedMeanUnit.textContent = ui.unit;
  els.speedMeanTxt.textContent = disp.toFixed(1);
  els.speedUnit.textContent = ui.unit;
  els.speedSdVal.textContent = Math.round(prof.sd * 100);
  els.speedSdTxt.textContent = Math.round(prof.sd * 100);
  els.speedActiveTxt.textContent = active;
  els.speedTabs.querySelectorAll('button')
    .forEach(b => b.classList.toggle('on', b.dataset.type === kind));
  drawSpeedChart();
}

/* ---------------- 灯头浮窗 ---------------- */
function headTitle(h) {
  const site = h.loc.type === 'i'
    ? `${COL_NAMES[h.loc.ix]}${h.loc.iy + 1} 路口`
    : `过街口 ${h.loc.i + 1}`;
  return `${site} · ${MOVE_NAME[h.move] || ''}`;
}

function phaseText(h) {
  const ph = h.phase(game.time);
  const rem = Math.ceil(h.remaining(game.time));
  if (h.kind === 'crossing') {
    if (ph === 'green') return `行人通行 ${rem}s`;
    if (ph === 'yellow') return `行人清空 ${rem}s`;
    return '车辆通行';
  }
  if (ph === 'green') return `绿灯 ${rem}s`;
  if (ph === 'yellow') return `黄灯 ${rem}s`;
  return '红灯';
}

function drawHpBar(h) {
  const cv = els.hpBar;
  if (!cv) return;
  const g = cv.getContext('2d');
  const W = 236, H = 18;
  g.setTransform(2, 0, 0, 2, 0, 0);
  g.clearRect(0, 0, W, H);
  g.fillStyle = '#101820';
  g.fillRect(0, 0, W, H);

  const seg = (a, b, color) => {
    a = ((a % 60) + 60) % 60;
    b = ((b % 60) + 60) % 60;
    if (b <= a) {
      g.fillStyle = color;
      g.fillRect(a / 60 * W, 0, W - a / 60 * W, H);
      g.fillRect(0, 0, b / 60 * W, H);
    } else {
      g.fillStyle = color;
      g.fillRect(a / 60 * W, 0, (b - a) / 60 * W, H);
    }
  };

  seg(h.start, h.start + h.green, LIGHT.green);
  seg(h.start + h.green, h.start + h.green + h.yellow, LIGHT.yellow);

  const now = ((game.time % 60) + 60) % 60;
  g.fillStyle = 'rgba(255,255,255,.9)';
  g.fillRect(now / 60 * W - 1, 0, 2, H);
}

function positionHeadPanel(h) {
  const rect = canvas.getBoundingClientRect();
  const stage = els.stage.getBoundingClientRect();
  if (!rect.width) return;
  const x = rect.left - stage.left + (h.badgeX / CFG.W) * rect.width;
  const y = rect.top - stage.top + (h.badgeY / CFG.H) * rect.height;
  const pw = els.headPanel.offsetWidth || 250;
  const ph = els.headPanel.offsetHeight || 210;

  let left = x + 28;
  if (left + pw > stage.width - 10) left = x - pw - 28;
  let top = y + 34;
  top = Math.max(10, Math.min(stage.height - ph - 10, top));

  els.headPanel.style.left = Math.max(8, left) + 'px';
  els.headPanel.style.top = top + 'px';
}

function updateHeadPanel() {
  const h = game.signals.find(x => x.id === game.selectedHead);
  if (!h || game.state === 'menu' || game.state === 'ended') {
    els.headPanel.classList.add('hidden');
    return;
  }
  els.headPanel.classList.remove('hidden');
  els.hpTitle.textContent = headTitle(h);
  els.hpPhase.textContent = phaseText(h);
  els.hpCycle.textContent = '周期 60s';
  els.hpGreen.textContent = h.green;
  els.hpStart.textContent = h.start;
  els.hpNote.textContent = h.kind === 'crossing'
    ? '行人绿灯期间车辆停车，其余时间车辆通行。'
    : h.kind === 'ped'
      ? '行人过街约需 10 秒，绿灯要覆盖这个时间。'
      : '绿灯窗口末 3 秒为黄灯，其余时间红灯。';
  drawHpBar(h);
  positionHeadPanel(h);
}

/* ---------------- 建造浮窗 ---------------- */
function closeBuildPop() {
  game.buildSite = null;
  els.buildPop.classList.add('hidden');
}

function openBuildPop(site, clientX, clientY) {
  game.buildSite = site;
  els.bpTitle.textContent = site.name;

  const heads = site.kind === 'i' ? game.headsAt(site.ix, site.iy) : game.headsAtCrossing(site.i);
  const moves = site.kind === 'i' ? ['ns', 'ew', 'turn', 'pedns', 'pedew'] : ['crossing'];

  els.bpGrid.innerHTML = moves.map(m => {
    const built = heads.some(h => h.move === m);
    return `<button data-move="${m}" ${built ? 'disabled' : ''}>${MOVE_NAME[m]}${built ? ' · 已建' : ''}</button>`;
  }).join('') + (site.kind === 'i' ? '<button id="bpQuick" class="bp-quick">一键布齐（推荐）</button>' : '');

  els.bpGrid.querySelectorAll('button[data-move]').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.disabled) return;
      const h = game.buildHead(site, btn.dataset.move);
      closeBuildPop();
      game.selectedHead = h.id;
      updateUI();
    });
  });

  const quick = document.getElementById('bpQuick');
  if (quick) {
    quick.addEventListener('click', () => {
      let first = null;
      for (const m of moves) {
        if (heads.some(h => h.move === m)) continue;
        const h = game.buildHead(site, m);
        if (!first) first = h;
      }
      closeBuildPop();
      if (first) game.selectedHead = first.id;
      updateUI();
    });
  }

  const stage = els.stage.getBoundingClientRect();
  els.buildPop.classList.remove('hidden');
  const pw = els.buildPop.offsetWidth || 230;
  let left = clientX - stage.left + 14;
  if (left + pw > stage.width - 12) left = clientX - stage.left - pw - 14;
  const top = Math.max(10, Math.min(stage.height - 160, clientY - stage.top + 10));
  els.buildPop.style.left = Math.max(8, left) + 'px';
  els.buildPop.style.top = top + 'px';
}

/* ---------------- 交互 ---------------- */
function toMap(e) {
  const r = canvas.getBoundingClientRect();
  return {
    x: (e.clientX - r.left) * (CFG.W / r.width),
    y: (e.clientY - r.top) * (CFG.H / r.height)
  };
}

function hitHead(x, y) {
  for (const h of game.signals) {
    if (Math.hypot(x - h.hitX, y - h.hitY) <= h.hitR) return h;
  }
  return null;
}

function nearestBuildSite(x, y) {
  for (const site of Network.buildSites) {
    if (Math.hypot(x - site.x, y - site.y) <= (site.kind === 'i' ? 56 : 50)) return site;
  }
  return null;
}

function hideHint() {
  els.hint.classList.add('hide');
}

let toastTimer = null;
let hintTimer = null;

function showToast(html, ms) {
  els.toast.innerHTML = html;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), ms || 4600);
}

function startLevelUI() {
  els.hint.classList.remove('hide');
  els.hint.textContent = '先建造信号灯，再点「开始运营」';
  clearTimeout(hintTimer);
  hintTimer = setTimeout(hideHint, 12000);
  const lv = game.level;
  showToast(`<b>第 ${game.levelIndex + 1} 关 · ${lv.name}</b><br><span>${lv.brief}</span>`);
}

canvas.addEventListener('pointermove', (e) => {
  if (game.state === 'menu' || game.state === 'ended') return;
  const p = toMap(e);
  const h = hitHead(p.x, p.y);
  game.hoverHead = h ? h.id : null;
  canvas.style.cursor = h || (game.buildMode && nearestBuildSite(p.x, p.y)) ? 'pointer' : 'default';
});
canvas.addEventListener('pointerleave', () => { game.hoverHead = null; });

canvas.addEventListener('pointerdown', (e) => {
  if (game.state === 'menu' || game.state === 'ended') return;
  const p = toMap(e);

  if (game.buildMode) {
    const site = nearestBuildSite(p.x, p.y);
    if (site) {
      openBuildPop(site, e.clientX, e.clientY);
      return;
    }
  }

  const h = hitHead(p.x, p.y);
  if (h) {
    game.selectedHead = h.id;
    closeBuildPop();
    hideHint();
  } else {
    game.selectedHead = null;
    closeBuildPop();
  }
  updateUI();
});

els.buildBtn.addEventListener('click', () => {
  if (game.state === 'menu' || game.state === 'ended') return;
  game.buildMode = !game.buildMode;
  game.selectedHead = null;
  closeBuildPop();
  els.headPanel.classList.add('hidden');
  els.buildBtn.classList.toggle('on', game.buildMode);
  els.hint.textContent = game.buildMode
    ? '建造模式：点击路口 / 过街口添加灯头'
    : '点击信号灯打开配时浮窗';
  els.hint.classList.remove('hide');
  clearTimeout(hintTimer);
  hintTimer = setTimeout(hideHint, 8000);
});

els.startCta.addEventListener('click', () => game.startRun());

document.querySelectorAll('.hp-step').forEach(btn => {
  btn.addEventListener('click', () => {
    const h = game.signals.find(x => x.id === game.selectedHead);
    if (!h) return;
    const dir = parseInt(btn.dataset.dir, 10);
    if (btn.dataset.hp === 'green') {
      h.green = Math.max(CFG.GREEN_MIN, Math.min(CFG.GREEN_MAX, h.green + dir));
    } else {
      h.start = ((h.start + dir) % 60 + 60) % 60;
    }
    updateUI();
  });
});

els.hpRemove.addEventListener('click', () => {
  if (!game.selectedHead) return;
  game.removeHead(game.selectedHead);
  els.headPanel.classList.add('hidden');
  updateUI();
});

els.hpClose.addEventListener('click', () => {
  game.selectedHead = null;
  els.headPanel.classList.add('hidden');
});

els.bpClose.addEventListener('click', closeBuildPop);

els.speedTabs.querySelectorAll('button').forEach((b) => {
  b.addEventListener('click', () => {
    game.speedTab = b.dataset.type;
    renderSpeedUI();
  });
});

document.querySelectorAll('.step[data-spd]').forEach((btn) => {
  btn.addEventListener('click', () => {
    if (!game.speedProfile) return;
    const kind = game.speedTab;
    const prof = game.speedProfile[kind];
    const ui = CFG.SPEED_UI[kind];
    const dir = parseInt(btn.dataset.dir, 10);

    if (btn.dataset.spd === 'mean') {
      const disp = prof.base * ui.k + dir * ui.step;
      prof.base = Math.max(ui.min, Math.min(ui.max, disp)) / ui.k;
    } else {
      prof.sd = Math.max(0, Math.min(0.3, +(prof.sd + dir * 0.02).toFixed(2)));
    }
    game.applySpeed(kind);
    renderSpeedUI();
  });
});

els.btnPause.addEventListener('click', () => {
  if (game.state === 'build') {
    game.startRun();
  } else if (game.state === 'playing') {
    game.state = 'paused';
    els.btnPause.textContent = '继续';
  } else if (game.state === 'paused') {
    game.state = 'playing';
    els.btnPause.textContent = '暂停';
  }
});

els.btnRestart.addEventListener('click', () => {
  els.modal.classList.add('hidden');
  game.reset(game.levelIndex, 'build');
  startLevelUI();
});

els.speedGroup.querySelectorAll('button').forEach((btn) => {
  btn.addEventListener('click', () => {
    game.speed = parseInt(btn.dataset.speed, 10) || 1;
    els.speedGroup.querySelectorAll('button').forEach(b => b.classList.toggle('on', b === btn));
  });
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    els.btnPause.click();
  } else if (e.key === '1' || e.key === '2' || e.key === '3') {
    const btn = els.speedGroup.querySelector(`[data-speed="${e.key}"]`);
    if (btn) btn.click();
  }
});

window.addEventListener('resize', () => updateHeadPanel());

/* ---------------- 弹窗 ---------------- */
function showIntro() {
  els.modalCard.innerHTML = `
    <div class="eyebrow">TRAFFIC SIGNAL LAB</div>
    <h2>绿波城市</h2>
    <p class="sub">你是这座城市的交通规划师</p>
    <p class="intro-lead">
      这一版里，信号灯由你自己建造。在路口放置 <b>南北直行 / 东西直行 / 转向 / 行人</b> 灯头，
      用地图上的浮窗为每个灯头安排绿灯窗口；没有灯的方向自由通行，但车流交叠会记冲突并扣分。
    </p>
    <div class="intro-grid">
      <div class="intro-item"><h4>① 建造灯头</h4><p>先点「建造信号灯」，再点路口，选择要控制的流向。</p></div>
      <div class="intro-item"><h4>② 调整窗口</h4><p>点灯头打开浮窗，设置绿灯时长与 60 秒周期内的起始时刻。</p></div>
      <div class="intro-item"><h4>③ 开始运营</h4><p>建造完成后开始计时，结算时同时看等待与冲突。</p></div>
    </div>
    <button class="primary" id="btnStart">进入建造</button>
  `;
  $('btnStart').addEventListener('click', () => {
    els.modal.classList.add('hidden');
    game.state = 'build';
    els.startCta.classList.remove('hidden');
    els.btnPause.textContent = '开始';
    updateUI(true);
    startLevelUI();
  });
  els.modal.classList.remove('hidden');
}

function showResult() {
  const st = game.cache;
  const score = Math.round(game.score);
  const grade = gradeOf(score);
  const isLast = game.levelIndex >= LEVELS.length - 1;
  const lv = game.level;

  els.modalCard.innerHTML = `
    <div class="eyebrow">第 ${game.levelIndex + 1} 关 · ${lv.name} · 完成</div>
    <div class="result-top">
      <div class="grade-big ${grade.toLowerCase()}">${grade}</div>
      <div>
        <div class="result-score">${score}<span>分</span></div>
        <div class="result-meta">加权等待 ${game.weightedWait.toFixed(1)} 秒 · 冲突 ${game.conflicts} 次</div>
      </div>
    </div>
    <div class="result-list">
      <div class="result-row"><span class="dot car"></span><span class="rk">机动车</span>
        <span class="rv">${st.car.avg.toFixed(1)} s</span><span class="rc">${st.car.done} 辆通过</span></div>
      <div class="result-row"><span class="dot bike"></span><span class="rk">非机动车</span>
        <span class="rv">${st.bike.avg.toFixed(1)} s</span><span class="rc">${st.bike.done} 辆通过</span></div>
      <div class="result-row"><span class="dot ped"></span><span class="rk">行人</span>
        <span class="rv">${st.ped.avg.toFixed(1)} s</span><span class="rc">${st.ped.done} 人通过</span></div>
      <div class="result-row"><span class="dot conflict"></span><span class="rk">冲突</span>
        <span class="rv">${game.conflicts} 次</span><span class="rc">越少越好</span></div>
    </div>
    <p class="score-note">评分 = 100 − 1.6 ×（机动车等待 × 0.5 + 非机动车 × 0.25 + 行人 × 0.25）− 5 × 冲突次数。无灯方向虽然不等待，但交叠会重罚，装灯要能同时压住冲突与等待。</p>
    <div class="result-actions">
      <button class="ghost" id="btnAgain">重玩本关</button>
      <button class="primary" id="btnNext">${isLast ? '再玩一次' : '进入下一关'}</button>
    </div>
  `;

  $('btnAgain').addEventListener('click', () => {
    els.modal.classList.add('hidden');
    game.reset(game.levelIndex, 'build');
    startLevelUI();
  });
  $('btnNext').addEventListener('click', () => {
    els.modal.classList.add('hidden');
    game.reset(isLast ? 0 : game.levelIndex + 1, 'build');
    startLevelUI();
  });

  els.modal.classList.remove('hidden');
}

/* ============================================================
   主循环
   ============================================================ */
function drawPausedOverlay() {
  ctx.fillStyle = 'rgba(8,12,16,.42)';
  ctx.fillRect(0, 0, CFG.W, CFG.H);
  ctx.fillStyle = 'rgba(238,246,251,.95)';
  ctx.font = '600 26px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('已暂停', CFG.W / 2, CFG.H / 2);
  ctx.font = '400 12px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.fillStyle = 'rgba(190,210,222,.8)';
  ctx.fillText('按空格或点击“继续”恢复推演', CFG.W / 2, CFG.H / 2 + 24);
  ctx.textAlign = 'start';
}

function drawBuildOverlay() {
  ctx.fillStyle = 'rgba(8,16,22,.18)';
  ctx.fillRect(0, 0, CFG.W, CFG.H);
  ctx.fillStyle = 'rgba(226,242,250,.9)';
  ctx.font = '600 22px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('建造阶段', CFG.W / 2, 78);
  ctx.font = '400 12px "Segoe UI","Microsoft YaHei",sans-serif';
  ctx.fillStyle = 'rgba(170,200,215,.85)';
  ctx.fillText('点击路口建造灯头，完成后点「开始运营」', CFG.W / 2, 100);
  ctx.textAlign = 'start';
}

let last = performance.now();

function frame(now) {
  const raw = Math.min(0.05, (now - last) / 1000);
  last = now;

  if (game.state === 'playing') {
    for (let i = 0; i < game.speed; i++) game.step(raw);
  }

  drawScene(ctx, game);
  if (game.state === 'paused') drawPausedOverlay();
  if (game.state === 'build') drawBuildOverlay();

  game.uiAcc += raw;
  if (game.uiAcc >= 0.12) {
    game.uiAcc = 0;
    updateUI();
  }

  requestAnimationFrame(frame);
}

/* ---------------- 启动 ---------------- */
game.reset(0, 'menu');
game.refreshScore();
updateUI(true);
showIntro();
requestAnimationFrame(frame);

window.__game = game;
