// اختبار آلي لـ«عقد الوحدة» ومشغّل الجولة وقائمة الأنماط التلقائية، بوحدة تجريبية تلتزم العقد.
const fs = require('fs');
const path = require('path');
const { reporter } = require('./helpers.cjs');

(async () => {
  const root = path.join(__dirname, '..');
  const { checkMode } = await import(path.join(root, 'js/modes/contract.js'));
  const { MODES, pickableModes } = await import(path.join(root, 'js/modes/index.js'));
  const R = await import(path.join(root, 'js/round.js'));
  const sample = (await import(path.join(__dirname, 'fixtures/sample-mode.js'))).default;
  const { check, finish } = reporter();
  const read = f => JSON.parse(fs.readFileSync(path.join(root, 'docs/content-examples/packs/general', f), 'utf8'));
  const files = Object.fromEntries(['pack', 'letter', 'last-two', 'auction', 'ranking'].map(f => [`${f}.json`, read(`${f}.json`)]));
  let seed = 3;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  // العقد.
  check('الوحدة التجريبية تلتزم العقد', checkMode(sample).length === 0);
  check('يكتشف: وحدة بلا «act»', checkMode({ ...sample, act: undefined }).some(e => e.includes('«act»')));
  check('يكتشف: نمط لا ملف أسئلة له', checkMode({ ...sample, id: 'quiz' }).some(e => e.includes('لا ملف أسئلة')));
  check(`كل الأنماط المسجّلة الآن تلتزم العقد (${MODES.length})`, MODES.every(m => checkMode(m).length === 0));

  // قائمة الاختيار تُبنى تلقائياً.
  const fake = (id, order) => ({ ...sample, id, order, name: id });
  const all = [fake('ranking', 4), sample, fake('auction', 3), fake('last-two', 2)];
  const names = list => list.map(m => m.id).join(',');
  check('القائمة بترتيب الأنماط من السجل', names(pickableModes({ modes: all, pack: files['pack.json'], files })) === 'letter,last-two,auction,ranking');
  check('نمط تستثنيه الحزمة لا يظهر', names(pickableModes({ modes: all, pack: { excludeModes: ['ranking'] }, files })) === 'letter,last-two,auction');
  const noAuction = { ...files }; delete noAuction['auction.json'];
  check('نمط بلا ملف أسئلة في الحزمة لا يظهر', names(pickableModes({ modes: all, pack: {}, files: noAuction })) === 'letter,last-two,ranking');
  check('النمط الذي لُعب في المباراة لا يتكرر', names(pickableModes({ modes: all, pack: {}, files, played: ['letter', 'auction'] })) === 'last-two,ranking');
  check('نمط جديد يظهر بإضافته للسجل وحده', names(pickableModes({ modes: [sample], pack: {}, files })) === 'letter');

  // من يبدأ: عشوائي.
  const firsts = new Set(Array.from({ length: 40 }, () => R.pickFirst(rng)));
  check('من يبدأ الجولة عشوائي (يخرج الفريقان)', firsts.has(1) && firsts.has(2) && firsts.size === 2);

  // تشغيل جولة.
  let r = R.startRound(sample, { content: files, first: 1, rng });
  const q1 = r.state.questions[0];
  check('الجولة تبدأ بالفريق المختار', r.state.team === 1 && r.first === 1);
  const aud = JSON.stringify(sample.audience(r.state));
  check('نافذة الجمهور لا تحمل الإجابة', !aud.includes(q1.answer) && sample.presenter(r.state).answer === q1.answer);
  r = R.act(sample, r, 'correct');
  const p1 = { easy: 1, medium: 2, hard: 3 }[q1.level];
  check(`إجابة صحيحة: +${p1} للفريق الأول، والدور للثاني بعدّاد 15`, r.scores[1] === p1 && r.state.team === 2 && r.events.some(e => e.type === 'timer' && e.seconds === 15));
  const saved = JSON.parse(JSON.stringify(r));
  r = R.act(sample, r, 'wrong');
  check('خطأ: السرقة للفريق الأول في 5 ثوانٍ مع لحظة السرقة', r.state.phase === 'steal' && r.state.team === 1 && r.events.some(e => e.seconds === 5) && r.events.some(e => e.name === 'steal'));
  r = R.undo(r);
  check('التراجع يعيد الحالة والرصيد كما كانا', JSON.stringify({ s: r.state, c: r.scores }) === JSON.stringify({ s: saved.state, c: saved.scores }));
  check('الحالة بعد الحفظ والاستعادة (JSON) تكمل كما هي', JSON.stringify(R.act(sample, saved, 'timeout')) === JSON.stringify(R.act(sample, r, 'timeout')));
  r = R.act(sample, r, 'timeout');
  r = R.act(sample, r, 'correct');
  const p2 = { easy: 1, medium: 2, hard: 3 }[r.history.at(-1).state.questions[1].level];
  check(`السرقة الصحيحة تعطي النقاط نفسها (+${p2}) للسارق`, r.scores[1] === p1 + p2 && r.scores[2] === 0);
  check('الجولة انتهت ولا أزرار بعدها', sample.finished(r.state) && sample.actions(r.state).length === 0);
  check('لا فعل بعد نهاية الجولة', R.act(sample, r, 'correct') === r);
  check('فعل غير موجود في الأزرار يُهمل', (() => { const s = R.startRound(sample, { content: files, first: 2, rng }); return R.act(sample, s, 'jump') === s; })());

  // الرصيد.
  check('لا ينزل الرصيد تحت الصفر', R.applyEvents({ 1: 2, 2: 0 }, [{ type: 'score', team: 1, points: -3 }])[1] === 0);
  check('«اسرق 3» من فريق رصيده 1: يأخذ 1 فقط', JSON.stringify(R.applyEvents({ 1: 5, 2: 1 }, [{ type: 'take', from: 2, to: 1, points: 3 }])) === '{"1":6,"2":0}');
  let m = R.setScore(r, 2, 7);
  check('تعديل الرصيد يدوياً، ويُتراجع عنه', m.scores[2] === 7 && R.undo(m).scores[2] === 0 && R.setScore(r, 2, -4).scores[2] === 0);

  // ذاكرة الأسئلة.
  const used = sample.used(r.state);
  const items = files['letter.json'].questions.filter(q => !q.tiebreak);
  const again = R.startRound(sample, { content: files, first: 1, rng, seen: used.slice(0, 1) });
  check('الجولة التالية لا تبدأ بسؤال ظهر', !again.state.questions.slice(0, items.length - 1).some(q => q.id === used[0]));
  const allSeen = R.freshFirst(items, items.map(i => i.id), 2, rng);
  check('إذا ظهر البنك كله يبدأ من جديد', allSeen.length === 2);

  process.exit(finish() ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
