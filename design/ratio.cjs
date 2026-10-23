// قياس 60/30/10 (design/system.md 2.1): نسبة كل دور لوني من مساحة صورة شاشة 1920×1080.
// الاستعمال: node design/ratio.cjs صورة1.png صورة2.png ...
// يعدّ كل نقطة في الصورة في دور من ثلاثة:
//   المسيطر: الأزرق بدرجاته (المسرح، والصفيحة، والعدّاد، ونص البطاقة الداكن، والرقم العملاق الأول).
//   المساند: الأبيض وما قاربه (البطاقة، ولوحة الفريق الثاني، والشارات البيضاء، والأزرار).
//   التركيز: الأحمر والأصفر (لوحة الفريق الأول، والحرف، والعدّاد، وشارة النمط، ومؤشر الدور).
// والمطلوب: المسيطر 55–75 · المساند 20–35 · التركيز 12 حداً أقصى.
const { chromium } = require('playwright');
const fs = require('fs');

const LIMITS = { blue: [55, 75], white: [20, 35], accent: [0, 12] };

(async () => {
  const files = process.argv.slice(2);
  if (!files.length) { console.log('node design/ratio.cjs صورة.png ...'); return; }
  const browser = await chromium.launch();
  const page = await browser.newPage();
  let bad = 0;
  for (const f of files) {
    const data = 'data:image/png;base64,' + fs.readFileSync(f).toString('base64');
    const r = await page.evaluate(async src => {
      const img = new Image(); img.src = src; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
      const x = c.getContext('2d'); x.drawImage(img, 0, 0);
      const px = x.getImageData(0, 0, c.width, c.height).data;
      let blue = 0, white = 0, accent = 0;
      for (let i = 0; i < px.length; i += 4) {
        const R = px[i], G = px[i + 1], B = px[i + 2];
        if (R > 200 && G > 200 && B > 200) white++;
        else if (R > 170 && R > B + 60) accent++;          // الأحمر والأصفر
        else blue++;
      }
      const n = px.length / 4, p = v => Math.round(v / n * 1000) / 10;
      return { blue: p(blue), white: p(white), accent: p(accent) };
    }, data);
    const ok = Object.entries(LIMITS).every(([k, [a, b]]) => r[k] >= a && r[k] <= b);
    if (!ok) bad++;
    console.log(`${ok ? '✓' : '✗'} ${f.split('/').pop()} · المسيطر ${r.blue}% · المساند ${r.white}% · التركيز ${r.accent}%`);
  }
  await browser.close();
  process.exitCode = bad ? 1 : 0;
})();
