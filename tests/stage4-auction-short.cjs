// اختبار آلي لـ«بعد الحكم» بقائمة قصيرة في المزاد (design/auction.md 1.5 و7.6) بالنافذتين وبالنافذة الواحدة، بالبنك الحقيقي، في الرابط العادي:
// الحكم بلا مربع (الشارة بيضاء بنص صاحبها، والسطر على الطرف)، والقائمة القصيرة بشارات كبيرة إن اتسعت في صفين،
// وأطول قائمة في البنك بالحجم المعتاد و«و N غيرها». وبقاعدة 2.0: «لم يفِ» في القصيرة الأولى (للخصم +2) ووفاء في الثانية.
// ولا يعتمد على اسم قائمة بعينها: القصيرتان من أقصر أسماء أطول قائمة، بالحد الأدنى للبنك (10 عناصر).
// وفحص التداخل ونافذة المقدّم في كل حالة، وصور لـ ratio.cjs.
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
  const ctl = () => presenter.$$eval('#aCtl button', els => els.map(e => e.textContent.trim()).join(' | '));
  // المزايدة رقماً رقماً حتى n، ثم يتوقف صاحب الدور، فيلتزم من ذكر n.
  // يزايد الفريق t بزرّه حتى n (خصمه بلا رقم)، ثم «ابدأ» يرسي عليه ويبدأ الوفاء (3.0).
  const bidTo = async (n, t) => { for (let k = 1; k <= n; k++) { await presenter.click(`#aCtl [data-raise="${t}"]`); await wait(150); } await wait(500); await presenter.click('#aCtl [data-act="start"]'); await wait(900); };
  // بعد الحكم: المربع بلا خلفية، والشارة بيضاء بنص صاحبها، والسطر ظاهر. والقائمة كبيرة أو معتادة.
  const look = () => audience.evaluate(() => {
    const box = document.getElementById('box'), chip = document.getElementById('verdict'), cs = getComputedStyle(document.documentElement);
    const its = [...document.querySelectorAll('#items .it')];
    return { bare: box.classList.contains('bare'), bg: getComputedStyle(box.querySelector(':scope > i')).display, chipBg: getComputedStyle(chip.querySelector(':scope > i')).backgroundColor,
      chipInk: getComputedStyle(chip).color, team1: cs.getPropertyValue('--team-1').trim(), told: document.getElementById('told').innerText.trim(), shown: !box.hidden && !chip.hidden,
      big: document.getElementById('auc').classList.contains('big'), h: its.length ? Math.round(its[0].getBoundingClientRect().height) : 0,
      rows: new Set(its.map(e => Math.round(e.getBoundingClientRect().top))).size, n: its.length, more: its.some(e => e.classList.contains('more')) };
  });
  const color = c => audience.evaluate(c => { const d = document.createElement('i'); d.style.color = c; document.body.append(d); const v = getComputedStyle(d).color; d.remove(); return v; }, c);
  const shot = async name => { await wait(400); await stage.screenshot({ path: `${shots}/${name}.png` }); };

  // 1. الموضوع 1 «القصيرة الأولى» (10): يرسو على الآخر بـ 4، فيذكر 2 ثم يتوقف، فللأول نقطتان (2.0: failshort).
  await audience.waitForSelector('[data-cmd="draw"]', { timeout: 6000 });
  await sharedToFace(audience, { names: LONG, picks: ['auction', 'letter'] });
  await wait(2700);
  presenter = await beginTwo(context, audience);
  await presenter.waitForFunction(() => document.getElementById('status').dataset.on === 'true', null, { timeout: 6000 });
  await audience.waitForSelector('.scr.show[data-s="intro"]', { timeout: 5000 });
  let s = await st();
  const first = Math.random() < 0.5 ? 1 : 2, win = first;
  check(`المواضيع: قائمتان قصيرتان (${SHORT}) ثم أطول قائمة (${LONGEST})`, s.topics.map(t => t.topic).join('،') === keep.join('،'));
  await presenter.click('#showQ');
  await audience.waitForSelector('.scr.show[data-s="auc"]');
  await wait(800);
  await bidTo(4, other(first));
  check(`القصيرة الأولى: الفريق ${other(first)} ملتزم بـ 4`, (await st()).commit.team === other(first) && (await st()).commit.n === 4);
  await tap(0); await wait(100); await tap(1); await wait(700);
  await presenter.click('#aCtl [data-act="stop"]'); await wait(1600);
  let l = await look();
  check(`القصيرة الأولى: لم يفِ، فللفريق ${win} نقطتان (${await ctl()})`, (await st()).phase === 'decided' && (await round()).scores[win] === 2 && (await round()).scores[other(win)] === 0);
  check(`الحكم بلا مربع: الشارة والسطر «ذُكر 2 من 4» ظاهران، وخلفية المربع مخفية (${l.bg})`, l.bare && l.bg === 'none' && l.shown && l.told === 'ذُكر 2 من 4');
  check(`الشارة بيضاء (${l.chipBg})`, l.chipBg === await color('var(--card)'));
  check(`نص الشارة بلون صاحبها: ${win === 1 ? 'الأول بلونه' : 'الثاني بالحبر'} (${l.chipInk})`, win === 1 ? l.chipInk === await color('var(--team-1)') : l.chipInk === await color('var(--ink)'));
  check(`القائمة القصيرة (${SHORT}) بشارات كبيرة 88 في صفين على الأكثر (${l.h}، ${l.rows} صف)`, l.big && l.h === 88 && l.rows <= 2 && l.n === SHORT && !l.more);
  await both('القصيرة الأولى · لم يفِ');
  await shot(`s4-short-1-fail-t${win}`);

  // 2. الموضوع 2 «القصيرة الثانية» (10): يرسو على الأول بـ 2 فيفي (2.0: wonshort).
  await presenter.click('#aCtl [data-act="next"]'); await wait(1200);
  await bidTo(2, first);
  await tap(0); await wait(100); await tap(1); await wait(1500);
  l = await look();
  check(`القصيرة الثانية: وفى الفريق ${win} بـ 2 (رصيده 4)`, (await st()).phase === 'decided' && (await round()).scores[win] === 4);
  check(`القصيرة الثانية: الحكم بلا مربع، والقائمة (${SHORT}) كبيرة (${l.h}، ${l.rows} صف)`, l.bare && l.bg === 'none' && l.big && l.h === 88 && l.rows <= 2 && l.n === SHORT);
  await both('القصيرة الثانية · بعد الحكم');
  await shot(`s4-short-2-t${win}`);

  // 3. الموضوع 3 «أطول قائمة»: يرسو على الآخر بـ 2 فيفي، والقائمة بالحجم المعتاد و«و N غيرها».
  await presenter.click('#aCtl [data-act="next"]'); await wait(1200);
  await bidTo(2, other(first));
  await tap(0); await wait(100); await tap(1); await wait(1500);
  l = await look();
  check(`أطول قائمة: الحكم بلا مربع، والقائمة بالحجم المعتاد 44 و«و N غيرها» (${l.h}، ${l.rows} صفوف)`, l.bare && l.bg === 'none' && !l.big && l.h === 44 && l.more && l.rows <= 4);
  await both('أطول قائمة · بعد الحكم');
  await shot(`s4-long-t${other(first)}`);

  // 4. «إنهاء الجولة» ثم التراجع عنه.
  await presenter.click('#aCtl [data-act="next"]'); await wait(1200);
  await presenter.click('#endUndo'); await wait(1000);
  check('النهاية ثم التراجع: يعود حكم أطول قائمة', (await st()).phase === 'decided' && (await st()).index === 2);

  // 5. النافذة الواحدة: الحكم بلا مربع والقائمة القصيرة كبيرة كذلك.
  await presenter.close();
  presenter = null;
  await wait(600);
  await stage.click('#resume');
  await wait(1200);
  audience = await stageFrame(stage);
  await wait(800);
  l = await look();
  check('النافذة الواحدة · أطول قائمة: بلا مربع وبالحجم المعتاد', l.bare && !l.big && l.more);
  await both('نافذة واحدة · أطول قائمة');
  await shot(`s4-single-long-t${other(first)}`);
  for (let i = 0; i < 12 && !((await st()).index === 1 && (await st()).phase === 'decided'); i++) { await cmd(audience, 'undo'); await wait(800); }
  await wait(800);
  l = await look();
  check(`النافذة الواحدة · القصيرة الثانية: بلا مربع، والقائمة كلها بإطار وكبيرة (${l.h})`, (await st()).index === 1 && l.bare && l.big && l.h === 88 && l.n === SHORT);
  await both('نافذة واحدة · القصيرة الثانية');
  await shot(`s4-single-short-2-t${win}`);
  // والسؤال التالي يعود بالمربع: «الموضوع التالي» ثم المزايدة بلا حكم.
  await cmd(audience, 'act:next'); await wait(1200);
  check('بعد «الموضوع التالي»: لا حكم ولا مربع، ولا .big', await audience.$eval('#box', b => b.hidden) && !(await look()).big);

  check(`فحص التداخل والشبكة في كل حالة سليم${layoutOk ? '' : ' · ' + fails.filter(f => !f.startsWith('المقدّم')).join(' | ')}`, layoutOk);
  check(`نافذة المقدّم على 1366×768 و1280×800 و1920×1080 بلا تمرير ولا فيض ولا نص أصغر من 32${presenterOk ? '' : ' · ' + fails.filter(f => f.startsWith('المقدّم')).join(' | ')}`, presenterOk);
  check(`لا أخطاء في الصفحات${errors.length ? ': ' + errors.join(' | ') : ''}`, errors.length === 0);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
