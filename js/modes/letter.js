// النمط الأول: «الحرف المعيّن» (القسم 5.3 من الوثيقة، وتصميمه design/letter.md). وحدة تلتزم «عقد الوحدة».
// جولته جولة الكلمة (js/modes/word.js): حرف واحد في المربع، و30 ثانية للسؤال (5.3 و12).
import { wordMode } from './word.js';
export { STEAL_SECONDS, POINTS } from './word.js';

export const SECONDS = 30;

export default wordMode({
  id: 'letter',
  name: 'الحرف المعيّن',
  order: 1,
  seconds: SECONDS,
  key: 'letter',
  // نص الافتتاح (design/letter.md 2.4).
  rule: 'أجب بكلمة تبدأ بالحرف المعيّن',
});
