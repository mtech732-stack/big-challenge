// اختبار آلي لمرحلة «الوفاء والعدّ» في المزاد (ش4، design/auction.md) بالنافذة الواحدة (الوثيقة 1.13)، في الرابط العادي:
// الملتزم قبل «ابدأ» وبعده، والعدّ بـ«صحيح · +1» (بلون الملتزم، وعدّات متتابعة تُحسب كلها، وعشر ضغطات في أقل من ثانية عشر عدّات والزر لا يتعطّل، ش8-أ/54)،
// والعدّاد يبقى يعدّ، والتراجع (سريعاً بلا مهلة داخل الوفاء، ش8-أ/55)، والحكم التلقائي عند بلوغ العدد (النقاط، و«ذُكر N من N»، ولا القائمة)، والتراجع عن الحكم بما بقي من الوقت،
// وإعادة التحميل، و«توقّف» (و«لم يفِ» في stage4-auction-fail.cjs)، وعرض ما ذُكر بأسمائه بعد الحكم، ولا عنصر لم يُذكر على الجمهور، وفحص التداخل.
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
    const shown = [...said].flatMap(i => [items[i].name, ...(items[i].alts ?? [])]).sort((a, b) => b.length - a.length);
    const body = await audience.evaluate(ns => { let t = document.querySelector('.canvas').innerText;
      for (const b of document.querySelectorAll('.cbtn')) t = t.replace(b.innerText, '');
      t = t.replace(document.getElementById('topic').innerText, '');
      for (const c of ['c1', 'c2']) t = t.replace(document.getElementById(c)?.innerText ?? '', ''); // ثواني العدّاد ليست طول القائمة
      for (const n of ns) t = t.split(n).join(''); return t; }, [...LONG, ...shown]);
    if (/سرقة|سهل|متوسط|صعب|انسحب|في القائمة|عنصر/.test(body)) { leak = true; fails.push(`${label}: نص ممنوع على الجمهور`); }
    const unsaid = items.filter((x, i) => !said.has(i)).flatMap(x => [x.name, ...(x.alts ?? [])]);
    // اسم من حرف أو حرفين («ت» أو «7») يقع في أي نص، فلا يُبحث عنه في نص الشاشة: الشارات وحدها تحمل ما ذُكر.
    const named = n => [...n].length > 2 && body.includes(n);
    if (unsaid.some(named)) { leak = true; fails.push(`${label}: عنصر لم يُذكر على الجمهور (${unsaid.find(named)})`); }
    // ولا طول للقائمة على الجمهور أبداً (4.0).
    if (await audience.$('#tsize, .auc .size')) { leak = true; fails.push(`${label}: «في القائمة» على الجمهور`); }
    if (body.includes(String(items.length)) && s.commit?.n !== items.length && !(s.bids ?? []).some(b => b.n === items.length)) { leak = true; fails.push(`${label}: طول القائمة على الجمهور`); }
  };
  const both = async label => { await wait(700); await audienceCheck(label); };
  const chips = () => audience.$$eval('#items .it', els => els.map(e => ({ name: e.textContent.trim(), t: e.classList.contains('t1') ? 1 : e.classList.contains('t2') ? 2 : 0, left: e.classList.contains('left'), more: e.classList.contains('more') })));
  const tally = async () => `${await text(audience, '#tn')}/${await text(audience, '#tof')}`;

  // 1. إلى الوفاء: يزايد فريق (عشوائي) بزرّه حتى 30، ثم «ابدأ» يرسي عليه ويبدأ العدّاد فوراً (3.0؛ القائمة 54، فالعدد مخفي).
  // والعدّ بـ«صحيح · +1» في البطاقة (الوثيقة 1.13: القائمة للمقدّم في الباركود).
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
  // و«صحيح · +1» بعد 100 ms من «تراجع» تُحسب (لا مهلة بعد التراجع داخل الوفاء).
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
    check('«صحيح · +1» بعد 100 ms من «تراجع»: تُحسب (25 من 30، لا 24)', (await tally()) === `25/${N}`);
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

  // 7. بلغ العدد: يُحكم تلقائياً.
  const before = (await stored()).scores[opener];
  await cmd(audience, 'act:count'); await wait(400); await cmd(audience, 'act:count');
  await wait(1200);
  s = await st();
  const scores = (await stored()).scores;
  check(`30 من 30: يُحكم تلقائياً، +${N} للملتزم`, s.phase === 'decided' && scores[opener] === before + N && scores[other(opener)] === 0);
  check(`الجمهور: «${LONG[opener - 1]} · +${N}» و«ذُكر 30 من 30»`, (await text(audience, '#vtext')) === `${LONG[opener - 1]} · +${N}` && (await text(audience, '#told')) === `ذُكر ${N} من ${N}`);
  check('الجمهور: الحدّ عند الملتزم، والعدّاد وقف، والعدّ الكبير غاب', await audience.$eval('#canvas', (c, t) => c.classList.contains('turn-' + t) && !c.classList.contains('running'), opener) && !(await audience.isVisible('#tally')));
  check('بعد الحكم: لا شارات (لا أسماء ولا القائمة)، و«الموضوع التالي» وحده في البطاقة', (await chips()).length === 0
    && (await audience.$$eval('.scr.show .ctl .cbtn', els => els.map(e => e.textContent.trim()).join(' | '))) === 'الموضوع التالي');
  await both('بعد الحكم');
  await stage.screenshot({ path: `${shots}/s4-won.png` });

  // 8. التراجع عن الحكم يعيد الوفاء بما بقي، ثم «صحيح · +1» مرتين متقاربتين عدّتان (ش8-أ/54)، و«توقّف». يُتراجع عن عدّتين (28 من 30).
  const leftAt = async () => Number(await audience.$eval(`#c${opener}`, e => e.textContent));
  await undo(); await wait(900);
  const back = await leftAt();
  check(`التراجع عن الحكم: يعود الوفاء بما بقي من الوقت (${back} ثانية، لا 45)`, (await st()).phase === 'fulfil' && back > 0 && back < 44
    && await audience.$eval('#canvas', c => c.classList.contains('running')));
  await undo(); await wait(900);
  // ما بقي من الوقت بعد التراجع قليل (نحو 8 ثوانٍ)، وخطوات النافذة الواحدة أطول منه، فينتهي فيُحكم آلياً.
  // فيُعاد عدّاد الوفاء الجاري كاملاً (60) من الآن، في الحالة المحفوظة، ثم تُعاد الشاشة. لا تغيير في اللعبة.
  await stage.evaluate(() => { const m = JSON.parse(localStorage.getItem('big-challenge.match'));
    m.round.timer = { ...m.round.timer, seconds: 60 }; m.timerAt = Date.now(); localStorage.setItem('big-challenge.match', JSON.stringify(m)); });
  await stage.reload();
  await unlock(stage).catch(() => {});
  audience = await stageFrame(stage);
  await wait(800);
  const near = () => audience.$$eval('#near .cbtn', els => els.map(e => e.textContent.trim() + (e.classList.contains('off') ? '(معطّل)' : '')).join(' | '));
  check(`النافذة الواحدة والعدّاد يعدّ: «صحيح · +1» · «توقّف» (${await near()})`, (await near()) === 'صحيح · +1 | توقّف');
  const nb = (await audience.$$('#near .cbtn'))[0], box = await nb.boundingBox();
  const shown = (await chips()).length;
  await stage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await wait(150); await stage.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await wait(1200);
  check('«صحيح · +1» مرتين بفاصل 0.15 ثانية: عدّتان، فبلغ العدد (30 من 30) وحُكم، ولا اسم جديد على الشاشة', (await st()).phase === 'decided' && (await st()).said.length === N && (await chips()).length === shown);
  // تراجع يعبر حدّ مرحلة (من الحكم إلى الوفاء، ش8-أ/55): المهلة باقية، فنقرة «تراجع» مضاعفة بفاصل 0.1 ثانية تُلغي الحكم وحده، لا عدّة معه.
  {
    const ub = await (await audience.$('[data-cmd="undo"]')).boundingBox(), [ux, uy] = [ub.x + ub.width / 2, ub.y + ub.height / 2];
    await stage.mouse.click(ux, uy); await wait(100); await stage.mouse.click(ux, uy);
  }
  await wait(900);
  check('التراجع عن الحكم بنقرة مضاعفة: «29 من 30» والوفاء (الثانية في المهلة فلا تُرجع عدّة)', (await tally()) === `29/${N}` && (await st()).phase === 'fulfil');
  await both('نافذة واحدة · الوفاء');
  await stage.screenshot({ path: `${shots}/s4-single-fulfil.png` });
  await cmd(audience, 'act:stop'); await wait(900);
  s = await st();
  check(`«توقّف»: لم يفِ، فللخصم نقطتان، و«الموضوع التالي» في البطاقة (stage4-auction-fail)`, s.phase === 'decided' && s.results[0].team === other(opener) && s.results[0].points === 2 && !(await near()));
  await both('نافذة واحدة · لم يفِ');
  await cmd(audience, 'undo'); await wait(900);
  await cmd(audience, 'act:count'); await wait(1200);
  s = await st();
  check('النافذة الواحدة: بلغ العدد بـ «صحيح · +1»، فيُحكم، وتبقى البطاقة على ما قيل، لا القائمة (4.0)', s.phase === 'decided' && (await text(audience, '#told')) === `ذُكر ${N} من ${N}` && !(await chips()).some(x => x.left));
  await both('نافذة واحدة · بعد الحكم');
  await stage.screenshot({ path: `${shots}/s4-single-won.png` });

  // 9. بعد الحكم وما ذُكر 15 بأسمائه (حالة محفوظة: يبقى العرض سليماً إن حملت أسماء) (design/auction.md 4.0): يبقى ما ذُكر وحده بلون الملتزم، لا القائمة، وما لا يتسع في «و N غيرها».
  await stage.evaluate(() => { const m = JSON.parse(localStorage.getItem('big-challenge.match')); const s = m.round.state;
    s.said = s.said.slice(0, 15).map((x, i) => ({ i, team: x.team })); localStorage.setItem('big-challenge.match', JSON.stringify(m)); });
  await stage.reload();
  await unlock(stage).catch(() => {});
  audience = await stageFrame(stage);
  await wait(1200);
  const c = await chips();
  const named = c.filter(x => !x.more), more = c.find(x => x.more);
  check(`15 مما ذُكر بعد الحكم: ${named.length} بلون الملتزم${more ? ` و«${more.name}»` : ''}، ولا ما لم يُذكر`,
    named.every(x => x.t === opener && !x.left) && named.length + (more ? Number(more.name.replace(/\D/g, '')) : 0) === 15 && named.length >= 10
    && !named.some(x => !items.some(i => i.name === x.name)));
  await both('بعد الحكم · 15 ذُكر');
  await stage.screenshot({ path: `${shots}/s4-reveal.png` });

  check(`فحص التداخل والشبكة في كل حالة سليم${layoutOk ? '' : ' · ' + fails.join(' | ')}`, layoutOk);
  check(`لا عنصر لم يُذكر ولا طول القائمة ولا نص قواعد على شاشة الجمهور قبل الحكم${leak ? ' · ' + fails.filter(f => f.includes('الجمهور')).join(' | ') : ''}`, !leak);
  check(`لا أخطاء في الصفحات${errors.length ? ': ' + errors.join(' | ') : ''}`, errors.length === 0);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
