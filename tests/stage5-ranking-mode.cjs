// اختبار آلي لوحدة «الترتيب» (js/modes/ranking.js) في مرحلة «اللوحة والكشف» (5.6، design/ranking.md)، دون متصفح:
// قائمتان سهلة ثم صعبة، والعدّاد 15 ثانية، والعنصر الصحيح يُكشف في خانته بنقاط رقمها، والتناوب، ونهاية القائمة بالعشرة أو «أنهِ القائمة»،
// ولا اسم ولا فخ ولا مستوى على الجمهور قبل نهاية القائمة. والفخاخ بخصمها وبما خُصم فعلاً (مرحلة «الفخاخ»). وحدود الفاحص الثلاثة.
const fs = require('fs');
const path = require('path');
const { reporter } = require('./helpers.cjs');

(async () => {
  const root = path.join(__dirname, '..');
  const ranking = (await import(path.join(root, 'js/modes/ranking.js'))).default;
  const { ANSWER_SECONDS } = await import(path.join(root, 'js/modes/ranking.js'));
  const { checkMode } = await import(path.join(root, 'js/modes/contract.js'));
  const { MODES, DRAFTS, matchModes } = await import(path.join(root, 'js/modes/index.js'));
  const { checkContent } = await import(path.join(root, 'js/content-check.js'));
  const R = await import(path.join(root, 'js/round.js'));
  const { check, finish } = reporter();
  const bank = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures/ranking.json'), 'utf8'));
  // قائمتان سهلتان وقائمتان صعبتان، لذاكرة الأسئلة.
  const twice = { ...bank, lists: [...bank.lists, ...bank.lists.map(l => ({ ...l, id: l.id + '-b' }))] };
  const content = { 'ranking.json': twice };
  let seed = 7;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // العقد والسجل: يُبنى مرحلةً مرحلة، فهو في DRAFTS (رابط المعاينة وحده).
  check('الوحدة تلتزم «عقد الوحدة»', checkMode(ranking).length === 0);
  check('ملف أسئلته ranking.json، وترتيبه 4، واسمه «الترتيب»', ranking.contentKey === 'ranking.json' && ranking.order === 4 && ranking.name === 'الترتيب');
  check('في DRAFTS لا في MODES: لا يُختار في مباراة تُلعب حتى تكتمل ش5', DRAFTS.includes(ranking) && !MODES.includes(ranking));
  const files = { 'letter.json': {}, 'last-two.json': {}, 'auction.json': {}, 'ranking.json': twice };
  const pv = matchModes({ modes: [...MODES, ...DRAFTS], pack: { excludeModes: [] }, files });
  const normal = matchModes({ pack: { excludeModes: [] }, files });
  check('رابط المعاينة: الترتيب مبنيّ في موضعه الرابع، والرابط العادي: معاينة', pv[3]?.id === 'ranking' && !pv[3].preview && normal[3]?.id === 'ranking' && normal[3].preview);

  // الإعداد
  let round = R.startRound(ranking, { content, first: 2, rng });
  let s = round.state;
  check('قائمتان: سهلة ثم صعبة، كلٌّ 13 عنصراً بصيغها', s.lists.length === 2 && s.lists[0].level === 'easy' && s.lists[1].level === 'hard'
    && s.lists.every(l => l.items.length === 13) && s.lists[0].items[1].alts.length === 1);
  check('ذاكرة الأسئلة: لا تتكرر قائمة حتى يُستنفد البنك', (() => {
    const used = ranking.used(s);
    const again = ranking.setup({ content: twice, first: 1, seen: used, rng });
    return ranking.used(again).every(id => !used.includes(id));
  })());
  const names = [...new Set(s.lists.flatMap(l => l.items.flatMap(i => [i.name, ...i.alts])))];
  const leaks = a => { const j = JSON.stringify(a); return names.filter(n => j.includes(`"${n}"`)); };
  let a = ranking.audience(s);
  check('الافتتاح: سطر القاعدة و«قائمتان، وخلف كل قائمة ثلاثة فخاخ»، والحدّ في المنتصف', a.screen === 'intro' && a.rule === 'اذكروا ما في القائمة: كلما بعُد عن الأول زادت نقاطه'
    && a.starter === 'قائمتان، وخلف كل قائمة ثلاثة فخاخ' && a.turn === 0);
  check('الافتتاح: «اعرض القائمة 1»', ranking.actions(s).map(x => x.label).join() === 'اعرض القائمة 1');

  const go = (action, id) => { round = R.act(ranking, round, action, id); s = round.state; a = ranking.audience(s); return round; };
  go('show');
  check('ظهور القائمة: الدور لمن بدأ، والعدّاد لم يبدأ، و«ابدأ العدّاد · 15 ثانية» و«أنهِ القائمة»', s.phase === 'read' && a.turn === 2 && !round.timer
    && ranking.actions(s).map(x => x.label).join('|') === `ابدأ العدّاد · ${ANSWER_SECONDS} ثانية|أنهِ القائمة`);
  check('الجمهور: العنوان، و10 خانات برتبها بلا أسماء، والفخاخ الثلاثة بلا رتبة ولا اسم', a.screen === 'list' && a.title === bank.lists[0].title && a.n === 1 && a.count === 2
    && a.slots.length === 13 && a.slots.slice(0, 10).every((x, i) => x.rank === i + 1 && !x.name && !x.team)
    && a.slots.slice(10).every(x => x.trap && !x.rank && !x.name));
  check('الجمهور: لا اسم من القائمة ولا صيغة ولا مستوى', leaks(a).length === 0 && !('level' in a));
  check('النقر قبل «ابدأ» لا يحكم', go('item:3').state.phase === 'read');
  go('start');
  check('«ابدأ»: عدّاد 15 ثانية لصاحب الدور', s.phase === 'ask' && round.timer?.seconds === ANSWER_SECONDS && a.turn === 2);
  check('في العدّاد: «خطأ · ليس في القائمة أو مكرر»', ranking.actions(s).some(x => x.id === 'wrong' && x.label === 'خطأ · ليس في القائمة أو مكرر'));

  // الإصابة: المركز 7 للثاني.
  go('item:7');
  check('أصاب المركز 7: +7 للثاني، والخانة تنكشف باسمها ولونه', s.phase === 'decided' && round.scores[2] === 7 && a.verdict.team === 2 && a.verdict.points === 7 && a.verdict.rank === 7
    && a.slots[6].name === s.lists[0].items[6].name && a.slots[6].team === 2 && a.fresh === 7);
  check('لحظة «صحيحة»، والعدّاد يقف', round.events.some(e => e.type === 'moment' && e.name === 'right' && e.team === 2) && !round.timer);
  check('بعد الحكم: الحدّ عند من أصاب، ولا اسم غير المكشوف', a.turn === 2 && leaks(a).length === 1);
  const pr = ranking.presenter(s);
  check('المقدّم: القائمة كلها (13) بصيغها، والمكشوف بمن كشفه، والفخاخ مُعلَّمة، والتالي دور الأول', pr.items.length === 13 && pr.items[6].by === 2 && pr.items[10].trap && !pr.items[9].trap
    && pr.items[1].alts.length === 1 && pr.upNext === 1 && pr.level === 'easy');
  check('بعد الحكم: «التالي» و«أنهِ القائمة»', ranking.actions(s).map(x => x.id).join() === 'next,finish');

  // التالي: دور الأول وعدّاده فوراً.
  go('next');
  check('«التالي»: دور الأول، وعدّاده 15 ثانية فوراً', s.phase === 'ask' && s.team === 1 && round.timer?.seconds === ANSWER_SECONDS && a.verdict === null);
  check('المكرر لا يُكشف ثانية', go('item:7').state.phase === 'ask' && round.scores[1] === 0);
  // الفخ ورصيد الأول صفر: لا خصم، والحكم «0 · فخّ المركز 11»، والخانة تظهر بلونه، والفخاخ الأخرى مخفية.
  go('item:11');
  check('الفخ برصيد صفر: الحكم بخصم 0 (ما خُصم فعلاً)، ولا حدث نقاط، ولحظة «فخ»', s.phase === 'decided' && a.verdict.team === 1 && a.verdict.points === 0 && a.verdict.rank === 11
    && round.scores[1] === 0 && round.events.some(e => e.type === 'moment' && e.name === 'trap' && e.team === 1 && e.rank === 11));
  check('الفخ: الحدّ في المنتصف، وخانته باسمها ولون من وقع فيه، والفخان الآخران بلا رتبة ولا اسم', a.turn === 0 && a.slots[10].rank === 11 && a.slots[10].trap
    && a.slots[10].team === 1 && a.slots[10].name === s.lists[0].items[10].name && a.fresh === 11 && !a.slots[11].rank && !a.slots[12].name);
  round = R.undo(round); s = round.state;
  check('التراجع عن الفخ يعيد السؤال وعدّاده', s.phase === 'ask' && round.timer?.seconds === ANSWER_SECONDS && !s.got[0].some(g => g.rank === 11));
  check('رتبة خارج 1–13 أو بلا رقم تُهمل', go('item:0').state.phase === 'ask' && go('item:x').state.phase === 'ask');
  const timerId = round.timer.id;
  go('timeout', timerId);
  check('انتهى الوقت: لا نقاط، و«لم تُكشف خانة»، والحدّ في المنتصف', s.phase === 'decided' && a.verdict.team === 0 && a.turn === 0 && round.scores[1] === 0);
  // تراجع: يعود العدّاد.
  round = R.undo(round); s = round.state;
  check('التراجع يعيد السؤال وعدّاده', s.phase === 'ask' && round.timer?.seconds === ANSWER_SECONDS);
  go('wrong');
  check('«خطأ»: لا نقاط', s.phase === 'decided' && s.verdict.team === 0);

  // العشرة كلها: يُكشف ما بقي بالتناوب، ثم نهاية القائمة وحدها.
  for (const r of [1, 2, 3, 4, 5, 6, 8, 9, 10]) { go('next'); go('item:' + r); }
  check('انكشفت العشرة: «أنهِ القائمة» وحدها', ranking.actions(s).map(x => x.id).join() === 'finish' && a.found === 10);
  const sum = round.scores[1] + round.scores[2];
  check('النقاط بقدر الرتب: 55 للعشرة', sum === 55);
  go('finish');
  check('نهاية القائمة: القائمة كلها بأسمائها والفخاخ، و«كُشف 10 من 10»، والحدّ في المنتصف', s.phase === 'listend' && a.slots.every(x => x.name) && a.found === 10 && a.of === 10 && a.turn === 0 && !a.verdict);
  check('نهاية القائمة: «إنهاء الجولة»', ranking.actions(s).map(x => x.label).join() === 'إنهاء الجولة');
  go('next');
  check('نهاية الجولة: حصيلتا الفريقين', s.phase === 'end' && ranking.finished(s) && a.screen === 'end' && a.totals[1] + a.totals[2] === 55);

  // الفخاخ بخصمها: −3 و−2 و−1، ولا ينزل الرصيد تحت الصفر، والحكم بما خُصم فعلاً (design/ranking.md 7.7).
  {
    const PEN = (await import(path.join(root, 'js/modes/ranking.js'))).PENALTY;
    check('خصم الفخاخ: 11 ← 3 · 12 ← 2 · 13 ← 1', PEN[11] === 3 && PEN[12] === 2 && PEN[13] === 1);
    let r = R.startRound(ranking, { content, first: 1, rng });
    const run = (x, id) => (r = R.act(ranking, r, x, id));
    run('show'); run('start');
    r = R.setScore(r, 1, 1); r = R.setScore(r, 2, 10);
    run('item:11');
    let v = r.state.verdict;
    check('فخ 11 ورصيده 1: نزل إلى 0، والحكم «−1» لا «−3»', r.scores[1] === 0 && v.points === -1 && v.rank === 11 && r.state.got[0][0].points === -1
      && r.events.some(e => e.type === 'score' && e.team === 1 && e.points === -1));
    check('الفخ لا يكشف خانة من العشر، ولا يُنهي القائمة', ranking.audience(r.state).found === 0 && ranking.actions(r.state).map(x => x.id).join() === 'next,finish');
    run('next'); run('item:12');
    v = r.state.verdict;
    check('فخ 12 ورصيده 10: −2، فصار 8', r.scores[2] === 8 && v.points === -2 && v.team === 2);
    const p = ranking.presenter(r.state);
    check('المقدّم: الفخ بمن وقع فيه', p.items[10].by === 1 && p.items[11].by === 2 && p.items[12].by === 0);
    run('next');
    check('الفخ لا يُنقر ثانية (المكرر خطأ)', run('item:12').state.phase === 'ask');
    run('item:13');
    check('فخ 13 ورصيده 0: لا خصم، والحكم 0', r.scores[1] === 0 && r.state.verdict.points === 0 && r.state.verdict.rank === 13);
    run('finish'); run('next');
    const t = ranking.audience(r.state);
    check('حصيلة الجولة بما خُصم: الأول −1 والثاني −2', ranking.finished(r.state) && t.totals[1] === -1 && t.totals[2] === -2);
  }

  // «أنهِ القائمة» من ظهورها: تنكشف كلها، و«كُشف 0 من 10».
  let r2 = R.startRound(ranking, { content, first: 1, rng });
  r2 = R.act(ranking, r2, 'show'); r2 = R.act(ranking, r2, 'finish');
  const a2 = ranking.audience(r2.state);
  check('«أنهِ القائمة» قبل أي إجابة: «كُشف 0 من 10» وكلها بأسمائها بلا لون', a2.found === 0 && a2.slots.every(x => x.name && !x.team));

  // الفاحص: حدود الشاشة الثلاثة تنبيهات (design/ranking.md 3).
  const list = bank.lists[0];
  const run = l => checkContent({ index: { packs: ['general'] }, packs: { general: { 'pack.json': { id: 'general', name: 'الحزمة الثقافية العامة' }, 'ranking.json': { mode: 'ranking', lists: [l] } } }, wheel: undefined });
  const ok = run(list);
  const long = run({ ...list, title: 'أكثر التطبيقات تحميلاً في العالمم · الترتيب النهائي لموسم 2024–20255', items: list.items.map((x, i) => (i === 2 ? { ...x, name: 'جمهورية الدومينيكانن' + 'ن' } : x)) });
  check('الفاحص: القائمة التجريبية سليمة بلا تنبيه من حدود الشاشة', ok.errors.length === 0 && !ok.warnings.some(w => /الحد/.test(w)));
  check('الفاحص: العنوان فوق 32 وإشارته فوق 31 والاسم فوق 20 تنبيهات لا أخطاء', long.errors.length === 0
    && long.warnings.some(w => /العنوان قبل « · » 33/.test(w)) && long.warnings.some(w => /ما بعد « · » في العنوان 32/.test(w)) && long.warnings.some(w => /21 حرفاً، والحد 20/.test(w)));

  // تقاطع الترتيب والمزاد (تدقيق ش5 «ثالثاً»): بالبنك الحقيقي، الأزواج الثلاثة كما قاسها المدقّق، ولا يجتمع زوج في مباراة.
  const { clashes, CLASH_MIN } = await import(path.join(root, 'js/content-check.js'));
  const P = await import(path.join(root, 'js/play.js'));
  const auctionMode = (await import(path.join(root, 'js/modes/auction.js'))).default;
  const real = f => JSON.parse(fs.readFileSync(path.join(root, 'content/packs/general', f), 'utf8'));
  const realFiles = { 'ranking.json': real('ranking.json'), 'auction.json': real('auction.json') };
  // الأزواج مع المزاد في الدفعة الأولى (001–005)، والبنك يكبر فلا تُحصر.
  const pairs = clashes(realFiles).filter(c => c.mode === 'auction' && c.ranking <= 'general-ranking-005').map(c => `${c.ranking.slice(-3)}↔${c.with.slice(-3)}:${c.n}`).sort().join(',');
  check(`الأزواج المتقاطعة (7 فأكثر من 13): 001↔047 (12) و002↔055 (8) و004↔010 (13) (${pairs})`, CLASH_MIN === 7 && pairs === '001↔047:12,002↔055:8,004↔010:13');
  check('ما يُترك بعد موضوع مزاد متقاطع، وبعد قائمة متقاطعة', P.avoidIn(realFiles, ['general-auction-047']).join() === 'general-ranking-001'
    && P.avoidIn(realFiles, ['general-ranking-004', 'general-ranking-002']).sort().join() === 'general-auction-010,general-auction-055' && P.avoidIn(realFiles, ['general-auction-001']).length === 0);
  check('الترتيب بعد المزاد: لا تُختار القائمة المتقاطعة أبداً (200 مرة)', [...Array(200)].every(() =>
    !ranking.used(ranking.setup({ content: realFiles['ranking.json'], first: 1, avoid: ['general-ranking-001', 'general-ranking-004'], rng })).some(id => ['general-ranking-001', 'general-ranking-004'].includes(id))));
  check('المزاد بعد الترتيب: لا يُختار الموضوع المتقاطع أبداً (200 مرة)', [...Array(200)].every(() =>
    !auctionMode.used(auctionMode.setup({ content: realFiles['auction.json'], first: 1, avoid: ['general-auction-047', 'general-auction-010', 'general-auction-055'], rng })).some(id => ['general-auction-047', 'general-auction-010', 'general-auction-055'].includes(id))));
  check('إن لم يبقَ في المستوى غير المتروك اختير منه، فلا تقف الجولة', (() => {
    const one = { mode: 'ranking', lists: [bank.lists[0], bank.lists[1]] };
    return ranking.setup({ content: one, first: 1, avoid: [bank.lists[0].id], rng }).lists.length === 2;
  })());
  // جدول الاستبعاد الكامل للبنك كما في تدقيق ش5 «سادساً».
  const fullFiles = { ...realFiles, 'letter.json': real('letter.json'), 'last-two.json': real('last-two.json') };
  const all = clashes(fullFiles), short = id => id.slice(-3);
  const t1 = all.filter(c => c.mode === 'auction').map(c => `${short(c.ranking)}↔${short(c.with)}`).sort().join(',');
  const t2 = [...new Set(all.filter(c => c.mode === 'letter' || c.mode === 'last-two').map(c => short(c.ranking)))].sort().join(',');
  const t3 = all.filter(c => c.mode === 'ranking').map(c => `${short(c.ranking)}↔${short(c.with)}`).sort().join(',');
  check(`جدول «سادساً» (1): الترتيب والمزاد (${t1})`, t1 === '001↔047,002↔055,004↔010,006↔042,006↔048,007↔052,010↔065,015↔043,019↔017');
  check(`جدول «سادساً» (2): القوائم التي فيها إجابة سؤال (${t2})`, t2 === '011,012,013,014,016,017,018');
  check(`جدول «سادساً» (3): قائمتان تشتركان في 7 فأكثر (${t3})`, t3 === '005↔008,012↔018');
  check('القائمتان في الجولة لا تشتركان في 7 فأكثر (500 مرة بالبنك الحقيقي)', [...Array(500)].every(() => {
    const ids = ranking.used(ranking.setup({ content: realFiles['ranking.json'], first: 1, rng })).map(short).sort().join(',');
    return ids !== '005,008' && ids !== '012,018'; }));
  check('وتُختار القائمة المقابلة حين لا تتقاطع (005 تظهر مع غير 008)', [...Array(300)].some(() => ranking.used(ranking.setup({ content: realFiles['ranking.json'], first: 1, rng })).some(id => short(id) === '005')));

  // (2) سؤال حرف معيّن أو آخر حرفين تساوي إجابته (أو صيغتها) عنصراً من قائمة (تدقيق ش5 «رابعاً»): بالتسوية نفسها.
  const L = bank.lists[0];
  const qs = { 'letter.json': { questions: [{ id: 'q-hit', level: 'easy', letter: 'ا', answer: 'أرسنال' }, { id: 'q-alt', level: 'easy', letter: 'ب', answer: 'برج', alts: ['الإيفرتون'] }, { id: 'q-miss', level: 'easy', letter: 'ش', answer: 'شاحن' }] },
    'last-two.json': { questions: [{ id: 'q2-hit', level: 'hard', ending: 'ون', answer: 'بورنموث', alts: [] }] }, 'ranking.json': { lists: [L] } };
  const qp = clashes(qs).filter(c => c.mode !== 'auction').map(c => `${c.with}:${c.mode}`).sort().join(',');
  check(`سؤال تساوي إجابته أو صيغتها عنصراً (بالهمزة و«ال»): زوج، ولا زوج لغيره (${qp})`, qp === 'q-alt:letter,q-hit:letter,q2-hit:last-two');
  const letterMode = (await import(path.join(root, 'js/modes/letter.js'))).default;
  const realLetter = real('letter.json');
  const avoidQ = realLetter.questions.filter(q => !q.tiebreak && q.level === 'easy').slice(0, 5).map(q => q.id);
  check('الحرف المعيّن يترك الأسئلة المتروكة ما وُجد غيرها (200 مرة)', [...Array(200)].every(() =>
    !letterMode.used(letterMode.setup({ content: realLetter, first: 1, avoid: avoidQ, rng })).some(id => avoidQ.includes(id))));
  const lastTwoMode = (await import(path.join(root, 'js/modes/last-two.js'))).default;
  const realLT = real('last-two.json');
  const ending = realLT.questions[0].ending, avoidE = realLT.questions.filter(q => q.ending === ending).slice(0, 1).map(q => q.id);
  check('آخر حرفين: النهاية التي فيها سؤال متروك لا تُختار، والجولة بنهاية واحدة كاملة (100 مرة)', [...Array(100)].every(() => {
    const st = lastTwoMode.setup({ content: realLT, first: 1, avoid: avoidE, rng });
    return st.questions.length === 6 && new Set(st.questions.map(q => q.box)).size === 1 && !st.questions.some(q => avoidE.includes(q.id)); }));

  // في المباراة: المزاد أولاً بموضوعه المتقاطع، ثم الترتيب لا يختار قائمته.
  const M = await import(path.join(root, 'js/match.js'));
  const matchOf = () => ({ ...M.newMatch({ pack: 'general', method: 'short' }), step: 'face', picks: [{ mode: 'auction', by: 1 }, { mode: 'ranking', by: 2 }], winner: 1 });
  const onlyEasy = { ...realFiles['auction.json'], topics: realFiles['auction.json'].topics.filter(t => t.level !== 'easy' || t.id === 'general-auction-047') };
  const fixedFiles = { ...realFiles, 'auction.json': onlyEasy };
  let m = P.startNext(matchOf(), { modes: [auctionMode, ranking], content: fixedFiles, rng });
  check('المباراة تحفظ ما اختير فيها (used)', m.used.includes('general-auction-047') && m.used.length === 3);
  m = P.skipNext({ ...m, round: { ...m.round, state: { ...m.round.state, phase: 'end' } } }, [auctionMode, ranking]); // العجلة بينهما (ش6)
  m = P.startNext(m, { modes: [auctionMode, ranking], content: fixedFiles, rng });
  check('ثم الترتيب في المباراة نفسها: لا يختار «001» المتقاطعة مع «047»', m.round.mode === 'ranking' && !m.round.state.lists.some(l => l.id === 'general-ranking-001'));

  process.exit(finish() ? 0 : 1);
})();
