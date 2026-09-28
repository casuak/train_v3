import type { FacilityKind, Item, RouteEdge, RouteNode, Work } from './types';
export const ITEM: Record<Item, { name: string; icon: string; color: string }> = {
  meal: { name: '口粮', icon: '◒', color: '#d8b56b' },
  raw: { name: '食材', icon: '♧', color: '#a8bc8d' },
  metal: { name: '废钢', icon: '◇', color: '#b2bbc3' },
  parts: { name: '零件', icon: '⚙', color: '#c5a882' },
  fuel: { name: '燃煤', icon: '◆', color: '#cdbbab' },
  medicine: { name: '药品', icon: '✚', color: '#9ac1b3' },
};
export const WORKS: Work[] = ['care', 'cook', 'craft', 'build', 'repair', 'haul'];
export const WORK_NAME: Record<Work, string> = {
  care: '医护',
  cook: '烹饪',
  craft: '制作',
  build: '建造',
  repair: '维修',
  haul: '搬运',
};
export const FACILITY: Record<
  FacilityKind,
  {
    name: string;
    tile: number;
    w: number;
    h: number;
    hp: number;
    cost: number;
    description: string;
    buildable: boolean;
  }
> = {
  bed: {
    name: '行军床',
    tile: 7,
    w: 1,
    h: 1,
    hp: 80,
    cost: 3,
    description: '休息恢复精力。每张床同时供一人使用。',
    buildable: true,
  },
  stove: {
    name: '燃煤炉灶',
    tile: 8,
    w: 2,
    h: 1,
    hp: 120,
    cost: 7,
    description: '将食材加工成热食。右键设置制作清单。',
    buildable: true,
  },
  bench: {
    name: '机械工作台',
    tile: 9,
    w: 2,
    h: 1,
    hp: 150,
    cost: 8,
    description: '将废钢加工成维修零件。右键设置制作清单。',
    buildable: true,
  },
  storage: {
    name: '物资储柜',
    tile: 10,
    w: 1,
    h: 1,
    hp: 110,
    cost: 3,
    description: '接受搬运与生产成品，汇集列车物资。',
    buildable: true,
  },
  heater: {
    name: '供暖器',
    tile: 11,
    w: 1,
    h: 1,
    hp: 100,
    cost: 5,
    description: '运行时消耗燃煤，提高车内温度。',
    buildable: true,
  },
  hatch: {
    name: '车顶舱门',
    tile: 13,
    w: 1,
    h: 1,
    hp: 110,
    cost: 0,
    description: '连接车内与车顶。敌人必须先破坏舱门。',
    buildable: false,
  },
  engine: {
    name: '动力机组',
    tile: 14,
    w: 1,
    h: 1,
    hp: 250,
    cost: 0,
    description: '列车的心脏。严重损坏时停止行驶。',
    buildable: false,
  },
  barricade: {
    name: '车顶掩体',
    tile: 10,
    w: 1,
    h: 1,
    hp: 150,
    cost: 4,
    description: '阻挡移动和射线，邻近防守者减伤。',
    buildable: true,
  },
};
export const RECIPE = {
  meal: {
    name: '热食',
    input: 'raw' as Item,
    inputQty: 2,
    output: 'meal' as Item,
    outputQty: 2,
    duration: 10,
  },
  parts: {
    name: '维修零件',
    input: 'metal' as Item,
    inputQty: 2,
    output: 'parts' as Item,
    outputQty: 1,
    duration: 15,
  },
};
export const NODES: RouteNode[] = [
  {
    id: 'depot',
    name: '霜河机务段',
    tag: '出发地',
    x: 76,
    y: 164,
    temp: 3,
    description: '最后一次整备已经结束。沿铁路向南，寻找温暖的白桦港。',
    reward: {},
  },
  {
    id: 'coal',
    name: '煤脊哨站',
    tag: '燃料 · 高风险',
    x: 239,
    y: 65,
    temp: -5,
    description: '山脊上的煤矿仍在运作，劫掠者也盘踞于此。',
    reward: { fuel: 35, metal: 5 },
    credits: 10,
  },
  {
    id: 'farm',
    name: '芦湾农场',
    tag: '食物 · 低风险',
    x: 237,
    y: 287,
    temp: 6,
    description: '秋收后的河湾农场，愿意为过路列车提供食物。',
    reward: { raw: 28, meal: 6 },
    credits: 12,
  },
  {
    id: 'yard',
    name: '旧编组站',
    tag: '车厢 · 严寒',
    x: 406,
    y: 73,
    temp: -8,
    description: '这里留有一节可修复的货运车厢，但寒潮正在接近。',
    reward: { metal: 14, parts: 4 },
  },
  {
    id: 'market',
    name: '石桥集市',
    tag: '交易 · 补给',
    x: 408,
    y: 272,
    temp: 9,
    description: '行商在废旧车站间搭起市场。补充燃煤，为最后一程做准备。',
    reward: { fuel: 18, medicine: 3 },
    credits: 15,
  },
  {
    id: 'pass',
    name: '南岭隧道',
    tag: '隘口 · 袭击',
    x: 588,
    y: 173,
    temp: 0,
    description: '穿过山岭的唯一通道。把防守者部署在车顶。',
    reward: { fuel: 10, raw: 8 },
  },
  {
    id: 'haven',
    name: '白桦避风港',
    tag: '迁徙目标',
    x: 778,
    y: 172,
    temp: 14,
    description: '山南的白桦林挡住寒风。一段旅途结束，新的生活开始。',
    reward: {},
  },
];
export const EDGES: RouteEdge[] = [
  { from: 'depot', to: 'coal', duration: 150, fuel: 12, risk: 0.8 },
  { from: 'depot', to: 'farm', duration: 190, fuel: 15, risk: 0.25 },
  { from: 'coal', to: 'yard', duration: 170, fuel: 13, risk: 0.6, cold: true },
  { from: 'farm', to: 'market', duration: 185, fuel: 14, risk: 0.2 },
  { from: 'yard', to: 'pass', duration: 200, fuel: 17, risk: 0.9, cold: true },
  { from: 'market', to: 'pass', duration: 200, fuel: 16, risk: 0.65 },
  { from: 'pass', to: 'haven', duration: 240, fuel: 20, risk: 1 },
];
export const STEP = 0.05;
export const GAME_DAY = 480;
export const SAVE_VERSION = 1;
