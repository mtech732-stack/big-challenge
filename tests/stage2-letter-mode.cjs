// اختبار آلي لوحدة «الحرف المعيّن» (js/modes/letter.js) ومشغّل الجولة وتتابع المباراة (js/play.js)، دون متصفح.
const fs = require('fs');
const path = require('path');
const { reporter } = require('./helpers.cjs');

(async () => {
  const root = path.join(__dirname, '..');
  const letter = (await import(path.join(root, 'js/modes/letter.js'))).default;
  const { checkMode } = await import(path.join(root, 'js/modes/contract.js'));
  const { MODES, matchModes } = await import(path.join(root, 'js/modes/index.js'));
  const { checkContent, ANSWER_MAX, ALTS_MAX } = await import(path.join(root, 'js/content-check.js'));
  const R = await import(path.join(root, 'js/round.js'));
  const M = await import(path.join(root, 'js/match.js'));
  const P = await import(path.join(root, 'js/play.js'));
  const { check, finish } = reporter();
  const bank = JSON.parse(fs.readFileSync(path.join(root, 'content/packs/general/letter.json'), 'utf8'));
  const content = { 'letter.json': bank };
  let seed = 11;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ids = list => list.map(a => a.id).join(',');

  // العقد والسجل.
  check('الوحدة تلتزم «عقد الوحدة»', checkMode(letter).length === 0);
  check('«الحرف المعيّن» في السجل، وقائمة الاختيار تبنيه من ملفه', MODES.includes(letter)
    && (() => { const l = matchModes({ pack: { excludeModes: [] }, files: content }); return l[0].id === 'letter' && !l[0].preview && l.slice(1).every(m => m.preview); })());

  // الإعداد: 6 أسئلة، سهل ثم متوسط ثم صعب، لكل فريق 3 بالتناوب، ولا أسئلة كسر التعادل.
  const withTie = { questions: [...bank.questions, { ...bank.questions.find(q => q.level === 'hard'), id: 'general-letter-tb1', tiebreak: true }] };
  const s0 = letter.setup({ content: withTie, first: 2, seen: [], rng });
  check('6 أسئلة', s0.questions.length === 6);
  check('المستويات: سهل سهل متوسط متوسط صعب صعب', s0.questions.map(q => q.level).join(',') === 'easy,easy,medium,medium,hard,hard');
  check('صاحب السؤال بالتناوب، ويبدأ من اختير (الثاني هنا)', s0.questions.map(q => q.owner).join(',') === '2,1,2,1,2,1');
  check('لا سؤال لكسر التعادل في الجولة', s0.questions.every(q => q.id !== 'general-letter-tb1'));
  check('لا سؤال مكرر', new Set(s0.questions.map(q => q.id)).size === 6);
  const seenAll = bank.questions.filter(q => q.level !== 'hard').map(q => q.id);
  const s1 = letter.setup({ content: bank, first: 1, seen: seenAll.slice(0, -2), rng });
  check('ذاكرة الأسئلة: ما لم يظهر أولاً', s1.questions.filter(q => q.level !== 'hard').some(q => !seenAll.slice(0, -2).includes(q.id)));

  // مشغّل الجولة على الوحدة.
  const start = first => R.startRound(letter, { content, scores: { 1: 0, 2: 0 }, first, rng });
  let r = start(1);
  check('الافتتاح: الزر «اعرض السؤال 1» وحده', ids(letter.actions(r.state)) === 'show' && letter.audience(r.state).screen === 'intro');
  check('الافتتاح: من يبدأ والقاعدة، ولا سطر تفاصيل (الإصدار 1.1)', letter.audience(r.state).turn === 1 && letter.audience(r.state).rule === 'أجب بكلمة تبدأ بالحرف المعيّن' && letter.audience(r.state).sub === undefined);
  r = R.act(letter, r, 'show');
  let a = letter.audience(r.state);
  check('قبل «ابدأ»: العدّاد ثابت 30، ولا عدّاد جارٍ', a.clock === 30 && r.timer === null && a.phase === 'ready');
  check('قبل «ابدأ»: «ابدأ العدّاد» وزرا الحكم مفعّلان', ids(letter.actions(r.state)) === 'start,correct,wrong');
  check('زر الحكم يحمل النقاط «صحيحة · +3»', letter.actions(r.state)[1].label === 'صحيحة · +3');
  check('«السؤال 1 من 6»، ولا مستوى على الجمهور (الإصدار 1.1)', a.levelText === undefined && a.level === undefined && a.n === 1 && a.count === 6);
  check('«انتهى الوقت» قبل «ابدأ» يُهمل', R.act(letter, r, 'timeout', 1).state === r.state);
  r = R.act(letter, r, 'start');
  check('«ابدأ»: عدّاد 30 ثانية برقمه', r.timer?.seconds === 30 && r.events.some(e => e.type === 'timer' && e.seconds === 30 && e.id === r.timer.id));
  const t1 = r.timer.id;
  r = R.act(letter, r, 'correct');
  a = letter.audience(r.state);
  check('صحيحة: +3 لصاحب السؤال، والحكم بدل العدّاد', r.scores[1] === 3 && a.verdict?.team === 1 && a.verdict.points === 3 && r.timer === null);
  check('صحيحة: لحظة «right»، ولحظة «lead» لأنه تقدّم', r.events.some(e => e.name === 'right' && e.team === 1) && r.events.some(e => e.name === 'lead' && e.team === 1));
  check('حكم في اللحظة الأخيرة ثم «انتهى الوقت» متأخراً: يُهمل', R.act(letter, r, 'timeout', t1).state === r.state);
  check('بعد الحكم: «السؤال التالي · 2 من 6»', letter.actions(r.state)[0].label === 'السؤال التالي · 2 من 6');
  r = R.act(letter, r, 'next');
  a = letter.audience(r.state);
  check('السؤال 2 للفريق الثاني، والمؤشر عليه', a.n === 2 && a.owner === 2 && a.turn === 2 && a.phase === 'ready');

  // السرقة: خاطئة قبل «ابدأ» ← الخصم في 10 ثوانٍ فوراً.
  r = R.act(letter, r, 'wrong');
  a = letter.audience(r.state);
  check('خاطئة: السرقة للخصم، وعدّادها 10 ثوانٍ يبدأ فوراً', a.steal?.team === 1 && a.steal.reason === 'wrong' && a.turn === 1 && r.timer?.seconds === 10 && a.clock === 10);
  check('لحظة السرقة بسببها', r.events.some(e => e.name === 'steal' && e.reason === 'wrong' && e.team === 1));
  check('في السرقة: زرا الحكم وحدهما', ids(letter.actions(r.state)) === 'correct,wrong');
  const stealTimer = r.timer.id;
  // التراجع أثناء السرقة: يعود السؤال لصاحبه، ولا عدّاد (لم يكن بدأ).
  const back = R.undo(r);
  check('التراجع أثناء السرقة: يعود لصاحبه قبل «ابدأ»، ويتوقف عدّاد السرقة', letter.audience(back.state).phase === 'ready' && back.timer === null && back.events.some(e => e.type === 'stop-timer'));
  r = R.act(letter, r, 'timeout', stealTimer);
  a = letter.audience(r.state);
  check('انتهى وقت السرقة: لا نقاط', a.verdict?.team === 0 && r.scores[1] === 3 && r.scores[2] === 0 && r.events.some(e => e.name === 'none'));

  // انتهاء الوقت ← السرقة، ثم سرقة صحيحة بالنقاط نفسها.
  r = R.act(letter, R.act(letter, r, 'next'), 'start');
  check('السؤال 3 (متوسط) للأول: «صحيحة · +6»', letter.audience(r.state).owner === 1 && letter.actions(r.state)[0].label === 'صحيحة · +6');
  r = R.act(letter, r, 'timeout', r.timer.id);
  a = letter.audience(r.state);
  check('انتهى الوقت: السرقة للثاني بسبب الوقت', a.steal?.team === 2 && a.steal.reason === 'timeout' && r.timer?.seconds === 10);
  const beforeSteal = r;
  r = R.act(letter, r, 'correct');
  check('سرقة صحيحة: +6 للسارق', r.scores[2] === 6 && letter.audience(r.state).verdict.team === 2);
  check('تبادل الصدارة: الثاني صار متقدماً (2 مقابل 1)، فلحظة «lead» له', r.events.some(e => e.name === 'lead' && e.team === 2));
  // التراجع عن حكم السرقة: يعود الرصيد، ويعود عدّاد السرقة بوقته كاملاً.
  const u = R.undo(r);
  check('التراجع عن حكم السرقة: الرصيد كما كان، وعدّاد 10 ثوانٍ من جديد', u.scores[2] === 0 && u.timer?.seconds === 10 && u.timer.id !== beforeSteal.timer.id && letter.audience(u.state).steal?.team === 2);
  r = R.act(letter, u, 'correct');

  // بقية الجولة: صحيحة كلها، ثم النهاية والحصيلة.
  for (let i = 0; i < 3; i++) r = R.act(letter, R.act(letter, r, 'next'), 'correct');
  check('بعد السادس: «إنهاء الجولة»', letter.actions(r.state)[0].label === 'إنهاء الجولة');
  r = R.act(letter, r, 'next');
  a = letter.audience(r.state);
  // الأول: 3 (س1) + 9 (س5) = 12 · الثاني: 6 (سرقة س3) + 6 (س4) + 9 (س6) = 21
  check(`النهاية: الحصيلة 12 و21 (${a.totals[1]} و${a.totals[2]})`, a.screen === 'end' && a.totals[1] === 12 && a.totals[2] === 21 && r.scores[1] === 12 && r.scores[2] === 21);
  check('النهاية: لا أزرار، والجولة منتهية، ولا فعل بعدها', letter.finished(r.state) && !letter.actions(r.state).length && R.act(letter, r, 'next').state === r.state);
  check('التراجع بعد النهاية يعيد السؤال السادس', letter.audience(R.undo(r).state).n === 6);
  check('used: الأسئلة الستة', letter.used(r.state).length === 6);

  // نافذة الجمهور لا ترى الإجابة: لا إجابة نموذجية ولا بديلة في أي حالة، لأي سؤال.
  const forms = bank.questions.flatMap(q => [q.answer, ...(q.alts ?? [])]);
  let leaks = 0, states = 0;
  for (const first of [1, 2]) {
    let x = start(first);
    // بعد الحكم الأخير تظهر الإجابة النموذجية وحدها (الإصدار 1.1)، ولا بدائل أبداً.
    const seenState = s => { states++; const a = letter.audience(s); const q = s.questions[s.index]; const decided = s.phase === 'decided';
      const j = JSON.stringify({ ...a, answer: undefined });
      if (q && [q.answer, ...q.alts].some(f => j.includes(`"${f}"`) || j.includes(f) && !q.prompt.includes(f))) leaks++;
      if (q && (decided ? a.answer !== q.answer : a.answer !== undefined)) leaks++; };
    seenState(x.state);
    x = R.act(letter, x, 'show');
    while (!letter.finished(x.state)) {
      seenState(x.state);
      const act = letter.actions(x.state).map(b => b.id);
      x = R.act(letter, x, act.includes('next') ? 'next' : act.includes('start') ? 'start' : (states % 3 ? 'wrong' : 'correct'));
    }
    seenState(x.state);
  }
  check(`الجمهور: لا إجابة في ${states} حالة`, leaks === 0 && !JSON.stringify(letter.audience(start(1).state)).includes('answer'));
  check('المقدّم يرى الإجابة وبدائلها وسطر القبول', (() => { const x = R.act(letter, start(1), 'show'); const p = letter.presenter(x.state); return p.answer && Array.isArray(p.alts) && p.accept.includes(`«${p.letter}»`); })());

  // تتابع المباراة: المواجهة ← الجولة ← ما بعدها.
  let m = { ...M.newMatch({ pack: 'general', method: 'short' }), step: 'face', teams: { 1: 'الصقور', 2: 'النجوم' }, winner: 1,
    picks: [{ mode: 'letter', by: 1 }, { mode: 'auction', by: 2 }] };
  const name = id => ({ letter: 'الحرف المعيّن', 'last-two': 'آخر حرفين', auction: 'المزاد', ranking: 'الترتيب' })[id];
  check('المواجهة: التالي جولة مبنية «start»', P.nextKind(m, MODES) === 'start');
  m = P.startNext(m, { modes: MODES, content, seen: [], rng });
  check('بدء الجولة 1: الخطوة «play»، والجولة 1 للحرف المعيّن', m.step === 'play' && m.round.n === 1 && m.round.mode === 'letter' && m.played === 1);
  check('لا تبدأ جولة أخرى والجولة جارية', P.startNext(m, { modes: MODES, content, rng }) === m && P.skipNext(m, MODES) === m);
  m = P.act(m, MODES, 'show');
  m = P.act(m, MODES, 'correct');
  const f = m.round.first, o = f === 1 ? 2 : 1;
  check('الحكم يمر بالمشغّل، والرصيد يتبعه', m.scores[f] === 3 && m.round.scores[f] === 3);
  m = P.setScore(m, o, 5);
  check('تعديل الرصيد يدوياً أثناء الجولة، ثم التراجع عنه', m.scores[o] === 5 && P.undo(m).scores[o] === 0);
  check('الزر غير الموجود يُهمل', P.act(m, MODES, 'start').round.state === m.round.state);
  while (!letter.finished(m.round.state)) {
    const act = letter.actions(m.round.state).map(b => b.id);
    m = P.act(m, MODES, act.includes('next') ? 'next' : 'correct');
  }
  check('بعد الجولة 1 في القصيرة: «التالي: شريط البونص»', P.nextText(m, name) === 'التالي: شريط البونص' && P.nextKind(m, MODES) === 'skip');
  m = P.skipNext(m, MODES);
  check('بعد تخطّي العجلة: «التالي: الجولة 2 · المزاد»، وهو مبنيّ فيبدأ (ش4)', P.nextText(m, name) === 'التالي: الجولة 2 · المزاد' && P.nextKind(m, MODES) === 'start');
  // والترتيب مبنيّ منذ نهاية ش5 فيبدأ. وجولة نمط لم يُبنَ (بأنماط بلا الترتيب) تُتخطى، ثم النتيجة النهائية.
  m = { ...m, picks: m.picks.map(p => (p.mode === 'auction' ? { ...p, mode: 'ranking' } : p)) };
  const unbuilt = MODES.filter(x => x.id !== 'ranking');
  check('ولو كانت «الترتيب»: مبنيّ فيبدأ (ش5)، ولو لم يُبنَ لتُخطّي', P.nextText(m, name) === 'التالي: الجولة 2 · الترتيب' && P.nextKind(m, MODES) === 'start' && P.nextKind(m, unbuilt) === 'skip');
  m = P.skipNext(m, unbuilt);
  check('بعدها: «التالي: النتيجة النهائية» (ش7)', P.nextText(m, name) === 'التالي: النتيجة النهائية' && P.nextKind(m, MODES) === 'final' && P.skipNext(m, MODES) === m);
  check('الجولة المنتهية تبقى ورصيدها', m.round.n === 1 && m.scores[1] > 0);
  check('حالة المباراة في الجولة تُحفظ JSON وتُقرأ سليمة', M.isMatch(JSON.parse(JSON.stringify(m))));

  // حدّا المحتوى الجديدان (design/letter.md 2.6): تنبيهان لا خطآن.
  const one = q => checkContent({ index: { packs: ['general'] }, packs: { general: { 'pack.json': { id: 'general', name: 'ع', excludeModes: [] }, 'letter.json': { mode: 'letter', questions: [q] } } } });
  const q = { id: 'x-001', level: 'easy', letter: 'ش', prompt: 'سؤال', answer: 'شاحن', domain: 'daily-life' };
  const longAns = one({ ...q, answer: 'ش' + 'ا'.repeat(ANSWER_MAX) });
  check('إجابة أطول من 20: تنبيه لا خطأ', !longAns.errors.length && longAns.warnings.some(w => w.includes('الإجابة النموذجية') && w.includes(`${ANSWER_MAX}`)));
  const longAlts = one({ ...q, alts: ['شمّام أصفر صغير', 'شمّام', 'شمّامة', 'شجرة التفاح القزمة الكبيرة'] });
  check('بدائل أطول من 50 مجتمعة: تنبيه لا خطأ', !longAlts.errors.length && longAlts.warnings.some(w => w.includes('البدائل') && w.includes(`${ALTS_MAX}`)));
  const okAlts = one({ ...q, alts: ['شمّام أصفر صغير', 'شمّام', 'شمّامة', 'شجرة التفاح القزمة'] });
  check('49 حرفاً مجتمعة (مثال التصميم): لا تنبيه', !okAlts.warnings.some(w => w.includes('البدائل')));
  const real = bank.questions.filter(x => [...x.answer].length > ANSWER_MAX || [...(x.alts ?? []).join('، ')].length > ALTS_MAX);
  check('أسئلة البنك الحالي ضمن الحدّين', real.length === 0);

  process.exit(finish() ? 0 : 1);
})();
