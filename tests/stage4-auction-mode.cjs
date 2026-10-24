// اختبار آلي لوحدة «المزاد» (js/modes/auction.js) بقاعدة المالك المصحّحة (5.5، design/auction.md 2.0)، دون متصفح:
// المزايدة رقماً رقماً من 1، و«العدد كاملاً» والإقفال للقائمة حتى 20، والإقفال بطول القائمة فوقها، و+2 للخصم إن لم يفِ الملتزم.
const fs = require('fs');
const path = require('path');
const { reporter } = require('./helpers.cjs');

(async () => {
  const root = path.join(__dirname, '..');
  const auction = (await import(path.join(root, 'js/modes/auction.js'))).default;
  const { FULFIL_SECONDS, FAIL_POINTS, SHOW_SIZE } = await import(path.join(root, 'js/modes/auction.js'));
  const { checkMode } = await import(path.join(root, 'js/modes/contract.js'));
  const { MODES, DRAFTS, matchModes, pickableModes } = await import(path.join(root, 'js/modes/index.js'));
  const R = await import(path.join(root, 'js/round.js'));
  const M = await import(path.join(root, 'js/match.js'));
  const P = await import(path.join(root, 'js/play.js'));
  const { check, finish } = reporter();
  const read = f => JSON.parse(fs.readFileSync(path.join(root, 'content/packs/general', f), 'utf8'));
  const bank = read('auction.json');
  const content = { 'letter.json': read('letter.json'), 'last-two.json': read('last-two.json'), 'auction.json': bank };
  // بنك ثابت لما بعد الإعداد: «أركان الإيمان» (6، سهل) و«أولو العزم» (5، متوسط) و«دول قارة أفريقيا» (54، صعب).
  const pick3 = ['أركان الإيمان', 'أولو العزم', 'دول قارة أفريقيا'];
  const small = { ...bank, topics: bank.topics.filter(t => pick3.includes(t.topic)) };
  const fixed = { ...content, 'auction.json': small };
  let seed = 11;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const ids = list => list.map(a => a.id).join(',');

  // العقد والسجل: اكتملت الشريحة بالتدقيق الأخير، فانتقل من DRAFTS إلى MODES ويُلعب في الرابط العادي.
  check('الوحدة تلتزم «عقد الوحدة»', checkMode(auction).length === 0);
  check('ملف أسئلته auction.json، وترتيبه 3', auction.contentKey === 'auction.json' && auction.order === 3 && auction.name === 'المزاد');
  check('في MODES لا في DRAFTS: يُختار في مباراة تُلعب', MODES.includes(auction) && !DRAFTS.includes(auction)
    && pickableModes({ pack: { excludeModes: [] }, files: content }).some(m => m.id === 'auction'));
  const draft = matchModes({ pack: { excludeModes: [] }, files: content });
  check('في الرابط العادي: مبنيّ في موضعه الثالث، والترتيب وحده معاينة', ids(draft) === 'letter,last-two,auction,ranking' && !draft[2].preview && draft[3].preview);
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
  const start = first => R.startRound(auction, { content: fixed, scores: { 1: 0, 2: 0 }, first, rng });
  let r = start(1);
  let a = auction.audience(r.state);
  check('الافتتاح: «زايدوا رقماً رقماً، ثم أوفوا» و«يفتتح المزايدة» للمفتتح', a.screen === 'intro' && a.rule === 'زايدوا رقماً رقماً، ثم أوفوا' && a.starter === 'يفتتح المزايدة' && a.turn === 1);
  check('الافتتاح: «اعرض الموضوع 1»', ids(auction.actions(r.state)) === 'show' && auction.actions(r.state)[0].label === 'اعرض الموضوع 1');
  check('البنك الثابت: 6 ثم 5 ثم 54', r.state.topics.map(t => t.items.length).join(',') === '6,5,54');

  // المزايدة رقماً رقماً (القائمة 6، حتى 20).
  r = R.act(auction, r, 'show');
  a = auction.audience(r.state);
  const t0 = r.state.topics[0];
  check('الموضوع: نصه، والدور للمفتتح، ولا رقم بعد، و«في القائمة 6»', a.screen === 'topic' && a.phase === 'bid' && a.topic === t0.topic && a.turn === 1 && a.bids.length === 0 && a.size === 6);
  check('لا عدّ قبل الالتزام', a.tally === null);
  let acts = auction.actions(r.state);
  check('الافتتاح: «زايد · 1» و«العدد كاملاً · 6»، ولا «توقّف»', ids(acts) === 'bid,full' && acts[0].label === 'زايد · 1' && acts[0].n === 1 && acts[1].label === 'العدد كاملاً · 6' && acts[1].short === 'كاملاً · 6');
  check('«توقّف» في الدور الأول للمفتتح يُهمل', R.act(auction, r, 'stop').state === r.state);
  check('رقم غير التالي يُهمل: 0 و2 و5 وكسر ونص', ['bid:0', 'bid:2', 'bid:5', 'bid:1.5', 'bid:abc', 'bid'].every(x => R.act(auction, r, x).state === r.state));
  r = R.act(auction, r, 'bid:1');
  a = auction.audience(r.state);
  check('زايد الأول بـ 1: يُسجَّل بلونه، والدور (والحدّ) للثاني', a.bids.length === 1 && a.bids[0].team === 1 && a.bids[0].n === 1 && a.turn === 2);
  check('لحظة «bid» للرقم الجديد', r.events.some(e => e.type === 'moment' && e.name === 'bid' && e.team === 1));
  acts = auction.actions(r.state);
  check('بعده: «زايد · 2» و«العدد كاملاً · 6» و«توقّف»', ids(acts) === 'bid,full,stop' && acts[0].label === 'زايد · 2');
  check('نقرة متأخرة بالرقم السابق (bid:1) تُهمل، وقفزة (bid:4) تُهمل', R.act(auction, r, 'bid:1').state === r.state && R.act(auction, r, 'bid:4').state === r.state);
  r = R.act(auction, r, 'bid:2');
  r = R.act(auction, r, 'bid:3');
  a = auction.audience(r.state);
  check('ثلاثة أرقام بالتناوب: 1 ثم 2 ثم 3، والدور للثاني', a.bids.map(b => `${b.team}:${b.n}`).join(',') === '1:1,2:2,1:3' && a.turn === 2);
  check('النقاط لا تتغير في المزايدة', r.scores[1] === 0 && r.scores[2] === 0);
  const back = R.undo(r);
  check('التراجع: يعود آخر رقم ويعود الدور', auction.audience(back.state).bids.length === 2 && auction.audience(back.state).turn === 1);

  // التوقف: يلتزم الخصم بآخر رقم ذكره.
  let rs = R.act(auction, r, 'stop');
  a = auction.audience(rs.state);
  check('توقّف الثاني: الأول ملتزم بـ 3، والدور له، ولا «في القائمة»', a.phase === 'ready' && a.commit.team === 1 && a.commit.n === 3 && a.turn === 1 && a.size === undefined);
  check('العدّ «0 من 3» بلون الملتزم، والعدّاد ثابت 60', a.tally.n === 0 && a.tally.of === 3 && a.tally.team === 1 && a.clock === FULFIL_SECONDS && FULFIL_SECONDS === 60);
  check('لا عدّاد يبدأ مع الالتزام (يبدأ بـ «ابدأ»)', rs.timer === null);
  check('لا أزرار مزايدة بعد الالتزام', !auction.actions(rs.state).some(x => x.id === 'bid' || x.id === 'full'));

  // «العدد كاملاً»: من المفتتح في دوره الأول، ومن الخصم في دوره.
  let rf = R.act(auction, R.act(auction, start(2), 'show'), 'full');
  a = auction.audience(rf.state);
  check('«العدد كاملاً» من المفتتح (الثاني): يُقفل المزاد له بـ 6', a.phase === 'ready' && a.commit.team === 2 && a.commit.n === 6 && a.bids.length === 1 && a.bids[0].n === 6 && a.bids[0].full && a.turn === 2);
  rf = R.act(auction, R.act(auction, R.act(auction, start(1), 'show'), 'bid:1'), 'full');
  check('«العدد كاملاً» من الخصم في دوره: يُقفل له', auction.audience(rf.state).commit.team === 2 && auction.audience(rf.state).commit.n === 6);
  // الإقفال التلقائي: بلغت المزايدة العدد.
  let ra = R.act(auction, start(1), 'show');
  for (let n = 1; n <= 5; n++) ra = R.act(auction, ra, `bid:${n}`);
  check('بعد 5 من 6: «زايد · 6» ما زال', auction.actions(ra.state)[0].label === 'زايد · 6' && ra.state.phase === 'bid');
  ra = R.act(auction, ra, 'bid:6');
  check('بلغت المزايدة 6 من 6 (الثاني): أُقفل المزاد له تلقائياً', ra.state.phase === 'ready' && ra.state.commit.team === 2 && ra.state.commit.n === 6);

  // القائمة فوق 20 (أفريقيا 54): العدد مخفي، ولا «العدد كاملاً»، والإقفال بطولها.
  let rh = R.act(auction, start(1), 'show');
  rh = { ...rh, state: { ...rh.state, index: 2, team: 1 } };
  acts = auction.actions(rh.state);
  check('فوق 20: «زايد · 1» وحده في الافتتاح، ولا عدد للجمهور', ids(acts) === 'bid' && auction.audience(rh.state).size === undefined && !JSON.stringify(auction.audience(rh.state)).includes('54'));
  check('فوق 20: «العدد كاملاً» يُهمل', R.act(auction, rh, 'full').state === rh.state);
  check('المقدّم يرى الطول دائماً (54)، وshown خطأ', auction.presenter(rh.state).size === 54 && auction.presenter(rh.state).shown === false && auction.presenter(r.state).shown === true);
  for (let n = 1; n <= 53; n++) rh = R.act(auction, rh, `bid:${n}`);
  check('فوق 20 بعد 53: «زايد · 54» و«توقّف»', ids(auction.actions(rh.state)) === 'bid,stop' && auction.actions(rh.state)[0].n === 54);
  rh = R.act(auction, rh, 'bid:54');
  check('بلغ الرقم طول القائمة (54): أُقفل المزاد تلقائياً', rh.state.phase === 'ready' && rh.state.commit.n === 54);

  // لا القائمة ولا عناصرها في أي حالة من حالات الجمهور، ولا طولها إلا «في القائمة» للقائمة حتى 20 في المزايدة.
  const leaks = [];
  let rr = start(1);
  const states = [rr];
  for (const x of ['show', 'bid:1', 'bid:2', 'bid:3', 'stop', 'start', 'item:0']) { rr = R.act(auction, rr, x); states.push(rr); }
  for (const s of states) {
    const au = auction.audience(s.state);
    const text = JSON.stringify(au);
    const t = s.state.topics[s.state.index];
    if (/"items"|"level"|"alts"|"note"/.test(text)) leaks.push('حقل');
    if ('size' in au && au.size !== undefined && !(s.state.phase === 'bid' && t.items.length <= SHOW_SIZE)) leaks.push('طول');
    const said = new Set((s.state.said ?? []).map(x => x.i));
    if (t.items.some((i, k) => !said.has(k) && text.includes(`"${i.name}"`))) leaks.push('عنصر');
  }
  check(`لا قائمة ولا عنصر لم يُذكر ولا مستوى على الجمهور، والطول في المزايدة وحدها (${leaks.join(',') || 'سليم'})`, leaks.length === 0);
  const pr = auction.presenter(states[3].state);
  check('المقدّم: القائمة المرجعية بصيغها، وطولها، والمستوى', pr.items.length === states[3].state.topics[0].items.length && pr.size === pr.items.length && pr.level === 'easy');
  check('مسار المواضيع للمقدّم: ثلاثة بأصحاب الافتتاح، والأول الآن', pr.track.map(x => x.owner).join(',') === '1,2,1' && pr.track[0].now && pr.track.every(x => x.result === null));

  // تتابع المباراة: المزاد يبدأ جولته في الرابط العادي.
  const match = { ...M.newMatch({ pack: 'general', method: 'short' }), teams: { 1: 'أ', 2: 'ب' }, step: 'face', winner: 1,
    picks: [{ mode: 'auction', by: 1 }, { mode: 'letter', by: 2 }] };
  check('رابط عادي: جولة المزاد تبدأ', P.nextKind(match, MODES) === 'start');
  const all = [...MODES, ...DRAFTS];
  const m1 = P.startNext(match, { modes: all, content, rng });
  check('بدأت جولة المزاد بالافتتاح', m1.round.mode === 'auction' && auction.audience(m1.round.state).screen === 'intro');
  const m2 = P.act(P.act(m1, all, 'show'), all, 'bid:1');
  check('أفعال المزايدة تمرّ بالمشغّل: «bid:1»', auction.audience(m2.round.state).bids[0].n === 1);
  check('والمشغّل يهمل «bid:3» في دور الثاني', P.act(m2, all, 'bid:3').round.state === m2.round.state);

  // الوفاء والعدّ (5.5): للملتزم 60 ثانية، وكل عنصر يذكره +1، فإن بلغ ما التزم به أخذ نقاطه.
  // commitAt(n, first): المفتتح يزايد حتى يذكر n (بالتناوب)، ثم يتوقف الآخر.
  const commitAt = (n, first = 1, topic = 0) => {
    let x = R.act(auction, start(first), 'show');
    if (topic) x = { ...x, state: { ...x.state, index: topic, team: first } };
    // يبدأ المفتتح بـ 1، والأرقام بالتناوب: إن كان n زوجياً ذكره الخصم، فيلتزم الخصم.
    for (let k = 1; k <= n; k++) x = R.act(auction, x, `bid:${k}`);
    return R.act(auction, x, 'stop');
  };
  let f = commitAt(3);
  const ft = f.state.topics[0];
  check('الملتزم قبل «ابدأ»: «ابدأ العدّاد» والعدّ و«توقّف · لم يفِ»', ids(auction.actions(f.state)) === 'start,item,count,stop' && f.state.commit.team === 1 && f.state.commit.n === 3);
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
  check('بعد الحكم: القائمة كلها، كل عنصر بمن ذكره', a.list.length === ft.items.length && a.list[2].by === 1 && a.list[0].by === 1 && a.list.filter(x => x.by).length === 2);
  check('بعد الحكم: الحدّ عند من أخذ النقاط، ولا أزرار عدّ', a.turn === 1 && !auction.actions(f.state).some(x => x.id === 'item' || x.id === 'count'));
  check('مسار المواضيع: الموضوع الأول للأول', auction.presenter(f.state).track[0].result === 1);

  // التراجع عن الحكم يعيد الوفاء بما بقي من الوقت لا بوقته كاملاً.
  const T = 1_000_000;
  let h = R.act(auction, commitAt(2), 'start', undefined, T);
  h = R.act(auction, h, 'item:0', undefined, T + 5000);
  const hd = R.act(auction, h, 'item:1', undefined, T + 10000);
  const hu = R.undo(hd, T + 20000);
  check('التراجع عن الحكم بعد 10 ثوانٍ: يعود الوفاء بـ 50 ثانية', hu.state.phase === 'fulfil' && Math.round(hu.timer.seconds) === 50 && hu.events.some(e => e.type === 'timer' && Math.round(e.seconds) === 50));
  const hu2 = R.undo(hu, T + 25000);
  check('ثم التراجع عن عنصر: العدّاد نفسه يبقى (لا وقت زائد)', hu2.timer.id === hu.timer.id && hu2.events.length === 0 && auction.audience(hu2.state).tally.n === 0);
  check('التراجع عن «ابدأ»: لا عدّاد', R.undo(R.act(auction, commitAt(2), 'start', undefined, T), T + 3000).timer === null);

  // لم يفِ («توقّف» أو انتهى الوقت): الخصم يأخذ نقطتين ثابتتين، ولا إكمال (5.5، المالك).
  let g = commitAt(5, 2);
  check('المفتتح الثاني ذكر 5 وتوقف الأول: الثاني ملتزم بـ 5', g.state.commit.team === 2 && g.state.commit.n === 5);
  g = R.act(auction, g, 'start', undefined, T);
  g = R.act(auction, g, 'item:1', undefined, T + 1000);
  g = R.act(auction, g, 'item:2', undefined, T + 2000);
  const gs = R.act(auction, g, 'stop', undefined, T + 20000);
  a = auction.audience(gs.state);
  check(`«توقّف · لم يفِ»: +${FAIL_POINTS} للخصم (الأول)، ولا شيء للملتزم، والحكم فوراً`, FAIL_POINTS === 2 && gs.state.phase === 'decided' && gs.scores[1] === 2 && gs.scores[2] === 0
    && a.verdict.team === 1 && a.verdict.points === 2 && a.turn === 1);
  check('لا عدّاد بعدها، ولحظة «fail» للخصم (بهزة «خاطئة»)', gs.timer === null && gs.events.some(e => e.type === 'stop-timer') && gs.events.some(e => e.name === 'fail' && e.team === 1 && e.reason === 'wrong')
    && !gs.events.some(e => e.type === 'timer'));
  check('بعد الحكم: «الموضوع التالي» وحده، والعدّ «2 من 5» والقائمة كلها', ids(auction.actions(gs.state)) === 'next' && a.tally.n === 2 && a.tally.of === 5 && a.tally.team === 2 && a.list.length === gs.state.topics[0].items.length);
  const gt = R.act(auction, g, 'timeout', g.timer.id, T + 60000);
  check('انتهى وقت الملتزم: +2 للخصم كـ «توقّف»، بلا «خاطئة»', gt.state.phase === 'decided' && gt.scores[1] === 2 && gt.events.some(e => e.name === 'fail' && e.reason === 'timeout'));
  check('«انتهى الوقت» من عدّاد قديم يُهمل', R.act(auction, g, 'timeout', g.timer.id + 1).state === g.state);
  const g0 = R.act(auction, commitAt(4), 'stop');
  check('«توقّف» قبل «ابدأ» أيضاً: ذكر الثاني 4 فالتزم، والأول يأخذ 2', g0.state.commit?.team === 2 && g0.state.phase === 'decided' && g0.scores[1] === 2);
  check('مسار المواضيع: الموضوع للخصم', auction.presenter(gs.state).track[0].result === 1);
  const gu = R.undo(gs, T + 25000);
  check('التراجع عن «لم يفِ» بعد 20 ثانية: الوفاء للملتزم بـ 40 ثانية، والنقطتان تعودان', gu.state.phase === 'fulfil' && auction.audience(gu.state).turn === 2 && Math.round(gu.timer.seconds) === 40 && gu.scores[1] === 0);
  // حالة محفوظة في «إكمال الخصم» من نسخة سابقة: «توقّف» يحسمها بنقطتين لمن عليه الدور.
  const oldc = { ...g, state: { ...g.state, phase: 'complete', team: 1 } };
  check('حالة «إكمال» محفوظة: «توقّف» وحده، فيأخذ الخصم 2', ids(auction.actions(oldc.state)) === 'stop' && R.act(auction, oldc, 'stop').scores[1] === 2);

  // تتابع الجولة: «الموضوع التالي» يعرض الموضوع التالي فوراً للمزايدة بمفتتحه، وبعد الثالث «إنهاء الجولة».
  let q = commitAt(1, 1);
  q = R.act(auction, q, 'item:0');
  check('بعد الحكم: «الموضوع التالي» وحده', q.state.phase === 'decided' && ids(auction.actions(q.state)) === 'next' && auction.actions(q.state)[0].label === 'الموضوع التالي' && q.scores[1] === 1);
  q = R.act(auction, q, 'next');
  a = auction.audience(q.state);
  check('الموضوع 2: يظهر للمزايدة فوراً، ويفتتحه الثاني، بلا أرقام ولا عدّ، و«في القائمة 5»', q.state.index === 1 && a.screen === 'topic' && a.phase === 'bid' && a.n === 2 && a.turn === 2 && a.owner === 2
    && !a.bids.length && a.tally === null && !a.said.length && a.verdict === null && a.list === undefined && a.topic === q.state.topics[1].topic && a.size === 5);
  check('التراجع عن «الموضوع التالي»: يعود الحكم', R.undo(q).state.index === 0 && R.undo(q).state.phase === 'decided');
  // الثاني يأخذ العدد كاملاً (5) ولا يفي: للأول نقطتان.
  q = R.act(auction, R.act(auction, q, 'full'), 'start');
  q = R.act(auction, R.act(auction, q, 'item:0'), 'stop');
  check('الموضوع 2: أخذ الثاني العدد كاملاً ولم يفِ، فللأول 2 (رصيده 3)', q.state.phase === 'decided' && q.scores[1] === 3 && q.scores[2] === 0);
  q = R.act(auction, q, 'next');
  check('الموضوع 3 (54): يفتتحه الأول، بلا «في القائمة»', q.state.index === 2 && auction.audience(q.state).turn === 1 && auction.audience(q.state).size === undefined);
  q = R.act(auction, R.act(auction, R.act(auction, q, 'bid:1'), 'bid:2'), 'stop');
  q = R.act(auction, R.act(auction, R.act(auction, q, 'start'), 'item:5'), 'item:9');
  check('الموضوع 3: ذكر الثاني 2 فالتزم ووفى (+2)، و«إنهاء الجولة»', q.state.phase === 'decided' && q.scores[2] === 2 && auction.actions(q.state)[0].label === 'إنهاء الجولة');
  check('مسار المواضيع: الأول · الأول · الثاني', auction.presenter(q.state).track.map(x => x.result).join(',') === '1,1,2');
  q = R.act(auction, q, 'next');
  a = auction.audience(q.state);
  check('نهاية الجولة: الحصيلة الأول 3 والثاني 2، وانتهت', a.screen === 'end' && a.totals[1] === 3 && a.totals[2] === 2 && auction.finished(q.state) && !auction.actions(q.state).length);
  check('بعد النهاية: لا فعل يُقبل', R.act(auction, q, 'next').state === q.state);

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
