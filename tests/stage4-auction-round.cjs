// اختبار آلي لمرحلة «المزايدة» في المزاد بقاعدة المالك المصحّحة (5.5، design/auction.md 2.0) بالنافذتين وبالنافذة الواحدة، في الرابط العادي:
// الافتتاح، والموضوع و«في القائمة 12» بجانبه، و«زايد · N» رقماً رقماً، وشارات المزايدة بألوان أصحابها والأحدث أكبرها، والحدّ مع كل رقم،
// وسقوط الأقدم، و«توقّف» والالتزام، والإقفال التلقائي و«العدد كاملاً»، وقائمة فوق 20 بعدد مخفي، والتراجع، وإعادة التحميل،
// ولا قائمة على الجمهور، وفحص التداخل في كل حالة، ونافذة المقدّم على ثلاثة مقاسات. (والوفاء في stage4-auction-fulfil.cjs.)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace, beginTwo } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/'; // الرابط العادي: المزاد في MODES منذ اكتمال ش4
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { check, finish } = reporter();
  const errors = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const LONG = ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'];

  // بنك تجريبي بأطول موضوع (32 حرفاً، design/auction.md 3) بقائمة «أشهر السنة الميلادية» (12، حتى 20)، والباقي من البنك.
  const real = JSON.parse(fs.readFileSync(path.join(__dirname, '../content/packs/general/auction.json'), 'utf8'));
  const months = real.topics.find(t => t.topic === 'أشهر السنة الميلادية');
  const africa = real.topics.find(t => t.items.length > 30);
  const TOPIC = 'أشياء تجدها في حقيبة طالب مدرسة';
  const bank = { mode: 'auction', topics: [{ ...months, id: 'test-auction-long', level: 'easy', topic: TOPIC }, ...real.topics.filter(t => t.level !== 'easy')] };
  const names = [...bank.topics[0].items, ...africa.items].flatMap(i => [i.name, ...(i.alts ?? [])]);

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
  // شاشة الجمهور: التداخل والشبكة، ولا عنصر من القائمة ولا المستوى ولا «انسحب» في نص الشاشة (عدا الأزرار في النافذة الواحدة).
  // و«في القائمة N» في المزايدة للقائمة حتى 20 وحدها، والطول لا يظهر في غيرها.
  const audienceCheck = async label => {
    const r = await audience.evaluate(() => window.__stageCheck());
    if (!r.ok) { layoutOk = false; fails.push(`${label}: ${r.problems.join('، ')}`); }
    const s = await st();
    const len = s.topics[s.index].items.length;
    const size = await audience.evaluate(() => { const e = document.getElementById('tsize'); return e.hidden ? null : e.innerText.replace(/\s+/g, ' ').trim(); });
    if (size !== (s.phase === 'bid' && len <= 20 ? `في القائمة ${len}` : null)) { leak = true; fails.push(`${label}: «في القائمة» (${size})`); }
    const body = await audience.evaluate(ns => { let t = document.querySelector('.canvas').innerText;
      for (const b of document.querySelectorAll('.cbtn')) t = t.replace(b.innerText, '');
      t = t.replace(document.getElementById('topic').innerText, '').replace(document.getElementById('tsize').innerText, '');
      for (const n of ns) t = t.split(n).join(''); return t; }, LONG);
    if (/سرقة|سهل|متوسط|صعب|بفارق|انسحب|في القائمة|عنصر/.test(body)) { leak = true; fails.push(`${label}: نص ممنوع على الجمهور`); }
    if (names.some(n => body.includes(n))) { leak = true; fails.push(`${label}: عنصر من القائمة على الجمهور`); }
    if (s.phase === 'bid' && len > 20 && body.includes(String(len))) { leak = true; fails.push(`${label}: طول القائمة على الجمهور`); }
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

  const ctl = () => presenter.$$eval('#aCtl button', els => els.map(e => e.textContent.trim() + (e.disabled ? '(معطّل)' : '')).join(' | '));
  const turnOn = t => audience.$eval('#canvas', (c, t) => c.classList.contains('turn-' + t), t);

  // 1. إلى المواجهة: المزاد للجولة الأولى، و«ابدأ المباراة» بنافذتين.
  await audience.waitForSelector('[data-cmd="draw"]', { timeout: 6000 });
  await sharedToFace(audience, { names: LONG, picks: ['auction', 'letter'] });
  await wait(2700);
  check('المزاد يبدأ جولته («ابدأ المباراة»)، لا «تخطَّ»', await audience.isVisible('[data-cmd="begin"]'));
  presenter = await beginTwo(context, audience);
  await presenter.waitForFunction(() => document.getElementById('status').dataset.on === 'true', null, { timeout: 6000 });

  // 2. الافتتاح
  await audience.waitForSelector('.scr.show[data-s="intro"]', { timeout: 5000 });
  let s = await st();
  const opener = s.topics[0].opener;
  const other = t => (t === 1 ? 2 : 1);
  check('الجمهور: «زايدوا رقماً رقماً، ثم أوفوا» و«يفتتح المزايدة [الاسم]»', (await text(audience, '#rule')) === 'زايدوا رقماً رقماً، ثم أوفوا'
    && (await text(audience, '#starter')) === `يفتتح المزايدة ${LONG[opener - 1]}`);
  check('الجمهور: شارة «المزاد» و«الجولة 1 من 2»', (await text(audience, '#mode')) === 'المزاد' && (await text(audience, '#b1')) === 'الجولة 1 من 2');
  check('المقدّم: «اعرض الموضوع 1» والافتتاح بالمفتتح', (await text(presenter, '#showQ')) === 'اعرض الموضوع 1' && (await text(presenter, '#introWho')).includes(`يفتتح المزايدة ${LONG[opener - 1]}`));
  await both('الافتتاح');

  // 3. الموضوع: الدور للمفتتح، ولا رقم بعد، و«في القائمة 12».
  await presenter.click('#showQ');
  await audience.waitForSelector('.scr.show[data-s="auc"]');
  await wait(600);
  check('الجمهور: الموضوع سطراً واحداً، و«الموضوع 1 من 3»، ولا عدّ ولا أرقام', (await text(audience, '#topic')) === TOPIC && (await text(audience, '#b1')) === 'الموضوع 1 من 3'
    && !(await audience.isVisible('#tally')) && (await bids(audience)).length === 0
    && await audience.$eval('#topic', e => e.scrollWidth <= e.clientWidth + 1 && e.getClientRects().length === 1));
  check('الجمهور: «في القائمة 12» بجانب أطول موضوع، بخط 32، وبعده بفراغ 48', (await text(audience, '#tsize')) === 'في القائمة 12'
    && await audience.evaluate(() => { const t = document.getElementById('topic').getBoundingClientRect(), z = document.getElementById('tsize');
      return Math.round(t.left - z.getBoundingClientRect().right) === 48 && getComputedStyle(z).fontSize === '32px' && Math.abs(t.top + t.height / 2 - (z.getBoundingClientRect().top + z.getBoundingClientRect().height / 2)) < 2; }));
  check('الجمهور: الحدّ عند المفتتح', await turnOn(opener));
  check('المقدّم: الرأس «المزاد · الموضوع 1 من 3» والموضوع و«في القائمة 12 عنصراً»', (await text(presenter, '#roundChip')) === 'المزاد · الموضوع 1 من 3'
    && (await text(presenter, '#aTopic')) === TOPIC && (await text(presenter, '#aSize')) === 'في القائمة 12 عنصراً');
  check('المقدّم: القائمة المرجعية أزرار للاطلاع، والاسم وحده بلا صيغه في المزايدة', (await presenter.$$('#aRef button')).length === 12
    && await presenter.$eval('#aRef', e => e.classList.contains('view') && !e.classList.contains('dense') && !e.querySelector('small')));
  check(`المقدّم: «يفتتح بـ 1 أو بالعدد كاملاً»، و«زايد · 1» · «العدد كاملاً · 12» · «توقّف» معطّل (${await ctl()})`, (await text(presenter, '#aState')) === 'يفتتح بـ 1 أو بالعدد كاملاً'
    && (await ctl()) === 'زايد · 1 | العدد كاملاً · 12 | توقّف(معطّل)');
  check('المقدّم: «زايد» 4 أعمدة و«العدد كاملاً» 5 و«توقّف» 3 في صف واحد', await presenter.$$eval('#aCtl button', els => els.map(e => getComputedStyle(e).gridColumnStart).join(',') === 'span 4,span 5,span 3'
    && new Set(els.map(e => Math.round(e.getBoundingClientRect().top))).size === 1));
  await both('الموضوع');
  await stage.screenshot({ path: `${shots}/s4-open.png` });
  await presenter.screenshot({ path: `${shots}/s4-presenter-open.png` });

  // 4. «زايد · 1»، ونقرتان متأخرتان بالفأرة (صار الزر «زايد · 2» للخصم) تُهملان.
  const at = await presenter.$eval('#aBid', e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  await presenter.mouse.click(at.x, at.y);
  await wait(150); await presenter.mouse.click(at.x, at.y);
  await wait(150); await presenter.mouse.click(at.x, at.y);
  await wait(100);
  let b = await bids(audience);
  check('نقرتان متأخرتان بالفأرة على «زايد» (0.15 و0.3 ثانية) لا تسجّلان رقماً للخصم', b.length === 1);
  check('زايد المفتتح بـ 1: شارة بلونه، وهي الأحدث الأكبر (136)', b.length === 1 && b[0].n === '1' && b[0].t === opener && b[0].top && b[0].h === 136);
  check('الجمهور: الحدّ يكتسح للخصم مع الرقم، ودوره', await turnOn(other(opener)) && await audience.$eval('#p' + other(opener), e => e.classList.contains('on')));
  check('الرقم الجديد يدخل بحركته', await audience.$eval('#bids .bid.top', e => getComputedStyle(e).animationName === 'bidin'));
  await wait(800);
  check(`المقدّم: «يزايد على 1 أو يتوقّف»، و«زايد · 2» · «العدد كاملاً · 12» · «توقّف» (${await ctl()})`, (await text(presenter, '#aState')) === 'يزايد على 1 أو يتوقّف'
    && (await ctl()) === 'زايد · 2 | العدد كاملاً · 12 | توقّف');
  check('المقدّم: الدور للخصم، ولا صف أرقام (السلّم على الجمهور)', (await text(presenter, '#aWho')) === `دور ${LONG[other(opener) - 1]}` && !(await presenter.$('#aBids')));
  await both('بعد رقم');

  // 5. رقماً رقماً بالتناوب، والحدّ مع كل رقم، ثم تبادل طويل: يسقط الأقدم ويبقى الأحدث.
  await presenter.click('#aBid'); await wait(800);
  check('بعد «زايد · 2»: الحدّ يعود إلى المفتتح', await turnOn(opener));
  await presenter.click('#aBid'); await wait(800);
  b = await bids(audience);
  check('ثلاثة أرقام بالتناوب: 1 ثم 2 ثم 3، والأحدث وحده كبير', b.map(x => x.n).join(',') === '1,2,3' && b.map(x => x.t).join(',') === [opener, other(opener), opener].join(',') && b.filter(x => x.top).length === 1 && b[2].top && b[0].h === 88);
  check('والحدّ عند الخصم بعد الثالث', await turnOn(other(opener)));
  await both('ثلاثة أرقام');
  await stage.screenshot({ path: `${shots}/s4-bid.png` });
  await presenter.screenshot({ path: `${shots}/s4-presenter-bid.png` });
  for (let i = 0; i < 8; i++) { await presenter.click('#aBid'); await wait(760); }
  b = await bids(audience);
  const row = await audience.$eval('#bids', e => { const r = e.getBoundingClientRect(); return [...e.children].every(c => { const x = c.getBoundingClientRect(); return x.left >= r.left - 1 && x.right <= r.right + 1; }); });
  check(`أحد عشر رقماً: يسقط الأقدم (يبقى ${b.length})، والأحدث 11 باقٍ، والكل داخل الصف`, b.length < 11 && b.length >= 6 && b[b.length - 1].n === '11' && b[b.length - 1].top && row);
  check('والمزاد مفتوح بعد 11 من 12: «زايد · 12»', (await st()).phase === 'bid' && (await text(presenter, '#aBid')) === 'زايد · 12');
  await both('أحد عشر رقماً');
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
  check('إعادة تحميل المقدّم: الرقم والدور كما هما', (await text(presenter, '#aState')) === 'يزايد على 11 أو يتوقّف' && (await text(presenter, '#aBid')) === 'زايد · 12');
  audience = await stageFrame(stage).catch(() => audience);

  // 7. «توقّف»: صاحب الدور يتوقف، فيلتزم خصمه بآخر رقم ذكره (11).
  s = await st();
  const committed = s.bids[s.bids.length - 1].team;
  await presenter.click('#aCtl [data-act="stop"]');
  await wait(900);
  check('الجمهور: «0 من 11» بلون الملتزم، ولا أرقام، ولا «في القائمة»', (await text(audience, '#tn')) === '0' && (await text(audience, '#tof')) === '11' && await audience.$eval('#tally', (e, t) => e.classList.contains('t' + t), committed)
    && (await bids(audience)).length === 0 && !(await audience.isVisible('#tsize')));
  check('الجمهور: الحدّ عند الملتزم، ولا عدّاد يعمل', await turnOn(committed) && await audience.$eval('#canvas', c => !c.classList.contains('running')));
  check(`المقدّم: «التزم بـ 11 · 60 ثانية»، و«ابدأ العدّاد» و«توقّف · لم يفِ» (${await ctl()})`, (await text(presenter, '#aState')) === 'التزم بـ 11 · 60 ثانية'
    && (await ctl()) === 'ابدأ العدّاد | توقّف · لم يفِ');
  check('المقدّم: من الالتزام تظهر الصيغ البديلة', await presenter.$$eval('#aRef small', e => e.length) === bank.topics[0].items.filter(i => i.alts?.length).length);
  await both('الالتزام');
  await stage.screenshot({ path: `${shots}/s4-ready.png` });

  // 8. التراجع، ثم «زايد · 12»: بلغت المزايدة العدد فيُقفل المزاد تلقائياً لمن ذكره.
  await presenter.click('#aUndo'); await wait(900);
  check('التراجع عن «توقّف»: تعود المزايدة والأرقام و«في القائمة 12»', (await st()).phase === 'bid' && (await bids(audience)).length > 0 && !(await audience.isVisible('#tally')) && await audience.isVisible('#tsize'));
  const twelve = (await st()).team;
  await presenter.click('#aBid'); await wait(900);
  s = await st();
  check('«زايد · 12» (بلغ العدد): أُقفل المزاد تلقائياً له، «0 من 12»', s.phase === 'ready' && s.commit.team === twelve && s.commit.n === 12 && (await text(audience, '#tof')) === '12'
    && (await text(presenter, '#aState')) === 'التزم بـ 12 · 60 ثانية');
  await presenter.click('#aUndo'); await wait(900);
  // «العدد كاملاً» من صاحب الدور.
  await presenter.click('#aCtl [data-act="full"]'); await wait(900);
  s = await st();
  check('«العدد كاملاً · 12»: يُقفل المزاد لصاحب الدور، وشارته الأخيرة 12', s.phase === 'ready' && s.commit.team === twelve && s.commit.n === 12 && s.bids[s.bids.length - 1].full);
  await presenter.click('#aUndo'); await wait(900);
  for (let i = 0; i < 12 && (await st()).bids.length; i++) { await presenter.click('#aUndo'); await wait(760); }
  await presenter.click('#aCtl [data-act="full"]'); await wait(900);
  s = await st();
  check('«العدد كاملاً» من المفتتح في دوره الأول: يُقفل له', s.phase === 'ready' && s.commit.team === opener && s.commit.n === 12 && s.bids.length === 1);
  await both('العدد كاملاً من المفتتح');
  await presenter.click('#aUndo'); await wait(900);

  // 8.1 قائمة فوق 20 (22 عنصراً): العدد مخفي عن الجمهور، ولا «العدد كاملاً»، و«زايد» 8 أعمدة و«توقّف» 4، وبلا تمرير.
  const items12 = (await st()).topics[0].items;
  const setItems = items => stage.evaluate(items => { const m = JSON.parse(localStorage.getItem('big-challenge.match')); m.round.state.topics[0].items = items; localStorage.setItem('big-challenge.match', JSON.stringify(m)); }, items);
  await setItems(africa.items.slice(0, 22).map(x => ({ name: x.name, alts: x.alts ?? [] })));
  await stage.reload(); await unlock(stage).catch(() => {});
  await presenter.reload();
  await presenter.waitForSelector('#app:not([hidden])', { timeout: 10000 }).catch(() => {});
  await wait(1500);
  audience = await stageFrame(stage).catch(() => audience);
  check(`قائمة 22: «يفتتح بـ 1»، و«زايد · 1» · «توقّف» معطّل (${await ctl()})، وستة في الصف`, (await text(presenter, '#aState')) === 'يفتتح بـ 1' && (await ctl()) === 'زايد · 1 | توقّف(معطّل)'
    && (await presenter.$$('#aRef button')).length === 22 && !(await presenter.$eval('#aRef', e => e.classList.contains('dense'))));
  check('قائمة 22: «زايد» 8 أعمدة و«توقّف» 4، والمقدّم يرى «في القائمة 22 عنصراً»', await presenter.$$eval('#aCtl button', els => els.map(e => getComputedStyle(e).gridColumnStart).join(',') === 'span 8,span 4')
    && (await text(presenter, '#aSize')) === 'في القائمة 22 عنصراً');
  check('قائمة 22: لا «في القائمة» على الجمهور', !(await audience.isVisible('#tsize')));
  await presenter.click('#aBid'); await wait(800);
  check('قائمة 22: «العدد كاملاً» لا يُقبل', (await ctl()) === 'زايد · 2 | توقّف');
  await both('قائمة 22');
  await stage.screenshot({ path: `${shots}/s4-bid-hidden.png` });
  await presenter.screenshot({ path: `${shots}/s4-presenter-22.png` });
  await presenter.click('#aUndo'); await wait(900);
  await setItems(items12);

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
  check(`النافذة الواحدة · الافتتاح: «زايد · 1» · «كاملاً · 12»، بلا «توقّف» (${await near()})`, (await near()) === 'زايد · 1 | كاملاً · 12');
  await both('نافذة واحدة · الافتتاح');
  await stage.screenshot({ path: `${shots}/s4-single-open.png` });
  const nb = (await audience.$$('#near .cbtn'))[0], box = await nb.boundingBox();
  await stage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await wait(150); await stage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await wait(150); await stage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await wait(900);
  check('ثلاث نقرات على «زايد» في النافذة الواحدة بفاصل 0.15 ثانية تسجّل رقماً واحداً (1)', (await bids(audience)).map(x => x.n).join(',') === '1');
  check(`النافذة الواحدة · المزايدة: «زايد · 2» · «كاملاً · 12» · «توقّف» (${await near()})`, (await near()) === 'زايد · 2 | كاملاً · 12 | توقّف');
  for (let n = 2; n <= 4; n++) { await cmd(audience, 'act:bid'); await wait(800); }
  check('النافذة الواحدة: رقماً رقماً حتى 4، والحدّ عند الخصم بعد كل رقم', (await bids(audience)).map(x => x.n).join(',') === '1,2,3,4' && await turnOn(opener));
  await both('نافذة واحدة · المزايدة');
  await stage.screenshot({ path: `${shots}/s4-single-bid.png` });
  await cmd(audience, 'act:stop'); await wait(900);
  check(`«توقّف» في النافذة الواحدة: العدّ «0 من 4»، و«ابدأ» · «صحيح · +1» مكان أزرار المزايدة (${await near()})`, (await text(audience, '#tn')) === '0' && (await text(audience, '#tof')) === '4' && (await near()) === 'ابدأ | صحيح · +1');
  await both('نافذة واحدة · الالتزام');
  await stage.screenshot({ path: `${shots}/s4-single-ready.png` });
  await cmd(audience, 'undo'); await wait(900);
  await cmd(audience, 'act:full'); await wait(900);
  check('«كاملاً · 12» في النافذة الواحدة: «0 من 12» لصاحب الدور', (await text(audience, '#tof')) === '12' && (await st()).commit.n === 12 && (await st()).commit.team === opener);

  check(`فحص التداخل والشبكة في كل حالة سليم${layoutOk ? '' : ' · ' + fails.filter(f => !f.startsWith('المقدّم')).join(' | ')}`, layoutOk);
  check(`نافذة المقدّم على 1366×768 و1280×800 و1920×1080 بلا تمرير ولا فيض ولا نص أصغر من 32${presenterOk ? '' : ' · ' + fails.filter(f => f.startsWith('المقدّم')).join(' | ')}`, presenterOk);
  check(`لا قائمة ولا طول فوق 20 ولا نص قواعد على شاشة الجمهور، و«في القائمة» في موضعه وحده${leak ? ' · ' + fails.filter(f => !f.startsWith('المقدّم')).join(' | ') : ''}`, !leak);
  check(`لا أخطاء في الصفحات${errors.length ? ': ' + errors.join(' | ') : ''}`, errors.length === 0);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
