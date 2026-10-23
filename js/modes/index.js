// سجل الأنماط: كل نمط سطر واحد هنا وملف في js/modes/. وقائمة الاختيار تُبنى منه تلقائياً.
// الأنماط الأربعة تُضاف شريحة بعد شريحة (ش2 إلى ش5).
import letter from './letter.js';
import lastTwo from './last-two.js';

export const MODES = [letter, lastTwo];

// الأنماط الأربعة في الوثيقة (القسمان 3 و5) بأسمائها وترتيبها. ما لم تُبنَ وحدته بعد يظهر في الاختيار
// «معاينةً» حتى تُبنى في شريحتها، ليُجرَّب بدء المباراة كاملاً من ش1. وحين يُضاف نمط إلى MODES
// تسري عليه قواعد pickableModes كلها، ومنها ملف الأسئلة.
export const PLANNED = [
  { id: 'letter', name: 'الحرف المعيّن', order: 1 },
  { id: 'last-two', name: 'آخر حرفين', order: 2 },
  { id: 'auction', name: 'المزاد', order: 3 },
  { id: 'ranking', name: 'الترتيب', order: 4 },
];

// الأنماط التي تظهر للفريقين عند الاختيار: بترتيبها، ما لم تستثنه الحزمة، وله ملف أسئلة فيها، ولم يُلعب في المباراة.
export function pickableModes({ modes = MODES, pack, files, played = [] }) {
  const excluded = pack?.excludeModes ?? [];
  return [...modes]
    .sort((a, b) => a.order - b.order)
    .filter(m => !excluded.includes(m.id) && files?.[`${m.id}.json`] && !played.includes(m.id))
    .map(m => ({ id: m.id, name: m.name }));
}

// أنماط المباراة لحزمة: المبنية بقواعد pickableModes، ومعها المعاينة لما لم يُبنَ بعد (preview: true).
export function matchModes({ modes = MODES, planned = PLANNED, pack, files }) {
  const excluded = pack?.excludeModes ?? [];
  const built = pickableModes({ modes, pack, files }).map(m => ({ ...m, order: modes.find(x => x.id === m.id).order }));
  const previews = planned.filter(p => !modes.some(m => m.id === p.id) && !excluded.includes(p.id)).map(p => ({ ...p, preview: true }));
  return [...built, ...previews].sort((a, b) => a.order - b.order).map(({ order, ...m }) => m);
}
