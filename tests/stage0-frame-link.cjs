// اختبار آلي للقناة بين الصفحة وشاشة الجمهور المضمّنة فيها (js/frame-link.js، الوثيقة 1.13: نافذة واحدة وحدها).
// كان «اختبار النافذتين» من ش0 بصفحة ?test وعدّادها التجريبي، وهذه فحوصه نفسها على الشاشة المشتركة:
// الاتصال بعد الرقم، والعدّاد يعدّ في شاشة الجمهور بنفسه ويصل انتهاؤه إلى الصفحة، ويستمر بلا إنترنت،
// وإعادة تحميل الإطار وحده أو الصفحة كلها تعيد الحال، والتمدد مع المقاسات، ولا أرقام هندية ولا ميل.
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const { check, finish } = reporter();
  const errors = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  context.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => m.type() === 'error' && !/content\/packs\//.test(m.location().url) && errors.push(m.text()));
  });

  await usePin(context);
  const page = await context.newPage();
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  check('قبل الرقم: لا شاشة جمهور في الصفحة', !(await page.$('#frame iframe')));
  await unlock(page);
  let frame = await stageFrame(page);
  check('بعد الرقم: شاشة الجمهور متصلة بالصفحة، وفيها الإعداد', !!(await frame.$('[data-hero="start"] .hlogo')) && !!(await frame.$('[data-cmd="draw"]')));

  // العدّاد: في شاشة الجمهور نفسها (التمهيد 5 ثوانٍ في «الحرف المعيّن»)، وانتهاؤه يصل إلى الصفحة فيبدأ وقت السؤال.
  await sharedToFace(frame, { names: ['الصقور', 'النجوم'], picks: ['letter', 'last-two'] });
  await wait(2700);
  await cmd(frame, 'begin');
  await frame.waitForSelector('.scr.show[data-s="intro"]', { timeout: 6000 });
  const phase = () => page.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.state.phase);
  const t0 = Date.now();
  await cmd(frame, 'act:show');
  await wait(2200);
  const lead = await frame.textContent('#timer');
  check(`الجمهور يعدّ بنفسه (التمهيد بعد ثانيتين: ${lead})`, ['0:03', '0:02'].includes(lead));
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.state.phase === 'ask', null, { timeout: 8000 });
  const took = (Date.now() - t0) / 1000;
  check(`انتهاء التمهيد يصل إلى الصفحة في نحو 5 ثوانٍ (${took.toFixed(1)})، فيبدأ وقت السؤال`, took > 4.5 && took < 6.5 && (await phase()) === 'ask');

  // بلا إنترنت: يستمر العدّ والقناة.
  await context.setOffline(true);
  const before = await frame.textContent('#timer');
  await wait(2200);
  const offline = await frame.textContent('#timer');
  check(`بلا إنترنت: يستمر العدّ (${before} ثم ${offline})`, offline < before);
  await cmd(frame, 'act:pause');
  await wait(800);
  check('بلا إنترنت: «إيقاف مؤقت» من الإطار يصل إلى الصفحة', !!(await page.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.state.paused)));
  await cmd(frame, 'act:resume');
  await wait(800);
  await context.setOffline(false);

  // إعادة تحميل الإطار وحده: يتصل من جديد ويطلب الحال، فيعود السؤال وعدّاده.
  await frame.evaluate(() => { window.__marker = 'old'; location.reload(); });
  await wait(300);
  frame = await stageFrame(page);
  await frame.waitForSelector('.scr.show[data-s="q"]', { timeout: 6000 }); await frame.waitForSelector('#near .cbtn', { timeout: 6000 });
  check('إعادة تحميل الإطار وحده: يعود السؤال وأزراره', (await frame.evaluate(() => window.__marker)) === undefined && /السؤال 1 من 6/.test(await frame.textContent('#b1')));
  const a1 = await frame.textContent('#timer');
  await wait(1200);
  check(`والعدّاد يعدّ بعدها (${a1} ثم ${await frame.textContent('#timer')})`, (await frame.textContent('#timer')) < a1);

  // إعادة تحميل الصفحة كلها: الرقم ثم الحال كما كانت.
  await page.reload();
  await unlock(page);
  frame = await stageFrame(page);
  await frame.waitForSelector('.scr.show[data-s="q"]', { timeout: 6000 });
  check('إعادة تحميل الصفحة: السؤال نفسه بعد الرقم', /السؤال 1 من 6/.test(await frame.textContent('#b1')));

  // التمدد مع المقاسات: اللوحة 1920×1080 تملأ النافذة دون قص.
  for (const [w, h] of [[1366, 768], [3840, 2160], [1920, 1080]]) {
    await page.setViewportSize({ width: w, height: h });
    await wait(200);
    const box = await page.locator('#frame').boundingBox();
    check(`التمدد على ${w}×${h}`, Math.abs(box.width - w) < 2 && box.height <= h + 1);
  }
  await page.screenshot({ path: `${shots}/frame-link.png` });
  check('لا أرقام هندية', !/[٠-٩۰-۹]/.test(await frame.textContent('body')));
  check('لا ميل للحروف', await frame.$$eval('*', els => els.every(e => getComputedStyle(e).fontStyle === 'normal')));
  check('لا أخطاء في الصفحة', errors.length === 0);
  await browser.close();
  process.exit(finish(errors) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
