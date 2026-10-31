// اختبار آلي لمرحلة «الوفاء والعدّ» في المزاد (ش4، design/auction.md) بالنافذة الواحدة (الوثيقة 1.13)، في الرابط العادي:
// الملتزم قبل «ابدأ» وبعده، والعدّ بـ«عُدّ · +1» (بلون الملتزم، وعدّات متتابعة تُحسب كلها، وعشر ضغطات في أقل من ثانية عشر عدّات والزر لا يتعطّل، ش8-أ/54)،
// والعدّاد يبقى يعدّ، والتراجع (سريعاً بلا مهلة داخل الوفاء، ش8-أ/55)، وبلوغ العدد لا يحكم (الوثيقة 1.14)، ثم «كشف القائمة» (يقف الوقت،
// والقائمة صفحاتٍ بنقاطها تُقلب يدوياً، design/s8c.md 1.1)، ثم «وفى» (النقاط، و«وفى بـ N» بلا مربع)، والتراجع عن الحكم ثم عن الكشف بما بقي من الوقت،
// وإعادة التحميل، و«لم يفِ» (وتفصيله في stage4-auction-fail.cjs)، ولا أسماء ما ذُكر على الجمهور، ولا عنصر قبل الكشف، وفحص التداخل.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace, hideQr } = require('./helpers.cjs');

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
  const N = 30;

  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block' });
  await usePin(context);
  await context.route('**/content/packs/general/auction.json', route => route.fulfill({ json: bank }));
  // وقت الوفاء 45 ثانية (الوثيقة 1.6، ويفحصه stage4-auction-mode). وخطوات 30 عنصراً بلقطاتها وإعادة التحميل أطول منه،
  // فيُمدّ هنا إلى 60 بالمتصفح وحده، فلا ينقضي قبل الحكم. والأرقام أدناه بـ60 لهذا.
  await context.route('**/js/modes/auction.js', async route => {
    const r = await route.fetch(); route.fulfill({ response: r, body: (await r.text()).replace('FULFIL_SECONDS = 45', 'FULFIL_SECONDS = 60') });
  });
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
    const said = new Set((s.said ?? []).filter(x => x.i !== null).map(x => x.i));
    // وبعد «كشف القائمة» (الوثيقة 1.14) القائمة كلها على الشاشة، فلا يُبحث فيها عمّا لم يُذكر.
    const listed = ['revealed', 'decided'].includes(s.phase);
    const shown = (listed ? items.map((_, i) => i) : [...said]).flatMap(i => [items[i].name, ...(items[i].alts ?? [])]).sort((a, b) => b.length - a.length);
    const body = await audience.evaluate(ns => { let t = document.querySelector('.canvas').innerText;
      for (const b of document.querySelectorAll('.cbtn')) t = t.replace(b.innerText, '');
      t = t.replace(document.getElementById('topic').innerText, '');
      for (const c of ['c1', 'c2']) t = t.replace(document.getElementById(c)?.innerText ?? '', ''); // ثواني العدّاد ليست طول القائمة
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
  const chips = () => audience.$$eval('#items .it', els => els.map(e => ({ name: e.textContent.trim(), t: e.classList.contains('t1') ? 1 : e.classList.contains('t2') ? 2 : 0, left: e.classList.contains('left'), more: e.classList.contains('more') })));
  const tally = async () => `${await text(audience, '#tn')}/${await text(audience, '#tof')}`;

  // 1. إلى الوفاء: يزايد فريق (عشوائي) بزرّه حتى 30، ثم «ابدأ» يرسي عليه ويبدأ العدّاد فوراً (3.0؛ القائمة 54، فالعدد مخفي).
  // والعدّ بـ«عُدّ · +1» في البطاقة (الوثيقة 1.13: القائمة للمقدّم في الباركود).
  await audience.waitForSelector('[data-cmd="draw"]', { timeout: 6000 });
  await sharedToFace(audience, { names: LONG, picks: ['auction', 'letter'] });
  await wait(2700);
  await cmd(audience, 'begin');
  await audience.waitForSelector('.scr.show[data-s="intro"]', { timeout: 5000 });
  const opener = Math.random() < 0.5 ? 1 : 2;
  await cmd(audience, 'act:show');
  await audience.waitForSelector('.scr.show[data-s="auc"]');
  await wait(800);
  await hideQr(audience);
  for (let n = 1; n <= N; n++) { await cmd(audience, 'raise:' + opener); await wait(80); }
  await wait(600);
  check(`المزايدة: ${LONG[opener - 1]} بـ ${N}`, (await st()).nums[opener - 1] === N && (await st()).phase === 'bid');

  // 2. «ابدأ»: يرسو على ${N} ويعدّ فوراً.
  await cmd(audience, 'act:start');
  await wait(1300);
  let s = await st();
  check(`«ابدأ»: ${LONG[opener - 1]} ملتزم بـ ${N}، والجمهور يعدّ (الإطار يتآكل حول لوحته)`, s.phase === 'fulfil' && s.commit.team === opener && s.commit.n === N
    && await audience.$eval('#canvas', (c, t) => c.classList.contains('running') && c.classList.contains('turn-' + t), opener));
  const timer = (await stored()).round.timer.id;
  await cmd(audience, 'act:count'); await wait(600);
  check(`أول عدّة: «1 من ${N}» بلون الملتزم، ولا شارة اسم`, (await tally()) === `1/${N}` && await audience.$eval('#tally', (e, t) => e.classList.contains('t' + t), opener)
    && (await chips()).length === 0);
  await both('الوفاء · أول عدّة');

  // 4. عدّات متتابعة (0.4 ثانية بينها) تُحسب كلها، والعدّاد نفسه يعدّ.
  for (let k = 0; k < 4; k++) { await cmd(audience, 'act:count'); await wait(400); }
  await wait(400);
  check('أربع عدّات بفاصل 0.4 ثانية: تُحسب كلها (5 من 30)', (await tally()) === `5/${N}`);
  check('العدّاد نفسه يعدّ بعد كل عدّة', (await stored()).round.timer?.id === timer && await audience.$eval('#canvas', c => c.classList.contains('running')));
  await both('الوفاء · خمسة');
  await stage.screenshot({ path: `${shots}/s4-fulfil.png` });

  // 4ب. سرعة السرد (ش8-أ/54، المالك في لعب حقيقي): عشر ضغطات متتالية في أقل من ثانية تُحسب كلها، والزر لا يتعطّل بينها.
  {
    const btn = await audience.$('#near [data-cmd="act:count"]'), bb = await btn.boundingBox();
    const offs = [];
    const t0 = Date.now();
    for (let k = 0; k < 10; k++) {
      await stage.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2);
      offs.push(await audience.$eval('#near [data-cmd="act:count"]', e => e.classList.contains('off')).catch(() => true));
    }
    const took = Date.now() - t0;
    await wait(400);
    check(`عشر ضغطات في ${took} ms (أقل من ثانية): العدّ 15 من 30، لا ضغطة سقطت ولا حُسبت مرتين`, took < 1000 && (await tally()) === `15/${N}` && (await st()).said.length === 15);
    check(`والزر لم يتعطّل بعد أي ضغطة (${offs.filter(Boolean).length} معطّلة من 10)`, offs.every(x => !x));
  }

  // 5. حتى 29 من 30.
  for (let k = 15; k < N - 1; k++) { await cmd(audience, 'act:count'); await wait(260); }
  await wait(700);
  check('29 من 30', (await tally()) === `29/${N}` && (await st()).phase === 'fulfil');
  await both('الوفاء · 29');

  // 6. التراجع عن عدّة: يعود العدّ، ويبقى العدّاد.
  const undo = () => cmd(audience, 'undo');
  await undo(); await wait(900);
  check('التراجع: «28 من 30»، والعدّاد يبقى', (await tally()) === `28/${N}` && (await stored()).round.timer?.id === timer);
  // 6ب. تراجع سريع (ش8-أ/55، تقرير المعاين #338): ثلاث ضغطات «تراجع» متتالية تُرجع ثلاث عدّات،
  // و«عُدّ · +1» بعد 100 ms من «تراجع» تُحسب (لا مهلة بعد التراجع داخل الوفاء).
  {
    const at = async sel => { const b = await (await audience.$(sel)).boundingBox(); return [b.x + b.width / 2, b.y + b.height / 2]; };
    const [ux, uy] = await at('[data-cmd="undo"]');
    for (let k = 0; k < 3; k++) { await stage.mouse.click(ux, uy); await wait(120); }
    await wait(400);
    check('ثلاث ضغطات «تراجع» سريعة: ترجع ثلاث عدّات (25 من 30)، والعدّاد يبقى', (await tally()) === `25/${N}` && (await st()).said.length === 25
      && (await stored()).round.timer?.id === timer);
    const [cx, cy] = await at('#near [data-cmd="act:count"]');
    await stage.mouse.click(ux, uy); await wait(100); await stage.mouse.click(cx, cy);
    await wait(400);
    check('«عُدّ · +1» بعد 100 ms من «تراجع»: تُحسب (25 من 30، لا 24)', (await tally()) === `25/${N}`);
    for (let k = 0; k < 3; k++) { await stage.mouse.click(cx, cy); await wait(120); }
    await wait(400);
    check('ثم ثلاث عدّات تعيده إلى «28 من 30»', (await tally()) === `28/${N}`);
  }
  // إعادة تحميل الشاشة أثناء العدّ.
  await stage.reload();
  await unlock(stage);
  audience = await stageFrame(stage);
  await wait(1200);
  await hideQr(audience);
  check('إعادة تحميل الشاشة: العدّ والعدّاد كما هما', (await tally()) === `28/${N}` && await audience.$eval('#canvas', c => c.classList.contains('running')));

  // 7. بلغ العدد: لا حكم (1.14، «عُدّ · +1» عدّاد مساعد)، والعدّاد يعدّ. ثم «كشف القائمة» يوقفه ويُظهر القائمة صفحاتٍ بنقاطها، ثم «وفى».
  const before = (await stored()).scores[opener];
  await cmd(audience, 'act:count'); await wait(400); await cmd(audience, 'act:count');
  await wait(1000);
  s = await st();
  check(`30 من 30: لا حكم، والعدّاد يبقى يعدّ (عدّاد مساعد، 1.14)`, s.phase === 'fulfil' && (await tally()) === `${N}/${N}` && (await stored()).scores[opener] === before
    && await audience.$eval('#canvas', c => c.classList.contains('running')));
  const nearT = () => audience.$$eval('#near .cbtn', els => els.map(e => e.textContent.trim() + (e.classList.contains('t1') ? '(1)' : e.classList.contains('t2') ? '(2)' : '')).join(' | '));
  const ansT = () => audience.$$eval('#ansCtl .cbtn', els => els.map(e => e.textContent.trim()).join(' | '));
  check(`السرد: «عُدّ · +1» في صف الشارات و«كشف القائمة» ثانوياً بإطار أسفل اليمين (ش8-أ/57) (${await nearT()} · ${await ansT()})`, (await nearT()) === 'عُدّ · +1' && (await ansT()) === 'كشف القائمة'
    && await audience.$eval('#ansCtl .cbtn', b => b.classList.contains('alt') && getComputedStyle(b).backgroundColor === 'rgba(0, 0, 0, 0)'));
  await cmd(audience, 'act:reveal'); await wait(1000);
  s = await st();
  const dots = () => audience.$$eval('#cxDots i', els => els.map(e => e.classList.contains('on') ? 'X' : 'o').join(''));
  const page = () => audience.$$eval('#cxList .cx-pg', els => els.findIndex(e => !e.hidden));
  const listed = () => audience.$$eval('#cxList .cx-it', els => els.map(e => e.textContent.trim()));
  check('الكشف: يقف العدّاد ولا حكم، ويغيب العدّ، ولا باركود', s.phase === 'revealed' && !(await audience.$eval('#canvas', c => c.classList.contains('running') || c.classList.contains('qr')))
    && !(await audience.isVisible('#tally')) && (await stored()).scores[opener] === before);
  const all = await listed(), pages = (await dots()).length;
  check(`الكشف: القائمة كلها بترتيبها (${all.length}) صفحاتٍ من 4 أسطر، ونقطة لكل صفحة (${await dots()})، والأولى ظاهرة`, all.join('|') === items.map(x => x.name).join('|') && pages >= 2
    && (await dots()) === 'X' + 'o'.repeat(pages - 1) && (await page()) === 0 && (await audience.$$eval('#cxList .cx-pg', els => els.length)) === pages);
  check('الصفحة الظاهرة في أسطرها الأربعة (192)', await audience.$eval('#cxList', box => [...box.querySelector('.cx-pg:not([hidden])').children].every(e => e.offsetTop + e.offsetHeight <= 192 + 1)));
  check(`بعد الكشف: «وفى · +${N}» بلون الملتزم و«لم يفِ · +2» بلون الخصم، ولا «كشف القائمة» (${await nearT()})`, (await nearT()) === `وفى · +${N}(${opener}) | لم يفِ · +2(${other(opener)})` && !(await ansT()));
  await both('بعد الكشف');
  await stage.screenshot({ path: `${shots}/s4-list.png` });
  // التقليب يدوي (المالك 31 أكتوبر 2026): لا يتغير وحده، ونقرة على القائمة التالية، ونقرة على نقطة صفحتها.
  await wait(1500);
  check('لا تقليب وحده', (await page()) === 0);
  await audience.click('#cxList'); await wait(400);
  check(`نقرة على القائمة: الصفحة الثانية (${await dots()})`, (await page()) === 1 && (await dots())[1] === 'X');
  await audience.click(`#cxDots i[data-page="${pages - 1}"]`); await wait(400);
  check('نقرة على النقطة الأخيرة: صفحتها', (await page()) === pages - 1);
  await audience.click('#cxList'); await wait(400);
  check('ومن الأخيرة إلى الأولى', (await page()) === 0);
  await audience.click('#cxList'); await wait(400);
  await cmd(audience, 'act:ok'); await wait(1200);
  s = await st();
  const scores = (await stored()).scores;
  check(`«وفى»: +${N} للملتزم`, s.phase === 'decided' && scores[opener] === before + N && scores[other(opener)] === 0);
  check(`الجمهور: «${LONG[opener - 1]} · +${N}» و«وفى بـ ${N}» بلا مربع، ولا «ذُكر»`, (await text(audience, '#vtext')) === `${LONG[opener - 1]} · +${N}` && (await text(audience, '#say')) === `وفى بـ ${N}`
    && !(await audience.isVisible('#told')) && await audience.$eval('#box', b => b.classList.contains('bare')));
  check('الجمهور: الحدّ عند الملتزم، والعدّاد وقف، والعدّ الكبير غاب', await audience.$eval('#canvas', (c, t) => c.classList.contains('turn-' + t) && !c.classList.contains('running'), opener) && !(await audience.isVisible('#tally')));
  check('بعد الحكم: القائمة باقية على الصفحة الظاهرة (الثانية)، ولا شارات أسماء', (await page()) === 1 && (await chips()).length === 0);
  check(`بعد الحكم: «الموضوع التالي» وحده في صف الشارات (${await nearT()})`, (await nearT()) === 'الموضوع التالي' && !(await audience.$$('.scr.show .ctl .cbtn')).length);
  await both('بعد الحكم');
  await stage.screenshot({ path: `${shots}/s4-won.png` });

  // 8. التراجع عن الحكم يعيد الكشف، وعن الكشف يعيد الوفاء بما بقي. ثم «عُدّ · +1» مرتين متقاربتين عدّتان (ش8-أ/54)، والكشف و«لم يفِ».
  const leftAt = async () => Number(await audience.$eval(`#c${opener}`, e => e.textContent));
  await undo(); await wait(900);
  check('التراجع عن «وفى»: يعود الكشف بزرّي الحكم، والنقاط تعود', (await st()).phase === 'revealed' && (await stored()).scores[opener] === before && (await nearT()).startsWith('وفى'));
  await undo(); await wait(900);
  const back = await leftAt();
  check(`التراجع عن الكشف: يعود الوفاء بما بقي من الوقت (${back} ثانية، لا 45)، والعدّ كما كان`, (await st()).phase === 'fulfil' && back > 0 && back < 44
    && await audience.$eval('#canvas', c => c.classList.contains('running')) && (await tally()) === `${N}/${N}`);
  await undo(); await wait(400); await undo(); await wait(900);
  // ما بقي من الوقت بعد التراجع قليل، وخطوات النافذة الواحدة أطول منه. فيُعاد عدّاد الوفاء الجاري كاملاً (60) من الآن،
  // في الحالة المحفوظة، ثم تُعاد الشاشة. لا تغيير في اللعبة.
  await stage.evaluate(() => { const m = JSON.parse(localStorage.getItem('big-challenge.match'));
    m.round.timer = { ...m.round.timer, seconds: 60 }; m.timerAt = Date.now(); localStorage.setItem('big-challenge.match', JSON.stringify(m)); });
  await stage.reload();
  await unlock(stage).catch(() => {});
  audience = await stageFrame(stage);
  await wait(800);
  const near = () => audience.$$eval('#near .cbtn', els => els.map(e => e.textContent.trim() + (e.classList.contains('off') ? '(معطّل)' : '')).join(' | '));
  check(`النافذة الواحدة والعدّاد يعدّ (28 من 30): «عُدّ · +1» و«كشف القائمة» (${await near()})`, (await near()) === 'عُدّ · +1' && (await ansT()) === 'كشف القائمة' && (await tally()) === `${N - 2}/${N}`);
  const nb = (await audience.$$('#near .cbtn'))[0], box = await nb.boundingBox();
  await stage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await wait(150); await stage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await wait(1200);
  check('«عُدّ · +1» مرتين بفاصل 0.15 ثانية: عدّتان (30 من 30)، ولا حكم ولا اسم على الشاشة', (await st()).phase === 'fulfil' && (await st()).said.length === N && (await chips()).length === 0);
  await cmd(audience, 'act:reveal'); await wait(1000);
  // تراجع يعبر حدّ مرحلة (من الكشف إلى الوفاء، ش8-أ/55): المهلة باقية، فنقرة «تراجع» مضاعفة بفاصل 0.1 ثانية تُلغي الكشف وحده، لا عدّة معه.
  {
    const ub = await (await audience.$('[data-cmd="undo"]')).boundingBox(), [ux, uy] = [ub.x + ub.width / 2, ub.y + ub.height / 2];
    await stage.mouse.click(ux, uy); await wait(100); await stage.mouse.click(ux, uy);
  }
  await wait(900);
  check('التراجع عن الكشف بنقرة مضاعفة: «30 من 30» والوفاء (الثانية في المهلة فلا تُرجع عدّة)', (await tally()) === `${N}/${N}` && (await st()).phase === 'fulfil');
  await both('نافذة واحدة · الوفاء');
  await stage.screenshot({ path: `${shots}/s4-single-fulfil.png` });
  await cmd(audience, 'act:reveal'); await wait(1000);
  await cmd(audience, 'act:fail'); await wait(900);
  s = await st();
  check(`الكشف ثم «لم يفِ»: فللخصم نقطتان، و«الموضوع التالي» في صف الشارات (stage4-auction-fail)`, s.phase === 'decided' && s.results[0].team === other(opener) && s.results[0].points === 2
    && (await near()) === 'الموضوع التالي' && (await text(audience, '#say')) === `لم يفِ بـ ${N}`);
  await both('نافذة واحدة · لم يفِ');
  await cmd(audience, 'undo'); await wait(900);
  await cmd(audience, 'act:ok'); await wait(1200);
  s = await st();
  check('النافذة الواحدة: التراجع ثم «وفى»، فيُحكم للملتزم، وتبقى القائمة لا «ذُكر» (1.14)', s.phase === 'decided' && s.results[0].team === opener && (await text(audience, '#say')) === `وفى بـ ${N}`
    && !(await audience.isVisible('#told')) && await audience.isVisible('#cxList'));
  await both('نافذة واحدة · بعد الحكم');
  await stage.screenshot({ path: `${shots}/s4-single-won.png` });

  // 9. حالة محفوظة بأسماء ما ذُكر (من نسخة قبل 1.13): لا تظهر الأسماء على التلفاز بعد 1.14، والقائمة المكشوفة كما هي.
  await stage.evaluate(() => { const m = JSON.parse(localStorage.getItem('big-challenge.match')); const s = m.round.state;
    s.said = s.said.slice(0, 15).map((x, i) => ({ i, team: x.team })); localStorage.setItem('big-challenge.match', JSON.stringify(m)); });
  await stage.reload();
  await unlock(stage).catch(() => {});
  audience = await stageFrame(stage);
  await wait(1200);
  check('حالة محفوظة بأسماء 15 مما ذُكر: لا شارات أسماء، والقائمة المكشوفة كلها', (await chips()).length === 0 && (await listed()).length === items.length);
  await both('بعد الحكم · حالة محفوظة بأسماء');
  await stage.screenshot({ path: `${shots}/s4-reveal.png` });

  check(`فحص التداخل والشبكة في كل حالة سليم${layoutOk ? '' : ' · ' + fails.join(' | ')}`, layoutOk);
  check(`لا عنصر قبل الكشف ولا طول القائمة ولا نص قواعد على شاشة الجمهور${leak ? ' · ' + fails.filter(f => f.includes('الجمهور')).join(' | ') : ''}`, !leak);
  check(`لا أخطاء في الصفحات${errors.length ? ': ' + errors.join(' | ') : ''}`, errors.length === 0);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
