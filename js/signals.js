'use strict';

/* ============================================================
   信号灯头（SignalHead）
   - 每个灯头只控制一种流向：纵向直行 / 横向直行 / 转向 / 行人
   - 独立配时：固定 60s 周期，可设绿灯时长与起始时刻
   - 绿灯窗口末 3 秒为黄灯
   ============================================================ */

class SignalHead {
  constructor(def) {
    this.id = def.id;
    this.kind = def.kind;          // 'vehicle' | 'ped' | 'crossing'
    this.move = def.move;          // 'ns' | 'ew' | 'turn' | 'ped' | 'crossing'
    this.loc = def.loc;            // {type:'i',ix,iy} | {type:'c',i}
    this.anchorX = def.anchorX;
    this.anchorY = def.anchorY;
    this.badgeX = def.badgeX || 0;
    this.badgeY = def.badgeY || 0;
    this.hitX = def.hitX || 0;
    this.hitY = def.hitY || 0;
    this.hitR = def.hitR || 16;
    this.green = def.green;
    this.start = def.start;
    this.label = def.label;
    this.cycle = 60;
    this.yellow = 3;
  }

  local(t) {
    return (((t - this.start) % this.cycle) + this.cycle) % this.cycle;
  }

  phase(t) {
    const l = this.local(t);
    if (l < this.green) return 'green';
    if (l < this.green + this.yellow) return 'yellow';
    return 'red';
  }

  remaining(t) {
    const l = this.local(t);
    if (l < this.green) return this.green - l;
    if (l < this.green + this.yellow) return this.green + this.yellow - l;
    return 0;
  }
}
