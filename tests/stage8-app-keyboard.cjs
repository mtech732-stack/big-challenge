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
  // ===== ش8-أ/82 و83 (المعاين ومسؤول الرفع، v95، iPhone 16 Pro 874×402) =====
  // 82: لوحة المفاتيح تُنقص الصفحة، والإطار بحجمه (80) كان في وسط الصفحة المنقوصة، فيرتفع نصف لوحة المفاتيح وتخرج الخانة العليا
  // من أعلى الشاشة (−89)، وما يُكتب فيها لا يُرى، ولا العودة إليها من السفلى بسهم «أعلى». والآن يبقى الإطار مكانه.
  // 83: بين حدّ اللوحة المرفوعة ولوحة المفاتيح شريط داكن (26 بهامش 56)، وصار 14 بهامش 44 (شريط الاقتراحات).
  {
    const [W, HH, KB] = [874, 402, 147];
    const c3 = await browser.newContext({ viewport: { width: W, height: HH }, hasTouch: true });
    c3.on('page', p => { p.on('pageerror', e => errors.push(e.message)); });
    await usePin(c3);
    await c3.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; });
    const p3 = await c3.newPage();
    await p3.goto(base); await p3.evaluate(() => localStorage.clear()); await p3.reload();
    const g = await stageFrame(p3); await wait(1500);
    const at = () => p3.evaluate(() => {
      const fr = document.querySelector('#single iframe'), fb = fr.getBoundingClientRect(), w = fr.contentWindow, s = fb.height / w.innerHeight;
      const o = { page: innerHeight, edge: Math.round(fb.top + w.document.querySelector('.screen').getBoundingClientRect().bottom * s), active: w.document.activeElement?.id };
      for (const k of [1, 2]) { const el = w.document.getElementById('i' + k), r = el.getBoundingClientRect(); o[k] = { top: Math.round(fb.top + r.top * s), bottom: Math.round(fb.top + r.bottom * s), value: el.value }; }
      return o; });
    const seen = (o, k) => o[k].top >= 0 && o[k].bottom <= o.page;
    await g.tap('#i1'); await wait(100); await p3.setViewportSize({ width: W, height: KB }); await wait(1000);
    await p3.keyboard.type('Eagles'); await wait(300);
    let o = await at();
    check(`ش8-أ/82: الخانة العليا ظاهرة ولوحة المفاتيح مفتوحة (${o[1].top}–${o[1].bottom} من ${o.page})، وفيها ما كُتب (${o[1].value})`, o.active === 'i1' && seen(o, 1) && o[1].value === 'Eagles');
    await g.evaluate(() => document.activeElement.blur()); await p3.setViewportSize({ width: W, height: HH }); await wait(1500);
    await g.tap('#i2'); await wait(100); await p3.setViewportSize({ width: W, height: KB }); await wait(1000);
    await p3.keyboard.type('Stars'); await wait(300);
    o = await at();
    check(`ش8-أ/83: الخانة السفلى فوق لوحة المفاتيح (${o[2].bottom} من ${o.page})، والشريط تحت اللوحة ${o.page - o.edge} لا أكثر من 14`, o.active === 'i2' && seen(o, 2) && o.page - o.edge <= 14 && o[2].value === 'Stars');
    // سهم «أعلى» فوق لوحة المفاتيح ينقل التركيز إلى العليا وهي خارج الشاشة (السفلى مرفوعة): تنزل اللوحة فتظهر، وما يُكتب يُرى فيها.
    await g.evaluate(() => document.getElementById('i1').value = ''); await g.focus('#i1'); await wait(300);
    await p3.keyboard.type('Hawk'); await wait(300);
    o = await at();
    check(`ش8-أ/82: من السفلى إلى العليا بالسهم: العليا ظاهرة (${o[1].top}–${o[1].bottom})، وفيها الحروف الأربعة (${o[1].value})، والسفلى كما هي (${o[2].value})`, o.active === 'i1' && seen(o, 1) && o[1].value === 'Hawk' && o[2].value === 'Stars');
    await c3.close();
  }
  // ===== ش8-أ/84 (مسؤول الرفع، محاكي iPhone 16 Pro، v96): «التالي» من العليا إلى السفلى، ثم «تم» =====
  // في v96 كانت اللوحة تُرفع عند التركيز والسفلى حينها تحت لوحة المفاتيح، وiOS يكشف الخانة من موضعها لحظة التركيز فيزيح الشاشة
  // فوق الرفع: زرقاء فارغة 2–3 ثوانٍ. وChromium لا يزيح، فيُفحص ما يراه iOS: موضع الخانة لحظة وصول التركيز (قبل أي معالج له)،
  // ثم المسرح في كل إطار 3 ثوانٍ. وبعد «تم»: تنزل اللوحة في الإطار نفسه تقريباً، ولا يصغُر المسرح ولوحة المفاتيح تنغلق.
  {
    const [W, HH, KB] = [874, 402, 177];
    const c4 = await browser.newContext({ viewport: { width: W, height: HH }, hasTouch: true });
    c4.on('page', p => { p.on('pageerror', e => errors.push(e.message)); });
    await usePin(c4);
    await c4.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; });
    const p4 = await c4.newPage();
    await p4.goto(base); await p4.evaluate(() => localStorage.clear()); await p4.reload();
    const g = await stageFrame(p4); await wait(1500);
    // كل إطار: [الوقت، أعلى المسرح، أسفله، عرضه، أسفل السفلى، ارتفاع الصفحة، الرفع]، بإحداثيات الصفحة.
    await p4.evaluate(() => {
      const fr = () => document.querySelector('#single iframe');
      const pos = el => { const f = fr(), fb = f.getBoundingClientRect(), s = fb.height / f.contentWindow.innerHeight, r = el.getBoundingClientRect();
        return { top: fb.top + r.top * s, bottom: fb.top + r.bottom * s, width: r.width * s }; };
      window.__pos = pos;
      // ما يراه iOS لحظة وصول التركيز: مستمع التقاط على نافذة الإطار، قبل معالجات الخانة.
      fr().contentWindow.addEventListener('focus', e => { if (e.target.id === 'i2') window.__atFocus = { ...pos(e.target), page: innerHeight }; }, true);
      window.__run = ms => { window.__log = []; const t0 = performance.now(); const d = fr().contentWindow.document;
        const tick = () => { const c = pos(d.getElementById('canvas')), i = pos(d.getElementById('i2'));
          window.__log.push({ t: Math.round(performance.now() - t0), top: Math.round(c.top), bottom: Math.round(c.bottom), width: Math.round(c.width), i2: Math.round(i.bottom), page: innerHeight, tr: d.querySelector('.screen').style.transform, active: d.activeElement?.id });
          if (performance.now() - t0 < ms) requestAnimationFrame(tick); };
        tick(); };
    });
    const w0 = (await p4.evaluate(() => __pos(document.querySelector('#single iframe').contentWindow.document.getElementById('canvas')))).width;
    await g.tap('#i1'); await wait(100); await p4.setViewportSize({ width: W, height: KB }); await wait(1000);
    await p4.keyboard.type('Eagles');
    await p4.evaluate(() => __run(3000)); await p4.keyboard.press('Enter'); await wait(3200);
    const at = await p4.evaluate(() => window.__atFocus), log = await p4.evaluate(() => window.__log);
    check(`ش8-أ/84: «التالي»: السفلى ظاهرة فوق لوحة المفاتيح لحظة وصول التركيز، فلا يبقى لـ iOS ما يكشفه (${at ? Math.round(at.top) + '–' + Math.round(at.bottom) + ' من ' + at.page : 'لا تركيز'})`,
      !!at && at.top >= 0 && at.bottom <= at.page);
    const off = log.filter(x => x.bottom <= 0 || x.top >= x.page || (x.active === 'i2' && (x.i2 > x.page || x.i2 < 0)));
    check(`ش8-أ/84: «التالي»: المسرح والسفلى ظاهران في كل إطار 3 ثوانٍ (${log.length} إطاراً، ${off.length} بلا مسرح${off.length ? ': ' + JSON.stringify(off[0]) : ''})`, log.length > 30 && off.length === 0);
    const last = log[log.length - 1];
    check(`ش8-أ/84 و83: بعد «التالي» الشريط تحت اللوحة ${last.page - last.bottom} لا أكثر من 14`, last.page - last.bottom <= 14 && last.page - last.bottom >= 0);
    await p4.keyboard.type('Stars');
    // «تم»: يزول التركيز، ولوحة المفاتيح تنغلق بعد 0.3 ثانية.
    await p4.evaluate(() => __run(1500)); await p4.keyboard.press('Enter'); await wait(300); await p4.setViewportSize({ width: W, height: HH }); await wait(1400);
    const log2 = await p4.evaluate(() => window.__log);
    const lifted = log2.filter(x => x.tr && x.t > 20), small = log2.filter(x => x.width < w0 - 1);
    check(`ش8-أ/84 و80: بعد «تم» تنزل اللوحة فوراً (${lifted.length ? 'مرفوعة حتى ' + lifted[lifted.length - 1].t + 'ms' : 'نعم'})، ولا يصغُر المسرح ولوحة المفاتيح تنغلق (${small.length ? 'عرضه ' + small[0].width + ' من ' + Math.round(w0) + ' عند ' + small[0].t + 'ms' : 'كما هو'})`,
      lifted.length === 0 && small.length === 0 && Math.abs(log2[log2.length - 1].width - w0) < 1 && log2[log2.length - 1].top >= -1);
    await c4.close();
  }
  // ===== ش8-أ/88 (المدقّق، خطر): لوحة المفاتيح تنفتح على خطوات (visualViewport يضيق ثلاث مرات) =====
  // كان الرفع عند الخطوة الأولى فيبقى ناقصاً والخانة تحت لوحة المفاتيح. والآن يزيد مع الخطوات ما لم يُكتب حرف، ولا يتحرك بعد الحرف
  // الأول ولو تغيّر visualViewport (78).
  {
    const c5 = await browser.newContext({ viewport: { width: 956, height: H }, hasTouch: true });
    c5.on('page', p => { p.on('pageerror', e => errors.push(e.message)); });
    await usePin(c5);
    await c5.addInitScript(H => {
      window.Capacitor = { isNativePlatform: () => true };
      if (window !== window.top) return;
      const vv = new EventTarget();
      Object.assign(vv, { height: H, width: innerWidth, offsetTop: 0, offsetLeft: 0, scale: 1 });
      Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv });
      window.__kb = (h, top = 0) => { vv.height = h; vv.offsetTop = top; vv.dispatchEvent(new Event('resize')); };
    }, H);
    const p5 = await c5.newPage();
    await p5.goto(base); await p5.evaluate(() => localStorage.clear()); await p5.reload();
    const g = await stageFrame(p5); await wait(1500);
    const kb5 = h => p5.evaluate(h => window.__kb(h), h);
    const at5 = () => p5.evaluate(() => { const fr = document.querySelector('#single iframe'), fb = fr.getBoundingClientRect(), w = fr.contentWindow, s = fb.height / w.innerHeight;
      return { bottom: Math.round(fb.top + w.document.getElementById('i2').getBoundingClientRect().bottom * s), kb: visualViewport.height, tr: w.document.querySelector('.screen').style.transform }; });
    await g.tap('#i2'); await wait(100);
    for (const h of [360, 290, 220]) { await kb5(h); await wait(120); }
    await wait(300);
    const o = await at5();
    check(`ش8-أ/88: لوحة المفاتيح تنفتح على ثلاث خطوات (360 ← 290 ← 220): السفلى فوقها بعد الأخيرة (${o.bottom} من ${o.kb}، ${o.tr})`, o.bottom <= o.kb);
    const tr0 = o.tr;
    await p5.keyboard.type('S'); await kb5(176); await wait(150); await p5.keyboard.type('tars'); await kb5(150); await wait(200);
    const o2 = await at5();
    check(`ش8-أ/88: وبعد أول حرف لا تتحرك اللوحة ولو ضاق المتاح (${tr0} ← ${o2.tr})`, o2.tr === tr0);
    await c5.close();
  }
  // ===== ش8-أ/89 (مسؤول الرفع، محاكي iPhone 16 Pro، v99): سهما الشريط فوق لوحة المفاتيح، بلا كتابة =====
  // السهمان ينقلان التركيز من iOS نفسه (لا keydown)، ولوحة المفاتيح ظاهرة، وiOS يكشف الخانة بإزاحته فيتغيّر visualViewport لحظةً.
  // في v99 كان الرفع يزيد مع كل resize ما لم يُكتب حرف، فيزيد فوق الإزاحة وتخرج اللوحة من الشاشة، فتبقى زرقاء فارغة حتى Done.
  // هنا: «أسفل» ثم «أعلى» ثم «أسفل»، ومع كل انتقال يضيق المتاح لحظةً إلى 60 ثم يعود، ثم الكتابة. وفي كل إطار: الخانة المركّزة
  // ظاهرة كلها فوق لوحة المفاتيح، والمسرح ظاهر.
  {
    const c6 = await browser.newContext({ viewport: { width: 956, height: H }, hasTouch: true });
    c6.on('page', p => { p.on('pageerror', e => errors.push(e.message)); });
    await usePin(c6);
    await c6.addInitScript(H => {
      window.Capacitor = { isNativePlatform: () => true };
      if (window !== window.top) return;
      const vv = new EventTarget();
      Object.assign(vv, { height: H, width: innerWidth, offsetTop: 0, offsetLeft: 0, scale: 1 });
      Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv });
      window.__kb = (h, top = 0) => { vv.height = h; vv.offsetTop = top; vv.dispatchEvent(new Event('resize')); };
    }, H);
    const p6 = await c6.newPage();
    await p6.goto(base); await p6.evaluate(() => localStorage.clear()); await p6.reload();
    const g = await stageFrame(p6); await wait(1500);
    const kb6 = h => p6.evaluate(h => window.__kb(h), h);
    await p6.evaluate(() => {
      window.__run = ms => { window.__log = []; const t0 = performance.now(); const fr = document.querySelector('#single iframe'), w = fr.contentWindow, d = w.document;
        const tick = () => { const fb = fr.getBoundingClientRect(), s = fb.height / w.innerHeight, el = d.activeElement, c = d.getElementById('canvas').getBoundingClientRect();
          const r = el?.classList.contains('name-in') ? el.getBoundingClientRect() : null;
          window.__log.push({ t: Math.round(performance.now() - t0), id: el?.id, top: r ? Math.round(fb.top + r.top * s) : null, bottom: r ? Math.round(fb.top + r.bottom * s) : null,
            kb: visualViewport.height, stage: Math.round(fb.top + c.bottom * s) });
          if (performance.now() - t0 < ms) requestAnimationFrame(tick); };
        tick(); };
    });
    await g.tap('#i1'); await wait(100); await kb6(220); await wait(900);
    const bad = [];
    for (const to of ['i2', 'i1', 'i2']) {
      await p6.evaluate(() => __run(1500));
      await g.focus('#' + to); await wait(30); await kb6(60); await wait(60); await kb6(220); await wait(1500);
      const log = await p6.evaluate(() => window.__log);
      // بعد عودة المتاح (أول إطار والمتاح 220 بعد الانتقال): الخانة ظاهرة كلها فوقه، والمسرح ظاهر.
      const settled = log.filter((x, i) => x.id === to && x.kb === 220 && log.slice(0, i).some(y => y.kb === 60));
      const off = settled.filter(x => x.top < 0 || x.bottom > x.kb || x.stage <= 0);
      if (!settled.length || off.length) bad.push(`${to}: ${settled.length ? JSON.stringify(off[0]) : 'لا إطار'}`);
    }
    check(`ش8-أ/89: سهما الشريط «أسفل» ثم «أعلى» ثم «أسفل» بلا كتابة، والمتاح يضيق لحظةً مع كل انتقال: الخانة المركّزة ظاهرة كلها فوق لوحة المفاتيح في كل إطار بعده (${bad.join(' | ')})`, bad.length === 0);
    await p6.keyboard.type('Stars'); await wait(300);
    const v = await g.evaluate(() => ({ id: document.activeElement.id, v: document.activeElement.value }));
    check(`ش8-أ/89: ثم الكتابة في السفلى (${v.id}: ${v.v})`, v.id === 'i2' && v.v === 'Stars');
    await c6.close();
  }
  check(`الاسمان في المباراة (${teams[1]}، ${teams[2]})`, teams[1] === names[1] && teams[2] === names[2]);
  await browser.close();
  finish(errors);
})();
