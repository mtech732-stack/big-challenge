// اختبار آلي لتطبيق هيكل التصميم على شاشة الجمهور والصفحة: فحص التداخل (كما في design/main.html)،
// وأطول محتوى، والخط المرفق دون إنترنت، وأصغر نص في شاشة الرقم، وحواف الخطر.
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { check, finish } = reporter();
  const errors = [];
  const external = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));

  const context = await browser.newContext();
  await usePin(context);
  context.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => m.type() === 'error' && !/content\/packs\//.test(m.location().url) && errors.push(m.text()));
    p.on('request', r => { if (!r.url().startsWith(base)) external.push(r.url()); });
  });

  // 1. فحص التداخل على شاشة الجمهور بالمقاسين، بالمحتوى الحالي وبأطول محتوى.
  const audience = await context.newPage();
  const longest = async () => audience.evaluate(async () => {
    const set = (id, v) => { document.getElementById(id).textContent = v; };
    set('n1', 'فريق النخبة الذهبي'); set('n2', 'نجوم المستقبل معاً');
    set('s1', '188'); set('s2', '176');
    // 1.3: الرقمان بثلاث خانات (236)، والثواني في اللوحتين معاً، أضيق ما يكون (design/system.md 15.5).
    for (const k of [1, 2]) { document.getElementById('s' + k).classList.add('three'); document.getElementById('p' + k).classList.add('on'); set('c' + k, '15'); }
    document.getElementById('canvas').classList.add('running');
    set('letter', 'ـوت');
    set('label', 'بيت لا يُبنى بطين ولا حجر، ووصفه القرآن بأنه أوهن البيوت، وتراه في زوايا البيوت القد');
    const { checkLayout } = await import('./js/layout-check.js');
    return checkLayout(document.getElementById('canvas'), document.querySelector('.check-layer'));
  });
  for (const [w, h] of [[1920, 1080], [1366, 768]]) {
    await audience.setViewportSize({ width: w, height: h });
    await audience.goto(base + 'audience.html?check');
    await audience.waitForFunction(() => window.__check, null, { timeout: 10000 });
    const r = await audience.evaluate(() => window.__check);
    check(`الجمهور ${w}×${h}: لا تداخل ولا خروج عن الهامش (${r.count} عناصر، أدنى فراغ ${Math.round(r.minGap)})`, r.ok && r.count === 5);
    if (!r.ok) console.log(r.problems.join('\n'));
    if (w === 1920) await audience.screenshot({ path: `${shots}/skeleton-audience.png` });
    const l = await longest();
    check(`الجمهور ${w}×${h} بأطول محتوى (اسمان 18، أرقام 3 خانات، سؤال 85 مع «ـوت»): سليم في ${l.lines} أسطر`, l.ok && l.lines === 3);
    if (!l.ok) console.log(l.problems.join('\n'));
    if (w === 1920) await audience.screenshot({ path: `${shots}/skeleton-audience-longest.png` });
  }

  // 2. الخط المرفق: محمّل من الموقع نفسه، ولا طلب خارجي.
  const fontOk = await audience.evaluate(() => document.fonts.check('700 64px Kufi') && [...document.fonts].some(f => f.family === 'Kufi' && f.status === 'loaded'));
  check('خط Noto Kufi المرفق محمّل', fontOk);
  check('لا طلبات إلى مواقع خارجية', external.length === 0);

  // 3. الصفحة قبل الدخول (شاشة الرقم): أصغر نص 32 على أساس عرض 1920، ولا زوايا مستديرة.
  // وبعد الدخول لا نافذة مقدّم (الوثيقة 1.13): الصفحة كلها شاشة الجمهور بأزرارها، وفحصها في الأقسام بعده.
  const presenter = await context.newPage();
  await presenter.setViewportSize({ width: 1920, height: 1080 });
  const smallest = () => presenter.evaluate(() => Math.min(...[...document.querySelectorAll('body *')]
    .filter(n => n.getClientRects().length && [...n.childNodes].some(c => c.nodeType === 3 && c.textContent.trim()))
    .map(n => parseFloat(getComputedStyle(n).fontSize))));
  await presenter.goto(base);
  await presenter.evaluate(() => document.fonts.ready);
  check(`شاشة الرقم: أصغر نص ${await smallest()}`, (await smallest()) >= 32);
  const radius = await presenter.$$eval('button, #pin', els => els.every(e => getComputedStyle(e).borderRadius === '0px'));
  check('لا زوايا مستديرة في شاشة الرقم', radius);
  await presenter.screenshot({ path: `${shots}/skeleton-gate.png` });

  // 4. شاشة الجمهور خارج الصفحة (رابط audience.html وحده): لا صفحة تضمّها، فتبقى بانتظار المقدّم
  // بالشعار الكبير وسطره وحدهما (design/logo/الدمج.md 1.2). وفي الصفحة بعد الرقم شاشة البداية.
  await audience.setViewportSize({ width: 1920, height: 1080 });
  const live = await context.newPage();
  await live.setViewportSize({ width: 1920, height: 1080 });
  await live.goto(base + 'audience.html');
  await wait(300);
  check('بانتظار المقدّم: الهيكل مخفي، والشعار الكبير و«بانتظار المقدّم» وحدهما', await live.isHidden('.team.t1') && await live.isHidden('.logo') && await live.isHidden('.card')
    && await live.isVisible('.hero .hlogo') && (await live.textContent('#heroCap')) === 'بانتظار المقدّم');
  await live.close();
  await presenter.evaluate(() => localStorage.clear());
  await presenter.reload();
  await unlock(presenter);
  const aud = await stageFrame(presenter);
  // من ش1: قبل أول سؤال تظهر اللوحتان، والباقي مع العدّاد. والإعداد شاشة البداية: الشعار الكبير مكان البطاقة والترويسة (design/logo/الدمج.md 3).
  // الملاحظة 37: ننتظر عرض الجمهور نفسه (حتى 5 ثوانٍ) ثم نفحص، ونذكر ما خالف إن خالف.
  const shown = ['.team.t1', '.team.t2', '.hero .hlogo', '.hero .rays'], hiddenSel = ['.card', '.logo', '.strip.t1', '.strip.t2', '.badge.mode', '.team .cnt', '.team .score', '.giant'];
  const skeleton = () => aud.evaluate(([shown, hiddenSel]) => {
    const vis = s => [...document.querySelectorAll(s)].some(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
    return [...shown.filter(s => !vis(s)).map(s => 'لا يظهر ' + s), ...hiddenSel.filter(vis).map(s => 'يظهر ' + s)];
  }, [shown, hiddenSel]);
  await aud.waitForFunction(([shown, hiddenSel]) => {
    const vis = s => [...document.querySelectorAll(s)].some(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
    return shown.every(vis) && !hiddenSel.some(vis);
  }, [shown, hiddenSel], { timeout: 5000 }).catch(() => {});
  const wrong = await skeleton();
  check(`بعد الدخول: اللوحتان والشعار ظاهرة، ولا شريط ولا عدّاد ولا رقم قبل أول سؤال${wrong.length ? ` (${wrong.join('، ')})` : ''}`, !wrong.length);
  await presenter.screenshot({ path: `${shots}/skeleton-audience-live.png` });

  // 5. حواف الخطر في آخر 3 ثوانٍ فقط، وتختفي عند 0:00: بعدّاد «وقت الخصم» (10 ثوانٍ) في «الحرف المعيّن»،
  // بدل عدّاد التجربة في صفحة ?test المحذوفة.
  await sharedToFace(aud, { names: ['الصقور', 'النجوم'], picks: ['letter', 'last-two'] });
  await wait(2700);
  await cmd(aud, 'begin');
  await aud.waitForSelector('.scr.show[data-s="intro"]', { timeout: 6000 });
  await cmd(aud, 'act:show');
  await wait(900);
  await cmd(aud, 'act:steal');
  await wait(300);
  check('مع العدّاد: اللوحتان والشارة ظاهرة، ولا شريط فارق',
    !(await aud.isVisible('.strip')) && (await Promise.all(['.team.t1', '.team.t2', '.badge.mode'].map(s => aud.isVisible(s)))).every(Boolean));
  await wait(4200);
  const early = await aud.textContent('#timer');
  check(`قبل آخر 3 ثوانٍ (${early}): لا حواف`, ['0:06', '0:05'].includes(early) && !(await aud.evaluate(() => document.getElementById('canvas').classList.contains('meta-danger'))));
  await wait(3000);
  const at = await aud.textContent('#timer');
  check(`آخر 3 ثوانٍ (${at}): حواف حمراء`, ['0:03', '0:02'].includes(at) && await aud.evaluate(() => document.getElementById('canvas').classList.contains('meta-danger')));
  await presenter.screenshot({ path: `${shots}/skeleton-danger.png` });
  await aud.waitForFunction(() => document.getElementById('timer').textContent === '0:00', null, { timeout: 6000 });
  await wait(400);
  check('عند 0:00: تختفي الحواف، وينتظر المقدّم', !(await aud.evaluate(() => document.getElementById('canvas').classList.contains('meta-danger')))
    && (await presenter.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.state.phase)) === 'over');
  check('العدّاد بصيغة 0:00 وأرقام إنجليزية', /^\d:\d\d$/.test(await aud.textContent('#timer')));

  check('لا أخطاء في الصفحات', errors.length === 0);
  await browser.close();
  process.exit(finish(errors) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
