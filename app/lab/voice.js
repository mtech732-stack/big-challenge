// تجربة جدوى المساعد الصوتي في المزاد (ت3). يسمع المقدّم يعيد الإجابة، فيطابقها بقائمة الموضوع،
// ويحكم المقدّم على الاقتراح بـ«صحيح» أو «خطأ»، فتُحسب نسبة الاقتراحات الصحيحة وزمنها.
import { prepare, matchAll } from './match.js';

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
  if (!r) { $('pick').textContent = topic ? 'اضغط «اسمع» وأعد الإجابة بصوتك' : ''; $('why').textContent = ''; $('heard').textContent = ''; return; }
  const pct = Math.round(r.score * 100);
  $('pick').innerHTML = r.pick
    ? `<span class="hl">${r.pick.name}</span>${r.sure ? '' : ' <small>ربما</small>'}`
    : 'ليست في القائمة';
  $('why').textContent = `التشابه ${pct}% · الزمن ${r.ms} ms${r.error ? ` · ${r.error}` : ''}${r.onDevice === false ? ' · بالإنترنت' : ''}`;
  $('heard').innerHTML = `سمع: «<bdi>${r.text || '—'}</bdi>»`;
  $('top').innerHTML = r.top.map(t => `<button data-i="${t.i}">${t.name} ${Math.round(t.score * 100)}%</button>`).join('');
}

function stats() {
  const n = log.length;
  const ok = log.filter(e => e.ok).length;
  const sure = log.filter(e => e.sure);
  const sureOk = sure.filter(e => e.ok).length;
  const ms = n ? Math.round(log.reduce((a, e) => a + (e.ms || 0), 0) / n) : 0;
  $('stats').innerHTML = n
    ? `<b>${Math.round(100 * ok / n)}%</b> اقتراحات صحيحة (${ok} من ${n})<br>`
      + `الواثقة: ${sure.length ? Math.round(100 * sureOk / sure.length) : 0}% (${sureOk} من ${sure.length})<br>`
      + `متوسط الزمن بعد السكوت: ${ms} ms`
    : 'لا محاولات بعد';
  $('log').innerHTML = log.slice().reverse().map(e =>
    `<div>${e.ok ? '✓' : '✗'} «<bdi>${e.text || '—'}</bdi>» ← ${e.pick ?? 'ليست في القائمة'}${e.fix ? ` · الصحيح: ${e.fix}` : ''} · ${Math.round(e.score * 100)}%</div>`).join('');
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
  $('mic').textContent = on ? 'أسمع… (اضغط للإيقاف)' : 'اسمع';
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
  $('live').textContent = d?.text ?? '';
  clearTimeout(silence);
  silence = setTimeout(stopListening, 1200); // سكوت 1.2 ثانية ينهي السماع
}
function onFinal(d) {
  clearTimeout(silence); clearTimeout(hardStop);
  setMic(false);
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
$('mic').addEventListener('click', () => (listening ? stopListening() : startListening()));
$('ok').addEventListener('click', () => judge(true));
$('no').addEventListener('click', () => judge(false));
$('top').addEventListener('click', e => {
  const b = e.target.closest('button[data-i]');
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
