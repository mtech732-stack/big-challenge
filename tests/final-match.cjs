// مباراة بنمطين تُلعب كاملة بالدوال الخالصة (دون متصفح) حتى نهاية جولتها الأخيرة، لاختبارات النهاية (ش7).
// الحرف المعيّن ثم شريط البونص ثم آخر حرفين. results: لكل جولة ستة أحكام بترتيب أسئلتها: 'r' صحيحة لصاحب الدور،
// 's' خاطئة ثم صحيحة للخصم، 'x' خاطئة مرتين (لا نقاط). wheel: حكم الدورتين ('won' أو 'failed')، والوقوف على خانتي تحدٍّ.
// adjust: تعديل يدوي للرصيد بعد نهاية الجولة الأولى ([الفريق، الفرق]). يعيد { match, modes, content }.
const fs = require('fs');
const path = require('path');

async function finalMatch({ results = ['rrrrrr', 'rrrrrr'], wheel = ['failed', 'failed'], adjust = null, names = ['الصقور', 'النجوم'], winner = 1 } = {}) {
  const root = path.join(__dirname, '..');
  const M = await import(path.join(root, 'js/match.js'));
  const P = await import(path.join(root, 'js/play.js'));
  const { MODES } = await import(path.join(root, 'js/modes/index.js'));
  const W = (await import(path.join(root, 'js/wheel.js')));
  const read = f => JSON.parse(fs.readFileSync(path.join(root, f), 'utf8'));
  const dir = 'content/packs/general/';
  const content = { 'letter.json': read(dir + 'letter.json'), 'last-two.json': read(dir + 'last-two.json'), 'wheel.json': read('content/wheel.json') };
  const modes = [...MODES, W.default];
  let seed = 5;
  const rng = () => (seed = (seed * 16807) % 2147483647) / 2147483647;

  let m = M.newMatch({ pack: 'general', method: 'short' });
  m = M.setTeams(m, ...names);
  m = M.toDraw(m);
  m = M.draw(m, () => (winner === 1 ? 0.1 : 0.9));
  m = M.toPick(m);
  m = M.pick(m, 'letter', [{ id: 'letter' }, { id: 'last-two' }]);
  m = M.pick(m, 'last-two', [{ id: 'letter' }, { id: 'last-two' }]);
  m = M.toFace(m);

  const realNow = Date.now;
  let clock = realNow();
  Date.now = () => clock;
  try {
    const act = a => { clock += 1000; m = P.act(m, modes, a); };
    const word = marks => {
      act('show');
      [...marks].forEach((k, i) => {
        // 1.11: r صاحب السؤال أصاب · s وقت الخصم فأصاب الخصم · x وقت الخصم ولم يُجب أحد.
        const owner = m.round.state.team, rival = owner === 1 ? 2 : 1;
        if (k === 'r') { act('reveal'); act(`pick:${owner}`); }
        else { act('steal'); act('reveal'); act(`pick:${k === 's' ? rival : 0}`); }
        act('next');
      });
    };
    m = P.startNext(m, { modes, content, rng });
    word(results[0]);
    if (adjust) m = P.setScore(m, adjust[0], m.scores[adjust[0]] + adjust[1]);
    m = P.startNext(m, { modes, content, rng });
    // الوقوف على خانتي تحدٍّ (0 و2 في ترتيب الخانات، design/wheel.md 2.2).
    m = { ...m, round: { ...m.round, state: { ...m.round.state, stops: [0, 2] } } };
    wheel.forEach((v, i) => {
      act('spin'); clock += 20000; act('land'); act('start'); act(v); act(i === 0 ? 'next' : 'finish');
    });
    m = P.startNext(m, { modes, content, rng });
    word(results[1]);
  } finally { Date.now = realNow; }
  return { match: m, modes, content, M, P };
}

module.exports = { finalMatch };
