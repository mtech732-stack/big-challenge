// اختبار آلي للترتيب بنافذة واحدة (جواب المالك، design/ranking.md 4، التصميم 1.3)، في رابط المعاينة:
// لا حكم ولا كشف في أثناء القائمة: «ابدأ» ثم «التالي» ينقل الدور و«أنهِ القائمة». ثم المقارنة بالتسجيل: القائمة كلها، والخانات
// تُنقر لمن قالها أولاً (لا أحد ← الأول ← الثاني ← لا أحد)، و«اعتمد النقاط» بالرتب ناقص الفخاخ، والتراجع يعيد ما قبله.
// وفحص التداخل والكلمات الممنوعة في كل حالة، و60/30/10 بالصور، مرتين: بالدوري، ثم بأطول محتوى.
// الاستعمال: node tests/stage5-ranking-single.cjs [الرابط] [مجلد الصور]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace } = require('./helpers.cjs');

(async () => {
  const base = (process.argv[2] || 'http://localhost:8000/') + '?preview';
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
    const slots = () => frame.$$eval('#board .sl', els => els.map(e => ({ cls: e.className, name: e.querySelector('span')?.textContent ?? '', cmd: e.dataset.cmd ?? '' })));
    const shot = async name => { await stage.screenshot({ path: `${shots}/s5-single-${LONGRUN ? 'long-' : ''}${name}.png` }); };
    const tap = async c => { await cmd(frame, c); await wait(800); };

    let layoutOk = true, leak = false;
    const fails = [];
    const look = async label => {
      await wait(500);
      const r = await frame.evaluate(() => window.__stageCheck());
      if (!r.ok) { layoutOk = false; fails.push(`${label}: ${r.problems.join('، ')}`); }
      const s = await st();
      const shown = ['mark', 'listend'].includes(s.phase) ? bank.lists[s.index].items.map(i => i.name) : [];
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
    await tap('single');
    await frame.waitForSelector('.scr.show[data-s="intro"]', { timeout: 6000 });

    // ظهور القائمة: «ابدأ» وحده.
    await tap('act:show');
    await frame.waitForSelector('.scr.show[data-s="rnk"]', { timeout: 5000 });
    const starter = (await st()).team;
    check(tag + `ظهور القائمة بنافذة واحدة: «ابدأ» وحده (${await near()})`, (await near()) === 'ابدأ' && (await side()) === starter);
    await look('ظهور القائمة');

    // في أثناء القائمة: «التالي» و«أنهِ القائمة»، ولا كشف.
    await tap('act:start:one');
    let s = await st();
    check(tag + `«ابدأ»: عدّاد صاحب الدور، و«التالي» و«أنهِ القائمة» (${await near()})`, s.phase === 'ask' && s.one && (await near()) === 'التالي | أنهِ القائمة'
      && await frame.$eval('#canvas', c => c.classList.contains('running')) && (await side()) === starter);
    await look('في أثناء القائمة');
    await shot('run');
    await tap('act:pass');
    const opp = starter === 1 ? 2 : 1;
    check(tag + '«التالي»: الدور للخصم والعدّاد يعمل، ولا خانة تنكشف', (await st()).team === opp && (await side()) === opp && (await slots()).every(x => !x.name)
      && await frame.$eval('#canvas', c => c.classList.contains('running')));
    await look('التالي');

    // المقارنة.
    await tap('act:finish'); await wait(500); // أزرار الشاشة بعد إمهال المقدّم (700)
    let sl = await slots();
    check(tag + `«أنهِ القائمة»: المقارنة، والقائمة كلها بأسمائها، والخانات تُنقر، و«اعتمد النقاط» (${await near()})`, (await st()).phase === 'mark'
      && sl.every((x, i) => x.name === items[i].name && x.cmd === 'act:mark:' + (i + 1)) && (await near()) === 'اعتمد النقاط'
      && await frame.$eval('#rnk', e => e.classList.contains('mark')) && (await side()) === 0 && !(await frame.$eval('#canvas', c => c.classList.contains('running'))));
    check(tag + 'المقارنة: «المقارنة بالتسجيل» بلا مربع', (await text('#next')) === 'المقارنة بالتسجيل' && await frame.$eval('#box', e => e.classList.contains('bare')));
    await look('المقارنة');
    await shot('mark');
    const was = await scores();
    // النقر المتتالي السريع (200 مللي ثانية) يُحسب كله (الملاحظة 35).
    const quick = async c => { await cmd(frame, c); await wait(200); };
    await quick('act:mark:3');
    await quick('act:mark:7'); await quick('act:mark:7');
    await quick('act:mark:12');
    await quick('act:mark:1'); await quick('act:mark:1'); await quick('act:mark:1');
    await wait(600);
    sl = await slots();
    check(tag + 'النقر المتتالي كل 0.2 ثانية يُحسب ويدوّر: 3 للأول، و7 للثاني (نقرتان)، و12 فخ للأول، و1 عاد لا أحد (ثلاث نقرات)', sl[2].cls.includes('t1') && sl[6].cls.includes('t2') && sl[11].cls.includes('t1')
      && sl[0].cls.includes('left') && !/t[12]/.test(sl[0].cls));
    await look('المقارنة بأصحاب');
    await shot('marked');
    await tap('act:commit');
    let now = await scores();
    check(tag + `«اعتمد النقاط»: الأول 3 − 2 = +1، والثاني +7 (${now[1] - was[1]}، ${now[2] - was[2]})`, now[1] === was[1] + 1 && now[2] === was[2] + 7);
    check(tag + `ثم نهاية القائمة: «كُشف 2 من 10»، والخانات لا تُنقر، و«القائمة 2» (${await near()})`, (await text('#next')) === 'كُشف 2 من 10' && (await slots()).every(x => !x.cmd)
      && !(await frame.$eval('#rnk', e => e.classList.contains('mark'))) && (await near()) === 'القائمة 2');
    await look('نهاية القائمة');
    await tap('undo');
    check(tag + 'التراجع يعيد المقارنة بخاناتها والرصيد', (await st()).phase === 'mark' && (await slots())[6].cls.includes('t2') && (await scores())[1] === was[1]);
    await tap('act:commit');
    await tap('act:next');
    // القائمة 2 (الأخيرة): يبدؤها الفريق الآخر، و«ابدأ» وحده، ووقت القائمة 5:00 يجري من «ابدأ» (design/ranking.md 4.1).
    s = await st();
    check(tag + `القائمة 2: يبدؤها الخصم، و«القائمة 2 من 2»، و«ابدأ» وحده، و«بقي للقائمة 5:00» (${await near()} · ${await text('#rclock b')})`, s.index === 1 && s.phase === 'read' && s.team === opp
      && (await text('#b1')) === 'القائمة 2 من 2' && (await near()) === 'ابدأ' && (await side()) === opp && (await text('#rclock b')) === '5:00');
    await look('القائمة 2');
    await tap('act:start:one'); await wait(1500);
    check(tag + `وقت القائمة يعدّ تنازلياً (${await text('#rclock b')})`, /^4:5[5-8]$/.test(await text('#rclock b')));
    // انقضاء الخمس دقائق (بتقديم ساعة النافذة): إلى المقارنة بنفسها.
    await stage.evaluate(() => { const real = Date.now; Date.now = () => real() + 300000; });
    await wait(1500);
    s = await st();
    check(tag + `انتهى وقت القائمة: المقارنة بنفسها، و«اعتمد النقاط»، ولا وقت للقائمة (${s.phase} · ${await near()})`, s.phase === 'mark' && s.timeup && (await near()) === 'اعتمد النقاط'
      && !(await frame.$('.scr.rnk.show #rclock')));
    await look('انتهى وقت القائمة');
    await shot('timeup');
    await tap('act:commit');
    check(tag + `«إنهاء الجولة» بعد القائمة الأخيرة (${await near()})`, (await near()) === 'إنهاء الجولة');
    await tap('act:next');
    check(tag + 'نهاية الجولة: الحصيلتان +1 و+7', await frame.isVisible('.scr.show[data-s="end"]') && (await text('#r1')) === '+1' && (await text('#r2')) === '+7');
    check(tag + `فحص التداخل في كل حالة، ولا اسم قبل النهاية، ولا كلمة ممنوعة${fails.length ? ` (${fails.slice(0, 3).join(' · ')})` : ''}`, layoutOk && !leak);
    await context.close();
  }
  check(`لا أخطاء في الصفحات${errors.length ? ` (${errors.slice(0, 3).join(' | ')})` : ''}`, errors.length === 0);
  await browser.close();
  process.exit(finish() ? 0 : 1);
})();
