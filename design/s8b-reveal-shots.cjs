// كشف الإجابة في النمطين 1 و2 (ملاحظة التدقيق ش8-أ/56، design/s8b.md 7.2): لوحة «⋯» مغلقة ومفتوحة ومع الاسم، بأطول اسمين.
// الاستعمال (والخادم على localhost:8000):
//   CASES='[["وسم","الإجابة","نص السؤال"]]' [SC='[[1,"188"],[2,"176"]]'] node design/s8b-reveal-shots.cjs [مجلد]
//   ثم: node design/ratio.cjs [مجلد]/*.png
// وقبل بناء 56 في اللعبة: CSS=ملف أنماط يُضاف للتجربة، وNARROW=1 يحاكي المربع الضيق (والأنماط فيه بـ !important لأن placeBox يكتب العرض في style).
// HOVER محدِّد الأيقونة التي يُمرّ عليها (الافتراضي «مباراة جديدة»)، وMODES=letter,last-two.
const path = require('path'), fs = require('fs');
const { chromium } = require('playwright');
const R = require('path').join(__dirname, '..'), H = require(R + '/tests/helpers.cjs');
const out = process.argv[2]; fs.mkdirSync(out, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const LONG = ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'];
const css = process.env.CSS ? fs.readFileSync(process.env.CSS, 'utf8') : '';
const CASES = JSON.parse(process.env.CASES);
(async () => {
  const browser = await chromium.launch();
  for (const mode of (process.env.MODES || 'letter,last-two').split(',')) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
    await H.usePin(ctx);
    const st = await ctx.newPage();
    await st.goto('http://localhost:8000/'); await st.evaluate(() => localStorage.clear()); await st.reload();
    await H.unlock(st);
    const f = await H.stageFrame(st);
    await H.sharedToFace(f, { names: LONG, picks: [mode, mode === 'letter' ? 'auction' : 'letter'] });
    await wait(2700);
    await H.cmd(f, 'begin'); await f.waitForSelector('.scr.show[data-s="intro"]', { timeout: 6000 });
    await H.cmd(f, 'act:show'); await wait(1500);
    await f.waitForSelector('[data-cmd="act:reveal"]', { state: 'attached', timeout: 8000 });
    await f.evaluate(() => document.querySelector('[data-cmd="act:reveal"]').click()); await wait(1500);
    if (css) await f.addStyleTag({ content: css });
    await f.evaluate((sc) => { for (const [i, v] of sc) document.getElementById('s' + i).textContent = v; }, JSON.parse(process.env.SC || '[[1,"88"],[2,"88"]]'));
    if (process.env.DUMP) { console.log(await f.evaluate(() => document.querySelector('.card .scr.show')?.outerHTML.slice(0, 1500))); }
    await f.addScriptTag({ path: R + '/design/check.js' });
    for (const [tag, ans, q] of CASES) {
      await f.evaluate(([a, q]) => { if (a) document.getElementById('answer').textContent = a;
        if (q) { const e = document.querySelector('.card .scr.show [data-fit="السؤال"], .card .scr.show .q'); if (e) e.textContent = q; } }, [ans, q]);
      await wait(300);
      if (process.env.NARROW) { const w = await f.evaluate(() => { const b = document.getElementById('box'), r = document.getElementById('reveal'); b.classList.remove('narrow'); const w = r.scrollWidth; b.classList.toggle('narrow', b.classList.contains('ans') && w <= 417); return [w, b.className]; }); console.log('NARROW', mode, tag, w); }
      for (const st8 of ['closed', 'open', 'tip']) {
        const isOpen = await f.evaluate(() => !document.querySelector('.ctl-more')?.hidden);
        if ((st8 !== 'closed') !== isOpen) { await f.evaluate(() => document.querySelector('[data-cmd="more"]').click()); await wait(400); }
        if (st8 === 'tip') { const b = await f.$(process.env.HOVER || '.ctl-more [data-cmd="new"]'); await b.hover(); await wait(400); }
        else await st.mouse.move(1900, 600);
        await wait(300);
        const p = path.join(out, `${mode}-${tag}-${st8}.png`);
        await st.screenshot({ path: p });
        const lc = await f.evaluate(() => layoutCheck({ canvas: document.getElementById('canvas'), grid: true }));
        if (!lc.ok) console.log('LAYOUT', mode, tag, st8, lc.problems.join('، '));
      }
      await f.evaluate(() => { if (!document.querySelector('.ctl-more')?.hidden) document.querySelector('[data-cmd="more"]').click(); });
    }
    await ctx.close();
  }
  await browser.close();
})();
