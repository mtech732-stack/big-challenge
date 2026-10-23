// قياس 60/30/10 (design/system.md 15.12، من 1.3): نسبة كل دور لوني من مساحة صورة شاشة 1920×1080.
// الاستعمال: node design/ratio.cjs صورة1.png صورة2.png ...
// يعدّ كل نقطة في الصورة في لون من خمسة:
//   الأحمر والأزرق: طرفا الفريقين (ولوحة الآخر على لسانه، والصفيحة).
//   الأبيض وما قاربه: البطاقة، والنص، والرقم الكبير، والشارات البيضاء، ومربع الإعلان، والأزرار.
//   الأصفر: الحرف، وإطار الوقت والعدّاد، وشارة النمط، ومؤشر الدور.
//   وما سواها (حبر النص المحايد، والحواف الملساء) خارج الحساب.
// الحقل (الستون):
//   - دور: إن غلب لون على الآخر (ثلاثة أرباع الطرفين فأكثر) فالحقل لون صاحب الدور وحده.
//   - محايد: وإلا فالطرفان معاً، مناصفة تقريباً.
// والمطلوب: الحقل 55–75 · الأبيض 20–35 · الأصفر 10 سقفاً لا هدفاً.
const { chromium } = require('playwright');
const fs = require('fs');

const LIMITS = { field: [55, 75], white: [20, 35], yellow: [0, 10] };

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
      let red = 0, blue = 0, white = 0, yellow = 0;
      for (let i = 0; i < px.length; i += 4) {
        const R = px[i], G = px[i + 1], B = px[i + 2];
        if (R > 200 && G > 200 && B > 200) white++;
        else if (R > 200 && G > 140 && B < 90) yellow++;
        else if (R > G + 40 && R > B + 30) red++;
        else if (B > R + 30) blue++;
      }
      const n = px.length / 4, p = v => Math.round(v / n * 1000) / 10;
      return { red: p(red), blue: p(blue), white: p(white), yellow: p(yellow) };
    }, data);
    const top = Math.max(r.red, r.blue), turn = top >= .75 * (r.red + r.blue);
    r.field = Math.round((turn ? top : r.red + r.blue) * 10) / 10;
    const ok = Object.entries(LIMITS).every(([k, [a, b]]) => r[k] >= a && r[k] <= b);
    if (!ok) bad++;
    const mode = turn ? `دور ${r.red > r.blue ? 'الأول' : 'الثاني'}` : 'محايد';
    console.log(`${ok ? '✓' : '✗'} ${f.split('/').pop()} · ${mode} · الحقل ${r.field}% (أحمر ${r.red} · أزرق ${r.blue}) · الأبيض ${r.white}% · الأصفر ${r.yellow}%`);
  }
  await browser.close();
  process.exitCode = bad ? 1 : 0;
})();
