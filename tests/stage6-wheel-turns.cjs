// اختبار آلي لمرحلة «الموضع ومن يديرها» في شريط البونص (5.7، design/wheel.md 2 و4 و5) في رابط المعاينة:
// وحدةً (دون متصفح): بعد الدورة الأولى «التالي · الدورة 2» للفريق الآخر بخانة وقوفها المحسومة، ويجوز تكرار التحدي نفسه،
// ثم «إنهاء الشريط» بعد الثانية وحدها، والحصيلة من الدورتين، والتراجع بين الدورتين.
// ثم بالمتصفح بنافذتين: «التالي · دور [الآخر]»، و«يُطلق الشريط: [الآخر]» و«الدورة 2 من 2» والحدّ له، ثم «إنهاء الشريط» والحصيلة، والتراجع.
// ثم بالنافذة الواحدة.
// الاستعمال: node tests/stage6-wheel-turns.cjs [الرابط] [مجلد الصور]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, sharedToFace, beginTwo, cmd } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const root = path.join(__dirname, '..');
  const { check, finish } = reporter();
  const W = await import(path.join(root, 'js/wheel.js'));
  const R = await import(path.join(root, 'js/round.js'));
  const P = await import(path.join(root, 'js/play.js'));
  const wheel = W.default;
  const data = JSON.parse(fs.readFileSync(path.join(root, 'content/wheel.json'), 'utf8'));
  const RND = { challenge: 0.05, gift: 0.45 };

  // ===== 1. الوحدة =====
  {
    const t0 = 1_000_000, ms = W.spinMs(0);
    let r = R.startRound(wheel, { content: { 'wheel.json': data }, first: 2, scores: { 1: 4, 2: 1 }, rng: () => RND.challenge });
    r = R.act(wheel, r, 'spin', undefined, t0);
    r = R.act(wheel, r, 'land', undefined, t0 + ms);
    r = R.act(wheel, r, 'won', undefined, t0 + ms + 9000);
    check('بعد الدورة الأولى: «التالي · الدورة 2» وحده، و«إنهاء الشريط» يُهمل', wheel.actions(r.state).map(x => x.label).join() === 'التالي · الدورة 2'
      && R.act(wheel, r, 'finish', undefined, t0 + 20000).state === r.state);
    const done1 = r;
    r = R.act(wheel, r, 'next', undefined, t0 + 20000);
    let a = wheel.audience(r.state);
    check('الدورة 2: يديرها الفريق الآخر، والخانات العشر قبل الدوران، والحدّ له', r.state.n === 2 && r.state.phase === 'ready' && a.screen === 'wheel' && a.n === 2 && a.count === 2 && a.by === 1 && a.turn === 1 && !a.spin);
    check('والمسار: الدورة الأولى بنتيجتها، والثانية الجارية', JSON.stringify(wheel.presenter(r.state).track) === JSON.stringify([{ owner: 2, result: 2, now: false }, { owner: 1, result: null, now: true }]));
    check('«التالي» مرة ثانية يُهمل', R.act(wheel, r, 'next', undefined, t0 + 20100).state === r.state);
    const back = R.undo(r, t0 + 21000);
    check('التراجع من الدورة 2 قبل دورانها: نتيجة الدورة الأولى كما هي', back.state.n === 1 && back.state.phase === 'done' && back.scores[2] === 11);
    r = R.act(wheel, r, 'spin', undefined, t0 + 30000);
    check('الدورة 2 تقف على خانتها المحسومة في الإعداد', r.state.landed === r.state.stops[1]);
    r = R.act(wheel, r, 'land', undefined, t0 + 30000 + ms);
    check('والتحدي نفسه يجوز أن يتكرر (جواب المالك): الخانة نفسها، والحكم مباشرة', r.state.landed === done1.state.landed && wheel.actions(r.state)[0]?.id === 'won');
    r = R.act(wheel, r, 'won', undefined, t0 + 50000);
    check('بعد الدورة 2: «إنهاء الشريط» وحده، و«التالي» يُهمل', wheel.actions(r.state).map(x => x.label).join() === 'إنهاء الشريط' && R.act(wheel, r, 'next', undefined, t0 + 51000).state === r.state);
    const m = P.undo({ step: 'play', round: r, scores: r.scores }, [wheel]);
    check('التراجع بعد حكم الدورة 2: تحدّيها والرصيد قبل الحكم', m.round.state.phase === 'slot' && m.round.scores[1] === 4);
    r = R.act(wheel, r, 'finish', undefined, t0 + 52000);
    a = wheel.audience(r.state);
    check('«إنهاء الشريط»: الحصيلة من الدورتين (+10 و+10)، والحدّ في المنتصف', wheel.finished(r.state) && a.screen === 'end' && a.totals[1] === 10 && a.totals[2] === 10 && a.turn === 0);
  }

  // ===== 2. بالمتصفح =====
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const LONG_TEXT = 'يمثّل أحدكم فيلماً كرتونياً مشهوراً بلا كلام، ويخمّن فريقه اسمه قبل انتهاء الوقت كلهـ';
  const longData = { ...data, challenges: data.challenges.map(c => ({ ...c, text: LONG_TEXT })) };

  async function open({ long = false } = {}) {
    const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block' });
    await usePin(context);
    if (long) await context.route('**/content/wheel.json', route => route.fulfill({ json: longData }));
    context.on('page', p => {
      p.on('pageerror', e => errors.push(e.message));
      p.on('console', m => m.type() === 'error' && !/content\/packs\/.+\.json/.test(m.location().url) && errors.push(m.text()));
    });
    const stage = await context.newPage();
    await stage.setViewportSize({ width: 1920, height: 1080 });
    await stage.goto(base + '?preview');
    await stage.evaluate(() => localStorage.clear());
    await stage.reload();
    await unlock(stage);
    return { context, stage, audience: await stageFrame(stage) };
  }
  const saved = page => page.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')));
  const clean = t => t.replace(/\s+/g, ' ').trim();
  const text = (page, sel) => page.textContent(sel).then(clean);
  const cls = (frame, c) => frame.evaluate(c => document.getElementById('canvas').classList.contains(c), c);

  let layoutOk = true, presenterOk = true;
  const fails = [];
  const audienceCheck = async (audience, label) => {
    const r = await audience.evaluate(() => window.__stageCheck());
    if (!r.ok) { layoutOk = false; fails.push(`${label}: ${r.problems.join('، ')}`); }
    const body = await audience.evaluate(() => document.querySelector('.canvas').innerText);
    if (/سرقة|الأقل نقاطاً|خسر القرعة|دقيقتان حداً/.test(body)) { layoutOk = false; fails.push(`${label}: نص ممنوع على الجمهور`); }
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

  // ===== 2.1 بنافذتين: «هدية» في الدورتين =====
  for (const LONG of [false, true]) {
    const tag = LONG ? 'الأطول · ' : '';
    const NAMES = LONG ? ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'] : ['الصقور', 'النجوم'];
    const { context, stage, audience } = await open({ long: LONG });
    await sharedToFace(audience, { names: NAMES, count: 'short', picks: ['ranking', 'letter'] });
    const presenter = await beginTwo(context, audience);
    const click = async sel => { await presenter.click(sel); await wait(800); };
    await click('#showQ');
    for (let k = 0; k < 2; k++) { await click('#rCtl [data-act="finish"]'); await click('#rCtl [data-act="next"]'); }
    await presenter.evaluate(r => { Math.random = () => r; }, RND.gift);
    await click('#endNext');
    const sp = (await saved(stage)).round.state.first, op = 3 - sp;
    await click('#wCtl [data-act="spin"]');
    await audience.waitForSelector('.scr.q.show #letter.slot', { timeout: 9000 });
    await wait(1200);
    check(`${tag}بعد الدورة الأولى: المقدّم «التالي · دور [الآخر]»`, await text(presenter, '#wCtl') === 'التالي · دور ' + NAMES[op - 1]);
    await click('#wCtl [data-act="next"]');
    await audience.waitForSelector('.scr.whl.show');
    await wait(600);
    check(`${tag}الدورة 2 على التلفاز: «يُطلق الشريط: [الآخر]» و«الدورة 2 من 2»، والحدّ له، ولا خانة مضاءة، ولا مربع`, await text(audience, '#whead') === 'يُطلق الشريط: ' + NAMES[op - 1]
      && await text(audience, '#b1') === 'الدورة 2 من 2' && await cls(audience, 'turn-' + op) && !(await audience.$('#band .ws.t1, #band .ws.t2'))
      && await audience.evaluate(() => document.getElementById('box').hidden));
    check(`${tag}المقدّم: «شريط البونص · الدورة 2 من 2»، و«دور [الآخر]» بلا سبب البدء، و«أطلق الشريط»، والمسار`, await text(presenter, '#roundChip') === 'شريط البونص · الدورة 2 من 2'
      && await text(presenter, '#wWho') === 'دور ' + NAMES[op - 1] && await text(presenter, '#wState') === '' && await text(presenter, '#wCtl') === 'أطلق الشريط'
      && !!(await presenter.$(`#pips .pip.t${sp}.won${sp}`)) && !!(await presenter.$(`#pips .pip.t${op}.now`)));
    await audienceCheck(audience, `${tag}قبل الدورة 2`);
    await presenterCheck(presenter, `${tag}قبل الدورة 2`);
    if (!LONG) await stage.screenshot({ path: path.join(shots, 'wheel-ready2.png') });
    await click('#wCtl [data-act="spin"]');
    await wait(400);
    check(`${tag}المؤشر بلون الآخر`, await audience.evaluate(t => !!document.querySelector('#band .ws.t' + t), op));
    await audience.waitForSelector('.scr.q.show #letter.slot.t' + op, { timeout: 9000 });
    await wait(1200);
    check(`${tag}بعد الدورة 2: +5 للآخر، و«إنهاء الشريط»`, (await saved(stage)).round.scores[op] === 5 && await text(presenter, '#wCtl') === 'إنهاء الشريط');
    if (!LONG) {
      await presenter.click('#wUndo'); await wait(900);
      check('التراجع بعد الدورة 2: قبل دورانها، والرصيد كما كان', (await saved(stage)).round.state.n === 2 && (await saved(stage)).round.state.phase === 'ready' && (await saved(stage)).round.scores[op] === 0);
      await click('#wCtl [data-act="spin"]');
      await audience.waitForSelector('.scr.q.show #letter.slot', { timeout: 9000 });
      await wait(1200);
    }
    await click('#wCtl [data-act="finish"]');
    check(`${tag}نهاية الشريط: «+5» لكلٍّ، و«انتهى الشريط»، والمقدّم «ابدأ الجولة 2»`, await text(audience, '#r1') === '+5' && await text(audience, '#r2') === '+5'
      && await text(audience, '#b1') === 'انتهى الشريط' && await text(presenter, '#endNext') === 'ابدأ الجولة 2');
    const nb = await audience.evaluate(() => [...document.querySelectorAll('#next .nb')].map(e => ({ t: e.textContent, rows: e.getClientRects().length })));
    check(`${tag}الملاحظة 39: «التالي: الجولة 2 ·» و«الحرف المعيّن» مقطعان، وكلٌّ في سطر واحد لا ينكسر`, nb.length === 2 && nb[0].t === 'التالي: الجولة 2 ·' && nb[1].t === 'الحرف المعيّن' && nb.every(x => x.rows === 1));
    if (LONG) check('الأطول: السطر لا يتسع فينكسر عند « · » (مقطعان في سطرين)', await audience.evaluate(() => { const [a, b] = document.querySelectorAll('#next .nb'); return document.getElementById('box').classList.contains('wrap') && Math.abs(a.getBoundingClientRect().top - b.getBoundingClientRect().top) > 20; }));
    await audienceCheck(audience, `${tag}نهاية الشريط`);
    await presenterCheck(presenter, `${tag}نهاية الشريط`);
    if (!LONG) await stage.screenshot({ path: path.join(shots, 'wheel-end.png') });
    await context.close();
  }

  // ===== 2.2 بنافذة واحدة =====
  {
    const { context, stage, audience } = await open();
    await sharedToFace(audience, { names: ['الصقور', 'النجوم'], count: 'short', picks: ['ranking', 'letter'] });
    await cmd(audience, 'begin');
    await wait(600);
    const go = async c => { await cmd(audience, c); await wait(800); };
    await go('act:show');
    for (let k = 0; k < 2; k++) { await go('qr:hide'); await go('act:start'); await go('act:finish'); await go('act:next'); }
    await stage.evaluate(r => { Math.random = () => r; }, RND.gift);
    await go('next');
    const near = () => audience.$$eval('#near button', b => b.map(x => x.textContent.trim()).join('|'));
    await go('act:spin');
    await audience.waitForSelector('.scr.q.show #letter.slot', { timeout: 9000 });
    await wait(1200);
    check('نافذة واحدة: بعد الدورة الأولى «التالي · الدورة 2»', await near() === 'التالي · الدورة 2');
    await go('act:next');
    check('ثم «أطلق الشريط» للآخر، و«الدورة 2 من 2»', await near() === 'أطلق الشريط' && await text(audience, '#b1') === 'الدورة 2 من 2');
    await audienceCheck(audience, 'نافذة واحدة · قبل الدورة 2');
    await stage.screenshot({ path: path.join(shots, 'wheel-ready2-w1.png') });
    await go('act:spin');
    await audience.waitForSelector('.scr.q.show #letter.slot', { timeout: 9000 });
    await wait(1200);
    check('بعد الدورة 2: «إنهاء الشريط»', await near() === 'إنهاء الشريط');
    await go('act:finish');
    check('ثم النهاية، وفي البطاقة «ابدأ الجولة 2»', await text(audience, '.scr.end.show .ctl') === 'ابدأ الجولة 2');
    await context.close();
  }

  check('فحص التداخل والشبكة، ولا نص ممنوع على الجمهور', layoutOk);
  check('نافذة المقدّم بمقاساتها الثلاثة: لا تمرير، ولا نص أصغر من 32، ولا زر يفيض', presenterOk);
  check('لا أخطاء في الصفحات', errors.length === 0);
  await browser.close();
  process.exit(finish([...fails, ...errors]) ? 0 : 1);
})();
