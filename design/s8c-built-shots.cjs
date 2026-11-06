// تحكيم المزاد (الوثيقة 1.14، design/s8c.md 1.1، وش8-أ/57) مصوّراً من اللعبة المبنية لا من طبقة s8c.js، بأطول اسمين، لـ check.js وratio.cjs.
// الاستعمال (والخادم على localhost:8000): [SC='[188,176]'] node design/s8c-built-shots.cjs [مجلد] [الرابط]، ثم: node design/ratio.cjs [مجلد]/1920/*.png
// الحالات: السرد · انقضى الوقت ولم يُكشف · الكشف (193 الصفحة الأولى والأخيرة، و114 الثانية، وأقصر قائمة) · وفى · لم يفِ، والملتزم الأول ثم الثاني.
const fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const R = path.join(__dirname, '..');
const H = require(R + '/tests/helpers.cjs');
const out = process.argv[2], base = process.argv[3] || 'http://localhost:8000/', big = path.join(out, '1920'); fs.mkdirSync(big, { recursive: true });
const wait = ms => new Promise(r => setTimeout(r, ms));
const LONG = ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'];
// الرصيد افتراضاً رقمان من ثلاث خانات، أسوأ الأبيض (ملاحظة المدقّق #349). وSC='[88,76]' للمقارنة.
const SC = JSON.parse(process.env.SC || '[188,176]');
// الالتزام كما قاس المدقّق (#349): 48، و N= لغيره.
const COMMIT = Number(process.env.N || 48);
const SIZES = [[1920, 1080], [1366, 768], [1280, 800], [3840, 2160]];
const BANK = JSON.parse(fs.readFileSync(R + '/content/packs/general/auction.json', 'utf8')).topics;
const topic = id => BANK.find(t => t.id === id);
const shortest = BANK.slice().sort((a, b) => a.items.length - b.items.length || b.topic.length - a.topic.length)[0];

async function shot(page, frame, name) {
  await page.mouse.move(1900, 600);
  await wait(900);
  await page.screenshot({ path: path.join(big, name + '.png') });
  const res = [];
  for (const [w, h] of SIZES) {
    await page.setViewportSize({ width: w, height: h }); await wait(250);
    const r = await frame.evaluate(() => layoutCheck({ canvas: document.getElementById('canvas'), grid: true }));
    res.push(`${w}: ${r.ok ? 'سليم' : r.problems.join('، ')} (أدنى فراغ ${Math.round(r.minGap)})`);
  }
  await page.setViewportSize({ width: 1920, height: 1080 }); await wait(250);
  console.log(`${name}\n   ` + res.join('\n   '));
}

(async () => {
  const browser = await chromium.launch();
  for (const team of [1, 2]) {
    const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
    await H.usePin(ctx);
    const st = await ctx.newPage();
    await st.goto(base); await st.evaluate(() => localStorage.clear()); await st.reload();
    await H.unlock(st);
    let f = await H.stageFrame(st);
    await H.sharedToFace(f, { names: LONG, picks: ['auction', 'letter'] });
    await wait(2700);
    await H.cmd(f, 'begin'); await f.waitForSelector('.scr.show[data-s="intro"]', { timeout: 6000 });
    await H.cmd(f, 'act:show'); await wait(1500);
    await H.hideQr(f); await wait(500);
    for (let n = 1; n <= COMMIT; n++) { await H.cmd(f, 'raise:' + team); await wait(100); }
    await H.cmd(f, 'act:start'); await wait(1200);
    for (let n = 0; n < 5; n++) { await H.cmd(f, 'act:count'); await wait(150); }
    // الموضوع والرصيد في الحالة المحفوظة، ثم تُعاد الصفحة. والوقت كما يقع في اللعب: 45 ثانية تبدأ الآن (لا وقت مطوّل)،
    // و timer: 'over' يجعله منقضياً.
    const load = async (id, timer) => {
      await st.evaluate(([t, sc, timer]) => { const m = JSON.parse(localStorage.getItem('big-challenge.match')); const s = m.round.state;
        s.topics[0] = { ...s.topics[0], id: t.id, topic: t.topic, items: t.items.map(x => ({ name: x.name, alts: x.alts ?? [] })) };
        m.scores = m.round.scores = { 1: sc[0], 2: sc[1] };
        if (timer === 'over') { m.round.timer.seconds = 45; m.timerAt = Date.now() - 60000; } else if (m.round.timer) { m.round.timer.seconds = 45; m.timerAt = Date.now(); }
        localStorage.setItem('big-challenge.match', JSON.stringify(m)); }, [topic(id) ?? shortest, SC, timer]);
      await st.reload(); await H.unlock(st).catch(() => {});
      f = await H.stageFrame(st); await wait(1500);
      await f.addScriptTag({ path: R + '/design/check.js' });
    };
    const tag = `-t${team}`;
    await load('general-auction-089');
    await shot(st, f, `1-السرد${tag}`);
    await load('general-auction-089', 'over'); await wait(1000);
    await shot(st, f, `1ب-انقضى-الوقت${tag}`);
    await H.cmd(f, 'act:reveal'); await wait(1000);
    if (team === 1) {
      await shot(st, f, `2-الكشف-193-ص1${tag}`);
      const pages = await f.$$eval('#cxDots i', e => e.length);
      await f.click(`#cxDots i[data-page="${pages - 1}"]`);
      await shot(st, f, `3-الكشف-193-الأخيرة${tag}`);
      await H.cmd(f, 'act:ok'); await wait(1200);
      await shot(st, f, `5-وفى${tag}`);
      await H.cmd(f, 'undo'); await wait(1200);
      await H.cmd(f, 'act:fail'); await wait(1600);
      await shot(st, f, `6-لم-يف${tag}`);
    } else {
      await H.cmd(f, 'undo'); await wait(1000);
      await load('general-auction-072');
      await H.cmd(f, 'act:reveal'); await wait(1000);
      await f.click('#cxList');
      await shot(st, f, `2-الكشف-114-ص2${tag}`);
      await H.cmd(f, 'undo'); await wait(1000);
      await load(shortest.id);
      await H.cmd(f, 'act:reveal'); await wait(1000);
      await shot(st, f, `4-الكشف-أقصر-قائمة${tag}`);
      await H.cmd(f, 'act:ok'); await wait(1200);
      await shot(st, f, `5-وفى${tag}`);
    }
    await ctx.close();
  }
  await browser.close();
})();
