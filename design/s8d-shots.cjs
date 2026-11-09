// سطر «المباريات قبل تكرار الأسئلة» (ش8-أ/67، design/s8d.md): صوره وقياسه على شاشة البداية المبنية.
// الاستعمال: node design/s8d-shots.cjs [مجلد] (والخادم على localhost:8000)، ثم: node design/ratio.cjs [مجلد]/1920/*.png
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const R = path.join(__dirname, '..');
const H = require(R + '/tests/helpers.cjs');
const out = process.argv[2], big = path.join(out, '1920'); fs.mkdirSync(big, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const SIZES = [[1920, 1080], [1366, 768], [1280, 800], [3840, 2160]];
const LONG = ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'];

async function shot(page, frame, name) {
  await wait(600);
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
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
  await H.usePin(ctx);
  const st = await ctx.newPage();
  await st.goto('http://localhost:8000/'); await st.evaluate(() => localStorage.clear()); await st.reload();
  await H.unlock(st);
  const f = await H.stageFrame(st); await wait(1500);
  await f.addScriptTag({ path: R + '/design/check.js' });
  await f.addScriptTag({ path: path.join(__dirname, 's8d.js') });
  await f.evaluate(() => RP.show({ letter: 12, 'last-two': 9, auction: 10, ranking: 14, wheel: 25 }));
  await shot(st, f, '1-البداية-فارغة');
  await f.evaluate(([a, b]) => { for (const [k, v] of [[1, a], [2, b]]) { const i = document.getElementById('i' + k); i.value = v; i.dispatchEvent(new Event('input', { bubbles: true })); } }, LONG);
  await f.evaluate(() => RP.show({ letter: 3, 'last-two': 1, auction: 0, ranking: 2, wheel: 0 }));
  await shot(st, f, '2-البداية-بالاسمين-وتتكرر');
  await ctx.close(); await browser.close();
})();
