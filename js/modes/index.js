// سجل الأنماط: كل نمط سطر واحد هنا وملف في js/modes/. وقائمة الاختيار تُبنى منه تلقائياً.
// الأنماط الأربعة تُضاف شريحة بعد شريحة (ش2 إلى ش5).
export const MODES = [];

// الأنماط التي تظهر للفريقين عند الاختيار: بترتيبها، ما لم تستثنه الحزمة، وله ملف أسئلة فيها، ولم يُلعب في المباراة.
export function pickableModes({ modes = MODES, pack, files, played = [] }) {
  const excluded = pack?.excludeModes ?? [];
  return [...modes]
    .sort((a, b) => a.order - b.order)
    .filter(m => !excluded.includes(m.id) && files?.[`${m.id}.json`] && !played.includes(m.id))
    .map(m => ({ id: m.id, name: m.name }));
}
