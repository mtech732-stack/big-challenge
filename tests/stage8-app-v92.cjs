// اختبار آلي لملاحظات المالك 2–4 على v92 (design/app.md 6، 10 نوفمبر 2026). التطبيق (جسر Capacitor محقون) على 1920×1080، والموقع للنقاط:
// · 6.1 «المباريات قبل التكرار» خلف أيقونة 96 عند (127، 64)، تفتح لوحاً عند (127، 184) بعمودين بلا «·» ينتهي عند 576 × 576،
//   وتُغلق بنقرة ثانية، وبنقرة في مكان آخر، وبالانتقال من شاشة البداية. والموقع كما كان (نص بـ «·»).
// · 6.2 الصف السفلي على خط 948: الزر والعدد 906–990. · 6.4 الخانتان 440 (1306–1746 و174–614) بنص إرشادي أقصر، و#p2 ينتهي عند 614.
// · 6.3 النقاط الثلاث كاملة: عرض ::before 3 × 17 = 51 في التطبيق، و3 × 12 = 36 في الموقع.
// · 6.5 في الجولة: الشارة عند 80، وأزرار الزاوية من 229، ولا جسيمات. · وفحص التداخل والشبكة سليم في كل حالة.
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  const { check, finish } = reporter();
  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function open(native) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    context.on('page', p => {
      p.on('pageerror', e => errors.push(e.message));
      p.on('console', m => m.type() === 'error' && !/pin\.json|Failed to load resource/.test(m.text()) && errors.push(m.text()));
    });
    await usePin(context);
    if (native) await context.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; });
    const page = await context.newPage();
    await page.goto(base); await page.evaluate(() => localStorage.clear()); await page.reload();
    if (!native) await unlock(page);
    const f = await stageFrame(page); await wait(2500);
    return { context, page, f };
  }
  const bx = (f, sel) => f.evaluate(sel => { const e = document.querySelector(sel); if (!e) return null; const c = document.getElementById('canvas').getBoundingClientRect(), k = c.width / 1920, r = e.getBoundingClientRect();
    return [r.left, r.top, r.right, r.bottom].map((v, i) => Math.round((v - (i % 2 ? c.top : c.left)) / k)); }, sel);
  const ok = async f => { let r = await f.evaluate(() => window.__stageCheck()); if (!r.ok) { await wait(800); r = await f.evaluate(() => window.__stageCheck()); } return r.ok ? '' : r.problems.join('، '); };
  const cls = f => f.evaluate(() => document.getElementById('rp')?.className ?? 'لا قائمة');
  const dots = f => f.$eval('[data-cmd="more"]', e => getComputedStyle(e, '::before').width);

  // ===== الموقع =====
  {
    const { context, f } = await open(false);
    const rp = await f.$eval('#rp', e => ({ text: e.innerText.replace(/\s+/g, ' '), shown: getComputedStyle(e).display !== 'none' }));
    check(`الموقع: القائمة نص ظاهر بـ «·» ولا أيقونة (${rp.text.slice(0, 40)}…)`, rp.shown && rp.text.includes(' · ') && !(await f.$('#rpIco')));
    await sharedToFace(f, { names: ['الصقور', 'النجوم'], picks: ['letter', 'auction'] });
    await cmd(f, 'begin'); await f.waitForSelector('.scr.show[data-s="intro"]');
    check(`الموقع 6.3: عرض نقاط «⋯» 36 (${await dots(f)})`, (await dots(f)) === '36px');
    check(`الموقع: الشارة وأزرار الزاوية كما كانت (${await bx(f, '.logo')} · ${await bx(f, '#cornerA')})`, (await bx(f, '.logo'))[1] === 64 && (await bx(f, '#cornerA'))[0] === 213);
    await context.close();
  }

  // ===== التطبيق =====
  {
    const { context, page, f } = await open(true);
    const ico = await bx(f, '#rpIco');
    check(`6.1: أيقونة القائمة 96 عند (127، 64)، والقائمة مخفية (${ico})`, ico?.join() === '127,64,223,160' && await f.$eval('#rp', e => getComputedStyle(e).display) === 'none');
    let sc = await ok(f);
    check(`وفحص التداخل والشبكة سليم في البداية (${sc})`, !sc);
    const go = await bx(f, '#startGo .cbtn'), side = await bx(f, '.start-side');
    check(`6.2: الزر والعدد 906–990، فالصف على 948 (${go} · ${side})`, go[1] === 906 && go[3] === 990 && side[1] === 906 && side[3] === 990 && (await bx(f, '#i2'))[1] + 28 === 948);
    const i1 = await bx(f, '#i1'), i2 = await bx(f, '#i2'), p2 = await bx(f, '#p2');
    const ph = await f.evaluate(() => [document.getElementById('i1').placeholder, document.getElementById('i2').placeholder]);
    check(`6.4: الخانتان 1306–1746 و174–614، و#p2 ينتهي عند 614، والنص «${ph.join('» و«')}» (${i1} · ${i2} · ${p2})`,
      i1[0] === 1306 && i1[2] === 1746 && i2[0] === 174 && i2[2] === 614 && p2[2] === 614 && ph.join() === 'اسم الفريق الأول,اسم الفريق الثاني');
    await f.click('#rpIco'); await wait(300);
    const rp = await bx(f, '#rp'), text = await f.$eval('#rp', e => e.innerText);
    const cols = await f.$$eval('#rp p:not(.h)', ps => ps.map(p => [p.querySelector('.nm').getBoundingClientRect().right, p.querySelector('b').getBoundingClientRect().left].map(Math.round)));
    sc = await ok(f);
    check(`6.1: النقر يفتحها لوحاً عند (127، 184) ينتهي عند 576 × 576، والأيقونة بيضاء (${rp})`, rp?.join() === '127,184,576,576' && await f.$eval('#rpIco', e => e.classList.contains('open')));
    check(`وفيها عمودان بلا «·»: الأسماء يميناً والأعداد يساراً (${cols.length} سطراً)`, !text.includes('·') && cols.length >= 5 && cols.every(([nm, n]) => n < nm));
    check(`وفحص التداخل والشبكة سليم والقائمة مفتوحة (${sc})`, !sc);
    await page.screenshot({ path: `${shots}/app-v92-rp.png` });
    await f.click('#rpIco'); await wait(300);
    const second = await cls(f);
    await f.click('#rpIco'); await wait(300);
    await f.click('#canvas', { position: { x: 960, y: 300 }, force: true }); await wait(300);
    const elsewhere = await cls(f);
    await f.click('#rpIco'); await wait(300);
    await sharedToFace(f, { names: ['الصقور', 'النجوم'], picks: ['letter', 'auction'] });
    const left = !(await f.$('#rp')) && !(await f.$('#rpIco'));
    check(`وتُغلق بنقرة ثانية (${second})، وبنقرة في مكان آخر (${elsewhere})، وبالانتقال من البداية (${left})`, second === 'rp' && elsewhere === 'rp' && left);
    await cmd(f, 'begin'); await f.waitForSelector('.scr.show[data-s="intro"]'); await cmd(f, 'act:show'); await wait(1200);
    check(`6.3: عرض نقاط «⋯» 51 (${await dots(f)})`, (await dots(f)) === '51px');
    const logo = await bx(f, '.logo'), corner = await bx(f, '#cornerA');
    check(`6.5: الشارة عند 80 ووسطها 112 كوسط صف الزاوية، والأزرار من 229 (${logo} · ${corner})`, logo[1] === 80 && (logo[1] + logo[3]) / 2 === 112 && corner[0] === 229 && (corner[1] + corner[3]) / 2 === 112);
    check('6.5: لا جسيمات', await f.$eval('#particles', e => getComputedStyle(e).display) === 'none');
    sc = await ok(f);
    check(`وفحص التداخل والشبكة سليم في الجولة (${sc})`, !sc);
    await page.screenshot({ path: `${shots}/app-v92-game.png` });
    await context.close();
  }
  await browser.close();
  finish(errors);
})();
