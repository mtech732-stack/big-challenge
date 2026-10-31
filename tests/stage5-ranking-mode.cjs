// اختبار آلي لوحدة «الترتيب» (js/modes/ranking.js) بالتحكيم المباشر (الوثيقة 5.6، 1.7، design/s8.md 3)، دون متصفح:
// قائمتان سهلة ثم صعبة، والعدّاد 15 ثانية، ونقر رقم الخانة يكشفها بنقاط رقمها ثم لحظة 1.2 ثانية والدور للخصم، والفخ يُخصم رقمه دون الصفر،
// و«خطأ» ثم لون الدور التالي، وانتهاء الوقت ينقل الدور، ونهاية القائمة بالعشرة أو «أنهِ القائمة» أو انقضاء دقيقتين ونصف.
// ولا اسم ولا مستوى على الجمهور قبل نهاية القائمة، والفخاخ ظاهرة الأرقام. وحدود الفاحص الثلاثة.
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

  // العقد والسجل: اكتملت الشريحة بالتدقيق الأخير، فانتقل من DRAFTS إلى MODES ويُلعب في الرابط العادي.
  check('الوحدة تلتزم «عقد الوحدة»', checkMode(ranking).length === 0);
  check('ملف أسئلته ranking.json، وترتيبه 4، واسمه «الترتيب»', ranking.contentKey === 'ranking.json' && ranking.order === 4 && ranking.name === 'الترتيب');
  check('في MODES لا في DRAFTS: يُختار في مباراة تُلعب', MODES.includes(ranking) && !DRAFTS.includes(ranking) && DRAFTS.length === 0);
  const files = { 'letter.json': {}, 'last-two.json': {}, 'auction.json': {}, 'ranking.json': twice };
  const pv = matchModes({ modes: [...MODES, ...DRAFTS], pack: { excludeModes: [] }, files });
  const normal = matchModes({ pack: { excludeModes: [] }, files });
  check('في الرابط العادي ورابط المعاينة: الترتيب مبنيّ في موضعه الرابع، ولا معاينة بعد اليوم', pv[3]?.id === 'ranking' && !pv[3].preview && normal[3]?.id === 'ranking' && !normal.some(m => m.preview));

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
  check('ظهور القائمة: الدور لمن بدأ، والعدّاد لم يبدأ، و«ابدأ» و«أنهِ القائمة»', s.phase === 'read' && a.turn === 2 && !round.timer
    && ranking.actions(s).map(x => x.label).join('|') === 'ابدأ|أنهِ القائمة');
  check('الجمهور: العنوان، و13 خانة بأرقامها بلا أسماء، والفخاخ 11–13 ظاهرة الأرقام (1.7)', a.screen === 'list' && a.title === bank.lists[0].title && a.n === 1 && a.count === 2
    && a.slots.length === 13 && a.slots.every((x, i) => x.rank === i + 1 && !x.name && !x.team) && a.slots.slice(10).every(x => x.trap) && !a.slots[9].trap);
  check('الجمهور: لا اسم من القائمة ولا صيغة ولا مستوى', leaks(a).length === 0 && !('level' in a));
  check('النقر قبل «ابدأ» لا يحكم', go('item:3').state.phase === 'read');
  go('start');
  check('«ابدأ»: عدّاد 15 ثانية لصاحب الدور، والخانات تُنقر', s.phase === 'ask' && round.timer?.seconds === ANSWER_SECONDS && a.turn === 2 && a.judge);
  check('في الإجابة: الخانة و«خطأ» و«أنهِ القائمة»', ranking.actions(s).map(x => x.id).join() === 'item,wrong,finish');

  // الإصابة: المركز 7 للثاني، ثم لحظة 1.2 ثانية والدور للأول تلقائياً.
  const { HIT_MS } = await import(path.join(root, 'js/modes/ranking.js'));
  let T = Date.now();
  const at = (action, t, id) => { round = R.act(ranking, round, action, id, t); s = round.state; a = ranking.audience(s); return round; };
  at('item:7', T);
  check('أصاب المركز 7: +7 للثاني، والخانة تنكشف باسمها ولونه، والعدّاد يقف', s.phase === 'hit' && round.scores[2] === 7 && a.verdict.team === 2 && a.verdict.points === 7 && a.verdict.rank === 7
    && a.slots[6].name === s.lists[0].items[6].name && a.slots[6].team === 2 && a.fresh === 7 && !round.timer && !a.judge);
  check('لحظة «صحيحة»، والحدّ عند من أصاب، ولا اسم غير المكشوف، ولا أزرار', round.events.some(e => e.type === 'moment' && e.name === 'right' && e.team === 2) && a.turn === 2
    && leaks(a).length === 1 && ranking.actions(s).length === 0);
  const pr = ranking.presenter(s);
  check('نص الباركود: العنوان والقائمة كلها (13) بصيغها، والفخاخ مُعلَّمة', pr.title === s.lists[0].title && pr.items.length === 13 && pr.items[10].trap && !pr.items[9].trap
    && pr.items[1].alts.length === 1 && s.lists[0].level === 'easy');
  check('«turn» قبل 1.2 ثانية يُهمل', at('turn', T + 100).state.phase === 'hit' && HIT_MS === 1200);
  at('turn', T + HIT_MS);
  check('بعد اللحظة: دور الأول، وعدّاده 15 ثانية، ولا حكم', s.phase === 'ask' && s.team === 1 && round.timer?.seconds === ANSWER_SECONDS && a.verdict === null && a.turn === 1);
  check('المكرر لا يُكشف ثانية', at('item:7', T + 2000).state.phase === 'ask' && round.scores[1] === 0);
  // الفخ ورصيد الأول صفر: لا خصم، والحكم 0، والخانة «−11» بلونه.
  at('item:11', T + 3000);
  check('الفخ برصيد صفر: الحكم بخصم 0 (ما خُصم فعلاً)، ولا حدث نقاط، ولحظة «فخ»', s.phase === 'hit' && a.verdict.team === 1 && a.verdict.points === 0 && a.verdict.rank === 11
    && round.scores[1] === 0 && round.events.some(e => e.type === 'moment' && e.name === 'trap' && e.team === 1 && e.rank === 11) && !round.events.some(e => e.type === 'score'));
  check('الفخ: الحدّ في المنتصف، وخانته باسمها ولون من وقع فيه، والفخان الآخران بأرقامهما بلا اسم', a.turn === 0 && a.slots[10].trap && a.slots[10].team === 1
    && a.slots[10].name === s.lists[0].items[10].name && a.fresh === 11 && a.slots[11].rank === 12 && !a.slots[11].name && !a.slots[12].name);
  // التراجع: لحظة الإصابة عابرة، فالتراجع من الدور التالي يعود إلى ما قبل الحكم (js/play.js).
  {
    const P = await import(path.join(root, 'js/play.js'));
    const after = R.act(ranking, round, 'turn', undefined, T + 5000);
    const m = P.undo({ step: 'play', round: after, scores: after.scores }, [ranking]);
    check('«تراجع» بعد انتقال الدور: يُرفع الفخ ويعود الدور لمن وقع فيه بعدّاده', m.round.state.phase === 'ask' && m.round.state.team === 1 && m.round.timer?.seconds === ANSWER_SECONDS
      && !m.round.state.got[0].some(g => g.rank === 11));
  }
  round = R.undo(round); s = round.state; a = ranking.audience(s);
  check('التراجع عن الفخ يعيد السؤال وعدّاده', s.phase === 'ask' && round.timer?.seconds === ANSWER_SECONDS && !s.got[0].some(g => g.rank === 11));
  check('رتبة خارج 1–13 أو بلا رقم تُهمل', go('item:0').state.phase === 'ask' && go('item:x').state.phase === 'ask' && go('item:14').state.phase === 'ask');
  // «خطأ»: صفر، ويقف العدّاد، ولون الدور التالي.
  go('wrong');
  check('«خطأ»: لا نقاط و«لم تُكشف خانة»، والحدّ في المنتصف، والعدّاد يقف، وزرّا لون الدور التالي', s.phase === 'wrong' && a.verdict.team === 0 && a.turn === 0 && !round.timer
    && ranking.actions(s).filter(x => x.id === 'turn').map(x => x.team).join() === '1,2' && round.events.some(e => e.name === 'none'));
  check('لون خاطئ يُهمل', go('turn:3').state.phase === 'wrong' && go('turn').state.phase === 'wrong');
  go('turn:1');
  check('اختار المقدّم لون من أخطأ نفسه: الدور له بعدّاده', s.phase === 'ask' && s.team === 1 && round.timer?.seconds === ANSWER_SECONDS);
  go('wrong'); go('turn:2');
  check('أو لون الخصم: الدور للثاني', s.phase === 'ask' && s.team === 2);
  // انتهى وقت الإجابة: إلى الخصم بعدّاده، بلا اختيار، ولحظة انتقال.
  go('timeout', round.timer.id);
  check('انتهى الوقت: الدور للخصم بعدّاد 15 ثانية، بلا حكم ولا نقاط، ولحظة «انتقال»', s.phase === 'ask' && s.team === 1 && round.timer?.seconds === ANSWER_SECONDS && !a.verdict
    && round.events.some(e => e.type === 'moment' && e.name === 'steal' && e.reason === 'timeout' && e.team === 1) && !JSON.stringify(a).includes('سرق'));

  // العشرة كلها: يُكشف ما بقي بالتناوب، ثم نهاية القائمة بنفسها بعد آخر لحظة.
  T = Date.now();
  for (const r of [1, 2, 3, 4, 5, 6, 8, 9, 10]) { at('item:' + r, T); at('turn', T + HIT_MS); T += 2000; }
  check('انكشفت العشرة: نهاية القائمة بعد اللحظة الأخيرة', s.phase === 'listend' && a.found === 10);
  const sum = round.scores[1] + round.scores[2];
  check('النقاط بقدر الرتب: 55 للعشرة', sum === 55);
  check('نهاية القائمة: القائمة كلها بأسمائها والفخاخ، و«كُشف 10 من 10»، والحدّ في المنتصف', a.slots.every(x => x.name) && a.found === 10 && a.of === 10 && a.turn === 0 && !a.verdict);
  check('نهاية القائمة الأولى: «القائمة 2»', ranking.actions(s).map(x => x.label).join() === 'القائمة 2');
  // القائمة الثانية (الصعبة): تظهر مباشرة، ويبدأها الفريق الآخر.
  go('next');
  check('القائمة الثانية: تظهر مباشرة بعنوانها، و«القائمة 2 من 2»، والدور للآخر (بدأ الثاني الأولى)', s.phase === 'read' && s.index === 1 && a.n === 2 && a.title === s.lists[1].title
    && s.team === 1 && a.turn === 1 && s.lists[1].level === 'hard' && a.slots.every(x => !x.name && !x.team) && !round.timer && a.listClock && !a.listEnds);
  check('القائمة الثانية: بدأ كلاً منهما فريق (الثاني ثم الأول)', s.starts.join() === '2,1');
  const s1 = round.scores[1];
  go('start'); go('item:10');
  check('القائمة الثانية تُلعب كالأولى: +10 للأول', round.scores[1] === s1 + 10 && s.got[1].length === 1 && a.found === 1);
  check('ولا زر في لحظة الإصابة', ranking.actions(s).length === 0 && go('finish').state.phase === 'hit');
  at('turn', Date.now() + HIT_MS); go('finish');
  check('«أنهِ القائمة» في الإجابة: تنتهي، و«إنهاء الجولة»', s.phase === 'listend' && ranking.actions(s).map(x => x.label).join() === 'إنهاء الجولة');
  go('next');
  check('نهاية الجولة: حصيلتا الفريقين في القائمتين', s.phase === 'end' && ranking.finished(s) && a.screen === 'end' && a.totals[1] + a.totals[2] === 65);

  // وقت القائمة (5.6): دقيقتان ونصف من «ابدأ» بلا توقف، فإن انقضت انتهت القائمة. والمشغّل يمرّر ساعة الجهاز.
  {
    const { LIST_SECONDS } = await import(path.join(root, 'js/modes/ranking.js'));
    const T = 1_000_000;
    let r = R.startRound(ranking, { content, first: 1, rng });
    const run = (x, id, at = T) => (r = R.act(ranking, r, x, id, at));
    run('show');
    let a = ranking.audience(r.state);
    check('وقت القائمة دقيقتان ونصف، ثابت قبل «ابدأ»', LIST_SECONDS === 150 && a.listClock && !a.listEnds && a.listSeconds === 150);
    run('start');
    a = ranking.audience(r.state);
    check('«ابدأ»: وقت القائمة يجري حتى دقيقتين ونصف من الآن', r.state.listEnds === T + 150000 && a.listEnds === T + 150000);
    check('«انتهى وقت القائمة» قبل وقته يُهمل', run('timeup', undefined, T + 100000).state.phase === 'ask');
    run('item:4', undefined, T + 30000); run('turn', undefined, T + 32000);
    check('ولا يقف بين الإجابتين ولا بعد الحكم', r.state.listEnds === T + 150000);
    run('timeup', undefined, T + 150000);
    a = ranking.audience(r.state);
    check('انقضى وقت القائمة في العدّاد: تنتهي القائمة وتنكشف، ويقف العدّاد، ووقتها يُخفى', r.state.phase === 'listend' && r.state.timeup && a.timeup && !r.timer && a.slots.every(x => x.name)
      && !a.listClock && !a.listEnds && a.found === 1);
    r = R.undo(r);
    check('التراجع عن انقضاء الوقت يعيد العدّاد', r.state.phase === 'ask' && !r.state.timeup && r.timer?.seconds === ANSWER_SECONDS);
    run('wrong', undefined, T + 149000);
    check('وبعد «خطأ»: ينهيها انقضاء الوقت', r.state.phase === 'wrong' && run('timeup', undefined, T + 150500).state.phase === 'listend');
    run('next', undefined, T + 160000);
    check('القائمة الثانية بعد انقضاء وقت الأولى: وقتها لم يبدأ، ويبدأها الآخر', r.state.index === 1 && r.state.phase === 'read' && !r.state.listEnds && !r.state.timeup && r.state.team === 2);
    run('start', undefined, T + 170000);
    check('وقت القائمة الثانية من «ابدأ» نفسها', r.state.listEnds === T + 320000);
    run('item:3', undefined, T + 319000);
    check('وفي لحظة الإصابة: ينهيها انقضاء الوقت، و«إنهاء الجولة»', run('timeup', undefined, T + 320000).state.phase === 'listend' && ranking.audience(r.state).timeup
      && ranking.actions(r.state)[0].label === 'إنهاء الجولة');
  }

  // الفخاخ بخصمها: −11 و−12 و−13، ولا ينزل الرصيد تحت الصفر، والحكم بما خُصم فعلاً (design/ranking.md 7.7).
  {
    const PEN = (await import(path.join(root, 'js/modes/ranking.js'))).PENALTY;
    check('خصم الفخاخ: 11 ← 11 · 12 ← 12 · 13 ← 13', PEN[11] === 11 && PEN[12] === 12 && PEN[13] === 13);
    let T = Date.now();
    let r = R.startRound(ranking, { content, first: 1, rng });
    const run = (x, id) => { r = R.act(ranking, r, x, id, T); T += 2000; return r; };
    run('show'); run('start');
    r = R.setScore(r, 1, 1); r = R.setScore(r, 2, 20);
    run('item:11');
    let v = r.state.verdict;
    check('فخ 11 ورصيده 1: نزل إلى 0، والحكم «−1» لا «−11»', r.scores[1] === 0 && v.points === -1 && v.rank === 11 && r.state.got[0][0].points === -1
      && r.events.some(e => e.type === 'score' && e.team === 1 && e.points === -1));
    run('turn');
    check('الفخ لا يكشف خانة من العشر، ولا يُنهي القائمة', ranking.audience(r.state).found === 0 && r.state.phase === 'ask' && r.state.team === 2);
    run('item:12');
    v = r.state.verdict;
    check('فخ 12 ورصيده 20: −12، فصار 8', r.scores[2] === 8 && v.points === -12 && v.team === 2);
    const sl = ranking.audience(r.state).slots;
    check('الفخ بلون من وقع فيه', sl[10].team === 1 && sl[11].team === 2 && !sl[12].team);
    run('turn');
    check('الفخ لا يُنقر ثانية (المكرر خطأ)', run('item:12').state.phase === 'ask');
    run('item:13');
    check('فخ 13 ورصيده 0: لا خصم، والحكم 0', r.scores[1] === 0 && r.state.verdict.points === 0 && r.state.verdict.rank === 13);
    run('turn'); run('finish'); run('next'); run('finish'); run('next');
    const t = ranking.audience(r.state);
    check('حصيلة الجولة بما خُصم: الأول −1 والثاني −12', ranking.finished(r.state) && t.totals[1] === -1 && t.totals[2] === -12);
  }

  // حالات محفوظة قبل ش8 (سرقة وحكم ومقارنة) تُقرأ بما يقابلها، فلا تعلق مباراة جارية.
  {
    let r = R.startRound(ranking, { content, first: 1, rng });
    r = R.act(ranking, r, 'show'); r = R.act(ranking, r, 'start');
    const old = ph => ({ ...r.state, phase: ph });
    check('حال «steal» القديمة: إجابة تُنقر', ranking.actions(old('steal')).map(x => x.id).join() === 'item,wrong,finish');
    check('وحال «decided» تنتقل بالدور، و«mark» تختار اللون', ranking.act(old('decided'), 'turn', {}, Date.now()).state.phase === 'ask'
      && ranking.actions(old('mark')).some(x => x.id === 'turn'));
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

  // تقاطع الترتيب وغيره بالبنك الحقيقي (تدقيق ش5 «ثالثاً» و«سادساً»). الأزواج تُقرأ من البنك نفسه، فلا يعود الاختبار
  // إلى الإخفاق كلما استُبدلت قائمة (#217)، وتُقاس كل جهة مستقلة عن clashes() ثم يُختبر أن اللعبة لا تجمع زوجاً.
  const { clashes, CLASH_MIN, sharedItems, fold } = await import(path.join(root, 'js/content-check.js'));
  const P = await import(path.join(root, 'js/play.js'));
  const auctionMode = (await import(path.join(root, 'js/modes/auction.js'))).default;
  const real = f => JSON.parse(fs.readFileSync(path.join(root, 'content/packs/general', f), 'utf8'));
  const realFiles = { 'ranking.json': real('ranking.json'), 'auction.json': real('auction.json') };
  const fullFiles = { ...realFiles, 'letter.json': real('letter.json'), 'last-two.json': real('last-two.json') };
  const lists = realFiles['ranking.json'].lists, topics = realFiles['auction.json'].topics;
  const all = clashes(fullFiles), short = id => id.slice(-3);
  const key = (a, b) => `${a}↔${b}`;
  const reported = mode => all.filter(c => c.mode === mode).map(c => key(c.ranking, c.with)).sort();
  // (1) الترتيب والمزاد، و(3) قائمتان: كل زوج يشترك في 7 فأكثر، بعدّ مستقل لكل قائمة مع كل موضوع وكل قائمة أخرى.
  const brute = (pairsOf, mode) => pairsOf.filter(([a, b]) => sharedItems(a, b) >= CLASH_MIN).map(([a, b]) => key(a.id, b.id)).sort();
  const withAuction = brute(lists.flatMap(l => topics.map(t => [l, t])));
  const withRanking = brute(lists.flatMap((l, i) => lists.slice(i + 1).map(o => [l, o])));
  const auctionPairs = all.filter(c => c.mode === 'auction'), rankingPairs = all.filter(c => c.mode === 'ranking');
  check(`جدول «سادساً» (1): الترتيب والمزاد كما يُعدّ من البنك، وكل زوج 7 فأكثر (${reported('auction').map(x => x.replace(/general-\w+-/g, '')).join(',')})`,
    CLASH_MIN === 7 && auctionPairs.length > 0 && auctionPairs.every(c => c.n >= CLASH_MIN) && reported('auction').join() === withAuction.join());
  check(`جدول «سادساً» (3): قائمتان تشتركان في 7 فأكثر كما يُعدّ من البنك (${reported('ranking').map(x => x.replace(/general-\w+-/g, '')).join(',')})`,
    rankingPairs.length > 0 && rankingPairs.every(c => c.n >= CLASH_MIN) && reported('ranking').join() === withRanking.join());
  // وعدد ما اشترك فيه كل زوج كما يُعدّ مستقلاً (والأزواج بأعدادها في الاسم). لا يعتمد على رقم قائمة بعينها.
  const byId = id => lists.find(l => l.id === id) ?? topics.find(t => t.id === id);
  const pairsText = [...auctionPairs, ...rankingPairs].map(c => `${short(c.ranking)}↔${short(c.with)}:${c.n}`).sort().join(',');
  check(`الأزواج المتقاطعة بعدد ما اشتركا فيه من 13 (${pairsText})`, auctionPairs.length > 0 && [...auctionPairs, ...rankingPairs].every(c => c.n === sharedItems(byId(c.ranking), byId(c.with))));
  // (2) سؤال تساوي إجابته أو صيغتها عنصراً بالتطابق التام بعد التوحيد: لا يفوت الفاحص منها شيئاً.
  const exact = [];
  for (const mode of ['letter', 'last-two']) for (const q of fullFiles[`${mode}.json`].questions) for (const l of lists) {
    const pool = new Set(l.items.flatMap(it => [it.name, ...(it.alts ?? [])]).map(fold));
    if ([q.answer, ...(q.alts ?? [])].some(f => pool.has(fold(f)))) exact.push(key(l.id, q.id));
  }
  const qPairs = all.filter(c => c.mode === 'letter' || c.mode === 'last-two').map(c => key(c.ranking, c.with));
  check(`جدول «سادساً» (2): كل سؤال تطابق إجابته عنصراً معدود (${[...new Set(all.filter(c => c.mode === 'letter' || c.mode === 'last-two').map(c => short(c.ranking)))].sort().join(',')})`,
    exact.length > 0 && exact.every(x => qPairs.includes(x)));
  // ما يُترك: بعد كل موضوع مزاد متقاطع قوائمه، وبعد كل قائمة متقاطعة مواضيعها، ولا شيء بعد موضوع لا يتقاطع.
  const free = topics.find(t => !auctionPairs.some(c => c.with === t.id));
  check(`ما يُترك بعد موضوع مزاد متقاطع، وبعد قائمة متقاطعة (${auctionPairs.length} زوجاً)`, auctionPairs.every(c => P.avoidIn(realFiles, [c.with]).includes(c.ranking) && P.avoidIn(realFiles, [c.ranking]).includes(c.with))
    && !!free && P.avoidIn(realFiles, [free.id]).length === 0);
  const avoidR = [...new Set(auctionPairs.map(c => c.ranking))], avoidA = [...new Set(auctionPairs.map(c => c.with))];
  check('الترتيب بعد المزاد: لا تُختار القائمة المتقاطعة أبداً (200 مرة)', [...Array(200)].every(() =>
    !ranking.used(ranking.setup({ content: realFiles['ranking.json'], first: 1, avoid: avoidR, rng })).some(id => avoidR.includes(id))));
  check('المزاد بعد الترتيب: لا يُختار الموضوع المتقاطع أبداً (200 مرة)', [...Array(200)].every(() =>
    !auctionMode.used(auctionMode.setup({ content: realFiles['auction.json'], first: 1, avoid: avoidA, rng })).some(id => avoidA.includes(id))));
  check('إن لم يبقَ في المستوى غير المتروك اختير منه، فلا تقف الجولة', (() => {
    const one = { mode: 'ranking', lists: [bank.lists[0], bank.lists[1]] };
    return ranking.setup({ content: one, first: 1, avoid: [bank.lists[0].id], rng }).lists.length === 2;
  })());
  const clashing = new Set(rankingPairs.map(c => key(c.ranking, c.with)));
  check(`القائمتان في الجولة لا تشتركان في 7 فأكثر (500 مرة بالبنك الحقيقي، ${clashing.size} زوجاً)`, [...Array(500)].every(() => {
    const [a, b] = ranking.used(ranking.setup({ content: realFiles['ranking.json'], first: 1, rng }));
    return !clashing.has(key(a, b)) && !clashing.has(key(b, a)); }));
  const pairEasy = rankingPairs.map(c => [c.ranking, c.with].find(id => lists.find(l => l.id === id).level === 'easy')).find(Boolean);
  check(`وتُختار القائمة المتقاطعة حين لا تتقاطع مع الأخرى (${short(pairEasy ?? '')} تظهر)`, !!pairEasy && [...Array(300)].some(() => ranking.used(ranking.setup({ content: realFiles['ranking.json'], first: 1, rng })).includes(pairEasy)));

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
  // الموضوع: أول موضوع متقاطع مع قائمة في البنك نفسه (لا اسم ثابت)، وحده في مستواه فيُختار حتماً.
  const clash = auctionPairs[0], topic = byId(clash.with);
  const crossed = auctionPairs.filter(c => c.with === topic.id).map(c => c.ranking);
  const onlyOne = { ...realFiles['auction.json'], topics: realFiles['auction.json'].topics.filter(t => t.level !== topic.level || t.id === topic.id) };
  const fixedFiles = { ...realFiles, 'auction.json': onlyOne };
  let m = P.startNext(matchOf(), { modes: [auctionMode, ranking], content: fixedFiles, rng });
  check(`المباراة تحفظ ما اختير فيها (used، «${short(topic.id)}»)`, m.used.includes(topic.id) && m.used.length === 3);
  m = P.skipNext({ ...m, round: { ...m.round, state: { ...m.round.state, phase: 'end' } } }, [auctionMode, ranking]); // العجلة بينهما (ش6)
  m = P.startNext(m, { modes: [auctionMode, ranking], content: fixedFiles, rng });
  check(`ثم الترتيب في المباراة نفسها: لا يختار ما يتقاطع مع «${short(topic.id)}» (${crossed.map(short).join('، ')})`, m.round.mode === 'ranking' && crossed.length > 0
    && !m.round.state.lists.some(l => crossed.includes(l.id)));

  process.exit(finish() ? 0 : 1);
})();
