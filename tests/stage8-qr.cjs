// اختبار آلي لباركود الإجابات (الوثيقة 7.1، design/s8.md 2):
// 1. النص لكل قوائم البنك (30 مزاداً و20 ترتيباً): الصيغة، والطول بالبايت، والوحدة. ويطبع أطول نص (حدّ الطول، البند 13 في docs/audits/ش8.md).
// 2. بنافذة واحدة: يظهر تلقائياً في بداية سؤال المزاد وقائمة الترتيب لا في غيرهما، و«أخفِ الباركود» يخفيه، و«الباركود» يعيده،
//    ويبقى كما هو بعد إعادة التحميل. والرمز المرسوم يطابق نصه وحدة وحدة، ويُفكّ بقارئ مستقل (jsQR) إن وُجد.
// 3. بنافذتين: يظهر على التلفاز، ويُخفى من نافذة المقدّم.
// وفحص التداخل والشبكة في كل حالة، ولا طلب شبكة لتوليده.
// الاستعمال: node tests/stage8-qr.cjs [الرابط] [مجلد الصور]
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const { usePin, unlock, reporter, stageFrame, cmd, sharedToFace, beginTwo } = require('./helpers.cjs');

let jsQR = null;
try { jsQR = require('jsqr'); } catch {}

(async () => {
  const base = process.argv[2] || 'http://localhost:8000/';
  const shots = process.argv[3] || require('os').tmpdir();
  const root = path.join(__dirname, '..');
  const { check, finish } = reporter();
  const wait = ms => new Promise(r => setTimeout(r, ms));

  // ===== 1. النص لكل قوائم البنك =====
  const Q = await import(path.join(root, 'js/qr.js'));
  const read = f => JSON.parse(fs.readFileSync(path.join(root, 'content/packs/general', f), 'utf8'));
  const auctions = read('auction.json').topics, rankings = read('ranking.json').lists;
  const aText = t => Q.answersText('auction', { topic: t.topic, items: t.items.map(x => ({ name: x.name, alts: x.alts ?? [] })) });
  const rText = l => Q.answersText('ranking', { title: l.title, items: l.items.map((x, i) => ({ rank: i + 1, name: x.name, alts: x.alts ?? [], trap: i >= 10 })) });
  const sample = aText(auctions[0]).split('\n');
  check(`المزاد: السطر الأول «الموضوع · العدد»، ثم عنصر في كل سطر بصيغه (${sample[0]})`, sample[0] === `${auctions[0].topic} · ${auctions[0].items.length}` && sample.length === auctions[0].items.length + 1);
  const rs = rText(rankings[0]).split('\n');
  check(`الترتيب: العنوان، ثم «1 · الاسم» للعشرة و«11 فخ · الاسم» للثلاثة (${rs[1]} … ${rs[11]})`, rs[0] === rankings[0].title && rs.length === 14 && rs[1].startsWith('1 · ' + rankings[0].items[0].name) && rs[11] === `11 فخ · ${rankings[0].items[10].name}`);
  const withAlt = auctions.flatMap(t => t.items).find(x => x.alts?.length);
  check(`الصيغ البديلة بين قوسين بفاصلة عربية («${withAlt.name} (${withAlt.alts.join('، ')})»)`, auctions.some(t => aText(t).includes(`${withAlt.name} (${withAlt.alts.join('، ')})`)));
  const all = [...auctions.map(t => ({ id: t.id, text: aText(t) })), ...rankings.map(l => ({ id: l.id, text: rText(l) }))].map(x => ({ ...x, ...Q.qrMatrix(x.text) }));
  const longest = all.reduce((a, b) => (b.bytes > a.bytes ? b : a));
  const longestRank = all.filter(x => rankings.some(l => l.id === x.id)).reduce((a, b) => (b.bytes > a.bytes ? b : a));
  console.log(`حدّ الطول: أطول نص في البنك ${longest.id} ${longest.bytes} بايت، v${(longest.n - 17) / 4}، ${longest.n} وحدة، الوحدة ${longest.unit} · وأطول ترتيب ${longestRank.id} ${longestRank.bytes} بايت، الوحدة ${longestRank.unit}`);
  check(`كل قوائم البنك (${all.length}) تُرمَّز، والوحدة لا تقل عن 4، والرمز داخل 520 بحاشية 3 وحدات`, all.length === auctions.length + rankings.length && all.every(x => x.unit >= 4 && (x.n + 6) * x.unit <= 520));

  // ===== 2. بنافذة واحدة =====
  const browser = await chromium.launch({ executablePath: '/opt/pw-browsers/chromium' });
  const errors = [], requests = [];
  let layoutOk = true;
  const fails = [];
  const newStage = async () => {
    const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, serviceWorkers: 'block' });
    await usePin(context);
    context.on('page', p => {
      p.on('pageerror', e => errors.push(e.message));
      p.on('console', m => m.type() === 'error' && errors.push(m.text()));
      p.on('request', r => !r.url().startsWith(base) && !r.url().startsWith('data:') && requests.push(r.url()));
    });
    const stage = await context.newPage();
    await stage.goto(base);
    await stage.evaluate(() => localStorage.clear());
    await stage.reload();
    await unlock(stage);
    return { context, stage, frame: await stageFrame(stage) };
  };
  const saved = stage => stage.evaluate(() => JSON.parse(localStorage.getItem('big-challenge.match')));
  const look = async (frame, label) => {
    await wait(400);
    const r = await frame.evaluate(() => window.__stageCheck());
    if (!r.ok) { layoutOk = false; fails.push(`${label}: ${r.problems.join('، ')}`); }
  };
  // الرمز المرسوم: يطابق نصه وحدة وحدة (من القماش نفسه)، ويُفكّ بـ jsQR إن وُجد.
  const qrOf = async frame => frame.evaluate(() => {
    const c = document.querySelector('#qrbox canvas'), box = document.getElementById('qrbox');
    const x = c.getContext('2d').getImageData(0, 0, c.width, c.height);
    return { shown: document.getElementById('canvas').classList.contains('qr') && !!box.getClientRects().length, w: c.width, unit: Number(box.dataset.unit), n: Number(box.dataset.modules),
      data: [...x.data], bytes: Number(box.dataset.bytes) };
  });
  const matches = (q, text) => {
    const m = Q.qrMatrix(text);
    if (m.n !== q.n || m.unit !== q.unit || q.w !== m.n * m.unit) return false;
    for (let r = 0; r < m.n; r++) for (let c = 0; c < m.n; c++) {
      const i = ((r * m.unit + (m.unit >> 1)) * q.w + c * m.unit + (m.unit >> 1)) * 4;
      if ((q.data[i] < 128) !== m.dark(r, c)) return false;
    }
    return true;
  };
  const decode = q => {
    if (!jsQR) return null;
    const pad = q.unit * 4, w = q.w + pad * 2, d = new Uint8ClampedArray(w * w * 4).fill(255);
    for (let y = 0; y < q.w; y++) for (let x = 0; x < q.w; x++) for (let k = 0; k < 4; k++) d[((y + pad) * w + x + pad) * 4 + k] = q.data[(y * q.w + x) * 4 + k];
    const r = jsQR(d, w, w);
    return r ? new TextDecoder().decode(new Uint8Array(r.binaryData)) : '';
  };
  const near = frame => frame.$$eval('#near .cbtn', x => x.map(y => y.textContent.trim()).join(' | '));

  {
    const { context, stage, frame } = await newStage();
    await sharedToFace(frame, { names: ['الصقور', 'النجوم'], picks: ['auction', 'ranking'] });
    await wait(2700);
    await cmd(frame, 'begin');
    await frame.waitForSelector('.scr.show[data-s="intro"]', { timeout: 6000 });
    await wait(500);
    check('الافتتاح: لا باركود', !(await qrOf(frame)).shown);
    await cmd(frame, 'act:show');
    await frame.waitForSelector('.scr.show[data-s="auc"]', { timeout: 5000 });
    await wait(600);
    let m = await saved(stage), t = m.round.state.topics[0];
    let q = await qrOf(frame);
    const text = aText(t);
    check(`المزاد: يظهر تلقائياً مع الموضوع، ويطابق نصه (${q.bytes} بايت، الوحدة ${q.unit})`, q.shown && q.bytes === Buffer.byteLength(text) && matches(q, text));
    if (jsQR) check('المزاد: يُفكّ بقارئ مستقل (jsQR) مطابقاً حرفاً حرفاً', decode(q) === text);
    check('المزاد والباركود ظاهر: «أخفِ الباركود» في البطاقة، ولا أزرار مزايدة، ولا مربع إعلان', (await near(frame)) === '' && await frame.isVisible('#aucCtl [data-cmd="qr:hide"]')
      && !(await frame.isVisible('#bids')) && !(await frame.isVisible('#box')));
    await look(frame, 'المزاد بالباركود');
    await stage.screenshot({ path: path.join(shots, 's8-qr-auction.png') });
    await stage.reload(); await unlock(stage);
    let f2 = await stageFrame(stage);
    await wait(800);
    check('إعادة التحميل: يبقى ظاهراً', (await qrOf(f2)).shown);
    await cmd(f2, 'qr:hide');
    await wait(600);
    check('«أخفِ الباركود»: يختفي، وتعود المزايدة، و«الباركود» في صف النوافذ', !(await qrOf(f2)).shown && (await near(f2)).includes('ابدأ') && await f2.isVisible('#cornerB [data-cmd="qr:show"]'));
    await look(f2, 'المزاد بعد الإخفاء');
    await stage.reload(); await unlock(stage);
    f2 = await stageFrame(stage);
    await wait(800);
    check('إعادة التحميل بعد الإخفاء: لا يعود بنفسه', !(await qrOf(f2)).shown);
    await cmd(f2, 'qr:show');
    await wait(600);
    check('«الباركود»: يعود بطلب', (await qrOf(f2)).shown);
    await cmd(f2, 'qr:hide');
    await wait(500);
    // المزايدة ثم الوفاء: لا باركود.
    await cmd(f2, 'raise:1'); await wait(300); await cmd(f2, 'act:start'); await wait(600);
    check('الوفاء: لا باركود', !(await qrOf(f2)).shown && (await saved(stage)).round.state.phase === 'fulfil');
    await context.close();
  }

  {
    const { context, stage, frame } = await newStage();
    await sharedToFace(frame, { names: ['فريق النخبة الذهبي', 'نجوم المستقبل معاً'], picks: ['ranking', 'auction'] });
    await wait(2700);
    await cmd(frame, 'begin');
    await frame.waitForSelector('.scr.show[data-s="intro"]', { timeout: 6000 });
    await cmd(frame, 'act:show');
    await frame.waitForSelector('.scr.show[data-s="rnk"]', { timeout: 5000 });
    await wait(600);
    const l = (await saved(stage)).round.state.lists[0], text = rText(l);
    const q = await qrOf(frame);
    check(`الترتيب: يظهر تلقائياً مع القائمة، ويطابق نصه (${q.bytes} بايت، الوحدة ${q.unit})`, q.shown && matches(q, text) && !(await frame.isVisible('#board')));
    if (jsQR) check('الترتيب: يُفكّ بقارئ مستقل مطابقاً', decode(q) === text);
    check('والباركود ظاهر: «أخفِ الباركود» تحت العنوان، ولا «ابدأ»', (await near(frame)) === '' && await frame.isVisible('#rnkCtl [data-cmd="qr:hide"]'));
    await look(frame, 'الترتيب بالباركود بأطول اسمين');
    await stage.screenshot({ path: path.join(shots, 's8-qr-ranking-long.png') });
    await cmd(frame, 'qr:hide');
    await wait(600);
    check('بعد الإخفاء: اللوحة و«ابدأ»', !(await qrOf(frame)).shown && await frame.isVisible('#board') && (await near(frame)).includes('ابدأ'));
    await look(frame, 'الترتيب بعد الإخفاء');
    await context.close();
  }

  // ===== 3. بنافذتين =====
  {
    const { context, stage, frame } = await newStage();
    await sharedToFace(frame, { names: ['الصقور', 'النجوم'], picks: ['auction', 'ranking'] });
    await wait(2700);
    const host = await beginTwo(context, frame);
    await host.click('#showQ');
    await frame.waitForSelector('.scr.show[data-s="auc"]', { timeout: 5000 });
    await wait(600);
    check('بنافذتين: يظهر على التلفاز، و«أخفِ الباركود» في نافذة المقدّم', (await qrOf(frame)).shown && (await host.textContent('#aQr')) === 'أخفِ الباركود' && await host.isVisible('#aQr'));
    await look(frame, 'بنافذتين بالباركود');
    await host.click('#aQr');
    await wait(600);
    check('بنافذتين: يُخفى من نافذة المقدّم، والزر «الباركود»', !(await qrOf(frame)).shown && (await host.textContent('#aQr')) === 'الباركود');
    await context.close();
  }

  // قائمة أكبر مما يسعه الرمز (مثل المفتوح الكبير): لا يُرسم، وتبقى البطاقة واللعبة تعمل (design/auction.md 7.10 قيد القرار).
  {
    const real = read('auction.json');
    const huge = Array.from({ length: 220 }, (_, i) => ({ name: `عنصر طويل الاسم رقم ${i + 1}`, alts: [`صيغة ${i + 1}`] }));
    let threw = false;
    try { Q.qrMatrix(aText({ topic: 'قائمة كبيرة', items: huge })); } catch { threw = true; }
    check(`نص قائمة 220 عنصراً يزيد عمّا يسعه الرمز (${Buffer.byteLength(aText({ topic: 'قائمة كبيرة', items: huge }))} بايت)`, threw);
    const bank = { mode: 'auction', topics: real.topics.map(t => ({ ...t, items: huge })) };
    const { context, stage, frame } = await newStage();
    await context.route('**/content/packs/general/auction.json', route => route.fulfill({ json: bank }));
    await stage.reload(); await unlock(stage);
    const f = await stageFrame(stage);
    await sharedToFace(f, { names: ['الصقور', 'النجوم'], picks: ['auction', 'ranking'] });
    await wait(2700);
    await cmd(f, 'begin');
    await f.waitForSelector('.scr.show[data-s="intro"]', { timeout: 6000 });
    await wait(500);
    await cmd(f, 'act:show');
    await f.waitForSelector('.scr.show[data-s="auc"]', { timeout: 5000 });
    await wait(600);
    check('القائمة الكبيرة: لا باركود، والموضوع ظاهر', !(await qrOf(f)).shown && await f.isVisible('#topic'));
    await cmd(f, 'raise:1'); await wait(300); await cmd(f, 'act:start'); await wait(600);
    check('القائمة الكبيرة: المزايدة والوفاء يعملان', (await saved(stage)).round.state.phase === 'fulfil');
    await look(f, 'القائمة الكبيرة دون باركود');
    await context.close();
  }

  await browser.close();
  check('فحص التداخل والشبكة في كل حالة', layoutOk);
  check('لا طلب خارج اللعبة لتوليد الباركود', requests.length === 0);
  check('لا أخطاء في الصفحات', errors.length === 0);
  if (fails.length) console.log(fails.join('\n'));
  if (requests.length) console.log(requests.join('\n'));
  if (errors.length) console.log(errors.join('\n'));
  process.exit(finish() ? 0 : 1);
})();
