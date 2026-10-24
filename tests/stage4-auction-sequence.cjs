// اختبار آلي لمرحلة «تتابع الجولة» في المزاد (ش4، القسم 5.5) بالنافذتين وبالنافذة الواحدة، بالبنك الحقيقي، في الرابط العادي:
// ثلاثة مواضيع (سهل ثم متوسط ثم صعب) بلا مفتتح (3.0)، و«الموضوع التالي» يعرض الموضوع فوراً للمزايدة والحدّ في المنتصف،
// ومسار المواضيع بمن أخذ كلاً منها (ومنه الخصم بنقطتيه إن لم يفِ الملتزم، 2.0)، و«إنهاء الجولة» بعد الثالث فشاشة النهاية بحصيلة كل فريق، والتراجع عن النهاية،
// وفي النافذة الواحدة «الموضوع التالي» و«إنهاء الجولة» في البطاقة. وفحص التداخل ونافذة المقدّم في كل حالة.
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

  // البنك الحقيقي، والموضوع الصعب «دول قارة أفريقيا» (54) كي تُفحص نافذة المقدّم بأطول قائمة.
  const real = JSON.parse(fs.readFileSync(path.join(__dirname, '../content/packs/general/auction.json'), 'utf8'));
  const bank = { ...real, topics: real.topics.filter(t => t.level !== 'hard' || t.items.length > 30) };

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
  const stored = () => stage.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')));
  const st = async () => (await stored()).round.state;
  const other = t => (t === 1 ? 2 : 1);

  let layoutOk = true, presenterOk = true, leak = false;
  const fails = [];
  // شاشة الجمهور: التداخل والشبكة، ولا عنصر لم يُذكر قبل الحكم، ولا طول القائمة ولا نص قواعد.
  const audienceCheck = async label => {
    const r = await audience.evaluate(() => window.__stageCheck());
    if (!r.ok) { layoutOk = false; fails.push(`${label}: ${r.problems.join('، ')}`); }
    const s = await st();
    if (s.phase === 'decided') return;
    if (!s.topics[s.index]) return;
    const items = s.topics[s.index].items;
    const said = new Set((s.said ?? []).filter(x => x.i !== null).map(x => x.i));
    const shown = [...said].flatMap(i => [items[i].name, ...(items[i].alts ?? [])]).sort((a, b) => b.length - a.length);
    const body = await audience.evaluate(ns => { let t = document.querySelector('.canvas').innerText;
      for (const b of document.querySelectorAll('.cbtn')) t = t.replace(b.innerText, '');
      t = t.replace(document.getElementById('topic').innerText, '').replace(document.getElementById('tsize').innerText, '');
      for (const n of ns) t = t.split(n).join(''); return t; }, [...LONG, ...shown]);
    if (/سرقة|سهل|متوسط|صعب|انسحب|في القائمة|عنصر/.test(body)) { leak = true; fails.push(`${label}: نص ممنوع على الجمهور`); }
    const unsaid = items.filter((x, i) => !said.has(i)).flatMap(x => [x.name, ...(x.alts ?? [])]);
    // اسم من حرف أو حرفين («ت» أو «7») يقع في أي نص، فلا يُبحث عنه في نص الشاشة: الشارات وحدها تحمل ما ذُكر.
    const named = n => [...n].length > 2 && body.includes(n);
    if (unsaid.some(named)) { leak = true; fails.push(`${label}: عنصر لم يُذكر على الجمهور (${unsaid.find(named)})`); }
    // «في القائمة N» في المزايدة للقائمة حتى 20 وحدها (5.5، design/auction.md 2.0).
    const tsize = await audience.evaluate(() => { const e = document.getElementById('tsize'); return e.hidden ? null : e.innerText.replace(/\s+/g, ' ').trim(); });
    if (tsize !== (s.phase === 'bid' && items.length <= 20 ? `في القائمة ${items.length}` : null)) { leak = true; fails.push(`${label}: «في القائمة» (${tsize})`); }
    if (body.includes(String(items.length)) && s.commit?.n !== items.length && !(s.bids ?? []).some(b => b.n === items.length)) { leak = true; fails.push(`${label}: طول القائمة على الجمهور`); }
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
  const both = async label => { await wait(700); await audienceCheck(label); if (presenter) await sizes(label); };
  const chips = () => audience.$$eval('#items .it', els => els.map(e => ({ name: e.textContent.trim(), t: e.classList.contains('t1') ? 1 : e.classList.contains('t2') ? 2 : 0, left: e.classList.contains('left'), more: e.classList.contains('more') })));
  const tally = async () => `${await text(audience, '#tn')}/${await text(audience, '#tof')}`;
  // نقرة بالفأرة في موضع العنصر i (لا page.click: ينتظر ثبات الزر فيؤخر النقرة).
  const at = async i => presenter.$eval(`#aRef button[data-i="${i}"]`, e => { const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const tap = async i => { const p = await at(i); await presenter.mouse.click(p.x, p.y); };


  const round = async () => (await stored()).round;
  const ui = async () => ({ badge: await text(audience, '#b1'), topic: await text(audience, '#topic'), chip: await text(presenter, '#roundChip'),
    pips: await presenter.$$eval('#pips .pip', els => els.map(e => e.className.replace('pip ', ''))), ctl: await presenter.$$eval('#aCtl button', els => els.map(e => e.textContent.trim()).join(' | ')) });
  // يزايد الفريق t بزرّه حتى n (خصمه بلا رقم)، ثم «ابدأ» يرسي عليه ويبدأ الوفاء (3.0).
  const bidTo = async (n, t) => { for (let k = 1; k <= n; k++) { await presenter.click(`#aCtl [data-raise="${t}"]`); await wait(150); } await wait(500); await presenter.click('#aCtl [data-act="start"]'); await wait(900); };
  const ctlOff = () => presenter.$$eval('#aCtl button', els => els.map(e => e.textContent.trim() + (e.disabled ? '(معطّل)' : '')).join(' | '));
  const centered = () => audience.$eval('#canvas', c => !c.classList.contains('turn-1') && !c.classList.contains('turn-2'));

  // 1. إلى الموضوع الأول.
  await audience.waitForSelector('[data-cmd="draw"]', { timeout: 6000 });
  await sharedToFace(audience, { names: LONG, picks: ['auction', 'letter'] });
  await wait(2700);
  presenter = await beginTwo(context, audience);
  await presenter.waitForFunction(() => document.getElementById('status').dataset.on === 'true', null, { timeout: 6000 });
  await audience.waitForSelector('.scr.show[data-s="intro"]', { timeout: 5000 });
  let s = await st();
  const first = Math.random() < 0.5 ? 1 : 2;
  check('ثلاثة مواضيع: سهل ثم متوسط ثم صعب، بلا مفتتح', s.topics.map(t => t.level).join(',') === 'easy,medium,hard' && s.topics.every(t => !('opener' in t)));
  await presenter.click('#showQ');
  await audience.waitForSelector('.scr.show[data-s="auc"]');
  await wait(800);

  // 2. الموضوع الأول: يزايد فريق بـ 3 فيرسو عليه، ويفي.
  await bidTo(3, first);
  await tap(0); await wait(100); await tap(1); await wait(100); await tap(2); await wait(1200);
  let u = await ui();
  check(`الموضوع 1: وفى من رسا عليه (+3)، و«الموضوع التالي» وحده (${u.ctl})`, (await st()).phase === 'decided' && (await round()).scores[first] === 3 && u.ctl === 'الموضوع التالي');
  check('مسار المواضيع: الأول بلون من أخذه، والثاني والثالث لم يُلعبا', u.pips[0].includes('won' + first) && !/won|none/.test(u.pips[1]) && !/won|none/.test(u.pips[2]));
  await both('الموضوع 1 · بعد الحكم');

  // 3. «الموضوع التالي»: الموضوع 2 يظهر فوراً للمزايدة، والحدّ في المنتصف.
  await presenter.click('#aCtl [data-act="next"]'); await wait(1200);
  s = await st(); u = await ui();
  check('الموضوع 2: «الموضوع 2 من 3» على الشاشة وفي المقدّم، ونصّه، والمزايدة فوراً', s.index === 1 && s.phase === 'bid' && u.badge === 'الموضوع 2 من 3'
    && u.chip === 'المزاد · الموضوع 2 من 3' && u.topic === s.topics[1].topic);
  check(`الموضوع 2: الحدّ في المنتصف، ولا أرقام ولا عدّ ولا قائمة`, s.team === 0 && s.nums.join(',') === '0,0' && await centered()
    && !(await audience.isVisible('#tally')) && !(await chips()).length && !(await audience.$$('#bids .bid')).length && !(await audience.isVisible('#verdict')));
  check(`المقدّم: «المزايدة · لا رقم بعد» و«زايد» · «ابدأ» معطّل · «زايد» (${await ctlOff()})، والقائمة الجديدة بالأسماء وحدها`, (await text(presenter, '#aWho')) === 'المزايدة · لا رقم بعد' && (await ctlOff()) === 'زايد | ابدأ(معطّل) | زايد'
    && (await presenter.$$('#aRef button')).length === s.topics[1].items.length && !(await presenter.$('#aRef small')));
  await both('الموضوع 2 · الافتتاح');
  await stage.screenshot({ path: `${shots}/s4-topic2.png` });

  // 4. الموضوع 2: يرسو على الآخر بـ 3، ولا يفي، فيأخذ خصمه نقطتين.
  await bidTo(3, other(first));
  await presenter.click('#aCtl [data-act="stop"]'); await wait(1200);
  u = await ui();
  check('الموضوع 2: لم يفِ الآخر، فللأول نقطتان (رصيده 5)، والمسار باسمه', (await st()).phase === 'decided' && (await round()).scores[first] === 5 && (await round()).scores[other(first)] === 0 && u.pips[1].includes('won' + first));

  // 5. الموضوع 3 (الصعب، أطول قائمة): يرسو على الأول بـ 1، ولا يفي، فللآخر نقطتان، ثم «إنهاء الجولة».
  await presenter.click('#aCtl [data-act="next"]'); await wait(1200);
  s = await st();
  check('الموضوع 3: صعب بأطول قائمة، والحدّ في المنتصف', s.index === 2 && s.team === 0 && await centered() && s.topics[2].items.length > 30 && (await text(audience, '#b1')) === 'الموضوع 3 من 3');
  await both('الموضوع 3 · الافتتاح');
  check(`الموضوع 3: «زايد» · «ابدأ» معطّل · «زايد» (${await ctlOff()})، ولا «في القائمة» (فوق 20، العدد مخفي)`, (await ctlOff()) === 'زايد | ابدأ(معطّل) | زايد' && !(await audience.isVisible('#tsize')));
  await bidTo(1, first);
  await both('الموضوع 3 · الالتزام');
  await presenter.click('#aCtl [data-act="stop"]'); await wait(1200);
  u = await ui();
  check(`الموضوع 3: لم يفِ الأول، فللآخر 2، و«إنهاء الجولة» (${u.ctl})، والمسار: الأول · الأول · الآخر`, (await st()).phase === 'decided' && u.ctl === 'إنهاء الجولة'
    && u.pips[0].includes('won' + first) && u.pips[1].includes('won' + first) && u.pips[2].includes('won' + other(first)));
  await both('الموضوع 3 · لم يفِ');

  // 6. «إنهاء الجولة»: شاشة النهاية بحصيلة كل فريق.
  await presenter.click('#aCtl [data-act="next"]'); await wait(1500);
  check('النهاية: «انتهت الجولة 1»، و+5 للأول و+2 للآخر', await audience.isVisible('.scr.show[data-s="end"]') && (await text(audience, '#b1')) === 'انتهت الجولة 1'
    && (await text(audience, '#r' + first)) === '+5' && (await text(audience, '#r' + other(first))) === '+2');
  check('النهاية: «التالي: …» على الشاشة، والحدّ في المنتصف', /^التالي:/.test(await text(audience, '#next')) && await audience.$eval('#canvas', c => !c.classList.contains('turn-1') && !c.classList.contains('turn-2')));
  check(`المقدّم: «انتهت الجولة 1 · المزاد» وحصيلة الفريقين، وما بعدها («تخطَّ عجلة البونص» حتى ش6) (${await text(presenter, '#endNext')})`, (await text(presenter, '#endHead')) === 'انتهت الجولة 1 · المزاد'
    && (await text(presenter, '#sum')).includes('+5') && /عجلة البونص/.test(await text(presenter, '#endNext')));
  await both('نهاية الجولة');
  await stage.screenshot({ path: `${shots}/s4-end.png` });
  await presenter.click('#endUndo'); await wait(1000);
  check('التراجع عن «إنهاء الجولة»: يعود حكم الموضوع 3', (await st()).phase === 'decided' && (await st()).index === 2);

  // 7. النافذة الواحدة: «إنهاء الجولة» في البطاقة (لا في صف الشارات)، ثم الجولة التالية.
  await presenter.close();
  presenter = null;
  await wait(600);
  await stage.click('#resume');
  await wait(1200);
  audience = await stageFrame(stage);
  await wait(800);
  const card = () => audience.$$eval('.scr.show .ctl .cbtn', els => els.map(e => e.textContent.trim()).join(' | '));
  check(`النافذة الواحدة بعد الحكم: «إنهاء الجولة» في البطاقة، ولا أزرار في صف الشارات (${await card()})`, (await card()) === 'إنهاء الجولة' && !(await audience.$$('#near .cbtn')).length
    && await audience.$eval('#aucCtl', e => e.children.length === 1));
  await both('نافذة واحدة · بعد الحكم');
  await stage.screenshot({ path: `${shots}/s4-single-last.png` });
  await cmd(audience, 'act:next'); await wait(1500);
  check(`النافذة الواحدة: النهاية و«تخطَّ عجلة البونص» في البطاقة (${await card()})`, await audience.isVisible('.scr.show[data-s="end"]') && /عجلة البونص/.test(await card()));
  await both('نافذة واحدة · النهاية');
  await stage.screenshot({ path: `${shots}/s4-single-end.png` });
  // التراجع إلى الموضوع الثاني ثم «الموضوع التالي» من البطاقة.
  for (let i = 0; i < 12 && !((await st()).index === 1 && (await st()).phase === 'decided'); i++) { await cmd(audience, 'undo'); await wait(800); }
  check(`النافذة الواحدة: «الموضوع التالي» في البطاقة بعد حكم الموضوع 2 (${await card()})`, (await st()).index === 1 && (await card()) === 'الموضوع التالي');
  await cmd(audience, 'act:next'); await wait(1200);
  check('النافذة الواحدة: الموضوع 3 للمزايدة، و«زايد» · «ابدأ» معطّل · «زايد» في صف الشارات', (await st()).index === 2 && (await st()).phase === 'bid' && (await text(audience, '#b1')) === 'الموضوع 3 من 3'
    && (await audience.$$eval('#near .cbtn', els => els.map(e => e.textContent.trim() + (e.classList.contains('off') ? '(معطّل)' : '')).join(' | '))) === 'زايد | ابدأ(معطّل) | زايد');

  check(`فحص التداخل والشبكة في كل حالة سليم${layoutOk ? '' : ' · ' + fails.filter(f => !f.startsWith('المقدّم')).join(' | ')}`, layoutOk);
  check(`نافذة المقدّم على 1366×768 و1280×800 و1920×1080 بلا تمرير ولا فيض ولا نص أصغر من 32${presenterOk ? '' : ' · ' + fails.filter(f => f.startsWith('المقدّم')).join(' | ')}`, presenterOk);
  check(`لا عنصر لم يُذكر ولا طول القائمة ولا نص قواعد على شاشة الجمهور قبل الحكم${leak ? ' · ' + fails.filter(f => f.includes('الجمهور')).join(' | ') : ''}`, !leak);
  check(`لا أخطاء في الصفحات${errors.length ? ': ' + errors.join(' | ') : ''}`, errors.length === 0);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });

