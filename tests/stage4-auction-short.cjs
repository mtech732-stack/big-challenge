// اختبار آلي لـ«بعد الحكم» بقائمة قصيرة في المزاد (design/auction.md 1.5 و7.6) بالنافذتين وبالنافذة الواحدة، بالبنك الحقيقي، في الرابط العادي:
// الحكم بلا مربع (الشارة بيضاء بنص صاحبها، والسطر على الطرف)، والقائمة القصيرة بشارات كبيرة إن اتسعت في صفين،
// وأفريقيا (54) بالحجم المعتاد و«و N غيرها». وفحص التداخل ونافذة المقدّم في كل حالة، وصور لـ ratio.cjs.
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

  // البنك الحقيقي: «أركان الإيمان» (6) و«أولو العزم» (5) قصيرتان، و«دول قارة أفريقيا» (54) أطول قائمة.
  const real = JSON.parse(fs.readFileSync(path.join(__dirname, '../content/packs/general/auction.json'), 'utf8'));
  const keep = ['أركان الإيمان', 'أولو العزم', 'دول قارة أفريقيا'];
  const bank = { ...real, topics: real.topics.filter(t => keep.includes(t.topic)) };

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


  const round = async () => (await stored()).round;
  const ctl = () => presenter.$$eval('#aCtl button', els => els.map(e => e.textContent.trim()).join(' | '));
  const offer = async n => { for (let i = 0; i < 12 && (await text(presenter, '#aBid')) !== `زايد · ${n}`; i++) await presenter.click('[data-offer="-1"]'); };
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

  // 1. الموضوع 1 «أركان الإيمان» (6): المفتتح يلتزم بـ 4 ولا يفي، فيكمل الآخر بـ 4 ويأخذها (حالة المدقّق، docs/audits/ش4.md رابعاً).
  await audience.waitForSelector('[data-cmd="draw"]', { timeout: 6000 });
  await sharedToFace(audience, { names: LONG, picks: ['auction', 'letter'] });
  await wait(2700);
  presenter = await beginTwo(context, audience);
  await presenter.waitForFunction(() => document.getElementById('status').dataset.on === 'true', null, { timeout: 6000 });
  await audience.waitForSelector('.scr.show[data-s="intro"]', { timeout: 5000 });
  let s = await st();
  const first = s.topics[0].opener, win = other(first);
  check('المواضيع: أركان الإيمان ثم أولو العزم ثم أفريقيا', s.topics.map(t => t.topic).join('،') === keep.join('،'));
  await presenter.click('#showQ');
  await audience.waitForSelector('.scr.show[data-s="auc"]');
  await wait(800);
  await offer(4); await presenter.click('#aBid'); await wait(800);
  await presenter.click('#aPass'); await wait(900);
  await presenter.click('#aCtl [data-act="stop"]'); await wait(1000);
  for (const i of [0, 1, 2, 3]) { await tap(i); await wait(100); }
  await wait(1400);
  let l = await look();
  check(`أركان الإيمان: أكمل الفريق ${win} بـ 4 فأخذها (${await ctl()})`, (await st()).phase === 'decided' && (await round()).scores[win] === 4 && (await round()).scores[first] === 0);
  check(`الحكم بلا مربع: الشارة والسطر «ذُكر 4 من 4» ظاهران، وخلفية المربع مخفية (${l.bg})`, l.bare && l.bg === 'none' && l.shown && l.told === 'ذُكر 4 من 4');
  check(`الشارة بيضاء (${l.chipBg})`, l.chipBg === await color('var(--card)'));
  check(`نص الشارة بلون صاحبها: ${win === 1 ? 'الأول بلونه' : 'الثاني بالحبر'} (${l.chipInk})`, win === 1 ? l.chipInk === await color('var(--team-1)') : l.chipInk === await color('var(--ink)'));
  check(`القائمة القصيرة (6) بشارات كبيرة 88 في صفين على الأكثر (${l.h}، ${l.rows} صف)`, l.big && l.h === 88 && l.rows <= 2 && l.n === 6 && !l.more);
  await both('أركان الإيمان · بعد الحكم');
  await shot(`s4-short-iman-t${win}`);

  // 2. الموضوع 2 «أولو العزم» (5): يفتتحه الآخر ويلتزم بـ 2 ويفي (حالة المدقّق).
  await presenter.click('#aCtl [data-act="next"]'); await wait(1200);
  await offer(2); await presenter.click('#aBid'); await wait(800);
  await presenter.click('#aPass'); await wait(900);
  await presenter.click('#aCtl [data-act="start"]'); await wait(900);
  await tap(0); await wait(100); await tap(1); await wait(1500);
  l = await look();
  check(`أولو العزم: وفى الفريق ${win} بـ 2`, (await st()).phase === 'decided' && (await round()).scores[win] === 6);
  check(`أولو العزم: الحكم بلا مربع، والقائمة (5) كبيرة (${l.h}، ${l.rows} صف)`, l.bare && l.bg === 'none' && l.big && l.h === 88 && l.rows <= 2 && l.n === 5);
  await both('أولو العزم · بعد الحكم');
  await shot(`s4-short-ulul-t${win}`);

  // 3. الموضوع 3 «أفريقيا» (54): يفي مفتتحه بـ 2، والقائمة بالحجم المعتاد و«و N غيرها».
  await presenter.click('#aCtl [data-act="next"]'); await wait(1200);
  await offer(2); await presenter.click('#aBid'); await wait(800);
  await presenter.click('#aPass'); await wait(900);
  await presenter.click('#aCtl [data-act="start"]'); await wait(900);
  await tap(0); await wait(100); await tap(1); await wait(1500);
  l = await look();
  check(`أفريقيا: الحكم بلا مربع، والقائمة بالحجم المعتاد 44 و«و N غيرها» (${l.h}، ${l.rows} صفوف)`, l.bare && l.bg === 'none' && !l.big && l.h === 44 && l.more && l.rows <= 4);
  await both('أفريقيا · بعد الحكم');
  await shot(`s4-long-africa-t${first}`);

  // 4. «إنهاء الجولة» ثم التراجع عنه.
  await presenter.click('#aCtl [data-act="next"]'); await wait(1200);
  await presenter.click('#endUndo'); await wait(1000);
  check('النهاية ثم التراجع: يعود حكم أفريقيا', (await st()).phase === 'decided' && (await st()).index === 2);

  // 5. النافذة الواحدة: الحكم بلا مربع والقائمة القصيرة كبيرة كذلك.
  await presenter.close();
  presenter = null;
  await wait(600);
  await stage.click('#resume');
  await wait(1200);
  audience = await stageFrame(stage);
  await wait(800);
  l = await look();
  check('النافذة الواحدة · أفريقيا: بلا مربع وبالحجم المعتاد', l.bare && !l.big && l.more);
  await both('نافذة واحدة · أفريقيا');
  await shot(`s4-single-africa-t${first}`);
  for (let i = 0; i < 12 && !((await st()).index === 1 && (await st()).phase === 'decided'); i++) { await cmd(audience, 'undo'); await wait(800); }
  await wait(800);
  l = await look();
  check(`النافذة الواحدة · أولو العزم: بلا مربع، والقائمة كلها بإطار وكبيرة (${l.h})`, (await st()).index === 1 && l.bare && l.big && l.h === 88 && l.n === 5);
  await both('نافذة واحدة · أولو العزم');
  await shot(`s4-single-ulul-t${win}`);
  // والسؤال التالي يعود بالمربع: «الموضوع التالي» ثم المزايدة بلا حكم.
  await cmd(audience, 'act:next'); await wait(1200);
  check('بعد «الموضوع التالي»: لا حكم ولا مربع، ولا .big', await audience.$eval('#box', b => b.hidden) && !(await look()).big);

  check(`فحص التداخل والشبكة في كل حالة سليم${layoutOk ? '' : ' · ' + fails.filter(f => !f.startsWith('المقدّم')).join(' | ')}`, layoutOk);
  check(`نافذة المقدّم على 1366×768 و1280×800 و1920×1080 بلا تمرير ولا فيض ولا نص أصغر من 32${presenterOk ? '' : ' · ' + fails.filter(f => f.startsWith('المقدّم')).join(' | ')}`, presenterOk);
  check(`لا أخطاء في الصفحات${errors.length ? ': ' + errors.join(' | ') : ''}`, errors.length === 0);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
