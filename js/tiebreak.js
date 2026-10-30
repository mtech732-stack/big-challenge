// الجولة الفاصلة (الوثيقة 5.8، design/final.md): موت مفاجئ عند التعادل بعد آخر جولة. وحدة بشكل «عقد الوحدة» يديرها مشغّل الجولة
// (العدّاد والتراجع والأحداث)، وليست نمطاً: لا تدخل قائمة الأنماط، وتبدأ من النتيجة النهائية (js/play.js، toTiebreak).
// كل محاولة سؤال صعب من «الحرف المعيّن» (أسئلة tiebreak: true في letter.json) لكل فريق بالتناوب، يبدؤها الخاسر في القرعة.
// من أصاب وأخطأ خصمه في المحاولة نفسها فاز، وإن أصابا معاً أو أخطآ معاً فسؤالان جديدان. ولا انتقال للخصم.
// وسؤالها كسؤال النمط الأول (1.11، js/judge.js): العدّاد بعد 5 ثوانٍ، ثم «كشف الإجابة» ويختار المقدّم: أصاب، أو «لم يُجب أحد».
import { freshFirst } from './round.js';
import { lead, timing, timingActions, picked } from './judge.js';
import { SECONDS } from './modes/letter.js';

// نقاط الإصابة في الجولة الفاصلة: نقاط سؤال صعب من «الحرف المعيّن» (5.1)، بقرار المالك (25 أكتوبر 19:14):
// «تمنحه نقاطاً لتظهر مع النهاية». فيتقدّم رقم الفائز، وتظهر في النتيجة النهائية خانةً بعد آخر عنصر (gains في js/match.js).
export const TIE_POINTS = 3;

const other = team => (team === 1 ? 2 : 1);
const RULE = 'من أصاب وأخطأ خصمه فاز';
const SUB = `سؤال لكل فريق بالتناوب · ${SECONDS} ثانية للسؤال`;
const BRIEF = [`سؤال صعب من «الحرف المعيّن» لكل فريق بالتناوب، ${SECONDS} ثانية`, 'لا تنتقل الإجابة إلى الخصم',
  'من أصاب وأخطأ خصمه في المحاولة نفسها فاز', 'وإن أصابا معاً أو أخطآ معاً: سؤالان جديدان'];

// announce: تنتهي الجولة الفاصلة بفائزها، فتعرض المباراة النتيجة النهائية وفيها نقاطها، ثم «أعلن الفائز» (js/play.js).
// الحالات: intro المقدمة · ready التمهيد · ask العدّاد · over انتهى الوقت · revealed كُشفت الإجابة · decided بعد الحكم · end أُعلن الفائز.
// questions: أسئلة الجولة الفاصلة كلها بترتيب عشوائي (ما لم يظهر أولاً)، وqi السؤال الحالي، ويعود إلى أولها إن نفدت.
// attempt رقم المحاولة، وk دور من فيها (0 الذي يبدأ، 1 الآخر)، وhits إصابة كلٍّ في المحاولة الجارية.
function setup({ content, first, seen = [], rng = Math.random }) {
  const bank = (content?.questions ?? []).filter(q => q.tiebreak);
  const questions = freshFirst(bank, seen, bank.length, rng).map(q => ({ id: q.id, box: q.letter, prompt: q.prompt, answer: q.answer, alts: q.alts ?? [] }));
  return { first, questions, qi: 0, attempt: 1, k: 0, phase: 'intro', team: first, hits: [null, null], winner: 0, asked: [], paused: null };
}

const current = s => s.questions[s.qi % s.questions.length];
// حسم المحاولة بعد حكم السؤال الثاني: الفائز، أو 0 إن أصابا معاً أو أخطآ معاً.
const decided = s => (s.k === 1 && s.phase === 'decided' && s.hits[0] !== s.hits[1] ? (s.hits[0] ? s.first : other(s.first)) : 0);

function actions(s) {
  if (s.phase === 'intro') return [{ id: 'show', label: 'السؤال الأول' }];
  if (s.phase === 'revealed') return [{ id: 'pick', team: s.team, label: TIE_POINTS ? `أصاب · +${TIE_POINTS}` : 'أصاب' }, { id: 'pick', team: 0, label: 'لم يُجب أحد' }];
  if (s.phase === 'decided') {
    if (s.k === 0) return [{ id: 'next', label: 'التالي' }];
    return decided(s) ? [{ id: 'announce', label: 'إلى النتيجة النهائية' }] : [{ id: 'again', label: `سؤالان جديدان · المحاولة ${s.attempt + 1}` }];
  }
  return timingActions(s, 0);
}

// left: ما بقي من العدّاد الجاري (js/round.js)، لـ«إيقاف مؤقت».
function act(s, action, scores, now, left) {
  const ask = (qi, k, attempt, hits) => ({ ...s, qi, k, attempt, hits, phase: 'ready', paused: null, team: k === 0 ? s.first : other(s.first), asked: [...s.asked, current({ ...s, qi }).id] });
  if (action === 'show' && s.phase === 'intro') return { state: ask(0, 0, 1, [null, null]), events: [lead()] };
  const t = timing(s, action, left, { seconds: SECONDS });
  if (t) return t;
  const who = picked(action);
  if (s.phase === 'revealed' && (who === s.team || who === 0)) {
    const hit = who === s.team;
    const state = { ...s, phase: 'decided', hits: s.hits.map((h, i) => (i === s.k ? hit : h)) };
    const events = hit ? [...(TIE_POINTS ? [{ type: 'score', team: s.team, points: TIE_POINTS }] : []), { type: 'moment', name: 'hit', team: s.team }]
      : [{ type: 'moment', name: 'miss', team: s.team }];
    return { state, events };
  }
  if (action === 'next' && s.phase === 'decided' && s.k === 0) return { state: ask(s.qi + 1, 1, s.attempt, s.hits), events: [lead()] };
  if (action === 'again' && s.phase === 'decided' && s.k === 1 && !decided(s)) return { state: ask(s.qi + 1, 0, s.attempt + 1, [null, null]), events: [lead()] };
  if (action === 'announce' && decided(s)) return { state: { ...s, phase: 'end', winner: decided(s) }, events: [] };
  return { state: s, events: [] };
}

// نافذة الجمهور: لا إجابة قبل الكشف. والحكم «[الاسم] · أصاب» أو «· لم يُصب» بلا نقاط (design/final.md 2.5)، والإجابة بعده.
function audience(s) {
  const base = { tiebreak: true, first: s.first, attempt: s.attempt, count: 2, totals: { 1: 0, 2: 0 } };
  if (s.phase === 'intro') return { ...base, screen: 'intro', turn: s.first, rule: RULE, sub: SUB, starter: 'يبدأ:' };
  if (s.phase === 'end') return { ...base, screen: 'end', turn: 0, winner: s.winner };
  const q = current(s), hit = s.hits[s.k];
  return {
    ...base, screen: 'ask', phase: s.phase, n: s.k + 1, letter: q.box, tatweel: false, question: q.prompt, turn: s.team, steal: null,
    clock: SECONDS, lead: s.phase === 'ready', paused: !!s.paused,
    verdict: s.phase === 'decided' ? { team: hit ? s.team : 0, who: s.team, label: hit ? (TIE_POINTS ? `أصاب · +${TIE_POINTS}` : 'أصاب') : 'لم يُصب', points: hit ? TIE_POINTS : 0 } : null,
    answer: s.phase === 'revealed' || s.phase === 'decided' ? q.answer : undefined,
  };
}

// نافذة المقدّم: ومعها الإجابة النموذجية وبدائلها، وخانتا المحاولة (تمتلئ إن أصاب، وتُطفأ إن لم يُصب)، والحسم.
function presenter(s) {
  const a = audience(s), q = s.phase === 'intro' || s.phase === 'end' ? null : current(s);
  return {
    ...a,
    answer: q?.answer, alts: q?.alts ?? [], brief: BRIEF, why: 'خسر القرعة يبدأ',
    accept: q ? `وتُقبل أي كلمة أخرى تبدأ بـ «${q.box}» وتنطبق على المطلوب.` : '',
    track: s.phase === 'intro' ? [] : [0, 1].slice(0, s.k + 1).map(i => ({ owner: i === 0 ? s.first : other(s.first), result: s.hits[i] === null ? null : s.hits[i] ? (i === 0 ? s.first : other(s.first)) : 0, now: i === s.k && s.phase !== 'decided' })),
    // بعد حكم الثاني: الفائز، أو 'hit' أصابا معاً، أو 'miss' أخطآ معاً.
    outcome: s.k === 1 && s.phase === 'decided' ? (decided(s) || (s.hits[0] ? 'hit' : 'miss')) : null,
    upNext: other(s.first),
  };
}

export default {
  id: 'tiebreak',
  name: 'الجولة الفاصلة',
  contentKey: 'letter.json',
  setup, actions, act, audience, presenter,
  finished: s => s.phase === 'end',
  used: s => s.asked,
};
