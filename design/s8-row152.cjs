// قياس s8.md 2.1 (1.2): زر «الباركود» لإعادته في صف النوافذ (152)، في اللعبة المبنية نفسها (v51، #262) بلا طبقة تصوّر.
// المزاد والترتيب بعد «أخفِ الباركود»، بالاسمين العاديين والأطول، وبرقمين 0/0 و188/176، على أربعة مقاسات، بـ design/check.js.
// الاستعمال: node design/s8-row152.cjs [الرابط]
const path = require('path');
const { chromium } = require('playwright');
const root = path.join(__dirname, '..');
const base = process.argv[2] || 'http://localhost:8000/';
const H = require(root + '/tests/helpers.cjs');
const wait = ms => new Promise(r => setTimeout(r, ms));
(async () => {
  const browser = await chromium.launch();
  let all = true;
  for (const names of [['الصقور', 'النجوم'], ['فريق النخبة الذهبي', 'نجوم المستقبل معاً']])
  for (const first of ['auction', 'ranking']) {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
    await H.usePin(context);
    const stage = await context.newPage();
    await stage.goto(base); await stage.evaluate(() => localStorage.clear()); await stage.reload();
    await H.unlock(stage);
    const frame = await H.stageFrame(stage);
    await frame.waitForSelector('[data-cmd="draw"]');
    await H.sharedToFace(frame, { names, picks: first === 'auction' ? ['auction', 'ranking'] : ['ranking', 'auction'] });
    await wait(2700);
    await H.cmd(frame, 'begin');
    await frame.waitForSelector('.scr.show[data-s="intro"]', { timeout: 6000 });
    await H.cmd(frame, 'act:show'); await wait(1200);
    await H.cmd(frame, 'qr:hide'); await wait(800);
    await frame.addScriptTag({ path: root + '/design/check.js' });
    for (const sc of [null, ['188', '176']]) {
      if (sc) await frame.evaluate(s => { document.getElementById('s1').textContent = s[0]; document.getElementById('s2').textContent = s[1]; document.querySelectorAll('.team .score').forEach(x => x.classList.add('three')); }, sc);
      for (const [w, h] of [[1920, 1080], [1366, 768], [1280, 800], [3840, 2160]]) {
        await stage.setViewportSize({ width: w, height: h }); await wait(300);
        const r = await frame.evaluate(() => {
          const res = layoutCheck({ canvas: document.getElementById('canvas'), grid: true });
          const cv = document.getElementById('canvas').getBoundingClientRect(), k = cv.width / 1920;
          const box = el => { const b = el.getBoundingClientRect(); return { x1: (b.left - cv.left) / k, x2: (b.right - cv.left) / k, y1: (b.top - cv.top) / k, y2: (b.bottom - cv.top) / k }; };
          const row = document.getElementById('cornerB'), btn = row.querySelector('[data-cmd="qr:show"]');
          const rb = box(btn);
          // أقرب عنصر للصف من بنود الفحص
          let near = null;
          for (const it of res.items) { if (it.x1 <= rb.x1 + 1 && it.x2 >= rb.x2 - 1 && it.y1 <= rb.y1 + 1 && it.y2 >= rb.y2 - 1) continue;
            const g = Math.max(it.x1 - rb.x2, rb.x1 - it.x2, it.y1 - rb.y2, rb.y1 - it.y2); if (!near || g < near.g) near = { g: Math.round(g * 10) / 10, name: it.name }; }
          return { ok: res.ok, problems: res.problems, min: Math.round(res.minGap * 10) / 10, visible: !!btn && !!btn.getClientRects().length, row: Object.values(rb).map(Math.round), near, names: res.items.map(i => i.name) };
        });
        if (!r.ok || !r.visible) all = false;
        console.log(`${r.ok && r.visible ? '✓' : '✗'} ${names[0]} · ${first} · ${sc ? '188/176' : '0/0'} · ${w}: الزر ${r.visible ? 'ظاهر' : 'غائب'}، الصف ${r.row.join(',')}، أقرب ${r.near?.name} بـ ${r.near?.g}، أدنى فراغ ${r.min}${r.ok ? '' : ' ' + r.problems.join('، ')}`);
      }
      await stage.setViewportSize({ width: 1920, height: 1080 });
    }
    await context.close();
  }
  console.log(all ? 'سليم كله' : 'فيه خلل');
  await browser.close();
})();
