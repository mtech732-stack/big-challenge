// اختبار آلي لجولة «الحرف المعيّن» بالنافذتين وبالنافذة الواحدة (الوثيقة 1.1): الافتتاح، والسؤال والعدّاد، والحكم والنقاط،
// وانتقال الإجابة للخصم (بعد الخطأ وبعد انتهاء الوقت) دون كلمة «سرقة»، والإجابة واسم الفريق بعد كل سؤال، والتراجع،
// والنهاية وما بعدها، والحفظ بعد إعادة التحميل، وأزرار الشاشة المشتركة بجانب العدّاد وفي الزاويتين،
// ولا إجابة على شاشة الجمهور قبل الحكم الأخير، وفحص التداخل والقياسات في كل حالة.
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace, beginTwo, passWheel, passWheelOne } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { check, finish } = reporter();
  const errors = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const LONG = ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'];
  const FORBIDDEN = ['سرقة', 'سهل', 'متوسط', 'صعب', 'بفارق', 'يتقدّم', 'يتأخر', 'قصيرة', 'كاملة', 'الحزمة'];

  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  await usePin(context);
  context.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => m.type() === 'error' && !/content\/packs\/.+\.json/.test(m.location().url) && errors.push(m.text()));
  });
  const text = (page, sel) => page.textContent(sel).then(t => t.replace(/\s+/g, ' ').trim());
  const visible = (page, sel) => page.isVisible(sel);
  // لا عنصر ظاهر بهذا المحدِّد (isVisible يقرأ أول عنصر وحده، وإطار الفريق الأول أولاً).
  const none = (page, sel) => page.$$eval(sel, es => es.every(e => !e.getClientRects().length));

  // الشاشة المشتركة على التلفاز، ثم «ابدأ المباراة» يفتح نافذة المقدّم. والجولة 1 «الحرف المعيّن».
  let stage = await context.newPage();
  await stage.setViewportSize({ width: 1920, height: 1080 });
  await stage.goto(base);
  await stage.evaluate(() => localStorage.clear());
  await stage.reload();
  await unlock(stage);
  let audience = await stageFrame(stage);
  const match = () => (stage.isClosed() ? presenter : stage).evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')));
  // الفائز بالقرعة يختار أولاً: «الحرف المعيّن» للجولة 1.
  await sharedToFace(audience, { names: LONG, picks: ['letter', 'last-two'] });
  await wait(2700);
  let presenter = await beginTwo(context, audience);
  await audience.waitForSelector('.scr.show[data-s="intro"]', { timeout: 6000 });
  await presenter.waitForFunction(() => document.getElementById('status').dataset.on === 'true', null, { timeout: 6000 });

  // فحوص كل حالة: التداخل على شاشة الجمهور، وقياسات نافذة المقدّم، ولا إجابة قبل الحكم الأخير، ولا تفاصيل قواعد.
  let layoutOk = true, presenterOk = true, leak = false;
  const fails = [], words = [];
  // الملاحظة 27: أسوأ حالة لمربع الإعلان: اسم الثاني 18 حرفاً عريضاً ورصيده 188، وإجابة 20 حرفاً. المربع يضيق بعد لوحته بفراغ 24،
  // وحافته اليمنى 1794، والإجابة سطران داخله، والشارة لسان فوقه على 828–872. ثم يعود كل شيء، والحالة العادية بلا تغيير.
  const worstBox = async fr => {
    const normal = await fr.evaluate(() => { const b = document.getElementById('box'); return { l: b.offsetLeft, w: b.offsetWidth, wrap: b.classList.contains('wrap') }; });
    const r = await fr.evaluate(async () => {
      const $ = id => document.getElementById(id), keep = ['n2', 's2', 'answer'].map(id => $(id).textContent), three = $('s2').classList.contains('three');
      $('n2').textContent = 'مممممممممممممممممم'; $('s2').textContent = '188'; $('s2').classList.add('three'); $('answer').textContent = 'عبدالرحمن بن عوف رضي';
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      const b = $('box'), p2 = $('p2'), ln = $('reveal'), ch = $('verdict'), k = 1920 / document.getElementById('canvas').getBoundingClientRect().width;
      const R = e => { const r = e.getBoundingClientRect(), c = document.getElementById('canvas').getBoundingClientRect(); return { l: (r.left - c.left) * k, t: (r.top - c.top) * k, r: (r.right - c.left) * k, b: (r.bottom - c.top) * k }; };
      const out = { left: b.offsetLeft, right: b.offsetLeft + b.offsetWidth, gap: b.offsetLeft - 17 - (p2.offsetLeft + p2.offsetWidth + 17), wrap: b.classList.contains('wrap'),
        lines: Math.round(ln.getBoundingClientRect().height * k / 48), over: ln.scrollWidth > ln.clientWidth + 1, line: R(ln), box: R(b), chip: R(ch), check: (await window.__stageCheck()).problems };
      ['n2', 's2', 'answer'].forEach((id, i) => { $(id).textContent = keep[i]; }); $('s2').classList.toggle('three', three);
      await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
      out.back = { l: b.offsetLeft, w: b.offsetWidth, wrap: b.classList.contains('wrap') };
      return out;
    });
    const ok = r.right === 1794 && r.gap >= 24 && r.wrap && r.lines === 2 && !r.over && r.line.l >= r.box.l + 24 && r.line.r <= r.box.r - 24 && r.line.t >= r.box.t && r.line.b <= r.box.b
      && Math.round(r.chip.t) === 828 && Math.round(r.chip.b) === 872 && !r.check.length && r.back.l === normal.l && r.back.w === normal.w && r.back.wrap === normal.wrap;
    return { ok, txt: `المربع ${r.left}–${r.right}، فراغ ${r.gap}، سطران ${r.lines}، الشارة ${Math.round(r.chip.t)}–${Math.round(r.chip.b)}${r.check.length ? '، ' + r.check.join('، ') : ''}`, normal };
  };
  const audienceCheck = async (page, label) => {
    const r = await page.evaluate(() => window.__stageCheck());
    if (!r.ok) { layoutOk = false; fails.push(`${label}: ${r.problems.join('، ')}`); }
    const shown = await page.evaluate(() => document.body.innerText);
    const f = FORBIDDEN.filter(w => shown.includes(w));
    if (f.length) words.push(`${label}: ${f.join('، ')}`);
    // إجابة السؤال المعروض وبدائلها، في نص الشاشة كله دون السؤال نفسه واسمَي الفريقين
    // (فـ«ذهب» جزء من «فريق النخبة الذهبي» وليست تسريباً). وبعد الحكم الأخير تظهر الإجابة النموذجية وحدها في سطرها.
    const round = (await match()).round;
    const q = round?.state.questions[round.state.index];
    if (!q || round.state.phase === 'intro' || round.state.phase === 'end') return;
    const decided = round.state.phase === 'decided';
    const body = await page.evaluate(names => {
      let t = document.body.innerText.replace(document.getElementById('label').textContent, '');
      const rev = document.getElementById('reveal');
      if (rev.getClientRects().length) t = t.replace(rev.innerText, '');
      for (const n of names) t = t.split(n).join('');
      return t;
    }, LONG);
    if ([q.answer, ...q.alts].some(a => body.includes(a))) { leak = true; fails.push(`${label}: إجابة على شاشة الجمهور («${q.answer}»)`); }
    const reveal = await page.isVisible('#reveal') ? await text(page, '#reveal') : '';
    if (decided ? reveal !== `الإجابة: ${q.answer}` : reveal) { leak = true; fails.push(`${label}: سطر الإجابة «${reveal}»`); }
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
      if (/سرقة|سهل|متوسط|صعب/.test(main.innerText)) problems.push('نص قواعد ممنوع');
      if (document.documentElement.scrollHeight > innerHeight + 1) problems.push(`الحالة أطول من النافذة (${document.documentElement.scrollHeight} من ${innerHeight})`);
      return { ok: !problems.length, problems: [...new Set(problems)] };
    });
    if (!r.ok) { presenterOk = false; fails.push(`المقدّم ${label}: ${r.problems.join('، ')}`); }
  };
  const both = async label => { await wait(900); await audienceCheck(audience, label); await presenterCheck(label); };

  // 1. الافتتاح
  const starter = (await match()).round.first;
  const other = t => (t === 1 ? 2 : 1);
  check('الجمهور: الافتتاح بالقاعدة وحدها، بلا سطر تفاصيل', (await text(audience, '#rule')) === 'أجب بكلمة تبدأ بالحرف المعيّن' && !(await audience.$('#ruleSub')));
  check('الجمهور: «يبدأ [الاسم]» والمؤشر حوله', (await text(audience, '#starter')) === `يبدأ ${LONG[starter - 1]}` && await audience.$eval(`#p${starter}`, e => e.classList.contains('on')));
  check('الجمهور: شارة النمط «الحرف المعيّن» و«الجولة 1 من 2»', (await text(audience, '#mode')) === 'الحرف المعيّن' && await visible(audience, '.badge.mode') && (await text(audience, '#b1')) === 'الجولة 1 من 2');
  check('الجمهور: قبل أول سؤال لا عدّاد ولا إطار وقت، والرقمان 0 بجوار الاسمين (1.3)', (await none(audience, '.team .cnt')) && (await none(audience, '.ring')) && (await text(audience, '#s1')) === '0' && await visible(audience, '#s1') && await visible(audience, '#s2'));
  check('الجمهور: لا أزرار على شاشة الجمهور بالنافذتين', !(await audience.$('.cbtn')));
  check('المقدّم: الافتتاح «يبدأ … (اختير عشوائياً)» و«اعرض السؤال 1»', (await text(presenter, '#introWho')).includes('(اختير عشوائياً)') && (await text(presenter, '#showQ')) === 'اعرض السؤال 1');
  check('المقدّم: سطر القاعدة «انتقلت الإجابة إلى خصمه»، لا «سرقة»', (await text(presenter, '#introBrief')).includes('انتقلت الإجابة إلى خصمه في 5 ثوانٍ'));
  check('المقدّم: الرأس بشارة «الجولة 1 من 2 · الحرف المعيّن» ومسار ستة أسئلة', (await text(presenter, '#roundChip')) === 'الجولة 1 من 2 · الحرف المعيّن' && (await presenter.$$('#pips .pip')).length === 6);
  await both('الافتتاح');
  await stage.screenshot({ path: `${shots}/s2-intro.png` });

  // 2. السؤال قبل «ابدأ»
  await presenter.click('#showQ');
  await audience.waitForSelector('.scr.show[data-s="q"]');
  await wait(200);
  const q1 = (await match()).round.state.questions;
  check('الجمهور: الحرف والسؤال', (await text(audience, '#letter')) === q1[0].box && (await text(audience, '#label')) === q1[0].prompt);
  check('الجمهور: العدّاد ثابت على 0:15 قبل «ابدأ»', (await text(audience, '#timer')) === '0:15' && (await wait(1200), (await text(audience, '#timer')) === '0:15'));
  check('الجمهور: «السؤال 1 من 6» وحدها، بلا مستوى', (await text(audience, '#b1')) === 'السؤال 1 من 6' && !(await visible(audience, '#b2')));
  check('الجمهور: الرقم الكبير بجوار الاسم ولا رقم عملاق في المنتصف ولا شريط فارق، والحدّ لصاحب الدور من ظهور السؤال، بلا إطار وقت قبل «ابدأ» (1.3، المالك 20:39)', await visible(audience, '#s1') && !(await audience.$('.giant')) && !(await audience.$('.strip'))
    && await audience.$eval('#canvas', (c, o) => c.classList.contains('turn-' + o) && !c.classList.contains('turn-' + (3 - o)) && !c.classList.contains('running'), starter) && (await none(audience, '.ring')));
  check('المقدّم: الإجابة النموذجية وسطر القبول، و«السؤال 1 من 6» بلا مستوى', (await text(presenter, '#qAnswer')) === q1[0].answer
    && (await text(presenter, '#qAccept')) === `وتُقبل أي كلمة أخرى تبدأ بـ «${q1[0].box}» وتنطبق على المطلوب.` && (await text(presenter, '#qMeta')) === 'السؤال 1 من 6');
  check('المقدّم: «لم يبدأ العدّاد»، و«ابدأ العدّاد» و«صحيحة · +1» و«خاطئة»', (await text(presenter, '#qState')) === 'لم يبدأ العدّاد' && await visible(presenter, '#startTimer') && (await text(presenter, '#yes')) === 'صحيحة · +1' && await visible(presenter, '#no'));
  await both('قبل ابدأ');
  await stage.screenshot({ path: `${shots}/s2-ready.png` });
  await presenter.screenshot({ path: `${shots}/s2-presenter-ready.png` });

  // 3. العدّاد يعدّ، ثم صحيحة: الإجابة واسم الفريق على الجمهور
  // بدء العدّاد لا يحرّك الحدّ: يظهر إطار الوقت وحده.
  const sweeps = () => audience.$eval('#edge', e => e.getAnimations().length);
  await audience.$eval('#edge', e => e.classList.remove('sweep'));
  await presenter.click('#startTimer');
  await wait(150);
  check('الجمهور: «ابدأ» لا يحرّك الحدّ، ويظهر إطار الوقت وحده (1.3)', (await sweeps()) === 0 && await visible(audience, '.team.on .ring'));
  await wait(1450);
  const t = await text(audience, '#timer');
  check(`الجمهور: العدّاد يعدّ (${t})`, t === '0:14' || t === '0:13');
  // 1.3: الحدّ يكتسح لصاحب الدور، وإطار الوقت حول لوحته يتآكل، والثواني فيها (design/system.md 15.2 و15.3).
  const live = await audience.evaluate(o => { const c = document.getElementById('canvas'), p = document.getElementById('p' + o), r = p.querySelector('.ring polygon');
    return { side: c.classList.contains('turn-' + o) && c.classList.contains('running'), ring: !!p.querySelector('.ring').getClientRects().length, drain: parseFloat(getComputedStyle(r).strokeDashoffset),
      cnt: p.querySelector('.cnt').textContent, other: !!document.querySelector(`#p${3 - o} .ring`).getClientRects().length }; }, starter);
  check(`الجمهور: الحدّ لصاحب الدور، وإطار الوقت حوله يتآكل (${live.drain.toFixed(1)}) والثواني فيه (${live.cnt}) (1.3)`, live.side && live.ring && !live.other && live.drain > 5 && live.drain < 30 && ['14', '13'].includes(live.cnt));
  check('المقدّم: «العدّاد يعدّ على الشاشة» ولا «ابدأ»', (await text(presenter, '#qState')) === 'العدّاد يعدّ على الشاشة' && !(await visible(presenter, '#startTimer')));
  await both('العدّاد يعدّ');
  await presenter.click('#yes');
  await wait(450);
  // لحظة الكسب: تبدأ بعد 250ms وتدوم 600ms، على الرقم الكبير نفسه (ملاحظة المعاين 22، و1.3).
  const gain = await audience.$eval(`#s${starter}`, g => g.classList.contains('gain') && g.getAnimations().length > 0 && getComputedStyle(g).animationName);
  check(`الجمهور: لحظة الكسب على الرقم الكبير للكاسب (${gain})`, gain === 'gain');
  await wait(450);
  check('الجمهور: الحكم «[اسم الفريق] · +1» بلون الفريق في مربع الإعلان، والعدّاد وإطاره اختفيا، والحدّ يقف على الكاسب وجهته ومضت', (await text(audience, '#vtext')) === `${LONG[starter - 1]} · +1` && await audience.$eval('#verdict', (e, s) => e.classList.contains('t' + s), starter)
    && await visible(audience, '#box #verdict') && (await none(audience, '.team .cnt')) && (await none(audience, '.ring'))
    && await audience.$eval('#canvas', (c, o) => c.classList.contains('turn-' + o) && !c.classList.contains('turn-' + (3 - o)) && c.querySelector('.stagebg .f' + o).classList.contains('blink'), starter));
  check('الجمهور: «الإجابة: …» تحت السؤال', (await text(audience, '#reveal')) === `الإجابة: ${q1[0].answer}`);
  check('الجمهور: الرصيد 1 في الرقم الكبير بجوار الاسم، ولا «يتقدّم بفارق»', (await text(audience, `#s${starter}`)) === '1' && !(await audience.$('#d1')));
  check('المقدّم: «صحيحة · +1 لـ…» و«السؤال التالي · 2 من 6»', (await text(presenter, '#qDone')) === `صحيحة · +1 لـ${LONG[starter - 1]}` && (await text(presenter, '#nextQ')) === 'السؤال التالي · 2 من 6');
  check('المقدّم: «مباراة جديدة» ظاهرة أثناء السؤال (ملاحظة المعاين 2)', await visible(presenter, '[data-part="q"] [data-new]'));
  check('المقدّم: المسار يمتلئ بلون الكاسب', await presenter.$eval('#pips .pip', (e, s) => e.classList.contains('won' + s), starter));
  await both('صحيحة');
  await stage.screenshot({ path: `${shots}/s2-right.png` });
  { const w = await worstBox(audience);
    check(`الجمهور: الحالة العادية: المربع 1135–1794 بسطر واحد (الملاحظة 27)`, w.normal.l === 1135 && w.normal.w === 659 && !w.normal.wrap);
    check(`الملاحظة 27 بنافذتين: أسوأ حالة لا تُدخل لوحة الثاني تحت المربع، ولا يفيض النص (${w.txt})`, w.ok); }

  // 4. السؤال 2 للخصم: خاطئة قبل «ابدأ» ← تنتقل الإجابة، ثم ينتهي وقتها ← لا نقاط، والإجابة تظهر
  await presenter.click('#nextQ');
  await wait(300);
  check('السؤال 2: الدور للفريق الآخر، وسطر الإجابة يختفي، والحدّ يكتسح له في القراءة', (await text(presenter, '#who')) === `دور ${LONG[other(starter) - 1]}` && await audience.$eval(`#p${other(starter)}`, e => e.classList.contains('on')) && !(await visible(audience, '#reveal'))
    && await audience.$eval('#canvas', (c, o) => c.classList.contains('turn-' + o), other(starter)));
  await presenter.click('#no');
  await wait(400);
  check('الجمهور: انتقلت الإجابة: المؤشر على الخصم، والعدّاد 0:05 يعدّ، ولا شارة', await audience.$eval(`#p${starter}`, e => e.classList.contains('on'))
    && ['0:05', '0:04'].includes(await text(audience, '#timer')) && !(await audience.$('#b4')));
  check('الجمهور: الحدّ يكتسح للخصم فوراً مع انتقال الإجابة (1.3)', await audience.$eval('#canvas', (c, o) => c.classList.contains('turn-' + o) && !c.classList.contains('turn-' + (3 - o)), starter));
  check('المقدّم: «دور …» و«انتقلت الإجابة بعد الخطأ · 5 ثوانٍ»', (await text(presenter, '#who')) === `دور ${LONG[starter - 1]}` && (await text(presenter, '#qState')) === 'انتقلت الإجابة بعد الخطأ · 5 ثوانٍ');
  await both('انتقال الإجابة');
  await stage.screenshot({ path: `${shots}/s2-steal.png` });
  await presenter.screenshot({ path: `${shots}/s2-presenter-steal.png` });
  // الملاحظة 28: يُنتظر ظهور حواف الخطر نفسها لا مدة ثابتة، فلا يسبقها الانقضاء إن أبطأت اللقطات.
  const danger = await audience.waitForFunction(() => document.getElementById('canvas').classList.contains('meta-danger'), null, { timeout: 5000, polling: 100 }).then(() => true, () => false);
  check('آخر 3 ثوانٍ: حواف الخطر', danger);
  await audience.waitForFunction(() => document.getElementById('vtext')?.textContent.trim() === 'لا نقاط', null, { timeout: 6000, polling: 100 }).catch(() => {});
  await wait(300);
  check('انتهى الوقت: «لا نقاط» والإجابة تحت السؤال، وحواف الخطر تختفي', (await text(audience, '#vtext')) === 'لا نقاط' && (await text(audience, '#reveal')) === `الإجابة: ${q1[1].answer}`
    && !(await audience.$eval('#canvas', e => e.classList.contains('meta-danger'))) && (await text(presenter, '#qDone')) === 'لا نقاط في هذا السؤال.');
  check('لا نقاط: الحدّ يعود إلى المنتصف (1.3)', await audience.$eval('#canvas', c => !c.classList.contains('turn-1') && !c.classList.contains('turn-2')));
  check('المسار: السؤال 2 بلا نقاط', await presenter.$eval('#pips .pip:nth-child(2)', e => e.classList.contains('none')));
  await both('لا نقاط');
  await stage.screenshot({ path: `${shots}/s2-none.png` });

  // 5. السؤال 3: ينتهي الوقت ← تنتقل الإجابة، ثم صحيحة من الخصم بالنقاط نفسها (2)، ثم التراجع عنها وإعادتها
  await presenter.click('#nextQ');
  await presenter.click('#startTimer');
  await presenter.waitForFunction(() => document.getElementById('qState').textContent.includes('بعد انتهاء الوقت'), null, { timeout: 18000 });
  // السؤال 3 لصاحب البداية، فتنتقل الإجابة إلى الآخر.
  const thief = other(q1[2].owner);
  check('انتهى الوقت: «دور [الخصم]» و«انتقلت الإجابة بعد انتهاء الوقت · 5 ثوانٍ»', (await text(presenter, '#who')) === `دور ${LONG[thief - 1]}` && (await text(presenter, '#qState')) === 'انتقلت الإجابة بعد انتهاء الوقت · 5 ثوانٍ');
  await wait(1200);
  await presenter.click('#yes');
  await wait(450);
  // الكسب بعد تبادل الصدارة: رقم الخصم العملاق عليه «lose» من السؤال 1، فتُزال قبل «gain» ولا تغلبها (ملاحظة المعاين 22).
  const regain = await audience.$eval(`#s${thief}`, g => [...g.classList].filter(c => ['gain', 'lead', 'lose'].includes(c)).join(' ') + ' · ' + getComputedStyle(g).animationName);
  check(`الجمهور: لحظة الكسب للمتأخر بعد أن تخلّف (${regain})`, regain === 'gain · gain');
  await wait(150);
  check('صحيحة بعد الانتقال: «[اسم الخصم] · +2» بلونه، ورصيده 2', (await text(audience, '#vtext')) === `${LONG[thief - 1]} · +2` && await audience.$eval('#verdict', (e, s) => e.classList.contains('t' + s), thief) && (await text(audience, `#s${thief}`)) === '2');
  await presenter.click('#undo');
  await wait(400);
  check('التراجع: تعود الإجابة للخصم، والرصيد كما كان، وعدّاده من 0:05 من جديد، والسطر يختفي', (await text(presenter, '#qState')).startsWith('انتقلت الإجابة') && (await text(audience, `#s${thief}`)) === '0'
    && ['0:05', '0:04'].includes(await text(audience, '#timer')) && !(await visible(audience, '#reveal')));
  await presenter.click('#yes');
  await wait(300);

  // 6. إعادة تحميل النافذتين أثناء الجولة
  await presenter.click('#nextQ');
  await presenter.click('#startTimer');
  await wait(2600);
  const was = (await match()).round.timer;
  await stage.reload();
  audience = await stageFrame(stage);
  await audience.waitForSelector('.scr.show[data-s="q"]', { timeout: 6000 });
  await wait(500);
  // بالزمن الفعلي لا بقيمة ثابتة: إعادة التحميل عبر الشبكة قد تطول (تقرير المدقّق). العدّاد نفسه (id وat) لم يُبدأ من جديد،
  // والمعروض = ما بقي منه بساعة الصفحة الآن مقرَّباً إلى الأعلى كما يعرضه العدّاد (بفارق ثانية لما بين القراءتين)، ولم يقف.
  const rt = await stage.evaluate(() => ({ now: Date.now(), timer: JSON.parse(localStorage.getItem('big-challenge.match')).round.timer }));
  const tr = await text(audience, '#timer');
  const shown = +tr.split(':')[1] + 60 * +tr.split(':')[0], due = rt.timer.seconds - (rt.now - rt.timer.at) / 1000;
  check(`إعادة تحميل شاشة الجمهور أثناء العدّاد: بلا رقم، ويكمل من حيث كان (${tr}، المتوقع ${due.toFixed(1)})`, !(await visible(stage, '#pin')) && rt.timer.id === was.id && rt.timer.at === was.at
    && due > 0 && Math.abs(shown - Math.ceil(due)) <= 1 && shown < was.seconds && (await text(audience, '#b1')) === 'السؤال 4 من 6');
  await presenter.reload();
  await presenter.waitForSelector('#app:not([hidden])', { timeout: 10000 });
  await wait(400);
  check('إعادة تحميل المقدّم: بلا رقم، والجولة كما هي (السؤال 4)', (await text(presenter, '#qMeta')) === 'السؤال 4 من 6' && (await text(presenter, '#qState')) === 'العدّاد يعدّ على الشاشة');
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
  for (let i = 0; i < 2; i++) { await wait(750); await presenter.click('#nextQ'); await wait(750); await presenter.click('#yes'); }
  await wait(750);
  check('بعد السادس: «إنهاء الجولة»', (await text(presenter, '#nextQ')) === 'إنهاء الجولة');
  await both('أطول صف');
  await presenter.click('#nextQ');
  await audience.waitForSelector('.scr.show[data-s="end"]');
  await wait(300);
  const totals = (await match()).round.scores;
  check('الجمهور: «انتهت الجولة 1» وحصيلة كل فريق و«التالي: شريط البونص» في مربع الإعلان', (await text(audience, '#b1')) === 'انتهت الجولة 1' && (await text(audience, '#next')) === 'التالي: شريط البونص' && await visible(audience, '#box #next')
    && (await text(audience, '#r1')) === `+${totals[1]}` && (await text(audience, '#r2')) === `+${totals[2]}`);
  check('الجمهور: لا مؤشر دور ولا عدّاد ولا حكم في النهاية', !(await audience.$('.team.on')) && (await none(audience, '.team .cnt')) && !(await visible(audience, '#verdict')));
  check('المقدّم: الحصيلة والرصيد، و«شريط البونص» بلا «تخطَّ» ولا موعد (اكتملت ش6)', (await text(presenter, '#sum')).includes(`الرصيد ${totals[1]}`) && (await text(presenter, '#endNext')) === 'شريط البونص' && await presenter.$eval('#endHint', e => e.hidden));
  await both('النهاية');
  await presenter.screenshot({ path: `${shots}/s2-presenter-end.png` });
  // «التالي» نص أبيض على الطرف بلا مربع (15.4 و15.12، قرار المصمّم في PR #92).
  check('الجمهور: «التالي» في النهاية نص أبيض بلا مربع، في موضع المربع (15.4)', await audience.$eval('#box', b => b.classList.contains('bare') && !b.querySelector(':scope > i').getClientRects().length
    && getComputedStyle(b.querySelector('#next')).color === 'rgb(255, 255, 255)' && b.offsetLeft === 1135 && b.offsetTop === 880));
  await wait(900);
  await stage.screenshot({ path: `${shots}/s2-end.png` });
  await passWheel(presenter);
  check('بعد شريط البونص: «ابدأ الجولة 2» (آخر حرفين)', (await text(presenter, '#endNext')) === 'ابدأ الجولة 2' && !(await presenter.isDisabled('#endNext')));

  // 9. مباراة جديدة من نافذة المقدّم: تعود إلى الشاشة المشتركة. وذاكرة الأسئلة: لا تُعاد أسئلة الأولى.
  const firstIds = q1.map(q => q.id);
  presenter.once('dialog', d => d.accept());
  const gone = presenter.waitForEvent('close', { timeout: 6000 }).then(() => true, () => false);
  await presenter.click('[data-part="end"] [data-new]');
  check('مباراة جديدة: تُغلق نافذة المقدّم', await gone);
  await audience.waitForSelector('[data-cmd="draw"]', { timeout: 6000 });
  await sharedToFace(audience, { names: LONG, picks: ['letter', 'last-two'] });
  await wait(2700);
  presenter = await beginTwo(context, audience);
  await audience.waitForSelector('.scr.show[data-s="intro"]', { timeout: 6000 });
  check('المباراة الثانية: «الجولة 1 من 2» على الجمهور', (await text(audience, '#b1')) === 'الجولة 1 من 2');
  const q2 = (await match()).round.state.questions.map(q => q.id);
  const fresh = q2.filter(id => !firstIds.includes(id)).length;
  check(`ذاكرة الأسئلة: أسئلة المباراة الثانية جديدة (${fresh} من 6)`, fresh === 6);

  // 10. النقرة المزدوجة أو المتأخرة (تقرير المعاين ش2، التعثّر 1): تساوي نقرة واحدة، ولا تقع على الزر الذي يحلّ مكانها.
  await presenter.waitForFunction(() => document.getElementById('status').dataset.on === 'true', null, { timeout: 6000 });
  const st = async () => (await match()).round.state;
  await presenter.click('#showQ');
  await wait(800);
  await presenter.click('#yes');
  await wait(800);
  await presenter.dblclick('#nextQ');
  await wait(800);
  let s1 = await st();
  check('نقرتان على «السؤال التالي»: السؤال التالي قبل «ابدأ»، لا انتقال للخصم', s1.index === 1 && s1.phase === 'ready');
  await presenter.dblclick('#startTimer');
  await wait(800);
  s1 = await st();
  check('نقرتان على «ابدأ العدّاد»: يبدأ العدّاد، ولا «صحيحة»', s1.phase === 'ask' && s1.results[1] === null);
  check('«ابدأ العدّاد» يُخفى ويبقى مكانه، فلا يتمدد «صحيحة» تحته', await presenter.$eval('#startTimer', e => getComputedStyle(e).visibility === 'hidden' && e.getBoundingClientRect().width > 0));
  await presenter.dblclick('#no');
  await wait(100);
  check('أزرار الجولة معطّلة لحظةً بعد التغيّر', await presenter.$eval('#yes', e => e.classList.contains('held')));
  await presenter.evaluate(() => document.getElementById('yes').click());
  await wait(800);
  s1 = await st();
  check('نقرتان على «خاطئة»: تبقى الإجابة عند الخصم، و«صحيحة» في أول نصف ثانية لا تُحسب', s1.phase === 'steal' && s1.results[1] === null);
  check('بعد 0.7 ثانية: الأزرار تعود', !(await presenter.$eval('#yes', e => e.classList.contains('held'))));
  await presenter.click('#yes');
  await wait(800);
  await presenter.dblclick('#undo');
  await wait(800);
  s1 = await st();
  check('نقرتان على «تراجع عن آخر حكم»: تراجع واحد', s1.phase === 'steal');

  // 11. انقطاع شاشة الجمهور أثناء الجولة: زرّان مكان المسار
  await stage.close();
  await presenter.waitForFunction(() => !document.getElementById('lost').hidden, null, { timeout: 6000 });
  check('الانقطاع: «افتح نافذة الجمهور» و«نافذة واحدة» مكان المسار', await visible(presenter, '#lostOpen') && !(await visible(presenter, '#pips')));
  await presenterCheck('منقطعة');

  // 12. النافذة الواحدة: الشاشة المشتركة بأزرارها بجانب العدّاد وفي الزاويتين، ولا شريط ولا إجابة في الأزرار
  await presenter.setViewportSize({ width: 1920, height: 1080 });
  await presenter.click('#lostSingle');
  const frame = await stageFrame(presenter);
  const near = () => frame.$$eval('#near .cbtn', b => b.map(x => x.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
  const corners = () => frame.$$eval('.ctl-corner .cbtn', b => b.map(x => x.textContent.trim()).join(' | '));
  const rowsText = () => frame.$$eval('.ctl-corner:not(.opts)', r => r.map(x => [...x.querySelectorAll('.cbtn')].map(b => b.textContent.trim()).join(' | ')).join(' // '));
  await wait(300);
  // الملاحظة 28: عدّاد السرقة 5 ثوانٍ، وقد ينقضي أثناء الانقطاع وفتح النافذة الواحدة (على الرابط المنشور أبطأ).
  // فتبدأ السرقة من جديد هنا بعدّادها كاملاً: من السرقة «تراجع» ثم «خاطئة»، ومن حكم انقضائها «تراجع» يعيدها كاملة.
  // وما حدث يُطبع صراحةً في سطر فحص، فلا يمرّ بصمت.
  const stealLog = [];
  const freshSteal = async label => {
    const phase = (await st()).phase;
    if (phase === 'steal') { await cmd(frame, 'undo'); await wait(800); await cmd(frame, 'act:wrong'); }
    else { await cmd(frame, 'undo'); }
    await wait(500);
    stealLog.push(`${label}: كانت ${phase === 'steal' ? 'السرقة جارية' : `انقضت (${phase})`}، ثم ${(await st()).phase}`);
  };
  await freshSteal('قبل الخطوة 12');
  check('لا شريط سفلي', !(await presenter.$('#band')));
  check('بجانب العدّاد بعد انتقال الإجابة: «صحيحة · +1» «خاطئة»', (await near()) === 'صحيحة · +1 | خاطئة');
  check('الزاوية ثلاثة صفوف (الملاحظة 26): «تراجع» «الصوت» · «المقدّم» «ملء الشاشة» · «الرصيد» «مباراة جديدة»', (await rowsText()) === 'تراجع | الصوت // المقدّم | ملء الشاشة // الرصيد | مباراة جديدة'
    && JSON.stringify(await frame.$$eval('.ctl-corner:not(.opts)', e => e.map(x => x.offsetTop))) === '[64,152,240]');
  const coverFails = [];
  // الملاحظة 25: كل زر ظاهر هو ما يستجيب في خمس نقاط منه (elementFromPoint)، بالاسمين الطويلين وبرقم من خانة وخانتين وثلاث للفريقين.
  const covered = async label => {
    for (const v of ['7', '10', '188']) {
      const bad = await frame.evaluate(v => {
        for (const k of [1, 2]) { const s = document.getElementById('s' + k); s.textContent = v; s.classList.toggle('three', v.length >= 3); }
        const out = [];
        for (const b of document.querySelectorAll('#near .cbtn, .ctl-corner .cbtn, .card .scr.show .cbtn')) {
          if (!b.getClientRects().length) continue;
          const r = b.getBoundingClientRect();
          const pts = [[.5, .5], [.1, .15], [.9, .15], [.1, .85], [.9, .85]].map(([x, y]) => [r.left + r.width * x, r.top + r.height * y]);
          const n = pts.filter(([x, y]) => document.elementFromPoint(x, y)?.closest('button') !== b).length;
          if (n) out.push(`«${b.textContent.trim()}» ${n}/5`);
        }
        return out;
      }, v);
      if (bad.length) { coverFails.push(`${label} بـ ${v}: ${bad.join('، ')}`); }
      // أسوأ حالة (الملاحظة 26): الدور للأول والعدّاد يعمل، بالاسم الطويل والرقم: لا تداخل ولا فراغ أقل من 24.
      if (label === 'العدّاد يعدّ') {
        const r = await frame.evaluate(async () => {
          const p1 = document.getElementById('p1'), p2 = document.getElementById('p2'), was = p2.classList.contains('on');
          p1.classList.add('on'); p2.classList.remove('on'); document.getElementById('c1').textContent = '15';
          const out = await window.__stageCheck();
          p1.classList.toggle('on', !was); p2.classList.toggle('on', was);
          return out.problems;
        });
        if (r.length) coverFails.push(`أسوأ حالة بـ ${v}: ${r.join('، ')}`);
      }
    }
  };
  const qs = (await st()).questions[1];
  check('الأزرار لا تعرض الإجابة', !(await near()).includes(qs.answer) && !(await corners()).includes(qs.answer));
  await audienceCheck(frame, 'نافذة واحدة · انتقال الإجابة');
  await presenter.screenshot({ path: `${shots}/s2-single-steal.png` });
  // إن انقضى العدّاد أثناء الفحوص أعلاه، تُعاد السرقة مرة واحدة ويُسجَّل ذلك.
  if ((await st()).phase !== 'steal') await freshSteal('قبل «صحيحة»');
  check(`الملاحظة 28: السرقة بعدّادها كاملاً في النافذة الواحدة (${stealLog.join(' · ')})`, (await st()).phase === 'steal' && stealLog.length <= 2);
  await cmd(frame, 'act:correct');
  await wait(800);
  check('النافذة الواحدة: بعد الحكم «السؤال التالي» بجانب الحكم، والإجابة والاسم على الشاشة', (await near()) === 'السؤال التالي' && (await text(frame, '#reveal')) === `الإجابة: ${qs.answer}`
    && LONG.some(n => n === LONG[0] || n === LONG[1]) && (await text(frame, '#vtext')).startsWith(LONG[qs.owner === 1 ? 1 : 0]));
  await audienceCheck(frame, 'نافذة واحدة · بعد الحكم');
  await presenter.screenshot({ path: `${shots}/s2-single-decided.png` });
  { const w = await worstBox(frame); check(`الملاحظة 27 بنافذة واحدة: أسوأ حالة بلا تداخل ولا فيض (${w.txt})`, w.ok); }
  await cmd(frame, 'act:next');
  await wait(800);
  check('السؤال 3: «ابدأ» «صحيحة · +2» «خاطئة» بجانب العدّاد', (await near()) === 'ابدأ | صحيحة · +2 | خاطئة');
  await audienceCheck(frame, 'نافذة واحدة · قبل ابدأ');
  await covered('قبل ابدأ');
  await presenter.screenshot({ path: `${shots}/s2-single-ready.png` });
  await cmd(frame, 'act:start');
  await wait(1300);
  check('النافذة الواحدة: العدّاد يعدّ، و«ابدأ» يختفي', ['0:14', '0:13'].includes(await text(frame, '#timer')) && (await near()) === 'صحيحة · +2 | خاطئة');
  await audienceCheck(frame, 'نافذة واحدة · العدّاد يعدّ');
  await covered('العدّاد يعدّ');
  check(`النافذة الواحدة: لا يغطي شيءٌ أزرار التحكم بالاسمين الطويلين وأرقام من 1 و2 و3 خانات (الملاحظة 25)، ولا تداخل في أسوأ حالة وقت عدّاد الأول (الملاحظة 26)${coverFails.length ? ': ' + coverFails.slice(0, 3).join(' | ') : ''}`, !coverFails.length);
  await frame.click('#s1');
  const opened = await presenter.waitForSelector('#scores:not([hidden])', { timeout: 3000 }).then(() => true, () => false);
  check('النقر على رقم الفريق يفتح طبقة الرصيد فوق الشاشة', opened && await presenter.evaluate(() => {
    const r = document.getElementById('scores').getBoundingClientRect();
    return document.elementFromPoint(r.left + r.width / 2, r.top + 10)?.closest('#scores') !== null;
  }));
  await presenter.click('#closeScores');

  check(`فحص التداخل على شاشة الجمهور في كل حالة${fails.length ? ': ' + fails.slice(0, 3).join(' | ') : ''}`, layoutOk);
  check('نافذة المقدّم: لا نص أصغر من 32، ولا زر أقصر من 64، ولا تمرير، ولا أرقام هندية، ولا ميل، ولا نص قواعد', presenterOk);
  check('لا إجابة على شاشة الجمهور قبل الحكم الأخير، وبعده الإجابة النموذجية في سطرها', !leak);
  check(`لا «سرقة» ولا مستوى ولا فارق على شاشة الجمهور${words.length ? ': ' + words.slice(0, 3).join(' | ') : ''}`, !words.length);
  check(`لا أخطاء في الصفحتين${errors.length ? ': ' + errors.slice(0, 3).join(' | ') : ''}`, !errors.length);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})();
