// اختبار آلي لمرحلة «الوفاء والعدّ» في المزاد (ش4، design/auction.md) بالنافذتين وبالنافذة الواحدة، في الرابط العادي:
// الملتزم قبل «ابدأ» وبعده، ونقر عناصر القائمة في نافذة المقدّم (+1 بلون الملتزم، لا مكرر، ونقرات متتابعة تُحسب كلها)،
// وما ذُكر على الجمهور وسقوط أقدمه، والعدّاد يبقى يعدّ، والتراجع، والحكم التلقائي عند بلوغ العدد (النقاط، وما ذُكر وحده لا القائمة، و«ذُكر N من N»)،
// وإعادة التحميل، و«صحيح · +1» و«توقّف» في النافذة الواحدة (و«لم يفِ» في stage4-auction-fail.cjs)، ولا عنصر لم يُذكر على الجمهور قبل الحكم ولا بعده، وفحص التداخل ونافذة المقدّم.
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
  // نقرة بالفأرة في موضع العنصر i بعد تمريره إلى النظر (القائمة تُمرَّر داخل لوحتها، 4.0)، لا page.click: ينتظر ثبات الزر فيؤخر النقرة.
  const at = async i => presenter.$eval(`#aRef button[data-i="${i}"]`, e => { e.scrollIntoView({ block: "nearest" }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
  const tap = async i => { const p = await at(i); await presenter.mouse.click(p.x, p.y); };

  // 1. إلى الوفاء: يزايد فريق (عشوائي) بزرّه حتى 30، ثم «ابدأ» يرسي عليه ويبدأ العدّاد فوراً (3.0؛ القائمة 54، فالعدد مخفي).
  await audience.waitForSelector('[data-cmd="draw"]', { timeout: 6000 });
  await sharedToFace(audience, { names: LONG, picks: ['auction', 'letter'] });
  await wait(2700);
  presenter = await beginTwo(context, audience);
  await presenter.waitForFunction(() => document.getElementById('status').dataset.on === 'true', null, { timeout: 6000 });
  await audience.waitForSelector('.scr.show[data-s="intro"]', { timeout: 5000 });
  const opener = Math.random() < 0.5 ? 1 : 2;
  await presenter.click('#showQ');
  await audience.waitForSelector('.scr.show[data-s="auc"]');
  await wait(800);
  for (let n = 1; n <= N; n++) { await presenter.click(`#aCtl [data-raise="${opener}"]`); await wait(80); }
  await wait(600);
  check(`المزايدة: ${LONG[opener - 1]} بـ ${N} («المزايدة · الأعلى ${N}»)`, (await st()).nums[opener - 1] === N && (await text(presenter, '#aWho')) === `المزايدة · الأعلى ${N}`);
  check('المقدّم: القائمة للاطلاع في المزايدة', await presenter.$eval('#aRef', e => e.classList.contains('view')));

  // 2. «ابدأ»: يرسو على ${N} ويعدّ 60 ثانية فوراً، و«توقّف · لم يفِ» وحده، والقائمة تُنقر.
  await presenter.click('#aCtl [data-act="start"]');
  await wait(1300);
  let s = await st();
  check(`«ابدأ»: ${LONG[opener - 1]} ملتزم بـ ${N}، والجمهور يعدّ (الإطار يتآكل حول لوحته)`, s.phase === 'fulfil' && s.commit.team === opener && s.commit.n === N
    && await audience.$eval('#canvas', (c, t) => c.classList.contains('running') && c.classList.contains('turn-' + t), opener));
  check(`المقدّم: «0:5x · بقي ${N}» (الوقت في حاوية ltr) و«صحيحة · +1» · «تراجع» · «توقّف · لم يفِ» (4.1)`, new RegExp(`^0:5\\d · بقي ${N}$`).test(await text(presenter, '#aState'))
    && /^0:5\d$/.test(await presenter.$eval('#aState .ltr', e => e.textContent))
    && (await presenter.$$eval('#aCtl button', els => els.map(e => e.textContent.trim()).join(' | '))) === 'صحيحة · +1 | تراجع | توقّف · لم يفِ');
  check('المقدّم: القائمة أزرار تُنقر (لا «للاطلاع»)', !(await presenter.$eval('#aRef', e => e.classList.contains('view'))));
  const timer = (await stored()).round.timer.id;
  await tap(0); await wait(600);
  check(`أول عنصر: «1 من ${N}» بلون الملتزم، واسمه شارة بلونه`, (await tally()) === `1/${N}` && await audience.$eval('#tally', (e, t) => e.classList.contains('t' + t), opener)
    && JSON.stringify(await chips()) === JSON.stringify([{ name: items[0].name, t: opener, left: false, more: false }]));
  check('المقدّم: العنصر ممتلئ بلون الملتزم', await presenter.$eval('#aRef button[data-i="0"]', (e, t) => e.classList.contains('t' + t), opener));
  await both('الوفاء · أول عنصر');

  // 4. نقرات متتابعة على عناصر مختلفة (0.1 ثانية بينها) تُحسب كلها، ونقرتان على العنصر نفسه عنصر واحد.
  for (const i of [1, 2, 3]) { await tap(i); await wait(100); }
  await wait(400);
  check('ثلاثة عناصر بفاصل 0.1 ثانية: تُحسب كلها (4 من 30)', (await tally()) === `4/${N}`);
  await tap(4); await wait(150); await tap(4); await wait(500);
  check('نقرتان على العنصر نفسه: يُحسب مرة (5 من 30)', (await tally()) === `5/${N}`);
  check('العدّاد نفسه يعدّ بعد كل عنصر', (await stored()).round.timer?.id === timer && await audience.$eval('#canvas', c => c.classList.contains('running')));
  check('العنصر الجديد يدخل بحركته، والعدّ ينبض', await audience.$eval('#items .it:last-child', e => getComputedStyle(e).animationName === 'itin'));
  await both('الوفاء · خمسة');
  await stage.screenshot({ path: `${shots}/s4-fulfil.png` });
  await presenter.screenshot({ path: `${shots}/s4-presenter-fulfil.png` });

  // 5. حتى 29 من 30: ما لا يتسع في ثلاثة صفوف يسقط أقدمه، والأحدث باقٍ.
  for (let i = 5; i < N - 1; i++) { await tap(i); await wait(60); }
  await wait(700);
  let c = await chips();
  check(`29 من 30: يسقط الأقدم (يبقى ${c.length})، والأحدث باقٍ، وثلاثة صفوف حداً`, (await tally()) === `29/${N}` && c.length < 29 && c[c.length - 1].name === items[N - 2].name
    && await audience.$eval('#items', e => { const tops = new Set([...e.children].map(x => Math.round(x.getBoundingClientRect().top))); return tops.size <= 3; }));
  await both('الوفاء · 29');

  // 6. التراجع عن عنصر: يعود العدّ، ويبقى العدّاد. و«تراجع» في الوفاء بجانب «صحيحة · +1»، وفي غيره في الصف الأعلى (4.1).
  const undo = () => presenter.locator('#aUndo:visible, #aCtl [data-undo]').first().click();
  await undo(); await wait(900);
  check('التراجع: «28 من 30»، والعنصر يعود يُنقر، والعدّاد يبقى', (await tally()) === `28/${N}` && !(await presenter.$eval(`#aRef button[data-i="${N - 2}"]`, e => e.classList.contains('t1') || e.classList.contains('t2')))
    && (await stored()).round.timer?.id === timer);
  // إعادة تحميل الشاشة ثم المقدّم أثناء العدّ.
  await stage.reload();
  await unlock(stage).catch(() => {});
  audience = await stageFrame(stage);
  await wait(1200);
  check('إعادة تحميل الشاشة: العدّ والعدّاد كما هما', (await tally()) === `28/${N}` && await audience.$eval('#canvas', c => c.classList.contains('running')));
  await presenter.reload();
  await presenter.waitForSelector('#app:not([hidden])', { timeout: 10000 }).catch(() => {});
  await wait(1500);
  check('إعادة تحميل المقدّم: ما ذُكر ممتلئ (28)', (await presenter.$$('#aRef button.t1, #aRef button.t2')).length === 28);

  // 7. بلغ العدد: يُحكم تلقائياً.
  const before = (await stored()).scores[opener];
  await tap(N - 2); await wait(300); await tap(N - 1);
  await wait(1200);
  s = await st();
  const scores = (await stored()).scores;
  check(`30 من 30: يُحكم تلقائياً، +${N} للملتزم`, s.phase === 'decided' && scores[opener] === before + N && scores[other(opener)] === 0);
  check(`الجمهور: «${LONG[opener - 1]} · +${N}» و«ذُكر 30 من 30»`, (await text(audience, '#vtext')) === `${LONG[opener - 1]} · +${N}` && (await text(audience, '#told')) === `ذُكر ${N} من ${N}`);
  check('الجمهور: الحدّ عند الملتزم، والعدّاد وقف، والعدّ الكبير غاب', await audience.$eval('#canvas', (c, t) => c.classList.contains('turn-' + t) && !c.classList.contains('running'), opener) && !(await audience.isVisible('#tally')));
  c = await chips();
  // ثلاثون مما ذُكر لا تتسع كلها في الصفوف الأربعة: يبقى أولها، و«و N غيرها» عن باقي ما ذُكر. ولا القائمة (4.0).
  const shownN = c.filter(x => !x.more).length;
  const tail = c[c.length - 1];
  check(`بعد الحكم ما ذُكر وحده بلونه${shownN < N ? `، و«و ${N - shownN} غيرها» عن باقيه` : ' كله'} (${shownN} ظاهرة)، لا القائمة`,
    c.filter(x => !x.more).every((x, i) => x.t === opener && x.name === items[i].name)
    && (shownN === N ? !tail.more : tail.more && tail.name === `و ${N - shownN} غيرها`));
  check('المقدّم: الحكم و«الموضوع التالي» وحده، والقائمة للاطلاع', (await text(presenter, '#aWho')).includes(`+${N}`)
    && (await presenter.$$eval('#aCtl button', els => els.map(e => e.textContent.trim()).join(' | '))) === 'الموضوع التالي' && await presenter.$eval('#aRef', e => e.classList.contains('view')));
  await both('بعد الحكم');
  await stage.screenshot({ path: `${shots}/s4-won.png` });

  // 8. النافذة الواحدة: «صحيح · +1» دون أسماء، و«توقّف». يُتراجع عن عنصرين (28 من 30).
  const leftAt = async () => Number(await audience.$eval(`#c${opener}`, e => e.textContent));
  await undo(); await wait(900);
  const back = await leftAt();
  check(`التراجع عن الحكم: يعود الوفاء بما بقي من الوقت (${back} ثانية، لا 60)`, (await st()).phase === 'fulfil' && back > 0 && back < 56
    && await audience.$eval('#canvas', c => c.classList.contains('running')));
  await undo(); await wait(900);
  await presenter.close();
  presenter = null;
  await wait(600);
  await stage.click('#resume');
  await wait(1200);
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
  await wait(900);
  check('«صحيح · +1» مرتين بفاصل 0.15 ثانية: عنصر واحد (29 من 30)، ولا اسم جديد على الشاشة', (await tally()) === `29/${N}` && (await chips()).length === shown);
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

  // 9. بعد الحكم وما ذُكر 15 (design/auction.md 4.0): يبقى ما ذُكر وحده بلون الملتزم، لا القائمة، وما لا يتسع في «و N غيرها».
  await stage.evaluate(() => { const m = JSON.parse(localStorage.getItem('big-challenge.match')); const s = m.round.state;
    s.said = s.said.filter(x => x.i !== null).slice(0, 15); localStorage.setItem('big-challenge.match', JSON.stringify(m)); });
  await stage.reload();
  await unlock(stage).catch(() => {});
  audience = await stageFrame(stage);
  await wait(1200);
  c = await chips();
  const named = c.filter(x => !x.more), more = c.find(x => x.more);
  check(`15 مما ذُكر بعد الحكم: ${named.length} بلون الملتزم${more ? ` و«${more.name}»` : ''}، ولا ما لم يُذكر`,
    named.every(x => x.t === opener && !x.left) && named.length + (more ? Number(more.name.replace(/\D/g, '')) : 0) === 15 && named.length >= 10
    && !named.some(x => !items.some(i => i.name === x.name)));
  await both('بعد الحكم · 15 ذُكر');
  await stage.screenshot({ path: `${shots}/s4-reveal.png` });

  check(`فحص التداخل والشبكة في كل حالة سليم${layoutOk ? '' : ' · ' + fails.filter(f => !f.startsWith('المقدّم')).join(' | ')}`, layoutOk);
  check(`نافذة المقدّم على 1366×768 و1280×800 و1920×1080 بلا تمرير ولا فيض ولا نص أصغر من 32${presenterOk ? '' : ' · ' + fails.filter(f => f.startsWith('المقدّم')).join(' | ')}`, presenterOk);
  check(`لا عنصر لم يُذكر ولا طول القائمة ولا نص قواعد على شاشة الجمهور قبل الحكم${leak ? ' · ' + fails.filter(f => f.includes('الجمهور')).join(' | ') : ''}`, !leak);
  check(`لا أخطاء في الصفحات${errors.length ? ': ' + errors.join(' | ') : ''}`, errors.length === 0);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
