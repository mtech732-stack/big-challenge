// اختبار آلي للبندين المؤجلين قبل المباراة القصيرة التجريبية (ملاحظة تدقيق ش1، البند 6):
// 1. لا يُختار في مباراة تُلعب إلا نمط مبني له ملف أسئلة في الحزمة (والمعاينة برابط «?preview» للتجربة وحدها).
// 2. طريقة جولاتها أكثر من أنماط الحزمة لا تُختار، فلا تعلق المباراة في اختيار الأنماط (حزمة تستثني نمطاً مع «كاملة»).
const path = require('path');
const { chromium } = require('playwright');
const { usePin, unlock, reporter } = require('./helpers.cjs');

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
  check('«كاملة» بنمطين: خطأ يطلب «قصيرة»', M.setupErrors(ready, two)[0]?.text === 'الطريقة الكاملة تحتاج 4 أنماط، والمتاح في هذه الحزمة 2. اختر «قصيرة».');
  check('«قصيرة» بنمطين: لا خطأ', M.setupErrors({ ...ready, method: 'short' }, two).length === 0);
  check('«قصيرة» بنمط واحد: خطأ', M.setupErrors({ ...ready, method: 'short' }, two.slice(0, 1))[0]?.text === 'المباراة تحتاج نمطين على الأقل، والمتاح في هذه الحزمة 1.');
  check('«كاملة» بأربعة: لا خطأ، وبلا قائمة كما كانت', M.setupErrors(ready, [...two, { id: 'a' }, { id: 'b' }]).length === 0 && M.setupErrors(ready).length === 0);
  const files = { 'letter.json': {}, 'last-two.json': {}, 'auction.json': {} };
  check('قائمة الاختيار: المبنيّ وله ملف وحده (ملف المزاد لا يجعله يُختار قبل بنائه)', pickableModes({ pack: { excludeModes: [] }, files }).map(m => m.id).join(',') === 'letter,last-two');
  check('المعاينة: الأنماط الأربعة إلا ما تستثنيه الحزمة', matchModes({ pack: { excludeModes: ['ranking'] }, files }).map(m => m.id).join(',') === 'letter,last-two,auction');

  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  // عامل الخدمة محجوب كي تصل الحزمة التجريبية (context.route لا يرى طلباته).
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block' });
  await usePin(context);
  context.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => m.type() === 'error' && !/content\/packs\/.+\.json/.test(m.location().url) && errors.push(m.text()));
  });
  const presenter = await context.newPage();
  const text = sel => presenter.textContent(sel).then(t => t.replace(/\s+/g, ' ').trim());
  const sel = m => presenter.$eval(`#method [data-m="${m}"]`, e => e.classList.contains('sel'));
  const off = m => presenter.$eval(`#method [data-m="${m}"]`, e => e.classList.contains('off'));
  const open = async url => {
    await presenter.goto(url);
    await presenter.evaluate(() => localStorage.clear());
    await presenter.reload();
    await unlock(presenter);
    await wait(300);
  };

  // 1. المباراة كما تُلعب: نمطان مبنيان.
  await open(base);
  check('الإعداد: «قصيرة» مختارة، و«كاملة» معطّلة وفيها سببها «تحتاج 4 أنماط · المتاح 2»', await sel('short') && await off('full') && (await text('#method [data-m="full"] span')) === 'تحتاج 4 أنماط · المتاح 2');
  await presenter.click('#method [data-m="full"]');
  check('النقر على «كاملة» لا يختارها', await sel('short') && !(await sel('full')));
  await presenter.fill('#t1', 'الصقور');
  await presenter.fill('#t2', 'النجوم');
  await presenter.click('#toDraw');
  await presenter.click('#drawBtn');
  await presenter.waitForSelector('#toPick:not([hidden])', { timeout: 6000 });
  await presenter.click('#toPick');
  const listed = await presenter.$$eval('#modes [data-mode]', b => b.map(x => x.dataset.mode).join(','));
  check(`الاختيار: «الحرف المعيّن» و«آخر حرفين» وحدهما (${listed})`, listed === 'letter,last-two');
  await presenter.click('#modes [data-mode="last-two"]');
  await presenter.click('#modes [data-mode="letter"]');
  await presenter.click('#toFace');
  await wait(2500);
  check('المواجهة: «ابدأ الجولة 1» مفعّل، لا «تخطَّ»', (await text('#startRound')) === 'ابدأ الجولة 1' && !(await presenter.isDisabled('#startRound')));

  // مباراة محفوظة في الإعداد بـ«كاملة» (من نسخة سابقة): تصير «قصيرة» عند الفتح.
  await presenter.evaluate(() => localStorage.setItem('big-challenge.match', JSON.stringify({ v: 1, step: 'setup', teams: { 1: '', 2: '' }, pack: 'general', method: 'full', winner: null, picks: [], scores: { 1: 0, 2: 0 }, history: [], single: false })));
  await presenter.reload();
  await unlock(presenter);
  await wait(300);
  check('إعداد محفوظ بـ«كاملة»: يصير «قصيرة» عند الفتح', await sel('short'));

  // 2. المعاينة للتجربة: «?preview» يعيد الأنماط الأربعة و«كاملة».
  await open(base + '?preview');
  check('«?preview»: «كاملة» متاحة ومختارة كما كانت', !(await off('full')) && await sel('full') && (await text('#method [data-m="full"] span')) === '4 جولات · عجلتان');

  // 3. حزمة تستثني نمطاً مع «كاملة» (بالمعاينة: ثلاثة أنماط): تصير «قصيرة»، فلا تعلق المباراة.
  const packJson = { id: 'general', name: 'الحزمة الثقافية العامة', description: 'أسئلة ثقافية خفيفة في المجالات الثمانية', excludeModes: ['ranking'] };
  await context.route('**/content/packs/general/pack.json*', r => r.fulfill({ json: packJson }));
  await open(base + '?preview');
  check('حزمة تستثني «الترتيب» (3 أنماط): «كاملة» معطّلة و«قصيرة» مختارة', await off('full') && await sel('short') && (await text('#method [data-m="full"] span')) === 'تحتاج 4 أنماط · المتاح 3');
  await presenter.fill('#t1', 'الصقور');
  await presenter.fill('#t2', 'النجوم');
  await presenter.click('#toDraw');
  await presenter.click('#drawBtn');
  await presenter.waitForSelector('#toPick:not([hidden])', { timeout: 6000 });
  await presenter.click('#toPick');
  check('الاختيار: لا «الترتيب»', !(await presenter.$('#modes [data-mode="ranking"]')));
  await presenter.click('#modes [data-mode="letter"]');
  await presenter.click('#modes [data-mode="auction"]');
  check('اكتمل الاختيار بجولتين و«إلى شاشة المواجهة» متاح', await presenter.isVisible('#toFace') && !(await presenter.isDisabled('#toFace')));

  // 4. حزمة تستثني «آخر حرفين»: نمط مبني واحد، فلا تبدأ مباراة، ويقول السبب.
  packJson.excludeModes = ['last-two'];
  await open(base);
  await presenter.fill('#t1', 'الصقور');
  await presenter.fill('#t2', 'النجوم');
  await presenter.click('#toDraw');
  await wait(300);
  check('نمط واحد: «قصيرة» معطّلة أيضاً، ولا قرعة، والرسالة «المباراة تحتاج نمطين على الأقل…»', await off('short') && !(await presenter.isVisible('#drawBtn'))
    && (await text('#setupErr')) === 'المباراة تحتاج نمطين على الأقل، والمتاح في هذه الحزمة 1.');

  check(`لا أخطاء في الصفحة${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`, !errors.length);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})();
