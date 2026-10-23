// اختبار آلي لجولة «آخر حرفين» بالنافذتين وبالنافذة الواحدة (ش3): الافتتاح بـ 20 ثانية، ومربع الحرفين بالتطويل،
// والسؤال والعدّاد، والحكم والنقاط، والسرقة، والتراجع، وإعادة التحميل، والنهاية ثم جولة «الحرف المعيّن» بعدها،
// وأعرض الحرفين في الخط يُصغَّران ولا يفيضان، ولا إجابة على شاشة الجمهور، وفحص التداخل والقياسات في كل حالة.
const { chromium } = require('playwright');
const { usePin, unlock, reporter } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { check, finish } = reporter();
  const errors = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const LONG = ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'];

  // عامل الخدمة محجوب كي يصل البنك التجريبي في القسم 9 (context.route لا يرى طلباته).
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, serviceWorkers: 'block' });
  await usePin(context);
  context.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => m.type() === 'error' && !/content\/packs\/.+\.json/.test(m.location().url) && errors.push(m.text()));
  });
  const presenter = await context.newPage();
  await presenter.goto(base);
  await presenter.evaluate(() => localStorage.clear());
  await unlock(presenter);
  const text = (page, sel) => page.textContent(sel).then(t => t.replace(/\s+/g, ' ').trim());
  const visible = (page, sel) => page.isVisible(sel);
  const [audience] = await Promise.all([context.waitForEvent('page'), presenter.click('#open')]);
  await audience.waitForLoadState();
  await audience.setViewportSize({ width: 1920, height: 1080 });
  await presenter.waitForFunction(() => document.getElementById('status').dataset.on === 'true', null, { timeout: 5000 });

  // فحوص كل حالة: التداخل على شاشة الجمهور، وقياسات نافذة المقدّم (design/presenter-letter.html)، ولا إجابة على الجمهور.
  let layoutOk = true, presenterOk = true, leak = false;
  const fails = [];
  const audienceCheck = async (page, label) => {
    const r = await page.evaluate(() => window.__stageCheck());
    if (!r.ok) { layoutOk = false; fails.push(`${label}: ${r.problems.join('، ')}`); }
    // إجابة السؤال المعروض وبدائلها، في نص الشاشة كله دون السؤال نفسه واسمَي الفريقين
    // (فـ«ذهب» جزء من «فريق النخبة الذهبي» وليست تسريباً).
    const q = await presenter.evaluate(() => { const r = JSON.parse(localStorage.getItem('big-challenge.match')).round; return r?.state.questions[r.state.index] ?? null; });
    if (!q) return;
    const body = await page.evaluate(names => { let t = document.body.innerText.replace(document.getElementById('label').textContent, ''); for (const n of names) t = t.split(n).join(''); return t; }, LONG);
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
  const st = () => presenter.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.state);
  const box = page => page.$eval('#letter', e => { const r = e.getBoundingClientRect(), s = getComputedStyle(e), tw = e.querySelector('.tw'), lt = e.querySelector('.lt');
    return { tw: tw?.textContent, lt: lt?.textContent, w: e.offsetWidth, h: e.offsetHeight, fs: parseFloat(s.fontSize), fits: (e.querySelector('.end') ?? e).offsetWidth <= e.clientWidth - 64 + 1,
      tf: [tw, lt].every(x => x && getComputedStyle(x).transform === 'none' && getComputedStyle(x).display === 'inline'),
      // الوصل: عرض التطويل والحرفين في عنصريهما يساوي عرضهما نصاً واحداً (لو انقطع الوصل لاختلف العرض).
      joined: (() => { const end = e.querySelector('.end'); if (!end) return false; const p = document.createElement('span'); p.style.cssText = 'position:absolute;visibility:hidden;white-space:nowrap';
        p.style.font = s.font; p.textContent = end.textContent; document.body.append(p); const ok = Math.abs(p.getBoundingClientRect().width - end.getBoundingClientRect().width) < 0.5; p.remove(); return ok; })() }; });

  // إلى المواجهة: أطول اسمين، والطريقة القصيرة، و«آخر حرفين» نمط الجولة الأولى و«الحرف المعيّن» الثانية.
  const toFace = async (first, second) => {
    await presenter.fill('#t1', LONG[0]);
    await presenter.fill('#t2', LONG[1]);
    await presenter.click('#method [data-m="short"]');
    await presenter.click('#toDraw');
    await presenter.click('#drawBtn');
    await presenter.waitForSelector('#toPick:not([hidden])', { timeout: 6000 });
    await presenter.click('#toPick');
    await presenter.click(`#modes [data-mode="${first}"]`);
    await presenter.click(`#modes [data-mode="${second}"]`);
    await presenter.click('#toFace');
    await wait(2500);
  };
  await toFace('last-two', 'letter');
  check('المواجهة: «ابدأ الجولة 1» مفعّل لآخر حرفين', (await text(presenter, '#startRound')) === 'ابدأ الجولة 1' && !(await presenter.isDisabled('#startRound')));

  // 1. الافتتاح
  await presenter.click('#startRound');
  await audience.waitForSelector('.scr.show[data-s="intro"]', { timeout: 5000 });
  const starter = (await st()).first;
  const other = t => (t === 1 ? 2 : 1);
  check('الجمهور: «أجب بكلمة تنتهي بالحرفين» و«6 أسئلة · 20 ثانية للسؤال · والسرقة في 5 ثوانٍ»', (await text(audience, '#rule')) === 'أجب بكلمة تنتهي بالحرفين' && (await text(audience, '#ruleSub')) === '6 أسئلة · 20 ثانية للسؤال · والسرقة في 5 ثوانٍ');
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
  check(`الجمهور: المربع ارتفاعه 220 وعرضه بين 220 و456 (${b.w})، والحرفان 150، لا يفيضان`, b.h === 220 && b.w >= 220 && b.w <= 456 && b.fs === 150 && b.fits);
  check('الجمهور: لا transform ولا inline-block على التطويل والحرفين، والوصل لا ينقطع بينهما', b.tf && b.joined);
  check('الجمهور: دخول الحرفين بالشفافية (التطويل أولاً ثم الحرفان بعد 150ms)', await audience.$eval('#letter', e => {
    const [a, c] = [e.querySelector('.tw'), e.querySelector('.lt')].map(x => getComputedStyle(x));
    return e.classList.contains('in') && a.animationName === 'in' && c.animationName === 'in' && c.animationDelay === '0.15s'; }));
  check('الجمهور: العدّاد ثابت على 0:20 قبل «ابدأ»', (await text(audience, '#timer')) === '0:20' && (await wait(1200), (await text(audience, '#timer')) === '0:20'));
  check('الجمهور: «سهل · نقطة» و«السؤال 1 من 6»', (await text(audience, '#b1')) === 'سهل · نقطة' && (await text(audience, '#b2')) === 'السؤال 1 من 6');
  check('المقدّم: «ـ» والحرفان، والإجابة النموذجية، وسطر القبول', (await text(presenter, '#qLetter')) === 'ـ' + q.box && (await text(presenter, '#qAnswer')) === q.answer
    && (await text(presenter, '#qAccept')) === `وتُقبل أي كلمة أخرى تنتهي بـ «ـ${q.box}» وتنطبق على الوصف.`);
  check('المقدّم: مربع الحرفين يتسع بعرضهما ولا يفيض', await presenter.$eval('#qLetter', e => e.scrollWidth <= e.clientWidth + 1 && e.offsetWidth >= e.offsetHeight - 1));
  await both('السؤال قبل ابدأ');
  await audience.screenshot({ path: `${shots}/s3-ready.png` });
  await presenter.screenshot({ path: `${shots}/s3-presenter-ready.png` });

  // 3. العدّاد يعدّ ثم صحيحة
  await presenter.click('#startTimer');
  await wait(1300);
  check('«ابدأ العدّاد»: يعدّ على الجمهور من 0:20', ['0:19', '0:18'].includes(await text(audience, '#timer')));
  await wait(400);
  await presenter.click('#yes');
  await wait(600);
  check('صحيحة · +1: الحكم مكان العدّاد بلون الفريق، والرصيد يزيد', (await text(audience, '#vtext')) === 'صحيحة · +1' && await audience.$eval('#verdict', (e, t) => e.classList.contains('t' + t), starter)
    && !(await visible(audience, '#timerBox')) && (await text(audience, '#s' + starter)) === '1');
  await both('صحيحة');

  // 4. السؤال 2: خاطئة ← سرقة ← يتركها تنتهي ← لا نقاط
  await wait(800);
  await presenter.click('#nextQ');
  await wait(800);
  s = await st();
  check('السؤال 2: للخصم، والحرفان غير حرفَي السؤال 1', s.questions[1].owner === other(starter) && s.questions[1].box !== s.questions[0].box && (await text(audience, '#letter')) === 'ـ' + s.questions[1].box);
  await presenter.click('#no');
  await wait(600);
  check('خاطئة: شارة «سرقة» بلون السارق، والعدّاد 0:05 أو أقل', await visible(audience, '#b4') && await audience.$eval('#b4', (e, t) => e.classList.contains('t' + t), starter)
    && ['0:05', '0:04'].includes(await text(audience, '#timer')));
  await both('السرقة');
  await audience.waitForSelector('#verdict:not([hidden])', { timeout: 8000 });
  await wait(300);
  check('انتهى وقت السرقة: «لا نقاط»', (await text(audience, '#vtext')) === 'لا نقاط');

  // 5. السؤال 3: يترك العدّاد 20 ثانية ← السرقة بعد انتهاء الوقت ← صحيحة بالنقاط نفسها (+2) ← تراجع
  await wait(800);
  await presenter.click('#nextQ');
  await wait(800);
  await presenter.click('#startTimer');
  // F5 على نافذة الجمهور والعدّاد يعدّ: يكمل من حيث كان.
  await wait(3200);
  await audience.reload();
  await audience.waitForSelector('.scr.show[data-s="q"]', { timeout: 6000 });
  await wait(500);
  const after = await text(audience, '#timer');
  check(`إعادة تحميل الجمهور أثناء العدّاد: يكمل (${after})`, ['0:16', '0:15', '0:17'].includes(after));
  check('بعد إعادة التحميل: الحرفان كما هما', (await box(audience)).lt === (await st()).questions[2].box);
  await presenter.waitForFunction(() => document.getElementById('qState').textContent.includes('بعد انتهاء الوقت'), null, { timeout: 22000 });
  await wait(800);
  const sc = JSON.parse(await presenter.evaluate(() => JSON.stringify(JSON.parse(localStorage.getItem('big-challenge.match')).round.scores)));
  check('السؤال 3 متوسط: «صحيحة · +2» للسارق', (await text(presenter, '#yes')) === 'صحيحة · +2');
  await presenter.click('#yes');
  await wait(800);
  const thief = other(starter);
  const sc2 = (await presenter.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.scores));
  check('السرقة بعد انتهاء الوقت: +2 للسارق', sc2[thief] === sc[thief] + 2);
  await presenter.click('#undo');
  await wait(800);
  const s3 = await st();
  check('تراجع عن آخر حكم: تعود السرقة والرصيد كما كان', s3.phase === 'steal' && (await presenter.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.scores))[thief] === sc[thief]);
  await presenter.click('#yes');
  await wait(800);

  // 6. F5 على المقدّم: الجولة كما هي
  await presenter.reload();
  await unlock(presenter);
  await wait(800);
  check('إعادة تحميل المقدّم: الجولة كما هي', (await text(presenter, '#qState')) === 'انتهى السؤال' && (await text(presenter, '#qLetter')) === 'ـ' + s3.questions[2].box);

  // 7. بقية الأسئلة حتى النهاية
  for (let i = 3; i < 6; i++) { await wait(800); await presenter.click('#nextQ'); await wait(800); await presenter.click('#yes'); }
  await wait(800);
  s = await st();
  check('الأسئلة الستة: الحرفان لا يتكرران في الجولة', new Set(s.questions.map(x => x.box)).size === 6);
  check('صعب: «صحيحة · +3» كان الزر الأخير', s.results[5] !== null);
  check('بعد السادس: «إنهاء الجولة»', (await text(presenter, '#nextQ')) === 'إنهاء الجولة');
  await presenter.click('#nextQ');
  await audience.waitForSelector('.scr.show[data-s="end"]');
  await wait(400);
  check('الجمهور: «انتهت الجولة 1» و«التالي: عجلة البونص»', (await text(audience, '#b1')) === 'انتهت الجولة 1' && (await text(audience, '#next')) === 'التالي: عجلة البونص');
  check('المقدّم: «انتهت الجولة 1 · آخر حرفين»', (await text(presenter, '#endHead')) === 'انتهت الجولة 1 · آخر حرفين');
  await both('النهاية');

  // 8. ما بعدها: تخطّي العجلة، ثم جولة «الحرف المعيّن» بوقتها 15 وحرف بلا تطويل
  await presenter.click('#endNext');
  await wait(900);
  check('بعد تخطّي العجلة: «ابدأ الجولة 2»', (await text(presenter, '#endNext')) === 'ابدأ الجولة 2');
  await presenter.click('#endNext');
  await audience.waitForSelector('.scr.show[data-s="intro"]');
  check('الجولة 2: «أجب بكلمة تبدأ بالحرف المعيّن» و15 ثانية', (await text(audience, '#rule')) === 'أجب بكلمة تبدأ بالحرف المعيّن' && (await text(audience, '#ruleSub')).includes('15 ثانية'));
  await wait(900);
  await presenter.click('#showQ');
  await audience.waitForSelector('.scr.show[data-s="q"]');
  const lq = (await st()).questions[0];
  // ينتظر ظهور الحرف الجديد والعدّاد بوقته بدل انتظار ثابت (تقرير المعاين ش3، الملاحظة 1).
  await audience.waitForFunction(b => document.getElementById('letter').textContent === b && document.getElementById('letter').offsetWidth === 220
    && document.getElementById('timer').textContent === '0:15', lq.box, { timeout: 5000 }).catch(() => {});
  await presenter.waitForFunction(b => document.getElementById('qLetter').textContent === b, lq.box, { timeout: 5000 }).catch(() => {});
  const l2 = [await text(audience, '#letter'), !!(await audience.$('#letter .tw')), (await box(audience)).w, await text(audience, '#timer'), await text(presenter, '#qLetter')];
  check(`الحرف المعيّن بعد آخر حرفين: حرف واحد بلا تطويل في مربع 220، والعدّاد 0:15${l2[0] === lq.box && !l2[1] && l2[2] === 220 && l2[3] === '0:15' && l2[4] === lq.box ? '' : ' ' + JSON.stringify([lq.box, ...l2])}`,
    l2[0] === lq.box && !l2[1] && l2[2] === 220 && l2[3] === '0:15' && l2[4] === lq.box);
  await both('الحرف المعيّن بعد آخر حرفين');

  // 9. النافذة الواحدة بأزرار الجولة في جولة آخر حرفين، وأعرض الحرفين في الخط مع أطول وصف في التصميم (مباراة ثانية ببنك تجريبي)
  const wide = { mode: 'last-two', questions: ['easy', 'easy', 'medium', 'medium', 'hard', 'hard'].map((level, i) => ({
    id: `test-last-two-${i}`, level, ending: ['سش', 'وس', 'مش', 'ان', 'ين', 'اء'][i], prompt: 'كتاب لا تقرؤه من أوله إلى آخره، بل تفتحه حين تجهل معنى كلمة، وأشهره المحيط للفيروزآبادي',
    answer: `كلمة${i}`, domain: 'daily-life' })) };
  await context.route('**/content/packs/general/last-two.json*', route => route.fulfill({ json: wide }));
  await presenter.reload();
  await unlock(presenter);
  presenter.once('dialog', d => d.accept());
  await presenter.evaluate(() => { localStorage.removeItem('big-challenge.seen'); document.getElementById('newMatch').onclick(); });
  await wait(300);
  await toFace('last-two', 'letter');
  await presenter.click('#singleBtn');
  await presenter.waitForSelector('#band [data-do="startNext"]', { timeout: 6000 });
  await presenter.click('#band [data-do="startNext"]');
  await presenter.waitForSelector('#single:not([hidden]) iframe', { timeout: 6000 });
  const frame = await (await presenter.$('#single iframe')).contentFrame();
  await frame.waitForSelector('.scr.show[data-s="intro"]', { timeout: 6000 });
  const bandText = () => presenter.$$eval('#band button', x => x.map(y => y.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
  check('الشريط: «اعرض السؤال 1» و«الرصيد»', (await bandText()) === 'نافذة واحدة · Esc للخروج | اعرض السؤال 1 | الرصيد');
  const widths = {};
  await presenter.click('#band [data-act="show"]');
  for (let i = 0; i < 6; i++) {
    await frame.waitForSelector('.scr.show[data-s="q"]');
    await wait(900);
    const cur = (await st()).questions[i];
    const bx = await box(frame);
    widths[cur.box] = bx;
    if ((await bandText()).includes(cur.answer)) leak = true;
    await audienceCheck(frame, `نافذة واحدة · ${cur.box}`);
    await presenterCheck(`نافذة واحدة · ${cur.box}`);
    if (i === 0) await presenter.screenshot({ path: `${shots}/s3-single.png` });
    await presenter.click('#band [data-act="correct"]');
    await wait(900);
    await presenter.click('#band [data-act="next"]');
  }
  check(`أعرض الحرفين «سش»: المربع 456 والخط مصغّر بين 128 و150 (${widths['سش']?.w} · ${widths['سش']?.fs})`, widths['سش']?.w <= 456 && widths['سش'].fs >= 128 && widths['سش'].fs < 150 && widths['سش'].fits);
  check('الوصل لا ينقطع في الحرفين الستة', Object.values(widths).length === 6 && Object.values(widths).every(x => x.joined));
  check('«وس» و«مش» داخل المربع دون فيض', ['وس', 'مش'].every(k => widths[k]?.fits && widths[k].w <= 456));
  check('«ان» و«ين» و«اء» بحجمها الكامل 150', ['ان', 'ين', 'اء'].every(k => widths[k]?.fs === 150 && widths[k].w >= 220));
  check('الشريط لا يعرض الإجابة', !leak);

  await presenter.setViewportSize({ width: 1920, height: 1080 });
  await presenterCheck('1920');
  check(`فحص التداخل على شاشة الجمهور في كل حالة${fails.length ? ': ' + fails.slice(0, 3).join(' | ') : ''}`, layoutOk);
  check('نافذة المقدّم: لا نص أصغر من 32، ولا زر أقصر من 64، ولا تمرير، ولا أرقام هندية، ولا ميل', presenterOk);
  check('لا إجابة على شاشة الجمهور في أي حالة', !leak);
  check(`لا أخطاء في الصفحتين${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`, !errors.length);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})();
