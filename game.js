// ===== «Передайте за проезд» — 3D от первого лица =====
// Хост крутит физику (cannon-es) и рассылает снимки по WebRTC (Trystero);
// остальные шлют куда смотрят и куда тянут руку.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

// ---------- утилиты ----------
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const dist3 = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);

// ---------- константы мира (метры; перед автобуса — x=0, назад — +x, вверх — y, лево — +z) ----------
const BUS_LEN = 5.4, BUS_HALF = 1.0, BUS_H = 1.9;
const SEATS = [{ x: 1.65, z: -0.45 }, { x: 2.45, z: 0.45 }, { x: 3.25, z: -0.45 }, { x: 4.05, z: 0.45 }];
const SH_Y = 1.05, REACH = 0.85, LEAN_REACH = 1.2;
const TRAY = { x0: 0.78, x1: 1.18, z0: -0.12, z1: 0.28, top: 0.86 };
const TRAY_C = { x: 0.98, y: 0.95, z: 0.08 };
const BACK_X = 4.5;
const SLOTS = [{ x: 4.72, y: 1.0, z: -0.3 }, { x: 4.72, y: 1.0, z: 0.05 }, { x: 4.72, y: 1.0, z: 0.4 }];
const BACK_DROP = { x: 4.72, y: 0.8, z: 0.25 };
const SEG = 30;
const STOPS = ['Автовокзал', 'ул. Ленина', 'Рынок', 'Больница', 'ТЦ «Мега»', 'Общага', 'Конечная'];
const ROUND = SEG * (STOPS.length - 1);
const COLORS = ['#ff5a5f', '#3fa7ff', '#ffb800', '#35c46a'];
const SEAT_NAMES = ['У водителя', 'Второй ряд', 'Третий ряд', 'Четвёртый ряд'];
const MAX_SPEED = 11;

const BOTS = [
  { name: 'Баба Зина', kind: 'babka', speed: 0.05, delay: [0.7, 1.3], fumble: 0.35, shirt: '#8e5aa8', skin: '#efc49c' },
  { name: 'Дед Толя', kind: 'ded', speed: 0.07, delay: [0.5, 1.0], fumble: 0.22, shirt: '#6b7a52', skin: '#e8b98f' },
  { name: 'Студент Вася', kind: 'student', speed: 0.10, delay: [0.9, 2.0], fumble: 0.15, shirt: '#3b3b46', skin: '#f1c9a5' },
  { name: 'Мужик Гена', kind: 'muzhik', speed: 0.13, delay: [0.3, 0.7], fumble: 0.30, shirt: '#1f3f8a', skin: '#e0ac69' },
];
const BOT_LINES = {
  babka: { drop: ['Ой, батюшки!', 'Ох, руки не те…', 'Внучки, подберите!'], give: ['На, милок', 'Держи, касатик'], idle: ['Вот раньше было…', 'Куда гонишь, ирод!'] },
  ded: { drop: ['Эх, ёшкин кот!', 'Не удержал…'], give: ['Принимай!', 'Держи, молодой'], idle: ['В наше время за 5 копеек ездили', 'Я на Газели 30 лет'] },
  student: { drop: ['А? Чё?', 'Блин…'], give: ['Ага, щас', 'На'], idle: ['…', '*музыка в наушниках*'] },
  muzhik: { drop: ['Опа!', 'Ну ё-моё!'], give: ['Лови!', 'Держи, братан'], idle: ['Шеф, музыку погромче!', 'Э, водила, полегче!'] },
};
const SHOUTS = ['Передайте за проезд!', 'СДАЧУ!!!', 'Держи, держи!', 'Кто уронил?!', 'Водитель, на остановке!'];
const DRV = {
  thanks: ['Ага', 'Спасибо', 'Принято', 'Угу'],
  wrong: ['Это сдача, назад передавай!', 'Мне это зачем?!', 'Не-не, это назад!'],
  overdue: ['Кто не передал?!', 'За проезд передаём!', 'Я никуда не поеду, пока не заплатите!'],
  brake: ['Куда прёшь?!', 'Ну ёлки!', 'Держитесь там!', 'Понаставили!'],
  change: ['Сдачу передайте!', 'Сдача!', 'Мелочь назад!'],
  broke: ['Кто огурцы разбил?!', 'Сами мыть будете!'],
};
// s — размер коробки-коллайдера (м), m — масса; heavy — тянет руку, breaks — бьётся, squash — мнётся,
// wriggle — вырывается, prickly — колется, slippery — выскальзывает
const TYPES = {
  fare:    { s: [0.15, 0.02, 0.07], m: 0.05 },
  coin:    { s: [0.045, 0.016, 0.045], m: 0.03 },
  soup:    { s: [0.3, 0.134, 0.247], m: 3, heavy: true, prop: 'CookingPot_Soup' },
  cake:    { s: [0.16, 0.2, 0.16], m: 0.8, squash: 3.0, prop: 'Cupcake' },
  jar:     { s: [0.157, 0.16, 0.15], m: 1, breaks: 3.6, prop: 'Jar_Large' },
  goose:   { s: [0.36, 0.22, 0.18], m: 2.5, wriggle: 'honk' },
  cactus:  { s: [0.13, 0.26, 0.13], m: 0.6, prickly: true },
  pug:     { s: [0.17, 0.3, 0.4], m: 4, wriggle: 'bark', prop: 'Pug' },
  fish:    { s: [0.4, 0.05, 0.133], m: 0.7, slippery: true, prop: 'Fish' },
  pumpkin: { s: [0.318, 0.197, 0.32], m: 3, heavy: true, prop: 'Pumpkin' },
  bottle:  { s: [0.081, 0.28, 0.081], m: 0.8, breaks: 3.4, prop: 'Bottle1' },
  pizza:   { s: [0.32, 0.03, 0.32], m: 0.4, squash: 3.4, prop: 'Pizza' },
  bread:   { s: [0.196, 0.241, 0.34], m: 0.4, prop: 'Bread' },
};
const TL = Object.keys(TYPES);
const itemRad = t => Math.max(...TYPES[t].s) / 2;
const SPECIAL = ['soup', 'cake', 'jar', 'goose', 'cactus', 'pug', 'fish', 'pumpkin', 'bottle', 'pizza', 'bread'];
const ITEM_NAME = {
  soup: 'кастрюлю супа', cake: 'торт', jar: 'банку огурцов', goose: 'гуся', cactus: 'кактус', pug: 'собачку',
  fish: 'рыбу', pumpkin: 'тыкву', bottle: 'кефир', pizza: 'пиццу', bread: 'батон',
};
const NOTE_COLOR = { 50: '#8ecae6', 100: '#e9c46a', 200: '#90be6d', 500: '#c39bd3' };

// yaw=0 — смотрим вперёд (к водителю, −x); +yaw — влево (+z)
function lookDir(yaw, pitch) { const cp = Math.cos(pitch); return { x: -Math.cos(yaw) * cp, y: Math.sin(pitch), z: Math.sin(yaw) * cp }; }
const leanMode = l => (l === true ? 1 : l | 0);
// куда сдвигается корпус при наклоне: вперёд по взгляду (с опусканием к полу) или вбок
function leanOffset(lean, yaw, k) {
  const m = leanMode(lean);
  if (!m) return { x: 0, y: 0, z: 0 };
  const a = yaw + (m === 2 ? Math.PI / 2 : m === 3 ? -Math.PI / 2 : 0);
  const side = m !== 1;
  const d = (side ? 0.3 : 0.25) * k;
  return { x: -Math.cos(a) * d, y: (side ? -0.12 : -0.35) * k, z: Math.sin(a) * d };
}
function shoulder(s, lean, yaw = 0) {
  const S = SEATS[s], o = leanOffset(lean, yaw, 1);
  return { x: S.x + 0.08 + o.x, y: SH_Y + o.y, z: S.z + o.z };
}
function headPos(s, lean, yaw = 0) {
  const S = SEATS[s], o = leanOffset(lean, yaw, 1.15);
  return { x: S.x + 0.06 + o.x, y: 1.32 + o.y, z: S.z + o.z };
}
function clampHand(s, t, lean, yaw) {
  const sh = shoulder(s, lean, yaw), r = lean ? LEAN_REACH : REACH;
  let dx = t.x - sh.x, dy = t.y - sh.y, dz = t.z - sh.z;
  const d = Math.hypot(dx, dy, dz);
  if (d > r) { dx *= r / d; dy *= r / d; dz *= r / d; }
  return { x: sh.x + dx, y: clamp(sh.y + dy, 0.06, BUS_H - 0.08), z: clamp(sh.z + dz, -BUS_HALF + 0.06, BUS_HALF - 0.06) };
}
const inFront = p => p.x < 1.22 && p.y > 0.55 && p.z > -0.2;
const inBack = p => p.x > BACK_X && p.y > 0.4;

// ---------- статическая геометрия (общая для физики и картинки) ----------
function staticBoxes() {
  const b = [];
  const add = (x0, x1, y0, y1, z0, z1, c) => b.push({ x0, x1, y0, y1, z0, z1, c });
  add(-0.5, BUS_LEN + 0.5, -0.2, 0, -1.5, 1.5);                 // пол
  add(-0.5, BUS_LEN + 0.5, BUS_H, BUS_H + 0.2, -1.5, 1.5);      // крыша
  add(-0.5, BUS_LEN + 0.5, 0, BUS_H, -1.3, -BUS_HALF);          // правый борт
  add(-0.5, BUS_LEN + 0.5, 0, BUS_H, BUS_HALF, 1.3);            // левый борт
  add(-0.3, 0, 0, BUS_H, -1, 1); add(BUS_LEN, BUS_LEN + 0.3, 0, BUS_H, -1, 1);
  add(0, 0.3, 0, 1.0, -1, 1, '#2b2b30');                         // торпеда
  add(0.55, 0.95, 0, 0.5, 0.25, 0.75, '#3b2b2b');               // сиденье водителя
  add(0.95, 1.05, 0.4, 1.25, 0.25, 0.75, '#3b2b2b');            // спинка водителя
  add(0.6, 0.95, 0.5, 1.15, 0.32, 0.68);                         // сам водитель (тело — невидимое)
  add(TRAY.x0, TRAY.x1, 0, TRAY.top, TRAY.z0, TRAY.z1, '#8b5a2b'); // консоль-касса
  add(TRAY.x0 - 0.02, TRAY.x0, TRAY.top, TRAY.top + 0.06, TRAY.z0, TRAY.z1, '#6d4420');
  add(TRAY.x1, TRAY.x1 + 0.02, TRAY.top, TRAY.top + 0.06, TRAY.z0, TRAY.z1, '#6d4420');
  add(TRAY.x0, TRAY.x1, TRAY.top, TRAY.top + 0.06, TRAY.z0 - 0.02, TRAY.z0, '#6d4420');
  for (const S of SEATS) {
    add(S.x - 0.22, S.x + 0.25, 0.37, 0.45, S.z - 0.23, S.z + 0.23, '#a33a3a');   // сиденье
    add(S.x + 0.25, S.x + 0.33, 0.45, 1.15, S.z - 0.23, S.z + 0.23, '#8c2f2f');   // спинка
    add(S.x - 0.32, S.x + 0.15, 0.45, 0.6, S.z - 0.19, S.z + 0.19);               // колени (рисуются человечком)
    add(S.x - 0.02, S.x + 0.24, 0.6, 1.12, S.z - 0.18, S.z + 0.18);               // туловище
  }
  add(4.8, BUS_LEN, 0, 0.45, -1, 1, '#a33a3a');                  // задний диван
  add(5.25, BUS_LEN, 0.45, 1.1, -1, 1, '#8c2f2f');
  for (const z of [-0.35, 0.35]) { add(4.85, 5.2, 0.45, 0.58, z - 0.18, z + 0.18); add(5.0, 5.25, 0.58, 1.1, z - 0.17, z + 0.17); }
  return b;
}

// ---------- состояние хоста ----------
let world = null, items = [], hands = [], bots = [], G = null, PHASE = 'menu', nextId = 1;
let seats = [], inputs = [{}, {}, {}, {}];
let fxLog = [], fxId = 0;
const prog = () => clamp(G.time / ROUND, 0, 1);
const DBG = {};
const dbg = k => { DBG[k] = (DBG[k] || 0) + 1; };
const patience = () => 38 - 12 * prog();

function newGame() {
  world = new CANNON.World({ gravity: new CANNON.Vec3(0, -9.82, 0) });
  world.allowSleep = false;
  world.solver.iterations = 12;
  world.defaultContactMaterial.friction = 0.45;
  world.defaultContactMaterial.restitution = 0.12;
  for (const b of staticBoxes()) {
    const body = new CANNON.Body({ mass: 0, shape: new CANNON.Box(new CANNON.Vec3((b.x1 - b.x0) / 2, (b.y1 - b.y0) / 2, (b.z1 - b.z0) / 2)) });
    body.position.set((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2, (b.z0 + b.z1) / 2);
    world.addBody(body);
  }
  items = []; nextId = 1;
  G = {
    time: 0, score: 0, anger: 0, gx: 0, gz: 0, speed: 0, seg: -1, boarded: false,
    nextEvt: 6, evt: null, evtT: 0, fareQueue: 0, nextFare: 0, nextMid: 16, timers: [],
    lastDrvSay: -10, lastOverdueSay: -10, lastSnd: 0, lastShout: [-9, -9, -9, -9],
    stats: { fares: 0, coins: 0, specials: 0, lost: 0, broken: 0 }, result: null,
  };
  hands = [0, 1, 2, 3].map(s => {
    const S = SEATS[s];
    return { x: S.x - 0.15, y: 0.68, z: S.z, tx: S.x - 0.15, ty: 0.68, tz: S.z, grab: false, prev: false, held: null, lean: false, yaw: 0, pitch: -0.2, jx: 0, jy: 0, jz: 0, noGrab: 0, lastTh: undefined };
  });
  bots = [0, 1, 2, 3].map(s => ({ ...BOTS[s], t: 0, cur: null, hold: 0, patience: 3, idleT: rand(8, 20) }));
}

function spawnItem(type, pos, o = {}) {
  const T = TYPES[type];
  const body = new CANNON.Body({
    mass: T.m, shape: new CANNON.Box(new CANNON.Vec3(T.s[0] / 2, T.s[1] / 2, T.s[2] / 2)),
    linearDamping: 0.08, angularDamping: 0.3,
  });
  body.position.set(pos.x, pos.y, pos.z);
  body.quaternion.setFromEuler(0, rand(-0.4, 0.4), 0);
  world.addBody(body);
  const it = {
    id: nextId++, type, body, dest: o.dest || (type === 'coin' ? 'back' : 'front'),
    holder: o.holder ?? -1, slot: o.slot ?? -1, born: G.time, value: o.value || 0, change: !!o.change,
    squashed: false, overdue: false, floorT: 0, touched: false, ignore: {}, heldSince: 0,
    flapT: rand(1, 2.5), bounceAt: -9, offered: false, dead: false,
  };
  body.addEventListener('collide', e => onCollide(it, e));
  items.push(it);
  return it;
}

function kill(it) {
  if (it.dead) return;
  it.dead = true;
  if (it.holder >= 0 && it.holder < 4 && hands[it.holder].held === it) hands[it.holder].held = null;
}

// ---------- эффекты (уходят и клиентам) ----------
const r2 = v => Math.round(v * 100) / 100;
function fx(e) { e.id = ++fxId; e.at = performance.now(); fxLog.push(e); handleFx(e); }
const say = (who, text) => fx({ k: 'say', w: who, s: text });
const pop = (p, s, c) => fx({ k: 'pop', x: r2(p.x), y: r2(p.y), z: r2(p.z), s, c });
const snd = n => fx({ k: 'snd', n });
const flash = s => fx({ k: 'flash', s });
function driverSay(s) { if (G.time - G.lastDrvSay < 1.2) return; G.lastDrvSay = G.time; say('drv', s); }
function pruneFx() { const now = performance.now(); while (fxLog.length && now - fxLog[0].at > 1500) fxLog.shift(); }

// ---------- шаг хоста ----------
function hostStep(dt) {
  if (PHASE === 'lobby') {
    for (let s = 0; s < 4; s++) seats[s].bot ? botRest(s) : applyInput(s);
    updateHands(dt);
    return;
  }
  if (PHASE !== 'play') return;
  G.time += dt;
  for (let i = G.timers.length - 1; i >= 0; i--) {
    if (G.time >= G.timers[i].at) { const t = G.timers[i]; G.timers.splice(i, 1); t.fn(); }
  }
  updateRoute(dt);
  if (PHASE !== 'play') return;
  spawnLogic(dt);
  for (let s = 0; s < 4; s++) seats[s].bot ? botThink(s, dt) : applyInput(s);
  updateHands(dt);
  // предмет в руке не цепляется за бортики и сиденья — его ведёт рука
  for (const it of items) it.body.collisionResponse = it.holder === -1;
  world.step(dt);
  afterPhysics(dt);
}

function applyInput(s) {
  const i = inputs[s], h = hands[s];
  if (i.x == null) return;
  h.tx = i.x; h.ty = i.y; h.tz = i.z; h.grab = !!i.g; h.lean = leanMode(i.l);
  h.yaw = i.yw || 0; h.pitch = i.pt || 0;
  if (i.th !== h.lastTh) { if (h.lastTh !== undefined) throwHeld(s, i.tp ?? 0.6); h.lastTh = i.th; }
}

function updateHands(dt) {
  for (let s = 0; s < 4; s++) {
    const h = hands[s], bot = seats[s].bot;
    const t = clampHand(s, { x: h.tx, y: h.ty, z: h.tz }, h.lean, h.yaw);
    let k = bot ? bots[s].speed : 0.35;
    if (h.held && TYPES[h.held.type].heavy) k *= 0.45;
    h.x += (t.x - h.x) * k; h.y += (t.y - h.y) * k; h.z += (t.z - h.z) * k;
    h.jx *= 0.85; h.jy *= 0.85; h.jz *= 0.85;
    const hp = { x: h.x + h.jx, y: h.y + h.jy, z: h.z + h.jz };
    h.rx = hp.x; h.ry = hp.y; h.rz = hp.z;
    h.noGrab = Math.max(0, h.noGrab - dt);
    if (PHASE === 'play') {
      const fresh = h.grab && !h.prev;
      if (h.grab && !h.held && h.noGrab <= 0) tryGrab(s, fresh, hp);
      if (!h.grab && h.held) release(s);
      if (h.held) {
        const b = h.held.body, p = b.position;
        b.velocity.set((hp.x - p.x) * 20, (hp.y - p.y) * 20, (hp.z - p.z) * 20);
        b.angularVelocity.scale(0.6, b.angularVelocity);
        if (dist3(hp, p) > 0.35) { const it = h.held; release(s); it.ignore[s] = G.time + 3; dbg('far'); }
      }
    }
    h.prev = h.grab;
  }
}

function tryGrab(s, fresh, hp) {
  let best = null, bd = 1e9;
  for (const it of items) {
    if (it.dead || it.holder === s) continue;
    if (it.holder >= 0 && it.holder < 4 && !fresh) continue; // отобрать можно только свежим хватом
    const d = dist3(it.body.position, hp) - itemRad(it.type) * 0.6;
    if (d < 0.1 && d < bd) { bd = d; best = it; }
  }
  if (!best) return;
  if (best.holder >= 0 && best.holder < 4) { hands[best.holder].held = null; bots[best.holder].hold = 0; }
  best.holder = s; best.touched = true; best.heldSince = G.time; best.offered = false;
  hands[s].held = best;
  if (seats[s].bot && Math.random() < 0.15) say(s, pick(BOT_LINES[bots[s].kind].give));
}

function release(s) {
  const h = hands[s], it = h.held;
  if (!it) return;
  h.held = null;
  it.holder = -1; it.offered = false;
  const v = it.body.velocity, sp = v.length();
  if (sp > 9) v.scale(9 / sp, v);
}

function throwHeld(s, power = 0.6) {
  const h = hands[s], it = h.held;
  if (!it) return;
  release(s);
  const d = lookDir(h.yaw, h.pitch), v = 2.5 + clamp(power, 0, 1) * 6.5;
  it.body.velocity.set(d.x * v, d.y * v + 1.2, d.z * v);
  it.body.angularVelocity.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
  it.ignore[s] = G.time + 1;
  snd('whoosh');
}

// ---------- боты-пассажиры ----------
function botRest(s) {
  const S = SEATS[s], h = hands[s];
  h.tx = S.x - 0.15; h.ty = 0.68; h.tz = S.z; h.grab = false; h.lean = 0;
  h.yaw *= 0.95; h.pitch += (-0.15 - h.pitch) * 0.05;
}

function botLook(s) {
  const h = hands[s], hp = headPos(s, h.lean, h.yaw);
  const dx = h.tx - hp.x, dy = h.ty - hp.y, dz = h.tz - hp.z;
  const yaw = Math.atan2(dz, -dx), pitch = Math.atan2(dy, Math.hypot(dx, dz));
  h.yaw += clamp(yaw - h.yaw, -0.08, 0.08); h.pitch += (pitch - h.pitch) * 0.1;
}

function botThink(s, dt) {
  const b = bots[s], h = hands[s];
  if (h.held) {
    const it = h.held, dir = it.dest === 'front' ? -1 : 1, sh = shoulder(s, false);
    const terminal = (dir < 0 && s === 0) || (dir > 0 && s === 3);
    let t;
    if (b.park) {
      // кладём своё на колени, чтобы освободить руку
      const S = SEATS[s];
      t = { x: S.x - 0.12, y: 0.7, z: S.z };
      h.tx = t.x; h.ty = t.y; h.tz = t.z; h.lean = 0; h.grab = true;
      botLook(s);
      if (dist3(h, t) < 0.08) { h.grab = false; b.park = false; it.ignore[s] = G.time + 1.5; dbg('park'); }
      return;
    }
    if (terminal) t = dir < 0 ? { ...TRAY_C } : { ...BACK_DROP };
    else {
      const ns = shoulder(s + dir, false);
      const vx = ns.x - sh.x, vz = ns.z - sh.z, l = Math.hypot(vx, vz);
      t = { x: sh.x + vx / l * (REACH - 0.08), y: 1.0, z: sh.z + vz / l * (REACH - 0.08) };
    }
    h.tx = t.x; h.ty = t.y; h.tz = t.z; h.lean = 0; h.grab = true;
    botLook(s);
    if (dist3(h, t) < 0.08) {
      b.hold += dt;
      if (!terminal) it.offered = true;
      // сосед сам тянет мне вещь навстречу — у обоих заняты руки
      const n = s + dir, nh = !terminal && hands[n] && hands[n].held;
      const clinch = nh && nh.offered && (nh.dest === 'front' ? -1 : 1) === -dir;
      if (terminal && b.hold > 0.3) h.grab = false;
      else if (clinch && b.hold > 0.4 && it.dest === 'back') b.park = true;
      else if (b.hold > b.patience) {
        if (seats[n] && seats[n].bot) b.park = true;
        else { h.grab = false; it.ignore[s] = G.time + 2.5; dbg('patience' + s); }
        if (Math.random() < 0.6) say(s, 'Ну бери уже!');
      }
    } else b.hold = 0;
    return;
  }
  b.hold = 0; b.park = false;
  const it = botTarget(s);
  if (!it) {
    b.cur = null; botRest(s);
    b.idleT -= dt;
    if (b.idleT <= 0) { b.idleT = rand(15, 30); if (Math.random() < 0.5) say(s, pick(BOT_LINES[b.kind].idle)); }
    return;
  }
  const p = it.body.position;
  h.tx = p.x; h.ty = p.y; h.tz = p.z;
  botLook(s);
  if (b.cur !== it) { b.cur = it; b.t = rand(b.delay[0], b.delay[1]); }
  if (b.t > 0) { b.t -= dt; h.grab = false; const S = SEATS[s]; h.tx = S.x - 0.15; h.ty = 0.68; h.tz = S.z; return; }
  h.lean = dist3(p, shoulder(s, false)) > REACH - 0.06 ? 1 : 0;
  h.grab = dist3(h, p) < 0.12;
  if (h.grab) b.patience = rand(2, 3.5);
}

function botTarget(s) {
  const sh = shoulder(s, false);
  let best = null, bs = 1e9;
  for (const it of items) {
    if (it.dead || (it.ignore[s] || 0) > G.time) continue;
    const p = it.body.position, dir = it.dest === 'front' ? -1 : 1;
    const d = dist3(p, sh);
    if (d > REACH - 0.04 && dist3(p, shoulder(s, true, Math.atan2(p.z - sh.z, sh.x - p.x))) > LEAN_REACH - 0.06) continue;
    const terminal = (dir < 0 && s === 0) || (dir > 0 && s === 3);
    if (!terminal) {
      if (dir < 0 && p.x < sh.x - REACH * 0.55) continue;
      if (dir > 0 && p.x > sh.x + REACH * 0.55) continue;
    }
    const hd = it.holder;
    if (hd >= 0 && hd < 4) {
      const toward = dir < 0 ? hd > s : hd < s;
      if (!toward) continue;
      if (seats[hd].bot) { if (!it.offered) continue; }
      else {
        if (G.time - it.heldSince < 0.5 || d > REACH * 0.85) continue;
        if (dir < 0 ? p.x > SEATS[hd].x - 0.25 : p.x < SEATS[hd].x + 0.25) continue;
      }
    }
    if (hd === -1 && ((inFront(p) && dir < 0) || (inBack(p) && dir > 0))) continue;
    const sc = d + (it.type === 'fare' && G.time - it.born > 20 ? -0.4 : 0);
    if (sc < bs) { bs = sc; best = it; }
  }
  return best;
}

// ---------- маршрут и события дороги ----------
function updateRoute(dt) {
  const t = G.time, seg = Math.floor(t / SEG), u = t - seg * SEG;
  if (seg !== G.seg) {
    G.seg = seg; G.boarded = false;
    if (seg >= STOPS.length - 1) { endGame('win'); return; }
    flash(seg === 0 ? 'Поехали! Автовокзал' : 'Остановка «' + STOPS[seg] + '»');
  }
  let gx = 0, gz = 0, target = 1;
  if (u < 4) { target = 0; if (!G.boarded && u > 0.8) { G.boarded = true; board(); } }
  else if (u < 5.5) gx = 0.45;
  else if (u > SEG - 1.6) { gx = -0.55; target = 0; }
  if (G.evt) { G.evtT -= dt; gx += G.evt.gx || 0; gz += G.evt.gz || 0; if (G.evtT <= 0) G.evt = null; }
  else if (u >= 5.5 && u < SEG - 2.5) {
    G.nextEvt -= dt;
    if (G.nextEvt <= 0) { roadEvent(); G.nextEvt = rand(3.5, 7) * (1 - 0.4 * prog()); }
  }
  G.gx += (gx - G.gx) * Math.min(1, dt * 6);
  G.gz += (gz - G.gz) * Math.min(1, dt * 4);
  world.gravity.set(G.gx * 9.82, -9.82, G.gz * 9.82);
  G.speed += (target - G.speed) * Math.min(1, dt * 0.9);
}

function roadEvent() {
  const r = Math.random();
  if (r < 0.42) bump(rand(0.7, 1.1), 'Яма!');
  else if (r < 0.56) { bump(0.8, 'Лежачий полицейский!'); G.timers.push({ at: G.time + 0.35, fn: () => bump(0.9) }); }
  else if (r < 0.70) { G.evt = { gx: -0.9 }; G.evtT = 0.7; flash('ТОРМОЗ!'); snd('horn'); driverSay(pick(DRV.brake)); fx({ k: 'shake', m: 0.6 }); }
  else if (r < 0.84) { const side = Math.random() < 0.5 ? -1 : 1; G.evt = { gz: 0.55 * side }; G.evtT = 1.3; flash(side > 0 ? 'Поворот направо!' : 'Поворот налево!'); }
  else if (r < 0.92) bump(1.6, 'ЯМИЩА!');
  else { G.evt = { gx: 0.8 }; G.evtT = 0.6; flash('ГАЗУЕТ!'); }
}

function bump(mag, label) {
  for (const it of items) {
    if (it.dead || it.holder !== -1) continue;
    const v = it.body.velocity;
    v.set(v.x + rand(-0.4, 0.4) * mag, v.y + rand(1.3, 2.3) * mag, v.z + rand(-0.4, 0.4) * mag);
    it.body.angularVelocity.set(rand(-4, 4) * mag, rand(-4, 4) * mag, rand(-4, 4) * mag);
  }
  fx({ k: 'shake', m: mag }); snd('bump');
  if (label) flash(label);
  for (let s = 0; s < 4; s++) {
    const h = hands[s];
    h.jy += rand(0.08, 0.16) * mag; h.jx += rand(-0.04, 0.04) * mag; h.jz += rand(-0.04, 0.04) * mag;
    if (!h.held) continue;
    const heavy = !!TYPES[h.held.type].heavy;
    if ((seats[s].bot && Math.random() < bots[s].fumble * 0.6 * mag) || (!seats[s].bot && heavy && Math.random() < 0.25 * mag)) {
      const it = h.held; release(s); it.ignore[s] = G.time + 1.5; dbg('fumble');
      say(s, seats[s].bot ? pick(BOT_LINES[bots[s].kind].drop) : 'Тяжёлое!!');
    }
  }
}

function board() {
  const p = prog();
  G.fareQueue += 1 + Math.floor(Math.random() * (2 + p * 2.5));
  if (Math.random() < 0.4 + p * 0.4) spawnSpecial();
  if (Math.random() < p * 0.5) G.timers.push({ at: G.time + 2, fn: spawnSpecial });
  say('npc', 'Передайте за проезд!');
}

function spawnLogic(dt) {
  if (G.fareQueue > 0 && G.time >= G.nextFare) {
    const sl = freeSlot();
    if (sl >= 0) { spawnFare(sl); G.fareQueue--; G.nextFare = G.time + rand(0.9, 1.8); }
  }
  const u = G.time % SEG;
  if (u > 6 && u < SEG - 3) {
    G.nextMid -= dt;
    if (G.nextMid <= 0) {
      G.nextMid = rand(10, 16) * (1 - 0.4 * prog());
      G.fareQueue++;
      say('npc', pick(['Ой, я ж не передал!', 'Передайте, пожалуйста!', 'За двоих передайте!']));
      if (Math.random() < 0.2 + 0.4 * prog()) spawnSpecial();
    }
  }
}

function freeSlot() {
  for (let i = 0; i < SLOTS.length; i++) if (!items.some(it => !it.dead && it.holder === 9 && it.slot === i)) return i;
  return -1;
}

function spawnFare(sl) {
  const v = pick([50, 50, 100, 100, 100, 200, 500]);
  spawnItem('fare', SLOTS[sl], { holder: 9, slot: sl, value: v, change: v >= 500 || Math.random() < 0.55 });
}

function spawnSpecial() {
  const type = pick(SPECIAL), sl = freeSlot();
  if (sl >= 0 && Math.random() < 0.5) {
    spawnItem(type, SLOTS[sl], { holder: 9, slot: sl, dest: 'front' });
    say('npc', 'Передайте водителю ' + ITEM_NAME[type] + '!');
  } else {
    spawnItem(type, { x: TRAY_C.x, y: 1.15, z: TRAY_C.z }, { dest: 'back' });
    say('drv', 'Передайте назад ' + ITEM_NAME[type] + '!');
  }
}

function spawnChange(v) {
  const n = v >= 500 ? 2 : 1;
  for (let i = 0; i < n; i++) {
    const c = spawnItem('coin', { x: TRAY_C.x + rand(-0.1, 0.1), y: 1.0 + i * 0.03, z: TRAY_C.z + rand(-0.1, 0.1) }, { dest: 'back' });
    c.body.velocity.set(rand(-0.3, 0.3), 0, rand(-0.3, 0.3));
  }
  driverSay(pick(DRV.change)); snd('clink');
}

// ---------- после физики: доставка, потери, гуси ----------
function afterPhysics(dt) {
  for (const it of items) {
    if (it.dead) continue;
    const b = it.body, pos = b.position;
    if (pos.x < 0.05 || pos.x > BUS_LEN - 0.05 || pos.y < -0.05 || pos.y > BUS_H || Math.abs(pos.z) > BUS_HALF - 0.02) {
      pos.set(clamp(pos.x, 0.4, BUS_LEN - 0.4), clamp(pos.y, 0.3, BUS_H - 0.3), clamp(pos.z, -0.8, 0.8));
      b.velocity.set(0, 0, 0);
    }
    if (it.holder === 9) {
      const sp = SLOTS[it.slot];
      b.velocity.set((sp.x - pos.x) * 8, (sp.y - pos.y) * 8, (sp.z - pos.z) * 8);
      b.angularVelocity.scale(0.5, b.angularVelocity);
    }
    if (it.type === 'fare' && G.time - it.born > patience()) {
      it.overdue = true;
      G.anger += 2.2 * dt;
      if (G.time - G.lastOverdueSay > 7) { G.lastOverdueSay = G.time; driverSay(pick(DRV.overdue)); }
    }
    const TT = TYPES[it.type];
    if (TT.wriggle) {
      it.flapT -= dt;
      if (it.flapT <= 0) {
        it.flapT = rand(1.2, 3); snd(TT.wriggle);
        if (it.holder === -1) b.velocity.set(b.velocity.x + rand(-2, 2), b.velocity.y + rand(2, 3.5), b.velocity.z + rand(-2, 2));
        else if (it.holder < 4) {
          const s = it.holder, h = hands[s];
          h.jx += rand(-0.15, 0.15); h.jy += rand(-0.1, 0.1); h.jz += rand(-0.15, 0.15);
          if (Math.random() < 0.2) { release(s); h.noGrab = 0.4; say(s, it.type === 'pug' ? 'Собака вырвалась!' : 'Гусь вырвался!'); }
        }
      }
    }
    if (TT.slippery && it.holder >= 0 && it.holder < 4 && Math.random() < dt * 0.3) {
      const s = it.holder; release(s); hands[s].noGrab = 0.3;
      say(s, pick(['Скользкая!', 'Рыба уплыла!', 'Фу, мокрая!']));
    }
    if (TT.prickly && it.holder >= 0 && it.holder < 4 && G.time - it.heldSince > 1.5) {
      const s = it.holder; release(s); hands[s].noGrab = 0.8;
      say(s, pick(['АЙ!', 'Колется!!', 'Ай-ай-ай!'])); snd('ai');
    }
    if (it.holder === -1) {
      if (inFront(pos) && G.time - it.bounceAt > 0.8) {
        if (it.dest === 'front') deliver(it);
        else if (it.touched) { bounceOut(it, 1); driverSay(pick(DRV.wrong)); }
      } else if (inBack(pos) && G.time - it.bounceAt > 0.8) {
        if (it.dest === 'back') deliver(it);
        else if (it.touched) { bounceOut(it, -1); say('npc', pick(['Это водителю!', 'Не мне!', 'Вперёд передавай!'])); }
      }
      if (!it.dead && pos.y < 0.14) { if (!it.fl0) { it.fl0 = 1; dbg('floor:' + it.type); } it.floorT += dt; if (it.floorT > 10) loseItem(it, 'укатилось!'); }
      else if (!it.dead) it.fl0 = 0;
      else it.floorT = 0;
    } else it.floorT = 0;
  }
  for (const it of items) if (it.dead) world.removeBody(it.body);
  items = items.filter(i => !i.dead);
  G.anger = clamp(G.anger, 0, 100);
  if (G.anger >= 100) endGame('lose');
}

function bounceOut(it, dir) {
  it.body.velocity.set(dir * rand(2, 3), rand(1.5, 2.5), rand(-0.5, 0.5));
  it.bounceAt = G.time;
}

function deliver(it) {
  const pos = it.body.position;
  let pts;
  if (it.type === 'fare') {
    pts = G.time - it.born < 15 ? 15 : 10;
    G.stats.fares++; G.anger = Math.max(0, G.anger - 6);
    driverSay(it.value >= 500 ? 'С пятисотки?! Ну ладно…' : pick(DRV.thanks));
    if (it.change) { const v = it.value; G.timers.push({ at: G.time + 1.4, fn: () => spawnChange(v) }); }
  } else if (it.type === 'coin') {
    pts = 5; G.stats.coins++;
    if (Math.random() < 0.25) say('npc', pick(['Спасибо!', 'Наконец-то сдача', 'А где ещё 10 рублей?']));
  } else {
    pts = it.squashed ? 5 : 20; G.stats.specials++; G.anger = Math.max(0, G.anger - 4);
    if (it.dest === 'front') driverSay(it.squashed ? 'Это что вообще было?' : it.type === 'pug' ? 'О, Шарик вернулся!' : 'О, спасибо!');
    else say('npc', it.squashed ? 'Оно же раздавлено!!!' : it.type === 'pug' ? 'Пусечка моя!' : 'Ой, спасибо, родные!');
  }
  G.score += pts;
  pop({ x: pos.x, y: pos.y + 0.15, z: pos.z }, '+' + pts, '#7CFC7C'); snd('ok');
  kill(it);
}

function loseItem(it, txt) {
  const pos = it.body.position;
  G.stats.lost++; G.score = Math.max(0, G.score - 5); G.anger += 4;
  pop({ x: pos.x, y: pos.y + 0.2, z: pos.z }, txt, '#ff8080'); snd('bad');
  kill(it);
}

function breakJar(it) {
  const pos = it.body.position;
  G.stats.broken++; G.score = Math.max(0, G.score - 10); G.anger += 8;
  pop({ x: pos.x, y: pos.y + 0.2, z: pos.z }, 'ДЗЫНЬ!', '#ff8080'); snd('break');
  fx({ k: 'splash', x: r2(pos.x), y: r2(pos.y), z: r2(pos.z), c: it.type === 'bottle' ? '#f4f4f0' : '#7cb342' });
  driverSay(it.type === 'bottle' ? pick(['Кто кефир разлил?!', 'Весь пол в кефире!']) : pick(DRV.broke));
  kill(it);
}

function onCollide(it, e) {
  if (it.dead || !G || PHASE !== 'play' || it.holder !== -1) return;
  let v = 0;
  try { v = Math.abs(e.contact.getImpactVelocityAlongNormal()); } catch (er) {}
  const TT = TYPES[it.type];
  if (TT.breaks && v > TT.breaks) breakJar(it);
  else if (TT.squash && v > TT.squash && !it.squashed) {
    it.squashed = true;
    const p = it.body.position;
    pop({ x: p.x, y: p.y + 0.2, z: p.z }, it.type === 'pizza' ? 'пицца всмятку!' : 'торт всмятку!', '#ffb3c7'); snd('splat');
  }
  if (v > 1.6 && G.time - G.lastSnd > 0.07) { G.lastSnd = G.time; snd(it.type === 'coin' ? 'clink' : 'thump'); }
}

function endGame(res) {
  if (PHASE !== 'play') return;
  PHASE = 'end'; G.result = res;
  flash(res === 'win' ? 'КОНЕЧНАЯ!' : 'ВСЕХ ВЫСАДИЛИ!');
  snd('horn');
  fillEnd(res, G.stats, G.score, true);
}

function doShout(s, i) {
  if (s < 0 || !SHOUTS[i] || !G) return;
  if (G.time - G.lastShout[s] < 0.8 && PHASE === 'play') return;
  G.lastShout[s] = G.time;
  say(s, SHOUTS[i]);
}

// ---------- места ----------
function resetSeats() { seats = BOTS.map(b => ({ pid: null, name: b.name, bot: true })); inputs = [{}, {}, {}, {}]; }
const seatOf = pid => seats.findIndex(s => s.pid === pid);
const PREF = [1, 2, 0, 3];
function addPlayer(pid, name) {
  for (const s of PREF) if (seats[s].bot) { seats[s] = { pid, name: name || 'Пассажир', bot: false }; inputs[s] = {}; return s; }
  return -1;
}
function removePlayer(pid) {
  const s = seatOf(pid);
  if (s < 0) return;
  seats[s] = { pid: null, name: BOTS[s].name, bot: true };
  inputs[s] = {};
  if (G) say(s, '*пассажир вышел, сел бот*');
}
function moveSeat(pid, ns) {
  const s = seatOf(pid);
  if (s < 0 || !seats[ns] || !seats[ns].bot) return;
  seats[ns] = { ...seats[s] }; inputs[ns] = inputs[s];
  seats[s] = { pid: null, name: BOTS[s].name, bot: true }; inputs[s] = {};
  if (hands[s] && hands[s].held) release(s);
}

// ---------- пакеты ----------
const mm = v => Math.round(v * 1000);
function buildPacket() {
  return {
    t: 's', ph: PHASE, tm: +G.time.toFixed(2), sc: G.score, an: Math.round(G.anger),
    gx: +G.gx.toFixed(2), gz: +G.gz.toFixed(2), sp: +G.speed.toFixed(2),
    it: items.filter(i => !i.dead).map(i => {
      const p = i.body.position, q = i.body.quaternion;
      return [i.id, TL.indexOf(i.type), mm(p.x), mm(p.y), mm(p.z), mm(q.x), mm(q.y), mm(q.z), mm(q.w), i.holder,
        (i.dest === 'back' ? 1 : 0) | (i.squashed ? 2 : 0) | (i.overdue ? 4 : 0) | (i.floorT > 4 ? 8 : 0),
        i.type === 'fare' ? Math.min(100, Math.round((G.time - i.born) / patience() * 100)) : 0, i.value];
    }),
    hd: hands.map(h => [mm(h.rx ?? h.x), mm(h.ry ?? h.y), mm(h.rz ?? h.z), h.held ? 1 : (h.grab ? 2 : 0), leanMode(h.lean), Math.round(h.yaw * 100), Math.round(h.pitch * 100)]),
    se: seats.map(s => [s.pid || '', s.name, s.bot ? 1 : 0]),
    fx: fxLog.slice(-30), res: G.result, st: PHASE === 'end' ? G.stats : null,
  };
}
function parse(p) {
  return {
    ph: p.ph, tm: p.tm, sc: p.sc, an: p.an, gx: p.gx, gz: p.gz, sp: p.sp,
    items: p.it.map(a => ({ id: a[0], type: TL[a[1]], x: a[2] / 1000, y: a[3] / 1000, z: a[4] / 1000, qx: a[5] / 1000, qy: a[6] / 1000, qz: a[7] / 1000, qw: a[8] / 1000, holder: a[9], fl: a[10], age: a[11], val: a[12] })),
    hands: p.hd.map(a => ({ x: a[0] / 1000, y: a[1] / 1000, z: a[2] / 1000, st: a[3], l: a[4], yw: a[5] / 100, pt: a[6] / 100 })),
    seats: p.se.map(a => ({ pid: a[0], name: a[1], bot: !!a[2] })),
    res: p.res, st: p.st,
  };
}

// ---------- сеть ----------
// Trystero: игроки находят друг друга через бесплатные публичные «знакомящие» сервера,
// дальше — прямой WebRTC. Комната открывается сразу в трёх сетях (торрент-трекеры, MQTT, Nostr):
// какая первой соединит — через ту и играем. Своего сервера нет.
const TRYSTERO = v => `https://cdn.jsdelivr.net/npm/trystero@0.21.8/${v}/+esm`;
const STRATS = ['mqtt', 'torrent', 'nostr'];
const APP_ID = 'peredayte-za-proezd-3d-v1';
const RTC = { iceServers: [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
] };
const NET = {
  role: null, rooms: [], myPid: null, code: null, latest: null, lastFx: 0, gotSeat: false, timers: [],
  routes: new Map(),   // хост: pid гостя → { r, peer }
  hostRoute: null,     // гость: через какую сеть и какого пира идёт хост
};
const MODS = {};
async function loadNets() {
  await Promise.allSettled(STRATS.map(async k => { if (!MODS[k]) MODS[k] = await import(TRYSTERO(k)); }));
  return STRATS.filter(k => MODS[k]);
}
function newPid() { return 'p' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4); }

function genCode() { const a = 'ABCDEFGHJKLMNPRSTUVWXYZ'; let s = ''; for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }

function openRooms(kinds, code, wire) {
  for (const k of kinds) {
    try {
      const room = MODS[k].joinRoom({ appId: APP_ID, rtcConfig: RTC }, code);
      const [sendSt, getSt] = room.makeAction('st');
      const [sendIn, getIn] = room.makeAction('in');
      const [sendCtl, getCtl] = room.makeAction('ctl');
      const r = { kind: k, room, sendSt, sendIn, sendCtl };
      NET.rooms.push(r);
      wire(r, { getSt, getIn, getCtl });
    } catch (e) { console.warn('сеть', k, e); }
  }
}

async function hostCreate(name) {
  menuError('Подаём маршрутку…');
  const kinds = await loadNets();
  if (!kinds.length) { menuError('Сетевая библиотека не загрузилась — попробуй «Покататься с ботами»'); return; }
  menuError('');
  NET.role = 'host'; NET.myPid = 'host'; NET.code = genCode(); NET.routes.clear(); NET.rooms = [];
  resetSeats(); addPlayer('host', name);
  newGame(); PHASE = 'lobby';
  show('lobby'); lobbyKey = '';
  $('lobbyCode').textContent = NET.code;
  $('lobbyStatus').textContent = 'Маршрутка ждёт пассажиров. Скинь друзьям код или ссылку.';
  $('btnStart').classList.remove('hidden'); $('waitHost').classList.add('hidden');
  openRooms(kinds, NET.code, (r, a) => {
    a.getCtl((d, peer) => onHostCtl(r, peer, d));
    a.getIn((d, peer) => {
      const pid = pidByRoute(r, peer), s = pid ? seatOf(pid) : -1;
      if (s >= 0) inputs[s] = { x: d.x / 1000, y: d.y / 1000, z: d.z / 1000, g: !!d.g, l: d.l | 0, yw: d.yw / 1000, pt: d.pt / 1000, th: d.th, tp: (d.tp ?? 60) / 100 };
    });
    r.room.onPeerLeave(peer => {
      const pid = pidByRoute(r, peer);
      if (pid) { NET.routes.delete(pid); removePlayer(pid); }
    });
  });
}
function pidByRoute(r, peer) {
  for (const [pid, rt] of NET.routes) if (rt.r === r && rt.peer === peer) return pid;
  return null;
}

function onHostCtl(r, peer, d) {
  if (!d || !d.t) return;
  if (d.t === 'hello') {
    const pid = String(d.pid || '').slice(0, 40);
    if (!pid || NET.routes.has(pid)) return; // уже пришёл по другой сети
    const s = addPlayer(pid, String(d.name || '').slice(0, 14));
    if (s < 0) { try { r.sendCtl({ t: 'full' }, peer); } catch (e) {} return; }
    NET.routes.set(pid, { r, peer });
    say(s, 'Здрасьте!');
    return;
  }
  const pid = pidByRoute(r, peer);
  if (!pid) return;
  if (d.t === 'seat') moveSeat(pid, +d.s);
  else if (d.t === 'say') doShout(seatOf(pid), +d.i);
}

function broadcast(pkt) {
  if (!NET.routes.size) return;
  for (const r of NET.rooms) {
    const peers = [];
    for (const rt of NET.routes.values()) if (rt.r === r) peers.push(rt.peer);
    if (peers.length) { try { r.sendSt(pkt, peers); } catch (e) {} }
  }
}

function clientSend(kind, d) {
  const h = NET.hostRoute;
  if (NET.role !== 'client' || !h) return;
  try { (kind === 'in' ? h.r.sendIn : h.r.sendCtl)(d, h.peer); } catch (e) {}
}

async function clientJoin(name, code) {
  code = code.toUpperCase().replace(/[^A-Z]/g, '');
  if (code.length !== 4) { menuError('Код — 4 латинские буквы'); return; }
  menuError('Ищем маршрутку ' + code + '… (может занять до минуты)');
  const kinds = await loadNets();
  if (!kinds.length) { menuError('Сетевая библиотека не загрузилась'); return; }
  NET.role = 'client'; NET.code = code; NET.latest = null; NET.lastFx = 0; NET.gotSeat = false; NET.hostRoute = null; NET.rooms = [];
  NET.myPid = newPid();
  const hello = (r, peer) => { try { r.sendCtl({ t: 'hello', name, pid: NET.myPid }, peer); } catch (e) {} };
  openRooms(kinds, code, (r, a) => {
    r.room.onPeerJoin(peer => hello(r, peer));
    a.getSt((d, peer) => {
      const h = NET.hostRoute;
      if (h && (h.r !== r || h.peer !== peer)) return;
      if (!h) NET.hostRoute = { r, peer };
      onClientData(d);
    });
    a.getCtl(d => { if (d && d.t === 'full') { leave(); menuError('Маршрутка полная — 4 из 4'); } });
    r.room.onPeerLeave(peer => {
      const h = NET.hostRoute;
      if (h && h.r === r && h.peer === peer && NET.role === 'client') { leave(); menuError('Водитель уехал без вас (хост отключился)'); }
    });
  });
  // пока хост не посадил — повторяем приветствие
  NET.timers.push(setInterval(() => { if (!NET.gotSeat && NET.hostRoute) hello(NET.hostRoute.r, NET.hostRoute.peer); }, 1000));
  NET.timers.push(setTimeout(() => {
    if (NET.role === 'client' && !NET.latest) { leave(); menuError('Маршрутка ' + code + ' не найдена. Проверь код и что хост в лобби. Если сеть рабочая/офисная — она может резать соединение.'); }
  }, 60000));
}

function onClientData(d) {
  if (!d || d.t !== 's') return;
  for (const e of d.fx) if (e.id > NET.lastFx) { NET.lastFx = e.id; handleFx(e); }
  const v = parse(d);
  const prevPh = NET.latest && NET.latest.ph;
  NET.latest = v;
  NET.gotSeat = v.seats.some(s => s.pid === NET.myPid);
  if (v.ph !== prevPh || v.ph === 'lobby') phaseUI(v);
}

function phaseUI(v) {
  menuError('');
  if (v.ph === 'lobby') {
    show('lobby');
    $('lobbyCode').textContent = NET.code;
    $('lobbyStatus').textContent = NET.gotSeat ? 'Ты в маршрутке. Можно пересесть.' : 'Садимся…';
    $('btnStart').classList.add('hidden'); $('waitHost').classList.remove('hidden');
    refreshLobby(v.seats);
  } else if (v.ph === 'play') show(null);
  else if (v.ph === 'end') fillEnd(v.res, v.st || {}, v.sc, false);
}

function leave() {
  const rooms = NET.rooms;
  NET.timers.forEach(t => { clearInterval(t); clearTimeout(t); }); NET.timers = [];
  NET.role = null; NET.rooms = []; NET.hostRoute = null; NET.routes.clear(); NET.latest = null; NET.myPid = null;
  for (const r of rooms) { try { r.room.leave(); } catch (e) {} }
  PHASE = 'menu'; SM.items.clear(); SM.hands = null;
  show('menu');
}

// ---------- интерфейс ----------
function show(id) {
  for (const k of ['menu', 'lobby', 'end']) $(k).classList.toggle('hidden', k !== id);
  if (id && document.pointerLockElement) document.exitPointerLock();
}
function menuError(s) { $('menuErr').textContent = s || ''; }
let lobbyKey = '';

function refreshLobby(si) {
  const key = JSON.stringify(si) + NET.myPid;
  if (key === lobbyKey) return;
  lobbyKey = key;
  const my = si.findIndex(s => s.pid === NET.myPid);
  $('seats').innerHTML = si.map((s, i) => `
    <div class="seat ${i === my ? 'me' : ''}" style="--c:${COLORS[i]}">
      <div class="sn">${SEAT_NAMES[i]}</div>
      <div class="who">${esc(s.name)}${s.bot ? ' <span>(бот)</span>' : ''}${i === my ? ' <span>— это ты</span>' : ''}</div>
      ${s.bot ? `<button data-seat="${i}">Сесть сюда</button>` : ''}
    </div>`).join('');
}

function requestSeat(i) {
  if (NET.role === 'host') moveSeat('host', i);
  else clientSend('ctl', { t: 'seat', s: i });
}

const RANKS = [[0, 'Заяц без билета'], [100, 'Пассажир со стажем'], [200, 'Мастер передачи'], [300, 'Король галёрки'], [420, 'Легенда маршрута №13']];
function fillEnd(res, st, sc, isHost) {
  show('end');
  $('endTitle').textContent = res === 'win' ? 'Доехали до конечной!' : 'Всех высадили из маршрутки!';
  let rank = RANKS[0][1];
  for (const [min, name] of RANKS) if (sc >= min) rank = name;
  $('endRank').textContent = 'Звание: ' + rank;
  $('endStats').innerHTML = [
    ['Передано за проезд', st.fares || 0], ['Сдачи вернули (монет)', st.coins || 0], ['Передано вещей', st.specials || 0],
    ['Укатилось под сиденья', st.lost || 0], ['Разбито банок', st.broken || 0],
  ].map(([k, v]) => `<div><span>${k}</span><b>${v}</b></div>`).join('') + `<div class="total"><span>Рейтинг</span><b>${sc}</b></div>`;
  const host = isHost || NET.role === 'host' || NET.role === 'solo';
  $('btnAgain').classList.toggle('hidden', !host);
  $('endWait').classList.toggle('hidden', host);
}

function startGame() {
  newGame(); PHASE = 'play';
  show(null);
}

// ---------- звук ----------
let AC = null, hum = null;
function audioUnlock() {
  try {
    if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)();
    if (AC.state === 'suspended') AC.resume();
    if (!hum) {
      const o = AC.createOscillator(), f = AC.createBiquadFilter(), g = AC.createGain();
      o.type = 'sawtooth'; o.frequency.value = 45; f.type = 'lowpass'; f.frequency.value = 200; g.gain.value = 0;
      o.connect(f).connect(g).connect(AC.destination); o.start();
      hum = { o, g };
    }
  } catch (e) {}
}
function tone(f, dur, type, vol, f2) {
  if (!AC) return;
  const o = AC.createOscillator(), g = AC.createGain(), t = AC.currentTime;
  o.type = type || 'sine';
  o.frequency.setValueAtTime(f, t);
  if (f2) o.frequency.exponentialRampToValueAtTime(f2, t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(AC.destination);
  o.start(t); o.stop(t + dur + 0.02);
}
function noise(dur, vol, freq) {
  if (!AC) return;
  const n = Math.floor(AC.sampleRate * dur), buf = AC.createBuffer(1, n, AC.sampleRate), ch = buf.getChannelData(0);
  for (let i = 0; i < n; i++) ch[i] = (Math.random() * 2 - 1) * (1 - i / n);
  const src = AC.createBufferSource(); src.buffer = buf;
  const f = AC.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = freq;
  const g = AC.createGain(); g.gain.value = vol;
  src.connect(f).connect(g).connect(AC.destination);
  src.start();
}
const SFX = {
  clink: () => { tone(2400, 0.09, 'triangle', 0.07); tone(3300, 0.07, 'sine', 0.04); },
  thump: () => noise(0.1, 0.25, 400),
  bump: () => { noise(0.25, 0.5, 180); tone(70, 0.25, 'sine', 0.3, 40); },
  honk: () => { tone(520, 0.22, 'sawtooth', 0.09, 330); setTimeout(() => tone(500, 0.18, 'sawtooth', 0.08, 320), 120); },
  ok: () => { tone(700, 0.07, 'square', 0.05); setTimeout(() => tone(1050, 0.1, 'square', 0.05), 70); },
  bad: () => tone(180, 0.35, 'sawtooth', 0.08, 90),
  break: () => { noise(0.4, 0.4, 6000); tone(1800, 0.2, 'triangle', 0.05, 900); },
  splat: () => noise(0.2, 0.35, 900),
  ai: () => tone(900, 0.25, 'square', 0.06, 1400),
  horn: () => { tone(330, 0.45, 'square', 0.06); tone(392, 0.45, 'square', 0.05); },
  whoosh: () => noise(0.18, 0.2, 2500),
  bark: () => { tone(620, 0.08, 'square', 0.08, 380); setTimeout(() => tone(600, 0.1, 'square', 0.08, 360), 140); },
};
function playSnd(n) { try { SFX[n] && SFX[n](); } catch (e) {} }

// ---------- визуальные эффекты ----------
const VS = { t: 0, shake: 0, bubbles: {}, pops: [], parts: [] };
function handleFx(e) {
  switch (e.k) {
    case 'say': VS.bubbles[e.w] = { s: e.s, until: VS.t + 2.6 }; break;
    case 'pop': VS.pops.push({ p: new THREE.Vector3(e.x, e.y, e.z), s: e.s, c: e.c, t: 0, el: null }); break;
    case 'snd': playSnd(e.n); break;
    case 'flash': { const b = $('banner'); b.textContent = e.s; b.classList.remove('go'); void b.offsetWidth; b.classList.add('go'); break; }
    case 'shake': VS.shake = Math.max(VS.shake, e.m); break;
    case 'splash': spawnSplash(e); break;
  }
}

// ---------- сглаживание у клиента ----------
const SM = { items: new Map(), hands: null };
const _qa = new THREE.Quaternion(), _qb = new THREE.Quaternion();
function smooth(t, dt) {
  const f = 1 - Math.exp(-dt * 16);
  const seen = new Set();
  for (const it of t.items) {
    seen.add(it.id);
    const d = SM.items.get(it.id);
    if (!d) { SM.items.set(it.id, { ...it }); continue; }
    const nx = d.x + (it.x - d.x) * f, ny = d.y + (it.y - d.y) * f, nz = d.z + (it.z - d.z) * f;
    _qa.set(d.qx, d.qy, d.qz, d.qw).normalize(); _qb.set(it.qx, it.qy, it.qz, it.qw).normalize(); _qa.slerp(_qb, f);
    Object.assign(d, it); d.x = nx; d.y = ny; d.z = nz; d.qx = _qa.x; d.qy = _qa.y; d.qz = _qa.z; d.qw = _qa.w;
  }
  for (const id of [...SM.items.keys()]) if (!seen.has(id)) SM.items.delete(id);
  if (!SM.hands) SM.hands = t.hands.map(h => ({ ...h }));
  t.hands.forEach((h, i) => {
    const d = SM.hands[i];
    d.st = h.st; d.l = h.l;
    d.x += (h.x - d.x) * f; d.y += (h.y - d.y) * f; d.z += (h.z - d.z) * f;
    d.yw += (h.yw - d.yw) * f; d.pt += (h.pt - d.pt) * f;
  });
  return { ...t, items: [...SM.items.values()].map(i => ({ ...i })), hands: SM.hands.map(h => ({ ...h })) };
}

// ---------- ввод ----------
const SETTINGS = { sens: 1, fov: 75, shadows: true };
try { Object.assign(SETTINGS, JSON.parse(localStorage.getItem('pzp_settings') || '{}')); } catch (e) {}
function saveSettings() { try { localStorage.setItem('pzp_settings', JSON.stringify(SETTINGS)); } catch (e) {} }

// l: 0 — сидим ровно, 1 — наклон вперёд к полу (Пробел), 2 — влево (Q), 3 — вправо (E)
const INP = { g: false, l: 0, th: 0, tp: 0.6, charge: null, tgt: null, aim: null, keys: { space: false, q: false, e: false } };
const CAM = { yaw: 0, pitch: -0.25, dist: 0.9 };
const canvas = $('cv');
const locked = () => document.pointerLockElement === canvas;
function mySeatIn(v) { return v ? v.seats.findIndex(s => s.pid && s.pid === NET.myPid) : -1; }
let curView = null;
const playingSeated = () => curView && curView.ph === 'play' && mySeatIn(curView) >= 0;
function lockMouse() { try { const r = canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch (e) {} }
function updLean() { const k = INP.keys; INP.l = k.space ? 1 : k.q ? 2 : k.e ? 3 : 0; }
const chargeLevel = () => INP.charge == null ? 0 : clamp((performance.now() - INP.charge) / 900, 0, 1);

canvas.addEventListener('mousedown', e => {
  audioUnlock();
  if (!locked()) { if (playingSeated()) lockMouse(); return; }
  if (e.button === 0) INP.g = true;
  if (e.button === 2) INP.charge = performance.now();
});
addEventListener('mouseup', e => {
  if (e.button === 0) INP.g = false;
  if (e.button === 2 && INP.charge != null) { INP.tp = chargeLevel(); INP.th++; INP.charge = null; }
});
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('wheel', e => {
  if (!locked()) return;
  CAM.dist = clamp(CAM.dist - e.deltaY * 0.0008, 0.35, 1.5);
  e.preventDefault();
}, { passive: false });
document.addEventListener('mousemove', e => {
  if (!locked()) return;
  const k = 0.0024 * SETTINGS.sens;
  CAM.yaw = clamp(CAM.yaw - e.movementX * k, -2.9, 2.9);
  CAM.pitch = clamp(CAM.pitch - e.movementY * k, -1.35, 1.2);
});
document.addEventListener('pointerlockchange', () => {
  if (!locked()) { INP.g = false; INP.charge = null; INP.keys = { space: false, q: false, e: false }; updLean(); }
});
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { INP.keys.space = true; e.preventDefault(); }
  if (e.code === 'KeyQ') INP.keys.q = true;
  if (e.code === 'KeyE') INP.keys.e = true;
  updLean();
  const n = '12345'.indexOf(e.key);
  if (n >= 0 && !e.repeat) shout(n);
});
addEventListener('keyup', e => {
  if (e.code === 'Space') INP.keys.space = false;
  if (e.code === 'KeyQ') INP.keys.q = false;
  if (e.code === 'KeyE') INP.keys.e = false;
  updLean();
});
addEventListener('blur', () => { INP.g = false; INP.charge = null; INP.keys = { space: false, q: false, e: false }; updLean(); });
function shout(i) {
  if (NET.role === 'host' || NET.role === 'solo') doShout(seatOf(NET.myPid), i);
  else clientSend('ctl', { t: 'say', i });
}

// пауза и настройки
$('sens').value = SETTINGS.sens; $('fov').value = SETTINGS.fov;
const showSet = () => { $('sensVal').textContent = (+SETTINGS.sens).toFixed(1); $('fovVal').textContent = SETTINGS.fov + '°'; };
showSet();
$('sens').oninput = e => { SETTINGS.sens = +e.target.value; showSet(); saveSettings(); };
$('fov').oninput = e => { SETTINGS.fov = +e.target.value; showSet(); saveSettings(); };
$('shadows').checked = SETTINGS.shadows;
$('shadows').onchange = e => setShadows(e.target.checked);
$('btnResume').onclick = () => { audioUnlock(); lockMouse(); };
$('btnPauseMenu').onclick = () => leave();

// =====================================================================
// ---------- 3D-сцена ----------
// =====================================================================
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;
renderer.shadowMap.enabled = SETTINGS.shadows;
renderer.shadowMap.type = THREE.PCFShadowMap;
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fd3f0');
scene.fog = new THREE.Fog('#cfe6f2', 25, 110);
const camera = new THREE.PerspectiveCamera(SETTINGS.fov, 1, 0.03, 250);
function setShadows(on) {
  SETTINGS.shadows = on; saveSettings();
  if ($('shadows')) $('shadows').checked = on;
  renderer.shadowMap.enabled = on;
  scene.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.needsUpdate = true; }); });
}
// если кадры тяжёлые — сами выключаем тени
const PERF = { t: 0, sum: 0, n: 0, done: false };
function perfWatch(dt, playing) {
  if (PERF.done || !playing || !SETTINGS.shadows) return;
  PERF.t += dt; PERF.sum += dt; PERF.n++;
  if (PERF.t < 3) return;
  if (PERF.sum / PERF.n > 1 / 33) { setShadows(false); handleFx({ k: 'flash', s: 'Тени выключены для скорости' }); }
  PERF.done = true;
}
function resize() {
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

scene.add(new THREE.HemisphereLight('#e4f1ff', '#7a6a55', 1.25));
scene.add(new THREE.AmbientLight('#ffffff', 0.25));
const sun = new THREE.DirectionalLight('#fff0d2', 2.6);
sun.position.set(-1.5, 9, 6); sun.target.position.set(2.7, 0.6, 0);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -4.5, right: 4.5, top: 4.5, bottom: -4.5, near: 1, far: 20 });
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.02;
scene.add(sun, sun.target);
for (const x of [1.3, 3.6]) { const l = new THREE.PointLight('#fff1d8', 1.6, 4.5, 1.6); l.position.set(x, 1.8, 0); scene.add(l); }

const MATS = {};
function mat(c, rough = 0.85, metal = 0) {
  const k = c + rough + metal;
  return MATS[k] || (MATS[k] = new THREE.MeshStandardMaterial({ color: c, roughness: rough, metalness: metal }));
}
const GEO = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 16), sph: new THREE.SphereGeometry(1, 18, 14) };
function shade(m) { m.castShadow = true; m.receiveShadow = true; return m; }
function box(parent, w, h, d, c, x, y, z) { const m = shade(new THREE.Mesh(GEO.box, typeof c === 'string' ? mat(c) : c)); m.scale.set(w, h, d); m.position.set(x, y, z); parent.add(m); return m; }
function boxR(parent, x0, x1, y0, y1, z0, z1, c) { return box(parent, x1 - x0, y1 - y0, z1 - z0, c, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); }
function rbox(parent, x0, x1, y0, y1, z0, z1, c, r = 0.025) {
  const w = x1 - x0, h = y1 - y0, d = z1 - z0;
  const m = shade(new THREE.Mesh(new RoundedBoxGeometry(w, h, d, 3, Math.min(r, w / 2.1, h / 2.1, d / 2.1)), typeof c === 'string' ? mat(c) : c));
  m.position.set((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); parent.add(m); return m;
}
function cyl(parent, r, h, c, x, y, z) { const m = shade(new THREE.Mesh(GEO.cyl, typeof c === 'string' ? mat(c) : c)); m.scale.set(r, h, r); m.position.set(x, y, z); parent.add(m); return m; }
function sph(parent, r, c, x, y, z) { const m = shade(new THREE.Mesh(GEO.sph, typeof c === 'string' ? mat(c) : c)); m.scale.set(r, r, r); m.position.set(x, y, z); parent.add(m); return m; }

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
  return t;
}
const FONT = (w, s) => `${w} ${s}px Rubik, system-ui, sans-serif`;
function signTex(text, bg, fg, w = 512, h = 128, size = 54) {
  return canvasTex(w, h, (g, W, H) => {
    g.fillStyle = bg; g.fillRect(0, 0, W, H);
    g.fillStyle = fg; g.font = FONT(900, size); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, W / 2, H / 2 + 3, W - 20);
  });
}
// плоская табличка; rotY: 0 — смотрит в +z, PI — в −z, PI/2 — в +x
function sign(parent, tex, w, h, x, y, z, rotY) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.7 }));
  m.position.set(x, y, z); m.rotation.y = rotY; m.receiveShadow = true; parent.add(m); return m;
}

// ---------- модели (Quaternius, CC0) ----------
const CHAR_FILES = ['m_Suit', 'm_Casual_Hoodie', 'm_Farmer', 'm_Punk', 'm_Casual_2', 'w_Casual', 'w_Formal', 'w_Worker'];
const BOT_MODEL = ['w_Casual', 'm_Suit', 'm_Casual_Hoodie', 'm_Punk'];
const PLAYER_MODEL = ['m_Casual_2', 'w_Formal', 'w_Worker', 'm_Farmer'];
const CHARS = {};
let PROPS = null;
const propFit = {};
async function loadAssets() {
  const L = new GLTFLoader();
  await Promise.all([
    ...CHAR_FILES.map(async n => { CHARS[n] = await L.loadAsync('models/chars/' + n + '.glb'); }),
    L.loadAsync('models/props.glb').then(g => { PROPS = g.scene; }),
  ]);
}
// предмет из набора, вписанный в размер maxDim и отцентрованный
function propClone(name, maxDim) {
  const src = PROPS.getObjectByName(name);
  if (!src) return new THREE.Group();
  if (!propFit[name]) {
    const b = new THREE.Box3().setFromObject(src), s = new THREE.Vector3(), c = new THREE.Vector3();
    b.getSize(s); b.getCenter(c);
    propFit[name] = { max: Math.max(s.x, s.y, s.z), c, s };
  }
  const f = propFit[name], k = maxDim / f.max;
  const inner = src.clone(true);
  inner.position.set(-f.c.x * k, -f.c.y * k, -f.c.z * k);
  inner.scale.setScalar(k);
  inner.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.material = o.material.clone(); } });
  const g = new THREE.Group(); g.add(inner);
  return g;
}

// ---------- автобус ----------
const staticMeshes = [];
const straps = [];
let freshener = null;
function floorTex() {
  const t = canvasTex(256, 256, (g, W, H) => {
    g.fillStyle = '#5d636c'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#525861';
    for (let y = 8; y < H; y += 32) for (let x = 8; x < W; x += 32) { g.beginPath(); g.arc(x + (y / 32 % 2) * 16, y, 7, 0, Math.PI * 2); g.fill(); }
    g.fillStyle = 'rgba(255,255,255,.04)'; for (let i = 0; i < 400; i++) g.fillRect(Math.random() * W, Math.random() * H, 2, 2);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(10, 4);
  return t;
}
function buildBus() {
  const g = new THREE.Group(); scene.add(g);
  // всё статичное с цветом — скруглёнными коробками (сиденья, касса, торпеда)
  for (const b of staticBoxes()) if (b.c) staticMeshes.push(rbox(g, b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, b.c, 0.03));
  staticMeshes.push(boxR(g, 0, BUS_LEN, -0.05, 0, -1, 1, new THREE.MeshStandardMaterial({ map: floorTex(), roughness: 0.95 })));
  boxR(g, 0.3, 4.8, 0.001, 0.006, -0.17, 0.17, mat('#3e4249'));
  staticMeshes.push(boxR(g, 0, BUS_LEN, BUS_H, BUS_H + 0.05, -1, 1, '#f1eee6'));
  const WX = [[0.35, 1.3], [1.45, 2.35], [2.5, 3.4], [3.55, 4.45], [4.6, 5.25]];
  const glass = new THREE.MeshStandardMaterial({ color: '#d6f0ff', transparent: true, opacity: 0.1, depthWrite: false, roughness: 0.05 });
  for (const sd of [-1, 1]) {
    const z0 = sd > 0 ? BUS_HALF : -BUS_HALF - 0.04, z1 = z0 + 0.04;
    staticMeshes.push(boxR(g, 0, BUS_LEN, 0, 0.55, z0, z1, '#3f5f82'));
    staticMeshes.push(boxR(g, 0, BUS_LEN, 0.55, 0.95, z0, z1, '#efe6d0'));
    staticMeshes.push(boxR(g, 0, BUS_LEN, 1.55, BUS_H, z0, z1, '#efe6d0'));
    boxR(g, 0, BUS_LEN, 0.53, 0.57, z0 - sd * 0.01, z1 - sd * 0.01, mat('#c9ced4', 0.3, 0.6));
    let px = 0;
    for (const [a, b] of WX) {
      staticMeshes.push(boxR(g, px, a, 0.95, 1.55, z0, z1, '#e2d8bf'));
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(b - a, 0.6), glass); gl.position.set((a + b) / 2, 1.25, sd * (BUS_HALF - 0.005)); g.add(gl);
      boxR(g, a, b, 0.93, 0.97, sd * BUS_HALF - 0.06, sd * BUS_HALF, mat('#9aa0a6', 0.4, 0.5));
      px = b;
    }
    staticMeshes.push(boxR(g, px, BUS_LEN, 0.95, 1.55, z0, z1, '#e2d8bf'));
  }
  // лобовое и заднее
  staticMeshes.push(boxR(g, -0.04, 0, 1.75, BUS_H, -1, 1, '#e2d8bf'));
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.75), glass); ws.position.set(0.005, 1.37, 0); ws.rotation.y = Math.PI / 2; g.add(ws);
  staticMeshes.push(boxR(g, BUS_LEN, BUS_LEN + 0.04, 1.1, 1.6, -1, -0.5, '#efe6d0'));
  staticMeshes.push(boxR(g, BUS_LEN, BUS_LEN + 0.04, 1.1, 1.6, 0.5, 1, '#efe6d0'));
  staticMeshes.push(boxR(g, BUS_LEN, BUS_LEN + 0.04, 1.6, BUS_H, -1, 1, '#efe6d0'));
  const bw = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.5), glass); bw.position.set(BUS_LEN - 0.005, 1.35, 0); bw.rotation.y = -Math.PI / 2; g.add(bw);
  staticMeshes.push(boxR(g, BUS_LEN, BUS_LEN + 0.04, 0, 1.1, -1, 1, '#efe6d0'));
  // поручни и петли
  const chrome = mat('#d0d5db', 0.3, 0.7);
  for (const z of [-0.55, 0.55]) {
    const r = cyl(g, 0.015, 4.7, chrome, 2.85, 1.78, z); r.rotation.z = Math.PI / 2;
    for (let x = 0.9; x < 5.0; x += 0.6) {
      const p = new THREE.Group(); p.position.set(x, 1.78, z); g.add(p);
      box(p, 0.02, 0.18, 0.03, '#666', 0, -0.09, 0);
      const ring = shade(new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 6, 16), mat('#444'))); ring.position.y = -0.22; ring.rotation.y = Math.PI / 2; p.add(ring);
      straps.push(p);
    }
  }
  for (const S of SEATS) cyl(g, 0.025, 0.37, chrome, S.x, 0.185, S.z);
  // плафоны
  for (let x = 1; x < 5; x += 1.3) boxR(g, x - 0.25, x + 0.25, BUS_H - 0.02, BUS_H, -0.08, 0.08, new THREE.MeshBasicMaterial({ color: '#fffbe6' }));
  // кабина: руль, иконка, зеркало, ёлочка
  const wheel = shade(new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 8, 24), mat('#222')));
  wheel.position.set(0.4, 1.0, 0.5); wheel.rotation.y = Math.PI / 2; wheel.rotation.x = 0.5; g.add(wheel);
  box(g, 0.02, 0.08, 0.06, mat('#d4a017', 0.4, 0.6), 0.2, 1.05, 0.0);
  box(g, 0.04, 0.07, 0.25, '#333', 0.08, 1.65, 0.05);
  freshener = new THREE.Group(); freshener.position.set(0.1, 1.6, 0.05); g.add(freshener);
  box(freshener, 0.003, 0.12, 0.002, '#ddd', 0, -0.06, 0);
  const tree = shade(new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.13, 3), mat('#2e7d32'))); tree.position.y = -0.18; tree.scale.z = 0.2; freshener.add(tree);
  // таблички
  sign(g, signTex('№ 13  АВТОВОКЗАЛ — КОНЕЧНАЯ', '#1e1e1e', '#ffb300', 1024, 96, 52), 1.8, 0.16, 0.01, 1.82, 0, Math.PI / 2);
  sign(g, signTex('КАССА', '#5c3a1a', '#ffd54f', 256, 96, 56), 0.3, 0.11, TRAY.x1 + 0.03, 0.7, TRAY_C.z, Math.PI / 2);
  sign(g, signTex('ПЕРЕДАЁМ ЗА ПРОЕЗД!', '#c62828', '#fff'), 0.8, 0.2, 1.4, 1.72, BUS_HALF - 0.005, Math.PI);
  sign(g, signTex('ПРОЕЗД 50 ₽', '#1565c0', '#fff'), 0.6, 0.15, 2.0, 1.72, -BUS_HALF + 0.005, 0);
  sign(g, signTex('ДВЕРЬЮ НЕ ХЛОПАТЬ', '#fff', '#c62828'), 0.7, 0.17, 3.1, 1.72, BUS_HALF - 0.005, Math.PI);
  sign(g, signTex('ОСТАНОВКИ ПО ТРЕБОВАНИЮ', '#fff', '#1e1e1e', 640, 128, 50), 0.8, 0.16, 4.0, 1.72, -BUS_HALF + 0.005, 0);
  sign(g, signTex('СДАЧУ ПЕРЕДАЁМ НАЗАД', '#2e7d32', '#fff', 640, 128, 50), 0.7, 0.14, BUS_LEN - 0.005, 1.7, 0, -Math.PI / 2);
  // кузов снаружи — виден в окна при поворотах головы
  const shell = mat('#f4c11d', 0.5);
  boxR(g, -0.3, BUS_LEN + 0.3, -0.45, 0.0, -1.15, 1.15, '#2a2a2a');
  for (const sd of [-1, 1]) boxR(g, -0.3, BUS_LEN + 0.3, 0, 0.95, sd * 1.06 - 0.05, sd * 1.06 + 0.05, shell);
  for (const [x, sd] of [[0.9, 1], [0.9, -1], [4.4, 1], [4.4, -1]]) { const w = cyl(g, 0.36, 0.25, '#1d1d1f', x, -0.1, sd * 1.05); w.rotation.x = Math.PI / 2; }
}

// ---------- улица ----------
const movers = [];
const traffic = [];
function buildStreet() {
  const g = new THREE.Group(); scene.add(g);
  const road = box(g, 400, 0.1, 16, '#4a4d55', 0, -0.5, 1.5); road.castShadow = false;
  box(g, 400, 0.1, 80, '#7da35a', 0, -0.62, 0).castShadow = false;
  for (const sd of [-1, 1]) box(g, 400, 0.2, 4, '#a7a7a7', 0, -0.4, 1.5 + sd * 10);
  const winTex = canvasTex(64, 64, (c, W, H) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#4f6f91'; c.fillRect(14, 12, 36, 32);
    c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(14, 12, 10, 32);
  });
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  const palette = ['#e9e1cf', '#d8cdb6', '#cfd8dc', '#e6c9b8', '#c9d6c4', '#f0e6d2', '#bcc6cf'];
  for (const sd of [-1, 1]) {
    for (let i = 0; i < 12; i++) {
      const tex = winTex.clone(); tex.needsUpdate = true;
      const m = shade(new THREE.Mesh(GEO.box, new THREE.MeshStandardMaterial({ color: pick(palette), map: tex, roughness: 0.9 })));
      g.add(m);
      const roof = box(g, 1, 1, 1, '#8d8d8d', 0, 0, 0);
      const o = { m, roof, span: 144, kind: 'bld', sd };
      reshapeBuilding(o);
      m.position.x = roof.position.x = -72 + i * 12;
      movers.push(o);
    }
    for (let i = 0; i < 9; i++) {
      const lamp = propClone('Streetlight_Single', 6.5); g.add(lamp);
      lamp.position.set(-72 + i * 16, -0.4 + 3.25, 1.5 + sd * 8.6);
      lamp.rotation.y = sd > 0 ? Math.PI : 0;
      movers.push({ m: lamp, span: 144 });
    }
    for (let i = 0; i < 10; i++) {
      const p = new THREE.Group(); g.add(p);
      cyl(p, 0.12, 1.6, '#6d4c41', 0, 0.4, 0);
      const c = shade(new THREE.Mesh(new THREE.IcosahedronGeometry(1.2, 0), mat('#4a9a4f'))); c.position.y = 2.2; c.scale.y = 1.3; p.add(c);
      p.position.set(-65 + i * 14 + rand(-3, 3), -0.4, 1.5 + sd * rand(11.5, 13));
      movers.push({ m: p, span: 140 });
    }
  }
  for (const [name, x] of [['TrafficLight', -40], ['Sign_Stop', 10], ['Sign_NoParking', 40], ['Sign_Triangle', -10]]) {
    const o = propClone(name, name === 'TrafficLight' ? 4.2 : 2.6); g.add(o);
    o.position.set(x, -0.4 + (name === 'TrafficLight' ? 2.1 : 1.3), -6.6);
    o.rotation.y = Math.PI / 2;
    movers.push({ m: o, span: 150 });
  }
  for (let i = 0; i < 25; i++) {
    const d = box(g, 2.5, 0.02, 0.15, '#eeeeee', -75 + i * 6, -0.44, 2.2); d.castShadow = false;
    movers.push({ m: d, span: 150 });
  }
  // встречка
  const cars = [['Bus', 10], ['Taxi', 4.4], ['SchoolBus', 9.5], ['Ambulance', 5.8], ['Taxi', 4.4]];
  cars.forEach(([name, len], i) => {
    const car = propClone(name, len);
    const f = propFit[name];
    if (f.s.z > f.s.x) car.rotation.y = Math.PI / 2; // длина модели вдоль z → разворачиваем вдоль x
    car.userData.h = f.s.y * len / f.max;
    car.position.set(-90 - i * 40, -0.45 + car.userData.h / 2, 4.6);
    g.add(car);
    traffic.push({ m: car, v: rand(9, 14), wait: i * 3 });
  });
}
function reshapeBuilding(o) {
  const w = rand(7, 11), h = rand(8, 26), d = rand(7, 10);
  o.m.scale.set(w, h, d);
  o.m.position.y = h / 2 - 0.4;
  o.m.position.z = 1.5 + o.sd * (13 + d / 2 + rand(0, 3));
  o.m.material.map.repeat.set(Math.round(w / 1.6), Math.round(h / 2.8));
  o.roof.scale.set(w + 0.3, 0.4, d + 0.3);
  o.roof.position.set(o.m.position.x, h - 0.2, o.m.position.z);
}
function moveStreet(speed, dt) {
  const dx = speed * MAX_SPEED * dt;
  for (const o of movers) {
    o.m.position.x += dx;
    if (o.roof) o.roof.position.x = o.m.position.x;
    if (o.m.position.x > 75) { o.m.position.x -= o.span; if (o.kind === 'bld') reshapeBuilding(o); }
  }
  for (const c of traffic) {
    if (c.wait > 0) { c.wait -= dt; continue; }
    c.m.position.x += (c.v + speed * MAX_SPEED) * dt;
    if (c.m.position.x > 90) { c.m.position.x = -90; c.v = rand(9, 14); c.wait = rand(1, 6); }
  }
}

// ---------- люди на скелетах ----------
const _v1 = new THREE.Vector3(), _v2 = new THREE.Vector3(), _v3 = new THREE.Vector3();
const _q1 = new THREE.Quaternion(), _q2 = new THREE.Quaternion(), _q3 = new THREE.Quaternion();
const FWD = new THREE.Vector3(-1, 0, 0), UP = new THREE.Vector3(0, 1, 0);
const wpos = (o, v = new THREE.Vector3()) => o.getWorldPosition(v);

// повернуть кость так, чтобы направление «кость → child» смотрело в target (мир)
function aim(bone, child, target) {
  const p = wpos(bone, _v1), c = wpos(child, _v2);
  const d1 = c.sub(p).normalize(), d2 = _v3.set(target.x - p.x, target.y - p.y, target.z - p.z).normalize();
  if (d2.lengthSq() < 1e-6) return;
  _q1.setFromUnitVectors(d1, d2);
  bone.getWorldQuaternion(_q2);
  _q1.multiply(_q2);
  bone.parent.getWorldQuaternion(_q3).invert();
  bone.quaternion.copy(_q3.multiply(_q1));
  bone.updateMatrixWorld(true);
}
// повернуть кость на мировую дельту q
function rotWorld(bone, q) {
  bone.getWorldQuaternion(_q2);
  _q1.copy(q).multiply(_q2);
  bone.parent.getWorldQuaternion(_q3).invert();
  bone.quaternion.copy(_q3.multiply(_q1));
  bone.updateMatrixWorld(true);
}

function lookOf(s, v) {
  const se = v.seats[s];
  if (!se || se.bot) return { model: BOT_MODEL[s], name: BOTS[s].name, color: null };
  return { model: PLAYER_MODEL[s], name: se.name, color: COLORS[s] };
}

function labelSprite(text, bg, fg) {
  const tex = canvasTex(512, 96, (g, W, H) => {
    g.font = FONT(800, 44);
    const tw = Math.min(W - 8, g.measureText(text).width + 40);
    g.fillStyle = bg; g.beginPath(); g.roundRect((W - tw) / 2, 8, tw, H - 16, 36); g.fill();
    g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, W / 2, H / 2 + 2, W - 30);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
  sp.scale.set(0.5, 0.094, 1); sp.renderOrder = 10;
  return sp;
}

// сидящий человек: hips — куда посадить таз (мир)
function makePerson(model, hips, label, labelColor) {
  const root = SkeletonUtils.clone(CHARS[model].scene);
  const B = {}, heads = [];
  root.traverse(o => {
    if (o.isBone) B[o.name] = o;
    else if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; o.frustumCulled = false; }
    else if (/Pistol|Sword|Gun|Knife|Axe|Shield|Rifle/i.test(o.name)) o.visible = false;
    if (!o.isBone && /_Head$/.test(o.name)) heads.push(o);
  });
  const g = new THREE.Group(); g.add(root); scene.add(g);
  root.rotation.y = -Math.PI / 2;
  g.updateMatrixWorld(true);
  const hw = wpos(B.Hips);
  g.position.set(hips.x - hw.x, hips.y - hw.y, hips.z - hw.z);
  g.updateMatrixWorld(true);
  const rest = [];
  root.traverse(o => { if (o.isBone) rest.push([o, o.quaternion.clone(), o.position.clone()]); });
  const len = {};
  for (const S of ['L', 'R']) {
    len[S] = [wpos(B['UpperArm' + S]).distanceTo(wpos(B['LowerArm' + S])), wpos(B['LowerArm' + S]).distanceTo(wpos(B['Wrist' + S]))];
  }
  const lab = labelSprite(label, labelColor || 'rgba(30,30,40,0.7)', labelColor ? '#111' : '#eee');
  scene.add(lab);
  return { g, root, B, rest, len, heads, label: lab, model };
}
function disposePerson(P) {
  scene.remove(P.g, P.label);
  P.label.material.map.dispose(); P.label.material.dispose();
}

// рука: двухзвенный IK со «резиновым» вытягиванием, если не хватает длины
function ikArm(P, S, target, out) {
  const B = P.B, up = B['UpperArm' + S], lo = B['LowerArm' + S], wr = B['Wrist' + S];
  const sp = wpos(up, new THREE.Vector3());
  const dx = target.x - sp.x, dy = target.y - sp.y, dz = target.z - sp.z;
  const dist = Math.hypot(dx, dy, dz) || 0.001;
  const [l1, l2] = P.len[S];
  const f = clamp(dist / (l1 + l2 - 0.01), 1, 1.9);
  if (f > 1) { lo.position.multiplyScalar(f); wr.position.multiplyScalar(f); up.updateMatrixWorld(true); }
  const L1 = l1 * f, L2 = l2 * f, d = Math.min(dist, L1 + L2 - 0.001);
  const a = (L1 * L1 - L2 * L2 + d * d) / (2 * d), h = Math.sqrt(Math.max(0, L1 * L1 - a * a));
  const ux = dx / dist, uy = dy / dist, uz = dz / dist;
  let px = out.x * 0.7, py = -1, pz = out.z * 0.7;
  const dot = px * ux + py * uy + pz * uz;
  px -= dot * ux; py -= dot * uy; pz -= dot * uz;
  const pl = Math.hypot(px, py, pz) || 1;
  aim(up, lo, { x: sp.x + ux * a + px / pl * h, y: sp.y + uy * a + py / pl * h, z: sp.z + uz * a + pz / pl * h });
  aim(lo, wr, target);
}

// поза сидя: ноги вперёд, корпус с наклоном, голова по взгляду, руки к целям
function posePerson(P, o) {
  for (const [b, q, p] of P.rest) { b.quaternion.copy(q); b.position.copy(p); }
  P.g.updateMatrixWorld(true);
  const B = P.B;
  // корпус
  const lo = o.lean || { x: 0, y: 0, z: 0 };
  const sway = o.sway || 0;
  if (lo.x || lo.y || lo.z || sway) {
    const n = wpos(B.Neck, new THREE.Vector3());
    aim(B.Abdomen, B.Neck, { x: n.x + lo.x * 1.3 + sway, y: n.y + lo.y * 0.7, z: n.z + lo.z * 1.3 });
  }
  // ноги
  for (const S of ['L', 'R']) {
    const hip = wpos(B['UpperLeg' + S], new THREE.Vector3());
    aim(B['UpperLeg' + S], B['LowerLeg' + S], { x: hip.x - 0.42, y: hip.y - 0.03, z: hip.z });
    const kn = wpos(B['LowerLeg' + S], new THREE.Vector3());
    aim(B['LowerLeg' + S], B['Foot' + S], { x: kn.x - 0.06, y: kn.y - 0.45, z: kn.z });
  }
  // голова: сначала кивок вокруг «правой» оси тела, потом поворот вокруг вертикали
  if (o.yaw || o.pitch) {
    _q1.setFromAxisAngle(_v1.set(0, 0, -1), clamp(o.pitch || 0, -1.1, 1.0));
    const qy = new THREE.Quaternion().setFromAxisAngle(UP, clamp(o.yaw || 0, -2.0, 2.0) * 0.85);
    const q = qy.multiply(_q1.clone());
    rotWorld(B.Head, q);
  }
  // руки
  const hipsW = wpos(B.Hips, new THREE.Vector3());
  for (const S of ['L', 'R']) {
    const sh = wpos(B['UpperArm' + S], new THREE.Vector3());
    const out = { x: 0, z: Math.sign(sh.z - hipsW.z) || 1 };
    let t = o.arms && o.arms[S];
    if (!t) { // ладонь на колене
      const kn = wpos(B['LowerLeg' + S], new THREE.Vector3());
      t = { x: (kn.x + hipsW.x) / 2 - 0.04, y: kn.y + 0.1, z: kn.z + (sh.z - kn.z) * 0.2 };
    } else {
      // запястье чуть не доходит до точки хвата — там ладонь
      const d = Math.hypot(t.x - sh.x, t.y - sh.y, t.z - sh.z) || 1;
      t = { x: t.x - (t.x - sh.x) / d * 0.07, y: t.y - (t.y - sh.y) / d * 0.07, z: t.z - (t.z - sh.z) / d * 0.07 };
    }
    ikArm(P, S, t, out);
  }
}

const persons = [null, null, null, null];
let driverP = null;
const npcs = [];
function ensurePersons(v) {
  for (let s = 0; s < 4; s++) {
    const L = lookOf(s, v), key = L.model + '|' + L.name;
    if (persons[s] && persons[s].key === key) continue;
    if (persons[s]) disposePerson(persons[s]);
    persons[s] = makePerson(L.model, { x: SEATS[s].x + 0.1, y: 0.53, z: SEATS[s].z }, L.name, L.color);
    persons[s].key = key;
  }
  if (!driverP) {
    driverP = makePerson('m_Farmer', { x: 0.85, y: 0.6, z: 0.5 }, 'Водитель', null);
    npcs.push(makePerson('w_Worker', { x: 5.05, y: 0.53, z: -0.35 }, 'Тётя Люда', null));
    npcs.push(makePerson('m_Suit', { x: 5.05, y: 0.53, z: 0.35 }, '', null));
    npcs[1].label.visible = false;
  }
}
const aisleArm = s => (SEATS[s].z < 0 ? 'L' : 'R');

// ---------- предметы ----------
const noteTex = {};
function getNoteTex(v) {
  if (noteTex[v]) return noteTex[v];
  return (noteTex[v] = canvasTex(256, 120, (g, W, H) => {
    g.fillStyle = NOTE_COLOR[v] || '#9ccc65'; g.fillRect(0, 0, W, H);
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 6; g.strokeRect(10, 10, W - 20, H - 20);
    g.fillStyle = 'rgba(0,0,0,.7)'; g.font = FONT(900, 64); g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(v + '₽', W / 2, H / 2 + 4);
    g.font = FONT(700, 14); g.fillText('БИЛЕТ БАНКА РОССИИ', W / 2, 24);
  }));
}
const destMat = {};
function makeItemMesh(type, val, dest) {
  const T = TYPES[type];
  let g;
  const M = (c, r = 0.7, m = 0) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  if (T.prop) g = propClone(T.prop, Math.max(...T.s));
  else {
    g = new THREE.Group();
    switch (type) {
      case 'fare': {
        const tex = getNoteTex(val), side = M(NOTE_COLOR[val] || '#9ccc65'), face = new THREE.MeshStandardMaterial({ map: tex, roughness: 0.8 });
        const m = shade(new THREE.Mesh(GEO.box, [side, side, face, face, side, side])); m.scale.set(0.15, 0.006, 0.07); g.add(m);
        break;
      }
      case 'coin': cyl(g, 0.02, 0.006, M('#f2c94c', 0.35, 0.85), 0, 0, 0); break;
      case 'goose': {
        const w = M('#fafafa', 0.9);
        const b = sph(g, 1, w, 0.03, -0.02, 0); b.scale.set(0.17, 0.09, 0.085);
        const n = cyl(g, 0.025, 0.16, w, -0.12, 0.05, 0); n.rotation.z = 0.5;
        sph(g, 0.04, w, -0.16, 0.13, 0);
        const bk = shade(new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 6), M('#ff9800'))); bk.position.set(-0.21, 0.125, 0); bk.rotation.z = Math.PI / 2; g.add(bk);
        sph(g, 0.009, M('#111'), -0.18, 0.145, 0.03); sph(g, 0.009, M('#111'), -0.18, 0.145, -0.03);
        for (const z of [-0.03, 0.03]) cyl(g, 0.007, 0.06, M('#ff9800'), 0.03, -0.1, z);
        const w1 = sph(g, 1, M('#e6e6e6', 0.9), 0.05, 0.02, 0.07); w1.scale.set(0.11, 0.05, 0.02); g.userData.wing = w1;
        break;
      }
      case 'cactus': {
        const green = M('#3f9a4a', 0.8);
        cyl(g, 0.06, 0.08, M('#c1642b'), 0, -0.09, 0);
        const body = sph(g, 1, green, 0, 0.03, 0); body.scale.set(0.045, 0.1, 0.045);
        { const a = sph(g, 1, green, 0.05, 0.05, 0); a.scale.set(0.02, 0.045, 0.02); a.rotation.z = 0.6; }
        { const a = sph(g, 1, green, -0.05, 0.08, 0); a.scale.set(0.02, 0.04, 0.02); a.rotation.z = -0.6; }
        sph(g, 0.018, M('#ff6fa5'), 0, 0.13, 0);
        break;
      }
    }
  }
  if (type !== 'fare' && type !== 'coin') {
    const key = dest === 'back' ? 'back' : 'front';
    if (!destMat[key]) destMat[key] = labelSprite(key === 'back' ? '▶ НАЗАД' : '◀ ВОДИТЕЛЮ', key === 'back' ? '#3fa7ff' : '#ff9f1c', '#fff').material;
    const sp = new THREE.Sprite(destMat[key]); sp.scale.set(0.3, 0.056, 1); sp.renderOrder = 9;
    g.add(sp); g.userData.tag = sp;
  }
  scene.add(g);
  return g;
}
function setGlow(g, r, gg, b) {
  g.traverse(o => {
    if (!o.isMesh) return;
    const ms = Array.isArray(o.material) ? o.material : [o.material];
    for (const m of ms) if (m.emissive) m.emissive.setRGB(r, gg, b);
  });
}
const itemMeshes = new Map();
const _q = new THREE.Quaternion();
function syncItems(v, hint) {
  const seen = new Set();
  for (const it of v.items) {
    seen.add(it.id);
    let m = itemMeshes.get(it.id);
    if (!m || m.userData.sq !== !!(it.fl & 2)) {
      if (m) scene.remove(m);
      m = makeItemMesh(it.type, it.val, it.fl & 1 ? 'back' : 'front');
      m.userData.sq = !!(it.fl & 2);
      if (m.userData.sq) m.scale.set(1.3, 0.4, 1.3);
      itemMeshes.set(it.id, m);
    }
    m.position.set(it.x, it.y, it.z);
    _q.set(it.qx, it.qy, it.qz, it.qw).normalize();
    m.quaternion.copy(_q);
    if (m.userData.tag) m.userData.tag.position.set(0, 0.22, 0).applyQuaternion(_q.clone().invert());
    if (m.userData.wing) m.userData.wing.rotation.x = Math.sin(VS.t * 25) * 0.4;
    const blink = Math.sin(VS.t * 12) > 0;
    if (hint === it.id) setGlow(m, 0.35, 0.3, 0.05);
    else if ((it.fl & 4) && blink) setGlow(m, 0.6, 0.05, 0.05);
    else if ((it.fl & 8) && blink) setGlow(m, 0.5, 0.2, 0.0);
    else setGlow(m, 0, 0, 0);
  }
  for (const [id, m] of itemMeshes) if (!seen.has(id)) { scene.remove(m); itemMeshes.delete(id); }
}

// ---------- брызги ----------
function spawnSplash(e) {
  for (let i = 0; i < 14; i++) {
    const m = sph(scene, 0.015, e.c, e.x, e.y, e.z);
    VS.parts.push({ m, v: new THREE.Vector3(rand(-1.5, 1.5), rand(0.5, 2.5), rand(-1.5, 1.5)), t: 0 });
  }
}
function updateParts(dt) {
  for (const p of VS.parts) {
    p.t += dt; p.v.y -= 9.8 * dt;
    p.m.position.addScaledVector(p.v, dt);
    if (p.m.position.y < 0.01) { p.m.position.y = 0.01; p.v.set(0, 0, 0); }
  }
  for (const p of VS.parts) if (p.t > 2.5) scene.remove(p.m);
  VS.parts = VS.parts.filter(p => p.t <= 2.5);
}

// ---------- DOM-оверлей: пузыри и всплывашки ----------
const fxLayer = $('fx');
const bubEls = {};
const _p = new THREE.Vector3();
function toScreen(x, y, z) {
  _p.set(x, y, z).project(camera);
  if (_p.z > 1 || _p.z < -1) return null;
  return { x: (_p.x + 1) / 2 * innerWidth, y: (1 - _p.y) / 2 * innerHeight };
}
function headTop(P) { const h = wpos(P.B.Head, new THREE.Vector3()); h.y += 0.32; return h; }
function bubblePos(who) {
  if (who === 'drv') return driverP ? headTop(driverP) : { x: 0.8, y: 1.6, z: 0.5 };
  if (who === 'npc') return npcs[0] ? headTop(npcs[0]) : { x: 5.0, y: 1.6, z: -0.35 };
  const P = persons[+who];
  return P ? headTop(P) : { x: SEATS[+who].x, y: 1.6, z: SEATS[+who].z };
}
function updateOverlay(v, dt, my) {
  for (const who of Object.keys(VS.bubbles)) {
    const b = VS.bubbles[who];
    let el = bubEls[who];
    if (b.until < VS.t) { if (el) { el.remove(); delete bubEls[who]; } delete VS.bubbles[who]; continue; }
    if (!el) { el = bubEls[who] = document.createElement('div'); el.className = 'bub'; fxLayer.appendChild(el); }
    if (el.textContent !== b.s) el.textContent = b.s;
    let sc;
    if (String(who) === String(my) && v.ph === 'play') sc = { x: innerWidth / 2, y: innerHeight * 0.82 };
    else { const pos = bubblePos(who); sc = toScreen(pos.x, pos.y + 0.08, pos.z); }
    if (!sc) { el.style.display = 'none'; continue; }
    el.style.display = '';
    el.style.left = clamp(sc.x, 80, innerWidth - 80) + 'px';
    el.style.top = clamp(sc.y, 100, innerHeight - 10) + 'px';
  }
  for (const p of VS.pops) {
    p.t += dt;
    if (!p.el) { p.el = document.createElement('div'); p.el.className = 'pop'; p.el.textContent = p.s; p.el.style.color = p.c; fxLayer.appendChild(p.el); }
    const sc = toScreen(p.p.x, p.p.y + p.t * 0.25, p.p.z);
    if (!sc) { p.el.style.display = 'none'; continue; }
    p.el.style.display = ''; p.el.style.left = sc.x + 'px'; p.el.style.top = sc.y + 'px';
    p.el.style.opacity = clamp(1.4 - p.t, 0, 1);
  }
  for (const p of VS.pops) if (p.t > 1.4) p.el.remove();
  VS.pops = VS.pops.filter(p => p.t <= 1.4);
}

// ---------- HUD ----------
function buildRoute() {
  const r = $('route');
  let html = '<div class="line"></div><div class="fill" id="routeFill"></div>';
  STOPS.forEach((s, i) => {
    const x = i / (STOPS.length - 1) * 100;
    html += `<div class="stop" id="st${i}" style="left:${x}%"></div><div class="nm" id="nm${i}" style="left:${x}%;top:${i % 2 ? 38 : 2}px">${s}</div>`;
  });
  html += '<div class="bus" id="routeBus"></div>';
  r.innerHTML = html;
}
buildRoute();
let hudOn = null;
function updateHUD(v, my, canGrab, holding) {
  const on = v.ph === 'play' || v.ph === 'end';
  if (on !== hudOn) { hudOn = on; $('hud').classList.toggle('hidden', !on); }
  const playing = v.ph === 'play' && my >= 0, lk = locked();
  $('hint').classList.toggle('hidden', !(playing && lk));
  $('pause').classList.toggle('hidden', !(playing && !lk));
  $('cross').className = (playing && lk ? '' : 'hidden ') + (holding ? 'hold' : canGrab ? 'can' : '');
  const ch = chargeLevel();
  $('charge').classList.toggle('hidden', !(playing && lk && INP.charge != null));
  $('chargeFill').style.width = ch * 100 + '%';
  if (!on) return;
  $('hudScore').textContent = v.sc;
  const p = clamp((v.tm || 0) / ROUND, 0, 1);
  $('routeFill').style.width = p * 100 + '%';
  $('routeBus').style.left = p * 100 + '%';
  for (let i = 0; i < STOPS.length; i++) {
    const onS = i / (STOPS.length - 1) <= p + 1e-6;
    $('st' + i).classList.toggle('on', onS); $('nm' + i).classList.toggle('on', onS);
  }
  const an = clamp(v.an || 0, 0, 100);
  $('angerFill').style.width = an + '%';
  $('angerPct').textContent = Math.round(an) + '%';
  $('anger').classList.toggle('hot', an > 70 && Math.sin(VS.t * 10) > 0);
}

// ---------- обновление сцены ----------
function idleView() {
  return {
    ph: 'menu', sp: 1, gx: 0, gz: 0, an: 0, sc: 0, tm: 0, items: [],
    hands: SEATS.map(S => ({ x: S.x - 0.15, y: 0.68, z: S.z, st: 0, l: 0, yw: 0, pt: -0.15 })),
    seats: BOTS.map(b => ({ pid: '', name: b.name, bot: true })),
  };
}

const ray = new THREE.Raycaster();
ray.camera = camera;
function rayTargets(my, v) {
  const t = [...staticMeshes];
  for (const it of v.items) if (it.holder !== my) { const m = itemMeshes.get(it.id); if (m) t.push(m); }
  return t;
}
// куда тянуть свою руку: к предмету под прицелом (если зажат хват) или в точку взгляда
function computeMyTarget(my, v) {
  const lean = INP.l, d = lookDir(CAM.yaw, CAM.pitch), hp = headPos(my, lean, CAM.yaw);
  const sh = shoulder(my, lean, CAM.yaw), reach = (lean ? LEAN_REACH : REACH) + 0.12;
  const mine = v.items.some(it => it.holder === my);
  INP.aim = null;
  if (!mine) {
    let bestA = 0.2;
    for (const it of v.items) {
      if (it.holder === my || dist3(it, sh) > reach) continue;
      const vx = it.x - hp.x, vy = it.y - hp.y, vz = it.z - hp.z, l = Math.hypot(vx, vy, vz) || 1;
      const a = Math.acos(clamp((vx * d.x + vy * d.y + vz * d.z) / l, -1, 1));
      if (a < bestA) { bestA = a; INP.aim = it.id; }
    }
    if (INP.aim != null && INP.g) { const it = v.items.find(q => q.id === INP.aim); return { x: it.x, y: it.y, z: it.z }; }
  }
  ray.set(new THREE.Vector3(hp.x, hp.y, hp.z), new THREE.Vector3(d.x, d.y, d.z));
  ray.far = 2.5;
  const hits = ray.intersectObjects(rayTargets(my, v), true).filter(h => h.object.type !== 'Sprite');
  const far = hits.length ? Math.min(hits[0].distance - 0.05, CAM.dist) : CAM.dist;
  return { x: hp.x + d.x * far, y: hp.y + d.y * far, z: hp.z + d.z * far };
}

function updateScene(v, dt, my) {
  ensurePersons(v);
  moveStreet(v.sp || 0, dt);
  let myHand = null, hint = null, holding = false;
  if (my >= 0 && v.ph === 'play' && INP.tgt) {
    myHand = clampHand(my, INP.tgt, INP.l, CAM.yaw);
    const srv = (NET.role === 'client' && NET.latest) ? NET.latest.hands[my] : null;
    for (const it of v.items) {
      if (it.holder !== my) continue;
      holding = true;
      if (srv) { const t = NET.latest.items.find(q => q.id === it.id); if (t) { it.x = myHand.x + (t.x - srv.x); it.y = myHand.y + (t.y - srv.y); it.z = myHand.z + (t.z - srv.z); } }
    }
    if (NET.role !== 'client') myHand = null; // у хоста своя рука и так свежая
    if (!holding) hint = INP.aim;
  }
  syncItems(v, hint);
  const sway = -(v.gx || 0) * 0.12;
  for (let s = 0; s < 4; s++) {
    const P = persons[s];
    const hd = myHand && s === my ? { ...v.hands[s], ...myHand, l: INP.l, yw: CAM.yaw, pt: CAM.pitch } : v.hands[s];
    if (!P || !hd) continue;
    const isMe = s === my && v.ph === 'play';
    for (const h of P.heads) h.visible = !isMe;
    P.label.visible = !isMe;
    const yw = s === my && v.ph === 'play' ? CAM.yaw : hd.yw, pt = s === my && v.ph === 'play' ? CAM.pitch : hd.pt;
    const arms = { L: null, R: null };
    arms[aisleArm(s)] = { x: hd.x, y: hd.y, z: hd.z };
    posePerson(P, {
      lean: leanOffset(hd.l, yw, 1), sway: sway + Math.sin(VS.t * 9 + s) * 0.004 * (v.sp || 0),
      yaw: yw, pitch: pt, arms,
    });
    P.label.position.copy(headTop(P));
  }
  if (driverP) {
    const angry = (v.an || 0) > 60;
    posePerson(driverP, {
      sway, yaw: angry ? 2.0 + Math.sin(VS.t * 2) * 0.2 : Math.sin(VS.t * 0.7) * 0.25, pitch: 0,
      arms: { L: { x: 0.45, y: 1.1, z: 0.62 }, R: { x: 0.45, y: 1.1, z: 0.38 } },
    });
    driverP.label.position.copy(headTop(driverP));
  }
  const slotItems = v.items.filter(it => it.holder === 9);
  npcs.forEach((N, i) => {
    const mine = slotItems.filter(it => (it.z < 0.1) === (i === 0));
    const arms = { L: null, R: null };
    if (mine[0]) arms.L = { x: mine[0].x + 0.05, y: mine[0].y, z: mine[0].z };
    if (mine[1]) arms.R = { x: mine[1].x + 0.05, y: mine[1].y, z: mine[1].z };
    posePerson(N, { sway, yaw: Math.sin(VS.t * 0.5 + i) * 0.4, pitch: -0.1, arms });
    N.label.position.copy(headTop(N));
  });
  for (const p of straps) { p.rotation.z = (v.gx || 0) * 0.9 + Math.sin(VS.t * 3 + p.position.x) * 0.04 * (1 + VS.shake * 5); p.rotation.x = -(v.gz || 0) * 0.9; }
  if (freshener) { freshener.rotation.z = (v.gx || 0) * 1.2 + Math.sin(VS.t * 2.3) * 0.15; freshener.rotation.x = -(v.gz || 0) * 1.2; }
  updateParts(dt);
  return { canGrab: hint !== null, holding };
}

function updateCamera(v, my, dt) {
  VS.shake = Math.max(0, VS.shake - dt * 2.5);
  if (camera.fov !== SETTINGS.fov) { camera.fov = SETTINGS.fov; camera.updateProjectionMatrix(); }
  const sk = VS.shake, sp = v.sp || 0;
  const sx = Math.sin(VS.t * 53) * sk * 0.02, sy = Math.cos(VS.t * 41) * sk * 0.03 + Math.sin(VS.t * 9) * sp * 0.004;
  if (v.ph === 'play' && my >= 0) {
    const hp = headPos(my, INP.l, CAM.yaw), f = lookDir(CAM.yaw, 0);
    camera.position.set(hp.x + f.x * 0.07 + (v.gx || 0) * 0.08 + sx, hp.y + sy, hp.z + f.z * 0.07 - (v.gz || 0) * 0.06);
    camera.rotation.set(CAM.pitch, Math.PI / 2 + CAM.yaw, (v.gz || 0) * 0.1, 'YXZ');
  } else {
    camera.position.set(0.45 + sx, 1.5 + sy, -0.55);
    camera.lookAt(4.6, 0.95 + Math.sin(VS.t * 0.4) * 0.05, 0.2 + Math.sin(VS.t * 0.3) * 0.2);
  }
}

// ---------- главный цикл ----------
let lastT = performance.now(), acc = 0, sendAcc = 0, inAcc = 0, ready = false;
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now; VS.t += dt;
  if (ready) tick(dt);
  requestAnimationFrame(frame);
}
function tick(dt) {
  let view = null;
  if (NET.role === 'host' || NET.role === 'solo') {
    const my = seatOf(NET.myPid);
    if (my >= 0 && curView && curView.ph === 'play') {
      INP.tgt = computeMyTarget(my, curView);
      inputs[my] = { ...INP.tgt, g: INP.g, l: INP.l, yw: CAM.yaw, pt: CAM.pitch, th: INP.th, tp: INP.tp };
    }
    acc += dt;
    let n = 0;
    while (acc >= 1 / 60 && n < 4) { hostStep(1 / 60); acc -= 1 / 60; n++; }
    if (n === 4) acc = 0;
    pruneFx();
    const pkt = buildPacket();
    view = parse(pkt);
    if (NET.role === 'host') {
      sendAcc += dt;
      if (sendAcc >= (PHASE === 'play' ? 1 / 30 : 1 / 8)) { sendAcc = 0; broadcast(pkt); }
      if (PHASE === 'lobby') refreshLobby(view.seats);
    }
  } else if (NET.role === 'client' && NET.latest) {
    view = smooth(NET.latest, dt);
    const my = mySeatIn(view);
    if (my >= 0 && view.ph === 'play' && curView) INP.tgt = computeMyTarget(my, curView);
    inAcc += dt;
    if (inAcc >= 1 / 30 && INP.tgt) {
      inAcc = 0;
      clientSend('in', { x: mm(INP.tgt.x), y: mm(INP.tgt.y), z: mm(INP.tgt.z), g: INP.g ? 1 : 0, l: INP.l, yw: mm(CAM.yaw), pt: mm(CAM.pitch), th: INP.th, tp: Math.round(INP.tp * 100) });
    }
  }
  if (!view) view = idleView();
  curView = view;
  const my = mySeatIn(view);
  const st = updateScene(view, dt, my);
  updateCamera(view, my, dt);
  updateOverlay(view, dt, my);
  updateHUD(view, my, st.canGrab, st.holding);
  perfWatch(dt, view.ph === 'play' && my >= 0 && locked());
  if (hum && AC) {
    const sp = view.sp || 0;
    hum.o.frequency.value = 38 + sp * 40;
    hum.g.gain.value = view.ph === 'menu' ? 0.012 : 0.025 + sp * 0.035;
  }
  renderer.render(scene, camera);
}

// ---------- кнопки меню ----------
function getName() {
  const n = $('name').value.trim().slice(0, 14) || 'Пассажир';
  try { localStorage.setItem('pzp_name', n); } catch (e) {}
  return n;
}
try { $('name').value = localStorage.getItem('pzp_name') || ''; } catch (e) {}
const qRoom = new URLSearchParams(location.search).get('room');
if (qRoom) $('code').value = qRoom.toUpperCase();
const resetCam = () => { CAM.yaw = 0; CAM.pitch = -0.25; CAM.dist = 0.9; };

$('btnCreate').onclick = () => { audioUnlock(); menuError(''); hostCreate(getName()); };
$('btnJoin').onclick = () => { audioUnlock(); resetCam(); clientJoin(getName(), $('code').value); };
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnJoin').click(); });
$('btnSolo').onclick = () => {
  audioUnlock(); menuError('');
  NET.role = 'solo'; NET.myPid = 'host';
  resetSeats(); addPlayer('host', getName());
  resetCam();
  startGame();
};
$('btnStart').onclick = () => { if (NET.role === 'host') { resetCam(); startGame(); } };
$('btnAgain').onclick = () => { if (NET.role === 'host' || NET.role === 'solo') { resetCam(); startGame(); } };
$('btnLeave').onclick = leave;
$('btnMenu').onclick = leave;
$('btnCopy').onclick = () => {
  const url = location.origin + location.pathname + '?room=' + NET.code;
  navigator.clipboard.writeText(url).then(() => { $('btnCopy').textContent = 'Скопировано!'; setTimeout(() => $('btnCopy').textContent = 'Скопировать ссылку', 1500); }, () => prompt('Ссылка для друзей:', url));
};
$('seats').addEventListener('click', e => { const b = e.target.closest('button[data-seat]'); if (b) requestSeat(+b.dataset.seat); });

// для отладки из консоли
window.__pzp = { DBG, get G() { return G; }, get hands() { return hands; }, get bots() { return bots; }, spawnItem, botTarget, get items() { return items; }, get seats() { return seats; }, hostStep, tick, NET, INP, CAM, newGame, resetSeats, addPlayer, startGame, setPhase: p => { PHASE = p; }, get PHASE() { return PHASE; }, inputs, buildPacket, parse, broadcast, refreshLobby, pruneFx, persons, scene, camera, renderer };

// грузим модели, потом открываем меню
const menuBtns = ['btnCreate', 'btnJoin', 'btnSolo'];
menuBtns.forEach(id => { $(id).disabled = true; });
menuError('Загружаем пассажиров…');
loadAssets().then(() => {
  buildBus();
  buildStreet();
  ready = true;
  menuBtns.forEach(id => { $(id).disabled = false; });
  menuError('');
}).catch(e => {
  console.error(e);
  menuError('Модели не загрузились — обнови страницу (Ctrl+F5).');
});
requestAnimationFrame(frame);
