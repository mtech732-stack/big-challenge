// اختبار آلي لوحدة «المزاد» (js/modes/auction.js) في مرحلة «المزايدة»، دون متصفح.
const fs = require('fs');
const path = require('path');
const { reporter } = require('./helpers.cjs');

(async () => {
  const root = path.join(__dirname, '..');
  const auction = (await import(path.join(root, 'js/modes/auction.js'))).default;
  const { OPEN_OFFER, MAX_BID, FULFIL_SECONDS } = await import(path.join(root, 'js/modes/auction.js'));
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

  // حدّا المحتوى (design/auction.md 3): الموضوع 32 حرفاً واسم العنصر 20، تنبيهان لا خطآن.
  const { checkContent } = await import(path.join(root, 'js/content-check.js'));
  const pack = extra => { const b = JSON.parse(JSON.stringify(bank)); extra(b); return checkContent({ index: { packs: ['general'] }, packs: { general: { 'pack.json': read('pack.json'), 'auction.json': b } }, wheel: undefined }); };
  const ok = pack(() => {});
  check('البنك الحالي: لا تنبيه حدّ في المزاد', !ok.warnings.some(w => w.includes('والحد 32') || w.includes('والحد 20')));
  const long = pack(b => { b.topics[0].topic = 'م'.repeat(33); b.topics[0].items[0].name = 'ع'.repeat(21); });
  check('موضوع 33 حرفاً وعنصر 21: تنبيهان، لا خطأ', long.warnings.some(w => w.includes('الموضوع 33 حرفاً')) && long.warnings.some(w => w.includes('21 حرفاً، والحد 20')) && long.errors.length === ok.errors.length);

  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
