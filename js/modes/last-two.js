// النمط الثاني: «آخر حرفين» (القسم 5.4 من الوثيقة، وتصميمه design/last-two.md). وحدة تلتزم «عقد الوحدة».
// جولته جولة الكلمة (js/modes/word.js) كالحرف المعيّن، والفروق: حرفان قبلهما تطويل، و20 ثانية للسؤال،
// وسطر القبول بالوصف والحرفين. والجولة كلها بحرفين واحدين، يُعلنان في الافتتاح (الوثيقة 1.1، 5.4).
import { wordMode } from './word.js';

export const SECONDS = 20;

export default wordMode({
  id: 'last-two',
  name: 'آخر حرفين',
  order: 2,
  seconds: SECONDS,
  key: 'ending',
  tatweel: true,
  sameBox: true,
  // نصوص الافتتاح وسطر القبول (design/shared.md 5 وdesign/last-two.md 1).
  rule: box => `كل إجابات الجولة تنتهي بـ «${box}»`,
  accept: box => `وتُقبل أي كلمة أخرى تنتهي بـ «${box}» وتنطبق على الوصف.`,
});
