// عجلة البونص (القسم 5.7 من الوثيقة، وتصميمها design/wheel.md). ليست نمطاً، لكنها تلتزم شكل «عقد الوحدة»،
// فيديرها مشغّل الجولة (js/round.js) كما يدير الجولات: التراجع والعدّاد والأحداث، والرصيد يغيّره المشغّل وحده.
// عشر خانات ظاهرة قبل الدوران: سبع تحديات وثلاث خانات حظ، بترتيب ثابت لا تتجاور فيه خانتا حظ (design/wheel.md 2.2).
// «أدِر العجلة» يحسم الخانة قبل الحركة (كالقرعة): المؤشر في نافذة الجمهور يدور إليها ويقف، ثم تظهر الخانة بعد 1.2 ثانية.
// والخانة محسومة من الإعداد (rng)، فالتراجع عن الدوران ثم إعادته يقف على الخانة نفسها، ولا تُعاد العجلة لخانة أفضل.

// الترتيب من اليمين: تحدٍّ · خصم · تحدٍّ · تحدٍّ · هدية · تحدٍّ · تحدٍّ · اسرق · تحدٍّ · تحدٍّ. والتحديات بترتيبها في wheel.json.
export const LAYOUT = ['c', 'lose-3', 'c', 'c', 'gift-3', 'c', 'c', 'steal-3', 'c', 'c'];
export const SLOTS = LAYOUT.length;
// نقاط التحدي (مبدئية، تُضبط في ش8).
export const CHALLENGE_POINTS = 5;
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
// phase: ready قبل الدوران · spin تدور (at: متى بدأت بساعة الجهاز) · slot وقفت، والخانة ظاهرة (landed) · end انتهت العجلة.
function setup({ content, first, scores = { 1: 0, 2: 0 }, rng = Math.random }) {
  const challenges = content?.challenges ?? [], luck = content?.luck ?? [];
  let c = 0;
  const slots = LAYOUT.map(k => {
    if (k === 'c') { const x = challenges[c++] ?? { id: '', text: '' }; return { kind: 'challenge', id: x.id, text: x.text }; }
    const l = luck.find(x => x.effect === k) ?? { label: '' };
    return { kind: 'luck', effect: k, text: l.label };
  });
  const pick = () => Math.min(SLOTS - 1, Math.floor(rng() * SLOTS));
  return { first, why: scores[1] === scores[2] ? 'draw' : 'score', spinners: [first, other(first)], n: 1, slots, stops: [pick(), pick()], phase: 'ready', at: null, landed: null };
}

const spinner = s => s.spinners[s.n - 1];
// «تحدٍّ» و«+5»، أو الكلمة والرقم من التأثير («خصم» و«−3»).
export function face(slot) {
  if (slot.kind === 'challenge') return { word: 'تحدٍّ', n: `+${CHALLENGE_POINTS}` };
  const [kind, k] = slot.effect.split('-');
  const [word, n] = LUCK_FACE[kind]?.(k) ?? ['', ''];
  return { word, n };
}

function actions(s) {
  if (s.phase === 'ready') return [{ id: 'spin', label: 'أدِر العجلة' }];
  // المرحلة الأولى (الدوران): بعد الوقوف تُغلق العجلة. والتحدي والحكم وخانات الحظ مراحلها التالية.
  if (s.phase === 'slot') return [{ id: 'finish', label: 'إنهاء العجلة' }];
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
  if (id === 'finish' && s.phase === 'slot') return { state: { ...s, phase: 'end' }, events: [] };
  return { state: s, events: [] };
}

// ما تعرضه نافذة الجمهور: الخانات العشر بنوعها ونقاطها، لا بنصوصها (التشويق، design/wheel.md 1). ونص الخانة بعد الوقوف وحده.
function audience(s) {
  const base = { first: s.first, count: s.spinners.length, n: s.n, totals: { 1: 0, 2: 0 } };
  if (s.phase === 'end') return { ...base, screen: 'end', turn: 0 };
  const by = spinner(s);
  if (s.phase === 'slot') {
    const slot = s.slots[s.landed];
    return { ...base, screen: 'slot', phase: s.phase, by, turn: by, landed: s.landed, slot: { kind: slot.kind, effect: slot.effect, ...face(slot) }, text: slot.text };
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
    track: s.spinners.map((t, i) => ({ owner: t, result: null, now: s.phase !== 'end' && i === s.n - 1 })),
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
