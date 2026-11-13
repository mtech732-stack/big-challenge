// حارسان لما يخص التطبيق وحده (design/app.md 8.3)، ألا يقع في الموقع. كلاهما نجا من طفرة قبله (المدقّق، 106):
// 1) رفع شاشة البداية فوق لوحة المفاتيح و«تم» في الخانة الثانية (audience.html، NATIVE_APP). في الموقع: visualViewport يضيق
//    والخانة مركّزة فلا تتحرك .screen، وEnter في الخانة الثانية يبدأ القرعة (draw) لا يُزيل التركيز.
// 2) تجميد fitStage ما دامت الكتابة (index.html، NATIVE). في الموقع: النافذة تصغر والخانة مركّزة فيُعاد الحساب (--scale يتغيّر).
// الطفرة (NATIVE_APP = true، أو حذف «NATIVE &&») تُخفق كلاً منهما.
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  const { check, finish } = reporter();
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const H = 1080;

  const context = await browser.newContext({ viewport: { width: 1920, height: H } });
  context.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => m.type() === 'error' && !/pin\.json|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  });
  await usePin(context);
  // visualViewport مزيّف في النافذة العليا كما في stage8-app-keyboard: لوحة المفاتيح تفتح فيضيق.
  await context.addInitScript(H => {
    if (window !== window.top) return;
    const vv = new EventTarget();
    Object.assign(vv, { height: H, width: innerWidth, offsetTop: 0, offsetLeft: 0, scale: 1 });
    Object.defineProperty(window, 'visualViewport', { configurable: true, get: () => vv });
    window.__kb = h => { vv.height = h; vv.dispatchEvent(new Event('resize')); vv.dispatchEvent(new Event('scroll')); };
  }, H);
  const page = await context.newPage();
  await page.goto(base);
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await unlock(page);
  const f = await stageFrame(page);
  await wait(1200);
  const step = () => page.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).step);
  const native = await f.evaluate(() => document.documentElement.classList.contains('native-app'));

  // ===== 1: لا رفع للوحة =====
  await f.evaluate(() => {
    window.__writes = [];
    new MutationObserver(() => window.__writes.push(document.querySelector('.screen').getAttribute('style') ?? ''))
      .observe(document.querySelector('.screen'), { attributes: true, attributeFilter: ['style'] });
  });
  await f.click('#i1'); await wait(100);
  await page.evaluate(() => window.__kb(500)); await wait(900);
  await page.keyboard.type('الصقور'); await wait(300);
  await page.keyboard.press('Enter'); await wait(300);
  const at2 = await f.evaluate(() => document.activeElement?.id);
  await page.evaluate(() => window.__kb(480)); await wait(900);
  await page.keyboard.type('النجوم'); await wait(300);
  const lift = await f.evaluate(() => ({ writes: window.__writes.length, t: getComputedStyle(document.querySelector('.screen')).transform }));
  check(`الموقع: الخانتان مركّزتان وvisualViewport يضيق، و.screen لا تتحرك (كتابات ${lift.writes} · ${lift.t})، و«التالي» إلى الثانية (${at2})`,
    !native && lift.writes === 0 && (lift.t === 'none' || lift.t === 'matrix(1, 0, 0, 1, 0, 0)') && at2 === 'i2');

  // ===== 2: لا تجميد لـ fitStage والخانة مركّزة =====
  const scale = () => page.evaluate(() => document.documentElement.style.getPropertyValue('--scale'));
  const s0 = await scale();
  const focused = await f.evaluate(() => document.activeElement?.id);
  await page.setViewportSize({ width: 1280, height: 600 }); await wait(400);
  const s1 = await scale();
  check(`الموقع: النافذة تصغر والخانة الثانية مركّزة (${focused})، فيُعاد حساب المسرح فوراً (--scale ${s0} ← ${s1})`,
    focused === 'i2' && s0 !== s1 && Math.abs(Number(s1) - 600 / 1080) < 1e-6);
  await page.setViewportSize({ width: 1920, height: H }); await wait(400);

  // ===== 1 (تابع): Enter في الثانية يبدأ القرعة لا «تم» =====
  await f.focus('#i2');
  const before = await step();
  await page.keyboard.press('Enter'); await wait(800);
  const after = await step(), still = await f.evaluate(() => document.activeElement?.id ?? '');
  check(`الموقع: Enter في الخانة الثانية يرسل القرعة (${before} ← ${after})، لا «تم» يُزيل التركيز (${still || 'body'})`,
    before === 'setup' && after !== 'setup');

  await browser.close();
  process.exit(finish(errors) && !errors.length ? 0 : 1);
})();
