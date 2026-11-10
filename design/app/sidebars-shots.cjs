const { chromium } = require('playwright');
const H = require('../../tests/helpers.cjs');
const out = process.argv[2], fix = process.argv[3] === 'fix';
const CSS = `.screen{background:linear-gradient(135deg,#1A4BD1 0%,#1238A8 55%,#0E2C86 100%) !important}
.canvas{overflow:visible !important;background:none !important}
.stagebg .f,.stagebg .e{left:-2240px !important;width:6400px !important}`;
(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ viewport: { width: 956, height: 440 }, deviceScaleFactor: 2 });
  await H.usePin(ctx); const page = await ctx.newPage();
  await page.goto('http://localhost:8765/'); await page.evaluate(() => localStorage.clear()); await page.reload();
  await H.unlock(page); const f = await H.stageFrame(page);
  const inj = async () => { if (fix) { await f.addStyleTag({ content: CSS }); await page.addStyleTag({ content: '#single .frame, #single .frame iframe{width:2347px !important}' }); await f.waitForTimeout(500); } };
  await inj();
  const w = ms => new Promise(r => setTimeout(r, ms));
  await w(800); await page.screenshot({ path: `${out}/1-setup.png` });
  await H.sharedToFace(f, { names: ['الصقور', 'النجوم'], picks: ['letter', 'last-two'] });
  await w(800); await page.screenshot({ path: `${out}/2-face.png` });
  await H.cmd(f, 'begin'); await f.waitForSelector('.scr.show[data-s="intro"]'); await w(600);
  await H.cmd(f, 'act:show'); await f.waitForSelector('.scr.show[data-s="q"]'); await w(1500);
  await page.screenshot({ path: `${out}/3-question.png` });
  await H.cmd(f, 'act:reveal').catch(e=>console.log('reveal',e.message)); await w(800);
  await page.screenshot({ path: `${out}/4-reveal.png` });
  await b.close();
})();
