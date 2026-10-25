// اللعب بعد شاشة المواجهة: تتابع مسار المباراة (الجولات والعجلات) وربط كل جولة بوحدة نمطها عبر مشغّل الجولة.
// دوال خالصة على حالة المباراة (JSON) كما في js/match.js. الجولة الجارية في match.round، والرصيد يتبعها.
// modes: وحدات الأنماط المبنية (MODES في js/modes/index.js)، ومعها العجلة (js/wheel.js) إن كانت تُلعب: وحدة id «wheel».
import { plan, other } from './match.js';
import * as R from './round.js';
import { clashes } from './content-check.js';

// موضع المباراة في مسارها: match.cursor رقم العنصر الحالي في plan()، و-1 قبل أول جولة.
const cursor = match => match.cursor ?? -1;
export const upcoming = match => plan(match)[cursor(match) + 1] ?? null;
export const modeOf = (modes, id) => modes.find(m => m.id === id);

// انتهت الجولة الجارية، أو لم تبدأ جولة بعد؟ فيُنتقل إلى ما بعدها.
export function between(match, modes) {
  if (match.step === 'face') return true;
  if (match.step !== 'play') return false;
  const mode = match.round && modeOf(modes, match.round.mode);
  return !mode || mode.finished(match.round.state);
}

// ما بعد الجولة كما يُعرض على الجمهور: الجولة التالية، أو العجلة، أو النتيجة النهائية.
export function nextText(match, modeName) {
  const item = upcoming(match);
  if (!item) return 'التالي: النتيجة النهائية';
  if (item.kind === 'wheel') return 'التالي: عجلة البونص';
  return `التالي: الجولة ${item.n} · ${modeName(item.mode)}`;
}

// ما يُفعل بالعنصر التالي: 'start' جولة نمطها مبنيّ أو عجلة تُلعب · 'skip' عجلة لا تُلعب بعد (ش6) أو نمط لم يُبنَ بعد (معاينة)
// · 'final' انتهى المسار (ش7).
export function nextKind(match, modes) {
  const item = upcoming(match);
  if (!item) return 'final';
  return modeOf(modes, item.kind === 'wheel' ? 'wheel' : item.mode) ? 'start' : 'skip';
}

// من يدير العجلة أولاً (5.7): الأقل نقاطاً، وعند التعادل الفريق الخاسر في القرعة.
export const wheelFirst = match => (match.scores[1] < match.scores[2] ? 1 : match.scores[2] < match.scores[1] ? 2 : other(match.winner));

// ما لا يُختار في المباراة لأنه يتقاطع مع ما اختير فيها قبله: قائمة ترتيب، وموضوع مزاد أو سؤال (تدقيق ش5 «ثالثاً» و«رابعاً»).
export function avoidIn(content, used = []) {
  const avoid = new Set();
  for (const c of clashes(content)) {
    if (used.includes(c.ranking)) avoid.add(c.with);
    if (used.includes(c.with)) avoid.add(c.ranking);
  }
  return [...avoid];
}

// يبدأ الجولة التالية في المسار. content: ملفات الحزمة. seen: ذاكرة الأسئلة.
// match.used: ما اختير في جولات هذه المباراة، ليُترك ما يتقاطع معه.
export function startNext(match, { modes, content, seen = [], rng = Math.random }) {
  if (!between(match, modes) || nextKind(match, modes) !== 'start') return match;
  const item = upcoming(match);
  // العجلة: تُدار في match.round كالجولة، ولا تُعدّ جولة (played)، ولا ذاكرة لخاناتها.
  if (item.kind === 'wheel') {
    const wheel = modeOf(modes, 'wheel');
    const round = { ...R.startRound(wheel, { content, scores: match.scores, first: wheelFirst(match), rng }), n: item.after, wheel: true };
    return { ...match, step: 'play', cursor: cursor(match) + 1, round, scores: round.scores };
  }
  const mode = modeOf(modes, item.mode);
  const round = { ...R.startRound(mode, { content, scores: match.scores, seen, avoid: avoidIn(content, match.used ?? []), rng }), n: item.n };
  return { ...match, step: 'play', cursor: cursor(match) + 1, round, scores: round.scores, played: (match.played ?? 0) + 1, used: [...(match.used ?? []), ...mode.used(round.state)] };
}

// تخطّي ما لم يُبنَ بعد. تبقى على الشاشة الجولة السابقة (أو المواجهة) كما هي.
export function skipNext(match, modes) {
  if (!between(match, modes) || nextKind(match, modes) !== 'skip') return match;
  return { ...match, cursor: cursor(match) + 1 };
}

// أفعال الجولة الجارية تمرّ بالمشغّل، والرصيد يتبعه. يعيد المباراة، وأحداث الفعل لنافذة الجمهور.
const withRound = (match, round) => ({ ...match, round, scores: round.scores });
export function act(match, modes, action, timerId) {
  const mode = match.step === 'play' && match.round && modeOf(modes, match.round.mode);
  if (!mode) return match;
  const round = R.act(mode, match.round, action, timerId);
  return round.state === match.round.state ? { ...match, round } : withRound(match, round);
}
// modes: لتعرف الحالة العابرة (دوران العجلة)، فيتخطاها التراجع إلى ما قبلها: لا حكم فيها، ولو عاد إليها لوقفت فوراً.
export function undo(match, modes = []) {
  if (match.step !== 'play' || !match.round?.history.length) return match;
  const unit = modeOf(modes, match.round.mode);
  let round = R.undo(match.round);
  while (unit?.transient?.(round.state) && round.history.length) round = R.undo(round);
  return withRound(match, round);
}
export function setScore(match, team, value) {
  if (match.step !== 'play' || !match.round) return match;
  return withRound(match, R.setScore(match.round, team, value));
}
