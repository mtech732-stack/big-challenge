// تجربة جدوى المساعد الصوتي في المزاد (ت3). يسمع المقدّم يعيد الإجابة، فيطابقها بقائمة الموضوع،
// ويحكم المقدّم على الاقتراح بـ«صحيح» أو «خطأ»، فتُحسب نسبة الاقتراحات الصحيحة وزمنها.
import { prepare, matchAll, matchMany } from './match.js';

const $ = id => document.getElementById(id);
const cap = window.Capacitor;
const native = !!(cap?.isNativePlatform?.() && cap.nativePromise);
const call = (m, o = {}) => cap.nativePromise('VoiceLab', m, o);
if (!native) document.body.classList.add('nofix');

const KEY = 'voice-lab-log';
const store = {
  get: () => { try { return JSON.parse(localStorage.getItem(KEY)) ?? []; } catch { return []; } },
  set: v => { try { localStorage.setItem(KEY, JSON.stringify(v)); } catch { /* للتجربة فقط */ } },
};

let topics = [];
let prepared = [];
let topic = null;
let log = store.get();
let pending = null;   // آخر اقتراح ينتظر حكم المقدّم
let listening = false;
let stopAt = 0;       // لحظة طلب الإيقاف، لقياس زمن الاقتراح
let silence = 0;
let hardStop = 0;
let onDevice = true;
let said = new Set(); // عناصر حُكم عليها بالصحة في الموضوع الحالي
let oldLocales = [];  // لغات المحرّك القديم من status
let fresh = null;     // ما يدعمه المحرّك الجديد (iOS 26+) من probe
// السماع المتواصل: يسمع طوال وقت الوفاء ويعلّم كل عنصر لحظة قوله، والمقدّم يصحّح بالنقر.
const RUN_SECONDS = 45; // وقت الوفاء في المزاد (PROJECT.md)
let continuous = false;
let run = null;         // { text, removed: Set, added: Set, t0, ended, timer }

// ———— القائمة ————
async function loadTopics() {
  const res = await fetch('../content/packs/general/auction.json');
  topics = (await res.json()).topics.filter(t => !t.hidden);
  $('topic').innerHTML = topics.map((t, k) => `<option value="${k}">${t.topic} (${t.items.length})</option>`).join('');
  pickTopic(0);
}
function pickTopic(k) {
  topic = topics[k];
  prepared = prepare(topic);
  said = new Set();
  drawList();
  show(null);
}
function drawList() {
  $('list').innerHTML = topic.items.map((it, i) =>
    `<div class="${said.has(i) ? 'done' : ''}">${it.name}${it.alts?.length ? ` <small>(${it.alts.join('، ')})</small>` : ''}</div>`).join('');
}

// ———— العرض ————
function show(r) {
  pending = r;
  $('ok').disabled = $('no').disabled = !r;
  $('top').innerHTML = '';
  if (!r) { $('pick').textContent = !topic ? '' : continuous ? 'اضغط «ابدأ الوفاء» وردّد العناصر متتابعة' : 'اضغط «اسمع» وأعد الإجابة بصوتك'; $('why').textContent = ''; $('heard').textContent = ''; return; }
  const pct = Math.round(r.score * 100);
  $('pick').innerHTML = r.pick
    ? `<span class="hl">${r.pick.name}</span>${r.sure ? '' : ' <small>ربما</small>'}`
    : 'ليست في القائمة';
  $('why').textContent = `التشابه ${pct}% · الزمن ${r.ms} ms${r.error ? ` · ${r.error}` : ''}${r.onDevice === false ? ' · بالإنترنت' : ''}`;
  $('heard').innerHTML = `سمع: «<bdi>${r.text || '—'}</bdi>»`;
  $('top').innerHTML = r.top.map(t => `<button data-i="${t.i}">${t.name} ${Math.round(t.score * 100)}%</button>`).join('');
}

function stats() {
  const runs = log.filter(e => e.mode === 'run');
  const singles = log.filter(e => e.mode !== 'run');
  const n = singles.length;
  const ok = singles.filter(e => e.ok).length;
  const sure = singles.filter(e => e.sure);
  const sureOk = sure.filter(e => e.ok).length;
  const ms = n ? Math.round(singles.reduce((a, e) => a + (e.ms || 0), 0) / n) : 0;
  // في المتواصل: ما علّمه الهاتف وأبقاه المقدّم صحيح، وما أزاله خطأ، وما أضافه بيده فاتَ الهاتف.
  const hit = runs.reduce((a, e) => a + e.auto.length - e.removed.length, 0);
  const wrong = runs.reduce((a, e) => a + e.removed.length, 0);
  const missed = runs.reduce((a, e) => a + e.added.length, 0);
  const parts = [];
  if (n) parts.push(`<b>${Math.round(100 * ok / n)}%</b> اقتراحات صحيحة (${ok} من ${n})`,
    `الواثقة: ${sure.length ? Math.round(100 * sureOk / sure.length) : 0}% (${sureOk} من ${sure.length})`, `متوسط الزمن بعد السكوت: ${ms} ms`);
  if (runs.length) parts.push(`<b>${hit + missed ? Math.round(100 * hit / (hit + missed)) : 0}%</b> مما قيل علّمه الهاتف (${hit} من ${hit + missed})`,
    `علّم خطأً: ${wrong} · في ${runs.length} جولة متواصلة`);
  $('stats').innerHTML = parts.join('<br>') || 'لا محاولات بعد';
  $('log').innerHTML = log.slice().reverse().map(e => e.mode === 'run'
    ? `<div>⟳ ${e.topic}: علّم ${e.auto.length - e.removed.length}${e.removed.length ? `، أزلتَ ${e.removed.length}` : ''}${e.added.length ? `، أضفتَ ${e.added.length}` : ''}${e.extras?.length ? `، خارج القائمة ${e.extras.length}` : ''}</div>`
    : `<div>${e.ok ? '✓' : '✗'} «<bdi>${e.text || '—'}</bdi>» ← ${e.pick ?? 'ليست في القائمة'}${e.fix ? ` · الصحيح: ${e.fix}` : ''} · ${Math.round(e.score * 100)}%</div>`).join('');
}

// ———— السماع المتواصل ————
function runPicks() {
  const auto = matchMany(run.text, prepared).filter(c => !run.removed.has(c.i));
  const ids = new Set(auto.map(c => c.i));
  const extra = [...run.added].filter(i => !ids.has(i)).map(i => ({ i, name: topic.items[i].name, man: true }));
  return [...auto, ...extra];
}
function drawRun() {
  const picks = runPicks();
  said = new Set(picks.map(c => c.i));
  drawList();
  const left = run.ended ? 0 : Math.max(0, RUN_SECONDS - Math.floor((performance.now() - run.t0) / 1000));
  $('pick').innerHTML = `ذُكر <span class="hl">${picks.length + run.extras.length}</span> من ${topic.items.length}`;
  $('why').textContent = run.ended ? 'انتهى. أزل الخطأ بنقرة، وأضف ما فات من القائمة، أو انقر كلمات «سمع» لتعتمد ما ليس فيها (المتجاورة إجابة واحدة)، ثم «اعتمد»' : `أسمع… باقي ${left} ثانية`;
  // بعد الانتهاء: كل كلمة مسموعة تُنقر، والمتجاورة المختارة عبارة واحدة تُعتمد خارج القائمة (المالك، 11 نوفمبر).
  const ws = run.text ? run.text.split(/\s+/) : [];
  $('heard').innerHTML = `سمع: «<bdi>${ws.length ? ws.map((w, k) => `<span class="w${run.sel.has(k) ? ' sel' : ''}" data-w="${k}">${w}</span>`).join(' ') : '—'}</bdi>»`;
  const phrases = selPhrases();
  $('addx').hidden = !phrases.length;
  $('addx').textContent = phrases.length === 1 ? `اعتمد «${phrases[0]}» خارج القائمة`
    : phrases.length ? `اعتمد ${phrases.length} إجابات خارج القائمة: ${phrases.map(x => `«${x}»`).join(' ')}` : '';
  $('top').innerHTML = picks.map(c => `<button data-i="${c.i}" class="${c.man ? 'man' : ''}">${c.name} ✕</button>`).join('')
    + run.extras.map((x, k) => `<button data-x="${k}" class="extra">${x} ✕</button>`).join('');
  $('ok').disabled = !run.ended;
}
// الكلمات المختارة تُقسم مجموعات متجاورة: كل مجموعة إجابة مستقلة، والمركّبة («ريشة طائرة») تبقى معاً.
function selPhrases() {
  const ws = run.text ? run.text.split(/\s+/) : [];
  const ks = [...run.sel].sort((a, b) => a - b);
  const groups = [];
  for (const k of ks) {
    const g = groups[groups.length - 1];
    if (g && k === g[g.length - 1] + 1) g.push(k); else groups.push([k]);
  }
  return groups.map(g => g.map(k => ws[k]).filter(Boolean).join(' ')).filter(Boolean);
}
function addExtra() {
  for (const phrase of selPhrases()) {
    // إن طابقت العبارة عنصراً في القائمة فهي ذلك العنصر، فلا تُعدّ مرتين.
    const r = matchAll([phrase], prepared);
    if (r.sure) { run.removed.delete(r.pick.i); run.added.add(r.pick.i); }
    else if (!run.extras.includes(phrase)) run.extras.push(phrase);
  }
  run.sel = new Set();
  drawRun();
}
async function startRun() {
  if (!topic) return;
  said = new Set();
  run = { text: '', removed: new Set(), added: new Set(), sel: new Set(), extras: [], t0: performance.now(), ended: false, timer: 0 };
  $('live').textContent = '';
  const hints = topic.items.flatMap(it => [it.name, ...(it.alts ?? [])]);
  try {
    const engine = $('engine').value;
    await call('start', { engine, locale: $('locale').value, onDevice: engine === 'old' ? onDevice : true, hints });
    setMic(true);
    run.timer = setInterval(() => { if (performance.now() - run.t0 >= RUN_SECONDS * 1000) stopListening(); else drawRun(); }, 500);
    drawRun();
  } catch (e) {
    run = null;
    $('live').textContent = e?.message || String(e);
  }
}
function endRun(d) {
  clearInterval(run.timer);
  if (d?.text) run.text = d.text;
  run.ended = true;
  if (d?.error && !run.text) $('live').textContent = d.error;
  drawRun();
}
function commitRun() {
  const auto = matchMany(run.text, prepared).map(c => c.i);
  const name = i => topic.items[i].name;
  log.push({
    mode: 'run', at: new Date().toISOString(), topic: topic.topic, text: run.text,
    auto: auto.map(name), removed: [...run.removed].filter(i => auto.includes(i)).map(name),
    added: [...run.added].filter(i => !auto.includes(i)).map(name), extras: run.extras,
    seconds: Math.round((performance.now() - run.t0) / 1000), locale: $('locale').value, engine: $('engine').value,
  });
  store.set(log);
  run = null;
  said = new Set();
  drawList();
  show(null);
  stats();
}
function toggleRunItem(i) {
  if (!run) return;
  const on = runPicks().some(c => c.i === i);
  if (on) { run.added.delete(i); run.removed.add(i); } else { run.removed.delete(i); run.added.add(i); }
  drawRun();
}

function judge(ok, fix = null) {
  if (!pending) return;
  const r = pending;
  log.push({
    at: new Date().toISOString(), topic: topic.topic, text: r.text, alts: r.alts, pick: r.pick?.name ?? null,
    score: +r.score.toFixed(3), sure: r.sure, ok, fix, ms: r.ms, onDevice: r.onDevice, locale: $('locale').value, engine: $('engine').value,
  });
  store.set(log);
  const hit = ok ? r.pick?.i : fix != null ? topic.items.findIndex(it => it.name === fix) : -1;
  if (hit != null && hit >= 0) said.add(hit);
  drawList();
  show(null);
  stats();
}

// ———— السماع ————
function setMic(on) {
  listening = on;
  $('mic').classList.toggle('on', on);
  $('mic').textContent = on ? 'أسمع… (اضغط للإيقاف)' : continuous ? 'ابدأ الوفاء' : 'اسمع';
}
async function startListening() {
  if (!topic) return;
  show(null);
  $('live').textContent = '';
  const hints = topic.items.flatMap(it => [it.name, ...(it.alts ?? [])]);
  try {
    const engine = $('engine').value;
    await call('start', { engine, locale: $('locale').value, onDevice: engine === 'old' ? onDevice : true, hints });
    setMic(true);
    hardStop = setTimeout(stopListening, 8000);
  } catch (e) {
    $('live').textContent = e?.message || String(e);
  }
}
function stopListening() {
  clearTimeout(silence); clearTimeout(hardStop);
  if (!listening) return;
  stopAt = performance.now();
  setMic(false);
  call('stop');
}
function onPartial(d) {
  if (run) { run.text = d?.text ?? run.text; drawRun(); return; }
  $('live').textContent = d?.text ?? '';
  clearTimeout(silence);
  silence = setTimeout(stopListening, 1200); // سكوت 1.2 ثانية ينهي السماع
}
function onFinal(d) {
  clearTimeout(silence); clearTimeout(hardStop);
  setMic(false);
  if (run) { endRun(d); return; }
  $('live').textContent = '';
  const texts = [d?.text, ...(d?.alts ?? [])];
  const r = matchAll(texts, prepared);
  r.alts = d?.alts ?? [];
  r.ms = stopAt ? Math.round(performance.now() - stopAt) : (d?.ms ?? 0);
  r.onDevice = d?.onDevice;
  r.error = d?.error && !d?.text ? d.error : '';
  stopAt = 0;
  show(r);
}

// للتجربة في المتصفح دون هاتف: نص مكتوب يمر بالمطابقة نفسها.
function typed() {
  const t = $('typed').value.trim();
  if (!t) return;
  const t0 = performance.now();
  const r = matchAll([t], prepared);
  r.alts = []; r.ms = Math.round(performance.now() - t0); r.onDevice = true;
  show(r);
}

// ———— الإعداد ————
async function setup() {
  if (!native) {
    $('perm').textContent = 'متصفح: الكتابة بدل الصوت';
    $('locale').innerHTML = '<option>ar-SA</option>';
    $('mic').disabled = true;
    return;
  }
  cap.addListener('VoiceLab', 'partial', onPartial);
  cap.addListener('VoiceLab', 'final', onFinal);
  let s = await call('status');
  if (s.speech !== 'granted' || s.mic !== 'granted') { await call('requestAccess'); s = await call('status'); }
  const okPerm = s.speech === 'granted' && s.mic === 'granted';
  $('perm').textContent = okPerm ? `iOS ${s.ios} · الإذن مُعطى` : 'لم يُعطَ إذن الميكروفون أو التعرّف';
  $('perm').classList.toggle('bad', !okPerm);
  oldLocales = s.locales ?? [];
  try { fresh = await call('probe'); } catch { fresh = null; }
  const engines = [['old', 'المحرّك القديم']];
  if (fresh?.available && fresh.dictation?.length) engines.push(['dictation', 'الجديد: الإملاء']);
  if (fresh?.available && fresh.transcriber?.length) engines.push(['transcriber', 'الجديد: النسخ']);
  $('engine').innerHTML = engines.map(([v, t]) => `<option value="${v}">${t}</option>`).join('');
  // يبدأ بالجديد إن دعم العربية، لأنه يعمل على الجهاز دون إنترنت.
  if (engines.length > 1) $('engine').value = engines[1][0];
  const note = fresh?.available
    ? `الجديد: الإملاء ${fresh.dictation?.length ? fresh.dictation.join(' ') : 'بلا عربية'} · النسخ ${fresh.transcriber?.length ? fresh.transcriber.join(' ') : 'بلا عربية'}`
    : 'المحرّك الجديد غير متاح';
  $('perm').title = note;
  $('live').textContent = note;
  drawLocales();
}
function drawLocales() {
  const engine = $('engine').value;
  if (engine === 'old') {
    const first = oldLocales.find(l => l.id === 'ar-KW' && l.onDevice) ?? oldLocales.find(l => l.id === 'ar-SA' && l.onDevice) ?? oldLocales.find(l => l.onDevice) ?? oldLocales[0];
    $('locale').innerHTML = oldLocales.map(l => `<option value="${l.id}" ${l === first ? 'selected' : ''}>${l.id} ${l.onDevice ? '· على الجهاز' : '· بالإنترنت فقط'}</option>`).join('')
      || '<option value="ar-SA">لا عربية في الهاتف</option>';
    $('offline').hidden = false;
    $('dl').hidden = true;
  } else {
    const list = fresh?.[engine] ?? [];
    const have = fresh?.[`${engine}Installed`] ?? [];
    $('locale').innerHTML = list.map(id => `<option value="${id}">${id} ${have.includes(id) ? '· منزّل' : '· غير منزّل'}</option>`).join('');
    const pref = list.find(id => id.includes('KW')) ?? list.find(id => id.includes('SA')) ?? list[0];
    if (pref) $('locale').value = pref;
    $('offline').hidden = true;
    $('dl').hidden = have.includes($('locale').value);
  }
  syncOffline();
}
async function download() {
  $('dl').disabled = true;
  $('dl').textContent = 'يُنزَّل…';
  try {
    fresh = await call('install', { engine: $('engine').value, locale: $('locale').value });
    $('live').textContent = 'نُزّل النموذج، فالمحرّك الجديد يعمل دون إنترنت.';
  } catch (e) {
    $('live').textContent = e?.message || String(e);
  }
  $('dl').disabled = false;
  $('dl').textContent = 'نزّل النموذج العربي';
  drawLocales();
}
function syncOffline() {
  $('offline').textContent = `دون إنترنت: ${onDevice ? 'نعم' : 'لا'}`;
  $('offline').setAttribute('aria-pressed', String(onDevice));
}

$('topic').addEventListener('change', e => pickTopic(+e.target.value));
$('engine').addEventListener('change', drawLocales);
$('locale').addEventListener('change', () => {
  const engine = $('engine').value;
  if (engine !== 'old') $('dl').hidden = (fresh?.[`${engine}Installed`] ?? []).includes($('locale').value);
});
$('dl').addEventListener('click', download);
$('mic').addEventListener('click', () => (listening ? stopListening() : continuous ? startRun() : startListening()));
$('ok').addEventListener('click', () => (run ? commitRun() : judge(true)));
$('mode').addEventListener('click', () => {
  if (listening) return;
  continuous = !continuous;
  run = null;
  document.body.classList.toggle('run', continuous);
  $('mode').textContent = continuous ? 'سماع متواصل' : 'ضغطة لكل إجابة';
  $('mode').setAttribute('aria-pressed', String(continuous));
  $('ok').textContent = continuous ? '✓ اعتمد العدّ' : '✓ الاقتراح صحيح';
  $('no').hidden = continuous;
  setMic(false);
  said = new Set();
  drawList();
  show(null);
});
$('heard').addEventListener('click', e => {
  const w = e.target.closest('.w');
  if (!w || !run?.ended) return;
  const k = +w.dataset.w;
  if (run.sel.has(k)) run.sel.delete(k); else run.sel.add(k);
  drawRun();
});
$('addx').addEventListener('click', addExtra);
$('list').addEventListener('click', e => {
  if (!run) return;
  const d = e.target.closest('#list > div');
  if (d) toggleRunItem([...$('list').children].indexOf(d));
});
$('no').addEventListener('click', () => judge(false));
$('top').addEventListener('click', e => {
  const b = e.target.closest('button[data-i]');
  const x = e.target.closest('button[data-x]');
  if (x && run) { run.extras.splice(+x.dataset.x, 1); drawRun(); return; }
  if (b && run) { toggleRunItem(+b.dataset.i); return; }
  if (!b || !pending) return;
  const i = +b.dataset.i;
  // اختيار عنصر غير المقترح تصحيح يدوي: الاقتراح خطأ والصحيح هذا. واختيار المقترح نفسه «صحيح».
  if (pending.pick && pending.pick.i === i) judge(true); else judge(false, topic.items[i].name);
});
$('offline').addEventListener('click', () => { onDevice = !onDevice; syncOffline(); });
$('back').addEventListener('click', () => { location.href = '../index.html'; });
$('copy').addEventListener('click', async () => {
  const text = JSON.stringify(log, null, 1);
  try { await navigator.clipboard.writeText(text); $('copy').textContent = 'نُسخت'; } catch { $('copy').textContent = 'تعذّر النسخ'; }
  setTimeout(() => { $('copy').textContent = 'نسخ النتائج'; }, 1500);
});
$('clear').addEventListener('click', () => { if (confirm('مسح كل المحاولات؟')) { log = []; store.set(log); stats(); } });
$('typedGo').addEventListener('click', typed);
$('typed').addEventListener('keydown', e => { if (e.key === 'Enter') typed(); });

stats();
setup().catch(e => { $('perm').textContent = e?.message || String(e); $('perm').classList.add('bad'); });
loadTopics();
