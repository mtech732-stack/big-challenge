// المساعد الصوتي في المزاد (الوثيقة 5.5.1، design/app.md 7): مطابقة ما يسمعه الهاتف بعناصر قائمة الموضوع وبدائلها.
// منقولة من تجربة ت3 (app/lab/match.js على فرع التجربة) كما هي، وتزيد أن كل مطابقة تحمل أرقام كلماتها في النص المسموع
// (بعدّ الكلمات المفصولة بمسافة)، فتُعلَّم تلك الكلمات على الشاشة.
import { norm } from './modes/auction.js';

// حروف متقاربة النطق تُطوى حرفاً واحداً، والأرقام العربية الهندية تُكتب إنجليزية.
const LOOSE = [[/[ظذ]/g, 'ز'], [/ض/g, 'د'], [/ث/g, 'س'], [/ص/g, 'س'], [/ط/g, 'ت'], [/ق/g, 'ك'], [/[ؤئء]/g, '']];
const DIGITS = s => s.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660));
// كلمات يقولها المقدّم أو الفريق حول الإجابات ولا تدخل فيها: الحشو، وكلمات الحديث الشائعة، والأعداد
// (ملاحظة المعاين 100: «خلاص» أضاءت «الإخلاص»، و«ثلاثة» أضاءت «ثلاجة»). وليس فيها اسم من بنك المزاد (stage8-voice-match يفحص).
// وتُطوى كما تُطوى كلمات المسموع، فتُقارن بها بعد الطيّ.
export const FILLER_WORDS = ['يقول', 'يقولون', 'قال', 'قالوا', 'الجواب', 'جواب', 'اجابه', 'جوابهم', 'هو', 'هي', 'يعني', 'اوكي', 'و',
  'خلاص', 'بعد', 'شنو', 'ايش', 'وش', 'شو', 'كمان', 'بعدين', 'ثاني', 'ثانيه', 'والله', 'زين', 'نعم', 'ايوه', 'اللي', 'هذا', 'هذي',
  'هذه', 'ذاك', 'عن', 'مع', 'ثم', 'بس', 'يا', 'احنا', 'نحن', 'انت', 'هم', 'كذا', 'يمكن', 'اظن',
  'صح', 'غلط', 'باقي', 'اسرع', 'يلا', 'ياللا', 'ممكن', 'لحظه', 'اخر', 'القاعه', 'قاعه', 'كل', 'عندنا', 'عندي', 'ادري', 'اعرف',
  'واحد', 'اثنين', 'ثلاث', 'ثلاثه', 'اربع', 'خمس', 'خمسه', 'ست', 'سته', 'سبع', 'سبعه', 'ثمانيه', 'تسع', 'تسعه', 'عشر', 'عشره'];

// plain: التطبيع وحده دون طيّ الحروف المتقاربة، يُفاضل به بين عنصرين يطويهما الطيّ نصاً واحداً («قيمة» و«كيمة»، «ضب» و«دب»).
const plain = s => norm(DIGITS(String(s)).toLowerCase()).replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();
export const fold = s => {
  let t = plain(s);
  for (const [re, to] of LOOSE) t = t.replace(re, to);
  return t.replace(/\s+/g, ' ').trim();
};
const FILLER = new Set(FILLER_WORDS.map(fold));
// واو العطف تلتصق بالكلمة في المسموع («والريشة»)، فتُفصل قبل التطبيع. لا تُمسّ صيغ القائمة.
const unwaw = w => (w.length >= 4 && w[0] === 'و' ? w.slice(1) : w);
// والكلمة بالواو قد تكون كلمة بواوها («ورد»، «وسادة»)، والقصيرة قد تكون واو عطف («وقط»، «ودب»، ملاحظة المعاين 101):
// فلكل كلمة أولها واو وجه آخر (بفصلها إن لم تُفصل، وبإبقائها إن فُصلت)، ويؤخذ أعلى الوجهين.
const other = w => (w.length >= 2 && w[0] === 'و' ? (w.length >= 4 ? w : w.slice(1)) : null);
// كلمات النص المسموع كما تظهر على الشاشة: مفصولة بمسافة.
export const split = text => String(text ?? '').split(/\s+/).filter(Boolean);
// الكلمات التي تُطابَق، وكلٌّ برقمه في split(text). والكلمة التي يطويها التطبيع كلمتين تأخذ الرقم نفسه.
// وp الكلمة بالتطبيع وحده (plain) للمفاضلة. والطيّ لا يغيّر عدد الكلمات، فالكلمتان بالترتيب نفسه.
function heardOf(text) {
  const out = [];
  split(text).forEach((raw, k) => {
    const f = fold(unwaw(raw)).split(' '), q = plain(unwaw(raw)).split(' '), o = f.length === 1 ? other(plain(raw)) : null;
    // u وp2: الوجه الآخر للكلمة بالواو، وإلا هي نفسها.
    f.forEach((w, n) => { if (w && !FILLER.has(w)) out.push({ w, p: q[n] ?? w, u: o ? fold(o) : w, p2: o ?? q[n] ?? w, k }); });
  });
  return out;
}

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

// يُبنى مرة لكل موضوع: كل عنصر بصيغه (الاسم والبدائل) مطويةً.
// وكل صيغة معها نصها بالتطبيع وحده (plains) للمفاضلة بين متساويين بعد الطيّ.
export const prepare = items => items.map((it, i) => {
  const all = [it.name, ...(it.alts ?? [])].filter(x => fold(x));
  return { i, name: it.name, forms: all.map(fold), plains: all.map(plain) };
});

export const SURE = 0.8;   // مطابقة تُضيء العنصر وحدها

// شبه نافذة من المسموع بصيغة: بالكلمات كما سُمعت، وبالوجه الآخر للقصيرة بالواو (u)، والأعلى منهما.
const simWin = (win, f, k = 'w', k2 = 'u') => Math.max(sim(win.map(h => h[k]).join(' '), f), sim(win.map(h => h[k2]).join(' '), f));

// أفضل عنصر لعبارة واحدة يحددها المقدّم («اعتمد»): النافذة بطول الصيغة ±1 كلمة. يعيد { i, score } أو null دون SURE.
export function matchOne(text, prepared, min = SURE) {
  const heard = heardOf(text);
  if (!heard.length) return null;
  let top = null;
  for (const p of prepared) for (const f of p.forms) {
    const n = f.split(' ').length;
    let s = simWin(heard, f);
    for (let len = Math.max(1, n - 1); len <= n + 1; len++)
      for (let at = 0; at + len <= heard.length; at++) s = Math.max(s, simWin(heard.slice(at, at + len), f));
    if (s >= min && (!top || s > top.score)) top = { i: p.i, score: s };
  }
  return top;
}

// السماع المتواصل: كل العناصر التي قيلت في نص واحد طويل، بترتيب قولها، وكلٌّ بأرقام كلماته (w).
// كل صيغة تُطابَق بنوافذ متصلة بطولها (±1 كلمة)، ثم تُقبل الأعلى تشابهاً فالأطول، ولا تتداخل كلمتان، ولا يتكرر عنصر،
// والعنصر المكرر يأخذ كلماته ولا يُعدّ.
// فـ«الريشة الطائرة» تأخذ كلمتيها قبل أن تأخذ «الطائرة» (بديل الكرة الطائرة) إحداهما.
export function matchMany(text, prepared, min = SURE) {
  const heard = heardOf(text);
  const cands = [];
  for (const p of prepared) p.forms.forEach((f, fi) => {
    const n = f.split(' ').length;
    for (let len = Math.max(1, n - 1); len <= n + 1; len++)
      for (let at = 0; at + len <= heard.length; at++) {
        const win = heard.slice(at, at + len), score = simWin(win, f);
        if (score >= min) cands.push({ i: p.i, score, exact: simWin(win, p.plains?.[fi] ?? f, 'p', 'p2'), at, span: len, len: f.replace(/ /g, '').length });
      }
  });
  // الأعلى شبهاً، ثم الأقرب بلا طيّ، ثم الأطول.
  cands.sort((a, b) => b.score - a.score || b.exact - a.exact || b.len - a.len);
  const used = new Set(), seen = new Set(), out = [];
  for (const c of cands) {
    const pos = Array.from({ length: c.span }, (_, k) => c.at + k);
    if (pos.some(x => used.has(x))) continue;
    // عنصر قيل ثانية (ملاحظة المعاين 95): كلماته له وإن لم يُعدّ مرتين، فلا يأخذها عنصر أضعف شبهاً («محمد» مرتين لا تُضيء «محمود»).
    if (seen.has(c.i)) { pos.forEach(x => used.add(x)); continue; }
    pos.forEach(x => used.add(x));
    seen.add(c.i);
    out.push({ i: c.i, score: c.score, at: c.at, w: [...new Set(pos.map(x => heard[x].k))] });
  }
  return out.sort((a, b) => a.at - b.at);
}
