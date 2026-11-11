// اختبار آلي: المساعد الصوتي في مزاد تطبيق آبل (الوثيقة 5.5.1، design/app.md 7). إضافة «Voice» مزيفة تحاكي الغلاف:
// status وinstall (بحدث progress) وrequestAccess وstart وstop، وحدث partial بالنص المسموع.
// أيقونة «المساعد الصوتي» في «⋯» وحالاتها (تنزيل بنسبته، مُشغَّل، موقوف) · السماع يبدأ مع الوفاء ويقف بالكشف ·
// ما يطابق يضيء بالأصفر ثم بلون الملتزم ويُعدّ، ولا يتكرر · النص المسموع وعلامات كلماته · الحذف بنقرتين · تحديد الكلمات و«اعتمد» (من القائمة ومن خارجها)
// · «تراجع» بالترتيب، وما حُذف لا يضيء ثانية · بعد الكشف ما قيل مُبرز في القائمة · والموقع بلا شيء من هذا · وفحص التداخل.
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace, hideQr } = require('./helpers.cjs');

const { check: _c, finish: _f } = { check: null, finish: null };
(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const { check, finish } = reporter();
  const errors = [];
  const wait = ms => new Promise(r => setTimeout(r, ms));
  const real = JSON.parse(fs.readFileSync(path.join(__dirname, '../content/packs/general/auction.json'), 'utf8'));
  const TOPIC = { id: 'test-voice', topic: 'وسائل النقل والمواصلات', items: ['سيارة', 'حافلة', 'قطار', 'دراجة نارية', 'طائرة', 'سفينة', 'شاحنة', 'مترو', 'ترام', 'قارب', 'دراجة هوائية', 'غواصة']
    .map(name => ({ name, alts: name === 'حافلة' ? ['باص'] : name === 'دراجة نارية' ? ['موتوسيكل'] : [] })) };
  const bank = { mode: 'auction', topics: [TOPIC, ...real.topics] };

  async function open(native, { installed = false } = {}) {
    const context = await browser.newContext({ viewport: native ? { width: 956, height: 440 } : { width: 1920, height: 1080 }, serviceWorkers: 'block' });
    context.on('page', p => {
      p.on('pageerror', e => errors.push(e.message)); p.on('console', m => /VOX/.test(m.text()) && console.log(m.text()));
      p.on('console', m => m.type() === 'error' && !/pin\.json|Failed to load resource/.test(m.text()) && errors.push(m.text()));
    });
    await usePin(context);
    await context.route('**/content/packs/general/auction.json', route => route.fulfill({ json: bank }));
    if (native) await context.addInitScript(installed => {
      const on = {};
      const v = window.__voice = { installed, mic: 'prompt', calls: [], live: false };
      v.emit = (ev, d) => (on[ev] ?? []).forEach(cb => cb(d));
      window.Capacitor = {
        isNativePlatform: () => true, Plugins: {},
        addListener: (p, ev, cb) => { if (p === 'Voice') (on[ev] ??= []).push(cb); return { remove() {} }; },
        nativePromise: async (p, m, o) => {
          if (p !== 'Voice') throw new Error('no plugin');
          v.calls.push(m);
          if (m === 'status') return { available: true, installed: v.installed, mic: v.mic };
          if (m === 'install') { for (const pct of [10, 40, 80]) { v.emit('progress', { pct }); await new Promise(r => setTimeout(r, 300)); } v.installed = true; return {}; }
          if (m === 'requestAccess') { v.mic = 'granted'; return { mic: 'granted' }; }
          if (m === 'start') { v.live = true; v.hints = o.hints; v.id = o.id; (v.ids ??= []).push(o.id); return {}; }
          if (m === 'stop') { v.live = false; return {}; }
          return {};
        },
      };
    }, installed);
    const page = await context.newPage();
    await page.goto(base);
    await page.evaluate(ids => { localStorage.clear(); localStorage.setItem('big-challenge.seen', JSON.stringify(ids)); }, real.topics.map(t => t.id));
    await page.reload();
    if (!native) await unlock(page);
    const f = await stageFrame(page);
    await sharedToFace(f, { names: ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'], picks: ['auction', 'letter'] });
    await wait(2700);
    await cmd(f, 'begin'); await f.waitForSelector('.scr.show[data-s="intro"]');
    await cmd(f, 'act:show'); await f.waitForSelector('.scr.show[data-s="auc"]'); await wait(800);
    await hideQr(f);
    const st = () => page.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')).round.state);
    return { context, page, f, st };
  }
  const go = async (f, c) => { await cmd(f, c); await wait(800); };
  // النص المسموع من الجلسة الجارية (برقمها، كالغلاف بعد 88b204e).
  const heard = (page, text) => page.evaluate(t => window.__voice.emit('partial', { id: window.__voice.id, text: t }), text);
  const chips = f => f.$$eval('#voxLit .chip', els => els.map(e => e.textContent));
  const tally = f => f.$eval('#tn', e => Number(e.textContent));
  const words = f => f.$$eval('#voxWords span', els => els.map(e => `${e.textContent}${e.className ? '.' + e.className : ''}`).join(' '));
  const closeMore = async f => { if (await f.$('[data-cmd="more"].open')) { await f.click('[data-cmd="more"]'); await wait(200); } };

  try {
    const { context, page, f, st } = await open(true);
    await go(f, 'raise:1');
    // الأيقونة في «⋯» موقوفة، ثم التنزيل بنسبته، ثم مُشغَّلة بعد الإذن.
    await f.click('[data-cmd="more"]'); await wait(300);
    const off = await f.$eval('[data-cmd="vox:toggle"]', b => ({ cls: b.className, tip: b.dataset.tip, slash: b.innerHTML.includes('M5 5l26 26') }));
    check(`أيقونة «المساعد الصوتي» في «⋯» موقوفة بخط مائل (${off.cls})`, off.cls.includes('vox-off') && off.tip === 'المساعد الصوتي' && off.slash);
    await f.click('[data-cmd="vox:toggle"]'); await wait(450);
    await f.click('[data-cmd="more"]').catch(() => {}); await wait(200);
    const dl = await f.$eval('[data-cmd="vox:toggle"]', b => ({ cls: b.className, tip: b.dataset.tip, pct: b.style.getPropertyValue('--pct') })).catch(() => null);
    check(`أثناء التنزيل: يمتلئ بنسبته والتلميح «يُنزَّل المساعد الصوتي · N%» (${JSON.stringify(dl)})`, dl && dl.cls.includes('vox-dl') && /^يُنزَّل المساعد الصوتي · \d+%$/.test(dl.tip) && /\d+%/.test(dl.pct));
    await wait(1200);
    const on = await f.$eval('[data-cmd="vox:toggle"]', b => ({ cls: b.className, bg: getComputedStyle(b).backgroundColor })).catch(() => null);
    check(`بعد التنزيل والإذن: مُشغَّل بخلفية بيضاء (${JSON.stringify(on)})`, on?.cls.includes('vox-on') && on.bg === 'rgb(255, 255, 255)'
      && JSON.stringify(await page.evaluate(() => window.__voice.calls.filter(c => c !== 'status'))) === '["install","requestAccess"]');
    await closeMore(f);
    check('قبل «ابدأ» لا سماع ولا صفوف', !(await page.evaluate(() => window.__voice.live)) && !(await f.$eval('#auc', e => e.classList.contains('vox'))));
    await go(f, 'act:start');
    check('مع «ابدأ» يبدأ السماع بتلميحات القائمة، وتظهر الصفوف الثلاثة', await page.evaluate(() => window.__voice.live && window.__voice.hints.includes('باص'))
      && await f.$eval('#auc', e => e.classList.contains('vox')) && await f.$eval('#voxMic', e => e.classList.contains('live')));
    // ملاحظة المعاين 94: الكلمة الأخيرة في النص المتغيّر قد تكون نصف كلمة، فلا يضيء ما فيها حتى تأتي بعدها كلمة.
    await heard(page, 'سيارة باص');
    await wait(150);
    check(`الكلمة الأخيرة تنتظر ما بعدها: «باص» لا تضيء بعد (${await chips(f)})`, JSON.stringify(await chips(f)) === '["سيارة"]');
    await heard(page, 'سيارة باص يعني غواص');
    await wait(150);
    check(`ونصف الكلمة «غواص» في آخر النص لا تُضيء «غواصة» (${await chips(f)})`, JSON.stringify(await chips(f)) === '["سيارة","حافلة"]');
    const first = await f.$$eval('#voxLit .chip', els => els.map(e => [e.textContent, e.className, getComputedStyle(e.querySelector('i')).backgroundColor]));
    check(`ما يطابق يضيء بالأصفر لحظته (${JSON.stringify(first)})`, first.length === 2 && first[0][0] === 'سيارة' && first[1][0] === 'حافلة' && first[1][1].includes('new'));
    await wait(700);
    const after = await f.$$eval('#voxLit .chip', els => els.map(e => [e.className, getComputedStyle(e.querySelector('i')).backgroundColor]));
    check(`ثم يأخذ لون الملتزم، والعدّ 2 (${JSON.stringify(after)})`, after.every(c => !c[0].includes('new') && c[1] !== first[1][2]) && await tally(f) === 2);
    await heard(page, 'سيارة باص شنو بعد قطار كرسي متحرك زلاجة الثلج موتوسيكل يعني');
    await wait(400);
    check(`النص المسموع يكمل، وكل عنصر مرة واحدة (${await chips(f)})`, JSON.stringify(await chips(f)) === '["سيارة","حافلة","قطار","دراجة نارية"]' && await tally(f) === 4);
    check(`وكلمات ما طابق مُعلَّمة والباقي باهت (${await words(f)})`, await words(f) === 'سيارة.hit باص.hit شنو بعد قطار.hit كرسي متحرك زلاجة الثلج موتوسيكل.hit يعني');
    await go(f, 'act:count');
    check('«عُدّ · +1» يزيد العدّ معها', await tally(f) === 5);
    // تحديد الكلمات و«اعتمد»: من خارج القائمة شارة بخط متقطع.
    check('لا «اعتمد» بلا تحديد', !(await f.$('[data-cmd="vox:ok"]')));
    await f.click('#voxWords [data-cmd="vox:w:5"]'); await wait(150);
    await f.click('#voxWords [data-cmd="vox:w:6"]'); await wait(300);
    const okBtn = await f.$eval('[data-cmd="vox:ok"]', b => { const c = document.getElementById('canvas').getBoundingClientRect(), k = c.width / 1920, r = b.getBoundingClientRect(); return { x: Math.round((r.left - c.left) / k), w: Math.round(r.width / k), y: Math.round((r.top - c.top) / k), h: Math.round(r.height / k) }; }).catch(() => null);
    const rv = await f.$eval('[data-cmd="act:reveal"]', b => { const c = document.getElementById('canvas').getBoundingClientRect(), k = c.width / 1920, r = b.getBoundingClientRect(); return { x: Math.round((r.left - c.left) / k) }; });
    check(`مع التحديد يظهر «اعتمد» يسار «كشف القائمة» (${JSON.stringify(okBtn)}، الكشف ${rv.x})`, okBtn && okBtn.x + okBtn.w <= rv.x + 1 && okBtn.y >= 900);
    check('والكلمتان محددتان', (await words(f)).includes('كرسي.sel متحرك.sel'));
    await page.screenshot({ path: `${shots}/app-voice-select.png` });
    let sc = await f.evaluate(() => window.__stageCheck());
    check(`فحص التداخل والشبكة مع التحديد و«اعتمد» (${sc.ok ? '' : sc.problems.join('، ')})`, sc.ok);
    // ش8-أ/97 (تجربة المالك: لم يمكنه التصحيح): نقرة يصل بين نزول إصبعها ورفعه نصٌّ جديد تبقى نقرة على الكلمة نفسها.
    {
      const box = await f.$eval('#voxWords [data-cmd="vox:w:2"]', e => { const r = e.getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
      const fr = await (await page.$('#single iframe')).boundingBox(), k = await page.evaluate(() => { const i = document.querySelector('#single iframe'); return i.getBoundingClientRect().width / i.clientWidth; });
      await page.mouse.move(fr.x + box.x * k, fr.y + box.y * k);
      await page.mouse.down();
      await heard(page, 'سيارة باص شنو بعد قطار كرسي متحرك زلاجة الثلج موتوسيكل يعني');
      await wait(400);
      await page.mouse.up();
      await wait(300);
      check(`نقرة على كلمة يصل أثناءها نص جديد تحددها (${await words(f)})`, (await words(f)).includes('شنو.sel'));
      await f.click('#voxWords [data-cmd="vox:w:2"]'); await wait(300);
    }
    await go(f, 'vox:ok');
    check(`«اعتمد» من خارج القائمة: شارة بخط متقطع، والعدّ 6 (${await chips(f)})`, (await chips(f)).at(-1) === 'كرسي متحرك' && await f.$eval('#voxLit .chip:last-child', e => e.classList.contains('own')) && await tally(f) === 6
      && (await words(f)).includes('كرسي.used متحرك.used') && !(await f.$('[data-cmd="vox:ok"]')));
    // تحديد كلمة من القائمة لم تُطابق آلياً («قطارة» مثلاً): تضيء عنصرها.
    await heard(page, 'سيارة باص شنو بعد قطار كرسي متحرك زلاجة الثلج موتوسيكل يعني والطائره بعد');
    await wait(400);
    check(`«والطائره» تطابق «طائرة» (${await chips(f)})`, (await chips(f)).includes('طائرة') && await tally(f) === 7);
    // الحذف بنقرتين.
    await f.click('#voxLit .chip:nth-child(3)'); await wait(250);
    check('النقرة الأولى تحدد الشارة بإطار ولا تحذف', await f.$eval('#voxLit .chip:nth-child(3)', e => e.classList.contains('armed')) && await tally(f) === 7);
    await page.screenshot({ path: `${shots}/app-voice-armed.png` });
    sc = await f.evaluate(() => window.__stageCheck());
    check(`فحص التداخل والشبكة والشارة محددة (${sc.ok ? '' : sc.problems.join('، ')})`, sc.ok);
    await f.click('#voxLit .chip:nth-child(3)'); await wait(800);
    check(`والثانية تحذفها وينقص العدّ، وتعود كلمتها باهتة (${await chips(f)})`, !(await chips(f)).includes('قطار') && await tally(f) === 6 && (await words(f)).includes(' قطار '));
    await heard(page, 'سيارة باص شنو بعد قطار كرسي متحرك زلاجة الثلج موتوسيكل يعني والطائره بعد قطار يعني');
    await wait(400);
    check('وما حُذف لا يضيء ثانية آلياً', !(await chips(f)).includes('قطار'));
    // «تراجع» بالترتيب: يرجع الحذف، ثم آخر ما أضاء.
    await go(f, 'undo');
    check(`«تراجع» يرجع الحذف (${await chips(f)})`, (await chips(f)).includes('قطار') && await tally(f) === 7);
    await go(f, 'undo');
    check(`ثم آخر ما أضاء (${await chips(f)})`, !(await chips(f)).includes('طائرة') && await tally(f) === 6);
    await page.screenshot({ path: `${shots}/app-voice-listening.png` });
    sc = await f.evaluate(() => window.__stageCheck());
    check(`فحص التداخل والشبكة أثناء السماع (${sc.ok ? '' : sc.problems.join('، ')})`, sc.ok);
    // الكشف يوقف السماع، وما قيل مُبرز في القائمة. وآخر ما قيل في آخر النص (ينتظر ما بعده، 94) يُحسم قبل الكشف (ملاحظة المدقّق 96).
    await heard(page, 'سيارة باص شنو بعد قطار كرسي متحرك زلاجة الثلج موتوسيكل يعني والطائره بعد قطار يعني شاحنة');
    await wait(400);
    check(`قبل الكشف: «شاحنة» في آخر النص تنتظر (${await chips(f)})`, !(await chips(f)).includes('شاحنة'));
    const before = await tally(f);
    await go(f, 'act:reveal');
    const said = await f.$$eval('#cxList .cx-it.said', els => els.map(e => e.textContent + (e.classList.contains('own') ? '*' : '')));
    check(`«كشف القائمة» يوقف السماع (${await page.evaluate(() => window.__voice.calls.join())})`, !(await page.evaluate(() => window.__voice.live)) && !(await f.$eval('#auc', e => e.classList.contains('vox'))));
    check(`وما قيل مُبرز في القائمة، وما اعتُمد في آخرها (${said})`, JSON.stringify(said) === '["سيارة","حافلة","قطار","دراجة نارية","شاحنة","كرسي متحرك*"]'
      && (await st()).said.length === before + 1);
    await page.screenshot({ path: `${shots}/app-voice-reveal.png` });
    sc = await f.evaluate(() => window.__stageCheck());
    check(`فحص التداخل والشبكة بعد الكشف (${sc.ok ? '' : sc.problems.join('، ')})`, sc.ok);
    // التراجع عن الكشف يعيد السماع ويُبقي ما سُمع.
    await go(f, 'undo');
    check(`التراجع عن الكشف يعيد السماع والنص (${await words(f)})`, await page.evaluate(() => window.__voice.live) && (await words(f)).startsWith('سيارة.hit'));
    await heard(page, 'سفينة يعني');
    await wait(400);
    check(`وما بعده يُلحق بالنص (${await chips(f)})`, (await chips(f)).includes('سفينة') && (await words(f)).endsWith('سفينة.hit يعني'));
    // نص طويل وشارات كثيرة: الأحدث ظاهرة، والأقدم تُقصّ من اليمين بحافة باهتة، والنص يصعد سطرين.
    await heard(page, 'سفينة شاحنة ومترو وبعد ترام قارب يعني دراجة هوائية غواصة شنو كمان شي ثاني ما ادري والله خلاص طائرة');
    await wait(900);
    const fit = await f.evaluate(() => ({ over: document.getElementById('voxLit').classList.contains('over'), up: document.getElementById('voxWords').classList.contains('up'),
      last: (() => { const r = document.getElementById('voxLit'), c = r.lastElementChild.getBoundingClientRect(), b = r.getBoundingClientRect(); return c.left >= b.left - 1 && r.firstElementChild.hidden; })() }));
    // ملاحظة المدقّق 92: نقرة قرب أسفل كلمة في السطر الأول تحدد تلك الكلمة لا ما تحتها في الثاني، وقرب أعلى كلمة في الثاني كذلك.
    const lines = await f.evaluate(() => { const sp = [...document.querySelectorAll('#voxWords span[data-cmd]')], box = document.querySelector('.vox-heard .words').getBoundingClientRect();
      const vis = sp.filter(e => { const r = e.getBoundingClientRect(); return r.top >= box.top - 1 && r.bottom <= box.bottom + 1; });
      const tops = [...new Set(vis.map(e => Math.round(e.getBoundingClientRect().top)))].sort((a, b) => a - b);
      const pick = t => { const e = vis.find(x => Math.round(x.getBoundingClientRect().top) === t); const r = e.getBoundingClientRect(); return { cmd: e.dataset.cmd, x: r.left + r.width / 2, top: r.top, bottom: r.bottom }; };
      return tops.length >= 2 ? [pick(tops[0]), pick(tops[1])] : null; });
    const hitAt = (x, y) => f.evaluate(([x, y]) => document.elementFromPoint(x, y)?.closest('[data-cmd]')?.dataset.cmd ?? null, [x, y]);
    check(`كلمة السطر الأول تُنقر قرب أسفلها، وكلمة الثاني قرب أعلاها (${JSON.stringify(lines?.map(l => l.cmd))})`, lines
      && await hitAt(lines[0].x, lines[0].bottom - 2) === lines[0].cmd && await hitAt(lines[1].x, lines[1].top + 2) === lines[1].cmd);
    // والفحص الذي طلبه المدقّق: نقاط عند 15% و50% و85% من ارتفاع كل كلمة ظاهرة تُصيب الكلمة نفسها.
    const miss = await f.evaluate(() => { const box = document.querySelector('.vox-heard .words').getBoundingClientRect(), out = [];
      // والكلمات كلها، المُعلَّمة أيضاً: نقرة على كلمة أضاءت لا تحدد كلمة تحتها («شاحنة» كانت تُصيب «خلاص»).
      for (const e of document.querySelectorAll('#voxWords span')) { const r = e.getBoundingClientRect(); if (r.top < box.top - 1 || r.bottom > box.bottom + 1) continue;
        for (const k of [.15, .5, .85]) { const got = document.elementFromPoint(r.left + r.width / 2, r.top + r.height * k)?.closest('#voxWords span'); if (got !== e) out.push(`${e.textContent}@${k}→${got?.textContent}`); } }
      return out; });
    check(`كل كلمة ظاهرة تُصاب عند 15% و50% و85% من ارتفاعها (${miss.join('، ')})`, miss.length === 0);
    check(`شارات كثيرة: الأحدث ظاهرة والأقدم مقصوصة، والنص يصعد (${JSON.stringify(fit)}، ${(await chips(f)).length})`, fit.over && fit.up && fit.last);
    await page.screenshot({ path: `${shots}/app-voice-full.png` });
    sc = await f.evaluate(() => window.__stageCheck());
    check(`فحص التداخل والشبكة والصفوف ممتلئة (${sc.ok ? '' : sc.problems.join('، ')})`, sc.ok);
    // إيقاف المساعد من «⋯»: يقف السماع وتغيب الصفوف.
    const n = await tally(f);
    await cmd(f, 'vox:toggle'); await wait(500);
    check('إيقافه من «⋯» يوقف السماع ويُغيب الصفوف، والعدّ باقٍ', !(await page.evaluate(() => window.__voice.live)) && !(await f.$eval('#auc', e => e.classList.contains('vox'))) && await tally(f) === n);
    await context.close();
  } catch (e) { errors.push(String(e).split('\n')[0]); }
  // ش8-أ/98 و99 (تجربة المالك على هاتفه): موضوعان متتاليان. نهاية جلسة الأول (final برقمها) تصل بعد بدء الثاني،
  // فلا يظهر نصها في الثاني ولا يقف به السماع، والثاني يسمع ويضيء.
  try {
    const { context, page, f, st } = await open(true, { installed: true });
    await page.evaluate(() => { window.__voice.mic = 'granted'; });
    await go(f, 'raise:1');
    await cmd(f, 'vox:toggle'); await wait(500);
    await closeMore(f);
    await go(f, 'act:start');
    await heard(page, 'سيارة باص يعني');
    await wait(400);
    check(`الموضوع الأول: أضاء ما قيل (${await chips(f)})`, JSON.stringify(await chips(f)) === '["سيارة","حافلة"]');
    // ش8-أ/97: «اعتمد» على كلمة تشبه ما أضاء (تكرار) يُحسب إجابة بنصها، ولا يضيع بلا أثر.
    await heard(page, 'سيارة باص يعني سياره ثم');
    await wait(400);
    await f.click('#voxWords [data-cmd="vox:w:3"]'); await wait(300);
    await go(f, 'vox:ok');
    check(`«اعتمد» على ما يشبه ما أضاء يُحسب بشارة ويزيد العدّ (${await chips(f)}، ${await tally(f)})`, JSON.stringify(await chips(f)) === '["سيارة","حافلة","سياره"]' && await tally(f) === 3);
    const first = await page.evaluate(() => window.__voice.id);
    await go(f, 'act:reveal'); await go(f, 'act:ok'); await go(f, 'act:next');
    await hideQr(f);
    await go(f, 'raise:2'); await go(f, 'act:start');
    const second = await page.evaluate(() => window.__voice.id);
    check(`الموضوع الثاني: جلسة سماع جديدة برقم آخر (${first} ← ${second})`, second && second !== first && await page.evaluate(() => window.__voice.live));
    await page.evaluate(id => window.__voice.emit('final', { id, text: 'سيارة باص يعني قطار' }), first);
    await wait(500);
    check(`ونهاية جلسة الأول بعد بدء الثاني لا تُظهر نصها فيه (${await words(f)})`, (await words(f)) === '' && (await chips(f)).length === 0 && (await st()).said.length === 0);
    check('ولا توقف سماعه: الميكروفون ما زال يسمع', await f.$eval('#voxMic', e => e.classList.contains('live')));
    const items = (await st()).topics[(await st()).index].items;
    await heard(page, `${items[0].name} و ${items[1].name} يعني`);
    await wait(500);
    check(`والثاني يسمع ويضيء (${await chips(f)})`, (await chips(f)).length >= 1 && (await st()).said.length >= 1);
    // والثالث كذلك، ونهاية جلسة الثاني تصل بعد بدئه.
    await go(f, 'act:reveal'); await go(f, 'act:ok'); await go(f, 'act:next');
    await hideQr(f);
    await go(f, 'raise:1'); await go(f, 'act:start');
    const third = await page.evaluate(() => window.__voice.id);
    await page.evaluate(id => window.__voice.emit('final', { id, text: 'كلام الموضوع الثاني' }), second);
    await wait(500);
    const items3 = (await st()).topics[(await st()).index].items;
    check(`الموضوع الثالث: جلسة ثالثة، ونهاية الثاني لا تظهر فيه ولا توقف سماعه (${third}، ${await words(f)})`, third && third !== second && (await words(f)) === ''
      && await f.$eval('#voxMic', e => e.classList.contains('live')) && (await st()).index === 2);
    await heard(page, `${items3[0].name} يعني`);
    await wait(500);
    check(`والثالث يسمع ويضيء (${await chips(f)})`, JSON.stringify(await chips(f)) === JSON.stringify([items3[0].name]));
    check(`وبدأ السماع مرة لكل موضوع، لا مرتين (${await page.evaluate(() => window.__voice.ids.join())})`, (await page.evaluate(() => window.__voice.ids.length)) === 3);
    await context.close();
  } catch (e) { errors.push(String(e).split('\n')[0]); }
  // الموقع: لا أيقونة ولا صفوف.
  {
    const { context, f } = await open(false);
    await go(f, 'raise:1');
    await f.click('[data-cmd="more"]'); await wait(300);
    check('الموقع: لا أيقونة للمساعد في «⋯»', !(await f.$('[data-cmd="vox:toggle"]')));
    await f.click('[data-cmd="more"]'); await wait(200);
    await go(f, 'act:start');
    check('ولا صفوف في الوفاء', !(await f.$eval('#auc', e => e.classList.contains('vox'))) && await f.$eval('#voxLit', e => getComputedStyle(e).display === 'none'));
    await context.close();
  }
  await browser.close();
  process.exit(finish(errors) && !errors.length ? 0 : 1);
})();
