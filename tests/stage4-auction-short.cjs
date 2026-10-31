// اختبار آلي لـ«بعد الحكم» في المزاد (الوثيقة 1.14، design/s8c.md: الحكم بعد «كشف القائمة»، والقائمة المرجعية كلها على البطاقة) بالنافذة الواحدة (الوثيقة 1.13)، بالبنك الحقيقي:
// الحكم بلا مربع (الشارة بيضاء بنص صاحبها، والسطر «وفى بـ N» أو «لم يفِ بـ N» على الطرف)، والقائمة القصيرة في صفحة بلا نقاط،
// وأطول قائمة صفحاتٍ من أربعة أسطر بنقطة لكل صفحة. وبقاعدة 2.0: «لم يفِ» في القصيرة الأولى (للخصم +2) و«وفى» في الثانية.
// ولا يعتمد على اسم قائمة بعينها: القصيرتان من أقصر أسماء أطول قائمة، بالحد الأدنى للبنك (10 عناصر).
// وفحص التداخل في كل حالة، وصور لـ ratio.cjs.
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

  // من البنك الحقيقي: أطول قائمة كما هي، وقائمتان قصيرتان بالحد الأدنى (10) من أقصر أسمائها، فتتسع شاراتها الكبيرة في صفين.
  const real = JSON.parse(fs.readFileSync(path.join(__dirname, '../content/packs/general/auction.json'), 'utf8'));
  const longest = real.topics.reduce((a, t) => (t.items.length > a.items.length ? t : a));
  const MIN = 10;
  const shortNames = [...longest.items].sort((a, b) => [...a.name].length - [...b.name].length).slice(0, 2 * MIN);
  const shortTopic = (k, level) => ({ ...longest, id: `short-${k}`, level, topic: `قائمة قصيرة ${k}`, items: shortNames.slice((k - 1) * MIN, k * MIN) });
  const keep = ['قائمة قصيرة 1', 'قائمة قصيرة 2', longest.topic];
  const bank = { ...real, topics: [shortTopic(1, 'easy'), shortTopic(2, 'medium'), { ...longest, level: 'hard' }] };
  const SHORT = MIN, LONGEST = longest.items.length;

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
  // شاشة الجمهور: التداخل والشبكة، ولا عنصر لم يُذكر قبل الحكم ولا بعده، ولا طول القائمة ولا نص قواعد.
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
  // «عُدّ · +1» حتى يُحسب: العدّ بلا مهلة (ش8-أ/54)، فإن أبطأ الجهاز أُعيد.
  const say = async () => {
    for (let k = 0; k < 6; k++) {
      const s0 = (await stored()).round.state;
      if (s0.phase !== 'fulfil') return;
      await cmd(audience, 'act:count');
      for (let w = 0; w < 10; w++) { await wait(100); if ((await stored()).round.state.said.length > s0.said.length) return; }
    }
  };
  // «كشف القائمة» ثم الحكم («ok» وفى أو «fail» لم يفِ)، وبينهما مهلة 0.7 ثانية بعد تغيّر المرحلة.
  const judge = async verdict => { await wait(300); await cmd(audience, 'act:reveal'); await wait(1000); await cmd(audience, 'act:' + verdict); await wait(1400); };

  const round = async () => (await stored()).round;
  const ctl = () => audience.$$eval('.scr.show .ctl .cbtn, #near .cbtn', els => els.map(e => e.textContent.trim()).join(' | '));
  // المزايدة رقماً رقماً حتى n، ثم يتوقف صاحب الدور، فيلتزم من ذكر n.
  // يزايد الفريق t بزرّه حتى n (خصمه بلا رقم)، ثم «ابدأ» يرسي عليه ويبدأ الوفاء (3.0).
  const bidTo = async (n, t) => { for (let k = 1; k <= n; k++) { await cmd(audience, 'raise:' + t); await wait(120); } await wait(500); await cmd(audience, 'act:start'); await wait(900); };
  // بعد الحكم: المربع بلا خلفية، والشارة بيضاء بنص صاحبها، والسطر ظاهر. والقائمة المكشوفة بصفحاتها ونقاطها (الوثيقة 1.14).
  const look = () => audience.evaluate(() => {
    const box = document.getElementById('box'), chip = document.getElementById('verdict'), cs = getComputedStyle(document.documentElement);
    return { bare: box.classList.contains('bare'), bg: getComputedStyle(box.querySelector(':scope > i')).display, chipBg: getComputedStyle(chip.querySelector(':scope > i')).backgroundColor,
      chipInk: getComputedStyle(chip).color, team1: cs.getPropertyValue('--team-1').trim(), say: document.getElementById('say').innerText.trim(), told: !document.getElementById('told').hidden,
      shown: !box.hidden && !chip.hidden,
      listed: [...document.querySelectorAll('#cxList .cx-it')].length, pages: document.querySelectorAll('#cxList .cx-pg').length,
      dots: document.getElementById('cxDots').hidden ? 0 : document.querySelectorAll('#cxDots i').length,
      fits: [...document.querySelectorAll('#cxList .cx-pg')].every(p => { const h = p.hidden; p.hidden = false; const ok = [...p.children].every(e => e.offsetTop + e.offsetHeight <= 193); p.hidden = h; return ok; }) };
  });
  const color = c => audience.evaluate(c => { const d = document.createElement('i'); d.style.color = c; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v; }, c);
  const shot = async name => { await wait(400); await stage.screenshot({ path: `${shots}/${name}.png` }); };

  // 1. الموضوع 1 «القصيرة الأولى» (10): يرسو على الآخر بـ 4، فيذكر 2 ثم الكشف و«لم يفِ»، فللأول نقطتان (2.0: failshort).
  await audience.waitForSelector('[data-cmd="draw"]', { timeout: 6000 });
  await sharedToFace(audience, { names: LONG, picks: ['auction', 'letter'] });
  await wait(2700);
  await cmd(audience, 'begin');
  await audience.waitForSelector('.scr.show[data-s="intro"]', { timeout: 5000 });
  let s = await st();
  const first = Math.random() < 0.5 ? 1 : 2, win = first;
  check(`المواضيع: قائمتان قصيرتان (${SHORT}) ثم أطول قائمة (${LONGEST})`, s.topics.map(t => t.topic).join('،') === keep.join('،'));
  await cmd(audience, 'act:show');
  await audience.waitForSelector('.scr.show[data-s="auc"]');
  await wait(800);
  await hideQr(audience);
  await bidTo(4, other(first));
  check(`القصيرة الأولى: الفريق ${other(first)} ملتزم بـ 4`, (await st()).commit.team === other(first) && (await st()).commit.n === 4);
  await say(); await say();
  await judge('fail');
  let l = await look();
  check(`القصيرة الأولى: لم يفِ، فللفريق ${win} نقطتان (${await ctl()})`, (await st()).phase === 'decided' && (await round()).scores[win] === 2 && (await round()).scores[other(win)] === 0);
  check(`الحكم بلا مربع: الشارة والسطر «لم يفِ بـ 4» ظاهران، ولا «ذُكر»، وخلفية المربع مخفية (${l.bg})`, l.bare && l.bg === 'none' && l.shown && l.say === 'لم يفِ بـ 4' && !l.told);
  check(`الشارة بيضاء (${l.chipBg})`, l.chipBg === await color('var(--card)'));
  check(`نص الشارة بلون صاحبها: ${win === 1 ? 'الأول بلونه' : 'الثاني بالحبر'} (${l.chipInk})`, win === 1 ? l.chipInk === await color('var(--team-1)') : l.chipInk === await color('var(--ink)'));
  check(`القائمة القصيرة (${SHORT}) كلها في صفحة واحدة بلا نقاط، ولا اسم على الشاشة (${l.listed}، ${l.pages} صفحة، ${l.dots} نقاط)`, l.listed === SHORT && l.pages === 1 && l.dots === 0 && !(await names()).length && l.fits);
  await both('القصيرة الأولى · لم يفِ');
  await shot(`s4-short-1-fail-t${win}`);

  // 2. الموضوع 2 «القصيرة الثانية» (10): يرسو على الأول بـ 2، ثم الكشف و«وفى» (2.0: wonshort).
  await cmd(audience, 'act:next'); await wait(1200);
  await hideQr(audience);
  await bidTo(2, first);
  await say(); await say();
  await judge('ok');
  l = await look();
  check(`القصيرة الثانية: وفى الفريق ${win} بـ 2 (رصيده 4)`, (await st()).phase === 'decided' && (await round()).scores[win] === 4);
  check(`القصيرة الثانية: الحكم بلا مربع و«وفى بـ 2»، والقائمة في صفحة واحدة (${l.listed})`, l.bare && l.bg === 'none' && l.say === 'وفى بـ 2' && l.listed === SHORT && l.pages === 1 && l.dots === 0);
  await both('القصيرة الثانية · بعد الحكم');
  await shot(`s4-short-2-t${win}`);

  // حكم القصيرة الثانية محفوظاً، يُعاد إليه في 5.
  const afterShort2 = await stage.evaluate(() => localStorage.getItem('big-challenge.match'));

  // 3. الموضوع 3 «أطول قائمة»: يرسو على الآخر بـ 40، فيُعدّ أربعين ثم الكشف و«وفى» (wonlong)، والقائمة صفحاتٍ بنقاطها.
  await cmd(audience, 'act:next'); await wait(1200);
  await hideQr(audience);
  const MANY = Math.min(40, LONGEST);
  await bidTo(MANY, other(first));
  // والمفحوص هنا عرض القائمة المكشوفة لا النقرات: فيُكتب ما قبل الأخير (39) في الحالة المحفوظة ثم تُعاد الصفحة،
  // ويُعدّ الأخير بالنقر. لا تغيير في اللعبة.
  await stage.evaluate(([n, team]) => { const m = JSON.parse(localStorage.getItem('big-challenge.match'));
    m.round.state.said = Array.from({ length: n }, (_, i) => ({ i, team })); localStorage.setItem('big-challenge.match', JSON.stringify(m)); }, [MANY - 1, other(first)]);
  await stage.reload(); await unlock(stage);
  audience = await stageFrame(stage);
  await audience.waitForSelector('#tn', { timeout: 6000 });
  await wait(1000);
  await say();
  check(`أطول قائمة: «${MANY} من ${MANY}» ولا حكم قبل الكشف، ولا اسم على الشاشة من ${MANY - 1} محفوظة بمواضعها`, (await tally()) === `${MANY}/${MANY}` && (await st()).phase === 'fulfil' && !(await names()).length);
  await judge('ok');
  const v = (await st()).results[2];
  check(`أطول قائمة: «وفى» (${MANY} للفريق ${other(first)})`, v?.team === other(first) && v.points === MANY);
  l = await look();
  check(`أطول قائمة (${LONGEST}): الحكم بلا مربع و«وفى بـ ${MANY}»، والقائمة كلها ${l.pages} صفحات من 4 أسطر، ونقطة لكل صفحة`, (await st()).phase === 'decided'
    && l.bare && l.bg === 'none' && l.say === `وفى بـ ${MANY}` && l.listed === LONGEST && l.pages > 1 && l.dots === l.pages && l.fits && !(await names()).length);
  await both('أطول قائمة · بعد الحكم');
  await shot(`s4-long-t${other(first)}`);

  // 4. «إنهاء الجولة» ثم التراجع عنه.
  await cmd(audience, 'act:next'); await wait(1200);
  await cmd(audience, 'undo'); await wait(1000);
  check('النهاية ثم التراجع: يعود حكم أطول قائمة', (await st()).phase === 'decided' && (await st()).index === 2);

  // 5. بعد إعادة تحميل الإطار: الحكم بلا مربع والقائمة القصيرة كبيرة كذلك (بحكمها المحفوظ).
  await audience.evaluate(() => location.reload());
  audience = await stageFrame(stage);
  await wait(800);
  l = await look();
  check('بعد إعادة التحميل · أطول قائمة: بلا مربع، والقائمة بصفحاتها ونقاطها', l.bare && l.listed === LONGEST && l.dots === l.pages && l.pages > 1);
  await both('نافذة واحدة · أطول قائمة');
  await shot(`s4-single-long-t${other(first)}`);
  await stage.evaluate(m => localStorage.setItem('big-challenge.match', m), afterShort2);
  await stage.reload(); await unlock(stage);
  audience = await stageFrame(stage);
  await wait(800);
  l = await look();
  check(`حكم القصيرة الثانية بعد إعادة التحميل: بلا مربع، والقائمة في صفحة (${l.listed})`, (await st()).index === 1 && l.bare && l.listed === SHORT && l.dots === 0);
  await both('نافذة واحدة · القصيرة الثانية');
  await shot(`s4-single-short-2-t${win}`);
  // والسؤال التالي يعود بالمربع: «الموضوع التالي» ثم المزايدة بلا حكم.
  await cmd(audience, 'act:next'); await wait(1200);
  check('بعد «الموضوع التالي»: لا حكم ولا مربع، ولا القائمة', await audience.$eval('#box', b => b.hidden) && !(await look()).listed && !(await audience.isVisible('#cxList')));

  check(`فحص التداخل والشبكة في كل حالة سليم${layoutOk ? '' : ' · ' + fails.join(' | ')}`, layoutOk);
  check(`لا أخطاء في الصفحات${errors.length ? ': ' + errors.join(' | ') : ''}`, errors.length === 0);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
