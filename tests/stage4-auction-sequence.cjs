// اختبار آلي لمرحلة «تتابع الجولة» في المزاد (ش4، القسم 5.5) بالنافذة الواحدة (الوثيقة 1.13)، بالبنك الحقيقي، في الرابط العادي:
// ثلاثة مواضيع (سهل ثم متوسط ثم صعب) بلا مفتتح (3.0)، و«الموضوع التالي» يعرض الموضوع فوراً للمزايدة والحدّ في المنتصف،
// ومسار المواضيع بمن أخذ كلاً منها (ومنه الخصم بنقطتيه إن لم يفِ الملتزم، 2.0)، و«إنهاء الجولة» بعد الثالث فشاشة النهاية بحصيلة كل فريق، والتراجع عن النهاية،
// و«الموضوع التالي» و«إنهاء الجولة» في صف الشارات (الوثيقة 1.14، design/s8c.md 1)، و«شريط البونص» في البطاقة، والحكم بعد «كشف القائمة». وفحص التداخل في كل حالة.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace, hideQr, auctionNamesShown } = require('./helpers.cjs');

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
  const text = (page, sel) => page.textContent(sel).then(t => t.replace(/\s+/g, ' ').trim());
  const stored = () => stage.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')));
  const st = async () => (await stored()).round.state;
  const other = t => (t === 1 ? 2 : 1);

  let layoutOk = true, leak = false;
  const fails = [];
  // شاشة الجمهور: التداخل والشبكة، ولا عنصر لم يُذكر قبل الحكم، ولا طول القائمة ولا نص قواعد.
  const audienceCheck = async label => {
    const r = await audience.evaluate(() => window.__stageCheck());
    if (!r.ok) { layoutOk = false; fails.push(`${label}: ${r.problems.join('، ')}`); }
    const s = await st();
    // وبعد الحكم كذلك: لا القائمة ولا ما لم يُذكر منها (design/auction.md 4.0).
    if (!s.topics[s.index]) return;
    const items = s.topics[s.index].items;
    const said = new Set((s.said ?? []).filter(x => x.i !== null).map(x => x.i));
    // وبعد «كشف القائمة» (الوثيقة 1.14) القائمة كلها على الشاشة، فلا يُبحث فيها عمّا لم يُذكر.
    const listed = ['revealed', 'decided'].includes(s.phase);
    const shown = (listed ? items.map((_, i) => i) : [...said]).flatMap(i => [items[i].name, ...(items[i].alts ?? [])]).sort((a, b) => b.length - a.length);
    const body = await audience.evaluate(ns => { let t = document.querySelector('.canvas').innerText;
      for (const b of document.querySelectorAll('.cbtn')) t = t.replace(b.innerText, '');
      t = t.replace(document.getElementById('topic').innerText, '');
      for (const n of ns) t = t.split(n).join(''); return t; }, [...LONG, ...shown]);
    if (/سرقة|سهل|متوسط|صعب|انسحب|في القائمة|عنصر/.test(body)) { leak = true; fails.push(`${label}: نص ممنوع على الجمهور`); }
    const unsaid = items.filter((x, i) => !said.has(i)).flatMap(x => [x.name, ...(x.alts ?? [])]);
    // اسم من حرف أو حرفين («ت» أو «7») يقع في أي نص، فلا يُبحث عنه في نص الشاشة: الشارات وحدها تحمل ما ذُكر.
    const named = n => [...n].length > 2 && body.includes(n);
    if (!listed && unsaid.some(named)) { leak = true; fails.push(`${label}: عنصر لم يُذكر على الجمهور (${unsaid.find(named)})`); }
    // ولا طول للقائمة على الجمهور أبداً (4.0).
    if (await audience.$('#tsize, .auc .size')) { leak = true; fails.push(`${label}: «في القائمة» على الجمهور`); }
    if (body.includes(String(items.length)) && s.commit?.n !== items.length && !(s.bids ?? []).some(b => b.n === items.length)) { leak = true; fails.push(`${label}: طول القائمة على الجمهور`); }
  };
  const both = async label => { await wait(700); await audienceCheck(label); };
  // ش8-أ/61: الأسماء التي لا يجوز ظهورها، بنص الشاشة كلها (helpers.cjs auctionNamesShown).
  const names = async () => auctionNamesShown(audience, await st(), LONG);
  const tally = async () => `${await text(audience, '#tn')}/${await text(audience, '#tof')}`;
  const round = async () => (await stored()).round;
  const card = () => audience.$$eval('.scr.show .ctl .cbtn', els => els.map(e => e.textContent.trim()).join(' | '));
  const near = () => audience.$$eval('#near .cbtn', els => els.map(e => e.textContent.trim() + (e.classList.contains('off') ? '(معطّل)' : '')).join(' | '));
  // «كشف القائمة» ثم الحكم («ok» وفى أو «fail» لم يفِ)، وبينهما مهلة 0.7 ثانية بعد تغيّر المرحلة (الوثيقة 1.14).
  const judge = async verdict => { await wait(300); await cmd(audience, 'act:reveal'); await wait(1000); await cmd(audience, 'act:' + verdict); await wait(1200); };
  // من أخذ كل موضوع (مسار المواضيع في الحالة؛ لا مسار على الجمهور).
  const won = async () => (await st()).results.map(r => r?.team ?? 0);
  // يزايد الفريق t بزرّه حتى n (خصمه بلا رقم)، ثم «ابدأ» يرسي عليه ويبدأ الوفاء (3.0).
  const bidTo = async (n, t) => { for (let k = 1; k <= n; k++) { await cmd(audience, 'raise:' + t); await wait(150); } await wait(500); await cmd(audience, 'act:start'); await wait(900); };
  const centered = () => audience.$eval('#canvas', c => !c.classList.contains('turn-1') && !c.classList.contains('turn-2'));

  // 1. إلى الموضوع الأول.
  await audience.waitForSelector('[data-cmd="draw"]', { timeout: 6000 });
  await sharedToFace(audience, { names: LONG, picks: ['auction', 'letter'] });
  await wait(2700);
  await cmd(audience, 'begin');
  await audience.waitForSelector('.scr.show[data-s="intro"]', { timeout: 5000 });
  let s = await st();
  const first = Math.random() < 0.5 ? 1 : 2;
  check('ثلاثة مواضيع: سهل ثم متوسط ثم صعب، بلا مفتتح', s.topics.map(t => t.level).join(',') === 'easy,medium,hard' && s.topics.every(t => !('opener' in t)));
  await cmd(audience, 'act:show');
  await audience.waitForSelector('.scr.show[data-s="auc"]');
  await wait(800);
  await hideQr(audience);

  // 2. الموضوع الأول: يزايد فريق بـ 3 فيرسو عليه، ويفي.
  await bidTo(3, first);
  for (let k = 0; k < 3; k++) { await cmd(audience, 'act:count'); await wait(300); }
  await wait(600);
  check('الموضوع 1: بلغ العدّ 3 من 3 ولا حكم قبل الكشف (الوثيقة 1.14)', (await st()).phase === 'fulfil' && (await round()).scores[first] === 0);
  await judge('ok');
  check(`الموضوع 1: الكشف ثم «وفى»، فلمن رسا عليه +3، و«الموضوع التالي» وحده في صف الشارات (${await near()})`, (await st()).phase === 'decided' && (await round()).scores[first] === 3 && (await near()) === 'الموضوع التالي' && !(await card()));
  let w = await won();
  check('مسار المواضيع: الأول لمن أخذه، والثاني والثالث لم يُلعبا', w.join(',') === `${first},0,0`);
  await both('الموضوع 1 · بعد الحكم');

  // 3. «الموضوع التالي»: الموضوع 2 يظهر فوراً للمزايدة، والحدّ في المنتصف.
  await cmd(audience, 'act:next'); await wait(1200);
  await hideQr(audience);
  s = await st();
  check('الموضوع 2: «الموضوع 2 من 3» على الشاشة، ونصّه، والمزايدة فوراً', s.index === 1 && s.phase === 'bid' && (await text(audience, '#b1')) === 'الموضوع 2 من 3'
    && (await text(audience, '#topic')) === s.topics[1].topic);
  check(`الموضوع 2: الحدّ في المنتصف، ولا أرقام ولا عدّ ولا قائمة`, s.team === 0 && s.nums.join(',') === '0,0' && await centered()
    && !(await audience.isVisible('#tally')) && !(await names()).length && !(await audience.$$('#bids .bid')).length && !(await audience.isVisible('#verdict')));
  check(`«زايد» · «ابدأ» معطّل · «زايد» (${await near()})`, (await near()) === 'زايد | ابدأ(معطّل) | زايد');
  await both('الموضوع 2 · الافتتاح');
  await stage.screenshot({ path: `${shots}/s4-topic2.png` });

  // 4. الموضوع 2: يرسو على الآخر بـ 3، ثم الكشف و«لم يفِ»، فيأخذ خصمه نقطتين.
  await bidTo(3, other(first));
  await judge('fail');
  w = await won();
  check('الموضوع 2: لم يفِ الآخر، فللأول نقطتان (رصيده 5)، والمسار باسمه', (await st()).phase === 'decided' && (await round()).scores[first] === 5 && (await round()).scores[other(first)] === 0 && w[1] === first);

  // 5. الموضوع 3 (الصعب، أطول قائمة): يرسو على الأول بـ 1، ثم الكشف و«لم يفِ»، فللآخر نقطتان، ثم «إنهاء الجولة».
  await cmd(audience, 'act:next'); await wait(1200);
  await hideQr(audience);
  s = await st();
  check('الموضوع 3: صعب بأطول قائمة، والحدّ في المنتصف', s.index === 2 && s.team === 0 && await centered() && s.topics[2].items.length > 30 && (await text(audience, '#b1')) === 'الموضوع 3 من 3');
  await both('الموضوع 3 · الافتتاح');
  check(`الموضوع 3: «زايد» · «ابدأ» معطّل · «زايد» (${await near()})`, (await near()) === 'زايد | ابدأ(معطّل) | زايد');
  await bidTo(1, first);
  await both('الموضوع 3 · الالتزام');
  await judge('fail');
  w = await won();
  check(`الموضوع 3: لم يفِ الأول، فللآخر 2، و«إنهاء الجولة» في صف الشارات لا في البطاقة (${await near()})، والمسار: الأول · الأول · الآخر`, (await st()).phase === 'decided' && (await near()) === 'إنهاء الجولة'
    && !(await card()) && w.join(',') === `${first},${first},${other(first)}`);
  await both('الموضوع 3 · لم يفِ');
  await stage.screenshot({ path: `${shots}/s4-single-last.png` });

  // 6. «إنهاء الجولة»: شاشة النهاية بحصيلة كل فريق، و«شريط البونص» في البطاقة.
  await cmd(audience, 'act:next'); await wait(1500);
  check('النهاية: «انتهت الجولة 1»، و+5 للأول و+2 للآخر', await audience.isVisible('.scr.show[data-s="end"]') && (await text(audience, '#b1')) === 'انتهت الجولة 1'
    && (await text(audience, '#r' + first)) === '+5' && (await text(audience, '#r' + other(first))) === '+2');
  check('النهاية: «التالي: …» على الشاشة، والحدّ في المنتصف', /^التالي:/.test(await text(audience, '#next')) && await audience.$eval('#canvas', c => !c.classList.contains('turn-1') && !c.classList.contains('turn-2')));
  check(`النهاية: «شريط البونص» في البطاقة (${await card()})`, (await card()) === 'شريط البونص');
  await both('نهاية الجولة');
  await stage.screenshot({ path: `${shots}/s4-end.png` });
  await cmd(audience, 'undo'); await wait(1000);
  check('التراجع عن «إنهاء الجولة»: يعود حكم الموضوع 3', (await st()).phase === 'decided' && (await st()).index === 2);

  // 7. التراجع إلى الموضوع الثاني ثم «الموضوع التالي» من صف الشارات.
  for (let i = 0; i < 12 && !((await st()).index === 1 && (await st()).phase === 'decided'); i++) { await cmd(audience, 'undo'); await wait(800); }
  check(`«الموضوع التالي» في صف الشارات بعد حكم الموضوع 2 (${await near()})`, (await st()).index === 1 && (await near()) === 'الموضوع التالي');
  await cmd(audience, 'act:next'); await wait(1200);
  check('الموضوع 3 بعد التراجع وإعادته: الباركود على حاله مخفياً (أخفاه المقدّم لهذا الموضوع قبل التراجع)', !(await hideQr(audience)) && !(await audience.$eval('#canvas', c => c.classList.contains('qr'))));
  check('الموضوع 3 للمزايدة، و«زايد» · «ابدأ» معطّل · «زايد» في صف الشارات', (await st()).index === 2 && (await st()).phase === 'bid' && (await text(audience, '#b1')) === 'الموضوع 3 من 3'
    && (await audience.$$eval('#near .cbtn', els => els.map(e => e.textContent.trim() + (e.classList.contains('off') ? '(معطّل)' : '')).join(' | '))) === 'زايد | ابدأ(معطّل) | زايد');

  check(`فحص التداخل والشبكة في كل حالة سليم${layoutOk ? '' : ' · ' + fails.join(' | ')}`, layoutOk);
  check(`لا عنصر قبل الكشف ولا طول القائمة ولا نص قواعد على شاشة الجمهور${leak ? ' · ' + fails.filter(f => f.includes('الجمهور')).join(' | ') : ''}`, !leak);
  check(`لا أخطاء في الصفحات${errors.length ? ': ' + errors.join(' | ') : ''}`, errors.length === 0);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });

