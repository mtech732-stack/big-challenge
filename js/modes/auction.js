// النمط الثالث: «المزاد» (القسم 5.5 من الوثيقة، وتصميمه design/auction.md). وحدة تلتزم «عقد الوحدة».
// 3 مواضيع في الجولة: سهل ثم متوسط ثم صعب، ويتناوب الفريقان على افتتاح المزايدة. يزايد الفريق برقم، ويزيد عليه خصمه
// أو ينسحب، فيلتزم صاحب أعلى رقم بالوفاء. والقائمة المرجعية وطولها لا يصلان إلى الجمهور قبل الحكم (7.1، design/auction.md 1).
// ش4 · المزايدة: الافتتاح والمزايدة حتى الالتزام. والوفاء والعدّ وإكمال الخصم وتتابع الجولة في المراحل التالية.
import { freshFirst } from '../round.js';

export const FULFIL_SECONDS = 60;
export const COMPLETE_SECONDS = 15;
// أول ما يقترحه «زايد» في الافتتاح، ويُغيَّر بـ «−» و«+» (design/auction.md 4). ولا يزيد رقم على خانتين في الشارة.
export const OPEN_OFFER = 5;
export const MAX_BID = 99;
const LEVELS = ['easy', 'medium', 'hard'];
const other = team => (team === 1 ? 2 : 1);

// الحالات: intro افتتاح الجولة · bid المزايدة · ready الالتزام قبل «ابدأ» (الوفاء في المرحلة التالية) · end انتهت الجولة.
// bids: الأرقام بأصحابها بالترتيب · commit: { team, n } الملتزم ورقمه · results[i]: من أخذ نقاط الموضوع i، أو 0، أو null.
function setup({ content, first, seen = [], rng = Math.random }) {
  const bank = content?.topics ?? [];
  const topics = LEVELS.map((l, i) => {
    const t = freshFirst(bank.filter(x => x.level === l), seen, 1, rng)[0];
    return t && { id: t.id, level: t.level, topic: t.topic, items: t.items.map(x => ({ name: x.name, alts: x.alts ?? [] })), note: t.note ?? '', opener: i % 2 ? other(first) : first };
  }).filter(Boolean);
  return { first, topics, index: 0, phase: 'intro', team: first, bids: [], commit: null, results: topics.map(() => null) };
}

const current = s => s.topics[s.index];
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
  return [];
}

function act(s, action) {
  const [id, arg] = String(action).split(':');
  if (id === 'show') return { state: { ...s, phase: 'bid', team: current(s).opener, bids: [], commit: null }, events: [] };
  if (id === 'bid') {
    const n = Number(arg);
    if (!Number.isInteger(n) || n < minBid(s) || n > MAX_BID) return { state: s, events: [] };
    return { state: { ...s, bids: [...s.bids, { team: s.team, n }], team: other(s.team) }, events: [{ type: 'moment', name: 'bid', team: s.team }] };
  }
  // انسحب صاحب الدور: يلتزم خصمه بآخر رقم (أعلى رقم)، ويتحول الدور إليه.
  if (id === 'pass' && s.bids.length) {
    const last = s.bids[s.bids.length - 1];
    return { state: { ...s, phase: 'ready', team: last.team, commit: { team: last.team, n: last.n } }, events: [] };
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
  return {
    ...base,
    screen: 'topic',
    phase: s.phase,
    n: s.index + 1,
    topic: t.topic,
    owner: t.opener,
    turn: s.team,
    bids: s.bids.map(b => ({ ...b })),
    commit: s.commit && { ...s.commit },
    // العدّ من الالتزام: ما ذُكر من العدد الملتزم به، بلون صاحب آخر عنصر (الملتزم قبل أول عنصر).
    tally: s.commit ? { n: 0, of: s.commit.n, team: s.commit.team } : null,
    said: [],
    clock: FULFIL_SECONDS,
    verdict: null,
  };
}

// ما تعرضه نافذة المقدّم: ما يراه الجمهور، ومعه القائمة المرجعية بصيغها، وطولها، وملاحظة الكاتب، ومسار المواضيع.
function presenter(s) {
  const t = current(s);
  const hidden = s.phase === 'intro' || s.phase === 'end';
  return {
    ...audience(s),
    level: hidden ? undefined : t?.level,
    items: hidden ? [] : t.items.map(x => ({ name: x.name, alts: [...x.alts], by: 0 })),
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
