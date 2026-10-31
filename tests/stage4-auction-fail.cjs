// اختبار آلي لـ«لم يفِ» في المزاد بقاعدة المالك المصحّحة (5.5، design/auction.md 2.0) بالنافذة الواحدة (الوثيقة 1.13)، في الرابط العادي،
// وبتحكيم الوثيقة 1.14 (design/s8c.md): «كشف القائمة» يوقف الوقت ويُظهر القائمة، ثم «لم يفِ · +2» بلون الخصم يعطيه نقطتين ثابتتين ولا إكمال
// (اهتزاز البطاقة، ثم الحدّ إلى الخصم وزيادة رقمه)، والحكم «[الخصم] · +2» و«لم يفِ بـ N» بلا مربع ولا عدّاد ثانٍ،
// والعدّ بـ«عُدّ · +1» والتراجع عنه، والتراجع يعيد الكشف ثم الوفاء بما بقي من الوقت والرصيد، وفحص التداخل بأطول قائمة في البنك،
// ولا عنصر على الجمهور قبل الكشف. (حلّ محل stage4-auction-complete بعد إلغاء «إكمال الخصم».)
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

  // بنك تجريبي بأطول محتوى (design/auction.md 3): الموضوع السهل 32 حرفاً بأطول قائمة في البنك كما هي (مفتوحة أو لا)، والباقي من البنك.
  // لا يعتمد على اسم قائمة بعينها.
  const real = JSON.parse(fs.readFileSync(path.join(__dirname, '../content/packs/general/auction.json'), 'utf8'));
  const africa = real.topics.reduce((x, t) => (t.items.length > x.items.length ? t : x));
  const TOPIC = 'أشياء تجدها في حقيبة طالب مدرسة';
  const bank = { mode: 'auction', topics: [{ ...africa, id: 'test-auction-long', level: 'easy', topic: TOPIC }, ...real.topics.filter(t => t.level !== 'easy')] };
  const items = bank.topics[0].items;
  const N = 7;

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
  const chips = () => audience.$$eval('#auc .it', els => els.map(e => ({ name: e.textContent.trim(), t: e.classList.contains('t1') ? 1 : e.classList.contains('t2') ? 2 : 0, left: e.classList.contains('left'), more: e.classList.contains('more') })));
  const tally = async () => `${await text(audience, '#tn')}/${await text(audience, '#tof')}`;

  // 1. إلى الوفاء: يزايد فريق (عشوائي) حتى 7 بزرّه، ثم «ابدأ» يرسي عليه ويبدأ العدّاد، ثم «عُدّ · +1» يعدّ بلا أسماء
  // (الوثيقة 1.13: المقدّم يقرأ القائمة من الباركود، ويعدّ بالزر).
  await audience.waitForSelector('[data-cmd="draw"]', { timeout: 6000 });
  await sharedToFace(audience, { names: LONG, picks: ['auction', 'letter'] });
  await wait(2700);
  await cmd(audience, 'begin');
  await audience.waitForSelector('.scr.show[data-s="intro"]', { timeout: 5000 });
  const opener = Math.random() < 0.5 ? 1 : 2, rival = other(opener);
  await cmd(audience, 'act:show');
  await audience.waitForSelector('.scr.show[data-s="auc"]');
  await wait(800);
  await hideQr(audience);
  for (let n = 1; n <= N; n++) { await cmd(audience, 'raise:' + opener); await wait(250); }
  await wait(800);
  await cmd(audience, 'act:start'); await wait(800);
  for (let k = 0; k < 4; k++) { await cmd(audience, 'act:count'); await wait(300); }
  await wait(600);
  check(`الوفاء: ${LONG[opener - 1]} ملتزم بـ ${N}، و«عُدّ · +1» أربع مرات تُعدّ`, (await st()).phase === 'fulfil' && (await st()).commit.team === opener && (await tally()) === `4/${N}`);
  await both('الوفاء');
  await cmd(audience, 'undo'); await wait(800);
  check('«تراجع» يعيد آخر عدّة، والعدّاد يعمل', (await tally()) === `3/${N}` && (await st()).phase === 'fulfil' && await audience.$eval('#canvas', c => c.classList.contains('running')));
  await cmd(audience, 'act:count'); await wait(800);
  const score = t => audience.$eval('#s' + t, e => e.textContent.replace(/\s+/g, '').trim());

  // 2. «كشف القائمة» ثم «لم يفِ»: الكشف يوقف الوقت ويُظهر القائمة، ثم البطاقة تهتز، وللخصم نقطتان، ولا عدّاد بعدها.
  const near0 = () => audience.$$eval('#near .cbtn', els => els.map(e => e.textContent.trim() + (e.classList.contains('t1') ? '(1)' : e.classList.contains('t2') ? '(2)' : '')).join(' | '));
  await cmd(audience, 'act:reveal'); await wait(1000);
  let s = await st(), sc = (await stored()).scores;
  check(`الكشف: يقف الوقت ولا حكم، والقائمة في البطاقة، و«وفى · +${N}» بلون الملتزم و«لم يفِ · +2» بلون الخصم (${await near0()})`, s.phase === 'revealed' && sc[rival] === 0 && sc[opener] === 0
    && !(await audience.$eval('#canvas', c => c.classList.contains('running'))) && await audience.isVisible('#cxList') && !(await audience.isVisible('#tally'))
    && (await near0()) === `وفى · +${N}(${opener}) | لم يفِ · +2(${rival})` && !(await audience.$$('#ansCtl .cbtn')).length);
  await both('بعد الكشف');
  await cmd(audience, 'act:fail');
  await wait(150);
  check('لم يفِ: البطاقة تهتز', await audience.$eval('#cardWrap', e => e.classList.contains('shake')));
  await wait(1200);
  s = await st(); sc = (await stored()).scores;
  check(`لم يفِ: +2 للخصم (${LONG[rival - 1]})، ولا شيء للملتزم`, s.phase === 'decided' && sc[rival] === 2 && sc[opener] === 0 && s.results[0].team === rival && s.results[0].points === 2);
  check('الجمهور: الحدّ عند الخصم، ولا عدّاد يعمل، ورقمه الكبير 2', await audience.$eval('#canvas', (c, t) => c.classList.contains('turn-' + t) && !c.classList.contains('running'), rival)
    && (await score(rival)).includes('2'));
  const after = await chips();
  check(`الجمهور: «${LONG[rival - 1]} · +2» و«لم يفِ بـ ${N}» بلا مربع، ولا «ذُكر»، ولا شارات أسماء، والقائمة باقية (1.14)`, (await text(audience, '#vtext')) === `${LONG[rival - 1]} · +2`
    && (await text(audience, '#say')) === `لم يفِ بـ ${N}` && !(await audience.isVisible('#told')) && await audience.$eval('#box', b => b.classList.contains('bare'))
    && after.length === 0 && await audience.isVisible('#cxList') && (await text(audience, '#topic')).length > 0);
  check('بعد الحكم: «الموضوع التالي» في صف الشارات، ولا أزرار في البطاقة', (await near0()) === 'الموضوع التالي' && !(await audience.$$('.scr.show .ctl .cbtn')).length);
  await both('بعد الحكم · لم يفِ');
  await stage.screenshot({ path: `${shots}/s4-failed-t${rival}.png` });

  // 3. التراجع عن «لم يفِ» يعيد الكشف وتعود النقطتان، ثم عن الكشف: يعود الوفاء بما بقي من الوقت (لا كاملاً).
  await cmd(audience, 'undo'); await wait(1000);
  check('التراجع عن «لم يفِ»: يعود الكشف بزرّي الحكم، والرصيد 0', (await st()).phase === 'revealed' && (await stored()).scores[rival] === 0 && (await near0()).startsWith('وفى'));
  await cmd(audience, 'undo'); await wait(1000);
  const back = Number(await audience.$eval(`#c${opener}`, e => e.textContent));
  sc = (await stored()).scores;
  check(`ثم التراجع عن الكشف: يعود الوفاء بما بقي (${back} ثانية، لا 45)، والرصيد 0`, (await st()).phase === 'fulfil' && back > 0 && back < 44 && await audience.$eval('#canvas', c => c.classList.contains('running')) && sc[rival] === 0);

  // 4. النافذة الواحدة: من المزايدة (الملتزم بـ 5 والخصم بلا رقم)، «ابدأ» ثم «كشف القائمة» ثم «لم يفِ» فللخصم نقطتان.
  await stage.evaluate(o => { const m = JSON.parse(localStorage.getItem('big-challenge.match')); const r = m.round, s = r.state;
    Object.assign(s, { phase: 'bid', team: 0, nums: o === 1 ? [5, 0] : [0, 5], commit: null, said: [], results: s.results.map(() => null) });
    m.scores = r.scores = { 1: 188, 2: 176 }; r.timer = null; r.history = []; localStorage.setItem('big-challenge.match', JSON.stringify(m)); }, opener);
  await stage.reload();
  await unlock(stage);
  audience = await stageFrame(stage);
  await wait(800);
  await hideQr(audience);
  const near = () => audience.$$eval('#near .cbtn', els => els.map(e => e.textContent.trim() + (e.classList.contains('off') ? '(معطّل)' : '')).join(' | '));
  const card = () => audience.$$eval('.scr.show .ctl .cbtn', els => els.map(e => e.textContent.trim()).join(' | '));
  check(`النافذة الواحدة في المزايدة: زرّا الفريقين و«ابدأ» بينهما (${await near()})`, (await near()) === (opener === 1 ? '5 | ابدأ | زايد' : 'زايد | ابدأ | 5'));
  await cmd(audience, 'act:start'); await wait(1000);
  const ans = () => audience.$$eval('#ansCtl .cbtn', els => els.map(e => e.textContent.trim()).join(' | '));
  check(`النافذة الواحدة والعدّاد يعدّ: «عُدّ · +1» في صف الشارات و«كشف القائمة» أسفل اليمين (${await near()} · ${await ans()})`, (await near()) === 'عُدّ · +1' && (await ans()) === 'كشف القائمة');
  await cmd(audience, 'act:reveal'); await wait(1000);
  await cmd(audience, 'act:fail'); await wait(1400);
  s = await st(); sc = (await stored()).scores;
  check(`النافذة الواحدة: الكشف ثم «لم يفِ»، فللخصم نقطتان (${sc[rival]})، و«الموضوع التالي» في صف الشارات لا في البطاقة (${await near()})`, s.phase === 'decided'
    && sc[rival] === (rival === 1 ? 190 : 178) && (await near()) === 'الموضوع التالي' && !(await card()));
  await both('نافذة واحدة · لم يفِ');
  await stage.screenshot({ path: `${shots}/s4-single-failed-t${rival}.png` });

  check(`فحص التداخل والشبكة في كل حالة سليم${layoutOk ? '' : ' · ' + fails.join(' | ')}`, layoutOk);
  check(`لا عنصر قبل الكشف ولا طول القائمة ولا نص قواعد على شاشة الجمهور${leak ? ' · ' + fails.filter(f => f.includes('الجمهور')).join(' | ') : ''}`, !leak);
  check(`لا أخطاء في الصفحات${errors.length ? ': ' + errors.join(' | ') : ''}`, errors.length === 0);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
