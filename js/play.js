// اللعب بعد شاشة المواجهة: تتابع مسار المباراة (الجولات والعجلات) وربط كل جولة بوحدة نمطها عبر مشغّل الجولة.
// دوال خالصة على حالة المباراة (JSON) كما في js/match.js. الجولة الجارية في match.round، والرصيد يتبعها.
// modes: وحدات الأنماط المبنية (MODES في js/modes/index.js).
import { plan } from './match.js';
import * as R from './round.js';

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

// ما يُفعل بالعنصر التالي: 'start' جولة نمطها مبنيّ · 'skip' عجلة (ش6) أو نمط لم يُبنَ بعد (معاينة) · 'final' انتهى المسار (ش7).
export function nextKind(match, modes) {
  const item = upcoming(match);
  if (!item) return 'final';
  return item.kind === 'round' && modeOf(modes, item.mode) ? 'start' : 'skip';
}

// يبدأ الجولة التالية في المسار. content: ملفات الحزمة. seen: ذاكرة الأسئلة.
export function startNext(match, { modes, content, seen = [], rng = Math.random }) {
  if (!between(match, modes) || nextKind(match, modes) !== 'start') return match;
  const item = upcoming(match);
  const round = { ...R.startRound(modeOf(modes, item.mode), { content, scores: match.scores, seen, rng }), n: item.n };
  return { ...match, step: 'play', cursor: cursor(match) + 1, round, scores: round.scores, played: (match.played ?? 0) + 1 };
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
export function undo(match) {
  if (match.step !== 'play' || !match.round?.history.length) return match;
  return withRound(match, R.undo(match.round));
}
export function setScore(match, team, value) {
  if (match.step !== 'play' || !match.round) return match;
  return withRound(match, R.setScore(match.round, team, value));
}
