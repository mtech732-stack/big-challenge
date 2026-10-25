// عجلة البونص (القسم 5.7 من الوثيقة، وتصميمها design/wheel.md). ليست نمطاً، لكنها تلتزم شكل «عقد الوحدة»،
// فيديرها مشغّل الجولة (js/round.js) كما يدير الجولات: التراجع والعدّاد والأحداث، والرصيد يغيّره المشغّل وحده.
// عشر خانات ظاهرة قبل الدوران: سبع تحديات وثلاث خانات حظ، بترتيب ثابت لا تتجاور فيه خانتا حظ (design/wheel.md 2.2).
// «أدِر العجلة» يحسم الخانة قبل الحركة (كالقرعة): المؤشر في نافذة الجمهور يدور إليها ويقف، ثم تظهر الخانة بعد 1.2 ثانية.
// والخانة محسومة من الإعداد (rng)، فالتراجع عن الدوران ثم إعادته يقف على الخانة نفسها، ولا تُعاد العجلة لخانة أفضل.

// الترتيب من اليمين: تحدٍّ · خصم · تحدٍّ · تحدٍّ · هدية · تحدٍّ · تحدٍّ · اسرق · تحدٍّ · تحدٍّ. والتحديات بترتيبها في wheel.json.
export const LAYOUT = ['c', 'lose-3', 'c', 'c', 'gift-3', 'c', 'c', 'steal-3', 'c', 'c'];
export const SLOTS = LAYOUT.length;
// نقاط التحدي ووقته (مبدئيان، يُضبطان في ش8): دقيقتان حداً أقصى، ويحكم المقدّم (الوثيقة 5.7).
export const CHALLENGE_POINTS = 5;
export const CHALLENGE_SECONDS = 120;
// الكلمة والرقم في الخانة من التأثير لا من label (label يعدّله المالك وقد يطول، design/wheel.md 2.2).
const LUCK_FACE = { lose: (k) => ['خصم', `−${k}`], steal: (k) => ['اسرق', `${k}`], gift: (k) => ['هدية', `+${k}`] };
const other = team => (team === 1 ? 2 : 1);

// الدوران (design/wheel.md 2.4): المؤشر يبدأ من الخانة الأولى (اليمنى)، ثلاث دورات كاملة ثم إلى خانة الوقوف،
// وكل خطوة أبطأ من التي قبلها: 60 + 420 × p³ (p من 0 إلى 1). spinSteps تعطي مدة كل خطوة (ms)، والأخيرة تنتهي بالوقوف.
export const spinSteps = stop => { const n = 3 * SLOTS + stop; return Array.from({ length: n }, (_, i) => 60 + 420 * (i / n) ** 3); };
// ثم تظهر الخانة بعد 1.2 ثانية من الوقوف.
export const LAND_HOLD = 1200;
export const spinMs = stop => spinSteps(stop).reduce((a, b) => a + b, 0) + LAND_HOLD;

// first: من يدير العجلة أولاً (الأقل نقاطاً، وعند التعادل الخاسر في القرعة، يحدده js/play.js) · why: 'score' أو 'draw' (سطر للمقدّم وحده).
// spinners: من يديرها في كل دورة · n: الدورة الجارية (1 أو 2) · stops: خانة الوقوف لكل دورة، محسومة هنا.
// phase: ready قبل الدوران · spin تدور (at: متى بدأت بساعة الجهاز) · slot وقفت، والخانة ظاهرة (landed)
// · run وقت التحدي (timeup: انتهى ولم يحكم المقدّم بعد) · done حُكم في التحدي · end انتهت العجلة.
// results[i]: نتيجة الدورة i: { team, points } (team 0 إن لم يأخذ أحد)، أو null ما لم تنتهِ.
function setup({ content, first, scores = { 1: 0, 2: 0 }, rng = Math.random }) {
  const challenges = content?.challenges ?? [], luck = content?.luck ?? [];
  let c = 0;
  const slots = LAYOUT.map(k => {
    if (k === 'c') { const x = challenges[c++] ?? { id: '', text: '' }; return { kind: 'challenge', id: x.id, text: x.text }; }
    const l = luck.find(x => x.effect === k) ?? { label: '' };
    return { kind: 'luck', effect: k, text: l.label };
  });
  const pick = () => Math.min(SLOTS - 1, Math.floor(rng() * SLOTS));
  return { first, why: scores[1] === scores[2] ? 'draw' : 'score', spinners: [first, other(first)], n: 1, slots, stops: [pick(), pick()], phase: 'ready', at: null, landed: null, timeup: false, results: [null, null] };
}

const spinner = s => s.spinners[s.n - 1];
// «تحدٍّ» و«+5»، أو الكلمة والرقم من التأثير («خصم» و«−3»).
export function face(slot) {
  if (slot.kind === 'challenge') return { word: 'تحدٍّ', n: `+${CHALLENGE_POINTS}` };
  const [kind, k] = slot.effect.split('-');
  const [word, n] = LUCK_FACE[kind]?.(k) ?? ['', ''];
  return { word, n };
}

const landedOn = s => (s.landed === null ? null : s.slots[s.landed]);
const isChallenge = s => landedOn(s)?.kind === 'challenge';

function actions(s) {
  if (s.phase === 'ready') return [{ id: 'spin', label: 'أدِر العجلة' }];
  // التحدي: «ابدأ» يبدأ الدقيقتين، ثم الحكم والوقت يجري أو بعد انتهائه (انتهاؤه لا يحكم، design/wheel.md 2).
  if (s.phase === 'slot' && isChallenge(s)) return [{ id: 'start', label: 'ابدأ التحدي · دقيقتان' }];
  if (s.phase === 'run') return [{ id: 'won', label: `نجح · +${CHALLENGE_POINTS}` }, { id: 'failed', label: 'لم ينجح' }];
  // وبعد الحكم (أو خانة الحظ، وتطبيقها مرحلة تالية) تُغلق العجلة في هذه المرحلة. والدورة الثانية مرحلة تالية.
  if (s.phase === 'done' || s.phase === 'slot') return [{ id: 'finish', label: 'إنهاء العجلة' }];
  return [];
}

// now: ساعة الجهاز من المشغّل. «land» لا زر له: ترسله النافذة التي تحكم حين تنتهي حركة الدوران، ولا يُقبل قبل وقته (ثانية للفرق).
function act(s, action, scores = {}, now = Date.now()) {
  const [id] = String(action).split(':');
  if (id === 'spin' && s.phase === 'ready') {
    const stop = s.stops[s.n - 1];
    return { state: { ...s, phase: 'spin', at: now, landed: stop }, events: [{ type: 'moment', name: 'spin', team: spinner(s), stop }] };
  }
  if (id === 'land' && s.phase === 'spin' && now >= s.at + spinMs(s.landed) - 1000) return { state: { ...s, phase: 'slot' }, events: [] };
  if (id === 'start' && s.phase === 'slot' && isChallenge(s)) {
    // resume: التراجع عن حكم والوقت يجري يعيد ما بقي من الدقيقتين، لا الدقيقتين كاملتين (js/round.js).
    return { state: { ...s, phase: 'run', timeup: false }, events: [{ type: 'timer', seconds: CHALLENGE_SECONDS, resume: true }] };
  }
  // انتهى الوقت: لا حكم تلقائي، فقد يُتم الفريق أداءه مع الثانية الأخيرة. يقف العدّاد، ويبقى الحكم للمقدّم.
  if (id === 'timeout' && s.phase === 'run' && !s.timeup) return { state: { ...s, timeup: true }, events: [] };
  if ((id === 'won' || id === 'failed') && s.phase === 'run') {
    const team = id === 'won' ? spinner(s) : 0, points = team ? CHALLENGE_POINTS : 0;
    const state = { ...s, phase: 'done', results: s.results.map((r, i) => (i === s.n - 1 ? { team, points } : r)) };
    return { state, events: team ? [{ type: 'score', team, points }, { type: 'moment', name: 'right', team }] : [{ type: 'moment', name: 'none' }] };
  }
  if (id === 'finish' && (s.phase === 'slot' || s.phase === 'done')) return { state: { ...s, phase: 'end' }, events: [] };
  return { state: s, events: [] };
}

// ما تعرضه نافذة الجمهور: الخانات العشر بنوعها ونقاطها، لا بنصوصها (التشويق، design/wheel.md 1). ونص الخانة بعد الوقوف وحده.
// ما تغيّر في رصيد كل فريق في العجلة، من نتائج دوراتها.
function totals(s) {
  const sum = { 1: 0, 2: 0 };
  for (const r of s.results) if (r?.team) sum[r.team] += r.points;
  return sum;
}

function audience(s) {
  const base = { first: s.first, count: s.spinners.length, n: s.n, totals: totals(s) };
  if (s.phase === 'end') return { ...base, screen: 'end', turn: 0 };
  const by = spinner(s);
  if (s.phase === 'slot' || s.phase === 'run' || s.phase === 'done') {
    const slot = s.slots[s.landed], r = s.results[s.n - 1];
    // بعد الحكم: الشارة لمن أخذ النقاط («لا نقاط» إن لم ينجح)، والسطر «نجح التحدي» أو «لم ينجح التحدي» (design/wheel.md 2).
    const verdict = s.phase === 'done' && slot.kind === 'challenge' ? { team: r.team, points: r.points, say: r.team ? 'نجح التحدي' : 'لم ينجح التحدي' } : null;
    return {
      ...base, screen: 'slot', phase: s.phase, by, turn: verdict ? verdict.team : by, landed: s.landed,
      slot: { kind: slot.kind, effect: slot.effect, ...face(slot) }, text: slot.text,
      // الوقت دقيقتان ثابت قبل «ابدأ»، ويُكتب «2:00» لا «120» (design/wheel.md 7.4).
      clock: CHALLENGE_SECONDS, mmss: true, timeup: s.phase === 'run' && s.timeup, verdict,
    };
  }
  return {
    ...base, screen: 'wheel', phase: s.phase, by, turn: by,
    slots: s.slots.map(x => ({ kind: x.kind, ...face(x) })),
    // الدوران: إلى أي خانة، ومتى بدأ (تعدّه النافذة من ساعة الجهاز، فيصح بعد إعادة التحميل).
    spin: s.phase === 'spin' ? { stop: s.landed, at: s.at } : null,
  };
}

// نافذة المقدّم: ما يراه الجمهور، ومعه نصوص الخانات العشر كاملة، وسبب البدء، ومسار الدورتين.
function presenter(s) {
  const a = audience(s);
  return {
    ...a,
    why: s.why,
    items: s.slots.map(x => ({ kind: x.kind, effect: x.effect, text: x.text, ...face(x) })),
    track: s.spinners.map((t, i) => ({ owner: t, result: s.results[i]?.team ?? null, now: s.phase !== 'end' && i === s.n - 1 })),
  };
}

export default {
  id: 'wheel',
  name: 'عجلة البونص',
  contentKey: 'wheel.json',
  // ما لا زر له وتقبله الوحدة في وقته: انتهاء حركة الدوران.
  auto: ['land'],
  // الدوران حالة عابرة لا حكم فيها: التراجع يتخطاها إلى ما قبله (js/play.js).
  transient: s => s.phase === 'spin',
  setup, actions, act, audience, presenter,
  finished: s => s.phase === 'end',
  used: () => [],
};
