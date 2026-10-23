// النمط الثاني: «آخر حرفين» (القسم 5.4 من الوثيقة، وتصميمه design/last-two.md). وحدة تلتزم «عقد الوحدة».
// جولته جولة الكلمة (js/modes/word.js) كالحرف المعيّن، والفروق: حرفان قبلهما تطويل، و20 ثانية للسؤال،
// وسطر القبول بالوصف والحرفين. ولا يتكرر الحرفان في الجولة ما أمكن (ملاحظة تدقيق ش3).
import { wordMode } from './word.js';

export const SECONDS = 20;

export default wordMode({
  id: 'last-two',
  name: 'آخر حرفين',
  order: 2,
  seconds: SECONDS,
  key: 'ending',
  tatweel: true,
  distinct: true,
  // نصوص الافتتاح وسطر القبول (design/last-two.md 1).
  rule: 'أجب بكلمة تنتهي بالحرفين',
  accept: box => `وتُقبل أي كلمة أخرى تنتهي بـ «${box}» وتنطبق على الوصف.`,
});
