// النمط الثالث: «المزاد» (القسم 5.5 من الوثيقة، وتصميمه design/auction.md). وحدة تلتزم «عقد الوحدة».
// 3 مواضيع في الجولة: سهل ثم متوسط ثم صعب.
// المزايدة حرة فوق رقم الخصم (قاعدة المالك، 5.5 وdesign/auction.md 3.0): لكل فريق رقم يبدأ 0، ونقرة زره «raise:1» ترفعه
// إلى max(رقمه + 1، رقم خصمه + 1)، فأول نقرة رقم الخصم + 1 وكل نقرة بعدها +1، ولا تساوي. ولا يتجاوز رقمٌ طول القائمة.
// و«ابدأ» يرسي المزاد على الأعلى ويبدأ عدّاد الوفاء فوراً. والقائمة حتى 20 عددها ظاهر للجمهور، وفوقها مخفي.
// والقائمة المرجعية لا تصل إلى الجمهور قبل الحكم (7.1).
// ثم الوفاء والعدّ: يُحسب كل عنصر يذكره الملتزم (+1)، فإن بلغ ما التزم به أخذ نقاطه، وإلا أخذ الخصم نقطتين (لا إكمال).
// ثم «الموضوع التالي» حتى الثالث، و«إنهاء الجولة».
import { freshFirst, besides } from '../round.js';

// وقت الوفاء 60 (45 مقترحة تُضبط في ش8)، ونقاط الخصم إن لم يفِ الملتزم (قيمة مبدئية تُضبط في ش8).
export const FULFIL_SECONDS = 60;
export const FAIL_POINTS = 2;
// القائمة حتى هذا الطول عددها ظاهر للجمهور (5.5).
export const SHOW_SIZE = 20;
const LEVELS = ['easy', 'medium', 'hard'];
const other = team => (team === 1 ? 2 : 1);

// الحالات: intro افتتاح الجولة · bid المزايدة · fulfil عدّاد الملتزم · decided انتهى الموضوع · end انتهت الجولة.
// (و ready من نسخة سابقة: الالتزام قبل «ابدأ»، و complete فيها «إكمال الخصم»: تُكملان كما كانتا.)
// nums: [رقم الأول، رقم الثاني] في المزايدة (0 لمن لم يزايد) · team: 0 في المزايدة (الحدّ في المنتصف)، ثم الملتزم
// · commit: { team, n } من رسا عليه المزاد ورقمه
// · said: ما ذُكر بالترتيب { i, team }، وi موضع العنصر في القائمة، أو null إن عُدّ دون اسم («صحيح · +1» في النافذة الواحدة)
// · results[i]: { team, points } من أخذ نقاط الموضوع i (team 0 إن لم يأخذها أحد)، أو null ما لم ينتهِ.
// avoid: مواضيع تتقاطع مع قائمة ترتيب اختيرت في المباراة (تدقيق ش5 «ثالثاً»).
function setup({ content, first, seen = [], avoid = [], rng = Math.random }) {
  const bank = content?.topics ?? [];
  const topics = LEVELS.map((l, i) => {
    const t = freshFirst(besides(bank.filter(x => x.level === l), avoid), seen, 1, rng)[0];
    return t && { id: t.id, level: t.level, topic: t.topic, items: t.items.map(x => ({ name: x.name, alts: x.alts ?? [] })), note: t.note ?? '' };
  }).filter(Boolean);
  return { first, topics, index: 0, phase: 'intro', team: 0, nums: [0, 0], commit: null, said: [], results: topics.map(() => null) };
}

const current = s => s.topics[s.index];
// حالة محفوظة من مرحلة «المزايدة» بلا said، كي تكمل مباراة جارية بعد التحديث.
const saidOf = s => s.said ?? [];
// من ذكر العنصر i من الموضوع الحالي، أو 0.
const by = (s, i) => saidOf(s).find(x => x.i === i)?.team ?? 0;
// رقما الفريقين. وحالة محفوظة من نسخة «رقماً رقماً» (bids بأصحابها): أعلى رقم لكل فريق.
const numsOf = s => s.nums ?? [1, 2].map(t => Math.max(0, ...(s.bids ?? []).filter(b => b.team === t).map(b => b.n)));
const size = s => current(s).items.length;
// القائمة حتى 20: عددها ظاهر للجمهور.
const shown = s => size(s) <= SHOW_SIZE;
// ما تجعله نقرة زر الفريق رقماً له: أعلى من رقمه ومن رقم خصمه.
const raised = (s, team) => { const [a, b] = numsOf(s); const own = team === 1 ? a : b, opp = team === 1 ? b : a; return Math.max(own, opp) + 1; };
const leader = s => { const [a, b] = numsOf(s); return a === b ? 0 : a > b ? 1 : 2; };
const topNum = s => Math.max(...numsOf(s));

function actions(s) {
  if (s.phase === 'intro') return [{ id: 'show', label: `اعرض الموضوع ${s.index + 1}` }];
  if (s.phase === 'bid') {
    // زر كل فريق يُظهر رقمه («زايد» قبل أول رقم)، ويصل الفعل «raise:1» أو «raise:2». ويغيب زر من بلغ طول القائمة.
    // و«ابدأ» بعد أول رقم.
    const nums = numsOf(s), acts = [];
    for (const team of [1, 2]) if (raised(s, team) <= size(s)) acts.push({ id: 'raise', team, label: nums[team - 1] ? String(nums[team - 1]) : 'زايد', n: nums[team - 1], next: raised(s, team) });
    if (leader(s)) acts.push({ id: 'start', label: 'ابدأ' });
    return acts;
  }
  // الوفاء: العنصر يُعدّ قبل «ابدأ» أيضاً (قد يبدأ الفريق قبل العدّاد، كزرّي الحكم في ش2).
  // «item:3» عنصر بموضعه من القائمة (نافذة المقدّم)، و«count» عنصر دون اسم (النافذة الواحدة: القائمة سرّ).
  const count = [{ id: 'item', label: 'عنصر' }, { id: 'count', label: 'صحيح · +1' }];
  if (s.phase === 'ready') return [{ id: 'start', label: 'ابدأ العدّاد' }, ...count, { id: 'stop', label: 'توقّف · لم يفِ' }];
  if (s.phase === 'fulfil') return [...count, { id: 'stop', label: 'توقّف · لم يفِ' }];
  if (s.phase === 'complete') return [{ id: 'stop', label: 'توقّف' }];
  if (s.phase === 'decided') return [{ id: 'next', label: s.index === s.topics.length - 1 ? 'إنهاء الجولة' : 'الموضوع التالي' }];
  return [];
}

function act(s, action) {
  const [id, arg] = String(action).split(':');
  // الموضوع التالي يظهر فوراً للمزايدة، ويفتتحه صاحبه (بالتناوب). وبعد الثالث تنتهي الجولة.
  if (id === 'next' && s.phase === 'decided') {
    const index = s.index + 1;
    if (index >= s.topics.length) return { state: { ...s, phase: 'end' }, events: [] };
    return { state: { ...s, index, phase: 'bid', team: 0, nums: [0, 0], commit: null, said: [] }, events: [] };
  }
  if (id === 'show') return { state: { ...s, phase: 'bid', team: 0, nums: [0, 0], commit: null, said: [] }, events: [] };
  // زر الفريق: رقمه فوق رقمه ورقم خصمه بواحد، ولا يتجاوز طول القائمة. والحدّ ثابت في المنتصف (3.0).
  if (id === 'raise' && s.phase === 'bid') {
    const team = Number(arg);
    if (team !== 1 && team !== 2) return { state: s, events: [] };
    const n = raised(s, team);
    if (n > size(s)) return { state: s, events: [] };
    const nums = numsOf(s).map((x, k) => (k === team - 1 ? n : x));
    return { state: { ...s, nums }, events: [{ type: 'moment', name: 'bid', team }] };
  }
  // «ابدأ»: يرسو المزاد على الأعلى، فيلتزم به ويبدأ عدّاد الوفاء فوراً.
  if (id === 'start' && s.phase === 'bid') {
    const team = leader(s);
    if (!team) return { state: s, events: [] };
    return { state: { ...s, phase: 'fulfil', team, commit: { team, n: topNum(s) }, said: [] }, events: [{ type: 'timer', seconds: FULFIL_SECONDS, resume: true }] };
  }
  if (id === 'start' && s.phase === 'ready') return { state: { ...s, phase: 'fulfil' }, events: [{ type: 'timer', seconds: FULFIL_SECONDS, resume: true }] };
  if (id === 'item' || id === 'count') {
    const i = id === 'item' ? Number(arg) : null;
    // لا مكرر (5.5): العنصر الذي ذُكر لا يُحسب ثانية، ولا موضع خارج القائمة.
    if (id === 'item' && (!/^\d+$/.test(arg ?? '') || i >= current(s).items.length || saidOf(s).some(x => x.i === i))) return { state: s, events: [] };
    const said = [...saidOf(s), { i, team: s.team }];
    // بلغ العدّ ما التزم به: يُحكم تلقائياً، فلا زر «وفى» (design/auction.md 4)، ويأخذ نقاطاً بعدد ما التزم به.
    if (said.length >= s.commit.n) {
      const result = { team: s.team, points: s.commit.n };
      return {
        state: { ...s, said, phase: 'decided', results: s.results.map((r, k) => (k === s.index ? result : r)) },
        events: [{ type: 'score', team: s.team, points: result.points }, { type: 'moment', name: 'right', team: s.team }],
      };
    }
    // والعدّاد يبقى يعدّ.
    return { state: { ...s, said }, events: [{ type: 'keep-timer' }, { type: 'moment', name: 'said', team: s.team }] };
  }
  // لم يفِ («توقّف» أو انتهى الوقت): يأخذ الخصم نقطتين ثابتتين، ولا يكمل القائمة (5.5، المالك).
  // والبطاقة تهتز، ثم يكتسح الحدّ إلى الخصم ويزيد رقمه (design/auction.md 2.5).
  // (وفي complete من نسخة سابقة: الدور عند الخصم، فيأخذ نقطتيه.)
  if ((id === 'stop' || id === 'timeout') && ['ready', 'fulfil', 'complete'].includes(s.phase)) {
    const team = s.phase === 'complete' ? s.team : other(s.team);
    const result = { team, points: FAIL_POINTS };
    return {
      state: { ...s, phase: 'decided', team, results: s.results.map((r, k) => (k === s.index ? result : r)) },
      events: [{ type: 'score', team, points: FAIL_POINTS }, { type: 'moment', name: 'fail', reason: id === 'timeout' ? 'timeout' : 'wrong', team }],
    };
  }
  return { state: s, events: [] };
}

// حصيلة الجولة لكل فريق: من وفى بعدد ما التزم به، والخصم بنقطتيه إن لم يفِ الملتزم (5.5).
function totals(s) {
  const sum = { 1: 0, 2: 0 };
  s.results.forEach((r, i) => { if (r?.team) sum[r.team] += r.points; });
  return sum;
}

// ما تعرضه نافذة الجمهور: الموضوع والأرقام بأصحابها، ومن الالتزام العدّ «0 من 12». لا القائمة ولا المستوى،
// ولا طولها إلا في المزايدة لقائمة حتى 20 («في القائمة 12»، 5.5).
function audience(s) {
  const t = current(s);
  const base = { first: s.first, count: s.topics.length, totals: totals(s) };
  if (s.phase === 'intro') return { ...base, screen: 'intro', turn: 0, rule: 'زايدوا على ما تقدرون على ذكره، ثم أوفوا', starter: 'ثلاثة مواضيع', unit: 'الموضوع' };
  if (s.phase === 'end' || !t) return { ...base, screen: 'end', turn: 0 };
  const result = s.phase === 'decided' ? s.results[s.index] : null;
  return {
    ...base,
    screen: 'topic',
    phase: s.phase,
    n: s.index + 1,
    topic: t.topic,
    // بعد الحكم: الحدّ عند من أخذ النقاط. وفي المزايدة في المنتصف (team 0).
    turn: result ? result.team : s.team,
    // رقما الفريقين في المزايدة، ومن لم يزايد بعد لا رقم له. والأعلى top.
    bids: s.phase === 'bid' ? numsOf(s).map((n, k) => ({ team: k + 1, n, top: n > 0 && n === topNum(s) })).filter(b => b.n) : [],
    commit: s.commit && { ...s.commit },
    // طول القائمة في المزايدة لقائمة حتى 20 وحدها.
    size: s.phase === 'bid' && shown(s) ? size(s) : undefined,
    // العدّ من الالتزام: ما ذُكر من العدد الملتزم به، بلون الملتزم.
    tally: s.commit ? { n: saidOf(s).length, of: s.commit.n, team: s.commit.team } : null,
    // ما ذُكر بأسمائه وأصحابه (قاله الفريق أمام القاعة). وما عُدّ دون اسم لا يظهر إلا في العدّ.
    said: saidOf(s).filter(x => x.i !== null).map(x => ({ name: t.items[x.i].name, team: x.team })),
    // العدّاد ثابت بوقته قبل «ابدأ».
    clock: FULFIL_SECONDS,
    verdict: result ? { ...result } : null,
    // بعد الحكم وحده: القائمة كلها (الإجابة، 7.1)، وكل عنصر بمن ذكره أو 0.
    list: result ? t.items.map((x, i) => ({ name: x.name, by: by(s, i) })) : undefined,
  };
}

// ما تعرضه نافذة المقدّم: ما يراه الجمهور، ومعه القائمة المرجعية بصيغها، وطولها، وملاحظة الكاتب، ومسار المواضيع.
function presenter(s) {
  const t = current(s);
  const hidden = s.phase === 'intro' || s.phase === 'end';
  return {
    ...audience(s),
    // المقدّم يرى الطول دائماً (design/auction.md 5)، وshown: أيظهر للجمهور.
    shown: hidden ? false : shown(s),
    level: hidden ? undefined : t?.level,
    items: hidden ? [] : t.items.map((x, i) => ({ name: x.name, alts: [...x.alts], by: by(s, i) })),
    size: hidden ? 0 : t.items.length,
    note: hidden ? '' : t.note,
    brief: `3 مواضيع. يزايد كل فريق فوق رقم خصمه بما يشاء (زرّه بلونه، كل نقرة +1)، و«ابدأ» يرسي على الأعلى. ولمن رسا عليه ${FULFIL_SECONDS} ثانية ليوفي، فإن لم يفِ أخذ خصمه ${FAIL_POINTS === 2 ? 'نقطتين' : `${FAIL_POINTS} نقاط`}.`,
    track: s.topics.map((x, i) => ({ owner: 0, result: s.results[i] === null ? null : s.results[i].team, now: !hidden && i === s.index })),
  };
}

export default {
  id: 'auction',
  name: 'المزاد',
  order: 3,
  contentKey: 'auction.json',
  setup, actions, act, audience, presenter,
  finished: s => s.phase === 'end',
  used: s => s.topics.map(t => t.id),
};
