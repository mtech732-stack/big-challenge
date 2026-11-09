// اختبار آلي لوحدة «آخر حرفين» (js/modes/last-two.js) على جولة الكلمة المشتركة (js/modes/word.js)، دون متصفح.
const fs = require('fs');
const path = require('path');
const { reporter } = require('./helpers.cjs');

(async () => {
  const root = path.join(__dirname, '..');
  const lastTwo = (await import(path.join(root, 'js/modes/last-two.js'))).default;
  const letter = (await import(path.join(root, 'js/modes/letter.js'))).default;
  const { checkMode } = await import(path.join(root, 'js/modes/contract.js'));
  const { MODES, matchModes, pickableModes } = await import(path.join(root, 'js/modes/index.js'));
  const R = await import(path.join(root, 'js/round.js'));
  const M = await import(path.join(root, 'js/match.js'));
  const P = await import(path.join(root, 'js/play.js'));
  const { check, finish } = reporter();
  const read = f => JSON.parse(fs.readFileSync(path.join(root, 'content/packs/general', f), 'utf8'));
  const bank = read('last-two.json');
  const content = { 'letter.json': read('letter.json'), 'last-two.json': bank };
  let seed = 7;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ids = list => list.map(a => a.id).join(',');

  // العقد والسجل.
  check('الوحدة تلتزم «عقد الوحدة»', checkMode(lastTwo).length === 0);
  check('«آخر حرفين» في السجل بعد «الحرف المعيّن»، وملف أسئلته last-two.json', MODES[1] === lastTwo && lastTwo.order === 2 && lastTwo.contentKey === 'last-two.json');
  const listed = matchModes({ pack: { excludeModes: [] }, files: content });
  check('قائمة الاختيار تبنيه من ملفه: مبنيّ لا معاينة', listed[1].id === 'last-two' && !listed[1].preview && listed.slice(2).every(m => m.preview));
  check('بلا ملف أسئلة لا يظهر للاختيار', !pickableModes({ pack: { excludeModes: [] }, files: { 'letter.json': content['letter.json'] } }).some(m => m.id === 'last-two'));
  check('حزمة تستثنيه لا يظهر فيها', !matchModes({ pack: { excludeModes: ['last-two'] }, files: content }).some(m => m.id === 'last-two'));

  // الإعداد: 6 أسئلة، سهل ثم متوسط ثم صعب، لكل فريق 3 بالتناوب.
  const s0 = lastTwo.setup({ content: bank, first: 2, seen: [], rng });
  check('6 أسئلة', s0.questions.length === 6);
  check('المستويات: سهل سهل متوسط متوسط صعب صعب', s0.questions.map(q => q.level).join(',') === 'easy,easy,medium,medium,hard,hard');
  check('صاحب السؤال بالتناوب، ويبدأ من اختير (الثاني هنا)', s0.questions.map(q => q.owner).join(',') === '2,1,2,1,2,1');
  check('لا سؤال مكرر', new Set(s0.questions.map(q => q.id)).size === 6);
  check('المربع: الحرفان من الملف كما هما، دون تطويل', s0.questions.every(q => q.box === bank.questions.find(b => b.id === q.id).ending));

  // الإصدار 1.1: الجولة كلها بنهاية واحدة، والنهاية الأقل ظهوراً أولاً.
  let mixed = 0;
  for (let i = 0; i < 200; i++) if (new Set(lastTwo.setup({ content: bank, first: 1, seen: [], rng }).questions.map(q => q.box)).size !== 1) mixed++;
  check(`كل الجولة بنهاية واحدة (${200 - mixed} من 200)`, mixed === 0);
  const groups = new Set(bank.questions.map(q => q.ending));
  let rotSeen = [];
  const rot = [];
  for (let i = 0; i < groups.size; i++) {
    const s = lastTwo.setup({ content: bank, first: 1, seen: rotSeen, rng });
    rot.push(s.questions[0].box);
    rotSeen = [...rotSeen, ...s.questions.map(q => q.id)];
  }
  check(`مباريات متتالية: كل جولة بنهاية جديدة حتى تنفد (${new Set(rot).size} من ${groups.size})`, new Set(rot).size === groups.size);
  // ذاكرة الأسئلة أسبق من تجنّب التكرار (ش8-أ/72: القاعدة لا العدد 6): ما دامت في البنك جولة نظيفة (fresh ≥ 1) فالجولة كلها
  // مما لم يظهر، بنهاية واحدة. والذاكرة كما يحفظها المشغّل (remember، دورة جديدة حين لا تبقى جولة نظيفة).
  const play = (b, rounds) => {
    let seen = [], mixed = 0, clean = 0, oneBox = 0;
    const left = [];
    for (let i = 0; i < rounds; i++) {
      const before = lastTwo.fresh(b, seen);
      left.push(before);
      const s = lastTwo.setup({ content: b, first: 1, seen, rng });
      const fresh = s.questions.filter(q => !seen.includes(q.id)).length;
      if (before >= 1 && fresh !== s.questions.length) mixed++;
      if (fresh === s.questions.length) clean++;
      if (new Set(s.questions.map(q => q.box)).size === 1 && s.questions.length === 6) oneBox++;
      seen = R.remember(seen, lastTwo, b, s.questions.map(q => q.id));
    }
    return { mixed, clean, oneBox, left };
  };
  {
    const r = play(bank, 60);
    check(`وذاكرة الأسئلة أسبق من تجنّب التكرار: 60 جولة بالبنك الحالي، كلها نظيفة بنهاية واحدة (${r.clean} · ${r.oneBox})`, r.mixed === 0 && r.clean === 60 && r.oneBox === 60);
  }
  // بنك 3/3/3 لكل نهاية (دفعة 9 نوفمبر، #412): بعد أن تُستعمل النهاية يبقى فيها سؤال لكل مستوى، لا يكفي جولة بنهايتها.
  const triple = { ...bank, questions: [...new Set(bank.questions.map(q => q.ending))].slice(0, 10).flatMap((e, g) => ['easy', 'medium', 'hard']
    .flatMap(l => [0, 1, 2].map(k => ({ ...bank.questions.find(q => q.ending === e && q.level === l), id: `t-${g}-${l}-${k}` })))) };
  {
    // ش8-أ/74: نهايات بأربعة لكل مستوى (#421): في كل نهاية جولتان، فالسطر 20 ثم 10 بعد عشر جولات، والدورة بعد العشرين.
    const quad = { ...bank, questions: [...new Set(bank.questions.map(q => q.ending))].slice(0, 10).flatMap((e, g) => ['easy', 'medium', 'hard']
      .flatMap(l => [0, 1, 2, 3].map(k => ({ ...bank.questions.find(q => q.ending === e && q.level === l), id: `q-${g}-${l}-${k}` })))) };
    const r = play(quad, 50);
    check(`بنك 4/4/4 (120): السطر 20 بلا ذاكرة، و10 بعد عشر جولات، ثم دورة بعد العشرين (${r.left.slice(0, 22).join('،')})`,
      r.left[0] === 20 && r.left[10] === 10 && r.left[19] === 1 && r.left[20] === 19 && !r.left.includes(0));
    check(`و50 جولة به بلا خلط، كلها نظيفة بنهاية واحدة (${r.clean})`, r.mixed === 0 && r.clean === 50 && r.oneBox === 50);
  }
  {
    const r = play(triple, 40);
    check(`بنك 3/3/3 (90): 40 جولة حتى النفاد وما بعده بلا خلط، كلها نظيفة بنهاية واحدة (${r.clean})`, r.mixed === 0 && r.clean === 40 && r.oneBox === 40);
    check(`والسطر صادق: عشر جولات في الدورة الأولى ثم تسع في كل دورة بعدها (${r.left.slice(0, 21).join('،')})`,
      r.left.slice(0, 10).join() === '10,9,8,7,6,5,4,3,2,1' && r.left.slice(10, 19).join() === '9,8,7,6,5,4,3,2,1' && !r.left.includes(0));
  }
  const same = { questions: ['easy', 'easy', 'medium', 'medium', 'hard', 'hard'].map((level, i) => ({ id: `x-${i}`, level, ending: 'ان', prompt: 'س', answer: 'فنجان' })) };
  check('إن لم يكن بدّ من التكرار: تكتمل الجولة بستة أسئلة', lastTwo.setup({ content: same, first: 1, rng }).questions.length === 6);

  // ذاكرة الأسئلة: ما لم يظهر أولاً.
  const seenEasy = bank.questions.filter(q => q.level === 'easy').map(q => q.id).slice(0, -2);
  const s1 = lastTwo.setup({ content: bank, first: 1, seen: seenEasy, rng });
  check('ذاكرة الأسئلة: السهلان مما لم يظهر', s1.questions.filter(q => q.level === 'easy').every(q => !seenEasy.includes(q.id)));

  // الافتتاح والسؤال والعدّاد.
  const start = first => R.startRound(lastTwo, { content, scores: { 1: 0, 2: 0 }, first, rng });
  let r = start(1);
  let a = lastTwo.audience(r.state);
  check('الافتتاح: «كل إجابات الجولة تنتهي بـ «…»» بنهاية الجولة، ولا سطر تفاصيل', a.rule === `كل إجابات الجولة تنتهي بـ «ـ${r.state.questions[0].box}»` && a.sub === undefined);
  r = R.act(lastTwo, r, 'show');
  a = lastTwo.audience(r.state);
  const q = r.state.questions[0];
  check('السؤال: الحرفان مع علامة التطويل، والوصف، ولا مستوى على الجمهور', a.letter === q.box && a.tatweel === true && a.question === q.prompt && a.levelText === undefined && a.level === undefined);
  check('ظهور السؤال: وقته 30، وعدّاد التمهيد 5 ثوانٍ يبدأ وحده (1.11)', lastTwo.seconds === 30 && a.clock === 5 && a.lead && r.timer?.seconds === 5 && r.timer.lead);
  check('الأفعال: «إيقاف مؤقت» و«وقت الخصم» و«كشف الإجابة»', ids(lastTwo.actions(r.state)) === 'pause,steal,reveal');
  check('الجمهور: لا إجابة قبل الكشف', a.answer === undefined);
  r = R.act(lastTwo, r, 'timeout', r.timer.id);
  check('بعد التمهيد: عدّاد 30 ثانية', r.timer?.seconds === 30 && !r.timer.lead && r.events.some(e => e.type === 'timer' && e.seconds === 30));

  // الكشف ثم الاختيار والنقاط.
  const pick = (x, t) => R.act(lastTwo, R.act(lastTwo, x, 'reveal'), `pick:${t}`);
  r = R.act(lastTwo, r, 'reveal');
  check('«كشف الإجابة»: الإجابة النموذجية للجمهور، ولا عدّاد', lastTwo.audience(r.state).answer === q.answer && r.timer === null);
  r = R.act(lastTwo, r, 'pick:1');
  check('اختيار صاحب السؤال: +3 له، والحكم', r.scores[1] === 3 && lastTwo.audience(r.state).verdict?.team === 1 && r.timer === null);
  r = pick(R.act(lastTwo, r, 'next'), 2);
  r = R.act(lastTwo, R.act(lastTwo, r, 'next'), 'reveal');
  check('السؤال 3 متوسط: «+6»', lastTwo.actions(r.state).find(x => x.id === 'pick').label === '+6');
  r = R.undo(r);

  // وقت الخصم بالزر، بعد الخطأ وبعد انتهاء الوقت.
  r = R.act(lastTwo, r, 'steal');
  a = lastTwo.audience(r.state);
  check('«وقت الخصم»: للخصم في 10 ثوانٍ', a.phase === 'steal' && a.turn === 2 && a.clock === 10 && r.timer?.seconds === 10 && a.steal.reason === 'wrong');
  const before = r.scores[2];
  r = pick(r, 2);
  check('إصابة الخصم: النقاط نفسها (+6)', r.scores[2] === before + 6);
  r = R.undo(r);
  check('التراجع: الإجابة مكشوفة والرصيد كما كان', r.state.phase === 'revealed' && r.scores[2] === before);
  r = R.act(lastTwo, r, 'pick:0');
  check('«لم يُجب أحد»: لا نقاط', lastTwo.audience(r.state).verdict?.team === 0 && r.scores[2] === before);
  r = R.act(lastTwo, r, 'next');
  r = R.act(lastTwo, r, 'timeout', r.timer.id);
  r = R.act(lastTwo, r, 'timeout', r.timer.id);
  check('انتهى وقت صاحب السؤال: ينتظر الزر، ولا انتقال', r.state.phase === 'over' && !r.state.steal && r.timer === null);
  r = R.act(lastTwo, r, 'steal');
  check('ثم «وقت الخصم»: «بعد انتهاء الوقت»', r.state.phase === 'steal' && r.state.steal.reason === 'timeout');

  // لا إجابة على الجمهور في أي حالة.
  let states = 0, leaks = 0;
  for (let k = 0; k < 6; k++) {
    let x = start(k % 2 ? 1 : 2);
    while (!lastTwo.finished(x.state)) {
      const aud = JSON.stringify(lastTwo.audience(x.state));
      const cur = x.state.questions[x.state.index];
      states++;
      // بعد الكشف تظهر الإجابة النموذجية وحدها (1.11)، ولا بدائل أبداً.
      const decided = x.state.phase === 'decided' || x.state.phase === 'revealed';
      if (/"alts"/.test(aud) || (!decided && /"answer"/.test(aud)) || (x.state.phase !== 'intro' && (decided ? cur.alts : [cur.answer, ...cur.alts]).some(w => aud.includes(`"${w}"`)))) leaks++;
      if (decided && lastTwo.audience(x.state).answer !== cur.answer) leaks++;
      const act = lastTwo.actions(x.state).map(b => b.id);
      x = act.includes('next') || act.includes('show') ? R.act(lastTwo, x, act[0]) : act.includes('pick') ? R.act(lastTwo, x, `pick:${states % 3}`)
        : x.timer && states % 2 ? R.act(lastTwo, x, 'timeout', x.timer.id) : R.act(lastTwo, x, act.includes('steal') && states % 3 ? 'steal' : 'reveal');
    }
  }
  check(`الجمهور: لا إجابة في ${states} حالة`, leaks === 0);

  // الحرف المعيّن على جولة الكلمة نفسها، بفروقه.
  let l = R.act(letter, R.startRound(letter, { content, first: 1, rng }), 'show');
  const la = letter.audience(l.state);
  check('الحرف المعيّن باقٍ: 30 ثانية، وحرف بلا تطويل', letter.seconds === 30 && la.lead && !la.tatweel && [...la.letter].length === 1);
  check('حالة محفوظة قبل ش3 (letter بدل box) تُعرض', letter.audience({ ...l.state, questions: l.state.questions.map(({ box, ...x }) => ({ ...x, letter: box })) }).letter === la.letter);

  // تتابع المباراة: الجولة 1 «آخر حرفين» ← العجلة (تُتخطى) ← الجولة 2 «الحرف المعيّن» ← النهائية.
  let m = { ...M.newMatch({ pack: 'general', method: 'short' }), step: 'face', teams: { 1: 'الصقور', 2: 'النجوم' }, winner: 1,
    picks: [{ mode: 'last-two', by: 1 }, { mode: 'letter', by: 2 }] };
  const name = id => MODES.find(x => x.id === id).name;
  m = P.startNext(m, { modes: MODES, content, seen: [], rng });
  check('بدء الجولة 1 لآخر حرفين', m.step === 'play' && m.round.mode === 'last-two' && m.round.n === 1);
  while (!lastTwo.finished(m.round.state)) {
    const act = lastTwo.actions(m.round.state).map(b => b.id);
    m = P.act(m, MODES, act.includes('next') ? 'next' : act.includes('show') ? 'show' : act.includes('pick') ? `pick:${m.round.state.questions[m.round.state.index].owner}` : 'reveal');
  }
  check('بعد الجولة: الحصيلة 18 لكل فريق (3+6+9)', lastTwo.audience(m.round.state).totals[1] === 18 && lastTwo.audience(m.round.state).totals[2] === 18);
  check('«التالي: شريط البونص»', P.nextText(m, name) === 'التالي: شريط البونص' && P.nextKind(m, MODES) === 'skip');
  m = P.skipNext(m, MODES);
  check('ثم «التالي: الجولة 2 · الحرف المعيّن» وتبدأ', P.nextText(m, name) === 'التالي: الجولة 2 · الحرف المعيّن' && P.nextKind(m, MODES) === 'start');
  m = P.startNext(m, { modes: MODES, content, seen: [], rng });
  check('الجولة 2 للحرف المعيّن، والرصيد من الجولة 1', m.round.mode === 'letter' && m.round.n === 2 && m.scores[1] === 18 && m.scores[2] === 18);
  check('حالة المباراة تُحفظ JSON وتُقرأ سليمة', M.isMatch(JSON.parse(JSON.stringify(m))));

  process.exit(finish() ? 0 : 1);
})();
