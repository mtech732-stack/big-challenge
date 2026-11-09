// اختبار آلي لـ ش8-أ/69: دورة جديدة لكل بنك. حين يقلّ ما لم يظهر من بنك عمّا تحتاجه جولته، تُفرَّغ معرّفات ذلك البنك وحده
// من الذاكرة إلا ما أخذته الجولة للتو (remember في js/round.js). في الأنماط الأربعة والشريط والجولة الفاصلة:
// يُستنفد البنك ثم تُلعب جولتان، فلا تكرار في الدورة الجديدة، ولا شيء فيها من آخر جولة في الدورة السابقة.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const root = path.join(__dirname, '..');
  const { check, finish } = reporter();
  const errors = [];
  const M = await import(path.join(root, 'js/match.js'));
  const P = await import(path.join(root, 'js/play.js'));
  const R = await import(path.join(root, 'js/round.js'));
  const { MODES } = await import(path.join(root, 'js/modes/index.js'));
  const { checkMode } = await import(path.join(root, 'js/modes/contract.js'));
  const W = (await import(path.join(root, 'js/wheel.js'))).default;
  const TB = (await import(path.join(root, 'js/tiebreak.js'))).default;
  const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
  const dir = 'content/packs/general/';
  const files = { 'letter.json': read(dir + 'letter.json'), 'last-two.json': read(dir + 'last-two.json'), 'auction.json': read(dir + 'auction.json'), 'ranking.json': read(dir + 'ranking.json'), 'wheel.json': read('content/wheel.json') };
  let seed = 7;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  // ما تأخذه جولة الجولة الفاصلة: محاولة واحدة، سؤالان (used = asked).
  const take = (unit, s) => (unit === TB ? s.questions.slice(0, 2).map(q => q.id) : unit.used(s));

  // ذاكرة فيها معرّفات من كل البنوك الأخرى (وإن لم تكن هذه الوحدة)، لتُفحص أنها لا تُمسّ.
  const others = unit => Object.entries(files).flatMap(([f, c]) => [...(c.questions ?? []), ...(c.topics ?? []), ...(c.lists ?? []), ...(c.challenges ?? [])]
    .filter(x => !unit.pool(files[unit.contentKey]).some(y => y.id === x.id)).slice(0, 3).map(x => x.id));

  for (const unit of [...MODES, W, TB]) {
    const content = files[unit.contentKey];
    const pool = unit.pool(content).map(x => x.id);
    const keep = others(unit);
    let seen = [...keep];
    const rounds = [];
    let reset = -1;
    for (let k = 0; k < 200 && reset < 0; k++) {
      const got = take(unit, unit.setup({ content, first: 1, seen, rng }));
      rounds.push(got);
      const next = R.remember(seen, unit, content, got);
      if (next.filter(id => pool.includes(id)).length < seen.filter(id => pool.includes(id)).length + got.filter(id => !seen.includes(id)).length) reset = k;
      seen = next;
    }
    const cycle = rounds.flat(), last = rounds.at(-1);
    check(`${unit.name}: يُستنفد البنك (${pool.length}) في ${rounds.length} جولة بلا تكرار، ثم دورة جديدة`, reset >= 0 && new Set(cycle).size === cycle.length);
    check(`${unit.name}: بعد الدورة لا يبقى في الذاكرة من بنكه إلا آخر جولة (${last.length})، وذاكرة البنوك الأخرى كما هي`,
      seen.filter(id => pool.includes(id)).sort().join() === [...last].sort().join() && keep.every(id => seen.includes(id)));
    const left = P.freshLeft(M.newMatch({ pack: 'general', method: 'short' }), { modes: [unit], content: { [unit.contentKey]: content }, seen });
    if (unit !== TB) check(`${unit.name}: المباريات قبل التكرار بعد الدورة من الذاكرة الجديدة (${left[unit.id]})`, left[unit.id] === Math.floor(unit.fresh(content, seen) / 1) && left[unit.id] >= 1);
    const a = take(unit, unit.setup({ content, first: 1, seen, rng }));
    seen = R.remember(seen, unit, content, a);
    const b = take(unit, unit.setup({ content, first: 1, seen, rng }));
    check(`${unit.name}: جولتان في الدورة الجديدة بلا تكرار بينهما، ولا شيء من آخر جولة قبلها`,
      a.length === last.length && b.length === last.length && new Set([...a, ...b]).size === a.length + b.length && ![...a, ...b].some(id => last.includes(id)));
  }
  check('العقد: pool اختيارية، والأنماط تمرّ بفحص العقد، وpool ليست دالة تُرفض', MODES.every(u => typeof u.pool === 'function' && checkMode(u).length === 0)
    && checkMode({ ...MODES[0], pool: [] }).length === 1 && [W, TB].every(u => typeof u.pool === 'function' && typeof u.fresh === 'function'));
  check('وحدة بلا pool: تُضاف معرّفاتها وحدها كما كانت', R.remember(['a'], { fresh: () => 0 }, {}, ['b', 'a']).join() === 'a,b');

  // في الصفحة: index.html يحفظ بـ remember. ذاكرة فيها المزاد كله إلا ثلاثة، فأول جولة مزاد تأخذ الثلاثة ثم تبدأ دورته.
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
  context.on('page', p => { p.on('pageerror', e => errors.push(e.message)); p.on('console', m => m.type() === 'error' && !/pin\.json|Failed to load resource/.test(m.text()) && errors.push(m.text())); });
  await usePin(context);
  const page = await context.newPage();
  const topics = files['auction.json'].topics.map(t => t.id), rest = topics.slice(-3), letter = files['letter.json'].questions[0].id;
  await page.goto(base);
  await page.evaluate(s => { localStorage.clear(); localStorage.setItem('big-challenge.seen', JSON.stringify(s)); }, [...topics.slice(0, -3), letter]);
  await page.reload();
  await unlock(page);
  const frame = await stageFrame(page);
  await sharedToFace(frame, { names: ['الصقور', 'النجوم'], picks: ['auction', 'letter'] });
  await new Promise(r => setTimeout(r, 2700));
  await cmd(frame, 'begin');
  await frame.waitForSelector('.scr.show[data-s="intro"]', { timeout: 8000 });
  const { seen, got } = await page.evaluate(() => ({ seen: JSON.parse(localStorage.getItem('big-challenge.seen')), got: JSON.parse(localStorage.getItem('big-challenge.match')).round.state.topics.map(t => t.id) }));
  check(`الصفحة: الجولة أخذت الثلاثة الباقية (${got.join('، ')})`, got.sort().join() === [...rest].sort().join());
  check(`الصفحة: ثم دورة جديدة: لا يبقى من المزاد في الذاكرة إلا الثلاثة، وسؤال الحرف كما هو (${seen.length})`, seen.filter(id => topics.includes(id)).sort().join() === [...rest].sort().join() && seen.includes(letter));
  await browser.close();
  finish(errors);
})();
