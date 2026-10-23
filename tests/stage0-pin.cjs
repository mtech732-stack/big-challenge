// اختبار آلي لشاشة الرقم السري وصفحة تغييره.
const { chromium } = require('playwright');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { TEST_PIN, testPinRecord, usePin, unlock, reporter } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || '.';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  context.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => m.type() === 'error' && !m.text().includes('ERR_INTERNET_DISCONNECTED') && errors.push(m.text()));
  });
  const { check, finish } = reporter();
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // الملف المنشور: صورة مشفّرة فقط، لا رقم صريح.
  const real = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'pin.json'), 'utf8'));
  check('pin.json فيه salt وiterations وhash فقط',
    Object.keys(real).sort().join() === 'hash,iterations,salt' && /^[0-9a-f]{64}$/.test(real.hash));

  await usePin(context);
  const page = await context.newPage();
  await page.goto(base);
  check('عند الفتح: تظهر شاشة الرقم السري وحدها', await page.isVisible('#pin') && await page.isHidden('#app'));
  check('لا شيء من نافذة المقدّم ظاهر قبل الرقم', !(await page.innerText('body')).includes('اختبار النافذتين'));
  await page.screenshot({ path: `${shots}/pin-gate.png` });

  await page.fill('#pin', '000000');
  await page.click('#enter');
  await page.waitForSelector('#pin-error:not([hidden])');
  check('رقم خاطئ: «الرقم غير صحيح» وتبقى الشاشة مغلقة',
    (await page.textContent('#pin-error')) === 'الرقم غير صحيح' && await page.isHidden('#app'));
  await page.screenshot({ path: `${shots}/pin-wrong.png` });

  await page.fill('#pin', '');
  await page.press('#pin', 'Enter');
  await page.waitForSelector('#enter:not([disabled])');
  check('رقم فارغ: لا يفتح', await page.isHidden('#app'));

  // يُقبل الرقم مكتوباً بأرقام عربية من لوحة المفاتيح العربية، ويُفتح بزر Enter.
  const arabic = TEST_PIN.replace(/\d/g, d => String.fromCharCode(0x0660 + Number(d)));
  await page.fill('#pin', arabic);
  await page.press('#pin', 'Enter');
  await page.waitForSelector('#app:not([hidden])', { timeout: 10000 });
  check('الرقم الصحيح (بأرقام عربية وزر Enter): تظهر نافذة المقدّم', await page.isVisible('#open'));
  check('شاشة الرقم تختفي بعد الدخول', (await page.$('#gate')) === null);

  // «مع كل فتح»: إعادة التحميل تطلب الرقم من جديد.
  await page.reload();
  check('إعادة التحميل: يُطلب الرقم من جديد', await page.isVisible('#pin') && await page.isHidden('#app'));

  // نافذة الجمهور المفتوحة مباشرة لا تتحكم بشيء ولا تتصل دون مقدّم دخل بالرقم.
  const direct = await context.newPage();
  await direct.goto(base + 'audience.html');
  await wait(2500);
  check('نافذة الجمهور دون مقدّم داخل: «بانتظار المقدّم»', (await direct.textContent('#label')).includes('بانتظار المقدّم'));
  await unlock(page);
  await wait(2500);
  check('بعد دخول المقدّم تتصل', (await page.getAttribute('#status', 'data-on')) === 'true');
  await direct.close();

  // بلا إنترنت: يُقبل الرقم بآخر صورة محفوظة في المتصفح.
  await page.reload();
  await context.setOffline(true);
  await unlock(page);
  check('بلا إنترنت بعد دخول سابق: يُقبل الرقم بآخر صورة محفوظة', await page.isVisible('#open'));
  await context.setOffline(false);

  // جهاز جديد بلا إنترنت ولا صورة محفوظة: رسالة واضحة، ولا يفتح.
  const fresh = await browser.newContext();
  fresh.on('page', p => p.on('pageerror', e => errors.push(e.message)));
  const freshPage = await fresh.newPage();
  await freshPage.goto(base);
  await fresh.setOffline(true);
  await freshPage.fill('#pin', TEST_PIN);
  await freshPage.click('#enter');
  await freshPage.waitForSelector('#pin-error:not([hidden])');
  check('جهاز جديد بلا إنترنت: «تعذّر التحقق» ولا يفتح',
    (await freshPage.textContent('#pin-error')).includes('تعذّر التحقق') && await freshPage.isHidden('#app'));
  await fresh.close();

  // تغيير الرقم: الرقم القديم يُرفض والجديد يُقبل.
  await usePin(context, testPinRecord('246802'));
  await page.reload();
  await page.fill('#pin', TEST_PIN);
  await page.click('#enter');
  await page.waitForSelector('#pin-error:not([hidden])');
  check('بعد تغيير الملف: الرقم القديم يُرفض', await page.isHidden('#app'));
  await unlock(page, '246802');
  check('بعد تغيير الملف: الرقم الجديد يُقبل', await page.isVisible('#open'));

  // صفحة تغيير الرقم تولّد ملفاً صحيحاً.
  const tool = await context.newPage();
  await tool.goto(base + 'tools/pin.html');
  await tool.fill('#pin1', '1234');
  await tool.fill('#pin2', '1234');
  await tool.click('#make');
  check('صفحة التغيير: ترفض الرقم القصير', (await tool.textContent('#error')).includes('قصير'));
  await tool.fill('#pin1', '864209');
  await tool.fill('#pin2', '864201');
  await tool.click('#make');
  check('صفحة التغيير: ترفض الرقمين غير المتطابقين', (await tool.textContent('#error')).includes('غير متطابقين'));
  await tool.fill('#pin2', '864209');
  await tool.click('#make');
  await tool.waitForSelector('#result:not([hidden])', { timeout: 10000 });
  const made = JSON.parse(await tool.inputValue('#out'));
  const expected = crypto.pbkdf2Sync('864209', Buffer.from(made.salt, 'hex'), made.iterations, 32, 'sha256').toString('hex');
  check('صفحة التغيير: الصورة المولّدة صحيحة ولا تحوي الرقم', made.hash === expected && !JSON.stringify(made).includes('864209'));
  await tool.screenshot({ path: `${shots}/pin-tool.png`, fullPage: true });
  await usePin(context, made);
  await page.reload();
  await unlock(page, '864209');
  check('الملف المولّد يفتح اللعبة بالرقم الجديد', await page.isVisible('#open'));

  for (const p of [page, tool]) {
    check('لا أرقام هندية ولا ميل', !/[٠-٩۰-۹]/.test(await p.textContent('body')) &&
      await p.$$eval('*', els => els.every(e => getComputedStyle(e).fontStyle === 'normal')));
  }
  check('لا أخطاء في الصفحات', errors.length === 0);
  await browser.close();
  process.exit(finish(errors) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
