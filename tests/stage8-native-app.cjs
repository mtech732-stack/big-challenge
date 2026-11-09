// اختبار آلي: تطبيق آبل بلا رقم سري، والموقع يطلبه كما هو (الوثيقة 1.17، 4.3).
// التطبيق يُعرف بجسر Capacitor الذي يحقنه الغلاف الأصلي قبل سكربتات الصفحة؛ هنا يُحقن بـ addInitScript مثله.
const { chromium } = require('playwright');
const { TEST_PIN, testPinRecord, unlock, reporter, stageFrame } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  const { check, finish } = reporter();
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // سياق جديد لكل حالة: native = true جسر أصلي، false جسر Capacitor على الويب، null متصفح عادي.
  async function open(native) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    context.on('page', p => {
      p.on('pageerror', e => errors.push(e.message));
      p.on('console', m => m.type() === 'error' && !/pin\.json|Failed to load resource/.test(m.text()) && errors.push(m.text()));
    });
    const state = { fetches: 0, record: testPinRecord() };
    await context.route('**/pin.json*', route => { state.fetches++; return route.fulfill({ json: state.record }); });
    if (native !== null) await context.addInitScript(n => { window.Capacitor = { isNativePlatform: () => n }; }, native);
    await context.clock.install();
    const page = await context.newPage();
    await page.goto(base);
    return { context, page, state };
  }
  const gateShown = page => page.evaluate(() => getComputedStyle(document.getElementById('gate')).display !== 'none' && !document.getElementById('gate').hidden);

  // ===== الموقع في المتصفح: لا تغيير =====
  {
    const { context, page, state } = await open(null);
    await page.waitForTimeout(800);
    check('الموقع: تظهر شاشة الرقم السري واللعبة مغلقة', await gateShown(page) && await page.isHidden('#app'));
    check('الموقع: isNativeApp() خطأ', !(await page.evaluate(async () => (await import('./js/pin.js')).isNativeApp())));
    await page.fill('#pin', '000000');
    await page.click('#enter');
    await page.waitForSelector('#pin-error:not([hidden])');
    check('الموقع: الرقم الخاطئ لا يفتح', await page.isHidden('#app'));
    await unlock(page);
    check('الموقع: الرقم الصحيح يفتح', await page.isVisible('#single'));
    // التحقق المستمر باقٍ: تغيّر الرقم يُغلق.
    state.record = testPinRecord('246801');
    const before = state.fetches;
    await context.clock.fastForward(3 * 60 * 1000 + 1000);
    await page.waitForSelector('#gate:not([hidden])', { timeout: 10000 }).catch(() => {});
    check('الموقع: التحقق المستمر يعمل ويُغلق عند تغيّر الرقم', state.fetches > before && await page.isHidden('#app') && await gateShown(page));
    await page.reload();
    check('الموقع: إعادة التحميل تطلب الرقم', await gateShown(page) && await page.isHidden('#app'));
    await context.close();
  }

  // ===== Capacitor على الويب (ليس تطبيقاً أصلياً): يُطلب الرقم =====
  {
    const { context, page } = await open(false);
    await page.waitForTimeout(800);
    check('Capacitor على الويب (isNativePlatform خطأ): يُطلب الرقم', await gateShown(page) && await page.isHidden('#app'));
    await unlock(page);
    check('Capacitor على الويب: الرقم الصحيح يفتح', await page.isVisible('#single'));
    await context.close();
  }

  // ===== تطبيق آبل: لا رقم ولا تحقق =====
  {
    const { context, page, state } = await open(true);
    await page.waitForSelector('#app:not([hidden])', { timeout: 10000 });
    check('التطبيق: تُفتح اللعبة مباشرة بلا رقم', await page.isVisible('#single') && !(await gateShown(page)));
    check('التطبيق: isNativeApp() صحيح', await page.evaluate(async () => (await import('./js/pin.js')).isNativeApp()));
    const frame = await stageFrame(page);
    check('التطبيق: شاشة الجمهور جاهزة في الإطار', !!frame);
    await page.screenshot({ path: `${shots}/native-app-open.png` });
    check('التطبيق: لا يُجلب ملف الرقم عند الفتح', state.fetches === 0);
    // تغيّر الرقم في المستودع لا يُغلق التطبيق، ولا يُتحقق منه أصلاً.
    state.record = testPinRecord('246801');
    await context.clock.fastForward(10 * 60 * 1000);
    await wait(1500);
    check('التطبيق: بعد 10 دقائق وتغيّر الرقم تبقى اللعبة مفتوحة', await page.isVisible('#single') && await page.isHidden('#gate'));
    check('التطبيق: لا تحقق مستمر (لا جلب لملف الرقم)', state.fetches === 0);
    check('التطبيق: «التحقق الآن» عند بدء مباراة لا يفعل شيئاً', (await page.evaluate(() => window.verifyPinNow())) === undefined && await page.isVisible('#single'));
    await page.reload();
    await page.waitForSelector('#app:not([hidden])', { timeout: 10000 });
    check('التطبيق: إعادة الفتح تفتح بلا رقم', await page.isVisible('#single') && !(await gateShown(page)) && state.fetches === 0);
    await context.close();
  }

  await browser.close();
  finish(errors);
})();
