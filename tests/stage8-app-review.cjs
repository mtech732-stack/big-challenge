// اختبار آلي لجولة المراجعة الأولى على شاشات التطبيق (design/app.md 5، 9 نوفمبر 2026). في التطبيق (جسر Capacitor محقون)
// على الآيفون 956×440، والموقع حيث يتغير (5.8 و5.9) أو حيث يجب ألا يتغير.
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  const { check, finish } = reporter();
  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function open(native, size) {
    const context = await browser.newContext({ viewport: size ?? (native ? { width: 956, height: 440 } : { width: 1920, height: 1080 }) });
    context.on('page', p => {
      p.on('pageerror', e => errors.push(e.message));
      p.on('console', m => m.type() === 'error' && !/pin\.json|Failed to load resource/.test(m.text()) && errors.push(m.text()));
    });
    await usePin(context);
    if (native) await context.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; });
    const page = await context.newPage();
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    await page.goto(base);
    await page.evaluate(() => localStorage.clear());
    await page.reload();
    if (!native) await unlock(page);
    return { context, page, dialogs, f: await stageFrame(page) };
  }
  const box = (f, sel) => f.$eval(sel, e => { const r = e.getBoundingClientRect(), c = document.getElementById('canvas').getBoundingClientRect(), k = c.width / 1920;
    return { l: Math.round((r.left - c.left) / k), t: Math.round((r.top - c.top) / k), w: Math.round(r.width / k), h: Math.round(r.height / k) }; });
  const step = page => page.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).step);
  const stageOk = async f => { let r = await f.evaluate(() => window.__stageCheck()); if (!r.ok) { await wait(800); r = await f.evaluate(() => window.__stageCheck()); } return r; };

  // ===== 5.8: «اختيار الأنماط» داخل إطاره، ووسطه 960 (الموقع والتطبيق) =====
  for (const native of [false, true]) {
    const tag = native ? 'التطبيق' : 'الموقع';
    const { context, page, f } = await open(native);
    // النص داخل إطاره بـ 48 من كل جانب (مدى النص نفسه، لا scrollWidth الذي يزيده ميل الإطار).
    const b = await box(f, '#startGo .cbtn'), text = await f.$eval('#startGo .cbtn', e => { const r = document.createRange(); r.selectNodeContents(e); const t = r.getBoundingClientRect(), o = e.getBoundingClientRect(); return [t.left - o.left, o.right - t.right].map(Math.round); });
    // 5.10 (2): حشوة 44 من 768، فوسطه وسط الشعار 960. ولوحة الفريق الثاني بعرض خانتها (126–724).
    const p2 = await box(f, '#p2');
    // والخانة 440 (design/app.md 6.4، وفي الموقع منذ 106)، فاللوحة تنتهي عند 614.
    const p2end = 614;
    check(`${tag} 5.8: «اختيار الأنماط» بنصه داخل إطاره بـ 44 من كل جانب، من 768 ووسطه 960، ولوحة الفريق الثاني تنتهي عند ${p2end} (${b.l}–${b.l + b.w} · ${text} · ${p2.l}–${p2.l + p2.w})`,
      b.l === 768 && Math.abs(b.l + b.w / 2 - 960) <= 2 && text.every(x => x >= 43) && p2.l === 126 && p2.l + p2.w === p2end);
    const sc = await stageOk(f);
    check(`${tag}: فحص التداخل والشبكة سليم في البداية (${sc.ok ? '' : sc.problems.join('، ')})`, sc.ok);
    if (!native) {
      const vp = await page.$eval('meta[name="viewport"]', m => m.content), us = await page.evaluate(() => getComputedStyle(document.body).userSelect);
      // منذ 106 (design/app.md 8.2): لا تحديد نص في الموقع أيضاً (5.1)، والتكبير ممكن فيه (وسم viewport للتطبيق وحده).
      check(`الموقع: viewport يسمح بالتكبير، ولا تحديد نص (${vp} · ${us})`, vp === 'width=device-width, initial-scale=1' && us === 'none');
    }
    // 5.9: «يختار نمط الجولة 1» بفاصل 24 عن الإطار.
    await f.fill('#i1', 'الصقور'); await f.fill('#i2', 'النجوم');
    await cmd(f, 'draw');
    await f.waitForSelector('[data-hero="pick"] #pickCtl [data-cmd="draw"]', { timeout: 8000 });
    await cmd(f, 'draw'); await wait(3200);
    const gap = await f.$eval('.turnp:not([hidden])', e => getComputedStyle(e).rowGap);
    check(`${tag} 5.9: فاصل «يختار نمط الجولة» عن إطار الاسم 24 (${gap})`, gap === '24px');
    if (native) await page.screenshot({ path: `${shots}/app-review-pick.png` });
    await context.close();
  }

  // ===== 5.1–5.3، 5.5–5.7، والجسيمات: التطبيق =====
  {
    const { context, page, dialogs, f } = await open(true);
    const css = await f.evaluate(() => { const h = getComputedStyle(document.documentElement), i = getComputedStyle(document.getElementById('i1')), d = document.createElement('div');
      document.body.append(d); const t = getComputedStyle(d).webkitTapHighlightColor; d.remove();
      return { sel: getComputedStyle(document.body).userSelect, input: i.userSelect, touch: h.touchAction, tap: t }; });
    check(`5.1–5.3: لا تحديد (والخانة يُكتب فيها)، ولا وميض، وtouch-action manipulation (${JSON.stringify(css)})`, css.sel === 'none' && css.input === 'text' && css.touch === 'manipulation' && css.tap === 'rgba(0, 0, 0, 0)');
    const vps = [await page.$eval('meta[name="viewport"]', m => m.content), await f.$eval('meta[name="viewport"]', m => m.content)];
    check(`5.3: viewport بلا تكبير في الصفحتين (${vps.join(' | ')})`, vps.every(v => v.endsWith('maximum-scale=1, user-scalable=no')));
    const attrs = await f.$$eval('#i1, #i2', els => els.map(e => ['autocorrect', 'autocapitalize', 'spellcheck', 'autocomplete', 'enterkeyhint'].map(a => e.getAttribute(a)).join(',')));
    check(`5.7: خانتا الاسمين بلا تصحيح، و«التالي» ثم «تم» (${attrs.join(' | ')})`, attrs[0] === 'off,off,false,off,next' && attrs[1] === 'off,off,false,off,done');
    await f.fill('#i1', 'الصقور'); await f.fill('#i2', 'النجوم');
    await f.focus('#i2'); await page.keyboard.press('Enter'); await wait(600);
    check('5.7: «تم» في الثانية تغلق لوحة المفاتيح ولا تبدأ شيئاً', (await f.evaluate(() => document.activeElement?.id ?? '')) !== 'i2' && (await step(page)) === 'setup');
    // الجسيمات على عرض الطبقة كله: الشاشة 956×440 أعرض من 16:9، فيمتد المسرح يميناً ويساراً.
    const xs = await f.$$eval('#particles span', ss => ss.map(s => parseFloat(s.style.left)));
    check(`الجسيمات على عرض الطبقة كله، لا 0–1920 (${Math.min(...xs)}…${Math.max(...xs)})`, xs.length === 22 && Math.min(...xs) < 0 && Math.max(...xs) > 1920);
    // 5.6: النقرة على أيقونة تنفّذ بلا اسم، والضغط المطوّل يُظهر الاسم ولا ينفّذ.
    await sharedToFace(f, { names: ['الصقور', 'النجوم'], picks: ['letter', 'last-two'] });
    await cmd(f, 'begin'); await f.waitForSelector('.scr.show[data-s="intro"]'); await wait(800);
    const muted = () => page.evaluate(() => localStorage.getItem('big-challenge.muted'));
    await f.click('[data-cmd="more"]'); await wait(400);
    const m0 = await muted();
    await f.hover('#moreMenu [data-cmd="mute"]'); await wait(300);
    const hoverTip = !!(await f.$('#ctlTip'));
    const mb = await (await f.$('#moreMenu [data-cmd="mute"]')).boundingBox();
    await page.mouse.move(mb.x + mb.width / 2, mb.y + mb.height / 2); await page.mouse.down(); await wait(700);
    const longTip = await f.$eval('#ctlTip', e => e.textContent).catch(() => '');
    await page.mouse.up(); await wait(400);
    const afterLong = { tip: !!(await f.$('#ctlTip')), muted: await muted() };
    check(`5.6: لا اسم بالمرور، والضغط المطوّل يُظهره (${longTip}) ويخفيه الرفع، ولا يُنفَّذ الأمر`, !hoverTip && !!longTip && !afterLong.tip && afterLong.muted === m0);
    if (!(await f.$('#moreMenu [data-cmd="mute"]'))) { await f.click('[data-cmd="more"]'); await wait(400); }
    await f.click('#moreMenu [data-cmd="mute"]'); await wait(500);
    check('والنقرة تنفّذ الأمر بلا اسم', (await muted()) !== m0 && !(await f.$('#ctlTip')));
    // 5.5: «مباراة جديدة» بلوحة من اللعبة، لا confirm.
    if (!(await f.$('#moreMenu [data-cmd="new"]'))) { await f.click('[data-cmd="more"]'); await wait(400); }
    await f.click('#moreMenu [data-cmd="new"]'); await wait(400);
    const ask = await box(f, '#askNew'), txt = await f.$eval('#askNew', e => e.innerText.replace(/\s+/g, ' ').trim());
    const st = await f.$eval('#askNew p', e => { const s = getComputedStyle(e); return `${s.fontSize}/${s.fontWeight}`; });
    // 5.10 (1): تأخذ مكان البطاقة نفسه (127، 410، 1666×352، وصفيحتها إلى 774)، فلا يظهر شيء من السؤال حولها.
    const cw = await box(f, '#cardWrap'), plate = await box(f, '#askNew .plate'), cplate = await box(f, '#cardWrap .plate');
    check(`5.5: لوحة التأكيد في مكان البطاقة نفسه وصفيحتها كصفيحتها (${JSON.stringify(ask)} · ${JSON.stringify(cw)})، وفيها السؤال 48/700 والزرّان، ولا نافذة متصفح (${txt})`,
      ask.l === 127 && ask.t === 410 && ask.w === 1666 && ask.h === 352 && JSON.stringify(ask) === JSON.stringify(cw) && JSON.stringify(plate) === JSON.stringify(cplate)
      && txt === 'تبدأ مباراة جديدة ويُمحى ما سبق مباراة جديدة إلغاء' && st === '48px/700' && dialogs.length === 0);
    const sc = await stageOk(f);
    check(`وفحص التداخل والشبكة سليم معها (${sc.ok ? '' : sc.problems.join('، ')})`, sc.ok);
    await page.screenshot({ path: `${shots}/app-review-ask.png` });
    await f.click('#askNew [data-ask="no"]'); await wait(400);
    check('«إلغاء» تغلقها والمباراة كما هي', (await f.$eval('#askNew', e => e.hidden)) && (await step(page)) === 'play');
    await f.click('[data-cmd="more"]').catch(() => {}); await wait(300);
    if (!(await f.$('#moreMenu [data-cmd="new"]'))) { await f.click('[data-cmd="more"]'); await wait(400); }
    await f.click('#moreMenu [data-cmd="new"]'); await wait(300);
    await page.mouse.click(10, 10); await wait(300);
    check('والنقر خارجها إلغاء', (await f.$eval('#askNew', e => e.hidden)) && (await step(page)) === 'play');
    if (!(await f.$('#moreMenu [data-cmd="new"]'))) { await f.click('[data-cmd="more"]'); await wait(400); }
    await f.click('#moreMenu [data-cmd="new"]'); await wait(300);
    await f.click('#askNew [data-ask="yes"]'); await wait(800);
    check('و«مباراة جديدة» فيها تبدأ مباراة جديدة بلا نافذة متصفح', (await step(page)) === 'setup' && dialogs.length === 0);
    await context.close();
  }
  {
    // الموقع منذ 106 (design/app.md 8.2): «مباراة جديدة» بلوحة اللعبة كالتطبيق، بلا confirm. و«إلغاء» يبقي المباراة.
    const { context, page, dialogs, f } = await open(false);
    await sharedToFace(f, { names: ['الصقور', 'النجوم'], picks: ['letter', 'last-two'] });
    await cmd(f, 'begin'); await f.waitForSelector('.scr.show[data-s="intro"]'); await wait(500);
    await cmd(f, 'new'); await wait(500);
    const shown = !(await f.$eval('#askNew', e => e.hidden));
    await f.click('#askNew [data-ask="no"]'); await wait(500);
    const kept = (await step(page)) !== 'setup' && await f.$eval('#askNew', e => e.hidden);
    await cmd(f, 'new'); await wait(300); await f.click('#askNew [data-ask="yes"]'); await wait(800);
    check(`الموقع: «مباراة جديدة» بلوحة اللعبة (${shown})، و«إلغاء» يبقيها (${kept})، و«مباراة جديدة» فيها تبدأها، بلا نافذة متصفح (${dialogs.length})`,
      shown && kept && (await step(page)) === 'setup' && dialogs.length === 0);
    await context.close();
  }
  for (const native of [true, false]) {
    // لوحة «⋯» بأربع أيقونات (مع «الباركود» في الترتيب): فواصل 16، فتنتهي قبل حدّ لوحة الفريق الأول (653).
    // وفي الموقع كذلك منذ 106، و«ملء الشاشة» في صف الزاوية لا في اللوحة، ويحكم معها فحص التداخل والشبكة.
    const { context, page, f } = await open(native);
    await sharedToFace(f, { names: ['الصقور', 'النجوم'], picks: ['ranking', 'letter'] });
    await wait(2700);
    await cmd(f, 'begin'); await f.waitForSelector('.scr.show[data-s="intro"]');
    await cmd(f, 'act:show'); await f.waitForSelector('.scr.show[data-s="rnk"]'); await wait(800);
    await cmd(f, 'qr:hide'); await wait(800);
    await f.click('[data-cmd="more"]'); await wait(400);
    const icons = await f.$$eval('#moreMenu .ctl:first-child .cbtn.ico', els => els.length), p = await box(f, '#moreMenu');
    const gap = await f.$eval('#moreMenu', e => getComputedStyle(e).columnGap);
    const sc = await stageOk(f);
    check(`${native ? 'التطبيق' : 'الموقع'}: لوحة «⋯» بأربع أيقونات (${icons} ثم «مباراة جديدة»): الفواصل 16 (${gap})، وتنتهي عند ${p.l + p.w} قبل 653، وفحص التداخل سليم (${sc.ok ? '' : sc.problems.join('، ')})`,
      icons === 3 && gap === '16px' && p.l + p.w < 653 && sc.ok);
    await page.screenshot({ path: `${shots}/${native ? 'app' : 'web'}-review-more4.png` });
    await context.close();
  }
  await browser.close();
  finish(errors);
})();
