// اختبار آلي: خانات لوحة الترتيب بنقرتين في تطبيق آبل (design/app.md 4.6، المالك 9 نوفمبر 2026). وفي الموقع كذلك منذ ش8-أ/106 (8.2)، بالفأرة.
// الأولى تحدّد الخانة (إطار حول شارة رقمها) ولا تكشفها، والثانية على الخانة نفسها تكشفها. والنقر على خانة أخرى ينقل التحديد،
// ويزول بعد 4 ثوانٍ بلا نقرة، وبـ«خطأ»، وحين لا تبقى الخانة زراً.
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  const { check, finish } = reporter();
  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function toList(native) {
    const context = await browser.newContext({ viewport: native ? { width: 956, height: 440 } : { width: 1920, height: 1080 } });
    context.on('page', p => {
      p.on('pageerror', e => errors.push(e.message));
      p.on('console', m => m.type() === 'error' && !/pin\.json|Failed to load resource/.test(m.text()) && errors.push(m.text()));
    });
    await usePin(context);
    // والاهتزاز: إضافة Haptics مزيفة تعدّ النقرات التي تطلبه.
    if (native) await context.addInitScript(() => { window.__haptic = 0; window.Capacitor = { isNativePlatform: () => true, Plugins: { Haptics: { impact: () => { window.__haptic++; } } } }; });
    const page = await context.newPage();
    await page.goto(base);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    if (!native) await unlock(page);
    const f = await stageFrame(page);
    await sharedToFace(f, { names: ['الصقور', 'النجوم'], picks: ['ranking', 'letter'] });
    await wait(2700);
    await cmd(f, 'begin'); await f.waitForSelector('.scr.show[data-s="intro"]');
    await cmd(f, 'act:show'); await f.waitForSelector('.scr.show[data-s="rnk"]'); await wait(800);
    await cmd(f, 'qr:hide'); await wait(800);
    await cmd(f, 'act:start'); await wait(800);
    const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.state);
    return { context, page, f, st };
  }
  const tap = async (f, r) => { await f.click(`#board .sl[data-r="${r}"]`); await wait(300); };
  const armed = f => f.$$eval('#board .sl.armed', els => els.map(e => e.dataset.r).join());
  const found = async st => (await st()).got[(await st()).index].length;
  const look = f => f.$eval('#board .sl[data-r="5"]', e => ({ cls: e.className, name: e.querySelector('span')?.textContent ?? '', color: getComputedStyle(e.querySelector('b')).color }));

  {
    const { context, page, f, st } = await toList(true);
    check('التطبيق: في الإجابة، والخانات أزرار', (await st()).phase === 'ask' && await f.$eval('#board .sl[data-r="5"]', e => e.dataset.cmd === 'act:item:5'));
    const before = await look(f);
    await tap(f, 5);
    const after = await look(f);
    const ring = await f.$eval('#board .sl[data-r="5"] > b', b => { const a = getComputedStyle(b, '::after'), r = b.getBoundingClientRect(), c = document.getElementById('canvas').getBoundingClientRect(), k = c.width / 1920;
      return { content: a.content, border: a.borderTopWidth, style: a.borderTopStyle, inset: a.top, w: Math.round(r.width / k) }; });
    check(`النقرة الأولى تحدّد ولا تكشف: لا شيء في الحالة، والخانة 5 محددة، والاسم واللون كما هما (${JSON.stringify(ring)})`, (await found(st)) === 0 && (await st()).phase === 'ask'
      && (await armed(f)) === '5' && after.name === before.name && after.name === '' && after.color === before.color && after.cls === before.cls + ' armed');
    check('والإطار 4 بإزاحة 8 خارج الشارة (inset −12)، والاهتزاز مرة', ring.content === '""' && ring.border === '4px' && ring.style === 'solid' && ring.inset === '-12px'
      && await f.evaluate(() => window.__haptic) + await page.evaluate(() => window.__haptic) === 1);
    await page.screenshot({ path: `${shots}/app-rank-armed.png` });
    const sc = await f.evaluate(() => window.__stageCheck());
    check(`وفحص التداخل والشبكة سليم والخانة محددة (${sc.ok ? '' : sc.problems.join('، ')})`, sc.ok);
    await tap(f, 6);
    check('النقر على خانة أخرى ينقل التحديد إليها، ولا يكشف', (await armed(f)) === '6' && (await found(st)) === 0);
    await tap(f, 6);
    check('والثانية على الخانة نفسها تكشفها، ويزول التحديد', (await found(st)) === 1 && (await st()).got[(await st()).index][0].rank === 6 && (await armed(f)) === '' && (await st()).phase === 'hit');
    // بعد لحظة الإصابة (1.2 ثانية) الدور للخصم بعدّاده، والخانات أزرار من جديد.
    await wait(1800);
    await tap(f, 2);
    check('التحديد يبقى مع إعادة رسم اللوحة (العدّاد)', (await armed(f)) === '2' && (await wait(1200), (await armed(f)) === '2'));
    await wait(3200);
    check('ويزول بعد 4 ثوانٍ بلا نقرة', (await armed(f)) === '' && (await found(st)) === 1);
    await tap(f, 2);
    check('فالنقرة بعدها أولى من جديد: تحدّد ولا تكشف', (await armed(f)) === '2' && (await found(st)) === 1);
    await cmd(f, 'act:wrong'); await wait(500);
    check('و«خطأ» يزيل التحديد', (await armed(f)) === '' && (await found(st)) === 1 && (await st()).phase === 'wrong');
    await context.close();
  }
  {
    // الموقع منذ 106 (design/app.md 8.2): نقرتان بالفأرة كالتطبيق. الأولى تحدّد ولا تكشف، والثانية تكشف.
    const { context, f, st } = await toList(false);
    await tap(f, 5);
    check('الموقع: النقرة الأولى تحدّد الخانة ولا تكشفها', (await found(st)) === 0 && (await armed(f)) === '5');
    await tap(f, 5);
    check('الموقع: والثانية تكشفها، ويزول التحديد', (await found(st)) === 1 && (await armed(f)) === '');
    await context.close();
  }
  await browser.close();
  finish(errors);
})();
