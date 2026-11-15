'use strict';

/* ============================================================
   交通参与者
   Vehicle : 沿路线行驶，可在路口转向；跟驰 + 灯头
   Ped     : 沿人行道行走，过街时查看对应的行人灯
   ============================================================ */

const CAR_COLORS = ['#e6b455', '#6fa8dc', '#df7f7c', '#8fcf9f', '#b3a1d8', '#7fd0cb', '#e8e3da', '#9aa9b8'];

function normalSample() {
  let u = 0, v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

/* 每个个体从截断正态抽一个自由速度系数，±2.2σ 截断 */
function sampleSpeedFactor(sd) {
  if (sd <= 0.001) return 1;
  const lo = Math.max(0.4, 1 - 2.2 * sd);
  const hi = Math.min(1.7, 1 + 2.2 * sd);
  for (let i = 0; i < 4; i++) {
    const f = 1 + normalSample() * sd;
    if (f >= lo && f <= hi) return f;
  }
  return 1;
}

class Vehicle {
  constructor(kind, route, profile) {
    this.kind = kind;
    this.route = route;
    this.base = profile.base;
    this.speedFactor = sampleSpeedFactor(profile.sd);
    this.s = 0;
    this.v = 0;
    this.wait = 0;
    this.stopIdx = 0;
    this.len = kind === 'car' ? CFG.CAR_LEN : CFG.BIKE_LEN;
    this.done = false;
    this.color = CAR_COLORS[Math.floor(Math.random() * CAR_COLORS.length)];
    this.aid = 0;
    this._seg = 0;
    this.isTurning = false;
  }

  pos() {
    const r = this.route;
    const s = Math.max(0, Math.min(this.s, r.length));
    let i = Math.min(this._seg, r.cum.length - 2);
    while (i < r.cum.length - 2 && s > r.cum[i + 1]) i++;
    while (i > 0 && s < r.cum[i]) i--;
    this._seg = i;
    const a = r.pts[i], b = r.pts[i + 1];
    const seg = r.cum[i + 1] - r.cum[i] || 1;
    const t = (s - r.cum[i]) / seg;
    return {
      x: a[0] + (b[0] - a[0]) * t,
      y: a[1] + (b[1] - a[1]) * t,
      angle: Math.atan2(b[1] - a[1], b[0] - a[0])
    };
  }

  update(dt, game) {
    const sp = CFG.SPEED[this.kind];
    let target = this.base * this.speedFactor;

    // 跟驰：几何前车检测
    const gap = game.leaderGap(this);
    if (gap < Infinity) {
      target = Math.min(target, Math.max(0, (gap - 4) * 1.7));
    }

    // 灯头
    const stops = this.route.stops;
    while (this.stopIdx < stops.length &&
           this.s > stops[this.stopIdx].s - this.len / 2 + 2) {
      this.stopIdx++;
    }
    const passed = stops[this.stopIdx - 1];
    this.isTurning = !!(passed && (passed.move === 'left' || passed.move === 'right') &&
      this.s < passed.s + 60);

    const stop = stops[this.stopIdx];
    if (stop) {
      const head = game.headForStop(stop);
      if (head) {
        const ph = head.phase(game.time);
        const d = (stop.s - this.len / 2) - this.s;
        let mustStop;
        if (head.kind === 'crossing') {
          mustStop = ph !== 'red';
        } else {
          mustStop = ph === 'red' || (ph === 'yellow' && d > 16);
        }
        if (mustStop) {
          if (d > 0) {
            target = Math.min(target, Math.sqrt(Math.max(0, 2 * sp.plan * (d - 1))));
          } else {
            target = 0;
          }
        }
      }
    }

    if (target < this.v) this.v = Math.max(target, this.v - sp.dec * dt);
    else this.v = Math.min(target, this.v + sp.acc * dt);
    this.s += this.v * dt;

    if (this.v < 1.2) this.wait += dt;
    if (this.s >= this.route.length) this.done = true;
  }
}

class Ped {
  constructor(route, startLeg, startD, profile) {
    this.route = route;
    this.legIdx = startLeg || 0;
    this.d = startD || 0;
    this.base = profile.base;
    this.wait = 0;
    this.waiting = false;
    this.committed = false;
    this.done = false;
    this.hue = Math.floor(Math.random() * 4);
    this.aid = 0;
    this.speedFactor = sampleSpeedFactor(profile.sd);
    this.speed = this.base * this.speedFactor;
  }

  canCross(leg, game) {
    const head = game.headForPed(leg.loc);
    if (!head) return true;              // 没装灯：自由通行
    if (head.phase(game.time) !== 'green') return false;
    const needTime = leg.crossLen / this.speed + 1.2;
    return head.remaining(game.time) >= needTime;
  }

  update(dt, game) {
    if (this.done) return;
    const legs = this.route.legs;
    if (this.legIdx >= legs.length) { this.done = true; return; }

    let move = this.speed * dt;
    let guard = 0;

    while (move > 0 && guard++ < 8) {
      if (this.legIdx >= legs.length) { this.done = true; return; }
      const leg = legs[this.legIdx];

      if (leg.kind === 'cross' && !this.committed) {
        if (!this.canCross(leg, game)) {
          this.waiting = true;
          this.wait += dt;
          return;
        }
        this.committed = true;
        this.waiting = false;
      }

      const left = leg.len - this.d;
      if (move < left) {
        this.d += move;
        return;
      }
      move -= left;
      this.legIdx++;
      this.d = 0;
      this.committed = false;
    }
  }

  pos() {
    const legs = this.route.legs;
    const idx = Math.min(this.legIdx, legs.length - 1);
    if (this.legIdx >= legs.length) {
      const p = legs[idx].pts[legs[idx].pts.length - 1];
      return { x: p[0], y: p[1] };
    }
    return legPointAt(legs[idx], this.d);
  }
}
