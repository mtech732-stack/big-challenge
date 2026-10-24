// النمط الثالث: «المزاد» (القسم 5.5 من الوثيقة، وتصميمه design/auction.md). وحدة تلتزم «عقد الوحدة».
// 3 مواضيع في الجولة: سهل ثم متوسط ثم صعب، ويتناوب الفريقان على افتتاح المزايدة. يزايد الفريق برقم، ويزيد عليه خصمه
// أو ينسحب، فيلتزم صاحب أعلى رقم بالوفاء. والقائمة المرجعية وطولها لا يصلان إلى الجمهور قبل الحكم (7.1، design/auction.md 1).
// ش4 · المزايدة، ثم الوفاء والعدّ: يُحسب كل عنصر يذكره الملتزم (+1)، فإن بلغ ما التزم به أخذ نقاطه.
// وإكمال الخصم وتتابع الجولة في المرحلتين التاليتين.
import { freshFirst } from '../round.js';

export const FULFIL_SECONDS = 60;
export const COMPLETE_SECONDS = 15;
// أول ما يقترحه «زايد» في الافتتاح، ويُغيَّر بـ «−» و«+» (design/auction.md 4). ولا يزيد رقم على خانتين في الشارة.
export const OPEN_OFFER = 5;
export const MAX_BID = 99;
const LEVELS = ['easy', 'medium', 'hard'];
const other = team => (team === 1 ? 2 : 1);

// الحالات: intro افتتاح الجولة · bid المزايدة · ready الالتزام قبل «ابدأ» · fulfil عدّاد الملتزم
// · short لم يفِ (إكمال الخصم في المرحلة التالية) · decided انتهى الموضوع · end انتهت الجولة.
// bids: الأرقام بأصحابها بالترتيب · commit: { team, n } الملتزم ورقمه
// · said: ما ذُكر بالترتيب { i, team }، وi موضع العنصر في القائمة، أو null إن عُدّ دون اسم («صحيح · +1» في النافذة الواحدة)
// · results[i]: { team, points } من أخذ نقاط الموضوع i (team 0 إن لم يأخذها أحد)، أو null ما لم ينتهِ.
function setup({ content, first, seen = [], rng = Math.random }) {
  const bank = content?.topics ?? [];
  const topics = LEVELS.map((l, i) => {
    const t = freshFirst(bank.filter(x => x.level === l), seen, 1, rng)[0];
    return t && { id: t.id, level: t.level, topic: t.topic, items: t.items.map(x => ({ name: x.name, alts: x.alts ?? [] })), note: t.note ?? '', opener: i % 2 ? other(first) : first };
  }).filter(Boolean);
  return { first, topics, index: 0, phase: 'intro', team: first, bids: [], commit: null, said: [], results: topics.map(() => null) };
}

const current = s => s.topics[s.index];
// حالة محفوظة من مرحلة «المزايدة» بلا said، كي تكمل مباراة جارية بعد التحديث.
const saidOf = s => s.said ?? [];
// من ذكر العنصر i من الموضوع الحالي، أو 0.
const by = (s, i) => saidOf(s).find(x => x.i === i)?.team ?? 0;
const top = s => (s.bids.length ? s.bids[s.bids.length - 1].n : 0);
// أقل رقم يُقبل الآن: أعلى من آخر رقم، ومن 1 في الافتتاح.
const minBid = s => top(s) + 1;

function actions(s) {
  if (s.phase === 'intro') return [{ id: 'show', label: `اعرض الموضوع ${s.index + 1}` }];
  if (s.phase === 'bid') {
    const min = minBid(s);
    if (min > MAX_BID) return [{ id: 'pass', label: 'انسحب' }];
    // «زايد» برقم: يصل الفعل «bid:12»، والصفحة تبدأ بـ offer وتغيّره بـ «−» و«+» بين min وmax.
    const bid = { id: 'bid', label: 'زايد', min, max: MAX_BID, offer: s.bids.length ? min : Math.max(min, OPEN_OFFER) };
    // لا انسحاب في الافتتاح: لا رقم يلتزم به الخصم بعد.
    return s.bids.length ? [bid, { id: 'pass', label: 'انسحب' }] : [bid];
  }
  // الوفاء: العنصر يُعدّ قبل «ابدأ» أيضاً (قد يبدأ الفريق قبل العدّاد، كزرّي الحكم في ش2).
  // «item:3» عنصر بموضعه من القائمة (نافذة المقدّم)، و«count» عنصر دون اسم (النافذة الواحدة: القائمة سرّ).
  const count = [{ id: 'item', label: 'عنصر' }, { id: 'count', label: 'صحيح · +1' }];
  if (s.phase === 'ready') return [{ id: 'start', label: 'ابدأ العدّاد' }, ...count, { id: 'stop', label: 'توقّف · لم يفِ' }];
  if (s.phase === 'fulfil') return [...count, { id: 'stop', label: 'توقّف · لم يفِ' }];
  return [];
}

function act(s, action) {
  const [id, arg] = String(action).split(':');
  if (id === 'show') return { state: { ...s, phase: 'bid', team: current(s).opener, bids: [], commit: null, said: [] }, events: [] };
  if (id === 'bid') {
    const n = Number(arg);
    if (!Number.isInteger(n) || n < minBid(s) || n > MAX_BID) return { state: s, events: [] };
    return { state: { ...s, bids: [...s.bids, { team: s.team, n }], team: other(s.team) }, events: [{ type: 'moment', name: 'bid', team: s.team }] };
  }
  // انسحب صاحب الدور: يلتزم خصمه بآخر رقم (أعلى رقم)، ويتحول الدور إليه.
  if (id === 'pass' && s.bids.length) {
    const last = s.bids[s.bids.length - 1];
    return { state: { ...s, phase: 'ready', team: last.team, commit: { team: last.team, n: last.n }, said: [] }, events: [] };
  }
  if (id === 'start') return { state: { ...s, phase: 'fulfil' }, events: [{ type: 'timer', seconds: FULFIL_SECONDS }] };
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
  // لم يفِ («توقّف» أو انتهى الوقت): يقف العدّاد، وإكمال الخصم في المرحلة التالية.
  if ((id === 'stop' || id === 'timeout') && (s.phase === 'ready' || s.phase === 'fulfil')) {
    return { state: { ...s, phase: 'short', short: id === 'timeout' ? 'timeout' : 'stop' }, events: [] };
  }
  return { state: s, events: [] };
}

// حصيلة الجولة لكل فريق: من وفى بعدد ما التزم به، ومن أكمل بالنقاط كاملة (5.5).
function totals(s) {
  const sum = { 1: 0, 2: 0 };
  s.results.forEach((r, i) => { if (r?.team) sum[r.team] += r.points; });
  return sum;
}

// ما تعرضه نافذة الجمهور: الموضوع والأرقام بأصحابها، ومن الالتزام العدّ «0 من 12». لا القائمة ولا طولها ولا المستوى.
function audience(s) {
  const t = current(s);
  const base = { first: s.first, count: s.topics.length, totals: totals(s) };
  if (s.phase === 'intro') return { ...base, screen: 'intro', turn: current(s)?.opener ?? s.first, rule: 'زايدوا على ما تقدرون على ذكره، ثم أوفوا', starter: 'يفتتح المزايدة', unit: 'الموضوع' };
  if (s.phase === 'end' || !t) return { ...base, screen: 'end', turn: 0 };
  const result = s.phase === 'decided' ? s.results[s.index] : null;
  return {
    ...base,
    screen: 'topic',
    phase: s.phase,
    n: s.index + 1,
    topic: t.topic,
    owner: t.opener,
    // بعد الحكم: الحدّ عند من أخذ النقاط، أو في المنتصف.
    turn: result ? result.team : s.team,
    bids: s.bids.map(b => ({ ...b })),
    commit: s.commit && { ...s.commit },
    // العدّ من الالتزام: ما ذُكر من العدد الملتزم به، بلون صاحب آخر عنصر (الملتزم قبل أول عنصر).
    tally: s.commit ? { n: saidOf(s).length, of: s.commit.n, team: saidOf(s).length ? saidOf(s)[saidOf(s).length - 1].team : s.commit.team } : null,
    // ما ذُكر بأسمائه وأصحابه (قاله الفريق أمام القاعة). وما عُدّ دون اسم لا يظهر إلا في العدّ.
    said: saidOf(s).filter(x => x.i !== null).map(x => ({ name: t.items[x.i].name, team: x.team })),
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
    level: hidden ? undefined : t?.level,
    items: hidden ? [] : t.items.map((x, i) => ({ name: x.name, alts: [...x.alts], by: by(s, i) })),
    size: hidden ? 0 : t.items.length,
    note: hidden ? '' : t.note,
    brief: `3 مواضيع، ويتناوب الفريقان على افتتاح المزايدة. يزايد الفريق برقم، ويزيد عليه خصمه أو ينسحب. وللملتزم ${FULFIL_SECONDS} ثانية ليوفي، فإن لم يفِ أكمل خصمه في ${COMPLETE_SECONDS} ثانية.`,
    track: s.topics.map((x, i) => ({ owner: x.opener, result: s.results[i] === null ? null : s.results[i].team, now: !hidden && i === s.index })),
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
