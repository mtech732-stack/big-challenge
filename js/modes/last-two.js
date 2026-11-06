// النمط الثاني: «آخر حرفين» (القسم 5.4 من الوثيقة، وتصميمه design/last-two.md). وحدة تلتزم «عقد الوحدة».
// جولته جولة الكلمة (js/modes/word.js) كالحرف المعيّن، والفروق: حرفان قبلهما تطويل، و30 ثانية للسؤال (5.4 و12)،
// وسطر القبول بالوصف والحرفين. والجولة كلها بحرفين واحدين، يُعلنان في الافتتاح (الوثيقة 1.1، 5.4).
import { wordMode } from './word.js';

export const SECONDS = 30;

export default wordMode({
  id: 'last-two',
  name: 'آخر حرفين',
  order: 2,
  seconds: SECONDS,
  key: 'ending',
  tatweel: true,
  sameBox: true,
  // نص الافتتاح (design/shared.md 5 وdesign/last-two.md 1).
  rule: box => `كل إجابات الجولة تنتهي بـ «${box}»`,
});
