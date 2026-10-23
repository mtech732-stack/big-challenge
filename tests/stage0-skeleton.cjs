// اختبار آلي لتطبيق هيكل التصميم على النافذتين: فحص التداخل (كما في design/main.html)،
// وأطول محتوى، والخط المرفق دون إنترنت، وأصغر نص في نافذة المقدّم، وحواف الخطر.
const { chromium } = require('playwright');
const { usePin, unlock, reporter } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || '.';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { check, finish } = reporter();
  const errors = [];
  const external = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));

  const context = await browser.newContext();
  await usePin(context);
  context.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => m.type() === 'error' && errors.push(m.text()));
    p.on('request', r => { if (!r.url().startsWith(base)) external.push(r.url()); });
  });

  // 1. فحص التداخل على شاشة الجمهور بالمقاسين، بالمحتوى الحالي وبأطول محتوى.
  const audience = await context.newPage();
  const longest = async () => audience.evaluate(async () => {
    const set = (id, v) => { document.getElementById(id).textContent = v; };
    set('n1', 'فريق النخبة الذهبي'); set('n2', 'نجوم المستقبل معاً');
    set('s1', '188'); set('g1', '188'); set('s2', '176'); set('g2', '176');
    set('d1', 'يتقدّم بفارق 12'); set('d2', 'يتأخر بفارق 12');
    set('letter', 'ـوت');
    set('label', 'بيت لا يُبنى بطين ولا حجر، ووصفه القرآن بأنه أوهن البيوت، وتراه في زوايا البيوت القد');
    const { checkLayout } = await import('./js/layout-check.js');
    return checkLayout(document.getElementById('canvas'), document.querySelector('.check-layer'));
  });
  for (const [w, h] of [[1920, 1080], [1366, 768]]) {
    await audience.setViewportSize({ width: w, height: h });
    await audience.goto(base + 'audience.html?check');
    await audience.waitForFunction(() => window.__check, null, { timeout: 10000 });
    const r = await audience.evaluate(() => window.__check);
    check(`الجمهور ${w}×${h}: لا تداخل ولا خروج عن الهامش (${r.count} عناصر، أدنى فراغ ${Math.round(r.minGap)})`, r.ok && r.count === 9);
    if (!r.ok) console.log(r.problems.join('\n'));
    if (w === 1920) await audience.screenshot({ path: `${shots}/skeleton-audience.png` });
    const l = await longest();
    check(`الجمهور ${w}×${h} بأطول محتوى (اسمان 18، أرقام 3 خانات، سؤال 85 مع «ـوت»): سليم في ${l.lines} أسطر`, l.ok && l.lines === 3);
    if (!l.ok) console.log(l.problems.join('\n'));
    if (w === 1920) await audience.screenshot({ path: `${shots}/skeleton-audience-longest.png` });
  }

  // 2. الخط المرفق: محمّل من الموقع نفسه، ولا طلب خارجي.
  const fontOk = await audience.evaluate(() => document.fonts.check('700 64px Kufi') && [...document.fonts].some(f => f.family === 'Kufi' && f.status === 'loaded'));
  check('خط Noto Kufi المرفق محمّل', fontOk);
  check('لا طلبات إلى مواقع خارجية', external.length === 0);

  // 3. نافذة المقدّم: أصغر نص 32 على أساس عرض 1920، في شاشة الرقم وبعد الدخول.
  const presenter = await context.newPage();
  await presenter.setViewportSize({ width: 1920, height: 1080 });
  const smallest = () => presenter.evaluate(() => Math.min(...[...document.querySelectorAll('body *')]
    .filter(n => n.getClientRects().length && [...n.childNodes].some(c => c.nodeType === 3 && c.textContent.trim()))
    .map(n => parseFloat(getComputedStyle(n).fontSize))));
  await presenter.goto(base);
  await presenter.evaluate(() => document.fonts.ready);
  check(`المقدّم · شاشة الرقم: أصغر نص ${await smallest()}`, (await smallest()) >= 32);
  await presenter.screenshot({ path: `${shots}/skeleton-gate.png` });
  await unlock(presenter);
  check(`المقدّم بعد الدخول: أصغر نص ${await smallest()}`, (await smallest()) >= 32);
  const radius = await presenter.$$eval('button, #pin, .panel', els => els.every(e => getComputedStyle(e).borderRadius === '0px'));
  check('لا زوايا مستديرة في نافذة المقدّم', radius);
  await presenter.screenshot({ path: `${shots}/skeleton-presenter.png` });

  // 4. نافذة الجمهور الحقيقية: بانتظار المقدّم لا تُظهر إلا البطاقة، وبعد الاتصال يظهر الهيكل كاملاً.
  await audience.setViewportSize({ width: 1920, height: 1080 });
  // في متصفح آخر لا مقدّم فيه، كي لا يتصل بالمقدّم المفتوح هنا.
  const other = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const live = await other.newPage();
  await live.goto(base + 'audience.html');
  await wait(300);
  check('بانتظار المقدّم: الهيكل مخفي والبطاقة وحدها', await live.isHidden('.team.t1') && await live.isHidden('.timer') && await live.isVisible('.card'));
  await other.close();
  const [aud] = await Promise.all([context.waitForEvent('page'), presenter.click('#open')]);
  await aud.setViewportSize({ width: 1920, height: 1080 });
  await presenter.waitForFunction(() => document.getElementById('status').dataset.on === 'true', null, { timeout: 5000 });
  await wait(300);
  check('بعد الاتصال: اللوحتان والشريطان والشارة والعدّاد ظاهرة',
    (await Promise.all(['.team.t1', '.team.t2', '.strip.t1', '.strip.t2', '.badge.mode', '.timer', '.giant.t1'].map(s => aud.isVisible(s)))).every(Boolean));
  await aud.screenshot({ path: `${shots}/skeleton-audience-live.png` });

  // 5. حواف الخطر في آخر 3 ثوانٍ فقط، وتختفي عند 0:00.
  await presenter.click('#start');
  await wait(4500);
  const early = await aud.textContent('#timer');
  check(`قبل آخر 3 ثوانٍ (${early}): لا حواف`, ['0:06', '0:05'].includes(early) && !(await aud.evaluate(() => document.getElementById('canvas').classList.contains('meta-danger'))));
  await wait(3000);
  const at = await aud.textContent('#timer');
  check(`آخر 3 ثوانٍ (${at}): حواف حمراء`, ['0:03', '0:02'].includes(at) && await aud.evaluate(() => document.getElementById('canvas').classList.contains('meta-danger')));
  await aud.screenshot({ path: `${shots}/skeleton-danger.png` });
  await aud.waitForFunction(() => document.getElementById('timer').textContent === '0:00', null, { timeout: 6000 });
  await wait(200);
  check('عند 0:00: تختفي الحواف و«انتهى الوقت»', !(await aud.evaluate(() => document.getElementById('canvas').classList.contains('meta-danger')))
    && (await aud.textContent('#label')) === 'انتهى الوقت');
  check('العدّاد بصيغة 0:00 وأرقام إنجليزية', /^\d:\d\d$/.test(await aud.textContent('#timer')));

  check('لا أخطاء في الصفحات', errors.length === 0);
  await browser.close();
  process.exit(finish(errors) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
