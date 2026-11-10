// اختبار آلي لـ ش8-أ/86 (المالك على آيفون 15 Pro، v97): «وميض بعد انتهاء القرعة مباشرة».
// عند وقوف مؤشر القرعة كانت بطاقات الأنماط تُبنى من جديد (wait ← avail)، فتُنشأ صور شاراتها من جديد، وWebKit يرسم الصورة
// الجديدة فارغة حتى يفكّها. وChromium لا يُظهر ذلك، فيُفحص سببه: يُعلَّم كل عنصر بطاقة وصورة قبل القرعة، ثم يُقرأ في كل إطار
// من ضغط «قرعة البداية» حتى تظهر الأزرار، ثم بعد اختيار نمط:
// · البطاقات وصورها هي العناصر نفسها في كل إطار (لا يُنشأ شيء)، وأربع بطاقات دائماً، وصورها مفكوكة (complete).
// · وبعد القرعة البطاقات متاحة (avail) والزر «اختر» عليها.
// · واختيار نمط يبني بطاقته من جديد (فيها ختم وسطر من اختار) لكن بصورة شارتها نفسها، والبطاقات الأخرى كما هي.
const { chromium } = require('playwright');
const { usePin, reporter, stageFrame } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  const { check, finish } = reporter();
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const context = await browser.newContext({ viewport: { width: 852, height: 393 }, hasTouch: true });
  context.on('page', p => {
    p.on('pageerror', e => errors.push(e.message));
    p.on('console', m => m.type() === 'error' && !/pin\.json|Failed to load resource/.test(m.text()) && errors.push(m.text()));
  });
  await usePin(context);
  await context.addInitScript(() => { window.Capacitor = { isNativePlatform: () => true }; });
  const page = await context.newPage();
  await page.goto(base); await page.evaluate(() => localStorage.clear()); await page.reload();
  const f = await stageFrame(page); await wait(1500);
  await f.fill('#i1', 'Eagles'); await f.fill('#i2', 'Stars'); await wait(300);
  await f.tap('[data-cmd="draw"]'); await wait(1500);
  // العلامات، ثم قراءة كل إطار 4.5 ثوانٍ.
  await f.evaluate(() => {
    document.querySelectorAll('#mcards .mc').forEach(el => { el.__orig = el.dataset.mode; el.querySelector('.bdg img').__orig = el.dataset.mode; });
    window.__run = ms => { window.__log = []; const t0 = performance.now();
      const tick = () => { const cards = [...document.querySelectorAll('#mcards .mc')];
        window.__log.push({ t: Math.round(performance.now() - t0), n: cards.length,
          fresh: cards.filter(el => el.__orig !== el.dataset.mode).map(el => el.dataset.mode),
          freshImg: cards.filter(el => el.querySelector('.bdg img').__orig !== el.dataset.mode).map(el => el.dataset.mode),
          blank: cards.filter(el => !el.querySelector('.bdg img').complete).length, state: cards.map(el => el.classList.contains('avail') ? 'a' : el.classList.contains('wait') ? 'w' : '-').join('') });
        if (performance.now() - t0 < ms) requestAnimationFrame(tick); };
      tick(); };
  });
  await f.evaluate(() => __run(4500));
  await f.tap('[data-cmd="draw"]'); await wait(4700);
  const log = await f.evaluate(() => window.__log), last = log[log.length - 1];
  const bad = log.filter(x => x.n !== 4 || x.fresh.length || x.freshImg.length || x.blank);
  check(`القرعة حتى وقوفها وبعده: البطاقات الأربع وصورها هي نفسها في كل إطار، ولا صورة غير مفكوكة (${log.length} إطاراً، ${bad.length} فيها جديد${bad.length ? ': ' + JSON.stringify(bad[0]) : ''})`, log.length > 60 && bad.length === 0);
  check(`ومرّت البطاقات بالانتظار في القرعة ثم صارت متاحة بعدها (${[...new Set(log.map(x => x.state))].join(' ← ')})`, log.some(x => x.state === 'wwww') && last.state === 'aaaa');
  check('وعلى كل بطاقة زر «اختر» بعد القرعة', await f.evaluate(() => [...document.querySelectorAll('#mcards .mc')].every(el => el.dataset.cmd?.startsWith('pick:') && /اختر/.test(el.querySelector('.key').textContent))));
  // اختيار نمط: بطاقته تُبنى من جديد بختمها، وصورة شارتها هي نفسها، والأخرى كما هي.
  const mode = await f.evaluate(() => document.querySelector('#mcards .mc[data-cmd]').dataset.mode);
  await f.tap(`#mcards .mc[data-mode="${mode}"]`); await wait(800);
  const after = await f.evaluate(mode => [...document.querySelectorAll('#mcards .mc')].map(el => ({ mode: el.dataset.mode, same: el.__orig === el.dataset.mode, img: el.querySelector('.bdg img').__orig === el.dataset.mode, stamp: !!el.querySelector('.stamp'), picked: el.classList.contains('picked') })), mode);
  const mine = after.find(x => x.mode === mode), others = after.filter(x => x.mode !== mode);
  check(`اختيار «${mode}»: بطاقته مختارة بختمها، وصورة شارتها هي نفسها (${JSON.stringify(mine)})`, !!mine && mine.picked && mine.stamp && mine.img);
  check(`والبطاقات الأخرى هي نفسها بصورها (${others.map(x => x.mode + ':' + x.same + '/' + x.img).join('، ')})`, others.length === 3 && others.every(x => x.same && x.img));
  await page.screenshot({ path: `${process.argv[3] || require('os').tmpdir()}/app-draw-picked.png` });
  // واسم حركة البطاقة المتاحة كان pulse كنبض حواف الوقت (stage.css)، وhero.css بعده فكان يحلّ محلّه: الحواف الحمراء في آخر الوقت
  // (design/system.md، «حواف الشاشة كلها حمراء … ينبضان») لا تنبض. الآن لكلٍّ اسمه.
  const kf = await f.evaluate(() => { document.getElementById('canvas').classList.add('meta-danger');
    const a = document.querySelector('.danger').getAnimations()[0], k = a?.effect?.getKeyframes() ?? [];
    document.getElementById('canvas').classList.remove('meta-danger'); return { name: a?.animationName, shadow: k.some(x => /230, 57, 70/.test(x.boxShadow ?? '')) }; });
  check(`حواف الوقت الحمراء تنبض بحركتها (${kf.name}، ظل أحمر: ${kf.shadow})`, kf.name === 'pulse' && kf.shadow);
  const card = await f.evaluate(() => getComputedStyle(document.querySelector('#mcards .mc.avail') ?? document.body, '::before').animationName);
  check(`ونبض البطاقة المتاحة باسمه (${card})`, card === 'cardpulse');
  await browser.close();
  finish(errors);
})();
