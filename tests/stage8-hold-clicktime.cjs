// ش8-أ/111 (المدقّق، تقرير v114): مهلة 0.7 ثانية بعد كل تغيّر في الجولة كانت تُقاس بلحظة معالجة النقرة في الصفحة الأم، لا بلحظة النقر.
// فإن تأخرت معالجة النقرة الثانية من نقرتين على «تراجع» أكثر من 0.7 ثانية (جهاز بطيء أو حمل)، قُبلت، فيُتراجع خطوتين ويضيع حكم صحيح.
// هنا تُؤخَّر المعالجة بلا حمل: بعد معالجة أول «تراجع» تنشغل الصفحة الأم 1.2 ثانية، فتُعالج الثانية بعد انقضاء المهلة بلحظة المعالجة.
// · نقرتان على «تراجع» بفارق 60ms: تراجع واحد (على v114 تراجعان).
// · ونقرتان بفارق 0.9 ثانية بوقت النقر، ومعالجتهما متأخرة كذلك: تراجعان (المهلة لا تمنع نقرة مقصودة بعد انقضائها).
// · ونقرة بلا وقت (رسالة متأخرة بلا نقر) بعد تغيّر: تُمهل بلحظة معالجتها كما كانت (85).
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, sharedToFace, cmd } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  const { check, finish } = reporter();
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  context.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => m.type() === 'error' && !/pin\.json|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  });
  await usePin(context);
  const page = await context.newPage();
  page.on('dialog', d => d.accept());
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await unlock(page);
  const f = await stageFrame(page);
  const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.state);
  const hist = () => page.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.history.length);
  await sharedToFace(f, { names: ['الصقور', 'النجوم'], picks: ['letter', 'last-two'] });
  await cmd(f, 'begin'); await f.waitForSelector('.scr.show[data-s="intro"]'); await wait(900);
  // أحكام تتراكم في التاريخ: اعرض، ثم كشف وحكم، ثم التالي، ثم كشف وحكم.
  const step = async c => { await f.waitForSelector(`[data-cmd="${c}"]:not(.off)`, { timeout: 8000 }); await cmd(f, c); await wait(900); };
  await step('act:show'); await step('act:reveal'); await step('act:pick:0'); await step('act:next'); await step('act:reveal'); await step('act:pick:0');
  // الصفحة الأم تنشغل 1.2 ثانية بعد كل «تراجع» تعالجه، ما دام slow.
  await page.evaluate(() => {
    window.__slow = false;
    addEventListener('message', e => { if (window.__slow && e.data?.bc === 'cmd' && e.data.cmd === 'undo') { const t = performance.now(); while (performance.now() - t < 1200); } });
  });
  const undoBtn = '#cornerA [data-cmd="undo"]';
  const twice = async gap => {
    await f.waitForSelector(`${undoBtn}:not(.off)`, { timeout: 8000 });
    const h0 = await hist();
    await page.evaluate(() => { window.__slow = true; });
    // نقرتان حقيقيتان على الزر نفسه، الثانية بعد gap بوقت النقر.
    const box = await (await f.$(undoBtn)).boundingBox();
    // بلا انتظار في الصفحة نفسها (وهي منشغلة): الانتظار هنا، والنقرة تُرسل ووقتها وقت إرسالها، ثم تُعالج حين تفرغ الصفحة.
    const x = box.x + box.width / 2, y = box.y + box.height / 2;
    const first = page.mouse.click(x, y);
    await wait(gap);
    await Promise.all([first, page.mouse.click(x, y)]);
    await wait(3500);
    await page.evaluate(() => { window.__slow = false; });
    return h0 - await hist();
  };
  const n1 = await twice(60);
  check(`نقرتان على «تراجع» بفارق 60ms، ومعالجة الثانية بعد 1.2 ثانية: تراجع واحد (${n1})`, n1 === 1);
  const n2 = await twice(900);
  check(`ونقرتان بفارق 0.9 ثانية بوقت النقر، والمعالجة متأخرة كذلك: تراجعان (${n2})`, n2 === 2);
  // نقرة بلا وقت بعد تغيّر (85): تُمهل بلحظة معالجتها.
  await f.waitForSelector(`${undoBtn}:not(.off)`, { timeout: 8000 });
  const h0 = await hist();
  await f.evaluate(() => { parent.postMessage({ bc: 'cmd', cmd: 'undo' }, location.origin); setTimeout(() => parent.postMessage({ bc: 'cmd', cmd: 'undo' }, location.origin), 100); });
  await wait(1500);
  const n3 = h0 - await hist();
  check(`ورسالتان بلا وقت بفارق 0.1 ثانية: تراجع واحد بلحظة المعالجة كما كان (${n3})`, n3 === 1);
  await browser.close();
  process.exit(finish(errors) && !errors.length ? 0 : 1);
})();
