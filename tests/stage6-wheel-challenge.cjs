// اختبار آلي لمرحلة «التحدي والحكم» في عجلة البونص (5.7، design/wheel.md 2 و4 و5) في رابط المعاينة:
// وحدةً (دون متصفح): «ابدأ التحدي» يبدأ دقيقتين، وانتهاء الوقت لا يحكم، و«نجح» +5 لمن أدارها و«لم ينجح» بلا خصم،
// والتراجع عن الحكم والوقت يجري يعيد ما بقي منه، والحصيلة في نهاية العجلة.
// ثم بالمتصفح بنافذتين: الوقت «2:00» في لوحة من أدارها وإطاره يتآكل، والوقت في رأس المقدّم، وآخر 3 ثوانٍ، و«انتهى الوقت» حتى يحكم،
// والحكم بلا مربع («[الاسم] · +5» و«نجح التحدي»، أو «لا نقاط» و«لم ينجح التحدي»)، ونهاية العجلة بحصيلتها. ثم بأطول محتوى، ثم بالنافذة الواحدة.
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
    check('وقفت على تحدٍّ: «ابدأ التحدي · دقيقتان» وحده، ولا حكم قبل «ابدأ»', s.phase === 'slot' && wheel.actions(s).map(x => x.label).join('|') === 'ابدأ التحدي · دقيقتان');
    check('الجمهور: الوقت دقيقتان ثابت، بصيغة m:ss، والحدّ لمن أدارها', a.screen === 'slot' && a.clock === 120 && a.mmss && a.turn === 2 && !a.verdict && !a.timeup);
    const t1 = t0 + ms + 1000;
    round = R.act(wheel, round, 'start', undefined, t1);
    s = round.state;
    check('«ابدأ»: عدّاد 120 ثانية، والحكم «نجح · +5» و«لم ينجح»', s.phase === 'run' && round.timer?.seconds === 120 && round.events.some(e => e.type === 'timer' && e.seconds === 120)
      && wheel.actions(s).map(x => x.label).join('|') === 'نجح · +5|لم ينجح');
    check('نقرة ثانية على «ابدأ» تُهمل', R.act(wheel, round, 'start', undefined, t1 + 100).state === round.state);
    // الحكم والوقت يجري، ثم التراجع: يعود العدّاد بما بقي منه لا بالدقيقتين.
    const won = R.act(wheel, round, 'won', undefined, t1 + 30000);
    check('«نجح»: +5 لمن أدارها، ولحظة right، ويقف العدّاد', won.scores[2] === 5 && won.scores[1] === 0 && won.timer === null && won.events.some(e => e.type === 'moment' && e.name === 'right' && e.team === 2));
    a = wheel.audience(won.state);
    check('الجمهور بعد «نجح»: الشارة لمن أدارها «+5» والسطر «نجح التحدي»، والحدّ عنده', a.verdict?.team === 2 && a.verdict.points === 5 && a.verdict.say === 'نجح التحدي' && a.turn === 2);
    check('بعد الحكم: «إنهاء العجلة» (الدورة الثانية مرحلة تالية)، والمسار يكتب من أخذ النقاط', wheel.actions(won.state).map(x => x.id).join() === 'finish' && wheel.presenter(won.state).track[0].result === 2);
    const back = R.undo(won, t1 + 31000);
    check('التراجع عن الحكم والوقت يجري: الرصيد كما كان، والعدّاد بما بقي منه (نحو 90 ثانية)', back.state.phase === 'run' && back.scores[2] === 0 && back.timer && Math.abs(back.timer.seconds - 90) < 0.01);
    // انتهاء الوقت: لا حكم تلقائي.
    const out = R.act(wheel, round, 'timeout', round.timer.id, t1 + 120000);
    s = out.state; a = wheel.audience(s);
    check('انتهى الوقت: لا حكم ولا نقاط، ويقف العدّاد، و«انتهى الوقت» للجمهور', s.phase === 'run' && s.timeup && out.timer === null && out.scores[2] === 0 && a.timeup && !a.verdict
      && out.events.some(e => e.type === 'stop-timer'));
    check('والحكم باقٍ بعده: «نجح · +5» و«لم ينجح»', wheel.actions(s).map(x => x.id).join() === 'won,failed');
    check('«انتهى الوقت» من عدّاد قديم يُهمل', R.act(wheel, round, 'timeout', round.timer.id + 1, t1 + 120000).state === round.state);
    const failed = R.act(wheel, out, 'failed', undefined, t1 + 125000);
    a = wheel.audience(failed.state);
    check('«لم ينجح»: لا نقاط ولا خصم، والشارة «لا نقاط» والسطر «لم ينجح التحدي»، والحدّ في المنتصف', failed.scores[1] === 0 && failed.scores[2] === 0 && a.verdict?.team === 0 && a.verdict.say === 'لم ينجح التحدي' && a.turn === 0
      && wheel.presenter(failed.state).track[0].result === 0);
    const end = R.act(wheel, R.act(wheel, out, 'won', undefined, t1 + 125000), 'finish', undefined, t1 + 126000);
    a = wheel.audience(end.state);
    check('نهاية العجلة: الحصيلة «+5» لمن نجح و«0» للآخر', a.screen === 'end' && a.totals[2] === 5 && a.totals[1] === 0);
    // خانة حظ: لا تحدي ولا عدّاد (تطبيقها مرحلة تالية).
    let luck = R.startRound(wheel, { content: { 'wheel.json': data }, first: 1, rng: () => 0.15 });
    luck = R.act(wheel, R.act(wheel, luck, 'spin', undefined, t0), 'land', undefined, t0 + W.spinMs(1));
    check('خانة حظ: لا «ابدأ» ولا وقت', luck.state.slots[1].kind === 'luck' && !wheel.actions(luck.state).some(x => x.id === 'start') && R.act(wheel, luck, 'start', undefined, t0 + 9000).state === luck.state);
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
    check(`${tag}وقفت على تحدٍّ: المقدّم «لم يبدأ الوقت» و«ابدأ التحدي · دقيقتان»، ولا وقت في الرأس`, await text(presenter, '#wState') === 'لم يبدأ الوقت'
      && await text(presenter, '#wCtl') === 'ابدأ التحدي · دقيقتان' && await presenter.$eval('#wClock', e => e.hidden));
    check(`${tag}الجمهور: لا وقت يجري قبل «ابدأ»، ولا مربع إعلان`, !(await cls(audience, 'running')) && await audience.evaluate(() => document.getElementById('box').hidden));

    // ابدأ.
    await click('#wCtl [data-act="start"]');
    const st = await saved(stage);
    check(`${tag}«ابدأ»: عدّاد الدقيقتين`, st.round.state.phase === 'run' && st.round.timer?.seconds === 120);
    const c = await audience.evaluate(t => document.getElementById('c' + t).innerHTML, spinner);
    check(`${tag}الجمهور: الوقت يجري (.running)، و«1:59» أو «2:00» في لوحة من أدارها داخل span.ltr، وإطار الوقت يتآكل`, await cls(audience, 'running')
      && /^<span class="ltr">(1:59|2:00)<\/span>$/.test(c) && await audience.evaluate(t => document.querySelector(`#p${t} polygon`).getAnimations().length === 1, spinner)
      && await audience.evaluate(t => document.getElementById('canvas').classList.contains('turn-' + t), spinner));
    check(`${tag}المقدّم: «الوقت» في الرأس، و«يؤدّي الفريق التحدي»، و«نجح · +5» و«لم ينجح»`, !(await presenter.$eval('#wClock', e => e.hidden)) && /^الوقت ?(1:5\d|2:00)$/.test(await text(presenter, '#wClock'))
      && await text(presenter, '#wState') === 'يؤدّي الفريق التحدي' && (await presenter.$$eval('#wCtl button', b => b.map(x => x.textContent.trim()).join('|'))) === 'نجح · +5|لم ينجح');
    await audienceCheck(audience, `${tag}وقت التحدي`);
    await presenterCheck(presenter, `${tag}وقت التحدي`);
    if (!LONG) await stage.screenshot({ path: path.join(shots, 'wheel-run.png') });

    // آخر 3 ثوانٍ، ثم انتهاء الوقت.
    await skip(audience, 116000);
    await wait(700);
    check(`${tag}آخر 3 ثوانٍ: الحواف النابضة، وثوانٍ من «0:03» إلى «0:01»`, await cls(audience, 'meta-danger') && /^0:0[123]$/.test(await text(audience, '#c' + spinner)));
    await wait(4000);
    const out = await saved(stage);
    check(`${tag}انتهى الوقت: لا حكم تلقائي، والعدّاد وقف`, out.round.state.phase === 'run' && out.round.state.timeup && !out.round.timer && out.round.scores[spinner] === 0);
    check(`${tag}الجمهور: «انتهى الوقت» نصاً بلا مربع، ولا وقت يجري`, !(await cls(audience, 'running')) && await text(audience, '#next') === 'انتهى الوقت'
      && await audience.evaluate(() => document.getElementById('box').classList.contains('bare')) && await audience.evaluate(() => document.getElementById('verdict').hidden));
    check(`${tag}المقدّم: «انتهى الوقت · احكم»، و«الوقت 0:00»، والحكم باقٍ`, await text(presenter, '#wState') === 'انتهى الوقت · احكم' && /^الوقت ?0:00$/.test(await text(presenter, '#wClock'))
      && (await presenter.$$('#wCtl button')).length === 2);
    await audienceCheck(audience, `${tag}انتهى الوقت`);
    if (!LONG) await stage.screenshot({ path: path.join(shots, 'wheel-timeup.png') });

    // لم ينجح، ثم التراجع، ثم نجح.
    await click('#wCtl [data-act="failed"]');
    check(`${tag}«لم ينجح»: «لا نقاط» و«لم ينجح التحدي» بلا مربع، والحدّ في المنتصف، والرصيد كما هو`, await text(audience, '#vtext') === 'لا نقاط' && await text(audience, '#say') === 'لم ينجح التحدي'
      && await audience.evaluate(() => document.getElementById('box').classList.contains('bare')) && !(await cls(audience, 'turn-1')) && !(await cls(audience, 'turn-2'))
      && (await saved(stage)).round.scores[spinner] === 0);
    check(`${tag}المقدّم: «لا نقاط · لم ينجح التحدي» و«إنهاء العجلة»`, await text(presenter, '#wWho') === 'لا نقاط · لم ينجح التحدي' && await text(presenter, '#wCtl') === 'إنهاء العجلة' && await presenter.$eval('#wClock', e => e.hidden));
    await audienceCheck(audience, `${tag}لم ينجح`);
    if (!LONG) await stage.screenshot({ path: path.join(shots, 'wheel-failed.png') });
    await presenter.click('#wUndo'); await wait(900);
    check(`${tag}التراجع: «انتهى الوقت · احكم» من جديد`, (await saved(stage)).round.state.timeup && await text(presenter, '#wState') === 'انتهى الوقت · احكم');
    await click('#wCtl [data-act="won"]');
    const wonM = await saved(stage);
    check(`${tag}«نجح»: +5 لمن أدارها، و«[الاسم] · +5» و«نجح التحدي» بلا مربع، والحدّ عنده`, wonM.round.scores[spinner] === 5 && await text(audience, '#vtext') === `${who} · +5`
      && await text(audience, '#say') === 'نجح التحدي' && await audience.evaluate(() => document.getElementById('box').classList.contains('bare')) && await cls(audience, 'turn-' + spinner)
      && await text(audience, '#s' + spinner) === '5');
    check(`${tag}المقدّم: «[الاسم] · +5 · نجح التحدي»، والمسار يكتبه`, await text(presenter, '#wWho') === `${who} · +5 · نجح التحدي` && !!(await presenter.$(`#pips .pip.won${spinner}`)));
    await wait(800);
    await audienceCheck(audience, `${tag}نجح`);
    await presenterCheck(presenter, `${tag}نجح`);
    if (!LONG) await stage.screenshot({ path: path.join(shots, 'wheel-won.png') });

    await click('#wCtl [data-act="finish"]');
    check(`${tag}نهاية العجلة: «+5» لمن نجح و«+0» للآخر، على الشاشة وفي المقدّم`, await text(audience, '#r' + spinner) === '+5' && await text(audience, '#r' + (3 - spinner)) === '+0'
      && (await text(presenter, '#sum')).includes('+5'));
    await audienceCheck(audience, `${tag}نهاية العجلة`);
    await context.close();
  }

  // ===== 2.2 بنافذة واحدة =====
  {
    const { context, stage, audience } = await open();
    await sharedToFace(audience, { names: ['الصقور', 'النجوم'], count: 'short', picks: ['ranking', 'letter'] });
    await cmd(audience, 'single');
    await wait(600);
    const go = async c => { await cmd(audience, c); await wait(800); };
    await go('act:show');
    for (let k = 0; k < 2; k++) { await go('act:start:one'); await go('act:finish'); await go('act:commit'); await go('act:next'); }
    await stage.evaluate(() => { Math.random = () => 0.05; });
    await go('next');
    await go('act:spin');
    await audience.waitForSelector('.scr.q.show #letter.slot', { timeout: 9000 });
    await wait(900);
    const near = () => audience.$$eval('#near button', b => b.map(x => x.textContent.trim()).join('|'));
    check('نافذة واحدة: «ابدأ · دقيقتان» بجانب الشارات', await near() === 'ابدأ · دقيقتان');
    await go('act:start');
    check('والوقت يجري: «نجح» و«لم ينجح» (بإطار)', await near() === 'نجح|لم ينجح' && await audience.$eval('#near button:last-child', b => b.classList.contains('alt')));
    await audienceCheck(audience, 'نافذة واحدة · وقت التحدي');
    await stage.screenshot({ path: path.join(shots, 'wheel-run-w1.png') });
    await wait(1500);
    await go('act:won');
    check('«نجح»: «إنهاء العجلة»، و+5', await near() === 'إنهاء العجلة' && (await saved(stage)).round.scores[(await saved(stage)).round.state.first] === 5);
    await audienceCheck(audience, 'نافذة واحدة · نجح');
    await stage.screenshot({ path: path.join(shots, 'wheel-won-w1.png') });
    await go('undo');
    const t = (await saved(stage)).round.timer;
    check('«تراجع» والوقت كان يجري: يعود بما بقي منه لا بالدقيقتين', (await saved(stage)).round.state.phase === 'run' && t && t.seconds < 119.5 && t.seconds > 100 && await cls(audience, 'running'));
    await go('act:failed');
    await go('act:finish');
    check('«إنهاء العجلة»: في البطاقة «ابدأ الجولة 2»', await text(audience, '.scr.end.show .ctl') === 'ابدأ الجولة 2');
    await context.close();
  }

  check('فحص التداخل والشبكة، ولا نص ممنوع على الجمهور', layoutOk);
  check('نافذة المقدّم بمقاساتها الثلاثة: لا تمرير، ولا نص أصغر من 32، ولا زر يفيض', presenterOk);
  check('لا أخطاء في الصفحات', errors.length === 0);
  await browser.close();
  process.exit(finish([...fails, ...errors]) ? 0 : 1);
})();
