// اختبار آلي لمنطق بدء المباراة (js/match.js) وأنماط المباراة (matchModes) وحدود ش1، دون متصفح.
const path = require('path');
const { reporter } = require('./helpers.cjs');

(async () => {
  const root = path.join(__dirname, '..');
  const M = await import(path.join(root, 'js/match.js'));
  const { matchModes, PLANNED } = await import(path.join(root, 'js/modes/index.js'));
  const { checkMode } = await import(path.join(root, 'js/modes/contract.js'));
  const { checkContent } = await import(path.join(root, 'js/content-check.js'));
  const sample = (await import(path.join(__dirname, 'fixtures/sample-mode.js'))).default;
  const { check, finish } = reporter();
  const ids = list => list.map(m => m.id).join(',');

  // أنماط المباراة: المعاينة لما لم يُبنَ، والقواعد كلها لما بُني.
  const general = { excludeModes: [] };
  check('قبل ش2: الأنماط الأربعة معاينةً بترتيبها', ids(matchModes({ modes: [], pack: general, files: {} })) === 'letter,last-two,auction,ranking'
    && matchModes({ modes: [], pack: general, files: {} }).every(m => m.preview));
  check('الحزمة تستثني نمطاً: لا يظهر ولو معاينةً', ids(matchModes({ modes: [], pack: { excludeModes: ['ranking'] }, files: {} })) === 'letter,last-two,auction');
  check('نمط مبنيّ بلا ملف أسئلة لا يظهر', ids(matchModes({ modes: [sample], pack: general, files: {} })) === 'last-two,auction,ranking');
  const withFile = matchModes({ modes: [sample], pack: general, files: { 'letter.json': {} } });
  check('نمط مبنيّ له ملف: يظهر في موضعه، وليس معاينة', ids(withFile) === 'letter,last-two,auction,ranking' && !withFile[0].preview && withFile[1].preview);
  check('أسماء الأنماط في PLANNED لا تزيد على 13 حرفاً', PLANNED.every(p => [...p.name].length <= 13));
  check('اسم نمط أطول من 13 حرفاً يُرفض في العقد', checkMode({ ...sample, name: 'اسم نمط طويل جداً' }).some(e => e.includes('13')));
  const pack = name => checkContent({ index: { packs: ['general'] }, packs: { general: { 'pack.json': { id: 'general', name, description: '', excludeModes: [] } } } });
  check('اسم حزمة أطول من 30 حرفاً خطأ في الفاحص', pack('حزمة باسم طويل جداً يتجاوز الحد المسموح').errors.some(e => e.includes('30')) && !pack('الحزمة الثقافية العامة').errors.length);

  // الإعداد.
  const modes = matchModes({ modes: [], pack: general, files: {} });
  let m = M.newMatch({ pack: 'general' });
  check('مباراة جديدة: الإعداد، والكاملة افتراضاً، والرصيد صفر', m.step === 'setup' && m.method === 'full' && m.scores[1] === 0 && m.scores[2] === 0);
  check('خطأ: اسم الفريق الأول فارغ', M.setupErrors(m)[0].text === 'اكتب اسم الفريق الأول');
  m = M.setTeams(m, 'الصقور', '  ');
  check('خطأ: اسم الفريق الثاني فارغ (مسافات فقط)', M.setupErrors(m)[0].text === 'اكتب اسم الفريق الثاني');
  m = M.setTeams(m, 'الصقور', ' الصقور  ');
  check('خطأ: الاسمان متطابقان بعد حذف المسافات', M.setupErrors(m)[0].text === 'الاسمان متطابقان. غيّر أحدهما.');
  check('لا انتقال إلى القرعة والإعداد ناقص', M.toDraw(m).step === 'setup');
  m = M.setTeams(m, 'فريق  النخبة الذهبي ', 'النجوم');
  check('اسم 18 حرفاً مقبول، والطويل مرفوض', !M.setupErrors(m).length && M.setupErrors(M.setTeams(m, 'فريق النخبة الذهبي!', 'ب')).length === 1);
  check('طريقة غير معروفة لا تُقبل', M.setMethod(m, 'long').method === 'full');
  m = M.toDraw(m);
  check('«إلى القرعة»: الخطوة القرعة، والاسمان بمسافات منظّفة', m.step === 'draw' && m.teams[1] === 'فريق النخبة الذهبي');

  // ملاحظتا المعاين: الأرقام الهندية، والرجوع إلى الإعداد قبل القرعة.
  check('الأرقام الهندية والفارسية في الاسم تصير إنجليزية', M.setTeams(m, 'فريق ٣', 'فريق ۱۲').teams[1] === 'فريق 3' && M.setTeams(m, 'أ', 'فريق ۱۲').teams[2] === 'فريق 12');
  const backed = M.backToSetup(m);
  check('رجوع إلى الإعداد قبل القرعة دون محو شيء', backed.step === 'setup' && backed.teams[1] === m.teams[1] && M.toDraw(backed).step === 'draw');

  // القرعة.
  check('لا اختيار قبل القرعة', M.toPick(m).step === 'draw');
  const winners = new Set(Array.from({ length: 40 }, (_, i) => M.draw(m, () => (i % 2 ? 0.7 : 0.2)).winner));
  check('القرعة تُخرج الفريقين', winners.has(1) && winners.has(2));
  m = M.draw(m, () => 0.8);
  check('القرعة محسومة ولا تُعاد', m.winner === 2 && M.draw(m, () => 0.1).winner === 2);
  const fixed = M.toDraw(M.setTeams(M.backToSetup(m), 'فريق النخبة', m.teams[2]));
  check('«تعديل الاسمين» بعد القرعة: إلى الإعداد، ثم تعود القرعة بالنتيجة نفسها ولا تُعاد', M.backToSetup(m).step === 'setup' && M.backToSetup(m).winner === 2
    && fixed.step === 'draw' && fixed.winner === 2 && fixed.teams[1] === 'فريق النخبة' && M.draw(fixed, () => 0.1).winner === 2);
  m = M.toPick(m);

  // الكاملة: الفائز، ثم الآخر، ثم الفائز، والرابعة تلقائياً.
  check('يختار الفائز بالقرعة أولاً', M.chooser(m) === 2);
  check('نمط غير متاح لا يُختار', M.pick(m, 'quiz', modes) === m);
  m = M.pick(m, 'auction', modes);
  check('ثم الآخر', M.chooser(m) === 1 && m.picks[0].by === 2);
  check('النمط لا يتكرر', M.pick(m, 'auction', modes) === m);
  m = M.pick(m, 'letter', modes);
  check('ثم الفائز', M.chooser(m) === 2);
  m = M.pick(m, 'ranking', modes);
  check('الرابعة للمتبقي تلقائياً', m.picks.length === 4 && m.picks[3].mode === 'last-two' && m.picks[3].by === 0 && M.chooser(m) === 0 && M.picksDone(m));
  const back = M.undoPick(m);
  check('التراجع يرفع الثالث والتلقائية معاً', back.picks.length === 2 && M.chooser(back) === 2);
  check('لا مواجهة قبل الاكتمال', M.toFace(back).step === 'pick');
  m = M.toFace(m);
  const plan = M.plan(m).map(s => s.kind === 'wheel' ? 'عجلة' : `${s.n}:${s.mode}:${s.by}`).join(' ');
  check(`مسار الكاملة: عجلتان بعد الثانية وبعد الثالثة (${plan})`, plan === '1:auction:2 2:letter:1 عجلة 3:ranking:2 عجلة 4:last-two:0');

  // القصيرة: جولتان وعجلة بينهما.
  let s = M.toPick(M.draw(M.toDraw(M.setMethod(M.setTeams(M.newMatch({ pack: 'general' }), 'أ', 'ب'), 'short')), () => 0.1));
  s = M.pick(M.pick(s, 'letter', modes), 'ranking', modes);
  check('القصيرة: الفائز ثم الآخر، ولا تلقائية', s.picks.map(p => p.by).join() === '1,2' && M.picksDone(s));
  check('مسار القصيرة: الجولة 1، عجلة، الجولة 2', M.plan(s).map(x => x.kind).join() === 'round,wheel,round');

  // تعديل الرصيد.
  let r = M.adjustScore(M.adjustScore(m, 1, 1), 1, 1);
  check('الرصيد يُعدَّل', r.scores[1] === 2);
  check('لا رصيد تحت الصفر، ولا يُسجَّل تعديل بلا أثر', M.adjustScore(r, 2, -1) === r);
  check('التراجع عن تعديل الرصيد', M.undoScore(r).scores[1] === 1 && M.undoScore(M.undoScore(r)).scores[1] === 0);

  // الحفظ.
  const copy = JSON.parse(JSON.stringify(m));
  check('الحالة بيانات تُحفظ وتعود كما هي', M.isMatch(copy) && JSON.stringify(M.plan(copy)) === JSON.stringify(M.plan(m)));
  check('حالة تالفة لا تُقبل', !M.isMatch({ v: 1, step: 'x' }) && !M.isMatch(null));

  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
