// اختبار آلي لوحدة «المزاد» (js/modes/auction.js) بقاعدة المالك (5.5، design/auction.md 3.0)، دون متصفح:
// المزايدة حرة فوق رقم الخصم (زر لكل فريق، كل نقرة +1)، و«ابدأ» يرسي على الأعلى ويبدأ الوفاء، والسقف طول القائمة، و+2 للخصم إن لم يفِ.
const fs = require('fs');
const path = require('path');
const { reporter } = require('./helpers.cjs');

(async () => {
  const root = path.join(__dirname, '..');
  const auction = (await import(path.join(root, 'js/modes/auction.js'))).default;
  const { FULFIL_SECONDS, FAIL_POINTS, OPEN_MAX } = await import(path.join(root, 'js/modes/auction.js'));
  const { checkMode } = await import(path.join(root, 'js/modes/contract.js'));
  const { MODES, DRAFTS, matchModes, pickableModes } = await import(path.join(root, 'js/modes/index.js'));
  const R = await import(path.join(root, 'js/round.js'));
  const M = await import(path.join(root, 'js/match.js'));
  const P = await import(path.join(root, 'js/play.js'));
  const { check, finish } = reporter();
  const read = f => JSON.parse(fs.readFileSync(path.join(root, 'content/packs/general', f), 'utf8'));
  const bank = read('auction.json');
  const content = { 'letter.json': read('letter.json'), 'last-two.json': read('last-two.json'), 'auction.json': bank };
  // بنك ثابت لما بعد الإعداد، لا يعتمد على اسم قائمة بعينها: من أطول قائمة في البنك (فوق 20) قائمتان قصيرتان 12 (سهل) و10 (متوسط)،
  // ثم أطول قائمة كما هي (صعب). كلها مغلقة (بلا open) ليُختبر سقف القائمة، والمفتوح في قسمه.
  const longest = bank.topics.reduce((x, t) => (t.items.length > x.items.length ? t : x));
  const cut = (n, level, k) => ({ ...longest, open: undefined, id: `fixed-${k}`, level, topic: `قائمة ${n}`, items: longest.items.slice(0, n) });
  const small = { ...bank, topics: [cut(12, 'easy', 1), cut(10, 'medium', 2), { ...longest, open: undefined, level: 'hard' }] };
  const L = longest.items.length;
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
  check('في الرابط العادي: مبنيّ في موضعه الثالث (والترتيب بعده مبنيّ منذ ش5)', ids(draft).startsWith('letter,last-two,auction') && !draft[2].preview && !draft.some(m => m.preview));
  check('حزمة تستثنيه لا يظهر فيها', !matchModes({ modes: [...MODES, ...DRAFTS], pack: { excludeModes: ['auction'] }, files: content }).some(m => m.id === 'auction'));

  // الإعداد: 3 مواضيع، سهل ثم متوسط ثم صعب، ولا مفتتح (3.0).
  const s0 = auction.setup({ content: bank, first: 2, seen: [], rng });
  check('3 مواضيع: سهل ثم متوسط ثم صعب', s0.topics.map(t => t.level).join(',') === 'easy,medium,hard');
  check('لا مفتتح ولا رقم: الحدّ في المنتصف، والرقمان 0', s0.team === 0 && s0.nums.join(',') === '0,0' && s0.topics.every(t => !('opener' in t)));
  check('كل موضوع بقائمته المرجعية كاملة من الملف', s0.topics.every(t => t.items.length === bank.topics.find(b => b.id === t.id).items.length));
  const seenEasy = bank.topics.filter(t => t.level === 'easy').map(t => t.id).slice(0, -1);
  check('ذاكرة الأسئلة: الموضوع السهل مما لم يظهر', !seenEasy.includes(auction.setup({ content: bank, first: 1, seen: seenEasy, rng }).topics[0].id));
  check('used: المواضيع الثلاثة', auction.used(s0).length === 3);

  // الافتتاح.
  const start = first => R.startRound(auction, { content: fixed, scores: { 1: 0, 2: 0 }, first, rng });
  let r = start(1);
  let a = auction.audience(r.state);
  check('الافتتاح: «زايدوا على ما تقدرون على ذكره، ثم أوفوا» و«ثلاثة مواضيع»، والحدّ في المنتصف', a.screen === 'intro' && a.rule === 'زايدوا على ما تقدرون على ذكره، ثم أوفوا' && a.starter === 'ثلاثة مواضيع' && a.turn === 0);
  check('الافتتاح: «اعرض الموضوع 1»', ids(auction.actions(r.state)) === 'show' && auction.actions(r.state)[0].label === 'اعرض الموضوع 1');
  check(`البنك الثابت: 12 ثم 10 ثم ${L} (فوق 20)`, r.state.topics.map(t => t.items.length).join(',') === `12,10,${L}` && L > 20);

  // المزايدة الحرة (القائمة 12، حتى 20).
  r = R.act(auction, r, 'show');
  a = auction.audience(r.state);
  const t0 = r.state.topics[0];
  check('الموضوع: نصه، والحدّ في المنتصف، ولا رقم بعد، والعدد مخفي دائماً (المالك، 30 أكتوبر)', a.screen === 'topic' && a.phase === 'bid' && a.topic === t0.topic && a.turn === 0 && a.bids.length === 0 && a.size === undefined);
  check('لا عدّ قبل الالتزام', a.tally === null);
  let acts = auction.actions(r.state);
  const raiseOf = (st, t) => auction.actions(st).find(x => x.id === 'raise' && x.team === t);
  check('قبل أول رقم: زرّا الفريقين «زايد» (التالي 1)، ولا «ابدأ»', ids(acts) === 'raise,raise' && acts.every(x => x.label === 'زايد' && x.next === 1 && x.n === 0) && acts.map(x => x.team).join(',') === '1,2');
  check('«ابدأ» قبل أول رقم يُهمل', R.act(auction, r, 'start').state === r.state);
  check('فريق غير صحيح يُهمل: raise وraise:0 وraise:3 ونص', ['raise', 'raise:0', 'raise:3', 'raise:x'].every(x => R.act(auction, r, x).state === r.state));
  r = R.act(auction, r, 'raise:2');
  a = auction.audience(r.state);
  check('أول نقرة للثاني: رقمه 1، والحدّ ثابت في المنتصف', a.bids.length === 1 && a.bids[0].team === 2 && a.bids[0].n === 1 && a.bids[0].top && a.turn === 0);
  check('لحظة «bid» للنقرة', r.events.some(e => e.type === 'moment' && e.name === 'bid' && e.team === 2));
  check('بعدها: زر الأول «زايد» (التالي 2) وزر الثاني «1» (التالي 2) و«ابدأ»', ids(auction.actions(r.state)) === 'raise,raise,start' && raiseOf(r.state, 1).label === 'زايد' && raiseOf(r.state, 1).next === 2 && raiseOf(r.state, 2).label === '1' && raiseOf(r.state, 2).next === 2);
  for (let k = 0; k < 7; k++) r = R.act(auction, r, 'raise:2');
  check('سبع نقرات أخرى للثاني: 8 (كل نقرة +1)', auction.audience(r.state).bids[0].n === 8);
  r = R.act(auction, r, 'raise:1');
  a = auction.audience(r.state);
  check('أول نقرة للأول: رقم الخصم + 1 = 9، وهو الأعلى', a.bids.map(b => `${b.team}:${b.n}${b.top ? '*' : ''}`).join(',') === '1:9*,2:8' && a.turn === 0);
  r = R.act(auction, r, 'raise:2');
  check('نقرة الثاني: فوق 9 بواحد = 10 (لا تساوي)', auction.audience(r.state).bids.map(b => `${b.team}:${b.n}`).join(',') === '1:9,2:10');
  r = R.act(auction, R.act(auction, r, 'raise:2'), 'raise:1');
  check('الثاني 11 ثم الأول 12', auction.audience(r.state).bids.map(b => `${b.team}:${b.n}${b.top ? '*' : ''}`).join(',') === '1:12*,2:11');
  check('بلغ الأول 12 من 12: يغيب زرّاه (الأول والثاني فوق 12)، و«ابدأ» وحده', ids(auction.actions(r.state)) === 'start' && R.act(auction, r, 'raise:1').state === r.state && R.act(auction, r, 'raise:2').state === r.state);
  check('النقاط لا تتغير في المزايدة', r.scores[1] === 0 && r.scores[2] === 0);
  const back = R.undo(r);
  check('التراجع: يعود آخر رقم (الأول 9)', auction.audience(back.state).bids.map(b => `${b.team}:${b.n}`).join(',') === '1:9,2:11');

  // «ابدأ»: يرسو على الأعلى، ويبدأ الوفاء فوراً.
  let rs = R.act(auction, back, 'start');
  a = auction.audience(rs.state);
  check('«ابدأ»: رسا على الثاني بـ 11، والحدّ له، ولا «في القائمة» ولا أرقام', a.phase === 'fulfil' && a.commit.team === 2 && a.commit.n === 11 && a.turn === 2 && a.size === undefined && a.bids.length === 0);
  check(`ويبدأ عدّاد الوفاء فوراً (${FULFIL_SECONDS} ثانية)`, rs.timer?.seconds === FULFIL_SECONDS && FULFIL_SECONDS === 45 && rs.events.some(e => e.type === 'timer' && e.seconds === FULFIL_SECONDS));
  check('العدّ «0 من 11» بلون الملتزم', a.tally.n === 0 && a.tally.of === 11 && a.tally.team === 2 && a.clock === FULFIL_SECONDS);
  check('الوفاء (1.14): «عُدّ · +1» و«كشف القائمة»، ولا أزرار مزايدة', ids(auction.actions(rs.state)) === 'count,reveal' && auction.actions(rs.state)[0].label === 'عُدّ · +1' && R.act(auction, rs, 'raise:1').state === rs.state);
  check('التراجع عن «ابدأ»: تعود المزايدة بلا عدّاد', R.undo(rs).state.phase === 'bid' && R.undo(rs).timer === null);

  // القائمة فوق 20: العدد مخفي، والسقف طولها.
  let rh = R.act(auction, start(1), 'show');
  rh = { ...rh, state: { ...rh.state, index: 2 } };
  check('فوق 20: زرّا الفريقين، ولا عدد للجمهور', ids(auction.actions(rh.state)) === 'raise,raise' && auction.audience(rh.state).size === undefined && !JSON.stringify(auction.audience(rh.state)).includes(String(L)));
  check(`نص الباركود يحمل القائمة كلها (${L})، ولا يظهر طولها للجمهور`, auction.presenter(rh.state).items.length === L && auction.audience(rh.state).size === undefined);
  for (let k = 0; k < L - 1; k++) rh = R.act(auction, rh, 'raise:1');
  check(`فوق 20 بعد ${L - 1}: الأول ما زال يزايد، والثاني إلى ${L}`, raiseOf(rh.state, 1)?.next === L && raiseOf(rh.state, 2)?.next === L);
  rh = R.act(auction, rh, 'raise:2');
  check(`بلغ الثاني طول القائمة (${L}): لا زر لأحد، و«ابدأ» يرسي عليه`, ids(auction.actions(rh.state)) === 'start' && R.act(auction, rh, 'start').state.commit.team === 2 && R.act(auction, rh, 'start').state.commit.n === L);

  // لا القائمة ولا عناصرها في أي حالة من حالات الجمهور، ولا طولها إلا «في القائمة» للقائمة حتى 20 في المزايدة.
  const leaks = [];
  let rr = start(1);
  const states = [rr];
  for (const x of ['show', 'raise:1', 'raise:2', 'raise:1', 'start', 'count']) { rr = R.act(auction, rr, x); states.push(rr); }
  for (const s of states) {
    const au = auction.audience(s.state);
    const text = JSON.stringify(au);
    const t = s.state.topics[s.state.index];
    if (/"items"|"level"|"alts"|"note"/.test(text)) leaks.push('حقل');
    if ('size' in au && au.size !== undefined) leaks.push('طول');
    const said = new Set((s.state.said ?? []).map(x => x.i));
    if (t.items.some((i, k) => !said.has(k) && text.includes(`"${i.name}"`))) leaks.push('عنصر');
  }
  check(`لا قائمة ولا عنصر ولا مستوى على الجمهور قبل الكشف، والطول في المزايدة وحدها (${leaks.join(',') || 'سليم'})`, leaks.length === 0);
  const pr = auction.presenter(states[3].state);
  check('نص الباركود: الموضوع والقائمة بصيغها، والمستوى في الحالة', pr.topic === states[3].state.topics[0].topic && pr.items.length === states[3].state.topics[0].items.length && pr.items.every(x => Array.isArray(x.alts)) && states[3].state.topics[0].level === 'easy');
  check('المواضيع الثلاثة بلا نتيجة، والأول الآن', states[3].state.results.length === 3 && states[3].state.results.every(x => x === null) && states[3].state.index === 0);
  check('الافتتاح والنهاية: لا قائمة في نص الباركود', auction.presenter(states[0].state).items.length === 0);

  // تتابع المباراة: المزاد يبدأ جولته في الرابط العادي.
  const match = { ...M.newMatch({ pack: 'general', method: 'short' }), teams: { 1: 'أ', 2: 'ب' }, step: 'face', winner: 1,
    picks: [{ mode: 'auction', by: 1 }, { mode: 'letter', by: 2 }] };
  check('رابط عادي: جولة المزاد تبدأ', P.nextKind(match, MODES) === 'start');
  const all = [...MODES, ...DRAFTS];
  const m1 = P.startNext(match, { modes: all, content, rng });
  check('بدأت جولة المزاد بالافتتاح', m1.round.mode === 'auction' && auction.audience(m1.round.state).screen === 'intro');
  const m2 = P.act(P.act(m1, all, 'show'), all, 'raise:1');
  check('أفعال المزايدة تمرّ بالمشغّل: «raise:1»', auction.audience(m2.round.state).bids[0].n === 1);
  check('ونقرتان متتابعتان تُحسبان كلتاهما (2)', auction.audience(P.act(m2, all, 'raise:1').round.state).bids[0].n === 2);

  // الوفاء والعدّ (5.5): للملتزم 45 ثانية، وكل عنصر يذكره +1، فإن بلغ ما التزم به أخذ نقاطه.
  // commitAt(n, team): يرسو المزاد على team بـ n (يزايد الخصم أولاً إن كان n فوق 1)، ثم «ابدأ».
  const commitAt = (n, team = 1, topic = 0, now) => {
    let x = R.act(auction, start(1), 'show');
    if (topic) x = { ...x, state: { ...x.state, index: topic } };
    if (n > 1) x = R.act(auction, x, `raise:${team === 1 ? 2 : 1}`);
    while (auction.audience(x.state).bids.find(b => b.team === team)?.n !== n) x = R.act(auction, x, `raise:${team}`);
    return R.act(auction, x, 'start', undefined, now);
  };
  let f = commitAt(3);
  const ft = f.state.topics[0];
  check('رسا على الأول بـ 3: الوفاء بعدّاده', f.state.phase === 'fulfil' && f.state.commit.team === 1 && f.state.commit.n === 3 && f.timer?.seconds === FULFIL_SECONDS);
  const timerId = f.timer.id;
  f = R.act(auction, f, 'count');
  a = auction.audience(f.state);
  check('«عُدّ · +1»: +1 للعدّ بلون الملتزم، والعدّاد يبقى يعدّ', a.tally.n === 1 && a.tally.of === 3 && a.tally.team === 1
    && f.timer?.id === timerId && !f.events.some(e => e.type === 'stop-timer' || e.type === 'timer'));
  check('لحظة «said» للعدّة، ولا نقاط قبل الحكم', f.events.some(e => e.type === 'moment' && e.name === 'said') && f.scores[1] === 0);
  check('ولا أسماء على الجمهور (1.14): لا said بأسماء ولا plain', a.said === undefined && a.plain === undefined);
  check('«item» و«out» من نسخ سابقة تُهمل (1.14: الأسماء لا تظهر على التلفاز)', ['item:2', 'item:0', 'out:ليفان', 'out:', 'stop', 'complete'].every(x => R.act(auction, f, x).state === f.state));
  check('العدّة في الحالة بلا موضع ولا نص، بلون الملتزم', f.state.said.length === 1 && f.state.said[0].i === null && f.state.said[0].team === 1 && !f.state.said[0].text);
  check('القائمة لا تظهر على الجمهور قبل الكشف', a.list === undefined && !a.reveal && a.verdict === null);
  f = R.act(auction, f, 'count');
  check('عدّة ثانية: 2 من 3', auction.audience(f.state).tally.n === 2);
  const undone = R.undo(f);
  check('التراجع عن عدّة: يعود العدّ، والعدّاد يبقى', auction.audience(undone.state).tally.n === 1 && undone.timer?.id === timerId && undone.events.length === 0);
  f = R.act(auction, f, 'count');
  a = auction.audience(f.state);
  check('بلغ العدّ 3 من 3: لا حكم (عدّاد مساعد)، والعدّاد يعدّ', f.state.phase === 'fulfil' && f.scores[1] === 0 && a.tally.n === 3 && f.timer?.id === timerId && a.verdict === null);
  f = R.act(auction, f, 'count');
  check('ويُعدّ فوق ما التزم به (4 من 3)، فالمقدّم قد يخطئ ويتراجع', auction.audience(f.state).tally.n === 4 && f.state.phase === 'fulfil');
  f = R.undo(f);
  // «كشف القائمة»: يقف الوقت، وتظهر القائمة، ويغيب العدّ، ثم الحكم.
  const fr = R.act(auction, f, 'reveal');
  a = auction.audience(fr.state);
  check('«كشف القائمة»: يقف العدّاد، والمرحلة «revealed»', fr.state.phase === 'revealed' && fr.timer === null && fr.events.some(e => e.type === 'stop-timer'));
  check('بعد الكشف: القائمة كلها بأسمائها وترتيبها، والعدّ يغيب، ولا حكم', a.reveal && a.list.join('|') === ft.items.map(x => x.name).join('|') && a.tally === null && a.verdict === null && a.turn === 1);
  check('بعد الكشف: «وفى» و«لم يفِ» وحدهما، ولا عدّ', ids(auction.actions(fr.state)) === 'ok,fail' && R.act(auction, fr, 'count').state === fr.state);
  check('ولا حكم قبل الكشف', R.act(auction, f, 'ok').state === f.state && R.act(auction, f, 'fail').state === f.state);
  f = R.act(auction, fr, 'ok');
  a = auction.audience(f.state);
  check('«وفى»: +3 للملتزم، ولحظة «صحيحة»', f.state.phase === 'decided' && f.scores[1] === 3 && f.scores[2] === 0 && a.verdict.team === 1 && a.verdict.points === 3 && a.verdict.kept === true && f.events.some(e => e.name === 'right'));
  check('بعد الحكم: القائمة باقية، ولا عدّ ولا أسماء مذكورة', a.reveal && a.list.length === ft.items.length && a.tally === null && a.said === undefined);
  check('بعد الحكم: الحدّ عند من أخذ النقاط، و«الموضوع التالي» وحده', a.turn === 1 && ids(auction.actions(f.state)) === 'next');
  check('نتيجة الموضوع الأول للأول', f.state.results[0].team === 1);
  check('التراجع عن «وفى»: يعود الكشف، والنقاط تعود', R.undo(f).state.phase === 'revealed' && R.undo(f).scores[1] === 0);

  // التراجع عن الكشف يعيد الوفاء بما بقي من الوقت لا بوقته كاملاً (design/s8c.md 4.6: بأبسط ما يصح، فالعدّاد يعود يعدّ).
  const T = 1_000_000;
  let h = commitAt(2, 1, 0, T);
  h = R.act(auction, h, 'count', undefined, T + 5000);
  const hd = R.act(auction, h, 'reveal', undefined, T + 10000);
  const hu = R.undo(hd, T + 20000);
  check('التراجع عن الكشف بعد 10 ثوانٍ: يعود الوفاء بـ 35 ثانية، والعدّ كما كان', hu.state.phase === 'fulfil' && Math.round(hu.timer.seconds) === 35 && hu.events.some(e => e.type === 'timer' && Math.round(e.seconds) === 35) && auction.audience(hu.state).tally.n === 1);
  const hu2 = R.undo(hu, T + 25000);
  check('ثم التراجع عن عدّة: العدّاد نفسه يبقى (لا وقت زائد)', hu2.timer.id === hu.timer.id && hu2.events.length === 0 && auction.audience(hu2.state).tally.n === 0);

  // «لم يفِ» بعد الكشف: الخصم يأخذ نقطتين ثابتتين، ولا إكمال (5.5، المالك). وانقضاء الوقت لا يحكم (1.14).
  let g = commitAt(5, 2, 0, T);
  check('رسا على الثاني بـ 5', g.state.commit.team === 2 && g.state.commit.n === 5);
  g = R.act(auction, g, 'count', undefined, T + 1000);
  g = R.act(auction, g, 'count', undefined, T + 2000);
  const gr = R.act(auction, g, 'reveal', undefined, T + 20000);
  const gs = R.act(auction, gr, 'fail', undefined, T + 22000);
  a = auction.audience(gs.state);
  check(`«لم يفِ»: +${FAIL_POINTS} للخصم (الأول)، ولا شيء للملتزم`, FAIL_POINTS === 2 && gs.state.phase === 'decided' && gs.scores[1] === 2 && gs.scores[2] === 0
    && a.verdict.team === 1 && a.verdict.points === 2 && a.verdict.kept === false && a.turn === 1);
  check('ولحظة «fail» للخصم (بهزة «خاطئة»)، ولا عدّاد', gs.timer === null && gs.events.some(e => e.name === 'fail' && e.team === 1 && e.reason === 'wrong') && !gs.events.some(e => e.type === 'timer'));
  check('بعد الحكم: «الموضوع التالي» وحده، والقائمة كلها ولا عدّ', ids(auction.actions(gs.state)) === 'next' && a.tally === null && a.reveal && a.list.length === gs.state.topics[0].items.length);
  const gt = R.act(auction, g, 'timeout', g.timer.id, T + 45000);
  a = auction.audience(gt.state);
  check('انتهى وقت الملتزم: يقف الوقت ولا حكم، ويبقى العدّ والكشف (1.14)', gt.state.phase === 'fulfil' && gt.timer === null && gt.scores[1] === 0 && gt.scores[2] === 0 && a.over && a.tally.n === 2 && ids(auction.actions(gt.state)) === 'count,reveal');
  check('وبعد انقضائه: العدّ يُحسب، والكشف ثم الحكم', (() => { const x = R.act(auction, R.act(auction, gt, 'count'), 'reveal'); return auction.audience(x.state).list.length > 0 && R.act(auction, x, 'ok').scores[2] === 5; })());
  check('«انتهى الوقت» من عدّاد قديم يُهمل', R.act(auction, g, 'timeout', g.timer.id + 1).state === g.state);
  check('نتيجة الموضوع للخصم', gs.state.results[0].team === 1);
  const gu = R.undo(R.undo(gs, T + 25000), T + 25000);
  check('التراجع عن «لم يفِ» ثم عن الكشف: الوفاء للملتزم بـ 25 ثانية، والنقطتان تعودان', gu.state.phase === 'fulfil' && auction.audience(gu.state).turn === 2 && Math.round(gu.timer.seconds) === 25 && gu.scores[1] === 0);
  // حالات محفوظة من نسخ سابقة: «إكمال الخصم» يحسمه «توقّف»، والالتزام قبل «ابدأ» يكمل كما كان.
  const oldc = { ...g, state: { ...g.state, phase: 'complete', team: 1 } };
  check('حالة «إكمال» محفوظة: «توقّف» وحده، فيأخذ الخصم 2', ids(auction.actions(oldc.state)) === 'stop' && R.act(auction, oldc, 'stop').scores[1] === 2);
  const oldr = { ...g, timer: null, state: { ...g.state, phase: 'ready', said: [] } };
  check('حالة «قبل ابدأ» محفوظة: «ابدأ العدّاد» يبدأ الوفاء', ids(auction.actions(oldr.state)) === 'start,count,reveal' && R.act(auction, oldr, 'start').state.phase === 'fulfil');
  const oldb = { ...r, state: { ...R.act(auction, start(1), 'show').state, nums: undefined, bids: [{ team: 1, n: 1 }, { team: 2, n: 2 }, { team: 1, n: 3 }] } };
  check('مزايدة محفوظة «رقماً رقماً»: الأول 3 والثاني 2، و«ابدأ» يرسي على الأول', auction.audience(oldb.state).bids.map(b => `${b.team}:${b.n}`).join(',') === '1:3,2:2' && R.act(auction, oldb, 'start').state.commit.team === 1);

  // تتابع الجولة: «الموضوع التالي» يعرض الموضوع التالي فوراً للمزايدة، وبعد الثالث «إنهاء الجولة».
  let q = commitAt(1, 1);
  q = R.act(auction, R.act(auction, q, 'reveal'), 'ok');
  check('بعد الحكم: «الموضوع التالي» وحده', q.state.phase === 'decided' && ids(auction.actions(q.state)) === 'next' && auction.actions(q.state)[0].label === 'الموضوع التالي' && q.scores[1] === 1);
  q = R.act(auction, q, 'next');
  a = auction.audience(q.state);
  check('الموضوع 2: يظهر للمزايدة فوراً، والحدّ في المنتصف، بلا أرقام ولا عدّ، والعدد مخفي', q.state.index === 1 && a.screen === 'topic' && a.phase === 'bid' && a.n === 2 && a.turn === 0
    && !a.bids.length && a.tally === null && !a.said?.length && a.verdict === null && a.list === undefined && a.topic === q.state.topics[1].topic && a.size === undefined);
  check('التراجع عن «الموضوع التالي»: يعود الحكم', R.undo(q).state.index === 0 && R.undo(q).state.phase === 'decided');
  // الثاني يزايد حتى 10 (العدد كله) ولا يفي: للأول نقطتان.
  for (let k = 0; k < 10; k++) q = R.act(auction, q, 'raise:2');
  q = R.act(auction, q, 'start');
  q = R.act(auction, R.act(auction, R.act(auction, q, 'count'), 'reveal'), 'fail');
  check('الموضوع 2: رسا على الثاني بـ 10 ولم يفِ، فللأول 2 (رصيده 3)', q.state.phase === 'decided' && q.scores[1] === 3 && q.scores[2] === 0);
  q = R.act(auction, q, 'next');
  check(`الموضوع 3 (${L}): بلا «في القائمة»`, q.state.index === 2 && auction.audience(q.state).turn === 0 && auction.audience(q.state).size === undefined);
  q = R.act(auction, R.act(auction, R.act(auction, q, 'raise:1'), 'raise:2'), 'start');
  q = R.act(auction, R.act(auction, R.act(auction, R.act(auction, q, 'count'), 'count'), 'reveal'), 'ok');
  check('الموضوع 3: رسا على الثاني بـ 2 فوفى (+2)، و«إنهاء الجولة»', q.state.phase === 'decided' && q.scores[2] === 2 && auction.actions(q.state)[0].label === 'إنهاء الجولة');
  check('نتائج المواضيع: الأول · الأول · الثاني', q.state.results.map(x => x.team).join(',') === '1,1,2');
  q = R.act(auction, q, 'next');
  a = auction.audience(q.state);
  check('نهاية الجولة: الحصيلة الأول 3 والثاني 2، وانتهت', a.screen === 'end' && a.totals[1] === 3 && a.totals[2] === 2 && auction.finished(q.state) && !auction.actions(q.state).length);
  check('بعد النهاية: لا فعل يُقبل', R.act(auction, q, 'next').state === q.state);

  // الموضوع المفتوح (open): لا تحدّ المزايدةَ قائمتُه، و«صحيح · +1» لما قيل من خارجها، وبعد الحكم يرى الجمهور ما قيل فقط.
  {
    const ob = JSON.parse(JSON.stringify(small));
    ob.topics.filter(t => t.level === 'easy').forEach(t => { t.open = true; });
    const oc = { ...content, 'auction.json': ob };
    let o = R.startRound(auction, { content: oc, first: 1, rng });
    o = R.act(auction, o, 'show');
    const len = o.state.topics[0].items.length;
    for (let k = 0; k < len + 3; k++) o = R.act(auction, o, k % 2 ? 'raise:2' : 'raise:1');
    check(`المفتوح: المزايدة فوق طول القائمة (${len}) بلا إغلاق`, Math.max(...o.state.nums) === len + 3 && auction.actions(o.state).some(x => x.id === 'raise') && o.state.topics[0].open);
    let capped = R.startRound(auction, { content: oc, first: 1, rng });
    capped = R.act(auction, capped, 'show');
    for (let k = 0; k < OPEN_MAX + 5; k++) capped = R.act(auction, capped, 'raise:1');
    check(`والحدّ الأعلى ${OPEN_MAX}`, capped.state.nums[0] === OPEN_MAX);
    o = R.act(auction, o, 'start');
    check(`رسا على ${len + 3}: عدّاد الوفاء ${FULFIL_SECONDS} ثانية ثابتاً لكل القوائم (المالك)`, o.state.commit.n === len + 3 && o.timer?.seconds === FULFIL_SECONDS
      && auction.audience(o.state).clock === FULFIL_SECONDS);
    const who = o.state.commit.team;
    o = R.act(auction, R.act(auction, R.act(auction, R.act(auction, o, 'count'), 'count'), 'reveal'), 'fail');
    const a = auction.audience(o.state);
    check('المفتوح بعد الكشف والحكم: القائمة المرجعية كلها، ولا أسماء مذكورة (1.14)', a.list.length === len && a.said === undefined && a.verdict.team === (who === 1 ? 2 : 1));
    check('والمغلق بعد الكشف كذلك: القائمة كلها', (() => { let c = commitAt(2); c = R.act(auction, R.act(auction, c, 'reveal'), 'fail'); const x = auction.audience(c.state); return x.reveal && x.list.length === c.state.topics[0].items.length && x.said === undefined; })());
  }

  // من خارج القائمة (design/auction.md 4.1) أُلغي بالوثيقة 1.14: ما قيل لا يظهر على التلفاز، والمقدّم يُقرّه في عدّه. فـ«out:نص» يُهمل.
  {
    const c = commitAt(5);
    check('«out:ليفان» يُهمل بعد 1.14، ولا يُعدّ', ['out:ليفان', 'out:إم: جي', 'out:'].every(x => R.act(auction, c, x).state === c.state));
    check('ولا يُعدّ في المزايدة', R.act(auction, R.act(auction, R.startRound(auction, { content, first: 1, rng }), 'show'), 'count').state.said.length === 0);
  }

  // حالة محفوظة من «المزايدة» (بلا said) تكمل بعد التحديث.
  const old = commitAt(2); const { said, ...rest } = old.state;
  check('حالة محفوظة بلا said: العدّ 0 ويُعدّ عنصر', auction.audience(rest).tally.n === 0 && auction.audience(R.act(auction, { ...old, state: rest }, 'count').state).tally.n === 1);

  // حدّا المحتوى (design/auction.md 3): الموضوع 32 حرفاً واسم العنصر 20، تنبيهان لا خطآن.
  const { checkContent } = await import(path.join(root, 'js/content-check.js'));
  const pack = extra => { const b = JSON.parse(JSON.stringify(bank)); extra(b); return checkContent({ index: { packs: ['general'] }, packs: { general: { 'pack.json': read('pack.json'), 'auction.json': b } }, wheel: undefined }); };
  const ok = pack(() => {});
  check('البنك الحالي: لا تنبيه حدّ في المزاد', !ok.warnings.some(w => w.includes('والحد 32') || w.includes('والحد 20')));
  const at = bank.topics.indexOf(longest);
  const long = pack(b => { b.topics[at].topic = 'م'.repeat(33); b.topics[at].items[0].name = 'ع'.repeat(21); });
  check('موضوع 33 حرفاً وعنصر 21: تنبيهان، لا خطأ', long.warnings.some(w => w.includes('الموضوع 33 حرفاً')) && long.warnings.some(w => w.includes('21 حرفاً، والحد 20')) && long.errors.length === ok.errors.length);

  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
