// اختبار آلي لمرحلة «الدوران» في شريط البونص (5.7، design/wheel.md) في رابط المعاينة:
// بعد الجولة الأولى «شريط البونص»، فتظهر الخانات العشر ومن يديرها، و«أطلق الشريط» يدير المؤشر خانةً خانة ويتباطأ حتى يقف
// على الخانة المحسومة، ثم تظهر الخانة بنصها في النافذتين. وإعادة تحميل الشاشة أثناء الدوران تكمله، والتراجع يعيد ما قبل الدوران،
// و«إنهاء الشريط» إلى نهايتها ثم الجولة الثانية. ولا نص لخانة على الجمهور قبل الوقوف، وفحص التداخل في كل حالة، ونافذة المقدّم بثلاثة مقاسات.
// ثم بأطول محتوى (أطول اسمين، وتحديات من 85 حرفاً)، ثم بالنافذة الواحدة، ثم الرابط العادي (تُتخطى العجلة)، ثم تقليل الحركة.
// الاستعمال: node tests/stage6-wheel-spin.cjs [الرابط] [مجلد الصور]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, sharedToFace, beginTwo, cmd } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { check, finish } = reporter();
  const errors = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const data = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'content/wheel.json'), 'utf8'));
  const W = await import(path.join(__dirname, '..', 'js/wheel.js'));
  // أطول تحدٍّ: 85 حرفاً (حد السؤال، design/wheel.md 3).
  const LONG_TEXT = 'يمثّل أحدكم فيلماً كرتونياً مشهوراً بلا كلام، ويخمّن فريقه اسمه قبل انتهاء الوقت كلهـ';
  const longData = { ...data, challenges: data.challenges.map(c => ({ ...c, text: LONG_TEXT })) };
  const texts = d => [...d.challenges.map(c => c.text), ...d.luck.map(l => l.label)];

  async function open({ preview = true, long = false, motion = 'no-preference' } = {}) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block', reducedMotion: motion });
    await usePin(context);
    if (long) await context.route('**/content/wheel.json', route => route.fulfill({ json: longData }));
    context.on('page', p => {
      p.on('pageerror', e => errors.push(e.message));
      p.on('console', m => m.type() === 'error' && !/content\/packs\/.+\.json/.test(m.location().url) && errors.push(m.text()));
    });
    const stage = await context.newPage();
    await stage.setViewportSize({ width: 1920, height: 1080 });
    await stage.goto(base + (preview ? '?preview' : ''));
    await stage.evaluate(() => localStorage.clear());
    await stage.reload();
    await unlock(stage);
    return { context, stage, audience: await stageFrame(stage) };
  }
  const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')));
  const clean = t => t.replace(/\s+/g, ' ').trim();
  const text = (page, sel) => page.textContent(sel).then(clean);
  // الخانة المضاءة الآن على الجمهور: رقمها ولونها، ووقوفها.
  const lit = audience => audience.evaluate(() => [...document.querySelectorAll('#band .ws')].map((c, i) => ({ i, t: c.classList.contains('t1') ? 1 : c.classList.contains('t2') ? 2 : 0, stop: c.classList.contains('stop') })).filter(x => x.t));

  let layoutOk = true, presenterOk = true, leak = false;
  const fails = [];
  const audienceCheck = async (audience, label, d) => {
    const r = await audience.evaluate(() => window.__stageCheck());
    if (!r.ok) { layoutOk = false; fails.push(`${label}: ${r.problems.join('، ')}`); }
    const s = (await audience.evaluate(() => document.querySelector('.scr.show')?.dataset.s));
    const body = await audience.evaluate(() => document.querySelector('.canvas').innerText);
    const shown = s === 'q' ? await text(audience, '#label') : '';
    if (texts(d).some(t => body.includes(t) && t !== shown)) { leak = true; fails.push(`${label}: نص خانة لم تقف عليها العجلة`); }
    if (/سرقة|سهل|متوسط|صعب|بفارق|الأقل نقاطاً|خسر القرعة/.test(body)) { leak = true; fails.push(`${label}: نص ممنوع على الجمهور`); }
    const over = await audience.evaluate(() => [...document.querySelectorAll('.scr.whl.show .whead, .scr.whl.show .ws > *')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
    if (over.length) { layoutOk = false; fails.push(`${label}: يفيض (${over.join('، ')})`); }
  };
  const presenterCheck = async (presenter, label) => {
    for (const [w, h] of [[1920, 1080], [1366, 768], [1280, 800]]) {
      await presenter.setViewportSize({ width: w, height: h });
      await wait(150);
      const r = await presenter.evaluate(() => {
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize), problems = [];
        const vis = n => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden';
        for (const n of document.getElementById('app').querySelectorAll('*')) {
          if (!vis(n)) continue;
          if ([...n.childNodes].some(c => c.nodeType === 3 && c.textContent.trim())) {
            if (parseFloat(getComputedStyle(n).fontSize) < rem - .01) problems.push(`نص أصغر من 32: «${n.textContent.trim().slice(0, 16)}»`);
            if (/[٠-٩۰-۹]/.test(n.textContent)) problems.push('أرقام هندية');
          }
          if (n.tagName === 'BUTTON' && n.getBoundingClientRect().height < 2 * rem - .5) problems.push(`زر أقصر من 64: «${n.textContent.trim()}»`);
          // نص الخانة في القائمة يُختصر بـ «…» عمداً (design/wheel.md 5)
          if (n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflow !== 'visible' && getComputedStyle(n).textOverflow !== 'ellipsis') problems.push(`يفيض: «${n.textContent.trim().slice(0, 16)}»`);
        }
        const d = document.documentElement;
        if (d.scrollWidth > d.clientWidth + 1) problems.push('تمرير أفقي');
        if (d.scrollHeight > d.clientHeight + 1) problems.push('تمرير رأسي');
        return problems;
      });
      if (r.length) { presenterOk = false; fails.push(`المقدّم ${label} ${w}: ${[...new Set(r)].join('، ')}`); }
    }
    await presenter.setViewportSize({ width: 1280, height: 800 });
  };

  // ===== 1. بنافذتين (والأطول بعدها) =====
  for (const LONG of [false, true]) {
    const tag = LONG ? 'الأطول · ' : '';
    const d = LONG ? longData : data;
    const NAMES = LONG ? ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'] : ['الصقور', 'النجوم'];
    const { context, stage, audience } = await open({ long: LONG });
    await sharedToFace(audience, { names: NAMES, count: 'short', picks: ['ranking', 'letter'] });
    const presenter = await beginTwo(context, audience);
    const click = async sel => { await presenter.click(sel); await wait(800); };
    // جولة الترتيب بلا إجابات: القائمتان تنتهيان، فالرصيد 0 و0 (تعادل).
    await click('#showQ');
    for (let k = 0; k < 2; k++) { await click('#rCtl [data-act="finish"]'); await click('#rCtl [data-act="next"]'); }
    check(`${tag}نهاية الجولة 1: زر المقدّم «شريط البونص»، و«التالي: شريط البونص» على الشاشة`, await text(presenter, '#endNext') === 'شريط البونص' && await text(audience, '#next') === 'التالي: شريط البونص');
    await click('#endNext');
    const m = await saved(stage), spinner = m.winner === 1 ? 2 : 1;
    await audience.waitForSelector('.scr.whl.show');
    check(`${tag}العجلة: «يُطلق الشريط: [الخاسر في القرعة]» عند التعادل، والخانات العشر بكلمتها ورقمها`,
      await text(audience, '#whead') === 'يُطلق الشريط: ' + NAMES[spinner - 1]
      && (await audience.$$eval('#band .ws', e => e.map(x => x.textContent.replace(/\s+/g, '')).join(','))) === 'تحدٍّ+5,خسارة−3,تحدٍّ+5,تحدٍّ+5,هدية+3,تحدٍّ+5,تحدٍّ+5,خصم3,تحدٍّ+5,تحدٍّ+5');
    check(`${tag}خانات الحظ بإطار متقطع (3)، ولا خانة مضاءة قبل الدوران`, (await audience.$$('#band .ws.luck')).length === 3 && (await lit(audience)).length === 0);
    check(`${tag}الشارتان «شريط البونص» و«الدورة 1 من 2»، والحدّ لمن يديرها، ولا مربع إعلان`, await text(audience, '#mode') === 'شريط البونص' && await text(audience, '#b1') === 'الدورة 1 من 2'
      && await audience.evaluate(t => document.getElementById('canvas').classList.contains('turn-' + t), spinner) && await audience.evaluate(() => document.getElementById('box').hidden));
    await audienceCheck(audience, `${tag}قبل الدوران`, d);
    check(`${tag}المقدّم: «شريط البونص · الدورة 1 من 2»، والخانات العشر بنصوصها (الحظ بإطار متقطع)`,
      await text(presenter, '#roundChip') === 'شريط البونص · الدورة 1 من 2' && (await presenter.$$('#wMid .slots p')).length === 10
      && (await presenter.$$('#wMid .slots p.luck')).length === 3 && (await text(presenter, '#wMid .slots p:nth-child(2) > span')) === d.luck.find(l => l.effect === 'lose-3').label);
    check(`${tag}المقدّم: «دور» من يديرها، و«خسر القرعة يبدأ»، و«أطلق الشريط»`,
      await text(presenter, '#wWho') === 'دور ' + NAMES[spinner - 1] && await text(presenter, '#wState') === 'خسر القرعة يبدأ' && await text(presenter, '#wCtl') === 'أطلق الشريط');
    if (!LONG) await stage.screenshot({ path: path.join(shots, 'wheel-ready.png') });
    await presenterCheck(presenter, `${tag}قبل الدوران`);

    // الدوران.
    await presenter.click('#wCtl [data-act="spin"]');
    const t0 = Date.now();
    await wait(400);
    const st = (await saved(stage)).round.state, stop = st.landed;
    check(`${tag}أثناء الدوران: «يجري المؤشر»، والزر معطّل`, await text(presenter, '#wState') === 'يجري المؤشر' && await presenter.$eval('#wCtl button', b => b.disabled));
    const a1 = await lit(audience); await wait(500); const a2 = await lit(audience);
    check(`${tag}المؤشر خانة واحدة بلون من يديرها، ويتنقل`, a1.length === 1 && a2.length === 1 && a1[0].t === spinner && a1[0].i !== a2[0].i && !a1[0].stop);
    if (!LONG) {
      await stage.screenshot({ path: path.join(shots, 'wheel-spin.png') });
      // إعادة تحميل الشاشة أثناء الدوران: يكمل من حيث بلغ، لا من أوله.
      await stage.reload();
      const again = await stageFrame(stage);
      await again.waitForSelector('.scr.whl.show');
      await wait(300);
      const l = await lit(again);
      check('إعادة تحميل الشاشة أثناء الدوران: يكمل الدوران (مؤشر واحد، لا وقوف بعد)', l.length === 1 && !l[0].stop);
    }
    const aud = await stageFrame(stage);
    const steps = W.spinSteps(stop), total = steps.reduce((x, y) => x + y, 0);
    await wait(Math.max(0, t0 + total + 250 - Date.now()));
    const l = await lit(aud);
    check(`${tag}يقف على الخانة المحسومة (${stop + 1})، و.stop عليها`, l.length === 1 && l[0].i === stop && l[0].stop);
    if (!LONG) await stage.screenshot({ path: path.join(shots, 'wheel-land.png') });
    await aud.waitForSelector('.scr.q.show #letter.slot', { timeout: 4000 });
    const shownAt = Date.now() - t0;
    const want = W.face((await saved(stage)).round.state.slots[stop]);
    const wantText = (await saved(stage)).round.state.slots[stop].text;
    check(`${tag}بعد 1.2 ثانية من الوقوف: الخانة في مربعها بلون من أدارها، ونصها بمقاس السؤال (${shownAt}ms)`,
      shownAt >= total + 900 && await aud.evaluate(t => document.getElementById('letter').classList.contains('t' + t), spinner)
      && (await aud.textContent('#letter')).replace(/\s/g, '') === want.word + want.n);
    check(`${tag}نص الخانة كاملاً، ثلاثة أسطر حداً أقصى`, await text(aud, '#label') === wantText
      && await aud.evaluate(() => { const el = document.getElementById('label'); return Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)) <= 3; }));
    await audienceCheck(aud, `${tag}بعد الوقوف`, d);
    if (!LONG) await stage.screenshot({ path: path.join(shots, 'wheel-slot.png') });
    else await stage.screenshot({ path: path.join(shots, 'wheel-slot-long.png') });
    const kind = (await saved(stage)).round.state.slots[stop].kind;
    check(`${tag}المقدّم: الخانة في مربعها، ونصها كاملاً، وسطر القاعدة، و«ابدأ التحدي · دقيقتان» (أو «التالي · دور [الآخر]» لخانة حظ)`, (await presenter.$('#wMid.got .slotbox.t' + spinner)) && await text(presenter, '#wMid .text') === wantText
      && (await text(presenter, '#wMid .rule')).startsWith(kind === 'luck' ? 'خانة حظ' : 'دقيقتان حداً أقصى') && (kind === 'luck' ? (await text(presenter, '#wCtl')).startsWith('التالي · دور ') : await text(presenter, '#wCtl') === 'ابدأ التحدي · دقيقتان'));
    await presenterCheck(presenter, `${tag}بعد الوقوف`);

    if (!LONG) {
      // التراجع: يعود إلى ما قبل الدوران، وإعادته تقف على الخانة نفسها.
      await presenter.click('#wUndo'); await wait(900);
      check('التراجع: قبل الدوران في النافذتين، ولا خانة مضاءة', (await saved(stage)).round.state.phase === 'ready' && await aud.evaluate(() => !!document.querySelector('.scr.whl.show'))
        && (await lit(aud)).length === 0 && await text(presenter, '#wCtl') === 'أطلق الشريط');
      await presenter.click('#wCtl [data-act="spin"]');
      await aud.waitForSelector('.scr.q.show #letter.slot', { timeout: 9000 });
      check('وإعادة الدوران تقف على الخانة نفسها', (await saved(stage)).round.state.landed === stop);
    }

    // نهاية العجلة (والتحدي يُحكم فيه أولاً، اختباره stage6-wheel-challenge)، ثم الجولة الثانية.
    if (kind === 'challenge') { await click('#wCtl [data-act="start"]'); await click('#wCtl [data-act="failed"]'); }
    // والدورة الثانية (اختبارها stage6-wheel-turns).
    await click('#wCtl [data-act="next"]');
    await aud.waitForSelector('.scr.whl.show');
    await click('#wCtl [data-act="spin"]');
    await aud.waitForSelector('.scr.q.show #letter.slot', { timeout: 9000 });
    await wait(1200);
    { const s2 = (await saved(stage)).round.state; if (s2.slots[s2.landed].kind === 'challenge') { await click('#wCtl [data-act="start"]'); await click('#wCtl [data-act="failed"]'); } }
    await click('#wCtl [data-act="finish"]');
    check(`${tag}«إنهاء الشريط»: نهايتها، «انتهى الشريط»، و«التالي: الجولة 2 · الحرف المعيّن»`, await aud.evaluate(() => !!document.querySelector('.scr.end.show'))
      && await text(aud, '#b1') === 'انتهى الشريط' && await text(aud, '#next') === 'التالي: الجولة 2 · الحرف المعيّن');
    check(`${tag}المقدّم: «انتهى شريط البونص» و«ابدأ الجولة 2»`, await text(presenter, '#endHead') === 'انتهى شريط البونص' && await text(presenter, '#endNext') === 'ابدأ الجولة 2');
    await audienceCheck(aud, `${tag}نهاية العجلة`, d);
    await click('#endNext');
    const after = await saved(stage);
    check(`${tag}ثم الجولة 2 من 2 (الحرف المعيّن)، والعجلة لم تُعدّ جولة`, after.round.mode === 'letter' && after.round.n === 2 && after.played === 2
      && await text(aud, '#b1') === 'الجولة 2 من 2');
    await context.close();
  }

  // ===== 2. بنافذة واحدة: الأزرار في صف الشارات (design/wheel.md 4) =====
  {
    const { context, stage, audience } = await open();
    await sharedToFace(audience, { names: ['الصقور', 'النجوم'], count: 'short', picks: ['ranking', 'letter'] });
    await cmd(audience, 'single');
    await wait(600);
    const go = async c => { await cmd(audience, c); await wait(800); };
    await go('act:show');
    for (let k = 0; k < 2; k++) { await go('act:start:one'); await go('act:finish'); await go('act:commit'); await go('act:next'); }
    check('نافذة واحدة: نهاية الجولة 1 وفي البطاقة «شريط البونص»', await text(audience, '.scr.end.show .ctl') === 'شريط البونص');
    await go('next');
    const near = () => audience.$$eval('#near button', b => b.map(x => x.textContent.trim()).join('|'));
    check('قبل الدوران: «أطلق الشريط» بجانب الشارات، والزوايا الثلاث', await near() === 'أطلق الشريط' && (await audience.$$('#cornerA button, #cornerB button, #cornerC button')).length === 6);
    await audienceCheck(audience, 'نافذة واحدة · قبل الدوران', data);
    await stage.screenshot({ path: path.join(shots, 'wheel-ready-w1.png') });
    await go('act:spin');
    check('أثناء الدوران: لا زر بجانب الشارات', await near() === '');
    await audience.waitForSelector('.scr.q.show #letter.slot', { timeout: 9000 });
    await wait(800);
    const kind1 = (await saved(stage)).round.state.slots[(await saved(stage)).round.state.landed].kind;
    check('بعد الوقوف: «ابدأ · دقيقتان» (أو «التالي · الدورة 2» لخانة حظ)', await near() === (kind1 === 'luck' ? 'التالي · الدورة 2' : 'ابدأ · دقيقتان'));
    await audienceCheck(audience, 'نافذة واحدة · بعد الوقوف', data);
    await stage.screenshot({ path: path.join(shots, 'wheel-slot-w1.png') });
    await go('undo');
    check('«تراجع» في الزاوية: قبل الدوران', (await saved(stage)).round.state.phase === 'ready' && await near() === 'أطلق الشريط');
    await go('act:spin');
    await audience.waitForSelector('.scr.q.show #letter.slot', { timeout: 9000 });
    await wait(800);
    if (kind1 === 'challenge') { await go('act:start'); await go('act:failed'); }
    await go('act:next');
    await go('act:spin');
    await audience.waitForSelector('.scr.q.show #letter.slot', { timeout: 9000 });
    await wait(1200);
    { const s2 = (await saved(stage)).round.state; if (s2.slots[s2.landed].kind === 'challenge') { await go('act:start'); await go('act:failed'); } }
    await go('act:finish');
    check('«إنهاء الشريط»: في البطاقة «ابدأ الجولة 2»', await text(audience, '.scr.end.show .ctl') === 'ابدأ الجولة 2');
    await audienceCheck(audience, 'نافذة واحدة · نهاية العجلة', data);
    await context.close();
  }

  // ===== 3. الرابط العادي: العجلة تُتخطى حتى تكتمل شريحتها =====
  {
    const { context, audience } = await open({ preview: false });
    await sharedToFace(audience, { names: ['الصقور', 'النجوم'], count: 'short', picks: ['ranking', 'letter'] });
    const presenter = await beginTwo(context, audience);
    const click = async sel => { await presenter.click(sel); await wait(800); };
    await click('#showQ');
    for (let k = 0; k < 2; k++) { await click('#rCtl [data-act="finish"]'); await click('#rCtl [data-act="next"]'); }
    check('الرابط العادي: «تخطَّ شريط البونص» كما كان', await text(presenter, '#endNext') === 'تخطَّ شريط البونص');
    await context.close();
  }

  // ===== 4. تقليل الحركة: المؤشر على خانة الوقوف مباشرة =====
  {
    const { context, stage, audience } = await open({ motion: 'reduce' });
    await sharedToFace(audience, { names: ['الصقور', 'النجوم'], count: 'short', picks: ['ranking', 'letter'] });
    await cmd(audience, 'single');
    await wait(600);
    const go = async c => { await cmd(audience, c); await wait(800); };
    await go('act:show');
    for (let k = 0; k < 2; k++) { await go('act:start:one'); await go('act:finish'); await go('act:commit'); await go('act:next'); }
    await go('next');
    await cmd(audience, 'act:spin');
    await wait(300);
    const stop = (await saved(stage)).round.state.landed, l = await lit(audience);
    check('تقليل الحركة: المؤشر على خانة الوقوف فوراً بلا دوران', l.length === 1 && l[0].i === stop);
    await audience.waitForSelector('.scr.q.show #letter.slot', { timeout: 9000 });
    await context.close();
  }

  check('فحص التداخل والشبكة وما يفيض في كل حالة', layoutOk);
  check('لا نص خانة قبل الوقوف، ولا كلمة ممنوعة على الجمهور', !leak);
  check('نافذة المقدّم بمقاساتها الثلاثة: لا تمرير، ولا نص أصغر من 32، ولا زر يفيض', presenterOk);
  check('لا أخطاء في الصفحات', errors.length === 0);
  await browser.close();
  process.exit(finish([...fails, ...errors]) ? 0 : 1);
})();
