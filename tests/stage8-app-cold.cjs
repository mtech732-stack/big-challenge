// اختبار آلي لـ ش8-أ/87 (المالك 10 نوفمبر 2026): «اذا اغلق التطبيق غلقا تاما فتعيد اما اذا كان غلقا و يظل باقي في الخلفية فيبقى».
// في التطبيق: الإغلاق التام يمسح sessionStorage، فالتشغيل بعده بداية جديدة بلا اسمين (وذاكرة الأسئلة كما هي). وإعادة التحميل
// والتطبيق حيّ (sessionStorage باقٍ) تستأنف كما هي. هنا الإغلاق التام صفحة جديدة في السياق نفسه (localStorage مشترك،
// وsessionStorage جديد)، والبقاء حياً إعادة تحميل الصفحة نفسها. والموقع على حاله: الصفحة الجديدة تستأنف.
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  const { check, finish } = reporter();
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const state = page => page.evaluate(() => { const m = JSON.parse(localStorage.getItem('big-challenge.match')); return { step: m.step, names: [m.teams[1], m.teams[2]], seen: localStorage.getItem('big-challenge.seen') }; });
  const shown = async page => { const f = await stageFrame(page); await wait(1500); return f.evaluate(() => ({ start: !!document.querySelector('[data-hero="start"]') && !!document.querySelector('[data-cmd="draw"]'), i1: document.getElementById('i1').value, i2: document.getElementById('i2').value })); };

  for (const native of [true, false]) {
    const where = native ? 'التطبيق' : 'الموقع';
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
    context.on('page', p => {
      p.on('pageerror', e => errors.push(e.message));
      p.on('console', m => m.type() === 'error' && !/pin\.json|Failed to load resource/.test(m.text()) && errors.push(m.text()));
    });
    await usePin(context);
    if (native) await context.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; });
    let page = await context.newPage();
    await page.goto(base); await page.evaluate(() => localStorage.clear()); await page.reload();
    if (!native) await unlock(page);
    const f0 = await stageFrame(page);
    await sharedToFace(f0, { names: ['الصقور', 'النجوم'], picks: ['letter', 'auction'] });
    await wait(2700);
    await cmd(f0, 'begin'); await f0.waitForSelector('.scr.show[data-s="intro"]');
    await cmd(f0, 'act:show'); await wait(800);
    const before = await state(page);
    // التطبيق حيّ (في الخلفية، أو أعاد WKWebView تحميل الصفحة): تُستأنف.
    await page.reload(); if (!native) await unlock(page); await wait(1500);
    let s = await state(page);
    check(`${where}: إعادة التحميل والتطبيق حيّ: تُستأنف المباراة (${before.step} ← ${s.step}، ${s.names.join('،')})`, before.step !== 'setup' && s.step === before.step && s.names.join() === 'الصقور,النجوم');
    // إغلاق تام ثم فتح: صفحة جديدة، sessionStorage جديد.
    await page.close(); page = await context.newPage(); await page.goto(base); if (!native) await unlock(page);
    const v = await shown(page); s = await state(page);
    if (native) {
      check(`التطبيق، بعد إغلاق تام: شاشة البداية بمباراة جديدة بلا اسمين (${s.step} · «${v.i1}»، «${v.i2}»)`, s.step === 'setup' && v.start && !v.i1 && !v.i2 && s.names.join() === ',');
      check(`وذاكرة الأسئلة كما هي (${before.seen ? JSON.parse(before.seen).length : 'لا شيء'} ← ${s.seen ? JSON.parse(s.seen).length : 'لا شيء'})`, !!before.seen && s.seen === before.seen);
    } else check(`الموقع، صفحة جديدة: تُستأنف كما كانت (${s.step})`, s.step === before.step && s.names.join() === 'الصقور,النجوم');
    if (native) {
      // اسمان كُتبا في شاشة البداية ولم تبدأ المباراة: بعد إغلاق تام يُمحيان أيضاً، وإعادة التحميل والتطبيق حيّ تبقيهما.
      const f = await stageFrame(page); await f.fill('#i1', 'أ'); await f.fill('#i2', 'ب'); await wait(500);
      await page.reload(); s = await state(page);
      check(`التطبيق، اسمان في شاشة البداية وإعادة تحميل والتطبيق حيّ: يبقيان (${s.names.join('،')})`, s.names.join() === 'أ,ب');
      await page.close(); page = await context.newPage(); await page.goto(base); await shown(page); s = await state(page);
      check(`وبعد إغلاق تام: يُمحيان (${s.names.join('،') || 'لا شيء'})`, s.step === 'setup' && s.names.join() === ',');
      // والفتح الثاني بعد إغلاق تام ثم إعادة تحميل: لا يمحو ما كُتب بعده (العلَم وُضع في هذا التشغيل).
      const g = await stageFrame(page); await g.fill('#i1', 'ج'); await wait(500); await page.reload(); s = await state(page);
      check(`وما كُتب بعد الفتح يبقى بإعادة التحميل (${s.names[0]})`, s.names[0] === 'ج');
    }
    await context.close();
  }
  await browser.close();
  finish(errors);
})();
