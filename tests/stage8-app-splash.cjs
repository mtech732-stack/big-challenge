// اختبار آلي لـ ش8-أ/79 (المالك على v93، design/app.md 2.1): عند فتح التطبيق كانت تومض بطاقة سؤال ثم تختفي. وهي بطاقة
// «بانتظار المقدّم» التي ترسمها شاشة الجمهور قبل أن تصلها حالة المباراة. والآن لا يُرى من اللوحة شيء قبل أول رسم بحالة معروفة،
// وشاشة الإطلاق (SplashScreen مزيّف) تُخفى بعده مرة واحدة (والخطوط محمّلة، بعد إطارين)، أو بعد 8 ثوانٍ مهما حدث.
// · مباراة محفوظة عمرها 61 دقيقة: كل إطار رُسم قبل أن تظهر اللوحة فيه ألوان المسرح وحدها، وأول ما يظهر شاشة البداية، ولا شيء من المباراة.
// · hide تُستدعى مرة واحدة، بعد ظهور شاشة البداية والخطوط محمّلة. · وإن تعطّل الكود قبل الرسم: hide بالمهلة (8 ثوانٍ) مرة واحدة.
// · الموقع: لا خطأ، واللوحة تظهر بعد الرقم.
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace } = require('./helpers.cjs');

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [];
  const { check, finish } = reporter();
  const wait = ms => new Promise(r => setTimeout(r, ms));

  async function context(native) {
    const c = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
    c.on('page', p => {
      p.on('pageerror', e => errors.push(e.message));
      p.on('console', m => m.type() === 'error' && !/pin\.json|Failed to load resource|net::ERR_FAILED/.test(m.text()) && errors.push(m.text()));
    });
    await usePin(c);
    await c.addInitScript(native => {
      if (window === window.top) {
        window.__t0 = performance.now(); window.__hides = [];
        if (native) window.Capacitor = { isNativePlatform: () => true, Plugins: { SplashScreen: { hide: o => {
          const fr = document.querySelector('#single iframe')?.contentDocument, cv = fr?.getElementById('canvas');
          window.__hides.push({ t: performance.now() - window.__t0, o, hero: cv && !cv.classList.contains('unready') ? cv.dataset.hero ?? '' : 'مخفية', fonts: fr?.fonts?.status });
        } } } };
        return;
      }
      if (native) window.Capacitor = { isNativePlatform: () => true };
      // في شاشة الجمهور: كل تغيّر في صنف اللوحة أو شاشتها يُسجَّل بما يُرى حينها. يبدأ عند DOMContentLoaded (قبل أي سكربت للصفحة
      // بعدها، والنافذة نفسها تبقى من about:blank الأولى إلى audience.html من الأصل نفسه)، ومعه حال اللوحة كما في HTML.
      window.addEventListener('DOMContentLoaded', () => {
        const cv = document.getElementById('canvas');
        if (!cv) return;
        window.__frames = [];
        const look = () => {
          const vis = getComputedStyle(cv).visibility === 'visible', card = document.getElementById('cardWrap');
          const cardSeen = vis && !!card && getComputedStyle(card).display !== 'none' && getComputedStyle(card).visibility === 'visible';
          const now = { vis, hero: cv.dataset.hero ?? '', card: cardSeen, text: vis ? (document.querySelector('.scr.show')?.dataset.s ?? '') + ':' + (document.getElementById('label')?.textContent ?? '') : '' }, last = window.__frames.at(-1);
          if (!last || last.vis !== now.vis || last.hero !== now.hero || last.card !== now.card || last.text !== now.text) window.__frames.push(now);
        };
        look();
        new MutationObserver(look).observe(document.body, { attributes: true, subtree: true, attributeFilter: ['class', 'data-hero', 'hidden', 'style'] });
      });
    }, native);
    return c;
  }
  const frames = async page => (await stageFrame(page)).evaluate(() => window.__frames);

  // ===== التطبيق: مباراة محفوظة عمرها 61 دقيقة =====
  {
    const c = await context(true);
    const page = await c.newPage();
    await page.goto(base); await page.evaluate(() => localStorage.clear()); await page.reload();
    let f = await stageFrame(page);
    await sharedToFace(f, { names: ['الصقور', 'النجوم'], picks: ['letter', 'auction'] });
    await wait(2700); await cmd(f, 'begin'); await f.waitForSelector('.scr.show[data-s="intro"]'); await cmd(f, 'act:show'); await wait(800);
    await page.evaluate(() => localStorage.setItem('big-challenge.savedAt', String(Date.now() - 61 * 60 * 1000)));
    await page.reload(); await wait(3500);
    const fr = await frames(page), hides = await page.evaluate(() => window.__hides);
    const firstSeen = fr.find(x => x.vis);
    check(`التطبيق، فتح بعد 61 دقيقة: لا يُرى من اللوحة شيء قبل أول رسم، وأول ما يظهر شاشة البداية بلا بطاقة (${fr.map(x => `${x.vis ? 'ظاهرة' : 'مخفية'}/${x.hero || '-'}${x.card ? '/بطاقة' : ''}`).join(' ← ')})`,
      !!firstSeen && firstSeen.hero === 'start' && !fr.some(x => x.vis && (x.card || x.hero !== 'start')));
    check(`وشاشة الإطلاق تُخفى مرة واحدة بعد ظهور البداية والخطوط محمّلة، بتلاشٍ 200 (${hides.map(h => `${Math.round(h.t)}ms/${h.hero}/${h.fonts}`).join('، ')})`,
      hides.length === 1 && hides[0].hero === 'start' && hides[0].fonts === 'loaded' && hides[0].o?.fadeOutDuration === 200 && hides[0].t < 8000);
    await page.waitForTimeout(5200);
    check('ولا تُستدعى ثانية بالمهلة بعد 8 ثوانٍ', (await page.evaluate(() => window.__hides.length)) === 1);
    // وفتح بمباراة جارية (قبل الساعة): أول ما يظهر سؤالها نفسه، لا بطاقة «بانتظار المقدّم».
    f = await stageFrame(page);
    await sharedToFace(f, { names: ['الصقور', 'النجوم'], picks: ['letter', 'auction'] });
    await wait(2700); await cmd(f, 'begin'); await f.waitForSelector('.scr.show[data-s="intro"]'); await cmd(f, 'act:show'); await wait(800);
    const q = await f.$eval('#label', e => e.textContent);
    await page.reload(); await wait(1500);
    const fr2 = await frames(page), seen2 = fr2.find(x => x.vis);
    check(`وفتح بمباراة جارية: أول ما يظهر سؤالها نفسه، لا «بانتظار المقدّم» (${fr2.map(x => x.text.slice(0, 40)).join(' ← ')})`,
      !!seen2 && seen2.text === 'q:' + q && seen2.hero !== 'wait');
    await c.close();
  }
  // ===== التطبيق: الكود يتعطّل قبل الرسم (ملفات js لا تُحمَّل) =====
  {
    const c = await context(true);
    await c.route(/\/js\/.*\.js/, r => r.abort());
    const page = await c.newPage();
    page.removeAllListeners('pageerror'); page.removeAllListeners('console');
    await page.goto(base); await wait(8800);
    const hides = await page.evaluate(() => window.__hides);
    check(`التطبيق، الكود معطّل قبل الرسم: شاشة الإطلاق تُخفى بالمهلة بعد 8 ثوانٍ، مرة واحدة (${hides.map(h => Math.round(h.t) + 'ms').join('، ')})`,
      hides.length === 1 && hides[0].t >= 7900 && hides[0].t < 8800);
    await c.close();
  }
  // ===== الموقع =====
  {
    const c = await context(false);
    const page = await c.newPage();
    await page.goto(base); await page.evaluate(() => localStorage.clear()); await page.reload();
    await unlock(page); await wait(1500);
    const fr = await frames(page), firstSeen = fr.find(x => x.vis);
    check(`الموقع: أول ما يظهر شاشة البداية، ولا بطاقة قبلها (${fr.map(x => `${x.vis ? 'ظاهرة' : 'مخفية'}/${x.hero || '-'}`).join(' ← ')})`,
      !!firstSeen && firstSeen.hero === 'start' && !fr.some(x => x.vis && x.card));
    await page.waitForTimeout(2000);
    await c.close();
  }
  await browser.close();
  finish(errors);
})();
