// اختبار آلي لجولة «الحرف المعيّن» بالنافذتين وبالنافذة الواحدة: الافتتاح، والسؤال والعدّاد، والحكم والنقاط،
// والسرقة (بعد الخطأ وبعد انتهاء الوقت)، والتراجع، والنهاية وما بعدها، والحفظ بعد إعادة التحميل،
// ولا إجابة على شاشة الجمهور، وفحص التداخل والقياسات في كل حالة.
const { chromium } = require('playwright');
const { usePin, unlock, reporter } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || '.';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { check, finish } = reporter();
  const errors = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const LONG = ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'];
  const bank = require('../content/packs/general/letter.json').questions;
  const answers = bank.flatMap(q => [q.answer, ...(q.alts ?? [])]);

  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
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
    const body = await page.evaluate(() => document.body.innerText + JSON.stringify(window.__lastView ?? ''));
    const shown = await page.textContent('#label');
    if (answers.some(a => body.includes(a) && !shown.includes(a))) { leak = true; fails.push(`${label}: إجابة على شاشة الجمهور`); }
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

  // إلى المواجهة: أطول اسمين، والطريقة القصيرة، و«الحرف المعيّن» نمط الجولة الأولى.
  await presenter.fill('#t1', LONG[0]);
  await presenter.fill('#t2', LONG[1]);
  await presenter.click('#method [data-m="short"]');
  await presenter.click('#toDraw');
  await presenter.click('#drawBtn');
  await presenter.waitForSelector('#toPick:not([hidden])', { timeout: 6000 });
  await presenter.click('#toPick');
  await presenter.click('#modes [data-mode="letter"]');
  await presenter.click('#modes [data-mode="last-two"]');
  await presenter.click('#toFace');
  await wait(2500);
  check('المواجهة: «ابدأ الجولة 1» مفعّل', (await text(presenter, '#startRound')) === 'ابدأ الجولة 1' && !(await presenter.isDisabled('#startRound')));

  // 1. الافتتاح
  await presenter.click('#startRound');
  await audience.waitForSelector('.scr.show[data-s="intro"]', { timeout: 5000 });
  const starter = await presenter.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.first);
  const other = t => (t === 1 ? 2 : 1);
  check('الجمهور: الافتتاح بالقاعدة وسطر الوقت', (await text(audience, '#rule')) === 'أجب بكلمة تبدأ بالحرف المعيّن' && (await text(audience, '#ruleSub')) === '6 أسئلة · 15 ثانية للسؤال · والسرقة في 5 ثوانٍ');
  check('الجمهور: «يبدأ [الاسم]» والمؤشر حوله', (await text(audience, '#starter')) === `يبدأ ${LONG[starter - 1]}` && await audience.$eval(`#p${starter}`, e => e.classList.contains('on')));
  check('الجمهور: شارة النمط «الحرف المعيّن» و«الجولة 1 من 2»', (await text(audience, '#mode')) === 'الحرف المعيّن' && await visible(audience, '.badge.mode') && (await text(audience, '#b1')) === 'الجولة 1 من 2');
  check('الجمهور: قبل أول سؤال لا شريط فارق ولا رقم عملاق، ولا عدّاد، والرصيد 0', !(await visible(audience, '.strip')) && !(await visible(audience, '.giant')) && !(await visible(audience, '#timerBox')) && (await text(audience, '#s1')) === '0');
  check('المقدّم: الافتتاح «يبدأ … (اختير عشوائياً)» و«اعرض السؤال 1»', (await text(presenter, '#introWho')).includes('(اختير عشوائياً)') && (await text(presenter, '#showQ')) === 'اعرض السؤال 1');
  check('المقدّم: الرأس بشارة «الجولة 1 من 2 · الحرف المعيّن» ومسار ستة أسئلة، ولا خطوات ولا لوحة شاشة', (await text(presenter, '#roundChip')) === 'الجولة 1 من 2 · الحرف المعيّن'
    && (await presenter.$$('#pips .pip')).length === 6 && !(await visible(presenter, '#steps')) && !(await visible(presenter, '#screenPanel')));
  await both('الافتتاح');
  await audience.screenshot({ path: `${shots}/s2-intro.png` });

  // 2. السؤال قبل «ابدأ»
  await presenter.click('#showQ');
  await audience.waitForSelector('.scr.show[data-s="q"]');
  await wait(200);
  const q1 = await presenter.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.state.questions);
  check('الجمهور: الحرف والسؤال', (await text(audience, '#letter')) === q1[0].letter && (await text(audience, '#label')) === q1[0].prompt);
  check('الجمهور: العدّاد ثابت على 0:15 قبل «ابدأ»', (await text(audience, '#timer')) === '0:15' && (await wait(1200), (await text(audience, '#timer')) === '0:15'));
  check('الجمهور: «سهل · نقطة» و«السؤال 1 من 6»، ولا شارة سرقة', (await text(audience, '#b1')) === 'سهل · نقطة' && (await text(audience, '#b2')) === 'السؤال 1 من 6' && !(await visible(audience, '#b4')));
  check('الجمهور: الشريط والرقم العملاق ظاهران بعد الافتتاح', await visible(audience, '.strip') && await visible(audience, '.giant'));
  check('المقدّم: الإجابة النموذجية وسطر القبول', (await text(presenter, '#qAnswer')) === q1[0].answer && (await text(presenter, '#qAccept')) === `وتُقبل أي كلمة أخرى تبدأ بـ «${q1[0].letter}» وتنطبق على المطلوب.`);
  check('المقدّم: «لم يبدأ العدّاد»، و«ابدأ العدّاد» و«صحيحة · +1» و«خاطئة»', (await text(presenter, '#qState')) === 'لم يبدأ العدّاد' && await visible(presenter, '#startTimer') && (await text(presenter, '#yes')) === 'صحيحة · +1' && await visible(presenter, '#no'));
  await both('قبل ابدأ');
  await audience.screenshot({ path: `${shots}/s2-ready.png` });
  await presenter.screenshot({ path: `${shots}/s2-presenter-ready.png` });

  // 3. العدّاد يعدّ، ثم صحيحة
  await presenter.click('#startTimer');
  await wait(1600);
  const t = await text(audience, '#timer');
  check(`الجمهور: العدّاد يعدّ (${t})`, t === '0:14' || t === '0:13');
  check('المقدّم: «العدّاد يعدّ على الشاشة» ولا «ابدأ»', (await text(presenter, '#qState')) === 'العدّاد يعدّ على الشاشة' && !(await visible(presenter, '#startTimer')));
  await both('العدّاد يعدّ');
  await presenter.click('#yes');
  await wait(900);
  check('الجمهور: الحكم «صحيحة · +1» مكان العدّاد بلون الفريق', (await text(audience, '#vtext')) === 'صحيحة · +1' && await audience.$eval('#verdict', (e, s) => e.classList.contains('t' + s), starter) && !(await visible(audience, '#timerBox')));
  check('الجمهور: الرصيد 1 في اللوحة والرقم العملاق، والفارق «يتقدّم بفارق 1»', (await text(audience, `#s${starter}`)) === '1' && (await text(audience, `#g${starter}`)) === '1' && (await text(audience, `#d${starter}`)) === 'يتقدّم بفارق 1');
  check('المقدّم: «صحيحة · +1 لـ…» و«السؤال التالي · 2 من 6»', (await text(presenter, '#qDone')) === `صحيحة · +1 لـ${LONG[starter - 1]}` && (await text(presenter, '#nextQ')) === 'السؤال التالي · 2 من 6');
  check('المقدّم: المسار يمتلئ بلون الكاسب', await presenter.$eval('#pips .pip', (e, s) => e.classList.contains('won' + s), starter));
  await both('صحيحة');
  await audience.screenshot({ path: `${shots}/s2-right.png` });

  // 4. السؤال 2 للخصم: خاطئة قبل «ابدأ» ← السرقة، ثم ينتهي وقتها ← لا نقاط
  await presenter.click('#nextQ');
  await wait(300);
  check('السؤال 2: الدور للفريق الآخر', (await text(presenter, '#who')) === `دور ${LONG[other(starter) - 1]}` && await audience.$eval(`#p${other(starter)}`, e => e.classList.contains('on')));
  await presenter.click('#no');
  await wait(400);
  check('الجمهور: شارة «سرقة» بلون السارق، والمؤشر عليه، والعدّاد 0:05 يعدّ', await visible(audience, '#b4') && await audience.$eval('#b4', (e, s) => e.classList.contains('t' + s), starter)
    && await audience.$eval(`#p${starter}`, e => e.classList.contains('on')) && ['0:05', '0:04'].includes(await text(audience, '#timer')));
  check('المقدّم: «سرقة: …» و«بعد الخطأ · 5 ثوانٍ»', (await text(presenter, '#who')) === `سرقة: ${LONG[starter - 1]}` && (await text(presenter, '#qState')) === 'بعد الخطأ · 5 ثوانٍ');
  await both('السرقة');
  await audience.screenshot({ path: `${shots}/s2-steal.png` });
  await presenter.screenshot({ path: `${shots}/s2-presenter-steal.png` });
  await wait(2700);
  check('آخر 3 ثوانٍ: حواف الخطر', await audience.$eval('#canvas', e => e.classList.contains('meta-danger')));
  await wait(2600);
  check('انتهى وقت السرقة: «لا نقاط»، وحواف الخطر تختفي', (await text(audience, '#vtext')) === 'لا نقاط' && !(await audience.$eval('#canvas', e => e.classList.contains('meta-danger'))) && (await text(presenter, '#qDone')) === 'لا نقاط في هذا السؤال.');
  check('المسار: السؤال 2 بلا نقاط', await presenter.$eval('#pips .pip:nth-child(2)', e => e.classList.contains('none')));
  await both('لا نقاط');
  await audience.screenshot({ path: `${shots}/s2-none.png` });

  // 5. السؤال 3: ينتهي الوقت ← السرقة، ثم سرقة صحيحة بالنقاط نفسها (2)، ثم التراجع عنها وإعادتها
  await presenter.click('#nextQ');
  await presenter.click('#startTimer');
  await presenter.waitForFunction(() => document.getElementById('qState').textContent.includes('بعد انتهاء الوقت'), null, { timeout: 18000 });
  check('انتهى الوقت: السرقة «بعد انتهاء الوقت · 5 ثوانٍ»', (await text(presenter, '#who')) === `سرقة: ${LONG[other(starter) - 1]}`);
  await wait(1200);
  await presenter.click('#yes');
  await wait(600);
  check('سرقة صحيحة: «صحيحة · +2» بلون السارق، ورصيده 2', (await text(audience, '#vtext')) === 'صحيحة · +2' && await audience.$eval('#verdict', (e, s) => e.classList.contains('t' + s), other(starter)) && (await text(audience, `#s${other(starter)}`)) === '2');
  await presenter.click('#undo');
  await wait(400);
  check('التراجع: يعود إلى السرقة، والرصيد كما كان، وعدّاد السرقة من 0:05 من جديد', (await text(presenter, '#who')).startsWith('سرقة') && (await text(audience, `#s${other(starter)}`)) === '0' && ['0:05', '0:04'].includes(await text(audience, '#timer')));
  await presenter.click('#yes');
  await wait(300);

  // 6. إعادة تحميل النافذتين أثناء الجولة
  await presenter.click('#nextQ');
  await presenter.click('#startTimer');
  await wait(2600);
  await audience.reload();
  await audience.waitForSelector('.scr.show[data-s="q"]', { timeout: 6000 });
  await wait(500);
  const tr = await text(audience, '#timer');
  check(`إعادة تحميل الجمهور أثناء العدّاد: يكمل من حيث كان (${tr})`, ['0:12', '0:11'].includes(tr) && (await text(audience, '#b2')) === 'السؤال 4 من 6');
  await presenter.reload();
  await unlock(presenter);
  await wait(400);
  check('إعادة تحميل المقدّم: الجولة كما هي (السؤال 4)', (await text(presenter, '#qMeta')).includes('السؤال 4 من 6') && (await text(presenter, '#qState')) === 'العدّاد يعدّ على الشاشة');
  await presenter.click('#yes');

  // 7. تعديل الرصيد أثناء الجولة، والتراجع عنه
  const before = await text(audience, `#s${starter}`);
  await presenter.click('#openScores');
  await presenter.click(`#scores [data-team="${starter}"][data-d="1"]`);
  await wait(300);
  check('الرصيد +1 يدوياً أثناء الجولة يظهر على الجمهور', +(await text(audience, `#s${starter}`)) === +before + 1);
  await presenter.click('#undoScore');
  await wait(300);
  check('«تراجع» في طبقة الرصيد يعيده', (await text(audience, `#s${starter}`)) === before);
  await presenter.click('#closeScores');

  // 8. بقية الجولة، ثم النهاية
  for (let i = 0; i < 2; i++) { await presenter.click('#nextQ'); await presenter.click('#yes'); }
  check('بعد السادس: «إنهاء الجولة»', (await text(presenter, '#nextQ')) === 'إنهاء الجولة');
  await both('أطول صف');
  await presenter.click('#nextQ');
  await audience.waitForSelector('.scr.show[data-s="end"]');
  await wait(300);
  const totals = await presenter.evaluate(() => { const m = JSON.parse(localStorage.getItem('big-challenge.match')); return m.round.scores; });
  check('الجمهور: «انتهت الجولة 1» وحصيلة كل فريق و«التالي: عجلة البونص»', (await text(audience, '#b1')) === 'انتهت الجولة 1' && (await text(audience, '#next')) === 'التالي: عجلة البونص'
    && (await text(audience, '#r1')) === `+${totals[1]}` && (await text(audience, '#r2')) === `+${totals[2]}`);
  check('الجمهور: لا مؤشر دور ولا عدّاد في النهاية', !(await audience.$('.team.on')) && !(await visible(audience, '#timerBox')) && !(await visible(audience, '#verdict')));
  check('المقدّم: الحصيلة والرصيد، و«تخطَّ عجلة البونص» مع موعدها', (await text(presenter, '#sum')).includes(`الرصيد ${totals[1]}`) && (await text(presenter, '#endNext')) === 'تخطَّ عجلة البونص' && (await text(presenter, '#endHint')).includes('الشريحة 6'));
  await both('النهاية');
  await presenter.screenshot({ path: `${shots}/s2-presenter-end.png` });
  await audience.screenshot({ path: `${shots}/s2-end.png` });
  await presenter.click('#endNext');
  check('بعد تخطّي العجلة: «تخطَّ الجولة 2» (آخر حرفين لم يُبنَ)', (await text(presenter, '#endNext')) === 'تخطَّ الجولة 2' && (await text(presenter, '#endHint')).includes('الشريحة 3'));
  await presenter.click('#endNext');
  check('بعدها: «إلى النتيجة النهائية» معطّل (ش7)', (await text(presenter, '#endNext')) === 'إلى النتيجة النهائية' && await presenter.isDisabled('#endNext'));

  // 9. ذاكرة الأسئلة: مباراة ثانية لا تعيد أسئلة الأولى ما دام في البنك غيرها
  const firstIds = q1.map(q => q.id);
  presenter.once('dialog', d => d.accept());
  await presenter.click('[data-part="end"] [data-new]');
  await presenter.fill('#t1', LONG[0]);
  await presenter.fill('#t2', LONG[1]);
  await presenter.click('#method [data-m="short"]');
  await presenter.click('#toDraw');
  await presenter.click('#drawBtn');
  await presenter.waitForSelector('#toPick:not([hidden])', { timeout: 6000 });
  await presenter.click('#toPick');
  await presenter.click('#modes [data-mode="last-two"]');
  await presenter.click('#modes [data-mode="letter"]');
  await presenter.click('#toFace');
  await wait(300);
  check('الجولة 1 لنمط لم يُبنَ: «تخطَّ الجولة 1» مع موعده', (await text(presenter, '#startRound')) === 'تخطَّ الجولة 1' && (await text(presenter, '#faceHint')).includes('الشريحة 3'));
  await presenter.click('#startRound');
  check('بعد التخطي: «تخطَّ عجلة البونص»', (await text(presenter, '#startRound')) === 'تخطَّ عجلة البونص');
  await presenter.click('#startRound');
  check('ثم «ابدأ الجولة 2» للحرف المعيّن', (await text(presenter, '#startRound')) === 'ابدأ الجولة 2');
  await presenter.click('#startRound');
  await audience.waitForSelector('.scr.show[data-s="intro"]');
  check('الجولة 2 أول جولة تُلعب: لا شريط ولا رقم عملاق في افتتاحها', !(await visible(audience, '.strip')) && (await text(audience, '#b1')) === 'الجولة 2 من 2');
  const q2 = await presenter.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.state.questions.map(q => q.id));
  const fresh = q2.filter(id => !firstIds.includes(id)).length;
  check(`ذاكرة الأسئلة: أسئلة المباراة الثانية جديدة (${fresh} من 6)`, fresh === 6);

  // 10. انقطاع نافذة الجمهور أثناء الجولة: زرّان مكان المسار
  await audience.close();
  await presenter.waitForFunction(() => !document.getElementById('lost').hidden, null, { timeout: 6000 });
  check('الانقطاع: «افتح نافذة الجمهور» و«نافذة واحدة» مكان المسار', await visible(presenter, '#lostOpen') && !(await visible(presenter, '#pips')));
  await presenterCheck('منقطعة');

  // 11. النافذة الواحدة (من زر الانقطاع في الرأس): الشريط بأزرار الجولة، ولا إجابة فيه
  await presenter.click('#lostSingle');
  await presenter.waitForSelector('#single:not([hidden]) iframe');
  const frame = await (await presenter.$('#single iframe')).contentFrame();
  await frame.waitForSelector('.scr.show[data-s="intro"]', { timeout: 6000 });
  const bandText = () => presenter.$$eval('#band button', b => b.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
  const bandFits = () => presenter.evaluate(() => { const b = document.getElementById('band'); return b.scrollWidth <= b.clientWidth + 1; });
  check('الشريط: الوسم «نافذة واحدة · Esc للخروج» و«اعرض السؤال 1» و«الرصيد»، ولا «تراجع» في الافتتاح', (await bandText()) === 'نافذة واحدة · Esc للخروج | اعرض السؤال 1 | الرصيد');
  await presenter.click('#band [data-act="show"]');
  await frame.waitForSelector('.scr.show[data-s="q"]');
  check('الشريط قبل «ابدأ»: «ابدأ العدّاد» «صحيحة» «خاطئة» «تراجع» «الرصيد»', (await bandText()) === 'نافذة واحدة · Esc للخروج | ابدأ العدّاد | صحيحة | خاطئة | تراجع | الرصيد' && await bandFits());
  const q2a = await presenter.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.state.questions[0]);
  check('الشريط لا يعرض الإجابة', !(await bandText()).includes(q2a.answer));
  await wait(300);
  await audienceCheck(frame, 'نافذة واحدة · قبل ابدأ');
  await presenter.screenshot({ path: `${shots}/s2-single-ready.png` });
  await presenter.click('#band [data-act="start"]');
  await wait(1300);
  check('النافذة الواحدة: العدّاد يعدّ في اللوحة', ['0:14', '0:13'].includes(await frame.textContent('#timer')));
  await presenter.click('#band [data-act="wrong"]');
  await wait(400);
  check('النافذة الواحدة: السرقة، والشريط «صحيحة» «خاطئة»', await frame.isVisible('#b4') && (await bandText()) === 'نافذة واحدة · Esc للخروج | صحيحة | خاطئة | تراجع | الرصيد');
  await presenter.click('#band [data-act="correct"]');
  await wait(300);
  check('النافذة الواحدة: بعد الحكم «السؤال التالي»', (await bandText()) === 'نافذة واحدة · Esc للخروج | السؤال التالي | تراجع | الرصيد' && await bandFits());
  await presenter.click('#band [data-do="scores"]');
  check('«الرصيد» يفتح طبقة الرصيد فوق اللوحة', await visible(presenter, '#scores') && await presenter.evaluate(() => {
    const r = document.getElementById('scores').getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + 10)?.closest('#scores') !== null;
  }));
  await presenter.click('#closeScores');
  await presenter.keyboard.press('Escape');
  await wait(200);
  check('Esc: العودة إلى نافذتين والجولة كما هي', !(await visible(presenter, '#single')) && (await text(presenter, '#qState')) === 'انتهى السؤال');

  // 12. المقاس الأصغر: نافذة المقدّم 1366×768 كانت المقاس طوال الاختبار. والآن 1920×1080.
  await presenter.setViewportSize({ width: 1920, height: 1080 });
  await presenterCheck('1920');

  check(`فحص التداخل على شاشة الجمهور في كل حالة${fails.length ? ': ' + fails.slice(0, 3).join(' | ') : ''}`, layoutOk);
  check('نافذة المقدّم: لا نص أصغر من 32، ولا زر أقصر من 64، ولا تمرير، ولا أرقام هندية، ولا ميل', presenterOk);
  check('لا إجابة على شاشة الجمهور في أي حالة', !leak);
  check(`لا أخطاء في الصفحتين${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`, !errors.length);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})();
