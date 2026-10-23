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
    ['عنصر مزاد مكرر بصيغة أخرى', c => { c.packs.general['auction.json'].topics[1].items.push({ name: 'الإثنين' }); }, 'يتكرر مع العنصر'],
    ['قائمة ترتيب من 12 عنصراً', c => { c.packs.general['ranking.json'].lists[0].items.pop(); }, '13 عنصراً بالضبط'],
    ['ترتيب خارج تسلسله', c => { c.packs.general['ranking.json'].lists[0].items[4].rank = 7; }, '«rank» يجب أن يكون 5'],
    ['مصدر واحد للترتيب', c => { c.packs.general['ranking.json'].lists[0].sources.pop(); }, 'مصدران على الأقل'],
    ['عنوان ترتيب بلا سنة', c => { c.packs.general['ranking.json'].lists[0].title = 'أطول الأبراج'; }, 'العنوان يجب أن يذكر سنة القائمة'],
    ['ملف نمط مفقود', c => { delete c.packs.general['auction.json']; }, 'الملف مفقود'],
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

  // تنبيهات لا تمنع: يراجعها الكاتب بعينه.
  const soft = examples();
  soft.packs.general['letter.json'].questions[0].answer = 'هاتف';
  soft.packs.general['last-two.json'].questions[0].answer = 'كوب';
  const w = checkContent(soft);
  check('تنبيه: الإجابة لا تبدأ بالحرف', w.warnings.some(x => x.includes('لا تبدأ بالحرف')) && w.errors.length === 0);
  check('تنبيه: الإجابة لا تنتهي بالحرفين', w.warnings.some(x => x.includes('لا تنتهي')));

  // ما يجب ألّا يُعدّ خطأ.
  const ok = examples();
  ok.packs.general['letter.json'].questions[1].answer = 'التفاحة';
  ok.packs.general['letter.json'].questions[0].page = 23;
  ok.packs.general['pack.json'].excludeModes = ['ranking'];
  delete ok.packs.general['ranking.json'];
  check('مقبول: «ال» في أول الإجابة، ورقم الصفحة، وحزمة تستثني الترتيب دون ملفه', checkContent(ok).errors.length === 0);

  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
