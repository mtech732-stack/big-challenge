// اختبار آلي لـ ش8-أ/90 (المالك 11 نوفمبر 2026: «جد حلا جذريا يظمن عدم تكرار الامر»، الومضة الزرقاء على الآيفون).
// الحل: في التطبيق مع إضافة لوحة المفاتيح (@capacitor/keyboard) لا يتغيّر حجم الـ WebView (setResizeMode none)، ولا يزيح iOS
// الصفحة (setScroll)، والرفع يقرأ ارتفاع لوحة المفاتيح من keyboardWillShow. هنا الإضافة مزيّفة في النافذة العليا: الصفحة لا تصغر
// وvisualViewport لا يتغيّر (كما مع none)، والحدثان يُطلقان بارتفاع ثابت. وفي كل إطار من كل مسار: المسرح ظاهر (لا خلفية وحدها)،
// والخانة المركّزة فوق لوحة المفاتيح بعد وصول الحدث:
// · نقر على السفلى ثم الكتابة: يُرفع مرة ولا يتحرك في الكتابة (78).
// · «التالي» من العليا: السفلى فوق لوحة المفاتيح لحظة وصول التركيز (84).
// · سهما الشريط «أسفل» و«أعلى» بلا كتابة وبعد حرف (89).
// · «تم»: تنزل اللوحة مع keyboardWillHide، ولا يتغيّر حجم المسرح (80).
// وأن الصفحة طلبت من الإضافة resize none وإيقاف الإزاحة.
const { chromium } = require('playwright');
const { usePin, reporter, stageFrame } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  const { check, finish } = reporter();
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const [W, H, KB] = [956, 440, 220];
  const context = await browser.newContext({ viewport: { width: W, height: H }, hasTouch: true });
  context.on('page', p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && !/pin\.json|Failed to load resource/.test(m.text()) && errors.push(m.text())); });
  await usePin(context);
  await context.addInitScript(() => {
    if (window !== window.top) { window.Capacitor = { isNativePlatform: () => true }; return; }
    const ls = {}, calls = [];
    window.__kbCalls = calls;
    window.Capacitor = { isNativePlatform: () => true, Plugins: { Keyboard: {
      addListener: (n, cb) => { (ls[n] ??= []).push(cb); return { remove() {} }; },
      setResizeMode: o => { calls.push('resize:' + o.mode); return Promise.resolve(); },
      setScroll: o => { calls.push('scroll:' + o.isDisabled); return Promise.resolve(); },
      setAccessoryBarVisible: o => { calls.push('bar:' + o.isVisible); return Promise.resolve(); },
    } } };
    window.__kbShow = h => (ls.keyboardWillShow ?? []).forEach(cb => cb({ keyboardHeight: h }));
    window.__kbHide = () => (ls.keyboardWillHide ?? []).forEach(cb => cb());
  });
  const page = await context.newPage();
  await page.goto(base); await page.evaluate(() => localStorage.clear()); await page.reload();
  const f = await stageFrame(page); await wait(1500);
  check(`الصفحة طلبت من الإضافة: ${(await page.evaluate(() => window.__kbCalls)).join('، ')}`, (await page.evaluate(() => window.__kbCalls.join())) === 'resize:none,scroll:true,bar:true');
  const show = () => page.evaluate(h => __kbShow(h), KB), hide = () => page.evaluate(() => __kbHide());
  await page.evaluate(([KB]) => {
    window.__kbNow = 0;
    const s0 = window.__kbShow, h0 = window.__kbHide;
    window.__kbShow = h => { window.__kbNow = h; s0(h); }; window.__kbHide = () => { window.__kbNow = 0; h0(); };
    window.__run = ms => { window.__log = []; const t0 = performance.now(); const fr = document.querySelector('#single iframe'), w = fr.contentWindow, d = w.document;
      const tick = () => { const fb = fr.getBoundingClientRect(), s = fb.height / w.innerHeight, el = d.activeElement, c = d.getElementById('canvas').getBoundingClientRect();
        const r = el?.classList.contains('name-in') ? el.getBoundingClientRect() : null;
        window.__log.push({ t: Math.round(performance.now() - t0), id: el?.id ?? '', top: r ? Math.round(fb.top + r.top * s) : null, bottom: r ? Math.round(fb.top + r.bottom * s) : null,
          kb: innerHeight - window.__kbNow, ctop: Math.round(fb.top + c.top * s), cbottom: Math.round(fb.top + c.bottom * s), cw: Math.round(c.width * s), tr: d.querySelector('.screen').style.transform });
        if (performance.now() - t0 < ms) requestAnimationFrame(tick); };
      tick(); };
  }, [KB]);
  const w0 = await page.evaluate(() => { const fr = document.querySelector('#single iframe'), w = fr.contentWindow; return Math.round(w.document.getElementById('canvas').getBoundingClientRect().width * fr.getBoundingClientRect().height / w.innerHeight); });
  const judge = (log, tag, need = true) => {
    const blank = log.filter(x => x.cbottom <= 0 || x.ctop >= H);
    const hidden = need ? log.filter(x => x.id && x.top !== null && x.kb < H && (x.top < 0 || x.bottom > x.kb)) : [];
    check(`${tag}: المسرح ظاهر في كل إطار (${log.length} إطاراً، ${blank.length} بلا مسرح)، والخانة المركّزة فوق لوحة المفاتيح (${hidden.length ? JSON.stringify(hidden[0]) : 'نعم'})`, log.length > 20 && !blank.length && !hidden.length);
  };
  // نقر على السفلى، ثم الحدث، ثم الكتابة.
  await page.evaluate(() => __run(1500)); await f.tap('#i2'); await wait(50); await show(); await wait(200);
  for (const ch of 'Stars') { await page.keyboard.type(ch); await wait(80); }
  await wait(900);
  let log = await page.evaluate(() => window.__log);
  judge(log.filter(x => x.kb < H), 'نقر على السفلى ثم الكتابة');
  const moves = [...new Set(log.map(x => x.tr))];
  check(`ويُرفع مرة واحدة ولا يتحرك في الكتابة (${moves.join(' ← ')})`, moves.length === 2 && moves[0] === '' && /translateY/.test(moves[1]));
  // «تم».
  await page.evaluate(() => __run(1200)); await page.keyboard.press('Enter'); await hide(); await wait(1300);
  log = await page.evaluate(() => window.__log);
  const late = log.filter(x => x.tr && x.t > 40), small = log.filter(x => Math.abs(x.cw - w0) > 1);
  check(`«تم»: تنزل اللوحة فوراً (${late.length ? 'مرفوعة حتى ' + late[late.length - 1].t + 'ms' : 'نعم'})، ولا يتغيّر حجم المسرح (${small.length ? small[0].cw + ' من ' + w0 : 'كما هو'})، والمسرح ظاهر في كل إطار`, !late.length && !small.length && log.every(x => x.cbottom > 0));
  const layer = await f.evaluate(() => { const st = getComputedStyle(document.querySelector('.screen')); return { will: st.willChange, tr: document.querySelector('.screen').style.transition }; });
  check(`ش8-أ/91: اللوحة طبقة مرسومة كلها (${layer.will})، والنزول بعد «تم» حركة مع لوحة المفاتيح (${layer.tr})`, layer.will === 'transform' && /transform 0?\.25s/.test(layer.tr));
  // «التالي» من العليا.
  await f.tap('#i1'); await wait(50); await show(); await wait(300); await page.keyboard.type('Eagles');
  await page.evaluate(() => { const fr = document.querySelector('#single iframe'), w = fr.contentWindow, s = fr.getBoundingClientRect().height / w.innerHeight;
    w.addEventListener('focus', e => { if (e.target.id === 'i2') { const r = e.target.getBoundingClientRect(); window.__at = Math.round(fr.getBoundingClientRect().top + r.bottom * s); } }, true); });
  await page.evaluate(() => __run(1500)); await page.keyboard.press('Enter'); await wait(1500);
  const at = await page.evaluate(() => window.__at);
  judge(await page.evaluate(() => window.__log), '«التالي» من العليا');
  check(`«التالي»: السفلى فوق لوحة المفاتيح لحظة وصول التركيز (${at} من ${H - KB})`, at <= H - KB);
  // سهما الشريط: «أعلى» ثم «أسفل» ثم «أعلى»، بعد حرف وبلا حرف.
  for (const [to, type] of [['i1', false], ['i2', true], ['i1', false], ['i2', false]]) {
    await page.evaluate(() => __run(1000)); await f.focus('#' + to); await wait(1000);
    judge(await page.evaluate(() => window.__log), `السهم إلى ${to === 'i1' ? 'العليا' : 'السفلى'}${type ? '، ثم حرف' : ''}`);
    if (type) { await page.keyboard.type('x'); await wait(200); }
  }
  await page.screenshot({ path: `${shots}/app-capkb-i2.png` });
  await page.keyboard.press('Enter'); await hide(); await wait(500);
  check('وبعدها اللوحة في مكانها', await f.evaluate(() => !document.querySelector('.screen').style.transform));
  await browser.close();
  finish(errors);
})();
