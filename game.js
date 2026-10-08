// ===== «Передайте за проезд» — 3D от первого лица =====
// Хост крутит физику (cannon-es) и рассылает снимки по WebRTC (Trystero);
// остальные шлют куда смотрят и куда тянут руку.
import * as THREE from 'three';
import * as CANNON from 'cannon-es';

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
const TYPES = {
  fare:   { s: [0.15, 0.02, 0.07], m: 0.05 },
  coin:   { s: [0.045, 0.016, 0.045], m: 0.03 },
  bucket: { s: [0.24, 0.26, 0.24], m: 3 },
  cake:   { s: [0.26, 0.13, 0.26], m: 0.8 },
  jar:    { s: [0.12, 0.18, 0.12], m: 1 },
  goose:  { s: [0.36, 0.22, 0.18], m: 2.5 },
  cactus: { s: [0.13, 0.26, 0.13], m: 0.6 },
};
const TL = Object.keys(TYPES);
const itemRad = t => Math.max(...TYPES[t].s) / 2;
const SPECIAL = ['bucket', 'cake', 'jar', 'goose', 'cactus'];
const ITEM_NAME = { bucket: 'ведро с карасями', cake: 'торт', jar: 'банку огурцов', goose: 'гуся', cactus: 'кактус' };
const NOTE_COLOR = { 50: '#8ecae6', 100: '#e9c46a', 200: '#90be6d', 500: '#c39bd3' };

// yaw=0 — смотрим вперёд (к водителю, −x); +yaw — влево (+z)
function lookDir(yaw, pitch) { const cp = Math.cos(pitch); return { x: -Math.cos(yaw) * cp, y: Math.sin(pitch), z: Math.sin(yaw) * cp }; }
function shoulder(s, lean, yaw = 0) {
  const S = SEATS[s], p = { x: S.x + 0.08, y: SH_Y, z: S.z };
  if (lean) { p.x -= Math.cos(yaw) * 0.25; p.z += Math.sin(yaw) * 0.25; p.y -= 0.35; }
  return p;
}
function headPos(s, lean, yaw = 0) {
  const S = SEATS[s], p = { x: S.x + 0.06, y: 1.32, z: S.z };
  if (lean) { p.x -= Math.cos(yaw) * 0.3; p.z += Math.sin(yaw) * 0.3; p.y -= 0.4; }
  return p;
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
  h.tx = i.x; h.ty = i.y; h.tz = i.z; h.grab = !!i.g; h.lean = !!i.l;
  h.yaw = i.yw || 0; h.pitch = i.pt || 0;
  if (i.th !== h.lastTh) { if (h.lastTh !== undefined) throwHeld(s); h.lastTh = i.th; }
}

function updateHands(dt) {
  for (let s = 0; s < 4; s++) {
    const h = hands[s], bot = seats[s].bot;
    const t = clampHand(s, { x: h.tx, y: h.ty, z: h.tz }, h.lean, h.yaw);
    let k = bot ? bots[s].speed : 0.35;
    if (h.held && h.held.type === 'bucket') k *= 0.45;
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

function throwHeld(s) {
  const h = hands[s], it = h.held;
  if (!it) return;
  release(s);
  const d = lookDir(h.yaw, h.pitch);
  it.body.velocity.set(d.x * 6, d.y * 6 + 1.2, d.z * 6);
  it.body.angularVelocity.set(rand(-6, 6), rand(-6, 6), rand(-6, 6));
  it.ignore[s] = G.time + 1;
  snd('whoosh');
}

// ---------- боты-пассажиры ----------
function botRest(s) {
  const S = SEATS[s], h = hands[s];
  h.tx = S.x - 0.15; h.ty = 0.68; h.tz = S.z; h.grab = false; h.lean = false;
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
      h.tx = t.x; h.ty = t.y; h.tz = t.z; h.lean = false; h.grab = true;
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
    h.tx = t.x; h.ty = t.y; h.tz = t.z; h.lean = false; h.grab = true;
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
  h.lean = dist3(p, shoulder(s, false)) > REACH - 0.06;
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
    const heavy = h.held.type === 'bucket';
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
    if (it.type === 'goose') {
      it.flapT -= dt;
      if (it.flapT <= 0) {
        it.flapT = rand(1.2, 3); snd('honk');
        if (it.holder === -1) b.velocity.set(b.velocity.x + rand(-2, 2), b.velocity.y + rand(2, 3.5), b.velocity.z + rand(-2, 2));
        else if (it.holder < 4) {
          const s = it.holder, h = hands[s];
          h.jx += rand(-0.15, 0.15); h.jy += rand(-0.1, 0.1); h.jz += rand(-0.15, 0.15);
          if (Math.random() < 0.2) { release(s); h.noGrab = 0.4; say(s, 'Гусь вырвался!'); }
        }
      }
    }
    if (it.type === 'cactus' && it.holder >= 0 && it.holder < 4 && G.time - it.heldSince > 1.5) {
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
    if (it.dest === 'front') driverSay(it.squashed ? 'Это что, торт был?' : 'О, спасибо!');
    else say('npc', it.squashed ? 'Мой торт!!!' : 'Ой, спасибо, родные!');
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
  fx({ k: 'splash', x: r2(pos.x), y: r2(pos.y), z: r2(pos.z), c: '#7cb342' });
  driverSay(pick(DRV.broke));
  kill(it);
}

function onCollide(it, e) {
  if (it.dead || !G || PHASE !== 'play' || it.holder !== -1) return;
  let v = 0;
  try { v = Math.abs(e.contact.getImpactVelocityAlongNormal()); } catch (er) {}
  if (it.type === 'jar' && v > 3.6 && it.holder === -1) breakJar(it);
  else if (it.type === 'cake' && v > 3.0 && !it.squashed && it.holder === -1) {
    it.squashed = true;
    const p = it.body.position;
    pop({ x: p.x, y: p.y + 0.2, z: p.z }, 'торт всмятку!', '#ffb3c7'); snd('splat');
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
    hd: hands.map(h => [mm(h.rx ?? h.x), mm(h.ry ?? h.y), mm(h.rz ?? h.z), h.held ? 1 : (h.grab ? 2 : 0), h.lean ? 1 : 0, Math.round(h.yaw * 100), Math.round(h.pitch * 100)]),
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
      if (s >= 0) inputs[s] = { x: d.x / 1000, y: d.y / 1000, z: d.z / 1000, g: !!d.g, l: !!d.l, yw: d.yw / 1000, pt: d.pt / 1000, th: d.th };
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
const INP = { g: false, l: false, th: 0, tgt: null };
const CAM = { yaw: 0, pitch: -0.1 };
const canvas = $('cv');
const locked = () => document.pointerLockElement === canvas;
function mySeatIn(v) { return v ? v.seats.findIndex(s => s.pid && s.pid === NET.myPid) : -1; }
let curView = null;
const playingSeated = () => curView && curView.ph === 'play' && mySeatIn(curView) >= 0;

canvas.addEventListener('mousedown', e => {
  audioUnlock();
  if (!locked()) { if (playingSeated()) canvas.requestPointerLock(); return; }
  if (e.button === 0) INP.g = true;
  if (e.button === 2) INP.th++;
});
addEventListener('mouseup', e => { if (e.button === 0) INP.g = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
document.addEventListener('mousemove', e => {
  if (!locked()) return;
  CAM.yaw = clamp(CAM.yaw - e.movementX * 0.0024, -2.9, 2.9);
  CAM.pitch = clamp(CAM.pitch - e.movementY * 0.0024, -1.3, 1.2);
});
document.addEventListener('pointerlockchange', () => { if (!locked()) { INP.g = false; INP.l = false; } });
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { INP.l = true; e.preventDefault(); }
  const n = '12345'.indexOf(e.key);
  if (n >= 0 && !e.repeat) shout(n);
});
addEventListener('keyup', e => { if (e.code === 'Space') INP.l = false; });
addEventListener('blur', () => { INP.g = false; INP.l = false; });
function shout(i) {
  if (NET.role === 'host' || NET.role === 'solo') doShout(seatOf(NET.myPid), i);
  else clientSend('ctl', { t: 'say', i });
}

// =====================================================================
// ---------- 3D-сцена ----------
// =====================================================================
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
const scene = new THREE.Scene();
scene.background = new THREE.Color('#9fd3f0');
scene.fog = new THREE.Fog('#cfe6f2', 20, 90);
const camera = new THREE.PerspectiveCamera(72, 1, 0.03, 200);
function resize() {
  renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
  renderer.setSize(innerWidth, innerHeight, false);
  camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix();
}
addEventListener('resize', resize);
resize();

scene.add(new THREE.HemisphereLight('#ffffff', '#8c7c62', 2.2));
const sun = new THREE.DirectionalLight('#fff1d6', 1.6); sun.position.set(-4, 10, 5); scene.add(sun);
const cabinLight = new THREE.PointLight('#fff4dc', 2.5, 7, 1.5); cabinLight.position.set(2.7, 1.8, 0); scene.add(cabinLight);

const MATS = {};
function mat(c) { return MATS[c] || (MATS[c] = new THREE.MeshLambertMaterial({ color: c })); }
const GEO = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 12), sph: new THREE.SphereGeometry(1, 16, 12) };
function box(parent, w, h, d, c, x, y, z) { const m = new THREE.Mesh(GEO.box, typeof c === 'string' ? mat(c) : c); m.scale.set(w, h, d); m.position.set(x, y, z); parent.add(m); return m; }
function boxR(parent, x0, x1, y0, y1, z0, z1, c) { return box(parent, x1 - x0, y1 - y0, z1 - z0, c, (x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2); }
function cyl(parent, r, h, c, x, y, z) { const m = new THREE.Mesh(GEO.cyl, typeof c === 'string' ? mat(c) : c); m.scale.set(r, h, r); m.position.set(x, y, z); parent.add(m); return m; }
function sph(parent, r, c, x, y, z) { const m = new THREE.Mesh(GEO.sph, typeof c === 'string' ? mat(c) : c); m.scale.set(r, r, r); m.position.set(x, y, z); parent.add(m); return m; }

function canvasTex(w, h, draw) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  draw(cv.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
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
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ map: tex }));
  m.position.set(x, y, z); m.rotation.y = rotY; parent.add(m); return m;
}

// ---------- автобус ----------
const staticMeshes = [];
const straps = [];
let freshener = null;
function buildBus() {
  const g = new THREE.Group(); scene.add(g);
  for (const b of staticBoxes()) if (b.c) staticMeshes.push(boxR(g, b.x0, b.x1, b.y0, b.y1, b.z0, b.z1, b.c));
  staticMeshes.push(boxR(g, 0, BUS_LEN, -0.05, 0, -1, 1, '#3d3f44'));
  boxR(g, 0.3, 4.8, 0.001, 0.006, -0.16, 0.16, '#55585f');
  staticMeshes.push(boxR(g, 0, BUS_LEN, BUS_H, BUS_H + 0.05, -1, 1, '#ebe5d4'));
  const WX = [[0.35, 1.3], [1.45, 2.35], [2.5, 3.4], [3.55, 4.45], [4.6, 5.25]];
  const glass = new THREE.MeshBasicMaterial({ color: '#cdeeff', transparent: true, opacity: 0.12, depthWrite: false });
  for (const sd of [-1, 1]) {
    const z0 = sd > 0 ? BUS_HALF : -BUS_HALF - 0.04, z1 = z0 + 0.04;
    staticMeshes.push(boxR(g, 0, BUS_LEN, 0, 0.6, z0, z1, '#56657a'));
    staticMeshes.push(boxR(g, 0, BUS_LEN, 0.6, 0.95, z0, z1, '#efe3c2'));
    staticMeshes.push(boxR(g, 0, BUS_LEN, 1.55, BUS_H, z0, z1, '#efe3c2'));
    let px = 0;
    for (const [a, b] of WX) {
      staticMeshes.push(boxR(g, px, a, 0.95, 1.55, z0, z1, '#d8ccaa'));
      const gl = new THREE.Mesh(new THREE.PlaneGeometry(b - a, 0.6), glass); gl.position.set((a + b) / 2, 1.25, sd * (BUS_HALF - 0.005)); g.add(gl);
      boxR(g, a, b, 0.93, 0.97, sd * BUS_HALF - 0.06, sd * BUS_HALF + 0.0, '#9aa0a6');
      px = b;
    }
    staticMeshes.push(boxR(g, px, BUS_LEN, 0.95, 1.55, z0, z1, '#d8ccaa'));
  }
  // лобовое и задние стёкла
  staticMeshes.push(boxR(g, -0.04, 0, 1.75, BUS_H, -1, 1, '#d8ccaa'));
  const ws = new THREE.Mesh(new THREE.PlaneGeometry(2, 0.75), glass); ws.position.set(0.005, 1.37, 0); ws.rotation.y = Math.PI / 2; g.add(ws);
  staticMeshes.push(boxR(g, BUS_LEN, BUS_LEN + 0.04, 1.1, 1.6, -1, -0.5, '#efe3c2'));
  staticMeshes.push(boxR(g, BUS_LEN, BUS_LEN + 0.04, 1.1, 1.6, 0.5, 1, '#efe3c2'));
  staticMeshes.push(boxR(g, BUS_LEN, BUS_LEN + 0.04, 1.6, BUS_H, -1, 1, '#efe3c2'));
  staticMeshes.push(boxR(g, BUS_LEN, BUS_LEN + 0.04, 1.1, 1.6, -0.5, 0.5, glass));
  // поручни и петли
  for (const z of [-0.55, 0.55]) {
    const r = cyl(g, 0.015, 4.7, '#c9ced4', 2.85, 1.78, z); r.rotation.z = Math.PI / 2;
    for (let x = 0.9; x < 5.0; x += 0.6) {
      const p = new THREE.Group(); p.position.set(x, 1.78, z); g.add(p);
      box(p, 0.02, 0.18, 0.03, '#777', 0, -0.09, 0);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.01, 6, 16), mat('#555')); ring.position.y = -0.22; ring.rotation.y = Math.PI / 2; p.add(ring);
      straps.push(p);
    }
  }
  // плафоны
  for (let x = 1; x < 5; x += 1.3) { const m = boxR(g, x - 0.25, x + 0.25, BUS_H - 0.02, BUS_H, -0.08, 0.08, new THREE.MeshBasicMaterial({ color: '#fffbe6' })); }
  // кабина: руль, иконка, зеркало, ёлочка
  const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 8, 24), mat('#222'));
  wheel.position.set(0.4, 1.0, 0.5); wheel.rotation.y = Math.PI / 2; wheel.rotation.x = 0.5; g.add(wheel);
  box(g, 0.02, 0.08, 0.06, '#d4a017', 0.2, 1.05, 0.0);
  box(g, 0.04, 0.07, 0.25, '#333', 0.08, 1.65, 0.05);
  freshener = new THREE.Group(); freshener.position.set(0.1, 1.6, 0.05); g.add(freshener);
  box(freshener, 0.003, 0.12, 0.002, '#ddd', 0, -0.06, 0);
  const tree = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.13, 3), mat('#2e7d32')); tree.position.y = -0.18; tree.scale.z = 0.2; freshener.add(tree);
  // таблички
  sign(g, signTex('№ 13  АВТОВОКЗАЛ — КОНЕЧНАЯ', '#1e1e1e', '#ffb300', 1024, 96, 52), 1.8, 0.16, 0.01, 1.82, 0, Math.PI / 2);
  sign(g, signTex('КАССА', '#5c3a1a', '#ffd54f', 256, 96, 56), 0.3, 0.11, TRAY.x1 + 0.002, 0.7, TRAY_C.z, Math.PI / 2);
  sign(g, signTex('ПЕРЕДАЁМ ЗА ПРОЕЗД!', '#c62828', '#fff'), 0.8, 0.2, 1.4, 1.72, BUS_HALF - 0.005, Math.PI);
  sign(g, signTex('ПРОЕЗД 50 ₽', '#1565c0', '#fff'), 0.6, 0.15, 2.0, 1.72, -BUS_HALF + 0.005, 0);
  sign(g, signTex('ДВЕРЬЮ НЕ ХЛОПАТЬ', '#fff', '#c62828'), 0.7, 0.17, 3.1, 1.72, BUS_HALF - 0.005, Math.PI);
  sign(g, signTex('ОСТАНОВКИ ПО ТРЕБОВАНИЮ', '#fff', '#1e1e1e', 640, 128, 50), 0.8, 0.16, 4.0, 1.72, -BUS_HALF + 0.005, 0);
  sign(g, signTex('СДАЧУ ПЕРЕДАЁМ НАЗАД', '#2e7d32', '#fff', 640, 128, 50), 0.7, 0.14, BUS_LEN - 0.005, 1.7, 0, -Math.PI / 2);
  // ножки сидений
  for (const S of SEATS) cyl(g, 0.025, 0.37, '#9aa0a6', S.x, 0.185, S.z);
}
buildBus();

// ---------- улица ----------
const movers = [];
function buildStreet() {
  const g = new THREE.Group(); scene.add(g);
  box(g, 400, 0.1, 30, '#4a4d55', 0, -0.5, 0);
  box(g, 400, 0.1, 60, '#7da35a', 0, -0.62, 0);
  for (const sd of [-1, 1]) box(g, 400, 0.2, 4, '#9e9e9e', 0, -0.4, sd * 9);
  const winTex = canvasTex(64, 64, (c, W, H) => {
    c.fillStyle = '#fff'; c.fillRect(0, 0, W, H);
    c.fillStyle = '#5b7da0'; c.fillRect(14, 12, 36, 32);
  });
  winTex.wrapS = winTex.wrapT = THREE.RepeatWrapping;
  const palette = ['#e8dcc4', '#d9c9a8', '#c8d3dc', '#e3c4b5', '#cfd8c5', '#f0e6d2', '#b9c3cc'];
  for (const sd of [-1, 1]) {
    for (let i = 0; i < 12; i++) {
      const tex = winTex.clone(); tex.needsUpdate = true;
      const m = new THREE.Mesh(GEO.box, new THREE.MeshLambertMaterial({ color: pick(palette), map: tex }));
      g.add(m);
      const o = { m, span: 144, kind: 'bld', sd };
      reshapeBuilding(o);
      m.position.x = -72 + i * 12;
      movers.push(o);
    }
    for (let i = 0; i < 14; i++) {
      const p = new THREE.Group(); g.add(p);
      cyl(p, 0.06, 6, '#555c66', 0, 2.6, 0);
      box(p, 0.08, 0.08, 1.2, '#555c66', 0, 5.6, -sd * 0.6);
      box(p, 0.3, 0.1, 0.25, '#fff3b0', 0, 5.55, -sd * 1.1);
      p.position.set(-70 + i * 10, -0.4, sd * 7.6);
      movers.push({ m: p, span: 140 });
    }
    for (let i = 0; i < 10; i++) {
      const p = new THREE.Group(); g.add(p);
      cyl(p, 0.12, 1.6, '#6d4c41', 0, 0.4, 0);
      const c = new THREE.Mesh(new THREE.ConeGeometry(1.1, 2.6, 8), mat('#3f8f46')); c.position.y = 2.2; p.add(c);
      p.position.set(-65 + i * 14 + rand(-3, 3), -0.4, sd * rand(10.5, 12));
      movers.push({ m: p, span: 140 });
    }
  }
  for (let i = 0; i < 25; i++) {
    const d = box(g, 2.5, 0.02, 0.15, '#eeeeee', -75 + i * 6, -0.44, 0);
    movers.push({ m: d, span: 150 });
  }
}
function reshapeBuilding(o) {
  const w = rand(7, 11), h = rand(8, 26), d = rand(7, 10);
  o.m.scale.set(w, h, d);
  o.m.position.y = h / 2 - 0.4;
  o.m.position.z = o.sd * (11 + d / 2 + rand(0, 3));
  o.m.material.map.repeat.set(Math.round(w / 1.6), Math.round(h / 2.8));
}
buildStreet();
function moveStreet(speed, dt) {
  const dx = speed * MAX_SPEED * dt;
  for (const o of movers) {
    o.m.position.x += dx;
    if (o.m.position.x > 75) { o.m.position.x -= o.span; if (o.kind === 'bld') reshapeBuilding(o); }
  }
}

// ---------- человечки ----------
function lookOf(s, v) {
  const se = v.seats[s];
  if (!se || se.bot) return { kind: BOTS[s].kind, shirt: BOTS[s].shirt, pants: '#3d3d44', skin: BOTS[s].skin, name: BOTS[s].name, color: null };
  return { kind: 'player', shirt: COLORS[s], pants: '#2d3142', skin: ['#f1c27d', '#e0ac69', '#f5d0b0', '#c68642'][s], name: se.name, color: COLORS[s] };
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

function addHat(head, L) {
  switch (L.kind) {
    case 'babka': {
      const m = sph(head, 0.135, '#d64545', 0.02, 0.03, 0); m.scale.set(0.13, 0.12, 0.135);
      for (const [x, y, z] of [[-0.05, 0.1, 0.06], [0.02, 0.12, -0.07], [0.06, 0.08, 0.09], [-0.08, 0.06, -0.08]]) sph(head, 0.015, '#fff', x, y, z);
      box(head, 0.05, 0.05, 0.05, '#d64545', 0.02, -0.12, 0);
      break;
    }
    case 'ded':
      cyl(head, 0.13, 0.05, '#6b6b6b', 0.01, 0.1, 0);
      box(head, 0.08, 0.015, 0.16, '#5a5a5a', -0.11, 0.08, 0);
      box(head, 0.03, 0.025, 0.09, '#eee', -0.115, -0.04, 0);
      break;
    case 'student': {
      const m = sph(head, 0.125, '#1b1b1b', 0.02, 0.04, 0); m.scale.set(0.12, 0.1, 0.125);
      const t = new THREE.Mesh(new THREE.TorusGeometry(0.13, 0.012, 6, 16, Math.PI), mat('#111')); t.position.set(0.0, 0.0, 0); head.add(t);
      sph(head, 0.04, '#e53935', 0, -0.01, 0.125); sph(head, 0.04, '#e53935', 0, -0.01, -0.125);
      break;
    }
    case 'muzhik':
      cyl(head, 0.125, 0.06, '#111', 0.01, 0.09, 0);
      box(head, 0.12, 0.012, 0.15, '#111', -0.12, 0.07, 0);
      break;
    case 'driver':
      cyl(head, 0.125, 0.06, '#1b1b1b', 0.01, 0.09, 0);
      box(head, 0.1, 0.012, 0.15, '#1b1b1b', -0.11, 0.07, 0);
      box(head, 0.02, 0.02, 0.08, '#4a3020', -0.12, -0.035, 0);
      break;
    default: {
      const m = sph(head, 0.125, L.shirt, 0.01, 0.05, 0); m.scale.set(0.125, 0.1, 0.125);
      sph(head, 0.035, '#fff', 0.01, 0.16, 0);
    }
  }
}

function makePerson(L, ax, az) {
  const g = new THREE.Group(); g.position.set(ax, 0, az); scene.add(g);
  boxR(g, -0.32, 0.12, 0.45, 0.6, -0.17, 0.17, L.pants);
  boxR(g, -0.36, -0.22, 0.06, 0.5, -0.16, 0.16, L.pants);
  boxR(g, -0.46, -0.2, 0, 0.08, -0.17, 0.17, '#222');
  const upper = new THREE.Group(); upper.position.set(0.1, 0.58, 0); g.add(upper);
  boxR(upper, -0.12, 0.14, 0, 0.54, -0.19, 0.19, L.shirt);
  if (L.kind === 'muzhik') { boxR(upper, -0.125, -0.12, 0, 0.54, -0.1, -0.08, '#fff'); boxR(upper, -0.125, -0.12, 0, 0.54, 0.08, 0.1, '#fff'); }
  const head = new THREE.Group(); head.position.set(-0.04, 0.74, 0); upper.add(head);
  sph(head, 0.12, L.skin, 0, 0, 0);
  for (const ez of [-0.045, 0.045]) { sph(head, 0.028, '#fff', -0.1, 0.03, ez); sph(head, 0.014, '#222', -0.125, 0.03, ez); }
  sph(head, 0.022, L.skin, -0.125, -0.01, 0);
  const mouth = box(head, 0.02, 0.012, 0.06, '#7a2e2e', -0.11, -0.06, 0);
  addHat(head, L);
  const label = labelSprite(L.name, L.color || 'rgba(30,30,40,0.7)', L.color ? '#111' : '#eee');
  label.position.set(0.06, 1.64, 0); g.add(label);
  const sleeve = mat(L.shirt), skin = mat(L.skin);
  const arm = {
    up: new THREE.Mesh(GEO.cyl, sleeve), lo: new THREE.Mesh(GEO.cyl, sleeve), hand: new THREE.Mesh(GEO.sph, skin),
  };
  scene.add(arm.up, arm.lo, arm.hand);
  // вторая рука лежит на коленях
  const rest = { up: new THREE.Mesh(GEO.cyl, sleeve), lo: new THREE.Mesh(GEO.cyl, sleeve), hand: new THREE.Mesh(GEO.sph, skin) };
  scene.add(rest.up, rest.lo, rest.hand);
  return { g, upper, head, mouth, label, arm, rest, L };
}
function disposePerson(P) {
  scene.remove(P.g, P.arm.up, P.arm.lo, P.arm.hand, P.rest.up, P.rest.lo, P.rest.hand);
  P.label.material.map.dispose(); P.label.material.dispose();
}

const _up = new THREE.Vector3(0, 1, 0), _v = new THREE.Vector3();
function limb(m, a, b, r) {
  _v.set(b.x - a.x, b.y - a.y, b.z - a.z);
  const len = _v.length() || 0.001;
  m.position.set((a.x + b.x) / 2, (a.y + b.y) / 2, (a.z + b.z) / 2);
  m.scale.set(r, len, r);
  m.quaternion.setFromUnitVectors(_up, _v.divideScalar(len));
}
function setArm(A, sh, hand, st, out) {
  const L1 = 0.32, L2 = 0.32;
  const dx = hand.x - sh.x, dy = hand.y - sh.y, dz = hand.z - sh.z;
  let d = Math.hypot(dx, dy, dz) || 0.001;
  const f = Math.max(1, d / (L1 + L2 - 0.01)), l1 = L1 * f, l2 = L2 * f;
  const ux = dx / d, uy = dy / d, uz = dz / d;
  d = Math.min(d, l1 + l2 - 0.001);
  const a = (l1 * l1 - l2 * l2 + d * d) / (2 * d), hgt = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  // локоть — вниз и наружу
  let px = out.x * 0.5, py = -1, pz = out.z * 0.5;
  const dot = px * ux + py * uy + pz * uz;
  px -= dot * ux; py -= dot * uy; pz -= dot * uz;
  const pl = Math.hypot(px, py, pz) || 1;
  const el = { x: sh.x + ux * a + px / pl * hgt, y: sh.y + uy * a + py / pl * hgt, z: sh.z + uz * a + pz / pl * hgt };
  limb(A.up, sh, el, 0.045);
  limb(A.lo, el, hand, 0.04);
  A.hand.position.set(hand.x, hand.y, hand.z);
  const hr = st === 0 ? 0.05 : 0.042;
  A.hand.scale.set(hr, hr, hr);
}

const persons = [null, null, null, null];
let driverP = null;
const npcs = [];
function ensurePersons(v) {
  for (let s = 0; s < 4; s++) {
    const L = lookOf(s, v), key = L.kind + '|' + L.name + '|' + L.shirt;
    if (persons[s] && persons[s].key === key) continue;
    if (persons[s]) disposePerson(persons[s]);
    persons[s] = makePerson(L, SEATS[s].x, SEATS[s].z);
    persons[s].key = key;
  }
  if (!driverP) {
    driverP = makePerson({ kind: 'driver', shirt: '#2f4f6f', pants: '#2b2b33', skin: '#f0c39a', name: 'Водитель Ашот' }, 0.75, 0.5);
    npcs.push(makePerson({ kind: 'babka', shirt: '#2e7d6b', pants: '#333', skin: '#e9b98f', name: 'Тётя Люда' }, 5.0, -0.35));
    npcs.push(makePerson({ kind: 'npc', shirt: '#9c6b30', pants: '#333', skin: '#f2c8a0', name: 'Галёрка' }, 5.0, 0.35));
    npcs[1].label.visible = false;
  }
}

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
const destTex = { front: null, back: null };
function makeItemMesh(type, val, dest) {
  const g = new THREE.Group();
  const M = c => new THREE.MeshLambertMaterial({ color: c });
  switch (type) {
    case 'fare': {
      const tex = getNoteTex(val);
      const side = M(NOTE_COLOR[val] || '#9ccc65'), face = new THREE.MeshLambertMaterial({ map: tex });
      const m = new THREE.Mesh(GEO.box, [side, side, face, face, side, side]); m.scale.set(0.15, 0.006, 0.07); g.add(m);
      break;
    }
    case 'coin': { const m = cyl(g, 0.02, 0.006, M('#f6c945'), 0, 0, 0); break; }
    case 'bucket': {
      cyl(g, 0.115, 0.24, M('#9aa5b1'), 0, -0.01, 0);
      cyl(g, 0.105, 0.005, M('#4fa3e0'), 0, 0.105, 0);
      const tail = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.08, 4), M('#ff8a3d')); tail.position.set(0.03, 0.15, 0); tail.rotation.z = Math.PI; g.add(tail);
      const h = new THREE.Mesh(new THREE.TorusGeometry(0.11, 0.006, 6, 16, Math.PI), M('#666')); h.position.y = 0.11; g.add(h);
      break;
    }
    case 'cake':
      cyl(g, 0.125, 0.09, M('#f8bbd0'), 0, -0.02, 0);
      cyl(g, 0.128, 0.035, M('#ffffff'), 0, 0.04, 0);
      for (let k = 0; k < 5; k++) sph(g, 0.018, M('#e53935'), Math.cos(k * 1.26) * 0.08, 0.065, Math.sin(k * 1.26) * 0.08);
      break;
    case 'jar': {
      const gl = new THREE.MeshLambertMaterial({ color: '#cfe8c9', transparent: true, opacity: 0.55 });
      cyl(g, 0.058, 0.16, gl, 0, -0.01, 0);
      for (const [x, z, r] of [[-0.02, 0.01, 0.2], [0.02, -0.015, -0.3], [0.0, 0.025, 0.1]]) { const p = cyl(g, 0.017, 0.12, M('#558b2f'), x, -0.01, z); p.rotation.z = r; }
      cyl(g, 0.062, 0.025, M('#d4a017'), 0, 0.085, 0);
      break;
    }
    case 'goose': {
      const b = sph(g, 1, M('#fafafa'), 0.03, -0.02, 0); b.scale.set(0.17, 0.09, 0.085);
      const n = cyl(g, 0.025, 0.16, M('#fafafa'), -0.12, 0.05, 0); n.rotation.z = 0.5;
      sph(g, 0.04, M('#fafafa'), -0.16, 0.13, 0);
      const bk = new THREE.Mesh(new THREE.ConeGeometry(0.018, 0.07, 6), M('#ff9800')); bk.position.set(-0.21, 0.125, 0); bk.rotation.z = Math.PI / 2; g.add(bk);
      sph(g, 0.009, M('#111'), -0.18, 0.145, 0.03); sph(g, 0.009, M('#111'), -0.18, 0.145, -0.03);
      const w1 = sph(g, 1, M('#e0e0e0'), 0.05, 0.02, 0.07); w1.scale.set(0.11, 0.05, 0.02); g.userData.wing = w1;
      break;
    }
    case 'cactus':
      cyl(g, 0.06, 0.08, M('#c1642b'), 0, -0.09, 0);
      cyl(g, 0.04, 0.17, M('#43a047'), 0, 0.03, 0);
      { const a = cyl(g, 0.022, 0.07, M('#43a047'), 0.05, 0.05, 0); a.rotation.z = 0.9; }
      { const a = cyl(g, 0.022, 0.06, M('#43a047'), -0.05, 0.08, 0); a.rotation.z = -0.9; }
      break;
  }
  if (type !== 'fare' && type !== 'coin') {
    const key = dest === 'back' ? 'back' : 'front';
    if (!destTex[key]) destTex[key] = labelSprite(key === 'back' ? '▶ НАЗАД' : '◀ ВОДИТЕЛЮ', key === 'back' ? '#3fa7ff' : '#ff9f1c', '#fff').material;
    const sp = new THREE.Sprite(destTex[key]); sp.scale.set(0.3, 0.056, 1); sp.renderOrder = 9;
    g.add(sp); g.userData.tag = sp;
  }
  g.traverse(o => { if (o.isMesh) o.userData.isItem = true; });
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
    m.userData.id = it.id; m.userData.holder = it.holder;
    if (m.userData.tag) { m.userData.tag.position.set(0, 0.2, 0).applyQuaternion(_q.clone().invert()); }
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
function bubblePos(who, v) {
  if (who === 'drv') return { x: 0.7, y: 1.75, z: 0.5 };
  if (who === 'npc') return { x: 5.0, y: 1.6, z: -0.35 };
  const s = +who, hd = v.hands[s] || {};
  const hp = headPos(s, hd.l, hd.yw || 0);
  return { x: hp.x, y: hp.y + 0.3, z: hp.z };
}
function updateOverlay(v, dt, my) {
  for (const who of Object.keys(VS.bubbles)) {
    const b = VS.bubbles[who];
    let el = bubEls[who];
    if (b.until < VS.t) { if (el) { el.remove(); delete bubEls[who]; } delete VS.bubbles[who]; continue; }
    if (!el) { el = bubEls[who] = document.createElement('div'); el.className = 'bub'; fxLayer.appendChild(el); }
    if (el.textContent !== b.s) el.textContent = b.s;
    const pos = bubblePos(who, v);
    let sc = toScreen(pos.x, pos.y, pos.z);
    if (String(who) === String(my)) sc = { x: innerWidth / 2, y: innerHeight * 0.82 };
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
  const playing = v.ph === 'play' && my >= 0;
  $('cross').classList.toggle('hidden', !(playing && locked()));
  $('hint').classList.toggle('hidden', !(playing && locked()));
  $('lockMsg').classList.toggle('hidden', !(playing && !locked()));
  $('cross').className = (playing && locked() ? '' : 'hidden ') + (holding ? 'hold' : canGrab ? 'can' : '');
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
  persons.forEach((P, s) => { if (P && s !== my) t.push(P.g); });
  for (const it of v.items) if (it.holder !== my) { const m = itemMeshes.get(it.id); if (m) t.push(m); }
  for (const n of npcs) t.push(n.g);
  if (driverP) t.push(driverP.g);
  return t;
}
function computeMyTarget(my, v) {
  const lean = INP.l, d = lookDir(CAM.yaw, CAM.pitch), hp = headPos(my, lean, CAM.yaw);
  ray.set(new THREE.Vector3(hp.x, hp.y, hp.z), new THREE.Vector3(d.x, d.y, d.z));
  ray.far = 2.5;
  const hits = ray.intersectObjects(rayTargets(my, v), true).filter(h => h.object.type !== 'Sprite');
  if (hits.length) { const p = hits[0].point; return { x: p.x - d.x * 0.05, y: p.y - d.y * 0.05, z: p.z - d.z * 0.05 }; }
  return { x: hp.x + d.x * 1.0, y: hp.y + d.y * 1.0, z: hp.z + d.z * 1.0 };
}

function updateScene(v, dt, my) {
  ensurePersons(v);
  moveStreet(v.sp || 0, dt);
  // своя рука — без задержки сети
  let myHand = null, hint = null, holding = false;
  if (my >= 0 && v.ph === 'play' && INP.tgt) {
    myHand = clampHand(my, INP.tgt, INP.l, CAM.yaw);
    const srv = (NET.role === 'client' && NET.latest) ? NET.latest.hands[my] : null;
    for (const it of v.items) {
      if (it.holder !== my) continue;
      holding = true;
      if (srv) { const t = NET.latest.items.find(q => q.id === it.id); if (t) { it.x = myHand.x + (t.x - srv.x); it.y = myHand.y + (t.y - srv.y); it.z = myHand.z + (t.z - srv.z); } }
    }
    if (NET.role !== 'client') myHand = null; // у хоста рука и так считается каждый кадр
    if (!holding) {
      const hp = myHand || v.hands[my];
      let bd = 1e9;
      for (const it of v.items) { const d = dist3(it, hp) - itemRad(it.type) * 0.6; if (d < 0.1 && d < bd) { bd = d; hint = it.id; } }
    }
  }
  syncItems(v, hint);
  const sway = -(v.gx || 0) * 0.15;
  for (let s = 0; s < 4; s++) {
    const P = persons[s], hd = myHand && s === my ? { ...v.hands[s], ...myHand, l: INP.l ? 1 : 0, yw: CAM.yaw, pt: CAM.pitch } : v.hands[s];
    if (!P || !hd) continue;
    const isMe = s === my && v.ph !== 'menu';
    P.head.visible = !isMe; P.label.visible = !isMe;
    P.upper.rotation.z = (hd.l ? 0.45 : 0) + sway + Math.sin(VS.t * 9 + s) * 0.01 * (v.sp || 0);
    P.upper.rotation.x = -(v.gz || 0) * 0.2;
    P.head.rotation.set(0, clamp(hd.yw, -2.2, 2.2), -clamp(hd.pt, -1, 1), 'YXZ');
    const talking = VS.bubbles[s] && VS.bubbles[s].until > VS.t;
    P.mouth.scale.y = talking ? 0.012 + Math.abs(Math.sin(VS.t * 18)) * 0.03 : 0.008;
    const S = SEATS[s], side = S.z > 0 ? -1 : 1;
    const sh = shoulder(s, hd.l, hd.yw);
    const shA = { x: sh.x + 0.02, y: sh.y + 0.04, z: S.z + side * 0.2 + (sh.z - S.z) };
    setArm(P.arm, shA, hd, hd.st, { x: 0, z: side });
    const shR = { x: S.x + 0.1 + (hd.l ? -0.15 : 0), y: SH_Y + 0.04 + (hd.l ? -0.2 : 0), z: S.z - side * 0.2 };
    setArm(P.rest, shR, { x: S.x - 0.18, y: 0.66, z: S.z - side * 0.1 }, 0, { x: 0, z: -side });
  }
  // водитель
  if (driverP) {
    const angry = (v.an || 0) > 60;
    driverP.head.rotation.set(0, angry ? Math.PI * 0.75 + Math.sin(VS.t * 2) * 0.2 : Math.sin(VS.t * 0.7) * 0.25, 0, 'YXZ');
    driverP.upper.rotation.z = sway;
    const talking = VS.bubbles.drv && VS.bubbles.drv.until > VS.t;
    driverP.mouth.scale.y = talking ? 0.012 + Math.abs(Math.sin(VS.t * 18)) * 0.03 : 0.008;
    setArm(driverP.arm, { x: 0.87, y: 1.1, z: 0.3 }, { x: 0.45, y: 1.05, z: 0.38 }, 1, { x: 0, z: -1 });
    setArm(driverP.rest, { x: 0.87, y: 1.1, z: 0.7 }, { x: 0.45, y: 1.05, z: 0.62 }, 1, { x: 0, z: 1 });
  }
  // галёрка: руки тянутся к своим предметам
  const slotItems = v.items.filter(it => it.holder === 9);
  npcs.forEach((N, i) => {
    const z = i === 0 ? -0.35 : 0.35;
    const mine = slotItems.filter(it => (it.z < 0.1) === (i === 0));
    const sh = { x: 5.12, y: 1.12, z: z + (i === 0 ? 0.2 : -0.2) };
    setArm(N.arm, sh, mine[0] ? { x: mine[0].x + 0.06, y: mine[0].y, z: mine[0].z } : { x: 4.9, y: 0.66, z }, mine[0] ? 1 : 0, { x: 0, z: i === 0 ? 1 : -1 });
    const sh2 = { x: 5.12, y: 1.12, z: z + (i === 0 ? -0.2 : 0.2) };
    setArm(N.rest, sh2, mine[1] ? { x: mine[1].x + 0.06, y: mine[1].y, z: mine[1].z } : { x: 4.9, y: 0.66, z: z * 0.8 }, mine[1] ? 1 : 0, { x: 0, z: i === 0 ? -1 : 1 });
    N.head.rotation.y = Math.sin(VS.t * 0.5 + i) * 0.4;
    const talking = VS.bubbles.npc && VS.bubbles.npc.until > VS.t && i === 0;
    N.mouth.scale.y = talking ? 0.012 + Math.abs(Math.sin(VS.t * 18)) * 0.03 : 0.008;
  });
  // петли и ёлочка
  for (const p of straps) { p.rotation.z = (v.gx || 0) * 0.9 + Math.sin(VS.t * 3 + p.position.x) * 0.04 * (1 + VS.shake * 5); p.rotation.x = -(v.gz || 0) * 0.9; }
  if (freshener) { freshener.rotation.z = (v.gx || 0) * 1.2 + Math.sin(VS.t * 2.3) * 0.15; freshener.rotation.x = -(v.gz || 0) * 1.2; }
  updateParts(dt);
  return { canGrab: hint !== null, holding };
}

function updateCamera(v, my, dt) {
  VS.shake = Math.max(0, VS.shake - dt * 2.5);
  const sk = VS.shake, sp = v.sp || 0;
  const sx = Math.sin(VS.t * 53) * sk * 0.02, sy = Math.cos(VS.t * 41) * sk * 0.03 + Math.sin(VS.t * 9) * sp * 0.004;
  if (v.ph === 'play' && my >= 0) {
    const hp = headPos(my, INP.l, CAM.yaw);
    camera.position.set(hp.x + (v.gx || 0) * 0.08 + sx, hp.y + sy, hp.z - (v.gz || 0) * 0.06);
    camera.rotation.set(CAM.pitch, Math.PI / 2 + CAM.yaw, (v.gz || 0) * 0.1, 'YXZ');
  } else {
    camera.position.set(0.45 + sx, 1.5 + sy, -0.55);
    camera.lookAt(4.6, 0.95 + Math.sin(VS.t * 0.4) * 0.05, 0.2 + Math.sin(VS.t * 0.3) * 0.2);
  }
}

// ---------- главный цикл ----------
let lastT = performance.now(), acc = 0, sendAcc = 0, inAcc = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now; VS.t += dt;
  tick(dt);
  requestAnimationFrame(frame);
}
function tick(dt) {
  let view = null;
  if (NET.role === 'host' || NET.role === 'solo') {
    const my = seatOf(NET.myPid);
    if (my >= 0 && curView && curView.ph === 'play') {
      INP.tgt = computeMyTarget(my, curView);
      inputs[my] = { ...INP.tgt, g: INP.g, l: INP.l, yw: CAM.yaw, pt: CAM.pitch, th: INP.th };
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
      clientSend('in', { x: mm(INP.tgt.x), y: mm(INP.tgt.y), z: mm(INP.tgt.z), g: INP.g ? 1 : 0, l: INP.l ? 1 : 0, yw: mm(CAM.yaw), pt: mm(CAM.pitch), th: INP.th });
    }
  }
  if (!view) view = idleView();
  curView = view;
  const my = mySeatIn(view);
  const st = updateScene(view, dt, my);
  updateCamera(view, my, dt);
  updateOverlay(view, dt, my);
  updateHUD(view, my, st.canGrab, st.holding);
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

$('btnCreate').onclick = () => { audioUnlock(); menuError(''); hostCreate(getName()); };
$('btnJoin').onclick = () => { audioUnlock(); clientJoin(getName(), $('code').value); };
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnJoin').click(); });
$('btnSolo').onclick = () => {
  audioUnlock(); menuError('');
  NET.role = 'solo'; NET.myPid = 'host';
  resetSeats(); addPlayer('host', getName());
  CAM.yaw = 0; CAM.pitch = -0.1;
  startGame();
};
$('btnStart').onclick = () => { if (NET.role === 'host') { CAM.yaw = 0; CAM.pitch = -0.1; startGame(); } };
$('btnAgain').onclick = () => { if (NET.role === 'host' || NET.role === 'solo') { CAM.yaw = 0; CAM.pitch = -0.1; startGame(); } };
$('btnLeave').onclick = leave;
$('btnMenu').onclick = leave;
$('btnCopy').onclick = () => {
  const url = location.origin + location.pathname + '?room=' + NET.code;
  navigator.clipboard.writeText(url).then(() => { $('btnCopy').textContent = 'Скопировано!'; setTimeout(() => $('btnCopy').textContent = 'Скопировать ссылку', 1500); }, () => prompt('Ссылка для друзей:', url));
};
$('seats').addEventListener('click', e => { const b = e.target.closest('button[data-seat]'); if (b) requestSeat(+b.dataset.seat); });

// для отладки из консоли
window.__pzp = { DBG, get G() { return G; }, get hands() { return hands; }, get bots() { return bots; }, spawnItem, botTarget, get items() { return items; }, get seats() { return seats; }, hostStep, tick, NET, INP, CAM, newGame, resetSeats, addPlayer, startGame, setPhase: p => { PHASE = p; }, get PHASE() { return PHASE; }, inputs, buildPacket, parse, broadcast, refreshLobby, pruneFx };

requestAnimationFrame(frame);
