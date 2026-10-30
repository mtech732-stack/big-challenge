// اختبار آلي لمرحلة «التحدي والحكم» في شريط البونص (5.7، design/wheel.md 2 و5، design/s8.md 4) في رابط المعاينة:
// وحدةً (دون متصفح): التحدي بلا توقيت، فالحكم من لحظة الوقوف، و«نجح» +10 لمن أدارها و«لم ينجح» بلا خصم،
// والتراجع عن الحكم يعيده، والحصيلة في نهاية الشريط.
// ثم بالمتصفح بنافذتين: لا وقت في اللوحة ولا في رأس المقدّم، والحكم بلا مربع («[الاسم] · +10» و«نجح التحدي»،
// أو «لا نقاط» و«لم ينجح التحدي»)، ونهاية الشريط بحصيلتها. ثم بأطول محتوى، ثم بالنافذة الواحدة.
// الاستعمال: node tests/stage6-wheel-challenge.cjs [الرابط] [مجلد الصور]
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
  const wheel = W.default;
  const data = JSON.parse(fs.readFileSync(path.join(root, 'content/wheel.json'), 'utf8'));

  // ===== 1. الوحدة =====
  {
    // rng ثابت: خانة الوقوف 0 في الدورتين (تحدٍّ).
    let round = R.startRound(wheel, { content: { 'wheel.json': data }, first: 2, rng: () => 0.05 });
    const t0 = 1_000_000, ms = W.spinMs(0);
    round = R.act(wheel, round, 'spin', undefined, t0);
    round = R.act(wheel, round, 'land', undefined, t0 + ms);
    let s = round.state, a = wheel.audience(s);
    check('وقفت على تحدٍّ: الحكم مباشرة «نجح · +10» و«لم ينجح»، ولا «ابدأ» ولا عدّاد', s.phase === 'slot' && W.CHALLENGE_POINTS === 10
      && wheel.actions(s).map(x => x.label).join('|') === 'نجح · +10|لم ينجح' && !round.timer && R.act(wheel, round, 'start', undefined, t0 + ms + 100).state === round.state);
    check('الجمهور: لا وقت ولا «انتهى الوقت»، والحدّ لمن أدارها', a.screen === 'slot' && !a.clock && !a.mmss && !a.timeup && a.turn === 2 && !a.verdict);
    const won = R.act(wheel, round, 'won', undefined, t0 + ms + 30000);
    check('«نجح»: +10 لمن أدارها، ولحظة right', won.scores[2] === 10 && won.scores[1] === 0 && won.timer === null && won.events.some(e => e.type === 'moment' && e.name === 'right' && e.team === 2));
    a = wheel.audience(won.state);
    check('الجمهور بعد «نجح»: الشارة لمن أدارها «+10» والسطر «نجح التحدي»، والحدّ عنده', a.verdict?.team === 2 && a.verdict.points === 10 && a.verdict.say === 'نجح التحدي' && a.turn === 2);
    const back = R.undo(won);
    check('التراجع عن الحكم: الرصيد كما كان، والحكم من جديد', back.state.phase === 'slot' && back.scores[2] === 0 && !back.timer && wheel.actions(back.state).map(x => x.id).join() === 'won,failed');
    const failed = R.act(wheel, round, 'failed', undefined, t0 + ms + 30000);
    a = wheel.audience(failed.state);
    check('«لم ينجح»: لا نقاط ولا خصم، والشارة «لا نقاط» والسطر «لم ينجح التحدي»، والحدّ في المنتصف', failed.scores[1] === 0 && failed.scores[2] === 0 && a.verdict?.team === 0 && a.verdict.say === 'لم ينجح التحدي' && a.turn === 0
      && wheel.presenter(failed.state).track[0].result === 0);
    check('حال «run» محفوظة قبل ش8 تُحكم كالوقوف', wheel.actions({ ...round.state, phase: 'run' }).map(x => x.id).join() === 'won,failed' && wheel.audience({ ...round.state, phase: 'run' }).phase === 'slot');
    // الدورة الثانية للفريق الآخر (الخانة نفسها، تحدٍّ يجوز تكراره): «لم ينجح»، ثم «إنهاء الشريط».
    let end = R.act(wheel, won, 'next', undefined, t0 + 60000);
    end = R.act(wheel, end, 'spin', undefined, t0 + 61000);
    end = R.act(wheel, end, 'land', undefined, t0 + 61000 + ms);
    end = R.act(wheel, end, 'failed', undefined, t0 + 80000);
    end = R.act(wheel, end, 'finish', undefined, t0 + 81000);
    a = wheel.audience(end.state);
    check('نهاية الشريط: الحصيلة «+10» لمن نجح و«0» للآخر', a.screen === 'end' && a.totals[2] === 10 && a.totals[1] === 0);
    let luck = R.startRound(wheel, { content: { 'wheel.json': data }, first: 1, rng: () => 0.15 });
    luck = R.act(wheel, R.act(wheel, luck, 'spin', undefined, t0), 'land', undefined, t0 + W.spinMs(1));
    check('خانة حظ: لا حكم ولا وقت', luck.state.slots[1].kind === 'luck' && !wheel.actions(luck.state).some(x => x.id === 'won') && !luck.timer);
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
  // يُقدَّم وقت نافذة الجمهور (هي التي تعدّ)، فتبلغ آخر ثوانٍ الدقيقتين دون انتظارهما.
  const skip = (frame, ms) => frame.evaluate(ms => { const real = Date.now; Date.now = () => real() + ms; }, ms);

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

  // ===== 2.1 بنافذتين (والأطول بعدها) =====
  for (const LONG of [false, true]) {
    const tag = LONG ? 'الأطول · ' : '';
    const NAMES = LONG ? ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'] : ['الصقور', 'النجوم'];
    const { context, stage, audience } = await open({ long: LONG });
    await sharedToFace(audience, { names: NAMES, count: 'short', picks: ['ranking', 'letter'] });
    const presenter = await beginTwo(context, audience);
    const click = async sel => { await presenter.click(sel); await wait(800); };
    await click('#showQ');
    for (let k = 0; k < 2; k++) { await click('#rCtl [data-act="finish"]'); await click('#rCtl [data-act="next"]'); }
    // العشوائية ثابتة في نافذة المقدّم (هي التي تحسم الخانة): تقف العجلة على الخانة الأولى، وهي تحدٍّ.
    await presenter.evaluate(() => { Math.random = () => 0.05; });
    await click('#endNext');
    const spinner = (await saved(stage)).round.state.first, who = NAMES[spinner - 1];
    await click('#wCtl [data-act="spin"]');
    await audience.waitForSelector('.scr.q.show #letter.slot', { timeout: 9000 });
    await wait(900);
    check(`${tag}وقفت على تحدٍّ: المقدّم «يؤدّي الفريق التحدي» و«نجح · +10» و«لم ينجح»، ولا وقت في الرأس`, await text(presenter, '#wState') === 'يؤدّي الفريق التحدي'
      && (await presenter.$$eval('#wCtl button', b => b.map(x => x.textContent.trim()).join('|'))) === 'نجح · +10|لم ينجح' && await presenter.$eval('#wClock', e => e.hidden)
      && (await text(presenter, '.rule')).startsWith('بلا توقيت'));
    check(`${tag}الجمهور: لا وقت يجري ولا عدّاد في لوحة من أدارها، ولا مربع إعلان`, !(await cls(audience, 'running')) && await audience.evaluate(() => document.getElementById('box').hidden)
      && !/\d:\d\d/.test(await text(audience, '#c' + spinner)) && await cls(audience, 'turn-' + spinner));
    await audienceCheck(audience, `${tag}التحدي`);
    await presenterCheck(presenter, `${tag}التحدي`);
    if (!LONG) await stage.screenshot({ path: path.join(shots, 'wheel-run.png') });

    // لم ينجح، ثم التراجع، ثم نجح.
    await click('#wCtl [data-act="failed"]');
    check(`${tag}«لم ينجح»: «لا نقاط» و«لم ينجح التحدي» بلا مربع، والحدّ في المنتصف، والرصيد كما هو`, await text(audience, '#vtext') === 'لا نقاط' && await text(audience, '#say') === 'لم ينجح التحدي'
      && await audience.evaluate(() => document.getElementById('box').classList.contains('bare')) && !(await cls(audience, 'turn-1')) && !(await cls(audience, 'turn-2'))
      && (await saved(stage)).round.scores[spinner] === 0);
    check(`${tag}المقدّم: «لا نقاط · لم ينجح التحدي» و«التالي · دور [الآخر]»`, await text(presenter, '#wWho') === 'لا نقاط · لم ينجح التحدي' && (await text(presenter, '#wCtl')).startsWith('التالي · دور ') && await presenter.$eval('#wClock', e => e.hidden));
    await audienceCheck(audience, `${tag}لم ينجح`);
    if (!LONG) await stage.screenshot({ path: path.join(shots, 'wheel-failed.png') });
    await presenter.click('#wUndo'); await wait(900);
    check(`${tag}التراجع: الحكم من جديد`, (await saved(stage)).round.state.phase === 'slot' && (await presenter.$$('#wCtl button')).length === 2);
    await click('#wCtl [data-act="won"]');
    const wonM = await saved(stage);
    check(`${tag}«نجح»: +10 لمن أدارها، و«[الاسم] · +10» و«نجح التحدي» بلا مربع، والحدّ عنده`, wonM.round.scores[spinner] === 10 && await text(audience, '#vtext') === `${who} · +10`
      && await text(audience, '#say') === 'نجح التحدي' && await audience.evaluate(() => document.getElementById('box').classList.contains('bare')) && await cls(audience, 'turn-' + spinner)
      && await text(audience, '#s' + spinner) === '10');
    check(`${tag}المقدّم: «[الاسم] · +10 · نجح التحدي»، والمسار يكتبه`, await text(presenter, '#wWho') === `${who} · +10 · نجح التحدي` && !!(await presenter.$(`#pips .pip.won${spinner}`)));
    await wait(800);
    await audienceCheck(audience, `${tag}نجح`);
    await presenterCheck(presenter, `${tag}نجح`);
    if (!LONG) await stage.screenshot({ path: path.join(shots, 'wheel-won.png') });

    // الدورة الثانية للفريق الآخر، والخانة نفسها (تحدٍّ يتكرر): «لم ينجح»، ثم «إنهاء الشريط».
    await click('#wCtl [data-act="next"]');
    await audience.waitForSelector('.scr.whl.show');
    await click('#wCtl [data-act="spin"]');
    await audience.waitForSelector('.scr.q.show #letter.slot', { timeout: 9000 });
    await wait(900);
    await click('#wCtl [data-act="failed"]');
    await click('#wCtl [data-act="finish"]');
    check(`${tag}نهاية العجلة: «+10» لمن نجح و«+0» للآخر، على الشاشة وفي المقدّم`, await text(audience, '#r' + spinner) === '+10' && await text(audience, '#r' + (3 - spinner)) === '+0'
      && (await text(presenter, '#sum')).includes('+10'));
    await audienceCheck(audience, `${tag}نهاية العجلة`);
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
    await stage.evaluate(() => { Math.random = () => 0.05; });
    await go('next');
    await go('act:spin');
    await audience.waitForSelector('.scr.q.show #letter.slot', { timeout: 9000 });
    await wait(900);
    const near = () => audience.$$eval('#near button', b => b.map(x => x.textContent.trim()).join('|'));
    check('نافذة واحدة: «نجح · +10» و«لم ينجح» (بإطار) بجانب الشارات من لحظة الوقوف', await near() === 'نجح · +10|لم ينجح' && await audience.$eval('#near button:last-child', b => b.classList.contains('no') || b.classList.contains('alt')));
    await audienceCheck(audience, 'نافذة واحدة · التحدي');
    await stage.screenshot({ path: path.join(shots, 'wheel-run-w1.png') });
    await go('act:won');
    check('«نجح»: «التالي · الدورة 2»، و+10', await near() === 'التالي · الدورة 2' && (await saved(stage)).round.scores[(await saved(stage)).round.state.first] === 10);
    await audienceCheck(audience, 'نافذة واحدة · نجح');
    await stage.screenshot({ path: path.join(shots, 'wheel-won-w1.png') });
    await go('undo');
    check('«تراجع»: الحكم من جديد', (await saved(stage)).round.state.phase === 'slot' && await near() === 'نجح · +10|لم ينجح');
    await go('act:failed');
    await go('act:next');
    await go('act:spin');
    await audience.waitForSelector('.scr.q.show #letter.slot', { timeout: 9000 });
    await wait(900);
    await go('act:failed');
    await go('act:finish');
    check('«إنهاء الشريط»: في البطاقة «ابدأ الجولة 2»', await text(audience, '.scr.end.show .ctl') === 'ابدأ الجولة 2');
    await context.close();
  }

  check('فحص التداخل والشبكة، ولا نص ممنوع على الجمهور', layoutOk);
  check('نافذة المقدّم بمقاساتها الثلاثة: لا تمرير، ولا نص أصغر من 32، ولا زر يفيض', presenterOk);
  check('لا أخطاء في الصفحات', errors.length === 0);
  await browser.close();
  process.exit(finish([...fails, ...errors]) ? 0 : 1);
})();
