// اختبار آلي لـ ش8-أ/67 (الوثيقة 1.18، 5.7 و8، design/s8d.md 1.2): لا يتكرر تحدٍّ في الشريط حتى يُستنفد البنك،
// و«المباريات قبل التكرار» حُذفت من شاشة البداية في الموقع والتطبيق (الوثيقة 1.24، design/app.md 8.4)، والذاكرة باقية تعمل.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const root = path.join(__dirname, '..');
  const { check, finish } = reporter();
  const errors = [];
  const M = await import(path.join(root, 'js/match.js'));
  const P = await import(path.join(root, 'js/play.js'));
  const R = await import(path.join(root, 'js/round.js'));
  const { MODES } = await import(path.join(root, 'js/modes/index.js'));
  const WM = await import(path.join(root, 'js/wheel.js'));
  const W = WM.default;
  const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
  const dir = 'content/packs/general/';
  const real = read('content/wheel.json');
  // بنك وهمي بحجم 30 (ولا يفترض الكود حجماً): معرّفاته بصيغة البنك الحقيقي.
  const bankOf = n => ({ ...real, challenges: Array.from({ length: n }, (_, i) => ({ id: `wheel-${String(i + 1).padStart(3, '0')}`, text: `تحدٍّ تجريبي ${i + 1}` })) });
  const big = bankOf(30);
  const files = { 'letter.json': read(dir + 'letter.json'), 'last-two.json': read(dir + 'last-two.json'), 'auction.json': read(dir + 'auction.json'), 'ranking.json': read(dir + 'ranking.json') };
  const modes = [...MODES, W];
  let seed = 3;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // ===== 1. الاختيار والذاكرة =====
  const ids = s => W.used(s);
  check('الوحدة: CHALLENGES = 7، وfresh اختيارية في العقد', WM.CHALLENGES === 7 && typeof W.fresh === 'function');
  // مباريات متتالية بذاكرة واحدة (كما يحفظها index.html في big-challenge.seen).
  {
    let seen = [];
    const runs = [];
    for (let k = 0; k < 5; k++) { const s = W.setup({ content: big, first: 1, seen, rng }); runs.push(ids(s)); seen = [...new Set([...seen, ...ids(s)])]; }
    const repeats = k => runs[k].filter(id => runs.slice(0, k).flat().includes(id)).length;
    check(`بنك 30: أربعة أشرطة متتالية بذاكرة واحدة بلا تكرار (${runs.slice(0, 4).map(r => r.length).join('+')})`, runs.slice(0, 4).every(r => r.length === 7) && [1, 2, 3].every(k => repeats(k) === 0));
    check(`والخامس: يأخذ الاثنين الباقيين أولاً ثم يبدأ البنك من جديد (${repeats(4)} مكرراً)`, repeats(4) === 5 && runs[4].filter(id => !runs.slice(0, 4).flat().includes(id)).length === 2);
  }
  {
    // البنك الحقيقي: مباراتان بذاكرة واحدة لا يتكرر فيهما تحدٍّ ما دام البنك يكفي.
    const n = real.challenges.length, first = ids(W.setup({ content: real, first: 1, seen: [], rng }));
    const second = ids(W.setup({ content: real, first: 1, seen: first, rng }));
    const fresh = second.filter(id => !first.includes(id)).length;
    check(`البنك الحقيقي (${n}): الثانية تأخذ كل ما لم يظهر أولاً (${fresh} جديداً من ${Math.min(7, n - 7)})`, first.length === 7 && fresh === Math.min(7, n - 7));
  }
  check('بنك أصغر من 7: الخانات الناقصة فارغة كما كانت، ولا انهيار', (() => { const s = W.setup({ content: bankOf(5), first: 1, seen: [], rng }); return ids(s).length === 5 && s.slots.filter(x => x.kind === 'challenge').length === 7; })());
  check('المعرّفات: wheel-NNN لا تتصادم مع معرّف سؤال أو موضوع أو قائمة', (() => {
    const q = Object.values(files).flatMap(f => [...(f.questions ?? []), ...(f.topics ?? []), ...(f.lists ?? [])]).map(x => x.id);
    return real.challenges.every(c => /^wheel-\d{3}$/.test(c.id) && !q.includes(c.id));
  })());

  // ===== 2. مسار المباراة: play.js يمرّر الذاكرة، والشريطان في مباراة الأربعة لا يتكرران =====
  const fullMatch = () => {
    let m = M.newMatch({ pack: 'general', method: 'full' });
    m = M.setTeams(m, 'أ', 'ب'); m = M.toDraw(m); m = M.draw(m, () => 0.1); m = M.toPick(m);
    for (const id of ['letter', 'last-two', 'auction', 'ranking']) m = M.pick(m, id, MODES);
    return M.toFace(m);
  };
  // ينهي كل جولة فوراً (phase: end) ليصل إلى ما بعدها، ويحفظ ما ظهر كما يحفظه index.html.
  const playThrough = (memory, keep = true) => {
    let m = fullMatch(), seen = [...memory];
    const wheels = [];
    for (let i = 0; i < 6; i++) {
      m = P.startNext(m, { modes, content: { ...files, 'wheel.json': big }, seen, rng });
      if (m.round.mode === 'wheel') wheels.push(ids(m.round.state));
      if (keep) seen = [...new Set([...seen, ...P.modeOf(modes, m.round.mode).used(m.round.state)])];
      m = { ...m, round: { ...m.round, state: { ...m.round.state, phase: 'end' } } };
    }
    return { wheels, seen, m };
  };
  {
    const a = playThrough([]);
    check(`مباراة الأربعة: شريطان بـ 14 تحدياً مختلفاً، وكلها في الذاكرة (${a.wheels.flat().length})`, a.wheels.length === 2 && new Set(a.wheels.flat()).size === 14 && a.wheels.flat().every(id => a.seen.includes(id)));
    const b = playThrough(a.seen);
    check('والمباراة التالية بالذاكرة نفسها: لا تحدٍّ من الأولى (28 من 30)', new Set([...a.wheels.flat(), ...b.wheels.flat()]).size === 28);
    const lost = playThrough([], false);
    check('وبلا ذاكرة (جهاز آخر): الشريط الثاني لا يعيد تحدياً من الأول في المباراة نفسها (match.used)', new Set(lost.wheels.flat()).size === 14 && lost.m.used.some(id => id.startsWith('wheel-')));
  }

  // ===== 3. المباريات المحفوظة تُستأنف =====
  {
    // حال شريط محفوظة قبل 1.18: التحديات بترتيب الملف، ولا seen. تُكمل كما هي، وused تعطي تحدياتها.
    const old = { ...W.setup({ content: real, first: 2, rng: () => 0.05 }) };
    // أول سبعة في الملف بترتيبها (ما كان يأخذه الشريط قبل 1.18)، أياً كان حجم البنك (ش8-أ/68).
    const first7 = real.challenges.slice(0, WM.CHALLENGES), at = WM.LAYOUT.map((k, i) => i).filter(i => WM.LAYOUT[i] === 'c');
    old.slots = WM.LAYOUT.map((k, i) => k === 'c' ? { kind: 'challenge', id: first7[at.indexOf(i)].id, text: first7[at.indexOf(i)].text } : old.slots[i]);
    let round = { mode: 'wheel', first: 2, state: old, scores: { 1: 0, 2: 0 }, timer: null, timers: 0, history: [], events: [] };
    round = R.act(W, round, 'spin', undefined, 1000);
    round = R.act(W, round, 'land', undefined, 1000 + WM.spinMs(round.state.landed));
    check('حال شريط قديمة: تدور وتقف وتُحكم، وused تعطي تحدياتها السبعة', round.state.landed !== null && ['slot', 'done'].includes(round.state.phase) && ids(old).join() === first7.map(c => c.id).join());
    check('وحال بلا slots (تالفة) لا تكسر used', JSON.stringify(W.used({})) === '[]');
  }

  // ===== 4. المباريات قبل التكرار: الحساب =====
  {
    const content = { ...files, 'wheel.json': big };
    const all = Object.values(content).flatMap(f => [...(f.questions ?? []).filter(q => !q.tiebreak), ...(f.topics ?? []), ...(f.lists ?? []), ...(f.challenges ?? [])]).map(x => x.id);
    const short = M.newMatch({ pack: 'general', method: 'short' }), full = M.newMatch({ pack: 'general', method: 'full' });
    const expect = {
      letter: Math.min(...['easy', 'medium', 'hard'].map(l => Math.floor(files['letter.json'].questions.filter(q => !q.tiebreak && q.level === l).length / 2))),
      auction: Math.floor(files['auction.json'].topics.length / 3), ranking: Math.floor(files['ranking.json'].lists.length / 2),
    };
    const empty = P.freshLeft(short, { modes, content, seen: [] });
    check(`ذاكرة فارغة: كل نمط بقسمة بنكه، والشريط 30 ÷ 7 = 4 (${JSON.stringify(empty)})`, empty.letter === expect.letter && empty.auction === expect.auction && empty.ranking === expect.ranking
      && empty['last-two'] > 0 && empty.wheel === 4 && Object.keys(empty).join() === 'letter,last-two,auction,ranking,wheel');
    check('مباراة الأربعة فيها شريطان: الشريط 30 ÷ 14 = 2، والأنماط كما هي', (() => { const f = P.freshLeft(full, { modes, content, seen: [] }); return f.wheel === 2 && f.letter === empty.letter && f.auction === empty.auction; })());
    const one = playThrough([]);
    const after = P.freshLeft(full, { modes, content, seen: one.seen });
    check(`بعد مباراة أربعة: ينقص كل نمط جولة، والشريط 16 ÷ 14 = 1 (${JSON.stringify(after)})`, after.letter === empty.letter - 1 && after['last-two'] === empty['last-two'] - 1
      && after.auction === empty.auction - 1 && after.ranking === empty.ranking - 1 && after.wheel === 1);
    const done = P.freshLeft(short, { modes, content, seen: all });
    check(`بنك مستنفد: صفر في الكل (${JSON.stringify(done)})`, Object.values(done).every(v => v === 0) && Object.keys(done).length === 5);
    check('ولا يفترض حجماً: بنك 70 ← 10 أشرطة، و6 ← 0', P.freshLeft(short, { modes: [W], content: { 'wheel.json': bankOf(70) }, seen: [] }).wheel === 10 && P.freshLeft(short, { modes: [W], content: { 'wheel.json': bankOf(6) }, seen: [] }).wheel === 0);
  }

  // ===== 5. لا قائمة في شاشة البداية (الوثيقة 1.24، design/app.md 8.4)، ولو امتلأت الذاكرة =====
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  async function open({ native = false, seen = null, size = { width: 1920, height: 1080 } } = {}) {
    const context = await browser.newContext({ viewport: size, serviceWorkers: 'block' });
    context.on('page', p => {
      p.on('pageerror', e => errors.push(e.message));
      p.on('console', m => m.type() === 'error' && !/pin\.json|Failed to load resource/.test(m.text()) && errors.push(m.text()));
    });
    await usePin(context);
    if (native) await context.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; });
    const page = await context.newPage();
    await page.goto(base);
    await page.evaluate(s => { localStorage.clear(); if (s) localStorage.setItem('big-challenge.seen', JSON.stringify(s)); }, seen);
    await page.reload();
    if (!native) await unlock(page);
    const frame = await stageFrame(page);
    await page.waitForTimeout(800);
    return { context, page, frame };
  }
  const content = { ...files, 'wheel.json': real };
  const all = Object.values(content).flatMap(f => [...(f.questions ?? []), ...(f.topics ?? []), ...(f.lists ?? []), ...(f.challenges ?? [])]).map(x => x.id);
  for (const [tag, opts] of [['الموقع', {}], ['الموقع، بنك مستنفد', { seen: all }], ['التطبيق', { native: true, size: { width: 956, height: 440 } }]]) {
    const { context, page, frame } = await open(opts);
    const none = !(await frame.$('#rp')) && !(await frame.$('#rpIco')) && !(await frame.evaluate(() => document.body.innerText.includes('المباريات قبل التكرار')));
    let ok = true; const fails = [];
    for (const size of opts.native ? [opts.size] : [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 3840, height: 2160 }]) {
      await page.setViewportSize(size); await page.waitForTimeout(500);
      const r = await frame.evaluate(() => window.__stageCheck());
      if (!r.ok) { ok = false; fails.push(`${size.width}: ${r.problems.join('، ')}`); }
    }
    check(`${tag}: لا «المباريات قبل التكرار» ولا أيقونتها في شاشة البداية، وcheck.js سليم (${fails.join(' | ')})`, none && ok);
    if (!opts.seen) await page.screenshot({ path: `${shots}/s8d-start${opts.native ? '-app' : ''}.png` });
    await context.close();
  }
  await browser.close();
  finish(errors);
})();
