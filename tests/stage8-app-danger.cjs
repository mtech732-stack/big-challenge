// اختبار آلي لـ ش8-أ/88 (المعاين، v98؛ design/app.md 6.6): في التطبيق ينبض أحمر آخر 3 ثوانٍ على حواف الشاشة الفعلية كلها،
// ومنها الأشرطة خارج المسرح، لا حول المسرح 16:9 وحده. والموقع كما هو (حول المسرح).
// عدّاد حقيقي (سؤال الحرف المعيّن) بساعة مزيّفة، ثم في آخر 3 ثوانٍ: الطبقة #dangerVp تغطي نافذة الصفحة كلها، وحركتها pulse
// بظلها الأحمر، والتي في المسرح مخفية. ثم يُوقف النبض على أوله (إطار 12) وتُقرأ ألوان الحواف الأربع في وسطها: حمراء،
// ومنها الشريطان خارج المسرح يميناً ويساراً. وتُحفظ صورة على مقاس الآيفون والآيباد.
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  const { check, finish } = reporter();
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const red = ([r, g, b]) => r > 150 && r > g * 1.6 && r > b * 1.6;

  for (const [tag, W, H, native] of [['الآيفون', 956, 440, true], ['الآيباد', 1180, 820, true], ['الموقع', 1366, 768, false]]) {
    const context = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: native, serviceWorkers: 'block' });
    context.on('page', p => {
      p.on('pageerror', e => errors.push(e.message));
      p.on('console', m => m.type() === 'error' && !/pin\.json|Failed to load resource/.test(m.text()) && errors.push(m.text()));
    });
    await usePin(context);
    if (native) await context.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; });
    const page = await context.newPage();
    await page.clock.install();
    await page.goto(base); await page.evaluate(() => localStorage.clear()); await page.reload();
    if (!native) await unlock(page);
    const f = await stageFrame(page);
    await sharedToFace(f, { names: ['الصقور', 'النجوم'], picks: ['letter', 'auction'] });
    await page.clock.runFor(2700);
    await cmd(f, 'begin'); await f.waitForSelector('.scr.show[data-s="intro"]');
    await cmd(f, 'act:show'); await page.clock.runFor(800);
    // إلى آخر 3 ثوانٍ من عدّاد السؤال (30 ث).
    let on = false;
    for (let i = 0; i < 40 && !on; i++) { await page.clock.runFor(1000); on = await f.evaluate(() => document.getElementById('canvas').classList.contains('meta-danger')); }
    const r = await page.evaluate(() => {
      const fr = document.querySelector('#single iframe'), fb = fr.getBoundingClientRect(), w = fr.contentWindow, d = w.document, s = fb.height / w.innerHeight;
      const vp = d.getElementById('dangerVp'), a = vp && w.getComputedStyle(vp).display !== 'none' ? vp.getAnimations()[0] : null;
      const box = vp ? vp.getBoundingClientRect() : null, inner = d.querySelector('#canvas .danger');
      return { vp: box ? [fb.left + box.left * s, fb.top + box.top * s, box.width * s, box.height * s].map(Math.round) : null,
        anim: a?.animationName ?? null, shadow: !!a && a.effect.getKeyframes().some(k => /230, 57, 70/.test(k.boxShadow ?? '')),
        inner: w.getComputedStyle(inner).display !== 'none' ? inner.getAnimations()[0]?.animationName ?? 'بلا حركة' : 'مخفية',
        stage: (() => { const c = d.getElementById('canvas').getBoundingClientRect(); return [fb.left + c.left * s, fb.left + c.right * s].map(Math.round); })(), page: [innerWidth, innerHeight] };
    });
    if (native) {
      check(`${tag}: في آخر 3 ثوانٍ (${on}) الطبقة على نافذة الصفحة كلها (${r.vp?.join(',')} من ${r.page.join('×')})، وحركتها ${r.anim} بظل أحمر (${r.shadow})، والتي في المسرح ${r.inner}`,
        on && !!r.vp && r.vp[0] <= 0 && r.vp[1] <= 0 && r.vp[0] + r.vp[2] >= W && r.vp[1] + r.vp[3] >= H && r.anim === 'pulse' && r.shadow && r.inner === 'مخفية');
      // يُوقف النبض على أوله (إطار 12 أحمر) وتُقرأ الحواف في وسطها، ومنها الشريطان خارج المسرح.
      await f.evaluate(() => { const a = document.getElementById('dangerVp')?.getAnimations()[0] ?? document.querySelector('#canvas .danger').getAnimations()[0]; if (a) { a.pause(); a.currentTime = 0; } });
      const png = await page.screenshot({ path: `${shots}/app-danger-${W}x${H}.png` });
      const px = await page.evaluate(async ([b64, pts]) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
        return pts.map(([x, y]) => [...g.getImageData(x, y, 1, 1).data.slice(0, 3)]);
      }, [png.toString('base64'), [[2, H / 2], [W - 3, H / 2], [W / 2, 2], [W / 2, H - 3]]]);
      // واليمنى واليسرى في الشريطين خارج المسرح على الآيفون (المسرح يبدأ بعد 87).
      check(`${tag}: الحواف الأربع حمراء على حافة الشاشة (${px.map(p => p.join('/')).join(' · ')})، واليمنى واليسرى ${r.stage[0] > 2 ? 'في الشريطين خارج المسرح' : 'على حافة المسرح'} (المسرح ${r.stage.join('–')})`, px.every(red));
    } else {
      await page.screenshot({ path: `${shots}/site-danger-${W}x${H}.png` });
      check(`${tag}: كما هو، النبض حول المسرح (${r.inner})، ولا طبقة على النافذة (${r.vp ? r.vp.join(',') : 'لا'}، ${r.anim ?? 'بلا حركة'})`, on && r.inner === 'pulse' && !r.anim);
    }
    await context.close();
  }
  await browser.close();
  finish(errors);
})();
