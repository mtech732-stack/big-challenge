// اختبار آلي لـ ش8-أ/73 (المالك 9 نوفمبر 2026): مباراة تُركت أكثر من ساعة لا تُستأنف، فتفتح اللعبة على شاشة البداية.
// وقبل الساعة تُستأنف كما كانت، وذاكرة الأسئلة لا تتغير. وفي التطبيق: العودة من الخلفية (visibilitychange) بالقاعدة نفسها.
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  const { check, finish } = reporter();
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const MIN = 60 * 1000;

  async function open(native) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
    context.on('page', p => {
      p.on('pageerror', e => errors.push(e.message));
      p.on('console', m => m.type() === 'error' && !/pin\.json|Failed to load resource/.test(m.text()) && errors.push(m.text()));
    });
    await usePin(context);
    if (native) await context.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; });
    const page = await context.newPage();
    await page.goto(base);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    if (!native) await unlock(page);
    const frame = await stageFrame(page);
    await sharedToFace(frame, { names: ['الصقور', 'النجوم'], picks: ['letter', 'auction'] });
    await wait(2700);
    await cmd(frame, 'begin'); await frame.waitForSelector('.scr.show[data-s="intro"]');
    await cmd(frame, 'act:show'); await wait(800);
    return { context, page };
  }
  const state = page => page.evaluate(() => ({ match: localStorage.getItem('big-challenge.match'), seen: localStorage.getItem('big-challenge.seen'), at: Number(localStorage.getItem('big-challenge.savedAt')) }));
  const age = (page, ms) => page.evaluate(ms => localStorage.setItem('big-challenge.savedAt', String(Date.now() - ms)), ms);
  // بعد إعادة التحميل: الخطوة ونص الشاشة المعروضة.
  async function reopen(page, native) {
    await page.reload();
    if (!native) await unlock(page);
    const frame = await stageFrame(page);
    await wait(500);
    const m = await page.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match') ?? 'null'));
    const shown = await frame.$eval('.scr.show', e => e.dataset.s ?? e.className);
    return { frame, step: m?.step ?? 'none', shown, start: !!(await frame.$('[data-cmd="draw"]')), names: [await frame.inputValue('#i1').catch(() => '?'), await frame.inputValue('#i2').catch(() => '?')] };
  }

  {
    const { context, page } = await open(false);
    const before = await state(page);
    check(`الحفظ يكتب وقت آخر فعل (${Math.round((Date.now() - before.at) / 1000)} ثانية)`, before.at > 0 && Date.now() - before.at < 30000 && JSON.parse(before.match).step === 'play');
    await age(page, 59 * MIN);
    let r = await reopen(page, false);
    check(`الموقع، 59 دقيقة: تُستأنف المباراة في جولتها (${r.step} · ${r.shown})`, r.step === 'play' && r.shown === 'q' && !r.start);
    const resumed = await state(page);
    await age(page, 61 * MIN);
    r = await reopen(page, false);
    const after = await state(page);
    check(`الموقع، 61 دقيقة: شاشة البداية بمباراة جديدة بلا اسمين (${r.step} · ${r.names.join('،')})`, r.step === 'setup' && r.start && r.names.join() === ',');
    check('وذاكرة الأسئلة كما هي بعدها، لا تُفرَّغ ولا يُزاد عليها', after.seen === resumed.seen && after.seen === before.seen && JSON.parse(after.seen).length >= 6);
    // مباراة محفوظة قبل هذا الإصدار بلا وقت تُستأنف (القاعدة الثابتة: المباريات المحفوظة تُستأنف).
    await page.evaluate(m => { localStorage.setItem('big-challenge.match', m); localStorage.removeItem('big-challenge.savedAt'); }, resumed.match);
    r = await reopen(page, false);
    check(`مباراة محفوظة بلا وقت (قبل الإصدار): تُستأنف (${r.step})`, r.step === 'play');
    await context.close();
  }
  {
    const { context, page } = await open(true);
    await age(page, 59 * MIN);
    let r = await reopen(page, true);
    check(`التطبيق، فتح بعد 59 دقيقة: تُستأنف المباراة (${r.step} · ${r.shown})`, r.step === 'play' && r.shown === 'q');
    await age(page, 61 * MIN);
    r = await reopen(page, true);
    check(`التطبيق، فتح بعد 61 دقيقة: شاشة البداية (${r.step})`, r.step === 'setup' && r.start);
    await context.close();
  }
  {
    // العودة من الخلفية بلا إعادة تحميل (visibilitychange).
    const { context, page } = await open(true);
    const back = async ms => {
      await age(page, ms);
      await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' }); document.dispatchEvent(new Event('visibilitychange')); });
      await wait(800);
      return page.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).step);
    };
    const seen = (await state(page)).seen;
    check('التطبيق، عودة من الخلفية بعد 30 دقيقة: المباراة كما هي', (await back(30 * MIN)) === 'play');
    check('وبعد 61 دقيقة: شاشة البداية بلا سؤال، والذاكرة كما هي', (await back(61 * MIN)) === 'setup' && (await state(page)).seen === seen
      && !!(await (await stageFrame(page)).waitForSelector('[data-cmd="draw"]', { timeout: 5000 }).catch(() => null)));
    await context.close();
  }
  await browser.close();
  finish(errors);
})();
