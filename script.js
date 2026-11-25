'use strict';
/* Бомж-симулятор: Путь наверх
   Тексты — texts.json, числа — config.json, картинки — images.json */

let S = null, T = null, C = null, IMG = null;

/* ---------- утилиты ---------- */
const rnd = (a, b) => Math.floor(Math.random() * (b - a + 1)) + a;
const chance = p => Math.random() < p;
const clamp = (v, a = 0, b = 100) => Math.max(a, Math.min(b, v));
const fmt = n => n.toLocaleString('ru-RU');
const timeStr = h => String(h).padStart(2, '0') + ':00';
const tempStr = t => (t > 0 ? '+' : '') + Math.round(t) + ' °C';

function T_(path) { return path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), T); }
function CFG(path, def) {
  const v = path.split('.').reduce((o, k) => (o == null ? undefined : o[k]), C);
  return v === undefined ? def : v;
}
function tf(tpl, p) {
  if (Array.isArray(tpl)) tpl = tpl[rnd(0, tpl.length - 1)];
  if (tpl == null) return '';
  return String(tpl).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] !== undefined) ? String(p[k]) : m);
}
function pickText(x) { return Array.isArray(x) ? x[rnd(0, x.length - 1)] : x; }
function weightedPick(w) {
  let t = 0; for (const k in w) t += w[k];
  let r = Math.random() * t;
  for (const k in w) { r -= w[k]; if (r <= 0) return k; }
  return Object.keys(w)[0];
}
async function loadJSON(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error('Не найден ' + url);
  return r.json();
}

/* ---------- картинки из images.json ---------- */
let imgCache = {};   /* запомненный рандом для каждого слота */

function normalizeImg(x) { return (typeof x === 'string') ? { images: [x] } : x; }

/* slot/sub: "background"+"day", "job"+id, "illness"+id, "clothes", "dirt"+"light"|"heavy" */
function pickImg(slot, sub) {
  if (!IMG || !IMG[slot]) return null;
  let e = (sub !== undefined) ? IMG[slot][sub] : IMG[slot];
  e = normalizeImg(e);
  if (!e || !e.images || !e.images.length) return null;
  const key = (sub !== undefined) ? slot + ':' + sub : slot;
  if (!imgCache[key]) imgCache[key] = e.images[rnd(0, e.images.length - 1)];
  return { name: imgCache[key], opacity: (e.opacity !== undefined ? e.opacity : 1) };
}

/* часть персонажа: "body" или "emotion" */
function pickChar(chId, part) {
  if (!IMG || !IMG.character) return null;
  const ch = IMG.character[chId];
  if (!ch) return null;
  if (part === 'emotion') {
    const k = emoKey();
    let e;
    if (k !== 'neutral' && ch.emotion && ch.emotion[k]) e = ch.emotion[k];
    /* для нейтрального состояния (или если нужной эмоции нет в json) — базовая голова */
    if (!e) e = (ch.head_neutral !== undefined) ? ch.head_neutral : ch.head;
    e = normalizeImg(e);
    if (!e || !e.images || !e.images.length) return null;
    const key = 'char:' + chId + ':emotion:' + k;
    if (!imgCache[key]) imgCache[key] = e.images[rnd(0, e.images.length - 1)];
    return { name: imgCache[key], opacity: (e.opacity !== undefined ? e.opacity : 1) };
  }
  let e = normalizeImg(ch[part]);
  if (!e || !e.images || !e.images.length) return null;
  const key = 'char:' + chId + ':' + part;
  if (!imgCache[key]) imgCache[key] = e.images[rnd(0, e.images.length - 1)];
  return { name: imgCache[key], opacity: (e.opacity !== undefined ? e.opacity : 1) };
}

function charIds() { return (IMG && IMG.character) ? Object.keys(IMG.character) : ['male']; }
function defaultChar() { return charIds()[0]; }
function resetImgCache() { imgCache = {}; }

/* ---------- календарь и дни недели ---------- */
const DOW_SHORT = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];
function dowIdx(day) { return ((day - 1) % 7 + 7) % 7; } /* 0 = понедельник */
function dateInfo(day) {
  const cal = C.weatherCalendar;
  const dow = dowIdx(day);
  if (cal && cal.months && cal.months.length) {
    let d = ((day - 1) % 365 + 365) % 365;
    for (let m = 0; m < cal.months.length; m++) {
      const n = cal.months[m].days.length;
      if (d < n) return { dow, monthIdx: m, dayOfMonth: d + 1, monthName: cal.months[m].name, dayData: cal.months[m].days[d] };
      d -= n;
    }
  }
  return { dow, monthIdx: -1, dayOfMonth: day, monthName: '', dayData: null };
}
function dateStr(day) {
  const i = dateInfo(day);
  const month = (T.monthsGen && T.monthsGen[i.monthIdx]) || i.monthName || '';
  return i.dayOfMonth + ' ' + month;
}
function dowStr(day) { return (T.weekdays && T.weekdays[dowIdx(day)]) || DOW_SHORT[dowIdx(day)]; }
function jobDaysStr(j) {
  const names = T.weekdaysShort || DOW_SHORT;
  return j.days.slice().sort((a, b) => a - b).map(d => names[d - 1]).join(', ');
}

/* ---------- погода по календарю ---------- */
function tempFor(d, wid) {
  const w = C.weathers[wid];
  let lo = Math.max(d.tMin, w.tempMin), hi = Math.min(d.tMax, w.tempMax);
  if (lo > hi) { lo = d.tMin; hi = d.tMax; }
  return rnd(lo, hi);
}
function pickWeatherFallback() {
  const ids = Object.keys(C.weathers);
  const id = ids[rnd(0, ids.length - 1)];
  const w = C.weathers[id];
  return { id, temp: rnd(w.tempMin, w.tempMax) };
}
function pickWeatherForDay(day) {
  const i = dateInfo(day);
  if (i.dayData) { const id = weightedPick(i.dayData.w); return { id, temp: tempFor(i.dayData, id) }; }
  return pickWeatherFallback();
}
function weatherObj(id) {
  const i = S ? dateInfo(S.day) : null;
  if (i && i.dayData && i.dayData.w) return { id, temp: tempFor(i.dayData, id) };
  const w = C.weathers[id];
  return { id, temp: rnd(w.tempMin, w.tempMax) };
}

function weatherText() {
  const i = dateInfo(S.day);
  let s = T.weathers[S.weather.id].name + ' ' + tempStr(S.weather.temp);
  if (i.monthIdx >= 0) s += ' · ' + dowStr(S.day) + ', ' + dateStr(S.day);
  return s;
}
function isBadWeather(id) { return id === 'rain' || id === 'frost' || id === 'snow'; }

/* ---------- состояние ---------- */
function charName(id) {
  return (T.characters && T.characters[id]) || id;
}

function newState(charId) {
  const st = C.startStats;
  return {
    character: charId,
    day: 1, hour: C.startHour, money: C.startMoney,
    health: st.health, energy: st.energy, satiety: st.satiety, mood: st.mood, clean: st.clean,
    reputation: 0, knowledge: 0,
    doc: false, clothes: false, card: false,
    blanket: false, box: false, sleepingBag: false, umbrella: false, phone: false, radio: false,
    books: [], gigs: [],
    lastSleep: 'street',
    job: null, workDays: 0, jobStrikes: 0, workedToday: false,
    illnesses: [], log: [],
    weather: pickWeatherForDay(1), over: false, win: false,
    dog: false,
    busy: null, timer: null, pendingEvent: false,
  };
}

function clampState() {
  S.money = Math.max(0, Math.round(S.money));
  S.health = clamp(S.health); S.energy = clamp(S.energy); S.satiety = clamp(S.satiety);
  S.mood = clamp(S.mood); S.clean = clamp(S.clean);
  S.knowledge = clamp(S.knowledge, 0, 100);
  S.reputation = Math.max(-999, Math.min(999, Math.round(S.reputation)));
}

function addLog(html, cls) {
  S.log.unshift({ d: S.day, html: pickText(html), cls: cls || '' });
  if (S.log.length > C.tick.logMax) S.log.pop();
}

/* ---------- цветные эффекты ---------- */
function fxHTML(fx) {
  if (!fx) return '';
  const lines = [];
  for (const k in fx) {
    if (!fx[k]) continue;
    const v = Math.round(fx[k]);
    const cls = v > 0 ? 'fxGood' : 'fxBad';
    const sign = v > 0 ? '+' : '−';
    lines.push('<div class="fx ' + cls + '">' + T_('ui.fx.' + k) + ': ' + sign + Math.abs(v) +
      (k === 'money' ? ' ₽' : '') + '</div>');
  }
  return lines.length ? '<div class="fxBox">' + lines.join('') + '</div>' : '';
}
function applyFx(fx) {
  if (!fx) return;
  if (fx.money) S.money = Math.max(0, S.money + fx.money);
  if (fx.health) S.health = clamp(S.health + fx.health);
  if (fx.energy) S.energy = clamp(S.energy + fx.energy);
  if (fx.satiety) S.satiety = clamp(S.satiety + fx.satiety);
  if (fx.mood) S.mood = clamp(S.mood + fx.mood);
  if (fx.clean) S.clean = clamp(S.clean + fx.clean);
  if (fx.rep) S.reputation = S.reputation + fx.rep;
  if (fx.knowledge) S.knowledge = clamp(S.knowledge + fx.knowledge, 0, 100);
  clampState();
}

/* ---------- репутация ---------- */
const REP_DEFAULTS = {
  bottleGain: 1, bottleGoodMax: 8, officeBottlePenalty: 2,
  jobRepGain: 1, firePenalty: 5,
  seekRepMul: 0.002, maxRepBonus: 20, maxRepPenalty: 10,
  knowledgeMul: 0.1, knowledgeMaxBonus: 15,
  phoneReturnRep: 2, phoneSellRep: -2,
  walletReturnRep: 3, walletTakeRep: -3, charityRep: 2
};
function repCfg() { return Object.assign({}, REP_DEFAULTS, C.reputation || {}); }

/* ---------- портрет ---------- */
function bgKeyFor(hour) {
  if (hour >= 6 && hour < 18) return 'day';
  if (hour >= 18 && hour < 22) return 'evening';
  return 'night';
}
function emoKey() {
  if (!S) return 'neutral';
  if (S.mood < 40 || S.health < 30) return 'sad';
  if (S.energy < 25) return 'tired';
  if (S.mood >= 70 && S.health >= 50) return 'happy';
  return 'neutral';
}
function portraitLayers() {
  const chId = charIds().indexOf(S.character) >= 0 ? S.character : defaultChar();
  const L = [];
  const bg = pickImg('background', bgKeyFor(S.hour));
  if (bg) L.push(bg);
  const body = pickChar(chId, 'body');
  if (body) L.push(body);
  if (S.job) {
    const j = pickImg('job', S.job.id) || pickImg('job', 'default');
    if (j) L.push(j);
  }
  const cl = pickImg('clothes');
  if (cl) L.push(cl);
  /* голова = эмоция: happy/sad/tired подменяют базовую голову */
  const head = pickChar(chId, 'emotion');
  if (head) L.push(head);
  if (S.clean < 15) { const d = pickImg('dirt', 'heavy'); if (d) L.push(d); }
  else if (S.clean < 35) { const d = pickImg('dirt', 'light'); if (d) L.push(d); }
  S.illnesses.forEach(il => {
    const o = pickImg('illness', il.id);
    if (o) L.push(o);
  });
  return L;
}

function renderPortrait() {
  const box = document.getElementById('portrait');
  const miss = document.getElementById('pMissing');
  if (!box) return;
  box.innerHTML = '';
  const missing = [];
  portraitLayers().forEach(l => {
    const img = new Image();
    img.src = 'IMG/' + l.name + '.png';
    img.alt = l.name;
    if (l.name.indexOf('bg_') === 0) img.className = 'pBg';
    if (l.opacity !== undefined && l.opacity < 1) img.style.opacity = l.opacity;
    img.onerror = () => { missing.push(l.name + '.png'); img.remove(); refreshMissing(); };
    box.appendChild(img);
  });
  function refreshMissing() {
    miss.textContent = missing.length ? tf(T.ui.missingFiles, { list: missing.join(', ') }) : '';
  }
  refreshMissing();
  const cap = document.getElementById('pCaption');
  if (cap) cap.textContent = S.job ? S.job.emoji + ' ' + S.job.name : (S.doc ? T.ui.captionDoc : T.ui.captionNoDoc);
}

/* ---------- модалки ---------- */
function hideModal() { document.getElementById('modalWrap').classList.add('hidden'); }
function showModal(title, bodyHTML, buttons, opts) {
  opts = opts || {};
  document.getElementById('mTitle').textContent = title;
  document.getElementById('mBody').innerHTML = bodyHTML;
  document.getElementById('mClose').style.display = opts.noClose ? 'none' : 'inline-block';
  const box = document.getElementById('mBtns');
  box.innerHTML = '';
  buttons.forEach(b => {
    const btn = document.createElement('button');
    if (b.primary) btn.classList.add('primary');
    btn.innerHTML = b.text + (b.note ? '<div class="bnote">' + b.note + '</div>' : '');
    if (b.disabled) btn.disabled = true;
    btn.onclick = () => { hideModal(); if (b.fn) b.fn(); };
    box.appendChild(btn);
  });
  document.getElementById('modalWrap').classList.remove('hidden');
}
function showResult(title, story, fx, cls) {
  addLog('<p>' + pickText(story) + '</p>' + fxHTML(fx), cls || '');
  showModal(title, '<p>' + pickText(story) + '</p>' + fxHTML(fx), [{ text: T.ui.btnOk, primary: true, fn: render }]);
}
function eventResult(story, fx) {
  addLog('<p>' + pickText(story) + '</p>' + fxHTML(fx), 'logEvent');
  showModal('Событие', '<p>' + pickText(story) + '</p>' + fxHTML(fx), [{ text: T.ui.btnOk, primary: true, fn: render }]);
}


/* ---------- занятость ---------- */
let rafId = null;
function stopBusyAnim() { if (rafId) { cancelAnimationFrame(rafId); rafId = null; } }
function busyAnimate() {
  if (!S || !S.busy) { rafId = null; return; }
  const el = document.getElementById('busyBar');
  const wrap = document.getElementById('busyWrap');
  if (el && wrap && !wrap.classList.contains('hidden')) {
    const totalMs = S.busy.total * C.hourMs;
    const p = Math.min(100, Math.max(0, (performance.now() - S.busy.startedAt) / totalMs * 100));
    el.style.width = p + '%';
  }
  rafId = requestAnimationFrame(busyAnimate);
}
function renderBusy() {
  const wrap = document.getElementById('busyWrap');
  if (!wrap) return;
  if (!S.busy) { wrap.classList.add('hidden'); return; }
  wrap.classList.remove('hidden');
  const b = S.busy;
  document.getElementById('busyLabel').textContent = tf(T.ui.busyLabel, { name: b.name, elapsed: b.elapsed, total: b.total });
  document.getElementById('busyClock').textContent = tf(T.ui.busyClock, { time: timeStr(S.hour), day: S.day });
  document.getElementById('busyStop').style.display = b.canInterrupt ? 'inline-block' : 'none';
}

function startAction(def, onTick, onComplete, canInterrupt) {
  if (S.busy || S.over || S.win) return;
  const hours = (typeof def.hours === 'function') ? def.hours() : def.hours;
  if (S.energy < def.energy) {
    showResult(def.name, tf(T.ui.energyFail, { energy: def.energy }), {});
    return;
  }
  S.busy = { name: def.name, total: hours, elapsed: 0, energy: def.energy,
    onTick, onComplete, canInterrupt: canInterrupt !== false,
    earn: 0, tot: {}, startedAt: performance.now() };
  stopBusyAnim();
  render();
  rafId = requestAnimationFrame(busyAnimate);
  S.timer = setInterval(tick, C.hourMs);
}
function interruptBusy() {
  if (!S.busy) return;
  clearInterval(S.timer); S.timer = null; stopBusyAnim();
  const b = S.busy; S.busy = null;
  addLog(tf(T.ui.interruptLog, { name: b.name, n: b.elapsed }), 'logBad');
  render();
}

function tick() {
  const b = S.busy; if (!b) return;
  b.elapsed++;
  S.hour++;
  const sleeping = b.name.indexOf('Сон:') === 0;
  S.satiety = clamp(S.satiety + C.tick.satietyPerHour);
  if (!sleeping) { S.clean = clamp(S.clean + C.tick.cleanPerHour); S.mood = clamp(S.mood + C.tick.moodPerHour); }
  if (b.energy) S.energy = clamp(S.energy - b.energy / b.total);
  if (b.onTick) b.onTick(b);
  if (S.hour >= 24) { S.hour = 0; midnight(); if (S.over) return; }
  clampState();
  if (S.health <= 0) { die(); return; }
  render();
  if (b.elapsed >= b.total) {
    clearInterval(S.timer); S.timer = null; stopBusyAnim();
    const done = b.onComplete; S.busy = null;
    if (done) done(b);
    if (S.pendingEvent) { S.pendingEvent = false; triggerChoiceEvent(); }
    render();
  }
}

/* ---------- отрисовка ---------- */
function barHTML(label, val) {
  const cls = val < C.barColors.badBelow ? 'bad' : (val < C.barColors.midBelow ? 'mid' : 'good');
  return '<div class="stat"><div class="lbl"><span>' + label + '</span><span>' + Math.round(val) + '</span></div>' +
    '<div class="bar"><div class="' + cls + '" style="width:' + val + '%"></div></div></div>';
}
function repRow() {
  const v = S.reputation;
  return '<div class="stat"><div class="lbl" title="' + T.ui.repHint + '"><span>' + T.ui.stats.reputation +
    '</span><span>' + (v > 0 ? '+' : '') + v + '</span></div></div>';
}
function knRow() {
  return '<div class="stat"><div class="lbl" title="' + T.ui.knHint + '"><span>' + T.ui.stats.knowledge +
    '</span><span>' + S.knowledge + '</span></div></div>';
}
function goalHTML(text, done) {
  return '<div class="goal' + (done ? ' done' : '') + '">' + (done ? T.ui.goalDone : T.ui.goalDash) + ' ' + text + '</div>';
}
function makeActionButton(a) {
  const btn = document.createElement('button');
  btn.className = 'action';
  const hours = (typeof a.hours === 'function') ? a.hours() : a.hours;
  let hint = (typeof a.hint === 'function') ? a.hint() : a.hint;
  if (hours) hint += ' · ' + hours + ' ч';
  if (a.energy) hint += ' · силы −' + a.energy;
  btn.innerHTML = '<div class="an">' + a.name + '</div><div class="ah">' + hint + '</div>';
  let ok = true, reason = '';
  if (a.can) { const r = a.can(); if (r !== true) { ok = false; reason = (typeof r === 'string') ? r : 'Недоступно'; } }
  if (ok && a.energy && S.energy < a.energy) { ok = false; reason = tf(T.ui.notEnoughEnergy, { energy: a.energy }); }
  if (ok && hours && S.hour + hours > 24 && !a.allowPastMidnight) { ok = false; reason = T.ui.tooLateAction; }
  btn.disabled = !ok || !!S.busy || S.over || S.win;
  if (reason) btn.title = reason;
  btn.onclick = a.run;
  return btn;
}

function render() {
  if (!S) return;
  document.getElementById('dayNum').textContent = S.day;
  document.getElementById('clock').textContent = timeStr(S.hour);
  document.getElementById('weather').textContent = weatherText();
  document.getElementById('money').textContent = fmt(S.money);

  const st = T.ui.stats;
  let h = barHTML(st.health, S.health) + barHTML(st.energy, S.energy) +
          barHTML(st.satiety, S.satiety) + barHTML(st.mood, S.mood) +
          barHTML(st.clean, S.clean) + repRow() + knRow();
  if (S.job) h += '<div class="stat"><div class="lbl"><span>' + st.work + '</span></div>' +
    '<div style="font-size:13.5px;color:#c9cdd4">' + tf(T.ui.workLine, {
      emoji: S.job.emoji, name: S.job.name, rate: fmt(S.job.rate),
      start: timeStr(S.job.start), end: timeStr(S.job.end), days: S.workDays
    }) +
    '<br>' + tf(T.ui.workSchedule, { days: jobDaysStr(S.job), from: timeStr(S.job.start), to: timeStr(S.job.end) }) +
    (S.job.night ? ' ' + T.ui.nightJob : '') +
    (S.jobStrikes ? '<br>' + tf(T.ui.workStrikes, { n: S.jobStrikes }) : '') + '</div></div>';
  const gear = [];
  const g = T.ui.gear;
  if (S.doc) gear.push(g.doc);
  if (S.clothes) gear.push(g.clothes);
  if (S.card) gear.push(g.card);
  if (S.dog) gear.push(g.dog);
  if (S.blanket) gear.push(g.blanket);
  if (S.box) gear.push(g.box);
  if (S.sleepingBag) gear.push(g.bag);
  if (S.umbrella) gear.push(g.umbrella);
  if (S.phone) gear.push(g.phone);
  if (S.books.length) gear.push(tf(T.ui.gearBooks, { n: S.books.length }));
  if (gear.length) h += '<div class="stat" style="font-size:13.5px;color:#c9cdd4">' + gear.join(' · ') + '</div>';

  document.getElementById('statsPanel').innerHTML =
    '<h3>' + T.ui.panelState + '</h3>' + h +
    '<h3 style="margin-top:14px">' + T.ui.panelGoals + '</h3>' +
    goalHTML(T.ui.goalDoc, S.doc) +
    goalHTML(T.ui.goalJob, !!S.job) +
    goalHTML(T.ui.goalClothes, S.clothes) +
    goalHTML(T.ui.apartGoal, S.money >= C.apartmentPrice) +
    '<div class="apartProg"><div class="lbl" style="display:flex;justify-content:space-between;font-size:12.5px;color:#9aa3ad"><span>' +
    tf(T.ui.apartLabel, { price: fmt(C.apartmentPrice) }) + '</span><span>' +
    Math.min(100, Math.round(S.money / C.apartmentPrice * 100)) + '%</span></div>' +
    '<div class="bar"><div class="moneyBar" style="width:' + Math.min(100, S.money / C.apartmentPrice * 100) + '%"></div></div></div>';

  renderPortrait();
  renderBusy();

  const ti = document.getElementById('timeInfo');
  if (S.busy) {
    ti.className = 'warn';
    ti.innerHTML = tf(T.ui.timeBusy, { name: S.busy.name, elapsed: S.busy.elapsed, total: S.busy.total });
  } else if (S.job && jobWorkCan(S.job) === true) {
    ti.className = 'warn';
    ti.innerHTML = tf(T.ui.timeShift, { time: timeStr(S.hour), job: S.job.name }) +
      '<br>' + nextWorkText();
  } else {
    ti.className = '';
    let txt = tf(T.ui.timeFree, { time: timeStr(S.hour), day: S.day }) +
      ' · ' + dowStr(S.day) + ', ' + dateStr(S.day);
    if (S.job) {
      const nw = nextWorkText();
      if (nw) txt += '<br>' + nw;
    }
    ti.innerHTML = txt;
  }

  const ac = document.getElementById('actions');
  ac.innerHTML = '';
  ACTIONS.forEach(a => {
    if (a.show && !a.show()) return;
    ac.appendChild(makeActionButton(a));
  });

  renderOneTime(ac);

  if (S.illnesses.length) {
    const illBox = document.createElement('div');
    illBox.style.marginTop = '14px';
    illBox.innerHTML = '<h3>' + T.ui.panelIll + '</h3>' + S.illnesses.map((il, i) => {
      const d = illDef(il.id);
      return '<div class="ill"><b>' + d.emoji + ' ' + d.name + '</b> — ' + d.desc + '<br><button ' +
        (S.money < d.cure ? 'disabled' : '') + ' onclick="treat(' + i + ')">' +
        tf(T.ui.treatBtn, { cost: fmt(d.cure) }) + '</button></div>';
    }).join('');
    ac.appendChild(illBox);
  }

  document.getElementById('log').innerHTML = S.log.map(e =>
    '<div class="logEntry"><span class="d">' + T.ui.day + ' ' + e.d + '</span><br><span class="' + e.cls + '">' + e.html + '</span></div>'
  ).join('');
}

/* ---------- разовые действия: внизу левого столбца ---------- */
function renderOneTime(ac) {
  const wrap = document.createElement('div');
  wrap.style.marginTop = '16px';
  wrap.innerHTML = '<h3>' + T.ui.oneTimeTitle + '</h3>';
  let count = 0;
  const add = a => { wrap.appendChild(makeActionButton(a)); count++; };

  /* бонусные подработки (появляются рандомно/контекстно) */
  S.gigs.forEach((g, idx) => {
    if (!T.oneTimes || !T.oneTimes[g.id]) return;
    const d = gigDef(g.id);
    const ttl = g.day + CFG('oneTime.ttl', 2) - S.day;
    add({ name: '⭐ ' + d.name, hours: d.hours, energy: d.energy,
      hint: d.hint + (ttl > 0 ? ' · ' + tf(T.ui.gigTtl, { n: ttl }) : ''),
      run: () => runGig(idx) });
  });

  /* паспорт — разовое действие */
  if (!S.doc && S.money >= C.passport.cost) {
    add({ name: tf(T.passport.name, { cost: fmt(C.passport.cost) }), hours: C.passport.hours,
      energy: C.passport.energy, hint: T.passport.hint,
      run: () => startAction({ name: 'МФЦ: паспорт', hours: C.passport.hours, energy: C.passport.energy }, () => {},
        () => { S.money -= C.passport.cost; S.doc = true;
          showResult(T.passport.title, T.passport.result, { money: -C.passport.cost }, 'logBig'); }) });
  }

  /* квартира — разовое действие, победа */
  if (S.money >= C.apartmentPrice && !S.win) {
    add({ name: tf(T.flat.name, { price: fmt(C.apartmentPrice) }), hours: C.flat.hours, hint: T.flat.hint,
      run: () => startAction({ name: T.flat.actionName, hours: C.flat.hours, energy: C.flat.energy }, () => {},
        () => {
          S.money -= C.apartmentPrice; S.win = true;
          showModal(T.flat.title, tf(T.flat.body, { days: S.day }),
            [{ text: T.ui.btnRestart, fn: () => { localStorage.removeItem('bomzh_save'); location.reload(); } },
             { text: T.ui.btnContinue, fn: render }]);
          addLog(T.flat.log, 'logBig');
        }) });
  }

  if (!count) wrap.innerHTML += '<div class="ah" style="color:#8a919b">' + T.ui.oneTimeNone + '</div>';
  ac.appendChild(wrap);
}

/* ---------- бонусные подработки (разовые) ---------- */
function gigDef(id) {
  const c = C.oneTime.items.find(x => x.id === id);
  const t = T.oneTimes[id];
  return { id, name: t.name, hint: t.hint, result: t.result, hours: c.hours, energy: c.energy, fx: c.fx || {} };
}
function gigCondOk(g) {
  if (g.needDoc && !S.doc) return false;
  if (g.needClean && S.clean < g.needClean) return false;
  if (g.minMoney && S.money < g.minMoney) return false;
  if (g.maxMoney && S.money > g.maxMoney) return false;
  if (g.needNoJob && S.job) return false;
  if (g.needRep && S.reputation < g.needRep) return false;
  return true;
}
function runGig(idx) {
  const g = S.gigs[idx]; if (!g) return;
  const d = gigDef(g.id);
  startAction({ name: d.name, hours: d.hours, energy: d.energy }, () => {},
    () => {
      S.gigs.splice(idx, 1);
      const fx = Object.assign({}, d.fx);
      applyFx(fx);
      showResult(d.name, d.result, fx, 'logBig');
    });
}
function spawnGigs() {
  const cfg = C.oneTime;
  if (!cfg || !cfg.items) return;
  S.gigs = S.gigs.filter(g => S.day - g.day <= CFG('oneTime.ttl', 2));
  if (S.gigs.length >= CFG('oneTime.max', 2)) return;
  if (!chance(CFG('oneTime.spawnChance', 0.35))) return;
  const pool = cfg.items.filter(g => gigCondOk(g) && !S.gigs.some(x => x.id === g.id) && T.oneTimes && T.oneTimes[g.id]);
  if (!pool.length) return;
  const g = pool[rnd(0, pool.length - 1)];
  S.gigs.push({ id: g.id, day: S.day });
  addLog(tf(T.oneTimes[g.id].appearLog, {}), 'logBig');
}

/* ---------- работа ---------- */
function jobById(id) {
  const c = C.jobs[id], t = T.jobs[id];
  return {
    id, emoji: t.emoji, name: t.name, rate: c.rate, start: c.start, end: c.end,
    needClean: c.needClean || 0, needDoc: !!c.needDoc, needExp: c.needExp || 0, needClothes: !!c.needClothes,
    needRep: c.needRep || 0,
    offerChance: (c.offerChance !== undefined) ? c.offerChance : 1,
    days: (c.days && c.days.length) ? c.days : [1, 2, 3, 4, 5, 6, 7],
    type: c.type || 'physical',
    night: c.start > c.end,
    ph: Object.assign({
      energy: CFG('earn.work.energy', 6),
      satiety: CFG('earn.work.satietyPerHour', -2),
      clean: CFG('earn.work.cleanPerHour', -2),
      mood: CFG('earn.work.moodPerHour', -1)
    }, c.perHour || {})
  };
}
function JOBS_LIST() { return Object.keys(C.jobs).map(jobById); }

function jobOnDuty(j, h) {
  return j.start < j.end ? (h >= j.start && h < j.end) : (h >= j.start || h < j.end);
}
function jobWorkCan(j) {
  const dow = dowIdx(S.day);
  const yDow = (dow + 6) % 7;
  const todayIsWorkday = j.days.indexOf(dow + 1) >= 0;
  if (jobOnDuty(j, S.hour)) {
    const ok = todayIsWorkday || (j.night && S.hour < j.end && j.days.indexOf(yDow + 1) >= 0);
    return ok ? true : T.ui.dayOff;
  }
  if (todayIsWorkday && S.hour < j.start) return tf(T.ui.shiftNotYet, { time: timeStr(j.start) });
  return tf(T.ui.shiftOver, { from: timeStr(j.start), to: timeStr(j.end) });
}
function shiftLeft() {
  return Math.max(1, (S.job.end - S.hour + 24) % 24);
}
function nextWorkHours() {
  const j = S.job; if (!j) return null;
  const dow0 = dowIdx(S.day);
  for (let h = 0; h <= 7 * 24; h++) {
    const hh = (S.hour + h) % 24;
    if (hh === j.start) {
      const dow = (dow0 + Math.floor((S.hour + h) / 24)) % 7;
      if (j.days.indexOf(dow + 1) >= 0) return h;
    }
  }
  return null;
}
function nextWorkText() {
  const h = nextWorkHours(); if (h === null) return '';
  const d = Math.floor(h / 24), hh = h % 24;
  const when = d > 0 ? (hh > 0 ? tf(T.ui.inDaysHours, { d, hh }) : tf(T.ui.inDays, { d })) : tf(T.ui.inHours, { hh });
  return tf(T.ui.nextWork, { name: S.job.name, days: jobDaysStr(S.job), time: timeStr(S.job.start), when });
}

function actWork() {
  const job = S.job;
  const late = job.night ? 0 : Math.max(0, S.hour - job.start);
  const W = C.earn.work;
  const effRate = Math.round(job.rate * (late > 0 ? Math.max(W.lateMinRate, 1 - W.latePenaltyPerHour * late) : 1));
  const ph = job.ph;
  const total = shiftLeft();
  startAction({ name: tf(T.work.shiftTitle, { job: job.name }), hours: total,
      energy: Math.round(Math.abs(ph.energy) * total) },
    b => {
      S.workedToday = true;
      b.earn += effRate; S.money += effRate;
      S.satiety = clamp(S.satiety + ph.satiety);
      S.clean = clamp(S.clean + ph.clean);
      S.mood = clamp(S.mood + ph.mood);
      b.tot.satiety = (b.tot.satiety || 0) + ph.satiety;
      b.tot.clean = (b.tot.clean || 0) + ph.clean;
      b.tot.mood = (b.tot.mood || 0) + ph.mood;
    },
    b => {
      S.workDays++;
      const R = repCfg();
      let msg = tf(T.work.done, { emoji: job.emoji, hours: b.elapsed, job: job.name, sum: fmt(Math.round(b.earn)), days: S.workDays });
      if (late > 0) {
        msg += tf(T.work.late, { late: late });
        S.mood = clamp(S.mood + W.lateMoodPerHour * late);
        if (late >= W.strikeFromHours) { S.jobStrikes++; msg += tf(T.work.strike, { n: S.jobStrikes }); }
      }
      const fx = { money: Math.round(b.earn), energy: -Math.round(Math.abs(ph.energy) * b.elapsed),
        satiety: Math.round(b.tot.satiety || 0), clean: Math.round(b.tot.clean || 0),
        mood: Math.round(b.tot.mood || 0), rep: R.jobRepGain };
      applyFx(fx);
      /* работа всегда попадает в дневник */
      addLog('<p>' + msg + '</p>' + fxHTML(fx), 'logGood');
      if (S.jobStrikes >= 3) { fire(); }
      else showModal(T.work.doneTitle, '<p>' + msg + '</p>' + fxHTML(fx), [{ text: T.ui.btnOk, primary: true, fn: render }]);
    });
}
function fire() {
  const name = S.job.name;
  S.job = null; S.jobStrikes = 0;
  const R = repCfg();
  applyFx({ rep: -R.firePenalty });
  addLog(tf(T.work.firedLog, { name }) + fxHTML({ rep: -R.firePenalty }), 'logBad');
  showModal(T.work.firedTitle, tf(T.work.firedBody, { name }), [{ text: T.ui.btnOk, primary: true, fn: render }]);
}

/* ---------- заработок ---------- */
function actBottles() {
  const c = C.earn.bottles;
  const wcfg = C.weathers[S.weather.id] || {};
  const mul = wcfg.bottlesMul || 1;
  const total = Math.round(rnd(c.min, c.max) * mul);
  startAction({ name: T.earn.bottles.name, hours: c.hours, energy: c.energy },
    () => {},
    () => {
      S.money += total;
      const R = repCfg();
      let rep = 0;
      if (S.job && S.job.type === 'office') rep = -R.officeBottlePenalty;
      else if (S.reputation < R.bottleGoodMax) rep = R.bottleGain;
      if (rep) S.reputation += rep;
      const fx = { money: total, energy: -c.energy, clean: c.clean, satiety: c.satiety, mood: c.mood };
      if (rep) fx.rep = rep;
      const story = mul < 1 ? tf(T.earn.bottles.resultBad, { sum: fmt(total) }) : tf(T.earn.bottles.result, { sum: fmt(total) });
      showResult(T.earn.bottles.title, story, fx, 'logGood');
    });
}
function actBeg() {
  const c = C.earn.beg;
  const base = c.base + S.clean * c.cleanMul + S.mood * c.moodMul;
  const pay = Math.max(0, Math.round(rnd(c.randMin, c.randMax) + base * c.mul));
  startAction({ name: T.earn.beg.name, hours: c.hours, energy: c.energy },
    () => {},
    () => {
      S.money += pay;
      const story = pay > c.goodPay ? tf(T.earn.beg.good, { sum: fmt(pay) }) : tf(T.earn.beg.bad, { sum: fmt(pay) });
      showResult(T.earn.beg.name, story, { money: pay, energy: -c.energy, mood: c.mood }, pay > c.goodPay ? 'logGood' : '');
    });
}
function actDump() {
  const c = C.earn.dump;
  c.bookChance = c.bookChance !== undefined ? c.bookChance : 0.12;
  startAction({ name: T.earn.dump.name, hours: c.hours, energy: c.energy },
    () => {},
    () => {
      const roll = Math.random();
      S.clean = clamp(S.clean + c.clean);
      const fx = { energy: -c.energy, clean: c.clean };
      if (roll < c.foodChance) {
        S.satiety = clamp(S.satiety + c.satiety);
        fx.satiety = c.satiety;
        if (chance(c.gastritChance) && !S.illnesses.some(i => i.id === 'gastrit')) {
          addIllness('gastrit');
          showResult(T.earn.dump.name, T.earn.dump.foodSick, fx, 'logBad');
        } else {
          showResult(T.earn.dump.name, T.earn.dump.food, fx);
        }
      } else if (roll < c.foodChance + c.boxChance && !S.box) {
        S.box = true;
        showResult(T.earn.dump.name, T.earn.dump.boxFound, fx, 'logBig');
      } else if (roll < c.foodChance + c.boxChance + c.bookChance) {
        const b = findBookOnDump();
        if (b) {
          S.books.push({ id: b.id, read: false });
          showResult(T.earn.dump.name, tf(T.earn.dump.book, { title: b.title, author: b.author }), fx, 'logBig');
        } else {
          showResult(T.earn.dump.name, T.earn.dump.nothing, fx);
        }
      } else if (roll < c.foodChance + c.boxChance + c.bookChance + c.moneyChance) {
        const m = rnd(c.moneyMin, c.moneyMax); S.money += m;
        showResult(T.earn.dump.name, tf(T.earn.dump.money, { sum: fmt(m) }),
          { money: m, energy: -c.energy, clean: c.clean }, 'logGood');
      } else {
        if (!S.illnesses.some(i => i.id === 'lice')) {
          addIllness('lice');
          showResult(T.earn.dump.name, T.earn.dump.lice, fx, 'logBad');
        } else {
          showResult(T.earn.dump.name, T.earn.dump.nothing, fx);
        }
      }
    });
}
function actSeek() {
  const c = C.earn.seek;
  startAction({ name: T.earn.seek.name, hours: c.hours, energy: c.energy },
    () => {},
    () => {
      const R = repCfg();
      const repBonus = Math.max(-R.maxRepPenalty, Math.min(R.maxRepBonus, S.reputation * R.seekRepMul));
      const knBonus = Math.min(R.knowledgeMaxBonus, S.knowledge * R.knowledgeMul);
      const eligible = JOBS_LIST().filter(j =>
        j.needClean <= S.clean && (!j.needDoc || S.doc) && (!j.needClothes || S.clothes) &&
        S.workDays >= j.needExp && S.reputation >= j.needRep &&
        (!S.job || j.rate > S.job.rate));
      if (!eligible.length) {
        showResult(T.earn.seek.name, T.earn.seek.none, { energy: -c.energy, satiety: -6 });
        return;
      }
      let p = Math.min(c.maxChance, c.baseChance + S.clean * c.cleanMul + repBonus + knBonus +
        (S.clothes ? c.clothesBonus : 0) + (S.phone ? c.phoneBonus : 0) + (S.mood > c.moodOver ? c.moodBonus : 0));
      const offered = eligible.filter(j => chance(Math.max(0, Math.min(1, p * (j.offerChance !== undefined ? j.offerChance : 1)))));
      if (!offered.length) {
        showResult(T.earn.seek.name, T.earn.seek.fail, { energy: -c.energy, satiety: -6 });
        return;
      }
      const buttons = offered.map(job => ({
        text: '<b>' + job.emoji + ' ' + job.name + ' — ' + fmt(job.rate) + ' ₽/час</b>',
        note: tf(T.earn.seek.offer, { emoji: job.emoji, name: job.name, rate: fmt(job.rate), start: timeStr(job.start), end: timeStr(job.end) }) +
          ' · ' + jobDaysStr(job) + (job.night ? ' · ' + T.ui.nightJob : ''),
        fn: () => hire(job)
      })).concat([{ text: T.earn.seek.decline, fn: render }]);
      showModal(T.earn.seek.offerTitle,
        offered.length > 1 ? T.earn.seek.multipleOffers :
          '<p>' + tf(T.earn.seek.offer, { emoji: offered[0].emoji, name: offered[0].name, rate: fmt(offered[0].rate), start: timeStr(offered[0].start), end: timeStr(offered[0].end) }) + '</p>',
        buttons);
    });
}
function hire(job) {
  S.job = job; S.jobStrikes = 0;
  addLog(tf(T.earn.seek.hiredLog, { name: job.name, rate: fmt(job.rate), start: timeStr(job.start), end: timeStr(job.end) }), 'logBig');
  render();
}

let EARN_ITEMS = null;
function buildEARN() {
  const c = C.earn;
  EARN_ITEMS = [
    { name: T.earn.bottles.name, hours: c.bottles.hours, energy: c.bottles.energy,
      hint: tf(T.earn.bottles.hint, { min: fmt(c.bottles.min), max: fmt(c.bottles.max) }), fn: actBottles },
    { name: T.earn.beg.name, hours: c.beg.hours, energy: c.beg.energy,
      hint: T.earn.beg.hint, fn: actBeg },
    { name: T.earn.dump.name, hours: c.dump.hours, energy: c.dump.energy,
      hint: T.earn.dump.hint, fn: actDump },
    { name: T.earn.workAction, hours: () => shiftLeft(), energy: c.work.energy,
      hint: 'Отработать смену до конца графика.',
      allowPastMidnight: true,
      show: () => !!S.job,
      can: () => jobWorkCan(S.job),
      fn: actWork },
    { name: T.earn.seek.name, hours: c.seek.hours, energy: c.seek.energy,
      hint: T.earn.seek.hint,
      can: () => (S.hour >= c.seek.openFrom && S.hour < c.seek.openTo) ? true :
        tf(T.ui.closedSeek, { from: c.seek.openFrom, to: c.seek.openTo }),
      fn: actSeek },
  ];
}
function earnUnavailableReason() {
  const items = EARN_ITEMS.filter(e => !e.show || e.show());
  if (!items.length) return T.earn.noItems;
  const anyOk = items.some(e => {
    if (e.can && e.can() !== true) return false;
    if (S.energy < e.energy) return false;
    const hrs = (typeof e.hours === 'function') ? e.hours() : e.hours;
    if (hrs && S.hour + hrs > 24 && !e.allowPastMidnight) return false;
    return true;
  });
  return anyOk ? true : T.earn.allUnavailable;
}

/* ---------- действия ---------- */
let ACTIONS = [];
function buildActions() {
  ACTIONS = [
    { id: 'earnGroup', name: T.earn.title, hours: 0, hint: 'Бутылки, милостыня, баки, работа и поиск работы.',
      can: earnUnavailableReason,
      run: () => {
        const items = EARN_ITEMS.filter(e => !e.show || e.show()).map(e => {
          const hrs = (typeof e.hours === 'function') ? e.hours() : e.hours;
          let dis = false, why = '';
          if (e.can) { const r = e.can(); if (r !== true) { dis = true; why = (typeof r === 'string') ? r : 'Недоступно'; } }
          if (!dis && S.energy < e.energy) { dis = true; why = tf(T.ui.notEnoughEnergy, { energy: e.energy }); }
          if (!dis && hrs && S.hour + hrs > 24 && !e.allowPastMidnight) { dis = true; why = T.ui.tooLate; }
          return { text: '<b>' + e.name + '</b> (' + hrs + ' ч)', note: why ? tf(T.ui.unavailable, { reason: why }) : e.hint, disabled: dis, fn: e.fn };
        });
        showModal(T.earn.title, T.earn.intro, items);
      }},

    { id: 'eat', name: T.food.title, hours: 0, hint: 'От сытости зависит здоровье.',
      run: () => {
        const opts = C.food.map(f => {
          const t = T.food[f.id];
          let dis = '';
          if (S.money < f.cost) dis = tf(T.ui.noMoney, { price: fmt(f.cost) });
          else if (S.energy < f.energy) dis = tf(T.ui.notEnoughEnergyShort, { n: f.energy });
          else if (f.needClothes && !S.clothes) dis = T.ui.needClothes;
          let note = dis ? dis : t.note;
          if (f.energy) note += ' · силы −' + f.energy;
          return { text: tf(t.label, { price: fmt(f.cost) }), note: note, disabled: !!dis,
            fn: () => startAction({ name: t.name, hours: f.hours, energy: f.energy || 0 }, () => {},
              () => {
                const fx = { satiety: f.satiety, mood: f.mood, health: f.health };
                if (f.cost) fx.money = -f.cost;
                if (f.id === 'dump') {
                  S.satiety = clamp(S.satiety + f.satiety); S.mood = clamp(S.mood + f.mood);
                  if (chance(f.gastritChance) && !S.illnesses.some(i => i.id === 'gastrit')) {
                    addIllness('gastrit');
                    showResult(t.title, t.resultSick, fx, 'logBad');
                  } else showResult(t.title, t.result, fx);
                  return;
                }
                applyFx(fx);
                showResult(t.title, t.result, fx, f.satiety >= 60 ? 'logGood' : '');
              }) };
        });
        showModal(T.food.title, tf(T.food.intro, { satiety: Math.round(S.satiety) }), opts);
      }},

    { id: 'wash', name: T.wash.title, hours: 0, hint: 'Чистота открывает двери работодателей.',
      run: () => {
        const opts = C.wash.map(w => {
          const t = T.wash[w.id];
          let dis = '';
          if (S.money < w.cost) dis = tf(T.ui.noMoney, { price: fmt(w.cost) });
          else if (S.energy < w.energy) dis = tf(T.ui.notEnoughEnergyShort, { n: w.energy });
          let note = dis ? dis : t.note;
          if (w.energy) note += ' · силы −' + w.energy;
          return { text: tf(t.label, { price: fmt(f_cost(w)) }), note: note, disabled: !!dis,
            fn: () => startAction({ name: t.name, hours: w.hours, energy: w.energy || 0 }, () => {},
              () => { applyFx({ money: -w.cost, clean: w.clean, health: w.health, mood: w.mood });
                showResult(t.title, t.result,
                  { money: -w.cost, clean: w.clean, health: w.health, mood: w.mood },
                  w.cost > 0 ? 'logGood' : ''); }) };
        });
        showModal(T.wash.title, tf(T.wash.intro, { clean: Math.round(S.clean) }), opts);
      }},

    { id: 'rest', name: T.rest.name, hours: 0, hint: T.rest.hint,
      run: () => openRest() },

    { id: 'sleep', name: T.sleep.name, hours: 0, hint: T.sleep.hint,
      run: () => openSleep() },

    { id: 'shop', name: T.shop.name, hours: 0, hint: T.shop.hint,
      can: () => (S.hour >= C.shopHours.from && S.hour < C.shopHours.to) ? true :
        tf(T.ui.closedShop, { from: C.shopHours.from, to: C.shopHours.to }),
      run: () => openShop() },

    { id: 'treatAll', name: T.hospital.name, hours: C.hospital.hours, energy: C.hospital.energy, hint: T.hospital.hint,
      show: () => S.health < C.hospital.showBelow,
      can: () => (S.hour >= C.hospital.openFrom && S.hour < C.hospital.openTo) ? true :
        tf(T.ui.closedHospital, { from: C.hospital.openFrom, to: C.hospital.openTo }),
      run: () => {
        startAction({ name: T.hospital.name, hours: C.hospital.hours, energy: C.hospital.energy },
          b => {
            b.tot.health = (b.tot.health || 0) + C.hospital.healthPerHour;
            b.tot.satiety = (b.tot.satiety || 0) + C.hospital.satietyPerHour;
            S.health = clamp(S.health + C.hospital.healthPerHour);
            S.satiety = clamp(S.satiety + C.hospital.satietyPerHour);
            S.mood = clamp(S.mood + C.hospital.moodPerHour);
          },
          b => showResult(T.hospital.title, T.hospital.result,
            { health: Math.round(b.tot.health), satiety: Math.round(b.tot.satiety), mood: Math.round(C.hospital.moodPerHour * b.elapsed) }, 'logGood'),
          false);
      }},
  ];
}
/* хелпер для цен в действиях */
function f_cost(w) { return fmt(w.cost); }

/* ---------- отдых с вариантами ---------- */
let REST_ITEMS = null;
function buildRest() {
  REST_ITEMS = [
    { name: T.rest.name, hours: C.rest.hours, energy: 0, hint: T.rest.hint, fn: baseRest },
  ];
  const rx = C.restExtra || {};
  [
    ['radio', () => S.radio],
    ['walk',  () => true],
    ['think', () => true],
    ['watch', () => true]
  ].forEach(([key, cond]) => {
    const t = T.restExtra && T.restExtra[key];
    if (!t || !rx[key] || !cond()) return;
    REST_ITEMS.push({ name: t.name, hours: rx[key].hours, energy: rx[key].energy || 0, hint: t.hint,
      fn: () => startAction({ name: t.name, hours: rx[key].hours, energy: rx[key].energy || 0 }, () => {},
        () => { const fx = Object.assign({}, rx[key].fx || {});
          applyFx(fx); showResult(t.title, t.result, fx, fx.mood > 0 ? 'logGood' : ''); })
    });
  });
  if (S.books.length) REST_ITEMS.push({ name: T.restBook.title, hours: 0, energy: 0, hint: T.restBook.hint, fn: openRead });
}
function baseRest() {
  startAction({ name: T.rest.name, hours: C.rest.hours, energy: 0 },
    b => {
      b.tot.energy = (b.tot.energy || 0) + C.rest.energy;
      b.tot.mood = (b.tot.mood || 0) + C.rest.mood;
      b.tot.satiety = (b.tot.satiety || 0) + C.rest.satietyPerHour;
      S.energy = clamp(S.energy + C.rest.energy);
      S.mood = clamp(S.mood + C.rest.mood);
      S.satiety = clamp(S.satiety + C.rest.satietyPerHour);
    },
    b => showResult(T.rest.title, T.rest.result,
      { energy: Math.round(b.tot.energy), mood: Math.round(b.tot.mood), satiety: Math.round(b.tot.satiety) }));
}
function openRest() {
  buildRest();
  const items = REST_ITEMS.map(e => {
    let dis = false, why = '';
    if (S.energy < e.energy) { dis = true; why = tf(T.ui.notEnoughEnergy, { energy: e.energy }); }
    if (!dis && e.hours && S.hour + e.hours > 24) { dis = true; why = T.ui.tooLate; }
    return { text: '<b>' + e.name + '</b> (' + e.hours + ' ч)', note: why ? tf(T.ui.unavailable, { reason: why }) : e.hint, disabled: dis, fn: e.fn };
  });
  showModal(T.rest.name, T.rest.optionsIntro || T.rest.hint, items);
}

/* ---------- книги ---------- */
function bookDef(id) { return (C.books || []).find(b => b.id === id); }
function ownedBookIds() { return S.books.map(b => b.id); }
function buyRandomBook(cat) {
  const pool = (C.books || []).filter(b => b.cat === cat && ownedBookIds().indexOf(b.id) < 0);
  return pool.length ? pool[rnd(0, pool.length - 1)] : null;
}
function findBookOnDump() {
  const pool = (C.books || []).filter(b => b.findable && ownedBookIds().indexOf(b.id) < 0);
  return pool.length ? pool[rnd(0, pool.length - 1)] : null;
}
function openRead() {
  const items = [];
  S.books.forEach((bk, i) => {
    const b = bookDef(bk.id);
    if (!b) return;
    items.push({ text: '📖 <b>' + b.title + '</b> — ' + b.author,
      note: (bk.read ? T.ui.alreadyRead + ' · ' : '') + b.note,
      fn: () => readBook(i) });
  });
  showModal(T.restBook.title, tf(T.restBook.intro, { n: items.length }), items);
}
function readBook(i) {
  const bk = S.books[i], b = bookDef(bk.id);
  const mul = bk.read ? CFG('books.rereadMul', 0.5) : 1;
  const fx = {};
  ['mood', 'satiety', 'health', 'rep'].forEach(k => { if (b.fx && b.fx[k]) fx[k] = Math.round(b.fx[k] * mul); });
  startAction({ name: tf(T.restBook.reading, { title: b.title }), hours: b.hours, energy: b.energy || 0 }, () => {},
    () => {
      bk.read = true;
      if (b.knowledge && mul === 1) fx.knowledge = b.knowledge;
      applyFx(fx);
      showResult(T.restBook.doneTitle, tf(T.restBook.result, { title: b.title, author: b.author }), fx, fx.mood > 0 ? 'logGood' : '');
    });
}

/* ---------- магазин ---------- */
function openShop() {
  const sh = C.shop, t = T.shop;
  const items = [
    { key: 'clothes', owned: () => S.clothes,
      buy: () => startAction({ name: t.clothes.actionName, hours: sh.clothes.hours, energy: sh.clothes.energy }, () => {},
        () => { S.money -= sh.clothes.price; S.clothes = true; S.mood = clamp(S.mood + sh.clothes.mood);
          showResult(t.clothes.title, t.clothes.result, { money: -sh.clothes.price, mood: sh.clothes.mood }, 'logGood'); }) },
    { key: 'card', owned: () => S.card,
      buy: () => startAction({ name: t.card.actionName, hours: sh.card.hours, energy: sh.card.energy }, () => {},
        () => { S.money -= sh.card.price; S.card = true;
          showResult(t.card.title, t.card.result, { money: -sh.card.price }, 'logGood'); }) },
    { key: 'blanket', owned: () => S.blanket,
      buy: () => { S.money -= sh.blanket.price; S.blanket = true;
        showResult(t.blanket.title, t.blanket.result, { money: -sh.blanket.price }, 'logGood'); } },
    { key: 'bag', owned: () => S.sleepingBag,
      buy: () => { S.money -= sh.bag.price; S.sleepingBag = true;
        showResult(t.bag.title, t.bag.result, { money: -sh.bag.price }, 'logGood'); } },
    { key: 'umbrella', owned: () => S.umbrella,
      buy: () => { S.money -= sh.umbrella.price; S.umbrella = true;
        showResult(t.umbrella.title, t.umbrella.result, { money: -sh.umbrella.price }, 'logGood'); } },
    { key: 'phone', owned: () => S.phone,
      buy: () => { S.money -= sh.phone.price; S.phone = true;
        showResult(t.phone.title, t.phone.result, { money: -sh.phone.price }, 'logGood'); } },
    { key: 'radio', owned: () => S.radio,
      buy: () => { S.money -= sh.radio.price; S.radio = true;
        showResult(t.radio.title, t.radio.result, { money: -sh.radio.price }, 'logGood'); } },
    { key: 'medkit', owned: () => false,
      buy: () => { S.money -= sh.medkit.price; applyFx({ health: sh.medkit.health });
        showResult(t.medkit.title, t.medkit.result, { money: -sh.medkit.price, health: sh.medkit.health }, 'logGood'); } },
    { key: 'snack', owned: () => false,
      buy: () => { S.money -= sh.snack.price; applyFx({ satiety: sh.snack.satiety });
        showResult(t.snack.title, t.snack.result, { money: -sh.snack.price, satiety: sh.snack.satiety }, 'logGood'); } },
    { key: 'soap', owned: () => false,
      buy: () => { S.money -= sh.soap.price; applyFx({ clean: sh.soap.clean });
        showResult(t.soap.title, t.soap.result, { money: -sh.soap.price, clean: sh.soap.clean }, 'logGood'); } },
    { key: 'bookFiction', owned: () => !buyRandomBook('fiction') && true && !(C.books || []).some(b => b.cat === 'fiction' && ownedBookIds().indexOf(b.id) < 0),
      buy: () => {
        const b = buyRandomBook('fiction');
        if (!b) { render(); return; }
        S.money -= sh.bookFiction.price; S.books.push({ id: b.id, read: false });
        showResult(t.bookFiction.title, tf(t.bookFiction.result, { title: b.title, author: b.author }), { money: -sh.bookFiction.price }, 'logGood');
      } },
    { key: 'bookStudy', owned: () => !(C.books || []).some(b => b.cat === 'study' && ownedBookIds().indexOf(b.id) < 0),
      buy: () => {
        const b = buyRandomBook('study');
        if (!b) { render(); return; }
        S.money -= sh.bookStudy.price; S.books.push({ id: b.id, read: false });
        showResult(t.bookStudy.title, tf(t.bookStudy.result, { title: b.title, author: b.author }), { money: -sh.bookStudy.price }, 'logGood');
      } },
  ];
  showModal(T.shop.title, T.shop.intro,
    items.map(it => {
      const c = sh[it.key], tc = t[it.key];
      const owned = it.owned();
      const dis = owned || S.money < c.price;
      const why = owned ? T.ui.alreadyHave : tf(T.ui.noMoney, { price: fmt(c.price) });
      return { text: '<b>' + tc.emoji + ' ' + tc.name + ' — ' + fmt(c.price) + ' ₽</b>',
        note: dis ? tf(T.ui.unavailable, { reason: why }) : tc.note, disabled: dis, fn: it.buy };
    }));
}

/* ---------- сон: энергия растёт час за часом до пика, потом спадает ---------- */
function streetName() {
  let base;
  if (S.box && S.blanket) base = T.street.boxBlanket;
  else if (S.box) base = T.street.box;
  else if (S.blanket) base = T.street.blanket;
  else base = T.street.base;
  if (S.dog) base += T.street.dogSuffix;
  return base;
}
function sleepRates(placeId) {
  const c = C.sleep.places[placeId] || C.sleep.places.street;
  let r = { e: c.e, cap: c.cap, hp: c.hp, cl: c.clean, mo: c.mood };
  if (placeId === 'street' || !C.sleep.places[placeId]) {
    const bad = isBadWeather(S.weather.id);
    if (bad) r.e = r.e * C.sleep.badWeatherEnergyMul;
    let hpMul = 1;
    if (bad && (S.weather.id === 'rain' || S.weather.id === 'snow') && S.umbrella) hpMul *= C.sleep.umbrellaRainHpMul;
    if (S.blanket) hpMul *= C.sleep.blanketHpMul;
    if (S.sleepingBag) hpMul *= C.sleep.bagHpMul;
    if (S.box) hpMul *= C.sleep.boxHpMul;
    r.hp *= hpMul;
    if (S.sleepingBag) { r.e += C.sleep.bagEnergy; r.cap = Math.min(C.sleep.bagCapMax, r.cap + 1); }
    if (S.box) { r.e += C.sleep.boxEnergy; r.cap = Math.min(C.sleep.bagCapMax, r.cap + 1); }
    if (S.dog) { r.hp *= C.sleep.dogHpMul; r.mo += C.sleep.dogMood; }
  }
  if (S.illnesses.some(i => i.id === 'insomnia')) { r.e = r.e * C.illnesses.insomnia.sleepMul; r.cap = r.cap * C.illnesses.insomnia.sleepMul; }
  return r;
}
function sleepRatePerHour(r, i) {
  const peak = C.sleep.peakHour;
  if (i <= peak) return Math.min(r.e + (i - 1), r.cap);
  return Math.max(r.e, r.cap - (i - peak));
}
function sleepTotal(r, hours) {
  let t = 0;
  for (let i = 1; i <= hours; i++) t += sleepRatePerHour(r, i);
  return Math.round(t);
}
function openSleep() {
  const opts = [{ id: 'street', name: streetName(), emoji: '🌃', cost: 0, r: sleepRates('street') }]
    .concat(Object.keys(C.sleep.places).filter(k => k !== 'street').map(k => ({
      id: k, name: tf(T.housing[k].name, { cost: fmt(C.sleep.places[k].cost) }),
      emoji: T.housing[k].emoji, cost: C.sleep.places[k].cost, r: sleepRates(k)
    })));
  showModal(T.sleep.title, T.sleep.intro,
    opts.map(o => ({
      text: '<b>' + o.emoji + ' ' + o.name + '</b>',
      note: tf(T.sleep.placeNote, {
        first: Math.round(o.r.e), cap: Math.round(o.r.cap),
        cost: o.cost ? tf(T.sleep.costNote, { cost: fmt(o.cost) }) : ''
      }),
      disabled: S.money < o.cost,
      fn: () => chooseSleepHours(o)
    })));
}
function chooseSleepHours(o) {
  const btns = [];
  for (let h = 1; h <= C.sleep.maxHours; h++) {
    btns.push({ text: h + ' ч',
      /* прирост именно за этот час, не «первый час» */
      note: tf(T.sleep.hourNote, { delta: Math.round(sleepRatePerHour(o.r, h)), total: sleepTotal(o.r, h) }),
      fn: () => startSleep(o, h) });
  }
  showModal(T.sleep.hoursTitle, tf(T.sleep.hoursIntro, { place: o.emoji + ' ' + o.name }), btns);
}
function startSleep(o, hours) {
  if (S.money < o.cost) { render(); return; }
  const r = o.r;
  S.lastSleep = o.id;
  startAction({ name: 'Сон: ' + o.name, hours: hours, energy: 0 },
    b => {
      const rate = sleepRatePerHour(r, b.elapsed);
      b.tot.energy = (b.tot.energy || 0) + rate;
      b.tot.health = (b.tot.health || 0) + r.hp;
      b.tot.clean = (b.tot.clean || 0) + r.cl;
      b.tot.mood = (b.tot.mood || 0) + r.mo;
      S.energy = clamp(S.energy + rate);
      S.health = clamp(S.health + r.hp);
      S.clean = clamp(S.clean + r.cl);
      S.mood = clamp(S.mood + r.mo);
    },
    b => {
      const fx = { energy: Math.round(b.tot.energy), health: Math.round(b.tot.health),
        clean: Math.round(b.tot.clean), mood: Math.round(b.tot.mood) };
      if (o.cost) fx.money = -o.cost;
      /* дождь или снег может размочить коробку */
      let soaked = false;
      if (o.id === 'street' && S.box && (S.weather.id === 'rain' || S.weather.id === 'snow') && chance(C.sleep.boxRainDestroyChance)) {
        S.box = false; soaked = true;
      }
      showResult(T.sleep.resultTitle, tf(T.sleep.result, { hours: b.elapsed, emoji: o.emoji, place: o.name }) +
        (soaked ? '<br>' + T.sleep.boxSoaked : ''), fx, b.tot.health < 0 ? 'logBad' : 'logGood');
    });
}

/* ---------- болячки ---------- */
function illDef(id) {
  const c = C.illnesses[id], t = T.illnesses[id];
  return { id, name: t.name, emoji: t.emoji, desc: t.desc, dmgPerDay: c.dmgPerDay, cleanPerDay: c.cleanPerDay, cure: c.cure };
}
function addIllness(id) {
  if (S.illnesses.some(i => i.id === id)) return;
  S.illnesses.push({ id });
  resetImgCache();
  addLog(tf(T.randomEvents.illLog, { emoji: illDef(id).emoji, name: illDef(id).name }), 'logBad');
}
function treat(i) {
  const il = S.illnesses[i]; if (!il) return;
  const d = illDef(il.id);
  if (S.money < d.cure) return;
  S.money -= d.cure;
  S.illnesses.splice(i, 1);
  resetImgCache();
  addLog(tf(T.randomEvents.cureLog, { name: d.name }) + fxHTML({ money: -d.cure }), 'logGood');
  render();
}

/* ---------- смена суток (полночь) ---------- */
function midnight() {
  resetImgCache();
  const endedDow = dowIdx(S.day); /* день, который только что закончился */
  S.day++;
  S.weather = pickWeatherForDay(S.day);

  if (S.job && S.job.days.indexOf(endedDow + 1) >= 0 && !S.workedToday) {
    S.jobStrikes++;
    addLog(tf(T.work.skippedLog, { name: S.job.name, n: S.jobStrikes }), 'logBad');
    if (S.jobStrikes >= 3) fire();
  }
  S.workedToday = false;

  if (S.satiety <= C.midnight.starveBelow) {
    S.health = clamp(S.health + C.midnight.starveHealth);
    S.mood = clamp(S.mood + C.midnight.starveMood);
    addLog('🍽️ Сильный голод подтачивает здоровье.', 'logBad');
  }
  if (S.energy < C.midnight.tiredBelow) {
    S.health = clamp(S.health + C.midnight.tiredHealth);
    addLog('💤 Хроническое переутомление.', 'logBad');
  }

  S.illnesses.forEach(il => {
    const d = illDef(il.id);
    if (d.dmgPerDay) S.health = clamp(S.health - d.dmgPerDay);
    if (d.cleanPerDay) S.clean = clamp(S.clean + d.cleanPerDay);
  });

  let sickP = C.midnight.sickBase;
  if (S.clean < C.midnight.sickIfCleanBelow) sickP += C.midnight.sickDirtyBonus;
  if (S.health < C.midnight.sickIfHealthBelow) sickP += C.midnight.sickLowBonus;
  if (S.lastSleep === 'street' && (S.box || S.blanket || S.sleepingBag || S.dog)) {
    sickP = Math.max(0, sickP - C.midnight.streetGearSickReduce);
  }
  if (chance(sickP)) {
    const pool = C.midnight.sickPool.filter(id => !S.illnesses.some(i => i.id === id));
    if (pool.length) addIllness(pool[rnd(0, pool.length - 1)]);
  }

  if (S.money >= C.apartmentPrice) addLog(tf(T.flat.moneyLog, { money: fmt(S.money) }), 'logBig');

  spawnGigs();

  clampState();
  if (S.health <= 0) { die(); return; }

  if (S.busy) {
    if (chance(C.midnight.eventChoiceChance)) S.pendingEvent = true;
    else if (chance(C.midnight.eventRandomChance)) randomEvent();
  } else {
    if (chance(C.midnight.eventChoiceChance)) triggerChoiceEvent();
    else if (chance(C.midnight.eventRandomChance)) randomEvent();
  }
}

function die() {
  if (S.timer) { clearInterval(S.timer); S.timer = null; }
  stopBusyAnim();
  S.busy = null; S.over = true;
  renderBusy();
  showModal(T.endings.deathTitle,
    tf(T.endings.deathBody, { day: S.day, money: fmt(S.money), job: S.job ? S.job.name : T.endings.deathJob }),
    [{ text: T.ui.btnRestart, primary: true, fn: () => { localStorage.removeItem('bomzh_save'); location.reload(); } }],
    { noClose: true });
  render();
}

/* ---------- внезапные события с выбором ---------- */
let CHOICE_EVENTS = null;
function buildChoiceEvents() {
  const e = C.events.choice, t = T.choiceEvents, R = repCfg();
  CHOICE_EVENTS = [
    { id: 'dog', w: C.events.choiceWeights.dog,
      cond: () => !S.dog && S.lastSleep === 'street',
      show: () => showModal('❗ Внезапное событие!', '<p>' + t.dog.text + '</p>', [
        { text: '<b>' + t.dog.choices[0].label + '</b>',
          note: S.satiety > e.dogShare.satietyMax ? tf(T.ui.unavailable, { reason: t.dog.choices[0].disReason }) : t.dog.choices[0].note,
          disabled: S.satiety > e.dogShare.satietyMax,
          fn: () => { S.dog = true; applyFx(e.dogShare); eventResult(t.dog.choices[0].result, e.dogShare); } },
        { text: '<b>' + t.dog.choices[1].label + '</b>', note: t.dog.choices[1].note,
          fn: () => { applyFx(e.dogPet); eventResult(t.dog.choices[1].result, e.dogPet); } },
        { text: '<b>' + t.dog.choices[2].label + '</b>', note: t.dog.choices[2].note,
          fn: () => { applyFx(e.dogLeave); eventResult(t.dog.choices[2].result, e.dogLeave); } }
      ]) },
    { id: 'blanket', w: C.events.choiceWeights.blanket,
      cond: () => !S.blanket && S.lastSleep === 'street',
      show: () => showModal('❗ Внезапное событие!', '<p>' + t.blanket.text + '</p>', [
        { text: '<b>' + t.blanket.choices[0].label + '</b>', note: t.blanket.choices[0].note,
          fn: () => { S.blanket = true; eventResult(tf(t.blanket.choices[0].result, {}), {}); } },
        { text: '<b>' + tf(t.blanket.choices[1].label, { money: e.blanketSell }) + '</b>',
          note: tf(t.blanket.choices[1].note, { money: e.blanketSell }),
          fn: () => { applyFx({ money: e.blanketSell }); eventResult(tf(t.blanket.choices[1].result, { money: fmt(e.blanketSell) }), { money: e.blanketSell }); } }
      ]) },
    { id: 'work_offer', w: C.events.choiceWeights.work_offer,
      show: () => showModal('❗ Внезапное событие!', '<p>' + tf(t.work_offer.text, { pay: e.workOffer.pay }) + '</p>', [
        { text: '<b>' + t.work_offer.choices[0].label + '</b>',
          note: S.energy < e.workOffer.minEnergy ? tf(T.ui.unavailable, { reason: t.work_offer.choices[0].disReason }) : tf(t.work_offer.choices[0].note, { pay: e.workOffer.pay, energy: -e.workOffer.energy, satiety: e.workOffer.satiety }),
          disabled: S.energy < e.workOffer.minEnergy,
          fn: () => { applyFx(e.workOffer); eventResult(tf(t.work_offer.choices[0].result, { pay: fmt(e.workOffer.pay) }), e.workOffer); } },
        { text: '<b>' + t.work_offer.choices[1].label + '</b>', note: t.work_offer.choices[1].note,
          fn: () => eventResult(t.work_offer.choices[1].result, {}) }
      ]) },
    { id: 'charity_food', w: C.events.choiceWeights.charity_food,
      cond: () => S.lastSleep !== 'room',
      show: () => showModal('❗ Внезапное событие!', '<p>' + t.charity_food.text + '</p>', [
        { text: '<b>' + t.charity_food.choices[0].label + '</b>',
          note: tf(t.charity_food.choices[0].note, { satiety: e.charity.satiety, mood: e.charity.mood, rep: R.charityRep }),
          fn: () => { const fx = { satiety: e.charity.satiety, mood: e.charity.mood, rep: R.charityRep };
            applyFx(fx); eventResult(t.charity_food.choices[0].result, fx); } },
        { text: '<b>' + t.charity_food.choices[1].label + '</b>', note: t.charity_food.choices[1].note,
          fn: () => { applyFx({ mood: e.charity.moodSkip }); eventResult(t.charity_food.choices[1].result, { mood: e.charity.moodSkip }); } }
      ]) },
    { id: 'old_friend', w: C.events.choiceWeights.old_friend,
      show: () => showModal('❗ Внезапное событие!', '<p>' + tf(t.old_friend.text, { amount: e.friend.amount }) + '</p>', [
        { text: '<b>' + tf(t.old_friend.choices[0].label, { amount: e.friend.amount }) + '</b>',
          note: S.money < e.friend.amount ? tf(T.ui.unavailable, { reason: t.old_friend.choices[0].disReason }) : tf(t.old_friend.choices[0].note, { amount: e.friend.amount, mood: e.friend.moodGive }),
          disabled: S.money < e.friend.amount,
          fn: () => { applyFx({ money: -e.friend.amount, mood: e.friend.moodGive }); eventResult(tf(t.old_friend.choices[0].result, { amount: e.friend.amount }), { money: -e.friend.amount, mood: e.friend.moodGive }); } },
        { text: '<b>' + t.old_friend.choices[1].label + '</b>', note: t.old_friend.choices[1].note,
          fn: () => { applyFx({ mood: e.friend.moodRefuse }); eventResult(t.old_friend.choices[1].result, { mood: e.friend.moodRefuse }); } }
      ]) },
    { id: 'bedbugs', w: C.events.choiceWeights.bedbugs,
      cond: () => S.lastSleep === 'shelter',
      show: () => showModal('❗ Внезапное событие!', '<p>' + t.bedbugs.text + '</p>', [
        { text: '<b>' + t.bedbugs.choices[0].label + '</b>', note: t.bedbugs.choices[0].note,
          fn: () => { applyFx(e.bedbugsChange); eventResult(t.bedbugs.choices[0].result, e.bedbugsChange); } },
        { text: '<b>' + t.bedbugs.choices[1].label + '</b>', note: t.bedbugs.choices[1].note,
          fn: () => { applyFx(e.bedbugsEndure); eventResult(t.bedbugs.choices[1].result, e.bedbugsEndure); } }
      ]) },
    { id: 'noisy_room', w: C.events.choiceWeights.noisy_room,
      cond: () => S.lastSleep === 'room',
      show: () => showModal('❗ Внезапное событие!', '<p>' + t.noisy_room.text + '</p>', [
        { text: '<b>' + t.noisy_room.choices[0].label + '</b>', note: t.noisy_room.choices[0].note,
          fn: () => { applyFx(e.noisyComplain); eventResult(t.noisy_room.choices[0].result, e.noisyComplain); } },
        { text: '<b>' + t.noisy_room.choices[1].label + '</b>', note: t.noisy_room.choices[1].note,
          fn: () => { applyFx(e.noisyEndure); eventResult(t.noisy_room.choices[1].result, e.noisyEndure); } }
      ]) },
    { id: 'umbrella_sale', w: C.events.choiceWeights.umbrella_sale,
      cond: () => S.weather.id === 'rain' && !S.umbrella,
      show: () => showModal('❗ Внезапное событие!', '<p>' + tf(t.umbrella_sale.text, { price: e.umbrellaPrice }) + '</p>', [
        { text: '<b>' + tf(t.umbrella_sale.choices[0].label, { price: e.umbrellaPrice }) + '</b>',
          note: S.money < e.umbrellaPrice ? tf(T.ui.unavailable, { reason: t.umbrella_sale.choices[0].disReason }) : tf(t.umbrella_sale.choices[0].note, { price: e.umbrellaPrice }),
          disabled: S.money < e.umbrellaPrice,
          fn: () => { S.money -= e.umbrellaPrice; S.umbrella = true; eventResult(tf(t.umbrella_sale.choices[0].result, { price: e.umbrellaPrice }), { money: -e.umbrellaPrice }); } },
        { text: '<b>' + t.umbrella_sale.choices[1].label + '</b>', note: t.umbrella_sale.choices[1].note,
          fn: () => eventResult(t.umbrella_sale.choices[1].result, {}) }
      ]) },
    { id: 'chess', w: C.events.choiceWeights.chess,
      cond: () => S.money >= e.chess.minMoney,
      show: () => showModal('❗ Внезапное событие!', '<p>' + tf(t.chess.text, { bet: e.chess.bet, win: fmt(e.chess.win) }) + '</p>', [
        { text: '<b>' + tf(t.chess.choices[0].label, { bet: e.chess.bet }) + '</b>',
          note: tf(t.chess.choices[0].note, { winChance: Math.round(e.chess.winChance * 100), win: fmt(e.chess.win) }),
          fn: () => {
            if (chance(e.chess.winChance)) { applyFx({ money: e.chess.win, mood: e.chess.moodWin }); eventResult(tf(t.chess.choices[0].winResult, { win: fmt(e.chess.win) }), { money: e.chess.win, mood: e.chess.moodWin }); }
            else { applyFx({ money: -e.chess.bet, mood: e.chess.moodLose }); eventResult(t.chess.choices[0].loseResult, { money: -e.chess.bet, mood: e.chess.moodLose }); }
          } },
        { text: '<b>' + t.chess.choices[1].label + '</b>', note: t.chess.choices[1].note,
          fn: () => eventResult(t.chess.choices[1].result, {}) }
      ]) },
    { id: 'found_phone', w: C.events.choiceWeights.found_phone,
      show: () => showModal('❗ Внезапное событие!', '<p>' + t.found_phone.text + '</p>', [
        { text: '<b>' + t.found_phone.choices[0].label + '</b>',
          note: tf(t.found_phone.choices[0].note, { reward: e.phone.reward, mood: e.phone.moodReturn, rep: R.phoneReturnRep }),
          fn: () => { const fx = { money: e.phone.reward, mood: e.phone.moodReturn, rep: R.phoneReturnRep };
            applyFx(fx); eventResult(tf(t.found_phone.choices[0].result, { reward: fmt(e.phone.reward) }), fx); } },
        { text: '<b>' + t.found_phone.choices[1].label + '</b>',
          note: tf(t.found_phone.choices[1].note, { sell: fmt(e.phone.sell), mood: e.phone.moodSell, rep: R.phoneSellRep }),
          fn: () => { const fx = { money: e.phone.sell, mood: e.phone.moodSell, rep: R.phoneSellRep };
            applyFx(fx); eventResult(tf(t.found_phone.choices[1].result, { sell: fmt(e.phone.sell) }), fx); } }
      ]) },
    { id: 'musician', w: C.events.choiceWeights.musician,
      show: () => showModal('❗ Внезапное событие!', '<p>' + t.musician.text + '</p>', [
        { text: '<b>' + t.musician.choices[0].label + '</b>',
          note: tf(t.musician.choices[0].note, { mood: e.musician.listenMood, satiety: e.musician.listenSatiety }),
          fn: () => { applyFx({ mood: e.musician.listenMood, satiety: e.musician.listenSatiety }); eventResult(t.musician.choices[0].result, { mood: e.musician.listenMood, satiety: e.musician.listenSatiety }); } },
        { text: '<b>' + tf(t.musician.choices[1].label, { tip: e.musician.tip }) + '</b>',
          note: S.money < e.musician.tip ? tf(T.ui.unavailable, { reason: t.musician.choices[1].disReason }) : tf(t.musician.choices[1].note, { tip: e.musician.tip, mood: e.musician.tipMood }),
          disabled: S.money < e.musician.tip,
          fn: () => { applyFx({ money: -e.musician.tip, mood: e.musician.tipMood }); eventResult(tf(t.musician.choices[1].result, { tip: e.musician.tip }), { money: -e.musician.tip, mood: e.musician.tipMood }); } }
      ]) },
    { id: 'lost_wallet', w: C.events.choiceWeights.lost_wallet,
      show: () => showModal('❗ Внезапное событие!', '<p>' + t.lost_wallet.text + '</p>', [
        { text: '<b>' + t.lost_wallet.choices[0].label + '</b>',
          note: tf(t.lost_wallet.choices[0].note, { mood: e.wallet.moodReturn, min: fmt(e.wallet.returnMin), max: fmt(e.wallet.returnMax), rep: R.walletReturnRep }),
          fn: () => { const rew = rnd(e.wallet.returnMin, e.wallet.returnMax);
            const fx = { money: rew, mood: e.wallet.moodReturn, rep: R.walletReturnRep };
            applyFx(fx);
            eventResult(tf(t.lost_wallet.choices[0].result, { money: fmt(rew) }), fx); } },
        { text: '<b>' + t.lost_wallet.choices[1].label + '</b>',
          note: tf(t.lost_wallet.choices[1].note, { min: fmt(e.wallet.takeMin), max: fmt(e.wallet.takeMax), mood: e.wallet.moodTake, rep: R.walletTakeRep }),
          fn: () => { const m = rnd(e.wallet.takeMin, e.wallet.takeMax);
            const fx = { money: m, mood: e.wallet.moodTake, rep: R.walletTakeRep };
            applyFx(fx);
            eventResult(tf(t.lost_wallet.choices[1].result, {}), fx); } }
      ]) },
  ];
}

function triggerChoiceEvent() {
  if (S.busy || S.over || S.win) return;
  const pool = CHOICE_EVENTS.filter(e => !e.cond || e.cond());
  if (!pool.length) return;
  const total = pool.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * total, ev = pool[0];
  for (const e of pool) { r -= e.w; if (r <= 0) { ev = e; break; } }
  ev.show();
}

/* ---------- случайные события ---------- */
let RANDOM_EVENTS = null;
function buildRandomEvents() {
  const e = C.events.random, t = T.randomEvents;
  RANDOM_EVENTS = [
    { w: C.events.randomWeights.police, fn: () => {
      if (!S.doc) {
        const fine = rnd(e.police.fineMin, e.police.fineMax);
        S.money = Math.max(0, S.money - fine);
        applyFx({ health: e.police.health, mood: e.police.mood });
        addLog(tf(t.police.noDoc, { fine: fmt(fine) }), 'logBad');
      } else addLog(t.police.ok, '');
    }},
    { w: C.events.randomWeights.walletFind, fn: () => {
      const m = rnd(e.walletFind.min, e.walletFind.max); S.money += m;
      addLog(tf(t.walletFind, { money: fmt(m) }), 'logGood');
    }},
    { w: C.events.randomWeights.thief, cond: () => !S.card && S.money > 100 && S.lastSleep !== 'room', fn: () => {
      const lost = Math.round(S.money * e.thiefShare);
      S.money -= lost;
      addLog(tf(t.thief, { lost: fmt(lost) }), 'logBad');
    }},
    { w: C.events.randomWeights.pie, cond: () => S.lastSleep !== 'room', fn: () => {
      applyFx({ satiety: e.pie.satiety, mood: e.pie.mood });
      addLog(t.pie, 'logGood');
    }},
    { w: C.events.randomWeights.rainStart, cond: () => S.weather.id !== 'rain', fn: () => {
      S.weather = weatherObj('rain');
      applyFx({ clean: e.rainStart.clean, mood: e.rainStart.mood });
      addLog(t.rainStart, '');
    }},
    { w: C.events.randomWeights.chat, fn: () => {
      applyFx({ mood: e.chat.mood });
      addLog(t.chat, 'logGood');
    }},
    { w: C.events.randomWeights.jobBonus, cond: () => !!S.job, fn: () => {
      const bonus = Math.round(S.job.rate * e.jobBonusMul);
      S.money += bonus;
      addLog(tf(t.jobBonus, { money: fmt(bonus) }), 'logGood');
    }},
    { w: C.events.randomWeights.bread, cond: () => S.lastSleep !== 'room' && !S.job, fn: () => {
      applyFx({ satiety: e.bread.satiety });
      addLog(t.bread, '');
    }},
    { w: C.events.randomWeights.frost, cond: () => S.weather.id !== 'frost', fn: () => {
      S.weather = weatherObj('frost');
      addLog(t.frost, 'logBad');
    }},
        { w: C.events.randomWeights.snowStart || 2, cond: () => S.weather.id !== 'snow', fn: () => {
      S.weather = weatherObj('snow');
      applyFx({ mood: -3, clean: -8 });
      addLog(t.snowStart, 'logBad');
    }},
    { w: C.events.randomWeights.coldInRain, fn: () => {
      if ((S.weather.id === 'rain' || S.weather.id === 'snow') && chance(e.coldChanceInRain)) addIllness('cold');
      else applyFx({ energy: e.energyBoost });
      if (S.weather.id === 'rain') addLog(t.coldInRain, 'logBad');
    }},
    { w: C.events.randomWeights.stash, cond: () => S.lastSleep !== 'room', fn: () => {
      const m = rnd(e.stash.min, e.stash.max); S.money += m;
      addLog(tf(t.stash, { money: fmt(m) }), 'logGood');
    }},
    { w: C.events.randomWeights.shelterBed, cond: () => S.lastSleep === 'shelter', fn: () => {
      applyFx({ clean: e.shelterBed.clean, mood: e.shelterBed.mood });
      addLog(t.shelterBed, 'logGood');
    }},
    { w: C.events.randomWeights.roomRest, cond: () => S.lastSleep === 'room', fn: () => {
      applyFx({ mood: e.roomRest.mood, health: e.roomRest.health });
      addLog(t.roomRest, 'logGood');
    }},
    { w: C.events.randomWeights.coffee, cond: () => !!S.job && S.hour < S.job.start, fn: () => {
      applyFx({ mood: e.coffee.mood });
      addLog(t.coffee, 'logGood');
    }},
    { w: C.events.randomWeights.calm, fn: () => addLog(t.calm, '') },
  ];
}
function randomEvent() {
  const pool = RANDOM_EVENTS.filter(e => !e.cond || e.cond());
  if (!pool.length) return;
  const total = pool.reduce((s, e) => s + e.w, 0);
  let r = Math.random() * total, ev = pool[0];
  for (const e of pool) { r -= e.w; if (r <= 0) { ev = e; break; } }
  ev.fn();
  clampState();
}

/* ---------- сохранение ---------- */
function save() {
  if (S.busy) {
    clearInterval(S.timer); S.timer = null; stopBusyAnim();
    addLog(tf(T.ui.saveInterrupt, { name: S.busy.name }), 'logBad');
    S.busy = null;
  }
  const copy = Object.assign({}, S);
  copy.busy = null; copy.timer = null;
  localStorage.setItem('bomzh_save', JSON.stringify(copy));
  showModal(T.ui.savedTitle, T.ui.savedBody, [{ text: T.ui.btnOk, primary: true, fn: render }]);
}
function load() {
  const raw = localStorage.getItem('bomzh_save');
  if (!raw) return false;
  try {
    S = JSON.parse(raw);
    S.weather = weatherObj(S.weather && S.weather.id ? S.weather.id : 'clear');
    if (S.job) S.job = jobById(S.job.id) || S.job;
    S.busy = null; S.timer = null; S.pendingEvent = false;
    S.hour = S.hour || C.startHour; S.jobStrikes = S.jobStrikes || 0; S.workedToday = !!S.workedToday;
    S.blanket = !!S.blanket; S.box = !!S.box; S.sleepingBag = !!S.sleepingBag;
    S.umbrella = !!S.umbrella; S.phone = !!S.phone; S.radio = !!S.radio;
    S.lastSleep = S.lastSleep || 'street';
    S.reputation = S.reputation || 0;
    S.knowledge = S.knowledge || 0;
    S.books = Array.isArray(S.books) ? S.books : [];
    S.gigs = Array.isArray(S.gigs) ? S.gigs : [];
    if (charIds().indexOf(S.character) < 0) S.character = defaultChar();
    startGame(false);
    return true;
  } catch (e) { return false; }
}

/* ---------- выбор персонажа и старт ---------- */
function buildCharList() {
  const box = document.getElementById('charList');
  box.innerHTML = '';
  charIds().forEach(chId => {
    const card = document.createElement('div');
    card.className = 'charCard';
    const prev = document.createElement('div');
    prev.className = 'charPrev';
    const bg = pickImg('background', 'day');
    const body = pickChar(chId, 'body');
    const head = pickChar(chId, 'emotion'); /* при выборе персонажа эмоция нейтральная */
    [bg, body, head].forEach(l => {
      if (!l) return;
      const img = new Image();
      img.src = 'IMG/' + l.name + '.png';
      if (l.name.indexOf('bg_') === 0) img.className = 'pBgImg';
      img.onerror = () => img.remove();
      prev.appendChild(img);
    });
    const name = document.createElement('div');
    name.className = 'charName';
    name.textContent = charName(chId);
    card.appendChild(prev); card.appendChild(name);
    card.onclick = () => { startGame(true, chId); };
    box.appendChild(card);
  });
}

function startGame(fresh, charId) {
  if (fresh) {
    resetImgCache();
    S = newState(charId || defaultChar());
    addLog(T.start.firstDay, 'logBig');
  }
  document.getElementById('start').classList.add('hidden');
  document.getElementById('charSelect').classList.add('hidden');
  document.getElementById('game').classList.remove('hidden');
  render();
}

/* ---------- запуск ---------- */
(async function init() {
  try {
    C = await loadJSON('config.json');
    T = await loadJSON('texts.json');
    IMG = await loadJSON('images.json');
    try { C.weatherCalendar = await loadJSON('weather_calendar.json'); } catch (e2) { C.weatherCalendar = null; }
  } catch (err) {
    document.body.innerHTML = '<p style="padding:40px;color:#e08a8a;font-size:16px">Не удалось загрузить config.json / texts.json / images.json.<br>Откройте игру через локальный сервер, например: <b>python -m http.server</b>, затем http://localhost:8000</p>';
    return;
  }
  buildEARN();
  buildActions();
  buildChoiceEvents();
  buildRandomEvents();

  document.getElementById('startTitle').textContent = T.start.title;
  document.getElementById('startSubtitle').textContent = T.start.subtitle;
  document.getElementById('startIntro').innerHTML = T.start.intro;
  document.getElementById('startRules').innerHTML = T.start.rules.map(r => '<li>' + r + '</li>').join('');
  document.getElementById('startBtn').textContent = T.start.btnStart;
  document.getElementById('loadBtn').textContent = T.start.btnLoad;
  document.getElementById('charTitle').textContent = T.start.charTitle;
  document.getElementById('charNote').innerHTML = T.start.charNote;
  document.getElementById('charBack').textContent = T.start.btnBack;
  document.getElementById('logTitle').textContent = T.ui.logTitle;
  document.getElementById('dayLabel').textContent = T.ui.day;
  document.getElementById('saveBtn').textContent = T.ui.btnSave;
  document.getElementById('resetBtn').textContent = T.ui.btnReset;
  document.getElementById('busyStop').textContent = T.ui.busyStop;
  document.getElementById('mClose').onclick = hideModal;
  document.getElementById('busyStop').onclick = interruptBusy;

  document.getElementById('startBtn').onclick = () => {
    document.getElementById('start').classList.add('hidden');
    buildCharList();
    document.getElementById('charSelect').classList.remove('hidden');
  };
  document.getElementById('charBack').onclick = () => {
    document.getElementById('charSelect').classList.add('hidden');
    document.getElementById('start').classList.remove('hidden');
  };
  document.getElementById('loadBtn').onclick = () => { if (!load()) render(); };
  document.getElementById('saveBtn').onclick = save;
  document.getElementById('resetBtn').onclick = () => showModal(T.ui.resetTitle, T.ui.resetBody,
    [{ text: T.ui.btnYes, primary: true, fn: () => { localStorage.removeItem('bomzh_save'); location.reload(); } },
     { text: T.ui.btnCancel, fn: render }]);

  if (localStorage.getItem('bomzh_save')) document.getElementById('loadBtn').classList.remove('hidden');
})();
