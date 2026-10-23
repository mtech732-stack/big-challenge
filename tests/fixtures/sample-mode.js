// وحدة نمط تجريبية تلتزم «عقد الوحدة»، للاختبار وللشرح في docs/module-contract.md.
// تشبه «الحرف المعيّن» مصغّراً: سؤال لكل فريق، 15 ثانية، وسرقة في 5 ثوانٍ.
import { freshFirst } from '../../js/round.js';

const POINTS = { easy: 1, medium: 2, hard: 3 };
const other = team => (team === 1 ? 2 : 1);

function audience(s) {
  const q = s.questions[s.index];
  if (!q) return { title: 'انتهت الجولة' };
  return { letter: q.letter, question: q.prompt, level: q.level, team: s.team, steal: s.phase === 'steal' };
}

export default {
  id: 'letter',
  name: 'الحرف المعيّن',
  order: 1,
  contentKey: 'letter.json',

  setup({ content, first, seen, rng }) {
    const questions = freshFirst(content.questions.filter(q => !q.tiebreak), seen, 2, rng);
    return { questions, index: 0, team: first, phase: 'ask' };
  },

  actions(s) {
    if (s.phase === 'done') return [];
    return [{ id: 'correct', label: 'صحيحة' }, { id: 'wrong', label: 'خاطئة' }];
  },

  act(s, action) {
    const q = s.questions[s.index];
    const next = () => {
      const index = s.index + 1;
      if (index === s.questions.length) return { ...s, index, phase: 'done' };
      return { ...s, index, phase: 'ask', team: other(s.team) };
    };
    if (action === 'correct') {
      const n = next();
      return { state: n, events: [{ type: 'score', team: s.team, points: POINTS[q.level] }, ...(n.phase === 'done' ? [] : [{ type: 'timer', seconds: 15 }])] };
    }
    if (s.phase === 'ask') return { state: { ...s, phase: 'steal', team: other(s.team) }, events: [{ type: 'timer', seconds: 5 }, { type: 'moment', name: 'steal' }] };
    const n = { ...next(), team: s.team };
    return { state: n, events: n.phase === 'done' ? [] : [{ type: 'timer', seconds: 15 }] };
  },

  audience,

  presenter(s) {
    const q = s.questions[s.index];
    return { ...audience(s), answer: q?.answer, alts: q?.alts ?? [] };
  },

  finished: s => s.phase === 'done',
  used: s => s.questions.map(q => q.id),
};
