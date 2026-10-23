// «عقد الوحدة»: ما يلتزمه كل نمط ليكون وحدة مستقلة (docs/module-contract.md).
// checkMode تفحص شكل الوحدة، فلا تدخل القائمة وحدة ناقصة.
import { MODES as CONTENT_MODES } from '../content-check.js';

export const REQUIRED = {
  id: 'string', name: 'string', order: 'number', contentKey: 'string',
  setup: 'function', actions: 'function', act: 'function',
  audience: 'function', presenter: 'function', finished: 'function', used: 'function',
};

export function checkMode(mod) {
  const errors = [];
  const where = `النمط «${mod?.id ?? '؟'}»`;
  if (!mod || typeof mod !== 'object') return [`${where}: الوحدة يجب أن تصدّر كائناً`];
  for (const [key, type] of Object.entries(REQUIRED)) {
    if (typeof mod[key] !== type) errors.push(`${where}: «${key}» مطلوب (${type})`);
  }
  if (typeof mod.id === 'string' && !CONTENT_MODES.includes(mod.id)) {
    errors.push(`${where}: لا ملف أسئلة له في صيغة المحتوى (المعروف: ${CONTENT_MODES.join(' · ')})`);
  }
  return errors;
}
