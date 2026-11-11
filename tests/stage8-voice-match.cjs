// اختبار آلي للمطابقة الصوتية (js/voice-match.js، الوثيقة 5.5.1) على بنك المزاد كله، دون متصفح:
// ملاحظة المعاين 95: عنصر قيل مرتين لا يُضيء عنصراً يشبهه («محمد» مرتين لا تُضيء «محمود»، و«قلم رصاص» مرتين لا تُضيء «مقلمة»).
// فلكل زوج في موضوع واحد يتشابه بدرجة الإضاءة (0.8 فأكثر)، قول الأول مرتين يُضيئه وحده. ومعه أن ذكر الاثنين يُضيئهما معاً.
const fs = require('fs');
const path = require('path');
const { reporter } = require('./helpers.cjs');

(async () => {
  const root = path.join(__dirname, '..');
  const { prepare, matchMany, fold, sim, SURE } = await import(path.join(root, 'js/voice-match.js'));
  const { check, finish } = reporter();
  const bank = JSON.parse(fs.readFileSync(path.join(root, 'content/packs/general/auction.json'), 'utf8'));
  const pairs = [];
  for (const t of bank.topics) {
    const p = prepare(t.items);
    for (const a of p) for (const b of p) if (a.i !== b.i && a.forms.some(x => b.forms.some(y => sim(x, y) >= SURE))) pairs.push({ t, p, a, b });
  }
  const bad = [], both = [];
  for (const { t, p, a, b } of pairs) {
    const twice = matchMany(`${a.name} ثم ${a.name}`, p).map(m => m.i);
    if (twice.length !== 1 || twice[0] !== a.i) bad.push(`${a.name}→${twice.map(i => t.items[i].name).join('+')}`);
    const two = matchMany(`${a.name} ثم ${b.name}`, p).map(m => m.i);
    if (!(two.includes(a.i) && two.includes(b.i))) both.push(`${a.name}+${b.name}→${two.map(i => t.items[i].name).join('+')}`);
  }
  check(`في البنك أزواج متشابهة بدرجة الإضاءة (${pairs.length / 2})`, pairs.length > 0);
  check(`كل اسم قيل مرتين يُضيء نفسه وحده لا شبيهه (${bad.slice(0, 8).join('، ')})`, bad.length === 0);
  check(`وذكر الشبيهين معاً يُضيئهما (${both.slice(0, 8).join('، ')})`, both.length === 0);
  const p = prepare([{ name: 'محمد' }, { name: 'محمود' }]);
  check('«محمد» مرتين: «محمد» وحده', JSON.stringify(matchMany('محمد يعني محمد', p).map(m => m.i)) === '[0]');
  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
