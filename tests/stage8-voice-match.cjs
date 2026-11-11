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

  // ملاحظة المعاين 100: كلمات يومية لا تُضيء عنصراً لم يُقل، في أي موضوع.
  const lit = text => bank.topics.flatMap(t => matchMany(text, prepare(t.items)).map(m => t.items[m.i].name));
  for (const w of ['خلاص', 'ثلاثة', 'ثانية', 'كمان', 'القاعة'])
    check(`«${w}» لا تُضيء شيئاً (${lit(w).join('، ')})`, lit(w).length === 0);
  const { FILLER_WORDS } = await import(path.join(root, 'js/voice-match.js'));
  const words = new Set(bank.topics.flatMap(t => t.items.flatMap(it => [it.name, ...(it.alts ?? [])])).flatMap(f => fold(f).split(' ')));
  const clash = (FILLER_WORDS ?? ["—"]).filter(w => words.has(fold(w)));
  check(`لا كلمة مُهملة في اسم أو بديل في البنك (${clash.join("، ")})`, !!FILLER_WORDS && clash.length === 0);
  // ملاحظة المعاين 101: كل عنصر من كلمة قصيرة (حرفان فأقل بعد الطيّ) يُضيء بالواو الملتصقة («وقط»، «ودب»).
  const short = [], noWaw = [];
  for (const t of bank.topics) {
    const p = prepare(t.items);
    t.items.forEach((it, i) => {
      if (/ /.test(fold(it.name)) || fold(it.name).length > 2) return;
      short.push(it.name);
      if (!matchMany(`و${it.name}`, p).some(m => m.i === i)) noWaw.push(it.name);
    });
  }
  check(`العناصر القصيرة (${short.length}) تُضيء بالواو (${noWaw.join('، ')})`, short.length >= 17 && noWaw.length === 0);
  // وكل اسم وبديل في البنك يُضيء عنصره إذا قيل وحده، ومنه ما أوله واو («وسادة»، «وليد»، «حمار وحشي»).
  const self = [];
  for (const t of bank.topics) {
    const p = prepare(t.items);
    t.items.forEach((it, i) => { for (const f of [it.name, ...(it.alts ?? [])]) if (!matchMany(f, p).some(m => m.i === i)) self.push(f); });
  }
  check(`كل اسم وبديل يُضيء عنصره (${self.slice(0, 8).join('، ')})`, self.length === 0);
  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
