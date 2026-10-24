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
// avoid: معرّفات لا تُختار في هذه المباراة (تقاطع الترتيب والمزاد، تدقيق ش5)، والوحدة تتركها ما وجدت غيرها.
export function startRound(mode, { content, scores = { 1: 0, 2: 0 }, first, seen = [], avoid = [], rng = Math.random }) {
  const team = first ?? pickFirst(rng);
  const state = mode.setup({ content: content[mode.contentKey], first: team, seen, avoid, rng });
  return { mode: mode.id, first: team, state, scores: { ...scores }, timer: null, timers: 0, history: [], events: [] };
}

// العدّاد: لكل عدّاد رقم يميّزه، و«انتهى الوقت» يحمل رقمه، فيُهمل ما جاء من عدّاد قديم
// (حكم في اللحظة الأخيرة ثم وصل «انتهى الوقت» بعده). وكل فعل يوقف العدّاد الجاري ما لم يبدأ غيره.
// والفعل الذي لا يُنهي الوقت (عنصر يُعدّ في وفاء المزاد) يحمل «keep-timer»، فيبقى العدّاد الجاري كما هو.
// resume: عدّاد يعود بالتراجع بما بقي من وقته لا بوقته كاملاً (المزاد، تقرير المعاين ش4). at: متى بدأ (ms)،
// وroot: أول عدّاد في سلسلته (العدّاد الذي عاد بالتراجع يُعدّ هو نفسه).
function withTimer(round, events, now) {
  const start = events.find(e => e.type === 'timer');
  const rest = events.filter(e => e.type !== 'timer' && e.type !== 'stop-timer' && e.type !== 'keep-timer');
  if (!start && events.some(e => e.type === 'keep-timer')) return { timer: round.timer, timers: round.timers, events: rest };
  if (start) {
    const id = round.timers + 1;
    const timer = { id, seconds: start.seconds, at: now, root: start.root ?? id, ...(start.resume ? { resume: true } : {}) };
    return { timer, timers: id, events: [...rest, { type: 'timer', seconds: start.seconds, id }] };
  }
  return { timer: null, timers: round.timers, events: round.timer ? [{ type: 'stop-timer' }, ...rest] : rest };
}

// والعدّاد الذي يعود بما بقي: يُحفظ معه ما بقي منه لحظة الفعل.
const left = (t, now) => Math.max(1, t.seconds - (now - (t.at ?? now)) / 1000);
const snapshot = (round, now) => ({ state: round.state, scores: round.scores, timer: round.timer?.resume ? { ...round.timer, left: left(round.timer, now) } : round.timer });
const rootOf = t => t?.root ?? t?.id;

// timerId: مع 'timeout' وحده، رقم العدّاد الذي انتهى.
// الفعل قد يحمل قيمة بعد «:» («bid:12» في المزاد)، فيُطابق اسمه وحده بما في actions()، والوحدة تتحقق من قيمته.
// الفعل المُهمل لا يغيّر شيئاً، وأحداثه فارغة، فلا يُعاد إرسال أمر عدّاد قديم (نقرتان سريعتان على «ابدأ» مثلاً).
const ignored = round => ({ ...round, events: [] });

// تبادل الصدارة (قرار المالك): إن صار فريق متقدماً بعد أن كان متأخراً أو متعادلاً، أضاف المشغّل لحظة «lead».
const leader = s => (s[1] > s[2] ? 1 : s[2] > s[1] ? 2 : 0);

export function act(mode, round, action, timerId, now = Date.now()) {
  if (mode.finished(round.state)) return ignored(round);
  if (action === 'timeout' ? !round.timer || round.timer.id !== timerId : !mode.actions(round.state).some(a => a.id === String(action).split(':')[0])) return ignored(round);
  const { state, events = [] } = mode.act(round.state, action);
  if (state === round.state) return ignored(round);
  const scores = applyEvents(round.scores, events);
  const lead = leader(scores) && leader(scores) !== leader(round.scores) ? [{ type: 'moment', name: 'lead', team: leader(scores) }] : [];
  return {
    ...round,
    state,
    scores,
    history: [...round.history, snapshot(round, now)],
    ...withTimer(round, [...events, ...lead], now),
  };
}

// التراجع عن آخر حكم أو نقطة: يعيد الحالة والرصيد كما كانا، ويوقف العدّاد الجاري،
// فإن كان للحالة المستعادة عدّاد بدأ من جديد بوقته كاملاً، أو بما بقي منه إن كان «resume».
export function undo(round, now = Date.now()) {
  if (!round.history.length) return ignored(round);
  const last = round.history[round.history.length - 1];
  const back = { ...round, state: last.state, scores: last.scores, history: round.history.slice(0, -1) };
  // التراجع عن تعديل يدوي للرصيد لا يمس عدّاداً جارياً.
  if (rootOf(last.timer) === rootOf(round.timer)) return { ...back, events: [] };
  const t = last.timer;
  return { ...back, ...withTimer(round, t ? [{ type: 'timer', seconds: t.resume ? t.left ?? t.seconds : t.seconds, resume: t.resume, root: rootOf(t) }] : [], now) };
}

// تعديل الرصيد يدوياً بيد المقدّم، ويُتراجع عنه كأي حكم. لا يمس العدّاد.
export function setScore(round, team, value) {
  return {
    ...round,
    scores: { ...round.scores, [team]: Math.max(0, Math.round(value)) },
    history: [...round.history, snapshot(round, Date.now())],
    events: [],
  };
}

// ما يُختار منه بعد ترك avoid، أو البنك كله إن بقي منه أقل من need (فلا تقف جولة ولا تنقص لبنك صغير).
export const besides = (items, avoid = [], need = 1) => { const rest = items.filter(i => !avoid.includes(i.id)); return rest.length >= need ? rest : items; };

// يختار من البنك ما لم يظهر، فإن نفد ما لم يظهر بدأ البنك من جديد.
export function freshFirst(items, seen, count, rng = Math.random) {
  const shuffle = list => list.map(x => [rng(), x]).sort((a, b) => a[0] - b[0]).map(p => p[1]);
  const fresh = shuffle(items.filter(i => !seen.includes(i.id)));
  if (fresh.length >= count) return fresh.slice(0, count);
  const rest = shuffle(items.filter(i => !fresh.includes(i)));
  return [...fresh, ...rest].slice(0, count);
}
