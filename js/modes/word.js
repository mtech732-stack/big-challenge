// جولة الكلمة: ما يشترك فيه النمطان الأول والثاني («الحرف المعيّن» و«آخر حرفين»، الوثيقة 5.3 و5.4).
// 6 أسئلة في الجولة، لكل فريق 3 بالتناوب: سهل ثم متوسط ثم صعب. يبدأ العدّاد بزر «ابدأ»، فإن أخطأ الفريق
// أو انتهى وقته انتقل السؤال إلى الخصم ليسرقه في 5 ثوانٍ بالنقاط نفسها.
// كل نمط يعطي ما يخصه: اسمه، ووقت السؤال، وحقل ما في المربع، ونصوص الافتتاح وسطر القبول.
import { freshFirst } from '../round.js';

export const STEAL_SECONDS = 5;
export const POINTS = { easy: 1, medium: 2, hard: 3 };
export const LEVEL_TEXT = { easy: 'سهل · نقطة', medium: 'متوسط · نقطتان', hard: 'صعب · 3 نقاط' };
const LEVELS = ['easy', 'medium', 'hard'];
const other = team => (team === 1 ? 2 : 1);

// يختار سؤالاً واحداً: ما لم يظهر وما في مربعه غير مكرر في الجولة أولاً، ثم ما لم يظهر، ثم ما تكرر مربعه.
function pickOne(pool, seen, used, key, rng) {
  const distinct = q => !used.has(q[key]);
  const fresh = pool.filter(q => !seen.includes(q.id));
  for (const list of [fresh.filter(distinct), fresh, pool.filter(distinct), pool]) if (list.length) return freshFirst(list, [], 1, rng)[0];
  return undefined;
}

// key: حقل ما في المربع في ملف الأسئلة («letter» أو «ending»). tatweel: يُعرض قبله تطويل «ـ».
// distinct: لا يتكرر ما في المربع في الجولة ما أمكن (ملاحظة تدقيق ش3).
export function wordMode({ id, name, order, seconds, key, tatweel = false, distinct = false, rule, accept }) {
  const box = q => (tatweel ? 'ـ' : '') + boxOf(q);
  const SUB = `6 أسئلة · ${seconds} ثانية للسؤال · والسرقة في ${STEAL_SECONDS} ثوانٍ`;
  const BRIEF = `6 أسئلة، لكل فريق 3 بالتناوب: سهل ثم متوسط ثم صعب. ${seconds} ثانية للسؤال، والسرقة في ${STEAL_SECONDS} ثوانٍ.`;

  // الحالات: intro افتتاح الجولة · ready السؤال ظاهر والعدّاد لم يبدأ · ask عدّاد صاحب الدور
  // · steal عدّاد الخصم · decided انتهى السؤال · end انتهت الجولة.
  // results[i]: من أخذ نقاط السؤال i (رقم الفريق، أو 0 إن لم يأخذها أحد)، أو null ما لم ينتهِ.
  function setup({ content, first, seen = [], rng = Math.random }) {
    const bank = (content?.questions ?? []).filter(q => !q.tiebreak);
    const picked = {};
    if (distinct) {
      const used = new Set();
      for (const l of LEVELS) {
        let pool = bank.filter(q => q.level === l);
        picked[l] = [];
        for (const _ of [0, 1]) {
          const q = pickOne(pool, seen, used, key, rng);
          if (!q) break;
          picked[l].push(q); used.add(q[key]); pool = pool.filter(x => x !== q);
        }
      }
    } else for (const l of LEVELS) picked[l] = freshFirst(bank.filter(q => q.level === l), seen, 2, rng);
    const questions = [];
    for (const l of LEVELS) for (const k of [0, 1]) {
      const q = picked[l][k];
      if (q) questions.push({ id: q.id, level: q.level, box: q[key], prompt: q.prompt, answer: q.answer, alts: q.alts ?? [], owner: k === 0 ? first : other(first) });
    }
    return { first, questions, index: 0, phase: 'intro', team: first, steal: null, results: questions.map(() => null) };
  }

  // q.letter: حالة محفوظة قبل ش3، كي تكمل مباراة جارية بعد التحديث.
  const boxOf = q => q.box ?? q.letter;
  const current = s => s.questions[s.index];
  const points = q => POINTS[q.level];

  function actions(s) {
    const q = current(s);
    const judge = q ? [{ id: 'correct', label: `صحيحة · +${points(q)}` }, { id: 'wrong', label: 'خاطئة' }] : [];
    if (s.phase === 'intro') return [{ id: 'show', label: 'اعرض السؤال 1' }];
    // زرا الحكم مفعّلان قبل «ابدأ»: الفريق قد يجيب قبل أن يبدأ العدّاد (design/letter.md 4.3).
    if (s.phase === 'ready') return [{ id: 'start', label: 'ابدأ العدّاد' }, ...judge];
    if (s.phase === 'ask' || s.phase === 'steal') return judge;
    if (s.phase === 'decided') {
      const last = s.index === s.questions.length - 1;
      return [{ id: 'next', label: last ? 'إنهاء الجولة' : `السؤال التالي · ${s.index + 2} من ${s.questions.length}` }];
    }
    return [];
  }

  function act(s, action) {
    const q = current(s);
    if (action === 'show') return { state: { ...s, phase: 'ready' }, events: [] };
    if (action === 'start') return { state: { ...s, phase: 'ask' }, events: [{ type: 'timer', seconds }] };
    if (action === 'next') {
      const index = s.index + 1;
      if (index >= s.questions.length) return { state: { ...s, phase: 'end', steal: null }, events: [] };
      const owner = s.questions[index].owner;
      return { state: { ...s, index, phase: 'ready', team: owner, steal: null }, events: [] };
    }
    const decide = winner => ({ ...s, phase: 'decided', results: s.results.map((r, i) => (i === s.index ? winner : r)) });
    if (action === 'correct') {
      return { state: decide(s.team), events: [{ type: 'score', team: s.team, points: points(q) }, { type: 'moment', name: 'right', team: s.team }] };
    }
    // خاطئة أو انتهى الوقت: من صاحب السؤال تنتقل إلى السرقة، ومن السارق لا نقاط.
    if (s.phase === 'ready' || s.phase === 'ask') {
      const reason = action === 'timeout' ? 'timeout' : 'wrong';
      const thief = other(s.team);
      return {
        state: { ...s, phase: 'steal', team: thief, steal: { team: thief, reason } },
        events: [{ type: 'timer', seconds: STEAL_SECONDS }, { type: 'moment', name: 'steal', reason, team: thief }],
      };
    }
    return { state: decide(0), events: [{ type: 'moment', name: 'none' }] };
  }

  // حصيلة الجولة لكل فريق، من نتائج أسئلتها.
  function totals(s) {
    const sum = { 1: 0, 2: 0 };
    s.results.forEach((r, i) => { if (r) sum[r] += points(s.questions[i]); });
    return sum;
  }

  // ما تعرضه نافذة الجمهور: لا إجابة فيه أبداً، ولا ما يدل عليها.
  // letter: ما في المربع بلا تطويل، وtatweel: هل يُعرض قبله «ـ» (تضيفه الشاشة في عنصر مستقل للحركة).
  function audience(s) {
    const q = current(s);
    const base = { first: s.first, count: s.questions.length, totals: totals(s) };
    if (s.phase === 'intro') return { ...base, screen: 'intro', turn: s.first, rule, sub: SUB };
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
      level: q.level,
      levelText: LEVEL_TEXT[q.level],
      points: points(q),
      owner: q.owner,
      turn: s.team,
      steal: s.steal,
      // العدّاد ثابت بوقته كاملاً قبل «ابدأ»، و0:05 في السرقة؛ والحكم يحلّ محله بعد انتهاء السؤال.
      clock: s.phase === 'steal' ? STEAL_SECONDS : seconds,
      verdict: s.phase === 'decided' ? { team: result, points: result ? points(q) : 0 } : null,
    };
  }

  // ما تعرضه نافذة المقدّم: ما يراه الجمهور، ومعه الإجابة النموذجية وبدائلها ومسار الأسئلة.
  function presenter(s) {
    const q = current(s);
    const hidden = s.phase === 'intro' || s.phase === 'end';
    return {
      ...audience(s),
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
