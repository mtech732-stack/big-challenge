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
      // السطر الأخير يذكر ما أخفق باسمه، فلا يُبحث عنه في الأسطر قبله.
      const failed = results.filter(r => !r[1]).map(r => r[0]);
      console.log(`${results.length - failed.length}/${results.length}${failed.length ? ' · أخفق: ' + failed.join(' | ') : ''}`);
      return ok;
    },
  };
}

// الشاشة المشتركة (الوثيقة 1.1، design/shared.md): شاشة الجمهور في إطار داخل الصفحة، وأزرارها فيها.
async function stageFrame(page) {
  await page.waitForSelector('#single:not([hidden]) iframe', { timeout: 10000 });
  const frame = await (await page.$('#single iframe')).contentFrame();
  // حال المباراة وصلت من المقدّم، لا أول شاشة تظهر (الملاحظة 24): لا «بانتظار المقدّم» ولا «متصلة» وحدها.
  await frame.waitForFunction(() => {
    const c = document.getElementById('canvas'), show = document.querySelector('.scr.show');
    return c && !c.classList.contains('locked') && show && !(show.dataset.s === 'q' && /^نافذة الجمهور ·/.test(document.getElementById('label').textContent));
  }, null, { timeout: 10000 });
  return frame;
}
const cmd = (frame, c) => frame.click(`[data-cmd="${c}"]`, { timeout: 8000 });

// من الإعداد إلى المواجهة بالنقر على الشاشة المشتركة. picks: الأنماط بترتيب اختيارها.
async function sharedToFace(frame, { names, count = 'short', picks }) {
  await frame.fill('#i1', names[0]);
  await frame.fill('#i2', names[1]);
  await cmd(frame, 'count:' + count);
  await cmd(frame, 'draw');
  await cmd(frame, 'toPick');
  for (const id of picks) await cmd(frame, 'pick:' + id);
  await cmd(frame, 'toFace');
  await frame.waitForSelector('.scr.show[data-s="face"]');
}

// «ابدأ المباراة»: تُفتح نافذة المقدّم بالرقم نفسه، وتبقى هذه شاشة الجمهور.
async function beginTwo(context, frame) {
  const [host] = await Promise.all([context.waitForEvent('page'), cmd(frame, 'begin')]);
  await host.waitForSelector('#app:not([hidden])', { timeout: 10000 });
  return host;
}

module.exports = { TEST_PIN, testPinRecord, usePin, unlock, reporter, stageFrame, cmd, sharedToFace, beginTwo };
