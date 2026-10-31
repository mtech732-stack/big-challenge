// تحكيم المزاد بكشف القائمة (الوثيقة 1.14، design/s8c.md): صوره وقياسه على اللعبة المبنية، بأطول اسمين.
// الاستعمال: node design/s8c-shots.cjs [مجلد الصور] (والخادم على localhost:8000)، ثم: node design/ratio.cjs [مجلد]/1920/*.png
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const R = path.join(__dirname, '..');
const H = require(R + '/tests/helpers.cjs');
const out = process.argv[2], big = path.join(out, '1920'); fs.mkdirSync(big, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const LONG = ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'];
const SIZES = [[1920, 1080], [1366, 768], [1280, 800], [3840, 2160]];
const BANK = JSON.parse(fs.readFileSync(R + '/content/packs/general/auction.json', 'utf8')).topics;
const topic = id => BANK.find(t => t.id === id);

async function shot(page, frame, name) {
  await wait(900);
  await page.screenshot({ path: path.join(big, name + '.png') });
  const res = [];
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h }); await wait(250);
    const r = await frame.evaluate(() => layoutCheck({ canvas: document.getElementById('canvas'), grid: true }));
    res.push(`${w}: ${r.ok ? 'سليم' : r.problems.join('، ')} (أدنى فراغ ${Math.round(r.minGap)})`);
  }
  await page.setViewportSize({ width: 1280, height: 720 }); await wait(300);
  await page.screenshot({ path: path.join(out, name + '.png') });
  await page.setViewportSize({ width: 1920, height: 1080 }); await wait(250);
  console.log(`${name}\n   ` + res.join('\n   '));
}

(async () => {
  const browser = await chromium.launch();
  for (const team of [1, 2]) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
    await H.usePin(ctx);
    const st = await ctx.newPage();
    await st.goto('http://localhost:8000/'); await st.evaluate(() => localStorage.clear()); await st.reload();
    await H.unlock(st);
    const f = await H.stageFrame(st);
    await H.sharedToFace(f, { names: LONG, picks: ['auction', 'letter'] });
    await wait(2700);
    await H.cmd(f, 'begin'); await f.waitForSelector('.scr.show[data-s="intro"]', { timeout: 6000 });
    await H.cmd(f, 'act:show'); await wait(1500);
    await H.hideQr(f); await wait(500);
    for (let n = 1; n <= 12; n++) { await H.cmd(f, 'raise:' + team); await wait(120); }
    await H.cmd(f, 'act:start'); await wait(1200);
    for (let n = 0; n < 5; n++) { await H.cmd(f, 'act:count'); await wait(120); }
    await f.evaluate(() => { for (const [i, v] of [[1, '88'], [2, '76']]) document.getElementById('s' + i).textContent = v; });
    await f.addScriptTag({ path: R + '/design/check.js' });
    await f.addScriptTag({ path: path.join(__dirname, 's8c.js') });
    const setTopic = t => f.evaluate(t => { document.querySelector('.card .scr.auc .topic').textContent = t; }, t);
    const tag = `-t${team}`;
    // 1. السرد: «عُدّ · +1» في صف الشارات، و«كشف القائمة» أسفل اليمين
    const cap = topic('general-auction-089');
    await setTopic(cap.topic);
    await f.evaluate(() => CX.fulfil());
    await shot(st, f, `1-السرد${tag}`);
    if (team === 1) {
      // 2. الكشف بأطول قائمة (193)، الصفحة الأولى والأخيرة
      const items = cap.items.map(x => x.name);
      const n = await f.evaluate(o => CX.reveal(o), { items, team, n: 12 });
      console.log(`   صفحات ${cap.topic}: ${n}`);
      await shot(st, f, `2-الكشف-193-ص1${tag}`);
      await f.evaluate(o => CX.reveal(o), { items, team, n: 12, page: n });
      await shot(st, f, `3-الكشف-193-الأخيرة${tag}`);
      // 3. أطول موضوع بأقصر قائمة (40)
      const short = BANK.slice().sort((a, b) => a.items.length - b.items.length || b.topic.length - a.topic.length)[0];
      await setTopic(short.topic);
      const m = await f.evaluate(o => CX.reveal(o), { items: short.items.map(x => x.name), team, n: 12 });
      console.log(`   صفحات ${short.topic} (${short.items.length}): ${m}`);
      await shot(st, f, `4-الكشف-أقصر-قائمة${tag}`);
      // 4. الحكم: وفى، ثم لم يفِ (الحدّ يكتسح إلى الخصم)
      await setTopic(cap.topic);
      await f.evaluate(o => CX.reveal(o), { items, team, n: 12 });
      await f.evaluate(o => CX.done(o), { ok: true, team, n: 12, names: LONG });
      await shot(st, f, `5-وفى${tag}`);
      await f.evaluate(() => { const c = document.getElementById('canvas'); c.classList.replace('turn-1', 'turn-2'); });
      await f.evaluate(o => CX.done(o), { ok: false, team, n: 12, names: LONG });
      await shot(st, f, `6-لم-يف${tag}`);
    } else {
      const sur = topic('general-auction-072');
      await setTopic(sur.topic);
      const n = await f.evaluate(o => CX.reveal(o), { items: sur.items.map(x => x.name), team, n: 12, page: 2 });
      console.log(`   صفحات ${sur.topic}: ${n}`);
      await shot(st, f, `2-الكشف-114-ص2${tag}`);
    }
    await ctx.close();
  }
  await browser.close();
})();
