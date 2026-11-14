// ش8-أ/114 (المدقّق): «عُدّ · +1» في الوقت الحقيقي. عشر نقرات حقيقية على الزر (أحداث الفأرة من المتصفح، لا رسائل) في أقل من ثانية
// تُحسب كلها، والزر لا يتعطّل بينها ولا بعدها (ش8-أ/54، المالك في لعب حقيقي)، بمعالج عادي ثم أبطأ ست مرات (CPU throttling).
// وفحصها بوقت نقر صريح (كلٌّ بعد سابقتها بـ80 ms) في stage4-auction-fulfil (4ب).
// وهنا تُرسل أحداث الضغط والرفع العشرون (CDP Input.dispatchMouseEvent) إلى المتصفح معاً، لا نقرةً نقرة تنتظر كلٌّ ردّها، وهو يطلقها
// بترتيبها على الزر بأسرع ما يقدر، ومدتها بوقت النقرات نفسه في الإطار (e.timeStamp، isTrusted)، أولاها إلى آخرتها.
// فكانت بموعد من الاختبار لكلٍّ (80 ms) تطول تحت الحمل الشديد (8 نسخ معاً) إلى 1.2–2.3 ثانية، والحمل يؤخر الاختبار لا اللعبة.
// وهذه أشدّ على المهلة من نقرات بفاصل: كلها في أقل من 0.7 ثانية من أولاها، فلو أُمهلت «عُدّ» بعد نقرة لسقطت تسع.
// وساعة الجهاز تقف قبل «ابدأ» (helpers.cjs testClock) فلا ينقضي وقت الوفاء في أثناء الفحص.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { usePin, testClock, unlock, reporter, stageFrame, cmd, sharedToFace, hideQr } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { check, finish } = reporter();
  const errors = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const LONG = ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'];

  const real = JSON.parse(fs.readFileSync(path.join(__dirname, '../content/packs/general/auction.json'), 'utf8'));
  const long = real.topics.reduce((x, t) => (t.items.length > x.items.length ? t : x));
  const bank = { mode: 'auction', topics: [{ ...long, id: 'test-auction-realtime' }].concat(real.topics) };
  const N = 25;

  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block' });
  await usePin(context);
  const clock = await testClock(context);
  await context.route('**/content/packs/general/auction.json', route => route.fulfill({ json: bank }));
  context.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => m.type() === 'error' && !/content\/packs\/.+\.json/.test(m.location().url) && errors.push(m.text()));
  });
  const stage = await context.newPage();
  await stage.setViewportSize({ width: 1920, height: 1080 });
  await stage.goto(base);
  await stage.evaluate(ids => { localStorage.clear(); localStorage.setItem('big-challenge.seen', JSON.stringify(ids)); }, real.topics.map(t => t.id));
  await stage.reload();
  await unlock(stage);
  const audience = await stageFrame(stage);
  const st = () => stage.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.state);
  const tn = () => audience.$eval('#tn', e => Number(e.textContent.trim()));
  const counted = n => audience.waitForFunction(n => document.querySelector('#tn')?.textContent.trim() === String(n), n, { timeout: 10000 }).catch(() => {});

  // إلى الوفاء: يزايد فريق حتى N، ثم «ابدأ».
  await audience.waitForSelector('[data-cmd="draw"]', { timeout: 6000 });
  await sharedToFace(audience, { names: LONG, picks: ['auction', 'letter'] });
  await wait(2700);
  await cmd(audience, 'begin');
  await audience.waitForSelector('.scr.show[data-s="intro"]', { timeout: 5000 });
  const opener = Math.random() < 0.5 ? 1 : 2;
  await cmd(audience, 'act:show');
  await audience.waitForSelector('.scr.show[data-s="auc"]');
  await wait(800);
  await hideQr(audience);
  for (let n = 1; n <= N; n++) { await cmd(audience, 'raise:' + opener); await wait(80); }
  await wait(600);
  await clock.stop(stage);
  await cmd(audience, 'act:start');
  await audience.waitForSelector('#near [data-cmd="act:count"]', { timeout: 8000 });
  await wait(1000);
  check(`الوفاء: ${LONG[opener - 1]} ملتزم بـ ${N}، والعدّ 0`, (await st()).phase === 'fulfil' && (await st()).commit.n === N && (await tn()) === 0);

  const cdp = await context.newCDPSession(stage);
  // عشر نقرات حقيقية: الأحداث العشرون تُرسل معاً، ويُرصد في الإطار وقت كل نقرة على الزر وتعطّله (MutationObserver).
  const burst = async (from, label) => {
    await audience.evaluate(() => {
      const sel = '#near [data-cmd="act:count"]';
      const r = window.__burst = { ts: [], off: 0 };
      const look = () => { if ([...document.querySelectorAll(sel)].some(b => b.classList.contains('off'))) r.off++; };
      r.mo = new MutationObserver(look);
      r.mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['class'] });
      r.rec = e => { if (e.isTrusted && e.target.closest?.(sel)) r.ts.push(e.timeStamp); };
      document.addEventListener('click', r.rec, true);
    });
    const bb = await (await audience.$('#near [data-cmd="act:count"]')).boundingBox();
    const x = bb.x + bb.width / 2, y = bb.y + bb.height / 2;
    const ev = type => cdp.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', clickCount: 1 });
    await ev('mouseMoved');
    await Promise.all(Array.from({ length: 10 }, () => [ev('mousePressed'), ev('mouseReleased')]).flat());
    await counted(from + 10); await wait(800);
    const r = await audience.evaluate(() => { const r = window.__burst; r.mo.disconnect(); document.removeEventListener('click', r.rec, true);
      const sel = '#near [data-cmd="act:count"]';
      if ([...document.querySelectorAll(sel)].some(b => b.classList.contains('off'))) r.off++;
      return { n: r.ts.length, took: Math.round(r.ts[r.ts.length - 1] - r.ts[0]), off: r.off }; });
    const n = await tn(), said = (await st()).said.length;
    check(`${label}: عشر نقرات حقيقية في ${r.took} ms (أقل من ثانية، ${r.n} نقرة على الزر): العدّ ${n} من ${from + 10}، لا نقرة سقطت ولا حُسبت مرتين`,
      r.n === 10 && r.took < 1000 && n === from + 10 && said === from + 10);
    check(`${label}: والزر لم يتعطّل في أثناء النقرات ولا بعدها (${r.off ? 'معطّل ' + r.off + ' مرة' : 'لم يتعطّل'})`, r.off === 0);
  };

  await burst(0, 'بمعالج عادي');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 6 });
  await burst(10, 'بمعالج أبطأ ست مرات');
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  await stage.screenshot({ path: `${shots}/s8-count-realtime.png` });

  check(`لا أخطاء في الصفحات${errors.length ? ': ' + errors.join(' | ') : ''}`, errors.length === 0);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
