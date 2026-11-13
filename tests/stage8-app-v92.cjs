// اختبار آلي لملاحظات المالك 2–4 على v92 (design/app.md 6، 10 نوفمبر 2026). التطبيق (جسر Capacitor محقون) على 1920×1080، والموقع للنقاط:
// · 6.1 «المباريات قبل التكرار» حُذفت من الاثنين (design/app.md 8.4): لا قائمة ولا أيقونة، و«ملء الشاشة» وحده عند (127، 64) في الموقع.
// · ومنذ ش8-أ/106 (8.2) يسري ما يلي على الموقع والتطبيق معاً، فيُفحص الاثنان.
// · 6.2 الصف السفلي على خط 948: الزر والعدد 906–990. · 6.4 الخانتان 440 (1306–1746 و174–614) بنص إرشادي أقصر، و#p2 ينتهي عند 614.
// · 6.3 النقاط الثلاث كاملة: عرض ::before 3 × 17 = 51.
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

  for (const native of [true, false]) {
    const tag = native ? 'التطبيق' : 'الموقع';
    const { context, page, f } = await open(native);
    const corner = await f.$$eval('.ctl-corner .cbtn', els => els.filter(e => e.offsetParent).map(e => e.dataset.cmd));
    const fs = native ? null : await bx(f, '.ctl-corner [data-cmd="fullscreen"]');
    check(`${tag} 8.4: لا «المباريات قبل التكرار» ولا أيقونتها، وفي الزاوية ${native ? 'لا شيء' : '«ملء الشاشة» وحده عند (127، 64)'} (${corner.join('، ')} ${fs ?? ''})`,
      !(await f.$('#rp')) && !(await f.$('#rpIco')) && (native ? corner.length === 0 : corner.join() === 'fullscreen' && fs[0] === 127 && fs[1] === 64));
    let sc = await ok(f);
    check(`${tag}: وفحص التداخل والشبكة سليم في البداية (${sc})`, !sc);
    const go = await bx(f, '#startGo .cbtn'), side = await bx(f, '.start-side');
    check(`${tag} 6.2: الزر والعدد 906–990، فالصف على 948 (${go} · ${side})`, go[1] === 906 && go[3] === 990 && side[1] === 906 && side[3] === 990 && (await bx(f, '#i2'))[1] + 28 === 948);
    const i1 = await bx(f, '#i1'), i2 = await bx(f, '#i2'), p2 = await bx(f, '#p2');
    const ph = await f.evaluate(() => [document.getElementById('i1').placeholder, document.getElementById('i2').placeholder]);
    check(`${tag} 6.4: الخانتان 1306–1746 و174–614، و#p2 ينتهي عند 614، والنص «${ph.join('» و«')}» (${i1} · ${i2} · ${p2})`,
      i1[0] === 1306 && i1[2] === 1746 && i2[0] === 174 && i2[2] === 614 && p2[2] === 614 && ph.join() === 'اسم الفريق الأول,اسم الفريق الثاني');
    await page.screenshot({ path: `${shots}/${native ? 'app' : 'web'}-v92-start.png` });
    await sharedToFace(f, { names: ['الصقور', 'النجوم'], picks: ['letter', 'auction'] });
    await cmd(f, 'begin'); await f.waitForSelector('.scr.show[data-s="intro"]'); await cmd(f, 'act:show'); await wait(1200);
    check(`${tag} 6.3: عرض نقاط «⋯» 51 (${await dots(f)})`, (await dots(f)) === '51px');
    const logo = await bx(f, '.logo'), cA = await bx(f, '#cornerA');
    check(`${tag} 6.5: الشارة عند 80 ووسطها 112 كوسط صف الزاوية، والأزرار من 229 (${logo} · ${cA})`, logo[1] === 80 && (logo[1] + logo[3]) / 2 === 112 && cA[0] === 229 && (cA[1] + cA[3]) / 2 === 112);
    check(`${tag} 6.5: لا جسيمات`, await f.$eval('#particles', e => getComputedStyle(e).display) === 'none');
    sc = await ok(f);
    check(`${tag}: وفحص التداخل والشبكة سليم في الجولة (${sc})`, !sc);
    await page.screenshot({ path: `${shots}/${native ? 'app' : 'web'}-v92-game.png` });
    await context.close();
  }
  await browser.close();
  finish(errors);
})();
