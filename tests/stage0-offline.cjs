// اختبار آلي للعمل دون إنترنت عند إعادة الفتح.
// يشغّل خادمه بنفسه، و«انقطاع الإنترنت» إيقاف الخادم حقاً: قطع Playwright (setOffline) لا يقطع عامل الحفظ،
// فلا يثبت شيئاً. والخادم يمنع نسخة المتصفح المؤقتة العادية، فلا يُخدم إلا ما حفظه عامل الحفظ.
const { chromium } = require('playwright');
const fs = require('fs');
const http = require('http');
const path = require('path');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace } = require('./helpers.cjs');

const root = path.join(__dirname, '..');
const types = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.woff2': 'font/woff2', '.txt': 'text/plain' };

// كل ملف تطلبه الصفحات: ما تستورده وما تربطه، وما تستورده ملفات الكود، وخطوط التنسيق.
function referenced() {
  const seen = new Set(), queue = ['index.html', 'audience.html', 'tools/pin.html'];
  while (queue.length) {
    const file = queue.shift();
    if (seen.has(file)) continue;
    seen.add(file);
    const text = fs.readFileSync(path.join(root, file), 'utf8');
    const refs = [...text.matchAll(/(?:import\s*\(?\s*|from\s+|href=|src=|url\()\s*['"]?([^'")\s]+\.(?:js|css|woff2|html))['"]?/g)].map(m => m[1]);
    for (const ref of refs) {
      if (/^(https?:|data:)/.test(ref)) continue;
      const rel = path.posix.normalize(path.posix.join(path.posix.dirname(file), ref));
      if (fs.existsSync(path.join(root, rel))) queue.push(rel);
    }
  }
  return [...seen];
}

(async () => {
  let down = false;
  const server = http.createServer((req, res) => {
    if (down) return req.socket.destroy();
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p.endsWith('/')) p += 'index.html';
    const file = path.join(root, p);
    if (!file.startsWith(root) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); return res.end(); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(fs.readFileSync(file));
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/`;
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { check, finish } = reporter();
  const errors = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await usePin(context);
  context.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => m.type() === 'error' && !/ERR_|Failed to load resource|pin\.json/.test(m.text()) && errors.push(m.text()));
  });

  // كل ملف تطلبه الصفحات في قائمة المحفوظ، فلا يُنسى ملف جديد.
  const CACHE = fs.readFileSync(path.join(root, 'sw.js'), 'utf8').match(/const CACHE = '([^']+)'/)[1];
  const appFiles = [...fs.readFileSync(path.join(root, 'sw.js'), 'utf8').match(/APP_FILES = \[([^\]]*)\]/)[1].matchAll(/'([^']+)'/g)].map(m => m[1]);
  const missing = referenced().filter(f => !appFiles.includes(f));
  check(`كل ملف تطلبه الصفحات في قائمة المحفوظ${missing.length ? ': ينقص ' + missing.join('، ') : ''}`, !missing.length);

  // أول فتح بإنترنت، مرة واحدة دون إعادة تحميل: إدخال الرقم فقط ثم الإغلاق.
  const first = await context.newPage();
  await first.goto(base);
  await first.evaluate(() => navigator.serviceWorker.ready);
  const cached = await first.evaluate(async CACHE => (await (await caches.open(CACHE)).keys()).map(r => new URL(r.url).pathname), CACHE);
  const notCached = appFiles.filter(f => !cached.includes('/' + (f === './' ? '' : f)));
  check(`بعد فتح واحد: كل الملفات محفوظة (${cached.length})${notCached.length ? ': ينقص ' + notCached.join('، ') : ''}`, !notCached.length);
  await unlock(first);
  await first.close();

  // انقطع الإنترنت حقاً: الخادم لا يجيب.
  down = true;
  await context.unroute('**/pin.json*');
  const page = await context.newPage();
  await page.goto(base);
  check('بلا إنترنت: الخادم لا يجيب حقاً (ملف غير محفوظ يفشل)', await page.evaluate(() => fetch('README.md').then(() => false, () => true)));
  check('بلا إنترنت: تُفتح الصفحة من جديد وتطلب الرقم', await page.isVisible('#pin'));
  check('بلا إنترنت: الخط المرفق محمّل', await page.evaluate(async () => { await document.fonts.ready; return document.fonts.check('700 32px Kufi'); }));
  await unlock(page).catch(() => {});
  check('بلا إنترنت: يُقبل الرقم بآخر صورة محفوظة وتُفتح اللعبة', await page.isVisible('#single'));
  check('بلا إنترنت: ملف الحزمة يُقرأ (حُفظ من أول فتح)', await page.evaluate(async () => (await (await fetch('content/packs/general/pack.json')).json()).name === 'الحزمة الثقافية العامة'));

  // شاشة الجمهور في الصفحة بلا إنترنت، وعدّادها يعمل ويصل انتهاؤه إلى الصفحة (التمهيد 5 ثوانٍ في «الحرف المعيّن»).
  let aud = await stageFrame(page);
  check('بلا إنترنت: شاشة الجمهور تظهر وتتصل', await aud.isVisible('.team.t1'));
  await sharedToFace(aud, { names: ['الصقور', 'النجوم'], picks: ['letter', 'last-two'] });
  await wait(2700);
  await cmd(aud, 'begin');
  await aud.waitForSelector('.scr.show[data-s="intro"]', { timeout: 6000 });
  await cmd(aud, 'act:show');
  await wait(2200);
  check('بلا إنترنت: العدّاد يعمل', ['0:03', '0:02'].includes(await aud.textContent('#timer')));
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.state.phase === 'ask', null, { timeout: 6000 }).catch(() => {});
  check('بلا إنترنت: انتهاء التمهيد يصل إلى الصفحة', (await page.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.state.phase)) === 'ask');
  await page.screenshot({ path: `${shots}/offline-audience.png` });

  // إعادة تحميل شاشة الجمهور نفسها بلا إنترنت (الإطار وحده).
  await aud.evaluate(() => location.reload());
  await wait(300);
  aud = await stageFrame(page);
  check('بلا إنترنت: إعادة تحميل شاشة الجمهور تعيدها متصلة', await aud.isVisible('.team.t1') && /السؤال 1 من 6/.test(await aud.textContent('#b1')));
  check('بلا إنترنت: رابط الفحص ?check يُخدم من النسخة المحفوظة', await (async () => {
    const p = await context.newPage();
    await p.goto(base + 'audience.html?check');
    const ok = await p.waitForFunction(() => window.__check, null, { timeout: 8000 }).then(() => p.evaluate(() => window.__check.ok)).catch(() => false);
    await p.close();
    return ok;
  })());
  check('بلا إنترنت: صفحة تغيير الرقم تُفتح', await (async () => {
    const p = await context.newPage();
    await p.goto(base + 'tools/pin.html');
    const ok = await p.evaluate(async () => { await document.fonts.ready; return document.fonts.check('700 32px Kufi'); });
    await p.close();
    return ok;
  })());

  // الرقم السري لا يُخدم من النسخة المحفوظة: التحقق المستمر يعرف أن الإنترنت منقطع، فلا يُغلق اللعبة.
  const pinCached = await page.evaluate(async CACHE => (await (await caches.open(CACHE)).keys()).some(r => r.url.includes('pin.json')), CACHE);
  check('ملف الرقم السري لا يُحفظ في نسخة المتصفح', !pinCached);
  check('بلا إنترنت: التحقق المستمر يقول «offline» ولا يُغلق', (await page.evaluate(() => window.verifyPinNow())) === 'offline' && await page.isVisible('#single'));

  // بإنترنت: الشبكة أولاً، فيصل كل تحديث منشور فوراً لا النسخة المحفوظة.
  down = false;
  const probe = path.join(__dirname, '_fresh.txt');
  const read = () => page.evaluate(async () => (await fetch('tests/_fresh.txt')).text());
  try {
    fs.writeFileSync(probe, 'old');
    check('بإنترنت: يُقرأ الملف', (await read()) === 'old');
    fs.writeFileSync(probe, 'new');
    check('بإنترنت: يصل التحديث فوراً لا النسخة المحفوظة', (await read()) === 'new');
    down = true;
    check('بلا إنترنت: تُخدم آخر نسخة وصلت', (await read()) === 'new');
  } finally {
    fs.rmSync(probe, { force: true });
  }

  check('لا أخطاء في الصفحات', errors.length === 0);
  await browser.close();
  server.close();
  process.exit(finish(errors) ? 0 : 1);
})().catch(e => { console.error(e); process.exit(1); });
