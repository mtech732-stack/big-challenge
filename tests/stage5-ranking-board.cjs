// اختبار آلي للوحة الترتيب بالنافذتين والتحكيم المباشر (5.6، 1.7، design/ranking.md، design/s8.md 3)، في رابط المعاينة:
// الافتتاح، وظهور القائمة بالباركود ثم إخفاؤه، والعشر برتبها والفخاخ 11–13 ظاهرة الأرقام، و«ابدأ» وعدّاد 15 ثانية، ونقر ما قاله الفريق
// (في المقدّم أو على التلفاز) فتنكشف خانته بلونه ونقاط رقمها، ثم لحظة والدور للخصم تلقائياً، و«خطأ» ثم لون الدور التالي، والتراجع،
// وإعادة التحميل، والفخ بخصم رقمه، ونهاية القائمة (تنكشف كلها) ووقتها دقيقتان ونصف، ونهاية الجولة،
// ولا اسم على الجمهور قبل أن يُكشف، وفحص التداخل في كل حالة، ونافذة المقدّم على ثلاثة مقاسات.
// ثم أطول محتوى (العنوان 32 وإشارته 31، وأعرض الأسماء، وأطول اسمين، ورقمان من ثلاث خانات) حتى تنكشف العشرة.
// الاستعمال: node tests/stage5-ranking-board.cjs [الرابط] [مجلد الصور]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, sharedToFace, beginTwo } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/'; // الرابط العادي: الترتيب في MODES منذ نهاية ش5
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
      const its = bank.lists[s.index].items, shownNames = s.phase === 'listend' ? its.map(i => i.name) : (s.got[s.index] ?? []).map(g => its[g.rank - 1].name);
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

    // 3. ظهور القائمة: الباركود على التلفاز أولاً (1.7)، ثم يُخفيه المقدّم.
    await presenter.click('#showQ');
    await audience.waitForSelector('.scr.show[data-s="rnk"]');
    if (LONGRUN) { await presenter.reload(); await stage.reload(); await unlock(stage).catch(() => {}); audience = await stageFrame(stage); await presenter.waitForSelector('#app:not([hidden])'); }
    await wait(900);
    check(tag + 'ظهور القائمة: الباركود على التلفاز، و«أخفِ الباركود» في المقدّم', await audience.$eval('#canvas', c => c.classList.contains('qr')) && (await text(presenter, '#rQr')) === 'أخفِ الباركود');
    await presenter.click('#rQr'); await wait(900);
    check(tag + 'أُخفي الباركود: «الباركود» يعيده', !(await audience.$eval('#canvas', c => c.classList.contains('qr'))) && (await text(presenter, '#rQr')) === 'الباركود');
    let s = await st();
    const starter = s.team, opp = starter === 1 ? 2 : 1;
    const [main, sub] = first.title.split(' · ');
    const ranges = sub.match(/\d+[–:]\d+/g) ?? [];
    check(tag + `المقدّم: إشارة العنوان «${sub}» بسنتيها في ترتيبهما`, ranges.length > 0 && await presenter.$eval('#rTitle small', (e, rs) => {
      const iso = [...e.querySelectorAll('.ltr')].map(x => x.textContent); return rs.every(r => iso.includes(r)); }, ranges));
    let sl = await slots();
    check(tag + `الجمهور: العنوان «${main}» سطراً واحداً، وإشارته بجانبه`, (await text(audience, '#rtitle')) === main && (await text(audience, '#rsub')) === sub);
    check(tag + 'الجمهور: ثلاث عشرة خانة بأرقامها بلا أسماء، والفخاخ 11–13 ظاهرة (1.7)', sl.length === 13 && sl.every((x, i) => x.b === String(i + 1) && !x.name && !x.hidden)
      && sl.slice(10).every(x => x.cls.includes('trap')));
    check(tag + 'الجمهور: «القائمة 1 من 2»، والحدّ لصاحب الدور', (await text(audience, '#b1')) === 'القائمة 1 من 2' && (await side()) === starter);
    check(tag + `المقدّم: «دور [صاحب الدور]» و«ابدأ العدّاد» و«أنهِ القائمة» (${await ctl()})`, (await text(presenter, '#rWho')) === `دور ${NAMES[starter - 1]}`
      && (await ctl()) === 'ابدأ العدّاد | أنهِ القائمة' && await presenter.$eval('#rRef', e => e.classList.contains('view')));
    check(tag + 'والخانات لا تُنقر على التلفاز قبل «ابدأ»', !(await audience.$eval('#rnk', e => e.classList.contains('judge'))));
    await both('ظهور القائمة');
    await shot('read');

    // 4. «ابدأ»: العدّاد لصاحب الدور، والقائمة تُنقر في المقدّم وعلى التلفاز.
    await act('start');
    check(tag + 'الجمهور: العدّاد يعمل في لوحة صاحب الدور، والتلفاز بنافذتين بلا نقر (design/s8.md 3.3)', await audience.$eval('#canvas', c => c.classList.contains('running')) && (await side()) === starter
      && !(await audience.$eval('#rnk', e => e.classList.contains('judge'))));
    check(tag + `المقدّم: القائمة تُنقر، و«خطأ · ليس في القائمة أو مكرر» و«أنهِ القائمة» (${await ctl()})`, !(await presenter.$eval('#rRef', e => e.classList.contains('view')))
      && (await ctl()) === 'خطأ · ليس في القائمة أو مكرر | أنهِ القائمة' && /^0:1\d$/.test(await text(presenter, '#rState')));
    await both('العدّاد');
    await shot('run');

    // 5. ما قاله الفريق: المركز 7 من المقدّم. لحظة الإصابة، ثم الدور للخصم وحده بعدّاده.
    const before = await scores();
    await presenter.click('#rRef button[data-r="7"]'); await wait(300);
    sl = await slots();
    check(tag + `الجمهور: الخانة 7 تنكشف بلون صاحب الدور واسمها «${items[6].name}»`, sl[6].cls.includes('t' + starter) && sl[6].name === items[6].name && sl[6].cls.includes('new'));
    check(tag + 'الرصيد +7', (await scores())[starter] === before[starter] + 7);
    check(tag + 'مربع الإعلان: «[الاسم] · +7» و«المركز 7»، والحدّ عند من أصاب، ولا أزرار في المقدّم', (await text(audience, '#vtext')) === `${NAMES[starter - 1]} · +7` && (await text(audience, '#say')) === 'المركز 7'
      && (await side()) === starter && (await ctl()) === '' && (await text(presenter, '#rWho')) === `${NAMES[starter - 1]} · +7 · المركز 7`);
    await stage.screenshot({ path: `${shots}/s5-${LONGRUN ? 'long-' : ''}hit.png` });
    await wait(1600);
    check(tag + 'بعد اللحظة: دور الخصم بعدّاده، تلقائياً', (await st()).phase === 'ask' && (await st()).team === opp && (await side()) === opp
      && await audience.$eval('#canvas', c => c.classList.contains('running')) && (await text(presenter, '#rWho')) === `دور ${NAMES[opp - 1]}`);
    check(tag + 'المكشوف لا يُنقر ثانية', await presenter.$eval('#rRef button[data-r="7"]', e => getComputedStyle(e).pointerEvents === 'none'));
    await both('بعد الإصابة');

    if (!LONGRUN) {
      // 6. «خطأ»: لا نقاط، ثم يختار المقدّم لون الدور التالي.
      await act('wrong');
      check('«خطأ»: «لا نقاط» و«لم تُكشف خانة»، والحدّ في المنتصف، والعدّاد يقف', (await text(audience, '#vtext')) === 'لا نقاط' && (await text(audience, '#say')) === 'لم تُكشف خانة' && (await side()) === 0
        && !(await audience.$eval('#canvas', c => c.classList.contains('running'))));
      check(`المقدّم: «لا نقاط · لم تُكشف خانة» و«الدور: [الاسم]» بلوني الفريقين (${await ctl()})`, (await text(presenter, '#rWho')) === 'لا نقاط · لم تُكشف خانة'
        && (await ctl()) === `الدور: ${NAMES[0]} | الدور: ${NAMES[1]}` && await presenter.$eval('#rCtl .turn.t1', b => getComputedStyle(b).backgroundColor) !== await presenter.$eval('#rCtl .turn.t2', b => getComputedStyle(b).backgroundColor));
      check('السرقة: لا كلمة «سرقة» على التلفاز', !(await audience.$eval('#canvas', c => c.innerText)).includes('سرق'));
      await both('خطأ');
      await shot('wrong');
      await presenter.screenshot({ path: `${shots}/s5-presenter-wrong.png` });
      // 7. التراجع عن «خطأ»: يعود الدور والعدّاد. ثم «خطأ» ولون الخصم نفسه (من أخطأ)، فيجيب ثانية.
      await presenter.click('#rUndo'); await wait(900);
      check('التراجع عن «خطأ»: يعود الدور لمن أخطأ وعدّاده', (await st()).phase === 'ask' && (await side()) === opp && await audience.$eval('#canvas', c => c.classList.contains('running')));
      await act('wrong'); await act('turn:' + opp);
      check('اختار المقدّم لون من أخطأ: الدور له بعدّاده', (await st()).phase === 'ask' && (await st()).team === opp && (await side()) === opp);
      // 8. الخانة 2 للخصم.
      await presenter.click('#rRef button[data-r="2"]'); await wait(300);
      sl = await slots();
      check('الخانة 2: تنكشف بلون الخصم، +2', sl[1].cls.includes('t' + opp) && sl[1].name === items[1].name && (await scores())[opp] === 2);
      await wait(1600);
      check('ثم الدور لصاحب البداية', (await st()).phase === 'ask' && (await st()).team === starter);
      // 9. إعادة تحميل الشاشة والمقدّم: الخانتان كما هما.
      await stage.reload(); await unlock(stage).catch(() => {});
      audience = await stageFrame(stage);
      await presenter.reload(); await presenter.waitForSelector('#app:not([hidden])', { timeout: 10000 });
      await wait(1200);
      sl = await slots();
      check('إعادة تحميل النافذتين: الخانتان 2 و7 بلونيهما وأسمائهما', sl[1].cls.includes('t' + opp) && sl[1].name === items[1].name && sl[6].name === items[6].name
        && await presenter.$eval('#rRef button[data-r="2"]', (e, t) => e.classList.contains('t' + t), opp));
      // 10. الفخ: صاحب الدور (رصيده 7) يذكر عنصر المركز 12، فيُخصم منه 7 (لا ينزل تحت الصفر، والخصم 12).
      const was = (await scores())[starter];
      // تُوقف ساعة المقدّم (هي التي ترسل «turn» بعد 1.2 ثانية)، فتبقى لحظة الفخ حتى تُفحص إشارة الخصم وتُصوَّر.
      await presenter.evaluate(() => { const real = Date.now, t = real(); window.__realNow = real; Date.now = () => t; });
      await presenter.click('#rRef button[data-r="12"]'); await wait(300);
      sl = await slots();
      check('الفخ: خانة 12 بلون من وقع فيه واسمها وخصمها «−12»، والفخان الآخران بأرقامهما بلا اسم', sl[11].cls.includes('t' + starter) && sl[11].name === items[11].name && sl[11].b === '−12'
        && !sl[10].name && !sl[12].name && sl[10].b === '11' && sl[11].cls.includes('new'));
      check(`الفخ: الرصيد ${was} ← 0، ومربع الإعلان «[الاسم] · −${was}» و«فخّ المركز 12»، والحدّ في المنتصف`, (await scores())[starter] === 0
        && (await text(audience, '#vtext')) === `${NAMES[starter - 1]} · −${was}` && (await text(audience, '#say')) === 'فخّ المركز 12' && (await side()) === 0);
      check(`المقدّم: «[الاسم] · −${was} · فخّ المركز 12»، والفخ بلونه (${await text(presenter, '#rWho')})`, (await text(presenter, '#rWho')) === `${NAMES[starter - 1]} · −${was} · فخّ المركز 12`
        && await presenter.$eval('#rRef button[data-r="12"]', (e, t) => e.classList.contains('t' + t), starter));
      // الإشارة يسار الرقم كما تُرسم (تقرير المعاين ش5، 34: «2-»). مواضع الحروف (Range) لا تكفي، فتُقرأ صورة العازل نفسه:
      // أول عمود داكن من اليسار في وسط السطر وحده (شرطة) لا في أعلاه (رقم).
      const minusLeft = async (page, sel) => {
        const el = await page.evaluateHandle(s => [...document.querySelectorAll(s + ' .ltr')].find(e => /−\d/.test(e.textContent)), sel);
        if (!(await el.evaluate(e => !!e))) return false;
        const png = (await el.asElement().screenshot()).toString('base64');
        return page.evaluate(async src => {
          const img = new Image(); img.src = 'data:image/png;base64,' + src; await img.decode();
          const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const g = c.getContext('2d'); g.drawImage(img, 0, 0);
          const d = g.getImageData(0, 0, c.width, c.height).data, bg = [...d.slice(0, 3)];
          const ink = (x, y) => { const k = (y * c.width + x) * 4; return Math.abs(d[k] - bg[0]) + Math.abs(d[k + 1] - bg[1]) + Math.abs(d[k + 2] - bg[2]) > 200; };
          for (let x = 0; x < c.width; x++) { const ys = []; for (let y = 0; y < c.height; y++) if (ink(x, y)) ys.push(y); if (ys.length) return Math.min(...ys) > c.height * 0.35; }
          return false; }, png); };
      check('الخصم بإشارته يسار الرقم كما يُرسم: في سطر الحالة بالمقدّم، وفي مربع الإعلان', await minusLeft(presenter, '#rWho') && await minusLeft(audience, '#vtext'));
      await both('فخ');
      await shot('trap');
      await presenter.screenshot({ path: `${shots}/s5-presenter-trap.png` });
      await presenter.evaluate(() => { Date.now = window.__realNow; });
      await wait(1600);
      check('ثم الدور للخصم', (await st()).phase === 'ask' && (await st()).team === opp);
      // 11. «أنهِ القائمة»: تنكشف كلها والفخاخ، بلا مربع: «كُشف 2 من 10».
      await act('finish');
      sl = await slots();
      check('نهاية القائمة: الثلاث عشرة بأسمائها، والفخاخ بأرقامها', sl.every((x, i) => x.name === items[i].name && !x.hidden));
      check('نهاية القائمة: «كُشف 2 من 10» بلا مربع، والحدّ في المنتصف', (await text(audience, '#next')) === 'كُشف 2 من 10' && await audience.$eval('#box', e => e.classList.contains('bare'))
        && (await side()) === 0);
      check(`المقدّم: «انتهت القائمة 1 · كُشف 2 من 10» و«القائمة 2» (${await ctl()})`, (await text(presenter, '#rWho')) === 'انتهت القائمة 1 · كُشف 2 من 10' && (await ctl()) === 'القائمة 2');
      check('نهاية القائمة: لا وقت للقائمة على الشاشتين', !(await audience.$('.scr.rnk.show #rclock')) && await presenter.$eval('#rClock', e => e.hidden));
      await both('نهاية القائمة');
      await shot('listend');
      // 12. القائمة 2: يبدؤها الفريق الآخر، والباركود يعود، ووقتها 2:30 على الشاشتين، ويعدّ تنازلياً من «ابدأ».
      await act('next');
      let s2 = await st();
      check('القائمة 2: الباركود ظاهر من جديد', await audience.$eval('#canvas', c => c.classList.contains('qr')));
      await presenter.click('#rQr'); await wait(900);
      sl = await slots();
      check(`القائمة 2: يبدؤها الخصم، و«القائمة 2 من 2»، ولا خانة مكشوفة (${await text(audience, '#b1')})`, s2.index === 1 && s2.phase === 'read' && s2.team === opp
        && (await text(audience, '#b1')) === 'القائمة 2 من 2' && sl.every(x => !x.name) && (await side()) === opp);
      check(`وقت القائمة 2:30 قبل «ابدأ» على التلفاز وفي رأس المقدّم (${await text(audience, '#rclock b')} · ${await text(presenter, '#rClockV')})`, (await text(audience, '#rclock b')) === '2:30'
        && (await text(presenter, '#rClockV')) === '2:30' && !(await presenter.$eval('#rClock', e => e.hidden)));
      await both('القائمة 2');
      await shot('list2');
      await act('start'); await wait(2200);
      check(`بعد «ابدأ» يعدّ تنازلياً على الشاشتين (${await text(audience, '#rclock b')} · ${await text(presenter, '#rClockV')})`, /^2:2[5-8]$/.test(await text(audience, '#rclock b'))
        && /^2:2[5-8]$/.test(await text(presenter, '#rClockV')));
      await both('وقت القائمة يعدّ');
      // 13. انقضاء الدقيقتين ونصف (بتقديم ساعة المقدّم): تنتهي القائمة بنفسها، وتنكشف، و«انتهى وقت القائمة».
      await presenter.evaluate(() => { const real = Date.now; Date.now = () => real() + 150000; });
      await wait(1200);
      s2 = await st();
      check(`انتهى وقت القائمة: نهاية القائمة بنفسها، وكلها مكشوفة (${s2.phase})`, s2.phase === 'listend' && s2.timeup && (await slots()).every((x, i) => x.name === bank.lists[1].items[i].name));
      check(`«انتهى وقت القائمة» في مربع الجمهور وسطر المقدّم، و«إنهاء الجولة» (${await text(audience, '#next')} · ${await text(presenter, '#rWho')})`,
        (await audience.$eval('#next', e => e.innerText)) === 'انتهى وقت القائمة\nكُشف 0 من 10' && await audience.$eval('#box', b => b.classList.contains('two') && !b.classList.contains('wrap'))
        && await audience.$eval('#next', e => { const r = e.getBoundingClientRect(), b = e.closest('.box').getBoundingClientRect(); return r.top >= b.top && r.bottom <= b.bottom && e.scrollWidth <= e.clientWidth + 1; }) && (await text(presenter, '#rWho')) === 'انتهى وقت القائمة 2 · كُشف 0 من 10' && (await ctl()) === 'إنهاء الجولة');
      await both('انتهى وقت القائمة');
      await shot('timeup');
      await act('next');
      check('نهاية الجولة: الحصيلتان', await audience.isVisible('.scr.show[data-s="end"]') && ['0', '+0'].includes(await text(audience, `#r${starter}`)) && (await text(audience, `#r${opp}`)) === '+2');
      await both('نهاية الجولة');
    } else {
      // أطول محتوى: انتهاء وقت الإجابة ينقل الدور، ثم فخ باسمه الأطول، ثم تنكشف العشرة كلها بالتناوب (أسوأ حالة للون).
      await wait(15800);
      check(`الأطول · انتهى الوقت: الدور لصاحب البداية بعدّاده (${await text(presenter, '#rState')})`, (await st()).phase === 'ask' && (await st()).team === starter && /^0:1\d$/.test(await text(presenter, '#rState')));
      await presenter.click('#rRef button[data-r="11"]'); await wait(300);
      check('الأطول · الفخ: خانة 11 ظاهرة باسمها، وحكم المقدّم بخصمه', (await slots())[10].name === items[10].name && (await text(presenter, '#rWho')).endsWith('· فخّ المركز 11'));
      await both('فخ'); await shot('trap');
      for (const r of [1, 2, 3, 4, 5, 6, 8, 9, 10]) { await wait(1500); await presenter.click(`#rRef button[data-r="${r}"]`); await wait(300); if (r === 9) await both('تسع خانات'); }
      await wait(1600);
      check('الأطول · انكشفت العشرة: نهاية القائمة بنفسها، و«كُشف 10 من 10»', (await st()).phase === 'listend' && (await text(audience, '#next')) === 'كُشف 10 من 10');
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
