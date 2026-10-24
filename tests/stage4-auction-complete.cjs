// اختبار آلي لمرحلة «إكمال الخصم» في المزاد (ش4، القسم 5.5 وdesign/auction.md) بالنافذتين وبالنافذة الواحدة، في الرابط العادي:
// «توقّف · لم يفِ» ينقل الدور إلى الخصم فوراً بعدّاد 15 ثانية (الاكتساح واهتزاز البطاقة)، والعدّ يكمل من حيث وقف بلون الخصم،
// وما ذكره الملتزم لا يُنقر ثانية، وأكمل الخصم فأخذ النقاط كاملة، أو «توقّف · لا نقاط» وانتهاء وقته فلا نقاط والحدّ في المنتصف،
// والتراجع يعيد ما بقي من الوقت، وفحص التداخل ونافذة المقدّم بقائمة أفريقيا (54) على المقاسات الثلاثة، ولا عنصر لم يُذكر قبل الحكم.
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

  // بنك تجريبي بأطول محتوى (design/auction.md 3): الموضوع السهل 32 حرفاً بقائمة أفريقيا (54)، والباقي من البنك.
  const real = JSON.parse(fs.readFileSync(path.join(__dirname, '../content/packs/general/auction.json'), 'utf8'));
  const africa = real.topics.find(t => t.items.length > 30);
  const TOPIC = 'أشياء تجدها في حقيبة طالب مدرسة';
  const bank = { mode: 'auction', topics: [{ ...africa, id: 'test-auction-long', level: 'easy', topic: TOPIC }, ...real.topics.filter(t => t.level !== 'easy')] };
  const items = bank.topics[0].items;
  const N = 6;

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
    const said = new Set((s.said ?? []).filter(x => x.i !== null).map(x => x.i));
    const shown = [...said].flatMap(i => [items[i].name, ...(items[i].alts ?? [])]).sort((a, b) => b.length - a.length);
    const body = await audience.evaluate(ns => { let t = document.querySelector('.canvas').innerText;
      for (const b of document.querySelectorAll('.cbtn')) t = t.replace(b.innerText, '');
      t = t.replace(document.getElementById('topic').innerText, '');
      for (const n of ns) t = t.split(n).join(''); return t; }, [...LONG, ...shown]);
    if (/سرقة|سهل|متوسط|صعب|انسحب|في القائمة|عنصر/.test(body)) { leak = true; fails.push(`${label}: نص ممنوع على الجمهور`); }
    const unsaid = items.filter((x, i) => !said.has(i)).flatMap(x => [x.name, ...(x.alts ?? [])]);
    if (unsaid.some(n => body.includes(n))) { leak = true; fails.push(`${label}: عنصر لم يُذكر على الجمهور (${unsaid.find(n => body.includes(n))})`); }
    if (body.includes(String(items.length))) { leak = true; fails.push(`${label}: طول القائمة على الجمهور`); }
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


  // 1. إلى الالتزام: المفتتح يزايد بـ 6، وخصمه ينسحب، ثم «ابدأ» وعنصران.
  await audience.waitForSelector('[data-cmd="draw"]', { timeout: 6000 });
  await sharedToFace(audience, { names: LONG, picks: ['auction', 'letter'] });
  await wait(2700);
  presenter = await beginTwo(context, audience);
  await presenter.waitForFunction(() => document.getElementById('status').dataset.on === 'true', null, { timeout: 6000 });
  await audience.waitForSelector('.scr.show[data-s="intro"]', { timeout: 5000 });
  const opener = (await st()).topics[0].opener, rival = other(opener);
  await presenter.click('#showQ');
  await audience.waitForSelector('.scr.show[data-s="auc"]');
  await wait(800);
  await presenter.click('[data-offer="1"]');
  await presenter.click('#aBid'); await wait(800);
  await presenter.click('#aPass'); await wait(900);
  // نقر عنصر بعد «ابدأ العدّاد» بـ 0.3 ثانية يُحسب (القائمة خارج إمهال الأزرار، ملاحظة المعاين 30).
  await presenter.click('#aCtl [data-act="start"]'); await wait(300);
  await tap(0); await wait(100); await tap(1); await wait(700);
  check(`الوفاء: ${LONG[opener - 1]} ملتزم بـ ${N}، وعنصران بعد «ابدأ» بـ 0.3 ثانية يُحسبان`, (await st()).phase === 'fulfil' && (await tally()) === `2/${N}`);

  // 2. «توقّف · لم يفِ»: الدور للخصم فوراً بعدّاد 15 ثانية.
  await presenter.click('#aCtl [data-act="stop"]');
  await wait(150);
  check('الانتقال: البطاقة تهتز', await audience.$eval('#cardWrap', e => e.classList.contains('shake')));
  await wait(900);
  check('الجمهور: الحدّ يكتسح إلى الخصم، وإطاره يعدّ 15 ثانية', await audience.$eval('#canvas', (c, t) => c.classList.contains('turn-' + t) && c.classList.contains('running'), rival)
    && Number(await audience.$eval(`#c${rival}`, e => e.textContent)) >= 13);
  check(`الجمهور: العدّ يكمل من حيث وقف «2 من ${N}»، وما ذكره الملتزم باقٍ بلونه`, (await tally()) === `2/${N}` && (await chips()).every(x => x.t === opener) && (await chips()).length === 2);
  check(`المقدّم: «دور ${LONG[rival - 1]}» و«يكمل · 0:1x · بقي 4» و«توقّف · لا نقاط» وحده`, (await text(presenter, '#aWho')) === `دور ${LONG[rival - 1]}`
    && /^يكمل · 0:1\d · بقي 4$/.test(await text(presenter, '#aState')) && /^0:1\d$/.test(await presenter.$eval('#aState .ltr', e => e.textContent))
    && (await presenter.$$eval('#aCtl button', els => els.map(e => e.textContent.trim()).join(' | '))) === 'توقّف · لا نقاط');
  check('المقدّم: القائمة تُنقر، وما ذكره الملتزم ممتلئ بلونه', !(await presenter.$eval('#aRef', e => e.classList.contains('view')))
    && await presenter.$eval('#aRef button[data-i="0"]', (e, t) => e.classList.contains('t' + t), opener));
  await both('إكمال الخصم');
  await stage.screenshot({ path: `${shots}/s4-complete.png` });
  await presenter.screenshot({ path: `${shots}/s4-presenter-complete.png` });

  // 3. الخصم يذكر: بلونه، ولا يُحسب ما ذكره الملتزم.
  await tap(0); await wait(400);
  check('نقر ما ذكره الملتزم: لا يُحسب للخصم', (await tally()) === `2/${N}`);
  await tap(2); await wait(100); await tap(3); await wait(700);
  check(`عنصران من الخصم: «4 من ${N}» بلونه، وشارتاه بلونه`, (await tally()) === `4/${N}` && await audience.$eval('#tally', (e, t) => e.classList.contains('t' + t), rival)
    && (await chips()).slice(-2).every(x => x.t === rival));
  await both('إكمال الخصم · عنصران');

  // 4. «توقّف · لا نقاط»: لا يأخذ أحد شيئاً، والحدّ في المنتصف.
  await presenter.click('#aCtl [data-act="stop"]'); await wait(1200);
  let s = await st(), sc = (await stored()).scores;
  check('«توقّف · لا نقاط»: لا نقاط لأحد، والعدّاد وقف', s.phase === 'decided' && sc[1] === 0 && sc[2] === 0 && !(await audience.$eval('#canvas', c => c.classList.contains('running'))));
  check(`الجمهور: «لا نقاط» و«ذُكر 4 من ${N}»، والحدّ في المنتصف، والقائمة كلها`, (await text(audience, '#vtext')) === 'لا نقاط' && (await text(audience, '#told')) === `ذُكر 4 من ${N}`
    && await audience.$eval('#canvas', c => !c.classList.contains('turn-1') && !c.classList.contains('turn-2')) && (await chips()).some(x => x.left));
  check('المقدّم: «لا نقاط»، والقائمة للاطلاع', (await text(presenter, '#aWho')) === 'لا نقاط' && await presenter.$eval('#aRef', e => e.classList.contains('view')));
  await both('بعد الحكم · لا نقاط');
  await stage.screenshot({ path: `${shots}/s4-none.png` });

  // 5. التراجع عن «لا نقاط»: يعود الإكمال بما بقي من الخمس عشرة ثانية، لا بها كاملة.
  await presenter.click('#aUndo'); await wait(1000);
  const back = Number(await audience.$eval(`#c${rival}`, e => e.textContent));
  check(`التراجع عن «لا نقاط»: يعود الإكمال بما بقي (${back} ثانية، لا 15)`, (await st()).phase === 'complete' && back > 0 && back < 14 && await audience.$eval('#canvas', c => c.classList.contains('running')));

  // 6. أكمل الخصم: النقاط كاملة له.
  await tap(4); await wait(100); await tap(5); await wait(1200);
  s = await st(); sc = (await stored()).scores;
  check(`أكمل الخصم: +${N} له، ولا شيء للملتزم`, s.phase === 'decided' && sc[rival] === N && sc[opener] === 0);
  check(`الجمهور: «${LONG[rival - 1]} · +${N}» و«ذُكر ${N} من ${N}»، والحدّ عنده، وما ذكره كل فريق بلونه`, (await text(audience, '#vtext')) === `${LONG[rival - 1]} · +${N}`
    && (await text(audience, '#told')) === `ذُكر ${N} من ${N}` && await audience.$eval('#canvas', (c, t) => c.classList.contains('turn-' + t), rival)
    && (await chips()).slice(0, 2).every(x => x.t === opener) && (await chips()).slice(2, N).every(x => x.t === rival));
  await both('بعد الحكم · أكمل الخصم');
  await stage.screenshot({ path: `${shots}/s4-taken.png` });

  // 7. النافذة الواحدة: من الوفاء (عنصران للملتزم، والعدّاد لم يبدأ)، «توقّف» ثم «صحيح · +1» من الخصم.
  await stage.evaluate(o => { const m = JSON.parse(localStorage.getItem('big-challenge.match')); const r = m.round, s = r.state;
    Object.assign(s, { phase: 'fulfil', team: o, said: s.said.slice(0, 2), results: s.results.map(() => null) });
    m.scores = r.scores = { 1: 0, 2: 0 }; r.timer = null; r.history = []; localStorage.setItem('big-challenge.match', JSON.stringify(m)); }, opener);
  await presenter.close();
  presenter = null;
  await wait(600);
  await stage.click('#resume');
  await wait(1200);
  await stage.reload();
  await unlock(stage).catch(() => {});
  audience = await stageFrame(stage);
  await wait(800);
  const near = () => audience.$$eval('#near .cbtn', els => els.map(e => e.textContent.trim() + (e.classList.contains('off') ? '(معطّل)' : '')).join(' | '));
  await cmd(audience, 'act:stop'); await wait(1200);
  check(`النافذة الواحدة: «توقّف» ينقل إلى الخصم، و«صحيح · +1» · «توقّف» (${await near()})`, (await st()).phase === 'complete' && (await st()).team === rival && (await near()) === 'صحيح · +1 | توقّف');
  await both('نافذة واحدة · إكمال الخصم');
  await stage.screenshot({ path: `${shots}/s4-single-complete.png` });
  const need = N - (await st()).said.length;
  for (let i = 0; i < need; i++) { await cmd(audience, 'act:count'); await wait(850); }
  await wait(600);
  s = await st(); sc = (await stored()).scores;
  check(`النافذة الواحدة: أكمل الخصم بـ «صحيح · +1»، فأخذ ${N}`, s.phase === 'decided' && sc[rival] === N && (await text(audience, '#told')) === `ذُكر ${N} من ${N}`);
  await both('نافذة واحدة · أكمل الخصم');
  await stage.screenshot({ path: `${shots}/s4-single-taken.png` });

  // 8. انتهى وقت الخصم: التراجع عن آخر عنصر يعيد الإكمال بما بقي، ثم ينتهي وقته، فلا نقاط.
  await cmd(audience, 'undo'); await wait(900);
  check('التراجع: الإكمال والعدّاد يعدّ', (await st()).phase === 'complete' && await audience.$eval('#canvas', c => c.classList.contains('running')));
  await audience.waitForFunction(() => !document.getElementById('canvas').classList.contains('running'), null, { timeout: 20000 });
  await wait(1200);
  s = await st(); sc = (await stored()).scores;
  check('انتهى وقت الخصم: لا نقاط لأحد، و«لا نقاط»', s.phase === 'decided' && s.results[0].team === 0 && sc[1] === 0 && sc[2] === 0 && (await text(audience, '#vtext')) === 'لا نقاط');

  check(`فحص التداخل والشبكة في كل حالة سليم${layoutOk ? '' : ' · ' + fails.filter(f => !f.startsWith('المقدّم')).join(' | ')}`, layoutOk);
  check(`نافذة المقدّم على 1366×768 و1280×800 و1920×1080 بلا تمرير ولا فيض ولا نص أصغر من 32${presenterOk ? '' : ' · ' + fails.filter(f => f.startsWith('المقدّم')).join(' | ')}`, presenterOk);
  check(`لا عنصر لم يُذكر ولا طول القائمة ولا نص قواعد على شاشة الجمهور قبل الحكم${leak ? ' · ' + fails.filter(f => f.includes('الجمهور')).join(' | ') : ''}`, !leak);
  check(`لا أخطاء في الصفحات${errors.length ? ': ' + errors.join(' | ') : ''}`, errors.length === 0);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });

