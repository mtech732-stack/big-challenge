// النمط الرابع: «الترتيب» (القسم 5.6 من الوثيقة، وتصميمه design/ranking.md). وحدة تلتزم «عقد الوحدة».
// قائمتان في الجولة: الأولى سهلة، والثانية صعبة. كل قائمة 13 خانة ظاهرة الأرقام مخفية المحتوى: 1 إلى 10 مرتبة، و11 و12 و13 فخاخ.
// إجابة لكل فريق بالتتابع، 15 ثانية لكل إجابة. والتحكيم مباشر (الوثيقة 5.6، 1.7، design/s8.md 3): ينقر المقدّم رقم الخانة التي قالها الفريق،
// فتنكشف بلونه ويأخذ نقاطها رقمها، ثم الدور للخصم. والفخ يُخصم رقمه (−11 و−12 و−13)، ولا ينزل الرصيد تحت الصفر.
// و«خطأ» (ليس في القائمة أو مكرر): صفر، ويختار المقدّم لون الدور التالي. وانتهاء وقت الإجابة ينقل الدور إلى الخصم بعدّاده.
// ونهاية القائمة حين تنكشف العشرة، أو بـ «أنهِ القائمة» حين يعجز الفريقان، أو تنقضي دقيقتان ونصف تجري من «ابدأ» بلا توقف،
// ثم تنكشف بقيتها والفخاخ للجميع. والقائمة لا تصل إلى الجمهور قبل نهايتها: ما كُشف وحده (7.1).
// والقائمة الثانية بعد الأولى، يبدأها الفريق الآخر.
import { freshFirst, besides } from '../round.js';
import { sharedItems, CLASH_MIN } from '../content-check.js';

// وقت الإجابة (5.6 و12)، ومثله لكل دور بعد الخطأ أو انتهاء الوقت.
export const ANSWER_SECONDS = 15;
// وقت القائمة (5.6 و12): دقيقتان ونصف تنازلياً. ولا حدّ للجولة (1.6).
export const LIST_SECONDS = 150;
export const SLOTS = 10;
// خصم الفخ رقمه بالسالب (5.6 و12، 1.5).
export const PENALTY = { 11: 11, 12: 12, 13: 13 };
const LEVELS = ['easy', 'hard'];
const other = team => (team === 1 ? 2 : 1);

// الحالات: intro افتتاح الجولة · read ظهور القائمة قبل «ابدأ» · ask عدّاد صاحب الدور (يُنقر رقم الخانة، أو «خطأ»)
// · hit لحظة 1.2 ثانية بعد إصابة خانة أو فخ، ثم الدور للخصم تلقائياً («turn» بلا زر)
// · wrong بعد «خطأ»: يقف العدّاد، ويختار المقدّم لون الدور التالي (turn:1 أو turn:2) · listend نهاية القائمة (تنكشف كلها) · end انتهت الجولة.
// التحكيم مباشر في أثناء القائمة بالنافذتين وبالواحدة (الوثيقة 5.6، 1.7، design/s8.md 3): لا تسجيل ولا مقارنة بعد نهايتها.
// listEnds: متى ينقضي وقت القائمة (ms بساعة الجهاز) · timeup: انتهت القائمة بانقضاء وقتها · at: متى بدأت لحظة الإصابة.
// team: صاحب الدور الآن · got[i]: ما كُشف من القائمة i بالترتيب { rank, team, points } (والفخ بما خُصم منه فعلاً) · verdict: حكم الإجابة الأخيرة
// { team, points, rank } (team 0 ورتبة 0 للخطأ، ورتبة فوق 10 للفخ) · starts[i]: من بدأ القائمة i.
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
  return { first, lists, index: 0, phase: 'intro', team: first, got: lists.map(() => []), verdict: null, at: null, listEnds: null, timeup: false, starts: [first, other(first)] };
}

// لحظة الإصابة قبل أن ينتقل الدور (design/s8.md 3.2).
export const HIT_MS = 1200;
const current = s => s.lists[s.index];
const gotOf = s => s.got[s.index] ?? [];
const found = s => gotOf(s).filter(g => g.rank <= SLOTS).length;
const isGot = (s, rank) => gotOf(s).some(g => g.rank === rank);
const last = s => s.index === s.lists.length - 1;
// حالات قديمة محفوظة قبل ش8 (السرقة والحكم والمقارنة): تُقرأ بما يقابلها، فلا تعلق مباراة جارية.
const OLD = { steal: 'ask', decided: 'hit', mark: 'wrong' };
const norm = s => (OLD[s.phase] ? { ...s, phase: OLD[s.phase], at: s.at ?? 0 } : s);
const running = s => ['ask', 'hit', 'wrong'].includes(s.phase);

function actions(st) {
  const s = norm(st);
  if (s.phase === 'intro') return [{ id: 'show', label: `اعرض القائمة ${s.index + 1}` }];
  const finish = { id: 'finish', label: 'أنهِ القائمة' };
  if (s.phase === 'read') return [{ id: 'start', label: 'ابدأ' }, finish];
  // في العدّاد: ينقر المقدّم رقم الخانة التي قالها الفريق (item:رتبتها، والفخ 11 إلى 13)، أو «خطأ» لما ليس في القائمة أو المكرر.
  if (s.phase === 'ask') return [{ id: 'item', label: 'خانة' }, { id: 'wrong', label: 'خطأ' }, finish];
  // بعد «خطأ»: لون الدور التالي (design/s8.md 3.2).
  if (s.phase === 'wrong') return [{ id: 'turn', label: 'التالي', team: 1 }, { id: 'turn', label: 'التالي', team: 2 }, finish];
  if (s.phase === 'listend') return [{ id: 'next', label: last(s) ? 'إنهاء الجولة' : `القائمة ${s.index + 2}` }];
  return [];
}

// scores: رصيد الفريقين قبل الفعل، يمرّره مشغّل الجولة، فيُكتب خصم الفخ بما خُصم فعلاً (design/ranking.md 7.7).
// now: ساعة الجهاز (ms) من المشغّل، لوقت القائمة ولحظة الإصابة.
function act(st, action, scores = {}, now = Date.now()) {
  const s = norm(st);
  const [id, arg] = String(action).split(':');
  const ask = (team, extra = []) => ({ state: { ...s, phase: 'ask', team, verdict: null, at: null }, events: [{ type: 'timer', seconds: ANSWER_SECONDS }, ...extra] });
  const end = (more = {}) => ({ state: { ...s, phase: 'listend', team: 0, verdict: null, at: null, ...more }, events: [] });
  if (id === 'show' && s.phase === 'intro') return { state: { ...s, phase: 'read', team: s.starts[s.index] ?? s.first, verdict: null }, events: [] };
  // «ابدأ»: يبدأ عدّاد الإجابة، ووقت القائمة (دقيقتان ونصف) معه.
  if (id === 'start' && s.phase === 'read') {
    return { state: { ...s, phase: 'ask', listEnds: now + LIST_SECONDS * 1000 }, events: [{ type: 'timer', seconds: ANSWER_SECONDS }] };
  }
  // انقضى وقت القائمة (يرسله المقدّم حين يحين): تنتهي القائمة أياً كانت حالها. ولا يُقبل قبل وقته (ثانية للفرق بين الساعتين).
  if (id === 'timeup' && running(s) && s.listEnds && now >= s.listEnds - 1000) return end({ timeup: true });
  // نقر رقم الخانة: تنكشف بلون صاحب الدور ونقاطها رقمها، والفخ يُخصم رقمه وبما عند الفريق إن كان أقل (لا رصيد تحت الصفر، الوثيقة 8).
  // والخانة تبقى بخصمها الأصلي، والحكم بما خُصم فعلاً. ثم لحظة 1.2 ثانية، والدور للخصم بعدها تلقائياً.
  if (id === 'item' && s.phase === 'ask') {
    const rank = Number(arg);
    if (!/^\d+$/.test(arg ?? '') || rank < 1 || rank > current(s).items.length || isGot(s, rank)) return { state: st, events: [] };
    const trap = rank > SLOTS;
    const points = trap ? -Math.min(PENALTY[rank], scores[s.team] ?? PENALTY[rank]) : rank;
    const hit = { rank, team: s.team, points };
    return {
      state: { ...s, phase: 'hit', at: now, got: s.got.map((g, i) => (i === s.index ? [...g, hit] : g)), verdict: { team: s.team, points, rank } },
      events: [...(points ? [{ type: 'score', team: s.team, points }] : []), { type: 'moment', name: trap ? 'trap' : 'right', team: s.team, rank }],
    };
  }
  // بعد اللحظة: الدور للخصم بعدّاده، أو نهاية القائمة إن انكشفت العشرة (5.6).
  if (id === 'turn' && s.phase === 'hit' && !arg && now >= (s.at ?? 0) + HIT_MS - 1000) return found(s) >= SLOTS ? end() : ask(other(s.team));
  // «خطأ» (ليس في القائمة أو مكرر): صفر، ويقف عدّاد الإجابة (وقت القائمة يجري)، ويختار المقدّم لون الدور التالي.
  if (id === 'wrong' && s.phase === 'ask') {
    return { state: { ...s, phase: 'wrong', verdict: { team: 0, points: 0, rank: 0 } }, events: [{ type: 'moment', name: 'none' }] };
  }
  if (id === 'turn' && s.phase === 'wrong' && (arg === '1' || arg === '2')) return ask(Number(arg));
  // انتهى وقت الإجابة: إلى الخصم بلمعة الانتقال وعدّاده 15 ث، بلا اختيار (design/s8.md 3.2).
  if (id === 'timeout' && s.phase === 'ask') return ask(other(s.team), [{ type: 'moment', name: 'steal', reason: 'timeout', team: other(s.team) }]);
  // نهاية القائمة: يعجز الفريقان («أنهِ القائمة»). فتنكشف القائمة كلها للجميع.
  if (id === 'finish' && (s.phase === 'read' || running(s))) return end();
  // بعد نهاية القائمة: القائمة الثانية تظهر مباشرة لمن يبدأها (الفريق الآخر)، أو نهاية الجولة.
  if (id === 'next' && s.phase === 'listend' && !last(s)) {
    const index = s.index + 1;
    return { state: { ...s, index, phase: 'read', team: s.starts[index], verdict: null, at: null, listEnds: null, timeup: false }, events: [] };
  }
  if (id === 'next' && s.phase === 'listend') return { state: { ...s, phase: 'end', team: 0 }, events: [] };
  return { state: st, events: [] };
}

// حصيلة الجولة لكل فريق: نقاط ما كشفه في القائمتين.
function totals(s) {
  const sum = { 1: 0, 2: 0 };
  for (const list of s.got) for (const g of list) sum[g.team] += g.points;
  return sum;
}

// ما تعرضه نافذة الجمهور: العنوان، والخانات الثلاث عشرة بأرقامها (والفخاخ ظاهرة الأرقام من أول القائمة، 5.6)، وما كُشف منها بفريقه واسمه.
// لا اسم لما لم يُكشف. وبعد نهاية القائمة: القائمة كلها.
function audience(st) {
  const s = norm(st);
  const t = current(s);
  const base = { first: s.first, count: s.lists.length, totals: totals(s) };
  if (s.phase === 'intro') return { ...base, screen: 'intro', turn: 0, rule: 'اذكروا ما في القائمة: كلما بعُد عن الأول زادت نقاطه', starter: 'قائمتان، وخلف كل قائمة ثلاثة فخاخ' };
  if (s.phase === 'end' || !t) return { ...base, screen: 'end', turn: 0 };
  const reveal = s.phase === 'listend';
  const by = new Map(gotOf(s).map(g => [g.rank, g.team]));
  const slots = t.items.map((x, i) => {
    const rank = i + 1, team = by.get(rank) ?? 0;
    return { rank, trap: rank > SLOTS, team, ...(team || reveal ? { name: x.name } : {}) };
  });
  const v = s.phase === 'hit' || s.phase === 'wrong' ? s.verdict : null;
  return {
    ...base,
    screen: 'list',
    phase: s.phase,
    n: s.index + 1,
    title: t.title,
    slots,
    // الرتبة التي كُشفت الآن (للحركة).
    fresh: s.phase === 'hit' ? v.rank : 0,
    // لحظة الإصابة: الحدّ عند من أصاب، وفي المنتصف للفخ. وبعد «خطأ» وفي نهاية القائمة في المنتصف.
    turn: s.phase === 'hit' ? (v.rank > SLOTS ? 0 : v.team) : s.phase === 'wrong' || reveal ? 0 : s.team,
    clock: ANSWER_SECONDS,
    verdict: v ? { ...v } : null,
    // يُحكم بنقر الخانات (design/s8.md 3.2): ما لم ينكشف منها في الإجابة.
    judge: s.phase === 'ask',
    found: found(s),
    of: SLOTS,
    // وقت القائمة: 2:30 ثابتاً قبل «ابدأ»، ثم يجري حتى listEnds بلا توقف، ويُخفى بعد النهاية. وtimeup: انتهت بانقضائه.
    listSeconds: LIST_SECONDS,
    listEnds: running(s) ? s.listEnds : null,
    listClock: s.phase === 'read' || running(s),
    timeup: !!s.timeup,
  };
}

// ما لا يصل إلى الجمهور: العنوان والقائمة كاملة (13) بصيغها وفخاخها، نصّ باركود الإجابات (js/qr.js).
function presenter(st) {
  const s = norm(st);
  const t = current(s);
  if (s.phase === 'intro' || s.phase === 'end' || !t) return { title: '', items: [] };
  return { title: t.title, items: t.items.map((x, i) => ({ rank: i + 1, name: x.name, alts: [...x.alts], trap: i >= SLOTS })) };
}

export default {
  id: 'ranking',
  name: 'الترتيب',
  order: 4,
  contentKey: 'ranking.json',
  setup, actions, act, audience, presenter,
  // ما لا زر له وتقبله الوحدة في وقته: انتقال الدور بعد لحظة الإصابة. واللحظة عابرة: التراجع يتخطاها إلى ما قبل الحكم (js/play.js).
  auto: ['turn'],
  transient: s => s.phase === 'hit',
  finished: s => s.phase === 'end',
  used: s => s.lists.map(t => t.id),
};
