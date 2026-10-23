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
  let forced = 0, seen = [];
  for (let i = 0; i < 60; i++) {
    const s = lastTwo.setup({ content: bank, first: 1, seen, rng });
    const fresh = s.questions.filter(q => !seen.includes(q.id)).length;
    if (fresh !== Math.min(6, s.questions.length) && bank.questions.filter(q => !seen.includes(q.id)).length >= 6) forced++;
    seen = [...seen, ...s.questions.map(q => q.id)];
    if (seen.length >= bank.questions.length) seen = [];
  }
  check('وذاكرة الأسئلة أسبق من تجنّب التكرار', forced === 0);
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
  check('الافتتاح عند المقدّم: سطر القاعدة بـ 20 ثانية', lastTwo.presenter(r.state).brief.includes('20 ثانية للسؤال'));
  r = R.act(lastTwo, r, 'show');
  a = lastTwo.audience(r.state);
  const q = r.state.questions[0];
  check('السؤال: الحرفان مع علامة التطويل، والوصف، ولا مستوى على الجمهور', a.letter === q.box && a.tatweel === true && a.question === q.prompt && a.levelText === undefined && a.level === undefined);
  check('قبل «ابدأ»: العدّاد ثابت 0:20', a.clock === 20 && r.timer === null);
  check('قبل «ابدأ»: «ابدأ العدّاد» وزرا الحكم', ids(lastTwo.actions(r.state)) === 'start,correct,wrong');
  const pr = lastTwo.presenter(r.state);
  check('المقدّم: الإجابة النموذجية، وسطر القبول بالحرفين والوصف', pr.answer === q.answer && pr.accept === `وتُقبل أي كلمة أخرى تنتهي بـ «ـ${q.box}» وتنطبق على الوصف.`);
  r = R.act(lastTwo, r, 'start');
  check('«ابدأ»: عدّاد 20 ثانية', r.timer?.seconds === 20 && r.events.some(e => e.type === 'timer' && e.seconds === 20));

  // الحكم والنقاط.
  r = R.act(lastTwo, r, 'correct');
  check('صحيحة: +1 لصاحب السؤال، والحكم بدل العدّاد', r.scores[1] === 1 && lastTwo.audience(r.state).verdict?.team === 1 && r.timer === null);
  r = R.act(lastTwo, r, 'next');
  r = R.act(lastTwo, r, 'start');
  r = R.act(lastTwo, r, 'correct');
  r = R.act(lastTwo, r, 'next');
  check('السؤال 3 متوسط: «صحيحة · +2»', lastTwo.actions(r.state).find(x => x.id === 'correct').label === 'صحيحة · +2');

  // السرقة: بعد الخطأ، وبعد انتهاء الوقت.
  r = R.act(lastTwo, r, 'start');
  r = R.act(lastTwo, r, 'wrong');
  a = lastTwo.audience(r.state);
  check('خاطئة: السرقة للخصم في 5 ثوانٍ', a.phase === 'steal' && a.turn === 2 && a.clock === 5 && r.timer?.seconds === 5 && a.steal.reason === 'wrong');
  const before = r.scores[2];
  r = R.act(lastTwo, r, 'correct');
  check('السرقة الصحيحة: النقاط نفسها (+2) للسارق', r.scores[2] === before + 2);
  r = R.undo(r);
  check('التراجع: تعود السرقة وعدّادها كاملاً، والرصيد كما كان', r.state.phase === 'steal' && r.scores[2] === before && r.timer?.seconds === 5);
  r = R.act(lastTwo, r, 'timeout', r.timer.id);
  check('انتهى وقت السارق: لا نقاط', lastTwo.audience(r.state).verdict?.team === 0 && r.scores[2] === before);
  r = R.act(lastTwo, r, 'next');
  r = R.act(lastTwo, r, 'start');
  r = R.act(lastTwo, r, 'timeout', r.timer.id);
  check('انتهى وقت صاحب السؤال: السرقة «بعد انتهاء الوقت»', r.state.phase === 'steal' && r.state.steal.reason === 'timeout');

  // لا إجابة على الجمهور في أي حالة.
  let states = 0, leaks = 0;
  for (let k = 0; k < 6; k++) {
    let x = start(k % 2 ? 1 : 2);
    while (!lastTwo.finished(x.state)) {
      const aud = JSON.stringify(lastTwo.audience(x.state));
      const cur = x.state.questions[x.state.index];
      states++;
      // بعد الحكم الأخير تظهر الإجابة النموذجية وحدها (الإصدار 1.1)، ولا بدائل أبداً.
      const decided = x.state.phase === 'decided';
      if (/"alts"/.test(aud) || (!decided && /"answer"/.test(aud)) || (x.state.phase !== 'intro' && (decided ? cur.alts : [cur.answer, ...cur.alts]).some(w => aud.includes(`"${w}"`)))) leaks++;
      if (decided && lastTwo.audience(x.state).answer !== cur.answer) leaks++;
      const act = lastTwo.actions(x.state).map(b => b.id);
      x = R.act(lastTwo, x, act.includes('next') ? 'next' : act.includes('show') ? 'show' : act.includes('start') ? 'start' : (states % 3 ? 'wrong' : 'correct'));
    }
  }
  check(`الجمهور: لا إجابة في ${states} حالة`, leaks === 0);

  // الحرف المعيّن على جولة الكلمة نفسها، بفروقه.
  let l = R.act(letter, R.startRound(letter, { content, first: 1, rng }), 'show');
  const la = letter.audience(l.state);
  check('الحرف المعيّن باقٍ: 15 ثانية، وحرف بلا تطويل، وسطر قبوله', la.clock === 15 && !la.tatweel && [...la.letter].length === 1 && letter.presenter(l.state).accept === `وتُقبل أي كلمة أخرى تبدأ بـ «${la.letter}» وتنطبق على المطلوب.`);
  check('حالة محفوظة قبل ش3 (letter بدل box) تُعرض', letter.audience({ ...l.state, questions: l.state.questions.map(({ box, ...x }) => ({ ...x, letter: box })) }).letter === la.letter);

  // تتابع المباراة: الجولة 1 «آخر حرفين» ← العجلة (تُتخطى) ← الجولة 2 «الحرف المعيّن» ← النهائية.
  let m = { ...M.newMatch({ pack: 'general', method: 'short' }), step: 'face', teams: { 1: 'الصقور', 2: 'النجوم' }, winner: 1,
    picks: [{ mode: 'last-two', by: 1 }, { mode: 'letter', by: 2 }] };
  const name = id => MODES.find(x => x.id === id).name;
  m = P.startNext(m, { modes: MODES, content, seen: [], rng });
  check('بدء الجولة 1 لآخر حرفين', m.step === 'play' && m.round.mode === 'last-two' && m.round.n === 1);
  while (!lastTwo.finished(m.round.state)) {
    const act = lastTwo.actions(m.round.state).map(b => b.id);
    m = P.act(m, MODES, act.includes('next') ? 'next' : act.includes('show') ? 'show' : 'correct');
  }
  check('بعد الجولة: الحصيلة 6 لكل فريق (2+4+6 ÷ 2… 1+2+3)', lastTwo.audience(m.round.state).totals[1] === 6 && lastTwo.audience(m.round.state).totals[2] === 6);
  check('«التالي: عجلة البونص»', P.nextText(m, name) === 'التالي: عجلة البونص' && P.nextKind(m, MODES) === 'skip');
  m = P.skipNext(m, MODES);
  check('ثم «التالي: الجولة 2 · الحرف المعيّن» وتبدأ', P.nextText(m, name) === 'التالي: الجولة 2 · الحرف المعيّن' && P.nextKind(m, MODES) === 'start');
  m = P.startNext(m, { modes: MODES, content, seen: [], rng });
  check('الجولة 2 للحرف المعيّن، والرصيد من الجولة 1', m.round.mode === 'letter' && m.round.n === 2 && m.scores[1] === 6 && m.scores[2] === 6);
  check('حالة المباراة تُحفظ JSON وتُقرأ سليمة', M.isMatch(JSON.parse(JSON.stringify(m))));

  process.exit(finish() ? 0 : 1);
})();
