// المساعد الصوتي في المزاد (الوثيقة 5.5.1، design/app.md 7): مطابقة ما يسمعه الهاتف بعناصر قائمة الموضوع وبدائلها.
// منقولة من تجربة ت3 (app/lab/match.js على فرع التجربة) كما هي، وتزيد أن كل مطابقة تحمل أرقام كلماتها في النص المسموع
// (بعدّ الكلمات المفصولة بمسافة)، فتُعلَّم تلك الكلمات على الشاشة.
import { norm } from './modes/auction.js';

// حروف متقاربة النطق تُطوى حرفاً واحداً، والأرقام العربية الهندية تُكتب إنجليزية.
const LOOSE = [[/[ظذ]/g, 'ز'], [/ض/g, 'د'], [/ث/g, 'س'], [/ص/g, 'س'], [/ط/g, 'ت'], [/ق/g, 'ك'], [/[ؤئء]/g, '']];
const DIGITS = s => s.replace(/[٠-٩]/g, d => String(d.charCodeAt(0) - 0x660));
// كلمات يقولها المقدّم أو الفريق حول الإجابات: الحشو، وكلمات الحديث الشائعة، والأعداد والوقت
// (ملاحظتا المعاين 100 و104: «خلاص» أضاءت «الإخلاص»، و«ثلاثة» «ثلاجة»، و«وقت» «قط»، و«وين» «ين»، و«ساعة» «صاعقة»).
// لا تُطابَق وحدها، بل في عنصر من كلمتين فأكثر («حشرة المن»، «كرة الماء»). وتُقارن بالتطبيع وحده دون طيّ، فـ«وقت» منها و«وقط» ليست.
export const FILLER_WORDS = ['يقول', 'يقولون', 'قال', 'قالوا', 'الجواب', 'جواب', 'اجابه', 'جوابهم', 'هو', 'هي', 'يعني', 'اوكي', 'و',
  'وقت', 'الوقت', 'وين', 'ساعه', 'الساعه', 'ثواني', 'ثانيه', 'دقيقه', 'دقايق', 'دقائق', 'من', 'خلص', 'بقي', 'انتهى', 'لا', 'ما', 'في',
  'او', 'اي', 'شي', 'شيء', 'طيب', 'وبعد', 'وكمان', 'وايش', 'وشنو', 'ولا', 'وهذا', 'ويش', 'كيف', 'ليش', 'متى', 'هنا', 'هناك', 'الحين', 'توه', 'تو',
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
const FILLER = new Set(FILLER_WORDS.map(plain));
// واو العطف تلتصق بالكلمة في المسموع («والريشة»)، فتُفصل قبل التطبيع. لا تُمسّ صيغ القائمة.
const unwaw = w => (w.length >= 4 && w[0] === 'و' ? w.slice(1) : w);
// والكلمة بالواو قد تكون كلمة بواوها («ورد»، «وسادة»)، والقصيرة قد تكون واو عطف («وقط»، «ودب»، ملاحظة المعاين 101):
// فلكل كلمة أولها واو وجه آخر (بفصلها إن لم تُفصل، وبإبقائها إن فُصلت)، ويؤخذ أعلى الوجوه لكل كلمة وحدها (ملاحظة المدقّق 103:
// «وحمار وحشي» الواو في الأولى عطف وفي الثانية من الكلمة). وما بقي منه بعد الفصل حرفان فأقل لا يُقبل إلا مطابقاً بلا طيّ
// (ملاحظة المعاين 104: «وقت» تصير «قت» فتطابق «قط» بالطيّ).
const other = w => (w.length >= 2 && w[0] === 'و' ? (w.length >= 4 ? w : w.slice(1)) : null);
// كلمات النص المسموع كما تظهر على الشاشة: مفصولة بمسافة.
export const split = text => String(text ?? '').split(/\s+/).filter(Boolean);
// الكلمات التي تُطابَق، وكلٌّ برقمه في split(text). والكلمة التي يطويها التطبيع كلمتين تأخذ الرقم نفسه.
// وp الكلمة بالتطبيع وحده (plain) للمفاضلة. والطيّ لا يغيّر عدد الكلمات، فالكلمتان بالترتيب نفسه.
function heardOf(text) {
  const out = [];
  split(text).forEach((raw, k) => {
    const f = fold(unwaw(raw)).split(' '), q = plain(unwaw(raw)).split(' '), o = f.length === 1 ? other(plain(raw)) : null;
    // u وp2: الوجه الآخر للكلمة بالواو (strict: حرفان فأقل بعد فصل الواو)، وx: كلمة حشو بواوها أو دونها.
    const x = FILLER.has(plain(raw));
    f.forEach((w, n) => {
      if (!w) return;
      const h = { w, p: q[n] ?? w, k, x: x || FILLER.has(q[n] ?? w) };
      if (o && f.length === 1) Object.assign(h, { u: fold(o), p2: o, strict: o.length <= 2 && o.length < plain(raw).length });
      out.push(h);
    });
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

// شبه نافذة من المسموع بصيغة (f مطويةً، pl بالتطبيع وحده): لكل كلمة بالواو وجهاها، ويؤخذ أعلى ما تجتمع عليه.
// يعيد { score, exact }: الشبه بالطيّ (أو بلا طيّ إن دخل وجه strict)، وبلا طيّ للمفاضلة. ونافذة كلها حشو لا تُطابق.
function simWin(win, f, pl) {
  if (win.every(h => h.x)) return { score: 0, exact: 0 };
  let best = { score: 0, exact: 0 };
  const walk = (k, ws, ps, strict) => {
    if (k === win.length) {
      const exact = sim(ps.join(' '), pl), score = strict ? exact : sim(ws.join(' '), f);
      if (score > best.score || (score === best.score && exact > best.exact)) best = { score, exact };
      return;
    }
    const h = win[k];
    walk(k + 1, [...ws, h.w], [...ps, h.p], strict);
    if (h.u !== undefined) walk(k + 1, [...ws, h.u], [...ps, h.p2], strict || h.strict);
  };
  walk(0, [], [], false);
  return best;
}

// أفضل عنصر لعبارة واحدة يحددها المقدّم («اعتمد»): النافذة بطول الصيغة ±1 كلمة. يعيد { i, score } أو null دون SURE.
export function matchOne(text, prepared, min = SURE) {
  const heard = heardOf(text);
  if (!heard.length) return null;
  let top = null;
  for (const p of prepared) p.forms.forEach((f, fi) => {
    const n = f.split(' ').length, pl = p.plains?.[fi] ?? f;
    let s = heard.length <= 6 ? simWin(heard, f, pl).score : 0;
    for (let len = Math.max(1, n - 1); len <= n + 1; len++)
      for (let at = 0; at + len <= heard.length; at++) s = Math.max(s, simWin(heard.slice(at, at + len), f, pl).score);
    if (s >= min && (!top || s > top.score)) top = { i: p.i, score: s };
  });
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
        const { score, exact } = simWin(heard.slice(at, at + len), f, p.plains?.[fi] ?? f);
        if (score >= min) cands.push({ i: p.i, score, exact, at, span: len, len: f.replace(/ /g, '').length });
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
