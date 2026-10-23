// اختبار آلي للصفحة الأولى: يشغّل المتصفح على خادم محلي ويتحقق من الظاهر.
const { chromium } = require('playwright');

(async () => {

const base = process.argv[2] || 'http://localhost:8000/';
const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => m.type() === 'error' && errors.push(m.text()));

const res = await page.goto(base);
const checks = {
  'الحالة 200': res.status() === 200,
  'العنوان': (await page.title()) === 'التحدي الكبير',
  'الاتجاه rtl': (await page.getAttribute('html', 'dir')) === 'rtl',
  'النص الرئيسي': (await page.textContent('#title')).trim() === 'التحدي الكبير',
  'الإصدار بأرقام إنجليزية': /0\.1 · 2026-10-23/.test(await page.textContent('#build')),
  'لا أرقام عربية هندية': !/[٠-٩۰-۹]/.test(await page.textContent('body')),
  'لا ميل للحروف': await page.$$eval('*', els => els.every(e => getComputedStyle(e).fontStyle === 'normal')),
  'لا أخطاء في الصفحة': errors.length === 0,
};
await page.screenshot({ path: process.argv[3] || 'stage0-first-page.png' });
await browser.close();

let ok = true;
for (const [k, v] of Object.entries(checks)) { console.log(`${v ? 'نجح' : 'فشل'} · ${k}`); ok &&= v; }
if (errors.length) console.log(errors.join('\n'));
process.exit(ok ? 0 : 1);
})();
