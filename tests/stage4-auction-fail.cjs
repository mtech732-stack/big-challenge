// اختبار آلي لـ«لم يفِ» في المزاد بقاعدة المالك المصحّحة (5.5، design/auction.md 2.0) بالنافذتين وبالنافذة الواحدة، في الرابط العادي:
// «توقّف · لم يفِ» يعطي الخصم نقطتين ثابتتين ولا إكمال (اهتزاز البطاقة، ثم الحدّ إلى الخصم وزيادة رقمه)، والحكم «[الخصم] · +2» بلا عدّاد ثانٍ،
// وسطر المقدّم «[الخصم] · +2» و«لم يفِ · ذُكر 2 من 5»، والتراجع يعيد الوفاء بما بقي من الوقت والرصيد، وفحص التداخل ونافذة المقدّم
// بقائمة أفريقيا (54) على المقاسات الثلاثة، ولا عنصر لم يُذكر قبل الحكم. (حلّ محل stage4-auction-complete بعد إلغاء «إكمال الخصم».)
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
  const N = 5;

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
      t = t.replace(document.getElementById('topic').innerText, '').replace(document.getElementById('tsize').innerText, '');
      for (const n of ns) t = t.split(n).join(''); return t; }, [...LONG, ...shown]);
    if (/سرقة|سهل|متوسط|صعب|انسحب|في القائمة|عنصر/.test(body)) { leak = true; fails.push(`${label}: نص ممنوع على الجمهور`); }
    const unsaid = items.filter((x, i) => !said.has(i)).flatMap(x => [x.name, ...(x.alts ?? [])]);
    if (unsaid.some(n => body.includes(n))) { leak = true; fails.push(`${label}: عنصر لم يُذكر على الجمهور (${unsaid.find(n => body.includes(n))})`); }
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


  // 1. إلى الالتزام رقماً رقماً: المفتتح يذكر 5 (1 و3 و5)، وخصمه يتوقف، ثم «ابدأ» وعنصران.
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
  for (let n = 1; n <= N; n++) { await presenter.click('#aBid'); await wait(760); }
  await presenter.click('#aCtl [data-act="stop"]'); await wait(900);
  // نقر عنصر بعد «ابدأ العدّاد» بـ 0.3 ثانية يُحسب (القائمة خارج إمهال الأزرار، ملاحظة المعاين 30).
  await presenter.click('#aCtl [data-act="start"]'); await wait(300);
  await tap(0); await wait(100); await tap(1); await wait(4000);
  check(`الوفاء: ${LONG[opener - 1]} ملتزم بـ ${N}، وعنصران بعد «ابدأ» بـ 0.3 ثانية يُحسبان`, (await st()).phase === 'fulfil' && (await st()).commit.team === opener && (await tally()) === `2/${N}`);
  const score = t => audience.$eval('#s' + t, e => e.textContent.replace(/\s+/g, '').trim());

  // 2. «توقّف · لم يفِ»: البطاقة تهتز، ثم للخصم نقطتان، ولا عدّاد بعدها.
  await presenter.click('#aCtl [data-act="stop"]');
  await wait(150);
  check('لم يفِ: البطاقة تهتز', await audience.$eval('#cardWrap', e => e.classList.contains('shake')));
  await wait(1200);
  let s = await st(), sc = (await stored()).scores;
  check(`لم يفِ: +2 للخصم (${LONG[rival - 1]})، ولا شيء للملتزم، والحكم فوراً`, s.phase === 'decided' && sc[rival] === 2 && sc[opener] === 0 && s.results[0].team === rival && s.results[0].points === 2);
  check('الجمهور: الحدّ عند الخصم، ولا عدّاد يعمل، ورقمه الكبير 2', await audience.$eval('#canvas', (c, t) => c.classList.contains('turn-' + t) && !c.classList.contains('running'), rival)
    && (await score(rival)).includes('2'));
  check(`الجمهور: «${LONG[rival - 1]} · +2» بلا مربع و«ذُكر 2 من ${N}»، والقائمة كلها وما ذكره الملتزم بلونه`, (await text(audience, '#vtext')) === `${LONG[rival - 1]} · +2`
    && (await text(audience, '#told')) === `ذُكر 2 من ${N}` && await audience.$eval('#box', b => b.classList.contains('bare'))
    && (await chips()).slice(0, 2).every(x => x.t === opener) && (await chips()).some(x => x.left));
  check(`المقدّم: «${LONG[rival - 1]} · +2» و«لم يفِ · ذُكر 2 من ${N}» و«الموضوع التالي»`, (await text(presenter, '#aWho')).endsWith(`${LONG[rival - 1]} · +2`)
    && (await text(presenter, '#aState')) === `لم يفِ · ذُكر 2 من ${N}`
    && (await presenter.$$eval('#aCtl button', els => els.map(e => e.textContent.trim()).join(' | '))) === 'الموضوع التالي' && await presenter.$eval('#aRef', e => e.classList.contains('view')));
  await both('بعد الحكم · لم يفِ');
  await stage.screenshot({ path: `${shots}/s4-failed-t${rival}.png` });
  await presenter.screenshot({ path: `${shots}/s4-presenter-failed.png` });

  // 3. التراجع عن «لم يفِ»: يعود الوفاء بما بقي من الوقت (لا 60)، وتعود النقطتان.
  await presenter.click('#aUndo'); await wait(1000);
  const back = Number(await audience.$eval(`#c${opener}`, e => e.textContent));
  sc = (await stored()).scores;
  check(`التراجع عن «لم يفِ»: يعود الوفاء بما بقي (${back} ثانية، لا 60)، والرصيد 0`, (await st()).phase === 'fulfil' && back > 0 && back < 59 && await audience.$eval('#canvas', c => c.classList.contains('running')) && sc[rival] === 0);

  // 4. النافذة الواحدة: من الوفاء (عنصران للملتزم، والعدّاد لم يبدأ)، «توقّف» فللخصم نقطتان.
  await stage.evaluate(o => { const m = JSON.parse(localStorage.getItem('big-challenge.match')); const r = m.round, s = r.state;
    Object.assign(s, { phase: 'ready', team: o, said: s.said.slice(0, 2), results: s.results.map(() => null) });
    m.scores = r.scores = { 1: 188, 2: 176 }; r.timer = null; r.history = []; localStorage.setItem('big-challenge.match', JSON.stringify(m)); }, opener);
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
  const card = () => audience.$$eval('.scr.show .ctl .cbtn', els => els.map(e => e.textContent.trim()).join(' | '));
  check(`النافذة الواحدة قبل «ابدأ»: «ابدأ» · «صحيح · +1» (${await near()})`, (await near()) === 'ابدأ | صحيح · +1');
  await cmd(audience, 'act:start'); await wait(1000);
  check(`النافذة الواحدة والعدّاد يعدّ: «صحيح · +1» · «توقّف» (${await near()})`, (await near()) === 'صحيح · +1 | توقّف');
  await cmd(audience, 'act:stop'); await wait(1400);
  s = await st(); sc = (await stored()).scores;
  check(`النافذة الواحدة: «توقّف»، فللخصم نقطتان (${sc[rival]})، و«الموضوع التالي» في البطاقة لا في صف الشارات (${await card()})`, s.phase === 'decided'
    && sc[rival] === (rival === 1 ? 190 : 178) && (await card()) === 'الموضوع التالي' && !(await audience.$$('#near .cbtn')).length);
  await both('نافذة واحدة · لم يفِ');
  await stage.screenshot({ path: `${shots}/s4-single-failed-t${rival}.png` });

  check(`فحص التداخل والشبكة في كل حالة سليم${layoutOk ? '' : ' · ' + fails.filter(f => !f.startsWith('المقدّم')).join(' | ')}`, layoutOk);
  check(`نافذة المقدّم على 1366×768 و1280×800 و1920×1080 بلا تمرير ولا فيض ولا نص أصغر من 32${presenterOk ? '' : ' · ' + fails.filter(f => f.startsWith('المقدّم')).join(' | ')}`, presenterOk);
  check(`لا عنصر لم يُذكر ولا طول القائمة ولا نص قواعد على شاشة الجمهور قبل الحكم${leak ? ' · ' + fails.filter(f => f.includes('الجمهور')).join(' | ') : ''}`, !leak);
  check(`لا أخطاء في الصفحات${errors.length ? ': ' + errors.join(' | ') : ''}`, errors.length === 0);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
