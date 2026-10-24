// اختبار آلي لمرحلة «اللوحة والكشف» في الترتيب (5.6، design/ranking.md) بالنافذتين، في رابط المعاينة:
// الافتتاح، وظهور القائمة (العنوان وإشارته، والعشر برتبها، والفخاخ مخفية)، و«ابدأ» وعدّاد 15 ثانية، ونقر ما قاله الفريق فتنكشف خانته
// بلونه ونقاط رقمها، والتناوب، و«خطأ» بلا نقاط، والتراجع، وإعادة التحميل، ونهاية القائمة (تنكشف كلها) ونهاية الجولة،
// ولا اسم على الجمهور قبل أن يُكشف، وفحص التداخل في كل حالة، ونافذة المقدّم على ثلاثة مقاسات.
// ثم أطول محتوى (العنوان 32 وإشارته 31، وأعرض الأسماء، وأطول اسمين، ورقمان من ثلاث خانات) حتى تنكشف العشرة.
// الاستعمال: node tests/stage5-ranking-board.cjs [الرابط] [مجلد الصور]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, sharedToFace, beginTwo } = require('./helpers.cjs');

(async () => {
  const base = (process.argv[2] || 'http://localhost:8000/') + '?preview'; // الترتيب في DRAFTS حتى تكتمل ش5
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { check, finish } = reporter();
  const errors = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/ranking.json'), 'utf8'));
  const [EPL, STRESS] = fixture.lists;

  for (const LONGRUN of [false, true]) {
    const tag = LONGRUN ? 'الأطول · ' : '';
    const NAMES = LONGRUN ? ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'] : ['الصقور', 'النجوم'];
    // القائمة الأولى (السهلة) هي ما يُلعب في هذه المرحلة: الدوري، أو أطول المحتوى.
    const first = LONGRUN ? { ...STRESS, level: 'easy' } : EPL;
    const bank = { mode: 'ranking', lists: [first, { ...(LONGRUN ? EPL : STRESS), level: 'hard' }] };
    const items = first.items;
    const allNames = [...new Set(bank.lists.flatMap(l => l.items.flatMap(i => [i.name, ...(i.alts ?? [])])))];

    const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block' });
    await usePin(context);
    await context.route('**/content/packs/general/ranking.json', route => route.fulfill({ json: bank }));
    context.on('page', p => {
      p.on('pageerror', e => errors.push(e.message));
      p.on('console', m => m.type() === 'error' && !/content\/packs\/.+\.json/.test(m.location().url) && errors.push(m.text()));
    });
    const stage = await context.newPage();
    await stage.setViewportSize({ width: 1920, height: 1080 });
    await stage.goto(base);
    await stage.evaluate(() => localStorage.clear());
    await stage.reload();
    await unlock(stage);
    let audience = await stageFrame(stage);
    let presenter = null;
    const text = (page, sel) => page.textContent(sel).then(t => t.replace(/\s+/g, ' ').trim());
    const st = () => stage.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.state);
    const scores = () => stage.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.scores);

    let layoutOk = true, presenterOk = true, leak = false;
    const fails = [];
    // شاشة الجمهور: التداخل والشبكة، والعنوان سطر واحد بلا فيض، وكل اسم في خانته بلا فيض، ولا اسم إلا ما كُشف، ولا كلمة ممنوعة.
    const audienceCheck = async label => {
      const r = await audience.evaluate(() => window.__stageCheck());
      if (!r.ok) { layoutOk = false; fails.push(`${label}: ${r.problems.join('، ')}`); }
      const s = await st();
      const shownNames = s.phase === 'listend' ? items.map(i => i.name) : (s.got[s.index] ?? []).map(g => items[g.rank - 1].name);
      const body = await audience.evaluate(ns => { let t = document.querySelector('.canvas').innerText;
        for (const n of ns) t = t.split(n).join(''); return t; }, [...NAMES, ...shownNames]);
      if (/سرقة|سهل|متوسط|صعب|بفارق/.test(body)) { leak = true; fails.push(`${label}: نص ممنوع على الجمهور`); }
      const leaked = allNames.filter(n => [...n].length > 2 && body.includes(n) && !shownNames.some(x => x.includes(n)));
      if (leaked.length) { leak = true; fails.push(`${label}: على الجمهور ما لم يُكشف (${leaked.slice(0, 3).join('، ')})`); }
      const over = await audience.evaluate(() => [...document.querySelectorAll('.scr.rnk.show .title, .scr.rnk.show .sl > span')]
        .filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
      if (over.length) { layoutOk = false; fails.push(`${label}: يفيض (${over.join('، ')})`); }
    };
    const presenterCheck = async label => {
      const r = await presenter.evaluate(() => {
        const rem = parseFloat(getComputedStyle(document.documentElement).fontSize), problems = [];
        const vis = n => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden';
        for (const n of document.getElementById('app').querySelectorAll('*')) {
          if (!vis(n)) continue;
          if ([...n.childNodes].some(c => c.nodeType === 3 && c.textContent.trim())) {
            if (parseFloat(getComputedStyle(n).fontSize) < rem - .01) problems.push(`نص أصغر من 32: «${n.textContent.trim().slice(0, 16)}»`);
            if (/[٠-٩۰-۹]/.test(n.textContent)) problems.push('أرقام هندية');
            if (getComputedStyle(n).fontStyle !== 'normal') problems.push('ميل');
          }
          if (n.tagName === 'BUTTON' && n.getBoundingClientRect().height < 2 * rem - .5) problems.push(`زر أقصر من 64: «${n.textContent.trim()}»`);
          if (n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflow !== 'visible') problems.push(`يفيض: «${n.textContent.trim().slice(0, 16)}»`);
        }
        if (document.documentElement.scrollHeight > innerHeight + 1) problems.push(`أطول من النافذة (${document.documentElement.scrollHeight} من ${innerHeight})`);
        if (document.documentElement.scrollWidth > innerWidth + 1) problems.push('تمرير أفقي');
        return { ok: !problems.length, problems: [...new Set(problems)] };
      });
      if (!r.ok) { presenterOk = false; fails.push(`المقدّم ${label}: ${r.problems.join('، ')}`); }
    };
    const sizes = async label => {
      for (const [w, h] of [[1366, 768], [1280, 800], [1920, 1080]]) { await presenter.setViewportSize({ width: w, height: h }); await wait(250); await presenterCheck(`${label} ${w}`); }
      await presenter.setViewportSize({ width: 1366, height: 768 });
    };
    const both = async label => { await wait(900); await audienceCheck(tag + label); if (presenter) await sizes(tag + label); };
    const ctl = () => presenter.$$eval('#rCtl button', els => els.map(e => e.textContent.trim()).join(' | '));
    const side = () => audience.$eval('#canvas', c => (c.classList.contains('turn-1') ? 1 : c.classList.contains('turn-2') ? 2 : 0));
    const slots = () => audience.$$eval('#board .sl', els => els.map(e => ({ cls: e.className, b: e.querySelector('b')?.textContent ?? '', name: e.querySelector('span')?.textContent ?? '',
      hidden: getComputedStyle(e).visibility === 'hidden' })));
    const shot = async name => { await stage.screenshot({ path: `${shots}/s5-${LONGRUN ? 'long-' : ''}${name}.png` }); };
    const pick = async rank => { await presenter.click(`#rRef button[data-r="${rank}"]`); await wait(900); };
    const act = async id => { await presenter.click(`#rCtl [data-act="${id}"]`); await wait(900); };

    // 1. إلى المواجهة: الترتيب للجولة الأولى، و«ابدأ المباراة» بنافذتين.
    await audience.waitForSelector('[data-cmd="draw"]', { timeout: 6000 });
    await sharedToFace(audience, { names: NAMES, picks: ['ranking', 'letter'] });
    await wait(2700);
    check(tag + 'الترتيب يبدأ جولته في رابط المعاينة («ابدأ المباراة»)', await audience.isVisible('[data-cmd="begin"]'));
    presenter = await beginTwo(context, audience);
    await presenter.waitForFunction(() => document.getElementById('status').dataset.on === 'true', null, { timeout: 6000 });
    if (LONGRUN) await stage.evaluate(() => { const m = JSON.parse(localStorage.getItem('big-challenge.match')); m.scores = m.round.scores = { 1: 188, 2: 176 }; localStorage.setItem('big-challenge.match', JSON.stringify(m)); });

    // 2. الافتتاح
    await audience.waitForSelector('.scr.show[data-s="intro"]', { timeout: 5000 });
    if (!LONGRUN) {
      check('الجمهور: «اذكروا ما في القائمة: كلما بعُد عن الأول زادت نقاطه» و«قائمتان، وخلف كل قائمة ثلاثة فخاخ»، والحدّ في المنتصف',
        (await text(audience, '#rule')) === 'اذكروا ما في القائمة: كلما بعُد عن الأول زادت نقاطه' && (await text(audience, '#starter')) === 'قائمتان، وخلف كل قائمة ثلاثة فخاخ' && (await side()) === 0);
      check('الجمهور: شارة «الترتيب» و«الجولة 1 من 2»', (await text(audience, '#mode')) === 'الترتيب' && (await text(audience, '#b1')) === 'الجولة 1 من 2');
      check('المقدّم: «اعرض القائمة 1»', (await text(presenter, '#showQ')) === 'اعرض القائمة 1');
      await both('الافتتاح');
      await shot('intro');
    }

    // 3. ظهور القائمة
    await presenter.click('#showQ');
    await audience.waitForSelector('.scr.show[data-s="rnk"]');
    if (LONGRUN) { await presenter.reload(); await stage.reload(); await unlock(stage).catch(() => {}); audience = await stageFrame(stage); await presenter.waitForSelector('#app:not([hidden])'); }
    await wait(900);
    let s = await st();
    const starter = s.team;
    const [main, sub] = first.title.split(' · ');
    check(tag + `الجمهور: العنوان «${main}» سطراً واحداً، وإشارته بجانبه`, (await text(audience, '#rtitle')) === main && (await text(audience, '#rsub')) === sub
      && await audience.$eval('#rtitle', e => e.getClientRects().length === 1 && e.scrollWidth <= e.clientWidth + 1));
    let sl = await slots();
    check(tag + 'الجمهور: عشر خانات برتبها 1–10 بلا أسماء، والفخاخ الثلاث مخفية بلا رتبة', sl.length === 13 && sl.slice(0, 10).every((x, i) => x.b === String(i + 1) && !x.name && !x.hidden)
      && sl.slice(10).every(x => x.hidden && !x.b && !x.name));
    check(tag + 'الجمهور: «القائمة 1 من 2»، والحدّ يكتسح لصاحب الدور', (await text(audience, '#b1')) === 'القائمة 1 من 2' && (await side()) === starter);
    check(tag + 'الجمهور: الأعمدة 1–5 يميناً ثم 6–10 ثم الفخاخ', await audience.$$eval('#board .sl', els => {
      const r = els.map(e => e.getBoundingClientRect()); return r[0].left > r[5].left && r[5].left > r[10].left && Math.abs(r[0].top - r[5].top) < 1 && r[4].top > r[0].top; }));
    check(tag + 'المقدّم: «الترتيب · القائمة 1 من 2»، والعنوان، والقائمة كلها (13) بصيغها للاطلاع', (await text(presenter, '#roundChip')) === 'الترتيب · القائمة 1 من 2'
      && (await text(presenter, '#rTitle')).startsWith(main) && (await presenter.$$('#rRef button')).length === 13 && await presenter.$eval('#rRef', e => e.classList.contains('view'))
      && await presenter.$$eval('#rRef button.trap', e => e.length) === 3 && await presenter.$$eval('#rRef small', e => e.length) === items.filter(i => i.alts?.length).length);
    check(tag + `المقدّم: «دور [صاحب الدور]» و«ابدأ العدّاد · 15 ثانية» و«أنهِ القائمة» (${await ctl()})`, (await text(presenter, '#rWho')) === `دور ${NAMES[starter - 1]}`
      && (await ctl()) === 'ابدأ العدّاد · 15 ثانية | أنهِ القائمة');
    await both('ظهور القائمة');
    await shot('read');

    // 4. «ابدأ»: العدّاد يعمل لصاحب الدور، والقائمة تُنقر، و«خطأ» بعرض اللوحة.
    await act('start');
    check(tag + 'الجمهور: العدّاد يعمل في لوحة صاحب الدور', await audience.$eval('#canvas', c => c.classList.contains('running')) && (await side()) === starter);
    check(tag + `المقدّم: القائمة تُنقر، و«خطأ · ليس في القائمة أو مكرر» (${await ctl()})`, !(await presenter.$eval('#rRef', e => e.classList.contains('view')))
      && (await ctl()) === 'خطأ · ليس في القائمة أو مكرر' && /^0:1\d$/.test(await text(presenter, '#rState')));
    await both('العدّاد');
    await shot('run');

    // 5. ما قاله الفريق: المركز 7.
    const before = await scores();
    await pick(7);
    sl = await slots();
    check(tag + `الجمهور: الخانة 7 تنكشف بلون صاحب الدور واسمها «${items[6].name}»`, sl[6].cls.includes('t' + starter) && sl[6].name === items[6].name && sl[6].cls.includes('new'));
    check(tag + 'الرصيد +7', (await scores())[starter] === before[starter] + 7);
    check(tag + 'مربع الإعلان: «[الاسم] · +7» و«المركز 7»، والحدّ عند من أصاب', (await text(audience, '#vtext')) === `${NAMES[starter - 1]} · +7` && (await text(audience, '#say')) === 'المركز 7'
      && !(await audience.$eval('#box', e => e.hidden || e.classList.contains('bare'))) && (await side()) === starter);
    const opp = starter === 1 ? 2 : 1;
    check(tag + `المقدّم: «[الاسم] · +7 · المركز 7» و«التالي · دور [الخصم]» و«أنهِ القائمة» (${await ctl()})`, (await text(presenter, '#rWho')) === `${NAMES[starter - 1]} · +7 · المركز 7`
      && (await ctl()) === `التالي · دور ${NAMES[opp - 1]} | أنهِ القائمة` && await presenter.$eval('#rRef button[data-r="7"]', (e, t) => e.classList.contains('t' + t), starter));
    await both('أصاب');
    await shot('right');

    if (!LONGRUN) {
      // 6. التالي: دور الخصم وعدّاده فوراً. ثم «خطأ»: لا نقاط.
      await act('next');
      check('«التالي»: دور الخصم والعدّاد يعمل فوراً', (await side()) === opp && await audience.$eval('#canvas', c => c.classList.contains('running')) && (await text(presenter, '#rWho')) === `دور ${NAMES[opp - 1]}`);
      check('المكشوف لا يُنقر ثانية', await presenter.$eval('#rRef button[data-r="7"]', e => getComputedStyle(e).pointerEvents === 'none'));
      await act('wrong');
      check('«خطأ»: «لا نقاط» و«لم تُكشف خانة»، والحدّ في المنتصف', (await text(audience, '#vtext')) === 'لا نقاط' && (await text(audience, '#say')) === 'لم تُكشف خانة' && (await side()) === 0
        && (await text(presenter, '#rWho')) === 'لا نقاط · لم تُكشف خانة');
      await both('لا نقاط');
      await shot('none');
      // 7. التراجع: يعود العدّاد للخصم.
      await presenter.click('#rUndo'); await wait(900);
      check('التراجع عن «خطأ»: يعود الدور للخصم والعدّاد', (await st()).phase === 'ask' && (await side()) === opp);
      await pick(2);
      // 8. إعادة تحميل الشاشة والمقدّم: الخانتان كما هما.
      await stage.reload(); await unlock(stage).catch(() => {});
      audience = await stageFrame(stage);
      await presenter.reload(); await presenter.waitForSelector('#app:not([hidden])', { timeout: 10000 });
      await wait(1200);
      sl = await slots();
      check('إعادة تحميل النافذتين: الخانتان 2 و7 بلونيهما وأسمائهما', sl[1].cls.includes('t' + opp) && sl[1].name === items[1].name && sl[6].name === items[6].name
        && await presenter.$eval('#rRef button[data-r="2"]', (e, t) => e.classList.contains('t' + t), opp));
      // 9. «أنهِ القائمة»: تنكشف كلها والفخاخ، بلا مربع: «كُشف 2 من 10».
      await act('finish');
      sl = await slots();
      check('نهاية القائمة: الثلاث عشرة بأسمائها، والفخاخ ظاهرة بخصمها، وما لم يُذكر .left', sl.every((x, i) => x.name === items[i].name && !x.hidden)
        && sl.slice(10).map(x => x.b).join(',') === '−3,−2,−1' && sl[0].cls.includes('left') && !sl[6].cls.includes('left'));
      check('نهاية القائمة: «كُشف 2 من 10» بلا مربع، والحدّ في المنتصف', (await text(audience, '#next')) === 'كُشف 2 من 10' && await audience.$eval('#box', e => e.classList.contains('bare'))
        && (await side()) === 0 && await audience.$eval('#rnk', e => e.classList.contains('reveal')));
      check(`المقدّم: «انتهت القائمة 1 · كُشف 2 من 10» و«إنهاء الجولة» (${await ctl()})`, (await text(presenter, '#rWho')) === 'انتهت القائمة 1 · كُشف 2 من 10' && (await ctl()) === 'إنهاء الجولة');
      await both('نهاية القائمة');
      await shot('listend');
      await act('next');
      check('نهاية الجولة: الحصيلتان', await audience.isVisible('.scr.show[data-s="end"]') && (await text(audience, `#r${starter}`)) === '+7' && (await text(audience, `#r${opp}`)) === '+2');
      await both('نهاية الجولة');
    } else {
      // أطول محتوى: تنكشف العشرة كلها بالتناوب، ثم نهاية القائمة (أسوأ حالة للون في هذه المرحلة).
      for (const r of [1, 2, 3, 4, 5, 6, 8, 9, 10]) { await act('next'); await pick(r); if (r === 9) await both('تسع خانات'); }
      check('الأطول · انكشفت العشرة: «أنهِ القائمة» وحدها', (await ctl()) === 'أنهِ القائمة');
      await shot('full');
      await act('finish');
      check('الأطول · نهاية القائمة: «كُشف 10 من 10»', (await text(audience, '#next')) === 'كُشف 10 من 10');
      await both('نهاية القائمة بالعشرة');
      await shot('allend');
      await presenter.screenshot({ path: `${shots}/s5-long-presenter-allend.png` });
    }

    check(tag + `فحص التداخل والشبكة سليم في كل حالة${layoutOk ? '' : ` (${fails.filter(f => !f.startsWith('المقدّم')).join(' · ')})`}`, layoutOk);
    check(tag + 'لا اسم على الجمهور قبل أن يُكشف، ولا كلمة ممنوعة', !leak);
    check(tag + `المقدّم على 1366 و1280 و1920: بلا تمرير ولا فيض ولا نص أصغر من 32${presenterOk ? '' : ` (${fails.filter(f => f.startsWith('المقدّم')).slice(0, 4).join(' · ')})`}`, presenterOk);
    await context.close();
  }
  check(`لا أخطاء في الصفحات${errors.length ? ` (${errors.slice(0, 3).join(' | ')})` : ''}`, errors.length === 0);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})();
