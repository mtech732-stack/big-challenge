// اختبار آلي لجولة «آخر حرفين» بالنافذة الواحدة (ش3، الوثيقة 1.13): الافتتاح بنهاية الجولة، ومربع الحرفين بالتطويل،
// والسؤال والعدّاد، والحكم والنقاط، وانتقال الإجابة للخصم، والتراجع، وإعادة التحميل، والنهاية ثم جولة «الحرف المعيّن» بعدها،
// والجولة كلها بنهاية واحدة، وأعرض الحرفين يُصغَّران ولا يفيضان، والإجابة بعد كل سؤال، وفحص التداخل والقياسات في كل حالة.
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace, passWheelOne } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { check, finish } = reporter();
  const errors = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  // اسمان يبدآن بـ«ال»: سطر الحكم في نافذة المقدّم «للنخبة» لا «لـالنخبة» (ملاحظة المعاين 23).
  const LONG = ['النخبة الذهبية', 'المستقبل المشرق'];

  // عامل الخدمة محجوب كي يصل البنك التجريبي في القسم 9 (context.route لا يرى طلباته).
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block' });
  await usePin(context);
  context.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => m.type() === 'error' && !/content\/packs\/.+\.json/.test(m.location().url) && errors.push(m.text()));
  });
  // الشاشة المشتركة على التلفاز (الوثيقة 1.13: نافذة واحدة وحدها)، وكل الأزرار فيها.
  const stage = await context.newPage();
  await stage.setViewportSize({ width: 1920, height: 1080 });
  await stage.goto(base);
  await stage.evaluate(() => localStorage.clear());
  await stage.reload();
  await unlock(stage);
  let audience = await stageFrame(stage);
  const text = (page, sel) => page.textContent(sel).then(t => t.replace(/\s+/g, ' ').trim());
  const visible = (page, sel) => page.isVisible(sel);

  // فحوص كل حالة: التداخل على شاشة الجمهور، ولا إجابة على الجمهور.
  let layoutOk = true, leak = false;
  const fails = [];
  const audienceCheck = async (page, label) => {
    const r = await page.evaluate(() => window.__stageCheck());
    if (!r.ok) { layoutOk = false; fails.push(`${label}: ${r.problems.join('، ')}`); }
    // إجابة السؤال المعروض وبدائلها، في نص الشاشة كله دون السؤال نفسه واسمَي الفريقين
    // (فـ«ذهب» جزء من «فريق النخبة الذهبي» وليست تسريباً).
    // وبعد الحكم الأخير تظهر الإجابة النموذجية وحدها في سطرها (الوثيقة 1.1)، فيُستثنى السطر.
    const q = await stage.evaluate(() => { const r = JSON.parse(localStorage.getItem('big-challenge.match')).round; return r && !['intro', 'end'].includes(r.state.phase) ? r.state.questions[r.state.index] : null; });
    if (!q) return;
    const body = await page.evaluate(names => { let t = document.body.innerText.replace(document.getElementById('label').textContent, '');
      const rev = document.getElementById('reveal'); if (rev.getClientRects().length) t = t.replace(rev.innerText, '');
      for (const n of names) t = t.split(n).join(''); return t; }, LONG);
    if (/سرقة|سهل|متوسط|صعب|بفارق/.test(body)) { leak = true; fails.push(`${label}: نص قواعد ممنوع على الجمهور`); }
    if ([q.answer, ...q.alts].some(a => body.includes(a))) { leak = true; fails.push(`${label}: إجابة على شاشة الجمهور («${q.answer}»)`); }
  };
  const both = async label => { await wait(900); await audienceCheck(audience, label); };
  const btns = sel => audience.$$eval(sel, b => b.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
  const card = () => btns('.scr.show .ctl .cbtn');
  const phaseIs = (ph, timeout) => stage.waitForFunction(ph => JSON.parse(localStorage.getItem('big-challenge.match')).round.state.phase === ph, ph, { timeout, polling: 100 });
  const st = () => stage.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.state);
  const box = page => page.$eval('#letter', e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e), tw = e.querySelector('.tw'), lt = e.querySelector('.lt');
    return { tw: tw?.textContent, lt: lt?.textContent, w: e.offsetWidth, h: e.offsetHeight, fs: parseFloat(s.fontSize), fits: (e.querySelector('.end') ?? e).offsetWidth <= e.clientWidth - 64 + 1,
      tf: [tw, lt].every(x => x && getComputedStyle(x).transform === 'none' && getComputedStyle(x).display === 'inline'),
      // الوصل: عرض التطويل والحرفين في عنصريهما يساوي عرضهما نصاً واحداً (لو انقطع الوصل لاختلف العرض).
      joined: (() => { const end = e.querySelector('.end'); if (!end) return false; const p = document.createElement('span'); p.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
        p.style.font = s.font; p.textContent = end.textContent; document.body.append(p); const ok = Math.abs(p.getBoundingClientRect().width - end.getBoundingClientRect().width) < 0.5; p.remove(); return ok; })() }; });

  // إلى المواجهة على الشاشة المشتركة بأطول اسمين، ثم «ابدأ المباراة»: الجولة 1 تبدأ وتُفتح نافذة المقدّم.
  const toFace = async (first, second) => {
    await audience.waitForSelector('[data-cmd="draw"]', { timeout: 6000 });
    await sharedToFace(audience, { names: LONG, picks: [first, second] });
    await wait(2700);
  };
  await toFace('last-two', 'letter');
  await cmd(audience, 'begin');

  // 1. الافتتاح
  await audience.waitForSelector('.scr.show[data-s="intro"]', { timeout: 5000 });
  const starter = (await st()).first;
  const other = t => (t === 1 ? 2 : 1);
  // أزرار الحكم من الوحدة (1.11)، على الشاشة نفسها.
  const J = a => cmd(audience, 'act:' + a);
  const reveal = async team => { await J('reveal'); await wait(800); await J('pick:' + team); };
  const ending = (await st()).questions[0].box;
  check(`الجمهور: «كل إجابات الجولة تنتهي بـ «ـ${ending}»» ولا سطر تفاصيل`, (await text(audience, '#rule')) === `كل إجابات الجولة تنتهي بـ «ـ${ending}»` && !(await audience.$('#ruleSub')));
  check('الجمهور: شارة النمط «آخر حرفين» و«الجولة 1 من 2» و«يبدأ [الاسم]»', (await text(audience, '#mode')) === 'آخر حرفين' && (await text(audience, '#b1')) === 'الجولة 1 من 2' && (await text(audience, '#starter')) === `يبدأ ${LONG[starter - 1]}`);
  check('الافتتاح: «اعرض السؤال 1» في البطاقة', (await card()) === 'اعرض السؤال 1');
  await both('الافتتاح');

  // 2. السؤال والعدّ قبل الوقت (1.11)
  await J('show');
  await audience.waitForSelector('.scr.show[data-s="q"]');
  await wait(500);
  let s = await st(), q = s.questions[0];
  let b = await box(audience);
  check('الجمهور: التطويل ثم الحرفان في عنصرين، والسؤال', b.tw === 'ـ' && b.lt === q.box && (await text(audience, '#letter')) === 'ـ' + q.box && (await text(audience, '#label')) === q.prompt);
  check(`الجمهور: المربع ارتفاعه 220 وعرضه بين 220 و456 (${b.w})، والحرفان 152، لا يفيضان`, b.h === 220 && b.w >= 220 && b.w <= 456 && b.fs === 152 && b.fits);
  check('الجمهور: لا transform ولا inline-block على التطويل والحرفين، والوصل لا ينقطع بينهما', b.tf && b.joined);
  check('الجمهور: دخول الحرفين بالشفافية (التطويل أولاً ثم الحرفان بعد 150ms)', await audience.$eval('#letter', e => {
    const [a, c] = [e.querySelector('.tw'), e.querySelector('.lt')].map(x => getComputedStyle(x));
    return e.classList.contains('in') && a.animationName === 'in' && c.animationName === 'in' && c.animationDelay === '0.15s'; }));
  check('الجمهور: العدّ قبل الوقت يعمل وحده بالأبيض', ['0:05', '0:04'].includes(await text(audience, '#timer')) && await audience.$eval('#canvas', c => c.classList.contains('lead') && c.classList.contains('running')));
  check('الجمهور: «السؤال 1 من 6» بلا مستوى', (await text(audience, '#b1')) === 'السؤال 1 من 6' && !(await visible(audience, '#b2')));
  await both('العدّ قبل الوقت');
  await stage.screenshot({ path: `${shots}/s3-ready.png` });

  // 3. العدّاد يعدّ بعد 5 ثوانٍ، ثم الكشف واختيار صاحب السؤال
  await audience.waitForFunction(() => !document.getElementById('canvas').classList.contains('lead') && document.getElementById('canvas').classList.contains('running'), null, { timeout: 8000, polling: 100 });
  await wait(1300);
  check('بعد العدّ: يعدّ على الجمهور من 0:30', ['0:29', '0:28'].includes(await text(audience, '#timer')));
  await J('reveal');
  await wait(800);
  check('«كشف الإجابة»: الإجابة وحدها، ولا عدّاد', (await text(audience, '#reveal')) === `الإجابة: ${q.answer}` && !(await visible(audience, '#verdict')) && !(await visible(audience, '.team .cnt')));
  await both('كُشفت الإجابة');
  await J('pick:' + starter);
  await wait(600);
  check('صحيحة · +3: الحكم مكان العدّاد بلون الفريق، والرصيد يزيد', (await text(audience, '#vtext')) === `${LONG[starter - 1]} · +3` && (await text(audience, '#reveal')) === `الإجابة: ${q.answer}` && await audience.$eval('#verdict', (e, t) => e.classList.contains('t' + t), starter)
    && !(await visible(audience, '.team .cnt')) && (await text(audience, '#s' + starter)) === '3');
  await both('صحيحة');

  // 4. السؤال 2: «وقت الخصم» ← يتركه ينتهي ← الكشف و«لم يُجب أحد»
  await wait(800);
  await J('next');
  await wait(800);
  s = await st();
  check('السؤال 2: للخصم، والحرفان نفسهما (الجولة كلها بنهاية واحدة)', s.questions[1].owner === other(starter) && s.questions[1].box === s.questions[0].box && (await text(audience, '#letter')) === 'ـ' + s.questions[1].box);
  await J('steal');
  await wait(600);
  check('«وقت الخصم»: الدور للخصم بلا شارة، والعدّاد 0:10 أو أقل', !(await audience.$('#b4')) && await audience.$eval(`#p${starter}`, e => e.classList.contains('on'))
    && ['0:10', '0:09'].includes(await text(audience, '#timer')));
  await both('وقت الخصم');
  await phaseIs('over', 14000);
  await wait(800);
  await reveal(0);
  await wait(800);
  check('انتهى وقت الخصم ثم «لم يُجب أحد»: الشارة والإجابة تحت السؤال', (await text(audience, '#vtext')) === 'لم يُجب أحد' && (await text(audience, '#reveal')) === `الإجابة: ${s.questions[1].answer}`);

  // 5. السؤال 3: يترك العدّاد 30 ثانية ← «وقت الخصم» بعد انتهاء الوقت ← الكشف واختيار الخصم بالنقاط نفسها (+6) ← تراجع
  await wait(800);
  await J('next');
  // F5 على شاشة الجمهور (الإطار وحده) والعدّاد يعدّ: يكمل من حيث كان.
  await wait(5000 + 3200);
  await audience.evaluate(() => location.reload());
  await wait(300);
  audience = await stageFrame(stage);
  await audience.waitForSelector('.scr.show[data-s="q"]', { timeout: 6000 });
  await wait(500);
  const after = await text(audience, '#timer');
  check(`إعادة تحميل الجمهور أثناء العدّاد: يكمل (${after})`, ['0:26', '0:25', '0:27'].includes(after));
  check('بعد إعادة التحميل: الحرفان كما هما', (await box(audience)).lt === (await st()).questions[2].box);
  await phaseIs('over', 34000);
  await wait(800);
  await J('steal');
  await wait(800);
  const sc = await stage.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.scores);
  await J('reveal');
  await wait(800);
  check('السؤال 3 متوسط: «+6» على زرّي الفريقين', (await btns('#near .cbtn')) === '+6 | +6 | لم يُجب أحد');
  await J('pick:' + other(starter));
  await wait(800);
  const thief = other(starter);
  const sc2 = (await stage.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.scores));
  check('بعد انتهاء الوقت وانتقال الإجابة: +6 للخصم', sc2[thief] === sc[thief] + 6);
  await cmd(audience, 'undo');
  await wait(800);
  const s3 = await st();
  check('تراجع عن آخر حكم: تعود الإجابة مكشوفة بلا اختيار والرصيد كما كان', s3.phase === 'revealed' && s3.steal?.team === thief && (await stage.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.scores))[thief] === sc[thief]);
  await J('pick:' + thief);
  await wait(800);

  // 6. F5 على الصفحة كلها: الرقم، ثم الجولة كما هي
  await stage.reload();
  await unlock(stage);
  audience = await stageFrame(stage);
  await audience.waitForSelector('#near .cbtn', { timeout: 6000 });
  check('إعادة تحميل الصفحة: الجولة كما هي', (await st()).phase === 'decided' && (await text(audience, '#letter')) === 'ـ' + s3.questions[2].box && (await btns('#near .cbtn')) === 'السؤال التالي');

  // 7. بقية الأسئلة حتى النهاية
  for (let i = 3; i < 6; i++) { await wait(800); await J('next'); await wait(800); await reveal((await st()).questions[i].owner); }
  await wait(800);
  s = await st();
  check('الأسئلة الستة بنهاية واحدة', new Set(s.questions.map(x => x.box)).size === 1);
  check('صعب: الأخير محكوم', s.results[5] !== null);
  check('بعد السادس: «إنهاء الجولة»', (await btns('#near .cbtn')) === 'إنهاء الجولة');
  await J('next');
  await audience.waitForSelector('.scr.show[data-s="end"]');
  await wait(400);
  check('الجمهور: «انتهت الجولة 1» و«التالي: شريط البونص»', (await text(audience, '#b1')) === 'انتهت الجولة 1' && (await text(audience, '#next')) === 'التالي: شريط البونص');
  await wait(900);
  await stage.screenshot({ path: `${shots}/s3-end.png` });
  await both('النهاية');

  // 8. ما بعدها: شريط البونص (في الرابطين منذ اكتمال ش6)، ثم جولة «الحرف المعيّن» بوقتها 15 وحرف بلا تطويل
  check('«شريط البونص» في البطاقة بلا «تخطَّ»', (await card()) === 'شريط البونص');
  await passWheelOne(stage, audience);
  await wait(800);
  check('بعد شريط البونص: «ابدأ الجولة 2»', (await card()) === 'ابدأ الجولة 2');
  await cmd(audience, 'next');
  await audience.waitForSelector('.scr.show[data-s="intro"]');
  check('الجولة 2: «أجب بكلمة تبدأ بالحرف المعيّن»', (await text(audience, '#rule')) === 'أجب بكلمة تبدأ بالحرف المعيّن');
  await wait(900);
  await J('show');
  await audience.waitForSelector('.scr.show[data-s="q"]');
  const lq = (await st()).questions[0];
  // ينتظر ظهور الحرف الجديد والعدّاد بوقته بدل انتظار ثابت (تقرير المعاين ش3، الملاحظة 1).
  await audience.waitForFunction(b => document.getElementById('letter').textContent === b && document.getElementById('letter').offsetWidth >= 220
    && document.getElementById('timer').textContent === '0:30', lq.box, { timeout: 5000 }).catch(() => {});
  const l2 = [await text(audience, '#letter'), !!(await audience.$('#letter .tw')), (await box(audience)).w, await text(audience, '#timer')];
  // المربع 220 على الأقل (min-width منذ ش0): حرف عريض كـ«ص» يجعله 244 (تدقيق ش3، ملاحظة المدقّق).
  const l2ok = l2[0] === lq.box && !l2[1] && l2[2] >= 220 && l2[3] === '0:30';
  check(`الحرف المعيّن بعد آخر حرفين: حرف واحد بلا تطويل في مربع 220 فأكثر، والعدّاد 0:30${l2ok ? '' : ' ' + JSON.stringify([lq.box, ...l2])}`, l2ok);
  await both('الحرف المعيّن بعد آخر حرفين');

  // 9. النافذة الواحدة في جولة آخر حرفين، بأعرض حرفين في الخط مع أطول وصف (مباراة ثانية ببنك تجريبي من مجموعة واحدة)
  const wide = { mode: 'last-two', questions: ['easy', 'easy', 'medium', 'medium', 'hard', 'hard'].map((level, i) => ({
    id: `test-last-two-${i}`, level, ending: 'سش', prompt: 'كتاب لا تقرؤه من أوله إلى آخره، بل تفتحه حين تجهل معنى كلمة، وأشهره المحيط للفيروزآبادي',
    answer: `كلمة${i}`, domain: 'daily-life' })) };
  await context.route('**/content/packs/general/last-two.json*', route => route.fulfill({ json: wide }));
  await stage.evaluate(() => localStorage.removeItem('big-challenge.seen'));
  stage.once('dialog', d => d.accept());
  // مباراة جديدة من لوحة «⋯»: تعود إلى الإعداد. ويُعاد تحميل الصفحة كي تقرأ البنك التجريبي.
  await cmd(audience, 'new');
  await audience.waitForSelector('[data-cmd="draw"]', { timeout: 6000 });
  check('مباراة جديدة من لوحة «⋯»: تعود الشاشة إلى الإعداد', (await stage.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).step)) === 'setup');
  await stage.reload();
  await unlock(stage);
  audience = await stageFrame(stage);
  await toFace('last-two', 'letter');
  await cmd(audience, 'begin');
  const frame = audience;
  await frame.waitForSelector('.scr.show[data-s="intro"]', { timeout: 6000 });
  const near = () => frame.$$eval('#near .cbtn, .scr.show .ctl .cbtn', x => x.map(y => y.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
  await wait(300);
  check('النافذة الواحدة: «اعرض السؤال 1» في البطاقة، ولا شريط', (await near()) === 'اعرض السؤال 1' && !(await stage.$('#band')));
  check('النافذة الواحدة: «كل إجابات الجولة تنتهي بـ «ـسش»»', (await text(frame, '#rule')) === 'كل إجابات الجولة تنتهي بـ «ـسش»');
  let widest = null;
  await cmd(frame, 'act:show');
  for (let i = 0; i < 6; i++) {
    await frame.waitForSelector('.scr.show[data-s="q"]');
    await wait(900);
    const cur = (await st()).questions[i];
    const bx = await box(frame);
    widest ??= bx;
    widest.joined &&= bx.joined;
    if ((await near()).includes(cur.answer)) leak = true;
    await audienceCheck(frame, `نافذة واحدة · ${i + 1}`);
    if (i === 0) await stage.screenshot({ path: `${shots}/s3-single.png` });
    await cmd(frame, 'act:reveal');
    await wait(900);
    await cmd(frame, 'act:pick:' + cur.owner);
    await wait(900);
    check(`السؤال ${i + 1}: الإجابة تحت السؤال بعد الحكم`, (await text(frame, '#reveal')) === `الإجابة: ${cur.answer}`);
    if (i === 0) await stage.screenshot({ path: `${shots}/s3-single-decided.png` });
    await audienceCheck(frame, `نافذة واحدة · بعد الحكم ${i + 1}`);
    await cmd(frame, 'act:next');
  }
  check(`أعرض الحرفين «سش»: المربع 456 والخط مصغّر بين 128 و152 (${widest?.w} · ${widest?.fs})`, widest?.w <= 456 && widest.fs >= 128 && widest.fs < 152 && widest.fits);
  check('الوصل لا ينقطع في الأسئلة الستة', widest?.joined);
  check('الأزرار لا تعرض الإجابة', !leak);
  await frame.waitForSelector('.scr.show[data-s="end"]', { timeout: 6000 });
  check('نهاية الجولة بنافذة واحدة: «شريط البونص» في البطاقة', (await near()) === 'شريط البونص');
  check('نهاية الجولة بنافذة واحدة: «التالي» نص أبيض بلا مربع (15.4)', await frame.$eval('#box', b => b.classList.contains('bare') && !b.querySelector(':scope > i').getClientRects().length && getComputedStyle(b.querySelector('#next')).color === 'rgb(255, 255, 255)'));
  await wait(900);
  await stage.screenshot({ path: `${shots}/s3-single-end.png` });
  await audienceCheck(frame, 'نافذة واحدة · النهاية');

  check(`فحص التداخل على شاشة الجمهور في كل حالة${fails.length ? ': ' + fails.slice(0, 3).join(' | ') : ''}`, layoutOk);
  check('لا إجابة على شاشة الجمهور قبل الحكم الأخير، ولا نص قواعد', !leak);
  check(`لا أخطاء في الصفحة${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`, !errors.length);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})();
