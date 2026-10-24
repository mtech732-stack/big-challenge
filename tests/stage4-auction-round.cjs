// اختبار آلي لمرحلة «المزايدة» في المزاد (ش4، design/auction.md) بالنافذتين وبالنافذة الواحدة، في رابط المعاينة:
// الافتتاح، والموضوع، و«زايد» بـ «−» و«+»، وشارات المزايدة بألوان أصحابها والأحدث أكبرها، وسقوط الأقدم، والانسحاب والالتزام،
// والتراجع، وإعادة التحميل، ولا قائمة ولا طولها على الجمهور، وفحص التداخل في كل حالة، ونافذة المقدّم على ثلاثة مقاسات.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace, beginTwo } = require('./helpers.cjs');

(async () => {
  const base = (process.argv[2] || 'http://localhost:8000/') + '?preview';
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { check, finish } = reporter();
  const errors = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const LONG = ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'];

  // بنك تجريبي بأطول محتوى (design/auction.md 3): الموضوع السهل 32 حرفاً بقائمة أفريقيا (54)، والباقي من البنك.
  const real = JSON.parse(fs.readFileSync(path.join(__dirname, '../content/packs/general/auction.json'), 'utf8'));
  const africa = real.topics.find(t => t.items.length > 30);
  const TOPIC = 'أشياء تجدها في حقيبة طالب مدرسة';
  const bank = { mode: 'auction', topics: [{ ...africa, id: 'test-auction-long', level: 'easy', topic: TOPIC }, ...real.topics.filter(t => t.level !== 'easy')] };
  const names = bank.topics[0].items.flatMap(i => [i.name, ...(i.alts ?? [])]);

  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block' });
  await usePin(context);
  await context.route('**/content/packs/general/auction.json', route => route.fulfill({ json: bank }));
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

  let layoutOk = true, presenterOk = true, leak = false;
  const fails = [];
  // شاشة الجمهور: التداخل والشبكة، ولا عنصر من القائمة ولا طولها ولا المستوى ولا «انسحب» في نص الشاشة (عدا الأزرار في النافذة الواحدة).
  const audienceCheck = async label => {
    const r = await audience.evaluate(() => window.__stageCheck());
    if (!r.ok) { layoutOk = false; fails.push(`${label}: ${r.problems.join('، ')}`); }
    const s = await st();
    const body = await audience.evaluate(ns => { let t = document.querySelector('.canvas').innerText;
      for (const b of document.querySelectorAll('.cbtn')) t = t.replace(b.innerText, '');
      t = t.replace(document.getElementById('topic').innerText, '');
      for (const n of ns) t = t.split(n).join(''); return t; }, LONG);
    if (/سرقة|سهل|متوسط|صعب|بفارق|انسحب|في القائمة|عنصر/.test(body)) { leak = true; fails.push(`${label}: نص ممنوع على الجمهور`); }
    if (names.some(n => body.includes(n))) { leak = true; fails.push(`${label}: عنصر من القائمة على الجمهور`); }
    if (s.phase === 'bid' && body.includes(String(s.topics[0].items.length))) { leak = true; fails.push(`${label}: طول القائمة على الجمهور`); }
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
        // خانات القائمة الطويلة 1.5rem (design/auction.md 5)، وغيرها من الأزرار 64 فأكثر.
        if (n.tagName === 'BUTTON' && !n.closest('.ref') && n.getBoundingClientRect().height < 2 * rem - .5) problems.push(`زر أقصر من 64: «${n.textContent.trim()}»`);
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
  const both = async label => { await wait(900); await audienceCheck(label); if (presenter) await sizes(label); };
  const bids = page => page.$$eval('#bids .bid', els => els.map(e => ({ n: e.textContent.trim(), t: e.classList.contains('t1') ? 1 : 2, top: e.classList.contains('top'), h: e.offsetHeight })));

  // 1. إلى المواجهة: المزاد للجولة الأولى، و«ابدأ المباراة» بنافذتين.
  await audience.waitForSelector('[data-cmd="draw"]', { timeout: 6000 });
  await sharedToFace(audience, { names: LONG, picks: ['auction', 'letter'] });
  await wait(2700);
  check('المعاينة: المزاد يبدأ جولته («ابدأ المباراة»)، لا «تخطَّ»', await audience.isVisible('[data-cmd="begin"]'));
  presenter = await beginTwo(context, audience);
  await presenter.waitForFunction(() => document.getElementById('status').dataset.on === 'true', null, { timeout: 6000 });

  // 2. الافتتاح
  await audience.waitForSelector('.scr.show[data-s="intro"]', { timeout: 5000 });
  let s = await st();
  const opener = s.topics[0].opener;
  const other = t => (t === 1 ? 2 : 1);
  check('الجمهور: «زايدوا على ما تقدرون على ذكره، ثم أوفوا» و«يفتتح المزايدة [الاسم]»', (await text(audience, '#rule')) === 'زايدوا على ما تقدرون على ذكره، ثم أوفوا'
    && (await text(audience, '#starter')) === `يفتتح المزايدة ${LONG[opener - 1]}`);
  check('الجمهور: شارة «المزاد» و«الجولة 1 من 2»', (await text(audience, '#mode')) === 'المزاد' && (await text(audience, '#b1')) === 'الجولة 1 من 2');
  check('المقدّم: «اعرض الموضوع 1» والافتتاح بالمفتتح', (await text(presenter, '#showQ')) === 'اعرض الموضوع 1' && (await text(presenter, '#introWho')).includes(`يفتتح المزايدة ${LONG[opener - 1]}`));
  await both('الافتتاح');

  // 3. الموضوع: الدور للمفتتح، ولا رقم بعد.
  await presenter.click('#showQ');
  await audience.waitForSelector('.scr.show[data-s="auc"]');
  await wait(600);
  check('الجمهور: الموضوع سطراً واحداً، و«الموضوع 1 من 3»، ولا عدّ ولا أرقام', (await text(audience, '#topic')) === TOPIC && (await text(audience, '#b1')) === 'الموضوع 1 من 3'
    && !(await audience.isVisible('#tally')) && (await bids(audience)).length === 0
    && await audience.$eval('#topic', e => e.scrollWidth <= e.clientWidth + 1 && e.getClientRects().length === 1));
  check('الجمهور: الحدّ عند المفتتح', await audience.$eval('#canvas', (c, t) => c.classList.contains('turn-' + t), opener));
  check('المقدّم: الرأس «المزاد · الموضوع 1 من 3» والموضوع وطول القائمة له وحده', (await text(presenter, '#roundChip')) === 'المزاد · الموضوع 1 من 3'
    && (await text(presenter, '#aTopic')) === TOPIC && (await text(presenter, '#aSize')) === `في القائمة ${bank.topics[0].items.length} عنصراً`);
  check('المقدّم: القائمة المرجعية أزرار للاطلاع، 12 عموداً (54)، والاسم وحده بلا صيغه في المزايدة', (await presenter.$$('#aRef button')).length === bank.topics[0].items.length
    && await presenter.$eval('#aRef', e => e.classList.contains('view') && e.classList.contains('dense') && getComputedStyle(e).gridTemplateColumns.split(' ').length === 12 && !e.querySelector('small')));
  check('المقدّم: «يفتتح المزايدة برقم» و«زايد · 5»، و«انسحب» معطّل في الافتتاح', (await text(presenter, '#aState')) === 'يفتتح المزايدة برقم'
    && (await text(presenter, '#aBid')) === 'زايد · 5' && await presenter.$eval('#aPass', e => e.disabled));
  await both('الموضوع');
  await stage.screenshot({ path: `${shots}/s4-open.png` });
  await presenter.screenshot({ path: `${shots}/s4-presenter-open.png` });

  // 4. «−» و«+» ثم «زايد»
  const plus = () => presenter.click('[data-offer="1"]'), minus = () => presenter.click('[data-offer="-1"]');
  await plus(); await plus(); await minus();
  check('«+» مرتين و«−» مرة: «زايد · 6»', (await text(presenter, '#aBid')) === 'زايد · 6');
  for (let i = 0; i < 8; i++) if (!(await presenter.$eval('[data-offer="-1"]', e => e.disabled))) await minus();
  check('«−» لا ينزل تحت 1 ثم يُعطَّل', (await text(presenter, '#aBid')) === 'زايد · 1' && await presenter.$eval('[data-offer="-1"]', e => e.disabled));
  for (let i = 0; i < 5; i++) await plus();
  check('لا يصل الرقم المقترح إلى الجمهور قبل «زايد»', (await bids(audience)).length === 0);
  await presenter.$eval('#aBid', e => e.click());
  // نقرة ثانية متأخرة (تقرير المعاين ش4، التعثّر 1): الزر نفسه صار زرّ الخصم، فتُهمل.
  const at = await presenter.$eval('#aBid', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await wait(150); await presenter.mouse.click(at.x, at.y);
  await wait(150); await presenter.mouse.click(at.x, at.y);
  await wait(100);
  let b = await bids(audience);
  check('نقرتان متأخرتان بالفأرة على «زايد» (0.15 و0.3 ثانية) لا تسجّلان رقماً للخصم', b.length === 1);
  check('زايد المفتتح بـ 6: شارة بلونه، وهي الأحدث الأكبر (136)', b.length === 1 && b[0].n === '6' && b[0].t === opener && b[0].top && b[0].h === 136);
  check('الجمهور: الحدّ يكتسح للخصم، ودوره', await audience.$eval('#canvas', (c, t) => c.classList.contains('turn-' + t), other(opener)) && await audience.$eval('#p' + other(opener), e => e.classList.contains('on')));
  check('الرقم الجديد يدخل بحركته', await audience.$eval('#bids .bid.top', e => getComputedStyle(e).animationName === 'bidin'));
  await wait(800);
  check('المقدّم: «يزايد على 6 أو ينسحب» و«زايد · 7»، و«−» معطّل عند 7، و«انسحب» مفعّل', (await text(presenter, '#aState')) === 'يزايد على 6 أو ينسحب'
    && (await text(presenter, '#aBid')) === 'زايد · 7' && await presenter.$eval('[data-offer="-1"]', e => e.disabled) && !(await presenter.$eval('#aPass', e => e.disabled)));
  check('المقدّم: الدور للخصم، ولا صف أرقام (السلّم على الجمهور)', (await text(presenter, '#aWho')) === `دور ${LONG[other(opener) - 1]}`  && !(await presenter.$('#aBids')));
  await both('بعد رقم');

  // 5. ثلاثة أرقام ثم تبادل طويل: يسقط الأقدم ويبقى الأحدث.
  await presenter.click('#aBid'); await wait(800);
  await plus(); await presenter.click('#aBid'); await wait(800);
  b = await bids(audience);
  check('ثلاثة أرقام بالتناوب: 6 ثم 7 ثم 9، والأحدث وحده كبير', b.map(x => x.n).join(',') === '6,7,9' && b.map(x => x.t).join(',') === [opener, other(opener), opener].join(',') && b.filter(x => x.top).length === 1 && b[2].top && b[0].h === 88);
  await both('ثلاثة أرقام');
  await stage.screenshot({ path: `${shots}/s4-bid.png` });
  await presenter.screenshot({ path: `${shots}/s4-presenter-bid.png` });
  for (let i = 0; i < 9; i++) { await presenter.click('#aBid'); await wait(760); }
  b = await bids(audience);
  const row = await audience.$eval('#bids', e => { const r = e.getBoundingClientRect(); return [...e.children].every(c => { const x = c.getBoundingClientRect(); return x.left >= r.left - 1 && x.right <= r.right + 1; }); });
  check(`اثنا عشر رقماً: يسقط الأقدم (يبقى ${b.length})، والأحدث 18 باقٍ، والكل داخل الصف`, b.length < 12 && b.length >= 6 && b[b.length - 1].n === '18' && b[b.length - 1].top && row);
  await both('اثنا عشر رقماً');
  await stage.screenshot({ path: `${shots}/s4-bidlong.png` });

  // 6. إعادة تحميل الجمهور ثم المقدّم: المزايدة كما هي.
  const before = (await st()).bids.length;
  await stage.reload();
  await unlock(stage).catch(() => {});
  await wait(1500);
  s = await st();
  check('إعادة تحميل الشاشة: المزايدة كما هي', s.bids.length === before && s.phase === 'bid');
  await presenter.reload();
  await presenter.waitForSelector('#app:not([hidden])', { timeout: 10000 }).catch(() => {});
  await wait(1200);
  check('إعادة تحميل المقدّم: الرقم والدور كما هما', (await text(presenter, '#aState')).includes(String((await st()).bids.slice(-1)[0].n)) && (await text(presenter, '#aBid')) === 'زايد · 19');

  // 7. الانسحاب: صاحب الدور ينسحب، فيلتزم صاحب أعلى رقم.
  s = await st();
  const committed = s.bids[s.bids.length - 1].team, top = s.bids[s.bids.length - 1].n;
  audience = await stageFrame(stage).catch(() => audience);
  await presenter.click('#aPass');
  await wait(900);
  check(`الجمهور: «0 من ${top}» بلون الملتزم، ولا أرقام`, (await text(audience, '#tn')) === '0' && (await text(audience, '#tof')) === String(top) && await audience.$eval('#tally', (e, t) => e.classList.contains('t' + t), committed) && (await bids(audience)).length === 0);
  check('الجمهور: الحدّ عند الملتزم، ولا عدّاد يعمل', await audience.$eval('#canvas', (c, t) => c.classList.contains('turn-' + t) && !c.classList.contains('running'), committed));
  check(`المقدّم: «التزم بـ ${top} · 60 ثانية» ولا أزرار مزايدة`, (await text(presenter, '#aState')) === `التزم بـ ${top} · 60 ثانية` && (await presenter.$$('#aCtl button')).length === 0 && await presenter.isVisible('#aLater'));
  check('المقدّم: من الالتزام تظهر الصيغ البديلة، ولا نص يُقصّ', await presenter.$$eval('#aRef small', e => e.length) === bank.topics[0].items.filter(i => i.alts?.length).length);
  await both('الالتزام');
  await stage.screenshot({ path: `${shots}/s4-ready.png` });

  // 8. التراجع: تعود المزايدة والدور.
  await presenter.click('#aUndo');
  await wait(900);
  check('التراجع عن الانسحاب: تعود المزايدة والأرقام', (await st()).phase === 'bid' && (await bids(audience)).length > 0 && !(await audience.isVisible('#tally')));

  // 8.1 قائمة من 22 عنصراً (طول «الدول العربية» في التصميم) بصيغها: نافذة المقدّم بلا تمرير على المقاسات الثلاثة.
  await stage.evaluate(() => { const m = JSON.parse(localStorage.getItem('big-challenge.match')); m.round.state.topics[0].items = m.round.state.topics[0].items.slice(0, 22); localStorage.setItem('big-challenge.match', JSON.stringify(m)); });
  await presenter.reload();
  await presenter.waitForSelector('#app:not([hidden])', { timeout: 10000 }).catch(() => {});
  await wait(1200);
  check('قائمة 22 عنصراً: ستة في الصف لا تسعة', (await presenter.$$('#aRef button')).length === 22 && !(await presenter.$eval('#aRef', e => e.classList.contains('dense'))));
  await sizes('قائمة 22');
  await presenter.screenshot({ path: `${shots}/s4-presenter-22.png` });

  // 9. النافذة الواحدة بأطول اسمين ورقمين من ثلاث خانات: الأزرار في صف الشارات.
  await presenter.close();
  presenter = null;
  await wait(600);
  await stage.click('#resume');
  await wait(1200);
  audience = await stageFrame(stage);
  await stage.evaluate(() => { const m = JSON.parse(localStorage.getItem('big-challenge.match')); m.scores = m.round.scores = { 1: 188, 2: 176 }; localStorage.setItem('big-challenge.match', JSON.stringify(m)); });
  await stage.reload();
  await unlock(stage);
  audience = await stageFrame(stage);
  await wait(1000);
  const near = () => audience.$$eval('#near .cbtn', els => els.map(e => e.textContent.trim() + (e.classList.contains('off') ? '(معطّل)' : '')).join(' | '));
  check(`النافذة الواحدة: «−» (معطّل عند أقل رقم) · «زايد · 19» · «+» · «انسحب» (${await near()})`, (await near()) === '−(معطّل) | زايد · 19 | + | انسحب');
  await cmd(audience, 'offer:1'); await wait(200);
  check('«+» في النافذة الواحدة: «زايد · 20»', (await near()).includes('زايد · 20'));
  await both('نافذة واحدة · المزايدة');
  await stage.screenshot({ path: `${shots}/s4-single-bid.png` });
  const nb = (await audience.$$('#near .cbtn'))[1], box = await nb.boundingBox();
  await stage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await wait(150); await stage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await wait(150); await stage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await wait(900);
  check('ثلاث نقرات على «زايد» في النافذة الواحدة بفاصل 0.15 ثانية تسجّل رقماً واحداً', (await bids(audience)).slice(-2).map(x => x.n).join(',') === '18,20');
  check('«زايد» في النافذة الواحدة يسجّل 20', (await bids(audience)).pop().n === '20');
  await cmd(audience, 'act:pass'); await wait(900);
  check('«انسحب» في النافذة الواحدة: العدّ «0 من 20» ولا أزرار مزايدة', (await text(audience, '#tn')) === '0' && (await text(audience, '#tof')) === '20' && !(await audience.$$('#near .cbtn')).length);
  await both('نافذة واحدة · الالتزام');
  await stage.screenshot({ path: `${shots}/s4-single-ready.png` });
  // افتتاح الموضوع في النافذة الواحدة: «انسحب» معطّل.
  await cmd(audience, 'undo'); await wait(900);
  for (let i = 0; i < 40 && (await st()).bids.length; i++) { await cmd(audience, 'undo'); await wait(760); }
  check(`افتتاح الموضوع في النافذة الواحدة: «زايد · 5» و«انسحب» معطّل (${await near()})`, (await near()) === '− | زايد · 5 | + | انسحب(معطّل)');
  await both('نافذة واحدة · الافتتاح');
  await stage.screenshot({ path: `${shots}/s4-single-open.png` });

  check(`فحص التداخل والشبكة في كل حالة سليم${layoutOk ? '' : ' · ' + fails.filter(f => !f.startsWith('المقدّم')).join(' | ')}`, layoutOk);
  check(`نافذة المقدّم على 1366×768 و1280×800 و1920×1080 بلا تمرير ولا فيض ولا نص أصغر من 32${presenterOk ? '' : ' · ' + fails.filter(f => f.startsWith('المقدّم')).join(' | ')}`, presenterOk);
  check('لا قائمة ولا طولها ولا نص قواعد على شاشة الجمهور', !leak);
  check(`لا أخطاء في الصفحات${errors.length ? ': ' + errors.join(' | ') : ''}`, errors.length === 0);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
