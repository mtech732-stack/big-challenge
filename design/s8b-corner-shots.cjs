// أزرار الزاوية في النافذة الواحدة (design/s8b.md 7): صورها وقياسها على اللعبة المبنية، في الحرف المعيّن والمزاد بأطول اسمين.
// الاستعمال: ONLY4=1 node design/s8b-corner-shots.cjs [مجلد الصور] (والخادم على localhost:8000). وبلا ONLY4 تُصوَّر الأفكار الثلاث الأولى أيضاً.
// ثم: node design/ratio.cjs [مجلد]/1920/*.png
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const R = path.join(__dirname, '..');
const H = require(R + '/tests/helpers.cjs');
const base = 'http://localhost:8000/', out = process.argv[2];
const big = path.join(out, '1920'); fs.mkdirSync(big, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const LONG = ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'];
const SIZES = [[1920, 1080], [1366, 768], [1280, 800], [3840, 2160]];
const go = async (frame, c, ms = 900) => { await frame.waitForSelector(`[data-cmd="${c}"]`, { state: 'attached', timeout: 8000 }); await frame.evaluate(c => document.querySelector(`[data-cmd="${c}"]`).click(), c); await wait(ms); };

async function shot(page, frame, name, transient) {
  await wait(1400);
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
  console.log(`${name}${transient ? ' (لوحة عابرة)' : ''}\n   ` + res.join('\n   '));
}

(async () => {
  const browser = await chromium.launch();
  for (const mode of ['letter', 'auction']) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
    await H.usePin(context);
    const stage = await context.newPage();
    await stage.goto(base); await stage.evaluate(() => localStorage.clear()); await stage.reload();
    await H.unlock(stage);
    const frame = await H.stageFrame(stage);
    await H.sharedToFace(frame, { names: LONG, picks: [mode, mode === 'letter' ? 'auction' : 'letter'] });
    await wait(2700);
    await go(frame, 'begin'); await frame.waitForSelector('.scr.show[data-s="intro"]', { timeout: 6000 });
    await go(frame, 'act:show', 1500);
    if (mode === 'auction') await H.hideQr(frame);
    else { const s = await frame.$('#near [data-cmd]'); if (s) { await frame.evaluate(() => document.querySelector('#near [data-cmd]').click()); await wait(1500); } }
    await frame.evaluate(() => { for (const [i, v] of [[1, '188'], [2, '176']]) document.getElementById('s' + i).textContent = v; });
    await frame.addScriptTag({ path: R + '/design/check.js' });
    await frame.addScriptTag({ path: path.join(__dirname, 's8b-corner.js') });
    const m = mode === 'letter' ? 'حرف' : 'مزاد';
    await shot(stage, frame, `0-الحالي-${m}`);
    if (process.env.ONLY4) {
      await frame.evaluate(() => BX.merged(false)); await shot(stage, frame, `4-مدمج-مغلقة-${m}`);
      await frame.evaluate(() => BX.merged(false, 'المزيد')); await shot(stage, frame, `4-مدمج-عند-المرور-${m}`, true);
      await frame.evaluate(() => BX.merged(true)); await shot(stage, frame, `4-مدمج-مفتوحة-${m}`, true);
      await frame.evaluate(() => BX.merged(true, 'مباراة جديدة')); await shot(stage, frame, `4-مدمج-مفتوحة-عند-المرور-${m}`, true);
      if (mode === 'letter') {
        const own = await frame.evaluate(() => document.getElementById('canvas').classList.contains('turn-1') ? 1 : 2);
        await frame.evaluate(o => { const c = document.getElementById('canvas'); c.classList.toggle('turn-1', o === 2); c.classList.toggle('turn-2', o === 1); for (const i of [1, 2]) document.getElementById('p' + i).classList.toggle('on', i !== o); }, own);
        await frame.evaluate(() => BX.merged(false)); await shot(stage, frame, `4-مدمج-مغلقة-حرف-الآخر`);
        await frame.evaluate(() => BX.merged(true, 'مباراة جديدة')); await shot(stage, frame, `4-مدمج-مفتوحة-عند-المرور-حرف-الآخر`, true);
      }
      await context.close(); continue;
    }
    await frame.evaluate(() => BX.folded(false)); await shot(stage, frame, `1-قائمة-مطوية-${m}`);
    await frame.evaluate(() => BX.folded(true)); await shot(stage, frame, `1-قائمة-مطوية-مفتوحة-${m}`, true);
    await frame.evaluate(() => BX.hidden()); await shot(stage, frame, `2-إخفاء-تلقائي-${m}`);
    await frame.evaluate(() => BX.reset()); await shot(stage, frame, `2-إخفاء-تلقائي-عند-الحركة-${m}`);
    await frame.evaluate(() => BX.icons()); await shot(stage, frame, `3-أيقونات-${m}`);
    await frame.evaluate(() => BX.icons('مباراة جديدة')); await shot(stage, frame, `3-أيقونات-عند-المرور-${m}`, true);
    await context.close();
  }
  await browser.close();
})();
