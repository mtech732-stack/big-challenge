// مشغّل الجولة: يربط وحدة النمط بالمباراة. الوحدة تقرر ما يحدث، والمشغّل وحده يغيّر الرصيد،
// ويحفظ تاريخاً للتراجع، ويبقي الحالة كلها بيانات قابلة للحفظ (JSON) لتعود المباراة بعد إعادة التحميل.

// اختيار عشوائي لمن يبدأ الجولة (قرار المالك، docs/decisions.md).
export const pickFirst = (rng = Math.random) => (rng() < 0.5 ? 1 : 2);

// لا ينزل رصيد تحت الصفر بأي سبب (docs/decisions.md).
export function applyEvents(scores, events) {
  const next = { ...scores };
  for (const e of events) {
    if (e.type === 'score') next[e.team] = Math.max(0, next[e.team] + e.points);
    if (e.type === 'take') {
      const taken = Math.min(e.points, next[e.from]);
      next[e.from] -= taken;
      next[e.to] += taken;
    }
  }
  return next;
}

// seen: معرّفات ما ظهر من قبل على هذا الجهاز؛ تُمرَّر للوحدة كي لا يتكرر سؤال حتى يُستنفد البنك.
export function startRound(mode, { content, scores = { 1: 0, 2: 0 }, first, seen = [], rng = Math.random }) {
  const team = first ?? pickFirst(rng);
  const state = mode.setup({ content: content[mode.contentKey], first: team, seen, rng });
  return { mode: mode.id, first: team, state, scores: { ...scores }, history: [], events: [] };
}

export function act(mode, round, action) {
  if (mode.finished(round.state)) return round;
  if (!mode.actions(round.state).some(a => a.id === action) && action !== 'timeout') return round;
  const { state, events = [] } = mode.act(round.state, action);
  return {
    ...round,
    state,
    scores: applyEvents(round.scores, events),
    history: [...round.history, { state: round.state, scores: round.scores }],
    events,
  };
}

// التراجع عن آخر حكم أو نقطة: يعيد الحالة والرصيد كما كانا.
export function undo(round) {
  if (!round.history.length) return round;
  const last = round.history[round.history.length - 1];
  return { ...round, state: last.state, scores: last.scores, history: round.history.slice(0, -1), events: [] };
}

// تعديل الرصيد يدوياً بيد المقدّم، ويُتراجع عنه كأي حكم.
export function setScore(round, team, value) {
  return {
    ...round,
    scores: { ...round.scores, [team]: Math.max(0, Math.round(value)) },
    history: [...round.history, { state: round.state, scores: round.scores }],
    events: [],
  };
}

// يختار من البنك ما لم يظهر، فإن نفد ما لم يظهر بدأ البنك من جديد.
export function freshFirst(items, seen, count, rng = Math.random) {
  const shuffle = list => list.map(x => [rng(), x]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
  const fresh = shuffle(items.filter(i => !seen.includes(i.id)));
  if (fresh.length >= count) return fresh.slice(0, count);
  const rest = shuffle(items.filter(i => !fresh.includes(i)));
  return [...fresh, ...rest].slice(0, count);
}
