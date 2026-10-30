// اختبار آلي لفاحص ملفات الأسئلة: الأمثلة سليمة، وكل خطأ شائع يُكتشف برسالة واضحة.
const fs = require('fs');
const path = require('path');
const { reporter } = require('./helpers.cjs');

(async () => {
  const { checkContent } = await import(path.join(__dirname, '..', 'js', 'content-check.js'));
  const { check, finish } = reporter();
  const root = path.join(__dirname, '..', 'docs', 'content-examples');
  const read = file => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
  const examples = () => ({
    index: read('packs/index.json'),
    packs: { general: Object.fromEntries(['pack', 'letter', 'last-two', 'auction', 'ranking']
      .map(f => [`${f}.json`, read(`packs/general/${f}.json`)])) },
    wheel: read('wheel.json'),
  });

  const clean = checkContent(examples());
  check('ملفات المثال سليمة دون أخطاء ولا تنبيهات', clean.errors.length === 0 && clean.warnings.length === 0);

  // كل حالة: تعديل على نسخة من الأمثلة، ونص يجب أن يظهر في الأخطاء (أو التنبيهات).
  const cases = [
    ['أرقام هندية في نص السؤال', c => { c.packs.general['letter.json'].questions[0].prompt = 'البطارية ١٪'; }, 'أرقام هندية'],
    ['حقل مكتوب خطأ', c => { c.packs.general['letter.json'].questions[0].anwser = 'x'; }, 'حقل غير معروف «anwser»'],
    ['مستوى بالعربية', c => { c.packs.general['letter.json'].questions[0].level = 'صعب'; }, 'المستوى «صعب» غير صحيح'],
    ['مجال غير معروف', c => { c.packs.general['letter.json'].questions[0].domain = 'art'; }, 'المجال «art» غير صحيح'],
    ['معرّف مكرر', c => { c.packs.general['last-two.json'].questions[0].id = 'general-letter-001'; }, '«id» مكرر'],
    ['حرف من كلمتين', c => { c.packs.general['letter.json'].questions[0].letter = 'شا'; }, '«letter» حرف عربي واحد'],
    ['كسر تعادل غير صعب', c => { c.packs.general['letter.json'].questions[0].tiebreak = true; }, 'أسئلة كسر التعادل صعبة فقط'],
    ['نهاية بالتطويل', c => { c.packs.general['last-two.json'].questions[0].ending = 'ـان'; }, '«ending» حرفان عربيان'],
    ['عنصر مزاد مكرر بصيغة أخرى', c => { c.packs.general['auction.json'].topics[1].items.push({ name: 'ذو الحجّة' }); }, 'يتكرر مع العنصر'],
    ['قائمة مزاد دون 10 عناصر', c => { c.packs.general['auction.json'].topics[0].items.length = 9; }, '10 عناصر على الأقل'],
    ['«open» بغير true', c => { c.packs.general['auction.json'].topics[0].open = 'yes'; }, '«open» إما true وإما يُحذف'],
    ['موضوع مفتوح دون 40 عنصراً', c => { c.packs.general['auction.json'].topics[0].open = true; }, '40 عنصراً على الأقل'],
    ['موضوع مفتوح بلا معيار القبول', c => { const t = c.packs.general['auction.json'].topics[0]; t.open = true; delete t.note; }, '«note» معيار القبول لازم'],
    ['قائمة ترتيب من 12 عنصراً', c => { c.packs.general['ranking.json'].lists[0].items.pop(); }, '13 عنصراً بالضبط'],
    ['ترتيب خارج تسلسله', c => { c.packs.general['ranking.json'].lists[0].items[4].rank = 7; }, '«rank» يجب أن يكون 5'],
    ['مصدر واحد للترتيب', c => { c.packs.general['ranking.json'].lists[0].sources.pop(); }, 'مصدران على الأقل'],
    ['التطويل حرفاً في الحرف المعيّن', c => { c.packs.general['letter.json'].questions[0].letter = 'ـ'; }, '«letter» حرف عربي واحد'],
    ['أرقام هندية في إجابة بديلة', c => { c.packs.general['letter.json'].questions[0].alts = ['شاحن ٢']; }, 'فيه أرقام هندية'],
    ['ملاحظة داخلية فارغة', c => { c.packs.general['letter.json'].questions[0].note = ''; }, '«note» مطلوب نصاً غير فارغ'],
    ['مصدر مزاد بلا رابط كامل', c => { c.packs.general['auction.json'].topics[0].sources = [{ title: 'م', url: 'example.com', accessed: '2026-10-23' }]; }, '«url» رابط كامل'],
    ['حزمة غير مذكورة في الفهرس', c => { c.index.packs = ['study']; }, 'غير مذكور في الفهرس'],
    ['استثناء لا يُبقي مباراة قصيرة', c => { c.packs.general['pack.json'].excludeModes = ['auction', 'ranking', 'last-two']; }, 'لا تكفي الأنماط الباقية'],
    ['خانة حظ ناقصة', c => { c.wheel.luck.pop(); }, '«luck» ثلاث خانات'],
  ];
  for (const [name, mutate, expected] of cases) {
    const content = examples();
    mutate(content);
    const { errors } = checkContent(content);
    check(`يكتشف: ${name}`, errors.some(e => e.includes(expected)));
  }

  // المزاد المفتوح (المالك، 30 أكتوبر 2026): 40 عنصراً فأكثر مع معيار القبول سليم، وما لا يُعدّ خطأً تنبيهاتٌ يراجعها الكاتب.
  {
    const open = examples();
    const t = open.packs.general['auction.json'].topics[0];
    t.open = true;
    t.items = Array.from({ length: 40 }, (_, i) => ({ name: `عنصر ${i + 1}` }));
    const r = checkContent(open);
    check('موضوع مفتوح بـ40 عنصراً ومعيار القبول: سليم بلا تنبيه', r.errors.length === 0 && r.warnings.length === 0);
    const noNote = examples();
    delete noNote.packs.general['auction.json'].topics[1].note;
    const n = checkContent(noNote);
    check('موضوع غير مفتوح بلا معيار القبول: تنبيه لا خطأ', n.errors.length === 0 && n.warnings.some(x => x.includes('general-auction-002') && x.includes('معيار القبول')));
    const told = examples();
    told.packs.general['auction.json'].topics[0].topic = 'أشهر السنة من يناير';
    const w = checkContent(told);
    check('نص الموضوع يكشف إجابة منه: تنبيه باسمها', w.errors.length === 0 && w.warnings.some(x => x.includes('يكشف إجابة') && x.includes('يناير')));
    // كشف بين النمطين (تدقيق ش8): إجابة الحرف المعيّن كلمةً في نص آخر حرفين (وبحرف ملتصق كـ«والشاحن»)، أو العكس: خطأ باسميهما.
    const cross = examples(), lq = cross.packs.general['letter.json'].questions[0], tq = cross.packs.general['last-two.json'].questions[0];
    tq.prompt = `يحمله المسافر وال${lq.answer} في جيبه`;
    const x = checkContent(cross);
    check(`إجابة «${lq.answer}» في نص سؤال من آخر حرفين: خطأ باسميهما`, x.errors.some(e => e.includes(tq.id) && e.includes(lq.id) && e.includes(`«${lq.answer}»`)));
    const back = examples(), lq2 = back.packs.general['letter.json'].questions[0], tq2 = back.packs.general['last-two.json'].questions[0];
    lq2.prompt = `قبل ${tq2.answer} بقليل`;
    check('والعكس: إجابة آخر حرفين في نص الحرف المعيّن خطأ', checkContent(back).errors.some(e => e.includes(lq2.id) && e.includes(tq2.id)));
    const part = examples(), lq3 = part.packs.general['letter.json'].questions[0];
    part.packs.general['last-two.json'].questions[0].prompt = `${lq3.answer}ات كثيرة`;
    check('جزء كلمة لا يُعدّ كشفاً («شاحنات» ليست «شاحن»)', checkContent(part).errors.length === 0);
    // تحسينات المدقّق على #299: «عبد الله» كـ«عبدالله»، و«أبي» و«أبا» كـ«أبو»، والسوابق المركبة «ولل» و«فلل» و«وبال» و«فبال».
    const joined = (prompt, answer) => {
      const c = examples();
      c.packs.general['letter.json'].questions[0].answer = answer;
      c.packs.general['last-two.json'].questions[0].prompt = prompt;
      return checkContent(c).errors.some(e => e.includes('في مباراة واحدة'));
    };
    check('«عبد الله» بمسافة كـ«عبدالله»، والعكس', joined('سمّاه عبد الله', 'عبدالله') && joined('سمّاه عبدالله', 'عبد الله'));
    check('«أبي لهب» و«أبا لهب» كـ«أبو لهب»، و«أبيض» ليست «أبو»', joined('نزلت في أبي لهب', 'أبو لهب') && joined('رأوا أبا لهب', 'أبو لهب') && !joined('ثوب أبيض', 'أبو'));
    check('السوابق «ولل» و«فلل» و«وبال» و«فبال» تُحذف', joined('وللمسجد باب', 'المسجد') && joined('فللبيت رب', 'البيت') && joined('وبالقلم كتب', 'القلم') && joined('فبالصبر نفوز', 'الصبر'));
    const skip = examples();
    skip.packs.general['last-two.json'].questions[0].prompt = `مع ${skip.packs.general['letter.json'].questions[0].answer}`;
    skip.packs.general['pack.json'].excludeModes = ['last-two'];
    check('حزمة تستثني أحد النمطين: لا كشف بينهما', !checkContent(skip).errors.some(e => e.includes('في مباراة واحدة')));
    const { crossReveals } = await import(path.join(__dirname, '..', 'js', 'content-check.js'));
    const bank = f => JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content', 'packs', 'general', f), 'utf8'));
    const found = crossReveals({ 'letter.json': bank('letter.json'), 'last-two.json': bank('last-two.json') });
    check(`البنك الحالي: لا كشف بين الحرف المعيّن وآخر حرفين${found.length ? ' · ' + found.map(c => `${c.id}←${c.by}`).join('، ') : ''}`, found.length === 0);
    const { TARGETS } = await import(path.join(__dirname, '..', 'js', 'content-check.js'));
    check('الحرف المعيّن: 20 لكل مستوى، و20 لكسر التعادل', JSON.stringify(TARGETS.letter) === '{"easy":20,"medium":20,"hard":20,"tiebreak":20}');
  }

  // طلبات الكاتب: ما صار تنبيهاً بعد أن كان خطأً.
  const later = examples();
  delete later.packs.general['auction.json'];
  delete later.packs.general['ranking.json'];
  delete later.packs.general['last-two.json'];
  delete later.packs.general['letter.json'];
  const l = checkContent(later);
  check('حزمة بلا ملفات أنماط بعد (البنك يُكتب شريحة بعد شريحة): تنبيه لا خطأ',
    l.errors.length === 0 && l.warnings.some(x => x.includes('غير متاح بعد')) && l.warnings.some(x => x.includes('المتاحة الآن 0')));
  const noWheel = examples();
  delete noWheel.wheel;
  const nw = checkContent(noWheel);
  check('ملف العجلة غير موجود بعد (يُكتب في ش6): تنبيه لا خطأ',
    nw.errors.length === 0 && nw.warnings.some(x => x.includes('العجلة غير متاحة بعد')));
  const noYear = examples();
  noYear.packs.general['ranking.json'].lists[0].title = 'أطول الأبراج';
  const y = checkContent(noYear);
  check('عنوان ترتيب بلا سنة: تنبيه لا خطأ', y.errors.length === 0 && y.warnings.some(x => x.includes('لا يذكر سنة القائمة')));

  // «ال» تُحذف قبل توحيد الهمزات: لا تنبيه خاطئ على «ألماس»، ولا تكرار وهمي بين «ألبانيا» و«بانيا».
  const hamza = examples();
  Object.assign(hamza.packs.general['letter.json'].questions[0], { letter: 'أ', answer: 'ألماس', alts: ['إلكترون'] });
  hamza.packs.general['letter.json'].questions[0].alts = [];
  hamza.packs.general['auction.json'].topics[0].items.push({ name: 'ألبانيا' }, { name: 'بانيا' });
  const h = checkContent(hamza);
  check('«ألماس» لحرف «أ» دون تنبيه، و«ألبانيا» غير «بانيا»', h.errors.length === 0 && h.warnings.length === 0);

  // حد 85 حرفاً للسؤال وموضوع المزاد (نظام التصميم، القسم 7).
  const long = examples();
  long.packs.general['letter.json'].questions[0].prompt = 'ش'.repeat(85);
  long.packs.general['auction.json'].topics[0].topic = 'م'.repeat(85);
  check('السؤال والموضوع بـ85 حرفاً: مقبولان', checkContent(long).errors.length === 0);
  long.packs.general['letter.json'].questions[0].prompt = 'ش'.repeat(86);
  long.packs.general['last-two.json'].questions[0].prompt = 'ن'.repeat(80) + 'ُ'.repeat(6);
  long.packs.general['auction.json'].topics[0].topic = 'م'.repeat(86);
  const le = checkContent(long).errors;
  check('86 حرفاً (والتشكيل يُعدّ): خطأ في السؤال وآخر حرفين والموضوع',
    le.filter(e => e.includes('والحد 85')).length === 3);

  // تنبيهات لا تمنع: يراجعها الكاتب بعينه.
  const soft = examples();
  soft.packs.general['letter.json'].questions[0].answer = 'هاتف';
  soft.packs.general['last-two.json'].questions[0].answer = 'كوب';
  soft.packs.general['letter.json'].questions[1].alts = ['موز'];
  const w = checkContent(soft);
  check('تنبيه: الإجابة لا تبدأ بالحرف', w.warnings.some(x => x.includes('«هاتف» لا تبدأ بالحرف')) && w.errors.length === 0);
  check('تنبيه: الإجابة البديلة لا تبدأ بالحرف', w.warnings.some(x => x.includes('«موز» لا تبدأ بالحرف')));
  check('تنبيه: الإجابة لا تنتهي بالحرفين', w.warnings.some(x => x.includes('لا تنتهي')));

  // ما يجب ألّا يُعدّ خطأ.
  const ok = examples();
  ok.packs.general['letter.json'].questions[1].answer = 'التفاحة';
  ok.packs.general['letter.json'].questions[0].page = 23;
  ok.packs.general['letter.json'].questions[0].alts = ['شاحن الهاتف'];
  ok.packs.general['last-two.json'].questions[0].note = 'سبب القبول';
  ok.packs.general['auction.json'].topics[0].sources = [{ title: 'مصدر', url: 'https://example.com/a', accessed: '2026-10-23' }];
  ok.wheel.challenges[0].note = 'ملاحظة';
  ok.packs.general['pack.json'].excludeModes = ['ranking'];
  delete ok.packs.general['ranking.json'];
  const okResult = checkContent(ok);
  check('مقبول: «ال» في أول الإجابة، ورقم الصفحة، و«alts» و«note» و«sources» للمزاد، وحزمة تستثني الترتيب دون ملفه',
    okResult.errors.length === 0 && okResult.warnings.length === 0);

  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
