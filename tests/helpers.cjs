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
  // فحص بالزمن لا بإطار الرسم: الصفحة قد لا تكون في المقدّمة فيتوقف requestAnimationFrame ولا يُعاد الفحص.
  }, null, { timeout: 10000, polling: 100 });
  return frame;
}
// أزرار الزاوية في الجولة والنهاية داخل لوحة «⋯» (design/s8b.md 7): إن لم يكن الزر ظاهراً وكان «⋯» مغلقاً فُتح أولاً.
async function cmd(frame, c) {
  const sel = `[data-cmd="${c}"]`;
  if (!(await frame.$(sel)) && await frame.$('[data-cmd="more"]:not(.open)')) await frame.click('[data-cmd="more"]');
  return frame.click(sel, { timeout: 8000 });
}

// من الإعداد إلى المواجهة بالنقر على الشاشة المشتركة. picks: الأنماط بترتيب اختيارها.
async function sharedToFace(frame, { names, count = 'short', picks }) {
  await frame.fill('#i1', names[0]);
  await frame.fill('#i2', names[1]);
  await cmd(frame, 'count:' + count);
  await cmd(frame, 'draw');   // «اختيار الأنماط»
  await frame.waitForSelector('[data-hero="pick"] #pickCtl [data-cmd="draw"]', { timeout: 8000 });
  await cmd(frame, 'draw');   // «قرعة البداية» في صفحة الاختيار (1.11)، والبطاقات تُنقر بعد حركتها
  for (const id of picks) await cmd(frame, 'pick:' + id);
  await cmd(frame, 'toFace');
  await frame.waitForSelector('.scr.show[data-s="face"]');
}

// «ابدأ بنافذتين» من زر الخيارات (design/s8.md 1): تُفتح نافذة المقدّم بالرقم نفسه، وتبقى هذه شاشة الجمهور.
async function beginTwo(context, frame) {
  await cmd(frame, 'opts');
  const [host] = await Promise.all([context.waitForEvent('page'), cmd(frame, 'two')]);
  await host.waitForSelector('#app:not([hidden])', { timeout: 10000 });
  return host;
}

// شريط البونص بين الجولتين (ش6، في الرابطين): يُلعب كاملاً بلا نقاط، فلا يغيّر ما بعده.
// خانة الوقوف تحدٍّ في الدورتين (Math.random لحظة الإعداد وحدها ثم يعود)، و«لم ينجح» في كلٍّ، ثم «إنهاء الشريط».
// page: الصفحة التي تدير المباراة (نافذة المقدّم، أو الصفحة الأم بنافذة واحدة). وبعدها نهاية الشريط و«ابدأ الجولة …».
const wait = ms => new Promise(r => setTimeout(r, ms));
async function fixedSpin(page, start) {
  await page.evaluate(() => { window.__rnd = Math.random; Math.random = () => 0.05; });
  await start();
  await wait(800);
  await page.evaluate(() => { Math.random = window.__rnd; });
}
// باركود الإجابات يظهر وحده عند بدء سؤال المزاد والترتيب (الوثيقة 1.7)، فيُخفى بزره في النافذة الواحدة إن كان ظاهراً.
async function hideQr(frame) {
  if (!(await frame.$('[data-cmd="qr:hide"]'))) return false;
  await cmd(frame, 'qr:hide');
  await new Promise(r => setTimeout(r, 800));
  return true;
}
async function passWheel(presenter) {
  await fixedSpin(presenter, () => presenter.click('#endNext'));
  for (const last of [false, true]) {
    await presenter.click('#wCtl [data-act="spin"]');
    await presenter.click('#wCtl [data-act="failed"]', { timeout: 12000 });
    await wait(600);
    await presenter.click(`#wCtl [data-act="${last ? 'finish' : 'next'}"]`);
    await wait(800);
  }
}
async function passWheelOne(stage, frame) {
  const go = async c => { await cmd(frame, c); await wait(800); };
  await fixedSpin(stage, () => cmd(frame, 'next'));
  for (const last of [false, true]) {
    await go('act:spin');
    await frame.waitForSelector('#near [data-cmd="act:failed"]', { timeout: 12000 });
    await go('act:failed'); await go(last ? 'act:finish' : 'act:next');
  }
}

module.exports = { TEST_PIN, testPinRecord, usePin, unlock, reporter, stageFrame, cmd, sharedToFace, beginTwo, passWheel, passWheelOne, hideQr };
