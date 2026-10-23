// اختبار آلي لشريحة «بدء المباراة»: الأسماء والحزمة وطريقة اللعب، والقرعة، واختيار الأنماط، وشاشة المواجهة،
// والحفظ بعد إعادة التحميل، وتعديل الرصيد، والنافذة الواحدة، وفحص التداخل في كل شاشة.
const { chromium } = require('playwright');
const { usePin, unlock, reporter, testPinRecord } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || '.';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { check, finish } = reporter();
  const errors = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const LONG = ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'];

  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await usePin(context);
  let pinFetches = 0;
  context.on('request', r => { if (r.url().includes('pin.json')) pinFetches++; });
  context.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    // ملف نمط لم يُكتب بعد يعود 404، وهذا متوقع (النمط «غير متاح بعد»).
    p.on('console', m => m.type() === 'error' && !/content\/packs\/.+\.json/.test(m.location().url) && errors.push(m.text()));
  });

  const presenter = await context.newPage();
  await presenter.goto(base);
  await unlock(presenter);
  const text = (page, sel) => page.textContent(sel).then(t => t.replace(/\s+/g, ' ').trim());
  const visible = (page, sel) => page.isVisible(sel);

  // 1. الإعداد
  check('المقدّم: الخطوة الحالية «الإعداد»', (await text(presenter, '#steps li.now')).includes('الإعداد'));
  check('المقدّم: التنبيه في سطرين ظاهر قبل الاتصال', await visible(presenter, '#notice') && (await presenter.$$('#notice p')).length === 2);
  const lines = await presenter.evaluate(() => [...document.querySelectorAll('#notice p')].map(p => Math.round(p.getBoundingClientRect().height / (parseFloat(getComputedStyle(p).lineHeight)))));
  check(`المقدّم: كل سطر من التنبيه لا يلتف (${lines})`, lines.every(n => n === 1));
  check('المقدّم: الحزمة الثقافية العامة مختارة', (await text(presenter, '#packs .choice.sel')).includes('الحزمة الثقافية العامة'));
  check('المقدّم: «كاملة» مختارة افتراضياً', (await presenter.getAttribute('#method .sel', 'data-m')) === 'full');

  const [audience] = await Promise.all([context.waitForEvent('page'), presenter.click('#open')]);
  await audience.waitForLoadState();
  await audience.setViewportSize({ width: 1920, height: 1080 });
  await presenter.waitForFunction(() => document.getElementById('status').dataset.on === 'true', null, { timeout: 5000 });
  await audience.waitForSelector('.scr.title.show', { timeout: 5000 });
  check('بعد الاتصال يختفي التنبيه', !(await visible(presenter, '#notice')));
  check('الجمهور: شاشة الانتظار «التحدي الكبير»', (await text(audience, '.scr.title.show')).includes('التحدي الكبير'));
  check('الجمهور: اللوحتان «الفريق الأول» و«الفريق الثاني» بلا رقم', (await text(audience, '#n1')) === 'الفريق الأول' && (await text(audience, '#n2')) === 'الفريق الثاني' && (await text(audience, '#s1')) === '');
  check('الجمهور: الشارتان الحزمة والطريقة', (await text(audience, '#b1')) === 'الحزمة الثقافية العامة' && (await text(audience, '#b2')) === 'مباراة كاملة · 4 جولات');
  check('الجمهور: لا عدّاد ولا شريط فارق ولا رقم عملاق ولا مربع حرف', !(await visible(audience, '.timer')) && !(await visible(audience, '.strip')) && !(await visible(audience, '.giant')) && !(await visible(audience, '#letter')));
  check('الجمهور: لا مؤشر دور في الانتظار', !(await audience.$('.team.on')));

  await presenter.click('#toDraw');
  check('خطأ: «اكتب اسم الفريق الأول»', (await text(presenter, '#setupErr')) === 'اكتب اسم الفريق الأول' && await presenter.$eval('#t1', e => e.classList.contains('bad')));
  await presenter.fill('#t1', 'الصقور');
  await presenter.click('#toDraw');
  check('خطأ: «اكتب اسم الفريق الثاني»', (await text(presenter, '#setupErr')) === 'اكتب اسم الفريق الثاني');
  await presenter.fill('#t2', ' الصقور ');
  await presenter.click('#toDraw');
  check('خطأ: «الاسمان متطابقان. غيّر أحدهما.»', (await text(presenter, '#setupErr')) === 'الاسمان متطابقان. غيّر أحدهما.');
  await presenter.fill('#t2', 'أبعد من ثمانية عشر حرفاً بكثير');
  check('الحقل لا يتجاوز 18 حرفاً، والعدّاد «18 / 18» أحمر', [...await presenter.inputValue('#t2')].length === 18 && (await text(presenter, '#c2')) === '18 / 18' && await presenter.$eval('#c2', e => e.classList.contains('full')));
  await presenter.fill('#t2', '');
  await presenter.type('#t2', 'فريق ٣');
  await wait(200);
  check('الأرقام الهندية في الاسم تصير إنجليزية عند الكتابة، وعلى الجمهور', (await presenter.inputValue('#t2')) === 'فريق 3' && (await text(audience, '#n2')) === 'فريق 3');
  await presenter.fill('#t2', 'النجوم');
  check('العدّاد «6 / 18»', (await text(presenter, '#c2')) === '6 / 18');
  await wait(200);
  check('الجمهور: الاسمان كما يُكتبان', (await text(audience, '#n1')) === 'الصقور' && (await text(audience, '#n2')) === 'النجوم');
  await presenter.click('#method [data-m="short"]');
  await wait(200);
  check('الجمهور: «مباراة قصيرة · جولتان»', (await text(audience, '#b2')) === 'مباراة قصيرة · جولتان');
  await presenter.click('#method [data-m="full"]');

  // 2. القرعة: الرقم السري يُتحقق منه عند «إلى القرعة».
  const before = pinFetches;
  await presenter.click('#toDraw');
  await presenter.waitForSelector('[data-step="draw"]:not([hidden])');
  check('«إلى القرعة» يتحقق من الرقم السري', pinFetches > before);
  check('المقدّم: الخطوة الحالية «القرعة»، و«الإعداد» مضت', (await text(presenter, '#steps li.now')).includes('القرعة') && (await text(presenter, '#steps li.done')).includes('الإعداد'));
  await wait(200);
  await presenter.click('#backSetup');
  await presenter.waitForSelector('[data-step="setup"]:not([hidden])');
  check('«رجوع إلى الإعداد» قبل القرعة يبقي الاسمين', (await presenter.inputValue('#t1')) === 'الصقور' && (await presenter.inputValue('#t2')) === 'النجوم');
  await presenter.press('#t2', 'Enter');
  await presenter.waitForSelector('[data-step="draw"]:not([hidden])');
  check('Enter في الحقل الثاني = «إلى القرعة»', true);
  await wait(200);
  check('الجمهور: «من يختار نمط الجولة الأولى؟» وشارة «القرعة»', (await text(audience, '.scr.show')).includes('من يختار نمط الجولة الأولى؟') && (await text(audience, '#b1')) === 'القرعة' && !(await visible(audience, '#b2')));

  await presenter.click('#drawBtn');
  const turns = [];
  for (let i = 0; i < 14; i++) { await wait(130); turns.push(await audience.evaluate(() => document.querySelector('.team.on')?.id ?? '-')); }
  check(`الجمهور: المؤشر يتنقل بين اللوحتين أثناء القرعة (${new Set(turns).size} مواضع)`, turns.includes('p1') && turns.includes('p2'));
  check('المقدّم: «القرعة جارية…» أثناء الحركة', (await text(presenter, '#drawBtn')) === 'القرعة جارية…' && await presenter.isDisabled('#drawBtn'));
  await presenter.waitForSelector('#drawResult:not([hidden])', { timeout: 5000 });
  await audience.waitForSelector('.scr.show[data-s="result"]', { timeout: 5000 });
  await wait(100);
  const saved = await presenter.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')));
  const W = saved.winner, names = { 1: 'الصقور', 2: 'النجوم' };
  check(`القرعة محسومة ومحفوظة (الفائز ${W})`, W === 1 || W === 2);
  check('الجمهور: «الفائز بالقرعة» واسمه بلون فريقه', (await text(audience, '#winner')) === names[W] && !!(await audience.$(`#winner .tn.t${W}`)));
  check('الجمهور: المؤشر حول لوحة الفائز', (await audience.evaluate(() => [...document.querySelectorAll('.team.on')].map(e => e.id).join())) === `p${W}`);
  check('المقدّم: النتيجة نفسها', (await text(presenter, '#drawWho')) === names[W]);
  check('لا زر لإعادة القرعة، ولا رجوع إلى الإعداد بعدها', !(await visible(presenter, '#drawBtn')) && !(await visible(presenter, '#backSetup')));
  await audience.screenshot({ path: `${shots}/s1-draw.png` });

  // 3. اختيار الأنماط: الفائز ثم الآخر ثم الفائز، والرابعة تلقائياً.
  await presenter.click('#toPick');
  await wait(200);
  const L = W === 1 ? 2 : 1;
  check('الأنماط الأربعة بترتيبها', (await presenter.$$eval('#modes .mode', b => b.map(x => x.textContent.trim()).join('،'))) === 'الحرف المعيّن،آخر حرفين،المزاد،الترتيب');
  check('المقدّم: الفائز يختار نمط الجولة 1 من 4', (await text(presenter, '#pickWho')) === `${names[W]} يختار نمط الجولة 1 من 4`);
  check('الجمهور: «يختار نمط الجولة 1» وشارة «الجولة 1 من 4»', (await text(audience, '#pickHead')) === `${names[W]} يختار نمط الجولة 1` && (await text(audience, '#b2')) === 'الجولة 1 من 4');
  check('الجمهور: المؤشر حول من يختار', (await audience.evaluate(() => document.querySelector('.team.on')?.id)) === `p${W}`);
  await presenter.click('#modes [data-mode="auction"]');
  await wait(200);
  check('الجمهور: خانة «المزاد» بلون الفائز و«الجولة 1»', await audience.$eval('[data-mode="auction"]', (e, w) => e.classList.contains(`by${w}`) && e.textContent.includes('الجولة 1'), W));
  check('الدور ينتقل إلى الآخر', (await audience.evaluate(() => document.querySelector('.team.on')?.id)) === `p${L}` && (await text(presenter, '#pickWho')).startsWith(names[L]));
  await presenter.click('#modes [data-mode="letter"]');
  await presenter.click('#modes [data-mode="ranking"]');
  await wait(200);
  check('الجولة 4 للنمط المتبقي تلقائياً', (await text(audience, '#pickHead')) === 'الجولة 4 للنمط المتبقي: آخر حرفين' && await audience.$eval('[data-mode="last-two"]', e => e.classList.contains('auto')));
  check('بعد الاكتمال لا مؤشر، و«إلى شاشة المواجهة» مفعّل', !(await audience.$('.team.on')) && !(await presenter.isDisabled('#toFace')));
  await audience.screenshot({ path: `${shots}/s1-pick.png` });
  await presenter.click('#undoPick');
  await wait(200);
  const afterUndo = await presenter.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).picks.map(p => p.mode).join());
  check(`التراجع يرفع آخر اختيار ومعه التلقائية (${afterUndo})`, afterUndo === 'auction,letter' && await presenter.isDisabled('#toFace'));
  await presenter.click('#modes [data-mode="last-two"]');
  await wait(200);
  check('بعد التراجع يُختار غيره، والتلقائية «الترتيب»', (await text(audience, '#pickHead')) === 'الجولة 4 للنمط المتبقي: الترتيب');
  check('النمط المختار لا يُختار مرة أخرى', await presenter.isDisabled('#modes .mode.by' + W));

  // 4. المواجهة
  await presenter.click('#toFace');
  await audience.waitForSelector('.scr.show[data-s="face"]');
  await wait(2600);
  const track = await audience.$$eval('#track .seg', s => s.map(x => [...x.children].map(c => c.textContent.trim()).join(' ')).join(' | '));
  const shown = await audience.$$eval('#track .seg', s => s.every(x => getComputedStyle(x).opacity === '1'));
  check('الجمهور: خانات المسار ظاهرة بعد حركة المواجهة', shown);
  check(`الجمهور: المسار (${track})`, track === 'الجولة 1 المزاد | الجولة 2 الحرف المعيّن | عجلة البونص | الجولة 3 آخر حرفين | عجلة البونص | الجولة 4 الترتيب');
  check('الجمهور: «الفائز بالقرعة» والرصيد 0 والمؤشر حول الفائز', (await text(audience, '#faceHead')) === `الفائز بالقرعة: ${names[W]}` && (await text(audience, '#s1')) === '0' && (await text(audience, '#s2')) === '0' && (await audience.evaluate(() => document.querySelector('.team.on')?.id)) === `p${W}`);
  check('المقدّم: ملخص المباراة 6 أسطر', (await presenter.$$('#plan li')).length === 6);
  // من ش2: الجولة الأولى هنا «المزاد» ولم يُبنَ بعد، فيُعرض تخطّيها في التجربة مع موعده (الشريحة 4).
  check('الجولة 1 لنمط لم يُبنَ: «تخطَّ الجولة 1» وموعده', (await text(presenter, '#startRound')) === 'تخطَّ الجولة 1' && (await text(presenter, '#faceHint')).includes('الشريحة 4'));
  await audience.screenshot({ path: `${shots}/s1-face.png` });

  // 5. الحفظ: إعادة تحميل نافذة الجمهور ثم نافذة المقدّم.
  await audience.reload();
  await audience.waitForSelector('.scr.show[data-s="face"]', { timeout: 6000 });
  check('إعادة تحميل الجمهور: تعود المواجهة كما هي', (await text(audience, '#faceHead')).includes(names[W]));
  await presenter.reload();
  await unlock(presenter);
  check('إعادة تحميل المقدّم: تعود المباراة من حيث توقفت', (await text(presenter, '#steps li.now')).includes('المواجهة') && (await presenter.$$('#plan li')).length === 6);

  // 6. تعديل الرصيد
  await presenter.click('#openScores');
  await presenter.click('[data-team="1"][data-d="1"]');
  await presenter.click('[data-team="1"][data-d="1"]');
  await presenter.click('[data-team="2"][data-d="-1"]');
  await wait(200);
  check('الرصيد: +2 للأول، والثاني لا ينزل تحت الصفر', (await text(presenter, '#sv1')) === '2' && (await text(presenter, '#sv2')) === '0' && (await text(audience, '#s1')) === '2');
  await presenter.click('#undoScore');
  await wait(200);
  check('الرصيد: التراجع يعيد 1', (await text(presenter, '#sv1')) === '1' && (await text(audience, '#s1')) === '1');
  await presenter.click('#closeScores');

  // 7. المباراة القصيرة، وأطول اسمين، وفحص التداخل في كل شاشة.
  presenter.on('dialog', d => d.accept());
  const shapes = [];
  const stageCheck = async label => {
    for (const [w, h] of [[1920, 1080], [1366, 768]]) {
      await audience.setViewportSize({ width: w, height: h });
      await wait(150);
      const r = await audience.evaluate(() => window.__stageCheck());
      shapes.push(`${label} ${w}: ${r.ok ? 'سليم' : r.problems.join('، ')}`);
      if (!r.ok) return false;
    }
    await audience.setViewportSize({ width: 1920, height: 1080 });
    return true;
  };
  const presenterCheck = async label => presenter.evaluate(label => {
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize), problems = [];
    for (const n of document.querySelectorAll('#app *')) {
      if (!n.getClientRects().length || getComputedStyle(n).visibility === 'hidden') continue;
      if ([...n.childNodes].some(c => c.nodeType === 3 && c.textContent.trim()) && parseFloat(getComputedStyle(n).fontSize) < rem - .01) problems.push('نص صغير: ' + n.textContent.trim().slice(0, 12));
      if (/[٠-٩۰-۹]/.test(n.textContent)) problems.push('أرقام هندية');
      if (n.tagName === 'BUTTON' && n.getBoundingClientRect().height < 2 * rem - .5) problems.push('زر قصير: ' + n.textContent.trim());
      if (getComputedStyle(n).fontStyle !== 'normal') problems.push('ميل');
    }
    if (document.documentElement.scrollHeight > innerHeight + 1) problems.push(`تمرير ${document.documentElement.scrollHeight}/${innerHeight}`);
    return { label, problems: [...new Set(problems)] };
  }, label);

  let allOk = true, presenterOk = true;
  const presenterIssues = [];
  for (const method of ['full', 'short']) {
    await presenter.click('#newMatch');
    await presenter.waitForSelector('[data-step="setup"]:not([hidden])');
    await presenter.fill('#t1', LONG[0]);
    await presenter.fill('#t2', LONG[1]);
    await presenter.click(`#method [data-m="${method}"]`);
    await wait(150);
    const steps = [['الانتظار', null]];
    for (const [label] of steps) allOk &&= await stageCheck(`${method}/${label}`);
    for (const vp of [[1366, 768], [1920, 1080]]) { await presenter.setViewportSize({ width: vp[0], height: vp[1] }); const r = await presenterCheck(`${method}/setup/${vp[0]}`); if (r.problems.length) presenterIssues.push(`${r.label}: ${r.problems}`); }
    await presenter.click('#toDraw');
    await presenter.waitForSelector('[data-step="draw"]:not([hidden])');
    await wait(150);
    allOk &&= await stageCheck(`${method}/القرعة`);
    await presenter.click('#drawBtn');
    await presenter.waitForSelector('#toPick:not([hidden])', { timeout: 5000 });
    await wait(300);
    allOk &&= await stageCheck(`${method}/نتيجة القرعة`);
    for (const vp of [[1366, 768], [1920, 1080]]) { await presenter.setViewportSize({ width: vp[0], height: vp[1] }); const r = await presenterCheck(`${method}/draw/${vp[0]}`); if (r.problems.length) presenterIssues.push(`${r.label}: ${r.problems}`); }
    await presenter.click('#toPick');
    const order = method === 'full' ? ['letter', 'last-two', 'auction'] : ['ranking', 'letter'];
    for (const id of order) {
      await wait(150);
      allOk &&= await stageCheck(`${method}/اختيار`);
      for (const vp of [[1366, 768], [1920, 1080]]) { await presenter.setViewportSize({ width: vp[0], height: vp[1] }); const r = await presenterCheck(`${method}/pick/${vp[0]}`); if (r.problems.length) presenterIssues.push(`${r.label}: ${r.problems}`); }
      await presenter.click(`#modes [data-mode="${id}"]`);
    }
    await wait(350);
    allOk &&= await stageCheck(`${method}/اكتمل`);
    if (method === 'short') check('القصيرة: «اكتمل اختيار الأنماط» وخانتان بإطار متقطّع', (await text(audience, '#pickHead')) === 'اكتمل اختيار الأنماط' && (await audience.$$('.tile.left')).length === 2);
    await presenter.click('#toFace');
    await wait(2700);
    allOk &&= await stageCheck(`${method}/المواجهة`);
    for (const vp of [[1366, 768], [1920, 1080]]) { await presenter.setViewportSize({ width: vp[0], height: vp[1] }); const r = await presenterCheck(`${method}/face/${vp[0]}`); if (r.problems.length) presenterIssues.push(`${r.label}: ${r.problems}`); }
    if (method === 'short') {
      const t = await audience.$$eval('#track .seg', s => s.map(x => [...x.children].map(c => c.textContent.trim()).join(' ')).join(' | '));
      check(`القصيرة: المسار (${t})`, t === 'الجولة 1 الترتيب | عجلة البونص | الجولة 2 الحرف المعيّن');
      await audience.screenshot({ path: `${shots}/s1-face-short-long.png` });
    }
    await presenter.click('#openScores');
    for (const vp of [[1366, 768]]) { await presenter.setViewportSize({ width: vp[0], height: vp[1] }); const r = await presenterCheck(`${method}/scores/${vp[0]}`); if (r.problems.length) presenterIssues.push(`${r.label}: ${r.problems}`); }
    await presenter.click('#closeScores');
  }
  check(`فحص التداخل في كل شاشات الجمهور بأطول اسمين، بالطريقتين، على 1920 و1366 (${shapes.length} حالة)`, allOk);
  if (!allOk) console.log(shapes.filter(s => !s.endsWith('سليم')).join('\n'));
  check(`نافذة المقدّم: لا نص أصغر من 32 ولا زر أقصر من 64 ولا أرقام هندية ولا تمرير، على 1366 و1920${presenterIssues.length ? ' · ' + presenterIssues.join(' · ') : ''}`, !presenterIssues.length);
  await presenter.setViewportSize({ width: 1366, height: 768 });
  await presenter.screenshot({ path: `${shots}/s1-presenter-face.png` });

  // 8. مباراة جديدة: تعود إلى الإعداد بالحزمة والطريقة، والرصيد صفر.
  await presenter.click('#newMatch');
  await wait(200);
  const fresh = await presenter.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')));
  check('مباراة جديدة: الإعداد فارغاً والرصيد صفر', fresh.step === 'setup' && !fresh.teams[1] && fresh.scores[1] === 0 && !fresh.picks.length);
  check('الجمهور يعود إلى شاشة الانتظار', (await text(audience, '#n1')) === 'الفريق الأول' && await visible(audience, '.scr.title'));

  // 9. النافذة الواحدة: الإعداد صفحة المقدّم، وما بعده اللوحة والشريط.
  await audience.close();
  await wait(4500);
  await presenter.setViewportSize({ width: 1440, height: 900 });
  await presenter.fill('#t1', 'الصقور');
  await presenter.fill('#t2', 'النجوم');
  await presenter.click('#method [data-m="full"]');
  await presenter.click('#singleBtn');
  check('النافذة الواحدة: الإعداد يبقى صفحة المقدّم', !(await visible(presenter, '#single')) && await visible(presenter, '[data-step="setup"]'));
  await presenter.click('#toDraw');
  await presenter.waitForSelector('#single:not([hidden]) iframe');
  const frame = await (await presenter.$('#single iframe')).contentFrame();
  await frame.waitForSelector('.scr.show[data-s="spin"], .scr.show[data-s="result"]', { timeout: 6000 });
  check('النافذة الواحدة: «إلى القرعة» يبدأ القرعة فوراً، والشريط «القرعة جارية…»', (await text(presenter, '#band')).includes('القرعة جارية…'));
  const box = await presenter.evaluate(() => { const f = document.getElementById('frame').getBoundingClientRect(); return { w: f.width, h: f.height, vw: innerWidth, vh: innerHeight }; });
  check(`الإطار 1920×1216 يُصغَّر معاً ويتسع للنافذة (${Math.round(box.w)}×${Math.round(box.h)})`, Math.abs(box.w / box.h - 1920 / 1216) < .01 && box.w <= box.vw + 1 && box.h <= box.vh + 1);
  await presenter.waitForSelector('#band [data-do="toPick"]', { timeout: 5000 });
  await presenter.click('#band [data-do="toPick"]');
  await wait(200);
  const bandModes = await presenter.$$eval('#band [data-mode]', b => b.map(x => x.textContent).join('،'));
  check(`الشريط: زر لكل نمط متاح + «تراجع» (${bandModes})`, bandModes === 'الحرف المعيّن،آخر حرفين،المزاد،الترتيب' && (await text(presenter, '#band')).includes('تراجع'));
  const fits = await presenter.evaluate(() => { const b = document.getElementById('band'); return b.scrollWidth <= b.clientWidth + 1; });
  check('الشريط: الأزرار داخل عرضه', fits);
  await presenter.screenshot({ path: `${shots}/s1-single-pick.png` });
  for (const id of ['letter', 'last-two', 'auction']) await presenter.click(`#band [data-mode="${id}"]`);
  await wait(200);
  check('الشريط بعد الاكتمال: «تراجع» و«إلى المواجهة»', (await text(presenter, '#band')).includes('إلى المواجهة'));
  check('النافذة الواحدة: لوحة الجمهور تتبع الاختيار', (await frame.textContent('#pickHead')).includes('الترتيب'));
  await presenter.click('#band [data-do="toFace"]');
  await frame.waitForSelector('.scr.show[data-s="face"]');
  check('الشريط في المواجهة: «أعد عرض المواجهة» و«ابدأ الجولة 1»', (await text(presenter, '#band')).includes('أعد عرض المواجهة'));
  const bandText = await text(presenter, '#band');
  check('الشريط لا يعرض شيئاً سوى أزرار الانتقال', /^نافذة واحدة/.test(bandText) && (await presenter.$$('#band > :not(button)')).length === 0);
  await wait(2600);
  await presenter.screenshot({ path: `${shots}/s1-single-face.png` });
  await presenter.click('#leaveSingle');
  check('الخروج من النافذة الواحدة يعيد صفحة المقدّم', !(await visible(presenter, '#single')) && await visible(presenter, '[data-step="face"]'));

  // 10. الرقم السري يتغيّر قبل مباراة جديدة: «إلى القرعة» يُغلق اللعبة.
  await presenter.click('#newMatch');
  await presenter.fill('#t1', 'أ');
  await presenter.fill('#t2', 'ب');
  await usePin(context, testPinRecord('246801'));
  await presenter.click('#toDraw');
  await presenter.waitForSelector('#gate:not([hidden])', { timeout: 5000 });
  check('تغيّر الرقم: «إلى القرعة» يُغلق اللعبة ويطلب الجديد', (await text(presenter, '#pin-error')).includes('تغيّر الرقم السري'));

  const ok = finish(errors);
  await browser.close();
  process.exit(ok && !errors.length ? 0 : 1);
})();
