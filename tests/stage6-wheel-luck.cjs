// اختبار آلي لمرحلة «خانات الحظ وحد الصفر» في شريط البونص (5.7، design/wheel.md 2 و5) في رابط المعاينة:
// وحدةً (دون متصفح): خانة الحظ تُطبَّق فور الوقوف بلا حكم: «خصم» −3 لمن أدارها، و«هدية» +3، و«اسرق» 3 من الخصم إليه،
// ولا ينزل رصيد تحت الصفر، والشارة بما تغيّر فعلاً («−1» ورصيده 1)، والحدّ في المنتصف في «خصم»، والتراجع يعيد ما قبل الدوران،
// والحصيلة في نهاية العجلة. ثم بالمتصفح بنافذتين: «خصم» بحد الصفر، و«هدية»، و«اسرق» (والأطول بأطول اسمين)، ثم «هدية» بنافذة واحدة.
// و«اسرق» والخصم عنده أقل من 3: يأخذ ما تبقى فقط (جواب المالك 25 أكتوبر 2026).
// الاستعمال: node tests/stage6-wheel-luck.cjs [الرابط] [مجلد الصور]
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
  // rng ثابت يقف على خانة بعينها: 0.15 الخانة 2 (خصم) · 0.45 الخانة 5 (هدية) · 0.75 الخانة 8 (اسرق).
  const RND = { lose: 0.15, gift: 0.45, steal: 0.75 };

  // ===== 1. الوحدة =====
  const t0 = 1_000_000;
  const landOn = (effect, scores, first = 2) => {
    let r = R.startRound(wheel, { content: { 'wheel.json': data }, first, scores, rng: () => RND[effect] });
    r = R.act(wheel, r, 'spin', undefined, t0);
    return R.act(wheel, r, 'land', undefined, t0 + W.spinMs(r.state.landed));
  };
  {
    let r = landOn('lose', { 1: 4, 2: 9 });
    let a = wheel.audience(r.state);
    check('«خصم 3»: تُطبَّق فور الوقوف بلا حكم ولا «ابدأ»، −3 لمن أدارها', r.state.slots[r.state.landed].effect === 'lose-3' && r.state.phase === 'done' && r.scores[2] === 6 && r.scores[1] === 4
      && wheel.actions(r.state).map(x => x.id).join() === 'next');
    check('والشارة «−3» لمن أدارها والسطر «خانة حظ»، والحدّ في المنتصف، ولحظة اهتزاز (trap)', a.verdict?.team === 2 && a.verdict.points === -3 && a.verdict.say === 'خانة حظ' && a.turn === 0
      && r.events.some(e => e.type === 'moment' && e.name === 'trap' && e.team === 2));
    r = landOn('lose', { 1: 4, 2: 1 });
    a = wheel.audience(r.state);
    check('حد الصفر: «خصم 3» ورصيده 1 ينزل إلى 0، والشارة بما تغيّر فعلاً «−1»', r.scores[2] === 0 && a.verdict.points === -1);
    r = landOn('lose', { 1: 4, 2: 0 });
    check('ورصيده 0 يبقى 0، والشارة «0» بلا إشارة (لا −0، ملاحظة المعاين 38)', r.scores[2] === 0 && Object.is(wheel.audience(r.state).verdict.points, 0));
    const zero = landOn('steal', { 1: 0, 2: 9 });
    check('«خصم» والخصم 0: لا يتغير شيء، والنتيجة 0 بلا إشارة', zero.scores[1] === 0 && zero.scores[2] === 9 && Object.is(wheel.audience(zero.state).verdict.points, 0) && wheel.audience(zero.state).verdict.taken === 0);
    r = landOn('gift', { 1: 4, 2: 9 });
    a = wheel.audience(r.state);
    check('«هدية +3»: +3 لمن أدارها، والحدّ عنده، ولحظة right', r.state.slots[r.state.landed].effect === 'gift-3' && r.scores[2] === 12 && a.verdict.points === 3 && a.turn === 2
      && r.events.some(e => e.type === 'moment' && e.name === 'right' && e.team === 2));
    r = landOn('steal', { 1: 4, 2: 9 });
    a = wheel.audience(r.state);
    check('«اسرق 3»: 3 من الخصم إلى من أدارها، والشارة «+3» ومعها من أُخذ منه وكم، والحدّ عنده', r.state.slots[r.state.landed].effect === 'steal-3' && r.scores[2] === 12 && r.scores[1] === 1
      && a.verdict.points === 3 && a.verdict.from === 1 && a.verdict.taken === 3 && a.turn === 2 && r.events.some(e => e.name === 'taken' && e.team === 1));
    check('حصيلة الشريط بعد «اسرق»: «+3» لمن أدارها و«−3» للخصم', wheel.audience(r.state).totals[2] === 3 && wheel.audience(r.state).totals[1] === -3);
    r = landOn('steal', { 1: 2, 2: 9 });
    check('«اسرق» والخصم عنده 2: يأخذ ما تبقى فقط (جواب المالك)، 2 و2، ولا ينزل تحت الصفر', r.scores[1] === 0 && r.scores[2] === 11 && wheel.audience(r.state).verdict.taken === 2);
    check('لا تتجاوز خانة حظ 3 نقاط', ['lose', 'gift', 'steal'].every(e => Math.abs(wheel.audience(landOn(e, { 1: 50, 2: 50 }).state).verdict.points) <= 3));
    r = landOn('gift', { 1: 4, 2: 9 });
    const m = P.undo({ step: 'play', round: r, scores: r.scores }, [wheel]);
    check('التراجع بعد خانة الحظ: قبل الدوران، والرصيد كما كان', m.round.state.phase === 'ready' && m.round.scores[2] === 9 && m.round.state.results[0] === null);
    check('والمسار يكتب من أدارها في خانة الحظ', wheel.presenter(r.state).track[0].result === 2);
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

  // تُضبط النقاط قبل الدوران من طبقة الرصيد: + بعدد النقاط لكل فريق.
  const setScores = async (presenter, want) => {
    await presenter.click('#openScores');
    for (const t of [1, 2]) for (let k = 0; k < want[t]; k++) await presenter.click(`#scores [data-team="${t}"][data-d="1"]`);
    await presenter.click('#closeScores');
    await wait(400);
  };

  // ===== 2.1 بنافذتين: كل خانة حظ في مباراة =====
  const CASES = [
    { effect: 'lose', set: (s, o) => ({ [s]: 1, [o]: 4 }), long: false },
    { effect: 'gift', set: (s, o) => ({ [s]: 2, [o]: 4 }), long: false },
    { effect: 'steal', set: (s, o) => ({ [s]: 2, [o]: 6 }), long: false },
    { effect: 'steal', set: (s, o) => ({ [s]: 2, [o]: 6 }), long: true },
  ];
  for (const { effect, set, long: LONG } of CASES) {
    const tag = (LONG ? 'الأطول · ' : '') + effect + ' · ';
    const NAMES = LONG ? ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'] : ['الصقور', 'النجوم'];
    const { context, stage, audience } = await open({ long: LONG });
    await sharedToFace(audience, { names: NAMES, count: 'short', picks: ['ranking', 'letter'] });
    const presenter = await beginTwo(context, audience);
    const click = async sel => { await presenter.click(sel); await wait(800); };
    await click('#showQ');
    for (let k = 0; k < 2; k++) { await click('#rCtl [data-act="finish"]'); await click('#rCtl [data-act="next"]'); }
    await presenter.evaluate(r => { Math.random = () => r; }, RND[effect]);
    await click('#endNext');
    const sp = (await saved(stage)).round.state.first, op = 3 - sp, who = NAMES[sp - 1], rival = NAMES[op - 1];
    const before = set(sp, op);
    await setScores(presenter, before);
    await click('#wCtl [data-act="spin"]');
    await audience.waitForSelector('.scr.q.show #letter.slot', { timeout: 9000 });
    await wait(1200);
    const m = await saved(stage), sc = m.round.scores;
    const box = await audience.evaluate(() => ({ bare: document.getElementById('box').classList.contains('bare'), hidden: document.getElementById('box').hidden }));
    const side = await audience.evaluate(() => [1, 2].find(t => document.getElementById('canvas').classList.contains('turn-' + t)) ?? 0);
    const label = data.luck.find(l => l.effect === effect + '-3').label;
    check(`${tag}تُطبَّق فور الوقوف: نص الخانة، ولا «ابدأ» ولا وقت، والحكم بلا مربع`, await text(audience, '#label') === label && !box.hidden && box.bare
      && !(await cls(audience, 'running')) && (await text(presenter, '#wCtl')).startsWith('التالي · دور ') && await presenter.$eval('#wClock', e => e.hidden));
    if (effect === 'lose') {
      check(`${tag}حد الصفر: رصيده 1 فينزل إلى 0، والشارة «[الاسم] · −1» والسطر «خانة حظ»، والحدّ في المنتصف`, sc[sp] === 0 && sc[op] === 4 && await text(audience, '#vtext') === `${who} · −1`
        && await text(audience, '#say') === 'خانة حظ' && side === 0 && await text(audience, '#s' + sp) === '0');
      check(`${tag}المقدّم: «[الاسم] · −1 · خصم 3 نقاط»، وسطر القاعدة «والرصيد لا ينزل تحت 0»`, await text(presenter, '#wWho') === `${who} · −1 · ${label}` && (await text(presenter, '#wMid .rule')).includes('لا ينزل تحت 0'));
    }
    if (effect === 'gift') {
      check(`${tag}+3: «[الاسم] · +3» و«خانة حظ»، والحدّ عنده، ورقمه يزيد`, sc[sp] === 5 && await text(audience, '#vtext') === `${who} · +3` && await text(audience, '#say') === 'خانة حظ' && side === sp
        && await text(audience, '#s' + sp) === '5');
      check(`${tag}المقدّم: «[الاسم] · +3 · هدية: +3 نقاط»`, await text(presenter, '#wWho') === `${who} · +3 · ${label}`);
    }
    if (effect === 'steal') {
      check(`${tag}3 من الخصم: «[الاسم] · +3» والسطر «[الخصم] · −3»، والحدّ عنده، والرقمان`, sc[sp] === 5 && sc[op] === 3 && await text(audience, '#vtext') === `${who} · +3`
        && await text(audience, '#say') === `${rival} · −3` && side === sp && await text(audience, '#s' + op) === '3');
      check(`${tag}المقدّم: «[الاسم] +3 · [الخصم] −3»`, await text(presenter, '#wWho') === `${who} +3 · ${rival} −3`);
      const body = await audience.evaluate(() => document.querySelector('.canvas').innerText);
      check(`${tag}لا كلمة «سرقة» على الجمهور`, !/سرقة/.test(body));
    }
    await audienceCheck(audience, `${tag}بعد الوقوف`);
    await presenterCheck(presenter, `${tag}بعد الوقوف`);
    if (!LONG) await stage.screenshot({ path: path.join(shots, `wheel-${effect}.png`) });
    else await stage.screenshot({ path: path.join(shots, `wheel-${effect}-long.png`) });
    if (!LONG) {
      await presenter.click('#wUndo'); await wait(900);
      const back = await saved(stage);
      check(`${tag}التراجع: قبل الدوران، والرصيد كما كان`, back.round.state.phase === 'ready' && back.round.scores[sp] === before[sp] && back.round.scores[op] === before[op]
        && await text(audience, '#s' + sp) === String(before[sp]));
      await click('#wCtl [data-act="spin"]');
      await audience.waitForSelector('.scr.q.show #letter.slot', { timeout: 9000 });
      await wait(1200);
      // الدورة الثانية للفريق الآخر على الخانة نفسها، ثم «إنهاء الشريط».
      await click('#wCtl [data-act="next"]');
      await audience.waitForSelector('.scr.whl.show');
      await click('#wCtl [data-act="spin"]');
      await audience.waitForSelector('.scr.q.show #letter.slot', { timeout: 9000 });
      await wait(1200);
      await click('#wCtl [data-act="finish"]');
      // خسارة: الأول 1 → 0 والثاني 4 → 1 · هدية: +3 لكلٍّ · خصم: يأخذ كلٌّ من الآخر 3، فلا يتغير شيء في المجموع.
      const d = { lose: { [sp]: -1, [op]: -3 }, gift: { [sp]: 3, [op]: 3 }, steal: { [sp]: 0, [op]: 0 } }[effect];
      const sign = n => (n < 0 ? '−' + -n : '+' + n);
      check(`${tag}نهاية العجلة: ما تغيّر في رصيد كل فريق («${sign(d[sp])}» و«${sign(d[op])}»)`, await text(audience, '#r' + sp) === sign(d[sp]) && await text(audience, '#r' + op) === sign(d[op]));
      await audienceCheck(audience, `${tag}نهاية العجلة`);
    }
    await context.close();
  }

  // ===== 2.2 بنافذة واحدة: «هدية» ثم «إنهاء الشريط» =====
  {
    const { context, stage, audience } = await open();
    await sharedToFace(audience, { names: ['الصقور', 'النجوم'], count: 'short', picks: ['ranking', 'letter'] });
    await cmd(audience, 'begin');
    await wait(600);
    const go = async c => { await cmd(audience, c); await wait(800); };
    await go('act:show');
    for (let k = 0; k < 2; k++) { await go('act:start:one'); await go('act:finish'); await go('act:commit'); await go('act:next'); }
    await stage.evaluate(r => { Math.random = () => r; }, RND.gift);
    await go('next');
    await go('act:spin');
    await audience.waitForSelector('.scr.q.show #letter.slot', { timeout: 9000 });
    await wait(1200);
    const near = await audience.$$eval('#near button', b => b.map(x => x.textContent.trim()).join('|'));
    const sp = (await saved(stage)).round.state.first;
    check('نافذة واحدة: «هدية» تُطبَّق فوراً (+3)، و«التالي · الدورة 2» وحده بجانب الشارات', near === 'التالي · الدورة 2' && (await saved(stage)).round.scores[sp] === 3);
    await audienceCheck(audience, 'نافذة واحدة · هدية');
    await stage.screenshot({ path: path.join(shots, 'wheel-gift-w1.png') });
    await context.close();
  }

  check('فحص التداخل والشبكة، ولا نص ممنوع على الجمهور', layoutOk);
  check('نافذة المقدّم بمقاساتها الثلاثة: لا تمرير، ولا نص أصغر من 32، ولا زر يفيض', presenterOk);
  check('لا أخطاء في الصفحات', errors.length === 0);
  await browser.close();
  process.exit(finish([...fails, ...errors]) ? 0 : 1);
})();
