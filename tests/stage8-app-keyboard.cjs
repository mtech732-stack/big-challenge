// اختبار آلي لـ ش8-أ/78 (المالك على آيفون 15 Pro، v92): في شاشة البداية بالتطبيق، الخانة السفلى لاسم الفريق كانت تُغلق لوحة
// المفاتيح بعد أول حرف. السبب: رفع اللوحة فوق لوحة المفاتيح (design/app.md 5.7) كان يعيدها إلى مكانها ثم يرفعها مع كل تغيّر في
// visualViewport، وهو يتغيّر على iOS بعد أول حرف (شريط الاقتراحات)، فتقفز الخانة المركّزة تحت لوحة المفاتيح لحظةً.
// هنا visualViewport في النافذة العليا مزيّف يُتحكم فيه (لوحة المفاتيح تفتح، ثم يظهر شريط الاقتراحات بعد الحرف الأول ويختفي)،
// ويُكتب اسم كامل حرفاً حرفاً في الخانتين:
// · يبقى العنصر نفسه مركّزاً، ولا يُستبدل عنصر الإدخال.
// · لا تعود اللوحة إلى مكانها ولو لحظةً والتركيز في الخانة (كل كتابة لـ transform تُسجَّل)، والخانة فوق لوحة المفاتيح بعد كل حرف.
// · الاسم كاملاً في الخانة وفي المباراة. وبزوال التركيز تعود اللوحة.
const { chromium } = require('playwright');
const { usePin, reporter, stageFrame } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  const { check, finish } = reporter();
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const H = 440;

  const context = await browser.newContext({ viewport: { width: 956, height: H }, hasTouch: true });
  context.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => m.type() === 'error' && !/pin\.json|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  });
  await usePin(context);
  await context.addInitScript(H => {
    window.Capacitor = { isNativePlatform: () => true };
    if (window !== window.top) return;
    // visualViewport مزيّف في النافذة العليا: ارتفاعه ما تتركه لوحة المفاتيح.
    const vv = new EventTarget();
    Object.assign(vv, { height: H, width: innerWidth, offsetTop: 0, offsetLeft: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv });
    window.__kb = (h, top = 0) => { vv.height = h; vv.offsetTop = top; vv.dispatchEvent(new Event('resize')); vv.dispatchEvent(new Event('scroll')); };
  }, H);
  const page = await context.newPage();
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const f = await stageFrame(page);
  await wait(1500);
  await f.evaluate(() => {
    for (const k of [1, 2]) document.getElementById('i' + k).__orig = true;
    const screen = document.querySelector('.screen');
    window.__writes = [];
    // كل كتابة تُسجَّل ولو تلتها أخرى في المهمة نفسها: قيمة السجل بعد الكتابة هي القيمة القديمة في السجل الذي يليه.
    new MutationObserver(ms => {
      const focus = document.activeElement?.id ?? '';
      ms.forEach((m, i) => window.__writes.push({ t: i + 1 < ms.length ? ms[i + 1].oldValue ?? '' : screen.getAttribute('style') ?? '', focus }));
    }).observe(screen, { attributes: true, attributeOldValue: true, attributeFilter: ['style'] });
  });
  const kb = (h, top) => page.evaluate(([h, top]) => window.__kb(h, top), [h, top]);
  // موضع الخانة بإحداثيات النافذة العليا، وحدّ لوحة المفاتيح.
  const where = k => page.evaluate(k => {
    const fr = document.querySelector('#single iframe'), fb = fr.getBoundingClientRect(), w = fr.contentWindow, s = fb.height / w.innerHeight;
    const el = w.document.getElementById('i' + k), r = el.getBoundingClientRect();
    return { bottom: fb.top + r.bottom * s, kb: visualViewport.offsetTop + visualViewport.height, active: w.document.activeElement?.id, orig: !!el.__orig, value: el.value };
  }, k);

  const names = { 1: 'الصقور الذهبية', 2: 'النجوم الزرق' };
  // كيف تصل الخانة. «نقر» تفتح لوحة المفاتيح (visualViewport يضيق). «التالي» من الأولى إلى الثانية، و«نقر من السفلى» إلى الأولى،
  // ولوحة المفاتيح ظاهرة فلا يتغير visualViewport (ش8-أ/81): يُكتب أول حرف بعد 0.1 ثانية.
  const ways = [[1, 'نقر'], [2, 'نقر'], [2, 'التالي'], [1, 'نقر من السفلى']];
  for (const [k, how] of ways) {
    const tag = `الخانة ${k === 1 ? 'العليا' : 'السفلى'} (${how})`;
    if (how === 'نقر') { await f.evaluate(k => { document.getElementById('i' + k).value = ''; window.__writes = []; }, k); await f.tap('#i' + k); await wait(100); await kb(220); await wait(300); }
    else {
      const from = k === 2 ? 1 : 2;
      await f.tap('#i' + from); await wait(100); await kb(220); await wait(900);
      await f.evaluate(k => { document.getElementById('i' + k).value = ''; window.__writes = []; }, k);
      // والعليا خارج الشاشة والسفلى مرفوعة، فلا تُنقر: يُنقل إليها التركيز كما يفعل زر الخانة السابقة.
      if (how === 'التالي') await page.keyboard.press('Enter'); else await f.focus('#i' + k);
      await wait(100);
    }
    const before = (await f.evaluate(() => window.__writes)).length;
    const bad = [];
    let i = 0;
    for (const ch of names[k]) {
      await page.keyboard.type(ch); i++;
      // بعد الحرف الأول يظهر شريط الاقتراحات (يضيق المتاح 44)، وبعد الرابع يختفي، وبعد السابع يمرَّر المتاح قليلاً.
      if (i === 1) await kb(176); if (i === 4) await kb(220); if (i === 7) await kb(220, 12);
      await wait(120);
      const w = await where(k);
      if (w.active !== 'i' + k || !w.orig) bad.push(`${i}: التركيز ${w.active || 'لا شيء'}${w.orig ? '' : '، عنصر آخر'}`);
      else if (w.bottom > w.kb + 0.5) bad.push(`${i}: الخانة تحت لوحة المفاتيح (${Math.round(w.bottom)} > ${Math.round(w.kb)})`);
    }
    const w = await where(k), writes = await f.evaluate(() => window.__writes), typed = writes.slice(before);
    check(`${tag}: اسم كامل حرفاً حرفاً، والعنصر نفسه مركّز بعد كل حرف وفوق لوحة المفاتيح ولو ظهر شريط الاقتراحات (${bad.slice(0, 3).join(' | ')})`, bad.length === 0 && w.value === names[k]);
    // لا تتحرك اللوحة إلا مرة عند وصول الخانة (رفع السفلى، أو نزول العليا من السفلى)، قبل أول حرف، ولا شيء في الكتابة.
    const once = { 'نقر': k === 1 ? 0 : 1, 'التالي': 1, 'نقر من السفلى': 1 }[how];
    check(`${tag}: تتحرك اللوحة ${once ? 'مرة واحدة قبل أول حرف' : 'صفر مرة'} ولا تتحرك في الكتابة (${writes.length} كتابة، ${typed.length} في الكتابة: ${writes.map(x => x.t || 'لا شيء').join(' ، ')})`,
      writes.length === once && typed.length === 0 && (k === 1 ? writes.every(x => !/translateY/.test(x.t)) : /translateY/.test(writes[0].t)));
    await page.screenshot({ path: `${shots}/app-keyboard-${k}-${{ 'نقر': 'tap', 'التالي': 'next', 'نقر من السفلى': 'back' }[how]}.png` });
    await f.evaluate(k => document.getElementById('i' + k).blur(), k); await kb(H); await wait(200);
    check(`${tag}: وبزوال التركيز تعود اللوحة إلى مكانها`, await f.evaluate(() => !document.querySelector('.screen').style.transform));
  }
  const m = await page.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).teams);
  const teams = m;
  await context.close();

  // ===== ش8-أ/80 (محاكي iPhone 16 Pro، v94): لوحة المفاتيح تُنقص ارتفاع الصفحة نفسها (resize)، وكل حرف يرسم =====
  // كان المسرح يُحسب على الارتفاع المنقوص فيصغُر وينحشر أعلى الشاشة، ثم يبقى مصغّراً بعد إغلاقها. والآن يبقى كما هو ما دامت
  // خانة مركّزة، ويعود حجمه بزوال التركيز، سواء انغلقت لوحة المفاتيح بعده أو قبله.
  {
    const c2 = await browser.newContext({ viewport: { width: 956, height: H }, hasTouch: true });
    c2.on('page', p => { p.on('pageerror', e => errors.push(e.message)); });
    await usePin(c2);
    await c2.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; });
    const p2 = await c2.newPage();
    await p2.goto(base); await p2.evaluate(() => localStorage.clear()); await p2.reload();
    const g = await stageFrame(p2); await wait(1500);
    // موضع اللوحة 1920×1080 ومقاسها في الصفحة.
    const stage = () => p2.evaluate(() => { const fr = document.querySelector('#single iframe'), fb = fr.getBoundingClientRect(), w = fr.contentWindow,
      r = w.document.getElementById('canvas').getBoundingClientRect(), s = fb.height / w.innerHeight;
      return [fb.left + r.left * s, fb.top + r.top * s, r.width * s, r.height * s].map(Math.round).join(','); });
    const r0 = await stage();
    const runs = [[2, 'بعد الإغلاق'], [2, 'قبل الإغلاق'], [1, 'بعد الإغلاق']];
    for (const [k, when] of runs) {
      const tag = `ش8-أ/80، الخانة ${k === 1 ? 'العليا' : 'السفلى'} (تزول قبل انغلاق لوحة المفاتيح ${when === 'بعد الإغلاق' ? 'لا' : 'بل بعده'})`;
      await g.evaluate(k => { document.getElementById('i' + k).value = ''; }, k);
      await g.tap('#i' + k); await wait(100);
      await p2.setViewportSize({ width: 956, height: 220 }); await wait(300);   // لوحة المفاتيح تنقص الصفحة
      const during = [];
      for (const ch of 'Eagles') { await p2.keyboard.type(ch); await wait(150); during.push(await stage()); }
      if (when === 'بعد الإغلاق') { await g.evaluate(k => document.getElementById('i' + k).blur(), k); await wait(300); await p2.setViewportSize({ width: 956, height: H }); }
      else { await p2.setViewportSize({ width: 956, height: H }); await wait(300); await g.evaluate(k => document.getElementById('i' + k).blur(), k); }
      await wait(1500);
      // في الكتابة: المقاس والموضع الأفقي كما هما (الرفع يحرّك الموضع الرأسي وحده). وبعدها: كل شيء كما كان.
      const size = x => x.split(',').filter((_, i) => i !== 1).join(), after = await stage(), moved = during.filter(x => size(x) !== size(r0));
      check(`${tag}: المسرح بمقاسه في الكتابة (${moved.length ? moved[0] : size(r0)})، ويعود كما كان بعدها (${after})`, moved.length === 0 && after === r0);
    }
    await c2.close();
  }
  check(`الاسمان في المباراة (${teams[1]}، ${teams[2]})`, teams[1] === names[1] && teams[2] === names[2]);
  await browser.close();
  finish(errors);
})();
