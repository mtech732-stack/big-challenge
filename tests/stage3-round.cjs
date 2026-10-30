// اختبار آلي لجولة «آخر حرفين» بالنافذتين وبالنافذة الواحدة (ش3، الوثيقة 1.1): الافتتاح بنهاية الجولة، ومربع الحرفين بالتطويل،
// والسؤال والعدّاد، والحكم والنقاط، وانتقال الإجابة للخصم، والتراجع، وإعادة التحميل، والنهاية ثم جولة «الحرف المعيّن» بعدها،
// والجولة كلها بنهاية واحدة، وأعرض الحرفين يُصغَّران ولا يفيضان، والإجابة بعد كل سؤال، وفحص التداخل والقياسات في كل حالة.
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace, beginTwo, passWheel, passWheelOne } = require('./helpers.cjs');

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
  // الشاشة المشتركة على التلفاز (الوثيقة 1.1)، ومنها تُفتح نافذة المقدّم عند «ابدأ المباراة».
  const stage = await context.newPage();
  await stage.setViewportSize({ width: 1920, height: 1080 });
  await stage.goto(base);
  await stage.evaluate(() => localStorage.clear());
  await stage.reload();
  await unlock(stage);
  let audience = await stageFrame(stage);
  let presenter = null;
  const text = (page, sel) => page.textContent(sel).then(t => t.replace(/\s+/g, ' ').trim());
  const visible = (page, sel) => page.isVisible(sel);

  // فحوص كل حالة: التداخل على شاشة الجمهور، وقياسات نافذة المقدّم (design/presenter-letter.html)، ولا إجابة على الجمهور.
  let layoutOk = true, presenterOk = true, leak = false;
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
  const presenterCheck = async label => {
    const r = await presenter.evaluate(() => {
      const rem = parseFloat(getComputedStyle(document.documentElement).fontSize), problems = [];
      const vis = n => n.getClientRects().length && getComputedStyle(n).visibility !== 'hidden';
      const main = document.getElementById('app');
      for (const n of main.querySelectorAll('*')) {
        if (!vis(n)) continue;
        if ([...n.childNodes].some(c => c.nodeType === 3 && c.textContent.trim())) {
          if (parseFloat(getComputedStyle(n).fontSize) < rem - .01) problems.push(`نص أصغر من 32: «${n.textContent.trim().slice(0, 16)}»`);
          if (/[٠-٩۰-۹]/.test(n.textContent)) problems.push('أرقام هندية');
          if (getComputedStyle(n).fontStyle !== 'normal') problems.push('ميل');
        }
        if (n.tagName === 'BUTTON' && n.getBoundingClientRect().height < 2 * rem - .5) problems.push(`زر أقصر من 64: «${n.textContent.trim()}»`);
        if (n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflow !== 'visible') problems.push(`يفيض: «${n.textContent.trim().slice(0, 16)}»`);
      }
      for (const n of main.querySelectorAll('.top, .row, .judge, .sum')) {
        if (!vis(n)) continue;
        const box = n.getBoundingClientRect();
        for (const c of n.querySelectorAll('*')) { if (!vis(c)) continue; const r = c.getBoundingClientRect(); if (r.left < box.left - 1 || r.right > box.right + 1) { problems.push(`يفيض: «${n.textContent.trim().slice(0, 16)}»`); break; } }
      }
      if (document.documentElement.scrollHeight > innerHeight + 1) problems.push(`الحالة أطول من النافذة (${document.documentElement.scrollHeight} من ${innerHeight})`);
      return { ok: !problems.length, problems: [...new Set(problems)] };
    });
    if (!r.ok) { presenterOk = false; fails.push(`المقدّم ${label}: ${r.problems.join('، ')}`); }
  };
  const both = async label => { await wait(900); await audienceCheck(audience, label); await presenterCheck(label); };
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
  presenter = await beginTwo(context, audience);
  await presenter.waitForFunction(() => document.getElementById('status').dataset.on === 'true', null, { timeout: 6000 });

  // 1. الافتتاح
  await audience.waitForSelector('.scr.show[data-s="intro"]', { timeout: 5000 });
  const starter = (await st()).first;
  const other = t => (t === 1 ? 2 : 1);
  const ending = (await st()).questions[0].box;
  check(`الجمهور: «كل إجابات الجولة تنتهي بـ «ـ${ending}»» ولا سطر تفاصيل`, (await text(audience, '#rule')) === `كل إجابات الجولة تنتهي بـ «ـ${ending}»` && !(await audience.$('#ruleSub')));
  check('الجمهور: شارة النمط «آخر حرفين» و«الجولة 1 من 2» و«يبدأ [الاسم]»', (await text(audience, '#mode')) === 'آخر حرفين' && (await text(audience, '#b1')) === 'الجولة 1 من 2' && (await text(audience, '#starter')) === `يبدأ ${LONG[starter - 1]}`);
  check('المقدّم: «الجولة 1 من 2 · آخر حرفين» والافتتاح «الجولة 1 · آخر حرفين» وسطر القاعدة بـ 20 ثانية', (await text(presenter, '#roundChip')) === 'الجولة 1 من 2 · آخر حرفين'
    && (await text(presenter, '#introHead')) === 'الجولة 1 · آخر حرفين' && (await text(presenter, '#introBrief')).includes('20 ثانية للسؤال'));
  await both('الافتتاح');

  // 2. السؤال قبل «ابدأ»
  await presenter.click('#showQ');
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
  check('الجمهور: العدّاد ثابت على 0:20 قبل «ابدأ»', (await text(audience, '#timer')) === '0:20' && (await wait(1200), (await text(audience, '#timer')) === '0:20'));
  check('الجمهور: «السؤال 1 من 6» بلا مستوى', (await text(audience, '#b1')) === 'السؤال 1 من 6' && !(await visible(audience, '#b2')));
  check('المقدّم: «ـ» والحرفان، والإجابة النموذجية، وسطر القبول', (await text(presenter, '#qLetter')) === 'ـ' + q.box && (await text(presenter, '#qAnswer')) === q.answer
    && (await text(presenter, '#qAccept')) === `وتُقبل أي كلمة أخرى تنتهي بـ «ـ${q.box}» وتنطبق على الوصف.`);
  check('المقدّم: مربع الحرفين يتسع بعرضهما ولا يفيض', await presenter.$eval('#qLetter', e => e.scrollWidth <= e.clientWidth + 1 && e.offsetWidth >= e.offsetHeight - 1));
  await both('السؤال قبل ابدأ');
  await stage.screenshot({ path: `${shots}/s3-ready.png` });
  await presenter.screenshot({ path: `${shots}/s3-presenter-ready.png` });

  // 3. العدّاد يعدّ ثم صحيحة
  await presenter.click('#startTimer');
  await wait(1300);
  check('«ابدأ العدّاد»: يعدّ على الجمهور من 0:20', ['0:19', '0:18'].includes(await text(audience, '#timer')));
  await wait(400);
  await presenter.click('#yes');
  await wait(600);
  check('صحيحة · +1: الحكم مكان العدّاد بلون الفريق، والرصيد يزيد', (await text(audience, '#vtext')) === `${LONG[starter - 1]} · +1` && (await text(audience, '#reveal')) === `الإجابة: ${q.answer}` && await audience.$eval('#verdict', (e, t) => e.classList.contains('t' + t), starter)
    && !(await visible(audience, '.team .cnt')) && (await text(audience, '#s' + starter)) === '1');
  check('المقدّم: «صحيحة · +1 لل…» إن بدأ الاسم بـ«ال»', (await text(presenter, '#qDone')) === `صحيحة · +1 لل${LONG[starter - 1].slice(2)}`);
  await both('صحيحة');

  // 4. السؤال 2: خاطئة ← تنتقل الإجابة ← يتركها تنتهي ← لا نقاط
  await wait(800);
  await presenter.click('#nextQ');
  await wait(800);
  s = await st();
  check('السؤال 2: للخصم، والحرفان نفسهما (الجولة كلها بنهاية واحدة)', s.questions[1].owner === other(starter) && s.questions[1].box === s.questions[0].box && (await text(audience, '#letter')) === 'ـ' + s.questions[1].box);
  await presenter.click('#no');
  await wait(600);
  check('خاطئة: تنتقل الإجابة إلى الخصم بلا شارة، والعدّاد 0:05 أو أقل', !(await audience.$('#b4')) && await audience.$eval(`#p${starter}`, e => e.classList.contains('on'))
    && ['0:05', '0:04'].includes(await text(audience, '#timer')));
  await both('انتقال الإجابة');
  await audience.waitForSelector('#verdict:not([hidden])', { timeout: 8000 });
  await wait(300);
  check('انتهى الوقت بعد الانتقال: «لا نقاط» والإجابة تحت السؤال', (await text(audience, '#vtext')) === 'لا نقاط' && (await text(audience, '#reveal')) === `الإجابة: ${s.questions[1].answer}`);

  // 5. السؤال 3: يترك العدّاد 20 ثانية ← السرقة بعد انتهاء الوقت ← صحيحة بالنقاط نفسها (+2) ← تراجع
  await wait(800);
  await presenter.click('#nextQ');
  await wait(800);
  await presenter.click('#startTimer');
  // F5 على نافذة الجمهور والعدّاد يعدّ: يكمل من حيث كان.
  await wait(3200);
  await stage.reload();
  audience = await stageFrame(stage);
  await audience.waitForSelector('.scr.show[data-s="q"]', { timeout: 6000 });
  await wait(500);
  const after = await text(audience, '#timer');
  check(`إعادة تحميل الجمهور أثناء العدّاد: يكمل (${after})`, ['0:16', '0:15', '0:17'].includes(after));
  check('بعد إعادة التحميل: الحرفان كما هما', (await box(audience)).lt === (await st()).questions[2].box);
  await presenter.waitForFunction(() => document.getElementById('qState').textContent.includes('بعد انتهاء الوقت'), null, { timeout: 22000 });
  await wait(800);
  const sc = JSON.parse(await presenter.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('big-challenge.match')).round.scores)));
  check('السؤال 3 متوسط: «صحيحة · +2» للخصم', (await text(presenter, '#yes')) === 'صحيحة · +2');
  await presenter.click('#yes');
  await wait(800);
  const thief = other(starter);
  const sc2 = (await presenter.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.scores));
  check('بعد انتهاء الوقت وانتقال الإجابة: +2 للخصم', sc2[thief] === sc[thief] + 2);
  await presenter.click('#undo');
  await wait(800);
  const s3 = await st();
  check('تراجع عن آخر حكم: تعود الإجابة للخصم والرصيد كما كان', s3.phase === 'steal' && (await presenter.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.scores))[thief] === sc[thief]);
  await presenter.click('#yes');
  await wait(800);

  // 6. F5 على المقدّم: الجولة كما هي
  await presenter.reload();
  await presenter.waitForSelector('#app:not([hidden])', { timeout: 10000 });
  await wait(800);
  check('إعادة تحميل المقدّم: الجولة كما هي', (await text(presenter, '#qState')) === 'انتهى السؤال' && (await text(presenter, '#qLetter')) === 'ـ' + s3.questions[2].box);

  // 7. بقية الأسئلة حتى النهاية
  for (let i = 3; i < 6; i++) { await wait(800); await presenter.click('#nextQ'); await wait(800); await presenter.click('#yes'); }
  await wait(800);
  s = await st();
  check('الأسئلة الستة بنهاية واحدة', new Set(s.questions.map(x => x.box)).size === 1);
  check('صعب: «صحيحة · +3» كان الزر الأخير', s.results[5] !== null);
  check('بعد السادس: «إنهاء الجولة»', (await text(presenter, '#nextQ')) === 'إنهاء الجولة');
  await presenter.click('#nextQ');
  await audience.waitForSelector('.scr.show[data-s="end"]');
  await wait(400);
  check('الجمهور: «انتهت الجولة 1» و«التالي: شريط البونص»', (await text(audience, '#b1')) === 'انتهت الجولة 1' && (await text(audience, '#next')) === 'التالي: شريط البونص');
  check('المقدّم: «انتهت الجولة 1 · آخر حرفين»', (await text(presenter, '#endHead')) === 'انتهت الجولة 1 · آخر حرفين');
  await wait(900);
  await stage.screenshot({ path: `${shots}/s3-end.png` });
  await both('النهاية');

  // 8. ما بعدها: شريط البونص (في الرابطين منذ اكتمال ش6)، ثم جولة «الحرف المعيّن» بوقتها 15 وحرف بلا تطويل
  check('المقدّم: «شريط البونص» بلا «تخطَّ»', (await text(presenter, '#endNext')) === 'شريط البونص');
  await passWheel(presenter);
  check('بعد شريط البونص: «ابدأ الجولة 2»', (await text(presenter, '#endNext')) === 'ابدأ الجولة 2');
  await presenter.click('#endNext');
  await audience.waitForSelector('.scr.show[data-s="intro"]');
  check('الجولة 2: «أجب بكلمة تبدأ بالحرف المعيّن»، ونافذة المقدّم بـ15 ثانية', (await text(audience, '#rule')) === 'أجب بكلمة تبدأ بالحرف المعيّن' && (await text(presenter, '#introBrief')).includes('15 ثانية'));
  await wait(900);
  await presenter.click('#showQ');
  await audience.waitForSelector('.scr.show[data-s="q"]');
  const lq = (await st()).questions[0];
  // ينتظر ظهور الحرف الجديد والعدّاد بوقته بدل انتظار ثابت (تقرير المعاين ش3، الملاحظة 1).
  await audience.waitForFunction(b => document.getElementById('letter').textContent === b && document.getElementById('letter').offsetWidth >= 220
    && document.getElementById('timer').textContent === '0:15', lq.box, { timeout: 5000 }).catch(() => {});
  await presenter.waitForFunction(b => document.getElementById('qLetter').textContent === b, lq.box, { timeout: 5000 }).catch(() => {});
  const l2 = [await text(audience, '#letter'), !!(await audience.$('#letter .tw')), (await box(audience)).w, await text(audience, '#timer'), await text(presenter, '#qLetter')];
  // المربع 220 على الأقل (min-width منذ ش0): حرف عريض كـ«ص» يجعله 244 (تدقيق ش3، ملاحظة المدقّق).
  const l2ok = l2[0] === lq.box && !l2[1] && l2[2] >= 220 && l2[3] === '0:15' && l2[4] === lq.box;
  check(`الحرف المعيّن بعد آخر حرفين: حرف واحد بلا تطويل في مربع 220 فأكثر، والعدّاد 0:15${l2ok ? '' : ' ' + JSON.stringify([lq.box, ...l2])}`, l2ok);
  await both('الحرف المعيّن بعد آخر حرفين');

  // 9. النافذة الواحدة في جولة آخر حرفين، بأعرض حرفين في الخط مع أطول وصف (مباراة ثانية ببنك تجريبي من مجموعة واحدة)
  const wide = { mode: 'last-two', questions: ['easy', 'easy', 'medium', 'medium', 'hard', 'hard'].map((level, i) => ({
    id: `test-last-two-${i}`, level, ending: 'سش', prompt: 'كتاب لا تقرؤه من أوله إلى آخره، بل تفتحه حين تجهل معنى كلمة، وأشهره المحيط للفيروزآبادي',
    answer: `كلمة${i}`, domain: 'daily-life' })) };
  await context.route('**/content/packs/general/last-two.json*', route => route.fulfill({ json: wide }));
  await stage.evaluate(() => localStorage.removeItem('big-challenge.seen'));
  presenter.once('dialog', d => d.accept());
  // مباراة جديدة: تعود إلى الشاشة المشتركة وتُغلق نافذة المقدّم. ويُعاد تحميل الشاشة كي تقرأ البنك التجريبي.
  const closed = presenter.waitForEvent('close', { timeout: 6000 }).then(() => true, () => false);
  // «مباراة جديدة» في الافتتاح والنهاية وحدهما؛ والجولة هنا في سؤالها، فيُنقر الزر برمجياً.
  await presenter.evaluate(() => document.querySelector('[data-new]').click());
  check('مباراة جديدة من نافذة المقدّم: تُغلق، وتعود الشاشة المشتركة', await closed);
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
    await cmd(frame, 'act:correct');
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

  // نافذة المقدّم الأخيرة أُغلقت مع المباراة الجديدة: فحص 1920 لا يلزم هنا.
  check(`فحص التداخل على شاشة الجمهور في كل حالة${fails.length ? ': ' + fails.slice(0, 3).join(' | ') : ''}`, layoutOk);
  check('نافذة المقدّم: لا نص أصغر من 32، ولا زر أقصر من 64، ولا تمرير، ولا أرقام هندية، ولا ميل', presenterOk);
  check('لا إجابة على شاشة الجمهور قبل الحكم الأخير، ولا نص قواعد', !leak);
  check(`لا أخطاء في الصفحتين${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`, !errors.length);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})();
