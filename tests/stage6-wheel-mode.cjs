// اختبار آلي لوحدة «شريط البونص» (js/wheel.js) في مرحلة «الدوران» (5.7، design/wheel.md)، دون متصفح:
// الخانات العشر بترتيبها من wheel.json (سبع تحديات وثلاث خانات حظ لا تتجاور)، وكلمة كل خانة ورقمها من التأثير،
// وخانة الوقوف محسومة من الإعداد، و«أطلق الشريط» ثم «land» لا يُقبل قبل انتهاء الحركة، ولا نص لخانة على الجمهور قبل الوقوف،
// والتراجع يتخطى الدوران، وموضع العجلة في مسار المباراة، ومن يديرها أولاً (الأقل نقاطاً، وعند التعادل الخاسر في القرعة).
const fs = require('fs');
const path = require('path');
const { reporter } = require('./helpers.cjs');

(async () => {
  const root = path.join(__dirname, '..');
  const W = await import(path.join(root, 'js/wheel.js'));
  const wheel = W.default;
  const R = await import(path.join(root, 'js/round.js'));
  const P = await import(path.join(root, 'js/play.js'));
  const M = await import(path.join(root, 'js/match.js'));
  const { MODES } = await import(path.join(root, 'js/modes/index.js'));
  const { checkContent } = await import(path.join(root, 'js/content-check.js'));
  const { check, finish } = reporter();
  const data = JSON.parse(fs.readFileSync(path.join(root, 'content/wheel.json'), 'utf8'));
  const content = { 'wheel.json': data };
  let seed = 11;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // ملف العجلة كما كتبه الكاتب سليم عند الفاحص، والوحدة بشكل العقد.
  check('content/wheel.json سليم عند الفاحص (لا خطأ ولا تنبيه فيه)', (() => { const r = checkContent({ index: { packs: [] }, packs: [], wheel: data }); return ![...r.errors, ...r.warnings].some(e => e.startsWith('wheel.json')); })());
  check('الوحدة بشكل العقد: setup وactions وact وaudience وpresenter وfinished وused', ['setup', 'actions', 'act', 'audience', 'presenter', 'finished', 'used'].every(k => typeof wheel[k] === 'function') && wheel.contentKey === 'wheel.json');
  check('العجلة ليست نمطاً: لا تدخل قائمة الأنماط (MODES)', !MODES.some(m => m.id === 'wheel'));

  // الخانات العشر.
  let round = R.startRound(wheel, { content, first: 2, rng });
  let s = round.state;
  const kinds = s.slots.map(x => x.kind === 'luck' ? x.effect : 'c').join(',');
  check('عشر خانات: سبع تحديات وثلاث حظ، بالترتيب من اليمين (تحدٍّ · خصم · تحدٍّ · تحدٍّ · هدية · تحدٍّ · تحدٍّ · اسرق · تحدٍّ · تحدٍّ)', s.slots.length === 10 && kinds === 'c,lose-5,c,c,gift-5,c,c,steal-5,c,c');
  check('لا تتجاور خانتا حظ', s.slots.every((x, i) => !(x.kind === 'luck' && s.slots[i + 1]?.kind === 'luck')));
  check('التحديات بترتيبها في wheel.json، ونص كل خانة حظ من label', s.slots.filter(x => x.kind === 'challenge').map(x => x.id).join(',') === data.challenges.map(c => c.id).join(',')
    && s.slots.filter(x => x.kind === 'luck').every(x => x.text === data.luck.find(l => l.effect === x.effect).label));
  const faces = s.slots.map(W.face);
  check('كلمة الخانة ورقمها من التأثير: «تحدٍّ +5» · «خسارة −5» · «هدية +5» · «خصم 5»', faces[0].word === 'تحدٍّ' && faces[0].n === '+5' && faces[1].word === 'خسارة' && faces[1].n === '−5'
    && faces[4].word === 'هدية' && faces[4].n === '+5' && faces[7].word === 'خصم' && faces[7].n === '5');
  check('لو طال label لا تتغير الخانة (الكلمة من effect)', W.face({ kind: 'luck', effect: 'gift-5', text: 'هدية طويلة جداً جداً' }).word === 'هدية');
  check('خانتا الوقوف للدورتين محسومتان في الإعداد (0 إلى 9)', s.stops.length === 2 && s.stops.every(k => Number.isInteger(k) && k >= 0 && k < 10));
  const many = Array.from({ length: 200 }, () => wheel.setup({ content: data, first: 1, rng }).stops[0]);
  check('الخانات العشر كلها يُوقف عليها (200 إعداد)', new Set(many).size === 10);
  check('يديرها first، والدورة 1 من 2، والثاني للفريق الآخر', s.spinners.join(',') === '2,1' && s.n === 1);

  // قبل الدوران.
  let a = wheel.audience(s);
  check('قبل الدوران: شاشة العجلة، والحدّ لمن يديرها، ولا دوران', a.screen === 'wheel' && a.phase === 'ready' && a.by === 2 && a.turn === 2 && a.spin === null && a.n === 1 && a.count === 2);
  const texts = [...data.challenges.map(c => c.text), ...data.luck.map(l => l.label)];
  check('لا نص لأي خانة على الجمهور قبل الوقوف (الكلمة والرقم وحدهما)', !texts.some(t => JSON.stringify(a).includes(t)));
  // والرصيد 0 و0 (لم يُمرَّر): تعادل، فسبب البدء للمقدّم «خسر القرعة».
  check('المقدّم يرى النصوص كاملة، وسبب البدء', wheel.presenter(s).items.every((x, i) => x.text === s.slots[i].text) && wheel.presenter(s).why === 'draw');
  check('زر واحد: «أطلق الشريط»', JSON.stringify(wheel.actions(s)) === JSON.stringify([{ id: 'spin', label: 'أطلق الشريط' }]));

  // الدوران.
  const t0 = 1_000_000;
  round = R.act(wheel, round, 'spin', undefined, t0);
  s = round.state;
  const stop = s.stops[0];
  check('«أطلق الشريط»: تدور إلى خانتها المحسومة، ووقت البدء بساعة الجهاز', s.phase === 'spin' && s.landed === stop && s.at === t0);
  check('ولحظة «spin» بمن يديرها وخانته', round.events.some(e => e.type === 'moment' && e.name === 'spin' && e.team === 2 && e.stop === stop));
  a = wheel.audience(s);
  check('الجمهور يعرف الخانة والوقت ليدور إليها، ولا نص لها بعد', a.spin?.stop === stop && a.spin.at === t0 && !texts.some(t => JSON.stringify(a).includes(t)));
  check('أثناء الدوران لا زر', wheel.actions(s).length === 0);
  const steps = W.spinSteps(stop);
  check('الحركة: ثلاث دورات ثم خانة الوقوف، أولى الخطوات 60ms وكل خطوة أبطأ، والأخيرة نحو 480', steps.length === 30 + stop && steps[0] === 60 && steps.every((d, i) => !i || d > steps[i - 1]) && steps.at(-1) > 400 && steps.at(-1) <= 480);
  const ms = W.spinMs(stop);
  check(`المدة نحو 5 ثوانٍ حتى الوقوف، ثم 1.2 ثانية قبل الخانة (${Math.round(ms)}ms)`, ms > 4500 && ms < 7500 && Math.abs(ms - steps.reduce((x, y) => x + y, 0) - 1200) < 1e-6);
  let early = R.act(wheel, round, 'land', undefined, t0 + 2000);
  check('«land» قبل انتهاء الحركة يُهمل', early.state === round.state && early.events.length === 0);
  check('«land» لا يُقبل من وحدة لا تعرفه (mode.auto)', R.act({ ...wheel, auto: [] }, round, 'land', undefined, t0 + ms).state === round.state);
  round = R.act(wheel, round, 'land', undefined, t0 + ms);
  s = round.state;
  a = wheel.audience(s);
  check('بعد الحركة: الخانة ظاهرة (شاشة الخانة)، بنصها كاملاً وكلمتها ورقمها، والحدّ لمن أدارها', s.phase === 'slot' && a.screen === 'slot' && a.text === s.slots[stop].text && a.slot.word === W.face(s.slots[stop]).word && a.turn === 2 && a.by === 2);
  check('بعد الوقوف: «ابدأ التحدي» إن وقفت على تحدٍّ، و«التالي · الدورة 2» على خانة حظ (تُطبَّق فوراً)', wheel.actions(s).map(x => x.id).join() === (s.slots[stop].kind === 'challenge' ? 'start' : 'next'));

  // التراجع: يتخطى الدوران إلى ما قبله، ثم «أدِر» يقف على الخانة نفسها.
  let m = { step: 'play', round, scores: round.scores };
  m = P.undo(m, [wheel]);
  check('التراجع بعد الوقوف يعود إلى ما قبل الدوران (يتخطى الدوران)', m.round.state.phase === 'ready' && m.round.history.length === 0);
  const again = R.act(wheel, m.round, 'spin', undefined, t0 + 60000);
  check('وإعادة الدوران تقف على الخانة نفسها (لا تُعاد لخانة أفضل)', again.state.landed === stop);
  const mid = P.undo({ step: 'play', round: again, scores: again.scores }, [wheel]);
  check('والتراجع أثناء الدوران يوقفه (قبل الدوران)', mid.round.state.phase === 'ready');

  // نهاية العجلة (التحدي يُحكم فيه أولاً: «لم ينجح» بلا نقاط).
  // والدورتان: التحدي يُحكم فيه «لم ينجح»، ثم الدورة الثانية بخانتها، ثم «إنهاء الشريط» (اختبار الدورتين في stage6-wheel-turns).
  const close = (r, at) => (r.state.slots[r.state.landed].kind === 'challenge' ? R.act(wheel, R.act(wheel, r, 'start', undefined, at), 'failed', undefined, at + 1000) : r);
  round = close(round, t0 + ms + 1000);
  round = R.act(wheel, round, 'next', undefined, t0 + ms + 3000);
  round = R.act(wheel, round, 'spin', undefined, t0 + ms + 4000);
  round = close(R.act(wheel, round, 'land', undefined, t0 + ms + 4000 + W.spinMs(round.state.landed)), t0 + 30000);
  round = R.act(wheel, round, 'finish', undefined, t0 + 40000);
  s = round.state;
  a = wheel.audience(s);
  check('«إنهاء الشريط»: النهاية، والحدّ في المنتصف', wheel.finished(s) && a.screen === 'end' && a.turn === 0);

  // في مسار المباراة.
  const files = { 'letter.json': {}, 'ranking.json': {} };
  let match = { ...M.newMatch({ pack: 'general', method: 'short' }), teams: { 1: 'الصقور', 2: 'النجوم' }, winner: 1, picks: [{ mode: 'ranking', by: 1 }, { mode: 'letter', by: 2 }], step: 'play', cursor: 0, played: 1, round: null, scores: { 1: 4, 2: 9 } };
  check('النمطان: العجلة بين الجولتين في المسار', M.plan(match).map(x => x.kind).join() === 'round,wheel,round');
  check('العجلة تُتخطى إن لم تكن وحدتها بين ما يُلعب (الرابط العادي)', P.nextKind(match, MODES) === 'skip');
  const units = [...MODES, wheel];
  check('وتبدأ إن كانت (رابط المعاينة)', P.nextKind(match, units) === 'start');
  check('ونصّ ما بعد الجولة «التالي: شريط البونص»', P.nextText(match, id => id) === 'التالي: شريط البونص');
  let started = P.startNext(match, { modes: units, content: { ...files, 'wheel.json': data }, rng });
  check('بدأت العجلة: الموضع التالي في المسار، ولا تُعدّ جولة', started.cursor === 1 && started.round.mode === 'wheel' && started.round.wheel && started.played === 1);
  check('يديرها الأقل نقاطاً أولاً (الأول 4 والثاني 9)', started.round.state.spinners[0] === 1 && started.round.state.why === 'score');
  check('والرصيد يتبعها كما هو', started.scores[1] === 4 && started.scores[2] === 9);
  const tie = P.startNext({ ...match, scores: { 1: 5, 2: 5 } }, { modes: units, content: { 'wheel.json': data }, rng });
  check('عند التعادل يبدأ الخاسر في القرعة (فاز الأول، فيبدأ الثاني)، والسبب «draw»', tie.round.state.spinners[0] === 2 && tie.round.state.why === 'draw');
  check('P.act يمرّ بالعجلة كما يمرّ بالجولة', P.act(started, units, 'spin').round.state.phase === 'spin');
  check('والعجلة المنتهية تفتح ما بعدها (الجولة 2)', (() => {
    const done = { ...started, round: { ...started.round, state: { ...started.round.state, phase: 'end' } } };
    return P.between(done, units) && P.nextKind(done, units) === 'start' && P.nextText(done, id => id) === 'التالي: الجولة 2 · letter';
  })());
  const full = { ...match, method: 'full', picks: [{ mode: 'letter', by: 1 }, { mode: 'ranking', by: 2 }, { mode: 'auction', by: 1 }, { mode: 'last-two', by: 0 }] };
  check('الأربعة: عجلتان بعد الثانية وبعد الثالثة', M.plan(full).map(x => x.kind === 'wheel' ? 'W' + x.after : 'R').join() === 'R,R,W2,R,W3,R');

  process.exit(finish() ? 0 : 1);
})();
