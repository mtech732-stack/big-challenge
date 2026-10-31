// اختبار آلي للتحقق المستمر من الرقم السري. يقدّم ساعة المتصفح بدل الانتظار الفعلي.
const { chromium } = require('playwright');
const { TEST_PIN, testPinRecord, unlock, reporter, stageFrame } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  context.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => m.type() === 'error' && !/pin\.json|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  });
  const { check, finish } = reporter();
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // ما يردّه «المستودع» في كل لحظة: صورة رقم، أو انقطاع، أو خطأ من الخادم.
  let served = { kind: 'record', record: testPinRecord() };
  let fetches = 0;
  await context.route('**/pin.json*', route => {
    fetches++;
    if (served.kind === 'offline') return route.abort('internetdisconnected');
    if (served.kind === 'error') return route.fulfill({ status: 503, body: 'down' });
    if (served.kind === 'bad') return route.fulfill({ body: '{"salt": "ab', contentType: 'application/json' });
    return route.fulfill({ json: served.record });
  });
  await context.clock.install();

  // الشاشة المشتركة وحدها (الوثيقة 1.13): شاشة الجمهور إطار في الصفحة نفسها.
  const presenter = await context.newPage();
  await presenter.goto(base);
  await unlock(presenter);
  await stageFrame(presenter);
  const framed = () => presenter.$('#frame iframe').then(Boolean);

  const isOpen = async () => await presenter.isVisible('#app') && await presenter.isHidden('#gate');
  const forward = async time => { await context.clock.fastForward(time); await wait(1500); };

  // لا تحقق قبل انقضاء المدة.
  const before = fetches;
  await forward('02:30');
  check('لا تحقق دوري قبل 3 دقائق', fetches === before);

  await forward('00:40');
  check('بعد 3 دقائق: يتحقق من الملف', fetches > before);
  check('الرقم لم يتغير: تبقى اللعبة مفتوحة', await isOpen());

  served = { kind: 'record', record: testPinRecord(TEST_PIN) };
  await forward('03:10');
  check('أُعيد حفظ الرقم نفسه بملح جديد: تبقى مفتوحة', await isOpen());

  served = { kind: 'offline' };
  await forward('03:10');
  check('انقطع الإنترنت عند التحقق: تبقى مفتوحة', await isOpen());
  check('انقطع الإنترنت: شاشة الجمهور باقية', await framed());

  served = { kind: 'error' };
  await forward('03:10');
  check('تعذّر جلب الملف (خطأ من الخادم): تبقى مفتوحة', await isOpen());

  served = { kind: 'bad' };
  await forward('03:10');
  check('ملف الرقم تالف: لا تأكّد من التغيّر، فتبقى مفتوحة', await isOpen());

  // تغيّر الرقم فعلاً: تُغلق فوراً في النافذتين.
  served = { kind: 'record', record: testPinRecord('975310') };
  await forward('03:10');
  check('تغيّر الرقم: تُغلق نافذة المقدّم وتظهر شاشة الرقم', !(await isOpen()) && await presenter.isVisible('#pin'));
  check('تغيّر الرقم: رسالة «تغيّر الرقم السري»', (await presenter.textContent('#pin-error')).includes('تغيّر الرقم السري'));
  check('تغيّر الرقم: لا يبقى من شاشة الجمهور شيء', !(await framed()));
  await presenter.screenshot({ path: `${shots}/continuous-locked.png` });

  await presenter.fill('#pin', TEST_PIN);
  await presenter.click('#enter');
  await wait(2500);
  check('بعد الإغلاق: الرقم القديم يُرفض', !(await isOpen()) && (await presenter.textContent('#pin-error')) === 'الرقم غير صحيح');

  await unlock(presenter, '975310');
  await wait(1500);
  const audience = await stageFrame(presenter);
  check('الرقم الجديد يعيد فتحها دون إعادة تحميل', await isOpen() && await framed());
  check('شاشة الجمهور تعود بعد الفتح (شاشة البداية بالشعار الكبير)', await audience.isVisible('.team.t1') && await audience.isVisible('.hero .hlogo'));

  // التحقق عند بدء كل مباراة جديدة: فوري دون انتظار المدة.
  served = { kind: 'record', record: testPinRecord('112233') };
  const result = await presenter.evaluate(() => window.verifyPinNow());
  await wait(500);
  check('التحقق عند بدء مباراة: يكتشف التغيّر فوراً ويُغلق', result === 'changed' && !(await isOpen()));

  await unlock(presenter, '112233');
  served = { kind: 'offline' };
  check('التحقق عند بدء مباراة بلا إنترنت: لا يُغلق', (await presenter.evaluate(() => window.verifyPinNow())) === 'offline' && await isOpen());

  check('لا أخطاء في الصفحة', errors.length === 0);
  await browser.close();
  process.exit(finish(errors) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
