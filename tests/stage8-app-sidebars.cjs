// اختبار آلي: في تطبيق آبل تأخذ الأشرطة الجانبية ألوان المسرح، ولا يظهر فيها إلا المسرح (design/app.md 3).
// وفي الموقع كذلك منذ ش8-أ/106 (design/app.md 8.2): نافذة المتصفح بأي نسبة. التطبيق يُعرف بجسر Capacitor، ويُحقن هنا بـ addInitScript.
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, sharedToFace, cmd } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  const { check, finish } = reporter();
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // فكّ اللقطة في صفحة منفصلة، وإرجاع أدكن نقطة في كل مستطيل (أكبر قناة فيها) وعدد النقاط شبه السوداء.
  const decoder = await (await browser.newContext()).newPage();
  async function darkest(png, boxes) {
    return decoder.evaluate(async ({ src, boxes }) => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const g = c.getContext('2d'); g.drawImage(img, 0, 0);
      return boxes.map(([x, y, w, h]) => {
        const d = g.getImageData(x, y, w, h).data; let min = 255, black = 0, same = 0, red = 0, blue = 0;
        for (let i = 0; i < d.length; i += 4) {
          const m = Math.max(d[i], d[i + 1], d[i + 2]); if (m < min) min = m;
          if (m < 60) black++;
          if (d[i] === 5 && d[i + 1] === 14 && d[i + 2] === 46) same++;
          if (d[i] > d[i + 2] + 40) red++; else if (d[i + 2] > d[i] + 40) blue++;
        }
        return { min, black, old: same, red, blue };
      });
    }, { src: 'data:image/png;base64,' + png.toString('base64'), boxes });
  }

  // device: الآيفون أعرض من 16:9 (أشرطة يميناً ويساراً)، والآيباد 4:3 (فوق وتحت).
  async function run(name, viewport, native) {
    const context = await browser.newContext({ viewport });
    context.on('page', p => {
      p.on('pageerror', e => errors.push(`${name}: ${e.message}`));
      p.on('console', m => m.type() === 'error' && !/pin\.json|Failed to load resource/.test(m.text()) && errors.push(`${name}: ${m.text()}`));
    });
    await usePin(context);
    if (native) await context.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; });
    const page = await context.newPage();
    await page.goto(base);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    if (!native) await unlock(page);
    const f = await stageFrame(page);
    const { width: vw, height: vh } = viewport;
    const k = Math.min(vw / 1920, vh / 1080);
    const cw = 1920 * k, ch = 1080 * k;
    // الأشرطة بالبكسل (مع هامش 2 عن حافة اللوحة).
    const bars = vw / vh > 16 / 9
      ? [[0, 0, Math.floor((vw - cw) / 2) - 2, vh], [Math.ceil((vw + cw) / 2) + 2, 0, Math.floor((vw - cw) / 2) - 2, vh]]
      : [[0, 0, vw, Math.floor((vh - ch) / 2) - 2], [0, Math.ceil((vh + ch) / 2) + 2, vw, Math.floor((vh - ch) / 2) - 2]];
    const shot = async step => {
      await wait(900);
      const png = await page.screenshot({ path: `${shots}/app-bars-${name}-${step}.png` });
      return darkest(png, bars);
    };
    const results = {};
    results.setup = await shot('setup');
    const layout = await f.evaluate(() => {
      const back = document.getElementById('backdrop'), c = document.getElementById('canvas');
      const e = document.getElementById('edge').getBoundingClientRect();
      return {
        back: !!back, kids: back ? [...back.children].map(x => x.id) : [],
        canvasClip: getComputedStyle(c).overflow, canvasW: c.getBoundingClientRect().width,
        edgeL: e.left, edgeR: e.right, iw: innerWidth, ih: innerHeight,
      };
    });
    await sharedToFace(f, { names: ['الصقور', 'النجوم'], picks: ['letter', 'last-two'] });
    results.face = await shot('face');
    // المواجهة: لوحتا الفريقين تدخلان من خارج اللوحة، فيُصوَّر أثناء الدخول أيضاً.
    await cmd(f, 'begin');
    await f.waitForSelector('.scr.show[data-s="intro"]');
    results.intro = await shot('intro');
    await cmd(f, 'act:show');
    await f.waitForSelector('.scr.show[data-s="q"]');
    await wait(5600);   // العدّاد يبدأ بعد 5 ث، فيكتسح الحدّ لصاحب الدور
    results.question = await shot('question');
    const turn = await f.evaluate(() => [document.getElementById('canvas').className, document.getElementById('backdrop')?.className ?? '']);
    await cmd(f, 'act:reveal');
    await wait(600);
    results.judge = await shot('judge');
    await context.close();
    return { results, layout, turn, k };
  }

  // ===== التطبيق، والموقع منذ 106 (design/app.md 8.2) =====
  // والشاشة الأعرض (21:9) تتحقق من أن الطرفين والحدّ يبلغان الحافة حيث لا يكفي عرضهما القديم 2400.
  // والموقع على متصفح الهاتف والآيباد ونافذة حاسوب أطول من 16:9.
  for (const [name, viewport, native] of [['app-iphone', { width: 956, height: 440 }, true], ['app-ipad', { width: 1180, height: 820 }, true], ['app-wide', { width: 1260, height: 540 }, true],
    ['web-iphone', { width: 956, height: 440 }, false], ['web-ipad', { width: 1180, height: 820 }, false], ['web-wide', { width: 1260, height: 540 }, false], ['web-laptop', { width: 1366, height: 900 }, false]]) {
    const { results, layout, turn } = await run(name, viewport, native);
    check(`${name}: نافذة الجمهور تغطي الشاشة كلها`,
      Math.abs(layout.iw - viewport.width / Math.min(viewport.width / 1920, viewport.height / 1080)) <= 1.5 &&
      Math.abs(layout.ih - viewport.height / Math.min(viewport.width / 1920, viewport.height / 1080)) <= 1.5);
    check(`${name}: المسرح وحده خلف اللوحة (الطرفان والحدّ والحزم والجسيمات)`, layout.back && layout.kids.join() === 'stagebg,particles');
    check(`${name}: اللوحة نفسها مقصوصة على 1920×1080`, layout.canvasClip === 'clip' && Math.abs(layout.canvasW - 1920) < 1);
    check(`${name}: الحدّ متصل من حافة الشاشة إلى حافتها`, layout.edgeL <= 0 && layout.edgeR >= layout.iw);
    check(`${name}: طبقة المسرح تأخذ دور اللوحة`, turn[1].includes('backdrop') && ['turn-1', 'turn-2'].some(t => turn[0].includes(t) === turn[1].includes(t) && turn[0].includes(t)));
    // الأشرطة الجانبية تقطعها الحدّ، ففي كل شريط لون الطرفين معاً (الأحمر فوق والأزرق تحت) في المنتصف.
    if (viewport.width / viewport.height > 16 / 9) {
      const r = results.setup;
      check(`${name}: في كل شريط جانبي الطرفان معاً (المسرح لا خلفية بديلة)`, r.every(b => b.red > 500 && b.blue > 500));
    }
    for (const [step, r] of Object.entries(results)) {
      check(`${name} · ${step}: لا شبه أسود في الأشرطة (أدكن قناة ${r.map(b => b.min).join('/')})`, r.every(b => b.black === 0 && b.old === 0));
    }
  }

  await browser.close();
  finish(errors);
})();
