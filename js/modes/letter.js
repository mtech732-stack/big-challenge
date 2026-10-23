// النمط الأول: «الحرف المعيّن» (القسم 5.3 من الوثيقة، وتصميمه design/letter.md). وحدة تلتزم «عقد الوحدة».
// 6 أسئلة في الجولة، لكل فريق 3 بالتناوب: سهل ثم متوسط ثم صعب. 15 ثانية للسؤال، يبدأ عدّادها بزر «ابدأ»،
// فإن أخطأ الفريق أو انتهى وقته انتقل السؤال إلى الخصم ليسرقه في 5 ثوانٍ بالنقاط نفسها.
import { freshFirst } from '../round.js';

export const SECONDS = 15;
export const STEAL_SECONDS = 5;
export const POINTS = { easy: 1, medium: 2, hard: 3 };
export const LEVEL_TEXT = { easy: 'سهل · نقطة', medium: 'متوسط · نقطتان', hard: 'صعب · 3 نقاط' };
const LEVELS = ['easy', 'medium', 'hard'];
// نصوص الافتتاح (design/letter.md 2.4 و4.4).
const RULE = 'أجب بكلمة تبدأ بالحرف المعيّن';
const SUB = `6 أسئلة · ${SECONDS} ثانية للسؤال · والسرقة في ${STEAL_SECONDS} ثوانٍ`;
const BRIEF = `6 أسئلة، لكل فريق 3 بالتناوب: سهل ثم متوسط ثم صعب. ${SECONDS} ثانية للسؤال، والسرقة في ${STEAL_SECONDS} ثوانٍ.`;
const other = team => (team === 1 ? 2 : 1);

// الحالات: intro افتتاح الجولة · ready السؤال ظاهر والعدّاد لم يبدأ · ask عدّاد صاحب الدور
// · steal عدّاد الخصم · decided انتهى السؤال · end انتهت الجولة.
// results[i]: من أخذ نقاط السؤال i (رقم الفريق، أو 0 إن لم يأخذها أحد)، أو null ما لم ينتهِ.
function setup({ content, first, seen = [], rng = Math.random }) {
  const bank = (content?.questions ?? []).filter(q => !q.tiebreak);
  const picked = Object.fromEntries(LEVELS.map(l => [l, freshFirst(bank.filter(q => q.level === l), seen, 2, rng)]));
  const questions = [];
  for (const l of LEVELS) for (const k of [0, 1]) {
    const q = picked[l][k];
    if (q) questions.push({ id: q.id, level: q.level, letter: q.letter, prompt: q.prompt, answer: q.answer, alts: q.alts ?? [], owner: k === 0 ? first : other(first) });
  }
  return { first, questions, index: 0, phase: 'intro', team: first, steal: null, results: questions.map(() => null) };
}

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
  if (action === 'start') return { state: { ...s, phase: 'ask' }, events: [{ type: 'timer', seconds: SECONDS }] };
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
function audience(s) {
  const q = current(s);
  const base = { first: s.first, count: s.questions.length, totals: totals(s) };
  if (s.phase === 'intro') return { ...base, screen: 'intro', turn: s.first, rule: RULE, sub: SUB };
  if (s.phase === 'end' || !q) return { ...base, screen: 'end', turn: 0 };
  const result = s.results[s.index];
  return {
    ...base,
    screen: 'ask',
    phase: s.phase,
    n: s.index + 1,
    letter: q.letter,
    question: q.prompt,
    level: q.level,
    levelText: LEVEL_TEXT[q.level],
    points: points(q),
    owner: q.owner,
    turn: s.team,
    steal: s.steal,
    // العدّاد ثابت بوقته كاملاً قبل «ابدأ»، و0:05 في السرقة؛ والحكم يحلّ محله بعد انتهاء السؤال.
    clock: s.phase === 'steal' ? STEAL_SECONDS : SECONDS,
    verdict: s.phase === 'decided' ? { team: result, points: result ? points(q) : 0 } : null,
  };
}

// ما تعرضه نافذة المقدّم: ما يراه الجمهور، ومعه الإجابة النموذجية وبدائلها ومسار الأسئلة.
function presenter(s) {
  const q = current(s);
  return {
    ...audience(s),
    answer: s.phase === 'intro' || s.phase === 'end' ? undefined : q?.answer,
    alts: s.phase === 'intro' || s.phase === 'end' ? [] : q?.alts ?? [],
    brief: BRIEF,
    accept: q ? `وتُقبل أي كلمة أخرى تبدأ بـ «${q.letter}» وتنطبق على المطلوب.` : '',
    track: s.questions.map((x, i) => ({ owner: x.owner, result: s.results[i], now: (s.phase !== 'intro' && s.phase !== 'end') && i === s.index })),
  };
}

export default {
  id: 'letter',
  name: 'الحرف المعيّن',
  order: 1,
  contentKey: 'letter.json',
  setup,
  actions,
  act,
  audience,
  presenter,
  finished: s => s.phase === 'end',
  used: s => s.questions.map(q => q.id),
};
