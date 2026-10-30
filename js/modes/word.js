// جولة الكلمة: ما يشترك فيه النمطان الأول والثاني («الحرف المعيّن» و«آخر حرفين»، الوثيقة 5.3 و5.4).
// 6 أسئلة في الجولة، لكل فريق 3 بالتناوب: سهل ثم متوسط ثم صعب. والتوقيت والحكم في js/judge.js (الوثيقة 1.11):
// يبدأ العدّاد تلقائياً بعد 5 ثوانٍ، و«وقت الخصم» بزر في 10 ثوانٍ بالنقاط نفسها، ثم «كشف الإجابة» واختيار من أجاب.
// وما يُعرض لا يذكر المستوى ولا كلمة «سرقة» (الوثيقة 1.1، 7.3)، والإجابة النموذجية تظهر للجمهور بعد الكشف (7.1).
// كل نمط يعطي ما يخصه: اسمه، ووقت السؤال، وحقل ما في المربع، ونصوص الافتتاح وسطر القبول.
import { freshFirst, besides } from '../round.js';
import { ROUND_PER_LEVEL } from '../content-check.js';
import { lead, timing, timingActions, picked } from '../judge.js';

export const STEAL_SECONDS = 10;
export const POINTS = { easy: 3, medium: 6, hard: 9 };
const LEVELS = ['easy', 'medium', 'hard'];
const other = team => (team === 1 ? 2 : 1);

// «آخر حرفين» (الوثيقة 1.1، 5.4): الجولة كلها من مجموعة واحدة، أي نهاية فيها سؤالان من كل مستوى.
// تُقدَّم النهاية التي لم يظهر من أسئلتها شيء، ثم الأقل ظهوراً، والاختيار بينها عشوائي.
function pickGroup(bank, seen, key, rng) {
  const groups = new Map();
  for (const q of bank) groups.set(q[key], [...(groups.get(q[key]) ?? []), q]);
  const full = [...groups.values()].filter(g => LEVELS.every(l => g.filter(q => q.level === l).length >= ROUND_PER_LEVEL));
  if (!full.length) return bank;
  const unseen = g => g.filter(q => !seen.includes(q.id)).length / g.length;
  const best = Math.max(...full.map(unseen));
  return freshFirst(full.filter(g => unseen(g) === best), [], 1, rng)[0];
}

// key: حقل ما في المربع في ملف الأسئلة («letter» أو «ending»). tatweel: يُعرض قبله تطويل «ـ».
// sameBox: الجولة كلها بما في المربع نفسه («آخر حرفين»)، ويُعلَن في الافتتاح.
// rule: نص الافتتاح، أو دالة تأخذ ما في المربع وتعيده.
export function wordMode({ id, name, order, seconds, key, tatweel = false, sameBox = false, rule, accept }) {
  const box = q => (tatweel ? 'ـ' : '') + boxOf(q);
  const BRIEF = `6 أسئلة، لكل فريق 3 بالتناوب. ${seconds} ثانية للسؤال تبدأ وحدها، وإن أخطأ الفريق أو انتهى وقته فوقت الخصم ${STEAL_SECONDS} ثوانٍ.`;
  const ruleOf = s => (typeof rule === 'function' ? rule(s.questions[0] ? box(s.questions[0]) : '') : rule);

  // الحالات: intro افتتاح الجولة · ready السؤال ظاهر وعدّاد التمهيد · ask عدّاد صاحب الدور · steal عدّاد الخصم
  // · over انتهى الوقت · revealed كُشفت الإجابة · decided اختير من أجاب · end انتهت الجولة. وpaused في js/judge.js.
  // results[i]: من أخذ نقاط السؤال i (رقم الفريق، أو 0 إن لم يأخذها أحد)، أو null ما لم ينتهِ.
  // avoid: أسئلة تساوي إجابتها عنصراً من قائمة ترتيب اختيرت في المباراة (تدقيق ش5 «رابعاً»)، تُترك ما وُجد غيرها.
  function setup({ content, first, seen = [], avoid = [], rng = Math.random }) {
    let bank = (content?.questions ?? []).filter(q => !q.tiebreak);
    // والنهاية التي نقصت بما تُرك لا تكفي جولة، فإن لم تبقَ نهاية كاملة اختيرت من البنك كله.
    if (sameBox) { const rest = besides(bank, avoid), g = pickGroup(rest, seen, key, rng); bank = g === rest ? pickGroup(bank, seen, key, rng) : g; }
    const picked = {};
    for (const l of LEVELS) picked[l] = freshFirst(besides(bank.filter(q => q.level === l), avoid, ROUND_PER_LEVEL), seen, ROUND_PER_LEVEL, rng);
    const questions = [];
    for (const l of LEVELS) for (const k of [0, 1]) {
      const q = picked[l][k];
      if (q) questions.push({ id: q.id, level: q.level, box: q[key], prompt: q.prompt, answer: q.answer, alts: q.alts ?? [], owner: k === 0 ? first : other(first) });
    }
    return { first, questions, index: 0, phase: 'intro', team: first, steal: null, paused: null, results: questions.map(() => null) };
  }

  // q.letter: حالة محفوظة قبل ش3، كي تكمل مباراة جارية بعد التحديث.
  const boxOf = q => q.box ?? q.letter;
  const current = s => s.questions[s.index];
  const points = q => POINTS[q.level];

  function actions(s) {
    const q = current(s);
    if (s.phase === 'intro') return [{ id: 'show', label: 'اعرض السؤال 1' }];
    // بعد الكشف: صاحب السؤال، ثم خصمه، ثم «لم يُجب أحد».
    if (s.phase === 'revealed') {
      return [...[q.owner, other(q.owner)].map(team => ({ id: 'pick', team, label: `+${points(q)}` })), { id: 'pick', team: 0, label: 'لم يُجب أحد' }];
    }
    if (s.phase === 'decided') {
      const last = s.index === s.questions.length - 1;
      return [{ id: 'next', label: last ? 'إنهاء الجولة' : `السؤال التالي · ${s.index + 2} من ${s.questions.length}` }];
    }
    return timingActions(s, STEAL_SECONDS);
  }

  // left: ما بقي من العدّاد الجاري (js/round.js)، لـ«إيقاف مؤقت».
  function act(s, action, scores, now, left) {
    const q = current(s);
    if (action === 'show' && s.phase === 'intro') return { state: { ...s, phase: 'ready' }, events: [lead()] };
    if (action === 'next' && s.phase === 'decided') {
      const index = s.index + 1;
      if (index >= s.questions.length) return { state: { ...s, phase: 'end', steal: null }, events: [] };
      const owner = s.questions[index].owner;
      return { state: { ...s, index, phase: 'ready', team: owner, steal: null, paused: null }, events: [lead()] };
    }
    const t = timing(s, action, left, { seconds, stealSeconds: STEAL_SECONDS });
    if (t) return t;
    const winner = picked(action);
    if (winner === null || s.phase !== 'revealed') return { state: s, events: [] };
    const state = { ...s, phase: 'decided', results: s.results.map((r, i) => (i === s.index ? winner : r)) };
    return { state, events: winner ? [{ type: 'score', team: winner, points: points(q) }, { type: 'moment', name: 'right', team: winner }] : [{ type: 'moment', name: 'none' }] };
  }

  // حصيلة الجولة لكل فريق، من نتائج أسئلتها.
  function totals(s) {
    const sum = { 1: 0, 2: 0 };
    s.results.forEach((r, i) => { if (r) sum[r] += points(s.questions[i]); });
    return sum;
  }

  // ما تعرضه نافذة الجمهور: لا إجابة فيه قبل الكشف، ولا ما يدل عليها. وبعده الإجابة النموذجية وحدها (لا البدائل).
  // letter: ما في المربع بلا تطويل، وtatweel: هل يُعرض قبله «ـ» (تضيفه الشاشة في عنصر مستقل للحركة).
  function audience(s) {
    const q = current(s);
    const base = { first: s.first, count: s.questions.length, totals: totals(s) };
    if (s.phase === 'intro') return { ...base, screen: 'intro', turn: s.first, rule: ruleOf(s) };
    if (s.phase === 'end' || !q) return { ...base, screen: 'end', turn: 0 };
    const result = s.results[s.index];
    return {
      ...base,
      screen: 'ask',
      phase: s.phase,
      n: s.index + 1,
      letter: boxOf(q),
      tatweel,
      question: q.prompt,
      points: points(q),
      owner: q.owner,
      turn: s.team,
      steal: s.steal,
      // وقت العدّاد كاملاً (وقت الخصم في steal)، وlead: عدّاد التمهيد جارٍ، وpaused: موقوف. والحكم يحلّ محله بعد الاختيار.
      clock: s.phase === 'steal' ? STEAL_SECONDS : seconds,
      lead: s.phase === 'ready',
      paused: !!s.paused,
      verdict: s.phase === 'decided' ? { team: result, points: result ? points(q) : 0 } : null,
      answer: s.phase === 'revealed' || s.phase === 'decided' ? q.answer : undefined,
    };
  }

  // ما تعرضه نافذة المقدّم: ما يراه الجمهور، ومعه الإجابة النموذجية وبدائلها ومسار الأسئلة.
  function presenter(s) {
    const q = current(s);
    const hidden = s.phase === 'intro' || s.phase === 'end';
    return {
      ...audience(s),
      level: hidden ? undefined : q?.level,
      answer: hidden ? undefined : q?.answer,
      alts: hidden ? [] : q?.alts ?? [],
      brief: BRIEF,
      accept: q ? accept(box(q)) : '',
      track: s.questions.map((x, i) => ({ owner: x.owner, result: s.results[i], now: !hidden && i === s.index })),
    };
  }

  return {
    id, name, order,
    contentKey: `${id}.json`,
    seconds,
    setup, actions, act, audience, presenter,
    finished: s => s.phase === 'end',
    used: s => s.questions.map(q => q.id),
  };
}
