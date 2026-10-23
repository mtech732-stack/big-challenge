// بدء المباراة (القسم 5.2 من الوثيقة): الأسماء والحزمة وطريقة اللعب، ثم القرعة، ثم اختيار الأنماط، ثم المواجهة.
// دوال خالصة على حالة بيانات (JSON)، فتُحفظ المباراة وتعود بعد إعادة التحميل (docs/decisions.md).
import { TEAM_NAME_MAX } from './content-check.js';

export const STEPS = ['setup', 'draw', 'pick', 'face'];
export const METHODS = {
  short: { rounds: 2, wheelsAfter: [1] },     // جولتان، وعجلة بينهما
  full: { rounds: 4, wheelsAfter: [2, 3] },   // أربع جولات، وعجلتان بعد الثانية وبعد الثالثة
};

export const other = team => (team === 1 ? 2 : 1);
const clean = name => String(name ?? '').replace(/\s+/g, ' ').trim();

export function newMatch({ pack = null, method = 'full' } = {}) {
  return { v: 1, step: 'setup', teams: { 1: '', 2: '' }, pack, method, winner: null, picks: [], scores: { 1: 0, 2: 0 }, history: [], single: false };
}

// أخطاء الإعداد بنصوص الواجهة (design/start.md، القسم 4.3). تعيد [{ field, text }].
export function setupErrors(match) {
  const a = clean(match.teams[1]), b = clean(match.teams[2]);
  if (!a) return [{ field: 1, text: 'اكتب اسم الفريق الأول' }];
  if (!b) return [{ field: 2, text: 'اكتب اسم الفريق الثاني' }];
  if ([...a].length > TEAM_NAME_MAX) return [{ field: 1, text: `اسم الفريق الأول أطول من ${TEAM_NAME_MAX} حرفاً` }];
  if ([...b].length > TEAM_NAME_MAX) return [{ field: 2, text: `اسم الفريق الثاني أطول من ${TEAM_NAME_MAX} حرفاً` }];
  if (a === b) return [{ field: 2, text: 'الاسمان متطابقان. غيّر أحدهما.' }];
  if (!match.pack) return [{ field: 'pack', text: 'اختر الحزمة' }];
  if (!METHODS[match.method]) return [{ field: 'method', text: 'اختر طريقة اللعب' }];
  return [];
}

export const setTeams = (match, a, b) => ({ ...match, teams: { 1: String(a ?? ''), 2: String(b ?? '') } });
export const setPack = (match, pack) => ({ ...match, pack });
export const setMethod = (match, method) => (METHODS[method] ? { ...match, method } : match);

// «إلى القرعة»: يثبّت الاسمين بعد تنظيف المسافات. لا ينتقل والإعداد ناقص.
export function toDraw(match) {
  if (match.step !== 'setup' || setupErrors(match).length) return match;
  return { ...match, step: 'draw', teams: { 1: clean(match.teams[1]), 2: clean(match.teams[2]) } };
}

// القرعة تُحسم قبل الحركة وتُحفظ، والحركة عرض لها فقط (design/start.md، القسم 8.6). ولا إعادة لها.
export function draw(match, rng = Math.random) {
  if (match.step !== 'draw' || match.winner) return match;
  return { ...match, winner: rng() < 0.5 ? 1 : 2 };
}

export function toPick(match) {
  return match.step === 'draw' && match.winner ? { ...match, step: 'pick' } : match;
}

export const rounds = match => METHODS[match.method].rounds;

// من يختار نمط الجولة التالية: الفائز بالقرعة، ثم الآخر، ثم الفائز. والرابعة في الكاملة للنمط المتبقي تلقائياً.
// يعيد 0 إن اكتمل الاختيار.
export function chooser(match) {
  const k = match.picks.length;
  if (k >= rounds(match)) return 0;
  return k % 2 === 0 ? match.winner : other(match.winner);
}

export const picksDone = match => match.picks.length === rounds(match);

// available: الأنماط المتاحة لهذه الحزمة بترتيبها ([{ id, name }]). النمط لا يتكرر في المباراة.
export function pick(match, modeId, available) {
  const team = chooser(match);
  if (match.step !== 'pick' || !team || match.picks.some(p => p.mode === modeId) || !available.some(m => m.id === modeId)) return match;
  let picks = [...match.picks, { mode: modeId, by: team }];
  // الكاملة: بعد الاختيار الثالث تصير الرابعة للنمط المتبقي تلقائياً.
  if (match.method === 'full' && picks.length === 3) {
    const left = available.filter(m => !picks.some(p => p.mode === m.id));
    if (left.length === 1) picks = [...picks, { mode: left[0].id, by: 0 }];
  }
  return { ...match, picks };
}

// «تراجع عن آخر اختيار»: والتلقائية تُرفع مع الاختيار الذي أوجبها.
export function undoPick(match) {
  if (match.step !== 'pick' || !match.picks.length) return match;
  let picks = match.picks.slice(0, -1);
  if (match.picks[match.picks.length - 1].by === 0) picks = picks.slice(0, -1);
  return { ...match, picks };
}

export const toFace = match => (match.step === 'pick' && picksDone(match) ? { ...match, step: 'face' } : match);

// مسار المباراة: الجولات بأنماطها، والعجلات في مواضعها (5.2 و5.7).
export function plan(match) {
  const { wheelsAfter } = METHODS[match.method];
  const list = [];
  match.picks.forEach((p, i) => {
    list.push({ kind: 'round', n: i + 1, mode: p.mode, by: p.by });
    if (wheelsAfter.includes(i + 1)) list.push({ kind: 'wheel', after: i + 1 });
  });
  return list;
}

// تعديل الرصيد يدوياً في أي خطوة، ولا ينزل تحت الصفر، ويُتراجع عنه (docs/decisions.md).
export function adjustScore(match, team, delta) {
  const value = Math.max(0, match.scores[team] + Math.round(delta));
  if (value === match.scores[team]) return match;
  return { ...match, scores: { ...match.scores, [team]: value }, history: [...match.history, match.scores] };
}

export function undoScore(match) {
  if (!match.history.length) return match;
  return { ...match, scores: match.history[match.history.length - 1], history: match.history.slice(0, -1) };
}

// حالة محفوظة سليمة؟ (ما يُقرأ من ذاكرة المتصفح قد يكون من نسخة قديمة أو تالفاً.)
export function isMatch(m) {
  return !!m && m.v === 1 && STEPS.includes(m.step) && METHODS[m.method] && m.teams && Array.isArray(m.picks)
    && m.scores && Number.isFinite(m.scores[1]) && Number.isFinite(m.scores[2]) && Array.isArray(m.history);
}
