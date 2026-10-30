// باركود الإجابات (الوثيقة 7.1، design/s8.md 2): في بداية سؤال المزاد وقائمة الترتيب يظهر على الشاشة باركود يحمل نص الإجابات نفسه لا رابطاً،
// فيمسحه المقدّم بهاتفه ويقرؤها دون إنترنت. يُولَّد هنا على الجهاز بأداة مضمّنة (js/vendor/qrcode.mjs، qrcode-generator 2.0.4، MIT)،
// محفوظة في sw.js مع ملفات العمل.
import qrcode from './vendor/qrcode.mjs';

// العربي بايتات UTF-8 (Byte mode)، فيقرؤه الهاتف كما هو.
qrcode.stringToBytes = s => [...new TextEncoder().encode(s)];

const alts = x => (x.alts?.length ? ` (${x.alts.join('، ')})` : '');

// النص (design/s8.md 2.2). المزاد: «الموضوع · عدد العناصر» ثم عنصر في كل سطر وصيغه بين قوسين.
// الترتيب: العنوان كما في الملف، ثم «رقم الخانة · الاسم (البديلة، …)» للعشرة، ثم «11 فخ · الاسم» للثلاثة.
// p: ما تعيده presenter() للنمط.
export function answersText(modeId, p) {
  if (modeId === 'auction') return [`${p.topic} · ${p.items.length}`, ...p.items.map(x => x.name + alts(x))].join('\n');
  if (modeId === 'ranking') return [p.title, ...p.items.map(x => (x.trap ? `${x.rank} فخ · ${x.name}` : `${x.rank} · ${x.name}${alts(x)}`))].join('\n');
  return '';
}

// الرمز: تصحيح الخطأ L، والوحدة عدد صحيح من نقاط المسرح m = floor(520 ÷ (N + 6)) فيبقى حوله أبيض ثلاث وحدات فأكثر،
// والوحدات بحبر السؤال المحايد #2F3138 على الأبيض (design/s8.md 2.2).
export const QR_BOX = 520;
export function qrMatrix(text) {
  const q = qrcode(0, 'L');
  q.addData(text, 'Byte');
  q.make();
  const n = q.getModuleCount();
  return { n, dark: (r, c) => q.isDark(r, c), unit: Math.floor(QR_BOX / (n + 6)), bytes: new TextEncoder().encode(text).length };
}
export function drawQR(canvas, text) {
  const { n, dark, unit: m, bytes } = qrMatrix(text);
  canvas.width = canvas.height = n * m;
  canvas.style.width = canvas.style.height = n * m + 'px';
  const x = canvas.getContext('2d');
  x.fillStyle = '#fff'; x.fillRect(0, 0, n * m, n * m);
  x.fillStyle = '#2F3138';
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (dark(r, c)) x.fillRect(c * m, r * m, m, m);
  return { modules: n, version: (n - 17) / 4, unit: m, bytes };
}
