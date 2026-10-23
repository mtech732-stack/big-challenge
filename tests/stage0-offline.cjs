// اختبار آلي للعمل دون إنترنت عند إعادة الفتح: يفتح اللعبة مرة بإنترنت، ثم يقطعه ويعيد فتح كل شيء.
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const { usePin, unlock, reporter } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || '.';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { check, finish } = reporter();
  const errors = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await usePin(context);
  context.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => m.type() === 'error' && !/ERR_INTERNET_DISCONNECTED|Failed to load resource|pin\.json/.test(m.text()) && errors.push(m.text()));
  });

  // أول فتح بإنترنت: يُسجَّل عامل الحفظ ويحفظ الملفات، ويُحفظ آخر رقم.
  const page = await context.newPage();
  await page.goto(base);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  check('عامل الحفظ مسجّل ويتحكم في الصفحة', await page.evaluate(() => !!navigator.serviceWorker.controller));
  const cached = await page.evaluate(async () => (await (await caches.open('big-challenge-v1')).keys()).length);
  check(`الملفات محفوظة في المتصفح (${cached} ملفاً)`, cached >= 13);
  await unlock(page);

  // انقطع الإنترنت: إعادة فتح نافذة المقدّم.
  await context.setOffline(true);
  await page.reload();
  check('بلا إنترنت: تُفتح نافذة المقدّم من جديد وتطلب الرقم', await page.isVisible('#pin'));
  check('بلا إنترنت: الخط المرفق محمّل', await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('700 32px Kufi'); }));
  await unlock(page);
  check('بلا إنترنت: يُقبل الرقم بآخر صورة محفوظة', await page.isVisible('#open'));

  // نافذة الجمهور تُفتح بلا إنترنت وتتزامن.
  const [aud] = await Promise.all([context.waitForEvent('page'), page.click('#open')]);
  await aud.setViewportSize({ width: 1920, height: 1080 });
  await page.waitForFunction(() => document.getElementById('status').dataset.on === 'true', null, { timeout: 6000 });
  check('بلا إنترنت: نافذة الجمهور تُفتح وتتصل', await aud.isVisible('.team.t1'));
  await page.click('#start');
  await wait(2200);
  check('بلا إنترنت: العدّاد يعمل ويتزامن', ['0:08', '0:07'].includes(await aud.textContent('#timer'))
    && (await page.textContent('#mirror')) === (await aud.textContent('#timer')));
  await aud.screenshot({ path: `${shots}/offline-audience.png` });

  // إعادة تحميل نافذة الجمهور نفسها بلا إنترنت (ما يحدث لو ضُغط F5 على التلفاز).
  await aud.reload();
  await page.waitForFunction(() => document.getElementById('status').dataset.on === 'true', null, { timeout: 6000 });
  check('بلا إنترنت: إعادة تحميل نافذة الجمهور تعيدها متصلة', await aud.isVisible('.timer'));
  check('بلا إنترنت: رابط الفحص ?check يُخدم من النسخة المحفوظة', await (async () => {
    const p = await context.newPage();
    await p.goto(base + 'audience.html?check');
    const ok = await p.waitForFunction(() => window.__check, null, { timeout: 8000 }).then(() => p.evaluate(() => window.__check.ok)).catch(() => false);
    await p.close();
    return ok;
  })());

  // الرقم السري لا يُخدم من النسخة المحفوظة: التحقق المستمر يعرف أن الإنترنت منقطع، فلا يُغلق اللعبة.
  const pinCached = await page.evaluate(async () => (await (await caches.open('big-challenge-v1')).keys()).some(r => r.url.includes('pin.json')));
  check('ملف الرقم السري لا يُحفظ في نسخة المتصفح', !pinCached);
  await context.unroute('**/pin.json*');
  await context.route('**/pin.json*', route => route.abort('internetdisconnected'));
  check('بلا إنترنت: التحقق المستمر يقول «offline» ولا يُغلق', (await page.evaluate(() => window.verifyPinNow())) === 'offline' && await page.isVisible('#open'));
  await context.setOffline(false);

  // بإنترنت: الشبكة أولاً، فيصل كل تحديث منشور فوراً لا النسخة المحفوظة.
  const probe = path.join(__dirname, '_fresh.txt');
  const read = () => page.evaluate(async () => (await fetch('tests/_fresh.txt')).text());
  try {
    fs.writeFileSync(probe, 'old');
    check('بإنترنت: يُقرأ الملف', (await read()) === 'old');
    fs.writeFileSync(probe, 'new');
    check('بإنترنت: يصل التحديث فوراً لا النسخة المحفوظة', (await read()) === 'new');
    await context.setOffline(true);
    check('بلا إنترنت: تُخدم آخر نسخة وصلت', (await read()) === 'new');
    await context.setOffline(false);
  } finally {
    fs.rmSync(probe, { force: true });
  }

  check('لا أخطاء في الصفحات', errors.length === 0);
  await browser.close();
  process.exit(finish(errors) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
