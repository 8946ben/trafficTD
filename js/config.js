'use strict';

/* ============================================================
   全局配置：地图尺寸、道路断面、车辆参数、关卡数据
   单位约定：坐标与长度均为屏幕像素；1 像素 ≈ 0.34 米
   ============================================================ */

const CFG = {
  W: 1000,
  H: 760,

  COLS: 3,
  ROWS: 3,
  SX: 300,          // 路口横向间距
  SY: 240,          // 路口纵向间距
  MX: 200,          // 首个路口距左边缘
  MY: 140,          // 首个路口距上边缘

  CAR_W: 15,        // 单条机动车道宽
  BIKE_W: 10,       // 非机动车道宽
  CURB: 2,          // 路缘石
  WALK_W: 8,        // 人行道宽
  CROSS_W: 10,      // 斑马线带宽度
  STOP_EXTRA: 3,    // 停止线到斑马线外侧的余量

  CAR_LEN: 17,
  CAR_BODY_W: 9,
  BIKE_LEN: 11,

  SPEED: {
    car:  { max: 34, acc: 55, dec: 110, plan: 42 },
    bike: { max: 21, acc: 50, dec: 100, plan: 34 },
    ped:  { max: 7.2 }
  },

  // 个体自由速度的离散程度（截断正态，均值 1，截断在 ±2.2σ）
  // 参考：行人步速 CV≈0.19（Weidmann 汇总的 1.34 m/s、SD 0.26）；
  // 城市机动车自由流速度 CV≈0.10；电动车/自行车 CV≈0.13
  SPEED_DIST: {
    car:  { sd: 0.10 },
    bike: { sd: 0.13 },
    ped:  { sd: 0.18 }
  },

  // 速度编辑面板的单位与范围（k：像素/秒 → 显示单位的换算系数）
  SPEED_UI: {
    car:  { unit: 'km/h', step: 1,   min: 24,  max: 54, k: 1.2 },
    bike: { unit: 'km/h', step: 1,   min: 12,  max: 36, k: 1.2 },
    ped:  { unit: 'm/s',  step: 0.1, min: 1.2, max: 3.4, k: 1 / 3 }
  },

  GREEN_MIN: 8,
  GREEN_MAX: 40,
  YELLOW: 3,
  SIGNAL_CYCLE: 60,

  // 新建灯头的默认配时（周期 60s 内的绿灯窗口）
  HEAD_DEFAULT: {
    ns: { green: 20, start: 0 },
    ew: { green: 20, start: 26 },
    turn: { green: 8, start: 49 },
    pedns: { green: 18, start: 0 },   // 南北向行人（横穿东西向道路）
    pedew: { green: 18, start: 26 },  // 东西向行人（横穿南北向道路）
    crossing: { green: 20, start: 0 }
  },

  SCORE: { wCar: 0.5, wBike: 0.25, wPed: 0.25, k: 1.6 }
};

// 道路断面（从道路中心线向外的偏移）
CFG.HALF     = CFG.CAR_W + CFG.BIKE_W + CFG.CURB + CFG.WALK_W;      // 35 半路幅
CFG.ASPHALT  = CFG.CAR_W + CFG.BIKE_W;                              // 25 车行道半宽
CFG.CAR_OFF  = CFG.CAR_W / 2;                                       // 7.5 机动车道中心
CFG.BIKE_OFF = CFG.CAR_W + CFG.BIKE_W / 2;                          // 20 非机动车道中心
CFG.WALK_OFF = CFG.CAR_W + CFG.BIKE_W + CFG.CURB + CFG.WALK_W / 2;  // 31 人行道中心
CFG.CROSS_OFF = CFG.HALF + CFG.CROSS_W / 2;                         // 40 斑马线中心
CFG.STOP_OFF  = CFG.HALF + CFG.CROSS_W + CFG.STOP_EXTRA;            // 48 停止线
CFG.XING_STOP = 14;                                                 // 路段过街口的停止线偏移

// 路口坐标
CFG.IX = Array.from({ length: CFG.COLS }, (_, i) => CFG.MX + i * CFG.SX);
CFG.IY = Array.from({ length: CFG.ROWS }, (_, j) => CFG.MY + j * CFG.SY);

const COL_NAMES = ['A', 'B', 'C'];

const LEVELS = [
  {
    // 第一关：一条东西向街道，两个路段过街口
    layout: 'single',
    name: '一条街',
    brief: '只有一条东西向街道和两个过街口，先让车辆与行人都不久等。',
    duration: 90,
    roadY: 400,
    crossings: [335, 665],
    pop: { car: 10, bike: 6, ped: 16 },
    gap: { car: 0.9, bike: 1.5, ped: 0.8 },
    // 单街道关卡里：ns = 行人过街相位，ew = 车辆通行相位
    init: { ns: 20, ew: 10 },
    weights: { E: 1, W: 1 },
    seed: 20260101
  },
  {
    layout: 'grid',
    name: '午间街区',
    brief: '九个路口组成街区，先摸清信号周期与排队的关系。',
    duration: 120,
    pop: { car: 20, bike: 14, ped: 22 },
    gap: { car: 0.5, bike: 0.9, ped: 1.2 },
    init: { ns: 26, ew: 16 },
    weights: { E: 1, W: 1, N: 1, S: 1 },
    seed: 20260101
  },
  {
    layout: 'grid',
    name: '晚高峰',
    brief: '东西向通勤潮汐明显，试着让相邻路口的绿灯接上。',
    duration: 150,
    pop: { car: 32, bike: 22, ped: 30 },
    gap: { car: 0.4, bike: 0.7, ped: 1.0 },
    init: { ns: 30, ew: 14 },
    weights: { E: 3, W: 2, N: 1, S: 1 },
    seed: 20260202
  },
  {
    layout: 'grid',
    name: '城市枢纽',
    brief: '四向车流对撞、行人穿行频繁，考验配时与相位差。',
    duration: 180,
    pop: { car: 46, bike: 30, ped: 38 },
    gap: { car: 0.35, bike: 0.6, ped: 0.9 },
    init: { ns: 30, ew: 12 },
    weights: { E: 2, W: 1.6, N: 1.5, S: 1.5 },
    seed: 20260303
  }
];
