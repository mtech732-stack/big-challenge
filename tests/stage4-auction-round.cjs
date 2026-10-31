// اختبار آلي لمرحلة «المزايدة» في المزاد بقاعدة المالك (5.5، design/auction.md 3.0) بالنافذة الواحدة (الوثيقة 1.13)، في الرابط العادي:
// الافتتاح، والموضوع بلا طول القائمة (4.0)، وزر لكل فريق بلونه (أول نقرة رقم الخصم + 1، ثم +1) والنقرات المتتابعة كلها تُحسب،
// ورقما الفريقين على الجمهور والأعلى أكبرهما، والحدّ في المنتصف حتى «ابدأ» ثم لمن رسا عليه، والسقف طول القائمة،
// وقائمة 22، والتراجع، وإعادة التحميل،
// ولا قائمة على الجمهور، وفحص التداخل في كل حالة. (والوفاء في stage4-auction-fulfil.cjs.)
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

  // بنك تجريبي بأطول موضوع (32 حرفاً، design/auction.md 3) بقائمة مغلقة من 12 من أول أطول قائمة في البنك، والباقي من البنك.
  // لا يعتمد على اسم قائمة بعينها.
  const real = JSON.parse(fs.readFileSync(path.join(__dirname, '../content/packs/general/auction.json'), 'utf8'));
  const africa = real.topics.reduce((x, t) => (t.items.length > x.items.length ? t : x));
  const TOPIC = 'أشياء تجدها في حقيبة طالب مدرسة';
  const bank = { mode: 'auction', topics: [{ ...africa, open: undefined, id: 'test-auction-long', level: 'easy', topic: TOPIC, items: africa.items.slice(0, 12) }, ...real.topics.filter(t => t.level !== 'easy')] };
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
  const text = (page, sel) => page.textContent(sel).then(t => t.replace(/\s+/g, ' ').trim());
  const st = () => stage.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.state);

  let layoutOk = true, leak = false;
  const fails = [];
  // شاشة الجمهور: التداخل والشبكة، ولا عنصر من القائمة ولا المستوى ولا «انسحب» في نص الشاشة (عدا الأزرار في النافذة الواحدة).
  // ولا طول للقائمة على الشاشة أبداً (design/auction.md 4.0).
  const audienceCheck = async label => {
    const r = await audience.evaluate(() => window.__stageCheck());
    if (!r.ok) { layoutOk = false; fails.push(`${label}: ${r.problems.join('، ')}`); }
    const s = await st();
    const len = s.topics[s.index].items.length;
    if (await audience.$('#tsize, .auc .size')) { leak = true; fails.push(`${label}: «في القائمة» على الجمهور`); }
    const body = await audience.evaluate(ns => { let t = document.querySelector('.canvas').innerText;
      for (const b of document.querySelectorAll('.cbtn')) t = t.replace(b.innerText, '');
      t = t.replace(document.getElementById('topic').innerText, '');
      for (const n of ns) t = t.split(n).join(''); return t; }, LONG);
    if (/سرقة|سهل|متوسط|صعب|بفارق|انسحب|في القائمة|في المرجع|عنصر/.test(body)) { leak = true; fails.push(`${label}: نص ممنوع على الجمهور`); }
    // اسم من حرف أو حرفين يقع في أي نص، فلا يُبحث عنه في نص الشاشة.
    if (names.some(n => [...n].length > 2 && body.includes(n))) { leak = true; fails.push(`${label}: عنصر من القائمة على الجمهور`); }
    if (s.phase === 'bid' && body.includes(String(len))) { leak = true; fails.push(`${label}: طول القائمة على الجمهور`); }
  };
  const both = async label => { await wait(900); await audienceCheck(label); };
  const bids = page => page.$$eval('#bids .bid', els => els.map(e => ({ n: e.textContent.trim(), t: e.classList.contains('t1') ? 1 : 2, top: e.classList.contains('top'), h: e.offsetHeight })));

  const near = () => audience.$$eval('#near .cbtn', els => els.map(e => e.textContent.trim() + (e.classList.contains('off') ? '(معطّل)' : '')).join(' | '));
  const turnOn = t => audience.$eval('#canvas', (c, t) => c.classList.contains('turn-' + t), t);

  // 1. إلى المواجهة: المزاد للجولة الأولى، و«ابدأ المباراة» في الصفحة نفسها (الوثيقة 1.13).
  await audience.waitForSelector('[data-cmd="draw"]', { timeout: 6000 });
  await sharedToFace(audience, { names: LONG, picks: ['auction', 'letter'] });
  await wait(2700);
  check('المزاد يبدأ جولته («ابدأ المباراة»)، لا «تخطَّ»', await audience.isVisible('[data-cmd="begin"]'));
  await cmd(audience, 'begin');

  // 2. الافتتاح: لا مفتتح (3.0)، والحدّ في المنتصف.
  await audience.waitForSelector('.scr.show[data-s="intro"]', { timeout: 5000 });
  let s = await st();
  const centered = () => audience.$eval('#canvas', c => !c.classList.contains('turn-1') && !c.classList.contains('turn-2'));
  check('الجمهور: «زايدوا على ما تقدرون على ذكره، ثم أوفوا» و«ثلاثة مواضيع»', (await text(audience, '#rule')) === 'زايدوا على ما تقدرون على ذكره، ثم أوفوا'
    && (await text(audience, '#starter')) === 'ثلاثة مواضيع' && await centered());
  check('الجمهور: شارة «المزاد» و«الجولة 1 من 2»', (await text(audience, '#mode')) === 'المزاد' && (await text(audience, '#b1')) === 'الجولة 1 من 2');
  check('البطاقة: «اعرض الموضوع 1»', (await audience.$$eval('.scr.show .ctl .cbtn', els => els.map(e => e.textContent.trim()).join(' | '))) === 'اعرض الموضوع 1');
  await both('الافتتاح');

  // 3. الموضوع: الحدّ في المنتصف، ولا رقم بعد، ولا طول القائمة.
  await cmd(audience, 'act:show');
  await audience.waitForSelector('.scr.show[data-s="auc"]');
  await wait(600);
  // الباركود يظهر وحده عند المزايدة (الوثيقة 1.7)، ويُخفيه المقدّم بزرّه.
  check('الموضوع يبدأ بالباركود على التلفاز', await audience.$eval('#canvas', c => c.classList.contains('qr')));
  await hideQr(audience); await wait(600);
  check('الجمهور: الموضوع سطراً واحداً، و«الموضوع 1 من 3»، ولا عدّ ولا أرقام', (await text(audience, '#topic')) === TOPIC && (await text(audience, '#b1')) === 'الموضوع 1 من 3'
    && !(await audience.isVisible('#tally')) && (await bids(audience)).length === 0
    && await audience.$eval('#topic', e => e.scrollWidth <= e.clientWidth + 1 && e.getClientRects().length === 1));
  check('الجمهور: لا «في القائمة 12» بجانب الموضوع (المالك: العدد مخفي دائماً)', !(await audience.$('#tsize')) && !(await audience.$eval('.scr.auc', e => e.innerText)).includes('12'));
  check('الجمهور: الحدّ في المنتصف', await centered());
  check(`قبل أول رقم: «زايد» · «ابدأ» معطّل · «زايد» (${await near()})`, (await near()) === 'زايد | ابدأ(معطّل) | زايد');
  check('زرّا الفريقين بلونيهما', await audience.$$eval('#near .cbtn', els => els[0].classList.contains('bidt') && els[0].classList.contains('t1') && els[2].classList.contains('t2')
    && getComputedStyle(els[0]).backgroundColor !== getComputedStyle(els[2]).backgroundColor));
  await both('الموضوع');
  await stage.screenshot({ path: `${shots}/s4-open.png` });

  // 4. ثلاث نقرات متتابعة بالفأرة على زر الثاني (0.15 ثانية بينها): تُحسب كلها (1 ثم 2 ثم 3).
  const at = async t => { const r = await (await audience.$(`#near [data-cmd="raise:${t}"]`)).boundingBox(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; };
  const p2 = await at(2);
  await stage.mouse.click(p2.x, p2.y);
  await wait(150); await stage.mouse.click(p2.x, p2.y);
  await wait(150); await stage.mouse.click(p2.x, p2.y);
  await wait(300);
  let b = await bids(audience);
  check(`ثلاث نقرات متتابعة على زر الثاني تُحسب كلها: 3 (${b.map(x => x.n).join(',')})`, b.length === 1 && b[0].n === '3' && b[0].t === 2 && b[0].top && b[0].h === 136);
  check('الجمهور: الحدّ ثابت في المنتصف مع الرقم', await centered());
  check('الرقم يدخل بحركته', await audience.$eval('#bids .bid.top', e => getComputedStyle(e).animationName === 'bidin'));
  await wait(500);
  check(`«زايد» · «ابدأ» · «3» (${await near()})`, (await near()) === 'زايد | ابدأ | 3');
  await both('بعد رقم');

  // 5. أول نقرة للأول: رقم الخصم + 1 (4)، والأعلى أكبرهما. ثم يرفع الثاني إلى 11.
  await cmd(audience, 'raise:1'); await wait(500);
  b = await bids(audience);
  check('أول نقرة للأول: 4 فوق 3، وهو الأكبر (136) والثاني 88، الأول يميناً', b.map(x => `${x.t}:${x.n}${x.top ? '*' : ''}`).join(',') === '1:4*,2:3' && b[0].h === 136 && b[1].h === 88
    && await audience.$$eval('#bids .bid', els => els[0].getBoundingClientRect().left > els[1].getBoundingClientRect().left));
  check('والحدّ ما زال في المنتصف', await centered());
  await both('رقمان');
  await stage.screenshot({ path: `${shots}/s4-bid.png` });
  for (let i = 0; i < 7; i++) { const p = await at(2); await stage.mouse.click(p.x, p.y); await wait(120); }
  await wait(500);
  b = await bids(audience);
  check(`سبع نقرات للثاني: 5 ثم +1 حتى 11، والأعلى 11 (${b.map(x => x.n).join(',')})`, b.map(x => `${x.t}:${x.n}${x.top ? '*' : ''}`).join(',') === '1:4,2:11*');
  check(`«4» · «ابدأ» · «11» (${await near()})`, (await near()) === '4 | ابدأ | 11');
  await both('رقمان من خانتين');
  await stage.screenshot({ path: `${shots}/s4-bidlong.png` });

  // 6. إعادة تحميل الصفحة: المزايدة كما هي.
  await stage.reload();
  await unlock(stage);
  audience = await stageFrame(stage);
  await wait(1500);
  await hideQr(audience);
  s = await st();
  check(`إعادة تحميل الصفحة: المزايدة والأزرار كما هي (${await near()})`, s.nums.join(',') === '4,11' && s.phase === 'bid' && (await near()) === '4 | ابدأ | 11');

  // 7. «ابدأ»: يرسو المزاد على الأعلى (الثاني بـ 11)، ويبدأ الوفاء فوراً، ويكتسح الحدّ إليه.
  await cmd(audience, 'act:start');
  await wait(900);
  check('الجمهور: «0 من 11» بلون الثاني، ولا أرقام', (await text(audience, '#tn')) === '0' && (await text(audience, '#tof')) === '11' && await audience.$eval('#tally', e => e.classList.contains('t2'))
    && (await bids(audience)).length === 0);
  check('الجمهور: الحدّ يكتسح إلى الثاني، والعدّاد يعمل', await turnOn(2) && await audience.$eval('#canvas', c => c.classList.contains('running')));
  check(`«صحيح · +1» · «توقّف» (${await near()})`, (await near()) === 'صحيح · +1 | توقّف');
  await both('بعد ابدأ');
  await stage.screenshot({ path: `${shots}/s4-start.png` });

  // 8. التراجع، ثم السقف: لا يتجاوز رقمٌ العدد (12).
  const undo = () => cmd(audience, 'undo');
  await undo(); await wait(900);
  check('التراجع عن «ابدأ»: تعود المزايدة والرقمان، والحدّ في المنتصف', (await st()).phase === 'bid' && (await bids(audience)).length === 2 && !(await audience.isVisible('#tally')) && await centered());
  await cmd(audience, 'raise:1'); await wait(500);
  check(`الأول إلى 12 (فوق 11): بلغ العدد، فيُعطَّل الزرّان (${await near()})`, (await st()).nums.join(',') === '12,11' && (await near()) === '12(معطّل) | ابدأ | 11(معطّل)');
  await cmd(audience, 'act:start'); await wait(900);
  s = await st();
  check('«ابدأ»: رسا على الأول بـ 12، «0 من 12»', s.phase === 'fulfil' && s.commit.team === 1 && s.commit.n === 12 && (await text(audience, '#tof')) === '12' && await turnOn(1));
  await undo(); await wait(900);
  await undo(); await wait(900);

  // 8.1 قائمة فوق 20 (22 عنصراً): العدد مخفي عن الجمهور، والسقف 22.
  const items12 = (await st()).topics[0].items;
  const setItems = items => stage.evaluate(items => { const m = JSON.parse(localStorage.getItem('big-challenge.match')); m.round.state.topics[0].items = items; localStorage.setItem('big-challenge.match', JSON.stringify(m)); }, items);
  await setItems(africa.items.slice(0, 22).map(x => ({ name: x.name, alts: x.alts ?? [] })));
  await stage.reload(); await unlock(stage);
  audience = await stageFrame(stage);
  await wait(1500);
  await hideQr(audience);
  check(`قائمة 22: «4» · «ابدأ» · «11» (${await near()})`, (await near()) === '4 | ابدأ | 11');
  await cmd(audience, 'raise:1'); await wait(500);
  check(`قائمة 22: الأول إلى 12 فوق 11، والزرّان يعملان (السقف 22) (${await near()})`, (await near()) === '12 | ابدأ | 11');
  await both('قائمة 22');
  await stage.screenshot({ path: `${shots}/s4-bid-hidden.png` });
  await undo(); await wait(900);
  await setItems(items12);

  // 9. النافذة الواحدة بأطول اسمين ورقمين من ثلاث خانات: الأزرار في صف الشارات.
  await stage.evaluate(() => { const m = JSON.parse(localStorage.getItem('big-challenge.match')); m.scores = m.round.scores = { 1: 188, 2: 176 }; localStorage.setItem('big-challenge.match', JSON.stringify(m)); });
  await stage.reload();
  await unlock(stage);
  audience = await stageFrame(stage);
  await wait(1000);
  await hideQr(audience);
  for (let i = 0; i < 20 && (await st()).nums.some(Boolean); i++) { await cmd(audience, 'undo'); await wait(800); }
  check(`النافذة الواحدة · قبل أول رقم: «زايد» · «ابدأ» معطّل · «زايد» (${await near()})`, (await near()) === 'زايد | ابدأ(معطّل) | زايد');
  check('النافذة الواحدة: زرّا الفريقين بلونيهما', await audience.$$eval('#near .cbtn', els => els[0].classList.contains('bidt') && els[0].classList.contains('t1') && els[2].classList.contains('t2')
    && getComputedStyle(els[0]).backgroundColor !== getComputedStyle(els[2]).backgroundColor));
  await both('نافذة واحدة · الافتتاح');
  await stage.screenshot({ path: `${shots}/s4-single-open.png` });
  const nb = await (await audience.$('#near [data-cmd="raise:1"]')).boundingBox();
  await stage.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
  await wait(150); await stage.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
  await wait(150); await stage.mouse.click(nb.x + nb.width / 2, nb.y + nb.height / 2);
  await wait(900);
  check(`ثلاث نقرات متتابعة على زر الأول في النافذة الواحدة تُحسب كلها: 3 (${(await bids(audience)).map(x => x.n).join(',')})`, (await bids(audience)).map(x => x.n).join(',') === '3');
  await cmd(audience, 'raise:2'); await wait(800);
  check(`النافذة الواحدة: الثاني 4 فوق 3، و«3» · «ابدأ» · «4» (${await near()})، والحدّ في المنتصف`, (await bids(audience)).map(x => `${x.t}:${x.n}`).join(',') === '1:3,2:4' && (await near()) === '3 | ابدأ | 4' && await centered());
  await both('نافذة واحدة · المزايدة');
  await stage.screenshot({ path: `${shots}/s4-single-bid.png` });
  await cmd(audience, 'act:start'); await wait(900);
  check(`«ابدأ» في النافذة الواحدة: «0 من 4» للثاني والعدّاد يعمل، و«صحيح · +1» · «توقّف» (${await near()})`, (await text(audience, '#tn')) === '0' && (await text(audience, '#tof')) === '4'
    && (await st()).commit.team === 2 && await turnOn(2) && (await near()) === 'صحيح · +1 | توقّف');
  await both('نافذة واحدة · الوفاء');
  await stage.screenshot({ path: `${shots}/s4-single-start.png` });

  check(`فحص التداخل والشبكة في كل حالة سليم${layoutOk ? '' : ' · ' + fails.join(' | ')}`, layoutOk);
  check(`لا قائمة ولا طولها ولا نص قواعد على شاشة الجمهور${leak ? ' · ' + fails.join(' | ') : ''}`, !leak);
  check(`لا أخطاء في الصفحات${errors.length ? ': ' + errors.join(' | ') : ''}`, errors.length === 0);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
