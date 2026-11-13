// اختبار آلي للمطابقة الصوتية (js/voice-match.js، الوثيقة 5.5.1) على بنك المزاد كله، دون متصفح:
// ملاحظة المعاين 95: عنصر قيل مرتين لا يُضيء عنصراً يشبهه («محمد» مرتين لا تُضيء «محمود»، و«قلم رصاص» مرتين لا تُضيء «مقلمة»).
// فلكل زوج في موضوع واحد يتشابه بدرجة الإضاءة (0.8 فأكثر)، قول الأول مرتين يُضيئه وحده. ومعه أن ذكر الاثنين يُضيئهما معاً.
const fs = require('fs');
const path = require('path');
const { reporter } = require('./helpers.cjs');

(async () => {
  const root = path.join(__dirname, '..');
  const { prepare, matchMany, matchOne, fold, sim, SURE } = await import(path.join(root, 'js/voice-match.js'));
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

  // ملاحظتا المعاين 100 و104: كلمات يومية يقولها الفريق والمقدّم لا تُضيء عنصراً لم يُقل، في أي موضوع.
  const lit = text => bank.topics.flatMap(t => matchMany(text, prepare(t.items)).map(m => t.items[m.i].name));
  const DAILY = ['وقت', 'الوقت', 'باقي وقت', 'خلص الوقت', 'وين', 'ساعة', 'الساعة', 'ثواني', 'ثانية', 'دقيقة', 'دقايق', 'من', 'خلاص', 'ثلاثة',
    'كمان', 'القاعة', 'ايوه', 'مرة ثانية', 'واحد', 'اثنين', 'أربعة', 'خمسة', 'ستة', 'سبعة', 'ثمانية', 'تسعة', 'عشرة', 'يعني', 'شنو', 'ايش',
    'وش', 'بعد', 'بعدين', 'والله', 'زين', 'لا', 'نعم', 'أي', 'اللي', 'هذا', 'هذي', 'ذاك', 'ما', 'في', 'عن', 'مع', 'ثم', 'أو', 'بس', 'يا',
    'احنا', 'انت', 'هم', 'شي', 'كذا', 'يمكن', 'أظن', 'صح', 'غلط', 'أسرع', 'يلا', 'ممكن', 'لحظة', 'آخر', 'كل', 'عندنا', 'ادري', 'أعرف',
    'طيب', 'اوكي', 'كيف', 'ليش', 'متى', 'هنا', 'الحين', 'توه', 'وبعد', 'وكمان', 'ولا', 'وهذا', 'من الحاضرين في القاعة'];
  const daily = DAILY.map(w => [w, lit(w)]).filter(([, l]) => l.length);
  check(`${DAILY.length} كلمة وعبارة يومية لا تُضيء شيئاً في البنك كله (${daily.map(([w, l]) => `${w}←${l.join('+')}`).join('، ')})`, DAILY.length >= 70 && daily.length === 0);
  for (const w of ['خلاص', 'ثلاثة', 'ثانية', 'كمان', 'القاعة', 'وقت', 'وين', 'ساعة', 'ثواني', 'من'])
    check(`«${w}» لا تُضيء شيئاً (${lit(w).join('، ')})`, lit(w).length === 0);
  // حارس المدقّق #514: والكلمة اليومية بواو ملتصقة («وخلاص»، «وثواني»، «والجواب») يومية كذلك، فلا تُضيء شيئاً.
  const wdaily = DAILY.filter(w => !/ /.test(w) && !w.startsWith('و')).map(w => [`و${w}`, lit(`و${w}`)]).filter(([, l]) => l.length);
  check(`الكلمات اليومية بالواو لا تُضيء شيئاً (${wdaily.map(([w, l]) => `${w}←${l.join('+')}`).join('، ')})`, wdaily.length === 0);
  // وحارسه الثاني: ما بقي بعد فصل الواو حرفان لا يُطابق إلا بلا طيّ («وكت» لا تُضيء «قط»، و«وبت» لا تُضيء «بط»)، و«وقط» تُضيئه.
  for (const [said, not] of [['وكت', 'قط'], ['وبت', 'بط']]) check(`«${said}» لا تُضيء «${not}» (${lit(said).join('، ')})`, !lit(said).includes(not));
  // و«اعتمد» (matchOne) بوجه الواو كذلك، حارس المدقّق #514.
  {
    const t = bank.topics.find(t => t.items.some(it => it.name === 'قط')), p = prepare(t.items), name = r => r && t.items[r.i].name;
    const one = { وقط: name(matchOne('وقط', p)), ودب: name(matchOne('ودب', p)), وكت: name(matchOne('وكت', p)), وين: name(matchOne('وين', p)) };
    const t2 = bank.topics.find(t => t.items.some(it => it.name === 'حمار وحشي')), z = matchOne('وحمار وحشي', prepare(t2.items));
    check(`«اعتمد» بالواو: «وقط» قط، و«ودب» دب، و«وكت» و«وين» لا شيء، و«وحمار وحشي» حمار وحشي (${JSON.stringify(one)}، ${z && t2.items[z.i].name})`,
      one.وقط === 'قط' && one.ودب === 'دب' && !one.وكت && !one.وين && z && t2.items[z.i].name === 'حمار وحشي');
  }
  // وفي جملة: «يقولون أسد ونمر وين الوقت باقي وقت» تُضيء أسد ونمر وحدهما (كانت تُضيء «قط» على v107).
  {
    const t = bank.topics.find(t => t.items.some(it => it.name === 'قط')), p = prepare(t.items);
    const got = matchMany('يقولون أسد ونمر وين الوقت باقي وقت', p).map(m => t.items[m.i].name);
    check(`«يقولون أسد ونمر وين الوقت باقي وقت»: أسد ونمر وحدهما (${got.join('، ')})`, JSON.stringify(got) === '["أسد","نمر"]');
  }
  // ملاحظة المعاين 101: كل عنصر من كلمة قصيرة (حرفان فأقل بعد الطيّ) يُضيء بالواو الملتصقة («وقط»، «ودب»).
  // إلا «ين»: «وين» كلمة يومية (104)، فتُقدَّم على العنصر.
  const short = [], noWaw = [];
  for (const t of bank.topics) {
    const p = prepare(t.items);
    t.items.forEach((it, i) => {
      if (/ /.test(fold(it.name)) || fold(it.name).length > 2) return;
      short.push(it.name);
      if (it.name !== 'ين' && !matchMany(`و${it.name}`, p).some(m => m.i === i)) noWaw.push(it.name);
    });
  }
  check(`العناصر القصيرة (${short.length}) تُضيء بالواو (${noWaw.join('، ')})`, short.length >= 17 && noWaw.length === 0);
  // ملاحظة المدقّق 103: الواو تُفصل أو تبقى لكل كلمة وحدها: «وحمار وحشي» تُضيء «حمار وحشي» لا «حمار».
  for (const [said, want] of [['وحمار وحشي', 'حمار وحشي'], ['وخنفساء وحيد القرن', 'خنفساء وحيد القرن']]) {
    const t = bank.topics.find(t => t.items.some(it => it.name === want)), p = prepare(t.items);
    const got = matchMany(`أسد ${said}`, p).map(m => t.items[m.i].name);
    check(`«${said}» تُضيء «${want}» (${got.join('، ')})`, got.includes(want) && !got.some(g => g !== want && want.includes(g)));
  }
  // وكل اسم وبديل في البنك يُضيء عنصره إذا قيل وحده، ومنه ما أوله واو («وسادة»، «وليد»، «حمار وحشي»).
  // إلا بديلاً هو كلمة يومية وحدها («من» بديل «حشرة المن»): اسمه يُضيئه.
  const { FILLER_WORDS } = await import(path.join(root, 'js/voice-match.js'));
  const filler = new Set((FILLER_WORDS ?? []).map(fold)), self = [], skipped = [];
  for (const t of bank.topics) {
    const p = prepare(t.items);
    t.items.forEach((it, i) => {
      for (const f of [it.name, ...(it.alts ?? [])]) {
        if (f !== it.name && filler.has(fold(f))) { skipped.push(f); continue; }
        if (!matchMany(f, p).some(m => m.i === i)) self.push(f);
      }
    });
  }
  check(`كل اسم وبديل يُضيء عنصره (${self.slice(0, 8).join('، ')}؛ بدائل يومية: ${skipped.join('، ')})`, !!FILLER_WORDS && self.length === 0 && skipped.length <= 1);
  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
