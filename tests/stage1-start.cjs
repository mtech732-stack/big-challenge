// اختبار آلي لبدء المباراة على الشاشة المشتركة (الوثيقة 1.1، design/shared.md): نافذة واحدة يشترك فيها المقدّم والجمهور
// حتى «ابدأ المباراة»، وكل اختيار بالنقر على عنصره (الاسمان في اللوحتين، وعدد الأنماط 2 أو 4، وخانات الأنماط)،
// ولا شريط سفلي، ولا تفاصيل قواعد على الشاشة. ثم تُفتح نافذة المقدّم وتبقى هذه شاشة الجمهور، وتعود إليها المباراة الجديدة.
const { chromium } = require('playwright');
const { usePin, unlock, reporter, testPinRecord, stageFrame, cmd, sharedToFace, beginTwo } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { check, finish } = reporter();
  const errors = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const LONG = ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'];
  // ما لا يُكتب على الشاشة المشتركة (الوثيقة 1.1، 7.3): تفاصيل القواعد، والسرقة، والفارق.
  const FORBIDDEN = ['قصيرة', 'كاملة', 'الحزمة', 'حزمة', 'سهل', 'متوسط', 'صعب', 'سرقة', 'بفارق', 'يتقدّم', 'يتأخر', 'جولتان', '4 جولات'];

  // الشاشة المشتركة تُفتح على التلفاز: 1920×1080.
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  await usePin(context);
  let pinFetches = 0;
  context.on('request', r => { if (r.url().includes('pin.json')) pinFetches++; });
  context.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    // ملف نمط لم يُكتب بعد يعود 404، وهذا متوقع.
    p.on('console', m => m.type() === 'error' && !/content\/packs\/.+\.json/.test(m.location().url) && errors.push(m.text()));
  });

  const page = await context.newPage();
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await unlock(page);
  let frame = await stageFrame(page);
  const text = sel => frame.textContent(sel).then(t => t.replace(/\s+/g, ' ').trim());
  const vis = sel => frame.isVisible(sel);
  const saved = () => page.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')));
  const forbidden = async () => { const t = await frame.evaluate(() => document.body.innerText); return FORBIDDEN.filter(w => t.includes(w)); };
  let words = [];
  const noWords = async label => { const f = await forbidden(); if (f.length) words.push(`${label}: ${f.join('، ')}`); };
  let layoutOk = true;
  const fails = [];
  // بعد انتهاء انتقال المؤشر بين اللوحتين (0.3 ثانية): الفحص للحالة المستقرة.
  const stageCheck = async label => {
    await wait(400);
    const r = await frame.evaluate(() => window.__stageCheck());
    if (!r.ok) { layoutOk = false; fails.push(`${label}: ${r.problems.join('، ')}`); }
  };

  // 1. الإعداد على الشاشة المشتركة
  check('بعد الرقم السري: الشاشة المشتركة تملأ النافذة، ولا شريط سفلي', await page.isVisible('#single') && !(await page.$('#band')) && await page.evaluate(() => {
    const f = document.getElementById('frame').getBoundingClientRect();
    return Math.round(f.width) === 1920 && Math.round(f.height) === 1080;
  }));
  check('الإعداد: «التحدي الكبير» وحقلا الاسمين في اللوحتين', (await text('.scr.show')).includes('التحدي الكبير') && await vis('#i1') && await vis('#i2')
    && (await frame.getAttribute('#i1', 'placeholder')) === 'اكتب اسم الفريق الأول' && (await frame.getAttribute('#i2', 'placeholder')) === 'اكتب اسم الفريق الثاني');
  check('الإعداد: «عدد الأنماط» بخانتين 2 و4، والمتاح نمطان فـ2 مختارة و4 معطّلة', (await text('#count .lbl')) === 'عدد الأنماط'
    && await frame.$eval('[data-cmd="count:short"]', e => e.classList.contains('sel')) && await frame.$eval('[data-cmd="count:full"]', e => e.classList.contains('off')));
  check('الإعداد: «ابدأ القرعة» في البطاقة، و«ملء الشاشة» في الزاوية', await vis('.scr.show .ctl [data-cmd="draw"]') && await vis('#cornerB [data-cmd="fullscreen"]'));
  check('الإعداد: لا شارات ولا سطر تحت العنوان', !(await vis('#b1')) && !(await vis('#b2')) && !(await vis('.scr.title .sub')));
  await noWords('الإعداد');
  await stageCheck('الإعداد');
  await page.screenshot({ path: `${shots}/s1-shared-setup.png` });

  await cmd(frame, 'draw');
  await wait(200);
  check('خطأ في البطاقة: «اكتب اسم الفريق الأول»', (await text('#err')) === 'اكتب اسم الفريق الأول');
  await frame.fill('#i1', 'الصقور');
  await cmd(frame, 'draw');
  await wait(200);
  check('خطأ: «اكتب اسم الفريق الثاني»', (await text('#err')) === 'اكتب اسم الفريق الثاني');
  await frame.fill('#i2', ' الصقور ');
  await cmd(frame, 'draw');
  await wait(200);
  check('خطأ: «الاسمان متطابقان. غيّر أحدهما.»', (await text('#err')) === 'الاسمان متطابقان. غيّر أحدهما.');
  await stageCheck('خطأ الإعداد');
  await frame.fill('#i2', 'أبعد من ثمانية عشر حرفاً بكثير');
  check('الحقل لا يتجاوز 18 حرفاً', [...await frame.inputValue('#i2')].length === 18);
  await frame.fill('#i2', '');
  await frame.type('#i2', 'فريق ٣');
  await wait(200);
  check('الأرقام الهندية في الاسم تصير إنجليزية، وتُحفظ', (await frame.inputValue('#i2')) === 'فريق 3' && (await saved()).teams[2] === 'فريق 3');
  await frame.fill('#i2', 'النجوم');
  await wait(100);
  check('الاسمان محفوظان كما كُتبا', (await saved()).teams[1] === 'الصقور' && (await saved()).teams[2] === 'النجوم');
  await frame.click('[data-cmd="count:full"]', { force: true });
  await wait(100);
  check('النقر على 4 المعطّلة لا يختارها', (await saved()).method === 'short');

  // 2. القرعة: Enter في الحقل الثاني = «ابدأ القرعة»، والرقم السري يُتحقق منه.
  const before = pinFetches;
  await frame.press('#i2', 'Enter');
  await frame.waitForSelector('.scr.show[data-s="spin"]', { timeout: 5000 });
  check('Enter في الحقل الثاني يبدأ القرعة، ويتحقق من الرقم السري', pinFetches > before);
  check('القرعة: «القرعة» شارة، ولا زر أثناء الحركة', (await text('#b1')) === 'القرعة' && !(await frame.$('.scr.show .ctl .cbtn')));
  await stageCheck('القرعة');
  await frame.waitForSelector('[data-cmd="toPick"]', { timeout: 6000 });
  const W = (await saved()).winner, L = W === 1 ? 2 : 1, names = { 1: 'الصقور', 2: 'النجوم' };
  check(`القرعة محسومة (الفائز ${W}) واسمه على الشاشة، ثم «اختيار الأنماط»`, (await text('#winner')) === names[W]);
  await stageCheck('نتيجة القرعة');

  // 3. اختيار الأنماط بالنقر على خاناتها
  await cmd(frame, 'toPick');
  await wait(200);
  check('الاختيار: الخانتان تُنقران، و«يختار نمط الجولة 1»', (await frame.$$('#tiles .tile[data-cmd]')).length === 2 && (await text('#pickHead')) === `${names[W]} يختار نمط الجولة 1`);
  await stageCheck('الاختيار');
  await cmd(frame, 'pick:last-two');
  await wait(200);
  check('الخانة بلون الفائز ولا تُنقر بعدها، والدور للآخر، و«تراجع» في البطاقة', await frame.$eval('[data-mode="last-two"]', (e, w) => e.classList.contains('by' + w) && !e.dataset.cmd, W)
    && (await text('#pickHead')).startsWith(names[L]) && await vis('[data-cmd="undoPick"]'));
  await cmd(frame, 'undoPick');
  await wait(200);
  check('«تراجع» يرفع الاختيار', !(await saved()).picks.length);
  await cmd(frame, 'pick:last-two');
  await cmd(frame, 'pick:letter');
  await wait(200);
  check('اكتمل: «اكتمل اختيار الأنماط» و«إلى المواجهة»', (await text('#pickHead')) === 'اكتمل اختيار الأنماط' && await vis('[data-cmd="toFace"]'));
  await stageCheck('اكتمل الاختيار');

  // 4. المواجهة
  await cmd(frame, 'toFace');
  await frame.waitForSelector('.scr.show[data-s="face"]');
  await wait(2700);
  const track = await frame.$$eval('#track .seg', s => s.map(x => [...x.children].map(c => c.textContent.trim()).join(' ')).join(' | '));
  check(`المواجهة: المسار (${track})`, track === 'الجولة 1 آخر حرفين | عجلة البونص | الجولة 2 الحرف المعيّن');
  check('المواجهة: «ابدأ المباراة» و«بنافذة واحدة» و«أعد العرض»', (await frame.$$eval('.scr.show .ctl .cbtn', b => b.map(x => x.textContent).join('|'))) === 'ابدأ المباراة|بنافذة واحدة|أعد العرض');
  await noWords('المواجهة');
  await stageCheck('المواجهة');
  await page.screenshot({ path: `${shots}/s1-shared-face.png` });

  // 5. الحفظ: إعادة تحميل الشاشة المشتركة قبل «ابدأ المباراة» تطلب الرقم، ثم تعود المواجهة.
  await page.reload();
  check('إعادة التحميل: يُطلب الرقم', await page.isVisible('#pin'));
  await unlock(page);
  frame = await stageFrame(page);
  check('ثم تعود المواجهة كما هي', await vis('.scr.show[data-s="face"]') && await vis('[data-cmd="begin"]'));

  // 6. منع النوافذ المنبثقة: تبقى الشاشة المشتركة، والسبب في البطاقة.
  await page.evaluate(() => { window.open = () => null; });
  await cmd(frame, 'begin');
  await wait(300);
  check('النافذة ممنوعة: السبب في البطاقة، والمباراة لم تبدأ', (await text('#faceErr')).startsWith('منع المتصفح نافذة المقدّم') && (await saved()).step === 'face');
  await stageCheck('النافذة ممنوعة');
  await page.reload();
  await unlock(page);
  frame = await stageFrame(page);

  // 7. «ابدأ المباراة»: تُفتح نافذة المقدّم بلا رقم، وتبقى هذه شاشة الجمهور بلا أزرار.
  const host = await beginTwo(context, frame);
  await frame.waitForSelector('.scr.show[data-s="intro"]', { timeout: 6000 });
  await wait(300);
  check('نافذة المقدّم: تُفتح دون طلب الرقم، وفيها افتتاح الجولة 1', !(await host.isVisible('#pin')) && await host.isVisible('#introHead') && (await host.textContent('#introHead')).includes('الجولة 1'));
  check('الشاشة المشتركة صارت شاشة جمهور: الافتتاح، ولا زر', !(await frame.$('.cbtn')) && await page.evaluate(() => sessionStorage.getItem('big-challenge.role')) === 'stage');
  await host.click('#showQ');
  await frame.waitForSelector('.scr.show[data-s="q"]', { timeout: 5000 });
  check('نافذة المقدّم تقود شاشة الجمهور: السؤال 1', (await text('#b1')) === 'السؤال 1 من 6');
  await page.reload();
  frame = await stageFrame(page);
  await frame.waitForSelector('.scr.show[data-s="q"]', { timeout: 6000 });
  check('إعادة تحميل شاشة الجمهور: تبقى شاشة جمهور بلا رقم، ومتصلة', !(await page.isVisible('#pin')) && !(await frame.$('.cbtn')));

  // 8. أُغلقت نافذة المقدّم: «تابع بنافذة واحدة»، ثم «افتح نافذة المقدّم» من الزاوية.
  await host.close();
  await page.waitForSelector('#resume:not([hidden])', { timeout: 5000 });
  check('أُغلقت نافذة المقدّم: زر «تابع بنافذة واحدة»', (await page.textContent('#resume')).includes('تابع بنافذة واحدة'));
  await page.click('#resume');
  await frame.waitForSelector('#near .cbtn', { timeout: 6000 });
  check('المتابعة بنافذة واحدة: أزرار الحكم بجانب العدّاد، والسؤال كما كان', (await saved()).single === true && (await text('#b1')) === 'السؤال 1 من 6'
    && await vis('#cornerA [data-cmd="presenter"]'));
  const [host2] = await Promise.all([context.waitForEvent('page'), cmd(frame, 'presenter')]);
  await host2.waitForSelector('#app:not([hidden])', { timeout: 10000 });
  await wait(400);
  check('«افتح نافذة المقدّم»: تُفتح والسؤال فيها، والشاشة بلا أزرار', (await host2.textContent('#qMeta')).includes('السؤال 1 من 6') && !(await frame.$('.cbtn')) && (await saved()).single === false);

  // 9. مباراة جديدة من نافذة المقدّم: تعود إلى الشاشة المشتركة، وتُغلق نافذة المقدّم.
  host2.on('dialog', d => d.accept());
  // «مباراة جديدة» في افتتاح الجولة ونهايتها: ننهي السؤال ونصل إلى النهاية بأقصر طريق.
  for (let i = 0; i < 6; i++) {
    await host2.click('#yes'); await wait(750);
    await host2.click('#nextQ'); await wait(750);
  }
  const closed = host2.waitForEvent('close', { timeout: 6000 }).then(() => true, () => false);
  await host2.click('[data-part="end"] [data-new]');
  check('مباراة جديدة: نافذة المقدّم تُغلق', await closed);
  await frame.waitForSelector('.scr.show[data-s="title"]', { timeout: 6000 });
  await wait(300);
  check('والشاشة المشتركة تعود إلى الإعداد بحقليها', await vis('#i1') && await vis('[data-cmd="draw"]') && await page.evaluate(() => sessionStorage.getItem('big-challenge.role')) === 'presenter');

  // 10. أطول اسمين، بالعددين (برابط المعاينة: 4 أنماط)، وفحص التداخل في كل شاشة.
  await page.goto(base + '?preview');
  await unlock(page);
  frame = await stageFrame(page);
  for (const count of ['full', 'short']) {
    if ((await saved()).step !== 'setup') { page.once('dialog', d => d.accept()); await cmd(frame, 'new'); await frame.waitForSelector('.scr.show[data-s="title"]'); }
    await frame.fill('#i1', LONG[0]);
    await frame.fill('#i2', LONG[1]);
    await cmd(frame, 'count:' + count);
    await wait(150);
    if (count === 'full') check('المعاينة: 4 متاحة ومختارة افتراضياً', await frame.$eval('[data-cmd="count:full"]', e => e.classList.contains('sel') && !e.classList.contains('off')));
    await stageCheck(`${count}/الإعداد`);
    await cmd(frame, 'draw');
    await stageCheck(`${count}/القرعة`);
    await cmd(frame, 'toPick');
    const order = count === 'full' ? ['letter', 'last-two', 'auction'] : ['ranking', 'letter'];
    for (const id of order) { await stageCheck(`${count}/اختيار`); await cmd(frame, 'pick:' + id); }
    await wait(350);
    await stageCheck(`${count}/اكتمل`);
    await cmd(frame, 'toFace');
    await wait(2700);
    await stageCheck(`${count}/المواجهة`);
    await noWords(`${count}/المواجهة`);
    if (count === 'full') await page.screenshot({ path: `${shots}/s1-shared-face-long.png` });
  }
  await page.setViewportSize({ width: 1366, height: 768 });
  await wait(200);
  await stageCheck('المواجهة على 1366');
  check('الإطار يُصغَّر معاً ويتسع للنافذة 1366×768', await page.evaluate(() => {
    const f = document.getElementById('frame').getBoundingClientRect();
    return Math.abs(f.width / f.height - 16 / 9) < .01 && f.width <= innerWidth + 1 && f.height <= innerHeight + 1;
  }));

  // 11. الرقم السري يتغيّر قبل مباراة جديدة: «ابدأ القرعة» يُغلق اللعبة.
  page.once('dialog', d => d.accept());
  await cmd(frame, 'new');
  await frame.waitForSelector('.scr.show[data-s="title"]');
  await frame.fill('#i1', 'أ');
  await frame.fill('#i2', 'ب');
  await usePin(context, testPinRecord('246801'));
  await cmd(frame, 'draw');
  await page.waitForSelector('#gate:not([hidden])', { timeout: 5000 });
  check('تغيّر الرقم: «ابدأ القرعة» يُغلق اللعبة ويطلب الجديد', (await page.textContent('#pin-error')).includes('تغيّر الرقم السري'));

  check(`فحص التداخل على الشاشة المشتركة في كل حالة${fails.length ? ': ' + fails.slice(0, 3).join(' | ') : ''}`, layoutOk);
  check(`لا تفاصيل قواعد على الشاشة المشتركة${words.length ? ': ' + words.join(' | ') : ''}`, !words.length);
  const ok = finish(errors);
  await browser.close();
  process.exit(ok && !errors.length ? 0 : 1);
})();
