// اختبار آلي: مساحات اللمس 44 نقطة في تطبيق آبل (design/app.md 4). والموقع لا يتغير.
// يُلعب في التطبيق (جسر Capacitor محقون كما يحقنه الغلاف) على شاشة آيفون 956×440، آلياً من الإعداد إلى النهاية
// بأنماط: الحرف المعيّن والمزاد (ومعهما الشريط والنهاية)، ثم الترتيب وآخر حرفين. وفي كل شاشة جديدة، ولوحة «⋯» مفتوحة فيها:
// · لا تتداخل مساحتا لمس، ولا تتجاوز مساحةٌ زرّاً آخر (tests/touch-audit.cjs).
// · كل مساحة 120×120 من اللوحة على الأقل (44 نقطة)، إلا خانات لوحة الترتيب: صفوفها متلاصقة، فتُقاس وحدها.
// · فحص التداخل والشبكة (design/check.js ← js/stage-check.js) سليم، ومعه لوحة «⋯».
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace } = require('./helpers.cjs');
const { touchAudit } = require('./touch-audit.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  const { check, finish } = reporter();
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const audit = f => f.evaluate(`(${touchAudit})()`);

  async function open(native) {
    const context = await browser.newContext({ viewport: { width: 956, height: 440 } });
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
    return { context, page, frame: await stageFrame(page) };
  }
  const box = (f, sel) => f.$eval(sel, e => { const r = e.getBoundingClientRect(), c = document.getElementById('canvas').getBoundingClientRect(), k = c.width / 1920;
    return { l: Math.round((r.left - c.left) / k), t: Math.round((r.top - c.top) / k), w: Math.round(r.width / k), h: Math.round(r.height / k) }; });
  const toRound = async f => {
    await sharedToFace(f, { names: ['الصقور', 'النجوم'], picks: ['letter', 'last-two'] });
    await cmd(f, 'begin'); await f.waitForSelector('.scr.show[data-s="intro"]');
  };

  // ===== الموقع: لا تغيير =====
  {
    const { context, frame: f } = await open(false);
    const name = await f.evaluate(() => getComputedStyle(document.querySelector('#i1')).height);
    await toRound(f);
    const more = await box(f, '[data-cmd="more"]');
    const after = await f.$eval('[data-cmd="more"]', e => getComputedStyle(e, '::after').content);
    await f.click('[data-cmd="more"]'); await wait(400);
    const panel = await box(f, '#moreMenu');
    const fs = await f.$('#moreMenu [data-cmd="fullscreen"]').then(e => e?.isVisible());
    check('الموقع: أيقونة «⋯» 64×64 بلا مساحة لمس إضافية', more.w === 64 && more.h === 64 && after === 'none');
    check(`الموقع: لوحة «⋯» كما هي عند (127، 152) و«ملء الشاشة» فيها (${JSON.stringify(panel)})`, panel.l === 127 && panel.t === 152 && fs);
    check('الموقع: خانة الاسم 56 كما هي', name === '56px');
    await context.close();
  }

  // ===== التطبيق: القيم =====
  {
    const { context, page, frame: f } = await open(true);
    // خانة الاسم: الصف كله (136) يركّز عليها، والخط المتقطع في مكانه.
    const row = await f.$eval('#p1 .row', e => { const r = e.getBoundingClientRect(); return { x: r.left + 8, y: r.top + 8, h: e.offsetHeight }; });
    const fr = await (await page.$('#single iframe')).boundingBox(), k = fr.width / (await f.evaluate(() => innerWidth));
    await page.mouse.click(fr.x + row.x * k, fr.y + row.y * k);
    check('خانة الاسم: النقر في صفها خارج الخانة يركّز عليها، وارتفاع الصف 136', await f.evaluate(() => document.activeElement?.id === 'i1') && row.h === 136
      && await f.evaluate(() => getComputedStyle(document.querySelector('#i1')).height) === '56px');
    await toRound(f);
    const icons = await f.$$eval('#cornerA .cbtn.ico', els => els.map(e => [e.offsetWidth, e.offsetHeight, e.querySelector('svg')?.getAttribute('width') ?? getComputedStyle(e.querySelector('svg') ?? e).width]));
    check(`أيقونات الزاوية 96×96 (${JSON.stringify(icons)})`, icons.length >= 1 && icons.every(([w, h]) => w === 96 && h === 96));
    check('الأيقونة بداخلها 52 بخط 4', await f.$eval('#cornerA [data-cmd="more"]', () => true) && await f.evaluate(() => {
      const s = document.querySelector('#cornerA .cbtn.ico svg'); return !s || (getComputedStyle(s).width === '52px' && getComputedStyle(s).strokeWidth === '4px'); }));
    // الاسم يتبع الأيقونة بمقاسها الجديد: تحتها بـ 24 (design/s8b.md 7.1). وفي التطبيق يظهر بالضغط المطوّل لا بالمرور (design/app.md 5.6).
    const mb = await (await f.$('#cornerA [data-cmd="more"]')).boundingBox();
    await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2); await page.mouse.down(); await wait(700);
    const ic = await box(f, '#cornerA [data-cmd="more"]'), tip = await box(f, '#ctlTip');
    check(`الاسم بالضغط المطوّل تحت الأيقونة 96 بـ 24 (${ic.t + ic.h} ← ${tip.t})`, tip.t === ic.t + ic.h + 24 && tip.l === ic.l);
    await page.mouse.up(); await wait(300);
    await page.mouse.move(1, 1);
    await cmd(f, 'act:show'); await f.waitForSelector('.scr.show[data-s="q"]'); await wait(800);
    await f.click('[data-cmd="more"]'); await wait(400);
    const panel = await box(f, '#moreMenu');
    const row1 = await f.$$eval('#moreMenu .cbtn', els => els.filter(e => e.offsetParent).map(e => [e.dataset.cmd, Math.round(e.getBoundingClientRect().top)]));
    const near = await box(f, '#near');
    check(`لوحة «⋯» صف واحد عند (127، 184) وتنتهي عند (538، 328) (${JSON.stringify(panel)})`, panel.l === 127 && panel.t === 184 && panel.l + panel.w === 538 && panel.t + panel.h === 328
      && new Set(row1.map(x => x[1])).size === 1);
    check(`لوحة «⋯»: الصوت والرصيد ثم «مباراة جديدة»، بلا «ملء الشاشة» (${row1.map(x => x[0]).join('، ')})`, row1.map(x => x[0]).join() === 'mute,scores,new');
    check(`ولا تمس صف الشارات (أقرب زر عند ${near.l})`, panel.l + panel.w + 24 <= near.l);
    await page.screenshot({ path: `${shots}/app-touch-more.png` });
    await context.close();
  }

  // ===== التطبيق: كل شاشة في مباراتين تُلعبان آلياً =====
  const skip = /^(undo|more|new|scores|mute|replay|qr:show|back|undoPick|toPick|fullscreen|act:pause|act:steal|act:wrong)$/;
  const pref = ['qr:hide', 'begin', 'act:show', 'act:start', 'raise:1', 'act:reveal', 'act:ok', 'act:pick:1', 'act:item:1', 'act:finish', 'act:spin', 'act:failed', 'act:next', 'next', 'tiebreak', 'announce'];
  for (const picks of process.env.ONLY ? [process.env.ONLY.split(',')] : [['letter', 'auction'], ['ranking', 'last-two']]) {
    const tag = picks.join('+') + ': ';
    const { context, page, frame: f } = await open(true);
    const problems = [], seen = new Set();
    let screens = 0, slotsOk = true, slotsSeen = 0, ended = false;
    const look = async label => {
      const r = await audit(f);
      // فحص الشبكة لما يستقر: إن وقع على لحظة حركة (نتيجة الشريط تدخل مثلاً) أُعيد بعد 0.8 ثانية، والمشكلة الحقيقية تبقى.
      let sc = await f.evaluate(() => window.__stageCheck());
      if (!sc.ok) { await wait(800); sc = await f.evaluate(() => window.__stageCheck()); }
      if (r.clash.length) problems.push(`${label}: تداخل ${r.clash.join('، ')}`);
      if (r.small.length) problems.push(`${label}: أصغر من 120 ${r.small.join('، ')}`);
      if (!sc.ok) problems.push(`${label}: ${sc.problems.join('، ')}`);
      // خانات الترتيب: ارتفاعها 48، ومساحتها إلى منتصف الفاصل بين العمودين (24).
      for (const s of r.slots) { slotsSeen++; if (s.hit.b - s.hit.t < 47.5 || s.hit.r - s.hit.l - (s.el.r - s.el.l) < 47.5) slotsOk = false; }
      return r.items.map(i => i.name);
    };
    await look('الإعداد');
    await sharedToFace(f, { names: ['الصقور', 'النجوم'], picks });
    for (let i = 0; i < 90 && !ended; i++) {
      await wait(1100);
      const cmds = await look(`خطوة ${i}`);
      const sig = cmds.join('|');
      if (!seen.has(sig)) {
        seen.add(sig); screens++;
        if (cmds.includes('more')) { await f.click('[data-cmd="more"]'); await wait(500);
          if (process.env.SHOTS) await page.screenshot({ path: `${shots}/app-touch-more-${i}.png` }); await look(`«⋯» في الخطوة ${i} [${sig}]`); await f.click('[data-cmd="more"]'); await wait(300); }
      }
      const enabled = await f.$$eval('[data-cmd]', els => els.filter(e => e.offsetParent && !e.classList.contains('off')).map(e => e.dataset.cmd));
      // النهاية: إعلان الفائز، فيها «مباراة جديدة» وحدها بعد الفحص.
      ended = !!(await f.$('.scr.win.show'));
      const go = pref.find(p => enabled.includes(p)) ?? enabled.find(c => !skip.test(c));
      if (!go) continue;
      await cmd(f, go).catch(() => {});
      if (go === 'act:spin') await wait(5000);
    }
    await page.screenshot({ path: `${shots}/app-touch-${picks.join('-')}-end.png` });
    check(tag + `بلغت النهاية، و${screens} شاشة مختلفة فُحصت`, ended && screens >= 10);
    check(tag + `لا تداخل بين مساحات اللمس، وكلها 120 على الأقل، وفحص التداخل سليم ومعه «⋯» (${problems.slice(0, 4).join(' | ')})`, problems.length === 0);
    if (picks.includes('ranking')) check(tag + `خانات الترتيب: ارتفاع 48، والمساحة +24 يميناً ويساراً (${slotsSeen} قياساً)`, slotsSeen > 0 && slotsOk);
    await context.close();
  }

  await browser.close();
  finish(errors);
})();
