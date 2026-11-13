// ش8-أ/111 و112 (المدقّق): مهلة 0.7 ثانية بعد كل تغيّر في الجولة تُقاس بوقت النقر نفسه، لا بلحظة معالجته في الصفحة الأم.
// 111: كانت تُقاس بلحظة المعالجة، فإن تأخرت معالجة الثانية من نقرتين على «تراجع» أكثر من 0.7 ثانية قُبلت، فيُتراجع خطوتين.
// 112: الأوامر هنا بوقت نقر صريح (at بساعة الصفحة الأم الرتيبة) لا بانشغال الصفحة، فلا يتأثر الفحص بالحمل. والحالات:
// 1) نقرتان بفارق 60ms بوقت النقر، والثانية تصل بعد 1.2 ثانية: تراجع واحد (بلحظة المعالجة: اثنان).
// 2) نقرة وقتها قبل ثانية تصل الآن، وأخرى بعدها بـ 0.8 ثانية بوقت النقر: تراجعان (المهلة من وقت النقرة لا من معالجتها: واحد).
// 3) وبعدها بـ 0.6 ثانية: تراجع واحد.
// 4) رسالتان بلا وقت بفارق 0.1 ثانية: تراجع واحد بلحظة المعالجة كما كانت (85).
// 5) نقرة حقيقية تحمل وقتها بساعة الصفحة الأم (بين 0 وثانية قبل وصولها)، ونقرتان حقيقيتان على «تراجع»: تراجع واحد.
// 6) ساعة الجهاز رجعت 30 ثانية بين تحميل الصفحة والإطار (timeOrigin الإطار أقدم): الأزرار لا تُهمل بعد المهلة.
// 7) أول نقرة بعد تحميل الصفحة، ووقتها في أول 0.7 ثانية منه: تُقبل.
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, sharedToFace, cmd } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  const { check, finish } = reporter();
  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function open(clockBack = 0) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    context.on('page', p => {
      p.on('pageerror', e => errors.push(e.message));
      p.on('console', m => m.type() === 'error' && !/pin\.json|Failed to load resource/.test(m.text()) && errors.push(m.text()));
    });
    await usePin(context);
    // ساعة الجهاز رجعت بين تحميل الصفحة الأم والإطار: ساعة الحقبة في الإطار أقدم بـ clockBack.
    if (clockBack) await context.addInitScript(ms => {
      if (window === window.top) return;
      const real = performance.timeOrigin;
      Object.defineProperty(performance, 'timeOrigin', { configurable: true, get: () => real - ms });
      const now = Date.now; Date.now = () => now() - ms;
    }, clockBack);
    const page = await context.newPage();
    page.on('dialog', d => d.accept());
    await page.goto(base);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    await unlock(page);
    const f = await stageFrame(page);
    await sharedToFace(f, { names: ['الصقور', 'النجوم'], picks: ['letter', 'last-two'] });
    await cmd(f, 'begin'); await f.waitForSelector('.scr.show[data-s="intro"]'); await wait(900);
    return { context, page, f };
  }
  const step = async (f, c) => { await f.waitForSelector(`[data-cmd="${c}"]:not(.off)`, { timeout: 8000 }); await cmd(f, c); await wait(900); };

  {
    const { context, page, f } = await open();
    for (const c of ['act:show', 'act:reveal', 'act:pick:0', 'act:next', 'act:reveal', 'act:pick:0', 'act:next', 'act:reveal', 'act:pick:0']) await step(f, c);
    const hist = () => page.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.history.length);
    // أمر من الإطار بوقت نقر صريح: d بعد وقت النقرة الأولى (base) أو بعد الآن.
    const send = (c, d, from) => f.evaluate(([c, d, from]) => {
      const at = (from === 'first' ? window.__first : parent.performance.now()) + d;
      if (from !== 'first') window.__first = at;
      parent.postMessage({ bc: 'cmd', cmd: c, at }, location.origin);
    }, [c, d, from]);
    const undos = async run => { const h = await hist(); await run(); await wait(900); return h - await hist(); };

    const n1 = await undos(async () => { await send('undo', 0); await wait(1200); await send('undo', 60, 'first'); });
    check(`1) نقرتان بفارق 60ms بوقت النقر، والثانية تصل بعد 1.2 ثانية: تراجع واحد (${n1})`, n1 === 1);
    const n2 = await undos(async () => { await send('undo', -1000); await send('undo', 800, 'first'); });
    check(`2) نقرة وقتها قبل ثانية، وأخرى بعدها بـ 0.8 ثانية بوقت النقر، تصلان الآن: تراجعان (${n2})`, n2 === 2);
    const n3 = await undos(async () => { await send('undo', -1000); await send('undo', 600, 'first'); });
    check(`3) وبعدها بـ 0.6 ثانية: تراجع واحد (${n3})`, n3 === 1);
    const n4 = await undos(() => f.evaluate(() => new Promise(r => { parent.postMessage({ bc: 'cmd', cmd: 'undo' }, location.origin);
      setTimeout(() => { parent.postMessage({ bc: 'cmd', cmd: 'undo' }, location.origin); r(); }, 100); })));
    check(`4) رسالتان بلا وقت بفارق 0.1 ثانية: تراجع واحد بلحظة المعالجة (${n4})`, n4 === 1);
    // 5) نقرة حقيقية: وقتها بساعة الصفحة الأم، قبل وصولها بأقل من ثانية.
    await page.evaluate(() => { window.__ages = []; addEventListener('message', e => { if (e.data?.bc === 'cmd') window.__ages.push(performance.now() - e.data.at); }, true); });
    const undoBtn = '#cornerA [data-cmd="undo"]';
    await f.waitForSelector(`${undoBtn}:not(.off)`, { timeout: 8000 });
    const n5 = await undos(() => f.dblclick(undoBtn));
    const ages = await page.evaluate(() => window.__ages);
    check(`5) نقرتان حقيقيتان على «تراجع»: تراجع واحد (${n5})، ووقت كلٍّ بساعة الصفحة الأم قبل وصولها (${ages.map(a => a.toFixed(0)).join('، ')}ms)`,
      n5 === 1 && ages.length === 2 && ages.every(a => a >= 0 && a < 1000));
    await context.close();
  }
  {
    // 6) ساعة الجهاز رجعت 30 ثانية بين تحميل الصفحة والإطار. تغيّر بلا نقرة (رسالة بلا وقت) يبدأ المهلة، ثم بعد ثانية نقرة حقيقية تُقبل.
    const { context, page, f } = await open(30000);
    const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.state);
    await f.evaluate(() => parent.postMessage({ bc: 'cmd', cmd: 'act:show' }, location.origin));
    await wait(1200);
    await f.waitForSelector('[data-cmd="act:reveal"]:not(.off)', { timeout: 8000 });
    await f.click('[data-cmd="act:reveal"]');
    await wait(900);
    const ph = (await st()).phase;
    check(`6) ساعة الإطار أقدم بـ 30 ثانية: «كشف الإجابة» بعد انقضاء المهلة يُقبل (${ph})`, ph === 'revealed');
    await context.close();
  }
  {
    // 7) بعد تحميل الصفحة ولا تغيّر بعد: نقرة وقتها بعد 0.1 ثانية من التحميل (بساعة الصفحة الرتيبة، تأخرت معالجتها تحت الحمل) تُقبل.
    // وكان أول المهلة 0، فتُهمل كل نقرة وقتها قبل 0.7 ثانية من التحميل (أخفقت به stage1-start وstage7-final تحت الحمل).
    const { context, page } = await open();
    await page.reload(); await unlock(page);
    const f = await stageFrame(page);
    const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.state);
    await f.evaluate(() => parent.postMessage({ bc: 'cmd', cmd: 'act:show', at: 100 }, location.origin));
    await wait(900);
    const ph = (await st()).phase;
    check(`7) أول نقرة بعد التحميل ووقتها بعد 0.1 ثانية منه: تُقبل (${ph})`, ph !== 'intro');
    await context.close();
  }
  await browser.close();
  process.exit(finish(errors) && !errors.length ? 0 : 1);
})();
