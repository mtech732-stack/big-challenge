// اختبار آلي للترتيب بالتحكيم المباشر بنافذة واحدة (الوثيقة 5.6، 1.7، design/s8.md 3)، في رابط المعاينة:
// الباركود في بداية القائمة ثم يُخفى، و«ابدأ». في الإجابة يُنقر رقم الخانة على اللوحة فتنكشف بلون صاحب الدور ونقاطها رقمها، ثم لحظة 1.2 ثانية
// والدور للخصم بعدّاده. والفخ يُخصم رقمه دون الصفر. و«خطأ» ثم زرّا لون الدور التالي. وانتهاء وقت الإجابة ينقل الدور، و«تراجع» يعيد آخر حكم.
// ثم انقضاء وقت القائمة (دقيقتان ونصف)، والفخاخ ظاهرة الأرقام من أولها، وفحص التداخل والكلمات الممنوعة في كل حالة، مرتين: بالدوري، ثم بأطول محتوى.
// الاستعمال: node tests/stage5-ranking-single.cjs [الرابط] [مجلد الصور]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/'; // الرابط العادي: الترتيب في MODES منذ نهاية ش5
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { check, finish } = reporter();
  const errors = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/ranking.json'), 'utf8'));
  const [EPL, STRESS] = fixture.lists;

  for (const LONGRUN of [false, true]) {
    const tag = LONGRUN ? 'الأطول · ' : '';
    const NAMES = LONGRUN ? ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'] : ['الصقور', 'النجوم'];
    const first = LONGRUN ? { ...STRESS, level: 'easy' } : EPL;
    const bank = { mode: 'ranking', lists: [first, { ...(LONGRUN ? EPL : STRESS), level: 'hard' }] };
    const items = first.items;
    const allNames = [...new Set(bank.lists.flatMap(l => l.items.flatMap(i => [i.name, ...(i.alts ?? [])])))];

    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
    await usePin(context);
    await context.route('**/content/packs/general/ranking.json', route => route.fulfill({ json: bank }));
    context.on('page', p => {
      p.on('pageerror', e => errors.push(e.message));
      p.on('console', m => m.type() === 'error' && !/content\/packs\/.+\.json/.test(m.location().url) && errors.push(m.text()));
    });
    const stage = await context.newPage();
    await stage.goto(base);
    await stage.evaluate(() => localStorage.clear());
    await stage.reload();
    await unlock(stage);
    const frame = await stageFrame(stage);
    const text = (sel) => frame.textContent(sel).then(t => t.replace(/\s+/g, ' ').trim());
    const st = () => stage.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.state);
    const scores = () => stage.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.scores);
    const near = () => frame.$$eval('#near .cbtn', x => x.map(y => y.textContent.replace(/\s+/g, ' ').trim()).join(' | '));
    const side = () => frame.$eval('#canvas', c => (c.classList.contains('turn-1') ? 1 : c.classList.contains('turn-2') ? 2 : 0));
    const slots = () => frame.$$eval('#board .sl', els => els.map(e => ({ cls: e.className, name: e.querySelector('span')?.textContent ?? '', num: e.querySelector('b')?.textContent ?? '',
      cmd: e.dataset.cmd ?? '', visible: getComputedStyle(e).visibility === 'visible' })));
    const shot = async name => { await stage.screenshot({ path: `${shots}/s5-single-${LONGRUN ? 'long-' : ''}${name}.png` }); };
    const tap = async c => { await cmd(frame, c); await wait(800); };

    let layoutOk = true, leak = false;
    const fails = [];
    const look = async label => {
      await wait(500);
      const r = await frame.evaluate(() => window.__stageCheck());
      if (!r.ok) { layoutOk = false; fails.push(`${label}: ${r.problems.join('، ')}`); }
      const s = await st();
      const shown = s.phase === 'listend' ? bank.lists[s.index].items.map(i => i.name) : (s.got?.[s.index] ?? []).map(g => bank.lists[s.index].items[g.rank - 1].name);
      const body = await frame.evaluate(ns => { let t = document.querySelector('.canvas').innerText; for (const n of ns) t = t.split(n).join(''); return t; }, [...NAMES, ...shown]);
      if (/سرقة|سهل|متوسط|صعب|بفارق/.test(body)) { leak = true; fails.push(`${label}: نص ممنوع`); }
      const leaked = allNames.filter(n => [...n].length > 2 && body.includes(n) && !shown.some(x => x.includes(n)));
      if (leaked.length) { leak = true; fails.push(`${label}: على الشاشة ما لم ينكشف (${leaked.slice(0, 3).join('، ')})`); }
      const over = await frame.evaluate(() => [...document.querySelectorAll('.scr.rnk.show .title, .scr.rnk.show .sl > span')].filter(e => e.scrollWidth > e.clientWidth + 1).map(e => e.textContent));
      if (over.length) { layoutOk = false; fails.push(`${label}: يفيض (${over.join('، ')})`); }
    };

    await frame.waitForSelector('[data-cmd="draw"]', { timeout: 6000 });
    await sharedToFace(frame, { names: NAMES, picks: ['ranking', 'letter'] });
    await wait(2700);
    await tap('begin');
    await frame.waitForSelector('.scr.show[data-s="intro"]', { timeout: 6000 });

    // ظهور القائمة: الباركود أولاً (design/s8.md 2)، ثم «ابدأ» وحده، والفخاخ 11–13 ظاهرة الأرقام بلا اسم.
    await tap('act:show');
    await frame.waitForSelector('.scr.show[data-s="rnk"]', { timeout: 5000 });
    const starter = (await st()).team, opp = starter === 1 ? 2 : 1;
    check(tag + 'ظهور القائمة: الباركود ظاهر، ولا «ابدأ» حتى يُخفى', await frame.$eval('#canvas', c => c.classList.contains('qr')) && (await near()) === '');
    await look('الباركود');
    await tap('qr:hide');
    let sl = await slots();
    check(tag + `ثم «ابدأ» وحده، والخانات الثلاث عشرة بأرقامها والفخاخ ظاهرة بلا اسم (${await near()})`, (await near()) === 'ابدأ' && (await side()) === starter
      && sl.length === 13 && sl.every((x, i) => !x.name && x.num === String(i + 1)) && sl.slice(10).every(x => x.cls.includes('trap') && x.visible));
    check(tag + 'وقت القائمة «2:30» قبل «ابدأ»', (await text('#rclock b')) === '2:30');
    await look('ظهور القائمة');
    await shot('read');

    // الإجابة: الخانات تُنقر، و«خطأ» و«أنهِ القائمة».
    await tap('act:start');
    sl = await slots();
    check(tag + `«ابدأ»: عدّاد صاحب الدور، و«خطأ» و«أنهِ القائمة»، والخانات كلها تُنقر (${await near()})`, (await st()).phase === 'ask' && (await near()) === 'خطأ | أنهِ القائمة'
      && sl.every((x, i) => x.cmd === 'act:item:' + (i + 1)) && await frame.$eval('#rnk', e => e.classList.contains('judge')) && (await side()) === starter
      && await frame.$eval('#canvas', c => c.classList.contains('running')));
    await look('الإجابة');
    await shot('judge');
    const was = await scores();
    // أصاب المركز 7: لحظة بالمربع والحدّ عنده، ثم الدور للخصم تلقائياً بعدّاده.
    await cmd(frame, 'act:item:7'); await wait(300);
    sl = await slots();
    check(tag + `نقر 7: الخانة بلونه واسمها، و«+7» في المربع والحدّ عنده، ولا أزرار (${await text('#vtext')})`, sl[6].cls.includes('t' + starter) && sl[6].name === items[6].name
      && (await scores())[starter] === was[starter] + 7 && (await text('#vtext')).endsWith('· +7') && (await text('#say')) === 'المركز 7' && (await side()) === starter && (await near()) === '');
    await look('أصاب');
    await shot('hit');
    await wait(1600);
    sl = await slots();
    check(tag + 'بعد 1.2 ثانية: الدور للخصم بعدّاده، والمربع يُخفى، والخانة المكشوفة لا تُنقر', (await st()).team === opp && (await st()).phase === 'ask' && (await side()) === opp
      && !(await frame.isVisible('#box')) && !sl[6].cmd && sl[5].cmd === 'act:item:6' && await frame.$eval('#canvas', c => c.classList.contains('running')));
    await look('دور الخصم');
    // فخ 13 والخصم رصيده 0: الحكم بما خُصم فعلاً (0)، والخانة «−13».
    await cmd(frame, 'act:item:13'); await wait(300);
    sl = await slots();
    check(tag + `فخ 13 ورصيده 0: الفخ بلونه واسمه و«−13»، والمربع بما خُصم فعلاً، والحدّ في المنتصف (${await text('#vtext')})`, sl[12].cls.includes('t' + opp) && sl[12].num === '−13'
      && sl[12].name === items[12].name && (await scores())[opp] === was[opp] && (await text('#say')) === 'فخّ المركز 13' && (await side()) === 0);
    await look('فخ');
    await shot('trap');
    await wait(1600);
    check(tag + 'بعد الفخ: الدور لصاحب البدء', (await st()).team === starter && (await st()).phase === 'ask');
    // التراجع عن الفخ: يعود الدور لمن وقع فيه قبل حكمه (لحظة الإصابة عابرة).
    await tap('undo');
    sl = await slots();
    check(tag + '«تراجع»: يُرفع الفخ ويعود الدور لمن وقع فيه بعدّاده', (await st()).team === opp && (await st()).phase === 'ask' && !sl[12].name && sl[12].num === '13' && sl[12].cmd === 'act:item:13');
    // «خطأ»: لا نقاط بلا مربع، ويقف عدّاد الإجابة، وزرّا لون الدور التالي.
    await tap('act:wrong');
    check(tag + `«خطأ»: «لا نقاط» و«لم تُكشف خانة» بلا مربع، والحدّ في المنتصف، وزرّا «التالي» بلوني الفريقين (${await near()})`, (await st()).phase === 'wrong'
      && (await text('#say')) === 'لم تُكشف خانة' && await frame.$eval('#box', e => e.classList.contains('bare')) && (await side()) === 0 && (await near()) === 'التالي | التالي'
      && await frame.$eval('#near', n => n.children[0].classList.contains('t1') && n.children[1].classList.contains('t2')) && !(await frame.$eval('#canvas', c => c.classList.contains('running')))
      && (await slots()).every(x => !x.cmd));
    await look('خطأ');
    await shot('wrong');
    await tap('act:turn:' + opp);
    check(tag + 'اختيار لون الخصم نفسه: الدور له بعدّاده', (await st()).team === opp && (await st()).phase === 'ask' && (await side()) === opp);
    await tap('undo');
    check(tag + '«تراجع» يعيد اختيار اللون', (await st()).phase === 'wrong');
    await tap('act:turn:' + starter);
    check(tag + 'اختيار اللون الآخر: الدور لصاحب البدء', (await st()).team === starter);
    // انتهى وقت الإجابة: إلى الخصم بعدّاده، بلا اختيار.
    await frame.waitForFunction(o => JSON.parse(parent.localStorage.getItem('big-challenge.match')).round.state.team === o, opp, { timeout: 20000, polling: 200 });
    check(tag + 'انتهى وقت الإجابة: الدور للخصم بعدّاده، بلا اختيار', (await st()).phase === 'ask' && (await side()) === opp);
    // «أنهِ القائمة»: تنكشف كلها.
    await tap('act:finish');
    sl = await slots();
    check(tag + `«أنهِ القائمة»: القائمة كلها بأسمائها، و«كُشف 1 من 10»، و«القائمة 2» (${await near()})`, (await st()).phase === 'listend' && sl.every((x, i) => x.name === items[i].name && !x.cmd)
      && (await text('#next')) === 'كُشف 1 من 10' && (await near()) === 'القائمة 2');
    await look('نهاية القائمة');
    await tap('act:next');
    // القائمة 2: الباركود، ثم يبدؤها الآخر، ووقتها 2:30 يجري من «ابدأ» حتى ينقضي.
    await tap('qr:hide');
    let s = await st();
    check(tag + `القائمة 2: يبدؤها الخصم، و«القائمة 2 من 2»، و«ابدأ» وحده، و«بقي للقائمة 2:30» (${await near()} · ${await text('#rclock b')})`, s.index === 1 && s.phase === 'read' && s.team === opp
      && (await text('#b1')) === 'القائمة 2 من 2' && (await near()) === 'ابدأ' && (await text('#rclock b')) === '2:30');
    await tap('act:start'); await wait(1500);
    check(tag + `وقت القائمة يعدّ تنازلياً (${await text('#rclock b')})`, /^2:2[5-8]$/.test(await text('#rclock b')));
    await stage.evaluate(() => { const real = Date.now; Date.now = () => real() + 150000; });
    await wait(1500);
    s = await st();
    check(tag + `انتهى وقت القائمة: تنتهي وتنكشف بنفسها (${s.phase} · ${await near()})`, s.phase === 'listend' && s.timeup && (await near()) === 'إنهاء الجولة' && !(await frame.$('.scr.rnk.show #rclock')));
    await look('انتهى وقت القائمة');
    await shot('timeup');
    await tap('act:next');
    check(tag + `نهاية الجولة: الحصيلة +7 لصاحب البدء (${await text('#r' + starter)})`, await frame.isVisible('.scr.show[data-s="end"]') && (await text('#r' + starter)) === '+7' && (await text('#r' + opp)) === '+0');
    check(tag + `فحص التداخل في كل حالة، ولا اسم قبل النهاية، ولا كلمة ممنوعة${fails.length ? ` (${fails.slice(0, 3).join(' · ')})` : ''}`, layoutOk && !leak);
    await context.close();
  }
  check(`لا أخطاء في الصفحات${errors.length ? ` (${errors.slice(0, 3).join(' | ')})` : ''}`, errors.length === 0);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})();
