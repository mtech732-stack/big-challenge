// النمط الثالث: «المزاد» (القسم 5.5 من الوثيقة، وتصميمه design/auction.md). وحدة تلتزم «عقد الوحدة».
// 3 مواضيع في الجولة: سهل ثم متوسط ثم صعب.
// المزايدة حرة فوق رقم الخصم (قاعدة المالك، 5.5 وdesign/auction.md 3.0): لكل فريق رقم يبدأ 0، ونقرة زره «raise:1» ترفعه
// إلى max(رقمه + 1، رقم خصمه + 1)، فأول نقرة رقم الخصم + 1 وكل نقرة بعدها +1، ولا تساوي. ولا يتجاوز رقمٌ طول القائمة.
// و«ابدأ» يرسي المزاد على الأعلى ويبدأ عدّاد الوفاء فوراً. وطول القائمة لا يظهر للجمهور أبداً.
// والقائمة المرجعية لا تصل إلى الجمهور قبل «كشف القائمة» (7.1)، والأسماء المذكورة لا تظهر على التلفاز (1.14).
// ثم الوفاء (الوثيقة 1.14، design/s8c.md): المقدّم يقارن ما يُذكر بقائمة الباركود، و«عُدّ · +1» عدّاد مساعد لا حكم.
// و«كشف القائمة» في أي لحظة يوقف الوقت ويُظهر القائمة للجمهور، ثم «وفى» (نقاط بعدد ما التزم به) أو «لم يفِ» (نقطتان للخصم، لا إكمال).
// ثم «الموضوع التالي» حتى الثالث، و«إنهاء الجولة».
import { freshFirst, besides } from '../round.js';

// وقت الوفاء 45 ثابتاً لكل القوائم (المالك، 30 أكتوبر 2026: «ابق التوقيت ثابت كما هو لكل القوائم»)، ونقطتان للخصم إن لم يفِ الملتزم (5.5 و12).
export const FULFIL_SECONDS = 45;
export const FAIL_POINTS = 2;
// الموضوع المفتوح (open) لا تحدّه قائمته: المزايدة فوق طولها حتى هذا الرقم.
export const OPEN_MAX = 99;
// المطابقة (design/auction.md 5، 4.0): بلا تشكيل ولا همزات ولا «ال» في أول الكلمة، والتاء المربوطة هاءً والألف المقصورة ياءً.
// بها يرشّح المقدّم القائمة، ولا يتكرر نص واحد من خارجها.
export const norm = s => String(s).normalize('NFKD').replace(/[ً-ٰٟـ]/g, '').replace(/[أإآٱ]/g, 'ا').replace(/ة/g, 'ه').replace(/ى/g, 'ي')
  .replace(/ؤ/g, 'و').replace(/ئ/g, 'ي').replace(/(^|\s)ال/g, '$1').replace(/\s+/g, ' ').trim();
const LEVELS = ['easy', 'medium', 'hard'];
const other = team => (team === 1 ? 2 : 1);

// الحالات: intro افتتاح الجولة · bid المزايدة · fulfil عدّاد الملتزم (over: انقضى وقته ولم يُكشف) · revealed كُشفت القائمة
// · decided انتهى الموضوع · end انتهت الجولة.
// (و ready من نسخة سابقة: الالتزام قبل «ابدأ»، و complete فيها «إكمال الخصم»: تُكملان كما كانتا.)
// nums: [رقم الأول، رقم الثاني] في المزايدة (0 لمن لم يزايد) · team: 0 في المزايدة (الحدّ في المنتصف)، ثم الملتزم
// · commit: { team, n } من رسا عليه المزاد ورقمه
// · said: ما ذُكر بالترتيب { i, team }، وi موضع العنصر في القائمة، أو null إن عُدّ دون عنصر منها:
//   بلا نص («صحيحة · +1») أو بنص ما كُتب من خارجها { i: null, team, text } (design/auction.md 4.1)
// · results[i]: { team, points } من أخذ نقاط الموضوع i (team 0 إن لم يأخذها أحد)، أو null ما لم ينتهِ.
// avoid: مواضيع تتقاطع مع قائمة ترتيب اختيرت في المباراة (تدقيق ش5 «ثالثاً»).
function setup({ content, first, seen = [], avoid = [], rng = Math.random }) {
  const bank = content?.topics ?? [];
  const topics = LEVELS.map((l, i) => {
    const t = freshFirst(besides(bank.filter(x => x.level === l), avoid), seen, 1, rng)[0];
    return t && { id: t.id, level: t.level, topic: t.topic, open: !!t.open, items: t.items.map(x => ({ name: x.name, alts: x.alts ?? [] })), note: t.note ?? '' };
  }).filter(Boolean);
  return { first, topics, index: 0, phase: 'intro', team: 0, nums: [0, 0], commit: null, said: [], results: topics.map(() => null) };
}

const current = s => s.topics[s.index];
// حالة محفوظة من مرحلة «المزايدة» بلا said، كي تكمل مباراة جارية بعد التحديث.
const saidOf = s => s.said ?? [];
// رقما الفريقين. وحالة محفوظة من نسخة «رقماً رقماً» (bids بأصحابها): أعلى رقم لكل فريق.
const numsOf = s => s.nums ?? [1, 2].map(t => Math.max(0, ...(s.bids ?? []).filter(b => b.team === t).map(b => b.n)));
const size = s => current(s).items.length;
// أعلى رقم في المزايدة: طول القائمة، والمفتوح لا تحدّه قائمته (لا إغلاق آلياً عند طولها).
const cap = s => (current(s).open ? OPEN_MAX : size(s));
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
    for (const team of [1, 2]) if (raised(s, team) <= cap(s)) acts.push({ id: 'raise', team, label: nums[team - 1] ? String(nums[team - 1]) : 'زايد', n: nums[team - 1], next: raised(s, team) });
    if (leader(s)) acts.push({ id: 'start', label: 'ابدأ' });
    return acts;
  }
  // الوفاء (1.14): «عُدّ · +1» عدّاد مساعد، ويبقى بعد انقضاء الوقت (قد يتأخر المقدّم في العدّ عن سرد سريع)، و«كشف القائمة» في أي لحظة.
  // ثم بعد الكشف «وفى» أو «لم يفِ»، ولا حكم قبله. (و ready وcomplete من نسخ سابقة تُكملان: «ابدأ العدّاد»، و«توقّف».)
  const narrate = [{ id: 'count', label: 'عُدّ · +1' }, { id: 'reveal', label: 'كشف القائمة' }];
  if (s.phase === 'ready') return [{ id: 'start', label: 'ابدأ العدّاد' }, ...narrate];
  if (s.phase === 'fulfil') return narrate;
  if (s.phase === 'revealed') return [{ id: 'ok', label: 'وفى' }, { id: 'fail', label: 'لم يفِ' }];
  if (s.phase === 'complete') return [{ id: 'stop', label: 'توقّف' }];
  if (s.phase === 'decided') return [{ id: 'next', label: s.index === s.topics.length - 1 ? 'إنهاء الجولة' : 'الموضوع التالي' }];
  return [];
}

function act(s, action) {
  // النص بعد أول «:» كله (قد يكون فيه «:» في «out:نص»).
  const at = String(action).indexOf(':');
  const id = at < 0 ? String(action) : String(action).slice(0, at), arg = at < 0 ? undefined : String(action).slice(at + 1);
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
    if (n > cap(s)) return { state: s, events: [] };
    const nums = numsOf(s).map((x, k) => (k === team - 1 ? n : x));
    return { state: { ...s, nums }, events: [{ type: 'moment', name: 'bid', team }] };
  }
  // «ابدأ»: يرسو المزاد على الأعلى، فيلتزم به ويبدأ عدّاد الوفاء فوراً.
  if (id === 'start' && s.phase === 'bid') {
    const team = leader(s);
    if (!team) return { state: s, events: [] };
    const n = topNum(s);
    return { state: { ...s, phase: 'fulfil', team, commit: { team, n }, said: [] }, events: [{ type: 'timer', seconds: FULFIL_SECONDS, resume: true }] };
  }
  if (id === 'start' && s.phase === 'ready') return { state: { ...s, phase: 'fulfil' }, events: [{ type: 'timer', seconds: FULFIL_SECONDS, resume: true }] };
  // «عُدّ · +1»: عدّة دون اسم، والعدّاد يبقى يعدّ. ولا يحكم ولو بلغ ما التزم به (1.14). وبعد انقضاء الوقت يُعدّ ولا عدّاد.
  if (id === 'count' && ['ready', 'fulfil'].includes(s.phase)) {
    return { state: { ...s, said: [...saidOf(s), { i: null, team: s.team }] }, events: [{ type: 'keep-timer' }, { type: 'moment', name: 'said', team: s.team }] };
  }
  // انقضى وقت الملتزم: يقف الوقت ولا حكم، فيبقى العدّ والكشف (1.14).
  if (id === 'timeout' && s.phase === 'fulfil') return { state: { ...s, over: true }, events: [] };
  // «كشف القائمة»: يقف الوقت (فعل بلا keep-timer)، وتظهر القائمة للجمهور.
  if (id === 'reveal' && ['ready', 'fulfil'].includes(s.phase)) return { state: { ...s, phase: 'revealed' }, events: [] };
  // «وفى»: يأخذ الملتزم نقاطاً بعدد ما التزم به. «لم يفِ»: يأخذ الخصم نقطتين ثابتتين، ولا يكمل القائمة (5.5، المالك).
  // والبطاقة تهتز مع «لم يفِ»، ثم يكتسح الحدّ إلى الخصم ويزيد رقمه (design/auction.md 2.5).
  if ((id === 'ok' || id === 'fail') && s.phase === 'revealed') {
    const kept = id === 'ok', team = kept ? s.team : other(s.team);
    const result = { team, points: kept ? s.commit.n : FAIL_POINTS, kept };
    return {
      state: { ...s, phase: 'decided', team, results: s.results.map((r, k) => (k === s.index ? result : r)) },
      events: [{ type: 'score', team, points: result.points }, kept ? { type: 'moment', name: 'right', team } : { type: 'moment', name: 'fail', reason: 'wrong', team }],
    };
  }
  // «توقّف» في «إكمال» من نسخة سابقة: الدور عند الخصم، فيأخذ نقطتيه.
  if (id === 'stop' && s.phase === 'complete') {
    const result = { team: s.team, points: FAIL_POINTS };
    return {
      state: { ...s, phase: 'decided', results: s.results.map((r, k) => (k === s.index ? result : r)) },
      events: [{ type: 'score', team: s.team, points: FAIL_POINTS }, { type: 'moment', name: 'fail', reason: 'wrong', team: s.team }],
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

// ما تعرضه نافذة الجمهور: الموضوع والأرقام بأصحابها، ومن الالتزام العدّ «0 من 12»، ومن الكشف القائمة. ولا المستوى،
// ولا الأسماء المذكورة (1.14).
function audience(s) {
  const t = current(s);
  const base = { first: s.first, count: s.topics.length, totals: totals(s) };
  if (s.phase === 'intro') return { ...base, screen: 'intro', turn: 0, rule: 'زايدوا على ما تقدرون على ذكره، ثم أوفوا', starter: 'ثلاثة مواضيع', unit: 'الموضوع' };
  if (s.phase === 'end' || !t) return { ...base, screen: 'end', turn: 0 };
  const result = s.phase === 'decided' ? s.results[s.index] : null;
  const open = s.phase === 'revealed' || s.phase === 'decided';
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
    // العدّ أثناء السرد: ما عُدّ من العدد الملتزم به، بلون الملتزم. ويغيب عند الكشف، فليس حكماً (design/s8c.md 1).
    tally: s.commit && !open ? { n: saidOf(s).length, of: s.commit.n, team: s.commit.team } : null,
    // انقضى الوقت ولم يُكشف: الإطار يغيب، ويبقى العدّ والكشف.
    over: !!s.over,
    // العدّاد ثابت بوقته قبل «ابدأ».
    clock: FULFIL_SECONDS,
    verdict: result ? { ...result } : null,
    // بعد «كشف القائمة»: القائمة المرجعية بأسمائها وترتيبها، صفحاتٍ على البطاقة. ولا الأسماء المذكورة (1.14).
    ...(open ? { list: t.items.map(x => x.name) } : {}),
    reveal: open,
  };
}

// ما لا يصل إلى الجمهور: الموضوع وقائمته بصيغها، نصّ باركود الإجابات (js/qr.js). ولا قائمة في الافتتاح والنهاية.
function presenter(s) {
  const t = current(s);
  if (s.phase === 'intro' || s.phase === 'end' || !t) return { topic: '', items: [] };
  return { topic: t.topic, items: t.items.map(x => ({ name: x.name, alts: [...x.alts] })) };
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
