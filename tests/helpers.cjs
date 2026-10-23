// أدوات مشتركة للاختبارات الآلية.
const crypto = require('crypto');

// الاختبارات لا تعرف الرقم الحقيقي: تستبدل pin.json بصورة لرقم تجريبي معروف.
const TEST_PIN = '135790';
function testPinRecord(pin = TEST_PIN) {
  const salt = crypto.randomBytes(16).toString('hex');
  const iterations = 300000;
  const hash = crypto.pbkdf2Sync(pin, Buffer.from(salt, 'hex'), iterations, 32, 'sha256').toString('hex');
  return { salt, iterations, hash };
}

async function usePin(context, record = testPinRecord()) {
  await context.unroute('**/pin.json*').catch(() => {});
  await context.route('**/pin.json*', route => route.fulfill({ json: record }));
}

async function unlock(page, pin = TEST_PIN) {
  await page.fill('#pin', pin);
  await page.click('#enter');
  await page.waitForSelector('#app:not([hidden])', { timeout: 10000 });
}

function reporter() {
  const results = [];
  return {
    check: (name, ok) => results.push([name, !!ok]),
    finish(errors = []) {
      let ok = true;
      for (const [k, v] of results) { console.log(`${v ? 'نجح' : 'فشل'} · ${k}`); ok &&= v; }
      if (errors.length) console.log(errors.join('\n'));
      console.log(`${results.filter(r => r[1]).length}/${results.length}`);
      return ok;
    },
  };
}

module.exports = { TEST_PIN, testPinRecord, usePin, unlock, reporter };
