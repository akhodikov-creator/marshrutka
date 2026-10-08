'use strict';
// ===== «Передайте за проезд» =====
// Хост крутит физику (Matter.js) и рассылает снимки по WebRTC (PeerJS);
// остальные игроки шлют только положение своей руки.

const { Engine, Bodies, Body, Composite, Events } = Matter;

// ---------- константы ----------
const W = 1280, H = 720;
const FLOOR = 620, CEIL = 130, LWALL = 40, RWALL = 1240;
const SHOULDER_Y = 390, LAP_Y = 470;
const SEAT_X = [390, 610, 830, 1050];
const REACH = 170, LEAN_REACH = 230, LEAN_DROP = 45, LEAN_FWD = 18;
const TRAY = { x: 185, y: 380, w: 110, h: 52 };
const TRAY_TOP = 432;
const BACK = { x: 1145, y: 250, w: 95, h: 310 };
const DRV_TOP = 260;
const SEG = 30;
const STOPS = ['Автовокзал', 'ул. Ленина', 'Рынок', 'Больница', 'ТЦ «Мега»', 'Общага', 'Конечная'];
const ROUND = SEG * (STOPS.length - 1);
const COLORS = ['#ff5a5f', '#3fa7ff', '#ffb800', '#35c46a'];
const SEAT_NAMES = ['У водителя', 'Второй ряд', 'Третий ряд', 'Галёрка'];
const WINS = [[205, 160, 180, 130], [420, 160, 180, 130], [635, 160, 180, 130], [850, 160, 180, 130], [1065, 160, 160, 130]];

const BOTS = [
  { name: 'Баба Зина', kind: 'babka', speed: 0.10, delay: [0.7, 1.3], fumble: 0.35, shirt: '#8e5aa8' },
  { name: 'Дед Толя', kind: 'ded', speed: 0.14, delay: [0.5, 1.0], fumble: 0.22, shirt: '#6b7a52' },
  { name: 'Студент Вася', kind: 'student', speed: 0.20, delay: [0.9, 2.0], fumble: 0.15, shirt: '#3b3b46' },
  { name: 'Мужик Гена', kind: 'muzhik', speed: 0.24, delay: [0.3, 0.7], fumble: 0.30, shirt: '#1f3f8a' },
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
  fare:   { w: 62, h: 30, dens: 0.0012, fr: 0.6 },
  coin:   { r: 11, dens: 0.004, fr: 0.3 },
  bucket: { w: 44, h: 46, dens: 0.006, fr: 0.5 },
  cake:   { w: 64, h: 36, dens: 0.0015, fr: 0.7 },
  jar:    { w: 30, h: 46, dens: 0.003, fr: 0.3 },
  goose:  { w: 58, h: 34, dens: 0.0016, fr: 0.4 },
  cactus: { w: 30, h: 44, dens: 0.002, fr: 0.6 },
};
const TL = Object.keys(TYPES);
const SPECIAL = ['bucket', 'cake', 'jar', 'goose', 'cactus'];
const ITEM_NAME = { bucket: 'ведро с карасями', cake: 'торт', jar: 'банку огурцов', goose: 'гуся', cactus: 'кактус' };
const NOTE_COLOR = { 50: '#8ecae6', 100: '#e9c46a', 200: '#90be6d', 500: '#c39bd3' };

// ---------- утилиты ----------
const $ = id => document.getElementById(id);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = a => a[Math.floor(Math.random() * a.length)];
const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const angDiff = (a, b) => { let d = b - a; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI; return d; };
function shoulder(s, lean) { return { x: SEAT_X[s] - (lean ? LEAN_FWD : 0), y: SHOULDER_Y + (lean ? LEAN_DROP : 0) }; }
const inFront = p => p.x < TRAY.x + TRAY.w && p.y < TRAY.y + TRAY.h && p.y > CEIL;
const inBack = p => p.x > BACK.x && p.y > BACK.y && p.y < BACK.y + BACK.h;

// ---------- состояние хоста ----------
let engine = null, items = [], hands = [], bots = [], G = null, PHASE = 'menu', nextId = 1;
let seats = [], inputs = [{}, {}, {}, {}];
let fxLog = [], fxId = 0;
const prog = () => clamp(G.time / ROUND, 0, 1);
const patience = () => 30 - 10 * prog();

function newGame() {
  engine = Engine.create();
  engine.gravity.y = 1; engine.gravity.x = 0;
  engine.positionIterations = 8; engine.velocityIterations = 6;
  const st = (x, y, w, h) => Bodies.rectangle(x + w / 2, y + h / 2, w, h, { isStatic: true, friction: 0.6 });
  Composite.add(engine.world, [
    st(0, FLOOR, W, 80), st(0, CEIL - 60, W, 60), st(LWALL - 60, 0, 60, H), st(RWALL, 0, 60, H),
    st(LWALL, DRV_TOP, TRAY.x - LWALL - 3, FLOOR - DRV_TOP),               // водитель
    st(TRAY.x - 3, TRAY_TOP, TRAY.w + 6, 12), st(TRAY.x + TRAY.w - 3, TRAY_TOP - 24, 6, 24), // касса + бортик
    st(BACK.x + 5, 480, RWALL - BACK.x - 5, 20),                           // задний диван
    ...SEAT_X.map(x => st(x - 78, LAP_Y, 100, 18)),                        // колени
  ]);
  Events.on(engine, 'collisionStart', onCollide);
  items = []; nextId = 1;
  G = {
    time: 0, score: 0, anger: 0, gx: 0, speed: 0, seg: -1, boarded: false,
    nextEvt: 6, evt: null, evtT: 0, fareQueue: 0, nextFare: 0, nextMid: 16, timers: [],
    lastDrvSay: -10, lastOverdueSay: -10, lastSnd: 0, lastShout: [-9, -9, -9, -9],
    stats: { fares: 0, coins: 0, specials: 0, lost: 0, broken: 0 }, result: null,
  };
  hands = [0, 1, 2, 3].map(s => ({ x: SEAT_X[s] - 38, y: LAP_Y - 12, tx: SEAT_X[s] - 38, ty: LAP_Y - 12, grab: false, prev: false, held: null, lean: false, jx: 0, jy: 0, noGrab: 0 }));
  bots = [0, 1, 2, 3].map(s => ({ ...BOTS[s], t: 0, cur: null, hold: 0, patience: 3, idleT: rand(8, 20) }));
}

function spawnItem(type, x, y, o = {}) {
  const T = TYPES[type];
  const opt = { density: T.dens, friction: T.fr, restitution: type === 'coin' ? 0.35 : 0.15, frictionAir: 0.012 };
  const body = T.r ? Bodies.circle(x, y, T.r, opt) : Bodies.rectangle(x, y, T.w, T.h, { ...opt, chamfer: { radius: 5 } });
  Composite.add(engine.world, body);
  const it = {
    id: nextId++, type, body, dest: o.dest || (type === 'coin' ? 'back' : 'front'),
    holder: o.holder ?? -1, slot: o.slot ?? -1, born: G.time, value: o.value || 0, change: !!o.change,
    squashed: false, overdue: false, floorT: 0, touched: false, ignore: {}, heldSince: 0,
    flapT: rand(1, 2.5), bounceAt: -9, offered: false, dead: false,
  };
  body.plugin = { item: it };
  items.push(it);
  return it;
}

function kill(it) {
  if (it.dead) return;
  it.dead = true;
  if (it.holder >= 0 && it.holder < 4 && hands[it.holder].held === it) hands[it.holder].held = null;
}

// ---------- эффекты (уходят и клиентам) ----------
function fx(e) { e.id = ++fxId; e.at = performance.now(); fxLog.push(e); handleFx(e); }
const say = (who, text) => fx({ k: 'say', w: who, s: text });
const pop = (x, y, s, c) => fx({ k: 'pop', x: Math.round(x), y: Math.round(y), s, c });
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
  Engine.update(engine, 1000 / 60);
  afterPhysics(dt);
}

function applyInput(s) {
  const i = inputs[s], h = hands[s];
  if (i.x == null) return;
  h.tx = i.x; h.ty = i.y; h.grab = !!i.g; h.lean = !!i.l;
}

function updateHands(dt) {
  for (let s = 0; s < 4; s++) {
    const h = hands[s], bot = seats[s].bot;
    const sh = shoulder(s, h.lean), r = h.lean ? LEAN_REACH : REACH;
    let dx = h.tx - sh.x, dy = h.ty - sh.y;
    const d = Math.hypot(dx, dy);
    if (d > r) { dx *= r / d; dy *= r / d; }
    const tx = sh.x + dx, ty = clamp(sh.y + dy, CEIL + 12, FLOOR - 10);
    let k = bot ? bots[s].speed : 0.5;
    if (h.held && h.held.type === 'bucket') k *= 0.45;
    h.x += (tx - h.x) * k; h.y += (ty - h.y) * k;
    h.jx *= 0.82; h.jy *= 0.82;
    const hx = h.x + h.jx, hy = h.y + h.jy;
    h.rx = hx; h.ry = hy;
    h.noGrab = Math.max(0, h.noGrab - dt);
    if (PHASE === 'play') {
      const fresh = h.grab && !h.prev;
      if (h.grab && !h.held && h.noGrab <= 0) tryGrab(s, fresh, hx, hy);
      if (!h.grab && h.held) release(s);
      if (h.held) {
        const b = h.held.body;
        Body.setVelocity(b, { x: (hx - b.position.x) * 0.45, y: (hy - b.position.y) * 0.45 });
        Body.setAngularVelocity(b, b.angularVelocity * 0.7 - b.angle * 0.08);
        if (Math.hypot(hx - b.position.x, hy - b.position.y) > 95) {
          const it = h.held; release(s); it.ignore[s] = G.time + 3;
        }
      }
    }
    h.prev = h.grab;
  }
}

function tryGrab(s, fresh, hx, hy) {
  let best = null, bd = 1e9;
  for (const it of items) {
    if (it.dead || it.holder === s) continue;
    if (it.holder >= 0 && it.holder < 4 && !fresh) continue; // отобрать можно только свежим хватом
    const p = it.body.position, T = TYPES[it.type];
    const rad = T.r || Math.max(T.w, T.h) / 2;
    const d = Math.hypot(p.x - hx, p.y - hy) - rad;
    if (d < 22 && d < bd) { bd = d; best = it; }
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
  const v = it.body.velocity, sp = Math.hypot(v.x, v.y);
  if (sp > 20) Body.setVelocity(it.body, { x: v.x * 20 / sp, y: v.y * 20 / sp });
}

// ---------- боты-пассажиры ----------
function botRest(s) { const h = hands[s]; h.tx = SEAT_X[s] - 38; h.ty = LAP_Y - 12; h.grab = false; h.lean = false; }

function botThink(s, dt) {
  const b = bots[s], h = hands[s];
  if (h.held) {
    const it = h.held, dir = it.dest === 'front' ? -1 : 1, sh = shoulder(s, false);
    const terminal = (dir < 0 && s === 0) || (dir > 0 && s === 3);
    let tx, ty;
    if (terminal) { if (dir < 0) { tx = TRAY.x + TRAY.w / 2; ty = TRAY.y + 8; } else { tx = BACK.x + 45; ty = 410; } }
    else { tx = sh.x + dir * (REACH - 10); ty = SHOULDER_Y - 15; }
    h.tx = tx; h.ty = ty; h.lean = false; h.grab = true;
    if (Math.hypot(h.x - tx, h.y - ty) < 28) {
      b.hold += dt;
      if (!terminal) it.offered = true;
      if (terminal && b.hold > 0.3) h.grab = false;
      else if (b.hold > b.patience) {
        h.grab = false; it.ignore[s] = G.time + 2.5;
        if (Math.random() < 0.6) say(s, 'Ну бери уже!');
      }
    } else b.hold = 0;
    return;
  }
  b.hold = 0;
  const it = botTarget(s);
  if (!it) {
    b.cur = null; botRest(s);
    b.idleT -= dt;
    if (b.idleT <= 0) { b.idleT = rand(15, 30); if (Math.random() < 0.5) say(s, pick(BOT_LINES[b.kind].idle)); }
    return;
  }
  if (b.cur !== it) { b.cur = it; b.t = rand(b.delay[0], b.delay[1]); }
  if (b.t > 0) { b.t -= dt; h.grab = false; return; }
  const p = it.body.position, sh = shoulder(s, false);
  h.lean = Math.hypot(p.x - sh.x, p.y - sh.y) > REACH - 12;
  h.tx = p.x; h.ty = p.y;
  h.grab = Math.hypot(h.x - p.x, h.y - p.y) < 34;
  if (h.grab) b.patience = rand(2, 3.5);
}

function botTarget(s) {
  const sh = shoulder(s, false), shl = shoulder(s, true);
  let best = null, bs = 1e9;
  for (const it of items) {
    if (it.dead || (it.ignore[s] || 0) > G.time) continue;
    const p = it.body.position, dir = it.dest === 'front' ? -1 : 1;
    const d = Math.hypot(p.x - sh.x, p.y - sh.y), dl = Math.hypot(p.x - shl.x, p.y - shl.y);
    if (d > REACH - 8 && dl > LEAN_REACH - 12) continue;
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
        if (dir < 0 ? p.x > SEAT_X[hd] - 60 : p.x < SEAT_X[hd] + 60) continue;
      }
    }
    if (hd === -1 && ((inFront(p) && dir < 0) || (inBack(p) && dir > 0))) continue;
    const sc = d + (it.type === 'fare' && G.time - it.born > 20 ? -80 : 0);
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
  let gx = 0, target = 1;
  if (u < 4) { target = 0; if (!G.boarded && u > 0.8) { G.boarded = true; board(); } }
  else if (u < 5.5) gx = 0.45;
  else if (u > SEG - 1.6) { gx = -0.55; target = 0; }
  if (G.evt) { G.evtT -= dt; gx += G.evt.gx; if (G.evtT <= 0) G.evt = null; }
  else if (u >= 5.5 && u < SEG - 2.5) {
    G.nextEvt -= dt;
    if (G.nextEvt <= 0) { roadEvent(); G.nextEvt = rand(3.5, 7) * (1 - 0.4 * prog()); }
  }
  G.gx += (gx - G.gx) * Math.min(1, dt * 6);
  engine.gravity.x = G.gx;
  G.speed += (target - G.speed) * Math.min(1, dt * 0.9);
}

function roadEvent() {
  const r = Math.random();
  if (r < 0.5) bump(rand(0.7, 1.1), 'Яма!');
  else if (r < 0.68) { bump(0.8, 'Лежачий полицейский!'); G.timers.push({ at: G.time + 0.35, fn: () => bump(0.9) }); }
  else if (r < 0.85) { G.evt = { gx: -0.9 }; G.evtT = 0.7; flash('ТОРМОЗ!'); snd('horn'); driverSay(pick(DRV.brake)); fx({ k: 'shake', m: 0.6 }); }
  else if (r < 0.93) bump(1.6, 'ЯМИЩА!');
  else { G.evt = { gx: 0.8 }; G.evtT = 0.6; flash('ГАЗУЕТ!'); }
}

function bump(mag, label) {
  for (const it of items) {
    if (it.dead || it.holder !== -1) continue;
    const b = it.body;
    Body.setVelocity(b, { x: b.velocity.x + rand(-1.5, 1.5) * mag, y: b.velocity.y - rand(4, 8) * mag });
    Body.setAngularVelocity(b, rand(-0.15, 0.15) * mag);
  }
  fx({ k: 'shake', m: mag }); snd('bump');
  if (label) flash(label);
  for (let s = 0; s < 4; s++) {
    const h = hands[s];
    h.jy -= rand(20, 40) * mag; h.jx += rand(-10, 10) * mag;
    if (!h.held) continue;
    const heavy = h.held.type === 'bucket';
    if ((seats[s].bot && Math.random() < bots[s].fumble * mag) || (!seats[s].bot && heavy && Math.random() < 0.25 * mag)) {
      const it = h.held; release(s); it.ignore[s] = G.time + 1.5;
      say(s, seats[s].bot ? pick(BOT_LINES[bots[s].kind].drop) : 'Тяжёлое!!');
    }
  }
}

function board() {
  const p = prog();
  G.fareQueue += 2 + Math.floor(Math.random() * (2 + p * 3));
  if (Math.random() < 0.6 + p * 0.4) spawnSpecial();
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
      G.nextMid = rand(7, 13) * (1 - 0.45 * prog());
      G.fareQueue++;
      say('npc', pick(['Ой, я ж не передал!', 'Передайте, пожалуйста!', 'За двоих передайте!']));
      if (Math.random() < 0.2 + 0.4 * prog()) spawnSpecial();
    }
  }
}

function freeSlot() {
  for (let i = 0; i < 3; i++) if (!items.some(it => !it.dead && it.holder === 9 && it.slot === i)) return i;
  return -1;
}
const slotPos = i => ({ x: 1196, y: 330 + i * 70 });

function spawnFare(sl) {
  const p = slotPos(sl), v = pick([50, 50, 100, 100, 100, 200, 500]);
  spawnItem('fare', p.x, p.y, { holder: 9, slot: sl, value: v, change: v >= 500 || Math.random() < 0.55 });
}

function spawnSpecial() {
  const type = pick(SPECIAL), sl = freeSlot();
  if (sl >= 0 && Math.random() < 0.5) {
    const p = slotPos(sl);
    spawnItem(type, p.x, p.y, { holder: 9, slot: sl, dest: 'front' });
    say('npc', 'Передайте водителю ' + ITEM_NAME[type] + '!');
  } else {
    spawnItem(type, TRAY.x + TRAY.w / 2, TRAY.y - 30, { dest: 'back' });
    say('drv', 'Передайте назад ' + ITEM_NAME[type] + '!');
  }
}

function spawnChange(v) {
  const n = v >= 500 ? 3 : v >= 200 ? 2 : 1 + (Math.random() < 0.4 ? 1 : 0);
  for (let i = 0; i < n; i++) {
    const c = spawnItem('coin', TRAY.x + 25 + i * 28, TRAY.y - 10, { dest: 'back' });
    Body.setVelocity(c.body, { x: rand(-1, 1), y: rand(-2, 0) });
  }
  driverSay(pick(DRV.change)); snd('clink');
}

// ---------- после физики: доставка, потери, гуси ----------
function afterPhysics(dt) {
  const p = prog();
  for (const it of items) {
    if (it.dead) continue;
    const b = it.body, pos = b.position;
    if (pos.x < LWALL - 20 || pos.x > RWALL + 20 || pos.y > FLOOR + 30 || pos.y < CEIL - 30) {
      Body.setPosition(b, { x: clamp(pos.x, LWALL + 30, RWALL - 30), y: clamp(pos.y, CEIL + 30, FLOOR - 30) });
      Body.setVelocity(b, { x: 0, y: 0 });
    }
    if (it.holder === 9) {
      const sp = slotPos(it.slot);
      Body.setVelocity(b, { x: (sp.x - pos.x) * 0.3, y: (sp.y - pos.y) * 0.3 });
      Body.setAngularVelocity(b, -b.angle * 0.2);
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
        if (it.holder === -1) Body.setVelocity(b, { x: b.velocity.x + rand(-6, 6), y: b.velocity.y - rand(4, 8) });
        else if (it.holder < 4) {
          const s = it.holder, h = hands[s];
          h.jx += rand(-45, 45); h.jy += rand(-30, 15);
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
      if (!it.dead && pos.y > FLOOR - 45) { it.floorT += dt; if (it.floorT > 10) loseItem(it, 'укатилось!'); }
      else it.floorT = 0;
    } else it.floorT = 0;
  }
  for (const it of items) if (it.dead) Composite.remove(engine.world, it.body);
  items = items.filter(i => !i.dead);
  G.anger = clamp(G.anger, 0, 100);
  if (G.anger >= 100) endGame('lose');
}

function bounceOut(it, dir) {
  Body.setVelocity(it.body, { x: dir * rand(6, 9), y: -rand(5, 8) });
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
  pop(pos.x, pos.y - 20, '+' + pts, '#7CFC7C'); snd('ok');
  kill(it);
}

function loseItem(it, txt) {
  const pos = it.body.position;
  G.stats.lost++; G.score = Math.max(0, G.score - 5); G.anger += 4;
  pop(pos.x, pos.y - 30, txt, '#ff8080'); snd('bad');
  kill(it);
}

function breakJar(it) {
  const pos = it.body.position;
  G.stats.broken++; G.score = Math.max(0, G.score - 10); G.anger += 8;
  pop(pos.x, pos.y - 30, 'ДЗЫНЬ!', '#ff8080'); snd('break');
  fx({ k: 'splash', x: Math.round(pos.x), y: Math.round(pos.y), c: '#7cb342' });
  driverSay(pick(DRV.broke));
  kill(it);
}

function onCollide(e) {
  for (const pr of e.pairs) {
    const A = pr.bodyA, B = pr.bodyB;
    const rel = Math.hypot(A.velocity.x - B.velocity.x, A.velocity.y - B.velocity.y);
    let coin = false;
    for (const bd of [A, B]) {
      const it = bd.plugin && bd.plugin.item;
      if (!it || it.dead) continue;
      if (it.type === 'coin') coin = true;
      if (it.type === 'jar' && rel > 11 && it.holder === -1) breakJar(it);
      else if (it.type === 'cake' && rel > 9 && !it.squashed && it.holder === -1) {
        it.squashed = true; pop(bd.position.x, bd.position.y - 30, 'торт всмятку!', '#ffb3c7'); snd('splat');
      }
    }
    if (rel > 5 && G.time - G.lastSnd > 0.07) { G.lastSnd = G.time; snd(coin ? 'clink' : 'thump'); }
  }
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
  if (G) say(s, '*пересел, теперь тут бот*');
}
function moveSeat(pid, ns) {
  const s = seatOf(pid);
  if (s < 0 || !seats[ns] || !seats[ns].bot) return;
  seats[ns] = { ...seats[s] }; inputs[ns] = inputs[s];
  seats[s] = { pid: null, name: BOTS[s].name, bot: true }; inputs[s] = {};
  if (hands[s] && hands[s].held) release(s);
}

// ---------- пакеты ----------
function buildPacket() {
  const p = prog();
  return {
    t: 's', ph: PHASE, tm: +G.time.toFixed(2), sc: G.score, an: Math.round(G.anger),
    gx: +G.gx.toFixed(2), sp: +G.speed.toFixed(2),
    it: items.filter(i => !i.dead).map(i => [
      i.id, TL.indexOf(i.type), Math.round(i.body.position.x), Math.round(i.body.position.y),
      Math.round(i.body.angle * 100), i.holder,
      (i.dest === 'back' ? 1 : 0) | (i.squashed ? 2 : 0) | (i.overdue ? 4 : 0) | (i.floorT > 4 ? 8 : 0),
      i.type === 'fare' ? Math.min(100, Math.round((G.time - i.born) / patience() * 100)) : 0, i.value]),
    hd: hands.map(h => [Math.round(h.rx ?? h.x), Math.round(h.ry ?? h.y), h.held ? 1 : (h.grab ? 2 : 0), h.lean ? 1 : 0]),
    se: seats.map(s => [s.pid || '', s.name, s.bot ? 1 : 0]),
    fx: fxLog.slice(-30), res: G.result, st: PHASE === 'end' ? G.stats : null,
  };
}
function parse(p) {
  return {
    ph: p.ph, tm: p.tm, sc: p.sc, an: p.an, gx: p.gx, sp: p.sp,
    items: p.it.map(a => ({ id: a[0], type: TL[a[1]], x: a[2], y: a[3], a: a[4] / 100, holder: a[5], fl: a[6], age: a[7], val: a[8] })),
    hands: p.hd.map(a => ({ x: a[0], y: a[1], st: a[2], l: a[3] })),
    seats: p.se.map(a => ({ pid: a[0], name: a[1], bot: !!a[2] })),
    res: p.res, st: p.st,
  };
}

// ---------- сеть ----------
// Trystero: игроки находят друг друга через публичные WebTorrent-трекеры, дальше — прямой WebRTC.
// Бесплатно, без своего сервера и без регистрации.
const TRYSTERO_URL = 'https://cdn.jsdelivr.net/npm/trystero@0.21.8/torrent/+esm';
const APP_ID = 'peredayte-za-proezd-v1';
const RTC = { iceServers: [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
] };
const NET = { role: null, room: null, conns: new Set(), hostId: null, myPid: null, code: null, latest: null, lastFx: 0, gotSeat: false, timers: [], tx: null };
let TRY = null;
async function loadNet() {
  if (!TRY) TRY = await import(TRYSTERO_URL);
  return TRY;
}

function genCode() { const a = 'ABCDEFGHJKLMNPRSTUVWXYZ'; let s = ''; for (let i = 0; i < 4; i++) s += a[Math.floor(Math.random() * a.length)]; return s; }

function openRoom(T, code) {
  const room = T.joinRoom({ appId: APP_ID, rtcConfig: RTC }, code);
  const [sendSt, getSt] = room.makeAction('st');
  const [sendIn, getIn] = room.makeAction('in');
  const [sendCtl, getCtl] = room.makeAction('ctl');
  NET.room = room;
  NET.tx = { sendSt, sendIn, sendCtl };
  return { room, getSt, getIn, getCtl };
}

async function hostCreate(name) {
  menuError('Подаём маршрутку…');
  let T;
  try { T = await loadNet(); } catch (e) { menuError('Сетевая библиотека не загрузилась — попробуй «Покататься с ботами»'); return; }
  menuError('');
  NET.role = 'host'; NET.myPid = 'host'; NET.code = genCode(); NET.conns.clear();
  resetSeats(); addPlayer('host', name);
  newGame(); PHASE = 'lobby';
  show('lobby'); lobbyKey = '';
  $('lobbyCode').textContent = NET.code;
  $('lobbyStatus').textContent = 'Маршрутка ждёт пассажиров. Скинь друзьям код или ссылку.';
  $('btnStart').classList.remove('hidden'); $('waitHost').classList.add('hidden');
  const { room, getIn, getCtl } = openRoom(T, NET.code);
  getCtl((d, pid) => onHostCtl(pid, d));
  getIn((d, pid) => {
    const s = seatOf(pid);
    if (s >= 0) inputs[s] = { x: +d.x, y: +d.y, g: !!d.g, l: !!d.l };
  });
  room.onPeerLeave(pid => { NET.conns.delete(pid); removePlayer(pid); });
}

function onHostCtl(pid, d) {
  if (!d || !d.t) return;
  if (d.t === 'hello') {
    if (NET.conns.has(pid)) return;
    const s = addPlayer(pid, String(d.name || '').slice(0, 14));
    if (s < 0) { NET.tx.sendCtl({ t: 'full' }, pid); return; }
    NET.conns.add(pid);
    say(s, 'Здрасьте!');
  } else if (!NET.conns.has(pid)) return;
  else if (d.t === 'seat') moveSeat(pid, +d.s);
  else if (d.t === 'say') doShout(seatOf(pid), +d.i);
}

function broadcast(pkt) {
  if (NET.tx && NET.conns.size) { try { NET.tx.sendSt(pkt, [...NET.conns]); } catch (e) {} }
}

function clientSend(kind, d) {
  if (NET.role !== 'client' || !NET.hostId || !NET.tx) return;
  try { (kind === 'in' ? NET.tx.sendIn : NET.tx.sendCtl)(d, NET.hostId); } catch (e) {}
}

async function clientJoin(name, code) {
  code = code.toUpperCase().replace(/[^A-Z]/g, '');
  if (code.length !== 4) { menuError('Код — 4 латинские буквы'); return; }
  menuError('Ищем маршрутку ' + code + '…');
  let T;
  try { T = await loadNet(); } catch (e) { menuError('Сетевая библиотека не загрузилась'); return; }
  NET.role = 'client'; NET.code = code; NET.latest = null; NET.lastFx = 0; NET.gotSeat = false; NET.hostId = null;
  NET.myPid = T.selfId;
  const { room, getSt, getCtl } = openRoom(T, code);
  const hello = pid => { try { NET.tx.sendCtl({ t: 'hello', name }, pid); } catch (e) {} };
  room.onPeerJoin(pid => hello(pid));
  // пока хост не принял — повторяем приветствие
  NET.timers.push(setInterval(() => { if (!NET.gotSeat && NET.hostId) hello(NET.hostId); }, 1000));
  NET.timers.push(setTimeout(() => {
    if (NET.role === 'client' && !NET.latest) { leave(); menuError('Маршрутка ' + code + ' не найдена. Проверь код — или хост ещё не создал комнату.'); }
  }, 25000));
  getSt((d, pid) => {
    if (NET.hostId && pid !== NET.hostId) return;
    NET.hostId = pid;
    onClientData(d);
  });
  getCtl(d => { if (d && d.t === 'full') { leave(); menuError('Маршрутка полная — 4 из 4'); } });
  room.onPeerLeave(pid => {
    if (pid === NET.hostId && NET.role === 'client') { leave(); menuError('Водитель уехал без вас (хост отключился)'); }
  });
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
  const room = NET.room;
  NET.timers.forEach(t => { clearInterval(t); clearTimeout(t); }); NET.timers = [];
  NET.role = null; NET.room = null; NET.tx = null; NET.hostId = null; NET.conns.clear(); NET.latest = null; NET.myPid = null;
  if (room) { try { room.leave(); } catch (e) {} }
  PHASE = 'menu'; SM.items.clear(); SM.hands = null;
  show('menu');
}

// ---------- интерфейс ----------
function show(id) { for (const k of ['menu', 'lobby', 'end']) $(k).classList.toggle('hidden', k !== id); }
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
  if (NET.role === 'host') { moveSeat('host', i); }
  else clientSend('ctl', { t: 'seat', s: i });
}

const RANKS = [[0, 'Заяц без билета'], [150, 'Пассажир со стажем'], [300, 'Мастер передачи'], [450, 'Король галёрки'], [600, 'Легенда маршрута №13']];
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

// ---------- ввод ----------
const INP = { x: null, y: null, g: false, kl: false, rl: false, tl: false };
const leanNow = () => !!(INP.kl || INP.rl || INP.tl);
const cv = $('cv'), ctx = cv.getContext('2d');
function toLogical(e) { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) / r.width * W, y: (e.clientY - r.top) / r.height * H }; }
cv.addEventListener('pointermove', e => { const p = toLogical(e); INP.x = p.x; INP.y = p.y; });
cv.addEventListener('pointerdown', e => {
  audioUnlock();
  const p = toLogical(e); INP.x = p.x; INP.y = p.y;
  if (e.button === 2) INP.rl = true; else INP.g = true;
  try { cv.setPointerCapture(e.pointerId); } catch (er) {}
  e.preventDefault();
});
cv.addEventListener('pointerup', e => { if (e.button === 2) INP.rl = false; else INP.g = false; });
cv.addEventListener('pointercancel', () => { INP.g = false; INP.rl = false; });
cv.addEventListener('contextmenu', e => e.preventDefault());
addEventListener('keydown', e => {
  if (e.target.tagName === 'INPUT') return;
  if (e.code === 'Space') { INP.kl = true; e.preventDefault(); }
  const n = '12345'.indexOf(e.key);
  if (n >= 0 && !e.repeat) shout(n);
});
addEventListener('keyup', e => { if (e.code === 'Space') INP.kl = false; });
addEventListener('blur', () => { INP.g = false; INP.kl = false; INP.rl = false; });
function shout(i) {
  if (NET.role === 'host' || NET.role === 'solo') doShout(seatOf(NET.myPid), i);
  else clientSend('ctl', { t: 'say', i });
}
const lb = $('leanBtn');
if (matchMedia('(pointer:coarse)').matches) lb.classList.remove('hidden');
lb.addEventListener('pointerdown', e => { INP.tl = true; e.preventDefault(); });
lb.addEventListener('pointerup', () => { INP.tl = false; });
lb.addEventListener('pointercancel', () => { INP.tl = false; });

// ---------- звук ----------
let AC = null;
function audioUnlock() { try { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); if (AC.state === 'suspended') AC.resume(); } catch (e) {} }
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
};
function playSnd(n) { try { SFX[n] && SFX[n](); } catch (e) {} }

// ---------- визуальные эффекты ----------
const VS = { t: 0, scroll: 0, shake: 0, strap: 0, bubbles: {}, pops: [], banner: null, parts: [] };
function handleFx(e) {
  switch (e.k) {
    case 'say': VS.bubbles[e.w] = { s: e.s, until: VS.t + 2.6 }; break;
    case 'pop': VS.pops.push({ x: e.x, y: e.y, s: e.s, c: e.c, t: 0 }); break;
    case 'snd': playSnd(e.n); break;
    case 'flash': VS.banner = { s: e.s, t: 0 }; break;
    case 'shake': VS.shake = Math.max(VS.shake, e.m); break;
    case 'splash': for (let i = 0; i < 18; i++) VS.parts.push({ x: e.x, y: e.y, vx: rand(-4, 4), vy: rand(-7, -1), c: e.c, t: 0 }); break;
  }
}

// ---------- сглаживание у клиента ----------
const SM = { items: new Map(), hands: null };
function smooth(t, dt) {
  const f = 1 - Math.exp(-dt * 16);
  const seen = new Set();
  for (const it of t.items) {
    seen.add(it.id);
    const d = SM.items.get(it.id);
    if (!d) { SM.items.set(it.id, { ...it }); continue; }
    const nx = d.x + (it.x - d.x) * f, ny = d.y + (it.y - d.y) * f, na = d.a + angDiff(d.a, it.a) * f;
    Object.assign(d, it); d.x = nx; d.y = ny; d.a = na;
  }
  for (const id of [...SM.items.keys()]) if (!seen.has(id)) SM.items.delete(id);
  if (!SM.hands) SM.hands = t.hands.map(h => ({ ...h }));
  t.hands.forEach((h, i) => { const d = SM.hands[i]; d.st = h.st; d.l = h.l; d.x += (h.x - d.x) * f; d.y += (h.y - d.y) * f; });
  return { ...t, items: [...SM.items.values()].map(i => ({ ...i })), hands: SM.hands.map(h => ({ ...h })) };
}
function predictOwn(view) {
  const my = view.seats.findIndex(s => s.pid === NET.myPid);
  if (my < 0 || INP.x == null) return;
  const lean = leanNow(), sh = shoulder(my, lean), r = lean ? LEAN_REACH : REACH;
  let dx = INP.x - sh.x, dy = INP.y - sh.y;
  const d = Math.hypot(dx, dy);
  if (d > r) { dx *= r / d; dy *= r / d; }
  const px = sh.x + dx, py = clamp(sh.y + dy, CEIL + 12, FLOOR - 10);
  const th = NET.latest.hands[my];
  for (const it of view.items) {
    if (it.holder !== my) continue;
    const t = NET.latest.items.find(q => q.id === it.id);
    if (t) { it.x = px + (t.x - th.x); it.y = py + (t.y - th.y); it.a = t.a; }
  }
  view.hands[my].x = px; view.hands[my].y = py; view.hands[my].l = lean ? 1 : 0;
}

// ---------- отрисовка ----------
let SCALE = 1, DPR = 1;
function fit() {
  DPR = Math.min(2, window.devicePixelRatio || 1);
  SCALE = Math.min(innerWidth / W, innerHeight / H);
  cv.style.width = W * SCALE + 'px'; cv.style.height = H * SCALE + 'px';
  cv.width = Math.round(W * SCALE * DPR); cv.height = Math.round(H * SCALE * DPR);
}
addEventListener('resize', fit);
fit();

const FONT = (w, s) => `${w} ${s}px Rubik, system-ui, sans-serif`;
function rr(x, y, w, h, r) { ctx.beginPath(); ctx.roundRect(x, y, w, h, r); }
function line(x1, y1, x2, y2, w, c) { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function circ(x, y, r, c) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill(); }
function hash(n) { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

function idleView() {
  return {
    ph: 'menu', sp: 1, gx: 0, an: 0, sc: 0, tm: 0, items: [],
    hands: [0, 1, 2, 3].map(s => ({ x: SEAT_X[s] - 38, y: LAP_Y - 12, st: 0, l: 0 })),
    seats: BOTS.map(b => ({ pid: '', name: b.name, bot: true })),
  };
}

function render(v, dt) {
  if (!v) v = idleView();
  VS.scroll += (v.sp || 0) * dt * 420;
  VS.shake = Math.max(0, VS.shake - dt * 2.5);
  VS.strap += ((v.gx || 0) * 0.8 - VS.strap) * Math.min(1, dt * 5);
  ctx.setTransform(SCALE * DPR, 0, 0, SCALE * DPR, 0, 0);
  drawOutside(v);
  ctx.save();
  const sk = VS.shake;
  ctx.translate(Math.sin(VS.t * 53) * sk * 4, Math.cos(VS.t * 41) * sk * 5 + Math.sin(VS.t * 9) * (v.sp || 0) * 0.8);
  drawWheels();
  drawInterior();
  drawShell();
  drawStraps();
  drawDriver(v);
  drawBackRow(v);
  for (let s = 0; s < 4; s++) drawSeat(s);
  for (let s = 0; s < 4; s++) drawPassenger(s, v);
  const my = v.seats.findIndex(s => s.pid === NET.myPid);
  if (v.ph === 'play' && my >= 0) drawReach(v, my);
  for (const it of v.items) drawItem(it, my);
  drawNpcArms(v);
  for (let s = 0; s < 4; s++) drawSeatArm(s, v);
  if (v.ph === 'play' && my >= 0) drawGrabHint(v, my);
  drawParticles(dt);
  drawPops(dt);
  drawBubbles(v);
  ctx.restore();
  if (v.ph === 'play' || v.ph === 'end') drawHUD(v);
  drawBanner(dt);
  if (v.ph === 'play') drawHint();
}

function drawOutside(v) {
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#7ec8f0'); g.addColorStop(0.65, '#ffe2b8'); g.addColorStop(1, '#ffd29a');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  buildings(0.25, 300, '#a9bfd0', 180, 120, 260, false);
  buildings(0.6, 300, '#7f97ad', 150, 80, 200, true);
  // фонари
  const off = VS.scroll * 1.4, step = 300;
  for (let i = Math.floor(off / step) - 1; i < Math.floor((off + W) / step) + 2; i++) {
    const x = i * step - off;
    line(x, 140, x, 700, 6, '#4b5563');
    line(x, 140, x + 30, 140, 5, '#4b5563');
    circ(x + 32, 146, 7, '#fff3b0');
  }
  ctx.fillStyle = '#4a4d55'; ctx.fillRect(0, 686, W, 34);
  ctx.fillStyle = '#e8e8e8';
  const doff = VS.scroll % 120;
  for (let x = -doff; x < W; x += 120) ctx.fillRect(x, 704, 60, 5);
}

function buildings(par, base, color, sw, minH, maxH, wins) {
  const off = VS.scroll * par;
  for (let i = Math.floor(off / sw) - 1; i < Math.floor((off + W) / sw) + 2; i++) {
    const x = i * sw - off, r = hash(i * (par * 10 + 1));
    const w = sw * (0.6 + r * 0.35), h = minH + hash(i + 7.3) * (maxH - minH);
    ctx.fillStyle = color; ctx.fillRect(x, base - h + 100, w, 600);
    if (wins) {
      ctx.fillStyle = 'rgba(255,240,180,.55)';
      for (let wy = base - h + 115; wy < 640; wy += 26) for (let wx = x + 10; wx < x + w - 14; wx += 22) if (hash(wx * 3.1 + wy) > 0.45) ctx.fillRect(wx, wy, 10, 13);
    }
  }
}

function drawWheels() {
  for (const wx of [250, 1030]) {
    circ(wx, 668, 42, '#1e1e22');
    circ(wx, 668, 22, '#9aa0a6');
    const a = VS.scroll / 40;
    for (let k = 0; k < 5; k++) { const aa = a + k * Math.PI * 2 / 5; line(wx, 668, wx + Math.cos(aa) * 18, 668 + Math.sin(aa) * 18, 3, '#5f6368'); }
  }
}

function drawInterior() {
  ctx.beginPath();
  ctx.rect(LWALL, CEIL, RWALL - LWALL, FLOOR - CEIL);
  for (const [x, y, w, h] of WINS) ctx.rect(x, y, w, h);
  ctx.rect(48, 150, 120, 100);
  ctx.fillStyle = '#efe3c2';
  ctx.fill('evenodd');
  ctx.fillStyle = 'rgba(255,255,255,.08)';
  for (const [x, y, w, h] of WINS) ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = '#6b6b6b'; ctx.lineWidth = 6;
  for (const [x, y, w, h] of WINS) { rr(x, y, w, h, 10); ctx.stroke(); }
  rr(48, 150, 120, 100, 10); ctx.stroke();
  ctx.fillStyle = '#d9d4c7'; ctx.fillRect(LWALL, CEIL, RWALL - LWALL, 20);
  ctx.fillStyle = '#56657a'; ctx.fillRect(LWALL, 520, RWALL - LWALL, FLOOR - 520);
  ctx.fillStyle = '#3a3a3a'; ctx.fillRect(LWALL, FLOOR - 16, RWALL - LWALL, 16);
  ctx.fillStyle = '#2c2c2c';
  for (let x = LWALL; x < RWALL; x += 14) ctx.fillRect(x, FLOOR - 16, 6, 16);
  ctx.font = FONT(800, 12); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.textAlign = 'center';
  ctx.fillText('ПРОЕЗД 50 ₽', 500, 545);
  ctx.fillText('ДВЕРЬЮ НЕ ХЛОПАТЬ', 720, 545);
  ctx.fillText('ОСТАНОВКИ ПО ТРЕБОВАНИЮ', 940, 545);
  ctx.fillStyle = '#c62828'; rr(300, 532, 90, 20, 4); ctx.fill();
  ctx.fillStyle = '#fff'; ctx.fillText('ПЕРЕДАЁМ!', 345, 547);
}

function drawShell() {
  ctx.beginPath();
  ctx.roundRect(20, 108, W - 40, 552, 40);
  ctx.rect(LWALL, CEIL, RWALL - LWALL, FLOOR - CEIL);
  ctx.fillStyle = '#f4c11d';
  ctx.fill('evenodd');
  ctx.fillStyle = '#1e1e1e'; ctx.font = FONT(900, 15); ctx.textAlign = 'left';
  ctx.fillText('№ 13   АВТОВОКЗАЛ — РЫНОК — ОБЩАГА', 70, 125);
  ctx.fillStyle = '#e09b00'; ctx.fillRect(20, 628, W - 40, 10);
}

function drawStraps() {
  line(200, 152, RWALL - 10, 152, 5, '#bfc5cc');
  for (let x = 260; x < RWALL - 40; x += 110) {
    const a = -VS.strap * 0.9 + Math.sin(VS.t * 3 + x) * 0.05 * (1 + VS.shake * 4);
    const ex = x + Math.sin(a) * 34, ey = 152 + Math.cos(a) * 34;
    line(x, 152, ex, ey, 4, '#7a7a7a');
    ctx.strokeStyle = '#555'; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(ex + Math.sin(a) * 9, ey + Math.cos(a) * 9, 9, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawDriver(v) {
  const angry = v.an > 60;
  ctx.fillStyle = '#6d5c48'; ctx.fillRect(LWALL, DRV_TOP + 170, TRAY.x - LWALL - 3, FLOOR - DRV_TOP - 186);
  ctx.fillStyle = '#3b2b2b'; rr(132, DRV_TOP + 15, 40, 165, 10); ctx.fill();
  line(122, 440, 112, 330, 50, '#2f4f6f');
  ctx.fillStyle = '#26262b'; ctx.fillRect(40, 372, 52, 36);
  ctx.fillStyle = '#d4a017'; ctx.fillRect(52, 352, 14, 20);
  line(112, 345, 66, 368, 14, '#2f4f6f');
  circ(64, 368, 8, '#f0c39a');
  ctx.strokeStyle = '#222'; ctx.lineWidth = 6; ctx.beginPath(); ctx.ellipse(58, 368, 7, 34, 0, 0, Math.PI * 2); ctx.stroke();
  const hx = 108, hy = 292 + Math.sin(VS.t * 2) * 1.5;
  circ(hx, hy, 27, angry ? '#ef8b78' : '#f0c39a');
  ctx.fillStyle = '#1b1b1b';
  ctx.beginPath(); ctx.arc(hx, hy - 6, 27, Math.PI, 0); ctx.fill();
  ctx.fillRect(hx - 44, hy - 10, 30, 6);
  circ(hx - 12, hy + 2, 3, '#222');
  ctx.fillStyle = '#4a3020'; rr(hx - 26, hy + 10, 22, 7, 3); ctx.fill();
  if (angry) line(hx - 20, hy - 6, hx - 5, hy - 1, 3, '#222');
  // касса
  ctx.fillStyle = '#8b5a2b'; ctx.fillRect(TRAY.x - 3, TRAY_TOP, TRAY.w + 6, 12);
  ctx.fillRect(TRAY.x + TRAY.w - 3, TRAY_TOP - 24, 6, 24);
  ctx.fillStyle = '#5c3a1a'; ctx.font = FONT(900, 13); ctx.textAlign = 'center';
  ctx.fillText('КАССА', TRAY.x + TRAY.w / 2, TRAY_TOP + 28);
  if (v.ph === 'play') {
    ctx.fillStyle = 'rgba(255,200,0,' + (0.12 + Math.sin(VS.t * 4) * 0.06) + ')';
    rr(TRAY.x, TRAY.y, TRAY.w, TRAY.h, 8); ctx.fill();
  }
}

function drawBackRow(v) {
  ctx.fillStyle = '#7a2a2a'; rr(1212, 290, 28, 212, 8); ctx.fill();
  ctx.fillStyle = '#8c2f2f'; rr(1148, 478, 92, 24, 8); ctx.fill();
  line(1222, 470, 1214, 360, 46, '#2e7d6b');
  circ(1208, 322, 25, '#e9b98f');
  ctx.fillStyle = '#7b4a2e'; ctx.beginPath(); ctx.arc(1210, 316, 26, Math.PI * 0.9, Math.PI * 2.1); ctx.fill();
  circ(1196, 320, 3, '#222');
  if (v.ph === 'play') {
    ctx.fillStyle = 'rgba(80,170,255,' + (0.1 + Math.sin(VS.t * 4) * 0.05) + ')';
    rr(BACK.x, BACK.y, BACK.w, BACK.h, 10); ctx.fill();
  }
}

function drawSeat(s) {
  const x = SEAT_X[s];
  ctx.fillStyle = '#8c2f2f'; rr(x + 20, 320, 30, 185, 10); ctx.fill();
  ctx.fillStyle = '#a33a3a'; rr(x - 82, 480, 132, 24, 8); ctx.fill();
  ctx.fillStyle = '#9aa0a6'; ctx.fillRect(x - 8, 504, 8, FLOOR - 520);
}

function seatLook(s, v) {
  const se = v.seats[s] || { bot: true };
  if (se.bot) return { kind: BOTS[s].kind, shirt: BOTS[s].shirt, pants: '#3d3d44', skin: '#efc49c' };
  return { kind: 'player', shirt: COLORS[s], pants: '#2d3142', skin: ['#f1c27d', '#e0ac69', '#f5d0b0', '#c68642'][s] };
}

function headPos(s, v) {
  const hd = v.hands[s], lean = hd && hd.l;
  const sh = shoulder(s, lean);
  const sway = -(v.gx || 0) * 12;
  return { x: sh.x + 4 + sway - (lean ? 12 : 0), y: sh.y - 46, sh: { x: sh.x + sway * 0.6, y: sh.y } };
}

function drawPassenger(s, v) {
  const x = SEAT_X[s], L = seatLook(s, v), hp = headPos(s, v), hd = v.hands[s];
  line(x + 8, 482, x - 62, 480, 26, L.pants);
  line(x - 62, 480, x - 70, 598, 22, L.pants);
  ctx.fillStyle = '#222'; ctx.beginPath(); ctx.ellipse(x - 82, 606, 20, 9, 0, 0, Math.PI * 2); ctx.fill();
  line(x + 10, 470, hp.sh.x + 4, hp.sh.y + 4, 50, L.shirt);
  if (L.kind === 'muzhik') { line(x + 2, 470, hp.sh.x - 4, hp.sh.y + 8, 3, '#fff'); line(x + 10, 470, hp.sh.x + 4, hp.sh.y + 8, 3, '#fff'); }
  const hx = hp.x, hy = hp.y;
  circ(hx, hy, 25, L.skin);
  // глаза смотрят на руку
  const ang = hd ? Math.atan2(hd.y - hy, hd.x - hx) : Math.PI;
  for (const ex of [-11, 3]) {
    circ(hx + ex, hy - 4, 6, '#fff');
    circ(hx + ex + Math.cos(ang) * 2.5, hy - 4 + Math.sin(ang) * 2.5, 3, '#222');
  }
  const talking = VS.bubbles[s] && VS.bubbles[s].until > VS.t;
  ctx.fillStyle = '#7a2e2e';
  ctx.beginPath(); ctx.ellipse(hx - 6, hy + 11, talking ? 6 : 5, talking ? 5 + Math.abs(Math.sin(VS.t * 18)) * 3 : 1.5, 0, 0, Math.PI * 2); ctx.fill();
  drawHeadwear(L, hx, hy, s);
  const se = v.seats[s];
  if (se) {
    ctx.font = FONT(700, 13); ctx.textAlign = 'center';
    const tw = ctx.measureText(se.name).width + 14;
    ctx.fillStyle = se.bot ? 'rgba(30,30,40,.55)' : COLORS[s];
    rr(hx - tw / 2, hy - 64, tw, 20, 10); ctx.fill();
    ctx.fillStyle = se.bot ? '#ddd' : '#111';
    ctx.fillText(se.name, hx, hy - 49);
    if (se.pid && se.pid === NET.myPid && v.ph !== 'menu') {
      const by = hy - 78 + Math.sin(VS.t * 5) * 3;
      ctx.fillStyle = '#fff'; ctx.font = FONT(900, 14);
      ctx.fillText('▼ ТЫ', hx, by);
    }
  }
}

function drawHeadwear(L, hx, hy, s) {
  switch (L.kind) {
    case 'babka':
      ctx.fillStyle = '#d64545';
      ctx.beginPath(); ctx.arc(hx + 2, hy - 2, 28, Math.PI * 0.95, Math.PI * 2.15); ctx.lineTo(hx + 18, hy + 26); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff';
      for (const [dx, dy] of [[-10, -18], [6, -22], [18, -8], [16, 10]]) circ(hx + dx, hy + dy, 2.5, '#fff');
      break;
    case 'ded':
      ctx.fillStyle = '#6b6b6b';
      ctx.beginPath(); ctx.ellipse(hx + 2, hy - 18, 28, 11, 0, 0, Math.PI * 2); ctx.fill();
      ctx.fillRect(hx - 34, hy - 16, 22, 6);
      ctx.fillStyle = '#eee'; rr(hx - 22, hy + 6, 22, 8, 4); ctx.fill();
      break;
    case 'student':
      ctx.fillStyle = '#222'; ctx.beginPath(); ctx.arc(hx, hy - 6, 26, Math.PI * 1.05, Math.PI * 1.95); ctx.fill();
      ctx.strokeStyle = '#111'; ctx.lineWidth = 5; ctx.beginPath(); ctx.arc(hx + 2, hy, 29, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      circ(hx + 14, hy + 2, 9, '#e53935');
      break;
    case 'muzhik':
      ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(hx, hy - 6, 25, Math.PI, 0); ctx.fill();
      ctx.fillRect(hx - 46, hy - 10, 34, 6);
      ctx.fillStyle = 'rgba(60,60,60,.35)'; ctx.beginPath(); ctx.arc(hx - 4, hy + 8, 14, 0, Math.PI); ctx.fill();
      break;
    default: {
      ctx.fillStyle = COLORS[s];
      ctx.beginPath(); ctx.arc(hx, hy - 6, 26, Math.PI, 0); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.fillRect(hx - 26, hy - 10, 52, 6);
      circ(hx, hy - 34, 8, '#fff');
    }
  }
}

function drawArm(sh, hand, sleeve, skin, st) {
  const L1 = 92, L2 = 92;
  const dx = hand.x - sh.x, dy = hand.y - sh.y;
  let d = Math.hypot(dx, dy) || 1;
  const f = Math.max(1, d / (L1 + L2 - 2)), l1 = L1 * f, l2 = L2 * f;
  d = Math.min(d, l1 + l2 - 0.01);
  const a = Math.atan2(dy, dx);
  const b = Math.acos(clamp((l1 * l1 + d * d - l2 * l2) / (2 * l1 * d), -1, 1));
  const e1 = { x: sh.x + Math.cos(a + b) * l1, y: sh.y + Math.sin(a + b) * l1 };
  const e2 = { x: sh.x + Math.cos(a - b) * l1, y: sh.y + Math.sin(a - b) * l1 };
  const el = e1.y > e2.y ? e1 : e2;
  line(sh.x, sh.y, el.x, el.y, 18, sleeve);
  line(el.x, el.y, hand.x, hand.y, 15, sleeve);
  if (st === 0) {
    circ(hand.x, hand.y, 11, skin);
    for (let k = -1; k <= 1; k++) {
      const fa = Math.atan2(hand.y - el.y, hand.x - el.x) + k * 0.4;
      line(hand.x, hand.y, hand.x + Math.cos(fa) * 15, hand.y + Math.sin(fa) * 15, 5, skin);
    }
  } else {
    circ(hand.x, hand.y, 10, skin);
    ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(hand.x, hand.y, 10, 0, Math.PI * 2); ctx.stroke();
  }
}

function drawSeatArm(s, v) {
  const hd = v.hands[s];
  if (!hd) return;
  const L = seatLook(s, v), hp = headPos(s, v);
  drawArm({ x: hp.sh.x - 4, y: hp.sh.y }, hd, L.shirt, L.skin, hd.st);
}

function drawNpcArms(v) {
  for (const it of v.items) {
    if (it.holder !== 9) continue;
    drawArm({ x: 1222, y: 380 }, { x: it.x + 8, y: it.y + 4 }, '#2e7d6b', '#e9b98f', 1);
  }
}

function drawReach(v, my) {
  const hd = v.hands[my], lean = hd && hd.l;
  const sh = shoulder(my, lean);
  ctx.strokeStyle = 'rgba(255,255,255,.22)'; ctx.lineWidth = 2; ctx.setLineDash([6, 8]);
  ctx.beginPath(); ctx.arc(sh.x, sh.y, lean ? LEAN_REACH : REACH, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
}

function drawGrabHint(v, my) {
  const hd = v.hands[my];
  if (!hd || hd.st === 1) return;
  let best = null, bd = 1e9;
  for (const it of v.items) {
    if (it.holder === my) continue;
    const T = TYPES[it.type], rad = T.r || Math.max(T.w, T.h) / 2;
    const d = Math.hypot(it.x - hd.x, it.y - hd.y) - rad;
    if (d < 22 && d < bd) { bd = d; best = it; }
  }
  if (!best) return;
  const T = TYPES[best.type], rad = (T.r || Math.max(T.w, T.h) / 2) + 8;
  ctx.strokeStyle = 'rgba(255,255,255,.9)'; ctx.lineWidth = 3; ctx.setLineDash([5, 5]);
  ctx.beginPath(); ctx.arc(best.x, best.y, rad, 0, Math.PI * 2); ctx.stroke();
  ctx.setLineDash([]);
}

function drawItem(d, my) {
  ctx.save();
  ctx.translate(d.x, d.y); ctx.rotate(d.a);
  switch (d.type) {
    case 'fare': {
      ctx.fillStyle = NOTE_COLOR[d.val] || '#9ccc65'; rr(-31, -15, 62, 30, 4); ctx.fill();
      ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.lineWidth = 2; rr(-27, -11, 54, 22, 3); ctx.stroke();
      ctx.fillStyle = 'rgba(0,0,0,.65)'; ctx.font = FONT(900, 15); ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(d.val + '₽', 0, 1); ctx.textBaseline = 'alphabetic';
      break;
    }
    case 'coin':
      circ(0, 0, 11, '#f6c945');
      ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(0, 0, 8, 0, Math.PI * 2); ctx.stroke();
      break;
    case 'bucket':
      ctx.fillStyle = '#ff8a3d'; ctx.beginPath(); ctx.moveTo(4, -22); ctx.lineTo(16, -36); ctx.lineTo(20, -24); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#9aa5b1'; ctx.beginPath(); ctx.moveTo(-22, -23); ctx.lineTo(22, -23); ctx.lineTo(17, 23); ctx.lineTo(-17, 23); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#4fa3e0'; ctx.beginPath(); ctx.ellipse(0, -22, 21, 5, 0, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = '#666'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(0, -22, 22, Math.PI, 0); ctx.stroke();
      break;
    case 'cake':
      if (d.fl & 2) {
        ctx.fillStyle = '#f8bbd0'; ctx.beginPath(); ctx.ellipse(0, 8, 36, 10, 0, 0, Math.PI * 2); ctx.fill();
        for (const [x, y, r] of [[-20, 2, 8], [10, 0, 10], [24, 6, 6]]) circ(x, y, r, '#fff');
        circ(-4, 4, 4, '#e53935');
      } else {
        ctx.fillStyle = '#f8bbd0'; rr(-32, -10, 64, 28, 6); ctx.fill();
        ctx.fillStyle = '#fff'; rr(-32, -18, 64, 12, 6); ctx.fill();
        for (let k = -24; k <= 24; k += 16) circ(k, -20, 4, '#e53935');
      }
      break;
    case 'jar':
      ctx.fillStyle = 'rgba(200,235,200,.9)'; rr(-15, -19, 30, 42, 6); ctx.fill();
      for (const [x, y] of [[-6, -6], [5, 2], [-4, 12], [6, -12]]) { ctx.fillStyle = '#558b2f'; ctx.beginPath(); ctx.ellipse(x, y, 4, 8, 0.3, 0, Math.PI * 2); ctx.fill(); }
      ctx.fillStyle = '#d4a017'; ctx.fillRect(-14, -24, 28, 7);
      break;
    case 'goose':
      ctx.fillStyle = '#fafafa'; ctx.beginPath(); ctx.ellipse(4, 4, 25, 15, 0, 0, Math.PI * 2); ctx.fill();
      line(-14, 0, -20, -20, 8, '#fafafa');
      circ(-21, -23, 8, '#fafafa');
      ctx.fillStyle = '#ff9800'; ctx.beginPath(); ctx.moveTo(-28, -25); ctx.lineTo(-40, -21); ctx.lineTo(-28, -19); ctx.closePath(); ctx.fill();
      circ(-23, -25, 2, '#111');
      ctx.fillStyle = '#e0e0e0'; ctx.beginPath(); ctx.ellipse(8, 0, 13, 7, -0.3 + Math.sin(VS.t * 20) * 0.2, 0, Math.PI * 2); ctx.fill();
      break;
    case 'cactus':
      ctx.fillStyle = '#c1642b'; ctx.beginPath(); ctx.moveTo(-15, 8); ctx.lineTo(15, 8); ctx.lineTo(11, 22); ctx.lineTo(-11, 22); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#43a047'; rr(-8, -22, 16, 32, 8); ctx.fill(); rr(-16, -10, 9, 14, 4); ctx.fill(); rr(7, -16, 9, 12, 4); ctx.fill();
      ctx.strokeStyle = '#1b5e20'; ctx.lineWidth = 1.5;
      for (let k = -18; k < 8; k += 6) { ctx.beginPath(); ctx.moveTo(-8, k); ctx.lineTo(-12, k - 2); ctx.moveTo(8, k); ctx.lineTo(12, k - 2); ctx.stroke(); }
      break;
  }
  ctx.restore();
  if (my >= 0 && d.holder === my) {
    const T = TYPES[d.type], rad = (T.r || Math.max(T.w, T.h) / 2) + 6;
    ctx.strokeStyle = COLORS[my]; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(d.x, d.y, rad, 0, Math.PI * 2); ctx.stroke();
  }
  if (d.type === 'fare') {
    const f = clamp(d.age / 100, 0, 1);
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(d.x - 25, d.y + 22, 50, 5);
    ctx.fillStyle = f < 0.6 ? '#7CFC7C' : f < 0.9 ? '#ffd54f' : '#ff5252';
    ctx.fillRect(d.x - 25, d.y + 22, 50 * (1 - f), 5);
    if (d.fl & 4 && Math.sin(VS.t * 12) > 0) { ctx.fillStyle = '#ff5252'; ctx.font = FONT(900, 18); ctx.textAlign = 'center'; ctx.fillText('!', d.x, d.y - 22); }
  } else if (d.type !== 'coin') {
    const back = d.fl & 1;
    ctx.fillStyle = back ? '#3fa7ff' : '#ff9f1c';
    rr(d.x - 15, d.y - 46, 30, 18, 9); ctx.fill();
    ctx.fillStyle = '#fff'; ctx.font = FONT(900, 13); ctx.textAlign = 'center';
    ctx.fillText(back ? '▶' : '◀', d.x, d.y - 32);
  }
  if (d.fl & 8 && Math.sin(VS.t * 10) > 0) { ctx.fillStyle = '#ff5252'; ctx.font = FONT(900, 16); ctx.textAlign = 'center'; ctx.fillText('под сиденье!', d.x, d.y - 30); }
}

function drawParticles(dt) {
  for (const p of VS.parts) { p.t += dt; p.x += p.vx; p.y += p.vy; p.vy += 0.4; }
  VS.parts = VS.parts.filter(p => p.t < 1.2 && p.y < FLOOR);
  for (const p of VS.parts) circ(p.x, p.y, 4, p.c);
}

function drawPops(dt) {
  ctx.textAlign = 'center';
  for (const p of VS.pops) {
    p.t += dt;
    ctx.globalAlpha = clamp(1.3 - p.t, 0, 1);
    ctx.font = FONT(900, 22);
    ctx.strokeStyle = '#000'; ctx.lineWidth = 4; ctx.strokeText(p.s, p.x, p.y - p.t * 40);
    ctx.fillStyle = p.c; ctx.fillText(p.s, p.x, p.y - p.t * 40);
  }
  ctx.globalAlpha = 1;
  VS.pops = VS.pops.filter(p => p.t < 1.3);
}

function drawBubbles(v) {
  for (const who of Object.keys(VS.bubbles)) {
    const b = VS.bubbles[who];
    if (b.until < VS.t) { delete VS.bubbles[who]; continue; }
    let x, y;
    if (who === 'drv') { x = 150; y = 228; }
    else if (who === 'npc') { x = 1130; y = 262; }
    else { const hp = headPos(+who, v); x = hp.x; y = hp.y - 72; }
    ctx.font = FONT(700, 15);
    const tw = Math.min(ctx.measureText(b.s).width, 300) + 22;
    const bx = clamp(x - tw / 2, 50, W - 50 - tw), by = y - 36;
    ctx.fillStyle = '#fff'; ctx.strokeStyle = '#222'; ctx.lineWidth = 2;
    rr(bx, by, tw, 30, 12); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x - 6, by + 29); ctx.lineTo(x, by + 40); ctx.lineTo(x + 6, by + 29); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#111'; ctx.textAlign = 'center';
    ctx.fillText(b.s, bx + tw / 2, by + 20, 300);
  }
}

function drawHUD(v) {
  ctx.fillStyle = 'rgba(20,24,38,.85)'; rr(10, 8, W - 20, 88, 16); ctx.fill();
  ctx.textAlign = 'left';
  ctx.fillStyle = '#8a92ab'; ctx.font = FONT(700, 13); ctx.fillText('РЕЙТИНГ', 32, 36);
  ctx.fillStyle = '#fff'; ctx.font = FONT(900, 36); ctx.fillText(v.sc, 32, 76);
  // маршрут
  const x0 = 250, x1 = 930, y = 58, n = STOPS.length;
  line(x0, y, x1, y, 6, '#3a4160');
  const p = clamp((v.tm || 0) / ROUND, 0, 1);
  line(x0, y, x0 + (x1 - x0) * p, y, 6, '#f4c11d');
  ctx.font = FONT(700, 12); ctx.textAlign = 'center';
  for (let i = 0; i < n; i++) {
    const sx = x0 + (x1 - x0) * i / (n - 1), passed = i / (n - 1) <= p;
    circ(sx, y, 7, passed ? '#f4c11d' : '#3a4160');
    ctx.fillStyle = passed ? '#fff' : '#8a92ab';
    ctx.fillText(STOPS[i], sx, i % 2 ? y + 26 : y - 14);
  }
  const bxp = x0 + (x1 - x0) * p;
  ctx.fillStyle = '#f4c11d'; rr(bxp - 14, y - 9, 28, 18, 5); ctx.fill();
  ctx.fillStyle = '#1e1e1e'; ctx.fillRect(bxp - 9, y - 5, 18, 6);
  // скандал
  const ax = 990, aw = 250, an = clamp(v.an || 0, 0, 100);
  ctx.textAlign = 'left'; ctx.fillStyle = '#8a92ab'; ctx.font = FONT(700, 13); ctx.fillText('СКАНДАЛ', ax, 36);
  ctx.fillStyle = '#2a2f45'; rr(ax, 48, aw, 24, 12); ctx.fill();
  if (an > 0) {
    const g = ctx.createLinearGradient(ax, 0, ax + aw, 0);
    g.addColorStop(0, '#ffd54f'); g.addColorStop(1, '#ff1744');
    ctx.fillStyle = g; rr(ax, 48, Math.max(24, aw * an / 100), 24, 12); ctx.fill();
  }
  if (an > 70 && Math.sin(VS.t * 10) > 0) { ctx.strokeStyle = '#ff1744'; ctx.lineWidth = 3; rr(ax - 3, 45, aw + 6, 30, 15); ctx.stroke(); }
  ctx.fillStyle = '#fff'; ctx.font = FONT(900, 14); ctx.textAlign = 'right'; ctx.fillText(Math.round(an) + '%', ax + aw - 10, 66);
}

function drawBanner(dt) {
  const b = VS.banner;
  if (!b) return;
  b.t += dt;
  if (b.t > 1.7) { VS.banner = null; return; }
  const sc = b.t < 0.15 ? 0.6 + b.t / 0.15 * 0.6 : b.t < 0.25 ? 1.2 - (b.t - 0.15) * 2 : 1;
  ctx.save();
  ctx.globalAlpha = clamp((1.7 - b.t) * 3, 0, 1);
  ctx.translate(W / 2, 250); ctx.scale(sc, sc);
  ctx.font = FONT(900, 54); ctx.textAlign = 'center';
  ctx.strokeStyle = '#1a1d2b'; ctx.lineWidth = 10; ctx.lineJoin = 'round'; ctx.strokeText(b.s, 0, 0);
  ctx.fillStyle = '#f4c11d'; ctx.fillText(b.s, 0, 0);
  ctx.restore();
}

function drawHint() {
  ctx.font = FONT(700, 13); ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(0,0,0,.55)'; rr(W / 2 - 330, 690, 660, 24, 12); ctx.fill();
  ctx.fillStyle = '#fff';
  ctx.fillText('Мышь — рука · зажми ЛКМ — схватить, отпусти — бросить · Пробел/ПКМ — наклон · 1–5 — крикнуть', W / 2, 707);
}

// ---------- главный цикл ----------
let lastT = performance.now(), acc = 0, sendAcc = 0, inAcc = 0;
function loop(now) {
  const dt = Math.min(0.05, (now - lastT) / 1000);
  lastT = now; VS.t += dt;
  let view = null;
  if (NET.role === 'host' || NET.role === 'solo') {
    const my = seatOf(NET.myPid);
    if (my >= 0 && INP.x != null) inputs[my] = { x: INP.x, y: INP.y, g: INP.g, l: leanNow() };
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
    predictOwn(view);
    inAcc += dt;
    if (inAcc >= 1 / 30) {
      inAcc = 0;
      clientSend('in', { x: Math.round(INP.x || 0), y: Math.round(INP.y || 0), g: INP.g ? 1 : 0, l: leanNow() ? 1 : 0 });
    }
  }
  render(view, dt);
  requestAnimationFrame(loop);
}

// ---------- кнопки меню ----------
function getName() {
  const n = $('name').value.trim().slice(0, 14) || 'Пассажир';
  try { localStorage.setItem('pzp_name', n); } catch (e) {}
  return n;
}
try { $('name').value = localStorage.getItem('pzp_name') || ''; } catch (e) {}
const qRoom = new URLSearchParams(location.search).get('room');
if (qRoom) { $('code').value = qRoom.toUpperCase(); }

$('btnCreate').onclick = () => { audioUnlock(); menuError(''); hostCreate(getName()); };
$('btnJoin').onclick = () => { audioUnlock(); clientJoin(getName(), $('code').value); };
$('code').addEventListener('keydown', e => { if (e.key === 'Enter') $('btnJoin').click(); });
$('btnSolo').onclick = () => {
  audioUnlock(); menuError('');
  NET.role = 'solo'; NET.myPid = 'host';
  resetSeats(); addPlayer('host', getName());
  startGame();
};
$('btnStart').onclick = () => { if (NET.role === 'host') startGame(); };
$('btnAgain').onclick = () => { if (NET.role === 'host' || NET.role === 'solo') startGame(); };
$('btnLeave').onclick = leave;
$('btnMenu').onclick = leave;
$('btnCopy').onclick = () => {
  const url = location.origin + location.pathname + '?room=' + NET.code;
  navigator.clipboard.writeText(url).then(() => { $('btnCopy').textContent = 'Скопировано!'; setTimeout(() => $('btnCopy').textContent = 'Скопировать ссылку', 1500); }, () => prompt('Ссылка для друзей:', url));
};
$('seats').addEventListener('click', e => { const b = e.target.closest('button[data-seat]'); if (b) requestSeat(+b.dataset.seat); });

requestAnimationFrame(loop);
