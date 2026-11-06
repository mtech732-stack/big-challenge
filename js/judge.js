// التوقيت وكشف الإجابة في «الحرف المعيّن» و«آخر حرفين» والجولة الفاصلة (الوثيقة 1.11: 5.3 و5.4 و5.8 و12).
// يبدأ العدّاد تلقائياً بعد 5 ثوانٍ من ظهور السؤال (عدّاد تمهيد «lead»)، وللمقدّم «إيقاف مؤقت» يوقفه ويستأنفه بما بقي.
// وانتهاء الوقت لا ينقل الإجابة: ينتظر المقدّم، فإما «وقت الخصم» (زر، 10 ثوانٍ) وإما «كشف الإجابة».
// و«كشف الإجابة» يوقف العدّاد ويُظهر الإجابة النموذجية للجمهور، ثم يختار المقدّم من أجاب (pick:رقم الفريق، أو pick:0 «لم يُجب أحد»).
// الحالات: ready التمهيد · ask عدّاد صاحب الدور · steal عدّاد الخصم · over انتهى الوقت · revealed كُشفت الإجابة.
// paused: ما بقي من العدّاد الموقوف (بالثواني)، والحالة كما هي. والعدّاد الجاري يعرف ما بقي منه المشغّل (left، js/round.js).
export const LEAD_SECONDS = 5;
// وعدّاداته كلها «resume»: «تراجع» بعد «إيقاف مؤقت» أو «كشف الإجابة» يعيده بما بقي منه لا بوقته كاملاً (js/round.js، ملاحظة المعاين ش8/50).
export const lead = () => ({ type: 'timer', seconds: LEAD_SECONDS, lead: true, resume: true });

const RUNNING = ['ready', 'ask', 'steal'];
const OPEN = [...RUNNING, 'over'];
export const open = s => OPEN.includes(s.phase);

// أزرار المقدّم قبل الكشف. stealSeconds: 0 حيث لا وقت للخصم (الجولة الفاصلة).
export function timingActions(s, stealSeconds) {
  if (!open(s)) return [];
  const list = [];
  if (s.paused) list.push({ id: 'resume', label: 'استئناف' });
  else if (RUNNING.includes(s.phase)) list.push({ id: 'pause', label: 'إيقاف مؤقت' });
  if (stealSeconds && !s.steal) list.push({ id: 'steal', label: `وقت الخصم · ${stealSeconds}` });
  list.push({ id: 'reveal', label: 'كشف الإجابة' });
  return list;
}

// يعيد { state, events } لفعل من أفعال التوقيت أو الكشف، أو null إن لم يكن منها.
// seconds: وقت صاحب السؤال. left: ما بقي من العدّاد الجاري (يمرره المشغّل).
export function timing(s, action, left, { seconds, stealSeconds = 0 }) {
  if (action === 'pause' && !s.paused && RUNNING.includes(s.phase) && left) return { state: { ...s, paused: Math.round(left * 10) / 10 }, events: [] };
  if (action === 'resume' && s.paused) {
    return { state: { ...s, paused: null }, events: [{ type: 'timer', seconds: s.paused, resume: true, ...(s.phase === 'ready' ? { lead: true } : {}) }] };
  }
  if (action === 'timeout' && !s.paused) {
    if (s.phase === 'ready') return { state: { ...s, phase: 'ask' }, events: [{ type: 'timer', seconds, resume: true }] };
    if (s.phase === 'ask' || s.phase === 'steal') return { state: { ...s, phase: 'over' }, events: [{ type: 'moment', name: 'timeup', team: s.team }] };
  }
  if (action === 'steal' && stealSeconds && !s.steal && open(s)) {
    const reason = s.phase === 'over' ? 'timeout' : 'wrong', team = s.team === 1 ? 2 : 1;
    return {
      state: { ...s, phase: 'steal', team, steal: { team, reason }, paused: null },
      events: [{ type: 'timer', seconds: stealSeconds, resume: true }, { type: 'moment', name: 'steal', reason, team }],
    };
  }
  if (action === 'reveal' && open(s)) return { state: { ...s, phase: 'revealed', paused: null }, events: [{ type: 'moment', name: 'reveal' }] };
  return null;
}

// رقم الفريق من «pick:1» و«pick:2» و«pick:0»، أو null.
export function picked(action) {
  const [id, arg] = String(action).split(':');
  return id === 'pick' && ['0', '1', '2'].includes(arg) ? Number(arg) : null;
}

// العدّاد على الشاشة (design/s8b.md 1.1): total وقت المرحلة كاملاً (5 للتمهيد، 10 لوقت الخصم)، وclock الرقم حين لا عدّاد جارياً
// (ما بقي إن كان موقوفاً، و0 بعد انتهاء الوقت). وhold: العدّاد ظاهر بلا عدّ (موقوف، أو انتهى وقته). والكشف وما بعده بلا عدّاد.
export function clockView(s, seconds, stealSeconds = 0) {
  const total = s.phase === 'ready' ? LEAD_SECONDS : s.steal ? stealSeconds : seconds;
  const hold = !!s.paused || s.phase === 'over';
  return { clock: s.paused ? Math.ceil(s.paused) : s.phase === 'over' ? 0 : total, total, lead: s.phase === 'ready', paused: !!s.paused, hold };
}
