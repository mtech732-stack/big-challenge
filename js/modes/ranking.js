// النمط الرابع: «الترتيب» (القسم 5.6 من الوثيقة، وتصميمه design/ranking.md). وحدة تلتزم «عقد الوحدة».
// قائمتان في الجولة: الأولى سهلة، والثانية صعبة. كل قائمة 13 عنصراً مرتبة: 1 إلى 10 خانات ظاهرة، و11 و12 و13 فخاخ مخفية.
// إجابة لكل فريق بالتتابع، 15 ثانية لكل إجابة. والعنصر الصحيح يُكشف في خانته، ويأخذ صاحبه نقاطاً بقدر رقمها.
// ونهاية القائمة حين تنكشف العشرة، أو بـ «أنهِ القائمة» حين يعجز الفريقان، ثم تنكشف بقيتها والمراكز المخفية للجميع.
// والقائمة لا تصل إلى الجمهور قبل نهايتها: ما كُشف وحده (7.1).
// والمراكز 11 و12 و13 فخاخ: من ذكر عنصرها خُصم منه 3 و2 و1، ولا ينزل رصيده تحت الصفر.
// والخطأ (ليس في القائمة، أو مكرر، أو انتهى الوقت) ينقل الإجابة إلى الخصم ليسرق في 5 ثوانٍ.
// والنافذة الواحدة (المالك، design/ranking.md 4): لا حكم في أثناء القائمة لأن المقدّم لا يراها. «ابدأ» فيها `start:one`،
// و«التالي» ينقل الدور، وبعد النهاية «المقارنة»: ينقر المقدّم كل خانة لمن قالها أولاً (التسجيل خارج اللعبة)، ثم «اعتمد النقاط».
// ولكل قائمة 5 دقائق تجري من «ابدأ» حتى نهايتها بلا توقف (5.6، design/ranking.md 7.8)، فإن انقضت انتهت القائمة.
// والقائمة الثانية بعد الأولى، يبدأها الفريق الآخر.
import { freshFirst, besides } from '../round.js';
import { sharedItems, CLASH_MIN } from '../content-check.js';

// وقت الإجابة (مبدئي، يُضبط في ش8).
export const ANSWER_SECONDS = 15;
export const STEAL_SECONDS = 5;
// وقت القائمة (5.6): القائمتان معاً لا تتجاوزان 10 دقائق، حدّ الجولة.
export const LIST_SECONDS = 300;
export const SLOTS = 10;
// خصم الفخ بمركزه (5.6).
export const PENALTY = { 11: 3, 12: 2, 13: 1 };
const LEVELS = ['easy', 'hard'];
const other = team => (team === 1 ? 2 : 1);

// الحالات: intro افتتاح الجولة · read ظهور القائمة قبل «ابدأ» · ask عدّاد صاحب الدور · steal عدّاد الخصم بعد الخطأ · decided بعد الحكم
// · mark المقارنة بالتسجيل في النافذة الواحدة · listend نهاية القائمة (تنكشف كلها) · end انتهت الجولة.
// one: القائمة تُلعب بنافذة واحدة · marks: { رتبة: فريق } في المقارنة · listEnds: متى ينقضي وقت القائمة (ms بساعة الجهاز)
// · timeup: انتهت القائمة بانقضاء وقتها.
// team: صاحب الدور الآن (والسارق في steal) · steal: { team, reason } من انتقلت إليه الإجابة ولماذا ('wrong' أو 'timeout') · got[i]: ما كُشف من القائمة i بالترتيب { rank, team, points } (والفخ بما خُصم منه فعلاً) · verdict: حكم الإجابة الأخيرة
// { team, points, rank } (team 0 ورتبة 0 إن لم يأخذ أحد شيئاً، ورتبة فوق 10 للفخ) · starts[i]: من بدأ القائمة i.
// avoid: قوائم تتقاطع مع موضوع مزاد أو سؤال اختير في المباراة (تدقيق ش5 «ثالثاً» و«رابعاً»).
// والقائمة الثانية لا تشترك مع الأولى في 7 عناصر فأكثر («خامساً»)، فلا تكشف الأولى إجابات الثانية.
function setup({ content, first, seen = [], avoid = [], rng = Math.random }) {
  const bank = content?.lists ?? [];
  const picked = [];
  for (const l of LEVELS) {
    const near = bank.filter(x => picked.some(p => sharedItems(p, x) >= CLASH_MIN)).map(x => x.id);
    const t = freshFirst(besides(bank.filter(x => x.level === l), [...avoid, ...near]), seen, 1, rng)[0];
    if (t) picked.push(t);
  }
  const lists = picked.map(t => ({ id: t.id, level: t.level, title: t.title, items: t.items.map(x => ({ name: x.name, alts: x.alts ?? [] })) }));
  return { first, lists, index: 0, phase: 'intro', team: first, got: lists.map(() => []), verdict: null, steal: null, one: false, marks: {}, listEnds: null, timeup: false, starts: [first, other(first)] };
}

const current = s => s.lists[s.index];
const gotOf = s => s.got[s.index] ?? [];
const found = s => gotOf(s).filter(g => g.rank <= SLOTS).length;
const isGot = (s, rank) => gotOf(s).some(g => g.rank === rank);
const last = s => s.index === s.lists.length - 1;

function actions(s) {
  if (s.phase === 'intro') return [{ id: 'show', label: `اعرض القائمة ${s.index + 1}` }];
  const finish = { id: 'finish', label: 'أنهِ القائمة' };
  if (s.phase === 'read') return [{ id: 'start', label: `ابدأ العدّاد · ${ANSWER_SECONDS} ثانية` }, finish];
  // في العدّاد: ينقر المقدّم ما قاله الفريق (item:رتبته، والفخ 11 إلى 13)، أو «خطأ» لما ليس في القائمة أو المكرر. وانتهاء الوقت خطأ.
  // وفي السرقة الأزرار نفسها للسارق.
  // وبنافذة واحدة: «التالي» ينقل الدور بلا حكم، و«أنهِ القائمة».
  if (s.phase === 'ask' && s.one) return [{ id: 'pass', label: 'التالي' }, finish];
  if (s.phase === 'ask' || s.phase === 'steal') return [{ id: 'item', label: 'عنصر' }, { id: 'wrong', label: 'خطأ · ليس في القائمة أو مكرر' }];
  // بعد الحكم: دور الخصم، أو نهاية القائمة. وإن انكشفت العشرة فنهايتها وحدها (5.6).
  if (s.phase === 'decided') return found(s) >= SLOTS ? [finish] : [{ id: 'next', label: 'التالي' }, finish];
  // المقارنة: الخانة تُنقر (mark:رتبتها) فيدوّر صاحبها، ثم «اعتمد النقاط».
  if (s.phase === 'mark') return [{ id: 'mark', label: 'خانة' }, { id: 'commit', label: 'اعتمد النقاط' }];
  if (s.phase === 'listend') return [{ id: 'next', label: last(s) ? 'إنهاء الجولة' : `القائمة ${s.index + 2} · الأخيرة` }];
  return [];
}

// scores: رصيد الفريقين قبل الفعل، يمرّره مشغّل الجولة، فيُكتب خصم الفخ بما خُصم فعلاً (design/ranking.md 7.7).
// now: ساعة الجهاز (ms) من المشغّل، لوقت القائمة.
function act(s, action, scores = {}, now = Date.now()) {
  const [id, arg] = String(action).split(':');
  if (id === 'show' && s.phase === 'intro') return { state: { ...s, phase: 'read', team: s.starts[s.index] ?? s.first, verdict: null }, events: [] };
  // «ابدأ»: يبدأ عدّاد الإجابة، ووقت القائمة (5 دقائق) معه.
  if (id === 'start' && s.phase === 'read') {
    return { state: { ...s, phase: 'ask', one: arg === 'one', listEnds: now + LIST_SECONDS * 1000 }, events: [{ type: 'timer', seconds: ANSWER_SECONDS }] };
  }
  // انقضى وقت القائمة (يرسله المقدّم حين يحين): تنتهي القائمة أياً كانت حالها، أو تبدأ المقارنة بنافذة واحدة.
  // ولا يُقبل قبل وقته (ثانية للفرق بين الساعتين).
  if (id === 'timeup' && ['ask', 'steal', 'decided'].includes(s.phase) && s.listEnds && now >= s.listEnds - 1000) {
    const end = s.one ? { phase: 'mark', marks: {} } : { phase: 'listend' };
    return { state: { ...s, ...end, team: 0, verdict: null, steal: null, timeup: true }, events: [] };
  }
  // النافذة الواحدة: «التالي» أو انتهاء الوقت ينقل الدور ويعيد عدّاد الإجابة. لا خطأ يُعرف قبل النهاية، فلا انتقال للإجابة.
  if ((id === 'pass' || id === 'timeout') && s.phase === 'ask' && s.one) {
    return { state: { ...s, team: other(s.team) }, events: [{ type: 'timer', seconds: ANSWER_SECONDS }] };
  }
  // ونهايتها: تنكشف القائمة كلها، وتبدأ المقارنة.
  if (id === 'finish' && s.phase === 'ask' && s.one) return { state: { ...s, phase: 'mark', team: 0, marks: {} }, events: [] };
  // المقارنة: النقر يدوّر صاحب الخانة: لا أحد ← الأول ← الثاني ← لا أحد.
  if (id === 'mark' && s.phase === 'mark') {
    const rank = Number(arg);
    if (!/^\d+$/.test(arg ?? '') || rank < 1 || rank > current(s).items.length) return { state: s, events: [] };
    const now = s.marks[rank] ?? 0, next = (now + 1) % 3;
    const marks = { ...s.marks };
    if (next) marks[rank] = next; else delete marks[rank];
    return { state: { ...s, marks }, events: [] };
  }
  // «اعتمد النقاط»: لكل فريق رتب خاناته، ناقص خصم فخاخه بما عنده (لا رصيد تحت الصفر، الوثيقة 8). ثم نهاية القائمة كما في النافذتين.
  if (id === 'commit' && s.phase === 'mark') {
    const left = { 1: scores[1] ?? 0, 2: scores[2] ?? 0 }, hits = [];
    const marked = Object.entries(s.marks).map(([r, team]) => ({ rank: Number(r), team })).sort((a, b) => a.rank - b.rank);
    for (const m of marked.filter(m => m.rank <= SLOTS)) { hits.push({ ...m, points: m.rank }); left[m.team] += m.rank; }
    for (const m of marked.filter(m => m.rank > SLOTS)) { const take = Math.min(PENALTY[m.rank], left[m.team]); left[m.team] -= take; hits.push({ ...m, points: -take }); }
    const net = t => hits.filter(h => h.team === t).reduce((a, h) => a + h.points, 0);
    return {
      state: { ...s, phase: 'listend', marks: {}, got: s.got.map((g, i) => (i === s.index ? hits : g)) },
      events: [1, 2].filter(t => net(t)).map(t => ({ type: 'score', team: t, points: net(t) })),
    };
  }
  // العنصر الصحيح: يُكشف في خانته بلون صاحب الدور، ونقاطه رتبته. ولا يُكشف ثانية (المكرر خطأ، تحكم به «خطأ»).
  if (id === 'item' && (s.phase === 'ask' || s.phase === 'steal')) {
    const rank = Number(arg);
    if (!/^\d+$/.test(arg ?? '') || rank < 1 || rank > current(s).items.length || isGot(s, rank)) return { state: s, events: [] };
    // الفخ: يُخصم بمركزه، وبما عند الفريق إن كان أقل. والخانة تبقى بخصمها الأصلي، والحكم بما خُصم فعلاً.
    const trap = rank > SLOTS;
    const points = trap ? -Math.min(PENALTY[rank], scores[s.team] ?? PENALTY[rank]) : rank;
    const hit = { rank, team: s.team, points };
    return {
      state: { ...s, phase: 'decided', got: s.got.map((g, i) => (i === s.index ? [...g, hit] : g)), verdict: { team: s.team, points, rank }, steal: null },
      events: [
        ...(points ? [{ type: 'score', team: s.team, points }] : []),
        { type: 'moment', name: trap ? 'trap' : 'right', team: s.team, rank },
      ],
    };
  }
  // خطأ أو انتهى الوقت: لا نقاط، وتنتقل الإجابة إلى الخصم ليسرق في 5 ثوانٍ (5.6). لا حكم يُعلن بعد، فالقائمة كما هي.
  if ((id === 'wrong' || id === 'timeout') && s.phase === 'ask') {
    const thief = other(s.team), reason = id;
    return {
      state: { ...s, phase: 'steal', team: thief, steal: { team: thief, reason } },
      events: [{ type: 'timer', seconds: STEAL_SECONDS }, { type: 'moment', name: 'steal', reason, team: thief }],
    };
  }
  // وأخطأ السارق أو انتهى وقته: لا نقاط، و«لم تُكشف خانة».
  if ((id === 'wrong' || id === 'timeout') && s.phase === 'steal') {
    return { state: { ...s, phase: 'decided', verdict: { team: 0, points: 0, rank: 0 }, steal: null }, events: [{ type: 'moment', name: 'none' }] };
  }
  // التالي: دور الخصم، وعدّاده يبدأ فوراً (القائمة ظاهرة من قبل، فلا قراءة بين الإجابتين).
  // والخصم خصم آخر من أجاب: بعد السرقة يعود الدور إلى من أخطأ، فالإجابات بالتتابع (5.6) والسرقة إجابة السارق.
  if (id === 'next' && s.phase === 'decided' && found(s) < SLOTS) {
    return { state: { ...s, phase: 'ask', team: other(s.team), verdict: null }, events: [{ type: 'timer', seconds: ANSWER_SECONDS }] };
  }
  // نهاية القائمة: يعجز الفريقان («أنهِ القائمة») أو تنكشف العشرة. فتنكشف القائمة كلها للجميع.
  if (id === 'finish' && (s.phase === 'read' || s.phase === 'decided')) return { state: { ...s, phase: 'listend', team: 0, verdict: null }, events: [] };
  // بعد نهاية القائمة: القائمة الثانية تظهر مباشرة لمن يبدأها (الفريق الآخر)، أو نهاية الجولة.
  if (id === 'next' && s.phase === 'listend' && !last(s)) {
    const index = s.index + 1;
    return { state: { ...s, index, phase: 'read', team: s.starts[index], verdict: null, steal: null, one: false, marks: {}, listEnds: null, timeup: false }, events: [] };
  }
  if (id === 'next' && s.phase === 'listend') return { state: { ...s, phase: 'end', team: 0 }, events: [] };
  return { state: s, events: [] };
}

// حصيلة الجولة لكل فريق: نقاط ما كشفه في القائمتين.
function totals(s) {
  const sum = { 1: 0, 2: 0 };
  for (const list of s.got) for (const g of list) sum[g.team] += g.points;
  return sum;
}

// ما تعرضه نافذة الجمهور: العنوان، والخانات العشر بما كُشف منها (رتبة، اسم، فريق). لا اسم لما لم يُكشف، ولا رتبة لفخ
// لم يقع فيه أحد (design/ranking.md 7.4). وبعد نهاية القائمة: القائمة كلها، والفخاخ.
function audience(s) {
  const t = current(s);
  const base = { first: s.first, count: s.lists.length, totals: totals(s) };
  if (s.phase === 'intro') return { ...base, screen: 'intro', turn: 0, rule: 'اذكروا ما في القائمة: كلما بعُد عن الأول زادت نقاطه', starter: 'قائمتان، وخلف كل قائمة ثلاثة فخاخ' };
  if (s.phase === 'end' || !t) return { ...base, screen: 'end', turn: 0 };
  const reveal = s.phase === 'listend' || s.phase === 'mark';
  // وفي المقارنة: صاحب كل خانة كما نقرها المقدّم حتى الآن.
  const by = s.phase === 'mark' ? new Map(Object.entries(s.marks).map(([r, t]) => [Number(r), t])) : new Map(gotOf(s).map(g => [g.rank, g.team]));
  const slots = t.items.map((x, i) => {
    const rank = i + 1, team = by.get(rank) ?? 0, trap = rank > SLOTS;
    if (trap && !team && !reveal) return { trap: true };
    return { rank, trap, team, ...(team || reveal ? { name: x.name } : {}) };
  });
  const v = s.phase === 'decided' ? s.verdict : null;
  return {
    ...base,
    screen: 'list',
    phase: s.phase,
    n: s.index + 1,
    title: t.title,
    slots,
    // الرتبة التي كُشفت الآن (للحركة).
    fresh: v?.rank || 0,
    // بعد الحكم: الحدّ عند من أخذ النقاط، أو في المنتصف (لا نقاط، والفخ). وفي نهاية القائمة في المنتصف.
    turn: v ? (v.rank > SLOTS ? 0 : v.team) : reveal ? 0 : s.team,
    // العدّاد ثابت بوقته قبل «ابدأ»، و5 في السرقة.
    clock: s.phase === 'steal' ? STEAL_SECONDS : ANSWER_SECONDS,
    verdict: v ? { ...v } : null,
    found: found(s),
    of: SLOTS,
    // تُلعب بنافذة واحدة (لا حكم في أثنائها، والمقارنة بعدها).
    one: !!s.one,
    // وقت القائمة: 5:00 ثابتاً قبل «ابدأ»، ثم يجري حتى listEnds، ويُخفى بعد النهاية. وtimeup: انتهت بانقضائه.
    listSeconds: LIST_SECONDS,
    listEnds: ['ask', 'steal', 'decided'].includes(s.phase) ? s.listEnds : null,
    listClock: s.phase === 'read' || ['ask', 'steal', 'decided'].includes(s.phase),
    timeup: !!s.timeup,
  };
}

// ما تعرضه نافذة المقدّم: ما يراه الجمهور، ومعه القائمة كاملة (13) بصيغها، وكل عنصر بمن كشفه، ومسار القائمتين.
function presenter(s) {
  const t = current(s);
  const hidden = s.phase === 'intro' || s.phase === 'end';
  const a = audience(s);
  const by = new Map((a.slots ?? []).filter(x => x.team).map(x => [x.rank, x.team]));
  return {
    ...a,
    level: hidden ? undefined : t?.level,
    // بعد الحكم: من دوره بعد «التالي» (الخصم).
    upNext: s.phase === 'decided' ? other(s.team) : 0,
    // في السرقة: لماذا انتقلت الإجابة (سطر الحالة «بعد الخطأ · 0:03»).
    steal: s.phase === 'steal' ? { ...s.steal } : null,
    items: hidden ? [] : t.items.map((x, i) => ({ rank: i + 1, name: x.name, alts: [...x.alts], trap: i >= SLOTS, by: by.get(i + 1) ?? 0 })),
    brief: `قائمتان، لكل منهما ${LIST_SECONDS / 60} دقائق. إجابة لكل فريق بالتتابع، ${ANSWER_SECONDS} ثانية لكل إجابة. انقر ما قاله الفريق فتنكشف خانته بنقاط رقمها، والفخاخ تخصم 3 و2 و1، أو «خطأ» فتنتقل الإجابة إلى الخصم ${STEAL_SECONDS} ثوانٍ.`,
    track: s.lists.map((x, i) => ({ owner: s.starts[i] ?? 0, result: null, now: !hidden && i === s.index })),
  };
}

export default {
  id: 'ranking',
  name: 'الترتيب',
  order: 4,
  contentKey: 'ranking.json',
  setup, actions, act, audience, presenter,
  finished: s => s.phase === 'end',
  used: s => s.lists.map(t => t.id),
};
