// بدء المباراة (القسم 5.2 من الوثيقة 1.1): الاسمان وعدد الأنماط (2 أو 4)، ثم القرعة، ثم اختيار الأنماط، ثم المواجهة.
// والحزمة تُختار تلقائياً ولا تظهر. «short» و«full» اسمان داخليان لمباراة النمطين والأربعة، لا يُكتبان على الشاشات.
// دوال خالصة على حالة بيانات (JSON)، فتُحفظ المباراة وتعود بعد إعادة التحميل (docs/decisions.md).
import { TEAM_NAME_MAX } from './content-check.js';

// play: الجولات بعد المواجهة (js/play.js) · final: النهاية بعد آخر عنصر في المسار (ش7).
export const STEPS = ['setup', 'draw', 'pick', 'face', 'play', 'final'];
export const METHODS = {
  short: { rounds: 2, wheelsAfter: [1] },     // جولتان، وعجلة بينهما
  full: { rounds: 4, wheelsAfter: [2, 3] },   // أربع جولات، وعجلتان بعد الثانية وبعد الثالثة
};

export const other = team => (team === 1 ? 2 : 1);
const clean = name => String(name ?? '').replace(/\s+/g, ' ').trim();

// الأرقام إنجليزية في كل الشاشات (7.3): لوحة المفاتيح العربية تكتب ٣ و۳، فتُحوَّل عند الكتابة.
export const englishDigits = text => String(text ?? '')
  .replace(/[٠-٩]/g, d => d.charCodeAt(0) - 0x0660)
  .replace(/[۰-۹]/g, d => d.charCodeAt(0) - 0x06F0);

// single: المباراة تُلعب بنافذة واحدة (الشاشة المشتركة بأزرارها). وقبل «ابدأ المباراة» الشاشة مشتركة دائماً.
export function newMatch({ pack = null, method = 'full' } = {}) {
  return { v: 1, step: 'setup', teams: { 1: '', 2: '' }, pack, method, winner: null, picks: [], scores: { 1: 0, 2: 0 }, history: [], single: false };
}

// أخطاء الإعداد بنصوص الواجهة (design/start.md، القسم 4.3). تعيد [{ field, text }].
// available: أنماط الحزمة التي تُختار ([{ id, name }])؛ إن أُعطيت رُفضت طريقة جولاتها أكثر منها.
export function setupErrors(match, available) {
  const a = clean(match.teams[1]), b = clean(match.teams[2]);
  if (!a) return [{ field: 1, text: 'اكتب اسم الفريق الأول' }];
  if (!b) return [{ field: 2, text: 'اكتب اسم الفريق الثاني' }];
  if ([...a].length > TEAM_NAME_MAX) return [{ field: 1, text: `اسم الفريق الأول أطول من ${TEAM_NAME_MAX} حرفاً` }];
  if ([...b].length > TEAM_NAME_MAX) return [{ field: 2, text: `اسم الفريق الثاني أطول من ${TEAM_NAME_MAX} حرفاً` }];
  if (a === b) return [{ field: 2, text: 'الاسمان متطابقان. غيّر أحدهما.' }];
  if (!match.pack) return [{ field: 'pack', text: 'اختر الحزمة' }];
  if (!METHODS[match.method]) return [{ field: 'method', text: 'اختر عدد الأنماط' }];
  if (available && METHODS[match.method].rounds > available.length) {
    const n = available.length;
    return [{ field: 'method', text: match.method === 'full'
      ? `المتاح ${n} أنماط فقط. اختر 2.`
      : `المباراة تحتاج نمطين على الأقل، والمتاح ${n}.` }];
  }
  return [];
}

export const setTeams = (match, a, b) => ({ ...match, teams: { 1: englishDigits(a), 2: englishDigits(b) } });
export const setPack = (match, pack) => ({ ...match, pack });
export const setMethod = (match, method) => (METHODS[method] ? { ...match, method } : match);

// «اختيار الأنماط»: يثبّت الاسمين بعد تنظيف المسافات، ويفتح صفحة الاختيار، والقرعة فيها (1.11، design/s8b.md 3). لا ينتقل والإعداد ناقص.
// والخطوة 'draw' باقية في STEPS لمباراة محفوظة قبل 1.11 وحدها، وتُقرأ كخطوة الاختيار (fromDraw).
export function toDraw(match) {
  if (match.step !== 'setup' || setupErrors(match).length) return match;
  return { ...match, step: 'pick', teams: { 1: clean(match.teams[1]), 2: clean(match.teams[2]) } };
}
export const fromDraw = match => (match?.step === 'draw' ? { ...match, step: 'pick' } : match);

// رجوع من صفحة الاختيار إلى الإعداد قبل أي اختيار. لا يُمحى شيء، ونتيجة القرعة تبقى ولا تُعاد (design/start.md: لا إعادة لها).
export const backToSetup = match => (['draw', 'pick'].includes(match.step) && !match.picks.length ? { ...match, step: 'setup' } : match);

// «قرعة البداية» في صفحة الاختيار (1.11): تُحسم قبل الحركة وتُحفظ، والحركة عرض لها فقط (design/start.md، القسم 8.6). ولا إعادة لها.
// والفائز يختار أولاً ويبدأ الإجابة في الجولة الأولى (starter).
export function draw(match, rng = Math.random) {
  if (!['draw', 'pick'].includes(match.step) || match.winner) return match;
  return { ...match, winner: rng() < 0.5 ? 1 : 2 };
}

export function toPick(match) {
  return match.step === 'draw' ? { ...match, step: 'pick' } : match;
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

// من يبدأ الإجابة في الجولة n (من 1): الفائز بالقرعة في الأولى، ثم يتناوب الفريقان (1.11، 5.2).
// فيُعرف البادئ قبل أول سؤال، ويُلوَّن به رقم الجولة في صفحة الاختيار. و0 ما لم تُحسم القرعة.
export const starter = (match, n) => (!match.winner ? 0 : n % 2 === 1 ? match.winner : other(match.winner));

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
    list.push({ kind: 'round', n: i + 1, mode: p.mode, by: p.by, first: starter(match, i + 1) });
    if (wheelsAfter.includes(i + 1)) list.push({ kind: 'wheel', after: i + 1 });
  });
  return list;
}

// المتقدّم في الرصيد: 1 أو 2، و0 عند التعادل.
export const leaderOf = s => (s[1] > s[2] ? 1 : s[2] > s[1] ? 2 : 0);

// مسار المباراة بما تغيّر في رصيد كل فريق في كل عنصر (design/final.md 2.1): رصيده في نهايته ناقص رصيده في نهاية ما قبله.
// match.ends[i]: الرصيد في نهاية العنصر i (يُحفظ عند الانتقال إلى ما بعده، js/play.js)، والعنصر الأخير ينتهي بالرصيد الآن.
// فتعديل الرصيد اليدوي بين عنصرين يدخل في العنصر التالي، ومجموع الخانات يساوي الرصيد دائماً.
// وما لم يُحفظ (مباراة محفوظة قبل ش7) يُعدّ كالذي قبله، فيدخل فرقه في العنصر بعده.
export function gains(match) {
  // وبعد الجولة الفاصلة (match.tbFrom: الرصيد قبلها) خانة لها في آخر المسار، والعنصر الأخير ينتهي بالرصيد قبلها.
  const list = [...plan(match), ...(match.tbFrom ? [{ kind: 'tiebreak' }] : [])], ends = match.ends ?? [];
  let prev = { 1: 0, 2: 0 };
  return list.map((item, i) => {
    const end = i === list.length - 1 ? match.scores : match.tbFrom && i === list.length - 2 ? match.tbFrom : ends[i] ?? prev;
    const g = { 1: end[1] - prev[1], 2: end[2] - prev[2] };
    prev = end;
    return { ...item, g };
  });
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
