// «عقد الوحدة»: ما يلتزمه كل نمط ليكون وحدة مستقلة (docs/module-contract.md).
// checkMode تفحص شكل الوحدة، فلا تدخل القائمة وحدة ناقصة.
import { MODES as CONTENT_MODES, MODE_NAME_MAX } from '../content-check.js';

export const REQUIRED = {
  id: 'string', name: 'string', order: 'number', contentKey: 'string',
  setup: 'function', actions: 'function', act: 'function',
  audience: 'function', finished: 'function', used: 'function',
};
// presenter اختياري (الوثيقة 1.13: لا نافذة مقدّم): ما يحتاجه التحكم ولا يصل إلى الجمهور، كنصّ باركود الإجابات.
export const OPTIONAL = { presenter: 'function' };

export function checkMode(mod) {
  const errors = [];
  const where = `النمط «${mod?.id ?? '؟'}»`;
  if (!mod || typeof mod !== 'object') return [`${where}: الوحدة يجب أن تصدّر كائناً`];
  for (const [key, type] of Object.entries(REQUIRED)) {
    if (typeof mod[key] !== type) errors.push(`${where}: «${key}» مطلوب (${type})`);
  }
  for (const [key, type] of Object.entries(OPTIONAL)) {
    if (key in mod && typeof mod[key] !== type) errors.push(`${where}: «${key}» إن وُجد فـ ${type}`);
  }
  if (typeof mod.name === 'string' && [...mod.name].length > MODE_NAME_MAX) {
    errors.push(`${where}: «name» أطول من ${MODE_NAME_MAX} حرفاً (خانة المسار في شاشة المواجهة)`);
  }
  if (typeof mod.id === 'string' && !CONTENT_MODES.includes(mod.id)) {
    errors.push(`${where}: لا ملف أسئلة له في صيغة المحتوى (المعروف: ${CONTENT_MODES.join(' · ')})`);
  }
  return errors;
}
