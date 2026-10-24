// اختبار آلي لوحدة «المزاد» (js/modes/auction.js) في مرحلة «المزايدة»، دون متصفح.
const fs = require('fs');
const path = require('path');
const { reporter } = require('./helpers.cjs');

(async () => {
  const root = path.join(__dirname, '..');
  const auction = (await import(path.join(root, 'js/modes/auction.js'))).default;
  const { OPEN_OFFER, MAX_BID, FULFIL_SECONDS, COMPLETE_SECONDS } = await import(path.join(root, 'js/modes/auction.js'));
  const { checkMode } = await import(path.join(root, 'js/modes/contract.js'));
  const { MODES, DRAFTS, matchModes, pickableModes } = await import(path.join(root, 'js/modes/index.js'));
  const R = await import(path.join(root, 'js/round.js'));
  const M = await import(path.join(root, 'js/match.js'));
  const P = await import(path.join(root, 'js/play.js'));
  const { check, finish } = reporter();
  const read = f => JSON.parse(fs.readFileSync(path.join(root, 'content/packs/general', f), 'utf8'));
  const bank = read('auction.json');
  const content = { 'letter.json': read('letter.json'), 'last-two.json': read('last-two.json'), 'auction.json': bank };
  let seed = 11;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ids = list => list.map(a => a.id).join(',');

  // العقد والسجل: يُلعب في رابط المعاينة وحده حتى تكتمل الشريحة.
  check('الوحدة تلتزم «عقد الوحدة»', checkMode(auction).length === 0);
  check('ملف أسئلته auction.json، وترتيبه 3', auction.contentKey === 'auction.json' && auction.order === 3 && auction.name === 'المزاد');
  check('في DRAFTS لا في MODES: لا يُختار في مباراة تُلعب قبل اكتمال الشريحة', DRAFTS.includes(auction) && !MODES.includes(auction)
    && !pickableModes({ pack: { excludeModes: [] }, files: content }).some(m => m.id === 'auction'));
  const draft = matchModes({ modes: [...MODES, ...DRAFTS], pack: { excludeModes: [] }, files: content });
  check('في المعاينة: مبنيّ في موضعه الثالث، والترتيب وحده معاينة', ids(draft) === 'letter,last-two,auction,ranking' && !draft[2].preview && draft[3].preview);
  check('حزمة تستثنيه لا يظهر فيها', !matchModes({ modes: [...MODES, ...DRAFTS], pack: { excludeModes: ['auction'] }, files: content }).some(m => m.id === 'auction'));

  // الإعداد: 3 مواضيع، سهل ثم متوسط ثم صعب، والافتتاح بالتناوب.
  const s0 = auction.setup({ content: bank, first: 2, seen: [], rng });
  check('3 مواضيع: سهل ثم متوسط ثم صعب', s0.topics.map(t => t.level).join(',') === 'easy,medium,hard');
  check('الافتتاح بالتناوب، ويبدأ من اختير (الثاني هنا): 2 ثم 1 ثم 2', s0.topics.map(t => t.opener).join(',') === '2,1,2');
  check('كل موضوع بقائمته المرجعية كاملة من الملف', s0.topics.every(t => t.items.length === bank.topics.find(b => b.id === t.id).items.length));
  const seenEasy = bank.topics.filter(t => t.level === 'easy').map(t => t.id).slice(0, -1);
  check('ذاكرة الأسئلة: الموضوع السهل مما لم يظهر', !seenEasy.includes(auction.setup({ content: bank, first: 1, seen: seenEasy, rng }).topics[0].id));
  check('used: المواضيع الثلاثة', auction.used(s0).length === 3);

  // الافتتاح.
  const start = first => R.startRound(auction, { content, scores: { 1: 0, 2: 0 }, first, rng });
  let r = start(1);
  let a = auction.audience(r.state);
  check('الافتتاح: سطر القاعدة و«يفتتح المزايدة» للمفتتح', a.screen === 'intro' && a.rule === 'زايدوا على ما تقدرون على ذكره، ثم أوفوا' && a.starter === 'يفتتح المزايدة' && a.turn === 1);
  check('الافتتاح: «اعرض الموضوع 1»', ids(auction.actions(r.state)) === 'show' && auction.actions(r.state)[0].label === 'اعرض الموضوع 1');

  // المزايدة.
  r = R.act(auction, r, 'show');
  a = auction.audience(r.state);
  const t0 = r.state.topics[0];
  check('الموضوع: نصه، والدور للمفتتح، ولا رقم بعد', a.screen === 'topic' && a.phase === 'bid' && a.topic === t0.topic && a.turn === 1 && a.bids.length === 0);
  check('لا عدّ قبل الالتزام', a.tally === null);
  let acts = auction.actions(r.state);
  check(`الافتتاح: «زايد» وحده (لا انسحاب)، يقترح ${OPEN_OFFER} وأقله 1`, ids(acts) === 'bid' && acts[0].offer === OPEN_OFFER && acts[0].min === 1 && acts[0].max === MAX_BID);
  check('«انسحب» في الافتتاح يُهمل', R.act(auction, r, 'pass').state === r.state);
  check('رقم 0 أو كسر أو فوق الحد يُهمل', ['bid:0', 'bid:2.5', 'bid:abc', `bid:${MAX_BID + 1}`].every(x => R.act(auction, r, x).state === r.state));
  r = R.act(auction, r, 'bid:5');
  a = auction.audience(r.state);
  check('زايد الأول بـ 5: يُسجَّل بلونه، والدور للثاني', a.bids.length === 1 && a.bids[0].team === 1 && a.bids[0].n === 5 && a.turn === 2);
  check('لحظة «bid» للرقم الجديد', r.events.some(e => e.type === 'moment' && e.name === 'bid' && e.team === 1));
  acts = auction.actions(r.state);
  check('بعده: «زايد» يبدأ بـ 6 ولا ينزل تحته، و«انسحب»', ids(acts) === 'bid,pass' && acts[0].min === 6 && acts[0].offer === 6);
  check('رقم لا يزيد على أعلى رقم يُهمل', R.act(auction, r, 'bid:5').state === r.state && R.act(auction, r, 'bid:4').state === r.state);
  r = R.act(auction, r, 'bid:7');
  r = R.act(auction, r, 'bid:9');
  a = auction.audience(r.state);
  check('ثلاثة أرقام بأصحابها بالتناوب: 5 ثم 7 ثم 9', a.bids.map(b => `${b.team}:${b.n}`).join(',') === '1:5,2:7,1:9' && a.turn === 2);
  check('النقاط لا تتغير في المزايدة', r.scores[1] === 0 && r.scores[2] === 0);

  // التراجع يعيد الرقم السابق والدور.
  const back = R.undo(r);
  check('التراجع: يعود آخر رقم ويعود الدور', auction.audience(back.state).bids.length === 2 && auction.audience(back.state).turn === 1);

  // الانسحاب: يلتزم صاحب أعلى رقم.
  r = R.act(auction, r, 'pass');
  a = auction.audience(r.state);
  check('انسحب الثاني: الأول ملتزم بـ 9، والدور له', a.phase === 'ready' && a.commit.team === 1 && a.commit.n === 9 && a.turn === 1);
  check('العدّ «0 من 9» بلون الملتزم، والعدّاد ثابت 60', a.tally.n === 0 && a.tally.of === 9 && a.tally.team === 1 && a.clock === FULFIL_SECONDS);
  check('لا عدّاد يبدأ مع الالتزام (يبدأ بـ «ابدأ»)', r.timer === null);
  check('لا أزرار مزايدة بعد الالتزام', !auction.actions(r.state).some(x => x.id === 'bid' || x.id === 'pass'));

  // الثاني يفتتح والأول ينسحب.
  let r2 = R.act(auction, start(2), 'show');
  r2 = R.act(auction, r2, 'bid:12');
  r2 = R.act(auction, r2, 'pass');
  check('افتتح الثاني بـ 12 وانسحب الأول: الثاني ملتزم بـ 12', auction.audience(r2.state).commit.team === 2 && auction.audience(r2.state).commit.n === 12);
  // أعلى رقم ممكن: لا «زايد» بعده، والانسحاب وحده.
  let r3 = R.act(auction, R.act(auction, start(1), 'show'), `bid:${MAX_BID}`);
  check(`بعد ${MAX_BID}: «انسحب» وحده`, ids(auction.actions(r3.state)) === 'pass');

  // لا القائمة ولا طولها ولا عناصرها في أي حالة من حالات الجمهور.
  const leaks = [];
  let rr = start(1);
  const states = [rr];
  for (const x of ['show', 'bid:3', 'bid:4', 'bid:8', 'pass']) { rr = R.act(auction, rr, x); states.push(rr); }
  for (const s of states) {
    const text = JSON.stringify(auction.audience(s.state));
    const t = s.state.topics[s.state.index];
    if (/"items"|"size"|"level"|"alts"|"note"/.test(text)) leaks.push('حقل');
    if (t.items.some(i => text.includes(`"${i.name}"`))) leaks.push('عنصر');
    if (text.includes(`"of":${t.items.length}`) && s.state.commit?.n !== t.items.length) leaks.push('طول');
  }
  check(`لا قائمة ولا طولها ولا مستوى على الجمهور (${leaks.join(',') || 'سليم'})`, leaks.length === 0);
  const pr = auction.presenter(states[3].state);
  check('المقدّم: القائمة المرجعية بصيغها، وطولها، والمستوى', pr.items.length === states[3].state.topics[0].items.length && pr.size === pr.items.length && pr.level === 'easy');
  check('مسار المواضيع للمقدّم: ثلاثة بأصحاب الافتتاح، والأول الآن', pr.track.map(x => x.owner).join(',') === '1,2,1' && pr.track[0].now && pr.track.every(x => x.result === null));

  // تتابع المباراة: المزاد يبدأ جولته في المعاينة (والعادي يتخطاه).
  const match = { ...M.newMatch({ pack: 'general', method: 'short' }), teams: { 1: 'أ', 2: 'ب' }, step: 'face', winner: 1,
    picks: [{ mode: 'auction', by: 1 }, { mode: 'letter', by: 2 }] };
  check('رابط عادي: جولة المزاد تُتخطى', P.nextKind(match, MODES) === 'skip');
  const all = [...MODES, ...DRAFTS];
  check('رابط المعاينة: جولة المزاد تبدأ', P.nextKind(match, all) === 'start');
  const m1 = P.startNext(match, { modes: all, content, rng });
  check('بدأت جولة المزاد بالافتتاح', m1.round.mode === 'auction' && auction.audience(m1.round.state).screen === 'intro');
  const m2 = P.act(P.act(m1, all, 'show'), all, 'bid:6');
  check('أفعال المزايدة تمرّ بالمشغّل: «bid:6»', auction.audience(m2.round.state).bids[0].n === 6);

  // الوفاء والعدّ (5.5): للملتزم 60 ثانية، وكل عنصر يذكره +1، فإن بلغ ما التزم به أخذ نقاطه.
  const commitAt = (n, first = 1) => { let x = R.act(auction, start(first), 'show'); x = R.act(auction, x, `bid:${n}`); return R.act(auction, x, 'pass'); };
  let f = commitAt(3);
  const ft = f.state.topics[0];
  check('الملتزم قبل «ابدأ»: «ابدأ العدّاد» والعدّ و«توقّف · لم يفِ»', ids(auction.actions(f.state)) === 'start,item,count,stop');
  f = R.act(auction, f, 'start');
  check(`«ابدأ»: عدّاد ${FULFIL_SECONDS} ثانية`, f.state.phase === 'fulfil' && f.timer?.seconds === FULFIL_SECONDS && f.events.some(e => e.type === 'timer' && e.seconds === FULFIL_SECONDS));
  const timerId = f.timer.id;
  f = R.act(auction, f, 'item:2');
  a = auction.audience(f.state);
  check('عنصر: +1 للعدّ بلون الملتزم، واسمه فيما ذُكر، والعدّاد يبقى يعدّ', a.tally.n === 1 && a.tally.of === 3 && a.tally.team === 1 && a.said.length === 1 && a.said[0].name === ft.items[2].name && a.said[0].team === 1
    && f.timer?.id === timerId && !f.events.some(e => e.type === 'stop-timer' || e.type === 'timer'));
  check('لحظة «said» للعنصر، ولا نقاط قبل الوفاء', f.events.some(e => e.type === 'moment' && e.name === 'said') && f.scores[1] === 0);
  check('العنصر نفسه مرة ثانية يُهمل (لا مكرر)', R.act(auction, f, 'item:2').state === f.state);
  check('موضع خارج القائمة أو بلا رقم يُهمل', ['item:-1', `item:${ft.items.length}`, 'item:x', 'item:', 'item'].every(x => R.act(auction, f, x).state === f.state));
  check('المقدّم: العنصر ممتلئ بلون من ذكره', auction.presenter(f.state).items[2].by === 1 && auction.presenter(f.state).items.filter(x => x.by).length === 1);
  check('القائمة لا تظهر على الجمهور قبل الحكم', a.list === undefined && a.verdict === null);
  f = R.act(auction, f, 'count');
  a = auction.audience(f.state);
  check('«صحيح · +1» دون اسم: يزيد العدّ، ولا اسم فيما ذُكر', a.tally.n === 2 && a.said.length === 1);
  const undone = R.undo(f);
  check('التراجع عن عنصر: يعود العدّ، والعدّاد يبقى', auction.audience(undone.state).tally.n === 1 && undone.timer?.id === timerId && undone.events.length === 0);
  f = R.act(auction, f, 'item:0');
  a = auction.audience(f.state);
  check('بلغ العدّ 3 من 3: يُحكم تلقائياً، +3 للملتزم، ولحظة «صحيحة»', f.state.phase === 'decided' && f.scores[1] === 3 && f.scores[2] === 0 && a.verdict.team === 1 && a.verdict.points === 3 && f.events.some(e => e.name === 'right'));
  check('يقف العدّاد مع الحكم', f.timer === null && f.events.some(e => e.type === 'stop-timer'));
  check('بعد الحكم: القائمة كلها، كل عنصر بمن ذكره (2 و0 للأول، والباقي 0)', a.list.length === ft.items.length && a.list[2].by === 1 && a.list[0].by === 1 && a.list.filter(x => x.by).length === 2);
  check('بعد الحكم: الحدّ عند من أخذ النقاط، ولا أزرار عدّ', a.turn === 1 && !auction.actions(f.state).some(x => x.id === 'item' || x.id === 'count'));
  check('مسار المواضيع: الموضوع الأول للأول', auction.presenter(f.state).track[0].result === 1);

  // التراجع عن الحكم أو عن «توقّف» يعيد الوفاء بما بقي من الوقت لا بوقته كاملاً (تقرير المعاين ش4، الوفاء والعدّ).
  const T = 1_000_000;
  let h = R.act(auction, commitAt(2), 'start', undefined, T);
  h = R.act(auction, h, 'item:0', undefined, T + 5000);
  const hd = R.act(auction, h, 'item:1', undefined, T + 10000);
  const hu = R.undo(hd, T + 20000);
  check('التراجع عن الحكم بعد 10 ثوانٍ: يعود الوفاء بـ 50 ثانية', hu.state.phase === 'fulfil' && Math.round(hu.timer.seconds) === 50 && hu.events.some(e => e.type === 'timer' && Math.round(e.seconds) === 50));
  const hu2 = R.undo(hu, T + 25000);
  check('ثم التراجع عن عنصر: العدّاد نفسه يبقى (لا وقت زائد)', hu2.timer.id === hu.timer.id && hu2.events.length === 0 && auction.audience(hu2.state).tally.n === 0);
  const hs = R.undo(R.act(auction, h, 'stop', undefined, T + 8000), T + 30000);
  check('التراجع عن «توقّف» بعد 8 ثوانٍ: يعود الوفاء بـ 52 ثانية', hs.state.phase === 'fulfil' && Math.round(hs.timer.seconds) === 52);
  check('التراجع عن «ابدأ»: لا عدّاد', R.undo(R.act(auction, commitAt(2), 'start', undefined, T), T + 3000).timer === null);

  // لم يفِ («توقّف» أو انتهى الوقت): إكمال الخصم في 15 ثانية، من حيث وقف العدّ، دون تكرار (5.5).
  let g = R.act(auction, commitAt(5, 2), 'start', undefined, T);
  g = R.act(auction, g, 'item:1', undefined, T + 1000);
  g = R.act(auction, g, 'item:2', undefined, T + 2000);
  const gs = R.act(auction, g, 'stop', undefined, T + 20000);
  a = auction.audience(gs.state);
  check(`«توقّف · لم يفِ»: الدور للخصم بعدّاد ${COMPLETE_SECONDS} ثانية، والعدّ «2 من 5» كما هو`, gs.state.phase === 'complete' && a.turn === 1 && gs.timer?.seconds === COMPLETE_SECONDS
    && a.tally.n === 2 && a.tally.of === 5 && a.clock === COMPLETE_SECONDS);
  check('لحظة الانتقال: «steal» للخصم، والبطاقة تهتز', gs.events.some(e => e.name === 'steal' && e.team === 1 && e.shake));
  check('إكمال الخصم: «صحيح · +1» و«توقّف · لا نقاط»', ids(auction.actions(gs.state)) === 'item,count,stop' && auction.actions(gs.state)[2].label === 'توقّف · لا نقاط');
  const gt = R.act(auction, g, 'timeout', g.timer.id, T + 60000);
  check('انتهى وقت الملتزم: كـ «توقّف»، والانتقال بلا «خاطئة»', gt.state.phase === 'complete' && gt.events.some(e => e.name === 'steal' && e.reason === 'timeout'));
  check('«انتهى الوقت» من عدّاد قديم يُهمل', R.act(auction, g, 'timeout', g.timer.id + 1).state === g.state);
  check('«توقّف» قبل «ابدأ» أيضاً', R.act(auction, commitAt(4), 'stop').state.phase === 'complete');
  check('ما ذكره الملتزم لا يُحسب للخصم ثانية', R.act(auction, gs, 'item:1').state === gs.state);
  let gc = R.act(auction, gs, 'item:0', undefined, T + 21000);
  a = auction.audience(gc.state);
  check('عنصر من الخصم: «3 من 5» بلونه، والعدّاد يبقى', a.tally.n === 3 && a.tally.team === 1 && a.said[2].team === 1 && gc.timer.id === gs.timer.id);
  gc = R.act(auction, R.act(auction, gc, 'item:3'), 'count');
  a = auction.audience(gc.state);
  check('أكمل الخصم: النقاط كاملة (5) له، ولا شيء للملتزم', gc.state.phase === 'decided' && gc.scores[1] === 5 && gc.scores[2] === 0 && a.verdict.team === 1 && a.verdict.points === 5 && a.turn === 1);
  check('بعد الحكم: القائمة كلها، ما ذكره كل فريق بلونه', a.list[1].by === 2 && a.list[2].by === 2 && a.list[0].by === 1 && a.list[3].by === 1);
  const gn = R.act(auction, gs, 'stop');
  a = auction.audience(gn.state);
  check('«توقّف · لا نقاط» من الخصم: لا يأخذ أحد شيئاً، والحدّ في المنتصف', gn.state.phase === 'decided' && gn.scores[1] === 0 && gn.scores[2] === 0 && a.verdict.team === 0 && a.turn === 0 && gn.timer === null);
  check('انتهى وقت الخصم: لا نقاط', R.act(auction, gs, 'timeout', gs.timer.id).state.phase === 'decided' && auction.audience(R.act(auction, gs, 'timeout', gs.timer.id).state).verdict.team === 0);
  check('مسار المواضيع: لا أحد', auction.presenter(gn.state).track[0].result === 0);
  // التراجع: عن الانتقال يعود الوفاء بما بقي (40 ثانية)، وعن الحكم يعود الإكمال بما بقي.
  const gu = R.undo(gs, T + 25000);
  check('التراجع عن الانتقال بعد 20 ثانية: الوفاء للملتزم بـ 40 ثانية', gu.state.phase === 'fulfil' && auction.audience(gu.state).turn === 2 && Math.round(gu.timer.seconds) === 40);
  const gnu = R.undo(R.act(auction, gs, 'stop', undefined, T + 26000), T + 30000);
  check('التراجع عن «لا نقاط» بعد 6 ثوانٍ من الإكمال: يعود الإكمال بـ 9 ثوانٍ', gnu.state.phase === 'complete' && Math.round(gnu.timer.seconds) === 9);

  // حالة محفوظة من «المزايدة» (بلا said) تكمل بعد التحديث.
  const old = commitAt(2); const { said, ...rest } = old.state;
  check('حالة محفوظة بلا said: العدّ 0 ويُعدّ عنصر', auction.audience(rest).tally.n === 0 && auction.audience(R.act(auction, { ...old, state: rest }, 'item:0').state).tally.n === 1);

  // حدّا المحتوى (design/auction.md 3): الموضوع 32 حرفاً واسم العنصر 20، تنبيهان لا خطآن.
  const { checkContent } = await import(path.join(root, 'js/content-check.js'));
  const pack = extra => { const b = JSON.parse(JSON.stringify(bank)); extra(b); return checkContent({ index: { packs: ['general'] }, packs: { general: { 'pack.json': read('pack.json'), 'auction.json': b } }, wheel: undefined }); };
  const ok = pack(() => {});
  check('البنك الحالي: لا تنبيه حدّ في المزاد', !ok.warnings.some(w => w.includes('والحد 32') || w.includes('والحد 20')));
  const long = pack(b => { b.topics[0].topic = 'م'.repeat(33); b.topics[0].items[0].name = 'ع'.repeat(21); });
  check('موضوع 33 حرفاً وعنصر 21: تنبيهان، لا خطأ', long.warnings.some(w => w.includes('الموضوع 33 حرفاً')) && long.warnings.some(w => w.includes('21 حرفاً، والحد 20')) && long.errors.length === ok.errors.length);

  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
