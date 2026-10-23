// اختبار آلي لاختبار النافذتين: يفتح نافذة المقدّم، ثم نافذة الجمهور منها، ويتحقق من التزامن.
const { chromium } = require('playwright');
const { usePin, unlock } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || '.';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  const watch = p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => m.type() === 'error' && !/content\/packs\//.test(m.location().url) && errors.push(m.text()));
  };
  const results = [];
  const check = (name, ok) => { results.push([name, !!ok]); };
  const wait = ms => new Promise(r => setTimeout(r, ms));

  await usePin(context);
  const presenter = await context.newPage();
  watch(presenter);
  await presenter.goto(base + '?test');
  await unlock(presenter);
  check('المقدّم: يبدأ غير متصل', (await presenter.textContent('#status')).includes('غير متصلة'));
  check('المقدّم: زر ابدأ معطّل قبل الاتصال', await presenter.isDisabled('#start'));

  const [audience] = await Promise.all([context.waitForEvent('page'), presenter.click('#open')]);
  watch(audience);
  await audience.waitForLoadState();
  await audience.setViewportSize({ width: 1920, height: 1080 });
  await presenter.waitForFunction(() => document.getElementById('status').dataset.on === 'true', null, { timeout: 4000 });
  check('المقدّم: يصير متصلاً بعد فتح نافذة الجمهور', true);
  await audience.waitForSelector('.scr.title.show', { timeout: 4000 });
  check('الجمهور: يعرض شاشة الانتظار بعد الاتصال', true);
  check('المقدّم: يرى 0:10 في المرآة', (await presenter.textContent('#mirror')) === '0:10');

  const t0 = Date.now();
  await presenter.click('#start');
  await wait(3200);
  const mid = await audience.textContent('#timer');
  check(`الجمهور يعدّ بنفسه (بعد 3 ثوانٍ: ${mid})`, ['0:07', '0:06'].includes(mid));
  check('المرآة تطابق نافذة الجمهور', (await presenter.textContent('#mirror')) === mid);
  await audience.screenshot({ path: `${shots}/audience-running.png` });
  await audience.waitForFunction(() => document.getElementById('timer').textContent === '0:00', null, { timeout: 12000 });
  const took = (Date.now() - t0) / 1000;
  check(`العدّاد ينتهي في نحو 10 ثوانٍ (${took.toFixed(1)})`, took > 9.5 && took < 11);
  check('الجمهور: «انتهى الوقت»', (await audience.textContent('#label')) === 'انتهى الوقت');
  check('المقدّم: المرآة 0:00', (await presenter.textContent('#mirror')) === '0:00');

  await presenter.click('#reset');
  await wait(300);
  check('صفّر: يعود الجمهور إلى 0:10', (await audience.textContent('#timer')) === '0:10');

  // ملاحظة المعاين 1: النقر الثاني على الزر يُظهر النافذة المفتوحة ولا يعيد تحميلها.
  check('الزر يصير «أظهر نافذة الجمهور» بعد الاتصال', (await presenter.textContent('#open')) === 'أظهر نافذة الجمهور');
  await presenter.click('#start');
  await wait(1200);
  await audience.evaluate(() => { window.__marker = 'same-page'; });
  await presenter.click('#open');
  await wait(1200);
  const marker = await audience.evaluate(() => window.__marker);
  const afterClick = await audience.textContent('#timer');
  check(`النقر الثاني لا يعيد تحميل نافذة الجمهور ولا يوقف العدّ (${afterClick})`,
    marker === 'same-page' && ['0:08', '0:07'].includes(afterClick) && context.pages().length === 2);
  await presenter.click('#reset');
  await wait(300);

  // العدّاد يستمر في نافذة الجمهور حتى لو انقطع الإنترنت.
  await context.setOffline(true);
  await presenter.click('#start');
  await wait(2200);
  const offline = await audience.textContent('#timer');
  check(`بلا إنترنت: يستمر التزامن والعدّ (${offline})`, ['0:08', '0:07'].includes(offline) && (await presenter.textContent('#mirror')) === offline);
  await context.setOffline(false);
  await presenter.click('#reset');

  // التمدد مع المقاسات: اللوحة 1920×1080 تملأ الشاشة دون قص.
  for (const [w, h] of [[1366, 768], [3840, 2160], [1920, 1080]]) {
    await audience.setViewportSize({ width: w, height: h });
    await wait(150);
    const box = await audience.locator('.canvas').boundingBox();
    check(`التمدد على ${w}×${h}`, Math.abs(box.width - w) < 2 && box.height <= h + 1);
  }
  await audience.screenshot({ path: `${shots}/audience-ready.png` });
  await presenter.screenshot({ path: `${shots}/presenter.png` });

  for (const p of [presenter, audience]) {
    const who = p === presenter ? 'المقدّم' : 'الجمهور';
    check(`لا أرقام هندية (${who})`, !/[٠-٩۰-۹]/.test(await p.textContent('body')));
    check(`لا ميل للحروف (${who})`,
      await p.$$eval('*', els => els.every(e => getComputedStyle(e).fontStyle === 'normal')));
  }

  await audience.close();
  await presenter.waitForFunction(() => document.getElementById('status').dataset.on === 'false', null, { timeout: 5000 });
  check('إغلاق نافذة الجمهور: يظهر «غير متصلة» ويتعطل ابدأ', await presenter.isDisabled('#start'));

  const [again] = await Promise.all([context.waitForEvent('page'), presenter.click('#open')]);
  watch(again);
  await presenter.waitForFunction(() => document.getElementById('status').dataset.on === 'true', null, { timeout: 4000 });
  check('إعادة فتح نافذة الجمهور: يعود الاتصال', true);
  await again.reload();
  await wait(1500);
  check('إعادة تحميل نافذة الجمهور: يبقى الاتصال', (await presenter.getAttribute('#status', 'data-on')) === 'true');

  check('لا أخطاء في الصفحتين', errors.length === 0);
  await browser.close();

  let ok = true;
  for (const [k, v] of results) { console.log(`${v ? 'نجح' : 'فشل'} · ${k}`); ok &&= v; }
  if (errors.length) console.log(errors.join('\n'));
  console.log(`${results.filter(r => r[1]).length}/${results.length}`);
  process.exit(ok ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
