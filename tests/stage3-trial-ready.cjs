// اختبار آلي للبندين المؤجلين قبل المباراة القصيرة التجريبية (ملاحظة تدقيق ش1، البند 6):
// 1. لا يُختار في مباراة تُلعب إلا نمط مبني له ملف أسئلة في الحزمة (والمعاينة برابط «?preview» للتجربة وحدها).
// 2. عدد أنماط أكبر مما في الحزمة لا يُختار، فلا تعلق المباراة في اختيار الأنماط (حزمة تستثني نمطاً مع 4).
// وكل ذلك على الشاشة المشتركة بالنقر (الوثيقة 1.1): خانتا عدد الأنماط 2 و4، وخانات الأنماط.
const path = require('path');
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const root = path.join(__dirname, '..');
  const M = await import(path.join(root, 'js/match.js'));
  const { pickableModes, matchModes } = await import(path.join(root, 'js/modes/index.js'));
  const { check, finish } = reporter();
  const errors = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // دون متصفح: setupErrors بأنماط الحزمة.
  const ready = { ...M.newMatch({ pack: 'general', method: 'full' }), teams: { 1: 'الصقور', 2: 'النجوم' } };
  const two = [{ id: 'letter' }, { id: 'last-two' }];
  check('4 أنماط والمتاح 2: خطأ يطلب 2', M.setupErrors(ready, two)[0]?.text === 'المتاح 2 أنماط فقط. اختر 2.');
  check('نمطان والمتاح 2: لا خطأ', M.setupErrors({ ...ready, method: 'short' }, two).length === 0);
  check('نمطان والمتاح 1: خطأ', M.setupErrors({ ...ready, method: 'short' }, two.slice(0, 1))[0]?.text === 'المباراة تحتاج نمطين على الأقل، والمتاح 1.');
  check('4 أنماط والمتاح 4: لا خطأ، وبلا قائمة كما كانت', M.setupErrors(ready, [...two, { id: 'a' }, { id: 'b' }]).length === 0 && M.setupErrors(ready).length === 0);
  const files = { 'letter.json': {}, 'last-two.json': {}, 'auction.json': {} };
  check('قائمة الاختيار: المبنيّ وله ملف وحده (المزاد مبني منذ ش4، وبلا ملفه لا يُختار)', pickableModes({ pack: { excludeModes: [] }, files }).map(m => m.id).join(',') === 'letter,last-two,auction'
    && pickableModes({ pack: { excludeModes: [] }, files: { 'letter.json': {}, 'last-two.json': {} } }).map(m => m.id).join(',') === 'letter,last-two');
  check('المعاينة: الأنماط الأربعة إلا ما تستثنيه الحزمة', matchModes({ pack: { excludeModes: ['ranking'] }, files }).map(m => m.id).join(',') === 'letter,last-two,auction');

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  // عامل الخدمة محجوب كي تصل الحزمة التجريبية (context.route لا يرى طلباته).
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
  await usePin(context);
  context.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => m.type() === 'error' && !/content\/packs\/.+\.json/.test(m.location().url) && errors.push(m.text()));
  });
  const page = await context.newPage();
  let frame = null;
  const text = sel => frame.textContent(sel).then(t => t.replace(/\s+/g, ' ').trim());
  const sel = m => frame.$eval(`[data-cmd="count:${m}"]`, e => e.classList.contains('sel'));
  const off = m => frame.$eval(`[data-cmd="count:${m}"]`, e => e.classList.contains('off'));
  const reopen = async () => { await page.reload(); await unlock(page); frame = await stageFrame(page); await wait(300); };
  const open = async url => {
    await page.goto(url);
    await page.evaluate(() => localStorage.clear());
    await reopen();
  };
  const toPick = async () => {
    await frame.fill('#i1', 'الصقور');
    await frame.fill('#i2', 'النجوم');
    await cmd(frame, 'draw');
    await cmd(frame, 'toPick');
    await wait(200);
  };
  const tiles = () => frame.$$eval('#tiles .tile', b => b.map(x => x.dataset.mode).join(','));

  // 1. المباراة كما تُلعب: نمطان مبنيان.
  await open(base);
  check('الإعداد: 2 مختارة، و4 معطّلة بإطار متقطّع', await sel('short') && await off('full'));
  await frame.click('[data-cmd="count:full"]', { force: true });
  await wait(150);
  check('النقر على 4 لا يختارها', await sel('short') && !(await sel('full')));
  await toPick();
  check(`الاختيار: المبنية الثلاثة وحدها، بلا «الترتيب» (${await tiles()})`, (await tiles()) === 'letter,last-two,auction');
  await cmd(frame, 'pick:last-two');
  await cmd(frame, 'pick:letter');
  await cmd(frame, 'toFace');
  await wait(2500);
  check('المواجهة: «ابدأ المباراة»، لا «تخطَّ»', await frame.isVisible('[data-cmd="begin"]') && !(await frame.$('.scr.show [data-cmd="next"]')));

  // مباراة محفوظة في الإعداد بـ4 (من نسخة سابقة): تصير 2 عند الفتح.
  await page.evaluate(() => localStorage.setItem('big-challenge.match', JSON.stringify({ v: 1, step: 'setup', teams: { 1: '', 2: '' }, pack: 'general', method: 'full', winner: null, picks: [], scores: { 1: 0, 2: 0 }, history: [], single: false })));
  await reopen();
  check('إعداد محفوظ بـ4: يصير 2 عند الفتح', await sel('short'));

  // مباراة بدأت في رابط المعاينة (4، والمزاد للجولة 1) ثم فُتح الرابط العادي (تقرير المعاين ش3، الملاحظة 1):
  // تعود إلى الإعداد بالاسمين و2 ومعها سطر يشرح، فلا يقف الاختيار بلا زر.
  const saved = (step, extra = {}) => page.evaluate(([step, extra]) => localStorage.setItem('big-challenge.match', JSON.stringify({ v: 1, step, teams: { 1: 'الصقور', 2: 'النجوم' }, pack: 'general',
    method: 'full', winner: 1, picks: [{ mode: 'auction', by: 1 }], scores: { 1: 0, 2: 0 }, history: [], single: false, ...extra })), [step, extra]);
  await saved('pick');
  await reopen();
  check('اختيار من رابط المعاينة: يعود إلى الإعداد بالاسمين و2 وسطر يشرح', await frame.isVisible('[data-cmd="draw"]') && (await frame.inputValue('#i1')) === 'الصقور' && await sel('short')
    && (await text('#err')) === 'عادت المباراة إلى البداية.');
  await cmd(frame, 'draw');
  await cmd(frame, 'toPick');
  await cmd(frame, 'pick:letter');
  await cmd(frame, 'pick:last-two');
  check('بعدها يكتمل الاختيار بجولتين', await frame.waitForSelector('[data-cmd="toFace"]', { timeout: 3000 }).then(() => true, () => false));
  await saved('draw', { winner: null, picks: [] });
  await reopen();
  check('قرعة بـ4 من رابط المعاينة: تعود إلى الإعداد', await frame.isVisible('[data-cmd="draw"]') && await sel('short'));
  await saved('pick', { method: 'short', picks: [{ mode: 'letter', by: 1 }] });
  await reopen();
  check('اختيار سليم (2، الحرف المعيّن): يبقى كما هو، وخانتان تُنقران (آخر حرفين والمزاد)', (await frame.$$('#tiles .tile[data-cmd]')).length === 2 && !(await frame.isVisible('[data-cmd="draw"]')));
  // (المزاد صار مبنياً في ش4، فالجولة 1 هنا «الترتيب» غير المبني.)
  await saved('face', { picks: [{ mode: 'ranking', by: 1 }, { mode: 'letter', by: 2 }, { mode: 'last-two', by: 1 }, { mode: 'auction', by: 0 }] });
  await reopen();
  check('مواجهة من رابط المعاينة: تبقى، والجولة غير المبنية بزر «تخطَّ الجولة 1»', (await text('.scr.show [data-cmd="next"]')) === 'تخطَّ الجولة 1');
  // ملاحظة المعاين 1: أسماء الأنماط غير المبنية بالعربية في خانات المسار، لا معرّفاتها.
  const segs = await frame.$$eval('#track .seg .mname', e => e.map(x => x.textContent).join(' | '));
  check(`مواجهة من رابط المعاينة: الأنماط بأسمائها العربية (${segs})`, segs === 'الترتيب | الحرف المعيّن | آخر حرفين | المزاد');

  // 2. المعاينة للتجربة: «?preview» يعيد الأنماط الأربعة و4.
  await open(base + '?preview');
  check('«?preview»: 4 متاحة ومختارة', !(await off('full')) && await sel('full'));

  // 3. حزمة تستثني نمطاً مع 4 (بالمعاينة: ثلاثة أنماط): تصير 2، فلا تعلق المباراة.
  const packJson = { id: 'general', name: 'الحزمة الثقافية العامة', description: 'أسئلة ثقافية خفيفة في المجالات الثمانية', excludeModes: ['ranking'] };
  await context.route('**/content/packs/general/pack.json*', r => r.fulfill({ json: packJson }));
  await open(base + '?preview');
  check('حزمة تستثني «الترتيب» (3 أنماط): 4 معطّلة و2 مختارة', await off('full') && await sel('short'));
  await toPick();
  check('الاختيار: لا «الترتيب»', !(await tiles()).includes('ranking'));
  await cmd(frame, 'pick:letter');
  await cmd(frame, 'pick:auction');
  check('اكتمل الاختيار بجولتين و«إلى المواجهة» متاح', await frame.waitForSelector('[data-cmd="toFace"]', { timeout: 3000 }).then(() => true, () => false));

  // 4. حزمة تستثني «آخر حرفين» و«المزاد»: نمط مبني واحد، فلا تبدأ مباراة، ويقول السبب.
  packJson.excludeModes = ['last-two', 'auction'];
  await open(base);
  await frame.fill('#i1', 'الصقور');
  await frame.fill('#i2', 'النجوم');
  await cmd(frame, 'draw');
  await wait(300);
  check('نمط واحد: لا قرعة، والسبب «المباراة تحتاج نمطين على الأقل، والمتاح 1.»', await frame.isVisible('.scr.show[data-s="title"]') && (await text('#err')) === 'المباراة تحتاج نمطين على الأقل، والمتاح 1.');

  check(`لا أخطاء في الصفحة${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`, !errors.length);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})();
