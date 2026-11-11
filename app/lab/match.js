// مطابقة ما سمعه الهاتف بعناصر قائمة المزاد وبدائلها (ت3، تجربة جدوى).
// تبني على تطبيع اللعبة نفسه (js/modes/auction.js)، وتزيد طيّاً للحروف التي يخلط بينها التعرّف الصوتي.
import { norm } from '../js/modes/auction.js';

// حروف متقاربة النطق تُطوى حرفاً واحداً، والأرقام العربية الهندية تُكتب إنجليزية.
const LOOSE = [[/[ظذ]/g, 'ز'], [/ض/g, 'د'], [/ث/g, 'س'], [/ص/g, 'س'], [/ط/g, 'ت'], [/ق/g, 'ك'], [/[ؤئء]/g, '']];
const DIGITS = s => s.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660));
// كلمات يقولها المقدّم حول الإجابة ولا تدخل فيها.
const FILLER = new Set(['يقول', 'يقولون', 'قال', 'قالوا', 'الجواب', 'جواب', 'اجابه', 'جوابهم', 'هو', 'هي', 'يعني', 'طيب', 'اوكي', 'و']);

export const fold = s => {
  let t = norm(DIGITS(String(s)).toLowerCase()).replace(/[^\p{L}\p{N} ]/gu, ' ');
  for (const [re, to] of LOOSE) t = t.replace(re, to);
  return t.replace(/\s+/g, ' ').trim();
};
// واو العطف تلتصق بالكلمة في المسموع («والريشة»، «وكرة»)، فتُفصل قبل التطبيع. لا تُمسّ صيغ القائمة.
const unwaw = s => String(s).split(/\s+/).map(w => (w.length >= 4 && w[0] === 'و' ? w.slice(1) : w)).join(' ');
const words = s => fold(unwaw(s)).split(' ').filter(w => w && !FILLER.has(w));

// تشابه بين نصين 0..1 بمسافة التحرير على الحروف، بلا مسافات (فـ«بينغ بونغ» = «بينغبونغ»).
export function sim(a, b) {
  a = a.replace(/ /g, ''); b = b.replace(/ /g, '');
  if (!a || !b) return 0;
  if (a === b) return 1;
  const m = a.length, n = b.length;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return 1 - prev[n] / Math.max(m, n);
}

// أفضل نافذة متصلة من كلمات المسموع تشبه الصيغة. النافذة بطول الصيغة ±1 كلمة.
function best(heard, form) {
  const fw = form.split(' ');
  let top = sim(heard.join(' '), form);
  for (let len = Math.max(1, fw.length - 1); len <= fw.length + 1; len++)
    for (let i = 0; i + len <= heard.length; i++) top = Math.max(top, sim(heard.slice(i, i + len).join(' '), form));
  return top;
}

// يُبنى مرة لكل موضوع: كل عنصر بصيغه (الاسم والبدائل) مطويةً.
export const prepare = topic => topic.items.map((it, i) => ({
  i, name: it.name, forms: [it.name, ...(it.alts ?? [])].map(fold).filter(Boolean),
}));

export const SURE = 0.8;   // اقتراح واثق
export const MAYBE = 0.65; // «ربما»: يُعرض ويُنتظر حكم المقدّم

// يعيد { pick, score, sure, top: [{ i, name, score }…3] }. pick عنصر أو null إن لم يبلغ «ربما».
export function match(text, prepared) {
  const heard = words(text);
  if (!heard.length) return { pick: null, score: 0, sure: false, top: [] };
  const scored = prepared.map(p => ({ i: p.i, name: p.name, score: Math.max(...p.forms.map(f => best(heard, f))) }))
    .sort((a, b) => b.score - a.score);
  const [first] = scored;
  return {
    pick: first.score >= MAYBE ? first : null,
    score: first.score,
    sure: first.score >= SURE,
    top: scored.slice(0, 3),
  };
}

// يجرّب كل بدائل التعرّف (أفضل الصيغ التي يعيدها الهاتف) ويأخذ أعلاها.
export function matchAll(texts, prepared) {
  return texts.filter(Boolean).map(t => ({ text: t, ...match(t, prepared) }))
    .sort((a, b) => b.score - a.score)[0] ?? { text: '', pick: null, score: 0, sure: false, top: [] };
}

// السماع المتواصل: كل العناصر التي قيلت في نص واحد طويل، بترتيب قولها.
// كل صيغة تُطابَق بنوافذ متصلة بطولها (±1 كلمة)، ثم تُقبل الأعلى تشابهاً فالأطول، ولا تتداخل كلمتان.
// فـ«الريشة الطائرة» تأخذ كلمتيها قبل أن تأخذ «الطائرة» (بديل الكرة الطائرة) إحداهما.
export function matchMany(text, prepared, min = SURE) {
  const heard = words(text);
  const cands = [];
  for (const p of prepared) for (const f of p.forms) {
    const n = f.split(' ').length;
    for (let len = Math.max(1, n - 1); len <= n + 1; len++)
      for (let at = 0; at + len <= heard.length; at++) {
        const score = sim(heard.slice(at, at + len).join(' '), f);
        if (score >= min) cands.push({ i: p.i, name: p.name, score, at, len: f.replace(/ /g, '').length, span: len });
      }
  }
  cands.sort((a, b) => b.score - a.score || b.len - a.len);
  const used = new Set();
  const seen = new Set();
  const out = [];
  for (const c of cands) {
    if (seen.has(c.i)) continue;
    const pos = Array.from({ length: c.span }, (_, k) => c.at + k);
    if (pos.some(x => used.has(x))) continue;
    pos.forEach(x => used.add(x));
    seen.add(c.i);
    out.push(c);
  }
  return out.sort((a, b) => a.at - b.at);
}
